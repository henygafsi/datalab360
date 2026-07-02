# Data360 documented-flows conformance matrix (2026-07-02)

*Produced during the continuous local-E2E run. Ground truth: live openapi (917 paths / 1026 ops on local :8000), FE contracts (534 paths), 52 dashboard routes. Note: the `data360-functional` vault no longer exists on disk; flows live in `vault/data360_full_doc/pages/*.md`, `website-map/`, `vault/data360_product_doc/`, and the MASTER_PLAN/Roadmap docs.*

**Overall: ~29 flows → 19 CONFORMANT · 7 PARTIAL · 3 BROKEN.** Heavy doc rot in the under-claiming direction: workflow, intelligence, account-overview, projects, org-accounts, governance and bi-reporting doc BODIES are stale while their 2026-06-09 enrichment banners are correct — re-baseline them.

## Highlights (full detail in the run log)
- CONFORMANT: connect (cloud storage 11/11, DB ingests 14/14), E&D modeling, workflow (26/26 — doc body refuted), governance d360-roles/users/grants/policies/access-requests/oauth, BI full editor+publish+share+NL, data-quality (30 ops wired), observability (58 ops, all 7 tab routes), account-audit 8/8, administration hub, intelligence (~55 ops; doc's six "404" tabs all live).
- PARTIAL: snowflake-lake browse (live, zero FE callers) · connect task resume/suspend (no FE caller) + incremental-ingest unbuilt · E&D deploy-chain split (deprecated + canonical both live; FE repoint pending; canonical gate = account_overview → 403 risk) · security-matrix is metadata-only (never compiles to a real ROW ACCESS POLICY) · data-products publish gate FE-only + share-roles undeployed · org-accounts lifecycle (8 mutations live, unsurfaced; trends blank on usage_date↔date mismatch; credits/storage render 0).
- BROKEN: guided mapping writes (FE hard-throws on stale "route does not exist" — all 13 guided routes ARE live; FIXED this run) · data-products teardown (no unpublish/unsubscribe/revoke/delete endpoints — backend build) · data-products contributor share-roles family undeployed.

## Top-10 prioritized gaps (journey impact order)
1. Guided mapping writes hard-throw (FE) — **fixed this run** (saveGroups/postMapping rewired to live guided routes).
2. `/project` page renders a static mock (`@/data/project-dashboard`) — never calls the fully-live `/projects/*` chain.
3. No approval gate on canonical `/projects/{id}/deployments/{d}/approve|execute` (module gate only) — self-approve possible for any account_overview-granted user; needs `require_action`.
4. Data-products one-way lifecycle — no teardown endpoints (backend build).
5. Data-products governance absent server-side (no require_action on create/publish; share-roles undeployed).
6. Security-matrix metadata-only — link it to the working `/gouvernance/policies/row-access` flow or label it advisory.
7. E&D deploy-chain split — repoint FE to canonical `/projects/{id}/deployments*` and fix its module gate.
8. Org-accounts lifecycle unsurfaced + trends field mismatch + zero-rendered credits/storage.
9. Deployed-but-unwired reads: snowflake-lake browse, connect task resume/suspend, data-product {id}/consumers/lineage/refresh.
10. Fine-grained RBAC not universal — require_action only in d360_roles + a few routers; ~104 governance handlers coarse-gated; /admin/* gated by get_current_user only. (See also ROLE_UX_AUDIT S-series; fail-open closure planned this run.)
