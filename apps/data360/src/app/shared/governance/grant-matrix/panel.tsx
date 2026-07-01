'use client';

/**
 * Grant Matrix panel — role × privilege (action) GRANT MATRIX.
 *
 * Rows   = data-warehouse roles (GET /gouvernance/roles via fetch_roles.getRoles)
 * Cols   = distinct privileges/actions resolved from each role's object grants
 *          (GET /gouvernance/grants-for-role/{role} via getRolesForGrantsMatrix)
 * Cells  = granted/not (count badge) for that role × privilege.
 *
 * This is the OBJECT-level pivot — it complements (does not duplicate) the
 * "Role Grants" tab, which is the editable role × *module* matrix (updateGrants).
 * We never call updateGrants here (wrong axis: that replaces a role's module
 * list). Object-level mutation = gated revokePermission only.
 *
 * Test model (honest):
 *  - Per-row "Test"  → re-fetch the role's grants; pass on a 2xx that resolves
 *    the grant set (records the count); fail surfaces the error.
 *  - "Test all"      → Promise.allSettled tally across every role with per-role
 *    pass/fail kept visible in the row.
 *  - A role whose grants fetch REJECTS renders as an explicit error row — never
 *    as an all-ungranted row (that would be a dishonest fake-0).
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Badge, Button } from 'rizzui';
import {
  HiOutlineTableCells,
  HiOutlineShieldExclamation,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlineArrowPath,
  HiOutlineBeaker,
  HiOutlineChevronRight,
  HiOutlineChevronDown,
  HiOutlineTrash,
  HiOutlineShieldCheck,
  HiOutlineNoSymbol,
  HiOutlineXMark,
} from 'react-icons/hi2';
import { toast } from 'react-hot-toast';
import EmptyState from '@/components/ui/EmptyState';
import { GrantsMatrixSkeleton } from '@/components/ui/TableSkeleton';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getRoles } from '@/app/services/governance/fetch_roles';
import {
  getRolesForGrantsMatrix,
  grantPermission,
  revokePermission,
  type RoleGrant,
} from '@/app/services/governance/fetch_grants';
import { useCanPerform, invalidateMyPermissions } from '@/hooks/useCanPerform';

type TestState = { status: 'idle' | 'running' | 'pass' | 'fail'; message?: string; at?: number };

type MatrixRow = {
  role: string;
  status: 'loading' | 'ok' | 'error';
  grants: RoleGrant[];
  error?: string;
  test: TestState;
};

/** Preferred display order for the bounded privilege (action) axis. */
const PRIVILEGE_ORDER = [
  'OWNERSHIP',
  'ALL PRIVILEGES',
  'USAGE',
  'SELECT',
  'INSERT',
  'UPDATE',
  'DELETE',
  'TRUNCATE',
  'REFERENCES',
  'CREATE SCHEMA',
  'CREATE TABLE',
  'MONITOR',
  'OPERATE',
  'MODIFY',
  'APPLY',
];

/** Unit-separator joining object-type + object-name into one stable <select> value. */
const OBJ_SEP = '␟';

function extractErr(reason: unknown): string {
  const r = reason as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = r?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail) return JSON.stringify(detail);
  return r?.message || 'Request failed';
}

