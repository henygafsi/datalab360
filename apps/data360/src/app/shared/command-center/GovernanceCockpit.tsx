'use client';

/**
 * GovernanceCockpit — the refactored Security & Governance cockpit.
 *
 * Self-contained consumer of the ALREADY-BUILT aggregator
 *   GET /account-overview/governance/intelligence
 * (typed client `getGovernanceIntelligence` in services/command-center).
 *
 * Replaces the cluttered legacy layout (big donut, empty "Top Risks", "identity
 * breakdown not yet computed" placeholders, duplicated static action rows) with:
 *   1. a COMPACT KPI cockpit (small tone-coloured cards; null metrics folded
 *      behind "More metrics", never rendered as "—"),
 *   2. a lightweight segmented control (Overview | Audit Table | Timeline),
 *   3. a server-paginated / server-filtered AUDIT TABLE (the primary surface),
 *   4. an OVERVIEW health strip + critical-events list,
 *   5. a contextual, resizable, collapsible RIGHT BAR (not a modal) that shrinks
 *      the table when open, and
 *   6. a chronological TIMELINE view.
 *
 * Honest states throughout: skeleton shimmer while in flight, "unavailable" when
 * the aggregator returns null, and a "N sources degraded" note when the payload
 * reports degraded sources. Never fabricates success — recommendation actions do
 * a real POST (InsightActionButton owns the honest gating); identity/policy
 * actions render as pre-disabled "not yet wired" chips.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Search,
  ShieldCheck,
  Table2,
  Clock,
  LayoutGrid,
  X,
  PanelRightClose,
  PanelRightOpen,
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
import type { CommandCenterFilters } from '@/app/services/org-accounts/types';
import InsightActionButton from '@/app/shared/insights/InsightActionButton';

// ── Tone / severity helpers ──────────────────────────────────────────────────

const TONE_CARD: Record<'red' | 'amber' | 'green', string> = {
  red: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300',
  amber:
    'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300',
  green:
    'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300',
};
const TONE_NEUTRAL =
  'border-gray-200 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200';

function toneCard(tone?: string | null): string {
  if (tone === 'red' || tone === 'amber' || tone === 'green') return TONE_CARD[tone];
  return TONE_NEUTRAL;
}

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

/** Format a KPI value; callers guarantee value != null (nulls go to more_metrics). */
function fmtKpi(v: number | string | null, unit?: string): string {
  if (v === null || v === undefined) return '';
  const base =
    typeof v === 'number'
      ? Number.isInteger(v)
        ? v.toLocaleString()
        : v.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : String(v);
  return unit ? `${base}${unit.startsWith('/') || unit === '%' ? '' : ' '}${unit}` : base;
}

/** Table cell — null/empty renders as a muted middot, NEVER an em-dash. */
function Cell({ value, className }: { value: unknown; className?: string }) {
  const empty = value === null || value === undefined || value === '';
  return (
    <span
      className={cn(empty && 'text-gray-300 dark:text-gray-600', className)}
      title={empty ? undefined : String(value)}
    >
      {empty ? '·' : String(value)}
    </span>
  );
}

const PAGE_SIZES = [25, 50, 100, 250];

// ── Component ─────────────────────────────────────────────────────────────────

