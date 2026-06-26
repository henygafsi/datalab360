'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { Text, Badge } from 'rizzui';
import cn from '@core/utils/class-names';
import { Loader2, Plus } from 'lucide-react';
import {
  PiClockCounterClockwiseDuotone,
  PiGaugeDuotone,
  PiCalendarDuotone,
  PiBuildingsDuotone,
  PiWarningCircleDuotone,
} from 'react-icons/pi';
import {
  getDashboardOverview,
  getDashboardUsage,
  getDashboardTrends,
  getAlerts,
  getHealth,
  getTopConsumers,
  getCredits,
  getStorage,
  getDataTransfer,
  getWarehouses,
  getOrgEvents,
  getResourceMonitors,
  createResourceMonitor,
  getCrossAccountUsage,
  getQueries,
} from '@/app/services/org-accounts/hooks';
import { ActionRail } from '@/app/shared/action-rail';
import { useCanPerform } from '@/hooks/useCanPerform';
import type {
  DashboardOverviewResponse,
  DashboardUsageResponse,
  ClientAccount,
  CreditTrendPoint,
  StorageTrendPoint,
  Alert,
  AlertsResponse,
  HealthScore,
  TopConsumer,
  AccountCredit,
  AccountStorage,
  DataTransferUsage,
  Warehouse,
  DateRange,
  CrossAccountUsageResponse,
  QueriesResponse,
} from '@/app/services/org-accounts/types';

import OverviewCards from '../overview-cards';
import QueryVolumeCard from '../query-volume-card';
import AccountsTable from '../accounts-table';
import AlertsPanel from '../alerts-panel';
import HealthOverview from '../health-overview';
import AccountDetailModal from '../account-detail-modal';
import {
  CreditsTrendChart,
  StorageTrendChart,
  TopConsumersChart,
  DistributionChart,
  DataTransferChart,
  WarehouseUsageChart,
} from '../charts';
import { safeToFixed, safeNum } from '@/lib/format-number';
import { formatCredits, extractApiError } from '@/app/services/org-accounts/utils';

