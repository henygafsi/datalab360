---
name: api-skill-workflow
description: >
  Module Workflow de Data360 (route /workflow). Builder ETL visuel React-Flow (drag-drop
  DAG) + auto-import tasks Snowflake + schedules CRON + runs/versions + déploiements
  approuvés + Git/Notebooks/SPCS. 70 endpoints live (54 module + 16 intégrations, tous
  401 AUTH_REQUIRED = protégés). 79 blocks ETL catalogués sur 8 catégories. Rôle principal :
  Data Engineer. Grounded sur le code réel — 2026-06-08.
---

# Workflow — Skill Module (API-grounded, 2026-06-08)

> Toutes les affirmations sont sourcées (fichier:ligne ou slice). Les blocks viennent **uniquement** de `etl-blocks-catalog.json` (79 blocks). Les endpoints viennent **uniquement** des 2 slices live. Aucun bloc/endpoint inventé. Les zones non confirmées sont marquées « non vérifié ».

## 1. Vue d'ensemble

| Élément | Valeur (source) |
|---------|-----------------|
| **Route front** | `/workflow` |
| **Entry point** | `apps/data360/src/app/(dashboard)/workflow/page.tsx` (34 l. — shell `ErrorBoundary` + `dynamic(ssr:false)`) |
| **Composant principal** | `workflow/ETLPipelineBuilder.tsx` (4091 l. — canvas React-Flow + rail droit) |
| **Palette** | `workflow/components/ETLPalette.tsx` (486 l.) |
| **Rendu des nœuds** | `workflow/components/ETLNodeTypes.tsx` (~84 Ko) |
| **Définitions blocs (front)** | `workflow/components/etl-blocks.ts` (53 Ko — `ETL_BLOCKS`, `CATEGORY_LABELS`, `CATEGORY_ICONS`) |
| **Catalogue ground-truth** | `workflow/components/etl-blocks-catalog.json` (3256 l., 79 blocks, 8 catégories, 3 samples seed) |
| **Config-forms** | `workflow/components/config-forms/` (≈ 80 formulaires, un par bloc) |
| **Service API front** | `apps/data360/src/app/services/api/workflowApi.ts` (446 l., `PREFIX='/workflow'`) |
| **Module backend** | domaine `/workflow` (router-level `_require_module` + `get_current_user` par handler — d'après page-workflow.md) |

**Rôles** — la seule chose vérifiable dans le code est l'ensemble des **flags de permission** câblés dans `ETLPipelineBuilder.tsx:673-677` : `canWfExecute`, `canWfDeploy`, `canWfEdit`, `canWfCreate`, `canWfDelete` (via `useCanPerform`). Le détail métier des personas ci-dessous est **non vérifié** (repris de page-workflow.md, non confirmé dans le code) :

| Rôle (non vérifié) | Permission câblée (vérifiée) |
|--------------------|------------------------------|
| Data Engineer | `canWfCreate`, `canWfEdit`, `canWfExecute`, `canWfDelete` |
| Platform Admin | `canWfDeploy` (+ approbations) |
| DQ Analyst | lecture seule (`isReadOnly` → toast « view-only access », `ETLPipelineBuilder.tsx:685`) |
| AI Engineer | `canWfCreate` (wizard IA / notebooks) — *non vérifié* |

## 2. Capacités (grounded)

| Capacité | Implémentation (fichier / endpoint) |
|----------|--------------------------------------|
| Construire un DAG ETL drag-drop | `ETLPipelineBuilder.tsx` (canvas React-Flow) + `ETLPalette.tsx` (drag `application/reactflow` = `block.type`, ligne 184) |
| Créer un workflow depuis un graphe | `workflowApi.saveWorkflowFromGraph` → `POST /workflow/from-graph` (`ETLPipelineBuilder.tsx:1774`) |
| Créer un workflow vide | `workflowApi.createWorkflow` → `POST /workflow` (`:1758`, `:2254`) |
| Ajouter/MAJ/supprimer un step | `addStep`/`updateStep`/`deleteStep` → `POST|PUT|DELETE /workflow/{id}/steps[/{step_id}]` (`:3955`, `:1864`) |
| Compiler (génère DDL tasks) | `compileWorkflow` → `POST /workflow/{id}/compile` (`:1940`) |
| Valider | `validateWorkflow` → `POST /workflow/{id}/validate` (`:2005`, `:3986`) |
| Exécuter (sync/async) | `executeWorkflow` → `POST /workflow/{id}/execute` (`:1948`, query `async_mode`) |
| Lister/analyser les runs | `getRuns`/`analyzeRun` → `GET /workflow/{id}/runs`, `POST /workflow/{id}/runs/{run_id}/analyze` (`:2109`) |
| Versions | `listVersions` → `GET /workflow/{id}/versions` (`:878`, `:2150`) |
| Schedule CRON (task Snowflake) | `scheduleWorkflow`/`suspendTask`/`resumeTask` → `POST /workflow/{id}/schedule`, `.../schedule/pause`, `.../schedule/resume` (`:926`, `:942` ; mapping confirmé `workflowApi.ts:233-242`) |
| Déploiement gouverné | `requestDeployment`/`listDeployments`/`approve`/`reject`/`execute` → `POST|GET /workflow/{id}/deployments...` (`:574`, `:1688`, `:2159`) |
| Test « real-life » par clone zéro-copie | `runCloneDataTests` → `GET /workflow/{id}/clone-data-tests` (`:2070`) |
| Aperçu de table | `apiClient.get(API.workflow.previewTable())` → `GET /workflow/preview-table` (`:1904`) |
| Autosave draft | `PUT/GET /workflow/{id}/draft` (lifecycle autosave, `:1010` garde « don't write empty drafts ») |
| Import de tasks Snowflake | `discoverTasks`/`importTask` → `GET /workflow/tasks/discover`, `POST /workflow/tasks/import` (`ImportTasksModal.tsx`) |
| Catalogue de blocs server-driven | `useBackendBlocks()` → `GET /workflow/blocks` (dégrade en section vide si 404 — `ETLPalette.tsx:286-287`) |
| Blocs custom par projet | `useCustomBlocks(projectId)` + `CustomBlockFactoryModal` (`ETLPalette.tsx:284`) |
| Run-history par bloc | `GET /workflow/{id}/block-events` (`ETLExecutionHistory.tsx`) |

## 3. Référence endpoints (70 ops — statut live)

**Contrat de statut** : dans les 2 slices, **les 70 ops renvoient `401 AUTH_REQUIRED`** = routes correctement protégées (RBAC actif), donc enregistrées et déployées. Aucune route publique (200), aucun 404/500. Pas d'authentification dans le sweep → 401 attendu et sain.

**Routes connues NON présentes dans les slices (undeployed / drift)** :
- `GET /workflow/catalog/blocks` — **non déployé** (c'est la raison d'être du `etl-blocks-catalog.json` comme ground-truth ; le front utilise plutôt `GET /workflow/blocks`).
- `GET /workflow/{id}/runs/summary` — **appelé par le front** (`workflowApi.ts:205`) mais **absent des slices** → 404 documenté (cf. §7).

### 3a. Cœur workflow — CRUD, steps, lifecycle (slice workflow-module, 54 ops)

| Live | Méthode | Path | Rôle/usage |
|------|---------|------|------------|
| 401 | POST | `/workflow` | Créer workflow (WorkflowCreate) |
| 401 | POST | `/workflow/from-graph` | Créer un workflow en un coup depuis un graphe node/edge |
| 401 | POST | `/workflow/dry-run` | Dry-run stateless depuis un body graphe (sans persistance) |
| 401 | GET | `/workflow/capabilities` | Catalogue des capacités low-code |
| 401 | GET | `/workflow/preview-table` | Aperçu de données d'une table (database/schema/table/limit) |
| 401 | GET | `/workflow/jobs` | Lister les jobs async (job_type/status/limit) |
| 401 | GET | `/workflow/schedules` | Lister tous les workflows planifiés |
| 401 | GET | `/workflow/{id}/steps` | Lister les steps |
| 401 | POST | `/workflow/{id}/steps` | Ajouter un step (StepAdd) |
| 401 | PUT | `/workflow/{id}/steps/{step_id}` | MAJ un step (StepUpdate) |
| 401 | DELETE | `/workflow/{id}/steps/{step_id}` | Supprimer un step |
| 401 | POST | `/workflow/{id}/compile` | Compiler → génère le DDL des tasks |
| 401 | POST | `/workflow/{id}/validate` | Valider |
| 401 | POST | `/workflow/{id}/dry-run` | Dry-run d'un workflow sauvegardé (compile+validate, sans exec) |
| 401 | POST | `/workflow/{id}/execute` | Exécuter (query `async_mode`) |
| 401 | POST | `/workflow/{id}/cancel` | Annuler un run en cours |
| 401 | POST | `/workflow/{id}/post-verify` | Vérifier la sortie de chaque bloc après exec |
| 401 | POST | `/workflow/{id}/pre-check` | Préconditions pré-déploiement |
| 401 | GET | `/workflow/{id}/dag` | Structure DAG (nodes + arêtes AFTER) depuis les steps compilés |
| 401 | GET | `/workflow/{id}/draft` | Restaurer le dernier draft autosauvegardé |
| 401 | PUT | `/workflow/{id}/draft` | Autosave draft (sans nouvelle version) |
| 401 | POST | `/workflow/{id}/rollback` | Rollback vers une version antérieure |
| 401 | GET | `/workflow/{id}/versions` | Lister les versions (limit, include_superseded) |
| 401 | POST | `/workflow/{id}/versions` | Sauver les steps courants comme version nommée |
| 401 | GET | `/workflow/{id}/runs` | Lister les runs (status/page/page_size) |
| 401 | POST | `/workflow/{id}/runs/{run_id}/analyze` | Analyse IA d'un run échoué |
| 401 | GET | `/workflow/{id}/block-events` | Trace par bloc (panel run-history ; query `run_id`) |
| 401 | GET | `/workflow/{id}/clone-data-tests` | Test real-life via clone zéro-copie (connector_ids, max_tables) |

### 3b. Scheduling & tasks Snowflake

| Live | Méthode | Path | Rôle/usage |
|------|---------|------|------------|
| 401 | GET | `/workflow/tasks/discover` | Découvrir toutes les tasks Snowflake (query `database`) |
| 401 | POST | `/workflow/tasks/import` | Importer un task graph Snowflake comme projet workflow |
| 401 | POST | `/workflow/{id}/schedule` | Planifier comme task Snowflake (ScheduleRequest) |
| 401 | DELETE | `/workflow/{id}/schedule` | Supprimer la task planifiée |
| 401 | POST | `/workflow/{id}/schedule/pause` | Suspendre la task |
| 401 | POST | `/workflow/{id}/schedule/resume` | Reprendre la task |
| 401 | GET | `/workflow/{id}/schedules` | Schedules d'un workflow |
| 401 | GET | `/workflow/{id}/task-status` | Historique/stats d'exécution des tasks (query `days`) |
| 401 | GET | `/workflow/{id}/tasks/{task_id}/logs` | Logs/historique d'une task (query `days`) |
| 401 | POST | `/workflow/{id}/tasks/{task_id}/retry` | Re-run d'une task échouée (EXECUTE TASK) |
| 401 | GET | `/workflow/{id}/cost-summary` | Crédits consommés par les tasks (query `days`) |

### 3c. Déploiements gouvernés (approbations)

| Live | Méthode | Path | Rôle/usage |
|------|---------|------|------------|
| 401 | GET | `/workflow/{id}/deployments` | Lister les déploiements (status/limit) |
| 401 | POST | `/workflow/{id}/deployments` | Demander un déploiement (DeploymentRequest) |
| 401 | POST | `/workflow/{id}/deployments/{deployment_id}/approve` | Approuver |
| 401 | POST | `/workflow/{id}/deployments/{deployment_id}/reject` | Rejeter |
| 401 | POST | `/workflow/{id}/deployments/{deployment_id}/cancel` | Annuler le déploiement |
| 401 | POST | `/workflow/{id}/deployments/{deployment_id}/execute` | Exécuter un déploiement approuvé |
| 401 | POST | `/workflow/{id}/deployments/{deployment_id}/verify` | Vérifier les résultats du déploiement |

### 3d. Catalogue de blocs server-driven + capacités

| Live | Méthode | Path | Rôle/usage |
|------|---------|------|------------|
| 401 | GET | `/workflow/blocks` | Catalogue ETL server-driven (query `category`, `executable_only`) |
| 401 | GET | `/workflow/blocks/categories` | Catégories de blocs pour le regroupement palette |
| 401 | GET | `/workflow/blocks/{block_type}` | Détail riche d'un bloc |
| 401 | POST | `/workflow/blocks/{block_type}/render-sql` | Rendre le SQL d'un bloc depuis ses params (pur, sans exécution) |
| 401 | GET | `/workflow/action-templates` | Lister les action templates |
| 401 | POST | `/workflow/action-templates` | Créer un action template |
| 401 | GET | `/workflow/compute-pools/{name}` | Détail d'un compute pool SPCS |
| 401 | POST | `/workflow/events/resource-cleanup` | Enregistrer un event resource-cleanup (test harness) |

### 3e. Intégrations — Git, Notebooks, exécution ad hoc (slice workflow-integrations, 16 ops)

| Live | Méthode | Path | Rôle/usage |
|------|---------|------|------------|
| 401 | GET | `/workflow/git/repositories` | Lister les repos Git |
| 401 | POST | `/workflow/git/repositories` | Créer un repo Git (GitRepositoryCreate) |
| 401 | GET | `/workflow/git/repositories/{name}` | Décrire un repo |
| 401 | DELETE | `/workflow/git/repositories/{name}` | Drop un repo |
| 401 | GET | `/workflow/git/repositories/{name}/branches` | Lister les branches |
| 401 | GET | `/workflow/git/repositories/{name}/tags` | Lister les tags |
| 401 | POST | `/workflow/git/repositories/{name}/fetch` | Fetch le repo |
| 401 | GET | `/workflow/notebooks` | Lister les notebooks |
| 401 | POST | `/workflow/notebooks` | Créer un notebook (NotebookCreate) |
| 401 | GET | `/workflow/notebooks/{name}` | Décrire un notebook |
| 401 | PATCH | `/workflow/notebooks/{name}` | Modifier un notebook (NotebookAlter) |
| 401 | DELETE | `/workflow/notebooks/{name}` | Drop un notebook |
| 401 | POST | `/workflow/notebooks/{name}/execute` | Exécuter un notebook |
| 401 | POST | `/workflow/run-python` | Exécuter du Python ad hoc (RunPythonRequest) |
| 401 | POST | `/workflow/run-sql` | Exécuter du SQL ad hoc (RunSqlRequest) |
| 401 | POST | `/workflow/setup/initialize-tables` | Initialiser les tables backend du module |

## 4. Catalogue de blocks (79 blocks, ground truth = etl-blocks-catalog.json)

**Répartition** : source 18 · transform 18 · transform_advanced 22 · destination 3 · python 3 · ml_training 5 · ai_functions 7 · templates 3 = **79**.

> ⚠ **Piège id ≠ type** : `node.type` (graph_contract) doit matcher la colonne `blocks[].type`, PAS `id`. 3 blocs diffèrent (tous en `ml_training`) : `finetune_model`→type **`finetune`**, `train_classifier`→type **`classification_train`**, `anomaly_detection`→type **`anomaly_detect`**. Pour tous les autres, id == type.

### graph_contract (règles, JSON l. 6-29)
- **node** : `{ id (unique), type (∈ blocks[].type), config (clé = params du bloc), position {x,y} }`.
- **edge** : `{ source, target, sourceHandle?, targetHandle? }` — `targetHandle` = `'left'`/`'right'` ou index pour les blocs multi-input.
- **Règles** : (1) `hasInput=false` ⇒ aucune arête entrante ; (2) `hasOutput=false` ⇒ aucune arête sortante ; (3) `minInputs ≤ arêtes entrantes ≤ maxInputs` ; (4) params `required=true` obligatoires dans `config` ; (5) toute colonne référencée doit exister dans le schéma amont.
- **Multi-input** : `join` (2/2, handles left/right), `merge` (2/2 — **1er input = source, 2e = target**), `union` (2–10), `fuzzy_match` (1–2), `sql_script`/`python_script` (0–4 via `{{input_0}}…`).
- **Sources sans input** : tous les `source*`, `stream_consume`, `recursive_cte`, `create_udf`, `create_procedure`, et les 3 `template_*`. **Exception piège** : `cdc_merge` est catégorie `source` mais `hasInput=true, minInputs=1` → il **doit** recevoir une arête (à appairer avec `stream_consume`).
- **Destinations terminales (3 seulement)** : `destination`, `export_file`, `dynamic_table` (aucune arête sortante).

### source (18)
| type | label | ports in/out (min-max) | params requis clés |
|------|-------|------------------------|--------------------|
| `source` | Source | –/✓ (0-0) | database, schema, table |
| `cdc_merge` | CDC Merge | ✓/✓ (1-1) | stream_name, target_table, merge_keys |
| `stream_consume` | Create Stream | –/✓ (0-0) | stream_name, database, schema, source_object |
| `s3_source` | S3 Source | –/✓ (0-0) | stage_name, file_path |
| `azure_source` | Azure Source | –/✓ (0-0) | stage_name, file_path |
| `gcs_source` | GCS Source | –/✓ (0-0) | stage_name, file_path |
| `postgres_source` | PostgreSQL | –/✓ (0-0) | connection_name, source_table, target_database, target_schema |
| `mysql_source` | MySQL | –/✓ (0-0) | connection_name, source_table, target_database, target_schema |
| `external_table_source` | External Table | –/✓ (0-0) | database_name, schema_name, table_name |
| `dynamic_table_source` | Dynamic Table (source) | –/✓ (0-0) | database_name, schema_name, table_name |
| `shared_data_source` | Shared Data | –/✓ (0-0) | share_database, schema_name, table_name |
| `salesforce_source` | Salesforce | –/✓ (0-0) | target_database, object_name |
| `sap_source` | SAP | –/✓ (0-0) | target_database, table_name |
| `oracle_source` | Oracle DB | –/✓ (0-0) | target_database, table_name |
| `hubspot_source` | HubSpot | –/✓ (0-0) | target_database, object_name |
| `servicenow_source` | ServiceNow | –/✓ (0-0) | target_database, table_name |
| `api_source` | REST API | –/✓ (0-0) | target_database, schema_name, table_name |
| `recursive_cte` | Recursive Hierarchy | –/✓ (0-0) | id_column, parent_column, name_column |

### transform (18)
| type | label | ports in/out (min-max) | params requis clés |
|------|-------|------------------------|--------------------|
| `join` | Join | ✓/✓ (2-2) | left_key, right_key (join_type def. INNER) |
| `merge` | Merge | ✓/✓ (2-2) | target_table, merge_keys, clauses |
| `filter` | Filter | ✓/✓ (1-1) | filter_condition **ou** conditions |
| `aggregate` | Aggregate | ✓/✓ (1-1) | aggregations (group_by optionnel) |
| `select` | Select | ✓/✓ (1-1) | columns |
| `rename` | Rename | ✓/✓ (1-1) | renames |
| `cast` | Cast | ✓/✓ (1-1) | casts |
| `formula` | Formula | ✓/✓ (1-1) | expressions |
| `sort` | Sort | ✓/✓ (1-1) | order_by |
| `union` | Union | ✓/✓ (2-10) | (all : UNION ALL si true) |
| `distinct` | Distinct | ✓/✓ (1-1) | columns (optionnel) |
| `limit` | Limit | ✓/✓ (1-1) | limit |
| `recommendation` | Recommendation | ✓/✓ (1-1) | score_column |
| `segmentation` | Segmentation | ✓/✓ (1-1) | segment_column |
| `clustering` | Clustering | ✓/✓ (1-1) | cluster_column |
| `sql_script` | SQL Script | ✓/✓ (0-4) | sql_code (`{{input_0}}…`) |
| `python_script` | Python Script | ✓/✓ (0-4) | python_code (mode inline) ou database/schema/proc_name (stored_proc) |
| `notebook_run` | Run Notebook | ✓/✓ (0-1) | database, schema, notebook_name |

### transform_advanced (22)
| type | label | ports in/out (min-max) | params requis clés |
|------|-------|------------------------|--------------------|
| `window_rank` | Rank | ✓/✓ (1-1) | order_by, output_column |
| `window_lag_lead` | Lag / Lead | ✓/✓ (1-1) | column, order_by, output_column |
| `window_aggregate` | Running Agg | ✓/✓ (1-1) | column, output_column |
| `window_ntile` | Percentile | ✓/✓ (1-1) | buckets, order_by, output_column |
| `json_flatten` | Flatten JSON | ✓/✓ (1-1) | input_column |
| `json_extract` | Extract JSON | ✓/✓ (1-1) | input_column, extract_paths |
| `json_construct` | Build JSON | ✓/✓ (1-1) | columns, output_column |
| `json_path_extract` | JSON Path Extract | ✓/✓ (1-1) | json_column, json_path |
| `pivot` | Pivot | ✓/✓ (1-1) | value_column, pivot_column, pivot_values |
| `unpivot` | Unpivot | ✓/✓ (1-1) | unpivot_columns |
| `date_transform` | Date Transform | ✓/✓ (1-1) | column, output_column |
| `time_slice` | Time Bucket | ✓/✓ (1-1) | column, slice_length, output_column |
| `fill_nulls` | Fill Nulls | ✓/✓ (1-1) | column (fill_value si strategy=VALUE) |
| `case_when` | Conditional | ✓/✓ (1-1) | output_column, conditions |
| `split_column` | Split Column | ✓/✓ (1-1) | column, delimiter |
| `fuzzy_match` | Fuzzy Match | ✓/✓ (1-2) | source_column, target_column |
| `qualify_filter` | Qualify Filter | ✓/✓ (1-1) | partition_columns, order_column |
| `correlation` | Correlation Matrix | ✓/✓ (1-1) | column_a, column_b |
| `histogram` | Distribution | ✓/✓ (1-1) | column |
| `rollup_cube` | Rollup / Cube | ✓/✓ (1-1) | grouping_type, group_by, aggregations |
| `match_recognize` | Match Recognize | ✓/✓ (1-1) | partition_by, order_by, pattern, define |
| `task_dag` | Task DAG | ✓/✓ (1-1) | root_task_name, warehouse |

### destination (3)
| type | label | ports in/out (min-max) | params requis clés |
|------|-------|------------------------|--------------------|
| `destination` | Destination | ✓/– (1-1) | database, schema, table (merge_keys si write_mode=merge) |
| `export_file` | Export File | ✓/– (1-1) | stage_name |
| `dynamic_table` | Dynamic Table | ✓/– (1-1) | table_name, target_lag, warehouse, query |

### python (3)
| type | label | ports in/out (min-max) | params requis clés |
|------|-------|------------------------|--------------------|
| `create_udf` | Create UDF | –/✓ (0-0) | function_name, database_name, schema_name, function_body |
| `create_procedure` | Create Procedure | –/✓ (0-0) | procedure_name, database_name, schema_name, procedure_body |
| `apply_udf` | Apply UDF | ✓/✓ (1-1) | function_name, input_columns, output_column |

### ml_training (5) — ⚠ id ≠ type
| type | label | ports in/out (min-max) | params requis clés |
|------|-------|------------------------|--------------------|
| `finetune` (id `finetune_model`) | Fine-Tune LLM | ✓/✓ (1-1) | base_model, training_table |
| `classification_train` (id `train_classifier`) | Train Classifier | ✓/✓ (1-1) | target_column |
| `anomaly_detect` (id `anomaly_detection`) | Anomaly Detection | ✓/✓ (1-1) | timestamp_column, value_column |
| `forecast` | Forecast | ✓/✓ (1-1) | timestamp_column, value_column |
| `document_ai` | Document AI | ✓/✓ (1-1) | model, input_column |

### ai_functions (7) — Cortex inline SQL
| type | label | ports in/out (min-max) | params requis clés |
|------|-------|------------------------|--------------------|
| `ai_classify` | AI Classify | ✓/✓ (1-1) | input_column, categories |
| `ai_sentiment` | AI Sentiment | ✓/✓ (1-1) | text_column |
| `ai_translate` | AI Translate | ✓/✓ (1-1) | text_column, target_lang |
| `ai_extract` | AI Extract | ✓/✓ (1-1) | input_column, extract_keys |
| `ai_complete` | AI Complete | ✓/✓ (1-1) | prompt_template |
| `ai_filter` | AI Filter | ✓/✓ (1-1) | filter_prompt |
| `ai_agg` | AI Aggregate | ✓/✓ (1-1) | group_column, aggregation_prompt |

### templates (3) — mini-pipelines préfabriqués (sans input)
| type | label | ports in/out (min-max) | params requis clés |
|------|-------|------------------------|--------------------|
| `template_daily_refresh` | Daily Full Refresh | –/✓ (0-0) | source_table, destination_table |
| `template_incremental_merge` | Incremental Merge | –/✓ (0-0) | source_table, target_table, watermark_column, merge_keys |
| `template_sentiment_pipeline` | AI Sentiment Pipeline | –/✓ (0-0) | source_table, text_column, destination_table |

## 5. 20 workflows complexes de test (grounded sur les 79 blocks réels)

> Tous les `type` ci-dessous existent dans le catalogue (colonne `type`). Flux d'endpoints type :
> `POST /workflow/dry-run` (valider le graphe, stateless) → `POST /workflow/from-graph` (crée le projet, renvoie `id`) → `POST /workflow/{id}/compile` → `POST /workflow/{id}/execute` → `GET /workflow/{id}/runs` + `GET /workflow/{id}/block-events`. **Il n'existe pas de `/run`** — l'exécution est `/execute`.

**Sample 01 — Daily KPI roll-up** (ETL simple ; seed JSON)
Objectif : agréger les commandes des dernières 24 h par magasin.
Nodes : `n1 source{ORDERS}` → `n2 filter{filter_condition:"ORDER_TS>=DATEADD('day',-1,CURRENT_TIMESTAMP())"}` → `n3 aggregate{group_by:[STORE_ID], aggregations:[SUM(AMOUNT)→REVENUE, COUNT(*)→ORDER_COUNT]}` → `n4 destination{KPI.STORE_DAILY, overwrite}`.
Edges : n1→n2→n3→n4. Endpoints : from-graph → compile → execute → runs.

**Sample 02 — Sentiment scoring** (AI/Cortex ; seed JSON)
Nodes : `s1 source{REVIEWS_RAW}` → `s2 ai_sentiment{text_column:REVIEW_TEXT, output_column:SENTIMENT_SCORE}` → `s3 destination{REVIEWS_SCORED}`. Edges : s1→s2→s3.

**Sample 03 — Join + Window top-10 par client** (multi-source join ; seed JSON)
Nodes : `j1 source{ORDERS}`, `j2 source{CUSTOMERS}`, `j3 join{INNER, left_key:CUSTOMER_ID, right_key:ID}`, `j4 window_rank{partition_by:[CUSTOMER_ID], order_by:[ORDER_TS DESC], output_column:RN}`, `j5 qualify_filter{partition_columns:[CUSTOMER_ID], order_column:ORDER_TS, rank_le:10}`, `j6 destination{TOP_ORDERS}`.
Edges : j1→j3 (targetHandle:left), j2→j3 (targetHandle:right), j3→j4→j5→j6.

**Sample 04 — Dédoublonnage par nettoyage** (data quality)
Objectif : normaliser puis dédupliquer un référentiel clients.
Nodes : `a source{CUSTOMERS_RAW}` → `b fill_nulls{column:EMAIL, strategy:VALUE, fill_value:''}` → `c cast{casts:[{column:SIGNUP_DT, to:DATE}]}` → `d distinct{columns:[EMAIL]}` → `e destination{CUSTOMERS_CLEAN, overwrite}`. Edges : a→b→c→d→e.

**Sample 05 — Pivot mensuel pour reporting** (transform_advanced)
Nodes : `a source{SALES}` → `b date_transform{column:SALE_DT, operation:DATE_TRUNC, unit:month, output_column:MONTH}` → `c pivot{value_column:AMOUNT, pivot_column:MONTH, pivot_values:[...], aggregate_fn:SUM}` → `d destination{SALES_PIVOT}`. Edges : a→b→c→d.

**Sample 06 — Top-N par catégorie via percentile** (window)
Nodes : `a source{PRODUCTS}` → `b window_ntile{buckets:4, order_by:[REVENUE DESC], output_column:QUARTILE}` → `c filter{filter_condition:"QUARTILE=1"}` → `d sort{order_by:[REVENUE DESC]}` → `e limit{limit:50}` → `f export_file{stage_name:@EXPORT, file_format:PARQUET}`. Edges : a→b→c→d→e→f.

**Sample 07 — Multi-source union + dédup** (multi-source, union 3 entrées)
Nodes : `s1 source{ORDERS_EU}`, `s2 source{ORDERS_US}`, `s3 source{ORDERS_APAC}`, `u union{all:false}` (2-10 inputs), `d destination{ORDERS_GLOBAL}`.
Edges : s1→u, s2→u, s3→u, u→d. Note : 3 arêtes entrantes sur `union` (2 ≤ 3 ≤ 10).

**Sample 08 — Enrichissement REST API + JSON** (transform_advanced JSON)
Nodes : `a api_source{target_database:RAW, schema_name:EXT, table_name:PAYLOADS}` → `b json_extract{input_column:DATA, extract_paths:[{path:"data:name", as:NAME, type:VARCHAR}]}` → `c json_flatten{input_column:DATA, path:"data.items", mode:ARRAY}` → `d destination{EXT_NORMALIZED}`. Edges : a→b→c→d.

**Sample 09 — CDC : stream → merge** (CDC ; piège cdc_merge a un input)
Nodes : `s stream_consume{stream_name:ORD_STREAM, database:RAW, schema:SALES, source_object:ORDERS}` → `m cdc_merge{stream_name:ORD_STREAM, target_table:DWH.ORDERS, merge_keys:[ORDER_ID]}` → `d destination{DWH.ORDERS, write_mode:merge, merge_keys:[ORDER_ID]}`.
Edges : s→m, m→d. (`stream_consume` = 0 input ; `cdc_merge` = 1 input obligatoire.)

**Sample 10 — Reverse-ETL vers fichier** (reverse ETL — voir note)
Objectif : pousser un segment marketing vers un drop S3 consommé par un SaaS externe.
Nodes : `a source{CRM.CONTACTS}` → `b segmentation{segment_column:SEGMENT, strategy:rfm}` → `c filter{filter_condition:"SEGMENT='VIP'"}` → `d export_file{stage_name:@MKTG_S3, file_format:CSV}`. Edges : a→b→c→d.
> ⚠ Le catalogue n'a **aucun sink SaaS** (Salesforce/HubSpot sont des *sources* uniquement) ; le « reverse-ETL » se termine donc sur `export_file` (le drop est repris par l'outil tiers hors Data360).

**Sample 11 — Refresh planifié quotidien** (scheduled refresh)
Nodes : `a source{RAW.EVENTS}` → `b filter{filter_condition:"EVENT_DT=CURRENT_DATE()"}` → `c destination{MART.EVENTS_DAILY, overwrite}`. Edges : a→b→c.
Endpoints add. : `POST /workflow/{id}/schedule` (ScheduleRequest CRON `0 2 * * *`) ; pause/resume via `.../schedule/pause` | `.../schedule/resume`.

**Sample 12 — Dynamic Table auto-refresh** (matérialisation continue)
Nodes : `a source{RAW.CLICKS}` → `b aggregate{group_by:[PAGE], aggregations:[COUNT(*)→HITS]}` → `c dynamic_table{table_name:MART.PAGE_HITS_DT, target_lag:"1 minute", warehouse:COMPUTE_WH, query:"SELECT ..."}`. Edges : a→b→c.

**Sample 13 — ML : entraînement classifieur** (ml_training)
Nodes : `a source{LABELED_TICKETS}` → `b classification_train{target_column:PRIORITY, feature_columns:[LEN, NB_KEYWORDS], model_name:TICKET_CLF}` → `c destination{ML.TICKET_CLF_METRICS}`.
Edges : a→b→c. (Type = `classification_train`, id = `train_classifier`.)

**Sample 14 — ML : forecast de série temporelle** (ml_training)
Nodes : `a source{SALES_DAILY}` → `b forecast{timestamp_column:SALE_DT, value_column:REVENUE, forecast_periods:30}` → `c destination{MART.REVENUE_FORECAST}`. Edges : a→b→c.

**Sample 15 — Fine-tune LLM Cortex** (ml_training, id≠type)
Nodes : `a source{TRAINING_PROMPTS}` → `b finetune{base_model:"mistral-7b", training_table:"RAW.FT_TRAIN", validation_table:"RAW.FT_VAL", model_name:"SUPPORT_LLM"}` → `c destination{ML.FT_JOBS}`.
Edges : a→b→c. (Type = `finetune`, id = `finetune_model`.)

**Sample 16 — Notebook/SPCS dans le DAG** (notebook/SPCS)
Nodes : `a source{FEATURES}` → `b notebook_run{database:ML, schema:NB, notebook_name:FEATURE_ENG}` → `c apply_udf{function_name:SCORE_RISK, input_columns:[F1,F2], output_column:RISK}` → `d destination{ML.SCORED}`. Edges : a→b→c→d.
Endpoints add. : `POST /workflow/notebooks/{name}/execute` (intégration).

**Sample 17 — Quality gate par seuil (SQL escape hatch)** (data quality gate)
Objectif : bloquer l'écriture si le taux de NULL dépasse 5 %.
Nodes : `a source{STAGING}` → `b sql_script{sql_code:"SELECT *, (SELECT COUNT_IF(EMAIL IS NULL)/COUNT(*) FROM {{input_0}}) AS NULL_RATE FROM {{input_0}}"}` → `c filter{filter_condition:"NULL_RATE < 0.05"}` → `d destination{CLEAN, overwrite}`. Edges : a→b→c→d.
> ⚠ Il n'y a **pas de catégorie « quality_gate »** dans le catalogue ; la garde se construit avec `sql_script` + `filter` (escape hatch documenté). Endpoint utile : `POST /workflow/{id}/post-verify` (vérifie la sortie de chaque bloc après exec).

**Sample 18 — Deploy gouverné (approval-gated)** (approval-gated deploy)
Graphe identique au Sample 11. Flux : `POST /workflow/from-graph` → `POST /workflow/{id}/pre-check` → `POST /workflow/{id}/deployments` (DeploymentRequest) → `POST /workflow/{id}/deployments/{d}/approve` (Platform Admin) → `POST /workflow/{id}/deployments/{d}/execute` → `POST /workflow/{id}/deployments/{d}/verify`.

**Sample 19 — Sessionisation par pattern (multi-branche)** (transform_advanced complexe)
Objectif : détecter des séquences anormales puis brancher succès/échec sur deux destinations.
Nodes : `a source{EVENTS}` → `b time_slice{column:TS, slice_length:1, slice_unit:hour, output_column:HR}` → `c match_recognize{partition_by:[USER_ID], order_by:[TS], pattern:"(A B+ C)", define:[{B:"price>PREV(price)"}]}` → `d window_lag_lead{function:LAG, column:AMOUNT, order_by:[TS], output_column:PREV_AMT}`.
Branche 1 : `d → e1 filter{filter_condition:"MATCHED=1"} → f1 destination{MART.SESSIONS_OK}`.
Branche 2 : `d → e2 filter{filter_condition:"MATCHED=0"} → f2 export_file{stage_name:@QUARANTINE}`.
Edges : a→b→c→d ; d→e1→f1 ; d→e2→f2. (Sortie de `d` ré-utilisée deux fois — 2 arêtes sortantes autorisées.)

**Sample 20 — Pipeline complet multi-branche end-to-end** (le plus complexe)
Objectif : ingérer 2 sources + S3, joindre, enrichir IA, dériver KPI + cube + forecast, écrire 3 destinations.
Nodes :
- `s1 source{RAW.ORDERS}`, `s2 source{CRM.CUSTOMERS}`, `s3 s3_source{stage_name:@RAW_S3, file_path:'returns/', file_format:PARQUET}`
- `j1 join{INNER, left_key:CUSTOMER_ID, right_key:ID}` (s1 left, s2 right)
- `u1 union{all:true}` (j1 + s3, schémas alignés au préalable par `select`)
- `ai1 ai_classify{input_column:NOTES, categories:[VIP,CHURN,NORMAL], output_column:SEGMENT}`
- `f1 formula{expressions:[{alias:MARGIN, expression:"PRICE-COST"}]}`
- branche A KPI : `agg1 aggregate{group_by:[SEGMENT], aggregations:[SUM(MARGIN)→TOT_MARGIN]}` → `d1 destination{MART.SEGMENT_KPI, overwrite}`
- branche B cube : `rc1 rollup_cube{grouping_type:CUBE, group_by:[SEGMENT,REGION], aggregations:[SUM(MARGIN)→M]}` → `d2 dynamic_table{table_name:MART.MARGIN_CUBE_DT, target_lag:"5 minutes", warehouse:WH, query:"SELECT ..."}`
- branche C forecast : `dt1 date_transform{column:ORDER_TS, operation:DATE_TRUNC, unit:day, output_column:D}` → `fc1 forecast{timestamp_column:D, value_column:MARGIN, forecast_periods:14}` → `d3 destination{MART.MARGIN_FORECAST}`
Edges : s1→j1(left), s2→j1(right) ; j1→u1, s3→u1 ; u1→ai1→f1 ; f1→agg1→d1 ; f1→rc1→d2 ; f1→dt1→fc1→d3.
Flux endpoints : `POST /workflow/dry-run` → `from-graph` → `compile` → `execute?async_mode=true` → `GET /workflow/{id}/jobs` + `GET /workflow/{id}/runs` + `GET /workflow/{id}/block-events` ; échec → `POST /workflow/{id}/runs/{run}/analyze`.

### 5.bis — Fiche de test « ins / outs » des endpoints du cycle de vie

> Les 20 cas ci-dessus exercent le même petit ensemble d'endpoints de cycle de vie. Voici, pour chacun, les **entrées (INS)** et la **sortie consommée (OUTS)** — de quoi rejouer/tester chaque cas. Tous **`401` live** (déployés, sweep 2026-06-08) ; le test **fonctionnel authentifié** reste à faire (compte Snowflake de test expiré → un `401` prouve l'existence + le gardiennage, pas la logique métier).

