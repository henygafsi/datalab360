'use client';

/**
 * HistoryRail — collapsible right-rail showing the last N events recorded
 * for the current project, sourced from /projects/{id}/events
 * (EVENT_STORE.PROJECT_EVENTS).
 *
 * Slide 2 of the deck: "Trace changes done in UI and log them in EVENT
 * STORE" — this is the read side that surfaces those traces.
 *
 * Designed to mount next to the main canvas (right edge) in
 * explore-design/page.tsx. Auto-refreshes every 20s while the project
 * is the same.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import {
  PiCheckCircleDuotone,
  PiXCircleDuotone,
  PiClockCountdownDuotone,
  PiInfoDuotone,
  PiArrowsClockwiseBold,
} from 'react-icons/pi';
import { ChevronRight, ChevronLeft, History } from 'lucide-react';
import { ActionIcon } from 'rizzui';
import { cn } from '@/lib/utils';
import { listEvents } from '@/app/services/api/projectsApi';
import type { ProjectEvent } from '@/app/services/api/types';

dayjs.extend(relativeTime);

const POLL_MS = 20_000;

type StatusTone = { Icon: React.ComponentType<{ className?: string }>; tone: string };

const STATUS_TONE: Record<string, StatusTone> = {
  SUCCESS:   { Icon: PiCheckCircleDuotone,    tone: 'text-emerald-500' },
  COMPLETED: { Icon: PiCheckCircleDuotone,    tone: 'text-emerald-500' },
  FAILED:    { Icon: PiXCircleDuotone,        tone: 'text-rose-500' },
  ERROR:     { Icon: PiXCircleDuotone,        tone: 'text-rose-500' },
  PENDING:   { Icon: PiClockCountdownDuotone, tone: 'text-amber-500' },
  RUNNING:   { Icon: PiClockCountdownDuotone, tone: 'text-blue-500' },
};

function eventAppearance(status: string | null | undefined): StatusTone {
  if (!status) return { Icon: PiInfoDuotone, tone: 'text-slate-400' };
  return STATUS_TONE[status.toUpperCase()] ?? { Icon: PiInfoDuotone, tone: 'text-slate-400' };
}

function formatEventType(t: string): string {
  return t.replace(/_/g, ' ').toLowerCase().replace(/(^|\s)\w/g, m => m.toUpperCase());
}

export interface HistoryRailProps {
  projectId: string | null;
  open: boolean;
  onToggle: () => void;
  className?: string;
}

export default function HistoryRail({
  projectId,
  open,
  onToggle,
  className,
}: HistoryRailProps) {
  const [items, setItems] = useState<ProjectEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const res = await listEvents(projectId, { limit: 25 });
      const list = ((res as any)?.data?.events ?? (res as any)?.events ?? []) as ProjectEvent[];
      setItems(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
    if (!open || !projectId) return;
    const t = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(t);
  }, [open, projectId, refresh]);

  const grouped = useMemo(() => {
    // Bucket by day for visual scanning.
    const map = new Map<string, ProjectEvent[]>();
    for (const item of items) {
      const day = dayjs(item.timestamp).format('YYYY-MM-DD');
      const arr = map.get(day) ?? [];
      arr.push(item);
      map.set(day, arr);
    }
    return Array.from(map.entries());
  }, [items]);

  // Collapsed rail: thin sliver with a History icon.
  if (!open) {
    return (
      <button
        type="button"
        aria-label="Open history rail"
        onClick={onToggle}
        className={cn(
          'flex h-full w-7 flex-col items-center justify-start gap-2 border-l bg-slate-50 py-2 dark:bg-slate-900 dark:border-slate-800',
          className,
        )}
      >
        <ChevronLeft className="h-3.5 w-3.5 text-slate-400" />
        <History className="h-4 w-4 text-slate-500" />
      </button>
    );
  }

  return (
    <aside
      className={cn(
        'flex h-full w-80 flex-col border-l bg-white dark:bg-slate-900 dark:border-slate-800',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b px-3 py-2 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-900 dark:text-white">History</span>
          {items.length > 0 && (
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
              {items.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <ActionIcon
            size="sm"
            variant="text"
            aria-label="Refresh"
            onClick={() => void refresh()}
            className={loading ? 'animate-spin' : ''}
          >
            <PiArrowsClockwiseBold />
          </ActionIcon>
          <ActionIcon size="sm" variant="text" aria-label="Collapse" onClick={onToggle}>
            <ChevronRight className="h-3.5 w-3.5" />
          </ActionIcon>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {!projectId && (
          <div className="px-2 py-6 text-center text-xs text-slate-400">
            Select a project to see its activity.
          </div>
        )}
        {projectId && loading && items.length === 0 && (
          <div className="px-2 py-6 text-center text-xs text-slate-400">Loading…</div>
        )}
        {projectId && !loading && items.length === 0 && (
          <div className="px-2 py-6 text-center text-xs text-slate-400">
            No events yet. Actions you take (rename, mapping, ingest, deploy) will show up here.
          </div>
        )}
        {error && (
          <div className="m-2 rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300">
            {error}
          </div>
        )}
        {grouped.map(([day, dayItems]) => (
          <div key={day} className="mb-2">
            <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {dayjs(day).format('ddd · MMM D')}
            </div>
            <ul className="space-y-0.5">
              {dayItems.map((ev) => {
                const { Icon, tone } = eventAppearance(ev.status);
                return (
                  <li
                    key={ev.event_id}
                    className="flex items-start gap-2 rounded px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <Icon className={cn('mt-0.5 h-3.5 w-3.5 shrink-0', tone)} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-xs font-medium text-slate-900 dark:text-slate-100">
                          {formatEventType(ev.event_type)}
                          {ev.event_subtype && (
                            <span className="ml-1 text-slate-400">
                              · {formatEventType(ev.event_subtype)}
                            </span>
                          )}
                        </span>
                        <span className="whitespace-nowrap text-[10px] text-slate-400">
                          {dayjs(ev.timestamp).format('HH:mm')}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {ev.username}
                        {ev.entity_type && ev.entity_id && (
                          <span className="ml-1">
                            · {ev.entity_type}:<span className="font-mono">{ev.entity_id}</span>
                          </span>
                        )}
                        {typeof ev.duration_ms === 'number' && ev.duration_ms > 0 && (
                          <span className="ml-1">· {Math.round(ev.duration_ms)}ms</span>
                        )}
                      </div>
                      {ev.error_message && (
                        <div className="mt-0.5 line-clamp-2 text-[11px] text-rose-500">
                          {ev.error_message}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}
