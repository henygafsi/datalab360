'use client';

/**
 * InsightActionButton — a one-click, honestly-gated CTA.
 *
 * The single button every "detect → act" surface uses. It composes
 * {@link useActionGate}: runs the action, pings the bell + toasts on success,
 * surfaces the real error envelope on failure, and SELF-DISABLES (never fakes
 * success) when the backend route is absent (404/501) or a capability hint says
 * the verb is unsupported. Optional destructive `confirm` step reuses the shared
 * ConfirmDialog (the only modal we keep — see the Popup→Inline audit).
 *
 * Four honest states are visible: ready · running · done · unavailable(+error).
 */
import { useState, type ReactNode } from 'react';
import {
  AlertCircle,
  Ban,
  CheckCircle2,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useActionGate } from './useActionGate';

export interface InsightActionButtonProps {
  /** Button label. */
  label: string;
  /** The async action to run when clicked (a service call). */
  onAction: () => Promise<unknown>;
  /** Leading icon (defaults to a check). */
  icon?: LucideIcon;
  /** Advisory capability hint; `false` pre-disables (runtime 404/501 is authoritative). */
  capable?: boolean;
  /** Toast title on success. */
  successToast?: string;
  /** Ping the bell on success (action surfaces server-side). */
  pingBell?: boolean;
  /** Destructive/confirm step before running. */
  confirm?: {
    title: string;
    body?: ReactNode;
    confirmLabel?: string;
    variant?: 'default' | 'warning';
  };
  /** Visual emphasis. */
  variant?: 'primary' | 'subtle' | 'danger';
  size?: 'sm' | 'md';
  /** Tooltip shown when the action is unavailable on this backend. */
  unavailableHint?: string;
  /** Render nothing (instead of a disabled chip) when unavailable. */
  hideWhenUnavailable?: boolean;
  className?: string;
  /** Called with the action result after a successful run. */
  onDone?: (result: unknown) => void;
}

const DEFAULT_UNAVAILABLE_HINT = 'Not available on this backend yet';

const SIZE: Record<'sm' | 'md', string> = {
  sm: 'gap-1 rounded-md px-2 py-0.5 text-[10px]',
  md: 'gap-1.5 rounded-md px-3 py-1.5 text-xs',
};

const VARIANT: Record<'primary' | 'subtle' | 'danger', string> = {
  primary:
    'bg-blue-600 font-semibold text-white hover:bg-blue-700 disabled:bg-blue-300 dark:disabled:bg-blue-900/40',
  subtle:
    'border border-blue-200 font-semibold text-blue-700 hover:bg-blue-50 dark:border-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/20',
  danger:
    'border border-red-200 font-semibold text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20',
};

const ICON_SIZE: Record<'sm' | 'md', string> = { sm: 'h-3 w-3', md: 'h-3.5 w-3.5' };

export default function InsightActionButton({
  label,
  onAction,
  icon: Icon = CheckCircle2,
  capable,
  successToast,
  pingBell,
  confirm,
  variant = 'subtle',
  size = 'sm',
  unavailableHint = DEFAULT_UNAVAILABLE_HINT,
  hideWhenUnavailable = false,
  className,
  onDone,
}: InsightActionButtonProps) {
  const gate = useActionGate({ capable, successToast, pingBell });
  const [confirmOpen, setConfirmOpen] = useState(false);
  const iconCls = ICON_SIZE[size];

  const execute = async () => {
    const r = await gate.run(onAction);
    if (r !== null) onDone?.(r);
  };

  const handleClick = () => {
    if (gate.pending) return;
    if (confirm) {
      setConfirmOpen(true);
      return;
    }
    void execute();
  };

  // Honest unavailable state — disabled chip with a reason, or hidden.
  if (gate.unavailable) {
    if (hideWhenUnavailable) return null;
    return (
      <span
        title={unavailableHint}
        className={cn(
          'inline-flex cursor-not-allowed items-center text-slate-400 dark:text-slate-500',
          SIZE[size],
          'border border-slate-200 dark:border-slate-700',
          className,
        )}
      >
        <Ban className={iconCls} aria-hidden />
        {label}
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={gate.pending}
        onClick={handleClick}
        className={cn(
          'inline-flex items-center transition-colors disabled:opacity-60',
          SIZE[size],
          VARIANT[variant],
          className,
        )}
      >
        {gate.pending ? (
          <Loader2 className={cn(iconCls, 'animate-spin')} aria-hidden />
        ) : gate.state === 'done' ? (
          <CheckCircle2 className={iconCls} aria-hidden />
        ) : (
          <Icon className={iconCls} aria-hidden />
        )}
        {label}
      </button>

      {gate.state === 'error' && gate.error && (
        <span
          role="alert"
          className="inline-flex items-start gap-1 text-[10px] text-red-600 dark:text-red-400"
        >
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          <span className="break-words">{gate.error}</span>
        </span>
      )}

      {confirm && (
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          title={confirm.title}
          body={confirm.body}
          confirmLabel={confirm.confirmLabel ?? label}
          loading={gate.pending}
          variant={confirm.variant}
          onConfirm={async () => {
            await execute();
            setConfirmOpen(false);
          }}
        />
      )}
    </span>
  );
}
