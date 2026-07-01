'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { Badge, Button, Loader } from 'rizzui';
import { PiWarningCircleBold, PiBellRingingDuotone, PiArrowsClockwise, PiCheckBold } from 'react-icons/pi';
import toast from 'react-hot-toast';
import cn from '@core/utils/class-names';
import Breadcrumb from '@/components/ui/Breadcrumb';
import EmptyState from '@/components/ui/EmptyState';
import TableSkeleton from '@/components/ui/TableSkeleton';
import FreshnessDisclaimer from '@/app/shared/observability/freshness-disclaimer';
import { ActionRail, useActionPanel } from '@/app/shared/action-rail';
import {
  getObservabilityAlerts,
  getCrossModuleAlerts,
  isRouteNotDeployed,
} from '@/app/services/observability';
import apiClient, { getApiErrorMessage } from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { useCanPerform } from '@/hooks/useCanPerform';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';
import AIActionFlow, { type Suggestion } from '@/app/shared/insights/AIActionFlow';
import type { ObservabilityAlert } from '@/app/services/observability/types';

function severityClasses(severity?: string): string {
  const s = (severity || '').toLowerCase();
  if (s === 'critical' || s === 'high')
    return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
  if (s === 'medium') return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
  if (s === 'low') return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
  return 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300';
}

/** Cross-module alerts carry `timestamp`; threshold alerts carry none. */
function fmtTimestamp(ts?: string): string {
  return ts ? ts.replace('T', ' ').split('.')[0] : '—';
}

/** Category falls back across the two backend alert shapes. */
function alertCategory(a: ObservabilityAlert): string {
  return a.category ?? a.alert_type ?? a.type ?? a.source_module ?? '—';
}

