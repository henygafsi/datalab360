'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Text, Title, Button } from 'rizzui';
import cn from '@core/utils/class-names';
import {
  PiArrowClockwiseBold,
  PiBuildingsDuotone,
  PiChartLineUpDuotone,
  PiCoinsDuotone,
  PiDatabaseDuotone,
  PiWarehouseDuotone,
  PiCreditCardDuotone,
  PiCpuDuotone,
  PiHeartbeatDuotone,
  PiShareNetworkDuotone,
  PiWarningCircleDuotone,
} from 'react-icons/pi';
import { getDashboardOverview } from '@/app/services/org-accounts/hooks';
import { extractApiError } from '@/app/services/org-accounts/utils';

// Tab components (lazy per-tab data fetching)
import OverviewTab from './tabs/overview-tab';
import CreditsTab from './tabs/credits-tab';
import StorageTab from './tabs/storage-tab';
import WarehousesTab from './tabs/warehouses-tab';
import BillingTab from './tabs/billing-tab';
import ComputeServicesTab from './tabs/compute-services-tab';
import HealthAlertsTab from './tabs/health-alerts-tab';
import DataSharingTab from './tabs/data-sharing-tab';

const TABS = [
  { key: 'overview', label: 'Overview', icon: PiChartLineUpDuotone },
  { key: 'credits', label: 'Credits & Metering', icon: PiCoinsDuotone },
  { key: 'storage', label: 'Storage', icon: PiDatabaseDuotone },
  { key: 'warehouses', label: 'Warehouses', icon: PiWarehouseDuotone },
  { key: 'billing', label: 'Balance & Billing', icon: PiCreditCardDuotone },
  { key: 'compute', label: 'Compute Services', icon: PiCpuDuotone },
  { key: 'health', label: 'Health & Alerts', icon: PiHeartbeatDuotone },
  { key: 'sharing', label: 'Data Sharing', icon: PiShareNetworkDuotone },
] as const;

type TabKey = (typeof TABS)[number]['key'];

export default function OrgAccountsDashboard() {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [orgName, setOrgName] = useState<string>('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  // Elapsed seconds while a refresh is RUNNING (drives "Refreshing… 4s" affordance)
  const [refreshElapsed, setRefreshElapsed] = useState(0);
  // Header-level error — set only when the org overview lookup fails. Each tab
  // owns and surfaces its own per-section inline errors below the header.
  const [overviewError, setOverviewError] = useState<string | null>(null);

  // Fetch org name on mount. A failure here is not fatal (tabs fetch their
  // own data and surface their own errors) but we record it for the header.
  useEffect(() => {
    let cancelled = false;
    getDashboardOverview()
      .then((data) => { if (!cancelled) setOrgName(data.overview.organization_name ?? ''); })
      .catch((e) => { if (!cancelled) setOverviewError(extractApiError(e, 'Failed to load organization')); });
    return () => { cancelled = true; };
  }, [refreshKey]);

  // Drive the "Refreshing… Ns" affordance with a real elapsed counter.
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshElapsed(0);
    setRefreshKey((k) => k + 1);
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    refreshTimer.current = setInterval(() => setRefreshElapsed((s) => s + 1), 1000);
    setTimeout(() => {
      setRefreshing(false);
      if (refreshTimer.current) {
        clearInterval(refreshTimer.current);
        refreshTimer.current = null;
      }
    }, 1000);
  }, []);

  useEffect(() => () => { if (refreshTimer.current) clearInterval(refreshTimer.current); }, []);

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return <OverviewTab refreshKey={refreshKey} />;
      case 'credits':
        return <CreditsTab refreshKey={refreshKey} />;
      case 'storage':
        return <StorageTab refreshKey={refreshKey} />;
      case 'warehouses':
        return <WarehousesTab refreshKey={refreshKey} />;
      case 'billing':
        return <BillingTab refreshKey={refreshKey} />;
      case 'compute':
        return <ComputeServicesTab refreshKey={refreshKey} />;
      case 'health':
        return <HealthAlertsTab refreshKey={refreshKey} />;
      case 'sharing':
        return <DataSharingTab refreshKey={refreshKey} />;
      default:
        return null;
    }
  };

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
              Organization: {orgName || 'Loading...'}
            </Text>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <PiArrowClockwiseBold className={cn('h-4 w-4 mr-2', refreshing && 'animate-spin')} />
            {refreshing ? `Refreshing… ${refreshElapsed}s` : 'Refresh'}
          </Button>
        </div>
      </div>

      {/* Header-level error (org overview failed to load). Per-tab data
          surfaces its own inline errors below. */}
      {overviewError && (
        <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-900/40 dark:bg-red-950/30">
          <PiWarningCircleDuotone className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
          <div>
            <Text className="text-sm font-medium text-red-700 dark:text-red-300">Could not load organization details</Text>
            <Text className="text-xs text-red-600 dark:text-red-400">{overviewError}</Text>
          </div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="mb-6 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        <nav className="flex gap-0 -mb-px min-w-max">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-200'
                )}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Tab Content */}
      {renderTabContent()}
    </div>
  );
}
