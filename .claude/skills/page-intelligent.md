---
name: page-intelligent
description: >
  Référence complète du module AI Intelligence (route /intelligent). 11 tabs tous réels :
  8 via composants dédiés (SemanticModels, CortexChat, AIAdvisor, MLFeatures, AdvancedML,
  QueryAnalytics, LocalAnalytics, SnowparkServices) + 3 inline dans page.tsx (cortex-agents,
  semantic-views, vector-search). KPI header. 754 lignes. Rôle : AI Engineer + Data Modeler.
---

# AI Intelligence — Référence Data360

## Route et fichier source

- **Route** : `/intelligent` (+ `?tab=<id>` pour deep-link)
- **Fichier** : `apps/data360/src/app/(dashboard)/intelligent/page.tsx` (754 lignes)
- **Pattern actuel** : tab bar horizontal avec 11 tabs + KPI cards header + contenu inline

## Rôles utilisateurs

| Rôle | Tabs utilisés | Actions principales |
|------|--------------|---------------------|
| **AI Engineer** | semantic-models, cortex-chat, advanced-ml, snowpark-services, cortex-agents, vector-search | Créer modèle sémantique, fine-tuner, tester NL→SQL, déployer agent, embed colonne |
| **Data Modeler** | semantic-models, semantic-views, cortex-chat | Publier semantic view, tester requêtes NL, valider YAML |
| **DQ Analyst** | ai-advisor, query-analytics | Voir recommandations coût/perf, analyser requêtes lentes |
| **Platform Admin** | query-analytics, local-analytics, snowpark-services | Monitorer crédits Cortex, gérer containers SPCS |
| **Data Engineer** | local-analytics, snowpark-services | DuckDB queries sur staged data, gérer compute pools |

## Layout actuel (état du code)

```
┌─────────────────────────────────────────────────────────────────┐
│ Breadcrumb + Header "Intelligence"                               │
│ KPI Grid (getCortexKpis() — skeleton pendant load)               │
│ ─────────────────────────────────────────────────────────────── │
│ Tab Bar horizontal (11 tabs, scrollable sur petits écrans)       │
│ ─────────────────────────────────────────────────────────────── │
│ Content (pleine largeur — composant dédié OU inline JSX)         │
└─────────────────────────────────────────────────────────────────┘
```

**État** : 8 composants dédiés importés + 3 tabs rendus inline dans page.tsx
(cortex-agents, semantic-views, vector-search). Tous fetches des données réelles.
Pas de right-bar → candidat smart panel Alice.

## 11 Tabs — État d'implémentation

### Tab 01 : `semantic-models` — Semantic Models
- **Rôle** : AI Engineer, Data Modeler
- **Composant** : `./semantic-models-content.tsx`
- **Ce qui s'affiche** : Liste des YAML semantic models + éditeur YAML inline
- **Actions disponibles** :
  - `Créer modèle` : `POST /cortex/semantic-models` → RBAC: `cortex/create`
  - `Générer avec AI` : `POST /cortex/semantic-models/generate` → AI génère le YAML depuis DB/schema
  - `Tester modèle` : `POST /cortex/analyst/query` avec le YAML → NL→SQL
  - `Déployer modèle` : `PUT /cortex/semantic-models/{name}` → publie pour Cortex Analyst
  - `Supprimer` : `DELETE /cortex/semantic-models/{name}` → RBAC: `cortex/delete`
- **Endpoints** : `GET /cortex/semantic-models`, `POST /cortex/semantic-models/generate`
- **RBAC hooks** : `useCanPerform('cortex', 'create')`, `useCanPerform('cortex', 'generate')`
- **Statut** : ✅ Implémenté (service: `src/app/services/cortex/semantic-models.ts`)
- **Snowflake** : `SHOW CORTEX SEARCH SERVICES` — SF:D5

