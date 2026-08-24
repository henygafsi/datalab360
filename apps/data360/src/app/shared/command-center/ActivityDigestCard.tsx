'use client';

/**
 * ActivityDigestCard — COCO narrates ALL platform events (not just errors).
 *
 * Fetches GET /org-accounts/platform-activity/insight: a Cortex digest of the
 * last 24h of EVENT_STORE — busiest modules, failures, top event types — plus
 * the auditable basis those sentences were derived from. The basis rows are
 * rendered right under the narrative so it reads as evidence, not fluff.
 *
 * Data-first: skeleton until the real response lands (a cold call can take
 * ~20s — the endpoint caches server-side for 15 min). When Cortex degrades the
 * card keeps the hard basis counts and says the summary is unavailable; it
 * never invents one. Transient failures render an inline Retry.
 */

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getPlatformActivityInsight,
  type ActivityInsightResponse,
} from '@/app/services/org-accounts/hooks';

const MAX_MODULES = 8;
const MAX_EVENT_TYPES = 6;
const MAX_FAILURES = 3;

// Module-level cache + in-flight dedup. The card remounts when its parent lane
// flips loading→loaded (different tree shapes) and it renders on two tabs
// (account, platform-activity) — without this, each mount refires the ~20s
// cold Cortex call. Server caches 15 min; mirror a short client TTL here.
const DIGEST_TTL_MS = 5 * 60_000;
let digestCache: { at: number; data: ActivityInsightResponse } | null = null;
let digestInFlight: Promise<ActivityInsightResponse> | null = null;

async function fetchDigestOnce(force = false): Promise<ActivityInsightResponse> {
  if (!force && digestCache && Date.now() - digestCache.at < DIGEST_TTL_MS) {
    return digestCache.data;
  }
  if (!digestInFlight) {
    digestInFlight = getPlatformActivityInsight()
      .then((d) => {
        digestCache = { at: Date.now(), data: d };
        return d;
      })
      .finally(() => {
        digestInFlight = null;
      });
  }
  return digestInFlight;
}

/** "2026-07-10T06:38" → "06:38" (keeps the raw string when unparsable). */
function fmtTime(at: string): string {
  const t = at.split('T')[1];
  return t ? t.slice(0, 5) : at;
}

function Skeleton() {
  return (
    <div
      className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900"
      aria-busy="true"
      aria-label="Loading activity digest"
    >
      <div className="mb-3 h-3 w-44 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      <div className="space-y-2">
        <div className="h-3.5 w-full animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-3.5 w-5/6 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        <div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
      </div>
      <div className="mt-3 flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-5 w-20 animate-pulse rounded-full bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
    </div>
  );
}

export default function ActivityDigestCard() {
  const [data, setData] = useState<ActivityInsightResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetchDigestOnce(force));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the activity digest');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading && !data) return <Skeleton />;

  if (error && !data) {
    return (
      <div
        data-testid="activity-digest-card"
        className="flex items-center justify-between rounded-xl border border-dashed border-slate-300 px-4 py-3 text-xs text-slate-500 dark:border-slate-700"
      >
        <span className="inline-flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" aria-hidden="true" />
          {error}
        </span>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <RefreshCw className="h-3 w-3" /> Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const modules = Array.isArray(data.basis?.modules) ? data.basis.modules : [];
  const eventTypes = Array.isArray(data.basis?.top_event_types) ? data.basis.top_event_types : [];
  const failures = Array.isArray(data.basis?.recent_failures) ? data.basis.recent_failures : [];
  // Honest totals: null (→ no evidence line) when the basis carries no rows,
  // never a fabricated 0-sum over an absent window.
  const totalEvents = modules.length > 0 ? modules.reduce((s, m) => s + (m.events || 0), 0) : null;
  const totalFailed = modules.length > 0 ? modules.reduce((s, m) => s + (m.failed || 0), 0) : null;

  return (
    <section
      aria-label="Activity digest"
      data-testid="activity-digest-card"
      className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900"
    >
      <header className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-500" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Activity digest · last {data.period_hours}h
        </h3>
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          {data.model}
        </span>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          aria-label="Refresh activity digest"
          className="ml-auto rounded p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-50 dark:hover:bg-slate-800"
        >
          <RefreshCw className={cn('h-3.5 w-3.5', loading && 'animate-spin')} />
        </button>
      </header>

      {/* COCO's narrative — or an honest degrade keeping the hard counts below. */}
      {data.narrative ? (
        <p className="whitespace-pre-line text-[11.5px] leading-5 text-slate-700 dark:text-slate-200">
          {data.narrative}
        </p>
      ) : (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Digest unavailable{data.degraded_reason ? ` (${data.degraded_reason.slice(0, 80)})` : ''} — the
          counts below are read straight from EVENT_STORE.
        </p>
      )}

      {/* Auditable basis — the exact rows COCO read. */}
      <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/60 p-3 dark:border-slate-800 dark:bg-slate-800/30">
        <div className="mb-2 flex items-center gap-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Basis — what COCO read
          </span>
          {totalEvents != null && (
            <span className="text-[10px] text-slate-400 dark:text-slate-500">
              {totalEvents.toLocaleString()} events · {modules.length} modules
              {totalFailed ? ` · ${totalFailed} failed` : ''} · {data.basis.window_hours}h window
            </span>
          )}
        </div>

        {modules.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {modules.slice(0, MAX_MODULES).map((m) => (
              <span
                key={m.module}
                title={`${m.events.toLocaleString()} events · ${m.failed} failed · ${m.users} user(s)`}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[10px] font-medium tabular-nums',
                  m.failed > 0
                    ? 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300'
                    : 'border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
                )}
              >
                {m.module} {m.events.toLocaleString()}
                {m.failed > 0 && ` · ${m.failed} failed`}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-slate-400 dark:text-slate-500">
            No events recorded in this window.
          </p>
        )}

        {eventTypes.length > 0 && (
          <p className="mt-2 truncate text-[10px] text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-600 dark:text-slate-300">Top events:</span>{' '}
            {eventTypes.slice(0, MAX_EVENT_TYPES).map((t) => `${t.type} ×${t.count}`).join(' · ')}
          </p>
        )}

        {failures.length > 0 && (
          <ul className="mt-2 space-y-1">
            {failures.slice(0, MAX_FAILURES).map((f, i) => (
              <li
                key={`${f.type}-${f.at}-${i}`}
                title={f.detail}
                className="flex items-start gap-1.5 text-[10px] text-slate-500 dark:text-slate-400"
              >
                <AlertTriangle className="mt-px h-3 w-3 flex-shrink-0 text-rose-400" aria-hidden="true" />
                <span className="min-w-0 truncate">
                  <span className="font-medium text-rose-600 dark:text-rose-400">{f.type}</span>
                  {' · '}{f.user} · {fmtTime(f.at)} · {f.detail.replace(/\s+/g, ' ').slice(0, 90)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
