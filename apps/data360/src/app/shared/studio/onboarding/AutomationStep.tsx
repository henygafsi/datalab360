'use client';

/**
 * AutomationStep — "Should anything run on its own?" (journey step 5,
 * optional). Candidates are proposed from the report the user actually
 * built (POST /studio/automation/propose on the backend draft) and shown
 * SEQUENCE-FIRST: one readable line of chips (trigger → condition →
 * action → destination) before any graph; the flow view is an opt-in
 * <details> rendering the backend graph read-only in React Flow.
 *
 * Decisions are never pre-answered: a condition with requires_decision
 * ships threshold:null and Simulate stays disabled until the user types
 * one. Simulation is side-effect free (dry-run + live evaluation, nothing
 * sent, 0 credits) and says so. "Keep this automation" persists the
 * selection on the backend draft via writeSelectedAutomations.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import nextDynamic from 'next/dynamic';
import { FileSearch, RotateCw, Zap } from 'lucide-react';
import 'reactflow/dist/style.css';
import { PlainQuestionHeader, QuietAction } from '@/app/shared/studio/PlainKit';
import EmptyState from '@/components/ui/EmptyState';
import {
  proposeAutomations,
  simulateAutomation,
  writeSelectedAutomations,
  type AutomationCandidate,
  type AutomationGraph,
  type AutomationSimulateResponse,
} from '@/app/services/studio/automation';
import { isAdminRole } from '@/config/constants';
import { useAuth } from '@/hooks/useAuth';
import type { JourneyDraft } from './journey';

const FREQUENCIES = ['hourly', 'daily', 'weekly', 'monthly'] as const;

function fmtBytes(n?: number | null): string {
  if (n == null) return '—';
  if (n < 1024 ** 2) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

/* ── read-only flow view (reactflow, client-only, loaded on open) ──── */

const FlowView = nextDynamic<{ graph: AutomationGraph }>(
  async () => {
    const mod = await import('reactflow');
    const ReactFlow = mod.default;
    const { Background, Handle, Position } = mod;

    function PlainFlowNode({ data }: { data: { label?: string; kind?: string } }) {
      return (
        <div className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-left dark:border-slate-600 dark:bg-slate-900">
          <Handle type="target" position={Position.Left} style={{ width: 6, height: 6 }} isConnectable={false} />
          <p className="text-xs font-medium leading-tight text-slate-800 dark:text-slate-200">
            {data.label ?? '—'}
          </p>
          {data.kind ? (
            <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {data.kind}
            </p>
          ) : null}
          <Handle type="source" position={Position.Right} style={{ width: 6, height: 6 }} isConnectable={false} />
        </div>
      );
    }

    // Created once — the dynamic factory runs a single time per app load,
    // so this object is stable (React Flow warns on per-render nodeTypes).
    const nodeTypes = { plain: PlainFlowNode };

    function AutomationFlowView({ graph }: { graph: AutomationGraph }) {
      const nodes = (graph.nodes ?? []).map((n, i) => ({
        id: n.id,
        type: 'plain' as const,
        position: n.position ?? { x: 40 + i * 240, y: 120 },
        data: { label: n.label, kind: n.type },
        draggable: false,
      }));
      const edges = (graph.edges ?? []).map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        animated: false,
      }));
      return (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnDrag={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
          preventScrolling={false}
          minZoom={0.2}
          maxZoom={1.5}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} />
        </ReactFlow>
      );
    }

    return AutomationFlowView;
  },
  {
    ssr: false,
    loading: () => (
      <div className="h-full animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" aria-hidden />
    ),
  },
);

/* ── helpers ───────────────────────────────────────────────────────── */

