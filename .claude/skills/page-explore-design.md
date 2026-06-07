---
name: page-explore-design
description: >
  Référence Explore & Design Data360. Route /explore-design. Fichier page.tsx de 5145 lignes.
  Déjà un ContextRightBar implémenté ! Deux modes : catalog (liste tables) + modeling (canvas ReactFlow).
  Rôle principal : Data Modeler + Data Engineer. La page la plus complète du projet.
---

# Explore & Design — Référence Data360

## Route et fichier source

- **Route** : `/explore-design`
- **Fichier** : `apps/data360/src/app/(dashboard)/explore-design/page.tsx` (**5145 lignes**)
- **Pattern actuel** : ViewMode catalog | modeling + `ContextRightBar` déjà présent ✅
- **Sous-composants** : `ModelingCanvas`, `SourceMindMap`, `ContextRightBar`, `HistoryRail`

## IMPORTANT : ContextRightBar déjà implémenté !

```typescript
// Importé dynamiquement dans page.tsx :
const ContextRightBar = dynamic(() => import('./components/ContextRightBar'), { ssr: false });
import type { RightBarTab, FocusedAction } from './components/ContextRightBar';
```

C'est la page la plus avancée en termes de pattern panel. Alice doit s'en inspirer
pour les autres modules.

## Rôles utilisateurs

| Rôle | Mode utilisé | Actions principales |
|------|-------------|---------------------|
| **Data Modeler** | catalog + modeling | Cataloguer tables, modéliser FK/PK, versionner, déployer |
| **Data Engineer** | catalog (data engineering) | Dynamic tables, streams, alerts, ingestion config |
| **DQ Analyst** | catalog (policies) | Voir masking policies appliquées, classification |
| **Platform Admin** | catalog | Voir toutes les tables, ingestion modes |

## Layout actuel (extrait du code)

```tsx
// ViewMode: 'catalog' | 'modeling'
// ContextRightBar en panel droit (déjà branché)

<div className="flex h-full">
  {/* Main (catalog ou modeling canvas) */}
  <div className="flex-1 overflow-auto">
    {viewMode === 'catalog' && <CatalogView ... />}
    {viewMode === 'modeling' && <ModelingCanvas ... />}
  </div>
  {/* ContextRightBar — déjà là ! */}
  <ContextRightBar
    tab={rightBarTab}
    focusedAction={focusedAction}
    selectedTable={selectedTable}
    ...
  />
</div>
```

## 9 Sub-tabs (spec _features.md)

### Catalog (mode catalog)
- **Ce qui s'affiche** : `VirtualizedTableList` — tables + colonnes virtualisées
- **Sources** : getDatabases(), getSchemas(), getTables(), getTableColumns()
- **Actions** :
  - Configurer ingestion: `TableDetailPanel` (IngestionMode, IngestionConfig)
  - Appliquer masking: getMaskingPolicies() + apply
  - Renommer table/colonne: DDL event
  - Preview données: GET /common/tables/{db}/{schema}/{table}/preview
  - Profiler: `fetchTableProfile()`
  - Créer table: `CreateTableModal` (Snowflake types: standard/transient/external/iceberg/hybrid/dynamic)

### Modeling Canvas
- **Composant** : `ModelingCanvas.tsx` (React-Flow)
- **Actions** :
  - Drag tables sur canvas
  - Créer FK: `RelationshipModal` (type-compatibility check via `validateFkTypes()`)
  - Set PK: `createPrimaryKeyEvent()`
  - Visualiser mind map: `SourceMindMap.tsx`
  - Export schéma: DDL generation

### Data Engineering Primitives
- **Composants** : `DynamicTableModal`, `StreamModal`, `AlertModal`, `EventTableModal`, `HybridTableModal`
- **Actions** :
  - Créer Dynamic Table: `listDynamicTables()` + `POST /explore-design/dynamic-tables`
  - Suspend/Resume DT: `suspendDynamicTable()`, `resumeDynamicTable()`
  - Créer Stream: `listStreams()` + `dropStream()`
  - Créer Alert: `listAlerts()` + `dropAlert()`
  - Iceberg / Hybrid tables
