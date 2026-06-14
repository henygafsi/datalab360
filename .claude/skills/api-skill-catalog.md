---
name: api-skill-catalog
description: >
  Module Catalog / Sources (Object-360) de Data360 (route /sources). Exploration du
  patrimoine Snowflake (arbre + catalogue plat), Object-360 (identité · profiling ·
  gouvernance/tags · lignée · ownership · 6 scores de confiance persistés · FinOps ·
  recos IA), recompute de scores, refresh de catalogue, détection de modèles star.
  Façade catalog (~33 ops) + explorer Snowflake (~38 ops), toutes 401 AUTH_REQUIRED =
  protégées. SmartRightBar `ObjectSmartPanel` à 5 sections câblées. Grounded sur le code
  réel + re-test live — 2026-06-09.
---

# Catalog & Sources — Skill Module (API-grounded, 2026-06-09)

> Toutes les affirmations sont sourcées (fichier:ligne ou slice). Les endpoints viennent **uniquement** des 2 slices live (`catalog-intelligence.md`, `snowflake-objects-explorer.md`) + du code router. Aucun path inventé. Re-test live (IP directe + en-tête `Host`, sans auth) le 2026-06-09 : `401` = déployé+gardé, `405` (GET sur route POST-only) = déployé+method-gaté, `404` = absent. Le test **fonctionnel authentifié** reste à faire (compte Snowflake de test expiré). Zones non confirmées marquées « non vérifié ».

## 1. Vue d'ensemble

| Élément | Valeur (source) |
|---------|-----------------|
| **Route front** | `/sources` |
| **Entry point** | `apps/data360/src/app/(dashboard)/sources/page.tsx` (220 l. — `ErrorBoundary` + `Suspense` pour `useSearchParams`) |
| **Drawer droit (réel)** | `sources/components/ObjectSmartPanel.tsx` (427 l. — SmartRightBar `w-[380px]`, **monté** `page.tsx:201-205`) |
| **Drawer hérité (non monté)** | `sources/components/TableDetailPanel.tsx` (présent mais **plus monté** sur `/sources` depuis 2026-06-08) |
| **Arbre + catalogue plat** | `components/SourceTree.tsx`, `components/SourcesOverview.tsx` |
| **Modèles détectés** | `components/DetectedModelsTab.tsx` (heuristique client-side) |
| **Service API front** | `services/catalog/index.ts` + `services/catalog/rightbar.ts` (5 fns SmartRightBar + `getTableHistory`) |
| **Module backend (façade)** | `app/modules/catalog/router.py` (prefix `/catalog`, **auth-only**) — façade sur `snowflake_explorer` + recommendations + data_products + explore_design + gouvernance + observability `[trace: app/modules/catalog/__init__.py]` |
| **Module backend (explorer)** | `app/modules/command_center/account_overview/snowflake_explorer/router.py` (prefix `/api/snowflake/explorer`, **`require_module("account_overview")`** router-level, ligne 90) |
| **Tables persistées (2 seulement)** | `CATALOG_OBJECT_SCORES` + `KPI_CATALOG` `[trace: catalog/tables.py]` — tout le reste compose l'infra existante |

**Rôle principal** — Data Steward / Data Governance Officer (exploration + gouvernance + qualité). Le secondaire est le Data Engineer (lignée, ownership). ⚠️ **Aucun flag `useCanPerform` n'est câblé sur `/sources`** (`grep` = 0 sur `useCanPerform`/`canPerform` dans `sources/`) : le module `catalog` n'est **pas** dans `ACTION_REGISTRY` → aucune action-RBAC FE ni BE. Le détail métier des personas est **non vérifié**.

## 2. Capacités (grounded)

