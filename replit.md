# Jannat Events

Jannat Events is a South Asian nightlife and events website with a public SPA
and a Clerk-protected admin panel.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/jannat-events run build` — build the Cloudflare Pages frontend
- `pnpm --filter @workspace/api-server run build` — build the Node API bundle
- Required API env: `DATABASE_URL`, Clerk values, and object-storage paths

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: Vite for the frontend and esbuild for the API

## Where things live

- `artifacts/jannat-events` — public website and `/admin` SPA
- `artifacts/api-server` — Express API
- `lib/db` — PostgreSQL and Drizzle schema
- `lib/api-client-react` — generated API client and cross-origin configuration
- `README.md` — GitHub, Cloudflare Pages, API, CORS, and Clerk handoff guide

## Architecture decisions

- Cloudflare Pages hosts the frontend and admin routes as one SPA.
- The API remains a Node service because it uses Express, `pg`, Node streams,
  and the current Replit App Storage sidecar.
- A separately hosted frontend uses `VITE_API_BASE_URL` and Clerk bearer tokens.

## Product

- Public event calendar with Canada/USA filtering and event detail pages.
- Albums, homepage content, About content, site settings, and contact inquiries.
- Admin-only event, album, media, homepage, About, and settings management.

## User preferences

- Keep secrets in the host environment; never commit real `.env` files.

## Gotchas

- Cloudflare Pages build output is `artifacts/jannat-events/dist/public`.
- `VITE_API_BASE_URL` is an origin without a trailing slash or `/api`.
- External API hosting requires a storage migration unless the Replit App
  Storage sidecar remains available.

## Pointers

- See `README.md` for the complete deployment and GitHub handoff process.
