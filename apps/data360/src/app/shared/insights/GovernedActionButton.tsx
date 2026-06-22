'use client';

import React from 'react';
import InsightActionButton, { InsightActionButtonProps } from '@/app/shared/insights/InsightActionButton';
import { useCanPerform, invalidateMyPermissions } from '@/hooks/useCanPerform';

export interface GovernedActionButtonProps extends InsightActionButtonProps {
  /**
   * System-2 action-registry module key feeding useCanPerform — NOT always
   * MODULES.apiName. Verified divergences: BI = 'bi_reporting', Connect =
   * 'connect', Client Accounts = 'org_accounts'. Use the action-registry key.
   */
  module: string;
  /** Action verb in the allow-set (e.g. 'publish','execute','grant','run','approve','deploy'). */
  action: string;
  /**
   * How to render when the caller's role is NOT permitted.
   * 'hide' (default — for mutating verbs) renders nothing; 'disable' shows a
   * disabled button with a permission tooltip (use for read/view verbs you still
   * want visible so the user knows the capability exists).
   */
  denyMode?: 'hide' | 'disable';
  /** When the action edits permissions/grants, also bust the caller's own permission
   * cache on success so their UI re-gates immediately (calls invalidateMyPermissions). */
  mutatesPerms?: boolean;
  /** Side-effect after a successful action (e.g. refetch/invalidate a query). Runs before the inherited onDone. */
  afterSuccess?: (result: unknown) => void;
}

/**
 * The ONE governed, role-aware action control every module reuses.
 *
 * Wraps {@link InsightActionButton} (confirm → run → toast + bell → runtime
 * 404/501 self-disables to "unavailable") with the RBAC gate {@link useCanPerform}:
 *  - loading     → a disabled placeholder (never a deny-flash)
 *  - not allowed → denyMode 'hide' renders nothing (mutating verbs) / 'disable'
 *                  shows a disabled button with a "no permission" tooltip
 *  - allowed     → the live InsightActionButton
 *
 * RBAC deny is kept SEPARATE from backend-availability: a permission denial never
 * routes through InsightActionButton's `capable={false}` (which means "route not
 * live yet"), so the user always sees the correct reason.
 *
 * Data-access governance: this gates WHO may trigger the action. WHAT data the
 * result shows is governed by Snowflake RLS/masking on the read path (per the
 * caller's role). For FROZEN artifacts (exports / snapshots / generated files) the
 * producer's row-visibility is baked in — callers must re-filter on view or
 * restrict sharing to same-RLS-class viewers; never expose a frozen export of
 * RLS-gated data via a public link.
 */
export default function GovernedActionButton({
  module,
  action,
  denyMode = 'hide',
  mutatesPerms = false,
  afterSuccess,
  onDone,
  ...insightProps
}: GovernedActionButtonProps) {
  const { allowed, loading } = useCanPerform(module, action);

  if (loading) {
    return (
      <button
        type="button"
        disabled
        aria-busy="true"
        className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-gray-400 bg-gray-100 dark:bg-gray-800 cursor-wait opacity-70"
      >
        {insightProps.label}
      </button>
    );
  }

  if (!allowed) {
    if (denyMode === 'hide') return null;
    return (
      <button
        type="button"
        disabled
        title="You don't have permission to perform this action."
        className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-gray-400 bg-gray-100 dark:bg-gray-800 cursor-not-allowed opacity-60"
      >
        {insightProps.label}
      </button>
    );
  }

  return (
    <InsightActionButton
      {...insightProps}
      onDone={(result) => {
        if (mutatesPerms) {
          try {
            invalidateMyPermissions();
          } catch {
            /* best-effort */
          }
        }
        afterSuccess?.(result);
        onDone?.(result);
      }}
    />
  );
}
