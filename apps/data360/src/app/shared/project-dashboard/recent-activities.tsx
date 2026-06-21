'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useAtomValue } from 'jotai';
import { AlertTriangle, Inbox, MousePointerClick, RefreshCw } from 'lucide-react';
import { Box, Flex, Loader, Text } from 'rizzui';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import SimpleBar from 'simplebar-react';
import cn from '@core/utils/class-names';
import { replaceUnderscoreDash } from '@core/utils/replace-underscore-dash';
import WidgetCard from '@core/components/cards/widget-card';
import { listEvents } from '@/app/services/api/projectsApi';
import type { ProjectEvent } from '@/app/services/api/types';
import { useProjectContext } from '@/hooks/useProjectContext';

type LoadState = 'loading' | 'error' | 'ready';

/** Compact relative time — mirrors the command-center helper. */
function relativeTime(ts: string | null | undefined): string {
  if (!ts) return '';
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

/**
 * Recent Activities — the selected project's real event log from
 * GET /projects/{id}/events. Replaces the old static feed of invented
 * "Rachel Green added a new task…" lines.
 *
 * The active project comes from the shared useProjectContext atom, set by
 * clicking a row in Project Summary. There is no account-wide event endpoint
 * (GET /projects/events/all does not exist), so until a project is picked this
 * shows an honest "select a project" prompt rather than a fabricated feed.
 */
export default function RecentActivities({ className }: { className?: string }) {
  const { activeProject } = useProjectContext('projects');
  const projectId = activeProject?.id ?? null;

  const [events, setEvents] = useState<ProjectEvent[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!projectId) return;
    let ignore = false;
    setState('loading');
    listEvents(projectId, { limit: 50 })
      .then((res) => {
        if (ignore) return;
        setEvents(res?.events ?? []);
        setState('ready');
      })
      .catch(() => {
        if (!ignore) setState('error');
      });
    return () => {
      ignore = true;
    };
  }, [projectId, reloadKey]);

  // Real-time refresh: refetch the selected project's event log when the backend
  // broadcasts a PROJECT_EVENTS cache invalidation over SSE (a new event is
  // recorded for this project). Reads the shared single SSE connection via the
  // provider atom — no extra connection opened. The identity ref skips the
  // persisted mount-time value so only post-mount events trigger a refetch; the
  // fetch effect above no-ops when no project is selected.
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  const seenInvalidationRef = useRef(lastInvalidation);
  useEffect(() => {
    if (lastInvalidation === seenInvalidationRef.current) return;
    seenInvalidationRef.current = lastInvalidation;
    if (lastInvalidation?.keys.includes(CACHE_KEYS.PROJECT_EVENTS)) {
      setReloadKey((k) => k + 1);
    }
  }, [lastInvalidation]);

  return (
    <WidgetCard
      title="Recent Activities"
      description={
        activeProject?.name ? `Activity for ${activeProject.name}` : undefined
      }
      className={cn('@container dark:bg-gray-100/50', className)}
    >
      <SimpleBar className="mt-4 h-[505px] @3xl/pd:h-[700px] @7xl/pd:h-[380px]">
        {!projectId ? (
          <EmptyState
            icon={<MousePointerClick className="h-8 w-8" />}
            message="Select a project from the summary to view its activity."
          />
        ) : state === 'loading' ? (
          <div className="flex h-full min-h-[200px] items-center justify-center">
            <Loader variant="spinner" size="lg" />
          </div>
        ) : state === 'error' ? (
          <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-3 text-center">
            <AlertTriangle className="h-6 w-6 text-amber-500" />
            <Text className="text-sm text-gray-600 dark:text-gray-300">
              Couldn’t load activity.
            </Text>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-600 dark:text-gray-200 dark:hover:bg-gray-800"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </button>
          </div>
        ) : events.length === 0 ? (
          <EmptyState
            icon={<Inbox className="h-8 w-8" />}
            message="No activity recorded for this project yet."
          />
        ) : (
          <Box className="space-y-2 p-0.5">
            {events.map((event) => (
              <EventRow key={event.event_id} event={event} />
            ))}
          </Box>
        )}
      </SimpleBar>
    </WidgetCard>
  );
}

function EventRow({ event }: { event: ProjectEvent }) {
  // Honest field rendering — no synthesized narrative. Title is the humanized
  // event type; the meta line carries the real actor, module and timestamp.
  const title = event.event_type
    ? replaceUnderscoreDash(event.event_type).toLowerCase()
    : 'event';
  // Username is identity data — show it verbatim (don't title-case it).
  const moduleLabel = event.module_name
    ? replaceUnderscoreDash(event.module_name).toLowerCase()
    : null;

  return (
    <Box className="space-y-1 rounded-lg bg-gray-50 p-4 dark:bg-gray-100">
      <Flex align="center" justify="between" className="gap-2">
        <Text className="font-semibold capitalize text-gray-700">{title}</Text>
        <Text className="shrink-0 text-gray-400">
          {relativeTime(event.timestamp)}
        </Text>
      </Flex>
      {(event.username || moduleLabel) && (
        <Flex align="center" className="w-auto gap-1.5 text-gray-400">
          {event.username ? <Text>{event.username}</Text> : null}
          {event.username && moduleLabel ? <span aria-hidden>·</span> : null}
          {moduleLabel ? <Text className="capitalize">{moduleLabel}</Text> : null}
        </Flex>
      )}
    </Box>
  );
}

function EmptyState({
  icon,
  message,
}: {
  icon: ReactNode;
  message: string;
}) {
  return (
    <div className="flex h-full min-h-[200px] flex-col items-center justify-center gap-2 px-6 text-center text-gray-400 dark:text-gray-500">
      {icon}
      <Text className="text-sm">{message}</Text>
    </div>
  );
}
