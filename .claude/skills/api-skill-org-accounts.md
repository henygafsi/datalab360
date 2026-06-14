---
name: api-skill-org-accounts
description: >
  Module Org & Accounts de Data360 (routes /account-overview · /client-accounts).
  Command Center (KPIs, cost-breakdown, security-audit, audit login/query/access) +
  cycle de vie des comptes Snowflake (create/suspend/activate/reset/rotate/mfa/transfer/drop,
  orgadmin only) + FinOps (metering, credits, cost-simulation/forecast, resource-monitors,
  warehouse remediation) + Data Sharing. 100 endpoints live (39 org + 26 finops + 8 crud +
  7 lifecycle + 20 command-center, tous 401 AUTH_REQUIRED = protégés). RBAC PAR RÔLE :
  _require_orgadmin sur les mutations, dégradation douce ORGADMIN→ACCOUNT sur les lectures.
  Grounded sur le code réel + sweep live — 2026-06-09.
---

# Org & Accounts — Skill Module (API-grounded, 2026-06-09)

> Toutes les affirmations sont sourcées (fichier:ligne ou slice). Les endpoints viennent **uniquement** des 5 slices live (`organization-accounts*.md`, `command-center.md`) + scan des routers backend. Aucun endpoint inventé. Zones non confirmées = « non vérifié ». **Honnêteté :** « testé » = OpenAPI + scan de code + re-test structurel **sans auth** (pas de creds Snowflake) ; un `401` prouve l'existence + le gardiennage RBAC, **pas** que la logique métier tourne sur données réelles (compte de test expiré).

## 1. Vue d'ensemble

| Élément | Valeur (source) |
|---------|-----------------|
| **Routes front** | `/account-overview` (Command Center) · `/client-accounts` (OrgAccountsDashboard) · `/users/view/[id]` · `/users/edit/[id]` |
| **Entry Command Center** | `apps/data360/src/app/(dashboard)/account-overview/page.tsx` (ErrorBoundary classe + freshness chip) |
| **Entry Client Accounts** | `apps/data360/src/app/(dashboard)/client-accounts/page.tsx` |
| **Dashboard 8 onglets** | `shared/org-accounts/tabs/` : `overview-tab`, `credits-tab`, `storage-tab`, `warehouses-tab`, `billing-tab`, `compute-services-tab`, `health-alerts-tab`, `data-sharing-tab` |
| **Composants clés** | `accounts-table.tsx`, `AccountCreationWizard.tsx` (wizard 3 étapes), `AccountLifecycleMenu.tsx` (kebab suspend/drop/…), `account-detail-modal.tsx`, `health-overview.tsx`, `alerts-panel.tsx` |
| **Service FinOps/audit** | `services/org-accounts/hooks.ts` (`BASE_URL='/org-accounts'`, audit + cortex-costs + forecast) |
| **Service Command Center** | `services/command-center/index.ts` (`PREFIX='/command-center'`, overview-kpis + security-audit + tabs) |
| **Module backend** | **4 routers** : `org_accounts/router.py` (124 Ko, 2927 l.), `crud_router.py` (32 Ko), `finops_router.py` (78 Ko, 1751 l.), `lifecycle_router.py` (15 Ko) ; + `command_center/router.py` (47 Ko) + `services.py` (99 Ko) |
| **Gate module** | `require_module("account_overview")` au niveau router (`dependencies=[Depends(...)]`) sur **les 5 routers** `[trace: router.py:33 · crud_router.py:69 · finops_router.py:38 · lifecycle_router.py:43 · command_center/router.py:63]` |

**RBAC PAR RÔLE (le cœur du module).** Trois mécanismes distincts (cf. vault `pages/org-accounts.md` en-tête) :
1. **Module grant [Hard]** — `require_module("account_overview")` (403 avant tout handler).
2. **JWT role check [Hard — mutations]** — `_require_orgadmin(current_user)` vérifie `current_user["role"].upper()=='ORGADMIN'` → 403 sinon `[trace: lifecycle_router.py:70 · crud_router.py:134]`. Appelé par **toutes** les mutations lifecycle/crud. (Note code : ce check porte sur le **rôle JWT du caller**, pas sur `CURRENT_ROLE()` de la connexion service partagée — délibéré, `lifecycle_router.py:73-77`.)
3. **Snowflake visibility [Soft — lectures]** — les lectures tournent sur la connexion du caller ; `ORGANIZATION_USAGE.*` requiert ORGADMIN. Absent → `_safe_query` avale l'exception et renvoie `[]` ; `dashboard/overview` détecte la capacité via `SHOW ORGANIZATION ACCOUNTS` → `is_org_admin` + `scope` dans le payload. **Pas de 403** sur les lectures, seulement une dégradation de scope.

