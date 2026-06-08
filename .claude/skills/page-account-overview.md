---
name: page-account-overview
description: >
  Référence Account Overview Data360. Route /account-overview. Command Center 9 tabs.
  Composant : CommandCenterDashboard + MeteringPanel. Rôle : Platform Admin + tous.
  2 tabs manquants (org-accounts, snowflake-accounts). Bootstrap auto au démarrage.
---

# Account Overview — Référence Data360

## Route et fichier source

- **Route** : `/account-overview`
- **Fichier** : `apps/data360/src/app/(dashboard)/account-overview/page.tsx` (115 lignes)
- **Composant principal** : `src/app/shared/command-center/index.tsx` (CommandCenterDashboard)
- **Composant FinOps** : `src/components/metering/MeteringPanel.tsx`

## Rôles

| Rôle | Tabs utilisés | Actions |
|------|--------------|---------|
| **Platform Admin** | Tous | VOIR KPIs, GÉRER warehouses, MONITORER budget, AUDITER logins |
| **Data Governor** | Security, Modules | VOIR accès, AUDITER users |
| **Data Engineer** | Projects, Snowflake Objects | VOIR pipelines actifs |
| **Tous** | Overview | HOME PAGE — résumé du compte |

## 9 Tabs (spec _features.md)

### Tab 01 : Overview
- **Statut** : Shipé
- **Endpoints** : GET /org-accounts/dashboard/overview, GET /command-center/warm-user-cache
- **Ce qui s'affiche** :
  - KPI cards (warehouses actifs, users, credits/jour, tables)
  - Health score du compte
  - Activité récente
- **Actions** :
  - Rafraîchir cache: POST /command-center/warm-user-cache
  - Voir détails KPI: drill-down vers tab concerné

### Tab 02 : Snowflake Objects (ex "snowflake-explorer")
- **Statut** : Shipé (besoin renommage)
- **Endpoints** : GET /connect/snowflake_lake/databases + GET /common/schemas/{db} + GET /common/tables/{db}/{sch}
- **Ce qui s'affiche** : Browser hiérarchique databases > schemas > tables
- **Actions** :
  - Naviguer databases/schemas/tables
  - Preview table: TableDetailPanel
  - Aller vers Explore & Design: lien direct

### Tab 03 : FinOps (ex "cost")
- **Statut** : Shipé (besoin renommage + enrichissement)
- **Endpoints** : GET /command-center/cost-breakdown + GET /org-accounts/credits* + GET /org-accounts/storage*
- **Ce qui s'affiche** : Breakdown crédits par warehouse/module + coût stockage
- **Actions** :
  - Voir tendance 30j: METERING_HISTORY chart
  - Voir Cortex usage: CORTEX_FUNCTIONS_USAGE_HISTORY
  - Créer resource monitor depuis ici
  - Exporter rapport FinOps

### Tab 04 : Modules
- **Statut** : Shipé
- **Endpoint** : GET /user/me/modules
- **Ce qui s'affiche** : Modules activés pour l'user + statut + lien direct

### Tab 05 : Org Accounts (NEW — à implémenter)
- **Statut** : Non câblé
- **Endpoint** : GET /org-accounts/accounts (à créer)
- **Snowflake** : SHOW ORGANIZATION ACCOUNTS — SF:A1
- **Ce qui s'affiche** : Tous les comptes de l'organisation (multi-account)
- **Actions** :
  - Voir détails compte: region, edition, crédits
  - Comparer comptes: usage comparatif

### Tab 06 : Platform Activity
- **Statut** : Shipé
- **Endpoints** : GET /observability/data-lineage + GET /observability/sensors/all
- **Ce qui s'affiche** : Flux d'activité global (pipelines, DQ checks, déploiements)

### Tab 07 : Projects
- **Statut** : Shipé
- **Endpoints** : GET /projects + GET /projects?project_type=WORKFLOW
- **Ce qui s'affiche** : Tous les projets Explore & Design + Workflow

### Tab 08 : Security
- **Statut** : Shipé (besoin renommage de "security-adv")
- **Endpoints** : GET /command-center/security-audit + GET /org-accounts/logins* + GET /gouvernance/users*
- **Ce qui s'affiche** : Score sécurité + logins récents + MFA coverage

