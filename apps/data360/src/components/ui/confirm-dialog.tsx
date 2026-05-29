'use client';

/**
 * confirm-dialog.tsx
 *
 * Single reusable confirm component for every destructive Data360 action.
 *
 * Two exports:
 *   <ConfirmDialog />              — generic yes / no.
 *   <ConfirmDestructiveDialog />   — tiered hard-delete with type-to-confirm,
 *                                    optional reason field, optional
 *                                    "irreversible" checkbox, and a 2-second
 *                                    countdown on the nuclear button.
 *
 * Designed for the highest-risk callers in the app:
 *   - DROP ACCOUNT (orgadmin only)            → tier="nuclear"
 *   - DROP SERVICE / COMPUTE POOL              → tier="nuclear" if running
 *                                                tasks, else "hard"
 *   - kill running execution                   → tier="hard"
 *   - delete workflow / delete project         → tier="hard"
 *   - force-rollback                           → tier="hard"
 *
 * Built on the project's Radix Dialog primitive (./dialog) so it inherits
 * portal/overlay/animation behaviour the rest of the app uses.
 */

import * as React from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Loader2,
  Skull,
  Trash2,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type Tier = 'soft' | 'hard' | 'nuclear';

interface BaseProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  onCancel?: () => void;
}

export interface ConfirmDialogProps extends BaseProps {
  onConfirm: () => void | Promise<void>;
  variant?: 'default' | 'warning';
}

export interface ConfirmDestructiveDialogProps extends BaseProps {
  tier: Tier;
  resourceLabel: string;
  resourceName: string;
  requireReason?: boolean;
  irreversibleNote?: string;
  onConfirm: (payload: { reason?: string }) => void | Promise<void>;
}

/* ------------------------------------------------------------------ */
/*  Tier presentation                                                  */
/* ------------------------------------------------------------------ */

interface TierPresentation {
  Icon: React.ComponentType<{ className?: string }>;
  iconWrapClass: string;
  iconClass: string;
  headerTint: string;
  defaultConfirmLabel: string;
  confirmButtonClass: string;
}

const TIER_PRESENTATION: Record<Tier, TierPresentation> = {
  soft: {
    Icon: AlertCircle,
    iconWrapClass: 'bg-amber-100 dark:bg-amber-900/30',
    iconClass: 'text-amber-600 dark:text-amber-400',
    headerTint: '',
    defaultConfirmLabel: 'Confirm',
    confirmButtonClass:
      'bg-red-600 hover:bg-red-700 text-white focus-visible:ring-red-600',
  },
  hard: {
    Icon: Trash2,
    iconWrapClass: 'bg-red-100 dark:bg-red-900/30',
    iconClass: 'text-red-600 dark:text-red-400',
    headerTint: '',
    defaultConfirmLabel: 'Delete',
    confirmButtonClass:
      'bg-red-600 hover:bg-red-700 text-white focus-visible:ring-red-600',
  },
  nuclear: {
    Icon: Skull,
    iconWrapClass: 'bg-red-200 dark:bg-red-900/50',
    iconClass: 'text-red-700 dark:text-red-300',
    // Red tint applied on the dialog header for tier='nuclear'
    headerTint:
      '-mx-6 -mt-6 mb-1 rounded-t-lg border-b border-red-200/70 bg-red-50/80 px-6 py-4 dark:border-red-900/40 dark:bg-red-950/40',
    defaultConfirmLabel: 'Destroy',
    confirmButtonClass:
      'bg-red-700 hover:bg-red-800 text-white focus-visible:ring-red-700',
  },
};

/* ------------------------------------------------------------------ */
/*  Shared button classes                                              */
/* ------------------------------------------------------------------ */

const baseBtn =
  'inline-flex h-9 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';

const cancelBtn =
  'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 focus-visible:ring-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800';

const warningConfirmBtn =
  'bg-amber-600 hover:bg-amber-700 text-white focus-visible:ring-amber-600';

const defaultConfirmBtn =
  'bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:ring-primary';

