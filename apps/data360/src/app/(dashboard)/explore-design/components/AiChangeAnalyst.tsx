'use client';

/**
 * AiChangeAnalyst — the live change-analyst feed at the bottom of the
 * right-bar (redesign spec §5). NOT a generic AI tab: it renders this
 * project's ai/history events reverse-chronologically with axis chips +
 * relative time, and "interview" items carry Apply / Dismiss actions that
 * append an outcome event back to the feed.
 *
 * Data: GET/POST /explore-design/{id}/ai/history (new contract). 404/501 →
 * honest "not available yet" card. Refresh is SSE-driven via the singleton
 * cache-invalidation subscription (no polling) + a manual refresh button.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Bot, Check, RefreshCw, Sparkles, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import { isUnavailable } from '@/lib/http-status';
import {
  CACHE_KEYS,
  useOnCacheInvalidation,
} from '@/components/providers/CacheInvalidationProvider';
import { useCanPerform } from '@/hooks/useCanPerform';
import {
  appendAiHistory,
  getAiHistory,
} from './release/api';
import {
  AXIS_LABEL,
  type AiHistoryEvent,
  type AxisId,
} from './release/types';
import {
  ErrorNote,
  SkeletonRows,
  relativeTime,
} from './release/ui';

// Fixed per-axis chip hues (literal classes — purge-safe).
const AXIS_CHIP_CLASS: Record<AxisId, string> = {
  overview: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  ingestion: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
  data_quality: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400',
  governance: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  impact_cost: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400',
  release: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  history: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  warning: 'bg-amber-500',
  info: 'bg-blue-400',
};

/** SSE keys whose invalidation may mean new analyst observations. */
const ANALYST_CACHE_KEYS: ReadonlySet<string> = new Set([
  CACHE_KEYS.PROJECT_EVENTS,
  CACHE_KEYS.PROJECTS,
  CACHE_KEYS.DEPLOYMENTS,
  CACHE_KEYS.CORTEX,
]);

function isInterview(e: AiHistoryEvent): boolean {
  if (e.kind === 'interview' || e.kind === 'question') return true;
  const p = e.payload;
  return Boolean(p && (p.suggestion || p.suggested_action || p.actions));
}

function eventKey(e: AiHistoryEvent, i: number): string {
  return `${e.ts}-${e.kind}-${i}`;
}

export interface AiChangeAnalystProps {
  projectId: string | null;
  /** Max events fetched (server-side limit). */
  limit?: number;
  className?: string;
}

