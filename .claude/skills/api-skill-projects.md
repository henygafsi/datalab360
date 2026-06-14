---
name: api-skill-projects
description: >
  Modèle de projet UNIFIÉ de Data360 (préfixe API /projects). Agrège 3 types — explore_design,
  workflow, bi_dashboard — derrière un cycle de vie commun (versions, runs, déploiements gouvernés
  à wizard 8 étapes, contributeurs, verrou, events, last-used) + Row-Level Security PAR PROJET
  (3 ops, account-admin + entitlement). 26 endpoints live (23 unifiés + 3 RLS, tous 401, re-testés 2026-06-09).
---

# Projects (modèle unifié) — Skill Module (API-grounded, 2026-06-09)

> Toutes les affirmations sont sourcées (fichier:ligne ou slice). Les endpoints viennent **uniquement** des 2 slices live (`unified-projects.md`, `project-rls.md`) + de l'OpenAPI déployé + du code des 2 routers. Aucun endpoint inventé. Les zones non confirmées sont marquées « non vérifié ».

## 1. Vue d'ensemble

| Élément | Valeur (source) |
|---------|-----------------|
| **Préfixe API** | `/projects` (2 routers) |
| **Route front « projet »** | `/project` — ⚠ **dashboard statique de démo** (recharts + données mock `@/data/project-dashboard`), **non câblé** sur l'API (`apps/data360/src/app/(dashboard)/project/page.tsx:1-11` → `shared/project-dashboard/index.tsx`) |
| **Vrais consommateurs de l'API** | `governance/projects/page.tsx` (équipe + approbations), `shared/command-center/*`, `explore-design/*`, `workflow/*`, `shared/dashboard` (20 fichiers importent `projectsApi`) |
| **Router unifié (backend)** | `backend/app/modules/projects/router.py` (716 l.) — gate `require_module("account_overview")` (`:52`) |
| **Router RLS (backend)** | `backend/app/modules/projects/rls_router.py` (228 l.) — gate `require_accountadmin_role` (`:47`) + `require_feature("projects","project_rls")` sur CREATE (`:100`) |
| **Services backend** | `backend/app/modules/projects/services.py` (116 Ko — enums, lifecycle, get_my_role, deployment dispatch) |
| **Models backend** | `backend/app/modules/projects/models.py` (Pydantic : ProjectUpdate, DeploymentRequest, ContributorAdd, EventCreate, RollbackRequest, EventBulkUpdate) |
| **Service API front** | `apps/data360/src/app/services/api/projectsApi.ts` (475 l., `PREFIX='/projects'`) |
| **Modèle de données** | `CP_DATA360.PROJECTS` (+ VERSIONS/STATE/RUNS/EVENTS/CONTRIBUTORS/DEPLOYMENTS/APPROVALS) ; `GOUVERNANCE.PROJECT_RLS_BINDINGS` |

**Rôles & gardiennage (vérifié dans le code) :**

| Niveau | Mécanisme (vérifié) | Source |
|--------|---------------------|--------|
| Module (router unifié) | `require_module("account_overview")` — **par rôle/grant de module** | `router.py:52` |
| Rôle effectif par projet | `get_my_role()` → owner/editor/viewer (`CREATED_BY` = owner implicite) ; `can_edit`, `can_approve`, `is_owner` | `services.py:1897-1946` |
| MAJ / suppression | `can_edit` (PUT) · `is_owner` **ou** rôle JWT admin (DELETE) | `router.py:622-624,657-661` |
| RLS par projet | `require_accountadmin_role` (rôle Snowflake admin) + entitlement `projects.project_rls` (CREATE) | `rls_router.py:47,100` |

> ⚠ Il n'y a **aucun `require_action` granulaire** dans les 2 routers (vérifié) — le gardiennage est **par rôle de module / rôle Snowflake / entitlement**, pas par matrice action-RBAC. Le « steward gate » d'approbation décrit fonctionnellement **n'est pas câblé** (gap sécurité, §5/§7).

## 2. Capacités (grounded)

