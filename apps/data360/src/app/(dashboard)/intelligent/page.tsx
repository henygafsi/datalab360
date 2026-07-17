'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import type { IconType } from 'react-icons';
import { Badge, Button, Input, Loader, Textarea } from 'rizzui';
import { toast } from 'react-hot-toast';
import { getCortexKpis, generateEmbeddings, queryCortex, type CortexKpis, type CortexQueryResult } from '@/app/services/cortex';
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { useCanPerform } from '@/hooks/useCanPerform';
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
  PiVectorThree,
  PiMagnifyingGlass,
  PiSquaresFour,
  PiCaretDown,
} from 'react-icons/pi';
import { HiOutlineRefresh } from 'react-icons/hi';
import KPICard from '@/components/analytics/KPICard';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import Breadcrumb from '@/components/ui/Breadcrumb';
import FullscreenPanel, { FullscreenExpandButton } from '@/components/ui/FullscreenPanel';
import { usePagedRows, TablePager } from '@/components/ui/TablePager';
import IntelligentCockpit, { IntelligentKpiStrip } from './components/IntelligentCockpit';
import AgenticOSShell from './components/agentic-os/AgenticOSShell';
import IntelligentActionSurface from './components/IntelligentActionSurface';

// Import content components
import SemanticModelsContent from './semantic-models-content';
import CortexChatContent from './cortex-chat-content';
import MLFeaturesContent from './ml-features-content';
import AdvancedMLContent from './advanced-ml-content';
import QueryAnalyticsContent from './query-analytics-content';
import LocalAnalyticsContent from './local-analytics-content';
import SnowparkServicesContent from './snowpark-services-content';
import AiAdvisorContent from './ai-advisor-content';
import AiPromptConsoleContent from './ai-prompt-console-content';

type TabType = 'actions' | 'semantic-models' | 'ai-console' | 'cortex-chat' | 'ml-features' | 'advanced-ml' | 'query-analytics' | 'local-analytics' | 'snowpark-services' | 'cortex-agents' | 'semantic-views' | 'vector-search' | 'ai-advisor';

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

/**
 * Secondary navigation — the 12 historical tabs regrouped into TWO compact,
 * clearly-purposed groups (replacing the old wall of highlighted tab cards):
 *
 *   "Your data AI" — user-facing analytics on the caller's own data
 *   "AI resources" — infra / resource management surfaces
 *
 * Every tab id is unchanged, so existing ?tab= deep-links keep resolving.
 */
interface NavItem {
  id: TabType;
  name: string;
  icon: IconType;
  /** Tooltip — the old tab-card description, kept for discoverability. */
  hint: string;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Your data AI',
    items: [
      { id: 'cortex-chat', name: 'AI Chat', icon: PiChatCircleDots, hint: 'Ask questions about your data in natural language' },
      { id: 'ai-console', name: 'AI Console', icon: PiLightning, hint: 'Docked NL to SQL analyst: pick a semantic model, ask, get SQL + results' },
      { id: 'ai-advisor', name: 'AI Advisor', icon: PiSparkle, hint: 'AI recommendations for cost, performance & governance' },
      { id: 'query-analytics', name: 'Query Analytics', icon: PiChartLineUp, hint: 'AI-powered query analysis & optimization' },
      { id: 'local-analytics', name: 'Local Analytics', icon: PiDatabase, hint: 'Zero-cost queries on staged data' },
      { id: 'semantic-models', name: 'Semantic Models', icon: PiDatabase, hint: 'YAML-based data models for natural-language analytics' },
      { id: 'semantic-views', name: 'Semantic Views', icon: PiDatabase, hint: 'Create & manage semantic views for natural-language analytics' },
      { id: 'vector-search', name: 'Vector Search', icon: PiVectorThree, hint: 'Embeddings, vector columns & similarity search' },
    ],
  },
  {
    label: 'AI resources',
    items: [
      { id: 'ml-features', name: 'ML Features', icon: PiRobotDuotone, hint: 'Text analysis, translation & more' },
      { id: 'advanced-ml', name: 'Advanced ML', icon: PiGear, hint: 'Fine-tuning, classification & document AI' },
      { id: 'snowpark-services', name: 'Container Apps', icon: PiCloudArrowUp, hint: 'Container services, apps & compute pools' },
      { id: 'cortex-agents', name: 'AI Agents', icon: PiRobotDuotone, hint: 'Autonomous AI agents combining analysis, search & tools' },
    ],
  },
];

