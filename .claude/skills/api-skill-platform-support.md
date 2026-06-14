---
name: api-skill-platform-support
description: >
  Fondations transverses de Data360 : modèle de cache (service-account → Redis → Frontend
  avec invalidation + push SSE temps réel), notifications (inbox par utilisateur + broadcast
  super-admin), suivi de déploiement (lifecycle tracké + approbations par tier de rôle), et
  espace de travail utilisateur (vues sauvegardées / watchlist / récemment ouverts, backend-only).
  51 endpoints sur 5 routeurs. RBAC PAR RÔLE (pas d'action-RBAC) : require_accountadmin_role,
  is_super_admin, _require_approver_role. Grounded code réel + re-test live 2026-06-09.
---

# Platform Support — Skill Module (API-grounded, 2026-06-09)

> Toutes les affirmations sont sourcées (fichier:ligne ou slice). Endpoints uniquement issus des 5 slices live + OpenAPI. RBAC issu du code des routeurs. Zones non confirmées = « non vérifié ». Le finding sécurité `/cache/*` (statut live de routes admin) n'est PAS reproduit ici en détail — voir `.claude/skills/api-endpoint-test-report-2026-06-08.md`.

## 1. Vue d'ensemble

| Élément | Valeur (source) |
|---------|-----------------|
| **Nature** | Module **transverse** — pas une page unique. 5 routeurs + 1 UI dédiée (`/deploy-app`). |
| **UI dédiée** | `apps/data360/src/app/(dashboard)/deploy-app/page.tsx:27` (shell ; wizard 5 étapes + handoff SPCS) |
| **Surfaces globales** | Cloche notifications (`layouts/notification-dropdown.tsx`) ; client SSE cache (`hooks/useCacheInvalidation.ts:283`) |
| **Routeur cache** | `backend/app/modules/cache/routers/cache_management.py` (prefix `/cache`, 21 ops) + `admin.py` |
| **Routeur SSE** | `cache/routers/cache_stream.py` (prefix `/cache-stream`, 5 ops) |
| **Routeur notifications** | `notifications/routers/notifications.py` (prefix `/notifications`, 5 ops) |
| **Routeur déploiement** | `deployment_tracking/routers/tracking.py` (prefix `/deployments/track`, 9 ops) |
| **Routeur workspace** | `user_workspace/router.py` (prefix `/api/workspace`, 11 ops) |
| **Cœur du modèle de cache** | `core/cache_decorators.py` (session/shared/account_role) + `cache/services/cache_invalidation.py:460` (`@invalidates_cache`) + `cache/services/cache_event_bus.py:30` (`CacheKey`, bus) |
| **FE notifications** | `apps/data360/src/app/services/notifications/index.ts` |
| **FE déploiement** | `apps/data360/src/app/services/deployments` (`services/deployment-tracking` = shim déprécié, `index.ts:11`) |
| **FE workspace** | 🔴 **aucun** (0 consommateur `api/workspace` dans `apps/data360/src`) |

**Rôles (vérifiés dans le code).** Ce module est l'exemple canonique du **RBAC PAR RÔLE** (pas d'`require_action`) :

| Surface | Gate (vérifié) | Rôles |
|---------|----------------|-------|
| Cache admin (clear/warmup/refresh/keys/stats) | `require_accountadmin_role` | ACCOUNTADMIN |
| Cache obs (health/perf/dashboard/kpis/invalidations/breakdown) + SSE | `get_current_user` | tout authentifié |
| Notifications inbox (list/count/mark) | `get_current_user` | propriétaire |
| Notifications broadcast | `is_super_admin` (403 sinon) | ACCOUNTADMIN/ORGADMIN/SECURITYADMIN/wildcard JWT `[notifications.py:134]` |
| Deploy track start/step/complete/get/list | `get_current_user` | owner/approver scope |
| Deploy approve/reject/execute/rollback | `_require_approver_role` (substring) | ACCOUNTADMIN/SYSADMIN/SECURITYADMIN/DATA_ENGINEER/QA_ENGINEER `[tracking.py:43-61]` |
| Workspace tout | `get_current_user` | propriétaire (`account`+`username`) |
| Workspace investigation-modes | aucun (public) | anonyme `[router.py:66]` |

## 2. Capacités (grounded)

