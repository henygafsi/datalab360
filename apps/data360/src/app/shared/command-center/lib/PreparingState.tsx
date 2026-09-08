'use client';

/**
 * PreparingState — honest "first computation running" panel state (B2).
 *
 * Calm by design: a small pulsing amber dot, no big spinner. The elapsed
 * time is computed client-side only (null on the server and on the first
 * client render) to avoid hydration mismatches.
 */

import { useEffect, useState } from 'react';

import { formatAge } from './meta';

interface PreparingStateProps {
  domainLabel?: string;
  startedAt?: string | null;
  compact?: boolean;
  className?: string;
}

export default function PreparingState({
  domainLabel,
  startedAt,
  compact = false,
  className,
}: PreparingStateProps) {
  const [elapsedSeconds, setElapsedSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (!startedAt) {
      setElapsedSeconds(null);
      return;
    }
    const startedMs = Date.parse(startedAt);
    if (Number.isNaN(startedMs)) {
      setElapsedSeconds(null);
      return;
    }
    const tick = () => setElapsedSeconds(Math.max(0, (Date.now() - startedMs) / 1000));
    tick();
    const id = setInterval(tick, 5000);
    return () => clearInterval(id);
  }, [startedAt]);

  const label = `Preparing ${domainLabel ?? 'this view'}`;
  const startedAgo =
    elapsedSeconds != null ? formatAge(elapsedSeconds) : null;

  const dot = (
    <span
      aria-hidden="true"
      className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-500"
    />
  );

  if (compact) {
    return (
      <span
        role="status"
        className={`inline-flex items-center gap-1.5 text-[11px] tabular-nums text-slate-500 dark:text-slate-400 ${className ?? ''}`}
      >
        {dot}
        {label}…{startedAgo ? ` · started ${startedAgo} ago` : ''}
      </span>
    );
  }

  return (
    <div
      role="status"
      className={`flex flex-col gap-1 py-4 ${className ?? ''}`}
    >
      <div className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
        {dot}
        <span>{label}</span>
      </div>
      <p className="pl-3.5 text-xs text-slate-500 dark:text-slate-400">
        First computation is running in the background — this view fills in
        automatically.
      </p>
      {startedAgo ? (
        <p className="pl-3.5 text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
          Started {startedAgo} ago
        </p>
      ) : null}
    </div>
  );
}