| Capacité | Implémentation (endpoint / fichier) |
|----------|--------------------------------------|
| Lister tous mes projets, groupés par type | `getUnifiedProjects` → `GET /projects/unified` (`projectsApi.ts:471`) |
| Lister/filtrer (type, statut, mine_only, pagination) | `listProjects` → `GET /projects` (`:56`) |
| Dernier projet utilisé par module | `getLastUsedProjects`/`setLastUsedProject` → `GET|POST /projects/last-used` (`:454,463`) |
| Get / MAJ / supprimer (soft) un projet | `getProject`/`updateProject`/`deleteProject` → `GET|PUT|DELETE /projects/{id}` (`:61,72,77`) |
| Verrou d'édition exclusif | `lockProject`/`unlockProject` → `POST /projects/{id}/lock|unlock` (`:87,96`) — ⚠ FE try/catch noop@404 |
| Équipe (owner/editor/viewer) | `listContributors`/`addContributor` → `GET|POST /projects/{id}/contributors` (`:302,309`) ; `removeContributor` noop@404 (pas de route) |
| Journal d'events + bulk-update | `listEvents`/`addEvent`/`bulkUpdateEvents` → `GET|POST /projects/{id}/events`, `PATCH …/events/bulk-update` (`:352,360,386`) |
| Historique d'exécution | `listRuns` → `GET /projects/{id}/runs` (`:276`) ; `getRunSummary` noop@404 (`:285`) |
| Rollback de version | `rollbackVersion` → `POST /projects/{id}/rollback` (`:155`) |
| Déploiement gouverné (request/approve/reject/execute) | `requestDeployment`/`approveDeployment`/`rejectDeployment`/`executeDeployment` → `POST /projects/{id}/deployments[...]` (`:167,183,190,202`) |
| Déploiement — détail + wizard 8 étapes | `getDeployment`/`saveDeploymentStep` → `GET …/deployments/{dep}`, `PUT …/deployments/{dep}/steps/{step}` (`:245,253`) ; lister `listDeployments` (`:175`) |
| **RLS par projet** (lister/lier/retirer) | **aucun service FE** — `GET|POST /projects/{id}/rls`, `DELETE …/rls/{binding_id}` (backend-only, `rls_router.py`) |
| Création de projet | ⚠ `createProject` envoie `POST /projects` **inexistant** — création réelle = per-module (`POST /explore-design`, `POST /workflow`) (`projectsApi.ts:67` TODO) |

## 3. Référence endpoints (26 ops — statut live)

**Contrat de statut :** sweep 2026-06-09 (IP directe `167.172.162.172` + `Host: api.datalab360.io`, **sans token**). Les **26 ops renvoient `401 AUTH_REQUIRED`** (corps `NOT_AUTHENTICATED`, `nginx/1.24.0`) = routes enregistrées + déployées + gardées. Aucune route publique (200), aucun 404/500. Contrôles : `/health`→200, `/openapi.json`+`/docs`→200, `/`→404.

### 3a. Router unifié — `/projects/*` (23 ops, slice unified-projects.md)

