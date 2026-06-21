'use client';

/**
 * RunActionsMenu.tsx
 *
 * Per-run kebab menu for the Execution History panel. Items, in order:
 *   1. Re-run with same inputs                   (calls executeWorkflow)
 *   2. Re-run with overrides…                    (placeholder unless run has inputs[])
 *   ───
 *   3. Compare with another run                  (puts panel into "pick target" mode)
 *   4. Mark / Unmark expected failure            (client-side localStorage flag)
 *   ───
 *   5. Kill this run                             (running only — Backend Gap card + hard confirm)
 *   6. Copy run ID                               (clipboard)
 *
 * A11y: button + role="menu" popover, focus trap on first item,
 *       Escape closes, click-outside closes.
 */

import * as React from 'react';
import {
  MoreHorizontal,
  RotateCcw,
  Sliders,
  GitCompare,
  ShieldCheck,
  ShieldX,
  Square,
  Copy as CopyIcon,
} from 'lucide-react';

import { cn } from '@/lib/utils';

export interface RunActionsMenuProps {
  runId: string;
  runStatus: string;
  isExpectedFailure: boolean;
  hasInputs: boolean;
  isCompareSourcePicked: boolean;
  onRerunSame: () => void;
  onRerunOverrides: () => void;
  onCompare: () => void;
  onToggleExpected: () => void;
  onKill: () => void;
  /** RBAC gate for the workflow-level cancel (execute permission). */
  canKill?: boolean;
  onCopyId: () => void;
}

interface MenuItemDef {
  key: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  disabled?: boolean;
  hidden?: boolean;
  destructive?: boolean;
  dividerBefore?: boolean;
  title?: string;
}

const RunActionsMenu: React.FC<RunActionsMenuProps> = ({
  runId,
  runStatus,
  isExpectedFailure,
  hasInputs,
  isCompareSourcePicked,
  onRerunSame,
  onRerunOverrides,
  onCompare,
  onToggleExpected,
  onKill,
  canKill = true,
  onCopyId,
}) => {
  const [open, setOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);
  const firstItemRef = React.useRef<HTMLButtonElement>(null);

  const isRunning = runStatus === 'running';

  // Build menu definition (status-aware)
  const items: MenuItemDef[] = [
    {
      key: 'rerun-same',
      label: 'Re-run with same inputs',
      icon: RotateCcw,
      onClick: onRerunSame,
      disabled: isRunning,
      title: isRunning ? 'Run is still in progress' : undefined,
    },
    {
      key: 'rerun-overrides',
      label: 'Re-run with overrides (coming soon)',
      icon: Sliders,
      onClick: onRerunOverrides,
      // Override editor is not built yet (no backend contract to probe), so the
      // item is hard-disabled rather than presenting as actionable.
      disabled: true,
      title: 'Parameter override editor is not available yet',
    },
    {
      key: 'compare',
      label: isCompareSourcePicked
        ? 'Cancel compare selection'
        : 'Compare with another run',
      icon: GitCompare,
      onClick: onCompare,
      dividerBefore: true,
    },
    {
      key: 'expected',
      label: isExpectedFailure
        ? 'Unmark expected failure'
        : 'Mark as expected failure',
      icon: isExpectedFailure ? ShieldX : ShieldCheck,
      onClick: onToggleExpected,
    },
    {
      key: 'kill',
      label: 'Cancel running runs',
      icon: Square,
      onClick: onKill,
      hidden: !isRunning,
      disabled: !canKill,
      destructive: true,
      dividerBefore: true,
      title: canKill
        ? 'Cancels all running runs of this workflow (workflow-level)'
        : "You don't have permission to cancel runs",
    },
    {
      key: 'copy',
      label: 'Copy run ID',
      icon: CopyIcon,
      onClick: onCopyId,
      dividerBefore: !isRunning, // before "Copy" when kill is hidden
    },
  ];

  const close = React.useCallback(() => {
    setOpen(false);
    // restore focus to trigger
    window.setTimeout(() => triggerRef.current?.focus(), 0);
  }, []);

  // Click-outside + Esc
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (
        menuRef.current?.contains(t) ||
        triggerRef.current?.contains(t)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  // Focus first enabled item when opened
  React.useEffect(() => {
    if (open) {
      window.setTimeout(() => firstItemRef.current?.focus(), 0);
    }
  }, [open]);

  // Roving keyboard navigation inside menu
  const onMenuKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const focusables = Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        'button[role="menuitem"]:not([disabled])',
      ) ?? [],
    );
    if (focusables.length === 0) return;
    const idx = focusables.indexOf(document.activeElement as HTMLButtonElement);

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusables[(idx + 1 + focusables.length) % focusables.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusables[(idx - 1 + focusables.length) % focusables.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusables[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      focusables[focusables.length - 1]?.focus();
    } else if (e.key === 'Tab') {
      // trap focus inside menu
      e.preventDefault();
      const dir = e.shiftKey ? -1 : 1;
      focusables[(idx + dir + focusables.length) % focusables.length]?.focus();
    }
  };

  const handleSelect = (fn: () => void) => () => {
    fn();
    close();
  };

  return (
    <div className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Actions for run ${runId.slice(-8)}`}
        className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        title="More actions"
      >
        <MoreHorizontal className="h-4 w-4 text-slate-500" />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={`Actions for run ${runId.slice(-8)}`}
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 z-50 mt-1 w-60 rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900 py-1"
        >
          {items
            .filter((i) => !i.hidden)
            .map((item, idx, arr) => {
              const Icon = item.icon;
              const isFirst =
                idx === arr.findIndex((x) => !x.disabled);
              return (
                <React.Fragment key={item.key}>
                  {item.dividerBefore && (
                    <div
                      role="separator"
                      className="my-1 h-px bg-slate-100 dark:bg-slate-800"
                    />
                  )}
                  <button
                    ref={isFirst ? firstItemRef : undefined}
                    type="button"
                    role="menuitem"
                    disabled={item.disabled}
                    onClick={handleSelect(item.onClick)}
                    title={item.title}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition focus:outline-none',
                      item.destructive
                        ? 'text-red-600 hover:bg-red-50 focus-visible:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20 dark:focus-visible:bg-red-900/20'
                        : 'text-slate-700 hover:bg-slate-100 focus-visible:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800 dark:focus-visible:bg-slate-800',
                      item.disabled && 'opacity-50 cursor-not-allowed',
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                </React.Fragment>
              );
            })}
        </div>
      )}
    </div>
  );
};

export default RunActionsMenu;
