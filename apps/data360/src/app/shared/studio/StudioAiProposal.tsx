'use client';

/**
 * StudioAiProposal — the ONE way the Studio turns a sentence into a change.
 *
 * The user writes a business need in their own words ("tickets par jour",
 * "marge par magasin", "alerte quand le stock passe sous le seuil"). The
 * application's real context (its target tables, their columns, grain and
 * volumes) travels with the sentence, so the AI answers with a concrete
 * proposal instead of asking the user to write SQL.
 *
 * What comes back is rendered as a FUNCTIONAL summary — "adds the chart
 * « Tickets par jour », distinct tickets per day" — never a JSON diff:
 * the technical operations stay behind a disclosure for whoever wants
 * them. Nothing is written before the user approves, the validation
 * verdict is shown as-is, and the cost is what is actually known (one AI
 * unit, the volume the change lands on), never an invented figure.
 */

import { useCallback, useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, Sparkles } from 'lucide-react';
import {
  editModel,
  patchModel,
  type ModelPatchOp,
  type ModelPatchResult,
} from '@/app/services/studio/studio-api';

/** A backend error may be a structured object — never render one in JSX. */
function asText(v: unknown): string {
  if (v == null) return 'not valid here';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    const o = v as { message?: string; error_code?: string };
    return o.message ?? o.error_code ?? JSON.stringify(v).slice(0, 200);
  }
  return String(v);
}

function errMsg(e: unknown): string {
  const anyE = e as { response?: { data?: { detail?: unknown } }; message?: string };
  const detail = anyE?.response?.data?.detail;
  if (typeof detail === 'string' && detail) return detail;
  if (detail && typeof detail === 'object') {
    const d = detail as { message?: string; error_code?: string };
    if (d.message) return d.message;
    if (d.error_code) return d.error_code;
  }
  return anyE?.message ?? 'The proposal could not be prepared.';
}

/* ── the sentence the change makes, in business words ───────────────── */

interface AppliedEntry {
  op?: string;
  path?: string;
  before?: unknown;
  after?: unknown;
}

interface WidgetLike {
  title?: string;
  chart_type?: string;
  measures?: Array<{ column?: string; aggregator?: string }>;
  dimensions?: Array<string | { column?: string }>;
  time?: { column?: string; grain?: string } | null;
  dataset?: { table?: string };
  limit?: number | null;
}

const AGG_WORDS: Record<string, string> = {
  SUM: 'total',
  COUNT: 'number of',
  COUNT_DISTINCT: 'distinct',
  APPROX_COUNT_DISTINCT: 'distinct (approximate)',
  AVG: 'average',
  MIN: 'lowest',
  MAX: 'highest',
};

function measureWords(m?: WidgetLike['measures']): string {
  if (!m?.length) return 'the values';
  return m
    .map((x) => {
      const w = AGG_WORDS[String(x.aggregator ?? '').toUpperCase()] ?? String(x.aggregator ?? '').toLowerCase();
      const col = (x.column ?? '').toLowerCase().replace(/_/g, ' ');
      return `${w} ${col}`.trim();
    })
    .join(' and ');
}

function widgetSentence(w: WidgetLike): string {
  const parts: string[] = [measureWords(w.measures)];
  const dims = (w.dimensions ?? [])
    .map((d) => (typeof d === 'string' ? d : d.column))
    .filter(Boolean)
    .map((d) => String(d).toLowerCase().replace(/_/g, ' '));
  if (dims.length) parts.push(`by ${dims.join(' and ')}`);
  if (w.time?.column) parts.push(`per ${w.time.grain ?? 'period'}`);
  if (w.dataset?.table) parts.push(`on ${w.dataset.table}`);
  return parts.join(' ');
}

