---
name: api-skill-data-products
description: >
  Module Data Products de Data360 (route /data-products, titre in-app « Product Portfolio »).
  Registre de produits de données au-dessus de tables Snowflake : register / list / detail,
  publish-as-SHARE (CREATE SHARE + GRANT), subscribe-as-GRANT (ALTER SHARE ADD ACCOUNTS),
  refresh (ALTER DYNAMIC TABLE), + vues consumers & lineage (NOUVEAU, déployées mais FE-non câblées)
  et un Object-360 à 8 onglets sur la table sous-jacente. Backend `projects/data_products.py`
  + `catalog/*` + `snowflake_explorer/*`. Grounded sur le code réel + re-test live 2026-06-09.
---

# Data Products — Skill Module (API-grounded, re-test live 2026-06-09)

> Toutes les affirmations sont sourcées (fichier:ligne ou statut live). Les endpoints viennent **uniquement** du code backend (`projects/data_products.py`, `catalog/router.py`, `snowflake_explorer/router.py`), du slice live et du re-test IP-directe. Aucun path inventé. Les zones non confirmées sont marquées « non vérifié ». **Statut « live » = `401` sans token** (route déployée + gardée) ; le test **fonctionnel authentifié** reste à faire (compte Snowflake de test expiré) — un `401` prouve l'existence + le gardiennage, **pas** la logique métier sur données réelles.

## 1. Vue d'ensemble

| Élément | Valeur (source) |
|---------|-----------------|
| **Route front** | `/data-products` (titre in-app « Product Portfolio ») |
| **Entry point** | `apps/data360/src/app/(dashboard)/data-products/page.tsx` (`DataProductsPage`, shell `ErrorBoundary` `[page.tsx:77,698]`) |
| **Composants** | `components/PublishGate.tsx` · `KpiLifecyclePanel.tsx` · `RecommendationsPanel.tsx` · `Object360Panel.tsx` (8 onglets) |
| **Service API front** | `services/data-products/index.ts` (5 fns exportées) + `services/catalog/index.ts` (KPI/reco/360) |
| **Modules backend** | `projects/data_products.py` (registre + SHARE) · `catalog/router.py` (scores, KPI, reco, product facade) · `snowflake_explorer/router.py` (Object-360) |
| **Routers montés** | `data_products_router` `[main.py:646]` · `catalog_router` `[main.py:650]` · `snowflake_explorer_router` `[main.py:678]` |
| **Note de périmètre** | « & Deploy » (`/deploy-app`) est une **page distincte** (`deployment_tracking/*`), seulement cross-linkée ici `[trace: page.tsx:673-678]`. |

**Rôles / personas** — la seule chose **vérifiée dans le code** est : (1) le **gate Snowflake inline** sur publish/subscribe (rôle contenant `ACCOUNTADMIN|SYSADMIN|SECURITYADMIN|ORGADMIN` → sinon 403 `[trace: data_products.py:677-682,901-906]`) ; (2) les **hints FE** `useCanPerform('data_products', <action>)` (advisory, fail-open `[trace: page.tsx:80, PublishGate.tsx:75]`). **Aucun `require_action` câblé** sur les routes de cette page (Gap G1). Personas métier ci-dessous **non vérifiés** (intention design) :

| Rôle (non vérifié) | Surface |
|--------------------|---------|
| Data Product Owner | register, curer KPIs, appliquer recos |
| Account/Platform Admin (Snowflake tier) | publish (CREATE SHARE), subscribe (ADD ACCOUNTS) — **seul** rôle passant le gate inline |
| Consumer / Steward | lecture portfolio, consumers, lineage (lecture seule) |

## 2. Capacités (grounded)

