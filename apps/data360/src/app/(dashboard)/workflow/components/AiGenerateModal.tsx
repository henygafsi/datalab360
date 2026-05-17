'use client';

/**
 * AiGenerateModal — describe a workflow in plain English; the LLM returns
 * an array of ETL nodes + edges that get dropped onto the canvas.
 *
 * Flow:
 *  1. User opens modal, types "Join customers with orders, filter for 2024,
 *     group by region and count orders".
 *  2. We call POST /cortex/complete with a structured prompt asking for
 *     strict JSON output.
 *  3. We parse + validate the response, then call onGenerated(nodes, edges).
 *
 * The LLM is non-deterministic. We treat malformed responses as a recoverable
 * error — the user can retry, tweak the description, or fall back to manual.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X, Loader2, AlertTriangle, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { generateCompletion } from '@/app/services/cortex/ml-features';
import type { Node, Edge } from 'reactflow';

interface AiGenerateModalProps {
  open: boolean;
  onClose: () => void;
  onGenerated: (nodes: Node[], edges: Edge[]) => void;
}

// The structured response shape we ask the model to produce. Keep it small
// so the parser has fewer ways to misinterpret.
interface AiBlockSpec {
  id: string;
  type: 'source' | 'filter' | 'join' | 'aggregate' | 'select' | 'sort' | 'destination';
  label: string;
  /** Free-form description shown as a placeholder for the user to fill in */
  hint?: string;
}
interface AiEdgeSpec {
  from: string;
  to: string;
}
interface AiResponseShape {
  blocks: AiBlockSpec[];
  edges: AiEdgeSpec[];
  notes?: string;
}

// Example prompts shown as quick-start chips
const EXAMPLES = [
  'Load orders from RETAIL_DW, filter for last 30 days, group by region, count orders',
  'Join customers and transactions on customer_id, then write the result to ANALYTICS_DW',
  'Read raw events, filter status=SUCCESS, aggregate by hour, send to a destination table',
];

function buildPrompt(description: string): string {
  return `You are a workflow generator. The user wants to build a data pipeline. Based on the description below, produce a JSON object with this exact shape:

{
  "blocks": [
    { "id": "n1", "type": "source" | "filter" | "join" | "aggregate" | "select" | "sort" | "destination", "label": "short label", "hint": "what the user should configure" }
  ],
  "edges": [ { "from": "n1", "to": "n2" } ],
  "notes": "short notes (optional)"
}

Rules:
- IDs must be unique strings.
- Edges must connect existing block IDs.
- Always start from one or more "source" blocks and end at "destination".
- 3-8 blocks is ideal; do not produce more than 12.
- Respond with ONLY the JSON, no markdown, no commentary.

User description:
"""${description}"""`;
}

function parseLlmResponse(raw: string): AiResponseShape | null {
  // Strip markdown fences if the model added them anyway.
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  try {
    const obj = JSON.parse(cleaned) as AiResponseShape;
    if (!Array.isArray(obj.blocks) || !Array.isArray(obj.edges)) return null;
    if (obj.blocks.length === 0) return null;
    return obj;
  } catch {
    return null;
  }
}

function layoutBlocks(blocks: AiBlockSpec[], edges: AiEdgeSpec[]): {
  nodes: Node[];
  edges: Edge[];
} {
  // Simple topological-ish layout: sources on the left, destinations on the
  // right, everything else in the middle. Y-axis stacks blocks of the same
  // "rank" so the canvas doesn't overlap nodes.
  const rankByType: Record<AiBlockSpec['type'], number> = {
    source: 0,
    filter: 1,
    select: 1,
    join: 2,
    aggregate: 2,
    sort: 3,
    destination: 4,
  };
  const byRank = new Map<number, AiBlockSpec[]>();
  for (const b of blocks) {
    const r = rankByType[b.type] ?? 1;
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(b);
  }
  const X_STEP = 260;
  const Y_STEP = 130;
  const nodes: Node[] = [];
  for (const [rank, group] of byRank.entries()) {
    group.forEach((b, idx) => {
      nodes.push({
        id: b.id,
        type: b.type, // pick whatever node-type your canvas registers
        position: { x: rank * X_STEP, y: idx * Y_STEP },
        data: {
          label: b.label,
          hint: b.hint,
          aiGenerated: true,
        },
      });
    });
  }
  const rfEdges: Edge[] = edges
    .filter((e) => blocks.find((b) => b.id === e.from) && blocks.find((b) => b.id === e.to))
    .map((e, i) => ({
      id: `e-${i}-${e.from}-${e.to}`,
      source: e.from,
      target: e.to,
      animated: true,
    }));
  return { nodes, edges: rfEdges };
}

