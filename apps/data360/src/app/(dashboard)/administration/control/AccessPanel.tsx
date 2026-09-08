'use client';

/**
 * AccessPanel — the "account admin adjusts access" lane of the /administration
 * control page.
 *
 * This panel does NOT reinvent an access matrix. It embeds the existing
 * FeatureGovernanceMatrix (administration/feature-governance/), which is a
 * self-fetching, prop-less component that already provides everything this
 * lane needs:
 *
 *   - GET  /api/administration/entitlements        → module × feature matrix
 *   - GET  /api/administration/governance-posture  → per-module posture rollup
 *     (rendered as the KPI strip: coverage, gaps, bound policies, your access)
 *   - PUT  /api/administration/entitlements/{module}/{feature_key}
 *     per-cell toggle — optimistic, rolled back on error, toast on both paths
 *   - NotDeployedError (404/501 from entitlements.ts) → quiet "not wired yet"
 *     degradation; loading skeleton; error state with retry
 *   - Write access gated on the envelope's `can_govern` (account admin) OR the
 *     gouvernance:grant Action-RBAC permission; everyone else is read-only.
 *
 * The panel adds only the lane framing: an explanatory header making the blast
 * radius explicit — changes apply to every user of this account.
 */
import { SlidersHorizontal } from 'lucide-react';
import FeatureGovernanceMatrix from '../feature-governance/FeatureGovernanceMatrix';

export default function AccessPanel() {
  return (
    <section aria-labelledby="access-panel-title" className="space-y-3">
      {/* Explanatory header — the one piece this lane adds around the matrix. */}
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent-50 text-accent-600 dark:bg-accent-500/10 dark:text-accent-400">
            <SlidersHorizontal className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              id="access-panel-title"
              className="text-sm font-semibold text-slate-800 dark:text-slate-100"
            >
              Feature access
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Changes apply to every user of this account. Turn a governable feature on or off per
              module — toggles write immediately and roll back if the backend rejects the change.
              Only an account admin can edit; everyone else sees the live state read-only.
            </p>
          </div>
        </div>
      </div>

      {/* The existing module × feature entitlement matrix, embedded as-is.
          It self-fetches, renders its own posture summary, and handles its own
          loading / error / not-deployed / read-only states. */}
      <FeatureGovernanceMatrix />
    </section>
  );
}
