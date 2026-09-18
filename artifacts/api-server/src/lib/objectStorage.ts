import { createHmac, createHash, randomUUID } from 'node:crypto';
import { PassThrough, Readable } from 'node:stream';

const PRIVATE_OBJECT_PREFIX = '.private';
const PUBLIC_OBJECT_PREFIX = 'public';
const R2_REGION = 'auto';
const R2_SERVICE = 's3';
const UNSIGNED_PAYLOAD = 'UNSIGNED-PAYLOAD';

export class ObjectNotFoundError extends Error {
  constructor() {
    super('Object not found');
    this.name = 'ObjectNotFoundError';
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export interface StoredObjectMetadata {
  size: number;
  contentType: string;
  cacheControl?: string;
  etag?: string;
}

export interface StoredObject {
  readonly key: string;
  exists(): Promise<[boolean]>;
  getMetadata(): Promise<[StoredObjectMetadata]>;
  createReadStream(options?: { start?: number; end?: number }): Readable;
}

interface R2Config {
  accountId: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
  host: string;
}

interface SignedRequest {
  url: string;
  headers: Record<string, string>;
}

export class ObjectStorageService {
  private getConfig(): R2Config {
    const required = [
      'R2_ACCOUNT_ID',
      'R2_BUCKET_NAME',
      'R2_ACCESS_KEY_ID',
      'R2_SECRET_ACCESS_KEY',
    ] as const;
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
      throw new Error(`Missing required R2 environment variables: ${missing.join(', ')}`);
    }

    const accountId = process.env.R2_ACCOUNT_ID as string;
    const bucketName = process.env.R2_BUCKET_NAME as string;
    if (!/^[a-f0-9]{32}$/i.test(accountId)) {
      throw new Error('R2_ACCOUNT_ID has an invalid format');
    }
    if (!bucketName) {
      throw new Error('R2_BUCKET_NAME must not be empty');
    }

    return {
      accountId,
      bucketName,
      accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
      host: `${accountId}.r2.cloudflarestorage.com`,
    };
  }

  async searchPublicObject(filePath: string): Promise<StoredObject | null> {
    const safePath = normalizeRelativePath(filePath);
    if (!safePath) return null;

    const object = new R2Object(this, `${PUBLIC_OBJECT_PREFIX}/${safePath}`);
    const [exists] = await object.exists();
    return exists ? object : null;
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const objectKey = `${PRIVATE_OBJECT_PREFIX}/uploads/${randomUUID()}`;
    return this.createPresignedURL('PUT', objectKey, 900);
  }

  async getObjectEntityFile(objectPath: string): Promise<StoredObject> {
    if (!objectPath.startsWith('/objects/')) {
      throw new ObjectNotFoundError();
    }

    const relativePath = normalizeRelativePath(objectPath.slice('/objects/'.length));
    if (!relativePath) {
      throw new ObjectNotFoundError();
    }

    const object = new R2Object(this, `${PRIVATE_OBJECT_PREFIX}/${relativePath}`);
    const [exists] = await object.exists();
    if (!exists) {
      throw new ObjectNotFoundError();
    }
    return object;
  }

  normalizeObjectEntityPath(rawPath: string): string {
    try {
      const url = new URL(rawPath);
      const config = this.getConfig();
      const expectedPrefix = `/${encodeURIComponent(config.bucketName)}/`;
      if (url.host !== config.host || !url.pathname.startsWith(expectedPrefix)) {
        return rawPath;
      }

      const key = decodeURIComponent(url.pathname.slice(expectedPrefix.length));
      const privatePrefix = `${PRIVATE_OBJECT_PREFIX}/`;
      if (!key.startsWith(privatePrefix)) {
        return rawPath;
      }
      return `/objects/${key.slice(privatePrefix.length)}`;
    } catch {
      return rawPath;
    }
  }

  async downloadObject(
    object: StoredObject,
    cacheVisibility: 'public' | 'private' = 'private',
  ): Promise<Response> {
    const response = await this.request('GET', object.key);
    if (response.status === 404) throw new ObjectNotFoundError();
    if (!response.ok || !response.body) {
      throw new Error(`R2 GET failed with HTTP ${response.status}`);
    }

    const metadata = await object.getMetadata();
    const headers = new Headers();
    headers.set('Content-Type', metadata[0].contentType);
    headers.set('Content-Length', String(metadata[0].size));
    headers.set(
      'Cache-Control',
      metadata[0].cacheControl ??
        `${cacheVisibility}, max-age=3600`,
    );
    return new Response(response.body, { headers });
  }

  async headObject(key: string): Promise<StoredObjectMetadata> {
    const response = await this.request('HEAD', key);
    if (response.status === 404) throw new ObjectNotFoundError();
    if (!response.ok) {
      throw new Error(`R2 HEAD failed with HTTP ${response.status}`);
    }

    const size = Number(response.headers.get('content-length') ?? '');
    if (!Number.isSafeInteger(size) || size < 0) {
      throw new Error('R2 object did not return a valid Content-Length');
    }

    return {
      size,
      contentType:
        response.headers.get('content-type') ?? 'application/octet-stream',
      cacheControl: response.headers.get('cache-control') ?? undefined,
      etag: response.headers.get('etag') ?? undefined,
    };
  }

  async pipeObject(
    key: string,
    output: PassThrough,
    range?: { start: number; end: number },
  ): Promise<void> {
    const response = await this.request(
      'GET',
      key,
      range
        ? { Range: `bytes=${range.start}-${range.end}` }
        : undefined,
    );
    if (response.status === 404) {
      output.destroy(new ObjectNotFoundError());
      return;
    }
    if (!response.ok || !response.body) {
      output.destroy(new Error(`R2 GET failed with HTTP ${response.status}`));
      return;
    }

    Readable.fromWeb(response.body).pipe(output);
  }

  private async request(
    method: 'GET' | 'HEAD',
    key: string,
    headers: Record<string, string> = {},
  ): Promise<Response> {
    const signed = this.signRequest(method, key);
    return fetch(signed.url, {
      method,
      headers: {
        ...signed.headers,
        ...headers,
      },
    });
  }

  private createPresignedURL(
    method: 'PUT',
    key: string,
    expiresInSeconds: number,
  ): string {
    const config = this.getConfig();
    const canonicalUri = this.objectURI(config, key);
    const now = new Date();
    const amzDate = formatAmzDate(now);
    const date = amzDate.slice(0, 8);
    const scope = `${date}/${R2_REGION}/${R2_SERVICE}/aws4_request`;
    const query: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${config.accessKeyId}/${scope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': String(expiresInSeconds),
      'X-Amz-SignedHeaders': 'host',
    };
    const canonicalQuery = canonicalizeQuery(query);
    const canonicalRequest = [
      method,
      canonicalUri,
      canonicalQuery,
      `host:${config.host}\n`,
      'host',
      UNSIGNED_PAYLOAD,
    ].join('\n');
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      sha256(canonicalRequest),
    ].join('\n');
    query['X-Amz-Signature'] = hmac(
      signingKey(config.secretAccessKey, date),
      stringToSign,
      'hex',
    );

    return `https://${config.host}${canonicalUri}?${canonicalizeQuery(query)}`;
  }

