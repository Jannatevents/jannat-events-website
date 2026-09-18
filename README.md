# Jannat Events

Jannat Events is a South Asian nightlife and events website with a public
experience and a Clerk-protected admin panel for managing events, albums,
homepage content, media, site settings, and contact inquiries.

## Deployment architecture

This repository is a pnpm monorepo with two deployable pieces:

```text
Cloudflare Pages or Worker   Node-compatible API host
artifacts/jannat-events      artifacts/api-server
public website + /admin      Express + PostgreSQL + uploads
```

The public website and admin panel are one Vite SPA. The `/admin` routes do not
need a separate Cloudflare Pages project.

The current API is **not** a Cloudflare Worker. It uses Express, Node streams,
`pg`, and the Replit App Storage sidecar. Do not deploy
`artifacts/api-server` as a Worker without first replacing the storage adapter
with a Workers-compatible database and R2 implementation.

The repository now includes `wrangler.toml`. Its `npx wrangler deploy`
configuration publishes only `artifacts/jannat-events/dist/public` as static
Worker assets and uses SPA fallback for admin and event routes. It does not
attempt to run the Express API inside the Worker.

The lowest-risk path with the current code is:

1. Deploy the frontend to Cloudflare Pages.
2. Keep the API on a Node-compatible host. Replit deployment is the simplest
   option while the API still uses Replit App Storage.
3. Point `VITE_API_BASE_URL` at the API origin.
4. Add the Cloudflare website origins to the API's `CORS_ORIGINS`.

## Local development

Requirements:

- Node.js 24
- pnpm 10
- PostgreSQL for the API

Install and verify the repository:

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm --filter @workspace/jannat-events run build
pnpm --filter @workspace/api-server run build
```

The existing Replit workflows run the web and API services with their
development environment. For standalone local work, copy
`artifacts/api-server/.env.example` to the API host's environment and provide
the database, Clerk, and object-storage values. Copy
`artifacts/jannat-events/.env.example` when building the frontend against an
API on another origin.

## Cloudflare Pages setup

Create a Pages project from this repository with these settings:

| Setting | Value |
| --- | --- |
| Root directory | `/` |
| Framework preset | Vite |
| Build command | `pnpm --filter @workspace/jannat-events run build` |
| Build output directory | `artifacts/jannat-events/dist/public` |
| Node version | `24` |
| pnpm version | `10.26.1` |

Set these Pages environment variables for both Preview and Production as
appropriate:

```text
NODE_VERSION=24
PNPM_VERSION=10.26.1
VITE_API_BASE_URL=https://api.example.com
VITE_CLERK_PUBLISHABLE_KEY=pk_live_...
VITE_CLERK_PROXY_URL=https://api.example.com/api/__clerk
```

`VITE_API_BASE_URL` must be the API origin only. Use
`https://api.example.com`, not `https://api.example.com/` and not
`https://api.example.com/api`.

After the first deployment, attach `jannat.events` and
`www.jannat.events` as custom domains in Pages. Pages' SPA behavior and the
Wrangler `not_found_handling = "single-page-application"` setting keep direct
visits and refreshes to routes such as `/admin/events` and
`/events/example-slug` inside the SPA without a `_redirects` rule.

## Cloudflare Worker static-assets setup

If the connected Cloudflare project is configured to run the commands from the
attached deployment setup, use:

```bash
pnpm install --frozen-lockfile
pnpm run build
npx wrangler deploy
```

