# Data360 - Résultats des tests d’endpoints (Backend)

**Date:** 2026-02-05T22:00:50+01:00
**Base URL:** http://127.0.0.1:8000

## Résumé des appels

| Page / Zone | Endpoint | Méthode | Statut | Résultat |
|--------------|----------|---------|--------|----------|
| User Register | `/user/register/` | POST | 422 | SKIP/FAIL |
| User Login | `/user/login/` | POST | 500 | FAIL |
| User Me/Modules | `/user/me/modules` | GET | 401 | FAIL |
| Client Dashboard | `/gouvernance/client/dashboard` | GET | 401 | FAIL |
| Dashboard Activity | `/gouvernance/dashboard/activity?start_date=2025-01-01T00:00:00&end_date=2025-12-31T23:59:59` | GET | 401 | FAIL |
| Stage Storage | `/gouvernance/get_stage_storage_info` | GET | 401 | FAIL |
| DWH Storage | `/gouvernance/get_dwh_storage_info?database_name=CP_DATA360&schema_name=RETAIL_DW` | GET | 401 | FAIL |
| DWH Schemas | `/gouvernance/get_dwh_schemas` | GET | 401 | FAIL |
| User Info | `/gouvernance/get_user_info` | GET | 401 | FAIL |
| Connectors Info | `/gouvernance/info` | GET | 401 | FAIL |
| Gouvernance Users | `/gouvernance/users` | GET | 401 | FAIL |
| Gouvernance Roles | `/gouvernance/roles` | GET | 401 | FAIL |
| Mapping Databases | `/mapping/databases` | GET | 401 | FAIL |
| Mapping Projects (POST) | `/mapping/get_projects` | GET | 405 | FAIL |
| Mapping get_projects | `/mapping/get_projects` | POST | 401 | FAIL |
| Workflow Get Workflows | `/workflow/get_workflows/` | GET | 401 | FAIL |
| Org Dashboard Overview | `/org-accounts/dashboard/overview` | GET | 401 | FAIL |
| Org Dashboard Usage | `/org-accounts/dashboard/usage` | GET | 401 | FAIL |
| Org Accounts List | `/org-accounts/accounts` | GET | 401 | FAIL |
| Org Health | `/org-accounts/health` | GET | 401 | FAIL |
| Observability KPIs | `/observability/kpis` | GET | 401 | FAIL |
| Observability Dashboard | `/observability/dashboard` | GET | 401 | FAIL |
| Observability Health | `/observability/health` | GET | 200 | OK |
| Explore Design Validate Events | `/explore-design/events/validate` | POST | 401 | FAIL |
| Cache Stream (SSE) | `/api/cache/stream` | GET | 200 | OK |

---
Généré par `test-full-flow.sh`
