# RUNBOOK — Tester live l'app Next.js sur la Marketplace org (Track C)

Cible : org account **uchsfvb-ky11038**. But : faire tourner le **front Next.js dans SPCS**, l'empaqueter en **Native App**, et l'installer via un **Organizational Listing privé** (Internal Marketplace) — sans review publique ni monétisation.

> **Backend** : reste externe (`api.datalab360.io`), joint via **External Access Integration**. Seul le front est containerisé (le backend FastAPI n'est pas dans ce repo).

## Sécurité (à lire d'abord)
- Le PAT collé dans le chat est **considéré compromis** → **roter** après usage.
- Utiliser un **PAT dédié court-lived** limité à un rôle de test. L'exporter en env, **jamais** sur disque/commit/mémoire.
- **ORGADMIN ne suffit pas** pour créer les objets SPCS → utiliser un rôle **ACCOUNTADMIN** (ou rôle avec `CREATE COMPUTE POOL` + `CREATE IMAGE REPOSITORY`). `[À VÉRIFIER DOC]`

## Prérequis
- `snow` CLI ≥ 3, `docker`, `terraform`.
- Connexion :
  ```bash
  export SNOWFLAKE_ORGANIZATION_NAME=<org de uchsfvb-ky11038>
  export SNOWFLAKE_ACCOUNT_NAME=KY11038
  export SNOWFLAKE_USER=ORGAADMIN_USER
  export SNOWFLAKE_AUTHENTICATOR=PROGRAMMATIC_ACCESS_TOKEN   # [À VÉRIFIER DOC]
  export SNOWFLAKE_TOKEN=<PAT dédié court-lived>
  export SNOWFLAKE_ROLE=ACCOUNTADMIN
  export SNOWFLAKE_WAREHOUSE=COMPUTE_WH
  export SNOWFLAKE_DATABASE=CP_DATA360
  export TF_VAR_nextauth_secret="$(openssl rand -base64 32)"
  ```

## Étapes (toutes via `scripts/deploy-live.sh <step>`)

| # | Commande | Effet | Coût |
|---|---|---|---|
| 1 | `deploy-live.sh check` | Probe **read-only** : account/role/region, grants, dispo SPCS. | 0 |
| 2 | `deploy-live.sh infra` | `terraform apply` : schema APP_TEST, image repo, compute pool, network rule, secret NextAuth, resource monitor — **puis crée l'EAI via SQL** (le provider n'a pas de ressource EAI). | compute pool = facturé |
| 3 | `deploy-live.sh image` | `docker build -f Dockerfile.spcs` + push vers l'image repo. | build local |
| 4 | `deploy-live.sh service` | **Track A** : `CREATE SERVICE` + EAI → endpoint public. Patcher `NEXTAUTH_URL` avec l'ingress_url puis relancer. | compute |
| 5 | `APP_URL=<url> deploy-live.sh smoke` | `curl` → **atteignabilité** (code + redirect). ⚠️ derrière OAuth → 200/302 = joignable, PAS « app atteinte ». Validation réelle = **login navigateur**. | 0 |
| 6 | `deploy-live.sh app` | **Track B** : `snow app run` (package Native App + install en debug). | compute |
| 7 | `deploy-live.sh listing` | **Track C** : Organizational Listing privé. Si le DDL n'est pas accepté → Provider Studio (UI). `[À VÉRIFIER DOC]` | 0 |

## Track C — Organizational Listing (le « test Marketplace »)
- Un **Organizational Listing** partage l'app **en privé dans l'org**, visible dans l'**Internal Marketplace** des comptes ciblés — pas de security review publique.
- Cibler un **compte de test** de l'org (ou le même compte) comme consommateur.
- Côté consommateur : accorder les privilèges demandés (`CREATE COMPUTE POOL`, `BIND SERVICE ENDPOINT`), **binder la référence `backend_eai`**, puis :
  ```sql
  CALL DATA360_APP.core.start_app('DATA360_POOL');
  CALL DATA360_APP.core.app_url();   -- URL à tester
  ```
- Si le DDL `CREATE ORGANIZATION LISTING` n'est pas dispo dans ta version : faire le listing via **Snowsight → Provider Studio → Listings → Organizational**. `[À VÉRIFIER DOC]`

## Points à intégrer / risques
- **🔴 AUTH = risque #1 pour le but réel (« tester live »), pas un détail.** L'endpoint SPCS `public:true` est **derrière l'OAuth login Snowflake**. Ton NextAuth (CredentialsProvider → backend → token Snowflake) se retrouve **derrière** ce portail → double-auth ou session cassée probable. **Si ça ne se résout pas, l'app se déploie mais le test live échoue au point le plus important.** À prototyper en priorité à l'étape 4 (login navigateur), avant d'investir dans Track B/C. `[À VÉRIFIER DOC]`
- **⚠️ Le smoke test (étape 5) ne valide PAS « l'app est atteinte ».** Un `curl` sur l'endpoint OAuth-gated renvoie une **redirection/login Snowflake** (HTTP 200/302 d'une page de login), pas l'app. Le step `smoke` affiche désormais le code + redirect et l'avertit. **Validation réelle = login navigateur.**
- **NEXTAUTH_URL** : connu seulement après provisioning de l'endpoint → process two-pass (étape 4).
- **Coût (corrigé)** : le **resource monitor ne couvre PAS les compute pools** (il gouverne les crédits *warehouse* seulement). Le **vrai garde-fou du pool** = `max_nodes=1` + `auto_suspend_secs=600`. **Suspendre/`DROP` le pool après test** (cf. Teardown) — ne pas compter sur le monitor.
- **Provider Terraform (vérifié vs docs)** : `snowflake_compute_pool` / `image_repository` / `secret_with_generic_string` / `network_rule` / `resource_monitor` / `stage` existent et sont **stables (pas de preview flag requis)**. ⚠️ **`snowflake_external_access_integration` N'EXISTE PAS** → l'EAI est créée en **SQL** par le step `infra`. Si un `apply` renvoie « resource is in preview », ajouter le flag exact nommé dans `preview_features_enabled`.

## Teardown (après test, pour stopper les coûts)
```sql
DROP SERVICE IF EXISTS CP_DATA360.APP_TEST.DATA360_FRONTEND;
ALTER COMPUTE POOL DATA360_POOL SUSPEND;   -- ou DROP COMPUTE POOL
```
puis `terraform destroy` dans `infra/terraform/`.
```
```