| Rôle | Capacités (vérifiées) |
|------|------------------------|
| **ORGADMIN** | toutes les mutations (`_require_orgadmin`) + lecture org-wide (`ORGANIZATION_USAGE`) |
| **ACCOUNTADMIN** | lecture account-scoped (`ACCOUNT_USAGE` : audit, metering, warehouses) ; mutations lifecycle = 403 |
| Autres rôles avec grant `account_overview` | lecture dégradée (`scope:"account"` / `[]`) ; mutations = 403 |

## 2. Capacités (grounded)

| Capacité | Implémentation (endpoint / fichier) |
|----------|--------------------------------------|
| Tableau de bord consolidé (9 cards + 6 donuts + 2 panels) | `getOverviewKpis(range)` → `GET /command-center/overview-kpis` (`services/command-center/index.ts:117`) |
| Envelope par onglet Command Center | `getTab(tab,params)` → `GET /command-center/tabs/{tab}` (`index.ts:235`) |
| Lister/filtrer les comptes | `getAccounts(filters)` → `GET /org-accounts/accounts` |
| Détail composite d'un compte | `GET /org-accounts/accounts/{account_name}` |
| Provisionner un compte (wizard 3 étapes) | `createAccount(payload)` → `POST /org-accounts/accounts` (orgadmin) |
| Lifecycle compte | suspend/activate/reset-password/rotate-keys/transfer-ownership/mfa → `POST\|PATCH /org-accounts/accounts/{name}/…` (orgadmin) |
| Drop compte (grace period) | `dropAccount(name,…)` → `DELETE /org-accounts/accounts/{name}` (orgadmin) |
| **Cost-breakdown / intelligence coût** | `GET /command-center/cost-breakdown` (`days,warehouse,user`) |
| **Credits (agrégat / trend / top / par compte)** | `GET /org-accounts/credits[/trend\|/top\|/history/{name}]` |
| **Metering** | `GET /org-accounts/metering[/trend]` |
| **Cost-simulation / forecast** | `getCreditForecast(daysBack)` → `GET /org-accounts/credit-forecast` (`days_back`) + `/rate-sheet` + `/organization/remaining-balance` + `/contract` |
| **Serverless spend (FinOps)** | `GET /org-accounts/services/{clustering,materialized-views,pipes,query-acceleration,search-optimization}` |
| **Cortex AI cost** | `GET /org-accounts/cortex-costs` (`hooks.ts:778`) |
| **Anomalies coût/usage** | `GET /org-accounts/anomalies` |
| **Resource monitors (quota crédit)** | `GET /org-accounts/resource-monitors` · `POST /org-accounts/resource-monitors` (orgadmin) |
| **Warehouse remediation** | `PATCH …/warehouses/{wh}/auto-suspend` · `POST …/{wh}/resize` · `/suspend` (orgadmin) |
| **Audit login (par rôle)** | `GET /org-accounts/audit/login-history` (`hooks.ts:906`) · `/logins` · `/logins/failed` · `/logins/{name}` · `GET /command-center/audit/login-history` |
| **Audit query (DQL, ROLE_NAME)** | `GET /org-accounts/audit/query-history` (`hooks.ts:888`) · `GET /command-center/audit/query-history` |
| **Audit access (données + policies)** | `GET /org-accounts/audit/access-history` (`hooks.ts:897`) · `GET /command-center/audit/access-history` |
| **Sécurité (trifecta)** | `GET /command-center/security-audit` · `GET /org-accounts/security-overview` · `/security-posture` |
| Data Sharing | `GET /org-accounts/reader-accounts` (list) · `DELETE /reader-accounts/{name}` (drop, orgadmin) · `GET /shares` · `GET /shares/{share_name}` (detail). **`POST /reader-accounts` (create) = NON déployé** (405 — non vérifié comme implémenté) |
| Gouvernance (rollups) | `GET /org-accounts/governance-overview` · `/governance-grants-overview` · `/grants-overview` |

## 3. Référence endpoints (100 ops — statut live)

**Contrat de statut** : sur les 5 slices, **les 100 ops renvoient `401 AUTH_REQUIRED`** = routes protégées (RBAC actif), enregistrées et déployées. Aucune route publique (200), aucun 404/500. Re-test ciblé 2026-06-09 (IP directe + `Host`) : `0` route `404`, `0` `5xx` ; `405` retourné sur un mauvais verbe (ex. GET sur un POST lifecycle) = path enregistré.

