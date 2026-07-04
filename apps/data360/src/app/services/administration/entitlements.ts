'use client';

/**
 * administration/entitlements — Feature Governance admin service (G5).
 *
 * Wraps the ACCOUNTADMIN-gated entitlement + governance-posture backend
 * (`app/modules/administration/router.py`):
 *
 *   GET  /api/administration/entitlements
 *        → full per-module addon matrix (every registered feature merged with
 *          stored on/off overrides) + best-effort module activity enrichment.
 *   PUT  /api/administration/entitlements/{module}/{feature_key}
 *        → enable/disable/configure ONE addon for this account. WRITE path.
 *   GET  /api/administration/governance-posture
 *        → per-module rollup: enabled-feature counts, granted roles, bound
 *          policies, usage/error-rate. The "who governs what" summary.
 *
 * Envelope: these routes use the backend `standard_response` wrapper
 *   { ok, data, permissions, freshness, trace, errors }
 * and the axios `apiClient` does NOT auto-unwrap, so the real payload lives at
 * `res.data.data` and the governance flag at `res.data.permissions.can_govern`.
 * We read both explicitly (defensive `?? res.data` fallback as elsewhere).
 *
 * The whole router carries the literal `/api` prefix (the axios baseURL adds
 * none), so paths below keep `/api/administration/...` verbatim.
 *
 * A backend not deployed yet (404/501) surfaces as {@link NotDeployedError} so
 * the UI degrades to a quiet "not wired yet" state instead of a hard error.
 */
import axios from 'axios';
import apiClient from '@/lib/api-client';

const PREFIX = '/api/administration';

// ── Standard-response envelope ───────────────────────────────────────────────

/** The backend `standard_response` wrapper (only the fields the FE reads). */
interface Envelope<T> {
  ok?: boolean;
  data: T;
  permissions?: { can_govern?: boolean } & Record<string, boolean>;
  freshness?: unknown;
  errors?: unknown[];
}

// ── Domain types — mirror feature_registry.Feature + entitlement_service ─────

/** One governable addon row (registry feature merged with stored override). */
export interface EntitlementFeature {
  module: string;
  feature_key: string;
  label: string;
  description: string;
  /** Primary endpoint family the feature exposes (e.g. `/projects`). */
  surface: string | null;
  /** The policy/role gate that governs the feature's mutations. */
  governed_by: string | null;
  enabled: boolean;
  config: Record<string, unknown> | null;
  /** `"override"` = an explicit admin decision is stored; `"default"` = registry. */
  source: 'override' | 'default' | string;
  updated_by: string | null;
  updated_at: string | null;
}

/** Per-module usage / error-rate from EVENT_STORE.USER_REQUESTS (best-effort). */
export interface ModuleActivityRow {
  module: string;
  requests: number;
  success: number;
  failed: number;
  denied: number;
  error_rate: number;
  deny_rate: number;
  distinct_users: number;
  avg_duration_ms: number | null;
  cache_hit_rate: number;
  last_activity_at: string | null;
}

export interface ModuleActivity {
  window_days: number;
  modules: ModuleActivityRow[];
  totals: Omit<ModuleActivityRow, 'module'>;
  vocabulary?: string;
  source?: string;
}

/** GET /entitlements payload (envelope `.data`). */
export interface EntitlementsMatrix {
  /** module slug → its feature rows. */
  modules: Record<string, EntitlementFeature[]>;
  feature_count: number;
  module_count: number;
  /** Best-effort activity enrichment; `null` if the read degraded. */
  activity: ModuleActivity | null;
}

/** One per-module posture rollup row. */
export interface PostureRow {
  module: string;
  features_total: number;
  features_enabled: number;
  /** feature_keys currently disabled for this account. */
  disabled: string[];
  /** Roles granted access to this module (from platform_core grants). */
  granted_roles: string[];
  /** Usage row where the slug maps 1:1 to USER_REQUESTS.MODULE; else null. */
  usage: ModuleActivityRow | null;
  /** Account-wide bound-policy total, attached to the `gouvernance` module. */
  bound_policies?: number;
}

export interface PolicyBindingsSummary {
  total_active: number;
  objects_covered: number;
  by_kind: { kind: string; bindings: number; objects: number }[];
  source?: string;
}

/** GET /governance-posture payload (envelope `.data`). */
export interface GovernancePosture {
  posture: PostureRow[];
  policy_bindings: PolicyBindingsSummary | null;
  module_activity: ModuleActivity | null;
  usage_window_days: number | null;
}

/** Result of a PUT toggle (envelope `.data`). */
export interface SetEntitlementResult {
  module: string;
  feature_key: string;
  enabled: boolean;
  config: Record<string, unknown> | null;
  updated_by: string;
}

