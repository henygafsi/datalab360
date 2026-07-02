/**
 * capabilities.ts — the metadata-driven role-capability map (UI affordance layer).
 *
 * Declares, per gated UI capability, WHAT the backend actually requires and HOW
 * the UI should react when the caller doesn't have it (`hide` vs `disable`).
 * Consumed by `useCapability` (src/hooks/useCapability.ts) and rendered as the
 * "Who can use it" column of the administration Feature Registry.
 *
 * This layer is ADDITIVE: it never replaces `useCanPerform` call sites, and it
 * is an affordance layer only — the backend gates cited below remain the real
 * enforcement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * BACKEND GROUND TRUTH (audited 2026-07-02 against backend/app source — every
 * entry below cites the real gate it mirrors):
 *
 * (a) Module/action permissions — app/modules/gouvernance/routers/d360_roles.py
 *     · GET /gouvernance/d360-roles/my-permissions  → caller's ALLOW rows
 *       [{module, page, tab, action, access_level}] (feeds useCanPerform).
 *     · GET /gouvernance/d360-roles/my-module-access → {module: read|write|none}
 *       coarse posture map (FE service: getMyModuleAccess).
 *     · Application roles (app/core/rbac.py:258 _SNOWFLAKE_TO_D360): Admin,
 *       Data Engineer, Data Analyst, Data Steward, Business User, AI Engineer,
 *       FinOps Manager. Resolution is DB-first (D360_ROLE_ACTIONS) with the
 *       hardcoded _MATRIX template as fallback.
 *     · Dangerous-action policy (app/core/rbac.py:148 _DANGEROUS_ACTIONS):
 *       clone, rotate-credentials, assign-key, revoke-key, bulk-grant,
 *       bulk-revoke, unassign, revoke-share, request-erasure,
 *       transfer-ownership → DENY for every non-Admin role even with module
 *       WRITE (unless a per-role override is added backend-side).
 *
 * (b) Per-project roles — app/modules/projects/services.py:79 ContributorRole:
 *     exactly THREE values: 'owner' | 'editor' | 'viewer' (no analyst/approver
 *     vocabulary exists at project level). get_my_role (services.py ~2100):
 *     can_edit = owner|editor, can_approve = owner, and the project CREATOR
 *     counts as owner even without a contributor row. Contributor list:
 *     GET /projects/{id}/contributors (already wired FE-side in projectsApi).
 *     Router-level project-role gates:
 *       · PUT    /projects/{id}          → owner or editor  (router.py:937)
 *       · DELETE /projects/{id}          → owner or account-admin (router.py:971)
 *       · comments read/post             → any contributor  (router.py:322/:347)
 *       · comment delete                 → author or owner  (router.py:396)
 *
 * (c) Entitlements / feature registry — app/core/feature_registry.py seeds
 *     GOUVERNANCE.MODULE_ENTITLEMENTS; served by
 *     GET/PUT /api/administration/entitlements (administration/router.py:70/:103).
 *     `governed_by` vocabulary there: contributor_role, require_action(...),
 *     require_accountadmin_role.
 *
 * (d) Approval capabilities:
 *     · Project/E&D deployments: require_action("explore_design","versioning",
 *       "deployments","approve") for approve AND reject
 *       (projects/router.py:590/:617, explore_design/router.py:568/:592,
 *       release_router.py:532); execute is require_action("explore_design",
 *       "modeling","canvas","deploy") (projects/router.py:645).
 *     · Tracked deployments (command-center ladder): _require_approver_role
 *       (deployment_tracking/routers/tracking.py:44) — raw account-role
 *       substring check: ACCOUNTADMIN | SYSADMIN | SECURITYADMIN |
 *       DATA_ENGINEER | QA_ENGINEER for approve/reject/execute/rollback.
 *     · Account-admin family (app/dependencies/requirements.py:45
 *       require_accountadmin_role): ACCOUNTADMIN | SYSADMIN | SECURITYADMIN.
 *
 * KNOWN UI↔BACKEND MISMATCHES (documented, not papered over):
 *     · POST /projects/{id}/contributors (router.py:243) has NO owner gate —
 *       any authenticated user can add a contributor (incl. role=owner, which
 *       the router itself audits as TRANSFER_OWNERSHIP). The UI keeps the
 *       intended owner-only affordance; enforcement gap is backend-side.
 *     · approve_deployment (projects/services.py:1353) does NOT verify the
 *       named approver — anyone holding the approve action may approve; the
 *       "named approver" on a deployment is advisory in this path.
 *     · POST /data-quality/dmf/thresholds (dmf_lifecycle_router.py:175) has no
 *       per-action gate (auth + module posture only) → modeled here as
 *       requiredModuleAccess:'write' on data_quality.
 *     · PUT /api/administration/entitlements/{module}/{key}
 *       (administration/router.py:103) is auth-only in the router; the write is
 *       stopped by warehouse privileges. The FE keeps the existing can_govern /
 *       gouvernance:grant seam.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** How a gated surface should react when the capability is missing. */