| Capacité | Implémentation |
|----------|----------------|
| Cache lecture par-utilisateur | `@session_cache(ttl)` clé `session:{user}:{account}:{func}:{hash}` `[cache_decorators.py:104,210]` |
| Cache partagé compte / par rôle | `@shared_cache(strategy)` ; `@account_role_cache(page,module)` clé `d360:{account}:{page}:{module}:{role}:{fn}:{hash}` `[cache_decorators.py:400-428]` |
| Invalidation + SSE en un decorator | `@invalidates_cache(*CacheKey, reason, related?)` → Redis pattern-delete + `event_bus.publish_sync` `[cache_invalidation.py:460,493-540]` |
| Flux SSE temps réel (zéro coût SF) | `GET /cache-stream/stream` + FE `useCacheInvalidation.ts:283` → `invalidateQueries` `[cache_stream.py:144]` |
| Observabilité cache (never-500) | `GET /cache/{dashboard,kpis,performance,breakdown,invalidations}` (fallback zéro si Redis down) |
| Inbox notifications par-utilisateur | `GET /notifications` + `/unread-count` + `PATCH /{id}/read` + `POST /mark-all-read` |
| Broadcast gouverné + fan-out | `POST /notifications/broadcast` → `NOTIFICATIONS_RAW` → `NOTIFICATIONS_FANOUT_TASK` → `NOTIFICATIONS_USER` |
| Suivi de déploiement (8 étapes) | `POST /deployments/track` + `PATCH /{id}/step` + `POST /{id}/complete` ; mirror de `PROJECT_DEPLOYMENTS` |
| Approbation par tier de rôle | `approve/reject/execute/rollback` → `_require_approver_role` → projects.services + `_sync_tracker` |
| Espace de travail (backend-only) | saved-views / watchlist / recently-opened / touch / investigation-modes |

## 3. Référence endpoints (51 ops — statut live)

**Contrat :** sweep `:80` 2026-06-08 sans auth + re-test 2026-06-09 (IP directe non publiée). `401` = déployé+gardé · `200` = public · `404` = absent.

### 3a. Cache management (21 ops) — `/cache`
| Live | Méthode | Path | Gate (code) |
|------|---------|------|-------------|
| 401 | GET | `/cache/breakdown` · `/dashboard` · `/invalidations` · `/kpis` · `/performance` | `get_current_user` |
| 401 | POST | `/cache/refresh/{start,stop,trigger/{job_name}}` · `/warmup/trigger` | `require_accountadmin_role` |
| 401 | GET | `/cache/refresh/status` | `get_current_user` |
| 401 | DELETE | `/cache/keys/{key}` | `get_current_user` (log_event) |
| 200* | GET | `/cache/svc-health` · `/stats` · `/keys` · `/health` · `/test-connection` | `require_accountadmin_role` / `get_current_user` (code) |
| 200* | POST | `/cache/clear/all` · `/clear/pattern` · `/warmup` | `require_accountadmin_role` (code) |
| 400 | POST | `/cache/keys` | `require_accountadmin_role` (code) — atteignable sans auth, `400` car body requis |

> **(*) `200` live ≠ gate du code.** Plusieurs routes `/cache/*` portent `require_accountadmin_role`/`get_current_user` dans le code mais répondent `200` sans auth en prod. **C'est un finding sécurité** — détail + impact dans `.claude/skills/api-endpoint-test-report-2026-06-08.md` (privé). NE PAS reproduire dans le vault publié. Routes admin = purge/peuplement Redis ⇒ ne pas déclencher en re-test.

### 3b. Cache SSE (5 ops) — `/cache-stream` (tous 401)
`GET /cache-stream/stream` (query `token`) · `/available-keys` · `/stats` · `/last-invalidation/{cache_key}` · `POST /test-invalidation` (body `TestInvalidationRequest{cache_keys[]}`).

### 3c. Notifications (5 ops) — `/notifications` (tous 401)
`GET /notifications` (q: `unread_only, kind, project_id, page, page_size`) · `GET /unread-count` · `PATCH /{notification_id}/read` · `POST /mark-all-read` · `POST /broadcast` (body `BroadcastRequest`).

