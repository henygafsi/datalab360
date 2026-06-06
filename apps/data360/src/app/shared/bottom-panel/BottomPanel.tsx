'use client';

/**
 * BottomPanel — a glass, bottom-docked output drawer (2026 design system).
 *
 * The horizontal counterpart to `ContextBar`: docks at the bottom of its
 * container to show OUTPUTS (table data, ingestion SQL, run logs) without
 * leaving the canvas. Collapsible to a thin handle, drag-resizable, auto-opens
 * when the parent sets `open` (e.g. on node click) and hides on demand.
 *
 * Controlled `open`; optional tabbed content (or a single `children`).
 */
import {
  useCallback,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { ChevronDown, ChevronUp, GripHorizontal, X, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassPanel } from '@/app/shared/glass';

export interface BottomPanelTab {
  key: string;
  label: string;
  icon?: LucideIcon;
  badge?: ReactNode;
  content: ReactNode;
}

export interface BottomPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  tabs?: BottomPanelTab[];
  activeKey?: string;
  onActiveChange?: (key: string) => void;
  /** Open height in px. Default 280. */
  defaultHeight?: number;
  minHeight?: number;
  maxHeight?: number;
  children?: ReactNode;
  className?: string;
}

export default function BottomPanel({
  open,
  onOpenChange,
  title,
  tabs,
  activeKey,
  onActiveChange,
  defaultHeight = 280,
  minHeight = 140,
  maxHeight = 640,
  children,
  className,
}: BottomPanelProps) {
  const [height, setHeight] = useState(defaultHeight);
  const [activeUncontrolled, setActiveUncontrolled] = useState(tabs?.[0]?.key);
  const drag = useRef<{ startY: number; startH: number } | null>(null);

  const active = activeKey ?? activeUncontrolled;
  const setActive = useCallback(
    (key: string) => {
      if (activeKey === undefined) setActiveUncontrolled(key);
      onActiveChange?.(key);
    },
    [activeKey, onActiveChange],
  );

  const onPointerMove = useCallback(
    (e: PointerEvent) => {
      if (!drag.current) return;
      const delta = drag.current.startY - e.clientY;
      const next = Math.min(maxHeight, Math.max(minHeight, drag.current.startH + delta));
      setHeight(next);
    },
    [maxHeight, minHeight],
  );

  const endDrag = useCallback(() => {
    drag.current = null;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', endDrag);
  }, [onPointerMove]);

  const startDrag = useCallback(
    (e: ReactPointerEvent) => {
      e.preventDefault();
      drag.current = { startY: e.clientY, startH: height };
      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', endDrag);
    },
    [height, onPointerMove, endDrag],
  );

  // Collapsed: a thin reopen handle.
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => onOpenChange(true)}
        className={cn(
          'glass-1 flex w-full items-center justify-center gap-1.5 rounded-t-xl py-1 text-[11px] font-medium text-slate-500 transition-colors hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100',
          className,
        )}
        title="Show output"
      >
        <ChevronUp className="h-3.5 w-3.5" />
        {title ?? 'Output'}
      </button>
    );
  }

  const activeTab = tabs?.find((t) => t.key === active);

  return (
    <GlassPanel
      depth={2}
      radius="2xl"
      className={cn('flex flex-col overflow-hidden rounded-b-none', className)}
      style={{ height }}
    >
      {/* Resize handle */}
      <div
        onPointerDown={startDrag}
        className="flex cursor-row-resize items-center justify-center border-b border-white/30 py-0.5 dark:border-white/10"
        title="Drag to resize"
      >
        <GripHorizontal className="h-3.5 w-3.5 text-slate-400" />
      </div>

      {/* Header: tabs + collapse/close */}
      <div className="flex items-center justify-between gap-2 border-b border-white/30 px-2 dark:border-white/10">
        <div className="flex min-w-0 items-center gap-1 overflow-x-auto">
          {tabs && tabs.length > 0 ? (
            tabs.map((tab) => {
              const selected = tab.key === active;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActive(tab.key)}
                  className={cn(
                    'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-1.5 text-[11px] font-medium transition-colors',
                    selected
                      ? 'border-[hsl(var(--primary))] text-slate-900 dark:text-white'
                      : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100',
                  )}
                >
                  {tab.icon && <tab.icon className="h-3.5 w-3.5" />}
                  {tab.label}
                  {tab.badge != null && (
                    <span className="rounded-full bg-slate-200 px-1.5 text-[9px] font-semibold text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })
          ) : (
            <span className="px-2 py-1.5 text-[11px] font-semibold text-slate-700 dark:text-slate-200">
              {title}
            </span>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Collapse panel"
            title="Collapse"
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white/40 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Close panel"
            title="Close"
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-white/40 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="scrollbar-thin min-h-0 flex-1 overflow-auto p-2">
        {activeTab ? activeTab.content : children}
      </div>
    </GlassPanel>
  );
}
