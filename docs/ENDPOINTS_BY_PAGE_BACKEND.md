# Data360 – Endpoints par page et résultats de tests (équipe Backend)

**Projet :** datalab360Front (frontend) → Backend (FastAPI)  
**Date du rapport :** 2026-02-05  
**Base URL API :** `NEXT_PUBLIC_API_URL` (défaut : `http://127.0.0.1:8000`)

---

## 1. Comment exécuter les tests (Register → Sign-in → Token sur toutes les pages)

**Script principal (liste complète par page + statut + erreurs) :**

```bash
# Depuis la racine du frontend (datalab360Front)
./test-endpoints-by-page.sh http://127.0.0.1:8000
```

Ce script :
1. **Register** – tente de créer un compte (POST `/user/register/`)
2. **Sign-in** – tente de se connecter (POST `/user/login/`)
3. Utilise le token obtenu (ou `TEST_TOKEN` si fourni) pour **tous les endpoints de toutes les pages et sous-pages**
4. Enregistre pour chaque appel : **page**, **sous-page**, **endpoint**, **méthode**, **statut HTTP**, **message d’erreur** (corps de la réponse en cas d’échec)

**Rapport généré :** `docs/ENDPOINTS_FULL_TEST_REPORT.md` (liste complète par page, statut et erreurs).

**Données requises par action (chaque module) :** voir `docs/MODULE_PAGES_ACTIONS_DATA.md` (body, query, headers pour chaque action de chaque page).

**Tester avec un compte existant (token sur tout le parcours) :**

```bash
# Option A : fournir un JWT déjà obtenu
export TEST_TOKEN="<votre_jwt>"
./test-endpoints-by-page.sh http://127.0.0.1:8000

# Option B : fournir compte / utilisateur / mot de passe (login sera tenté après register)
export TEST_ACCOUNT="MonOrg"
export TEST_USERNAME="monuser"
export TEST_PASSWORD="MonMotDePasse"
./test-endpoints-by-page.sh http://127.0.0.1:8000
```

**Script alternatif (sous-ensemble rapide) :** `./test-full-flow.sh` → génère `docs/ENDPOINTS_TEST_RESULTS.md`.

---

## 2. Auth & Création de compte

| Page / Flux | Endpoint | Méthode | Corps / Query | Résultat test (sans compte existant) |
|-------------|----------|---------|----------------|--------------------------------------|
| **Sign-up (création compte)** | `/user/register/` | POST | `organisation_name`, `username`, `email`, `password`, `confirm_password` | 422 (validation) ou 201 si Snowflake/GitLab OK |
| **Sign-in (connexion)** | `/user/login/` | POST | `account_name`, `username`, `password` | 500 (compte inexistant) ou 200 + `access_token` |
| **Modules utilisateur** | `/user/me/modules` | GET | Header: `Authorization: Bearer <token>` | 401 sans token, 200 avec token |

---

## 3. Dashboard principal (Gouvernance)

**Fichiers frontend :** `shared/dashboard/`, `services/gouvernance/index.ts`

| Endpoint | Méthode | Query / Corps | Résultat test |
|----------|---------|----------------|---------------|
| `/gouvernance/client/dashboard` | GET | - | 401 sans token |
| `/gouvernance/dashboard/activity` | GET | `start_date`, `end_date`, `username`, `module_name`, `event_type`, `query_status` | 401 sans token |
| `/gouvernance/get_stage_storage_info` | GET | - | 401 sans token |
| `/gouvernance/get_dwh_storage_info` | GET | `database_name`, `schema_name` | 401 sans token |
| `/gouvernance/get_src_table_storage_info` | GET | - | 401 sans token |
| `/gouvernance/get_dwh_schemas` | GET | - | 401 sans token |
| `/gouvernance/get_dwh_health_info` | GET | `schema_name` | 401 sans token |
| `/gouvernance/get_user_info` | GET | - | 401 sans token |
| `/gouvernance/info` | GET | - | 401 sans token |
| `/gouvernance/user/mfa/status` | GET | `username` | 401 sans token |
| `/gouvernance/user/mfa/set` | POST | `username`, `enable` | 401 sans token |

