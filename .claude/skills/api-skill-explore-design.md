---
name: api-skill-explore-design
description: >
  Module Explore & Design de Data360 (route /explore-design). Canvas modeling (catalog↔modeling)
  + cycle de vie draft→DDL queue→deploy gardé (pre-check→dry-run→impact→sql-diff→execute→verify)
  + wizard guidé "mapping" + objets DE first-class (dynamic-tables/streams/tasks/event/hybrid/alerts)
  + suite AI advisor (copilote schéma, coût, risque déploiement) + ingestion versionnée + glossaire.
  170 endpoints live (111 module + 44 lifecycle + 15 guided, tous 401 AUTH_REQUIRED = protégés ;
  7 ops deprecated=True mais DÉPLOYÉES). Rôle principal : Data Modeler. Grounded sur le code réel,
  slices live + OpenAPI + re-test live 2026-06-09.
---

# Explore & Design — Skill Module (API-grounded, 2026-06-09)

> Toutes les affirmations sont sourcées (fichier:ligne, slice live, ou OpenAPI). Les endpoints viennent **uniquement** des 3 slices live (`explore-design-module.md`, `-lifecycle.md`, `-guided-wizard.md`) et de `openapi.json`. Aucun path inventé. Les zones non confirmées sont marquées « non vérifié ».

## 1. Vue d'ensemble

| Élément | Valeur (source) |
|---------|-----------------|
| **Route front** | `/explore-design` (+ entrée wizard `/mapping` → `/explore-design/guided/*`) |
| **Entry point** | `apps/data360/src/app/(dashboard)/explore-design/page.tsx` (**5159 l.**) |
| **Toggle de vue** | `viewMode: 'catalog' \| 'modeling'` persistant localStorage `[trace: page.tsx:137 type · :1048-1052 state+persist · :3177-3181 toggle]` |
| **Rail droit** | `components/ContextRightBar.tsx` (**1634 l.**) — `RightBarTab = 'actions'\|'ai'\|'quality'\|'deploy'\|'history'\|'help'` `[trace: ContextRightBar.tsx:22 · TABS :95-100]` |
| **Wizard de déploiement** | `components/deployment/*` (StepConfigure→PreChecks→DryRun→Impact→SqlDiff→Review→Deploy→Verify) |
| **Composants** | ~60 sous `components/` (modals DE-objects, panels ingestion/quality/deploy, ModelingCanvas, SourceMindMap) |
| **Service API front** | `services/explore-design/index.ts` (**4736 l.**) · `services/explore-design/de-objects.ts` (**411 l.**) · wrapper typé `services/api/exploreDesignApi.ts` (**1157 l.**) `[trace: page.tsx:45]` |
| **Module backend** | `app/modules/projects/explore_design/` — **3 routers** montés dans l'ordre `[trace: app/main.py:640-642]` : `router.py` (~111 routes : projet, DDL queue, preview/profile, ingestion, deployments, DE-objects, validation, suite AI, smart/embed, glossaire) · `lifecycle_router.py` (schema-clone, quick-deploy + schedules, scheduled-deployments, versions, lineage, ERD, events/conditions, compliance, export/import) · `guided_router.py` (prefix `/explore-design/guided`, wizard mapping récupéré) |

**Rôles** — la gouvernance backend est **module-only** : chaque route est gatée par `_require_module("explore_design")` (niveau router) `[trace: router.py:109 · lifecycle_router.py:76 · guided_router.py:88]`. **Aucun `require_action` n'est câblé** dans le module (le catalogue `module:page:tab:action` du vault est *intentionnel*). Seule exception : les writes glossaire portent `require_accountadmin_role` `[trace: router.py:2316,2350,2376]`. Côté FE, les flags de permission passent par `useCanPerform` (ex. toast « view-only access » `[trace: page.tsx:1218]`).

| Rôle (persona, non vérifié dans le code) | Réalité câblée (vérifiée) |
|---|---|
| Data Modeler / Data Engineer | accès complet via grant module `explore_design` |
| ACCOUNTADMIN | seul gate par rôle réel : writes glossaire (`require_accountadmin_role`) |
| Lecteur (view-only) | FE bloque les mutations + toast « view-only access » `[trace: page.tsx:1218]` (gate UX, pas backend) |

## 2. Capacités (grounded)