### 3d. Deployment tracking (9 ops) — `/deployments/track` (tous 401)
`GET /deployments/track` (q: `include_approvals_for_me, include_metrics, include_history, window_days, history_limit`) · `POST /deployments/track` · `GET /{id}` · `PATCH /{id}/step` · `POST /{id}/complete` · `POST /{id}/approve` · `POST /{id}/reject` · `POST /{id}/execute` · `POST /{id}/rollback`.

### 3e. User workspace (11 ops) — `/api/workspace`
| Live | Méthode | Path |
|------|---------|------|
| 200 | GET | `/api/workspace/investigation-modes` (public — catalogue statique 9 presets) |
| 401 | GET/POST | `/api/workspace/saved-views` ; PATCH/DELETE `/saved-views/{view_id}` |
| 401 | GET | `/api/workspace/recently-opened` · `/watchlist` ; POST `/touch` ; POST/DELETE `/watchlist[/{object_id}]` |
| 401 | POST | `/api/workspace/cache/install` |

## 4. Modèle de données (tables · enums · CacheKey)

**Tables Snowflake (`CP_DATA360.EVENT_STORE.*`).**
- `NOTIFICATIONS_RAW` (source broadcast) → `NOTIFICATIONS_FANOUT_TASK` → `NOTIFICATIONS_USER` (inbox par-utilisateur). `[notifications/models.py:3]`
- `DEPLOYMENT_PROGRESS` (tracker, mirror de `PROJECT_DEPLOYMENTS`). `[tracking.py]`
- `USER_SAVED_VIEWS` / `USER_WATCHLIST` / `USER_OBJECT_TOUCHES` (3 templates `cache_tables/*.sql.j2`).
- `CACHE` (log_event admin : `CACHE_DELETE_KEY`, `CACHE_REFRESH_*`, `CACHE_WARMUP_*`).

**Enums (notifications).** `NotificationKind` = deploy_success/deploy_failure/approval_request/approval_granted/approval_rejected/workflow_finished/workflow_failed/system. `Audience` = PROJECT_READERS/PROJECT_EDITORS/ROLE/USER_LIST/EVERYONE. `UiOrigin` = explore-design/workflow/bi/dq/system. `[notifications/models.py:15-39]`

**Enums (déploiement).** `DeploymentStatus` = PENDING/RUNNING/PENDING_APPROVAL/SUCCEEDED/FAILED/CANCELLED. `DeploymentStep` (8) = review/configure/pre_checks/dry_run/sql_diff/impact/deploy/verify. `TERMINAL_EVENTS` = {succeeded, failed, cancelled}. `[deployment_tracking/models.py:11-35]`

**`DeploymentRow`** (réponse principale) : `{deployment_id, project_id, project_name?, version_id?, owner_username, approver_username?, status, current_step, steps_completed[], errors_by_step{}, started_at, completed_at?, elapsed_ms, payload?, ui_origin?, is_terminal?, error_count?, steps_completed_count?, progress_ratio?}`. Les 4 derniers sont dérivés server-side (sans requête). `[models.py:98-126]`

**`CacheKey` (enum, ~50+).** Pertinents ici : `DEPLOYMENTS`, `PROJECTS`, `NOTIFICATIONS`, `USER_SAVED_VIEWS`, `USER_WATCHLIST`, `CHAT` (utilisé par les ops cache admin/test). `[cache_event_bus.py:115,156,163-164]`

## 5. Deep-dive FOCUS — le modèle de cache (svc → Redis → FE) + ins/outs des endpoints clés

### 5.1 Le pipeline complet
```
[svc-account refresh/warm jobs]  ─┐
[reads @session_cache/@shared_cache] ─┼──> Redis (clés session:* / shared:* / d360:* / sf:*)
                                       │
[mutation @invalidates_cache(CacheKey.X)]
   ├─ 1. redis.delete_pattern(CACHEKEY_TO_REDIS_PATTERNS[X])
   └─ 2. event_bus.publish_sync(CacheInvalidationEvent{cache_keys, reason, triggered_by, affected_entities?})
                                       │
[GET /cache-stream/stream] ──event:cache_invalidation──> FE useCacheInvalidation.ts:283
                                       └─> queryClient.invalidateQueries([key])
```

