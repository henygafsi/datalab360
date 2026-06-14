---
name: api-skill-administration
description: >
  Module Administration de Data360 (route /admin). Console d'admin de compte "one glass" :
  add-ons par module (entitlements), TRIFECTA de grants Bible v3 (module/action/policy/role/user/data-scope
  via /api/platform/grants*), simulateur d'accès + matrices effectives, audit (/admin/activity-stats,
  usage-by, server-metrics), gestion users/profil (/user/*) et config Data360. 4 routers backend à portes
  RBAC PAR RÔLE hétérogènes (require_accountadmin_role vs _require_super_admin vs get_current_user nu).
  Rôle principal : ACCOUNTADMIN / super-admin. Grounded sur le code réel + re-test live — 2026-06-09.
---

# Administration — Skill Module (API-grounded, 2026-06-09)

> Toutes les affirmations sont sourcées (fichier:ligne ou slice). Les endpoints viennent **uniquement** des slices live + de l'OpenAPI déployé + du scan du code backend. Aucun path inventé. Les zones non confirmées sont marquées « non vérifié ».

## 1. Vue d'ensemble

| Élément | Valeur (source) |
|---------|-----------------|
| **Route front** | `/admin` (console) · `/admin/data360-config` (shell 7 onglets) · `/admin/performance` · `/admin/api-health` · `/admin/platform-settings` · `/profile` · `/users/{view,edit}/[id]` |
| **Shell console** | `apps/data360/src/app/(dashboard)/admin/data360-config/page.tsx` (≈1290 l. — « Console Admin Data360 », 7 onglets) |
| **Panels** | `ActivityDashboard.tsx`, `RoleGrantsPanel.tsx`, `ServerMetricsPanel.tsx`, `RealAccessPanel.tsx`, `data360-config/ActionRbacTab.tsx` |
| **Profil** | `(dashboard)/profile/page.tsx` → `shared/profile/{profile-header,profile-details}` |
| **Services FE** | `services/admin-visibility/index.ts` (`getEndpointUsage`/`getUsageBy`/`getActivityStats`) · `services/data360-config` · `services/governance` (GUI perms, grants) · `services/command-center` (activity feed) · `services/observability` (slow queries) |
| **Routers backend** | `administration/router.py` (`/api/administration`) · `platform_core/router.py` (`/api/platform`) · `cache/routers/admin.py` (`/admin`) · `observability/config_router.py` (`/api/data360/platform-config`) · `auth/router.py` (`/user`) |
| **Catalogue add-ons** | `app/core/feature_registry.py` (statique, sans I/O ; seed `GOUVERNANCE.MODULE_ENTITLEMENTS`) |

**Rôles (RBAC PAR RÔLE, vérifié).** Quatre portes hétérogènes — c'est le point central du module :

| Porte | Définition (vérifiée) | Rôles | Couvre |
|-------|------------------------|-------|--------|
| `require_accountadmin_role` | `[trace: backend/app/dependencies/requirements.py:5-12]` | ACCOUNTADMIN \| SYSADMIN \| SECURITYADMIN | `/api/administration/*`, `/api/data360/platform-config/*` |
| `_require_super_admin` → `is_super_admin` | `[trace: platform_core/router.py:37-44 · module_grants.py:22-28]` | ACCOUNTADMIN \| ORGADMIN \| SECURITYADMIN \| grant `*` | **écritures** `/api/platform/grants*`, matrices effectives, `cache/install` |
| `get_current_user` (nu) | `[trace: cache/routers/admin.py:21]` | tout authentifié | **`/admin/*`** audit (gap), **lectures** `/api/platform/grants*`, simulateur, `me/grants` |
| self (JWT) | — | le caller | `/user/profile*`, `me/modules` |

> ⚠ Les deux ensembles « super-admin » **diffèrent** : SYSADMIN gère entitlements/config mais n'écrit pas de grants ; ORGADMIN c'est l'inverse.

## 2. Capacités (grounded)

| Capacité | Implémentation (fichier / endpoint) |
|----------|--------------------------------------|
| Activer/désactiver un add-on par module | `PUT /api/administration/entitlements/{module}/{feature_key}` (`router.py:91`) ; matrice `GET /entitlements` (`:59`) |
| Posture de gouvernance par module | `GET /api/administration/governance-posture` (`router.py:130`) — entitlements ⨯ grants ⨯ policies ⨯ usage |
| Overview admin agrégé | `GET /api/administration/overview` (`router.py:210`) |
| **Trifecta** module-grant | `GET\|POST /api/platform/grants` + `DELETE` (`router.py:68,129,158`) |
| **Trifecta** action / policy / role / user / data-scope | `GET\|POST /api/platform/grants/{actions,policies,roles,users,data-scope}` (`router.py:342,294,252,196,396`) + `DELETE …/users` |
| Simulateur d'accès what-if | `GET /api/platform/access-simulator` (`router.py:431`) |
| Bundle d'accès effectif (FE bootstrap) | `GET /api/platform/me/grants` (`router.py:488`) → `useCanPerform` |
| Accès effectif d'un user arbitraire + matrices | `users/{u}/effective-grants`, `permission-matrix`, `object-permission-matrix`, `users/{u}/object-grants` (`router.py:631,688,1034,983`) |
| Installer les tables EVENT_STORE | `POST /api/platform/cache/install` (`router.py:50`) |
| Audit usage par endpoint / dimension | `getEndpointUsage`→`GET /admin/endpoint-usage` ; `getUsageBy`→`GET /admin/usage-by` (`admin-visibility/index.ts:24,46`) |
| Stats d'activité module/projet/user | `getActivityStats`→`GET /admin/activity-stats` (`admin.py:282`) → `ActivityDashboard.tsx` |
| Métriques serveur live | `GET /admin/server-metrics` (`admin.py:374`) → `ServerMetricsPanel.tsx` |
| Santé compte de service / registre SVC | `GET /admin/service-account/health`, `GET /admin/svc-registry` (`admin.py:21,54`) |
| Inventaire + TTL de cache éditables | `getCacheEntries`/`patchCacheConfig` → `GET /api/data360/cache-entries`, `PATCH /api/data360/cache-config` |
| Grants Snowflake objet + revoke live | `RoleGrantsPanel` → `getRolesForGrantsMatrix` + `revokePermission` (`POST /gouvernance/revoke-permission`) |
| Configs plateforme (list/get/update/reset) | `GET\|PUT /api/data360/platform-config[/{key}]`, `POST …/reset` (`config_router.py:62,104,141,185`) |
| Profil self-service + switch de rôle | `GET\|PUT /user/profile`, `POST /user/profile/{password,role}`, `GET /user/profile/roles`, `GET /user/me/modules` |
| Cycle de vie compte | `POST /user/{register/,login/,bootstrap-account/}` |
| Event tracking FE batché | `POST /api/data360/track` |

## 3. Référence endpoints (statut live — re-test 2026-06-09)

**Contrat de statut :** tous re-testés `401 AUTH_REQUIRED` via IP directe (`curl -H "Host: api.datalab360.io" http://167.172.162.172<PATH>`) — routés, déployés, gardés. **Zéro 404, zéro 5xx.** Pas d'auth dans le sweep → 401 attendu et sain. Un `401` prouve l'existence + le gardiennage, **pas** la logique métier (compte de test Snowflake expiré).

### 3a. Administration (`/api/administration`, 4 ops — `require_accountadmin_role`)
| Live | Méthode | Path | Rôle/usage |
|------|---------|------|------------|
| 401 | GET | `/api/administration/overview` | Agrégat landing (metrics + add-ons + activité) |
| 401 | GET | `/api/administration/entitlements` | Matrice d'add-ons par module |
| 401 | PUT | `/api/administration/entitlements/{module}/{feature_key}` | Activer/configurer un add-on (⚡ ENTITLEMENT_CHANGE) |
| 401 | GET | `/api/administration/governance-posture` | Rollup par module : features + rôles + policies + usage |

### 3b. Trifecta / Bible v3 (`/api/platform`, 22 ops — lecture authentifié · écriture `_require_super_admin`)
| Live | Méthode | Path | Rôle/usage |
|------|---------|------|------------|
| 401 | POST | `/api/platform/cache/install` | Créer EVENT_STORE.{PLATFORM_EVENTS,MODULE_GRANTS,USER_REQUESTS}+grants |
| 401 | GET | `/api/platform/grants` | Lister grants module (role/page/module/include_revoked/account_id) |
| 401 | POST | `/api/platform/grants` | Accorder un grant module (GrantBody) |
| 401 | DELETE | `/api/platform/grants` | Révoquer un grant (RevokeBody) |
| 401 | GET | `/api/platform/grants/role/{role}` | Quelles pages/modules CE rôle voit |
| 401 | GET\|POST | `/api/platform/grants/actions` | Action grants (visibilité boutons FE) |
| 401 | GET\|POST | `/api/platform/grants/policies` | Policy grants par rôle |
| 401 | GET\|POST | `/api/platform/grants/roles` | Role-capabilities (capabilities, role_family) |
| 401 | GET\|POST\|DELETE | `/api/platform/grants/users` | Bindings user→role |
| 401 | GET\|POST | `/api/platform/grants/data-scope` | Data-scope grants (ALL/ACCOUNT/DATABASE/…) |
| 401 | GET | `/api/platform/access-simulator` | What-if : role×(page/tab/module/action/policy) |
| 401 | GET | `/api/platform/me/grants` | Bundle effectif du caller (bootstrap FE) |
| 401 | GET | `/api/platform/users/{username}/effective-grants` | Bundle effectif d'un user arbitraire (super-admin) |
| 401 | GET | `/api/platform/permission-matrix` | Users × axe (module\|page\|tab), cap 200, `truncated` |
| 401 | GET | `/api/platform/object-permission-matrix` | Users × objet-Snowflake × privilège, cap 100 |
| 401 | GET | `/api/platform/users/{username}/object-grants` | Grants objet natifs d'un user (db→schema→table→col) |

### 3c. Audit & santé serveur (`/admin`, 6 ops — `get_current_user` NU = gap RBAC)
| Live | Méthode | Path | Rôle/usage |
|------|---------|------|------------|
| 401 | GET | `/admin/activity-stats` | USER_ACTIVITY groupé module/project/user (query `days`) |
| 401 | GET | `/admin/endpoint-usage` | Top endpoints par count (AUDIT_LOG ; `days`,`limit`) |
| 401 | GET | `/admin/usage-by` | AUDIT_LOG groupé par dimension (`dimension`,`days`) |
| 401 | GET | `/admin/server-metrics` | Métriques in-process **per-worker** |
| 401 | GET | `/admin/svc-registry` | Registre des comptes SVC |
| 401 | GET | `/admin/service-account/health` | `{configured, connection_alive, active_queries, role}` |

### 3d. Config Data360 (`/api/data360`, 10 ops — accountadmin sur config)
| Live | Méthode | Path | Rôle/usage |
|------|---------|------|------------|
| 401 | GET\|PUT | `/api/data360/platform-config[/{key}]` | Lister/lire/MAJ config (require_accountadmin_role) |
| 401 | POST | `/api/data360/platform-config/reset` | Réinitialiser aux défauts |
| 401 | GET | `/api/data360/config` | Config metadata + cache |
| 405 | GET | `/api/data360/cache-config` | **405 Method Not Allowed** — GET non déployé (OpenAPI : PATCH seulement ; FE tombe sur fallback getData360Config) |
| 401 | PATCH | `/api/data360/cache-config` | MAJ config cache (CacheConfigOverrideRequest) |
| 401 | GET | `/api/data360/cache-entries` | Inventaire des entrées cachées |
| 401 | GET\|POST | `/api/data360/table-refresh-mapping[/refresh]` | Mapping refresh tables + trigger |
| 401 | POST | `/api/data360/track` | Event tracking FE batché (par utilisateur) |

### 3e. Users & Auth (`/user`, 9 ops — self / public rate-limité)
| Live | Méthode | Path | Rôle/usage |
|------|---------|------|------------|
| 400 | POST | `/signin` · `/user/login/` | Login (alias) — 400 sans body valide |
| 400 | POST | `/user/register/` | Créer compte Snowflake + bootstrap (201) |
| 401 | POST | `/user/bootstrap-account/` | Re-bootstrap (header X-Account-Password) |
| 401 | GET | `/user/me/modules` | Modules autorisés (`@session_cache(120)`) |
| 401 | GET\|PUT | `/user/profile` | Profil Snowflake (DESCRIBE/ALTER USER) |
| 401 | POST | `/user/profile/password` | Changer mot de passe (≥8, jamais loggé) |
| 401 | GET\|POST | `/user/profile/role[s]` | Lister rôles / basculer rôle actif |

### Drift connu (slices vs code)
- `RealAccessPanel.tsx` n'appelle **pas** directement `/api/platform/*` : il passe par `getUsersWithRolesAndModules` (service governance). Le bundle `me/grants`/matrices est consommé ailleurs (FE bootstrap / hooks `useCanPerform`) — surface exacte **non vérifiée**.
- Aucun service FE dédié `services/administration/*` trouvé → la consommation FE de `/api/administration/{overview,entitlements,posture}` est **non vérifiée** (la console s'appuie sur `/admin/*` + `/api/data360/*`).

## 4. Modèle de données

| Table EVENT_STORE / source | Écrit par | Lu par |
|----------------------------|-----------|--------|
| `GOUVERNANCE.MODULE_ENTITLEMENTS` | `PUT /entitlements/...` (INSERT/MERGE) | `/entitlements`, `/governance-posture`, `/overview` |
| `EVENT_STORE.MODULE_GRANTS` | `POST/DELETE /grants` | `/grants`, `/me/grants`, `permission-matrix`, simulateur |
| `EVENT_STORE.ACTION_GRANTS` | `POST /grants/actions` | `/grants/actions`, simulateur (`role_can_execute`) |
| `EVENT_STORE.POLICY_GRANTS` | `POST /grants/policies` | `/grants/policies`, simulateur (`role_has_policy_action`) |
| `EVENT_STORE.ROLE_GRANTS` | `POST /grants/roles` | `/grants/roles`, `role_capability` |
| `EVENT_STORE.USER_GRANTS` | `POST/DELETE /grants/users` | `/grants/users` |
| `EVENT_STORE.DATA_SCOPE_GRANTS` | `POST /grants/data-scope` | `/grants/data-scope`, simulateur (`get_data_scope`) |
| `EVENT_STORE.PLATFORM_EVENTS` | `emit(ENTITLEMENT_CHANGE,…)` | spine d'audit |
| `EVENT_STORE.USER_REQUESTS` | middleware | `module_activity`, `server_metrics_persisted`, posture |
| `EVENT_STORE.USER_ACTIVITY` | middleware | `/admin/activity-stats` (par compte du caller) |
| `EVENT_STORE.AUDIT_LOG` | middleware | `/admin/endpoint-usage`, `/admin/usage-by` |
| `…PLATFORM_CONFIG` | `PUT/POST platform-config*` | config plateforme |
| `ACCOUNT_USAGE.POLICY_REFERENCES` | (Snowflake) | `policy_bindings_summary` (TTL 1800s, lag 45min-3h) |
| `SHOW GRANTS TO USER/ROLE` | (Snowflake) | effective/object-grants/matrices (cap 100/200 → `truncated`) |

**Schéma d'un grant module (`me/grants` `modules[]`) :** `{module, page, sub_page, tab, can_view, can_create, can_update, can_delete, can_execute, can_approve, can_export, data_scope}`. `[trace: platform_core/router.py:500-509]`

## 5. Deep-dive trifecta + fiche ins/outs des endpoints clés

### 5.1 La trifecta de gouvernance (3 systèmes, cf. `_conventions.md §1`)
1. **GUI page-visibility hints** — `GOUVERNANCE.GUI_PERMISSIONS`, **advisory** (hint UI, non enforced). Onglet « Page hints ».
2. **D360 role actions** — `D360_ROLE_ACTIVES`, clé `module:page:tab:action`, voie `require_action` (fail-open jusqu'à seed). Onglet « Action RBAC ».
3. **Platform grants (Bible v3)** — `MODULE_/ACTION_/POLICY_/ROLE_/USER_/DATA_SCOPE_GRANTS` via `/api/platform/grants*`.

> **Honnêteté enforcement.** Le bundle effectif porte `enforcement: {status:"configured_not_enforced"}` : `require_module_access`/`require_action` (`core/rbac.py`) sont **no-ops**. La trifecta pilote la **visibilité FE** (`me/grants` → `useCanPerform`) ; l'enforcement réel = `require_accountadmin_role` / `_require_super_admin` / `ensure_project_access`. `[trace: platform_core/router.py:538-544]`

### 5.2 Pourquoi 3 portes différentes — modèle mental
- `/api/administration/*` = **gouverner les add-ons** (accountadmin/sysadmin) → `MODULE_ENTITLEMENTS`.
- `/api/platform/grants*` (écriture) = **distribuer l'accès** (super-admin strict) → 6 tables de grants.
- `/admin/*` = **observer** (devrait être accountadmin — actuellement **tout authentifié**, gap P0).

### 5.3 Fiche « ins / outs » des endpoints clés
> Tous `401` live (déployés). INS = body·path·query ; OUTS = forme consommée par l'UI.

| Étape | Endpoint | INS | OUTS |
|-------|----------|-----|------|
| matrice add-ons | `GET /api/administration/entitlements` | — | `{modules:{<m>:[{module,feature_key,label,description,enabled,surface,governed_by}]}, feature_count, module_count, activity}` |
| activer add-on | `PUT /api/administration/entitlements/{module}/{feature_key}` | path `{module}*,{feature_key}*` · body `{enabled:bool*, config?:obj}` | `{...}` `standard_response(permissions:{can_govern})` (404 `UNKNOWN_FEATURE` si inconnu) |
| posture | `GET /api/administration/governance-posture` | — | `{posture:[{module,features_total,features_enabled,disabled[],granted_roles[],usage?,bound_policies?}], policy_bindings, module_activity, usage_window_days}` |
| overview | `GET /api/administration/overview` | — | `{account, server_metrics, policy_bindings, module_activity, server_metrics_persisted, addons:{modules,features,enabled}}` |
| lister grants | `GET /api/platform/grants` | query `role,page,module,include_revoked,account_id` | `{items[], count}` |
| accorder module | `POST /api/platform/grants` | body `{role*,page*,module*,tab?,account_id?}` | résultat `mg.grant` (🔒 super-admin) |
| accorder action | `POST /api/platform/grants/actions` | body `{role*,action_key*,module?,page?,tab?,can_execute=true,requires_approval=false,approver_role?,account_id?}` | `gs.create_action_grant` |
| accorder policy | `POST /api/platform/grants/policies` | body `{role*,policy_type*,can:{},policy_name?,object_scope?,account_id?}` | `gs.create_policy_grant` |
| role-capabilities | `POST /api/platform/grants/roles` | body `{role*,role_family?,capabilities:{},account_id?}` | `gs.upsert_role_grant` |
| bind user→role | `POST /api/platform/grants/users` | body `{username*,role*,workspace_id?,account_id?}` | `gs.create_user_grant` |
| data-scope | `POST /api/platform/grants/data-scope` | body `{role*,scope*,module?,database?,schema_?,object_name?,object_type?,domain?,tag?,environment?,account_id?}` | `gs.create_data_scope` |
| simuler | `GET /api/platform/access-simulator` | query `role*,page?,tab?,module?,action_key?,policy_type?,policy_action?` | `{account,role,page,tab,module,checks:{module?,tab?,action?,policy?,data_scope}}` |
| bootstrap FE | `GET /api/platform/me/grants` | — | `{account_id,role,is_super_admin,modules[],actions[],data_scopes[],pages[],tabs[]}` |
| effectif user | `GET /api/platform/users/{username}/effective-grants` | path `{username}*` | `{username, ...me/grants, roles[], role:null, enforcement}` |
| matrice accès | `GET /api/platform/permission-matrix` | query `users?(CSV,cap200), axis(module\|page\|tab)` | `{axis,axes[],rows:[{username,roles[],access:{<axis>:allowed\|denied}}],user_count,truncated,enforcement}` |
| matrice objet | `GET /api/platform/object-permission-matrix` | query `users?(cap100), database?` | `{database,object_keys[],rows:[{username,roles[],access:{<fqobj>:[priv]}}],truncated}` |
| activity-stats | `GET /admin/activity-stats` | query `days=7(1..365)` | `{by_module:[{module,events,failures}], by_project:[{project_id,events}], by_user:[{username,events}], total}` |
| endpoint-usage | `GET /admin/endpoint-usage` | query `days=7,limit` | `{endpoints:[{method,path,module,count,errors,distinct_users,last_seen}], total_requests, window_days}` |
| usage-by | `GET /admin/usage-by` | query `dimension(module\|role\|user),days=7` | `{dimension, rows:[{key,requests,errors,distinct_endpoints}]}` |
| server-metrics | `GET /admin/server-metrics` | — | snapshot in-process per-worker (rpm, latency p50/p95/p99, top/slow endpoints, erreurs récentes) |
| installer tables | `POST /api/platform/cache/install` | — | confirmation DDL (🔒 super-admin) |
| profil | `GET\|PUT /user/profile` | PUT body `UpdateProfileRequest(exclude_unset)` | profil `DESCRIBE USER` |
| switch rôle | `POST /user/profile/role` | body `{role}` | `UserRolesResponse{current, available[]}` (♻️ USER_PERMISSIONS) |

## 6. UX front — validation 4 axes + accessibilité

| Axe | Verdict | Preuve (fichier:ligne) | Microcopy |
|-----|---------|------------------------|-----------|
| **loading** | ✓ | `data360-config/page.tsx:101-109` `Loading` skeleton `h-10 animate-pulse` ; `ServerMetricsPanel.tsx:109-116` `h-20 animate-pulse` ; `RoleGrantsPanel.tsx:110-115` | skeletons animés `aria-hidden` |
| **empty** | ✓ | `EmptyState` partout : `RoleGrantsPanel.tsx:127` « No object grants for this role » ; `ServerMetricsPanel.tsx:131,179` « No metrics »/« No requests yet » | états vides honnêtes (« no faked numbers », `page.tsx` docstring) |
| **error** | ✓ | `useFetch` état `error` (`page.tsx:74-94`) → `ErrBox` rouge + « Retry » (`:111-123`) ; `ServerMetricsPanel.tsx:118-127` ; tous via `getApiErrorMessage` | « {message} Retry » + `AlertTriangle` |
| **dark mode** | ✓ | `data360-config/page.tsx` **97** occurrences `dark:` ; `ServerMetricsPanel.tsx` 29 ; `ActivityDashboard.tsx` 21 ; `RealAccessPanel.tsx` 12 ; `RoleGrantsPanel.tsx` 9 | `dark:bg-slate-800/60`, `dark:text-slate-100`… |

**Accessibilité :** `ConfirmDialog` `role="dialog" aria-modal="true"` (`page.tsx:178`) avant écritures larges ; `<select aria-label="Role">` (`RoleGrantsPanel.tsx:100`) ; skeletons `aria-hidden`. ⚠ Le `window.confirm` natif de `RoleGrantsPanel.tsx:76` est moins accessible que le `ConfirmDialog` glass — incohérence UX.

## 7. Drift détecté

1. **Docstring trompeuse — « All routes are ACCOUNTADMIN-gated ».** Vrai pour `/api/administration/*` seul (`router.py:8`). `/admin/*` (audit) n'a **aucun** gate admin ; les **lectures** `/api/platform/grants*` sont ouvertes à tout authentifié. Le module agrège 4 routers à portes hétérogènes.
2. **Pas de service FE `services/administration/*`.** La console consomme `/admin/*` (admin-visibility), `/api/data360/*` (data360-config) et governance — la consommation FE de `/api/administration/{overview,entitlements,posture}` est **non vérifiée**.
3. **`RealAccessPanel`** ne tape pas `/api/platform/*` directement (utilise `getUsersWithRolesAndModules`) — l'usage de `me/grants`/matrices est ailleurs (bootstrap/`useCanPerform`), surface exacte **non vérifiée**.
4. **`window.confirm` vs `ConfirmDialog`** : deux patterns de confirmation coexistent (natif dans `RoleGrantsPanel`, glass dans la console).
5. **Deux ensembles « super-admin »** divergents (SYSADMIN vs ORGADMIN) — risque de surprise côté admin.

## 8. Propositions d'amélioration UX (PROPOSITIONS — pas d'édition de code)

1. **Garder `/admin/*` derrière `require_accountadmin_role`** (gap P0 sécurité) : ajouter `dependencies=[Depends(require_accountadmin_role)]` au `admin_router` (`cache/routers/admin.py:18`). Bénéfice : l'audit/les métriques ne fuient plus à tout authentifié.
2. **Badge « configuré, non enforced »** sur les onglets Trifecta/Page hints, repris de l'envelope `enforcement` — éviter que l'admin croie que poser un grant bloque l'API. [trivial-safe]
3. **Unifier la confirmation** : remplacer `window.confirm` de `RoleGrantsPanel` par le `ConfirmDialog` glass (cohérence + a11y). [trivial-safe]
4. **Indicateur « per-worker »** sur `ServerMetricsPanel` (la valeur dépend du worker qui répond) + lien vers le rollup persisté `server_metrics_persisted`. Bénéfice : pas de fausse lecture des métriques.
5. **Afficher l'écart SYSADMIN/ORGADMIN** dans l'UI quand un grant échoue en 403 `SUPER_ADMIN_ONLY` malgré un rôle accountadmin-like. Bénéfice : message d'erreur actionnable.
6. **Bandeau `truncated`/`degraded`** explicite sur les matrices (cap 100/200, échec SHOW GRANTS) — déjà renvoyé par l'API, à surfacer. Bénéfice : honnêteté de la grille.
7. **Étendre `EXACT_MODULE_KEYS`** (posture) à `projects`/`catalog`/`analytics` via une table de correspondance slug↔MODULE, pour remplir la colonne `usage` au-delà des 4 modules actuels.
8. **CTA gouverné dans la posture** : par module, proposer « activer l'add-on / accorder le grant manquant » désactivé si le caller n'a pas le rôle requis (`useCanPerform`).

## 9. Plan de test fonctionnel

> Toutes les routes renvoient `401` sans token (re-confirmé 2026-06-09). Obtenir un JWT (login Data360, **rôle ACCOUNTADMIN/ORGADMIN/SECURITYADMIN** pour les écritures), puis `-H "Authorization: Bearer $TOKEN"`.

```bash
BASE=https://<host>        # ex. http://localhost:80 ; live: http://167.172.162.172 + -H "Host: api.datalab360.io"
H="-H Authorization:Bearer $TOKEN -H Content-Type:application/json"

# 1. Add-ons (accountadmin) — matrice puis toggle
curl -s $H "$BASE/api/administration/entitlements"
curl -s $H -X PUT "$BASE/api/administration/entitlements/workflow/block_catalog" -d '{"enabled":true}'
# feature inconnue → 404 UNKNOWN_FEATURE
curl -s $H -X PUT "$BASE/api/administration/entitlements/workflow/nope" -d '{"enabled":true}'

# 2. Posture + overview
curl -s $H "$BASE/api/administration/governance-posture"
curl -s $H "$BASE/api/administration/overview"

# 3. Trifecta — lecture (tout authentifié) puis écriture (super-admin)
curl -s $H "$BASE/api/platform/grants?role=DATA_ANALYST"
curl -s $H -X POST "$BASE/api/platform/grants" -d '{"role":"DATA_ANALYST","page":"workflow","module":"workflow"}'
curl -s $H -X POST "$BASE/api/platform/grants/actions" -d '{"role":"DATA_ANALYST","action_key":"workflow:execute","can_execute":true}'
curl -s $H -X POST "$BASE/api/platform/grants/users" -d '{"username":"ALICE","role":"DATA_ANALYST"}'
# rôle non super-admin → 403 SUPER_ADMIN_ONLY attendu

# 4. Simulateur + bundles effectifs
curl -s $H "$BASE/api/platform/access-simulator?role=DATA_ANALYST&module=workflow&action_key=workflow:execute&page=workflow&tab=builder"
curl -s $H "$BASE/api/platform/me/grants"                       # bundle du caller
curl -s $H "$BASE/api/platform/users/ALICE/effective-grants"    # super-admin
curl -s $H "$BASE/api/platform/permission-matrix?axis=module"   # cap 200, truncated possible

# 5. Audit (devrait être accountadmin — actuellement tout authentifié = gap)
curl -s $H "$BASE/admin/activity-stats?days=30"
curl -s $H "$BASE/admin/endpoint-usage?days=7&limit=200"
curl -s $H "$BASE/admin/usage-by?dimension=user&days=7"
curl -s $H "$BASE/admin/server-metrics"                          # per-worker

# 6. Config + profil
curl -s $H "$BASE/api/data360/platform-config"
curl -s $H "$BASE/user/profile/roles"
curl -s $H -X POST "$BASE/user/profile/role" -d '{"role":"ACCOUNTADMIN"}'
```

**Résultats attendus :**
- Sans token → **401 AUTH_REQUIRED** sur toutes les ops (contrat re-confirmé 2026-06-09).
- Écriture de grant avec rôle non super-admin → **403 `SUPER_ADMIN_ONLY`**.
- `PUT /entitlements/{m}/{inconnu}` → **404 `UNKNOWN_FEATURE`**.
- Bundles effectifs → champ **`enforcement: configured_not_enforced`** (les grants n'enforced pas l'API).
- `permission-matrix`/`object-*` au-delà du cap (200/100 users) → **`truncated:true`** ; échec SHOW GRANTS → ligne **`degraded`**, jamais 500.
- Enrichissements overview/posture indisponibles (Snowflake) → champ **`null`** (jamais 500, `_safe_enrichment`).
- ⚠ **Gap à vérifier :** `/admin/activity-stats` répond-il à un rôle **non**-admin ? (attendu : oui aujourd'hui = gap P0 à corriger.)
```

> Vérifié 2026-06-09 : 51 endpoints vérifiés (4 administration + 22 platform + 6 admin + 10 data360-config + 9 user/auth), 2 corrections (GET /api/data360/cache-config → 405 live, PATCH only dans OpenAPI ; CacheTab trace ligne corrigé à 622), 5 claims UI vérifiés (Loading:101, ConfirmDialog:178, dark:=97, window.confirm RoleGrantsPanel:76, CacheTab:622), live-retest 3 endpoints OK (401 : /api/platform/users/{u}/object-grants, /api/administration/entitlements, /admin/usage-by). Pas de secrets/IP dans le vault. PATCHED.
