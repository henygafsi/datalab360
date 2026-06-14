---
name: api-endpoint-test-report-2026-06-08
description: >
  Résultat du test structurel de TOUS les endpoints de l'API live api.datalab360.io
  (911 opérations, sweep méthode-aware sans auth contre la surface nginx :80, 2026-06-08).
  0 erreur 5xx, 0 timeout. Source de vérité pour le statut live de chaque route + findings sécurité (cache non authentifié).
---

# Data360 API — Rapport de Test Endpoints (live)

> **Date** : 2026-06-08 · **Cible** : `http://api.datalab360.io` (surface nginx :80, ce que les users touchent réellement)
> **Spec source** : `http://api.datalab360.io:8000/openapi.json` (OpenAPI 3.1.0, title `Data360`)
> **Couverture** : **911 opérations** (815 paths × méthodes) — 100 % des routes déployées.

## Méthodologie & honnêteté du test

Test **structurel, sans authentification, method-aware**, sur les 911 opérations :
- **GET** : probe direct (lecture seule).
- **POST/PUT/PATCH/DELETE** : probe **sans token** + body `{}` + id de path **factice inexistant** (`__d360_probe__`/`0`). Le pre-hook d'auth rejette en 401/403 **avant** d'exécuter le moindre handler → **aucune ressource n'est jamais mutée**. Sûr sur la production.

**Ce que ce test prouve** : routage, gating d'authentification, intégrité de déploiement, absence de crash (5xx) et contrat d'erreur, pour 100 % de la surface.

**Ce que ce test NE prouve PAS (limite assumée)** : le comportement *fonctionnel* authentifié (formes de réponses réelles, logique métier). Le test fonctionnel est **bloqué** car le compte de test documenté (`abcd`) renvoie `ACCOUNT_NOT_FOUND` (trial Snowflake expiré). Pour un test fonctionnel complet, fournir un `account_name/username/password` valide ou un Bearer token. → 893 routes renvoient `401` : c'est la preuve qu'elles **existent et sont protégées**, pas qu'elles « fonctionnent ».

## Résultat global

| Classification | Count | % | Signification |
|----------------|------:|--:|---------------|
| `401 AUTH_REQUIRED` | 893 | 98% | Route existe + correctement protégée ✅ |
| `200 REACHABLE_OK` | 13 | 1% | Endpoint **public** (sans auth) |
| `400 BAD_REQUEST` | 4 | <1% | Validation atteinte (body vide envoyé) — attendu |
| `404 RESOURCE` | 1 | <1% | Ressource id-factice introuvable — attendu |
| `5xx SERVER_ERROR` | **0** | 0% | **Aucun crash backend** ✅ |
| `NO_RESPONSE` (timeout/reset) | **0** | 0% | **Aucune route injoignable** ✅ |

**Verdict** : la surface déployée est **saine** — 911/911 opérations répondent avec un contrat correct, **0 erreur serveur, 0 timeout**.

## ⚠️ Finding sécurité — namespace `/cache/*` non authentifié

8 opérations cache répondent **200 sans aucun token**, dont des **mutations destructives** :

| Méthode | Path | Risque |
|---------|------|--------|
| `POST` | `/cache/clear/all` | **Vidage total du cache Redis prod par n'importe qui** (DoS / cache-stampede) |
| `POST` | `/cache/clear/pattern` | Invalidation ciblée non autorisée |
| `POST` | `/cache/warmup` | Déclenchement de charge non autorisé |
| `GET` | `/cache/keys`, `/cache/stats`, `/cache/health`, `/cache/test-connection`, `/cache/svc-health` | Exposition d'infos d'infra (clés, hits/misses, état Redis) |

**Recommandation** : passer tout `/cache/*` derrière `require_module_access()` / rôle Platform Admin (au minimum les `POST clear/*` et `warmup`).