### 3a. Command Center (20 ops) — slice `command-center.md`

| Live | Méthode | Path | Usage |
|------|---------|------|-------|
| 401 | GET | `/command-center/overview-kpis` | Payload Overview (9 cards + 6 donuts + 2 panels), query `range` |
| 401 | POST | `/command-center/overview-kpis/install` | Provisionner `DATA360_CACHE.OVERVIEW_KPIS` (table+proc+tasks) |
| 401 | POST | `/command-center/overview-kpis/refresh` | Forcer refresh cache (query `range`) |
| 401 | GET | `/command-center/summary` | Executive summary all-module |
| 401 | GET | `/command-center/tabs/{tab}` | Envelope par onglet (kpis+charts+tables) |
| 401 | GET | `/command-center/cost-breakdown` | Intelligence coût (days, warehouse, user) |
| 401 | GET | `/command-center/security-audit` | Audit sécurité (days, user) |
| 401 | GET | `/command-center/audit/login-history` | Audit login (days, user, status, limit) |
| 401 | GET | `/command-center/audit/query-history` | Audit query (days, user, warehouse, status, limit) |
| 401 | GET | `/command-center/audit/access-history` | Audit accès données (days, user, object_type, limit) |
| 401 | GET | `/command-center/activity-feed` | Feed unifié (page, page_size, module_name, username) |
| 401 | GET | `/command-center/module-health` | Santé par module (module) |
| 401 | GET | `/command-center/infrastructure` | Snapshot infra Snowflake (days) |
| 401 | GET | `/command-center/pipelines` | Santé pipelines/ingestion (days) |
| 401 | GET | `/command-center/query-intelligence` | Top/slow queries, erreurs |
| 401 | GET | `/command-center/warehouse-performance` | Perf warehouse (days, warehouse) |
| 401 | GET | `/command-center/cross-module` | Intelligence cross-module (join) |
| 401 | GET | `/command-center/filter-options` | Options de filtre + counts |
| 401 | GET | `/command-center/time-context` | Parse range + période de comparaison |
| 401 | GET | `/command-center/profiling/column` | Profil colonne (table*, column*, limit) |
| 401 | POST | `/command-center/warm-user-cache` | Warm caches du user courant |

### 3b. Org-Accounts cœur (39 ops) — slice `organization-accounts.md`

Comptes : `GET /accounts` (status,edition,cloud,region,search) · `GET /accounts/{name}` · `GET /health` · `GET /health/{name}` · `GET /account-health-score` · `GET /alerts?days`.
Dashboard : `GET /dashboard/{overview,trends?days,usage?days}` · `GET /filter-options` · `GET /org-summary` (role→module→account).
Coût/metering : `GET /credits?days` · `/credits/trend?days` · `/credit-forecast?days_back` · `/metering?days` · `/cortex-costs?days` · `/cross-account/usage?days`.
Org-level : `GET /organization/{costs?days,remaining-balance,storage?days,warehouse-credits?days}`.
Audit/historique : `GET /audit/{query,access,login}-history` · `/logins?days&limit` · `/logins/failed?days&limit` · `/logins/{name}?days&limit` · `/events` (page,page_size,module,event_type,days) · `/platform-activity` (days,username,module_name,event_type).
Sécurité/projets : `GET /security-overview?days` · `/security-posture?days` · `/projects-overview` · `/usage-analytics?days`.
Data sharing : `GET /reader-accounts` · `GET /shares` · `GET /warehouses/{name}?days`.
Resource/automation : `GET /resource-monitors` · `POST /row-timestamps/activate` (database*) · `GET /row-timestamps/status` (database*,schema).
Mutation : `DELETE /accounts/{name}` (DropAccountRequest — orgadmin, grace period).

### 3c. FinOps (26 ops) — slice `organization-accounts-finops.md`

`GET /anomalies?days` · `/automation-overview?days` · `/contract` · `/rate-sheet` · `/credits/top?days&limit` · `/metering/trend?days` · `/replication?days` · `/data-transfer?days` · `/data-loading-overview?days` · `/data-operations-overview?days` · `/performance-overview?days` · `/governance-overview` · `/governance-grants-overview?days` · `/grants-overview?days` · `/queries?days` · `/queries/trend?days` · `/warehouses?days` · `/storage/{databases,stages,trend?days}` · `/services/{clustering,materialized-views,pipes,query-acceleration,search-optimization}?days` · `/shares/{share_name}` (detail).

### 3d. CRUD (8 ops) — slice `organization-accounts-crud.md` (mutations = orgadmin)

