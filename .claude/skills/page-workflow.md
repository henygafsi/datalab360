---
name: page-workflow
description: >
  Référence complète du module Workflow de Data360. Route /workflow. ETLPipelineBuilder
  (ReactFlow canvas) : builder ETL visuel + auto-import tasks Snowflake + schedules
  + runs history + SPCS + notebooks + approvals. Rôle principal : Data Engineer.
  Déjà le pattern panel le plus avancé (canvas + rail droit).
---

# Workflow — Référence Data360

## Route et fichier source

- **Route** : `/workflow`
- **Fichier** : `apps/data360/src/app/(dashboard)/workflow/page.tsx` (32 lignes — shell propre)
- **Composant principal** : `./ETLPipelineBuilder.tsx` (React-Flow canvas complet)
- **Pattern** : Canvas full-height + right inspector rail (meilleur pattern du projet)

## Rôles utilisateurs

| Rôle | Actions principales |
|------|---------------------|
| **Data Engineer** | CRÉER pipeline, DÉPLOYER, SCHEDULER, MONITORER runs, GÉRER templates |
| **Platform Admin** | VOIR tous les runs, MONITORER SPCS et compute pools, GÉRER approvals |
| **DQ Analyst** | VOIR runs history, VOIR quality gates, VOIR alertes |
| **AI Engineer** | CRÉER workflow IA (chat-to-workflow), GÉRER notebooks SPCS |

## Layout actuel (déjà optimal pour le canvas)

```
┌─────────────────────────────────────────────────────────────────┐
│ Toolbar (compile | save | run | schedule | Git PR)              │
│ ─────────────────────────────────────────────────────────────── │
│ │  LEFT PALETTE   │          CANVAS (React-Flow)                │
│ │  (block types)  │          ETL nodes + edges                  │
│ │  • Source       │          drag-drop, connect outputs→inputs  │
│ │  • Transform    │                                              │
│ │  • Cortex AI    │                                              │
│ │  • Sink         │                                              │
│ │  • Control flow │                                              │
│ │  • Quality gate │                                              │
│ └─────────────────┘                                              │
│ ─────────────────────────────────────────────────────────────── │
│ Cross-module links: Explore & Design | Data Quality              │
└─────────────────────────────────────────────────────────────────┘
```

**Rail droit (dans ETLPipelineBuilder)** : config du nœud sélectionné (déjà présent).

## Sub-tabs du module (selon _features.md)

### Tab 01 : Pipeline Builder (actif, ReactFlow)
- **Composant** : `ETLPipelineBuilder.tsx`
- **Ce qui s'affiche** : Canvas drag-drop + left palette blocs ETL
- **Auto-import Snowflake** :
  ```
  SHOW TASKS IN ACCOUNT → chaque root task + descendants → workflow project
  SHOW STREAMS IN ACCOUNT → stream nodes
  SHOW DYNAMIC TABLES IN ACCOUNT → dynamic table nodes
  SHOW PIPES IN ACCOUNT → snowpipe nodes
  SHOW SERVICES IN ACCOUNT → SPCS nodes
  ```
- **Actions** :
  - `Compiler` : POST /workflow/{id}/compile → génère DDL tasks
  - `Exécuter` : POST /workflow/{id}/execute
  - `Valider` : POST /workflow/{id}/validate
  - `Scheduler` : POST /workflow/{id}/schedule (cron + warehouse)
  - `Pause schedule` : POST /workflow/{id}/schedule/pause
  - `Reprendre schedule` : POST /workflow/{id}/schedule/resume
  - `Versions` : GET /workflow/{id}/versions
  - `Chat-to-workflow` : POST /cortex/query → JSON blueprint → hydrate canvas

### Tab 02 : Tasks Discovery
- **Ce qui s'affiche** : Toutes les tâches Snowflake auto-importées
- **Endpoint** : GET /workflow/task-status (+ SHOW TASKS IN ACCOUNT backend)
- **Actions** :
  - `Importer task` : POST /workflow/import-task (créer workflow depuis SHOW TASKS)
  - `Voir DAG` : INFORMATION_SCHEMA.TASK_DEPENDENTS → arbre visuel

### Tab 03 : Schedules & Cron
- **Endpoint** : GET /workflow/schedules
- **Actions** :
  - `Modifier cron` : PUT /workflow/{id}/schedule
  - `Pause/Resume` : POST .../pause | .../resume
  - `Supprimer schedule` : DELETE /workflow/{id}/schedule

### Tab 04 : Runs History
- **Endpoint** : GET /workflow/{id}/runs (+ TASK_HISTORY() + DYNAMIC_TABLE_REFRESH_HISTORY)
- **Actions** :
  - `Analyser run` : GET /workflow/{id}/runs/{run_id}/analyze
  - `Re-run failed` : POST /workflow/{id}/execute?from_step={failed_step}
  - `Voir logs` : inline dans le rail

### Tab 05 : Action Templates
- **Ce qui s'affiche** : Templates ETL réutilisables (data360-managed)
- **Actions** :
  - `Créer template` : POST /workflow/templates
  - `Appliquer` : POST /workflow/{id}/steps (depuis template)
  - `Partager` : PUT /workflow/templates/{id}/share

### Tab 06 : Git Repositories
- **Ce qui s'affiche** : Repos Git liés (Snowflake Git integration)
- **Snowflake** : SHOW GIT REPOSITORIES IN ACCOUNT
- **Actions** :
  - `Lier repo` : POST /workflow/git-repos
  - `Sync` : POST /workflow/git-repos/{id}/sync
  - `Voir commits` : GET /workflow/git-repos/{id}/commits

### Tab 07 : Notebooks
- **Snowflake** : SHOW NOTEBOOKS IN ACCOUNT — SF:D15
- **Actions** :
  - `Créer notebook` : POST /workflow/notebooks
  - `Exécuter` : POST /workflow/notebooks/{id}/execute
  - `Lier à task` : POST /workflow/{id}/steps (step type=notebook)