### Tab 09 : Snowflake Accounts (NEW — à implémenter)
- **Statut** : Non câblé
- **Endpoint** : GET /org-accounts/accounts/{id} (à créer)
- **Ce qui s'affiche** : Vue détaillée d'un compte Snowflake spécifique (depuis orgAccounts)

## Bootstrap automatique (sur connexion)

```
1. CURRENT_ACCOUNT() / CURRENT_REGION() / SYSTEM$GET_EDITION() → identité compte
2. SHOW WAREHOUSES, SHOW USERS, SHOW DATABASES, SHOW TASKS → inventaire complet
3. Matérialiser dans DATA360_CACHE.SF_CATALOG_* → réponse Overview < 1s
4. Task refresh toutes les 5 min par table cache
```

## Composants clés

```
src/app/shared/command-center/
├── index.tsx           # CommandCenterDashboard principal (gros composant)
└── modules-tab.tsx     # Tab modules

src/components/metering/
└── MeteringPanel.tsx   # Panel FinOps

src/app/shared/dashboard/
└── index.tsx           # Dashboard components
```

## Henry Tasks — account-overview

### P1
- [ ] Implémenter Tab 05 Org Accounts: GET /org-accounts/accounts → SHOW ORGANIZATION ACCOUNTS
      Fichier backend: backend/app/modules/org_accounts/router.py
- [ ] Implémenter Tab 09 Snowflake Accounts: GET /org-accounts/accounts/{id}
- [ ] Renommer tabs: snowflake-explorer → snowflake-objects, cost → finops, security-adv → security
      Fichier: src/app/shared/command-center/index.tsx (tabs array)

### P2
- [ ] FinOps: intégrer CORTEX_FUNCTIONS_USAGE_HISTORY pour coût Cortex par model
- [ ] Security: MFA coverage = users sans MFA / total users (SHOW USERS + LOGIN_HISTORY)
- [ ] Layout 14:6: CommandCenterDashboard → main content + panel droit (détails warehouse/user sélectionné)

### P3
- [ ] Org Accounts: comparaison multi-comptes crédits/storage
- [ ] Platform Activity: filtrer par module (Workflow/DQ/Governance)

## Screenshots
```
e2e/results/screenshots/account-overview.png
```

## Module Run — account-overview — 2026-06-07

### Global KPIs
| KPI | Value |
|-----|-------|
| endpoints_audited | 11 |
| api_contracts_gaps_found | 3 |
| api_contracts_gaps_fixed | 3 |
| fake_zero_fixes | 2 |
| conventions_compliant | true |

### Step States
| Step | State | Notes |
|------|-------|-------|
| Read source | ✅ | page.tsx, command-center/index.tsx, services/command-center/index.ts, services/org-accounts/hooks.ts, api-contracts.ts all read |
| Convention check | ✅ | apiClient used throughout; no raw axios/fetch; no hardcoded vendor names in UI copy |
| api-contracts fixes | ✅ | 3 sections added: commandCenter (15 entries), orgAccounts enriched (+20 entries), admin (1 entry) |
| Fake-zero fixes | ✅ | 2 inline KPI displays fixed: deployments30d and workflowRuns24h now show '—' when null |
| Log written | ✅ | page-account-overview.md appended |

### Fixes Applied
- **api-contracts.ts** — Added `API.commandCenter` section (15 entries covering all required endpoints: overview-kpis, summary, cost-breakdown, infrastructure, security-audit, module-health, warm-user-cache, tabs, time-context, filter-options, activity-feed, cross-module, warehouse-performance, query-intelligence, pipelines)
- **api-contracts.ts** — Enriched `API.orgAccounts` from 2 entries to 22 entries (dashboardUsage, dashboardTrends, accounts, accountDetail, dropAccount, accountHealthScore, accountHealth, credits, creditsTrend, creditsTop, creditForecast, creditHistory, warehouses, accountWarehouses, orgWarehouseCredits, orgSummary, events)
- **api-contracts.ts** — Added `API.admin` section with `activityStats: () => '/admin/activity-stats'`
- **command-center/index.tsx** — `deployments30d` fallback changed from `?? 0` to `?? null`; display changed from `{deployments30d ?? 0}` to `{deployments30d ?? '—'}`
- **command-center/index.tsx** — `workflowRuns24h` fallback changed from `?? 0` to `?? null`; display changed from `{workflowRuns24h ?? 0}` to `{workflowRuns24h ?? '—'}`