export default function GovernanceCockpit({ filters }: { filters: CommandCenterFilters }) {
  const days = filters.days;

  const [data, setData] = useState<GovIntelResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  const [view, setView] = useState<'overview' | 'audit' | 'timeline'>('overview');

  // Server-side query state (audit table).
  const [page, setPage] = useState(1); // backend audit.page is 1-based
  const [pageSize, setPageSize] = useState(25);
  const [sevSel, setSevSel] = useState<string[]>([]);
  const [kindSel, setKindSel] = useState<string[]>([]);
  const [qInput, setQInput] = useState('');
  const [q, setQ] = useState('');

  // Right bar.
  const [selected, setSelected] = useState<GovIntelFinding | null>(null);
  const [railWidth, setRailWidth] = useState(400);
  const [railCollapsed, setRailCollapsed] = useState(false);

  const reqId = useRef(0);

  const sevCsv = sevSel.join(',');
  const kindCsv = kindSel.join(',');

  // Debounce the free-text search into the server param.
  useEffect(() => {
    const t = setTimeout(() => setQ(qInput.trim()), 400);
    return () => clearTimeout(t);
  }, [qInput]);

  // Reset to page 1 whenever a filter changes.
  useEffect(() => {
    setPage(1);
  }, [sevCsv, kindCsv, q, pageSize, days]);

  const fetchData = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    const params: GovIntelParams = {
      days,
      page,
      page_size: pageSize,
      severity: sevCsv || undefined,
      kind: kindCsv || undefined,
      q: q || undefined,
    };
    const res = await getGovernanceIntelligence(params);
    if (id !== reqId.current) return; // drop stale response
    if (res) {
      setData(res);
      setFailed(false);
    } else {
      setFailed(true);
    }
    setLoading(false);
  }, [days, page, pageSize, sevCsv, kindCsv, q]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // ── KPI card → filter mapping (only emit facet values the backend supports) ──
  const applyKpiFilter = useCallback(
    (card: GovIntelKpiCard) => {
      const facets = data?.facets;
      let sev: string[] = [];
      let kind: string[] = [];
      if (card.id === 'critical_findings') sev = ['critical'];
      if (card.group === 'identity') kind = ['identity'];
      if (card.group === 'policy') kind = ['policy'];
      // Intersect with real facets — never emit a value the audit can't match.
      sev = facets ? sev.filter((s) => facets.severity.includes(s)) : sev;
      kind = facets ? kind.filter((k) => facets.kind.includes(k)) : kind;
      setSevSel(sev);
      setKindSel(kind);
      setView('audit');
    },
    [data],
  );

  const openRow = useCallback((row: GovIntelFinding) => {
    setSelected(row);
    setRailCollapsed(false);
  }, []);

  // ── Right-bar drag resize ──────────────────────────────────────────────────
  const dragging = useRef(false);
  const onDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = true;
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return;
      // Rail is anchored to the right; width grows as the cursor moves left.
      const next = window.innerWidth - ev.clientX;
      setRailWidth(Math.min(640, Math.max(380, next)));
    };
    const onUp = () => {
      dragging.current = false;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, []);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const visibleCards = useMemo(
    () => (data?.kpi_cards ?? []).filter((c) => c.value !== null && c.value !== undefined),
    [data],
  );
  const hiddenCards = useMemo<GovIntelKpiCard[]>(() => {
    const nulls = (data?.kpi_cards ?? []).filter((c) => c.value === null || c.value === undefined);
    return [...nulls, ...(data?.more_metrics ?? [])];
  }, [data]);

  const degradedCount = data ? Object.keys(data.degraded_sources ?? {}).length : 0;
  const audit = data?.audit;
  const totalPages = audit ? Math.max(1, Math.ceil(audit.filtered_rows / audit.page_size)) : 1;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-500" aria-hidden />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Governance cockpit
          </h3>
          <span className="text-[11px] text-gray-400">last {days}d</span>
        </div>
        {degradedCount > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
            title={Object.entries(data!.degraded_sources)
              .map(([k, v]) => `${k}: ${v}`)
              .join('\n')}
          >
            <AlertTriangle className="h-3 w-3" aria-hidden />
            {degradedCount} source{degradedCount === 1 ? '' : 's'} degraded
          </span>
        )}
      </div>

      {/* 1 · COMPACT KPI COCKPIT */}
      <div data-testid="gov-kpi-cockpit">
        {loading && !data ? (
          <div className="flex gap-2 overflow-hidden">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="h-[80px] w-[150px] shrink-0 animate-pulse rounded-lg bg-gray-200 dark:bg-gray-700"
              />
            ))}
          </div>
        ) : failed || !data ? (
          <div className="rounded-lg border border-gray-200 bg-white p-4 text-xs text-gray-500 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400">
            Governance intelligence unavailable — the aggregator did not return a payload.
          </div>
        ) : (
          <>
            <div className="flex max-h-[184px] flex-wrap gap-2 overflow-x-auto overflow-y-auto">
              {visibleCards.map((card, i) => (
                <button
                  type="button"
                  key={`${card.group ?? ''}-${card.label}-${i}`}
                  onClick={() => applyKpiFilter(card)}
                  title={`${card.label} — click to filter the audit table`}
                  className={cn(
                    'flex h-[80px] w-[150px] shrink-0 flex-col justify-between rounded-lg border p-2 text-left transition-shadow hover:shadow-sm',
                    toneCard(card.tone),
                  )}
                >
                  <span className="line-clamp-2 text-[10px] font-medium uppercase tracking-wide opacity-80">
                    {card.label}
                  </span>
                  <span className="text-lg font-semibold tabular-nums leading-none">
                    {fmtKpi(card.value, card.unit)}
                  </span>
                </button>
              ))}
            </div>
            {hiddenCards.length > 0 && (
              <details className="mt-2 group">
                <summary className="cursor-pointer list-none text-[11px] font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                  <span className="group-open:hidden">▸ </span>
                  <span className="hidden group-open:inline">▾ </span>
                  More metrics ({hiddenCards.length})
                </summary>
                <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3 lg:grid-cols-4">
                  {hiddenCards.map((c, i) => (
                    <div
                      key={`more-${c.label}-${i}`}
                      className="flex items-center justify-between border-b border-gray-100 py-0.5 text-[11px] dark:border-gray-800"
                    >
                      <span className="text-gray-500 dark:text-gray-400">{c.label}</span>
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {c.value === null || c.value === undefined
                          ? 'not computed'
                          : fmtKpi(c.value, c.unit)}
                      </span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </>
        )}
      </div>

      {/* 2 · SEGMENTED CONTROL */}
      <div className="inline-flex w-fit rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs dark:border-gray-700 dark:bg-gray-800">
        {(
          [
            ['overview', 'Overview', LayoutGrid],
            ['audit', 'Audit Table', Table2],
            ['timeline', 'Timeline', Clock],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            type="button"
            key={id}
            onClick={() => setView(id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md px-3 py-1 font-medium transition-colors',
              view === id
                ? 'bg-white text-gray-900 shadow-sm dark:bg-gray-900 dark:text-white'
                : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        ))}
      </div>

      {/* BODY: main area (shrinks) + contextual right bar (not a popup) */}
      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {view === 'overview' && <OverviewPanel data={data} onCardClick={applyKpiFilter} />}
          {view === 'audit' && (
            <AuditPanel
              data={data}
              loading={loading}
              page={page}
              totalPages={totalPages}
              pageSize={pageSize}
              setPageSize={setPageSize}
              setPage={setPage}
              sevSel={sevSel}
              setSevSel={setSevSel}
              kindSel={kindSel}
              setKindSel={setKindSel}
              qInput={qInput}
              setQInput={setQInput}
              selectedId={selected?.finding_id}
              onRow={openRow}
            />
          )}
          {view === 'timeline' && <TimelinePanel data={data} />}
        </div>

        {selected && (
          <RightBar
            finding={selected}
            scope={data?.score_summary.scope}
            allowedActions={data?.allowed_actions ?? {}}
            width={railCollapsed ? 40 : railWidth}
            collapsed={railCollapsed}
            onToggleCollapse={() => setRailCollapsed((c) => !c)}
            onClose={() => setSelected(null)}
            onDragStart={onDragStart}
          />
        )}
      </div>
    </div>
  );
}

// ── 4 · OVERVIEW ───────────────────────────────────────────────────────────────

function OverviewPanel({
  data,
  onCardClick,
}: {
  data: GovIntelResponse | null;
  onCardClick: (c: GovIntelKpiCard) => void;
}) {
  if (!data) {
    return <div className="h-40 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />;
  }
  const s = data.score_summary;
  const scoreTone =
    s.score == null ? 'green' : s.score >= 80 ? 'green' : s.score >= 60 ? 'amber' : 'red';
  const events = (data.timeline ?? []).slice(0, 8);
  const critCard = data.kpi_cards.find((c) => c.id === 'critical_findings');
  const openCard = data.kpi_cards.find((c) => c.id === 'open_recommendations');

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
      {/* Health strip (no donut) */}
      <div className="flex flex-wrap items-stretch gap-3">
        <div
          className={cn(
            'flex min-w-[220px] flex-col justify-center rounded-xl border p-4',
            toneCard(scoreTone),
          )}
        >
          <span className="text-[11px] font-medium uppercase tracking-wide opacity-80">
            Governance score · {s.scope}
          </span>
          <span className="text-4xl font-bold tabular-nums leading-tight">
            {s.score == null ? 'n/a' : s.score.toFixed(1)}
            {s.score != null && <span className="text-lg font-medium opacity-70"> /100</span>}
          </span>
        </div>
        {critCard && (
          <button
            type="button"
            onClick={() => onCardClick(critCard)}
            className="flex min-w-[150px] flex-col justify-center rounded-xl border border-gray-200 bg-white p-4 text-left hover:shadow-sm dark:border-gray-700 dark:bg-gray-900"
          >
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
              Critical findings
            </span>
            <span className="text-3xl font-bold tabular-nums text-gray-900 dark:text-white">
              {s.critical_findings}
            </span>
          </button>
        )}
        {openCard && (
          <div className="flex min-w-[150px] flex-col justify-center rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
            <span className="text-[11px] font-medium uppercase tracking-wide text-gray-500">
              Open recommendations
            </span>
            <span className="text-3xl font-bold tabular-nums text-gray-900 dark:text-white">
              {s.open_recommendations}
            </span>
          </div>
        )}
      </div>

      {/* Critical events list */}
      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <h4 className="mb-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
          Recent governance events
        </h4>
        {events.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-gray-400">
            No governance events in this window.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100 dark:divide-gray-800">
            {events.map((e, i) => (
              <li key={i} className="flex items-center gap-2 py-1.5 text-[11px]">
                <span className="shrink-0 tabular-nums text-gray-400">
                  {e.ts ? new Date(e.ts).toLocaleString() : '·'}
                </span>
                <span className="shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                  {e.module ?? '·'}
                </span>
                <span className="truncate text-gray-700 dark:text-gray-300">
                  {e.event_type ?? 'event'}
                </span>
                {e.status && (
                  <span className="ml-auto shrink-0 text-gray-400">{e.status}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── 3 · AUDIT TABLE ──────────────────────────────────────────────────────────

const COLS = ['severity', 'kind', 'finding', 'user', 'role', 'object', 'status', 'recommendation'];

function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
        active
          ? 'border-blue-500 bg-blue-500 text-white'
          : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300',
      )}
    >
      {label}
    </button>
  );
}

function AuditPanel({
  data,
  loading,
  page,
  totalPages,
  pageSize,
  setPageSize,
  setPage,
  sevSel,
  setSevSel,
  kindSel,
  setKindSel,
  qInput,
  setQInput,
  selectedId,
  onRow,
}: {
  data: GovIntelResponse | null;
  loading: boolean;
  page: number;
  totalPages: number;
  pageSize: number;
  setPageSize: (n: number) => void;
  setPage: (updater: (p: number) => number) => void;
  sevSel: string[];
  setSevSel: (updater: (s: string[]) => string[]) => void;
  kindSel: string[];
  setKindSel: (updater: (s: string[]) => string[]) => void;
  qInput: string;
  setQInput: (s: string) => void;
  selectedId?: string;
  onRow: (r: GovIntelFinding) => void;
}) {
  const facets = data?.facets;
  const audit = data?.audit;
  const rows = audit?.rows ?? [];

  const toggle =
    (setter: (u: (s: string[]) => string[]) => void) => (val: string) =>
      setter((cur) => (cur.includes(val) ? cur.filter((x) => x !== val) : [...cur, val]));

  return (
    <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-100 p-2 dark:border-gray-800">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Search findings…"
            className="w-48 rounded-md border border-gray-200 bg-white py-1 pl-7 pr-2 text-xs text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
          />
        </div>
        {(facets?.severity?.length ?? 0) > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-semibold uppercase text-gray-400">sev</span>
            {facets!.severity.map((s) => (
              <Chip
                key={s}
                label={s}
                active={sevSel.includes(s)}
                onClick={() => toggle(setSevSel)(s)}
              />
            ))}
          </div>
        )}
        {(facets?.kind?.length ?? 0) > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] font-semibold uppercase text-gray-400">kind</span>
            {facets!.kind.map((k) => (
              <Chip
                key={k}
                label={k}
                active={kindSel.includes(k)}
                onClick={() => toggle(setKindSel)(k)}
              />
            ))}
          </div>
        )}
        {audit && (
          <span className="ml-auto text-[11px] text-gray-500 dark:text-gray-400">
            {audit.filtered_rows.toLocaleString()} of {audit.total_rows.toLocaleString()} findings
          </span>
        )}
      </div>

      {/* Table — bounded height so the sticky header + internal scroll hold
          regardless of the parent's height (mounted inside a shrink-0 wrapper),
          and larger page sizes never push the page. */}
      <div className="min-h-0 max-h-[460px] flex-1 overflow-auto">
        {loading && !audit ? (
          <div className="space-y-1 p-3">
            {[...Array(8)].map((_, i) => (
              <div key={i} className="h-7 animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-xs text-gray-400">
            No findings match the current filters.
          </p>
        ) : (
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800">
              <tr>
                {COLS.map((c) => (
                  <th
                    key={c}
                    className="whitespace-nowrap border-b border-gray-200 px-2 py-1.5 font-semibold capitalize text-gray-600 dark:border-gray-700 dark:text-gray-300"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.finding_id}
                  onClick={() => onRow(r)}
                  className={cn(
                    'cursor-pointer border-b border-gray-100 last:border-0 hover:bg-blue-50/50 dark:border-gray-800 dark:hover:bg-blue-950/20',
                    selectedId === r.finding_id && 'bg-blue-50 dark:bg-blue-950/30',
                  )}
                >
                  <td className="px-2 py-1.5">
                    <span
                      className={cn(
                        'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
                        sevBadge(r.severity),
                      )}
                    >
                      {r.severity}
                    </span>
                  </td>
                  <td className="px-2 py-1.5 text-gray-500 dark:text-gray-400">{r.kind}</td>
                  <td className="max-w-[280px] truncate px-2 py-1.5 text-gray-800 dark:text-gray-200">
                    <Cell value={r.finding} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Cell value={r.user} />
                  </td>
                  <td className="px-2 py-1.5">
                    <Cell value={r.role} />
                  </td>
                  <td className="max-w-[180px] truncate px-2 py-1.5">
                    <Cell value={r.object} />
                  </td>
                  <td className="px-2 py-1.5 text-gray-500 dark:text-gray-400">{r.status}</td>
                  <td className="max-w-[220px] truncate px-2 py-1.5">
                    <Cell value={r.recommendation} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pager */}
      <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-3 py-1.5 text-[11px] text-gray-500 dark:border-gray-800 dark:text-gray-400">
        <label className="flex items-center gap-1">
          Rows
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded border border-gray-200 bg-white px-1 py-0.5 text-[11px] dark:border-gray-700 dark:bg-gray-800"
          >
            {PAGE_SIZES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <span className="tabular-nums">
          page {page}/{totalPages}
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="inline-flex items-center rounded px-1.5 py-0.5 enabled:hover:bg-gray-100 disabled:opacity-40 dark:enabled:hover:bg-gray-800"
          >
            <ChevronLeft className="h-3.5 w-3.5" /> Prev
          </button>
          <button
            type="button"
            onClick={() => setPage((p) => p + 1)}
            disabled={!audit?.has_next}
            className="inline-flex items-center rounded px-1.5 py-0.5 enabled:hover:bg-gray-100 disabled:opacity-40 dark:enabled:hover:bg-gray-800"
          >
            Next <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </span>
      </div>
    </div>
  );
}

// ── 6 · TIMELINE ────────────────────────────────────────────────────────────

function TimelinePanel({ data }: { data: GovIntelResponse | null }) {
  if (!data) {
    return <div className="h-40 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />;
  }
  const events = [...(data.timeline ?? [])].sort((a, b) =>
    (b.ts ?? '').localeCompare(a.ts ?? ''),
  );
  return (
    <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
      {events.length === 0 ? (
        <p className="py-10 text-center text-xs text-gray-400">
          No timeline events in this window.
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-800">
          {events.map((e, i) => (
            <li key={i} className="flex items-center gap-3 py-2 text-[11px]">
              <span className="w-40 shrink-0 tabular-nums text-gray-400">
                {e.ts ? new Date(e.ts).toLocaleString() : '·'}
              </span>
              <span className="w-28 shrink-0 rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
                {e.module ?? '·'}
              </span>
              <span className="flex-1 truncate text-gray-700 dark:text-gray-300">
                {e.event_type ?? 'event'}
              </span>
              {e.status && <span className="shrink-0 text-gray-500">{e.status}</span>}
              {e.actor && <span className="shrink-0 text-gray-400">{e.actor}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── 5 · CONTEXTUAL RIGHT BAR ─────────────────────────────────────────────────

function RightBar({
  finding,
  scope,
  allowedActions,
  width,
  collapsed,
  onToggleCollapse,
  onClose,
  onDragStart,
}: {
  finding: GovIntelFinding;
  scope?: string;
  allowedActions: Record<string, string[]>;
  width: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onClose: () => void;
  onDragStart: (e: React.MouseEvent) => void;
}) {
  const actions = allowedActions[finding.kind] ?? [];
  const isReco = finding.kind === 'recommendation';

  // Build a sensible body per recommendation action so the POST doesn't 422.
  const recoBody = (action: string): Record<string, unknown> => {
    if (action === 'snooze')
      return { snooze_until: new Date(Date.now() + 7 * 86_400_000).toISOString() };
    if (action === 'dismiss') return { reason: 'Dismissed from governance cockpit' };
    return { note: `${action} from governance cockpit` };
  };

  if (collapsed) {
    return (
      <div
        style={{ width }}
        className="flex shrink-0 flex-col items-center gap-2 rounded-xl border border-gray-200 bg-white py-2 dark:border-gray-700 dark:bg-gray-900"
      >
        <button
          type="button"
          onClick={onToggleCollapse}
          title="Expand detail panel"
          className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
      </div>
    );
  }

  const evidence = Object.entries(finding.evidence ?? {});

  return (
    <div
      style={{ width }}
      className="relative flex shrink-0 flex-col overflow-hidden rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
    >
      {/* Drag handle */}
      <div
        onMouseDown={onDragStart}
        title="Drag to resize"
        className="absolute inset-y-0 left-0 z-10 w-1.5 cursor-col-resize hover:bg-blue-400/40"
      />
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-gray-100 px-3 py-2 pl-4 dark:border-gray-800">
        <span
          className={cn(
            'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase',
            sevBadge(finding.severity),
          )}
        >
          {finding.severity} · {finding.kind}
        </span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onToggleCollapse}
            title="Collapse"
            className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            title="Close"
            className="rounded p-1 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        {/* Summary */}
        <section>
          <h5 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Summary
          </h5>
          <p className="text-sm text-gray-800 dark:text-gray-200">{finding.finding}</p>
          <p className="mt-1 text-[11px] text-gray-500">
            scope: {scope ?? '·'}
            {finding.window_days != null && ` · window ${finding.window_days}d`}
          </p>
        </section>

        {/* Evidence */}
        <section>
          <h5 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Evidence
          </h5>
          {evidence.length === 0 ? (
            <p className="text-[11px] text-gray-400">No structured evidence.</p>
          ) : (
            <dl className="space-y-0.5">
              {evidence.map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-start justify-between gap-3 border-b border-gray-50 py-0.5 text-[11px] dark:border-gray-800"
                >
                  <dt className="text-gray-500 dark:text-gray-400">{k}</dt>
                  <dd className="text-right font-medium text-gray-700 dark:text-gray-300">
                    {typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
        </section>

        {/* Recommendation */}
        {finding.recommendation && (
          <section>
            <h5 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
              Recommendation
            </h5>
            <p className="text-sm text-gray-700 dark:text-gray-300">{finding.recommendation}</p>
          </section>
        )}

        {/* Actions */}
        <section>
          <h5 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
            Actions
          </h5>
          {actions.length === 0 ? (
            <p className="text-[11px] text-gray-400">No actions available for this finding.</p>
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
                    // Honest gating: identity/policy remediation isn't wired to a
                    // backend verb yet — render a disabled "not yet wired" chip
                    // rather than fabricate success.
                    capable={false}
                    unavailableHint="Not yet wired to a backend action"
                    onAction={async () => {
                      /* unreachable while capable=false */
                    }}
                  />
                ),
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