| Live | Méthode | Path | Body | Rôle |
|------|---------|------|------|------|
| 401 | POST | `/org-accounts/accounts` | CreateAccountRequest | orgadmin |
| 401 | GET | `/org-accounts/accounts/{account_name}` | — | lecture |
| 401 | PATCH | `/org-accounts/accounts/{account_name}` | UpdateAccountRequest | orgadmin |
| 401 | GET | `/org-accounts/credits/history/{account_name}` | query `days` | lecture |
| 401 | POST | `/org-accounts/resource-monitors` | ResourceMonitorRequest | orgadmin |
| 401 | PATCH | `/org-accounts/warehouses/{warehouse_name}/auto-suspend` | AutoSuspendRequest | orgadmin |
| 401 | POST | `/org-accounts/warehouses/{warehouse_name}/resize` | ResizeWarehouseRequest | orgadmin |
| 401 | POST | `/org-accounts/warehouses/{warehouse_name}/suspend` | — | orgadmin |

### 3e. Lifecycle (7 ops) — slice `organization-accounts-lifecycle.md` (toutes orgadmin)

`POST /accounts/{name}/activate` · `/suspend` · `/reset-password` · `/rotate-keys` · `POST /accounts/{name}/transfer-ownership` (TransferOwnershipRequest) · `PATCH /accounts/{name}/mfa` (MfaEnforcementRequest) · `DELETE /reader-accounts/{account_name}` (drop reader).

**Drift de path connu (corps historique vault) :** le corps historique cite `GET /billing/estimate`, `/billing/pricing`, `/account/{id}/usage`, `GET/PUT /governance/users/{username}` comme cibles — **absents des 5 slices org-accounts** (billing = module non présent ; users = appartient au module Governance). Voir §7.

## 4. Modèle de données (sources Snowflake + tables CP_DATA360)

| Source | Utilisée par | Privilège requis | Dégradation si absent |
|--------|--------------|------------------|------------------------|
| `ORGANIZATION_USAGE.ACCOUNTS` | list accounts, dashboard, health | ORGADMIN | `[]` (`_safe_query`) |
| `ORGANIZATION_USAGE.USAGE_IN_CURRENCY_DAILY` | credits, health | ORGADMIN | série vide |
| `ORGANIZATION_USAGE.METERING_DAILY_HISTORY` | metering, forecast | ORGADMIN | 0 |
| `ORGANIZATION_USAGE.STORAGE_DAILY_HISTORY` | storage trend | ORGADMIN | série vide |
| `ACCOUNT_USAGE.QUERY_HISTORY` | `audit/query-history` (QUERY_ID, QUERY_TYPE, **ROLE_NAME**, EXECUTION_STATUS, TOTAL_ELAPSED_TIME, BYTES_SCANNED) | ACCOUNTADMIN/grant | `[]` |
| `ACCOUNT_USAGE.ACCESS_HISTORY` | `audit/access-history` (DIRECT/BASE_OBJECTS_ACCESSED, OBJECTS_MODIFIED, **POLICIES_REFERENCED**) | ACCOUNTADMIN/grant | `[]` |
| `ACCOUNT_USAGE.LOGIN_HISTORY` | `audit/login-history`, `/logins*` (USER_NAME, CLIENT_IP, FIRST/SECOND_AUTHENTICATION_FACTOR, IS_SUCCESS, ERROR_CODE) | ACCOUNTADMIN/grant | `[]` |
| `ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY` + `SHOW WAREHOUSES` | `/warehouses*` | ACCOUNTADMIN/grant | account-scoped |
| `SHOW RESOURCE MONITORS` / `SHOW MANAGED ACCOUNTS` / `SHOW SHARES` | resource-monitors, reader-accounts, shares | ACCOUNTADMIN / capacité data-provider | `[]` |
| `CP_DATA360.EVENT_STORE.{USER_ACTIVITY, USER_REQUESTS}` | events, platform-activity, org-summary | service account | full |
| `CP_DATA360.DATA360_CACHE.OVERVIEW_KPIS` | overview-kpis (matérialisé, refresh proc) | ORGADMIN/ACCOUNTADMIN | recompute live |

**Écritures (mutations).** SQL réel observé : create = `CREATE ORGANIZATION ACCOUNT` ; drop = `DROP ACCOUNT IF EXISTS … GRACE_PERIOD_IN_DAYS` ; suspend/activate = `ALTER MANAGED ACCOUNT … SET ENABLED` ; reset = `ALTER USER <acct>_ADMIN SET MUST_CHANGE_PASSWORD=TRUE` ; rotate = `ALTER USER … UNSET RSA_PUBLIC_KEY[/_2]` ; resource-monitor = `CREATE OR REPLACE RESOURCE MONITOR` ; warehouse = `ALTER WAREHOUSE … SET`. `quote_identifier` (anti-SQLi).
**Audit.** Chaque mutation → `log_event(cursor, None, "ORG_ACCOUNTS", action, username, status, details)` (`SUCCESS`/`ERROR`, `actor_role` enregistré) `[trace: lifecycle_router.py:97-101 · crud_router.py:162]`.

