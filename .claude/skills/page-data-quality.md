---
name: page-data-quality
description: >
  Référence Data Quality Data360. Route /data-quality. 6 tabs selon spec :
  quality-summary, completeness, freshness, DMF results, anomalies, trust-center.
  Rôle principal : DQ Analyst. Snowflake DMF (Data Metric Functions) natifs.
  Cortex ML pour anomaly detection.
---

# Data Quality — Référence Data360

## Route

- **Route** : `/data-quality`
- **Fichier** : `apps/data360/src/app/(dashboard)/data-quality/page.tsx`

## Rôles

| Rôle | Actions |
|------|---------|
| **DQ Analyst** | Définir règles DQ, associer DMF, voir résultats, configurer seuils, déclencher remédiation |
| **Data Modeler** | Voir qualité des tables qu'il modélise |
| **Platform Admin** | Vue globale qualité compte, Trust Center scanners |
| **Data Governor** | Voir classification PII + compliance coverage |

## 6 Tabs

### Tab 01 : Quality Summary
- **Ce qui s'affiche** : Score global qualité par table + tendances
- **Endpoint** : GET /data-quality (base)
- **Actions** :
  - `Lancer analyse globale` : POST /data-quality/analyze
  - `Text-to-DQ` : POST /cortex/query → générer custom DMF depuis description NL
  - `Voir tables critiques` : filtrer par score < seuil

### Tab 02 : Completeness & Uniqueness
- **Snowflake DMF** : NULL_COUNT, DUPLICATE_COUNT, UNIQUE_COUNT — SF:H1
- **Endpoint** : GET /data-quality/completeness?table=
- **Actions** :
  - `Associer DMF NULL_COUNT` : ALTER TABLE ADD DATA METRIC FUNCTION
  - `Configurer seuil` : POST /data-quality/thresholds {table, metric, min_value}
  - `Voir colonnes vides` : filtrer colonnes null_pct > 0

### Tab 03 : Freshness Monitoring
- **Snowflake DMF** : FRESHNESS — SF:H1, SF:H2
- **Endpoint** : GET /data-quality/freshness
- **Actions** :
  - `Associer DMF FRESHNESS` : ALTER TABLE ADD DATA METRIC FUNCTION freshness
  - `Scheduler refresh` : POST /data-quality/dmf/schedule {table, cron, warehouse}
  - `Alerter si stale` : POST /observability/sensors (CREATE ALERT)

### Tab 04 : DMF Results
- **Snowflake** : DATA_METRIC_FUNCTION_REFERENCES view — SF:H1, SF:H3
- **Endpoint** : GET /data-quality/dmf-results
- **Actions** :
  - `Voir tous les DMF actifs` : tableau résultats avec timestamp
  - `Drill-down anomalie` : lien vers lineage /observability/lineage
  - `Désassocier DMF` : ALTER TABLE DROP DATA METRIC FUNCTION

### Tab 05 : Anomalies & Trends
- **Snowflake** : SNOWFLAKE.ML.ANOMALY_DETECTION — SF:D10
- **Endpoint** : GET /data-quality/anomalies
- **Actions** :
  - `Lancer anomaly detection` : POST /data-quality/anomaly-detection {table, column, periods}
  - `Configurer sensibilité` : seuil percentile
  - `Créer alerte` : POST /observability/sensors
  - `Voir tendance` : chart historique DMF résultats

### Tab 06 : Trust Center
- **Snowflake** : SHOW SCANNER PACKAGES — SF:G15
- **Actions** :
  - `Activer scanner` : POST /data-quality/trust-center/enable
  - `Voir recommandations scanner` : GET /data-quality/trust-center/recommendations
  - `Exporter rapport compliance` : GET /data-quality/trust-center/report

## Henry Tasks — data-quality

