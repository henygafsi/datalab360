---
name: ux-audit-index
description: Master index: Data360 UX intelligence audit system. Entry point for Alice+Henry agent system.
---

## Agent System

Alice discovers gaps; Henry fixes them. Alice always runs first and produces a structured gap report. Henry consumes that report to apply targeted fixes — never rewrites.

```
/agent-alice <module>
       |
       v
  [Read all page.tsx + component files for module]
  [Run /check-features <module>]
  [Audit 4 UX axes: loading / empty / error / dark]
  [Audit accessibility + microcopy]
  test sur api.datalab360.io les endpoints pour etre sur de l'affichage si le contenu est normal / manquant ?
       |
       v
  Gap report  →  stdout (JSON + markdown checklist)
       |
       v
/agent-henry <module> [P1|P2|P3]
       |
       v
  [Consume Alice gap report]
  [Patch only P1 gaps by default (P2/P3 on request)]
  [One file at a time — no full rewrites]
  [Verify TypeScript compiles, no lint errors]
       |
       v
  /push-feat <module>   (feat/backlog-v1, never main)
```

**Rule**: Henry never runs without a prior Alice report in context. If Alice has not run, Henry calls `/agent-alice <module>` first and waits.

---

## Usage

| Command | When to use |
|---|---|
| `/agent-alice <module>` | Discover UX gaps (loading/empty/error/dark + a11y + microcopy). Read-only. |
| `/agent-henry <module> P1` | Fix P1 gaps only (safe, minimal patch). |
| `/agent-henry <module> P2` | Fix P1+P2 gaps (more surface). |
| `/check-features <module>` | Checklist of implemented vs YAML features per tab + endpoint coverage. Read-only, Haiku-cheap. |
| `/review-ux <module>` | Full UX audit on 4 axes. Optionally pass `--fix` to auto-patch. |
| `/review-diff <module>` | Security + perf + conventions review on staged diff for module. |

**Priority levels**

- **P1** — broken or missing state (no loading skeleton, hard crash on empty, no error message, white flash in dark mode)
- **P2** — degraded experience (misleading copy, inaccessible button, missing aria-label, static "0" placeholders)
- **P3** — polish (animation, micro-interaction, copy tone)

---

## Right-Bar Design System

The canonical reference implementation is the **Workflow page** (`/workflow`, `ETLPipelineBuilder.tsx`). All modules with a detail/config panel should follow this pattern.

```
┌─────────────────────────────────────────────────────────────────────┐
│  TOP BAR  (project selector + action buttons + run status)          │
├──────────────────────────────────────┬──────────────────────────────┤
│                                      │  RIGHT BAR  (w-[420px])      │
│   MAIN CANVAS / LIST  (~75%)         │                              │
│                                      │  ┌──────────────────────┐   │
│   ReactFlow DAG  /  data table /     │  │ TAB STRIP            │   │
│   form / chart                       │  │  Results | Runs | SQL │   │
│                                      │  │  Schedule | AI        │   │
│                                      │  ├──────────────────────┤   │
│                                      │  │ SECTION 1            │   │
│                                      │  │  Results / dry-run   │   │
│                                      │  ├──────────────────────┤   │
│                                      │  │ SECTION 2            │   │
│                                      │  │  Execution history   │   │
│                                      │  ├──────────────────────┤   │
│                                      │  │ SECTION 3            │   │
│                                      │  │  SQL preview         │   │
│                                      │  ├──────────────────────┤   │
│                                      │  │ SECTION 4            │   │
│                                      │  │  Schedule manager    │   │
│                                      │  ├──────────────────────┤   │
│                                      │  │ SECTION 5            │   │
│                                      │  │  AI suggestions      │   │
│                                      │  └──────────────────────┘   │
│                                      │                              │
│                                      │  Toggle: ChevronLeft btn     │
│                                      │  (hides panel, canvas fills) │
└──────────────────────────────────────┴──────────────────────────────┘
```

**Right-bar rules (from workflow reference)**

1. Panel is **hidden by default** on landing — canvas gets full width.
2. Panel width is `w-[420px]` fixed, not percentage. Canvas flexes to fill remainder.
3. Tab strip uses a single compact row with `overflow-x-auto`.
4. Tabs can be **disabled** (`disabledWhenEmpty`, `disabledWhenPending`) with a tooltip explaining why.
5. When canvas is empty, force-switch to the AI/Help tab.
6. Each section is a scroll-independent panel inside the right bar — not a nested page.
7. Dark mode: panel bg = `bg-white dark:bg-slate-800`, border = `border-slate-200 dark:border-slate-700`.

---

## Module Skill Files

