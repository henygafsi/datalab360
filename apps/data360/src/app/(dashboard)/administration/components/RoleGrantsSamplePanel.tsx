'use client';

/**
 * RoleGrantsSamplePanel — "Role grants sample" for the Administration
 * Access Control tab.
 *
 * Pick one of the 7 application data roles (the REAL vocabulary from
 * backend app/core/rbac.py:258, mirrored in src/config/capabilities.ts) and see:
 *
 *   1. The module allow/deny grid answered by the read-only access simulator
 *      (GET /api/platform/access-simulator?role=&module=, one call per module,
 *      cached per role). The simulator reads the CONFIGURED grant rows — it is
 *      NOT the admin bypass, so an account with no configured module grants
 *      honestly reads "deny" for every role; the panel says so explicitly.
 *
 *   2. The declared UI capabilities (src/config/capabilities.ts) evaluated
 *      against that verdict + each capability's own backend gate:
 *        - denied      → module denied, account-role mismatch, or admin-only-by-
 *                        default action for a non-Admin role
 *        - allowed     → an account-role gate this role's token satisfies
 *        - conditional → per-action / project-role / module-posture gates that
 *                        live in the backend DB matrix — we do NOT guess them
 *      Requirement text comes from capabilityRequirementLines (same lines the
 *      Feature Registry shows).
 *
 * Read-only. Honest empty/error states — nothing is fabricated.
 */
import { useCallback, useMemo, useState } from 'react';
import { KeyRound, RefreshCw, ShieldQuestion } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MODULES } from '@/config/modules';
import {
  CAPABILITIES,
  capabilityRequirementLines,
  type CapabilityKey,
  type CapabilityDef,
} from '@/config/capabilities';
import {
  simulateRoleAccess,
  D360_DATA_ROLES,
  type D360DataRole,
} from '@/app/services/platform/grants';
import { getApiErrorMessage } from '@/lib/api-client';

// Module verdicts for one role: apiName → allowed | denied | unknown(error/no verdict)
type ModuleVerdict = boolean | null;
type RoleVerdicts = Record<string, ModuleVerdict>;

type CapStatus = 'allowed' | 'denied' | 'conditional';

/**
 * Approximation of the backend's account-role substring check
 * (`any(r in role for r in required)`): the app-role label is normalized to its
 * token form ("Data Engineer" → DATA_ENGINEER, "Admin" → ADMIN which the
 * ACCOUNTADMIN/SYSADMIN tokens contain). Display always carries the verbatim
 * requirement line so the approximation is inspectable.
 */
function roleSatisfiesAccountRoles(role: D360DataRole, required: readonly string[]): boolean {
  const token = role.toUpperCase().replace(/\s+/g, '_');
  return required.some((r) => r.includes(token) || token.includes(r));
}

function capabilityStatus(
  role: D360DataRole,
  cap: CapabilityDef,
  moduleVerdict: ModuleVerdict,
): { status: CapStatus; reason: string } {
  if (moduleVerdict === false) {
    return { status: 'denied', reason: 'Module denied for this role by the simulator.' };
  }
  if (cap.requiredAccountRoles?.length) {
    return roleSatisfiesAccountRoles(role, cap.requiredAccountRoles)
      ? { status: 'allowed', reason: 'Account-role gate satisfied by this role’s token.' }
      : { status: 'denied', reason: `Requires account role ${cap.requiredAccountRoles.join(' / ')}.` };
  }
  if (cap.adminOnlyByDefault && role !== 'Admin') {
    return { status: 'denied', reason: 'Dangerous action — denied to every non-Admin role by default (backend rbac).' };
  }
  if (cap.requiredProjectRole?.length) {
    return { status: 'conditional', reason: `Depends on the user’s role on the active project (${cap.requiredProjectRole.join(' / ')}).` };
  }
  if (cap.action) {
    return {
      status: 'conditional',
      reason: moduleVerdict === true
        ? 'Module allowed — the per-action grant in the role’s permission matrix decides.'
        : 'Per-action grant in the role’s permission matrix decides (module verdict unknown).',
    };
  }
  if (cap.requiredModuleAccess) {
    return { status: 'conditional', reason: `Needs ${cap.requiredModuleAccess} posture on ${cap.module} (my-module-access).` };
  }
  return { status: 'conditional', reason: 'No declared gate beyond sign-in.' };
}

const STATUS_STYLE: Record<CapStatus, string> = {
  allowed: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900',
  denied: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900',
  conditional: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900',
};
const STATUS_LABEL: Record<CapStatus, string> = {
  allowed: 'allowed',
  denied: 'denied',
  conditional: 'conditional',
};

