'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Button, Badge, Input, Modal, Text, Tooltip } from 'rizzui';
import { toast } from 'react-hot-toast';
import {
  Search, Database, Table2, Columns3, Key, Shield, RefreshCw,
  Settings, ChevronRight, ChevronDown, Filter, Download, Upload,
  Layers, Grid3X3, LayoutGrid, CheckSquare, Square, AlertTriangle,
  Clock, History, Lock, Eye, Play, Save, X, Plus, Minus, Trash2,
  FileText, BookOpen, Sparkles, Zap, GitBranch, ArrowRight, ArrowLeftRight,
  Workflow, Rocket, Undo2, Redo2, PanelLeft, PanelRight, Maximize2, Minimize2,
  WifiOff
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter } from 'next/navigation';
import { getSchemas } from '@/app/services/mapping/getSchema';
import { getTables } from '@/app/services/mapping/getTables';
import { getTableColumns } from '@/app/services/mapping/fetch_tables';
import { getDatabases } from '@/app/services/mapping/getDatabases';
import { getMaskingPolicies, MaskingPolicy } from '@/app/services/gouvernance/policies';
import VirtualizedTableList, { TableItem, ColumnInfo } from '../mapping/components/VirtualizedTableList';
import TableDetailPanel, { TableConfig, IngestionMode, IngestionConfig, MaskingConfig } from '../mapping/components/TableDetailPanel';
import ModelingCanvas from './components/ModelingCanvas';
import EventTable from './components/EventTable';
import TableToolbar from './components/TableToolbar';
import DeploymentValidation from './components/DeploymentValidation';
import { useCacheInvalidationContext } from '@/components/providers/CacheInvalidationProvider';
import {
  useEventStore,
  createTableRenameEvent,
  createColumnRenameEvent,
  createPrimaryKeyEvent,
  createMaskingPolicyEvent
} from './stores/event-store';

// Types
interface SourceConfig {
  database: string;
  schemas: string[];
  expandedSchemas: Set<string>;
}

interface GlobalSearchResult {
  type: 'table' | 'column' | 'policy';
  name: string;
  parent?: string;
  database?: string;
  schema?: string;
}

// View modes
type ViewMode = 'catalog' | 'modeling';

// Type for masking policy display (mapped from MaskingPolicy)
interface MaskingPolicyDisplay {
  name: string;
  type: string;
}

