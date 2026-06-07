---
name: page-governance
description: >
  Référence complète du module Governance de Data360. Structure per-route :
  /governance → redirect /governance/policies. Sub-routes: users, roles, grants, policies,
  security-matrix. Rôle principal : Data Governor. 10 sous-tabs dans le spec
  (SF features G1-G16). Grants page déjà en multi-tabs.
---

# Governance — Référence Data360

## Structure des routes

```
/governance                  → redirect vers /governance/policies
/governance/users            → users/page.tsx (UsersTable + AddUserButton)
/governance/roles            → roles/page.tsx (RolesTable + AddRoleButton)
/governance/grants           → grants/page.tsx (6 tabs internes)
/governance/policies         → policies/page.tsx (9 types en 3 groupes)
/governance/security-matrix  → security-matrix/page.tsx (matrice RBAC)
/governance/network-policies → network-policies/page.tsx
/governance/oauth            → oauth/page.tsx
/governance/projects         → projects/page.tsx
```

## Rôles utilisateurs

| Rôle | Pages utilisées | Actions principales |
|------|----------------|---------------------|
| **Data Governor** | Toutes | Créer users/rôles, assigner grants, appliquer policies, auditer accès |
| **Platform Admin** | users, roles, security-matrix | Voir matrice permissions, créer comptes service |
| **DQ Analyst** | policies (DMF, masking) | Voir policies actives, comprendre les règles de masking |
| **Data Modeler** | policies (masking, RLS) | Voir quelles policies s'appliquent à leurs tables |

---

## Page : /governance/users

### Fichier source
`apps/data360/src/app/(dashboard)/governance/users/page.tsx`

### Ce qui s'affiche
- `PageHeader` avec titre "User Management" + badge "Active Users"
- Boutons header : `ImportButton` + `AddUserButton` (ouvre une modale/drawer)
- `UsersTable` — table rizzui avec colonnes : username, email, status, last_login, roles
- `refreshKey` pattern pour re-fetch après add/edit

### Actions disponibles (Data Governor)

| Action | Endpoint | HTTP | RBAC | InsightActionButton |
|--------|----------|------|------|---------------------|
| Ajouter user | POST /gouvernance/add-user | 200 | gouvernance/create | Non (wizard multi-step) |
| Activer user | POST /gouvernance/enable_user | 200 | gouvernance/edit | Oui |
| Désactiver user | POST /gouvernance/disable_user | 200 | gouvernance/edit | Oui (confirm:warning) |
| Supprimer user | POST /gouvernance/drop-user | 200 | gouvernance/delete | Oui (confirm:warning) |
| Assigner rôle | PUT /gouvernance/users/{u}/roles | 200 | gouvernance/grant | Oui |
| Importer users | POST /gouvernance/users/import | ⚠️ à vérifier | gouvernance/import | Non (upload) |
| Voir rôles user | GET /gouvernance/users/{u}/roles | 200 | gouvernance/view | Non (lecture) |

### Composants clés
```
src/app/shared/governance/users/
├── table.tsx        # UsersTable principal
└── add-user-button.tsx  # Bouton + modale création
```

### Problèmes UX actuels
- `AddUserButton` ouvre une modale → à migrer en panel droit
- Cliquer une row n'affiche rien (pas de panel détails)
- Import via `ImportButton` générique sans preview

### Redesign Alice — /governance/users

**Layout 14:6 :**
```tsx
// FilterChips
const USER_SEGMENTS = [
  { id: 'all', label: 'Tous' },
  { id: 'active', label: 'Actifs' },
  { id: 'disabled', label: 'Désactivés' },
  { id: 'service', label: 'Service Accounts' },
];

// Panel Détails (user sélectionné)
interface UserPanelDetails {
  username: string;
  email: string;
  created_at: string;
  disabled: boolean;
  default_role: string;
  last_login: string | null;    // ACCOUNT_USAGE.LOGIN_HISTORY
  mfa_type: string | null;      // SHOW USERS: MFA_TYPE
  roles: string[];              // GET /gouvernance/users/{u}/roles
}
```

