'use client';

/**
 * RoleInspectorPanel — docked (inline, non-popup) two-layer-hierarchy builder.
 *
 * Inspects ONE access role R and lets an admin build the two-layer role
 * hierarchy in bulk: grant R into many functional roles at once, or detach it
 * from many. This is the reverse direction of the single-role inspector under
 * (dashboard)/governance/roles/components — there the inspected role is the
 * RECIPIENT; here the inspected role R is the GRANTEE that gets granted INTO
 * each selected functional role.
 *
 * Backlog §E:
 *   • Item 7  — Bulk attach/detach an access role into N functional roles.
 *               POST /gouvernance/roles/{R}/grant-role  { to_role: F }   (attach)
 *               DELETE /gouvernance/roles/{R}/grant-role?to_role=F        (detach)
 *               via attachRole(R, F) / detachRole(R, F) — Snowflake applies one
 *               GRANT/REVOKE per target, so we LOOP and capture per-row
 *               {target, ok, error}, then report an honest summary toast.
 *   • Item 12 — Least-privilege advisory (granted-but-unused grants) for R.
 *               GET /gouvernance/roles/{R}/least-privilege via
 *               getRoleLeastPrivilege — read-only, gated by 'view'.
 *
 * Guardrails (admin-controlled security):
 *   • Attach gated by useCanPerform('gouvernance','edit'); detach by 'delete';
 *     advisory by 'view'. Denied controls are disabled (not hidden) with a
 *     reason title.
 *   • Each run confirms first (ConfirmDialog) — these touch many roles.
 *   • Granting R into F widens every inheritor of F, so after a successful run
 *     we call invalidateMyPermissions() to re-gate open tabs. (This is an
 *     allow-set change, not a data-plane policy.)
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'react-hot-toast';
import {
  ShieldCheck,
  ShieldX,
  Loader2,
  Search,
  Layers,
  Gauge,
  AlertTriangle,
} from 'lucide-react';
import { getRoles } from '@/app/services/governance/fetch_roles';
import { attachRole, detachRole } from '@/app/services/governance/role_grants';
import {
  getRoleLeastPrivilege,
  type LeastPrivilegeResult,
} from '@/app/services/governance/policies';
import { useCanPerform, invalidateMyPermissions } from '@/hooks/useCanPerform';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { toServiceError } from '@/app/services/_errors';

export interface RoleInspectorPanelProps {
  /** The access role to grant into / detach from functional roles. */
  role: string;
  /**
   * Optional candidate functional roles for the picker. When omitted the panel
   * fetches the full role list itself (best-effort).
   */
  candidateRoles?: string[];
  /** Called after a successful bulk attach/detach so the host can refetch. */
  onMutated?: () => void | Promise<void>;
}

type RowResult = { target: string; ok: boolean; error?: string };