- **Snowflake** : SF:C4(Hybrid), SF:C5(Dynamic), SF:C6(Event), SF:C7(Streams)

### Policies & Classification
- **Composant** : `PolicyAssignmentPanel.tsx`, `AccessManagementSlot.tsx`
- **Actions** :
  - Assigner masking policy à une colonne
  - Voir classification existante: `getColumnClassification()`
  - Auto-classification PII: `discoverRelationships()`

### Deployment Wizard
- **Composant** : `DeploymentValidation.tsx`
- **Actions** :
  - Générer DDL: `generateSnowflakeSQL()` + `generateAndValidateDDL()`
  - Pre-check: conflit détection `checkConflicts()`
  - Dry-run: `IngestionDryRunPanel.tsx`
  - Soumettre pour approval: POST /explore-design/{id}/deployments
  - Diff SQL: `SqlDiffViewer.tsx`
- **Snowflake** : SF:C14(Clone), SF:C15(Time Travel)

### Versions & Rollback
- **Actions** :
  - Voir versions: GET /explore-design/{id}/versions
  - Rollback: POST /explore-design/{id}/rollback → zero-copy clone swap
  - Inspecter état passé: SELECT ... AT(STATEMENT => ...)
- **Snowflake** : SF:C14, SF:C15, SF:C16

### Templates Library
- **Composant** : `TemplateLibrary.tsx`
- **Actions** :
  - Choisir template DWH: `ModelingTemplateModal.tsx`
  - Fork template: `ManualAiTemplateFork.tsx`
  - Templates data: `data/dwh-template-data.ts` (DWH_TEMPLATE_TABLES)

### History & Audit
- **Composant** : `HistoryRail.tsx` (dans ContextRightBar)
- **Source** : `useEventStore()` + `listProjectEvents()` + `DESIGN_EVENTS`

### AI Recommendations
- **Composant** : `AiGuidedModelButton.tsx` + `AiGuidedModelWizard.tsx`
- **Service** : `useAiAnalysis()`, `useAiFeatures()`
- **Actions** :
  - `aiSchemaHealth()` → santé schéma
  - `tablePreview()` → preview données
  - Toggle: `AiFeatureToggle.tsx`
- **Snowflake** : SF:C11(Search optimization), SF:C12(Clustering), SF:D7(Classify)

## Composants clés

```
explore-design/
├── page.tsx                      # 5145 lignes — core de l'app
├── components/
│   ├── ContextRightBar.tsx       # ✅ Panel droit déjà implémenté
│   ├── ModelingCanvas.tsx        # ReactFlow modeling
│   ├── SourceMindMap.tsx         # Mind map source tables
│   ├── HistoryRail.tsx           # Historique DESIGN_EVENTS
│   ├── DeploymentValidation.tsx  # Wizard déploiement
│   ├── CreateTableModal.tsx      # Créer table (6 types)
│   ├── DynamicTableModal.tsx     # Dynamic table
│   ├── SqlDiffViewer.tsx         # Diff SQL avant/après
│   ├── AiGuidedModelButton.tsx   # AI guided modeling
│   ├── TemplateLibrary.tsx       # Templates DWH
│   └── ProjectSelector.tsx      # Sélecteur projet (to replace with useProjectContext)
├── hooks/
│   └── useAiAnalysis.ts          # Hook analyse AI
├── stores/
│   ├── event-store.ts            # Jotai event store local
│   └── ai-store.ts               # AI features toggle
├── data/
│   └── dwh-template-data.ts      # Templates tables DWH
└── services/
    └── de-objects.ts             # Dynamic tables, streams, alerts
```

## Matrice Actions Exhaustive — par section et rôle

### MODE CATALOG — Vue tables

#### Action GROUP: Exploration & Preview

