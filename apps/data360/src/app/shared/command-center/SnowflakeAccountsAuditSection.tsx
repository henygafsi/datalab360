'use client';

/**
 * SnowflakeAccountsAuditSection — a clear, additive "Accounts & Audit" surface for
 * Account Overview (rendered as a stacked section inside the Organization tab).
 *
 * It fills the audit gap left by the sibling sections (which already render the
 * accounts list, per-account login summary, table storage and role hierarchy):
 *
 *   1. Security & audit posture   ── GET /command-center/security-audit
 *   2. Account connectivity       ── GET /admin/svc-registry (per-account `alive`)
 *   3. Recent logins              ── GET /command-center/audit/login-history
 *   4. Query activity             ── GET /command-center/audit/query-history
 *                                    (+ GET /command-center/cost-by-warehouse)
 *   5. Access history             ── GET /command-center/audit/access-history
 *
 * Design rules honoured:
 *   • Read-only — every call is a GET, so there is no mutation to gate with
 *     useCanPerform. (Endpoints self-gate: a 403/404 degrades a block to a quiet
 *     "not available", matching the platform convention.)
 *   • Lazy — nothing fetches until the section scrolls into view (Intersection
 *     Observer arms every block at once, deferring the load from the initial
 *     Organization-tab render so it never joins the sibling fetch storm).
 *   • Response-time-aware — each block shows a subtle latency badge once loaded
 *     and a "taking longer than usual" hint while a heavy ACCOUNT_USAGE scan runs.
 *   • Honest — no fabricated 0s ("—" for absent values), no popups, and a 4xx/501
 *     degrades the block to "not available" instead of a fake-empty table.
 *   • No vendor names in the visible copy ("data warehouse accounts").
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  Radio,
  LogIn,
  Activity,
  FileSearch,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  ArrowRight,
  Loader2,
  Clock,
} from 'lucide-react';
import apiClient from '@/lib/api-client';
import {
  getSecurityAudit,
  getCostByWarehouse,
} from '@/app/services/command-center';
import type { SecurityAuditResponse } from '@/app/services/command-center/types';
import {
  getLoginHistory,
  getQueryHistory,
  getAccessHistory,
  type AuditResponse,
  type AuditLoginRow,
  type AuditQueryRow,
  type AuditAccessRow,
} from '@/app/services/audit';
import AuditTable, { type Row } from './AuditTable';
import { dash } from '@/app/shared/ui/format';

// ── error classification ─────────────────────────────────────────────────────
// Structurally-absent (404/501) or forbidden-for-this-role (403) → hide quietly
// ("not available"). Everything else (5xx / network / timeout) is transient and
// gets a retry affordance.
function errStatus(e: unknown): number | undefined {
  const a = e as { status?: number; response?: { status?: number } } | undefined;
  return a?.response?.status ?? a?.status;
}
function classifyError(e: unknown): 'unavailable' | 'error' {
  const name = (e as { name?: string } | undefined)?.name;
  if (name === 'AuthorizationError') return 'unavailable'; // 403 — role not granted
  const s = errStatus(e);
  if (s != null && ((s >= 400 && s < 500) || s === 501)) return 'unavailable';
  return 'error';
}

// ── fetch-once-when-armed hook, latency + slow-hint aware ─────────────────────
type Phase = 'idle' | 'loading' | 'ok' | 'unavailable' | 'error';
interface BlockState<T> {
  phase: Phase;
  data: T | null;
  ms: number | null;
  slow: boolean;
  reload: () => void;
}
function useAuditBlock<T>(armed: boolean, fetcher: () => Promise<T>): BlockState<T> {
  const [phase, setPhase] = useState<Phase>('idle');
  const [data, setData] = useState<T | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [slow, setSlow] = useState(false);
  const [nonce, setNonce] = useState(0);
  // Keep the latest fetcher without making it a dependency (callers pass inline
  // closures that would otherwise re-fire the effect every render).
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  useEffect(() => {
    if (!armed) return;
    let active = true;
    setPhase('loading');
    setSlow(false);
    const t0 = performance.now();
    const slowTimer = setTimeout(() => {
      if (active) setSlow(true);
    }, 4000);
    fetcherRef
      .current()
      .then((res) => {
        if (!active) return;
        setData(res);
        setMs(Math.round(performance.now() - t0));
        setPhase('ok');
      })
      .catch((e) => {
        if (!active) return;
        setMs(Math.round(performance.now() - t0));
        setPhase(classifyError(e));
      })
      .finally(() => {
        if (active) setSlow(false);
        clearTimeout(slowTimer);
      });
    return () => {
      active = false;
      clearTimeout(slowTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armed, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { phase, data, ms, slow, reload };
}

// ── in-view latch (arms the whole section once) ──────────────────────────────
function useInViewOnce(ref: React.RefObject<Element>): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (seen) return;
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setSeen(true); // no observer support → arm immediately
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen]);
  return seen;
}

// ── small presentational helpers ─────────────────────────────────────────────
function LatencyBadge({ ms, slow, phase }: { ms: number | null; slow: boolean; phase: Phase }) {
  if (phase === 'loading') {
    return (
      <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
        <Loader2 className="h-3 w-3 animate-spin" />
        {slow ? 'still scanning…' : 'loading…'}
      </span>
    );
  }
  if (ms == null) return null;
  const tone =
    ms < 1500 ? 'text-emerald-500' : ms < 5000 ? 'text-amber-500' : 'text-orange-500';
  return (
    <span
      className={`inline-flex items-center gap-1 text-[10px] ${tone}`}
      title="Time this block took to load"
    >
      <Clock className="h-3 w-3" />
      {ms.toLocaleString()} ms
    </span>
  );
}

function BlockCard({
  icon: Icon,
  title,
  subtitle,
  state,
  right,
  emptyHint,
  isEmpty,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle?: string;
  state: Pick<BlockState<unknown>, 'phase' | 'ms' | 'slow' | 'reload'>;
  right?: React.ReactNode;
  emptyHint?: string;
  isEmpty?: boolean;
  children?: React.ReactNode;
}) {
  const { phase, ms, slow, reload } = state;
  // Forbidden / absent routes vanish quietly (never nag, never fake data).
  if (phase === 'unavailable') {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-slate-300 dark:text-slate-600" />
          <h4 className="text-sm font-semibold text-slate-400 dark:text-slate-500">{title}</h4>
        </div>
        <p className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">
          Not available for this account or role.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Icon className="h-4 w-4 text-[hsl(var(--primary))]" />
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h4>
        {subtitle && (
          <span className="text-[10px] uppercase tracking-wide text-slate-400">{subtitle}</span>
        )}
        <div className="ml-auto flex items-center gap-3">
          <LatencyBadge ms={ms} slow={slow} phase={phase} />
          {right}
        </div>
      </div>

      {phase === 'loading' || phase === 'idle' ? (
        // 'idle' = section not yet scrolled into view; show a skeleton rather than
        // rendering children against empty data (which would read as fake-empty).
        <div className="space-y-2" role="status" aria-label={`Loading ${title}`}>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : phase === 'error' ? (
        <div role="alert" className="flex flex-col items-center gap-2 py-6 text-center">
          <AlertTriangle className="h-5 w-5 text-amber-500" aria-hidden="true" />
          <p className="text-[12px] text-slate-500 dark:text-slate-400">
            Couldn’t load this right now.
          </p>
          <button
            type="button"
            onClick={reload}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw className="h-3 w-3" aria-hidden="true" />
            Retry
          </button>
        </div>
      ) : phase === 'ok' && isEmpty ? (
        <p className="py-6 text-center text-[12px] text-slate-400 dark:text-slate-500">
          {emptyHint ?? 'No records in the last 7 days.'}
        </p>
      ) : (
        children
      )}
    </div>
  );
}

// A tiny KPI chip for the posture strip. Renders "—" for absent values (never 0-faked).
function Chip({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number | null | undefined;
  tone?: 'default' | 'danger' | 'good';
}) {
  const valTone =
    tone === 'danger'
      ? 'text-red-600 dark:text-red-400'
      : tone === 'good'
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-slate-900 dark:text-white';
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className={`mt-0.5 text-base font-semibold ${valTone}`}>{dash(value)}</div>
    </div>
  );
}

function pct(v: number | null | undefined): string {
  return v == null || Number.isNaN(v) ? '—' : `${Math.round(v)}%`;
}
function num(v: number | null | undefined): string | number {
  return v == null || Number.isNaN(v) ? '—' : v.toLocaleString();
}

// ── svc-registry (no service wrapper exists; inline like OrgAccountsTab) ───────
interface SvcAccount {
  account: string;
  user: string;
  alive: boolean;
  auth_type: string;
}
interface SvcRegistryResponse {
  accounts: SvcAccount[];
  total: number;
}

// ═════════════════════════════════════════════════════════════════════════════

export default function SnowflakeAccountsAuditSection({
  onNavigateTab,
}: {
  onNavigateTab?: (id: string) => void;
} = {}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const armed = useInViewOnce(rootRef as React.RefObject<Element>);

  // ── 1. Security & audit posture ──
  const posture = useAuditBlock<SecurityAuditResponse>(armed, () => getSecurityAudit({ days: 7 }));
  const ls = posture.data?.login_summary;
  const pc = posture.data?.policy_coverage;
  const sd = posture.data?.sensitive_data;
  const failed7d = ls?.failed_logins_7d;

  // ── 2. Account connectivity (svc-registry) ──
  const connectivity = useAuditBlock<SvcRegistryResponse>(armed, async () => {
    const { data } = await apiClient.get<SvcRegistryResponse>('/admin/svc-registry');
    return data;
  });
  const svcAccounts = connectivity.data?.accounts ?? [];

  // ── 3. Recent logins ──
  const logins = useAuditBlock<AuditResponse<AuditLoginRow>>(armed, () =>
    getLoginHistory({ days: 7, limit: 100 }),
  );
  const loginRows = logins.data?.data ?? [];
  const loginFailedInView = loginRows.filter(
    (r) => String(r.is_success ?? '').toUpperCase() !== 'YES',
  ).length;

  // ── 4. Query activity (+ cost-by-warehouse supplement) ──
  const queries = useAuditBlock<AuditResponse<AuditQueryRow>>(armed, () =>
    getQueryHistory({ days: 7, limit: 200 }),
  );
  const queryRows = queries.data?.data ?? [];
  // Credits-by-warehouse is a silent supplement: getCostByWarehouse swallows its
  // own errors (returns {data:[]}), so it can only be empty-or-data — we render
  // it when rows exist and show nothing otherwise (it can't signal "unavailable").
  const [whCredits, setWhCredits] = useState<Row[]>([]);
  useEffect(() => {
    if (!armed) return;
    let active = true;
    getCostByWarehouse(30)
      .then((r) => {
        if (active) setWhCredits((r?.data ?? []) as Row[]);
      })
      .catch(() => {
        /* swallowed by design */
      });
    return () => {
      active = false;
    };
  }, [armed]);

  const querySummary = useMemo(() => {
    const byType = new Map<string, number>();
    const byUser = new Map<string, number>();
    const byWh = new Map<string, number>();
    for (const r of queryRows) {
      // Query "type" = the leading SQL verb (SELECT / INSERT / CREATE / MERGE…).
      const t = (r.query_text?.trim().split(/\s+/)[0] || 'OTHER').toUpperCase();
      const u = r.user_name || 'unknown';
      const w = r.warehouse_name || '—';
      byType.set(t, (byType.get(t) ?? 0) + 1);
      byUser.set(u, (byUser.get(u) ?? 0) + 1);
      byWh.set(w, (byWh.get(w) ?? 0) + 1);
    }
    const top = (m: Map<string, number>, n = 5) =>
      Array.from(m.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, n);
    return { byType: top(byType, 6), byUser: top(byUser), byWh: top(byWh) };
  }, [queryRows]);

  // ── 5. Access history ──
  const access = useAuditBlock<AuditResponse<AuditAccessRow>>(armed, () =>
    getAccessHistory({ days: 7, limit: 200 }),
  );
  const accessRows = access.data?.data ?? [];

  return (
    <div ref={rootRef} className="space-y-4">
      {/* Section intro (the uppercase section label is supplied by the parent) */}
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Logins, queries, object access and security posture across your connected data
          warehouse accounts — last 7 days.
        </p>
        {!armed && (
          <span className="text-[10px] text-slate-400">Scroll to load audit data…</span>
        )}
      </div>

      {/* 1 ── Security & audit posture ───────────────────────────────────────── */}
      <BlockCard
        icon={ShieldCheck}
        title="Security & audit posture"
        subtitle="7-day summary"
        state={posture}
        right={
          <div className="flex items-center gap-2">
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('security')}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
              >
                Security map
                <ArrowRight className="h-3 w-3" />
              </button>
            )}
            <Link
              href="/governance/policies"
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Review policies
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        }
      >
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <Chip label="Logins 7d" value={num(ls?.total_logins_7d)} />
          <Chip
            label="Failed 7d"
            value={num(failed7d)}
            tone={failed7d != null && failed7d > 0 ? 'danger' : 'good'}
          />
          <Chip label="Unique users 7d" value={num(ls?.unique_users_7d)} />
          <Chip
            label="MFA enabled"
            value={pct(ls?.mfa_enabled_pct)}
            tone={ls?.mfa_enabled_pct != null && ls.mfa_enabled_pct >= 90 ? 'good' : 'default'}
          />
          <Chip
            label="Policy coverage"
            value={pct(pc?.coverage_pct)}
            tone={pc?.coverage_pct != null && pc.coverage_pct >= 80 ? 'good' : 'default'}
          />
          <Chip
            label="PII unmasked"
            value={pct(sd?.unmasked_pct)}
            tone={sd?.unmasked_pct != null && sd.unmasked_pct > 0 ? 'danger' : 'good'}
          />
        </div>
        {(pc || sd) && (
          <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">
            {pc && (
              <>
                {num(pc.tables_with_policies)}/{num(pc.total_tables)} tables carry a policy
                {' · '}
                {num(pc.masking_policies)} masking · {num(pc.rls_policies)} row-access
              </>
            )}
            {sd && (
              <>
                {pc ? ' · ' : ''}
                {num(sd.pii_columns_masked)}/{num(sd.pii_columns_detected)} sensitive columns
                masked
              </>
            )}
          </p>
        )}
      </BlockCard>

      {/* 2 ── Account connectivity (svc-registry) ────────────────────────────── */}
      <BlockCard
        icon={Radio}
        title="Account connectivity"
        subtitle="service connections"
        state={connectivity}
        isEmpty={svcAccounts.length === 0}
        emptyHint="No service connections registered."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="border-b border-slate-100 text-[10px] uppercase tracking-wide text-slate-400 dark:border-slate-800">
                <th className="px-2 py-1.5">Account</th>
                <th className="px-2 py-1.5">Service user</th>
                <th className="px-2 py-1.5">Auth</th>
                <th className="px-2 py-1.5">State</th>
              </tr>
            </thead>
            <tbody>
              {svcAccounts.map((a, i) => (
                <tr
                  key={`${a.account}-${i}`}
                  className="border-b border-slate-50 text-slate-700 last:border-0 dark:border-slate-800/50 dark:text-slate-300"
                >
                  <td className="px-2 py-1.5 font-medium">{dash(a.account)}</td>
                  <td className="px-2 py-1.5 font-mono text-[10px] text-slate-500">
                    {dash(a.user)}
                  </td>
                  <td className="px-2 py-1.5">
                    {a.auth_type === 'key_pair'
                      ? 'Key pair'
                      : a.auth_type === 'password'
                        ? 'Password'
                        : dash(a.auth_type)}
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        a.alive
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                          : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          a.alive ? 'bg-emerald-500' : 'bg-red-500'
                        }`}
                      />
                      {a.alive ? 'Connected' : 'Unreachable'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </BlockCard>

      {/* 3 ── Recent logins ──────────────────────────────────────────────────── */}
      <BlockCard
        icon={LogIn}
        title="Recent logins"
        subtitle="login-history"
        state={logins}
        isEmpty={loginRows.length === 0}
        emptyHint="No login events in the last 7 days."
        right={
          loginFailedInView > 0 ? (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {loginFailedInView.toLocaleString()} failed in view
            </span>
          ) : undefined
        }
      >
        <AuditTable
          rows={loginRows as unknown as Row[]}
          columns={[
            'event_timestamp',
            'user_name',
            'client_ip',
            'reported_client_type',
            'is_success',
            'error_message',
          ]}
          pageSize={10}
        />
      </BlockCard>

      {/* 4 ── Query activity ─────────────────────────────────────────────────── */}
      <BlockCard
        icon={Activity}
        title="Query activity"
        subtitle="query-history"
        state={queries}
        isEmpty={queryRows.length === 0}
        emptyHint="No queries recorded in the last 7 days."
      >
        <div className="grid gap-3 md:grid-cols-3">
          <SummaryList
            title="Top query types"
            rows={querySummary.byType.map(([k, v]) => ({ label: k, value: v }))}
          />
          <SummaryList
            title="Top users"
            rows={querySummary.byUser.map(([k, v]) => ({ label: k, value: v }))}
          />
          <SummaryList
            title="Top warehouses"
            rows={querySummary.byWh.map(([k, v]) => ({ label: k, value: v }))}
          />
        </div>
        {whCredits.length > 0 && (
          <div className="mt-3">
            {/* No explicit columns: this endpoint (a _kpiTable route) returns
                UPPERCASE ACCOUNT_USAGE keys, so we let AuditTable derive them
                from the payload rather than risk a hardcoded-case mismatch. */}
            <AuditTable
              rows={whCredits}
              title="Credits by warehouse (30d)"
              subtitle="cost-by-warehouse"
              pageSize={8}
            />
          </div>
        )}
        <div className="mt-3">
          <AuditTable
            rows={queryRows as unknown as Row[]}
            columns={[
              'start_time',
              'user_name',
              'warehouse_name',
              'execution_status',
              'total_elapsed_time',
              'rows_produced',
            ]}
            title="Recent queries"
            pageSize={10}
          />
        </div>
      </BlockCard>

      {/* 5 ── Access history ─────────────────────────────────────────────────── */}
      <BlockCard
        icon={FileSearch}
        title="Access history"
        subtitle="who accessed what"
        state={access}
        isEmpty={accessRows.length === 0}
        emptyHint="No object access recorded in the last 7 days."
        right={
          <Link
            href="/governance/roles"
            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            Roles &amp; grants
            <ExternalLink className="h-3 w-3" />
          </Link>
        }
      >
        <AuditTable
          rows={accessRows as unknown as Row[]}
          columns={access.data?.columns}
          pageSize={10}
        />
      </BlockCard>
    </div>
  );
}

// A compact ranked list for the query-activity summaries.
function SummaryList({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; value: number; danger?: boolean }[];
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2.5 dark:border-slate-700 dark:bg-slate-800/30">
      <div className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        {title}
      </div>
      {rows.length === 0 ? (
        <p className="py-2 text-center text-[11px] text-slate-400">—</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.label} className="flex items-center justify-between gap-2 text-[11px]">
              <span
                className={`truncate ${
                  r.danger
                    ? 'font-medium text-red-600 dark:text-red-400'
                    : 'text-slate-600 dark:text-slate-300'
                }`}
                title={r.label}
              >
                {r.label}
              </span>
              <span className="shrink-0 font-semibold text-slate-800 dark:text-slate-200">
                {r.value.toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
