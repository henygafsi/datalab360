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
  Cloud,
  CreditCard,
  Database,
  HardDrive,
  RefreshCw,
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
        const accounts = await getAccounts();
        const first = accounts?.accounts?.[0]?.account_name ?? null;
        setState((s) => ({
          ...s,
          accounts,
          selected: first,
          loadingList: false,
        }));
      } catch (e) {
        setState((s) => ({
          ...s,
          loadingList: false,
          error: e instanceof Error ? e.message : String(e),
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
    Promise.all([
      getAccountDetail(accountName).catch(() => null),
      getAccountCreditHistory(accountName, 30).catch(() => null),
      getAccountWarehouses(accountName, 30).catch(() => null),
      getAccountLoginHistory(accountName, 30).catch(() => null),
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
        }));
      })
      .catch((e) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loadingDetail: false,
          error: e instanceof Error ? e.message : String(e),
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

  const accountSummary = state.detail?.account ?? null;

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
      <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-900">
        No Snowflake accounts connected yet.
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
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
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
      </div>

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

      <div className="flex items-center gap-1 text-xs text-slate-400">
        <Activity className="h-3 w-3" />
        Wired endpoints: <code>
          /org-accounts/accounts/{state.selected}
        </code> · <code>/credits/history/{state.selected}</code> ·{' '}
        <code>/warehouses/{state.selected}</code> ·{' '}
        <code>/logins/{state.selected}</code>
      </div>
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
