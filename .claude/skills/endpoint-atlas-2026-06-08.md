# Data360 — Endpoint Atlas & Live Status (2026-06-08)

> Substitut in-repo de l'API Atlas (vault Obsidian `data360-coffre` absent de cette machine).
> Sweep live api.datalab360.io : 471 GET probés. **0 erreur 500** — backend déployé sain.
> `401/403`=existe+auth · `200`=public · `404`=NON déployé (nouvelle route de session, attend merge+deploy).

## Synthèse par module

| Module | routes (path) | déployées+OK | non déployées (404) | erreurs 5xx |
|--------|---------------|--------------|---------------------|-------------|
| explore-design | 151 | 49 | 1 | 0 |
| gouvernance | 130 | 56 | 2 | 0 |
| api | 86 | 64 | 0 | 0 |
| org-accounts | 76 | 64 | 1 | 0 |
| workflow | 63 | 28 | 2 | 0 |
| cortex | 61 | 28 | 0 | 0 |
| connect | 45 | 12 | 1 | 0 |
| observability | 38 | 33 | 0 | 0 |
| catalog | 32 | 16 | 7 | 0 |
| data-quality | 31 | 17 | 4 | 0 |
| command-center | 21 | 17 | 1 | 0 |
| projects | 19 | 10 | 0 | 0 |
| cache | 19 | 11 | 1 | 0 |
| bi-dashboard | 18 | 8 | 0 | 0 |
| chat | 9 | 5 | 0 | 0 |
| user | 8 | 3 | 0 | 0 |
| deployments | 8 | 2 | 0 | 0 |
| data-products | 7 | 2 | 2 | 0 |
| admin | 6 | 6 | 0 | 0 |
| common | 5 | 5 | 0 | 0 |
| cache-stream | 5 | 4 | 0 | 0 |
| notifications | 5 | 2 | 0 | 0 |
| docs | 2 | 2 | 0 | 0 |
| openapi.json | 1 | 1 | 0 | 0 |
| redoc | 1 | 1 | 0 | 0 |
| health | 1 | 1 | 0 | 0 |
| ready | 1 | 1 | 0 | 0 |
| signin | 1 | 0 | 0 | 0 |
| analytics | 1 | 1 | 0 | 0 |

**TOTAL** : 851 paths · 449 live-OK · 22 à déployer · 0 erreurs

## Routes à déployer (404 live = nouvelles routes de session, prêtes sur GitLab feat/backlog-v1)

- `DELETE/GET /cache/keys/{}`
- `GET /catalog/profile/{}/{}/{}`
- `GET /catalog/tables/{}/{}/{}/context`
- `GET /catalog/tables/{}/{}/{}/governance`
- `GET /catalog/tables/{}/{}/{}/ingestion`
- `GET /catalog/tables/{}/{}/{}/lineage`
- `GET /catalog/tables/{}/{}/{}/ownership`
- `GET /catalog/tags/flow`
- `GET /command-center/tabs/{}`
- `GET /connect/connectors/{}`
- `GET /data-products/{}/consumers`
- `GET /data-products/{}/lineage`
- `GET /data-quality/anomalies`
- `GET /data-quality/snapshot`
- `GET /data-quality/trust-center/recommendations`
- `GET /data-quality/trust-center/report`
- `GET /explore-design/{}/deployment-readiness`
- `GET /gouvernance/policies`
- `GET /gouvernance/roles/{}/least-privilege`
- `GET /org-accounts/cost-simulation/{}/{}`
- `GET /workflow/catalog/blocks`
- `GET/POST /workflow/{}/contributors`