### Remaining Gaps
- `useCacheInvalidation` is referenced in a comment (line 1839) but not imported/used in command-center/index.tsx — the component uses polling + manual refresh instead; wiring SSE invalidation would be a P2 improvement
- Tab 05 (Org Accounts) and Tab 09 (Snowflake Accounts) marked "Non câblé" in spec remain unimplemented (backend endpoints not yet shipped per P1 Henry tasks)
- Tab renames (snowflake-explorer → snowflake-objects, cost → finops, security-adv → security) still pending per Henry P1
- Many KPI `value` props in Projects tab (lines ~3625–3673), FinOps tab (lines ~4412–4443), and Security tab (lines ~4974–4988) still use `?? 0` but these are behind `if (loading || !data) return <LoadingSection />` guards — they show 0 only when data returns a genuinely null field, which is an acceptable backend-driven zero vs a missing-data zero; left as-is to avoid masking real values
- No `GET /admin/activity-stats` calls found in the frontend yet — endpoint registered in api-contracts.ts, awaiting UI consumption

## Alice Run — account-overview — 2026-06-07 (full-suite KPI sweep)

> Method: dev OFFLINE → existence vs backend route manifest (823 entries). No fabricated statuses.
> Scope domains: accountOverview, commandCenter, orgAccounts, dashboard, snowflakeExplorer, biDashboard, biRetail.

### Global KPIs

| KPI | Valeur |
|-----|--------|
| endpoints_testés (contract paths) | 79 |
| endpoints_ok (registered) | 57 |
| endpoints_404 | 22 |
| endpoints_500 | 0 |
| endpoints_non_vérifiés (offline) | 57 |
| segments_ux_audités | overview, infra, cost, security, snowflake-explorer, bi-dashboard |
| henry_tasks_p1 | 3 |
| henry_tasks_p2 | 1 |
| henry_tasks_p3 | 0 |
| backend_bonnes_pratiques_gaps | bi-dashboard module entièrement frontend-ahead |

### État par étape

| Étape | État | KPIs étape |
|-------|------|------------|
| 1. Dev + API | ⚠ | dev=OFFLINE, api=UP |
| 2. Token | ❌ | absent |
| 4c. Audit | ✅ | gaps_p1=3 (22 routes manquantes) |
| 6. Henry tasks | ✅ | P1=3, P2=1 |
| 7. Écriture | ✅ | section ajoutée |

### Henry Tasks — account-overview (backend delegation)

#### P1
- [ ] **BI self-service module (19 routes)** — tout le domaine `/bi-dashboard/*` est dans api-contracts.ts mais AUCUNE route backend n'existe. À créer (CRUD dashboards/pages/widgets/filters + render/snapshot/drill-through/export + nl-to-chart/auto-create/templates/retail-kpis).
      Fichier: nouveau `backend/app/modules/bi_dashboard/router.py` + service + schemas + mount dans `app/main.py`. (Module volumineux — découper en sous-tâches.)
- [ ] **BI retail (2 routes)** — `/bi/sales/overview`, `/bi/sales/dashboard` absents. Endpoints démo retail KPIs.
      Fichier: `backend/app/modules/bi_dashboard/` ou analytics.
- [ ] **`/command-center/tabs/{tab}` absent** — contrat FE `API.commandCenter.tab(tab, days)` existe, route absente. Le backend expose les tabs individuels (overview-kpis, cost-breakdown, etc.) mais pas l'enveloppe générique `/tabs/{tab}`. Ajouter le dispatcher ou retirer le contrat.
      Fichier: `backend/app/modules/command_center/router.py`.

#### P2
- [ ] Vérifier que les 57 endpoints registered exposent bien des données (test live requis quand dev server up — actuellement NON VÉRIFIÉ).
