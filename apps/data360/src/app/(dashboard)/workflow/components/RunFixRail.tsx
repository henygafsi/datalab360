'use client';

/**
 * RunFixRail — a docked, explore-design-style right rail that turns a failed
 * (or successful) workflow run into a visual, fixable story:
 *
 *   • a vertical STEP-FLOW timeline (one row per step, color-coded by status)
 *   • a per-step failure detail with the exact Snowflake error
 *   • call-to-action buttons: "Open block" (jump to that node's config) and a
 *     one-click "Apply fix" when the rail can derive a deterministic patch
 *   • an AI tab wired to the live Cortex run-analysis (advise), with a parser
 *     that extracts a concrete repoint suggestion → "Apply fix" (advise+apply)
 *
 * It is intentionally self-contained and presentational: the parent owns all
 * data + the mutating handlers, so this never reaches into workflow state.
 */

import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  X, AlertCircle, CheckCircle2, Circle, Loader2, Sparkles, Settings,
  Wrench, ListChecks, ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export interface RunFixStep {
  step_id?: string;
  node_id?: string;
  status?: string;
  error?: unknown;
  action_type?: string;
  step_order?: number;
  _label?: string;
  _order?: number;
  [k: string]: unknown;
}

/** A deterministic patch the rail can apply to a node's config. */
export interface RunFixSuggestion {
  nodeId: string;
  label: string;
  /** Human description, e.g. "Repoint source to CP_DATA360.PUBLIC.ORDERS". */
  description: string;
  patch: Record<string, unknown>;
}

interface RunFixRailProps {
  open: boolean;
  onClose: () => void;
  /** All steps of the last run, normalized across engines. */
  steps: RunFixStep[];
  /** Overall run status. */
  runStatus?: string;
  /** Resolve a readable error string (parent owns the shared util). */
  extractError: (e: unknown) => string;
  /** Jump to a node's config form on the canvas. */
  onOpenBlock: (nodeId: string) => void;
  /** Apply a deterministic config patch to a node. Returns true if applied. */
  onApplyPatch: (nodeId: string, patch: Record<string, unknown>) => boolean;
  /** Trigger the live Cortex run-analysis; parent sets aiText/aiLoading. */
  onAskAi: () => void;
  aiText: string | null;
  aiLoading: boolean;
  /** Optional deterministic suggestions derived by the parent (e.g. repoint). */
  suggestions?: RunFixSuggestion[];
}

type RailTab = 'steps' | 'ai';

function statusKind(status?: string): 'failed' | 'completed' | 'running' | 'pending' {
  if (status === 'failed' || status === 'error') return 'failed';
  if (status === 'completed' || status === 'success') return 'completed';
  if (status === 'running') return 'running';
  return 'pending';
}

const DOT: Record<string, string> = {
  failed: 'text-red-500',
  completed: 'text-green-500',
  running: 'text-blue-500',
  pending: 'text-slate-300 dark:text-slate-600',
};

