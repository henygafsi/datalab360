'use client';

/**
 * StudioWorkflowCompose — build an automation by talking.
 *
 * The model is given this application's real vocabulary (its entities and
 * their columns, the report's KPIs, the cadences, the destinations) and is
 * told to ASK for what it needs. So the conversation here is not decoration:
 * every question carries the real choices, and the backend re-validates each
 * column the model returns — anything it cannot prove comes back as
 * « still missing », never as an invented predicate.
 *
 * Nothing exists until it is ready and you press create. The draft renders on
 * the canvas first, so you see the automation being built as you answer.
 */

import { useState } from 'react';
import { RefreshCw, Send, Sparkles, Check } from 'lucide-react';
import {
  composeWorkflow,
  createWorkflowFromDraft,
  type ComposeTurn,
} from '@/app/services/studio/studio-api';

interface Turn {
  who: 'you' | 'ai';
  text: string;
}

export default function StudioWorkflowCompose({
  draftId,
  onCreated,
}: {
  draftId: string;
  onCreated: (automationId?: string) => void;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState<'thinking' | 'creating' | null>(null);
  const [state, setState] = useState<ComposeTurn | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** a served choice is either a plain value or an object carrying its id and
   *  a human title — show the title, answer with the id */
  const choiceOf = (c: unknown): { label: string; value: string } => {
    if (c && typeof c === 'object') {
      const o = c as Record<string, unknown>;
      const value = String(o.chart_id ?? o.id ?? o.value ?? o.name ?? '');
      return { label: String(o.title ?? o.label ?? value), value };
    }
    return { label: String(c), value: String(c) };
  };

  const draft = (state?.draft_workflow ?? null) as Record<string, unknown> | null;
  const draftHasShape = Boolean(
    draft && ((draft.phrase as Record<string, string> | undefined)?.event || (draft.steps as unknown[])?.length),
  );
  const phrase = (draft?.phrase ?? {}) as Record<string, string>;
  const steps = (draft?.steps ?? []) as Array<Record<string, unknown>>;
  const questions = state?.questions ?? [];
  const missing = state?.missing ?? [];
  /* the validated truth is `missing`: when the backend has nothing left
     unresolved, the draft materialises — the assistant may still be chatting. */
  const ready = Boolean(state?.ready) || Boolean(draftHasShape && (state?.missing?.length ?? 0) === 0);

  const say = async (message: string) => {
    const msg = message.trim();
    if (!msg || busy) return;
    setTurns((t) => [...t, { who: 'you', text: msg }]);
    setText('');
    setBusy('thinking');
    setError(null);
    try {
      // the backend holds no thread: the conversation travels with the call
      const history = turns.map((x) => ({
        role: (x.who === 'you' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: x.text,
      }));
      const r = await composeWorkflow(draftId, {
        message: msg,
        thread_id: state?.thread_id,
        draft_workflow: state?.draft_workflow ?? null,
        history,
      });
      setState(r);
      if (r.reply) setTurns((t) => [...t, { who: 'ai', text: r.reply! }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The assistant could not be reached.');
    } finally {
      setBusy(null);
    }
  };

  const create = async () => {
    if (!draft || !ready || busy) return;
    setBusy('creating');
    setError(null);
    try {
      const r = await createWorkflowFromDraft(draftId, draft);
      const aid =
        (r.automation_id as string | undefined) ??
        ((r.workflow as Record<string, unknown> | undefined)?.automation_id as string | undefined);
      onCreated(aid);
      setTurns([]);
      setState(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The automation could not be created.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-xl border border-accent-200 bg-accent-50/50 p-2.5 dark:border-accent-800 dark:bg-accent-950/30">
      <p className="flex items-center gap-1.5 text-[12px] font-medium text-slate-800 dark:text-slate-100">
        <Sparkles aria-hidden className="h-3.5 w-3.5 text-accent-600 dark:text-accent-300" />
        Build one by describing it
      </p>
      <p className="mt-0.5 text-[11.5px] leading-snug text-slate-600 dark:text-slate-300">
        The assistant knows this application's tables, columns and KPIs. It asks for what it needs
        instead of guessing — nothing is created until you say so.
      </p>
      {state?.quota && (
        <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
          {typeof state.quota.remaining === 'number'
            ? `${state.quota.remaining} conversation(s) left on this application`
            : `${state.quota.used ?? '—'} / ${state.quota.limit ?? '—'} conversations used`}
          {turns.length > 0 && ' · continuing this one is free'}
        </p>
      )}

      {/* the conversation */}
      {turns.length > 0 && (
        <ul className="mt-2 max-h-44 space-y-1.5 overflow-y-auto pr-0.5">
          {turns.map((t, i) => (
            <li
              key={i}
              className={`rounded-lg px-2 py-1 text-[11.5px] leading-snug ${
                t.who === 'you'
                  ? 'bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-200'
                  : 'bg-accent-100/60 text-slate-800 dark:bg-accent-900/40 dark:text-slate-100'
              }`}
            >
              {t.text}
            </li>
          ))}
        </ul>
      )}

      {/* what it still needs — the real choices, one tap each */}
      {questions.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {questions.map((q, i) => (
            <div key={q.field ?? i} className="rounded-lg bg-white px-2 py-1.5 dark:bg-slate-900">
              <p className="text-[11.5px] font-medium text-slate-700 dark:text-slate-200">{q.text}</p>
              {(q.choices?.length ?? 0) > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {q.choices!.slice(0, 8).map((c, ci) => {
                    const { label, value } = choiceOf(c);
                    return (
                      <button
                        key={`${value}-${ci}`}
                        type="button"
                        disabled={busy != null}
                        onClick={() => void say(`${q.field ?? ''} is ${value}`.trim())}
                        className="rounded-full border border-slate-200 px-2 py-0.5 text-[11px] text-slate-600 hover:border-accent-300 hover:text-accent-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* what the backend could not prove — never silently invented */}
      {missing.length > 0 && (
        <ul className="mt-2 space-y-1">
          {missing.map((m, i) => (
            <li
              key={m.field ?? i}
              className="rounded-lg bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
            >
              {m.why ?? m.field}
              {(m.choices?.length ?? 0) > 0 && (
                <span className="mt-1 flex flex-wrap gap-1">
                  {m.choices!.slice(0, 8).map((c, ci) => {
                    const { label, value } = choiceOf(c);
                    return (
                      <button
                        key={`${value}-${ci}`}
                        type="button"
                        disabled={busy != null}
                        onClick={() => void say(`${m.field ?? ''} is ${value}`.trim())}
                        className="rounded-full bg-white px-2 py-0.5 text-[11px] text-amber-800 hover:text-accent-700 disabled:opacity-50 dark:bg-slate-900 dark:text-amber-200"
                      >
                        {label}
                      </button>
                    );
                  })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {/* the automation taking shape */}
      {draft && (phrase.event || steps.length > 0) && (
        <div className="mt-2 rounded-lg bg-white px-2 py-1.5 text-[11.5px] dark:bg-slate-900">
          <p className="font-medium text-slate-800 dark:text-slate-100">
            {(draft.name as string) ?? 'New automation'}
          </p>
          {phrase.event && (
            <p className="mt-0.5 text-slate-600 dark:text-slate-300">
              <span className="text-slate-400">when</span> {phrase.event}
            </p>
          )}
          {phrase.condition && (
            <p className="text-slate-600 dark:text-slate-300">
              <span className="text-slate-400">if</span> {phrase.condition}
            </p>
          )}
          {phrase.action && (
            <p className="text-slate-600 dark:text-slate-300">
              <span className="text-slate-400">then</span> {phrase.action}
            </p>
          )}
          {steps.length > 0 && (
            <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
              {steps.length} step(s):{' '}
              {steps
                .map((s) => String(s.catalog_block_type ?? s.block_type ?? s.label ?? '?'))
                .join(' → ')}
            </p>
          )}
        </div>
      )}

      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-rose-50 px-2 py-1 text-[11px] text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </p>
      )}

      {/* say something / create it */}
      <div className="mt-2 flex items-center gap-1.5">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void say(text);
          }}
          disabled={busy != null}
          placeholder={turns.length ? 'Answer, or refine…' : 'e.g. alert me weekly when the average unit cost goes above 30'}
          aria-label="Describe the automation"
          className="h-8 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-[11.5px] dark:border-slate-700 dark:bg-slate-900"
        />
        <button
          type="button"
          disabled={busy != null || !text.trim()}
          onClick={() => void say(text)}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg bg-accent-600 px-2.5 text-[11.5px] font-medium text-white hover:bg-accent-700 disabled:opacity-50"
        >
          {busy === 'thinking' ? (
            <RefreshCw aria-hidden className="h-3 w-3 animate-spin" />
          ) : (
            <Send aria-hidden className="h-3 w-3" />
          )}
          {busy === 'thinking' ? 'Thinking…' : 'Send'}
        </button>
      </div>
      {ready && draft && (
        <button
          type="button"
          disabled={busy != null}
          onClick={() => void create()}
          className="mt-1.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[12px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy === 'creating' ? (
            <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check aria-hidden className="h-3.5 w-3.5" />
          )}
          {state?.ready ? 'Create this automation' : 'Create it — nothing is unresolved'}
        </button>
      )}
    </div>
  );
}
