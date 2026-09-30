'use client';

/**
 * RefineChat — "change it with a sentence" (K3 edit contract).
 *
 * One instruction in plain words → the backend AI turns it into an
 * allowlisted structured patch (POST /studio/model/{id}/edit, apply:false),
 * previewed HONESTLY before anything changes: the exact before/after diff,
 * what each change impacts (dependencies + risk), and the revalidated SQL.
 * Apply then goes through POST /studio/model/{id}/patch apply:true — a new
 * draft version, nothing regenerated. `clarification_needed` shows the AI's
 * questions; `ai_unavailable` degrades calmly (the per-chart selectors keep
 * working). Nothing is ever applied on a failed validation (422 ⇒ no-op).
 */

import { useCallback, useEffect, useState } from 'react';
import { Check, CornerDownLeft, RotateCw, X } from 'lucide-react';
import { QuietAction } from '@/app/shared/studio/PlainKit';
import {
  editModel,
  listEnrichments,
  patchModel,
  type AiEnrichment,
  type ModelPatchResult,
} from '@/app/services/studio/studio-api';

function errMsg(e: unknown): string {
  if (e && typeof e === 'object') {
    const anyE = e as {
      response?: { data?: { detail?: unknown } };
      message?: string;
    };
    const detail = anyE.response?.data?.detail;
    if (typeof detail === 'string' && detail) return detail;
    if (detail && typeof detail === 'object') {
      const d = detail as { message?: string; error_code?: string };
      if (d.message) return d.message;
      if (d.error_code) return d.error_code;
    }
    if (anyE.message) return anyE.message;
  }
  return 'The change could not be prepared.';
}

