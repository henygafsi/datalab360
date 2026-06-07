---
name: smart-rightbar-spec
description: >
  Spécification universelle du SmartRightBar Data360 : 8 sections contextuelles
  qui s'adaptent au tab/page courant. Extension de l'ContextRightBar d'explore-design.
  Couvre : Actions CTAs par rôle, Coût/Perf, Lignée, Gouvernance/PII/RLS, Ingestion,
  Tags/Ownership, Alice Tips, Historique. Source unique de vérité pour Henry.
---

# SmartRightBar — Spécification Data360

## Philosophie

Le SmartRightBar est la **colonne vertébrale UX de Data360** : un panel droit permanent
qui narre l'histoire de la donnée sélectionnée — depuis son origine (source) jusqu'à ses
consommateurs (dashboards, humains, apps) — et propose toutes les actions possibles au
bon rôle, annotées de leur coût, risque, et impact sur la gouvernance.

> Règle absolue : le panel EST toujours visible. Son contenu évolue selon l'item sélectionné.
> Rien ne disparaît derrière des boutons ou modales. Zéro popup pour contenu consultatif.

---

## Layout universel (14:6 ou 13:7 selon le module)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TOP BAR  [FilterChips ou tabs URL] + [Project selector] + [Run status]     │
├──────────────────────────────────────────────┬──────────────────────────────┤
│                                              │  SMART RIGHT BAR  w-[420px]  │
│   MAIN CONTENT  (~70% flex-1)                │                              │
│                                              │  ┌──────────────────────┐   │
│   Table / Canvas / Form / Chart              │  │  S1: CONTEXT         │   │
│   (click row → update SmartRightBar)         │  │  Détails item live   │   │
│                                              │  ├──────────────────────┤   │
│   FilterChips (≤4 segments)                  │  │  S2: ACTIONS         │   │
│   [Segment A] [Segment B] [Segment C]        │  │  CTAs par rôle       │   │
│                                              │  │  Annotés coût/perf   │   │
│                                              │  ├──────────────────────┤   │
│                                              │  │  S3: GOUVERNANCE     │   │
│                                              │  │  Gov rate, PII, RLS  │   │
│                                              │  ├──────────────────────┤   │
│                                              │  │  S4: LIGNÉE          │   │
│                                              │  │  Upstream/downstream │   │
│                                              │  ├──────────────────────┤   │
│                                              │  │  S5: INGESTION       │   │
│                                              │  │  Mode, schedule, tags│   │
│                                              │  ├──────────────────────┤   │
│                                              │  │  S6: OWNERSHIP       │   │
│                                              │  │  Source→Product step │   │
│                                              │  │  Consumers, viewers  │   │
│                                              │  ├──────────────────────┤   │
│                                              │  │  S7: ALICE TIPS      │   │
│                                              │  │  Cortex suggestions  │   │
│                                              │  ├──────────────────────┤   │
│                                              │  │  S8: HISTORIQUE      │   │
│                                              │  │  5 derniers events   │   │
│                                              │  └──────────────────────┘   │
└──────────────────────────────────────────────┴──────────────────────────────┘
```

---

## Section 1 — CONTEXT (Détails live)

**Quand** : dès qu'un item est sélectionné (table, pipeline, user, policy…)
**Source** : Snowflake INFORMATION_SCHEMA + ACCOUNT_USAGE, via service `rightbar.ts`
**Rendu voulu** :

```
┌─ CONTEXT ────────────────────────────────────────────┐
│  📦 ORDERS_FACT                                        │
│  Type: TABLE  ·  Schema: SALES.DWH                    │
│  Rows: 42.3M  ·  Size: 2.1 GB  ·  Cluster: ON        │
│  Created: 2025-03-14  ·  Last altered: 2026-05-30     │
│  Owner: SYSADMIN  ·  DB: CP_DATA360                   │
│                                                        │
│  [Source] [Product] [Sensitive] [Certified]            │
│   badges classification du contexte                    │
└────────────────────────────────────────────────────────┘
```

**Snowflake queries** :
```sql
-- Tables / objects
SELECT table_name, table_type, row_count, bytes, clustering_key,
       created, last_altered, table_owner