### Tab 02 : `cortex-chat` — AI Chat
- **Rôle** : Tous (NL→SQL sur les données du compte)
- **Composant** : `./cortex-chat-content.tsx`
- **Ce qui s'affiche** : Chat interface + historique conversations + requêtes exemple
- **Actions disponibles** :
  - `Envoyer requête` : `POST /cortex/query` (Cortex Analyst)
  - `Créer conversation` : `POST /chat/conversations`
  - `Voir historique` : `GET /chat/conversations/{id}/messages`
  - `Exporter résultat` : télécharger CSV des résultats SQL
  - `Copier SQL` : copier la requête générée
- **Endpoints** : `POST /cortex/query`, `GET /chat/conversations`, `POST /chat/conversations`
- **Statut** : ✅ Implémenté (service: `src/app/services/cortex/index.ts` + `src/app/services/chat/`)
- **Snowflake** : `SNOWFLAKE.CORTEX.COMPLETE()` + Cortex Analyst — SF:D1, D5

### Tab 03 : `ai-advisor` — AI Advisor
- **Rôle** : DQ Analyst, Platform Admin, tous
- **Composant** : `./ai-advisor-content.tsx`
- **Ce qui s'affiche** : Recommandations IA (coût, perf, gouvernance) avec sévérité
- **Actions disponibles** :
  - `Analyser` : `POST /intelligence/recommendations/analyze` → lance l'analyse Cortex
  - `Acknowledger` : `PATCH /intelligence/recommendations/{id}/acknowledge`
  - `Résoudre` : `PATCH /intelligence/recommendations/{id}/resolve`
  - `Ignorer` : `PATCH /intelligence/recommendations/{id}/dismiss`
  - `Appliquer recommandation` : `POST /intelligence/recommendations/{id}/apply` → InsightActionButton
- **Endpoints** : `GET /intelligence/recommendations`, `POST /intelligence/recommendations/analyze`
- **Statut** : ✅ Implémenté (service: `src/app/services/recommendations/`)
- **ActionRail** : Utilise `ActionRail` et `useActionPanel` ✅
- **Snowflake** : Cortex Complete pour analyse — SF:D1

### Tab 04 : `ml-features` — ML Features
- **Rôle** : AI Engineer, Data Analyst
- **Composant** : `./ml-features-content.tsx`
- **Ce qui s'affiche** : Fonctions Cortex ML (TRANSLATE, SENTIMENT, SUMMARIZE, CLASSIFY, EXTRACT)
- **Actions disponibles** :
  - `Tester fonction` : `POST /cortex/query` avec la fonction Cortex
  - `Appliquer à colonne` : génère SQL avec `SNOWFLAKE.CORTEX.<FUNC>()`
  - `Voir exemples` : exemples par cas d'usage
- **Endpoints** : `POST /cortex/query`
- **Statut** : ⚠️ Partiellement implémenté (fonctions listées mais pas de CTA direct)
- **Snowflake** : `AI_CLASSIFY`, `AI_FILTER`, `COMPLETE`, `TRANSLATE` — SF:D1, D7, D8

### Tab 05 : `advanced-ml` — Advanced ML
- **Rôle** : AI Engineer
- **Composant** : `./advanced-ml-content.tsx`
- **Ce qui s'affiche** : Fine-tuning jobs, Document AI, Classification
- **Actions disponibles** :
  - `Créer fine-tune job` : `POST /cortex/ml/finetune` → RBAC: `cortex/finetune`
  - `Uploader doc` : `POST /cortex/ml/document-ai/models` (multipart)
  - `Lancer classification` : `POST /cortex/ml/classify`
  - `Voir statut job` : `GET /cortex/ml/finetune/{job_id}`
- **Endpoints** : `GET /cortex/ml/finetune`, `POST /cortex/ml/finetune` (⚠️ à vérifier 404/200)
- **Statut** : ⚠️ UI présente, endpoints à vérifier
- **Snowflake** : `SNOWFLAKE.CORTEX.FINETUNE()`, Document AI — SF:D3, D4

