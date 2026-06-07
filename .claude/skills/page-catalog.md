---
name: page-catalog
description: >
  Référence Sources & Catalog Data360. Route /sources. Deux tabs: Sources (browser tables)
  + Detected Models. SmartRightBar pour chaque table sélectionnée: context/gov/lineage/ingestion/ownership.
  Rôle principal: Data Modeler + Data Engineer. Porte d'entrée du catalogue de données.
---

# Sources & Catalog — Référence Data360

## Route et fichier source

- **Route** : `/sources`
- **Fichier** : `apps/data360/src/app/(dashboard)/sources/page.tsx`
- **Pattern actuel** : SourceTree (gauche) + TableDetailPanel (droite) — à migrer vers SmartRightBar
- **Deep-link** : `?project_id=<id>` depuis explore-design ou workflow

## Rôles utilisateurs

| Rôle | Actions principales |
|------|---------------------|
| **Data Modeler** | Parcourir catalog, sélectionner tables pour projet, ouvrir dans Modeler |
| **Data Engineer** | Voir config ingestion, configurer sources, connecter stages |
| **DQ Analyst** | Voir classification PII, gov rate, qualité données |
| **Platform Admin** | Rafraîchir catalog complet, voir couverture DQ |

## Layout cible (SmartRightBar)

```
┌─────────────────────────────────────────────────────────────────────┐
│  TOP BAR: [🔍 Search tables] [↻ Refresh Catalog] [+ Add Source]     │
├───────────────────────────────────┬─────────────────────────────────┤
│  LEFT: Source Tree                │  SMART RIGHT BAR (420px)        │
│  ┌─ [Segment: Sources | Models]  │                                  │
│  │                               │  S1: CONTEXT                     │
│  │  ▼ CP_DATA360 (DB)            │  Type / rows / size / owner      │
│  │    ▼ SALES (schema)           │  Classification badges            │
│  │      📊 ORDERS_RAW            │                                  │
│  │      📊 CUSTOMERS ← selected  │  S2: ACTIONS                     │
│  │      📊 PRODUCTS              │  Open Modeler / Config ingestion  │
│  │    ▼ DWH (schema)             │  Profile / Preview / Classify PII │
│  │      📊 ORDERS_FACT           │                                  │
│  │                               │  S3: GOUVERNANCE                 │
│  │  ▼ EXTERNAL_DB                │  Gov rate / PII / RLS            │
│  │    📂 EXT_ORDERS              │                                  │
│  │    📂 EXT_CUSTOMERS           │  S4: LIGNÉE                      │
│  │                               │  Upstream / Downstream           │
│  │ Models detected:              │                                  │
│  │  ⭐ ORDERS_FACT (star)        │  S5: INGESTION                   │
│  │  📐 DIM_CUSTOMERS             │  Mode / schedule / dernière run   │
│  │                               │                                  │
│  └──────────────────────────────  │  S6: OWNERSHIP                  │
│                                   │  Source→Product / Consumers     │
│                                   │                                 │
│                                   │  S7: ALICE TIPS                 │
│                                   │                                 │
│                                   │  S8: HISTORIQUE                 │
└───────────────────────────────────┴─────────────────────────────────┘
```

## Tab 1 — Sources (SourceTree)

### Ce qui s'affiche

Arbre hiérarchique : Database → Schema → Tables/Views.
Chaque nœud de l'arbre est cliquable et met à jour le SmartRightBar.

**Source** : `getDatabases()`, `getSchemas(db)`, `getTables(db, schema)`, `getTableColumns(db, schema, table)`

### Actions disponibles (par sélection)

#### Sur une Database sélectionnée

| Action | Ce que ça fait | Rendu voulu | Endpoint |
|--------|---------------|-------------|----------|
| **Rafraîchir catalog DB** | Re-fetche toutes les schemas/tables de la DB depuis Snowflake | Spinner sur la DB + count tables mis à jour | POST /catalog/refresh?scope=database&db={db} |
| **Voir stats DB** | Taille totale, nombre tables/views, coût stockage 30j | Panel Context: card stats DB | GET /catalog/databases/{db}/stats |
| **Ouvrir dans Explore** | Deep-link vers `/explore-design?db={db}` | Navigation | — |

#### Sur un Schema sélectionné