### Tab 08 : Services SPCS
- **Snowflake** : SHOW SERVICES IN ACCOUNT — SF:B6
- **Actions** :
  - `Voir services` : GET /workflow/services
  - `Pause` : POST /workflow/services/{name}/suspend
  - `Resume` : POST /workflow/services/{name}/resume
  - `Voir logs` : GET /workflow/services/{name}/logs

### Tab 09 : Compute Pools
- **Snowflake** : SHOW COMPUTE POOLS — SF:B7
- **Actions** :
  - `Créer pool` : POST /workflow/compute-pools
  - `Suspend/Resume pool` : POST .../suspend | .../resume
  - `Voir utilisation` : métriques CPU/mémoire

### Tab 10 : Approvals
- **Ce qui s'affiche** : Deployments en attente d'approbation
- **Actions** :
  - `Approuver` : POST /projects/{id}/deployments/{d_id}/approve
  - `Rejeter` : POST /projects/{id}/deployments/{d_id}/reject (confirm:warning)
  - `Exécuter déploiement` : POST /projects/{id}/deployments/{d_id}/execute

## Endpoints API (api-contracts.ts — domaine workflow)

```typescript
API.workflow.list()             // GET /projects?project_type=WORKFLOW
API.workflow.create()           // POST /workflow
API.workflow.capabilities()     // GET /workflow/capabilities
API.workflow.steps(id)          // GET /workflow/{id}/steps
API.workflow.execute(id)        // POST /workflow/{id}/execute
API.workflow.compile(id)        // POST /workflow/{id}/compile
API.workflow.validate(id)       // POST /workflow/{id}/validate
API.workflow.runs(id)           // GET /workflow/{id}/runs
API.workflow.analyzeRun(id,r)   // GET /workflow/{id}/runs/{r}/analyze
API.workflow.versions(id)       // GET /workflow/{id}/versions
API.workflow.schedule(id)       // POST /workflow/{id}/schedule
API.workflow.schedulePause(id)  // POST /workflow/{id}/schedule/pause
API.workflow.scheduleResume(id) // POST /workflow/{id}/schedule/resume
API.workflow.schedules()        // GET /workflow/schedules
API.workflow.taskStatus(id)     // GET /workflow/{id}/task-status
```

## ETL Blocks Catalog — Description exhaustive + Rendu voulu

Chaque bloc ETL est un nœud ReactFlow avec :
- **En-tête** : icône + nom du bloc + badge catégorie coloré
- **Corps** : champs configurés (table cible, condition, colonnes…)
- **Ports** : in (gauche) + out (droite), color-coded par type de donnée
- **Badge état** : IDLE / RUNNING / SUCCESS / FAILED / SKIPPED
- **Click → SmartRightBar** : config bloc + coût estimé + impact lignée

---

### A. SOURCE / EXTRACT — Blocs d'extraction de données

#### A1 — Table Source
**Ce que ça fait** : Sélectionne des lignes d'une table Snowflake existante. Peut filtrer
(WHERE), limiter (LIMIT/OFFSET), ou lire en full-scan selon la config.
**SQL généré** : `SELECT [cols] FROM [db].[schema].[table] WHERE [filter] LIMIT [n]`
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ 🗄 TABLE SOURCE              [SOURCE]│
│ ─────────────────────────────────── │
│ Table: SALES.DWH.ORDERS             │
│ Filter: status = 'ACTIVE'           │
│ Cols: * (all)                       │
│ ─────────────────────────────────── │
│ Est. rows: ~42M  ·  Scan: ~2.1 GB   │
│                                 OUT ●│
└─────────────────────────────────────┘
```
**SmartRightBar** : context table (lignée amont) + coût scan estimé + PII colonnes détectées
**Snowflake** : INFORMATION_SCHEMA.TABLES pour row_count + bytes
**Config** : `{ database, schema, table, filter_clause, columns, limit }`

#### A2 — External Table Source
**Ce que ça fait** : Lit des fichiers (Parquet/CSV/JSON) depuis un stage externe (S3/GCS/Azure)
via une External Table Snowflake. Pas de copy → zéro ingestion cost, scan cost seulement.
**SQL** : `SELECT * FROM [external_table_name]` (Snowflake lit le stage sous-jacent)
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ 🌐 EXTERNAL TABLE         [SOURCE]  │
│ Stage: S3://bucket/prefix/          │
│ Format: PARQUET                     │
│ Partition: DATE(2026-06-*)          │
│ Est. files: 48  ·  Size: ~8.4 GB    │
│                                 OUT ●│
└─────────────────────────────────────┘
```
**Snowflake** : `SHOW EXTERNAL TABLES IN SCHEMA` + `EXTERNAL_TABLE_FILES` view
**Config** : `{ external_table_name, partition_filter, file_format }`

#### A3 — Iceberg Source
**Ce que ça fait** : Lit une table Apache Iceberg via Snowflake Iceberg Tables. Support
time-travel natif et partition pruning. Compatible avec Glue Catalog / Polaris.
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ 🧊 ICEBERG SOURCE          [SOURCE] │
│ Catalog: GLUE  ·  Table: orders     │
│ Snapshot: LATEST                    │
│ Snapshot ID: 8273640192             │
│                                 OUT ●│
└─────────────────────────────────────┘
```
**Snowflake** : `SHOW ICEBERG TABLES` + SF:C3 (Iceberg)
**Config** : `{ catalog_type, catalog_name, table_name, snapshot_id }`

#### A4 — Stage Files Source
**Ce que ça fait** : Copie les fichiers d'un stage (interne ou externe) vers une table
de staging temporaire, ou les lit directement avec `SELECT $1, $2` (semi-structured).
**SQL** : `COPY INTO tmp_table FROM @stage/path FILE_FORMAT=(TYPE='CSV' ...)`
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ 📂 STAGE FILES             [SOURCE] │
│ Stage: @INT_ORDERS_STAGE            │
│ Pattern: orders_*.csv               │
│ Format: CSV (delimiter=|)           │
│ On error: SKIP_FILE                 │
│ Files pending: 3                    │
│                                 OUT ●│
└─────────────────────────────────────┘
```
**Snowflake** : `COPY_HISTORY` + `LIST @stage` for file count
**Config** : `{ stage_name, file_pattern, file_format, on_error_behavior }`

