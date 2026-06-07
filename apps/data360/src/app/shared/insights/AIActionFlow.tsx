'use client';

/**
 * AIActionFlow — the standard "AI discussion → proposed actions → execute → capitalize" primitive.
 *
 * This WRAPS the existing actionable-insights primitives; it does not reinvent them:
 *   - {@link InsightActionButton} runs each proposed action through the honest gate
 *     (confirm · toast · bell · 404/501-self-disable). We never fake success.
 *   - {@link useTrackEvent} stores the executed (and dismissed) actions as events so
 *     the knowledge is capitalized server-side (POST /api/data360/track).
 *
 * Two suggestion sources, both honest:
 *   1. `suggestions` — pre-computed, rule-based (no LLM call). Deterministic.
 *   2. `fetchSuggestions` — asks the AI completion endpoint (POST /cortex/complete)
 *      for a structured JSON array. On ANY failure (network, non-JSON, bad shape)
 *      we degrade to "AI suggestions unavailable" — never to fabricated suggestions.
 *
 * Render is an INLINE panel section (no modal). See the Popup→Inline audit.
 */
import { useCallback, useEffect, useState } from 'react';
import { Lightbulb, Sparkles, X } from 'lucide-react';
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { cn } from '@/lib/utils';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import InsightActionButton from './InsightActionButton';

/** The backend mutation a suggestion proposes. */
export interface SuggestionAction {
  /** Button label. */
  label: string;
  /** Endpoint path (lives in api-contracts; passed pre-resolved). */
  endpoint: string;
  /** HTTP verb. Defaults to POST. */
  method?: 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'GET';
  /** Request body. */
  payload?: Record<string, unknown>;
  /** Honest cost annotation (e.g. "~2 credits/run"). */
  cost?: string;
  /** Honest risk annotation (e.g. "low — read-only"). */
  risk?: string;
  /** Destructive confirm step (forwarded to InsightActionButton). */
  confirm?: {
    title: string;
    body?: string;
    confirmLabel?: string;
    variant?: 'default' | 'warning';
  };
}

export interface Suggestion {
  /** Stable id (used to track dismissals). Falls back to title. */
  id?: string;
  /** What we propose. */
  title: string;
  /** Why — the discussion / reasoning shown to the user. */
  rationale: string;
  /** The executable action (omit for advisory-only cards). */
  action?: SuggestionAction;
}

export interface AIActionFlowContext {
  module: string;
  entityType: string;
  entityId: string;
  /** Free-form context fed into the AI prompt when `fetchSuggestions` is on. */
  data?: Record<string, unknown>;
}

export interface AIActionFlowProps {
  context: AIActionFlowContext;
  /** Pre-computed (rule-based) suggestions. */
  suggestions?: Suggestion[];
  /** When true, ask the AI completion endpoint instead. Ignored if `suggestions` is given. */
  fetchSuggestions?: boolean;
  /** Optional AI model override for the completion call. */
  model?: string;
  /** Heading shown above the discussion zone. */
  title?: string;
  className?: string;
}

interface CortexCompleteResponse {
  data?: { response?: string; completion?: string };
  response?: string;
  completion?: string;
}

/** Build a structured prompt that asks for a JSON suggestion array. */
function buildPrompt(ctx: AIActionFlowContext): string {
  return [
    'You are a Data360 platform expert. Given the context below, propose up to 4 concrete,',
    'actionable next steps. Respond with ONLY a JSON array (no prose, no markdown fence) of objects',
    'shaped exactly: [{"title": string, "rationale": string, "action": {"label": string,',
    '"endpoint": string, "method": string, "payload": object, "cost": string, "risk": string}}].',
    'If no action is warranted, return [].',
    '',
    `Module: ${ctx.module}`,
    `Entity: ${ctx.entityType} / ${ctx.entityId}`,
    `Context: ${JSON.stringify(ctx.data ?? {})}`,
  ].join('\n');
}

/** Narrowing guard: is this an object with a string `title` and `rationale`? */
function isSuggestion(v: unknown): v is Suggestion {
  if (typeof v !== 'object' || v === null) return false;
  const o = v as Record<string, unknown>;
  return typeof o.title === 'string' && typeof o.rationale === 'string';
}

function parseSuggestions(raw: string): Suggestion[] {
  // Tolerate a stray ```json fence the model may emit despite instructions.
  const cleaned = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const parsed: unknown = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error('not an array');
  const valid = parsed.filter(isSuggestion);
  if (valid.length === 0) throw new Error('no valid suggestions');
  return valid;
}