FROM information_schema.tables
WHERE table_name = %s AND table_schema = %s;

-- Classification tags appliquées
SELECT tag_name, tag_value, column_name
FROM snowflake.account_usage.tag_references
WHERE object_name = %s AND domain = 'TABLE'
  AND tag_database = 'SNOWFLAKE'
ORDER BY tag_name;
```

**API contract** :
```typescript
API.catalog.tableContext(db, schema, table)
// GET /catalog/tables/{db}/{schema}/{table}/context
// Returns: { name, type, row_count, size_gb, cluster_key, owner, tags: Tag[] }
```

---

## Section 2 — ACTIONS (CTAs annotés)

**Principe** : chaque CTA est un `InsightActionButton` avec 3 annotations visibles :

```
┌─ ACTIONS (Data Engineer) ────────────────────────────────┐
│                                                            │
│  [▶ Ingérer maintenant]  ⚡ ~2.3 cr  📊 +42M rows        │
│   POST /explore-design/{id}/execute-ingestion             │
│   Risque: LOW  ·  Impact lignée: 3 tables aval            │
│                                                            │
│  [⚙ Configurer schedule]  ⚡ ~0 cr  📅 cron             │
│   POST /explore-design/{id}/schedule-ingestion            │
│   Risque: NONE  ·  Impact lignée: aucun                   │
│                                                            │
│  [🏷 Appliquer tags PII]  ⚡ ~0.1 cr  🔒 Gov +12%        │
│   POST /governance/tags/apply                              │
│   Risque: MEDIUM  ·  Impact lignée: masking requis aval   │
│                                                            │
│  [📦 Créer Dynamic Table]  ⚡ ~5 cr/h  ⏱ lag ~1min      │
│   POST /explore-design/dynamic-tables                      │
│   Risque: HIGH  ·  Impact lignée: stream dépendant         │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

**Annotations par action** :

| Annotation | Source Snowflake | Rendu |
|------------|-----------------|-------|
| `⚡ ~N cr` | METERING_HISTORY JOIN QUERY_HISTORY | Badge crédit estimé |
| `📊 +N rows` | COPY_HISTORY ou QUERY_HISTORY rows_produced | Badge volume |
| `Risque perf` | avg_query_elapsed_time / p95 | Badge LOW/MEDIUM/HIGH |
| `Impact lignée` | OBJECT_DEPENDENCIES count aval | "N tables aval" |
| `Gov +X%` | policies appliquées / colonnes total | % gouvernance delta |

**Code template CTA annoté** :
```tsx
<InsightActionButton
  label="Ingérer maintenant"
  icon={<Play className="h-3.5 w-3.5" />}
  onAction={() => gate.run(() => executeIngestion(projectId, tableId))}
  capable={canPerform('explore_design', 'ingest')}
  annotations={{
    cost: estimatedCredits,    // e.g. 2.3
    risk: 'LOW',               // 'LOW' | 'MEDIUM' | 'HIGH'
    lineageImpact: 3,          // count of downstream tables
    govDelta: '+12%',          // governance rate delta
  }}
/>
```

---

## Section 3 — GOUVERNANCE (Gov rate + PII/RLS)

**Quand** : table ou colonne sélectionnée avec policies Snowflake
**Sources** :
- `INFORMATION_SCHEMA.POLICY_REFERENCES` — masking/RLS policies appliquées
- `SNOWFLAKE.ACCOUNT_USAGE.TAG_REFERENCES` — tags PII/sensitive
- `SNOWFLAKE.ACCOUNT_USAGE.ACCESS_HISTORY` — qui a accédé (RLS vérification)

**Rendu voulu** :