export default function AiGenerateModal({
  open,
  onClose,
  onGenerated,
}: AiGenerateModalProps) {
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRaw, setLastRaw] = useState<string | null>(null);

  const reset = () => {
    setDescription('');
    setSubmitting(false);
    setError(null);
    setLastRaw(null);
  };

  const handleClose = () => {
    if (submitting) return;
    reset();
    onClose();
  };

  const handleGenerate = async () => {
    if (!description.trim() || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await generateCompletion({
        prompt: buildPrompt(description.trim()),
        model: 'mistral-large',
      });
      const raw = res?.response ?? '';
      setLastRaw(raw);
      const parsed = parseLlmResponse(raw);
      if (!parsed) {
        setError(
          "The AI returned something we couldn't parse. Try a more specific description, or click Retry.",
        );
        return;
      }
      const { nodes, edges } = layoutBlocks(parsed.blocks, parsed.edges);
      onGenerated(nodes, edges);
      toast.success(`Generated ${nodes.length} blocks`);
      reset();
      onClose();
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Generation failed';
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 8 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            {/* Header gradient orb */}
            <div className="pointer-events-none absolute -left-16 -top-16 h-44 w-44 rounded-full bg-gradient-to-br from-purple-400/30 to-fuchsia-500/30 blur-3xl" />
            <div className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-gradient-to-br from-blue-400/20 to-indigo-500/20 blur-2xl" />

            {/* Header */}
            <div className="relative flex items-start justify-between gap-3 px-6 pb-3 pt-5">
              <div className="flex items-center gap-3">
                <motion.div
                  initial={{ rotate: -8, scale: 0.85 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 18 }}
                  className="relative flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-fuchsia-600 shadow-lg shadow-purple-500/30"
                >
                  <Sparkles className="h-5 w-5 text-white" />
                  <span className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/30 to-transparent" />
                </motion.div>
                <div>
                  <h2 className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">
                    Generate workflow with AI
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Describe what you want — we'll lay out the ETL blocks for you.
                  </p>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={handleClose}
                disabled={submitting}
                className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-800"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </motion.button>
            </div>

            {/* Body */}
            <div className="relative px-6 py-3">
              <label className="mb-1.5 block text-xs font-semibold text-slate-700 dark:text-slate-300">
                What should this workflow do?
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                disabled={submitting}
                placeholder="e.g. Join customers and orders on customer_id, filter orders from last 30 days, group by region and count orders, write to ANALYTICS_DW.region_summary"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/30 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
              />

              {/* Example chips */}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {EXAMPLES.map((ex) => (
                  <motion.button
                    key={ex}
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setDescription(ex)}
                    disabled={submitting}
                    className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] text-slate-600 transition-colors hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-purple-700 dark:hover:bg-purple-900/20"
                  >
                    {ex.slice(0, 40)}{ex.length > 40 ? '…' : ''}
                  </motion.button>
                ))}
              </div>

              {/* Error banner */}
              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 overflow-hidden rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
                  >
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">Couldn't parse the AI response</p>
                        <p className="mt-0.5 opacity-80">{error}</p>
                        {lastRaw && (
                          <details className="mt-1">
                            <summary className="cursor-pointer text-[10px] text-red-600 underline">
                              show raw response
                            </summary>
                            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-red-100 p-2 text-[10px] text-red-900 dark:bg-red-950/50 dark:text-red-200">
                              {lastRaw}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Footer */}
            <div className="relative flex items-center justify-between gap-3 border-t border-slate-200 px-6 py-3 dark:border-slate-700">
              <p className="text-[11px] text-slate-400">
                Powered by Cortex · output may need editing
              </p>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleClose}
                  disabled={submitting}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <motion.button
                  whileHover={!submitting && description.trim() ? { scale: 1.03 } : undefined}
                  whileTap={!submitting && description.trim() ? { scale: 0.97 } : undefined}
                  onClick={handleGenerate}
                  disabled={submitting || !description.trim()}
                  className={cn(
                    'group relative inline-flex items-center gap-1.5 overflow-hidden rounded-lg px-3 py-1.5 text-xs font-semibold text-white shadow-md transition-all',
                    submitting || !description.trim()
                      ? 'bg-slate-300 text-slate-500 shadow-none dark:bg-slate-700 dark:text-slate-400'
                      : 'bg-gradient-to-r from-purple-600 to-fuchsia-600 shadow-purple-500/30 hover:from-purple-700 hover:to-fuchsia-700 hover:shadow-lg hover:shadow-purple-500/40',
                  )}
                >
                  {!submitting && description.trim() && (
                    <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                  )}
                  {submitting ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-3.5 w-3.5" />
                      {error ? 'Retry' : 'Generate'}
                    </>
                  )}
                </motion.button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
