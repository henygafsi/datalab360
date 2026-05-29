'use client';

/**
 * AccountLifecycleMenu
 * ====================
 *
 * Kebab menu rendering the full Snowflake account lifecycle (suspend,
 * activate, reset password, rotate keys, toggle MFA, transfer
 * ownership, export, drop).
 *
 * Used in two places:
 *   1. Per-row in `accounts-table.tsx` (action column).
 *   2. The footer of `account-detail-modal.tsx`.
 *
 * Persona matrix
 * --------------
 *   orgadmin       → everything (the ONLY role that sees Drop).
 *   accountadmin   → everything except Drop.
 *   qa             → View / Edit / Suspend / Activate / Export only.
 *   user           → View / Reset (own account) / Export only.
 *
 * Backend reality
 * ---------------
 * Only `DELETE /org-accounts/accounts/{name}` (G8 — Drop) is wired
 * server-side at time of writing. Every other action is shown with a
 * "(beta)" chip and a tooltip pointing at the planned endpoint —
 * styling matches `BackendGapNote` from
 * `apps/data360/src/app/(dashboard)/workflow/components/WizardPreflightPanel.tsx`
 * (replicated locally to keep this component module-independent).
 */

import * as React from 'react';
import toast from 'react-hot-toast';
import {
  Eye,
  Pencil,
  KeyRound,
  RefreshCcw,
  Power,
  PowerOff,
  ShieldCheck,
  ArrowRightLeft,
  Download,
  Trash2,
  MoreVertical,
  Loader2,
  Lock,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { ConfirmDestructiveDialog, ConfirmDialog } from '@/components/ui/confirm-dialog';
import {
  dropAccount,
  suspendAccount,
  activateAccount,
  resetAccountPassword,
  rotateAccountKeys,
  setAccountMfaEnforcement,
  transferAccountOwnership,
  updateAccount,
} from '@/app/services/org-accounts/hooks';
import type { ClientAccount } from '@/app/services/org-accounts/types';

/* ------------------------------------------------------------------ */
/*  Role normalisation                                                 */
/* ------------------------------------------------------------------ */

export type UxRole = 'orgadmin' | 'accountadmin' | 'qa' | 'user';

/**
 * `useAuth()` returns the raw Snowflake role in uppercase
 * (`'ACCOUNTADMIN'`, `'ORGADMIN'`, …). Normalise to the lowercase
 * persona codes used by this component.
 */
export function normalizeRole(
  rawRole: string | undefined | null,
  username?: string,
): UxRole {
  const r = (rawRole ?? '').toUpperCase();
  if (r === 'ORGADMIN') return 'orgadmin';
  if (r === 'ACCOUNTADMIN' || r === 'SYSADMIN' || r === 'SECURITYADMIN') {
    return 'accountadmin';
  }
  // Heuristic: a username prefixed with `qa_` or a role containing `QA`
  // is treated as the QA persona — no Snowflake equivalent.
  if (r.includes('QA') || (username && username.toLowerCase().startsWith('qa_'))) {
    return 'qa';
  }
  return 'user';
}

/* ------------------------------------------------------------------ */
/*  Local BackendGapNote — mirrors WizardPreflightPanel styling        */
/* ------------------------------------------------------------------ */

interface BackendGapTooltipProps {
  endpoint: string;
}

function BackendGapTooltip({ endpoint }: BackendGapTooltipProps) {
  return (
    <span
      className="ml-2 inline-flex items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-violet-700 dark:bg-violet-900/40 dark:text-violet-300"
      title={`Backend endpoint coming soon — ${endpoint}`}
    >
      <Lock className="h-2.5 w-2.5" />
      beta
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Item descriptor                                                    */
/* ------------------------------------------------------------------ */

type ItemKey =
  | 'view'
  | 'edit'
  | 'reset'
  | 'rotate'
  | 'toggle-active'
  | 'mfa'
  | 'transfer'
  | 'export'
  | 'drop';

interface MenuItem {
  key: ItemKey;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  destructive?: boolean;
  /** True when the backend route is not yet live. */
  beta?: boolean;
  /** Planned route for the tooltip. */
  endpoint?: string;
  /** Disabled for reasons OTHER than missing backend (e.g. role). */
  disabled?: boolean;
  /** Visual separator AFTER this item. */
  divider?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Visibility matrix                                                  */
/* ------------------------------------------------------------------ */

function buildItems(
  role: UxRole,
  account: ClientAccount,
  isOwnAccount: boolean,
  hideView: boolean,
): MenuItem[] {
  const items: MenuItem[] = [];

  // View — hidden when already in the detail modal.
  if (!hideView) {
    items.push({ key: 'view', label: 'View details', Icon: Eye });
  }

  // Edit — orgadmin + accountadmin only.
  if (role === 'orgadmin' || role === 'accountadmin' || role === 'qa') {
    items.push({
      key: 'edit',
      label: 'Edit account',
      Icon: Pencil,
      beta: true,
      endpoint: 'PATCH /org-accounts/accounts/{name}',
    });
  }

  // Reset admin password — orgadmin, accountadmin, OR the account's own
  // admin can reset their own.
  if (role === 'orgadmin' || role === 'accountadmin' || isOwnAccount) {
    items.push({
      key: 'reset',
      label: 'Reset admin password',
      Icon: KeyRound,
      beta: true,
      endpoint: 'POST /org-accounts/accounts/{name}/reset-password',
    });
  }

  // Rotate keys — orgadmin + accountadmin.
  if (role === 'orgadmin' || role === 'accountadmin') {
    items.push({
      key: 'rotate',
      label: 'Rotate authentication keys',
      Icon: RefreshCcw,
      beta: true,
      endpoint: 'POST /org-accounts/accounts/{name}/rotate-keys',
    });
  }

  // Suspend / Activate — orgadmin, accountadmin, qa.
  if (role === 'orgadmin' || role === 'accountadmin' || role === 'qa') {
    items.push({
      key: 'toggle-active',
      label: account.is_active ? 'Suspend account' : 'Activate account',
      Icon: account.is_active ? PowerOff : Power,
      beta: true,
      endpoint: account.is_active
        ? 'POST /org-accounts/accounts/{name}/suspend'
        : 'POST /org-accounts/accounts/{name}/activate',
    });
  }

  // MFA toggle — orgadmin + accountadmin only.
  if (role === 'orgadmin' || role === 'accountadmin') {
    items.push({
      key: 'mfa',
      label: 'Toggle MFA enforcement',
      Icon: ShieldCheck,
      beta: true,
      endpoint: 'PATCH /org-accounts/accounts/{name}/mfa',
    });
  }

  // Transfer ownership — orgadmin only.
  if (role === 'orgadmin') {
    items.push({
      key: 'transfer',
      label: 'Transfer ownership',
      Icon: ArrowRightLeft,
      beta: true,
      endpoint: 'POST /org-accounts/accounts/{name}/transfer-ownership',
      divider: true,
    });
  } else if (items.length > 0) {
    // Mark the last "safe" item as the divider before Export.
    items[items.length - 1].divider = true;
  }

  // Export — available to all roles (assembled client-side).
  items.push({
    key: 'export',
    label: 'Export account state',
    Icon: Download,
    divider: role === 'orgadmin',
  });

  // Drop — orgadmin ONLY. Real, wired endpoint.
  if (role === 'orgadmin') {
    items.push({
      key: 'drop',
      label: 'Drop account',
      Icon: Trash2,
      destructive: true,
    });
  }

  return items;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export interface AccountLifecycleMenuProps {
  account: ClientAccount;
  /** The current user's role, normalised via `normalizeRole`. */
  currentUserRole: UxRole;
  /** Current username — used for "is this my account?" check on reset. */
  currentUsername?: string;
  /** Pass true when rendering inside the detail modal (hides "View"). */
  hideView?: boolean;
  /** Called when the View item is clicked from the table. */
  onViewDetails?: (account: ClientAccount) => void;
  /** Called after any mutation succeeds so the parent can refetch. */
  onChanged?: () => void;
  /** Called after a successful Drop. */
  onDropped?: (account: ClientAccount) => void;
  /** Variant — `'kebab'` (default) or `'inline'` for the modal footer. */
  variant?: 'kebab' | 'inline';
  className?: string;
}

export default function AccountLifecycleMenu({
  account,
  currentUserRole,
  currentUsername,
  hideView = false,
  onViewDetails,
  onChanged,
  onDropped,
  variant = 'kebab',
  className,
}: AccountLifecycleMenuProps) {
  const [open, setOpen] = React.useState(false);
  const [busyKey, setBusyKey] = React.useState<ItemKey | null>(null);

  // Confirm dialog state (kept as <Dialog> — destructive / pure yes-no confirms)
  const [confirmDrop, setConfirmDrop] = React.useState(false);
  const [confirmRotate, setConfirmRotate] = React.useState(false);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [confirmToggle, setConfirmToggle] = React.useState(false);

  // Quick-action popover (edit / transfer / mfa) — anchored to the kebab,
  // replaces the former centered modal forms with a non-blocking popover.
  type FormPanel = 'edit' | 'transfer' | 'mfa';
  const [formPanel, setFormPanel] = React.useState<FormPanel | null>(null);

  // Edit form state
  const [editName, setEditName] = React.useState(account.account_name);
  const [editComment, setEditComment] = React.useState(account.comment ?? '');

  // Transfer form state
  const [transferTarget, setTransferTarget] = React.useState('');

  // MFA form state
  const [mfaEnforced, setMfaEnforced] = React.useState(true);

  // Inline error for the quick-action popover (shown in-panel, not a toast).
  const [formError, setFormError] = React.useState<string | null>(null);

  function closeFormPanel() {
    setFormPanel(null);
    setFormError(null);
  }

  const isOwnAccount = Boolean(
    currentUsername && account.account_name &&
      currentUsername.toLowerCase() === account.account_name.toLowerCase(),
  );

  const items = React.useMemo(
    () => buildItems(currentUserRole, account, isOwnAccount, hideView),
    [currentUserRole, account, isOwnAccount, hideView],
  );

  const menuRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    // Bind while EITHER the kebab menu or a quick-action popover is open.
    if (!open && !formPanel) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        closeFormPanel();
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open, formPanel]);

  // Close the quick-action popover on Escape.
  React.useEffect(() => {
    if (!formPanel) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') closeFormPanel();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [formPanel]);

  /* ----------------------------- Handlers ----------------------------- */

  async function runWithToast<T>(
    key: ItemKey,
    fn: () => Promise<T>,
    okMessage: string,
    errMessage: string,
  ): Promise<T | null> {
    setBusyKey(key);
    try {
      const out = await fn();
      toast.success(okMessage);
      onChanged?.();
      return out;
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { detail?: string } } };
      const status = e?.response?.status;
      if (status === 404 || status === 405) {
        toast.error(
          `${errMessage} — endpoint not yet available on the backend (received ${status}).`,
        );
      } else {
        const detail = e?.response?.data?.detail;
        toast.error(detail ? `${errMessage}: ${detail}` : errMessage);
      }
      return null;
    } finally {
      setBusyKey(null);
    }
  }

  /**
   * Like runWithToast but surfaces failures INLINE in the open popover
   * (success still toasts + closes the panel). Used by the edit / transfer /
   * mfa quick-action forms so the exact error stays attached to the form.
   */
  async function runWithInlineError<T>(
    key: ItemKey,
    fn: () => Promise<T>,
    okMessage: string,
    errMessage: string,
  ): Promise<T | null> {
    setBusyKey(key);
    setFormError(null);
    try {
      const out = await fn();
      toast.success(okMessage);
      onChanged?.();
      return out;
    } catch (err: unknown) {
      const e = err as { response?: { status?: number; data?: { detail?: string } } };
      const status = e?.response?.status;
      if (status === 404 || status === 405) {
        setFormError(
          `${errMessage} — this endpoint is not yet available on the backend (received ${status}).`,
        );
      } else {
        const detail = e?.response?.data?.detail;
        setFormError(detail ? `${errMessage}: ${detail}` : errMessage);
      }
      return null;
    } finally {
      setBusyKey(null);
    }
  }

  function handleExport() {
    const payload = {
      exported_at: new Date().toISOString(),
      exported_by: currentUsername ?? 'unknown',
      account,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${account.account_name}-state-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Account state exported');
  }

  function handleItemClick(item: MenuItem) {
    setOpen(false);
    switch (item.key) {
      case 'view':
        onViewDetails?.(account);
        return;
      case 'edit':
        setEditName(account.account_name);
        setEditComment(account.comment ?? '');
        setFormPanel('edit');
        return;
      case 'reset':
        setConfirmReset(true);
        return;
      case 'rotate':
        setConfirmRotate(true);
        return;
      case 'toggle-active':
        setConfirmToggle(true);
        return;
      case 'mfa':
        setFormPanel('mfa');
        return;
      case 'transfer':
        setTransferTarget('');
        setFormPanel('transfer');
        return;
      case 'export':
        handleExport();
        return;
      case 'drop':
        setConfirmDrop(true);
        return;
    }
  }

  /* ------------------------------- UI ------------------------------- */

  const Trigger = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setOpen((v) => !v);
      }}
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={`Open actions for ${account.account_name}`}
      className={cn(
        'inline-flex items-center justify-center rounded-md border border-transparent text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
        variant === 'kebab' ? 'h-8 w-8' : 'h-9 gap-2 px-3 text-sm',
      )}
    >
      <MoreVertical className="h-4 w-4" />
      {variant === 'inline' && <span>Actions</span>}
    </button>
  );

  return (
    <div
      ref={menuRef}
      className={cn('relative inline-block text-left', className)}
      onClick={(e) => e.stopPropagation()}
    >
      {Trigger}

      {open && (
        <div
          role="menu"
          aria-orientation="vertical"
          className="absolute right-0 z-30 mt-1 w-64 origin-top-right rounded-md border border-slate-200 bg-white shadow-lg ring-1 ring-black/5 focus:outline-none dark:border-slate-700 dark:bg-slate-900"
        >
          <ul className="py-1">
            {items.map((item) => {
              const isBusy = busyKey === item.key;
              const isDisabled = Boolean(item.disabled);
              const isBeta = Boolean(item.beta);
              const Icon = item.Icon;
              return (
                <React.Fragment key={item.key}>
                  <li role="none">
                    <button
                      type="button"
                      role="menuitem"
                      disabled={isDisabled || isBusy}
                      aria-disabled={isDisabled || isBusy}
                      onClick={() => !isDisabled && !isBusy && handleItemClick(item)}
                      className={cn(
                        'flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors',
                        item.destructive
                          ? 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40'
                          : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800',
                        (isDisabled || isBusy) && 'cursor-not-allowed opacity-60',
                      )}
                      title={isBeta ? `Backend endpoint coming soon — ${item.endpoint}` : undefined}
                    >
                      {isBusy ? (
                        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
                      ) : (
                        <Icon className="h-4 w-4 shrink-0" />
                      )}
                      <span className="flex-1 text-left">{item.label}</span>
                      {isBeta && item.endpoint && (
                        <BackendGapTooltip endpoint={item.endpoint} />
                      )}
                    </button>
                  </li>
                  {item.divider && (
                    <li role="separator" aria-hidden="true">
                      <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
                    </li>
                  )}
                </React.Fragment>
              );
            })}
          </ul>
        </div>
      )}

      {/* ---------- Drop (NUCLEAR) ---------- */}
      <ConfirmDestructiveDialog
        open={confirmDrop}
        onOpenChange={setConfirmDrop}
        tier="nuclear"
        resourceLabel="account"
        resourceName={account.account_name}
        title={`Drop account ${account.account_name}?`}
        body={
          <span>
            This will permanently <strong>DROP</strong> the Snowflake account and
            everything inside it.
          </span>
        }
        irreversibleNote="ALL workflows, projects, query history, warehouses, databases, users, and roles under this account will be destroyed. This cannot be reversed once the grace period elapses."
        requireReason
        confirmLabel="Drop account"
        loading={busyKey === 'drop'}
        onConfirm={async ({ reason }) => {
          const result = await runWithToast(
            'drop',
            () => dropAccount(account.account_name, reason),
            `Account ${account.account_name} dropped`,
            `Failed to drop ${account.account_name}`,
          );
          if (result) {
            setConfirmDrop(false);
            onDropped?.(account);
          }
        }}
      />

      {/* ---------- Reset password (soft) ---------- */}
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Reset admin password?"
        body={
          <span>
            A reset link will be emailed to the admin contact for{' '}
            <strong>{account.account_name}</strong>.
          </span>
        }
        confirmLabel="Send reset link"
        loading={busyKey === 'reset'}
        onConfirm={async () => {
          await runWithToast(
            'reset',
            () => resetAccountPassword(account.account_name),
            'Password reset email sent',
            'Failed to send reset email',
          );
          setConfirmReset(false);
        }}
      />

      {/* ---------- Rotate keys (soft) ---------- */}
      <ConfirmDialog
        open={confirmRotate}
        onOpenChange={setConfirmRotate}
        variant="warning"
        title="Rotate authentication keys?"
        body={
          <span>
            All sessions using the current keys for{' '}
            <strong>{account.account_name}</strong> will be invalidated.
            Connected services must update their credentials.
          </span>
        }
        confirmLabel="Rotate keys"
        loading={busyKey === 'rotate'}
        onConfirm={async () => {
          await runWithToast(
            'rotate',
            () => rotateAccountKeys(account.account_name),
            'Authentication keys rotated',
            'Failed to rotate keys',
          );
          setConfirmRotate(false);
        }}
      />

      {/* ---------- Suspend / Activate (soft) ---------- */}
      <ConfirmDialog
        open={confirmToggle}
        onOpenChange={setConfirmToggle}
        variant="warning"
        title={account.is_active ? 'Suspend account?' : 'Activate account?'}
        body={
          account.is_active ? (
            <span>
              Users will be unable to query or load data on{' '}
              <strong>{account.account_name}</strong> until it is reactivated.
              No data is lost.
            </span>
          ) : (
            <span>
              <strong>{account.account_name}</strong> will accept new sessions
              again.
            </span>
          )
        }
        confirmLabel={account.is_active ? 'Suspend' : 'Activate'}
        loading={busyKey === 'toggle-active'}
        onConfirm={async () => {
          await runWithToast(
            'toggle-active',
            () =>
              account.is_active
                ? suspendAccount(account.account_name)
                : activateAccount(account.account_name),
            account.is_active ? 'Account suspended' : 'Account activated',
            account.is_active ? 'Failed to suspend account' : 'Failed to activate account',
          );
          setConfirmToggle(false);
        }}
      />

      {/* ---------- Quick-action popover (edit / transfer / mfa) ---------- */}
      {/* Anchored to the kebab, non-blocking — replaces the former centered    */}
      {/* modal forms. Errors surface inline; the page stays visible.           */}
      {formPanel && (
        <div
          role="dialog"
          aria-label={
            formPanel === 'edit'
              ? 'Edit account'
              : formPanel === 'transfer'
                ? 'Transfer account ownership'
                : 'MFA enforcement'
          }
          className="absolute right-0 z-40 mt-1 w-80 origin-top-right rounded-md border border-slate-200 bg-white p-4 shadow-lg ring-1 ring-black/5 dark:border-slate-700 dark:bg-slate-900"
        >
          {formPanel === 'edit' && (
            <div className="space-y-3 text-left">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Edit account</h4>
              <div className="space-y-1.5">
                <label
                  htmlFor={`edit-name-${account.account_name}`}
                  className="block text-xs text-slate-600 dark:text-slate-400"
                >
                  Account name
                </label>
                <input
                  id={`edit-name-${account.account_name}`}
                  value={editName}
                  onChange={(e) => setEditName(e.target.value.toUpperCase())}
                  className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              <div className="space-y-1.5">
                <label
                  htmlFor={`edit-comment-${account.account_name}`}
                  className="block text-xs text-slate-600 dark:text-slate-400"
                >
                  Comment
                </label>
                <textarea
                  id={`edit-comment-${account.account_name}`}
                  rows={2}
                  value={editComment}
                  onChange={(e) => setEditComment(e.target.value)}
                  className="block w-full resize-none rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              {formError && <FormErrorNote message={formError} />}
              <FormActions
                confirmLabel="Save changes"
                busy={busyKey === 'edit'}
                onCancel={closeFormPanel}
                onConfirm={async () => {
                  const ok = await runWithInlineError(
                    'edit',
                    () =>
                      updateAccount(account.account_name, {
                        new_name: editName !== account.account_name ? editName : undefined,
                        comment: editComment !== (account.comment ?? '') ? editComment : undefined,
                      }),
                    'Account updated',
                    'Failed to update account',
                  );
                  if (ok) closeFormPanel();
                }}
              />
            </div>
          )}

          {formPanel === 'mfa' && (
            <div className="space-y-3 text-left">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">MFA enforcement</h4>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Require all users on <strong>{account.account_name}</strong> to enrol in MFA.
              </p>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={mfaEnforced}
                  onChange={(e) => setMfaEnforced(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                />
                <span className="text-sm text-slate-700 dark:text-slate-200">Enforce MFA</span>
              </label>
              {formError && <FormErrorNote message={formError} />}
              <FormActions
                confirmLabel="Apply"
                busy={busyKey === 'mfa'}
                onCancel={closeFormPanel}
                onConfirm={async () => {
                  const ok = await runWithInlineError(
                    'mfa',
                    () => setAccountMfaEnforcement(account.account_name, mfaEnforced),
                    mfaEnforced ? 'MFA enforcement enabled' : 'MFA enforcement disabled',
                    'Failed to update MFA enforcement',
                  );
                  if (ok) closeFormPanel();
                }}
              />
            </div>
          )}

          {formPanel === 'transfer' && (
            <div className="space-y-3 text-left">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Transfer ownership</h4>
              <p className="text-sm text-slate-600 dark:text-slate-300">
                Hand control of <strong>{account.account_name}</strong> to a new orgadmin. You will
                lose the orgadmin role on this account.
              </p>
              <div className="space-y-1.5">
                <label
                  htmlFor={`transfer-target-${account.account_name}`}
                  className="block text-xs text-slate-600 dark:text-slate-400"
                >
                  New owner username
                </label>
                <input
                  id={`transfer-target-${account.account_name}`}
                  value={transferTarget}
                  onChange={(e) => setTransferTarget(e.target.value)}
                  placeholder="user_to_promote"
                  className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                />
              </div>
              {formError && <FormErrorNote message={formError} />}
              <FormActions
                confirmLabel="Transfer"
                busy={busyKey === 'transfer'}
                disabled={!transferTarget.trim()}
                onCancel={closeFormPanel}
                onConfirm={async () => {
                  if (!transferTarget.trim()) {
                    setFormError('New owner username is required');
                    return;
                  }
                  const ok = await runWithInlineError(
                    'transfer',
                    () => transferAccountOwnership(account.account_name, transferTarget.trim()),
                    'Ownership transferred',
                    'Failed to transfer ownership',
                  );
                  if (ok) closeFormPanel();
                }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Quick-action popover sub-components                                */
/* ------------------------------------------------------------------ */

function FormErrorNote({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300"
    >
      <span>{message}</span>
    </div>
  );
}

interface FormActionsProps {
  confirmLabel: string;
  busy: boolean;
  disabled?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

function FormActions({ confirmLabel, busy, disabled, onCancel, onConfirm }: FormActionsProps) {
  return (
    <div className="flex items-center justify-end gap-2 pt-1">
      <button
        type="button"
        onClick={onCancel}
        disabled={busy}
        className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={busy || disabled}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
      >
        {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
        {confirmLabel}
      </button>
    </div>
  );
}