/** One applied operation, said the way a business reader would say it. */
export function changeSentence(e: AppliedEntry): string {
  const path = String(e.path ?? '');
  const after = e.after as Record<string, unknown> | null;
  const before = e.before as Record<string, unknown> | null;

  if (/^\/report\/(charts|kpis)\/\d+$/.test(path) && after && before == null) {
    const w = after as WidgetLike;
    const kind = path.includes('/kpis/') ? 'figure' : `${w.chart_type ?? 'chart'}`;
    return `Adds the ${kind} « ${w.title ?? 'untitled'} » — ${widgetSentence(w)}.`;
  }
  if (/^\/report\/(charts|kpis)\/\d+$/.test(path) && before && after == null) {
    const w = before as WidgetLike;
    return `Removes « ${w.title ?? 'untitled'} ».`;
  }
  if (/\/measures$/.test(path)) {
    const a = after as unknown as WidgetLike['measures'];
    const b = before as unknown as WidgetLike['measures'];
    return `Changes what is measured: ${measureWords(a)}${b ? ` (was ${measureWords(b)})` : ''}.`;
  }
  if (/\/dimensions$/.test(path)) {
    const dims = (after as unknown as Array<string | { column?: string }> | null) ?? [];
    const names = dims.map((d) => (typeof d === 'string' ? d : d.column)).filter(Boolean);
    return names.length
      ? `Groups it by ${names.join(' and ')}.`
      : 'Removes the grouping.';
  }
  if (/\/title$/.test(path)) return `Renames it to « ${String(after ?? '')} ».`;
  if (/\/chart_type$/.test(path)) return `Shows it as a ${String(after ?? '')}.`;
  if (/\/limit$/.test(path)) return `Keeps the top ${String(after ?? '')} rows.`;
  if (/\/model\/targets\/\d+\/columns\/?-?$/.test(path) && after) {
    const c = after as { name?: string; expression?: string; type?: string };
    return `Adds the column ${c.name ?? '—'} to the application's model${
      c.expression ? `, computed as ${c.expression}` : ''
    } — it exists in the definition until the process that builds the table has run.`;
  }
  if (/\/trigger$/.test(path)) {
    const t = after as { cron_choice?: string | null } | null;
    return t?.cron_choice
      ? `Schedules the process ${t.cron_choice}.`
      : 'Makes the process manual again.';
  }
  if (/\/rules$/.test(path)) return 'Changes the quality rules applied on load.';
  if (/\/sql$/.test(path)) return 'Replaces the process SQL.';
  // last resort — still a sentence, never a raw diff
  return `Changes ${path.replace(/^\//, '').replace(/\//g, ' → ').replace(/_/g, ' ')}.`;
}

export interface AiProposalState {
  busy: boolean;
  error: string | null;
  result: ModelPatchResult | null;
  /** What the user asked, kept so the card can restate it. */
  phrase: string | null;
}

const EMPTY: AiProposalState = { busy: false, error: null, result: null, phrase: null };

/**
 * The proposal engine. `context` is the application truth the AI needs —
 * built by the caller from what it already holds (targets, columns, grain,
 * volumes), never fetched blindly here.
 */
export function useAiProposal(draftId: string) {
  const [state, setState] = useState<AiProposalState>(EMPTY);

  const propose = useCallback(
    async (phrase: string, context: string, expectedUpdatedAt?: string) => {
      setState({ busy: true, error: null, result: null, phrase });
      try {
        /* The instruction field is capped (1000 chars): the user's sentence
         * and the answering rules are never truncated — only the context
         * is trimmed to what fits, longest tail first. */
        const ask =
          `\n\nThe user asks for this, in their own words: "${phrase}".\n` +
          `Answer with the concrete change that satisfies it, using only columns that exist above. ` +
          `If it cannot be done on this data, refuse and name what is missing.`;
        const room = 1000 - ask.length;
        const ctx =
          context.length <= room ? context : `${context.slice(0, Math.max(0, room - 2))}…`;
        const result = await editModel(draftId, `${ctx}${ask}`, undefined, expectedUpdatedAt);
        setState({ busy: false, error: null, result, phrase });
        return result;
      } catch (e) {
        setState({ busy: false, error: errMsg(e), result: null, phrase });
        return null;
      }
    },
    [draftId],
  );

  const apply = useCallback(
    async (result: ModelPatchResult, summary: string) => {
      setState((s) => ({ ...s, busy: true, error: null }));
      try {
        const applied = await patchModel(
          draftId,
          (result.ops ?? []) as ModelPatchOp[],
          true,
          summary,
        );
        setState(EMPTY);
        return applied;
      } catch (e) {
        setState((s) => ({ ...s, busy: false, error: errMsg(e) }));
        return null;
      }
    },
    [draftId],
  );

  const reset = useCallback(() => setState(EMPTY), []);

  return { state, propose, apply, reset };
}

