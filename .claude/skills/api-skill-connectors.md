---
name: api-skill-connectors
description: >
  Module Connectors / Ingest de Data360 (routes /data-source-config + /data-source-connection) :
  catalogue de 22 connecteurs réels (S3/GCS/Azure, Postgres/MySQL/Oracle/Snowflake, SaaS Salesforce/
  SAP/ServiceNow/HubSpot, Kafka, REST/Spark/Python), scénarios de test/sync génériques honnêtes,
  Datalake Browser. 45 routes back live (401 = protégées), write-role = ACCOUNTADMIN|SYSADMIN|DATA_MODELER. Grounded code réel — 2026-06-09.
---

# Connectors / Ingest — Skill Module (API-grounded, 2026-06-09)

> Toutes les affirmations sont sourcées (fichier:ligne ou slice/OpenAPI). Les endpoints viennent **uniquement** de la slice `datalake-management.md`, du snapshot `openapi.json`, des décorateurs réels de `backend/app/modules/connectors/router.py`, et d'un **re-test live sans auth (2026-06-09)**. Les types de connecteurs viennent **uniquement** de `backend/config/connectors-catalog.json` (22) + de la liste codée en dur (`router.py:1219`, 7). Aucun path inventé. Zones non confirmées = « non vérifié ».

## 1. Vue d'ensemble

| Élément | Valeur (source) |
|---------|-----------------|
| **Routes front** | `/data-source-config` (entrée) → `/data-source-connection` (workspace) |
| **Workspace principal** | `apps/data360/src/app/(dashboard)/data-source-connection/page.tsx` (~193 Ko) |
| **Service API front** | `data-source-connection/connectionServices.tsx` (~30 Ko) |
| **Datalake Browser** | `data-source-connection/DatalakeBrowser.tsx` (~57 Ko) |
| **Assistant NL (Cortex)** | `data-source-connection/ConnectorAiHelper.tsx` (grounding `connector-catalog-grounding.ts`, 11 entrées) |
| **Santé connecteurs** | `data-source-connection/ConnectorHealthStrip.tsx` |
| **Source catalog (estate)** | `data-source-connection/SourceCatalog.tsx` + `SourceCatalogSection.tsx` |
| **Module backend** | `backend/app/modules/connectors/router.py` (`connect_router`, prefix `/connect`, 45 routes) + `models.py` + `services/` (24 fichiers) |
| **Catalogue ground-truth** | `backend/config/connectors-catalog.json` (22 connecteurs, 8 catégories) |

**Rôles (RBAC PAR RÔLE Snowflake — vérifié dans le code).** Le module **n'utilise PAS** `require_action` (exclu de l'éditeur d'actions par design — `_conventions.md`). Deux gates seulement :

| Gate | Définition (vérifiée) | Routes |
|---|---|---|
| **Module** `require_module("connect_data")` | router-level `[trace: router.py:78]` | **toutes** les 45 routes |
| **Write-role** `require_datalake_roles` → `ACCOUNTADMIN \| SYSADMIN \| DATA_MODELER` | `[trace: backend/app/dependencies/requirements.py:14-21]` | 41/45 routes (toutes mutations + stage/file ops + test/sync) |
| *(read-only, module-grant seul)* | pas de write-role | `GET /connect/connectors` (1219), `/connectors/{id}` (3282), `/source-catalog` (2658), `/connectors/health` (3089) |

## 2. Capacités (grounded)

