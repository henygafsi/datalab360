'use client';

/**
 * PreviewStep — "Here is your first report." The REAL preview.
 *
 * Generated once from the understanding the user confirmed in the previous
 * step (sessionStorage seam `studio:understanding:v1`), then every figure is
 * actually RUN on the user's permitted data via /studio/report/run — nothing
 * is faked, and unavailable pieces say so. Light edits (aggregator / time
 * grain) mutate the chart spec LOCALLY, validate, and re-run that one tile;
 * there is never a full regeneration. Provenance stays visible: read time,
 * sample scope, and the exact SQL behind the figures.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import nextDynamic from 'next/dynamic';
import { FileSearch, RotateCw } from 'lucide-react';
import { PlainQuestionHeader, QuietAction } from '@/app/shared/studio/PlainKit';
import EmptyState from '@/components/ui/EmptyState';
import {
  generateReport,
  runChart,
  runChartBatch,
  validateChart,
  type GlobalFilter,
  type ModelPatchResult,
  type RunResult,
  type StudioChartSpec,
  type StudioReportSpec,
  type StudioUnderstanding,
} from '@/app/services/studio/studio-api';
import type { JourneyDraft } from './journey';
import RefineChat from './RefineChat';
import AtelierRails from '@/app/shared/studio/AtelierRails';
import { readFailure } from '@/app/shared/studio/studio-errors';

const DynamicChart = nextDynamic(
  () => import('@/app/(dashboard)/bi-dashboard/components/DynamicChart'),
  { ssr: false },
);

const UNDERSTANDING_KEY = 'studio:understanding:v1';
const AGGREGATORS = ['SUM', 'AVG', 'COUNT', 'MIN', 'MAX'];
const GRAINS = ['day', 'week', 'month'];

/* ── helpers ───────────────────────────────────────────────────────── */

function readUnderstanding(): StudioUnderstanding | null {
  try {
    const raw = window.sessionStorage.getItem(UNDERSTANDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') return null;
    // M2 stores the understanding either bare or under `understanding`.
    const u = ((parsed as { understanding?: unknown }).understanding ??
      parsed) as StudioUnderstanding;
    return Array.isArray(u?.entities) && u.entities.length > 0 ? u : null;
  } catch {
    return null;
  }
}

/** '—' for unknowns, never 0 (Lite rule). */
function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') {
    return Number.isInteger(v)
      ? v.toLocaleString()
      : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (typeof v === 'string') {
    const n = Number(v);
    if (v.trim() !== '' && Number.isFinite(n)) return fmtVal(n);
  }
  return String(v);
}

/** rows[][] + columns[] → the record shape DynamicChart prefetches. */
function toChartData(r: RunResult): Record<string, unknown>[] {
  const cols = r.columns ?? [];
  return (r.rows ?? []).slice(0, 200).map((row) => {
    const o: Record<string, unknown> = {};
    cols.forEach((c, i) => {
      let v = row[i];
      // Period timestamps ("2025-05-01T00:00:00-07:00") → short labels.
      if (i === 0 && typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)) {
        v = v.slice(0, 10);
      }
      o[c] = v;
    });
    return o;
  });
}

function errMsg(e: unknown): string {
  if (e && typeof e === 'object') {
    const anyE = e as { response?: { data?: { detail?: unknown } }; message?: string };
    const detail = anyE.response?.data?.detail;
    if (typeof detail === 'string' && detail) return detail;
    if (anyE.message) return anyE.message;
  }
  return 'This figure could not be computed.';
}

type TileState =
  | { status: 'running' }
  | { status: 'done'; result: RunResult }
  | { status: 'error'; error: string };

type Phase =
  | { kind: 'boot' }
  | { kind: 'missing' }
  | { kind: 'generating' }
  | { kind: 'ready' }
  | { kind: 'failed'; message: string };

/* ── component ─────────────────────────────────────────────────────── */

