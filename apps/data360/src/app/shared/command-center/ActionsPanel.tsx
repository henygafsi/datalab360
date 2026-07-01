'use client';

/**
 * CommandCenterActionsPanel — the Account Overview module's single docked
 * action surface (2026 right-tab UX standard). Replaces scattered toolbar
 * buttons by gathering the module's genuinely page-global actions into one
 * `RightTabPanel`:
 *
 *   • Data        → manual Refresh + last-updated (the only global data action;
 *                   freshness is otherwise driven by SSE cache-invalidation).
 *   • Maintenance → role-gated admin affordances that provision / repair the
 *                   Overview KPI cache. These call the SAME services the inline
 *                   recovery banners use (`installOverviewKpis`, bootstrap), so
 *                   no new endpoints and no lifted banner state.
 *
 * Per-row actions (deployment approve/reject) and per-table CSV export stay
 * contextual where they belong — globalising them would be dishonest UX.
 *
 * Active section persists under `data360.accountOverview.smartPanel.v1`.
 */

import { useState } from 'react';
import { RefreshCw, Wrench, DatabaseZap, LifeBuoy, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import cn from '@core/utils/class-names';
import RightTabPanel, {
  type RightTabSection,
} from '@/app/shared/governance/right-tab-panel';
import { useCanPerform } from '@/hooks/useCanPerform';
import apiClient, { getApiErrorMessage } from '@/lib/api-client';
import { installOverviewKpis } from '@/app/services/command-center';
import AiActionBlocks from '@/app/shared/command-center/AiActionBlocks';

export interface CommandCenterActionsPanelProps {
  /** Re-fetch the active tab's data. */
  onRefresh: () => void;
  /** Last successful data load, for the freshness line. */
  lastUpdated: Date | null;
  /** True while a refresh is in flight. */
  refreshing?: boolean;
  /** Close the panel. */
  onClose: () => void;
}

const actionBtn =
  'inline-flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-700';

export default function CommandCenterActionsPanel({
  onRefresh,
  lastUpdated,
  refreshing,
  onClose,
}: CommandCenterActionsPanelProps) {
  // Maintenance = provisioning / repairing this account's Overview KPI cache — a
  // create-scoped action on the account-overview surface, whose frontend
  // action-registry module is `org_accounts` (see BACKEND_MODULE_ALIAS in the
  // Access Center: "Account / org overview = command center"). Sibling
  // org-accounts tabs gate resource-monitor creation on this same key. Gating via
  // Action-RBAC replaces the former coarse admin-role check. Fail-open while the
  // allow-set loads so this recovery affordance never flashes away from an admin.
  const { allowed: canMaintain, loading: maintainLoading } = useCanPerform(
    'org_accounts',
    'create',
  );
  const maintainDenied = !canMaintain && !maintainLoading;

  const [section, setSection] = useState('data');
  const [provisioning, setProvisioning] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);

  const provision = async () => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Provision the Overview KPI cache?\n\nThis creates the analytics cache objects in your data warehouse so the Overview snapshot loads instantly. Continue?',
      )
    ) {
      return;
    }
    setProvisioning(true);
    try {
      const res = await installOverviewKpis();
      if (res.status === 'ok') {
        toast.success(
          'Provisioning started — the cache will populate within ~5 minutes.',
        );
      } else if (res.status === 'not-deployed') {
        toast.error('Not available on this backend yet.');
      } else if (res.status === 'forbidden') {
        toast.error(res.message || 'Your role can’t provision this.');
      } else {
        toast.error(res.message || 'Provisioning failed.');
      }
    } finally {
      setProvisioning(false);
    }
  };

  const bootstrap = async () => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Re-run account bootstrap?\n\nThis re-creates the analytics cache schema for this account if it is missing. Continue?',
      )
    ) {
      return;
    }
    setBootstrapping(true);
    try {
      await apiClient.post('/user/bootstrap-account/');
      toast.success(
        'Bootstrap completed — the Overview cache will populate within ~5 minutes.',
      );
    } catch (e) {
      const detail =
        (e as { response?: { data?: { detail?: { message?: string } } } })
          ?.response?.data?.detail?.message ??
        getApiErrorMessage(e) ??
        'Bootstrap failed.';
      toast.error(String(detail));
    } finally {
      setBootstrapping(false);
    }
  };

  // AI-prefilled call-to-action blocks (cross-module, account scope). Client-side
  // synthesis of the recommendations + insights getters — see AiActionBlocks.
  const aiSection: RightTabSection = {
    id: 'ai',
    icon: Sparkles,
    label: 'Actions IA',
    render: () => (
      <AiActionBlocks
        context={{ scope: 'account' }}
        title="Actions IA suggérées"
      />
    ),
  };

  const dataSection: RightTabSection = {
    id: 'data',
    icon: RefreshCw,
    label: 'Data',
    render: () => (
      <div className="space-y-3">
        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Reload the active tab now, or let live cache-invalidation events keep
          the data fresh automatically.
        </p>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className={actionBtn}
        >
          <RefreshCw
            className={cn('h-4 w-4', refreshing && 'animate-spin')}
            aria-hidden
          />
          {refreshing ? 'Refreshing…' : 'Refresh data'}
        </button>
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
          Last updated:{' '}
          <span className="font-medium text-slate-700 dark:text-slate-200">
            {lastUpdated ? lastUpdated.toLocaleTimeString() : '—'}
          </span>
        </div>
      </div>
    ),
  };

  const maintenanceSection: RightTabSection = {
    id: 'maintenance',
    icon: Wrench,
    label: 'Maintenance',
    render: () => (
      <div className="space-y-4">
        <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
          Admin tools to provision or repair the Overview KPI cache. When the
          cache is missing, metrics fall back to slower live queries.
        </p>
        <div className="space-y-2">
          <button
            type="button"
            onClick={provision}
            disabled={provisioning}
            className={actionBtn}
          >
            <DatabaseZap className="h-4 w-4" aria-hidden />
            {provisioning ? 'Provisioning…' : 'Provision KPI cache'}
          </button>
          <button
            type="button"
            onClick={bootstrap}
            disabled={bootstrapping}
            className={actionBtn}
          >
            <LifeBuoy className="h-4 w-4" aria-hidden />
            {bootstrapping ? 'Bootstrapping…' : 'Re-run account bootstrap'}
          </button>
        </div>
        <p className="text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">
          The cache repopulates within ~5 minutes after a successful run.
        </p>
      </div>
    ),
  };

  const sections: RightTabSection[] = maintainDenied
    ? [aiSection, dataSection]
    : [aiSection, dataSection, maintenanceSection];

  return (
    <RightTabPanel
      title="Actions"
      subtitle="Account Overview"
      sections={sections}
      activeSection={section}
      onSectionChange={setSection}
      onClose={onClose}
      storageKey="data360.accountOverview.smartPanel.v1"
      accentClassName="bg-blue-500"
    />
  );
}
