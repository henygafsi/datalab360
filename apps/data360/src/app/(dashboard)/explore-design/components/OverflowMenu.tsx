'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Tooltip } from 'rizzui';
import { MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';

// Overflow menu — holds secondary toolbar actions so the page header can
// fit on one line. Click toggles a small popover; click outside closes it.
// Each item is a {label, icon, onClick, active?, disabled?} entry rendered
// as a row with optional active highlight (e.g. when a panel is currently
// open) so the user still has a visual indicator of toggle state.
export interface OverflowItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  /** Optional accent color (`'violet' | 'teal' | 'purple'`) when active. */
  activeColor?: 'violet' | 'teal' | 'purple' | 'blue';
}
export const OverflowMenu: React.FC<{ items: OverflowItem[] }> = ({ items }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <Tooltip content="More actions">
        <button
          aria-label="More actions"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'flex items-center justify-center rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
            open && 'bg-slate-100 dark:bg-slate-700',
          )}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </Tooltip>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 min-w-[200px] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {items.map((it) => {
            const Icon = it.icon;
            const activeAccent =
              it.active && it.activeColor
                ? {
                    violet: 'text-violet-600 dark:text-violet-400',
                    teal: 'text-teal-600 dark:text-teal-400',
                    purple: 'text-purple-600 dark:text-purple-400',
                    blue: 'text-blue-600 dark:text-blue-400',
                  }[it.activeColor]
                : '';
            return (
              <button
                key={it.label}
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  it.onClick();
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  it.active
                    ? 'bg-slate-50 dark:bg-slate-800'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800',
                )}
              >
                <Icon className={cn('h-3.5 w-3.5 text-slate-500', activeAccent)} />
                <span className={cn('text-slate-700 dark:text-slate-200', activeAccent)}>{it.label}</span>
                {it.active && (
                  <span className="ml-auto text-[10px] uppercase text-slate-400">on</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default OverflowMenu;