| Capacité | Implémentation (fichier / endpoint) |
|----------|--------------------------------------|
| Lister le catalogue de connecteurs (7 codés en dur) | `listConnectors` → `GET /connect/connectors` `[trace: router.py:1219]` |
| Détail d'un connecteur (catalogue 22 + last-sync) | `GET /connect/connectors/{connector_id}` `[trace: router.py:3282]` |
| **Tester une connexion** (validation honnête) | `POST /connect/connectors/{connector_id}/test` `[trace: router.py:3322]` — pas de FE caller (gap) |
| **Synchroniser** (EXECUTE TASK) | `POST /connect/connectors/{connector_id}/sync` `[trace: router.py:3406]` — pas de FE caller (gap) |
| Intégration + stage Azure / AWS / GCS | `setupAzure/Aws/GcsStorageIntegration`, `createAws/GcsStage` `[trace: connectionServices.tsx:60,142,162,211,231,260]` *(corrigé 2026-06-09)* → `POST /connect/{azure\|aws\|gcs}/…` |
| Snowpipe auto-ingest (Azure/GCS) | `POST /connect/azure/snowpipe`, `/azure\|gcs/notification_integration` |
| Éditer une intégration (ALTER) | `PATCH /connect/integration/{integration_name}` `[trace: router.py:395]` (`AlterStorageIntegrationBody`) |
| Connecter un datalake Snowflake + drill | `POST /connect/snowflake_lake/datalake/connect` + `GET …/databases\|schemas\|tables` `[trace: router.py:857-940]` |
| Test + browse + ingest Databricks | `POST /connect/databricks/test\|catalogs\|schemas\|tables\|ingest` `[trace: router.py:2381+]` (501 si driver absent) |
| Test + browse + ingest Iceberg | `POST /connect/iceberg/test\|namespaces\|tables\|ingest` `[trace: router.py:2551+]` (501 si `pyiceberg` absent) |
| Ingérer Postgres / MySQL / Oracle | `POST /connect/{postgres\|mysql\|oracle}/ingest` `[trace: router.py:2208,2236,2272]` |
| Datalake Browser (list/preview/upload/download/delete/grants) | `GET\|POST\|DELETE /connect/stages/…` `[trace: DatalakeBrowser.tsx ; router.py:1014-1980]` |
| Stage interne (raw zone) | `POST /connect/stages/internal` `[trace: router.py:540]` (auto CSV/PARQUET/JSON format) |
| Resume / suspend une task d'ingestion | `POST /connect/tasks/{name}/resume\|suspend` `[trace: router.py:799,826]` — pas de FE caller (gap) |
| Source catalog (estate, lineage, freshness) | `GET /connect/source-catalog?database=` `[trace: router.py:2658 ; SourceCatalog.tsx]` |
| Santé connecteurs (stages + pipes + roll-ups) | `GET /connect/connectors/health` `[trace: router.py:3089 ; ConnectorHealthStrip.tsx]` |
| Assistant NL de config (Cortex) | `ConnectorAiHelper` → `POST /cortex/complete` (grounding catalogue) `[trace: ConnectorAiHelper.tsx]` |

## 3. Référence endpoints (45 ops — statut live)

**Contrat de statut** : re-test **sans auth (2026-06-09)** — `401` = route déployée + protégée + présente sur le serveur live ; `404` = absente ; `405` = méthode non permise sur un path existant. Un `401` prouve l'existence + le gardiennage, **pas** la logique métier (compte Snowflake de test expiré).

> **Re-confirmé live le 2026-06-09** (IP directe + en-tête `Host`) : GCS, Oracle, PATCH `integration`, et les 3 routes génériques `connectors/{id}[/test|/sync]` répondent **`401`** — donc déployées, **contre** le doc antérieur qui les disait 🔴 404 / manquantes.

### 3a. Cloud storage (Azure / AWS / GCS) + intégrations

| Live | Méthode | Path | Body | Usage |
|------|---------|------|------|-------|
| 401 | POST | `/connect/azure/storage_integration` | AzureStorageIntegrationBody | Intégration Azure → consent URL |
| 401 | POST | `/connect/azure/notification_integration` | AzureNotificationIntegrationBody | Notif (Snowpipe) |
| 401 | POST | `/connect/azure/snowpipe` | AzureSnowpipeBody | Snowpipe auto-ingest |
| 401 | POST | `/connect/azure/stage` | AzureStageBody | Stage externe Azure |
| 401 | POST | `/connect/aws/storage_integration` | AWSStorageIntegrationBody | Intégration AWS → IAM user ARN + external id |
| 401 | POST | `/connect/aws/stage` | AWSStageBody | Stage S3 |
| 401 | POST | `/connect/gcs/storage_integration` | GCSStorageIntegrationBody | **DÉPLOYÉE** (faux 404 corrigé) |
| 401 | POST | `/connect/gcs/notification_integration` | GCSNotificationIntegrationBody | **DÉPLOYÉE** |
| 401 | POST | `/connect/gcs/stage` | GCSStageBody | **DÉPLOYÉE** |
| 401 | POST | `/connect/stages/internal` | InternalStageBody | Stage interne (auto file formats) |
| 401 | GET | `/connect/integration` | — (query `integration_name?`) | Lister / DESC INTEGRATION |
| 401 | PATCH | `/connect/integration/{integration_name}` | AlterStorageIntegrationBody | **DÉPLOYÉE** ALTER (faux « missing » corrigé) — pas de DROP |