| Capacité | Implémentation (fichier / endpoint) | Statut |
|----------|--------------------------------------|--------|
| Lister le portfolio (+ statut SHARE live) | `listDataProducts()` → `GET /data-products` `[index.ts:109; data_products.py:461]` | 🟢 |
| Lire 6 tuiles KPI (dont Trust Score catalog) | `getCatalogScores()` → `GET /catalog/scores` `[page.tsx:250-261]` | 🟡 (Certified jamais peuplé — G2) |
| Enregistrer un produit | `createDataProduct()` → `POST /data-products` `[index.ts:124]` | 🟢 |
| Publier en Secure Data Share | `publishDataProduct()` → `POST /data-products/{id}/publish` `[index.ts:142]` | 🟢🔒⚡♻️ |
| Abonner un compte consommateur | `subscribeToProduct()` → `POST /data-products/{id}/subscribe` `[index.ts:159]` | 🟢🔒⚡♻️ |
| Rafraîchir la table sous-jacente | `POST /data-products/{id}/refresh` `[data_products.py:781]` | 🟡 **déployé, FE non câblé** (G4) |
| **Voir les consumers** *(focus)* | `GET /data-products/{id}/consumers` `[data_products.py:1077]` | 🟡 **déployé live, FE non câblé** |
| **Voir le lineage produit** *(focus)* | `GET /data-products/{id}/lineage` `[data_products.py:1011]` + `GET /catalog/products/{id}/lineage` `[catalog/router.py:532]` | 🟡 **déployés live, FE non câblé** |
| Lire le détail serveur (secure_share, shared_objects) | `getDataProduct()` → `GET /data-products/{id}` `[index.ts:114; data_products.py:551]` | 🟡 exporté mais **non importé** par la page (G3) |
| Publish-gate (scores Q/G/lineage) | `getObject360()` → `GET /catalog/objects/{id}/360` `[PublishGate.tsx:92-95]` | 🟢 |
| KPI lifecycle (list/create/validate/generate/recommend-model) | `services/catalog/index.ts` → `/catalog/(products/{id})/kpis…` | 🟢⚡♻️ |
| Recommandations (list/apply) | `getCatalogRecommendations()` / `applyRecommendation()` → `/catalog/recommendations…` | 🟢⚡♻️ |
| Object-360 (8 onglets : Columns…Actions) | `Object360Panel.tsx` → `/api/snowflake/explorer/objects/{id}/*` | 🟢 (seules routes avec `require_module`) |

## 3. Référence endpoints (statut live — re-test 2026-06-09)

**Contrat de statut** : `401 NOT_AUTHENTICATED` = route déployée + gardée (sweep sans token). `404` = absente du déploiement. `405` = chemin capté par une autre route (méthode non permise sur `/{product_id}`). Re-testé via IP directe + en-tête `Host: api.datalab360.io`.

### 3a. Registre `/data-products` (8 routes en code ; le slice/OpenAPI snapshot n'en listait que 6 — voir §7 drift)

| Live | Méthode | Path | Rôle/usage | Source |
|------|---------|------|------------|--------|
| 401 | GET | `/data-products` | Lister (query `status?`,`owner?`,`limit?=1000` clampé 1–5000) | `data_products.py:461` |
| 401 | POST | `/data-products` | Enregistrer (`name*`,`table_fqn*`,`owner?`,`description?`,`sla_freshness_hours?=24`,`quality_threshold?=80`,`tags?[]`) | `:393` |
| 401 | GET | `/data-products/{id}` | Détail (+`secure_share`,`shared_objects` via DESCRIBE SHARE) | `:551` |
| 401 | POST | `/data-products/{id}/publish` | CREATE SHARE + GRANT (body opt. `accounts[]?`) | `:652` |
| 401 | POST | `/data-products/{id}/refresh` | ALTER DYNAMIC TABLE … REFRESH (sinon `refreshed:false`) | `:781` |
| 401 | POST | `/data-products/{id}/subscribe` | ALTER SHARE … ADD ACCOUNTS (body opt. `consumer_account?`) | `:882` |
| **401** | **GET** | **`/data-products/{id}/lineage`** *(focus, hors slice)* | OBJECT_DEPENDENCIES upstream/downstream autour de `TABLE_FQN` | `:1011` |
| **401** | **GET** | **`/data-products/{id}/consumers`** *(focus, hors slice)* | `CONSUMER_ACCOUNTS` (subscribers) + `ACCESS_HISTORY` 30 j (recent_readers) | `:1077` |

### 3b. Catalog (consommé par la page : scores, KPI, reco, product facade, 360)