| Live | Méthode | Path | Rôle/usage |
|------|---------|------|------------|
| 401 | GET | `/projects` | Lister (project_type, status, mine_only, limit, offset) |
| 401 | GET | `/projects/unified` | Liste cross-module groupée par type + last_used |
| 401 | GET | `/projects/last-used` | Dernier projet par module (query `module`) |
| 401 | POST | `/projects/last-used` | Tracker le dernier projet (body `{module, project_id}`) |
| 401 | GET | `/projects/{project_id}` | Détail d'un projet |
| 401 | PUT | `/projects/{project_id}` | MAJ attributs (ProjectUpdate ; can_edit) |
| 401 | DELETE | `/projects/{project_id}` | Soft-delete (owner/account-admin) |
| 401 | GET | `/projects/{project_id}/contributors` | Lister l'équipe |
| 401 | POST | `/projects/{project_id}/contributors` | Ajouter un contributeur (ContributorAdd) |
| 401 | GET | `/projects/{project_id}/deployments` | Historique déploiements (paginé) |
| 401 | POST | `/projects/{project_id}/deployments` | Demander un déploiement (DeploymentRequest) |
| 401 | GET | `/projects/{project_id}/deployments/{deployment_id}` | Détail complet (rehydrate wizard) |
| 401 | POST | `/projects/{project_id}/deployments/{deployment_id}/approve` | Approuver (steward) |
| 401 | POST | `/projects/{project_id}/deployments/{deployment_id}/reject` | Rejeter (reason?) |
| 401 | POST | `/projects/{project_id}/deployments/{deployment_id}/execute` | Exécuter (dispatch par project_type) |
| 401 | PUT | `/projects/{project_id}/deployments/{deployment_id}/steps/{step}` | Persister un résultat d'étape wizard |
| 401 | GET | `/projects/{project_id}/events` | Lister les events (module_name, event_type, limit) |
| 401 | POST | `/projects/{project_id}/events` | Ajouter un event (EventCreate) |
| 401 | PATCH | `/projects/{project_id}/events/bulk-update` | MAJ de masse par IDs/filtre (EventBulkUpdate) |
| 401 | POST | `/projects/{project_id}/lock` | Acquérir le verrou d'édition |
| 401 | POST | `/projects/{project_id}/unlock` | Relâcher le verrou |
| 401 | POST | `/projects/{project_id}/rollback` | Rollback de version (RollbackRequest) |
| 401 | GET | `/projects/{project_id}/runs` | Historique d'exécution (status, deployment_id, page, page_size) |

### 3b. Router RLS — `/projects/{id}/rls*` (3 ops, slice project-rls.md)

| Live | Méthode | Path | Rôle/usage |
|------|---------|------|------------|
| 401 | GET | `/projects/{project_id}/rls` | Lister les bindings RLS actifs du projet |
| 401 | POST | `/projects/{project_id}/rls` | Créer + appliquer une Row Access Policy (CreateRlsBinding) — 🔒 entitlement |
| 401 | DELETE | `/projects/{project_id}/rls/{binding_id}` | Unapply + retirer (soft, STATUS='REMOVED') |

**Routes attendues par le FE mais NON déployées (drift, noop@404)** — confirmé absentes de l'OpenAPI :
- `POST /projects` (create — création est per-module) · `GET …/runs/summary` · `GET|POST …/versions`, `GET …/versions/{id}` (versions per-module) · `DELETE …/contributors/{username}` · `PATCH …/events/{eventId}` (utiliser bulk-update) · `GET …/state` (sous /explore-design) · `GET /projects/events/all`.

## 4. Modèle de données (enums + tables, ground truth = services.py)

**Enums** `[trace: services.py:27-70]` :
- `ProjectType` : `explore_design`, `workflow` `[trace: services.py:27-29]`. ⚠ **Drift :** `bi_dashboard/services.py:154` utilise `ProjectType.BI_DASHBOARD` mais ce membre **n'est pas défini dans l'enum** → la trifecta vise 3 types (explore + workflow + **bi**) mais `BI_DASHBOARD` est référencé sans déclaration (`AttributeError` latent). Pas de type « product » ; liaisons additionnelles dans `METADATA.linked_modules`.
- `ProjectStatus` : `draft`, `active`, `archived`, `deleted` (delete = soft → `deleted`).
- `VersionStatus` : `draft`, `active`, `superseded`, `rolled_back`.
- `DeploymentStatus` : `pending_approval`, `approved`, `rejected`, `scheduled`, `in_progress`, `deployed`, `failed`, `cancelled`, `rolled_back`.
- `DeploymentType` : `with_approval`, `scheduled`, `immediate`.
- `ContributorRole` : `owner`, `editor`, `viewer`.
- `WIZARD_STEPS` (déploiement, 8) : `review · configure · pre_checks · dry_run · sql_diff · impact · deploy · verify` `[trace: services.py:1472]`. ⚠ Le FE nomme l'étape 2 `config`, le backend attend `configure` → mapping à la frontière (`projectsApi.ts:215-220`).