### P1
- [ ] Endpoint GET /data-quality/completeness avec résultats DMF réels depuis ACCOUNT_USAGE
- [ ] Layout 14:6: FilterChips [Toutes tables] [Critical] [Warning] [OK] + panel table sélectionnée
- [ ] Panel Détails: DMF actifs sur la table, derniers résultats, seuils configurés

### P2
- [ ] Anomaly detection: POST /data-quality/anomaly-detection → SNOWFLAKE.ML.ANOMALY_DETECTION
- [ ] Text-to-DQ: POST /cortex/query → générer corps DMF custom
- [ ] InsightActionButton pour "Associer DMF" avec confirmation

### P3
- [ ] Trust Center: SHOW SCANNER PACKAGES → liste scanners actifs
- [ ] Auto-suggest DMF: pour chaque nouvelle table → proposer set minimal (NULL_COUNT, FRESHNESS, UNIQUE_COUNT)

## Screenshots
```
e2e/results/screenshots/data-quality.png
```

## Module Run — data-quality — 2026-06-07

### Global KPIs
| KPI | Value |
|-----|-------|
| endpoints_audited | 17 |
| api_contracts_gaps_found | 16 |
| api_contracts_gaps_fixed | 16 |
| fake_zero_fixes | 1 |
| conventions_compliant | true |

### Step States
| Step | State | Notes |
|------|-------|-------|
| Read source | ✅ | page.tsx (2286 lines), services/data-quality/index.ts, api-contracts.ts dataQuality section read |
| Convention check | ✅ | apiClient used throughout service + page; no raw axios/fetch; endpoints all go through fetchQualityData helper |
| api-contracts fixes | ✅ | 16 entries added to API.dataQuality |
| Fake-zero fixes | ✅ | 1 fix: freshness_violation_pct ?? 0 → null-guarded display |
| Log written | ✅ | page-data-quality.md appended |

### Fixes Applied
- `apps/data360/src/lib/api-contracts.ts`: expanded `API.dataQuality` from 1 entry (`base`) to 17 entries — added `qualitySummary`, `completenessMetrics`, `uniquenessMetrics`, `freshnessMetrics`, `ingestionMetrics`, `schemaQuality`, `classificationCoverage`, `costMetrics`, `securityPosture`, `dmfResults`, `trendAnalysis`, `anomalies`, `snapshot`, `runCheck`, `dmfThresholds`, `anomalyDetection`
- `apps/data360/src/app/(dashboard)/data-quality/page.tsx` line 1508: `freshness_violation_pct ?? 0` replaced with null-guard — when `freshness_violation_pct` is null/undefined, no percentage is appended (was showing misleading `0%`)

### Remaining Gaps
- **page.tsx does not import from `API.dataQuality`** — `fetchQualityData()` builds paths inline via string interpolation (`/data-quality/${endpoint}`). The contracts entries are now registered but the page still doesn't reference them. A follow-up refactor should replace the inline strings with `API.dataQuality.*()` calls.
- **SSE cache invalidation**: `useCacheInvalidation` pattern is correctly used via `lastInvalidationAtom` + `CACHE_KEYS.DATA_QUALITY`/`CACHE_KEYS.QUALITY_METRICS`/`CACHE_KEYS.DMF_RESULTS` — no gap found here.
- **`CACHE_KEYS.QUALITY_METRICS` and `CACHE_KEYS.DMF_RESULTS`**: referenced in page.tsx SSE handler — verify these constants exist in `useCacheInvalidation.ts` (not audited in this run).
- **services/data-quality/index.ts** also constructs paths inline (`const PREFIX = '/data-quality'`) — should reference `API.dataQuality.*()` in a follow-up.
- **`?? 0` in column formatters** (`Number(v || 0)`): intentional — 0 is a semantically valid value in DQ columns (0 nulls = perfect completeness, 0 duplicates = unique). AuditTable fallback already uses `'—'` for truly missing values via `String(row[col.key] ?? '—')`. No change needed.

---

