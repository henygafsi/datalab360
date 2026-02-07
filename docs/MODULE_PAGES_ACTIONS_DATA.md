# Data360 – Données requises par action et par module

**Objectif :** Pour chaque page/module du frontend, ce document décrit les **actions** (boutons, formulaires, chargements) et les **données nécessaires** (headers, body, query) pour chaque appel API.

**Authentification commune :** Tous les endpoints (sauf sign-in, register, observability/health, policies/health) exigent :
- **Headers :** `Authorization: Bearer <access_token>`, optionnellement `X-Account-Name`, `X-Username` (selon backend).

---

## 1. Auth (Sign-in / Sign-up)

| Action | Endpoint | Méthode | Données requises |
|--------|----------|---------|------------------|
| **Créer un compte** | `/user/register/` | POST | **Body:** `organisation_name` (string), `username` (string), `email` (string), `password` (string), `confirm_password` (string). |
| **Se connecter** | `/user/login/` | POST | **Body:** `account_name` (string), `username` (string), `password` (string). Réponse : `access_token`, `account_name`, `username`. |
| **Modules de l’utilisateur** | `/user/me/modules` | GET | **Headers:** `Authorization: Bearer <token>`. Aucun body/query. |

---

## 2. Dashboard (Account Overview)

**Fichier frontend :** `shared/dashboard/index.tsx`

| Action | Endpoint | Méthode | Données requises |
|--------|----------|---------|------------------|
| **Charger dashboard gouvernance** | `/gouvernance/client/dashboard` | GET | Headers auth. Aucun body/query. |
| **Charger activité** | `/gouvernance/dashboard/activity` | GET | Headers auth. **Query (optionnel):** `start_date`, `end_date` (ISO), `username`, `module_name`, `event_type`, `query_status`. |
| **Lister les workflows** | `/workflow/get_workflows/` | GET | Headers auth. |
| **Déploiements planifiés** | `/mapping/get_scheduled_deployments/` | GET | Headers auth. |
| **Approuver un déploiement** | `/mapping/approve_deployment/` | POST | Headers auth. **Body:** `workflow_name` (string), `approved_by` (string). |
| **Rejeter un déploiement** | `/mapping/reject_deployment/` | POST | Headers auth. **Body:** `workflow_name` (string), `rejected_by` (string). |
| **Activer un déploiement** | `/mapping/activate_deployment/` | POST | Headers auth. **Body:** `workflow_name` (string), `activated_by` (string). |

---

## 3. Gouvernance – Storage & DWH

| Action | Endpoint | Méthode | Données requises |
|--------|----------|---------|------------------|
| **Stockage stages** | `/gouvernance/get_stage_storage_info` | GET | Headers auth. |
| **Stockage DWH** | `/gouvernance/get_dwh_storage_info` | GET | Headers auth. **Query (optionnel):** `database_name`, `schema_name`. |
| **Schémas DWH** | `/gouvernance/get_dwh_schemas` | GET | Headers auth. |
| **Santé DWH** | `/gouvernance/get_dwh_health_info` | GET | Headers auth. **Query (optionnel):** `schema_name`. |
| **Info utilisateur** | `/gouvernance/get_user_info` | GET | Headers auth. |
| **Connecteurs** | `/gouvernance/info` | GET | Headers auth. |
| **Statut MFA** | `/gouvernance/user/mfa/status` | GET | Headers auth. **Query:** `username` (string). |
| **Activer/Désactiver MFA** | `/gouvernance/user/mfa/set` | POST | Headers auth. **Body:** `username` (string), `enable` (boolean). |

---

## 4. Gouvernance – Utilisateurs

**Services :** `fetch_users.ts`, `user_roles.ts`

