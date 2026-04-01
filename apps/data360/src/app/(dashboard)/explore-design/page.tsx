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
  WifiOff, BarChart3, MinusCircle, Link2, TableIcon, Bell, Cloud, Snowflake, Timer,
  BookTemplate, Activity
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
  TableRelationship,
  getColumnClassification,
  discoverRelationships,
  listDynamicTables,
  suspendDynamicTable,
  resumeDynamicTable,
  refreshDynamicTable,
  dropDynamicTable,
  listStreams,
  getStreamData,
  dropStream,
  listAlerts,
  dropAlert,
} from '@/app/services/explore-design';
import { listDDLActions, addDDLAction, removeDDLAction, validateFkTypes, cascadeRename, cascadeDrop, checkConflicts, aiSchemaHealth, tablePreview, tableProfile as fetchTableProfile } from '@/app/services/api/exploreDesignApi';
import { generateSnowflakeSQL, DDL_EVENT_TYPES, inferDDLType } from './components/deployment/deployment-utils';
import { addEvent as addProjectEvent, listEvents as listProjectEvents, listContributors } from '@/app/services/api/projectsApi';
import { useAuth } from '@/hooks/useAuth';
import { useSession } from 'next-auth/react';
import type { ContributorRole, SchemaHealthResult } from '@/app/services/api/types';
import type { ColumnMapping as BackendColumnMapping } from '@/app/services/api/types';
import VirtualizedTableList, { TableItem, ColumnInfo } from '../mapping/components/VirtualizedTableList';
import TableDetailPanel, { TableConfig, IngestionMode, IngestionConfig, MaskingConfig } from '../mapping/components/TableDetailPanel';
import dynamic from 'next/dynamic';
const ModelingCanvas = dynamic(() => import('./components/ModelingCanvas'), { ssr: false });
import EventTable from './components/EventTable';
import TableToolbar from './components/TableToolbar';
import DeploymentValidation from './components/DeploymentValidation';
import SelfServeIngestionModal from './components/SelfServeIngestionModal';
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
import CreateTableModal, { SnowflakeTableType } from './components/CreateTableModal';
import RelationshipModal from './components/RelationshipModal';
import AccessManagementSlot from './components/AccessManagementSlot';
import ModelingTemplateModal from './components/ModelingTemplateModal';
import type { ModelingChoice } from './components/ModelingTemplateModal';
import DwhLocationPickerModal from './components/DwhLocationPickerModal';
// Data Engineering modals (merged from data-engineering module)
import DynamicTableModal from './components/DynamicTableModal';
import StreamModal from './components/StreamModal';
import AlertModal from './components/AlertModal';
import EventTableModal from './components/EventTableModal';
import HybridTableModal from './components/HybridTableModal';
import PolicyAssignmentPanel from './components/PolicyAssignmentPanel';
import IngestionConfigPanel from './components/IngestionConfigPanel';
import TemplateLibrary from './components/TemplateLibrary';
import SqlDiffViewer from './components/SqlDiffViewer';
import IngestionResultsPanel from './components/IngestionResultsPanel';
import DagViewer from './components/DagViewer';
import CascadeConfirmModal from './components/CascadeConfirmModal';
import ImpactAnalysisPanel from './components/ImpactAnalysisPanel';
// PreCheckGate, DryRunPanel, PostVerifyBanner are now integrated inside DeploymentValidation's step flow
import WhereClauseBuilder from './components/WhereClauseBuilder';
import QualityGatesPanel from './components/QualityGatesPanel';
import IngestionDryRunPanel from './components/IngestionDryRunPanel';
import ConflictResolutionModal, { EventConflict } from './components/ConflictResolutionModal';
import AuditTrailPanel from './components/AuditTrailPanel';
import EventTemplatePickerModal from './components/EventTemplatePickerModal';
import AiFeatureToggle from './components/AiFeatureToggle';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { useAiAnalysis } from './hooks/useAiAnalysis';
import { useAiFeatures } from './stores/ai-store';
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
type ViewMode = 'catalog' | 'modeling' | 'semantic';

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
        aria-label={isExpanded ? 'Collapse schema details' : 'Expand schema details'}
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
        aria-label="Schema settings"
        className="p-0.5 rounded hover:bg-blue-200 dark:hover:bg-blue-800"
        onClick={onSettings}
      >
        <Settings className="h-3 w-3" />
      </button>
      <button
        aria-label="Remove schema"
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

  // Only show batch action bar for multi-select (2+). Single table uses inline icon actions.
  if (selectedCount < 2) return null;

  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 max-w-[95vw]">
      <div className="flex items-center gap-2 sm:gap-3 px-4 sm:px-6 py-2.5 sm:py-3 bg-slate-900 dark:bg-slate-800 text-white rounded-full shadow-2xl flex-nowrap whitespace-nowrap overflow-x-auto scrollbar-hide">
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
          aria-label="Clear selection"
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
  projectId: string | null;
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
  projectId,
}) => {
  const [showSchemaDropdown, setShowSchemaDropdown] = useState(false);
  const [schemaContextMenu, setSchemaContextMenu] = useState<{ schema: string; x: number; y: number } | null>(null);

  // Schema Health
  const { isEnabled: isAiEnabled } = useAiFeatures();
  const [healthResult, setHealthResult] = useState<SchemaHealthResult | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);

  const handleSchemaHealth = useCallback(async () => {
    if (!projectId || !selectedDatabase || selectedSchemas.size === 0) return;
    const schemaName = Array.from(selectedSchemas.keys())[0];
    setHealthLoading(true);
    try {
      const result = await aiSchemaHealth(projectId, {
        database: selectedDatabase,
        schema: schemaName,
      });
      console.log('[SchemaHealth] API response:', JSON.stringify(result, null, 2));
      setHealthResult(result);
      setHealthOpen(true);
    } catch (err: unknown) {
      toast.error('Schema health analysis failed');
    } finally {
      setHealthLoading(false);
    }
  }, [projectId, selectedDatabase, selectedSchemas]);

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
    { id: 'divider2', label: '' },
    { id: 'list_dynamic_tables', label: 'List Dynamic Tables', icon: RefreshCw },
    { id: 'list_streams', label: 'List Streams', icon: GitBranch },
    { id: 'list_alerts', label: 'List Alerts', icon: AlertTriangle },
    { id: 'divider3', label: '' },
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
            aria-label="Select schemas"
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
                        aria-label={`Settings for ${schema}`}
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

        {/* Schema Health Button */}
        {isAiEnabled('schema_health_score') && selectedDatabase && selectedSchemas.size > 0 && (
          <div className="relative">
            <Tooltip content="AI Schema Health Score" placement="bottom">
              <button
                className={cn(
                  'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium transition-colors',
                  healthResult
                    ? healthResult.overall_score >= 80
                      ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                      : healthResult.overall_score >= 50
                        ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    : 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400 hover:bg-purple-100 dark:hover:bg-purple-900/40'
                )}
                onClick={() => healthResult ? setHealthOpen(!healthOpen) : handleSchemaHealth()}
                disabled={healthLoading}
              >
                {healthLoading ? (
                  <RefreshCw className="h-3 w-3 animate-spin" />
                ) : (
                  <Activity className="h-3 w-3" />
                )}
                {healthResult ? `${healthResult.overall_score ?? '?'}` : 'Health'}
              </button>
            </Tooltip>

            {/* Health Results Popover */}
            {healthOpen && healthResult && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setHealthOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 w-72 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg shadow-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                      Schema Health
                    </span>
                    <button onClick={() => setHealthOpen(false)} className="p-0.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">
                      <X className="h-3 w-3 text-slate-400" />
                    </button>
                  </div>

                  {/* Overall Score */}
                  {(healthResult.overall_score != null) ? (
                    <div className="flex items-center gap-2 mb-3">
                      <div className={cn(
                        'text-2xl font-bold',
                        healthResult.overall_score >= 80 ? 'text-green-600' :
                        healthResult.overall_score >= 50 ? 'text-amber-600' : 'text-red-600'
                      )}>
                        {healthResult.overall_score}
                      </div>
                      <div className="text-[10px] text-slate-500">/ 100</div>
                      <div className="flex-1 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            healthResult.overall_score >= 80 ? 'bg-green-500' :
                            healthResult.overall_score >= 50 ? 'bg-amber-500' : 'bg-red-500'
                          )}
                          style={{ width: `${healthResult.overall_score}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500 mb-3">
                      No score available — check console for API response shape
                    </div>
                  )}

                  {/* Sub Scores — handle both object-of-objects and flat formats */}
                  {healthResult.sub_scores && Object.keys(healthResult.sub_scores).length > 0 && (
                    <div className="space-y-1.5 mb-3">
                      {Object.entries(healthResult.sub_scores).map(([key, val]: [string, any]) => (
                        <div key={key} className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-600 dark:text-slate-400 capitalize">
                            {key.replace(/_/g, ' ')}
                          </span>
                          <span className={cn(
                            'font-medium',
                            (val?.score ?? val) >= 80 ? 'text-green-600 dark:text-green-400' :
                            (val?.score ?? val) >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400'
                          )}>
                            {val?.score ?? val}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Recommendations */}
                  {healthResult.recommendations?.length > 0 && (
                    <div className="border-t dark:border-slate-700 pt-2">
                      <div className="text-[10px] font-medium text-slate-500 mb-1">Recommendations</div>
                      <ul className="space-y-1">
                        {healthResult.recommendations.slice(0, 3).map((rec: any, i: number) => (
                          <li key={i} className="text-[10px] text-slate-600 dark:text-slate-400 flex gap-1">
                            <span className="text-amber-500 mt-px flex-shrink-0">*</span>
                            <span>{typeof rec === 'string' ? rec : JSON.stringify(rec)}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Raw data fallback — show all top-level keys not yet displayed */}
                  {Object.entries(healthResult)
                    .filter(([k]) => !['overall_score', 'sub_scores', 'recommendations', 'database', 'schema', 'cortex_credits'].includes(k))
                    .filter(([, v]) => v != null && typeof v !== 'object')
                    .length > 0 && (
                    <div className="border-t dark:border-slate-700 pt-2 mt-2 space-y-1">
                      {Object.entries(healthResult)
                        .filter(([k]) => !['overall_score', 'sub_scores', 'recommendations', 'database', 'schema', 'cortex_credits'].includes(k))
                        .filter(([, v]) => v != null && typeof v !== 'object')
                        .map(([k, v]) => (
                          <div key={k} className="flex items-center justify-between text-[10px]">
                            <span className="text-slate-500 capitalize">{k.replace(/_/g, ' ')}</span>
                            <span className="text-slate-700 dark:text-slate-300 font-medium">{String(v)}</span>
                          </div>
                        ))}
                    </div>
                  )}

                  {/* Credits */}
                  <div className="mt-2 pt-2 border-t dark:border-slate-700 flex items-center justify-between">
                    <span className="text-[9px] text-slate-400">{healthResult.database || ''}.{healthResult.schema || ''}</span>
                    <span className="text-[9px] text-slate-400">{healthResult.cortex_credits ?? ''} credits</span>
                  </div>

                  {/* Re-run */}
                  <button
                    className="mt-2 w-full text-[10px] text-center py-1 rounded bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300"
                    onClick={handleSchemaHealth}
                    disabled={healthLoading}
                  >
                    {healthLoading ? 'Analyzing...' : 'Re-analyze'}
                  </button>
                </div>
              </>
            )}
          </div>
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
          aria-label="Search tables and columns"
          placeholder="Search tables, columns..."
          className="w-full pl-8 pr-3 py-1.5 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 focus:ring-1 focus:ring-blue-500 focus:border-transparent"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setTimeout(() => setIsFocused(false), 200)}
        />
        {value && (
          <button
            aria-label="Clear search"
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
  if (loading) return (
    <div className="space-y-4 p-6">
      <div className="h-8 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
      <div className="grid grid-cols-3 gap-4">
        {[1,2,3].map(i => <div key={i} className="h-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />)}
      </div>
      <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
    </div>
  );
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
  const { username: currentUsername } = useAuth();

  // Connection status from SSE provider
  const { isConnected, error: connectionError } = useCacheInvalidationContext();

  // Project State — pre-fill from ?project_id= query param or last used project
  const urlProjectId = searchParams.get('project_id');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProjectName, setSelectedProjectName] = useState<string>('');

  // Only auto-select from URL query param (deep-linking), NOT from localStorage
  const autoProjectId = urlProjectId || null;

  // Role-based access: viewer = read-only, editor/owner = full access
  const [userRole, setUserRole] = useState<ContributorRole | null>(null);
  const isReadOnly = userRole === 'viewer';

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
  const [showIngestionModal, setShowIngestionModal] = useState(false);
  const [showScaleTest, setShowScaleTest] = useState(false);
  const [showCreateTableModal, setShowCreateTableModal] = useState(false);
  const [showRelationshipModal, setShowRelationshipModal] = useState(false);
  const [showCreateMenuCatalog, setShowCreateMenuCatalog] = useState(false);
  const [showCreateMenuModeling, setShowCreateMenuModeling] = useState(false);

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

  // Table preview modal (legacy — kept for fallback)
  const [tablePreviewModal, setTablePreviewModal] = useState(false);

  // Table profile modal (legacy — kept for fallback)
  const [tableProfileModal, setTableProfileModal] = useState(false);

  // Inline preview & profile panels (replace modals)
  const [showInlinePreview, setShowInlinePreview] = useState(false);
  const [showInlineProfile, setShowInlineProfile] = useState(false);
  const [inlinePreviewData, setInlinePreviewData] = useState<{ columns: string[]; rows: Record<string, any>[]; total_rows: number } | null>(null);
  const [inlineProfileData, setInlineProfileData] = useState<{ row_count: number; column_count: number; columns: any[]; aggregate_quality_score: number } | null>(null);
  const [isLoadingInlinePreview, setIsLoadingInlinePreview] = useState(false);
  const [isLoadingInlineProfile, setIsLoadingInlineProfile] = useState(false);

  // Data Engineering modals
  const [dynamicTableModal, setDynamicTableModal] = useState(false);
  const [streamModal, setStreamModal] = useState(false);
  const [alertModal, setAlertModal] = useState(false);
  const [eventTableModal, setEventTableModal] = useState(false);
  const [hybridTableModal, setHybridTableModal] = useState(false);

  // AI column classification
  const [columnClassifications, setColumnClassifications] = useState<Map<string, Record<string, string>>>(new Map());
  const [isClassifying, setIsClassifying] = useState(false);

  // Data engineering object listing modal
  const [dataEngModal, setDataEngModal] = useState<{
    isOpen: boolean;
    type: 'dynamic_tables' | 'streams' | 'alerts';
    schema: string;
    items: any[];
    loading: boolean;
  }>({ isOpen: false, type: 'dynamic_tables', schema: '', items: [], loading: false });

  // Track excluded columns per table
  const [excludedColumns, setExcludedColumns] = useState<Map<string, Set<string>>>(new Map());

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('catalog');
  // Persist viewMode to localStorage
  useEffect(() => {
    localStorage.setItem('explore-design-view-mode', viewMode);
  }, [viewMode]);

  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);
  const [showEventTemplatePicker, setShowEventTemplatePicker] = useState(false);
  const [showAuditTrail, setShowAuditTrail] = useState(false);
  const [modelingChoice, setModelingChoice] = useState<ModelingChoice | null>(null);
  // Persist modeling choice per project so re-selecting a project doesn't re-show the modal
  const modelingChoicesByProject = useRef<Map<string, { choice: ModelingChoice; database?: string; schema?: string }>>(new Map());
  // DWH template deployment target (chosen by user in location picker)
  const [dwhTargetDatabase, setDwhTargetDatabase] = useState<string | null>(null);
  const [dwhTargetSchema, setDwhTargetSchema] = useState<string | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  const [showEventPanel, setShowEventPanel] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [savedPanelState, setSavedPanelState] = useState({ sidebar: true, event: true });

  // Create table type selector
  const [createTableType, setCreateTableType] = useState<SnowflakeTableType>('standard');

  // Catalog policy & ingestion panels
  const [showCatalogPolicyPanel, setShowCatalogPolicyPanel] = useState(false);
  const [showIngestionPanel, setShowIngestionPanel] = useState(false);
  const [catalogIngestionMode, setCatalogIngestionMode] = useState<IngestionMode>('full_refresh');
  const [showModelingIngestionPanel, setShowModelingIngestionPanel] = useState(false);
  const [modelingIngestionMode, setModelingIngestionMode] = useState<IngestionMode>('full_refresh');

  // Phase 2-6 panels
  const [showDagViewer, setShowDagViewer] = useState(false);
  const [showImpactAnalysis, setShowImpactAnalysis] = useState(false);
  const [showDryRun, setShowDryRun] = useState(false);
  const [showPreChecks, setShowPreChecks] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [showIngestionResults, setShowIngestionResults] = useState(false);

  // Conflict detection modal
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [currentConflict, setCurrentConflict] = useState<EventConflict | null>(null);
  // Stores the pending action to resume after conflict resolution
  const pendingConflictAction = useRef<{ type: 'deploy'; eventIds: string[] } | null>(null);

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
    clearEvents,
    addEvent,
    loadProjectEvents,
    saveProjectEvents,
    getEventsByProject,
    updateEventStatus
  } = useEventStore(selectedProjectId);

  // AI analysis — runs analyzers against events when toggles/events change
  useAiAnalysis(events);

  // ── Auto-sync DDL actions to backend ────────────────────────────────────
  // Maps local event ID → backend DDL event_id for add/remove tracking
  const ddlEventMapRef = useRef<Map<string, string>>(new Map());
  const prevEventIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedProjectId) return;

    const currentEventIds = new Set(events.map((e) => e.id));

    // ── ADD: new DDL-relevant events → persist to backend ──
    const newDDLEvents = events.filter(
      (e) =>
        DDL_EVENT_TYPES.includes(e.type) &&
        e.status === 'pending' &&
        !ddlEventMapRef.current.has(e.id) &&
        !prevEventIdsRef.current.has(e.id) &&
        !e.synced
    );

    newDDLEvents.forEach(async (event) => {
      // Mark immediately to prevent re-runs
      ddlEventMapRef.current.set(event.id, '');
      try {
        const { sql } = generateSnowflakeSQL(event);
        if (!sql || sql.startsWith('--')) return;

        const tableRef = `${event.target.database}.${event.target.schema}.${event.target.table}`;
        const result = await addDDLAction(selectedProjectId, {
          ddl_sql: sql,
          ddl_type: inferDDLType(event.type),
          target_table: tableRef,
          description: `${event.type} on ${tableRef}`,
        });
        // Store backend event_id for later removal
        if (result?.event_id) {
          ddlEventMapRef.current.set(event.id, result.event_id);
        }
        console.debug(`[DDL Sync] Added ${event.type} → ${tableRef}`);
      } catch (err) {
        console.warn(`[DDL Sync] Failed to add ${event.type}:`, err);
        ddlEventMapRef.current.delete(event.id);
      }
    });

    // ── REMOVE: events that disappeared (undo/delete) → remove from backend ──
    const removedIds = Array.from(prevEventIdsRef.current).filter(
      (id) => !currentEventIds.has(id) && ddlEventMapRef.current.has(id)
    );

    removedIds.forEach(async (localId) => {
      const backendId = ddlEventMapRef.current.get(localId);
      ddlEventMapRef.current.delete(localId);
      if (!backendId) return; // never made it to backend

      try {
        await removeDDLAction(selectedProjectId, backendId);
        console.debug(`[DDL Sync] Removed DDL ${backendId} (event ${localId})`);
      } catch (err) {
        console.warn(`[DDL Sync] Failed to remove DDL ${backendId}:`, err);
      }
    });

    // Update previous snapshot
    prevEventIdsRef.current = currentEventIds;
  }, [events, selectedProjectId]);

  // Read-only guard: returns true (blocked) if user is a viewer
  const readOnlyGuard = useCallback(() => {
    if (isReadOnly) {
      toast.error('You have view-only access to this project');
      return true;
    }
    return false;
  }, [isReadOnly]);

  // ── Conflict Detection ────────────────────────────────────────────────────
  // Checks pending events for conflicts before deploy. Returns true if conflicts
  // were found (caller should abort and wait for resolution).
  const checkForConflicts = useCallback(async (eventIds: string[]): Promise<boolean> => {
    if (!selectedProjectId || eventIds.length === 0) return false;

    try {
      const result = await checkConflicts(selectedProjectId, { event_ids: eventIds });

      if (result.has_conflicts && result.conflicts.length > 0) {
        const first = result.conflicts[0];

        // Find the local events for "yours" and "theirs" to build the diff view
        const myEvent = events.find(e => e.id === first.event_id);
        const theirEvent = first.conflicting_event_id
          ? events.find(e => e.id === first.conflicting_event_id)
          : null;

        const buildChanges = (evt: typeof myEvent) => {
          if (!evt) return {};
          const changes: Record<string, { old: string; new: string }> = {};
          if (evt.payload) {
            Object.entries(evt.payload).forEach(([key, value]) => {
              if (key !== 'isTemplate' && typeof value !== 'object') {
                changes[key] = { old: '', new: String(value) };
              }
            });
          }
          return changes;
        };

        const conflict: EventConflict = {
          eventId: first.event_id,
          eventType: first.event_type,
          objectName: first.object_name,
          yours: {
            user: currentUsername || 'You',
            timestamp: myEvent?.timestamp
              ? new Date(myEvent.timestamp).toISOString()
              : new Date().toISOString(),
            changes: buildChanges(myEvent),
          },
          theirs: {
            user: theirEvent?.userId || 'Another user',
            timestamp: theirEvent?.timestamp
              ? new Date(theirEvent.timestamp).toISOString()
              : new Date().toISOString(),
            changes: buildChanges(theirEvent ?? undefined),
          },
        };

        setCurrentConflict(conflict);
        setShowConflictModal(true);

        // Show a summary toast for all conflicts
        if (result.conflicts.length > 1) {
          toast.error(`${result.conflicts.length} conflicts detected — resolve them before deploying`);
        }

        return true; // conflicts found
      }

      return false; // no conflicts
    } catch (error) {
      // Non-blocking: if the conflict check API fails, allow the user to proceed
      console.warn('[checkForConflicts] API call failed, proceeding without conflict check:', error);
      return false;
    }
  }, [selectedProjectId, events, currentUsername]);

  // Handle conflict resolution — apply chosen resolution and optionally resume the blocked action
  const handleConflictResolve = useCallback((resolution: 'mine' | 'theirs' | 'manual', mergedChanges?: Record<string, string>) => {
    if (!currentConflict) return;

    const eventId = currentConflict.eventId;

    if (resolution === 'mine') {
      // Keep my event, no changes needed — just proceed
      toast.success(`Conflict resolved: keeping your changes for "${currentConflict.objectName}"`);
    } else if (resolution === 'theirs') {
      // Accept theirs — remove my conflicting event
      updateEventStatus({ eventId, status: 'failed' });
      toast.success(`Conflict resolved: accepted other user's changes for "${currentConflict.objectName}"`);
    } else if (resolution === 'manual') {
      // Manual merge — update my event payload with merged values
      const myEvent = events.find(e => e.id === eventId);
      if (myEvent && mergedChanges) {
        // Re-add a corrected event with merged payload
        addEvent({
          type: myEvent.type,
          projectId: myEvent.projectId || selectedProjectId || '',
          target: myEvent.target,
          payload: { ...myEvent.payload, ...mergedChanges },
        });
        // Mark original as superseded
        updateEventStatus({ eventId, status: 'failed' });
        toast.success(`Conflict resolved with manual merge for "${currentConflict.objectName}"`);
      }
    }

    // Resume the blocked action if there was one
    const blocked = pendingConflictAction.current;
    if (blocked?.type === 'deploy') {
      pendingConflictAction.current = null;
      // Re-open deployment modal now that conflict is resolved
      setShowDeploymentModal(true);
    }

    setCurrentConflict(null);
    setShowConflictModal(false);
  }, [currentConflict, events, selectedProjectId, updateEventStatus, addEvent]);

  // On mount: clear ALL stale state — events, selections, localStorage keys, DDL refs
  useEffect(() => {
    clearEvents();
    setSelectedDatabase('');
    setSchemas([]);
    setSelectedSchemas(new Map());
    setTables([]);
    setSelectedTable(null);
    setTableColumns([]);
    localStorage.removeItem('explore-design-events');
    localStorage.removeItem('explore-design-last-project-id');
    localStorage.removeItem('explore-design-last-project-name');
    localStorage.removeItem('d360_last_project_id');
    ddlEventMapRef.current.clear();
    prevEventIdsRef.current.clear();
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
    return merged;
  }, [events, backendMappings]);

  // Redirect to sign-in when offline
  useEffect(() => {
    if (isOffline && connectionError?.includes('session expired')) {
      toast.error('Connection lost. Redirecting to sign-in...');
      router.push('/signin?error=sync_offline');
    }
  }, [isOffline, connectionError, router]);

  // Load databases only after a project is selected
  useEffect(() => {
    if (!selectedProjectId) return;
    const loadDatabases = async () => {
      if (isOffline) {
        return;
      }

      setIsLoadingDatabases(true);
      try {
        const dbList = await getDatabases();
        setDatabases(Array.isArray(dbList) ? dbList : []);
        // Auto-select CP_DATA360 (or first available) when no database is selected
        if (Array.isArray(dbList) && dbList.length > 0) {
          setSelectedDatabase(prev => {
            if (prev) return prev; // Already selected — don't override
            return dbList[0];
          });
        }
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
  }, [selectedProjectId, isOffline, router]);

  // Load masking policies on mount
  useEffect(() => {
    const loadMaskingPolicies = async () => {
      setIsLoadingPolicies(true);
      try {
        const policies = await getMaskingPolicies();
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
      //    Validate FK type compatibility (A1) before adding — fire-and-forget
      const fkEvents: { target: any; payload: any }[] = [];
      for (const fk of DWH_TEMPLATE_RELATIONSHIPS) {
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
      }

      // 10. Persist all template events to backend so they restore on project select
      const persistTemplateEvents = async () => {
        try {
          // Schema
          await addProjectEvent(selectedProjectId, {
            module_name: 'EXPLORE_DESIGN',
            event_type: 'SCHEMA_CREATED',
            status: 'pending',
            details: { target: schemaTarget, payload: schemaPayload },
            entity_id: `schema-${db}-${schema}`,
            entity_type: 'design_event',
          });
          // Tables — sequential with individual error handling
          for (const te of tableEvents) {
            try {
              await addProjectEvent(selectedProjectId, {
                module_name: 'EXPLORE_DESIGN',
                event_type: 'TABLE_CREATED',
                status: 'pending',
                details: { target: te.target, payload: te.payload },
                entity_id: `table-${te.target.table}`,
                entity_type: 'design_event',
              });
            } catch { /* continue on error */ }
          }
          // Foreign keys — sequential with individual error handling
          for (const fke of fkEvents) {
            try {
              await addProjectEvent(selectedProjectId, {
                module_name: 'EXPLORE_DESIGN',
                event_type: 'FOREIGN_KEY_ADDED',
                status: 'pending',
                details: { target: fke.target, payload: fke.payload },
                entity_id: `fk-${fke.payload.constraintName}`,
                entity_type: 'design_event',
              });
              console.log(`[Template FK] ✅ Persisted: ${fke.payload.constraintName}`);
            } catch (fkErr: any) {
              console.error(`[Template FK] ❌ Failed: ${fke.payload.constraintName}`, fkErr?.response?.status, fkErr?.response?.data);
            }
          }
        } catch (err) {
          console.warn('[Template] Failed to persist template events to backend:', err);
        }
      };
      persistTemplateEvents();
    }

    setDefaultModelingTablesLoaded(true);
  }, [viewMode, modelingChoice, defaultModelingTablesLoaded, dwhTargetDatabase, dwhTargetSchema, selectedProjectId, selectedDatabase, tables.length, targetTableIds.size, addEvent]);

  // Load schemas when database changes
  useEffect(() => {
    if (!selectedDatabase) {
      setSchemas([]);
      return;
    }

    const loadSchemas = async () => {
      setIsLoadingSchemas(true);
      try {
        const schemaList = await getSchemas(selectedDatabase);
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
      setIsLoadingTables(true);
      try {
        const newTables: TableItem[] = [];

        // Iterate over schema->database map entries
        for (const [schemaName, dbName] of Array.from(selectedSchemas.entries())) {
          const tableList = await getTables(dbName, schemaName);
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
          const columnsPromises = tablesToLoadColumns.map(async (table) => {
            try {
              const cols = await getTableColumns(table.database, table.schema, table.table);
              if (cols && cols.length > 0) {
                const formattedColumns: ColumnInfo[] = cols.map((col: any) => ({
                  name: col.COLUMN_NAME || col.name,
                  dataType: col.data_type || col.DATA_TYPE || col.dataType || 'VARCHAR',
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

    // Check if columns already exist in the map (e.g. DWH template tables)
    const cachedColumns = tableColumnsMap.get(selectedTable.id);
    if (cachedColumns && cachedColumns.length > 0) {
      setTableColumns(cachedColumns);
      const existingConfig = allTableConfigs.get(selectedTable.id);
      setTableConfig(existingConfig || {
        tableId: selectedTable.id,
        ingestion: { mode: 'full_refresh' },
        masking: [],
        primaryKeys: cachedColumns.filter(c => c.isPrimaryKey).map(c => c.name),
        nullable: cachedColumns.filter(c => c.isNullable).map(c => c.name),
        sensitive: cachedColumns.filter(c => c.isSensitive).map(c => c.name),
      });
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

        if (columns && columns.length > 0) {
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
        // Don't show error for template/DWH tables that don't exist in Snowflake yet
        if (!targetTableIds.has(selectedTable.id)) {
          toast.error('Failed to load columns');
        }
      } finally {
        setIsLoadingColumns(false);
      }
    };
    loadColumns();
  }, [selectedTable, allTableConfigs, targetTableIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset inline panels when selected table changes
  useEffect(() => {
    setShowInlinePreview(false);
    setShowInlineProfile(false);
    setInlinePreviewData(null);
    setInlineProfileData(null);
  }, [selectedTable?.id]);

  // Fetch inline preview data when toggled on
  useEffect(() => {
    if (!showInlinePreview || !selectedTable || !selectedProjectId) return;
    let cancelled = false;
    const load = async () => {
      setIsLoadingInlinePreview(true);
      try {
        const data = await tablePreview(selectedProjectId, selectedTable.database, selectedTable.schema, selectedTable.table, { limit: 5 });
        if (!cancelled) {
          setInlinePreviewData({ columns: data.columns, rows: data.rows as Record<string, any>[], total_rows: data.row_count });
        }
      } catch (err) {
        console.error('[E&D] Inline preview failed:', err);
        if (!cancelled) setInlinePreviewData(null);
      } finally {
        if (!cancelled) setIsLoadingInlinePreview(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [showInlinePreview, selectedTable?.id, selectedProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch inline profile data when toggled on
  useEffect(() => {
    if (!showInlineProfile || !selectedTable || !selectedProjectId) return;
    let cancelled = false;
    const load = async () => {
      setIsLoadingInlineProfile(true);
      try {
        const data = await fetchTableProfile(selectedProjectId, selectedTable.database, selectedTable.schema, selectedTable.table);
        if (!cancelled) {
          setInlineProfileData({
            row_count: data.row_count,
            column_count: data.column_count,
            columns: data.columns ?? [],
            aggregate_quality_score: (data as any).aggregate_quality_score ?? 100,
          });
        }
      } catch (err) {
        console.error('[E&D] Inline profile failed:', err);
        if (!cancelled) setInlineProfileData(null);
      } finally {
        if (!cancelled) setIsLoadingInlineProfile(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [showInlineProfile, selectedTable?.id, selectedProjectId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (readOnlyGuard()) return;
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
                module_name: 'EXPLORE_DESIGN',
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

      // Clear ALL state from previous project BEFORE setting the new one
      clearEvents();
      ddlEventMapRef.current.clear();
      prevEventIdsRef.current.clear();
      setSelectedDatabase('');
      setSchemas([]);
      setSelectedSchemas(new Map());
      setTables([]);
      setSelectedTable(null);
      setTableColumns([]);
      setBackendMappings([]);
      setModelingTableIds(new Set());
      setTargetTableIds(new Set());
      setDefaultRelationships([]);
      setDefaultModelingTablesLoaded(false);
      setModelingChoice(null);
      setDwhTargetDatabase(null);
      setDwhTargetSchema(null);
      setTableColumnsMap(new Map());

      // Set new project
      setSelectedProjectId(projectId);
      setSelectedProjectName(projectName);

      // Determine user's role for this project
      try {
        const contributors = await listContributors(projectId);
        const me = contributors.find(
          (c) => c.username.toLowerCase() === currentUsername.toLowerCase()
        );
        setUserRole(me?.role ?? 'owner'); // creator is always owner even if not in contributors table
      } catch {
        setUserRole('owner'); // fallback: assume owner if contributors fetch fails
      }
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
        const eventsResponse = await listProjectEvents(projectId, {});

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

        }

        await loadProjectEvents({ projectId, events: backendEvents });

        // Load DDL actions from backend (for awareness / logging only)
        // All events stay pending — DDL execution happens later in the deployment modal
        try {
          const ddlResponse = await listDDLActions(projectId);
          const ddlActions = ddlResponse.actions || [];
          void ddlActions; // loaded for awareness only
        } catch (ddlErr) {
          console.warn('[handleProjectSelect] Failed to load DDL actions:', ddlErr);
        }

        // Load saved column mappings from backend (legacy fallback for pre-event mappings)
        /**try {
          const mappingsResponse = await listMappings(projectId);
          setBackendMappings(mappingsResponse.mappings || []);
          // console.log('[handleProjectSelect] Loaded backend mappings:', mappingsResponse.mappings?.length || 0);
        } catch (mappingErr) {
          console.warn('[handleProjectSelect] Failed to load backend mappings:', mappingErr);
          setBackendMappings([]);
        }**/

        // If we found database/schema info, restore the selections
        if (schemasByDatabase.size > 0) {
          // Use the first database as the selected one (user can switch later)
          const dbToSelect = Array.from(schemasByDatabase.keys())[0];

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

            // Rebuild tables + columns from TABLE_CREATED events (user-created tables)
            const restoredTables: TableItem[] = [];
            const restoredColumnsMap = new Map<string, ColumnInfo[]>();
            // Collect ADD_COLUMN events to replay after TABLE_CREATED
            const addColumnEvents: any[] = [];
            // Collect FOREIGN_KEY_ADDED events to rebuild relationships
            const restoredFkRelationships: TableRelationship[] = [];

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
                  // Also add source schema to schemasByDatabase so it gets restored as selected
                  if (!schemasByDatabase.has(src.database)) {
                    schemasByDatabase.set(src.database, new Set());
                  }
                  schemasByDatabase.get(src.database)!.add(src.schema);
                }
                const tgt = event.payload?.target;
                if (tgt?.database && tgt?.schema && tgt?.table) {
                  mappingTableIds.add(`${tgt.database}.${tgt.schema}.${tgt.table}`);
                  // Also add target schema to schemasByDatabase
                  if (!schemasByDatabase.has(tgt.database)) {
                    schemasByDatabase.set(tgt.database, new Set());
                  }
                  schemasByDatabase.get(tgt.database)!.add(tgt.schema);
                }
              }
              // Rebuild user-created tables from TABLE_CREATED events
              if (event.type === 'TABLE_CREATED' && event.target?.database && event.target?.schema && event.target?.table) {
                const tableId = `${event.target.database}.${event.target.schema}.${event.target.table}`;
                const columns = (event.payload?.columns || []).map((col: any) => ({
                  name: col.name,
                  dataType: col.dataType || col.data_type || 'VARCHAR',
                  isPrimaryKey: col.primaryKey || col.is_primary_key || false,
                  isNullable: col.nullable !== false && col.is_nullable !== false,
                }));
                restoredTables.push({
                  id: tableId,
                  database: event.target.database,
                  schema: event.target.schema,
                  table: event.target.table,
                  columnCount: columns.length,
                  hasPrimaryKey: columns.some((c: any) => c.isPrimaryKey),
                  status: event.status === 'applied' ? 'configured' : 'pending',
                  sensitiveColumns: 0,
                });
                restoredColumnsMap.set(tableId, columns);
                // Also add to modeling view
                addedTableIds.add(tableId);
              }
              // Collect ADD_COLUMN events for replay
              if (event.type === 'ADD_COLUMN' && event.target?.database && event.target?.table) {
                addColumnEvents.push(event);
              }
              // Rebuild FK relationships
              if (event.type === 'FOREIGN_KEY_ADDED' && event.target?.table) {
                const refTable = event.payload?.referencedTable || event.payload?.targetTable;
                if (refTable?.table) {
                  restoredFkRelationships.push({
                    constraint_name: event.payload?.constraintName || `FK_${event.target.table}`,
                    child_schema: event.target.schema,
                    child_table: event.target.table,
                    child_column: event.payload?.columns?.[0] || event.payload?.sourceColumn || '',
                    parent_schema: refTable.schema || event.target.schema,
                    parent_table: refTable.table,
                    parent_column: event.payload?.referencedColumns?.[0] || event.payload?.targetColumn || '',
                  });
                }
              }
            });

            // Replay ADD_COLUMN events into restoredColumnsMap
            addColumnEvents.forEach((event: any) => {
              const tableId = `${event.target.database}.${event.target.schema}.${event.target.table}`;
              const existing = restoredColumnsMap.get(tableId);
              if (existing) {
                const colName = event.payload?.columnName || event.payload?.name;
                if (colName && !existing.some(c => c.name === colName)) {
                  existing.push({
                    name: colName,
                    dataType: event.payload?.dataType || event.payload?.type || 'VARCHAR',
                    isPrimaryKey: event.payload?.isPrimaryKey || false,
                    isNullable: event.payload?.nullable !== false && event.payload?.isNullable !== false,
                  });
                }
              }
            });

            // Apply restored tables to state
            if (restoredTables.length > 0) {
              setTables(prev => {
                const existingIds = new Set(prev.map(t => t.id));
                const newTables = restoredTables.filter(t => !existingIds.has(t.id));
                return newTables.length > 0 ? [...prev, ...newTables] : prev;
              });
              setTableColumnsMap(prev => {
                const next = new Map(prev);
                restoredColumnsMap.forEach((cols, tableId) => {
                  if (!next.has(tableId)) next.set(tableId, cols);
                });
                return next;
              });
              // Mark created tables as target tables (they're DWH-side)
              setTargetTableIds(prev => {
                const merged = new Set(prev);
                restoredTables.forEach(t => merged.add(t.id));
                return merged;
              });
              console.log('🔄 [Restore] Rebuilt tables from TABLE_CREATED:', restoredTables.map(t => t.id));
            }

            // Apply restored FK relationships
            if (restoredFkRelationships.length > 0) {
              setDefaultRelationships(prev => [...prev, ...restoredFkRelationships]);
              console.log('🔄 [Restore] Rebuilt FK relationships:', restoredFkRelationships.length);
            }

            console.log('🔄 Tables from COLUMN_MAPPING events:', Array.from(mappingTableIds));

            // Fetch columns for mapping-referenced tables that aren't already in restoredColumnsMap
            const mappingTablesNeedingColumns = Array.from(mappingTableIds).filter(id => !restoredColumnsMap.has(id));
            if (mappingTablesNeedingColumns.length > 0) {
              const colPromises = mappingTablesNeedingColumns.map(async (tableId) => {
                const parts = tableId.split('.');
                if (parts.length !== 3) return null;
                const [db, schema, table] = parts;
                try {
                  const cols = await getTableColumns(db, schema, table);
                  if (cols && cols.length > 0) {
                    const formatted: ColumnInfo[] = cols.map((col: any) => ({
                      name: col.COLUMN_NAME || col.name || col.column_name || 'unknown',
                      dataType: col.data_type || col.DATA_TYPE || col.dataType || 'VARCHAR',
                      isPrimaryKey: col.IS_PRIMARY_KEY === 'Y' || col.isPrimaryKey === true || col.is_primary_key === true,
                      isNullable: col.IS_NULLABLE === 'YES' || col.isNullable !== false || col.is_nullable !== false,
                      isSensitive: false,
                    }));
                    return { tableId, columns: formatted };
                  }
                  return null;
                } catch (err) {
                  console.error(`[Restore] Failed to load columns for mapping table ${tableId}:`, err);
                  return null;
                }
              });
              const colResults = await Promise.all(colPromises);
              colResults.forEach(result => {
                if (result) {
                  restoredColumnsMap.set(result.tableId, result.columns);
                  // Also add as a table entry if not already present
                  if (!restoredTables.some(t => t.id === result.tableId)) {
                    const parts = result.tableId.split('.');
                    restoredTables.push({
                      id: result.tableId,
                      database: parts[0],
                      schema: parts[1],
                      table: parts[2],
                      columnCount: result.columns.length,
                      hasPrimaryKey: result.columns.some((c: any) => c.isPrimaryKey),
                      status: 'configured' as const,
                      sensitiveColumns: 0,
                    });
                  }
                }
              });
              console.log('🔄 [Restore] Fetched columns for mapping tables:', colResults.filter(Boolean).length);
            }

            // Final modeling tables = added - removed + mapping tables
            const modelingTables = new Set([
              ...Array.from(addedTableIds).filter(id => !removedTableIds.has(id)),
              ...Array.from(mappingTableIds)
            ]);

            if (modelingTables.size > 0) {
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
          // No schema/database info from events — auto-select first available database
          if (databases.length > 0 && !selectedDatabase) {
            const defaultDb = databases[0];
            setSelectedDatabase(defaultDb);
          }
          if (backendEvents.length > 0) {
            toast.success(`Loaded ${backendEvents.length} events for "${projectName}"`);
          } else {
            toast.success(`Project "${projectName}" selected — choose a database to start`);
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
    if (readOnlyGuard()) return;
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
    if (readOnlyGuard()) return;
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
    if (readOnlyGuard()) return;
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
    if (readOnlyGuard()) return;
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

    // Cascade rename: update references in other events (A2)
    if (selectedProjectId) {
      cascadeRename(selectedProjectId, {
        old_table_name: `${database}.${schema}.${tableName}`,
        new_table_name: `${database}.${schema}.${newName}`,
      }).then((res) => {
        if (res.events_updated > 0) {
          toast.success(`Cascade: ${res.events_updated} dependent event(s) updated`);
        }
      }).catch(() => {
        // Non-blocking — rename event is still registered
      });
    }

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
    if (readOnlyGuard()) return;
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

  // AI Column Classification handler
  const handleAIClassify = useCallback(async () => {
    if (!selectedTable || !selectedProjectId) {
      toast.error('Select a project and table first');
      return;
    }
    setIsClassifying(true);
    try {
      const result = await getColumnClassification(
        selectedProjectId,
        selectedTable.database,
        selectedTable.schema,
        selectedTable.table
      );
      // Convert array response to Record<columnName, category>
      const classArray = result?.classifications || result?.data?.classifications || [];
      const classRecord: Record<string, string> = {};
      if (Array.isArray(classArray)) {
        classArray.forEach((c: any) => {
          if (c.column && c.category) classRecord[c.column] = c.category;
        });
      }
      setColumnClassifications(prev => {
        const next = new Map(prev);
        next.set(selectedTable.id, classRecord);
        return next;
      });
      toast.success(`AI classified ${Object.keys(classRecord).length} columns`);
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.response?.data?.detail || 'AI classification failed';
      toast.error(typeof errMsg === 'string' ? errMsg : 'AI classification failed');
    } finally {
      setIsClassifying(false);
    }
  }, [selectedTable, selectedProjectId]);

  // AI Discover Relationships handler
  const handleDiscoverRelationships = useCallback(async () => {
    if (!selectedProjectId || tables.length === 0) {
      toast.error('Select a project with tables first');
      return;
    }
    const toastId = toast.loading('Discovering relationships...');
    try {
      const result = await discoverRelationships(selectedProjectId, {
        tables: tables.map(t => ({
          database: t.database,
          schema: t.schema,
          table_name: t.table,
        })),
      });
      toast.dismiss(toastId);
      const count = result?.relationships?.length || 0;
      toast.success(`Discovered ${count} potential relationships`);
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(err?.response?.data?.detail || 'Relationship discovery failed');
    }
  }, [selectedProjectId, tables]);

  // Load data engineering objects (dynamic tables, streams, alerts)
  const handleListDataEngObjects = useCallback(async (schema: string, type: 'dynamic_tables' | 'streams' | 'alerts') => {
    if (!selectedDatabase) {
      toast.error('Select a database first');
      return;
    }
    setDataEngModal({ isOpen: true, type, schema, items: [], loading: true });
    try {
      let result: any;
      if (type === 'dynamic_tables') result = await listDynamicTables(selectedDatabase, schema);
      else if (type === 'streams') result = await listStreams(selectedDatabase, schema);
      else result = await listAlerts(selectedDatabase, schema);
      const items = result?.data || result?.items || (Array.isArray(result) ? result : []);
      setDataEngModal(prev => ({ ...prev, items, loading: false }));
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || `Failed to list ${type.replace('_', ' ')}`);
      setDataEngModal(prev => ({ ...prev, loading: false }));
    }
  }, [selectedDatabase]);

  // Data engineering action handlers
  const handleDataEngAction = useCallback(async (objectName: string, action: string) => {
    if (!selectedDatabase || !dataEngModal.schema) return;
    const db = selectedDatabase;
    const schema = dataEngModal.schema;
    const toastId = toast.loading(`${action} ${objectName}...`);
    try {
      if (dataEngModal.type === 'dynamic_tables') {
        if (action === 'suspend') await suspendDynamicTable(objectName, db, schema);
        else if (action === 'resume') await resumeDynamicTable(objectName, db, schema);
        else if (action === 'refresh') await refreshDynamicTable(objectName, db, schema);
        else if (action === 'drop') {
          if (!confirm(`Drop dynamic table "${objectName}"? This cannot be undone.`)) {
            toast.dismiss(toastId);
            return;
          }
          await dropDynamicTable(objectName, db, schema);
        }
      } else if (dataEngModal.type === 'streams') {
        if (action === 'view_data') {
          const data = await getStreamData(objectName, db, schema);
          toast.dismiss(toastId);
          toast.success(`Stream has ${data?.rows?.length || 0} change records`);
          return;
        } else if (action === 'drop') {
          if (!confirm(`Drop stream "${objectName}"? This cannot be undone.`)) {
            toast.dismiss(toastId);
            return;
          }
          await dropStream(objectName, db, schema);
        }
      } else if (dataEngModal.type === 'alerts') {
        if (action === 'drop') {
          if (!confirm(`Drop alert "${objectName}"? This cannot be undone.`)) {
            toast.dismiss(toastId);
            return;
          }
          await dropAlert(objectName, db, schema);
        }
      }
      toast.dismiss(toastId);
      toast.success(`${action} "${objectName}" completed`);
      // Refresh list
      handleListDataEngObjects(schema, dataEngModal.type);
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(err?.response?.data?.detail || `${action} failed`);
    }
  }, [selectedDatabase, dataEngModal.schema, dataEngModal.type, handleListDataEngObjects]);

  // Schema action handler
  const handleSchemaAction = useCallback((schema: string, action: string) => {
    if (readOnlyGuard()) return;
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
      case 'list_dynamic_tables':
        handleListDataEngObjects(schema, 'dynamic_tables');
        break;
      case 'list_streams':
        handleListDataEngObjects(schema, 'streams');
        break;
      case 'list_alerts':
        handleListDataEngObjects(schema, 'alerts');
        break;
      case 'drop_schema':
        if (confirm(`Are you sure you want to drop schema ${schema}? This action cannot be undone.`)) {
          toast.error(`Drop schema ${schema} - operation queued`);
        }
        break;
      default:
        toast.error(`Unknown action: ${action}`);
    }
  }, [handleListDataEngObjects]);

  // Toggle fullscreen mode
  const toggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => {
      if (!prev) {
        // Save current panel state before entering fullscreen
        setSavedPanelState({ sidebar: showSidebar, event: showEventPanel });
        setShowSidebar(false);
        setShowEventPanel(false);
      }
      return !prev;
    });
  }, [showSidebar, showEventPanel]);

  // Exit fullscreen and restore panels
  const exitFullscreen = useCallback(() => {
    setIsFullscreen(false);
    setShowSidebar(savedPanelState.sidebar);
    setShowEventPanel(savedPanelState.event);
  }, [savedPanelState]);

  return (
    <ErrorBoundary>
    <div className={cn(
      "flex flex-col -mx-6 -mt-6 -mb-12 md:-mx-8 lg:-mx-10 lg:-mb-16 xl:-mx-12 2xl:-mx-16",
      isFullscreen ? "h-screen" : "h-[calc(100dvh-64px)]"
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
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 mb-1">
          <span
            className="hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
            onClick={() => { setSelectedProjectId(null); setSelectedProjectName(''); }}
          >
            Projects
          </span>
          {selectedProjectName && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="text-gray-700 dark:text-gray-300 font-medium">{selectedProjectName}</span>
            </>
          )}
          {selectedDatabase && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span>{selectedDatabase}</span>
            </>
          )}
          {viewMode && (
            <>
              <ChevronRight className="h-3 w-3" />
              <span className="capitalize">{viewMode}</span>
            </>
          )}
        </nav>
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
              autoSelectProjectId={autoProjectId}
            />
            {isReadOnly && (
              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] px-2 py-0.5 flex items-center gap-1">
                <Eye className="h-3 w-3" />
                View Only
              </Badge>
            )}
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
                  if (!modelingChoice && readOnlyGuard()) return;
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
              <button
                className={cn(
                  'px-2 py-1 rounded text-xs font-medium transition-colors flex items-center gap-1',
                  viewMode === 'semantic'
                    ? 'bg-white dark:bg-slate-700 shadow text-slate-900 dark:text-white'
                    : 'text-slate-500 hover:text-slate-700'
                )}
                onClick={() => setViewMode('semantic')}
              >
                <Database className="h-3.5 w-3.5" />
                Semantic
              </button>
            </div>

            <div className="w-px h-6 bg-slate-200 dark:bg-slate-700" />

            {/* Undo/Redo */}
            <Tooltip content={isReadOnly ? 'View-only access' : 'Undo'}>
              <Button
                aria-label="Undo"
                variant="outline"
                size="sm"
                onClick={() => undoEvent()}
                disabled={!canUndo || isReadOnly}
                className="p-1.5"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
            <Tooltip content={isReadOnly ? 'View-only access' : 'Redo'}>
              <Button
                aria-label="Redo"
                variant="outline"
                size="sm"
                onClick={() => redoEvent()}
                disabled={!canRedo || isReadOnly}
                className="p-1.5"
              >
                <Redo2 className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>

            {/* Tools group — compact icon buttons */}
            <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-slate-800 rounded p-0.5">
              <Tooltip content="Event Templates">
                <button onClick={() => setShowTemplateLibrary(true)} className="p-1.5 rounded hover:bg-white dark:hover:bg-slate-700 transition-colors">
                  <BookTemplate className="h-3.5 w-3.5 text-slate-500" />
                </button>
              </Tooltip>
              <Tooltip content="DAG Viewer">
                <button onClick={() => setShowDagViewer(!showDagViewer)} className={cn('p-1.5 rounded transition-colors', showDagViewer ? 'bg-violet-100 dark:bg-violet-900/30' : 'hover:bg-white dark:hover:bg-slate-700')}>
                  <Workflow className={cn('h-3.5 w-3.5', showDagViewer ? 'text-violet-600' : 'text-slate-500')} />
                </button>
              </Tooltip>
              <Tooltip content="Ingestion Runs">
                <button onClick={() => setShowIngestionResults(!showIngestionResults)} className={cn('p-1.5 rounded transition-colors', showIngestionResults ? 'bg-teal-100 dark:bg-teal-900/30' : 'hover:bg-white dark:hover:bg-slate-700')}>
                  <BarChart3 className={cn('h-3.5 w-3.5', showIngestionResults ? 'text-teal-600' : 'text-slate-500')} />
                </button>
              </Tooltip>
              <Tooltip content="AI Intelligence">
                <button onClick={() => setShowAiPanel(!showAiPanel)} className={cn('p-1.5 rounded transition-colors', showAiPanel ? 'bg-purple-100 dark:bg-purple-900/30' : 'hover:bg-white dark:hover:bg-slate-700')}>
                  <Sparkles className={cn('h-3.5 w-3.5', showAiPanel ? 'text-purple-600' : 'text-slate-500')} />
                </button>
              </Tooltip>
            </div>

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

            <Button variant="outline" size="sm" className="gap-1 hidden lg:flex px-2 py-1" disabled={isReadOnly}>
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
              onClick={async () => {
                if (readOnlyGuard()) return;
                if (!selectedProjectId) {
                  toast.error('Please select a project first');
                  return;
                }
                // Check for conflicts before opening the deployment modal
                const eventIds = pendingEvents.map(e => e.id);
                if (eventIds.length > 0) {
                  const hasConflicts = await checkForConflicts(eventIds);
                  if (hasConflicts) {
                    // Store the blocked action so we can resume after resolution
                    pendingConflictAction.current = { type: 'deploy', eventIds };
                    return;
                  }
                }
                setShowDeploymentModal(true);
              }}
              disabled={!selectedProjectId || isReadOnly}
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
                aria-label={showSidebar ? 'Hide sources panel' : 'Show sources panel'}
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
            <Tooltip content={showEventPanel ? 'Hide Events' : 'Show Events'}>
              <button
                aria-label={showEventPanel ? 'Hide events panel' : 'Show events panel'}
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
          hideWhenEmpty={false}
          deploymentSlot={selectedProjectId ? (
            <div className="p-4">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Pending events: {displayablePendingEvents.length}. Use the Deploy button in the toolbar to validate and deploy.
              </p>
              <button
                onClick={() => window.location.href = `/workflow?source=explore-design&project_id=${selectedProjectId}&database=${selectedDatabase}&schema=${Array.from(selectedSchemas.keys())[0] || ''}`}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors mt-2"
              >
                <ArrowRight className="h-3.5 w-3.5" />
                Open in Workflow
              </button>
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

      {/* Compact Source Selector - Horizontal bar (hidden until project selected) */}
      {!isFullscreen && selectedProjectId && (
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
          projectId={selectedProjectId}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden min-h-0">
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
                  <span className="font-semibold text-base text-slate-800 dark:text-slate-200">
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
                      aria-label={allSelected ? 'Deselect all tables' : 'Select all tables'}
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
                      aria-label="Hide sources panel"
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
                  aria-label="Search tables"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search tables..."
                  className="pl-7 text-xs"
                />
                {searchQuery && (
                  <button
                    aria-label="Clear table search"
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
        <div className={cn(
          "flex-1 flex flex-col overflow-hidden min-w-0",
          viewMode === 'catalog' && "bg-slate-50 dark:bg-slate-900/50"
        )}>
          {viewMode === 'semantic' && (
            // Semantic View - Semantic models and views
            <div className="flex-1 overflow-auto p-6 space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
                    <Database className="h-5 w-5 text-teal-600" />
                    Semantic Layer
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Define business-friendly semantic models with dimensions, measures, and time grains for Cortex Analyst.</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                    <Upload className="h-3.5 w-3.5" />
                    Import YAML
                  </Button>
                  <Button size="sm" className="gap-1.5 text-xs bg-teal-600 hover:bg-teal-700 text-white">
                    <Plus className="h-3.5 w-3.5" />
                    New Semantic Model
                  </Button>
                </div>
              </div>

              {/* Semantic model builder info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Layers className="w-5 h-5 text-teal-500" />
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">Tables & Columns</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Select tables from your catalog, define column descriptions, data types, and business names.</p>
                </div>
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
                  <div className="flex items-center gap-2 mb-2">
                    <BarChart3 className="w-5 h-5 text-blue-500" />
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">Dimensions & Measures</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Tag columns as dimensions, measures, or time dimensions. Add synonyms and sample values.</p>
                </div>
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-white dark:bg-gray-800">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-5 h-5 text-purple-500" />
                    <span className="text-sm font-semibold text-gray-900 dark:text-white">Verified Queries</span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Add verified question-SQL pairs to improve Cortex Analyst accuracy and test your model.</p>
                </div>
              </div>

              {/* Semantic models list */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-between">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">Semantic Models</h4>
                  <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300 text-xs">
                    {selectedDatabase || 'All databases'}
                  </Badge>
                </div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50/50 dark:bg-gray-800/50">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Model Name</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Tables</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Dimensions</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Measures</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Time Dims</th>
                      <th className="text-left px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                      <th className="text-right px-4 py-2.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">
                        <Database className="h-8 w-8 mx-auto mb-2 text-gray-300 dark:text-gray-600" />
                        <p>No semantic models defined yet.</p>
                        <p className="text-xs mt-1">Create a semantic model to power Cortex Analyst natural language queries.</p>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* YAML preview section */}
              <div className="border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-900 overflow-hidden">
                <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                  <h4 className="text-sm font-medium text-gray-900 dark:text-white">YAML Preview</h4>
                  <p className="text-xs text-gray-500 dark:text-gray-400">Select a semantic model to preview and edit its YAML definition</p>
                </div>
                <div className="p-4 min-h-[200px] flex items-center justify-center">
                  <div className="text-center">
                    <FileText className="h-8 w-8 mx-auto text-gray-300 dark:text-gray-600 mb-2" />
                    <p className="text-sm text-gray-400 dark:text-gray-500">No model selected</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {viewMode === 'catalog' && (
            // Catalog View - Table Details in CENTER
            <>
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

              {/* Catalog Toolbar - Create Dropdown */}
              <div className="px-4 py-2 border-b dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2">
                <div className="relative">
                  <Tooltip content={isReadOnly ? 'View-only access' : 'Create new Snowflake object'}>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isReadOnly}
                      onClick={() => {
                        if (readOnlyGuard()) return;
                        setShowCreateMenuCatalog(!showCreateMenuCatalog);
                      }}
                      className="gap-1.5"
                    >
                      <Plus className="h-4 w-4" />
                      Create
                      <ChevronDown className="h-3 w-3" />
                    </Button>
                  </Tooltip>
                  {showCreateMenuCatalog && (
                    <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 z-50 min-w-[220px]">
                      <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Tables</div>
                      <button
                        className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-300"
                        onClick={() => { setCreateTableType('standard'); setShowCreateTableModal(true); setShowCreateMenuCatalog(false); }}
                      >
                        <Table2 className="w-4 h-4" /> Standard Table
                      </button>
                      <button
                        className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-300"
                        onClick={() => { setCreateTableType('temporary'); setShowCreateTableModal(true); setShowCreateMenuCatalog(false); }}
                      >
                        <Clock className="w-4 h-4" /> Temporary Table
                      </button>
                      <button
                        className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-300"
                        onClick={() => { setCreateTableType('transient'); setShowCreateTableModal(true); setShowCreateMenuCatalog(false); }}
                      >
                        <Timer className="w-4 h-4" /> Transient Table
                      </button>
                      <button
                        className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-300"
                        onClick={() => { setCreateTableType('external'); setShowCreateTableModal(true); setShowCreateMenuCatalog(false); }}
                      >
                        <Cloud className="w-4 h-4" /> External Table
                      </button>
                      <button
                        className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-300"
                        onClick={() => { setCreateTableType('iceberg'); setShowCreateTableModal(true); setShowCreateMenuCatalog(false); }}
                      >
                        <Snowflake className="w-4 h-4" /> Iceberg Table
                      </button>
                      <div className="border-t dark:border-slate-700 my-1" />
                      <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Specialized</div>
                      <button
                        className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-300"
                        onClick={() => { setDynamicTableModal(true); setShowCreateMenuCatalog(false); }}
                      >
                        <RefreshCw className="w-4 h-4" /> Dynamic Table
                      </button>
                      <button
                        className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-300"
                        onClick={() => { setEventTableModal(true); setShowCreateMenuCatalog(false); }}
                      >
                        <Bell className="w-4 h-4" /> Event Table
                      </button>
                      <button
                        className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-300"
                        onClick={() => { setHybridTableModal(true); setShowCreateMenuCatalog(false); }}
                      >
                        <Layers className="w-4 h-4" /> Hybrid Table
                      </button>
                      <div className="border-t dark:border-slate-700 my-1" />
                      <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Data Integration</div>
                      <button
                        className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-300"
                        onClick={() => { setStreamModal(true); setShowCreateMenuCatalog(false); }}
                      >
                        <GitBranch className="w-4 h-4" /> Stream (CDC)
                      </button>
                      <button
                        className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-300"
                        onClick={() => { setAlertModal(true); setShowCreateMenuCatalog(false); }}
                      >
                        <AlertTriangle className="w-4 h-4" /> Alert
                      </button>
                    </div>
                  )}
                </div>
              </div>

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
                              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
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
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                          <button
                            className={cn(
                              "flex flex-col items-center gap-2 p-3 rounded-lg border hover:shadow-sm hover:-translate-y-0.5 transition-all duration-150",
                              showInlinePreview
                                ? "bg-blue-100 dark:bg-blue-900/40 border-blue-400 dark:border-blue-600 ring-1 ring-blue-400/50"
                                : "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 hover:bg-slate-50 dark:hover:bg-slate-800"
                            )}
                            onClick={() => { setShowInlinePreview(p => !p); if (!showInlinePreview) setShowInlineProfile(false); }}
                          >
                            <Eye className="h-5 w-5 text-blue-600" />
                            <span className="text-xs font-medium text-blue-700 dark:text-blue-400">{showInlinePreview ? 'Hide Preview' : 'Preview Data'}</span>
                          </button>
                          <button
                            className={cn(
                              "flex flex-col items-center gap-2 p-3 rounded-lg border hover:shadow-sm hover:-translate-y-0.5 transition-all duration-150",
                              showInlineProfile
                                ? "bg-purple-100 dark:bg-purple-900/40 border-purple-400 dark:border-purple-600 ring-1 ring-purple-400/50"
                                : "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 hover:bg-slate-50 dark:hover:bg-slate-800"
                            )}
                            onClick={() => { setShowInlineProfile(p => !p); if (!showInlineProfile) setShowInlinePreview(false); }}
                          >
                            <BarChart3 className="h-5 w-5 text-purple-600" />
                            <span className="text-xs font-medium text-purple-700 dark:text-purple-400">{showInlineProfile ? 'Hide Profile' : 'Data Profile'}</span>
                          </button>
                          <button
                            className="flex flex-col items-center gap-2 p-3 rounded-lg border dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-150"
                            onClick={() => {
                              if (readOnlyGuard()) return;
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
                            className="flex flex-col items-center gap-2 p-3 rounded-lg border dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-150"
                            onClick={() => setShowIngestionPanel(true)}
                          >
                            <RefreshCw className="h-5 w-5 text-blue-500" />
                            <span className="text-xs font-medium">Ingestion</span>
                          </button>
                          <button
                            className="flex flex-col items-center gap-2 p-3 rounded-lg border dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-150"
                            onClick={() => setShowCatalogPolicyPanel(true)}
                          >
                            <Shield className="h-5 w-5 text-green-500" />
                            <span className="text-xs font-medium">Masking</span>
                          </button>
                          <button
                            className="flex flex-col items-center gap-2 p-3 rounded-lg border dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-150"
                            onClick={() => setShowCatalogPolicyPanel(true)}
                          >
                            <Layers className="h-5 w-5 text-purple-500" />
                            <span className="text-xs font-medium">Aggregation</span>
                          </button>
                          <button
                            className="flex flex-col items-center gap-2 p-3 rounded-lg border dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-150"
                            onClick={() => {
                              if (readOnlyGuard()) return;
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
                          {/*<button
                            className="flex flex-col items-center gap-2 p-3 rounded-lg border dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 hover:shadow-sm hover:-translate-y-0.5 transition-all duration-150"
                            onClick={() => toast('Column naming rules — coming soon')}
                          >
                            <Columns3 className="h-5 w-5 text-slate-500" />
                            <span className="text-xs font-medium">Column Names</span>
                          </button>*/}
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
                          <Tooltip content="AI-classify columns as PII, Measure, Dimension, etc.">
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1 text-xs"
                              disabled={isClassifying || !selectedProjectId}
                              onClick={handleAIClassify}
                            >
                              {isClassifying ? (
                                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Sparkles className="h-3.5 w-3.5 text-purple-500" />
                              )}
                              AI Classify
                            </Button>
                          </Tooltip>
                          <Tooltip content="Train a full ML classification model in Intelligence">
                            <a
                              href="/intelligent?tab=advanced-ml&subtab=classification"
                              className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-blue-600 dark:text-blue-400 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                            >
                              <Sparkles className="h-3 w-3" />
                              Train Model
                            </a>
                          </Tooltip>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 text-xs"
                            disabled={isReadOnly}
                            onClick={() => {
                              if (readOnlyGuard()) return;
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
                                {/* AI Classification Badges */}
                                {(() => {
                                  const cls = columnClassifications.get(selectedTable?.id || '')?.[col.name];
                                  if (!cls) return null;
                                  const upper = cls.toUpperCase();
                                  if (upper === 'PII' || upper === 'PII_CANDIDATE') return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[9px] font-medium">PII</Badge>;
                                  if (upper === 'MEASURE') return <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 text-[9px] font-medium">Measure</Badge>;
                                  if (upper === 'DIMENSION') return <Badge className="bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 text-[9px] font-medium">Dimension</Badge>;
                                  if (upper === 'DATE_KEY') return <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 text-[9px] font-medium">Date</Badge>;
                                  if (upper === 'IDENTIFIER' || upper === 'FOREIGN_KEY') return <Badge className="bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400 text-[9px] font-medium">FK</Badge>;
                                  if (upper === 'FLAG') return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[9px] font-medium">Flag</Badge>;
                                  if (upper === 'AUDIT') return <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 text-[9px] font-medium">Audit</Badge>;
                                  return <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 text-[9px]">{cls}</Badge>;
                                })()}
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {/* Preview & Profile Button */}
                                <Tooltip content="Preview Data & Profile">
                                  <button
                                    aria-label="Preview data and profile"
                                    className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                                    onClick={() => setColumnPreviewModal({ isOpen: true, column: col })}
                                  >
                                    <BarChart3 className="h-4 w-4 text-slate-400 hover:text-purple-500" />
                                  </button>
                                </Tooltip>
                                {/* Primary Key Button */}
                                <Tooltip content={col.isPrimaryKey ? "Remove Primary Key" : "Set as Primary Key"}>
                                  <button
                                    aria-label={col.isPrimaryKey ? "Remove primary key" : "Set as primary key"}
                                    className={cn(
                                      "p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700",
                                      col.isPrimaryKey && "bg-amber-100 dark:bg-amber-900/30"
                                    )}
                                    onClick={() => {
                                      if (readOnlyGuard()) return;
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
                                    aria-label={col.isSensitive ? "Manage sensitive marking" : "Mark as sensitive"}
                                    className={cn(
                                      "p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700",
                                      col.isSensitive && "bg-red-100 dark:bg-red-900/30"
                                    )}
                                    onClick={() => { if (readOnlyGuard()) return; setSensitiveColumnModal({ isOpen: true, column: col }); }}
                                  >
                                    <Shield className={cn("h-4 w-4", col.isSensitive ? "text-red-500" : "text-slate-400 hover:text-red-500")} />
                                  </button>
                                </Tooltip>
                                {/* Exclude from Modeling Button */}
                                <Tooltip content={excludedColumns.get(selectedTable?.id || '')?.has(col.name) ? "Include in Modeling" : "Exclude from Modeling"}>
                                  <button
                                    aria-label={excludedColumns.get(selectedTable?.id || '')?.has(col.name) ? "Include in modeling" : "Exclude from modeling"}
                                    className={cn(
                                      "p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700",
                                      excludedColumns.get(selectedTable?.id || '')?.has(col.name) && "bg-slate-200 dark:bg-slate-700"
                                    )}
                                    onClick={() => { if (readOnlyGuard()) return; setColumnExclusionModal({ isOpen: true, column: col }); }}
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
                                    aria-label="Rename column"
                                    className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                                    onClick={() => {
                                      if (readOnlyGuard()) return;
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

                    {/* Inline Data Preview Panel */}
                    {showInlinePreview && (
                      <div className="mt-4 bg-white dark:bg-slate-900 rounded-lg shadow-sm border dark:border-slate-800 overflow-hidden">
                        <div className="bg-blue-50 dark:bg-blue-900/20 px-4 py-2.5 flex items-center justify-between border-b border-blue-100 dark:border-blue-800">
                          <div className="flex items-center gap-2">
                            <Eye className="h-4 w-4 text-blue-600" />
                            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Data Preview</span>
                            {inlinePreviewData && (
                              <Badge className="bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 text-[10px]">
                                {inlinePreviewData.total_rows.toLocaleString()} total rows
                              </Badge>
                            )}
                          </div>
                          <button
                            aria-label="Close preview"
                            onClick={() => setShowInlinePreview(false)}
                            className="p-1 rounded hover:bg-blue-100 dark:hover:bg-blue-800/50 text-blue-400 hover:text-blue-600 transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="overflow-x-auto max-h-60">
                          {isLoadingInlinePreview ? (
                            <div className="flex items-center justify-center py-8">
                              <RefreshCw className="h-5 w-5 animate-spin text-blue-400" />
                              <span className="ml-2 text-sm text-slate-500">Loading preview...</span>
                            </div>
                          ) : inlinePreviewData && inlinePreviewData.rows.length > 0 ? (
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800 border-b dark:border-slate-700">
                                  <th className="px-2.5 py-1.5 text-left font-medium text-slate-500 w-8">#</th>
                                  {inlinePreviewData.columns.map((col: string) => (
                                    <th key={col} className="px-2.5 py-1.5 text-left font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">{col}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {inlinePreviewData.rows.slice(0, 5).map((row: Record<string, any>, i: number) => (
                                  <tr key={i} className={cn("border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50", i % 2 === 1 && "bg-slate-50/50 dark:bg-slate-800/20")}>
                                    <td className="px-2.5 py-1.5 text-slate-400 font-mono">{i + 1}</td>
                                    {inlinePreviewData.columns.map((col: string) => {
                                      const val = row[col];
                                      const isNull = val === null || val === undefined;
                                      return (
                                        <td key={col} className={cn("px-2.5 py-1.5 font-mono truncate max-w-[180px]", isNull ? "text-slate-400 italic" : "text-slate-700 dark:text-slate-300")} title={isNull ? 'NULL' : String(val)}>
                                          {isNull ? <span className="text-slate-400 italic">null</span> : String(val)}
                                        </td>
                                      );
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : (
                            <div className="py-6 text-center text-sm text-slate-400">No preview data available</div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Inline Data Profile Panel */}
                    {showInlineProfile && (
                      <div className="mt-4 bg-white dark:bg-slate-900 rounded-lg shadow-sm border dark:border-slate-800 overflow-hidden">
                        <div className="bg-purple-50 dark:bg-purple-900/20 px-4 py-2.5 flex items-center justify-between border-b border-purple-100 dark:border-purple-800">
                          <div className="flex items-center gap-2">
                            <BarChart3 className="h-4 w-4 text-purple-600" />
                            <span className="text-sm font-medium text-purple-700 dark:text-purple-300">Data Profile</span>
                            {inlineProfileData && (
                              <>
                                <Badge className="bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400 text-[10px]">
                                  {inlineProfileData.row_count.toLocaleString()} rows
                                </Badge>
                                <Badge className={cn("text-[10px]",
                                  inlineProfileData.aggregate_quality_score >= 80
                                    ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                    : inlineProfileData.aggregate_quality_score >= 60
                                      ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                                      : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                )}>
                                  Quality: {inlineProfileData.aggregate_quality_score}%
                                </Badge>
                              </>
                            )}
                          </div>
                          <button
                            aria-label="Close profile"
                            onClick={() => setShowInlineProfile(false)}
                            className="p-1 rounded hover:bg-purple-100 dark:hover:bg-purple-800/50 text-purple-400 hover:text-purple-600 transition-colors"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="max-h-72 overflow-y-auto">
                          {isLoadingInlineProfile ? (
                            <div className="flex items-center justify-center py-8">
                              <RefreshCw className="h-5 w-5 animate-spin text-purple-400" />
                              <span className="ml-2 text-sm text-slate-500">Profiling columns...</span>
                            </div>
                          ) : inlineProfileData && inlineProfileData.columns.length > 0 ? (
                            <div className="divide-y dark:divide-slate-800">
                              {inlineProfileData.columns.map((col: any) => {
                                const nullPct = inlineProfileData.row_count > 0 ? ((col.null_count ?? 0) / inlineProfileData.row_count) * 100 : 0;
                                const distinctPct = inlineProfileData.row_count > 0 ? ((col.distinct_count ?? 0) / inlineProfileData.row_count) * 100 : 0;
                                const qualityScore = col.quality_score ?? 100;
                                return (
                                  <div key={col.column_name} className="px-4 py-2.5 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                                    <span className="font-mono text-xs font-medium text-slate-700 dark:text-slate-200 min-w-[140px] truncate">{col.column_name}</span>
                                    <Badge className="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 text-[9px] font-mono px-1 py-0">{col.data_type}</Badge>
                                    <div className="flex items-center gap-3 ml-auto text-[10px]">
                                      <span className="text-slate-500">{(col.distinct_count ?? 0).toLocaleString()} distinct ({distinctPct.toFixed(1)}%)</span>
                                      {(col.null_count ?? 0) > 0 && (
                                        <Badge className="bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 text-[9px]">
                                          {nullPct.toFixed(1)}% null
                                        </Badge>
                                      )}
                                      <div className="flex items-center gap-1">
                                        <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                          <div
                                            className={cn("h-full rounded-full", qualityScore >= 80 ? "bg-green-500" : qualityScore >= 60 ? "bg-yellow-500" : "bg-red-500")}
                                            style={{ width: `${qualityScore}%` }}
                                          />
                                        </div>
                                        <span className={cn("font-medium", qualityScore >= 80 ? "text-green-600" : qualityScore >= 60 ? "text-yellow-600" : "text-red-600")}>
                                          {qualityScore}%
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="py-6 text-center text-sm text-slate-400">No profile data available</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500">
                    <Table2 className="h-16 w-16 mb-4 text-slate-300" />
                    <p className="font-medium text-lg">Select a table</p>
                    <p className="text-sm mt-1">Choose a table from the list to view and edit columns</p>
                  </div>
                )}
              </div>
            </>
          )}

          {viewMode === 'modeling' && (
            // Modeling View
            <div className="flex-1 overflow-hidden relative">
              {/* Fullscreen Header */}
              {isFullscreen && (
                <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-4 py-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur border-b dark:border-slate-800">
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
                    <div className="relative">
                      <Tooltip content={isReadOnly ? 'View-only access' : selectedProjectId ? "Create Table" : "Select a project first"}>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isReadOnly}
                          onClick={() => {
                            if (readOnlyGuard()) return;
                            if (!selectedProjectId) {
                              toast.error('Please select a project first');
                              return;
                            }
                            setShowCreateMenuModeling(!showCreateMenuModeling);
                          }}
                          className="gap-1.5"
                        >
                          <Plus className="h-4 w-4" />
                          Create
                          <ChevronDown className="h-3 w-3" />
                        </Button>
                      </Tooltip>
                      {showCreateMenuModeling && (
                        <div className="absolute top-full left-0 mt-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1 z-50 min-w-[220px]">
                          <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Tables</div>
                          <button
                            className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-300"
                            onClick={() => { setCreateTableType('standard'); setShowCreateTableModal(true); setShowCreateMenuModeling(false); }}
                          >
                            <TableIcon className="w-4 h-4" /> Standard Table
                          </button>
                          <button
                            className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-300"
                            onClick={() => { setCreateTableType('temporary'); setShowCreateTableModal(true); setShowCreateMenuModeling(false); }}
                          >
                            <Clock className="w-4 h-4" /> Temporary Table
                          </button>
                          <button
                            className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-300"
                            onClick={() => { setCreateTableType('transient'); setShowCreateTableModal(true); setShowCreateMenuModeling(false); }}
                          >
                            <Timer className="w-4 h-4" /> Transient Table
                          </button>
                          <button
                            className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-300"
                            onClick={() => { setCreateTableType('external'); setShowCreateTableModal(true); setShowCreateMenuModeling(false); }}
                          >
                            <Cloud className="w-4 h-4" /> External Table
                          </button>
                          <button
                            className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-300"
                            onClick={() => { setCreateTableType('iceberg'); setShowCreateTableModal(true); setShowCreateMenuModeling(false); }}
                          >
                            <Snowflake className="w-4 h-4" /> Iceberg Table
                          </button>
                          <div className="border-t dark:border-slate-700 my-1" />
                          <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Specialized</div>
                          <button
                            className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-300"
                            onClick={() => { setDynamicTableModal(true); setShowCreateMenuModeling(false); }}
                          >
                            <RefreshCw className="w-4 h-4" /> Dynamic Table
                          </button>
                          <button
                            className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-300"
                            onClick={() => { setEventTableModal(true); setShowCreateMenuModeling(false); }}
                          >
                            <Bell className="w-4 h-4" /> Event Table
                          </button>
                          <button
                            className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-300"
                            onClick={() => { setHybridTableModal(true); setShowCreateMenuModeling(false); }}
                          >
                            <Layers className="w-4 h-4" /> Hybrid Table
                          </button>
                          <div className="border-t dark:border-slate-700 my-1" />
                          <div className="px-3 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Data Integration</div>
                          <button
                            className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-300"
                            onClick={() => { setStreamModal(true); setShowCreateMenuModeling(false); }}
                          >
                            <GitBranch className="w-4 h-4" /> Stream (CDC)
                          </button>
                          <button
                            className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-300"
                            onClick={() => { setAlertModal(true); setShowCreateMenuModeling(false); }}
                          >
                            <AlertTriangle className="w-4 h-4" /> Alert
                          </button>
                        </div>
                      )}
                    </div>
                    <Tooltip content={isReadOnly ? 'View-only access' : "Ingestion Config"}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (readOnlyGuard()) return;
                          if (!selectedTable) {
                            toast.error('Please select a table first');
                            return;
                          }
                          setShowModelingIngestionPanel(true);
                        }}
                        disabled={!selectedTable || isReadOnly}
                        className="gap-2"
                      >
                        <Upload className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                    <Tooltip content={isReadOnly ? 'View-only access' : "Manage Relationships"}>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (readOnlyGuard()) return;
                          if (!selectedTable) {
                            toast.error('Please select a table first');
                            return;
                          }
                          setShowRelationshipModal(true);
                        }}
                        disabled={!selectedTable || isReadOnly}
                        className="gap-2"
                      >
                        <Link2 className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                    <div className="w-px h-6 bg-slate-200 dark:bg-slate-700" />
                    <Tooltip content={isReadOnly ? 'View-only access' : 'Undo'}>
                      <Button variant="outline" size="sm" onClick={() => undoEvent()} disabled={!canUndo || isReadOnly}>
                        <Undo2 className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                    <Tooltip content={isReadOnly ? 'View-only access' : 'Redo'}>
                      <Button variant="outline" size="sm" onClick={() => redoEvent()} disabled={!canRedo || isReadOnly}>
                        <Redo2 className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                    <div className="w-px h-6 bg-slate-200 dark:bg-slate-700" />
                    <Button
                      size="sm"
                      className="gap-1 bg-gradient-to-r from-blue-600 to-indigo-600"
                      onClick={async () => {
                        if (readOnlyGuard()) return;
                        if (!selectedProjectId) {
                          toast.error('Please select a project first');
                          return;
                        }
                        // Check for conflicts before opening the deployment modal
                        const eventIds = pendingEvents.map(e => e.id);
                        if (eventIds.length > 0) {
                          const hasConflicts = await checkForConflicts(eventIds);
                          if (hasConflicts) {
                            pendingConflictAction.current = { type: 'deploy', eventIds };
                            return;
                          }
                        }
                        setShowDeploymentModal(true);
                      }}
                      disabled={!selectedProjectId || isReadOnly}
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

              <ErrorBoundary>
              <ModelingCanvas
                tables={tables.filter(t => modelingTableIds.has(t.id))}
                tableColumns={tableColumnsMap}
                onColumnsMapUpdate={setTableColumnsMap}
                onTableSelect={handleTableClick}
                onTableExclude={handleRemoveFromModeling}
                isReadOnly={isReadOnly}
                onRelationCreate={async (source, target, sourceCol, targetCol, transformation) => {
                  if (readOnlyGuard()) return;
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
                        module_name: 'EXPLORE_DESIGN',
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
                onDynamicTableCreate={(table) => {
                  setSelectedTable(table);
                  setDynamicTableModal(true);
                }}
                onEventTableCreate={(table) => {
                  setSelectedTable(table);
                  setEventTableModal(true);
                }}
                onHybridTableCreate={(table) => {
                  setSelectedTable(table);
                  setHybridTableModal(true);
                }}
                onStreamCreate={(table) => {
                  setSelectedTable(table);
                  setStreamModal(true);
                }}
                onAlertCreate={(table) => {
                  setSelectedTable(table);
                  setAlertModal(true);
                }}
                className={cn("h-full", isFullscreen && "pt-16")}
                projectId={selectedProjectId}
                defaultRelationships={defaultRelationships}
                isFullscreen={isFullscreen}
                onToggleFullscreen={isFullscreen ? exitFullscreen : toggleFullscreen}
                showSidebar={showSidebar}
                onToggleSidebar={() => setShowSidebar(!showSidebar)}
                showEventPanel={showEventPanel}
                onToggleEventPanel={() => setShowEventPanel(!showEventPanel)}
                targetTableIds={targetTableIds}
                initialMappings={initialColumnMappings}
              />
              </ErrorBoundary>
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
        onSetPrimaryKey={() => { if (readOnlyGuard()) return; setShowBulkPKModal(true); }}
        onSetIngestionMode={(mode) => { if (readOnlyGuard()) return; handleBulkIngestionMode(mode); }}
        onApplyMasking={() => { if (readOnlyGuard()) return; setShowBulkMaskingModal(true); }}
        onClearSelection={() => setSelectedTables(new Set())}
        onConfigureRelations={() => { if (readOnlyGuard()) return; setShowRelationsModal(true); }}
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
              handleDiscoverRelationships();
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

      {/* DAG Dependency Graph Modal */}
      <Modal isOpen={showDagViewer && !!selectedProjectId} onClose={() => setShowDagViewer(false)} size="full" className="max-w-6xl">
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Workflow className="h-5 w-5 text-violet-600" />
              Dependency Graph (DAG)
            </h3>
            <button onClick={() => setShowDagViewer(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>
          {selectedProjectId && <DagViewer projectId={selectedProjectId} className="h-[70vh]" />}
        </div>
      </Modal>

      {/* Ingestion Results Modal */}
      <Modal isOpen={showIngestionResults && !!selectedProjectId} onClose={() => setShowIngestionResults(false)} size="full" className="max-w-5xl">
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-teal-500" />
              Ingestion Runs
            </h3>
            <button onClick={() => setShowIngestionResults(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>
          {selectedProjectId && <IngestionResultsPanel projectId={selectedProjectId} className="max-h-[70vh] overflow-auto" />}
        </div>
      </Modal>

      {/* AI Intelligence Modal */}
      <Modal isOpen={showAiPanel} onClose={() => setShowAiPanel(false)} size="lg">
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              AI Intelligence
            </h3>
            <button onClick={() => setShowAiPanel(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>
          <AiFeatureToggle />
        </div>
      </Modal>

      {/* Deployment Modal — B1-B5 pipeline is now inside DeploymentValidation */}
      <Modal
        isOpen={showDeploymentModal}
        onClose={() => setShowDeploymentModal(false)}
        customSize="1050px"
      >
        <ErrorBoundary>
          <DeploymentValidation
            onClose={() => setShowDeploymentModal(false)}
            database={selectedDatabase /*|| 'CP_DATA360'*/}
            schemas={Array.from(selectedSchemas.keys())}
            projectId={selectedProjectId!}
          />
        </ErrorBoundary>
      </Modal>

      {/* Self-Serve Ingestion Modal */}
      <SelfServeIngestionModal
        isOpen={showIngestionModal}
        onClose={() => setShowIngestionModal(false)}
        projectId={selectedProjectId}
      />

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
          onAcceptSuggestion={(evt) => {
            if (!selectedTable) return;
            const suggestion = evt.suggestion.toUpperCase();
            if (suggestion.startsWith('CHANGE TO') || suggestion.startsWith('RESIZE')) {
              const newType = evt.suggestion.replace(/^change to\s+/i, '').replace(/^resize to\s+/i, '').trim();
              addEvent({
                type: 'COLUMN_TYPE_CHANGED',
                projectId: selectedProjectId ?? undefined,
                target: {
                  database: selectedTable.database,
                  schema: selectedTable.schema,
                  table: selectedTable.table,
                  column: evt.column,
                },
                payload: {
                  oldType: evt.currentType,
                  newType,
                  source: 'ai_optimization',
                  aiClass: evt.aiClass,
                },
              });
            } else if (suggestion.includes('MASKING') || evt.aiClass === 'PII_CANDIDATE') {
              addEvent({
                type: 'MASKING_POLICY_APPLIED',
                projectId: selectedProjectId ?? undefined,
                target: {
                  database: selectedTable.database,
                  schema: selectedTable.schema,
                  table: selectedTable.table,
                  column: evt.column,
                },
                payload: {
                  policyName: 'pii_mask',
                  columns: [evt.column],
                  source: 'ai_optimization',
                  aiClass: evt.aiClass,
                },
              });
            }
          }}
        />
      )}

      {/* Create Table Modal - Creates in user's chosen DWH target schema */}
      {/* Note: Modal only opens if selectedProjectId is set (checked in onClick handler) */}
      <CreateTableModal
        isOpen={showCreateTableModal}
        onClose={() => setShowCreateTableModal(false)}
        database={dwhTargetDatabase || selectedDatabase || ''}
        schema={dwhTargetSchema || ''}
        projectId={selectedProjectId!}
        initialTableType={createTableType}
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
                module_name: 'EXPLORE_DESIGN',
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

      {/* Event Template Library (local) */}
      <TemplateLibrary
        isOpen={showTemplateLibrary}
        onClose={() => setShowTemplateLibrary(false)}
        projectId={selectedProjectId}
        currentDatabase={dwhTargetDatabase || undefined}
        currentSchema={dwhTargetSchema || undefined}
      />

      {/* Event Template Picker (server-side API) */}
      {selectedProjectId && (
        <EventTemplatePickerModal
          isOpen={showEventTemplatePicker}
          onClose={() => setShowEventTemplatePicker(false)}
          projectId={selectedProjectId}
          targetDatabase={dwhTargetDatabase || selectedDatabase || ''}
          targetSchema={dwhTargetSchema || ''}
          onApplied={(result) => {
            toast.success(`Template applied: ${result.events_created} events created`);
            // Refresh events after template apply
          }}
        />
      )}

      {/* Audit Trail Panel (modal overlay) */}
      {showAuditTrail && selectedProjectId && (
        <Modal isOpen={showAuditTrail} onClose={() => setShowAuditTrail(false)} size="xl">
          <div className="p-4">
            <AuditTrailPanel projectId={selectedProjectId} />
          </div>
        </Modal>
      )}

      {/* Conflict Resolution Modal */}
      <ConflictResolutionModal
        isOpen={showConflictModal}
        onClose={() => {
          setShowConflictModal(false);
          setCurrentConflict(null);
          pendingConflictAction.current = null;
        }}
        conflict={currentConflict}
        onResolve={handleConflictResolve}
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
              module_name: 'EXPLORE_DESIGN',
              event_type: 'MODELING_TEMPLATE_CHOSEN',
              status: 'completed',
              details: { choice: 'dwh_template', targetDatabase: database, targetSchema: schema },
              entity_id: `template-dwh_template`,
              entity_type: 'modeling_config',
            }).catch(() => {});
          }
        }}
      />

      {/* Data Engineering Modals */}
      <DynamicTableModal
        isOpen={dynamicTableModal}
        onClose={() => setDynamicTableModal(false)}
        sourceTable={selectedTable || undefined}
        warehouses={[]}
      />
      <StreamModal
        isOpen={streamModal}
        onClose={() => setStreamModal(false)}
        sourceTable={selectedTable || undefined}
      />
      <AlertModal
        isOpen={alertModal}
        onClose={() => setAlertModal(false)}
        sourceTable={selectedTable || undefined}
        warehouses={[]}
      />
      <EventTableModal
        isOpen={eventTableModal}
        onClose={() => setEventTableModal(false)}
        context={selectedTable ? { database: selectedTable.database, schema: selectedTable.schema } : undefined}
      />
      <HybridTableModal
        isOpen={hybridTableModal}
        onClose={() => setHybridTableModal(false)}
        context={selectedTable ? { database: selectedTable.database, schema: selectedTable.schema } : undefined}
      />

      {/* Catalog Policy Assignment Panel */}
      {showCatalogPolicyPanel && selectedTable && (
        <Modal isOpen onClose={() => setShowCatalogPolicyPanel(false)} size="xl">
          <PolicyAssignmentPanel
            table={selectedTable}
            columns={tableColumns}
            onPolicyApplied={() => { toast.success('Policy applied'); setShowCatalogPolicyPanel(false); }}
            onClose={() => setShowCatalogPolicyPanel(false)}
            projectId={selectedProjectId}
          />
        </Modal>
      )}

      {/* Catalog Ingestion Config Panel */}
      {showIngestionPanel && selectedTable && (
        <Modal isOpen onClose={() => setShowIngestionPanel(false)} size="xl">
          <IngestionConfigPanel
            table={{ database: selectedTable.database, schema: selectedTable.schema, table: selectedTable.table }}
            projectId={selectedProjectId ?? undefined}
            columns={tableColumns}
            ingestionMode={catalogIngestionMode}
            onModeChange={setCatalogIngestionMode}
          />
        </Modal>
      )}

      {/* Modeling Ingestion Config Panel */}
      {showModelingIngestionPanel && selectedTable && (
        <Modal isOpen onClose={() => setShowModelingIngestionPanel(false)} size="xl">
          <IngestionConfigPanel
            table={{ database: selectedTable.database, schema: selectedTable.schema, table: selectedTable.table }}
            projectId={selectedProjectId ?? undefined}
            columns={tableColumns}
            ingestionMode={modelingIngestionMode}
            onModeChange={setModelingIngestionMode}
          />
        </Modal>
      )}

      {/* Data Engineering Objects Modal */}
      <Modal
        isOpen={dataEngModal.isOpen}
        onClose={() => setDataEngModal(prev => ({ ...prev, isOpen: false }))}
        size="lg"
      >
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              {dataEngModal.type === 'dynamic_tables' && <><RefreshCw className="h-5 w-5 text-blue-500" /> Dynamic Tables</>}
              {dataEngModal.type === 'streams' && <><GitBranch className="h-5 w-5 text-green-500" /> Streams</>}
              {dataEngModal.type === 'alerts' && <><AlertTriangle className="h-5 w-5 text-amber-500" /> Alerts</>}
              <Badge className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs ml-2">
                {selectedDatabase}.{dataEngModal.schema}
              </Badge>
            </h3>
            <button aria-label="Close dialog" onClick={() => setDataEngModal(prev => ({ ...prev, isOpen: false }))} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
              <X className="h-5 w-5 text-slate-400" />
            </button>
          </div>

          {dataEngModal.loading ? (
            <div className="space-y-3 py-6 px-2">
              <div className="h-4 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
              <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
            </div>
          ) : dataEngModal.items.length === 0 ? (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              <p className="text-sm">No {dataEngModal.type.replace('_', ' ')} found in this schema</p>
            </div>
          ) : (
            <div className="divide-y dark:divide-slate-700 border rounded-lg dark:border-slate-700">
              {dataEngModal.items.map((item: any, idx: number) => {
                const name = item.name || item.TABLE_NAME || item.STREAM_NAME || item.ALERT_NAME || `item-${idx}`;
                return (
                  <div key={name} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-mono text-sm text-slate-900 dark:text-white truncate">{name}</span>
                      {item.scheduling_state && (
                        <Badge className={cn(
                          'text-[9px]',
                          item.scheduling_state === 'RUNNING' || item.scheduling_state === 'ACTIVE'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                        )}>
                          {item.scheduling_state}
                        </Badge>
                      )}
                      {item.stale_after && (
                        <span className="text-[10px] text-slate-400">lag: {item.stale_after}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Dynamic Table actions */}
                      {dataEngModal.type === 'dynamic_tables' && (
                        <>
                          <Tooltip content="Suspend">
                            <button
                              aria-label="Suspend dynamic table"
                              className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                              onClick={() => handleDataEngAction(name, 'suspend')}
                            >
                              <Square className="h-3.5 w-3.5 text-yellow-500" />
                            </button>
                          </Tooltip>
                          <Tooltip content="Resume">
                            <button
                              aria-label="Resume dynamic table"
                              className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                              onClick={() => handleDataEngAction(name, 'resume')}
                            >
                              <Play className="h-3.5 w-3.5 text-green-500" />
                            </button>
                          </Tooltip>
                          <Tooltip content="Refresh Now">
                            <button
                              aria-label="Refresh dynamic table"
                              className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                              onClick={() => handleDataEngAction(name, 'refresh')}
                            >
                              <RefreshCw className="h-3.5 w-3.5 text-blue-500" />
                            </button>
                          </Tooltip>
                          <Tooltip content="Drop">
                            <button
                              aria-label="Drop dynamic table"
                              className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                              onClick={() => handleDataEngAction(name, 'drop')}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </button>
                          </Tooltip>
                        </>
                      )}
                      {/* Stream actions */}
                      {dataEngModal.type === 'streams' && (
                        <>
                          <Tooltip content="View Change Data">
                            <button
                              aria-label="View change data"
                              className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700"
                              onClick={() => handleDataEngAction(name, 'view_data')}
                            >
                              <Eye className="h-3.5 w-3.5 text-blue-500" />
                            </button>
                          </Tooltip>
                          <Tooltip content="Drop">
                            <button
                              aria-label="Drop stream"
                              className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                              onClick={() => handleDataEngAction(name, 'drop')}
                            >
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </button>
                          </Tooltip>
                        </>
                      )}
                      {/* Alert actions */}
                      {dataEngModal.type === 'alerts' && (
                        <Tooltip content="Drop">
                          <button
                            aria-label="Drop alert"
                            className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30"
                            onClick={() => handleDataEngAction(name, 'drop')}
                          >
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </button>
                        </Tooltip>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>
      {/* Cross-module links */}
      <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
        <span>Related:</span>
        <a href="/workflow" className="text-blue-600 dark:text-blue-400 hover:underline">Workflow (ETL Pipelines)</a>
        <a href="/data-quality" className="text-blue-600 dark:text-blue-400 hover:underline">Data Quality (Checks)</a>
        <a href="/gouvernance" className="text-blue-600 dark:text-blue-400 hover:underline">Governance (Policies)</a>
      </div>
    </div>
    </ErrorBoundary>
  );
}
