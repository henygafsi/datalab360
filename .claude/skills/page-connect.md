---
name: page-connect
description: >
  Référence Connect Data360. Route /data-source-connection. 10 tabs : connector catalog,
  AWS/Azure/GCS cloud, Snowflake-lake, JDBC, Databricks, Iceberg/Polaris, Stages+Snowpipe,
  Tasks+Streams. Rôle principal : Data Engineer. Auto-découverte des intégrations existantes.
---

# Connect — Référence Data360

## Route

- **Route** : `/data-source-connection`
- **Fichier** : `apps/data360/src/app/(dashboard)/data-source-connection/page.tsx`

## Rôles

| Rôle | Actions |
|------|---------|
| **Data Engineer** | Connecter sources, configurer ingestion, créer stages, gérer pipes |
| **Platform Admin** | Voir toutes les intégrations, santé des connexions |
| **AI Engineer** | Connecter sources pour embeddings/fine-tuning |

## Auto-découverte au premier démarrage

Au démarrage, Data360 découvre automatiquement TOUTES les intégrations existantes :
```sql
SHOW STORAGE INTEGRATIONS           -- AWS S3, Azure Blob, GCS
SHOW NOTIFICATION INTEGRATIONS      -- SQS, Event Grid, Pub/Sub
SHOW API INTEGRATIONS               -- External functions
SHOW EXTERNAL ACCESS INTEGRATIONS   -- Network rules
SHOW EXTERNAL VOLUMES               -- Iceberg volumes
SHOW CATALOG INTEGRATIONS           -- Polaris, Glue
SHOW STAGES                         -- Tous les stages internes/externes
SHOW PIPES                          -- Tous les Snowpipes
```

## 10 Tabs

### Tab 01 : Connector Catalog
- **Ce qui s'affiche** : Catalogue de tous les connecteurs disponibles + statut
- **Actions** :
  - `Démarrer wizard` : ouvre wizard 4 étapes (choisir type → configurer → tester → créer)
  - `Voir intégrations existantes` : SHOW STORAGE INTEGRATIONS auto-loaded
  - `Tester connexion` : POST /connect/test

### Tab 02-04 : Cloud (AWS / Azure / GCS)
- **Endpoints** : POST /connect/aws/stage, POST /connect/gcs/stage
- **Actions** :
  - `Créer stage S3` : POST /connect/aws/stage {bucket, prefix, credentials}
  - `Lier notification SQS` : pour Snowpipe auto-ingest
  - `Tester accès` : POST /connect/test {stage_name}
  - `Créer integration` : CREATE STORAGE INTEGRATION

### Tab 05 : Snowflake-lake
- **Endpoint** : POST /connect/snowflake_lake/datalake/connect
- **Actions** :
  - `Connecter datalake` : credentials Snowflake → découverte automatique
  - `Voir databases/schemas` : GET /common/databases
  - `Configurer ingestion` : sélectionner tables → mode COPY INTO / Stream + Task

### Tab 06 : JDBC
- **Actions** :
  - `Ajouter source JDBC` : wizard PostgreSQL/MySQL/Oracle
  - `Générer external function` : CREATE EXTERNAL FUNCTION stub via API Gateway

### Tab 08 : Iceberg & Polaris
- **Snowflake** : SF:C3, SF:E4, SF:E5
- **Actions** :
  - `Créer Iceberg table` : CREATE ICEBERG TABLE ... EXTERNAL_VOLUME = ... CATALOG = ...
  - `Lier Polaris catalog` : CREATE CATALOG INTEGRATION (Polaris ou Glue)
  - `Voir tables Iceberg` : SHOW ICEBERG TABLES IN ACCOUNT

### Tab 09 : Stages & Snowpipe
- **Endpoints** : GET /connect/stages, POST /connect/stages/internal, POST /connect/stages/{s}/upload
- **Actions** :
  - `Créer stage interne` : POST /connect/stages/internal
  - `Uploader fichiers` : POST /connect/stages/{stage}/upload (multipart)
  - `Lister fichiers` : GET /connect/stages/{stage}/files
  - `Créer Snowpipe` : CREATE PIPE ... AUTO_INGEST = TRUE
  - `Voir Pipe health` : PIPE_USAGE_HISTORY + COPY_HISTORY

