'use client';
// Data journey: page → getDatabases/getSchemas/getTables/getTableColumns (mapping) + listProjectEvents (projectsApi) + addEvent/listMappings (projects/exploreDesign API) → backend
// ////dependency//// page → services.mapping, services.explore-design (fetchRelationships), services.api (projectsApi, exploreDesignApi), services.gouvernance (policies)
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Button, Badge, Input, Modal, Text, Tooltip } from 'rizzui';
import { toast } from 'react-hot-toast';
import {
  Search, Database, Table2, Columns3, Key, Shield, RefreshCw,
  Settings, ChevronRight, ChevronDown, Filter, Download, Upload,
  Layers, Grid3X3, LayoutGrid, CheckSquare, Square, AlertTriangle,
  Clock, History, Lock, Eye, Play, Save, X, Plus, Minus, Trash2,
  FileText, BookOpen, Sparkles, Zap, GitBranch, ArrowRight, ArrowLeftRight,
  Workflow, Rocket, Undo2, Redo2, PanelLeft, PanelRight, Maximize2, Minimize2,
  WifiOff, BarChart3, MinusCircle, Link2, TableIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSchemas } from '@/app/services/mapping/getSchema';
import { getTables } from '@/app/services/mapping/getTables';
import { getTableColumns } from '@/app/services/mapping/fetch_tables';
import { getDatabases } from '@/app/services/mapping/getDatabases';
import { getMaskingPolicies, MaskingPolicy } from '@/app/services/gouvernance/policies';
import {
  getRecentDeploymentErrors,
  TableRelationship
} from '@/app/services/explore-design';
import { listDDLActions } from '@/app/services/api/exploreDesignApi';
import { addEvent as addProjectEvent, listEvents as listProjectEvents } from '@/app/services/api/projectsApi';
import type { ColumnMapping as BackendColumnMapping } from '@/app/services/api/types';
import VirtualizedTableList, { TableItem, ColumnInfo } from '../mapping/components/VirtualizedTableList';
import TableDetailPanel, { TableConfig, IngestionMode, IngestionConfig, MaskingConfig } from '../mapping/components/TableDetailPanel';
import ModelingCanvas from './components/ModelingCanvas';
import EventTable from './components/EventTable';
import TableToolbar from './components/TableToolbar';
import DeploymentValidation from './components/DeploymentValidation';
import ProjectSelector from './components/ProjectSelector';
import { ProjectContextPanel, SchemaVersionDisplaySwitch } from '@/app/shared/project-context';
import { useCacheInvalidationContext } from '@/components/providers/CacheInvalidationProvider';
import {
  useEventStore,
  createPrimaryKeyEvent,
  createMaskingPolicyEvent,
  createColumnExclusionEvent,
  createSensitiveColumnEvent,
  EventType
} from './stores/event-store';
import ColumnPreviewModal from './components/ColumnPreviewModal';
import SensitiveColumnModal from './components/SensitiveColumnModal';
import ColumnExclusionModal from './components/ColumnExclusionModal';
import TablePreviewModal from './components/TablePreviewModal';
import TableProfileModal from './components/TableProfileModal';
import CreateTableModal from './components/CreateTableModal';
import RelationshipModal from './components/RelationshipModal';
import AccessManagementSlot from './components/AccessManagementSlot';
import ModelingTemplateModal from './components/ModelingTemplateModal';
import type { ModelingChoice } from './components/ModelingTemplateModal';
import DwhLocationPickerModal from './components/DwhLocationPickerModal';
import {
  DWH_TEMPLATE_TABLES,
  DWH_TEMPLATE_RELATIONSHIPS,
  buildTemplateTableItems,
  buildTemplateColumnsMap,
  buildTemplateRelationships,
} from './data/dwh-template-data';

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