### 3b. Warehouse / lakehouse (Snowflake / Databricks / Iceberg)

| Live | Méthode | Path | Body | Usage |
|------|---------|------|------|-------|
| 401 | POST | `/connect/snowflake_lake/datalake/connect` | SnowflakeDatalakeConnectBody | Connecter un compte Snowflake distant |
| 401 | GET | `/connect/snowflake_lake/databases` | — (query `datalake_username`) | Drill : bases |
| 401 | GET | `/connect/snowflake_lake/schemas/{database_name}` | — | Drill : schémas |
| 401 | GET | `/connect/snowflake_lake/tables/{database_name}/{schema_name}` | — | Drill : tables |
| 401 | POST | `/connect/databricks/test` | DatabricksConnectBody | Test (501 si driver absent) |
| 401 | POST | `/connect/databricks/catalogs` | DatabricksConnectBody | Lister catalogs |
| 401 | POST | `/connect/databricks/schemas` | DatabricksConnectBody (query `catalog*`) | Lister schémas |
| 401 | POST | `/connect/databricks/tables` | DatabricksConnectBody (query `catalog*,schema_name*`) | Lister tables |
| 401 | POST | `/connect/databricks/ingest` | DatabricksIngestBody | Ingérer (auto/file/streaming/spark) |
| 401 | POST | `/connect/iceberg/test` | IcebergConnectBody | Test REST catalog (501 si `pyiceberg`) |
| 401 | POST | `/connect/iceberg/namespaces` | IcebergConnectBody | Lister namespaces |
| 401 | POST | `/connect/iceberg/tables` | IcebergConnectBody (query `namespace*`) | Lister tables |
| 401 | POST | `/connect/iceberg/ingest` | IcebergIngestBody | Ingérer (copie, pas de zero-copy) |

### 3c. Bases relationnelles (Postgres / MySQL / Oracle)

| Live | Méthode | Path | Body | Usage |
|------|---------|------|------|-------|
| 401 | POST | `/connect/postgres/ingest` | PostgresIngestBody | Ingest one-shot (public schema, cap 50 tables) |
| 401 | POST | `/connect/mysql/ingest` | MySQLIngestBody | Ingest one-shot (SSL pour cloud MySQL) |
| 401 | POST | `/connect/oracle/test` | OracleIngestBody | **DÉPLOYÉE** test (faux 404 corrigé) |
| 401 | POST | `/connect/oracle/sample-stage` | — | **DÉPLOYÉE** load CSV échantillon → stage |
| 401 | POST | `/connect/oracle/ingest` | OracleIngestBody | **DÉPLOYÉE** ingest (modes standard/tls/wallet) |

### 3d. Connecteurs génériques (catalogue 22) + santé + estate

| Live | Méthode | Path | Body | Usage |
|------|---------|------|------|-------|
| 401 | GET | `/connect/connectors` | — | Liste **codée en dur (7)** : capacités historiques |
| 401 | GET | `/connect/connectors/{connector_id}` | — | Détail (résolu contre catalogue **22**) — 404 si type inconnu |
| 401 | POST | `/connect/connectors/{connector_id}/test` | dict libre | **Test honnête** (params requis + SHOW INTEGRATIONS/STAGES) |
| 401 | POST | `/connect/connectors/{connector_id}/sync` | `{task\|task_name*}` | **Sync** EXECUTE TASK — 409 si pas de target |
| 401 | GET | `/connect/connectors/health` | — | Santé (stages + pipes + roll-ups ACCOUNT_USAGE) |
| 401 | GET | `/connect/source-catalog` | — (query `database*`) | Estate : lineage, freshness, domain tags |

### 3e. Stage Browser + tasks

| Live | Méthode | Path | Usage |
|------|---------|------|-------|
| 401 | GET | `/connect/stages` | Lister stages (query `page,page_size,sort_by,sort_dir,search`) |
| 401 | GET | `/connect/stages/{stage_name}/files` | Lister fichiers (query `path,sort`) |
| 401 | GET | `/connect/stages/{stage_name}/files/{file_path}/preview` | Aperçu (query `limit,offset,format`) |
| 401 | GET | `/connect/stages/{stage_name}/files/{file_path}/download` | Download (internal only, cap 500 MB) |
| 401 | POST | `/connect/stages/{stage_name}/upload` | Upload (query `overwrite,path` ; rate-limité 10/IP/min) |
| 401 | DELETE | `/connect/stages/{stage_name}/files/{file_path}` | Supprimer fichier |
| 401 | GET | `/connect/stages/{stage_name}/grants` | Grants du stage (governance) |
| 401 | POST | `/connect/tasks/{task_name}/resume` | Reprendre une task (pas de FE caller) |
| 401 | POST | `/connect/tasks/{task_name}/suspend` | Suspendre une task (pas de FE caller) |