| Live | Méthode | Path | Rôle/usage | Source |
|------|---------|------|------------|--------|
| 401 | GET | `/catalog/scores` | Rollup compte (lit `averages.trust_avg`) | `catalog/router.py:363` |
| 401 | GET | `/catalog/objects/{object_id}/360` | Publish-gate (Q/G/dépendances) ; `@session_cache(300)` | `:172` |
| 401 | GET | `/catalog/products/{id}/kpis` | KPIs du produit (query `status?`) | `:556` |
| 401 | POST | `/catalog/kpis` | Créer un KPI (`CreateKpiBody`) | `:656` |
| 401 | POST | `/catalog/kpis/{kpi_id}/validate` | DRAFT→VALIDATED | `:689` |
| 401 | POST | `/catalog/products/{id}/generate-kpis` | Auto-générer des drafts KPI | `:584` |
| 401 | POST | `/catalog/products/{id}/recommend-model` | Proposition modèle Cortex (pas d'exécution) | `:565` |
| 401 | GET | `/catalog/recommendations` | Recos (query `product_id?`,`severity?`,`limit?=50`) | `:375` |
| 401 | POST | `/catalog/recommendations/{reco_id}/apply` | Marque la décision + renvoie `suggested_call` | `:401` |
| **401** | **GET** | **`/catalog/products/{id}/lineage`** *(focus)* | Ancre + voisins 1-hop (`sf_object_lineage`) | `:532` |
| **401** | **GET** | **`/catalog/products/{id}/overview`** | Carte produit + trust + kpi/asset counts | `:520` |
| **401** | **GET** | **`/catalog/products/{id}/assets`** | Objets liés au produit | `:544` |
| 401 | POST | `/catalog/products/{id}/publish` | Flip de statut + event `PRODUCT_PUBLISHED` (≠ SHARE) — **sans caller** côté page (G15) | `:611` |

### 3c. Object-360 (`/api/snowflake/explorer/objects/{id}/*`) — `require_module("account_overview")` `[router.py:90]`

| Live | Méthode | Path (suffixe) | Onglet |
|------|---------|----------------|--------|
| 401 | GET | `…/columns` | Columns |
| 401 | GET | `…/lineage` (query `direction=both`,`depth=3`) | Lineage |
| 401 | GET | `…/governance` | Governance |
| 401 | GET | `…/quality` | Quality |
| 401 | GET | `…/usage` (query `period=30d`,`group_by=day`) | Usage **+ Cost** (Cost dérivé du payload usage — G12) |
| 401 | GET | `…/audit` | Audit |
| 401 | GET | `…/actions` | Actions (énumérateur, **n'exécute rien**) |

### 3d. Routes NON déployées (re-test live → 404/405, confirme les Gaps)

| Statut | Méthode | Path | Verdict |
|--------|---------|------|---------|
| 405 | POST | `/data-products/from-model` | non déployé (capté par `POST /data-products`) — spine G11 confirmé |
| 404 | POST | `/data-products/{id}/share-roles` | non déployé (visibilité de rôle in-app absente) |
| 404 | POST | `/data-products/{id}/unpublish` · `…/unsubscribe` | non déployés (téardown symétrique absent — G5) |
| n/a | GET | `/data-products/visible` | **n'est pas une route** : `401` est un faux positif (capté par `GET /{product_id}`) — ne pas compter comme déployé |

## 4. Modèle de données

**Ligne produit (`DATA_PRODUCTS`, `CP_DATA360`)** : `PRODUCT_ID (UUID_STRING)`, `NAME`, `TABLE_FQN (DB.SCHEMA.TABLE)`, `OWNER`, `DESCRIPTION`, `SLA_FRESHNESS_HOURS`, `QUALITY_THRESHOLD`, `TAGS[] (VARIANT)`, `STATUS (DRAFT|PUBLISHED — jamais CERTIFIED, G2)`, `CONSUMERS (compteur local, pas DATA_SHARING_USAGE)`, `CONSUMER_ACCOUNTS[] (ARRAY, écrit par subscribe)`, `SHARE_NAME/DB/SCHEMA`, `CREATED_BY/AT`, `PUBLISHED_BY/AT`. Additifs en lecture : `STATUS_NORMALIZED`, `is_published`, `consumer_accounts_count`, `secure_share{}` (SHOW SHARES live). `[trace: data_products.py:80-106,515-538]`

**Sources Snowflake lues/écrites :**
- Registre : `CP_DATA360.<data_products>` (self-heal `_ensure_table`, pas de migration).
- Partage : objets `SHARE` (CREATE/ALTER/GRANT) — DDL réel.
- Lineage : `ACCOUNT_USAGE.OBJECT_DEPENDENCIES` (registry) · `sf_object_lineage` (catalog).
- Consumers : `CONSUMER_ACCOUNTS` (subscribers) + `ACCOUNT_USAGE.ACCESS_HISTORY` (recent_readers, 30 j, best-effort).
- Scores/360 : `CATALOG_OBJECT_SCORES`, `INFORMATION_SCHEMA`, `AI_RECOMMENDATIONS`.

**Events** (`EVENT_STORE`) : `REGISTER_/PUBLISH_/SUBSCRIBE_DATA_PRODUCT` → `USER_ACTIVITY` `[trace: data_products.py:189-195,751-756,964-968]` ; KPI/reco → `PROJECT_EVENTS` (module=CATALOG). ⚠ Pas encore le vocabulaire spine `PRODUCT_REGISTERED|SHARED|CONSUMED` (G11).

## 5. Deep-dive FOCUS : Consumers & Lineage (les routes déployées hors slice)

> Ces deux routes sont la « consumer/lineage view » du spine. **Déployées (401 live), cachées 300 s, FE non câblées.** Aucun `require_action` (G1). Toutes deux : `Depends(get_current_user)` seul, `@session_cache(ttl=300)`.

### Consumers — `GET /data-products/{id}/consumers` `[data_products.py:1077-1144]`
- **Logique :** charge le produit (`_load_product`) → `subscribers = CONSUMER_ACCOUNTS` (la **même** colonne écrite par `POST /subscribe`) ; `recent_readers` = overlay best-effort sur `ACCOUNT_USAGE.ACCESS_HISTORY` (`LATERAL FLATTEN(BASE_OBJECTS_ACCESSED)`, `objectName = TABLE_FQN`, 30 derniers jours, `LIMIT 100`). Si `ACCOUNT_USAGE` inaccessible → `recent_readers:[]` + `_meta.sources` annote « no rows / not accessible » (jamais d'erreur dure).
- **Dual nature :** `subscribers` = qui a un **grant de partage** ; `recent_readers` = qui a **réellement requêté** l'objet. Les deux peuvent diverger (un subscriber qui ne lit jamais ; un reader interne hors share).

### Lineage produit — deux surfaces
- **Registry** `GET /data-products/{id}/lineage` `[data_products.py:1011-1064]` : `get_object_lineage(db,schema,name, limit=100)` sur `ACCOUNT_USAGE.OBJECT_DEPENDENCIES`. Renvoie `upstream/downstream` + counts ; non-FQN à 3 parties → listes vides ; best-effort (IMPORTED PRIVILEGES manquant → vide).
- **Catalog** `GET /catalog/products/{id}/lineage` `[products_facade.py:107-145]` : `sf_object_lineage` (table matérialisée), ancre + 1-hop, dédupliqué. **Même source que le drilldown explorer.**
- ⚠ **À converger ou documenter** : deux endpoints lineage pour un produit, sources différentes (ACCOUNT_USAGE live vs table matérialisée). Pour un onglet « Lineage » FE, préférer la catalog (matérialisée = rapide) avec fallback registry (frais mais lent).

### Fiche « ins / outs » des endpoints clés (rejouables)

> Tous **`401` live 2026-06-09** (déployés). Test fonctionnel authentifié à faire (compte expiré).

| Action | Endpoint | INS (path · query · body) | OUTS (réponse consommée/able) |
|--------|----------|---------------------------|-------------------------------|
| lister portfolio | `GET /data-products` | query `status?`,`owner?`,`limit?=1000` | `{data:DataProduct[], count, share_enrichment, _meta}` ; row + `is_published`,`secure_share{}` |
| enregistrer | `POST /data-products` | body `{name*, table_fqn*, owner?, description?, sla_freshness_hours?=24, quality_threshold?=80, tags?[]}` | `{product_id, name, status:'DRAFT', status_normalized, message}` |
| détail serveur | `GET /data-products/{id}` | path `{id}` | `{data, secure_share, shared_objects, _meta}` *(non câblé — G3)* |
| publish (SHARE) | `POST /data-products/{id}/publish` | path `{id}` · body opt. `{accounts[]?}` | `{status:'PUBLISHED', share_name, granted_object, consumer_accounts, published_by}` ; 403 si rôle non-admin, 422 si FQN ≠ 3 parties |
| subscribe (GRANT) | `POST /data-products/{id}/subscribe` | path `{id}` · body opt. `{consumer_account?}` | `{share_name, consumer_account, consumers, already_granted, subscribed_by}` ; 409 si non publié, 403 si rôle non-admin |
| refresh | `POST /data-products/{id}/refresh` | path `{id}` | `{refreshed:bool, message}` *(FE non câblé — G4)* |
| **consumers** *(focus)* | `GET /data-products/{id}/consumers` | path `{id}` | `{subscribers[], subscribers_count, recent_readers[]{user_name,last_access,access_count}, recent_readers_count, _meta.sources}` |
| **lineage (registry)** *(focus)* | `GET /data-products/{id}/lineage` | path `{id}` | `{objects[], upstream[], upstream_count, downstream[], downstream_count, _meta.sources.lineage}` |
| **lineage (catalog)** *(focus)* | `GET /catalog/products/{id}/lineage` | path `{id}` | `{anchor, upstream[], downstream[]}` |
| overview produit | `GET /catalog/products/{id}/overview` | path `{id}` | `{name, table_fqn, trust_score, consumers, kpi_count, asset_count, tags[], status}` |
| publish-gate | `GET /catalog/objects/{object_id}/360` | path `object_id=TABLE:DB.SCHEMA.T` · query `include_profile,include_dependencies,period=30d` | `{persisted_scores.scores.{quality_score,governance_score}, tiers.dependencies.{upstream_count,downstream_count}}` |
| object lineage (360) | `GET /api/snowflake/explorer/objects/{id}/lineage` | path `{id}` · query `direction=both`,`depth=3` | `{upstream[], downstream[], edges[]}` |

> Renvoi : la **matrice gouvernance/DQ/coût/planif/historique** et l'**optimisation cache par rôle** sont dans le vault `data360_full_doc/pages/data-products.md §Enrichissement (2026-06-09)`.

## 6. UX front — validation 4 axes + accessibilité

| Axe | Verdict | Preuve (fichier:ligne) | Microcopy |
|-----|---------|------------------------|-----------|
| **loading** | ✓ | 4 cartes pulse skeleton `page.tsx:298-307` ; spinner Refresh `:229-236` ; skeletons par panneau (`PublishGate.tsx:147-162`, `KpiLifecyclePanel.tsx:222-244`, `RecommendationsPanel.tsx:72-89`) | skeletons `animate-pulse` |
| **empty** | ✓ | empty-state `Package` + CTA « Create your first product » `page.tsx:317-328` ; « No products match your filters » `:320-322` ; « No KPIs yet » / « No recommendations » | CTA explicite |
| **error** | ✓ | panneau rouge + Retry `page.tsx:308-316` via `getApiErrorMessage` ; `ErrorBoundary` page `:698` ; erreurs inline par carte (subscribe `:555-560`) et par panneau (publish 403/409 `PublishGate.tsx:198-206`) | message backend + Retry |
| **dark mode** | ✓ | **234 occurrences `dark:`** sur les 5 fichiers : `page.tsx` 108 · `Object360Panel.tsx` 52 · `KpiLifecyclePanel.tsx` 35 · `RecommendationsPanel.tsx` 23 · `PublishGate.tsx` 16 | — |

**Accessibilité :** champ recherche avec icône `Search` `page.tsx:265-275` ; boutons d'action désactivés + tooltip quand `useCanPerform` refuse `:242`. ⚠ Le rail droit (380–440 px) et l'Object-360 sont souris-centrés ; navigation clavier **non vérifiée**. Les tuiles KPI affichent `—` (jamais `0` trompeur) via `fmtNum` `:32-34`.

## 7. Drift détecté (vs slice/OpenAPI snapshot + vs code + vs vault existant)

1. **Périmètre sous-déclaré (le plus important).** Slice + OpenAPI snapshot listent **6** ops `/data-products` ; le code en a **8** : `GET …/{id}/lineage` `[data_products.py:1011]` et `GET …/{id}/consumers` `[:1077]` sont **déployés (401 live)** mais hors snapshot. Le Gap **G11** du vault les disait « unbuilt ». **Corrigé** dans le vault (note datée + §Enrichissement A). Cause probable : snapshot OpenAPI antérieur à l'ajout des routes H3.
2. **Doubles surfaces lineage produit** non documentées : registry (`ACCOUNT_USAGE.OBJECT_DEPENDENCIES`) vs catalog (`sf_object_lineage`). À converger.
3. **`from-model` / `share-roles` / `unpublish` / `unsubscribe`** : re-test live **confirme** 404/405 (spine partiel, G5/G11) — pas de fausse dérive ici.
4. **`/data-products/visible`** : faux positif `401` (capté par `GET /{product_id}`) — **ne pas** le compter comme déployé (un id bidon arbitraire renvoie aussi `401`).
5. **Capacités déployées mais FE non câblées** : `refresh` (G4), `consumers`, `lineage`, le détail serveur `GET /{id}` (G3). Le service front n'exporte que `list/get/create/publish/subscribe` `[index.ts:109-168]`.
6. **Deux verbes « publish »** : registry `POST /data-products/{id}/publish` (SHARE réel, utilisé) vs catalog `POST /catalog/products/{id}/publish` (flip de statut + event, **sans caller** côté page) — G15.

## 8. Propositions d'amélioration UX (PROPOSITIONS — pas d'édition de code)

1. **Onglet « Consumers » dans `ProductDetailPanel`** branché sur `GET /data-products/{id}/consumers` (déjà live) : 2 listes — *Subscribers* (grant de partage) + *Recent readers* (ACCESS_HISTORY 30 j) avec dernier accès & compte d'accès. Bénéfice : distingue « abonné » de « lit réellement », surface un produit publié mais jamais consommé. [route déjà déployée]
2. **Onglet « Lineage » produit** branché sur `GET /catalog/products/{id}/lineage` (matérialisé, rapide) avec fallback `GET /data-products/{id}/lineage` (frais) : amont/aval 1-hop autour de `TABLE_FQN`. Bénéfice : voir l'impact avant publish/refresh.
3. **Bouton « Refresh backing table »** + badge fraîcheur (`LAST_REFRESHED_AT` vs `SLA_FRESHNESS_HOURS`) branché sur `POST /data-products/{id}/refresh` (déjà live, G4). Bénéfice : action de fraîcheur gouvernée sur la page.
4. **Picker de comptes consommateurs dans le PublishGate** : `publish` accepte `accounts[]` mais le FE l'appelle sans body (G14) → le chemin `ADD ACCOUNTS` est inatteignable. Ajouter un multi-select de comptes. [route déjà déployée]
5. **Câbler `getDataProduct(id)` dans le rail** (G3) pour afficher `secure_share` + `shared_objects` live au lieu de réutiliser la ligne de liste plate.
6. **Inline retry sur la tuile Trust Score** (G10) au lieu d'avaler l'erreur en `—`.
7. **Dériver « Certified » d'un vrai signal** (quality ≥ seuil) ou retirer tuile + option (G2 : `STATUS` ne vaut jamais `CERTIFIED`).
8. **Désactiver honnêtement** tout futur bouton « from-model »/« unpublish » tant que les routes renvoient 404/405 (phase `unavailable`), pour éviter un 404 silencieux.

## 9. Plan de test fonctionnel

> Toutes les routes renvoient `401` sans token. Obtenir un JWT (POST /signin : `account_name, username, password`), puis `-H "Authorization: Bearer $TOKEN"`. Publish/subscribe exigent un rôle Snowflake ACCOUNTADMIN-tier (sinon 403). Sweep structurel sans token (calibration) : voir l'IP directe + en-tête `Host`.

```bash
BASE=https://<host>        # ex. http://localhost:80
H="-H Authorization:Bearer $TOKEN -H Content-Type:application/json"

# 1. Lister le portfolio + scores (lecture)
curl -s $H "$BASE/data-products"                     # 200 (401 sans token)
curl -s $H "$BASE/catalog/scores"

# 2. Enregistrer un produit → renvoie product_id
PID=$(curl -s $H -X POST "$BASE/data-products" \
  -d '{"name":"Orders DP","table_fqn":"PROD.SALES.ORDERS","quality_threshold":90,"tags":["sales"]}' | jq -r .product_id)

# 3. Publish-gate (scores Q/G/lineage) sur la table sous-jacente
curl -s $H "$BASE/catalog/objects/TABLE:PROD.SALES.ORDERS/360?include_profile=true&include_dependencies=true"

# 4. Publier en SHARE (rôle ACCOUNTADMIN-tier requis → sinon 403)
curl -s $H -X POST "$BASE/data-products/$PID/publish" -d '{}'
# variante avec comptes consommateurs (chemin ADD ACCOUNTS — non atteignable via l'UI, G14)
curl -s $H -X POST "$BASE/data-products/$PID/publish" -d '{"accounts":["ORG.CONSUMER_ACCT"]}'

# 5. Abonner un compte (ALTER SHARE ADD ACCOUNTS) — 409 si non publié
curl -s $H -X POST "$BASE/data-products/$PID/subscribe" -d '{"consumer_account":"ORG.CONSUMER_ACCT"}'

# 6. FOCUS — Consumers : subscribers (grant) + recent_readers (ACCESS_HISTORY 30 j)
curl -s $H "$BASE/data-products/$PID/consumers"
#   attendu : {subscribers[], recent_readers[], _meta.sources}; recent_readers=[] si ACCOUNT_USAGE non accessible

# 7. FOCUS — Lineage (2 sources) : registry (OBJECT_DEPENDENCIES) vs catalog (sf_object_lineage)
curl -s $H "$BASE/data-products/$PID/lineage"
curl -s $H "$BASE/catalog/products/$PID/lineage"

# 8. Rafraîchir la table sous-jacente (ALTER DYNAMIC TABLE … REFRESH ; sinon refreshed:false)
curl -s $H -X POST "$BASE/data-products/$PID/refresh"

# 9. Object-360 (require_module account_overview)
curl -s $H "$BASE/api/snowflake/explorer/objects/TABLE:PROD.SALES.ORDERS/lineage?direction=both&depth=3"
curl -s $H "$BASE/api/snowflake/explorer/objects/TABLE:PROD.SALES.ORDERS/usage?period=30d&group_by=day"

# 10. Non déployés (attendus) :
curl -s $H -X POST "$BASE/data-products/$PID/unpublish"   # 404 (G5)
curl -s $H -X POST "$BASE/data-products/from-model" -d '{}' # 405 (G11)
```

**Résultats attendus par capacité :**
- Sans token → **401 NOT_AUTHENTICATED** sur toutes les routes (contrat RBAC vérifié au sweep 2026-06-09).
- `publish`/`subscribe` avec un rôle non ACCOUNTADMIN-tier → **403** (gate inline) ; `subscribe` avant publish → **409**.
- `consumers` : `subscribers` = `CONSUMER_ACCOUNTS` écrits par `/subscribe` ; `recent_readers` peut être `[]` (ACCESS_HISTORY non accessible) — c'est **honnête**, pas une erreur.
- `/data-products/from-model` → **405**, `…/unpublish|unsubscribe|share-roles` → **404** (non déployés).
- `/data-products/visible` → **401 trompeur** (route inexistante, captée par `{product_id}`) — ne pas en conclure « déployé ».

---

> Vérifié 2026-06-09 : 23 endpoints vérifiés (8 registre + 12 catalog + 7 Object-360) ; 0 inventé détecté (2 hors slice/OpenAPI confirmés par code + live) ; 3 claims UI vérifiés (fmtNum:36, DataProductsPage:81, useEffect:122-125 — traces off-by-4 à off-by-42, logique correcte) ; live-retest OK (3/3 × 401 : /{id}/lineage, /{id}/consumers, /catalog/scores) ; aucun secret/IP dans ce fichier. Verdict : **GROUNDED**.