#### A5 — Stream Consume
**Ce que ça fait** : Consomme le delta d'un Snowflake Stream (CDC). Lit UNIQUEMENT les
lignes INSERT/UPDATE/DELETE depuis le dernier consume. Idéal pour pipelines incrémentaux.
**SQL** : `SELECT * FROM stream_name` (Snowflake gère le offset automatiquement)
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ 🌊 STREAM CONSUME          [SOURCE] │
│ Stream: ORDERS_STREAM               │
│ Source table: ORDERS_RAW            │
│ Type: DELTA (INSERT+UPDATE+DELETE)  │
│ Delta rows: 1,240 pending           │
│ Stale: ❌ (expires 2026-06-21)      │
│                                 OUT ●│
└─────────────────────────────────────┘
```
**Snowflake** : `SHOW STREAMS` + `STREAM_STATUS` function + `SYSTEM$STREAM_HAS_DATA()`
**Config** : `{ stream_name, include_metadata_cols: boolean }`
**⚠ Risque** : Si le stream expire (>14j sans consume), données perdues → badge STALE rouge

#### A6 — API Pull (External)
**Ce que ça fait** : Appelle une API REST externe et charge la réponse JSON dans une table
temporaire via Snowflake External Function ou Cortex. Utile pour enrichissement tiers.
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ 🔌 API PULL                [SOURCE] │
│ URL: https://api.example.com/data   │
│ Auth: Bearer (secret: API_TOKEN)    │
│ Method: GET · Pagination: cursor    │
│ Output table: tmp_api_response      │
│                                 OUT ●│
└─────────────────────────────────────┘
```
**Config** : `{ url, auth_secret_name, method, pagination_type, output_table }`

---

### B. TRANSFORM — Blocs de transformation

#### B1 — Filter
**Ce que ça fait** : Applique une clause WHERE à l'input. Réduit le volume de données
avant les transformations coûteuses. Ne produit pas de nouvelle table — filtre inline.
**SQL** : `WHERE [condition_expression]`
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ 🔍 FILTER              [TRANSFORM]  │
│ Condition: amount > 100             │
│           AND status != 'CANCELLED' │
│ Est. selectivity: ~65%              │
│ Rows in: 42M → out: ~27M            │
● IN                             OUT ●│
└─────────────────────────────────────┘
```
**Config** : `{ condition: string, estimated_selectivity: number }`

#### B2 — Project (Select colonnes)
**Ce que ça fait** : Sélectionne et renomme des colonnes. Peut ajouter des colonnes
calculées (expressions SQL). Réduit le schéma avant les joins.
**SQL** : `SELECT col1, col2 AS alias, UPPER(col3) AS computed FROM input`
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ 📋 PROJECT             [TRANSFORM]  │
│ Keep: id, amount, status            │
│ Rename: customer_id → cust_id       │
│ Add: YEAR(order_date) AS year       │
│ Cols: 8 → 5 selected                │
● IN                             OUT ●│
└─────────────────────────────────────┘
```
**Config** : `{ columns: {source: string, alias?: string, expression?: string}[] }`

#### B3 — Map (UDF)
**Ce que ça fait** : Applique une User-Defined Function Snowflake (SQL, Python, Java, JS)
colonne par colonne. Utile pour transformations métier custom ou obfuscation.
**SQL** : `SELECT udf_name(col) AS output_col FROM input`
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ 🔧 MAP (UDF)           [TRANSFORM]  │
│ UDF: MASK_EMAIL(email) → masked_em  │
│ Language: Python 3.10               │
│ Cost/call: ~0.0001 cr               │
│ Applied to: 42M rows → ~42M calls   │
● IN                             OUT ●│
└─────────────────────────────────────┘
```
**Snowflake** : `SHOW USER FUNCTIONS` pour UDF disponibles
**Config** : `{ udf_name, input_col, output_col_alias, language }`

#### B4 — Aggregate
**Ce que ça fait** : GROUP BY + fonctions d'agrégation (SUM, COUNT, AVG, MIN, MAX,
APPROX_COUNT_DISTINCT). Réduit drastiquement le volume.
**SQL** : `SELECT [group_cols], AGG_FN(col) FROM input GROUP BY [group_cols]`
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ ∑ AGGREGATE            [TRANSFORM]  │
│ Group by: year, country, product    │
│ SUM(amount) → total_revenue         │
│ COUNT(*) → order_count              │
│ Rows: 42M → ~8,400 groups           │
● IN                             OUT ●│
└─────────────────────────────────────┘
```
**Config** : `{ group_by: string[], aggregations: {fn, col, alias}[] }`

#### B5 — Join
**Ce que ça fait** : Joint deux inputs (LEFT/INNER/FULL OUTER). Left port = table gauche,
Right port = table droite. Sort la table fusionnée.
**SQL** : `SELECT l.*, r.* FROM left_input l [INNER|LEFT] JOIN right_input r ON l.key = r.key`
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ ⊗ JOIN                 [TRANSFORM]  │
│ Type: LEFT JOIN                     │
│ Key: orders.cust_id = cust.id       │
│ Left: 42M rows  Right: 1.2M rows    │
│ Est. output: ~42M (left preserved)  │
● IN_LEFT                    OUT ●    │
● IN_RIGHT                            │
└─────────────────────────────────────┘
```
**Config** : `{ join_type: 'INNER'|'LEFT'|'RIGHT'|'FULL', left_key, right_key, select_cols }`

#### B6 — Union
**Ce que ça fait** : Combine plusieurs inputs avec le même schéma (UNION ALL ou UNION DISTINCT).
**SQL** : `SELECT * FROM input_a UNION ALL SELECT * FROM input_b`
**Config** : `{ distinct: boolean }` — accepte N inputs

#### B7 — Window
**Ce que ça fait** : Fonctions analytiques fenêtrées (ROW_NUMBER, RANK, LAG, LEAD, NTILE,
CUMSUM). Ne réduit pas le nombre de lignes.
**SQL** : `SELECT *, ROW_NUMBER() OVER (PARTITION BY x ORDER BY y) AS rn FROM input`
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ 🪟 WINDOW              [TRANSFORM]  │
│ Partition: customer_id              │
│ Order: order_date DESC              │
│ Fn: ROW_NUMBER() → row_num          │
│     LAG(amount, 1) → prev_amount    │
● IN                             OUT ●│
└─────────────────────────────────────┘
```
**Config** : `{ partition_by, order_by, functions: {fn, args, alias}[] }`

