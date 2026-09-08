'use client';

/**
 * AtelierRails — the editable Widgets/Filters palette beside the generated
 * report. Prefilled from the spec, click-to-edit, and every commit goes
 * through the K3 structured-patch contract: preview (apply:false) first,
 * apply (apply:true) only when validation passes — never a silent local
 * mutation, and nothing is applied on a failed preview.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AreaChart as AreaChartIcon,
  BarChart3,
  BarChart4,
  BarChartHorizontal,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  Donut,
  Filter,
  Gauge,
  Grid3x3,
  LayoutGrid,
  Layers,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Plus,
  Radar,
  ScatterChart,
  Table as TableIcon,
  TrendingUp,
  X,
} from 'lucide-react';
import {
  getChartTypes,
  getTargetsView,
  patchModel,
  type ChartTypeOption,
  type ModelPatchOp,
  type ModelPatchResult,
  type StudioChartSpec,
  type StudioReportSpec,
} from '@/app/services/studio/studio-api';
import {
  AiProposalCard,
  AskAiButton,
  useAiProposal,
} from '@/app/shared/studio/StudioAiProposal';

/** Icon + label per visual. WHICH ones are usable is NOT decided here —
 *  the contract answers that per widget composition (getChartTypes), so a
 *  greyed shape always carries the backend's own reason. */
export const CHART_TYPES: Array<{ id: string; label: string; Icon: typeof BarChart3 }> = [
  { id: 'bar', label: 'Bar', Icon: BarChart3 },
  { id: 'line', label: 'Line', Icon: LineChartIcon },
  { id: 'area', label: 'Area', Icon: AreaChartIcon },
  { id: 'pie', label: 'Pie', Icon: PieChartIcon },
  { id: 'donut', label: 'Donut', Icon: Donut },
  { id: 'table', label: 'Table', Icon: TableIcon },
  { id: 'scatter', label: 'Scatter', Icon: ScatterChart },
  { id: 'stacked_bar', label: 'Stacked bar', Icon: BarChart4 },
  { id: 'stacked_area', label: 'Stacked area', Icon: Layers },
  { id: 'combo', label: 'Bars + line', Icon: ChartNoAxesCombined },
  { id: 'bubble', label: 'Bubble', Icon: Circle },
  { id: 'histogram', label: 'Histogram', Icon: BarChartHorizontal },
  { id: 'heatmap', label: 'Heatmap', Icon: Grid3x3 },
  { id: 'radar', label: 'Radar', Icon: Radar },
  { id: 'treemap', label: 'Treemap', Icon: LayoutGrid },
  { id: 'funnel', label: 'Funnel', Icon: Filter },
  { id: 'waterfall', label: 'Waterfall', Icon: TrendingUp },
  { id: 'gauge', label: 'Gauge', Icon: Gauge },
  { id: 'radial_bar', label: 'Radial', Icon: CircleDot },
];

const ALL_CHART_TYPES = CHART_TYPES.map((t) => t.id);

const AGGREGATORS = ['SUM', 'COUNT', 'AVG', 'MIN', 'MAX', 'COUNT_DISTINCT'];

function errMsg(e: unknown): string {
  if (e && typeof e === 'object') {
    const anyE = e as { response?: { data?: { detail?: unknown } }; message?: string };
    const detail = anyE.response?.data?.detail;
    if (typeof detail === 'string' && detail) return detail;
    if (detail && typeof detail === 'object') {
      const d = detail as { message?: string; error_code?: string };
      if (d.message) return d.message;
      if (d.error_code) return d.error_code;
    }
    if (anyE.message) return anyE.message;
  }
  return 'The change could not be applied.';
}

/** A validation error may be a structured object — flatten before JSX. */
function asText(v: unknown): string {
  if (v == null) return 'Not valid for this data — nothing was applied.';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    const o = v as { message?: string; error_code?: string };
    return o.message ?? o.error_code ?? JSON.stringify(v).slice(0, 200);
  }
  return String(v);
}

