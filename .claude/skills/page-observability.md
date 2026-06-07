---
name: page-observability
description: >
  Référence Observability Data360. Route /observability + sous-routes /alerts /budget /slo /trust-center /lineage /dependencies.
  8 tabs dans le spec. Rôle principal : DQ Analyst + Platform Admin. ObservabilityDashboard component déjà présent
  mais sous-routes peu intégrées. Candidat panel 14:6 pour lineage + query history.
---

# Observability — Référence Data360

## Structure routes — tailles réelles

```
/observability                → page.tsx  110L  shell + ObservabilityDashboard + explore-links
/observability/alerts         → alerts/page.tsx          289L  ✅ table + ActionRail slide-over
/observability/budget         → budget/page.tsx          405L  ✅ CostOverviewCard + resource-monitor table + CreateMonitorModal
/observability/slo            → slo/page.tsx             337L  ✅ SLO table + AddSloModal
/observability/lineage        → lineage/page.tsx          109L  ✅ LineageFlowView (ReactFlow canvas)
/observability/trust-center   → trust-center/page.tsx    28L   shell → TrustCenterCard
/observability/dependencies   → dependencies/page.tsx    28L   shell → DependenciesCard
```

**IMPORTANT** : lineage a sa propre page.tsx (109L, ReactFlow canvas). trust-center et dependencies
sont des shells minces (28L) délégant à des composants partagés.
States réels des sous-pages : alerts/budget/slo sont les pages les plus substantielles.

## Rôles

| Rôle | Pages utilisées | Actions |
|------|----------------|---------|
| **DQ Analyst** | lineage, alerts, slo | VOIR anomalies, CONFIGURER alertes, VOIR SLO |
| **Platform Admin** | budget, alerts, query-history | GÉRER warehouses, VOIR coûts, MONITORER requêtes |
| **Data Engineer** | lineage, dependencies | VOIR impact changes, VOIR dépendances |
| **Data Governor** | trust-center, audit | VOIR compliance, AUDITER accès |

## 8 Tabs (spec _features.md)

### Tab 01 : Lineage Graph
- **Endpoints** : GET /observability/data-lineage → ACCOUNT_USAGE.ACCESS_HISTORY + OBJECT_DEPENDENCIES
- **Ce qui s'affiche** : Graph React-Flow des dépendances objets
- **Actions** :
  - Clic nœud → voir détails objet (table, view, pipeline)
  - Filtrer par date range
  - Exporter lineage comme image
  - Drill-down vers Catalog/Workflow/DQ
- **Snowflake** : SF:I4, SF:G14