| Action | Endpoint | Méthode | Données requises |
|--------|----------|---------|------------------|
| **Lister les utilisateurs** | `/gouvernance/users` | GET | Headers auth. |
| **Utilisateurs avec rôles** | `/gouvernance/users-with-roles` | GET | Headers auth. |
| **Détail utilisateur** | `/gouvernance/users/{username}` | GET | Headers auth. **Path:** `username`. |
| **Rôles d’un utilisateur** | `/gouvernance/users/{username}/roles` | GET | Headers auth. **Path:** `username`. |
| **Rôles disponibles pour un user** | `/gouvernance/roles-for-user/{username}` | GET | Headers auth. **Path:** `username`. |
| **Ajouter un utilisateur** | `/gouvernance/add-user` | POST | Headers auth. **Body:** `username`, `password`, `email` (strings). |
| **Assigner un rôle** | `/gouvernance/assign-role` | POST | Headers auth. **Body:** `username` (string), `role_name` (string). |
| **Retirer un rôle** | `/gouvernance/unassign-role` | DELETE | Headers auth. **Body:** `username`, `role_name`. |
| **Mettre à jour les rôles** | `/gouvernance/users/{username}/roles` | PUT | Headers auth. **Path:** `username`. **Body:** `roles` (string[]). |
| **Activer utilisateur** | (via disable_user avec enable) | POST | Headers auth. **Body:** identifiant utilisateur (selon endpoint réel). |
| **Désactiver utilisateur** | (endpoint disable) | POST | Headers auth. **Body:** identifiant utilisateur. |
| **Supprimer utilisateur** | `/gouvernance/delete-user` (ou équivalent) | DELETE | Headers auth. **Body/Query:** identifiant utilisateur. |
| **Permissions (grants)** | `/gouvernance/grants` | GET | Headers auth. |

---

## 5. Gouvernance – Rôles

**Services :** `fetch_roles.ts`, `fetch_grants.ts`

| Action | Endpoint | Méthode | Données requises |
|--------|----------|---------|------------------|
| **Lister les rôles** | `/gouvernance/roles` | GET | Headers auth. |
| **Ajouter un rôle** | `/gouvernance/add-role` | POST | Headers auth. **Body:** `role_name` (string). |
| **Mettre à jour les grants d’un rôle** | `/gouvernance/update-grants` | PUT | Headers auth. **Body:** `role_name` (string), `modules` (string[]). |
| **Grants pour un rôle (matrix)** | `getGrantsForRole` → backend grants | GET | Headers auth. Données dérivées de `/gouvernance/grants`. |

---

## 6. Gouvernance – Security Matrix & RLS

**Services :** `security_matrix.ts`, `security-matrix.ts`

| Action | Endpoint | Méthode | Données requises |
|--------|----------|---------|------------------|
| **Initialiser la matrix** | `/gouvernance/security-matrix/init` | POST | Headers auth. **Body:** `{}` ou vide. |
| **Lire la matrix** | `/gouvernance/security-matrix` | GET | Headers auth. |
| **Axes de sécurité** | `/gouvernance/security-axes` | GET | Headers auth. |
| **Politiques RLS** | `/gouvernance/rls-policies` | GET | Headers auth. **Query (optionnel):** `database`, `schema`. |
| **Créer / MAJ / supprimer entrées matrix** | `/gouvernance/security-matrix`, `/security-matrix/{id}`, etc. | POST / PUT / DELETE | Headers auth. **Body:** selon opération (role, axes, etc.). |

---

## 7. Gouvernance – Policies (Row Access, Masking, Network, Tags)

**Services :** `policies.ts` – préfixe `/gouvernance/policies`

| Action | Endpoint | Méthode | Données requises |
|--------|----------|---------|------------------|
| **Lister row-access** | `/gouvernance/policies/row-access/list` | GET | Headers auth. |
| **Lister masking** | `/gouvernance/policies/masking/list` | GET | Headers auth. |
| **Lister network** | `/gouvernance/policies/network/list` | GET | Headers auth. |
| **Lister tags** | `/gouvernance/policies/tags/list` | GET | Headers auth. |
| **Bases pour objets** | `/gouvernance/policies/objects/databases` | GET | Headers auth. |
| **Santé policies** | `/gouvernance/policies/health` | GET | Aucune auth (200 possible sans token). |
| **Créer RLS** | `/gouvernance/rls-policies` | POST | Headers auth. **Body:** `policy_name`, `signature`, `expression`, `database`, `schema`, etc. (voir `CreateRLSPolicyRequest`). |
| **Appliquer / Retirer policy** | `/gouvernance/policies/row-access/apply`, `.../remove`, idem masking/tags | POST | Headers auth. **Body:** selon type (table, colonnes, policy_name, etc.). |

---

## 8. Mapping (Data Mapping Wizard)

**Services :** `getDatabases.ts`, `getSchema.ts`, `getTables.ts`, `createProject.ts`, `postMapping.ts`, `saveGroups.ts`, etc.

