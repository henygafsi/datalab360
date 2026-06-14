---
name: api-skill-bi-reporting
description: >
  Module BI Reporting / Dashboards de Data360 (route /bi-dashboard, ex-business_reporting).
  Designer façon Power BI : projets multi-pages, widgets (chart/kpi_card/table/text) sur grille,
  filtres, NL-to-chart Cortex, auto-create par table/schéma (pages par domaine métier), render
  batch, drill-through, snapshot, export. 25 endpoints live (tous 401 = protégés par auth seule —
  AUCUN require_module/require_action). Asymétrie clé : backend riche, FE squelette (2/23 fonctions
  câblées). Grounded sur le code réel — 2026-06-09.
---

# BI Reporting / Dashboards — Skill Module (API-grounded, 2026-06-09)

> Toutes les affirmations sont sourcées (fichier:ligne ou slice live). Les endpoints viennent **uniquement** des slices `bi-dashboard.md` / `analytics-kpis.md` + `openapi.json` + code backend. Les types de chart viennent de `types.ts` (FE) et du code backend (stockage opaque). Aucun endpoint/type inventé. Les zones non confirmées sont marquées « non vérifié ».

## 1. Vue d'ensemble

| Élément | Valeur (source) |
|---------|-----------------|
| **Route front** | `/bi-dashboard` (+ `/bi-dashboard/[projectId]`) |
| **Module backend** | `backend/app/modules/projects/bi_dashboard/` — `router.py` (1551 l.) · `services.py` (1164 l.) · `models.py` (207 l.) |
| **Mount** | `main.py:645` `app.include_router(bi_dashboard_router)` — **sans `dependencies=`** (aucun gate router-level) |
| **Page liste (FE)** | `apps/data360/src/app/(dashboard)/bi-dashboard/page.tsx` (315 l. — liste cartes + modale create) |
| **Page designer (FE)** | `apps/data360/src/app/(dashboard)/bi-dashboard/[projectId]/page.tsx` (135 l. — **stub** : barre NL non câblée + « No widgets yet ») |
| **Client API (FE)** | `apps/data360/src/app/services/api/biDashboardApi.ts` (293 l., `PREFIX='/bi-dashboard'`, 23 fonctions) |
| **Modèles (backend)** | `bi_dashboard/models.py` — `ChartConfig`, `BIDashboardCreate`, `DashboardWidgetCreate/Update`, `PageCreate/Update`, `DashboardFilterCreate` |
| **Module annexe** | `/analytics/user-activity/summary` (`analytics/router.py`, gate `require_module("business_reporting")`) |

**Asymétrie structurelle (LE point clé du module).** Backend = 25 ops complètes et déployées (toutes `401` live). FE = **squelette** : grep des appelants → seules `createDashboard` (page.tsx) et `getDashboard` ([projectId]/page.tsx) sont câblées dans une page. `nlToChart`/`drillThrough` n'apparaissent que dans `lib/api-contracts.ts` (registre), `listTemplates` dans `admin/api-health` + `exploreDesignApi` (hors module). **21/23 fonctions = 0 appelant UI.** Le designer n'a ni canvas, ni rendu de widget, ni onglets ; le bouton « Generate » de la barre NL et « Add Widget » n'ont **aucun `onClick`**.

**Rôles.** **Non vérifié / inexistant au niveau applicatif.** Le module n'a aucun `require_action`/`require_module`/`useCanPerform` câblé. Toute personne authentifiée a accès à toutes les opérations. (Contraste : `workflow` câble `canWf*` via `useCanPerform` ; ici, rien.)

## 2. Capacités (grounded)

