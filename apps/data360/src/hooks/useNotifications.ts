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
export function useUnreadBadge() {
  const [count, setCount] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const n = await getUnreadCount();
      setCount(n);
    } catch {
      // Silent: header badge errors must not poison the page.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(refresh, UNREAD_POLL_MS);
    const listener = () => {
      void refresh();
    };
    _badgeListeners.push(listener);
    return () => {
      window.clearInterval(timer);
      _badgeListeners = _badgeListeners.filter((l) => l !== listener);
    };
  }, [refresh]);

  return { count, loading, refresh };
}

// ----- dropdown list -----------------------------------------------------
export function useNotificationsList(
  params: ListParams = {},
  opts: { enabled?: boolean } = {},
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
                  : i,
              ),
            }
          : prev,
      );
      try {
        await svcMarkRead(id);
        _broadcastBadgeChange();
      } catch (e) {
        await refresh();
        throw e;
      }
    },
    [refresh],
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
        : prev,
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
