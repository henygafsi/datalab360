'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Badge, Button } from 'rizzui';
import { getCortexKpis, type CortexKpis } from '@/app/services/cortex';
import {
  PiBrain,
  PiDatabase,
  PiChatCircleDots,
  PiLightning,
  PiTrendUp,
  PiRobotDuotone,
  PiSparkle,
  PiRocketLaunch,
  PiGear,
  PiChartLineUp,
  PiCloudArrowUp,
} from 'react-icons/pi';
import { HiOutlineRefresh } from 'react-icons/hi';
import KPICard from '@/components/analytics/KPICard';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import Breadcrumb from '@/components/ui/Breadcrumb';

// Import content components
import SemanticModelsContent from './semantic-models-content';
import CortexChatContent from './cortex-chat-content';
import MLFeaturesContent from './ml-features-content';
import AdvancedMLContent from './advanced-ml-content';
import QueryAnalyticsContent from './query-analytics-content';
import LocalAnalyticsContent from './local-analytics-content';
import SnowparkServicesContent from './snowpark-services-content';

type TabType = 'semantic-models' | 'cortex-chat' | 'ml-features' | 'advanced-ml' | 'query-analytics' | 'local-analytics' | 'snowpark-services';

const TABS = [
  {
    id: 'semantic-models' as TabType,
    name: 'Semantic Models',
    icon: PiDatabase,
    description: 'YAML-based data models for Cortex Analyst',
    badge: 'AI-Powered',
    badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  },
  {
    id: 'cortex-chat' as TabType,
    name: 'Cortex Chat',
    icon: PiChatCircleDots,
    description: 'Ask questions about your data in natural language',
    badge: 'Beta',
    badgeColor: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-400',
  },
  {
    id: 'ml-features' as TabType,
    name: 'ML Features',
    icon: PiRobotDuotone,
    description: 'Text analysis, translation & more',
    badge: 'New',
    badgeColor: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  },
  {
    id: 'advanced-ml' as TabType,
    name: 'Advanced ML',
    icon: PiGear,
    description: 'Fine-tuning, Classification & Document AI',
    badge: 'Pro',
    badgeColor: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  },
  {
    id: 'query-analytics' as TabType,
    name: 'Query Analytics',
    icon: PiChartLineUp,
    description: 'AI-powered query analysis & optimization',
    badge: 'Cortex',
    badgeColor: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  },
  {
    id: 'local-analytics' as TabType,
    name: 'Local Analytics',
    icon: PiDatabase,
    description: 'Zero-cost queries on staged data (DuckDB-style)',
    badge: 'New',
    badgeColor: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  },
  {
    id: 'snowpark-services' as TabType,
    name: 'Snowpark Services',
    icon: PiCloudArrowUp,
    description: 'Container services, Streamlit apps & compute pools',
    badge: 'Enterprise',
    badgeColor: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  },
];

function formatKpiValue(value: number | null | undefined, format: 'number' | 'percent' | 'seconds'): string {
  if (value === null || value === undefined) return '—';
  if (format === 'percent') return `${value}%`;
  if (format === 'seconds') return `${value}s`;
  return String(value);
}

