'use client';

/**
 * GovernanceOnePager — the Account Overview › Security & Governance ONE-PAGER.
 *
 * Mirrors OrganizationCockpit's executive one-pager idiom (compact header · KPI
 * strip · body · bottom deep-dive bar · contextual right bar) for governance,
 * consuming the ALREADY-BUILT role-scoped aggregate
 *   GET /account-overview/governance/intelligence
 * (typed client `getGovernanceIntelligence`). No backend endpoints are added:
 * the audit table paginates by re-fetching the SAME aggregate with page /
 * page_size / q, and every deep-dive view reads data already in the payload —
 * there is no governance L2 detail endpoint.
 *
 *   A. Compact header  — governance score · health dot · scope · freshness
 *   C. Compact KPI strip (kpi_cards; click → filters the findings audit)
 *   D. Body            — findings audit table (server-paginated) + score
 *                        breakdown contributors + recent events
 *   F. Bottom deep-dive bar → expandable Timeline / Recommendations panels
 *   R. Contextual right bar (finding detail + backend-authorized actions)
 *
 * Honest states throughout: data-first skeletons, "unavailable" when the
 * aggregator returns null, a "N sources degraded" note, and NEVER a fabricated
 * value (null KPIs fold behind "More metrics", never render as an em-dash).
 * Recommendation actions do a REAL POST; identity/policy actions render as
 * pre-disabled "not yet wired" chips.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle, ChevronDown, ChevronLeft, ChevronRight, Clock, Gauge,
  RefreshCw, Search, ShieldCheck, Sparkles, Table2, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api-client';
import {
  getGovernanceIntelligence,
  type GovIntelResponse,
  type GovIntelKpiCard,
  type GovIntelFinding,
  type GovIntelParams,
} from '@/app/services/command-center';
import InsightActionButton from '@/app/shared/insights/InsightActionButton';

// ── helpers (shared idiom with OrganizationCockpit) ──────────────────────────
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
/** KPI value formatter — callers guarantee value != null (nulls → more metrics). */
function fmtKpi(v: number | string | null, unit?: string): string {
  if (v === null || v === undefined) return '';
  const base = typeof v === 'number'
    ? (Number.isInteger(v) ? v.toLocaleString() : v.toLocaleString(undefined, { maximumFractionDigits: 2 }))
    : String(v);
  return unit ? `${base}${unit.startsWith('/') || unit === '%' ? '' : ' '}${unit}` : base;
}

// ── severity badge (lifted from GovernanceCockpit) ───────────────────────────
const SEV_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
  low: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300',
  info: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300',
};
function sevBadge(sev: string): string {
  return SEV_BADGE[sev?.toLowerCase()] ?? SEV_BADGE.info;
}

/** Table cell — null/empty renders as a muted middot, NEVER an em-dash. */
function Cell({ value, className }: { value: unknown; className?: string }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <span className={cn(empty && 'text-slate-300 dark:text-slate-600', className)} title={empty ? undefined : String(value)}>
      {empty ? '·' : String(value)}
    </span>
  );
}

const PAGE_SIZES = [25, 50, 100, 250];
const AUDIT_COLS = ['severity', 'kind', 'finding', 'user', 'role', 'object', 'status', 'recommendation'] as const;

type DeepTab = 'timeline' | 'recommendations';
const DEEP_TABS: { id: DeepTab; label: string }[] = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'recommendations', label: 'Recommendations' },
];