export default function PreviewStep({
  draft,
  onPatch,
  onNext,
  onBack,
}: {
  draft: JourneyDraft;
  onPatch: (patch: Partial<JourneyDraft>) => void;
  onNext: () => void;
  onBack?: () => void;
}) {
  const [phase, setPhase] = useState<Phase>({ kind: 'boot' });
  const [report, setReport] = useState<StudioReportSpec | null>(null);
  const [specs, setSpecs] = useState<Record<string, StudioChartSpec>>({});
  const [tiles, setTiles] = useState<Record<string, TileState>>({});
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [readAt, setReadAt] = useState<string | null>(null);

  const specsRef = useRef<Record<string, StudioChartSpec>>({});
  const gfRef = useRef<GlobalFilter[]>([]);
  const booted = useRef(false);

  const setTile = useCallback((id: string, t: TileState) => {
    setTiles((prev) => ({ ...prev, [id]: t }));
  }, []);

  const runTile = useCallback(
    async (spec: StudioChartSpec, gf: GlobalFilter[]) => {
      setTile(spec.chart_id, { status: 'running' });
      try {
        const result = await runChart(spec, gf);
        setTile(spec.chart_id, { status: 'done', result });
      } catch (e) {
        setTile(spec.chart_id, { status: 'error', error: errMsg(e) });
      }
    },
    [setTile],
  );

  /** Run all runnable specs — ONE batch call (a single backend connection);
   *  per-tile sequential runs remain the fallback when the batch fails. */
  const runAll = useCallback(
    async (list: StudioChartSpec[], gf: GlobalFilter[]) => {
      const queue = list.filter((s) => s.status !== 'unavailable');
      if (queue.length > 0) {
        for (const s of queue) setTile(s.chart_id, { status: 'running' });
        try {
          const batch = await runChartBatch(queue, {
            draftId: draft.preview.reportDraftId ?? draft.draftId ?? undefined,
            globalFilters: gf,
          });
          for (const r of batch.results ?? []) {
            if (!r.chart_id) continue;
            if (r.status === 'error') {
              // the batch route sends an OBJECT here despite declaring a
              // string — rendering it as a JSX child blanks the page
              setTile(r.chart_id, { status: 'error', error: readFailure(r.error).text });
            } else {
              setTile(r.chart_id, { status: 'done', result: r as RunResult });
            }
          }
        } catch {
          // fallback: the old per-tile path, 2 in flight
          const rest = [...queue];
          const workers = Array.from({ length: Math.min(2, rest.length) }, async () => {
            for (let s = rest.shift(); s; s = rest.shift()) await runTile(s, gf);
          });
          await Promise.all(workers);
        }
      }
      setReadAt(
        new Date().toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        }),
      );
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [runTile, setTile, draft.draftId, draft.preview.reportDraftId],
  );

  const bootstrap = useCallback(async () => {
    const understanding = readUnderstanding();
    if (!understanding) {
      setPhase({ kind: 'missing' });
      return;
    }
    setPhase({ kind: 'generating' });
    try {
      const { draft_id, report: spec } = await generateReport({
        understanding,
        need: draft.need.text,
        draft_id: draft.draftId ?? undefined,
      });
      if (draft_id) onPatch({ preview: { reportDraftId: draft_id } });
      const map: Record<string, StudioChartSpec> = {};
      for (const s of [...(spec.kpis ?? []), ...(spec.charts ?? [])]) map[s.chart_id] = s;
      if (spec.detail) map[spec.detail.chart_id] = spec.detail;
      specsRef.current = map;
      setSpecs(map);
      setReport(spec);
      setPhase({ kind: 'ready' });
      void runAll(Object.values(map), gfRef.current);
    } catch (e) {
      setPhase({ kind: 'failed', message: errMsg(e) });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.need.text, onPatch, runAll]);

  useEffect(() => {
    if (booted.current) return; // strict-mode double mount ≠ double generate
    booted.current = true;
    void bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* global date-range filter (applied to EVERY run for coherence) */
  const dateFilter = useMemo(
    () =>
      (report?.filters ?? []).find(
        (f) => f.type === 'date_range' || /date/i.test(f.type ?? ''),
      ) ?? null,
    [report],
  );

  const onDateChange = useCallback(
    (which: 'from' | 'to', value: string) => {
      const from = which === 'from' ? value : dateFrom;
      const to = which === 'to' ? value : dateTo;
      setDateFrom(from);
      setDateTo(to);
      if (!dateFilter) return;
      const gf: GlobalFilter[] = [];
      if (from) gf.push({ column: dateFilter.column, operator: '>=', value: from });
      if (to) gf.push({ column: dateFilter.column, operator: '<=', value: to });
      gfRef.current = gf;
      void runAll(Object.values(specsRef.current), gf);
    },
    [dateFrom, dateTo, dateFilter, runAll],
  );

  /** Light edit: patch the spec locally (stable id), validate, re-run ONE tile. */
  const editChart = useCallback(
    async (chartId: string, patch: { aggregator?: string; grain?: string }) => {
      const prev = specsRef.current[chartId];
      if (!prev) return;
      const next: StudioChartSpec = { ...prev };
      if (patch.aggregator && prev.measures.length > 0) {
        next.measures = prev.measures.map((m, i) =>
          i === 0 ? { ...m, aggregator: patch.aggregator as string } : m,
        );
      }
      if (patch.grain && prev.time) next.time = { ...prev.time, grain: patch.grain };
      specsRef.current = { ...specsRef.current, [chartId]: next };
      setSpecs(specsRef.current);
      setTile(chartId, { status: 'running' });
      try {
        const v = await validateChart(next, gfRef.current);
        const valid = v?.ok === true || (v as { status?: string })?.status === 'valid';
        if (!valid) {
          const reason = (v as { error?: unknown })?.error;
          setTile(chartId, {
            status: 'error',
            error:
              typeof reason === 'string' && reason
                ? reason
                : 'That combination is not valid for this data.',
          });
          return;
        }
        const result = await runChart(next, gfRef.current);
        setTile(chartId, { status: 'done', result });
      } catch (e) {
        setTile(chartId, { status: 'error', error: errMsg(e) });
      }
    },
    [setTile],
  );

  /** K3 apply landed: fold the exact before→after diff into the local
   *  report (no regeneration), then re-run ONLY the tiles whose DATA
   *  changed — a title-only change re-runs nothing. */
  const handleRefineApplied = useCallback(
    (res: ModelPatchResult) => {
      if (!report) return;
      const entries = res.applied ?? [];
      if (entries.length === 0) return;
      const next = JSON.parse(JSON.stringify(report)) as StudioReportSpec;
      const rerun = new Set<string>();
      const seg = (s: string): string | number => (/^\d+$/.test(s) ? Number(s) : s);
      for (const a of entries) {
        const parts = a.path.replace(/^\//, '').split('/');
        if (parts[0] !== 'report' || parts.length < 2) continue;
        const rel = parts.slice(1);
        let target: unknown = next;
        for (let i = 0; i < rel.length - 1 && target != null; i++) {
          target = (target as Record<string | number, unknown>)[seg(rel[i])];
        }
        if (target != null) {
          (target as Record<string | number, unknown>)[seg(rel[rel.length - 1])] =
            a.after;
        }
        const m = a.path.match(/^\/report\/(kpis|charts)\/(\d+)\/([a-z_]+)/);
        if (m && !['title', 'presentation'].includes(m[3])) {
          const list = m[1] === 'kpis' ? next.kpis : next.charts;
          const spec = list?.[Number(m[2])];
          if (spec) rerun.add(spec.chart_id);
        } else if (
          /^\/report\/detail\//.test(a.path) &&
          !/\/title$/.test(a.path) &&
          next.detail
        ) {
          rerun.add(next.detail.chart_id);
        }
      }
      const map: Record<string, StudioChartSpec> = {};
      for (const s of [...(next.kpis ?? []), ...(next.charts ?? [])]) map[s.chart_id] = s;
      if (next.detail) map[next.detail.chart_id] = next.detail;
      // dependencies may also name impacted charts directly
      for (const d of res.dependencies ?? []) {
        for (const impact of d.impacts ?? []) {
          if (map[impact]) rerun.add(impact);
        }
      }
      specsRef.current = map;
      setSpecs(map);
      setReport(next);
      for (const id of rerun) {
        const spec = map[id];
        if (spec && spec.status !== 'unavailable') void runTile(spec, gfRef.current);
      }
    },
    [report, runTile],
  );

  const sampleScope = useMemo(
    () =>
      Object.values(tiles).some(
        (t) => t.status === 'done' && t.result.scope?.is_production_total === false,
      ),
    [tiles],
  );

  const ranSql = useMemo(
    () =>
      Object.entries(tiles)
        .filter((e): e is [string, Extract<TileState, { status: 'done' }>] => e[1].status === 'done')
        .map(([id, t]) => ({ id, title: specsRef.current[id]?.title ?? id, sql: t.result.sql }))
        .filter((x) => Boolean(x.sql)),
    [tiles],
  );

  /* ── empty / loading / failed legs ─────────────────────────────── */

  if (phase.kind === 'missing') {
    return (
      <EmptyState
        compact
        icon={FileSearch}
        title="Run the understanding step first"
        description="The preview is generated from the understanding you confirm — there is nothing confirmed yet."
        action={
          onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700"
            >
              Back to understanding
            </button>
          ) : undefined
        }
      />
    );
  }

  if (phase.kind === 'boot' || phase.kind === 'generating') {
    return (
      <div className="space-y-3">
        <PlainQuestionHeader
          question="Building your first report…"
          detail="Assembling KPIs and charts from what you confirmed — every figure runs on your permitted data."
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-hidden>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/60" />
          ))}
        </div>
        <div className="h-56 animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/60" aria-hidden />
      </div>
    );
  }

  if (phase.kind === 'failed') {
    return (
      <div className="space-y-3">
        <PlainQuestionHeader
          question="The report could not be generated"
          detail="Nothing was charged — you can retry, or go back and adjust the understanding."
        />
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {phase.message}
        </p>
        <div className="flex items-center gap-3">
          <QuietAction label="Retry" icon={RotateCw} onClick={() => void bootstrap()} />
          {onBack && <QuietAction label="Back to understanding" onClick={onBack} />}
        </div>
      </div>
    );
  }

  if (!report) return null;

  /* ── the report, one compact page ──────────────────────────────── */

  const atelierDraftId = draft.preview.reportDraftId ?? draft.draftId ?? null;
  const kpis = report.kpis ?? [];
  const charts = report.charts ?? [];
  const detail = report.detail ?? null;
  const detailTile = detail ? tiles[detail.chart_id] : undefined;

  return (
    // the report itself is the left column when the atelier rail can show
    <div className={atelierDraftId ? 'grid grid-cols-1 gap-3 xl:grid-cols-[1fr,280px]' : undefined}>
    <div className="min-w-0 space-y-3">
      <PlainQuestionHeader
        question={report.title || 'Your first report'}
        detail="Generated from your confirmed understanding — every figure below ran on your permitted data."
      />

      {/* provenance — always visible next to the figures (Lite rule 3) */}
      <div className="space-y-1">
        <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
          Figures read {readAt ?? '—'}
          {sampleScope ? ' · sample scope — not production totals' : ''}
        </p>
        {ranSql.length > 0 && (
          <details className="text-xs text-slate-500 dark:text-slate-400">
            <summary className="cursor-pointer list-none text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
              How this was computed
            </summary>
            <div className="mt-1 max-h-32 space-y-1.5 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-900">
              {ranSql.map((s) => (
                <div key={s.id}>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-300">{s.title}</p>
                  <pre className="whitespace-pre-wrap break-all font-mono text-xs text-slate-500 dark:text-slate-400">{s.sql}</pre>
                </div>
              ))}
            </div>
          </details>
        )}
        {(report.unavailable?.length ?? 0) > 0 && (
          <p
            className="text-xs text-slate-400 dark:text-slate-500"
            title={report.unavailable!.map((u) => `${u.label}: ${u.reason}`).join('\n')}
          >
            {report.unavailable!.length} more field{report.unavailable!.length === 1 ? '' : 's'} available from the editor
          </p>
        )}
      </div>

      {/* global date range — one filter, applied to every run */}
      {dateFilter && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
          <label htmlFor="studio-preview-from">Period · {dateFilter.column}</label>
          <input
            id="studio-preview-from"
            type="date"
            value={dateFrom}
            onChange={(e) => onDateChange('from', e.target.value)}
            className="h-6 rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          />
          <span aria-hidden>→</span>
          <input
            id="studio-preview-to"
            type="date"
            aria-label="Period end"
            value={dateTo}
            onChange={(e) => onDateChange('to', e.target.value)}
            className="h-6 rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          />
        </div>
      )}

      {/* KPI row */}
      {kpis.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Key figures">
          {kpis.map((k) => {
            const spec = specs[k.chart_id] ?? k;
            const tile = tiles[k.chart_id];
            const unavailable = spec.status === 'unavailable';
            return (
              <div
                key={k.chart_id}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-2 dark:border-slate-800 dark:bg-slate-900"
                title={spec.provenance?.rationale ?? undefined}
              >
                <p className="truncate text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {spec.title}
                </p>
                {unavailable ? (
                  <>
                    <p className="text-base font-semibold text-slate-400 dark:text-slate-500">—</p>
                    <p className="truncate text-xs text-slate-400 dark:text-slate-500" title={spec.unavailable_reason ?? undefined}>
                      {spec.unavailable_reason ?? 'Not available yet'}
                    </p>
                  </>
                ) : !tile || tile.status === 'running' ? (
                  <div className="mt-1 h-5 w-16 animate-pulse rounded bg-slate-100 dark:bg-slate-800" aria-hidden />
                ) : tile.status === 'error' ? (
                  <p className="text-xs text-red-600 dark:text-red-400" title={tile.error}>
                    {tile.error}
                  </p>
                ) : (
                  <p className="text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                    {fmtVal(tile.result.rows?.[0]?.[0])}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* charts — bounded height, internal scroll if many */}
      {charts.length > 0 && (
        <div className="grid max-h-[30rem] grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2" aria-label="Charts">
          {charts.map((c) => {
            const spec = specs[c.chart_id] ?? c;
            const tile = tiles[c.chart_id];
            const unavailable = spec.status === 'unavailable';
            const agg = (spec.measures[0]?.aggregator ?? 'SUM').toUpperCase();
            const aggOptions = AGGREGATORS.includes(agg) ? AGGREGATORS : [agg, ...AGGREGATORS];
            const grain = spec.time?.grain ?? '';
            const grainOptions = grain && !GRAINS.includes(grain) ? [grain, ...GRAINS] : GRAINS;
            return (
              <div key={c.chart_id} className="rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className="min-w-0 truncate text-xs font-medium text-slate-800 dark:text-slate-200"
                    title={spec.provenance?.rationale ?? spec.title}
                  >
                    {spec.title}
                  </p>
                  {!unavailable && (
                    <div className="flex shrink-0 items-center gap-1">
                      {spec.measures.length > 0 && (
                        <select
                          aria-label={`Aggregation for ${spec.title}`}
                          value={agg}
                          onChange={(e) => void editChart(c.chart_id, { aggregator: e.target.value })}
                          className="h-6 rounded border border-slate-200 bg-white px-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        >
                          {aggOptions.map((a) => (
                            <option key={a} value={a}>{a}</option>
                          ))}
                        </select>
                      )}
                      {spec.time && (
                        <select
                          aria-label={`Time grain for ${spec.title}`}
                          value={grain}
                          onChange={(e) => void editChart(c.chart_id, { grain: e.target.value })}
                          className="h-6 rounded border border-slate-200 bg-white px-1 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        >
                          {/* A chart with a time axis but no declared grain
                              has value "" — which matches no option, so the
                              control rendered blank on a spec that is
                              perfectly valid. Name the state instead. */}
                          {grain === '' && <option value="">grain…</option>}
                          {grainOptions.map((g) => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
                <div className="mt-1.5 h-56">
                  {unavailable ? (
                    <p className="pt-4 text-center text-xs text-slate-400 dark:text-slate-500">
                      — {spec.unavailable_reason ?? 'Not available yet'}
                    </p>
                  ) : !tile || tile.status === 'running' ? (
                    <div className="h-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" aria-hidden />
                  ) : tile.status === 'error' ? (
                    <p role="alert" className="pt-4 text-center text-xs text-red-600 dark:text-red-400">
                      {tile.error}
                    </p>
                  ) : (
                    <DynamicChart
                      config={{
                        chartType: spec.chart_type === 'kpi_card' || spec.chart_type === 'table' ? 'bar' : spec.chart_type,
                        x: tile.result.columns?.[0] ?? null,
                        prefetched: { data: toChartData(tile.result) },
                      }}
                    />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* detail table — bounded, scrolls internally */}
      {detail && detail.status !== 'unavailable' && (
        <section aria-label="Detail rows">
          {!detailTile || detailTile.status === 'running' ? (
            <div className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/60" aria-hidden />
          ) : detailTile.status === 'error' ? (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">{detailTile.error}</p>
          ) : (
            <div className="max-h-56 overflow-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="min-w-full bg-white text-xs dark:bg-slate-900">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
                  <tr>
                    {detailTile.result.columns.map((col) => (
                      <th key={col} scope="col" className="whitespace-nowrap px-2 py-1 text-left font-medium text-slate-500 dark:text-slate-400">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {detailTile.result.rows.slice(0, 100).map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} className="whitespace-nowrap px-2 py-1 tabular-nums text-slate-700 dark:text-slate-300">
                          {fmtVal(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* K3 — one sentence, previewed diff, applied only on approval */}
      {(draft.preview.reportDraftId ?? draft.draftId) && (
        <RefineChat
          draftId={(draft.preview.reportDraftId ?? draft.draftId) as string}
          onApplied={handleRefineApplied}
        />
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          onClick={onNext}
          className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700"
        >
          Looks good — see automations
        </button>
        {onBack && <QuietAction label="Back to understanding" onClick={onBack} />}
      </div>
    </div>
    {atelierDraftId && (
      <AtelierRails
        draftId={atelierDraftId}
        report={report}
        onApplied={handleRefineApplied}
      />
    )}
    </div>
  );
}