| Étape | Endpoint | INS (body · path · query) | OUTS (réponse consommée) |
|-------|----------|---------------------------|--------------------------|
| valider le graphe | `POST /workflow/dry-run` | body `GraphDryRunRequest{nodes[], edges[]}` | `{valid, errors[], topological_order[]}` |
| créer | `POST /workflow/from-graph` | body `FromGraphRequest{project_name*, nodes[]{id,type,config}, edges[]{source,target,targetHandle?}, description?, tags?}` | `{project_id, step_id_map, steps_count, validation, errors?}` |
| compiler | `POST /workflow/{id}/compile` | path `{id}` · body `{}` | `{sql, cte_aliases[], topological_order[], destination, warnings?}` |
| valider | `POST /workflow/{id}/validate` | path `{id}` · body `{}` | `{valid, mode, steps_count, graph_nodes[], graph_edges[], last_runs[], recommendations[]}` |
| exécuter | `POST /workflow/{id}/execute` | path `{id}` · query `async_mode` · body `ExecuteRequest{trigger_type?, dry_run?}` | `{run_id, status, started_at, components_executed, rows_processed?, generated_sql[]}` |
| historique runs | `GET /workflow/{id}/runs` | path `{id}` · query `status,page,page_size` | `{runs[]{run_id,status,duration_seconds,steps_failed,error_log}, metrics{success_rate,p95_duration}}` |
| trace par bloc | `GET /workflow/{id}/block-events` | path `{id}` · query `run_id` | `{blocks[]{block_id,type,status,rows,duration_ms,error?}}` |
| planifier | `POST /workflow/{id}/schedule` | path `{id}` · body `ScheduleRequest{cron_choice*, custom_cron?, warehouse?, timeout_minutes?}` | `{cron_expression, state:'started', task_name}` |
| coût | `GET /workflow/{id}/cost-summary` | path `{id}` · query `days` | `{credits, estimated_cost_usd, by_task[]}` |
| DQ (clone réel) | `GET /workflow/{id}/clone-data-tests` | path `{id}` · query `connector_ids,max_tables` | `{per_block[]{block_id,rows,ok}, schema_dropped}` |
| déployer (gouverné) | `POST /workflow/{id}/deployments` (+ `/approve`·`/execute`·`/verify`) | path `{id}` · body `DeploymentRequest{version_id*, deployment_type?, scheduled_time?, config?, warehouse?}` | `{deployment_id, status}` |
| analyser échec (IA) | `POST /workflow/{id}/runs/{run}/analyze` | path `{id},{run}` | `{ai_analysis, cached?}` (+ CTA structuré proposé — cf. vault §D) |
| retry tâche | `POST /workflow/{id}/tasks/{task_id}/retry` | path `{id},{task_id}` | `{status, task_name}` |