---

## 4. Gouvernance – Utilisateurs

**Pages :** `(dashboard)/tables/gouvernance/`, `shared/gouvernance/users/`  
**Services :** `services/gouvernance/fetch_users.ts`, `user_roles.ts`

| Endpoint | Méthode | Résultat test |
|----------|---------|----------------|
| `/gouvernance/users` | GET | 401 sans token |
| `/gouvernance/users/{username}` | GET | 401 sans token |
| `/gouvernance/users/{username}/roles` | GET | 401 sans token |
| `/gouvernance/users/{username}/security-profile` | GET | 401 sans token |
| `/gouvernance/roles-for-user/{username}` | GET | 401 sans token |
| `/gouvernance/users-with-roles` | GET | 401 sans token |
| `/gouvernance/assign-role` | POST | 401 sans token |
| `/gouvernance/unassign-role` | DELETE | 401 sans token |
| `/gouvernance/users/{username}/roles` | PUT | 401 sans token |
| `/gouvernance/grants` | GET | 401 sans token |

---

## 5. Gouvernance – Rôles

**Services :** `services/gouvernance/fetch_roles.ts`

| Endpoint | Méthode | Corps (ex.) | Résultat test |
|----------|---------|-------------|---------------|
| `/gouvernance/roles` | GET | - | 401 sans token |
| `/gouvernance/add-role` | POST | `{ "role_name": "..." }` | 401 sans token |

---

## 6. Gouvernance – Security Matrix & Axes

**Services :** `services/gouvernance/security_matrix.ts`, `security-matrix.ts`

| Endpoint | Méthode | Résultat test |
|----------|---------|----------------|
| `/gouvernance/security-matrix` | GET | 401 sans token |
| `/gouvernance/security-matrix/init` | POST | 401 sans token |
| `/gouvernance/security-matrix` | POST | 401 sans token |
| `/gouvernance/security-matrix/bulk` | POST | 401 sans token |
| `/gouvernance/security-matrix/{id}` | PUT | 401 sans token |
| `/gouvernance/security-matrix/{id}` | DELETE | 401 sans token |
| `/gouvernance/security-matrix/role/{roleName}` | DELETE | 401 sans token |
| `/gouvernance/security-axes` | GET | 401 sans token |
| `/gouvernance/security-axes` | POST | 401 sans token |
| `/gouvernance/rls-policies` | GET | 401 sans token |
| `/gouvernance/policy-assignments` | POST | 401 sans token |

---

## 7. Gouvernance – Policies (RLS, Masking, etc.)

**Router backend :** `routers/governance_policies.py` – préfixe `/gouvernance/policies`

