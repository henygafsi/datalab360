# Audit perf + barres + scalabilité (SVC/cache/events/tracing) — 2026-06-29

> Réalisé contre la **stack locale fonctionnelle** (front :3000 + backend :8000, clé SVC valide → vraie donnée HAHA). 3 volets : (A) KPIs perf/réseau par page, (B) barres gauche/droite, (C) architecture scalable SVC/cache/invalidation/events/tracing + reco. Read-only.

---
## A. KPIs PERF — temps de réponse & queries par page (Playwright, login HAHA)
Données : `e2e/results/perf/timings.json`.

| Page | Queries | p50 latence | Note |
|---|---|---|---|
| `/sources` | **35** | 4 ms | ⚠ trop de queries |
| `/account-overview` | **22** | 105 ms | ⚠ trop de queries |
| `/client-accounts` | **21** | 198 ms | ⚠ trop de queries |
| `/governance/policies` | 16 | 168 ms | élevé |
| `/bi-dashboard` | 15 | 122 ms | élevé |
| costGov / observability / data-quality / explore / workflow… | 7–13 | 110–180 ms | ok |
| **Moyenne** | **14 / page** | **~127 ms (médian)** | |

**Findings :**
1. ✅ **La latence par query est bonne** (~127 ms p50) — aucune query réellement lente.
2. ⚠️ **Le vrai axe perf = le NOMBRE de queries/page** (jusqu'à 35). Beaucoup de pages font 15–35 appels granulaires là où un endpoint consolidé suffirait.
3. **`/cache-stream/stream` (SSE) apparaît "lent" (2.5–12 s) mais c'est la connexion persistante** d'invalidation temps-réel, **pas une latence** (1 par page) — exclue des KPIs.
4. **Levier #1** : l'endpoint consolidé **`/command-center/tabs/{tab}` existe mais est mort** (cf. audit fonctionnel) → l'utiliser ramènerait account-overview de **22 → 1 query**. Idem un endpoint catalogue groupé pour `/sources` (35 queries).

---
## B. BARRES gauche / droite

### Barre GAUCHE (sidebar `carbon-sidebar`)
- **Modèle de gating** : pas de `useCanPerform` ni flag `visible` ; `allowedIds` = (admin → 14 ids) sinon `session.items`. Items non autorisés **rendus mais grisés** (`pointer-events-none`) — accès = désactivation visuelle seulement. **Aucun endpoint fetché** (pas de badge data-driven, pas de project context).
- **🔴 Issues sécurité/fonctionnelles :**
  1. **Set de rôles admin-bypass faux** (`carbon-sidebar.tsx:43`) : `administrator/modeler/accountadmin/sysadmin` — **omet SECURITYADMIN**, ajoute des rôles non-canoniques.
  2. **Administration gatée par le module générique `dashboard`** (id 11) → tout non-admin ayant `dashboard` obtient le flyout admin complet (platform health, performance, feature-gov, access-center). Devrait être admin-role-only.
  3. **AI Intelligence active-state cassé** : hrefs `?tab=…` comparés à `usePathname()` (qui strippe la query) → ne matche jamais.
  4. **Noms hardcodés divergent de `MODULES[].name`** (règle marque) : "BI Dashboard" vs `Business Reporting`, "Data Quality" vs `Data Health`, "Administration" vs `Dashboard`.
  5. **Hrefs hardcodés hors `routes.ts`** : `/data-source-config`, `/administration/feature-governance`, `/administration/access-center`.
  6. **Desktop (carbon) vs mobile (hydrogen) = 2 menus distincts** → drift possible. + `console.log` du rôle/items en prod à chaque render. + `_DROPPED.md` liste `bi-dashboard` comme retiré alors qu'il est actif. + dead code (`NestedDropdown`/`subMenuItems`).

### Barre DROITE (panneaux contextuels)
- **🔴 La SmartRightBar canonique 8-sections spec'd N'A JAMAIS été construite.** À la place : **6 familles divergentes** sur le primitive `RightTabPanel` + variantes bespoke. Le hook canonique **`useCatalogSmartBar` = code mort (0 consommateur)**.
- **Implémentations & état :**
  - **Data-Quality SmartRightBar** (8 sections) : context/actions(gated)/governance/ingestion/ownership/history **fonctionnels** ; `lineage` (deep-link only) + `ai-tips` (string hardcodée) = **stubs**.
  - **Explore-Design ContextRightBar** (2565 l., la plus riche) : actions/ai/quality/cost/governance/deploy(6 étapes)/history **fonctionnels** (RBAC + projectId) ; `help` quasi-statique. Écriture = event-draft (pas d'apply immédiat).
  - **BI BiSmartRightBar** : configure/ai/runs/share/details fonctionnels ; `schedule` = **stub honnête**.
  - **Command-Center ActionsPanel** (Account Overview) : ai/data/maintenance(admin) ; gate **coarse `isAdminRole`** (pas Action-RBAC).
  - **`shared/actions-panel/ActionsPanel.tsx` = code mort orphelin** (0 import, docstring fausse).
- **Manquements / incohérences :**
  - **S7 « Alice Tips »** (narration Cortex sur S1–S6 + « apply all recos ») **non câblé** (closest = stub DQ).
  - **S4 Lineage** = le plus faible (deep-links only, pas d'arbre in-panel, pas de gate « impact avant mutation » sur le write path de ContextRightBar).
  - **S2 annotations d'action** (badges coût/risque/impact-lineage/gov-delta) **inutilisés** — boutons nus.
  - **3 shells différents** + 4 schémas de clés localStorage + taxonomies de sections divergentes + RBAC incohérent (Action-RBAC explore/BI vs `isAdminRole` command-center vs booleans DQ).

---
## C. SCALABILITÉ — SVC / cache / invalidation / events / tracing (backend)

### Architecture actuelle
- **Lecture SVC fail-closed** (`connection_manager.py:1085`) : SVC par account (auto-provision idempotent) sinon `CacheNotReadyError(503)`. SVC tourne en **ACCOUNTADMIN** → toute lecture account-globale voit la donnée complète ; le rôle est un **gate sur l'endpoint, pas un filtre sur les lignes**.
- **🔴 La voie RLS par rôle est CONSTRUITE mais MORTE** : `get_role_read_connection` (`:1049`, `USE ROLE <user>`) a **0 appelant**. Les endpoints `@account_role_cache` lisent en ACCOUNTADMIN mais **cachent par `{ROLE}`** → **fragmentation pure** : N copies identiques + N round-trips à froid pour des données byte-identiques. (Mémoire : seuls BI_ANALYST/DATA_MODELER sont de vrais rôles SF.)
- **Cache** : décorateurs `@session_cache`/`@shared_cache`/`@account_role_cache` ; clés scoped account/role/session/project ; TTL 120–1800 s ; Redis (`scan_iter` batché 100 = bon idiome) avec fallback in-memory **qui ignore le TTL + ne re-probe jamais** Redis.
- **🔴 Bus SSE in-process only** (`cache_event_bus.py`) : Redis sert juste un timestamp, **pas de pub/sub** → multi-worker, une mutation sur worker A **ne notifie jamais** un client sur worker B (invalidations perdues). Last-Event-ID annoncé mais non implémenté.
- **Invalidation** : spine synchrone `@invalidates_cache` (tag→patterns→`delete_pattern` account-pinned + SSE) + filet `DataChangeDetector` (poll `LAST_ALTERED` 300 s, **non DB-qualifié** → rate les changements hors DB courante). Patterns **over-broad** : `PERMISSIONS`→tous users, `CATALOG_OBJECTS`→`d360:*` cross-account. Registre hand-maintained = **drift = stale jusqu'au TTL**.
- **Events** : 3 spines **non corrélés** — `USER_REQUESTS` (tracing middleware, `request_id` écrit **uniquement ici**), `AUDIT_LOG` (writes, pas de body, pas d'id partagé), `USER_ACTIVITY` (events business, `skip_reads`). `PROJECT_ROLLUP` = batch 900 s **interval-only (pas event-driven)**.
- **Tracing** : `QUERY_TAG {app,project_id,module,feature,run_id}` = **seul** lien action→`QUERY_HISTORY`. **🔴 Aucun correlation-id** request↔query↔clé-cache↔event → impossible de reconstruire une action user de bout en bout. Colonnes trace (PAGE/TAB/ACTION_KEY/ENTITY) **jamais peuplées**.

### ✅ Déjà bon (ne pas régresser)
Lecture SVC fail-closed + `CacheNotReadyError` 503 (UX "preparing") ; `delete_pattern` via `scan_iter` (pas `KEYS`) ; `account_scoped_patterns` (pas de flush cross-tenant) ; circuit breakers + backoff 1 h ; invalidation project-precise pour BI ; attribution coût honest-null.

### Reco d'optimisation (priorisées)
1. **#1 Résoudre la contradiction role-key** : (A) `@shared_cache(query_based)` pour les endpoints role-invariants (databases/schemas/tables/stages → 1 slot/account, 1 fetch froid) ; (B) wirer `get_role_read_connection` **uniquement** pour les ~2 vrais rôles SF sur les surfaces RLS. ⇒ supprime N copies ACCOUNTADMIN identiques.
2. **#7 Backer le SSE par Redis pub/sub** (Streams + curseur par client pour un vrai Last-Event-ID resume) → invalidation correcte multi-worker. **Gap de correctness #1 à l'échelle.**
3. **#8 Propager UN `request_id`** : middleware externe → `QUERY_TAG` (+`request_id`) + `AUDIT_LOG` + `USER_ACTIVITY` + cache-trace + header réponse → **vraie corrélation request→endpoints→clés-cache→queries** (ton besoin de tracing).
4. **#4 Passer du glob-SCAN aux tag→key sets Redis** (Set `tag:{account}:{CacheKey}`) : invalidation O(touched) au lieu de O(keyspace), **+ supprime le drift de registre** (le producteur enregistre sa propre clé).
5. **#2 Borner les pools SVC** (`_svc_connections`/`_svc_role_connections`/`_datalake_connections` jamais évincés → fuite FD/sessions) ; **#10 couper les jobs de refresh orphelins** (`metadata:*`/`workflow:*`/`health:*` sans lecteurs = dépense warehouse récurrente) ; **#11 fixer le fallback in-memory** (TTL + re-probe Redis).
6. **#5 Resserrer les 2 patterns over-broad** (PERMISSIONS, CATALOG_OBJECTS `d360:*`) une fois les tag-sets en place ; **#6 DB-qualifier le change detector**.
7. **#9 Rollup projet write-reactive** : `@invalidates_cache` projet enqueue un recompute single-project (garde le batch 15 min comme plancher).

**Lien perf↔scalabilité** : réduire les 14–35 queries/page (endpoint consolidé `tabs/{tab}` mort à réveiller + collapse de la fragmentation role-key #1) = le plus gros gain coût+latence, devant tout tuning de TTL.

---
## Priorisation globale (perf + barres + scalabilité)
| # | Item | Impact | Type |
|---|---|---|---|
| 1 | Réveiller `/command-center/tabs/{tab}` (22→1 query) + grouper `/sources` | perf/coût | front+back |
| 2 | SSE → Redis pub/sub (#7) | correctness multi-worker | back |
| 3 | Collapse role-key fragmentation (#1) | coût/latence cold | back |
| 4 | `request_id` end-to-end (#8) | tracing/observabilité | back |
| 5 | Sidebar : SECURITYADMIN + Administration admin-only (#1/#2 gauche) | sécurité | front |
| 6 | AI Intelligence active-state (`?tab`) + noms vs MODULES | UX/marque | front |
| 7 | tag→key sets (#4) + borner pools SVC (#2) + couper refresh orphelins (#10) | scale/coût | back |
| 8 | Supprimer code mort (useCatalogSmartBar, actions-panel orphelin, NestedDropdown) | dette | front |
