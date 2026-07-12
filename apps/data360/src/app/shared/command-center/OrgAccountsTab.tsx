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
  AlertTriangle,
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
  ShieldCheck,
  Users,
  Zap,
  type LucideIcon,
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
import { useRouter } from 'next/navigation';
import {
  getAccounts,
  getAnomalies,
  getDashboardOverview,
  getDashboardTrends,
  getReaderAccounts,
  getReplication,
  getShares,
} from '@/app/services/org-accounts/hooks';
import apiClient, { getApiErrorMessage } from '@/lib/api-client';
import { InsightActionButton } from '@/app/shared/insights';
import { dash } from '@/app/shared/ui/format';
import AuditTable, { type Row } from './AuditTable';
import type {
  AccountsListResponse,
  AnomalyEntry,
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

// ── ORG ACCOUNTS KPI deep-dive registry ──────────────────────────────────────
// One entry per clickable KPI card: what it means, where the number comes from,
// and how fresh that source is. The drawer pairs this with the REAL rows behind
// the number so a click answers "what is this / why / where" without scrolling.
type OrgKpiId =
  | 'accounts'
  | 'active_inactive'
  | 'editions'
  | 'credits'
  | 'storage'
  | 'reader_shares'
  | 'replication'
  | 'failover'
  | 'managed';

interface OrgKpiMeta {
  title: string;
  definition: string;
  source: string;
  /** Honest latency note — ORGANIZATION_USAGE views lag up to 24h (Snowflake docs). */
  freshness: string;
}

const ORG_KPI_META: Record<OrgKpiId, OrgKpiMeta> = {
  accounts: {
    title: 'Accounts in organization',
    definition: 'Total client accounts under this Snowflake organization (any lifecycle state).',
    source: 'SNOWFLAKE.ORGANIZATION_USAGE.ACCOUNTS',
    freshness: 'Org metadata — latency up to 24h; not live.',
  },
  active_inactive: {
    title: 'Active / Inactive accounts',
    definition: 'Accounts with vs without query activity in the selected window.',
    source: 'ORGANIZATION_USAGE.ACCOUNTS × QUERY_HISTORY',
    freshness: 'Activity derived from QUERY_HISTORY (≈45-min latency).',
  },
  editions: {
    title: 'Editions in use',
    definition: 'Distinct Snowflake editions across the organization’s accounts, with account counts.',
    source: 'ORGANIZATION_USAGE.ACCOUNTS.edition',
    freshness: 'Org metadata — latency up to 24h.',
  },
  credits: {
    title: 'Organization credits (30d)',
    definition: 'Total credits consumed across all accounts in the window.',
    source: 'ORGANIZATION_USAGE.USAGE_IN_CURRENCY_DAILY',
    freshness: 'Daily usage — up to 24h latency; bounded by the date range.',
  },
  storage: {
    title: 'Organization storage',
    definition: 'Total storage (active + time-travel + fail-safe) across accounts.',
    source: 'ORGANIZATION_USAGE.STORAGE_DAILY_HISTORY',
    freshness: 'Daily storage — up to 24h latency.',
  },
  reader_shares: {
    title: 'Reader accounts / Shares',
    definition: 'Managed reader accounts and outbound shares — the data-sharing footprint.',
    source: 'SHOW MANAGED ACCOUNTS · SHOW SHARES',
    freshness: 'Live SHOW commands (current).',
  },
  replication: {
    title: 'Replication groups',
    definition: 'Replication groups and their cross-region transfer credits.',
    source: 'ORGANIZATION_USAGE.REPLICATION_GROUP_USAGE_HISTORY',
    freshness: 'Up to 24h latency; bounded by the date range.',
  },
  failover: {
    title: 'Failover groups',
    definition: 'Failover groups configured for business-continuity across accounts.',
    source: 'SHOW FAILOVER GROUPS',
    freshness: 'Live SHOW command (current).',
  },
  managed: {
    title: 'Managed accounts',
    definition: 'Accounts this organization administers (reader + full managed accounts).',
    source: 'SHOW MANAGED ACCOUNTS',
    freshness: 'Live SHOW command (current).',
  },
};

interface OrgKpiDrawerData {
  id: OrgKpiId;
  meta: OrgKpiMeta;
  columns: string[];
  rows: Row[];
}

interface OrgAccountsState {
  overview: DashboardOverviewResponse | null;
  accounts: AccountsListResponse | null;
  trends: DashboardTrendsResponse | null;
  replication: ReplicationResponse | null;
  readers: number;
  shares: number;
  readerList: Array<{ name: string; cloud?: string; region?: string }>;
  shareList: Array<{ name: string; database_name?: string; kind?: string }>;
  /** Cost anomalies (z-score credit spikes). Null = not yet loaded or failed. */
  anomalies: AnomalyEntry[] | null;
  loading: boolean;
  error: string | null;
}

function fmtBytes(b: number | null | undefined): string {
  // Missing (null/undefined) is "unknown" → em dash, not a fabricated 0. A
  // genuine 0 still renders '0' (it then falls through the `!b` guard below).
  if (b == null) return '—';
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

export default function OrgAccountsTab({ onNavigateTab }: { onNavigateTab?: (id: string) => void } = {}) {
  const [state, setState] = useState<OrgAccountsState>({
    overview: null,
    accounts: null,
    trends: null,
    replication: null,
    readers: 0,
    shares: 0,
    readerList: [],
    shareList: [],
    anomalies: null,
    loading: true,
    error: null,
  });
  const router = useRouter();
  // Per-account audit (/org-accounts/accounts/audit) — ORGADMIN-only,
  // fetched lazily once overview confirms org-admin scope (see effect below).
  const [accountsAudit, setAccountsAudit] = useState<{ rows: Row[]; loaded: boolean }>({
    rows: [],
    loaded: false,
  });

  const fetchAll = async () => {
    setState((s) => ({ ...s, loading: true, error: null }));
    // Settle all calls so one failure never blanks the others. Crucially we
    // DISTINGUISH the two failure modes that used to be silently swallowed:
    //   • a rejected promise = a genuine network/HTTP error → surface it
    //     (error banner + toast) so the user knows the data is stale/missing;
    //   • a fulfilled 200-OK error envelope = the Snowflake role can't read
    //     ORGANIZATION_USAGE.* → not an error, degrade to the friendly
    //     "not a Snowflake Organization account" state (handled downstream).
    const [overviewR, accountsR, trendsR, readerR, shareR, replicationR, anomaliesR] =
      await Promise.allSettled([
        getDashboardOverview(),
        getAccounts(),
        getDashboardTrends(30),
        getReaderAccounts(),
        getShares(),
        getReplication(30),
        // Anomalies is a footnote panel — failure must NOT blank the page.
        // NOTE: calls /org-accounts/anomalies. The task spec names
        // /org-accounts/finops/anomalies — if that route differs on the backend,
        // this will 404 and render the honest empty state. Hand-off to backend
        // team to confirm the canonical path.
        getAnomalies(30),
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
    const anomaliesRes = val(anomaliesR);

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
    // Anomalies: best-effort footnote. Null on failure → honest empty state.
    const anomalies = isApiError(anomaliesRes)
      ? null
      : (anomaliesRes?.anomalies ?? null);

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
      anomalies,
      loading: false,
      error: errorMsg,
    });
  };

  useEffect(() => {
    void fetchAll();
  }, []);

  // Per-account audit (/org-accounts/accounts/audit) — ORGADMIN-only.
  // Fetched lazily once overview resolves and confirms org-admin scope, so a
  // non-ORGADMIN account never fires this 60s-timeout call. Route-order note:
  // if the backend hasn't registered /accounts/audit ahead of crud's
  // /accounts/{name}, this resolves to a 404/garbage — isApiError + catch
  // degrade it silently and it never blocks the page.
  // ORCHESTRATOR: promote this inline apiClient call to getAccountsAudit() in
  // services/org-accounts/hooks.ts + an `orgAccounts.accountsAudit` contract entry.
  useEffect(() => {
    if (state.loading) return;
    const ov = state.overview?.overview;
    const orgAdmin =
      typeof ov?.is_org_admin === 'boolean'
        ? ov.is_org_admin
        : ov?.org_admin_available !== false;
    if (!ov || !orgAdmin) {
      setAccountsAudit({ rows: [], loaded: true });
      return;
    }
    let cancelled = false;
    apiClient
      .get('/org-accounts/accounts/audit', { params: { days: 30 }, timeout: 60000 })
      .then((res) => {
        if (cancelled) return;
        const d = res.data as unknown;
        if (isApiError(d)) {
          setAccountsAudit({ rows: [], loaded: true });
          return;
        }
        const obj = d as Record<string, unknown>;
        const arr = Array.isArray(d)
          ? d
          : Array.isArray(obj?.data)
            ? (obj.data as unknown[])
            : Array.isArray(obj?.accounts)
              ? (obj.accounts as unknown[])
              : Array.isArray(obj?.audit)
                ? (obj.audit as unknown[])
                : [];
        setAccountsAudit({ rows: arr as Row[], loaded: true });
      })
      .catch(() => {
        if (!cancelled) setAccountsAudit({ rows: [], loaded: true });
      });
    return () => {
      cancelled = true;
    };
  }, [state.loading, state.overview]);

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
  // HONESTY (R3): when the overview payload is absent (fetch failed / not loaded),
  // every count is UNKNOWN → null → renders '—'. A `?? 0` here fabricated a "0"
  // whenever /dashboard/overview transiently errored, so the KPI cards showed
  // "0 accounts" while the accounts-list endpoint (and the deep-dive drawer) showed
  // the real 36 — a live-caught contradiction. Never a fake zero; a genuine 0 from
  // the backend still renders 0.
  const totalAccounts = o?.total_client_accounts ?? null;
  const activeAccounts = o?.active_accounts ?? null;
  const inactiveAccounts = o?.inactive_accounts ?? null;
  const orgCredits = o?.total_credits_30d ?? null;
  const orgStorageBytes = o?.total_storage_bytes ?? null;
  const replicationGroupsCount = o?.replication_groups_count ?? null;
  const failoverGroupsCount = o?.failover_groups_count ?? null;
  // Managed accounts: prefer the overview figure; fall back to the accounts-list
  // length ONLY when that list actually loaded (else null → '—', never a fake 0).
  const managedAccountsCount =
    o?.managed_accounts_count ??
    (state.accounts?.accounts ? state.accounts.accounts.length : null);
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

  // ----- bottom audit tables (de-capped — every row, paginated via AuditTable) -----
  // Connected-accounts enumeration. created_on stays a raw ISO so AuditTable
  // auto-detects a date filter; status is pre-derived so it reads human-friendly.
  const accountRows: Row[] = useMemo(
    () =>
      (state.accounts?.accounts ?? []).map((a) => ({
        account: a.account_name,
        locator: a.account_locator,
        region: a.region,
        edition: a.edition,
        cloud: a.cloud,
        status: a.is_active ? 'active' : 'inactive',
        created_on: a.created_on,
      })),
    [state.accounts],
  );
  // Replication / failover transfer footprint (was the capped footer list).
  const replicationRows: Row[] = useMemo(
    () =>
      (state.replication?.replication ?? [])
        .slice()
        .sort((a, b) => b.total_credits - a.total_credits)
        .map((r) => ({
          account: r.account_name,
          credits: Math.round(r.total_credits),
          bytes_transferred: r.total_bytes_transferred,
        })),
    [state.replication],
  );
  const readerRows: Row[] = useMemo(
    () =>
      state.readerList.map((r) => ({
        name: r.name,
        cloud: r.cloud ?? '—',
        region: r.region ?? '—',
      })),
    [state.readerList],
  );
  const shareRows: Row[] = useMemo(
    () =>
      state.shareList.map((s) => ({
        name: s.name,
        database: s.database_name ?? '—',
        kind: s.kind ?? '—',
      })),
    [state.shareList],
  );

  // ── Per-KPI deep-dive drawer ─────────────────────────────────────────────
  // Each ORG ACCOUNTS KPI is clickable; clicking opens a right-side drawer with
  // the KPI's definition, its Snowflake/Data360 source, an honest freshness note
  // (ORGANIZATION_USAGE lags up to 24h — spec §1), and the REAL rows behind the
  // number (reusing the row sets already built above — no new fetch, no scroll).
  const [openKpi, setOpenKpi] = useState<OrgKpiId | null>(null);
  const kpiDrawer = useMemo<OrgKpiDrawerData | null>(() => {
    if (!openKpi) return null;
    const meta = ORG_KPI_META[openKpi];
    const ev: { columns: string[]; rows: Row[] } = (() => {
      switch (openKpi) {
        case 'accounts':
        case 'managed':
          return { columns: ['account', 'locator', 'region', 'cloud', 'edition', 'status'], rows: accountRows };
        case 'active_inactive':
          return {
            columns: ['account', 'region', 'edition', 'status'],
            rows: accountRows.map((r) => ({ account: r.account, region: r.region, edition: r.edition, status: r.status })),
          };
        case 'editions':
          return { columns: ['edition', 'count'], rows: editionMix.map((e) => ({ edition: e.edition, count: e.count })) };
        case 'credits':
          return { columns: ['date', 'credits'], rows: creditTrend.map((c) => ({ date: c.date, credits: Math.round(c.credits) })) };
        case 'storage':
          return { columns: ['date', 'gb'], rows: storageTrend.map((s: any) => ({ date: s.date, gb: s.gb ?? s.bytes ?? 0 })) };
        case 'reader_shares':
          return {
            columns: ['name', 'kind', 'region_or_db'],
            rows: [
              ...readerRows.map((r) => ({ name: r.name, kind: 'reader account', region_or_db: r.region })),
              ...shareRows.map((s) => ({ name: s.name, kind: `share (${s.kind})`, region_or_db: s.database })),
            ],
          };
        case 'replication':
        case 'failover':
          return { columns: ['account', 'credits', 'bytes_transferred'], rows: replicationRows };
        default:
          return { columns: [], rows: [] };
      }
    })();
    return { id: openKpi, meta, columns: ev.columns, rows: ev.rows };
  }, [openKpi, accountRows, editionMix, creditTrend, storageTrend, readerRows, shareRows, replicationRows]);

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
              This account is not an Organization account
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              Organization-level metrics (multi-account roll-ups, replication and
              failover groups, cross-account credits and storage) are only
              available when the connected account has the{' '}
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

  // Data-driven recommendations → honestly-gated CTAs. Each entry is
  // conditional, so the panel only ever surfaces real, actionable findings.
  // `nav` entries route to a real management surface; `unavailable` entries use
  // the gate's honest disabled affordance when there is no in-app target.
  type RecoCta =
    | { kind: 'nav'; text: string; label: string; icon: LucideIcon; href: string }
    | { kind: 'unavailable'; text: string; label: string; icon: LucideIcon; hint: string };
  const recoCtas: RecoCta[] = [];
  if (
    replicationGroupsCount === 0 &&
    (state.replication?.replication?.length ?? 0) === 0
  ) {
    recoCtas.push({
      kind: 'unavailable',
      text: 'No replication detected — enable replication on production accounts for disaster recovery.',
      label: 'Activate replication',
      icon: GitBranch,
      hint: 'Replication is enabled per-account in the data warehouse',
    });
  }
  if (inactiveAccounts != null && inactiveAccounts > 0) {
    recoCtas.push({
      kind: 'nav',
      text: `Review ${inactiveAccounts} inactive account${
        inactiveAccounts > 1 ? 's' : ''
      } for decommissioning.`,
      label: 'Review inactive accounts',
      icon: Users,
      href: '/account-overview?tab=snowflake-accounts',
    });
  }
  if (totalAccounts != null && totalAccounts > 0 && networkPoliciesCount < totalAccounts) {
    recoCtas.push({
      kind: 'nav',
      text: `Enable network policies on all accounts (currently ${networkPoliciesCount}/${totalAccounts}).`,
      label: 'Enable network policy',
      icon: ShieldCheck,
      // Canonical surface is the unified Policies page (Network tab). The
      // standalone /governance/network-policies route was removed (dedupe).
      href: '/governance/policies',
    });
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
                This account does not have the <code>ORGADMIN</code> role granted,
                so the multi-account organization views are unavailable. Per-account
                metrics (credits, storage, warehouses) are still loaded below.
                Ask an org administrator to grant <code>ORGADMIN</code> to enable
                cross-account roll-ups.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Top-strip KPIs — max 3 across. This strip renders in a narrow sub-column
          (~460px), so lg:grid-cols-9 clipped every card to ~130px ("Accou in org",
          "ENT · STA", "Man Acc" — spec forbids clipped values). 3-across gives each
          card ~150px so labels wrap on word boundaries and 9 cards form 3 clean rows. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <KpiCard
          icon={Building2}
          label="Accounts in org"
          value={isOrgAdmin ? fmtNumber(totalAccounts) : '—'}
          loading={state.loading}
          onClick={isOrgAdmin ? () => setOpenKpi('accounts') : undefined}
        />
        <KpiCard
          icon={ShieldCheck}
          label="Active / Inactive"
          value={
            isOrgAdmin && activeAccounts != null && inactiveAccounts != null
              ? `${activeAccounts} / ${inactiveAccounts}`
              : '—'
          }
          loading={state.loading}
          onClick={
            isOrgAdmin && activeAccounts != null ? () => setOpenKpi('active_inactive') : undefined
          }
        />
        <KpiCard
          icon={Cloud}
          label="Editions in use"
          value={editionMix.map((e) => e.edition).join(' · ') || '—'}
          loading={state.loading}
          onClick={editionMix.length ? () => setOpenKpi('editions') : undefined}
        />
        <KpiCard
          icon={CreditCard}
          label={acctScope ? 'Account credits (30d)' : 'Org credits (30d)'}
          value={fmtNumber(orgCredits != null ? Math.round(orgCredits) : null)}
          loading={state.loading}
          trendPct={o?.credits_trend_pct}
          onClick={creditTrend.length ? () => setOpenKpi('credits') : undefined}
        />
        <KpiCard
          icon={HardDrive}
          label={acctScope ? 'Account storage' : 'Org storage'}
          value={fmtBytes(orgStorageBytes)}
          loading={state.loading}
          onClick={storageTrend.length ? () => setOpenKpi('storage') : undefined}
        />
        <KpiCard
          icon={Database}
          label="Reader / Shares"
          value={isOrgAdmin ? `${state.readers} / ${state.shares}` : '—'}
          loading={state.loading}
          onClick={isOrgAdmin ? () => setOpenKpi('reader_shares') : undefined}
        />
        <KpiCard
          icon={GitBranch}
          label="Replication Groups"
          value={replicationGroupsCount ? fmtNumber(replicationGroupsCount) : '—'}
          loading={state.loading}
          onClick={replicationRows.length ? () => setOpenKpi('replication') : undefined}
        />
        <KpiCard
          icon={Zap}
          label="Failover Groups"
          value={failoverGroupsCount ? fmtNumber(failoverGroupsCount) : '—'}
          loading={state.loading}
          onClick={replicationRows.length ? () => setOpenKpi('failover') : undefined}
        />
        <KpiCard
          icon={Layers}
          label="Managed Accounts"
          value={isOrgAdmin ? fmtNumber(managedAccountsCount) : '—'}
          loading={state.loading}
          onClick={isOrgAdmin ? () => setOpenKpi('managed') : undefined}
        />
      </div>

      {/* Per-KPI deep-dive drawer (dynamic right bar). Opens on KPI click; shows
          definition, source, freshness, and the REAL rows behind the number. */}
      {kpiDrawer && (
        <OrgKpiDrawer data={kpiDrawer} onClose={() => setOpenKpi(null)} />
      )}

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
            <ul className="space-y-3 text-xs text-slate-700 dark:text-slate-300">
              {recoCtas.length === 0 ? (
                <li className="flex gap-2">
                  <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                  No action items — organization configuration looks healthy.
                </li>
              ) : (
                recoCtas.map((c, i) => (
                  <li key={`rec-${i}`} className="space-y-1.5">
                    <div className="flex gap-2">
                      <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                      <span>{c.text}</span>
                    </div>
                    <div className="pl-3.5">
                      {c.kind === 'nav' ? (
                        <InsightActionButton
                          label={c.label}
                          icon={c.icon}
                          variant="subtle"
                          size="sm"
                          onAction={async () => {
                            // Same-page tab CTAs (/account-overview?tab=…) must switch
                            // tabs via the parent navigator — a router.push of a same-page
                            // ?tab= is a soft nav the mount-only tab reader ignores (it
                            // painted a false-success ✓ and, for 'inactive accounts', was
                            // circular). Cross-page hrefs stay a real navigation.
                            const m = c.href.match(/[?&]tab=([^&]+)/);
                            if (m && c.href.startsWith('/account-overview') && onNavigateTab) {
                              onNavigateTab(decodeURIComponent(m[1]));
                            } else {
                              router.push(c.href);
                            }
                          }}
                        />
                      ) : (
                        <InsightActionButton
                          label={c.label}
                          icon={c.icon}
                          variant="subtle"
                          size="sm"
                          capable={false}
                          unavailableHint={c.hint}
                          onAction={async () => undefined}
                        />
                      )}
                    </div>
                  </li>
                ))
              )}
            </ul>
          </section>
        </div>
      </div>

      {/* ===== Audit & detail — full-width paginated tables (the page scrolls,
              never the section). De-capped from the old footer/accounts grid. ===== */}
      <section className="space-y-4">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-slate-500" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Audit &amp; detail
          </h3>
        </div>

        {/* Connected accounts enumeration (replaces the old sliced/scrolling table) */}
        {accountRows.length > 0 ? (
          <AuditTable
            rows={accountRows}
            title="Connected accounts"
            subtitle="ORGANIZATION_USAGE.ACCOUNTS"
            pageSize={10}
          />
        ) : !state.loading && !orgAdminAvailable ? (
          <NeedsOrgAdminNote label="Connected accounts" />
        ) : (
          !state.loading && (
            <EmptyCard label="No accounts in this organisation yet." />
          )
        )}

        {/* Flagship per-account audit (credits · storage · queries · users).
            ORGADMIN-only — omitted silently when the role can't read org views. */}
        {orgAdminAvailable && accountsAudit.rows.length > 0 && (
          <AuditTable
            rows={accountsAudit.rows}
            title="Per-account audit"
            subtitle="/org-accounts/accounts/audit"
            pageSize={10}
          />
        )}

        {/* Replication / failover transfer footprint (was a 5-row footer cap) */}
        {replicationRows.length > 0 && (
          <AuditTable
            rows={replicationRows}
            title="Replication & failover footprint"
            subtitle="ORGANIZATION_USAGE.REPLICATION_USAGE_HISTORY"
            pageSize={10}
          />
        )}

        {/* Reader accounts + outbound shares (were 4-row footer caps) */}
        {(readerRows.length > 0 || shareRows.length > 0) && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {readerRows.length > 0 && (
              <AuditTable
                rows={readerRows}
                title="Reader accounts"
                subtitle="SHOW MANAGED ACCOUNTS"
                pageSize={10}
              />
            )}
            {shareRows.length > 0 && (
              <AuditTable
                rows={shareRows}
                title="Outbound shares"
                subtitle="SHOW SHARES"
                pageSize={10}
              />
            )}
          </div>
        )}

        {/* Cost anomalies — z-score credit spikes from /org-accounts/anomalies.
            Best-effort footnote panel; null = not loaded / route not yet live.
            NOTE: backend spec names /org-accounts/finops/anomalies — verify
            the canonical path and update getAnomalies if it differs. */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
          <div className="mb-3 flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-orange-500" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Cost anomalies
            </h3>
            {state.anomalies !== null && state.anomalies.length > 0 && (
              <span className="ml-auto rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                {state.anomalies.length}
              </span>
            )}
          </div>
          {state.loading ? (
            <div className="h-8 w-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          ) : state.anomalies === null || state.anomalies.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              No anomalies detected.
            </p>
          ) : (
            <ul className="space-y-2">
              {state.anomalies.slice(0, 8).map((a, i) => {
                // Excess credits above forecast — honest derived value, not fake.
                const excess = a.actual_value - a.forecasted_value;
                return (
                  <li
                    key={i}
                    className="flex items-start justify-between gap-3 rounded-lg bg-orange-50 px-3 py-2 text-[11px] dark:bg-orange-900/10"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 dark:text-white">
                        {a.account_name || a.account_locator}
                      </p>
                      <p className="text-slate-500 dark:text-slate-400">
                        {a.date}
                        {a.region ? ` · ${a.region}` : ''}
                      </p>
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="font-semibold text-orange-700 dark:text-orange-400">
                        {Number(a.actual_value).toLocaleString(undefined, { maximumFractionDigits: 1 })}{' '}
                        {a.currency || 'cr'}
                      </p>
                      {excess > 0 ? (
                        <p className="text-slate-500 dark:text-slate-400">
                          +{Number(excess).toLocaleString(undefined, { maximumFractionDigits: 1 })} vs forecast
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

// ── Per-KPI deep-dive drawer (the dynamic right bar) ─────────────────────────
function OrgKpiDrawer({
  data,
  onClose,
}: {
  data: OrgKpiDrawerData;
  onClose: () => void;
}) {
  // Escape closes; lock nothing else (the page keeps working behind the scrim).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { meta, columns, rows } = data;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={meta.title}>
      {/* Scrim */}
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]" onClick={onClose} />
      {/* Panel */}
      <aside className="relative flex h-full w-full max-w-[460px] flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <header className="flex items-start justify-between gap-2 border-b border-slate-200 p-4 dark:border-slate-700">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{meta.title}</h3>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{meta.definition}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            ✕
          </button>
        </header>

        {/* Source + freshness (spec §1: never label ORGANIZATION_USAGE as live) */}
        <div className="grid grid-cols-1 gap-2 border-b border-slate-200 p-4 text-xs dark:border-slate-700">
          <div className="flex items-start gap-2">
            <Database className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
            <div className="min-w-0">
              <span className="text-slate-400">Source</span>
              <p className="break-words font-mono text-[11px] text-slate-700 dark:text-slate-300">{meta.source}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <RefreshCw className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
            <div className="min-w-0">
              <span className="text-slate-400">Freshness</span>
              <p className="text-[11px] text-slate-700 dark:text-slate-300">{meta.freshness}</p>
            </div>
          </div>
        </div>

        {/* Evidence — the REAL rows behind the number */}
        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Evidence · {rows.length} {rows.length === 1 ? 'row' : 'rows'}
          </p>
          {rows.length === 0 ? (
            <p className="text-xs text-slate-400">
              No rows available for this metric at the current scope / freshness.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-400 dark:border-slate-700 dark:bg-slate-800/50">
                    {columns.map((c) => (
                      <th key={c} className="px-2 py-1.5 font-medium">{c.replace(/_/g, ' ')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 200).map((r, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      {columns.map((c) => (
                        <td key={c} className="max-w-[160px] truncate px-2 py-1.5 text-slate-600 dark:text-slate-300" title={String(r[c] ?? '')}>
                          {String(r[c] ?? '—')}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > 200 && (
                <p className="px-2 py-1.5 text-[10px] text-slate-400">Showing first 200 of {rows.length}.</p>
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

// ----- small UI helpers -----

function NeedsOrgAdminNote({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-xs text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/10 dark:text-amber-200">
      <p className="font-semibold">{label} — requires ORGADMIN</p>
      <p className="mt-1 leading-relaxed">
        Organization-level data is only available when the connected account
        has the <code>ORGADMIN</code> role. Ask an org
        administrator to grant it to enable cross-account roll-ups.
      </p>
    </div>
  );
}

function EmptyCard({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400 dark:border-slate-700">
      {label}
    </div>
  );
}

function KpiCard({
  icon: Icon,
  label,
  value,
  loading,
  trendPct,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  // Accepts a missing value — renders "—" for null/undefined/NaN (R3); a genuine
  // 0 still renders as 0.
  value: string | number | null | undefined;
  loading: boolean;
  // Optional month-over-month delta (already a percentage, e.g. 12.3 = +12.3%).
  trendPct?: number | null;
  // When set, the card becomes a button that opens its deep-dive drawer.
  onClick?: () => void;
}) {
  const interactive = typeof onClick === 'function';
  return (
    <div
      {...(interactive
        ? {
            role: 'button' as const,
            tabIndex: 0,
            onClick,
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick?.();
              }
            },
          }
        : {})}
      className={`rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900${
        interactive
          ? ' cursor-pointer transition hover:border-blue-400 hover:shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 dark:hover:border-blue-500'
          : ''
      }`}
    >
      <div className="flex items-start justify-between gap-1 text-xs text-slate-500">
        {/* Wrap the label on word boundaries (never clip); tooltip carries it too. */}
        <span className="min-w-0 leading-tight" title={label}>
          {label}
        </span>
        <Icon className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        {/* Single-line truncate + tooltip: a long value (e.g. "ENTERPRISE · STANDARD")
            stays on one line with an ellipsis instead of wrapping to 5 lines. */}
        <span
          className="min-w-0 truncate text-xl font-semibold text-slate-900 dark:text-white"
          title={loading ? undefined : String(dash(value))}
        >
          {loading ? '…' : dash(value)}
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