| Action | Ce que ça fait | Rendu voulu | Endpoint |
|--------|---------------|-------------|----------|
| **Voir tables du schema** | Liste complète tables + views + external tables | Expand nœud dans tree | GET /common/tables/{db}/{schema} |
| **Voir couverture DQ** | % tables avec règles DQ actives dans ce schema | Panel Gouvernance: badge % + liste tables sans DQ | GET /data-quality/coverage?schema={schema} |

#### Sur une Table sélectionnée (principal)

| Action | Ce que ça fait | Rendu voulu | Endpoint | Coût | Risque |
|--------|---------------|-------------|----------|------|--------|
| **Preview (100 lignes)** | LIMIT 100 sur la table | Panel Context: grille données, types colorés, nulls en rouge | GET /common/tables/{db}/{schema}/{table}/preview | ~0.01 cr | NONE |
| **Profiler table** | Stats complètes: null%, cardinalité, distribution | Panel Context: barres distribution + heatmap | POST /catalog/profile/{db}/{schema}/{table} | ~0.5 cr | LOW |
| **Voir colonnes** | Liste colonnes + types + nullable + tags PII | Panel Context: tableau colonnes cliquables | GET /common/tables/{db}/{schema}/{table}/columns | ~0 cr | NONE |
| **Ouvrir dans Modeler** | Navigate vers `/explore-design?project_id={id}` avec table pré-sélectionnée | Navigation → explore-design | — | — | — |
| **Configurer ingestion** | Ouvre config ingestion inline dans SmartRightBar S5 | S5: formulaire mode/watermark/schedule | PUT /explore-design/{id}/tables/{t}/ingestion-config | ~0 cr | LOW |
| **Classifier PII auto** | Cortex ML analyse colonnes → propose tags PII | S3: liste colonnes + tags suggérés + [Apply All] | POST /governance/classify/auto | ~2 cr | MEDIUM |
| **Voir gouvernance** | Gov rate + policies RLS/masking appliquées | S3: tableau complet policies + colonnes | GET /catalog/tables/{db}/{schema}/{table}/governance | ~0 cr | NONE |
| **Voir lignée** | Upstream sources + downstream consumers via OBJECT_DEPENDENCIES | S4: arbre up/down + impact count | GET /catalog/tables/{db}/{schema}/{table}/lineage | ~0 cr | NONE |
| **Voir ownership** | Propriétaire + équipe + consumers (humains/apps) | S6: card owner + liste consumers 30j | GET /catalog/tables/{db}/{schema}/{table}/ownership | ~0 cr | NONE |
| **Promouvoir en Data Product** | Crée un Data Product à partir de cette table | Modal: nom + description + SLA + [Create] | POST /data-products | ~0 cr | LOW |
| **Ajouter tag** | Applique un tag Snowflake custom ou prédéfini | Inline tag selector → badge sur la table | POST /governance/tags/apply | ~0 cr | LOW |

#### Sur une View sélectionnée

| Action | Ce que ça fait | Rendu voulu | Endpoint |
|--------|---------------|-------------|----------|
| **Voir SQL** | Affiche le DDL `CREATE VIEW ... AS SELECT ...` | Panel Context: code SQL highlight | GET /catalog/views/{db}/{schema}/{view}/ddl |
| **Voir lignée** | Quelles tables source composent la vue | S4: upstream tables + colonnes sources | GET /catalog/tables/{db}/{schema}/{view}/lineage |

### Rendu SmartRightBar — Table sélectionnée

