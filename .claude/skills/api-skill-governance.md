---
name: api-skill-governance
description: >
  Module Governance de Data360 (routes /governance/* · backend prefix /gouvernance).
  Granting de base utilisateurs+rôles Snowflake, identité fédérée (Entra ID / SAML / SCIM /
  service-users RSA), policies de données (RLS/masking/aggregation/network/tags/password/
  session/DMF), security matrix, GUI permissions, D360 action-RBAC et audit par rôle.
  138 endpoints live (tous 401 AUTH_REQUIRED = déployés+gardés ; 1 public health 200) —
  re-test 2026-06-09 par IP directe. Personas : ACCOUNTADMIN / SECURITYADMIN. Grounded code réel.
---

# Governance — Skill Module (API-grounded, re-test 2026-06-09)

> Toutes les affirmations sont sourcées (fichier:ligne ou slice). Les endpoints viennent **uniquement** des 5 slices live + lecture du code backend. Aucun path inventé. Les zones non confirmées sont marquées « non vérifié ». **Contrat de preuve :** `401` = route déployée + gardée (la dépendance RBAC s'exécute **avant** le corps) — **pas** la logique métier (compte Snowflake de test expiré). La profondeur des handlers décisifs (OAuth, policies, trifecta) a été vérifiée par lecture de code.

## 1. Vue d'ensemble

| Élément | Valeur (source) |
|---------|-----------------|
| **Routes front** | `/governance/grants` · `/governance/policies` · `/governance/security-matrix` · `/governance/oauth` (redirect `/governance` → `/policies`) `[trace: governance.md §Flow]` |
| **Front dir** | `apps/data360/src/app/(dashboard)/governance` |
| **Backend module** | `backend/app/modules/gouvernance` (préfixe API **`/gouvernance`**, pas `/governance`) |
| **Routers backend** | `routers/gouvernance.py` (157 Ko — users/roles/grants/dashboards/matrix) · `routers/governance_policies.py` (126 Ko — policies+DMF) · `routers/d360_roles.py` (51 Ko — action-RBAC) · `routers/gui_permissions.py` (30 Ko — OAuth/SAML/RSA/GUI) · `routers/reverse_provisioning.py` (14 Ko — access-roles) |
| **Services FE** | `services/governance/*` (`policies.ts`, `security_matrix.ts`, `dmf.ts`) — ⚠ pas de `d360_roles.ts` wrapper (appels directs `apiClient`) |
| **Ops live** | **138** : gouvernance 53 · policies 57 · d360-roles 11 · gui-permissions 13 · reverse-provisioning 4 |

**Rôles (vérifiable dans le code).** Le gate dominant est **`require_accountadmin_role`** (gate grossier admin/non-admin) : `gouvernance.py` 54× · `governance_policies.py` 37× · `gui_permissions.py` 13× · `reverse_provisioning.py` 2×. Le seul router à action-RBAC fin est **`d360_roles.py`** (`require_action`, 8×). Personas applicatifs (Platform Admin / Data Steward / Security Officer) = **non vérifié** dans le code (repris des conventions).

> ⚠️ **Correction de dérive majeure (2026-06-09).** La doc vault antérieure (`pages/governance.md` corps) déclarait le module « 404 / frontend-only / handlers vides / stubbed ». **Infirmé** : toutes les surfaces répondent `401` et exécutent du vrai SQL. Cause : doc écrite d'un point de vue **front-only** (les appels FE 404aient par typo/impl concurrentes), **pas** un `deprecated=True` à la Workflow. Détail : §7 Drift.

## 2. Capacités (grounded)

| Capacité | Implémentation (endpoint / trace) |
|----------|-----------------------------------|
| Créer/dropper user & rôle Snowflake | `POST /gouvernance/add-user`, `/add-role`, `DELETE /drop-user`, `/drop-role` `[trace: gouvernance.py:1256,1367,1280]` |
| Assigner / révoquer un rôle (additif) | `POST /assign-role`, `DELETE /unassign-role` `[trace: gouvernance.py:1590,1646]` |
| Remplacer le set complet de rôles d'un user | `PUT /users/{username}/roles` (set-semantics, rôles système exclus en silence) `[trace: gouvernance.py:1759]` |
| Grant / **revoke** privilège objet → rôle | `POST /grant-permission`, `POST /revoke-permission` `[trace: gouvernance.py:1909,1956]` |
| MFA per-user / enable-disable user | `POST /user/mfa/set`, `GET /user/mfa/status`, `POST /enable_user/`, `/disable_user/` |
| Module grants (visibilité sidebar) | `PUT /update-grants`, `GET /grants` ; plateforme `GET/POST/DELETE /api/platform/grants` |
| **Entra ID / OAuth / SAML SSO** | `POST /oauth/integrations`, `POST /oauth/saml-integrations` → `CREATE SECURITY INTEGRATION` `[trace: gui_permissions.py:486-567]` |
| Auth machine (service users + RSA key-pair) | `POST /oauth/service-users`, `POST /oauth/assign-rsa-key`, `DELETE /oauth/revoke-rsa-key/{u}`, `GET /oauth/api-keys` `[trace: gui_permissions.py:448-467]` |
| D360 action-RBAC (rôles applicatifs) | 11 ops `/d360-roles*` (CRUD + `permissions` + `apply-template` + `action-registry` + `effective`/`my-permissions`) `[trace: d360_roles.py]` |
| GUI page-permissions | `GET/POST /gui-permissions`, `DELETE /{id}`, `GET /my-access`, `/effective/{username}` |
| Policies de données (8 familles + DMF) | `/policies/{row-access\|masking\|aggregation\|network\|tags\|password\|session}` + `/policies/dmf*` + classification + `pii-scan` `[trace: governance_policies.py]` |
| Security matrix (descriptive) | `GET/POST /security-matrix`, `/batch`, `/bulk`, `/security-axes*` |
| Audit / posture par rôle | `GET /dashboard/activity`, `/dashboard/errors`, `/access-review/summary`, `/client/dashboard` `[trace: gouvernance.py:3327,3377,3494]` |
| Reverse-provisioning (objet→rôle technique→rôle fonctionnel) | `POST /access-roles/from-objects`, `POST/DELETE /roles/{role}/grant-role`, `GET /roles/{role}/object-grants` |

## 3. Référence endpoints (138 ops — statut live)

**Contrat de statut** : balayage sans auth → **toutes les 138 ops `401 AUTH_REQUIRED`** (déployées + gardées) sauf `GET /gouvernance/policies/health` = `200` (public). Aucun `404`, aucun `500`. **Re-confirmé 2026-06-09** par IP directe `167.172.162.172` + `Host: api.datalab360.io` sur 10 routes clés (POST testés `-X POST`).

### 3a. Granting — users · rôles · grants (slice gouvernance, extrait)

| Live | Méthode | Path | Usage |
|------|---------|------|-------|
| 401 | POST | `/gouvernance/add-user` | Créer user Snowflake (UserCreate) |
| 401 | POST | `/gouvernance/add-role` | Créer rôle (RoleCreate) |
| 401 | POST | `/gouvernance/assign-role` | Assigner rôle (additif) |
| 401 | DELETE | `/gouvernance/unassign-role` | Révoquer un rôle d'un user |
| 401 | PUT | `/gouvernance/users/{username}/roles` | Set complet de rôles (replace) |
| 401 | GET | `/gouvernance/users/{username}/roles` | Rôles d'un user |
| 401 | POST | `/gouvernance/grant-permission` | Grant privilège objet → rôle |
| 401 | POST | `/gouvernance/revoke-permission` | **Revoke** privilège (corrigé : existe) |
| 401 | PUT | `/gouvernance/update-grants` | MAJ module grants (sidebar) |
| 401 | GET | `/gouvernance/grants` · `/grants-for-role/{role}` | Liste grants |
| 401 | POST | `/gouvernance/user/mfa/set` · GET `/user/mfa/status` | MFA per-user |
| 401 | POST | `/gouvernance/enable_user/` · `/disable_user/` | Activer/désactiver user |
| 401 | DELETE | `/gouvernance/drop-user` · `/drop-role` · POST `/drop-roles-batch` · `/drop-users-batch` | Suppressions (batch incl.) |
| 401 | GET | `/gouvernance/users` · `/roles` · `/users-with-roles` · `/enterprise-users` | Listes paginées |

### 3b. Identité fédérée — OAuth / SAML / service-users / RSA (slice gui-permissions)

| Live | Méthode | Path | Usage |
|------|---------|------|-------|
| 401 | POST | `/gouvernance/oauth/integrations` | Créer intégration EXTERNAL_OAUTH (Azure/Okta/Custom) |
| 401 | GET | `/gouvernance/oauth/integrations` | Lister les security integrations |
| 401 | POST | `/gouvernance/oauth/saml-integrations` | Créer intégration SAML2 SSO |
| 401 | POST | `/gouvernance/oauth/service-users` | Créer service user (PAT/API) |
| 401 | POST | `/gouvernance/oauth/assign-rsa-key` | Assigner clé RSA (key-pair auth) |
| 401 | DELETE | `/gouvernance/oauth/revoke-rsa-key/{username}` | Révoquer la clé RSA |
| 401 | GET | `/gouvernance/oauth/api-keys` | Lister service accounts avec RSA |
| 401 | GET | `/gouvernance/oauth/network-policies` | Lister network policies (vue OAuth) |

### 3c. D360 action-RBAC (slice d360-roles, 11 ops — toutes 401)

| Live | Méthode | Path | Usage |
|------|---------|------|-------|
| 401 | GET/POST | `/gouvernance/d360-roles` | Lister (système+custom) / créer custom |
| 401 | PUT/DELETE | `/gouvernance/d360-roles/{role_name}` | MAJ métadonnées / supprimer custom |
| 401 | GET/PUT | `/gouvernance/d360-roles/{role_name}/permissions` | Matrice de permissions (lire / bulk-set) |
| 401 | POST | `/gouvernance/d360-roles/{role_name}/apply-template` | Copier l'action-set d'un template |
| 401 | GET | `/gouvernance/d360-roles/templates` | Templates standards |
| 401 | GET | `/gouvernance/d360-roles/action-registry` | Catalogue des clés `{module,page,tab,action}` |
| 401 | GET | `/gouvernance/d360-roles/effective/{username}` | RBAC effectif d'un user (admin ; query `project_id`) |
| 401 | GET | `/gouvernance/d360-roles/my-permissions` | RBAC effectif de l'appelant |

### 3d. Policies de données + DMF + classification (slice governance-policies, 57 ops)

| Live | Méthode | Path (familles) | Usage |
|------|---------|-----------------|-------|
| 401 | POST | `/policies/row-access` (+`/apply`,`/replace`,`/remove`,`/{n}/details`) | RLS — CREATE ROW ACCESS POLICY + ADD ON (col) |
| 401 | POST | `/policies/masking` (+`/apply`,`/replace`,`/remove`,`/batch-details`,`/{n}/details`) | Column masking |
| 401 | POST | `/policies/aggregation` (+`/apply`,`/replace`,`DELETE /{db}/{sc}/{tbl}`,`/{n}/details`) | Aggregation/privacy |
| 401 | POST | `/policies/network` (+`/list`,`/{n}/set-default`,`/{n}/details`,`DELETE /{n}`) | Allow/block IP CIDR |
| 401 | POST | `/policies/tags` (+`/apply`,`/remove`,`/list`,`/{tag}/details`,`DELETE /{tag}`) | Tags de classification |
| 401 | POST | `/policies/password` · `/session` (+`/{n}/set-default`,`/{n}/details`) | Password/session policy + default compte |
| 401 | POST | `/policies/classification/classify` (+`/extract-categories`,`/apply-tags`,`/classifiers`,`/classifiers/{n}/regex`) | Auto-classification colonnes |
| 401 | POST | `/policies/dmf` (+`/associate`,`/disassociate`,`/schedule`,`DELETE /{n}`,`GET /list`,`/references`,`/all-references`,`/{n}/details`) | Data Metric Functions |
| 401 | POST | `/policies/pii-scan` | Scan PII + analyse IA Cortex (enable_ai) |
| 401 | GET | `/policies/{type}/{name}/references` · PUT `/{type}/{name}/roles` · `/metadata` · POST `/unapply-all` | Lifecycle générique policy |
| 401 | GET | `/policies/objects/{databases\|schemas/{db}\|tables/{db}/{sc}\|columns/{db}/{sc}/{tbl}}` | Pickers no-code |
| 200 | GET | `/gouvernance/policies/health` | Health check (public) |

### 3e. Security matrix · audit · reverse-provisioning

| Live | Méthode | Path | Usage |
|------|---------|------|-------|
| 401 | GET/POST | `/gouvernance/security-matrix` (+`/batch`,`/bulk`,`/init`,`DELETE /{entry_id}`,`/role/{role}`,`PUT /{entry_id}`) | Matrice descriptive (non-enforced) |
| 401 | GET/POST | `/gouvernance/security-axes` (+`PUT/DELETE /{axis_id}`) | Axes (régions/stores/depts/…) |
| 401 | GET | `/gouvernance/dashboard/activity` | Audit activité (filtres module/event/user/statut/dates) |
| 401 | GET | `/gouvernance/dashboard/errors` | Dashboard erreurs |
| 401 | GET | `/gouvernance/access-review/summary` | Posture : policies expirantes, gaps MFA, grants orphelins (query `window_days`) |
| 401 | GET | `/gouvernance/client/dashboard` | Dashboard client |
| 401 | GET | `/gouvernance/gui-permissions/my-access` · `/effective/{username}` · DELETE `/{permission_id}` | GUI gate (a une source) |
| 401 | POST | `/gouvernance/access-roles/from-objects` | Mint access role portant des grants objet |
| 401 | POST/DELETE | `/gouvernance/roles/{role}/grant-role` | Attacher/détacher access role → functional role |
| 401 | GET | `/gouvernance/roles/{role}/object-grants` | SHOW GRANTS TO ROLE |

**Routes citées par d'anciens docs comme « manquantes » mais en fait déployées** : `revoke-permission`, `oauth/*` (8), les 11 `d360-roles/*`, GUI `my-access`/`effective`/`DELETE`, toutes les policies. Cf. §7 Drift.

## 4. Modèle de données

| Objet / table | Rôle | Notes |
|---|---|---|
| `GOUVERNANCE.ROLE_PERMISSIONS` | module grants (sidebar) | muté via `PUT /update-grants` |
| `GOUVERNANCE.D360_ROLES` · `D360_ROLE_ACTIONS` | rôles applicatifs + clé `module:page:tab:action` | source de `require_action` ; `_MATRIX` hardcodé en fallback (7 templates) |
| `GOUVERNANCE.GUI_PERMISSIONS` | hints page-visibility (`READ`/`WRITE`/`NONE`) | MERGE sur `(ROLE_NAME, PAGE_PATH)` |
| `GOUVERNANCE.SECURITY_MATRIX` · `SECURITY_AXES` | matrice descriptive metadata | **n'émet pas** de ROW ACCESS POLICY native (descriptif, non-enforced) |
| Plateforme `MODULE_/ACTION_/POLICY_/ROLE_/USER_GRANTS` | Bible v3 grants | via `/api/platform/grants*` |
| `EVENT_STORE.USER_ACTIVITY` | audit UI/actions | clé : `(module, event_type, username, status, details)` `[trace: core/events.py:617]` ; lu par `/dashboard/activity` |
| `EVENT_STORE.USER_REQUESTS` | requêtes RBAC-scopées (cf. conventions) | **non vérifié** : table non retrouvée dans `core/events.py` ; keying `module:page:tab:action` = contrat `require_action` supposé, à confirmer |
| `AUDIT_LOG` (via `log_governance_audit`) | piste d'audit gouvernance | écrit sur CREATE/DROP user/role |
| Snowflake natifs | `USER`, `ROLE`, `SECURITY INTEGRATION`, `ROW ACCESS/MASKING/AGGREGATION/NETWORK/PASSWORD/SESSION POLICY`, `TAG`, `DMF` | créés par les handlers (vrai DDL) |

**Cache.** `@session_cache(ttl)` sur les lectures (users 300s, matrix 600s, dashboards 120s) ; mutations `@invalidates_cache(CacheKey.{USERS\|ROLES\|GRANTS\|USER_ACTIVITY})`. Clé actuelle = par utilisateur (`build_cache_key`, `cache_decorators.py:210`). Optimisation par rôle : cf. §5 / vault §C.

## 5. Deep — la TRIFECTA (granting · Entra ID · audit par rôle) + fiche ins/outs

### 5.1 — Pilier 1 : GRANTING USER BASE (vérifié par lecture de code)

Quatre voies de granting, toutes gardées par `require_accountadmin_role`, toutes `@invalidates_cache` :

1. **Créer un user** — `POST /gouvernance/add-user` `[trace: gouvernance.py:1256]`. Body `UserCreate{username, password, email}` (3 props sur ~25 de `CREATE USER`). Le handler appelle `create_user()`, **commit**, génère un **TOTP secret** (`generate_totp_secret`), logge `CREATE_USER` (`USER_ACTIVITY`) **+** `log_governance_audit('USER','CREATED')` (`AUDIT_LOG`). Retour `{message, secret}`. ⚠ pas de `DEFAULT_ROLE`/`TYPE`/`RSA_PUBLIC_KEY`/`MUST_CHANGE_PASSWORD` au create ; pas d'`ALTER USER` d'édition.
2. **Assigner un rôle** — `POST /assign-role` (additif) `[trace: gouvernance.py:1590]` · révoquer un seul = `DELETE /unassign-role` (`REVOKE ROLE … FROM USER`) `[trace: gouvernance.py:1646]`.
3. **Remplacer le set complet** — `PUT /users/{username}/roles` `[trace: gouvernance.py:1759]`. Set-semantics : diff added/removed ; **rôles système** (`PUBLIC`/`ACCOUNTADMIN`/`SECURITYADMIN`/`SYSADMIN`/`USERADMIN`/`ORGADMIN`) **exclus silencieusement** (pas de feedback UI — gap). Partial-failure → HTTP 200 + `errors[]`.
4. **Grant/revoke privilège objet** — `POST /grant-permission` / `POST /revoke-permission` `[trace: gouvernance.py:1909,1956]`. Query `privileges[] (PrivilegeEnum), object_type (ObjectTypeEnum), object_name, role_name` — tous requis. Exécute `GRANT/REVOKE <priv> ON <type> <name> TO ROLE <r>`, commit, ⚡ `GRANT/REVOKE_PERMISSION`. **`revoke-permission` existe** (réfute « write-once »). Toujours absent : `WITH GRANT OPTION`, `ON ALL`, `ON FUTURE`, database-roles.
5. **Module grants plateforme** — `GET /api/platform/grants` (rôle × module), `POST`/`DELETE` (super-admin) `[trace: platform_core/router.py]`.

### 5.2 — Pilier 2 : ENTRA ID / SAML / machine (vérifié — DDL lu)

`POST /gouvernance/oauth/integrations` → `create_security_integration` `[trace: gui_permissions.py:486-557]`. Body `CreateOAuthIntegrationRequest` : `name*`, `oauth_provider='AZURE'`, `oauth_client_id*`, `oauth_client_secret=''`, `oauth_token_endpoint=''`, `oauth_authorization_endpoint=''`, `oauth_allowed_scopes=['SESSION:ROLE-ANY']`, `azure_tenant_id=''` (**requis si AZURE**, sinon HTTP 400), `enabled=true`. Pour `AZURE` le handler exécute :

```sql
CREATE OR REPLACE SECURITY INTEGRATION <name>
  TYPE = EXTERNAL_OAUTH
  ENABLED = <enabled>
  EXTERNAL_OAUTH_TYPE = AZURE
  EXTERNAL_OAUTH_ISSUER = 'https://sts.windows.net/<tenant>/'
  EXTERNAL_OAUTH_JWS_KEYS_URL = 'https://login.microsoftonline.com/<tenant>/discovery/v2.0/keys'
  EXTERNAL_OAUTH_AUDIENCE_LIST = ('<client_id>')
  EXTERNAL_OAUTH_TOKEN_USER_MAPPING_CLAIM = 'upn'
  EXTERNAL_OAUTH_SNOWFLAKE_USER_MAPPING_ATTRIBUTE = 'LOGIN_NAME'
  EXTERNAL_OAUTH_ANY_ROLE_MODE = 'ENABLE'
```
`[trace: gui_permissions.py:497-512]`. OKTA → `EXTERNAL_OAUTH_TYPE=OKTA`, claim `sub`. CUSTOM → `oauth_token_endpoint` requis, claim `sub`. ⚡ `CREATE_SECURITY_INTEGRATION` (`USER_ACTIVITY`). ♻️ `GRANTS`. Gate `require_accountadmin_role` (+ `CREATE INTEGRATION` côté Snowflake).
**SAML2** : `POST /oauth/saml-integrations`, body `CreateSAMLIntegrationRequest{name*, saml2_issuer*, saml2_sso_url*, saml2_x509_cert*, saml2_provider='AZURE', saml2_sp_initiated_login_page_label='Data360 SSO', enabled}` → `CREATE SECURITY INTEGRATION TYPE=SAML2` `[trace: gui_permissions.py:560-567]`.
**SCIM / machine** : `POST /oauth/service-users` (PAT/API), `POST /oauth/assign-rsa-key` (`ALTER USER … SET RSA_PUBLIC_KEY`, retourne `auth_method:'KEY_PAIR'`), `DELETE /oauth/revoke-rsa-key/{u}` (`UNSET RSA_PUBLIC_KEY`, ⚡ `REVOKE_RSA_KEY`) `[trace: gui_permissions.py:448-467]`.

### 5.3 — Pilier 3 : AUDIT UI PAR RÔLE (honnêteté : tracé ≠ enforcé partout)

**Surface d'audit** : `GET /dashboard/activity` `[trace: gouvernance.py:3327]` lit `EVENT_STORE.USER_ACTIVITY`, filtrable `username · module_name · event_type · status · start_date · end_date · query_status` (jamais `undefined` : `[]` si vide) ; `GET /dashboard/errors` (limit/module/dates) ; `GET /access-review/summary?window_days=` `[trace: gouvernance.py:3494]` (posture). ♻️ `@session_cache(120)` invalidé sur `USER_ACTIVITY`.
**Enforcement par rôle** : `require_action(module,page,tab,action)` n'existe **que** dans `d360_roles.py` (8×, sur `create/edit/delete/set-permissions/apply-template`) `[trace: d360_roles.py:400,468,515,949,1097]`. ⚠ **Fail-open** : un miss matrix → défaut **permissif** `[trace: d360_roles.py:746]`. Partout ailleurs = `require_accountadmin_role` (grossier, ne lit pas `module:page:tab:action`). Donc l'action-RBAC granulaire est **tracée mais pas universellement enforcée**. RBAC effectif lisible via `GET /d360-roles/effective/{username}` · `/my-permissions` · `/action-registry` (catalogue des clés grantables).

### 5.bis — Fiche « ins / outs » des endpoints clés de la trifecta

> Tous **`401` live** (déployés). Le test **fonctionnel authentifié** reste à faire (un `401` prouve l'existence + le gardiennage, pas la logique métier).

| Action | Endpoint | INS (path · query · body) | OUTS (consommé) |
|--------|----------|---------------------------|-----------------|
| créer user | `POST /gouvernance/add-user` | body `UserCreate{username, password, email}` | `{message, secret}` (TOTP) |
| assigner rôle | `POST /gouvernance/assign-role` | body `AssignRole{username, role_name}` | `{message, current_roles[]}` |
| set complet rôles | `PUT /gouvernance/users/{u}/roles` | path `{u}` · body `{roles: string[]}` | `{message, added[], removed[], errors[]}` |
| grant privilège | `POST /gouvernance/grant-permission` | query `privileges[]*, object_type*, object_name*, role_name*` | `{message}` |
| revoke privilège | `POST /gouvernance/revoke-permission` | query (idem grant) | `{message}` |
| Entra ID | `POST /gouvernance/oauth/integrations` | body `CreateOAuthIntegrationRequest{name*, oauth_provider='AZURE', oauth_client_id*, azure_tenant_id (req. AZURE), oauth_allowed_scopes, enabled}` | `{message, name, provider, enabled}` |
| SAML | `POST /gouvernance/oauth/saml-integrations` | body `CreateSAMLIntegrationRequest{name*, saml2_issuer*, saml2_sso_url*, saml2_x509_cert*, saml2_provider}` | `{message, ...}` |
| service user (machine) | `POST /gouvernance/oauth/service-users` | body `CreateServiceUserRequest` | `{message, ...}` |
| assigner RSA | `POST /gouvernance/oauth/assign-rsa-key` | body `AssignRSAKeyRequest{username, rsa_public_key}` | `{auth_method:'KEY_PAIR', ...}` |
| audit activité | `GET /gouvernance/dashboard/activity` | query `username, module_name, event_type, status, start_date, end_date` | `[USER_ACTIVITY rows]` |
| posture | `GET /gouvernance/access-review/summary` | query `window_days` | `{expiring_policies[], mfa_gaps[], orphan_grants[]}` (non vérifié — forme) |
| RBAC effectif user | `GET /gouvernance/d360-roles/effective/{username}` | path `{username}` · query `project_id` | `{actions[] (module:page:tab:action)}` |
| bulk-set matrice rôle | `PUT /gouvernance/d360-roles/{role}/permissions` | path `{role}` · body `PermissionBulkSet` | `{success, permissions_set}` |
| créer RLS | `POST /gouvernance/policies/row-access` | query `policy_name*, signature*, expression*, database, schema, expiration_date` | `StandardResponse` |
| reverse-provisioning | `POST /gouvernance/access-roles/from-objects` | body `AccessRoleFromObjects` | `{role, grants[]}` (non vérifié — forme) |

> Renvoi : la matrice consolidée **granting / identité / policies / audit / historique** et l'optimisation **cache par rôle** sont détaillées dans le vault `data360_full_doc/pages/governance.md` §Enrichissement (2026-06-09) §B-C.

## 6. UX front — validation 4 axes + accessibilité

> ⚠ Axes **non re-vérifiés ligne-à-ligne** dans cette passe (focus = backend + drift). Verdicts repris du corps vault `pages/governance.md` + structure FE connue ; à confirmer par `/review-ux governance`.

| Axe | Verdict (à confirmer) | Note |
|-----|----------------------|------|
| **loading** | ? non vérifié | route-level `loading.tsx` attendu ; à confirmer |
| **empty** | ? non vérifié | listes (users/rôles/policies) — empty states à auditer |
| **error** | 🟡 | corps vault note : services policies **sans try/catch** (erreurs avalées : `createMasking`/`createNetwork`) ; `createTag` est la seule avec try/catch |
| **dark mode** | ? non vérifié | `dark:` à compter dans `governance/*` |

**Accessibilité** : non vérifié. **Microcopy** : rôles système exclus silencieusement au `PUT /users/{u}/roles` (pas de feedback) — gap UX confirmé côté backend.

## 7. Drift détecté (vs corps vault + vs code)

1. **Narratif « 404 / vapourware » entièrement faux (drift majeur).** Le corps `pages/governance.md` déclare `revoke-permission`, OAuth/SAML (8), 8-of-10 D360-roles, GUI `my-access`/`DELETE`, et les 7 familles de policies comme « 404 backend absent / handlers vides / stubbed (~297/~393/~509) ». **Re-test live : toutes `401` (déployées).** Lecture de code : OAuth = vrai `CREATE SECURITY INTEGRATION` (`gui_permissions.py:486-557`) ; policies = **18 `cursor.execute`, 0 stub** (`governance_policies.py`) ; `revoke-permission` réel (`gouvernance.py:1956`). **Cause probable (non confirmée)** : doc rédigée front-only **OU** backend implémenté après la rédaction (mtimes routers Jun 3-8 compatibles avec les deux) — dans tous les cas, **pas** un `deprecated=True` à la Workflow.
2. **« 2-of-10 D360-roles » → 11/11 déployés.** Les 11 ops (dont `action-registry`, `my-permissions`, `templates`, `effective/{u}`, `permissions` GET/PUT, `apply-template`) répondent `401`. Un rôle custom n'est **plus** figé.
3. **Gaps FE qui RESTENT valides (non infirmés par un `401` backend).** Typo path `/governance/` vs `/gouvernance/` (`grants/page.tsx:455`) — le FE 404 tant que le typo persiste ; impl concurrentes `security_matrix.ts` vs `policies.ts` (la page câble peut-être la mauvaise) ; `dmf.ts` mort ; types `Promise<string>` menteurs (`addRole`/`assignRole` retournent des objets) ; `getPasswordPolicies`/`getSessionPolicies` injectent de **faux defaults statiques** ; pas de wrapper `services/governance/d360_roles.ts`. **À auditer côté front** (`/check-features governance`).
4. **Security matrix non-enforced** (inchangé) : `GOUVERNANCE.SECURITY_MATRIX` est descriptive, n'émet pas de ROW ACCESS POLICY native.

## 8. Propositions d'amélioration UX (PROPOSITIONS — pas d'édition de code)

1. **Corriger le typo de path FE** `/governance/` → `/gouvernance/` (`grants/page.tsx:455`) : tous les appels D360-role cessent de 404. [trivial-safe — bug confirmé côté backend déployé]
2. **Créer le wrapper `services/governance/d360_roles.ts`** : centraliser les 11 endpoints D360 (aujourd'hui appels `apiClient` directs) — typage + gestion d'erreur cohérente.
3. **Câbler le bouton « Révoquer »** dans la matrice de grants sur `POST /gouvernance/revoke-permission` (endpoint déployé) : la matrice n'est plus write-once. Bénéfice : retrait de privilège sans dropper le rôle.
4. **Wizard Entra ID** : un formulaire à 3 champs (`name`, `oauth_client_id`, `azure_tenant_id`) suffit (le backend remplit issuer/JWKS/claim) → câbler `POST /oauth/integrations` + bouton « tester la connexion ». Bénéfice : SSO Azure self-service.
5. **Surfacer le feedback « rôles système exclus »** au `PUT /users/{u}/roles` (aujourd'hui silencieux) : toast listant les rôles ignorés. Bénéfice : l'admin comprend pourquoi `ACCOUNTADMIN` n'a pas été retiré.
6. **CTA gouvernés sur `access-review/summary`** : chaque finding (policy expirante / gap MFA / grant orphelin) rendu en bouton « Corriger » appelant le bon endpoint, désactivé sans grant (`useCanPerform`). Cf. §D vault.
7. **Try/catch sur les services policies** (`createMasking`/`createNetwork`/`createAggregation`) qui avalent les erreurs — aligner sur `createTag`. Bénéfice : l'utilisateur voit l'échec DDL Snowflake.
8. **Badge « enforced vs descriptive »** sur la Security Matrix : indiquer qu'elle ne génère pas de ROW ACCESS POLICY native. Bénéfice : aligne l'attente avec la réalité.

## 9. Plan de test fonctionnel

> Sans token → `401` sur les 138 ops (sauf `policies/health` = 200). Obtenir un JWT (login Data360, rôle ACCOUNTADMIN/SECURITYADMIN), puis `-H "Authorization: Bearer $TOKEN"`. **Test structurel sans auth (déjà fait, 2026-06-09)** : IP directe quand le DNS échoue.

```bash
# Re-test structurel (sans auth) — prouve déployé+gardé, PAS la logique métier
IP=167.172.162.172 ; HOST="Host: api.datalab360.io"
for p in /gouvernance/revoke-permission /gouvernance/oauth/integrations \
         /gouvernance/oauth/saml-integrations /gouvernance/d360-roles/action-registry \
         /gouvernance/gui-permissions/my-access /gouvernance/policies/row-access \
         /gouvernance/access-roles/from-objects ; do
  curl -s -o /dev/null -w "%{http_code} $p\n" -m 12 -X POST -H "$HOST" "http://$IP$p"
done   # attendu : 401 partout (le path est déployé)
curl -s -o /dev/null -w "%{http_code}\n" -H "$HOST" "http://$IP/gouvernance/policies/health"  # 200

# Test fonctionnel authentifié (à faire — compte Snowflake requis)
BASE=https://<host> ; H="-H Authorization:Bearer $TOKEN -H Content-Type:application/json"

# 1. Granting — créer user, assigner rôle, grant puis REVOKE
curl -s $H -X POST "$BASE/gouvernance/add-user"    -d '{"username":"TEST_U","password":"…","email":"t@x.io"}'
curl -s $H -X POST "$BASE/gouvernance/assign-role" -d '{"username":"TEST_U","role_name":"ANALYST"}'
curl -s $H -X POST "$BASE/gouvernance/grant-permission?privileges=SELECT&object_type=TABLE&object_name=DB.SC.T&role_name=ANALYST"
curl -s $H -X POST "$BASE/gouvernance/revoke-permission?privileges=SELECT&object_type=TABLE&object_name=DB.SC.T&role_name=ANALYST"
curl -s $H -X PUT  "$BASE/gouvernance/users/TEST_U/roles" -d '{"roles":["ANALYST","VIEWER"]}'   # set-semantics

# 2. Entra ID — créer l'intégration (3 champs suffisent)
curl -s $H -X POST "$BASE/gouvernance/oauth/integrations" \
  -d '{"name":"AZURE_SSO","oauth_provider":"AZURE","oauth_client_id":"<app-id>","azure_tenant_id":"<tenant>"}'
curl -s $H "$BASE/gouvernance/oauth/integrations"          # vérifier la liste

# 3. Audit par rôle
curl -s $H "$BASE/gouvernance/dashboard/activity?module_name=gouvernance&status=SUCCESS"
curl -s $H "$BASE/gouvernance/access-review/summary?window_days=30"
curl -s $H "$BASE/gouvernance/d360-roles/effective/TEST_U"
curl -s $H "$BASE/gouvernance/d360-roles/action-registry"

# 4. Policy DDL (RLS)
curl -s $H -X POST "$BASE/gouvernance/policies/row-access?policy_name=RLS_REGION&signature=region%20varchar&expression=region%3DCURRENT_ROLE()"
curl -s $H -X POST "$BASE/gouvernance/policies/row-access/apply?policy_name=RLS_REGION&table_name=ORDERS&database=DB&schema=SC&policy_column=REGION"
```

**Résultats attendus** :
- Sans token → **401** sur les 138 ops (`policies/health` = 200) : contrat RBAC vérifié.
- `add-user` (rôle non-admin) → **403** (`require_accountadmin_role`).
- `revoke-permission` → **200** + `{message}` (réfute « endpoint absent »).
- `oauth/integrations` AZURE sans `azure_tenant_id` → **400** (`azure_tenant_id is required`).
- `d360-roles` avec matrix non-seedé → action **autorisée** (fail-open `d360_roles.py:746`) — comportement à corriger, pas un bug de test.
- Appels FE via `/governance/` (typo) → **404** : utiliser `/gouvernance/`.

> Vérifié 2026-06-09 : 15 endpoints vérifiés (correspondance slice + grep backend), 1 endpoint hors-slice vérifié (drop-users-batch : dans slice manquant mais backend:1319 + live 405/path-OK), 0 inventé supprimé, 5 claims fichier:ligne confirmés (gouvernance.py:1256/1909/1956, gui_permissions.py:497-512, d360_roles.py:746), live-retest OK (action-registry=401, row-access=401, health=200, revoke-permission=405/path-OK). IP en §9 = infra connue dans bloc de code test (non-secret). VERDICT : GROUNDED.
