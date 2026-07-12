---
tags: [frontend, convention, feature/api-client, feature/auth]
---

# Frontend architecture

- **Framework**: Next.js 14.2.15, App Router (`apps/data360/src/app/`), route groups `(dashboard)` / `(other-pages)`. `next.config.mjs` has `typescript.ignoreBuildErrors: true` — **tsc is enforced only in CI**.
- **State**: Jotai (only state lib; atoms in `src/store/*` + per-module `stores/`). No react-query/SWR — custom hooks (`useCacheAwareQuery`, `useCacheInvalidation`) over axios + `services/cache` (SSE invalidation from backend [[Cache]] event bus).
- **UI**: Tailwind + Radix + Headless UI + CVA; in-house kit `src/components/ui/` (29) + `packages/data360-core/src/ui`. Charts: chart.js. DAG/lineage: reactflow + dagre. Tables: tanstack-table + virtual.

## Auth (NextAuth 4, JWT, 8 h)
`app/api/auth/[...nextauth]/auth-options.ts` — Credentials provider posts to FastAPI `/signin` (Snowflake auth) + Google. The FastAPI `access_token` is stored in the NextAuth JWT. `middleware.ts` redirects unauthenticated → `/signin`.

## API client
`src/lib/api-client.ts` — single axios instance, 600 s timeout. Request interceptor injects `Authorization: Bearer <access_token>` + Snowflake context headers `X-Account-Name`, `X-Username` from a **30 s-cached session** (avoids `/api/auth/session` storms). 401/403 invalidates the session cache.

- Base URL: `src/config/database.config.ts` → browser calls go same-origin **`/api-proxy`**, rewritten by `next.config.mjs` to `API_PROXY_UPSTREAM` (default `http://api.datalab360.io`); server-side code hits `NEXT_PUBLIC_API_URL` directly.
- Special rewrites: trailing-slash for `/api/recommendations/`, `/gouvernance/{disable,enable}_user/`; 308 redirects `/gouvernance*`→`/governance*`, `/connect`→`/data-source-connection`.
- Service layer: `app/services/<module>/` (35 dirs) wrap the client; typed APIs in `app/services/api/`; contracts in `src/lib/api-contracts.ts`; drift checked against `backend-route-manifest.json` (`scripts/check-route-manifest.mjs`).

## RBAC in the UI
Menus/buttons render from `/api/platform/me/grants` ([[Grants]]) + `useCanPerform` / `useCapability` / `PermissionGate` / `AdminRouteGuard` (`src/config/capabilities.ts`, `src/config/modules.ts`). Backend mirror is `require_can_perform` — unregistered keys fail open, register both sides.

[[Frontend-Home]] · backend [[Endpoint-Skeleton]] · [[Cache]]