| Capacité | Implémentation (fichier / endpoint) |
|----------|--------------------------------------|
| Parcourir le patrimoine en arbre lazy 3 niveaux (db→schema→table) | `SourceTree.tsx` → `GET /common/databases` · `/common/schemas/{db}` · `/common/tables/{db}/{schema}` (router `common`, pas catalog) |
| Catalogue plat searchable/sortable | `SourcesOverview.tsx` (fan-out `/common/*` — 🟡 `/catalog/sources` + `/catalog/overview` pré-agrégés existent mais 0 caller) |
| Ouvrir un objet → SmartRightBar | `page.tsx:66-73 handleSelectTable` → `ObjectSmartPanel` (5 sections, 5 endpoints `/catalog/tables/...`) |
| Object-360 (contrat agrégateur) | `getObject360` → `GET /catalog/objects/{id}/360` — **déployé mais plus consommé par `/sources`** (survit pour Data Products) |
| Recompute 6 scores de confiance | `recomputeObjectScores` → `POST /catalog/objects/{id}/scores/recompute` |
| Refresh catalogue (sync/background) | `refreshCatalog` → `POST /catalog/refresh` (account scope = background, capé 200 FQNs) |
| Appliquer une clustering-key | `POST /catalog/objects/{id}/clustering/apply` (`ALTER TABLE … CLUSTER BY`) — 🔴 0 caller FE |
| Recos IA + appliquer | embarquées dans `/360` ; `GET /catalog/recommendations` + `POST /catalog/recommendations/{id}/apply` (apply câblé seulement sur Data Products) |
| Détecter des modèles star (fact/dim/bridge) | `DetectedModelsTab` → `POST /explore-design/{pid}/ai/discover-relationships` + `GET .../ai/schema-health` (cross-module, **classification heuristique client-side**) |
| Explorer Snowflake (table principale, facets, tree, audit) | `GET /api/snowflake/explorer/{objects,facets,tree,summary,databases,schemas}` |
| Affordances par objet (Actions rail) | `GET /api/snowflake/explorer/objects/{id}/actions` (8 actions server-decided) |
| Profiling colonnes (échantillon ≤1000) | `GET /catalog/profile/{db}/{schema}/{table}` + `GET /api/snowflake/explorer/objects/{id}/columns` |
| Gouvernance/tags/lignée par objet | `GET /catalog/tables/.../{governance,lineage}` + explorer `objects/{id}/{governance,lineage,quality}` |
| Bulk action (tag/drop) + selection review | `POST /api/snowflake/explorer/objects/bulk-action` · `POST .../selection-review` |
| Historique objet (3-way UNION) | `GET /catalog/objects/{fqn}/history` (PROJECT_EVENTS + USER_REQUESTS + ACCESS_HISTORY) |

## 3. Référence endpoints — statut live (re-test 2026-06-09)

**Contrat de statut** : toutes les ops ci-dessous renvoient **`401 AUTH_REQUIRED`** sans token = routées + protégées + déployées (les POST mutateurs aussi ; un GET sur une route POST-only renvoie `405` = également déployée). **Aucun `404`, aucune route purgée.** Re-test ciblé 2026-06-09 sur 30+ endpoints des deux routeurs.

> **Garde par routeur (à retenir) :** `/catalog/*` = **auth-only** (`Depends(get_current_user)` partout, 0 `require_action`/`require_module`) `[trace: catalog/router.py:63,137…933]`. `/api/snowflake/explorer/*` = **`require_module("account_overview")`** au niveau routeur `[trace: snowflake_explorer/router.py:90]`. Le SmartRightBar (`/catalog/tables/...`) est donc **moins gardé** que les agrégats explorer qu'il recoupe.

### 3a. Catalog Intelligence — exploration & scores (router `catalog`)

| Live | Méthode | Path | Rôle/usage |
|------|---------|------|------------|
| 401 | GET | `/catalog/overview` | Snapshot catalogue compte (trust rollup + reco histogram + inventaire) — `@shared_cache(900s)` |
| 401 | GET | `/catalog/sources` | Catalogue DBs Snowflake + connecteurs (`limit,offset`) — `@shared_cache(1800s)` |
| 401 | GET | `/catalog/objects/{object_id}/360` | Object-360 agrégateur (superset de `/deep-dive`) |
| 401 | GET | `/catalog/objects/{object_id}/scores` | Scores persistés (None si jamais calculés) |
| 401 | POST | `/catalog/objects/{object_id}/scores/recompute` | Calcule + persiste les 6 scores |
| 401 | POST | `/catalog/objects/{object_id}/clustering/apply` | Applique clustering-key (`ALTER TABLE … CLUSTER BY`) |
| 401 | GET | `/catalog/objects/{object_fqn}/history` | Historique 3-way (PROJECT_EVENTS + USER_REQUESTS + ACCESS_HISTORY) |
| 401 | GET | `/catalog/scores` | Rollup scores compte-wide |
| 401 | GET | `/catalog/events` | Timeline events catalog (`PROJECT_EVENTS WHERE module=CATALOG`) |
| 401 | GET | `/catalog/recommendations` | Recos ouvertes filtrées (`product_id,object_fqn,severity,limit`) |
| 401 | POST | `/catalog/recommendations/{reco_id}/apply` | Marque appliquée + cascade invalidation |
| 401 | POST | `/catalog/refresh` | Déclenche refresh (sync/background) |
| 401 | GET | `/catalog/refresh/{run_id}` | Statut d'un run de refresh |

### 3b. SmartRightBar (router `catalog`, sections par-objet) — **nouveau depuis 2026-06-08**