| Capacité | Implémentation (endpoint / fichier) | FE câblé ? |
|----------|--------------------------------------|------------|
| Créer un projet dashboard | `POST /bi-dashboard` → `createDashboard` (`page.tsx:61`) | ✅ |
| Charger le design complet | `GET /bi-dashboard/{id}` → `getDashboard` (`[projectId]/page.tsx:74`) | ✅ |
| NL-to-chart (Cortex `mistral-large2`) | `POST /bi-dashboard/nl-to-chart` → `nlToChart` | 🔴 stub (bouton sans onClick) |
| Auto-create dashboard (table) | `POST /bi-dashboard/auto-create` (mode table) → `autoCreateDashboard` | 🔴 0 appelant |
| Auto-create dashboard (schéma, pages par domaine) | `POST /bi-dashboard/auto-create` (mode schema) | 🔴 0 appelant |
| Templates pré-bâtis (5 builtin) | `GET /bi-dashboard/templates` → `listTemplates` | 🟡 hors module |
| Données d'un graphe (SQL) | `POST /bi-dashboard/charts/data` | 🔴 0 appelant |
| Render batch (fan-out parallèle) | `POST /bi-dashboard/{id}/render` → `renderDashboard` | 🔴 0 appelant |
| Drill-through | `POST /bi-dashboard/{id}/drill-through` → `drillThrough` | 🔴 (api-contracts seulement) |
| Widgets CRUD | `POST/GET/PUT/DELETE /{id}/widgets[/{wid}]` | 🔴 0 appelant |
| Pages CRUD | `POST/GET/PUT/DELETE /{id}/pages[/{pid}]` | 🔴 0 appelant |
| Filtres CRUD | `POST/GET/DELETE /{id}/filters[/{fid}]` | 🔴 0 appelant |
| Snapshot (version immuable) | `POST /{id}/snapshot` → `saveSnapshot` | 🔴 0 appelant |
| Coût par dashboard (honest-partial) | `GET /{id}/cost` | 🔴 0 appelant |
| Export JSON | `GET /{id}/export` → `exportDashboard` | 🔴 0 appelant |
| KPIs retail standardisés | `GET /bi-dashboard/retail-kpis` → `getRetailKpis` | 🔴 0 appelant |

## 3. Référence endpoints (25 ops — statut live)

**Contrat de statut :** dans le slice `bi-dashboard.md`, **les 25 ops renvoient `401 AUTH_REQUIRED`** (routes enregistrées + protégées par auth). Re-test live 2026-06-09 (sans token) confirme `401` sur les endpoints clés. Aucune route publique, aucun 5xx. ⚠ `401` ici prouve l'**authentification** requise, **pas** une autorisation par rôle (ce module n'en a aucune).

### 3a. Dashboard CRUD + design (bi-dashboard module)

| Live | Méthode | Path | Rôle/usage |
|------|---------|------|------------|
| 401 | POST | `/bi-dashboard` | Créer un projet dashboard (`BIDashboardCreate`) |
| 401 | GET | `/bi-dashboard/{project_id}` | Design complet (pages+widgets+filtres) |
| 401 | PUT | `/bi-dashboard/{project_id}` | MAJ métadonnées (`BIDashboardCreate`) |
| 401 | DELETE | `/bi-dashboard/{project_id}` | Supprimer (soft delete) |
| 401 | GET | `/bi-dashboard/{project_id}/export` | Export config+data JSON (download) |
| 401 | POST | `/bi-dashboard/{project_id}/snapshot` | Figer le design en version |
| 401 | GET | `/bi-dashboard/{dashboard_id}/cost` | Coût par dashboard (honest-partial, `cost:null`) |

### 3b. Pages / Widgets / Filtres

| Live | Méthode | Path | Rôle/usage |
|------|---------|------|------------|
| 401 | POST | `/bi-dashboard/{project_id}/pages` | Ajouter une page (`PageCreate`) |
| 401 | GET | `/bi-dashboard/{project_id}/pages` | Lister les pages |
| 401 | PUT | `/bi-dashboard/{project_id}/pages/{page_id}` | MAJ page (`PageUpdate`) |
| 401 | DELETE | `/bi-dashboard/{project_id}/pages/{page_id}` | Supprimer page |
| 401 | POST | `/bi-dashboard/{project_id}/widgets` | Ajouter widget (`DashboardWidgetCreate`) |
| 401 | GET | `/bi-dashboard/{project_id}/widgets` | Lister widgets (query `page_id`) |
| 401 | PUT | `/bi-dashboard/{project_id}/widgets/{widget_id}` | MAJ widget (`DashboardWidgetUpdate`) |
| 401 | DELETE | `/bi-dashboard/{project_id}/widgets/{widget_id}` | Supprimer widget |
| 401 | POST | `/bi-dashboard/{project_id}/filters` | Ajouter filtre (`DashboardFilterCreate`) |
| 401 | GET | `/bi-dashboard/{project_id}/filters` | Lister filtres (query `page_id`) |
| 401 | DELETE | `/bi-dashboard/{project_id}/filters/{filter_id}` | Supprimer filtre |