> Renvoi : la matrice **gouvernance / DQ / coût / planification / historique (étapes·erreurs·retries)** et l'**optimisation cache par rôle** sont détaillées dans le vault `data360_full_doc/pages/workflow.md` §Enrichissement (2026-06-09).

## 6. UX front — validation 4 axes + accessibilité

| Axe | Verdict | Preuve (fichier:ligne) | Microcopy |
|-----|---------|------------------------|-----------|
| **loading** | ✓ | `loading.tsx:5` skeleton route-level `role="status" aria-label="Loading"` ; `ETLPipelineBuilder.tsx:546,654,696` états `isPipelineLoading`/`previewLoading`/`aiSuggestionsLoading` ; `useCacheAwareQuery` expose `isLoading` (`:834`) | skeletons animés (`animate-pulse`) |
| **empty** | ✓ | empty-canvas `ETLPipelineBuilder.tsx:3256-3262` ; tabs désactivés si canvas vide → fallback AI (`:1098-1099`) ; lifecycle phase `'empty'` (`:219,795`) | « Drag blocks from the left panel to start building your workflow » + « Connect blocks to define data flow, then click each block to configure it ». Palette : « No blocks match "{query}" » + suggestions (`ETLPalette.tsx:381-384`) |
| **error** | ✓ | `ErrorBoundary` au niveau page (`page.tsx:17`) ; `friendlyError()` traduit ~7 familles d'erreurs (`ETLPipelineBuilder.tsx:134-201`) ; `pipelineError` persistant dans le panneau Runs (`:701`) ; phase `'unavailable'` honnête au 404 (`is404`, `:208`) ; toasts « Backend Gap » explicites (`:2919`) | ex. « The data warehouse refused the compiled SQL » + hint actionnable ; « You don't have permission for this action » |
| **dark mode** | ✓ | 111 occurrences `dark:` dans `ETLPipelineBuilder.tsx` ; palette entièrement `dark:` (`ETLPalette.tsx:166-173` color map) ; `page.tsx:18` `dark:bg-gray-900` ; `loading.tsx` `dark:bg-gray-800/900` | — |

