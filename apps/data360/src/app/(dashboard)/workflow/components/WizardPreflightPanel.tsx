'use client';

/**
 * Wizard step 8 — Pre-flight check.
 *
 * Renders the validation/test phases that need to pass BEFORE the user
 * leaves the wizard and requests deployment. Each phase is one row:
 *
 *   ✓ Catalog grounding         — purely client-side, against etl-blocks-catalog.json
 *   ◉ Source data clone         — POST /explore-design/table/preview per source
 *   ✓ Cost estimate             — sums catalog categories ("ai_functions" etc.)
 *   ⚠ Compiled SQL              — code-gen output from /cortex/complete (best-effort)
 *   ⏳ Server dry-run           — POST /workflow/{id}/execute?dry_run=true
 *
 * Phases that depend on a backend endpoint that doesn't exist yet (or
 * isn't reachable from the wizard's pre-save context) render an explicit
 * "Backend gap" callout describing exactly what shape the endpoint needs
 * to take — so the backend team has a clear UX target instead of a
 * vague "validation needs work" ticket.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2, AlertTriangle, Loader2, Database, Coins, FileCode2,
  Beaker, ChevronRight, ServerCrash, Lock, Copy, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getTablePreview, type TablePreviewData } from '@/app/services/explore-design';
import type { Node, Edge } from 'reactflow';
import { BLOCK_BY_TYPE, validateGraph } from './etl-catalog-grounding';

type PhaseStatus = 'pending' | 'running' | 'passed' | 'warning' | 'failed' | 'backend_gap';

interface Phase {
  id: string;
  title: string;
  goal: string;
  status: PhaseStatus;
  detail?: React.ReactNode;
}

interface Props {
  workflow: { nodes: Node[]; edges: Edge[] } | null;
  generatedSql: string;
  generatedPython: string;
  generatedYaml: string;
  /** From the recommendations step — used to compute the cost banner. */
  estCreditsRange?: { min: number; max: number };
  /**
   * Optional pre-computed source-table previews, fired in parallel by the
   * wizard BEFORE this panel mounts (see `prewarmPreflight` in
   * GuidedAiWorkflowWizard). When provided, the panel seeds `previews`
   * from this map and skips its own sequential `getTablePreview` loop —
   * step 8 renders with results already in place instead of spinning per
   * source block. Optional + additive: if absent, the original sequential
   * loop kicks in.
   */
  precomputedSourcePreviews?: Record<
    string,
    { status: 'ok' | 'err'; data?: TablePreviewData; error?: string }
  >;
}

const STATUS_ICON: Record<PhaseStatus, React.ComponentType<{ className?: string }>> = {
  pending: ChevronRight,
  running: Loader2,
  passed: CheckCircle2,
  warning: AlertTriangle,
  failed: AlertTriangle,
  backend_gap: ServerCrash,
};

const STATUS_TINT: Record<PhaseStatus, string> = {
  pending: 'text-slate-400',
  running: 'text-blue-500',
  passed: 'text-emerald-600 dark:text-emerald-400',
  warning: 'text-amber-600 dark:text-amber-400',
  failed: 'text-red-600 dark:text-red-400',
  backend_gap: 'text-violet-600 dark:text-violet-400',
};

const STATUS_LABEL: Record<PhaseStatus, string> = {
  pending: 'Pending',
  running: 'Running…',
  passed: 'Passed',
  warning: 'Warning',
  failed: 'Failed',
  backend_gap: 'Backend gap',
};

