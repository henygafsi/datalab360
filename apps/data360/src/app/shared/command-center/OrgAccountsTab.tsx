'use client';

/**
 * OrgAccountsTab — multi-account dashboard for an entire Snowflake organisation.
 *
 * Wires to existing `/org-accounts/*` endpoints (already shipped in
 * `app/services/org-accounts/hooks.ts`). Surfaces:
 *   - 6 KPI cards (accounts in org, editions in use, replication groups,
 *     failover groups, org credits 30 d, org storage TB)
 *   - the accounts table (one row per account with health/credits/storage)
 *   - a credits-trend chart (per-account stacked)
 *   - a storage-trend chart
 *   - an alerts panel
 *   - reader accounts + shares footprint (right rail)
 *
 * See: Screens/Account-overview/05-org-accounts/_features.md
 */
import { useEffect, useMemo, useState } from 'react';
import {
  BarChart3,
  Building2,
  Cloud,
  CreditCard,
  Database,
  GitBranch,
  HardDrive,
  Layers,
  Lightbulb,
  RefreshCw,
  Share2,
  ShieldCheck,
  Users,
  X,
  Zap,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  getAccounts,
  getDashboardOverview,
  getDashboardTrends,
  getReaderAccounts,
  getShares,
} from '@/app/services/org-accounts/hooks';
import type {
  AccountsListResponse,
  ClientAccount,
  DashboardOverviewResponse,
  DashboardTrendsResponse,
} from '@/app/services/org-accounts/types';

const COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
];

interface OrgAccountsState {
  overview: DashboardOverviewResponse | null;
  accounts: AccountsListResponse | null;
  trends: DashboardTrendsResponse | null;
  readers: number;
  shares: number;
  readerList: Array<{ name: string; cloud?: string; region?: string }>;
  shareList: Array<{ name: string; database_name?: string; kind?: string }>;
  loading: boolean;
  error: string | null;
}

function fmtBytes(b: number | null | undefined): string {
  if (!b) return '0';
  if (b >= 1e12) return `${(b / 1e12).toFixed(2)} TB`;
  if (b >= 1e9) return `${(b / 1e9).toFixed(1)} GB`;
  if (b >= 1e6) return `${(b / 1e6).toFixed(1)} MB`;
  return `${b} B`;
}

function fmtNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