// ── component ────────────────────────────────────────────────────────────────
export default function GovernanceOnePager() {
  const [data, setData] = useState<GovIntelResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [days, setDays] = useState(30);

  // Server-side audit query state.
  const [page, setPage] = useState(1);        // backend audit.page is 1-based
  const [pageSize, setPageSize] = useState(25);
  const [sevSel, setSevSel] = useState<string[]>([]);
  const [kindSel, setKindSel] = useState<string[]>([]);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');

  const [openTab, setOpenTab] = useState<DeepTab | null>(null);
  const [selected, setSelected] = useState<GovIntelFinding | null>(null);

  const reqId = useRef(0);
  const sevCsv = sevSel.join(',');
  const kindCsv = kindSel.join(',');

  // Debounce the free-text search into the server param.
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 400);
    return () => clearTimeout(t);
  }, [qInput]);

  // Reset to page 1 whenever a filter changes.
  useEffect(() => { setPage(1); }, [sevCsv, kindCsv, q, pageSize, days]);

  const fetchData = useCallback(async (isRefresh = false) => {
    const id = ++reqId.current;
    if (isRefresh) setRefreshing(true); else setLoading(true);
    const params: GovIntelParams = {
      days, page, page_size: pageSize,
      severity: sevCsv || undefined,
      kind: kindCsv || undefined,
      q: q || undefined,
    };
    const res = await getGovernanceIntelligence(params);
    if (id !== reqId.current) return; // drop stale response
    if (res) { setData(res); setFailed(false); } else { setFailed(true); }
    setLoading(false);
    setRefreshing(false);
  }, [days, page, pageSize, sevCsv, kindCsv, q]);

  useEffect(() => { void fetchData(); }, [fetchData]);

  // ── KPI card → filter mapping (only emit facet values the backend supports) ──
  const applyKpiFilter = useCallback((card: GovIntelKpiCard) => {
    const facets = data?.facets;
    let sev: string[] = [];
    let kind: string[] = [];
    if (card.id === 'critical_findings') sev = ['critical'];
    if (card.group === 'identity') kind = ['identity'];
    if (card.group === 'policy') kind = ['policy'];
    sev = facets ? sev.filter((s) => facets.severity.includes(s)) : sev;
    kind = facets ? kind.filter((k) => facets.kind.includes(k)) : kind;
    setSevSel(sev);
    setKindSel(kind);
    setOpenTab(null);
  }, [data]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const s = data?.score_summary;
  const score = num(s?.score);
  const visibleCards = useMemo(
    () => (data?.kpi_cards ?? []).filter((c) => c.value !== null && c.value !== undefined),
    [data],
  );
  const hiddenCards = useMemo<GovIntelKpiCard[]>(() => {
    const nulls = (data?.kpi_cards ?? []).filter((c) => c.value === null || c.value === undefined);
    return [...nulls, ...(data?.more_metrics ?? [])];
  }, [data]);

  // Score breakdown → contributors (numeric entries only, lowest first).
  const contributors = useMemo(() => {
    const bd = (s?.breakdown ?? {}) as Record<string, unknown>;
    return Object.entries(bd)
      .map(([name, v]) => {
        const rec = (v && typeof v === 'object') ? (v as Record<string, unknown>) : null;
        const val = rec ? num(rec.normalized ?? rec.score ?? rec.value) : num(v);
        return { name, score: val };
      })
      .filter((c) => c.score != null)
      .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
      .slice(0, 6);
  }, [s]);

  const degradedCount = data ? Object.keys(data.degraded_sources ?? {}).length : 0;
  const audit = data?.audit;
  const totalPages = audit ? Math.max(1, Math.ceil(audit.filtered_rows / audit.page_size)) : 1;
  const freshness = data?.cache?.generated_at ?? data?.generated_at ?? null;

  const toggle = (setter: (u: (c: string[]) => string[]) => void) => (val: string) =>
    setter((cur) => (cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val]));

  if (loading && !data && !failed) return <OnePagerSkeleton />;
  if (failed || !data) {
    return (
      <div className="rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
        Governance intelligence unavailable — the aggregator did not return a payload.
        <button type="button" onClick={() => void fetchData()} className="ml-2 underline">retry</button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* ── A. Compact header ── */}
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900">
        <span className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white">
          <ShieldCheck className="h-4 w-4 text-emerald-500" />
          Governance {data.account ?? '—'}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn('h-2 w-2 rounded-full', healthColor(score))} />
          <span className="font-medium">Score {score != null ? `${score}/100` : 'n/a'}</span>
          {s?.scope && <span className="text-xs text-slate-400">· {s.scope}</span>}
        </span>
        <span className="text-slate-500 dark:text-slate-400">
          {s?.critical_findings ?? 0} critical
        </span>
        <span className="text-slate-500 dark:text-slate-400">
          {s?.open_recommendations ?? 0} open recos
        </span>
        {degradedCount > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
            title={Object.entries(data.degraded_sources).map(([k, v]) => `${k}: ${v}`).join('\n')}
          >
            <AlertTriangle className="h-3 w-3" /> {degradedCount} source{degradedCount === 1 ? '' : 's'} degraded
          </span>
        )}
        <span className="ml-auto flex items-center gap-3 text-xs text-slate-400">
          <span title="Aggregate snapshot — cached, not a live Snowflake query">
            Snapshot {relTime(freshness)}
          </span>
          <button
            type="button" onClick={() => void fetchData(true)} disabled={refreshing}
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
      <div data-testid="gov-kpi-strip">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
          {visibleCards.map((k, i) => (
            <button
              key={`${k.group ?? ''}-${k.id ?? k.label}-${i}`}
              type="button"
              onClick={() => applyKpiFilter(k)}
              title={`${k.label} — click to filter the findings audit`}
              className="cursor-pointer rounded-xl border border-slate-200 bg-white p-2.5 text-left transition hover:border-blue-400 hover:shadow-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="truncate text-[10px] uppercase tracking-wide text-slate-400" title={k.label}>{k.label}</div>
              <div className={cn('mt-0.5 text-lg font-semibold tabular-nums', toneClass(k.tone))}>
                {fmtKpi(k.value, k.unit)}
              </div>
            </button>
          ))}
        </div>
        {hiddenCards.length > 0 && (
          <details className="group mt-2">
            <summary className="cursor-pointer list-none text-[11px] font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
              <span className="group-open:hidden">▸ </span>
              <span className="hidden group-open:inline">▾ </span>
              More metrics ({hiddenCards.length})
            </summary>
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
              {hiddenCards.map((c, i) => (
                <div key={`more-${c.label}-${i}`} className="flex items-center justify-between border-b border-slate-100 py-0.5 text-[11px] dark:border-slate-800">
                  <span className="text-slate-500 dark:text-slate-400">{c.label}</span>
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {c.value === null || c.value === undefined ? 'not computed' : fmtKpi(c.value, c.unit)}
                  </span>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* ── D. Body: findings audit (left) + breakdown/events (right) ── */}
      <div className="grid min-h-0 grid-cols-1 gap-3 xl:grid-cols-3">
        {/* Findings audit table — the primary surface, server-paginated */}
        <section className="flex min-h-0 flex-col rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 xl:col-span-2">
          {/* Filter bar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-2 dark:border-slate-800">
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
              <Table2 className="h-4 w-4 text-slate-400" /> Findings
            </h3>
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={qInput}
                onChange={(e) => setQInput(e.target.value)}
                placeholder="Search findings…"
                className="w-44 rounded-md border border-slate-200 bg-white py-1 pl-7 pr-2 text-xs text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              />
            </div>
            {(data.facets?.severity?.length ?? 0) > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-semibold uppercase text-slate-400">sev</span>
                {data.facets.severity.map((sv) => (
                  <Chip key={sv} label={sv} active={sevSel.includes(sv)} onClick={() => toggle(setSevSel)(sv)} />
                ))}
              </div>
            )}
            {(data.facets?.kind?.length ?? 0) > 0 && (
              <div className="flex items-center gap-1">
                <span className="text-[10px] font-semibold uppercase text-slate-400">kind</span>
                {data.facets.kind.map((kd) => (
                  <Chip key={kd} label={kd} active={kindSel.includes(kd)} onClick={() => toggle(setKindSel)(kd)} />
                ))}
              </div>
            )}
            {audit && (
              <span className="ml-auto text-[11px] text-slate-500 dark:text-slate-400">
                {audit.filtered_rows.toLocaleString()} of {audit.total_rows.toLocaleString()} findings
              </span>
            )}
          </div>

          {/* Table */}
          <div className="min-h-0 max-h-[440px] flex-1 overflow-auto">
            {loading && !audit ? (
              <div className="space-y-1 p-3">
                {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-7 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />)}
              </div>
            ) : (audit?.rows.length ?? 0) === 0 ? (
              <p className="py-10 text-center text-xs text-slate-400">No findings match the current filters.</p>
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-800">
                  <tr>
                    {AUDIT_COLS.map((c) => (
                      <th key={c} className="whitespace-nowrap border-b border-slate-200 px-2 py-1.5 font-semibold capitalize text-slate-600 dark:border-slate-700 dark:text-slate-300">{c}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(audit?.rows ?? []).map((r) => (
                    <tr
                      key={r.finding_id}
                      onClick={() => setSelected(r)}
                      className={cn(
                        'cursor-pointer border-b border-slate-100 last:border-0 hover:bg-blue-50/50 dark:border-slate-800 dark:hover:bg-blue-950/20',
                        selected?.finding_id === r.finding_id && 'bg-blue-50 dark:bg-blue-950/30',
                      )}
                    >
                      <td className="px-2 py-1.5">
                        <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', sevBadge(r.severity))}>{r.severity}</span>
                      </td>
                      <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400">{r.kind}</td>
                      <td className="max-w-[280px] truncate px-2 py-1.5 text-slate-800 dark:text-slate-200"><Cell value={r.finding} /></td>
                      <td className="px-2 py-1.5"><Cell value={r.user} /></td>
                      <td className="px-2 py-1.5"><Cell value={r.role} /></td>
                      <td className="max-w-[180px] truncate px-2 py-1.5"><Cell value={r.object} /></td>
                      <td className="px-2 py-1.5 text-slate-500 dark:text-slate-400">{r.status}</td>
                      <td className="max-w-[220px] truncate px-2 py-1.5"><Cell value={r.recommendation} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Pager */}
          <div className="flex items-center justify-between gap-2 border-t border-slate-100 px-3 py-1.5 text-[11px] text-slate-500 dark:border-slate-800 dark:text-slate-400">
            <label className="flex items-center gap-1">
              Rows
              <select
                value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] dark:border-slate-700 dark:bg-slate-800"
              >
                {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
            <span className="tabular-nums">page {page}/{totalPages}</span>
            <span className="flex items-center gap-1">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
                className="inline-flex items-center rounded px-1.5 py-0.5 enabled:hover:bg-slate-100 disabled:opacity-40 dark:enabled:hover:bg-slate-800">
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <button type="button" onClick={() => setPage((p) => p + 1)} disabled={!audit?.has_next}
                className="inline-flex items-center rounded px-1.5 py-0.5 enabled:hover:bg-slate-100 disabled:opacity-40 dark:enabled:hover:bg-slate-800">
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </span>
          </div>
        </section>

        {/* Score breakdown contributors + recent events */}
        <section className="flex min-h-0 flex-col gap-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
            <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
              <Gauge className="h-4 w-4 text-slate-400" /> Score contributors
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
              <Clock className="h-4 w-4 text-amber-500" /> Recent events
            </h3>
            {(data.timeline?.length ?? 0) === 0 ? (
              <p className="text-xs text-slate-400">No governance events in this window.</p>
            ) : (
              <ul className="space-y-1.5">
                {data.timeline.slice(0, 6).map((e, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 text-xs">
                    <span className="min-w-0 truncate text-slate-600 dark:text-slate-300" title={`${e.event_type ?? ''} · ${e.actor ?? ''}`}>
                      <span className="text-slate-400">{e.module ?? '—'}</span> {e.event_type ?? 'event'}
                    </span>
                    <span className={cn('shrink-0', e.status === 'FAILED' || e.status === 'ERROR' ? 'text-rose-500' : 'text-slate-400')}>
                      {e.status ?? ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={() => setOpenTab('timeline')} className="mt-2 text-xs text-blue-600 hover:underline dark:text-blue-400">
              Open full timeline →
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
              openTab === t.id ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800',
            )}
          >
            {t.label}
            {openTab === t.id && <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        ))}
      </div>

      {/* ── Expandable deep-dive panel ── */}
      {openTab === 'timeline' && <TimelinePanel data={data} onClose={() => setOpenTab(null)} />}
      {openTab === 'recommendations' && <RecommendationsPanel data={data} onClose={() => setOpenTab(null)} />}

      {/* ── Contextual right bar: selected finding ── */}
      {selected && (
        <FindingRightBar
          finding={selected}
          scope={data.score_summary.scope}
          allowedActions={data.allowed_actions ?? {}}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}

// ── facet chip ───────────────────────────────────────────────────────────────
function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
        active
          ? 'border-blue-500 bg-blue-500 text-white'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
      )}
    >
      {label}
    </button>
  );
}

// ── deep-dive: full timeline ─────────────────────────────────────────────────
function TimelinePanel({ data, onClose }: { data: GovIntelResponse; onClose: () => void }) {
  const events = [...(data.timeline ?? [])].sort((a, b) => (b.ts ?? '').localeCompare(a.ts ?? ''));
  return (
    <section className="rounded-xl border border-blue-200 bg-white shadow-sm dark:border-blue-900/40 dark:bg-slate-900">
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-700">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <Clock className="h-4 w-4 text-blue-500" /> Timeline
          <span className="ml-1 text-xs font-normal text-slate-400">{events.length} events</span>
        </h3>
        <button type="button" onClick={onClose} aria-label="Close deep-dive" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
      </header>
      <div className="max-h-[360px] overflow-auto p-3">
        {events.length === 0 ? (
          <p className="py-10 text-center text-xs text-slate-400">No timeline events in this window.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {events.map((e, i) => (
              <li key={i} className="flex items-center gap-3 py-2 text-[11px]">
                <span className="w-40 shrink-0 tabular-nums text-slate-400">{e.ts ? new Date(e.ts).toLocaleString() : '·'}</span>
                <span className="w-28 shrink-0 rounded bg-slate-100 px-1.5 py-0.5 font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">{e.module ?? '·'}</span>
                <span className="flex-1 truncate text-slate-700 dark:text-slate-300">{e.event_type ?? 'event'}</span>
                {e.status && <span className="shrink-0 text-slate-500">{e.status}</span>}
                {e.actor && <span className="shrink-0 text-slate-400">{e.actor}</span>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ── deep-dive: recommendations ───────────────────────────────────────────────
function RecommendationsPanel({ data, onClose }: { data: GovIntelResponse; onClose: () => void }) {
  const recos = data.recommendations ?? [];
  return (
    <section className="rounded-xl border border-blue-200 bg-white shadow-sm dark:border-blue-900/40 dark:bg-slate-900">
      <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-2.5 dark:border-slate-700">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-100">
          <Sparkles className="h-4 w-4 text-blue-500" /> Recommendations
          <span className="ml-1 text-xs font-normal text-slate-400">{recos.length}</span>
        </h3>
        <button type="button" onClick={onClose} aria-label="Close deep-dive" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
      </header>
      <div className="max-h-[360px] overflow-auto p-3">
        {recos.length === 0 ? (
          <p className="py-10 text-center text-xs text-slate-400">No open recommendations.</p>
        ) : (
          <ul className="space-y-2">
            {recos.map((r, i) => {
              const rec = r as Record<string, unknown>;
              const title = String(rec.title ?? rec.recommendation ?? rec.finding ?? rec.id ?? 'recommendation');
              const detail = rec.detail ?? rec.description ?? rec.body ?? null;
              const sev = String(rec.severity ?? rec.priority ?? 'info');
              return (
                <li key={String(rec.id ?? i)} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', sevBadge(sev))}>{sev}</span>
                    <span className="truncate text-xs font-medium text-slate-800 dark:text-slate-200" title={title}>{title}</span>
                  </div>
                  {detail != null && detail !== '' && (
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">{String(detail)}</p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

// ── contextual right bar: finding detail + backend-authorized actions ────────
// Actions preserve the existing GovernanceCockpit wiring: recommendations do a
// REAL POST to /api/recommendations/{id}/{action}; identity/policy remediation
// isn't wired to a verb yet → pre-disabled "not yet wired" chips (never faked).
function FindingRightBar({
  finding, scope, allowedActions, onClose,
}: {
  finding: GovIntelFinding;
  scope?: string;
  allowedActions: Record<string, string[]>;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const actions = allowedActions[finding.kind] ?? [];
  const isReco = finding.kind === 'recommendation';
  const evidence = Object.entries(finding.evidence ?? {});

  const recoBody = (action: string): Record<string, unknown> => {
    if (action === 'snooze') return { snooze_until: new Date(Date.now() + 7 * 86_400_000).toISOString() };
    if (action === 'dismiss') return { reason: 'Dismissed from governance cockpit' };
    return { note: `${action} from governance cockpit` };
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`Finding ${finding.finding_id}`}>
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-[1px]" onClick={onClose} />
      <aside className="relative flex h-full w-full max-w-[460px] flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-700">
          <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase', sevBadge(finding.severity))}>
            {finding.severity} · {finding.kind}
          </span>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="h-4 w-4" /></button>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
          <section>
            <h5 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Summary</h5>
            <p className="text-sm text-slate-800 dark:text-slate-200">{finding.finding}</p>
            <p className="mt-1 text-[11px] text-slate-500">
              scope: {scope ?? '·'}{finding.window_days != null && ` · window ${finding.window_days}d`}
            </p>
          </section>

          <section>
            <h5 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Evidence</h5>
            {evidence.length === 0 ? (
              <p className="text-[11px] text-slate-400">No structured evidence.</p>
            ) : (
              <dl className="space-y-0.5">
                {evidence.map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-3 border-b border-slate-50 py-0.5 text-[11px] dark:border-slate-800">
                    <dt className="text-slate-500 dark:text-slate-400">{k}</dt>
                    <dd className="text-right font-medium text-slate-700 dark:text-slate-300">
                      {typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </section>

          {finding.recommendation && (
            <section>
              <h5 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Recommendation</h5>
              <p className="text-sm text-slate-700 dark:text-slate-300">{finding.recommendation}</p>
            </section>
          )}

          <section>
            <h5 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">Actions</h5>
            {actions.length === 0 ? (
              <p className="text-[11px] text-slate-400">No actions available for this finding.</p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {actions.map((action) =>
                  isReco ? (
                    <InsightActionButton
                      key={action}
                      label={action}
                      size="md"
                      successToast={`Recommendation ${action} queued`}
                      pingBell
                      onAction={() =>
                        apiClient.post(
                          `/api/recommendations/${encodeURIComponent(finding.finding_id)}/${action}`,
                          recoBody(action),
                        )
                      }
                    />
                  ) : (
                    <InsightActionButton
                      key={action}
                      label={action}
                      size="md"
                      capable={false}
                      unavailableHint="Not yet wired to a backend action"
                      onAction={async () => { /* unreachable while capable=false */ }}
                    />
                  ),
                )}
              </div>
            )}
            <p className="mt-2 text-[10px] text-slate-400">Actions are backend-authorized for your role.</p>
          </section>
        </div>
      </aside>
    </div>
  );
}

// ── skeleton ─────────────────────────────────────────────────────────────────
function OnePagerSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true">
      <div className="h-11 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />)}
      </div>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <div className="h-72 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800 xl:col-span-2" />
        <div className="h-72 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
      </div>
    </div>
  );
}
