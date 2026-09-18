import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from '@workspace/api-zod';
import { Router, type IRouter, type Request, type Response } from 'express';
import { getAuth } from '@clerk/express';

import {
  ObjectNotFoundError,
  ObjectStorageService,
  type StoredObject,
} from '../lib/objectStorage';
import { isJannatAdmin } from '../middlewares/requireJannatAdmin';

const router: IRouter = Router();
const objectStorageService = new ObjectStorageService();

/**
 * POST /storage/uploads/request-url
 *
 * Request a presigned URL for file upload.
 * The client sends JSON metadata (name, size, contentType) — NOT the file.
 * Then uploads the file directly to the returned presigned URL.
 * Requires auth middleware so public callers cannot mint write-capable URLs.
 */
router.post(
  '/storage/uploads/request-url',
  async (req: Request, res: Response) => {
    const userId = getAuth(req).userId;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });

      return;
    }
    if (!(await isJannatAdmin(req))) {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const parsed = RequestUploadUrlBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Missing or invalid required fields' });
      return;
    }

    try {
      const { name, size, contentType } = parsed.data;
      if (contentType.startsWith('image/')) {
        const allowedImageTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
        if (!allowedImageTypes.has(contentType)) {
          res.status(415).json({ error: 'Images must be JPG, PNG, or WebP' });
          return;
        }
        if (size > 10 * 1024 * 1024) {
          res.status(413).json({ error: 'Images must be 10 MB or smaller' });
          return;
        }
      }

      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      const objectPath =
        objectStorageService.normalizeObjectEntityPath(uploadURL);

      res.json(
        RequestUploadUrlResponse.parse({
          uploadURL,
          objectPath,
          metadata: { name, size, contentType },
        }),
      );
    } catch (error) {
      req.log.error({ err: error }, 'Error generating upload URL');
      res.status(500).json({ error: 'Failed to generate upload URL' });
    }
  },
);

/**
 * GET /storage/public-objects/*
 *
 * Serve public assets from PUBLIC_OBJECT_SEARCH_PATHS.
 * These are unconditionally public — no authentication or ACL checks.
 * IMPORTANT: Always provide this endpoint when object storage is set up.
 */
router.get(
  '/storage/public-objects/*filePath',
  (req, res) => {
    void servePublicObject(req, res);
  },
);
router.head('/storage/public-objects/*filePath', (req, res) => {
  void servePublicObject(req, res);
});

/**
 * GET /storage/objects/*
 *
 * Serve object entities from PRIVATE_OBJECT_DIR.
 * These are served from a separate path from /public-objects and can optionally
 * be protected with authentication or ACL checks based on the use case.
 */
router.get('/storage/objects/*path', (req, res) => {
  void servePrivateObject(req, res);
});
router.head('/storage/objects/*path', (req, res) => {
  void servePrivateObject(req, res);
});

async function servePublicObject(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const raw = req.params.filePath;
    const filePath = Array.isArray(raw) ? raw.join('/') : raw;
    const file = await objectStorageService.searchPublicObject(filePath);
    if (!file) {
      res.status(404).json({ error: 'File not found' });
      return;
    }
    await streamObject(req, res, file, 'public');
  } catch (error) {
    handleStorageError(req, res, error, 'Error serving public object');
  }
}

async function servePrivateObject(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const raw = req.params.path;
    const wildcardPath = Array.isArray(raw) ? raw.join('/') : raw;
    const objectFile = await objectStorageService.getObjectEntityFile(
      `/objects/${wildcardPath}`,
    );
    await streamObject(req, res, objectFile, 'private');
  } catch (error) {
    handleStorageError(req, res, error, 'Error serving object');
  }
}

async function streamObject(
  req: Request,
  res: Response,
  objectFile: StoredObject,
  cacheVisibility: 'public' | 'private',
): Promise<void> {
  const [metadata] = await objectFile.getMetadata();
  const size = metadata.size;
  const rangeHeader = req.headers.range;
  const range = rangeHeader ? parseRange(rangeHeader, size) : null;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', metadata.contentType);
  res.setHeader(
    'Cache-Control',
    metadata.cacheControl ?? `${cacheVisibility}, max-age=3600`,
  );

  if (range?.invalid) {
    res.status(416);
    res.setHeader('Content-Range', `bytes */${size}`);
    res.setHeader('Content-Length', '0');
    res.end();
    return;
  }

  if (range) {
    const length = range.end - range.start + 1;
    res.status(206);
    res.setHeader(
      'Content-Range',
      `bytes ${range.start}-${range.end}/${size}`,
    );
    res.setHeader('Content-Length', String(length));
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    pipeObjectStream(req, res, objectFile, range);
    return;
  }

  res.status(200);
  res.setHeader('Content-Length', String(size));
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  pipeObjectStream(req, res, objectFile);
}

function pipeObjectStream(
  req: Request,
  res: Response,
  objectFile: StoredObject,
  range?: { start: number; end: number },
): void {
  const stream = objectFile.createReadStream(range);
  stream.on('error', (error) => {
    req.log.error({ err: error }, 'Error streaming object');
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to stream object' });
    } else {
      res.destroy(error);
    }
  });
  stream.pipe(res);
}

function parseRange(
  header: string,
  size: number,
): { start: number; end: number; invalid?: false } | { invalid: true } {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return { invalid: true };

  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      return { invalid: true };
    }
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  ) {
    return { invalid: true };
  }
  return { start, end: Math.min(end, size - 1) };
}

function handleStorageError(
  req: Request,
  res: Response,
  error: unknown,
  message: string,
): void {
  if (error instanceof ObjectNotFoundError) {
    req.log.warn({ err: error }, 'Object not found');
    res.status(404).json({ error: 'Object not found' });
    return;
  }
  req.log.error({ err: error }, message);
  res.status(500).json({ error: 'Failed to serve object' });
}

export default router;
