'use client';

/**
 * IngestionBadge — compact, inline per-row Snowpipe/COPY ingestion indicator.
 *
 * Given a trace entry (from useIngestionTrace().lookup), renders:
 *   · ⚡ "Snowpipe · 2h"  when method === 'SNOWPIPE'
 *   · ↻ "Loaded · 2h"     when any COPY load exists
 *   · "—"                  when no trace / no load (NEVER a fake 0)
 * A red dot is appended when errors > 0.
 *
 * No-fake-0 rule: null/absent metrics render "—", never `?? 0`.
 */

import React from 'react';
import { Zap, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { IngestionTraceEntry } from '@/app/services/explore-design/ingestionTrace';

/** Short relative-time ("2h", "5m", "3d"), or null for absent/invalid input. */
export function relativeTimeShort(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diffMs = Date.now() - t;
  if (diffMs < 0) return 'now';
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d`;
  const mon = Math.floor(day / 30);
  if (mon < 12) return `${mon}mo`;
  return `${Math.floor(mon / 12)}y`;
}

export interface IngestionBadgeProps {
  entry: IngestionTraceEntry | null;
  className?: string;
}

export default function IngestionBadge({ entry, className }: IngestionBadgeProps) {
  // No data at all → honest em-dash (no-fake-0).
  if (!entry || (entry.method == null && entry.loads === 0)) {
    return (
      <span className={cn('inline-flex items-center text-[10px] text-slate-400', className)} title="No ingestion activity">
        —
      </span>
    );
  }

  const rel = relativeTimeShort(entry.lastLoad);
  const hasErrors = typeof entry.errors === 'number' && entry.errors > 0;
  const isSnowpipe = entry.method === 'SNOWPIPE';

  const Icon = isSnowpipe ? Zap : RefreshCw;
  const verb = isSnowpipe ? 'Snowpipe' : 'Loaded';
  const label = rel ? `${verb} · ${rel}` : verb;

  const tone = isSnowpipe
    ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';

  const errTitle = hasErrors ? ` — ${entry.errors} error${entry.errors === 1 ? '' : 's'} (7d)` : '';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full',
        tone,
        className,
      )}
      title={`${label}${errTitle}`}
    >
      <Icon className="h-2.5 w-2.5" />
      {label}
      {hasErrors && (
        <span
          className="ml-0.5 h-1.5 w-1.5 rounded-full bg-red-500"
          aria-label="ingestion errors present"
        />
      )}
    </span>
  );
}
