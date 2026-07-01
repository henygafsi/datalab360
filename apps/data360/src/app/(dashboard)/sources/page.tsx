'use client';

import React, { Suspense, useState, useEffect, useCallback } from 'react';
import RouteFallback from '@/components/ui/RouteFallback';
import { useAtomValue } from 'jotai';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Badge, Button } from 'rizzui';
import {
  Database, Brain, Plus, RefreshCw, CheckCircle2, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import SourceTree from './components/SourceTree';
import SourcesOverview from './components/SourcesOverview';
import ObjectSmartPanel from './components/ObjectSmartPanel';
import DetectedModelsTab from './components/DetectedModelsTab';
import ProjectSelector from '@/app/(dashboard)/explore-design/components/ProjectSelector';
import AdnHeaderBadge from '@/app/shared/score-cards/AdnHeaderBadge';
import { refreshCatalog } from '@/app/services/catalog';
import { getApiErrorMessage } from '@/lib/api-client';
import { useCanPerform } from '@/hooks/useCanPerform';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';

type TabId = 'sources' | 'models';

interface SelectedTable {
  database: string;
  schema: string;
  table: string;
}

function SourcesPage() {
  // Accept both `?project=` (used by the "Open in Modeler" deep-link below)
  // and `?project_id=` (used by Explore & Design) for consistent deep-linking.
  const searchParams = useSearchParams();
  const urlProjectId = searchParams.get('project') ?? searchParams.get('project_id');

  const [tab, setTab] = useState<TabId>('sources');
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [selectedTable, setSelectedTable] = useState<SelectedTable | null>(null);
  // Real project selection — drives the AI Detected Models flow. Was hardcoded
  // to `undefined`, which left DetectedModelsTab permanently in its
  // "No Project Selected" empty state.
  const [projectId, setProjectId] = useState<string | undefined>(urlProjectId ?? undefined);
  const [sourceTables, setSourceTables] = useState<Array<{ database: string; schema: string; table: string }>>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshStatus, setRefreshStatus] = useState<{ ok: boolean; message: string } | null>(null);
  // System-2 Action-RBAC gate for the account-wide "Refresh Catalog" run (a
  // catalog-state mutation). `data_products` is the registry module for
  // catalog/object surfaces (`catalog` itself is not registered — same key the
  // ObjectSmartPanel "Apply" gate uses); `edit` is its mutate action. Fail-open
  // while the allow-set loads, honest-disable only on a resolved denial.
  const refreshPerm = useCanPerform('data_products', 'edit');
  const canRefresh = refreshPerm.allowed || refreshPerm.loading;
  const refreshDeniedReason =
    'You lack the "edit" permission on data products. Ask an administrator to grant it.';
  // User tracing: the hook auto-fires PAGE_VIEW on mount (top routed component —
  // no child on this route also mounts it, so no duplicate views). We add manual
  // TAB_SWITCH / FEATURE_CLICK calls for the page-level interactions below.
  const { trackTabSwitch, trackFeatureClick } = useTrackEvent();
  // Bumped on a catalog SSE invalidation to remount the listing (SourceTree +
  // SourcesOverview own their own fetches), so a backend scan/refresh/enrich
  // reflects live without a manual Refresh click.
  const [catalogKey, setCatalogKey] = useState(0);

  // SSE cache invalidation: refresh the catalog listing on backend catalog events.
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  useEffect(() => {
    if (!lastInvalidation) return;
    const shouldRefresh = lastInvalidation.keys.some(
      (k: string) =>
        k === CACHE_KEYS.CATALOG ||
        k === CACHE_KEYS.CATALOG_OBJECTS ||
        k === CACHE_KEYS.CATALOG_OVERVIEW
    );
    if (shouldRefresh) setCatalogKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastInvalidation]);

  const handleSelectTable = useCallback((database: string, schema: string, table: string) => {
    setSelectedTable({ database, schema, table });
    setSourceTables((prev) => {
      const fqn = `${database}.${schema}.${table}`;
      if (prev.some((t) => `${t.database}.${t.schema}.${t.table}` === fqn)) return prev;
      return [...prev, { database, schema, table }];
    });
  }, []);

  const handleRefresh = useCallback(async () => {
    trackFeatureClick('refresh_catalog', { scope: 'account' });
    setRefreshing(true);
    setRefreshStatus(null);
    try {
      const res = await refreshCatalog({ scope_type: 'account', scope_value: '' });
      setRefreshStatus({ ok: true, message: `Catalog refresh ${res.status} (run ${res.run_id})` });
    } catch (err) {
      setRefreshStatus({ ok: false, message: getApiErrorMessage(err) });
    }
    setRefreshing(false);
  }, [trackFeatureClick]);

  const tabs: { id: TabId; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      id: 'sources',
      label: 'Sources',
      icon: <Database className="h-4 w-4" />,
      badge: sourceTables.length > 0 ? `${sourceTables.length}` : undefined,
    },
    {
      id: 'models',
      label: 'Detected Models',
      icon: <Brain className="h-4 w-4" />,
    },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">
              <a href="/" className="hover:text-blue-600">Home</a>
              <span className="mx-1">/</span>
              <span className="text-gray-700 dark:text-gray-300">Sources & Models</span>
            </div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-600" />
              Source Catalog
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Explore, enrich and detect models from your data sources
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ProjectSelector
              selectedProjectId={projectId ?? null}
              onProjectSelect={(id) => setProjectId(id)}
              autoSelectProjectId={urlProjectId}
            />
            {/* Per-project 5-axis ADN health badge — self-hides with no project
                selected (falsy id) or when the rollup route is unprovisioned. */}
            <AdnHeaderBadge projectId={projectId} />
            {refreshStatus && (
              <span
                role="status"
                className={cn(
                  'inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] max-w-[260px]',
                  refreshStatus.ok
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-950/30 dark:text-rose-400'
                )}
              >
                {refreshStatus.ok ? <CheckCircle2 className="h-3 w-3 shrink-0" /> : <AlertTriangle className="h-3 w-3 shrink-0" />}
                <span className="truncate">{refreshStatus.message}</span>
              </span>
            )}
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={handleRefresh}
              disabled={refreshing || !canRefresh}
              title={!canRefresh ? refreshDeniedReason : undefined}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
              Refresh Catalog
            </Button>
            <Link href="/data-source-connection">
              <Button
                size="sm"
                className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => trackFeatureClick('add_source')}
              >
                <Plus className="h-3.5 w-3.5" />Add Source
              </Button>
            </Link>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 -mb-[1px]">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => {
                if (t.id !== tab) trackTabSwitch(t.id);
                setTab(t.id);
              }}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors',
                tab === t.id
                  ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
              )}
            >
              {t.icon}
              {t.label}
              {t.badge && (
                <Badge size="sm" className="bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-[9px] ml-1">
                  {t.badge}
                </Badge>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {tab === 'sources' && (
          <SourceTree
            key={catalogKey}
            onSelectTable={handleSelectTable}
            selectedTable={selectedTable ? `${selectedTable.database}.${selectedTable.schema}.${selectedTable.table}` : undefined}
            collapsed={treeCollapsed}
            onToggleCollapse={() => setTreeCollapsed(!treeCollapsed)}
          />
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'sources' ? (
            <SourcesOverview key={catalogKey} onSelectTable={handleSelectTable} />
          ) : (
            <DetectedModelsTab
              projectId={projectId}
              sourceTables={sourceTables.length > 0 ? sourceTables : undefined}
            />
          )}
        </div>

        {tab === 'sources' && (
          <ObjectSmartPanel
            selected={selectedTable}
            onClose={() => setSelectedTable(null)}
          />
        )}
      </div>
    </div>
  );
}

export default function SourcesPageWrapper() {
  return (
    <ErrorBoundary>
      {/* Suspense boundary required for useSearchParams() in the App Router. */}
      <Suspense fallback={<RouteFallback />}>
        <SourcesPage />
      </Suspense>
    </ErrorBoundary>
  );
}