export default function AlertsPage() {
  // Fire-and-forget PAGE_VIEW on mount/route change; trackTabSwitch on scope change.
  const { trackTabSwitch } = useTrackEvent();
  const [scope, setScope] = useState<'all' | 'cross-module'>('all');
  const [alerts, setAlerts] = useState<ObservabilityAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notDeployed, setNotDeployed] = useState(false);
  const [selected, setSelected] = useState<ObservabilityAlert | null>(null);
  const [ackingId, setAckingId] = useState<string | null>(null);
  const { isOpen, open, close } = useActionPanel<'details'>();

  // Action-RBAC gate (H8): acknowledging an alert is an observability alert-config
  // write. `configure-alerts` is the action-registry key for the cost/alerts surface
  // (the strings my-permissions returns). Fail-open while the allow-set loads so a
  // transient backend hiccup never locks an admin out of their own control.
  const ackPerm = useCanPerform('observability', 'configure-alerts');
  const canAck = ackPerm.allowed || ackPerm.loading;
  const ackDeniedTitle = 'You lack the "configure-alerts" permission on observability. Ask an administrator to grant it.';

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotDeployed(false);
    try {
      const res = scope === 'cross-module' ? await getCrossModuleAlerts() : await getObservabilityAlerts();
      const r = res as unknown as Record<string, unknown>;
      const raw = r.alerts ?? r.data ?? (Array.isArray(res) ? res : []);
      setAlerts(Array.isArray(raw) ? (raw as ObservabilityAlert[]) : []);
    } catch (err) {
      if (isRouteNotDeployed(err)) {
        setNotDeployed(true);
      } else {
        setError(getApiErrorMessage(err));
      }
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [scope]);

  useEffect(() => {
    load();
  }, [load]);

  // Real-time refresh: the observability router emits `observability_dashboard`
  // (batch probe checks) and may emit `alerts`. Re-pull the feed on either so a
  // colleague's batch-check / new alert reflects without a manual Refresh. Uses
  // the global SSE atom (one shared connection) rather than a per-page stream.
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  useEffect(() => {
    if (!lastInvalidation) return;
    const relevant = lastInvalidation.keys.some(
      (k: string) => k === CACHE_KEYS.OBSERVABILITY_DASHBOARD || k === CACHE_KEYS.ALERTS,
    );
    if (relevant) load();
  }, [lastInvalidation, load]);

  const acknowledge = useCallback(async (alert: ObservabilityAlert) => {
    const alertId = alert.id;
    if (!alertId) { toast.error('This alert has no ID and cannot be acknowledged'); return; }
    setAckingId(alertId);
    try {
      await apiClient.post(`/observability/alerts/${encodeURIComponent(alertId)}/ack`, {
        acknowledged_by: 'current_user',
      });
      toast.success('Alert acknowledged');
      load();
      // Close the panel if the acknowledged alert was the selected one
      if (selected?.id === alertId) { close(); }
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setAckingId(null);
    }
  }, [load, selected, close]);

  return (
    <div className="@container p-4">
      <Breadcrumb
        items={[
          { label: 'Observability', href: '/observability' },
          { label: 'Alerts', href: '/observability/alerts' },
        ]}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <PiBellRingingDuotone className="h-6 w-6 text-amber-500" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Alerts</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant={scope === 'all' ? 'solid' : 'outline'}
            className={scope === 'all' ? 'bg-indigo-600 text-white' : ''}
            onClick={() => { trackTabSwitch('all'); setScope('all'); }}
          >
            All
          </Button>
          <Button
            size="sm"
            variant={scope === 'cross-module' ? 'solid' : 'outline'}
            className={scope === 'cross-module' ? 'bg-indigo-600 text-white' : ''}
            onClick={() => { trackTabSwitch('cross-module'); setScope('cross-module'); }}
          >
            Cross-module
          </Button>
          <Button size="sm" variant="outline" onClick={load} disabled={loading} className="gap-1">
            {loading ? <Loader variant="spinner" size="sm" /> : <PiArrowsClockwise className="h-3.5 w-3.5" />}
            Refresh
          </Button>
        </div>
      </div>

      <FreshnessDisclaimer className="mb-4" />

      {/* AI flow: discussion → proposed action → execute → capitalize as an event.
          Rule-based (no LLM). Only renders when alerts are present. The top alert's
          id drives a real acknowledge mutation; the second suggestion hands off to
          the workflow builder (business-flow automation) with a triage template. */}
      {!loading && !error && !notDeployed && alerts.length > 0 && (() => {
        const top = alerts.find((a) => a.id);
        const suggestions: Suggestion[] = [];
        if (top?.id) {
          suggestions.push({
            id: 'obs-ack-top',
            title: 'Acknowledge top alert',
            rationale: `"${top.title ?? top.message ?? 'Top alert'}"${top.severity ? ` (${top.severity})` : ''} is the highest-priority open alert. Acknowledging it records ownership and stops repeat notifications.`,
            action: {
              label: 'Acknowledge',
              endpoint: API.observability.acknowledgeAlert(top.id),
              method: 'POST',
              payload: { acknowledged_by: 'current_user', source: 'ai_action_flow' },
              cost: '~0',
              risk: 'low',
            },
          });
        }
        suggestions.push({
          id: 'obs-automate-triage',
          title: 'Automate alert triage',
          rationale: `${alerts.length} alert${alerts.length === 1 ? '' : 's'} active. Instead of triaging by hand each time, build a workflow that routes and acts on alerts automatically.`,
          navigate: {
            label: 'Create triage workflow →',
            href: '/workflow?template=alert-triage',
          },
        });
        return (
          <AIActionFlow
            className="mb-4"
            title="Recommended next steps"
            context={{
              module: 'observability',
              entityType: 'alerts',
              entityId: scope,
              data: { alertCount: alerts.length, scope },
            }}
            suggestions={suggestions}
          />
        );
      })()}

      {loading ? (
        <TableSkeleton rows={6} columns={4} />
      ) : notDeployed ? (
        <EmptyState
          icon={PiWarningCircleBold}
          title="Alerts are not available yet"
          description="The alerts capability is not deployed on the connected backend. It will appear here once /observability/alerts is exposed."
        />
      ) : error ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/50">
          <PiWarningCircleBold className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      ) : alerts.length === 0 ? (
        <EmptyState
          icon={PiBellRingingDuotone}
          title="No active alerts"
          description="No alerts were raised for the selected scope in the current window."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
                <th className="px-3 py-2">Severity</th>
                <th className="px-3 py-2">Title</th>
                <th className="px-3 py-2">Category</th>
                <th className="px-3 py-2">Resource</th>
                <th className="px-3 py-2">Detected</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {alerts.map((a, i) => (
                <tr
                  key={a.id ?? i}
                  className="border-b border-gray-100 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-700/30"
                >
                  <td className="px-3 py-2">
                    <Badge size="sm" className={cn(severityClasses(a.severity))}>
                      {a.severity ?? '—'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">
                    {a.title ?? a.message ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-gray-600 dark:text-gray-400">{alertCategory(a)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-600 dark:text-gray-400">
                    {a.resource ?? '—'}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                    {fmtTimestamp(a.detected_at ?? a.timestamp)}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelected(a);
                          open('details');
                        }}
                      >
                        Details
                      </Button>
                      {a.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          isLoading={ackingId === a.id}
                          disabled={ackingId !== null || !canAck}
                          title={!canAck ? ackDeniedTitle : undefined}
                          className="gap-1 border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-400"
                          onClick={() => acknowledge(a)}
                        >
                          <PiCheckBold className="h-3 w-3" />
                          Ack
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ActionRail
        isOpen={isOpen}
        onClose={close}
        title={selected?.title ?? selected?.message ?? 'Alert details'}
        description={selected?.category}
        accentClassName="bg-amber-500"
      >
        {selected && (
          <div className="space-y-3 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-gray-500 dark:text-gray-400">Severity</span>
              <Badge size="sm" className={cn(severityClasses(selected.severity))}>
                {selected.severity ?? '—'}
              </Badge>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Category</p>
              <p className="text-gray-800 dark:text-gray-200">{alertCategory(selected)}</p>
            </div>
            {selected.source_module && (
              <div>
                <p className="text-xs uppercase tracking-wide text-gray-400">Source module</p>
                <p className="text-gray-800 dark:text-gray-200">{selected.source_module}</p>
              </div>
            )}
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Resource</p>
              <p className="font-mono text-gray-800 dark:text-gray-200">{selected.resource ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Detected</p>
              <p className="text-gray-800 dark:text-gray-200">
                {fmtTimestamp(selected.detected_at ?? selected.timestamp)}
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Description</p>
              <p className="text-gray-700 dark:text-gray-300">
                {selected.description ?? selected.message ?? '—'}
              </p>
            </div>
            {selected.suggested_action && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-950/30">
                <p className="text-xs uppercase tracking-wide text-amber-600 dark:text-amber-400">
                  Suggested action
                </p>
                <p className="mt-0.5 text-gray-700 dark:text-gray-300">{selected.suggested_action}</p>
              </div>
            )}
            {selected.id && (
              <div className="pt-2">
                <Button
                  size="sm"
                  isLoading={ackingId === selected.id}
                  disabled={ackingId !== null || !canAck}
                  title={!canAck ? ackDeniedTitle : undefined}
                  className="w-full gap-1 bg-green-600 text-white hover:bg-green-700"
                  onClick={() => acknowledge(selected)}
                >
                  <PiCheckBold className="h-3.5 w-3.5" />
                  Acknowledge alert
                </Button>
              </div>
            )}
          </div>
        )}
      </ActionRail>
    </div>
  );
}
