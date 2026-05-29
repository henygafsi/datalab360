'use client';

import { useEffect, useState } from 'react';
import apiClient from '@/lib/api-client';
import cn from '@core/utils/class-names';

type Status = 'operational' | 'degraded' | 'down' | 'unknown';

interface StatusConfig {
  label: string;
  dotClass: string;
  textClass: string;
  bgClass: string;
}

const STATUS_CONFIG: Record<Status, StatusConfig> = {
  operational: {
    label: 'Operational',
    dotClass: 'bg-green-500',
    textClass: 'text-green-600 dark:text-green-400',
    bgClass: 'bg-green-50 dark:bg-green-900/20',
  },
  degraded: {
    label: 'Degraded',
    dotClass: 'bg-amber-500',
    textClass: 'text-amber-600 dark:text-amber-400',
    bgClass: 'bg-amber-50 dark:bg-amber-900/20',
  },
  down: {
    label: 'Down',
    dotClass: 'bg-red-500',
    textClass: 'text-red-600 dark:text-red-400',
    bgClass: 'bg-red-50 dark:bg-red-900/20',
  },
  unknown: {
    label: 'Status: unknown',
    dotClass: 'bg-slate-400',
    textClass: 'text-slate-500 dark:text-slate-400',
    bgClass: 'bg-slate-100 dark:bg-slate-800/40',
  },
};

const POLL_INTERVAL_MS = 60_000;

function normalize(raw: unknown): Status {
  if (typeof raw !== 'string') return 'unknown';
  const s = raw.toLowerCase();
  if (s === 'operational' || s === 'ok' || s === 'healthy' || s === 'up') return 'operational';
  if (s === 'degraded' || s === 'partial' || s === 'warning') return 'degraded';
  if (s === 'down' || s === 'error' || s === 'critical' || s === 'unhealthy') return 'down';
  return 'unknown';
}

export default function StatusPill() {
  const [status, setStatus] = useState<Status>('unknown');
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      try {
        // apiClient.baseURL is already `/api-proxy` in the browser — passing a
        // path that itself starts with `/api-proxy` doubles the prefix and 404s.
        // The backend exposes /health (simple liveness) — there's no
        // /health/summary route, so we treat any 2xx as "operational".
        const response = await apiClient.get('/health', {
          // Avoid noisy console errors for an optional endpoint
          validateStatus: () => true,
        });
        if (cancelled) return;
        if (response.status >= 200 && response.status < 300) {
          const data: any = response.data;
          const raw = data?.status ?? data?.health ?? data?.state;
          // /health may just return `{ "status": "ok" }` or even an empty
          // object — default to operational on any 2xx.
          setStatus(raw ? normalize(raw) : 'operational');
        } else {
          setStatus('unknown');
        }
      } catch {
        if (!cancelled) setStatus('unknown');
      } finally {
        if (!cancelled) setLastChecked(new Date());
      }
    };

    check();
    const id = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const config = STATUS_CONFIG[status];
  const title = lastChecked
    ? `Last checked: ${lastChecked.toLocaleTimeString()}`
    : 'Checking status…';

  return (
    <div
      role="status"
      aria-live="polite"
      title={title}
      className={cn(
        'flex items-center gap-1.5 rounded-full px-2.5 py-1',
        config.bgClass,
      )}
    >
      <span
        aria-hidden="true"
        className={cn('h-1.5 w-1.5 rounded-full', config.dotClass)}
      />
      <span className={cn('text-[11px] font-medium', config.textClass)}>
        {config.label}
      </span>
    </div>
  );
}