**Routes connues NON déployées (drift / faux manifeste)** — re-test 2026-06-09 :
- `POST /connect/salesforce/ingest`, `/sap/ingest`, `/servicenow/ingest`, `/hubspot/ingest` → **`404`** (services back + models existent, mais aucune route dédiée).
- `POST /connect/connectors`, `…/from-code`, `…/validate-spec`, `…/{name}/preview-output`, `/connect/shares/mount` → **`405`/`404`** (référencés dans le champ catalogue `existing_endpoints`, **non déployés** — `existing_endpoints` ≠ manifeste de déploiement).

## 4. Modèle de données — les TROIS catalogues + bodies clés

> ⚠ **Piège central** : il existe **trois** listes de connecteurs de tailles différentes. Le détail/test/sync génériques résolvent contre le **catalogue JSON (22)**, pas la liste codée en dur (7) ni le grounding FE (11).

| Source | Taille | Types | Rôle |
|---|---|---|---|
| `GET /connect/connectors` (codé en dur) | **7** | snowflake, azure, aws, databricks, iceberg, postgres, mysql `[trace: router.py:1219-1235]` | capacités historiques (`has_stages`, `direction`, `category`) |
| `config/connectors-catalog.json` | **22** | + salesforce, servicenow, hubspot, sap, kafka, sql_server, oracle, external_table, rest_api, google_analytics_aggregate, google_analytics_raw, google_looker_studio, sharepoint, spark, python_connector, powerapps | **ground-truth** des types testables (`_catalog_entry`) |
| FE `connector-catalog-grounding.ts` | **11** | postgres, mysql, databricks, azure, aws, gcs, iceberg, oracle, snowflake (+ doublons) | grounding NL (`ConnectorAiHelper`) |

**Catégories du catalogue 22** : `cloud_storage` (s3, gcs, azure_blob) · `database` (postgresql, mysql, oracle, sql_server, snowflake) · `saas` (salesforce, servicenow, hubspot, sap, google_analytics ×2, looker_studio, powerapps) · `streaming` (kafka) · `snowflake_native` (external_table) · `custom` (rest_api, spark, python_connector) · `unstructured` (sharepoint).

**Entrée catalogue (forme)** : `{type, label, category, description, capabilities[], params[]{name,type,required}, steps[], test, existing_endpoints[]}`.

### Bodies clés (vérifiés dans `models.py`, type · requis · défaut)

- **`GCSStorageIntegrationBody`** `[models.py:89]` : `integration_name` str* · `bucket_name` str* (sans préfixe `gs://`).
- **`GCSStageBody`** `[models.py:99]` : `stage_name` str* · `bucket_name` str* · `integration_name` str* · `prefix?` · `load_data` bool=false · `auto_update` bool=false · `notification_integration?`.
- **`AlterStorageIntegrationBody`** `[models.py:72]` : `enabled?` bool · `storage_allowed_locations?` str[] · `storage_blocked_locations?` str[] · `comment?` · `storage_aws_role_arn?` · `storage_aws_external_id?` (tous optionnels — ALTER partiel).
- **`OracleIngestBody`** `[models.py:300]` : `host` str* · `port` int=1521 · `service_name` str* · `username` str* · `password` str="" · `tables?` str[] · `connection_mode` str="standard" (`standard\|tls\|wallet`) · `wallet_path?` · `wallet_password?` · `connect_string?` (override TNS).
- **`PostgresIngestBody`** `[models.py:228]` : `host` str* · `port` int=5432 · `database` str* · `user` str* · `password` str="" · `tables?` (sinon tout `public`) · `ingest_mode` str="auto" (`auto\|file_based\|streaming`).
- **`MySQLIngestBody`** `[models.py:238]` : idem Postgres + `port` int=3306 · `ssl` bool=false (requis pour TiDB/Aiven/RDS).
- **`SnowflakeDatalakeConnectBody`** `[models.py:179]` : `datalake_username` str* · `datalake_password` str* · `datalake_account` str* · `datalake_role` str="ACCOUNTADMIN".
- **`DatabricksConnectBody`** `[models.py:249]` : `host` str* · `http_path` str* · `access_token` str*.
- **`IcebergConnectBody`** `[models.py:266]` : `uri` str* · `warehouse?` · `credential?`.