/* ── the card ───────────────────────────────────────────────────────── */

export function AiProposalCard({
  state,
  /** Rows the change lands on, from the last real run — labeled, never guessed. */
  volumeNote,
  onApply,
  onCancel,
}: {
  state: AiProposalState;
  volumeNote?: string | null;
  onApply: () => void;
  onCancel: () => void;
}) {
  const [showOps, setShowOps] = useState(false);
  const r = state.result;
  if (state.busy && !r)
    return (
      <p className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] text-slate-500 dark:text-slate-400">
        <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />
        Reading this application to answer…
      </p>
    );
  if (state.error)
    return (
      <p role="alert" className="mt-1.5 text-[13px] text-red-600 dark:text-red-400">
        {state.error}
      </p>
    );
  if (!r) return null;

  const applied = (r.applied ?? []) as AppliedEntry[];
  const invalid = r.validation?.results?.find((x) => x.status === 'invalid');
  const clarification = r.status === 'clarification_needed';
  const impacts = (r.dependencies ?? []).flatMap((d) =>
    ((d as { impacts?: string[] }).impacts ?? []).map((i) => String(i)),
  );

  return (
    <div className="mt-1.5 rounded-lg border border-accent-200 bg-accent-50/40 p-2 dark:border-accent-800 dark:bg-accent-900/10">
      {clarification ? (
        <p className="text-[13px] text-slate-700 dark:text-slate-200">
          {(r as { message?: string }).message ??
            'One detail is missing to answer — say it in a few more words and ask again.'}
        </p>
      ) : applied.length === 0 ? (
        <p className="text-[13px] text-slate-700 dark:text-slate-200">
          Nothing to change — this application already answers that.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {applied.map((e, i) => (
            <li key={i} className="text-[13px] text-slate-700 dark:text-slate-200">
              {changeSentence(e)}
            </li>
          ))}
        </ul>
      )}

      {impacts.length > 0 && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Also affects: {[...new Set(impacts)].join(' · ')}
        </p>
      )}

      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        Costs one AI unit of the free envelope{volumeNote ? ` · ${volumeNote}` : ''}. Nothing is
        written until you approve.
      </p>

      {invalid && (
        <p className="mt-1 text-[13px] text-amber-700 dark:text-amber-300">
          Refused on this data: {asText(invalid.error)}
        </p>
      )}

      {applied.length > 0 && !clarification && (
        <>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={state.busy || !!invalid}
              onClick={onApply}
              className="rounded-lg bg-accent-600 px-2.5 py-1 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40"
            >
              {state.busy ? 'Applying…' : 'Apply this change'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="text-[13px] text-slate-500 hover:text-slate-700 dark:text-slate-400"
            >
              Cancel
            </button>
          </div>
          <button
            type="button"
            aria-expanded={showOps}
            onClick={() => setShowOps((v) => !v)}
            className="mt-1 inline-flex items-center gap-0.5 text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500"
          >
            {showOps ? (
              <ChevronDown aria-hidden className="h-3 w-3" />
            ) : (
              <ChevronRight aria-hidden className="h-3 w-3" />
            )}
            Technical detail
          </button>
          {showOps && (
            <pre className="mt-1 max-h-40 overflow-auto rounded bg-white p-1.5 font-mono text-xs text-slate-600 dark:bg-slate-950 dark:text-slate-300">
              {JSON.stringify(r.ops ?? [], null, 1)}
            </pre>
          )}
        </>
      )}
    </div>
  );
}

/** The button that opens the sentence box — same affordance everywhere. */
export function AskAiButton({
  label = 'Ask in your own words',
  onClick,
  disabled,
}: {
  label?: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex items-center gap-1 text-[13px] text-accent-700 hover:underline disabled:opacity-40 dark:text-accent-400"
    >
      <Sparkles aria-hidden className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
