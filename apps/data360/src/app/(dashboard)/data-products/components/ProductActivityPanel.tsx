'use client';

/**
 * ProductActivityPanel — lifecycle event timeline for a single data product.
 *
 * Closes the lifecycle-completeness gap: publish / subscribe / refresh / KPI
 * actions all emit catalog events, but nothing surfaced the audit trail on the
 * product itself. This reads the REAL captured endpoint
 * `GET /catalog/events?product_id=...` (PROJECT_EVENTS WHERE module=CATALOG,
 * verified live in the API reference) via the shared catalog service and renders
 * a read-only, lazy-loaded timeline.
 *
 * Read-only — no mutation, so no RBAC gate. Honest states throughout:
 * Idle -> Loading -> Empty ("No activity yet") / Error (inline retry). No fake
 * rows, never a fabricated count. Auto-refreshes when the backend busts the
 * data-product / catalog-product caches (i.e. after a publish/subscribe/refresh).
 */
import { useCallback, useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import {
  AlertCircle,
  ChevronDown,
  ChevronRight,
  History,
} from 'lucide-react';
import { getApiErrorMessage } from '@/lib/api-client';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import {
  getCatalogEvents,
  type CatalogEvent,
} from '@/app/services/catalog';

type AsyncState = 'idle' | 'running' | 'done' | 'error';

export interface ProductActivityPanelProps {
  productId: string;
}

/** Humanize a raw event_type token (e.g. PRODUCT_PUBLISHED -> Product published). */
function eventLabel(type: string): string {
  if (!type) return 'Event';
  const words = type.replace(/[._]/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Best-effort relative/absolute timestamp; never throws on a bad value. */
function fmtTs(ts: string | undefined): string {
  if (!ts) return '—';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return ts;
  return d.toLocaleString();
}

/** Short actor line from an event scope, ASCII-safe. */
function actorLine(ev: CatalogEvent): string | null {
  const parts = [ev.scope?.user, ev.scope?.role].filter(Boolean) as string[];
  return parts.length ? parts.join(' / ') : null;
}

export default function ProductActivityPanel({ productId }: ProductActivityPanelProps) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<AsyncState>('idle');
  const [events, setEvents] = useState<CatalogEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('running');
    setError(null);
    try {
      const res = await getCatalogEvents({ product_id: productId, limit: 25 });
      setEvents(res.events ?? []);
      setState('done');
    } catch (err) {
      setError(getApiErrorMessage(err));
      setState('error');
    }
  }, [productId]);

  const toggle = useCallback(() => {
    setOpen((v) => {
      const next = !v;
      if (next && state === 'idle') void load();
      return next;
    });
  }, [state, load]);

  // SSE: when a publish/subscribe/refresh busts the product caches, the event
  // timeline is stale. Reload only when already open + settled (avoid the mount
  // double-fetch — lastInvalidationAtom is a persistent non-null global).
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  useEffect(() => {
    if (!open || !lastInvalidation) return;
    if (state === 'idle' || state === 'running') return;
    const relevant = lastInvalidation.keys.some(
      (k: string) => k === CACHE_KEYS.DATA_PRODUCTS || k === CACHE_KEYS.CATALOG_PRODUCTS,
    );
    if (relevant) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastInvalidation]);

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300"
      >
        <History className="h-3.5 w-3.5" />
        <span className="flex-1 text-left">Activity</span>
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
        )}
      </button>

      {open && (
        <div className="space-y-2">
          {state === 'running' || state === 'idle' ? (
            <div className="space-y-1.5" aria-hidden="true">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-7 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
              ))}
            </div>
          ) : state === 'error' ? (
            <div className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
              <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
              <div className="flex-1">
                <span className="break-words">{error}</span>{' '}
                <button type="button" className="underline" onClick={() => void load()}>
                  Retry
                </button>
              </div>
            </div>
          ) : events.length === 0 ? (
            <p className="px-1 py-2 text-[11px] text-slate-400">No activity yet.</p>
          ) : (
            <ol className="space-y-1.5">
              {events.map((ev, i) => {
                const actor = actorLine(ev);
                return (
                  <li
                    key={`${ev.event_ts}-${ev.reference_id ?? i}`}
                    className="flex items-start gap-2 rounded-lg border border-slate-100 px-2.5 py-1.5 dark:border-slate-800"
                  >
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium text-slate-800 dark:text-slate-200">
                        {eventLabel(ev.event_type)}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {fmtTs(ev.event_ts)}
                        {actor ? ` · ${actor}` : ''}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {state === 'done' && (
            <button
              type="button"
              onClick={() => void load()}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-medium text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
            >
              Refresh activity
            </button>
          )}
        </div>
      )}
    </div>
  );
}