| Endpoint | Méthode | Résultat test |
|----------|---------|----------------|
| `/gouvernance/policies/row-access/list` | GET | 401 sans token |
| `/gouvernance/policies/row-access` | POST | 401 sans token |
| `/gouvernance/policies/row-access/apply` | POST | 401 sans token |
| `/gouvernance/policies/row-access/remove` | POST | 401 sans token |
| `/gouvernance/policies/row-access/{policy_name}/details` | GET | 401 sans token |
| `/gouvernance/policies/row-access/{policy_name}` | DELETE | 401 sans token |
| `/gouvernance/policies/masking/list` | GET | 401 sans token |
| `/gouvernance/policies/masking` | POST | 401 sans token |
| `/gouvernance/policies/masking/apply` | POST | 401 sans token |
| `/gouvernance/policies/masking/remove` | POST | 401 sans token |
| `/gouvernance/policies/masking/columns/list` | GET | 401 sans token |
| `/gouvernance/policies/masking/{policy_name}/details` | GET | 401 sans token |
| `/gouvernance/policies/masking/{policy_name}` | DELETE | 401 sans token |
| `/gouvernance/policies/network/list` | GET | 401 sans token |
| `/gouvernance/policies/network` | POST | 401 sans token |
| `/gouvernance/policies/network/{policy_name}/details` | GET | 401 sans token |
| `/gouvernance/policies/network/{policy_name}` | DELETE | 401 sans token |
| `/gouvernance/policies/tags/list` | GET | 401 sans token |
| `/gouvernance/policies/tags` | POST | 401 sans token |
| `/gouvernance/policies/tags/apply` | POST | 401 sans token |
| `/gouvernance/policies/tags/remove` | POST | 401 sans token |
| `/gouvernance/policies/password/list` | GET | 401 sans token |
| `/gouvernance/policies/password` | POST | 401 sans token |
| `/gouvernance/policies/session/list` | GET | 401 sans token |
| `/gouvernance/policies/session` | POST | 401 sans token |
| `/gouvernance/policies/aggregation/list` | GET | 401 sans token |
| `/gouvernance/policies/aggregation` | POST | 401 sans token |
| `/gouvernance/policies/objects/databases` | GET | 401 sans token |
| `/gouvernance/policies/objects/schemas/{database}` | GET | 401 sans token |
| `/gouvernance/policies/objects/tables/{database}/{schema}` | GET | 401 sans token |
| `/gouvernance/policies/objects/columns/{database}/{schema}/{table}` | GET | 401 sans token |
| `/gouvernance/policies/health` | GET | 401 sans token |

---

## 8. Mapping (Data Mapping Wizard)

**Pages :** `(dashboard)/mapping/`  
**Services :** `services/mapping/*.ts`, appels directs dans composants

| Endpoint | Méthode | Query / Corps | Résultat test |
|----------|---------|----------------|---------------|
| `/mapping/databases` | GET | - | 401 sans token |
| `/mapping/schemas/{database_name}` | GET | - | 401 sans token |
| `/mapping/tables/{database_name}/{schema_name}` | GET | - | 401 sans token |
| `/mapping/get_table_columns/` | GET | `database_name`, `schema_name`, `table_name` | 401 sans token |
| `/mapping/manage_table` | POST | corps métier | 401 sans token |
| `/mapping/update_column_length/` | POST | corps métier | 401 sans token |
| `/mapping/test_mapping/` | POST | corps métier | 401 sans token |
| `/mapping/constraints` | GET | `database_name`, `schema_name` | 401 sans token |
| `/mapping/details` | GET | - | 401 sans token |
| `/mapping/create_project` | POST | corps métier | 401 sans token |
| `/mapping/get_projects` | POST | corps (ex. `{}`) | 401 sans token |
| `/mapping/add-event/` | POST | corps métier | 401 sans token |
| `/mapping/primary-key` | POST | corps métier | 401 sans token |
| `/mapping/store-selected-columns` | POST | corps métier | 401 sans token |
| `/mapping/describe-selected-columns` | GET | - | 401 sans token |
| `/mapping/add-columns` | POST | corps métier | 401 sans token |
| `/mapping/deploy_model/` | POST | corps métier | 401 sans token |
| `/mapping/get-steps-event/` | POST | corps métier | 401 sans token |
| `/mapping/schedule_deployment/` | POST | corps métier | 401 sans token |
| `/mapping/get_scheduled_deployments/` | GET | - | 401 sans token |
| `/mapping/approve_deployment/` | POST | corps métier | 401 sans token |
| `/mapping/activate_deployment/` | POST | corps métier | 401 sans token |
| `/mapping/save-state/` | POST | corps métier | 401 sans token |
| `/mapping/log_event/` | POST | corps métier | 401 sans token |
| `/mapping/update_project_step/` | POST | corps métier | 401 sans token |
| `/mapping/lock_project/` | POST | corps métier | 401 sans token |
| `/mapping/unlock_project/` | POST | corps métier | 401 sans token |
| `/mapping/ingestion-config` | POST | corps métier | 401 sans token |
| `/mapping/ingestion-config/bulk` | POST | corps métier | 401 sans token |
| `/mapping/masking-config` | POST | corps métier | 401 sans token |
| `/mapping/masking-config/bulk` | POST | corps métier | 401 sans token |
| `/mapping/templates` | POST | corps métier | 401 sans token |
| `/mapping/templates/{template_id}/apply` | POST | corps métier | 401 sans token |
| `/mapping/compliance/validate` | POST | corps métier | 401 sans token |
| `/mapping/export/{project_id}` | GET | - | 401 sans token |
| `/mapping/import` | POST | corps métier | 401 sans token |