```
┌─ GOUVERNANCE ────────────────────────────────────────────┐
│  Gov Rate: ██████░░░░ 62%  [Améliorer →]                  │
│                                                            │
│  🔴 PII Détecté (3 colonnes)                              │
│   EMAIL → tag: PII:EMAIL  ·  masking: PARTIEL ⚠           │
│   PHONE_NUMBER → tag: PII:PHONE  ·  masking: NONE 🔴      │
│   SSN → tag: PII:SSN  ·  masking: OK ✅                    │
│                                                            │
│  🟡 Données Sensibles (1 colonne)                          │
│   SALARY → tag: CONFIDENTIAL  ·  RLS: par région          │
│                                                            │
│  🔒 Politiques RLS actives                                 │
│   • ROW_ACCESS: région EU/US/APAC (3 segments)            │
│   • NETWORK: IP_RANGE_PROD                                 │
│                                                            │
│  [🏷 Appliquer masking EMAIL]  ⚡ ~0.1 cr  🔒 +8%        │
│  [🔒 Créer politique RLS]  ⚡ ~0 cr  🔒 +15%             │
│  [🤖 Auto-classifier colonnes]  ⚡ ~2 cr  🔒 +25%        │
└────────────────────────────────────────────────────────────┘
```

**Snowflake queries** :
```sql
-- PII / tags
SELECT column_name, tag_name, tag_value
FROM snowflake.account_usage.tag_references
WHERE object_name = %s AND domain = 'COLUMN'
  AND tag_name ILIKE 'PII%' OR tag_name ILIKE 'SENSITIVE%'
  OR tag_name ILIKE 'CONFIDENTIAL%';

-- Masking policies appliquées
SELECT column_name, policy_name, policy_kind
FROM information_schema.policy_references
WHERE ref_entity_name = %s AND ref_entity_domain = 'TABLE'
  AND policy_kind IN ('MASKING_POLICY', 'ROW_ACCESS_POLICY');

-- RLS axe de détection (region, dept, role)
SELECT p.policy_name, p.policy_body
FROM snowflake.account_usage.access_policies p
WHERE p.policy_name ILIKE '%ROW_ACCESS%';

-- Gov rate = (colonnes avec masking ou classification) / total colonnes
SELECT
  COUNT(*) AS total_cols,
  COUNT(CASE WHEN policy_name IS NOT NULL THEN 1 END) AS governed_cols
FROM information_schema.columns c
LEFT JOIN information_schema.policy_references pr
  ON c.table_name = pr.ref_entity_name AND c.column_name = pr.ref_column_name
WHERE c.table_name = %s;
```

**API contract** :
```typescript
API.catalog.tableGovernance(db, schema, table)
// GET /catalog/tables/{db}/{schema}/{table}/governance
// Returns: { gov_rate, pii_columns: PiiColumn[], rls_policies: RlsPolicy[], sensitive_columns: Col[] }

API.gouvernance.applyTag(table, column, tag)
// POST /gouvernance/tags/apply → { table, column, tag_name, tag_value }

API.gouvernance.createRls(table, axis, segments)
// POST /gouvernance/policies/rls → { table, axis: 'region'|'dept'|'role', segments: string[] }
```

**Axes RLS détectables** :
| Axe | Snowflake | Description |
|-----|-----------|-------------|
| `region` | `CURRENT_REGION()` | Segmentation géographique (EU, US, APAC) |
| `role` | `CURRENT_ROLE()` | Par rôle Snowflake |
| `dept` | tag `DEPT` sur la row | Par département (HR, Finance, Ops) |
| `user` | `CURRENT_USER()` | Par utilisateur (accès personnel) |
| `ip_range` | Network policy | Restriction IP réseau |

---

## Section 4 — LIGNÉE (Lineage & Impact)

**Quand** : avant toute action mutante (CREATE, ALTER, DROP, DEPLOY)
**Source** : `SNOWFLAKE.ACCOUNT_USAGE.OBJECT_DEPENDENCIES` (Snowflake lineage native)

**Rendu voulu** :

```
┌─ LIGNÉE & IMPACT ────────────────────────────────────────┐
│  📍 ORDERS_FACT                                            │
│                                                            │
│  ⬆ UPSTREAM (dépend de)                                   │
│   • ORDERS_RAW (table) → via stream ORDERS_STR             │
│   • CUSTOMERS (table) → JOIN condition                     │
│                                                            │
│  ⬇ DOWNSTREAM (consommateurs)                             │
│   • ORDERS_AGG (dynamic table) → refresh lag 2min         │
│   • RPT_MONTHLY_ORDERS (view) → BI dashboard              │
│   • ORDERS_MART (data product) → 3 abonnés               │
│                                                            │
│  ⚠ Impact si modification                                  │
│   • 4 objets affectés  ·  2 pipelines à notifier          │
│   • Risque: HIGH (DDL breaking change)                     │
│                                                            │
│  [📢 Notifier consommateurs]   [🔍 Voir graphe complet]   │
└────────────────────────────────────────────────────────────┘
```

