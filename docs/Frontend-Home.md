---
tags: [moc, frontend]
---

# Frontend — Map of Content

Next.js app (`datalab360Front/`, GitHub `henygafsi/datalab360`). Turborepo + pnpm; the app is workspace package `iso` at `apps/data360/`; shared packages `packages/data360-core` (UI/hooks/utils as `core`), `config-tailwind`, `config-typescript`.

## Notes
- [[Frontend-Architecture]] — stack, API client, auth, state, proxy rewrites
- [[FE-Data-Modules]] — connect/sources, explore-design, workflow
- [[FE-Governance-Admin]] — governance pages, administration hub, admin tools
- [[FE-Analytics-AI]] — bi-dashboard, intelligent (AI hub), data-quality, data-products
- [[FE-Cockpits]] — command-center (account-overview), org-accounts, observability, shared panels

## Route map (real `page.tsx` routes)

| Section | Routes |
|---|---|
| Home | `/` · `/account-overview` (post-login default) · `/client-accounts` · `/profile` · `/project` |
| Connect | `/data-source-connection` · `/data-source-config` · `/sources` |
| Design | `/explore-design` (+`/catalog`) · `/workflow` (+`/dev-tools`) · `/mapping` (legacy redirect) |
| Governance | `/governance` + users/roles/grants/access-matrix/policies/security-matrix/oauth/projects |
| Analytics/AI | `/bi-dashboard` (+`/[projectId]`) · `/intelligent?tab=` · `/data-quality` · `/data-products` |
| Observability | `/observability` + alerts/budget/dependencies/freshness/lineage/slo/trust-center |
| Admin | `/administration` (+access-center, feature-governance) · `/admin` + data360-config/performance/platform-settings/api-health |
| Misc | `/deploy-app` · `/email-templates` · `/signin` · access-denied/coming-soon/maintenance |

⚠ `src/config/routes.ts` still lists dead template routes (ecommerce, crm, invoice…) with no backing page — ignore them.

## CI
`.github/workflows/dev-validate.yml`: build → lint → `tsc --noEmit` (all blocking) + `pnpm check:routes` (report-only FE↔BE drift vs `backend-route-manifest.json`). Root `.gitlab-ci.yml` is the deploy pipeline (Vercel ships previews). Docs validation: see backend [[Docs-Sync-CI]].

Backend counterpart: [[Backend-Home]] · vault root: [[Home]]