export default function RoleInspectorPanel({
  role,
  candidateRoles,
  onMutated,
}: RoleInspectorPanelProps) {
  const { allowed: canEdit } = useCanPerform('gouvernance', 'edit');
  const { allowed: canDelete } = useCanPerform('gouvernance', 'delete');
  const { allowed: canView, loading: viewLoading } = useCanPerform('gouvernance', 'view');

  // ── functional-role picker ──
  const [roleNames, setRoleNames] = useState<string[]>(candidateRoles ?? []);
  const [filter, setFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Load the role list once when no candidates were supplied (best-effort).
  useEffect(() => {
    if (candidateRoles) {
      setRoleNames(candidateRoles);
      return;
    }
    let alive = true;
    getRoles()
      .then((r) => {
        if (alive) setRoleNames((r ?? []).map((x) => x.role).filter(Boolean));
      })
      .catch(() => {
        if (alive) setRoleNames([]);
      });
    return () => {
      alive = false;
    };
  }, [candidateRoles]);

  // The inspected role can never be granted into itself.
  const options = useMemo(
    () =>
      Array.from(new Set(roleNames))
        .filter((r) => r && r !== role)
        .sort((a, b) => a.localeCompare(b)),
    [roleNames, role],
  );

  const visible = useMemo(() => {
    const q = filter.trim().toUpperCase();
    return q ? options.filter((r) => r.toUpperCase().includes(q)) : options;
  }, [options, filter]);

  // ── least-privilege advisory (item 12, read-only) ──
  const [lp, setLp] = useState<LeastPrivilegeResult | null>(null);
  const [lpLoading, setLpLoading] = useState(false);
  const [lpError, setLpError] = useState(false);

  const loadLeastPrivilege = useCallback(async () => {
    if (!role || !canView) return;
    setLpLoading(true);
    setLpError(false);
    try {
      // Unlike posture.ts getters this wrapper rethrows — treat a throw AND
      // `available === false` alike as "undetermined" (render —).
      setLp(await getRoleLeastPrivilege(role));
    } catch {
      setLp(null);
      setLpError(true);
    } finally {
      setLpLoading(false);
    }
  }, [role, canView]);

  useEffect(() => {
    if (canView) void loadLeastPrivilege();
  }, [canView, loadLeastPrivilege]);

  // Defensive: the wrapper returns the backend payload as-is; tolerate a missing array.
  const unusedGrants = useMemo(() => lp?.unused_grants ?? [], [lp]);

  // ── bulk run state ──
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirm, setConfirm] = useState<{
    open: boolean;
    title: string;
    message: string;
    destructive: boolean;
    run: () => void;
  }>({ open: false, title: '', message: '', destructive: false, run: () => {} });

  const targets = useMemo(() => Array.from(selected), [selected]);
  const count = targets.length;

  const runBulk = useCallback(
    async (key: string, op: (target: string) => Promise<unknown>, verb: string) => {
      setBusy(key);
      setProgress({ done: 0, total: targets.length });
      const results: RowResult[] = [];
      for (const target of targets) {
        try {
          await op(target);
          results.push({ target, ok: true });
        } catch (e) {
          results.push({ target, ok: false, error: toServiceError(e, 'failed').message });
        }
        setProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
      }
      const okCount = results.filter((r) => r.ok).length;
      const failCount = results.length - okCount;
      if (failCount === 0) {
        toast.success(`✅ ${verb} succeeded for ${okCount} role${okCount === 1 ? '' : 's'}`);
      } else if (okCount > 0) {
        toast(
          `⚠️ ${verb}: ${okCount} succeeded, ${failCount} failed (${results
            .filter((r) => !r.ok)
            .map((r) => r.target)
            .join(', ')})`,
          { icon: '⚠️' },
        );
      } else {
        toast.error(`❌ ${verb} failed for all ${failCount} role${failCount === 1 ? '' : 's'}`);
      }
      setBusy(null);
      setProgress(null);
      // Granting/revoking R into a role widens/narrows every inheritor → re-gate.
      invalidateMyPermissions();
      setSelected(new Set());
      await onMutated?.();
    },
    [targets, onMutated],
  );

  const ask = (title: string, message: string, destructive: boolean, run: () => void) =>
    setConfirm({ open: true, title, message, destructive, run });

  const toggle = (r: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(r)) next.delete(r);
      else next.add(r);
      return next;
    });

  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r));
  const toggleAllVisible = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) visible.forEach((r) => next.delete(r));
      else visible.forEach((r) => next.add(r));
      return next;
    });

  const attachReason = !canEdit
    ? 'Requires governance edit permission'
    : count === 0
      ? 'Select at least one role'
      : '';
  const detachReason = !canDelete
    ? 'Requires governance delete permission'
    : count === 0
      ? 'Select at least one role'
      : '';

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
          Role inspector — <span className="font-mono">{role}</span>
        </h3>
      </div>

      {/* ── Least-privilege advisory (item 12) ── */}
      <section className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <Gauge className="h-3.5 w-3.5" /> Least-privilege advisory
        </div>

        {!canView && !viewLoading ? (
          <p className="text-xs text-slate-400">
            Requires governance view permission to see granted-but-unused privileges.
          </p>
        ) : lpLoading || viewLoading ? (
          <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Analyzing usage…
          </p>
        ) : lpError || !lp || lp.available === false ? (
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
            Usage analysis is unavailable for this role.
            {lp?.note ? <span className="text-slate-400"> {lp.note}</span> : null}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-4 text-xs text-slate-600 dark:text-slate-300">
              <span>
                Granted:{' '}
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {lp.granted_count ?? '—'}
                </span>
              </span>
              <span>
                Used:{' '}
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {lp.used_count ?? '—'}
                </span>
              </span>
              <span>
                Window:{' '}
                <span className="font-semibold text-slate-800 dark:text-slate-100">
                  {lp.window_days != null ? `${lp.window_days}d` : '—'}
                </span>
              </span>
            </div>
            {unusedGrants.length === 0 ? (
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                No granted-but-unused privileges detected. This role is well-scoped.
              </p>
            ) : (
              <div>
                <p className="mb-1.5 text-xs text-amber-700 dark:text-amber-400">
                  {unusedGrants.length} granted-but-unused privilege
                  {unusedGrants.length === 1 ? '' : 's'} — candidates to revoke.
                </p>
                <div className="overflow-hidden rounded-md border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
                      <tr>
                        <th className="px-2.5 py-1.5 font-medium">Privilege</th>
                        <th className="px-2.5 py-1.5 font-medium">Object</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {unusedGrants.map((g, i) => (
                        <tr key={`${g.object}-${g.privilege}-${i}`}>
                          <td className="px-2.5 py-1.5 font-medium text-slate-700 dark:text-slate-200">
                            {g.privilege || '—'}
                          </td>
                          <td className="px-2.5 py-1.5 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                            {g.object || '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Two-layer hierarchy builder (item 7) ── */}
      <section className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <Layers className="h-3.5 w-3.5" /> Grant <span className="font-mono normal-case">{role}</span>{' '}
          into functional roles
        </div>

        {/* search + select-all */}
        <div className="mb-2 flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              disabled={!!busy}
              placeholder="Filter functional roles…"
              aria-label="Filter functional roles"
              className="w-full rounded-md border border-slate-300 bg-white py-1.5 pl-8 pr-2 text-xs text-slate-700 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
            />
          </div>
          <button
            type="button"
            onClick={toggleAllVisible}
            disabled={!!busy || visible.length === 0}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            {allVisibleSelected ? 'Clear' : 'Select all'}
          </button>
        </div>

        {/* role checkbox list */}
        <div className="max-h-56 overflow-y-auto rounded-md border border-slate-200 dark:border-slate-800">
          {visible.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-400">
              {options.length === 0 ? 'No functional roles available.' : 'No roles match the filter.'}
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {visible.map((r) => (
                <li key={r}>
                  <label className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/60">
                    <input
                      type="checkbox"
                      checked={selected.has(r)}
                      onChange={() => toggle(r)}
                      disabled={!!busy}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span className="font-mono text-slate-700 dark:text-slate-200">{r}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* docked action bar — appears when ≥1 role is selected */}
        {count > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 dark:border-emerald-900/40 dark:bg-emerald-900/10">
            <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
              {count} role{count === 1 ? '' : 's'} selected
            </span>

            <div className="h-4 w-px bg-emerald-200 dark:bg-emerald-900/40" />

            {/* Attach */}
            <button
              type="button"
              disabled={!!busy || !!attachReason}
              title={attachReason || `Grant ${role} into ${count} role(s)`}
              onClick={() =>
                ask(
                  `Grant ${role} into ${count} role(s)`,
                  `Grant the access role "${role}" into ${count} functional role(s)? Members of each will inherit ${role}'s privileges.\n\n${targets.join(', ')}`,
                  false,
                  () => runBulk('attach', (t) => attachRole(role, t), `Attach "${role}"`),
                )
              }
              className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy === 'attach' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )}
              Attach
            </button>

            {/* Detach */}
            <button
              type="button"
              disabled={!!busy || !!detachReason}
              title={detachReason || `Detach ${role} from ${count} role(s)`}
              onClick={() =>
                ask(
                  `Detach ${role} from ${count} role(s)`,
                  `Detach the access role "${role}" from ${count} functional role(s)? Members of each will lose any privileges inherited through ${role}.\n\n${targets.join(', ')}`,
                  true,
                  () => runBulk('detach', (t) => detachRole(role, t), `Detach "${role}"`),
                )
              }
              className="inline-flex items-center gap-1.5 rounded-md border border-rose-300 bg-white px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-slate-800"
            >
              {busy === 'detach' ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldX className="h-3.5 w-3.5" />
              )}
              Detach
            </button>

            {progress && (
              <span className="text-xs text-emerald-800 dark:text-emerald-300">
                {progress.done}/{progress.total}…
              </span>
            )}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        confirmLabel="Confirm"
        destructive={confirm.destructive}
        onConfirm={() => {
          setConfirm((s) => ({ ...s, open: false }));
          confirm.run();
        }}
        onCancel={() => setConfirm((s) => ({ ...s, open: false }))}
      />
    </div>
  );
}