**Snowflake query** :
```sql
-- Objets qui dépendent de cette table (aval)
SELECT
  referenced_object_name   AS source_name,
  referencing_object_name  AS target_name,
  referencing_object_type  AS target_type,
  referencing_object_domain AS target_domain
FROM snowflake.account_usage.object_dependencies
WHERE referenced_object_name = %s
  AND referenced_object_domain = 'Table'
ORDER BY referencing_object_type;

-- Objets dont dépend cette table (amont)
SELECT
  referenced_object_name AS dependency_name,
  referenced_object_type AS dependency_type
FROM snowflake.account_usage.object_dependencies
WHERE referencing_object_name = %s
  AND referencing_object_domain = 'Table';
```

**API contract** :
```typescript
API.catalog.tableLineage(db, schema, table)
// GET /catalog/tables/{db}/{schema}/{table}/lineage
// Returns: { upstream: LineageNode[], downstream: LineageNode[], impact_count, risk_level }

API.catalog.notifyConsumers(table, message)
// POST /catalog/tables/notify-consumers
```

---

## Section 5 — INGESTION (Mode + Schedule + Tags flux)

**Quand** : table/stream/pipe sélectionné
**Source** : `COPY_HISTORY`, `TASK_HISTORY`, `PIPE_USAGE_HISTORY`, `DYNAMIC_TABLE_REFRESH_HISTORY`

**Rendu voulu** :

```
┌─ INGESTION ──────────────────────────────────────────────┐
│  Mode: INCREMENTAL (Snowpipe)                             │
│  Dernière: 2026-06-06 23:45  ✅ 42,310 rows / 12.3s      │
│  Prochaine: 2026-06-07 00:00 (cron: 0 * * * *)           │
│  Taille moyenne: 2.1 GB/run  ·  Coût moyen: 0.8 cr/run  │
│                                                            │
│  ─ Flux source → produit ─                                │
│  [Source: S3 bucket] → [Stage: INT_ORDERS] → [Table: ✅]  │
│  Étape 2/4 du pipeline ORDERS_PIPELINE                    │
│                                                            │
│  Tags flux proposés:                                       │
│  [🏷 SOURCE] [🏷 STAGE_02] [🏷 PIPELINE:ORDERS]           │
│  [Appliquer tags] ·  [Voir pipeline complet]              │
│                                                            │
│  [▶ Ingérer maintenant]  [⚙ Modifier schedule]            │
│  [⏸ Suspendre]  [📄 Voir logs]                            │
└────────────────────────────────────────────────────────────┘
```

**Snowflake queries** :
```sql
-- Dernières exécutions Snowpipe / COPY
SELECT status, last_load_time, row_count, file_size,
       error_count, error_message
FROM snowflake.account_usage.copy_history
WHERE table_name = %s
  AND last_load_time >= DATEADD(day, -7, CURRENT_TIMESTAMP())
ORDER BY last_load_time DESC
LIMIT 10;

-- Tâches liées
SELECT name, state, schedule, definition, last_committed_on,
       last_suspended_on
FROM information_schema.tasks
WHERE definition ILIKE %s  -- contains table name
ORDER BY last_committed_on DESC;

-- Dynamic table refresh history
SELECT name, refresh_start_time, refresh_end_time, refresh_trigger,
       data_timestamp, num_rows_inserted
FROM snowflake.account_usage.dynamic_table_refresh_history
WHERE name = %s
ORDER BY refresh_start_time DESC
LIMIT 10;
```

**API contract** :
```typescript
API.catalog.tableIngestion(db, schema, table)
// GET /catalog/tables/{db}/{schema}/{table}/ingestion
// Returns: { mode, last_run, next_run, avg_cost_credits, avg_rows, pipeline_step, pipeline_name }

API.catalog.applyFlowTags(table, tags)
// POST /catalog/tags/flow → { table, tags: string[] }
```

---

