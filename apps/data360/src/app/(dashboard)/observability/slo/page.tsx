'use client';

import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Input, Loader, Select } from 'rizzui';
import { PiWarningCircleBold, PiGaugeDuotone, PiArrowsClockwise, PiPlusBold } from 'react-icons/pi';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import cn from '@core/utils/class-names';
import Breadcrumb from '@/components/ui/Breadcrumb';
import EmptyState from '@/components/ui/EmptyState';
import TableSkeleton from '@/components/ui/TableSkeleton';
import FreshnessDisclaimer from '@/app/shared/observability/freshness-disclaimer';
import RightTabPanel, { type RightTabSection } from '@/app/shared/governance/right-tab-panel';
import { getSloTracking, isRouteNotDeployed } from '@/app/services/observability';
import apiClient, { getApiErrorMessage } from '@/lib/api-client';
import type { SloRecord } from '@/app/services/observability/types';

// ---------------------------------------------------------------------------
// Add SLO — docked right-tab panel (no centered overlay; the table stays visible
// alongside). Mirrors the Data360 right-tab pattern via the shared RightTabPanel.
// ---------------------------------------------------------------------------
const TARGET_METRIC_OPTIONS = [
  { label: 'Availability', value: 'AVAILABILITY' },
  { label: 'Latency', value: 'LATENCY' },
  { label: 'Error rate', value: 'ERROR_RATE' },
];