---

## 9. Workflow

**Pages :** `(dashboard)/workflow/page.tsx`, `Workflow.tsx`, `ETLConfigSidebar.tsx`

| Endpoint | Méthode | Query / Corps | Résultat test |
|----------|---------|----------------|---------------|
| `/workflow/get_workflows/` | GET | - | 401 sans token |
| `/workflow/create_workflow/` | POST | corps workflow | 401 sans token |
| `/workflow/update_workflow/` | POST | corps workflow | 401 sans token |
| `/workflow/rename_workflow/` | POST | corps | 401 sans token |
| `/workflow/execute_workflow/` | POST | `workflow_name` (query ou body) | 401 sans token |
| `/workflow/schedule_workflow/` | POST | corps | 401 sans token |
| `/workflow/suspend_task/` | POST | `task_name` (query) | 401 sans token |
| `/workflow/resume_task/` | POST | `task_name` (query) | 401 sans token |
| `/workflow/test_workflow_config/` | POST | corps | 401 sans token |
| `/workflow/get_task_by_name/` | GET | query | 401 sans token |
| `/{workflow_id}/versions` | GET / POST | - | 401 sans token |
| `/{workflow_id}/rollback/{version_id}` | POST | - | 401 sans token |
| `/{workflow_id}/runs` | GET | - | 401 sans token |
| `/workflow/deployments/schedule` | POST | corps | 401 sans token |
| `/workflow/deployments/{event_id}/approve` | POST | - | 401 sans token |
| `/workflow/deployments/{event_id}/reject` | POST | - | 401 sans token |
| `/workflow/deployments/{event_id}/activate` | POST | - | 401 sans token |
| `/workflow/execute_tracked/` | POST | corps | 401 sans token |
| `/workflow/{workflow_id}/execution-summary` | GET | - | 401 sans token |

*(Les appels mapping depuis ETLConfigSidebar utilisent les mêmes endpoints que la section Mapping.)*

---

## 10. Org Accounts (Client Accounts)

**Pages :** `shared/org-accounts/`  
**Services :** `services/org-accounts/hooks.ts`

