'use client';

/**
 * SnowflakeAccountsTab — per-account drilldown for any Snowflake account
 * connected to data360.
 *
 * Wires to the existing per-account endpoints:
 *   - GET /org-accounts/accounts                  (list)
 *   - GET /org-accounts/accounts/{name}           (detail)
 *   - GET /org-accounts/credits/history/{name}    (cost timeseries)
 *   - GET /org-accounts/warehouses/{name}         (warehouse cost)
 *   - GET /org-accounts/logins/{name}             (login activity)
 *
 * See: Screens/Account-overview/09-snowflake-accounts/_features.md
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  CheckCircle2,
  Cloud,
  CreditCard,
  Database,
  HardDrive,
  Heart,
  Info,
  RefreshCw,
  Settings,
  Shield,
  Users,
  Zap,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  getAccountCreditHistory,
  getAccountDetail,
  getAccountLoginHistory,
  getAccountWarehouses,
  getAccounts,
  getDashboardOverview,
} from '@/app/services/org-accounts/hooks';
import {
  getSummary,
  getTableStorage,
  getRoleHierarchy,
} from '@/app/services/command-center';
import type { SummaryResponse } from '@/app/services/command-center/types';
import { InsightActionButton } from '@/app/shared/insights';
import { dash } from '@/app/shared/ui/format';
import AuditTable, { type Row } from './AuditTable';
import type {
  AccountCreditHistoryResponse,
  AccountDetailResponse,
  AccountLoginHistoryResponse,
  AccountWarehousesResponse,
  AccountsListResponse,
} from '@/app/services/org-accounts/types';

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6'];

interface SfAccountsState {
  accounts: AccountsListResponse | null;
  selected: string | null;
  /** Explicit backend ORGADMIN signal (is_org_admin). null = unknown. */
  orgAdmin: boolean | null;
  detail: AccountDetailResponse | null;
  creditsHistory: AccountCreditHistoryResponse | null;
  warehouses: AccountWarehousesResponse | null;
  logins: AccountLoginHistoryResponse | null;
  loadingList: boolean;
  loadingDetail: boolean;
  error: string | null;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

function fmtBytes(b: number | null | undefined): string {
  if (!b) return '—';
  if (b >= 1e12) return `${(b / 1e12).toFixed(2)} TB`;
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  return `${b} B`;
}

/** Credit values are usually small decimals — keep one decimal, abbreviate large totals. */
function fmtCredits(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return n.toFixed(1);
}

