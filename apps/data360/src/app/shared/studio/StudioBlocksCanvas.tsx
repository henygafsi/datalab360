'use client';

/**
 * StudioBlocksCanvas — a JOB as an editable React Flow of ETL BLOCKS
 * (batch/SCD/event/streaming/quality/python-ML/delivery/control), plus
 * the application's block PROPOSALS.
 *
 * Every block says its availability with EVIDENCE (an available block
 * cites the proven route; a to_configure block says what is missing) —
 * a block never pretends to run. Node click opens its config and hands
 * edits to the SAME allowlisted editors (rules/SQL/trigger/mapping):
 * one definition, whichever surface edits it. Proposals derive from the
 * application's own context (why[] cites the evidence), can be enriched
 * by AI for 1 preview unit (validated extras only), and are NEVER
 * executed by their acceptance.
 */

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  type Edge,
  type Node,
  type NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  Boxes,
  BrainCircuit,
  Clock3,
  Database,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  decideBlock,
  getBlocks,
  getJobGraph,
  proposeBlocks,
  type BlockGraph,
  type BlockNode,
  type BlockProposal,
} from '@/app/services/studio/studio-api';

/** Brand rule: vendor names never reach customer-facing copy — backend
 *  evidence strings are technical journal text, neutralized on display. */
function neutral(s?: string | null): string {
  return String(s ?? '')
    .replace(/snowpipe/gi, 'the streaming loader')
    .replace(/snowflake/gi, 'the warehouse')
    .replace(/cortex/gi, 'the AI engine')
    .replace(/\bkimi\b/gi, 'the AI engine');
}

const FAMILY_META: Record<string, { icon: typeof Database; cls: string; ring: string }> = {
  ingestion: { icon: Database, cls: 'text-sky-600 dark:text-sky-400', ring: 'border-sky-200 dark:border-sky-900' },
  transform: { icon: Boxes, cls: 'text-violet-600 dark:text-violet-400', ring: 'border-violet-200 dark:border-violet-900' },
  python_ml: { icon: BrainCircuit, cls: 'text-emerald-600 dark:text-emerald-400', ring: 'border-emerald-200 dark:border-emerald-900' },
  delivery: { icon: Send, cls: 'text-amber-600 dark:text-amber-400', ring: 'border-amber-200 dark:border-amber-900' },
  control: { icon: Clock3, cls: 'text-slate-500 dark:text-slate-400', ring: 'border-slate-200 dark:border-slate-700' },
};

const AVAIL_CLS: Record<string, string> = {
  available: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  partial: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  to_configure: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  not_integrated: 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500',
  template: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
};

function EtlBlockNodeInner({ data, selected }: NodeProps<BlockNode>) {
  const fam = FAMILY_META[data.family ?? 'control'] ?? FAMILY_META.control;
  const FamIcon = fam.icon;
  const avail = data.availability?.status ?? 'available';
  return (
    <div
      className={`w-[200px] rounded-xl border bg-white shadow-sm dark:bg-slate-900 ${
        selected ? 'border-accent-500 ring-1 ring-accent-500' : fam.ring
      }`}
      title={neutral(data.availability?.evidence)}
    >
      <div className="flex items-center gap-1.5 rounded-t-xl border-b border-slate-100 bg-slate-50 px-2 py-1 dark:border-slate-800 dark:bg-slate-800/60">
        <FamIcon aria-hidden className={`h-3.5 w-3.5 shrink-0 ${fam.cls}`} />
        <span className="min-w-0 truncate text-xs font-semibold text-slate-900 dark:text-slate-100">
          {data.label ?? data.block_type}
        </span>
      </div>
      <div className="space-y-1 px-2 py-1.5">
        <p className="flex flex-wrap items-center gap-1">
          <span className="rounded-full bg-slate-100 px-1.5 py-px font-mono text-[8px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            {data.block_type}
          </span>
          <span className={`rounded-full px-1.5 py-px text-[8px] ${AVAIL_CLS[avail] ?? AVAIL_CLS.to_configure}`}>
            {avail.replace(/_/g, ' ')}
          </span>
        </p>
        {data.description && (
          <p className="text-xs leading-snug text-slate-500 line-clamp-2 dark:text-slate-400">
            {neutral(data.description)}
          </p>
        )}
      </div>
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !border-2 !border-white !bg-slate-400 dark:!border-slate-900" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !border-2 !border-white !bg-slate-400 dark:!border-slate-900" />
    </div>
  );
}
const EtlBlockNode = memo(EtlBlockNodeInner);
const NODE_TYPES = { etlBlock: EtlBlockNode };

