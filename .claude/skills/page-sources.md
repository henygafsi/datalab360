---
name: page-sources
description: >
  Référence Source Catalog Data360 (route /sources). 202 lignes. Layout 3 zones :
  SourceTree (arbre DB/schema/table) + SourcesOverview (grille tables) + TableDetailPanel
  (right panel 420px). Tab "Detected Models" via DetectedModelsTab + ProjectSelector.
  Rôle : Data Engineer + Data Modeler. Entry point vers Explore & Design.
---

# Source Catalog — Référence Data360

## Route et fichier source

- **Route** : `/sources`
- **Titre affiché** : "Source Catalog"
- **Fichier** : `apps/data360/src/app/(dashboard)/sources/page.tsx` (202 lignes)
- **Pattern** : Layout 3 colonnes (tree + main + detail panel) sur tab "Sources"

## Ce qui s'affiche réellement

### Header
- Breadcrumb: `Home / Sources & Models`
- H1 : `Source Catalog` avec icône `Database`
- Sous-titre : "Explore, enrich and detect models from your data sources"
- Boutons : `ProjectSelector` + badge refresh-status + `Refresh Catalog` + `Add Source`

### Tabs (2 tabs)
| Tab ID | Label | Icône | Badge |
|--------|-------|-------|-------|
| `sources` | Sources | Database | count tables sélectionnées (si > 0) |
| `models` | Detected Models | Brain | aucun |

### Tab Sources — Layout

```
┌──────────────┬───────────────────────────┬────────────────────────┐
│ SourceTree   │ SourcesOverview           │ TableDetailPanel       │
│ (arbre       │ (grille tables,           │ (420px, right panel)   │
│  collapsible)│  onSelectTable)           │ s'ouvre quand table    │
│              │                           │ sélectionnée dans tree │
└──────────────┴───────────────────────────┴────────────────────────┘
```

**SourceTree** : navigation arbre Database → Schema → Table (collapsible)
- Clic table → `handleSelectTable(db, schema, table)` → met à jour `selectedTable` + `sourceTables[]`
- `treeCollapsed` state → bouton toggle collapse

**SourcesOverview** : grille de tables avec metadata (`onSelectTable` callback)

**TableDetailPanel** (420px, `w-[420px] shrink-0`) :
- S'affiche uniquement si une table est sélectionnée dans SourceTree
- Fermeture : `onClose={() => setSelectedTable(null)}`
- Props : `database`, `schema`, `table`

### Tab Detected Models

`DetectedModelsTab` avec `projectId` (depuis `ProjectSelector`) et `sourceTables` (tables sélectionnées)
- Si aucun projet sélectionné : état vide "No Project Selected"
- Si projet sélectionné : détection de modèles IA depuis les tables de ce projet

## Actions disponibles

| Action | Endpoint | Composant |
|--------|----------|-----------|
| Refresh Catalog | `POST /catalog/refresh` (scope_type='account') | Bouton header |
| Add Source | redirect `/data-source-connection` | Bouton header (Link) |
| Sélectionner table | UI state local | SourceTree clic |
| Open in Modeler | deep-link `/explore-design?project_id=` | dans TableDetailPanel |
| Detect Models | via DetectedModelsTab + projectId | Tab Models |

**Refresh Catalog** : utilise `refreshCatalog({ scope_type: 'account', scope_value: '' })` depuis `@/app/services/catalog`. Affiche un status badge (OK=vert, erreur=rouge) avec `run_id`.

## Deep-links entrants

- `/sources?project=<id>` ou `/sources?project_id=<id>` — pré-sélectionne le projet pour DetectedModels
- Les 2 params sont gérés : `searchParams.get('project') ?? searchParams.get('project_id')`

## Services et endpoints

```typescript
// apps/data360/src/app/services/catalog/index.ts
refreshCatalog({ scope_type, scope_value })  // POST /catalog/refresh
                                              // returns { status, run_id }
```

## Composants sous-dossier

```
sources/
├── page.tsx                     # 202L — shell + layout
├── components/
│   ├── SourceTree.tsx            # Arbre navigable DB/Schema/Table
│   ├── SourcesOverview.tsx       # Grille overview des tables
│   ├── TableDetailPanel.tsx      # Right panel détail table (420px)
│   └── DetectedModelsTab.tsx     # IA model detection depuis les sources
```

## Rôles utilisateurs

| Rôle | Actions |
|------|---------|
| **Data Engineer** | Explorer sources, Refresh catalog, Add Source, Detect Models |
| **Data Modeler** | Explorer sources, Open in Modeler, Detect Models pour projet |
| **Data Analyst** | Explorer sources uniquement (read-only) |

## États UI

| Situation | Comportement |
|-----------|-------------|
| Refresh OK | Badge vert "Catalog refresh ok (run {run_id})" |
| Refresh erreur | Badge rouge avec message d'erreur |
| Table sélectionnée | TableDetailPanel s'ouvre à droite (420px) |
| Tab Models, pas de projet | DetectedModelsTab : "No Project Selected" empty state |
| Tab Models, projet sélectionné | Détection IA des modèles depuis les tables |

## Alice Smart Panel — spec (à implémenter)

