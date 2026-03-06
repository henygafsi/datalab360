'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import toast from 'react-hot-toast';
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

  // UI state
  const [creditDateRange, setCreditDateRange] = useState<DateRange>('30d');
  const [storageDateRange, setStorageDateRange] = useState<DateRange>('30d');
  const [selectedAccount, setSelectedAccount] = useState<ClientAccount | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  const fetchOverview = useCallback(async () => {
    try {
      const data = await getDashboardOverview();
      setOverview(data.overview);
      setAccounts(Array.isArray(data.accounts) ? data.accounts : []);
    } catch (error) {
      console.error('Failed to fetch overview:', error);
      toast.error('Failed to load dashboard');
    } finally {
      setOverviewLoading(false);
    }
  }, []);

  const fetchSecondaryData = useCallback(async () => {
    getDashboardUsage()
      .then((data) => setUsageData(data))
      .catch((e) => console.error('Failed to fetch usage:', e))
      .finally(() => setUsageLoading(false));

    getDashboardTrends()
      .then((data) => {
        setCreditTrends(Array.isArray(data.credits) ? data.credits : []);
        setStorageTrends(Array.isArray(data.storage) ? data.storage : []);
      })
      .catch((e) => console.error('Failed to fetch trends:', e))
      .finally(() => setTrendsLoading(false));

    getAlerts()
      .then((data) => {
        setAlerts(Array.isArray(data.alerts) ? data.alerts : []);
        setAlertsData(data);
      })
      .catch((e) => console.error('Failed to fetch alerts:', e))
      .finally(() => setAlertsLoading(false));

    getHealth()
      .then((data) => setHealthScores(Array.isArray(data.health_scores) ? data.health_scores : []))
      .catch((e) => { console.error('Failed to fetch health:', e); setHealthScores([]); })
      .finally(() => setHealthLoading(false));

    getTopConsumers(30, 10)
      .then((data) => setTopConsumers(Array.isArray(data.top_consumers) ? data.top_consumers : []))
      .catch((e) => console.error('Failed to fetch top consumers:', e))
      .finally(() => setTopConsumersLoading(false));

    getCredits(30)
      .then((data) => setCreditAccounts(Array.isArray(data.accounts) ? data.accounts : []))
      .catch((e) => console.error('Failed to fetch credits:', e));

    getStorage()
      .then((data) => setStorageAccounts(Array.isArray(data.accounts) ? data.accounts : []))
      .catch((e) => console.error('Failed to fetch storage:', e));

    getDataTransfer()
      .then((data) => {
        setDataTransfers(Array.isArray(data.transfers) ? data.transfers : []);
        setDataTransferTotalBytes(data.total_bytes || 0);
      })
      .catch((e) => console.error('Failed to fetch data transfer:', e))
      .finally(() => setDataTransferLoading(false));

    getWarehouses(30)
      .then((data) => setWarehouses(Array.isArray(data.warehouses) ? data.warehouses : []))
      .catch((e) => console.error('Failed to fetch warehouses:', e))
      .finally(() => setWarehousesLoading(false));
  }, []);

  useEffect(() => {
    const load = async () => {
      await fetchOverview();
      fetchSecondaryData();
    };
    load();
  }, [fetchOverview, fetchSecondaryData, refreshKey]);

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