| Action | Ce que ça fait | Rendu voulu | Endpoint | Coût | Risque | Impact lignée |
|--------|---------------|-------------|----------|------|--------|---------------|
| **Preview données** | Lit les 100 premières lignes avec LIMIT | Panel Détails: grille tabulaire, colonnes typées, valeurs nulles en rouge | GET /common/tables/{db}/{schema}/{table}/preview | ~0.01 cr | LOW | Aucun |
| **Profiler table** | Stats complètes: null%, distinct count, min/max, top values par colonne | Panel Détails: barres de distribution + heatmap null% | POST /explore-design/{id}/profile | ~0.5 cr | LOW | Aucun |
| **Voir colonnes** | Liste colonnes + types Snowflake + nullable + precision | Panel Détails: table colonnes scrollable, badge PII si tag détecté | GET /common/tables/{db}/{schema}/{table}/columns | ~0 cr | NONE | Aucun |
| **Classification PII auto** | Cortex ML analyse les noms/valeurs colonnes et pose tags PII:EMAIL, PII:PHONE, etc. | Panel Gouvernance: liste colonnes candidates + tags suggérés + bouton Apply | POST /governance/classify/auto | ~2 cr | MEDIUM | Gov rate ↑ |

#### Action GROUP: Data Engineering (Dynamic/Stream/Alert)

| Action | Ce que ça fait | Rendu voulu | Endpoint | Coût | Risque | Impact lignée |
|--------|---------------|-------------|----------|------|--------|---------------|
| **Créer Dynamic Table** | `CREATE DYNAMIC TABLE ... TARGET_LAG='1min' AS SELECT...` | Modal → config lag/warehouse → nœud DT dans canvas ModelingMode | POST /explore-design/dynamic-tables | ~5+ cr/h | HIGH | Crée dépendance sur table source |
| **Suspend Dynamic Table** | `ALTER DYNAMIC TABLE ... SUSPEND` | Badge SUSPENDED sur la DT dans la liste | POST /explore-design/dynamic-tables/{id}/suspend | ~0 cr | LOW | Arrête refresh — données figées |
| **Resume Dynamic Table** | `ALTER DYNAMIC TABLE ... RESUME` | Badge RUNNING + lag live SSE | POST /explore-design/dynamic-tables/{id}/resume | ~5 cr/h | LOW | Reprend refresh |
| **Refresh manuel DT** | `ALTER DYNAMIC TABLE ... REFRESH` | Spinner + badge REFRESHING | POST /explore-design/dynamic-tables/{id}/refresh | ~0.5 cr | LOW | Mise à jour immédiate |
| **Créer Stream** | `CREATE STREAM ... ON TABLE ...` — capture CDC | Badge STREAM sur table source + affiche delta pending rows | POST /explore-design/streams | ~0 cr | LOW | Crée dépendance CDC sur table |
| **Créer Alert** | `CREATE ALERT ... SCHEDULE ... IF ... THEN CALL ...` | Modal config: schedule + condition SQL + action | POST /explore-design/alerts | ~0.1 cr/run | LOW | Alerte sur métriques table |
| **Créer Event Table** | `CREATE EVENT TABLE ...` — append-only WORM | Modal simple: nom + schéma | POST /explore-design/event-tables | ~0 cr | LOW | Nouvelle table audit |
| **Créer Hybrid Table** | Table Snowflake avec index rowstore pour requêtes OLTP ultra-basses latences | Modal: colonnes + index + constraints | POST /explore-design/hybrid-tables | variable | HIGH | Nouveau objet Snowflake |

#### Action GROUP: Ingestion Config

