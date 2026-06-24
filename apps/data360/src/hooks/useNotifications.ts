/**
 * useNotifications — hooks for the notification dropdown + bell badge.
 *
 * Two surfaces:
 *   - useUnreadBadge()       cheap polling (30s) for the header bell counter
 *   - useNotificationsList() lazy fetch of the dropdown list (when opened)
 *
 * An in-memory pub/sub bus (`_badgeListeners`) lets one surface trigger
 * a refresh on the other (e.g. marking a row read in the dropdown drops
 * the badge counter immediately, without waiting 30s).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  listNotifications,
  getUnreadCount,
  markRead as svcMarkRead,
  markAllRead as svcMarkAllRead,
  type NotificationItem,
  type NotificationListResponse,
  type ListParams,
} from '@/app/services/notifications';

const UNREAD_POLL_MS = 30_000;
const LIST_POLL_MS = 60_000;

// ----- in-memory bus -----------------------------------------------------
let _badgeListeners: Array<() => void> = [];
function _broadcastBadgeChange(): void {
  _badgeListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* listener errors must not poison the bus */
    }
  });
}

// ----- bell badge --------------------------------------------------------
// Exponential backoff for failures (e.g. Snowflake notifications table not
// yet created): 30s → 1m → 2m → 4m → 8m → cap 15m. Resets on first success.
// Hard-stops after 5 consecutive failures so an undeployed
// /notifications/unread-count endpoint doesn't spam the console every 30s
// for the entire session (the bug the user reported).
const UNREAD_MAX_POLL_MS = 900_000; // 15 min cap
const UNREAD_MAX_FAILURES = 5;
export function useUnreadBadge() {
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);
  const failuresRef = useRef<number>(0);
  const deadRef = useRef<boolean>(false);
  const [tick, setTick] = useState(0);

  const refresh = useCallback(async () => {
    if (deadRef.current) return;
    setLoading(true);
    try {
      const n = await getUnreadCount();
      setCount(n);
      if (failuresRef.current > 0) {
        failuresRef.current = 0;
        setTick((t) => t + 1);
      }
    } catch {
      // Silent: header badge errors must not poison the page.
      failuresRef.current += 1;
      if (failuresRef.current >= UNREAD_MAX_FAILURES) {
        deadRef.current = true; // stop polling for the session
      } else {
        setTick((t) => t + 1);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const currentInterval =
    failuresRef.current === 0
      ? UNREAD_POLL_MS
      : Math.min(
          UNREAD_POLL_MS * 2 ** (failuresRef.current - 1),
          UNREAD_MAX_POLL_MS,
        );

  // Initial fetch — runs once on mount.
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Timer + listener. Does NOT re-fire refresh() on every interval change;
  // the timer fires it. That was the spam bug.
  useEffect(() => {
    if (deadRef.current) return;
    // Don't poll the unread badge while the tab is hidden; resume on return.
    const timer = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void refresh();
    }, currentInterval);
    const listener = () => {
      void refresh();
    };
    _badgeListeners.push(listener);
    const onVisible = () => {
      if (typeof document !== 'undefined' && !document.hidden) void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      _badgeListeners = _badgeListeners.filter((l) => l !== listener);
      document.removeEventListener('visibilitychange', onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  return { count, loading, refresh };
}

// ----- dropdown list -----------------------------------------------------
export function useNotificationsList(
  params: ListParams = {},
  opts: { enabled?: boolean } = {}
) {
  const { enabled = true } = opts;
  const [data, setData] = useState<NotificationListResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);
  const paramsRef = useRef<ListParams>(params);
  paramsRef.current = params;

  const refresh = useCallback(async () => {
    if (!enabled) return;
    setLoading(true);
    setError(null);
    try {
      const res = await listNotifications(paramsRef.current);
      setData(res);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    void refresh();
    const timer = window.setInterval(refresh, LIST_POLL_MS);
    return () => window.clearInterval(timer);
  }, [enabled, refresh]);

  const markRead = useCallback(
    async (id: string) => {
      // Optimistic UI: drop unread badge + flag the row locally first.
      setData((prev) =>
        prev
          ? {
              ...prev,
              unread_count: Math.max(0, prev.unread_count - 1),
              items: prev.items.map((i) =>
                i.notification_id === id
                  ? { ...i, read_at: new Date().toISOString() }
                  : i
              ),
            }
          : prev
      );
      try {
        await svcMarkRead(id);
        _broadcastBadgeChange();
      } catch (e) {
        await refresh();
        throw e;
      }
    },
    [refresh]
  );

  const markAllRead = useCallback(async () => {
    setData((prev) =>
      prev
        ? {
            ...prev,
            unread_count: 0,
            items: prev.items.map((i) => ({
              ...i,
              read_at: i.read_at ?? new Date().toISOString(),
            })),
          }
        : prev
    );
    try {
      await svcMarkAllRead();
      _broadcastBadgeChange();
    } catch (e) {
      await refresh();
      throw e;
    }
  }, [refresh]);

  return {
    items: data?.items ?? ([] as NotificationItem[]),
    unreadCount: data?.unread_count ?? 0,
    total: data?.total ?? 0,
    loading,
    error,
    refresh,
    markRead,
    markAllRead,
  };
}

/** Programmatic trigger — call this from anywhere after an action that
 *  should bump the bell counter (e.g. after launching a long deploy you
 *  know will generate a notification when it completes). */
export function pingNotifications(): void {
  _broadcastBadgeChange();
}