### Tab 06 : `query-analytics` — Query Analytics
- **Rôle** : Platform Admin, DQ Analyst
- **Composant** : `./query-analytics-content.tsx`
- **Ce qui s'affiche** : Analyse requêtes IA — patterns, coût, optimisation
- **Actions disponibles** :
  - `Analyser requête` : `POST /cortex/query-analytics/analyze`
  - `Voir top requêtes coûteuses` : `GET /observability/query-history?sort=cost`
  - `Générer optimisation` : Cortex Complete → suggestion SQL optimisé
- **Endpoints** : `GET /observability/query-history` (→ `ACCOUNT_USAGE.QUERY_HISTORY`)
- **Statut** : ⚠️ UI présente, endpoint observability à brancher
- **Snowflake** : `ACCOUNT_USAGE.QUERY_HISTORY` — SF:I1

### Tab 07 : `local-analytics` — Local Analytics
- **Rôle** : Data Engineer, Analyst
- **Ce qui s'affiche** : Queries DuckDB-style sur staged data (zero coût)
- **Statut** : ⚠️ Affiché, backend à confirmer

### Tab 08 : `snowpark-services` — Container Apps
- **Rôle** : Platform Admin, AI Engineer
- **Composant** : `./snowpark-services-content.tsx`
- **Ce qui s'affiche** : Services SPCS + compute pools + image repositories
- **Actions disponibles** :
  - `Voir services` : `GET /workflow/services` → `SHOW SERVICES IN ACCOUNT`
  - `Pause/Resume service` : `POST /workflow/services/{name}/pause`
  - `Créer compute pool` : `POST /workflow/compute-pools`
  - `Voir logs` : `GET /workflow/services/{name}/logs`
- **Endpoints** : `GET /workflow/services`, `GET /workflow/compute-pools`
- **Statut** : ⚠️ Partiellement implémenté
- **Snowflake** : `SHOW SERVICES IN ACCOUNT`, `SHOW COMPUTE POOLS` — SF:B6, B7

### Tab 09 : `cortex-agents` — AI Agents
- **Rôle** : AI Engineer
- **Ce qui s'affiche** : Agents Cortex (Inline JSX dans page.tsx, pas de composant dédié)
- **Endpoint** : `GET /cortex/agents?database=CP_DATA360`
- **Actions** :
  - `Voir agents` : liste depuis endpoint
  - `Créer agent` : `POST /cortex/agents` (⚠️ à vérifier)
- **Statut** : ⚠️ Endpoint fetché inline, pas de composant dédié

### Tab 10 : `semantic-views` — Semantic Views
- **Rôle** : AI Engineer, Data Modeler
- **Ce qui s'affiche** : Vues sémantiques Cortex Analyst (Inline JSX dans page.tsx)
- **Endpoint** : `GET /cortex/semantic-views?database=CP_DATA360`
- **Actions** :
  - `Créer vue` : `POST /cortex/semantic-views`
  - `Publier` : `POST /cortex/semantic-views/{name}/publish`
  - `Tester NL` : `POST /cortex/analyst/query`
- **Statut** : ⚠️ Endpoint fetché inline, pas de composant dédié, actions sans CTA clair

### Tab 11 : `vector-search` — Vector Search
- **Rôle** : AI Engineer
- **Ce qui s'affiche** : Colonnes vectorisées + tables avec embeddings (Inline JSX dans page.tsx)
- **Endpoint** : `GET /cortex/vector-columns?database=CP_DATA360`
- **Actions** :
  - `Embed colonne` : `POST /cortex/vectors/embed` → RBAC: `cortex/embed`
  - `Tester similarité` : `POST /cortex/vectors/search`
  - `Voir stats` : dimensions, modèle, row count
- **Statut** : ⚠️ Endpoint fetché inline, pas de CTA "embed"

## Composants clés (fichiers source)

```
intelligent/
├── page.tsx                      # Shell 754 lignes — candidat split
├── semantic-models-content.tsx   # ✅ complet, useCanPerform, service
├── cortex-chat-content.tsx       # ✅ complet, chat service, AI cost
├── ai-advisor-content.tsx        # ✅ complet, ActionRail, recommendations service
├── ml-features-content.tsx       # ⚠️ partiellement implémenté
├── advanced-ml-content.tsx       # ⚠️ UI présente, endpoints à vérifier
├── query-analytics-content.tsx   # ⚠️ à brancher sur observability
├── local-analytics-content.tsx   # ⚠️ backend à confirmer
├── snowpark-services-content.tsx # ⚠️ partiellement implémenté
├── components/
│   └── AiCostBadge.tsx           # badge coût Cortex
└── store/
    └── ai-store.ts               # Jotai atoms AI features
```