| Action | Ce que ça fait | Rendu voulu | Endpoint | Coût | Risque | Impact lignée |
|--------|---------------|-------------|----------|------|--------|---------------|
| **Configurer mode ingestion** | Choisit FULL_REFRESH / INCREMENTAL / STREAM / COPY | Panel Ingestion: dropdown mode + config watermark ou merge key | PUT /explore-design/{id}/tables/{t}/ingestion-config | ~0 cr | LOW | Change stratégie load |
| **Ingérer maintenant** | Lance immédiatement l'ingestion de la table | Panel Actions: spinner → badge SUCCESS + row count + durée | POST /explore-design/{id}/execute-ingestion | ~2 cr | MEDIUM | Écrit dans table cible |
| **Dry-run ingestion** | Simule sans écrire — retourne le plan d'exécution et volumétrie estimée | Panel Actions: card résultat dry-run (rows estimées, coût estimé) | POST /explore-design/{id}/execute-ingestion?dry_run=true | ~0.1 cr | NONE | Lecture seule |
| **Configurer schedule** | Définit un cron Snowflake Task pour l'ingestion | Modal: cron expression + warehouse + alert email | POST /explore-design/{id}/schedule-ingestion | ~0 cr | LOW | Crée TASK Snowflake |
| **Exclure colonnes** | Marque des colonnes à ignorer lors de l'ingestion | Panel config: toggle par colonne | PUT /explore-design/{id}/tables/{t}/excluded-cols | ~0 cr | LOW | Réduit surface PII |
| **Configurer watermark** | Définit la colonne de timestamp incrémental et la valeur initiale | Panel config: select col timestamp + datetime picker | PUT /explore-design/{id}/tables/{t}/watermark | ~0 cr | LOW | Active mode INCREMENTAL |

#### Action GROUP: Gouvernance & Policies

| Action | Ce que ça fait | Rendu voulu | Endpoint | Coût | Risque | Impact lignée |
|--------|---------------|-------------|----------|------|--------|---------------|
| **Assigner masking policy** | Applique une Snowflake Masking Policy sur une colonne | Panel Gouvernance: dropdown policies disponibles → badge MASKED sur colonne | POST /governance/policies/masking/apply | ~0 cr | MEDIUM | Bloque accès raw aux non-admin |
| **Créer RLS policy** | `CREATE ROW ACCESS POLICY ... USING (current_role() IN (...))` | Modal: choose axis (region/dept/role) → segments → preview SQL | POST /governance/policies/rls | ~0 cr | HIGH | Filtre toutes les requêtes sur la table |
| **Voir classification** | Affiche les tags Snowflake (PII, SENSITIVE, CONFIDENTIAL) sur chaque colonne | Panel Gouvernance: liste colonnes + tags + policies appliquées | GET /governance/tags/table/{db}/{schema}/{table} | ~0 cr | NONE | Lecture seule |
| **Appliquer tag** | `ALTER TABLE ... MODIFY COLUMN ... SET TAG tag_name = 'value'` | Badge tag coloré sur colonne dans vue catalog | POST /governance/tags/apply | ~0 cr | LOW | Gov rate ↑ |
| **Voir access history** | Qui a lu cette table sur les 30 derniers jours | Panel Ownership: liste user + count + dernière date | GET /governance/access-history/{db}/{schema}/{table} | ~0.1 cr | NONE | Lecture seule |

#### Action GROUP: Déploiement DDL

| Action | Ce que ça fait | Rendu voulu | Endpoint | Coût | Risque | Impact lignée |
|--------|---------------|-------------|----------|------|--------|---------------|
| **Générer DDL** | Produit le `CREATE TABLE / ALTER TABLE` SQL depuis le modèle | Panel SQL: code highlight avec diff vs version précédente | POST /explore-design/{id}/generate-ddl | ~0 cr | NONE | Lecture seule |
| **Vérifier conflits** | Détecte breaking changes (suppression colonne, changement type incompatible) | Panel Actions: liste conflits avec sévérité HIGH/MEDIUM/LOW | POST /explore-design/{id}/check-conflicts | ~0.5 cr | NONE | Analyse seule |
| **Soumettre pour approbation** | Crée un record DEPLOYMENT en statut PENDING — notifie les approbateurs | Toast "Déploiement soumis" + badge PENDING dans History | POST /explore-design/{id}/deployments | ~0 cr | LOW | En attente d'action humaine |
| **Approuver déploiement** | Passe le deployment de PENDING → APPROVED | Badge APPROVED + bouton Execute visible | POST /projects/{id}/deployments/{d}/approve | ~0 cr | LOW | Autorise exécution DDL |
| **Exécuter déploiement** | Lance le DDL en Snowflake — toutes les tables du projet | Progress bar par table + logs inline | POST /projects/{id}/deployments/{d}/execute | ~1 cr | HIGH | Modifie schéma Snowflake |
| **Rollback** | Zero-copy clone vers la version précédente | Confirm dialog → Snowflake CLONE + SWAP | POST /explore-design/{id}/rollback | ~2 cr | HIGH | Annule les DDL depuis v_prev |