## 5. Deep dive — FinOps + Audit par rôle (focus module) + fiches ins/outs

### 5.1 Cost / FinOps — le parcours « combien, où, et comment réduire »

1. **Combien ?** `GET /credits?days` (total) + `GET /credits/trend?days` (courbe) + `GET /metering?days` (par compte).
2. **Où part le crédit ?** `GET /command-center/cost-breakdown` (par warehouse/user) + `GET /services/{clustering,materialized-views,pipes,query-acceleration,search-optimization}?days` (serverless) + `GET /cortex-costs?days` (Cortex AI) + `GET /data-transfer?days` + `GET /replication?days`.
3. **Top consommateurs / par compte :** `GET /credits/top?days&limit` + `GET /credits/history/{account_name}?days`.
4. **Cost-simulation :** `GET /credit-forecast?days_back` (régression sur `METERING_DAILY_HISTORY` → `projected_30d_total`, `budget_at_risk`) ; convertir crédit→$ via `GET /rate-sheet` ; budget restant via `GET /organization/remaining-balance` ; termes via `GET /contract`.
5. **Anomalies :** `GET /anomalies?days` (pics coût/usage).
6. **Remédiation cliquable (orgadmin) :** `POST /resource-monitors` (poser un quota crédit) · `POST /warehouses/{wh}/resize` · `PATCH /warehouses/{wh}/auto-suspend` · `POST /warehouses/{wh}/suspend`.

### 5.2 Audit PAR RÔLE — login / query / access

- **login-history** (`ACCOUNT_USAGE.LOGIN_HISTORY`) : qui s'est connecté, MFA (`SECOND_AUTHENTICATION_FACTOR`), succès/échec, IP. Filtres `username`, `is_success`('YES'|'NO'). `summary` = `GROUP BY IS_SUCCESS` (count, unique users, unique IPs). Spike d'échecs → `GET /logins/failed`.
- **query-history** (`ACCOUNT_USAGE.QUERY_HISTORY`) : chaque ligne porte **`ROLE_NAME`** → c'est l'audit « par rôle » natif (qui, sous quel rôle, a lancé quelle requête). Filtres `username`, `query_type`, `min_duration_ms`. `summary_by_type` = `GROUP BY QUERY_TYPE`.
- **access-history** (`ACCOUNT_USAGE.ACCESS_HISTORY`) : qui a lu/écrit quels objets + **`POLICIES_REFERENCED`** (lien direct avec les data-policies/masking de la gouvernance trifecta).
- **events plateforme** : `GET /events` / `/platform-activity` exposent les `log_event("ORG_ACCOUNTS", …)` émis par les mutations → boucle « action gouvernée → trace auditée ».

### 5.bis — Fiche de test « ins / outs » des endpoints clés du focus

> Tous **`401` live** (déployés, sweep 2026-06-08 + re-test 2026-06-09). Test fonctionnel authentifié à faire (compte expiré).

