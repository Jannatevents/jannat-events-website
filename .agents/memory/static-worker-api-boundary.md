---
name: Static Worker API boundary
description: Cloudflare assets-only deployment behavior and the required frontend API-origin configuration.
---

An assets-only Cloudflare Worker serves the SPA shell for unknown paths, including `/api/*`, when SPA fallback is enabled. The frontend must receive a real `VITE_API_BASE_URL` for database-backed content and admin actions; otherwise API responses can be HTML and break array rendering.

**Why:** The production homepage received the Worker’s HTML fallback for API requests, which surfaced as `TypeError: y.map is not a function` inside the SPA.

**How to apply:** Keep the static Worker and Node API separate. Configure `VITE_API_BASE_URL` at build time for live data; retain a guarded static fallback so the public shell does not crash when that origin is absent.