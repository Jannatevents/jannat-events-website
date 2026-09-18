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
`www.jannat.events` as custom domains in Pages. The committed
`public/_redirects` file keeps direct visits and refreshes to routes such as
`/admin/events` and `/events/example-slug` inside the SPA.

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
