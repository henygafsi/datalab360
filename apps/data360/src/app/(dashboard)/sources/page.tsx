'use client';

import React, { useState, useCallback } from 'react';
import { Badge, Button } from 'rizzui';
import {
  Database, Sparkles, Brain, Plus, Settings, RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import SourceTree from './components/SourceTree';
import SourcesOverview from './components/SourcesOverview';
import TableDetailPanel from './components/TableDetailPanel';
import DetectedModelsTab from './components/DetectedModelsTab';
import { refreshCatalog } from '@/app/services/catalog';
import toast from 'react-hot-toast';

type TabId = 'sources' | 'models';

interface SelectedTable {
  database: string;
  schema: string;
  table: string;
}

function SourcesPage() {
  const [tab, setTab] = useState<TabId>('sources');
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [selectedTable, setSelectedTable] = useState<SelectedTable | null>(null);
  const [projectId] = useState<string | undefined>(undefined);
  const [sourceTables, setSourceTables] = useState<Array<{ database: string; schema: string; table: string }>>([]);
  const [refreshing, setRefreshing] = useState(false);

  const handleSelectTable = useCallback((database: string, schema: string, table: string) => {
    setSelectedTable({ database, schema, table });
    setSourceTables((prev) => {
      const fqn = `${database}.${schema}.${table}`;
      if (prev.some((t) => `${t.database}.${t.schema}.${t.table}` === fqn)) return prev;
      return [...prev, { database, schema, table }];
    });
  }, []);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshCatalog({ scope_type: 'account', scope_value: '' });
      toast.success('Catalog refresh started');
    } catch {
      toast.error('Refresh failed — endpoint may not be available');
    }
    setRefreshing(false);
  }, []);

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
            <Button size="sm" variant="outline" className="gap-1.5" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={cn('h-3.5 w-3.5', refreshing && 'animate-spin')} />
              Refresh Catalog
            </Button>
            <Button size="sm" className="gap-1.5 bg-blue-600 hover:bg-blue-700 text-white">
              <Plus className="h-3.5 w-3.5" />Add Source
            </Button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-0 -mb-[1px]">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
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
            onSelectTable={handleSelectTable}
            selectedTable={selectedTable ? `${selectedTable.database}.${selectedTable.schema}.${selectedTable.table}` : undefined}
            collapsed={treeCollapsed}
            onToggleCollapse={() => setTreeCollapsed(!treeCollapsed)}
          />
        )}

        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'sources' ? (
            <SourcesOverview onSelectTable={handleSelectTable} />
          ) : (
            <DetectedModelsTab
              projectId={projectId}
              sourceTables={sourceTables.length > 0 ? sourceTables : undefined}
            />
          )}
        </div>

        {tab === 'sources' && selectedTable && (
          <div className="w-[420px] shrink-0">
            <TableDetailPanel
              database={selectedTable.database}
              schema={selectedTable.schema}
              table={selectedTable.table}
              onClose={() => setSelectedTable(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default function SourcesPageWrapper() {
  return (
    <ErrorBoundary>
      <SourcesPage />
    </ErrorBoundary>
  );
}