/** Read result carrying the matrix + whether the admin may write toggles. */
export interface EntitlementsRead {
  matrix: EntitlementsMatrix;
  canGovern: boolean;
}

export interface GovernancePostureRead {
  posture: GovernancePosture;
  canGovern: boolean;
}

// ── Degradation ──────────────────────────────────────────────────────────────

/** Raised when the backend route is not deployed/wired yet (404 / 501). */
export class NotDeployedError extends Error {
  constructor(message = 'not deployed yet') {
    super(message);
    this.name = 'NotDeployedError';
  }
}

function isNotDeployed(e: unknown): boolean {
  return axios.isAxiosError(e) && (e.response?.status === 404 || e.response?.status === 501);
}

/** Unwrap the standard_response envelope (defensive: tolerate a raw payload). */
function unwrap<T>(body: Envelope<T> | T): { data: T; canGovern: boolean } {
  const env = body as Envelope<T>;
  if (env && typeof env === 'object' && 'data' in env) {
    return { data: env.data, canGovern: Boolean(env.permissions?.can_govern) };
  }
  return { data: body as T, canGovern: false };
}

async function getEnvelope<T>(url: string): Promise<{ data: T; canGovern: boolean }> {
  try {
    const res = await apiClient.get<Envelope<T> | T>(url);
    return unwrap<T>(res.data);
  } catch (e) {
    if (isNotDeployed(e)) throw new NotDeployedError();
    throw e;
  }
}

// ── Calls ────────────────────────────────────────────────────────────────────

/** GET /api/administration/entitlements — full per-module addon matrix. */
export async function getEntitlements(): Promise<EntitlementsRead> {
  const { data, canGovern } = await getEnvelope<EntitlementsMatrix>(`${PREFIX}/entitlements`);
  return { matrix: data, canGovern };
}

/** GET /api/administration/governance-posture — per-module governance rollup. */
export async function getGovernancePosture(): Promise<GovernancePostureRead> {
  const { data, canGovern } = await getEnvelope<GovernancePosture>(`${PREFIX}/governance-posture`);
  return { posture: data, canGovern };
}

/**
 * PUT /api/administration/entitlements/{module}/{feature_key} — toggle one addon.
 * WRITE path (ACCOUNTADMIN-gated). Returns the persisted row.
 */
export async function setEntitlement(
  module: string,
  featureKey: string,
  body: { enabled: boolean; config?: Record<string, unknown> | null },
): Promise<SetEntitlementResult> {
  try {
    const res = await apiClient.put<Envelope<SetEntitlementResult> | SetEntitlementResult>(
      `${PREFIX}/entitlements/${encodeURIComponent(module)}/${encodeURIComponent(featureKey)}`,
      body,
    );
    return unwrap<SetEntitlementResult>(res.data).data;
  } catch (e) {
    if (isNotDeployed(e)) throw new NotDeployedError();
    throw e;
  }
}

// ── Capability mapping ───────────────────────────────────────────────────────

/**
 * Maps each governable feature to the high-level CAPABILITY the G5 goal speaks
 * of (who can create / run / deploy / manage charts & projects). Derived from
 * the backend feature_registry `governed_by` gate + surface — NOT a backend
 * field, so it is presentation-only and clearly labelled in the UI.
 */
export type Capability = 'create' | 'run' | 'deploy' | 'manage' | 'govern';

const CAPABILITY_BY_FEATURE: Record<string, Capability> = {
  'projects:project_crud': 'create',
  'projects:data_products': 'manage',
  'projects:project_rls': 'govern',
  'projects:deployments': 'deploy',
  'gouvernance:policy_lifecycle': 'govern',
  'gouvernance:pii_intelligence': 'govern',
  'gouvernance:d360_roles': 'govern',
  'gouvernance:gui_permissions': 'govern',
  'data_quality:dmf_lifecycle': 'run',
  'catalog:catalog_360': 'manage',
  'recommendations:reco_lifecycle': 'run',
  'observability:resource_monitors': 'manage',
  'observability:budgets': 'manage',
  'workflow:block_catalog': 'run',
  'command_center:object_deep_dive': 'run',
  'administration:server_metrics': 'manage',
  'administration:usage_analytics': 'manage',
};

/** Best-effort capability for a feature; falls back to `manage`. */
export function capabilityOf(module: string, featureKey: string): Capability {
  return CAPABILITY_BY_FEATURE[`${module}:${featureKey}`] ?? 'manage';
}

export const CAPABILITY_LABEL: Record<Capability, string> = {
  create: 'Create',
  run: 'Run',
  deploy: 'Deploy',
  manage: 'Manage',
  govern: 'Govern',
};