---

### MODE MODELING — Canvas ReactFlow

| Action | Ce que ça fait | Rendu voulu | Endpoint/Op | Impact lignée |
|--------|---------------|-------------|-------------|---------------|
| **Drag table** | Ajoute un nœud table sur le canvas | Nœud card: nom, type, nb colonnes, owner badge | local state | Visualisation seule |
| **Créer FK** | `ALTER TABLE ... ADD FOREIGN KEY ... REFERENCES ...` | Flèche directionnelle entre nœuds + modal type FK (DEFERRABLE, ENFORCED) | POST /explore-design/{id}/relationships | Crée contrainte Snowflake |
| **Définir PK** | `ALTER TABLE ... ADD PRIMARY KEY (col)` | Icône clé 🔑 sur la colonne dans le nœud | POST /explore-design/{id}/primary-key | Crée contrainte |
| **Visualiser mind map** | Graph source→target de toutes les FKs du projet | SourceMindMap overlay sur le canvas | GET /explore-design/{id}/relationships | Lecture seule |
| **Détecter relations auto** | `discoverRelationships()` — Cortex analyse noms colonnes et propose FK | Panel AI: liste relations suggérées avec score confiance | POST /explore-design/{id}/discover-relationships | Lecture seule |
| **Exporter schéma** | DDL complet du projet sous forme de fichier .sql | Download .sql file | POST /explore-design/{id}/generate-ddl | Aucun |
| **Créer table** | `CREATE TABLE ...` avec 6 types: standard/transient/external/iceberg/hybrid/dynamic | Modal CreateTableModal → nœud ajouté au canvas | POST /explore-design/{id}/ddl-actions | Crée objet Snowflake |

---

## SmartRightBar dans Explore & Design

Le `ContextRightBar` existant doit être **migré vers SmartRightBar** (voir `smart-rightbar-spec.md`).

### Table sélectionnée — rendu SmartRightBar

