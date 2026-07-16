'use client';

/**
 * FinopsInsightBlock — COCO's agentic reading of a FinOps axis, rendered inline
 * on top of the raw axis card (storage-split / warehouse-efficiency).
 *
 * Fetches a `/…/insight` endpoint whose response is a Cortex narrative + the
 * auditable `basis` it was derived from. Honesty contract (same as
 * ActivityDigestCard / ProblemsInsightStrip): the narrative is null (never
 * fabricated) when Cortex is unavailable — we then say so and let the hard
 * numbers below (the card's own charts) carry the truth.
 *
 * Data-first: a compact skeleton until the real narrative lands (a cold call
 * can take ~20s; the endpoint caches server-side for 15 min). Collapsed to a
 * few lines by default — the axis card stays scannable; "Read briefing" expands
 * the full ≤120-word CDO briefing. Transient failures render an inline Retry.
 *
 * This replaces "stare at the numbers" with one contextual, actionable insight
 * (each briefing ends with a single `NEXT:` action) — fewer, smarter surfaces.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FinopsInsightResponse } from '@/app/services/org-accounts/hooks';

interface Props {
  /** The insight fetcher — getStorageInsight or getWarehouseInsight. */
  fetcher: (days?: number) => Promise<FinopsInsightResponse>;
  days?: number;
  /** Short header, e.g. "COCO reads your storage". */
  title: string;
  'data-testid'?: string;
}

function Skeleton() {
  return (
    <div
      className="rounded-lg border border-violet-100 bg-violet-50/40 p-3 dark:border-violet-900/40 dark:bg-violet-950/20"
      aria-busy="true"
      aria-label="COCO is reading this axis"
    >
      <div className="mb-2 h-3 w-40 animate-pulse rounded bg-violet-100 dark:bg-violet-900/40" />
      <div className="space-y-1.5">
        <div className="h-3 w-full animate-pulse rounded bg-violet-100/70 dark:bg-violet-900/30" />
        <div className="h-3 w-4/5 animate-pulse rounded bg-violet-100/70 dark:bg-violet-900/30" />
      </div>
    </div>
  );
}

export default function FinopsInsightBlock({ fetcher, days = 30, title, ...rest }: Props) {
  const [data, setData] = useState<FinopsInsightResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetcher(days));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the COCO insight');
    } finally {
      setLoading(false);
    }
  }, [fetcher, days]);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) return <Skeleton />;

  if (error && !data) {
    return (
      <div
        data-testid={rest['data-testid']}
        className="flex items-center justify-between rounded-lg border border-dashed border-slate-300 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-700 dark:text-slate-400"
      >
        <span className="inline-flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" /> {error}
        </span>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const narrative = data.narrative;
  // Collapsed preview: first sentence-ish (before NEXT:) so the axis stays scannable.
  const preview = narrative
    ? narrative.replace(/\s+/g, ' ').slice(0, 150) + (narrative.length > 150 ? '…' : '')
    : null;

  return (
    <section
      data-testid={rest['data-testid']}
      aria-label={title}
      className="rounded-lg border border-violet-100 bg-violet-50/40 p-3 dark:border-violet-900/40 dark:bg-violet-950/20"
    >
      <header className="mb-1.5 flex items-center gap-1.5">
        <Sparkles className="h-3.5 w-3.5 text-violet-500" aria-hidden="true" />
        <span className="text-[11px] font-semibold text-violet-800 dark:text-violet-200">{title}</span>
        {data.model && (
          <span className="rounded-full bg-white/70 px-1.5 py-0.5 font-mono text-[9px] font-medium text-violet-500 dark:bg-slate-900/50 dark:text-violet-300">
            {data.model}
          </span>
        )}
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh COCO insight"
          className="ml-auto rounded p-0.5 text-violet-400 hover:bg-violet-100 disabled:opacity-50 dark:hover:bg-violet-900/40"
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
        </button>
      </header>

      {narrative ? (
        <>
          <p className="whitespace-pre-line text-[11.5px] leading-5 text-slate-700 dark:text-slate-200">
            {open ? narrative : preview}
          </p>
          {narrative.length > 150 && (
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="mt-1 text-[10.5px] font-medium text-violet-600 hover:underline dark:text-violet-300"
            >
              {open ? 'Show less' : 'Read briefing'}
            </button>
          )}
        </>
      ) : (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          {data.note
            ? data.note
            : `Briefing unavailable${data.degraded_reason ? ` (${data.degraded_reason.slice(0, 80)})` : ''} — the numbers below are read straight from ACCOUNT_USAGE.`}
        </p>
      )}
    </section>
  );
}