**Accessibilité** : `role="status"`/`aria-label="Loading"` sur le skeleton (`loading.tsx:5`) ; `aria-label="Create custom block"` (`ETLPalette.tsx:338`) ; champ recherche `focus:ring-2` (`:367`). ⚠ Le canvas React-Flow est intrinsèquement souris/drag — navigation clavier des nœuds **non vérifiée**.

## 7. Drift détecté (vs page-workflow.md + vs code)

1. **Taxonomie de blocs entièrement inventée dans page-workflow.md.** Le skill décrit des catégories/blocs **qui n'existent pas** dans les 79 blocks réels : « Cortex Complete / Translate / Summarize » (réel = `ai_complete`/`ai_translate`, et `ai_summarize` n'existe pas), catégorie **Control Flow** (If/Else, For-Each, Wait, Retry — **aucune**), catégorie **Quality Gates** (DMF Check, Row-Count Guard, Schema/Freshness/Privacy — **aucune**), catégorie **Notifications** (Slack/Teams/Webhook — **aucune**), « Iceberg Source », « Document AI » comme bloc node (réel = `document_ai` en ml_training, params différents). Les vraies catégories sont : source, transform, transform_advanced, destination, python, ml_training, ai_functions, templates.
2. **Endpoints inventés / faux paths dans page-workflow.md.** Le skill cite `POST /workflow/import-task`, `POST /workflow/templates`, `POST /workflow/git-repos`, `GET /workflow/services`, `POST /workflow/compute-pools`, `GET /workflow/{id}/runs/{run_id}/analyze` (en GET). Réel (slices) : `POST /workflow/tasks/import`, `POST /workflow/action-templates`, `POST /workflow/git/repositories`, `GET /workflow/compute-pools/{name}` (pas de liste/POST), et l'analyse de run est un **POST** `/workflow/{id}/runs/{run_id}/analyze`. Le skill décrit aussi des « sub-tabs » (Services SPCS, Compute Pools, Approvals) comme onglets — non confirmés comme tabs dans le code lu.
3. **`GET /workflow/{id}/runs/summary` appelé par le front mais absent des slices** (`workflowApi.ts:205`) → 404 / pas de handler backend (déjà noté comme tâche P1 dans page-workflow.md). De même `GET /workflow/catalog/blocks` (ajouté à api-contracts) est **non déployé** — le front utilise `GET /workflow/blocks`.

