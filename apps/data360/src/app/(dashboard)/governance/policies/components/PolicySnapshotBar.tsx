'use client';

/**
 * PolicySnapshotBar — provenance + explicit refresh for the policy lists.
 *
 * The backend serves policies cache-first from an account-wide snapshot
 * (6 h TTL, invalidated by every policy/grant/role write); the free read is
 * ~ms warm. This bar SAYS where the list came from and when, flags what the
 * snapshot could not read (named policies, roles still completing) instead
 * of hiding it, and carries the ONE spending action: "Refresh from the data
 * warehouse" — the user's explicit direct query (5–10 s), never automatic.
 */

import { AlertTriangle, DatabaseZap, RefreshCw } from 'lucide-react';
import type { EnrichedPoliciesView } from '@/app/services/governance/policies';

function ago(iso?: string): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 90) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 90) return `${m} min ago`;
  const h = Math.round(m / 60);
  return `${h} h ago`;
}

export default function PolicySnapshotBar({
  view,
  refreshing,
  onRefresh,
}: {
  view: EnrichedPoliciesView | null;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  // Nothing served yet (old backend, or first load) — say nothing rather
  // than inventing provenance.
  if (!view || (!view.snapshot && !view.partial && view.unreadable_policies.length === 0)) {
    return null;
  }
  const takenAgo = ago(view.snapshot?.policies_at);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-1.5 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900/40 dark:text-slate-400">
      <span className="inline-flex items-center gap-1.5">
        <DatabaseZap aria-hidden className="h-3.5 w-3.5 text-slate-400" />
        Account snapshot
        {takenAgo && <span>· taken {takenAgo}</span>}
      </span>
      {view.roles_state === 'partial' && (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          <AlertTriangle aria-hidden className="h-3 w-3" />
          grantee roles still completing
        </span>
      )}
      {view.unreadable_policies.length > 0 && (
        <span
          className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 tabular-nums text-amber-800 dark:bg-amber-900/30 dark:text-amber-300"
          title={view.unreadable_policies.join(', ')}
        >
          <AlertTriangle aria-hidden className="h-3 w-3" />
          {view.unreadable_policies.length} could not be read
        </span>
      )}
      <button
        type="button"
        disabled={refreshing}
        onClick={onRefresh}
        title="Runs the direct query against the account — takes 5–10 s"
        className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-0.5 text-slate-600 hover:border-slate-300 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-300"
      >
        <RefreshCw aria-hidden className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} />
        {refreshing ? 'Querying the warehouse…' : 'Refresh from the data warehouse'}
      </button>
    </div>
  );
}