> **Models orphelins (sans route)** : `SalesforceIngestBody`, `SAPIngestBody`, `HubSpotIngestBody`, `ServiceNowIngestBody`, `CustomAPIIngestBody`, `ConnectorCreateBody`, `ConnectorUpdateBody`, `CredentialRotateBody` `[models.py:282-351]` — modélisés mais aucune route ne les monte (les `/connect/<saas>/ingest` répondent 404). `IngestionRequest{ingestion_type,condition,frequency}` `[models.py:213]` modélise l'incrémental/planifié mais **aucun endpoint ne le consomme** (tout ingest DB est one-shot).

## 5. Scénarios de test de connexion (FOCUS module — ins/outs)

> Le test de connexion s'appuie sur **deux familles** : (1) test **natif par connecteur** (Databricks/Iceberg/Oracle — handshake réel) ; (2) test **générique honnête** `POST /connect/connectors/{id}/test` (validation de config, jamais de faux succès). Tous `401` live 2026-06-09 ; test fonctionnel authentifié à faire.

**Logique du test générique** `[trace: router.py:3322-3403]` : (1) chaque param `required` du catalogue présent dans le body → check `required:<param>` ; (2) si `storage_integration`/`integration_name` fourni → `SHOW INTEGRATIONS LIKE` → check `integration_exists` ; (3) si `stage`/`stage_name` fourni → `SHOW STAGES LIKE` → check `stage_exists`. `status='validated'` **uniquement** si **tous** les checks passent ; sinon `failed`. Audit `EVENT_STORE` (`TEST_CONNECTOR`).

**Logique du sync** `[trace: router.py:3406-3462]` : body `{task\|task_name}` obligatoire (pas de registre connecteur→task) → vérifié par `SHOW TASKS LIKE … IN SCHEMA <db>.STAGING` → `EXECUTE TASK`. `409 no sync target configured` si absent. Audit `DATA_INGESTION` (`SYNC_CONNECTOR`).

### Fiche « ins / outs » des endpoints clés

| Étape | Endpoint | INS (path · query · body) | OUTS (réponse consommée) |
|-------|----------|---------------------------|--------------------------|
| lister catalogue | `GET /connect/connectors` | — | `{connectors[]{id,name,capabilities[],has_stages,direction,category}}` (7) |
| détail connecteur | `GET /connect/connectors/{id}` | path `{id}` (=type catalogue 22) | `{type,label,category,capabilities[],params[],steps[],test,last_sync{pipes[],tasks[],source}}` · 404 si inconnu |
| **tester (générique)** | `POST /connect/connectors/{id}/test` | path `{id}` · body `{...params, storage_integration?, stage?}` | `{connector_id,type,status:'validated'\|'failed',checks[]{name,ok,detail}}` |
| **synchroniser** | `POST /connect/connectors/{id}/sync` | path `{id}` · body `{task\|task_name*}` | `{connector_id,type,status:'triggered',task,message}` · 409 si pas de target |
| tester Databricks | `POST /connect/databricks/test` | body `{host,http_path,access_token}` | `{ok}` · 501 si driver absent |
| tester Iceberg | `POST /connect/iceberg/test` | body `{uri,warehouse?,credential?}` | `{ok}` · 501 si `pyiceberg` absent |
| tester Oracle | `POST /connect/oracle/test` | body `OracleIngestBody` | `{ok, table_count, latency_ms, …}` · 400 message Oracle mappé si échec · event `CONNECTOR_TEST`/`TEST_ORACLE` |
| créer intégration AWS | `POST /connect/aws/storage_integration` | body `AWSStorageIntegrationBody` | `{message, STORAGE_AWS_IAM_USER_ARN, STORAGE_AWS_EXTERNAL_ID}` |
| créer intégration Azure | `POST /connect/azure/storage_integration` | body `AzureStorageIntegrationBody` | `{message, azure_consent_url}` |
| créer intégration GCS | `POST /connect/gcs/storage_integration` | body `{integration_name*,bucket_name*}` | `{message, STORAGE_GCP_SERVICE_ACCOUNT, instructions}` |
| éditer intégration | `PATCH /connect/integration/{name}` | path `{name}` · body `AlterStorageIntegrationBody` (champs optionnels) | `{message}` (ALTER partiel) |
| connecter datalake | `POST /connect/snowflake_lake/datalake/connect` | body `SnowflakeDatalakeConnectBody` | `{message,current_role,account,region}` |
| ingest Postgres/MySQL/Oracle | `POST /connect/{postgres\|mysql\|oracle}/ingest` | body `*IngestBody` | mode-dépendant `{ok,tables,rows,…}` |
| santé | `GET /connect/connectors/health` | — | `{stages[],pipes[],total_stages,total_pipes,healthy,stale,ingestion_7d,loads_7d,tasks_1d}` |
| estate | `GET /connect/source-catalog` | query `database*` | par table `{domain,source_system,row_count,freshness_hours,datalake_layer,ingestion_type,...}` + breakdown |