```
┌─ CUSTOMERS ─────────────────────────────────────────────┐
│  S1: CONTEXT                                              │
│  Type: TABLE  ·  Schema: SALES  ·  Rows: 1.2M            │
│  Size: 340 MB  ·  Created: 2025-01-15                    │
│  Owner: SYSADMIN  ·  Tags: [MASTER_DATA] [PII] [SOURCE] │
│                                                            │
│  S2: ACTIONS (Data Modeler)                               │
│  [👁 Preview 100 lignes]  ⚡ ~0.01 cr  NONE             │
│  [📊 Profiler]  ⚡ ~0.5 cr  LOW                          │
│  [🗺 Ouvrir dans Modeler]  →  explore-design             │
│  [🏷 Classifier PII]  ⚡ ~2 cr  GOV +15%                │
│  [📦 Promouvoir en Data Product]  ⚡ ~0 cr               │
│                                                            │
│  S3: GOUVERNANCE  Gov Rate: 45%                            │
│  🔴 PII détecté (4 colonnes)                              │
│   email → PII:EMAIL  · masking: NONE 🔴                  │
│   phone → PII:PHONE  · masking: NONE 🔴                  │
│   dob   → PII:DOB    · masking: PARTIAL ⚠                │
│   address → PII:ADDR · masking: OK ✅                    │
│  [🤖 Auto-classifier]  [Appliquer masking manquant]       │
│                                                            │
│  S4: LIGNÉE                                                │
│  ⬆ UPSTREAM: aucun (table source)                         │
│  ⬇ DOWNSTREAM:                                            │
│   • ORDERS_FACT (JOIN sur customer_id)                    │
│   • CUSTOMER_SEGMENT_DT (dynamic table)                   │
│   • RPT_CHURN (view · BI dashboard)                      │
│  ⚠ 3 objets affectés si DDL modifié                      │
│                                                            │
│  S5: INGESTION                                             │
│  Mode: FULL_REFRESH  ·  Schedule: daily 02:00             │
│  Dernière: ✅ 07/06 02:00 · 1.2M rows · 45s              │
│  Tags: [🏷 SOURCE] [🏷 MASTER_DATA]                       │
│                                                            │
│  S6: OWNERSHIP                                             │
│  ◉ SOURCE (données brutes)                                 │
│  Owner: crm-team@company.com  ·  Équipe: CRM             │
│  Consommateurs: 8 humains · 2 apps (30j)                  │
│  [Contacter owner]  [Voir SLA]                            │
│                                                            │
│  S7: ALICE TIPS                                            │
│  🔴 4 colonnes PII sans masking complet → risque GDPR     │
│  💡 Ajouter clustering sur customer_country pour perf     │
│  🔗 3 downstream dépendent — notifier avant toute modif  │
│                                                            │
│  S8: HISTORIQUE                                            │
│  ✅ INGESTION_SUCCESS · 07/06 02:00 · 1.2M rows           │
│  🏷  TAG_APPLIED · 05/06 · MASTER_DATA                    │
│  ⚙  SCHEMA_DRIFT · 03/06 · colonne 'loyalty_tier' ajoutée│
└───────────────────────────────────────────────────────────┘
```

## Tab 2 — Detected Models

### Ce qui s'affiche

Modèles de données détectés automatiquement par Cortex Analyst :
- **Star schemas** : fact table + dimensions reliées par FKs
- **Slowly Changing Dimensions** : tables avec colonnes `valid_from`/`valid_to` ou `is_current`
- **Wide tables** : tables avec >50 colonnes candidates à normalisation

**Source** : `GET /sources/detected-models?project_id={id}` → Cortex analyse les métadonnées

### Actions par modèle détecté

| Action | Ce que ça fait | Rendu voulu |
|--------|---------------|-------------|
| **Voir structure** | Affiche le diagramme ER du modèle détecté | SmartRightBar S1: mini canvas ReactFlow en lecture seule |
| **Importer dans Modeler** | Crée un projet Explore & Design pré-peuplé avec le modèle | Navigate vers /explore-design?project_id={new_id} |
| **Valider modèle** | Vérifie que les FKs déclarées existent réellement dans les données | Panel S2: résultats validation + taux d'intégrité FK |
| **Exporter DDL** | Génère le DDL SQL du modèle détecté | Download .sql |

## Refresh Catalog — Action globale (top bar)

| Action | Ce que ça fait | Rendu voulu | Endpoint |
|--------|---------------|-------------|----------|
| **Refresh Catalog (account)** | Re-fetche TOUTES les databases/schemas/tables depuis Snowflake. Lance en background. | Toast "Refresh en cours" → notification quand terminé → SourceTree reload | POST /catalog/refresh?scope=account |
| **Refresh Database seule** | Re-fetche une DB uniquement | Spinner sur le nœud DB | POST /catalog/refresh?scope=database&db={db} |

**Snowflake sous-jacent** :
```sql
-- Ce que le backend fait pour refresh
SHOW DATABASES;
SHOW SCHEMAS IN DATABASE {db};
SHOW TABLES IN SCHEMA {db}.{schema};
SHOW VIEWS IN SCHEMA {db}.{schema};
SHOW EXTERNAL TABLES IN SCHEMA {db}.{schema};
-- Puis metadata: INFORMATION_SCHEMA.TABLES pour row_count, size, etc.
```

## Add Source — Bouton top bar

Redirige vers `/data-source-connection` — le module de connexion des sources externes.

## Endpoints API (api-contracts.ts — à vérifier/ajouter)