| Endpoint | Méthode | Query | Résultat test |
|----------|---------|-------|---------------|
| `/org-accounts/dashboard` | GET | - | 401 sans token |
| `/org-accounts/dashboard/overview` | GET | - | 401 sans token |
| `/org-accounts/dashboard/usage` | GET | - | 401 sans token |
| `/org-accounts/dashboard/credits` | GET | `days` | 401 sans token |
| `/org-accounts/dashboard/storage` | GET | - | 401 sans token |
| `/org-accounts/dashboard/trends` | GET | `days` | 401 sans token |
| `/org-accounts/dashboard/activity` | GET | - | 401 sans token |
| `/org-accounts/accounts` | GET | filtres optionnels | 401 sans token |
| `/org-accounts/accounts/{account_name}` | GET | - | 401 sans token |
| `/org-accounts/credits` | GET | `days` | 401 sans token |
| `/org-accounts/credits/top` | GET | `days`, `limit` | 401 sans token |
| `/org-accounts/credits/trend` | GET | `days` | 401 sans token |
| `/org-accounts/credits/{account_name}/history` | GET | `days` | 401 sans token |
| `/org-accounts/storage` | GET | - | 401 sans token |
| `/org-accounts/storage/trend` | GET | `days` | 401 sans token |
| `/org-accounts/warehouses` | GET | `days` | 401 sans token |
| `/org-accounts/warehouses/top-clients` | GET | - | 401 sans token |
| `/org-accounts/warehouses/{account_name}` | GET | `days` | 401 sans token |
| `/org-accounts/logins` | GET | `days` | 401 sans token |
| `/org-accounts/logins/{account_name}/history` | GET | `days` | 401 sans token |
| `/org-accounts/logins/failed` | GET | `days` | 401 sans token |
| `/org-accounts/queries` | GET | `days` | 401 sans token |
| `/org-accounts/queries/trend` | GET | `days` | 401 sans token |
| `/org-accounts/data-transfer` | GET | `days` | 401 sans token |
| `/org-accounts/balance` | GET | - | 401 sans token |
| `/org-accounts/health` | GET | - | 401 sans token |
| `/org-accounts/health/{account_name}` | GET | - | 401 sans token |
| `/org-accounts/alerts` | GET | `days` | 401 sans token |
| `/org-accounts/reader-accounts` | GET / POST / DELETE | - | 401 sans token |
| `/org-accounts/shares` | GET | - | 401 sans token |
| `/org-accounts/shares/{share_name}` | GET | - | 401 sans token |

---

## 11. Observability

**Pages :** `(dashboard)/observability/`, `shared/observability/`  
**Services :** `services/observability/index.ts`

| Endpoint | Méthode | Résultat test |
|----------|---------|----------------|
| `/observability/kpis` | GET | 401 sans token |
| `/observability/dashboard` | GET | 401 sans token |
| `/observability/health` | GET | **200 OK** (sans auth) |
| `/observability/compliance/gdpr` | GET | 401 sans token |
| `/observability/compliance/soc2` | GET | 401 sans token |
| `/observability/lineage` | GET | 401 sans token |
| `/observability/lineage/access-patterns` | GET | 401 sans token |
| `/observability/activity/summary` | GET | 401 sans token |
| `/observability/activity/heatmap` | GET | 401 sans token |
| `/observability/activity/logins` | GET | 401 sans token |
| `/observability/security/posture` | GET | 401 sans token |
| `/observability/security/sensitive-data` | GET | 401 sans token |
| `/observability/resources/unused-tables` | GET | 401 sans token |
| `/observability/resources/dormant-users` | GET | 401 sans token |
| `/observability/cost/warehouse-usage` | GET | 401 sans token |
| `/observability/cost/daily-credits` | GET | 401 sans token |
| `/observability/cost/storage` | GET | 401 sans token |
| `/observability/performance/metrics` | GET | 401 sans token |
| `/observability/performance/slow-queries` | GET | 401 sans token |

---

## 12. Explore & Design

**Pages :** `(dashboard)/explore-design/page.tsx`  
**Services :** `services/explore-design/index.ts` – base : `/explore-design`

| Endpoint | Méthode | Corps / Query | Résultat test |
|----------|---------|----------------|---------------|
| `/explore-design/events/validate` | POST | `{ "events": [...] }` | 401 sans token |
| `/explore-design/schema-clone` | POST | corps | 401 sans token |
| `/explore-design/schema-clone/preview` | POST | corps | 401 sans token |
| `/explore-design/schema-clone/{clone_id}/execute` | POST | - | 401 sans token |
| `/explore-design/schema-clone/{clone_id}/status` | GET | - | 401 sans token |
| `/explore-design/schema-clone/{clone_id}/rollback` | POST | - | 401 sans token |

---

## 13. Connect (Data Source / Datalake)

**Pages :** `(dashboard)/data-source-connection/`  
**Router backend :** `routers/connect_datalake.py` – préfixe `/connect`

