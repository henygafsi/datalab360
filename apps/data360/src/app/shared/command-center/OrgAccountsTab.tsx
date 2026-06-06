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
import toast from 'react-hot-toast';
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
  getReplication,
  getShares,
} from '@/app/services/org-accounts/hooks';
import { getApiErrorMessage } from '@/lib/api-client';
import type {
  AccountsListResponse,
  ClientAccount,
  DashboardOverviewResponse,
  DashboardTrendsResponse,
  ReplicationResponse,
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
  replication: ReplicationResponse | null;
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

/**
 * Detect an API error envelope returned as 200 OK (e.g. {error_code, message}
 * or {success:false}). The org-level endpoints return this when the current
 * Snowflake role can't read SNOWFLAKE.ORGANIZATION_USAGE.* — i.e. the logged-in
 * account is NOT a Snowflake Organization account.
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

export default function OrgAccountsTab() {
  const [state, setState] = useState<OrgAccountsState>({
    overview: null,
    accounts: null,
    trends: null,
    replication: null,
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
    // Settle all calls so one failure never blanks the others. Crucially we
    // DISTINGUISH the two failure modes that used to be silently swallowed:
    //   • a rejected promise = a genuine network/HTTP error → surface it
    //     (error banner + toast) so the user knows the data is stale/missing;
    //   • a fulfilled 200-OK error envelope = the Snowflake role can't read
    //     ORGANIZATION_USAGE.* → not an error, degrade to the friendly
    //     "not a Snowflake Organization account" state (handled downstream).
    const [overviewR, accountsR, trendsR, readerR, shareR, replicationR] =
      await Promise.allSettled([
        getDashboardOverview(),
        getAccounts(),
        getDashboardTrends(30),
        getReaderAccounts(),
        getShares(),
        getReplication(30),
      ]);

    const val = <T,>(r: PromiseSettledResult<T>): T | null =>
      r.status === 'fulfilled' ? r.value : null;

    // A core org-level call that REJECTED (vs. returned an error envelope) is a
    // real failure worth surfacing. Reader/shares are footnote panels, so we
    // don't promote their failure to a page-level error.
    const coreRejection = [overviewR, accountsR, trendsR].find(
      (r): r is PromiseRejectedResult => r.status === 'rejected',
    );

    const overviewRaw = val(overviewR);
    const accountsRaw = val(accountsR);
    const trendsRaw = val(trendsR);
    const readerRes = val(readerR);
    const shareRes = val(shareR);
    const replicationRaw = val(replicationR);

    // Treat error-envelope 200s (role can't read org views) as "no data" so
    // the UI shows the friendly not-an-org state instead of a wall of zeros.
    const overview = isApiError(overviewRaw) ? null : overviewRaw;
    const accounts = isApiError(accountsRaw) ? null : accountsRaw;
    const trends = isApiError(trendsRaw) ? null : trendsRaw;
    // Replication is a best-effort footnote panel (like reader/shares): a
    // failure here must not blank the page, so it is NOT part of coreRejection.
    const replication = isApiError(replicationRaw) ? null : replicationRaw;
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

    const errorMsg = coreRejection
      ? getApiErrorMessage(coreRejection.reason) ||
        'Failed to load organization accounts'
      : null;
    if (errorMsg) toast.error(errorMsg);

    setState({
      overview,
      accounts,
      trends,
      replication,
      readers: readerList.length,
      shares: shareList.length,
      readerList,
      shareList,
      loading: false,
      error: errorMsg,
    });
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
    // `/dashboard/trends` emits each credit point as {date, credits}. The shared
    // CreditTrendPoint type (usage_date/total_credits) describes the *separate*
    // /credits/trend endpoint and is stale here, so cast to the real shape and
    // read the keys the backend actually returns.
    const rows = (state.trends?.credits ?? []) as Array<{
      date?: string;
      credits?: number;
    }>;
    return rows.map((r) => ({
      date: r.date ?? '',
      credits: r.credits ?? 0,
    }));
  }, [state.trends]);

  const storageTrend = useMemo(() => {
    // `/dashboard/trends` emits each storage point as {date, bytes}.
    const rows = (state.trends?.storage ?? []) as Array<{
      date?: string;
      bytes?: number;
    }>;
    return rows.map((r) => ({
      date: r.date ?? '',
      storage_gb: (r.bytes ?? 0) / 1e9,
    }));
  }, [state.trends]);

  // Account distribution by region / cloud. The /dashboard/overview handler may
  // omit these (optional in the contract), so guard with `?? {}` — the charts
  // below render only when the backend actually supplies the breakdown.
  const regionDist = useMemo(() => {
    const byRegion = state.overview?.overview?.accounts_by_region ?? {};
    return Object.entries(byRegion).map(([region, count]) => ({
      region,
      count,
    }));
  }, [state.overview]);

  const cloudDist = useMemo(() => {
    const byCloud = state.overview?.overview?.accounts_by_cloud ?? {};
    return Object.entries(byCloud).map(([cloud, count]) => ({ cloud, count }));
  }, [state.overview]);

  // Query-volume trend from the already-fetched trends payload. `/dashboard/
  // trends` does not currently return a `queries` array, so this stays empty
  // (the panel is suppressed) until the backend adds it; reads the typed
  // QueryTrendPoint fields when present.
  const queryTrend = useMemo(() => {
    const rows = state.trends?.queries ?? [];
    return rows.map((q) => ({ date: q.query_date, queries: q.query_count }));
  }, [state.trends]);

  // ----- render -----
  const o = state.overview?.overview;
  const totalAccounts = o?.total_client_accounts ?? 0;
  const activeAccounts = o?.active_accounts ?? 0;
  const inactiveAccounts = o?.inactive_accounts ?? 0;
  const orgCredits = o?.total_credits_30d ?? 0;
  const orgStorageBytes = o?.total_storage_bytes ?? 0;
  const replicationGroupsCount = o?.replication_groups_count ?? 0;
  const failoverGroupsCount = o?.failover_groups_count ?? 0;
  const managedAccountsCount =
    o?.managed_accounts_count ?? state.accounts?.accounts?.length ?? 0;
  const networkPoliciesCount = o?.network_policies_count ?? 0;
  // Backend tells us when the Snowflake role can't see org-level data so
  // the UI can show a clear empty/CTA state instead of a wall of zeros.
  // Org-admin gating: prefer the backend's explicit is_org_admin (real ORGADMIN
  // capability via SHOW ORGANIZATION ACCOUNTS); fall back to the legacy signal.
  const isOrgAdmin =
    typeof o?.is_org_admin === 'boolean'
      ? o.is_org_admin
      : o?.org_admin_available !== false;
  const orgAdminAvailable = isOrgAdmin;
  // When not an org admin the backend returns the caller's OWN account data
  // (scope="account") — label credit/storage accordingly instead of "Org".
  const acctScope = o?.scope === 'account' || !isOrgAdmin;
  const accountCount = state.accounts?.accounts?.length ?? 0;
  // "Not a Snowflake Organization account" — the common case. We reach this
  // when loading finished but every org-level call returned null/empty (the
  // role can't read SNOWFLAKE.ORGANIZATION_USAGE.*). Render one friendly info
  // panel instead of nine zeroed KPI cards + empty charts.
  const notOrgAccount =
    !state.loading &&
    !state.error &&
    !state.overview &&
    accountCount === 0;

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

  // Friendly, non-error empty state for the common case: this account is not a
  // Snowflake Organization account, so there is simply nothing org-level to
  // show. This is NOT an error — render an info panel, not a red banner.
  if (notOrgAccount) {
    return (
      <div className="space-y-6">
        <div className="rounded-xl border border-slate-200 bg-white p-8 dark:border-slate-700 dark:bg-slate-900">
          <div className="mx-auto max-w-md text-center">
            <Building2 className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
            <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-white">
              This account is not a Snowflake Organization account
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Organization-level metrics (multi-account roll-ups, replication and
              failover groups, cross-account credits and storage) are only
              available when the connected Snowflake account has the{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-[10px] dark:bg-slate-800">
                ORGADMIN
              </code>{' '}
              role and reads{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-[10px] dark:bg-slate-800">
                SNOWFLAKE.ORGANIZATION_USAGE
              </code>
              . Per-account metrics are still available on the other tabs.
            </p>
            <button
              type="button"
              onClick={fetchAll}
              className="mt-4 inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Data-driven recommendations derived from the loaded org data. Each entry is
  // conditional, so the panel only ever surfaces real, actionable findings.
  const recommendations: string[] = [];
  if (
    replicationGroupsCount === 0 &&
    (state.replication?.replication?.length ?? 0) === 0
  ) {
    recommendations.push(
      'No replication detected — activate replication on production accounts to enable disaster recovery.',
    );
  }
  if (inactiveAccounts > 0) {
    recommendations.push(
      `Review ${inactiveAccounts} inactive account${
        inactiveAccounts > 1 ? 's' : ''
      } for decommissioning.`,
    );
  }
  if (totalAccounts > 0 && networkPoliciesCount < totalAccounts) {
    recommendations.push(
      `Enable network policies on all accounts (currently ${networkPoliciesCount}/${totalAccounts}).`,
    );
  }

  return (
    <div className="space-y-6">
      {/* ORGADMIN-not-granted notice — the Snowflake role used by this user
          can't see org-level views, so every aggregate below would be 0. */}
      {!state.loading && !orgAdminAvailable && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-semibold">Organization-level access not enabled</p>
              <p className="mt-1 text-xs leading-relaxed">
                This Snowflake account does not have the <code>ORGADMIN</code> role granted,
                so the multi-account organization views are unavailable. Per-account
                metrics (credits, storage, warehouses) are still loaded below.
                Ask a Snowflake org administrator to grant <code>ORGADMIN</code> to enable
                cross-account roll-ups.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Top-strip KPIs */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-9">
        <KpiCard
          icon={Building2}
          label="Accounts in org"
          value={isOrgAdmin ? fmtNumber(totalAccounts) : '—'}
          loading={state.loading}
        />
        <KpiCard
          icon={ShieldCheck}
          label="Active / Inactive"
          value={isOrgAdmin ? `${activeAccounts} / ${inactiveAccounts}` : '—'}
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
          label={acctScope ? 'Account credits (30d)' : 'Org credits (30d)'}
          value={fmtNumber(Math.round(orgCredits))}
          loading={state.loading}
          trendPct={o?.credits_trend_pct}
        />
        <KpiCard
          icon={HardDrive}
          label={acctScope ? 'Account storage' : 'Org storage'}
          value={fmtBytes(orgStorageBytes)}
          loading={state.loading}
        />
        <KpiCard
          icon={Database}
          label="Reader / Shares"
          value={isOrgAdmin ? `${state.readers} / ${state.shares}` : '—'}
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
          value={isOrgAdmin ? fmtNumber(managedAccountsCount) : '—'}
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

      {/* Query volume trend — renders only when /dashboard/trends supplies a
          `queries` array (suppressed otherwise so there is no empty chart). */}
      {queryTrend.length > 0 && (
        <ChartPanel title="Query volume (30d)" icon={BarChart3}>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={queryTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="queries"
                stroke={COLORS[5]}
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
      )}

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

      {/* Account distribution by region / cloud — appears when the backend
          supplies accounts_by_region / accounts_by_cloud. */}
      {(regionDist.length > 0 || cloudDist.length > 0) && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {regionDist.length > 0 && (
            <ChartPanel title="Accounts by region" icon={Building2}>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={regionDist} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10 }}
                    allowDecimals={false}
                  />
                  <YAxis
                    dataKey="region"
                    type="category"
                    tick={{ fontSize: 10 }}
                    width={120}
                  />
                  <Tooltip />
                  <Bar dataKey="count" fill={COLORS[3]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
          )}
          {cloudDist.length > 0 && (
            <ChartPanel title="Accounts by cloud" icon={Cloud}>
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={cloudDist} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 10 }}
                    allowDecimals={false}
                  />
                  <YAxis
                    dataKey="cloud"
                    type="category"
                    tick={{ fontSize: 10 }}
                    width={120}
                  />
                  <Tooltip />
                  <Bar dataKey="count" fill={COLORS[4]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartPanel>
          )}
        </div>
      )}

      {/* Footer band — 4 panels */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        <FooterPanel title="Replication Groups" icon={GitBranch}>
          {(state.replication?.replication?.length ?? 0) === 0 ? (
            <EmptyHint label="No replication usage in the last 30 days" />
          ) : (
            <ul className="space-y-1.5 text-xs">
              {(state.replication?.replication ?? [])
                .slice()
                .sort((a, b) => b.total_credits - a.total_credits)
                .slice(0, 5)
                .map((r) => (
                  <li
                    key={`repl-${r.account_name}`}
                    className="flex items-center justify-between gap-2"
                  >
                    <span className="truncate text-slate-700 dark:text-slate-300">
                      {r.account_name}
                    </span>
                    <span className="whitespace-nowrap text-[10px] text-slate-500">
                      {fmtNumber(Math.round(r.total_credits))} cr ·{' '}
                      {fmtBytes(r.total_bytes_transferred)}
                    </span>
                  </li>
                ))}
            </ul>
          )}
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
              {recommendations.length === 0 ? (
                <li className="flex gap-2">
                  <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  No action items — organization configuration looks healthy.
                </li>
              ) : (
                recommendations.map((rec, i) => (
                  <li key={`rec-${i}`} className="flex gap-2">
                    <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                    {rec}
                  </li>
                ))
              )}
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
  trendPct,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  loading: boolean;
  // Optional month-over-month delta (already a percentage, e.g. 12.3 = +12.3%).
  trendPct?: number | null;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{label}</span>
        <Icon className="h-3.5 w-3.5 text-slate-400" />
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-xl font-semibold text-slate-900 dark:text-white">
          {loading ? '…' : value}
        </span>
        {!loading && trendPct != null && (
          <span
            title="Month-over-month change"
            className={`rounded px-1 py-0.5 text-[10px] font-medium ${
              trendPct >= 0
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
            }`}
          >
            {trendPct >= 0 ? '▲' : '▼'} {Math.abs(trendPct).toFixed(1)}%
          </span>
        )}
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