### 8.1 Découverte (lecture seule)

| Action | Endpoint | Méthode | Données requises |
|--------|----------|---------|------------------|
| **Lister les bases** | `/mapping/databases` | GET | Headers auth. |
| **Lister les schémas** | `/mapping/schemas/{database_name}` | GET | Headers auth. **Path:** `database_name`. |
| **Lister les tables** | `/mapping/tables/{database_name}/{schema_name}` | GET | Headers auth. **Path:** `database_name`, `schema_name`. |
| **Colonnes d’une table** | `/mapping/get_table_columns/` | GET | Headers auth. **Query:** `database_name`, `schema_name`, `table_name`. |
| **Contraintes** | `/mapping/constraints` | GET | Headers auth. **Query:** `database_name`, `schema_name`. |
| **Détails** | `/mapping/details` | GET | Headers auth. **Query:** `database_name`, etc. (selon backend). |

### 8.2 Projets et étapes

| Action | Endpoint | Méthode | Données requises |
|--------|----------|---------|------------------|
| **Créer un projet** | `/mapping/create_project` | POST | Headers auth. **Body:** `project_name` (string), `database_name`, `schema_name` (optionnel selon backend). Front envoie aussi `name`, `shared_with` (optionnel). Backend attend souvent `project_name`, `database_name`, `schema_name`. |
| **Lister les projets** | `/mapping/get_projects` | POST | Headers auth. **Body:** `{}` ou payload minimal. |
| **Événements d’un projet** | `/mapping/get-steps-event/` | POST | Headers auth. **Body:** `project_id` (UUID string). |
| **Ajouter un événement (groupe, clé, etc.)** | `/mapping/add-event/` | POST | Headers auth. **Body:** `project_id`, `event_type` (ex. `ADD_GROUP`, `ADD_PRIMARY_KEY`), `event_details` (objet selon type). Ex. ADD_GROUP : `group_index`, `sources` ([{database,schema,table}]), `target` ({database,schema,table}). |
| **Enregistrer colonnes sélectionnées** | `/mapping/store-selected-columns` | POST | Headers auth. **Body:** `project_id`, `database_name`, `schema_name`, `table_name`, `selected_columns` (string[]). |
| **Colonnes décrites** | `/mapping/describe-selected-columns` | GET | Headers auth. **Query:** `project_id`. |
| **Clé primaire** | `/mapping/primary-key` | POST | Headers auth. **Body:** `project_id`, infos clé(s). |
| **Tester le mapping** | `/mapping/test_mapping/` | POST | Headers auth. **Body:** `project_id`, `mappings` (array avec source_*, target_*, pk_source, pk_target, etc.). |
| **Ajouter des colonnes** | `/mapping/add-columns` | POST | Headers auth. **Body:** `project_id`, `database_name`, `schema_name`, `table_name`, `columns` ([{name, type, default, comment}]). |
| **Déployer le modèle** | `/mapping/deploy_model/` | POST | Headers auth. **Body:** `project_id`, `mappings` (structure comme test_mapping). |
| **Planifier déploiement** | `/mapping/schedule_deployment/` | POST | Headers auth. **Body:** selon backend (workflow_name, scheduled_at, etc.). |
| **Log événement** | `/mapping/log_event/` | POST | Headers auth. **Body:** `project_id`, `module_name` (enum), `event_type`, `status`. |

### 8.3 Déploiements (approbation)

| Action | Endpoint | Méthode | Données requises |
|--------|----------|---------|------------------|
| **Déploiements planifiés** | `/mapping/get_scheduled_deployments/` | GET | Headers auth. |
| **Approuver** | `/mapping/approve_deployment/` | POST | **Body:** `workflow_name`, `approved_by`. |
| **Rejeter** | `/mapping/reject_deployment/` | POST | **Body:** `workflow_name`, `rejected_by`. |
| **Activer** | `/mapping/activate_deployment/` | POST | **Body:** `workflow_name`, `activated_by`. |

---

## 9. Workflow

**Services :** `workflow/index.ts`

