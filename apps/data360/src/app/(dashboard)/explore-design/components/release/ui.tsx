'use client';

/**
 * Release tab — tiny shared UI primitives (kept local to the release folder).
 * 4-state discipline: skeleton / honest-empty / error-retry / unavailable.
 * Numbers are never fabricated — missing values render as '—'.
 */

import React from 'react';
import { AlertTriangle, CloudOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCanPerform } from '@/hooks/useCanPerform';

// ── Formatting ───────────────────────────────────────────────────────────────

/** Honest number formatting: null/undefined → '—' (never a fake 0). */
export function fmtCount(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : String(v);
}

/** Relative time, e.g. "3m ago" / "2h ago" / "5d ago". Invalid → '—'. */
export function relativeTime(ts: string | null | undefined): string {
  if (!ts) return '—';
  const t = Date.parse(ts);
  if (Number.isNaN(t)) return '—';
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Layout primitives ────────────────────────────────────────────────────────

export function StepSection({
  title,
  subtitle,
  actions,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/60',
        className,
      )}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-100">{title}</h4>
          {subtitle && (
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1.5">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-700/60"
        />
      ))}
    </div>
  );
}

/** Honest "backend not there yet" note (useActionGate philosophy). */
export function UnavailableNote({ what }: { what: string }) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-600 dark:bg-slate-800/40 dark:text-slate-400">
      <CloudOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{what} is not available yet on this environment.</span>
    </div>
  );
}

export function ErrorNote({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
      <span className="flex min-w-0 items-center gap-2">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span className="truncate">{message}</span>
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex shrink-0 items-center gap-1 rounded border border-red-300 px-1.5 py-0.5 font-medium hover:bg-red-100 dark:border-red-700 dark:hover:bg-red-900/40"
        >
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
          Retry
        </button>
      )}
    </div>
  );
}

// ── Buttons ──────────────────────────────────────────────────────────────────

type ButtonVariant = 'primary' | 'neutral' | 'danger';

const BUTTON_CLASS: Record<ButtonVariant, string> = {
  primary:
    'bg-blue-600 text-white hover:bg-blue-700 disabled:hover:bg-blue-600',
  neutral:
    'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:hover:bg-red-600',
};

export function StepButton({
  variant = 'neutral',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      {...props}
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60',
        BUTTON_CLASS[variant],
        className,
      )}
    />
  );
}

// ── RBAC gating helper (disabled + tooltip idiom) ────────────────────────────

export interface GatedAction {
  /** False only on a resolved deny — fail-open while loading (existing idiom). */
  allowed: boolean;
  /** Tooltip explaining a deny; undefined when allowed. */
  deniedTitle: string | undefined;
}

/**
 * useGatedAction('approve') → { allowed, deniedTitle } for
 * useCanPerform('explore_design', action). Buttons render
 * `disabled={... || !allowed}` + `title={deniedTitle}`.
 */
export function useGatedAction(action: string, projectId?: string | null): GatedAction {
  const perm = useCanPerform('explore_design', action, projectId);
  const allowed = perm.allowed || perm.loading;
  return {
    allowed,
    deniedTitle: allowed ? undefined : 'Your role does not permit this action',
  };
}