export default function GrantMatrixPanel() {
  // Object-level grant management is gated on the governance "delete" (revoke) action.
  const { allowed: canRevoke } = useCanPerform('gouvernance', 'delete');
  // Bulk grant/revoke a privilege across N roles (backlog §E 5 & 6) — BOTH on 'edit'
  // (the backlog explicitly classes the bulk revoke as 'edit', not 'delete').
  const { allowed: canEditPriv } = useCanPerform('gouvernance', 'edit');

  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [status, setStatus] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [testingAll, setTestingAll] = useState(false);
  const [summary, setSummary] = useState<{ pass: number; fail: number; at: number } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<{ role: string; grant: RoleGrant } | null>(null);
  const [revoking, setRevoking] = useState(false);

  // ---- Bulk privilege grant/revoke across selected roles (§E items 5 & 6) ----
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkPrivilege, setBulkPrivilege] = useState('');
  const [bulkObject, setBulkObject] = useState('');
  const [bulkBusy, setBulkBusy] = useState<'grant' | 'revoke' | null>(null);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkConfirm, setBulkConfirm] = useState<{ open: boolean; title: string; message: string; run: () => void }>({
    open: false,
    title: '',
    message: '',
    run: () => {},
  });

  const reload = useCallback(async () => {
    setStatus('loading');
    setLoadError(null);
    setSummary(null);
    setSelected(new Set());
    try {
      const roleList = await getRoles();
      const names = Array.from(
        new Set(roleList.map((r) => r.role).filter((n): n is string => Boolean(n))),
      ).sort();
      if (names.length === 0) {
        setRows([]);
        setStatus('loaded');
        return;
      }
      // Show the rows immediately in a loading state, then hydrate in parallel.
      setRows(names.map((role) => ({ role, status: 'loading', grants: [], test: { status: 'idle' } })));
      setStatus('loaded');

      const results = await Promise.allSettled(names.map((n) => getRolesForGrantsMatrix(n)));
      setRows((prev) =>
        prev.map((row, i) => {
          const res = results[i];
          if (res && res.status === 'fulfilled') {
            return { ...row, status: 'ok', grants: res.value, error: undefined };
          }
          // Rejected role → explicit error row, NOT an all-ungranted row.
          return { ...row, status: 'error', grants: [], error: extractErr(res?.reason) };
        }),
      );
    } catch (err) {
      setLoadError(extractErr(err));
      setRows([]);
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Bounded action axis = distinct privileges across all successfully-loaded roles.
  const privileges = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      if (row.status !== 'ok') continue;
      for (const g of row.grants) {
        if (g.privilege) set.add(g.privilege.toUpperCase());
      }
    }
    const all = Array.from(set);
    all.sort((a, b) => {
      const ia = PRIVILEGE_ORDER.indexOf(a);
      const ib = PRIVILEGE_ORDER.indexOf(b);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return a.localeCompare(b);
    });
    return all;
  }, [rows]);

  const countFor = useCallback(
    (row: MatrixRow, privilege: string) =>
      row.grants.filter((g) => (g.privilege || '').toUpperCase() === privilege).length,
    [],
  );

  /** Re-fetch a single role's grants. Returns the fresh set or throws. */
  const fetchRole = useCallback(async (role: string) => getRolesForGrantsMatrix(role), []);

  const testRow = useCallback(
    async (role: string) => {
      setRows((prev) => prev.map((r) => (r.role === role ? { ...r, test: { status: 'running' } } : r)));
      try {
        const grants = await fetchRole(role);
        setRows((prev) =>
          prev.map((r) =>
            r.role === role
              ? {
                  ...r,
                  status: 'ok',
                  grants,
                  error: undefined,
                  test: { status: 'pass', message: `${grants.length} grant${grants.length === 1 ? '' : 's'} resolved`, at: Date.now() },
                }
              : r,
          ),
        );
        return true;
      } catch (err) {
        const message = extractErr(err);
        setRows((prev) =>
          prev.map((r) => (r.role === role ? { ...r, test: { status: 'fail', message, at: Date.now() } } : r)),
        );
        return false;
      }
    },
    [fetchRole],
  );

  const testAll = useCallback(async () => {
    if (rows.length === 0) return;
    setTestingAll(true);
    setSummary(null);
    const names = rows.map((r) => r.role);
    setRows((prev) => prev.map((r) => ({ ...r, test: { status: 'running' } })));
    const results = await Promise.allSettled(names.map((n) => fetchRole(n)));
    // Tally synchronously from `results` — a functional setState updater is
    // deferred to the next render, so reading counters mutated inside it would
    // always observe 0. Keep the updater pure and count here.
    let pass = 0;
    let fail = 0;
    for (const res of results) {
      if (res.status === 'fulfilled') pass += 1;
      else fail += 1;
    }
    setRows((prev) =>
      prev.map((row, i) => {
        const res = results[i];
        if (res && res.status === 'fulfilled') {
          return {
            ...row,
            status: 'ok',
            grants: res.value,
            error: undefined,
            test: { status: 'pass', message: `${res.value.length} grant${res.value.length === 1 ? '' : 's'} resolved`, at: Date.now() },
          };
        }
        return { ...row, test: { status: 'fail', message: extractErr(res?.reason), at: Date.now() } };
      }),
    );
    setSummary({ pass, fail, at: Date.now() });
    setTestingAll(false);
  }, [rows, fetchRole]);

  const handleRevoke = useCallback(async () => {
    if (!revokeTarget) return;
    const { role, grant } = revokeTarget;
    setRevoking(true);
    try {
      await revokePermission([grant.privilege], grant.granted_on, grant.name, role);
      // A privilege change can alter the caller's own allow-set — refresh.
      invalidateMyPermissions();
      toast.success(`Revoked ${grant.privilege} on ${grant.granted_on} ${grant.name} from ${role}.`);
      setRevokeTarget(null);
      // Refresh just this role's grants so the matrix stays truthful.
      try {
        const grants = await fetchRole(role);
        setRows((prev) => prev.map((r) => (r.role === role ? { ...r, grants, status: 'ok' } : r)));
      } catch {
        /* non-fatal: the toast already confirmed; a full reload will reconcile */
      }
    } catch (err) {
      toast.error(extractErr(err));
      setRevokeTarget(null);
    } finally {
      setRevoking(false);
    }
  }, [revokeTarget, fetchRole]);

  // ---- Bulk privilege grant/revoke (§E 5 & 6) ----------------------------------
  // Selection is restricted to rows whose grants actually loaded ('ok'), because
  // the dry-run diff is computed from those grants — a role we couldn't read can't
  // be diffed honestly.
  const okRoleNames = useMemo(() => rows.filter((r) => r.status === 'ok').map((r) => r.role), [rows]);
  const allSelected = okRoleNames.length > 0 && okRoleNames.every((n) => selected.has(n));
  const someSelected = selected.size > 0 && !allSelected;

  const toggleRole = useCallback((role: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (okRoleNames.length > 0 && okRoleNames.every((n) => prev.has(n))) return new Set();
      return new Set(okRoleNames);
    });
  }, [okRoleNames]);

  // Object axis for the bulk composer = distinct (object_type, object_name) pairs
  // already present in the loaded matrix. Sourcing from real SHOW GRANTS rows keeps
  // every GRANT/REVOKE well-formed and makes the per-role diff computable. (Granting
  // a privilege/object that NO loaded role holds requires the backend batch+dry-run
  // route — §D-6 — which isn't live; that path is intentionally out of scope here.)
  const bulkObjects = useMemo(() => {
    const map = new Map<string, { key: string; type: string; name: string; label: string }>();
    for (const row of rows) {
      if (row.status !== 'ok') continue;
      for (const g of row.grants) {
        if (!g.granted_on || !g.name) continue; // both are required for a valid GRANT
        const type = g.granted_on.toUpperCase();
        const key = `${type}${OBJ_SEP}${g.name}`;
        if (!map.has(key)) map.set(key, { key, type, name: g.name, label: `${type} ${g.name}` });
      }
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  // Client-side dry-run: split the selected roles into those the change would
  // actually affect (the delta we loop over) vs. no-ops, from already-loaded grants.
  const bulkPreview = useMemo(() => {
    if (selected.size === 0 || !bulkPrivilege || !bulkObject) return null;
    const sepIdx = bulkObject.indexOf(OBJ_SEP);
    if (sepIdx === -1) return null;
    const objType = bulkObject.slice(0, sepIdx);
    const objName = bulkObject.slice(sepIdx + OBJ_SEP.length);
    const priv = bulkPrivilege.toUpperCase();
    const toGrant: string[] = []; // selected & missing → GRANT adds it
    const toRevoke: string[] = []; // selected & present → REVOKE removes it
    const skipped: string[] = []; // selected but grants not loaded (cannot diff)
    for (const role of selected) {
      const row = rows.find((r) => r.role === role);
      if (!row || row.status !== 'ok') {
        skipped.push(role);
        continue;
      }
      const holds = row.grants.some(
        (g) =>
          (g.privilege || '').toUpperCase() === priv &&
          (g.granted_on || '').toUpperCase() === objType &&
          g.name === objName,
      );
      if (holds) toRevoke.push(role);
      else toGrant.push(role);
    }
    return { objType, objName, priv, toGrant: toGrant.sort(), toRevoke: toRevoke.sort(), skipped: skipped.sort() };
  }, [selected, bulkPrivilege, bulkObject, rows]);

  const runBulkPrivilege = useCallback(
    async (mode: 'grant' | 'revoke') => {
      if (!bulkPreview) return;
      const { objType, objName, priv } = bulkPreview;
      const targets = mode === 'grant' ? bulkPreview.toGrant : bulkPreview.toRevoke;
      if (targets.length === 0) return;

      setBulkBusy(mode);
      setBulkProgress({ done: 0, total: targets.length });
      const results: { role: string; ok: boolean; error?: string }[] = [];
      // Snowflake applies one GRANT/REVOKE statement per role → loop, capture per row.
      for (const role of targets) {
        try {
          if (mode === 'grant') await grantPermission([priv], objType, objName, role);
          else await revokePermission([priv], objType, objName, role);
          results.push({ role, ok: true });
        } catch (err) {
          results.push({ role, ok: false, error: extractErr(err) });
        }
        setBulkProgress((p) => (p ? { ...p, done: p.done + 1 } : p));
      }

      const okCount = results.filter((r) => r.ok).length;
      const failCount = results.length - okCount;
      const verb = mode === 'grant' ? 'Granted' : 'Revoked';
      const noun = `${priv} on ${objType} ${objName}`;
      if (failCount === 0) {
        toast.success(`${verb} ${noun} for ${okCount} role${okCount === 1 ? '' : 's'}.`);
      } else if (okCount > 0) {
        toast(
          `${verb} ${noun}: ${okCount} succeeded, ${failCount} failed (${results
            .filter((r) => !r.ok)
            .map((r) => r.role)
            .join(', ')}).`,
          { icon: '⚠️' },
        );
      } else {
        toast.error(`${mode === 'grant' ? 'Grant' : 'Revoke'} failed for all ${failCount} role${failCount === 1 ? '' : 's'}.`);
      }
      // grantPermission/revokePermission already call invalidateMyPermissions() on each
      // successful statement, so the caller's allow-set is refreshed by the loop — no
      // extra invalidate needed here.

      setBulkBusy(null);
      setBulkProgress(null);
      setSelected(new Set());

      // Read-back: refresh just the touched roles so the matrix stays truthful.
      const touched = results.filter((r) => r.ok).map((r) => r.role);
      if (touched.length > 0) {
        const fresh = await Promise.allSettled(touched.map((n) => fetchRole(n)));
        setRows((prev) =>
          prev.map((row) => {
            const idx = touched.indexOf(row.role);
            if (idx === -1) return row;
            const res = fresh[idx];
            if (res && res.status === 'fulfilled') {
              return { ...row, grants: res.value, status: 'ok', error: undefined };
            }
            return row;
          }),
        );
      }
    },
    [bulkPreview, fetchRole],
  );

  const askBulk = (mode: 'grant' | 'revoke') => {
    if (!bulkPreview) return;
    const targets = mode === 'grant' ? bulkPreview.toGrant : bulkPreview.toRevoke;
    if (targets.length === 0) return;
    const verb = mode === 'grant' ? 'Grant' : 'Revoke';
    setBulkConfirm({
      open: true,
      title: `${verb} ${bulkPreview.priv} for ${targets.length} role${targets.length === 1 ? '' : 's'}?`,
      message:
        `This ${mode === 'grant' ? 'grants' : 'revokes'} ${bulkPreview.priv} on ${bulkPreview.objType} ${bulkPreview.objName} ` +
        `${mode === 'grant' ? 'to' : 'from'} ${targets.length} role${targets.length === 1 ? '' : 's'}: ${targets.join(', ')}. ` +
        `One statement is applied per role; you'll get a per-role result.`,
      run: () => void runBulkPrivilege(mode),
    });
  };

  const bulkEditReason = canEditPriv ? '' : 'Requires governance edit permission';

  return (
    <div role="tabpanel" id="tabpanel-grant-matrix" aria-labelledby="tab-grant-matrix" className="space-y-4">
      <div className="mb-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Grant Matrix</h2>
            <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400">
              <HiOutlineTableCells className="w-3 h-3 mr-1 inline" />
              Role × Privilege
            </Badge>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Object-level privileges granted to each role. Cells show how many objects each role holds a privilege on.
            Use <strong>Test</strong> to verify a role&apos;s grants resolve live, or <strong>Test all grants</strong> to sweep every role.
            Select roles to <strong>bulk grant or revoke</strong> a privilege across them — with a dry-run diff preview before applying.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => void reload()}
            disabled={status === 'loading' || testingAll || bulkBusy !== null}
            className="text-xs"
          >
            <HiOutlineArrowPath className={`w-4 h-4 mr-1.5 ${status === 'loading' ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            onClick={() => void testAll()}
            disabled={status !== 'loaded' || rows.length === 0 || testingAll || bulkBusy !== null}
            isLoading={testingAll}
            aria-busy={testingAll}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs"
          >
            <HiOutlineBeaker className="w-4 h-4 mr-1.5" />
            Test all grants
          </Button>
        </div>
      </div>

      {summary && (
        <div
          role="status"
          aria-live="polite"
          className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-sm text-indigo-800 dark:border-indigo-800/60 dark:bg-indigo-900/20 dark:text-indigo-300"
        >
          Tested {summary.pass + summary.fail} role{summary.pass + summary.fail === 1 ? '' : 's'}:{' '}
          <span className="font-semibold text-green-700 dark:text-green-400">{summary.pass} passed</span>
          {summary.fail > 0 && (
            <>
              {' · '}
              <span className="font-semibold text-red-700 dark:text-red-400">{summary.fail} failed</span>
            </>
          )}
          .
        </div>
      )}

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 dark:border-indigo-900/40 dark:bg-indigo-900/10">
          <span className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">
            {selected.size} role{selected.size === 1 ? '' : 's'} selected
          </span>
          <div className="h-5 w-px bg-indigo-200 dark:bg-indigo-900/40" />

          <select
            value={bulkPrivilege}
            onChange={(e) => setBulkPrivilege(e.target.value)}
            disabled={bulkBusy !== null}
            aria-label="Privilege to grant or revoke"
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          >
            <option value="">{privileges.length ? 'Select a privilege…' : 'No privileges available'}</option>
            {privileges.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <span className="text-xs text-gray-500 dark:text-gray-400">on</span>

          <select
            value={bulkObject}
            onChange={(e) => setBulkObject(e.target.value)}
            disabled={bulkBusy !== null}
            aria-label="Object to grant the privilege on"
            className="max-w-xs rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 disabled:opacity-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200"
          >
            <option value="">{bulkObjects.length ? 'Select an object…' : 'No objects available'}</option>
            {bulkObjects.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>

          <Button
            size="sm"
            disabled={bulkBusy !== null || !!bulkEditReason || !bulkPreview || bulkPreview.toGrant.length === 0}
            isLoading={bulkBusy === 'grant'}
            title={
              bulkEditReason ||
              (!bulkPreview
                ? 'Pick a privilege and an object'
                : bulkPreview.toGrant.length === 0
                  ? 'Every selected role already holds this privilege'
                  : `Grant ${bulkPreview.priv} to ${bulkPreview.toGrant.length} role(s)`)
            }
            onClick={() => askBulk('grant')}
            className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
          >
            <HiOutlineShieldCheck className="w-4 h-4 mr-1.5" />
            Grant{bulkPreview && bulkPreview.toGrant.length > 0 ? ` (${bulkPreview.toGrant.length})` : ''}
          </Button>

          <Button
            size="sm"
            variant="outline"
            disabled={bulkBusy !== null || !!bulkEditReason || !bulkPreview || bulkPreview.toRevoke.length === 0}
            isLoading={bulkBusy === 'revoke'}
            title={
              bulkEditReason ||
              (!bulkPreview
                ? 'Pick a privilege and an object'
                : bulkPreview.toRevoke.length === 0
                  ? 'No selected role holds this privilege'
                  : `Revoke ${bulkPreview.priv} from ${bulkPreview.toRevoke.length} role(s)`)
            }
            onClick={() => askBulk('revoke')}
            className="border-rose-300 text-rose-700 hover:bg-rose-50 text-xs dark:text-rose-300"
          >
            <HiOutlineNoSymbol className="w-4 h-4 mr-1.5" />
            Revoke{bulkPreview && bulkPreview.toRevoke.length > 0 ? ` (${bulkPreview.toRevoke.length})` : ''}
          </Button>

          <button
            type="button"
            onClick={() => setSelected(new Set())}
            disabled={bulkBusy !== null}
            className="ml-1 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <HiOutlineXMark className="w-4 h-4" />
            Clear
          </button>

          <div className="w-full" aria-live="polite">
            {!canEditPriv ? (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Granting or revoking privileges requires the governance &quot;edit&quot; permission.
              </p>
            ) : bulkProgress ? (
              <p className="text-xs text-indigo-700 dark:text-indigo-300">
                Applying… {bulkProgress.done}/{bulkProgress.total}
              </p>
            ) : !bulkPrivilege || !bulkObject ? (
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Pick a privilege and an object to preview the change set across the {selected.size} selected role
                {selected.size === 1 ? '' : 's'} before applying.
              </p>
            ) : bulkPreview ? (
              <p className="text-xs text-gray-600 dark:text-gray-300">
                <span className="font-medium">Diff preview</span> — {bulkPreview.priv} on {bulkPreview.objType}{' '}
                {bulkPreview.objName}:{' '}
                <span className="text-emerald-700 dark:text-emerald-400">
                  {bulkPreview.toGrant.length} missing (grant adds)
                </span>
                {' · '}
                <span className="text-rose-700 dark:text-rose-400">
                  {bulkPreview.toRevoke.length} present (revoke removes)
                </span>
                {bulkPreview.skipped.length > 0 && (
                  <>
                    {' · '}
                    <span className="text-gray-400">{bulkPreview.skipped.length} skipped (grants not loaded)</span>
                  </>
                )}
                .
              </p>
            ) : null}
          </div>
        </div>
      )}

      {status === 'loading' || status === 'idle' ? (
        <GrantsMatrixSkeleton />
      ) : status === 'error' ? (
        <EmptyState
          icon={HiOutlineShieldExclamation}
          title="Couldn't load the grant matrix"
          description={loadError ?? 'The roles service is unavailable. Try again shortly.'}
          action={
            <Button size="sm" variant="outline" onClick={() => void reload()}>
              Retry
            </Button>
          }
        />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={HiOutlineTableCells}
          title="No roles found"
          description="No data-warehouse roles are available to build the grant matrix."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="sticky left-0 z-10 bg-gray-50 dark:bg-gray-800 text-left px-4 py-3 text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleAll}
                      disabled={okRoleNames.length === 0 || bulkBusy !== null}
                      aria-label="Select all loaded roles for bulk grant or revoke"
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-40 dark:border-gray-600 dark:bg-gray-700"
                    />
                    Role
                  </div>
                </th>
                {privileges.map((p) => (
                  <th
                    key={p}
                    className="px-3 py-3 text-center text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 whitespace-nowrap"
                    title={p}
                  >
                    {p}
                  </th>
                ))}
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                  Test
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {rows.map((row) => {
                const isExpanded = expanded === row.role;
                const revocable = row.grants.filter((g) => g.revocable);
                return (
                  <Fragment key={row.role}>
                    <tr className="hover:bg-gray-50 dark:hover:bg-gray-800">
                      <td className="sticky left-0 z-10 bg-white dark:bg-gray-900 px-4 py-2.5 font-medium text-gray-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selected.has(row.role)}
                            onChange={() => toggleRole(row.role)}
                            disabled={row.status !== 'ok' || bulkBusy !== null}
                            aria-label={`Select role ${row.role} for bulk grant or revoke`}
                            title={row.status !== 'ok' ? 'Grants not loaded — cannot bulk-operate this role' : undefined}
                            className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 disabled:opacity-40 dark:border-gray-600 dark:bg-gray-700"
                          />
                          <button
                            type="button"
                            onClick={() => setExpanded(isExpanded ? null : row.role)}
                            className="inline-flex items-center gap-1.5 hover:text-indigo-600 dark:hover:text-indigo-400"
                            aria-expanded={isExpanded}
                            aria-label={`Toggle grant detail for ${row.role}`}
                          >
                            {isExpanded ? (
                              <HiOutlineChevronDown className="w-4 h-4" />
                            ) : (
                              <HiOutlineChevronRight className="w-4 h-4" />
                            )}
                            {row.role}
                          </button>
                        </div>
                      </td>

                      {row.status === 'loading' ? (
                        <td colSpan={privileges.length || 1} className="px-3 py-2.5 text-center text-xs italic text-gray-400">
                          Loading grants…
                        </td>
                      ) : row.status === 'error' ? (
                        <td colSpan={privileges.length || 1} className="px-3 py-2.5 text-center">
                          <span className="inline-flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                            <HiOutlineXCircle className="w-4 h-4" />
                            Couldn&apos;t load grants — {row.error}
                          </span>
                        </td>
                      ) : (
                        privileges.map((p) => {
                          const n = countFor(row, p);
                          return (
                            <td key={p} className="px-3 py-2.5 text-center">
                              {n > 0 ? (
                                <Badge
                                  className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px]"
                                  title={`${row.role} holds ${p} on ${n} object${n === 1 ? '' : 's'}`}
                                >
                                  {n}
                                </Badge>
                              ) : (
                                <span className="text-gray-300 dark:text-gray-600" title="Not granted">
                                  —
                                </span>
                              )}
                            </td>
                          );
                        })
                      )}

                      <td className="px-4 py-2.5 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-2">
                          {row.test.status === 'pass' && (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] text-green-600 dark:text-green-400"
                              title={row.test.message}
                            >
                              <HiOutlineCheckCircle className="w-4 h-4" />
                              Pass
                            </span>
                          )}
                          {row.test.status === 'fail' && (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] text-red-600 dark:text-red-400"
                              title={row.test.message}
                            >
                              <HiOutlineXCircle className="w-4 h-4" />
                              Fail
                            </span>
                          )}
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-xs"
                            disabled={row.test.status === 'running' || testingAll}
                            isLoading={row.test.status === 'running'}
                            onClick={() => void testRow(row.role)}
                          >
                            Test
                          </Button>
                        </div>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr className="bg-gray-50/60 dark:bg-gray-800/40">
                        <td colSpan={privileges.length + 2} className="px-4 py-3">
                          {row.status === 'error' ? (
                            <p className="text-xs text-red-600 dark:text-red-400">
                              Grants for this role could not be loaded — {row.error}
                            </p>
                          ) : row.grants.length === 0 ? (
                            <p className="text-xs italic text-gray-400">This role holds no object-level grants.</p>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-[11px] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                                {row.grants.length} grant{row.grants.length === 1 ? '' : 's'}
                                {!canRevoke && revocable.length > 0 && (
                                  <span className="ml-2 normal-case font-normal text-gray-400">
                                    (revoke requires the governance &quot;delete&quot; permission)
                                  </span>
                                )}
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {row.grants.map((g, i) => (
                                  <span
                                    key={`${g.privilege}-${g.granted_on}-${g.name}-${i}`}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] dark:border-gray-700 dark:bg-gray-900"
                                  >
                                    <span className="font-medium text-gray-900 dark:text-white">{g.privilege || '—'}</span>
                                    <span className="text-gray-400">on</span>
                                    <span className="text-gray-600 dark:text-gray-300">
                                      {g.granted_on || '—'} {g.name}
                                    </span>
                                    {canRevoke && g.revocable && (
                                      <button
                                        type="button"
                                        onClick={() => setRevokeTarget({ role: row.role, grant: g })}
                                        title={`Revoke ${g.privilege} on ${g.granted_on} ${g.name}`}
                                        aria-label={`Revoke ${g.privilege} on ${g.granted_on} ${g.name} from ${row.role}`}
                                        className="ml-0.5 text-red-500 hover:text-red-700 dark:hover:text-red-400"
                                      >
                                        <HiOutlineTrash className="w-3.5 h-3.5" />
                                      </button>
                                    )}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={revokeTarget !== null}
        title="Revoke privilege?"
        message={
          revokeTarget
            ? `This revokes ${revokeTarget.grant.privilege} on ${revokeTarget.grant.granted_on} ${revokeTarget.grant.name} from role "${revokeTarget.role}". The role loses this access immediately.`
            : ''
        }
        confirmLabel={revoking ? 'Revoking…' : 'Revoke'}
        destructive
        onConfirm={() => void handleRevoke()}
        onCancel={() => {
          if (!revoking) setRevokeTarget(null);
        }}
      />

      <ConfirmDialog
        open={bulkConfirm.open}
        title={bulkConfirm.title}
        message={bulkConfirm.message}
        confirmLabel="Apply"
        destructive
        onConfirm={() => {
          setBulkConfirm((s) => ({ ...s, open: false }));
          bulkConfirm.run();
        }}
        onCancel={() => {
          if (bulkBusy === null) setBulkConfirm((s) => ({ ...s, open: false }));
        }}
      />
    </div>
  );
}