**Panel Actions :**
```tsx
// Toutes les actions dans le panel, plus de modale
<InsightActionButton
  label="Assign Role"
  onAction={() => assignRole(user.username, selectedRole)}
  capable={canEdit.allowed}
/>
<InsightActionButton
  label="Disable"
  onAction={() => disableUser(user.username)}
  confirm={{ title: `Disable ${user.username}?`, variant: 'warning' }}
  capable={canEdit.allowed}
/>
<InsightActionButton
  label="Reset MFA"
  onAction={() => resetMfa(user.username)}
  capable={canEdit.allowed}
/>
<InsightActionButton
  label="Drop User"
  variant="danger"
  onAction={() => dropUser(user.username)}
  confirm={{ title: `Drop ${user.username}?`, body: 'This action is irreversible.', variant: 'warning' }}
  capable={canDelete.allowed}
/>
```

---

## Page : /governance/roles

### Fichier source
`apps/data360/src/app/(dashboard)/governance/roles/page.tsx`

### Ce qui s'affiche
- `PageHeader` titre "Role Management" + badge "Active Roles"
- Boutons : `ImportButton` + `AddRoleButton`
- `RolesTable` — colonnes : role_name, owner, created_at, granted_to (count), privileges

### Actions (Data Governor)

| Action | Endpoint | HTTP | RBAC |
|--------|----------|------|------|
| Créer rôle | POST /gouvernance/add-role | 200 | gouvernance/create |
| Supprimer rôle | POST /gouvernance/drop-role | 200 | gouvernance/delete |
| Supprimer batch | POST /gouvernance/drop-roles-batch | 200 | gouvernance/delete |
| Assigner rôle à user | POST /gouvernance/assign-role | 200 | gouvernance/grant |
| Désassigner | POST /gouvernance/unassign-role | 200 | gouvernance/grant |
| Voir grants du rôle | GET /gouvernance/grants-for-role/{name} | 200 | gouvernance/view |

### Panel Détails (rôle sélectionné)
```
Détails :
  role_name: DATA_ANALYST
  owner: SYSADMIN
  created_at: 2026-01-15
  granted_to: 12 users

  Sub-roles: 2 (DATA_VIEWER, REPORTING_ROLE)
  Grants: SELECT on ANALYTICS.PUBLIC (23 tables)
  [Voir tous les grants] → panel expand

Actions :
  [Add User to Role]   → POST /gouvernance/assign-role
  [View Hierarchy]     → visualisation arbre imbriqué inline
  [Duplicate Role]     → POST /gouvernance/add-role (copie grants)
  [Drop Role ⚠️]       → DELETE confirm:warning

Alice Tips :
  "23 tables avec SELECT — envisager un masking policy pour les colonnes PII"
  → CTA: [Voir colonnes PII] → /governance/policies?tab=masking
```

---

## Page : /governance/grants

### Fichier source
`apps/data360/src/app/(dashboard)/governance/grants/page.tsx`

### Tabs internes (6 tabs dans la page)
- `role-grants` — Grants par rôle Snowflake (RolesTable + GrantsTable)
- `user-grants` — Grants directs sur users (UserGrantsTable)
- `policy-grants` — Policies appliquées (PolicyGrantsTable)
- `stage-grants` — Grants sur stages (StageGrantsTable)
- `d360-roles` — Rôles Data360 custom (D360Role CRUD complet)
- `source-product-grants` — Access catalog (sources + products via /catalog/sources)

### Actions clés

| Tab | Action | Endpoint | RBAC |
|-----|--------|----------|------|
| role-grants | Modifier grant | POST /gouvernance/update-grants | gouvernance/grant |
| d360-roles | Créer D360 role | POST /gouvernance/d360-roles | gouvernance/create |
| d360-roles | Éditer D360 role | PUT /gouvernance/d360-roles/{id} | gouvernance/edit |
| d360-roles | Supprimer D360 role | DELETE /gouvernance/d360-roles/{id} | gouvernance/delete |
| source-product-grants | Ajouter grant | POST /gouvernance/grants | gouvernance/grant |

