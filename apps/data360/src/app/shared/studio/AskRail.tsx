'use client';

/**
 * AskRail — the single AI right rail (Data360 Lite rule #4).
 *
 * This is THE unique right-tab panel targeted by ALL pages: one intent-titled
 * header ("Ask about your tables"), the fixed law subtitle
 * "Nothing changes until you accept it.", suggested-question chips, and a
 * bottom input whose cost is stated explicitly next to it. Existing pages
 * (RightTabPanel & friends) will migrate onto this component.
 *
 * Pure presentation — NO fetch, no apiClient. The AI wiring arrives later
 * through the secured /cortex contracts (S0); until a page passes `onAsk`,
 * the input renders disabled with "Ask arrives with the next slice".
 */

import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { ChevronsLeft, ChevronsRight, Send, Sparkles } from 'lucide-react';

export interface AskRailSuggestion {
  id: string;
  label: string;
  onPick?: () => void;
}

export interface AskRailProps {
  /** Intent-phrased title, e.g. "Ask about your tables". */
  title: string;
  /** Suggested-question chips (picking one is free — no credit). */
  suggestions: AskRailSuggestion[];
  /** Explicit cost line rendered under the input, e.g. "Writing a request costs 1 credit. Picking a table from the list above costs nothing." */
  costNote?: string;
  /** Handler for a free-text ask. Absent → input disabled ("Ask arrives with the next slice"). */
  onAsk?: (text: string) => void;
  /** Contextual content shown in the scrollable middle zone (selection details, answers…). */
  context?: ReactNode;
  className?: string;
}

const LAW_SUBTITLE = 'Nothing changes until you accept it.';
const EMPTY_HINT =
  'Pick a question below, click any item on the left, or write what you want changed.';

export default function AskRail({
  title,
  suggestions,
  costNote,
  onAsk,
  context,
  className,
}: AskRailProps) {
  const [text, setText] = useState('');
  // Réduisible (user directive): the rail never imposes itself — one click
  // collapses it to a slim strip; the page keeps the width.
  const [collapsed, setCollapsed] = useState(false);
  const askEnabled = typeof onAsk === 'function';

  const submit = () => {
    if (!askEnabled) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    onAsk?.(trimmed);
    setText('');
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      submit();
    }
  };

  if (collapsed) {
    return (
      <aside
        role="complementary"
        aria-label={title}
        className={`flex w-9 shrink-0 flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white py-2 dark:border-slate-700 dark:bg-slate-900 ${className ?? ''}`}
      >
        <button
          type="button"
          onClick={() => setCollapsed(false)}
          title={`${title} — open`}
          aria-label={`${title} — open`}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
        >
          <ChevronsLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <Sparkles className="h-3.5 w-3.5 text-accent-600" aria-hidden="true" />
      </aside>
    );
  }

  return (
    <aside
      role="complementary"
      aria-label={title}
      className={`flex w-[300px] shrink-0 flex-col rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 ${className ?? ''}`}
    >
      {/* Header: intent title + fixed law subtitle */}
      <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-accent-600" aria-hidden="true" />
          <h2 className="text-[13px] font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h2>
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            title="Collapse"
            aria-label="Collapse the panel"
            className="ml-auto rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800"
          >
            <ChevronsRight className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{LAW_SUBTITLE}</p>
      </div>

      {/* Context zone — an empty panel says its one line at the top and
          stops; it never reserves half a screen of blank space. */}
      <div className="overflow-y-auto px-3 py-2">
        {context ?? (
          <p className="text-[13px] leading-relaxed text-slate-500 dark:text-slate-400">
            {EMPTY_HINT}
          </p>
        )}
      </div>

      {/* Suggested-question chips */}
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1 px-3 pb-2">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              type="button"
              onClick={suggestion.onPick}
              className="rounded-full border border-slate-200 px-2 py-1 text-xs leading-4 text-slate-600 hover:border-accent-300 hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-300 dark:hover:border-accent-500 dark:hover:text-accent-400"
            >
              {suggestion.label}
            </button>
          ))}
        </div>
      )}

      {/* Footer. A free-text ask this page cannot answer is NOT rendered as
          a disabled field with the reason hidden in a tooltip — the panel
          says so in a visible sentence and offers only what works. */}
      <div className="border-t border-slate-100 px-3 py-2 dark:border-slate-800">
        {askEnabled ? (
          <>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={text}
                onChange={(event) => setText(event.target.value)}
                onKeyDown={onInputKeyDown}
                placeholder="Write what you want changed…"
                aria-label="Write your request"
                className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[13px] text-slate-900 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
              />
              <button
                type="button"
                onClick={submit}
                title="Send"
                aria-label="Send"
                className="shrink-0 rounded-lg bg-accent-600 p-1.5 text-white hover:bg-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              >
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
            {costNote && (
              <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">{costNote}</p>
            )}
          </>
        ) : (
          <p className="text-[13px] text-slate-500 dark:text-slate-400">
            {suggestions.length > 0
              ? 'Use a question above — writing your own request is not available on this step yet.'
              : 'Writing your own request is not available on this step yet.'}
          </p>
        )}
      </div>
    </aside>
  );
}
