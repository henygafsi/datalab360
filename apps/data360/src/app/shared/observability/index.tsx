'use client';

import { useState, useEffect } from 'react';
import { Text, Title, Tab } from 'rizzui';
import cn from '@core/utils/class-names';
import toast from 'react-hot-toast';
import {
  PiShieldCheckDuotone,
  PiUsersDuotone,
  PiCurrencyDollarDuotone,
  PiChartLineDuotone,
  PiGearDuotone,
  PiTreeStructureDuotone,
  PiShieldStarDuotone,
} from 'react-icons/pi';

// Services
import {
  getIntelligentKpis,
  getGdprComplianceReport,
  getSoc2ComplianceReport,
  getActivitySummary,
  getSecurityPosture,
  getWarehouseUsage,
  getStorageMetrics,
  getDailyCredits,
  getPerformanceMetrics,
  getSlowQueries,
} from '@/app/services/observability';

// Types
import type {
  IntelligentKpis,
  GdprReport,
  Soc2Report,
  UserActivitySummary,
  SecurityPosture,
  WarehouseUsageSummary,
  StorageMetrics,
  DailyCreditUsage,
  PerformanceMetrics,
  SlowQuery,
} from '@/app/services/observability/types';

// Components
import HealthScoreCard from './health-score-card';
import KpiCategoryCard from './kpi-category-card';
import RecommendationsCard from './recommendations-card';
import ComplianceCard from './compliance-card';
import ActivitySummaryCard from './activity-summary-card';
import SecurityPostureCard from './security-posture-card';
import CostOverviewCard from './cost-overview-card';
import PerformanceMetricsCard from './performance-metrics-card';
import DependenciesCard from './dependencies-card';
import TrustCenterCard from './trust-center-card';

const kpiIcons = {
  governance: PiShieldCheckDuotone,
  cost: PiCurrencyDollarDuotone,
  performance: PiChartLineDuotone,
  usage: PiUsersDuotone,
  compliance: PiShieldCheckDuotone,
};

interface TabItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

const tabs: TabItem[] = [
  { id: 'overview', label: 'Overview', icon: PiChartLineDuotone },
  { id: 'compliance', label: 'Compliance', icon: PiShieldCheckDuotone },
  { id: 'activity', label: 'Activity & Security', icon: PiUsersDuotone },
  { id: 'cost', label: 'Cost & Performance', icon: PiCurrencyDollarDuotone },
  { id: 'dependencies', label: 'Dependencies', icon: PiTreeStructureDuotone },
  { id: 'trust-center', label: 'Trust Center', icon: PiShieldStarDuotone },
];