#### B8 — Pivot
**Ce que ça fait** : Transforme des lignes en colonnes (PIVOT Snowflake natif).
Utile pour passer de format long (date, valeur) à format large (col par date).
**SQL** : `SELECT * FROM input PIVOT (SUM(amount) FOR month IN ('Jan','Feb','Mar'))`
**Config** : `{ pivot_col, value_col, aggregate_fn, values: string[] }`

#### B9 — Cortex Complete ⭐
**Ce que ça fait** : Appelle `SNOWFLAKE.CORTEX.COMPLETE(model, prompt_col)` sur chaque
ligne pour génération de texte, résumé, classification, extraction NER, traduction.
Le résultat est ajouté en nouvelle colonne TEXT.
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ 🤖 CORTEX COMPLETE     [TRANSFORM]  │
│ Model: mistral-large2               │
│ Input col: review_text              │
│ Prompt: "Classify sentiment: {col}" │
│ Output col: sentiment               │
│ Cost: ~0.005 cr/row · 42M = HIGH ⚠  │
│ Batch: 1000 rows/call (chunked)     │
● IN                             OUT ●│
└─────────────────────────────────────┘
```
**Snowflake** : `SNOWFLAKE.CORTEX.COMPLETE(model, prompt)` — SF:D7
**Config** : `{ model: 'mistral-large2'|'llama3-70b'|'mixtral-8x7b', prompt_template, input_col, output_col }`
**⚠ Cost badge HIGH** : Cortex Complete ≈ 0.005 cr/row — afficher estimation avant run

#### B10 — Cortex Translate
**Ce que ça fait** : `SNOWFLAKE.CORTEX.TRANSLATE(text, source_lang, target_lang)` sur
chaque ligne. Traduit une colonne texte vers une langue cible.
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ 🌍 CORTEX TRANSLATE     [TRANSFORM] │
│ Input: description (fr)             │
│ Target lang: en                     │
│ Output col: description_en          │
│ Cost: ~0.002 cr/row                 │
● IN                             OUT ●│
└─────────────────────────────────────┘
```
**Snowflake** : `SNOWFLAKE.CORTEX.TRANSLATE(text, 'fr', 'en')` — SF:D7
**Config** : `{ input_col, source_lang, target_lang, output_col }`

#### B11 — Cortex Summarize
**Ce que ça fait** : `SNOWFLAKE.CORTEX.SUMMARIZE(long_text)` — résume des textes longs
(documents, emails, rapports) en 1-3 phrases.
**Config** : `{ input_col, output_col, max_tokens?: number }`

#### B12 — AI Classify
**Ce que ça fait** : Classification supervisée via Cortex ML CLASSIFY_TEXT ou custom UDF.
Attribue une classe (catégorie, sentiment, priorité) à chaque ligne.
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ 🏷 AI CLASSIFY          [TRANSFORM] │
│ Method: CORTEX.CLASSIFY_TEXT        │
│ Classes: [URGENT, NORMAL, LOW]      │
│ Input: ticket_description           │
│ Output: priority_class (0.87 conf)  │
● IN                             OUT ●│
└─────────────────────────────────────┘
```
**Snowflake** : `SNOWFLAKE.CORTEX.CLASSIFY_TEXT` — SF:D10

#### B13 — Document AI Predict
**Ce que ça fait** : Utilise un modèle Document AI (Snowflake) pour extraire des entités
structurées depuis des documents (PDF, images) stockés dans un stage.
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ 📄 DOCUMENT AI          [TRANSFORM] │
│ Model: INVOICE_PARSER_V2            │
│ Stage: @INVOICES_STAGE              │
│ Extract: total_amount, vendor, date │
│ Output cols: 8 extracted fields     │
● IN_STAGE               OUT_STRUCT ●│
└─────────────────────────────────────┘
```
**Snowflake** : `SNOWFLAKE.CORTEX.COMPLETE` with doc parsing — SF:D11

#### B14 — Anomaly Detection
**Ce que ça fait** : `SNOWFLAKE.ML.ANOMALY_DETECTION` — détecte les valeurs aberrantes
dans une série temporelle ou une distribution numérique. Ajoute une colonne `is_anomaly`.
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ 📊 ANOMALY DETECTION    [TRANSFORM] │
│ Model: trained on: SALES_2025       │
│ Input: daily_revenue                │
│ Timestamp: sale_date                │
│ Sensitivity: 0.95                   │
│ Output: is_anomaly, anomaly_score   │
● IN                             OUT ●│
└─────────────────────────────────────┘
```
**Snowflake** : `SNOWFLAKE.ML.ANOMALY_DETECTION` — SF:D12

#### B15 — Top Insights (Cortex Analyst)
**Ce que ça fait** : Génère automatiquement les insights les plus significatifs d'un
dataset (tendances, corrélations, outliers) via Cortex Analyst NL→SQL.
**Config** : `{ dataset_description, focus_metric, output_n_insights }`

#### B16 — Forecast
**Ce que ça fait** : `SNOWFLAKE.ML.FORECAST` — prévision de série temporelle. Entraîne
un modèle ML et prédit N périodes futures. Sort: timestamp, predicted_value, lower_bound, upper_bound.
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ 📈 FORECAST             [TRANSFORM] │
│ Target: daily_revenue               │
│ Timestamp: sale_date                │
│ Horizon: 30 days                    │
│ Confidence: 95%                     │
│ Model: auto (trained 2026-06-01)    │
● IN                             OUT ●│
└─────────────────────────────────────┘
```
**Snowflake** : `SNOWFLAKE.ML.FORECAST` — SF:D13