### Scénarios de test (à rejouer authentifié)

1. **Cloud storage end-to-end (AWS)** : `POST /aws/storage_integration` → (trust IAM côté AWS) → `POST /aws/stage{load_data:true}` → `GET /connect/connectors/aws/test{storage_integration,stage}` doit renvoyer `validated` (2 checks `integration_exists`/`stage_exists` ok).
2. **GCS (ex-faux-404)** : `POST /gcs/storage_integration` → `POST /gcs/stage{notification_integration}` → vérifier `401` sans token, `201/200` avec write-role.
3. **Test générique config-only (sans Snowflake)** : `POST /connect/connectors/postgresql/test{host,port,database,user}` — checks `required:*` ; omettre `host` → `failed` avec `detail:"missing required param 'host'"`.
4. **Test SaaS via catalogue 22** : `POST /connect/connectors/salesforce/test{...}` doit répondre (200/`validated|failed`) **alors que** `POST /connect/salesforce/ingest` répond `404` (pas de route dédiée) — preuve que le test résout contre le JSON 22.
5. **Sync sans target** : `POST /connect/connectors/s3/sync{}` (body vide) → `409 no sync target configured` (pas de faux succès).
6. **Sync avec task** : `POST /connect/connectors/s3/sync{task:"INGEST_S3_TASK"}` → `SHOW TASKS LIKE` → `EXECUTE TASK` → `{status:'triggered'}`.
7. **Oracle wallet mode** : `POST /connect/oracle/test{connection_mode:"wallet", wallet_path, wallet_password}` (ex-faux-404, déployé).
8. **Datalake distant** : `POST /snowflake_lake/datalake/connect` → drill `GET …/databases` → `…/schemas/{db}` → `…/tables/{db}/{schema}`.
9. **Databricks driver absent** : `POST /databricks/test` → `501` attendu si `databricks-sql-connector` non installé (UX « driver missing »).
10. **Stage browser secured** : `GET /connect/stages` (write-role) → `…/files` → `…/preview` (audit log IP+UA) → upload (rate-limit 10/IP/min) → delete.

## 6. UX front — validation 4 axes + accessibilité

| Axe | Verdict | Preuve (fichier:ligne) |
|-----|---------|------------------------|
| **loading** | ✓ (à confirmer ligne) | états de chargement dans `page.tsx` (picker grid) + `DatalakeBrowser.tsx` (file ops) ; `ConnectorHealthStrip.tsx` skeleton santé — *lignes exactes non vérifiées* |
| **empty** | ✓ | landing « no connections » → grille de picker de plateformes `[trace: page.tsx — état landing]` ; empty-state du Datalake Browser |
| **error** | ✓ | `extractErrorMessage(error, '…')` dans `connectionServices.tsx` (chaque service) ; contrat d'erreur API « 3 types » (400/404, 422 SQL, 500) propage `snowflake:{errno,sqlstate,msg}` `[trace: router.py:1259 _snowflake_detail]` ; test générique renvoie `checks[]` au lieu d'un faux succès |
| **dark mode** | ✓ | `dark:` présent dans `SourceCatalog.tsx`, `SourceCatalogSection.tsx`, `ConnectorAiHelper.tsx`, `ConnectorHealthStrip.tsx`, `DatalakeBrowser.tsx` (grep positif) |

**Accessibilité** : `ConnectorAiHelper` expose la forme de réponse `{ connector_id, status }` en clair (`ConnectorAiHelper.tsx:443`). ⚠ Audit a11y détaillé (aria-label des boutons de la grille de picker, focus-ring) **non vérifié** — à passer via `/review-ux connectors`.

## 7. Drift détecté (vs doc antérieur + vs code)