export type UiBehavior = 'hide' | 'disable';

/**
 * Project-level role vocabulary — mirrors backend ContributorRole
 * (app/modules/projects/services.py:79) and the FE ContributorRole in
 * src/app/services/api/types.ts. Exactly these three exist.
 */
export type ProjectRole = 'owner' | 'editor' | 'viewer';

export interface CapabilityDef {
  /**
   * Action-registry module key (the useCanPerform vocabulary, e.g.
   * 'explore_design', 'bi_reporting', 'gouvernance'). Also used to resolve the
   * active project via useProjectContext when a project role is required.
   */
  module: string;
  /**
   * Action-registry action key checked against my-permissions ALLOW rows.
   * Omitted for capabilities whose backend gate is NOT action-RBAC (pure
   * project-role or account-role gates).
   */
  action?: string;
  /** UI reaction when the capability is missing. */
  uiBehavior: UiBehavior;
  /**
   * Coarse posture requirement from GET /gouvernance/d360-roles/my-module-access
   * — used where the backend has no finer gate than module write access.
   */
  requiredModuleAccess?: 'write';
  /** Contributor role(s) on the ACTIVE project that satisfy the gate. */
  requiredProjectRole?: readonly ProjectRole[];
  /**
   * Raw account-role tokens (substring-matched against the session role string,
   * exactly like the backend's `any(r in role for r in …)` checks).
   */
  requiredAccountRoles?: readonly string[];
  /**
   * True when the backend explicitly lets account admins bypass the
   * project-role requirement (e.g. project delete: owner OR account-admin).
   */
  adminBypass?: boolean;
  /**
   * True for actions in the backend dangerous-action set (rbac.py:148) —
   * denied to every non-Admin role by default even with module WRITE.
   * Informational for requirement text; enforcement already flows through
   * the my-permissions ALLOW rows.
   */
  adminOnlyByDefault?: boolean;
  /** One-line, business-readable description of the capability. */
  description: string;
}

/**
 * The capability map. Every entry cites the REAL backend gate it mirrors
 * (file:line in backend/app). Keep citations current when gates move.
 */
