'use client';

/**
 * OrgSummaryTab — Account-overview headline surface.
 *
 * Renders org activity rolled up role → module/project → account from
 * GET /org-accounts/org-summary. Self-contained: owns its OWN date-range and
 * role/module/account filters (it does NOT consume the parent shell's global
 * filter bar), and refetches when they change.
 *
 * Honest-gating:
 *   - The route is NEW. Backends that predate it return 404 → we show a clear
 *     "Not available on this backend yet" state, never fabricated data.
 *   - 403 → an honest "insufficient role" state.
 *   - Empty leaves render "—", not 0.
 *
 * Filter options (role / module / account) are derived once from an
 * unfiltered baseline fetch and cached, so applying a filter (which narrows
 * the tree) never collapses the dropdowns to a single option.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Layers,
  ChevronRight,
  ChevronsUpDown,
  Calendar,
  Filter,
  RefreshCw,
  Users,
  CheckCircle2,
  XCircle,
  ShieldX,
  Activity,
  Percent,
  PlugZap,
  Lock,
  AlertTriangle,
  Database,
} from 'lucide-react';
import { getOrgSummary } from '@/app/services/org-accounts/hooks';
import { getRoleHierarchy } from '@/app/services/command-center';
import type {
  OrgSummaryResponse,
  OrgSummaryParams,
  OrgSummaryTotals,
  OrgSummaryRole,
  OrgSummaryModule,
  OrgSummaryAccount,
} from '@/app/services/org-accounts/types';
import EmptyState from '@/components/ui/EmptyState';
import { InsightActionButton } from '@/app/shared/insights';
import AuditTable, { type Row } from './AuditTable';

// ── Date / filter control state ──────────────────────────────────────────────

type RangeMode = 'rolling' | 'explicit';
const PRESET_DAYS = [7, 30, 90] as const;

interface Controls {
  mode: RangeMode;
  days: number;
  from: string;
  to: string;
  role: string;
  module: string;
  account: string;
  username: string;
  project_id: string;
}

const DEFAULT_CONTROLS: Controls = {
  mode: 'rolling',
  days: 30,
  from: '',
  to: '',
  role: '',
  module: '',
  account: '',
  username: '',
  project_id: '',
};

function controlsToParams(c: Controls): OrgSummaryParams {
  const base: OrgSummaryParams =
    c.mode === 'explicit' && c.from && c.to
      ? { from: c.from, to: c.to }
      : { days: c.days };
  return {
    ...base,
    role: c.role || undefined,
    module: c.module || undefined,
    account: c.account || undefined,
    username: c.username || undefined,
    project_id: c.project_id || undefined,
  };
}

// ── Number formatting (never fake — "—" for empty) ───────────────────────────

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return n.toLocaleString();
}

/** A leaf/branch with all-zero (or absent) activity renders "—", not 0. */
function cell(n: number | null | undefined): string {
  return typeof n === 'number' && n > 0 ? n.toLocaleString() : '—';
}

/** Percentage of `numer` over `denom`, rounded; null when there is no traffic. */
function rate(numer: number, denom: number): number | null {
  return denom > 0 ? Math.round((numer / denom) * 100) : null;
}

const EMPTY_TOTALS: OrgSummaryTotals = {
  requests: 0,
  success: 0,
  failed: 0,
  denied: 0,
  distinct_users: 0,
};

/**
 * Flatten role → module/project → account into ONE row per leaf for the bottom
 * audit table. Rows only exist when `roles` is populated, so the numeric counts
 * are real measured values (not fabricated). A module that reports totals but
 * carries no per-account breakdown contributes a single fallback row so the
 * matrix stays lossless. success_rate / denial_rate render "—" when there is no
 * traffic (never a fake 0%).
 */
function buildMatrixRows(data: OrgSummaryResponse | null): Row[] {
  if (!data?.roles?.length) return [];
  const pct = (n: number, d: number) => (d > 0 ? `${Math.round((n / d) * 100)}%` : '—');
  const rows: Row[] = [];
  for (const role of data.roles) {
    for (const m of role.modules ?? []) {
      const accounts = m.accounts ?? [];
      const leaves: OrgSummaryAccount[] =
        accounts.length > 0
          ? accounts
          : [{ ...(m.totals ?? EMPTY_TOTALS), account: '—' }];
      for (const a of leaves) {
        const reqs = a.requests ?? 0;
        rows.push({
          role: role.role || '—',
          module: m.module || '—',
          project: m.project_id ?? '—',
          account: a.account || '—',
          requests: reqs,
          success: a.success ?? 0,
          failed: a.failed ?? 0,
          denied: a.denied ?? 0,
          distinct_users: a.distinct_users ?? 0,
          success_rate: pct(a.success ?? 0, reqs),
          denial_rate: pct(a.denied ?? 0, reqs),
        });
      }
    }
  }
  return rows;
}