export default function AiChangeAnalyst({
  projectId,
  limit = 50,
  className,
}: AiChangeAnalystProps) {
  const [events, setEvents] = useState<AiHistoryEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  /** Interview items already answered locally (keyed by ts). */
  const [handled, setHandled] = useState<Set<string>>(new Set());
  const [acting, setActing] = useState<string | null>(null);

  const perm = useCanPerform('explore_design', 'edit', projectId);
  const canAct = perm.allowed || perm.loading;

  const load = useCallback(async () => {
    if (!projectId) {
      setEvents([]);
      setError(null);
      setUnavailable(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await getAiHistory(projectId, limit);
      setEvents(res.events ?? []);
      setUnavailable(false);
    } catch (err) {
      if (isUnavailable(err)) setUnavailable(true);
      else setError(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [projectId, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  // SSE-driven refresh through the singleton provider (no extra stream).
  useOnCacheInvalidation(ANALYST_CACHE_KEYS, () => {
    if (projectId && !unavailable) void load();
  });

  const sorted = useMemo(
    () =>
      [...events].sort(
        (a, b) => (Date.parse(b.ts) || 0) - (Date.parse(a.ts) || 0),
      ),
    [events],
  );

  const answer = useCallback(
    async (e: AiHistoryEvent, decision: 'applied' | 'dismissed') => {
      if (!projectId) return;
      setActing(e.ts);
      try {
        await appendAiHistory(projectId, {
          kind: 'outcome',
          axis: e.axis ?? undefined,
          severity: 'info',
          message:
            decision === 'applied'
              ? `Suggestion accepted: ${e.message}`
              : `Suggestion dismissed: ${e.message}`,
          payload: { source_ts: e.ts, decision },
        });
        setHandled((prev) => new Set(prev).add(e.ts));
        toast.success(decision === 'applied' ? 'Suggestion applied' : 'Suggestion dismissed');
        void load();
      } catch (err) {
        if (isUnavailable(err)) setUnavailable(true);
        else toast.error(getApiErrorMessage(err));
      } finally {
        setActing(null);
      }
    },
    [projectId, load],
  );

  return (
    <section
      className={cn(
        'rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/60',
        className,
      )}
      aria-label="AI change analyst"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-700/60">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100">
          <Sparkles className="h-3.5 w-3.5 text-blue-500" aria-hidden="true" />
          AI Change Analyst
          <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium uppercase text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
            Live
          </span>
        </h4>
        <button
          type="button"
          onClick={load}
          disabled={loading || !projectId}
          aria-label="Refresh analyst feed"
          title="Refresh analyst feed"
          className="rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} aria-hidden="true" />
        </button>
      </div>

      <div className="p-3">
        {!projectId ? (
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            Select a project to see its change analysis.
          </p>
        ) : loading && events.length === 0 ? (
          <SkeletonRows rows={3} />
        ) : unavailable ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-600 dark:bg-slate-800/40 dark:text-slate-400">
            <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            The change analyst is not available yet on this environment.
          </div>
        ) : error ? (
          <ErrorNote message={error} onRetry={load} />
        ) : sorted.length === 0 ? (
          <div className="flex items-center gap-2 text-[11px] text-slate-400 dark:text-slate-500">
            <Bot className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Analyst has no observations yet.
          </div>
        ) : (
          <ol className="max-h-64 space-y-2 overflow-auto">
            {sorted.map((e, i) => {
              const axis = (e.axis ?? null) as AxisId | null;
              const interview = isInterview(e) && !handled.has(e.ts) && e.kind !== 'outcome';
              return (
                <li
                  key={eventKey(e, i)}
                  className="rounded-md border border-slate-100 p-2 dark:border-slate-700/60"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-1.5">
                      <span
                        className={cn(
                          'mt-1 h-1.5 w-1.5 shrink-0 rounded-full',
                          SEVERITY_DOT[String(e.severity ?? 'info')] ?? SEVERITY_DOT.info,
                        )}
                        aria-hidden="true"
                      />
                      <p className="text-[11px] leading-snug text-slate-700 dark:text-slate-200">
                        {e.message}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
                      {relativeTime(e.ts)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-3">
                    {axis && AXIS_LABEL[axis] && (
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.5 text-[9px] font-medium',
                          AXIS_CHIP_CLASS[axis],
                        )}
                      >
                        {AXIS_LABEL[axis]}
                      </span>
                    )}
                    <span className="text-[9px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      {e.kind}
                    </span>
                    {interview && (
                      <span className="ml-auto flex gap-1">
                        <button
                          type="button"
                          onClick={() => answer(e, 'applied')}
                          disabled={acting !== null || !canAct}
                          title={
                            !canAct ? 'Your role does not permit this action' : undefined
                          }
                          className="inline-flex items-center gap-0.5 rounded bg-blue-600 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Check className="h-2.5 w-2.5" aria-hidden="true" />
                          Apply suggestion
                        </button>
                        <button
                          type="button"
                          onClick={() => answer(e, 'dismissed')}
                          disabled={acting !== null || !canAct}
                          title={
                            !canAct ? 'Your role does not permit this action' : undefined
                          }
                          className="inline-flex items-center gap-0.5 rounded border border-slate-300 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                        >
                          <X className="h-2.5 w-2.5" aria-hidden="true" />
                          Dismiss
                        </button>
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}