### Tab 10 : Tasks & Streams
- **Snowflake** : SF:C7, SF:C8
- **Actions** :
  - `Créer Stream` : CREATE STREAM ... ON TABLE ... (APPEND_ONLY ou DELTA)
  - `Créer Task CDC` : CREATE TASK ... WHEN SYSTEM$STREAM_HAS_DATA(stream_name)
  - `Voir streams actifs` : SHOW STREAMS IN ACCOUNT
  - `Voir TASK_HISTORY` : derniers runs + erreurs

## Endpoints utilisés

```typescript
API.connect.listStages()                   // GET /connect/stages
API.connect.createInternalStage()          // POST /connect/stages/internal
API.connect.createAwsStage()               // POST /connect/aws/stage
API.connect.createGcsStage()               // POST /connect/gcs/stage
API.connect.uploadToStage(stage)           // POST /connect/stages/{stage}/upload
API.connect.listStageFiles(stage)          // GET /connect/stages/{stage}/files
API.connect.deleteStageFile(stage, path)   // DELETE /connect/stages/{stage}/files/{path}
API.connect.datalakeConnect()              // POST /connect/snowflake_lake/datalake/connect
```

## Henry Tasks — connect

### P1
- [ ] Layout 14:6 pour tab Stages: FilterChips [Internes] [AWS S3] [GCS] [Azure]
      Panel Détails: stage name, type, url, files count, dernière utilisation
      Panel Actions: [Upload fichier] [Lister fichiers] [Créer Pipe] [Supprimer]
- [ ] Auto-découverte complète: SHOW STORAGE INTEGRATIONS → tab Connector Catalog

### P2
- [ ] Iceberg tables: SHOW ICEBERG TABLES → liste avec status (live/stale)
- [ ] COPY_HISTORY: ingest lag + error rate par pipe → panel Statut

### P3
- [ ] Wizard 4 étapes inline (plus de modale): étapes dans main, preview dans panel droit

## Screenshots
```
e2e/results/screenshots/connect.png
```

## Module Run — sources/connect — 2026-06-07

### Global KPIs
| KPI | Value |
|-----|-------|
| endpoints_audited | 8 |
| api_contracts_gaps_found | 7 |
| api_contracts_gaps_fixed | 7 |
| fake_zero_fixes | 2 |
| brand_violations_fixed | 0 |
| conventions_compliant | true |

### Step States
| Step | State | Notes |
|------|-------|-------|
| Read source | ✅ | data-source-connection/page.tsx, SourceCatalog.tsx, DatalakeBrowser.tsx, s3Servicer.ts read |
| Convention check | ✅ | s3Servicer.ts uses apiClient correctly; no raw axios/fetch detected |
| api-contracts fixes | ✅ | 7 entries added to API.connect block in api-contracts.ts |
| Brand violations | ✅ | 0 fixed — connect page is an admin/integration view (Data Engineer, Platform Admin); Snowflake/AWS/GCS/Azure vendor names are legitimate in a provider picker; "star/snowflake schema" is a dimensional-modeling term, not a brand violation |
| Fake-zero fixes | ✅ | 2 fixed across both modules |
| Log written | ✅ | page-sources.md + page-connect.md appended |

### Fixes Applied
- `api-contracts.ts` API.connect: added `listConnectors`, `connectorsHealth`, `sourceCatalog`, `createConnector`, `getConnector(id)`, `testConnector(id)`, `syncConnector(id)` — 7 entries
- `sources/components/DetectedModelsTab.tsx:129`: `sourceTables?.length ?? 0` → `sourceTables?.length ?? '—'`
- `data-source-connection/SourceCatalog.tsx:479`: `String(catalog.tables_loaded_30d ?? 0)` → `catalog.tables_loaded_30d != null ? String(catalog.tables_loaded_30d) : '—'`

### Remaining Gaps
- `useCacheInvalidation` not hooked in either module — no SSE-driven invalidation for catalog refresh events
- 7 new API.connect entries added as directed; not independently verified against backend `app/modules/connectors/router.py` (frontend-only repo); InsightActionButton 404/501 pattern covers any route not yet live
- Henry P1 (connect): Layout 14:6 tab-Stages with FilterChips and Panel Détails still open
- Henry P1 (connect): Auto-découverte complète (SHOW STORAGE INTEGRATIONS → Connector Catalog tab) still open