## Alice Run — data-quality — 2026-06-07

### Global KPIs

| KPI | Value |
|-----|-------|
| Endpoints source-verified OK | 14 |
| Endpoints missing (404 — no backend route) | 2 (`/data-quality/snapshot`, `/data-quality/anomaly-detection`) |
| Endpoints live but unwired from frontend | 3 (`/dmf/breaches`, `/dmf/catalog`, `/dmf/thresholds`) |
| Endpoints live-tested | 0 (static source analysis only) |
| RBAC-gated endpoints | 16 (router-level `require_module('data_quality')` + action-level `useCanPerform`) |
| Panel sections verified | 9 (KPI bar, charts, recommendations, 9 tab dimensions, ActionRails) |
| SmartRightBar axes implemented | 0 / 8 |
| UX segments audited | 9 |
| Henry Tasks P1 | 3 |
| Henry Tasks P2 | 6 |
| Henry Tasks P3 | 4 |
| Backend best-practices gaps | 2 (`cached_sf_get` missing on `/data-quality/snapshot`; `API.*` not used in page.tsx inline fetches) |

### Step States

| Step | State | Notes |
|------|-------|-------|
| Read page.tsx + tab components | complete | 9 tab dimensions + KPI bar + ActionRails verified |
| Endpoint verification vs backend manifest | complete | 14 OK, 2 missing (snapshot + anomaly-detection) |
| RBAC gate audit | complete | router-level `require_module('data_quality')` confirmed; action-level `useCanPerform` on all mutations |
| UX states (loading/empty/error/dark) | complete | All 9 segments have skeleton loaders; empty states present; error boundary at page level |
| SmartRightBar wiring | not started | 0/8 axes — no `useDataQualitySmartBar` hook exists |
| api-contracts coverage | partial | Henry Run added 5 entries; page.tsx still uses inline strings |
| useCacheInvalidation | compliant | `CACHE_KEYS.DATA_QUALITY` + `CACHE_KEYS.QUALITY_METRICS` + `CACHE_KEYS.DMF_RESULTS` subscribed |
| Brand violations | none | No Snowflake/Kimi/Cortex in customer copy |

### Henry Tasks Produced

**P1 (Critical — blocks reliability or compliance)**
1. Add backend route `POST /data-quality/snapshot` — endpoint called from FE but no handler in manifest
2. Add backend route `POST /data-quality/anomaly-detection` — same gap
3. Refactor `page.tsx` to use `API.dataQuality.*()` instead of inline string interpolation

**P2 (Important — UX polish or contract hygiene)**
1. Wire `/dmf/breaches`, `/dmf/catalog`, `/dmf/thresholds` into FE tab components
2. Add `SmartRightBar` integration for data-quality module (useDataQualitySmartBar hook)
3. Apply `cached_sf_get` to `/data-quality/snapshot` backend handler
4. Migrate `services/data-quality/index.ts` inline PREFIX to `API.dataQuality.*()` calls
5. Verify `CACHE_KEYS.QUALITY_METRICS` and `CACHE_KEYS.DMF_RESULTS` constants exist in `useCacheInvalidation.ts`
6. Add `InsightActionButton` for top anomaly CTA (currently plain button)

**P3 (Nice-to-have)**
1. Add `useTrackEvent` calls for tab switches in data-quality tabs
2. E2e Playwright spec for DQ tab navigation
3. Unit test for `fetchQualityData()` path construction
4. Lint rule to ban inline `/data-quality/` string literals

### Backend Conventions Compliance

| Convention | Status |
|-----------|--------|
| `apiClient` (no raw fetch/axios) | compliant |
| `API.*` entries in api-contracts.ts | partial (5 added by Henry; page still uses inline strings) |
| `@session_cache` on GETs | partial (snapshot GET missing) |
| Cache invalidation on POSTs | compliant |
| RBAC (`require_module` + `useCanPerform`) | compliant |