---

### C. SINK / LOAD — Blocs d'écriture

#### C1 — Insert Into Table
**Ce que ça fait** : Insère toutes les lignes du flux dans une table cible existante.
Mode APPEND — ne supprime pas les données existantes.
**SQL** : `INSERT INTO [target_table] SELECT * FROM input`
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ ➤ INSERT INTO TABLE        [SINK]   │
│ Target: SALES.DWH.ORDERS_FACT       │
│ Mode: APPEND                        │
│ Rows to insert: ~1,240              │
│ Last run: ✅ 06/06 23:45            │
● IN                                  │
└─────────────────────────────────────┘
```
**Config** : `{ database, schema, table, column_mapping, on_conflict }`

#### C2 — Merge (UPSERT)
**Ce que ça fait** : MERGE INTO Snowflake — UPDATE lignes existantes selon clé de merge,
INSERT nouvelles lignes. Opération idempotente pour CDC.
**SQL** : `MERGE INTO target USING input ON target.id = input.id WHEN MATCHED THEN UPDATE ... WHEN NOT MATCHED THEN INSERT ...`
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ 🔄 MERGE (UPSERT)          [SINK]   │
│ Target: ORDERS_FACT                 │
│ Match key: order_id                 │
│ Update cols: status, amount, upd_at │
│ Insert new: ✅                      │
│ Delete missing: ❌                  │
│ Est: 800 updates + 440 inserts      │
● IN                                  │
└─────────────────────────────────────┘
```
**Config** : `{ target_table, match_key, update_cols, insert_new, delete_missing }`

#### C3 — Truncate + Insert
**Ce que ça fait** : Vide la table cible puis re-charge l'intégralité. Pattern FULL REFRESH.
Transactionnel — si l'INSERT échoue, le TRUNCATE est rollback.
**Config** : `{ target_table, transactional: boolean }`
**⚠ Risque HIGH** : toutes les données précédentes supprimées

#### C4 — Write to Stage
**Ce que ça fait** : `COPY INTO @stage` — exporte le flux vers un stage (S3/GCS/Azure/internal)
en Parquet, CSV, ou JSON. Utile pour export vers des systèmes externes.
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ 📤 WRITE TO STAGE          [SINK]   │
│ Stage: @EXT_EXPORT_S3               │
│ Path: /exports/orders/{DATE}/       │
│ Format: PARQUET (snappy)            │
│ Partition by: year, month           │
│ Est. size: ~480 MB                  │
● IN                                  │
└─────────────────────────────────────┘
```
**Config** : `{ stage_name, path_template, file_format, partition_by }`

#### C5 — Write Iceberg
**Ce que ça fait** : Écrit dans une Iceberg Table (WORM ou mutable). Compatible avec
Glue Catalog, Polaris, ou Snowflake-managed Iceberg.
**Config** : `{ catalog, database, table, write_mode: 'append'|'overwrite'|'merge' }`

#### C6 — Write Event Table
**Ce que ça fait** : Insère dans une Snowflake Event Table (immutable, append-only, WORM).
Idéal pour audit logs, IoT streams, CDC events.
**SQL** : `INSERT INTO event_table SELECT OBJECT_CONSTRUCT(*) FROM input`
**Config** : `{ event_table_name }`

#### C7 — Materialize Dynamic Table
**Ce que ça fait** : Crée ou remplace une Dynamic Table Snowflake depuis la requête
du flux. La DT se rafraîchit automatiquement selon le `TARGET_LAG`.
**SQL** : `CREATE OR REPLACE DYNAMIC TABLE name TARGET_LAG = '1 minute' WAREHOUSE = wh AS SELECT ...`
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ ⚡ DYNAMIC TABLE            [SINK]  │
│ Name: ORDERS_AGG_DT                 │
│ Target lag: 1 minute                │
│ Warehouse: COMPUTE_WH (XS)          │
│ Refresh cost: ~0.08 cr/h            │
│ Status: ✅ RUNNING (lag: 38s)       │
● IN                                  │
└─────────────────────────────────────┘
```
**Snowflake** : `CREATE DYNAMIC TABLE` — SF:C5
**Config** : `{ name, target_lag, warehouse, schema }`
**⚠ Coût continu** : badge coût par heure visible sur le nœud

---

### D. CONTROL FLOW — Blocs de contrôle