export default function ObservabilityDashboard() {
  const [activeTab, setActiveTab] = useState('overview');
  const [isLoading, setIsLoading] = useState(true);

  // Data states
  const [kpis, setKpis] = useState<IntelligentKpis | null>(null);
  const [gdprReport, setGdprReport] = useState<GdprReport | null>(null);
  const [soc2Report, setSoc2Report] = useState<Soc2Report | null>(null);
  const [activitySummary, setActivitySummary] = useState<UserActivitySummary | null>(null);
  const [securityPosture, setSecurityPosture] = useState<SecurityPosture | null>(null);
  const [warehouseUsage, setWarehouseUsage] = useState<WarehouseUsageSummary | null>(null);
  const [storageMetrics, setStorageMetrics] = useState<StorageMetrics | null>(null);
  const [dailyCredits, setDailyCredits] = useState<DailyCreditUsage[] | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<PerformanceMetrics | null>(null);
  const [slowQueries, setSlowQueries] = useState<SlowQuery[] | null>(null);

  // Loading states for individual sections
  const [loadingStates, setLoadingStates] = useState({
    kpis: true,
    compliance: true,
    activity: true,
    cost: true,
  });

  // Fetch KPIs on mount
  useEffect(() => {
    fetchKpis();
  }, []);

  // Fetch tab-specific data when tab changes
  useEffect(() => {
    switch (activeTab) {
      case 'compliance':
        if (!gdprReport && !soc2Report) fetchComplianceData();
        break;
      case 'activity':
        if (!activitySummary) fetchActivityData();
        break;
      case 'cost':
        if (!warehouseUsage) fetchCostData();
        break;
    }
  }, [activeTab]);

  async function fetchKpis() {
    try {
      setLoadingStates((prev) => ({ ...prev, kpis: true }));
      const data = await getIntelligentKpis();
      setKpis(data);
    } catch (error) {
      console.error('Failed to fetch KPIs:', error);
      toast.error('Failed to load KPIs');
    } finally {
      setLoadingStates((prev) => ({ ...prev, kpis: false }));
      setIsLoading(false);
    }
  }

  async function fetchComplianceData() {
    setLoadingStates((prev) => ({ ...prev, compliance: true }));
    try {
      const [gdpr, soc2] = await Promise.all([
        getGdprComplianceReport(),
        getSoc2ComplianceReport(),
      ]);
      setGdprReport(gdpr);
      setSoc2Report(soc2);
    } catch (error) {
      console.error('Failed to fetch compliance data:', error);
      toast.error('Failed to load compliance data');
    } finally {
      setLoadingStates((prev) => ({ ...prev, compliance: false }));
    }
  }

  async function fetchActivityData() {
    setLoadingStates((prev) => ({ ...prev, activity: true }));
    try {
      const [activity, security] = await Promise.all([
        getActivitySummary(7),
        getSecurityPosture(),
      ]);
      setActivitySummary(activity);
      setSecurityPosture(security);
    } catch (error) {
      console.error('Failed to fetch activity data:', error);
      toast.error('Failed to load activity data');
    } finally {
      setLoadingStates((prev) => ({ ...prev, activity: false }));
    }
  }

  async function fetchCostData() {
    setLoadingStates((prev) => ({ ...prev, cost: true }));
    try {
      const [warehouse, storage, credits, performance, slow] = await Promise.all([
        getWarehouseUsage(30),
        getStorageMetrics(),
        getDailyCredits(30),
        getPerformanceMetrics(7),
        getSlowQueries({ days: 7, threshold_seconds: 60 }),
      ]);
      setWarehouseUsage(warehouse);
      setStorageMetrics(storage);
      setDailyCredits(credits.daily_usage);
      setPerformanceMetrics(performance);
      setSlowQueries(slow.slow_queries);
    } catch (error) {
      console.error('Failed to fetch cost data:', error);
      toast.error('Failed to load cost data');
    } finally {
      setLoadingStates((prev) => ({ ...prev, cost: false }));
    }
  }

  return (
    <div className="@container">
      {/* Header */}
      <div className="mb-6">
        <Title as="h1" className="text-xl font-bold md:text-2xl">
          Observability Dashboard
        </Title>
        <Text className="mt-1 text-gray-500">
          Real-time monitoring, compliance, and intelligent KPIs for your data platform
        </Text>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
        <div className="-mb-px flex space-x-4 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                )}
              >
                <Icon className="h-5 w-5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="space-y-6">
        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-12">
            {/* Health Score */}
            <HealthScoreCard
              score={kpis?.overall_health_score || 0}
              status={kpis?.overall_status || 'warning'}
              className="@4xl:col-span-4"
            />

            {/* KPI Categories */}
            <div className="grid grid-cols-1 gap-4 @4xl:col-span-8 @4xl:grid-cols-2 @7xl:grid-cols-3">
              {kpis?.governance && (
                <KpiCategoryCard
                  title="Governance"
                  score={kpis.governance.score}
                  status={kpis.governance.status}
                  icon={kpiIcons.governance}
                  metrics={kpis.governance.metrics}
                />
              )}
              {kpis?.cost && (
                <KpiCategoryCard
                  title="Cost Efficiency"
                  score={kpis.cost.score}
                  status={kpis.cost.status}
                  icon={kpiIcons.cost}
                  metrics={kpis.cost.metrics}
                />
              )}
              {kpis?.performance && (
                <KpiCategoryCard
                  title="Performance"
                  score={kpis.performance.score}
                  status={kpis.performance.status}
                  icon={kpiIcons.performance}
                  metrics={kpis.performance.metrics}
                />
              )}
              {kpis?.usage && (
                <KpiCategoryCard
                  title="Usage"
                  score={kpis.usage.score}
                  status={kpis.usage.status}
                  icon={kpiIcons.usage}
                  metrics={kpis.usage.metrics}
                />
              )}
              {kpis?.compliance && (
                <KpiCategoryCard
                  title="Compliance"
                  score={kpis.compliance.score}
                  status={kpis.compliance.status}
                  icon={kpiIcons.compliance}
                  metrics={kpis.compliance.metrics}
                />
              )}
            </div>

            {/* Recommendations */}
            <RecommendationsCard
              recommendations={kpis?.recommendations || []}
              className="@4xl:col-span-12"
            />
          </div>
        )}

        {/* Compliance Tab */}
        {activeTab === 'compliance' && (
          <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-2">
            <ComplianceCard
              type="gdpr"
              report={gdprReport}
              isLoading={loadingStates.compliance}
            />
            <ComplianceCard
              type="soc2"
              report={soc2Report}
              isLoading={loadingStates.compliance}
            />
          </div>
        )}

        {/* Activity & Security Tab */}
        {activeTab === 'activity' && (
          <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-2">
            <ActivitySummaryCard
              data={activitySummary}
              isLoading={loadingStates.activity}
            />
            <SecurityPostureCard
              data={securityPosture}
              isLoading={loadingStates.activity}
            />
          </div>
        )}

        {/* Cost & Performance Tab */}
        {activeTab === 'cost' && (
          <div className="grid grid-cols-1 gap-6 @4xl:grid-cols-2">
            <CostOverviewCard
              warehouseData={warehouseUsage}
              storageData={storageMetrics}
              dailyCredits={dailyCredits}
              isLoading={loadingStates.cost}
            />
            <PerformanceMetricsCard
              metrics={performanceMetrics}
              slowQueries={slowQueries}
              isLoading={loadingStates.cost}
            />
          </div>
        )}

        {/* Dependencies Tab */}
        {activeTab === 'dependencies' && <DependenciesCard />}

        {/* Trust Center Tab */}
        {activeTab === 'trust-center' && <TrustCenterCard />}
      </div>

      {/* Last Updated */}
      {kpis?.computed_at && (
        <div className="mt-6 text-center">
          <Text className="text-xs text-gray-400">
            Last updated: {new Date(kpis.computed_at).toLocaleString()}
          </Text>
        </div>
      )}
    </div>
  );
}