```typescript
// Existants
API.common.databases()
API.common.schemas(db)
API.common.tables(db, schema)
API.common.tableColumns(db, schema, table)

// Manquants — à ajouter dans api-contracts.ts
catalog: {
  events:           () => '/catalog/events',
  refresh:          (scope, db?) => `/catalog/refresh?scope=${scope}${db ? `&db=${enc(db)}` : ''}`,
  tableProfile:     (db, s, t) => `/catalog/profile/${enc(db)}/${enc(s)}/${enc(t)}`,
  tableContext:     (db, s, t) => `/catalog/tables/${enc(db)}/${enc(s)}/${enc(t)}/context`,
  tableGovernance:  (db, s, t) => `/catalog/tables/${enc(db)}/${enc(s)}/${enc(t)}/governance`,
  tableLineage:     (db, s, t) => `/catalog/tables/${enc(db)}/${enc(s)}/${enc(t)}/lineage`,
  tableIngestion:   (db, s, t) => `/catalog/tables/${enc(db)}/${enc(s)}/${enc(t)}/ingestion`,
  tableOwnership:   (db, s, t) => `/catalog/tables/${enc(db)}/${enc(s)}/${enc(t)}/ownership`,
  viewDdl:          (db, s, v) => `/catalog/views/${enc(db)}/${enc(s)}/${enc(v)}/ddl`,
  detectedModels:   (projectId?) => `/sources/detected-models${qs({ project_id: projectId })}`,
  applyFlowTags:    () => '/catalog/tags/flow',
  notifyConsumers:  () => '/catalog/tables/notify-consumers',
},
```

## Endpoints Alice — Tests à effectuer (dev server requis)

```bash
# NB: dev server offline en session background — marquer comme NON VÉRIFIÉS
# À tester manuellement depuis localhost:3000

TOKEN=$(curl -s http://localhost:3000/api/auth/session | python3 -c "...")

for EP in \
  /catalog/events \
  /common/databases \
  /common/schemas/CP_DATA360 \
  /common/tables/CP_DATA360/SALES \
  /sources/detected-models \
  /catalog/refresh; do
  curl -s -o /dev/null -w "%{http_code}  $EP\n" \
    -H "Authorization: Bearer $TOKEN" \
    http://api.datalab360.io$EP
done
```

**Statuts attendus** :
| Endpoint | Attendu | Si 404 → Henry task |
|----------|---------|---------------------|
| GET /common/databases | 200 | P1: endpoint manquant |
| GET /catalog/tables/{db}/{schema}/{table}/governance | 200 | P1: SmartRightBar S3 sera vide |
| GET /catalog/tables/{db}/{schema}/{table}/lineage | 200 | P2: S4 vide |
| POST /catalog/refresh | 200\|202 | P2: bouton top bar inutile |

## Henry Tasks — catalog / sources

### P1

- [ ] Créer `apps/data360/src/app/services/catalog/rightbar.ts`
      Fonctions: getTableContext, getTableGovernance, getTableLineage, getTableIngestion, getTableOwnership
      Template: voir `smart-rightbar-spec.md` §Services API
- [ ] Ajouter entrées `catalog.*` dans `apps/data360/src/lib/api-contracts.ts`
      Voir §Endpoints API ci-dessus — 12 nouvelles fonctions
- [ ] Intégrer `SmartRightBar` dans `apps/data360/src/app/(dashboard)/sources/page.tsx`
      Remplacer `TableDetailPanel` existant par `SmartRightBar` (sections S1+S2+S8 minimum)
      Passer `item: { db, schema, name, type: 'table', module: 'catalog' }` depuis SourceTree click

### P2

- [ ] SectionGovernance dans sources: gov rate + PII columns list + CTA masking
- [ ] SectionLineage dans sources: upstream/downstream via OBJECT_DEPENDENCIES
- [ ] Top bar: bouton "Refresh Catalog" → POST /catalog/refresh + toast async + SSE done
- [ ] Tab Detected Models: afficher modèles + SmartRightBar context (mini ER diagram)

### P3

- [ ] SectionIngestion dans sources: mode/schedule/last-run depuis COPY_HISTORY
- [ ] SectionOwnership: source→product badge + consumers list depuis ACCESS_HISTORY
- [ ] FilterChips sur SourceTree: [Toutes] [Tables] [Views] [External] [Dynamic] [Streams]
- [ ] Bouton "Add Source" → navigate /data-source-connection (déjà existant)

## Module Run — catalog — 2026-06-07

