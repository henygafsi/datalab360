'use client';

/**
 * OnboardingFlow — the six-step Application Studio journey container.
 * Need → Sources → Understanding → Preview → Automation → Activation.
 *
 * One main decision per step; the draft is saved on every patch and
 * resumable. Invalidation is DEPENDENCY-AWARE only: changing the need
 * keeps the sources; changing the sources purges understanding + preview
 * (they were derived from the old selection) — never a full restart.
 * Preview/Automation/Activation are honest placeholders until their
 * generation contracts land — nothing is faked.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { PlainCard, PlainQuestionHeader, QuietAction } from '@/app/shared/studio/PlainKit';
import {
  loadJourneyDraftRemote,
  createJourneyDraftRemote,
  saveJourneyDraftRemote,
  newJourneyDraft,
  clearJourneyDraft,
  type JourneyDraft,
  type JourneyStep,
} from './journey';
import SourcesStep from './SourcesStep';
import UnderstandingStep from './UnderstandingStep';
import PreviewStep from './PreviewStep';
import AutomationStep from './AutomationStep';
import ActivationStep from './ActivationStep';

const STEPS: Array<{ id: JourneyStep; label: string }> = [
  { id: 'need', label: 'Need' },
  { id: 'sources', label: 'Sources' },
  { id: 'understanding', label: 'Understanding' },
  { id: 'preview', label: 'Preview' },
  { id: 'automation', label: 'Automation' },
  { id: 'activation', label: 'Activation' },
];

function StepRail({ current }: { current: JourneyStep }) {
  const idx = STEPS.findIndex((s) => s.id === current);
  /* The primary path ends at Understanding — « Looks right — open the
     application » opens the APPLICATION, where preview, automation and
     activation live as its views. The rail must not promise steps this wizard
     will not walk: past-understanding entries render as a separate « then in
     your application » note — unless a resumed draft is actually ON one of
     them (the legacy path), where the full rail stays truthful. */
  const JOURNEY_END = STEPS.findIndex((s) => s.id === 'understanding');
  const inTail = idx > JOURNEY_END;
  const shown = inTail ? STEPS : STEPS.slice(0, JOURNEY_END + 1);
  const tail = STEPS.slice(JOURNEY_END + 1);
  return (
    <ol className="flex flex-wrap items-center gap-1.5" aria-label="Journey progress">
      {shown.map((s, i) => {
        const state = i < idx ? 'done' : i === idx ? 'current' : 'upcoming';
        return (
          <li key={s.id} className="flex items-center gap-1.5">
            {i > 0 && <span className="h-px w-4 bg-slate-200 dark:bg-slate-700" aria-hidden />}
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                state === 'current'
                  ? 'bg-accent-600 text-white'
                  : state === 'done'
                    ? 'text-slate-600 dark:text-slate-300'
                    : 'text-slate-400 dark:text-slate-500'
              }`}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              {state === 'done' && <Check className="h-3 w-3 text-emerald-500" aria-hidden />}
              {s.label}
            </span>
          </li>
        );
      })}
      {!inTail && (
        <li className="flex items-center gap-1.5">
          <span className="h-px w-4 bg-slate-200 dark:bg-slate-700" aria-hidden />
          <span
            className="text-xs text-slate-400 dark:text-slate-500"
            title="These live inside the application once it opens — its Insights, Automation and Activation views. They are not steps of this wizard."
          >
            then in your application: {tail.map((t) => t.label).join(' · ')}
          </span>
        </li>
      )}
    </ol>
  );
}

function NeedStep({
  draft,
  onPatch,
  onNext,
  suggestions,
}: {
  draft: JourneyDraft;
  onPatch: (p: Partial<JourneyDraft>) => void;
  onNext: () => void;
  suggestions: string[];
}) {
  return (
    <div className="space-y-4">
      <PlainQuestionHeader
        question="What do you want to understand, track, detect or forecast?"
        detail="Say it in your own words — Data360 proposes, you decide."
      />
      <textarea
        value={draft.need.text}
        onChange={(e) => onPatch({ need: { ...draft.need, text: e.target.value } })}
        rows={3}
        placeholder="e.g. Which stores are losing money and why?"
        className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      />
      {suggestions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onPatch({ need: { ...draft.need, text: s } })}
              className="rounded-full border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400"
            >
              {s}
            </button>
          ))}
        </div>
      )}
      <button
        type="button"
        disabled={draft.need.text.trim().length < 3}
        onClick={onNext}
        className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Continue
      </button>
    </div>
  );
}

function PlaceholderStep({ title, body }: { title: string; body: string }) {
  return (
    <PlainCard title={title} description={body}>
      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
        This step activates with its generation contract — nothing here is faked.
      </p>
    </PlainCard>
  );
}

export default function OnboardingFlow({
  seed,
  suggestions = [],
  onExit,
}: {
  seed?: {
    needText?: string;
    domainId?: string;
    context?: import('./journey').NeedContext | null;
    step?: JourneyStep;
  };
  suggestions?: string[];
  onExit?: () => void;
}) {
  const [draft, setDraft] = useState<JourneyDraft>(() => newJourneyDraft(seed));
  const [resumable, setResumable] = useState<{ draftId: string; draft: JourneyDraft } | null>(null);
  // Backend persistence (no local business data): the draft is created
  // server-side on first meaningful patch and PUT-synced (debounced).
  const draftIdRef = useRef<string | null>(null);
  const syncTimer = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;
    void loadJourneyDraftRemote().then((existing) => {
      if (alive && existing) setResumable(existing);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const persist = useCallback((next: JourneyDraft) => {
    if (syncTimer.current) window.clearTimeout(syncTimer.current);
    syncTimer.current = window.setTimeout(() => {
      void (async () => {
        try {
          if (!draftIdRef.current) {
            draftIdRef.current = await createJourneyDraftRemote(next);
            if (draftIdRef.current) {
              // expose the backend draft id to the steps (understand/generate
              // pass it so preview limits count on this journey's draft)
              setDraft((d) => ({ ...d, draftId: draftIdRef.current }));
            }
          } else {
            await saveJourneyDraftRemote(draftIdRef.current, next);
          }
        } catch {
          /* transient — next patch retries; the journey keeps working */
        }
      })();
    }, 800);
  }, []);

  useEffect(
    () => () => {
      if (syncTimer.current) window.clearTimeout(syncTimer.current);
    },
    [],
  );

  const patch = useCallback(
    (p: Partial<JourneyDraft>) => {
      setDraft((prev) => {
        let next: JourneyDraft = { ...prev, ...p, need: { ...prev.need, ...(p.need ?? {}) } };
        // Dependency-aware invalidation: a SOURCES change invalidates what was
        // derived from the old selection — understanding + preview. A NEED
        // change invalidates nothing else.
        if (p.sources && JSON.stringify(p.sources.connectionIds) !== JSON.stringify(prev.sources.connectionIds)) {
          next = {
            ...next,
            understanding: { approvedPlanId: null, decisions: {} },
            preview: { reportDraftId: null },
          };
        }
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const go = useCallback(
    (step: JourneyStep) => {
      setDraft((prev) => {
        const next = { ...prev, step };
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const summary = useMemo(() => {
    const parts: string[] = [];
    const ctx = draft.need.context;
    if (ctx?.industry_id) {
      parts.push(
        `Context: ${[ctx.industry_id, ctx.category_id].filter(Boolean).join(' › ')}` +
          (ctx.hierarchy?.length ? ` · drill ${ctx.hierarchy.join(' → ')}` : ''),
      );
    }
    if (draft.need.text) parts.push(`Need: “${draft.need.text.slice(0, 80)}”`);
    if (draft.sources.connectionIds.length) parts.push(`${draft.sources.connectionIds.length} connection(s)`);
    if (draft.sources.objects.length) parts.push(`${draft.sources.objects.length} table(s)`);
    const d = Object.keys(draft.understanding.decisions).length;
    if (d) parts.push(`${d} decision(s) made`);
    return parts;
  }, [draft]);

  const idx = STEPS.findIndex((s) => s.id === draft.step);
  const next = () => idx < STEPS.length - 1 && go(STEPS[idx + 1].id);
  const back = () => idx > 0 && go(STEPS[idx - 1].id);

  return (
    <div className="space-y-4">
      {resumable && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-800/50">
          <span className="text-slate-600 dark:text-slate-300">
            Resume where you left off — started {new Date(resumable.draft.startedAt).toLocaleDateString()}
          </span>
          <button
            type="button"
            onClick={() => {
              draftIdRef.current = resumable.draftId;
              setDraft(resumable.draft);
              setResumable(null);
            }}
            className="rounded-md bg-accent-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-700"
          >
            Resume
          </button>
          <QuietAction
            label="Start over"
            onClick={() => {
              clearJourneyDraft();
              setResumable(null);
            }}
          />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <StepRail current={draft.step} />
        {onExit && <QuietAction label="Back to domains" onClick={onExit} />}
      </div>

      {/* Step compression — ALWAYS visible (user directive): the decisions
          already made stay on screen as compact chips, never hidden. */}
      {summary.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Your choices so far">
          {summary.map((s) => (
            <span
              key={s}
              className="max-w-[320px] truncate rounded-full bg-slate-100 px-2 py-0.5 text-xs leading-4 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              title={s}
            >
              {s}
            </span>
          ))}
        </div>
      )}

      {draft.step === 'need' && (
        <NeedStep draft={draft} onPatch={patch} onNext={next} suggestions={suggestions} />
      )}
      {draft.step === 'sources' && (
        <SourcesStep draft={draft} onPatch={patch} onNext={next} onBack={back} />
      )}
      {draft.step === 'understanding' && (
        <UnderstandingStep draft={draft} onPatch={patch} onNext={next} onBack={back} />
      )}
      {draft.step === 'preview' && (
        <PreviewStep draft={draft} onPatch={patch} onNext={next} onBack={back} />
      )}
      {draft.step === 'automation' && (
        <AutomationStep draft={draft} onPatch={patch} onNext={next} onBack={back} />
      )}
      {draft.step === 'activation' && (
        <ActivationStep draft={draft} onPatch={patch} onBack={back} />
      )}

      
    </div>
  );
}