### 5.2 Les 3 stratégies de clé (le levier « par rôle »)
| Décorateur | Clé | Scope | Usage platform-support |
|------------|-----|-------|------------------------|
| `@session_cache(ttl)` | `session:{user}:{account}:{func}:{hash}` | **par utilisateur** | **toutes** les lectures (15 occ. `ttl=300`) |
| `@shared_cache(metadata_based)` | `shared:{account}:{resource}` | par compte | `cache/admin.py` |
| `@account_role_cache(page,module)` | `d360:{account}:{page}:{module}:{role}:{fn}:{hash}` | **par rôle** | **0** ici (mais 42× ailleurs) |

**Recommandation (affine workflow §C).** Le primitif **par rôle existe déjà** (`account_role_cache`, `cache_decorators.py:400`) — donc « adopter », pas « construire ». Migrer vers `@account_role_cache`/`@shared_cache` **uniquement** les lectures **role/account-uniformes** (ex. observabilité cache `dashboard`/`kpis`/`breakdown` — l'état Redis est global) ; **garder** `@session_cache` sur tout ce qui est filtré par `username` (notifications, workspace, deployments) sous peine de fuite inter-utilisateur. Règle : clé par rôle ⟺ réponse identique pour tout le rôle.

### 5.3 Invalidation = event (le contrat)
`@invalidates_cache` fait **toujours** Redis-delete **+** SSE (`cache_invalidation.py:493-540`). `related` (dict/callable) → `affected_entities` (table/model/module/page/action/role) pour refresh scopé. `publish_sync` ne lève jamais (dégrade en Redis-only si pas de loop). **Précision (vérifié) :** c'est le **même** décorateur qu'importe `workflow/router.py:91` — le push SSE est donc partout (la note workflow §Gaps P1 « no SSE push » est inexacte). La vraie distinction de platform-support : il **consomme** le canal SSE côté FE (`useCacheInvalidation.ts:283`), là où d'autres surfaces s'appuient sur le polling.

### 5.4 Fiche ins/outs des endpoints clés
| Action | Endpoint | INS (path · query · body) | OUTS (consommé) |
|--------|----------|---------------------------|-----------------|
| flux SSE | `GET /cache-stream/stream` | query `token?` | SSE `connected`/`cache_invalidation{cache_keys[]}`/`timeout` (hard 300s) |
| clés dispo | `GET /cache-stream/available-keys` | — | `{cache_keys[], total}` (valeurs de l'enum `CacheKey`) |
| KPIs cache | `GET /cache/kpis` | — | `{hit_rate?, miss_rate?, total_keys, by_class[], invalidations_total, invalidations_recent, generated_at}` |
| breakdown | `GET /cache/breakdown` | — | `{by_class[{class,prefix,count,oldest_ttl,newest_ttl}], total, cached_queries[], generated_at}` |
| badge | `GET /notifications/unread-count` | — | `{data:{unread:int}}` |
| inbox | `GET /notifications` | query `unread_only,kind,project_id,page,page_size` | `{data:{items[NotificationItem], page, page_size, total, unread_count}}` |
| lire | `PATCH /notifications/{id}/read` | path `{id}` | `{data:{notification_id, updated}}` |
| broadcast | `POST /notifications/broadcast` | body `BroadcastRequest{kind*, title*, body?, project_id?, payload?, audience, audience_role?, audience_users?, link?, ui_origin?}` | `{data:{raw_id, audience}}` (gate `is_super_admin`) |
| lister déploiements | `GET /deployments/track` | query `include_approvals_for_me, include_metrics, include_history, window_days(1-365), history_limit(1-200)` | `{items[DeploymentRow], metrics?, history?}` |
| démarrer | `POST /deployments/track` | body `StartDeploymentRequest{project_id*, project_name?, version_id?, approver_username?, requires_approval, payload?, ui_origin}` | `DeploymentRow` |
| avancer | `PATCH /deployments/track/{id}/step` | path `{id}` · body `StepRequest{step*, completed, errors?[], payload?}` | `DeploymentRow` |
| finaliser | `POST /deployments/track/{id}/complete` | path `{id}` · body `CompleteRequest{status*, error?}` | `DeploymentRow` |
| approuver | `POST /deployments/track/{id}/approve` | path `{id}` · body `ApproveRequest{comment?}` | résultat lifecycle (gate `_require_approver_role`) |
| rejeter | `POST /deployments/track/{id}/reject` | path `{id}` · body `RejectRequest{reason?}` | résultat lifecycle |
| exécuter | `POST /deployments/track/{id}/execute` | path `{id}` · body `ExecuteRequest{execution_log?, error?, finalize_only}` | résultat (dispatch par project_type) |
| rollback | `POST /deployments/track/{id}/rollback` | path `{id}` · body `RollbackRequest{project_id?, target_version_id?, reason?}` (résolus si omis) | résultat |
| vue sauvegardée | `POST /api/workspace/saved-views` | body `CreateSavedViewBody{page*, module?, name*, description?, filters{}, is_shared}` | ligne créée |
| watchlist | `POST /api/workspace/watchlist` | body `WatchlistAddBody{object_id*, object_fqn*, object_type?, label?, note?}` | ligne |
| presets | `GET /api/workspace/investigation-modes` | — | `{items[{key,label,icon,filters}]}` (200 public) |

## 6. UX front — validation 4 axes + accessibilité

| Axe | Verdict | Preuve (fichier:ligne) |
|-----|---------|------------------------|
| **loading** | ✓ (deploy-app) | `DeploymentApprovals.tsx:155-163` skeleton `animate-pulse` ; refresh bouton `disabled` |
| **empty** | ✓ (deploy-app) | empty-state `DeployAppHome.tsx:240-245` (Inbox icon + libellé) |
| **error** | ✓ (deploy-app) | bandeau rouge + retry `DeploymentApprovals.tsx:164-181` ; `dark:` rouge |
| **dark mode** | ✓ (deploy-app) | `page.tsx:53` `dark:bg-slate-900` ; color-map statuts `DeploymentApprovals.tsx:78-85` ; `DeployAppHome.tsx` nombreuses `dark:` |
| **loading/empty/error notifications** | non vérifié | dropdown non lu en détail (`notification-dropdown.tsx`) |
| **workspace UX** | 🔴 n/a | aucune UI (0 consommateur FE) |

**Accessibilité :** non vérifié au-delà des classes Tailwind lues sur `/deploy-app`.

## 7. Drift détecté

1. **Espace de travail backend-only.** 10/11 endpoints `/api/workspace/*` déployés (`401`) mais **0 consommateur FE** (`api/workspace` absent de `apps/data360/src` — seulement manifest + skill docs). Backend prêt, UI à construire.
2. **Approbation par substring.** `_require_approver_role` (`tracking.py:50`) teste `current_user.role` par inclusion de chaîne — pas d'action-RBAC, pas de grant DB. Fragile.
3. **Liste déploiements non cachée.** `GET /deployments/track` volontairement non caché (clé non câblée dans le set `DEPLOYMENTS`, `tracking.py:193`).
4. **FE deployment-tracking = shim déprécié** ré-exportant `services/deployments` (`index.ts:11`). Vérifier la migration des importeurs. Trace exacte de l'appel FE **non vérifiée**.
5. **Invalidations non persistantes** (ring-buffer in-memory, `source:"in-memory"`, perdu au restart, non partagé entre instances — `cache_management.py:656-701`).
6. **Statut live `/cache/*` ≠ gate code** (finding sécurité) — détail dans le rapport privé, hors vault.

## 8. Propositions d'amélioration UX (PROPOSITIONS — pas d'édition de code)

1. **Surfacer l'espace de travail** : câbler un FE service `services/workspace` consommant saved-views/watchlist/recently-opened + chip-strip `investigation-modes`. Bénéfice : valoriser un backend déjà prêt.
2. **Migrer l'observabilité cache vers `@account_role_cache`** (dashboard/kpis/breakdown) — mutualiser le hit-rate entre utilisateurs d'un même rôle (aujourd'hui `@session_cache` = N entrées identiques). [grounded sur primitif existant]
3. **Remplacer `_require_approver_role` par `require_action`** (`deployment_tracking:platform-support:deployments:approve`) — RBAC granulaire au lieu du substring fragile.
4. **Câbler la clé `GET /deployments/track` dans le set `DEPLOYMENTS`** pour activer cache + invalidation SSE cohérente (au lieu du polling actuel `fetchRows`).
5. **Persister un log d'invalidation** (Snowflake `EVENT_STORE` ou Redis stream) au lieu du ring-buffer in-memory — observabilité fiable multi-instances.
6. **Rendre `affected_entities` actionnable côté FE** : un advisor « cache invalidation gouvernée » qui propose un refresh scopé par contexte (table/module/page/role) au lieu d'invalider toute une `CacheKey`.

## 9. Plan de test fonctionnel

> Sans token → `401` (ou `200` public sur `investigation-modes`). Obtenir un JWT (POST /signin), puis `-H "Authorization: Bearer $TOKEN"`. ⚠ Ne PAS lancer en prod : `cache/clear/*`, `cache/warmup`, `notifications/broadcast`, deployments execute/rollback (destructif / fan-out).

```bash
BASE=http://<host>     # :80 nginx ; en-tête Host si IP directe
H="-H Authorization:Bearer $TOKEN -H Content-Type:application/json"

# 1. Modèle de cache — observabilité (tout authentifié)
curl -s $H "$BASE/cache/kpis"
curl -s $H "$BASE/cache/breakdown"
curl -s $H "$BASE/cache-stream/available-keys"   # valeurs de l'enum CacheKey

# 2. Flux SSE (vérifier la réception d'events d'invalidation)
curl -sN $H "$BASE/cache-stream/stream?token=$TOKEN"   # attendu: event:connected puis cache_invalidation
# déclencher en parallèle une mutation (ex. mark-all-read) → observer l'event SSE

# 3. Notifications — inbox par-utilisateur
curl -s $H "$BASE/notifications/unread-count"
curl -s $H "$BASE/notifications?unread_only=true&page=1&page_size=20"
NID=$(curl -s $H "$BASE/notifications" | jq -r '.data.items[0].notification_id')
curl -s $H -X PATCH "$BASE/notifications/$NID/read"
curl -s $H -X POST  "$BASE/notifications/mark-all-read"
# broadcast — SUPER-ADMIN uniquement (403 SUPER_ADMIN_ONLY sinon)
curl -s $H -X POST "$BASE/notifications/broadcast" \
  -d '{"kind":"system","title":"Test","audience":"EVERYONE"}'   # attendu 403 si non super-admin

# 4. Suivi de déploiement
curl -s $H "$BASE/deployments/track?include_metrics=true&include_history=true&window_days=30"
DID=$(curl -s $H -X POST "$BASE/deployments/track" -d '{"project_id":"<pid>","requires_approval":true}' | jq -r '.data.deployment_id')
curl -s $H -X PATCH "$BASE/deployments/track/$DID/step" -d '{"step":"pre_checks","completed":true}'
# approve — APPROBATEUR uniquement (403 si rôle insuffisant — substring check)
curl -s $H -X POST "$BASE/deployments/track/$DID/approve" -d '{"comment":"ok"}'

# 5. Espace de travail (backend prêt, FE absent)
curl -s    "$BASE/api/workspace/investigation-modes"   # 200 SANS token (public)
curl -s $H "$BASE/api/workspace/saved-views?include_shared=true"
curl -s $H -X POST "$BASE/api/workspace/watchlist" -d '{"object_id":"x","object_fqn":"DB.S.T"}'
```

**Résultats attendus :**
- Sans token → `401` sur 50/51 ops ; `investigation-modes` → `200`.
- `cache-stream/stream` → un `event:connected` puis des `cache_invalidation` à chaque `@invalidates_cache` déclenché ailleurs (latence <50ms, push pur, zéro coût Snowflake).
- `broadcast` sans rôle super-admin → `403 SUPER_ADMIN_ONLY` ; `approve` sans rôle approbateur → `403`.
- Une mutation (mark-read/start/approve) → `@invalidates_cache` → Redis-delete + event SSE → FE rafraîchit la query correspondante.
- ⚠ `cache/svc-health|stats|keys|health|test-connection` répondent `200` sans auth en prod alors que le code attend `require_accountadmin_role`/`get_current_user` — **finding sécurité**, détail dans `api-endpoint-test-report-2026-06-08.md` (ne pas reproduire dans le vault).

> Vérifié 2026-06-09 : 44 endpoints vérifiés (OpenAPI + 5 slices, 0 inventé), 1 correction UI:ligne (DeploymentApprovals.tsx:343 amber block = dialog reject/rollback, pas « approbation requise » — Approve buttons = :393+), 5 claims fichier:ligne confirmés, live-retest OK (unread-count→401, investigation-modes→200, available-keys→401).