export const CAPABILITIES = {
  // ── Explore & Design / projects lifecycle ─────────────────────────────────
  'explore_design.project.create': {
    module: 'explore_design',
    action: 'create_project',
    uiBehavior: 'hide',
    description: 'Create a new modeling project.',
    // gate: require_action("explore_design","design","canvas","create_project")
    //       backend app/modules/projects/explore_design/router.py:148
  },
  'explore_design.model.deploy': {
    module: 'explore_design',
    action: 'deploy',
    uiBehavior: 'disable',
    description: 'Deploy the modeled schema (run real DDL against the warehouse).',
    // gate: require_action("explore_design","design","canvas","deploy") router.py:230
    //       + require_action("explore_design","modeling","canvas","deploy")
    //         explore_design/router.py:615 and projects/router.py:645 (execute)
  },
  'explore_design.release.request': {
    module: 'explore_design',
    action: 'create',
    uiBehavior: 'disable',
    description: 'Request a governed release / deployment for a project version.',
    // gate: require_action("explore_design","versioning","deployments","create")
    //       backend app/modules/projects/explore_design/release_router.py:477
  },
  'explore_design.deployment.approve': {
    module: 'explore_design',
    action: 'approve',
    uiBehavior: 'disable',
    description: 'Approve or reject a pending deployment (same decision authority for both).',
    // gate: require_action("explore_design","versioning","deployments","approve")
    //       backend app/modules/projects/router.py:590 (approve) /:617 (reject),
    //       explore_design/router.py:568/:592, release_router.py:532
    // NOTE: the service does NOT verify the named approver (services.py:1353).
  },
  'explore_design.deployment.execute': {
    module: 'explore_design',
    action: 'deploy',
    uiBehavior: 'disable',
    description: 'Execute an approved deployment (runs the DDL ladder).',
    // gate: require_action("explore_design","modeling","canvas","deploy")
    //       backend app/modules/projects/router.py:645, explore_design/router.py:615
  },

  // ── Project-scoped capabilities (contributor-role gates, no action-RBAC) ──
  'project.edit': {
    module: 'explore_design',
    uiBehavior: 'disable',
    requiredProjectRole: ['owner', 'editor'],
    description: 'Update project attributes (name, description, status).',
    // gate: get_my_role(...).can_edit — owner or editor only
    //       backend app/modules/projects/router.py:937-942
    //       (account admins are NOT bypassed on this route)
  },
  'project.delete': {
    module: 'explore_design',
    uiBehavior: 'hide',
    requiredProjectRole: ['owner'],
    adminBypass: true,
    description: 'Soft-delete a project.',
    // gate: owner OR account-admin — backend app/modules/projects/router.py:971-979
  },
  'project.contributors.manage': {
    module: 'explore_design',
    uiBehavior: 'disable',
    requiredProjectRole: ['owner'],
    description: 'Add or remove project contributors; granting owner transfers ownership.',
    // intended gate: owner (get_my_role.can_approve — services.py ~2108).
    // MISMATCH: POST /projects/{id}/contributors (router.py:243) is currently
    // NOT owner-gated backend-side; the UI keeps the intended affordance.
  },
  'project.comment': {
    module: 'explore_design',
    uiBehavior: 'hide',
    requiredProjectRole: ['owner', 'editor', 'viewer'],
    description: 'Read and post on the project collaboration thread.',
    // gate: membership (any contributor) — backend app/modules/projects/router.py:322/:347
  },

  // ── Business Reporting (BI dashboards) ────────────────────────────────────
  'bi.dashboard.create': {
    module: 'bi_reporting',
    action: 'create',
    uiBehavior: 'hide',
    description: 'Create a dashboard (including AI auto-create).',
    // gate: require_action("bi_reporting","dashboards","overview|editor","create")
    //       backend app/modules/projects/bi_dashboard/router.py:84/:581/:1110
  },
  'bi.dashboard.edit': {
    module: 'bi_reporting',
    action: 'edit',
    uiBehavior: 'disable',
    description: 'Edit a dashboard: layout, pages, widgets, filters.',
    // gate: require_action("bi_reporting","dashboards","overview|editor","edit")
    //       backend app/modules/projects/bi_dashboard/router.py:432/:634
  },
  'bi.dashboard.delete': {
    module: 'bi_reporting',
    action: 'delete',
    uiBehavior: 'hide',
    description: 'Delete a dashboard or its widgets.',
    // gate: require_action("bi_reporting","dashboards","overview|editor","delete")
    //       backend app/modules/projects/bi_dashboard/router.py:464/:664
  },
  'bi.dashboard.publish': {
    module: 'bi_reporting',
    action: 'publish',
    uiBehavior: 'disable',
    description: 'Move a dashboard from draft to live (and back).',
    // gate: require_action("bi_reporting","dashboards","overview","publish")
    //       backend app/modules/projects/bi_dashboard/router.py:1670 (:1691 unpublish)
  },
  'bi.dashboard.share': {
    module: 'bi_reporting',
    action: 'share',
    uiBehavior: 'disable',
    description: 'Share a dashboard with chosen users or roles.',
    // gate: require_action("bi_reporting","dashboards","share","share")
    //       backend app/modules/projects/bi_dashboard/router.py:1731
  },
  'bi.dashboard.share.revoke': {
    module: 'bi_reporting',
    action: 'revoke-share',
    uiBehavior: 'disable',
    adminOnlyByDefault: true,
    description: 'Revoke an existing dashboard share.',
    // gate: require_action("bi_reporting","dashboards","share","revoke-share")
    //       backend app/modules/projects/bi_dashboard/router.py:1753
    // revoke-share is in the dangerous-action set (rbac.py:148) → Admin-only
    // unless a per-role override is granted backend-side.
  },

  // ── Data products ──────────────────────────────────────────────────────────
  'data_products.create': {
    module: 'data_products',
    action: 'create',
    uiBehavior: 'hide',
    description: 'Register a new data product.',
    // gate: require_action("data_products","marketplace","my-products","create")
    //       backend app/modules/projects/data_products.py:436
  },
  'data_products.publish': {
    module: 'data_products',
    action: 'publish',
    uiBehavior: 'disable',
    description: 'Publish a data product for consumers.',
    // gate: require_action("data_products","marketplace","my-products","publish")
    //       backend app/modules/projects/data_products.py:701
  },
  'data_products.subscribe': {
    module: 'data_products',
    action: 'subscribe',
    uiBehavior: 'disable',
    description: 'Subscribe to a published data product.',
    // gate: require_action("data_products","marketplace","browse","subscribe")
    //       backend app/modules/projects/data_products.py:963
  },

  // ── Governance ─────────────────────────────────────────────────────────────
  'governance.role.create': {
    module: 'gouvernance',
    action: 'create',
    uiBehavior: 'hide',
    description: 'Create a granular application role.',
    // gate: require_action("gouvernance","roles","d360-roles","create")
    //       backend app/modules/gouvernance/routers/d360_roles.py:454
    //       (edit :522, delete :569 share the same decision family)
  },
  'governance.role.permissions': {
    module: 'gouvernance',
    action: 'set-permissions',
    uiBehavior: 'disable',
    description: 'Edit a role’s page/tab/action permission matrix or apply a template.',
    // gate: require_action("gouvernance","roles","d360-roles","set-permissions")
    //       backend app/modules/gouvernance/routers/d360_roles.py:1154
    //       (apply-template :1304)
  },
  'governance.policy.apply': {
    module: 'gouvernance',
    uiBehavior: 'disable',
    requiredAccountRoles: ['ACCOUNTADMIN', 'SYSADMIN', 'SECURITYADMIN'],
    description: 'Apply or remove a data-protection policy (row access, masking, tags) on a table.',
    // gate: require_accountadmin_role (app/dependencies/requirements.py:45)
    //       e.g. POST /gouvernance/policies/row-access/apply
    //       backend app/modules/gouvernance/routers/governance_policies.py:744
  },

  // ── Tracked deployments (command-center deployment ladder) ────────────────
  'deployments.tracked.decide': {
    module: 'account_overview',
    uiBehavior: 'disable',
    requiredAccountRoles: [
      'ACCOUNTADMIN',
      'SYSADMIN',
      'SECURITYADMIN',
      'DATA_ENGINEER',
      'QA_ENGINEER',
    ],
    description: 'Approve, reject, execute or roll back a tracked deployment.',
    // gate: _require_approver_role — raw account-role substring check
    //       backend app/modules/deployment_tracking/routers/tracking.py:44
    //       (approve :300, reject :328, execute :355, rollback :393)
  },

  // ── Data Health ────────────────────────────────────────────────────────────
  'data_quality.threshold.save': {
    module: 'data_quality',
    uiBehavior: 'disable',
    requiredModuleAccess: 'write',
    description: 'Save pass/fail thresholds on quality metrics.',
    // gate: NONE per-action backend-side (auth + module posture only) —
    //       POST /data-quality/dmf/thresholds
    //       backend app/modules/data_quality/dmf_lifecycle_router.py:175.
    //       Modeled as module write posture (my-module-access) until a
    //       require_action gate ships.
  },

  // ── Observability ──────────────────────────────────────────────────────────
  'observability.budget.configure': {
    module: 'observability',
    action: 'configure-budget',
    uiBehavior: 'disable',
    description: 'Create or assign spend guardrails (resource monitors / credit limits).',
    // gate: require_action("observability","platform","*","configure-budget")
    //       backend app/modules/observability/router.py:1902 (_RM_ACTION)
  },
  'observability.platform_config.update': {
    module: 'observability',
    action: 'update-platform-config',
    uiBehavior: 'disable',
    description: 'Update platform observability configuration.',
    // gate: require_action("observability","platform","*","update-platform-config")
    //       backend app/modules/observability/config_router.py:153
  },

  // ── Administration ────────────────────────────────────────────────────────
  'administration.entitlements.toggle': {
    module: 'gouvernance',
    action: 'grant',
    uiBehavior: 'disable',
    description: 'Activate or deactivate a platform feature for the whole account.',
    // FE seam: entitlements envelope can_govern OR gouvernance:grant (the exact
    // gate FeatureRegistryTab already uses). Backend PUT
    // /api/administration/entitlements/{module}/{key} is auth-only in the
    // router (administration/router.py:103) — warehouse privileges stop the
    // write for non-admins.
  },
} as const satisfies Record<string, CapabilityDef>;