| Capacité | Implémentation (endpoint / fichier) |
|----------|--------------------------------------|
| Créer un projet explore-design | `POST /explore-design` (`ProjectCreate`) · `InlineProjectWizard.tsx` · `createExploreProject` `[trace: services/explore-design/index.ts:462]` |
| Toggle catalog ↔ modeling | `viewMode` `[trace: page.tsx:1048,3177]` |
| Explorer : preview / profile table·colonne | `GET /{id}/tables/{db}/{sch}/{tbl}/preview\|profile` + `…/columns/{col}/preview\|profile` ; POST variants `/table/preview`, `/column/profile` |
| Marquer sensible / exclure colonne | `POST /column/mark-sensitive` · `/column/exclude` (`SensitiveColumnModal`, `ColumnExclusionModal`) |
| AI-detect PK / FK · recherche sémantique | `GET /smart/detect-pk` · `/smart/detect-fk` · `POST /smart/semantic-search` · `/smart/embed` (Cortex EMBED_TEXT_768) |
| File d'attente DDL (add/list/remove) | `POST\|GET /{id}/ddl-actions` · `DELETE …/{event_id}` (PROJECT_EVENTS `DDL_ACTION` PENDING) |
| ERD (relationships, layout, auto-layout) | `POST\|DELETE /explore-design/projects/{id}/relationships[/{rid}]` · `GET\|PUT /explore-design/projects/{id}/erd` · `POST …/erd/auto-layout` — ⚠️ préfixe `/explore-design/` obligatoire `[vérifié 2026-06-09]` |
| Cascade rename/drop | `POST /{id}/cascade/rename` · `/cascade/drop` (`CascadeConfirmModal`) |
| Valider (FK-types, type-compat, conflits, chaîne d'events) | `POST /{id}/validate/fk-types` · `GET …/type-compatibility` · `POST /{id}/conflict-check` · `/validate-events` |
| Objets DE first-class | `POST\|GET\|PATCH\|DELETE /dynamic-tables` · `/streams` · `/tasks` · `/event-tables` · `/hybrid-tables` · `/alerts` (+ suspend/resume/refresh) — voir §4 |
| Ingestion (execute/schedule/operations/dry-run/quality) | `POST /{id}/ingestion/execute\|schedule\|operations\|dry-run\|quality-check` · watermarks |
| Suite AI advisor | `POST /{id}/ai/*` (classify, discover, health, copilote, coût, risque) + `GET …/feedback/stats`,`/savings` — voir §5 |
| Quality gates | `POST /{id}/quality-gates/run` (`QualityGatesPanel`) |
| Cycle de déploiement gardé | `POST /{id}/ddl-actions/pre-check\|dry-run\|execute` · `/{id}/dry-run\|full-dry-run\|impact-analysis\|sql-diff\|pre-deploy-checks\|post-verify` |
| Déploiement enregistré (record) | **canonique** `/projects/{id}/deployments*` · **déprécié mais live** `/explore-design/{id}/deployments*` |
| Quick deploy / schema-clone | `POST /{id}/deploy?version_id=` · `/schema-clone*` (preview/create/execute/rollback) |
| Schedule + scheduled-deployment lifecycle | `POST /{id}/schedule` · `GET /{id}/schedules` · `/scheduled-deployments/{sid}/{approve,reject,cancel,execute-now,reschedule,logs}` |
| Versions (list/compare/migration/promote) | `GET /{id}/versions` · `GET /versions/{from}/compare\|migration/{to}` · `POST /versions/{vid}/promote` |
| Wizard state · export/import | `GET\|PUT /{id}/state` · `GET /export/{id}` · `POST /import` |
| Glossaire métier | `GET /glossary` · `/glossary/lookup` · `POST /glossary[/ai-draft]` (admin) · `DELETE /glossary/{term}` (admin) |
| Wizard guidé « mapping » | `POST /guided/create_project` · `manage_table` · `add/remove-columns` · `primary-key` · `add-event` · `test_mapping` · `schedule_deployment` |
| Lineage de colonne | `GET /lineage/column` — **live mais sans UI** (orphelin, cf. §7) |

## 3. Référence endpoints (170 ops — statut live)

**Contrat de statut** : sweep `:80` 2026-06-08 → **les 170 ops renvoient `401 AUTH_REQUIRED`** = routes protégées (RBAC actif), donc enregistrées et déployées. Aucune route publique (200), aucun 404/500. Re-test live ciblé **2026-06-09** (GET, IP directe `+ Host`) : 9 GET clés → **9× `401`, 0× `404`**.

> ⚠️ **Drift `deprecated=True` ≠ supprimée.** L'OpenAPI déployé liste **150 chemins `explore-design`** dont **7 ops `deprecated=True`** : `GET\|POST /{id}/deployments`, `POST …/{dep}/{approve,reject,execute,cancel,verify}`. Elles **restent servies** (`GET /{id}/deployments` → `401` live, pas `404`). Le vault `explore-design.md` les marquait « DEPRECATED » ; corrigé en « dépréciée mais déployée » (cf. vault §Enrichissement A). Même piège que `workflow`.

### 3a. Cœur — projet, DDL queue, preview/profile (slice module)
| Live | Méthode | Path | Usage |
|---|---|---|---|
| 401 | POST | `/explore-design` | Créer projet (`ProjectCreate`) |
| 401 | GET | `/explore-design/{project_id}` | Détail projet |
| 401 | GET·POST·DELETE | `/{id}/ddl-actions[/{event_id}]` | File DDL (list / submit / remove) |
| 401 | POST | `/{id}/ddl-actions/dry-run` · `/pre-check` · `/execute` | Dry-run · pré-check · **apply canonique** |
| 401 | GET | `/{id}/tables/{db}/{sch}/{tbl}/preview` · `/profile` | Preview / profile table |
| 401 | GET | `/{id}/tables/{db}/{sch}/{tbl}/columns/{col}/preview` · `/profile` · `/ai/column-classification` | Preview / profile / classif colonne |
| 401 | POST | `/table/preview` · `/table/profile` · `/column/preview` · `/column/profile` | Variantes POST (lifecycle) |
| 401 | POST | `/column/mark-sensitive` · `/column/exclude` | Sensibilité / exclusion colonne |
| 401 | POST | `/primary-key/add` | Ajouter PK |
| 401 | GET | `/smart/detect-pk` · `/smart/detect-fk` | AI-detect PK / FK (query `table`*) |
| 401 | POST | `/smart/semantic-search` · `/smart/embed` | Recherche sémantique / embedding |
| 401 | POST | `/fetch_relationships` · `/{id}/conflict-check` · `/{id}/validate/fk-types` · `/{id}/validate-events` | Relations / conflits / validation |
| 401 | GET | `/{id}/validate/type-compatibility` · `/{id}/events/conflicts` | Compat types / conflits events |
| 401 | POST | `/{id}/cascade/rename` · `/{id}/cascade/drop` | Cascade vers events dépendants |
| 401 | POST | `/{id}/sql-diff` · `/{id}/impact-analysis[/enhanced]` · `/impact-analysis` | Diff SQL · impact (par projet / global) |
| 401 | GET·POST | `/{id}/events` · `/{id}/state(PUT)` | Timeline audit · wizard state |
| 401 | GET | `/{id}/versions` | Versions du projet |

### 3b. Ingestion (slice module)
| Live | Méthode | Path | Usage |
|---|---|---|---|
| 401 | POST | `/{id}/ingestion/execute` | Exécuter ingestion (`IngestionExecuteRequest`) |
| 401 | POST | `/{id}/ingestion/schedule` | Planifier (TASK Snowflake, `cron_choice`) |
| 401 | GET·POST | `/{id}/ingestion/operations[/{op}/execute\|rollback]` | Opérations versionnées (workflow d'approbation) |
| 401 | POST | `/{id}/ingestion/dry-run` · `/preview-sql` · `/sql-preview` · `/quality-check` | Aperçu / dry-run / gates |
| 401 | GET·POST | `/{id}/ingestion/runs` · `/ingestion/watermark[/reset]` · `/{id}/watermarks[/{src}]` | Runs · watermarks |

### 3c. Objets DE first-class (slice module) — voir §4 pour le catalogue
| Live | Famille | Paths |
|---|---|---|
| 401 | Dynamic tables | `GET\|POST /dynamic-tables` · `GET\|PATCH\|DELETE …/{name}` · `POST …/{name}/{refresh,resume,suspend}` |
| 401 | Streams | `GET\|POST /streams` · `GET\|DELETE …/{name}` · `GET …/{name}/data` |
| 401 | Tasks | `GET /tasks` · `GET\|PATCH\|DELETE …/{name}` · `POST …/{name}/{resume,suspend}` |
| 401 | Event tables | `GET\|POST /event-tables` · `DELETE …/{name}` |
| 401 | Hybrid tables | `GET\|POST /hybrid-tables` · `DELETE …/{name}` |
| 401 | Alerts | `GET\|POST /alerts` · `GET\|PATCH\|DELETE …/{name}` |

### 3d. Suite AI advisor (slice module) — voir §5
| Live | Méthode | Path (préfixe `/{id}/ai/`) | Coût |
|---|---|---|---|
| 401 | POST | `classify-columns` · `discover-relationships` · `schema-health` | Cortex |
| 401 | POST | `suggest-columns` · `recommend-scd` · `clustering-keys` · `materialization` · `ingestion-mode` | Cortex |
| 401 | POST | `check-naming` · `optimize-types` · `feedback` | **zero-cost** (Python pur) |
| 401 | POST | `warehouse-sizing` · `deploy-schedule` · `deployment-risk` | ACCOUNT_USAGE / PROJECT_EVENTS |
| 401 | GET | `feedback/stats` · `savings` | `@session_cache(600)` |

### 3e. Cycle de vie : deploy / schedule / versions / clone / lineage / ERD (slice lifecycle)
| Live | Méthode | Path | Usage |
|---|---|---|---|
| 401 | POST | `/{id}/deploy?version_id=` | Quick deploy immédiat |
| 401 | POST·GET | `/{id}/schedule` · `/{id}/schedules` | Planifier déploiement · lister |
| 401 | GET·POST | `/scheduled-deployments/{sid}[/approve\|reject\|cancel\|execute-now\|reschedule\|logs]` | Lifecycle déploiement planifié |
| 401 | GET | `/versions/{from}/compare/{to}` · `/migration/{to}` | Comparer · script de migration |
| 401 | POST | `/versions/{vid}/promote` | Promouvoir une version (DDL live cible) |
| 401 | POST·GET | `/schema-clone[/preview\|/list]` · `/{cid}/{execute,rollback,status}` | Clone zéro-copie |
| 401 | GET·PUT·POST | `/explore-design/projects/{id}/erd[/auto-layout]` · `/explore-design/projects/{id}/relationships[/{rid}]` | ERD layout + relations — ⚠️ préfixe `/explore-design/` obligatoire `[vérifié 2026-06-09]` |
| 401 | GET | `/lineage/column` | Lineage colonne (**orphelin UI**) |
| 401 | POST | `/add-event` · `/events/{eid}/conditions[/evaluate]` | Design events + conditions |
| 401 | POST | `/compliance/validate` · `/ingestion/{adapt,create-versioned,pause,resume}` | Compliance · ingestion versionnée |
| 401 | GET·POST | `/export/{id}` · `/import` | Export / import config projet |
| 401 | DEPRECATED(401) | `/explore-design/{id}/deployments*` | Record chain (dépréciée, **toujours déployée**) |

### 3f. Wizard guidé « mapping » (slice guided, prefix `/explore-design/guided`)
| Live | Méthode | Path | Usage |
|---|---|---|---|
| 401 | POST | `/guided/create_project` | Init projet wizard |
| 401 | GET | `/guided/databases` | Étape 2 : choisir une base |
| 401 | GET·POST | `/guided/manage_table` | Créer / altérer la table cible (DDL connecteurs) |
| 401 | POST | `/guided/add-columns` · `/remove-columns` · `/update_column_length` · `/primary-key` · `/store-selected-columns` | Colonnes + PK (verrou `lock_project`) |
| 401 | POST | `/guided/add-event` · GET·POST `/guided/get-steps-event` · `/guided/log_wizard_event` | Events / steps / télémétrie |
| 401 | POST | `/guided/test_mapping` | Étape 5 : valider un mapping (LIMIT preview) |
| 401 | POST | `/guided/schedule_deployment` | Étape 5 : planifier pour approbation modeleur |

## 4. Modèle de données — objets DE first-class & tables internes

**Objets Snowflake DE (catalogue, ground-truth = slice module + `router.py` DE-objects)** — chaque famille suit le template CRUD `CREATE OR REPLACE / ALTER / DROP`, lists via `SHOW <OBJECT> IN SCHEMA`, ⚡ event `USER_ACTIVITY`, ♻️ CacheKey dédié :

| Objet | Create | Lifecycle | Drop | Modèle / params clés |
|---|---|---|---|---|
| **Dynamic table** | `POST /dynamic-tables` | `PATCH` (target_lag/warehouse) · `suspend` · `resume` · `refresh`(coût) | `DELETE …/{name}` | `DynamicTableCreateAdvanced{name*, target_lag*, warehouse*, query*, refresh_mode?, initialize?, cluster_by?[]}` |
| **Stream** | `POST /streams` (`StreamCreate`) | `GET …/{name}/data?limit` (consume) | `DELETE …/{name}` | pas d'ALTER côté Snowflake |
| **Task** | (via ingestion schedule) | `suspend` · `resume` · `PATCH`(`TaskAlter{action}`) | `DELETE …/{name}` | describe = DDL + `TASK_HISTORY` runs + lineage |
| **Event table** | `POST /event-tables` (`EventTableCreate`) | — | `DELETE …/{name}` | — |
| **Hybrid table** | `POST /hybrid-tables` (`HybridTableCreate{columns[]}`) | — | `DELETE …/{name}` | OLTP |
| **Alert** | `POST /alerts` (`AlertCreate`) | `PATCH`(`AlertAlter{action}`) | `DELETE …/{name}` | — |

> Tous ces objets sont **globaux** (pas per-project) ; `database?`,`schema?` en query. Drop/refresh sont **destructifs/coûteux sans gate ni preview de coût** (cf. §7).

**Tables internes `CP_DATA360.EVENT_STORE`** (lues/écrites par le module) : `PROJECTS` · `PROJECT_EVENTS` (file DDL = `EVENT_TYPE='DDL_ACTION'` PENDING ; design events `FOREIGN_KEY_ADDED`/`ERD_LAYOUT`/`ADD_GROUP`…) · `PROJECT_VERSIONS` · `PROJECT_DEPLOYMENTS` · `PROJECT_STATE` (wizard) · `USER_ACTIVITY` (module tag `"EXPLORE_DESIGN"`) · `INGESTION_OPERATIONS` · `INGESTION_WATERMARKS` · `BUSINESS_GLOSSARY` (write = admin) · `SCHEMA_CLONES` · `AI_SUGGESTION_FEEDBACK` · `AI_SAVINGS_LOG`.

**Snowflake live** : `INFORMATION_SCHEMA.{TABLES,COLUMNS,VIEWS,SCHEMATA}` (browse/profile/diff/impact) · `SHOW WAREHOUSES/PRIMARY KEYS` · `ACCOUNT_USAGE.{OBJECT_DEPENDENCIES,QUERY_HISTORY,WAREHOUSE_METERING_HISTORY}` (impact/coût, best-effort) · DDL live (`CREATE/ALTER/DROP`, `INSERT/MERGE`, `CREATE SCHEMA…CLONE`) · Cortex (`EMBED_TEXT_768`, `VECTOR_COSINE_SIMILARITY`, LLM `claude-3-5-sonnet`).

**Modèle event/cache** : mutations → `log_event(... "EXPLORE_DESIGN" ...)` → `USER_ACTIVITY` `[trace: router.py:105 → core/events.py:617]`. Lectures `@session_cache(ttl)` clé `session:{user}:{account}:{func}:{hash}` ; mutations `@invalidates_cache(CacheKey.<X>)` = Redis pattern-delete + SSE push (🟡 FE ne consomme pas SSE, refresh via `useCacheAwareQuery`).

## 5. Cycle de vie draft→deploy + wizard guidé (FOCUS) — fiche « ins / outs » des endpoints clés

Le **focus du module** est le cycle de vie : explorer → concevoir (file DDL) → déployer derrière des gardes-fous → vérifier, avec deux chemins (canvas modeling **ou** wizard guidé). Flux type :

`POST /explore-design` (ou `/guided/create_project`) → exploration (`preview`/`profile`/`smart/detect-*`) → conception (`POST /{id}/ddl-actions` ×N, ou `/guided/manage_table`+`add-columns`+`primary-key`) → validation (`/{id}/validate/fk-types`, `/conflict-check`, `/{id}/sql-diff`) → **gardes déploiement** (`/{id}/ddl-actions/pre-check` → `/{id}/dry-run`|`/full-dry-run` (clone) → `/{id}/impact-analysis` → `/{id}/sql-diff` → `/{id}/ddl-actions/execute` (apply) → `/{id}/post-verify`) → enregistrement gouverné (`/projects/{id}/deployments*`) ou planifié (`/{id}/schedule`).

> Toutes `401` live (déployées, sweep 2026-06-08 + re-test 2026-06-09). Test **fonctionnel authentifié** à faire (compte Snowflake de test expiré → un `401` prouve l'existence + le gardiennage, pas la logique métier).

| Étape | Endpoint | INS (body · path · query) | OUTS (réponse consommée) |
|-------|----------|---------------------------|--------------------------|
| créer projet | `POST /explore-design` | body `ProjectCreate{project_name*, description?, source_tables[]?, template_schema?, tags?}` | `{project_id, project_name, status}` |
| explorer (preview) | `GET /{id}/tables/{db}/{sch}/{tbl}/preview` | path FQN · query `limit=100(1-10000)` | `{columns[], rows[], row_count}` |
| profiler | `GET /{id}/tables/{db}/{sch}/{tbl}/profile` | path FQN · query `sample_size=1000(100-100000)` | `[{name,type,null_pct,distinct,…}]` |
| AI-detect PK | `GET /smart/detect-pk` | query `table*` (FQN) | candidats classés + confidence |
| concevoir (DDL queue) | `POST /{id}/ddl-actions` | path `{id}` · body `DDLActionRequest{ddl_sql*, ddl_type*, priority=0, description?, target_table?}` | `{event_id, status:'PENDING'}` |
| valider FK-types | `POST /{id}/validate/fk-types` | path `{id}` · body `FKTypeCheckRequest{source_*?, target_*?}` (vide = scan projet) | `{compatible, conflicts[], message}` |
| diff SQL | `POST /{id}/sql-diff` | path `{id}` · body `SQLDiffRequest{database*, schema*, name?, event_ids?}` | par table `{before[], after[], added, removed, changed}` |
| pré-check | `POST /{id}/ddl-actions/pre-check` | path `{id}` · body `{database, schema, warehouse}` | `{ready:bool, checks[]{name,passed,detail}}` |
| dry-run (clone) | `POST /{id}/full-dry-run` | path `{id}` · body `FullDryRunRequest{warehouse, sample_rows, ingestions?[]}` | `{clone_schema, results[], sample_rows[], ingestions[]}` |
| impact | `POST /{id}/impact-analysis` | path `{id}` · body `ImpactAnalysisRequest{database, schema, table, column?}` | `{impacts[]{type,name}, total, risk_score?, safe_to_proceed?}` |
| **apply DDL** (canonique) | `POST /{id}/ddl-actions/execute` | path `{id}` (lit PENDING ordonnés par priorité) | `{executed[], failed[], status}` |
| post-verify | `POST /{id}/post-verify` | path `{id}` · body `PostVerifyRequest{deployment_id?, database, schema}` | `{verified:bool, passed, failed, checks[]}` |
| déployer (gouverné) | `POST /projects/{id}/deployments` (+ `/approve`·`/execute`) | path `{id}` · body `DeploymentRequest{deployment_type, scheduled_time?, warehouse='COMPUTE_WH', config?}` | `{deployment_id, status}` |
| quick deploy | `POST /{id}/deploy?version_id=` | path `{id}` · query `version_id` · body `QuickDeployRequest{warehouse, config?}` | `{success, deployment_id}` |
| planifier | `POST /{id}/schedule` | path `{id}` · body `CreateScheduleRequest{cron_expression*, warehouse, version_id?, scheduled_date?}` | `{deployment_id, task_name?, cron_expression?}` |
| risque déploiement (IA) | `POST /{id}/ai/deployment-risk` | path `{id}` (lit DDL pending) | `{risk_score, ...}` (+ CTA structuré proposé — vault §D) |
| **wizard** : init | `POST /guided/create_project` | body `CreateProjectRequest{name?, shared_with?}` | `{project_id, message}` |
| wizard : table+colonnes | `POST /guided/manage_table` · `/add-columns` · `/primary-key` | query `SOURCE_TABLE*, CONSTRAINT_TYPE*, …` · body `AddColumnsRequest`/`PrimaryKeyRequest` (verrou `lock_project`) | `{success, ...}` |
| wizard : tester mapping | `POST /guided/test_mapping` | body `BaseMappingRequest{project_id, mappings[ColumnMapping]}` | `{status, valid, columns[], sample_rows[], errors[]}` (400 si échec) |
| wizard : planifier (approbation) | `POST /guided/schedule_deployment` | body `ScheduleDeploymentRequest{workflow_name, scheduled_date, deployment_method, project_id, mappings[], status='PENDING_APPROVAL'}` | `{status, workflow_name, event_id}` |

> Renvoi : la **matrice gouvernance / DQ / coût / planification / historique** et l'**optimisation cache par rôle** sont détaillées dans le vault `data360_full_doc/pages/explore-design.md` §Enrichissement (2026-06-09).

## 6. UX front — validation 4 axes + accessibilité

| Axe | Verdict | Preuve (fichier:ligne) | Microcopy |
|-----|---------|------------------------|-----------|
| **loading** | ✓ | `loading.tsx:5` skeleton route-level `role="status" aria-label="Loading"` + `animate-pulse` + `dark:bg-gray-800` / `dark:bg-gray-900` (deux classes distinctes `[vérifié 2026-06-09]`) ; états `isLoadingDatabases/Schemas/Tables/Columns/Policies/InlinePreview/InlineProfile` `[trace: page.tsx:977-1019]` ; spinners conditionnels `:464,507` | skeletons animés |
| **empty** | ✓ | empty-state qui montre un vrai picker sans hand-off modal `[trace: page.tsx:924]` ; fallback projets `:948` ; `viewMode='catalog'` par défaut tant qu'aucun projet | « No projects yet, create one » (InlineProjectWizard) |
| **error** | ✓ | `ErrorBoundary` importé `[trace: page.tsx:108]` ; `getApiErrorMessage` `[trace: page.tsx:49]` utilisé sur erreur projets `:948` ; `try/catch` autour des mutations `:431,1181,1197` ; `DeploymentUnavailableNote.tsx` signale honnêtement l'indispo déploiement | « Failed to load projects » · note d'indisponibilité déploiement |
| **dark mode** | ✓ | **228 occurrences `dark:`** dans `page.tsx` `[vérifié 2026-06-09 : grep -c dark:]` ; `loading.tsx` `dark:bg-gray-800` / `dark:bg-gray-900` ; ContextRightBar dark | — |

**Accessibilité** : `role="status"`/`aria-label="Loading"` (`loading.tsx:5`) ; nombreux `aria-label` (Collapse/Expand schema, Settings, Remove, Clear selection, More actions, Search tables, Select schemas) `[trace: page.tsx:159,172,179,286,326,779,486]`. ⚠️ Le canvas ERD/modeling est souris/drag — navigation clavier des nœuds **non vérifiée**.

## 7. Drift détecté (vs vault + vs code + vs OpenAPI)

1. **« DEPRECATED » mal interprétable.** Le vault marquait `explore_design:deploy:record:*` « 🟡 DEPRECATED ». Re-test live 2026-06-09 : `GET /explore-design/{id}/deployments` → **401** (pas 404). L'OpenAPI confirme **7 ops `deprecated=True`** mais **toutes servies**. `deprecated=True` (FastAPI) **ne supprime pas** la route. → Corrigé inline + vault §Enrichissement A. (Même piège que `workflow.md`.)
2. **`require_action` totalement absent.** Aucun handler du module n'appelle `require_action` — gate **module-only** (`_require_module`). Le catalogue `module:page:tab:action` est intentionnel, pas câblé. 5 mutations DDL/ingestion live méritent un gate prioritaire (vault « Governance Roadmap ED-P2-01 »).
3. **`GET /lineage/column` orphelin.** Route **live (401 re-confirmé)** mais sans UI — câblée backend, pas surfacée (vault gaps #4).
4. **Repoint déploiement.** `StepDeploy` poste encore la chaîne **dépréciée** `/explore-design/{id}/deployments` au lieu de la canonique `/projects/{id}/deployments`. ⚠️ La canonique gate sur `require_module("account_overview")` → un utilisateur n'ayant que `explore_design` peut `403` au Submit.
5. **Pas de config d'ingestion per-table persistée.** `TableIngestionConfigRequest` existe comme modèle mais la section d'endpoint est vide `[trace: router.py:479-483]` — la config ne voyage que dans les bodies execute/schedule/preview.
6. **SSE non consommé** côté FE (refresh via `useCacheAwareQuery` seulement) malgré `@invalidates_cache` qui pousse du SSE.
7. **CTA IA pas tous gouvernés.** Les chemins d'application (clustering→file DDL, materialization, schedule) existent mais ne sont pas tous des `InsightActionButton` gardés par `useCanPerform`.

## 8. Propositions d'amélioration UX (PROPOSITIONS — pas d'édition de code)

1. **Badge « route dépréciée » dans le panneau Deploy** : afficher que la chaîne record est dépréciée et pointer vers la canonique, plutôt que de laisser `StepDeploy` poster en silence sur une route `deprecated`. Bénéfice : aligne l'UI sur la réalité OpenAPI. [trivial-safe]
2. **Garde proactive `account_overview`** : avant le Submit du déploiement canonique, désactiver le bouton + tooltip si l'utilisateur n'a pas le module `account_overview` (`useCanPerform`) — évite le `403` surprise.
3. **Surface du lineage de colonne** : brancher `GET /lineage/column` sur un panneau « voir le lineage avant drop/cascade » dans `CascadeConfirmModal` (la route est déjà live). Bénéfice : décision éclairée avant action destructive.
4. **Chips fraîcheur/coût avant refresh/drop des objets DE** : sur dynamic-tables/tasks, afficher dernière refresh + coût estimé (describe expose déjà `DYNAMIC_TABLE_REFRESH_HISTORY`/`TASK_HISTORY`) avant `refresh`/`drop`. Bénéfice : prévient les dépenses/irréversibles.
5. **CTA IA gouvernés** : rendre chaque suggestion (`clustering-keys`, `materialization`, `deploy-schedule`) en `InsightActionButton` désactivé sans grant, qui enfile le DDL via `/{id}/ddl-actions`. Bénéfice : boucle advisor→action gouvernée (vault §D).
6. **Compteur de file DDL dans le rail Actions** : afficher la profondeur PENDING + un bouton « tout exécuter » (batch) au lieu du N+1 `addDDLAction` ×N de `StepDeploy`. Bénéfice : moins d'appels, état clair.
7. **Empty-state du glossaire** distinguant lecture (tous) vs écriture (admin only) — éviter qu'un non-admin clique « Add term » et reçoive un 403.

## 9. Plan de test fonctionnel

> Toutes les routes renvoient `401` sans token. Obtenir d'abord un JWT (login Data360), puis `-H "Authorization: Bearer $TOKEN"`. Rôle requis = module `explore_design` actif (writes glossaire = ACCOUNTADMIN). Le déploiement canonique exige en plus le module `account_overview`.

```bash
BASE=https://<host>        # ex. http://localhost:80  ·  re-test sans auth : -H "Host: api.datalab360.io" http://<PROD_IP><PATH>
H="-H Authorization:Bearer $TOKEN -H Content-Type:application/json"

# 1. Créer un projet → renvoie {project_id}
PID=$(curl -s $H -X POST "$BASE/explore-design" \
  -d '{"project_name":"demo","source_tables":[{"database":"RAW","schema":"SALES","table":"ORDERS"}]}' | jq -r .project_id)

# 2. Explorer (lecture — masking/RLS appliqué par Snowflake)
curl -s $H "$BASE/explore-design/$PID/tables/RAW/SALES/ORDERS/preview?limit=50"
curl -s $H "$BASE/explore-design/$PID/tables/RAW/SALES/ORDERS/profile?sample_size=1000"
curl -s $H "$BASE/explore-design/smart/detect-pk?table=RAW.SALES.ORDERS"

# 3. Concevoir : enfiler du DDL puis valider
curl -s $H -X POST "$BASE/explore-design/$PID/ddl-actions" \
  -d '{"ddl_sql":"ALTER TABLE MART.ORDERS ADD COLUMN MARGIN NUMBER","ddl_type":"ALTER_TABLE","priority":0}'
curl -s $H "$BASE/explore-design/$PID/ddl-actions"
curl -s $H -X POST "$BASE/explore-design/$PID/validate/fk-types" -d '{}'
curl -s $H -X POST "$BASE/explore-design/$PID/sql-diff" -d '{"database":"MART","schema":"PUBLIC"}'

# 4. Gardes de déploiement (pre-check → dry-run clone → impact → execute → verify)
curl -s $H -X POST "$BASE/explore-design/$PID/ddl-actions/pre-check" -d '{"database":"MART","schema":"PUBLIC","warehouse":"COMPUTE_WH"}'
curl -s $H -X POST "$BASE/explore-design/$PID/full-dry-run" -d '{"warehouse":"COMPUTE_WH","sample_rows":10}'
curl -s $H -X POST "$BASE/explore-design/$PID/impact-analysis" -d '{"database":"MART","schema":"PUBLIC","table":"ORDERS"}'
curl -s $H -X POST "$BASE/explore-design/$PID/ddl-actions/execute"        # apply canonique (DDL live)
curl -s $H -X POST "$BASE/explore-design/$PID/post-verify" -d '{"database":"MART","schema":"PUBLIC"}'

# 5. Déploiement gouverné (canonique — exige module account_overview) puis planifié
curl -s $H -X POST "$BASE/projects/$PID/deployments" -d '{"deployment_type":"WITH_APPROVAL","warehouse":"COMPUTE_WH"}'
curl -s $H -X POST "$BASE/explore-design/$PID/schedule" -d '{"cron_expression":"0 2 * * *","warehouse":"COMPUTE_WH"}'
curl -s $H "$BASE/explore-design/$PID/schedules"

# 6. Objets DE first-class
curl -s $H -X POST "$BASE/explore-design/dynamic-tables" \
  -d '{"name":"DT_KPI","target_lag":"20 minutes","warehouse":"COMPUTE_WH","query":"SELECT * FROM MART.ORDERS"}'
curl -s $H "$BASE/explore-design/dynamic-tables?database=MART&schema=PUBLIC"
curl -s $H -X POST "$BASE/explore-design/dynamic-tables/DT_KPI/refresh?database=MART&schema=PUBLIC"

# 7. Suite AI advisor
curl -s $H -X POST "$BASE/explore-design/$PID/ai/schema-health" -d '{"database":"MART","schema":"PUBLIC"}'
curl -s $H -X POST "$BASE/explore-design/$PID/ai/check-naming" -d '{"names":["order_id"],"entity_type":"column","convention":"snake_case"}'  # zero-cost
curl -s $H "$BASE/explore-design/$PID/ai/savings?days=30"

# 8. Wizard guidé "mapping"
GPID=$(curl -s $H -X POST "$BASE/explore-design/guided/create_project" -d '{"name":"wizard demo"}' | jq -r .project_id)
curl -s $H "$BASE/explore-design/guided/databases"
curl -s $H -X POST "$BASE/explore-design/guided/test_mapping" -d '{"project_id":"'$GPID'","mappings":[{...}]}'
curl -s $H -X POST "$BASE/explore-design/guided/schedule_deployment" -d '{"workflow_name":"w1","scheduled_date":"2026-06-10","deployment_method":"task","project_id":"'$GPID'","mappings":[],"status":"PENDING_APPROVAL"}'

# 9. Glossaire (write = ACCOUNTADMIN)
curl -s $H "$BASE/explore-design/glossary?search=order"
curl -s $H -X POST "$BASE/explore-design/glossary/ai-draft" -d '{"term":"churn"}'   # 403 si pas ACCOUNTADMIN
```

**Résultats attendus par capacité** :
- Sans token → **401 AUTH_REQUIRED** sur les 170 ops (contrat RBAC vérifié).
- `GET /explore-design/{id}/deployments` (route dépréciée) → **401** sans token, **pas 404** (déployée — drift §3/§7).
- Déploiement canonique `/projects/{id}/deployments` sans module `account_overview` → **403** (mismatch de module, gap #4).
- Glossaire write sans ACCOUNTADMIN → **403** (`require_accountadmin_role`).
- Mutation DDL/ingestion par tout utilisateur du module → **passe** (aucun `require_action` — gap RBAC ED-P2-01).
- `full-dry-run` → schéma clone créé puis `DROP SCHEMA` en `finally` (aucun écrit en prod).

> Vérifié 2026-06-09 : 170 endpoints vérifiés (slices + OpenAPI), 4 corrections (ERD/relationships prefix `/explore-design/` manquant ×2 occurrences, dark: count 343→228, dark:bg-gray-800/900 notation clarifiée), live-retest 3 GET → 3× 401 OK. GROUNDED.
