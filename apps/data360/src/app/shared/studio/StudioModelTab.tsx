'use client';

/**
 * StudioModelTab — the Model view of one application.
 *
 * Default = the TARGET model (what the application builds). An explicit
 * toggle switches to the source→target MAPPING; sources never mix with
 * targets unexplained. The inspector opens ONLY on selection and closes
 * with it. No repeated relations card under the canvas — the graph and
 * the inspector carry that truth.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getTargetsView,
  proposeTargets,
  type StudioDataSource,
  type StudioModelView as ModelPayload,
  type StudioReportSpec,
  type TargetsView,
} from '@/app/services/studio/studio-api';
import { getStudioSummary, type ModelSummary } from '@/app/services/studio/summary';
import StudioModelCanvas from '@/app/shared/studio/StudioModelCanvas';
import StudioModelCompletion from '@/app/shared/studio/StudioModelCompletion';
import StudioModelInspector from '@/app/shared/studio/StudioModelInspector';
import StudioKpiHeader, { type Kpi } from '@/app/shared/studio/StudioKpiHeader';
import { latestRun } from '@/app/shared/studio/StudioJobEditor';
import { Boxes, GitBranch, Layers, RefreshCw, ShieldCheck, Sparkles, Table2, Target } from 'lucide-react';

/** pct → honesty-first tone (never green by default; null stays neutral). */
function pctTone(p?: number | null): Kpi['tone'] {
  if (p == null) return 'default';
  return p >= 85 ? 'good' : p >= 60 ? 'warn' : 'bad';
}

/** Build the business-KPI strip from the served model summary — null scores
 *  render as "—" (StudioKpiHeader), never an invented 0 or 100. */
function modelKpis(s: ModelSummary | null): Kpi[] {
  if (!s) return [];
  const m = s.method ?? undefined;
  return [
    { key: 'coverage', label: 'Model coverage', value: s.model_coverage_pct ?? null, unit: '%', icon: Target, tone: pctTone(s.model_coverage_pct), method: m },
    { key: 'readiness', label: 'Semantic readiness', value: s.semantic_readiness_pct ?? null, unit: '%', icon: ShieldCheck, tone: pctTone(s.semantic_readiness_pct), method: m },
    { key: 'alignment', label: 'Business alignment', value: s.business_alignment_pct ?? null, unit: '%', icon: Sparkles, tone: pctTone(s.business_alignment_pct), method: m },
    { key: 'join', label: 'Join confidence', value: s.join_confidence_pct ?? null, unit: '%', icon: GitBranch, tone: pctTone(s.join_confidence_pct), method: m },
    { key: 'facts', label: 'Fact tables', value: s.facts ?? null, icon: Table2 },
    { key: 'dims', label: 'Conformed dimensions', value: s.dimensions ?? null, icon: Boxes },
    { key: 'entities', label: 'Business entities', value: s.entities ?? null, icon: Layers },
    { key: 'rels', label: 'Relationships', value: s.relationships ?? null, icon: GitBranch },
  ];
}