export default function RoleGrantsSamplePanel() {
  const [role, setRole] = useState<D360DataRole | null>(null);
  // Per-role cache of module verdicts — one simulator call per (role × module),
  // fetched on role selection, never re-fetched unless "Refresh" is clicked.
  const [verdicts, setVerdicts] = useState<Partial<Record<D360DataRole, RoleVerdicts>>>({});
  const [loadingRole, setLoadingRole] = useState<D360DataRole | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadRole = useCallback(async (r: D360DataRole, force = false) => {
    setRole(r);
    setError(null);
    if (!force && verdicts[r]) return; // cached
    setLoadingRole(r);
    const out: RoleVerdicts = {};
    let anyOk = false;
    let firstErr: string | null = null;
    await Promise.all(
      MODULES.map(async (m) => {
        try {
          const res = await simulateRoleAccess({ role: r, module: m.apiName });
          out[m.apiName] = res.checks?.module?.allowed ?? null;
          anyOk = true;
        } catch (e) {
          out[m.apiName] = null;
          if (!firstErr) firstErr = getApiErrorMessage(e);
        }
      }),
    );
    setVerdicts((v) => ({ ...v, [r]: out }));
    if (!anyOk && firstErr) setError(`Access simulator unavailable: ${firstErr}`);
    setLoadingRole(null);
  }, [verdicts]);

  const current: RoleVerdicts | undefined = role ? verdicts[role] : undefined;
  const isLoading = role != null && loadingRole === role;

  // Honest empty-grants detection: every module answered an explicit false.
  const allDenied = useMemo(() => {
    if (!current) return false;
    const vals = MODULES.map((m) => current[m.apiName]);
    return vals.length > 0 && vals.every((v) => v === false);
  }, [current]);

  const capRows = useMemo(() => {
    if (!role || !current) return [];
    return (Object.keys(CAPABILITIES) as CapabilityKey[]).map((key) => {
      const cap = CAPABILITIES[key] as CapabilityDef;
      const verdict = current[cap.module] ?? null;
      const { status, reason } = capabilityStatus(role, cap, verdict);
      return { key, cap, status, reason, lines: capabilityRequirementLines(key) };
    });
  }, [role, current]);

  return (
    <div>
      {/* Role selector — 7 real data roles */}
      <div className="flex flex-wrap items-center gap-2">
        {D360_DATA_ROLES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => void loadRole(r)}
            aria-pressed={role === r}
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
              role === r
                ? 'border-indigo-500 bg-indigo-600 text-white'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800',
            )}
          >
            {r}
          </button>
        ))}
        {role && (
          <button
            type="button"
            onClick={() => void loadRole(role, true)}
            disabled={isLoading}
            title="Re-run the simulator for this role (one call per module)"
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw className={cn('h-3 w-3', isLoading && 'animate-spin')} />
            Refresh
          </button>
        )}
      </div>

      {!role && (
        <div className="mt-4 flex items-center gap-2 rounded-lg border border-dashed border-slate-200 p-4 text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
          <ShieldQuestion className="h-4 w-4 shrink-0 text-slate-400" />
          Pick a role to simulate its module access and see which declared capabilities it can reach.
        </div>
      )}

      {role && isLoading && (
        <p className="mt-4 text-xs text-slate-500 dark:text-slate-400">
          Simulating {MODULES.length} modules for {role}…
        </p>
      )}

      {role && !isLoading && error && (
        <p className="mt-4 text-xs text-rose-600 dark:text-rose-400">{error}</p>
      )}

      {role && !isLoading && current && !error && (
        <>
          {/* Module allow/deny grid — the simulator's real answer, unedited */}
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Module access (simulator verdict)
            </h3>
            {allDenied && (
              <p className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[11px] text-amber-700 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300">
                Every module reads as deny for this role. The simulator reads the account&apos;s
                CONFIGURED module grants (it is not the admin bypass) — an account with no
                grant rows configured answers deny for every role.
              </p>
            )}
            <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
              {MODULES.map((m) => {
                const v = current[m.apiName];
                return (
                  <div
                    key={m.apiName}
                    className="flex items-center justify-between gap-2 rounded-md border border-slate-100 bg-slate-50/60 px-2 py-1.5 dark:border-slate-800 dark:bg-slate-900/40"
                    title={`${m.name} (${m.apiName})`}
                  >
                    <span className="truncate text-[11px] text-slate-600 dark:text-slate-300">{m.name}</span>
                    <span
                      className={cn(
                        'shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold',
                        v === true && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300',
                        v === false && 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300',
                        v == null && 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
                      )}
                    >
                      {v === true ? 'ALLOW' : v === false ? 'DENY' : '—'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Declared capabilities the role satisfies / is denied / must resolve per-action */}
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Declared capabilities ({capRows.length})
            </h3>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
              Derived from the simulator&apos;s module verdict plus each capability&apos;s declared
              backend gate. Per-action grants live in the role&apos;s permission matrix
              (backend DB) — those are marked <b>conditional</b>, never guessed.
            </p>
            {capRows.length === 0 ? (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">No capabilities declared.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {capRows.map(({ key, cap, status, reason, lines }) => (
                  <li
                    key={key}
                    className="rounded-md border border-slate-100 bg-white px-2.5 py-2 dark:border-slate-800 dark:bg-slate-900"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <KeyRound className="h-3 w-3 shrink-0 text-slate-400" />
                      <code className="text-[11px] font-medium text-slate-700 dark:text-slate-200">{key}</code>
                      <span className={cn('rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase', STATUS_STYLE[status])}>
                        {STATUS_LABEL[status]}
                      </span>
                      <span className="text-[11px] text-slate-500 dark:text-slate-400">{cap.description}</span>
                    </div>
                    <div className="mt-1 pl-5 text-[10.5px] leading-relaxed text-slate-500 dark:text-slate-400">
                      <span className="italic">{reason}</span>
                      {' · '}
                      {lines.join(' · ')}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