/** '—' for unknowns, never 0 (Lite rule). */
function fmtNum(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return Number.isInteger(v)
    ? v.toLocaleString()
    : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function errMsg(e: unknown): string {
  if (e && typeof e === 'object') {
    const anyE = e as { response?: { data?: { detail?: unknown } }; message?: string };
    const detail = anyE.response?.data?.detail;
    if (typeof detail === 'string' && detail) return detail;
    if (detail && typeof detail === 'object') {
      const msg = (detail as { message?: unknown }).message;
      if (typeof msg === 'string' && msg) return msg;
    }
    if (anyE.message) return anyE.message;
  }
  return 'The automation call failed.';
}

function errCode(e: unknown): string | null {
  const detail = (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
  if (detail && typeof detail === 'object') {
    const code = (detail as { error_code?: unknown }).error_code;
    return typeof code === 'string' ? code : null;
  }
  return null;
}

/** The candidate with the user's decided threshold embedded (their decision). */
function withDecision(c: AutomationCandidate, raw: string | undefined): AutomationCandidate {
  if (!c.condition) return c;
  const n = raw != null && raw.trim() !== '' ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return c;
  return { ...c, condition: { ...c.condition, threshold: n } };
}

type Phase =
  | { kind: 'boot' }
  | { kind: 'no-draft' }
  | { kind: 'loading' }
  | { kind: 'report-required' }
  | { kind: 'ready' }
  | { kind: 'error'; message: string };

type SimState =
  | { status: 'running' }
  | { status: 'done'; result: AutomationSimulateResponse }
  | { status: 'error'; error: string };

/* ── component ─────────────────────────────────────────────────────── */

export default function AutomationStep({
  draft,
  onNext,
  onBack,
}: {
  draft: JourneyDraft;
  onPatch: (p: Partial<JourneyDraft>) => void;
  onNext: () => void;
  onBack?: () => void;
}) {
  const { role } = useAuth();
  const admin = isAdminRole(role);
  const [phase, setPhase] = useState<Phase>({ kind: 'boot' });
  const [candidates, setCandidates] = useState<AutomationCandidate[]>([]);
  const [thresholds, setThresholds] = useState<Record<string, string>>({});
  const [sims, setSims] = useState<Record<string, SimState>>({});
  const [kept, setKept] = useState<Record<string, boolean>>({});
  const [openFlows, setOpenFlows] = useState<Set<string>>(new Set());
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  // The ONLY choices the user makes (simplification rule): cadence + scope.
  const [schedule, setSchedule] = useState<
    Record<string, { frequency: string; mode: 'sample' | 'full' }>
  >({});
  // Live progression, fed by the cache-stream's automation_simulation events
  // (response steps[] as fallback).
  const [progress, setProgress] = useState<Record<string, { pct: number; step: string }>>({});

  /* real-time progression: the SSE singleton relays raw payloads on window */
  useEffect(() => {
    const onSse = (e: Event) => {
      const detail = (e as CustomEvent).detail as
        | { affected_entities?: { event?: string; automation_id?: string; step?: string; pct?: number } }
        | undefined;
      const ae = detail?.affected_entities;
      if (ae?.event !== 'automation_simulation' || !ae.automation_id) return;
      setProgress((prev) =>
        prev[ae.automation_id!]
          ? { ...prev, [ae.automation_id!]: { pct: ae.pct ?? 0, step: ae.step ?? '' } }
          : prev,
      );
    };
    window.addEventListener('d360-sse', onSse);
    return () => window.removeEventListener('d360-sse', onSse);
  }, []);

  const booted = useRef(false);
  const candidatesRef = useRef<AutomationCandidate[]>([]);
  const simsRef = useRef<Record<string, AutomationSimulateResponse>>({});
  const thresholdsRef = useRef<Record<string, string>>({});

  const load = useCallback(async (draftId: string) => {
    setPhase({ kind: 'loading' });
    try {
      const r = await proposeAutomations({ draft_id: draftId });
      const list = r.candidates ?? [];
      candidatesRef.current = list;
      setCandidates(list);
      setPhase({ kind: 'ready' });
    } catch (e) {
      if (errCode(e) === 'REPORT_REQUIRED') setPhase({ kind: 'report-required' });
      else setPhase({ kind: 'error', message: errMsg(e) });
    }
  }, []);

  useEffect(() => {
    if (booted.current) return;
    const reportDraft = draft.preview.reportDraftId ?? draft.draftId;
    if (!reportDraft) {
      setPhase({ kind: 'no-draft' });
      return;
    }
    booted.current = true;
    void load(reportDraft);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft.preview.reportDraftId, draft.draftId, load]);

  const runSimulate = useCallback(
    async (c: AutomationCandidate, sched?: { frequency: string; mode: 'sample' | 'full' }) => {
      const id = c.automation_id;
      const automation = withDecision(c, thresholdsRef.current[id]);
      setSims((prev) => ({ ...prev, [id]: { status: 'running' } }));
      setProgress((prev) => ({ ...prev, [id]: { pct: 5, step: 'start' } }));
      try {
        const result = await simulateAutomation({
          draft_id: (draft.preview.reportDraftId ?? draft.draftId) ?? undefined,
          automation,
          global_filters: [],
          frequency: sched?.frequency,
          analyze_mode: sched?.mode,
        });
        simsRef.current = { ...simsRef.current, [id]: result };
        setSims((prev) => ({ ...prev, [id]: { status: 'done', result } }));
      } catch (e) {
        setSims((prev) => ({ ...prev, [id]: { status: 'error', error: errMsg(e) } }));
      } finally {
        setProgress((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
    },
    [draft.preview.reportDraftId, draft.draftId],
  );

  const persistSelection = useCallback(
    async (nextKept: Record<string, boolean>) => {
      if (!draft.draftId) return; // no persisted draft — nothing to save onto
      setSaveState('saving');
      try {
        await writeSelectedAutomations(draft.draftId, {
          proposed: candidatesRef.current,
          simulations: simsRef.current,
          selected: candidatesRef.current
            .filter((c) => nextKept[c.automation_id])
            .map((c) => withDecision(c, thresholdsRef.current[c.automation_id])),
        });
        setSaveState('saved');
      } catch {
        setSaveState('failed');
      }
    },
    [draft.preview.reportDraftId, draft.draftId],
  );

  const toggleKeep = useCallback(
    (id: string) => {
      setKept((prev) => {
        const next = { ...prev, [id]: !prev[id] };
        void persistSelection(next);
        return next;
      });
    },
    [persistSelection],
  );

  const keptCount = useMemo(() => Object.values(kept).filter(Boolean).length, [kept]);

  const header = (
    <PlainQuestionHeader
      question="Should anything run on its own?"
      detail="Optional — a simple report needs none of this. Proposed from the report you actually built."
    />
  );

  const continueRow = (
    <div className="flex items-center gap-3 pt-1">
      <button
        type="button"
        onClick={onNext}
        className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700"
      >
        Continue
      </button>
      {onBack && <QuietAction label="Back" onClick={onBack} />}
    </div>
  );

  /* honest legs first */

  if (phase.kind === 'no-draft') {
    return (
      <div className="space-y-4">
        {header}
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
          This journey&apos;s draft was not persisted, so nothing can be proposed or saved here.
          The step is optional — you can continue.
        </p>
        {continueRow}
      </div>
    );
  }

  if (phase.kind === 'boot' || phase.kind === 'loading') {
    return (
      <div className="space-y-3">
        {header}
        <div className="space-y-2" aria-hidden>
          {[0, 1].map((i) => (
            <div
              key={i}
              className="h-24 animate-pulse rounded-xl border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/60"
            />
          ))}
        </div>
      </div>
    );
  }

  if (phase.kind === 'report-required') {
    return (
      <div className="space-y-4">
        {header}
        <EmptyState
          compact
          icon={FileSearch}
          title="Generate the report first"
          description="Automations are proposed from the report you actually built — run the preview step first."
          action={
            onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700"
              >
                Back to preview
              </button>
            ) : undefined
          }
        />
        {continueRow}
      </div>
    );
  }

  if (phase.kind === 'error') {
    return (
      <div className="space-y-3">
        {header}
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {phase.message}
        </p>
        <div className="flex items-center gap-3">
          <QuietAction
            label="Retry"
            icon={RotateCw}
            onClick={() => draft.draftId && void load(draft.draftId)}
          />
        </div>
        {continueRow}
      </div>
    );
  }

  if (candidates.length === 0) {
    return (
      <div className="space-y-4">
        {header}
        <EmptyState
          compact
          icon={Zap}
          title="Nothing needs to run on its own"
          description="No automation was proposed from this report. You can continue — the step is optional."
        />
        {continueRow}
      </div>
    );
  }

  /* ── candidates, sequence-first, one bounded page ──────────────── */

  return (
    <div className="space-y-3">
      {header}

      <div className="max-h-[34rem] space-y-2 overflow-y-auto pr-0.5">
        {candidates.map((c) => {
          const id = c.automation_id;
          const cond = c.condition ?? null;
          const rawThreshold = thresholds[id] ?? '';
          const decided = Number.isFinite(Number(rawThreshold)) && rawThreshold.trim() !== '';
          const needsDecision = Boolean(cond?.requires_decision);
          const sim = sims[id];
          const isKept = Boolean(kept[id]);
          const graph = c.graph;
          const hasGraph = (graph?.nodes?.length ?? 0) > 0;

          return (
            <div
              key={id}
              className={`rounded-xl border bg-white p-3 dark:bg-slate-950 ${
                isKept
                  ? 'border-accent-500 ring-1 ring-accent-500'
                  : 'border-slate-200 dark:border-slate-800'
              }`}
            >
              {/* title · kind · keep */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p
                    className="truncate text-xs font-medium text-slate-900 dark:text-slate-100"
                    title={c.rationale ?? c.title}
                  >
                    {c.title}
                  </p>
                  {c.kind && (
                    <p className="text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      {c.kind}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  aria-pressed={isKept}
                  onClick={() => toggleKeep(id)}
                  className={`shrink-0 rounded-md border px-2 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                    isKept
                      ? 'border-accent-600 bg-accent-600 text-white hover:bg-accent-700'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600'
                  }`}
                >
                  {isKept ? 'Kept' : 'Keep this automation'}
                </button>
              </div>

              {/* the readable sequence — before any graph */}
              <div
                className="mt-2 flex flex-wrap items-center gap-1 text-xs"
                aria-label="Automation sequence"
              >
                {(() => {
                  const chips: Array<{ key: string; text: string; title?: string; toDecide?: boolean }> = [];
                  chips.push({
                    key: 'trigger',
                    text: c.trigger?.cron_choice
                      ? `runs ${c.trigger.cron_choice}`
                      : (c.trigger?.type ?? 'trigger'),
                    title: c.trigger?.cron ?? c.trigger?.note,
                  });
                  if (cond) {
                    const shown = decided ? Number(rawThreshold) : cond.threshold;
                    chips.push({
                      key: 'condition',
                      text: `${cond.measure ?? 'value'} ${cond.operator ?? ''} ${shown != null ? fmtNum(shown) : '?'}`.trim(),
                      title: needsDecision ? 'The threshold is your decision — never inferred.' : undefined,
                      toDecide: needsDecision && shown == null,
                    });
                  }
                  for (const s of c.steps ?? []) {
                    chips.push({ key: s.step_id, text: s.label ?? s.block_type, title: s.capability });
                  }
                  return chips.map((chip, i) => (
                    <span key={chip.key} className="flex items-center gap-1">
                      {i > 0 && (
                        <span aria-hidden className="text-slate-300 dark:text-slate-600">
                          →
                        </span>
                      )}
                      <span
                        title={chip.title}
                        className={`rounded-full border px-2 py-0.5 ${
                          chip.toDecide
                            ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
                            : 'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'
                        }`}
                      >
                        {chip.text}
                      </span>
                    </span>
                  ));
                })()}
              </div>

              {/* test destination + greyed not-integrated channels */}
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                {(c.destinations ?? []).map((d, i) => (
                  <span key={`d-${i}`} title={d.route}>
                    Destination (test): {d.test_destination ?? d.destination_kind ?? '—'}
                  </span>
                ))}
                {(c.not_available ?? []).map((na, i) => (
                  <span
                    key={`na-${i}`}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-slate-400 opacity-70 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500"
                    title={`${na.capability ?? na.label ?? ''} — not integrated on this account`}
                  >
                    {na.label ?? na.capability ?? '—'} — {(na.status ?? 'not_integrated').replace(/_/g, ' ')}
                  </span>
                ))}
              </div>

              {/* the user's decision — required before Simulate */}
              {needsDecision && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                  <label htmlFor={`threshold-${id}`}>
                    Threshold — your decision ({cond?.measure ?? 'value'} {cond?.operator ?? ''}):
                  </label>
                  <input
                    id={`threshold-${id}`}
                    type="number"
                    inputMode="decimal"
                    value={rawThreshold}
                    placeholder="—"
                    onChange={(e) => {
                      thresholdsRef.current = { ...thresholdsRef.current, [id]: e.target.value };
                      setThresholds((prev) => ({ ...prev, [id]: e.target.value }));
                    }}
                    className="h-6 w-28 rounded border border-slate-200 bg-white px-1.5 text-xs tabular-nums text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  />
                  {!decided && (
                    <span className="text-xs text-slate-400 dark:text-slate-500">
                      Enter a value to simulate — it is never inferred for you.
                    </span>
                  )}
                </div>
              )}

              {/* cadence + scope — the ONLY choices to make, then one click */}
              {(() => {
                const sched = schedule[id] ?? { frequency: 'daily', mode: 'sample' as const };
                const prog = progress[id];
                return (
                  <div className="mt-2 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-slate-400 dark:text-slate-500">How often</span>
                      {FREQUENCIES.map((f) => (
                        <button
                          key={f}
                          type="button"
                          aria-pressed={sched.frequency === f}
                          onClick={() => setSchedule((p) => ({ ...p, [id]: { ...sched, frequency: f } }))}
                          className={`rounded-full border px-2 py-0.5 text-xs ${
                            sched.frequency === f
                              ? 'border-accent-500 bg-accent-600 text-white'
                              : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                          }`}
                        >
                          {f}
                        </button>
                      ))}
                      <span className="ml-2 text-slate-400 dark:text-slate-500">On</span>
                      <button
                        type="button"
                        aria-pressed={sched.mode === 'sample'}
                        onClick={() => setSchedule((p) => ({ ...p, [id]: { ...sched, mode: 'sample' } }))}
                        className={`rounded-full border px-2 py-0.5 text-xs ${
                          sched.mode === 'sample'
                            ? 'border-accent-500 bg-accent-600 text-white'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                        }`}
                      >
                        a sample
                      </button>
                      <button
                        type="button"
                        aria-pressed={sched.mode === 'full'}
                        disabled={!admin}
                        title={admin ? undefined : 'Analyzing all rows is an account-admin decision.'}
                        onClick={() => setSchedule((p) => ({ ...p, [id]: { ...sched, mode: 'full' } }))}
                        className={`rounded-full border px-2 py-0.5 text-xs disabled:cursor-not-allowed disabled:opacity-50 ${
                          sched.mode === 'full'
                            ? 'border-accent-500 bg-accent-600 text-white'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                        }`}
                      >
                        all rows{admin ? '' : ' (admin)'}
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={sim?.status === 'running' || (needsDecision && !decided)}
                        onClick={() => void runSimulate(c, sched)}
                        className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:border-slate-300 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600"
                      >
                        {sim?.status === 'running' ? 'Predicting…' : 'Predict cost & simulate'}
                      </button>
                      {prog && (
                        <span className="flex min-w-0 flex-1 items-center gap-1.5">
                          <span
                            className="h-1.5 max-w-[160px] flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                            role="progressbar"
                            aria-valuenow={prog.pct}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <span
                              className="block h-full rounded-full bg-accent-500 transition-all duration-500"
                              style={{ width: `${prog.pct}%` }}
                            />
                          </span>
                          <span className="shrink-0 text-xs tabular-nums text-slate-400 dark:text-slate-500">
                            {prog.step} {prog.pct}%
                          </span>
                        </span>
                      )}
                    </div>
                  </div>
                );
              })()}

              {sim?.status === 'error' && (
                <p role="alert" className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                  {sim.error}
                </p>
              )}

              {sim?.status === 'done' &&
                (() => {
                  const r = sim.result;
                  const dr = r.dry_run;
                  const ev = r.evaluation;
                  const se = r.side_effects;
                  const clean = !se?.scheduled && !se?.written && !se?.notified;
                  const pr = r.per_run;
                  const pp = r.per_period;
                  return (
                    <div className="mt-2 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-2 text-xs dark:border-slate-800 dark:bg-slate-900">
                      {/* cost prediction — EXPLAIN estimate, never a money amount */}
                      {pr?.estimate?.state === 'estimated' && (
                        <p className="text-slate-700 dark:text-slate-200">
                          <span className="font-medium">
                            ≈ {fmtBytes(pr.estimate.bytes_assigned)} read / run
                          </span>
                          {pp?.runs_per_month != null && (
                            <>
                              {' '}× {pp.runs_per_month} run(s)/month ({pp.frequency ?? '—'}) ≈{' '}
                              <span className="font-medium">
                                {fmtBytes(pp.bytes_assigned_per_month)}/month
                              </span>
                            </>
                          )}
                          {r.gate?.activation_required && (
                            <span className="ml-1.5 rounded-full bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                              needs activation
                            </span>
                          )}
                        </p>
                      )}
                      {pr?.estimate?.note && (
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {pr.estimate.note}
                        </p>
                      )}
                      {pr?.estimate?.state === 'unavailable' && (
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          No cost estimate is available for this run — nothing is guessed.
                        </p>
                      )}
                      <p className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300">
                        <span
                          aria-hidden
                          className={`h-1.5 w-1.5 shrink-0 rounded-full ${dr?.valid ? 'bg-emerald-500' : 'bg-amber-500'}`}
                        />
                        Dry run {dr?.valid ? 'valid' : 'has warnings'} · {dr?.planned_steps ?? '—'}{' '}
                        planned steps
                      </p>
                      {(dr?.warnings ?? []).map((w, i) => (
                        <p key={i} className="text-amber-700 dark:text-amber-400">
                          {w.message ?? '—'}
                        </p>
                      ))}
                      {ev && (
                        <p className="tabular-nums text-slate-700 dark:text-slate-300">
                          {ev.status === 'threshold_undecided'
                            ? 'Threshold undecided — enter a value above to evaluate.'
                            : `value ${fmtNum(ev.value)} vs threshold ${fmtNum(ev.threshold)} → ${
                                ev.would_fire ? 'would fire' : 'would not fire'
                              }`}
                        </p>
                      )}
                      {(r.destinations ?? []).length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {(r.destinations ?? []).map((d, i) => (
                            <span
                              key={i}
                              title={d.test_target}
                              className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400"
                            >
                              {d.kind ?? d.capability ?? 'destination'} · {d.status ?? 'simulated'} ·{' '}
                              {d.sent ? 'sent' : 'not sent'}
                            </span>
                          ))}
                        </div>
                      )}
                      <p className="text-slate-500 dark:text-slate-400">
                        {clean
                          ? `No side effects — nothing was sent. ${r.credits_charged ?? 0} credits.`
                          : 'The backend reported side effects — check before keeping this automation.'}
                      </p>
                    </div>
                  );
                })()}

              {/* graph — opt-in, read-only (the forms above edit; the flow shows) */}
              {hasGraph && (
                <details
                  className="mt-2"
                  onToggle={(e) => {
                    const open = (e.target as HTMLDetailsElement).open;
                    setOpenFlows((prev) => {
                      const next = new Set(prev);
                      if (open) next.add(id);
                      else next.delete(id);
                      return next;
                    });
                  }}
                >
                  <summary className="cursor-pointer list-none text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                    View as flow
                  </summary>
                  <div className="mt-1.5 h-44 overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
                    {openFlows.has(id) && graph ? <FlowView graph={graph} /> : null}
                  </div>
                </details>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500" aria-live="polite">
        {saveState === 'saving'
          ? 'Saving selection…'
          : saveState === 'saved'
            ? `Selection saved to the draft — ${keptCount} kept.`
            : saveState === 'failed'
              ? 'Selection could not be saved — toggle again to retry.'
              : keptCount > 0
                ? `${keptCount} kept.`
                : 'Keep none — this step is optional.'}
      </p>

      {continueRow}
    </div>
  );
}
