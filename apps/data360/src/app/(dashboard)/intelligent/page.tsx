'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { Badge, Button, Loader } from 'rizzui';
import { getCortexKpis, type CortexKpis } from '@/app/services/cortex';
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { useTrackEvent } from '@/hooks/useTrackEvent';
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
import AiAdvisorContent from './ai-advisor-content';

type TabType = 'semantic-models' | 'cortex-chat' | 'ml-features' | 'advanced-ml' | 'query-analytics' | 'local-analytics' | 'snowpark-services' | 'cortex-agents' | 'semantic-views' | 'vector-search' | 'ai-advisor';

// ── Response shapes for the inline Cortex tabs (no dedicated service types
// exist for these read-only listing endpoints, so they are declared here). ──
interface CortexAgent {
  name?: string;
  AGENT_NAME?: string;
  description?: string;
  comment?: string;
  status?: string;
}

interface CortexSemanticView {
  name?: string;
  VIEW_NAME?: string;
  table_count?: number;
  TABLES?: number;
  measure_count?: number;
  MEASURES?: number;
  status?: string;
  STATUS?: string;
  updated_at?: string;
  LAST_ALTERED?: string;
}

interface CortexVectorColumn {
  schema_name?: string;
  SCHEMA_NAME?: string;
  table_name?: string;
  TABLE_NAME?: string;
  column_name?: string;
  COLUMN_NAME?: string;
  dimensions?: number;
  DIMENSIONS?: number;
  model?: string;
  EMBEDDING_MODEL?: string;
  source_column?: string;
  SOURCE_COLUMN?: string;
  row_count?: number;
  ROW_COUNT?: number;
}

