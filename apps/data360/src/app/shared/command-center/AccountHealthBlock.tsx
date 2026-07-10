'use client';

/**
 * AccountHealthBlock — the "Snowflake account health" pulse at the top of the
 * right rail (FINAL-TAB-DISPLAY-SPEC wave 2): six chips answering "is the
 * account OK right now" identically on every page.
 *
 *   warehouses running/total · credits today vs 7d avg · failed-query % 24h ·
 *   failed logins 24h · storage TB · DMF coverage
 *
 * One fetch of GET /api/administration/account-health (backend holds a 5-min
 * shared cache slot). Data-first: skeleton until the response lands; a null
 * chip renders an honest "—" (the backend degrades per-chip); an absent
 * endpoint (404/501) collapses the whole block quietly.
 */

import React, { useEffect, useState } from 'react';
import cn from '@core/utils/class-names';
import {
  getAccountHealth,
  AccountHealthUnavailableError,
  type AccountHealth,
} from '@/app/services/administration/account-health';

type Tone = 'ok' | 'warn' | 'bad' | 'na';

const TONE_CLS: Record<Tone, string> = {
  ok: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  warn: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  bad: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  na: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

function Chip({ label, value, tone, title }: { label: string; value: string; tone: Tone; title?: string }) {
  return (
    <div
      title={title}
      className={cn('flex items-baseline justify-between gap-1 rounded-md px-1.5 py-1', TONE_CLS[tone])}
    >
      <span className="truncate text-[9.5px] font-medium uppercase tracking-wide opacity-80">{label}</span>
      <span className="whitespace-nowrap text-[10.5px] font-semibold tabular-nums">{value}</span>
    </div>
  );
}

export default function AccountHealthBlock({ className }: { className?: string }) {
  const [health, setHealth] = useState<AccountHealth | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'absent' | 'error'>('loading');

  useEffect(() => {
    let cancelled = false;
    getAccountHealth()
      .then((h) => {
        if (cancelled) return;
        setHealth(h);
        setState('ready');
      })
      .catch((err) => {
        if (cancelled) return;
        setState(err instanceof AccountHealthUnavailableError ? 'absent' : 'error');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state === 'absent') return null; // endpoint not deployed — no dead chrome

  const c = health?.chips;

  return (
    <div
      data-testid="account-health-block"
      className={cn(
        'rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-700 dark:bg-slate-900',
        className,
      )}
    >
      <div className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        Snowflake account health
      </div>
      {state === 'loading' ? (
        <div className="space-y-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-5 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : state === 'error' || !c ? (
        <p className="text-[10px] text-slate-400">Pulse unavailable — retry on next visit.</p>
      ) : (
        <div className="grid grid-cols-1 gap-1">
          <Chip
            label="Warehouses"
            value={c.warehouses ? `${c.warehouses.running}/${c.warehouses.total} up` : '—'}
            tone={!c.warehouses ? 'na' : c.warehouses.queued > 0 ? 'warn' : 'ok'}
            title={c.warehouses ? `${c.warehouses.queued} queued` : undefined}
          />
          <Chip
            label="Credits today"
            value={c.credits ? `${c.credits.today.toFixed(1)}` : '—'}
            tone={
              !c.credits ? 'na'
              : c.credits.today > c.credits.daily_avg_7d * 1.5 ? 'bad'
              : c.credits.today > c.credits.daily_avg_7d ? 'warn'
              : 'ok'
            }
            title={c.credits ? `7d daily avg ${c.credits.daily_avg_7d.toFixed(1)}` : undefined}
          />
          <Chip
            label="Query fails 24h"
            value={c.failed_queries ? `${c.failed_queries.fail_pct.toFixed(1)}%` : '—'}
            tone={
              !c.failed_queries ? 'na'
              : c.failed_queries.fail_pct >= 5 ? 'bad'
              : c.failed_queries.fail_pct >= 1 ? 'warn'
              : 'ok'
            }
            title={c.failed_queries ? `${c.failed_queries.failed_24h.toLocaleString()} of ${c.failed_queries.total_24h.toLocaleString()}` : undefined}
          />
          <Chip
            label="Failed logins"
            value={c.failed_logins ? c.failed_logins.failed_24h.toLocaleString() : '—'}
            tone={
              !c.failed_logins ? 'na'
              : c.failed_logins.failed_24h >= 100 ? 'bad'
              : c.failed_logins.failed_24h > 0 ? 'warn'
              : 'ok'
            }
          />
          <Chip
            label="Storage"
            value={c.storage ? `${c.storage.tb.toFixed(2)} TB` : '—'}
            tone={c.storage ? 'ok' : 'na'}
          />
          <Chip
            label="DMF coverage"
            value={c.dmf ? `${c.dmf.monitored_tables} tbl · ${c.dmf.measurements_7d}` : '—'}
            tone={!c.dmf ? 'na' : c.dmf.monitored_tables > 0 ? 'ok' : 'warn'}
            title={c.dmf ? `${c.dmf.measurements_7d} measurements over 7d` : undefined}
          />
        </div>
      )}
    </div>
  );
}