### Composants
```
src/app/shared/governance/
├── grants/table.tsx          # GrantsTable
├── user-grants/table.tsx     # UserGrantsTable
├── policy-grants/table.tsx   # PolicyGrantsTable
├── stage-grants/table.tsx    # StageGrantsTable
└── action-rail.tsx           # ActionRail pour D360 roles
```

### D360 Roles — Détail (source: `src/app/services/governance/fetch_roles.ts`)
```typescript
interface D360Role {
  id: string;
  name: string;
  template?: string;  // template de départ
  permissions: RolePermission[];  // module + action + access_level
}
// CRUD: getD360Roles(), getD360RoleTemplates(), createD360Role(), updateD360Role(), deleteD360Role()
// Endpoint: GET /gouvernance/d360-roles/my-permissions (useCanPerform utilise ça)
```

---

## Page : /governance/policies

### Fichier source
`apps/data360/src/app/(dashboard)/governance/policies/page.tsx`

### Structure (3 groupes, 9 policies)
```
Groupe "Data Access" :
  RLS (Row Access)    → rls-policies-content.tsx
  Masking            → masking-policies-content.tsx
  Aggregation        → aggregation-policies-content.tsx
  Network            → network-policies-content.tsx

Groupe "Classification & Metrics" :
  Classification     → classification-content.tsx
  Tags               → tag-policies-content.tsx
  Data Metrics (DMF) → dmf-content.tsx

Groupe "Authentication" :
  Password           → password-policies-content.tsx
  Session            → session-policies-content.tsx
```

### Actions par policy (Data Governor)

**Masking Policy :**
```
Créer: POST /gouvernance/masking-policies    → wizard: colonne source + type masking + conditions
Appliquer: POST /gouvernance/masking-policies/{name}/apply → ALTER TABLE MODIFY COLUMN SET MASKING POLICY
Supprimer: DELETE /gouvernance/masking-policies/{name}
```

**RLS Policy :**
```
Créer: POST /gouvernance/row-access-policies  → wizard: table + condition SQL par rôle
Appliquer: POST /gouvernance/row-access-policies/{name}/apply → ADD ROW ACCESS POLICY
```

**DMF (Data Metrics) :**
```
Associer: POST /gouvernance/dmf/associate   → ALTER TABLE ADD DATA METRIC FUNCTION
Scheduler: POST /gouvernance/dmf/schedule   → cron expression + warehouse
```

**Classification :**
```
Lancer scan: POST /gouvernance/classify     → EXTRACT_SEMANTIC_CATEGORIES
Appliquer tags: POST /gouvernance/tags/apply → ALTER TABLE MODIFY COLUMN SET TAG
```

### Snowflake Features
- SF:G3 Masking Policy, SF:G4 Row Access Policy, SF:G5 Aggregation Policy
- SF:G7 Tags, SF:G8 Classification (EXTRACT_SEMANTIC_CATEGORIES)
- SF:H1 DMF (Data Metric Functions)

---

## Henry Tasks — governance

### P1
- [ ] Créer `src/app/services/governance/rightbar.ts` :
      `getUserDetail(username)` → GET /gouvernance/users/{u}/detail (new endpoint)
      `getUserRolesAndGrants(username)` → GET /gouvernance/users/{u}/roles + grants
      `getLoginHistory(username, limit=5)` → ACCOUNT_USAGE.LOGIN_HISTORY
- [ ] Backend: `GET /gouvernance/users/{username}/detail` dans router_users.py
      Snowflake: `SHOW USERS LIKE '{username}'` + `ACCOUNT_USAGE.LOGIN_HISTORY WHERE USER_NAME = %s LIMIT 5`
- [ ] Migrer AddUserButton (modale) → inline dans RightPanel (section Actions, empty state)

