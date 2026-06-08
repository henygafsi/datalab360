---
name: page-data-products
description: >
  Référence Product Portfolio Data360 (route /data-products). 704 lignes. Card grid produits
  avec statuts draft/active/certified, 6 KPI tiles (Total, Certified, AvgQuality, Consumers,
  Domains, TrustScore), right panel Object360Panel + ProductDetailPanel, PublishGate RBAC.
  Rôle : Data Product Owner + Data Engineer.
---

# Product Portfolio — Référence Data360

## Route et fichier source

- **Route** : `/data-products`
- **Titre affiché** : "Product Portfolio"
- **Fichier** : `apps/data360/src/app/(dashboard)/data-products/page.tsx` (704 lignes)
- **Pattern** : Liste card grid + right panel (Object360 ou ProductDetail) — layout split

## Ce qui s'affiche réellement

### Header
- Breadcrumb: `Home / Product Portfolio`
- H1: `Product Portfolio` avec icône `Package`
- Sous-titre : "Manage data products, KPIs, dashboards and consumption"
- Boutons header : `Refresh` + `Create Product` (RBAC: `useCanPerform('data_products', 'create')`)

### KPI Tiles (6 tiles, top grid)
| Tile | Valeur | Source | Fallback si vide |
|------|--------|--------|-----------------|
| Data Products | total count | `listDataProducts()` | `—` |
| Certified | count status=certified | local normalize | `—` |
| Avg Quality | moyenne QUALITY_THRESHOLD | local calcul | `—` |
| Consumers | somme CONSUMERS | local calcul | `—` |
| Domains | nb tags uniques | local calcul | `—` |
| Trust Score | `averages.trust_avg` arrondi | `getCatalogScores()` | `—` si erreur |

**Normalisation statuts** : `normalizeProductStatus()` gère uppercase DRAFT/PUBLISHED/ACTIVE.
Règle : PUBLISHED → active, DRAFT/UNPUBLISHED/PENDING → draft, inconnu → draft (jamais fake active).

### Toolbar (sous KPIs)
- Champ recherche : filtre sur `NAME`, `TABLE_FQN`, `DESCRIPTION`, `TAGS`
- Select filtre statut : `All Statuses | Active | Certified | Draft`

### Main Content — 2 zones
```
┌─────────────────────────────┬──────────────────────────────┐
│ Card Grid (flex-1)          │ Right Panel (w-380 ou w-440) │
│ 2 colonnes md               │ Object360Panel (priority)    │
│ ProductCard par produit     │ ou ProductDetailPanel         │
│                             │ s'ouvre au clic d'une card   │
└─────────────────────────────┴──────────────────────────────┘
```

### ProductCard — ce qui s'affiche
- `NAME` + badge statut coloré (draft=gray, active=blue, certified=emerald)
- `TABLE_FQN` (fqn de la table source)
- `DESCRIPTION` (tronquée)
- `TAGS` (badges tag)
- Métriques : CONSUMERS, QUALITY_THRESHOLD%
- Bouton `Subscribe` inline (désactivé si déjà abonné)

### ProductDetailPanel — right panel (produit sélectionné)
- Titre produit + statut + FQN
- Métriques détaillées : consumers, quality score, owner
- Bouton `Open Object 360` → ouvre `Object360Panel` (prend priorité)
- Bouton `Publish` → `PublishGate` (RBAC + confirm)
- Fermeture : X dans le panel

### Object360Panel — right panel prioritaire (440px)
- Vue 360° d'une table depuis son `TABLE_FQN`
- Appelle les services catalog pour metadata, lineage, quality
- Fermer → revient au `ProductDetailPanel`

### Footer strip (cross-module links)
```
Related: Source Catalog | Explore & Design | Data Quality | Governance
```

## Services et endpoints

```typescript
// apps/data360/src/app/services/data-products/index.ts
listDataProducts()           // GET /data-products/list
createDataProduct(body)      // POST /data-products
subscribeToProduct(id)       // POST /data-products/{id}/subscribe
publishDataProduct(id)       // POST /data-products/{id}/publish

// apps/data360/src/app/services/catalog/index.ts
getCatalogScores()           // GET /catalog/scores → { averages: { trust_avg } }
```

## RBAC

| Action | Hook | Permission |
|--------|------|-----------|
| Create Product | `useCanPerform('data_products', 'create')` | fail-open (load=allowed) |
| Publish Product | `PublishGate` | admin ou owner |
| Subscribe | aucun gate actuel | tous |

## Composants sous-dossier

```
data-products/
├── page.tsx                        # 704L — shell + logique principale
├── components/
│   ├── Object360Panel.tsx           # Vue 360 table (catalog, lineage, quality)
│   ├── KpiLifecyclePanel.tsx        # Panel cycle de vie KPI
│   ├── PublishGate.tsx              # Bouton publish avec confirm + RBAC
│   └── RecommendationsPanel.tsx     # Recommandations IA sur les produits
```

## Rôles utilisateurs

| Rôle | Actions disponibles |
|------|-------------------|
| **Data Product Owner** | Create, Publish, Subscribe, voir Object360 |
| **Data Engineer** | Create, Subscribe, voir quality + lineage |
| **Data Analyst** | Subscribe, voir produits, voir quality scores |
| **Data Governor** | Voir tous produits, voir Trust Score catalog |

## États UI

| État | Ce qui s'affiche |
|------|-----------------|
| Loading | Skeleton 4 cards (animate-pulse) |
| Erreur | Card rouge + bouton Retry |
| Vide (no products) | Icône Package + "No data products yet" + bouton Create |
| Vide (filtrée) | "No products match your filters" |
| Produit sélectionné | Right panel glisse depuis la droite |
| Object360 ouvert | Panel 440px remplace ProductDetail |