| Endpoint | Méthode | Résultat test |
|----------|---------|----------------|
| `/connect/azure/storage_integration` | POST | 401 sans token |
| `/connect/azure/notification_integration` | POST | 401 sans token |
| `/connect/azure/snowpipe` | POST | 401 sans token |
| `/connect/azure/stage` | POST | 401 sans token |
| `/connect/aws/storage_integration` | POST | 401 sans token |
| `/connect/aws/stage` | POST | 401 sans token |
| `/connect/snowflake_lake/datalake/connect` | POST | 401 sans token |
| `/connect/snowflake_lake/share/create` | POST | 401 sans token |
| `/connect/snowflake_lake/databases` | GET | 401 sans token |
| `/connect/snowflake_lake/schemas/{database_name}` | GET | 401 sans token |
| `/connect/snowflake_lake/tables/{database_name}/{schema_name}` | GET | 401 sans token |
| `/connect/integration` | GET | 401 sans token |
| `/connect/databases/browse` | GET | 401 sans token |
| `/connect/databases/{database_name}/{schema_name}/tables` | GET | 401 sans token |
| `/connect/stages` | GET | 401 sans token |
| `/connect/stages/{stage_name}/files` | GET | 401 sans token |
| `/connect/stages/{stage_name}/file-preview` | GET | 401 sans token |
| `/connect/postgres` | POST | 401 sans token |
| `/connect/mysql` | POST | 401 sans token |

---

## 14. Cache & SSE

**Services :** `hooks/useCacheInvalidation.ts`  
**Router backend :** `routers/cache_stream.py`, `cache_management.py`

| Endpoint | Méthode | Résultat test |
|----------|---------|----------------|
| `/api/cache/stream` | GET (SSE) | **200 OK** (sans auth) |
| `/cache/*` (management) | GET/POST selon route | 401 sans token |

---

## 15. Cortex, BI, Data Quality, Metadata

- **Cortex** (préfixe `/cortex`) : utilisé par la page “Intelligent” (Cortex chat, ML, semantic models).
- **BI** (préfixes `/bi`, `/bi_reporting`) : dashboards et reporting.
- **Data Quality** (préfixe `/data-quality`) : rapports qualité.
- **Metadata** (préfixe `/metadata`) : `/metadata/batch`, `/metadata/detect-sensitive`, `/metadata/detect-relations`, `/metadata/schema-changes/{project_id}`.

Tous ces endpoints sont appelés avec le **même header** `Authorization: Bearer <token>` (et selon besoin `X-Account-Name`, `X-Username`).

---

## 16. Résumé des derniers résultats (sans token)

| Zone | Résultat |
|------|----------|
| Register | 422 (corps de test invalide ou backend non configuré pour création de compte) |
| Login | 500 (compte de test inexistant) |
| Endpoints protégés | 401 sans token (comportement attendu) |
| `/observability/health` | **200 OK** |
| `/api/cache/stream` | **200 OK** |

---

## 17. Recommandations pour l’équipe Backend

1. **Register/Login**  
   - Vérifier la validation du body (422) et le message d’erreur renvoyé.  
   - En cas de 500 au login, s’assurer que l’erreur est loguée côté backend et qu’un message clair est renvoyé (sans exposer de détail interne).

2. **Authentification**  
   - Les routes protégées renvoient bien **401** sans token.  
   - Pour valider le flux complet (création de compte + parcours des pages), exécuter le script avec un **token valide** :  
     `export TEST_TOKEN="<jwt>"; ./test-full-flow.sh http://127.0.0.1:8000`

3. **Observability / Cache**  
   - `/observability/health` et `/api/cache/stream` répondent **200** sans auth. Si l’objectif est de les protéger, ajouter une vérification d’auth ou de clé API.

4. **Rapport à jour**  
   - Après chaque exécution de `test-full-flow.sh`, le fichier **`docs/ENDPOINTS_TEST_RESULTS.md`** contient le résumé à jour des appels et statuts HTTP.

---

*Document généré pour l’équipe Backend – Data360 / datalab360Front.*