export default function WizardPreflightPanel({
  workflow,
  generatedSql,
  generatedPython,
  generatedYaml,
  estCreditsRange,
  precomputedSourcePreviews,
}: Props) {
  // ─── Phase 1 — Catalog grounding (client-side, instantaneous) ──────────
  const catalogValidation = useMemo(
    () =>
      workflow
        ? validateGraph(
            workflow.nodes.map((n) => ({
              id: n.id,
              type: String(n.type),
              data: n.data as Record<string, unknown>,
            })),
            workflow.edges.map((e) => ({ source: e.source, target: e.target })),
          )
        : { ok: true, perNode: {}, graphLevel: [] },
    [workflow],
  );

  // ─── Phase 2 — Source data clone (real call to /explore-design/table/preview)
  // Pulls a 5-row sample for each source block that has database+schema+table
  // configured. Lets the user *see* that the wizard wired the right table
  // before the workflow is saved. Failures don't block the wizard but
  // surface so the user knows the binding is wrong.
  const sourceBlocks = useMemo(() => {
    if (!workflow) return [];
    return workflow.nodes
      .filter((n) => {
        const def = BLOCK_BY_TYPE.get(String(n.type));
        return def && def.category === 'source';
      })
      .map((n) => {
        const data = (n.data ?? {}) as Record<string, unknown>;
        const cfg = (data.config ?? {}) as Record<string, unknown>;
        return {
          nodeId: n.id,
          type: String(n.type),
          label: String(data.label ?? data.name ?? n.id),
          database: String(cfg.database ?? data.database ?? ''),
          schema: String(cfg.schema ?? data.schema ?? ''),
          table: String(cfg.table ?? data.table ?? ''),
        };
      });
  }, [workflow]);

  const [previews, setPreviews] = useState<
    Record<string, { status: 'running' | 'ok' | 'err'; data?: TablePreviewData; error?: string }>
  >({});

  useEffect(() => {
    let cancelled = false;
    async function loadAll() {
      const ready = sourceBlocks.filter((s) => s.database && s.schema && s.table);
      if (ready.length === 0) return;

      // Fast-path: if the wizard pre-fired all previews in parallel, seed
      // state from the map and skip the sequential loop. Any source missing
      // from the map (e.g. user just configured it) still falls back to a
      // real call below.
      if (precomputedSourcePreviews) {
        const seeded: typeof previews = {};
        const stillToFetch: typeof ready = [];
        for (const s of ready) {
          const pre = precomputedSourcePreviews[s.nodeId];
          if (pre) {
            seeded[s.nodeId] = pre;
          } else {
            stillToFetch.push(s);
          }
        }
        if (Object.keys(seeded).length > 0) {
          setPreviews((prev) => ({ ...prev, ...seeded }));
        }
        if (stillToFetch.length === 0) return;
        // Fall through with the still-to-fetch subset.
        setPreviews((prev) => {
          const next = { ...prev };
          stillToFetch.forEach((s) => {
            if (!next[s.nodeId]) next[s.nodeId] = { status: 'running' };
          });
          return next;
        });
        // Parallel — the wizard already fires precomputed ones in parallel,
        // so the late-arriving subset should also be parallel.
        await Promise.allSettled(
          stillToFetch.map(async (s) => {
            try {
              const data = await getTablePreview(s.database, s.schema, s.table, 5, 0);
              if (cancelled) return;
              setPreviews((prev) => ({ ...prev, [s.nodeId]: { status: 'ok', data } }));
            } catch (err) {
              if (cancelled) return;
              const msg = err instanceof Error ? err.message : String(err);
              setPreviews((prev) => ({ ...prev, [s.nodeId]: { status: 'err', error: msg } }));
            }
          }),
        );
        return;
      }

      // Fallback path — kept for external consumers that don't pass precomputed
      // previews. Source previews are independent, so fire them concurrently
      // (allSettled) and stream each result into state as it settles, rather than
      // waiting on each in series. Each preview sets its own nodeId, so the panel
      // fills in per-source instead of blocking on the slowest fetch.
      setPreviews((prev) => {
        const next = { ...prev };
        ready.forEach((s) => {
          if (!next[s.nodeId]) next[s.nodeId] = { status: 'running' };
        });
        return next;
      });
      await Promise.allSettled(
        ready.map(async (s) => {
          try {
            const data = await getTablePreview(s.database, s.schema, s.table, 5, 0);
            if (cancelled) return;
            setPreviews((prev) => ({ ...prev, [s.nodeId]: { status: 'ok', data } }));
          } catch (err) {
            if (cancelled) return;
            const msg = err instanceof Error ? err.message : String(err);
            setPreviews((prev) => ({ ...prev, [s.nodeId]: { status: 'err', error: msg } }));
          }
        }),
      );
    }
    void loadAll();
    return () => {
      cancelled = true;
    };
  }, [sourceBlocks, precomputedSourcePreviews]);

  // ─── Phase 3 — Cost estimate (by catalog category) ─────────────────────
  const costBreakdown = useMemo(() => {
    if (!workflow) return [];
    const counts = new Map<string, number>();
    for (const n of workflow.nodes) {
      const def = BLOCK_BY_TYPE.get(String(n.type));
      if (def) counts.set(def.category, (counts.get(def.category) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([cat, count]) => ({
      category: cat,
      count,
      // Per-category multiplier — directional, not a billing source of truth.
      // The real number comes from the recommendation card (estCreditsRange).
      weight:
        cat === 'ai_functions' || cat === 'ml_training' ? 'high' :
        cat === 'transform_advanced' || cat === 'python' ? 'medium' : 'low',
    }));
  }, [workflow]);

  // ─── Phases assembly ───────────────────────────────────────────────────
  const phases: Phase[] = [
    // 1. Catalog grounding
    {
      id: 'catalog',
      title: 'Catalog validation',
      goal: 'Every block type exists in the registered ETL catalog and every required parameter is filled.',
      status: catalogValidation.ok ? 'passed' : 'failed',
      detail: !catalogValidation.ok ? (
        <CatalogIssueList perNode={catalogValidation.perNode} workflow={workflow} />
      ) : (
        <p className="text-[11px] text-slate-500">
          {workflow?.nodes.length ?? 0} blocks · {workflow?.edges.length ?? 0} edges · all required parameters set.
        </p>
      ),
    },

    // 2. Source data clone
    {
      id: 'source_clone',
      title: 'Source data preview',
      goal: 'Fetch a 5-row sample of every source block from the data warehouse to confirm the bindings before deploy.',
      status: sourceBlocks.length === 0
        ? 'warning'
        : sourceBlocks.every((s) => previews[s.nodeId]?.status === 'ok')
        ? 'passed'
        : sourceBlocks.some((s) => previews[s.nodeId]?.status === 'running')
        ? 'running'
        : sourceBlocks.every((s) => s.database && s.schema && s.table)
        ? 'failed'
        : 'warning',
      detail: sourceBlocks.length === 0 ? (
        <p className="text-[11px] italic text-slate-500">No source blocks in the workflow.</p>
      ) : (
        <SourcePreviewList sources={sourceBlocks} previews={previews} />
      ),
    },

    // 3. Cost estimate
    {
      id: 'cost',
      title: 'Cost estimate',
      goal: 'Approximate credit consumption by block category, based on the recommendation tier chosen earlier.',
      status: estCreditsRange ? 'passed' : 'warning',
      detail: (
        <CostBreakdown breakdown={costBreakdown} range={estCreditsRange} />
      ),
    },

    // 4. Compiled code
    {
      id: 'codegen',
      title: 'Compiled code',
      goal: 'SQL, Python and YAML snippets generated by the AI engine for inspection. Optional but useful for review.',
      status:
        generatedSql.length > 0 || generatedPython.length > 0 || generatedYaml.length > 0
          ? 'passed'
          : 'warning',
      detail: (
        <CodeTabs sql={generatedSql} python={generatedPython} yaml={generatedYaml} />
      ),
    },

    // 5. Server dry-run — backend gap
    {
      id: 'dry_run',
      title: 'Server dry-run',
      goal: 'Compile + execute the workflow against the data warehouse with a row limit, without touching destination tables.',
      status: 'backend_gap',
      detail: (
        <BackendGapNote
          endpoint="POST /workflow/dry-run"
          payload="{ nodes, edges }  (stateless — no project_id required)"
          response="{ steps: [{ step_id, status, rows_estimated, compiled_sql, error? }] }"
          why="Today validate/execute both require a saved project_id, so the wizard must save the draft first before it can be tested. A stateless dry-run lets the user test BEFORE committing the [AI Draft] project, matching the mental model of every other no-code tool."
        />
      ),
    },

    // 6. Approval / deploy gate
    {
      id: 'approval',
      title: 'Deploy readiness',
      goal: 'Once saved, the workflow goes through Request → Approve → Execute. Approvers see the same pre-flight summary.',
      status: catalogValidation.ok ? 'passed' : 'pending',
      detail: (
        <p className="text-[11px] text-slate-500">
          On the next step you'll save as <em>[AI Draft]</em>. Open the right panel's
          <span className="font-semibold"> Runs </span> tab to request deployment and track approval.
        </p>
      ),
    },
  ];

  const passedCount = phases.filter((p) => p.status === 'passed').length;
  const blockedCount = phases.filter((p) => p.status === 'failed').length;

  return (
    <div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            8. Test before deploy
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Pre-flight check
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Six phases, each with a clear goal. {passedCount}/{phases.length} passed,{' '}
            {blockedCount} blocking.
          </p>
        </div>
        <div className="shrink-0">
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-right shadow-sm dark:border-slate-700 dark:bg-slate-900">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Ready to deploy
            </p>
            <p
              className={cn(
                'mt-0.5 text-lg font-bold',
                blockedCount > 0 ? 'text-red-600' : 'text-emerald-600',
              )}
            >
              {blockedCount > 0 ? 'No' : 'Yes'}
            </p>
          </div>
        </div>
      </div>

      <ol className="mt-5 space-y-2">
        {phases.map((p, i) => {
          const Icon = STATUS_ICON[p.status];
          const tint = STATUS_TINT[p.status];
          return (
            <li
              key={p.id}
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-900"
            >
              <div className="flex items-start gap-3">
                <div className="mt-0.5">
                  <Icon
                    className={cn(
                      'h-4 w-4',
                      tint,
                      p.status === 'running' && 'animate-spin',
                    )}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                      Phase {i + 1}
                    </span>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      {p.title}
                    </h3>
                    <span
                      className={cn(
                        'ml-auto rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider',
                        p.status === 'passed' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
                        p.status === 'failed' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
                        p.status === 'warning' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
                        p.status === 'running' && 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
                        p.status === 'pending' && 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                        p.status === 'backend_gap' && 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300',
                      )}
                    >
                      {STATUS_LABEL[p.status]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-500">{p.goal}</p>
                  {p.detail && <div className="mt-2.5">{p.detail}</div>}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────
// Sub-renderers
// ───────────────────────────────────────────────────────────────────────────

function CatalogIssueList({
  perNode,
  workflow,
}: {
  perNode: Record<string, { kind: string; field?: string; message: string }[]>;
  workflow: { nodes: Node[]; edges: Edge[] } | null;
}) {
  const entries = Object.entries(perNode);
  if (entries.length === 0) return null;
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-2 dark:border-red-900/40 dark:bg-red-900/10">
      <ul className="space-y-1 text-[11px] text-red-800 dark:text-red-200">
        {entries.map(([nodeId, issues]) => {
          const node = workflow?.nodes.find((n) => n.id === nodeId);
          return (
            <li key={nodeId} className="flex gap-1.5">
              <span className="font-mono uppercase">{String(node?.type ?? nodeId)}</span>
              <span className="opacity-80">— missing {issues.map((i) => i.field ?? i.message).join(', ')}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-1.5 text-[10px] italic opacity-70">
        Go back to step 7 — the canvas highlights these blocks in red.
      </p>
    </div>
  );
}

function SourcePreviewList({
  sources,
  previews,
}: {
  sources: Array<{ nodeId: string; type: string; label: string; database: string; schema: string; table: string }>;
  previews: Record<string, { status: 'running' | 'ok' | 'err'; data?: TablePreviewData; error?: string }>;
}) {
  return (
    <div className="space-y-2">
      {sources.map((s) => {
        const p = previews[s.nodeId];
        const isReady = s.database && s.schema && s.table;
        return (
          <div
            key={s.nodeId}
            className="rounded-lg border border-slate-200 bg-slate-50 p-2 dark:border-slate-700 dark:bg-slate-900/40"
          >
            <div className="flex items-center gap-2">
              <Database className="h-3.5 w-3.5 text-slate-500" />
              <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                {s.label}
              </span>
              <span className="font-mono text-[10px] text-slate-500">
                {isReady ? `${s.database}.${s.schema}.${s.table}` : '— not bound yet —'}
              </span>
              {p?.status === 'running' && <Loader2 className="ml-auto h-3 w-3 animate-spin text-blue-500" />}
              {p?.status === 'ok' && (
                <span className="ml-auto text-[10px] font-medium text-emerald-600">
                  {p.data?.rows.length ?? '—'} rows · {p.data?.columns.length ?? '—'} cols
                </span>
              )}
              {p?.status === 'err' && (
                <span className="ml-auto text-[10px] font-medium text-red-600">unreachable</span>
              )}
            </div>
            {p?.status === 'ok' && p.data && (
              <div className="mt-2 overflow-x-auto rounded border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
                <table className="w-full text-[10px]">
                  <thead className="bg-slate-100 dark:bg-slate-800">
                    <tr>
                      {p.data.columns.slice(0, 6).map((c) => (
                        <th key={c} className="px-2 py-1 text-left font-semibold text-slate-600 dark:text-slate-300">
                          {c}
                        </th>
                      ))}
                      {p.data.columns.length > 6 && (
                        <th className="px-2 py-1 text-left font-mono text-slate-400">+{p.data.columns.length - 6}</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {p.data.rows.slice(0, 3).map((row, ri) => (
                      <tr key={ri} className="border-t border-slate-100 dark:border-slate-800">
                        {p.data!.columns.slice(0, 6).map((c) => (
                          <td key={c} className="max-w-[120px] truncate px-2 py-1 text-slate-700 dark:text-slate-300">
                            {row[c] == null ? <span className="italic text-slate-400">null</span> : String(row[c])}
                          </td>
                        ))}
                        {p.data!.columns.length > 6 && <td className="px-2 py-1 text-slate-400">…</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {p?.status === 'err' && (
              <p className="mt-1.5 text-[10px] text-red-600 dark:text-red-400">
                {p.error}{' '}
                <span className="italic opacity-70">
                  — verify the user has SELECT on this table.
                </span>
              </p>
            )}
            {!isReady && (
              <p className="mt-1.5 text-[10px] italic text-amber-700 dark:text-amber-400">
                Bind database / schema / table in step 7 to enable preview.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CostBreakdown({
  breakdown,
  range,
}: {
  breakdown: Array<{ category: string; count: number; weight: string }>;
  range?: { min: number; max: number };
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {breakdown.map((b) => (
          <span
            key={b.category}
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-semibold',
              b.weight === 'high' && 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
              b.weight === 'medium' && 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
              b.weight === 'low' && 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
            )}
          >
            <span className="font-mono">{b.count}×</span>
            {b.category}
          </span>
        ))}
      </div>
      {range && (
        <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-900/40">
          <Coins className="h-3.5 w-3.5 text-amber-500" />
          <span className="text-[11px] font-medium text-slate-700 dark:text-slate-200">
            Estimated cost
          </span>
          <span className="ml-auto font-mono text-[11px] font-bold text-slate-900 dark:text-white">
            {range.min.toLocaleString()} – {range.max.toLocaleString()} credits / run
          </span>
        </div>
      )}
    </div>
  );
}

function CodeTabs({ sql, python, yaml }: { sql: string; python: string; yaml: string }) {
  const [tab, setTab] = useState<'sql' | 'python' | 'yaml'>('sql');
  const [copied, setCopied] = useState(false);
  const code = tab === 'sql' ? sql : tab === 'python' ? python : yaml;
  const empty = !sql && !python && !yaml;

  const handleCopy = () => {
    if (!code) return;
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  };

  if (empty) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-900/20">
        <FileCode2 className="h-3.5 w-3.5 text-amber-600" />
        <span className="text-[11px] text-amber-800 dark:text-amber-200">
          Code generation is still running — open this step in a few seconds, or skip and inspect the SQL in the right panel after creation.
        </span>
      </div>
    );
  }
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-950 dark:border-slate-700">
      <div className="flex items-center border-b border-slate-800">
        {(['sql', 'python', 'yaml'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider transition-colors',
              tab === t ? 'border-b-2 border-purple-500 text-purple-300' : 'text-slate-400 hover:text-slate-200',
            )}
          >
            {t}
          </button>
        ))}
        <button
          onClick={handleCopy}
          disabled={!code}
          title={`Copy ${tab.toUpperCase()} to clipboard`}
          className="ml-auto flex items-center gap-1 px-2 py-1.5 text-[10px] text-slate-400 transition-colors hover:text-slate-200 disabled:opacity-40"
        >
          {copied ? (
            <Check className="h-3 w-3 text-emerald-400" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="max-h-[180px] overflow-auto px-3 py-2 font-mono text-[10px] text-emerald-300">
        {code || <span className="italic text-slate-500">No {tab.toUpperCase()} generated.</span>}
      </pre>
    </div>
  );
}

function BackendGapNote({
  endpoint,
  payload,
  response,
  why,
}: {
  endpoint: string;
  payload: string;
  response: string;
  why: string;
}) {
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 dark:border-violet-900/40 dark:bg-violet-900/20">
      <div className="flex items-center gap-2">
        <Lock className="h-3 w-3 text-violet-500" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-violet-700 dark:text-violet-300">
          Backend gap — UX target
        </p>
      </div>
      <dl className="mt-2 space-y-1.5 text-[11px]">
        <div className="grid grid-cols-[80px_1fr] gap-2">
          <dt className="font-semibold text-violet-700 dark:text-violet-300">Endpoint</dt>
          <dd className="font-mono text-slate-800 dark:text-slate-200">{endpoint}</dd>
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-2">
          <dt className="font-semibold text-violet-700 dark:text-violet-300">Body</dt>
          <dd className="font-mono text-slate-800 dark:text-slate-200">{payload}</dd>
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-2">
          <dt className="font-semibold text-violet-700 dark:text-violet-300">Returns</dt>
          <dd className="font-mono text-slate-800 dark:text-slate-200">{response}</dd>
        </div>
        <div className="grid grid-cols-[80px_1fr] gap-2">
          <dt className="font-semibold text-violet-700 dark:text-violet-300">Why</dt>
          <dd className="text-slate-700 dark:text-slate-300">{why}</dd>
        </div>
      </dl>
      <div className="mt-2 flex items-center gap-2 rounded bg-violet-100 px-2 py-1 dark:bg-violet-900/40">
        <Beaker className="h-3 w-3 text-violet-600 dark:text-violet-300" />
        <span className="text-[10px] text-violet-800 dark:text-violet-200">
          Until this lands, the wizard falls back to: save draft → call <code className="font-mono">/workflow/&#123;id&#125;/validate</code> → toast result.
        </span>
      </div>
    </div>
  );
}