/** Execution-time helper: ms → ms/s/m. */
function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms >= 60000) return `${(ms / 60000).toFixed(1)}m`;
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms)}ms`;
}

/**
 * Detect an API error envelope returned as 200 OK ({error_code, message} or
 * {success:false}). `/org-accounts/accounts` returns this when the current
 * Snowflake role can't read the org views — we treat it as an empty list so
 * the graceful "No Snowflake accounts" panel renders instead of a red error.
 */
function isApiError(data: unknown): boolean {
  if (data === null || data === undefined) return false;
  if (typeof data !== 'object' || Array.isArray(data)) return false;
  const d = data as Record<string, unknown>;
  return (
    ('error_code' in d && 'message' in d) ||
    ('success' in d && d.success === false)
  );
}

export default function SnowflakeAccountsTab() {
  const router = useRouter();
  const [state, setState] = useState<SfAccountsState>({
    accounts: null,
    selected: null,
    orgAdmin: null,
    detail: null,
    creditsHistory: null,
    warehouses: null,
    logins: null,
    loadingList: true,
    loadingDetail: false,
    error: null,
  });

  // 1. Fetch the account list + the explicit ORGADMIN signal on mount, then
  //    auto-select the first account. The org-admin gate is driven off the
  //    backend `is_org_admin` flag (dashboard/overview) — NOT inferred from an
  //    empty list — so the empty-state can honestly distinguish "ORGADMIN not
  //    granted" from "no accounts registered in this org yet".
  useEffect(() => {
    (async () => {
      const [raw, overview] = await Promise.all([
        getAccounts().catch(() => null),
        getDashboardOverview().catch(() => null),
      ]);
      // An error envelope / failure (role can't read org views) → degrade to an
      // empty list so the home-account fallback renders, not a red error banner.
      const accounts =
        raw && !isApiError(raw)
          ? raw
          : ({ accounts: [], count: 0 } as unknown as AccountsListResponse);
      const first = accounts?.accounts?.[0]?.account_name ?? null;
      const orgAdmin =
        typeof overview?.overview?.is_org_admin === 'boolean'
          ? overview.overview.is_org_admin
          : null;
      setState((s) => ({
        ...s,
        accounts,
        selected: first,
        orgAdmin,
        loadingList: false,
      }));
    })();
  }, []);

  // 2. When the selected account changes, fetch its detail + cost + warehouses + logins.
  useEffect(() => {
    if (!state.selected) return;
    const accountName = state.selected;
    let cancelled = false;
    setState((s) => ({ ...s, loadingDetail: true, error: null }));
    // Capture the first failure instead of swallowing each call to null —
    // otherwise a failed detail fetch renders an empty panel with no error.
    let firstError: string | null = null;
    const guard = <T,>(p: Promise<T>): Promise<T | null> =>
      p.catch((e: unknown) => {
        firstError = firstError ?? (e instanceof Error ? e.message : String(e));
        return null;
      });
    Promise.all([
      guard(getAccountDetail(accountName)),
      guard(getAccountCreditHistory(accountName, 30)),
      guard(getAccountWarehouses(accountName, 30)),
      guard(getAccountLoginHistory(accountName, 30)),
    ])
      .then(([detail, creditsHistory, warehouses, logins]) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          detail,
          creditsHistory,
          warehouses,
          logins,
          loadingDetail: false,
          // Only surface an error when the primary detail call failed AND we
          // have nothing to show; partial sub-section failures still render
          // what loaded.
          error: detail == null && firstError ? firstError : null,
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [state.selected]);

  const creditSeries = useMemo(() => {
    // history is CreditTrendPoint[] → `usage_date` / `total_credits`.
    const rows = state.creditsHistory?.history ?? [];
    return rows.map((r) => ({
      date: r.usage_date,
      credits: r.total_credits ?? 0,
    }));
  }, [state.creditsHistory]);

  const warehouseRows = useMemo(
    () => state.warehouses?.warehouses ?? [],
    [state.warehouses],
  );
  const loginRows = useMemo(
    () => state.logins?.logins ?? [],
    [state.logins],
  );

  const activeWarehouses = useMemo(
    () =>
      warehouseRows.filter(
        (w: any) => Number(w?.credits_used ?? w?.credits ?? 0) > 0,
      ).length,
    [warehouseRows],
  );

  // Single 24h failed-login window, reused by the KPI strip and both Health
  // tiles (login "errors" here are exactly the failed login attempts).
  const failedLogins24h = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return loginRows.reduce((acc: number, r: any) => {
      const status = String(
        r?.is_success ?? r?.status ?? r?.event_status ?? '',
      ).toUpperCase();
      const ts = r?.event_timestamp ?? r?.timestamp;
      const tsMs = ts ? new Date(ts).getTime() : NaN;
      const isFail =
        status === 'FAIL' || status === 'FAILED' || status === 'FALSE' ||
        status === 'NO' || r?.is_success === false || r?.error_code != null;
      const inWindow = Number.isFinite(tsMs) && tsMs >= cutoff;
      return acc + (isFail && inWindow ? 1 : 0);
    }, 0);
  }, [loginRows]);

  // Distinct from the 24h failed-login count: the login FAILURE RATE over the
  // full 30d window (loginRows = /logins/{account}?days=30). A percentage, so it
  // never restates the 24h count under a second label, and it surfaces login
  // health even though the detail endpoint returns no logins summary.
  const loginFailRate30d = useMemo(() => {
    let total = 0;
    let fail = 0;
    for (const r of loginRows as any[]) {
      total += 1;
      const status = String(
        r?.is_success ?? r?.status ?? r?.event_status ?? '',
      ).toUpperCase();
      const isFail =
        status === 'FAIL' || status === 'FAILED' || status === 'FALSE' ||
        status === 'NO' || r?.is_success === false || r?.error_code != null;
      if (isFail) fail += 1;
    }
    return total > 0 ? (fail / total) * 100 : null;
  }, [loginRows]);

  const accountSummary = state.detail?.account ?? null;
  const storage = state.detail?.storage ?? null;
  const credits = state.detail?.credits ?? null;
  const queries = state.detail?.queries ?? null;
  const loginsSummary = state.detail?.logins ?? null;
  const detailWarehouses = state.detail?.warehouses ?? [];
  const accountParams = (accountSummary as any)?.parameters as
    | Record<string, unknown>
    | null
    | undefined;

  // Real "uptime" proxy: time the account has been active, measured from the
  // first observed login (detail.logins.first_login) to now.
  const uptimeLabel = useMemo(() => {
    const first = loginsSummary?.first_login;
    if (!first) return '—';
    const t = new Date(first).getTime();
    if (!Number.isFinite(t)) return '—';
    const days = Math.max(0, Math.floor((Date.now() - t) / 86400000));
    return `${days}d`;
  }, [loginsSummary]);

  const selectedAccount = useMemo(
    () =>
      state.accounts?.accounts?.find(
        (a) => a.account_name === state.selected
      ) ?? null,
    [state.accounts, state.selected]
  );

  // ── Pre-shaped rows for the bottom AuditTables ──────────────────────────────
  // All Snowflake accounts (promote the already-fetched picker list to a
  // paginated, auto-filterable table). region/edition/cloud/status auto-detect.
  const accountRows: Row[] = useMemo(
    () =>
      (state.accounts?.accounts ?? []).map((a) => ({
        account_name: a.account_name,
        account_locator: a.account_locator,
        region: a.region,
        edition: a.edition,
        cloud: a.cloud,
        status: a.is_active ? 'active' : 'inactive',
        created_on: a.created_on,
      })),
    [state.accounts],
  );

  // Warehouse credit breakdown — keep credits/metering NUMERIC so formatCell
  // renders them and the only auto-detected filter is the useful Warehouse one.
  const warehouseDetailRows: Row[] = useMemo(
    () =>
      detailWarehouses.map((w) => ({
        warehouse: w.warehouse_name || '—',
        compute_credits: w.compute_credits ?? null,
        cloud_services: w.cloud_credits ?? null,
        metering_hours: w.metering_hours ?? null,
      })),
    [detailWarehouses],
  );

  // Recent logins — pre-derive a human-readable `status` so a Status filter
  // (success/failed) auto-detects; keep `when` as the ISO date for the range.
  const loginTableRows: Row[] = useMemo(
    () =>
      (loginRows as any[]).map((r) => ({
        when: r.event_timestamp ?? r.timestamp ?? null,
        user: r.user_name ?? '—',
        client: r.client_application ?? r.client_type ?? '—',
        client_ip: r.client_ip ?? '—',
        status: r.is_success === false || r.error_code ? 'failed' : 'success',
        error: r.error_message ?? r.error_code ?? '—',
      })),
    [loginRows],
  );

  if (state.loadingList) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-900">
        Loading accounts…
      </div>
    );
  }

  if (!state.selected) {
    return <HomeAccountFallback orgAdmin={state.orgAdmin} />;
  }

  return (
    <div className="space-y-6">
      {/* Account picker */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
        <Cloud className="h-4 w-4 text-slate-500" />
        <label
          htmlFor="sf-account-picker"
          className="text-sm font-medium text-slate-700 dark:text-slate-200"
        >
          Account:
        </label>
        <select
          id="sf-account-picker"
          value={state.selected ?? ''}
          onChange={(e) =>
            setState((s) => ({ ...s, selected: e.target.value || null }))
          }
          className="rounded border border-slate-200 bg-white px-2 py-1 text-sm dark:border-slate-700 dark:bg-slate-800"
        >
          {state.accounts?.accounts?.map((a) => (
            <option key={a.account_locator} value={a.account_name}>
              {a.account_name} ({a.account_locator}) — {a.region}
            </option>
          ))}
        </select>
        {selectedAccount && (
          <>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {selectedAccount.edition}
            </span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              {selectedAccount.cloud}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                selectedAccount.is_active
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
              }`}
            >
              {selectedAccount.is_active ? 'active' : 'inactive'}
            </span>
          </>
        )}
        <div className="ml-auto" />
        <span className="text-xs text-slate-400">
          {state.loadingDetail ? 'Loading…' : ''}
        </span>
      </div>

      {state.error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
          {state.error}
        </div>
      )}

      {/* Honest CTAs — surfaced only when the loaded data warrants action. */}
      {(failedLogins24h > 0 ||
        selectedAccount?.is_active === false ||
        (accountSummary as any)?.databases_count === 0) && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-900/10">
          <span className="text-xs font-semibold text-amber-800 dark:text-amber-200">
            Recommended actions
          </span>
          {failedLogins24h > 0 && (
            <InsightActionButton
              label="Investigate failed logins"
              icon={Shield}
              variant="subtle"
              size="sm"
              onAction={async () => {
                router.push('/account-overview?tab=security');
              }}
            />
          )}
          {(selectedAccount?.is_active === false ||
            (accountSummary as any)?.databases_count === 0) && (
            <InsightActionButton
              label="Connect account"
              icon={Database}
              variant="subtle"
              size="sm"
              onAction={async () => {
                router.push('/data-source-connection');
              }}
            />
          )}
        </div>
      )}

      {/* Identity + capacity cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-7">
        <KpiCard
          icon={Cloud}
          label="Region"
          value={selectedAccount?.region ?? '—'}
        />
        <KpiCard
          icon={Database}
          label="Databases"
          value={fmt((accountSummary as any)?.databases_count)}
        />
        <KpiCard
          icon={Database}
          label="Tables"
          value={fmt((accountSummary as any)?.tables_count)}
        />
        <KpiCard
          icon={Users}
          label="Active users 30d"
          value={fmt((accountSummary as any)?.active_users_30d)}
        />
        <KpiCard
          icon={HardDrive}
          label="Storage"
          value={fmtBytes((accountSummary as any)?.storage_bytes)}
        />
        <KpiCard
          icon={CreditCard}
          label="Credits 30d"
          value={fmt(Math.round((accountSummary as any)?.credits_30d ?? 0))}
        />
        <KpiCard
          icon={Zap}
          label="Warehouses used (30d)"
          value={fmt(activeWarehouses)}
        />
        <KpiCard
          icon={Shield}
          label="Failed logins 24h"
          value={fmt(failedLogins24h)}
        />
      </div>

      {/* Identity & Context + Parameters & Defaults */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <header className="flex items-center gap-2 border-b px-4 py-3 dark:border-slate-700">
            <Info className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Account Identity & Context
            </h3>
          </header>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-xs">
            <IdRow label="Locator" value={(accountSummary as any)?.account_locator} />
            <IdRow label="Region" value={(accountSummary as any)?.region} />
            <IdRow label="Edition" value={(accountSummary as any)?.edition} />
            <IdRow label="Cloud" value={(accountSummary as any)?.cloud} />
            <IdRow label="Role" value={(accountSummary as any)?.current_role} />
            <IdRow
              label="Account URL"
              value={(accountSummary as any)?.account_url}
              isUrl
            />
            <IdRow
              label="Subscription end"
              value={(accountSummary as any)?.subscription_end}
            />
          </dl>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <header className="flex items-center gap-2 border-b px-4 py-3 dark:border-slate-700">
            <Settings className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Account Parameters & Defaults
            </h3>
          </header>
          {accountParams && Object.keys(accountParams).length > 0 ? (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 px-4 py-3 text-xs">
              {Object.entries(accountParams).map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="truncate text-slate-500" title={k}>
                    {k}
                  </dt>
                  <dd
                    className="truncate text-slate-700 dark:text-slate-200"
                    title={String(v ?? '')}
                  >
                    {v == null || v === '' ? '—' : String(v)}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <div className="px-4 py-6 text-center text-xs text-slate-400">
              Parameters not exposed by API
            </div>
          )}
        </section>
      </div>

      {/* Quick actions */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <header className="flex items-center gap-2 border-b px-4 py-3 dark:border-slate-700">
          <Zap className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Quick Actions
          </h3>
        </header>
        <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-4">
          <a
            href="/governance/users"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-xs font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Manage Users
          </a>
          <a
            href="/governance/roles"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-xs font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Manage Roles
          </a>
          <button
            type="button"
            disabled
            className="cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-center text-xs font-medium text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500"
            title="Coming soon"
          >
            Reset Account
          </button>
          <a
            href="/account-overview?tab=finops"
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center text-xs font-medium text-slate-700 hover:border-blue-300 hover:bg-blue-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            View Cost Detail
          </a>
        </div>
      </section>

      {/* Capacity Snapshot */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <header className="flex items-center gap-2 border-b px-4 py-3 dark:border-slate-700">
          <HardDrive className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Capacity Snapshot
          </h3>
        </header>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/50">
            <tr>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-right">Size</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {(() => {
              const dbBytes = (storage as any)?.database_bytes as number | undefined;
              const stageBytes = (storage as any)?.stage_bytes as number | undefined;
              const failsafeBytes = (storage as any)?.failsafe_bytes as
                | number
                | undefined;
              const totalBytes =
                dbBytes != null || stageBytes != null || failsafeBytes != null
                  ? (dbBytes ?? 0) + (stageBytes ?? 0) + (failsafeBytes ?? 0)
                  : ((storage as any)?.total_bytes as number | undefined);
              const rows: Array<[string, number | undefined]> = [
                ['Storage', dbBytes],
                ['Stages', stageBytes],
                ['Failsafe', failsafeBytes],
                ['Total', totalBytes],
              ];
              return rows.map(([label, val]) => (
                <tr key={label}>
                  <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">
                    {label}
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium text-slate-900 dark:text-white">
                    {val == null ? '—' : fmtBytes(val)}
                  </td>
                </tr>
              ));
            })()}
          </tbody>
        </table>
      </section>

      {/* Query activity + Login summary */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <header className="flex items-center gap-2 border-b px-4 py-3 dark:border-slate-700">
            <Activity className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Query Activity (30d)
            </h3>
          </header>
          {queries ? (
            <div className="grid grid-cols-2 gap-2 p-4 sm:grid-cols-3">
              <StatStripItem label="Queries" value={fmt(queries.query_count)} />
              <StatStripItem label="Unique users" value={fmt(queries.unique_users)} />
              <StatStripItem label="Avg exec" value={fmtMs(queries.avg_execution_time_ms)} />
              <StatStripItem label="Max exec" value={fmtMs(queries.max_execution_time_ms)} />
              <StatStripItem label="Bytes scanned" value={fmtBytes(queries.total_bytes_scanned)} />
              <StatStripItem label="Rows produced" value={fmt(queries.total_rows_produced)} />
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-xs text-slate-400">
              {state.loadingDetail ? 'Loading…' : 'No query activity in the last 30 days.'}
            </div>
          )}
        </section>

        <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
          <header className="flex items-center gap-2 border-b px-4 py-3 dark:border-slate-700">
            <Users className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Login Summary (30d)
            </h3>
          </header>
          {loginsSummary ? (
            <div className="space-y-3 p-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatStripItem label="Unique users" value={fmt(loginsSummary.unique_users)} />
                <StatStripItem label="Total logins" value={fmt(loginsSummary.total_logins)} />
                <StatStripItem label="Successful" value={fmt(loginsSummary.successful_logins)} />
                <StatStripItem label="Failed" value={fmt(loginsSummary.failed_logins)} />
              </div>
              {(() => {
                const total = loginsSummary.total_logins ?? 0;
                const ok = loginsSummary.successful_logins ?? 0;
                const fail = loginsSummary.failed_logins ?? 0;
                const okPct = total > 0 ? (ok / total) * 100 : 0;
                const failPct = total > 0 ? (fail / total) * 100 : 0;
                return (
                  <div>
                    <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${okPct}%` }}
                        title={`Successful: ${fmt(ok)}`}
                      />
                      <div
                        className="h-full bg-rose-500"
                        style={{ width: `${failPct}%` }}
                        title={`Failed: ${fmt(fail)}`}
                      />
                    </div>
                    <div className="mt-1 flex justify-between text-[10px] text-slate-400">
                      <span>{okPct.toFixed(0)}% success</span>
                      <span>{failPct.toFixed(0)}% failed</span>
                    </div>
                  </div>
                );
              })()}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <dt className="text-slate-500">First login</dt>
                <dd className="truncate text-slate-700 dark:text-slate-200" title={loginsSummary.first_login ?? ''}>
                  {loginsSummary.first_login || '—'}
                </dd>
                <dt className="text-slate-500">Last login</dt>
                <dd className="truncate text-slate-700 dark:text-slate-200" title={loginsSummary.last_login ?? ''}>
                  {loginsSummary.last_login || '—'}
                </dd>
              </dl>
            </div>
          ) : (
            <div className="px-4 py-6 text-center text-xs text-slate-400">
              {state.loadingDetail ? 'Loading…' : 'No login summary for the last 30 days.'}
            </div>
          )}
        </section>
      </div>

      {/* Health & SLA */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <header className="flex items-center gap-2 border-b px-4 py-3 dark:border-slate-700">
          <Heart className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Health & SLA
          </h3>
        </header>
        <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-3">
          <HealthTile
            icon={CheckCircle2}
            label="Uptime"
            value={uptimeLabel}
            tone="ok"
          />
          <HealthTile
            icon={Shield}
            label="Failed logins 24h"
            value={fmt(failedLogins24h)}
            tone={failedLogins24h > 0 ? 'warn' : 'ok'}
          />
          <HealthTile
            icon={Activity}
            label="Login fail rate (30d)"
            value={
              loginFailRate30d == null ? '—' : `${loginFailRate30d.toFixed(0)}%`
            }
            tone={
              loginFailRate30d != null && loginFailRate30d > 5 ? 'warn' : 'ok'
            }
          />
        </div>
      </section>

      {/* Cost chart */}
      <ChartPanel
        title={`Credit history — ${state.selected ?? ''} (30d)`}
        icon={CreditCard}
      >
        {credits && (
          <div className="mb-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-md bg-slate-100 px-2 py-1 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200">
              Total {fmtCredits(credits.total_credits)}
            </span>
            <span className="rounded-md bg-blue-50 px-2 py-1 font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
              Compute {fmtCredits(credits.compute_credits)}
            </span>
            <span className="rounded-md bg-violet-50 px-2 py-1 font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
              Cloud services {fmtCredits(credits.cloud_services_credits)}
            </span>
          </div>
        )}
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={creditSeries}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="credits"
              stroke={COLORS[0]}
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </ChartPanel>

      {/* Warehouses */}
      <ChartPanel title="Warehouses (top by credits 30d)" icon={Zap}>
        <ResponsiveContainer
          width="100%"
          height={Math.max(180, warehouseRows.length * 24)}
        >
          <BarChart data={warehouseRows.slice(0, 12)} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis
              dataKey="warehouse_name"
              type="category"
              tick={{ fontSize: 10 }}
              width={140}
            />
            <Tooltip />
            <Bar dataKey="credits_used" fill={COLORS[2]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartPanel>

      {/* ── Audit & detail tables (full width, paginated, no internal scroll) ── */}
      {/* Warehouse credit breakdown + Recent logins (from account detail) — gated
          on loadingDetail so they don't flash an empty state while fetching. */}
      {state.loadingDetail ? (
        <div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ) : (
        <>
          <AuditTable
            rows={warehouseDetailRows}
            columns={['warehouse', 'compute_credits', 'cloud_services', 'metering_hours']}
            pageSize={10}
            title="Warehouse Credit Breakdown (30d)"
            subtitle="ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY"
          />
          <AuditTable
            rows={loginTableRows}
            columns={['when', 'user', 'client', 'client_ip', 'status', 'error']}
            pageSize={10}
            title="Recent logins"
            subtitle="ORG_ACCOUNTS.LOGINS"
          />
        </>
      )}

      {/* All Snowflake accounts — promoted from the picker list (zero-cost win) */}
      <AuditTable
        rows={accountRows}
        columns={['account_name', 'account_locator', 'region', 'edition', 'cloud', 'status', 'created_on']}
        pageSize={10}
        title="All Snowflake accounts"
        subtitle="ORGANIZATION_USAGE.ACCOUNTS"
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Home-account fallback (ORGADMIN not granted, or no accounts registered yet).
// Org-level enumeration needs the ORGADMIN role; when it isn't available we still
// show THIS account's own metrics from /command-center/summary (home-account) +
// account-scoped audit tables, instead of a dead-end empty panel.
// ──────────────────────────────────────────────────────────────────────────────
function HomeAccountFallback({ orgAdmin }: { orgAdmin: boolean | null }) {
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [storage, setStorage] = useState<Row[]>([]);
  const [roles, setRoles] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      getSummary().catch(() => null),
      getTableStorage(120),
      getRoleHierarchy(),
    ])
      .then(([s, st, rh]) => {
        if (!active) return;
        setSummary(s);
        setStorage((st?.data ?? []) as Row[]);
        setRoles((rh?.data ?? []) as Row[]);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  // Honest cause split: role-gated vs genuinely-empty org (a real ORGADMIN with
  // no registered accounts must NOT be told "ORGADMIN not granted").
  const roleGated = orgAdmin === false;
  const p = summary?.platform;
  const q = summary?.quality;
  const c = summary?.cost;
  const sec = summary?.security;

  return (
    <div className="space-y-6">
      {/* Honest needs-ORGADMIN / empty-org note */}
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-900/10">
        <div className="flex items-start gap-2">
          <Shield className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-300" />
          <div>
            <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              {roleGated
                ? 'Organization-level access requires the ORGADMIN role'
                : 'No Snowflake accounts registered in this organization yet'}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-amber-700/90 dark:text-amber-200/80">
              {roleGated
                ? 'The ORGADMIN role is not granted on this connection, so multi-account enumeration is unavailable. Showing this account’s own metrics below.'
                : 'Once a Snowflake account is registered against this org it appears here with credits, warehouses and login activity. Showing this account’s own metrics below.'}
            </p>
            <a
              href="/data-source-connection"
              className="mt-2 inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              Connect an account
            </a>
          </div>
        </div>
      </div>

      {/* Home-account KPI strip (real metrics for THIS account; — when absent) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-8">
        <KpiCard icon={Users} label="Total users" value={fmt(p?.total_users)} />
        <KpiCard icon={Activity} label="Active users 7d" value={fmt(p?.active_users_7d)} />
        <KpiCard icon={Database} label="Projects" value={fmt(p?.total_projects)} />
        <KpiCard icon={Database} label="Tables" value={fmt(q?.total_tables)} />
        <KpiCard
          icon={HardDrive}
          label="Storage"
          value={c?.storage_tb == null ? '—' : `${c.storage_tb.toFixed(2)} TB`}
        />
        <KpiCard
          icon={CreditCard}
          label="Credits 30d"
          value={fmt(c?.credits_30d == null ? null : Math.round(c.credits_30d))}
        />
        <KpiCard icon={Heart} label="Health score" value={fmt(q?.health_score)} />
        <KpiCard icon={Shield} label="Failed logins 7d" value={fmt(sec?.failed_logins_7d)} />
      </div>

      {/* Account-scoped audit tables (populate even without ORGADMIN) */}
      {loading ? (
        <div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      ) : (
        <>
          <AuditTable
            rows={storage}
            pageSize={10}
            title="Storage by table"
            subtitle="ACCOUNT_USAGE.TABLE_STORAGE_METRICS"
          />
          <AuditTable
            rows={roles}
            pageSize={10}
            title="Role hierarchy"
            subtitle="SHOW ROLES"
          />
        </>
      )}
    </div>
  );
}

// ----- small UI helpers -----

function KpiCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  // Accepts a missing value — renders "—" for null/undefined/NaN (R3); a genuine
  // 0 still renders as 0.
  value: string | number | null | undefined;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{label}</span>
        <Icon className="h-3.5 w-3.5 text-slate-400" />
      </div>
      <div className="mt-1 truncate text-lg font-semibold text-slate-900 dark:text-white">
        {dash(value)}
      </div>
    </div>
  );
}

function StatStripItem({
  label,
  value,
}: {
  label: string;
  // Missing → "—" (R3); a genuine 0 still renders as 0.
  value: string | number | null | undefined;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-slate-900 dark:text-white">
        {dash(value)}
      </div>
    </div>
  );
}

function IdRow({
  label,
  value,
  isUrl,
}: {
  label: string;
  value?: string | null;
  isUrl?: boolean;
}) {
  const display = value && String(value).length > 0 ? String(value) : '—';
  return (
    <div className="contents">
      <dt className="text-slate-500">{label}</dt>
      <dd className="truncate text-slate-700 dark:text-slate-200" title={display}>
        {isUrl && display !== '—' ? (
          <a
            href={display.startsWith('http') ? display : `https://${display}`}
            target="_blank"
            rel="noreferrer"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            {display}
          </a>
        ) : (
          display
        )}
      </dd>
    </div>
  );
}

function HealthTile({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  tone: 'ok' | 'warn' | 'crit';
}) {
  const toneClass =
    tone === 'crit'
      ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300'
      : tone === 'warn'
      ? 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300'
      : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300';
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="flex items-center justify-between text-xs opacity-80">
        <span>{label}</span>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="mt-1 text-lg font-semibold">{value}</div>
    </div>
  );
}

function ChartPanel({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <header className="mb-2 flex items-center gap-2">
        <Icon className="h-4 w-4 text-slate-500" />
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
          {title}
        </h3>
      </header>
      {children}
    </section>
  );
}
