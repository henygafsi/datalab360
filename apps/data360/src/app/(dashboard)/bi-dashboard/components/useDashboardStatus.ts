'use client';

/**
 * useDashboardStatus — shared draft/live publish state for one BI dashboard.
 *
 * The top-right pill (in [projectId]/page.tsx → ProjectStatusBadges) and the
 * Publish/Unpublish action (in BiSmartRightBar) live in different React trees
 * and the right bar is mounted by DashboardEditor (which this agent can't edit
 * to thread props through). So a tiny module-level pub/sub keyed by projectId
 * keeps every consumer of the same dashboard in sync: publishing in the right
 * bar instantly flips the top-bar pill.
 *
 * The /status, /publish, /unpublish routes are NEW on the backend. Until uvicorn
 * is restarted they 404 — treated as `unavailable` (feature not provisioned),
 * never a hard error: the pill falls back to the seed status and the publish
 * button disables itself with an honest note.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getDashboardStatus,
  publishDashboard,
  unpublishDashboard,
  isBiRouteUnavailable,
  type DashboardLiveStatus,
  type PublishResult,
} from '@/app/services/api/biDashboardApi';

type StatusListener = (status: DashboardLiveStatus) => void;

const _status = new Map<string, DashboardLiveStatus>();
const _listeners = new Map<string, Set<StatusListener>>();

function _broadcast(projectId: string, status: DashboardLiveStatus) {
  _status.set(projectId, status);
  _listeners.get(projectId)?.forEach((fn) => fn(status));
}

export interface UseDashboardStatus {
  status: DashboardLiveStatus;
  loading: boolean;
  /** Backend route not provisioned yet (404/501) → publish disabled honestly. */
  unavailable: boolean;
  busy: boolean;
  shareCount: number | null;
  publishedBy: string | null;
  publishedAt: string | null;
  publish: () => Promise<PublishResult>;
  unpublish: () => Promise<PublishResult>;
  refresh: () => Promise<void>;
}

export function useDashboardStatus(
  projectId: string,
  initial: DashboardLiveStatus = 'draft',
): UseDashboardStatus {
  const [status, setStatus] = useState<DashboardLiveStatus>(
    () => _status.get(projectId) ?? initial,
  );
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shareCount, setShareCount] = useState<number | null>(null);
  const [publishedBy, setPublishedBy] = useState<string | null>(null);
  const [publishedAt, setPublishedAt] = useState<string | null>(null);
  const mounted = useRef(true);

  // Subscribe so sibling consumers (top-bar pill + right-bar action) stay synced.
  useEffect(() => {
    mounted.current = true;
    const set = _listeners.get(projectId) ?? new Set<StatusListener>();
    _listeners.set(projectId, set);
    const fn: StatusListener = (s) => {
      if (mounted.current) setStatus(s);
    };
    set.add(fn);
    return () => {
      mounted.current = false;
      set.delete(fn);
    };
  }, [projectId]);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const s = await getDashboardStatus(projectId);
      if (!mounted.current) return;
      setUnavailable(false);
      setShareCount(s.share_count ?? null);
      setPublishedBy(s.published_by ?? null);
      setPublishedAt(s.published_at ?? null);
      _broadcast(projectId, s.status === 'live' ? 'live' : 'draft');
    } catch (err) {
      if (!mounted.current) return;
      // Route not live yet → keep the seed/draft pill, mark unavailable.
      if (isBiRouteUnavailable(err)) setUnavailable(true);
      // Other errors: leave last-known status untouched (no fake state).
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const publish = useCallback(async () => {
    setBusy(true);
    try {
      const res = await publishDashboard(projectId);
      _broadcast(projectId, 'live');
      if (mounted.current) {
        setPublishedBy(res.published_by ?? null);
        setPublishedAt(res.published_at ?? null);
        setUnavailable(false);
      }
      return res;
    } catch (err) {
      if (mounted.current && isBiRouteUnavailable(err)) setUnavailable(true);
      throw err;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [projectId]);

  const unpublish = useCallback(async () => {
    setBusy(true);
    try {
      const res = await unpublishDashboard(projectId);
      _broadcast(projectId, 'draft');
      if (mounted.current) setUnavailable(false);
      return res;
    } catch (err) {
      if (mounted.current && isBiRouteUnavailable(err)) setUnavailable(true);
      throw err;
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, [projectId]);

  return {
    status,
    loading,
    unavailable,
    busy,
    shareCount,
    publishedBy,
    publishedAt,
    publish,
    unpublish,
    refresh,
  };
}
