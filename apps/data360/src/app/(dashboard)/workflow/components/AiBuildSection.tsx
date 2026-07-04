'use client';

/**
 * AiBuildSection — the docked "AI Build" flow in the WorkflowSmartPanel
 * right rail. Replaces the embedded step-wizard as the PRIMARY AI path:
 *
 *   1. The user states intent in a prompt box (no popup, no steps).
 *   2. Generate (gated on workflow create/edit) → the graph is applied
 *      DIRECTLY onto the real builder canvas as an "AI draft" (selected
 *      nodes + violet badge), wired edges included.
 *   3. This section flips to a review list — per block: name, type, and
 *      missing-required-param flags (live: configuring a block on the
 *      canvas clears its flag) — with Accept all / Undo / Refine.
 *
 * Accept persists via the builder's existing AI-accept path (steps +
 * validation). Undo removes exactly the applied nodes/edges. Refine
 * re-prompts keeping the original intent as context and swaps the draft.
 *
 * The classic GuidedAiWorkflowWizard stays reachable behind the small
 * "step-by-step wizard" link at the bottom (fallback, no longer primary).
 */

import React, { useEffect, useState } from 'react';
import type { Node, Edge } from 'reactflow';
import {
  Sparkles,
  Loader2,
  Check,
  Undo2,
  Wand2,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import { useAiPipelineGenerate, type AiGenerateSource } from './useAiPipelineGenerate';

// ---------------------------------------------------------------------------
// Types shared with the builder (which owns the canvas + draft state so the
// draft survives rail-section flips and panel remounts)
// ---------------------------------------------------------------------------

export interface AiBuildDraft {
  /** The intent prompt that produced this draft (kept for Refine context). */
  prompt: string;
  nodeIds: string[];
  edgeIds: string[];
  source: AiGenerateSource;
  fallbackReason?: string;
}

/** Per-block review row — computed by the builder from the LIVE canvas nodes. */
export interface AiBuildReviewRow {
  id: string;
  label: string;
  type: string;
  /** Required catalog params still empty on this block. */
  missingParams: string[];
}

export interface AiBuildSectionProps {
  /** Pre-seed from the UnifiedProjectWizard AI fork / scan deep-links. */
  seedPrompt?: string;
  /** Gating: useCanPerform('workflow','create'|'edit') from the builder. */
  canBuild: boolean;
  isReadOnly: boolean;
  /** The applied draft (null = nothing pending review). */
  draft: AiBuildDraft | null;
  /** Live review rows for the draft's blocks. */
  draftReview: AiBuildReviewRow[];
  /** Accept-all persistence in flight. */
  isAccepting: boolean;
  /** Apply a generated graph to the canvas (replaces any previous draft). */
  onApply: (
    nodes: Node[],
    edges: Edge[],
    prompt: string,
    source: AiGenerateSource,
    fallbackReason?: string,
  ) => void;
  /** Keep the draft: clear markers + persist via the existing AI-accept path. */
  onAccept: () => void | Promise<void>;
  /** Remove the draft's nodes/edges from the canvas. */
  onUndo: () => void;
  /** Fallback: open the classic step-by-step GuidedAiWorkflowWizard. */
  onOpenClassicWizard: () => void;
}

const EXAMPLE_PROMPT =
  'Load FACT_TRANSACTIONS, clean null rows, aggregate daily revenue into a reporting table';

const SOURCE_CHIP: Record<AiGenerateSource, { label: string; cls: string }> = {
  live: {
    label: 'AI · live',
    cls: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300',
  },
  cached: {
    label: 'AI · cached',
    cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  },
  fallback: {
    label: 'Catalog template',
    cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  },
};

export default function AiBuildSection({
  seedPrompt,
  canBuild,
  isReadOnly,
  draft,
  draftReview,
  isAccepting,
  onApply,
  onAccept,
  onUndo,
  onOpenClassicWizard,
}: AiBuildSectionProps) {
  const [prompt, setPrompt] = useState(seedPrompt ?? '');
  const [refineText, setRefineText] = useState('');
  const [showRefine, setShowRefine] = useState(false);
  const { generate, status } = useAiPipelineGenerate();
  const busy = status === 'generating';
  const blocked = !canBuild || isReadOnly;

  // Adopt a late-arriving seed (AI fork sets the seed then flips the tab).
  useEffect(() => {
    if (seedPrompt && !draft) setPrompt(seedPrompt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedPrompt]);

  const runGenerate = async (effectivePrompt: string, bust = false) => {
    const text = effectivePrompt.trim();
    if (!text || busy || blocked) return;
    const result = await generate(text, { bust });
    if (!result) return; // superseded by a newer run
    if (result.nodes.length === 0) {
      toast.error('The AI returned no blocks — try rephrasing your goal.');
      return;
    }
    if (result.droppedEdges > 0) {
      toast(
        `Trimmed ${result.droppedEdges} extra connection${result.droppedEdges === 1 ? '' : 's'} that exceeded a block's input capacity.`,
        { icon: '⚠️', duration: 4500 },
      );
    }
    if (result.source === 'fallback') {
      toast(
        `AI offline — built from a catalog template (${result.fallbackReason}). Configure each block, or Refine to retry.`,
        { icon: '🛟', duration: 4500 },
      );
    }
    onApply(result.nodes, result.edges, text, result.source, result.fallbackReason);
    setShowRefine(false);
    setRefineText('');
  };

  const handleRefine = async () => {
    if (!draft || !refineText.trim()) return;
    // Keep the original intent as context; bust the cache so the model
    // actually re-runs with the refinement.
    await runGenerate(`${draft.prompt}\n\nRefine the pipeline: ${refineText.trim()}`, true);
  };

  const missingTotal = draftReview.reduce((n, r) => n + r.missingParams.length, 0);

  // ── Review state — a draft is on the canvas ──────────────────────────────
  if (draft) {
    const chip = SOURCE_CHIP[draft.source];
    return (
      <div className="space-y-3" data-testid="ai-build-review">
        <div className="rounded-lg border border-violet-200 bg-white dark:border-violet-900/50 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              <Wand2 className="h-4 w-4 shrink-0 text-violet-500" aria-hidden />
              <p className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
                AI draft on canvas
              </p>
            </div>
            <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', chip.cls)}>
              {chip.label}
            </span>
          </div>

          <div className="px-3 py-2">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {draft.nodeIds.length} block{draft.nodeIds.length === 1 ? '' : 's'} ·{' '}
              {draft.edgeIds.length} connection{draft.edgeIds.length === 1 ? '' : 's'} added
              {missingTotal > 0 ? (
                <span className="text-amber-600 dark:text-amber-400">
                  {' '}· {missingTotal} param{missingTotal === 1 ? '' : 's'} need attention
                </span>
              ) : (
                <span className="text-emerald-600 dark:text-emerald-400"> · all params set</span>
              )}
            </p>
            <p className="mt-1 line-clamp-2 text-[11px] italic text-slate-400 dark:text-slate-500" title={draft.prompt}>
              “{draft.prompt}”
            </p>
          </div>

          {/* Per-block review list. Clicking a row is not needed — the blocks
              are already selected on the canvas; configuring one there clears
              its missing-param flag here live. */}
          <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
            {draftReview.map((row) => (
              <li key={row.id} className="flex items-start gap-2 px-3 py-2">
                <span
                  className={cn(
                    'mt-1 h-2 w-2 shrink-0 rounded-full',
                    row.missingParams.length > 0 ? 'bg-amber-500' : 'bg-emerald-500',
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">
                    {row.label}
                  </p>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">{row.type}</p>
                  {row.missingParams.length > 0 && (
                    <p className="mt-0.5 flex items-start gap-1 text-[10px] text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="mt-px h-3 w-3 shrink-0" aria-hidden />
                      <span>
                        Missing: {row.missingParams.join(', ')} — click the block on the canvas to
                        fill it.
                      </span>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center gap-2 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
            <button
              type="button"
              onClick={() => void onAccept()}
              disabled={blocked || isAccepting || busy}
              title={blocked ? 'You need workflow create/edit permission' : 'Keep these blocks and save them as workflow steps'}
              className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isAccepting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : (
                <Check className="h-3.5 w-3.5" aria-hidden />
              )}
              Accept all
            </button>
            <button
              type="button"
              onClick={onUndo}
              disabled={isAccepting || busy}
              title="Remove the AI-built blocks from the canvas"
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Undo2 className="h-3.5 w-3.5" aria-hidden />
              Undo
            </button>
            <button
              type="button"
              onClick={() => setShowRefine((v) => !v)}
              disabled={isAccepting || busy || blocked}
              title="Adjust the prompt and regenerate (replaces this draft)"
              className={cn(
                'inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                showRefine
                  ? 'border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-violet-900/30 dark:text-violet-300'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800',
              )}
            >
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
              Refine
            </button>
          </div>

          {showRefine && (
            <div className="space-y-2 border-t border-slate-100 px-3 py-2 dark:border-slate-800">
              <textarea
                value={refineText}
                onChange={(e) => setRefineText(e.target.value)}
                rows={2}
                placeholder="e.g. add a dedup step before the aggregate, write to REPORTING schema"
                aria-label="Refinement instructions"
                className="w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={() => void handleRefine()}
                disabled={!refineText.trim() || busy}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                )}
                {busy ? 'Rebuilding…' : 'Regenerate draft'}
              </button>
            </div>
          )}
        </div>

        <ClassicWizardLink onOpen={onOpenClassicWizard} />
      </div>
    );
  }

  // ── Prompt state — no draft yet ───────────────────────────────────────────
  return (
    <div className="space-y-3" data-testid="ai-build-prompt">
      <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
          Build with AI — straight onto the canvas
        </p>
        <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
          Describe the pipeline you want. The AI adds the blocks and connections directly to the
          canvas as a draft you can accept, undo or refine — no steps, no popups.
        </p>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          placeholder={EXAMPLE_PROMPT}
          aria-label="Describe the pipeline to build"
          disabled={busy}
          className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-violet-400 focus:outline-none focus:ring-1 focus:ring-violet-400 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
        />
        <button
          type="button"
          onClick={() => void runGenerate(prompt)}
          disabled={!prompt.trim() || busy || blocked}
          title={
            blocked
              ? 'You need workflow create/edit permission to build with AI'
              : 'Generate the pipeline blocks onto the canvas'
          }
          data-testid="ai-build-generate"
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          ) : (
            <Sparkles className="h-4 w-4" aria-hidden />
          )}
          {busy ? 'Building blocks…' : 'Generate on canvas'}
        </button>
        {!prompt.trim() && !busy && (
          <button
            type="button"
            onClick={() => setPrompt(EXAMPLE_PROMPT)}
            className="mt-1.5 text-[10px] text-violet-500 underline-offset-2 hover:underline dark:text-violet-400"
          >
            Use an example prompt
          </button>
        )}
      </div>

      <ClassicWizardLink onOpen={onOpenClassicWizard} />
    </div>
  );
}

function ClassicWizardLink({ onOpen }: { onOpen: () => void }) {
  return (
    <p className="px-1 text-[10px] text-slate-400 dark:text-slate-500">
      Prefer a guided flow?{' '}
      <button
        type="button"
        onClick={onOpen}
        className="font-medium text-violet-500 underline-offset-2 hover:underline dark:text-violet-400"
      >
        Open the classic step-by-step wizard
      </button>
    </p>
  );
}