```
┌─ ORDERS_FACT ────────────────────────────────────────────┐
│  S1: CONTEXT                                              │
│  Type: TABLE  ·  Schema: SALES.DWH                        │
│  Rows: 42.3M  ·  Size: 2.1 GB  ·  Cluster: ON(ORDER_DATE)│
│  Owner: SYSADMIN  ·  Tags: [PRODUCT] [CERTIFIED]         │
│                                                            │
│  S2: ACTIONS (Data Engineer)                              │
│  [▶ Ingérer maintenant]  ⚡ ~2.3 cr  📊 +1,240 rows      │
│    → lance POST /explore-design/{id}/execute-ingestion    │
│    → panel se met à jour avec spinner + résultat          │
│  [🔄 Dry-run]  ⚡ ~0.1 cr  (aucun write)                 │
│  [📅 Schedule]  ⚡ ~0 cr                                  │
│  [📦 Créer Dynamic Table]  ⚡ ~5 cr/h  HIGH ⚠            │
│  [🌊 Créer Stream (CDC)]  ⚡ ~0 cr                        │
│                                                            │
│  S3: GOUVERNANCE  Gov Rate: 62%                            │
│  🔴 PII non masqué: EMAIL, PHONE → [Appliquer masking]   │
│  🟡 Sensible: SALARY → RLS: région 3 segments            │
│  [🤖 Auto-classifier]  [🔒 Créer RLS]                    │
│                                                            │
│  S4: LIGNÉE                                                │
│  ⬆ UPSTREAM: ORDERS_RAW (stream), CUSTOMERS (join)        │
│  ⬇ DOWNSTREAM: ORDERS_AGG (DT), RPT_MONTHLY (view)       │
│  ⚠ 4 objets impactés si DDL modifié                      │
│  [📢 Notifier consommateurs]  [🔍 Voir graphe]           │
│                                                            │
│  S5: INGESTION  Mode: INCREMENTAL · watermark: UPD_AT    │
│  Dernière: ✅ 06/06 23:45 · 1,240 rows · 12s             │
│  Prochaine: 07/06 00:00 (cron: 0 * * * *)                │
│  Tags: [🏷 SOURCE] [🏷 PIPELINE:ORDERS]                  │
│                                                            │
│  S6: OWNERSHIP                                             │
│  Classification: ◉ INTERMÉDIAIRE                          │
│  Owner: data-eng@company.com  ·  Team: DataEng           │
│  Consommateurs (30j): 12 humains · 3 apps                │
│  [Promouvoir en PRODUIT]  [Contacter owner]               │
│                                                            │
│  S7: ALICE TIPS                                            │
│  ✨ 3 colonnes PII sans masking → -8% gov rate           │
│  ⚡ Coût ingestion 2.1 GB/run — clustering ORDER_DATE    │
│  🔗 4 downstream — notifier avant DDL                    │
│                                                            │
│  S8: HISTORIQUE                                            │
│  ✅ INGESTION_SUCCESS · 06/06 23:45 · 42.3K rows         │
│  ⚙  CONFIG_CHANGED · 06/06 · watermark=UPD_AT            │
│  🏷  TAG_APPLIED · 06/05 · PII:EMAIL                     │
└───────────────────────────────────────────────────────────┘
```

---

## Henry Tasks — explore-design (enrichi)

### P1 — Bloquant

- [ ] Migrer `ContextRightBar` vers `SmartRightBar` de `smart-rightbar-spec.md`
      Fichier: `apps/data360/src/app/(dashboard)/explore-design/page.tsx`
      Remplacer import ContextRightBar → SmartRightBar (S1+S2+S3+S8 minimum)
- [ ] Ajouter annotations coût/risque/lignée sur chaque InsightActionButton dans S2
      Source coût: `API.catalog.tableIngestion(db, schema, table)` → avg_cost_credits
      Source lignée: `API.catalog.tableLineage(db, schema, table)` → downstream_count
- [ ] Ajouter entrées `catalog.*` dans `src/lib/api-contracts.ts` (voir smart-rightbar-spec.md §API)
- [ ] Créer `src/app/services/explore-design/rightbar.ts`
      Fonctions: getTableContext, getTableGovernance, getTableLineage, getTableIngestion, getTableOwnership

### P2 — Important

- [ ] SectionGovernance: gov rate % calculé + liste PII + CTAs masking/RLS
      Snowflake queries: voir smart-rightbar-spec.md §S3
- [ ] SectionLineage: upstream/downstream tree via OBJECT_DEPENDENCIES
      Snowflake: voir smart-rightbar-spec.md §S4
- [ ] SectionIngestion: mode/schedule/last-run/tags — voir §S5
- [ ] Deployment SSE: useCacheInvalidation(CACHE_KEYS.DEPLOYMENTS) → status live
- [ ] Dynamic tables: live refresh lag via SSE dans SectionContext

### P3 — Enhancement

- [ ] SectionOwnership: source→product classifier + consumers access history
- [ ] Templates: ajouter templates sectoriels (retail, finance, healthcare)
- [ ] Version diff: côte-à-côte V_N-1 vs V_N dans un drawer (pas modale)
- [ ] Split page.tsx (5145 lignes): extraire CatalogSection, ModelingSection, DeploymentSection
      Contrainte: extraire en composants SANS réécrire la logique — props passthrough

## Screenshots
```
e2e/results/screenshots/explore-design.png
```

## Module Run — explore-design — 2026-06-07