function AddSloPanel({
  isOpen,
  onClose,
  onAdded,
}: {
  isOpen: boolean;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState('');
  const [targetMetric, setTargetMetric] = useState<string>('AVAILABILITY');
  const [targetValue, setTargetValue] = useState('');
  const [windowDays, setWindowDays] = useState('30');
  const [submitting, setSubmitting] = useState(false);
  const [section, setSection] = useState('create');

  const reset = () => {
    setName('');
    setTargetMetric('AVAILABILITY');
    setTargetValue('');
    setWindowDays('30');
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleSubmit = async () => {
    if (!name.trim()) { toast.error('Name is required'); return; }
    const target = Number(targetValue);
    if (!targetValue || Number.isNaN(target) || target < 0 || target > 100) {
      toast.error('Target value must be between 0 and 100');
      return;
    }
    const days = Number(windowDays);
    if (!windowDays || Number.isNaN(days) || days <= 0) {
      toast.error('Window days must be a positive number');
      return;
    }
    setSubmitting(true);
    try {
      // Backend UserSLOCreate expects { name, metric, target, window } — window
      // is a string like '30d'. (FE previously sent target_metric/target_value/
      // window_days → 422.)
      await apiClient.post('/observability/slo', {
        name: name.trim(),
        metric: targetMetric,
        target,
        window: `${days}d`,
      });
      toast.success(`SLO "${name.trim()}" added`);
      reset();
      onAdded();
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
      label: 'New SLO',
      render: () => (
        <div className="space-y-4">
          <Input
            label="Name"
            placeholder="query_availability"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />

          <Select
            label="Target metric"
            options={TARGET_METRIC_OPTIONS}
            value={targetMetric}
            onChange={(opt) => setTargetMetric((opt as { value: string }).value)}
          />

          <Input
            label="Target value (%)"
            type="number"
            min={0}
            max={100}
            step={0.1}
            placeholder="99.9"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
          />

          <Input
            label="Window (days)"
            type="number"
            min={1}
            placeholder="30"
            value={windowDays}
            onChange={(e) => setWindowDays(e.target.value)}
          />
        </div>
      ),
    },
  ];

  return (
    <RightTabPanel
      title="Add SLO"
      subtitle="Define a service-level objective for this account"
      sections={sections}
      activeSection={section}
      onSectionChange={setSection}
      onClose={handleClose}
      storageKey="data360.observability.smartPanel.v1"
      accentClassName="bg-indigo-500"
      footer={
        <>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button
            isLoading={submitting}
            onClick={handleSubmit}
            className="bg-indigo-600 text-white hover:bg-indigo-700"
          >
            Add SLO
          </Button>
        </>
      }
    />
  );
}

function statusClasses(status?: string): string {
  // Backend get_slo_tracking emits OK / BREACH (lowercased here); older payloads
  // used meeting / at_risk / breached.
  const s = (status || '').toLowerCase();
  if (s === 'breached' || s === 'breach') return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
  if (s === 'at_risk') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
  if (s === 'meeting' || s === 'ok') return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
  return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
}

function statusLabel(status?: string): string {
  const s = (status || '').toLowerCase();
  if (s === 'ok' || s === 'meeting') return 'Meeting';
  if (s === 'breach' || s === 'breached') return 'Breached';
  if (s === 'at_risk') return 'At risk';
  return status ?? '—';
}

function pct(v?: number | null): string {
  return v == null ? '—' : `${v.toFixed(1)}%`;
}

/** Format an SLO target/actual using its declared unit ('%' default, or seconds). */
function sloValue(v?: number | null, unit?: string): string {
  if (v == null) return '—';
  const u = (unit || '%').toLowerCase();
  if (u === 'seconds' || u === 'sec' || u === 's') return `${v.toFixed(1)}s`;
  if (u === 'ms') return `${v.toFixed(0)}ms`;
  return `${v.toFixed(1)}%`;
}

export default function SloPage() {
  const [slos, setSlos] = useState<SloRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notDeployed, setNotDeployed] = useState(false);
  const [addSloOpen, setAddSloOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotDeployed(false);
    try {
      const res = await getSloTracking();
      const r = res as unknown as Record<string, unknown>;
      const raw = r.slos ?? r.data ?? (Array.isArray(res) ? res : []);
      setSlos(Array.isArray(raw) ? (raw as SloRecord[]) : []);
    } catch (err) {
      if (isRouteNotDeployed(err)) {
        setNotDeployed(true);
      } else {
        setError(getApiErrorMessage(err));
      }
      setSlos([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="@container p-4">
      <Breadcrumb
        items={[
          { label: 'Observability', href: '/observability' },
          { label: 'SLO Tracking', href: '/observability/slo' },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PiGaugeDuotone className="h-6 w-6 text-indigo-500" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">SLO Tracking</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            className="gap-1 bg-indigo-600 text-white hover:bg-indigo-700"
            onClick={() => setAddSloOpen(true)}
          >
            <PiPlusBold className="h-3.5 w-3.5" />
            Add SLO
          </Button>
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1">
            {loading ? <Loader variant="spinner" size="sm" /> : <PiArrowsClockwise className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>
      </div>

      <FreshnessDisclaimer className="mb-4" />

      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          {loading ? (
            <TableSkeleton rows={5} columns={7} />
          ) : notDeployed ? (
            <EmptyState
              icon={PiWarningCircleBold}
              title="SLO tracking is not available yet"
              description="The SLO capability is not deployed on the connected backend. It will appear here once /observability/slo-tracking is exposed."
            />
          ) : error ? (
            <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/50">
              <PiWarningCircleBold className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          ) : slos.length === 0 ? (
            <EmptyState
              icon={PiGaugeDuotone}
              title="No SLOs defined"
              description="Service-level objectives will appear here once they are configured for this account."
              action={
                <Button
                  size="sm"
                  className="mt-3 gap-1 bg-indigo-600 text-white hover:bg-indigo-700"
                  onClick={() => setAddSloOpen(true)}
                >
                  <PiPlusBold className="h-3.5 w-3.5" />
                  Add SLO
                </Button>
              }
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                    <th className="px-3 py-2">Objective</th>
                    <th className="px-3 py-2">Category</th>
                    <th className="px-3 py-2">Target</th>
                    <th className="px-3 py-2">Actual</th>
                    <th className="px-3 py-2">Sample</th>
                    <th className="px-3 py-2">Error budget</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {slos.map((slo, i) => (
                    <tr
                      key={slo.name ?? i}
                      className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-700/30"
                    >
                      <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">
                        {slo.name ?? slo.objective ?? '—'}
                      </td>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{slo.category ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                        {sloValue(slo.target ?? slo.target_percent, slo.unit)}
                      </td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                        {sloValue(slo.actual ?? slo.actual_percent, slo.unit)}
                      </td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                        {slo.sample_size != null ? (
                          <span>
                            {slo.sample_size.toLocaleString()}
                            {slo.failures != null && slo.failures > 0 && (
                              <span className="ml-1 text-xs text-red-500">({slo.failures} failed)</span>
                            )}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                        {pct(slo.error_budget_remaining_percent)}
                      </td>
                      <td className="px-3 py-2">
                        <Badge size="sm" className={cn(statusClasses(slo.status))}>
                          {statusLabel(slo.status)}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <AddSloPanel
          isOpen={addSloOpen}
          onClose={() => setAddSloOpen(false)}
          onAdded={() => {
            setAddSloOpen(false);
            load();
          }}
        />
      </div>
    </div>
  );
}