Autres écarts mineurs : page-workflow.md parle d'un « SmartRightBar » à 8 axes (« absent », 0/8) ; le rail droit réel est le panneau d'onglets de `ETLPipelineBuilder` + `WorkflowSmartPanel.tsx` — non équivalent au SmartRightBar décrit.

## 8. Propositions d'amélioration UX (PROPOSITIONS — pas d'édition de code)

1. **Badge « type ≠ id » dans la palette** pour les 3 blocs ml_training (`ETLPalette.tsx` PaletteItem) — éviter que l'auteur/LLM écrive `type:"finetune_model"`. Bénéfice : moins d'échecs de validation de graphe.
2. **Compteur d'arêtes manquantes sur les nœuds multi-input** (`join`/`merge`/`union`) dans `ETLNodeTypes.tsx` : afficher « 1/2 inputs » tant que `minInputs` non atteint. Bénéfice : feedback immédiat avant compile.
3. **Indicateur de source `cdc_merge`** : signaler visuellement qu'il requiert un input (contre-intuitif pour une catégorie « source »). Bénéfice : prévient l'erreur « source orpheline ».
4. **Lien « voir le SQL rendu » par bloc** branché sur `POST /workflow/blocks/{block_type}/render-sql` (déjà live). Bénéfice : transparence avant exécution. [trivial-safe] le bouton existe potentiellement déjà côté config-form — à vérifier.
5. **Empty-state palette : rendre les suggestions cliquables** (`ETLPalette.tsx:383` « Try: source, filter, join… » sont du texte statique) → en faire des boutons qui pré-remplissent la recherche. [trivial-safe]
6. **Désactiver honnêtement les actions au 404** déjà fait via phase `unavailable` ; étendre la même logique au bouton « runs summary » qui appelle un endpoint absent (`runs/summary`). Bénéfice : pas de bouton qui 404 silencieusement.
7. **`aria-label` sur le bouton de fermeture/toggle des `CategorySection`** (`ETLPalette.tsx:249`) — le `<button>` n'a qu'un contenu visuel. [trivial-safe]
8. **Lien « Data Quality » du footer** (`page.tsx:26`) : ajouter `target` cohérent + libellé indiquant qu'il s'agit d'un gate externe, puisque le module n'a pas de bloc quality-gate natif. Bénéfice : aligne l'attente utilisateur avec la réalité (cf. drift §7).