| Cas | Endpoint | INS (path · query · body) | OUTS (réponse consommée) |
|-----|----------|---------------------------|--------------------------|
| audit login | `GET /org-accounts/audit/login-history` | query `days`(1–90,def7), `username`, `is_success`('YES'\|'NO'), `limit`(1–1000,def200) | `{period_days, logins[]{EVENT_TIMESTAMP,USER_NAME,CLIENT_IP,REPORTED_CLIENT_TYPE,FIRST/SECOND_AUTHENTICATION_FACTOR,IS_SUCCESS,ERROR_CODE,RELATED_EVENT_ID}, summary[]{IS_SUCCESS,LOGIN_COUNT,UNIQUE_USERS,UNIQUE_IPS}, total_returned}` |
| audit query | `GET /org-accounts/audit/query-history` | query `days`, `username`, `query_type`, `min_duration_ms`(def0), `limit` | `{period_days, queries[]{QUERY_ID,QUERY_TYPE,USER_NAME,ROLE_NAME,WAREHOUSE_NAME,EXECUTION_STATUS,ERROR_CODE,TOTAL_ELAPSED_TIME,BYTES_SCANNED,ROWS_PRODUCED,PARTITIONS_SCANNED/TOTAL}, summary_by_type[]{QUERY_TYPE,QUERY_COUNT,AVG_DURATION_MS,TOTAL_BYTES_SCANNED,UNIQUE_USERS}}` |
| audit access | `GET /org-accounts/audit/access-history` | query `days`, `username`, `object_name`, `limit` | `{period_days, access_records[]{QUERY_ID,QUERY_START_TIME,USER_NAME,DIRECT_OBJECTS_ACCESSED,BASE_OBJECTS_ACCESSED,OBJECTS_MODIFIED,OBJECT_MODIFIED_BY_DDL,POLICIES_REFERENCED}}` |
| security audit | `GET /command-center/security-audit` | query `days`, `user` | route consommée `services/command-center/index.ts:386` ; **forme OUTS non vérifiée** (handler non lu — `posture/login_anomalies/grants/policies` = inférence) |
| cost breakdown | `GET /command-center/cost-breakdown` | query `days`, `warehouse`, `user` | **forme OUTS non vérifiée** (handler non lu — `by_warehouse/by_user/by_service/total_credits` = inférence) |
| credits agrégat | `GET /org-accounts/credits` | query `days` | `{credits, window_days}` — **non vérifié** (handler non lu) |
| credit forecast | `GET /org-accounts/credit-forecast` | query `days_back`(def90) | `{daily_avg, trend_direction, projected_30d_total, budget_at_risk, history[]{date,credits}, forecast[]{date,credits}}` — **non vérifié** (forme reprise du corps historique « intended » ; handler `router.py:1784` non lu) |
| cortex cost | `GET /org-accounts/cortex-costs` | query `days` | `{credits, by_function[], by_model[]}` — **non vérifié** (handler `router.py:1745` non lu) |
| resource monitor (create) | `POST /org-accounts/resource-monitors` | body `ResourceMonitorRequest{name*, credit_quota* (>0), frequency? (MONTHLY\|DAILY\|WEEKLY\|YEARLY\|NEVER), warehouses?[], suspend_at_pct? (1–100)}` `[trace: crud_router.py:121]` | `{success, monitor, message?}` — orgadmin |
| warehouse resize | `POST /org-accounts/warehouses/{wh}/resize` | path `{warehouse_name}` · body `ResizeWarehouseRequest{size*}` (taille allowlistée) `[trace: crud_router.py:111]` | `{success, warehouse_name, message?}` — orgadmin |
| warehouse auto-suspend | `PATCH /org-accounts/warehouses/{wh}/auto-suspend` | path `{warehouse_name}` · body `AutoSuspendRequest{seconds* (60–3600)}` `[trace: crud_router.py:116]` | `{success, warehouse_name, message?}` — orgadmin |
| create account | `POST /org-accounts/accounts` | body `CreateAccountRequest{account_name*(1–255), cloud*, region*, edition*, admin_name*, admin_email*, admin_username*, admin_password?, generate_password?(def false), comment?}` `[trace: crud_router.py:91]` | `{success, account_name, account_url?, account_locator?}` — orgadmin |
| update account | `PATCH /org-accounts/accounts/{name}` | path `{account_name}` · body `UpdateAccountRequest{new_name?, comment?}` `[trace: crud_router.py:105]` | `{success, account_name, message?}` — orgadmin |
| suspend / activate | `POST /org-accounts/accounts/{name}/{suspend\|activate}` | path `{account_name}` (pas de body) | `{success, account_name, message}` — orgadmin ; SQL `ALTER MANAGED ACCOUNT … SET ENABLED` `[trace: lifecycle_router.py:108,143]` |
| mfa enforce | `PATCH /org-accounts/accounts/{name}/mfa` | path `{account_name}` · body `MfaEnforcementRequest{enforce*:bool}` `[trace: lifecycle_router.py:51]` | `{success, account_name, message?}` — orgadmin |
| transfer ownership | `POST /org-accounts/accounts/{name}/transfer-ownership` | path `{account_name}` · body `TransferOwnershipRequest{new_owner*(1–255)}` `[trace: lifecycle_router.py:56]` | `{success, account_name, message?}` — orgadmin |
| drop account | `DELETE /org-accounts/accounts/{name}` | path `{account_name}` · query `confirm_token`(=name), `grace_period_days`(3–90,def7), `reason` | `{account, action:"dropped", grace_period_days, reversible_until_grace_expires, actor_role}` — orgadmin |

> Renvoi : la matrice **gouvernance/DQ/coût/planif/historique** + l'**optimisation cache par rôle** + le **contrat CTA** sont détaillés dans le vault `pages/org-accounts.md` §Enrichissement (2026-06-09) §B/§C/§D.