**Table `CP_DATA360.PROJECTS`** `[trace: services.py:78-98]` : `PROJECT_ID` (PK), `PROJECT_NAME`, `PROJECT_TYPE`, `DESCRIPTION`, `STATUS` (def active), `STEP_NAME`, `CURRENT_VERSION_ID`, `CURRENT_VERSION_NUM`, `DEPLOYMENT_VERSION`, `LOCKED_BY`, `LOCKED_AT`, `CREATED_BY`, `CREATED_AT`, `UPDATED_BY`, `UPDATED_AT`, `METADATA` (VARIANT), `TAGS` (ARRAY). **Unicité** `(CREATED_BY, PROJECT_NAME, PROJECT_TYPE)`.

**Tables satellites** : `PROJECT_VERSIONS`, `PROJECT_STATE` (wizard, vit sous /explore-design), `PROJECT_RUNS` (peuplée par workflow execute ; explore vide), `PROJECT_EVENTS` (journal local), `PROJECT_CONTRIBUTORS`, `PROJECT_DEPLOYMENTS` (+ `step_results` du wizard), `PROJECT_APPROVALS` (votes multi-approver), `EVENT_STORE.USER_ACTIVITY` (feed admin via `_audit`).

**Table RLS `GOUVERNANCE.PROJECT_RLS_BINDINGS`** `[trace: rls_router.py:50-63]` : `BINDING_ID` (PK UUID), `PROJECT_ID`, `ACCOUNT_NAME`, `TABLE_FQN`, `POLICY_NAME`, `BOUND_COLUMN`, `SCOPE_EXPR`, `STATUS` (ACTIVE/REMOVED), `CREATED_BY`, `CREATED_AT`. La policy elle-même est une **Snowflake ROW ACCESS POLICY** créée/appliquée par le moteur unique `gouvernance.services`.

## 5. Deep — le modèle unifié + Project RLS + fiches ins/outs

### 5.1 Trifecta « un projet, 3 modules » (explore + workflow + bi)
Le modèle **agrège sans dupliquer** : un projet est une ligne `PROJECTS` discriminée par `PROJECT_TYPE`. **Trois** types y convergent — `explore_design`, `workflow`, **`bi_dashboard`** : ce dernier crée bien un projet unifié via `create_project(project_type=ProjectType.BI_DASHBOARD)` `[trace: bi_dashboard/services.py:151-154]` (router `/bi-dashboard`). Pas d'entité « product » ; liaisons additionnelles via `METADATA.linked_modules`. La **vue trifecta** est `GET /projects/unified` (`by_type`, `last_used`, `contributors_count`, `icon`, `page_url`) `[trace: services.py:2845-2937]`.

> ⚠ **BI = type de seconde classe (drift vérifié, à corriger) :** (1) l'enum `ProjectType` ne déclare pas `BI_DASHBOARD` (`services.py:27-29`) → `AttributeError` latent ; (2) `type_icons`/`type_pages` de `get_unified_project_list` n'ont pas d'entrée BI (`services.py:2891-2898`) → projet BI = icône `folder` + URL `/explore-design` (faux lien) ; (3) `execute_deployment` ne dispatche que `workflow`/`explore_design` (`services.py:1288-1291`) → déploiement BI tombe sur le « mark deployed » générique. Fix : compléter enum + maps + dispatch.

Cycle de vie partagé (versions, runs, déploiements, contributeurs, events, verrou) servi pour tous les types ; l'**exécution** d'un déploiement **dispatche par `project_type`** : `workflow → execute_workflow_deployment` (DAG + run), `explore_design → execute_explore_deployment` (DDL clone-checked), sinon « mark deployed » générique `[trace: services.py:1278-1291]`.