1. **Faux 404 — GCS / Oracle / PATCH integration.** Le doc disait 🔴 « all 404 » / « companion route missing » ; re-test live 2026-06-09 : **toutes `401` = déployées** (`router.py:572/612/652`, `2071/2118/2272`, `395`). Corrigé inline + §A du vault. Cause : `deprecated`/stub supposé ≠ supprimé.
2. **Catalogue à 3 listes non documenté.** Le doc ne mentionnait que la liste codée en dur (7). Réel : 7 (hardcodé) vs **22** (`config/connectors-catalog.json`, ground-truth testable) vs 11 (grounding FE). Les SaaS (Salesforce/SAP/ServiceNow/HubSpot/GA/Looker/PowerApps/SharePoint/Kafka) n'existent **que** dans le catalogue 22 — testables via `connectors/{id}/test`, pas via routes dédiées.
3. **3 endpoints génériques absents du doc et de l'OpenAPI.** `GET /connectors/{id}`, `POST …/{id}/test`, `POST …/{id}/sync` répondent `401` live mais **manquent** du snapshot OpenAPI (2026-06-08 23:02) sans `include_in_schema=False` → le snapshot ne reflète pas le build live ; cause exacte **non vérifiée**.
4. **`existing_endpoints` du catalogue ≠ déploiement.** Référence des routes non déployées (`POST /connect/connectors`, `from-code`, `validate-spec`, `shares/mount` → 405/404). Ne jamais les documenter comme live.
5. **Test/sync génériques non câblés côté FE** (0 caller pour `connectors/{id}/test|/sync`) — backend prêt, FE manquant (gap UX, cf. §8).
6. **Endpoints planifiés non construits** (commentaires `router.py:3465-3482`) : Schema Drift Detection, Data Contract Validation, NL Connector Setup (back), CDC Dashboard Metrics, Auto-Retry Failed Pipes — **stubs vides**, aucune route.

## 8. Propositions d'amélioration UX (PROPOSITIONS — pas d'édition de code)

