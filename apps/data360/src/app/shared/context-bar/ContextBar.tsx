'use client';

/**
 * ContextBar — the ONE right rail for every module (2026 unification).
 *
 * Converges explore-design's `ContextRightBar` (mini-rail + tabbed expandable
 * panel, per-selection context) and the generic `ActionRail` (non-blocking
 * slide-in). A persistent vertical mini-rail of icons; clicking one opens a
 * frosted `GlassPanel` (depth 2) with that tab's content. Non-blocking
 * (`aria-modal="false"`), Esc collapses. Secondary work — config, AI, runs,
 * quality, deploy, history, and the detect→act CTAs — lives HERE, not in the
 * page header (see `_ux-unification` + `_design-system-2026`).
 *
 * Controlled or uncontrolled for both `activeKey` and `open`.
 */
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';
import { X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassPanel } from '@/app/shared/glass';

export interface ContextBarTab {
  key: string;
  icon: LucideIcon;
  label: string;
  /** Optional count/dot shown on the mini-rail icon. */
  badge?: ReactNode;
  content: ReactNode;
}

export interface ContextBarProps {
  tabs: ContextBarTab[];
  /** Controlled active tab. */
  activeKey?: string;
  defaultActiveKey?: string;
  onActiveChange?: (key: string) => void;
  /** Controlled open state of the expandable panel. */
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Context label shown in the panel header (e.g. the selected table). */
  entityLabel?: ReactNode;
  /** Panel width in px. Default 380. */
  widthPx?: number;
  className?: string;
}

export default function ContextBar({
  tabs,
  activeKey,
  defaultActiveKey,
  onActiveChange,
  open,
  defaultOpen = false,
  onOpenChange,
  entityLabel,
  widthPx = 380,
  className,
}: ContextBarProps) {
  const labelId = useId();
  const [activeUncontrolled, setActiveUncontrolled] = useState(
    defaultActiveKey ?? tabs[0]?.key,
  );
  const [openUncontrolled, setOpenUncontrolled] = useState(defaultOpen);

  const active = activeKey ?? activeUncontrolled;
  const isOpen = open ?? openUncontrolled;

  const setOpen = useCallback(
    (next: boolean) => {
      if (open === undefined) setOpenUncontrolled(next);
      onOpenChange?.(next);
    },
    [open, onOpenChange],
  );

  const setActive = useCallback(
    (key: string) => {
      if (activeKey === undefined) setActiveUncontrolled(key);
      onActiveChange?.(key);
    },
    [activeKey, onActiveChange],
  );

  // Esc collapses the panel (non-blocking — doesn't trap focus).
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, setOpen]);

  const handleTabClick = (key: string) => {
    if (key === active && isOpen) {
      setOpen(false);
      return;
    }
    setActive(key);
    setOpen(true);
  };

  const activeTab = tabs.find((t) => t.key === active);

  return (
    <div className={cn('flex h-full items-stretch', className)}>
      {/* Expandable panel (left of the mini-rail) */}
      {isOpen && activeTab && (
        <GlassPanel
          depth={2}
          radius="2xl"
          role="region"
          aria-label={typeof entityLabel === 'string' ? entityLabel : activeTab.label}
          className="mr-1.5 flex flex-col overflow-hidden"
          style={{ width: widthPx }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-white/30 px-3 py-2 dark:border-white/10">
            <div className="flex min-w-0 items-center gap-2">
              <activeTab.icon className="h-4 w-4 shrink-0 text-slate-600 dark:text-slate-300" />
              <div className="min-w-0">
                <p
                  id={labelId}
                  className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100"
                >
                  {activeTab.label}
                </p>
                {entityLabel && (
                  <p className="truncate text-[10px] text-slate-500 dark:text-slate-400">
                    {entityLabel}
                  </p>
                )}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Collapse panel"
              className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white/40 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="scrollbar-thin flex-1 overflow-y-auto p-3">{activeTab.content}</div>
        </GlassPanel>
      )}

      {/* Mini-rail (always visible) */}
      <GlassPanel
        depth={2}
        radius="2xl"
        className="flex w-12 flex-col items-center gap-1 py-2"
        role="tablist"
        aria-orientation="vertical"
      >
        {tabs.map((tab) => {
          const selected = tab.key === active && isOpen;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              title={tab.label}
              onClick={() => handleTabClick(tab.key)}
              className={cn(
                'relative flex h-9 w-9 items-center justify-center rounded-xl transition-colors',
                selected
                  ? 'bg-[hsl(var(--primary))] text-white shadow-sm'
                  : 'text-slate-500 hover:bg-white/50 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-slate-100',
              )}
            >
              <tab.icon className="h-[18px] w-[18px]" />
              {tab.badge != null && (
                <span className="absolute -right-0.5 -top-0.5 flex min-w-[14px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold leading-none text-white">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </GlassPanel>
    </div>
  );
}