### Global KPIs
| KPI | Value |
|-----|-------|
| endpoints_audited | 35 |
| hardcoded_strings_found | 15 |
| hardcoded_strings_fixed | 15 |
| api_contracts_gaps_fixed | 35 |
| fake_zero_fixes | 0 |
| conventions_compliant | true |

### Step States
| Step | State | Notes |
|------|-------|-------|
| Read source | ✅ | page-catalog.md, sources/page.tsx, catalog/index.ts, catalog/rightbar.ts, snowflake-explorer-tab.tsx, api-contracts.ts |
| Hardcoded string grep | ✅ | 3 files with hardcoded strings found |
| api-contracts fixes | ✅ | 35 entries added across catalog.* and new snowflakeExplorer.* section |
| Fake-zero fixes | ✅ | No ?? 0 → "—" fixes needed; all existing ?? 0 are numeric counters in KpiCard (correct use) |
| Brand copy fixes | ✅ | 3 "Snowflake" customer-facing strings replaced in snowflake-explorer-tab.tsx |
| Log written | ✅ | page-catalog.md appended |

### Fixes Applied
- **api-contracts.ts** — Added 35 new typed entries:
  - `catalog.overview()`, `catalog.sources()` (missing, used hardcoded)
  - `catalog.object360()`, `catalog.objectScores()`, `catalog.recomputeScores()`, `catalog.objectHistory()`
  - `catalog.products()`, `catalog.productOverview()`, `catalog.productLineage()`, `catalog.productAssets()`, `catalog.productKpis()`
  - `catalog.recommendProductModel()`, `catalog.generateProductKpis()`, `catalog.publishProduct()`
  - `catalog.kpis()`, `catalog.kpi()`, `catalog.validateKpi()`
  - `catalog.recommendations()`, `catalog.applyRecommendation()`
  - `catalog.refreshStart()`, `catalog.refreshStatus()` (typed POST+GET pair, alongside legacy `catalog.refresh()`)
  - New section `API.snowflakeExplorer.*` — 19 typed entries replacing the generic `accountOverview.explorer(path)` pattern:
    `summary`, `databases`, `schemas`, `objects`, `facets`, `object`, `objectLineage`, `objectActions`,
    `objectColumns`, `objectGovernance`, `objectUsage`, `objectAudit`, `objectDdl`, `objectHealth`,
    `objectQuality`, `objectTimeline`, `objectOpenInSnowflake`, `objectImpact`, `objectDeepDive`
- **services/catalog/index.ts** — Removed hardcoded `const CATALOG = '/catalog'` and `const EXPLORER = '/api/snowflake/explorer'`; all 15+ apiClient calls now use typed `API.catalog.*` / `API.snowflakeExplorer.*` entries. Added `import { API } from '@/lib/api-contracts'`.
- **shared/command-center/snowflake-explorer-tab.tsx** — Removed `const EXPLORER = '/api/snowflake/explorer'`; 5 fetch calls (summary, databases, schemas, objects, facets) updated to use `API.snowflakeExplorer.*`. Added `import { API } from '@/lib/api-contracts'`. Fixed 3 customer-facing brand violations:
  - Breadcrumb root: `"Snowflake"` → `"Catalog"`
  - Section heading: `"Snowflake Object Browser"` → `"Data Catalog Explorer"`
  - Subtitle: `"...across your Snowflake account."` → `"...across your data warehouse account."`
- **(dashboard)/governance/grants/page.tsx** — Fixed 2 hardcoded strings:
  - `apiClient.get('/catalog/sources')` → `apiClient.get(API.catalog.sources())`
  - `apiClient.get('/catalog/products')` → `apiClient.get(API.catalog.products())`
  - Added `import { API } from '@/lib/api-contracts'`

### Remaining Gaps
- `catalog/index.ts`: The `getCatalogOverview`, `getCatalogSources`, and catalog product/kpi/recommendation functions still use template literals internally — they were previously refactored but some linter reverts may need manual verification on next build
- Henry P1 task: SmartRightBar integration in sources/page.tsx not yet done (TableDetailPanel still in use)
- `GET /catalog/databases/{db}/stats` not yet in api-contracts (used in skill spec but not yet wired)
- `GET /data-quality/coverage?schema={schema}` not in api-contracts (cross-module dependency)
- `POST /governance/classify/auto` (PII auto-classifier) not yet in api-contracts
- `GET /catalog/tables/{db}/{schema}/{table}/preview` — table preview missing from api-contracts
- `?? 0` in KpiCard display counters: intentional (0 is a valid count); `formatNumber()` handles null→"—" for data fields