### 3c. Charts intelligence (data · render · NL · auto-create · templates · retail · drill)

| Live | Méthode | Path | Rôle/usage |
|------|---------|------|------------|
| 401 | POST | `/bi-dashboard/charts/data` | Exécuter un `ChartConfig` → données SQL |
| 401 | POST | `/bi-dashboard/{project_id}/render` | Render batch de N widgets (fan-out parallèle) |
| 401 | POST | `/bi-dashboard/nl-to-chart` | Question NL → `ChartConfig` (Cortex `mistral-large2`) |
| 401 | POST | `/bi-dashboard/auto-create` | Auto-générer un dashboard depuis une table OU un schéma |
| 401 | GET | `/bi-dashboard/templates` | 5 templates builtin enrichis |
| 401 | GET | `/bi-dashboard/retail-kpis` | KPIs retail (FACT_MARKETING/FINANCE/TRANSACTIONS) |
| 401 | POST | `/bi-dashboard/{dashboard_id}/drill-through` | Filtrer le détail par valeur de dimension cliquée |

### 3d. Module analytics annexe + dérive

| Live | Méthode | Path | Note |
|------|---------|------|------|
| 401 | GET | `/analytics/user-activity/summary` | KPIs activité (gate `require_module("business_reporting")`) — query `days` 1–365 |
| **404** | GET | `/analytics/dashboard-usage` | **DÉRIVE** : pas sous `/analytics`. Le handler `get_dashboard_usage` vit à `org_accounts/router.py:97` → `/org-accounts/dashboard-usage` (gate `account_overview`). La slice sur-compte `/analytics` (1 op réelle). |

## 4. Modèle de données

### 4a. `ChartConfig` (le cœur — pilote charts/data, render, nl-to-chart, widgets) `[models.py:122]`
- `database` str (défaut `CP_DATA360`) · `schema` str (défaut `RETAIL_DW`, alias `schema`) · `table` str **requis**
- `mode` str — `aggregate` (chart/kpi) ou `raw` (table widget). Défaut `aggregate`.
- `columns` string[] (mode raw) · `x` str (dimension/axe X) · `groupBy` string[] · `limit` int
- `measures` `MeasureConfig[]` — `{ column, aggregator|aggregation (alias), seuils:[{operator, value, label}] }`
- `filters` `FilterConfig[]` — `{ column, operator, value }`
- `topN` `TopNConfig` — `{ column, order=DESC∈ASC/DESC, limit 1–10000 }`

### 4b. Whitelists (validées Pydantic AVANT toute exécution SQL) `[models.py:13-25]`
- `SUPPORTED_AGGREGATORS` (17) : `SUM, AVG, MIN, MAX, COUNT, COUNT_DISTINCT, MEDIAN, STDDEV, VARIANCE, VAR_POP, VAR_SAMP, STDDEV_POP, STDDEV_SAMP, APPROX_COUNT_DISTINCT, BIT_AND, BIT_OR, BIT_XOR`. `COUNT_DISTINCT` → rendu `COUNT(DISTINCT col)`.
- `SUPPORTED_FILTER_OPS` : `=, !=, <, >, <=, >=, LIKE, NOT LIKE, IN, NOT IN, IS NULL, IS NOT NULL`. `IN/NOT IN` → liste non vide ; `IS [NOT] NULL` → value forcé à null.
- `SUPPORTED_DIRECTIONS` : `ASC, DESC`.

### 4c. Widget `[models.py:174 ; services.py:314]`
`{ page_id*, widget_type∈chart/kpi_card/table/text (déf. chart), chart_type? (VARCHAR(50) opaque), title?(≤255), chart_config?, text_content?, position_x/y≥0, width 1–24 (déf.6), height 1–24 (déf.4), style? }`.

### 4d. Types de chart — 3 couches (NE PAS confondre)
1. **Union FE `DashboardChartType` (19) `[types.ts:1418]`** : bar, line, pie, donut, area, scatter, heatmap, funnel, gauge, treemap, radar, waterfall, stacked_bar, stacked_area, histogram, combo, candlestick, bubble, radial_bar.
2. **Backend** : `CHART_TYPE` = `VARCHAR(50)` **opaque** ; `chart_type` n'est PAS dans `ChartConfig` ; `build_and_execute_chart` est **agnostique** (aggregate vs raw). **Le backend ne dessine ni ne valide aucun type.**
3. **Générés** : auto-create → kpi/line/bar/table ; templates builtin → kpi/line/pie/bar/area/table.