export default function AIActionFlow({
  context,
  suggestions,
  fetchSuggestions = false,
  model = 'mistral-large2',
  title = 'AI suggestions',
  className,
}: AIActionFlowProps) {
  const { trackFeatureClick } = useTrackEvent();

  const ruleBased = suggestions ?? null;
  const [aiSuggestions, setAiSuggestions] = useState<Suggestion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [executedCount, setExecutedCount] = useState(0);

  const wantAI = !ruleBased && fetchSuggestions;

  useEffect(() => {
    if (!wantAI) return;
    let cancelled = false;

    setLoading(true);
    setFailed(false);
    (async () => {
      try {
        const { data } = await apiClient.post<CortexCompleteResponse>(
          API.cortex.complete(),
          { prompt: buildPrompt(context), model },
        );
        const text =
          data?.data?.response ??
          data?.data?.completion ??
          data?.response ??
          data?.completion ??
          '';
        const parsed = parseSuggestions(text);
        if (!cancelled) setAiSuggestions(parsed);
      } catch {
        // Honest degradation — no fabricated suggestions.
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // context is intentionally re-fetched when its identity changes
  }, [wantAI, context, model]);

  const keyOf = (s: Suggestion) => s.id ?? s.title;

  const handleExecuted = useCallback(
    (s: Suggestion) => {
      setExecutedCount((n) => n + 1);
      trackFeatureClick('ai_action_executed', {
        module: context.module,
        entityType: context.entityType,
        entityId: context.entityId,
        suggestion: s.title,
        endpoint: s.action?.endpoint,
      });
    },
    [context.module, context.entityType, context.entityId, trackFeatureClick],
  );

  const handleDismiss = useCallback(
    (s: Suggestion) => {
      setDismissed((prev) => {
        const next = new Set(prev);
        next.add(keyOf(s));
        return next;
      });
      trackFeatureClick('ai_suggestion_dismissed', {
        module: context.module,
        entityType: context.entityType,
        entityId: context.entityId,
        suggestion: s.title,
        endpoint: s.action?.endpoint,
      });
    },
    [context.module, context.entityType, context.entityId, trackFeatureClick],
  );

  const list = ruleBased ?? aiSuggestions ?? [];
  const visible = list.filter((s) => !dismissed.has(keyOf(s)));

  // Nothing to show, and we're not in a loading/failed AI state → render nothing.
  if (!loading && !failed && visible.length === 0) return null;

  return (
    <section
      className={cn(
        'rounded-xl border border-indigo-200 bg-indigo-50/50 px-3 py-2.5 dark:border-indigo-900/40 dark:bg-indigo-900/10',
        className,
      )}
      aria-label={title}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-indigo-500" aria-hidden />
        <h3 className="text-xs font-semibold text-indigo-700 dark:text-indigo-300">{title}</h3>
      </div>

      {loading && (
        <p className="text-xs text-indigo-600/80 dark:text-indigo-300/80" role="status">
          Thinking through the options…
        </p>
      )}

      {failed && (
        <p className="text-xs text-slate-500 dark:text-slate-400" role="status">
          AI suggestions unavailable
        </p>
      )}

      {!loading && !failed && (
        <ul className="space-y-2">
          {visible.map((s) => (
            <li
              key={keyOf(s)}
              className="rounded-lg border border-indigo-100 bg-white px-3 py-2 dark:border-indigo-900/30 dark:bg-gray-900"
            >
              <div className="flex items-start gap-2">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-gray-800 dark:text-gray-100">{s.title}</p>
                  <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">{s.rationale}</p>

                  {s.action && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <InsightActionButton
                        label={s.action.label}
                        successToast={`${s.title} — done`}
                        pingBell
                        confirm={s.action.confirm}
                        onAction={() =>
                          apiClient.request({
                            method: s.action?.method ?? 'POST',
                            url: s.action?.endpoint ?? '',
                            data: s.action?.payload,
                          })
                        }
                        onDone={() => handleExecuted(s)}
                      />
                      {(s.action.cost || s.action.risk) && (
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          {s.action.cost && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              cost: {s.action.cost}
                            </span>
                          )}
                          {s.action.risk && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              risk: {s.action.risk}
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleDismiss(s)}
                  title="Dismiss this suggestion"
                  aria-label={`Dismiss: ${s.title}`}
                  className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {executedCount > 0 && (
        <p className="mt-2 text-[10px] text-indigo-600/70 dark:text-indigo-300/70">
          {executedCount} action{executedCount === 1 ? '' : 's'} executed from AI suggestions
        </p>
      )}
    </section>
  );
}