1. **Câbler le bouton « Tester la connexion »** sur `POST /connect/connectors/{id}/test` (route live, 0 caller FE) et rendre les `checks[]{name,ok,detail}` ligne par ligne. Bénéfice : test honnête au lieu d'un faux succès. [moyen]
2. **Câbler « Lancer le sync »** sur `POST /connect/connectors/{id}/sync`, **désactivé** sans write-role (`useCanPerform`/role), avec gestion explicite du `409 no sync target configured`. Bénéfice : pas de bouton qui échoue en silence.
3. **Unifier le picker sur le catalogue 22** (`connector-catalog-grounding.ts` n'a que 11 entrées) : exposer Salesforce/SAP/ServiceNow/HubSpot/Kafka/SharePoint dans la grille en lecture (avec badge « test config-only ») pour refléter le ground-truth back. [moyen]
4. **Badge « via test générique »** sur les SaaS sans route dédiée, pour signaler que `connectors/{id}/test` valide la config mais que l'ingest n'a pas (encore) de route dédiée. Bénéfice : aligne l'attente.
5. **Surfacer `GET /connect/source-catalog` et `/connectors/health`** dans le workspace user (aujourd'hui admin-only / `SourceCatalog.tsx` peu câblé). Bénéfice : santé + estate au même endroit. [trivial-safe]
6. **Action « Pause/Resume pipe »** depuis le ConnectorHealthStrip branchée sur `POST /connect/tasks/{name}/resume|suspend` (routes live, 0 caller). [moyen]
7. **DROP intégration/stage** : `PATCH /connect/integration/{name}` (ALTER) existe ; proposer un DROP gardé (write-role) pour fermer le lifecycle create+edit→delete. (Backend à ajouter — proposition produit.)
8. **Migrer les secrets hors body** (Postgres/MySQL/Oracle password en POST) vers un registre `CONNECTOR_CREDENTIALS` chiffré — cohérent avec `CredentialRotateBody` déjà modélisé. (Sécurité.)

## 9. Plan de test fonctionnel

> Toutes les routes renvoient `401` sans token. Obtenir un JWT (`POST /signin{account_name,username,password}`), puis `-H "Authorization: Bearer $TOKEN"`. Rôle requis : module `connect_data` actif ; pour les mutations + test/sync : write-role (`ACCOUNTADMIN|SYSADMIN|DATA_MODELER`).

```bash
BASE=https://<host>        # ex. http://localhost:80
H="-H Authorization:Bearer $TOKEN -H Content-Type:application/json"

# 1. Catalogue (lecture — module-grant seul)
curl -s $H "$BASE/connect/connectors"                       # 7 codés en dur
curl -s $H "$BASE/connect/connectors/salesforce"            # détail depuis catalogue 22 (404 si type inconnu)
curl -s $H "$BASE/connect/connectors/__BOGUS__"             # attendu 404 (id pas dans le catalogue)

# 2. Test générique honnête (write-role) — config-only, sans Snowflake atteignable
curl -s $H -X POST "$BASE/connect/connectors/postgresql/test" \
  -d '{"host":"h","port":5432,"database":"d","user":"u"}'   # checks required:* ; manquant → failed
curl -s $H -X POST "$BASE/connect/connectors/salesforce/test" -d '{}'  # SaaS testable malgré 404 sur /salesforce/ingest

# 3. Test avec probe Snowflake réel (integration/stage existants)
curl -s $H -X POST "$BASE/connect/connectors/aws/test" \
  -d '{"storage_integration":"MY_AWS_INT","stage":"MY_S3_STAGE"}'  # SHOW INTEGRATIONS/STAGES LIKE

# 4. Sync (write-role) — 409 si pas de task, triggered si task existe
curl -s $H -X POST "$BASE/connect/connectors/s3/sync" -d '{}'                    # attendu 409
curl -s $H -X POST "$BASE/connect/connectors/s3/sync" -d '{"task":"INGEST_TASK"}' # EXECUTE TASK

# 5. Tests natifs par connecteur
curl -s $H -X POST "$BASE/connect/databricks/test" -d '{"host":"...","http_path":"...","access_token":"..."}'  # 501 si driver absent
curl -s $H -X POST "$BASE/connect/iceberg/test"    -d '{"uri":"http://host:8181"}'                              # 501 si pyiceberg absent
curl -s $H -X POST "$BASE/connect/oracle/test"     -d '{"host":"h","service_name":"s","username":"u","connection_mode":"wallet","wallet_path":"/w"}'

# 6. Cloud storage (write-role) — GCS/Oracle ex-faux-404
curl -s $H -X POST "$BASE/connect/gcs/storage_integration" -d '{"integration_name":"GCS_INT","bucket_name":"my-bucket"}'
curl -s $H -X PATCH "$BASE/connect/integration/MY_AWS_INT" -d '{"comment":"updated"}'   # ALTER (déployé)

# 7. Datalake distant + drill
curl -s $H -X POST "$BASE/connect/snowflake_lake/datalake/connect" -d '{"datalake_username":"u","datalake_password":"p","datalake_account":"acct"}'
curl -s $H "$BASE/connect/snowflake_lake/databases?datalake_username=u"

# 8. Santé + estate + drift négatif
curl -s $H "$BASE/connect/connectors/health"
curl -s $H "$BASE/connect/source-catalog?database=PROD"
curl -s $H -X POST "$BASE/connect/salesforce/ingest" -d '{}'    # attendu 404 (pas de route dédiée)
curl -s $H -X POST "$BASE/connect/connectors" -d '{}'          # attendu 405 (seul GET existe)
```

**Résultats attendus par capacité** :
- Sans token → **401 AUTH_REQUIRED** sur les 45 ops (contrat RBAC vérifié).
- Sans write-role (ex. rôle lecture) sur une mutation/test/sync → **403** (`require_datalake_roles`).
- `connectors/{id}/test` avec param requis manquant → `{status:'failed', checks:[{name:'required:host', ok:false, detail:"missing required param 'host'"}]}` — **jamais** `validated`.
- `connectors/{id}/sync` body vide → **409** `no sync target configured` (pas de faux succès).
- `connectors/__BOGUS__` → **404** ; `connectors` en POST → **405** ; `salesforce/ingest` → **404**.
- Databricks/Iceberg sans driver serveur → **501**.

---

> Vérifié 2026-06-09 : 41 endpoints vérifiés vs OpenAPI+slice (tous présents), 3 routes génériques `/connectors/{id}[/test|/sync]` confirmées `401` live mais absentes du snapshot OpenAPI (transparence maintenue), 1 correction traces FE (ligne :44,126,216,240,265 → :60,142,162,211,231,260), live-retest 5/5 OK (GET /connectors, GET /connectors/health, POST /gcs/storage_integration, GET /connectors/salesforce, POST /connectors/salesforce/test = tous 401). Aucun secret/IP dans le skill. VERDICT : **PATCHED** (traces FE corrigées, endpoints grounded).
