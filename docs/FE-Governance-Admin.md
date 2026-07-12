---
tags: [frontend, module/gouvernance, module/administration, grant/require-can-perform]
---

# FE — Governance · Administration · Admin

## Governance (`/governance/*`)
Landing cockpit (`GovernanceCockpitAxes`, `GovernanceKpiStrip`, `GovernanceDepthPanel`) + sub-pages: users (list/view/edit), roles (list/view/edit), grants, access-matrix (`UserAccessMatrix`), policies (unified RLS/masking/aggregation/tags/network/password/session), security-matrix, oauth, projects (`?project=` deep-link). Reusable CRUD/grant panels in `app/shared/governance/` (16 items: `AccessManagementPanel`, `policy-form-panel`, `grants/`, `roles/`, `users/`, `policy-grants/`, `security-matrix/`, `grant-matrix/`). Browser path is `/governance`; API prefix stays `/gouvernance` (308 redirect). Backend: [[Gouvernance]], [[Grants]], [[D360-Roles]].

## Administration hub (`/administration`, `?tab=`)
`AdministrationHub` (7 tabs), `/administration/access-center` (module→page→tab→feature→action grants + entitlements), `/administration/feature-governance` (per-account addon matrix). Panels: `PlatformHealthPanel`, `ServiceHealthPanel`, `LatencyFreshnessPanel`, `PerformanceKpiPanel`, `CostGovernancePanel`, `FeatureRegistryTab`, `ApiCatalogPanel`. Backend: [[Administration]].

## Admin tools (`/admin/*`)
`/admin` card grid + live platform-usage; `/admin/data360-config` (metadata/tables/cache config); `/admin/performance` (per-account drill: endpoints/users/cache/modules/errors ← `USER_REQUESTS`); `/admin/platform-settings`; `/admin/api-health` (live route prober + persisted runs). Guarded by `AdminRouteGuard`. Backend: [[Administration]], [[Events]] Lane 4.

[[Frontend-Home]] · [[Frontend-Architecture]]