```
Sélection: ANALYTICS.PUBLIC.CUSTOMER_ORDERS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Détails :
  Database: ANALYTICS | Schema: PUBLIC
  Tables rows: 2.4M | Size: 1.2 GB | Refreshed: 2h ago

Actions :
  [Open in Modeler]    → /explore-design?project_id=&table=ANALYTICS.PUBLIC.CUSTOMER_ORDERS
  [Add as Data Product]→ /data-products (pre-fill TABLE_FQN)
  [Detect PII]         → POST /gouvernance/classify?table=ANALYTICS.PUBLIC.CUSTOMER_ORDERS
  [Run DQ Check]       → POST /data-quality/run?table=...
  [Refresh this table] → POST /catalog/refresh (scope_type='table')

Tag Proposals (Alice) :
  source: ✅ (données brutes ingérées)
  domain: sales (détecté depuis nom)
  sensitivity: medium (colonnes EMAIL, PHONE détectées)
  → [Appliquer tags] → POST /gouvernance/tags/apply

PII Détectées :
  EMAIL (col 4) — masking policy ⚠️ absent
  CUSTOMER_NAME (col 2) — classification: name ⚠️ pas de tag

Lineage :
  Consommée par: 3 downstream (1 data product, 2 tasks)
  → [Voir lineage] → /observability/lineage?table=...

Gov Rate : 62% (masking manquant sur 2 cols)
```

## Henry Tasks — sources

### P1
- [ ] `TableDetailPanel` : ajouter onglets Actions / Alice / Lineage / History (remplace le panel flat actuel)
- [ ] Détecter PII via `POST /gouvernance/classify?table=DB.SCHEMA.TABLE` et afficher dans panel
- [ ] `api-contracts.ts` : ajouter `API.catalog.refresh()`, `API.catalog.tableDetail(db, schema, table)`

### P2
- [ ] Tag proposals : Alice appelle `POST /cortex/query` avec prompt `"Propose tags for table {fqn} given columns {cols}"` + bouton `Appliquer tags`
- [ ] Compteur `sourceTables` dans badge tab Sources : ne compter que les tables uniques ajoutées à la session
- [ ] Action "Add as Data Product" : redirect `/data-products` avec FQN pre-filled dans CreateForm

### P3
- [ ] Panel quality inline : score DQ live depuis `/data-quality/quality-summary?table=` dans TableDetailPanel
- [ ] SourceTree : icônes de statut par table (PII detected, DQ score, data product existant)
- [ ] Ingestion management : bouton `Configure Ingestion` → `/data-source-connection?table=FQN`

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
| Read source | ✅ | sources/page.tsx (202L), DetectedModelsTab, TableDetailPanel, SourceCatalog read |
| Convention check | ✅ | apiClient used in catalog service and s3Servicer; no raw axios/fetch for auth calls |
| api-contracts fixes | ✅ | 7 entries added to API.connect block |
| Brand violations | ✅ | 0 fixed — connect page is an admin/integration view; vendor names (Snowflake, AWS, GCS…) are legitimate in provider picker; "star/snowflake schema" at DetectedModelsTab:124 is a dimensional-modeling term, not a vendor reference |
| Fake-zero fixes | ✅ | 2 fixed (DetectedModelsTab:129, SourceCatalog:479) |
| Log written | ✅ | page-sources.md + page-connect.md appended |

### Fixes Applied
- `api-contracts.ts` API.connect: added `listConnectors`, `connectorsHealth`, `sourceCatalog`, `createConnector`, `getConnector(id)`, `testConnector(id)`, `syncConnector(id)` — 7 entries
- `sources/components/DetectedModelsTab.tsx:129`: `sourceTables?.length ?? 0` → `sourceTables?.length ?? '—'`
- `data-source-connection/SourceCatalog.tsx:479`: `String(catalog.tables_loaded_30d ?? 0)` → `catalog.tables_loaded_30d != null ? String(catalog.tables_loaded_30d) : '—'`

### Remaining Gaps
- `useCacheInvalidation` not hooked in sources/page.tsx or data-source-connection/page.tsx — no SSE-driven cache invalidation for catalog refresh events
- 7 new API.connect endpoints added as directed; not independently verified against `app/modules/connectors/router.py` (frontend-only repo); the InsightActionButton 404/501 pattern covers any route not yet live
- `sources/page.tsx` has no `useCanPerform` gating on the Refresh Catalog or Add Source buttons — Henry P1 task still open

## Alice Run — sources — 2026-06-07 (full-suite KPI sweep)

> Method: dev OFFLINE → existence vs backend route manifest (823 entries). No fabricated statuses.
> Scope domains: dataSource (5), common (4), mapping (1).

### Global KPIs

| KPI | Valeur |
|-----|--------|
| endpoints_testés (contract paths) | 10 |
| endpoints_ok (registered) | 10 |
| endpoints_404 | 0 |
| endpoints_500 | 0 |
| endpoints_non_vérifiés (offline) | 10 |
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

### Henry Tasks — sources (backend delegation)

Aucune route backend manquante (100% des chemins du contrat sont enregistrés dans le manifest).
Gaps restants = frontend/UX (SmartRightBar, annotations CTA, Cortex tips) — hors scope "dev backend".
Test live (données réelles) à refaire quand le dev server sera up (actuellement NON VÉRIFIÉ).