## 9. Plan de test fonctionnel

> Toutes les routes renvoient `401` sans token. Obtenir d'abord un JWT (login Data360), puis `-H "Authorization: Bearer $TOKEN"`. Rôle requis = module `workflow` actif + permission correspondante (`canWf*`).

```bash
BASE=https://<host>        # ex. http://localhost:80
H="-H Authorization:Bearer $TOKEN -H Content-Type:application/json"

# 1. Capacités (lecture — n'importe quel rôle avec module workflow)
curl -s $H "$BASE/workflow/capabilities"            # attendu 200 (401 sans token)

# 2. Catalogue de blocs server-driven (lecture)
curl -s $H "$BASE/workflow/blocks?executable_only=true"
curl -s $H "$BASE/workflow/blocks/categories"
curl -s $H "$BASE/workflow/blocks/aggregate"        # détail riche d'un bloc

# 3. Valider un graphe AVANT persistance (stateless dry-run) — rôle: create/edit
curl -s $H -X POST "$BASE/workflow/dry-run" \
  -d '{"nodes":[{"id":"n1","type":"source","config":{"database":"RAW","schema":"SALES","table":"ORDERS"}},
                {"id":"n2","type":"destination","config":{"database":"MART","schema":"K","table":"O","write_mode":"overwrite"}}],
       "edges":[{"source":"n1","target":"n2"}]}'      # attendu: rapport valid/erreurs

# 4. Créer en un coup depuis le graphe (canWfCreate) → renvoie {id}
WID=$(curl -s $H -X POST "$BASE/workflow/from-graph" -d '{...graph...}' | jq -r .id)

# 5. Compiler puis exécuter (canWfExecute)
curl -s $H -X POST "$BASE/workflow/$WID/compile"
curl -s $H -X POST "$BASE/workflow/$WID/execute?async_mode=true" -d '{}'

# 6. Suivre le run
curl -s $H "$BASE/workflow/$WID/runs?page=1&page_size=20"
curl -s $H "$BASE/workflow/$WID/block-events"
# échec → analyse IA
curl -s $H -X POST "$BASE/workflow/$WID/runs/<RUN_ID>/analyze"

# 7. Planifier (canWfExecute) puis pause/resume
curl -s $H -X POST "$BASE/workflow/$WID/schedule" -d '{"cron":"0 2 * * *","warehouse":"COMPUTE_WH"}'
curl -s $H -X POST "$BASE/workflow/$WID/schedule/pause"
curl -s $H -X POST "$BASE/workflow/$WID/schedule/resume"

# 8. Déploiement gouverné — create demande, Platform Admin approuve
DID=$(curl -s $H -X POST "$BASE/workflow/$WID/deployments" -d '{...}' | jq -r .deployment_id)
curl -s $H -X POST "$BASE/workflow/$WID/deployments/$DID/approve"   # rôle: canWfDeploy
curl -s $H -X POST "$BASE/workflow/$WID/deployments/$DID/execute"
curl -s $H -X POST "$BASE/workflow/$WID/deployments/$DID/verify"

# 9. Import de tasks Snowflake existantes
curl -s $H "$BASE/workflow/tasks/discover?database=PROD"
curl -s $H -X POST "$BASE/workflow/tasks/import" -d '{...TaskImportRequest...}'

# 10. Intégrations ad hoc
curl -s $H -X POST "$BASE/workflow/run-sql"    -d '{...RunSqlRequest...}'
curl -s $H -X POST "$BASE/workflow/run-python" -d '{...RunPythonRequest...}'
curl -s $H "$BASE/workflow/notebooks"
```

**Résultats attendus par capacité** :
- Sans token → **401 AUTH_REQUIRED** sur les 70 ops (contrat RBAC vérifié).
- `dry-run` sur graphe invalide (ex. `join` avec 1 seul input) → rapport d'erreurs `minInputs` non satisfait (règle graph_contract #3).
- `from-graph` → nouveau projet + `id` ; `compile` → DDL tasks ; `execute` async → entrée dans `GET /workflow/{id}/jobs`.
- `runs/summary` → **404** attendu (endpoint non déployé, cf. §7) : utiliser `GET /workflow/{id}/runs` à la place.
- Action sans la permission (ex. `execute` en lecture seule) → 403 + toast « view-only access » (`ETLPipelineBuilder.tsx:685`).