// Bulk Actions Component
const BulkActionsBar: React.FC<{
  selectedCount: number;
  onSetPrimaryKey: () => void;
  onSetIngestionMode: (mode: IngestionMode) => void;
  onApplyMasking: () => void;
  onClearSelection: () => void;
  onConfigureRelations: () => void;
}> = ({
  selectedCount,
  onSetPrimaryKey,
  onSetIngestionMode,
  onApplyMasking,
  onClearSelection,
  onConfigureRelations,
}) => {
  const [showIngestionDropdown, setShowIngestionDropdown] = useState(false);

  if (selectedCount === 0) return null;

  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50">
      <div className="flex items-center gap-3 px-6 py-3 bg-slate-900 dark:bg-slate-800 text-white rounded-full shadow-2xl">
        <span className="font-medium">{selectedCount} tables selected</span>
        <div className="w-px h-6 bg-slate-600" />

        <Tooltip content="Define Primary Keys">
          <button
            className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-slate-700 transition-colors"
            onClick={onSetPrimaryKey}
          >
            <Key className="h-4 w-4 text-amber-400" />
            <span className="text-sm">Set PKs</span>
          </button>
        </Tooltip>

        <div className="relative">
          <Tooltip content="Configure Ingestion Mode">
            <button
              className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-slate-700 transition-colors"
              onClick={() => setShowIngestionDropdown(!showIngestionDropdown)}
            >
              <RefreshCw className="h-4 w-4 text-blue-400" />
              <span className="text-sm">Ingestion</span>
              <ChevronDown className="h-3 w-3" />
            </button>
          </Tooltip>

          {showIngestionDropdown && (
            <div className="absolute bottom-full mb-2 left-0 w-48 bg-white dark:bg-slate-800 rounded-lg shadow-xl border dark:border-slate-700 py-2">
              {[
                { value: 'full_refresh', label: 'Full Refresh', icon: RefreshCw },
                { value: 'incremental', label: 'Incremental', icon: Clock },
                { value: 'snapshot', label: 'Snapshot', icon: Layers },
                { value: 'scd_type1', label: 'SCD Type 1', icon: History },
                { value: 'scd_type2', label: 'SCD Type 2', icon: History },
              ].map((mode) => (
                <button
                  key={mode.value}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700"
                  onClick={() => {
                    onSetIngestionMode(mode.value as IngestionMode);
                    setShowIngestionDropdown(false);
                  }}
                >
                  <mode.icon className="h-4 w-4" />
                  {mode.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <Tooltip content="Apply Masking Policy">
          <button
            className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-slate-700 transition-colors"
            onClick={onApplyMasking}
          >
            <Shield className="h-4 w-4 text-green-400" />
            <span className="text-sm">Masking</span>
          </button>
        </Tooltip>

        <Tooltip content="Configure Relations">
          <button
            className="flex items-center gap-2 px-3 py-1.5 rounded-full hover:bg-slate-700 transition-colors"
            onClick={onConfigureRelations}
          >
            <GitBranch className="h-4 w-4 text-purple-400" />
            <span className="text-sm">Relations</span>
          </button>
        </Tooltip>

        <div className="w-px h-6 bg-slate-600" />

        <button
          className="p-2 rounded-full hover:bg-slate-700 transition-colors"
          onClick={onClearSelection}
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

// Compact Source Selector - Horizontal bar with schema actions
const CompactSourceSelector: React.FC<{
  databases: string[];
  selectedDatabase: string;
  onDatabaseChange: (db: string) => void;
  schemas: string[];
  selectedSchemas: Set<string>;
  onSchemaToggle: (schema: string) => void;
  onSchemaAction: (schema: string, action: string) => void;
  isLoadingDatabases: boolean;
  isLoadingSchemas: boolean;
  stats: { total: number; configured: number; pending: number };
}> = ({
  databases,
  selectedDatabase,
  onDatabaseChange,
  schemas,
  selectedSchemas,
  onSchemaToggle,
  onSchemaAction,
  isLoadingDatabases,
  isLoadingSchemas,
  stats,
}) => {
  const [showSchemaDropdown, setShowSchemaDropdown] = useState(false);
  const [schemaContextMenu, setSchemaContextMenu] = useState<{ schema: string; x: number; y: number } | null>(null);

  const schemaActions = [
    { id: 'transfer_ownership', label: 'Transfer Ownership', icon: ArrowLeftRight },
    { id: 'apply_masking_all', label: 'Apply Masking to All Tables', icon: Shield },
    { id: 'apply_rls_all', label: 'Apply RLS to All Tables', icon: Lock },
    { id: 'set_ingestion_all', label: 'Set Ingestion for All', icon: RefreshCw },
    { id: 'divider', label: '' },
    { id: 'clone_schema', label: 'Clone Schema', icon: Layers },
    { id: 'export_ddl', label: 'Export DDL', icon: Download },
    { id: 'divider2', label: '' },
    { id: 'drop_schema', label: 'Drop Schema', icon: Trash2, danger: true },
  ];

  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
      {/* Database Selector */}
      <div className="flex items-center gap-2">
        <Database className="h-4 w-4 text-slate-400" />
        {isLoadingDatabases ? (
          <RefreshCw className="h-3 w-3 animate-spin text-slate-400" />
        ) : (
          <select
            className="p-1.5 text-xs border rounded dark:bg-slate-800 dark:border-slate-700 min-w-[100px]"
            value={selectedDatabase}
            onChange={(e) => onDatabaseChange(e.target.value)}
          >
            <option value="">{databases.length === 0 ? 'No DB' : 'Select...'}</option>
            {databases.map((db) => (
              <option key={db} value={db}>{db}</option>
            ))}
          </select>
        )}
      </div>

      <span className="text-slate-300 dark:text-slate-600">/</span>

      {/* Schema Multi-Select with Context Actions */}
      {selectedDatabase && (
        <div className="relative flex-1 max-w-[300px]">
          <button
            className="w-full flex items-center justify-between gap-2 px-2 py-1.5 text-xs border rounded dark:bg-slate-800 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
            onClick={() => setShowSchemaDropdown(!showSchemaDropdown)}
          >
            <div className="flex items-center gap-2">
              <Layers className="h-3.5 w-3.5 text-slate-400" />
              <span className="truncate">
                {selectedSchemas.size > 0
                  ? selectedSchemas.size === 1
                    ? Array.from(selectedSchemas)[0]
                    : `${selectedSchemas.size} schemas`
                  : 'Select schemas'}
              </span>
            </div>
            <ChevronDown className="h-3 w-3 flex-shrink-0" />
          </button>

          {showSchemaDropdown && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowSchemaDropdown(false)} />
              <div className="absolute top-full mt-1 left-0 z-40 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg shadow-xl max-h-64 overflow-auto min-w-[200px]">
                {isLoadingSchemas ? (
                  <div className="flex items-center justify-center py-4">
                    <RefreshCw className="h-4 w-4 animate-spin text-slate-400" />
                  </div>
                ) : schemas.length === 0 ? (
                  <div className="py-2 px-3 text-xs text-slate-500">No schemas</div>
                ) : (
                  schemas.map((schema) => (
                    <div
                      key={schema}
                      className={cn(
                        'flex items-center justify-between px-3 py-2 text-xs hover:bg-slate-100 dark:hover:bg-slate-700 group',
                        selectedSchemas.has(schema) && 'bg-blue-50 dark:bg-blue-900/30'
                      )}
                    >
                      <button
                        className="flex items-center gap-2 flex-1 text-left"
                        onClick={() => onSchemaToggle(schema)}
                      >
                        {selectedSchemas.has(schema) ? (
                          <CheckSquare className="h-3.5 w-3.5 text-blue-500" />
                        ) : (
                          <Square className="h-3.5 w-3.5 text-slate-400" />
                        )}
                        <span>{schema}</span>
                      </button>
                      <button
                        className="p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-slate-200 dark:hover:bg-slate-600"
                        onClick={(e) => {
                          e.stopPropagation();
                          setSchemaContextMenu({ schema, x: e.clientX, y: e.clientY });
                          setShowSchemaDropdown(false);
                        }}
                      >
                        <Settings className="h-3 w-3 text-slate-500" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Selected schemas tags with actions */}
      {selectedSchemas.size > 0 && selectedSchemas.size <= 3 && (
        <div className="flex items-center gap-1">
          {Array.from(selectedSchemas).map((schema) => (
            <div
              key={schema}
              className="flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs group"
            >
              <span>{schema}</span>
              <button
                className="p-0.5 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
                onClick={(e) => {
                  e.stopPropagation();
                  setSchemaContextMenu({ schema, x: e.clientX, y: e.clientY });
                }}
              >
                <Settings className="h-3 w-3" />
              </button>
              <button
                className="p-0.5 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
                onClick={() => onSchemaToggle(schema)}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Stats badges */}
      <div className="flex items-center gap-2 ml-auto text-xs">
        <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 text-[10px] px-1.5">
          {stats.total} tables
        </Badge>
        {stats.configured > 0 && (
          <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[10px] px-1.5">
            {stats.configured} ok
          </Badge>
        )}
      </div>

      {/* Schema Context Menu */}
      {schemaContextMenu && (
        <>
          <div className="fixed inset-0 z-50" onClick={() => setSchemaContextMenu(null)} />
          <div
            className="fixed z-50 bg-white dark:bg-slate-800 rounded-lg shadow-xl border dark:border-slate-700 py-1 min-w-[220px]"
            style={{ left: schemaContextMenu.x, top: schemaContextMenu.y }}
          >
            <div className="px-3 py-2 border-b dark:border-slate-700">
              <span className="text-xs font-medium text-slate-500">Schema: {schemaContextMenu.schema}</span>
            </div>
            {schemaActions.map((action) =>
              action.id.startsWith('divider') ? (
                <div key={action.id} className="my-1 border-t dark:border-slate-700" />
              ) : (
                <button
                  key={action.id}
                  className={cn(
                    'w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-100 dark:hover:bg-slate-700',
                    action.danger && 'text-red-600 dark:text-red-400'
                  )}
                  onClick={() => {
                    onSchemaAction(schemaContextMenu.schema, action.id);
                    setSchemaContextMenu(null);
                  }}
                >
                  {action.icon && <action.icon className="h-4 w-4" />}
                  {action.label}
                </button>
              )
            )}
          </div>
        </>
      )}
    </div>
  );
};

// Global Search Component
const GlobalSearch: React.FC<{
  value: string;
  onChange: (value: string) => void;
  results?: GlobalSearchResult[];
  onResultClick?: (result: GlobalSearchResult) => void;
}> = ({ value, onChange, results = [], onResultClick }) => {
  const [isFocused, setIsFocused] = useState(false);
  const showResults = isFocused && value.length > 0 && results.length > 0;

  return (
    <div className="relative flex-1 max-w-md">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
        <input
          type="text"
          placeholder="Search tables, columns..."
          className="w-full pl-8 pr-3 py-1.5 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-transparent"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
        />
        {value && (
          <button
            className="absolute right-2 top-1/2 transform -translate-y-1/2"
            onClick={() => onChange('')}
          >
            <X className="h-3.5 w-3.5 text-slate-400 hover:text-slate-600" />
          </button>
        )}
      </div>

      {/* Search Results Dropdown */}
      {showResults && (
        <div className="absolute top-full mt-2 w-full bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg shadow-xl max-h-96 overflow-auto z-50">
          {results.map((result, idx) => (
            <button
              key={`${result.type}-${result.name}-${idx}`}
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700 text-left border-b dark:border-slate-700 last:border-0"
              onClick={() => onResultClick?.(result)}
            >
              {result.type === 'table' && <Table2 className="h-4 w-4 text-blue-500" />}
              {result.type === 'column' && <Columns3 className="h-4 w-4 text-green-500" />}
              {result.type === 'policy' && <Shield className="h-4 w-4 text-amber-500" />}
              <div>
                <p className="font-medium">{result.name}</p>
                {result.parent && (
                  <p className="text-xs text-slate-500">{result.parent}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// Main Page Component
export default function ExploreDesignPage() {
  const router = useRouter();

  // Connection status from SSE provider
  const { isConnected, error: connectionError } = useCacheInvalidationContext();

  // State
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState<string>('');
  const [schemas, setSchemas] = useState<string[]>([]);
  const [selectedSchemas, setSelectedSchemas] = useState<Set<string>>(new Set());
  const [tables, setTables] = useState<TableItem[]>([]);
  const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set());
  const [expandedSchemas, setExpandedSchemas] = useState<Set<string>>(new Set());
  const [selectedTable, setSelectedTable] = useState<TableItem | null>(null);
  const [tableColumns, setTableColumns] = useState<ColumnInfo[]>([]);
  const [tableColumnsMap, setTableColumnsMap] = useState<Map<string, ColumnInfo[]>>(new Map());
  const [tableConfig, setTableConfig] = useState<TableConfig | null>(null);
  const [allTableConfigs, setAllTableConfigs] = useState<Map<string, TableConfig>>(new Map());

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<GlobalSearchResult[]>([]);

  const [isLoadingDatabases, setIsLoadingDatabases] = useState(false);
  const [isLoadingSchemas, setIsLoadingSchemas] = useState(false);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [isLoadingColumns, setIsLoadingColumns] = useState(false);
  const [isLoadingPolicies, setIsLoadingPolicies] = useState(false);

  // Masking policies from API
  const [maskingPolicies, setMaskingPolicies] = useState<MaskingPolicyDisplay[]>([]);

  // Check if offline and redirect to sign-in
  const isOffline = !isConnected && !!connectionError;

  const [showBulkPKModal, setShowBulkPKModal] = useState(false);
  const [showBulkMaskingModal, setShowBulkMaskingModal] = useState(false);
  const [showRelationsModal, setShowRelationsModal] = useState(false);
  const [showDeploymentModal, setShowDeploymentModal] = useState(false);

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('catalog');
  const [showEventPanel, setShowEventPanel] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showDetailPanel, setShowDetailPanel] = useState(true);
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Event store
  const { events, pendingEvents, undoEvent, redoEvent, canUndo, canRedo, cleanupEmptyEvents, addEvent } = useEventStore();

  // Clean up empty events on mount (one-time cleanup of any legacy empty events)
  useEffect(() => {
    const removedCount = cleanupEmptyEvents();
    if (removedCount > 0) {
      console.log(`[Explore-Design] Cleaned up ${removedCount} empty events from localStorage`);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stats
  const stats = useMemo(() => {
    const configured = tables.filter(t => t.status === 'configured').length;
    return {
      total: tables.length,
      configured,
      pending: tables.length - configured,
    };
  }, [tables]);

  // Redirect to sign-in when offline
  useEffect(() => {
    if (isOffline && connectionError?.includes('session expired')) {
      toast.error('Connection lost. Redirecting to sign-in...');
      router.push('/signin?error=sync_offline');
    }
  }, [isOffline, connectionError, router]);

  // Load databases on mount (only when connected)
  useEffect(() => {
    const loadDatabases = async () => {
      // Don't load if offline
      if (isOffline) {
        console.log('[Explore-Design] Skipping database load - offline');
        return;
      }

      console.log('[Explore-Design] Starting to load databases...');
      setIsLoadingDatabases(true);
      try {
        const dbList = await getDatabases();
        console.log('[Explore-Design] Databases loaded:', dbList);
        setDatabases(dbList || []);
      } catch (error: any) {
        console.error('[Explore-Design] Failed to load databases:', error);
        // Check if it's an auth error
        if (error.message?.includes('session') || error.message?.includes('log in')) {
          toast.error('Session expired. Please sign in again.');
          router.push('/signin?error=session_expired');
        } else {
          toast.error('Failed to load databases. Check your connection.');
        }
      } finally {
        setIsLoadingDatabases(false);
      }
    };
    loadDatabases();
  }, [isOffline, router]);

  // Load masking policies on mount
  useEffect(() => {
    const loadMaskingPolicies = async () => {
      console.log('[Explore-Design] Starting to load masking policies...');
      setIsLoadingPolicies(true);
      try {
        const policies = await getMaskingPolicies();
        console.log('[Explore-Design] Masking policies loaded:', policies);
        // Map to display format
        const displayPolicies: MaskingPolicyDisplay[] = (policies || []).map(p => ({
          name: p.policy_name,
          type: p.masking_type || p.data_type || 'Unknown',
        }));
        setMaskingPolicies(displayPolicies);
      } catch (error) {
        console.error('[Explore-Design] Failed to load masking policies:', error);
        // Don't show error toast for policies - they're optional
      } finally {
        setIsLoadingPolicies(false);
      }
    };
    loadMaskingPolicies();
  }, []);

  // Load schemas when database changes
  useEffect(() => {
    if (!selectedDatabase) {
      setSchemas([]);
      return;
    }

    const loadSchemas = async () => {
      console.log('[Explore-Design] Loading schemas for database:', selectedDatabase);
      setIsLoadingSchemas(true);
      try {
        const schemaList = await getSchemas(selectedDatabase);
        console.log('[Explore-Design] Schemas loaded:', schemaList);
        setSchemas(schemaList || []);
      } catch (error) {
        console.error('[Explore-Design] Failed to load schemas:', error);
        toast.error('Failed to load schemas');
      } finally {
        setIsLoadingSchemas(false);
      }
    };
    loadSchemas();
  }, [selectedDatabase]);

  // Load tables when schemas are selected
  useEffect(() => {
    if (selectedSchemas.size === 0) {
      setTables([]);
      return;
    }

    const loadTables = async () => {
      console.log('[Explore-Design] Loading tables for schemas:', Array.from(selectedSchemas));
      setIsLoadingTables(true);
      try {
        const allTables: TableItem[] = [];

        for (const schema of Array.from(selectedSchemas)) {
          console.log(`[Explore-Design] Fetching tables for ${selectedDatabase}.${schema}`);
          const tableList = await getTables(selectedDatabase, schema);
          console.log(`[Explore-Design] Tables for ${schema}:`, tableList);
          if (tableList) {
            tableList.forEach((tableName: string) => {
              const tableId = `${selectedDatabase}.${schema}.${tableName}`;
              const existingConfig = allTableConfigs.get(tableId);

              allTables.push({
                id: tableId,
                database: selectedDatabase,
                schema,
                table: tableName,
                columnCount: 0,
                hasPrimaryKey: existingConfig?.primaryKeys?.length ? true : false,
                status: existingConfig ? 'configured' : 'pending',
                sensitiveColumns: existingConfig?.sensitive?.length || 0,
              });
            });
          }
        }

        setTables(allTables);
        setExpandedSchemas(new Set(selectedSchemas));
      } catch (error) {
        toast.error('Failed to load tables');
      } finally {
        setIsLoadingTables(false);
      }
    };
    loadTables();
  }, [selectedDatabase, selectedSchemas, allTableConfigs]);

  // Load columns when a table is selected
  useEffect(() => {
    if (!selectedTable) {
      setTableColumns([]);
      setTableConfig(null);
      return;
    }

    const loadColumns = async () => {
      setIsLoadingColumns(true);
      try {
        const columns = await getTableColumns(
          selectedTable.database,
          selectedTable.schema,
          selectedTable.table
        );

        if (columns) {
          const formattedColumns: ColumnInfo[] = columns.map((col: any) => ({
            name: col.name || col.COLUMN_NAME || 'unknown',
            dataType: col.type || col.DATA_TYPE || col.data_type || 'VARCHAR',
            isPrimaryKey: col.is_primary_key || col.CONSTRAINT_TYPE === 'PRIMARY KEY',
            isNullable: col.is_nullable !== 'NO',
            isSensitive: detectSensitiveColumn(col.name || col.COLUMN_NAME || ''),
          }));
          setTableColumns(formattedColumns);

          // Update columns map for modeling view
          setTableColumnsMap(prev => {
            const next = new Map(prev);
            next.set(selectedTable.id, formattedColumns);
            return next;
          });

          // Load or create config for this table
          const existingConfig = allTableConfigs.get(selectedTable.id);
          setTableConfig(existingConfig || {
            tableId: selectedTable.id,
            ingestion: { mode: 'full_refresh' },
            masking: [],
            primaryKeys: formattedColumns.filter(c => c.isPrimaryKey).map(c => c.name),
            nullable: formattedColumns.filter(c => c.isNullable).map(c => c.name),
            sensitive: formattedColumns.filter(c => c.isSensitive).map(c => c.name),
          });
        }
      } catch (error) {
        toast.error('Failed to load columns');
      } finally {
        setIsLoadingColumns(false);
      }
    };
    loadColumns();
  }, [selectedTable, allTableConfigs]);

  // Detect sensitive columns by name patterns
  const detectSensitiveColumn = (name: string): boolean => {
    const sensitivePatterns = [
      /email/i, /ssn/i, /social.*security/i, /password/i, /pwd/i,
      /credit.*card/i, /card.*number/i, /phone/i, /mobile/i,
      /address/i, /dob/i, /birth.*date/i, /salary/i, /income/i,
      /account.*number/i, /routing/i, /tax.*id/i, /passport/i,
    ];
    return sensitivePatterns.some(pattern => pattern.test(name));
  };

  // Search functionality
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const query = searchQuery.toLowerCase();
    const results: GlobalSearchResult[] = [];

    tables.forEach(table => {
      if (table.table.toLowerCase().includes(query)) {
        results.push({
          type: 'table',
          name: table.table,
          parent: `${table.database}.${table.schema}`,
          database: table.database,
          schema: table.schema,
        });
      }
    });

    tableColumns.forEach(col => {
      if (col.name.toLowerCase().includes(query)) {
        results.push({
          type: 'column',
          name: col.name,
          parent: selectedTable?.table,
        });
      }
    });

    maskingPolicies.forEach(policy => {
      if (policy.name.toLowerCase().includes(query)) {
        results.push({
          type: 'policy',
          name: policy.name,
          parent: policy.type,
        });
      }
    });

    setSearchResults(results.slice(0, 20));
  }, [searchQuery, tables, tableColumns, selectedTable, maskingPolicies]);

  // Handlers
  const handleSchemaToggle = useCallback((schema: string) => {
    setSelectedSchemas(prev => {
      const next = new Set(prev);
      if (next.has(schema)) {
        next.delete(schema);
      } else {
        next.add(schema);
      }
      return next;
    });
  }, []);

  const handleTableSelection = useCallback((tableId: string, selected: boolean) => {
    setSelectedTables(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(tableId);
      } else {
        next.delete(tableId);
      }
      return next;
    });
  }, []);

  const handleSelectAllTables = useCallback((tableIds: string[], selected: boolean) => {
    setSelectedTables(prev => {
      const next = new Set(prev);
      tableIds.forEach(id => {
        if (selected) {
          next.add(id);
        } else {
          next.delete(id);
        }
      });
      return next;
    });
  }, []);

  const handleSchemaExpand = useCallback((schema: string) => {
    setExpandedSchemas(prev => {
      const next = new Set(prev);
      if (next.has(schema)) {
        next.delete(schema);
      } else {
        next.add(schema);
      }
      return next;
    });
  }, []);

  const handleTableClick = useCallback((table: TableItem) => {
    setSelectedTable(table);
    setSelectedColumns(new Set());
  }, []);

  const handleConfigChange = useCallback((configUpdate: Partial<TableConfig>) => {
    if (!selectedTable) return;

    setTableConfig(prev => {
      if (!prev) return null;
      const updated = { ...prev, ...configUpdate };

      setAllTableConfigs(prevConfigs => {
        const next = new Map(prevConfigs);
        next.set(selectedTable.id, updated);
        return next;
      });

      setTables(prevTables => prevTables.map(t =>
        t.id === selectedTable.id
          ? { ...t, status: 'configured' as const, hasPrimaryKey: (updated.primaryKeys?.length || 0) > 0 }
          : t
      ));

      return updated;
    });
  }, [selectedTable]);

  const handleBulkIngestionMode = useCallback((mode: IngestionMode) => {
    selectedTables.forEach(tableId => {
      const existing = allTableConfigs.get(tableId);
      const updated: TableConfig = {
        tableId,
        ingestion: { mode },
        masking: existing?.masking || [],
        primaryKeys: existing?.primaryKeys || [],
        nullable: existing?.nullable || [],
        sensitive: existing?.sensitive || [],
      };
      setAllTableConfigs(prev => {
        const next = new Map(prev);
        next.set(tableId, updated);
        return next;
      });
    });

    setTables(prev => prev.map(t =>
      selectedTables.has(t.id) ? { ...t, status: 'configured' as const } : t
    ));

    toast.success(`Applied ${mode.replace('_', ' ')} to ${selectedTables.size} tables`);
    setSelectedTables(new Set());
  }, [selectedTables, allTableConfigs]);

  const handleSearchResultClick = useCallback((result: GlobalSearchResult) => {
    if (result.type === 'table' && result.database && result.schema) {
      const table = tables.find(t => t.table === result.name && t.schema === result.schema);
      if (table) {
        setSelectedTable(table);
      }
    }
    setSearchQuery('');
  }, [tables]);

  const handleColumnSelect = useCallback((column: string, selected: boolean) => {
    setSelectedColumns(prev => {
      const next = new Set(prev);
      if (selected) {
        next.add(column);
      } else {
        next.delete(column);
      }
      return next;
    });
  }, []);

  // Schema action handler
  const handleSchemaAction = useCallback((schema: string, action: string) => {
    switch (action) {
      case 'transfer_ownership':
        toast.loading(`Transferring ownership for schema ${schema}...`);
        // TODO: Implement transfer ownership API call
        setTimeout(() => {
          toast.dismiss();
          toast.success(`Ownership transfer initiated for ${schema}`);
        }, 1000);
        break;
      case 'apply_masking_all':
        toast.loading(`Applying masking to all tables in ${schema}...`);
        setTimeout(() => {
          toast.dismiss();
          toast.success(`Masking policies applied to ${schema}`);
        }, 1000);
        break;
      case 'apply_rls_all':
        toast.loading(`Applying RLS to all tables in ${schema}...`);
        setTimeout(() => {
          toast.dismiss();
          toast.success(`RLS policies applied to ${schema}`);
        }, 1000);
        break;
      case 'set_ingestion_all':
        toast.loading(`Configuring ingestion for ${schema}...`);
        setTimeout(() => {
          toast.dismiss();
          toast.success(`Ingestion configured for ${schema}`);
        }, 1000);
        break;
      case 'clone_schema':
        toast.success(`Schema ${schema} clone queued`);
        break;
      case 'export_ddl':
        toast.success(`Exporting DDL for ${schema}...`);
        break;
      case 'drop_schema':
        if (confirm(`Are you sure you want to drop schema ${schema}? This action cannot be undone.`)) {
          toast.error(`Drop schema ${schema} - operation queued`);
        }
        break;
      default:
        toast.error(`Unknown action: ${action}`);
    }
  }, []);

  // Toggle fullscreen mode
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => {
      if (!prev) {
        // Entering fullscreen - hide all panels
        setShowSidebar(false);
        setShowDetailPanel(false);
        setShowEventPanel(false);
      }
      return !prev;
    });
  }, []);

  // Exit fullscreen and restore panels
  const exitFullscreen = useCallback(() => {
    setIsFullscreen(false);
    setShowSidebar(true);
    setShowDetailPanel(true);
    setShowEventPanel(true);
  }, []);

  return (
    <div className={cn(
      "flex flex-col",
      isFullscreen ? "h-screen" : "h-[calc(100vh-80px)]"
    )}>
      {/* Offline Warning Banner */}
      {isOffline && (
        <div className="px-4 py-3 bg-red-50 dark:bg-red-900/30 border-b border-red-200 dark:border-red-800">
          <div className="flex items-center gap-3">
            <WifiOff className="h-5 w-5 text-red-500 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                Connection Lost - Sync Offline
              </p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                You are not connected to Snowflake. Data shown may be cached. Please sign in again.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push('/signin?error=sync_offline')}
              className="text-xs border-red-300 text-red-700 hover:bg-red-100"
            >
              Sign In
            </Button>
          </div>
        </div>
      )}

      {/* Header - Compact (hidden in fullscreen) */}
      {!isFullscreen && (
      <div className="px-3 lg:px-4 py-2 border-b dark:border-slate-800 bg-white dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <div className="min-w-0 flex items-center gap-2">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              Explore & Design
              <Badge className="bg-blue-100 text-blue-600 text-[10px] px-1.5 py-0">NEW</Badge>
            </h1>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 lg:gap-2">
            {/* View Mode Toggle */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 rounded p-0.5">
              <button
                className={cn(
                  'px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1',
                  viewMode === 'catalog'
                    ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white'
                    : 'text-slate-500 hover:text-slate-700'
                )}
                onClick={() => setViewMode('catalog')}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Catalog
              </button>
              <button
                className={cn(
                  'px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1',
                  viewMode === 'modeling'
                    ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white'
                    : 'text-slate-500 hover:text-slate-700'
                )}
                onClick={() => setViewMode('modeling')}
              >
                <Workflow className="h-3.5 w-3.5" />
                Modeling
              </button>
            </div>

            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700" />

            {/* Undo/Redo */}
            <Tooltip content="Undo">
              <Button
                variant="outline"
                size="sm"
                onClick={() => undoEvent()}
                disabled={!canUndo}
                className="p-1.5"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
            <Tooltip content="Redo">
              <Button
                variant="outline"
                size="sm"
                onClick={() => redoEvent()}
                disabled={!canRedo}
                className="p-1.5"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>

            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700" />

            {/* Refresh Data Button */}
            <Tooltip content="Refresh data">
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  if (!selectedDatabase) return;
                  toast.loading('Refreshing...');
                  setIsLoadingSchemas(true);
                  setIsLoadingTables(true);
                  try {
                    const schemaList = await getSchemas(selectedDatabase);
                    setSchemas(schemaList || []);
                    toast.dismiss();
                    toast.success('Refreshed');
                  } catch {
                    toast.dismiss();
                    toast.error('Failed');
                  } finally {
                    setIsLoadingSchemas(false);
                  }
                }}
                className="p-1.5"
                disabled={!selectedDatabase || isLoadingSchemas || isLoadingTables}
              >
                <RefreshCw className={cn('h-3.5 w-3.5', (isLoadingSchemas || isLoadingTables) && 'animate-spin')} />
              </Button>
            </Tooltip>

            <Button variant="outline" size="sm" className="gap-1 hidden lg:flex px-2 py-1">
              <Upload className="h-3.5 w-3.5" />
              <span className="hidden xl:inline text-xs">Import</span>
            </Button>
            <Button variant="outline" size="sm" className="gap-1 hidden lg:flex px-2 py-1">
              <Download className="h-3.5 w-3.5" />
              <span className="hidden xl:inline text-xs">Export</span>
            </Button>

            {/* Deploy Button */}
            <Button
              size="sm"
              className="gap-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 px-2.5 py-1"
              onClick={() => setShowDeploymentModal(true)}
              disabled={pendingEvents.length === 0}
            >
              <Rocket className="h-3.5 w-3.5" />
              <span className="text-xs">Deploy</span>
              {pendingEvents.length > 0 && (
                <Badge className="bg-white/20 text-white text-[10px] px-1 py-0">{pendingEvents.length}</Badge>
              )}
            </Button>
          </div>
        </div>

        {/* Search and Filters - Compact */}
        <div className="flex flex-wrap items-center gap-1.5 lg:gap-2">
          <GlobalSearch
            value={searchQuery}
            onChange={setSearchQuery}
            results={searchResults}
            onResultClick={handleSearchResultClick}
          />
          <Button variant="outline" size="sm" className="gap-1 hidden sm:flex px-2 py-1">
            <Filter className="h-3.5 w-3.5" />
            <span className="hidden md:inline text-xs">Filters</span>
          </Button>

          {/* Panel visibility toggles */}
          <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded p-0.5">
            <Tooltip content={showSidebar ? 'Hide Sources' : 'Show Sources'}>
              <button
                onClick={() => setShowSidebar(!showSidebar)}
                className={cn(
                  'p-1 rounded transition-colors',
                  showSidebar
                    ? 'bg-white dark:bg-slate-700 shadow text-blue-600'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                <PanelLeft className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            <Tooltip content={showDetailPanel ? 'Hide Details' : 'Show Details'}>
              <button
                onClick={() => setShowDetailPanel(!showDetailPanel)}
                className={cn(
                  'p-1 rounded transition-colors',
                  showDetailPanel
                    ? 'bg-white dark:bg-slate-700 shadow text-blue-600'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                <Table2 className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
            <Tooltip content={showEventPanel ? 'Hide Events' : 'Show Events'}>
              <button
                onClick={() => setShowEventPanel(!showEventPanel)}
                className={cn(
                  'p-1 rounded transition-colors',
                  showEventPanel
                    ? 'bg-white dark:bg-slate-700 shadow text-blue-600'
                    : 'text-slate-500 hover:text-slate-700'
                )}
              >
                <PanelRight className="h-3.5 w-3.5" />
              </button>
            </Tooltip>
          </div>
        </div>
      </div>
      )}

      {/* Compact Source Selector - Horizontal bar */}
      {!isFullscreen && (
        <CompactSourceSelector
          databases={databases}
          selectedDatabase={selectedDatabase}
          onDatabaseChange={setSelectedDatabase}
          schemas={schemas}
          selectedSchemas={selectedSchemas}
          onSchemaToggle={handleSchemaToggle}
          onSchemaAction={handleSchemaAction}
          isLoadingDatabases={isLoadingDatabases}
          isLoadingSchemas={isLoadingSchemas}
          stats={stats}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* LEFT Panel - Tables List (collapsible) */}
        {showSidebar && viewMode === 'catalog' && (
          <div className="w-64 lg:w-72 xl:w-80 border-r dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col overflow-hidden flex-shrink-0">
            {/* Table List Header */}
            <div className="px-3 py-2 border-b dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Table2 className="h-4 w-4 text-slate-500" />
                <span className="font-medium text-sm">{tables.length} Tables</span>
                {selectedTables.size > 0 && (
                  <Badge className="bg-blue-100 text-blue-700 text-xs px-1.5">
                    {selectedTables.size}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-1">
                <Tooltip content={selectedTables.size === tables.length ? 'Deselect All' : 'Select All'}>
                  <button
                    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                    onClick={() => {
                      if (selectedTables.size === tables.length) {
                        setSelectedTables(new Set());
                      } else {
                        setSelectedTables(new Set(tables.map(t => t.id)));
                      }
                    }}
                  >
                    {selectedTables.size === tables.length ? (
                      <CheckSquare className="h-4 w-4 text-blue-500" />
                    ) : (
                      <Square className="h-4 w-4 text-slate-400" />
                    )}
                  </button>
                </Tooltip>
                <Tooltip content="Hide Tables Panel">
                  <button
                    className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                    onClick={() => setShowSidebar(false)}
                  >
                    <PanelLeft className="h-4 w-4 text-slate-400" />
                  </button>
                </Tooltip>
              </div>
            </div>

            {/* Virtualized Table List */}
            <div className="flex-1 overflow-hidden">
              {isLoadingTables ? (
                <div className="flex items-center justify-center h-full">
                  <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : tables.length > 0 ? (
                <VirtualizedTableList
                  tables={tables}
                  selectedTables={selectedTables}
                  onSelectionChange={handleTableSelection}
                  onSelectAll={handleSelectAllTables}
                  onTableClick={handleTableClick}
                  expandedSchemas={expandedSchemas}
                  onSchemaToggle={handleSchemaExpand}
                  searchQuery={searchQuery}
                  className="h-full"
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 p-4">
                  <Database className="h-10 w-10 mb-3 text-slate-300" />
                  <p className="font-medium text-sm">No tables</p>
                  <p className="text-xs mt-1 text-center">Select a database and schema above</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CENTER Panel - Catalog or Modeling View */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {viewMode === 'catalog' ? (
            // Catalog View - Table Details in CENTER
            <div className="flex-1 flex flex-col overflow-hidden min-w-0 bg-slate-50 dark:bg-slate-900/50">
              {/* Show sidebar toggle when hidden */}
              {!showSidebar && (
                <div className="px-3 py-2 border-b dark:border-slate-800 bg-white dark:bg-slate-900">
                  <Tooltip content="Show Tables Panel">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowSidebar(true)}
                      className="gap-2"
                    >
                      <PanelLeft className="h-4 w-4" />
                      <span className="text-xs">Show Tables ({tables.length})</span>
                    </Button>
                  </Tooltip>
                </div>
              )}

              {/* Table Detail Panel - Now in CENTER */}
              <div className="flex-1 overflow-auto">
                {selectedTable ? (
                  <div className="p-4 max-w-4xl mx-auto">
                    {/* Table Header with Name & Status */}
                    <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border dark:border-slate-800 mb-4">
                      <div className="px-5 py-4 border-b dark:border-slate-800">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                              <Table2 className="h-5 w-5 text-blue-600" />
                            </div>
                            <div>
                              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                                {selectedTable.table}
                              </h2>
                              <p className="text-sm text-slate-500">
                                {selectedTable.database}.{selectedTable.schema}
                              </p>
                            </div>
                          </div>
                          <Badge className={cn(
                            'px-2.5 py-1',
                            selectedTable.status === 'configured'
                              ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          )}>
                            {selectedTable.status}
                          </Badge>
                        </div>
                      </div>

                      {/* Quick Actions Grid */}
                      <div className="px-5 py-4">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                          <button
                            className="flex flex-col items-center gap-2 p-3 rounded-lg border dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            onClick={() => {
                              const newName = prompt('Enter new table name:', selectedTable.table);
                              if (newName && newName !== selectedTable.table) {
                                const target = {
                                  database: selectedTable.database,
                                  schema: selectedTable.schema,
                                  table: selectedTable.table,
                                };
                                addEvent(createTableRenameEvent(target, selectedTable.table, newName));
                                toast.success(`Table rename queued: ${selectedTable.table} → ${newName}`);
                              }
                            }}
                          >
                            <FileText className="h-5 w-5 text-slate-600 dark:text-slate-400" />
                            <span className="text-xs font-medium">Rename</span>
                          </button>
                          <button
                            className="flex flex-col items-center gap-2 p-3 rounded-lg border dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            onClick={() => toast.success('Ingestion configuration opened')}
                          >
                            <RefreshCw className="h-5 w-5 text-blue-500" />
                            <span className="text-xs font-medium">Ingestion</span>
                          </button>
                          <button
                            className="flex flex-col items-center gap-2 p-3 rounded-lg border dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            onClick={() => toast.success('Masking configuration opened')}
                          >
                            <Shield className="h-5 w-5 text-green-500" />
                            <span className="text-xs font-medium">Masking</span>
                          </button>
                          <button
                            className="flex flex-col items-center gap-2 p-3 rounded-lg border dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            onClick={() => toast.success('Aggregation configuration opened')}
                          >
                            <Layers className="h-5 w-5 text-purple-500" />
                            <span className="text-xs font-medium">Aggregation</span>
                          </button>
                          <button
                            className="flex flex-col items-center gap-2 p-3 rounded-lg border dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            onClick={() => setShowBulkPKModal(true)}
                          >
                            <Key className="h-5 w-5 text-amber-500" />
                            <span className="text-xs font-medium">Primary Key</span>
                          </button>
                          <button
                            className="flex flex-col items-center gap-2 p-3 rounded-lg border dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            onClick={() => toast.success('Column naming rules opened')}
                          >
                            <Columns3 className="h-5 w-5 text-slate-500" />
                            <span className="text-xs font-medium">Column Names</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Columns Section */}
                    <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border dark:border-slate-800">
                      <div className="px-5 py-3 border-b dark:border-slate-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Columns3 className="h-4 w-4 text-slate-500" />
                          <span className="font-medium">{tableColumns.length} Columns</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" className="gap-1 text-xs">
                            <Plus className="h-3.5 w-3.5" />
                            Add Column
                          </Button>
                        </div>
                      </div>

                      {/* Column List */}
                      <div className="divide-y dark:divide-slate-800">
                        {isLoadingColumns ? (
                          <div className="flex items-center justify-center py-8">
                            <RefreshCw className="h-5 w-5 animate-spin text-slate-400" />
                          </div>
                        ) : tableColumns.length > 0 ? (
                          tableColumns.map((col, idx) => (
                            <div
                              key={col.name}
                              className="px-5 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 group"
                            >
                              <div className="flex items-center gap-3">
                                <div className="flex items-center gap-2 min-w-[200px]">
                                  {col.isPrimaryKey && (
                                    <Key className="h-4 w-4 text-amber-500 flex-shrink-0" />
                                  )}
                                  {col.isSensitive && !col.isPrimaryKey && (
                                    <Shield className="h-4 w-4 text-red-500 flex-shrink-0" />
                                  )}
                                  {!col.isPrimaryKey && !col.isSensitive && (
                                    <div className="w-4" />
                                  )}
                                  <span className="font-mono text-sm">{col.name}</span>
                                </div>
                                <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 text-xs font-mono">
                                  {col.dataType}
                                </Badge>
                                {!col.isNullable && (
                                  <Badge className="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-xs">
                                    NOT NULL
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Tooltip content={col.isPrimaryKey ? "Remove Primary Key" : "Set as Primary Key"}>
                                  <button
                                    className={cn(
                                      "p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700",
                                      col.isPrimaryKey && "bg-amber-100 dark:bg-amber-900/30"
                                    )}
                                    onClick={() => {
                                      if (!selectedTable) return;
                                      const target = {
                                        database: selectedTable.database,
                                        schema: selectedTable.schema,
                                        table: selectedTable.table,
                                      };
                                      addEvent(createPrimaryKeyEvent(target, [col.name], !col.isPrimaryKey));
                                      toast.success(col.isPrimaryKey
                                        ? `Removed ${col.name} from primary key`
                                        : `Set ${col.name} as primary key`
                                      );
                                    }}
                                  >
                                    <Key className={cn("h-4 w-4", col.isPrimaryKey ? "text-amber-500" : "text-slate-400 hover:text-amber-500")} />
                                  </button>
                                </Tooltip>
                                <Tooltip content="Apply Masking Policy">
                                  <button
                                    className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                                    onClick={() => {
                                      if (!selectedTable) return;
                                      // Show masking policy selection
                                      const policyName = maskingPolicies.length > 0
                                        ? maskingPolicies[0].name
                                        : 'default_mask';
                                      const target = {
                                        database: selectedTable.database,
                                        schema: selectedTable.schema,
                                        table: selectedTable.table,
                                      };
                                      addEvent(createMaskingPolicyEvent(target, policyName, [col.name], true));
                                      toast.success(`Applied masking policy to ${col.name}`);
                                    }}
                                  >
                                    <Shield className="h-4 w-4 text-slate-400 hover:text-green-500" />
                                  </button>
                                </Tooltip>
                                <Tooltip content="Rename Column">
                                  <button
                                    className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                                    onClick={() => {
                                      if (!selectedTable) return;
                                      const newName = prompt(`Rename column "${col.name}" to:`, col.name);
                                      if (newName && newName !== col.name) {
                                        const target = {
                                          database: selectedTable.database,
                                          schema: selectedTable.schema,
                                          table: selectedTable.table,
                                        };
                                        addEvent(createColumnRenameEvent(target, col.name, newName));
                                        toast.success(`Column renamed: ${col.name} → ${newName}`);
                                      }
                                    }}
                                  >
                                    <FileText className="h-4 w-4 text-slate-400 hover:text-blue-500" />
                                  </button>
                                </Tooltip>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="py-8 text-center text-slate-500">
                            <Columns3 className="h-8 w-8 mx-auto mb-2 text-slate-300" />
                            <p className="text-sm">No columns loaded</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500">
                    <Table2 className="h-16 w-16 mb-4 text-slate-300" />
                    <p className="font-medium text-lg">Select a table</p>
                    <p className="text-sm mt-1">Choose a table from the list to view and edit columns</p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            // Modeling View
            <div className="flex-1 overflow-hidden relative">
              {/* Fullscreen Controls */}
              <div className={cn(
                "absolute top-3 right-3 z-20 flex items-center gap-2",
                isFullscreen && "top-16"
              )}>
                <Tooltip content={isFullscreen ? "Exit Fullscreen" : "Fullscreen Mode"}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={isFullscreen ? exitFullscreen : toggleFullscreen}
                    className="bg-white dark:bg-slate-800 shadow-lg"
                  >
                    {isFullscreen ? (
                      <Minimize2 className="h-4 w-4" />
                    ) : (
                      <Maximize2 className="h-4 w-4" />
                    )}
                  </Button>
                </Tooltip>
                {!isFullscreen && (
                  <>
                    <Tooltip content={showSidebar ? "Hide Tables List" : "Show Tables List"}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowSidebar(!showSidebar)}
                        className={cn(
                          "bg-white dark:bg-slate-800 shadow-lg",
                          !showSidebar && "text-blue-600"
                        )}
                      >
                        <PanelLeft className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                    <Tooltip content={showEventPanel ? "Hide Events" : "Show Events"}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setShowEventPanel(!showEventPanel)}
                        className={cn(
                          "bg-white dark:bg-slate-800 shadow-lg",
                          !showEventPanel && "text-blue-600"
                        )}
                      >
                        <PanelRight className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                  </>
                )}
              </div>

              {/* Fullscreen Header */}
              {isFullscreen && (
                <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                      <Workflow className="h-5 w-5 text-blue-600" />
                      Data Modeling
                    </h2>
                    <Badge className="bg-blue-100 text-blue-600 text-xs">
                      {tables.length} tables
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Tooltip content="Undo">
                      <Button variant="outline" size="sm" onClick={() => undoEvent()} disabled={!canUndo}>
                        <Undo2 className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                    <Tooltip content="Redo">
                      <Button variant="outline" size="sm" onClick={() => redoEvent()} disabled={!canRedo}>
                        <Redo2 className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                    <div className="w-px h-6 bg-slate-200 dark:bg-slate-700" />
                    <Button
                      size="sm"
                      className="gap-1 bg-gradient-to-r from-blue-600 to-indigo-600"
                      onClick={() => setShowDeploymentModal(true)}
                      disabled={pendingEvents.length === 0}
                    >
                      <Rocket className="h-4 w-4" />
                      Deploy
                      {pendingEvents.length > 0 && (
                        <Badge className="bg-white/20 text-white text-xs px-1">{pendingEvents.length}</Badge>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              <ModelingCanvas
                tables={tables}
                tableColumns={tableColumnsMap}
                onTableSelect={handleTableClick}
                onRelationCreate={(source, target, sourceCol, targetCol) => {
                  toast.success('Relation created');
                }}
                className={cn("h-full", isFullscreen && "pt-14")}
              />
            </div>
          )}
        </div>

        {/* Right Event Panel (collapsible) - hidden in fullscreen */}
        {showEventPanel && !isFullscreen && (
          <div className="w-44 lg:w-52 xl:w-60 border-l dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 overflow-hidden flex flex-col flex-shrink-0">
            <EventTable compact className="flex-1 m-1.5 overflow-hidden" />
          </div>
        )}
      </div>

      {/* Bulk Actions Bar */}
      <BulkActionsBar
        selectedCount={selectedTables.size}
        onSetPrimaryKey={() => setShowBulkPKModal(true)}
        onSetIngestionMode={handleBulkIngestionMode}
        onApplyMasking={() => setShowBulkMaskingModal(true)}
        onClearSelection={() => setSelectedTables(new Set())}
        onConfigureRelations={() => setShowRelationsModal(true)}
      />

      {/* Bulk PK Modal */}
      <Modal isOpen={showBulkPKModal} onClose={() => setShowBulkPKModal(false)}>
        <div className="p-6">
          <h3 className="text-lg font-bold mb-4">Configure Primary Keys</h3>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Select a rule to automatically detect primary keys for {selectedTables.size} tables.
          </p>
          <div className="space-y-3">
            {[
              { rule: '*_ID', description: 'Columns ending with _ID' },
              { rule: 'ID_*', description: 'Columns starting with ID_' },
              { rule: '*_PK', description: 'Columns ending with _PK' },
              { rule: 'custom', description: 'Custom pattern...' },
            ].map((option) => (
              <button
                key={option.rule}
                className="w-full flex items-center gap-3 p-3 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 dark:border-slate-700 text-left"
                onClick={() => {
                  toast.success(`Applied PK rule: ${option.rule}`);
                  setShowBulkPKModal(false);
                }}
              >
                <Key className="h-5 w-5 text-amber-500" />
                <div>
                  <p className="font-medium">{option.rule}</p>
                  <p className="text-sm text-slate-500">{option.description}</p>
                </div>
              </button>
            ))}
          </div>
          <div className="flex justify-end mt-6">
            <Button variant="outline" onClick={() => setShowBulkPKModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Masking Modal */}
      <Modal isOpen={showBulkMaskingModal} onClose={() => setShowBulkMaskingModal(false)}>
        <div className="p-6">
          <h3 className="text-lg font-bold mb-4">Apply Masking Policy</h3>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Apply a masking policy to sensitive columns in {selectedTables.size} tables.
          </p>
          <div className="space-y-3">
            {maskingPolicies.map((policy) => (
              <button
                key={policy.name}
                className="w-full flex items-center gap-3 p-3 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 dark:border-slate-700 text-left"
                onClick={() => {
                  toast.success(`Applied masking policy: ${policy.name}`);
                  setShowBulkMaskingModal(false);
                }}
              >
                <Shield className="h-5 w-5 text-green-500" />
                <div>
                  <p className="font-medium">{policy.name}</p>
                  <p className="text-sm text-slate-500">Type: {policy.type}</p>
                </div>
              </button>
            ))}
          </div>
          <div className="flex justify-end mt-6">
            <Button variant="outline" onClick={() => setShowBulkMaskingModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Relations Modal */}
      <Modal isOpen={showRelationsModal} onClose={() => setShowRelationsModal(false)}>
        <div className="p-6 max-w-2xl">
          <h3 className="text-lg font-bold mb-4">Configure Relations</h3>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            Define relationships between selected tables.
          </p>
          <div className="border dark:border-slate-700 rounded-lg p-4 mb-4">
            <div className="flex items-center justify-center gap-4 py-8">
              <div className="text-center">
                <Table2 className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                <p className="text-sm font-medium">Source Table</p>
              </div>
              <ArrowRight className="h-6 w-6 text-slate-400" />
              <div className="text-center">
                <Table2 className="h-8 w-8 mx-auto text-slate-400 mb-2" />
                <p className="text-sm font-medium">Target Table</p>
              </div>
            </div>
          </div>
          <Button
            className="w-full gap-2"
            onClick={() => {
              toast.success('Auto-detecting relations...');
              setShowRelationsModal(false);
            }}
          >
            <Sparkles className="h-4 w-4" />
            Auto-Detect Relations
          </Button>
          <div className="flex justify-end mt-6">
            <Button variant="outline" onClick={() => setShowRelationsModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      </Modal>

      {/* Deployment Modal */}
      <Modal
        isOpen={showDeploymentModal}
        onClose={() => setShowDeploymentModal(false)}
        customSize="900px"
      >
        <DeploymentValidation
          onClose={() => setShowDeploymentModal(false)}
          database={selectedDatabase}
          schemas={Array.from(selectedSchemas)}
        />
      </Modal>
    </div>
  );
}