## Section 6 — OWNERSHIP (Source→Product + Consumers)

**Quand** : toujours visible, données enrichissables
**Source** : tags Snowflake custom + `ACCESS_HISTORY` + Data Products API

**Rendu voulu** :

```
┌─ OWNERSHIP & CONSOMMATEURS ──────────────────────────────┐
│  Classification: [SOURCE] → [INTERMÉDIAIRE] → [PRODUIT]  │
│  ◉ INTERMÉDIAIRE  (étape 2 du pipeline ORDERS)           │
│  [Changer en SOURCE]  [Promouvoir en PRODUIT]             │
│                                                            │
│  Propriétaire: data-engineering@company.com               │
│  Équipe: Data Engineering · Snowflake role: SYSADMIN      │
│                                                            │
│  Consommateurs (30j):                                      │
│  👤 Humains (12 users)                                     │
│   • analyst_team (8 users) → via RPT_MONTHLY              │
│   • finance_team (4 users) → via ORDERS_MART              │
│  🖥 Apps (3 apps)                                           │
│   • Tableau Cloud → dashboard ORDERS_OVERVIEW              │
│   • dbt Cloud → model orders_monthly                      │
│   • Streamlit → app ORDER_TRACKER                         │
│                                                            │
│  [✉ Contacter propriétaire]  [📋 Voir SLA produit]        │
│  [🔍 Analyser consommateurs]                              │
└────────────────────────────────────────────────────────────┘
```

**Snowflake query** :
```sql
-- Qui a accédé à cette table (consumers)
SELECT user_name, query_type, COUNT(*) AS access_count,
       MAX(query_start_time) AS last_access
FROM snowflake.account_usage.access_history,
     LATERAL FLATTEN(base_objects_accessed) f
WHERE f.value:objectName::string = %s
  AND query_start_time >= DATEADD(day, -30, CURRENT_TIMESTAMP())
GROUP BY user_name, query_type
ORDER BY access_count DESC
LIMIT 20;

-- Tags ownership/classification
SELECT tag_name, tag_value
FROM snowflake.account_usage.tag_references
WHERE object_name = %s
  AND tag_name IN ('OWNER_EMAIL', 'OWNER_TEAM', 'DATA_CLASS',
                   'PIPELINE_STEP', 'PIPELINE_NAME', 'DATA_PRODUCT_ID');
```

**Classification Source→Product** :
| Valeur tag | Signification | Badge couleur |
|------------|---------------|---------------|
| `SOURCE` | Données brutes ingérées | Bleu |
| `INTERMEDIATE` | Transformé, pas exposé | Gris |
| `PRODUCT` | Data product certifié exposé | Vert |
| `DERIVED` | Vue ou DT calculée | Orange |
| `SHARED` | Partagé via Data Sharing | Violet |

---

## Section 7 — ALICE TIPS (Narration IA)

**Quand** : item sélectionné, après que les données S1-S6 sont chargées
**Source** : `POST /cortex/complete` — prompt contextuel construit depuis S1-S6

**Rendu voulu** :

```
┌─ ALICE TIPS ─────────────────────────────────────────────┐
│  🤖 Alice analyse ORDERS_FACT...                          │
│                                                            │
│  ✨ Gov rate 62% — 3 colonnes PII sans masking complet.   │
│  Je recommande d'appliquer SHA256 sur EMAIL et PHONE.     │
│                                                            │
│  ⚡ Coût ingestion élevé (2.1 GB/run). Envisager          │
│  clustering sur ORDER_DATE pour réduire le scan.          │
│                                                            │
│  🔗 3 tables downstream pourraient être affectées par     │
│  le prochain déploiement DDL. Notifier les équipes.       │
│                                                            │
│  [📋 Appliquer toutes les recommandations Alice]          │
└────────────────────────────────────────────────────────────┘
```

**Prompt Cortex template** :
```typescript
const alicePrompt = `
Tu es Alice, architecte data senior de Data360. Analyse cet objet Snowflake
et donne 2-3 recommandations courtes et actionnables.