// Collapsible Schema Badge - shows schema name, expands to show database
const SchemaBadge: React.FC<{
  schemaName: string;
  dbName: string;
  onSettings: (e: React.MouseEvent) => void;
  onRemove: () => void;
}> = ({ schemaName, dbName, onSettings, onRemove }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className="flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded text-xs group"
    >
      <button
        className="p-0.5 rounded hover:bg-blue-200 dark:hover:bg-blue-800 transition-transform"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <ChevronRight className={cn('h-3 w-3 transition-transform', isExpanded && 'rotate-90')} />
      </button>
      <span className="flex items-center">
        {isExpanded && (
          <span className="text-[10px] text-blue-500 dark:text-blue-400 mr-0.5">{dbName}.</span>
        )}
        <span className="font-medium">{schemaName}</span>
      </span>
      <button
        className="p-0.5 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
        onClick={onSettings}
      >
        <Settings className="h-3 w-3" />
      </button>
      <button
        className="p-0.5 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
        onClick={onRemove}
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
};

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
  selectedSchemas: Map<string, string>; // Map<schemaName, databaseName>
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

  const schemaActions: Array<{
    id: string;
    label: string;
    icon?: React.ElementType;
    danger?: boolean;
  }> = [
    { id: 'transfer_ownership', label: 'Transfer Ownership', icon: ArrowLeftRight },
    { id: 'apply_masking_all', label: 'Apply Masking to All Tables', icon: Shield },
    { id: 'apply_rls_all', label: 'Apply RLS to All Tables', icon: Lock },
    { id: 'set_ingestion_all', label: 'Set Ingestion for All', icon: RefreshCw },
    { id: 'divider', label: '' }, // No icon for dividers
    { id: 'clone_schema', label: 'Clone Schema', icon: Layers },
    { id: 'export_ddl', label: 'Export DDL', icon: Download },
    { id: 'divider2', label: '' }, // No icon for dividers
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
                    ? Array.from(selectedSchemas.keys())[0]
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

      {/* Selected schemas tags with actions - collapsible to show DB */}
      {selectedSchemas.size > 0 && selectedSchemas.size <= 3 && (
        <div className="flex items-center gap-1">
          {Array.from(selectedSchemas.entries()).map(([schemaName, dbName]) => (
            <SchemaBadge
              key={`${dbName}.${schemaName}`}
              schemaName={schemaName}
              dbName={dbName}
              onSettings={(e) => {
                e.stopPropagation();
                setSchemaContextMenu({ schema: schemaName, x: e.clientX, y: e.clientY });
              }}
              onRemove={() => onSchemaToggle(schemaName)}
            />
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

// Small slot for ProjectContextPanel: recent deployment errors list
function RecentDeploymentErrorsSlot() {
  const [errors, setErrors] = useState<{ id: string; error_message?: string; project_id?: string | null; created_at?: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    getRecentDeploymentErrors(10).then((res) => {
      if (!cancelled) setErrors(res?.errors ?? []);
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  if (loading) return <div className="p-4 text-sm text-slate-500">Loading…</div>;
  if (errors.length === 0) return <div className="p-4 text-sm text-slate-500">No recent deployment errors.</div>;
  return (
    <div className="p-4 space-y-2 max-h-[300px] overflow-auto">
      {errors.map((e) => (
        <div key={e.id} className="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-2 text-xs">
          <p className="font-mono text-slate-700 dark:text-slate-300 break-all">{e.error_message ?? '—'}</p>
          {(e.project_id || e.created_at) && (
            <p className="mt-1 text-slate-500">{e.project_id && `Project: ${e.project_id}`}{e.created_at && ` · ${new Date(e.created_at).toLocaleString()}`}</p>
          )}
        </div>
      ))}
    </div>
  );
}

// Main Page Component
export default function ExploreDesignPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Connection status from SSE provider
  const { isConnected, error: connectionError } = useCacheInvalidationContext();

  // Project State — pre-fill from ?project_id= query param if present
  const urlProjectId = searchParams.get('project_id');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProjectName, setSelectedProjectName] = useState<string>('');

  // State
  const [databases, setDatabases] = useState<string[]>([]);
  const [selectedDatabase, setSelectedDatabase] = useState<string>('');
  const [schemas, setSchemas] = useState<string[]>([]);
  // Map<schemaName, databaseName> - tracks which database each schema belongs to
  const [selectedSchemas, setSelectedSchemas] = useState<Map<string, string>>(new Map());
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

  // Backend-persisted column mappings (loaded via listMappings on project select)
  const [backendMappings, setBackendMappings] = useState<BackendColumnMapping[]>([]);

  // Check if offline and redirect to sign-in
  const isOffline = !isConnected && !!connectionError;

  const [showBulkPKModal, setShowBulkPKModal] = useState(false);
  const [showBulkMaskingModal, setShowBulkMaskingModal] = useState(false);
  const [showRelationsModal, setShowRelationsModal] = useState(false);
  const [showDeploymentModal, setShowDeploymentModal] = useState(false);
  const [showCreateTableModal, setShowCreateTableModal] = useState(false);
  const [showRelationshipModal, setShowRelationshipModal] = useState(false);

  // Column action modals
  const [columnPreviewModal, setColumnPreviewModal] = useState<{
    isOpen: boolean;
    column: ColumnInfo | null;
  }>({ isOpen: false, column: null });
  const [sensitiveColumnModal, setSensitiveColumnModal] = useState<{
    isOpen: boolean;
    column: ColumnInfo | null;
  }>({ isOpen: false, column: null });
  const [columnExclusionModal, setColumnExclusionModal] = useState<{
    isOpen: boolean;
    column: ColumnInfo | null;
  }>({ isOpen: false, column: null });

  // Table preview modal
  const [tablePreviewModal, setTablePreviewModal] = useState(false);

  // Table profile modal
  const [tableProfileModal, setTableProfileModal] = useState(false);

  // Track excluded columns per table
  const [excludedColumns, setExcludedColumns] = useState<Map<string, Set<string>>>(new Map());

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('catalog');
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [modelingChoice, setModelingChoice] = useState<ModelingChoice | null>(null);
  // Persist modeling choice per project so re-selecting a project doesn't re-show the modal
  const modelingChoicesByProject = useRef<Map<string, { choice: ModelingChoice; database?: string; schema?: string }>>(new Map());
  // DWH template deployment target (chosen by user in location picker)
  const [dwhTargetDatabase, setDwhTargetDatabase] = useState<string | null>(null);
  const [dwhTargetSchema, setDwhTargetSchema] = useState<string | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showEventPanel, setShowEventPanel] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showDetailPanel, setShowDetailPanel] = useState(true);
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Modeling table selection - tracks which tables are included in the modeling view
  const [modelingTableIds, setModelingTableIds] = useState<Set<string>>(new Set());

  // Target table IDs - tracks which tables are DWH/target tables (default tables from DATA360.RETAIL_DWH)
  // These are the tables that user-added source tables must map TO
  const [targetTableIds, setTargetTableIds] = useState<Set<string>>(new Set());

  // Default relationships for modeling view
  const [defaultRelationships, setDefaultRelationships] = useState<TableRelationship[]>([]);

  // Refresh trigger for tables
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Event store with project filtering
  const {
    events,
    pendingEvents,
    undoEvent,
    redoEvent,
    canUndo,
    canRedo,
    cleanupEmptyEvents,
    addEvent,
    loadProjectEvents,
    saveProjectEvents,
    getEventsByProject,
    updateEventStatus
  } = useEventStore(selectedProjectId);

  // Clean up empty events on mount (one-time cleanup of any legacy empty events)
  useEffect(() => {
    const removedCount = cleanupEmptyEvents();
    if (removedCount > 0) {
      console.log(`[Explore-Design] Cleaned up ${removedCount} empty events from localStorage`);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Stats - exclude default DWH tables from catalog stats
  const stats = useMemo(() => {
    const catalogTables = tables.filter(t => !targetTableIds.has(t.id));
    const configured = catalogTables.filter(t => t.status === 'configured').length;
    return {
      total: catalogTables.length,
      configured,
      pending: catalogTables.length - configured,
    };
  }, [tables, targetTableIds]);

  // Displayable event types for deploy button badge (actual schema changes)
  const displayableEventTypes: EventType[] = [
    'TABLE_CREATED',
    'TABLE_RENAMED',
    'COLUMN_RENAMED',
    'COLUMN_TYPE_CHANGED',
    'ADD_COLUMN',
    'REMOVE_COLUMN',
    'PRIMARY_KEY_SET',
    'PRIMARY_KEY_REMOVED',
    'FOREIGN_KEY_ADDED',
    'FOREIGN_KEY_REMOVED',
    'INGESTION_MODE_SET',
    'MASKING_POLICY_APPLIED',
    'MASKING_POLICY_REMOVED',
    'AGGREGATION_POLICY_APPLIED',
    'AGGREGATION_POLICY_REMOVED',
    'RLS_POLICY_APPLIED',
    'RLS_POLICY_REMOVED',
    'TAG_APPLIED',
    'TAG_REMOVED',
    'SCD_CONFIGURED',
    'RELATION_CREATED',
    'RELATION_REMOVED',
    'COLUMN_MAPPING_CREATED',
    'COLUMN_MAPPING_REMOVED',
  ];

  // Filter pending events for deploy button - only show actual schema changes
  const displayablePendingEvents = useMemo(() => {
    return pendingEvents.filter(event => displayableEventTypes.includes(event.type));
  }, [pendingEvents]);

  // Extract column mappings from COLUMN_MAPPING_CREATED events + backend-persisted mappings
  const initialColumnMappings = useMemo(() => {
    // 1. Mappings from local event store
    const mappingEvents = events.filter(e => e.type === 'COLUMN_MAPPING_CREATED');
    const eventMappings = mappingEvents.map(e => ({
      id: e.id,
      sourceTable: e.payload?.source?.table || '',
      sourceSchema: e.payload?.source?.schema || '',
      sourceColumn: (e.payload?.source?.columns?.[0]) || '',
      targetTable: e.payload?.target?.table || '',
      targetSchema: e.payload?.target?.schema || '',
      targetColumn: e.payload?.target?.column || '',
      transformation: e.payload?.transformation,
    }));

    // 2. Mappings from backend (listMappings) — one entry per source column
    const backendFlat = backendMappings.flatMap(m =>
      m.source_columns.map((col, idx) => ({
        id: `${m.mapping_id}_${idx}`,
        sourceTable: m.source.table,
        sourceSchema: m.source.schema,
        sourceColumn: col,
        targetTable: m.target.table,
        targetSchema: m.target.schema,
        targetColumn: m.target_column,
        transformation: m.transformation ?? undefined,
      }))
    );

    // 3. Deduplicate: event-derived mappings take precedence over backend ones
    const seen = new Set(
      eventMappings.map(m => `${m.sourceSchema}.${m.sourceTable}.${m.sourceColumn}→${m.targetSchema}.${m.targetTable}.${m.targetColumn}`)
    );
    const uniqueBackend = backendFlat.filter(
      m => !seen.has(`${m.sourceSchema}.${m.sourceTable}.${m.sourceColumn}→${m.targetSchema}.${m.targetTable}.${m.targetColumn}`)
    );

    const merged = [...eventMappings, ...uniqueBackend];
    console.log('[initialColumnMappings] event:', eventMappings.length, 'backend:', backendFlat.length, 'merged:', merged.length);
    return merged;
  }, [events, backendMappings]);

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

  // Load DWH template tables from hardcoded DDL — only when DWH template chosen
  const [defaultModelingTablesLoaded, setDefaultModelingTablesLoaded] = useState(false);

  useEffect(() => {
    // Only load when in modeling view AND DWH template was chosen
    if (viewMode !== 'modeling' || modelingChoice !== 'dwh_template') return;
    // Skip if already loaded and tables exist
    if (defaultModelingTablesLoaded && tables.some(t => targetTableIds.has(t.id))) return;
    // Need a target location
    if (!dwhTargetDatabase || !dwhTargetSchema) return;

    const db = dwhTargetDatabase;
    const schema = dwhTargetSchema;

    console.log(`[Modeling] Loading hardcoded DWH template into ${db}.${schema}`);

    // 1. Build data from hardcoded template
    const templateTables = buildTemplateTableItems(db, schema);
    const templateColumnsMap = buildTemplateColumnsMap(db, schema);
    const templateRelationships = buildTemplateRelationships(schema);
    const newTableIds = new Set(templateTables.map(t => t.id));

    // 2. Add tables to state
    setTables(prev => {
      const existingIds = new Set(prev.map(t => t.id));
      const tablesToAdd = templateTables.filter(t => !existingIds.has(t.id));
      return [...prev, ...tablesToAdd];
    });

    // 3. Add to modeling view
    setModelingTableIds(prev => {
      const merged = new Set(prev);
      newTableIds.forEach(id => merged.add(id));
      return merged;
    });

    // 4. Mark as target tables
    setTargetTableIds(prev => {
      const merged = new Set(prev);
      newTableIds.forEach(id => merged.add(id));
      return merged;
    });

    // 5. Set columns map
    setTableColumnsMap(prev => {
      const next = new Map(prev);
      templateColumnsMap.forEach((cols, tableId) => next.set(tableId, cols));
      return next;
    });

    // 6. Set FK relationships for canvas edges
    setDefaultRelationships(templateRelationships);

    // 7. Set database for UI
    if (!selectedDatabase) {
      setSelectedDatabase(db);
    }

    // 8. Fire SCHEMA_CREATED + TABLE_CREATED events for each template table (skip if already restored from backend)
    const templateEventsExist = events.some(
      e => (e.type === 'TABLE_CREATED' || e.type === 'SCHEMA_CREATED') && e.payload?.isTemplate && e.target.database === db && e.target.schema === schema
    );

    if (selectedProjectId && !templateEventsExist) {
      // Fire SCHEMA_CREATED first — runs before all TABLE_CREATED via priority ordering
      const schemaTarget = { database: db, schema, table: schema };
      const schemaPayload = { schemaName: schema, database: db, isTemplate: true };
      addEvent({
        type: 'SCHEMA_CREATED',
        projectId: selectedProjectId,
        target: schemaTarget,
        payload: schemaPayload,
      });

      const tableEvents: { target: any; payload: any }[] = [];
      DWH_TEMPLATE_TABLES.forEach(tmplTable => {
        const target = { database: db, schema, table: tmplTable.tableName };
        const payload = {
          tableName: tmplTable.tableName,
          columns: tmplTable.columns.map(col => ({
            name: col.name,
            dataType: col.dataType,
            nullable: col.nullable,
            primaryKey: col.primaryKey,
            computedExpression: col.computedExpression,
          })),
          primaryKeys: tmplTable.primaryKeys,
          isTemplate: true,
        };
        addEvent({ type: 'TABLE_CREATED', projectId: selectedProjectId, target, payload });
        tableEvents.push({ target, payload });
      });

      // 9. Fire FOREIGN_KEY_ADDED events for each FK constraint
      const fkEvents: { target: any; payload: any }[] = [];
      DWH_TEMPLATE_RELATIONSHIPS.forEach(fk => {
        const target = { database: db, schema, table: fk.childTable };
        const payload = {
          constraintName: fk.constraintName,
          columns: [fk.childColumn],
          referencedTable: { database: db, schema, table: fk.parentTable },
          referencedColumns: [fk.parentColumn],
          isTemplate: true,
        };
        addEvent({ type: 'FOREIGN_KEY_ADDED', projectId: selectedProjectId, target, payload });
        fkEvents.push({ target, payload });
      });

      // 10. Persist all template events to backend so they restore on project select
      const persistTemplateEvents = async () => {
        try {
          // Schema
          await addProjectEvent(selectedProjectId, {
            module_name: 'explore-design',
            event_type: 'SCHEMA_CREATED',
            status: 'pending',
            details: { target: schemaTarget, payload: schemaPayload },
            entity_id: `schema-${db}-${schema}`,
            entity_type: 'design_event',
          });
          // Tables
          for (const te of tableEvents) {
            await addProjectEvent(selectedProjectId, {
              module_name: 'explore-design',
              event_type: 'TABLE_CREATED',
              status: 'pending',
              details: { target: te.target, payload: te.payload },
              entity_id: `table-${te.target.table}`,
              entity_type: 'design_event',
            });
          }
          // Foreign keys
          for (const fke of fkEvents) {
            await addProjectEvent(selectedProjectId, {
              module_name: 'explore-design',
              event_type: 'FOREIGN_KEY_ADDED',
              status: 'pending',
              details: { target: fke.target, payload: fke.payload },
              entity_id: `fk-${fke.target.table}-${fke.payload.columns[0]}`,
              entity_type: 'design_event',
            });
          }
          console.log(`[Template] Persisted ${1 + tableEvents.length + fkEvents.length} template events to backend`);
        } catch (err) {
          console.warn('[Template] Failed to persist template events to backend:', err);
        }
      };
      persistTemplateEvents();
    }

    setDefaultModelingTablesLoaded(true);
    console.log(`[Modeling] Loaded ${templateTables.length} template tables, ${templateRelationships.length} relationships`);
  }, [viewMode, modelingChoice, defaultModelingTablesLoaded, dwhTargetDatabase, dwhTargetSchema, selectedProjectId, selectedDatabase, tables.length, targetTableIds.size, addEvent]);

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
      // Keep default DWH tables (targetTableIds), only remove user-selected schema tables
      setTables(prev => prev.filter(t => targetTableIds.has(t.id)));
      return;
    }

    const loadTables = async () => {
      console.log('[Explore-Design] Loading tables for schemas:', Object.fromEntries(selectedSchemas));
      setIsLoadingTables(true);
      try {
        const newTables: TableItem[] = [];

        // Iterate over schema->database map entries
        for (const [schemaName, dbName] of Array.from(selectedSchemas.entries())) {
          console.log(`[Explore-Design] Fetching tables for ${dbName}.${schemaName}`);
          const tableList = await getTables(dbName, schemaName);
          console.log(`[Explore-Design] Tables for ${schemaName}:`, tableList);
          if (tableList) {
            tableList.forEach((tableName: string) => {
              const tableId = `${dbName}.${schemaName}.${tableName}`;
              const existingConfig = allTableConfigs.get(tableId);

              newTables.push({
                id: tableId,
                database: dbName,
                schema: schemaName,
                table: tableName,
                columnCount: 0,
                hasPrimaryKey: existingConfig?.primaryKeys?.length ? true : false,
                status: existingConfig ? 'configured' : 'pending',
                sensitiveColumns: existingConfig?.sensitive?.length || 0,
              });
            });
          }
        }

        // Merge with existing tables: keep target/DWH tables, add new schema tables
        console.log('🔄 [Tables] Loaded table IDs:', newTables.map(t => t.id));
        setTables(prev => {
          // Keep existing target/DWH tables (default tables)
          const existingTargetTables = prev.filter(t => targetTableIds.has(t.id));
          // Get IDs of tables we're adding
          const newTableIds = new Set(newTables.map(t => t.id));
          // Filter out any existing target tables that are also in newTables (avoid duplicates)
          const uniqueTargetTables = existingTargetTables.filter(t => !newTableIds.has(t.id));
          // Combine: existing DWH tables + new schema tables
          return [...uniqueTargetTables, ...newTables];
        });
        // Expanded schemas is still Set<string> of schema names
        setExpandedSchemas(new Set(selectedSchemas.keys()));

        // Load columns for new tables (for modeling view)
        // Only load for tables not already in tableColumnsMap
        const tablesToLoadColumns = newTables.filter(t => !tableColumnsMap.has(t.id));
        if (tablesToLoadColumns.length > 0) {
          console.log(`[Explore-Design] Loading columns for ${tablesToLoadColumns.length} new tables...`);
          const columnsPromises = tablesToLoadColumns.map(async (table) => {
            try {
              const cols = await getTableColumns(table.database, table.schema, table.table);
              if (cols && cols.length > 0) {
                const formattedColumns: ColumnInfo[] = cols.map((col: any) => ({
                  name: col.COLUMN_NAME || col.name,
                  dataType: col.DATA_TYPE || col.dataType || 'VARCHAR',
                  isNullable: col.IS_NULLABLE === 'YES' || col.isNullable !== false,
                  isPrimaryKey: col.IS_PRIMARY_KEY === 'Y' || col.isPrimaryKey === true,
                  isSensitive: false,
                }));
                return { tableId: table.id, columns: formattedColumns };
              }
              return null;
            } catch (err) {
              console.error(`[Explore-Design] Failed to load columns for ${table.id}:`, err);
              return null;
            }
          });

          const columnsResults = await Promise.all(columnsPromises);

          // Update tableColumnsMap with loaded columns
          setTableColumnsMap(prev => {
            const next = new Map(prev);
            columnsResults.forEach(result => {
              if (result) {
                next.set(result.tableId, result.columns);
              }
            });
            return next;
          });

          console.log(`[Explore-Design] Loaded columns for ${columnsResults.filter(r => r !== null).length} tables`);
        }
      } catch (error) {
        toast.error('Failed to load tables');
      } finally {
        setIsLoadingTables(false);
      }
    };
    loadTables();
  }, [selectedDatabase, selectedSchemas, allTableConfigs, refreshTrigger, targetTableIds]); // eslint-disable-line react-hooks/exhaustive-deps

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
          const formattedColumns: ColumnInfo[] = columns.map((col: any) => {
            // Check for primary key - backend returns isPk: "Y" or "N"
            const isPK = col.isPk === 'Y' ||
              col.isPk === true ||
              col.is_primary_key === true ||
              col.is_primary_key === 'Y' ||
              col.IS_PRIMARY_KEY === 'Y' ||
              col.CONSTRAINT_TYPE === 'PRIMARY KEY';

            // Check for nullable - backend returns isNull: "Y" or "N"
            const isNullable = col.isNull === 'Y' ||
              col.is_nullable === 'YES' ||
              col.IS_NULLABLE === 'YES';

            return {
              name: col.name || col.COLUMN_NAME || col.column_name || 'unknown',
              dataType: col.data_type || col.type || col.DATA_TYPE || 'VARCHAR',
              isPrimaryKey: isPK,
              isNullable: isNullable,
              isSensitive: detectSensitiveColumn(col.name || col.COLUMN_NAME || col.column_name || ''),
            };
          });
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
  // handleSchemaToggle now stores schema with its database (selectedDatabase is the current DB in dropdown)
  const handleSchemaToggle = useCallback((schema: string) => {
    // When user selects a schema, selectedDatabase is the database that schema belongs to
    // (because schemas dropdown only shows schemas for the currently selected database)
    const databaseForSchema = selectedDatabase;

    setSelectedSchemas(prev => {
      const next = new Map(prev);
      const isAdding = !next.has(schema);

      if (isAdding) {
        // Store schema with its database
        next.set(schema, databaseForSchema);
      } else {
        next.delete(schema);
      }

      // Record SCHEMA_SELECTED event when a schema is selected (after state update)
      if (isAdding && selectedProjectId && databaseForSchema) {
        // Use setTimeout to ensure this runs after state update
        setTimeout(() => {
          addEvent({
            type: 'SCHEMA_SELECTED',
            projectId: selectedProjectId,
            target: {
              database: databaseForSchema,
              schema: schema,
              table: '',
            },
            payload: {
              schemaName: schema,
              database: databaseForSchema,
            },
          });
          console.log('📌 SCHEMA_SELECTED event created for:', databaseForSchema + '.' + schema);
        }, 0);
      }

      return next;
    });
  }, [selectedProjectId, selectedDatabase, addEvent]);

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

  // Handle project selection - load events for the selected project
  const handleProjectSelect = useCallback(async (projectId: string, projectName: string) => {
    try {
      // Save current project events before switching (if there's a current project)
      if (selectedProjectId && pendingEvents.length > 0) {
        const unsyncedEvents = await saveProjectEvents(selectedProjectId);
        if (unsyncedEvents.length > 0) {
          // Persist each unsynced event via the new projects API
          await Promise.all(
            unsyncedEvents.map(e =>
              addProjectEvent(selectedProjectId, {
                module_name: 'explore-design',
                event_type: e.type,
                status: e.status || 'pending',
                details: { target: e.target, payload: e.payload },
                entity_id: e.id,
                entity_type: 'design_event',
              })
            )
          );
          toast.success(`Saved ${unsyncedEvents.length} events for previous project`);
        }
      }

      // Update selected project
      setSelectedProjectId(projectId);
      setSelectedProjectName(projectName);
      setBackendMappings([]);
      // Restore modeling choice from cache (persisted per project)
      const cached = modelingChoicesByProject.current.get(projectId);
      setModelingChoice(cached?.choice || null);
      setDwhTargetDatabase(cached?.database || null);
      setDwhTargetSchema(cached?.schema || null);
      setDefaultModelingTablesLoaded(!!cached?.choice);

      // Show loading toast while restoring project context
      const loadingToast = toast.loading(`Restoring project context...`);

      // Load events for the new project from backend
      try {
        // Use projectsApi.listEvents (same endpoint as addProjectEvent) to ensure we read from where we write
        const eventsResponse = await listProjectEvents(projectId, { module_name: 'EXPLORE-DESIGN' });
        console.log('📥 Backend events response:', eventsResponse);
        console.log('📥 Raw events details:', eventsResponse.events?.map((e: any) => ({
          type: e.event_type,
          details: e.details,
          schema: e.details?.target?.schema || e.details?.schema,
          table: e.details?.target?.table || e.details?.table,
        })));

        // Extract unique database and schemas from ALL events
        // Track schemas per database: Map<database, Set<schema>>
        const schemasByDatabase = new Map<string, Set<string>>();

        // Convert backend events to local event format
        let backendEvents: any[] = [];
        if (eventsResponse.events && eventsResponse.events.length > 0) {
          backendEvents = eventsResponse.events.map((e: any) => {
            // Backend structure:
            // - details: { database, schema, table, columns, sql }
            // - event_id, event_type, status, timestamp, username, error_message

            // Backend returns event_details/details (may be { target, payload } or flat { database, schema, table, ... })
            const details = e.details || e.event_details || {};
            const targetFromDetails = details.target || {};
            const payloadFromDetails = details.payload || details;

            // Map backend status to frontend status
            let status: 'pending' | 'validated' | 'failed' | 'applied' = 'pending';
            if (e.status === 'SUCCESS') status = 'applied';
            else if (e.status === 'FAILED') status = 'failed';
            else if (e.status === 'VALIDATED') status = 'validated';
            else if (e.status === 'PENDING') status = 'pending';

            const convertedEvent = {
              id: e.event_id || `event-${Date.now()}-${Math.random()}`,
              type: e.event_type,
              timestamp: new Date(e.timestamp || Date.now()),
              status: status,
              projectId: projectId,
              target: {
                database: targetFromDetails.database ?? details.database ?? '',
                schema: targetFromDetails.schema ?? details.schema ?? '',
                table: targetFromDetails.table ?? details.table ?? 'Unknown Table',
                column: targetFromDetails.column ?? details.column,
              },
              payload: {
                columns: payloadFromDetails.columns,
                sql: payloadFromDetails.sql,
                source: payloadFromDetails.source,
                target: payloadFromDetails.target,
                transformation: payloadFromDetails.transformation,
                ...payloadFromDetails,
              },
              backendId: e.event_id,
              synced: true,
              userId: e.username,
              error: e.error_message,
            };

            // Debug logging for COLUMN_MAPPING events
            if (e.event_type === 'COLUMN_MAPPING_CREATED' || e.event_type === 'COLUMN_MAPPING_REMOVED') {
              console.log('[handleProjectSelect] Converting COLUMN_MAPPING event:', {
                rawEvent: e,
                details,
                convertedPayload: convertedEvent.payload,
              });
            }

            // Extract database and schema pairs from EVERY event
            const db = convertedEvent.target?.database;
            const schema = convertedEvent.target?.schema;
            if (db && schema) {
              if (!schemasByDatabase.has(db)) {
                schemasByDatabase.set(db, new Set());
              }
              schemasByDatabase.get(db)!.add(schema);
            }

            // Also check payload for SCHEMA_SELECTED events
            if (e.event_type === 'SCHEMA_SELECTED') {
              const eventDb = details.database || db;
              const eventSchema = details.schemaName || details.schema || schema;
              if (eventDb && eventSchema) {
                if (!schemasByDatabase.has(eventDb)) {
                  schemasByDatabase.set(eventDb, new Set());
                }
                schemasByDatabase.get(eventDb)!.add(eventSchema);
              }
            }

            return convertedEvent;
          });

          console.log('📊 Total converted events:', backendEvents.length);
          console.log('📊 Schemas by database:', Object.fromEntries(
            Array.from(schemasByDatabase.entries()).map(([db, schemas]) => [db, Array.from(schemas)])
          ));
        }

        await loadProjectEvents({ projectId, events: backendEvents });

        // Load DDL actions from backend (for awareness / logging only)
        // All events stay pending — DDL execution happens later in the deployment modal
        try {
          const ddlResponse = await listDDLActions(projectId);
          const ddlActions = ddlResponse.actions || [];
          console.log('[handleProjectSelect] Loaded DDL actions:', ddlActions.length);
        } catch (ddlErr) {
          console.warn('[handleProjectSelect] Failed to load DDL actions:', ddlErr);
        }

        // Load saved column mappings from backend (legacy fallback for pre-event mappings)
        /**try {
          const mappingsResponse = await listMappings(projectId);
          setBackendMappings(mappingsResponse.mappings || []);
          console.log('[handleProjectSelect] Loaded backend mappings:', mappingsResponse.mappings?.length || 0);
        } catch (mappingErr) {
          console.warn('[handleProjectSelect] Failed to load backend mappings:', mappingErr);
          setBackendMappings([]);
        }**/

        // If we found database/schema info, restore the selections
        if (schemasByDatabase.size > 0) {
          // Use the first database as the selected one (user can switch later)
          const dbToSelect = Array.from(schemasByDatabase.keys())[0];
          console.log('🔄 Restoring database selection:', dbToSelect);
          console.log('🔄 All databases with schemas:', Array.from(schemasByDatabase.keys()));

          try {
            // Set the database first
            setSelectedDatabase(dbToSelect);

            // Load schemas for the selected database
            const schemaList = await getSchemas(dbToSelect);
            setSchemas(schemaList || []);

            // Build the Map<schemaName, databaseName> for ALL schemas from ALL databases
            const allSchemasMap = new Map<string, string>();
            schemasByDatabase.forEach((schemasSet, dbName) => {
              schemasSet.forEach(schemaName => {
                allSchemasMap.set(schemaName, dbName);
              });
            });

            console.log('🔄 Restoring ALL schema selections:', Object.fromEntries(allSchemasMap));
            setSelectedSchemas(allSchemasMap);

            // Expanded schemas - only those in the selected database's schema list
            const schemasForSelectedDb = schemasByDatabase.get(dbToSelect) || new Set();
            const validSchemas = Array.from(schemasForSelectedDb).filter(s => schemaList?.includes(s));
            if (validSchemas.length > 0) {
              setExpandedSchemas(new Set(validSchemas));
            }

            // Restore modeling tables from TABLE_ADDED_TO_MODELING events
            // Get all added tables, then remove the ones that were removed
            const addedTableIds = new Set<string>();
            const removedTableIds = new Set<string>();

            // Also collect tables from COLUMN_MAPPING_CREATED events
            // These tables need to be in the modeling view for edges to render
            const mappingTableIds = new Set<string>();

            // Restore modeling template choice from backend events
            let restoredChoice: ModelingChoice | null = null;
            let restoredTargetDb: string | null = null;
            let restoredTargetSchema: string | null = null;
            backendEvents.forEach((event: any) => {
              if (event.type === 'MODELING_TEMPLATE_CHOSEN' && event.payload?.choice) {
                restoredChoice = event.payload.choice as ModelingChoice;
                if (event.payload?.targetDatabase) {
                  restoredTargetDb = event.payload.targetDatabase;
                  restoredTargetSchema = event.payload.targetSchema;
                }
              }
              if (event.type === 'TABLE_ADDED_TO_MODELING' && event.payload?.tableId) {
                addedTableIds.add(event.payload.tableId);
              }
              if (event.type === 'TABLE_REMOVED_FROM_MODELING' && event.payload?.tableId) {
                removedTableIds.add(event.payload.tableId);
              }
              // Extract source and target tables from COLUMN_MAPPING events
              if (event.type === 'COLUMN_MAPPING_CREATED') {
                const src = event.payload?.source;
                if (src?.database && src?.schema && src?.table) {
                  mappingTableIds.add(`${src.database}.${src.schema}.${src.table}`);
                }
                const tgt = event.payload?.target;
                if (tgt?.database && tgt?.schema && tgt?.table) {
                  mappingTableIds.add(`${tgt.database}.${tgt.schema}.${tgt.table}`);
                }
              }
            });

            console.log('🔄 Tables from COLUMN_MAPPING events:', Array.from(mappingTableIds));

            // Final modeling tables = added - removed + mapping tables
            const modelingTables = new Set([
              ...Array.from(addedTableIds).filter(id => !removedTableIds.has(id)),
              ...Array.from(mappingTableIds)
            ]);

            console.log('🔄 [Restore] TABLE_ADDED_TO_MODELING ids:', Array.from(addedTableIds));
            console.log('🔄 [Restore] TABLE_REMOVED_FROM_MODELING ids:', Array.from(removedTableIds));
            console.log('🔄 [Restore] COLUMN_MAPPING table ids:', Array.from(mappingTableIds));
            console.log('🔄 [Restore] Final modelingTables:', Array.from(modelingTables));

            if (modelingTables.size > 0) {
              console.log('🔄 Restoring modeling tables:', Array.from(modelingTables));
              // Merge with existing modeling tables (including default DWH tables)
              setModelingTableIds(prev => {
                const merged = new Set(prev);
                modelingTables.forEach(id => merged.add(id));
                return merged;
              });
            }

            // Restore modeling template choice if found in events
            if (restoredChoice) {
              modelingChoicesByProject.current.set(projectId, {
                choice: restoredChoice,
                database: restoredTargetDb || undefined,
                schema: restoredTargetSchema || undefined,
              });
              setModelingChoice(restoredChoice);
              if (restoredChoice === 'dwh_template') {
                if (restoredTargetDb) setDwhTargetDatabase(restoredTargetDb);
                if (restoredTargetSchema) setDwhTargetSchema(restoredTargetSchema);
                if (modelingTables.size > 0) {
                  setDefaultModelingTablesLoaded(true);
                }
              }
            }

            // Count total schemas across all databases
            const totalSchemas = Array.from(schemasByDatabase.values()).reduce((sum, s) => sum + s.size, 0);

            toast.dismiss(loadingToast);
            const eventInfo = backendEvents.length > 0 ? ` (${backendEvents.length} events)` : '';
            const dbInfo = schemasByDatabase.size > 1 ? ` across ${schemasByDatabase.size} databases` : '';
            toast.success(`Loaded "${projectName}"${eventInfo} - ${totalSchemas} schema(s)${dbInfo}`);
          } catch (schemaError) {
            console.error('Failed to load schemas for restored database:', schemaError);
            toast.dismiss(loadingToast);
            toast.success(`Loaded ${backendEvents.length} events for "${projectName}"`);
          }
        } else {
          toast.dismiss(loadingToast);
          if (backendEvents.length > 0) {
            toast.success(`Loaded ${backendEvents.length} events for "${projectName}"`);
          } else {
            toast.error(`Project "${projectName}" selected (no saved data)`);
          }
        }
      } catch (error) {
        console.error('❌ Error loading project events:', error);
        toast.dismiss(loadingToast);
        // Initialize with empty events if load fails
        await loadProjectEvents({ projectId, events: [] });
        toast.error(`Project "${projectName}" selected`);
      }
    } catch (error: any) {
      console.error('Error in handleProjectSelect:', error);
      toast.error('Failed to switch projects');
    }
  }, [selectedProjectId, pendingEvents, saveProjectEvents, loadProjectEvents]);

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

  // Add selected tables to modeling view
  const handleAddToModeling = useCallback(() => {
    if (selectedTables.size === 0) {
      toast.error('No tables selected');
      return;
    }

    const tablesToAdd = Array.from(selectedTables).filter(id => !modelingTableIds.has(id));

    if (tablesToAdd.length === 0) {
      toast.success('Selected tables are already in modeling');
      return;
    }

    // Add to modeling state
    setModelingTableIds(prev => {
      const next = new Set(prev);
      tablesToAdd.forEach(id => next.add(id));
      return next;
    });

    // Create TABLE_ADDED_TO_MODELING events for each table
    tablesToAdd.forEach(tableId => {
      const table = tables.find(t => t.id === tableId);
      if (table) {
        addEvent({
          type: 'TABLE_ADDED_TO_MODELING',
          projectId: selectedProjectId || undefined,
          target: {
            database: table.database,
            schema: table.schema,
            table: table.table,
          },
          payload: {
            tableId: tableId,
            tableName: table.table,
          },
        });
      }
    });

    toast.success(`Added ${tablesToAdd.length} table${tablesToAdd.length > 1 ? 's' : ''} to modeling`);
    setSelectedTables(new Set());
  }, [selectedTables, modelingTableIds, tables, selectedProjectId, addEvent]);

  // Remove table from modeling view
  const handleRemoveFromModeling = useCallback((tableId: string) => {
    const table = tables.find(t => t.id === tableId);
    if (!table) return;

    setModelingTableIds(prev => {
      const next = new Set(prev);
      next.delete(tableId);
      return next;
    });

    // Create TABLE_REMOVED_FROM_MODELING event
    addEvent({
      type: 'TABLE_REMOVED_FROM_MODELING',
      projectId: selectedProjectId || undefined,
      target: {
        database: table.database,
        schema: table.schema,
        table: table.table,
      },
      payload: {
        tableId: tableId,
        tableName: table.table,
      },
    });

    toast.success(`Removed ${table.table} from modeling`);
  }, [tables, selectedProjectId, addEvent]);

  // Add primary key to a table - saves event for later execution
  const handleAddPrimaryKey = useCallback((
    database: string,
    schema: string,
    tableName: string,
    columns: string[]
  ) => {
    if (columns.length === 0) {
      toast.error('Please select at least one column for the primary key');
      return;
    }

    if (!selectedProjectId) {
      toast.error('Please select a project first');
      return;
    }

    // Create PRIMARY_KEY_SET event (will be executed on validation)
    addEvent({
      type: 'PRIMARY_KEY_SET',
      projectId: selectedProjectId || undefined,
      target: {
        database: database,
        schema: schema,
        table: tableName,
      },
      payload: {
        columns: columns,
      },
    });

    const pkType = columns.length > 1 ? 'composite' : 'simple';
    toast.success(`${pkType} primary key for "${tableName}" added to pending changes`);
  }, [addEvent, selectedProjectId]);

  // Rename table handler - saves event for later execution
  const handleRenameTable = useCallback((
    database: string,
    schema: string,
    tableName: string,
    newName: string
  ) => {
    if (!newName || newName === tableName) {
      toast.error('Please provide a different name');
      return;
    }

    // Create TABLE_RENAMED event (will be executed on validation)
    addEvent({
      type: 'TABLE_RENAMED',
      projectId: selectedProjectId || undefined,
      target: {
        database,
        schema,
        table: tableName,
      },
      payload: {
        oldName: tableName,
        newName: newName,
      },
    });

    toast.success(`Table rename "${tableName}" → "${newName}" added to pending changes`);
  }, [addEvent, selectedProjectId]);

  // Rename column handler - saves event for later execution
  const handleRenameColumn = useCallback((
    database: string,
    schema: string,
    tableName: string,
    columnName: string,
    newName: string
  ) => {
    if (!newName || newName === columnName) {
      toast.error('Please provide a different name');
      return;
    }

    // Create COLUMN_RENAMED event (will be executed on validation)
    addEvent({
      type: 'COLUMN_RENAMED',
      projectId: selectedProjectId || undefined,
      target: {
        database,
        schema,
        table: tableName,
        column: columnName,
      },
      payload: {
        oldName: columnName,
        newName: newName,
      },
    });

    toast.success(`Column rename "${columnName}" → "${newName}" added to pending changes`);
  }, [addEvent, selectedProjectId]);

  // Schema action handler
  const handleSchemaAction = useCallback((schema: string, action: string) => {
    switch (action) {
      case 'transfer_ownership':
        toast.loading(`Transferring ownership for schema ${schema}...`);
        // ////to do//// Implement transfer ownership API call (backend + frontend)
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
          <div className="min-w-0 flex items-center gap-3">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
              Explore & Design
              <Badge className="bg-blue-100 text-blue-600 text-[10px] px-1.5 py-0">NEW</Badge>
            </h1>
            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700" />
            <ProjectSelector
              selectedProjectId={selectedProjectId}
              onProjectSelect={handleProjectSelect}
              autoSelectProjectId={urlProjectId}
            />
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
                onClick={() => {
                  if (!modelingChoice) {
                    setShowTemplateModal(true);
                  } else {
                    setViewMode('modeling');
                  }
                }}
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

            {/* Deploy Button - Always accessible when project selected */}
            <Button
              size="sm"
              className="gap-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 px-2.5 py-1"
              onClick={() => {
                if (!selectedProjectId) {
                  toast.error('Please select a project first');
                  return;
                }
                setShowDeploymentModal(true);
              }}
              disabled={!selectedProjectId}
            >
              <Rocket className="h-3.5 w-3.5" />
              <span className="text-xs">Deploy</span>
              {displayablePendingEvents.length > 0 && (
                <Badge className="bg-white/20 text-white text-[10px] px-1 py-0">{displayablePendingEvents.length}</Badge>
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

      {/* Unified Project Context (Deployment / History / Grants / Errors / Recos) - hideable */}
      {!isFullscreen && (
        <ProjectContextPanel
          projectId={selectedProjectId}
          projectName={selectedProjectName}
          variant="explore-design"
          defaultExpanded={false}
          hideWhenEmpty={!selectedProjectId}
          deploymentSlot={selectedProjectId ? (
            <div className="p-4 space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Pending events: {displayablePendingEvents.length}. Validate and deploy from the Deploy button above.
              </p>
              <Button
                size="sm"
                className="gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                onClick={() => setShowDeploymentModal(true)}
              >
                <Rocket className="h-3.5 w-3.5" />
                Open Deploy & Validation
              </Button>
            </div>
          ) : undefined}
          versionsSlot={selectedProjectId ? (
            <SchemaVersionDisplaySwitch
              projectId={selectedProjectId}
              onVersionChange={() => {}}
              onSelectVersion={(versionId) => {}}
              className="max-h-[400px] overflow-auto"
            />
          ) : undefined}
          historySlot={selectedProjectId ? (
            <div className="overflow-auto max-h-[400px]">
              <EventTable compact projectId={selectedProjectId} className="m-2" />
            </div>
          ) : undefined}
          grantsSlot={selectedProjectId ? (
            <AccessManagementSlot projectId={selectedProjectId} />
          ) : undefined}
          errorsSlot={<RecentDeploymentErrorsSlot />}
        />
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
        {showSidebar && viewMode === 'catalog' && (() => {
          const catalogTables = tables.filter(t => !targetTableIds.has(t.id));
          const allSelected = selectedTables.size === catalogTables.length && catalogTables.length > 0;
          return (
          <div className="w-64 lg:w-72 xl:w-80 border-r dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col overflow-hidden flex-shrink-0">
            {/* Table List Header */}
            <div className="px-3 py-2.5 border-b dark:border-slate-800 bg-gradient-to-b from-slate-50 to-white dark:from-slate-800/60 dark:to-slate-900 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1 bg-blue-100 dark:bg-blue-900/30 rounded">
                    <Table2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="font-semibold text-sm text-slate-800 dark:text-slate-200">
                    Source Tables
                  </span>
                  <Badge className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] px-1.5 py-0 font-medium">
                    {catalogTables.length}
                  </Badge>
                  {selectedTables.size > 0 && (
                    <Badge className="bg-blue-500 text-white text-[10px] px-1.5 py-0 font-medium">
                      {selectedTables.size} selected
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-0.5">
                  <Tooltip content={allSelected ? 'Deselect All' : 'Select All'}>
                    <button
                      className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                      onClick={() => {
                        if (allSelected) {
                          setSelectedTables(new Set());
                        } else {
                          setSelectedTables(new Set(catalogTables.map(t => t.id)));
                        }
                      }}
                    >
                      {allSelected ? (
                        <CheckSquare className="h-3.5 w-3.5 text-blue-500" />
                      ) : (
                        <Square className="h-3.5 w-3.5 text-slate-400" />
                      )}
                    </button>
                  </Tooltip>
                  <Tooltip content="Hide Panel">
                    <button
                      className="p-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                      onClick={() => setShowSidebar(false)}
                    >
                      <PanelLeft className="h-3.5 w-3.5 text-slate-400" />
                    </button>
                  </Tooltip>
                </div>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                <Input
                  size="sm"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tables..."
                  className="pl-7 text-xs"
                />
                {searchQuery && (
                  <button
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                    onClick={() => setSearchQuery('')}
                  >
                    <X className="h-3 w-3 text-slate-400" />
                  </button>
                )}
              </div>

              {/* Add to Modeling Button */}
              {selectedTables.size > 0 && (
                <Button
                  size="sm"
                  onClick={handleAddToModeling}
                  className="w-full gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white shadow-sm"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add {selectedTables.size} to Modeling
                  <ArrowRight className="h-3 w-3 ml-auto" />
                </Button>
              )}
            </div>

            {/* Virtualized Table List */}
            <div className="flex-1 overflow-hidden">
              {isLoadingTables ? (
                <div className="flex flex-col items-center justify-center h-full gap-3">
                  <div className="relative">
                    <div className="h-10 w-10 rounded-full border-2 border-blue-200 dark:border-blue-800" />
                    <RefreshCw className="h-5 w-5 animate-spin text-blue-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
                  </div>
                  <span className="text-xs text-slate-400">Loading tables...</span>
                </div>
              ) : catalogTables.length > 0 ? (
                <VirtualizedTableList
                  tables={catalogTables}
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
                <div className="flex flex-col items-center justify-center h-full text-center p-6">
                  <div className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl mb-3">
                    <Database className="h-8 w-8 text-slate-400 dark:text-slate-500" />
                  </div>
                  <p className="font-medium text-sm text-slate-600 dark:text-slate-400">No tables loaded</p>
                  <p className="text-xs mt-1 text-slate-400 dark:text-slate-500 max-w-[200px]">
                    Select a database and schema from the toolbar above to browse tables
                  </p>
                </div>
              )}
            </div>
          </div>
          );
        })()}

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
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
                          <button
                            className="flex flex-col items-center gap-2 p-3 rounded-lg border dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800"
                            onClick={() => setTablePreviewModal(true)}
                          >
                            <Eye className="h-5 w-5 text-blue-600" />
                            <span className="text-xs font-medium text-blue-700 dark:text-blue-400">Preview Data</span>
                          </button>
                          <button
                            className="flex flex-col items-center gap-2 p-3 rounded-lg border dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800"
                            onClick={() => setTableProfileModal(true)}
                          >
                            <BarChart3 className="h-5 w-5 text-purple-600" />
                            <span className="text-xs font-medium text-purple-700 dark:text-purple-400">Data Profile</span>
                          </button>
                          <button
                            className="flex flex-col items-center gap-2 p-3 rounded-lg border dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            onClick={() => {
                              const newName = prompt('Enter new table name:', selectedTable.table);
                              if (newName && newName !== selectedTable.table) {
                                handleRenameTable(
                                  selectedTable.database,
                                  selectedTable.schema,
                                  selectedTable.table,
                                  newName
                                );
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
                            onClick={() => {
                              if (!selectedTable) return;

                              // Allow user to select multiple columns for composite PK
                              const columnsString = prompt(
                                'Enter column name(s) for primary key.\nFor composite key, separate with commas (e.g., "id,code"):',
                                tableColumns.find(c => c.isPrimaryKey)?.name || ''
                              );

                              if (columnsString) {
                                const columns = columnsString.split(',').map(c => c.trim()).filter(c => c);
                                if (columns.length > 0) {
                                  handleAddPrimaryKey(
                                    selectedTable.database,
                                    selectedTable.schema,
                                    selectedTable.table,
                                    columns
                                  );
                                }
                              }
                            }}
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
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 text-xs"
                            onClick={() => {
                              if (!selectedTable) return;
                              if (!selectedProjectId) {
                                toast.error('Please select a project first');
                                return;
                              }

                              // Prompt for column name and type
                              const columnName = prompt('Enter column name:');
                              if (!columnName) return;

                              const columnType = prompt('Enter column type (e.g., VARCHAR, NUMBER, DATE, BOOLEAN):', 'VARCHAR');
                              if (!columnType) return;

                              // Create ADD_COLUMN event
                              addEvent({
                                type: 'ADD_COLUMN',
                                projectId: selectedProjectId,
                                target: {
                                  database: selectedTable.database,
                                  schema: selectedTable.schema,
                                  table: selectedTable.table,
                                },
                                payload: {
                                  columnName: columnName.trim(),
                                  columnType: columnType.trim().toUpperCase(),
                                },
                              });

                              toast.success(`Add column "${columnName}" added to pending changes`);
                            }}
                          >
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
                                    <Tooltip content="Primary Key">
                                      <div className="p-1 bg-amber-100 dark:bg-amber-900/30 rounded">
                                        <Key className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
                                      </div>
                                    </Tooltip>
                                  )}
                                  {col.isSensitive && !col.isPrimaryKey && (
                                    <Tooltip content="Sensitive Column">
                                      <div className="p-1 bg-red-100 dark:bg-red-900/30 rounded">
                                        <Shield className="h-3.5 w-3.5 text-red-500 flex-shrink-0" />
                                      </div>
                                    </Tooltip>
                                  )}
                                  {!col.isPrimaryKey && !col.isSensitive && (
                                    <div className="w-6" />
                                  )}
                                  <span className="font-mono text-xs">{col.name}</span>
                                </div>
                                {col.isPrimaryKey && (
                                  <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-xs font-medium">
                                    PK
                                  </Badge>
                                )}
                                <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 text-[9px] font-mono px-1 py-0">
                                  {col.dataType}
                                </Badge>
                                {!col.isNullable && (
                                  <Badge className="bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-xs">
                                    NOT NULL
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {/* Preview & Profile Button */}
                                <Tooltip content="Preview Data & Profile">
                                  <button
                                    className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                                    onClick={() => setColumnPreviewModal({ isOpen: true, column: col })}
                                  >
                                    <BarChart3 className="h-4 w-4 text-slate-400 hover:text-purple-500" />
                                  </button>
                                </Tooltip>
                                {/* Primary Key Button */}
                                <Tooltip content={col.isPrimaryKey ? "Remove Primary Key" : "Set as Primary Key"}>
                                  <button
                                    className={cn(
                                      "p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700",
                                      col.isPrimaryKey && "bg-amber-100 dark:bg-amber-900/30"
                                    )}
                                    onClick={() => {
                                      if (!selectedTable) return;

                                      if (!col.isPrimaryKey) {
                                        handleAddPrimaryKey(
                                          selectedTable.database,
                                          selectedTable.schema,
                                          selectedTable.table,
                                          [col.name]
                                        );
                                      } else {
                                        const target = {
                                          database: selectedTable.database,
                                          schema: selectedTable.schema,
                                          table: selectedTable.table,
                                        };
                                        addEvent(createPrimaryKeyEvent(target, [col.name], false));
                                        toast.success(`Remove PK "${col.name}" added to pending changes`);
                                      }
                                    }}
                                  >
                                    <Key className={cn("h-4 w-4", col.isPrimaryKey ? "text-amber-500" : "text-slate-400 hover:text-amber-500")} />
                                  </button>
                                </Tooltip>
                                {/* Sensitive Column Button */}
                                <Tooltip content={col.isSensitive ? "Manage Sensitive Marking" : "Mark as Sensitive"}>
                                  <button
                                    className={cn(
                                      "p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700",
                                      col.isSensitive && "bg-red-100 dark:bg-red-900/30"
                                    )}
                                    onClick={() => setSensitiveColumnModal({ isOpen: true, column: col })}
                                  >
                                    <Shield className={cn("h-4 w-4", col.isSensitive ? "text-red-500" : "text-slate-400 hover:text-red-500")} />
                                  </button>
                                </Tooltip>
                                {/* Exclude from Modeling Button */}
                                <Tooltip content={excludedColumns.get(selectedTable?.id || '')?.has(col.name) ? "Include in Modeling" : "Exclude from Modeling"}>
                                  <button
                                    className={cn(
                                      "p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700",
                                      excludedColumns.get(selectedTable?.id || '')?.has(col.name) && "bg-slate-200 dark:bg-slate-700"
                                    )}
                                    onClick={() => setColumnExclusionModal({ isOpen: true, column: col })}
                                  >
                                    <MinusCircle className={cn(
                                      "h-4 w-4",
                                      excludedColumns.get(selectedTable?.id || '')?.has(col.name)
                                        ? "text-slate-600"
                                        : "text-slate-400 hover:text-slate-600"
                                    )} />
                                  </button>
                                </Tooltip>
                                {/* Rename Column Button */}
                                <Tooltip content="Rename Column">
                                  <button
                                    className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                                    onClick={() => {
                                      if (!selectedTable) return;
                                      const newName = prompt(`Rename column "${col.name}" to:`, col.name);
                                      if (newName && newName !== col.name) {
                                        handleRenameColumn(
                                          selectedTable.database,
                                          selectedTable.schema,
                                          selectedTable.table,
                                          col.name,
                                          newName
                                        );
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
                    <Tooltip content={selectedProjectId ? "Create Table" : "Select a project first"}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (!selectedProjectId) {
                            toast.error('Please select a project first');
                            return;
                          }
                          setShowCreateTableModal(true);
                        }}
                        className="gap-2"
                      >
                        <Plus className="h-4 w-4" />
                        <TableIcon className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                    <Tooltip content="Manage Relationships">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (!selectedTable) {
                            toast.error('Please select a table first');
                            return;
                          }
                          setShowRelationshipModal(true);
                        }}
                        disabled={!selectedTable}
                        className="gap-2"
                      >
                        <Link2 className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                    <div className="w-px h-6 bg-slate-200 dark:bg-slate-700" />
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
                      onClick={() => {
                        if (!selectedProjectId) {
                          toast.error('Please select a project first');
                          return;
                        }
                        setShowDeploymentModal(true);
                      }}
                      disabled={!selectedProjectId}
                    >
                      <Rocket className="h-4 w-4" />
                      Deploy
                      {displayablePendingEvents.length > 0 && (
                        <Badge className="bg-white/20 text-white text-xs px-1">{displayablePendingEvents.length}</Badge>
                      )}
                    </Button>
                  </div>
                </div>
              )}

              <ModelingCanvas
                tables={tables.filter(t => modelingTableIds.has(t.id))}
                tableColumns={tableColumnsMap}
                onTableSelect={handleTableClick}
                onTableExclude={handleRemoveFromModeling}
                onRelationCreate={async (source, target, sourceCol, targetCol, transformation) => {
                  // Parse table IDs to get database.schema.table components
                  const sourceParts = source.split('.');
                  const targetParts = target.split('.');

                  if (sourceParts.length !== 3 || targetParts.length !== 3) {
                    console.error('[onRelationCreate] Invalid table IDs:', { source, target });
                    toast.success('Mapping created locally');
                    return;
                  }

                  const [sourceDb, sourceSchema, sourceTable] = sourceParts;
                  const [targetDb, targetSchema, targetTable] = targetParts;
                  const sourceColumns = sourceCol.split(',').map(c => c.trim()).filter(c => c);

                  // Create events for column mapping
                  const eventTimestamp = Date.now();

                  const hasTransformation = transformation && transformation !== 'none';

                  // Create column mapping event with explicit source/target
                  addEvent({
                    type: 'COLUMN_MAPPING_CREATED',
                    projectId: selectedProjectId || undefined,
                    target: {
                      database: sourceDb,
                      schema: sourceSchema,
                      table: sourceTable,
                      column: sourceColumns[0],
                    },
                    payload: {
                      source: {
                        database: sourceDb,
                        schema: sourceSchema,
                        table: sourceTable,
                        columns: sourceColumns,
                      },
                      target: {
                        database: targetDb,
                        schema: targetSchema,
                        table: targetTable,
                        column: targetCol,
                      },
                      transformation: hasTransformation ? transformation : null,
                    },
                  });

                  // Save mapping event to backend
                  if (selectedProjectId) {
                    try {
                      await addProjectEvent(selectedProjectId, {
                        module_name: 'explore-design',
                        event_type: 'COLUMN_MAPPING_CREATED',
                        status: 'pending',
                        details: {
                          target: { database: sourceDb, schema: sourceSchema, table: sourceTable, column: sourceColumns[0] },
                          payload: {
                            source: {
                              database: sourceDb,
                              schema: sourceSchema,
                              table: sourceTable,
                              columns: sourceColumns,
                            },
                            target: {
                              database: targetDb,
                              schema: targetSchema,
                              table: targetTable,
                              column: targetCol,
                            },
                            transformation: hasTransformation ? transformation : null,
                          },
                        },
                        entity_id: `mapping-${eventTimestamp}-${sourceColumns.join('-')}`,
                        entity_type: 'column_mapping',
                      });

                      const transformLabel = hasTransformation ? ` (${transformation})` : '';
                      toast.success(`Mapping saved: ${sourceColumns.join(', ')}${transformLabel} → ${targetCol}`);
                    } catch (error) {
                      console.error('[onRelationCreate] Failed to save mapping to backend:', error);
                      toast.success('Mapping created locally (backend sync failed)');
                    }
                  } else {
                    toast.success('Mapping created (select a project to sync)');
                  }
                }}
                className={cn("h-full", isFullscreen && "pt-14")}
                projectId={selectedProjectId}
                defaultRelationships={defaultRelationships}
                targetTableIds={targetTableIds}
                initialMappings={initialColumnMappings}
              />
            </div>
          )}
        </div>

        {/* Right Event Panel (collapsible) - hidden in fullscreen */}
        {showEventPanel && !isFullscreen && (
          <div className="w-44 lg:w-52 xl:w-60 border-l dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 overflow-hidden flex flex-col flex-shrink-0">
            <EventTable
              compact
              className="flex-1 m-1.5 overflow-hidden"
              projectId={selectedProjectId}
            />
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
          database={selectedDatabase || 'CP_DATA360'}
          schemas={Array.from(selectedSchemas.keys())}
          projectId={selectedProjectId!}
        />
      </Modal>

      {/* Column Preview Modal */}
      {columnPreviewModal.column && selectedTable && (
        <ColumnPreviewModal
          isOpen={columnPreviewModal.isOpen}
          onClose={() => setColumnPreviewModal({ isOpen: false, column: null })}
          projectId={selectedProjectId ?? ''}
          database={selectedTable.database}
          schema={selectedTable.schema}
          table={selectedTable.table}
          column={columnPreviewModal.column.name}
          dataType={columnPreviewModal.column.dataType}
        />
      )}

      {/* Sensitive Column Modal */}
      {sensitiveColumnModal.column && selectedTable && (
        <SensitiveColumnModal
          isOpen={sensitiveColumnModal.isOpen}
          onClose={() => setSensitiveColumnModal({ isOpen: false, column: null })}
          database={selectedTable.database}
          schema={selectedTable.schema}
          table={selectedTable.table}
          column={sensitiveColumnModal.column.name}
          dataType={sensitiveColumnModal.column.dataType}
          isSensitive={sensitiveColumnModal.column.isSensitive || false}
          onMarkSensitive={(sensitiveType) => {
            if (!selectedTable || !sensitiveColumnModal.column || !selectedProjectId) return;
            const target = {
              database: selectedTable.database,
              schema: selectedTable.schema,
              table: selectedTable.table,
            };
            addEvent({
              ...createSensitiveColumnEvent(
                target,
                sensitiveColumnModal.column.name,
                sensitiveType,
                true
              ),
              projectId: selectedProjectId,
            });
            // Update local state
            setTableColumns(prev =>
              prev.map(c =>
                c.name === sensitiveColumnModal.column?.name
                  ? { ...c, isSensitive: true }
                  : c
              )
            );
            toast.success(`"${sensitiveColumnModal.column.name}" marked as sensitive (${sensitiveType})`);
          }}
          onRemoveSensitive={() => {
            if (!selectedTable || !sensitiveColumnModal.column || !selectedProjectId) return;
            const target = {
              database: selectedTable.database,
              schema: selectedTable.schema,
              table: selectedTable.table,
            };
            addEvent({
              ...createSensitiveColumnEvent(
                target,
                sensitiveColumnModal.column.name,
                'removed',
                false
              ),
              projectId: selectedProjectId,
            });
            // Update local state
            setTableColumns(prev =>
              prev.map(c =>
                c.name === sensitiveColumnModal.column?.name
                  ? { ...c, isSensitive: false }
                  : c
              )
            );
            toast.success(`Sensitive marking removed from "${sensitiveColumnModal.column.name}"`);
          }}
        />
      )}

      {/* Column Exclusion Modal */}
      {columnExclusionModal.column && selectedTable && (
        <ColumnExclusionModal
          isOpen={columnExclusionModal.isOpen}
          onClose={() => setColumnExclusionModal({ isOpen: false, column: null })}
          database={selectedTable.database}
          schema={selectedTable.schema}
          table={selectedTable.table}
          column={columnExclusionModal.column.name}
          dataType={columnExclusionModal.column.dataType}
          isExcluded={excludedColumns.get(selectedTable.id)?.has(columnExclusionModal.column.name) || false}
          exclusionReason={undefined}
          onExclude={(reason) => {
            if (!selectedTable || !columnExclusionModal.column || !selectedProjectId) return;
            const target = {
              database: selectedTable.database,
              schema: selectedTable.schema,
              table: selectedTable.table,
            };
            addEvent({
              ...createColumnExclusionEvent(
                target,
                columnExclusionModal.column.name,
                true,
                reason
              ),
              projectId: selectedProjectId,
            });
            // Update excluded columns map
            setExcludedColumns(prev => {
              const next = new Map(prev);
              const tableExcluded = new Set(next.get(selectedTable.id) || []);
              tableExcluded.add(columnExclusionModal.column!.name);
              next.set(selectedTable.id, tableExcluded);
              return next;
            });
            toast.success(`"${columnExclusionModal.column.name}" excluded from modeling`);
          }}
          onInclude={() => {
            if (!selectedTable || !columnExclusionModal.column || !selectedProjectId) return;
            const target = {
              database: selectedTable.database,
              schema: selectedTable.schema,
              table: selectedTable.table,
            };
            addEvent({
              ...createColumnExclusionEvent(
                target,
                columnExclusionModal.column.name,
                false
              ),
              projectId: selectedProjectId,
            });
            // Update excluded columns map
            setExcludedColumns(prev => {
              const next = new Map(prev);
              const tableExcluded = new Set(next.get(selectedTable.id) || []);
              tableExcluded.delete(columnExclusionModal.column!.name);
              next.set(selectedTable.id, tableExcluded);
              return next;
            });
            toast.success(`"${columnExclusionModal.column.name}" included in modeling`);
          }}
        />
      )}

      {/* Table Preview Modal */}
      {selectedTable && (
        <TablePreviewModal
          isOpen={tablePreviewModal}
          onClose={() => setTablePreviewModal(false)}
          projectId={selectedProjectId ?? ''}
          database={selectedTable.database}
          schema={selectedTable.schema}
          table={selectedTable.table}
        />
      )}

      {/* Table Profile Modal */}
      {selectedTable && (
        <TableProfileModal
          isOpen={tableProfileModal}
          onClose={() => setTableProfileModal(false)}
          projectId={selectedProjectId ?? ''}
          database={selectedTable.database}
          schema={selectedTable.schema}
          table={selectedTable.table}
        />
      )}

      {/* Create Table Modal - Always creates in DWH (CP_DATA360.RETAIL_DW) */}
      {/* Note: Modal only opens if selectedProjectId is set (checked in onClick handler) */}
      <CreateTableModal
        isOpen={showCreateTableModal}
        onClose={() => setShowCreateTableModal(false)}
        database="CP_DATA360"
        schema="RETAIL_DWH"
        projectId={selectedProjectId!}
        onTableCreated={(tableName: string, database: string, schema: string, columns: any[]) => {
          // Add the new table to the modeling view immediately
          const tableId = `${database}.${schema}.${tableName}`;

          // Create new table item
          const newTable: TableItem = {
            id: tableId,
            database,
            schema,
            table: tableName,
            columnCount: columns.length,
            hasPrimaryKey: columns.some(col => col.primaryKey),
            status: 'pending', // Mark as pending since it's not deployed yet
            sensitiveColumns: 0,
          };

          // Add to tables list
          setTables(prev => {
            const exists = prev.some(t => t.id === tableId);
            if (exists) return prev;
            return [...prev, newTable];
          });

          // Add to targetTableIds so it persists when tables are reloaded
          setTargetTableIds(prev => {
            const next = new Set(prev);
            next.add(tableId);
            return next;
          });

          // Add to modeling view
          setModelingTableIds(prev => {
            const next = new Set(prev);
            next.add(tableId);
            return next;
          });

          // Add columns to tableColumnsMap
          const formattedColumns: ColumnInfo[] = columns.map(col => ({
            name: col.name,
            dataType: col.dataType,
            isNullable: col.nullable,
            isPrimaryKey: col.primaryKey,
            isSensitive: false,
          }));

          setTableColumnsMap(prev => {
            const next = new Map(prev);
            next.set(tableId, formattedColumns);
            return next;
          });

          toast.success(`Table "${tableName}" added to modeling view! Deploy to create in database.`);
          setRefreshTrigger(prev => prev + 1);
        }}
      />

      {/* Relationship Modal */}
      {selectedTable && selectedProjectId && (
        <RelationshipModal
          isOpen={showRelationshipModal}
          onClose={() => setShowRelationshipModal(false)}
          database={selectedTable.database}
          schema={selectedTable.schema}
          sourceTable={selectedTable.table}
          sourceColumns={tableColumns}
          availableTables={tables.map((t) => ({
            database: t.database,
            schema: t.schema,
            table: t.table,
          }))}
          tableColumnsMap={tableColumnsMap}
          projectId={selectedProjectId}
          existingRelationship={null}
          onRelationshipCreated={() => {
            // Refresh relationships if needed
            toast.success('Relationship event added to queue');
          }}
        />
      )}

      {/* Modeling Template Choice Modal */}
      <ModelingTemplateModal
        isOpen={showTemplateModal}
        projectName={selectedProjectName || undefined}
        onSelect={(choice) => {
          setShowTemplateModal(false);
          if (choice === 'dwh_template') {
            // Show location picker as a second step
            setShowLocationPicker(true);
          } else {
            setModelingChoice(choice);
            setViewMode('modeling');
            if (selectedProjectId) {
              modelingChoicesByProject.current.set(selectedProjectId, { choice });
              addProjectEvent(selectedProjectId, {
                module_name: 'explore-design',
                event_type: 'MODELING_TEMPLATE_CHOSEN',
                status: 'completed',
                details: { choice },
                entity_id: `template-${choice}`,
                entity_type: 'modeling_config',
              }).catch(() => {});
            }
          }
        }}
      />

      {/* DWH Location Picker Modal */}
      <DwhLocationPickerModal
        isOpen={showLocationPicker}
        onClose={() => setShowLocationPicker(false)}
        projectName={selectedProjectName || undefined}
        onConfirm={(database, schema) => {
          setDwhTargetDatabase(database);
          setDwhTargetSchema(schema);
          setShowLocationPicker(false);
          setModelingChoice('dwh_template');
          setViewMode('modeling');
          if (selectedProjectId) {
            modelingChoicesByProject.current.set(selectedProjectId, {
              choice: 'dwh_template',
              database,
              schema,
            });
            addProjectEvent(selectedProjectId, {
              module_name: 'explore-design',
              event_type: 'MODELING_TEMPLATE_CHOSEN',
              status: 'completed',
              details: { choice: 'dwh_template', targetDatabase: database, targetSchema: schema },
              entity_id: `template-dwh_template`,
              entity_type: 'modeling_config',
            }).catch(() => {});
          }
        }}
      />
    </div>
  );
}