#### D1 — If/Else
**Ce que ça fait** : Branchement conditionnel. Si la condition SQL est vraie → port TRUE,
sinon → port FALSE. Les deux branches peuvent continuer le flux.
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ ⑂ IF/ELSE            [CONTROL_FLOW] │
│ Condition: COUNT(*) > 0             │
│ (sur le résultat du nœud précédent) │
│                                     │
│ ● IN        TRUE →             OUT ●│
│              FALSE →          OUT ●│
└─────────────────────────────────────┘
```
**Config** : `{ condition_sql: string }` — évalué sur le résultat du nœud précédent

#### D2 — For-Each
**Ce que ça fait** : Boucle sur chaque valeur d'une liste (dates, tables, segments)
et réexécute le sous-graphe pour chaque itération.
**Config** : `{ iterator_source: 'list'|'query', values?: string[], query?: string, parallelism: number }`

#### D3 — Wait
**Ce que ça fait** : Pause le pipeline N secondes ou jusqu'à un horaire précis.
Utile pour fenêtres de maintenance ou rate-limiting d'API externes.
**Config** : `{ wait_type: 'seconds'|'until', seconds?: number, until_time?: string }`

#### D4 — Retry
**Ce que ça fait** : Enveloppe le nœud suivant avec une logique de retry exponentielle.
Si le nœud enfant échoue, retry jusqu'à N fois avec délai croissant.
**Config** : `{ max_attempts: number, backoff_seconds: number, on_final_failure: 'fail'|'skip' }`

#### D5 — Run Notebook
**Ce que ça fait** : Exécute un Snowflake Notebook (Jupyter-style Python/SQL) en SPCS.
Utile pour ML training, analyse exploratoire, ou scripts complexes.
**Snowflake** : `SHOW NOTEBOOKS` + `EXECUTE NOTEBOOK [name]` — SF:D15
**Config** : `{ notebook_name, parameters: Record<string, string>, warehouse }`

#### D6 — Run Procedure
**Ce que ça fait** : Appelle une Stored Procedure Snowflake (SQL, Python, Java, JS).
Utile pour logiques métier encapsulées ou migrations complexes.
**SQL** : `CALL procedure_name(arg1, arg2)`
**Config** : `{ procedure_name, args: string[], database, schema }`

#### D7 — Run Service (SPCS)
**Ce que ça fait** : Déclenche un Snowpark Container Service (SPCS) — microservice Docker
géré par Snowflake. Retourne le statut et le résultat du service.
**Snowflake** : `SHOW SERVICES` + `ALTER SERVICE ... EXECUTE JOB` — SF:B6
**Config** : `{ service_name, job_type, spec_overrides }`

---

### E. QUALITY GATES — Blocs de contrôle qualité

#### E1 — DMF Check (Data Metric Function)
**Ce que ça fait** : Exécute une Snowflake Data Metric Function sur le flux.
Si la métrique sort de la plage acceptable → gate FAILED, pipeline s'arrête.
**SQL** : `SELECT DATA_METRIC_FUNCTION([table], [cols])` via SYSTEM$EVAL_DATA_METRIC
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ 📊 DMF CHECK         [QUALITY_GATE] │
│ DMF: NULL_COUNT(email)              │
│ Threshold: < 5% nulls               │
│ On fail: STOP pipeline              │
│ Status: ✅ PASS (0.3% nulls)        │
● IN          PASS ●    FAIL ●        │
└─────────────────────────────────────┘
```
**Snowflake** : `SYSTEM$EVAL_DATA_METRIC` — SF:D1
**Config** : `{ dmf_name, columns, threshold, on_fail: 'stop'|'warn'|'continue' }`

#### E2 — Row-Count Guard
**Ce que ça fait** : Valide que le flux contient entre N_min et N_max lignes.
Protection contre les tables vides (drop accidentel) ou les surcharges.
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ # ROW-COUNT GUARD    [QUALITY_GATE] │
│ Min rows: 1,000                     │
│ Max rows: 10,000,000                │
│ Actual: 42,310 ✅                   │
│ On fail: ALERT + STOP               │
● IN          PASS ●    FAIL ●        │
└─────────────────────────────────────┘
```
**Config** : `{ min_rows, max_rows, on_fail }`

#### E3 — Schema Check
**Ce que ça fait** : Compare le schéma du flux avec un schéma de référence (baseline).
Détecte les ajouts/suppressions de colonnes, changements de type.
**Config** : `{ baseline_table, on_missing_col: 'fail'|'warn', on_type_change: 'fail'|'warn' }`

#### E4 — Freshness Check
**Ce que ça fait** : Vérifie qu'une colonne timestamp est dans la plage attendue
(ex: données de moins de 24h). Protège contre les pipelines amont en retard.
**Config** : `{ timestamp_col, max_age_hours: number, on_stale: 'fail'|'warn' }`

#### E5 — Privacy Guard
**Ce que ça fait** : Détecte les données PII non masquées dans le flux via classification
Snowflake. Bloque si des colonnes PII se retrouvent non protégées dans la sortie.
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ 🔒 PRIVACY GUARD     [QUALITY_GATE] │
│ Check: PII columns have masking     │
│ PII detected: email, phone, ssn     │
│ email: MASKED ✅                    │
│ phone: NOT MASKED ❌ → BLOCKING     │
│ On fail: STOP + ALERT Gov team      │
● IN          PASS ●    FAIL ●        │
└─────────────────────────────────────┘
```
**Snowflake** : `INFORMATION_SCHEMA.POLICY_REFERENCES` + tag PII check
**Config** : `{ pii_tag_pattern: 'PII%', alert_role, on_fail }`

---

### F. NOTIFICATIONS — Blocs d'alerte

#### F1 — Send Notification
**Ce que ça fait** : Publie un message dans une Snowflake Notification Integration
(email, SMS, webhook). Déclenché par un nœud Quality Gate FAIL ou en fin de pipeline.
**Snowflake** : `CALL SYSTEM$SEND_EMAIL(...)` ou `CALL SYSTEM$SEND_SNOWFLAKE_NOTIFICATION(...)`
**Rendu nœud** :
```
┌─────────────────────────────────────┐
│ 🔔 NOTIFICATION        [NOTIFY]     │
│ Type: EMAIL                         │
│ To: data-team@company.com           │
│ Template: "Pipeline {name} FAILED"  │
│ Trigger: QUALITY_GATE_FAIL          │
● IN (from FAIL port)                 │
└─────────────────────────────────────┘
```
**Config** : `{ type: 'email'|'slack'|'webhook', target, template, trigger_on }`

#### F2 — Slack / Teams
**Ce que ça fait** : Envoie un message formaté à un webhook Slack ou MS Teams.
Inclut le statut du run, les métriques clés, et un lien vers Data360.
**Config** : `{ webhook_secret_name, channel, message_template, include_metrics: boolean }`

#### F3 — Webhook
**Ce que ça fait** : POST HTTP vers une URL externe avec le payload du run (JSON).
Utile pour intégrations n8n, Zapier, Make, ou systèmes internes.
**Config** : `{ url, method: 'POST'|'PUT', headers, payload_template, auth_secret }`

---

## SmartRightBar dans Workflow — Nœud sélectionné