Contexte:
- Table: ${context.name} (${context.type}, ${context.row_count}M rows)
- Gov rate: ${context.gov_rate}%
- PII non masquées: ${context.unmasked_pii.join(', ')}
- Coût moyen ingestion: ${context.avg_cost_credits} credits/run
- Downstream: ${context.downstream_count} objets dépendants
- Dernière modification: ${context.last_altered}

Format: 2-3 recommandations max, chacune avec un emoji indicatif.
Sois concis et direct. Français uniquement.
`;
```

---

## Section 8 — HISTORIQUE (EVENT_STORE)

**Quand** : toujours visible en bas du panel
**Source** : `CP_DATA360.EVENT_STORE.*` + `GET /api/data360/events`

**Rendu voulu** :

```
┌─ HISTORIQUE (5 derniers) ────────────────────────────────┐
│  ✅ INGESTION_SUCCESS · 06/06 23:45 · 42.3K rows          │
│  ⚙  CONFIG_CHANGED · 06/06 15:20 · by user_alice         │
│  🏷  TAG_APPLIED · 06/05 10:11 · PII:EMAIL sur EMAIL col  │
│  ⚠  SCHEMA_DRIFT · 06/04 08:30 · colonne ajoutée         │
│  🚀 DEPLOYED · 06/01 14:00 · version v3 → v4             │
└────────────────────────────────────────────────────────────┘
```

---

## Implementation — SmartRightBar component

**Fichier à créer** : `apps/data360/src/components/ui/SmartRightBar.tsx`

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useCanPerform } from '@/hooks/useCanPerform';
import { InsightActionButton } from '@/app/shared/insights/InsightActionButton';

// Lazy sections — chargées selon l'item sélectionné
const SectionContext = lazy(() => import('./rightbar/SectionContext'));
const SectionActions = lazy(() => import('./rightbar/SectionActions'));
const SectionGovernance = lazy(() => import('./rightbar/SectionGovernance'));
const SectionLineage = lazy(() => import('./rightbar/SectionLineage'));
const SectionIngestion = lazy(() => import('./rightbar/SectionIngestion'));
const SectionOwnership = lazy(() => import('./rightbar/SectionOwnership'));
const SectionAliceTips = lazy(() => import('./rightbar/SectionAliceTips'));
const SectionHistory = lazy(() => import('./rightbar/SectionHistory'));

export interface SmartRightBarItem {
  db?: string;
  schema?: string;
  name: string;
  type: 'table' | 'pipeline' | 'policy' | 'user' | 'workflow' | 'etl_block';
  module: string;  // 'explore_design' | 'workflow' | 'governance' | ...
}

interface Props {
  item: SmartRightBarItem | null;
  module: string;
  onAction?: () => void;
}