  private signRequest(method: 'GET' | 'HEAD', key: string): SignedRequest {
    const config = this.getConfig();
    const canonicalUri = this.objectURI(config, key);
    const amzDate = formatAmzDate(new Date());
    const date = amzDate.slice(0, 8);
    const scope = `${date}/${R2_REGION}/${R2_SERVICE}/aws4_request`;
    const canonicalHeaders =
      `host:${config.host}\n` +
      `x-amz-content-sha256:${UNSIGNED_PAYLOAD}\n` +
      `x-amz-date:${amzDate}\n`;
    const signedHeaders = 'host;x-amz-content-sha256;x-amz-date';
    const canonicalRequest = [
      method,
      canonicalUri,
      '',
      canonicalHeaders,
      signedHeaders,
      UNSIGNED_PAYLOAD,
    ].join('\n');
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      scope,
      sha256(canonicalRequest),
    ].join('\n');
    const signature = hmac(
      signingKey(config.secretAccessKey, date),
      stringToSign,
      'hex',
    );

    return {
      url: `https://${config.host}${canonicalUri}`,
      headers: {
        host: config.host,
        'x-amz-content-sha256': UNSIGNED_PAYLOAD,
        'x-amz-date': amzDate,
        authorization:
          `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, ` +
          `SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
    };
  }

  private objectURI(config: R2Config, key: string): string {
    return `/${encodePathSegment(config.bucketName)}/${encodePath(key)}`;
  }
}

class R2Object implements StoredObject {
  constructor(
    private readonly service: ObjectStorageService,
    public readonly key: string,
  ) {}

  async exists(): Promise<[boolean]> {
    try {
      await this.getMetadata();
      return [true];
    } catch (error) {
      if (error instanceof ObjectNotFoundError) return [false];
      throw error;
    }
  }

  async getMetadata(): Promise<[StoredObjectMetadata]> {
    return [await this.service.headObject(this.key)];
  }

  createReadStream(options: { start?: number; end?: number } = {}): Readable {
    const output = new PassThrough();
    const start = options.start;
    const end = options.end;
    if (
      start !== undefined &&
      end !== undefined &&
      Number.isSafeInteger(start) &&
      Number.isSafeInteger(end)
    ) {
      void this.service.pipeObject(this.key, output, { start, end });
    } else {
      void this.service.pipeObject(this.key, output);
    }
    return output;
  }
}

function normalizeRelativePath(path: string): string | null {
  const decoded = decodeURIComponent(path).replace(/^\/+/, '');
  if (!decoded || decoded.split('/').some((part) => !part || part === '.' || part === '..')) {
    return null;
  }
  return decoded;
}

function encodePathSegment(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodePath(value: string): string {
  return value.split('/').map(encodePathSegment).join('/');
}

function canonicalizeQuery(query: Record<string, string>): string {
  return Object.entries(query)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${encodePathSegment(key)}=${encodePathSegment(value)}`)
    .join('&');
}

function formatAmzDate(date: Date): string {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, '');
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function hmac(key: string | Buffer, value: string, encoding: 'hex'): string;
function hmac(key: string | Buffer, value: string): Buffer;
function hmac(
  key: string | Buffer,
  value: string,
  encoding?: 'hex',
): string | Buffer {
  return encoding
    ? createHmac('sha256', key).update(value).digest(encoding)
    : createHmac('sha256', key).update(value).digest();
}

function signingKey(secret: string, date: string): Buffer {
  const dateKey = hmac(`AWS4${secret}`, date) as Buffer;
  const regionKey = hmac(dateKey, R2_REGION) as Buffer;
  const serviceKey = hmac(regionKey, R2_SERVICE) as Buffer;
  return hmac(serviceKey, 'aws4_request') as Buffer;
}