function fmtValue(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

const RISK_STYLE: Record<string, string> = {
  none: 'text-slate-400 dark:text-slate-500',
  low: 'text-emerald-600 dark:text-emerald-400',
  medium: 'text-amber-600 dark:text-amber-400',
  high: 'text-red-600 dark:text-red-400',
};

type ChatState =
  | { kind: 'idle' }
  | { kind: 'thinking' }
  | { kind: 'preview'; result: ModelPatchResult }
  | { kind: 'questions'; questions: string[] }
  | { kind: 'unavailable'; message: string }
  | { kind: 'applying'; result: ModelPatchResult }
  | { kind: 'error'; message: string };

export default function RefineChat({
  draftId,
  onApplied,
  prefill,
  onPrefillConsumed,
}: {
  draftId: string;
  /** Called with the APPLY result — the parent syncs its local report and
   *  re-runs the touched tiles (dependencies say which). */
  onApplied: (result: ModelPatchResult) => void;
  /** A sentence handed over by another view (e.g. a failing DQ check) —
   *  lands in the input, NEVER auto-sent: the user still presses Preview. */
  prefill?: string | null;
  onPrefillConsumed?: () => void;
}) {
  const [instruction, setInstruction] = useState('');
  const [state, setState] = useState<ChatState>({ kind: 'idle' });

  useEffect(() => {
    if (prefill) {
      setInstruction(prefill);
      onPrefillConsumed?.();
    }
  }, [prefill, onPrefillConsumed]);
  // Confirmed enrichments (the user's own past decisions) as shortcuts.
  const [shortcuts, setShortcuts] = useState<AiEnrichment[]>([]);

  useEffect(() => {
    let alive = true;
    void listEnrichments({ draftId, status: 'confirmed' })
      .then((items) => {
        if (!alive) return;
        setShortcuts(
          items
            .filter((e) =>
              ['display_hint', 'definition', 'metric_template'].includes(e.kind ?? ''),
            )
            .slice(0, 6),
        );
      })
      .catch(() => undefined); // the registry is enrichment — never blocks
    return () => {
      alive = false;
    };
  }, [draftId]);

  const shortcutText = (e: AiEnrichment): string => {
    const v = e.value;
    const s =
      typeof v === 'string'
        ? v
        : v && typeof v === 'object'
          ? String(Object.values(v as Record<string, unknown>).find((x) => typeof x === 'string') ?? '')
          : '';
    if (e.kind === 'display_hint') return `Show ${s}`;
    if (e.kind === 'definition' && e.scope_key) return `Apply the confirmed definition of ${e.scope_key}: ${s}`;
    return s || (e.scope_key ?? '');
  };

  const preview = useCallback(async () => {
    const text = instruction.trim();
    if (!text || state.kind === 'thinking' || state.kind === 'applying') return;
    setState({ kind: 'thinking' });
    try {
      const result = await editModel(draftId, text);
      if (result.status === 'clarification_needed') {
        setState({ kind: 'questions', questions: result.questions ?? [] });
      } else if (result.status === 'ai_unavailable') {
        setState({
          kind: 'unavailable',
          message:
            'AI editing is not available right now — the selectors on each chart still work.',
        });
      } else {
        setState({ kind: 'preview', result });
      }
    } catch (e) {
      setState({ kind: 'error', message: errMsg(e) });
    }
  }, [draftId, instruction, state.kind]);

  const apply = useCallback(async () => {
    if (state.kind !== 'preview') return;
    const { result } = state;
    // Some edit responses (adds, notably) carry the change only in
    // applied[] — replay those as ops; a silent no-op here loses the edit.
    const ops: typeof result.ops =
      result.ops && result.ops.length > 0
        ? result.ops
        : (result.applied ?? []).map((a) => ({
            op: (a.op === 'add' || a.op === 'remove' ? a.op : 'set') as 'add' | 'remove' | 'set',
            // the preview resolves an add to its index; the allowlist
            // accepts appends as /- only
            path: a.op === 'add' ? a.path.replace(/\/\d+$/, '/-') : a.path,
            ...(a.op === 'remove' ? {} : { value: a.after }),
          }));
    if (ops.length === 0) {
      setState({
        kind: 'error',
        message: 'The preview carried no operation to apply — try rephrasing.',
      });
      return;
    }
    setState({ kind: 'applying', result });
    try {
      const appliedResult = await patchModel(
        draftId,
        ops,
        true,
        instruction.trim().slice(0, 500),
      );
      setInstruction('');
      setState({ kind: 'idle' });
      onApplied(appliedResult);
    } catch (e) {
      setState({ kind: 'error', message: errMsg(e) });
    }
  }, [draftId, instruction, onApplied, state]);

  const busy = state.kind === 'thinking' || state.kind === 'applying';

  return (
    <section
      className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900"
      aria-label="Refine the report with a sentence"
    >
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
        Change it with a sentence
      </p>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void preview()}
          disabled={busy}
          placeholder='e.g. "Rename the first chart to Margin by store" or "Limit the ranking to 20 rows"'
          aria-label="Your change, in plain words"
          className="h-9 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent-500 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
        />
        <button
          type="button"
          onClick={() => void preview()}
          disabled={busy || instruction.trim().length < 3}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-accent-600 px-3 text-sm font-medium text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {state.kind === 'thinking' ? (
            <RotateCw className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            <CornerDownLeft className="h-3.5 w-3.5" aria-hidden />
          )}
          Preview
        </button>
      </div>
      <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
        Nothing changes before you see the exact diff and approve it.
      </p>

      {shortcuts.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Your confirmed shortcuts">
          {shortcuts.map((e) => (
            <button
              key={e.enrichment_id}
              type="button"
              onClick={() => setInstruction(shortcutText(e))}
              title="From your confirmed decisions — click to prefill, then adjust."
              className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-500 hover:border-accent-300 hover:text-accent-700 dark:border-slate-700 dark:text-slate-400"
            >
              {shortcutText(e).slice(0, 48)}
            </button>
          ))}
        </div>
      )}

      {state.kind === 'error' && (
        <p role="alert" className="mt-2 text-xs text-red-600 dark:text-red-400">
          {state.message}
        </p>
      )}

      {state.kind === 'unavailable' && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{state.message}</p>
      )}

      {state.kind === 'questions' && (
        <div className="mt-2 space-y-1">
          <p className="text-xs font-medium text-slate-700 dark:text-slate-200">
            One thing to clarify first:
          </p>
          <ul className="list-disc space-y-0.5 pl-5 text-xs text-slate-600 dark:text-slate-300">
            {state.questions.length > 0 ? (
              state.questions.map((q) => <li key={q}>{q}</li>)
            ) : (
              <li>Could you say it more precisely?</li>
            )}
          </ul>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Rephrase above and preview again — nothing was changed.
          </p>
        </div>
      )}

      {(state.kind === 'preview' || state.kind === 'applying') && (
        <div className="mt-2 space-y-2">
          {/* the diff — before → after, path by path */}
          <ul className="space-y-1">
            {(state.result.applied ?? []).map((a) => (
              <li
                key={a.path}
                className="rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs dark:bg-slate-800/60"
              >
                <span className="font-mono text-xs text-slate-400 dark:text-slate-500">
                  {a.path}
                </span>
                <span className="mt-0.5 block text-slate-700 dark:text-slate-200">
                  <span className="line-through opacity-60">{fmtValue(a.before)}</span>
                  <span aria-hidden> → </span>
                  <span className="font-medium">{fmtValue(a.after)}</span>
                </span>
              </li>
            ))}
            {(state.result.applied ?? []).length === 0 && (
              <li className="text-xs text-slate-400 dark:text-slate-500">
                The instruction produced no change.
              </li>
            )}
          </ul>

          {/* dependencies — what this touches, with risk */}
          {(state.result.dependencies ?? []).length > 0 && (
            <ul className="space-y-0.5">
              {state.result.dependencies!.map((d) => (
                <li
                  key={d.path}
                  className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"
                >
                  <span className={RISK_STYLE[d.risk ?? 'none'] ?? RISK_STYLE.none}>
                    ● {d.risk ?? 'none'} risk
                  </span>
                  {(d.impacts ?? []).length > 0 && (
                    <span>touches {d.impacts!.join(', ')}</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* revalidated SQL verdicts */}
          {(state.result.validation?.results ?? []).some((r) => r.status === 'invalid') && (
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {state.result
                .validation!.results!.filter((r) => r.status === 'invalid')
                .map((r) => r.error ?? `${r.target ?? 'a chart'} is invalid`)
                .join(' · ')}
            </p>
          )}

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => void apply()}
              disabled={state.kind === 'applying' || state.result.can_apply === false}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state.kind === 'applying' ? (
                <RotateCw className="h-3 w-3 animate-spin" aria-hidden />
              ) : (
                <Check className="h-3 w-3" aria-hidden />
              )}
              Apply
            </button>
            <QuietAction
              label="Discard"
              icon={X}
              onClick={() => setState({ kind: 'idle' })}
            />
            {state.result.provenance?.model && (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                prepared by AI · {state.result.provenance.model}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