### 4e. Classifieur de domaine (auto-create schéma) `[services.py:731-766]`
7 domaines par mots-clés pondérés (table ×3, colonne ×1) : **Sales · Marketing · Operations · Finance · HR · Customer · Other**. Ordre des pages : `_DOMAIN_PAGE_ORDER`. Caps : ≤ 50 tables introspectées, ≤ 5 pages, ≤ 8 widgets/page.

## 5. Charts intelligence + 20 dashboards entreprise + 2 DQ (specs ins/outs)

> **Trifecta du module** : (a) **NL-to-chart** (question → `ChartConfig` validé via Cortex) ; (b) **auto-create** (table → KPI/line/bar/table ; schéma → pages par domaine) ; (c) **templates** (5 builtin). Les 22 dashboards ci-dessous sont des **specs de test** construites sur les primitives réelles (`ChartConfig`, aggregators whitelist, types FE, classifieur domaine), à la manière des 20 sample workflows du skill workflow — PAS des objets pré-existants, PAS les 5 templates builtin.

> **Flux d'endpoints type :** `POST /bi-dashboard` (crée projet `{project_id}`) → `POST /{id}/pages` → `POST /{id}/widgets` (avec `chart_config: ChartConfig`) → `POST /{id}/render` (rendu batch) → `POST /{id}/drill-through` → `POST /{id}/snapshot` → `GET /{id}/export`. Alternative express : `POST /bi-dashboard/auto-create`.

### 5.A — 20 dashboards entreprise (chaque widget = un `ChartConfig` réel)

**D01 — Executive Revenue Overview.** KPI `revenue` (SUM) · line `revenue` over `order_date` · bar `revenue` by `region` (topN 10). Source `SALES.FACT_ORDERS`.
**D02 — Sales Pipeline.** KPI `deal_count` (COUNT) · funnel(FE) sur `stage` via bar `amount` by `stage` · table raw top deals. Source `SALES.OPPORTUNITIES`.
**D03 — Customer 360.** KPI `customer_count` (COUNT_DISTINCT `customer_id`) · pie `customer_id` by `segment` (bar fallback) · line `ltv` over `signup_date`. Source `CUSTOMER.DIM_CUSTOMERS`.
**D04 — Marketing Campaign ROI.** KPI `roi` (AVG) · bar `spend` by `campaign` · line `clicks` over `event_date`. Source `MARKETING.FACT_CAMPAIGNS`.
**D05 — Financial P&L.** KPI `net_income` (SUM) · bar budget vs actual (`amount` by `category`) · area `revenue` over `month`. Source `FINANCE.FACT_GL`.
**D06 — Operations / Inventory.** KPI `stock_value` (SUM) · bar `quantity` by `warehouse` · line `inventory` over `snapshot_date`. Source `OPERATIONS.FACT_INVENTORY`.
**D07 — HR Headcount.** KPI `headcount` (COUNT_DISTINCT `employee_id`) · bar `salary` by `department` (AVG) · line `hires` over `hire_date`. Source `HR.DIM_EMPLOYEES`.
**D08 — Retail KPIs (endpoint dédié).** consomme `GET /bi-dashboard/retail-kpis?days=365` → KPI roi_pct/margin_pct/revenue + bar by_subsidiary + table cross_sell_metrics. Source `RETAIL_DW.FACT_*`.
**D09 — Store Performance.** bar `revenue` by `cod_magasin` (topN 20) · KPI `profit` (SUM) · line `revenue` over `dat_reference`. Source `RETAIL_DW.FACT_FINANCE`.
**D10 — Cross-sell / Basket.** KPI `multi_item_baskets` · histogram(FE) `product_count` · table top tickets. Source `RETAIL_DW.FACT_TRANSACTIONS`.
**D11 — Conversion Funnel.** bar `event_count` by `funnel_step` ordonné · KPI conversion (formule côté FE). Source `EVENT_STORE.USER_ACTIVITY`.
**D12 — Cohort Retention.** heatmap(FE) `active_users` by `cohort_month` × `period` (deux `groupBy`). Source `MARKETING.COHORTS`.
**D13 — Product Mix Treemap.** treemap(FE) `revenue` by `category` + `subcategory` (groupBy[2]). Source `SALES.FACT_ORDER_LINES`.
**D14 — Churn Risk.** KPI `at_risk_count` (COUNT, filter `churn_score>=0.7`) · bar by `segment` · table at-risk. Source `CUSTOMER.CHURN_SCORES`.
**D15 — Supply Chain Lead Time.** KPI `avg_lead_days` (AVG) · bar by `supplier` · line over `ship_date`. Source `OPERATIONS.FACT_SHIPMENTS`.
**D16 — Web Analytics.** KPI `sessions` (COUNT) · area `pageviews` over `event_date` (stacked_area FE) · bar by `channel`. Source `MARKETING.WEB_EVENTS`.
**D17 — Budget vs Actual (waterfall).** waterfall(FE) `variance` by `cost_center` · KPI total variance. Source `FINANCE.BUDGET_ACTUAL`.
**D18 — Subscription MRR.** line `mrr` over `month` · KPI `mrr` (SUM, filter dernier mois) · bar new vs churned. Source `FINANCE.SUBSCRIPTIONS`.
**D19 — Geo Sales (scatter/bubble).** bubble(FE) `revenue` × `order_count` by `region` · table by region. Source `SALES.FACT_ORDERS`.
**D20 — Schema Auto-Dashboard.** `POST /bi-dashboard/auto-create {mode:'schema', database:'CP_DATA360', schema:'RETAIL_DW'}` → pages par domaine (Sales/Finance/Operations…), 8 widgets/page max (KPI+line+bar+table).

