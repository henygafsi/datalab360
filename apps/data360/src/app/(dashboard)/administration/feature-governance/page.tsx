'use client';

/**
 * Feature Governance (G5) — admins govern WHO can create / run / deploy / manage
 * charts & projects, per account, from the Administration surface.
 *
 * Consumes the previously-orphaned ACCOUNTADMIN-gated backend:
 *   GET /api/administration/entitlements         (module × feature on/off matrix)
 *   PUT /api/administration/entitlements/{m}/{k}  (toggle one addon — write-back)
 *   GET /api/administration/governance-posture    (per-module rollup: roles,
 *                                                   bound policies, usage)
 */
import { ShieldCheck } from 'lucide-react';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import FeatureGovernanceMatrix from './FeatureGovernanceMatrix';

export default function FeatureGovernancePage() {
  // Auto-fire a PAGE_VIEW on mount. Tracking lives in this route wrapper (not the
  // matrix) because FeatureGovernanceMatrix is also embedded in the access-center
  // tab — tracking inside it would double-count.
  useTrackEvent();
  return (
    <div className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-slate-400" />
          <div>
            <h1 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Feature Governance
            </h1>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Govern who can create, run, deploy and manage charts &amp; projects — per account.
            </p>
          </div>
        </div>
      </div>

      <FeatureGovernanceMatrix />
    </div>
  );
}