/* ================================================================== */
/*  <ConfirmDialog />                                                   */
/* ================================================================== */

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  loading = false,
  onCancel,
  onConfirm,
  variant = 'default',
}: ConfirmDialogProps) {
  const isWarning = variant === 'warning';
  const Icon = isWarning ? AlertTriangle : AlertCircle;

  const handleCancel = React.useCallback(() => {
    if (loading) return;
    onCancel?.();
    onOpenChange(false);
  }, [loading, onCancel, onOpenChange]);

  const handleConfirm = React.useCallback(async () => {
    if (loading) return;
    await onConfirm();
  }, [loading, onConfirm]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && !loading) {
      e.preventDefault();
      void handleConfirm();
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (loading && !next) return;
        if (!next) onCancel?.();
        onOpenChange(next);
      }}
    >
      <DialogContent
        className="max-w-md bg-white dark:bg-slate-900"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                isWarning
                  ? 'bg-amber-100 dark:bg-amber-900/30'
                  : 'bg-slate-100 dark:bg-slate-800',
              )}
            >
              <Icon
                className={cn(
                  'h-5 w-5',
                  isWarning
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-slate-600 dark:text-slate-300',
                )}
              />
            </div>
            <DialogTitle className="text-slate-900 dark:text-white">
              {title}
            </DialogTitle>
          </div>
          <DialogDescription asChild>
            <div className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {body}
            </div>
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="mt-4 gap-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            className={cn(baseBtn, cancelBtn)}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={loading}
            className={cn(
              baseBtn,
              isWarning ? warningConfirmBtn : defaultConfirmBtn,
            )}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {confirmLabel ?? (isWarning ? 'Continue' : 'Confirm')}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ================================================================== */
/*  <ConfirmDestructiveDialog />                                        */
/* ================================================================== */

const NUCLEAR_COUNTDOWN_SECONDS = 2;

