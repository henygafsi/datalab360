'use client';

/**
 * AiSessionCounter — Floating, dismissible badge that surfaces total AI
 * credits consumed in the current browser session. Persists in
 * sessionStorage (resets when the tab closes — by design, for QA).
 *
 * Behaviour:
 *   - Renders bottom-right.
 *   - When session total < 0.01 cr → collapses to a tiny dot.
 *   - Click → opens a dropdown listing the last 20 charges.
 *   - Reset button clears the session log (does NOT touch the monthly log).
 *   - Dismissible — preference stored in sessionStorage.
 *   - aria-live="polite" so the cost ticking up is announced.
 */

import { useEffect, useRef, useState } from 'react';
import { Activity, X, RotateCcw, ChevronUp } from 'lucide-react';
import cn from '@core/utils/class-names';
import { useAiSession } from '@/app/(dashboard)/intelligent/store/ai-store';

function formatCredits(credits: number): string {
  if (!Number.isFinite(credits) || credits <= 0) return '0';
  if (credits < 0.001) return '<0.001';
  if (credits < 1) return credits.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
  return credits.toFixed(2);
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export default function AiSessionCounter() {
  const { charges, total, dismissed, dismiss, reset } = useAiSession();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // Hydration guard — sessionStorage is client-only.
  useEffect(() => setMounted(true), []);

  // Close dropdown on outside click.
  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!mounted || dismissed) return null;

  const callCount = charges.length;
  const last20 = [...charges].slice(-20).reverse();
  const collapsed = total < 0.01;

  return (
    <div
      ref={rootRef}
      className="fixed bottom-4 right-4 z-[60] flex flex-col items-end gap-2"
      data-testid="ai-session-counter"
    >
      {/* Dropdown */}
      {open && (
        <div className="w-80 max-h-96 rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2 dark:border-slate-700">
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white">
                AI session usage
              </div>
              <div className="text-[10px] text-slate-500 dark:text-slate-400">
                Resets when the tab closes
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close session usage panel"
              className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
            >
              <ChevronUp className="h-4 w-4 rotate-180" />
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto px-3 py-2">
            {last20.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-500">
                No AI calls in this session yet.
              </div>
            ) : (
              <ul className="space-y-1.5">
                {last20.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[11px] hover:bg-slate-50 dark:hover:bg-slate-700/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-700 dark:text-slate-200">
                        {c.featureKey}
                      </div>
                      <div className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                        {c.model ?? 'default'} · {formatTime(c.timestamp)}
                      </div>
                    </div>
                    <div className="text-right font-semibold tabular-nums text-amber-600 dark:text-amber-400">
                      {formatCredits(c.credits)} cr
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2 dark:border-slate-700">
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-700 dark:hover:text-white"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white"
            >
              <X className="h-3 w-3" />
              Dismiss for session
            </button>
          </div>
        </div>
      )}

      {/* Pill / dot */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-live="polite"
        aria-label={`AI session usage: ${formatCredits(total)} credits across ${callCount} calls`}
        className={cn(
          'group relative inline-flex items-center gap-2 rounded-full border bg-white shadow-md transition-all dark:bg-slate-800',
          collapsed
            ? 'h-3 w-3 border-amber-300 p-0 dark:border-amber-700'
            : 'h-8 border-amber-200 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 dark:border-amber-900/50 dark:text-amber-300 dark:hover:bg-amber-900/20',
        )}
      >
        {!collapsed && (
          <>
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="tabular-nums">
              {formatCredits(total)} cr this session
            </span>
            <span className="text-slate-400 dark:text-slate-500">·</span>
            <span className="tabular-nums text-slate-500 dark:text-slate-400">
              {callCount} {callCount === 1 ? 'call' : 'calls'}
            </span>
          </>
        )}
        {collapsed && (
          <span className="absolute inset-0 rounded-full bg-amber-400/40 animate-pulse" />
        )}
      </button>
    </div>
  );
}