`wrangler.toml` makes this a static frontend deployment. Set the same
`VITE_API_BASE_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, and
`VITE_CLERK_PROXY_URL` build variables before `pnpm run build`. The API still
needs to run separately on a Node-compatible host.

## API host setup

The API needs a Node-compatible service with a long-running process and access
to PostgreSQL. Use the API package's commands:

```bash
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run start
```

Set `PORT` to the port supplied by the host. Required runtime variables are
listed in `artifacts/api-server/.env.example`.

For the current storage implementation, the API must run where the Replit App
Storage sidecar and its object-storage environment are available. If the API
is moved to Render, Railway, Fly.io, or another external host, uploads and
stored media will not work until `src/lib/objectStorage.ts` is migrated to an
external storage provider. The database and storage migration should be
treated as a separate project; do not silently assume Cloudflare Workers can
run this Express server unchanged.

### API health check

Once the API host is running, verify:

```bash
curl -i https://api.example.com/api/healthz
```

The response should be successful before connecting the Pages frontend.

### Railway preparation checklist

This checklist prepares the existing API for Railway without changing the
database, Cloudflare, DNS, Clerk tenant, frontend, or Replit App Storage.

1. **Project directory:** use the repository root (`/`), because the API
   imports the workspace packages `@workspace/db` and `@workspace/api-zod`.
2. **Install command:**

   ```bash
   pnpm install --frozen-lockfile
   ```

3. **Build command:**

   ```bash
   pnpm --filter @workspace/api-server run build
   ```

4. **Start command:**

   ```bash
   pnpm --filter @workspace/api-server run start
   ```

5. **Node version:** Node.js 24. Railway must provide the `PORT` value.
6. **Required environment variable names:**

   ```text
   NODE_ENV
   PORT
   DISABLE_STARTUP_WRITES
   DATABASE_URL
   CLERK_PUBLISHABLE_KEY
   CLERK_SECRET_KEY
   CORS_ORIGINS
   PUBLIC_OBJECT_SEARCH_PATHS
   PRIVATE_OBJECT_DIR
   LOG_LEVEL
   ```

7. **Copy manually as secrets:** `DATABASE_URL`, `CLERK_PUBLISHABLE_KEY`,
   `CLERK_SECRET_KEY`, `PUBLIC_OBJECT_SEARCH_PATHS`, and
   `PRIVATE_OBJECT_DIR`. Keep the database URL's PostgreSQL SSL parameters
   unchanged; do not print or commit any of these values.
8. **Temporary startup setting:** use
   `DISABLE_STARTUP_WRITES=true` while validating an external host. This
   prevents startup seeding, the initial event-status refresh, and the
   60-second refresh interval. Set it to `false` only after the host and
   database behavior have been deliberately reviewed.
9. **Health test before connecting the frontend:**

   ```bash
   curl -i https://<railway-api-domain>/api/healthz
   ```

   Expect a successful JSON response. This endpoint does not query or modify
   PostgreSQL.
10. **Safe PostgreSQL test:** first use a non-production database or a
    read-only database credential. With `DISABLE_STARTUP_WRITES=true`, test a
    read-only public endpoint such as:

    ```bash
    curl -i https://<railway-api-domain>/api/public/site
    ```

    The API still needs a successful PostgreSQL connection for this request,
    but no schema push, seed, or scheduled status write is run at startup.
    Do not use admin or contact-write routes for connectivity testing.
11. **Clerk admin test:** keep the same Clerk tenant and keys, sign in from a
    controlled frontend or API test page, then verify one protected read-only
    route such as `GET /api/admin/settings`. Confirm that the request carries
    the Clerk bearer token and that the configured admin user receives a
    successful response. Do not test create, update, delete, upload, or
    contact-submission routes.
12. **Unavailable storage features until an adapter migration:** upload URL
    creation, public object serving, private object serving, byte-range media
    serving, and any existing media whose URLs depend on Replit App Storage.
    These routes depend on the Replit sidecar at `127.0.0.1:1106`. Public
    event APIs, settings APIs, Clerk authentication, non-storage admin reads,
    and `/api/healthz` do not require the sidecar to start.

## Production CORS and Clerk

Set `CORS_ORIGINS` on the API to the exact browser origins, comma-separated:

```text
CORS_ORIGINS=https://jannat.events,https://www.jannat.events
```

Include a Pages preview origin temporarily if you need to test authentication
from a preview deployment. Remove temporary origins before launch.

The frontend sends Clerk bearer tokens to the API for admin requests. The API
also serves the Clerk Frontend API proxy at `/api/__clerk` when
`CLERK_SECRET_KEY` is configured. Keep `CLERK_SECRET_KEY`, `DATABASE_URL`, and
object-storage credentials only in the API host's secret/environment settings.
Never put them in GitHub, Cloudflare Pages variables, the repository, or an
`.env.example` file.

## GitHub handoff

The repository includes `.github/workflows/ci.yml`. On pushes to `main` or
`master` and on pull requests it:

1. installs the locked pnpm dependency tree,
2. runs the full workspace typecheck,
3. builds the Cloudflare Pages frontend without Replit-only build variables,
4. builds the Node API bundle.

Run the same checks locally before handing the repository over:

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm --filter @workspace/jannat-events run build
pnpm --filter @workspace/api-server run build
```

## Repository map

- `artifacts/jannat-events` — React/Vite public website and admin panel
- `artifacts/api-server` — Express API and storage routes
- `lib/api-client-react` — generated API client plus configurable API base URL
- `lib/api-zod` — generated request/response schemas
- `lib/db` — PostgreSQL connection and Drizzle schema
- `attached_assets` — local source assets used by the project
