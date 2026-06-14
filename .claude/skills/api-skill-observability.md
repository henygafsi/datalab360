---
name: api-skill-observability
description: >
  Module Observability de Data360 (route /observability). Cockpit lecture-seule reconstruit
  côté serveur depuis SNOWFLAKE.ACCOUNT_USAGE.* + TRUST_CENTER.FINDINGS derrière un cache
  Redis : santé/KPIs, posture sécurité, métriques de performance (P50/P95/P99) & slow-queries,
  historique d'activité (audit), coût warehouse/crédits/stockage, alertes seuils & cross-module,
  SLO, conformité GDPR/SOC2, lineage & dépendances. Les seules écritures (FinOps : resource
  monitors, budgets ; acks ; SLO) vont per-user → event → invalidation. 43 ops sur 38 chemins,
  toutes 401 AUTH_REQUIRED = déployées + gardées. Rôles : Admin & FinOps Manager (READ+WRITE),
  Data Engineer & Data Steward (READ). Grounded sur le code réel + OpenAPI + re-test live — 2026-06-09.
---

# Observability — Skill Module (API-grounded, 2026-06-09)

> Toutes les affirmations sont sourcées (fichier:ligne, slice live, ou OpenAPI). Les endpoints viennent **uniquement** de la slice `observability.md` (43 ops) et de `openapi.json` (38 chemins). Aucun endpoint inventé. Statut live = re-test sweep 2026-06-08/09 (sans auth). Les zones non confirmées sont marquées « non vérifié ». **Honnêteté :** un `401` prouve qu'une route existe + est gardée à l'auth, **pas** qu'elle fonctionne sur données réelles ni quel rôle elle exige (le 401 précède le contrôle de rôle).

## 1. Vue d'ensemble

| Élément | Valeur (source) |
|---------|-----------------|
| **Route front** | `/observability` |
| **Entry point** | `apps/data360/src/app/(dashboard)/observability/page.tsx` (`ObservabilityPage` → `ErrorBoundary` + `ObservabilityDashboard` + footer de 6 sous-routes, `:68-109`) |
| **Hub (5 onglets)** | `apps/data360/src/app/shared/observability/index.tsx` (`:1360` ; tabs `:67-72` = `overview`, `compliance`, `tasks-lineage`, `cross-module`, `impact-analysis`) |
| **Sous-routes standalone (6)** | `/observability/{lineage,dependencies,budget,alerts,slo,trust-center}` |
| **Cartes (charts)** | `shared/observability/{health-score,recommendations,kpi-category,security-posture,performance-metrics,activity-summary,cost-overview,compliance,dependencies,trust-center}-card.tsx` |
| **Disclaimer fraîcheur** | `shared/observability/freshness-disclaimer.tsx` (rendu sur chaque surface — lag ACCOUNT_USAGE) |
| **Service API front** | `apps/data360/src/app/services/observability/index.ts` (wrappers ; `RouteNotDeployedError` sur 404/501 `:39-53`) + types `services/observability/types.ts` |
| **Module backend** | `backend/app/modules/observability/router.py` (router-level `require_module("observability")` `:71`) + `services.py` ; config sur prefix séparé `/api/data360/platform-config` |

**Rôles (vérifié `backend/app/core/rbac.py:189,205,224,244`)** — gate de module `_MATRIX` :

| Rôle | Accès observability |
|------|---------------------|
| **Admin** | READ + WRITE (FinOps) — rôle principal |
| **FinOps Manager** | READ + WRITE (FinOps) — rôle principal |
| Data Engineer | READ |
| Data Steward | READ |

> Les écritures FinOps (resource monitors, budgets — `PUT/DELETE`) exigent en plus `require_accountadmin_role` (gate primaire enforced) + `require_action("observability","platform","*","configure-budget")` (fail-open). ⚠️ **OBS-P2-01** : `POST /budgets`, `POST /slo`, `POST /alerts/{id}/ack` n'ont **que** `require_module` (gate admin manquant).

## 2. Capacités (grounded)