## 6. UX front — validation 4 axes + accessibilité

| Axe | Verdict | Preuve (fichier:ligne) |
|-----|---------|------------------------|
| **loading** | ✓ | `account-overview/loading.tsx:5` skeleton route-level `role="status" aria-label="Loading"` ; freshness chip « Refreshing… / Updated Xm ago » + safety-escape 10 s (page.tsx) |
| **empty** | ✓/⚠ | `OrgAccountsTab` : panneau info unique « not a Snowflake Organization account » + Retry quand non-ORGADMIN. ⚠ Risque : `accounts` `[]` / forecast zéro indistinguables de « vide réel » sur certains onglets (cf. vault Gap #9) |
| **error** | ✓ | `AccountOverviewErrorBoundary` (classe) `account-overview/page.tsx:19,80` ; wizard surface une carte d'erreur explicite ; toasts inline sur `AccountLifecycleMenu` |
| **dark mode** | ✓ | dense : `credits-tab.tsx` 111× `dark:`, `AccountLifecycleMenu.tsx` 37×, `accounts-table.tsx` 28×, `account-overview/page.tsx` 19× |

**Accessibilité :** `role="status"`/`aria-label="Loading"` sur le skeleton (`loading.tsx:5`). ⚠ Le wizard et le kebab lifecycle reposent sur des popovers/drawers — navigation clavier complète **non vérifiée**.

## 7. Drift détecté (vs vault corps historique + vs code)

1. **DÉRIVE MAJEURE — routes « 404 / non implémentées » en réalité DÉPLOYÉES.** Le corps historique de `pages/org-accounts.md` (~2026-06-07) marque 🔴 : tout le router Command Center, `POST /accounts` (create), `PATCH /accounts/{name}`, suspend/activate/reset/rotate/mfa/transfer, `resource-monitors`, `credit-forecast`, reader-account create/drop, détail compte, détail share. **Re-test live 2026-06-08 + 2026-06-09 : toutes `401`** (déployées). Cause = dérive temporelle (routers `crud/finops/lifecycle` + `command_center/router.py` câblés après la rédaction). Statut corrigé en bas du vault (§A) sans réécriture du corps. **À faire :** confirmer au runtime authentifié l'absence de `404` applicatif / `501` (DDL non supporté par l'édition).
2. **Paths cibles inexistants côté slices :** `POST /org-accounts/reader-accounts` (create reader) → re-test live 2026-06-09 = **`405`** (POST non enregistré ; seuls `GET` list + `DELETE /{name}` existent) → reste 🔴 ; `GET /billing/estimate`, `/billing/pricing`, `GET /account/{id}/usage` (module billing absent) ; `GET/PUT /governance/users/{username}` (appartient au module Governance, pas org-accounts). Le `MeteringPanel` retombe sur `pricing-reference.json` (reference). À traiter dans les skills `governance` / un futur `billing`.
3. **Contrat DROP à revérifier :** le corps historique affirme « le drop 400 toujours » (FE envoie `reason` en body, jamais `confirm_token`/`grace_period_days` en query). Non re-scanné ici → **non vérifié** à ce jour ; le path lui-même répond `401` (déployé).
4. **`/logins/{account_name}` :** bug historique « ne filtre jamais par `account_name` ». Non re-confirmé dans le code lu → **non vérifié**.
5. **Health score :** historiquement cost-only (`100 − min(100, credits/10)`), 4 piliers non implémentés. Non re-vérifié → reporté tel quel.

## 8. Propositions d'amélioration UX (PROPOSITIONS — pas d'édition de code)

1. **Bandeau de scope explicite** sur tous les onglets ORGANIZATION_USAGE : afficher « ORGADMIN requis — données account-scoped uniquement » quand `is_org_admin=false`/`scope=='account'` (généraliser le pattern `OrgAccountsTab` à credits/health/forecast). Bénéfice : zéros « no access » ≠ zéros « vides ».
2. **CTA FinOps gouverné** : sur `credit-forecast.budget_at_risk` → bouton « Poser un resource monitor » (`POST /resource-monitors`), désactivé hors ORGADMIN (`is_org_admin`). Idem warehouse-performance → « Resize / auto-suspend ». (cf. vault §D.)
3. **CTA sécurité** : sur un pic `logins/failed` → bouton « Forcer MFA » (`PATCH …/mfa`). Bénéfice : boucle audit→action gouvernée.
4. **Audit par rôle visible** : exposer la colonne `ROLE_NAME` (query-history) et `POLICIES_REFERENCED` (access-history) dans les tables d'audit du Command Center — lien direct avec la gouvernance trifecta.
5. **Normaliser les fenêtres `days`** côté FE (presets 7/30/90) pour réduire le cache-thrashing serveur (cf. vault §C).
6. **Confirm-dialog drop** : pré-remplir `confirm_token` depuis le nom saisi et envoyer `grace_period_days`/`reason` en **query** (aligne le contrat backend ; lève le 400 historique présumé). [à confirmer après re-scan].