## Alice Smart Panel — spec (à implémenter)

```
Sélection: "Sales Analytics Product" (certified)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Détails :
  Table: ANALYTICS.PUBLIC.SALES_SUMMARY
  Statut: certified ✅ | Consumers: 12 | Quality: 94%
  Owner: data-team@org | Tags: finance, kpi, source

Actions :
  [Subscribe]              → POST /data-products/{id}/subscribe
  [Open Object 360]        → Object360Panel (lineage + quality complet)
  [Publish / Certify]      → POST /data-products/{id}/publish  (RBAC gate)
  [View Lineage]           → /observability/lineage?table=ANALYTICS.PUBLIC.SALES_SUMMARY

Risques :
  Cost: SELECT coûte 0.02 crédits/requête estimé
  Lineage: 3 dépendants (2 dashboards, 1 pipeline)
  Gov: Masking policy active sur col EMAIL ✅

Alice Tips :
  "Ce produit est certifié mais 2 consommateurs n'ont pas de RLS configuré"
  → [Configurer RLS] → /governance/policies?tab=rls

Historique :
  2026-06-05 — Certifié par admin
  2026-05-20 — Publié (12 subscribers)
  2026-04-10 — Créé par data-team
```

## Henry Tasks — data-products

### P1
- [ ] Ajouter `api-contracts.ts` : `API.dataProducts.list()`, `API.dataProducts.create()`, `API.dataProducts.subscribe(id)`, `API.dataProducts.publish(id)`
- [ ] Corriger : bouton Subscribe doit vérifier si déjà abonné (pas de state persisté actuellement)
- [ ] `getCatalogScores()` : gérer erreur séparément du loading products (ne pas bloquer l'UI principale)

### P2
- [ ] Créer `DataProductsRightBar.tsx` avec tabs : Actions | Alice | Lineage | History
- [ ] Brancher `Object360Panel` sur les métriques réelles DQ + lineage depuis observability
- [ ] `RecommendationsPanel` : appeler `POST /cortex/query` avec context du produit sélectionné

### P3
- [ ] Smart tag proposals : Alice suggère source/product/domain tags depuis la description + FQN
- [ ] Consumer ownership map : qui consomme (apps vs human), depuis ACCOUNT_USAGE.ACCESS_HISTORY

## Module Run — data-products — 2026-06-07

### Global KPIs
| KPI | Value |
|-----|-------|
| endpoints_audited | 8 |
| api_contracts_gaps_found | 9 |
| api_contracts_gaps_fixed | 9 |
| fake_zero_fixes | 0 |
| conventions_compliant | true |

### Step States
| Step | State | Notes |
|------|-------|-------|
| Read source | ✅ | page.tsx (704L), services/data-products/index.ts, api-contracts.ts, catalog/index.ts |
| Convention check | ✅ | apiClient used throughout; no raw fetch/axios; fmtNum() guards all display values |
| api-contracts fixes | ✅ | 10 entries added (API.dataProducts × 9, API.catalog.scores × 1) |
| Fake-zero fixes | ✅ | No display fake-zeros found; 3 arithmetic `?? 0` patterns are correct (NaN guards in reduce/optimistic+1, all pass through fmtNum before render) |
| Log written | ✅ | page-data-products.md appended |

### Fixes Applied
- `api-contracts.ts`: Added `API.dataProducts` section with 9 entries:
  - `list()` → `GET /data-products`
  - `get(id)` → `GET /data-products/{id}`
  - `create()` → `POST /data-products`
  - `update(id)` → `PUT /data-products/{id}`
  - `delete(id)` → `DELETE /data-products/{id}`
  - `lineage(id)` → `GET /data-products/{id}/lineage`
  - `consumers(id)` → `GET /data-products/{id}/consumers`
  - `publish(id)` → `POST /data-products/{id}/publish`
  - `subscribe(id)` → `POST /data-products/{id}/subscribe`
- `api-contracts.ts`: Added `API.catalog.scores()` → `GET /catalog/scores` (used by `getCatalogScores()` in catalog service)

### Remaining Gaps
- `useCacheInvalidation` not wired in `page.tsx` — product list is not auto-refreshed on backend cache events (P2 task)
- Service layer still uses hardcoded `PREFIX = '/data-products'` string instead of `API.dataProducts.*` — functional but bypasses the contract registry; migration is a follow-up refactor (P2)
- `GET /catalog/products` endpoint from the task brief: not present in backend (no route found in catalog service); `listDataProducts()` uses `/data-products` directly — backend-gap, not an FE bug
- P1 task open: Subscribe button has no persistent "already subscribed" state — no local or server-side dedup beyond optimistic count update

## Alice Run — data-products — 2026-06-07 (full-suite KPI sweep)

> Method: dev OFFLINE → existence vs backend route manifest (823 entries). No fabricated statuses.
> Scope domains: dataProducts (9).

### Global KPIs

| KPI | Valeur |
|-----|--------|
| endpoints_testés (contract paths) | 9 |
| endpoints_ok (registered) | 9 |
| endpoints_404 | 0 |
| endpoints_500 | 0 |
| endpoints_non_vérifiés (offline) | 9 |
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

### Henry Tasks — data-products (backend delegation)

Aucune route backend manquante (100% des chemins du contrat sont enregistrés dans le manifest).
Gaps restants = frontend/UX (SmartRightBar, annotations CTA, Cortex tips) — hors scope "dev backend".
Test live (données réelles) à refaire quand le dev server sera up (actuellement NON VÉRIFIÉ).