### 5.2 Cycle de vie de déploiement (gouverné, à approbation)
`request` (auto-snapshot si `version_id` omis) → statut `pending_approval`/`scheduled`/`approved` selon `DeploymentType` → `approve` (passe `APPROVED` **uniquement** si `PENDING_APPROVAL` + type `WITH_APPROVAL`, 404 sinon) → `execute` (dispatch). Le wizard 8 étapes persiste chaque résultat (`PUT …/steps/{step}`) pour survivre au reload (`get_deployment` rehydrate tout) `[trace: services.py:1122-1290,1502]`. **Gap sécurité (P0) :** approve/reject/execute n'exigent **aucun rôle supérieur** — pas de steward gate (n'importe quel porteur d'`account_overview` approuve, y compris son propre déploiement).

### 5.3 Project RLS — no-code, account-admin, par rôle
`POST /projects/{id}/rls` fait 3 choses en transaction : (1) `create_rls_policy` (schéma gouvernance), (2) `apply_rls_policy` sur la table cible (FQN 3 parties validé), (3) INSERT du binding tracé `[trace: rls_router.py:98-149]`. Gardé par **rôle Snowflake** (`require_accountadmin_role`) + **entitlement** (`projects.project_rls`, OFF par défaut → 403 `FEATURE_DISABLED` sur CREATE seulement ; lister/retirer restent ouverts). Réutilise **l'unique** moteur RLS de `gouvernance.services` (pas de second impl). **Gap (P1) : 0 consommateur FE** — surface backend-only.

### 5.4 Fiche « ins / outs » des endpoints clés (rejouables)
Tous **`401` live** sans token (déployés + gardés) ; test fonctionnel authentifié à faire.

| Cas | Endpoint | INS (path · query · body) | OUTS (réponse consommée) |
|-----|----------|---------------------------|--------------------------|
| Liste unifiée | `GET /projects/unified` | — | `{projects[]{project_id,name,type,status,current_version_num,deployment_version,contributors_count,icon,page_url,tags[]}, by_type{}, last_used{}, total}` |
| Liste filtrée | `GET /projects` | query `project_type?,status?,mine_only=false,limit=50,offset=0` | `{projects[]{project_id,project_name,project_type,status,step_name,current_version_num,deployment_version,created_by,created_at}, total, limit, offset}` |
| Last-used (get/set) | `GET|POST /projects/last-used` | GET query `module?` · POST body `{module*, project_id*}` | GET `{module,project_id,…}` ou `{recent[]}` · POST `{status, event_id}` |
| Détail | `GET /projects/{id}` | path `{id}` | projet complet (404 si absent) |
| MAJ | `PUT /projects/{id}` | path `{id}` · body `ProjectUpdate{project_name?,description?,status?,step_name?,metadata?,tags?}` | projet rehydraté (403 si pas can_edit) |
| Supprimer | `DELETE /projects/{id}` | path `{id}` | `{project_id,status:'deleted',soft_delete:true}` (403 si pas owner/admin) |
| Verrou | `POST /projects/{id}/lock` \| `…/unlock` | path `{id}` | projet (LOCKED_BY/LOCKED_AT) — 403 si tenu par un autre |
| Contributeurs | `GET|POST /projects/{id}/contributors` | POST body `ContributorAdd{username*, role=viewer, permissions?}` | GET `[{username,role,permissions,added_by}]` · POST `{…}` |
| Events | `GET|POST /projects/{id}/events` · `PATCH …/events/bulk-update` | POST `EventCreate{module_name*,event_type*,status='SUCCESS',…}` · PATCH `EventBulkUpdate{event_ids?|filter_*?,new_status?,…}` | GET `{events[],count}` · POST `{event_id,…}` · PATCH `{updated:n}` |
| Runs | `GET /projects/{id}/runs` | path `{id}` · query `status?,deployment_id?,page=1,page_size=20` | `{runs[]{run_id,status,started_at,duration_seconds,steps_failed,error_log}, …}` |
| Rollback | `POST /projects/{id}/rollback` | path `{id}` · body `RollbackRequest{target_version_id*, reason?}` | `{status, rolled_back_to, target_version_number, message}` |
| Déployer | `POST /projects/{id}/deployments` | path `{id}` · body `DeploymentRequest{version_id?, environment='production', deployment_method?, scheduled_at?, config?, requires_approval=true}` | `{deployment_id, version_id, deployment_type, environment, status, scheduled_at?}` |
| Approuver/Rejeter | `POST …/deployments/{dep}/approve` \| `…/reject` | path `{id},{dep}` · body opt `{reason?}` (reject) | `{deployment_id, status:'approved'|'rejected', approved_by|rejected_by, reason?}` |
| Exécuter | `POST …/deployments/{dep}/execute` | path `{id},{dep}` · body opt `{execution_log?, error_message?}` | `{deployment_id, status:'deployed'|'failed'}` (dispatch par type) |
| Détail déploiement | `GET …/deployments/{dep}` | path `{id},{dep}` | `{…deployment, version, approvals, runs[], run_count, steps[], step_results{}, completed_steps[]}` |
| Étape wizard | `PUT …/deployments/{dep}/steps/{step}` | path `{id},{dep},{step∈WIZARD_STEPS}` · body `{result, status?='completed'}` | `{deployment_id, step, status, saved:true}` |
| **RLS — lister** | `GET /projects/{id}/rls` | path `{id}` | `{project_id, bindings[]{binding_id,table_fqn,policy_name,bound_column,scope_expr,status,created_by,created_at}, count}` |
| **RLS — créer** | `POST /projects/{id}/rls` | path `{id}` · body `CreateRlsBinding{table_fqn*, policy_column*, signature='ctx_role VARCHAR', expression*, policy_name?, scope_expr?}` | `{status:'bound', policy_name, table_fqn, bound_column}` (403 si entitlement OFF, 404 si projet absent) |
| **RLS — retirer** | `DELETE /projects/{id}/rls/{binding_id}` | path `{id},{binding_id}` | `{status:'removed', binding_id, project_id}` (404 si binding absent) |