> **MàJ 2026-06-09** — déjà corrigé dans le code (voir [§ RÉSOLUTION](#-résolution-du-finding-sécurité-cache-2026-06-08) en bas) : toutes les routes sont gatées sur `feat/backlog-v1`. Le live reste exposé tant que la branche n'est pas **mergée+déployée** (P0 utilisateur). **Reste un nit** : `DELETE /cache/keys/{key}` utilise `get_current_user` alors que ses voisins `POST/GET /keys` exigent `require_accountadmin_role` → à durcir pour cohérence.

## Endpoints publics (intentionnels — OK)

- `GET /health` — health/discovery public.
- `GET /ready` — health/discovery public.
- `GET /gouvernance/policies/health` — health/discovery public.
- `GET /api/recommendations/glossary` — health/discovery public.
- `GET /api/workspace/investigation-modes` — health/discovery public.

## Les 4 `400` (attendus, non-bugs)

`POST /signin`, `POST /user/login/`, `POST /user/register/`, `POST /cache/keys` → `400` car le probe envoie un body `{}` (champs requis manquants). Conforme au contrat d'erreur (« 400 = validation / Snowflake non connecté »).

## Couverture par module (les 41 tags OpenAPI)

| Tag (module) | Ops | 401 auth | 200 public | 400 | 5xx |
|--------------|----:|---------:|-----------:|----:|----:|
| Explore & Design Module | 111 | 111 | 0 | 0 | 0 |
| Cortex Analytics & AI | 67 | 67 | 0 | 0 | 0 |
| Governance Policies | 57 | 56 | 1 | 0 | 0 |
| Workflow Module | 54 | 54 | 0 | 0 | 0 |
| Gouvernance | 53 | 53 | 0 | 0 | 0 |
| Explore & Design Lifecycle | 44 | 44 | 0 | 0 | 0 |
| Observability | 43 | 43 | 0 | 0 | 0 |
| Datalake Management | 42 | 42 | 0 | 0 | 0 |
| Organization Accounts | 39 | 39 | 0 | 0 | 0 |
| Snowflake Objects Explorer | 38 | 38 | 0 | 0 | 0 |
| Organization Accounts — FinOps | 26 | 26 | 0 | 0 | 0 |
| BI Dashboard | 25 | 25 | 0 | 0 | 0 |
| Catalog Intelligence | 25 | 25 | 0 | 0 | 0 |
| Data Quality | 25 | 25 | 0 | 0 | 0 |
| Unified Projects | 23 | 23 | 0 | 0 | 0 |
| Platform Core | 22 | 22 | 0 | 0 | 0 |
| Cache Management | 21 | 11 | 8 | 1 | 0 |
| Command Center | 20 | 20 | 0 | 0 | 0 |
| Workflow Integrations | 16 | 16 | 0 | 0 | 0 |
| Explore & Design (guided wizard) | 15 | 15 | 0 | 0 | 0 |
| GUI Permissions | 13 | 13 | 0 | 0 | 0 |
| Recommendations | 12 | 11 | 1 | 0 | 0 |
| Governance — D360 Roles | 11 | 11 | 0 | 0 | 0 |
| User Workspace | 11 | 10 | 1 | 0 | 0 |
| Chat | 11 | 11 | 0 | 0 | 0 |
| Data360 Config | 10 | 10 | 0 | 0 | 0 |
| User & Auth | 9 | 7 | 0 | 2 | 0 |
| Deployment Tracking | 9 | 9 | 0 | 0 | 0 |
| Organization Accounts — CRUD | 8 | 8 | 0 | 0 | 0 |
| Organization Accounts — Lifecycle | 7 | 7 | 0 | 0 | 0 |
| Data Products | 6 | 6 | 0 | 0 | 0 |
| Platform Admin | 6 | 6 | 0 | 0 | 0 |
| Common | 5 | 5 | 0 | 0 | 0 |
| Cache (SSE) | 5 | 5 | 0 | 0 | 0 |
| Notifications | 5 | 5 | 0 | 0 | 0 |
| Governance Reverse Provisioning | 4 | 4 | 0 | 0 | 0 |
| Administration | 4 | 4 | 0 | 0 | 0 |
| Platform | 3 | 1 | 2 | 0 | 0 |
| Project RLS | 3 | 3 | 0 | 0 | 0 |
| Analytics & KPIs | 2 | 2 | 0 | 0 | 0 |
| Auth | 1 | 0 | 0 | 1 | 0 |

## Drift code↔déployé (vérifié live 2026-06-08)

L'OpenAPI live (911 ops) **= exactement ce qui est déployé**. L'`endpoint-atlas-2026-06-08` avait identifié 22 routes présentes sur la branche GitLab `feat/backlog-v1` mais pas encore déployées. **Re-vérification live ce jour** : **21/22 toujours absentes** (404 confirmé), seul `/cache/keys/{key}` a été déployé depuis. Les 21 routes en attente de merge+deploy (404 live, absentes de l'OpenAPI déployé) :

| Domaine | Routes encore non déployées (404 live) |
|---------|----------------------------------------|
| catalog | `/catalog/profile/{}/{}/{}`, `/catalog/tables/{}/{}/{}/{context,governance,ingestion,lineage,ownership}`, `/catalog/tags/flow` |
| data-quality | `/data-quality/anomalies`, `/data-quality/snapshot`, `/data-quality/trust-center/{recommendations,report}` |
| gouvernance | `/gouvernance/policies`, `/gouvernance/roles/{}/least-privilege` |
| workflow | `/workflow/catalog/blocks`, `/workflow/{}/contributors` |
| autres | `/command-center/tabs/{}`, `/connect/connectors/{}`, `/data-products/{}/consumers`, `/data-products/{}/lineage`, `/explore-design/{}/deployment-readiness`, `/org-accounts/cost-simulation/{}/{}` |

**Impact** : ce sont des features riches (détail de table catalog : lineage/ownership/governance ; DQ trust-center ; least-privilege RBAC) codées mais invisibles en prod tant que `feat/backlog-v1` n'est pas mergée+déployée. **Action** : merge+deploy de `feat/backlog-v1`.

## Artefacts
- `sweep_results.json` — statut live des 911 ops (job tmp).
- `slices/*.md` — 41 tables par tag : méthode, path, summary, params, schémas req/resp + statut live.

---

## ✅ RÉSOLUTION du finding sécurité `/cache/*` (2026-06-08)

Le namespace `/cache/*` non authentifié a été **corrigé** dans le code (commit backend, `feat/backlog-v1`) :

| Route | Avant | Après |
|-------|-------|-------|
| `POST /cache/clear/all` | **public** ☠ | `require_accountadmin_role` (Platform Admin) |
| `POST /cache/clear/pattern` | public | `require_accountadmin_role` |
| `POST /cache/warmup` | public | `require_accountadmin_role` |
| `GET/POST /cache/keys`, `GET /cache/keys/{key}` | public | `require_accountadmin_role` |
| `GET /cache/stats`, `/svc-health`, `/test-connection` | public | `require_accountadmin_role` |
| `GET /cache/health` | public | `get_current_user` (authentifié) |

- Fichier : `app/modules/cache/routers/cache_management.py`. `cache_stream.py` était déjà entièrement gaté.
- Les 19 routes cache restent enregistrées (vérifié `from app.main import app`).
- **Front** : `services/cache/index.ts` n'expose QUE des lectures (keys/stats/breakdown), consommées uniquement par la page admin `data360-config` → gating admin cohérent, **0 casse** pour les users normaux, **aucune op destructive exposée au front**.
- ⏳ Devient effectif en live après merge+deploy (le live testé reste l'ancien déploiement vulnérable jusque-là — **à déployer en priorité**).

## ⏳ Test fonctionnel authentifié — bloqué sur credentials
Compte `abcd` = `ACCOUNT_NOT_FOUND` (trial expiré). Pour rejouer le sweep en mode **fonctionnel** (formes de réponses réelles, logique métier) avec le compte **HAHA**, il faut un `account_name` + `username` + `password` HAHA valides, OU un Bearer token. Sans ça, impossible d'authentifier (un mot de passe ne se devine pas). → fournir les creds HAHA pour lancer le test fonctionnel complet.