### P2
- [ ] Layout 14:6 pour /governance/users et /governance/roles
      FilterChips: [Tous] [Actifs] [Désactivés] [Service Accounts]
- [ ] Panel Détails: roles badges + last login + MFA status (live depuis SHOW USERS)
- [ ] AliceTips: détecter users inactifs 30j → suggérer désactivation via Cortex

### P3
- [ ] Historique GOVERNANCE_EVENTS par user dans panel
- [ ] Matrice RBAC visuelle dans /governance/security-matrix → grid interactive
- [ ] Auto-classification PII dans /governance/policies → EXTRACT_SEMANTIC_CATEGORIES

## Screenshots
```
e2e/results/screenshots/governance-users.png
e2e/results/screenshots/governance-roles.png
e2e/results/screenshots/governance-grants.png
e2e/results/screenshots/governance-policies.png
e2e/results/screenshots/governance-security-matrix.png
```

---

## Module Run — governance — 2026-06-07

### Global KPIs
| KPI | Value |
|-----|-------|
| endpoints_audited | 49 |
| api_contracts_gaps_found | 7 |
| api_contracts_gaps_fixed | 7 |
| fake_zero_fixes | 0 |
| service_files_created | 0 |
| cache_invalidation_gaps | 2 |
| conventions_compliant | true |

### Step States
| Step | State | Notes |
|------|-------|-------|
| Read source | ✅ | All 10 service files + page.tsx + shared tables read fully |
| Convention check | ✅ | All service files use `apiClient` (no raw fetch/axios). All authenticated calls go through apiClient. |
| api-contracts fixes | ✅ | 7 entries added to `API.gouvernance` |
| Fake-zero fixes | ✅ | No `?? 0` in display layer. Roles columns use `?? '—'`. Service-layer `?? 0` (permission_count, allowed, total) are API-shape defaults, not display values. |
| Log written | ✅ | page-governance.md appended |

### Fixes Applied
- `apps/data360/src/lib/api-contracts.ts`: Added 7 missing `API.gouvernance.*` entries:
  - `userDetail(username)` → `GET /gouvernance/users/{username}`
  - `policiesHealth()` → `GET /gouvernance/policies/health`
  - `policyTagsList()` → `GET /gouvernance/policies/tags/list`
  - `classificationClassify()` → `POST /gouvernance/policies/classification/classify`
  - `policyRowAccess()` → `POST /gouvernance/policies/row-access`
  - `d360Roles()` → `GET /gouvernance/d360-roles`
  - `d360MyPermissions()` → `GET /gouvernance/d360-roles/my-permissions`

### Remaining Gaps
- **Service files do not consume `API.gouvernance.*`**: All 10 service files use hardcoded path strings (e.g. `'/gouvernance/users'`) instead of `API.gouvernance.users()`. Conventions require paths in api-contracts.ts, but the service layer is not yet wired to consume them. Backlog item: migrate each call-site to use `API.gouvernance.*()`.
- **cache invalidation gaps**: `CACHE_KEYS.ROLES` and `CACHE_KEYS.USERS` are used in `roles/table.tsx` and `users/table.tsx` respectively. However, `fetch_roles.ts` D360-role sub-functions (`getD360Roles`, `getMyPermissions`) and `security_matrix.ts` functions have no `useCacheInvalidation` subscription. A `CACHE_KEYS.D360_ROLES` key should be added when those pages are wired to SSE.
- **InsightActionButton annotations**: `cost`, `risk`, `govDelta`, `lineageImpact` props absent from governance action buttons. All `InsightActionButton` usages in shared governance are stubs (per the spec they should carry these annotations). Blocked until governance rightbar.ts service is implemented (Henry P1 task).
- **policies.ts uses `API_CONFIG.ENDPOINTS.GOVERNANCE`**: `policies.ts` builds its base URL from `API_CONFIG.ENDPOINTS.GOVERNANCE` (a legacy constant) instead of `API.gouvernance.policies()`. Should be migrated for consistency.