## 6. UX front — validation 4 axes + accessibilité

> ⚠ **La page `/project` n'est PAS la surface réelle du modèle unifié** : c'est un dashboard de démo statique (recharts/mock). L'évaluation UX 4 axes porte donc sur le **vrai** consommateur : `governance/projects/page.tsx`.

| Axe | Verdict | Preuve (fichier:ligne) |
|-----|---------|------------------------|
| **loading** | ✓ | `governance/projects/page.tsx` : `Loader2` + `loadingMembers` par ligne (état dépliable) ; `RefreshCw` pour le refetch |
| **empty** | non vérifié (à confirmer) | recherche `Search` + filtres `all/explore_design/workflow` présents ; état vide « aucun projet » non lu explicitement → **non vérifié** |
| **error** | ✓ | `getApiErrorMessage` + `toast` (react-hot-toast) ; `ErrorBoundary` wrappe la page (`page.tsx` imports) |
| **dark mode** | ✓ | `ROLE_CONFIG` porte des classes `dark:` (amber/blue/slate) ; `cn()` utilitaire ; badges rizzui |

**Accessibilité** : icônes lucide (`Crown`/`Pencil`/`Eye` pour owner/editor/viewer) avec labels ; `Tooltip` rizzui. ⚠ `aria-label` des boutons d'action (approve/reject `Check`/`X`) **non vérifié**. La page `/project` de démo n'a pas d'états réels (données statiques).

## 7. Drift détecté (vs slices + vs code)