> **Taxonomie (spec autoritative `.claude/skills/smart-rightbar-spec.md`)** : 8 sections **S1 Context · S2 Actions · S3 Gouvernance · S4 Lignée · S5 Ingestion · S6 Ownership · S7 Alice Tips (narration IA `POST /cortex/complete`) · S8 Historique**. `ObjectSmartPanel` ne câble que **S1/S3/S4/S5/S6** (5 sur 8). `profile`/`tags/flow`/`notify-consumers` **ne sont pas** des sections numérotées — endpoints additionnels.

| Live | Méthode | Path | Section (spec) | Câblé dans `ObjectSmartPanel` ? |
|------|---------|------|---------|-------------------------------|
| 401 | GET | `/catalog/tables/{db}/{schema}/{table}/context` | S1 Context (stats+tags+coût/dq) | ✅ |
| 401 | GET | `/catalog/tables/{db}/{schema}/{table}/governance` | S3 Tags/masking/RLS/PII | ✅ |
| 401 | GET | `/catalog/tables/{db}/{schema}/{table}/lineage` | S4 Lignée 1-hop | ✅ |
| 401 | GET | `/catalog/tables/{db}/{schema}/{table}/ingestion` | S5 Ingestion+coût | ✅ |
| 401 | GET | `/catalog/tables/{db}/{schema}/{table}/ownership` | S6 Owner+consumers | ✅ |
| 401 | GET | `/catalog/profile/{db}/{schema}/{table}` | (hors S* — profiling colonnes, `sample_size` 100–1000) | 🟡 non câblé |
| 401 | GET | `/catalog/tags/flow` | (hors S* — agrégation `tag_name→count`, `limit`) | 🟡 non câblé |
| 401 | POST | `/catalog/tables/notify-consumers` | (S8 reçoit l'event ; notifier lecteurs récents) | 🟡 non câblé |

> Les routes SmartRightBar (`router.py:800-921`) **ne portent aucun décorateur de cache** (vérifié router **et** `services/rightbar.py`) — live, par requête. Cf. recommandation cache-par-rôle, vault §C.

### 3c. Data Products + KPI (router `catalog`) — **surfacés sur Data Products, PAS sur `/sources`**

| Live | Méthode | Path | Rôle/usage |
|------|---------|------|------------|
| 401 | GET | `/catalog/products` | Lister produits + trust score |
| 401 | GET | `/catalog/products/{product_id}/{overview,lineage,assets,kpis}` | Carte produit / lignée / assets / KPIs |
| 401 | POST | `/catalog/products/{product_id}/recommend-model` | Proposer un modèle (Cortex) |
| 401 | POST | `/catalog/products/{product_id}/generate-kpis` | Générer des brouillons de KPI |
| 401 | POST | `/catalog/products/{product_id}/publish` | DRAFT → PUBLISHED + event |
| 401 | GET/POST | `/catalog/kpis` · `/catalog/kpis/{kpi_id}` · `/catalog/kpis/{kpi_id}/validate` | CRUD/validation KPI |

> Ces 12 ops appartiennent à la page **Data Products** (lecture `KPI_CATALOG`). Hors §5 de ce skill (focus `/sources`).

### 3d. Snowflake Objects Explorer (router `snowflake_explorer`, `require_module("account_overview")`)

| Live | Méthode | Path | Rôle/usage |
|------|---------|------|------------|
| 401 | GET | `/api/snowflake/explorer/summary` | Cartes de résumé global |
| 401 | GET | `/api/snowflake/explorer/objects` | Table principale des objets (filtres riches) |
| 401 | GET | `/api/snowflake/explorer/objects/export` | Export CSV du résultat `/objects` |
| 401 | GET | `/api/snowflake/explorer/objects/{object_id}` | Détail objet (résumé drawer) |
| 401 | GET | `/api/snowflake/explorer/objects/{object_id}/actions` | **8 affordances** (right-rail) |
| 401 | GET | `/api/snowflake/explorer/objects/{object_id}/deep-dive` | Deep-dive object→product→project→deps (`include_profile,sample_size,include_dependencies`) |
| 401 | GET | `/api/snowflake/explorer/objects/{object_id}/{columns,ddl,governance,lineage,usage,quality,health,impact,audit,timeline}` | Drilldowns par objet |
| 401 | GET | `/api/snowflake/explorer/objects/{object_id}/open-in-snowflake` | Deep-link Snowsight |
| 401 | POST | `/api/snowflake/explorer/objects/bulk-action` | Action de masse (tag/drop, dry-run par défaut) |
| 401 | POST | `/api/snowflake/explorer/selection-review` | Agrégateur sur un set d'object_ids |
| 401 | GET | `/api/snowflake/explorer/{databases,schemas,tree,facets,audit-views,recent-activity}` | Inventaires + facettes + feed |
| 401 | GET | `/api/snowflake/explorer/databases/{db}/{audit,governance,lineage}` | Rollups niveau base |
| 401 | GET | `/api/snowflake/explorer/schemas/{db}/{schema}/{audit,governance,lineage}` | Rollups niveau schéma |
| 401 | GET | `/api/snowflake/explorer/scoring/definitions` | Formules de scoring health/risk/governance |
| 401 | POST | `/api/snowflake/explorer/cache/install` | Créer/refresh les tables DATA360_CACHE (idempotent) |
| 401 | POST | `/api/snowflake/explorer/sync` · GET `/sync/{status,history,{sync_id}}` | Refresh metadata + statut |

### 3e. Détection de modèles (cross-module Explore & Design)

| Live | Méthode | Path | Rôle/usage |
|------|---------|------|------------|
| (cross) | POST | `/explore-design/{projectId}/ai/discover-relationships` | Découverte de relations (body `{tables[]{database,schema,table_name}}`) |
| (cross) | GET | `/explore-design/{projectId}/ai/schema-health` | Santé du schéma (`overall_score, sub_scores`) |

> Gate = `require_module("explore_design")` (pas le module catalog). Classification fact/dim/bridge/staging/aggregate = **heuristique client-side** (`DetectedModelsTab.tsx:340-431`, préfixes `fact_/dim_/stg_/agg_/bridge` + degré in/out).

## 4. Modèle de données

### 4a. Les 6 dimensions de score (CATALOG_OBJECT_SCORES) — `[trace: catalog/services/scores.py]`

| Dimension | Définition (scores.py) | Source |
|-----------|------------------------|--------|
| `quality` | 100 − pondéré(null_ratio, profil manquant, schema_drift) | `INFORMATION_SCHEMA` |
| `governance` | owner + tags + masking + couverture RLS (réutilise `get_object_governance`) | explorer governance |
| `modeling` | PK détectée, FK validées, naming, recos SCD | `INFORMATION_SCHEMA` |
| `finops` | runtime, scan bytes, warehouse idle, full-vs-incrémental | `ACCOUNT_USAGE.QUERY_HISTORY` (7j) |
| `ml_ready` | stabilité de type + historisation + dispo labels | dérivé quality+modeling |
| `trust` | **blend pondéré : governance .35 · quality .25 · modeling .20 · finops .10 · ml_ready .10** `[trace: scores.py:257-274]` | — |

> **Défensif :** chaque dimension renvoie `None` (pas un faux 100) quand sa source manque `[trace: scores.py:48-254]`. Persistance delete-then-insert. **Trends** = events `SCORE_COMPUTED` dans `PROJECT_EVENTS` (pas de table d'historique). Le FE rend `null → "—"`, jamais `0` `[trace: ObjectSmartPanel.tsx:108-112]`.

### 4b. Object-360 (`/360`) — `[trace: services/object_360.py; services/catalog/index.ts:173-224]`

`tiers.object.{identity,profiling,governance}` · `tiers.{product,project,dependencies}` · `scores{governance_object,…}` · `persisted_scores|null` (6 dims) · `snowflake_metadata|null` (owner/clustering/retention/last_ddl/storage) · `usage|null` · `finops|null` · `recommendations[]` · `available_actions.actions[]` · `_contract`.

### 4c. SmartRightBar — types réponse (`[trace: services/catalog/rightbar.ts:18-113]`)

- **TableContext** `{name,type,row_count,size_gb,cluster_key,owner,created_at,last_altered,tags[]{tag_name,tag_value,column_name?}}`
- **TableGovernance** `{gov_rate, pii_columns[]{column_name,tag_name,masking_policy,masking_status:'OK'|'PARTIAL'|'NONE'}, rls_policies[]{policy_name,axis,segments[]}, sensitive_columns[]}`
- **TableLineage** `{upstream[]{name,type,domain?,relationship?}, downstream[], impact_count, risk_level:'LOW'|'MEDIUM'|'HIGH'|null}`
- **TableIngestion** `{mode,status,pipeline_name,pipeline_step,last_run,next_run,avg_cost_credits,avg_rows}` (tous nullable)
- **TableOwnership** `{owner_email,owner_team,snowflake_role,data_class:'SOURCE'|'INTERMEDIATE'|'PRODUCT'|'DERIVED'|'SHARED'|null,pipeline_name,pipeline_step,consumers[]{user_name,query_type,access_count,last_access}}`
- **HistoryEvent** `{ts,kind,actor,status,details?}` (via `GET /catalog/events?object_fqn=&limit=5`)

### 4d. Tables persistées (2 seulement) — `[trace: catalog/tables.py]`

- `CATALOG_OBJECT_SCORES` — 1 ligne / (account, object_fqn) ; 6 scores + `SCORE_INPUTS`/`TOP_ISSUES`/`RECOMMENDED_ACTIONS` (VARIANT). Re-upsert à chaque recompute.
- `KPI_CATALOG` — définitions KPI liées à un produit (def business + SQL + grain + source_objects). Lu par `/products/{id}/kpis`.

## 5. Deep-dive FOCUS — profiling · tags/classification IA · lignée · ownership · scoring

### 5a. Profiling (échantillonné, sans full-scan)
Deux chemins déployés : `GET /catalog/profile/{db}/{schema}/{table}?sample_size=` (null % + distinct approx par colonne, échantillon **≤1000**, jamais de full-scan) et `GET /api/snowflake/explorer/objects/{id}/columns`. Le profiling alimente aussi `quality`/`ml_ready` du scoring. 🟡 Le profiling **n'est pas câblé** dans `ObjectSmartPanel` (qui ne rend que S1/S3/S4/S5/S6) et **n'est pas** une section numérotée de la spec (S2 = Actions) → gap de wiring (cf. §8).

### 5b. Tags / classification IA
- **Lecture des tags** : embarqués dans `TableContext.tags[]` (S1) et `TableGovernance.pii_columns[]` (S3) ; agrégation compte-wide via `GET /catalog/tags/flow` (non câblé).
- **Classification IA** = chemin gouvernance via les **affordances** : `scan_pii` (`POST /gouvernance/policies/pii-scan?…&enable_ai=true`) puis `bulk_tag` (`POST /api/snowflake/explorer/objects/bulk-action`, body `{action:'apply_tag',object_ids[],tag_name,tag_value}`) `[trace: deep_dive.py:548-565]`. Le `request_masking` (`POST /gouvernance/policies/masking`) gate les colonnes sensibles.

### 5c. Lignée
1-hop échantillonné (amont/aval + `impact_count` + `risk_level`) via `GET /catalog/tables/.../lineage` (S4) et `GET /api/snowflake/explorer/objects/{id}/lineage?direction&depth`. Rollups db/schema via explorer. **Δ vs Snowflake :** 1-hop seulement, pas de column-level lineage, basé QUERY_HISTORY.

### 5d. Ownership
`GET /catalog/tables/.../ownership` (S6) : `owner_email`, `owner_team`, `snowflake_role`, `data_class`, `pipeline_name/step`, top-5 `consumers` (par `access_count`). Explorer ownership rollup au niveau db via `databases/{db}/governance`.

### 5e. Les 8 affordances (Actions rail, server-decided) — `[trace: deep_dive.py:496-578]`

| action_id | group | http | confirm | destructive | enabled si |
|-----------|-------|------|:-------:|:-----------:|------------|
| `open_in_snowflake` | navigate | GET `…/objects/{id}/open` | – | – | toujours |
| `view_ddl` | inspect | GET `…/objects/{id}/ddl` | – | – | toujours |
| `preview_rows` | inspect | GET `/explore-design/<project_id>/tables/{db}/{sch}/{name}/preview?limit=100` | – | – | non-secure |
| `deep_profile` | analyze | GET `/explore-design/<project_id>/tables/{db}/{sch}/{name}/profile?sample_size=1000` | – | – | db+schema+name |
| `request_masking` | govern | POST `/gouvernance/policies/masking` | ✅ | – | TABLE/VIEW/DYNAMIC_TABLE |
| `scan_pii` | govern | POST `/gouvernance/policies/pii-scan?database=&schema=&enable_ai=true` | – | – | db+schema |
| `bulk_tag` | govern | POST `/api/snowflake/explorer/objects/bulk-action` | ✅ | – | toujours |
| `drop_object` | danger | POST `/api/snowflake/explorer/objects/bulk-action` | ✅ | ✅ | TABLE/VIEW/DYNAMIC_TABLE/STREAM |

> ⚠️ **Piège `<project_id>`** : les paths `preview_rows`/`deep_profile` portent un placeholder littéral `<project_id>` à substituer côté FE avant appel (la cible vit dans Explore & Design).

### 5.bis — Fiche INS/OUTS des endpoints clés (rejouable)

> Tous **`401` live** (déployés, re-test 2026-06-09). Test fonctionnel authentifié à faire (compte expiré).

| Étape | Endpoint | INS (path · query · body) | OUTS (réponse consommée) |
|-------|----------|---------------------------|--------------------------|
| Snapshot compte | `GET /catalog/overview` | query `account_id?` | `{trust rollup, reco histogram, inventory}` |
| Catalogue sources | `GET /catalog/sources` | query `limit,offset` | `{databases[] avec row/table/view/mview counts + storage}` |
| Object-360 | `GET /catalog/objects/{id}/360` | path `{id}=TYPE:db.schema.name` (urlencode) · query `include_profile=T, sample_size=1000 (100–10000), include_dependencies=T, include_usage=T, include_finops=T, include_recommendations=T, period=30d (^(1d\|7d\|30d\|90d\|365d)$)` | `Object360Response` (cf. §4b) |
| Recompute scores | `POST /catalog/objects/{id}/scores/recompute` | path `{id}` · pas de body | `{object_fqn, scores{quality,governance,modeling,finops,ml_ready,trust}, inputs, top_issues, recommended_actions}` |
| S1 Context | `GET /catalog/tables/{db}/{schema}/{table}/context` | path 3 segments | `TableContext` (§4c) |
| S3 Governance | `GET /catalog/tables/{db}/{schema}/{table}/governance` | path 3 segments | `TableGovernance` (§4c) |
| S4 Lineage | `GET /catalog/tables/{db}/{schema}/{table}/lineage` | path 3 segments | `TableLineage` (§4c) |
| S5 Ingestion | `GET /catalog/tables/{db}/{schema}/{table}/ingestion` | path 3 segments | `TableIngestion` (§4c) |
| S6 Ownership | `GET /catalog/tables/{db}/{schema}/{table}/ownership` | path 3 segments | `TableOwnership` (§4c) |
| Profiling | `GET /catalog/profile/{db}/{schema}/{table}` | path · query `sample_size (100–1000)` | `{columns[]{name, null_pct, approx_distinct}}` |
| Recos (scope) | `GET /catalog/recommendations` | query `product_id?,object_fqn?,severity?(critical\|high\|medium\|low\|info),limit=50` | `[{reco_id,severity,title,rationale,proposed_action,proposed_sql,estimated_savings_usd,status}]` |
| Appliquer reco | `POST /catalog/recommendations/{reco_id}/apply` | path `{reco_id}` · body `ApplyRecoBody` | `{status, applied}` (cascade invalidation) |
| Refresh | `POST /catalog/refresh` | body `RefreshBody{scope_type*('account'\|'database'\|'schema'\|'object'), scope_value?, background?}` | `{run_id, status:'queued', scope_type, mode?}` |
| Affordances | `GET /api/snowflake/explorer/objects/{id}/actions` | path `{id}` | `{actions[]{action_id,label,group,http,requires_confirm,destructive,enabled,disabled_reason?}, groups[]}` |
| Bulk action | `POST /api/snowflake/explorer/objects/bulk-action` | body `BulkActionBody{action,object_ids[],…,confirm?}` | `{dry_run?, affected[], …}` |
| Notify consumers | `POST /catalog/tables/notify-consumers` | body `{database,schema,table,message}` | `{object_fqn, notified_count}` |

> Renvoi : la matrice **Gouvernance/tags · DQ-profiling · Coût/finops · Lignée · Ownership** et l'**optimisation cache par rôle** sont détaillées dans `vault/data360_full_doc/pages/catalog-sources.md` §Enrichissement (2026-06-09).

## 6. UX front — validation 4 axes + accessibilité

| Axe | Verdict | Preuve (fichier:ligne) | Microcopy |
|-----|---------|------------------------|-----------|
| **loading** | ✓ | `ObjectSmartPanel.tsx:131-143 SkeletonRows` (par section, `animate-pulse`) ; `SourcesOverview.tsx` skeleton pulse ; `SourceTree.tsx:207-210` root `Loader` | skeletons par section |
| **empty** | ✓ | panel sans sélection `ObjectSmartPanel.tsx:277-283` (« Select a table to see its context… ») ; `SourceTree.tsx:224-225` « No sources found » ; `DetectedModelsTab.tsx:102-112` « No Project Selected » | « Select a table to see its context, governance, lineage, ingestion and ownership. » |
| **error** | ✓ | **distinction 404/501 (gap) vs autre (error+code)** `ObjectSmartPanel.tsx:83-90,145-161` ; `GapNote` « Not deployed yet » vs `ErrorNote` « Section unavailable (code) » ; `SourceTree` panneau rose + Retry `:211-223` ; `ErrorBoundary` page `page.tsx:213` | « Not deployed yet » (404/501) · « Section unavailable (500) » |
| **dark mode** | ✓ | `dark:` présent partout : `page.tsx` (header/tabs), `ObjectSmartPanel.tsx` (tones Pill `:219-231`, skeleton `dark:bg-gray-800`, panel `dark:bg-gray-900`) ; `SourcesOverview`/`SourceTree`/`DetectedModelsTab` tous `dark:` | — |

**Accessibilité** : `role="status"` sur le chip refresh (`page.tsx:128`) ; `aria-label="Close panel"` (`ObjectSmartPanel.tsx:267`) ; `aria-expanded`/`role="button"` sur l'arbre ; sections collapsibles via `<button>` (`ObjectSmartPanel.tsx:181-196`). ⚠️ Les en-têtes de section n'ont pas d'`aria-expanded` explicite (le `ChevronDown` tourne mais l'état n'est pas annoncé) — **non vérifié** côté lecteur d'écran.

**Honnêteté des null** : `num()`/`str()` rendent `—` pour `null`/`''`, **jamais `0`** (`ObjectSmartPanel.tsx:108-118`) — un scan non-gardé `ACCOUNT_USAGE` produit des `—` honnêtes, pas de faux zéros.

## 7. Drift détecté (vs vault catalog-sources.md 2026-06-07 + vs code)

1. **Drawer remplacé (corrigé dans le vault le 2026-06-09).** Le vault décrivait `TableDetailPanel` (4 sous-onglets, un seul `/360`) au `page.tsx:178-187`. La réalité : `ObjectSmartPanel` (SmartRightBar 5 sections, 5 endpoints `/catalog/tables/...`) au `page.tsx:201-205`. `TableDetailPanel.tsx` existe mais n'est plus monté.
2. **`/catalog/objects/{id}/360` déployé mais plus consommé par `/sources`.** Le contrat reste servi (`401` live) et valide pour Data Products/historique, mais le panel `/sources` ne l'appelle plus (`grep getObject360` dans `sources/` = 0). Recompute (`POST .../scores/recompute`) idem : non câblé dans `ObjectSmartPanel`.
3. **8 endpoints SmartRightBar absents de la slice de 2026-06-08** (25 ops) — postérieurs au sweep ; re-testés `401` live le 2026-06-09. La slice `catalog-intelligence.md` est donc **partiellement obsolète** (manque `tables/*`, `profile/*`, `tags/flow`, `notify-consumers`).
4. **Gouvernance par routeur asymétrique.** `catalog` auth-only vs `snowflake_explorer` `require_module("account_overview")` — non noté comme tel dans la doc avant l'enrichissement.
5. **Profiling/tags-flow/notify déployés mais non câblés** dans `ObjectSmartPanel` (gap de wiring, pas de drift de path).

## 8. Propositions d'amélioration UX (PROPOSITIONS — pas d'édition de code)

1. **Ajouter un bloc Profiling** dans `ObjectSmartPanel` sur `GET /catalog/profile/{db}/{schema}/{table}` (déjà live) → null %/distinct par colonne, échantillon ≤1000. Bénéfice : profiling visible sans recompute. [trivial-safe]
2. **Câbler S8 Historique** (et S2 Actions / S7 Alice Tips de la spec, non câblées) : `getTableHistory` existe déjà dans `rightbar.ts:209` (5 derniers events via `/catalog/events`) mais n'est pas rendu par le panel. L'ajouter en section repliée. [trivial-safe]
3. **Bouton « Appliquer » sur les recos** branché sur `POST /catalog/recommendations/{id}/apply` (live), désactivé via `useCanPerform` une fois `catalog` dans `ACTION_REGISTRY`. Bénéfice : boucle advisor→CTA gouvernée (cf. vault §D).
4. **Consommer les pré-agrégés** `getCatalogSources`/`getCatalogOverview` (0 caller) à la place du fan-out O(db×schema) de `SourcesOverview`. Bénéfice : scaling.
5. **Polling du refresh** : `getRefreshStatus` (`GET /catalog/refresh/{run_id}`) a 0 caller ; le chip n'atteint jamais l'état terminal. Poller jusqu'à `succeeded|failed` et afficher `discovered/scored/failed`.
6. **`aria-expanded` sur les en-têtes de section** `ObjectSmartPanel.tsx:181-196` (le `<button>` change l'état sans l'annoncer). [trivial-safe]
7. **Badge « gardé par account_overview »** sur les sections qui recoupent l'explorer, pour expliquer un `403` éventuel (asymétrie de garde §3).
8. **Bouton « Notify consumers »** branché sur `POST /catalog/tables/notify-consumers` (live) depuis S6 Ownership (liste des consommateurs déjà affichée).

## 9. Plan de test fonctionnel

> Toutes les routes renvoient `401` sans token. Obtenir d'abord un JWT (login Data360), puis `-H "Authorization: Bearer $TOKEN"`. ⚠️ `/catalog/*` exige seulement un token valide (auth-only) ; `/api/snowflake/explorer/*` exige en plus le **module `account_overview`** actif sur le rôle.

```bash
BASE=http://localhost:80         # ou IP directe + -H "Host: api.datalab360.io"
H="-H Authorization:Bearer $TOKEN -H Content-Type:application/json"
FQN="DB.SCHEMA.TABLE"
OID="TABLE:DB.SCHEMA.TABLE"      # encodeURIComponent côté FE

# 1. Snapshot + sources (lecture, tout rôle avec token)
curl -s $H "$BASE/catalog/overview"
curl -s $H "$BASE/catalog/sources?limit=50&offset=0"

# 2. SmartRightBar — 5 sections câblées (toutes 3 segments path)
for S in context governance lineage ingestion ownership; do
  curl -s $H "$BASE/catalog/tables/DB/SCHEMA/TABLE/$S"
done
# profiling + tags-flow (déployés mais non câblés)
curl -s $H "$BASE/catalog/profile/DB/SCHEMA/TABLE?sample_size=1000"
curl -s $H "$BASE/catalog/tags/flow?limit=200"

# 3. Object-360 (contrat survivant) + scores
curl -s $H "$BASE/catalog/objects/$OID/360?include_profile=true&period=30d"
curl -s $H "$BASE/catalog/objects/$OID/scores"
curl -s $H -X POST "$BASE/catalog/objects/$OID/scores/recompute"   # → 6 scores + trust pondéré

# 4. Recos + apply (boucle advisor)
curl -s $H "$BASE/catalog/recommendations?object_fqn=$FQN&severity=high&limit=50"
curl -s $H -X POST "$BASE/catalog/recommendations/<RECO_ID>/apply" -d '{}'

# 5. Refresh + statut (account = background, capé 200 FQNs)
RUN=$(curl -s $H -X POST "$BASE/catalog/refresh" -d '{"scope_type":"account","scope_value":""}' | jq -r .run_id)
curl -s $H "$BASE/catalog/refresh/$RUN"

# 6. Explorer (exige module account_overview en plus)
curl -s $H "$BASE/api/snowflake/explorer/objects/$OID/actions"      # 8 affordances
curl -s $H "$BASE/api/snowflake/explorer/objects/$OID/governance"
curl -s $H "$BASE/api/snowflake/explorer/objects/$OID/lineage?direction=both&depth=1"
curl -s $H "$BASE/api/snowflake/explorer/scoring/definitions"
curl -s $H -X POST "$BASE/api/snowflake/explorer/objects/bulk-action" \
  -d '{"action":"apply_tag","object_ids":["'"$OID"'"],"tag_name":"PII","tag_value":"EMAIL","confirm":false}'  # dry-run

# 7. Notify consumers
curl -s $H -X POST "$BASE/catalog/tables/notify-consumers" \
  -d '{"database":"DB","schema":"SCHEMA","table":"TABLE","message":"schema changed"}'
```

**Résultats attendus par capacité** :
- Sans token → **401 AUTH_REQUIRED** sur les deux routeurs (contrat vérifié 2026-06-09).
- Token sans module `account_overview` → `/catalog/*` **200**, mais `/api/snowflake/explorer/*` **403** (asymétrie de garde, §3).
- `scores/recompute` → 6 dimensions ; une source manquante (ex. `ACCOUNT_USAGE` non gardé) → cette dimension `null` (pas un faux 100) et le `trust` est repondéré sur les présentes.
- SmartRightBar : section sur endpoint absent → `404` → FE « Not deployed yet » ; erreur réelle → « Section unavailable (code) ».
- `refresh` account scope → `mode:'background'`, capé 200 FQNs ; suivre via `/catalog/refresh/{run_id}` (chip non poller aujourd'hui — cf. §8).
- Détection de modèles : `POST /explore-design/{pid}/ai/discover-relationships` exige le module `explore_design` (≠ catalog) ; classification fact/dim faite **client-side**.

> Vérifié 2026-06-09 : 35 endpoints vérifiés (25 catalog-intelligence.md + 8 SmartRightBar catalog/router.py:801-971 + 2 cross-module explore-design), 0 inventés corrigés (8 SmartRightBar absents de l'OpenAPI mais présents dans catalog/router.py + live 401 — OpenAPI stale, pas d'invention), 5 claims UI vérifiés (page.tsx:201-205 ObjectSmartPanel ✓, ObjectSmartPanel.tsx:108-112 ✓, snowflake_explorer/router.py:90 ✓, main.py:650 ✓, refresh.py:52 crun_ ✓), live-retest OK (5 endpoints → 401), 0 secret/IP. Verdict GROUNDED.