export function SmartRightBar({ item, module, onAction }: Props) {
  const { role } = useAuth();
  const [openSections, setOpenSections] = useState<Set<string>>(
    new Set(['context', 'actions', 'governance'])
  );

  if (!item) {
    return (
      <aside className="w-[420px] shrink-0 border-l border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex items-center justify-center">
        <div className="text-center text-slate-400 px-6">
          <p className="text-sm">Sélectionnez un élément</p>
          <p className="text-xs mt-1">pour voir ses détails, actions et gouvernance</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="w-[420px] shrink-0 border-l border-slate-200 dark:border-slate-700 overflow-y-auto bg-white dark:bg-slate-900">
      <Suspense fallback={<RightBarSkeleton />}>
        <SectionContext item={item} />
        <Divider />
        <SectionActions item={item} module={module} role={role} onAction={onAction} />
        <Divider />
        <SectionGovernance item={item} />
        <Divider />
        <SectionLineage item={item} />
        <Divider />
        <SectionIngestion item={item} />
        <Divider />
        <SectionOwnership item={item} />
        <Divider />
        <SectionAliceTips item={item} />
        <Divider />
        <SectionHistory item={item} module={module} />
      </Suspense>
    </aside>
  );
}
```

---

## Services API — frontend rightbar.ts par module

Chaque module doit créer/étendre `apps/data360/src/app/services/<module>/rightbar.ts` :

```typescript
// Pattern commun — rightbar.ts
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';

export async function getTableContext(db: string, schema: string, table: string) {
  const { data } = await apiClient.get(API.catalog.tableContext(db, schema, table));
  return data;
}

export async function getTableGovernance(db: string, schema: string, table: string) {
  const { data } = await apiClient.get(API.catalog.tableGovernance(db, schema, table));
  return data;
}

export async function getTableLineage(db: string, schema: string, table: string) {
  const { data } = await apiClient.get(API.catalog.tableLineage(db, schema, table));
  return data;
}

export async function getTableIngestion(db: string, schema: string, table: string) {
  const { data } = await apiClient.get(API.catalog.tableIngestion(db, schema, table));
  return data;
}

export async function getTableOwnership(db: string, schema: string, table: string) {
  const { data } = await apiClient.get(API.catalog.tableOwnership(db, schema, table));
  return data;
}
```

---

## Entrées api-contracts.ts à ajouter (section `catalog`)

```typescript
catalog: {
  // Existant (conserver)
  events: () => '/catalog/events',

  // Nouveaux — SmartRightBar
  tableContext:    (db: string, s: string, t: string) => `/catalog/tables/${enc(db)}/${enc(s)}/${enc(t)}/context`,
  tableGovernance: (db: string, s: string, t: string) => `/catalog/tables/${enc(db)}/${enc(s)}/${enc(t)}/governance`,
  tableLineage:    (db: string, s: string, t: string) => `/catalog/tables/${enc(db)}/${enc(s)}/${enc(t)}/lineage`,
  tableIngestion:  (db: string, s: string, t: string) => `/catalog/tables/${enc(db)}/${enc(s)}/${enc(t)}/ingestion`,
  tableOwnership:  (db: string, s: string, t: string) => `/catalog/tables/${enc(db)}/${enc(s)}/${enc(t)}/ownership`,
  applyFlowTags:   () => '/catalog/tags/flow',
  notifyConsumers: () => '/catalog/tables/notify-consumers',
},
```

---

## Henry Tasks — SmartRightBar frontend

### P1 — Composant principal + sections critiques

- [ ] Créer `apps/data360/src/components/ui/SmartRightBar.tsx`
      Sections obligatoires P1: Context + Actions + Governance + History
      Fichier source: ce spec §Implementation
- [ ] Créer `apps/data360/src/components/ui/rightbar/SectionContext.tsx`
      Rendu: nom/type/taille/owner/tags-badges — voir §S1 rendu voulu
- [ ] Créer `apps/data360/src/components/ui/rightbar/SectionGovernance.tsx`
      Rendu: gov rate %, PII list, RLS policies, CTAs masking/RLS — voir §S3
- [ ] Ajouter entrées `catalog.*` dans `apps/data360/src/lib/api-contracts.ts`
      Voir §API contracts ci-dessus — 7 nouvelles fonctions
- [ ] Créer `apps/data360/src/app/services/catalog/rightbar.ts`
      Voir §Services API ci-dessus — 5 fonctions getTable*

### P2 — Sections enrichissement

- [ ] Créer `apps/data360/src/components/ui/rightbar/SectionLineage.tsx`
      Rendu: upstream/downstream tree + impact count + notifier CTA — voir §S4
- [ ] Créer `apps/data360/src/components/ui/rightbar/SectionIngestion.tsx`
      Rendu: mode/schedule/last-run/cost/flow-tags — voir §S5
- [ ] Créer `apps/data360/src/components/ui/rightbar/SectionOwnership.tsx`
      Rendu: source→product classifier + consumers humains/apps — voir §S6
- [ ] Créer `apps/data360/src/components/ui/rightbar/SectionAliceTips.tsx`
      Rendu: Cortex Complete recommendations — voir §S7
- [ ] Intégrer SmartRightBar dans `explore-design/page.tsx` (remplacer ContextRightBar)
- [ ] Intégrer SmartRightBar dans `sources/page.tsx`

### P3 — Polish + modules additionnels

- [ ] Intégrer SmartRightBar dans `governance/policies/page.tsx`
- [ ] Intégrer SmartRightBar dans `data-quality/page.tsx`
- [ ] Intégrer SmartRightBar dans `workflow/ETLPipelineBuilder.tsx` (panel nœud ETL)
- [ ] Ajouter annotations coût/perf/lignée dans SectionActions (voir §S2 annotations)