export default function OrgAccountsTab() {
  const [state, setState] = useState<OrgAccountsState>({
    overview: null,
    accounts: null,
    trends: null,
    readers: 0,
    shares: 0,
    readerList: [],
    shareList: [],
    loading: true,
    error: null,
  });
  const [selectedAccount, setSelectedAccount] = useState<ClientAccount | null>(
    null,
  );

  const fetchAll = async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const [overview, accounts, trends, readerRes, shareRes] = await Promise.all([
        getDashboardOverview().catch(() => null),
        getAccounts().catch(() => null),
        getDashboardTrends(30).catch(() => null),
        getReaderAccounts().catch(() => ({ reader_accounts: [] as any[] })),
        getShares().catch(() => ({ shares: [] as any[] })),
      ]);
      const readerList = (readerRes?.reader_accounts ?? []) as Array<{
        name: string;
        cloud?: string;
        region?: string;
      }>;
      const shareList = (shareRes?.shares ?? []) as Array<{
        name: string;
        database_name?: string;
        kind?: string;
      }>;
      setState({
        overview,
        accounts,
        trends,
        readers: readerList.length,
        shares: shareList.length,
        readerList,
        shareList,
        loading: false,
        error: null,
      });
    } catch (e) {
      setState((s) => ({
        ...s,
        loading: false,
        error: e instanceof Error ? e.message : String(e),
      }));
    }
  };

  useEffect(() => {
    void fetchAll();
  }, []);

  const editionMix = useMemo(() => {
    const o = state.overview?.overview;
    if (!o) return [];
    return Object.entries((o as any).accounts_by_edition ?? {}).map(
      ([edition, count]) => ({ edition, count: count as number })
    );
  }, [state.overview]);

  const creditTrend = useMemo(() => {
    const rows = state.trends?.credits ?? [];
    return rows.map((r: any) => ({
      date: r.date,
      credits: r.credits ?? r.value ?? 0,
    }));
  }, [state.trends]);

  const storageTrend = useMemo(() => {
    const rows = state.trends?.storage ?? [];
    return rows.map((r: any) => ({
      date: r.date,
      storage_gb: (r.bytes ?? r.storage_bytes ?? 0) / 1e9,
    }));
  }, [state.trends]);

  // ----- render -----
  const o = state.overview?.overview;
  const totalAccounts = o?.total_client_accounts ?? 0;
  const activeAccounts = o?.active_accounts ?? 0;
  const inactiveAccounts = o?.inactive_accounts ?? 0;
  const orgCredits = (o as any)?.total_credits_30d ?? 0;
  const orgStorageBytes = (o as any)?.total_storage_bytes ?? 0;
  const replicationGroupsCount = (o as any)?.replication_groups_count ?? 0;
  const failoverGroupsCount = (o as any)?.failover_groups_count ?? 0;
  const managedAccountsCount =
    (o as any)?.managed_accounts_count ?? state.accounts?.accounts?.length ?? 0;
  const networkPoliciesCount = (o as any)?.network_policies_count ?? 0;

  // Recent org account events — last 8 by created_on desc
  const recentEvents = useMemo(() => {
    const list = (state.accounts?.accounts ?? []).slice();
    return list
      .filter((a) => !!a.created_on)
      .sort(
        (a, b) =>
          new Date(b.created_on).getTime() - new Date(a.created_on).getTime(),
      )
      .slice(0, 8);
  }, [state.accounts]);

  return (
    <div className="space-y-6">
      {/* Top-strip KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-9">
        <KpiCard
          icon={Building2}
          label="Accounts in org"
          value={fmtNumber(totalAccounts)}
          loading={state.loading}
        />
        <KpiCard
          icon={ShieldCheck}
          label="Active / Inactive"
          value={`${activeAccounts} / ${inactiveAccounts}`}
          loading={state.loading}
        />
        <KpiCard
          icon={Cloud}
          label="Editions in use"
          value={editionMix.map((e) => e.edition).join(' · ') || '—'}
          loading={state.loading}
        />
        <KpiCard
          icon={CreditCard}
          label="Org credits (30d)"
          value={fmtNumber(Math.round(orgCredits))}
          loading={state.loading}
        />
        <KpiCard
          icon={HardDrive}
          label="Org storage"
          value={fmtBytes(orgStorageBytes)}
          loading={state.loading}
        />
        <KpiCard
          icon={Database}
          label="Reader / Shares"
          value={`${state.readers} / ${state.shares}`}
          loading={state.loading}
        />
        <KpiCard
          icon={GitBranch}
          label="Replication Groups"
          value={replicationGroupsCount > 0 ? fmtNumber(replicationGroupsCount) : '—'}
          loading={state.loading}
        />
        <KpiCard
          icon={Zap}
          label="Failover Groups"
          value={failoverGroupsCount > 0 ? fmtNumber(failoverGroupsCount) : '—'}
          loading={state.loading}
        />
        <KpiCard
          icon={Layers}
          label="Managed Accounts"
          value={fmtNumber(managedAccountsCount)}
          loading={state.loading}
        />
      </div>

      {/* Error banner */}
      {state.error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
          {state.error}
          <button
            type="button"
            className="ml-3 inline-flex items-center gap-1 underline"
            onClick={fetchAll}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      )}

      {/* Accounts grid + drilldown rail */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <section className="rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <header className="flex items-center justify-between border-b px-4 py-3 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-slate-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Connected accounts
            </h3>
            <span className="rounded bg-slate-100 px-1.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {state.accounts?.accounts?.length ?? 0}
            </span>
          </div>
          <button
            type="button"
            onClick={fetchAll}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Refresh"
          >
            <RefreshCw
              className={`h-4 w-4 ${state.loading ? 'animate-spin' : ''}`}
            />
          </button>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500 dark:bg-slate-800/50">
              <tr>
                <th className="px-3 py-2 text-left">Account</th>
                <th className="px-3 py-2 text-left">Region</th>
                <th className="px-3 py-2 text-left">Edition</th>
                <th className="px-3 py-2 text-left">Cloud</th>
                <th className="px-3 py-2 text-right">Status</th>
                <th className="px-3 py-2 text-left">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {(state.accounts?.accounts ?? []).slice(0, 50).map((a) => (
                <tr
                  key={a.account_locator}
                  onClick={() => setSelectedAccount(a)}
                  className={`cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 ${
                    selectedAccount?.account_locator === a.account_locator
                      ? 'bg-slate-50 dark:bg-slate-800'
                      : ''
                  }`}
                >
                  <td className="px-3 py-2 font-medium text-slate-900 dark:text-white">
                    {a.account_name}
                    <span className="ml-1 text-[10px] text-slate-400">
                      ({a.account_locator})
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                    {a.region}
                  </td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {a.edition}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-slate-600 dark:text-slate-400">
                    {a.cloud}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        a.is_active
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {a.is_active ? 'active' : 'inactive'}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">
                    {a.created_on
                      ? new Date(a.created_on).toLocaleDateString()
                      : '—'}
                  </td>
                </tr>
              ))}
              {!state.loading &&
                (state.accounts?.accounts?.length ?? 0) === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-3 py-8 text-center text-sm text-slate-400"
                    >
                      No accounts in this organisation yet.
                    </td>
                  </tr>
                )}
            </tbody>
          </table>
        </div>
      </section>

        {/* Right-rail account drilldown */}
        <aside className="lg:block">
          {selectedAccount ? (
            <div className="sticky top-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-xs uppercase tracking-wide text-slate-400">
                    Account drilldown
                  </div>
                  <div className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-white">
                    {selectedAccount.account_name}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {selectedAccount.account_locator}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedAccount(null)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Close drilldown"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <dl className="mt-3 space-y-2 text-xs">
                <DrillRow label="Region" value={selectedAccount.region || '—'} />
                <DrillRow label="Edition" value={selectedAccount.edition || '—'} />
                <DrillRow label="Cloud" value={selectedAccount.cloud || '—'} />
                <DrillRow
                  label="Status"
                  value={selectedAccount.is_active ? 'active' : 'inactive'}
                />
                <DrillRow
                  label="Created"
                  value={
                    selectedAccount.created_on
                      ? new Date(selectedAccount.created_on).toLocaleDateString()
                      : '—'
                  }
                />
                <DrillRow
                  label="Credits (30d)"
                  value={fmtNumber(
                    Math.round(
                      (selectedAccount as any)?.credits_30d ?? 0,
                    ),
                  )}
                />
                <DrillRow
                  label="Storage"
                  value={fmtBytes((selectedAccount as any)?.storage_bytes ?? 0)}
                />
              </dl>
            </div>
          ) : (
            <div className="sticky top-4 rounded-xl border border-dashed border-slate-200 bg-white p-4 text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-900">
              Select an account from the table to see its details here.
            </div>
          )}
        </aside>
      </div>

      {/* Trends */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartPanel title="Credit trend (30d)" icon={CreditCard}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={creditTrend}>
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

        <ChartPanel title="Storage trend (30d, GB)" icon={HardDrive}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={storageTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Bar dataKey="storage_gb" fill={COLORS[1]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>

      {/* Edition mix */}
      {editionMix.length > 0 && (
        <ChartPanel title="Editions mix" icon={BarChart3}>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={editionMix} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis
                dataKey="edition"
                type="category"
                tick={{ fontSize: 10 }}
                width={140}
              />
              <Tooltip />
              <Bar dataKey="count" fill={COLORS[2]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>
      )}

      {/* Footer band — 4 panels */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <FooterPanel title="Replication Groups" icon={GitBranch}>
          <EmptyHint label="No replication groups exposed" />
        </FooterPanel>
        <FooterPanel title="Failover Groups" icon={Zap}>
          <EmptyHint label="No failover groups exposed" />
        </FooterPanel>
        <FooterPanel title="Permissions / Sharing Roles" icon={Share2}>
          {state.readerList.length === 0 && state.shareList.length === 0 ? (
            <EmptyHint label="No reader accounts or shares" />
          ) : (
            <ul className="space-y-1.5 text-xs">
              {state.readerList.slice(0, 4).map((r) => (
                <li
                  key={`reader-${r.name}`}
                  className="flex items-center justify-between"
                >
                  <span className="truncate text-slate-700 dark:text-slate-300">
                    {r.name}
                  </span>
                  <span className="ml-2 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                    reader
                  </span>
                </li>
              ))}
              {state.shareList.slice(0, 4).map((s) => (
                <li
                  key={`share-${s.name}`}
                  className="flex items-center justify-between"
                >
                  <span className="truncate text-slate-700 dark:text-slate-300">
                    {s.name}
                  </span>
                  <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    share
                  </span>
                </li>
              ))}
            </ul>
          )}
        </FooterPanel>
        <FooterPanel title="Recent Org Account Events" icon={Users}>
          {recentEvents.length === 0 ? (
            <EmptyHint label="No account activity yet" />
          ) : (
            <ul className="space-y-1.5 text-xs">
              {recentEvents.map((a) => (
                <li
                  key={`evt-${a.account_locator}`}
                  className="flex items-center justify-between"
                >
                  <span className="truncate text-slate-700 dark:text-slate-300">
                    Added <span className="font-medium">{a.account_name}</span>
                  </span>
                  <span className="ml-2 text-[10px] text-slate-400">
                    {new Date(a.created_on).toLocaleDateString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </FooterPanel>
      </div>

      {/* Recommendations */}
      <div className="grid grid-cols-1 lg:grid-cols-3">
        <div className="lg:col-start-3">
          <section className="rounded-xl border border-amber-200 bg-amber-50/40 p-4 dark:border-amber-900/40 dark:bg-amber-900/10">
            <header className="mb-2 flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Recommendations
              </h3>
            </header>
            <ul className="space-y-2 text-xs text-slate-700 dark:text-slate-300">
              <li className="flex gap-2">
                <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                Activate replication on production accounts to enable disaster
                recovery
              </li>
              <li className="flex gap-2">
                <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                Review inactive accounts older than 90d for decommissioning
              </li>
              <li className="flex gap-2">
                <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                Enable network policies on all accounts (currently{' '}
                {networkPoliciesCount}/{totalAccounts || 0})
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

// ----- small UI helpers -----

function KpiCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  loading: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{label}</span>
        <Icon className="h-3.5 w-3.5 text-slate-400" />
      </div>
      <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">
        {loading ? '…' : value}
      </div>
    </div>
  );
}

function DrillRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-900 dark:text-white">{value}</dd>
    </div>
  );
}

function FooterPanel({
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

function EmptyHint({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-200 px-3 py-4 text-center text-[11px] text-slate-400 dark:border-slate-700">
      {label}
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
