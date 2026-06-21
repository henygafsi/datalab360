'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Badge, Button, Input, Loader, Select } from 'rizzui';
import { PiWarningCircleBold, PiGaugeDuotone, PiArrowsClockwise, PiPlusBold } from 'react-icons/pi';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import cn from '@core/utils/class-names';
import Breadcrumb from '@/components/ui/Breadcrumb';
import EmptyState from '@/components/ui/EmptyState';
import TableSkeleton from '@/components/ui/TableSkeleton';
import CostOverviewCard from '@/app/shared/observability/cost-overview-card';
import FreshnessDisclaimer from '@/app/shared/observability/freshness-disclaimer';
import RightTabPanel, { type RightTabSection } from '@/app/shared/governance/right-tab-panel';
import {
  getWarehouseUsage,
  getStorageMetrics,
  getDailyCredits,
  createCostMonitor,
  isRouteNotDeployed,
} from '@/app/services/observability';
import type {
  WarehouseUsageSummary,
  StorageMetrics,
  DailyCreditUsage,
} from '@/app/services/observability/types';
// Resource monitors live in org-accounts; consuming the deployed service from a
// page inside the observability scope is a read, not an out-of-scope edit.
import { getResourceMonitors } from '@/app/services/org-accounts/hooks';
import { getApiErrorMessage } from '@/lib/api-client';
import { useCanPerform } from '@/hooks/useCanPerform';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';

// ---------------------------------------------------------------------------
// Create Resource Monitor — docked right-tab panel (no centered overlay; the
// cost cards and monitors table stay visible alongside). Mirrors the Data360
// right-tab pattern via the shared RightTabPanel.
// ---------------------------------------------------------------------------
const FREQUENCY_OPTIONS = [
  { label: 'Daily', value: 'DAILY' },
  { label: 'Weekly', value: 'WEEKLY' },
  { label: 'Monthly', value: 'MONTHLY' },
];
const ACTION_OPTIONS = [
  { label: 'Suspend immediate', value: 'SUSPEND_IMMEDIATE' },
  { label: 'Suspend', value: 'SUSPEND' },
];