/** Which existing editor a block's edit_paths hand to. */
function editTarget(paths: string[]): { label: string; anchor: 'sql' | 'rules' | 'trigger' | 'mapping' | null } {
  const joined = paths.join(' ');
  if (/\/sql/.test(joined)) return { label: 'Edit the SQL (expert)', anchor: 'sql' };
  if (/\/rules/.test(joined)) return { label: 'Edit the rules', anchor: 'rules' };
  if (/\/trigger/.test(joined)) return { label: 'Edit the schedule', anchor: 'trigger' };
  if (/\/mapping|\/columns|\/grain/.test(joined)) return { label: 'Edit the mapping', anchor: 'mapping' };
  return { label: '', anchor: null };
}

export function StudioJobBlocksView({
  draftId,
  jobId,
}: {
  draftId: string;
  jobId: string;
}) {
  const [graph, setGraph] = useState<BlockGraph | 'loading' | 'error'>('loading');
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setGraph('loading');
    getJobGraph(draftId, jobId)
      .then((g) => alive && setGraph(g))
      .catch(() => alive && setGraph('error'));
    return () => {
      alive = false;
    };
  }, [draftId, jobId]);

  const { nodes, edges } = useMemo((): { nodes: Node<BlockNode>[]; edges: Edge[] } => {
    if (typeof graph !== 'object') return { nodes: [], edges: [] };
    return {
      nodes: graph.nodes.map((n, i) => ({
        id: n.id,
        type: 'etlBlock' as const,
        position: { x: n.position?.x ?? 40 + i * 230, y: n.position?.y ?? 40 },
        selected: selected === n.id,
        data: n,
      })),
      edges: graph.edges.map((e, i) => ({
        id: e.id ?? `e${i}`,
        source: e.source,
        target: e.target,
        label: e.label,
        type: 'smoothstep',
        markerEnd: { type: MarkerType.ArrowClosed },
        style: { stroke: '#94a3b8', strokeWidth: 1.5 },
      })),
    };
  }, [graph, selected]);

  if (graph === 'loading')
    return <div className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-hidden />;
  if (graph === 'error')
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        The block graph could not be read — the job stays editable above.
      </p>
    );

  const sel = graph.nodes.find((n) => n.id === selected) ?? null;
  const target = sel ? editTarget(sel.edit_paths ?? []) : null;

  return (
    <div className="space-y-2">
      <div className="h-56 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={NODE_TYPES}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1 }}
          minZoom={0.35}
          onNodeClick={(_, n) => setSelected((s) => (s === n.id ? null : n.id))}
          proOptions={{ hideAttribution: true }}
        >
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      {sel && (
        <div className="rounded-lg border border-slate-100 p-2 text-xs dark:border-slate-800">
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-800 dark:text-slate-200">{sel.label}</span>
            <span className="font-mono text-xs text-slate-400 dark:text-slate-500">{sel.block_type}</span>
            {sel.availability?.evidence && (
              <span className="text-xs text-slate-400 dark:text-slate-500" title={neutral(sel.availability.evidence)}>
                evidence: {neutral(sel.availability.evidence).slice(0, 60)}…
              </span>
            )}
          </p>
          {sel.config && Object.keys(sel.config).length > 0 && (
            <pre className="mt-1 max-h-24 overflow-auto rounded bg-slate-50 p-1.5 font-mono text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-400">
              {JSON.stringify(sel.config, null, 1)}
            </pre>
          )}
          {target?.anchor ? (
            <p className="mt-1 text-xs text-accent-600 dark:text-accent-400">
              {target.label} — in the job editor above (one definition, same patch contract).
            </p>
          ) : (
            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
              This block is derived — its truth lives in the mapping and rules above.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

/* ── proposals ──────────────────────────────────────────────────────── */

export function StudioBlockProposals({ draftId }: { draftId: string }) {
  const [view, setView] = useState<BlockProposal[] | 'loading' | 'error'>('loading');
  const [questions, setQuestions] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (mode: 'read' | 'derive' | 'ai' = 'read') => {
    try {
      const r =
        mode === 'read'
          ? await getBlocks(draftId).then(async (v) =>
              v.proposals.length > 0 ? v : proposeBlocks(draftId, false),
            )
          : await proposeBlocks(draftId, mode === 'ai');
      setView(r.proposals);
      if (r.questions?.length) setQuestions(r.questions);
    } catch {
      setView('error');
    }
  }, [draftId]);

  useEffect(() => {
    void load('read');
  }, [load]);

  if (view === 'loading')
    return <div className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-hidden />;
  if (view === 'error')
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Block proposals could not be derived for this application.
      </p>
    );

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
          <Boxes aria-hidden className="h-4 w-4 text-accent-500" />
          Proposed blocks — from THIS application&apos;s context
        </h3>
        <button
          type="button"
          disabled={busy === 'ai'}
          title="One AI unit of the preview envelope — business descriptions + at most 3 validated extra proposals; nothing executes"
          onClick={async () => {
            setBusy('ai');
            setError(null);
            try {
              await load('ai');
            } catch {
              setError('The AI enrichment failed — the deterministic proposals stay.');
            } finally {
              setBusy(null);
            }
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-accent-500 px-2.5 py-1 text-xs font-medium text-accent-700 hover:bg-accent-50 disabled:opacity-50 dark:text-accent-300 dark:hover:bg-accent-900/30"
        >
          {busy === 'ai' ? (
            <RefreshCw aria-hidden className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles aria-hidden className="h-3 w-3" />
          )}
          Enrich with AI (1 unit)
        </button>
      </div>
      <ul className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
        {view.map((p) => {
          const fam = FAMILY_META[p.family ?? 'control'] ?? FAMILY_META.control;
          const FamIcon = fam.icon;
          const avail = p.availability?.status ?? 'to_configure';
          const settled = p.state === 'accepted' || p.state === 'rejected';
          return (
            <li key={p.proposal_id} className="rounded-lg border border-slate-200 p-2.5 dark:border-slate-800">
              <p className="flex flex-wrap items-center gap-1.5">
                <FamIcon aria-hidden className={`h-3.5 w-3.5 ${fam.cls}`} />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                  {p.title ?? p.label ?? p.block_type}
                </span>
                <span className={`rounded-full px-1.5 py-px text-[8px] ${AVAIL_CLS[avail] ?? AVAIL_CLS.to_configure}`}>
                  {avail.replace(/_/g, ' ')}
                </span>
                {p.source === 'ai' && (
                  <span className="rounded-full bg-accent-50 px-1.5 py-px text-[8px] text-accent-700 dark:bg-accent-900/30 dark:text-accent-300">
                    ai
                  </span>
                )}
                {p.state && p.state !== 'proposed' && (
                  <span className="rounded-full bg-slate-100 px-1.5 py-px text-[8px] text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {p.state}
                  </span>
                )}
              </p>
              {(p.description_ai ?? p.description) && (
                <p className="mt-1 text-xs leading-snug text-slate-500 dark:text-slate-400">
                  {neutral(p.description_ai ?? p.description)}
                </p>
              )}
              {(p.why?.length ?? 0) > 0 && (
                <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                  why: {neutral(p.why!.map((w) => w.detail ?? w.ref).join(' · '))}
                </p>
              )}
              {p.next?.note && (
                <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">{neutral(p.next.note)}</p>
              )}
              {!settled && (
                <p className="mt-1.5 flex items-center gap-1.5">
                  {(['accepted', 'deferred', 'rejected'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={busy === p.proposal_id}
                      title={
                        s === 'accepted'
                          ? 'Accepting records the decision — NOTHING executes by itself'
                          : undefined
                      }
                      onClick={async () => {
                        setBusy(p.proposal_id);
                        setError(null);
                        try {
                          const updated = await decideBlock(draftId, p.proposal_id, s);
                          setView((prev) =>
                            Array.isArray(prev)
                              ? prev.map((x) =>
                                  x.proposal_id === p.proposal_id ? { ...x, ...updated, state: s } : x,
                                )
                              : prev,
                          );
                        } catch (e) {
                          setError(e instanceof Error ? e.message : 'The decision failed.');
                        } finally {
                          setBusy(null);
                        }
                      }}
                      className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                        s === 'accepted'
                          ? 'bg-accent-600 text-white hover:bg-accent-700'
                          : 'border border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                      } disabled:opacity-50`}
                    >
                      {s === 'accepted' ? 'Accept' : s === 'deferred' ? 'Later' : 'Reject'}
                    </button>
                  ))}
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {questions.length > 0 && (
        <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          <p className="flex items-center gap-1 font-medium">
            <ShieldCheck aria-hidden className="h-3 w-3" /> The AI would ask you:
          </p>
          <ul className="mt-0.5 list-inside list-disc">
            {questions.slice(0, 3).map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