/** Currency formatter with honest "—" on missing values (no fake 0). */
function formatCurrency(amount: number | string | null | undefined, currency = 'USD'): string {
  const n = safeNum(amount);
  if (n == null) return '—';
  return n.toLocaleString('en-US', { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface OverviewTabProps {
  refreshKey: number;
}

export default function OverviewTab({ refreshKey }: OverviewTabProps) {
  // Step 1: Overview data
  const [overview, setOverview] = useState<DashboardOverviewResponse['overview'] | null>(null);
  const [accounts, setAccounts] = useState<ClientAccount[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // Step 2: Usage, trends, alerts, health
  const [usageData, setUsageData] = useState<DashboardUsageResponse | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [creditTrends, setCreditTrends] = useState<CreditTrendPoint[]>([]);
  const [storageTrends, setStorageTrends] = useState<StorageTrendPoint[]>([]);
  const [trendsLoading, setTrendsLoading] = useState(true);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsData, setAlertsData] = useState<AlertsResponse | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(true);
  const [healthScores, setHealthScores] = useState<HealthScore[]>([]);
  const [healthLoading, setHealthLoading] = useState(true);

  // Step 3: Detailed data
  const [topConsumers, setTopConsumers] = useState<TopConsumer[]>([]);
  const [topConsumersLoading, setTopConsumersLoading] = useState(true);
  const [creditAccounts, setCreditAccounts] = useState<AccountCredit[]>([]);
  const [storageAccounts, setStorageAccounts] = useState<AccountStorage[]>([]);
  const [dataTransfers, setDataTransfers] = useState<DataTransferUsage[]>([]);
  const [dataTransferTotalBytes, setDataTransferTotalBytes] = useState(0);
  const [dataTransferLoading, setDataTransferLoading] = useState(true);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehousesLoading, setWarehousesLoading] = useState(true);

  // Step 4: New data (events, resource monitors)
  const [events, setEvents] = useState<any[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [resourceMonitors, setResourceMonitors] = useState<any[]>([]);
  const [resourceMonitorsLoading, setResourceMonitorsLoading] = useState(true);

  // Step 5: Cross-account usage rollup (per-account credits + cost in currency).
  // Sourced from ORGANIZATION_USAGE; only an org-admin connection returns rows,
  // otherwise the list stays empty and the card shows an honest empty state.
  const [crossAccount, setCrossAccount] = useState<CrossAccountUsageResponse['account_summary']>([]);
  const [crossAccountLoading, setCrossAccountLoading] = useState(true);

  // Step 6: Query-volume KPI (total queries + per-account breakdown). May be
  // current-account only when ORGANIZATION_USAGE.QUERY_HISTORY is unavailable —
  // the response carries a `note` we surface honestly.
  const [queries, setQueries] = useState<QueriesResponse | null>(null);
  const [queriesLoading, setQueriesLoading] = useState(true);
  const [queriesError, setQueriesError] = useState<string | null>(null);

  // UI state
  const [globalDays, setGlobalDays] = useState<7 | 30 | 90>(30);
  const [creditDateRange, setCreditDateRange] = useState<DateRange>('30d');
  const [storageDateRange, setStorageDateRange] = useState<DateRange>('30d');
  const [selectedAccount, setSelectedAccount] = useState<ClientAccount | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // ── Create resource monitor (non-blocking ActionRail) ───────────────────
  // create is wired (POST /resource-monitors). There is NO backend DELETE, so
  // no drop control is offered on the cards.
  const { allowed: canCreateRm, loading: rmPermLoading } = useCanPerform('org_accounts', 'create');
  const rmCreateDenied = !canCreateRm && !rmPermLoading;
  const [rmCreateOpen, setRmCreateOpen] = useState(false);
  const [rmBusy, setRmBusy] = useState(false);
  const [rmError, setRmError] = useState<string | null>(null);
  const [rmForm, setRmForm] = useState({ name: '', credit_quota: '', frequency: 'MONTHLY', suspend_at_pct: '100' });

  const refetchResourceMonitors = useCallback(() => {
    setResourceMonitorsLoading(true);
    getResourceMonitors()
      .then((data) => setResourceMonitors(Array.isArray(data.monitors) ? data.monitors : []))
      .catch((e) => { console.error('Failed to refetch resource monitors:', e); })
      .finally(() => setResourceMonitorsLoading(false));
  }, []);

  const resetRmForm = () => {
    setRmForm({ name: '', credit_quota: '', frequency: 'MONTHLY', suspend_at_pct: '100' });
    setRmError(null);
  };

  const rmFormValid =
    rmForm.name.trim().length > 0 &&
    Number(rmForm.credit_quota) > 0 &&
    Number(rmForm.suspend_at_pct) > 0 &&
    Number(rmForm.suspend_at_pct) <= 100;

  const handleCreateResourceMonitor = async () => {
    setRmBusy(true);
    setRmError(null);
    try {
      await createResourceMonitor({
        name: rmForm.name.trim(),
        credit_quota: Number(rmForm.credit_quota),
        frequency: rmForm.frequency,
        suspend_at_pct: Number(rmForm.suspend_at_pct),
      });
      toast.success(`Resource monitor ${rmForm.name.trim()} created`);
      setRmCreateOpen(false);
      resetRmForm();
      refetchResourceMonitors();
    } catch (e) {
      setRmError(extractApiError(e, 'Failed to create resource monitor'));
    } finally {
      setRmBusy(false);
    }
  };

  // Shared "some data failed to load" flag — surfaced as one banner instead of
  // leaving the tab silently empty when individual sections fail to fetch.
  const [loadError, setLoadError] = useState<string | null>(null);
  const LOAD_ERROR_MSG = 'Some dashboard data could not be loaded. Try refreshing or selecting another period.';

  const fetchOverview = useCallback(async () => {
    try {
      const data = await getDashboardOverview();
      setOverview(data.overview);
      setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
    } catch (error) {
      console.error('Failed to fetch overview:', error);
      // Surface the real backend detail (permission/404/…) instead of a static
      // string. Keep-first so an overview failure isn't overwritten by a later
      // secondary-fetch error sharing the same banner.
      const msg = extractApiError(error, LOAD_ERROR_MSG);
      toast.error(msg);
      setLoadError((prev) => prev ?? msg);
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const fetchSecondaryData = useCallback(async (days: number) => {
    // Reset loading states for refetch feedback on period change
    setUsageLoading(true);
    setTrendsLoading(true);
    setAlertsLoading(true);
    setHealthLoading(true);
    setTopConsumersLoading(true);
    setDataTransferLoading(true);
    setWarehousesLoading(true);
    setEventsLoading(true);
    setResourceMonitorsLoading(true);
    setCrossAccountLoading(true);
    setQueriesLoading(true);
    setQueriesError(null);

    getQueries(days)
      .then((data) => setQueries(data))
      .catch((e) => { console.error('Failed to fetch queries:', e); setQueriesError(extractApiError(e, 'Failed to load query volume')); })
      .finally(() => setQueriesLoading(false));

    getDashboardUsage()
      .then((data) => setUsageData(data))
      .catch((e) => { console.error('Failed to fetch usage:', e); setLoadError((prev) => prev ?? extractApiError(e, LOAD_ERROR_MSG)); })
      .finally(() => setUsageLoading(false));

    getDashboardTrends(days)
      .then((data) => {
        setCreditTrends(Array.isArray(data.credits) ? data.credits : []);
        setStorageTrends(Array.isArray(data.storage) ? data.storage : []);
      })
      .catch((e) => { console.error('Failed to fetch trends:', e); setLoadError((prev) => prev ?? extractApiError(e, LOAD_ERROR_MSG)); })
      .finally(() => setTrendsLoading(false));

    getAlerts(days)
      .then((data) => {
        setAlerts(Array.isArray(data.alerts) ? data.alerts : []);
        setAlertsData(data);
      })
      .catch((e) => { console.error('Failed to fetch alerts:', e); setLoadError((prev) => prev ?? extractApiError(e, LOAD_ERROR_MSG)); })
      .finally(() => setAlertsLoading(false));

    getHealth()
      .then((data) => setHealthScores(Array.isArray(data.health_scores) ? data.health_scores : []))
      .catch((e) => { console.error('Failed to fetch health:', e); setHealthScores([]); setLoadError((prev) => prev ?? extractApiError(e, LOAD_ERROR_MSG)); })
      .finally(() => setHealthLoading(false));

    getTopConsumers(days, 10)
      .then((data) => setTopConsumers(Array.isArray(data.top_consumers) ? data.top_consumers : []))
      .catch((e) => { console.error('Failed to fetch top consumers:', e); setLoadError((prev) => prev ?? extractApiError(e, LOAD_ERROR_MSG)); })
      .finally(() => setTopConsumersLoading(false));

    getCredits(days)
      .then((data) => setCreditAccounts(Array.isArray(data.accounts) ? data.accounts : []))
      .catch((e) => { console.error('Failed to fetch credits:', e); setLoadError((prev) => prev ?? extractApiError(e, LOAD_ERROR_MSG)); });

    getStorage()
      .then((data) => setStorageAccounts(Array.isArray(data.accounts) ? data.accounts : []))
      .catch((e) => { console.error('Failed to fetch storage:', e); setLoadError((prev) => prev ?? extractApiError(e, LOAD_ERROR_MSG)); });

    getDataTransfer(days)
      .then((data) => {
        setDataTransfers(Array.isArray(data.transfers) ? data.transfers : []);
        setDataTransferTotalBytes(data.total_bytes || 0);
      })
      .catch((e) => { console.error('Failed to fetch data transfer:', e); setLoadError((prev) => prev ?? extractApiError(e, LOAD_ERROR_MSG)); })
      .finally(() => setDataTransferLoading(false));

    getWarehouses(days)
      .then((data) => setWarehouses(Array.isArray(data.warehouses) ? data.warehouses : []))
      .catch((e) => { console.error('Failed to fetch warehouses:', e); setLoadError((prev) => prev ?? extractApiError(e, LOAD_ERROR_MSG)); })
      .finally(() => setWarehousesLoading(false));

    // New endpoints
    getOrgEvents(days)
      .then((data) => setEvents(Array.isArray(data.events) ? data.events.slice(0, 5) : []))
      .catch((e) => { console.error('Failed to fetch events:', e); setLoadError((prev) => prev ?? extractApiError(e, LOAD_ERROR_MSG)); })
      .finally(() => setEventsLoading(false));

    getResourceMonitors()
      .then((data) => setResourceMonitors(Array.isArray(data.monitors) ? data.monitors : []))
      .catch((e) => { console.error('Failed to fetch resource monitors:', e); setLoadError((prev) => prev ?? extractApiError(e, LOAD_ERROR_MSG)); })
      .finally(() => setResourceMonitorsLoading(false));

    getCrossAccountUsage(days)
      .then((data) => setCrossAccount(Array.isArray(data.account_summary) ? data.account_summary : []))
      .catch((e) => { console.error('Failed to fetch cross-account usage:', e); setLoadError((prev) => prev ?? extractApiError(e, LOAD_ERROR_MSG)); })
      .finally(() => setCrossAccountLoading(false));
  }, []);

  useEffect(() => {
    const load = () => {
      // Reset the shared error flag once per load cycle, before any fetch, so an
      // overview-only failure keeps its banner instead of being wiped by the
      // secondary fetches that run alongside.
      setLoadError(null);
      // Overview and the secondary batch are independent (secondary takes only
      // `days`, consumes nothing from overview) — fire both concurrently so the
      // ~11 secondary fetches don't wait on the overview call to resolve. Each
      // section owns its own loading flag and renders its own skeleton.
      void fetchOverview();
      fetchSecondaryData(globalDays);
    };
    load();
  }, [fetchOverview, fetchSecondaryData, refreshKey, globalDays]);

  const creditUsageMap = useMemo(() => {
    const map: Record<string, number> = {};
    creditAccounts.forEach((acc) => { map[acc.account_name] = acc.total_credits; });
    return map;
  }, [creditAccounts]);

  const storageUsageMap = useMemo(() => {
    const map: Record<string, number> = {};
    storageAccounts.forEach((acc) => { map[acc.account_name] = acc.total_tb; });
    return map;
  }, [storageAccounts]);

  return (
    <div className="space-y-6">
      {/* Date range selector */}
      <div className="flex items-center justify-end gap-2">
        <PiCalendarDuotone className="h-4 w-4 text-gray-500 dark:text-gray-400" />
        <Text className="text-sm text-gray-500 dark:text-gray-400 mr-1">Period:</Text>
        {([7, 30, 90] as const).map((d) => (
          <button
            key={d}
            onClick={() => setGlobalDays(d)}
            className={cn(
              'px-3 py-1 rounded-md text-sm font-medium transition-colors',
              globalDays === d
                ? 'bg-primary text-white'
                : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
            )}
          >
            {d}d
          </button>
        ))}
      </div>

      {loadError && (
        <div
          role="alert"
          className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-4 py-2 text-sm text-amber-700 dark:text-amber-300"
        >
          {loadError}
        </div>
      )}

      <OverviewCards
        overview={overview}
        usage={usageData}
        warehouses={{ warehouses }}
        dataTransfer={{ total_bytes: dataTransferTotalBytes, transfers: dataTransfers }}
        alerts={alertsData}
        healthScores={healthScores}
        overviewLoading={overviewLoading}
        usageLoading={usageLoading}
        warehousesLoading={warehousesLoading}
        dataTransferLoading={dataTransferLoading}
        alertsLoading={alertsLoading}
        healthLoading={healthLoading}
      />

      <QueryVolumeCard data={queries} loading={queriesLoading} error={queriesError} />

      <AccountsTable
        accounts={accounts}
        healthScores={healthScores}
        creditUsage={creditUsageMap}
        storageUsage={storageUsageMap}
        loading={overviewLoading}
        onAccountClick={(account) => {
          setSelectedAccount(account);
          setIsDetailModalOpen(true);
        }}
      />

      {/* Cross-Account Usage — per-account credits + cost rollup from
          ORGANIZATION_USAGE. Org-admin only; honest empty state otherwise. */}
      <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <PiBuildingsDuotone className="h-5 w-5 text-blue-500" />
            <Text className="font-semibold text-gray-900 dark:text-white">Cross-Account Usage</Text>
            {crossAccount.length > 0 && (
              <Badge variant="flat" color="info" className="text-xs ml-auto">{crossAccount.length} accounts</Badge>
            )}
          </div>
        </div>
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
          {crossAccountLoading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-10 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              ))}
            </div>
          ) : crossAccount.length === 0 ? (
            <div className="p-8 text-center">
              <PiBuildingsDuotone className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
              <Text className="text-gray-500 dark:text-gray-400 text-sm">
                No cross-account usage available
              </Text>
              <Text className="text-xs text-gray-400">
                Requires an organization-admin connection
              </Text>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800/50">
                <tr className="border-b border-gray-200 dark:border-gray-700">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Account</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Credits</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Cost</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase">Currency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                {crossAccount.map((row, i) => (
                  <tr key={`${row.account_name}-${i}`} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                    <td className="px-4 py-2">
                      <Text className="text-sm font-medium text-gray-900 dark:text-white">{row.account_name || '—'}</Text>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Text className="text-sm text-gray-900 dark:text-white">{formatCredits(row.total_credits)}</Text>
                    </td>
                    <td className="px-4 py-2 text-right">
                      <Text className="text-sm font-medium text-gray-900 dark:text-white">{formatCurrency(row.total_cost, row.currency)}</Text>
                    </td>
                    <td className="px-4 py-2">
                      <Text className="text-sm text-gray-600 dark:text-gray-300">{row.currency || '—'}</Text>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <CreditsTrendChart
          data={creditTrends}
          dateRange={creditDateRange}
          onDateRangeChange={setCreditDateRange}
          loading={trendsLoading}
        />
        <StorageTrendChart
          data={storageTrends}
          dateRange={storageDateRange}
          onDateRangeChange={setStorageDateRange}
          loading={trendsLoading}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <TopConsumersChart data={topConsumers} loading={topConsumersLoading} />
        <DistributionChart
          byCloud={overview?.accounts_by_cloud || {}}
          byRegion={overview?.accounts_by_region || {}}
          byEdition={overview?.accounts_by_edition || {}}
          loading={overviewLoading}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DataTransferChart data={dataTransfers} totalBytes={dataTransferTotalBytes} loading={dataTransferLoading} />
        <WarehouseUsageChart data={warehouses} loading={warehousesLoading} />
      </div>

      {/* Recent Platform Events + Resource Monitors */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Recent Platform Events */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PiClockCounterClockwiseDuotone className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                <Text className="font-semibold text-gray-900 dark:text-white">
                  Recent Platform Events
                </Text>
                {events.length > 0 && (
                  <Badge variant="flat" color="info" className="text-xs">
                    {events.length}
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-[320px] overflow-y-auto">
            {eventsLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                ))}
              </div>
            ) : events.length === 0 ? (
              <div className="p-8 text-center">
                <PiClockCounterClockwiseDuotone className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <Text className="text-gray-500 dark:text-gray-400 text-sm">
                  No recent events
                </Text>
              </div>
            ) : (
              events.map((evt: any, index: number) => {
                const statusColor = evt.STATUS === 'SUCCESS'
                  ? 'text-green-600 dark:text-green-400'
                  : evt.STATUS === 'ERROR'
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-gray-600 dark:text-gray-400';
                return (
                  <div key={evt.EVENT_ID || index} className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
                        <PiClockCounterClockwiseDuotone className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <Text className="font-medium text-gray-900 dark:text-white text-sm truncate">
                            {evt.EVENT_TYPE || 'Event'}{' '}
                            <span className="font-normal text-gray-500">
                              {evt.MODULE_NAME ? `in ${evt.MODULE_NAME}` : ''}
                            </span>
                          </Text>
                          <Text className="text-xs text-gray-400 flex-shrink-0">
                            {evt.CREATED_AT
                              ? new Date(evt.CREATED_AT).toLocaleString(undefined, {
                                  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                                })
                              : ''}
                          </Text>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {evt.USERNAME && (
                            <Text className="text-xs text-gray-500 dark:text-gray-400">
                              by {evt.USERNAME}
                            </Text>
                          )}
                          {evt.STATUS && (
                            <Text className={cn('text-xs font-medium', statusColor)}>
                              {evt.STATUS}
                            </Text>
                          )}
                          {evt.ENTITY_TYPE && (
                            <Text className="text-xs text-gray-400">
                              {evt.ENTITY_TYPE}
                            </Text>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Resource Monitors */}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PiGaugeDuotone className="h-5 w-5 text-gray-600 dark:text-gray-300" />
                <Text className="font-semibold text-gray-900 dark:text-white">
                  Resource Monitors
                </Text>
                {resourceMonitors.length > 0 && (
                  <Badge variant="flat" color="secondary" className="text-xs">
                    {resourceMonitors.length}
                  </Badge>
                )}
              </div>
              <button
                type="button"
                disabled={rmCreateDenied}
                title={rmCreateDenied ? 'You lack the "create" permission on Client Accounts. Ask an administrator to grant it.' : undefined}
                onClick={() => { if (rmCreateDenied) return; resetRmForm(); setRmCreateOpen(true); }}
                className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1.5 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30"
              >
                <Plus className="h-3.5 w-3.5" /> New monitor
              </button>
            </div>
          </div>
          <div className="divide-y divide-gray-200 dark:divide-gray-700 max-h-[320px] overflow-y-auto">
            {resourceMonitorsLoading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-14 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                ))}
              </div>
            ) : resourceMonitors.length === 0 ? (
              <div className="p-8 text-center">
                <PiGaugeDuotone className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
                <Text className="text-gray-500 dark:text-gray-400 text-sm">
                  No resource monitors configured
                </Text>
              </div>
            ) : (
              resourceMonitors.map((mon: any, index: number) => {
                const pct = mon.usage_pct ?? 0;
                const barColor = pct >= 80
                  ? 'bg-red-500'
                  : pct >= 50
                    ? 'bg-amber-500'
                    : 'bg-green-500';
                const barBg = pct >= 80
                  ? 'bg-red-100 dark:bg-red-900/20'
                  : pct >= 50
                    ? 'bg-amber-100 dark:bg-amber-900/20'
                    : 'bg-green-100 dark:bg-green-900/20';
                return (
                  <div key={mon.name || index} className="p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <div className="flex items-center justify-between mb-1.5">
                      <Text className="font-medium text-gray-900 dark:text-white text-sm truncate">
                        {mon.name}
                      </Text>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <Text className="text-xs text-gray-500 dark:text-gray-400">
                          {mon.used_credits?.toLocaleString(undefined, { maximumFractionDigits: 1 })} / {mon.credit_quota?.toLocaleString(undefined, { maximumFractionDigits: 0 })} credits
                        </Text>
                        <Badge
                          variant="flat"
                          color={pct >= 80 ? 'danger' : pct >= 50 ? 'warning' : 'success'}
                          size="sm"
                        >
                          {safeToFixed(pct, 1)}%
                        </Badge>
                      </div>
                    </div>
                    <div className={cn('h-2 rounded-full overflow-hidden', barBg)}>
                      <div
                        className={cn('h-full rounded-full transition-all', barColor)}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    {mon.frequency && (
                      <Text className="text-xs text-gray-400 mt-1">
                        {mon.frequency}{mon.level ? ` | ${mon.level}` : ''}
                      </Text>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <HealthOverview healthScores={healthScores} loading={healthLoading} />
        <AlertsPanel alerts={alerts} loading={alertsLoading} />
      </div>

      <AccountDetailModal
        account={selectedAccount}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedAccount(null);
        }}
      />

      {/* ── Create resource monitor (non-blocking ActionRail) ────────────── */}
      <ActionRail
        isOpen={rmCreateOpen}
        onClose={() => { if (!rmBusy) { setRmCreateOpen(false); resetRmForm(); } }}
        title="New resource monitor"
        description="Cap credit consumption and auto-suspend warehouses at a threshold."
        accentClassName="bg-blue-500"
        footer={
          <>
            <button
              type="button"
              onClick={() => { if (!rmBusy) { setRmCreateOpen(false); resetRmForm(); } }}
              disabled={rmBusy}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateResourceMonitor}
              disabled={rmBusy || !rmFormValid}
              className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {rmBusy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Create monitor
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="rm-name" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Monitor name
            </label>
            <input
              id="rm-name"
              value={rmForm.name}
              onChange={(e) => setRmForm((f) => ({ ...f, name: e.target.value.toUpperCase() }))}
              placeholder="MONTHLY_BUDGET"
              className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="rm-quota" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Credit quota
            </label>
            <input
              id="rm-quota"
              type="number"
              min={1}
              step={1}
              value={rmForm.credit_quota}
              onChange={(e) => setRmForm((f) => ({ ...f, credit_quota: e.target.value }))}
              placeholder="1000"
              className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="rm-frequency" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Frequency
              </label>
              <select
                id="rm-frequency"
                value={rmForm.frequency}
                onChange={(e) => setRmForm((f) => ({ ...f, frequency: e.target.value }))}
                className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              >
                {['MONTHLY', 'DAILY', 'WEEKLY', 'YEARLY', 'NEVER'].map((f) => (
                  <option key={f} value={f}>{f.charAt(0) + f.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="rm-pct" className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Suspend at (%)
              </label>
              <input
                id="rm-pct"
                type="number"
                min={1}
                max={100}
                step={1}
                value={rmForm.suspend_at_pct}
                onChange={(e) => setRmForm((f) => ({ ...f, suspend_at_pct: e.target.value }))}
                className="block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-300 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
              />
            </div>
          </div>
          {rmError && (
            <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/40 dark:text-red-300">
              <PiWarningCircleDuotone className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>{rmError}</span>
            </div>
          )}
        </div>
      </ActionRail>
    </div>
  );
}