| Action | Endpoint | Méthode | Données requises |
|--------|----------|---------|------------------|
| **Lister les workflows** | `/workflow/get_workflows/` | GET | Headers auth. |
| **Créer un workflow** | `/workflow/create_workflow/` | POST | Headers auth. **Body:** `workflow_name` (string), `steps` (array de WorkflowStep), `project_id` (optionnel). |
| **Mettre à jour** | `/workflow/update_workflow/` | POST | Headers auth. **Body:** `workflow_name`, `steps`. |
| **Exécuter** | `/workflow/execute_workflow/` | POST | Headers auth. **Query ou Body:** `workflow_name` (string). |
| **Planifier (cron)** | `/workflow/schedule_workflow/` | POST | Headers auth. **Body:** `workflow_name` (string), `cron_schedule` (enum: `hourly` \| `daily` \| `weekly` \| `monthly`). |
| **Suspendre tâche** | `/workflow/suspend_task/` | POST | Headers auth. **Body/Query:** `task_name` (string). |
| **Reprendre tâche** | `/workflow/resume_task/` | POST | Headers auth. **Body/Query:** `task_name`. |
| **Initialiser tables** | `/workflow/setup/initialize-tables` | POST | Headers auth. **Body:** `{}`. |
| **Planifier déploiement (explore-design)** | `/explore-design/deployments` | POST | Headers auth. **Body:** `project_id`, `version`, `type`, `config` (workflow_id, workflow_name, steps, etc.). |
| **Approuver / Rejeter / Activer déploiement** | `/explore-design/deployments/{id}/approve`, `.../reject`, `.../execute` | POST | Headers auth. **Path:** `id`. **Body** optionnel selon endpoint. |

---

## 10. Org Accounts (Client Accounts)

**Services :** `org-accounts/hooks.ts`

| Action | Endpoint | Méthode | Données requises |
|--------|----------|---------|------------------|
| **Dashboard** | `/org-accounts/dashboard` | GET | Headers auth. |
| **Overview** | `/org-accounts/dashboard/overview` | GET | Headers auth. |
| **Usage / Trends / Activity** | `/org-accounts/dashboard/usage`, `.../trends`, `.../activity` | GET | Headers auth. **Query (optionnel):** `days`. |
| **Comptes** | `/org-accounts/accounts` | GET | Headers auth. |
| **Credits / top / trend** | `/org-accounts/credits`, `.../credits/top`, `.../credits/trend` | GET | Headers auth. **Query:** `days`, `limit` (pour top). |
| **Storage / trend** | `/org-accounts/storage`, `.../storage/trend` | GET | Headers auth. **Query:** `days` pour trend. |
| **Warehouses / balance / health / alerts** | `/org-accounts/warehouses`, `.../balance`, `.../health`, `.../alerts` | GET | Headers auth. **Query:** `days` où pertinent. |
| **Reader accounts / Shares** | `/org-accounts/reader-accounts`, `.../shares` | GET / POST / DELETE | Headers auth. Body pour POST selon création. |

---

## 11. Observability

**Services :** `observability/index.ts`

| Action | Endpoint | Méthode | Données requises |
|--------|----------|---------|------------------|
| **KPIs** | `/observability/kpis` | GET | Headers auth. |
| **Dashboard** | `/observability/dashboard` | GET | Headers auth. |
| **Health** | `/observability/health` | GET | Aucune auth (200 possible sans token). |
| **Compliance GDPR / SOC2** | `/observability/compliance/gdpr`, `.../soc2` | GET | Headers auth. |
| **Lineage / Activity / Security / Cost / Performance** | `/observability/lineage`, `.../activity/summary`, `.../security/posture`, `.../cost/warehouse-usage`, etc. | GET | Headers auth. **Query (optionnel):** `days`. |

---

## 12. Explore & Design

**Services :** `explore-design/index.ts`

| Action | Endpoint | Méthode | Données requises |
|--------|----------|---------|------------------|
| **Valider événements** | `/explore-design/events/validate` | POST | Headers auth. **Body:** `events` (array). |
| **Aperçu clone schéma** | `/explore-design/schema-clone/preview` | POST | Headers auth. **Body:** `source_database`, `source_schema` (strings). |
| **Exécuter / Statut / Rollback clone** | `/explore-design/schema-clone/{clone_id}/execute`, `.../status`, `.../rollback` | POST / GET | Headers auth. **Path:** `clone_id`. |

---

## 13. Connect (Data Source / Datalake)

**Services :** `connectionServices.tsx`, `DatalakeBrowser` (stages, files)

