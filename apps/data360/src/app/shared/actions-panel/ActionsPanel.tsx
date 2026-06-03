'use client';

/**
 * ActionsPanel — the sectioned, grouped-CTA panel (2026 design system).
 *
 * The reusable form of explore-design's right "Actions" rail (Policies · Ingestion
 * · Add Column · Recommendations…): a stack of glass cards, each a titled group of
 * one-click actions. Workflow adopts it to turn its crammed header button-strip
 * (Save · Validate · Run · Suspend · Schedule · Approve · Rollback…) into clean
 * grouped CTAs inside the right `ContextBar`, identical to explore-design.
 *
 * Presentational: the host wires its existing handlers into `groups`. Honest
 * disabled state (tooltip reason), busy spinner, tones. Pairs with
 * `InsightActionButton` for backend-gated async actions.
 */
import type { ReactNode } from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { GlassPanel } from '@/app/shared/glass';

export type ActionTone = 'primary' | 'default' | 'danger' | 'success';

export interface PanelAction {
  key: string;
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
  tone?: ActionTone;
  disabled?: boolean;
  /** Tooltip shown when disabled (e.g. "Save first" / "Not available yet"). */
  disabledReason?: string;
  busy?: boolean;
  badge?: ReactNode;
  hidden?: boolean;
}

export interface PanelGroup {
  key: string;
  title?: string;
  hint?: string;
  /** Render actions full-width stacked instead of the 2-col grid. */
  stacked?: boolean;
  actions: PanelAction[];
}

export interface ActionsPanelProps {
  groups: PanelGroup[];
  className?: string;
}

const TONE: Record<ActionTone, string> = {
  primary:
    'bg-[hsl(var(--primary))] font-semibold text-white hover:opacity-90 disabled:opacity-50',
  success:
    'bg-emerald-600 font-semibold text-white hover:bg-emerald-700 disabled:opacity-50',
  danger:
    'border border-red-200 font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20',
  default:
    'border border-slate-200 font-medium text-slate-700 hover:bg-white/50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/10',
};

function ActionButton({ action }: { action: PanelAction }) {
  const tone = action.tone ?? 'default';
  return (
    <button
      type="button"
      onClick={action.onClick}
      disabled={action.disabled || action.busy}
      title={action.disabled ? action.disabledReason : undefined}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors',
        TONE[tone],
        (action.disabled || action.busy) && 'cursor-not-allowed',
      )}
    >
      {action.busy ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        action.icon && <action.icon className="h-3.5 w-3.5" />
      )}
      {action.label}
      {action.badge != null && (
        <span className="rounded-full bg-black/10 px-1.5 text-[9px] font-semibold dark:bg-white/15">
          {action.badge}
        </span>
      )}
    </button>
  );
}

export default function ActionsPanel({ groups, className }: ActionsPanelProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {groups.map((group) => {
        const visible = group.actions.filter((a) => !a.hidden);
        if (visible.length === 0) return null;
        return (
          <GlassPanel key={group.key} depth={1} radius="xl" className="p-2.5">
            {(group.title || group.hint) && (
              <div className="mb-1.5">
                {group.title && (
                  <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                    {group.title}
                  </p>
                )}
                {group.hint && (
                  <p className="text-[10px] text-slate-400 dark:text-slate-500">{group.hint}</p>
                )}
              </div>
            )}
            <div className={cn(group.stacked ? 'flex flex-col gap-1.5' : 'grid grid-cols-2 gap-1.5')}>
              {visible.map((a) => (
                <ActionButton key={a.key} action={a} />
              ))}
            </div>
          </GlassPanel>
        );
      })}
    </div>
  );
}
