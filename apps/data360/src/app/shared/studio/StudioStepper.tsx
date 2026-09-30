'use client';

/**
 * StudioStepper — the guided shape the product uses instead of a long
 * scrolling form: one question at a time, the road visible on the left,
 * Back and Continue at the bottom.
 *
 * Why it exists: a screen that stacks every choice vertically makes the
 * reader scroll to discover what is even being asked, and hides the
 * primary action below the fold. A step rail answers three questions at a
 * glance — where am I, what is left, what did I already settle — and the
 * content area only ever holds the current decision.
 *
 * A step may declare itself incomplete (`canContinue: false`) with the
 * reason shown next to the disabled Continue, never as a hover tooltip.
 */

import type { ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';

export interface StepDef {
  id: string;
  /** Short label for the rail — 1-3 words. */
  label: string;
  /** The question this step answers, shown as the content title. */
  title: string;
  /** One sentence under the title. */
  subtitle?: string;
  content: ReactNode;
  /** false ⇒ Continue is disabled and `blockedReason` is shown. */
  canContinue?: boolean;
  blockedReason?: string;
  /** Right-hand summary next to Continue, e.g. "2 kept". */
  tally?: string;
}

export default function StudioStepper({
  steps,
  current,
  onStep,
  onFinish,
  finishLabel = 'Finish',
  className,
}: {
  steps: StepDef[];
  /** index of the visible step */
  current: number;
  onStep: (index: number) => void;
  /** called from the LAST step's primary button */
  onFinish?: () => void;
  finishLabel?: string;
  className?: string;
}) {
  const i = Math.min(Math.max(current, 0), steps.length - 1);
  const step = steps[i];
  const last = i === steps.length - 1;
  const canGo = step?.canContinue !== false;

  return (
    <section
      className={`grid grid-cols-1 gap-3 md:grid-cols-[220px,1fr] ${className ?? ''}`}
      aria-label="Guided steps"
    >
      {/* the road: where I am, what is left, what is settled */}
      <nav
        aria-label="Steps"
        className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
      >
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {i + 1} <span className="font-normal text-slate-400">of {steps.length}</span>
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {steps.length - i - 1 === 0 ? 'last step' : `${steps.length - i - 1} to go`}
        </p>
        <ol className="mt-2.5 space-y-0.5">
          {steps.map((s, n) => {
            const done = n < i;
            const here = n === i;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onStep(n)}
                  disabled={n > i}
                  aria-current={here ? 'step' : undefined}
                  className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:cursor-default ${
                    here
                      ? 'bg-accent-50 font-medium text-accent-800 dark:bg-accent-900/20 dark:text-accent-200'
                      : done
                        ? 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
                        : 'text-slate-400 dark:text-slate-600'
                  }`}
                >
                  <span
                    aria-hidden
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${
                      done
                        ? 'bg-emerald-500 text-white'
                        : here
                          ? 'bg-accent-600 text-white'
                          : 'border border-slate-200 text-slate-400 dark:border-slate-700'
                    }`}
                  >
                    {done ? <Check className="h-3 w-3" /> : n + 1}
                  </span>
                  <span className="min-w-0 truncate">{s.label}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* one decision at a time */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{step?.title}</h3>
        {step?.subtitle && (
          <p className="mt-0.5 text-[13px] text-slate-500 dark:text-slate-400">{step.subtitle}</p>
        )}
        <div className="mt-3">{step?.content}</div>

        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
          <button
            type="button"
            disabled={i === 0}
            onClick={() => onStep(i - 1)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-700 hover:border-slate-300 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
          >
            <ArrowLeft aria-hidden className="h-3.5 w-3.5" />
            Back
          </button>
          <span className="ml-auto flex items-center gap-3">
            {!canGo && step?.blockedReason && (
              <span className="text-[13px] text-slate-500 dark:text-slate-400">
                {step.blockedReason}
              </span>
            )}
            {step?.tally && (
              <span className="text-[13px] text-slate-500 dark:text-slate-400">{step.tally}</span>
            )}
            <button
              type="button"
              disabled={!canGo}
              onClick={() => (last ? onFinish?.() : onStep(i + 1))}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3.5 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            >
              {last ? finishLabel : 'Continue'}
              {!last && <ArrowRight aria-hidden className="h-3.5 w-3.5" />}
            </button>
          </span>
        </div>
      </div>
    </section>
  );
}

/**
 * PickList — the « listing to help select » that replaces a long list of
 * cards: a search box over the options, each rendered compactly, with the
 * count of what is kept. Selection is multi by default.
 */
export function PickList<T>({
  items,
  keyOf,
  labelOf,
  detailOf,
  selected,
  onToggle,
  query,
  onQuery,
  emptyNote,
  columns = 2,
}: {
  items: T[];
  keyOf: (t: T) => string;
  labelOf: (t: T) => string;
  detailOf?: (t: T) => string | undefined;
  selected: Set<string>;
  onToggle: (key: string) => void;
  query: string;
  onQuery: (q: string) => void;
  emptyNote?: string;
  columns?: 1 | 2;
}) {
  const q = query.trim().toLowerCase();
  const shown = q
    ? items.filter((t) =>
        `${labelOf(t)} ${detailOf?.(t) ?? ''}`.toLowerCase().includes(q),
      )
    : items;
  return (
    <div>
      {items.length > 6 && (
        <input
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder="Search to narrow the list"
          aria-label="Search the options"
          className="mb-2 h-8 w-full max-w-sm rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />
      )}
      {shown.length === 0 ? (
        <p className="text-[13px] text-slate-500 dark:text-slate-400">
          {q ? `Nothing matches « ${query} ».` : (emptyNote ?? 'Nothing to choose from.')}
        </p>
      ) : (
        <div
          className={`grid grid-cols-1 gap-1.5 ${columns === 2 ? 'sm:grid-cols-2' : ''}`}
          role="group"
        >
          {shown.map((t) => {
            const k = keyOf(t);
            const on = selected.has(k);
            const detail = detailOf?.(t);
            return (
              <button
                key={k}
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => onToggle(k)}
                className={`rounded-lg border p-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                  on
                    ? 'border-accent-500 bg-accent-50/60 dark:border-accent-600 dark:bg-accent-900/20'
                    : 'border-slate-200 hover:border-slate-300 dark:border-slate-700'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden
                    className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${
                      on
                        ? 'border-accent-600 bg-accent-600 text-white'
                        : 'border-slate-300 dark:border-slate-600'
                    }`}
                  >
                    {on && <Check className="h-3 w-3" />}
                  </span>
                  <span className="min-w-0 truncate text-[13px] font-medium text-slate-900 dark:text-slate-100">
                    {labelOf(t)}
                  </span>
                </span>
                {detail && (
                  <span className="mt-0.5 block text-xs leading-snug text-slate-600 dark:text-slate-300">
                    {detail}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
