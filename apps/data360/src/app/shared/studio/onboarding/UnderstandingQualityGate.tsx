'use client';

/**
 * UnderstandingQualityGate — the QUALITY verdict, inside the Understanding step.
 *
 * WHY IT EXISTS. The product's spine is understand → quality → model →
 * visualize and control → act, and the onboarding journey went Need → Sources →
 * Understanding → Preview: quality was missing from the path the user actually
 * walks. Worse, the Understanding step's own copy already PROMISES it — "one
 * analysis run profiles them AND runs the sample quality checks (keys,
 * duplicates, nulls) in the same pass" — so the checks were being run, and their
 * verdict was never shown. Measured on a real application: the gate was
 * `blocked` on 302 orphan rows and the user could walk past it into Preview
 * without ever being told.
 *
 * COST DISCIPLINE. Reading the stored verdict is FREE (a GET, ~0.7s measured),
 * so it happens on mount. RE-RUNNING the gate costs time and warehouse work
 * (16s+ on big tables), so it is never automatic — it is a button that says so.
 * That split is the same one the scan options use, and it is what lets a page
 * be informative without quietly spending.
 *
 * It never invents a verdict: a gate that has not run says "not measured yet"
 * rather than showing a reassuring green.
 */

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, ShieldAlert, ShieldCheck, ShieldQuestion } from 'lucide-react';

import { getDqChecks, type DqChecksView } from '@/app/services/studio/activation';
import { runDqGate } from '@/app/services/studio/studio-api';

type Verdict = 'blocked' | 'warn' | 'pass' | 'not_evaluated';

function readVerdict(v: DqChecksView | null): Verdict {
  const o = String(v?.overall ?? '').toLowerCase();
  if (o === 'blocked' || o === 'fail') return 'blocked';
  if (o === 'warn') return 'warn';
  if (o === 'pass') return 'pass';
  return 'not_evaluated';
}

const LOOK: Record<Verdict, { Icon: typeof ShieldAlert; tone: string; ring: string; word: string }> = {
  blocked: {
    Icon: ShieldAlert,
    tone: 'text-red-600 dark:text-red-400',
    ring: 'border-red-200 bg-red-50 dark:border-red-900/50 dark:bg-red-950/30',
    word: 'Something holds the model back',
  },
  warn: {
    Icon: ShieldQuestion,
    tone: 'text-amber-700 dark:text-amber-400',
    ring: 'border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30',
    word: 'Usable, with reservations',
  },
  pass: {
    Icon: ShieldCheck,
    tone: 'text-emerald-700 dark:text-emerald-400',
    ring: 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30',
    word: 'The data holds up',
  },
  not_evaluated: {
    Icon: ShieldQuestion,
    tone: 'text-slate-600 dark:text-slate-300',
    ring: 'border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900',
    word: 'Quality not measured yet',
  },
};

export default function UnderstandingQualityGate({
  draftId,
  onOpenQuality,
}: {
  draftId: string;
  /** takes the reader to the full Quality page, where the actions live */
  onOpenQuality?: () => void;
}) {
  const [view, setView] = useState<DqChecksView | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [running, setRunning] = useState(false);

  const load = useCallback(async () => {
    try {
      setView(await getDqChecks(draftId));
      setState('ready');
    } catch {
      setState('error');
    }
  }, [draftId]);

  useEffect(() => {
    void load();
  }, [load]);

  const measure = useCallback(async () => {
    setRunning(true);
    try {
      await runDqGate(draftId);
      await load();
    } catch {
      setState('error');
    } finally {
      setRunning(false);
    }
  }, [draftId, load]);

  if (state === 'loading')
    return <div className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-hidden />;

  // A failed read must not read as "fine" — the step's copy promised these checks.
  if (state === 'error')
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        The quality verdict could not be read.{' '}
        <button type="button" onClick={() => void load()} className="font-medium underline decoration-dotted">
          retry
        </button>
      </p>
    );

  const verdict = readVerdict(view);
  const checks = view?.checks ?? [];
  const fails = checks.filter((c) => c.verdict === 'fail');
  const warns = checks.filter((c) => c.verdict === 'warn');
  const passes = checks.filter((c) => c.verdict === 'pass');
  const { Icon, tone, ring, word } = LOOK[verdict];

  return (
    <div className={`rounded-xl border p-3 ${ring}`}>
      <div className="flex flex-wrap items-center gap-2">
        <Icon aria-hidden className={`h-4 w-4 flex-shrink-0 ${tone}`} />
        <p className={`text-[13px] font-medium ${tone}`}>{word}</p>

        {/* the counts are the evidence — never a bare adjective */}
        {checks.length > 0 && (
          <span className="text-[12px] text-slate-600 dark:text-slate-400">
            {passes.length} passed
            {warns.length ? ` · ${warns.length} to watch` : ''}
            {fails.length ? ` · ${fails.length} to resolve` : ''}
            <span className="text-slate-400 dark:text-slate-500"> of {checks.length} checks</span>
          </span>
        )}

        <span className="ml-auto flex items-center gap-2">
          {/* re-measuring costs real work, so it says so and is never automatic */}
          <button
            type="button"
            onClick={() => void measure()}
            disabled={running}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-[12px] font-medium text-slate-700 hover:bg-white disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
          >
            {running ? <Loader2 aria-hidden className="h-3.5 w-3.5 animate-spin" /> : null}
            {checks.length ? 'Re-measure' : 'Measure quality'}
            <span className="text-slate-400 dark:text-slate-500">(runs checks)</span>
          </button>
          {onOpenQuality && checks.length > 0 ? (
            <button
              type="button"
              onClick={onOpenQuality}
              className="text-[12px] font-medium text-accent-700 underline decoration-dotted dark:text-accent-300"
            >
              See what to do
            </button>
          ) : null}
        </span>
      </div>

      {/* what actually fails, in one line each — the detail and the fixes live
          on the Quality page, this is the headline the journey owes the reader */}
      {fails.length > 0 && (
        <ul className="mt-2 space-y-0.5">
          {fails.slice(0, 3).map((c) => (
            <li key={c.id} className="text-[12px] text-red-700 dark:text-red-300">
              • {c.message ?? c.id}
            </li>
          ))}
          {fails.length > 3 ? (
            <li className="text-[12px] text-slate-500 dark:text-slate-400">
              and {fails.length - 3} more
            </li>
          ) : null}
        </ul>
      )}

      {verdict === 'not_evaluated' && (
        <p className="mt-1 text-[12px] text-slate-500 dark:text-slate-400">
          Nothing has been checked against this data yet, so nothing here is a verdict — measuring
          takes a moment and tells you whether the model can be trusted before you build on it.
        </p>
      )}

      {verdict === 'pass' && checks.length > 0 && (
        <p className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 aria-hidden className="h-3.5 w-3.5" />
          Keys, duplicates, nulls and the relationships all held on the sample.
        </p>
      )}
    </div>
  );
}