| Module | Skill link | Route | Top P1 gaps |
|---|---|---|---|
| Account Overview | `/check-features account-overview` | `/account-overview` | KPI cache not provisioned → blank tiles; no loading skeleton on org-summary |
| Sources / Catalog | `/check-features sources` | `/sources` | Empty state missing action CTA; no error boundary on catalog fetch |
| Explore & Design | `/check-features explore-design` | `/explore-design` | HistoryRail empty state; dark mode flash on schema tree |
| Workflow | `/check-features workflow` | `/workflow` | Run error not surfaced in right-bar Results tab; Schedule tab disabled msg unclear |
| Mapping | `/check-features mapping` | `/mapping` | Wizard step 0 empty state; no skeleton on project list load |
| Data Quality | `/check-features data-quality` | `/data-quality` | No P1 skeleton on rules table; alert modal dark bg missing |
| Governance | `/check-features governance` | `/governance/*` | Policy DMF content long-load no skeleton; security matrix mobile overflow |
| Observability | `/check-features observability` | `/observability` | Alerts page empty state generic; SLO page no error boundary |
| Intelligence (AI) | `/check-features intelligent` | `/intelligent` | Model picker loading flash; Cortex chat empty history state |
| Deploy App | `/check-features deploy-app` | `/deploy-app` | Wizard step missing progress indicator; no error state on deploy failure |
| Admin | `/check-features admin` | `/admin/*` | API health page no auto-refresh; RBAC matrix row overflow on small screens |
| Client Accounts | `/check-features client-accounts` | `/client-accounts` | No loading skeleton; empty state lacks onboarding CTA |

---

## Snowflake Coverage Map

### P1 — Critical path (must be live before GA)

| Feature | Status | Integration point |
|---|---|---|
| **Cortex Complete** — AI chat + workflow AI suggestions | Wired (intelligent tab, workflow AI tab) | `POST /api/intelligent/cortex-chat`, `POST /api/workflows/{id}/ai-suggest` |
| **Virtual warehouse live metrics** — query latency, credit burn | Wired in observability | `GET /api/observability/warehouses` |
| **Snowflake Tasks real-time status** — DAG run status polling | Wired in workflow runs panel | `GET /api/workflows/{id}/runs`, SSE `/api/workflows/{id}/runs/stream` |

### P2 — High value (sprint 2–3)

| Feature | Status | Integration point |
|---|---|---|
| **Cortex Search** — semantic search over catalog + docs | Gap — search uses text only | New: `POST /api/intelligent/cortex-search` |
| **Cortex Analyst** — NL→SQL over warehouse tables | Partial (explore-design SQL editor) | `POST /api/intelligent/analyst-query` |
| **Dynamic Tables** — incremental materialization for DQ + explore | DQ create modal has `DYNAMIC_TABLE_CREATED` event but no UI wizard | `/explore-design` create flow + DQ rule target |
| **Credit metering per project** — cost attribution | Wired in observability budget page (static UI) | `GET /api/observability/budget/credits` → needs live Snowflake cost endpoint |

### P3 — Future enrichment

| Feature | Status | Integration point |
|---|---|---|
| **Document AI** — unstructured data extraction pipelines | Not started | New workflow block type `document_ai` |
| **Fine-tuning / model customization** — Cortex FINETUNING | Not started | Intelligence tab new sub-section |
| **Semantic views** — reusable business metric layer | Concept in governance policies DMF | `GET /api/governance/semantic-views` |

---

## EventStore Tables

All tables live under `CP_DATA360.EVENT_STORE.*` in Snowflake (env var `SNOWFLAKE_METADATA_DATABASE`).

| Table | Module(s) | Key event types |
|---|---|---|
| `USER_ACTIVITY` | All modules (cross-cutting) | `LOGIN_AUTH`, `PAGE_VIEW`, `TAB_SWITCH`, `FEATURE_CLICK`, `ERROR_ENCOUNTER`, `SEARCH_QUERY`, `EXPORT_ACTION` |
| `PROJECT_EVENTS` | Explore & Design, Mapping | `TABLE_CREATED`, `COLUMN_MAPPING_CREATED`, `FOREIGN_KEY_ADDED`, `SCHEMA_CREATED`, `TABLE_RENAMED`, `ADD_COLUMN`, `REMOVE_COLUMN`, `RELATION_CREATED`, `SCD_CONFIGURED`, `MASKING_POLICY_SET`, `INGESTION_MODE_SET` |
| `DQ_ALERTS` | Data Quality, Explore & Design | `NULL_SPIKE`, `ROW_COUNT_DROP`, `SCHEMA_DRIFT`, `INGESTION_FAILURE`, `RULE_FIRED` |
| `SCHEMA_BASELINE` | Explore & Design | Schema snapshot records used as DQ drift baseline |
| `AUDIT_LOG` | Admin, Governance | `ROLE_ASSIGNED`, `POLICY_CREATED`, `GRANT_CREATED`, `USER_CREATED`, `OAUTH_TOKEN_ISSUED` |
| `DEPLOYMENT_PROGRESS` | Deploy App | `DEPLOY_START`, `DEPLOY_STEP_COMPLETE`, `DEPLOY_FAILED`, `DEPLOY_SUCCEEDED` |
| `NOTIFICATIONS_RAW` + `NOTIFICATIONS_USER` | All modules (notification bell) | `ALERT_TRIGGERED`, `APPROVAL_REQUESTED`, `APPROVAL_RESOLVED`, `BUDGET_THRESHOLD_EXCEEDED`, `SLO_BREACH` |
| `AI_RECOMMENDATIONS` | Intelligence, Workflow AI tab | `MODEL_QUERY`, `RECOMMENDATION_GENERATED`, `RECOMMENDATION_ACCEPTED`, `RECOMMENDATION_DISMISSED` |