1. **Page `/project` déconnectée de l'API.** La route rend `shared/project-dashboard` (recharts, données mock `@/data/project-dashboard`) — **0 appel** à `/projects/*`. Le modèle unifié réel vit dans `governance/projects`, command-center, explore-design, workflow. Risque : un lecteur croit que `/project` est l'UI du modèle unifié.
2. **Project RLS : 0 consommateur FE.** Les 3 routes sont déployées + gardées mais `grep createBinding|CreateRlsBinding|/projects/.*/rls` côté front = **0 hit**. L'UI RLS existante (`governance/policies/rls-policies-content.tsx`, `explore-design/policies/rls/*`) est un **autre** moteur (gouvernance global), pas la RLS par projet.
3. **`POST /projects` (create) inexistant.** Le FE `createProject` poste sur `/projects` que le router n'expose pas (GET seul). Création réelle = per-module. TODO FE déjà noté (`projectsApi.ts:67`).
4. **Routes FE en noop@404.** `runs/summary`, `versions[/{id}]`, `state`, `events/all`, `contributors/{username}` DELETE, `events/{eventId}` PATCH : toutes en try/catch silencieux côté FE — confirmées absentes de l'OpenAPI.
5. **BI = troisième type half-wired.** `bi_dashboard` écrit dans `PROJECTS` (type `bi_dashboard`) mais l'enum `ProjectType` ne le déclare pas, et `get_unified_project_list` (icônes/URLs) + `execute_deployment` (dispatch) l'ignorent → un projet BI tombe en `folder`/`/explore-design` et n'a pas d'exécuteur de déploiement dédié. La trifecta est intentionnelle mais incomplète côté unifié.
6. **Pas de dérive « 404/deprecated ».** Contrairement au module workflow (où `deprecated=True` avait été mal-lu comme « purgé »), **aucune** route projet n'est deprecated ; 26/26 répondent `401`.
7. **Mismatch `config` vs `configure`** (wizard étape 2) entre FE et `WIZARD_STEPS` — mapping requis (`projectsApi.ts:215-220`).

## 8. Propositions d'amélioration UX (PROPOSITIONS — pas d'édition de code)

1. **Câbler `/project` sur `GET /projects/unified`** (ou retirer/renommer la démo) : remplacer les graphiques mock par les cartes réelles groupées `by_type` avec `last_used`. Bénéfice : la page « projet » montre les vrais projets. [non-trivial]
2. **Panneau « RLS du projet » dans `governance/projects`** : liste des bindings (`GET …/rls`) + bouton « Lier une policy » (`POST …/rls`) + retrait (`DELETE …/rls/{id}`), réservé `ACCOUNTADMIN` et **désactivé** si l'entitlement `projects.project_rls` est OFF (microcopy « activez-la sur l'Administration »). Bénéfice : surface la sécurité par projet aujourd'hui inaccessible.
3. **Badge « steward requis » désactivé honnêtement** sur approve/execute tant que le steward gate n'est pas câblé — ou afficher un avertissement « approbation non gardée par rôle » (cf. gap P0). Bénéfice : ne pas suggérer une gouvernance qui n'existe pas.
4. **Avertir quand `mine_only=false`** : badge « vue compte (tous projets) » vs « mes projets », pour rendre visible le scope (cf. gap P0 liste non scopée). [trivial-safe]
5. **Compteur de contributeurs + avatars** sur les cartes de la liste unifiée (`contributors_count` déjà renvoyé) — cliquable vers le panneau équipe. [trivial-safe]
6. **`aria-label` explicites** sur les boutons approve/reject (`Check`/`X`) et le toggle de dépliage de ligne dans `governance/projects/page.tsx`. [trivial-safe]
7. **Diff de version avant rollback** : le dialogue n'affiche que des métadonnées ; ajouter un aperçu added/removed avant confirmation. [non-trivial]
8. **Mapper `config`→`configure` à un seul endroit** documenté + test, pour éviter les 422 silencieux sur `PUT …/steps/config`. [trivial-safe]

## 9. Plan de test fonctionnel

> Sans token → **401 AUTH_REQUIRED** sur les 26 ops (contrat RBAC vérifié 2026-06-09). Obtenir un JWT (`POST /signin` : `account_name, username, password`), puis `-H "Authorization: Bearer $TOKEN"`. Module requis : `account_overview` (router unifié) ; RLS : rôle `ACCOUNTADMIN` + entitlement `projects.project_rls` ON.