## 9. Plan de test fonctionnel

> Toutes les routes renvoient `401` sans token. Obtenir d'abord un JWT (login Data360), puis `-H "Authorization: Bearer $TOKEN"`. Rôle requis : module `account_overview` actif ; **mutations = ORGADMIN** (sinon 403 `_require_orgadmin`).

```bash
BASE=https://<host>        # ou re-test structurel : http://<IP_DIRECTE> -H "Host: api.datalab360.io"
H="-H Authorization:Bearer $TOKEN -H Content-Type:application/json"

# 1. Command Center (lecture — ORGADMIN/ACCOUNTADMIN)
curl -s $H "$BASE/command-center/overview-kpis?range=30d"
curl -s $H "$BASE/command-center/cost-breakdown?days=30"
curl -s $H "$BASE/command-center/security-audit?days=30"

# 2. Audit PAR RÔLE (login / query / access)
curl -s $H "$BASE/org-accounts/audit/login-history?days=7&is_success=NO&limit=200"
curl -s $H "$BASE/org-accounts/audit/query-history?days=7&query_type=SELECT&min_duration_ms=5000"
curl -s $H "$BASE/org-accounts/audit/access-history?days=7"
curl -s $H "$BASE/org-accounts/logins/failed?days=1&limit=50"

# 3. FinOps : combien / où / simulation
curl -s $H "$BASE/org-accounts/credits/trend?days=30"
curl -s $H "$BASE/org-accounts/cortex-costs?days=30"
curl -s $H "$BASE/org-accounts/credit-forecast?days_back=90"
curl -s $H "$BASE/org-accounts/rate-sheet"
curl -s $H "$BASE/org-accounts/organization/remaining-balance"
curl -s $H "$BASE/org-accounts/services/pipes?days=30"

# 4. FinOps remediation (ORGADMIN — sinon 403)
curl -s $H -X POST "$BASE/org-accounts/resource-monitors" -d '{"name":"MON_PROD","credit_quota":1000,"frequency":"MONTHLY","suspend_at_pct":80}'
curl -s $H -X POST "$BASE/org-accounts/warehouses/COMPUTE_WH/resize" -d '{"size":"SMALL"}'
curl -s $H -X PATCH "$BASE/org-accounts/warehouses/COMPUTE_WH/auto-suspend" -d '{"seconds":60}'

# 5. Lifecycle compte (ORGADMIN — sinon 403)
curl -s $H -X POST "$BASE/org-accounts/accounts/MY_ACCT/suspend"
curl -s $H -X PATCH "$BASE/org-accounts/accounts/MY_ACCT/mfa" -d '{"enforce":true}'
curl -s $H -X DELETE "$BASE/org-accounts/accounts/MY_ACCT?confirm_token=MY_ACCT&grace_period_days=7&reason=test"
```

**Résultats attendus :**
- Sans token → **401 AUTH_REQUIRED** sur les 100 ops (contrat RBAC vérifié — déjà confirmé par sweep + re-test 2026-06-09).
- Lecture en non-ORGADMIN → **pas de 403**, mais payload dégradé (`is_org_admin:false`, `scope:"account"`, ou `[]`).
- Mutation (create/suspend/resize/resource-monitor/drop) en non-ORGADMIN → **403** `_require_orgadmin` (« requires role ORGADMIN »).
- Mutation réussie → écriture SQL + `log_event("ORG_ACCOUNTS", action, …)` visible ensuite dans `GET /org-accounts/events`.
- DROP sans `confirm_token` correct → **400** (anti-fat-finger) — à reconfirmer (drift §7.3).

> Vérifié 2026-06-09 : 100 endpoints vérifiés (5 slices + openapi.json) ; 4 corrections dans ce fichier (index.ts:107→117, index.ts:189→235, cortex-costs hooks.ts:780→778, IP directe redactée dans le script de test) ; 0 endpoint inventé ; POST /reader-accounts=405 non déployé confirmé ; live-retest 5 endpoints (overview-kpis=401, credit-forecast=401, resource-monitors=401, audit/login-history=401, POST reader-accounts=405) OK. Verdict : GROUNDED.
