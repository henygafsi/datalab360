# Data360 – Rapport complet des tests d’endpoints par page

**Date:** 2026-02-05T23:05:18+01:00
**Base URL:** `http://127.0.0.1:8000`
**Token utilisé:** Non

---

## Résumé par page

### Auth

| Sous-page | Endpoint | Méthode | Statut | Erreur |
|-----------|----------|---------|--------|--------|
| Sign-up | `/user/register/` | POST | 500 | {"detail":"Unexpected error: HTTPException: 500: Error connecting to Snowflake:  |
| Sign-in | `/user/login/` | POST | 500 | {"detail":"Unexpected error: HTTPException: 500: Error validating login: 290404  |
### User

| Sous-page | Endpoint | Méthode | Statut | Erreur |
|-----------|----------|---------|--------|--------|
| Modules | `/user/me/modules` | GET | 401 | {"detail":"Not authenticated"}  |
### Dashboard

| Sous-page | Endpoint | Méthode | Statut | Erreur |
|-----------|----------|---------|--------|--------|
| Gouvernance | `/gouvernance/client/dashboard` | GET | 401 | {"detail":"Not authenticated"}  |
| Activity | `/gouvernance/dashboard/activity` | GET | 401 | {"detail":"Not authenticated"}  |
| Workflows | `/workflow/get_workflows/` | GET | 401 | {"detail":"Not authenticated"}  |
| Scheduled deployments | `/mapping/get_scheduled_deployments/` | GET | 401 | {"detail":"Not authenticated"}  |
| Approve deployment | `/mapping/approve_deployment/` | POST | 401 | {"detail":"Not authenticated"}  |
| Reject deployment | `/mapping/reject_deployment/` | POST | 401 | {"detail":"Not authenticated"}  |
| Activate deployment | `/mapping/activate_deployment/` | POST | 401 | {"detail":"Not authenticated"}  |
### Gouvernance

| Sous-page | Endpoint | Méthode | Statut | Erreur |
|-----------|----------|---------|--------|--------|
| Stage storage | `/gouvernance/get_stage_storage_info` | GET | 401 | {"detail":"Not authenticated"}  |
| DWH storage | `/gouvernance/get_dwh_storage_info` | GET | 401 | {"detail":"Not authenticated"}  |
| DWH schemas | `/gouvernance/get_dwh_schemas` | GET | 401 | {"detail":"Not authenticated"}  |
| DWH health | `/gouvernance/get_dwh_health_info` | GET | 401 | {"detail":"Not authenticated"}  |
| User info | `/gouvernance/get_user_info` | GET | 401 | {"detail":"Not authenticated"}  |
| Connectors | `/gouvernance/info` | GET | 401 | {"detail":"Not authenticated"}  |
| MFA status | `/gouvernance/user/mfa/status` | GET | 401 | {"detail":"Not authenticated"}  |
| Users list | `/gouvernance/users` | GET | 401 | {"detail":"Not authenticated"}  |
| Users with roles | `/gouvernance/users-with-roles` | GET | 401 | {"detail":"Not authenticated"}  |
| Grants | `/gouvernance/grants` | GET | 401 | {"detail":"Not authenticated"}  |
| Roles list | `/gouvernance/roles` | GET | 401 | {"detail":"Not authenticated"}  |
| Update grants | `/gouvernance/update-grants` | PUT | 401 | {"detail":"Not authenticated"}  |
| Security matrix init | `/gouvernance/security-matrix/init` | POST | 401 | {"detail":"Not authenticated"}  |
| Security matrix | `/gouvernance/security-matrix` | GET | 401 | {"detail":"Not authenticated"}  |
| Security axes | `/gouvernance/security-axes` | GET | 401 | {"detail":"Not authenticated"}  |
| RLS policies | `/gouvernance/rls-policies` | GET | 401 | {"detail":"Not authenticated"}  |
| Policies row-access list | `/gouvernance/policies/row-access/list` | GET | 401 | {"detail":"Not authenticated"}  |
| Policies masking list | `/gouvernance/policies/masking/list` | GET | 401 | {"detail":"Not authenticated"}  |
| Policies network list | `/gouvernance/policies/network/list` | GET | 401 | {"detail":"Not authenticated"}  |
| Policies tags list | `/gouvernance/policies/tags/list` | GET | 401 | {"detail":"Not authenticated"}  |
| Policies objects databases | `/gouvernance/policies/objects/databases` | GET | 401 | {"detail":"Not authenticated"}  |
| Policies health | `/gouvernance/policies/health` | GET | 200 |  |
### Mapping

| Sous-page | Endpoint | Méthode | Statut | Erreur |
|-----------|----------|---------|--------|--------|
| Databases | `/mapping/databases` | GET | 401 | {"detail":"Not authenticated"}  |
| Schemas | `/mapping/schemas/CP_DATA360` | GET | 401 | {"detail":"Not authenticated"}  |
| Tables | `/mapping/tables/CP_DATA360/RETAIL_DW` | GET | 401 | {"detail":"Not authenticated"}  |
| Table columns | `/mapping/get_table_columns/` | GET | 401 | {"detail":"Not authenticated"}  |
| Get projects | `/mapping/get_projects` | POST | 401 | {"detail":"Not authenticated"}  |
| Get scheduled deployments | `/mapping/get_scheduled_deployments/` | GET | 401 | {"detail":"Not authenticated"}  |
| Describe selected columns | `/mapping/describe-selected-columns` | GET | 401 | {"detail":"Not authenticated"}  |
| Constraints | `/mapping/constraints` | GET | 401 | {"detail":"Not authenticated"}  |
| Details | `/mapping/details` | GET | 401 | {"detail":"Not authenticated"}  |
| Create project | `/mapping/create_project` | POST | 401 | {"detail":"Not authenticated"}  |
| Add event | `/mapping/add-event/` | POST | 401 | {"detail":"Not authenticated"}  |
| Log event | `/mapping/log_event/` | POST | 401 | {"detail":"Not authenticated"}  |
| Get steps event | `/mapping/get-steps-event/` | POST | 401 | {"detail":"Not authenticated"}  |
### Workflow

| Sous-page | Endpoint | Méthode | Statut | Erreur |
|-----------|----------|---------|--------|--------|
| Get workflows | `/workflow/get_workflows/` | GET | 401 | {"detail":"Not authenticated"}  |
| Create workflow | `/workflow/create_workflow/` | POST | 401 | {"detail":"Not authenticated"}  |
| Execute workflow | `/workflow/execute_workflow/` | POST | 401 | {"detail":"Not authenticated"}  |
| Schedule workflow | `/workflow/schedule_workflow/` | POST | 401 | {"detail":"Not authenticated"}  |
| Setup init tables | `/workflow/setup/initialize-tables` | POST | 401 | {"detail":"Not authenticated"}  |
### Org Accounts

| Sous-page | Endpoint | Méthode | Statut | Erreur |
|-----------|----------|---------|--------|--------|
| Dashboard | `/org-accounts/dashboard` | GET | 401 | {"detail":"Not authenticated"}  |
| Overview | `/org-accounts/dashboard/overview` | GET | 401 | {"detail":"Not authenticated"}  |
| Usage | `/org-accounts/dashboard/usage` | GET | 401 | {"detail":"Not authenticated"}  |
| Trends | `/org-accounts/dashboard/trends` | GET | 401 | {"detail":"Not authenticated"}  |
| Activity | `/org-accounts/dashboard/activity` | GET | 401 | {"detail":"Not authenticated"}  |
| Accounts list | `/org-accounts/accounts` | GET | 401 | {"detail":"Not authenticated"}  |
| Credits | `/org-accounts/credits` | GET | 401 | {"detail":"Not authenticated"}  |
| Credits top | `/org-accounts/credits/top` | GET | 401 | {"detail":"Not authenticated"}  |
| Credits trend | `/org-accounts/credits/trend` | GET | 401 | {"detail":"Not authenticated"}  |
| Storage | `/org-accounts/storage` | GET | 401 | {"detail":"Not authenticated"}  |
| Storage trend | `/org-accounts/storage/trend` | GET | 401 | {"detail":"Not authenticated"}  |
| Warehouses | `/org-accounts/warehouses` | GET | 401 | {"detail":"Not authenticated"}  |
| Balance | `/org-accounts/balance` | GET | 401 | {"detail":"Not authenticated"}  |
| Health | `/org-accounts/health` | GET | 401 | {"detail":"Not authenticated"}  |
| Alerts | `/org-accounts/alerts` | GET | 401 | {"detail":"Not authenticated"}  |
| Reader accounts | `/org-accounts/reader-accounts` | GET | 401 | {"detail":"Not authenticated"}  |
| Shares | `/org-accounts/shares` | GET | 401 | {"detail":"Not authenticated"}  |
### Observability

| Sous-page | Endpoint | Méthode | Statut | Erreur |
|-----------|----------|---------|--------|--------|
| KPIs | `/observability/kpis` | GET | 401 | {"detail":"Not authenticated"}  |
| Dashboard | `/observability/dashboard` | GET | 401 | {"detail":"Not authenticated"}  |
| Health | `/observability/health` | GET | 200 |  |
| Compliance GDPR | `/observability/compliance/gdpr` | GET | 401 | {"detail":"Not authenticated"}  |
| Compliance SOC2 | `/observability/compliance/soc2` | GET | 401 | {"detail":"Not authenticated"}  |
| Lineage | `/observability/lineage` | GET | 401 | {"detail":"Not authenticated"}  |
| Activity summary | `/observability/activity/summary` | GET | 401 | {"detail":"Not authenticated"}  |
| Activity heatmap | `/observability/activity/heatmap` | GET | 401 | {"detail":"Not authenticated"}  |
| Security posture | `/observability/security/posture` | GET | 401 | {"detail":"Not authenticated"}  |
| Security sensitive-data | `/observability/security/sensitive-data` | GET | 401 | {"detail":"Not authenticated"}  |
| Cost warehouse-usage | `/observability/cost/warehouse-usage` | GET | 401 | {"detail":"Not authenticated"}  |
| Cost daily-credits | `/observability/cost/daily-credits` | GET | 401 | {"detail":"Not authenticated"}  |
| Cost storage | `/observability/cost/storage` | GET | 401 | {"detail":"Not authenticated"}  |
| Performance metrics | `/observability/performance/metrics` | GET | 401 | {"detail":"Not authenticated"}  |
| Performance slow-queries | `/observability/performance/slow-queries` | GET | 401 | {"detail":"Not authenticated"}  |
### Explore Design

| Sous-page | Endpoint | Méthode | Statut | Erreur |
|-----------|----------|---------|--------|--------|
| Validate events | `/explore-design/events/validate` | POST | 401 | {"detail":"Not authenticated"}  |
| Schema clone preview | `/explore-design/schema-clone/preview` | POST | 401 | {"detail":"Not authenticated"}  |
### Connect

| Sous-page | Endpoint | Méthode | Statut | Erreur |
|-----------|----------|---------|--------|--------|
| Integration | `/connect/integration` | GET | 401 | {"detail":"Not authenticated"}  |
| Databases browse | `/connect/databases/browse` | GET | 401 | {"detail":"Not authenticated"}  |
| Snowflake databases | `/connect/snowflake_lake/databases` | GET | 401 | {"detail":"Not authenticated"}  |
| Stages | `/connect/stages` | GET | 401 | {"detail":"Not authenticated"}  |
### Cache

| Sous-page | Endpoint | Méthode | Statut | Erreur |
|-----------|----------|---------|--------|--------|
| Stream | `/api/cache/stream` | GET | 200 |  |
### Cortex

| Sous-page | Endpoint | Méthode | Statut | Erreur |
|-----------|----------|---------|--------|--------|
| KPIs | `/cortex/kpis` | GET | 401 | {"detail":"Not authenticated"}  |
| Query | `/cortex/query` | POST | 401 | {"detail":"Not authenticated"}  |

---

## Liste complète (CSV-style)

| Page | Sous-page | Endpoint | Méthode | Statut | Erreur |
|------|-----------|----------|---------|--------|--------|
| Auth | Sign-up | `/user/register/` | POST | 500 | {"detail":"Unexpected error: HTTPException: 500: Error connecting to Snowflake: 251005: 251005: User is empty, but it mu |
| Auth | Sign-in | `/user/login/` | POST | 500 | {"detail":"Unexpected error: HTTPException: 500: Error validating login: 290404 (08001): None: 404 Not Found: post uchsf |
| User | Modules | `/user/me/modules` | GET | 401 | {"detail":"Not authenticated"}  |
| Dashboard | Gouvernance | `/gouvernance/client/dashboard` | GET | 401 | {"detail":"Not authenticated"}  |
| Dashboard | Activity | `/gouvernance/dashboard/activity` | GET | 401 | {"detail":"Not authenticated"}  |
| Dashboard | Workflows | `/workflow/get_workflows/` | GET | 401 | {"detail":"Not authenticated"}  |
| Dashboard | Scheduled deployments | `/mapping/get_scheduled_deployments/` | GET | 401 | {"detail":"Not authenticated"}  |
| Dashboard | Approve deployment | `/mapping/approve_deployment/` | POST | 401 | {"detail":"Not authenticated"}  |
| Dashboard | Reject deployment | `/mapping/reject_deployment/` | POST | 401 | {"detail":"Not authenticated"}  |
| Dashboard | Activate deployment | `/mapping/activate_deployment/` | POST | 401 | {"detail":"Not authenticated"}  |
| Gouvernance | Stage storage | `/gouvernance/get_stage_storage_info` | GET | 401 | {"detail":"Not authenticated"}  |
| Gouvernance | DWH storage | `/gouvernance/get_dwh_storage_info` | GET | 401 | {"detail":"Not authenticated"}  |
| Gouvernance | DWH schemas | `/gouvernance/get_dwh_schemas` | GET | 401 | {"detail":"Not authenticated"}  |
| Gouvernance | DWH health | `/gouvernance/get_dwh_health_info` | GET | 401 | {"detail":"Not authenticated"}  |
| Gouvernance | User info | `/gouvernance/get_user_info` | GET | 401 | {"detail":"Not authenticated"}  |
| Gouvernance | Connectors | `/gouvernance/info` | GET | 401 | {"detail":"Not authenticated"}  |
| Gouvernance | MFA status | `/gouvernance/user/mfa/status` | GET | 401 | {"detail":"Not authenticated"}  |
| Gouvernance | Users list | `/gouvernance/users` | GET | 401 | {"detail":"Not authenticated"}  |
| Gouvernance | Users with roles | `/gouvernance/users-with-roles` | GET | 401 | {"detail":"Not authenticated"}  |
| Gouvernance | Grants | `/gouvernance/grants` | GET | 401 | {"detail":"Not authenticated"}  |
| Gouvernance | Roles list | `/gouvernance/roles` | GET | 401 | {"detail":"Not authenticated"}  |
| Gouvernance | Update grants | `/gouvernance/update-grants` | PUT | 401 | {"detail":"Not authenticated"}  |
| Gouvernance | Security matrix init | `/gouvernance/security-matrix/init` | POST | 401 | {"detail":"Not authenticated"}  |
| Gouvernance | Security matrix | `/gouvernance/security-matrix` | GET | 401 | {"detail":"Not authenticated"}  |
| Gouvernance | Security axes | `/gouvernance/security-axes` | GET | 401 | {"detail":"Not authenticated"}  |
| Gouvernance | RLS policies | `/gouvernance/rls-policies` | GET | 401 | {"detail":"Not authenticated"}  |
| Gouvernance | Policies row-access list | `/gouvernance/policies/row-access/list` | GET | 401 | {"detail":"Not authenticated"}  |
| Gouvernance | Policies masking list | `/gouvernance/policies/masking/list` | GET | 401 | {"detail":"Not authenticated"}  |
| Gouvernance | Policies network list | `/gouvernance/policies/network/list` | GET | 401 | {"detail":"Not authenticated"}  |
| Gouvernance | Policies tags list | `/gouvernance/policies/tags/list` | GET | 401 | {"detail":"Not authenticated"}  |
| Gouvernance | Policies objects databases | `/gouvernance/policies/objects/databases` | GET | 401 | {"detail":"Not authenticated"}  |
| Gouvernance | Policies health | `/gouvernance/policies/health` | GET | 200 |  |
| Mapping | Databases | `/mapping/databases` | GET | 401 | {"detail":"Not authenticated"}  |
| Mapping | Schemas | `/mapping/schemas/CP_DATA360` | GET | 401 | {"detail":"Not authenticated"}  |
| Mapping | Tables | `/mapping/tables/CP_DATA360/RETAIL_DW` | GET | 401 | {"detail":"Not authenticated"}  |
| Mapping | Table columns | `/mapping/get_table_columns/` | GET | 401 | {"detail":"Not authenticated"}  |
| Mapping | Get projects | `/mapping/get_projects` | POST | 401 | {"detail":"Not authenticated"}  |
| Mapping | Get scheduled deployments | `/mapping/get_scheduled_deployments/` | GET | 401 | {"detail":"Not authenticated"}  |
| Mapping | Describe selected columns | `/mapping/describe-selected-columns` | GET | 401 | {"detail":"Not authenticated"}  |
| Mapping | Constraints | `/mapping/constraints` | GET | 401 | {"detail":"Not authenticated"}  |
| Mapping | Details | `/mapping/details` | GET | 401 | {"detail":"Not authenticated"}  |
| Mapping | Create project | `/mapping/create_project` | POST | 401 | {"detail":"Not authenticated"}  |
| Mapping | Add event | `/mapping/add-event/` | POST | 401 | {"detail":"Not authenticated"}  |
| Mapping | Log event | `/mapping/log_event/` | POST | 401 | {"detail":"Not authenticated"}  |
| Mapping | Get steps event | `/mapping/get-steps-event/` | POST | 401 | {"detail":"Not authenticated"}  |
| Workflow | Get workflows | `/workflow/get_workflows/` | GET | 401 | {"detail":"Not authenticated"}  |
| Workflow | Create workflow | `/workflow/create_workflow/` | POST | 401 | {"detail":"Not authenticated"}  |
| Workflow | Execute workflow | `/workflow/execute_workflow/` | POST | 401 | {"detail":"Not authenticated"}  |
| Workflow | Schedule workflow | `/workflow/schedule_workflow/` | POST | 401 | {"detail":"Not authenticated"}  |
| Workflow | Setup init tables | `/workflow/setup/initialize-tables` | POST | 401 | {"detail":"Not authenticated"}  |
| Org Accounts | Dashboard | `/org-accounts/dashboard` | GET | 401 | {"detail":"Not authenticated"}  |
| Org Accounts | Overview | `/org-accounts/dashboard/overview` | GET | 401 | {"detail":"Not authenticated"}  |
| Org Accounts | Usage | `/org-accounts/dashboard/usage` | GET | 401 | {"detail":"Not authenticated"}  |
| Org Accounts | Trends | `/org-accounts/dashboard/trends` | GET | 401 | {"detail":"Not authenticated"}  |
| Org Accounts | Activity | `/org-accounts/dashboard/activity` | GET | 401 | {"detail":"Not authenticated"}  |
| Org Accounts | Accounts list | `/org-accounts/accounts` | GET | 401 | {"detail":"Not authenticated"}  |
| Org Accounts | Credits | `/org-accounts/credits` | GET | 401 | {"detail":"Not authenticated"}  |
| Org Accounts | Credits top | `/org-accounts/credits/top` | GET | 401 | {"detail":"Not authenticated"}  |
| Org Accounts | Credits trend | `/org-accounts/credits/trend` | GET | 401 | {"detail":"Not authenticated"}  |
| Org Accounts | Storage | `/org-accounts/storage` | GET | 401 | {"detail":"Not authenticated"}  |
| Org Accounts | Storage trend | `/org-accounts/storage/trend` | GET | 401 | {"detail":"Not authenticated"}  |
| Org Accounts | Warehouses | `/org-accounts/warehouses` | GET | 401 | {"detail":"Not authenticated"}  |
| Org Accounts | Balance | `/org-accounts/balance` | GET | 401 | {"detail":"Not authenticated"}  |
| Org Accounts | Health | `/org-accounts/health` | GET | 401 | {"detail":"Not authenticated"}  |
| Org Accounts | Alerts | `/org-accounts/alerts` | GET | 401 | {"detail":"Not authenticated"}  |
| Org Accounts | Reader accounts | `/org-accounts/reader-accounts` | GET | 401 | {"detail":"Not authenticated"}  |
| Org Accounts | Shares | `/org-accounts/shares` | GET | 401 | {"detail":"Not authenticated"}  |
| Observability | KPIs | `/observability/kpis` | GET | 401 | {"detail":"Not authenticated"}  |
| Observability | Dashboard | `/observability/dashboard` | GET | 401 | {"detail":"Not authenticated"}  |
| Observability | Health | `/observability/health` | GET | 200 |  |
| Observability | Compliance GDPR | `/observability/compliance/gdpr` | GET | 401 | {"detail":"Not authenticated"}  |
| Observability | Compliance SOC2 | `/observability/compliance/soc2` | GET | 401 | {"detail":"Not authenticated"}  |
| Observability | Lineage | `/observability/lineage` | GET | 401 | {"detail":"Not authenticated"}  |
| Observability | Activity summary | `/observability/activity/summary` | GET | 401 | {"detail":"Not authenticated"}  |
| Observability | Activity heatmap | `/observability/activity/heatmap` | GET | 401 | {"detail":"Not authenticated"}  |
| Observability | Security posture | `/observability/security/posture` | GET | 401 | {"detail":"Not authenticated"}  |
| Observability | Security sensitive-data | `/observability/security/sensitive-data` | GET | 401 | {"detail":"Not authenticated"}  |
| Observability | Cost warehouse-usage | `/observability/cost/warehouse-usage` | GET | 401 | {"detail":"Not authenticated"}  |
| Observability | Cost daily-credits | `/observability/cost/daily-credits` | GET | 401 | {"detail":"Not authenticated"}  |
| Observability | Cost storage | `/observability/cost/storage` | GET | 401 | {"detail":"Not authenticated"}  |
| Observability | Performance metrics | `/observability/performance/metrics` | GET | 401 | {"detail":"Not authenticated"}  |
| Observability | Performance slow-queries | `/observability/performance/slow-queries` | GET | 401 | {"detail":"Not authenticated"}  |
| Explore Design | Validate events | `/explore-design/events/validate` | POST | 401 | {"detail":"Not authenticated"}  |
| Explore Design | Schema clone preview | `/explore-design/schema-clone/preview` | POST | 401 | {"detail":"Not authenticated"}  |
| Connect | Integration | `/connect/integration` | GET | 401 | {"detail":"Not authenticated"}  |
| Connect | Databases browse | `/connect/databases/browse` | GET | 401 | {"detail":"Not authenticated"}  |
| Connect | Snowflake databases | `/connect/snowflake_lake/databases` | GET | 401 | {"detail":"Not authenticated"}  |
| Connect | Stages | `/connect/stages` | GET | 401 | {"detail":"Not authenticated"}  |
| Cache | Stream | `/api/cache/stream` | GET | 200 |  |
| Cortex | KPIs | `/cortex/kpis` | GET | 401 | {"detail":"Not authenticated"}  |
| Cortex | Query | `/cortex/query` | POST | 401 | {"detail":"Not authenticated"}  |

---
Généré par `test-endpoints-by-page.sh`