export function ConfirmDestructiveDialog({
  open,
  onOpenChange,
  title,
  body,
  confirmLabel,
  cancelLabel = 'Cancel',
  loading = false,
  onCancel,
  onConfirm,
  tier,
  resourceLabel,
  resourceName,
  requireReason = false,
  irreversibleNote,
}: ConfirmDestructiveDialogProps) {
  const presentation = TIER_PRESENTATION[tier];
  const { Icon } = presentation;

  const [typed, setTyped] = React.useState('');
  const [reason, setReason] = React.useState('');
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [countdown, setCountdown] = React.useState(
    tier === 'nuclear' ? NUCLEAR_COUNTDOWN_SECONDS : 0,
  );

  const titleId = React.useId();
  const typeHelpId = React.useId();
  const reasonId = React.useId();
  const inputId = React.useId();
  const ackId = React.useId();

  // Reset state when dialog opens / closes or resource changes
  React.useEffect(() => {
    if (open) {
      setTyped('');
      setReason('');
      setAcknowledged(false);
      setCountdown(tier === 'nuclear' ? NUCLEAR_COUNTDOWN_SECONDS : 0);
    }
  }, [open, tier, resourceName]);

  // Gate flags
  const nameMatches = tier === 'soft' ? true : typed === resourceName;
  const ackOk = tier === 'nuclear' ? acknowledged : true;
  const reasonOk = requireReason ? reason.trim().length > 0 : true;
  const allTextGatesPass = nameMatches && ackOk && reasonOk;

  // Nuclear countdown — starts only after all text/checkbox gates pass.
  React.useEffect(() => {
    if (tier !== 'nuclear') return;
    if (!open) return;
    if (!allTextGatesPass) {
      setCountdown(NUCLEAR_COUNTDOWN_SECONDS);
      return;
    }
    if (countdown <= 0) return;
    const t = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(t);
  }, [tier, open, allTextGatesPass, countdown]);

  const countdownDone = tier === 'nuclear' ? countdown <= 0 : true;
  const canConfirm = !loading && allTextGatesPass && countdownDone;

  const handleCancel = React.useCallback(() => {
    if (loading) return;
    onCancel?.();
    onOpenChange(false);
  }, [loading, onCancel, onOpenChange]);

  const handleConfirm = React.useCallback(async () => {
    if (!canConfirm) return;
    await onConfirm({
      reason: requireReason ? reason.trim() : undefined,
    });
  }, [canConfirm, onConfirm, requireReason, reason]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Enter submits only when all gates pass
    if (e.key === 'Enter' && canConfirm && !(e.target instanceof HTMLTextAreaElement)) {
      e.preventDefault();
      void handleConfirm();
    }
  };

  const computedConfirmLabel =
    confirmLabel ?? presentation.defaultConfirmLabel;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (loading && !next) return;
        if (!next) onCancel?.();
        onOpenChange(next);
      }}
    >
      <DialogContent
        aria-labelledby={titleId}
        className="max-w-md overflow-hidden bg-white dark:bg-slate-900"
        onKeyDown={handleKeyDown}
      >
        <DialogHeader className={cn(presentation.headerTint)}>
          <div className="flex items-center gap-3">
            <div
              className={cn(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-full',
                presentation.iconWrapClass,
              )}
            >
              <Icon className={cn('h-5 w-5', presentation.iconClass)} />
            </div>
            <DialogTitle
              id={titleId}
              className="text-slate-900 dark:text-white"
            >
              {title}
            </DialogTitle>
          </div>
          <DialogDescription asChild>
            <div className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {body}
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {irreversibleNote && (
            <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{irreversibleNote}</span>
            </div>
          )}

          {tier !== 'soft' && (
            <div className="space-y-1.5">
              <label
                htmlFor={inputId}
                id={typeHelpId}
                className="block text-xs text-slate-600 dark:text-slate-400"
              >
                Type{' '}
                <span className="font-mono font-semibold text-slate-900 dark:text-white">
                  {resourceName}
                </span>{' '}
                to confirm {resourceLabel} deletion.
              </label>
              <input
                id={inputId}
                type="text"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                aria-describedby={typeHelpId}
                aria-invalid={typed.length > 0 && !nameMatches}
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                disabled={loading}
                className={cn(
                  'block w-full rounded-md border bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-0 dark:bg-slate-950 dark:text-white',
                  nameMatches
                    ? 'border-slate-300 focus:border-red-400 focus:ring-red-200 dark:border-slate-700 dark:focus:ring-red-900/50'
                    : 'border-red-300 focus:border-red-500 focus:ring-red-200 dark:border-red-900/50 dark:focus:ring-red-900/50',
                )}
                placeholder={resourceName}
              />
            </div>
          )}

          {requireReason && (
            <div className="space-y-1.5">
              <label
                htmlFor={reasonId}
                className="block text-xs text-slate-600 dark:text-slate-400"
              >
                Reason{' '}
                <span className="text-slate-400">(audit log)</span>
              </label>
              <textarea
                id={reasonId}
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={loading}
                placeholder="Why are you deleting this?"
                className="block w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:focus:ring-red-900/50"
              />
            </div>
          )}

          {tier === 'nuclear' && (
            <label
              htmlFor={ackId}
              className="flex cursor-pointer items-start gap-2 rounded-md border border-red-200 bg-red-50/60 p-3 text-xs text-red-900 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-200"
            >
              <input
                id={ackId}
                type="checkbox"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
                disabled={loading}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-red-300 text-red-600 focus:ring-red-500 dark:border-red-700"
              />
              <span>I understand this is irreversible.</span>
            </label>
          )}
        </div>

        <DialogFooter className="mt-2 gap-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={loading}
            className={cn(baseBtn, cancelBtn)}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={!canConfirm}
            aria-disabled={!canConfirm}
            className={cn(baseBtn, presentation.confirmButtonClass)}
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            {!loading && tier === 'nuclear' && countdown > 0 && allTextGatesPass && (
              <span className="font-mono text-xs opacity-80">
                ({countdown})
              </span>
            )}
            {computedConfirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default ConfirmDialog;