/**
 * Read an explicit provisioning hint from the response `meta`, if the backend
 * carries one. Returns true (provisioned), false (not provisioned), or null
 * (unknown — caller falls back to the no-filters heuristic).
 */
function readProvisioned(meta: Record<string, unknown> | undefined): boolean | null {
  if (!meta) return null;
  for (const k of [
    'provisioned',
    'is_provisioned',
    'activity_store_provisioned',
    'spine_provisioned',
    'event_store_provisioned',
  ]) {
    if (typeof meta[k] === 'boolean') return meta[k] as boolean;
  }
  for (const k of ['not_provisioned', 'unprovisioned', 'activity_store_missing', 'spine_missing']) {
    if (typeof meta[k] === 'boolean') return !(meta[k] as boolean);
  }
  return null;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function OrgSummaryTab() {
  const [controls, setControls] = useState<Controls>(DEFAULT_CONTROLS);
  const [data, setData] = useState<OrgSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<
    'ok' | 'not-deployed' | 'forbidden' | 'error'
  >('ok');
  const [errorMsg, setErrorMsg] = useState('');

  // Filter options derived from the FIRST successful (unfiltered) fetch and
  // cached, so narrowing the tree never shrinks the dropdown choices.
  const optionsRef = useRef<{
    roles: string[];
    modules: string[];
    accounts: string[];
  }>({ roles: [], modules: [], accounts: [] });
  const [, forceOptions] = useState(0);

  // Role hierarchy (governance SHOW ROLES) — independent of the activity spine,
  // so it populates even when org-summary is empty. Resilient: getRoleHierarchy
  // swallows its own errors and degrades to [].
  const [roleHierarchy, setRoleHierarchy] = useState<Row[]>([]);
  useEffect(() => {
    let active = true;
    void getRoleHierarchy()
      .then((r) => {
        if (active) setRoleHierarchy((r?.data ?? []) as Row[]);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const fetchSummary = useCallback(async (c: Controls) => {
    setLoading(true);
    setStatus('ok');
    setErrorMsg('');
    try {
      const res = await getOrgSummary(controlsToParams(c));
      setData(res);
      // Seed the option lists only when this is an unfiltered fetch (so we
      // capture the full universe of roles/modules/accounts once).
      const noFilters =
        !c.role && !c.module && !c.account && !c.username && !c.project_id;
      if (noFilters) {
        const roles = new Set<string>();
        const modules = new Set<string>();
        const accounts = new Set<string>();
        for (const r of res.roles ?? []) {
          if (r.role) roles.add(r.role);
          for (const m of r.modules ?? []) {
            if (m.module) modules.add(m.module);
            for (const a of m.accounts ?? []) {
              if (a.account) accounts.add(a.account);
            }
          }
        }
        optionsRef.current = {
          roles: [...roles].sort(),
          modules: [...modules].sort(),
          accounts: [...accounts].sort(),
        };
        forceOptions((n) => n + 1);
      }
    } catch (err: unknown) {
      const e = err as {
        response?: { status?: number; data?: { detail?: unknown } };
        message?: string;
      };
      const httpStatus = e?.response?.status;
      if (httpStatus === 404) {
        setStatus('not-deployed');
      } else if (httpStatus === 403) {
        setStatus('forbidden');
      } else {
        setStatus('error');
        const detail = e?.response?.data?.detail;
        setErrorMsg(
          (typeof detail === 'string'
            ? detail
            : (detail as { message?: string })?.message) ??
            e?.message ??
            'Failed to load org summary.'
        );
      }
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refetch whenever the resolved query params change.
  const paramsKey = useMemo(
    () => JSON.stringify(controlsToParams(controls)),
    [controls]
  );
  useEffect(() => {
    void fetchSummary(controls);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paramsKey]);

  const opts = optionsRef.current;

  // Flat role × module × account leaves for the bottom audit table.
  const matrixRows = useMemo(() => buildMatrixRows(data), [data]);

  // Honest empty-state cause split. An empty result with NO filters applied (or
  // an explicit meta hint) means the activity spine isn't provisioned — distinct
  // from a genuinely-narrowed window/filter combination that returned nothing.
  const noFilters =
    !controls.role &&
    !controls.module &&
    !controls.account &&
    !controls.username &&
    !controls.project_id;
  const provisioned = readProvisioned(data?.meta);
  const notProvisioned = provisioned === false || (provisioned === null && noFilters);

  // Expand/collapse-all broadcast for the role tree. Roles render COLLAPSED by
  // default; pressing the toggle pushes a new signal that every RoleNode syncs
  // to, while leaving per-row toggling intact between broadcasts.
  const [allExpanded, setAllExpanded] = useState(false);
  const [expandSignal, setExpandSignal] = useState<{
    open: boolean;
    n: number;
  } | null>(null);
  const toggleAll = () => {
    const next = !allExpanded;
    setAllExpanded(next);
    setExpandSignal({ open: next, n: Date.now() });
  };

  return (
    <div className="space-y-5">
      {/* ── Header + date/filter controls ──────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600/10 dark:bg-indigo-400/10">
              <Layers className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Org Summary
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Activity rolled up by role, then module / project, then account.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void fetchSummary(controls)}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`}
            />
            Refresh
          </button>
        </div>

        {/* Date range */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Calendar className="h-4 w-4" />
            <span>Date range</span>
          </div>
          <div className="inline-flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
            {PRESET_DAYS.map((d) => {
              const active = controls.mode === 'rolling' && controls.days === d;
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() =>
                    setControls((c) => ({ ...c, mode: 'rolling', days: d }))
                  }
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                    active
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
                  }`}
                  aria-pressed={active}
                >
                  {d}d
                </button>
              );
            })}
          </div>

          {/* Custom from/to */}
          <div
            className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 ${
              controls.mode === 'explicit'
                ? 'border-indigo-300 dark:border-indigo-700'
                : 'border-slate-200 dark:border-slate-700'
            }`}
          >
            <label className="sr-only" htmlFor="org-summary-from">
              From date
            </label>
            <input
              id="org-summary-from"
              type="date"
              value={controls.from}
              max={controls.to || undefined}
              onChange={(e) =>
                setControls((c) => ({
                  ...c,
                  from: e.target.value,
                  mode: e.target.value && c.to ? 'explicit' : c.mode,
                }))
              }
              className="bg-transparent text-xs text-slate-700 outline-none dark:text-slate-200 [color-scheme:light] dark:[color-scheme:dark]"
            />
            <span className="text-slate-400">→</span>
            <label className="sr-only" htmlFor="org-summary-to">
              To date
            </label>
            <input
              id="org-summary-to"
              type="date"
              value={controls.to}
              min={controls.from || undefined}
              onChange={(e) =>
                setControls((c) => ({
                  ...c,
                  to: e.target.value,
                  mode: c.from && e.target.value ? 'explicit' : c.mode,
                }))
              }
              className="bg-transparent text-xs text-slate-700 outline-none dark:text-slate-200 [color-scheme:light] dark:[color-scheme:dark]"
            />
            {controls.mode === 'explicit' && (
              <button
                type="button"
                onClick={() =>
                  setControls((c) => ({
                    ...c,
                    mode: 'rolling',
                    from: '',
                    to: '',
                  }))
                }
                className="ml-1 rounded px-1 text-[11px] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                title="Clear custom range"
              >
                clear
              </button>
            )}
          </div>
        </div>

        {/* Filter dropdowns */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
            <Filter className="h-4 w-4" />
            <span>Filters</span>
          </div>
          <FilterSelect
            label="Role"
            value={controls.role}
            options={opts.roles}
            onChange={(v) => setControls((c) => ({ ...c, role: v }))}
          />
          <FilterSelect
            label="Module"
            value={controls.module}
            options={opts.modules}
            onChange={(v) => setControls((c) => ({ ...c, module: v }))}
          />
          <FilterSelect
            label="Account"
            value={controls.account}
            options={opts.accounts}
            onChange={(v) => setControls((c) => ({ ...c, account: v }))}
          />
          <FilterText
            label="User"
            value={controls.username}
            placeholder="username"
            onCommit={(v) => setControls((c) => ({ ...c, username: v }))}
          />
          <FilterText
            label="Project"
            value={controls.project_id}
            placeholder="project_id"
            onCommit={(v) => setControls((c) => ({ ...c, project_id: v }))}
          />
          {(controls.role ||
            controls.module ||
            controls.account ||
            controls.username ||
            controls.project_id) && (
            <button
              type="button"
              onClick={() =>
                setControls((c) => ({
                  ...c,
                  role: '',
                  module: '',
                  account: '',
                  username: '',
                  project_id: '',
                }))
              }
              className="rounded-md px-2 py-1 text-[11px] text-slate-500 underline-offset-2 hover:text-slate-800 hover:underline dark:text-slate-400 dark:hover:text-slate-200"
            >
              Clear filters
            </button>
          )}
        </div>

        {/* Resolved date_range + filters_applied — shown honestly from the
            backend echo so the user sees exactly what was queried. */}
        {data && (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-slate-100 pt-3 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <span>
              Window:{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {data.date_range.mode === 'explicit'
                  ? `${data.date_range.from ?? '—'} → ${data.date_range.to ?? '—'}`
                  : `last ${data.date_range.days ?? '—'} days`}
              </span>
            </span>
            <AppliedFilter k="role" v={data.filters_applied.role} />
            <AppliedFilter k="module" v={data.filters_applied.module} />
            <AppliedFilter k="account" v={data.filters_applied.account} />
            <AppliedFilter k="user" v={data.filters_applied.username} />
            <AppliedFilter k="project" v={data.filters_applied.project_id} />
            {typeof data.execution_time_ms === 'number' && (
              <span className="ml-auto tabular-nums text-slate-400">
                {Math.round(data.execution_time_ms)} ms
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Body ───────────────────────────────────────────────────── */}
      {loading && !data ? (
        <LoadingTree />
      ) : status === 'not-deployed' ? (
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <EmptyState
            icon={PlugZap}
            title="Not available on this backend yet"
            description="The org-summary endpoint (GET /org-accounts/org-summary) isn't deployed on this environment. Once it ships, this view will populate automatically — no data is shown until then."
          />
        </div>
      ) : status === 'forbidden' ? (
        <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <EmptyState
            icon={Lock}
            title="Insufficient role"
            description="Your current role can't read the org-wide activity summary. Switch to an admin role to view it."
          />
        </div>
      ) : status === 'error' ? (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/30"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
          <div>
            <p className="text-sm font-medium text-red-700 dark:text-red-300">
              Couldn't load the org summary
            </p>
            <p className="text-xs text-red-600 dark:text-red-400">{errorMsg}</p>
            <button
              type="button"
              onClick={() => void fetchSummary(controls)}
              className="mt-2 inline-flex items-center rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      ) : data && (data.roles?.length ?? 0) > 0 ? (
        <>
          <TotalsStrip totals={data.totals} />
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {data.roles.length} role{data.roles.length === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              onClick={toggleAll}
              aria-expanded={allExpanded}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <ChevronsUpDown className="h-3.5 w-3.5" />
              {allExpanded ? 'Collapse all' : 'Expand all'}
            </button>
          </div>
          <div className="space-y-2.5">
            {data.roles.map((role) => (
              <RoleNode
                key={role.role}
                role={role}
                expandSignal={expandSignal}
              />
            ))}
          </div>

          {/* ── Audit & detail (full-width, paginated, at the bottom) ──── */}
          <AuditTable
            rows={matrixRows}
            title="Activity by role × module × account"
            subtitle="EVENT_STORE.USER_REQUESTS"
            pageSize={10}
          />
          {roleHierarchy.length > 0 && (
            <AuditTable
              rows={roleHierarchy}
              title="Role hierarchy"
              subtitle="SHOW ROLES"
              pageSize={10}
            />
          )}
        </>
      ) : (
        <>
          <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
            {/* Only show measured totals for a genuinely-narrowed window. When the
                spine isn't provisioned the totals are structural 0s — suppress the
                strip rather than paint a 0/0/0/0 dashboard. */}
            {data && !notProvisioned && (
              <TotalsStrip totals={data.totals} embedded />
            )}
            {notProvisioned ? (
              <EmptyState
                icon={Database}
                title="Activity store not provisioned yet"
                description="The org activity spine (EVENT_STORE.USER_REQUESTS) hasn't been provisioned or backfilled on this environment yet. Once the activity store is installed, this view populates automatically — no events are fabricated until then."
              />
            ) : (
              <EmptyState
                icon={Activity}
                title="No activity in this window"
                description="No events matched the selected date range and filters. Widen the window or clear filters."
              />
            )}
          </div>
          {/* Role hierarchy comes from a different source (SHOW ROLES), so it can
              populate even while the activity spine is empty. */}
          {roleHierarchy.length > 0 && (
            <AuditTable
              rows={roleHierarchy}
              title="Role hierarchy"
              subtitle="SHOW ROLES"
              pageSize={10}
            />
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-xs font-medium text-slate-700 outline-none dark:text-slate-200"
        disabled={options.length === 0}
      >
        <option value="">All</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function FilterText({
  label,
  value,
  placeholder,
  onCommit,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onCommit: (v: string) => void;
}) {
  // Keep a local draft so a free-text filter only refetches on Enter/blur,
  // never on every keystroke. Re-sync when the committed value changes
  // externally (e.g. "Clear filters").
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    setDraft(value);
  }, [value]);
  const commit = () => {
    const next = draft.trim();
    if (next !== value) onCommit(next);
  };
  return (
    <label className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <input
        type="text"
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
          }
        }}
        className="w-24 bg-transparent text-xs font-medium text-slate-700 outline-none placeholder:text-slate-400 dark:text-slate-200"
      />
    </label>
  );
}

function AppliedFilter({ k, v }: { k: string; v: string | null }) {
  if (!v) return null;
  return (
    <span>
      {k}:{' '}
      <span className="font-medium text-slate-700 dark:text-slate-300">{v}</span>
    </span>
  );
}

const METRICS: Array<{
  key: keyof OrgSummaryTotals;
  label: string;
  icon: React.ElementType;
  tone: string;
}> = [
  { key: 'requests', label: 'Requests', icon: Activity, tone: 'text-slate-500' },
  { key: 'success', label: 'Success', icon: CheckCircle2, tone: 'text-emerald-500' },
  { key: 'failed', label: 'Failed', icon: XCircle, tone: 'text-amber-500' },
  { key: 'denied', label: 'Denied', icon: ShieldX, tone: 'text-rose-500' },
  { key: 'distinct_users', label: 'Distinct users', icon: Users, tone: 'text-indigo-500' },
];

function TotalsStrip({
  totals,
  embedded = false,
}: {
  totals: OrgSummaryTotals;
  embedded?: boolean;
}) {
  const successRate = rate(totals?.success ?? 0, totals?.requests ?? 0);
  return (
    <div
      className={
        embedded
          ? 'grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 lg:grid-cols-6'
          : 'grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6'
      }
    >
      {METRICS.map(({ key, label, icon: Icon, tone }) => (
        <div
          key={key}
          className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-center gap-1.5">
            <Icon className={`h-3.5 w-3.5 ${tone}`} />
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {label}
            </span>
          </div>
          <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-white">
            {fmt(totals?.[key])}
          </p>
        </div>
      ))}
      {/* Derived: success rate over the window (success / requests). */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-1.5">
          <Percent className="h-3.5 w-3.5 text-emerald-500" />
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Success rate
          </span>
        </div>
        <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 dark:text-white">
          {successRate === null ? '—' : `${successRate}%`}
        </p>
      </div>
    </div>
  );
}

/** Compact inline counters used on every tree row. */
function Counts({ totals: t }: { totals: OrgSummaryTotals | undefined }) {
  const totals = t ?? EMPTY_TOTALS;
  const successRate = rate(totals.success, totals.requests);
  const denialRate = rate(totals.denied, totals.requests);
  return (
    <div className="flex shrink-0 items-center gap-3 text-xs tabular-nums">
      {/* Derived per-row health: success rate + denial-rate badge. */}
      {successRate !== null && (
        <span
          className="hidden items-center font-medium text-emerald-600 dark:text-emerald-400 sm:inline-flex"
          title="Success rate"
        >
          {successRate}%
        </span>
      )}
      {denialRate !== null && denialRate > 0 && (
        <span
          className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700 dark:bg-rose-900/40 dark:text-rose-300"
          title="Denial rate"
        >
          {denialRate}% denied
        </span>
      )}
      <span className="text-slate-700 dark:text-slate-300" title="Requests">
        {cell(totals.requests)}
      </span>
      <span className="text-emerald-600 dark:text-emerald-400" title="Success">
        {cell(totals.success)}
      </span>
      <span className="text-amber-600 dark:text-amber-400" title="Failed">
        {cell(totals.failed)}
      </span>
      <span className="text-rose-600 dark:text-rose-400" title="Denied">
        {cell(totals.denied)}
      </span>
      <span
        className="flex items-center gap-0.5 text-indigo-600 dark:text-indigo-400"
        title="Distinct users"
      >
        <Users className="h-3 w-3" />
        {cell(totals.distinct_users)}
      </span>
    </div>
  );
}

function RoleNode({
  role,
  expandSignal,
}: {
  role: OrgSummaryRole;
  expandSignal: { open: boolean; n: number } | null;
}) {
  // Collapsed by default; re-sync whenever the parent broadcasts expand/collapse
  // all. Between broadcasts the row keeps its own open/closed state.
  const [open, setOpen] = useState(false);
  const router = useRouter();
  useEffect(() => {
    if (expandSignal) setOpen(expandSignal.open);
  }, [expandSignal]);
  // High denial rate is an actionable governance signal — surface a CTA to
  // review this role's grants. Rendered OUTSIDE the toggle button (no nesting).
  const denialRate = rate(role.totals?.denied ?? 0, role.totals?.requests ?? 0);
  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
      >
        <ChevronRight
          className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${
            open ? 'rotate-90' : ''
          }`}
        />
        <span className="flex-1 truncate text-sm font-semibold text-slate-900 dark:text-white">
          {role.role || '—'}
        </span>
        <span className="hidden shrink-0 text-[11px] text-slate-400 sm:inline">
          {role.modules?.length ?? 0} module
          {(role.modules?.length ?? 0) === 1 ? '' : 's'}
        </span>
        <Counts totals={role.totals} />
      </button>
      {denialRate !== null && denialRate > 10 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-rose-100 bg-rose-50/50 px-3 py-2 dark:border-rose-900/30 dark:bg-rose-900/10">
          <span className="text-[11px] text-rose-700 dark:text-rose-300">
            {denialRate}% of requests denied — review this role&apos;s grants.
          </span>
          <InsightActionButton
            label="Review role grants"
            icon={ShieldX}
            variant="subtle"
            size="sm"
            onAction={async () => {
              router.push('/governance/roles');
            }}
          />
        </div>
      )}
      {open && (
        <div className="border-t border-slate-100 dark:border-slate-800">
          {(role.modules ?? []).map((m, i) => (
            <ModuleNode key={`${m.module}-${m.project_id ?? 'na'}-${i}`} module={m} />
          ))}
          {(role.modules ?? []).length === 0 && (
            <p className="px-9 py-2 text-xs text-slate-400">No modules.</p>
          )}
        </div>
      )}
    </div>
  );
}

function ModuleNode({ module }: { module: OrgSummaryModule }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  // A module present in the tree but with no requests in the window is a
  // candidate for onboarding — offer the path to provision a project.
  const noRequests = (module.totals?.requests ?? 0) === 0;
  return (
    <div className="border-b border-slate-100 last:border-b-0 dark:border-slate-800">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 py-2 pl-8 pr-3 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/40"
      >
        <ChevronRight
          className={`h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform ${
            open ? 'rotate-90' : ''
          }`}
        />
        <span className="flex-1 truncate text-sm text-slate-800 dark:text-slate-200">
          {module.module || '—'}
          {module.project_id && (
            <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              project {module.project_id}
            </span>
          )}
        </span>
        <span className="hidden shrink-0 text-[11px] text-slate-400 sm:inline">
          {module.accounts?.length ?? 0} acct
          {(module.accounts?.length ?? 0) === 1 ? '' : 's'}
        </span>
        <Counts totals={module.totals} />
      </button>
      {noRequests && (
        <div className="flex flex-wrap items-center gap-2 py-1.5 pl-14 pr-3">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            No requests in this window.
          </span>
          <InsightActionButton
            label="Onboard project"
            icon={PlugZap}
            variant="subtle"
            size="sm"
            onAction={async () => {
              router.push('/governance/projects');
            }}
          />
        </div>
      )}
      {open && (
        <div className="bg-slate-50/60 dark:bg-slate-800/30">
          {(module.accounts ?? []).map((a, i) => (
            <AccountRow key={`${a.account}-${i}`} account={a} />
          ))}
          {(module.accounts ?? []).length === 0 && (
            <p className="py-2 pl-14 pr-3 text-xs text-slate-400">No accounts.</p>
          )}
        </div>
      )}
    </div>
  );
}

function AccountRow({ account }: { account: OrgSummaryAccount }) {
  return (
    <div className="flex items-center gap-2 py-1.5 pl-14 pr-3">
      <span className="flex-1 truncate text-xs text-slate-600 dark:text-slate-400">
        {account.account || '—'}
      </span>
      <Counts totals={account} />
    </div>
  );
}

function LoadingTree() {
  return (
    <div className="space-y-3" role="status" aria-label="Loading org summary">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div
            key={i}
            className="h-[68px] animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
          />
        ))}
      </div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="h-11 animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-700 dark:bg-slate-800"
        />
      ))}
    </div>
  );
}