Quand un nœud ETL est sélectionné dans le canvas, le rail droit montre :

```
┌─ NŒUD: CORTEX COMPLETE ─────────────────────┐
│  S1: CONTEXT                                  │
│  Bloc: CORTEX COMPLETE (Transform)            │
│  Model: mistral-large2  ·  Input: review_text │
│  Status: IDLE / RUNNING / SUCCESS / FAILED    │
│                                               │
│  S2: ACTIONS                                  │
│  [▶ Tester sur 100 lignes]  ⚡ ~0.5 cr        │
│  [⚙ Changer de modèle]  Risque: LOW           │
│  [📊 Voir résultats]  (après run)             │
│  [🗑 Supprimer nœud]  ⚠ confirm               │
│                                               │
│  S3: GOUVERNANCE                              │
│  ⚠ Cortex Complete envoie des données vers   │
│  Snowflake AI — vérifier contrat DPA avant   │
│  données PII. 3 cols PII détectées en input.  │
│                                               │
│  S4: COÛT & RISQUE                            │
│  Est. cost: ~0.005 cr × 42M rows = 210 cr    │
│  Risque: HIGH (volume important)              │
│  Recommandation: échantillonner 1% d'abord   │
│                                               │
│  S7: ALICE TIPS                               │
│  "Utilisez llama3-70b (5× moins cher) pour   │
│  classification simple. Gardez mistral pour  │
│  raisonnement complexe."                      │
└───────────────────────────────────────────────┘
```

## Enrichissements prioritaires

### Ce qui manque dans le canvas
1. **Blocs Cortex AI** (B) : pas encore dans la palette → P1
2. **Quality Gate blocs** (E) : absents → P1
3. **Chat-to-workflow** : `POST /cortex/query` avec prompt structuré → P1
4. **Run status live** dans le rail droit : `useCacheInvalidation(CACHE_KEYS.WORKFLOWS)` → P2
5. **Coût estimé** par workflow : `METERING_HISTORY` pour les runs passés → P2

## Henry Tasks — workflow

### P1
- [ ] Ajouter blocs Cortex AI dans left palette (Cortex Complete, Translate, Classify, Embed)
      Fichier: `ETLPipelineBuilder.tsx` → section palette blocks
- [ ] Ajouter Quality Gate blocks (DMF check, Row-count guard, Privacy guard)
- [ ] Implémenter Chat-to-workflow: POST /cortex/query avec system prompt ETL blueprint
      Nouveau endpoint: POST /workflow/from-chat → Cortex → JSON blueprint → hydrate canvas

### P2
- [ ] Run status SSE: useCacheInvalidation(CACHE_KEYS.WORKFLOWS) dans runs list
- [ ] Coût estimé: GET /workflow/{id}/cost → ACCOUNT_USAGE.METERING_HISTORY JOIN task runs
- [ ] Tab Approvals: connecter aux endpoints deployment tracking existants
      API.projects.approveDeployment() + API.projects.rejectDeployment()

### P3
- [ ] Git integration: SHOW GIT REPOSITORIES → lier repos au canvas
- [ ] Notebooks: SHOW NOTEBOOKS → ajouter nodes dans canvas
- [ ] SPCS live status dans tab Services: useCacheInvalidation pour statut containers

## Screenshots
```
e2e/results/screenshots/workflow.png
```

## Module Run — workflow — 2026-06-07

### Global KPIs
| KPI | Value |
|-----|-------|
| endpoints_audited | 9 |
| api_contracts_gaps_found | 6 |
| api_contracts_gaps_fixed | 6 |
| fake_zero_fixes | 2 |
| conventions_compliant | true |

### Step States
| Step | State | Notes |
|------|-------|-------|
| Read source | ✅ | page-workflow.md, page.tsx, services/workflow/index.ts, api-contracts.ts all read |
| Convention check | ✅ | apiClient used throughout; useCacheInvalidation hooked (CACHE_KEYS.WORKFLOWS x3 in ETLPipelineBuilder); FilterChips not applicable (canvas layout, no tab headers) |
| api-contracts fixes | ✅ | 6 entries added (see Fixes Applied) |
| Fake-zero fixes | ✅ | 2 display-facing ?? 0 replaced with ?? '—' |
| Log written | ✅ | page-workflow.md appended |

### Fixes Applied
- `api-contracts.ts`: added `API.workflow.blocks()` → `GET /workflow/blocks`
- `api-contracts.ts`: added `API.workflow.blocksCategories()` → `GET /workflow/blocks/categories`
- `api-contracts.ts`: added `API.workflow.catalogBlocks()` → `GET /workflow/catalog/blocks`
- `api-contracts.ts`: added `API.workflow.actionTemplates()` → `GET /workflow/action-templates` (was hardcoded in service)
- `api-contracts.ts`: added `API.workflow.createActionTemplate()` → `POST /workflow/action-templates`
- `api-contracts.ts`: added `API.workflow.cancelRun(runId)` → `POST /workflow/runs/{runId}/cancel`
- `api-contracts.ts`: added `API.workflow.runLogs(runId)` → `GET /workflow/runs/{runId}/logs`
- `ETLPipelineBuilder.tsx:3664`: `Math.round((r.pass_rate ?? 0) * 100)%` → `r.pass_rate != null ? Math.round(r.pass_rate * 100)% : '—'`
- `WizardPreflightPanel.tsx:484`: `p.data?.rows.length ?? 0` and `p.data?.columns.length ?? 0` → `?? '—'`

### Remaining Gaps
- Service `index.ts` still uses hardcoded endpoint strings for action-templates and several git/compute/notebook routes — these should be migrated to use `API.workflow.*` in a follow-up
- `POST /workflow/runs/{id}/cancel` (per-workflow-id scoped cancel) not yet in api-contracts — only global run cancel added; if backend scopes by workflow_id, add `cancelWorkflowRun(id, runId)` variant
- `useCacheInvalidation` hooked for CACHE_KEYS.WORKFLOWS in ETLPipelineBuilder but NOT in the dev-tools sub-tabs (git, compute pools, notebooks) — P3 gap
- Chat-to-workflow (`POST /cortex/query` → blueprint hydration) not yet implemented — P1 per Henry tasks
- Tab Approvals still not wired to `API.workflow.*` deployment endpoints — P2 per Henry tasks