### Global KPIs
| KPI | Value |
|-----|-------|
| endpoints_audited | 15 |
| api_contracts_gaps_fixed | 6 |
| fake_zero_fixes | 0 |
| raw_fetch_fixes | 0 |
| conventions_compliant | yes |

### Step States
| Step | State | Notes |
|------|-------|-------|
| Read source | ✅ | grep + targeted read of api-contracts.ts, services/explore-design/, services/api/exploreDesignApi.ts |
| api-contracts gaps | ✅ | 6 entries added to API.exploreDesign |
| Fake-zero fixes | ⏭ skipped | All `?? 0` hits are either arithmetic intermediates, comparison guards, or `.toFixed()` calls — replacing with `'—'` would cause TS build failures or NaN. 0 is a valid measured value in all display cases (profile stats). |
| Raw fetch fixes | ⏭ skipped | No raw fetch()/axios calls found — only React Query `refetch()` hits in ProjectSelector.tsx, which is correct usage. |
| Log written | ✅ | appended |

### Fixes Applied
- `api-contracts.ts` — added `API.exploreDesign.impactAnalysis(projectId)` → `POST /explore-design/{id}/impact-analysis`
- `api-contracts.ts` — added `API.exploreDesign.impactAnalysisEnhanced(projectId)` → `POST /explore-design/{id}/impact-analysis/enhanced`
- `api-contracts.ts` — added `API.exploreDesign.conflictCheck(projectId)` → `POST /explore-design/{id}/conflict-check` (corrected from task prose `/conflicts` — real path verified in `exploreDesignApi.ts:789`)
- `api-contracts.ts` — added `API.exploreDesign.postVerify(projectId)` → `POST /explore-design/{id}/post-verify`
- `api-contracts.ts` — added `API.exploreDesign.ingestionOperations(projectId)` → `GET /explore-design/{id}/ingestion/operations`
- `api-contracts.ts` — added `API.exploreDesign.schemaCloneList()` → `GET /explore-design/schema-clone/list` (project_id as query param, not path param — matches existing call site in `services/explore-design/index.ts:2052`)

### Remaining Gaps (backend-only, needs go)
- `columnLineage` — `GET /explore-design/{id}/lineage/column` has no call sites in the FE; skip until UI is wired
- Pre-existing TS build error in `apps/data360/src/app/services/catalog/index.ts:491` (`CATALOG` constant undefined) — out of scope for explore-design audit, pre-dates this session

## Alice Run — explore-design — 2026-06-07 (full-suite KPI sweep)

> Method: dev OFFLINE → existence vs backend route manifest (823 entries). No fabricated statuses.
> Scope domains: exploreDesign (28), exploreDesignV1 (4), metadata (1).

### Global KPIs

| KPI | Valeur |
|-----|--------|
| endpoints_testés (contract paths) | 33 |
| endpoints_ok (registered) | 32 |
| endpoints_404 | 1 |
| endpoints_500 | 0 |
| endpoints_non_vérifiés (offline) | 32 |
| segments_ux_audités | dynamic-tables, streams, tasks, alerts, glossary, ddl-events |
| henry_tasks_p1 | 1 |
| henry_tasks_p2 | 0 |
| henry_tasks_p3 | 0 |
| backend_bonnes_pratiques_gaps | 0 majeurs |

### État par étape

| Étape | État | KPIs étape |
|-------|------|------------|
| 1. Dev + API | ⚠ | dev=OFFLINE, api=UP |
| 2. Token | ❌ | absent |
| 4c. Audit | ✅ | gaps_p1=1 |
| 6. Henry tasks | ✅ | P1=1 |
| 7. Écriture | ✅ | section ajoutée |

### Henry Tasks — explore-design (backend delegation)

#### P1
- [ ] Enregistrer `POST /metadata/init_metadata` — contrat FE `API.metadata.init()` existe, route absente. (Bootstrap des tables de métadonnées du module.)
      Fichier: `backend/app/modules/projects/explore_design/router.py` ou un router metadata dédié + mount.