### 5.B — 2 dashboards Data Quality (thème reporting — sources réelles)

**DQ01 — Tendance qualité des données.** Source réelle `EVENT_STORE.DATA_QUALITY_RESULTS` (lue par `account_overview/snowflake_explorer/services/interactive.py:286,381`). ⚠ Colonnes ci-dessous **illustratives, non vérifié** (schéma de `DATA_QUALITY_RESULTS` non lu) :
- KPI taux de réussite : `ChartConfig{schema:'EVENT_STORE', table:'DATA_QUALITY_RESULTS', mode:'aggregate', measures:[{column:'PASSED', aggregator:'AVG'}]}`
- line résultats dans le temps : `x:'RUN_TS', measures:[{column:'PASSED', aggregator:'COUNT'}]`
- bar échecs par règle/table : `x:'RULE_NAME', measures:[{column:'FAILED', aggregator:'SUM'}], topN:{column:'FAILED', order:'DESC', limit:20}`

**DQ02 — Santé d'usage plateforme.** Source `EVENT_STORE.USER_ACTIVITY` via `GET /analytics/user-activity/summary?days=30`.
- bar success_rate par module (champ `module_stats[].success_rate`) · line activité quotidienne (`daily_activity[]`) · KPI `overall_success_rate` (champ `summary`).
> Aucun moteur DQ propre au module BI : ces 2 dashboards branchent des sources DQ existantes via `ChartConfig`/analytics.

### 5.bis — Fiche « ins / outs » des endpoints clés

