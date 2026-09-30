'use client';

/**
 * FreshnessChip — compact inline per-panel freshness indicator (AO-001).
 *
 * Renders the serving mode (cached / live / preparing) plus — when the
 * backend reports source lag — the real data timestamp, because
 * "fetched just now" never replaces the date of the data itself.
 */

import { type AoMeta, dataTimestamp, formatAge } from './meta';

interface FreshnessChipProps {
  meta?: AoMeta | null;
  className?: string;
}

function localHm(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function FreshnessChip({ meta, className }: FreshnessChipProps) {
  if (!meta) return null;

  const preparing = meta.state === 'preparing';

  let label: string | null = null;
  let dotClass = 'bg-slate-400';
  let pulse = false;

  if (preparing) {
    label = 'Preparing…';
    dotClass = 'bg-amber-500';
    pulse = true;
  } else if (meta.served_from === 'cache') {
    const age = formatAge(meta.cache_age_seconds);
    label = age ? `Cached ${age} ago` : 'Cached';
    dotClass = 'bg-slate-400';
  } else if (meta.served_from === 'live') {
    label = 'Live';
    dotClass = 'bg-emerald-500';
  }

  // Real data timestamp — shown whenever the source reports lag (as_of /
  // lag_seconds), so the user sees how old the data itself is.
  let dataTo: string | null = null;
  if (!preparing && (meta.as_of != null || meta.lag_seconds != null)) {
    const ts = dataTimestamp(meta);
    if (ts) {
      const hm = localHm(ts);
      if (hm) dataTo = `data to ${hm}`;
    }
  }

  if (!label && !dataTo) return null;

  const titleParts: string[] = [];
  if (meta.computed_at) titleParts.push(`Computed ${meta.computed_at}`);
  if (meta.cached_at) titleParts.push(`Cached ${meta.cached_at}`);
  if (meta.lag_seconds != null && Number.isFinite(meta.lag_seconds)) {
    titleParts.push(`Source lag ${Math.round(meta.lag_seconds / 60)} min`);
  }
  if (meta.as_of) titleParts.push(`Data as of ${meta.as_of}`);
  if (meta.scope) {
    titleParts.push(
      `Scope: ${meta.scope}${meta.scope_reason ? ` — ${meta.scope_reason}` : ''}`,
    );
  }

  const text = [label, dataTo].filter(Boolean).join(' · ');
  const textColor = meta.stale
    ? 'text-amber-600 dark:text-amber-500'
    : 'text-slate-500 dark:text-slate-400';

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap text-[11px] tabular-nums ${textColor} ${className ?? ''}`}
      title={titleParts.length ? titleParts.join(' · ') : undefined}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass} ${pulse ? 'animate-pulse' : ''}`}
      />
      {text}
    </span>
  );
}