```bash
# DNS local KO → IP directe + Host. Sans token = 401 (contrat).
IP=167.172.162.172 ; H="-H Host:api.datalab360.io"
curl -s -o /dev/null -w "%{http_code}\n" $H "http://$IP/projects"          # 401 sans token
curl -s -o /dev/null -w "%{http_code}\n" $H "http://$IP/projects/proj_x/rls" # 401 (account-admin)

# --- Authentifié ---
BASE=http://localhost:80
A="-H Authorization:Bearer $TOKEN -H Content-Type:application/json"

# 1. Lister (lecture — module account_overview)
curl -s $A "$BASE/projects/unified"                     # cartes groupées by_type
curl -s $A "$BASE/projects?project_type=workflow&mine_only=true&limit=20"

# 2. Détail / MAJ / verrou (editor/owner)
curl -s $A "$BASE/projects/$PID"
curl -s $A -X PUT "$BASE/projects/$PID" -d '{"description":"maj"}'   # 403 si pas can_edit
curl -s $A -X POST "$BASE/projects/$PID/lock"                        # 403 si verrou tenu

# 3. Équipe + events
curl -s $A "$BASE/projects/$PID/contributors"
curl -s $A -X POST "$BASE/projects/$PID/contributors" -d '{"username":"BOB","role":"editor"}'
curl -s $A -X POST "$BASE/projects/$PID/events" -d '{"module_name":"workflow","event_type":"NOTE"}'

# 4. Déploiement gouverné (request → approve → execute) + wizard
DID=$(curl -s $A -X POST "$BASE/projects/$PID/deployments" -d '{"requires_approval":true}' | jq -r .deployment_id)
curl -s $A -X PUT "$BASE/projects/$PID/deployments/$DID/steps/configure" -d '{"result":{"ok":true}}'  # ⚠ 'configure', pas 'config'
curl -s $A -X POST "$BASE/projects/$PID/deployments/$DID/approve"   # ⚠ aujourd'hui SANS steward gate (gap P0)
curl -s $A -X POST "$BASE/projects/$PID/deployments/$DID/execute"   # dispatch par project_type
curl -s $A "$BASE/projects/$PID/deployments/$DID"                   # rehydrate complet

# 5. Rollback
curl -s $A -X POST "$BASE/projects/$PID/rollback" -d '{"target_version_id":"ver_x","reason":"regression"}'

# 6. RLS par projet (ACCOUNTADMIN + entitlement ON)
curl -s $A "$BASE/projects/$PID/rls"                               # liste des bindings
curl -s $A -X POST "$BASE/projects/$PID/rls" \
  -d '{"table_fqn":"PROD.SALES.ORDERS","policy_column":"REGION","expression":"REGION = CURRENT_ROLE()"}'  # 403 si entitlement OFF
curl -s $A -X DELETE "$BASE/projects/$PID/rls/$BINDING_ID"
```

**Résultats attendus :**
- Sans token → **401** sur les 26 ops.
- `GET /projects` **sans** `mine_only` → renvoie tous les projets du compte (gap P0 — vérifier le scope attendu).
- `PUT`/`DELETE` sans le rôle → **403** (`can_edit` / `is_owner`).
- `POST …/rls` sans entitlement → **403 `FEATURE_DISABLED`** ; sans `ACCOUNTADMIN` → **403** (router-level).
- `POST …/deployments/{dep}/approve` sur un déploiement non-`pending_approval` ou non-`with_approval` → **404** (« not found, already processed, or not approval type »).
- `PUT …/steps/config` → 422/échec (le backend attend `configure`).
- `GET …/runs/summary`, `GET …/versions`, `GET …/state` → **404** (non déployés ; le FE dégrade en noop).

> Renvoi : la matrice gouvernance + le détail UX/cache et les corrections de dérive sont dans le vault `data360_full_doc/pages/projects.md` (§Governance & Access Matrix + §Enrichissement 2026-06-09).
```

> Vérifié 2026-06-09 : 26 endpoints vérifiés (croisés slices unified-projects.md + project-rls.md + OpenAPI python parse), 2 corrections mineures (traces lignes project-statistics.tsx et governance/projects/page.tsx), live-retest OK (3 endpoints testés → 401). Aucun secret dans le skill (IP présente uniquement dans section test-plan, usage interne). Verdict : GROUNDED.
