'use client';

/**
 * CortexAssistantPanel — the catalog right-bar's default landing (mockup
 * catalog64, region 5). Shown by ContextRightBar (via `emptyOverride`) when no
 * table is selected in the CATALOG view.
 *
 * Three blocks, all wired to EXISTING flows (nothing rebuilt):
 *  a) Smart Suggestions — real counts computed by the page from data it has
 *     already fetched (tables without PK, tables with no relationship, PII
 *     signals). A null count renders an honest "—" row, never a fake 0.
 *  b) "Ask anything about your data…" — hands off to the existing COCO draft
 *     flow (POST /cortex/coco/draft) by embedding the shared CocoDraftsPanel
 *     with the typed question as its initial intent.
 *  c) Quick chips (Lineage · DQ Check · Impact · Cost) — switch the right-bar
 *     sections via the same onTabChange the icon rail uses.
 */

import React, { useState } from 'react';
import {
  Sparkles, ArrowRight, Send, GitBranch, BarChart3, AlertTriangle, Coins,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import CocoDraftsPanel from '@/app/shared/chat/CocoDraftsPanel';

export interface CortexSuggestion {
  id: string;
  severity: 'high' | 'medium' | 'ok' | 'unknown';
  /** One line. Counts inside must come from already-fetched page data. */
  text: string;
}

const SEVERITY_DOT: Record<CortexSuggestion['severity'], string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  ok: 'bg-emerald-500',
  unknown: 'bg-slate-300 dark:bg-slate-600',
};

export type CortexChip = 'lineage' | 'dq' | 'impact' | 'cost';

const CHIPS: { id: CortexChip; label: string; icon: React.ElementType }[] = [
  { id: 'lineage', label: 'Lineage', icon: GitBranch },
  { id: 'dq', label: 'DQ Check', icon: BarChart3 },
  { id: 'impact', label: 'Impact', icon: AlertTriangle },
  { id: 'cost', label: 'Cost', icon: Coins },
];

export interface CortexAssistantPanelProps {
  suggestions: CortexSuggestion[];
  /** Opens the right bar's AI section (existing recommendations home). */
  onViewRecommendations: () => void;
  /** Chip → right-bar section switch (page maps chip → RightBarTab). */
  onChip: (chip: CortexChip) => void;
  /** Comma-separated FQNs to ground COCO drafts on (already-loaded tables). */
  draftTablesSeed?: string;
}

export default function CortexAssistantPanel({
  suggestions, onViewRecommendations, onChip, draftTablesSeed,
}: CortexAssistantPanelProps) {
  const [question, setQuestion] = useState('');
  // When the user submits a question, the EXISTING CocoDraftsPanel takes over
  // this landing (its Back arrow returns here) — one flow, zero duplication.
  const [draftIntent, setDraftIntent] = useState<string | null>(null);

  if (draftIntent !== null) {
    return (
      <div className="h-full min-h-0 flex flex-col">
        <CocoDraftsPanel
          onBack={() => setDraftIntent(null)}
          initialIntent={draftIntent}
          initialTables={draftTablesSeed}
        />
      </div>
    );
  }

  const ask = () => {
    setDraftIntent(question.trim());
  };

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="cortex-assistant-panel">
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-violet-600 to-indigo-600 text-white">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">AI Assistant</h4>
            <p className="text-[10px] text-slate-400">Cortex · grounded on your live catalog</p>
          </div>
        </div>

        {/* a) Smart Suggestions — real counts from already-fetched signals. */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Smart suggestions</span>
          </div>
          <ul className="space-y-1.5">
            {suggestions.map((s) => (
              <li key={s.id} className="flex items-start gap-2">
                <span aria-hidden className={cn('mt-1 h-2 w-2 shrink-0 rounded-full', SEVERITY_DOT[s.severity])} />
                <span className="text-[11px] leading-snug text-slate-600 dark:text-slate-300">{s.text}</span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onViewRecommendations}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            View recommendations
            <ArrowRight className="h-3 w-3" />
          </button>
        </div>

        {/* b) Ask — hands off to the existing COCO draft flow. */}
        <form
          onSubmit={(e) => { e.preventDefault(); ask(); }}
          className="rounded-xl border border-slate-200 dark:border-slate-700 p-2.5 space-y-1.5"
        >
          <div className="relative">
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask anything about your data…"
              aria-label="Ask the AI assistant about your data"
              className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-3 pr-9 text-xs text-slate-900 placeholder-slate-400 focus:border-indigo-500 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
            />
            <button
              type="submit"
              aria-label="Send question to COCO drafts"
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30"
            >
              <Send className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-[10px] text-slate-400">
            COCO drafts an answer (SQL / chart / pipeline) and tests it on real data.
          </p>
        </form>

        {/* c) Quick chips → right-bar sections. */}
        <div className="flex flex-wrap gap-1.5">
          {CHIPS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => onChip(id)}
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-indigo-900/30 dark:hover:text-indigo-300"
            >
              <Icon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-slate-200 px-3 py-2 dark:border-slate-800">
        <p className="text-center text-[10px] text-slate-400">Powered by Cortex · Governed by Data360</p>
      </div>
    </div>
  );
}
