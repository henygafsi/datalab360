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
} from '@/app/services/org-accounts/hooks';
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
  const [state, setState] = useState<SfAccountsState>({
    accounts: null,
    selected: null,
    detail: null,
    creditsHistory: null,
    warehouses: null,
    logins: null,
    loadingList: true,
    loadingDetail: false,
    error: null,
  });

  // 1. Fetch the account list on mount, auto-select the first one.
  useEffect(() => {
    (async () => {
      try {
        const raw = await getAccounts();
        // An error envelope (role can't read org views) → degrade to an empty
        // list so the friendly "No Snowflake accounts" panel renders, not a
        // red error banner.
        const accounts = isApiError(raw)
          ? ({ accounts: [], count: 0 } as unknown as AccountsListResponse)
          : raw;
        const first = accounts?.accounts?.[0]?.account_name ?? null;
        setState((s) => ({
          ...s,
          accounts,
          selected: first,
          loadingList: false,
        }));
      } catch (e) {
        // Network/HTTP failure listing accounts is also treated as an empty
        // org rather than a hard error — the empty-state panel already
        // explains the /org-accounts/accounts endpoint returned nothing.
        setState((s) => ({
          ...s,
          accounts: { accounts: [], count: 0 } as unknown as AccountsListResponse,
          selected: null,
          loadingList: false,
        }));
      }
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
    const rows = state.creditsHistory?.history ?? [];
    return rows.map((r: any) => ({
      date: r.date,
      credits: r.credits ?? r.value ?? 0,
    }));
  }, [state.creditsHistory]);

  const warehouseRows = state.warehouses?.warehouses ?? [];
  const loginRows = state.logins?.logins ?? [];

  const activeWarehouses = useMemo(
    () =>
      warehouseRows.filter(
        (w: any) => Number(w?.credits_used ?? w?.credits ?? 0) > 0,
      ).length,
    [warehouseRows],
  );

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

  const errors24h = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return loginRows.reduce((acc: number, r: any) => {
      const status = String(
        r?.is_success ?? r?.status ?? r?.event_status ?? '',
      ).toUpperCase();
      const ts = r?.event_timestamp ?? r?.timestamp;
      const tsMs = ts ? new Date(ts).getTime() : NaN;
      const isErr =
        status === 'FAIL' || status === 'FAILED' || status === 'FALSE' ||
        status === 'NO' || r?.is_success === false || r?.error_code != null;
      const inWindow = Number.isFinite(tsMs) && tsMs >= cutoff;
      return acc + (isErr && inWindow ? 1 : 0);
    }, 0);
  }, [loginRows]);

  const accountSummary = state.detail?.account ?? null;
  const storage = state.detail?.storage ?? null;
  const accountParams = (accountSummary as any)?.parameters as
    | Record<string, unknown>
    | null
    | undefined;

  const selectedAccount = useMemo(
    () =>
      state.accounts?.accounts?.find(
        (a) => a.account_name === state.selected
      ) ?? null,
    [state.accounts, state.selected]
  );

  if (state.loadingList) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400 dark:border-slate-700 dark:bg-slate-900">
        Loading accounts…
      </div>
    );
  }

  if (!state.selected) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-700 dark:bg-slate-900">
        <div className="mx-auto max-w-md text-center">
          <Cloud className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
          <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
            No Snowflake accounts in this organization
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            The backend's <code className="rounded bg-slate-100 px-1 py-0.5 text-[10px] dark:bg-slate-800">/org-accounts/accounts</code> endpoint
            returned an empty list. Once a Snowflake account is registered
            against this Data360 org, it will appear here with credits,
            warehouses and login activity.
          </p>
          <a
            href="/connect-data"
            className="mt-4 inline-flex items-center rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            Connect an account
          </a>
        </div>
      </div>
    );
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
            href="/users"
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
            value="—"
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
            label="Errors 24h"
            value={fmt(errors24h)}
            tone={errors24h > 0 ? 'warn' : 'ok'}
          />
        </div>
      </section>

      {/* Cost chart */}
      <ChartPanel title="Credit history (30d)" icon={CreditCard}>
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

      {/* Recent logins */}
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <header className="flex items-center gap-2 border-b px-4 py-3 dark:border-slate-700">
          <Shield className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Recent logins
          </h3>
          <span className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            {loginRows.length}
          </span>
        </header>
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/50">
              <tr>
                <th className="px-3 py-2 text-left">When</th>
                <th className="px-3 py-2 text-left">User</th>
                <th className="px-3 py-2 text-left">Client</th>
                <th className="px-3 py-2 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loginRows.slice(0, 50).map((row: any, i: number) => (
                <tr
                  key={i}
                  className="hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <td className="px-3 py-1.5 text-xs text-slate-500">
                    {row.event_timestamp ?? row.timestamp ?? '—'}
                  </td>
                  <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">
                    {row.user_name ?? '—'}
                  </td>
                  <td className="px-3 py-1.5 text-xs text-slate-500">
                    {row.client_application ?? '—'}
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        row.is_success === false || row.error_code
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300'
                          : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                      }`}
                    >
                      {row.is_success === false || row.error_code
                        ? 'failed'
                        : 'success'}
                    </span>
                  </td>
                </tr>
              ))}
              {!state.loadingDetail && loginRows.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="px-3 py-6 text-center text-xs text-slate-400"
                  >
                    No login history in the last 30 days.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
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
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{label}</span>
        <Icon className="h-3.5 w-3.5 text-slate-400" />
      </div>
      <div className="mt-1 truncate text-lg font-semibold text-slate-900 dark:text-white">
        {value}
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