function isSpec(x: unknown): x is StudioChartSpec {
  return typeof x === 'object' && x !== null && 'chart_id' in x;
}

type EditableField = 'title' | 'chart_type' | 'limit' | 'measures' | 'dimensions';

type RowState = { busy?: boolean; error?: string | null };

export default function AtelierRails({
  draftId,
  report,
  onApplied,
  knownColumns = [],
  focusWidgetId,
  onFocusConsumed,
  onAddWidget,
}: {
  draftId: string;
  report: StudioReportSpec;
  /** Called with the APPLY result — the parent folds the diff into its
   *  local report and re-runs the touched tiles. */
  onApplied: (result: ModelPatchResult) => void;
  /** Column names the model demonstrably knows (grain keys, time fields,
   *  spec columns) — datalist suggestions; free text stays allowed and the
   *  backend validation is the judge (UNKNOWN_COLUMN renders as-is). */
  knownColumns?: string[];
  /** A tile click in the report focuses ITS editor here. */
  focusWidgetId?: string | null;
  onFocusConsumed?: () => void;
  /** The « + » in the palette header — opens the composer in the grid. */
  onAddWidget?: () => void;
}) {
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
  /* per-widget measures/columns editor (open one at a time) */
  const [openEditor, setOpenEditor] = useState<string | null>(null);
  const [newMeasure, setNewMeasure] = useState<{ col: string; agg: string }>({ col: '', agg: 'SUM' });
  const [newDim, setNewDim] = useState('');
  /* a need written in the user's own words — the AI answers with a change
   * to approve; no formula, no path, no JSON asked of anyone */
  const [calc, setCalc] = useState<{ id: string; text: string } | null>(null);
  /** which widget has the chart-type palette open — one at a time */
  const [openTypeFor, setOpenTypeFor] = useState<string | null>(null);
  /** Per-shape verdicts, TAGGED with the widget they were fetched for.
   *  Untagged, the record survived the palette closing: opening widget B
   *  showed widget A's verdicts — a legal shape greyed out, carrying A's
   *  blocked reason — and a slow answer for A could overwrite B's for good. */
  const [chartTypeInfo, setChartTypeInfo] = useState<{
    forChart: string;
    opts: Record<string, ChartTypeOption>;
  } | null>(null);
  const openTypeRef = useRef<string | null>(null);
  const ai = useAiProposal(draftId);
  /* the volume the change lands on — read once, from the LAST REAL RUN */
  const [volumeNote, setVolumeNote] = useState<string | null>(null);

  /* a tile click focuses that widget's editor and scrolls it into view */
  useEffect(() => {
    if (!focusWidgetId) return;
    setOpenEditor(focusWidgetId);
    document
      .getElementById(`rail-w-${focusWidgetId}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    onFocusConsumed?.();
  }, [focusWidgetId, onFocusConsumed]);

  /* The "add a measure" and "add a column" pickers belong to whichever
   * widget's editor is open. They used to survive it closing: choosing
   * AMOUNT in widget A, collapsing it and opening widget B offered A's
   * column already selected, with the + enabled — one click away from
   * committing a column from another dataset onto B. */
  useEffect(() => {
    setNewMeasure({ col: '', agg: 'SUM' });
    setNewDim('');
  }, [openEditor]);
  // Escape ⇒ the blur that follows must NOT commit.
  const cancelRef = useRef(false);

  const widgets = [...(report.kpis ?? []), ...(report.charts ?? [])].filter(isSpec);

  const setRow = useCallback((id: string, s: RowState) => {
    setRows((prev) => ({ ...prev, [id]: s }));
  }, []);

  /** JSON-pointer into the draft report — kpis first, charts otherwise. */
  const pathFor = useCallback(
    (chartId: string, field: EditableField): string | null => {
      const ki = (report.kpis ?? []).findIndex((x) => isSpec(x) && x.chart_id === chartId);
      if (ki >= 0) return `/report/kpis/${ki}/${field}`;
      const ci = (report.charts ?? []).findIndex((x) => isSpec(x) && x.chart_id === chartId);
      if (ci >= 0) return `/report/charts/${ci}/${field}`;
      return null;
    },
    [report],
  );

  /** K3: preview apply:false → apply:true only when the backend validated. */
  const commit = useCallback(
    async (chartId: string, field: EditableField, value: unknown) => {
      const path = pathFor(chartId, field);
      if (!path) return;
      const ops: ModelPatchOp[] = [{ op: 'set', path, value }];
      setRow(chartId, { busy: true, error: null });
      try {
        const preview = await patchModel(draftId, ops, false, 'atelier edit');
        if (preview.can_apply === false || preview.validation?.ok === false) {
          setRow(chartId, {
            busy: false,
            error: asText(
              preview.validation?.results?.find((r) => r.status === 'invalid')?.error,
            ),
          });
          return;
        }
        const applied = await patchModel(draftId, preview.ops ?? ops, true, 'atelier edit');
        setRow(chartId, { busy: false, error: null });
        onApplied(applied);
      } catch (e) {
        setRow(chartId, { busy: false, error: errMsg(e) });
      }
    },
    [draftId, onApplied, pathFor, setRow],
  );

  const commitTitle = useCallback(
    (spec: StudioChartSpec, raw: string) => {
      setEditing(null);
      const value = raw.trim();
      if (!value || value === spec.title) return;
      void commit(spec.chart_id, 'title', value);
    },
    [commit],
  );

  const commitLimit = useCallback(
    (spec: StudioChartSpec, raw: string) => {
      const n = Number(raw);
      if (raw.trim() === '' || !Number.isFinite(n)) return;
      if (n === (spec.limit ?? null)) return;
      void commit(spec.chart_id, 'limit', n);
    },
    [commit],
  );

  /** The application's own truth, handed to the AI with the sentence:
   *  its target tables, their real columns and the volume they hold. */
  const askAi = useCallback(
    async (spec: StudioChartSpec, phrase: string) => {
      let context =
        `Application report "${report.title ?? ''}". ` +
        `The user is looking at the widget "${spec.title}"` +
        (spec.dataset
          ? ` which reads ${spec.dataset.database}.${spec.dataset.schema}.${spec.dataset.table}`
          : '') +
        `, measuring ${JSON.stringify(spec.measures ?? [])}.`;
      let updatedAt: string | undefined;
      try {
        const view = await getTargetsView(draftId);
        updatedAt = view.updated_at;
        /* the table the widget READS comes first — it is the one the answer
         * must use; the others follow while there is room */
        const dsTable = spec.dataset?.table?.toUpperCase() ?? '';
        const ordered = [...view.targets].sort((a, b) => {
          const am = (a.target_fqn ?? a.name ?? '').toUpperCase().endsWith(dsTable) ? 0 : 1;
          const bm = (b.target_fqn ?? b.name ?? '').toUpperCase().endsWith(dsTable) ? 0 : 1;
          return am - bm;
        });
        const tables = ordered
          .map(
            (t) =>
              `${t.name} (${t.state ?? 'proposed'}): ` +
              (t.columns ?? [])
                .map((c) => `${c.name} ${c.type ?? ''}${c.expression ? ' [derived]' : ''}`)
                .join(', '),
          )
          .join('\n');
        if (tables) context += `\nThe application builds these tables:\n${tables}`;
        const rows = view.jobs
          .flatMap((j) => j.runs ?? [])
          .reduce<number | null>((best, r) => r.results?.[0]?.target_count_after ?? best, null);
        setVolumeNote(rows != null ? `runs on ${rows.toLocaleString()} rows (last load)` : null);
      } catch {
        /* the sentence still goes through — the AI answers with less context */
      }
      await ai.propose(phrase, context, updatedAt);
    },
    [ai, draftId, report.title],
  );

  return (
    <aside className="space-y-3" aria-label="Report palette">
      <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Widgets
          </p>
          {onAddWidget && (
            <button
              type="button"
              onClick={onAddWidget}
              title="Add a widget"
              aria-label="Add a widget"
              className="rounded-lg p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              <Plus aria-hidden className="h-4 w-4" />
            </button>
          )}
        </div>
        {widgets.length === 0 ? (
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">—</p>
        ) : (
          <ul className="mt-1.5 space-y-1.5">
            {widgets.map((w) => {
              const row = rows[w.chart_id] ?? {};
              const busy = row.busy === true;
              const isChart = w.kind !== 'kpi' && w.chart_type !== 'kpi_card';
              return (
                <li
                  key={w.chart_id}
                  id={`rail-w-${w.chart_id}`}
                  className={`rounded-md px-1 py-0.5 ${openEditor === w.chart_id ? 'bg-accent-50/60 ring-1 ring-accent-300 dark:bg-accent-900/15 dark:ring-accent-800' : ''} ${busy ? 'opacity-60' : ''}`}
                >
                  {editing && editing.id === w.chart_id ? (
                    <input
                      autoFocus
                      value={editing.value}
                      disabled={busy}
                      aria-label={`New title for ${w.title}`}
                      onChange={(e) => setEditing({ id: w.chart_id, value: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur();
                        if (e.key === 'Escape') {
                          cancelRef.current = true;
                          e.currentTarget.blur();
                        }
                      }}
                      onBlur={(e) => {
                        if (cancelRef.current) {
                          cancelRef.current = false;
                          setEditing(null);
                          return;
                        }
                        commitTitle(w, e.currentTarget.value);
                      }}
                      className="h-7 w-full rounded-lg border border-slate-200 bg-white px-1.5 text-[13px] text-slate-700 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => setEditing({ id: w.chart_id, value: w.title })}
                      title="Click to rename"
                      className="block w-full truncate text-left text-[13px] font-medium text-slate-700 hover:text-accent-700 dark:text-slate-300 dark:hover:text-accent-400"
                    >
                      {w.title}
                    </button>
                  )}
                  {isChart && (
                    <div className="mt-1 flex flex-wrap items-end gap-2">
                      {/* the CURRENT visual only — the full palette opens on
                          the widget being edited, once, not 19 icons per row */}
                      <div className="min-w-0 flex-1">
                        {(() => {
                          const cur =
                            CHART_TYPES.find((t) => t.id === w.chart_type) ?? CHART_TYPES[0];
                          const CurIcon = cur.Icon;
                          const open = openTypeFor === w.chart_id;
                          return (
                            <>
                              <button
                                type="button"
                                aria-expanded={open}
                                aria-label={`Chart type for ${w.title}: ${cur.label}`}
                                title={`${cur.label} — click to change`}
                                disabled={busy}
                                onClick={() => {
                                  const next = openTypeFor === w.chart_id ? null : w.chart_id;
                                  setOpenTypeFor(next);
                                  openTypeRef.current = next;
                                  setChartTypeInfo(null); // never show the last widget's verdicts
                                  if (next)
                                    void getChartTypes({
                                      measures: (w.measures ?? []).length,
                                      dimensions: (w.dimensions ?? []).length,
                                      time: w.time?.column ? 1 : 0,
                                    })
                                      .then((opts) => {
                                        // a late answer for a palette the
                                        // reader already left is discarded
                                        if (openTypeRef.current !== next) return;
                                        setChartTypeInfo({
                                          forChart: next,
                                          opts: Object.fromEntries(
                                            opts.map((o) => [o.chart_type, o]),
                                          ),
                                        });
                                      })
                                      .catch(() => undefined);
                                }}
                                className={`inline-flex items-center gap-1 rounded-lg border px-1.5 py-1 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:opacity-40 ${
                                  open
                                    ? 'border-accent-500 text-accent-700 dark:text-accent-300'
                                    : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                                }`}
                              >
                                <CurIcon aria-hidden className="h-4 w-4" />
                                {cur.label}
                              </button>
                              {open && (
                                <div
                                  role="radiogroup"
                                  aria-label={`Chart type for ${w.title}`}
                                  className="mt-1 flex flex-wrap gap-0.5 rounded-lg border border-slate-200 p-1 dark:border-slate-700"
                                >
                                  {CHART_TYPES.map(({ id, label, Icon }) => {
                                    const active = w.chart_type === id;
                                    // verdicts count only for THIS widget
                                    const opt =
                                      chartTypeInfo?.forChart === w.chart_id
                                        ? chartTypeInfo.opts[id]
                                        : undefined;
                                    const saveable = opt ? opt.accepts_current_spec !== false : true;
                                    return (
                                      <button
                                        key={id}
                                        type="button"
                                        role="radio"
                                        aria-checked={active}
                                        aria-label={label}
                                        aria-disabled={!saveable}
                                        title={
                                          saveable
                                            ? [label, opt?.draws].filter(Boolean).join(' — ')
                                            : `${label} — ${opt?.blocked_reason ?? opt?.requirement_message ?? 'not available for this widget'}`
                                        }
                                        disabled={busy || !saveable}
                                        onClick={() => {
                                          setOpenTypeFor(null);
                                          if (!active) void commit(w.chart_id, 'chart_type', id);
                                        }}
                                        className={`rounded-md p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                                          active
                                            ? 'bg-accent-600 text-white'
                                            : saveable
                                              ? 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800'
                                              : 'text-slate-300 dark:text-slate-700'
                                        }`}
                                      >
                                        <Icon aria-hidden className="h-4 w-4" />
                                      </button>
                                    );
                                  })}
                                  <span className="basis-full px-1 pt-0.5 text-xs text-slate-400 dark:text-slate-500">
                                    A dimmed shape needs a different composition — hover it for the
                                    reason.
                                  </span>
                                </div>
                              )}
                            </>
                          );
                        })()}
                        {!ALL_CHART_TYPES.includes(w.chart_type) && (
                          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                            currently: {w.chart_type}
                          </p>
                        )}
                      </div>
                      <label className="text-xs text-slate-500 dark:text-slate-400">
                        Rows
                        <input
                          // remount when the applied limit changes so defaultValue tracks the spec
                          key={`${w.chart_id}:${w.limit ?? ''}`}
                          type="number"
                          min={1}
                          max={1000}
                          defaultValue={w.limit ?? ''}
                          disabled={busy}
                          aria-label={`Row limit for ${w.title}`}
                          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                          onBlur={(e) => commitLimit(w, e.currentTarget.value)}
                          className="mt-0.5 block h-7 w-16 rounded-lg border border-slate-200 bg-white px-1.5 text-[13px] tabular-nums text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        />
                      </label>
                    </div>
                  )}
                  {/* Measures & columns — edited from the app model, every
                      commit through the same validated patch contract */}
                  <button
                    type="button"
                    disabled={busy}
                    aria-expanded={openEditor === w.chart_id}
                    onClick={() => setOpenEditor((o) => (o === w.chart_id ? null : w.chart_id))}
                    className="mt-1 inline-flex items-center gap-0.5 text-[12px] text-slate-500 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
                  >
                    {openEditor === w.chart_id ? (
                      <ChevronDown aria-hidden className="h-3 w-3" />
                    ) : (
                      <ChevronRight aria-hidden className="h-3 w-3" />
                    )}
                    Measures & columns
                  </button>
                  {openEditor === w.chart_id && (
                    <div className="mt-1 space-y-1.5 rounded-md border border-slate-100 p-1.5 dark:border-slate-800">
                      <div className="flex flex-wrap gap-1">
                        {(w.measures ?? []).map((m, mi) => (
                          <span
                            key={mi}
                            className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[12px] text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                          >
                            {m.aggregator ?? 'SUM'}({m.column})
                            <button
                              type="button"
                              disabled={busy}
                              title={
                                (w.measures ?? []).length <= 1
                                  ? 'A widget keeps at least one measure'
                                  : 'Remove this measure'
                              }
                              onClick={() => {
                                if ((w.measures ?? []).length <= 1) return;
                                void commit(
                                  w.chart_id,
                                  'measures',
                                  (w.measures ?? []).filter((_, j) => j !== mi),
                                );
                              }}
                              className="text-emerald-500 hover:text-emerald-700 disabled:opacity-40"
                            >
                              <X aria-hidden className="h-2.5 w-2.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="flex flex-wrap items-end gap-1.5">
                        <label className="text-xs text-slate-500 dark:text-slate-400">
                          Aggregate
                          <select
                            value={newMeasure.agg}
                            aria-label="Aggregator"
                            onChange={(e) => setNewMeasure((s) => ({ ...s, agg: e.target.value }))}
                            className="mt-0.5 block h-7 rounded-lg border border-slate-200 bg-white px-1.5 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                          >
                            {AGGREGATORS.map((a) => (
                              <option key={a} value={a}>
                                {a}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="min-w-0 flex-1 text-xs text-slate-500 dark:text-slate-400">
                          Of column
                          {knownColumns.length > 0 ? (
                            <select
                              value={newMeasure.col}
                              aria-label={`New measure column for ${w.title}`}
                              onChange={(e) => setNewMeasure((s) => ({ ...s, col: e.target.value }))}
                              className="mt-0.5 block h-7 w-full rounded-lg border border-slate-200 bg-white px-1.5 font-mono text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                            >
                              <option value="">column…</option>
                              {knownColumns.map((c) => (
                                <option key={c} value={c}>
                                  {c}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              value={newMeasure.col}
                              placeholder="column"
                              aria-label={`New measure column for ${w.title}`}
                              onChange={(e) => setNewMeasure((s) => ({ ...s, col: e.target.value }))}
                              className="mt-0.5 block h-7 w-full rounded-lg border border-slate-200 bg-white px-1.5 font-mono text-[13px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                            />
                          )}
                        </label>
                        <button
                          type="button"
                          disabled={busy || !newMeasure.col.trim()}
                          title="Add this measure — validated against the data before applying"
                          onClick={() => {
                            void commit(w.chart_id, 'measures', [
                              ...(w.measures ?? []),
                              { column: newMeasure.col.trim().toUpperCase(), aggregator: newMeasure.agg },
                            ]);
                            setNewMeasure((s) => ({ ...s, col: '' }));
                          }}
                          className="mb-0.5 shrink-0 rounded-lg p-1.5 text-accent-600 hover:bg-accent-50 disabled:opacity-40 dark:hover:bg-accent-900/30"
                        >
                          <Plus aria-hidden className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* a measure TYPED as a calculation — AI → SQL → also
                          recorded on the model as a derived requirement */}
                      {calc?.id === w.chart_id ? (
                        <div className="rounded-lg border border-accent-200 p-1.5 dark:border-accent-800">
                          <label className="text-xs text-slate-500 dark:text-slate-400">
                            What do you want to see?
                            <input
                              autoFocus
                              value={calc.text}
                              placeholder="tickets per day · margin by store · SUM(AMOUNT) / COUNT(*)"
                              aria-label={`Ask for a measure on ${w.title}`}
                              onChange={(e) => setCalc({ id: w.chart_id, text: e.target.value })}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && calc.text.trim())
                                  void askAi(w, calc.text.trim());
                              }}
                              className="mt-0.5 block h-7 w-full rounded-lg border border-slate-200 bg-white px-1.5 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                            />
                          </label>
                          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                            Plain words are enough — this application&apos;s tables, columns and
                            volumes are read to answer. A formula works too.
                          </p>
                          {!ai.state.result && !ai.state.busy && (
                            <div className="mt-1.5 flex items-center gap-2">
                              <button
                                type="button"
                                disabled={!calc.text.trim()}
                                onClick={() => void askAi(w, calc.text.trim())}
                                className="rounded-lg bg-accent-600 px-2.5 py-1 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40"
                              >
                                Propose it
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setCalc(null);
                                  ai.reset();
                                }}
                                className="text-[13px] text-slate-500 hover:text-slate-700 dark:text-slate-400"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                          <AiProposalCard
                            state={ai.state}
                            volumeNote={volumeNote}
                            onApply={() => {
                              void ai
                                .apply(ai.state.result!, `asked: ${calc.text.trim()}`)
                                .then((applied) => {
                                  if (applied) {
                                    setCalc(null);
                                    onApplied(applied);
                                  }
                                });
                            }}
                            onCancel={() => {
                              setCalc(null);
                              ai.reset();
                            }}
                          />
                        </div>
                      ) : (
                        <AskAiButton
                          disabled={busy}
                          label="Ask for a measure in your own words"
                          onClick={() => {
                            setCalc({ id: w.chart_id, text: '' });
                            ai.reset();
                          }}
                        />
                      )}
                      {isChart && (
                        <>
                          <div className="flex flex-wrap gap-1">
                            {(w.dimensions ?? []).map((d, di) => {
                              const name = typeof d === 'string' ? d : d.column;
                              return (
                                <span
                                  key={di}
                                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[12px] text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                                >
                                  {name}
                                  <button
                                    type="button"
                                    disabled={busy}
                                    title="Remove this column"
                                    onClick={() =>
                                      void commit(
                                        w.chart_id,
                                        'dimensions',
                                        (w.dimensions ?? []).filter((_, j) => j !== di),
                                      )
                                    }
                                    className="text-slate-400 hover:text-slate-600 disabled:opacity-40"
                                  >
                                    <X aria-hidden className="h-2.5 w-2.5" />
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                          <div className="flex items-end gap-1.5">
                            <label className="min-w-0 flex-1 text-xs text-slate-500 dark:text-slate-400">
                              Group by
                              {knownColumns.length > 0 ? (
                                <select
                                  value={newDim}
                                  aria-label={`New dimension for ${w.title}`}
                                  onChange={(e) => setNewDim(e.target.value)}
                                  className="mt-0.5 block h-7 w-full rounded-lg border border-slate-200 bg-white px-1.5 font-mono text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                >
                                  <option value="">column…</option>
                                  {knownColumns.map((c) => (
                                    <option key={c} value={c}>
                                      {c}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input
                                  value={newDim}
                                  placeholder="column"
                                  aria-label={`New dimension for ${w.title}`}
                                  onChange={(e) => setNewDim(e.target.value)}
                                  className="mt-0.5 block h-7 w-full rounded-lg border border-slate-200 bg-white px-1.5 font-mono text-[13px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                />
                              )}
                            </label>
                            <button
                              type="button"
                              disabled={busy || !newDim.trim()}
                              title="Add this column — validated against the data before applying"
                              onClick={() => {
                                void commit(w.chart_id, 'dimensions', [
                                  ...(w.dimensions ?? []),
                                  newDim.trim().toUpperCase(),
                                ]);
                                setNewDim('');
                              }}
                              className="mb-0.5 shrink-0 rounded-lg p-1.5 text-accent-600 hover:bg-accent-50 disabled:opacity-40 dark:hover:bg-accent-900/30"
                            >
                              <Plus aria-hidden className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {row.error && (
                    <p role="alert" className="mt-0.5 text-[12px] text-red-600 dark:text-red-400">
                      {row.error}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {knownColumns.length > 0 && (
          <datalist id="atelier-known-columns">
            {knownColumns.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        )}
      </section>

    </aside>
  );
}