export default function RunFixRail({
  open, onClose, steps, runStatus, extractError,
  onOpenBlock, onApplyPatch, onAskAi, aiText, aiLoading, suggestions = [],
}: RunFixRailProps) {
  const [tab, setTab] = useState<RailTab>('steps');
  const [selectedStepId, setSelectedStepId] = useState<string | null>(null);

  const failedCount = useMemo(
    () => steps.filter((s) => statusKind(s.status) === 'failed').length,
    [steps],
  );

  // Auto-select the first failed step so the detail opens on what matters.
  const firstFailedId = useMemo(() => {
    const f = steps.find((s) => statusKind(s.status) === 'failed');
    return f?.step_id || f?.node_id || null;
  }, [steps]);

  const activeStepId = selectedStepId ?? firstFailedId;
  const activeStep = useMemo(
    () => steps.find((s) => (s.step_id || s.node_id) === activeStepId) || null,
    [steps, activeStepId],
  );

  const suggestionFor = (nodeId?: string) =>
    suggestions.find((s) => s.nodeId === nodeId);

  return (
    <AnimatePresence>
      {open && (
        <motion.aside
          key="run-fix-rail"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 380, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
          className="h-full shrink-0 overflow-hidden border-l border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 flex flex-col"
          role="complementary"
          aria-label="Run diagnostics and fix"
        >
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <div className="flex items-center gap-2 min-w-0">
              <span className={cn(
                'h-2 w-2 shrink-0 rounded-full',
                failedCount > 0 ? 'bg-red-500' : runStatus === 'completed' ? 'bg-green-500' : 'bg-slate-400',
              )} />
              <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                {failedCount > 0 ? `Run failed — ${failedCount} step${failedCount > 1 ? 's' : ''}` : 'Run diagnostics'}
              </h2>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
              aria-label="Close diagnostics"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Tabs */}
          <div className="flex shrink-0 border-b border-slate-200 dark:border-slate-700">
            {([
              { id: 'steps', label: 'Steps', icon: ListChecks },
              { id: 'ai', label: 'AI fix', icon: Sparkles },
            ] as const).map((t) => (
              <button
                key={t.id}
                onClick={() => { setTab(t.id); if (t.id === 'ai' && !aiText && !aiLoading) onAskAi(); }}
                className={cn(
                  'flex flex-1 items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors',
                  tab === t.id
                    ? 'border-b-2 border-violet-500 text-violet-600 dark:text-violet-400'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
                )}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            ))}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {tab === 'steps' && (
              <div className="flex flex-col">
                {/* Vertical step-flow timeline */}
                <ol className="px-3 py-3 space-y-0.5">
                  {steps.map((s, i) => {
                    const id = s.step_id || s.node_id || String(i);
                    const kind = statusKind(s.status);
                    const label = s._label || s.action_type || s.step_id || `Step ${s.step_order ?? i + 1}`;
                    const isActive = id === activeStepId;
                    return (
                      <li key={id}>
                        <button
                          onClick={() => setSelectedStepId(id)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors',
                            isActive ? 'bg-slate-100 dark:bg-slate-800' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                          )}
                        >
                          {kind === 'failed' ? <AlertCircle className={cn('h-3.5 w-3.5 shrink-0', DOT.failed)} />
                            : kind === 'completed' ? <CheckCircle2 className={cn('h-3.5 w-3.5 shrink-0', DOT.completed)} />
                            : kind === 'running' ? <Loader2 className={cn('h-3.5 w-3.5 shrink-0 animate-spin', DOT.running)} />
                            : <Circle className={cn('h-3.5 w-3.5 shrink-0', DOT.pending)} />}
                          <span className="text-[10px] font-mono tabular-nums text-slate-400">{s.step_order ?? i + 1}</span>
                          <span className="truncate font-medium text-slate-700 dark:text-slate-200">{label}</span>
                          {kind === 'failed' && <ChevronRight className="ml-auto h-3.5 w-3.5 text-slate-400" />}
                        </button>
                      </li>
                    );
                  })}
                  {steps.length === 0 && (
                    <li className="px-2 py-8 text-center text-xs text-slate-400">
                      No step results yet. Run the workflow to see per-step status.
                    </li>
                  )}
                </ol>

                {/* Selected-step detail */}
                {activeStep && statusKind(activeStep.status) === 'failed' && (
                  <div className="border-t border-slate-200 dark:border-slate-700 p-3 space-y-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400">
                      <Wrench className="h-3.5 w-3.5" />
                      {activeStep._label || activeStep.action_type || 'Failed step'}
                    </div>
                    {activeStep.error != null && (
                      <pre className="max-h-40 overflow-auto rounded-md bg-red-50 p-2 font-mono text-[11px] leading-snug text-red-700 whitespace-pre-wrap break-words dark:bg-red-900/15 dark:text-red-300">
                        {extractError(activeStep.error)}
                      </pre>
                    )}

                    {/* One-click deterministic fix when available */}
                    {(() => {
                      const nodeId = (activeStep.node_id || activeStep.step_id) as string | undefined;
                      const sug = suggestionFor(nodeId);
                      return (
                        <div className="flex flex-wrap gap-1.5">
                          {sug && (
                            <button
                              onClick={() => onApplyPatch(sug.nodeId, sug.patch)}
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                              title={sug.description}
                            >
                              <Wrench className="h-3 w-3" />
                              Apply fix
                            </button>
                          )}
                          {nodeId && (
                            <button
                              onClick={() => onOpenBlock(nodeId)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              <Settings className="h-3 w-3" />
                              Open block
                            </button>
                          )}
                          <button
                            onClick={() => { setTab('ai'); if (!aiText && !aiLoading) onAskAi(); }}
                            className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-violet-700"
                          >
                            <Sparkles className="h-3 w-3" />
                            Ask AI
                          </button>
                        </div>
                      );
                    })()}
                    {suggestionFor(activeStep.node_id || activeStep.step_id) && (
                      <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                        {suggestionFor(activeStep.node_id || activeStep.step_id)!.description}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {tab === 'ai' && (
              <div className="p-3 space-y-3">
                <button
                  onClick={onAskAi}
                  disabled={aiLoading}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  {aiLoading ? 'Analyzing…' : aiText ? 'Re-analyze with AI' : 'Analyze this run with AI'}
                </button>

                {/* Deterministic suggestions surfaced as apply buttons. */}
                {suggestions.length > 0 && (
                  <div className="space-y-1.5">
                    {suggestions.map((s) => (
                      <div key={s.nodeId} className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-2.5 dark:border-emerald-800 dark:bg-emerald-900/10">
                        <div className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">{s.label}</div>
                        <p className="mt-0.5 text-[11px] text-emerald-700 dark:text-emerald-400">{s.description}</p>
                        <div className="mt-1.5 flex gap-1.5">
                          <button
                            onClick={() => onApplyPatch(s.nodeId, s.patch)}
                            className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-emerald-700"
                          >
                            <Wrench className="h-3 w-3" /> Apply fix
                          </button>
                          <button
                            onClick={() => onOpenBlock(s.nodeId)}
                            className="inline-flex items-center gap-1 rounded-md border border-emerald-300 px-2 py-1 text-[10px] font-semibold text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/30"
                          >
                            <Settings className="h-3 w-3" /> Review
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {aiText != null && (
                  <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-3 dark:border-violet-800 dark:bg-violet-900/10">
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-violet-700 dark:text-violet-300">
                      <Sparkles className="h-3.5 w-3.5" /> AI Analysis &amp; Fix
                    </div>
                    <div className="whitespace-pre-wrap text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                      {aiText}
                    </div>
                  </div>
                )}

                {aiText == null && !aiLoading && (
                  <p className="py-4 text-center text-xs text-slate-400">
                    Ask AI to read the run logs and propose a root-cause + fix.
                  </p>
                )}
              </div>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
