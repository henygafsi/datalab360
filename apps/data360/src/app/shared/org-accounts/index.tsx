'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Text, Title, Button } from 'rizzui';
import cn from '@core/utils/class-names';
import toast from 'react-hot-toast';
import {
  PiArrowClockwiseBold,
  PiBuildingsDuotone,
} from 'react-icons/pi';

// API functions
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
} from '@/app/services/org-accounts/hooks';

// Types
import type {
  DashboardOverviewResponse,
  DashboardUsageResponse,
  ClientAccount,
  DateRange,
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
} from '@/app/services/org-accounts/types';

// Components
import OverviewCards from './overview-cards';
import AccountsTable from './accounts-table';
import AlertsPanel from './alerts-panel';
import HealthOverview from './health-overview';
import AccountDetailModal from './account-detail-modal';
import {
  CreditsTrendChart,
  StorageTrendChart,
  TopConsumersChart,
  DistributionChart,
  DataTransferChart,
  WarehouseUsageChart,
} from './charts';

// Auto-refresh interval (5 minutes)
const AUTO_REFRESH_INTERVAL = 5 * 60 * 1000;

export default function OrgAccountsDashboard() {
  // Step 1: Overview data (instant ~1s)
  const [overview, setOverview] = useState<DashboardOverviewResponse['overview'] | null>(null);
  const [accounts, setAccounts] = useState<ClientAccount[]>([]);
  const [overviewLoading, setOverviewLoading] = useState(true);

  // Step 2: Usage data (credits + storage combined ~2-3s)
  const [usageData, setUsageData] = useState<DashboardUsageResponse | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);

  // Step 2: Trends data (~3-5s)
  const [creditTrends, setCreditTrends] = useState<CreditTrendPoint[]>([]);
  const [storageTrends, setStorageTrends] = useState<StorageTrendPoint[]>([]);
  const [trendsLoading, setTrendsLoading] = useState(true);

  // Step 2: Alerts (~2-3s)
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsData, setAlertsData] = useState<AlertsResponse | null>(null);
  const [alertsLoading, setAlertsLoading] = useState(true);

  // Step 2: Health scores (~2-3s)
  const [healthScores, setHealthScores] = useState<HealthScore[]>([]);
  const [healthLoading, setHealthLoading] = useState(true);

  // Step 3: Detailed data (for table and charts)
  const [topConsumers, setTopConsumers] = useState<TopConsumer[]>([]);
  const [topConsumersLoading, setTopConsumersLoading] = useState(true);
  const [creditAccounts, setCreditAccounts] = useState<AccountCredit[]>([]);
  const [storageAccounts, setStorageAccounts] = useState<AccountStorage[]>([]);

  // Data transfer
  const [dataTransfers, setDataTransfers] = useState<DataTransferUsage[]>([]);
  const [dataTransferTotalBytes, setDataTransferTotalBytes] = useState(0);
  const [dataTransferLoading, setDataTransferLoading] = useState(true);

  // Warehouses
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [warehousesLoading, setWarehousesLoading] = useState(true);

  // Date range selectors for charts
  const [creditDateRange, setCreditDateRange] = useState<DateRange>('30d');
  const [storageDateRange, setStorageDateRange] = useState<DateRange>('30d');

  // Refreshing state
  const [refreshing, setRefreshing] = useState(false);
  // Elapsed seconds while a refresh is RUNNING (drives "Refreshing… 4s" affordance)
  const [refreshElapsed, setRefreshElapsed] = useState(0);
  // Top-level error (only set when the primary overview call fails — secondary
  // calls degrade silently into empty arrays, see fetchSecondaryData)
  const [overviewError, setOverviewError] = useState<string | null>(null);

  // Selected account for detail modal
  const [selectedAccount, setSelectedAccount] = useState<ClientAccount | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // Last updated timestamp
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Step 1: Fetch overview (instant page render)
  const fetchOverview = useCallback(async () => {
    try {
      const data = await getDashboardOverview();
      setOverview(data.overview);
      setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
      setLastUpdated(new Date());
      setOverviewError(null);
    } catch (error) {
      console.error('Failed to fetch overview:', error);
      const message = error instanceof Error ? error.message : 'Failed to load dashboard';
      setOverviewError(message);
      toast.error('Failed to load dashboard');
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  // Step 2: Fetch remaining data in parallel (after overview loads)
  const fetchSecondaryData = useCallback(async () => {
    // Launch all requests in parallel - don't await together
    const usagePromise = getDashboardUsage()
      .then((data) => {
        setUsageData(data);
      })
      .catch((error) => console.error('Failed to fetch dashboard usage:', error))
      .finally(() => setUsageLoading(false));

    const trendsPromise = getDashboardTrends()
      .then((data) => {
        setCreditTrends(Array.isArray(data.credits) ? data.credits : []);
        setStorageTrends(Array.isArray(data.storage) ? data.storage : []);
      })
      .catch((error) => console.error('Failed to fetch trends:', error))
      .finally(() => setTrendsLoading(false));

    const alertsPromise = getAlerts()
      .then((data) => {
        setAlerts(Array.isArray(data.alerts) ? data.alerts : []);
        setAlertsData(data);
      })
      .catch((error) => console.error('Failed to fetch alerts:', error))
      .finally(() => setAlertsLoading(false));

    const healthPromise = getHealth()
      .then((data) => {
        const scores = Array.isArray(data.health_scores) ? data.health_scores : [];
        setHealthScores(scores);
      })
      .catch((error) => {
        console.error('Failed to fetch health:', error);
        setHealthScores([]);
      })
      .finally(() => setHealthLoading(false));

    // Fetch top consumers for the chart
    const topConsumersPromise = getTopConsumers(30, 10)
      .then((data) => {
        setTopConsumers(Array.isArray(data.top_consumers) ? data.top_consumers : []);
      })
      .catch((error) => console.error('Failed to fetch top consumers:', error))
      .finally(() => setTopConsumersLoading(false));

    // Fetch detailed credits for table
    const creditsPromise = getCredits(30)
      .then((data) => {
        setCreditAccounts(Array.isArray(data.accounts) ? data.accounts : []);
      })
      .catch((error) => console.error('Failed to fetch credits:', error));

    // Fetch detailed storage for table
    const storagePromise = getStorage()
      .then((data) => {
        setStorageAccounts(Array.isArray(data.accounts) ? data.accounts : []);
      })
      .catch((error) => console.error('Failed to fetch storage:', error));

    // Fetch data transfer
    const dataTransferPromise = getDataTransfer()
      .then((data) => {
        setDataTransfers(Array.isArray(data.transfers) ? data.transfers : []);
        setDataTransferTotalBytes(data.total_bytes || 0);
      })
      .catch((error) => console.error('Failed to fetch data transfer:', error))
      .finally(() => setDataTransferLoading(false));

    // Fetch warehouse usage
    const warehousesPromise = getWarehouses(30)
      .then((data) => {
        setWarehouses(Array.isArray(data.warehouses) ? data.warehouses : []);
      })
      .catch((error) => console.error('Failed to fetch warehouses:', error))
      .finally(() => setWarehousesLoading(false));

    // Wait for all to complete (for refresh timing)
    await Promise.all([
      usagePromise,
      trendsPromise,
      alertsPromise,
      healthPromise,
      topConsumersPromise,
      creditsPromise,
      storagePromise,
      dataTransferPromise,
      warehousesPromise,
    ]);
  }, []);

  // Full refresh
  const refreshAll = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) {
      setRefreshing(true);
    } else {
      setOverviewLoading(true);
      setUsageLoading(true);
      setTrendsLoading(true);
      setAlertsLoading(true);
      setHealthLoading(true);
      setTopConsumersLoading(true);
      setDataTransferLoading(true);
      setWarehousesLoading(true);
    }

    try {
      await fetchOverview();
      await fetchSecondaryData();
    } finally {
      setRefreshing(false);
    }
  }, [fetchOverview, fetchSecondaryData]);

  // Initial load: Step 1 first, then Step 2 in parallel
  useEffect(() => {
    const loadDashboard = async () => {
      await fetchOverview();
      // After overview loads, fetch remaining data in parallel
      fetchSecondaryData();
    };
    loadDashboard();
  }, [fetchOverview, fetchSecondaryData]);

  // Auto-refresh
  // TODO(ux): drive off /cache-stream invalidation (SSE) instead of a fixed 5-min
  // setInterval so the dashboard refreshes exactly when org-accounts data changes
  // (CacheKey.ORG_ACCOUNTS) rather than on a blind timer. See [[Cache Standardization]].
  useEffect(() => {
    const interval = setInterval(() => {
      refreshAll(true);
    }, AUTO_REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [refreshAll]);

  // Elapsed-time ticker: while a refresh is RUNNING, count seconds so the UI can
  // show "Refreshing… Ns" (several org-accounts calls hit Snowflake compute and
  // can take 30-60s — see the 60s timeouts in services/org-accounts/hooks.ts).
  useEffect(() => {
    if (!refreshing) {
      setRefreshElapsed(0);
      return;
    }
    const startedAt = Date.now();
    const ticker = setInterval(() => {
      setRefreshElapsed(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(ticker);
  }, [refreshing]);

  // Create credit usage map for the table (account_name -> total_credits)
  const creditUsageMap = useMemo(() => {
    const map: Record<string, number> = {};
    creditAccounts.forEach((acc) => {
      map[acc.account_name] = acc.total_credits;
    });
    return map;
  }, [creditAccounts]);

  // Create storage usage map for the table (account_name -> total_tb)
  const storageUsageMap = useMemo(() => {
    const map: Record<string, number> = {};
    storageAccounts.forEach((acc) => {
      map[acc.account_name] = acc.total_tb;
    });
    return map;
  }, [storageAccounts]);

  // Handle account click
  const handleAccountClick = (account: ClientAccount) => {
    setSelectedAccount(account);
    setIsDetailModalOpen(true);
  };

  // EMPTY: overview finished loading, no top-level error, and zero accounts.
  const isEmpty = !overviewLoading && !overviewError && accounts.length === 0;

  return (
    <div className="@container">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
            <PiBuildingsDuotone className="h-6 w-6 text-primary" />
          </div>
          <div>
            <Title as="h1" className="text-xl font-bold md:text-2xl text-gray-900 dark:text-white">
              Client Accounts Dashboard
            </Title>
            <Text className="text-gray-500 dark:text-gray-400">
              Organization: {overview?.organization_name || 'Loading...'}
            </Text>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <Text className="text-xs text-gray-400">
              Last updated: {lastUpdated.toLocaleTimeString()}
            </Text>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => refreshAll(true)}
            disabled={refreshing}
          >
            <PiArrowClockwiseBold className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
            {refreshing ? `Refreshing… ${refreshElapsed}s` : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* ERROR: primary overview call failed — secondary calls degrade silently */}
      {overviewError && (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 dark:border-red-700 dark:bg-red-900/20">
          <Text className="text-sm font-medium text-red-800 dark:text-red-300">
            Failed to load the accounts dashboard
          </Text>
          <Text className="mt-1 text-xs text-red-700 dark:text-red-400">{overviewError}</Text>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => refreshAll(false)}
            disabled={refreshing}
          >
            Retry
          </Button>
        </div>
      )}

      {/* EMPTY: loaded successfully but no accounts visible to this role */}
      {isEmpty && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-800/40">
          <PiBuildingsDuotone className="mx-auto mb-3 h-10 w-10 text-gray-400" />
          <Text className="text-sm font-medium text-gray-700 dark:text-gray-300">
            No client accounts found
          </Text>
          <Text className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            This organization has no visible accounts, or your role lacks ORGADMIN access to
            SNOWFLAKE.ORGANIZATION_USAGE.
          </Text>
        </div>
      )}

      {/* Overview Cards - shows immediately with overview data, then updates with usage data */}
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
        className="mb-6"
      />

      {/* Accounts Table - renders immediately after overview loads */}
      <AccountsTable
        accounts={accounts}
        healthScores={healthScores}
        creditUsage={creditUsageMap}
        storageUsage={storageUsageMap}
        loading={overviewLoading}
        onAccountClick={handleAccountClick}
        className="mb-6"
      />

      {/* Charts Section - loads progressively */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-6">
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-6">
        <TopConsumersChart
          data={topConsumers}
          loading={topConsumersLoading}
        />
        <DistributionChart
          byCloud={overview?.accounts_by_cloud || {}}
          byRegion={overview?.accounts_by_region || {}}
          byEdition={overview?.accounts_by_edition || {}}
          loading={overviewLoading}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-6">
        <DataTransferChart
          data={dataTransfers}
          totalBytes={dataTransferTotalBytes}
          loading={dataTransferLoading}
        />
        <WarehouseUsageChart
          data={warehouses}
          loading={warehousesLoading}
        />
      </div>

      {/* Health and Alerts Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 mb-6">
        <HealthOverview
          healthScores={healthScores}
          loading={healthLoading}
        />
        <AlertsPanel
          alerts={alerts}
          loading={alertsLoading}
        />
      </div>

      {/* Account Detail Modal */}
      <AccountDetailModal
        account={selectedAccount}
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedAccount(null);
        }}
      />

      {/* Generated At */}
      {lastUpdated && (
        <div className="mt-6 text-center">
          <Text className="text-xs text-gray-400">
            Data generated at: {lastUpdated.toLocaleString()}
          </Text>
        </div>
      )}
    </div>
  );
}