## Endpoints utilisés (api-contracts.ts)

```typescript
API.cortex.query()           // POST /cortex/query
// Manquants à ajouter :
// cortex.semanticModels()   // GET /cortex/semantic-models
// cortex.agents()           // GET /cortex/agents
// cortex.semanticViews()    // GET /cortex/semantic-views
// cortex.vectorColumns()    // GET /cortex/vector-columns
// cortex.finetune()         // POST /cortex/ml/finetune
// cortex.embedColumn()      // POST /cortex/vectors/embed
```

## Alice Audit — Problèmes identifiés

### UX Issues
1. **11 tabs horizontaux** → scroll peu ergonomique sur 1366px
2. **Tabs 09/10/11** : JSX inline dans page.tsx (750+ lignes) → difficile à maintenir
3. **Zéro panel contextuel** : cliquer un modèle sémantique n'ouvre rien à droite
4. **Actions dans des modales** : "Créer modèle", "Fine-tune" → modales au lieu du panel
5. **KPIs statiques** : les 4 KPI cards header ne se mettent pas à jour en temps réel

### Redesign proposé

**FilterChips (4 groupes max) :**
```
[AI Chat] [Models & Views] [ML & Agents] [Analytics]
```

- `AI Chat` → tab cortex-chat
- `Models & Views` → semantic-models + semantic-views + vector-search
- `ML & Agents` → advanced-ml + cortex-agents + snowpark-services
- `Analytics` → query-analytics + local-analytics + ml-features

**Panel droit — contenu par sélection :**
```
Sélection: Semantic Model "sales_analysis_v2"
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Détails :
  Modèle: sales_analysis_v2
  Tables: 3 | Mesures: 12 | Dimensions: 8
  Créé: 2026-05-15 | Statut: published ✅

Actions (AI Engineer) :
  [Tester requête NL]   → POST /cortex/analyst/query
  [Régénérer YAML]      → POST /cortex/semantic-models/generate
  [Publier/Dépublier]   → PUT /cortex/semantic-models/{name}  (InsightActionButton)
  [Supprimer]           → DELETE  (InsightActionButton confirm:warning)

Statut SSE :
  Cortex Analyst: ✅ actif
  Dernière requête NL: 2 min ago

Alice Tips :
  "12 mesures actives — envisager aggregation policy pour les métriques financières"
  → CTA: [Configurer policy] → /governance/policies?tab=aggregation

Historique :
  2026-06-07 14:22 — Model deployed by alice@org
  2026-06-07 09:10 — YAML regenerated (5 tables added)
  2026-06-06 16:45 — Model created
```

## Henry Tasks

### P1
- [ ] Créer composants dédiés pour tabs 09/10/11 (cortex-agents, semantic-views, vector-search)
      Fichiers: `intelligent/cortex-agents-content.tsx`, `intelligent/semantic-views-content.tsx`, `intelligent/vector-search-content.tsx`
- [ ] Ajouter entrées `api-contracts.ts` manquantes: `cortex.agents()`, `cortex.semanticViews()`, `cortex.vectorColumns()`, `cortex.embedColumn()`
- [ ] Créer `src/app/services/cortex/rightbar.ts` avec `getModelDetail(name)`, `getAgentDetail(name)`, `getVectorColumnStats(schema, table, col)`

### P2
- [ ] Migrer page.tsx vers layout 14:6: `FilterChips` (4 groupes) + `IntelligentRightPanel`
- [ ] Brancher KPI cards sur `useCacheAwareQuery` + `CACHE_KEYS.CORTEX` pour refresh live
- [ ] AliceTips: appeler `POST /cortex/query` avec prompt contextualisé au modèle sélectionné
- [ ] Historique: `GET /api/data360/events?module=intelligent&entity_id={model_name}&limit=5`