function CreateMonitorPanel({
  isOpen,
  onClose,
  onCreated,
}: {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [quota, setQuota] = useState('');
  const [frequency, setFrequency] = useState<string>('MONTHLY');
  const [action, setAction] = useState<string>('SUSPEND_IMMEDIATE');
  const [submitting, setSubmitting] = useState(false);
  const [section, setSection] = useState('create');

  const reset = () => {
    setName('');
    setQuota('');
    setFrequency('MONTHLY');
    setAction('SUSPEND_IMMEDIATE');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    const creditQuota = Number(quota);
    if (!quota || Number.isNaN(creditQuota) || creditQuota <= 0) {
      toast.error('Credit quota must be a positive number');
      return;
    }
    setSubmitting(true);
    try {
      await createCostMonitor({
        name: name.trim(),
        credit_quota: creditQuota,
        frequency,
        triggers: [{ percent: 100, action: action as 'SUSPEND_IMMEDIATE' | 'SUSPEND' }],
        notify_users: [],
      });
      toast.success(`Monitor "${name.trim()}" created`);
      reset();
      onCreated();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const sections: RightTabSection[] = [
    {
      id: 'create',
      icon: Plus,
      label: 'New monitor',
      render: () => (
        <div className="space-y-4">
          <Input
            label="Monitor name"
            placeholder="my_monitor"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <Input
            label="Credit quota"
            type="number"
            min={1}
            placeholder="100"
            value={quota}
            onChange={(e) => setQuota(e.target.value)}
          />

          <Select
            label="Frequency"
            options={FREQUENCY_OPTIONS}
            value={frequency}
            onChange={(opt) => setFrequency((opt as { value: string }).value)}
          />

          <Select
            label="Action at 100%"
            options={ACTION_OPTIONS}
            value={action}
            onChange={(opt) => setAction((opt as { value: string }).value)}
          />
        </div>
      ),
    },
  ];

  return (
    <RightTabPanel
      title="Create Resource Monitor"
      subtitle="Enforce a credit budget on one or more warehouses"
      sections={sections}
      activeSection={section}
      onSectionChange={setSection}
      onClose={handleClose}
      storageKey="data360.observability.smartPanel.v1"
      accentClassName="bg-green-500"
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            isLoading={submitting}
            onClick={handleSubmit}
            className="bg-green-600 text-white hover:bg-green-700"
          >
            Create
          </Button>
        </>
      }
    />
  );
}

interface ResourceMonitorRow {
  name?: string;
  credit_quota?: number | null;
  used_credits?: number | null;
  remaining_credits?: number | null;
  used_percent?: number | null;
  frequency?: string | null;
  level?: string | null;
  notify_at?: string | null;
  suspend_at?: string | null;
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return typeof n === 'number' && !Number.isNaN(n) ? n : null;
}

function fmt(v: number | null, suffix = ''): string {
  return v == null ? '—' : `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })}${suffix}`;
}

function normalizeMonitor(raw: unknown): ResourceMonitorRow {
  const r = (raw ?? {}) as Record<string, unknown>;
  const quota = num(r.credit_quota ?? r.CREDIT_QUOTA);
  const used = num(r.used_credits ?? r.USED_CREDITS);
  const remaining = num(r.remaining_credits ?? r.REMAINING_CREDITS) ?? (quota != null && used != null ? quota - used : null);
  return {
    name: (r.name ?? r.NAME) as string | undefined,
    credit_quota: quota,
    used_credits: used,
    remaining_credits: remaining,
    used_percent: quota && used != null ? (used / quota) * 100 : null,
    frequency: (r.frequency ?? r.FREQUENCY) as string | undefined,
    level: (r.level ?? r.LEVEL) as string | undefined,
    notify_at: (r.notify_at ?? r.NOTIFY_AT) as string | undefined,
    suspend_at: (r.suspend_at ?? r.SUSPEND_AT) as string | undefined,
  };
}

export default function BudgetPage() {
  const [warehouse, setWarehouse] = useState<WarehouseUsageSummary | null>(null);
  const [storage, setStorage] = useState<StorageMetrics | null>(null);
  const [daily, setDaily] = useState<DailyCreditUsage[] | null>(null);
  const [monitors, setMonitors] = useState<ResourceMonitorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [monitorsLoading, setMonitorsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [monitorsError, setMonitorsError] = useState<string | null>(null);
  const [monitorsNotDeployed, setMonitorsNotDeployed] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  // Action-RBAC gate (H8): creating a resource monitor sets a credit budget — an
  // observability cost-control write. `set-budget` is the action-registry key for
  // the cost/budgets surface (matches what my-permissions returns); the backend
  // POST /cost/monitors is admin-gated. Fail-open while the allow-set loads.
  const budgetPerm = useCanPerform('observability', 'set-budget');
  const canCreateMonitor = budgetPerm.allowed || budgetPerm.loading;
  const monitorDeniedTitle = 'You lack the "set-budget" permission on observability. Ask an administrator to grant it.';

  const loadCost = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [wh, st, dc] = await Promise.all([
        getWarehouseUsage(30),
        getStorageMetrics(),
        getDailyCredits(30),
      ]);
      setWarehouse(wh);
      setStorage(st);
      setDaily(Array.isArray(dc?.daily_usage) ? dc.daily_usage : []);
    } catch (err) {
      setError(getApiErrorMessage(err));
      setWarehouse(null);
      setStorage(null);
      setDaily(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMonitors = useCallback(async () => {
    setMonitorsLoading(true);
    setMonitorsError(null);
    setMonitorsNotDeployed(false);
    try {
      const res = await getResourceMonitors();
      const list = Array.isArray(res?.monitors) ? res.monitors : [];
      setMonitors(list.map(normalizeMonitor));
    } catch (err) {
      if (isRouteNotDeployed(err)) {
        setMonitorsNotDeployed(true);
      } else {
        setMonitorsError(getApiErrorMessage(err));
      }
      setMonitors([]);
    } finally {
      setMonitorsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCost();
    loadMonitors();
  }, [loadCost, loadMonitors]);

  const refresh = useCallback(() => {
    loadCost();
    loadMonitors();
  }, [loadCost, loadMonitors]);

  // Real-time refresh: re-pull cost + monitors when the backend pushes an
  // observability/cost cache-invalidation (probe checks, warehouse/storage
  // metering refresh). Uses the global SSE atom (one shared connection).
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  useEffect(() => {
    if (!lastInvalidation) return;
    const relevant = lastInvalidation.keys.some(
      (k: string) =>
        k === CACHE_KEYS.OBSERVABILITY_DASHBOARD ||
        k === CACHE_KEYS.WAREHOUSE_USAGE ||
        k === CACHE_KEYS.STORAGE_METRICS,
    );
    if (relevant) refresh();
  }, [lastInvalidation, refresh]);

  return (
    <div className="@container p-4">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1 space-y-6">
          <Breadcrumb
            items={[
              { label: 'Observability', href: '/observability' },
              { label: 'Budget & Resource Monitors', href: '/observability/budget' },
            ]}
          />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <PiGaugeDuotone className="h-6 w-6 text-green-500" />
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Budget & Resource Monitors</h1>
            </div>
            <Button size="sm" variant="outline" onClick={refresh} disabled={loading || monitorsLoading} className="gap-1">
              {loading || monitorsLoading ? (
                <Loader variant="spinner" size="sm" />
              ) : (
                <PiArrowsClockwise className="h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          </div>

          {/* Cost overview (warehouse credits, storage, daily trend) */}
          {error ? (
            <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/50">
              <PiWarningCircleBold className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          ) : (
            <CostOverviewCard
              warehouseData={warehouse}
              storageData={storage}
              dailyCredits={daily}
              isLoading={loading}
            />
          )}

          {/* Resource monitors — the credit-budget surface */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900 dark:text-white">Resource Monitors</h2>
              <Button
                size="sm"
                className="gap-1 bg-green-600 text-white hover:bg-green-700"
                disabled={!canCreateMonitor}
                title={!canCreateMonitor ? monitorDeniedTitle : undefined}
                onClick={() => setCreateOpen(true)}
              >
                <PiPlusBold className="h-3.5 w-3.5" />
                Create Monitor
              </Button>
            </div>
            <FreshnessDisclaimer
              className="mb-3"
              detail="Resource monitor usage reflects the data warehouse's SHOW RESOURCE MONITORS, which lags real-time consumption."
            />
            {monitorsLoading ? (
              <TableSkeleton rows={4} columns={5} />
            ) : monitorsNotDeployed ? (
              <EmptyState
                icon={PiWarningCircleBold}
                title="Resource monitors are not available yet"
                description="The resource-monitors capability is not deployed on the connected backend. It will appear here once /org-accounts/resource-monitors is exposed."
              />
            ) : monitorsError ? (
              <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/50">
                <PiWarningCircleBold className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                <p className="text-sm text-red-600 dark:text-red-400">{monitorsError}</p>
              </div>
            ) : monitors.length === 0 ? (
              <EmptyState
                icon={PiGaugeDuotone}
                title="No resource monitors configured"
                description="Create resource monitors in the data warehouse to enforce credit budgets and get usage alerts."
                action={
                  <Button
                    size="sm"
                    className="mt-3 gap-1 bg-green-600 text-white hover:bg-green-700"
                    disabled={!canCreateMonitor}
                    title={!canCreateMonitor ? monitorDeniedTitle : undefined}
                    onClick={() => setCreateOpen(true)}
                  >
                    <PiPlusBold className="h-3.5 w-3.5" />
                    Create Monitor
                  </Button>
                }
              />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                      <th className="px-3 py-2">Monitor</th>
                      <th className="px-3 py-2">Quota</th>
                      <th className="px-3 py-2">Used</th>
                      <th className="px-3 py-2">Remaining</th>
                      <th className="px-3 py-2">Usage</th>
                      <th className="px-3 py-2">Frequency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monitors.map((m, i) => {
                      const pct = m.used_percent ?? null;
                      const over = pct != null && pct >= 90;
                      const warn = pct != null && pct >= 75 && pct < 90;
                      return (
                        <tr
                          key={m.name ?? i}
                          className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-700/30"
                        >
                          <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{m.name ?? '—'}</td>
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{fmt(m.credit_quota ?? null)}</td>
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{fmt(m.used_credits ?? null)}</td>
                          <td className="px-3 py-2 text-gray-700 dark:text-gray-300">{fmt(m.remaining_credits ?? null)}</td>
                          <td className="px-3 py-2">
                            <Badge
                              size="sm"
                              className={cn(
                                over
                                  ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                                  : warn
                                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                                    : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
                              )}
                            >
                              {fmt(pct, '%')}
                            </Badge>
                          </td>
                          <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">{m.frequency ?? '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <CreateMonitorPanel
          isOpen={createOpen}
          onClose={() => setCreateOpen(false)}
          onCreated={() => {
            setCreateOpen(false);
            loadMonitors();
          }}
        />
      </div>
    </div>
  );
}