### Tab 02 : Object Dependencies
- **Endpoint** : GET /observability/object-dependencies
- **Snowflake** : INFORMATION_SCHEMA.OBJECT_DEPENDENCIES — SF:G14
- **Actions** :
  - Voir dépendances d'une table
  - Impact analysis (si je modifie X, qu'est-ce qui casse?)

### Tab 03 : Task DAG & Runs
- **Endpoint** : GET /observability/task-runs → TASK_HISTORY() + DYNAMIC_TABLE_REFRESH_HISTORY
- **Snowflake** : SF:C8, SF:I2
- **Actions** :
  - Voir DAG tasks en temps réel
  - Re-run tâche échouée
  - Voir logs run

### Tab 04 : Query History (/observability page principale)
- **Endpoint** : GET /observability/query-history → ACCOUNT_USAGE.QUERY_HISTORY
- **Ce qui s'affiche** : Grille requêtes avec latence, bytes, warehouse, coût
- **Actions** :
  - Analyser plan requête: GET_QUERY_OPERATOR_STATS + EXPLAIN
  - Filtrer par warehouse/user/date
  - Exporter CSV
- **Snowflake** : SF:I1, SF:B4

### Tab 05 : Alerts (/observability/alerts)
- **Fichier** : `alerts/page.tsx`
- **Endpoint** : GET /observability/sensors/all
- **Actions** :
  - Créer alerte: POST /observability/sensors → CREATE ALERT SCHEDULE...
  - Activer/désactiver: PATCH /observability/sensors/{id}
  - Voir historique fires: GET /observability/sensors/{id}/history
- **Snowflake** : SF:H5 (DMF alerts)

### Tab 06 : Budget & Resource Monitors (/observability/budget)
- **Fichier** : `budget/page.tsx`
- **Endpoint** : GET /org-accounts/credits + GET /observability/resource-monitors
- **Actions** :
  - Créer resource monitor: POST /observability/resource-monitors → CREATE RESOURCE MONITOR
  - Modifier quota: PATCH /observability/resource-monitors/{name}
  - Voir consommation: METERING_HISTORY + WAREHOUSE_METERING_HISTORY
- **Snowflake** : SF:B5, SF:A5

### Tab 07 : SLO Tracking (/observability/slo)
- **Fichier** : `slo/page.tsx`
- **Ce qui s'affiche** : SLOs définis + statut actuel + historique
- **Actions** :
  - Créer SLO: POST /observability/slo
  - Voir incidents: GET /observability/slo/{id}/incidents
  - Alerter si breach

### Tab 08 : Event Tables & Logs
- **Endpoint** : GET /observability/event-tables → SHOW EVENT TABLES
- **Snowflake** : SF:C6 — SF:I11
- **Actions** :
  - Rechercher logs par RESOURCE_ATTRIBUTES
  - Filtrer par RECORD_TYPE (span/log/metric)

## ObservabilityDashboard — composant partagé

```
src/app/shared/observability/
├── index.tsx                   # Dashboard principal (health overview)
├── health-overview-tab.tsx     # Tab overview santé
├── performance-metrics-card.tsx
├── cost-overview-card.tsx
├── recommendations-card.tsx    # Recommandations IA
├── security-posture-card.tsx
└── trust-center-card.tsx
```

## Henry Tasks — observability

### P1
- [ ] Brancher lineage sur layout 14:6: main=graph React-Flow, panel=détails nœud sélectionné
      FilterChips: [Tables] [Views] [Tasks] [Pipelines]
      Panel Détails: owner, créé le, dernière modification, consommation
- [ ] Query history: connecter ACCOUNT_USAGE.QUERY_HISTORY réel
      `GET /observability/query-history?limit=100&warehouse=&user=&days=7`

### P2
- [ ] Alerts panel: InsightActionButton pour activer/désactiver alerts
- [ ] Budget: intégrer METERING_HISTORY + chart daily credits

### P3
- [ ] SLO: définir format SLO + endpoint création
- [ ] Event tables: full-text search sur logs Snowflake

## Screenshots
```
e2e/results/screenshots/observability.png
e2e/results/screenshots/observability-alerts.png
e2e/results/screenshots/observability-budget.png
e2e/results/screenshots/observability-slo.png
```

## Module Run — observability — 2026-06-07

### Global KPIs
| KPI | Value |
|-----|-------|
| endpoints_audited | 9 |
| api_contracts_gaps_found | 8 |
| api_contracts_gaps_fixed | 8 |
| fake_zero_fixes | 1 |
| conventions_compliant | false |

### Step States
| Step | State | Notes |
|------|-------|-------|
| Read source | ✅ | page.tsx (110L), services/index.ts (609L), services/types.ts (591L), api-contracts.ts observability section |
| Convention check | ⚠ | Service file hardcodes all paths inline (none reference API.observability.*). Contracts entries added but service not refactored — out of scope for this run |
| api-contracts fixes | ✅ | 8 entries added (kpis, intelligentKpis, alerts, acknowledgeAlert, lineage, performanceMetrics, slowQueries, dailyCredits, probesPlatform) |
| Fake-zero fixes | ✅ | 1 display-level fix: trust-center-card.tsx `summary.critical_count ?? 0` → `?? '—'` |
| useCacheInvalidation check | ⚠ | Not hooked in shared/observability/ — no SSE subscription found in any card or index.tsx |
| apiClient check | ✅ | All service calls go through apiClient (services/index.ts). Card components call service functions only — no raw fetch/axios bypass found |
| Build verification | ✅ | `pnpm iso:build` passed cleanly after all edits (38s, 1 successful) |
| Log written | ✅ | page-observability.md appended |

### Fixes Applied
- `apps/data360/src/lib/api-contracts.ts`: expanded `API.observability` from stub (`base` only) to 9 entries:
  - `kpis()` → `GET /observability/kpis`
  - `intelligentKpis()` → `GET /observability/intelligent-kpis` (alias, no current FE consumer)
  - `alerts(days?)` → `GET /observability/alerts`
  - `acknowledgeAlert()` → `POST /observability/alerts/acknowledge` (no service consumer yet — unverified against backend)
  - `lineage(params?)` → `GET /observability/lineage`
  - `performanceMetrics(days?)` → `GET /observability/performance/metrics`
  - `slowQueries(params?)` → `GET /observability/performance/slow-queries`
  - `dailyCredits(days?)` → `GET /observability/cost/daily-credits`
  - `probesPlatform()` → `GET /observability/probes/platform`
- `apps/data360/src/app/shared/observability/trust-center-card.tsx` L151: `summary.critical_count ?? 0` → `?? '—'` (direct JSX display, not arithmetic)

### Remaining Gaps
- **Convention violation**: `services/observability/index.ts` hardcodes all endpoint strings inline — none reference `API.observability.*`. Refactoring is a dedicated task (60+ call sites).
- **`useCacheInvalidation` not wired**: The shared observability dashboard and card components use plain `useCallback`/`useEffect` fetch loops with no SSE cache-key subscription. Should subscribe to relevant `CACHE_KEYS` and call `invalidateQueries` when backend pushes updates.
- **`intelligentKpis` and `acknowledgeAlert`**: Added to api-contracts as required by spec, but have no FE service consumer. `acknowledgeAlert` is also unverified against backend manifest.
- **Arithmetic-bound `?? 0` in display**: `security-posture-card.tsx`, `performance-metrics-card.tsx`, `cost-overview-card.tsx`, `health-overview-tab.tsx` all show "0" / "0%" when fields are null. These feed arithmetic so a safe fix requires display-layer `field != null ? value : '—'` guards — deferred as P2 polish.