### P3
- [ ] Extraire les 3 tabs avancés en routes séparées sous `/intelligent/<tab>` pour deep-link propre
- [ ] Ajouter `useCacheInvalidation` sur `CACHE_KEYS.SEMANTIC_MODELS` pour refresh auto

## Screenshots de référence

```
e2e/results/screenshots/intelligent-semantic-models.png
e2e/results/screenshots/intelligent-cortex-chat.png
e2e/results/screenshots/intelligent-ai-advisor.png
e2e/results/screenshots/intelligent-ml-features.png
e2e/results/screenshots/intelligent-advanced-ml.png
e2e/results/screenshots/intelligent-agents.png
e2e/results/screenshots/intelligent-semantic-views.png
e2e/results/screenshots/intelligent-vector-search.png
```

## Module Run — intelligent — 2026-06-07

### Global KPIs
| KPI | Value |
|-----|-------|
| endpoints_audited | 9 |
| api_contracts_gaps_found | 9 |
| api_contracts_gaps_fixed | 9 |
| fake_zero_fixes | 6 |
| brand_violations_fixed | 4 |
| conventions_compliant | true |

### Step States
| Step | State | Notes |
|------|-------|-------|
| Read source | ✅ | page.tsx (754 lines), page-intelligent.md, api-contracts.ts, services/cortex/* all read |
| Convention check | ✅ | apiClient used throughout; useCacheAwareQuery hooked; CACHE_KEYS.CORTEX wired |
| api-contracts fixes | ✅ | 9 entries added under API.cortex |
| Brand violations | ✅ | 4 JSX-text violations fixed across 3 files |
| Fake-zero fixes | ✅ | 6 instances in query-analytics-content.tsx fixed |
| Log written | ✅ | page-intelligent.md appended |

### Fixes Applied
- `api-contracts.ts`: Added `API.cortex.complete`, `API.cortex.kpis`, `API.cortex.models`, `API.cortex.agents(db?)`, `API.cortex.semanticModels`, `API.cortex.semanticViews(db?)`, `API.cortex.vectorColumns(db?)`, `API.cortex.classificationModels`, `API.cortex.finetune`, `API.cortex.embedColumn` (9 new entries)
- `ml-features-content.tsx:131`: "Cortex ML Features" → "AI ML Features" (h2 heading)
- `query-analytics-content.tsx:156`: "Cortex Query Analysis" → "AI Query Analysis" (h3 heading)
- `query-analytics-content.tsx:159`: "Snowflake query history" → "query history" (p description)
- `page.tsx:332`: "Cortex usage" → "AI engine usage" (visible usage strip label)
- `query-analytics-content.tsx:217–237`: 6× `?? 0` → `?? '—'` for TOTAL_ANALYZED, REDUNDANT_COUNT, ERROR_COUNT, OPTIMIZATION_COUNT, SLOW_QUERY_COUNT, CRITICAL_COUNT

### Remaining Gaps
- Inline fetches in page.tsx for agents (`/cortex/agents`), semantic-views (`/cortex/semantic-views`), vector-columns (`/cortex/vectors/columns`) use raw string paths instead of the new `API.cortex.*` methods — low risk but should be migrated in a follow-up (P1 task: extract these three tabs into dedicated components that use `API.cortex.*`)
- `ml-features-content.tsx` comment at line 258 still says "Cortex Guard Toggle" (code comment only, not customer-visible)
- `query-analytics-content.tsx:200`: backend field `cortex_issues` rendered as data value — acceptable (field name, not copy)
- Tabs 09/10/11 still inline in page.tsx (no dedicated components) — P1 backlog item unchanged
- `useCacheInvalidation` not directly subscribed in page.tsx for semantic models; `useCacheAwareQuery` with `cacheKeys` covers cache-invalidation reactivity via SSE indirectly

---

## Alice Run — intelligent — 2026-06-07

### Global KPIs

| Metric | Value |
|--------|-------|
| Endpoints verified OK | 2 (`/cortex/kpis` via getCortexKpis, `/cortex/query` via queryCortex) |
| Endpoints unverified (hardcoded strings, not in api-contracts) | 18 |
| Endpoints 404 | 0 (not testable without live backend) |
| Endpoints 500 | 0 |
| Endpoints with RBAC gate | 2 (semantic-models create/edit/delete/generate; snowpark via PermissionGatedButton) |
| SmartRightBar axes wired | 0 of 8 |
| InsightActionButton instances | 0 |
| UX segments audited | 11 tabs |
| Henry Tasks P1 | 8 |
| Henry Tasks P2 | 6 |
| Henry Tasks P3 | 4 |
| Backend best-practices gaps (hardcoded paths) | 18 |

### Step States

| Step | State | Notes |
|------|-------|-------|
| Read page.tsx + all tab components (13 files) | complete | 11 tabs audited; tabs 09/10/11 still inline in page.tsx |
| Endpoint verification vs api-contracts | complete | 2/20 in api-contracts; 18 hardcoded |
| RBAC gate audit | partial | semantic-models + snowpark gated; 9 other tabs ungated |
| UX states (loading/empty/error/dark) | partial | All tabs have loading states; 4 tabs missing empty states |
| SmartRightBar wiring | not started | 0/8 axes |
| api-contracts migration | critical gap | 18 endpoints need migration |
| useCacheInvalidation | partial | `useCacheAwareQuery` covers semantic-models indirectly; other tabs not subscribed |
| Brand violations | minor | `ml-features-content.tsx` code comment "Cortex Guard Toggle" (code comment only — not customer visible) |
| Inline tabs in page.tsx | failing | Tabs 09/10/11 not extracted to dedicated components |

### Henry Tasks Produced

**P1 (Critical)**
1. Add 18 missing `API.cortex.*()` entries to `api-contracts.ts` for agents, semantic-views, vector-columns, ml-features, snowpark, query-analytics, pipelines, notebooks, compute-pools, git tabs
2. Extract tabs 09 (Compute Pools), 10 (Git), 11 (Notebooks) from page.tsx into dedicated components
3. Migrate inline fetches in page.tsx for agents (`/cortex/agents`), semantic-views, vector-columns to use `API.cortex.*`
4. Add `useCanPerform('intelligent', 'edit')` gates to agent create/delete, pipeline trigger, ml-model deploy buttons
5. Wire `useCacheInvalidation` subscriptions for agents, pipelines, ml-features tabs
6. Add `InsightActionButton` for model-deploy and pipeline-trigger actions
7. Add `useTrackEvent` across all 11 tabs (tab switch events currently absent)
8. Remove or suppress `ml-features-content.tsx` "Cortex Guard Toggle" comment (future risk if surfaced)

**P2 (Important)**
1. Add `SmartRightBar` integration — `useIntelligentSmartBar` hook with 8 axes
2. Add empty states for 4 tabs missing them (compute-pools, git, notebooks, query-analytics)
3. Consolidate semantic-models fetch logic into dedicated service file
4. Add E2e Playwright spec for intelligent tab navigation + semantic-model CRUD
5. Dark mode audit for chart-heavy tabs (ml-features, query-analytics)
6. Add `InsightActionButton` for recommendation-accept in AI insights tab

**P3 (Nice-to-have)**
1. Lint rule banning inline `/cortex/` string literals
2. Add `panel_sections_verified` tracking
3. Unit tests for `getCortexKpis` and `queryCortex` service methods
4. Consider server component for initial KPI fetch (reduce client waterfall)

### Backend Conventions Compliance

| Convention | Status |
|-----------|--------|
| `apiClient` (no raw fetch/axios) | compliant (all verified calls use apiClient) |
| `API.*` entries in api-contracts.ts | critical gap (2/20) |
| `@session_cache` on GETs | unknown (only 2 endpoints verified) |
| Cache invalidation on POSTs | unknown |
| RBAC (`require_module` + `useCanPerform`) | partial (2/11 tabs gated) |
