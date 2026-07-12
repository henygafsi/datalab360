'use client';

/**
 * OrganizationCockpit — the Account Overview › Organization ONE-PAGER.
 *
 * Replaces the old long-scroll 2×2 grid (OrgSummary + OrgAccounts + Snowflake
 * accounts stacked) with an executive cockpit that fits ~1–1.5 viewports:
 *
 *   A. Compact header  — org · accounts · D360 coverage · health · freshness
 *   C. Compact KPI strip (kpi_cards; click → opens the matching deep-dive)
 *   D. Cockpit body    — Account Portfolio matrix  +  Health components
 *   E. Critical findings / AI priorities (timeline + score contributors)
 *   F. Bottom deep-dive tab bar → EXPANDABLE panel (audit table + chart)
 *
 * Everything is powered by ONE role-scoped aggregate
 * (GET /account-overview/organization/intelligence) plus its server-paginated
 * L2 detail endpoints (…/intelligence/{accounts|cost|security|adoption|events}).
 * No Snowflake queries from the client; honest freshness (ORGANIZATION_USAGE is
 * ≤24h latent, never "live"); data-first skeletons; no fabricated values.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  AlertTriangle, Building2, ChevronDown, Database, Gauge, RefreshCw,
  ShieldCheck, Sparkles, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getOrganizationIntelligence,
  getOrganizationDetail,
  type OrgIntelResponse,
  type OrgDetailResponse,
  type OrgDetailTab,
} from '@/app/services/command-center';

// ── helpers ──────────────────────────────────────────────────────────────────
function relTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '—';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}
function toneClass(tone: string | null | undefined): string {
  switch (tone) {
    case 'red': return 'text-rose-600 dark:text-rose-400';
    case 'amber': return 'text-amber-600 dark:text-amber-400';
    case 'green': return 'text-emerald-600 dark:text-emerald-400';
    default: return 'text-slate-800 dark:text-slate-100';
  }
}
function healthColor(v: number | null): string {
  if (v == null) return 'bg-slate-200 dark:bg-slate-700';
  if (v < 40) return 'bg-rose-500';
  if (v < 70) return 'bg-amber-400';
  return 'bg-emerald-500';
}
function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}
function fmt(v: unknown): string {
  const n = num(v);
  if (n == null) return String(v ?? '—');
  return n.toLocaleString(undefined, { maximumFractionDigits: 1 });
}

// KPI id → which bottom deep-dive it drills into.
const KPI_TO_TAB: Record<string, OrgDetailTab> = {
  health: 'accounts', accounts: 'accounts', connected: 'accounts',
  credits: 'cost', cost: 'cost', spend: 'cost',
  adoption: 'adoption', users: 'adoption',
  security: 'security', failed_logins: 'security',
};

const DEEP_TABS: { id: OrgDetailTab; label: string }[] = [
  { id: 'accounts', label: 'Accounts' },
  { id: 'cost', label: 'Cost & Capacity' },
  { id: 'adoption', label: 'Data360 Adoption' },
  { id: 'security', label: 'Security & Access' },
  { id: 'events', label: 'Events & Recos' },
];

// ── component ────────────────────────────────────────────────────────────────
export default function OrganizationCockpit() {
  const [data, setData] = useState<OrgIntelResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [days, setDays] = useState(30);
  const [openTab, setOpenTab] = useState<OrgDetailTab | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const d = await getOrganizationIntelligence({ days });
    setData(d);
    setLoading(false);
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const ctx = data?.org_context;
  const score = num(data?.score_summary?.score);
  const connected = useMemo(
    () => (data?.account_portfolio ?? []).filter((a) => a.d360_connected).length,
    [data],
  );
  const coverage = useMemo(() => {
    const tot = data?.account_portfolio?.length ?? 0;
    return tot ? Math.round((connected / tot) * 100) : null;
  }, [data, connected]);

  // Score contributors → critical findings (the deterministic backend value;
  // COCO never calculates it). Lowest-scoring components bubble up first.
  const contributors = useMemo(() => {
    const comps = (data?.score_summary as { components?: Array<Record<string, unknown>> } | undefined)?.components ?? [];
    return [...comps]
      .map((c) => ({
        name: String(c.name ?? c.component ?? c.key ?? 'component'),
        score: num(c.normalized ?? c.score ?? c.normalized_score),
        weight: num(c.weight),
        excluded: Boolean(c.excluded),
      }))
      .filter((c) => !c.excluded && c.score != null)
      .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
      .slice(0, 5);
  }, [data]);

  if (loading && !data) return <CockpitSkeleton />;
  if (!data) {
    return (
      <div className="rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Organization intelligence unavailable. This account may not have ORGADMIN visibility.
        <button type="button" onClick={() => void load()} className="ml-2 underline">retry</button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* ── A. Compact header ── */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900">
        <span className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
          <Building2 className="h-4 w-4 text-blue-500" />
          Organization {ctx?.organization ?? '—'}
        </span>
        <span className="text-slate-500 dark:text-slate-400">
          {ctx?.visible_accounts ?? data.account_portfolio.length} accounts
        </span>
        <span className="text-slate-500 dark:text-slate-400">
          D360 coverage {coverage != null ? `${coverage}%` : '—'} ({connected} connected)
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-full', healthColor(score))} />
          <span className="font-medium">Health {score != null ? `${score}/100` : '—'}</span>
        </span>
        <span className="ml-auto flex items-center gap-3 text-xs text-slate-400">
          <span title="ORGANIZATION_USAGE is ≤24h latent — never live">
            Snapshot {relTime(data.freshness?.snowflake_org_usage)}
          </span>
          <span>Events {relTime(data.freshness?.event_store)}</span>
          <button
            type="button" onClick={() => void refresh()} disabled={refreshing}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-slate-600 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} /> Refresh
          </button>
          <select
            value={days} onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
          >
            {[7, 30, 90].map((d) => <option key={d} value={d}>{d}d</option>)}
          </select>
        </span>
      </header>

      {/* ── C. Compact KPI strip ── */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {data.kpi_cards.map((k) => {
          const tab = KPI_TO_TAB[k.id];
          const interactive = !!tab;
          return (
            <button
              key={k.id}
              type="button"
              disabled={!interactive}
              onClick={interactive ? () => setOpenTab(tab) : undefined}
              className={cn(
                'rounded-xl border border-slate-200 bg-white p-2.5 text-left dark:border-slate-700 dark:bg-slate-900',
                interactive && 'cursor-pointer transition hover:border-blue-400 hover:shadow-sm',
              )}
              title={interactive ? `Open ${tab} deep-dive` : undefined}
            >
              <div className="truncate text-[10px] uppercase tracking-wide text-slate-400" title={k.label}>{k.label}</div>
              <div className={cn('mt-0.5 text-lg font-semibold tabular-nums', toneClass(k.tone))}>
                {k.value == null ? '—' : fmt(k.value)}<span className="text-xs font-normal text-slate-400">{k.unit ?? ''}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── D. Cockpit body: portfolio (left) + health/findings (right) ── */}
      <div className="grid min-h-0 grid-cols-1 gap-3 xl:grid-cols-3">
        {/* Account Portfolio matrix */}
        <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900 xl:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
              <Database className="h-4 w-4 text-slate-400" /> Account portfolio
            </h3>
            <button type="button" onClick={() => setOpenTab('accounts')} className="text-xs text-blue-600 hover:underline dark:text-blue-400">
              Open full audit →
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[10px] uppercase tracking-wide text-slate-400 dark:border-slate-700">
                  <th className="py-1.5 pr-2 font-medium">Account</th>
                  <th className="py-1.5 pr-2 font-medium">Region</th>
                  <th className="py-1.5 pr-2 font-medium">Edition</th>
                  <th className="py-1.5 pr-2 font-medium">D360</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Cost</th>
                  <th className="py-1.5 pr-2 text-right font-medium">Users</th>
                  <th className="py-1.5 font-medium">Health</th>
                </tr>
              </thead>
              <tbody>
                {data.account_portfolio.map((a) => {
                  const h = num(a.health);
                  return (
                    <tr key={String(a.account)} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                      <td className="py-1.5 pr-2 font-mono text-[11px] text-slate-700 dark:text-slate-300">{a.account}</td>
                      <td className="py-1.5 pr-2 text-slate-500">{a.region}</td>
                      <td className="py-1.5 pr-2 text-slate-500">{a.edition}</td>
                      <td className="py-1.5 pr-2">
                        {a.d360_connected
                          ? <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">connected</span>
                          : <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500 dark:bg-slate-800">not connected</span>}
                      </td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{a.cost != null ? fmt(a.cost) : '—'}</td>
                      <td className="py-1.5 pr-2 text-right tabular-nums text-slate-600 dark:text-slate-300">{a.active_users ?? '—'}</td>
                      <td className="py-1.5">
                        <span className="flex items-center gap-1.5">
                          <span className={cn('h-2 w-2 rounded-full', healthColor(h))} />
                          <span className="tabular-nums text-slate-600 dark:text-slate-300">{h != null ? h : '—'}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        {/* Health components + critical findings */}
        <section className="flex min-h-0 flex-col gap-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
              <Gauge className="h-4 w-4 text-slate-400" /> Health contributors
            </h3>
            {contributors.length === 0 ? (
              <p className="text-xs text-slate-400">No scored components available.</p>
            ) : (
              <ul className="space-y-2">
                {contributors.map((c) => (
                  <li key={c.name}>
                    <div className="mb-0.5 flex items-center justify-between text-xs">
                      <span className="capitalize text-slate-600 dark:text-slate-300">{c.name.replace(/_/g, ' ')}</span>
                      <span className="tabular-nums text-slate-500">{c.score}/100</span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className={cn('h-full rounded-full', healthColor(c.score))} style={{ width: `${Math.max(3, c.score ?? 0)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="min-h-0 flex-1 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Recent events
            </h3>
            {data.timeline.length === 0 ? (
              <p className="text-xs text-slate-400">No recent organization events.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.timeline.slice(0, 6).map((e, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate text-slate-600 dark:text-slate-300" title={`${e.event_type ?? ''} · ${e.actor ?? ''}`}>
                      <span className="text-slate-400">{e.module ?? '—'}</span> {e.event_type ?? '—'}
                    </span>
                    <span className={cn('shrink-0', e.status === 'FAILED' || e.status === 'ERROR' ? 'text-rose-500' : 'text-slate-400')}>
                      {e.status ?? ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => setOpenTab('events')} className="mt-2 text-xs text-blue-600 hover:underline dark:text-blue-400">
              Open events audit →
            </button>
          </div>
        </section>
      </div>

      {/* ── F. Bottom deep-dive tab bar ── */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-1.5 dark:border-slate-700 dark:bg-slate-900">
        <span className="px-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400">Deep-dive</span>
        {DEEP_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setOpenTab(openTab === t.id ? null : t.id)}
            className={cn(
              'inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition',
              openTab === t.id
                ? 'bg-blue-600 text-white'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
            )}
          >
            {t.label}
            {openTab === t.id && <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        ))}
      </div>

      {/* ── Expandable deep-dive panel ── */}
      {openTab && <OrgDeepDive tab={openTab} days={days} onClose={() => setOpenTab(null)} />}
    </div>
  );
}

// ── Expandable deep-dive: contextual chart + paginated audit table ───────────
function OrgDeepDive({ tab, days, onClose }: { tab: OrgDetailTab; days: number; onClose: () => void }) {
  const [detail, setDetail] = useState<OrgDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [q, setQ] = useState('');

  useEffect(() => { setPage(1); }, [tab]);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    getOrganizationDetail(tab, { days, page, page_size: pageSize, q: q || undefined }).then((d) => {
      if (alive) { setDetail(d); setLoading(false); }
    });
    return () => { alive = false; };
  }, [tab, days, page, pageSize, q]);

  const rows = detail?.rows ?? [];
  const columns = detail?.columns ?? (rows[0] ? Object.keys(rows[0]) : []);

  // A small contextual chart for the axes that have a natural numeric series.
  const chart = useMemo(() => {
    if (tab === 'cost') {
      return rows.slice(0, 12).map((r) => ({
        label: String(r.account_name ?? r.service_type ?? ''),
        value: num(r.total_credits) ?? 0,
      }));
    }
    if (tab === 'adoption') {
      return rows.slice(0, 12).map((r) => ({
        label: String(r.module ?? r.action ?? ''),
        value: num(r.count) ?? 0,
      }));
    }
    return null;
  }, [tab, rows]);

  return (
    <section className="rounded-xl border border-blue-200 bg-white shadow-sm dark:border-blue-900/40 dark:bg-slate-900">
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-700">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold capitalize text-slate-800 dark:text-slate-100">
          <Sparkles className="h-4 w-4 text-blue-500" /> {tab.replace(/_/g, ' ')} — audit
          <span className="ml-1 text-xs font-normal text-slate-400">
            {detail ? `${detail.total_rows} rows` : ''}
          </span>
        </h3>
        <div className="flex items-center gap-2">
          <input
            value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }}
            placeholder="Search…"
            className="w-40 rounded-lg border border-slate-200 px-2 py-1 text-xs dark:border-slate-700 dark:bg-slate-800"
          />
          <button type="button" onClick={onClose} aria-label="Close deep-dive" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">✕</button>
        </div>
      </header>

      {chart && chart.length > 0 && (
        <div className="h-40 border-b border-slate-200 p-3 dark:border-slate-700">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#94a3b8' }} interval={0} angle={-20} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
              <Tooltip />
              <Bar dataKey="value" fill="#3b82f6" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="max-h-[340px] overflow-auto">
        {loading && !detail ? (
          <div className="p-6 text-center text-xs text-slate-400">Loading…</div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">
            No rows for this axis at the current scope / freshness.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/80">
              <tr className="text-left text-[10px] uppercase tracking-wide text-slate-400">
                {columns.map((c) => <th key={c} className="whitespace-nowrap px-3 py-2 font-medium">{c.replace(/_/g, ' ')}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0 dark:border-slate-800">
                  {columns.map((c) => (
                    <td key={c} className="max-w-[220px] truncate px-3 py-1.5 text-slate-600 dark:text-slate-300" title={String(r[c] ?? '')}>
                      {typeof r[c] === 'number' ? fmt(r[c]) : String(r[c] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* pagination */}
      {detail && detail.total_rows > 0 && (
        <footer className="flex items-center justify-between gap-2 border-t border-slate-200 px-4 py-2 text-xs text-slate-500 dark:border-slate-700">
          <span>Page {detail.page} · {detail.filtered_rows ?? detail.total_rows} rows</span>
          <div className="flex items-center gap-2">
            <select
              value={pageSize} onChange={(e) => { setPage(1); setPageSize(Number(e.target.value)); }}
              className="rounded border border-slate-200 px-1.5 py-0.5 dark:border-slate-700 dark:bg-slate-800"
            >
              {[25, 50, 100, 250].map((s) => <option key={s} value={s}>{s}/page</option>)}
            </select>
            <button type="button" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded border border-slate-200 px-2 py-0.5 disabled:opacity-40 dark:border-slate-700">Prev</button>
            <button type="button" disabled={!detail.has_next} onClick={() => setPage((p) => p + 1)} className="rounded border border-slate-200 px-2 py-0.5 disabled:opacity-40 dark:border-slate-700">Next</button>
          </div>
        </footer>
      )}
    </section>
  );
}

// ── skeleton ─────────────────────────────────────────────────────────────────
function CockpitSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className="h-11 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />)}
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800 xl:col-span-2" />
        <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  );
}