> Tous `401` live (déployés, sans token). Test **fonctionnel authentifié** restant (pas de creds Snowflake) : un `401` prouve l'existence + l'auth requise, pas la logique métier ni une autorisation par rôle (le module n'en a aucune).

| Étape | Endpoint | INS (body · path · query) | OUTS (réponse consommée) |
|-------|----------|---------------------------|--------------------------|
| créer projet | `POST /bi-dashboard` | body `BIDashboardCreate{project_name*, description?, default_database?, default_schema?, tags?}` | `{project_id, project_name, project_type:'BI_DASHBOARD', status, created_by}` |
| charger design | `GET /bi-dashboard/{id}` | path `{id}` | `{project_id, pages[], widgets[{chart_id,page_id,widget_type,chart_type,title,chart_config,position…}], filters[]}` |
| ajouter page | `POST /{id}/pages` | path `{id}` · body `PageCreate{title*, layout='grid', page_order?}` | `{page_id, title, layout, page_order}` |
| ajouter widget | `POST /{id}/widgets` | path `{id}` · body `DashboardWidgetCreate{page_id*, widget_type, chart_type?, title?, chart_config?:ChartConfig, position_x/y, width, height, style?}` | `{chart_id, page_id, widget_type, chart_type, title, chart_config, …}` |
| données graphe | `POST /bi-dashboard/charts/data` | body `ChartConfig{database, schema, table*, mode, x?, measures[], filters[], groupBy[], topN?, limit?}` | `{config, query, data:[{…}]}` (+ `{col}_status` si seuils) |
| render batch | `POST /{id}/render` | path `{id}` · body `{widgets:[{widget_id, config:ChartConfig}]}` | `{widgets:[{widget_id, status:'ok'|'empty'|'config_mismatch'|'error', data, error, row_count}], summary:{ok,empty,errored,mismatched,total}}` |
| NL-to-chart | `POST /bi-dashboard/nl-to-chart` | body `{question*(≤500, no \n/backtick), database?='CP_DATA360', schema?='RETAIL_DW'}` | `{chart_config:ChartConfig|null, valid, validation_errors[], question, execution_time_ms}` |
| auto-create (table) | `POST /bi-dashboard/auto-create` | body `{mode:'table', table_fqn:'DB.SC.TBL'*, name?}` | `{dashboard_id, columns_analyzed, column_classification{date,numeric,category,high_cardinality}, cardinality, widgets_created, widgets[]}` |
| auto-create (schéma) | `POST /bi-dashboard/auto-create` | body `{mode:'schema', database*, schema*, name?}` | `{project_id, pages[{page_id,title}], widgets_created[], tables_classified{domain:[tables]}, domains[]}` |
| templates | `GET /bi-dashboard/templates` | — | `{templates[{id,name,widgets[],widget_count,chart_types[]}], count, total_widgets, source:'builtin'}` |
| retail-kpis | `GET /bi-dashboard/retail-kpis` | query `database?, schema?, days?(1-730, déf.365)` | `{roi_pct, margin_pct, revenue, cost, profit, by_subsidiary[], cross_sell_metrics[], cross_sell_summary{}, top_subsidiary}` |
| drill-through | `POST /{id}/drill-through` | path `{id}` · body `{widget_id*, dimension*, clicked_value, database?, schema?, table?, limit?(≤5000)}` | `{columns[], rows[{…}], total}` |
| snapshot | `POST /{id}/snapshot` | path `{id}` | `{version_id, version_number}` |
| coût | `GET /{id}/cost` | path `{id}` · query `days?(1-365, déf.90)` | `{cost:null, partial:true, attributable:false, render_activity{render_count,distinct_users,…}, widget_count, page_count, note}` |
| export | `GET /{id}/export` | path `{id}` | `{dashboard, pages, widgets, filters, exported_by, export_version}` (download JSON) |

## 6. UX front — validation 4 axes + accessibilité

> ⚠ Périmètre honnête : le FE BI est un **squelette** (2 pages). Les 4 axes ne s'appliquent qu'au peu qui existe.

| Axe | Verdict | Preuve (fichier:ligne) | Microcopy |
|-----|---------|------------------------|-----------|
| **loading** | ✓ (partiel) | liste : 3 skeletons `animate-pulse` (`page.tsx:185-193`) ; designer : skeleton fil d'Ariane + `RefreshCw animate-spin` + grille 6 skeletons (`[projectId]/page.tsx:100-107,122-127`) | — |
| **empty** | ✓ | liste : `EmptyState` « No BI Dashboard yet » + CTA (`page.tsx:16-39,297-299`) ; designer : `EmptyPage` « No widgets yet » + bouton Add Widget **non câblé** (`[projectId]/page.tsx:40-58`) | « Create project-based dashboards with charts, KPI cards… » |
| **error** | 🟡 | liste : catch **silencieux** → tombe en empty (`page.tsx:242-244`, pas de message) ; designer : 404 → « Dashboard not found. », autre → « Failed to load dashboard. » (`[projectId]/page.tsx:76-83,115-121`) ; create : « Failed to create dashboard. » générique (pas de `getApiErrorMessage`) | « Dashboard not found. » / « Failed to load dashboard. » |
| **dark mode** | ✓ | `dark:` présent partout (`bg-gray-950`, `bg-cyan-900/30`, bordures `dark:border-gray-800`) sur les 2 pages | — |

**Accessibilité** : champ NL et inputs ont `focus:ring-2` / `focus:outline-none` (`page.tsx:105`, `[projectId]/page.tsx:24`). ⚠ Boutons icônes (`Add Widget`, `Generate`) sans `aria-label` explicite ; bouton « Generate » `disabled={!question.trim()}` (conditionnel — actif dès qu'on tape) mais **sans `onClick`** → faux affordance (clic sans effet). `[trace: [projectId]/page.tsx:27]`. `ErrorBoundary` au niveau des 2 pages.

## 7. Drift détecté (vs slices + vs code)

1. **`/analytics/dashboard-usage` = 404 live.** La slice `analytics-kpis.md` liste 2 ops sous `/analytics` ; le code n'a qu'`/user-activity/summary`. `get_dashboard_usage` vit à `org_accounts/router.py:97` → `/org-accounts/dashboard-usage` (gate `require_module("account_overview")`). La slice sur-compte `/analytics`.
2. **Asymétrie backend/FE non visible dans les slices.** Les slices listent 25 ops `401` (toutes « live ») mais ne disent pas que 21/23 fonctions FE sont **non câblées**. Le statut « live (401) » ≠ « utilisable depuis l'UI ».
3. **Gouvernance absente.** Aucune slice ne signale que `/bi-dashboard` n'a **aucun** `require_module`/`require_action` (alors que `workflow` et `analytics` en ont). Le `401` masque l'absence d'autorisation par rôle.
4. **chart_type FE (19) ≠ réalité backend (opaque).** Le `chart_type` du modèle est un `VARCHAR(50)` libre, non validé contre l'union FE ; `build_and_execute_chart` est agnostique. « 19 types supportés » est une promesse FE non implémentée backend.
5. **`POST /charts/data` porte `@invalidates_cache(BI_DASHBOARDS)`** alors que c'est une **lecture** — invalide le cache BI à chaque appel de données (effet de bord ; possible cache thrashing). À vérifier (intentionnel ?).

## 8. Propositions d'amélioration UX (PROPOSITIONS — pas d'édition de code)

1. **Câbler le bouton « Generate » de la barre NL** sur `nlToChart(question, db, schema)` puis insérer le `chart_config` validé comme widget brouillon. Bénéfice : la trifecta « intelligence » devient réelle. Aujourd'hui = faux affordance (`disabled` permanent).
2. **Câbler « Add Widget »** sur une modale de config `ChartConfig` → `createWidget`. Sans ça, le designer ne peut rien construire.
3. **Surface l'auto-create dans l'UI** (entrée « From table / From schema ») branchée sur `autoCreateDashboard` — endpoint complet, 0 appelant. Bénéfice : valeur immédiate (un dashboard en 1 clic).
4. **Onglet Templates** branché sur `listTemplates` (déjà appelé hors module) avec « Use this template » → crée projet + widgets. [trivial-safe]
5. **Rendre les erreurs honnêtes** : remplacer le catch silencieux de la liste (`page.tsx:242`) par un état error visible ; utiliser `getApiErrorMessage` dans la modale create.
6. **Badge de gouvernance/visibilité** : afficher un avertissement « ce module n'applique pas de RBAC par projet » côté admin, tant que le gate n'est pas ajouté (cf. §gaps vault P0).
7. **Aligner `chart_type`** : restreindre l'`<select>` du futur config-widget à `DashboardChartType` et n'exposer que les types réellement dessinables par le FE (éviter de stocker un type non rendu).
8. **Drill-through** : câbler `drillThrough` sur le clic d'une barre/segment de chart (aujourd'hui seulement dans `api-contracts.ts`). [trivial-safe une fois le rendu de chart construit]

## 9. Plan de test fonctionnel

> Sans token → `401` sur les 25 ops (contrat auth vérifié 2026-06-09). Obtenir un JWT (login Data360) puis `-H "Authorization: Bearer $TOKEN"`. ⚠ Aucun rôle particulier requis (module sans `require_action`/`require_module`) — tout utilisateur authentifié passe. Test de l'**isolation par-projet** : tenter `GET/PUT/DELETE /{id}` sur un dashboard d'un AUTRE utilisateur → **attendu aujourd'hui : succès (gap P0)**, devrait être 403.

```bash
BASE=https://<host>        # ou http://localhost:8000
H="-H Authorization:Bearer $TOKEN -H Content-Type:application/json"

# 1. Créer un dashboard → {project_id}
PID=$(curl -s $H -X POST "$BASE/bi-dashboard" -d '{"project_name":"Test BI","default_database":"CP_DATA360","default_schema":"RETAIL_DW"}' | jq -r .project_id)

# 2. Lister pages (1 créée par défaut) → page_id
PAGE=$(curl -s $H "$BASE/bi-dashboard/$PID/pages" | jq -r '.pages[0].page_id')

# 3. Ajouter un widget chart (ChartConfig réel)
curl -s $H -X POST "$BASE/bi-dashboard/$PID/widgets" -d "{
  \"page_id\":\"$PAGE\",\"widget_type\":\"chart\",\"chart_type\":\"bar\",\"title\":\"Revenue by store\",
  \"chart_config\":{\"database\":\"CP_DATA360\",\"schema\":\"RETAIL_DW\",\"table\":\"FACT_FINANCE\",
    \"mode\":\"aggregate\",\"x\":\"COD_MAGASIN\",
    \"measures\":[{\"column\":\"TOTAL_REVENUE\",\"aggregator\":\"SUM\"}],
    \"topN\":{\"column\":\"TOTAL_REVENUE\",\"order\":\"DESC\",\"limit\":10}}}"

# 4. Données d'un graphe (sans persister un widget)
curl -s $H -X POST "$BASE/bi-dashboard/charts/data" -d '{
  "database":"CP_DATA360","schema":"RETAIL_DW","table":"FACT_FINANCE",
  "mode":"aggregate","x":"COD_MAGASIN",
  "measures":[{"column":"TOTAL_PROFIT","aggregator":"SUM"}]}'   # → {config, query, data[]}

# 5. Render batch
curl -s $H -X POST "$BASE/bi-dashboard/$PID/render" -d '{"widgets":[{"widget_id":"w1","config":{"database":"CP_DATA360","schema":"RETAIL_DW","table":"FACT_FINANCE","mode":"aggregate","measures":[{"column":"TOTAL_REVENUE","aggregator":"SUM"}]}}]}'

# 6. NL-to-chart (Cortex)
curl -s $H -X POST "$BASE/bi-dashboard/nl-to-chart" -d '{"question":"Show total revenue by store","database":"CP_DATA360","schema":"RETAIL_DW"}'

# 7. Auto-create depuis un schéma (pages par domaine)
curl -s $H -X POST "$BASE/bi-dashboard/auto-create" -d '{"mode":"schema","database":"CP_DATA360","schema":"RETAIL_DW"}'

# 8. Templates / retail-kpis
curl -s $H "$BASE/bi-dashboard/templates"
curl -s $H "$BASE/bi-dashboard/retail-kpis?days=365"

# 9. Snapshot + export
curl -s $H -X POST "$BASE/bi-dashboard/$PID/snapshot"
curl -s $H "$BASE/bi-dashboard/$PID/export" -o dashboard_$PID.json

# 10. Coût (honest-partial → cost:null)
curl -s $H "$BASE/bi-dashboard/$PID/cost?days=90"
```

**Résultats attendus par capacité :**
- Sans token → `401` sur les 25 ops.
- `charts/data` avec un aggregator hors whitelist (ex. `FOO`) → **400** `Unsupported aggregator` (Pydantic).
- `charts/data` sur table/colonne inexistante → erreur classée `config_mismatch` (render) ou 400 (charts/data).
- `nl-to-chart` avec `\n`/backtick dans `question` → **400** (sanitize prompt-injection).
- `auto-create` schéma vide / sans table → **404** `No tables found`.
- `cost` → toujours `{cost:null, partial:true}` (pas de QUERY_TAG) + télémétrie `render_activity`.
- `/analytics/dashboard-usage` → **404** (utiliser `/org-accounts/dashboard-usage` à la place).
- **Test gouvernance (gap P0)** : accéder à un dashboard d'autrui par ID → succès aujourd'hui ; devrait être 403/404.

> Renvoi : matrice gouvernance complète, Data Access Map, et le différentiel cache/SSE sont dans le vault `data360_full_doc/pages/bi-reporting.md` (§Gouvernance, §Gaps, §Enrichissement 2026-06-09).

> Vérifié 2026-06-09 : 26 endpoints vérifiés vs slices de référence (tous présents, 0 inventé). 1 correction : bouton « Generate » `disabled={!question.trim()}` (conditionnel, non permanent). Live-retest 6 endpoints OK : nl-to-chart 401, retail-kpis 401, auto-create 401, templates 401, user-activity/summary 401, dashboard-usage 404 (dérive confirmée). 4 claims UI vérifiés (lignes réelles). Aucun secret/IP exposé dans ce fichier skills. VERDICT : GROUNDED.