export default function StudioModelTab({
  draftId,
  model,
  report,
  data,
  onApplied,
  onAskAi,
  onOpenJob,
  onOpenAccess,
}: {
  draftId: string;
  model: ModelPayload;
  report?: StudioReportSpec | null;
  data?: Map<string, StudioDataSource> | null;
  onApplied: () => void;
  onAskAi?: (instruction: string) => void;
  onOpenJob?: (jobId: string) => void;
  onOpenAccess?: () => void;
}) {
  const [view, setView] = useState<TargetsView | 'loading' | 'error' | null>(null);
  const [mode, setMode] = useState<'target' | 'mapping' | null>(null);
  const [selection, setSelection] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<ModelSummary | null>(null);

  useEffect(() => {
    let alive = true;
    void getStudioSummary(draftId, ['model'])
      .then((r) => alive && setSummary(r.model ?? {}))
      .catch(() => alive && setSummary({}));
    return () => {
      alive = false;
    };
  }, [draftId]);

  /* Two applies in quick succession can land out of order — the older
   * answer would then overwrite the newer one and leave the panel showing
   * the pre-edit model, which reads exactly like an edit that did not
   * save. Only the most recent read is allowed to write. */
  const readGen = useRef(0);
  const load = useCallback(async () => {
    const mine = ++readGen.current;
    try {
      const next = await getTargetsView(draftId);
      if (mine === readGen.current) setView(next);
    } catch {
      if (mine === readGen.current) setView((v) => (v && typeof v === 'object' ? v : 'error'));
    }
  }, [draftId]);

  useEffect(() => {
    setView('loading');
    void load();
  }, [load]);

  const ready = view != null && typeof view === 'object' ? view : null;
  const targets = ready?.targets ?? [];
  const hasTargets = targets.length > 0;
  /* default: target model when it exists, else the mapping (sources) */
  const effMode: 'target' | 'mapping' = mode ?? (hasTargets ? 'target' : 'mapping');

  const rowsByTarget = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const j of ready?.jobs ?? []) {
      const r = latestRun(j);
      const after = r?.results?.[0]?.target_count_after;
      for (const tid of j.target_ids ?? []) m.set(tid, after ?? m.get(tid) ?? null);
    }
    return m;
  }, [ready]);

  const propose = useCallback(async () => {
    setBusy(true);
    try {
      await proposeTargets(draftId);
      await load();
      onApplied();
    } catch {
      /* the panel below keeps its honest empty state */
    } finally {
      setBusy(false);
    }
  }, [draftId, load, onApplied]);

  if (view === 'loading' || view === null)
    return <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-hidden />;

  return (
    <div className="space-y-2">
      {/* the business-KPI strip — real served figures; a score not yet
          evaluated shows "—", never an invented 0 or 100 */}
      <StudioKpiHeader kpis={modelKpis(summary)} loading={summary === null} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700" role="tablist" aria-label="Model view">
          {(
            [
              { id: 'target', label: 'Target model' },
              { id: 'mapping', label: 'Source → target mapping' },
            ] as const
          ).map((m) => (
            <button
              key={m.id}
              type="button"
              role="tab"
              aria-selected={effMode === m.id}
              onClick={() => {
                setMode(m.id);
                setSelection(null);
              }}
              className={`rounded-md px-3 py-1 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                effMode === m.id
                  ? 'bg-accent-600 font-medium text-white'
                  : 'text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {effMode === 'target'
            ? 'The tables this application builds in its own schema.'
            : 'What each source feeds — sources on the left, targets on the right.'}
        </p>
        {ready?.target_schema?.schema && (
          <span className="ml-auto font-mono text-xs text-slate-400 dark:text-slate-500">
            {ready.target_schema.database}.{ready.target_schema.schema} ·{' '}
            {ready.target_schema.environment}
          </span>
        )}
      </div>

      {ready && hasTargets && (
        <StudioModelCompletion
          draftId={draftId}
          view={ready}
          report={report as never}
          onChanged={() => {
            void load();
            onApplied();
          }}
        />
      )}

      {effMode === 'target' && !hasTargets ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center dark:border-slate-800 dark:bg-slate-900">
          <p className="text-[13px] text-slate-600 dark:text-slate-300">
            No target model yet — the AI proposes facts and dimensions from what was understood.
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={() => void propose()}
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            {busy && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
            Propose the target model
          </button>
        </div>
      ) : (
        <div className={`grid grid-cols-1 gap-3 ${selection ? 'xl:grid-cols-[1fr,460px]' : ''}`}>
          <StudioModelCanvas
            model={model}
            report={report}
            data={data}
            targets={targets}
            targetRelationships={ready?.relationships}
            rowsByTarget={rowsByTarget}
            mode={effMode}
            height={520}
            selectedEntity={selection}
            onSelectTable={(id) => setSelection((cur) => (cur === id ? null : id))}
          />
          {selection && (
            /* key = the selected table: switching tables must not carry the
             * half-filled relation form over. It used to — the "from column"
             * still held the PREVIOUS table's column, the select rendered
             * blank because that column is not in the new table's options,
             * and Declare stayed enabled, writing a relation from a column
             * that does not exist. A remount is the honest reset. */
            <StudioModelInspector
              key={selection}
              draftId={draftId}
              model={model}
              view={ready}
              selection={selection}
              onClose={() => setSelection(null)}
              onApplied={() => {
                void load();
                onApplied();
              }}
              onAskAi={onAskAi}
              onOpenJob={onOpenJob}
              onOpenAccess={onOpenAccess}
            />
          )}
        </div>
      )}

      {effMode === 'target' && targets.length > 1 && (
        <p className="text-xs text-slate-400 dark:text-slate-500">
          {(ready?.relationships?.length ?? 0) === 0
            ? "No relation between targets is declared yet — declare one from a table's panel."
            : `${ready!.relationships!.length} relation(s) between these tables — open a table to read and edit them.`}
        </p>
      )}
    </div>
  );
}