export default function IntelligentPage() {
  const searchParams = useSearchParams();
  const tabFromUrl = useMemo(() => {
    const t = searchParams.get('tab');
    if (t === 'ml-features' || t === 'semantic-models' || t === 'cortex-chat' || t === 'advanced-ml' || t === 'query-analytics' || t === 'local-analytics' || t === 'snowpark-services') return t as TabType;
    return 'semantic-models';
  }, [searchParams]);
  const [activeTab, setActiveTab] = useState<TabType>(tabFromUrl);
  const [kpis, setKpis] = useState<CortexKpis | null>(null);
  const [kpisLoading, setKpisLoading] = useState(true);
  const [kpisError, setKpisError] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  const loadKpis = async () => {
    setKpisLoading(true);
    setKpisError(null);
    try {
      const data = await getCortexKpis();
      setKpis(data);
    } catch (err: any) {
      const msg = err?.response?.data?.detail || err?.message || 'Failed to load KPIs';
      console.error('[Intelligent] KPI fetch failed:', msg);
      setKpisError(msg);
      setKpis(null);
    } finally {
      setKpisLoading(false);
    }
  };

  useEffect(() => {
    loadKpis();
  }, []);

  return (
    <ErrorBoundary>
    <div className="space-y-8">
      <Breadcrumb items={[{ label: 'Intelligent Analytics', href: '/intelligent' }]} />
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-purple-lighter/70">
              <PiBrain className="h-6 w-6 text-purple" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
                Intelligent Analytics
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                Leverage Snowflake Cortex for AI-powered data insights
              </p>
            </div>
          </div>
        </div>
        <Button
          variant="outline"
          className="gap-2"
          onClick={loadKpis}
          disabled={kpisLoading}
        >
          <HiOutlineRefresh className={`w-4 h-4 ${kpisLoading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* KPI Stats Grid - from GET /cortex/kpis (no static data) */}
      {kpisError && !kpisLoading && (
        <div className="flex items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <PiLightning className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-sm text-amber-700 dark:text-amber-300">{kpisError}</p>
          <Button variant="text" size="sm" className="ml-auto shrink-0" onClick={loadKpis}>Retry</Button>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <KPICard
          title="Models Active"
          value={kpisLoading ? '…' : formatKpiValue(kpis?.models_active ?? null, 'number')}
          subtitle="Semantic models deployed"
          icon={<PiDatabase className="w-6 h-6" />}
          color="purple"
          loading={kpisLoading}
        />
        <KPICard
          title="Queries Today"
          value={kpisLoading ? '…' : formatKpiValue(kpis?.queries_today ?? null, 'number')}
          subtitle="Natural language queries"
          icon={<PiChatCircleDots className="w-6 h-6" />}
          color="blue"
          loading={kpisLoading}
        />
        <KPICard
          title="Avg Response"
          value={kpisLoading ? '…' : formatKpiValue(kpis?.avg_response_sec ?? null, 'seconds')}
          subtitle="Query response time"
          icon={<PiLightning className="w-6 h-6" />}
          color="amber"
          loading={kpisLoading}
        />
        <KPICard
          title="Accuracy Rate"
          value={kpisLoading ? '…' : formatKpiValue(kpis?.accuracy_rate ?? null, 'percent')}
          subtitle="Query accuracy"
          icon={<PiTrendUp className="w-6 h-6" />}
          color="green"
          loading={kpisLoading}
        />
      </div>

      {/* Main Content Card with Tabs */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-muted dark:border-gray-700 shadow-sm overflow-hidden">
        {/* Tabs */}
        <div className="flex gap-2 p-4 border-b border-muted dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-3 px-5 py-3 text-sm font-medium transition-all duration-200 rounded-lg border-2 ${
                  isActive
                    ? 'border-purple bg-purple-lighter/50 text-purple'
                    : 'border-transparent text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-700/50'
                }`}
              >
                <Icon className="w-5 h-5" />
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <span>{tab.name}</span>
                    {tab.badge && (
                      <Badge className={`text-[10px] px-1.5 py-0.5 ${tab.badgeColor}`}>
                        {tab.badge}
                      </Badge>
                    )}
                  </div>
                  <div className="text-xs opacity-70 mt-0.5 font-normal">{tab.description}</div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'semantic-models' && <SemanticModelsContent />}
          {activeTab === 'cortex-chat' && <CortexChatContent />}
          {activeTab === 'ml-features' && <MLFeaturesContent />}
          {activeTab === 'advanced-ml' && <AdvancedMLContent />}
          {activeTab === 'query-analytics' && <QueryAnalyticsContent />}
          {activeTab === 'local-analytics' && <LocalAnalyticsContent />}
          {activeTab === 'snowpark-services' && <SnowparkServicesContent />}
        </div>
      </div>

      {/* Feature Highlights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="border border-muted dark:border-gray-700 bg-white dark:bg-gray-900 p-6 rounded-xl transition-all duration-200 hover:shadow-md">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-purple-lighter/70 mb-4">
            <PiSparkle className="w-5 h-5 text-purple" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Natural Language Processing
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Ask questions in plain English and get instant SQL-powered answers from your data warehouse.
          </p>
        </div>

        <div className="border border-muted dark:border-gray-700 bg-white dark:bg-gray-900 p-6 rounded-xl transition-all duration-200 hover:shadow-md">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-blue-lighter/70 mb-4">
            <PiRocketLaunch className="w-5 h-5 text-blue" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Intelligent Context
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Semantic models provide business context, synonyms, and relationships for accurate query generation.
          </p>
        </div>

        <div className="border border-muted dark:border-gray-700 bg-white dark:bg-gray-900 p-6 rounded-xl transition-all duration-200 hover:shadow-md">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-orange-lighter/70 mb-4">
            <PiGear className="w-5 h-5 text-orange" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            Enterprise Ready
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Built on Snowflake Cortex with enterprise security, scalability, and governance built-in.
          </p>
        </div>
      </div>

      {/* Related Modules */}
      <div className="mt-6 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span>Related:</span>
        <a href="/workflow" className="text-blue-600 dark:text-blue-400 hover:underline">Workflow (ETL Blocks)</a>
        <a href="/explore-design" className="text-blue-600 dark:text-blue-400 hover:underline">Explore & Design (Semantic Models)</a>
      </div>
    </div>
    </ErrorBoundary>
  );
}