const TABS = [
  {
    id: 'semantic-models' as TabType,
    name: 'Semantic Models',
    icon: PiDatabase,
    description: 'YAML-based data models for natural-language analytics',
    badge: 'AI-Powered',
    badgeColor: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
  },
  {
    id: 'cortex-chat' as TabType,
    name: 'AI Chat',
    icon: PiChatCircleDots,
    description: 'Ask questions about your data in natural language',
    badge: 'Beta',
    badgeColor: 'bg-fuchsia-100 text-fuchsia-800 dark:bg-fuchsia-900/30 dark:text-fuchsia-400',
  },
  {
    id: 'ai-advisor' as TabType,
    name: 'AI Advisor',
    icon: PiSparkle,
    description: 'AI recommendations for cost, performance & governance',
    badge: 'New',
    badgeColor: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400',
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
    badge: 'AI',
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
    name: 'Container Apps',
    icon: PiCloudArrowUp,
    description: 'Container services, apps & compute pools',
    badge: 'Enterprise',
    badgeColor: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400',
  },
  {
    id: 'cortex-agents' as TabType,
    name: 'AI Agents',
    icon: PiRobotDuotone,
    description: 'Autonomous AI agents combining analysis, search & tools',
    badge: 'Preview',
    badgeColor: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  },
  {
    id: 'semantic-views' as TabType,
    name: 'Semantic Views',
    icon: PiDatabase,
    description: 'Create & manage semantic views for natural-language analytics',
    badge: 'New',
    badgeColor: 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400',
  },
  {
    id: 'vector-search' as TabType,
    name: 'Vector Search',
    icon: PiSparkle,
    description: 'Embeddings, vector columns & similarity search',
    badge: 'AI',
    badgeColor: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400',
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
  // useTrackEvent auto-fires PAGE_VIEW on mount via pathname; call trackTabSwitch on tab changes.
  const { trackTabSwitch } = useTrackEvent();
  const tabFromUrl = useMemo(() => {
    const t = searchParams.get('tab');
    if (t === 'ml-features' || t === 'semantic-models' || t === 'cortex-chat' || t === 'advanced-ml' || t === 'query-analytics' || t === 'local-analytics' || t === 'snowpark-services' || t === 'cortex-agents' || t === 'semantic-views' || t === 'vector-search' || t === 'ai-advisor') return t as TabType;
    return 'semantic-models';
  }, [searchParams]);
  const [activeTab, setActiveTab] = useState<TabType>(tabFromUrl);

  useEffect(() => {
    setActiveTab(tabFromUrl);
  }, [tabFromUrl]);

  // ── KPIs via useCacheAwareQuery ──
  const fetchKpis = useCallback(() => getCortexKpis(), []);
  const { data: kpis, loading: kpisLoading, error: kpisErrorObj, refetch: loadKpis } = useCacheAwareQuery<CortexKpis>(
    fetchKpis,
    { cacheKeys: [CACHE_KEYS.CORTEX] }
  );
  const kpisError = kpisErrorObj?.message ?? null;
  // Real Cortex spend (additive block from /cortex/kpis). Absent unless the
  // ACCOUNT_USAGE grant + usage view are available; render only when present.
  const cortexUsage = kpis?.cortex_usage ?? null;
  const hasCortexUsage =
    cortexUsage != null &&
    (cortexUsage.total_credits != null ||
      cortexUsage.total_tokens != null ||
      cortexUsage.total_calls != null);

  // ── Cortex Agents via useCacheAwareQuery ──
  const fetchAgents = useCallback(async () => {
    const res = await apiClient.get<{ agents?: CortexAgent[] }>(API.cortex.agents('CP_DATA360'));
    return res.data?.agents ?? [];
  }, []);
  const { data: agents, loading: agentsLoading, error: agentsErrorObj, refetch: loadAgents } = useCacheAwareQuery<CortexAgent[]>(
    fetchAgents,
    { cacheKeys: [CACHE_KEYS.CORTEX, CACHE_KEYS.AGENTS], enabled: activeTab === 'cortex-agents', initialData: [] }
  );
  const agentsError = agentsErrorObj?.message ?? null;

  // ── Semantic Views via useCacheAwareQuery ──
  const fetchSemanticViews = useCallback(async () => {
    const res = await apiClient.get<{ semantic_views?: CortexSemanticView[] }>(API.cortex.semanticViews('CP_DATA360'));
    return res.data?.semantic_views ?? [];
  }, []);
  const { data: semanticViews, loading: semanticViewsLoading, error: semanticViewsErrorObj, refetch: loadSemanticViews } = useCacheAwareQuery<CortexSemanticView[]>(
    fetchSemanticViews,
    { cacheKeys: [CACHE_KEYS.SEMANTIC_MODELS, CACHE_KEYS.CORTEX], enabled: activeTab === 'semantic-views', initialData: [] }
  );
  const semanticViewsError = semanticViewsErrorObj?.message ?? null;

  // ── Vector Columns via useCacheAwareQuery ──
  const fetchVectorColumns = useCallback(async () => {
    const res = await apiClient.get<{ vector_columns?: CortexVectorColumn[] }>(API.cortex.vectorColumns('CP_DATA360'));
    return res.data?.vector_columns ?? [];
  }, []);
  const { data: vectorColumns, loading: vectorColumnsLoading, error: vectorColumnsErrorObj, refetch: loadVectorColumns } = useCacheAwareQuery<CortexVectorColumn[]>(
    fetchVectorColumns,
    { cacheKeys: [CACHE_KEYS.CORTEX, CACHE_KEYS.VECTORS], enabled: activeTab === 'vector-search', initialData: [] }
  );
  const vectorColumnsError = vectorColumnsErrorObj?.message ?? null;
  // Distinct (schema.table) pairs holding a vector column — derived from the
  // rows already fetched, so no extra request and no contract change.
  const tablesWithVectors = useMemo(() => {
    const cols = vectorColumns ?? [];
    if (cols.length === 0) return 0;
    const tables = new Set<string>();
    for (const c of cols) {
      const schema = c.SCHEMA_NAME ?? c.schema_name ?? '';
      const table = c.TABLE_NAME ?? c.table_name ?? '';
      if (table) tables.add(`${schema}.${table}`);
    }
    return tables.size;
  }, [vectorColumns]);

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
                AI-powered data insights across your platform
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
          help={{ title: 'Models Active', definition: 'Number of semantic models currently deployed and available for natural-language analytics.', source: 'AI engine catalog' }}
          icon={<PiDatabase className="w-6 h-6" />}
          color="purple"
          loading={kpisLoading}
        />
        <KPICard
          title="Queries Today"
          value={kpisLoading ? '…' : formatKpiValue(kpis?.queries_today ?? null, 'number')}
          subtitle="Natural language queries"
          help={{ title: 'Queries Today', definition: 'Count of natural-language questions answered by the AI engine since the start of the day.', source: 'AI engine query log' }}
          icon={<PiChatCircleDots className="w-6 h-6" />}
          color="blue"
          loading={kpisLoading}
        />
        <KPICard
          title="Avg Response"
          value={kpisLoading ? '…' : formatKpiValue(kpis?.avg_response_sec ?? null, 'seconds')}
          subtitle="Query response time"
          help={{ title: 'Avg Response', definition: 'Average time the AI engine takes to return an answer for a natural-language query.', source: 'AI engine query log', goodRange: '< 5s' }}
          icon={<PiLightning className="w-6 h-6" />}
          color="amber"
          loading={kpisLoading}
        />
        <KPICard
          title="Accuracy Rate"
          value={kpisLoading ? '…' : formatKpiValue(kpis?.accuracy_rate ?? null, 'percent')}
          subtitle="Query accuracy"
          help={{ title: 'Accuracy Rate', definition: 'Share of AI-engine answers validated as correct against expected results.', source: 'AI engine evaluation', goodRange: '> 90%' }}
          icon={<PiTrendUp className="w-6 h-6" />}
          color="green"
          loading={kpisLoading}
        />
      </div>

      {/* Real Cortex spend strip — additive, scalars only, hidden when absent */}
      {hasCortexUsage && cortexUsage && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/50 text-sm">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            AI engine usage{cortexUsage.period_days ? ` · last ${cortexUsage.period_days}d` : ''}
          </span>
          {cortexUsage.total_credits != null && (
            <span className="text-gray-500 dark:text-gray-400">
              Credits{' '}
              <span className="font-semibold text-gray-900 dark:text-white">
                {cortexUsage.total_credits.toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </span>
          )}
          {cortexUsage.total_tokens != null && (
            <span className="text-gray-500 dark:text-gray-400">
              Tokens{' '}
              <span className="font-semibold text-gray-900 dark:text-white">
                {cortexUsage.total_tokens.toLocaleString()}
              </span>
            </span>
          )}
          {cortexUsage.total_calls != null && (
            <span className="text-gray-500 dark:text-gray-400">
              Calls{' '}
              <span className="font-semibold text-gray-900 dark:text-white">
                {cortexUsage.total_calls.toLocaleString()}
              </span>
            </span>
          )}
        </div>
      )}

      {/* Main Content Card with Tabs */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-muted dark:border-gray-700 shadow-sm overflow-hidden">
        {/* Tabs */}
        <div role="tablist" className="flex gap-2 p-4 border-b border-muted dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50 overflow-x-auto">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                role="tab"
                aria-selected={isActive}
                onClick={() => { setActiveTab(tab.id); trackTabSwitch(tab.id); }}
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
        <div role="tabpanel" className="p-6">
          {activeTab === 'semantic-models' && <SemanticModelsContent />}
          {activeTab === 'cortex-chat' && <CortexChatContent />}
          {activeTab === 'ai-advisor' && <AiAdvisorContent />}
          {activeTab === 'ml-features' && <MLFeaturesContent />}
          {activeTab === 'advanced-ml' && <AdvancedMLContent />}
          {activeTab === 'query-analytics' && <QueryAnalyticsContent />}
          {activeTab === 'local-analytics' && <LocalAnalyticsContent />}
          {activeTab === 'snowpark-services' && <SnowparkServicesContent />}

          {/* ── Cortex Agents ── */}
          {activeTab === 'cortex-agents' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">AI Agents</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Build autonomous AI agents that combine structured data analysis, unstructured search, and custom tools.</p>
                </div>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={loadAgents}
                  disabled={agentsLoading}
                >
                  <HiOutlineRefresh className={`w-4 h-4 ${agentsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>

              {agentsError && !agentsLoading && (
                <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <PiLightning className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
                  <p className="text-sm text-red-700 dark:text-red-300">{agentsError}</p>
                  <Button variant="text" size="sm" className="ml-auto shrink-0" onClick={loadAgents}>Retry</Button>
                </div>
              )}

              {/* Agent capabilities overview */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
                  <div className="flex items-center gap-2 mb-2">
                    <PiDatabase className="w-5 h-5 text-blue-500" />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Structured Analyst</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Structured data queries via semantic models. SQL generation from natural language.</p>
                </div>
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
                  <div className="flex items-center gap-2 mb-2">
                    <PiSparkle className="w-5 h-5 text-purple-500" />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Semantic Search</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Unstructured data retrieval. Vector search over documents, PDFs, and text columns.</p>
                </div>
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
                  <div className="flex items-center gap-2 mb-2">
                    <PiGear className="w-5 h-5 text-amber-500" />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Custom Tools</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Python UDFs, external APIs, and container functions as agent tools.</p>
                </div>
              </div>

              {/* Agent list */}
              {agentsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader variant="spinner" size="lg" />
                </div>
              ) : agentsError ? null : (agents ?? []).length === 0 ? (
                <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-8 text-center border border-gray-200 dark:border-gray-700">
                  <PiRobotDuotone className="h-12 w-12 mx-auto text-indigo-400 mb-3" />
                  <p className="text-gray-600 dark:text-gray-400 font-medium">No agents configured yet</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Agents combining structured analysis, semantic search, and custom tools will appear here once configured.</p>
                </div>
              ) : (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">Active Agents</h4>
                    <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 text-xs">{(agents ?? []).length}</Badge>
                  </div>
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {(agents ?? []).map((agent, i) => (
                      <div key={agent.name || i} className="px-4 py-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                        <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
                          <PiRobotDuotone className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{agent.name || agent.AGENT_NAME || `Agent #${i + 1}`}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">{agent.description || agent.comment || 'No description'}</p>
                        </div>
                        <Badge className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          {agent.status || 'Active'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Semantic Views ── */}
          {activeTab === 'semantic-views' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Semantic Views</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Define business-friendly views with dimensions, measures, time grains, and synonyms for natural-language analytics.</p>
                </div>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={loadSemanticViews}
                  disabled={semanticViewsLoading}
                >
                  <HiOutlineRefresh className={`w-4 h-4 ${semanticViewsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>

              {semanticViewsError && !semanticViewsLoading && (
                <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <PiLightning className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
                  <p className="text-sm text-red-700 dark:text-red-300">{semanticViewsError}</p>
                  <Button variant="text" size="sm" className="ml-auto shrink-0" onClick={loadSemanticViews}>Retry</Button>
                </div>
              )}

              {/* View builder info */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">YAML-Based Definition</h4>
                  <ul className="space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <li className="flex items-center gap-2"><PiLightning className="w-3.5 h-3.5 text-amber-500 shrink-0" /> Tables with columns, data types, and descriptions</li>
                    <li className="flex items-center gap-2"><PiLightning className="w-3.5 h-3.5 text-amber-500 shrink-0" /> Dimensions, measures, and time dimensions</li>
                    <li className="flex items-center gap-2"><PiLightning className="w-3.5 h-3.5 text-amber-500 shrink-0" /> Business synonyms and sample values</li>
                    <li className="flex items-center gap-2"><PiLightning className="w-3.5 h-3.5 text-amber-500 shrink-0" /> Verified queries for accuracy validation</li>
                  </ul>
                </div>
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Natural-Language Analytics Integration</h4>
                  <ul className="space-y-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <li className="flex items-center gap-2"><PiTrendUp className="w-3.5 h-3.5 text-green-500 shrink-0" /> Auto-generate YAML from table metadata</li>
                    <li className="flex items-center gap-2"><PiTrendUp className="w-3.5 h-3.5 text-green-500 shrink-0" /> Validate with test questions before deploy</li>
                    <li className="flex items-center gap-2"><PiTrendUp className="w-3.5 h-3.5 text-green-500 shrink-0" /> Version history with diff viewer</li>
                    <li className="flex items-center gap-2"><PiTrendUp className="w-3.5 h-3.5 text-green-500 shrink-0" /> Stage to @semantic_model_stage</li>
                  </ul>
                </div>
              </div>

              {/* Semantic views list */}
              {semanticViewsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader variant="spinner" size="lg" />
                </div>
              ) : (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">View Name</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tables</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Measures</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Last Updated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {semanticViewsLoading || semanticViewsError ? null : (semanticViews ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">
                            <PiDatabase className="h-8 w-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                            No semantic views defined yet. Semantic views deployed for natural-language analytics will appear here.
                          </td>
                        </tr>
                      ) : (
                        (semanticViews ?? []).map((view, i) => (
                          <tr key={view.name || i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{view.name || view.VIEW_NAME || '—'}</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{view.table_count ?? view.TABLES ?? '—'}</td>
                            <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{view.measure_count ?? view.MEASURES ?? '—'}</td>
                            <td className="px-4 py-3">
                              <Badge className={`text-[10px] ${view.status === 'active' || view.STATUS === 'ACTIVE' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                                {view.status || view.STATUS || 'Draft'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-xs">{view.updated_at || view.LAST_ALTERED || '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── Vector Search ── */}
          {activeTab === 'vector-search' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Vector Search</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Create embeddings, manage vector columns, and perform similarity search across your data.</p>
                </div>
                <Button
                  variant="outline"
                  className="gap-2"
                  onClick={loadVectorColumns}
                  disabled={vectorColumnsLoading}
                >
                  <HiOutlineRefresh className={`w-4 h-4 ${vectorColumnsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>

              {vectorColumnsError && !vectorColumnsLoading && (
                <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <PiLightning className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
                  <p className="text-sm text-red-700 dark:text-red-300">{vectorColumnsError}</p>
                  <Button variant="text" size="sm" className="ml-auto shrink-0" onClick={loadVectorColumns}>Retry</Button>
                </div>
              )}

              {/* Vector capabilities */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                    <PiRocketLaunch className="w-4 h-4 text-rose-500" />
                    EMBED_TEXT_768 / 1024
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Generate embeddings using managed embedding models. 768 or 1024 dimensions.</p>
                </div>
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                    <PiSparkle className="w-4 h-4 text-purple-500" />
                    VECTOR_COSINE_SIMILARITY
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Find similar records using cosine, L2, or inner product distance functions.</p>
                </div>
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                    <PiBrain className="w-4 h-4 text-blue-500" />
                    Managed Search Service
                  </h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Managed retrieval service with hybrid search (vector + keyword). Auto-refreshes on data changes.</p>
                </div>
              </div>

              {/* Vector columns list */}
              {vectorColumnsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader variant="spinner" size="lg" />
                </div>
              ) : (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-900 dark:text-white">Vector Columns</h4>
                    <div className="flex items-center gap-2">
                      {tablesWithVectors > 0 && (
                        <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 text-xs">
                          {tablesWithVectors} {tablesWithVectors === 1 ? 'table' : 'tables'}
                        </Badge>
                      )}
                      <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 text-xs">{(vectorColumns ?? []).length} columns</Badge>
                    </div>
                  </div>
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50/50 dark:bg-gray-800/50">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Table.Column</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Dimensions</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Model</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Source Column</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Row Count</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {vectorColumnsLoading || vectorColumnsError ? null : (vectorColumns ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">
                            <PiSparkle className="h-8 w-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                            No vector columns found. Columns embedded for similarity search will appear here.
                          </td>
                        </tr>
                      ) : (
                        (vectorColumns ?? []).map((col, i) => {
                          const rowCount = col.row_count ?? col.ROW_COUNT;
                          return (
                            <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                              <td className="px-4 py-2.5 text-gray-900 dark:text-white font-mono text-xs">{col.table_name || col.TABLE_NAME || '—'}.{col.column_name || col.COLUMN_NAME || '—'}</td>
                              <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{col.dimensions ?? col.DIMENSIONS ?? '—'}</td>
                              <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{col.model || col.EMBEDDING_MODEL || '—'}</td>
                              <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{col.source_column || col.SOURCE_COLUMN || '—'}</td>
                              <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{rowCount != null ? rowCount.toLocaleString() : '—'}</td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
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
            Enterprise security, scalability, and governance built-in across the platform.
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
