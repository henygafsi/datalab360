'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
import { Text, Badge } from 'rizzui';
import cn from '@core/utils/class-names';
import {
  PiClockCounterClockwiseDuotone,
  PiGaugeDuotone,
  PiCalendarDuotone,
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
} from '@/app/services/org-accounts/hooks';
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
} from '@/app/services/org-accounts/types';

import OverviewCards from '../overview-cards';
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
import { safeToFixed } from '@/lib/format-number';

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

  // UI state
  const [globalDays, setGlobalDays] = useState<7 | 30 | 90>(30);
  const [creditDateRange, setCreditDateRange] = useState<DateRange>('30d');
  const [storageDateRange, setStorageDateRange] = useState<DateRange>('30d');
  const [selectedAccount, setSelectedAccount] = useState<ClientAccount | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

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
      toast.error('Failed to load dashboard');
      setLoadError(LOAD_ERROR_MSG);
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

    getDashboardUsage()
      .then((data) => setUsageData(data))
      .catch((e) => { console.error('Failed to fetch usage:', e); setLoadError(LOAD_ERROR_MSG); })
      .finally(() => setUsageLoading(false));

    getDashboardTrends(days)
      .then((data) => {
        setCreditTrends(Array.isArray(data.credits) ? data.credits : []);
        setStorageTrends(Array.isArray(data.storage) ? data.storage : []);
      })
      .catch((e) => { console.error('Failed to fetch trends:', e); setLoadError(LOAD_ERROR_MSG); })
      .finally(() => setTrendsLoading(false));

    getAlerts(days)
      .then((data) => {
        setAlerts(Array.isArray(data.alerts) ? data.alerts : []);
        setAlertsData(data);
      })
      .catch((e) => { console.error('Failed to fetch alerts:', e); setLoadError(LOAD_ERROR_MSG); })
      .finally(() => setAlertsLoading(false));

    getHealth()
      .then((data) => setHealthScores(Array.isArray(data.health_scores) ? data.health_scores : []))
      .catch((e) => { console.error('Failed to fetch health:', e); setHealthScores([]); setLoadError(LOAD_ERROR_MSG); })
      .finally(() => setHealthLoading(false));

    getTopConsumers(days, 10)
      .then((data) => setTopConsumers(Array.isArray(data.top_consumers) ? data.top_consumers : []))
      .catch((e) => { console.error('Failed to fetch top consumers:', e); setLoadError(LOAD_ERROR_MSG); })
      .finally(() => setTopConsumersLoading(false));

    getCredits(days)
      .then((data) => setCreditAccounts(Array.isArray(data.accounts) ? data.accounts : []))
      .catch((e) => { console.error('Failed to fetch credits:', e); setLoadError(LOAD_ERROR_MSG); });

    getStorage()
      .then((data) => setStorageAccounts(Array.isArray(data.accounts) ? data.accounts : []))
      .catch((e) => { console.error('Failed to fetch storage:', e); setLoadError(LOAD_ERROR_MSG); });

    getDataTransfer(days)
      .then((data) => {
        setDataTransfers(Array.isArray(data.transfers) ? data.transfers : []);
        setDataTransferTotalBytes(data.total_bytes || 0);
      })
      .catch((e) => { console.error('Failed to fetch data transfer:', e); setLoadError(LOAD_ERROR_MSG); })
      .finally(() => setDataTransferLoading(false));

    getWarehouses(days)
      .then((data) => setWarehouses(Array.isArray(data.warehouses) ? data.warehouses : []))
      .catch((e) => { console.error('Failed to fetch warehouses:', e); setLoadError(LOAD_ERROR_MSG); })
      .finally(() => setWarehousesLoading(false));

    // New endpoints
    getOrgEvents(days)
      .then((data) => setEvents(Array.isArray(data.events) ? data.events.slice(0, 5) : []))
      .catch((e) => { console.error('Failed to fetch events:', e); setLoadError(LOAD_ERROR_MSG); })
      .finally(() => setEventsLoading(false));

    getResourceMonitors()
      .then((data) => setResourceMonitors(Array.isArray(data.monitors) ? data.monitors : []))
      .catch((e) => { console.error('Failed to fetch resource monitors:', e); setLoadError(LOAD_ERROR_MSG); })
      .finally(() => setResourceMonitorsLoading(false));
  }, []);

  useEffect(() => {
    const load = async () => {
      // Reset the shared error flag once per load cycle, before any fetch, so an
      // overview-only failure keeps its banner instead of being wiped by the
      // secondary fetches that follow.
      setLoadError(null);
      await fetchOverview();
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
    </div>
  );
}