| Action | Endpoint | Méthode | Données requises |
|--------|----------|---------|------------------|
| **Liste des intégrations** | `/connect/integration` | GET | Headers auth. |
| **Parcourir bases** | `/connect/databases/browse` | GET | Headers auth. |
| **Bases Snowflake** | `/connect/snowflake_lake/databases` | GET | Headers auth. |
| **Stages** | `/connect/stages` | GET | Headers auth. |
| **Fichiers d’un stage** | `/connect/stages/{stage_name}/files` | GET | Headers auth. **Path:** `stage_name`. **Query (optionnel):** prefix, etc. |
| **Aperçu fichier** | `/connect/stages/{stage_name}/file-preview` ou `.../files/{path}/preview` | GET | Headers auth. **Path:** stage_name, file path. |
| **Création stage Azure/AWS, Snowpipe, etc.** | `/connect/azure/stage`, `/connect/aws/stage`, etc. | POST | Headers auth. **Body:** selon type (nom, storage integration, etc.). |

---

## 14. Cortex (Intelligent Analytics)

**Services :** `cortex/kpis.ts`, `cortex/query.ts`, `cortex/semantic-models.ts`

| Action | Endpoint | Méthode | Données requises |
|--------|----------|---------|------------------|
| **KPIs** | `/cortex/kpis` | GET | Headers auth. Réponse : `models_active`, `queries_today`, `avg_response_sec`, `accuracy_rate`. |
| **Requête NL** | `/cortex/query` | POST | Headers auth. **Body:** `prompt` (string). |
| **Liste modèles sémantiques** | `/cortex/semantic-models/list` | GET | Headers auth. |
| **Contenu d’un modèle** | `/cortex/semantic-models/{model_name}` | GET | Headers auth. **Path:** `model_name`. |
| **Créer / Supprimer modèle** | `/cortex/semantic-models`, `DELETE .../semantic-models/{model_name}` | POST / DELETE | Headers auth. **Body (POST):** nom, contenu YAML, etc. |

---

## 15. Cache (SSE)

| Action | Endpoint | Méthode | Données requises |
|--------|----------|---------|------------------|
| **Stream d’invalidation** | `/api/cache/stream` (ou URL configurée) | GET | Headers auth optionnels. Peut retourner 200 et garder la connexion ouverte. |

---

## Comment tester les endpoints

1. **Avec token (recommandé)**  
   ```bash
   export TEST_ACCOUNT="MonOrg"
   export TEST_USERNAME="monuser"
   export TEST_PASSWORD="MonMotDePasse"
   ./test-endpoints-by-page.sh http://127.0.0.1:8000
   ```
   Ou avec un JWT déjà obtenu :
   ```bash
   export TEST_TOKEN="<jwt>"
   ./test-endpoints-by-page.sh http://127.0.0.1:8000
   ```

2. **Rapport généré**  
   `docs/ENDPOINTS_FULL_TEST_REPORT.md` (statut et erreurs par endpoint).

3. **Backend**  
   Snowflake et services backend doivent être disponibles pour que Register/Login renvoient 200 et que les endpoints métier ne renvoient pas 500.

---

## Réponses vides (200 avec données vides)

Les endpoints suivants peuvent retourner **200** avec des données vides (pas de faux succès, mais « pas de données ») :

| Endpoint | Quand | Réponse |
|----------|--------|---------|
| `GET /mapping/constraints` | Paramètres manquants ou table inexistante | `{ "constraints": [] }` |
| `GET /mapping/details` | Paramètres manquants ou erreur | `{ "columns": [] }` |
| `GET /mapping/describe-selected-columns` | Paramètres manquants | `{ "columns": [], "selected": [] }` |
| `GET /connect/snowflake_lake/schemas/{db}` | Pas d’utilisateur datalake ou erreur | `{ "schemas": [] }` |
| `GET /connect/snowflake_lake/tables/{db}/{schema}` | Idem | `[]` |
| `GET /gouvernance/client/dashboard` | Erreur (ex. warehouse) | Objet avec `total_events: 0`, `success_rate: 0`, etc. |

Le front doit gérer ces réponses (listes vides, 0) sans les considérer comme des erreurs.

---

*Généré pour aligner frontend (Data360) et backend (FastAPI). Dernière mise à jour : 2026-02-05.*