| Capacité | Implémentation (composant / endpoint) |
|----------|----------------------------------------|
| Lire le score de santé 0–100 + 5 KPIs + recommandations | `HealthOverviewTab` → `GET /observability/kpis` (alias `/intelligent-kpis`) ; `getIntelligentKpis()` `index.ts:113` |
| Lire la posture sécurité (MFA, failed logins, masking/RLS, dormants) | `SecurityPostureCard` → `GET /observability/security/posture` ; `getSecurityPosture()` `index.ts:202` |
| Lire les métriques de perf (P50/P95/P99) + slow-queries | `PerformanceMetricsCard` → `GET /observability/performance/metrics` + `/slow-queries` ; `getPerformanceMetrics(7)` `index.ts:241`, `getSlowQueries({days})` `:249` |
| Lire l'historique d'activité par utilisateur (audit) | `ActivitySummaryCard` → `GET /observability/activity/summary` ; `getActivitySummary(7)` `index.ts:191` |
| Lire le coût (warehouse + crédits journaliers + stockage) | `CostOverviewCard` → `GET /observability/cost/{warehouse-usage,daily-credits,storage}` ; `getWarehouseUsage/getDailyCredits/getStorageMetrics` `index.ts:213,221,229` |
| Lire les resource monitors | `BudgetPage` → `GET /observability/cost/monitors` (`getCostMonitors` `:495`) ou `/org-accounts/resource-monitors` |
| Créer/éditer/supprimer un resource monitor (FinOps) | `POST/PUT/DELETE /observability/cost/monitors[/{name}]` + `/assign` ; `createCostMonitor/updateCostMonitor/assignCostMonitorWarehouse/deleteCostMonitor` `index.ts:511-551` (**unmounted UI**) |
| Créer/éditer/supprimer un budget de dépense (FinOps) | `POST/GET/PUT/DELETE /observability/budgets[/{name}]` ; `createSpendBudget/listSpendBudgets/updateSpendBudget/deleteSpendBudget` `index.ts:567-599` (**unmounted UI**) |
| Lire les alertes de seuil + cross-module | `AlertsPage` → `GET /observability/alerts` + `/alerts/cross-module` ; `getObservabilityAlerts(7)` `:402`, `getCrossModuleAlerts(7)` `:410` |
| Acquitter une alerte | `POST /observability/alerts/{alert_id}/ack` (**no FE wrapper / no button**) |
| Lire la conformité SLO (3 SLOs) + définir un SLO | `SloPage` → `GET /observability/slo-tracking` (`getSloTracking(30)` `:422`) ; `POST /observability/slo` (**no FE wrapper**) |
| Lire la conformité GDPR / SOC2 | `compliance-card.tsx` → `GET /observability/compliance/{gdpr,soc2}` ; `getGdprComplianceReport()` `:124`, `getSoc2ComplianceReport()` `:132` |
| Explorer lineage (data + access-patterns + cross-module + tasks) | `GET /observability/lineage[/access-patterns\|/cross-module\|/with-tasks]` ; `getDataLineage/getAccessPatterns/getCrossModuleLineage/getLineageWithTasks` `index.ts:144,164,172,339` |
| Explorer les dépendances d'objets (search + graphe) | `DependenciesCard` → `GET /observability/dependencies[/graph]` ; `getObjectDependencies/getDependencyGraph` `:281,300` |
| Analyse d'impact (« blast radius ») | `ImpactAnalysisTab` — **calcul client-side** sur `/lineage` + `/dependencies` (pas d'endpoint dédié) |
| Lire le Trust Center (findings + summary) | `TrustCenterCard` → `GET /observability/trust-center/{findings,summary}` ; `getTrustCenterFindings/Summary` `:319,327` |
| Sonder la fraîcheur des données (sans lag) | `GET /observability/probes/{table,schema,changes,platform}` + `POST /probes/batch-check` + `GET /sensors/all` ; `probe*` `index.ts:366-392` |
| Importer une task découverte vers Workflow | `GET /observability/tasks/importable` + redirect `window.location` vers `/workflow?import_sql=…` |
| Lecture consolidée (un appel) | `GET /observability/dashboard` (`getObservabilityDashboard` `:434`) — ⚠️ **jamais invoqué** (le hub s'assemble par section) |

## 3. Référence endpoints (43 ops sur 38 chemins — statut live)

**Contrat de statut** : la slice liste **43 opérations** réparties sur **38 chemins OpenAPI** (les chemins multi-verbes `/budgets`, `/budgets/{name}`, `/cost/monitors`, `/cost/monitors/{name}`, `/slo`(GET 405/POST 401), `/alerts/{alert_id}/ack` hébergent plusieurs méthodes). **Les 43 ops renvoient `401 AUTH_REQUIRED`** = routes enregistrées, déployées, gardées à l'auth. Aucune route publique (200), aucun 404/500. Re-test 2026-06-09 (verbe non monté → `405`, qui prouve aussi la présence). **Aucun `deprecated=True`** sur les 38 chemins (vérifié OpenAPI) — pas de piège « deprecated ≠ supprimé ».

### 3a. Santé · KPIs · sécurité (hub overview)

| Live | Méthode | Path | Usage |
|------|---------|------|-------|
| 401 | GET | `/observability/kpis` · `/intelligent-kpis` (alias) | Score santé 0–100 + 5 KPIs + recommandations |
| 401 | GET | `/observability/security/posture` | Posture sécurité (MFA, failed logins, masking/RLS, dormants, PII) |
| 401 | GET | `/observability/dashboard` | Lecture consolidée (KPIs+activity+cost+storage) — non utilisée par le FE |
| 401 | GET | `/observability/health` | Health check du module (cache 30 s) |

### 3b. Performance · query history · activité (FOCUS)

| Live | Méthode | Path | Query params (type · défaut · borne) |
|------|---------|------|--------------------------------------|
| 401 | GET | `/observability/performance/metrics` | `days` int · **def 7 · 1..30** |
| 401 | GET | `/observability/performance/slow-queries` | `days` int def 7 (1..30) · `threshold_seconds` int **def 60 · 1..3600** |
| 401 | GET | `/observability/activity/summary` | `days` int · **def 7 · 1..30** |

### 3c. Coût · warehouse · crédits (FinOps lecture)

| Live | Méthode | Path | Query params |
|------|---------|------|--------------|
| 401 | GET | `/observability/cost/warehouse-usage` | `days` int · **def 30 · 1..90** |
| 401 | GET | `/observability/cost/daily-credits` | `days` int · **def 30 · 1..90** |
| 401 | GET | `/observability/cost/storage` | — |
| 401 | GET | `/observability/cost/monitors` | — (non caché : monitor fraîchement créé visible) |
| 401 | GET | `/observability/cost/monitors/{name}` | path `{name}` |

### 3d. Alertes · SLO · conformité (FOCUS)

| Live | Méthode | Path | Params |
|------|---------|------|--------|
| 401 | GET | `/observability/alerts` | `days` int · **def 7 · 1..30** |
| 401 | GET | `/observability/alerts/cross-module` | — (FE envoie `days` mais **ignoré** ; fenêtres hard-codées) |
| 401 | POST | `/observability/alerts/{alert_id}/ack` | path `{alert_id}` · ⚡ `EVENT_STORE.USER_ACTIVITY` `ALERT_ACK` |
| 401 | GET | `/observability/slo-tracking` | `days` int · **def 1 · 1..30** (FE envoie 30) |
| 401 | POST | `/observability/slo` | body `UserSLOCreate` · ⚡ `SLO_DEFINED` |
| 401 | GET | `/observability/compliance/gdpr` | — |
| 401 | GET | `/observability/compliance/soc2` | — |

### 3e. FinOps écritures gardées (admin)

| Live | Méthode | Path | Body / query |
|------|---------|------|--------------|
| 401 | GET | `/observability/budgets` | — (non caché) |
| 401 | POST | `/observability/budgets` | body `SpendBudgetCreate` · ⚠️ **gate admin manquant (OBS-P2-01)** |
| 401 | PUT | `/observability/budgets/{name}` | path `{name}` · body `SpendBudgetCreate` |
| 401 | DELETE | `/observability/budgets/{name}` | path `{name}` · query `confirm` bool (def `false`, requis `true`) |
| 401 | POST | `/observability/cost/monitors` | body `ResourceMonitorCreate` |
| 401 | PUT | `/observability/cost/monitors/{name}` | path `{name}` · body `ResourceMonitorUpdate` |
| 401 | POST | `/observability/cost/monitors/{name}/assign` | path `{name}` · body `WarehouseAssignRequest{warehouse*}` |
| 401 | DELETE | `/observability/cost/monitors/{name}` | path `{name}` · query `confirm` bool |

### 3f. Lineage · dépendances · impact

| Live | Méthode | Path | Params |
|------|---------|------|--------|
| 401 | GET | `/observability/lineage` | `database`,`schema`,`table` · `days` int def 30 (1..90) · `page` def 1 · `page_size` def 50 (1..200) |
| 401 | GET | `/observability/lineage/access-patterns` | `days` int def 30 (1..90) |
| 401 | GET | `/observability/lineage/cross-module` | `days` int def 30 (1..90) · `database` (préfixe) |
| 401 | GET | `/observability/lineage/with-tasks` | `database` · `days` int def 30 (1..90) |
| 401 | GET | `/observability/dependencies` | `object_name` · `object_domain` · `direction` (def "both") |
| 401 | GET | `/observability/dependencies/graph` | `database` · `schema` |
| 401 | GET | `/observability/tasks/importable` | `state` ∈ {all,started,suspended} |

### 3g. Trust Center · probes · sensors (DQ plumbing)

| Live | Méthode | Path | Params |
|------|---------|------|--------|
| 401 | GET | `/observability/trust-center/findings` | — |
| 401 | GET | `/observability/trust-center/summary` | — |
| 401 | GET | `/observability/probes/table` | `table*` |
| 401 | GET | `/observability/probes/schema` | `database*` · `schema*` |
| 401 | GET | `/observability/probes/changes` | `table*` · `since*` |
| 401 | GET | `/observability/probes/platform` | — |
| 401 | POST | `/observability/probes/batch-check` | body `object` · ⚡ invalide `OBSERVABILITY_DASHBOARD` |
| 401 | GET | `/observability/sensors/all` | `days` |

**Routes du module NON dans la slice `/observability` (prefix séparé)** : `GET/PUT /api/data360/platform-config[/{key}]` + `POST /api/data360/platform-config/reset` — éditées sous **Admin** (`/admin/platform-settings`), pas sur cette page. Gate `require_accountadmin_role`.

## 4. Modèle de données (sources Snowflake → endpoints)

> Observability **n'écrit aucune table métier** : tout est reconstruit en lecture depuis `SNOWFLAKE.ACCOUNT_USAGE.*` + `TRUST_CENTER.FINDINGS`, derrière un cache Redis. Les seules écritures sont des **events** (`EVENT_STORE.USER_ACTIVITY`) + du **DDL** (resource monitors). Lag ACCOUNT_USAGE = sa contrainte structurante.

| Source Snowflake | Endpoints consommateurs | Lag | Cache TTL app |
|---|---|---|---|
| `ACCOUNT_USAGE.QUERY_HISTORY` | perf/metrics, slow-queries, activity/summary, alerts, slo-tracking, GDPR Art.17, SOC2 | ~45 min | 300–600 s |
| `ACCOUNT_USAGE.TASK_HISTORY` | slo-tracking, alerts, lineage/with-tasks, cross-module | ~45 min | 120–600 s |
| `ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY` | cost/warehouse-usage, daily-credits, KPIs (coût), alerts (spike crédits) | ~3 h | 1800 s |
| `ACCOUNT_USAGE.STORAGE_USAGE` + `DATABASE_STORAGE_USAGE_HISTORY` + `TABLE_STORAGE_METRICS` | cost/storage, KPIs | ~24 h | 1800 s |
| `ACCOUNT_USAGE.LOGIN_HISTORY` + `USERS` + `COLUMNS` | security/posture, KPIs, GDPR Art.32 | ~45 min–2 h | 600–900 s |
| `ACCOUNT_USAGE.ACCESS_HISTORY` | lineage, access-patterns, cross-module, GDPR Art.30/32, impact | ~3 h | 900–1800 s |
| `ACCOUNT_USAGE.OBJECT_DEPENDENCIES` | dependencies, dependencies/graph, lineage/with-tasks | ~3 h | 600 s |
| `ACCOUNT_USAGE.{POLICY_REFERENCES,GRANTS_TO_ROLES,DATABASES,SCHEMATA,STAGES,TABLES}` | cross-module lineage, cross-module alerts | ~45 min | 120–1800 s |
| `SNOWFLAKE.TRUST_CENTER.FINDINGS` | trust-center/findings, summary | Live (refresh TC) | 600 s |
| `INFORMATION_SCHEMA.WAREHOUSE_LOAD_HISTORY` (table fn) | cost/warehouse-usage (charge live) | Live | 1800 s |
| `SHOW {USERS,MASKING POLICIES,ROW ACCESS POLICIES,RESOURCE MONITORS,TASKS}` | posture, cost/monitors, lineage/with-tasks | Live | 600–900 s / non caché |
| `METADATA$ROW_LAST_MODIFIED_AT` | probes/* (détection fraîcheur sans lag) | Live | 30–120 s |
| `EVENT_STORE.USER_ACTIVITY` | budgets (snapshot read) ; writes : `ALERT_ACK`, `SLO_DEFINED`, `BUDGET_*`, `RESOURCE_MONITOR_*` | — | — |

**Schémas de body (OpenAPI vérifié)** :
- `UserSLOCreate{ name*(1..255), metric*, target*:float, window* }`
- `SpendBudgetCreate{ name*(1..255), monthly_credit_limit*:float>0, warehouses?[], alert_at_pct?:int(1..100, def 90) }`
- `ResourceMonitorCreate{ name*, credit_quota*:int>0, frequency?, triggers?[]{percent*:int(1..2000), action*:NOTIFY|SUSPEND|SUSPEND_IMMEDIATE}, notify_users?[], warehouses?[], if_not_exists:bool(def true) }`
- `ResourceMonitorUpdate{ credit_quota?, frequency?, triggers?[], notify_users?[], warehouses? }` (≥1 requis sinon 422 ; TRIGGERS remplacent l'ensemble)
- `WarehouseAssignRequest{ warehouse* }`

## 5. Cas d'usage de lecture (read-oriented) + fiche « ins / outs » des endpoints clés

> L'analogue lecture des 20 scénarios workflow. Observability ne construit pas de DAG : ses cas d'usage sont des **lectures d'audit / FinOps / SLO**. Tous **`401` live** (déployés) ; test fonctionnel authentifié à faire (compte Snowflake expiré).

**UC-01 — Régression de performance.** Comparer P95/P99 sur 30 j vs 7 j. `GET /performance/metrics?days=30` puis `?days=7` ; lire `p95_execution_time_ms`/`p99_execution_time_ms`. Si dégradation → `GET /performance/slow-queries?days=7&threshold_seconds=60` pour la liste des requêtes coupables.

**UC-02 — Pic de crédits (FinOps).** `GET /cost/daily-credits?days=30` → repérer le jour de spike dans `daily_usage[]` ; `GET /cost/warehouse-usage?days=30` → `warehouses[]` pour isoler le warehouse fautif ; `GET /alerts?days=7` confirme l'alerte « credit spike >2× avg ». Action gouvernée : `POST /cost/monitors` (quota + trigger SUSPEND).

**UC-03 — Brèche SLO.** `GET /slo-tracking?days=30` → `slos[]` : si `status:'BREACH'` sur succès-requêtes (<99 %) lire `failures`/`error_budget_remaining_percent`. ⚠️ 3 SLOs hard-codés ; `POST /slo` stocke un SLO custom mais `slo-tracking` ne le relit pas encore.

**UC-04 — Audit d'activité utilisateur.** `GET /activity/summary?days=7` → `users[]{user_name, total_queries, failed_queries, total_gb_scanned, last_active, databases_accessed}` pour repérer un utilisateur anormalement actif / un compte dormant.

**UC-05 — Coût de stockage.** `GET /cost/storage` → `current_storage_gb`/`current_stage_gb`/`current_failsafe_gb` + `history[]` (lag ~24 h) pour la tendance de stockage.

**UC-06 — Posture sécurité.** `GET /security/posture` → `mfa_coverage_percent`, `failed_logins_7days`, `masking_policies`, `rls_policies`, dormants. Croisé avec `GET /trust-center/findings` (CIS benchmark).

**UC-07 — Triage d'alertes cross-module.** `GET /alerts/cross-module` → `alerts[]{severity, source_module, alert_type, message, suggested_action}` (fraîcheur tables >72 h, échecs tasks, anomalies coût, violations policy) ; `POST /alerts/{id}/ack` pour acquitter (event log).

**UC-08 — Impact d'un changement (blast radius).** Pas d'endpoint dédié : `GET /lineage?database&schema&table&days=30` + `GET /dependencies?database` → l'UI dérive downstream/users/risk **client-side** (seuils hard-codés). Limite documentée.

**UC-09 — Conformité GDPR/SOC2.** `GET /compliance/gdpr` + `/compliance/soc2` → `overall_score`/`overall_status` + cartes de contrôle (Art.17/30/32 ; CC6.1/CC7.2/CC8.1). ⚠️ heuristiques (CC8.1 figé 85).

**UC-10 — Fraîcheur des données (DQ).** `GET /probes/table?table=…` ou `/probes/schema` → `last_modified` sans lag ; `POST /probes/batch-check` pour un lot de tables.

### 5.bis — Fiche « ins / outs » des endpoints clés (FOCUS : perf · historique · coût · alertes · SLO)

| But | Endpoint | INS (path · query · body) | OUTS (réponse consommée) |
|-----|----------|---------------------------|--------------------------|
| Métriques perf | `GET /observability/performance/metrics` | query `days`(int, def 7, 1..30) | `{total_queries, successful_queries, failed_queries, avg_execution_time_ms, p50/p95/p99_execution_time_ms, total_bytes_scanned, total_rows_produced}` |
| Slow queries | `GET /observability/performance/slow-queries` | query `days`(def 7), `threshold_seconds`(def 60, 1..3600) | `{slow_queries[], count, threshold_seconds}` |
| Audit activité | `GET /observability/activity/summary` | query `days`(def 7, 1..30) | `{period_days, total_users, users[]{user_name, total_queries, successful_queries, failed_queries, total_gb_scanned, last_active, warehouses_used, databases_accessed}}` |
| Coût warehouse | `GET /observability/cost/warehouse-usage` | query `days`(def 30, 1..90) | `{period_days, total_credits, estimated_cost_usd, warehouses[]}` |
| Crédits journaliers | `GET /observability/cost/daily-credits` | query `days`(def 30, 1..90) | `{daily_usage[], count, by_warehouse[], summary}` |
| Stockage | `GET /observability/cost/storage` | — | `{current_storage_gb, current_stage_gb, current_failsafe_gb, history[]}` |
| Alertes seuil | `GET /observability/alerts` | query `days`(def 7, 1..30) | `{alerts[]{type, severity, message, actual, threshold, unit}, count}` |
| Alertes cross-module | `GET /observability/alerts/cross-module` | — (FE `days` ignoré) | `{alerts[]{severity, source_module, alert_type, message, suggested_action, timestamp}, count}` |
| Acquitter alerte | `POST /observability/alerts/{alert_id}/ack` | path `{alert_id}` | `{success, alert_id, acknowledged_by, acknowledged_at}` ⚡ `ALERT_ACK` |
| SLO tracking | `GET /observability/slo-tracking` | query `days`(def 1, 1..30 ; FE→30) | `{overall_status, days, slos[]{name, actual, target, unit, breach, status:OK\|BREACH, sample_size, failures, error_budget_remaining_percent}, summary}` |
| Définir SLO | `POST /observability/slo` | body `UserSLOCreate{name*, metric*, target*:float, window*}` | `{success, slo{…}}` ⚡ `SLO_DEFINED` |
| KPIs santé | `GET /observability/kpis` | — | `{overall_health_score, overall_status, governance\|cost\|performance\|usage\|compliance{score,status,metrics}, recommendations[]{priority,category,title,description,impact}, computed_at}` |
| Créer monitor (FinOps) | `POST /observability/cost/monitors` | body `ResourceMonitorCreate` | `{success, …DDL echo}` ⚡ `RESOURCE_MONITOR_CREATED` |
| Créer budget (FinOps) | `POST /observability/budgets` | body `SpendBudgetCreate` | `{success, budget{…}, resource_monitor?}` ⚡ `BUDGET_CREATED` ⚠️ gate admin manquant |

> Renvoi : la matrice **gouvernance / DQ / coût / planif(n.a.) / historique** et l'**optimisation cache (account-level `shared_cache`)** sont dans le vault `data360_full_doc/pages/observability.md` §Enrichissement (2026-06-09, §B/§C). Le finding `/cache/*` reste privé.

## 6. UX front — validation 4 axes + accessibilité + charts/tags

| Axe | Verdict | Preuve (fichier:ligne) | Microcopy |
|-----|---------|------------------------|-----------|
| **loading** | ✓ | skeletons animés par section : `health-overview-tab.tsx:191-192,215-219` ; `budget/page.tsx:179` ; `alerts/page.tsx:113-114` ; `slo/page.tsx:99-100`. `Promise.allSettled` (`health-overview-tab.tsx:55-69`) → une section lente ne bloque pas le reste | tuiles `animate-pulse` |
| **empty** | ✓ | `NotDeployedNote` 404/501 (`health-overview-tab.tsx:72-83,195`) ; alerts « No active alerts » (`alerts/page.tsx:126-131`) ; slo « No SLOs defined » (`:112-117`) ; monitors « Create resource monitors in Snowflake » (`budget/page.tsx:191-196`, 🔴 renvoie hors produit) ; impact « select an object » (`index.tsx:1305-1314`) | empty states explicites par carte |
| **error** | ✓ | `ErrorBoundary` au niveau page (`page.tsx`) ; `SectionError`+Retry (`health-overview-tab.tsx:87-99,194`) ; `RouteNotDeployedError` (`services/observability/index.ts:39-53`) dégrade chaque carte ; banderoles rouges (`budget/page.tsx:155-159`, `lineage/page.tsx:93-97`) ; toast `'Failed to load compliance data'` (`index.tsx:1393`) | « not available yet » / Retry |
| **dark mode** | ✓ (à recompter par fichier) | cartes et pages portent des classes `dark:` (ex. `cost-overview-card.tsx`, `alerts/page.tsx` severity map `:20-27`) — **comptage exact par carte non vérifié** ici, à confirmer comme pour workflow (111 occ.) | — |

**Charts (FOCUS — trace tags)** :
- **Trifecta perf** P50/P95/P99 → `performance-metrics-card.tsx` (seul fichier référant `p95/p99/percentile`, vérifié grep) alimenté par `GET /performance/metrics`. (« Trifecta » n'est **pas** un terme présent dans le code — 0 occurrence ; on l'emploie ici comme raccourci du triptyque perf/historique/coût du FOCUS.)
- **Tendance crédits journaliers** → `cost-overview-card.tsx:61-74` (chart daily-credit + storage active/stage/failsafe) alimenté par `GET /cost/daily-credits` + `/cost/warehouse-usage` + `/cost/storage`.
- **Score santé rond** → `health-score-card.tsx` (`health-overview-tab.tsx:198-203`) ; **5 KPI tiles** → `kpi-category-card.tsx` (`:222-237`).

**Accessibilité** : badges de sévérité couleur sur alertes (`alerts/page.tsx:20-27`) et usage monitors (amber ≥75 % / rouge ≥90 %, `budget/page.tsx:211-238`). ⚠️ Les canvases de lineage (`cross-module-flow.tsx`) sont souris/drag — navigation clavier **non vérifiée**. Tags `aria-*` par carte **non recensés exhaustivement** (non vérifié).

## 7. Drift détecté (vs vault observability.md + re-test live)

> Contrairement à `api-skill-workflow` (taxonomie + endpoints inventés dans le doc antérieur), le doc observability est **propre** : re-test live = **zéro dérive de path/statut**. Les écarts ci-dessous sont des **gaps fonctionnels déjà documentés**, pas des erreurs de doc.

1. **Aucune dérive « purgé/404 ».** Les 10 endpoints clés re-testés (2026-06-09) répondent `401`/`405` = déployés. Diff symétrique : tout chemin `/observability/*` cité dans le vault ∈ les 38 chemins OpenAPI (pas de sur-déclaration). `deprecated=True` = 0 sur les 38.
2. **OBS-P2-01 (gate inconsistency)** — `POST /budgets`, `POST /slo`, `POST /alerts/{id}/ack` n'ont que `require_module` alors que leurs frères FinOps (`PUT/DELETE`) portent `require_accountadmin_role`+`_RM_ACTION`. ⚠️ Le re-test `401` **ne valide pas** ce point (le 401 précède le contrôle de rôle) — constat **lecture de code** uniquement.
3. **FinOps writes routés mais UI non montée** — `cost/monitors` + `budgets` CRUD : services FE existent (`index.ts:511-599`), aucun ActionRail/modal ne les monte (`gaps/observability.md:73-74`).
4. **Acks & SLO sans surface** — `POST /alerts/{id}/ack` et `POST /slo` n'ont ni bouton ni wrapper FE ; `slo-tracking` ne relit pas les SLO définis.
5. **`/dashboard` consolidé jamais appelé** — `getObservabilityDashboard` existe (`index.ts:434`) mais le hub s'assemble par section (optimisation perdue).
6. **`alerts/cross-module` ignore `days`** — le FE envoie `days` (`index.ts:410`) mais la route le jette (fenêtres hard-codées `router.py:1160,1182,1205,1229`).
7. **Empty-vs-timeout ambigu** — lineage/access-patterns rendent un graphe vide silencieux sur timeout ACCESS_HISTORY (`_empty_lineage_response`).

## 8. Propositions d'amélioration UX (PROPOSITIONS — pas d'édition de code)

1. **Monter les écritures FinOps** (headline MVP) — ajouter ActionRail + modal sur `/observability/budget` pour `createCostMonitor`/`createSpendBudget` (services déjà présents). Bénéfice : créer un garde-fou de coût sans quitter le produit (l'empty state actuel renvoie « créez-les dans Snowflake »).
2. **Bouton « Acquitter »** dans l'ActionRail d'alerte (`alerts/page.tsx:191-235`) branché sur `POST /alerts/{id}/ack` + wrapper FE manquant. Bénéfice : boucler le triage d'alertes dans l'UI.
3. **Formulaire « Ajouter un SLO »** sur `/observability/slo` branché sur `POST /slo`, et faire relire les SLO custom par `slo-tracking`. Bénéfice : SLO au-delà des 3 littéraux.
4. **CTA structuré sur recommandations & `suggested_action`** — rendre `recommendations[]`/`suggested_action` cliquables (bouton « Corriger ») désactivé via `useCanPerform`. ⚠️ **À conditionner à OBS-P2-01** : un gate client-only est unsafe tant que les POST n'ont pas de gate serveur admin (cf. vault §D).
5. **Affordance « timed out » explicite** sur lineage/access-patterns au lieu du canvas vide (distinguer « vide » de « timeout »). Bénéfice : honnêteté UX.
6. **Utiliser `GET /dashboard`** pour le 1er paint du hub (1 appel au lieu de N), garder le fallback par section. Bénéfice : moins d'appels Snowflake au mount.
7. **Normaliser `days` en filtre cohérent** (presets 7/30/90) partagé entre cartes — aligne sur la normalisation cache recommandée (vault §C). [trivial-safe]
8. **Badge de fraîcheur par carte** (probe `last_modified`) à côté du `FreshnessDisclaimer` global, pour signaler par-source si la donnée a bougé. Bénéfice : confiance dans des vues à 45 min–24 h de lag.

## 9. Plan de test fonctionnel

> Toutes les routes renvoient `401` sans token. Obtenir un JWT (login Data360), puis `-H "Authorization: Bearer $TOKEN"`. Rôle requis = module `observability` actif ; les écritures FinOps exigent **ACCOUNTADMIN** (gate primaire). Test authentifié non encore exécuté (compte Snowflake de test expiré).

```bash
BASE=https://<host>        # re-test structurel : IP directe + en-tête Host (détail privé)
H="-H Authorization:Bearer $TOKEN -H Content-Type:application/json"

# 1. Santé + KPIs (lecture — tout rôle avec module observability)
curl -s $H "$BASE/observability/kpis"                 # attendu 200 (401 sans token)
curl -s $H "$BASE/observability/security/posture"

# 2. FOCUS perf / query history
curl -s $H "$BASE/observability/performance/metrics?days=7"
curl -s $H "$BASE/observability/performance/slow-queries?days=7&threshold_seconds=60"
curl -s $H "$BASE/observability/activity/summary?days=7"

# 3. FOCUS coût / crédits / stockage
curl -s $H "$BASE/observability/cost/warehouse-usage?days=30"
curl -s $H "$BASE/observability/cost/daily-credits?days=30"
curl -s $H "$BASE/observability/cost/storage"
curl -s $H "$BASE/observability/cost/monitors"

# 4. FOCUS alertes + SLO
curl -s $H "$BASE/observability/alerts?days=7"
curl -s $H "$BASE/observability/alerts/cross-module"
curl -s $H "$BASE/observability/slo-tracking?days=30"

# 5. Conformité + Trust Center
curl -s $H "$BASE/observability/compliance/gdpr"
curl -s $H "$BASE/observability/compliance/soc2"
curl -s $H "$BASE/observability/trust-center/findings"

# 6. Écritures FinOps — rôle ACCOUNTADMIN requis (sinon 403 attendu)
curl -s $H -X POST "$BASE/observability/cost/monitors" \
  -d '{"name":"WH_GUARD","credit_quota":100,"frequency":"MONTHLY","triggers":[{"percent":90,"action":"SUSPEND"}]}'
curl -s $H -X POST "$BASE/observability/budgets" \
  -d '{"name":"team_budget","monthly_credit_limit":500,"alert_at_pct":90}'   # ⚠ gate admin manquant (OBS-P2-01)
curl -s $H -X DELETE "$BASE/observability/cost/monitors/WH_GUARD?confirm=true"

# 7. Acks / SLO custom (gate admin manquant — OBS-P2-01)
curl -s $H -X POST "$BASE/observability/alerts/<ALERT_ID>/ack"
curl -s $H -X POST "$BASE/observability/slo" \
  -d '{"name":"api_p95","metric":"p95_latency_ms","target":60,"window":"7d"}'

# 8. Probes fraîcheur (DQ, sans lag)
curl -s $H "$BASE/observability/probes/table?table=CP_DATA360.PUBLIC.PROJECTS"
curl -s $H -X POST "$BASE/observability/probes/batch-check" -d '{"tables":[...]}'
```

**Résultats attendus** :
- Sans token → **401 AUTH_REQUIRED** sur les 43 ops (contrat RBAC vérifié au sweep). Verbe non monté → **405** (ex. `POST /performance/metrics`, `GET /slo`).
- Écriture FinOps sans ACCOUNTADMIN → **403** attendu sur `cost/monitors`+`budgets/{name}` (`PUT/DELETE`). ⚠️ `POST /budgets`·`POST /slo`·`POST /alerts/{id}/ack` ne renverront **pas** 403 par manque de gate admin (bug OBS-P2-01 à confirmer en authentifié).
- `GET /cost/monitors` après un `POST /cost/monitors` → monitor visible (route **non cachée** par design).
- `days` hors bornes (ex. `?days=0` ou `>30`) → **422** (validation FastAPI `ge/le`).

> Vérifié 2026-06-09 : 43 endpoints vérifiés (slice observability.md + cross-check OpenAPI), 0 inventés corrigés, 5 claims UI vérifiés (index.tsx:67-72, :1360, health-overview-tab.tsx:55-69, :158-163, :182), live-retest OK (GET /performance/metrics 401, GET /alerts 401, GET /slo-tracking 401). Aucun secret/IP dans le vault. FOCUS couvert : perf P50/P95/P99, query history, coût/crédits/stockage, alertes, SLO, activité/summary. cache_decorators.py:210 et :431 confirmés exacts.