/** Compact 11px nav pill — active state mirrors the old tab highlight. */
function navPillClass(active: boolean): string {
  return `inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
    active
      ? 'border-purple bg-purple-lighter/50 text-purple'
      : 'border-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-700/50 dark:hover:text-gray-200'
  }`;
}

function formatKpiValue(value: number | null | undefined, format: 'number' | 'percent' | 'seconds'): string {
  if (value === null || value === undefined) return '—';
  if (format === 'percent') return `${value}%`;
  if (format === 'seconds') return `${value}s`;
  return String(value);
}

/**
 * Quiet "feature not provisioned" notice — shown when a read returns 403/404/501
 * (useCacheAwareQuery flags it as `unavailable`, not an error). Explains WHY the
 * tab is empty instead of leaving it silently blank, without a scary red box.
 */
function FeatureUnavailableNotice({ label }: { label: string }) {
  return (
    <div
      role="status"
      className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 rounded-lg"
    >
      <PiCloudArrowUp className="w-5 h-5 text-slate-400 shrink-0" />
      <p className="text-sm text-slate-600 dark:text-slate-300">
        {label} isn’t provisioned on this account yet. Once it’s enabled it will appear here automatically — nothing to fix.
      </p>
    </div>
  );
}

export default function IntelligentPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Fullscreen deep-dive of the main content card (nav + active tab panel).
  const [contentFull, setContentFull] = useState(false);
  // Tab-minimization: the 12 workbench tabs collapse behind one toggle so the
  // primary surfaces (Ask · Actions) lead. Auto-open when a workbench tab is active.
  const [showWorkbenches, setShowWorkbenches] = useState(false);
  // useTrackEvent auto-fires PAGE_VIEW on mount via pathname; call trackTabSwitch on tab changes.
  const { trackTabSwitch } = useTrackEvent();
  // Deep-links preserved: every historical ?tab= id still renders its tab.
  // No (or an unknown) ?tab= lands on the chat-first "Ask AI" home instead.
  const activeTab = useMemo<TabType | 'home'>(() => {
    const t = searchParams.get('tab');
    if (t === 'actions' || t === 'ml-features' || t === 'semantic-models' || t === 'ai-console' || t === 'cortex-chat' || t === 'advanced-ml' || t === 'query-analytics' || t === 'local-analytics' || t === 'snowpark-services' || t === 'cortex-agents' || t === 'semantic-views' || t === 'vector-search' || t === 'ai-advisor') return t as TabType;
    return 'home';
  }, [searchParams]);

  // Navigation writes the tab into the URL (shareable + back-button friendly).
  const goTo = useCallback(
    (id: TabType | 'home') => {
      router.push(id === 'home' ? '/intelligent' : `/intelligent?tab=${id}`, { scroll: false });
      trackTabSwitch(id);
    },
    [router, trackTabSwitch],
  );

  // ── KPIs via useCacheAwareQuery ──
  const fetchKpis = useCallback(() => getCortexKpis(), []);
  const { data: kpis, loading: kpisLoading, error: kpisErrorObj, unavailable: kpisUnavailable, refetch: loadKpis } = useCacheAwareQuery<CortexKpis>(
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
  const { data: agents, loading: agentsLoading, error: agentsErrorObj, unavailable: agentsUnavailable, refetch: loadAgents } = useCacheAwareQuery<CortexAgent[]>(
    fetchAgents,
    { cacheKeys: [CACHE_KEYS.CORTEX, CACHE_KEYS.AGENTS], enabled: activeTab === 'cortex-agents', initialData: [] }
  );
  const agentsError = agentsErrorObj?.message ?? null;

  // ── Semantic Views via useCacheAwareQuery ──
  const fetchSemanticViews = useCallback(async () => {
    const res = await apiClient.get<{ semantic_views?: CortexSemanticView[] }>(API.cortex.semanticViews('CP_DATA360'));
    return res.data?.semantic_views ?? [];
  }, []);
  const { data: semanticViews, loading: semanticViewsLoading, error: semanticViewsErrorObj, unavailable: semanticViewsUnavailable, refetch: loadSemanticViews } = useCacheAwareQuery<CortexSemanticView[]>(
    fetchSemanticViews,
    { cacheKeys: [CACHE_KEYS.SEMANTIC_MODELS, CACHE_KEYS.CORTEX], enabled: activeTab === 'semantic-views', initialData: [] }
  );
  const semanticViewsError = semanticViewsErrorObj?.message ?? null;

  // ── Vector Columns via useCacheAwareQuery ──
  const fetchVectorColumns = useCallback(async () => {
    const res = await apiClient.get<{ vector_columns?: CortexVectorColumn[] }>(API.cortex.vectorColumns('CP_DATA360'));
    return res.data?.vector_columns ?? [];
  }, []);
  const { data: vectorColumns, loading: vectorColumnsLoading, error: vectorColumnsErrorObj, unavailable: vectorColumnsUnavailable, refetch: loadVectorColumns } = useCacheAwareQuery<CortexVectorColumn[]>(
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

  // Standardized tables — pageSize 25 + sticky headers (AuditTable pattern).
  const svPager = usePagedRows(semanticViews ?? [], 25);
  const vcPager = usePagedRows(vectorColumns ?? [], 25);

  // Human label of the active tab (fullscreen overlay title).
  const activeTabLabel = useMemo(() => {
    if (activeTab === 'home') return 'Ask AI';
    if (activeTab === 'actions') return 'Actions';
    for (const g of NAV_GROUPS) {
      const hit = g.items.find((i) => i.id === activeTab);
      if (hit) return hit.name;
    }
    return 'Intelligent Analytics';
  }, [activeTab]);

  // KPI overview (GET /cortex/kpis, no static data) — a single definition
  // rendered above tab content on tab views (as before) and below the chat
  // hero on the chat-first home.
  const kpiOverview = (
    <section aria-label="AI usage metrics" className="space-y-6">
      {kpisUnavailable && !kpisLoading && <FeatureUnavailableNotice label="AI usage metrics" />}
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

      {/* Real AI-engine spend strip — additive, scalars only, hidden when absent */}
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
    </section>
  );

  return (
    <ErrorBoundary>
    {/* One-pager shell (platform viewport pattern, same budget as /workflow):
        fixed-height frame — the main column scrolls INSIDE, the cockpit is
        docked full-height at the right edge, the document never scrolls. */}
    <div className="flex h-[calc(100dvh-222px)] min-h-[520px] items-stretch gap-4 overflow-hidden">
    <div className="min-w-0 flex-1 space-y-5 overflow-y-auto pb-4 pr-1">
      <Breadcrumb items={[{ label: 'Intelligent Analytics', href: '/intelligent' }]} />
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-lighter/70">
              <PiBrain className="h-5 w-5 text-purple" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
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

      {/* Unified intelligence KPI strip — click a KPI to open its cockpit axis */}
      <IntelligentKpiStrip />

      {/* KPI overview — above the content on tab views (unchanged); on the
          chat-first home it renders BELOW the chat + suggestions instead. */}
      {activeTab !== 'home' && kpiOverview}

      {/* Main Content Card with Tabs — expandable to a fullscreen deep-dive */}
      <FullscreenPanel
        title={`Intelligent Analytics — ${activeTabLabel}`}
        subtitle="Deep-dive view · Esc to close"
        open={contentFull}
        onOpenChange={setContentFull}
      >
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-muted dark:border-gray-700 shadow-sm overflow-hidden">
        {/* Tab-minimized nav — two primary surfaces (Ask · Actions) lead; the 12
            workbench tabs collapse behind one "Workbenches" toggle. Every
            historical ?tab= id still resolves, so deep-links keep working. */}
        <nav
          role="tablist"
          aria-label="Intelligent Analytics sections"
          className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-b border-muted bg-gray-50/50 px-4 py-2.5 dark:border-gray-700 dark:bg-gray-800/50"
        >
          <button
            role="tab"
            aria-selected={activeTab === 'home'}
            title="Chat-first home — ask AI about your data"
            onClick={() => goTo('home')}
            className={navPillClass(activeTab === 'home')}
          >
            <PiChatCircleDots className="h-3.5 w-3.5" aria-hidden />
            Ask AI
          </button>
          <button
            role="tab"
            aria-selected={activeTab === 'actions'}
            title="Every AI capability as a governed action — read-only runs inline, changes open their workbench"
            onClick={() => goTo('actions')}
            className={navPillClass(activeTab === 'actions')}
          >
            <PiSquaresFour className="h-3.5 w-3.5" aria-hidden />
            Actions
          </button>
          <span className="mx-1 h-4 w-px bg-gray-200 dark:bg-gray-700" aria-hidden />
          <button
            type="button"
            aria-expanded={showWorkbenches}
            title={showWorkbenches ? 'Hide workbenches' : 'Show the 12 workbench tabs'}
            onClick={() => setShowWorkbenches((v) => !v)}
            className={navPillClass(false)}
          >
            <PiCaretDown className={`h-3.5 w-3.5 transition-transform ${showWorkbenches ? 'rotate-180' : ''}`} aria-hidden />
            Workbenches
          </button>
          {/* Fullscreen deep-dive of the active section (not a tab). */}
          <span className="ml-auto">
            <FullscreenExpandButton
              onClick={() => setContentFull(true)}
              label={`Expand ${activeTabLabel} to fullscreen`}
            />
          </span>
          {/* Collapsible workbench pills — hidden by default (auto-shown when a
              workbench tab is the active one, so the current tab is never orphaned). */}
          {(showWorkbenches || (activeTab !== 'home' && activeTab !== 'actions')) && (
            <div className="flex w-full flex-wrap items-center gap-x-4 gap-y-1.5 pt-1.5">
              {NAV_GROUPS.map((group) => (
                <div key={group.label} className="flex flex-wrap items-center gap-1">
                  <span
                    role="presentation"
                    className="mr-0.5 select-none text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500"
                  >
                    {group.label}
                  </span>
                  {group.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.id}
                        role="tab"
                        aria-selected={activeTab === item.id}
                        title={item.hint}
                        onClick={() => goTo(item.id)}
                        className={navPillClass(activeTab === item.id)}
                      >
                        <Icon className="h-3.5 w-3.5" aria-hidden />
                        {item.name}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </nav>

        {/* Tab Content */}
        <div role="tabpanel" className="p-6">
          {/* Chat-first home: persisted AI chat + data-aware suggestions */}
          {activeTab === 'home' && <AgenticOSShell />}
          {/* Agentic command surface: all AI capabilities as governed actions */}
          {activeTab === 'actions' && <IntelligentActionSurface />}
          {activeTab === 'semantic-models' && <SemanticModelsContent />}
          {activeTab === 'ai-console' && <AiPromptConsoleContent />}
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
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Registered Agents</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Autonomous AI agents registered on this account, combining structured data analysis, unstructured search, and custom tools.</p>
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

              {agentsUnavailable && !agentsLoading && <div className="mb-3"><FeatureUnavailableNotice label="AI agents" /></div>}
              {agentsError && !agentsLoading && (
                <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <PiLightning className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
                  <p className="text-sm text-red-700 dark:text-red-300">{agentsError}</p>
                  <Button variant="text" size="sm" className="ml-auto shrink-0" onClick={loadAgents}>Retry</Button>
                </div>
              )}

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
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Business-friendly semantic views registered for natural-language analytics, with their tables, measures, and status.</p>
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

              {semanticViewsUnavailable && !semanticViewsLoading && <div className="mb-3"><FeatureUnavailableNotice label="Semantic views" /></div>}
              {semanticViewsError && !semanticViewsLoading && (
                <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <PiLightning className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0" />
                  <p className="text-sm text-red-700 dark:text-red-300">{semanticViewsError}</p>
                  <Button variant="text" size="sm" className="ml-auto shrink-0" onClick={loadSemanticViews}>Retry</Button>
                </div>
              )}

              {/* Semantic views list */}
              {semanticViewsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader variant="spinner" size="lg" />
                </div>
              ) : (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <div className="max-h-[420px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800">
                      <tr>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">View Name</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tables</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Measures</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                        <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Last Updated</th>
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
                        svPager.visible.map((view, i) => (
                          <tr key={view.name || i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50">
                            <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white">{view.name || view.VIEW_NAME || '—'}</td>
                            <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{view.table_count ?? view.TABLES ?? '—'}</td>
                            <td className="px-4 py-2.5 text-gray-600 dark:text-gray-400">{view.measure_count ?? view.MEASURES ?? '—'}</td>
                            <td className="px-4 py-2.5">
                              <Badge className={`text-[10px] ${view.status === 'active' || view.STATUS === 'ACTIVE' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                                {view.status || view.STATUS || 'Draft'}
                              </Badge>
                            </td>
                            <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 text-xs">{view.updated_at || view.LAST_ALTERED || '—'}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                  </div>
                  <TablePager page={svPager.page} totalPages={svPager.totalPages} total={svPager.total} onPage={svPager.setPage} />
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

              {vectorColumnsUnavailable && !vectorColumnsLoading && <div className="mb-3"><FeatureUnavailableNotice label="Vector search" /></div>}
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

              {/* Embed a column + similarity search */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <VectorEmbedPanel onEmbedded={loadVectorColumns} />
                <VectorSimilarityPanel columns={vectorColumns ?? []} />
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
                  <div className="max-h-[420px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800">
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
                        vcPager.visible.map((col, i) => {
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
                  <TablePager page={vcPager.page} totalPages={vcPager.totalPages} total={vcPager.total} onPage={vcPager.setPage} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      </FullscreenPanel>

      {/* On the chat-first home the KPI overview lives under the hero */}
      {activeTab === 'home' && kpiOverview}

      {/* Feature highlights — demoted to a one-line collapsible (actions first,
          prose second): the 3 former hero cards now expand on demand. */}
      <details className="group rounded-xl border border-muted bg-white px-4 py-3 dark:border-gray-700 dark:bg-gray-900">
        <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200 [&::-webkit-details-marker]:hidden">
          <PiSparkle className="h-4 w-4 text-purple" aria-hidden />
          What powers Intelligent Analytics
          <span className="ml-auto text-xs text-gray-400 group-open:hidden">Show details</span>
          <span className="ml-auto hidden text-xs text-gray-400 group-open:inline">Hide</span>
        </summary>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-muted p-3 dark:border-gray-700">
            <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white">
              <PiSparkle className="h-4 w-4 text-purple" aria-hidden /> Natural Language Processing
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Ask questions in plain English and get instant SQL-powered answers from your data warehouse.
            </p>
          </div>
          <div className="rounded-lg border border-muted p-3 dark:border-gray-700">
            <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white">
              <PiRocketLaunch className="h-4 w-4 text-blue" aria-hidden /> Intelligent Context
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Semantic models provide business context, synonyms, and relationships for accurate query generation.
            </p>
          </div>
          <div className="rounded-lg border border-muted p-3 dark:border-gray-700">
            <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-gray-900 dark:text-white">
              <PiGear className="h-4 w-4 text-orange" aria-hidden /> Enterprise Ready
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Enterprise security, scalability, and governance built-in across the platform.
            </p>
          </div>
        </div>
      </details>

      {/* Related Modules */}
      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        <span>Related:</span>
        <a href="/workflow" className="text-blue-600 dark:text-blue-400 hover:underline">Workflow (ETL Blocks)</a>
        <a href="/explore-design" className="text-blue-600 dark:text-blue-400 hover:underline">Explore & Design (Semantic Models)</a>
      </div>
    </div>

    {/* Docked right cockpit: score / recos / models / robotize / history / governance */}
    <IntelligentCockpit kpis={kpis} />
    </div>
    </ErrorBoundary>
  );
}

// ── Vector Search helpers ─────────────────────────────────────────────────

function vectorErrMessage(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return 'Request failed';
}

/**
 * Embed a column — turns a column's values into vectors via the managed
 * embedding model (POST /cortex/embeddings). Gated by cortex:generate; on
 * success it toasts and refreshes the vector-columns list.
 */
function VectorEmbedPanel({ onEmbedded }: { onEmbedded: () => void }) {
  const generatePerm = useCanPerform('cortex', 'generate');
  const canGenerate = generatePerm.allowed || generatePerm.loading;

  const [target, setTarget] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ count: number; dims: number } | null>(null);

  const run = useCallback(async () => {
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) {
      toast.error('Enter at least one value to embed (one per line).');
      return;
    }
    setLoading(true);
    setResult(null);
    try {
      const res = await generateEmbeddings(lines);
      const dims = res[0]?.embedding?.length ?? 0;
      setResult({ count: res.length, dims });
      toast.success(
        `Embedded ${res.length} value${res.length === 1 ? '' : 's'}${dims ? ` · ${dims} dims` : ''}${target.trim() ? ` → ${target.trim()}` : ''}`,
      );
      onEmbedded();
    } catch (e) {
      toast.error(vectorErrMessage(e));
    } finally {
      setLoading(false);
    }
  }, [text, target, onEmbedded]);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <PiVectorThree className="w-4 h-4 text-rose-500" /> Embed a column
        </h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Generate embeddings for a column&apos;s values. One value per line.</p>
      </div>
      <Input
        label="Target (TABLE.COLUMN)"
        placeholder="CUSTOMERS.DESCRIPTION"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
      />
      <Textarea
        label="Values to embed"
        placeholder={'annual recurring revenue\nmonthly recurring revenue\ncustomer churn rate'}
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
      />
      <Button
        size="sm"
        className="w-full gap-1.5"
        onClick={run}
        isLoading={loading}
        disabled={!canGenerate || loading}
      >
        <PiVectorThree className="h-4 w-4" /> Embed
      </Button>
      {!generatePerm.allowed && !generatePerm.loading && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">You don&apos;t have permission to generate embeddings.</p>
      )}
      {result && (
        <p className="text-xs text-gray-600 dark:text-gray-300">
          Generated <span className="font-semibold">{result.count}</span> vector{result.count === 1 ? '' : 's'}
          {result.dims ? <> × <span className="font-semibold">{result.dims}</span> dims</> : null}.
        </p>
      )}
    </div>
  );
}

/**
 * Similarity search — runs a Cortex query (POST /cortex/query) that ranks the
 * closest records to a phrase over one of the listed embedded columns.
 */
function VectorSimilarityPanel({ columns }: { columns: CortexVectorColumn[] }) {
  const options = useMemo(
    () =>
      columns
        .map((c) => `${c.table_name || c.TABLE_NAME || ''}.${c.column_name || c.COLUMN_NAME || ''}`)
        .filter((label) => label !== '.'),
    [columns],
  );

  const [selected, setSelected] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CortexQueryResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!selected && options.length > 0) setSelected(options[0]);
  }, [options, selected]);

  const run = useCallback(async () => {
    const q = query.trim();
    if (!q) {
      toast.error('Enter a phrase to search for.');
      return;
    }
    if (!selected) {
      toast.error('Select a vector column to search.');
      return;
    }
    const table = selected.split('.')[0];
    setLoading(true);
    setResults(null);
    setError(null);
    try {
      const res = await queryCortex({
        prompt: `Find the rows in ${table} most similar to "${q}", ranked by vector cosine similarity on the ${selected} embedding column. Return the closest matches.`,
      });
      setResults(res.results ?? []);
    } catch (e) {
      setError(vectorErrMessage(e));
    } finally {
      setLoading(false);
    }
  }, [query, selected]);

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800 space-y-3">
      <div>
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <PiMagnifyingGlass className="w-4 h-4 text-purple-500" /> Similarity search
        </h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Find the closest records to a phrase across an embedded column.</p>
      </div>
      {options.length === 0 ? (
        <p className="text-xs text-gray-400 dark:text-gray-500">No vector columns available to search yet.</p>
      ) : (
        <>
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-300 mb-1">Vector column</label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-2.5 py-1.5 text-sm text-gray-900 dark:text-gray-100"
            >
              {options.map((opt) => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
          <Input
            label="Search phrase"
            placeholder="customers who mentioned refunds"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') run(); }}
          />
          <Button size="sm" className="w-full gap-1.5" onClick={run} isLoading={loading} disabled={loading}>
            <PiMagnifyingGlass className="h-4 w-4" /> Search
          </Button>
          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          {results != null && results.length === 0 && !error && (
            <p className="text-xs text-gray-500 dark:text-gray-400">— No matches returned.</p>
          )}
          {results && results.length > 0 && (
            <div className="space-y-2">
              {results.map((r, i) => (
                <VectorResultBlock key={i} result={r} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function VectorResultBlock({ result }: { result: CortexQueryResult }) {
  const sql = result.query ?? (result.type === 'sql' ? result.text : undefined);
  const rows: Record<string, unknown>[] = Array.isArray(result.data) ? (result.data as Record<string, unknown>[]) : [];
  const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
  return (
    <div className="space-y-2">
      {sql && (
        <pre className="overflow-x-auto rounded-md border border-gray-700 bg-gray-900 px-3 py-2 text-[11px] leading-relaxed text-green-300">{sql}</pre>
      )}
      {result.text && result.type !== 'sql' && (
        <p className="whitespace-pre-wrap text-xs text-gray-700 dark:text-gray-300">{result.text}</p>
      )}
      {cols.length > 0 && (
        <div className="max-h-56 overflow-auto rounded-md border border-gray-200 dark:border-gray-700">
          <table className="min-w-full text-[11px]">
            <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
              <tr>
                {cols.map((c) => (
                  <th key={c} className="border-b border-gray-200 px-2 py-1.5 text-left font-semibold text-gray-600 dark:border-gray-700 dark:text-gray-300">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, 25).map((row, ri) => (
                <tr key={ri} className="odd:bg-white even:bg-gray-50 dark:odd:bg-gray-900 dark:even:bg-gray-800/40">
                  {cols.map((c) => (
                    <td key={c} className="border-b border-gray-100 px-2 py-1 text-gray-700 dark:border-gray-800 dark:text-gray-300">
                      {row[c] === null || row[c] === undefined ? '—' : String(row[c])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