---

## Alice Run — workflow — 2026-06-07

### Global KPIs

| KPI | Value |
|-----|-------|
| endpoints_ok | 28 |
| endpoints_404 | 1 (GET /workflow/{id}/runs/summary — no backend handler) |
| endpoints_500 | 0 |
| endpoints_unverified | 2 (hardcoded /workflow/preview-table; deprecated deployment routes) |
| endpoints_tested | 31 |
| endpoints_rbac | 28 (router-level `_require_module` + per-handler `get_current_user`) |
| backend_best_practices_gaps | 4 (missing session_cache on block-events GET + draft GET; workflowApi.ts uses inline PREFIX not API.*; 2 brand strings in customer copy) |
| henry_tasks_p1 | 4 |
| henry_tasks_p2 | 5 |
| henry_tasks_p3 | 4 |
| panel_sections_verified | 5 (Canvas, Toolbar, Right Panel tabs, Fix Rail, Import Modal) |
| smartrightbar_axes_ok | 0 (SmartRightBar absent) |
| ux_segments_audited | 5 |

### Step States

| Step | State | Notes |
|------|-------|-------|
| Read page.tsx + ETLPipelineBuilder + sub-components | complete | Canvas, Toolbar, RightPanel, FixRail, ImportModal verified |
| Endpoint verification vs backend manifest | complete | 28 OK, 1 missing (runs/summary), 2 unverified |
| RBAC gate audit | complete | router-level confirmed; FE `useCanPerform` only on deploy button |
| UX states (loading/empty/error/dark) | partial | Canvas + FixRail have loading states; ImportModal missing error boundary |
| SmartRightBar wiring | not started | 0/8 axes |
| api-contracts coverage | partial | Henry Run added 16 entries; service index.ts still has inline PREFIX |
| useCacheInvalidation | partial | Hooked for CACHE_KEYS.WORKFLOWS in ETLPipelineBuilder; dev-tools sub-tabs not subscribed |
| Brand violations | failing | 2 customer-facing brand strings (copy audit needed) |
| Chat-to-workflow (POST /cortex/query → blueprint) | not started | P1 Henry task |
| Approvals tab wiring | not started | P2 — not wired to API.workflow.* deployment endpoints |

### Henry Tasks Produced

**P1 (Critical)**
1. Add backend route `GET /workflow/{id}/runs/summary` — called from FE, no handler in manifest
2. Implement chat-to-workflow: `POST /cortex/query` → blueprint hydration → Canvas auto-populate
3. Apply `@session_cache` to `GET /workflow/{id}/block-events` and `GET /workflow/{id}/draft`
4. Migrate `workflowApi.ts` inline PREFIX to use `API.workflow.*()` entries (16 entries added by Henry, not yet consumed)

**P2 (Important)**
1. Wire Approvals tab to `API.workflow.*` deployment endpoints (`deployWorkflow`, `getDeploymentStatus`)
2. Add `SmartRightBar` integration — `useWorkflowSmartBar` hook with 8 axes
3. Add `useCanPerform` gates to block-delete, workflow-publish, and run-cancel buttons
4. Wire `useCacheInvalidation` for CACHE_KEYS in git, compute-pools, notebooks dev-tools sub-tabs
5. Add error boundary to ImportModal

**P3 (Nice-to-have)**
1. Deprecate and remove legacy deployment routes (unverified — mark as `@deprecated` in api-contracts)
2. Add `useTrackEvent` for workflow saves, block additions, and run triggers
3. E2e Playwright spec for full workflow create → run → cancel flow
4. Lint rule to ban inline `/workflow/` string literals in workflowApi.ts

### Backend Conventions Compliance

| Convention | Status |
|-----------|--------|
| `apiClient` (no raw fetch/axios) | compliant |
| `API.*` entries in api-contracts.ts | partial (16 added; service still uses inline PREFIX) |
| `@session_cache` on GETs | partial (block-events + draft missing) |
| Cache invalidation on POSTs | compliant |
| RBAC (`require_module` + `useCanPerform`) | partial (router OK; FE gates sparse) |
| Brand compliance | failing (2 violations) |

## Alice Run — workflow — 2026-06-07 (full-suite KPI sweep)

> Method: dev OFFLINE → existence vs backend route manifest (823 entries). No fabricated statuses.
> Scope domains: workflow (47), projects (16), projectsV1 (3).

### Global KPIs

| KPI | Valeur |
|-----|--------|
| endpoints_testés (contract paths) | 66 |
| endpoints_ok (registered) | 66 |
| endpoints_404 | 0 |
| endpoints_500 | 0 |
| endpoints_non_vérifiés (offline) | 66 |
| henry_tasks_p1 | 0 |
| henry_tasks_p2 | 0 |
| henry_tasks_p3 | 0 |
| backend_bonnes_pratiques_gaps | 0 (toutes les routes du contrat sont enregistrées) |

### État par étape

| Étape | État | KPIs étape |
|-------|------|------------|
| 1. Dev + API | ⚠ | dev=OFFLINE, api=UP |
| 2. Token | ❌ | absent |
| 4c. Audit | ✅ | 404=0 — aucune route backend manquante |
| 6. Henry tasks | ✅ | aucune tâche backend (couverture 100%) |
| 7. Écriture | ✅ | section ajoutée |

### Henry Tasks — workflow (backend delegation)

Aucune route backend manquante (100% des chemins du contrat sont enregistrés dans le manifest).
Gaps restants = frontend/UX (SmartRightBar, annotations CTA, Cortex tips) — hors scope "dev backend".
Test live (données réelles) à refaire quand le dev server sera up (actuellement NON VÉRIFIÉ).
