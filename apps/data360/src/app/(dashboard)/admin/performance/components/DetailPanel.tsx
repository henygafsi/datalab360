'use client';

/**
 * DetailPanel — always-visible right rail (aria-modal=false, never a modal).
 *
 * - endpoint selection → shows the picked route header + helper copy.
 * - user selection → calls {@link getPerfUserDetail} and renders the user's
 *   top endpoints, recent errors, and cache-by-module breakdown.
 */
import { MousePointerClick, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import EmptyState from '@/components/ui/EmptyState';
import { GlassPanel } from '@/app/shared/glass';
import { getPerfUserDetail } from '@/app/services/admin-performance';
import {
  HitRateBar,
  STATUS_TINT,
  ErrorRetry,
  NotDeployedBanner,
  fmtInt,
  fmtMs,
  fmtPct,
  fmtTime,
} from './shared';
import { usePerfFetch } from './usePerfFetch';
import type { PerfSelection } from './AxisPanels';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      {children}
    </div>
  );
}

function UserDetailBody({ account, username, hours }: { account: string; username: string; hours: number }) {
  const { data, state, error, reload } = usePerfFetch(
    () => getPerfUserDetail(account, username, hours),
    [account, username, hours],
    null,
  );

  if (state === 'not-deployed') return <NotDeployedBanner what="User drill-down" />;
  if (state === 'error') return <ErrorRetry message={error || 'Failed to load'} onRetry={reload} />;
  if (state === 'loading' || !data)
    return (
      <div className="space-y-2 p-1" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
        ))}
      </div>
    );

  const k = data.kpis;
  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-3 gap-1.5">
        {[
          ['Requests', fmtInt(k.requests)],
          ['Queries', fmtInt(k.distinct_paths)],
          ['Avg', fmtMs(k.avg_ms)],
          ['Err %', fmtPct(k.error_rate)],
          ['Cache', fmtPct(k.cache_hit_rate, 0)],
          ['Deny %', fmtPct(k.deny_rate)],
        ].map(([label, val]) => (
          <div key={label} className="rounded-lg bg-slate-50 px-2 py-1.5 dark:bg-slate-800/50">
            <p className="text-[9px] uppercase tracking-wide text-slate-400">{label}</p>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{val}</p>
          </div>
        ))}
      </div>

      <Section title="Top endpoints">
        {data.top_endpoints.length === 0 ? (
          <p className="text-[11px] text-slate-400">—</p>
        ) : (
          <ul className="space-y-1">
            {data.top_endpoints.map((e) => (
              <li key={`${e.method} ${e.path}`} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate font-mono text-slate-600 dark:text-slate-300" title={`${e.method} ${e.path}`}>
                  <span className="text-slate-400">{e.method}</span> {e.path}
                </span>
                <span className="shrink-0 rounded-full bg-slate-100 px-1.5 text-[10px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">{fmtInt(e.requests)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Cache by module">
        {data.cache_by_module.length === 0 ? (
          <p className="text-[11px] text-slate-400">—</p>
        ) : (
          <ul className="space-y-1">
            {data.cache_by_module.map((c) => (
              <li key={c.key} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="truncate text-slate-600 dark:text-slate-300" title={c.key}>{c.key || '—'}</span>
                <HitRateBar rate={c.cache_hit_rate} />
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Recent errors">
        {data.recent_errors.length === 0 ? (
          <p className="text-[11px] text-slate-400">No errors</p>
        ) : (
          <ul className="space-y-1">
            {data.recent_errors.map((e, i) => (
              <li key={`${e.ts}-${i}`} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className={cn('rounded-full px-1.5 py-0.5 text-[9px] font-semibold', STATUS_TINT(e.status))}>{e.status}</span>
                  <span className="truncate font-mono text-slate-600 dark:text-slate-300" title={`${e.method} ${e.path}`}>{e.path}</span>
                </span>
                <span className="shrink-0 text-[10px] text-slate-400">{fmtTime(e.ts)}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

export default function DetailPanel({
  account,
  hours,
  selection,
  onClose,
}: {
  account: string;
  hours: number;
  selection: PerfSelection;
  onClose: () => void;
}) {
  return (
    <GlassPanel depth={1} radius="xl" role="complementary" aria-label="Detail" className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/30 px-3 py-2 dark:border-white/10">
        <p className="text-xs font-semibold text-slate-700 dark:text-slate-200">
          {selection?.kind === 'user' ? 'User drill-down' : selection?.kind === 'endpoint' ? 'Endpoint detail' : 'Detail'}
        </p>
        {selection && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Clear selection"
            className="rounded-md p-0.5 text-slate-400 hover:bg-white/50 hover:text-slate-600 dark:hover:bg-white/10"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="scrollbar-thin flex-1 overflow-auto p-3">
        {!selection ? (
          <EmptyState icon={MousePointerClick} compact title="Select a row" description="Pick an endpoint or user to drill in." />
        ) : selection.kind === 'user' ? (
          <UserDetailBody account={account} username={selection.username} hours={hours} />
        ) : (
          <div className="space-y-2">
            <div className="rounded-lg bg-slate-50 px-2.5 py-2 font-mono text-[11px] text-slate-700 dark:bg-slate-800/50 dark:text-slate-200">
              <span className="text-slate-400">{selection.method}</span> {selection.path}
            </div>
            <p className="text-[11px] leading-snug text-slate-400">
              Per-endpoint timings, error rate and cache hit-rate are shown in the Endpoints table for this account.
              Switch to the Users axis to drill into who is calling this route.
            </p>
          </div>
        )}
      </div>
    </GlassPanel>
  );
}
