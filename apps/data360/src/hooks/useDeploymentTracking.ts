/**
 * Hooks for deployment tracking.
 *
 * useActiveDeployments — polls /deployments/track every 10s. Drives the
 *   header progress chip and the "Resume deploy" links in the notification
 *   dropdown.
 *
 * useDeploymentDetail — single-deployment polling (2s while non-terminal,
 *   then halts). Used by the deploy popup when the user reopens it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  getDeployment,
  isTerminal,
  listActiveDeployments,
  type DeploymentRow,
} from '@/app/services/deployment-tracking';
import { pingNotifications } from '@/hooks/useNotifications';

const ACTIVE_POLL_MS = 10_000;
const DETAIL_POLL_MS = 2_000;
const DETAIL_POLL_MS_BG = 5_000; // when tab is hidden

// ----- Active deployments (header chip + dropdown) ----------------------
export function useActiveDeployments() {
  const [items, setItems] = useState<DeploymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await listActiveDeployments();
      setItems(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(refresh, ACTIVE_POLL_MS);
    return () => window.clearInterval(t);
  }, [refresh]);

  return { items, loading, error, refresh };
}

// ----- Single deployment detail -----------------------------------------
export function useDeploymentDetail(deploymentId: string | null) {
  const [row, setRow] = useState<DeploymentRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const lastStatusRef = useRef<string | null>(null);

  const refresh = useCallback(async () => {
    if (!deploymentId) return;
    setLoading(true);
    try {
      const r = await getDeployment(deploymentId);
      setRow(r);
      setError(null);
      // When the status flips to terminal, ping the badge bus so the bell
      // counter refreshes without waiting for its own 30s poll.
      if (lastStatusRef.current && lastStatusRef.current !== r.status) {
        pingNotifications();
      }
      lastStatusRef.current = r.status;
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setLoading(false);
    }
  }, [deploymentId]);

  useEffect(() => {
    if (!deploymentId) {
      setRow(null);
      return;
    }
    void refresh();
    let timer: number;
    const schedule = () => {
      const next = row && isTerminal(row.status)
        ? 0                                       // stop polling
        : (document.hidden ? DETAIL_POLL_MS_BG : DETAIL_POLL_MS);
      if (next > 0) {
        timer = window.setTimeout(async () => {
          await refresh();
          schedule();
        }, next);
      }
    };
    schedule();
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deploymentId, row?.status]);

  return { row, loading, error, refresh };
}