/** Union of every declared capability key. */
export type CapabilityKey = keyof typeof CAPABILITIES;

/** Look up one capability definition (typed). */
export function getCapability(key: CapabilityKey): CapabilityDef {
  return CAPABILITIES[key];
}

/** True when a string is a declared capability key (for loosely-typed callers). */
export function isCapabilityKey(key: string): key is CapabilityKey {
  return Object.prototype.hasOwnProperty.call(CAPABILITIES, key);
}

const PROJECT_ROLE_LABEL: Record<ProjectRole, string> = {
  owner: 'owner',
  editor: 'editor',
  viewer: 'viewer',
};

function joinHuman(parts: readonly string[], sep = ' or '): string {
  return parts.length <= 1 ? (parts[0] ?? '') : parts.slice(0, -1).join(', ') + sep + parts[parts.length - 1];
}

/**
 * Compact, human-readable requirement lines for one capability — used by the
 * administration Feature Registry "Who can use it" column. Account-role tokens
 * are shown verbatim (administration is an admin view, where platform role
 * names are allowed).
 */
export function capabilityRequirementLines(key: CapabilityKey): string[] {
  const cap = CAPABILITIES[key] as CapabilityDef;
  const lines: string[] = [];
  if (cap.action) {
    lines.push(
      `Permission: ${cap.module} · ${cap.action}${cap.adminOnlyByDefault ? ' (admin-only by default)' : ''}`,
    );
  }
  if (cap.requiredProjectRole?.length) {
    lines.push(
      `Project role: ${joinHuman(cap.requiredProjectRole.map((r) => PROJECT_ROLE_LABEL[r]))}${cap.adminBypass ? ' (or account admin)' : ''}`,
    );
  }
  if (cap.requiredAccountRoles?.length) {
    lines.push(`Account role: ${cap.requiredAccountRoles.join(' / ')}`);
  }
  if (cap.requiredModuleAccess) {
    lines.push(`Module access: ${cap.requiredModuleAccess} on ${cap.module}`);
  }
  if (lines.length === 0) lines.push('Any signed-in role');
  return lines;
}

/** Single-line variant of the requirement text (tooltip-friendly). */
export function capabilityRequirementText(key: CapabilityKey): string {
  return capabilityRequirementLines(key).join(' · ');
}
