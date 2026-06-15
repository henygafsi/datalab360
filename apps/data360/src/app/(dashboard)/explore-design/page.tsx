'use client';
// Data journey: page → getDatabases/getSchemas/getTables/getTableColumns (mapping) + listProjectEvents (projectsApi) + addEvent/listMappings (projects/exploreDesign API) → backend
// ////dependency//// page → services.mapping, services.explore-design (fetchRelationships), services.api (projectsApi, exploreDesignApi), services.governance (policies)
import React, { useState, useEffect, useCallback, useMemo, useRef, useDeferredValue } from 'react';
import PermissionGate from '@/components/ui/PermissionGate';
import { useCanPerform } from '@/hooks/useCanPerform';
import { useAtomValue } from 'jotai';
import { lastInvalidationAtom, useCacheInvalidationContext } from '@/components/providers/CacheInvalidationProvider';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { Button, Badge, Input, Modal, Text, Tooltip } from 'rizzui';
import { toast } from 'react-hot-toast';
import { motion } from 'framer-motion';
import {
  Search, Database, Table2, Columns3, Key, Shield, RefreshCw,
  Settings, ChevronRight, ChevronDown, Filter, Download, Upload,
  Layers, Grid3X3, LayoutGrid, CheckSquare, Square, AlertTriangle,
  Clock, History, Lock, Eye, Play, Save, X, Plus, Minus, Trash2,
  FileText, BookOpen, Sparkles, Zap, GitBranch, ArrowRight, ArrowLeftRight,
  Workflow, Rocket, Undo2, Redo2, PanelLeft, PanelRight, Maximize2, Minimize2,
  WifiOff, BarChart3, MinusCircle, Link2, TableIcon, Bell, Cloud, Snowflake, Timer,
  BookTemplate, Activity, AlertCircle, MoreVertical, FolderOpen,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useRouter, useSearchParams } from 'next/navigation';
import { getSchemas } from '@/app/services/mapping/getSchema';
import { getTables } from '@/app/services/mapping/getTables';
import { getTableColumns, TableColumnsTimeoutError } from '@/app/services/mapping/fetch_tables';
import { getDatabases } from '@/app/services/mapping/getDatabases';
import { getMaskingPolicies, MaskingPolicy } from '@/app/services/governance/policies';
import {
  getRecentDeploymentErrors,
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
} from '@/app/services/explore-design/de-objects';
import type { TableRelationship } from '@/app/services/explore-design/de-objects';
import { listDDLActions, addDDLAction, removeDDLAction, validateFkTypes, cascadeDrop, checkConflicts, aiSchemaHealth, tablePreview, tableProfile as fetchTableProfile } from '@/app/services/api/exploreDesignApi';
import { generateSnowflakeSQL, DDL_EVENT_TYPES, inferDDLType } from './components/deployment/deployment-utils';
import { addEvent as addProjectEvent, listEvents as listProjectEvents, listContributors, listProjects } from '@/app/services/api/projectsApi';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { getApiErrorMessage } from '@/lib/api-client';
import { isUnavailable } from '@/lib/http-status';
import { fmtNum } from '@/app/shared/ui/format';
import { createSchemaClone } from '@/app/services/explore-design';
import ProjectGatePanel from '@/components/project-onboarding/ProjectGatePanel';
import { useAuth } from '@/hooks/useAuth';
import { useSession } from 'next-auth/react';
import type { ContributorRole, SchemaHealthResult, ColumnMapping as BackendColumnMapping, TableRef } from '@/app/services/api/types';
import VirtualizedTableList, { TableItem, ColumnInfo } from '../mapping/components/VirtualizedTableList';
import TableDetailPanel, { TableConfig, IngestionMode, IngestionConfig, MaskingConfig } from '../mapping/components/TableDetailPanel';
import dynamic from 'next/dynamic';
const ModelingCanvas = dynamic(() => import('./components/ModelingCanvas'), { ssr: false });
const SourceMindMap = dynamic(() => import('./components/SourceMindMap'), { ssr: false });
const ContextRightBar = dynamic(() => import('./components/ContextRightBar'), { ssr: false });
import type { RightBarTab, FocusedAction } from './components/ContextRightBar';
import EventTable from './components/EventTable';
import DeploymentValidation from './components/DeploymentValidation';
import AiGuidedModelButton from './components/ai-guided/AiGuidedModelButton';
import AiGuidedModelWizard from './components/ai-guided/AiGuidedModelWizard';
import ScanPrefillBanner, { type ScanSuggestion } from './components/ScanPrefillBanner';
import SelfServeIngestionModal from './components/SelfServeIngestionModal';
import ProjectSelector from './components/ProjectSelector';
import UnifiedProjectWizard, {
  type UnifiedProjectWizardResult,
} from '@/components/project-onboarding/UnifiedProjectWizard';
import ManualAiTemplateFork, {
  type BuildMode,
} from '@/components/project-onboarding/ManualAiTemplateFork';
import { ProjectContextPanel, SchemaVersionDisplaySwitch } from '@/app/shared/project-context';
import {
  useEventStore,
  createPrimaryKeyEvent,
  createMaskingPolicyEvent,
  EventType
} from './stores/event-store';
import CreateTableModal, { SnowflakeTableType } from './components/CreateTableModal';
import RelationshipModal from './components/RelationshipModal';
import AccessManagementSlot from './components/AccessManagementSlot';
import ModelingTemplateModal, { type ModelingChoice } from './components/ModelingTemplateModal';
import DwhLocationPickerModal from './components/DwhLocationPickerModal';
// Data Engineering modals (merged from data-engineering module)
import DynamicTableModal from './components/DynamicTableModal';
import StreamModal from './components/StreamModal';
import AlertModal from './components/AlertModal';
import EventTableModal from './components/EventTableModal';
import { ActionRail } from '@/app/shared/action-rail';
// R6 — per-project ADN header badge. We import the read-only ADN primitives
// (icons + tone/rating helpers) but NOT the stock <AdnScoreCard> component: its
// `score` is a required number with no null path, so it can't honour the hard
// rule that an axis with no per-project source renders "—" (never a fake 0 or a
// fabricated neutral band). We therefore render a small AdnScoreCard-faithful
// strip locally (below) that DOES emit "—". Fed by the same per-project rollup
// the ProjectInspectorPanel uses.
import { AXIS_ICON, adnTone, ratingLabel } from '@/app/shared/command-center/AdnAxes';
import { useProjectRollup } from '@/app/shared/score-cards/useProjectRollup';
import type { ProjectRollup, ScoreCardDimension } from '@/app/services/command-center/score-cards';
import HybridTableModal from './components/HybridTableModal';
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

// View modes — only `catalog` and `modeling` are actually rendered as tabs.
// The legacy `'semantic'` member was kept around for an old experimental
// view that was removed; dropping it here so the type matches the UI.
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

// Overflow menu — holds secondary toolbar actions so the page header can
// fit on one line. Click toggles a small popover; click outside closes it.
// Each item is a {label, icon, onClick, active?, disabled?} entry rendered
// as a row with optional active highlight (e.g. when a panel is currently
// open) so the user still has a visual indicator of toggle state.
interface OverflowItem {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  /** Optional accent color (`'violet' | 'teal' | 'purple'`) when active. */
  activeColor?: 'violet' | 'teal' | 'purple' | 'blue';
}
const OverflowMenu: React.FC<{ items: OverflowItem[] }> = ({ items }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <Tooltip content="More actions">
        <button
          aria-label="More actions"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className={cn(
            'flex items-center justify-center rounded-md border border-slate-200 bg-white p-1.5 text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
            open && 'bg-slate-100 dark:bg-slate-700',
          )}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      </Tooltip>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-40 mt-1 min-w-[200px] overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
        >
          {items.map((it) => {
            const Icon = it.icon;
            const activeAccent =
              it.active && it.activeColor
                ? {
                    violet: 'text-violet-600 dark:text-violet-400',
                    teal: 'text-teal-600 dark:text-teal-400',
                    purple: 'text-purple-600 dark:text-purple-400',
                    blue: 'text-blue-600 dark:text-blue-400',
                  }[it.activeColor]
                : '';
            return (
              <button
                key={it.label}
                role="menuitem"
                disabled={it.disabled}
                onClick={() => {
                  it.onClick();
                  setOpen(false);
                }}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                  it.active
                    ? 'bg-slate-50 dark:bg-slate-800'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800',
                )}
              >
                <Icon className={cn('h-3.5 w-3.5 text-slate-500', activeAccent)} />
                <span className={cn('text-slate-700 dark:text-slate-200', activeAccent)}>{it.label}</span>
                {it.active && (
                  <span className="ml-auto text-[10px] uppercase text-slate-400">on</span>
                )}
              </button>
            );
          })}
        </div>
      )}
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
      if (process.env.NODE_ENV === 'development') console.log('[SchemaHealth] API response:', result);
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

// Memoized classification badge (avoids IIFE closure per column in render loop)
const ClassificationBadge = React.memo(function ClassificationBadge({
  tableId, columnName, classifications,
}: {
  tableId: string;
  columnName: string;
  classifications: Map<string, Record<string, string>>;
}) {
  const cls = classifications.get(tableId)?.[columnName];
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
});

// Single-pass column categorization (avoids 3 separate filter+map chains)
function categorizeColumns(columns: ColumnInfo[]) {
  const primaryKeys: string[] = [];
  const nullable: string[] = [];
  const sensitive: string[] = [];
  for (const c of columns) {
    if (c.isPrimaryKey) primaryKeys.push(c.name);
    if (c.isNullable) nullable.push(c.name);
    if (c.isSensitive) sensitive.push(c.name);
  }
  return { primaryKeys, nullable, sensitive };
}

// ── R6: per-project ADN 5-axis header badge ──────────────────────────────────
// `<ExploreAdnBadge>` renders the 5 ADN axes (Qualité · Perf · Sécurité ·
// Stockage · Usage) for the selected project, fed by the precomputed rollup
// (`useProjectRollup` → GET /command-center/projects/{id}/rollup) — the SAME
// source ProjectInspectorPanel uses. It is a local, AdnScoreCard-faithful strip
// (not the stock component) because an axis with no genuine per-project source
// MUST render an honest "—" rather than a fabricated band score; the stock
// component's required `number` score can't express that. Tone classes are
// static literal bundles so Tailwind always generates them (no safelist gap).

type ExploreAdnAxis = {
  key: 'DQ' | 'PERF' | 'SEC' | 'STORAGE' | 'USAGE';
  label: string;
  /** null = no per-project source → render "—" (never a fake 0 / neutral band). */
  score: number | null;
  desc: string;
};

type AdnTone = 'emerald' | 'amber' | 'rose';
const ADN_TONE: Record<AdnTone, { chip: string; icon: string; score: string; pill: string }> = {
  emerald: {
    chip: 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/20 dark:hover:bg-emerald-900/40',
    icon: 'text-emerald-500',
    score: 'text-emerald-700 dark:text-emerald-300',
    pill: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  },
  amber: {
    chip: 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-900/20 dark:hover:bg-amber-900/40',
    icon: 'text-amber-500',
    score: 'text-amber-700 dark:text-amber-300',
    pill: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  },
  rose: {
    chip: 'bg-rose-50 hover:bg-rose-100 dark:bg-rose-900/20 dark:hover:bg-rose-900/40',
    icon: 'text-rose-500',
    score: 'text-rose-700 dark:text-rose-300',
    pill: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
  },
};
const ADN_EMPTY = {
  chip: 'border border-slate-200 bg-transparent dark:border-slate-700',
  icon: 'text-slate-400 dark:text-slate-500',
  score: 'text-slate-400 dark:text-slate-500',
  pill: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
};

const ADN_BAND = { good: 85, warn: 65, bad: 42 } as const;
const adnNum = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const adnPct = (v: number): string => `${Number.isInteger(v) ? v : Math.round(v * 10) / 10}%`;
const adnStorage = (mb: number): string => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${Math.round(mb)} MB`);

// Maps the per-project rollup into the 5 ADN axes. An axis is `score: null`
// (→ "—") ONLY when the per-project source is genuinely absent — NOT when a real
// value is 0 (e.g. 0 events is a true low-usage signal, kept as a real score).
function deriveExploreAdn(rollup: ProjectRollup): ExploreAdnAxis[] {
  const card = (d: ScoreCardDimension) => rollup.cards.find((c) => c.dimension === d);
  const sup = (c?: { supporting?: Record<string, unknown> }) =>
    (c?.supporting ?? {}) as Record<string, unknown>;

  const dq = card('dq');
  const perf = card('perf');
  const gov = card('gov');
  const storage = card('storage');

  // DQ (Qualité) — coverage % only when scored from this project's own objects.
  const dqVal = adnNum(dq?.value);
  const dqProject = dq?.scope === 'project';
  const dqAxis: ExploreAdnAxis = {
    key: 'DQ',
    label: 'Qualité',
    score: dqVal != null && dqProject ? Math.round(dqVal) : null,
    desc:
      dqVal != null && dqProject
        ? `Couverture qualité ${adnPct(dqVal)} sur les objets de ce projet.`
        : 'Pas de source qualité par-projet (objets non monitorés) — affiché « — ».',
  };

  // PERF — 100 − fail-rate% (null when no runs are recorded for the project).
  const failRate = adnNum(perf?.value);
  const totalRuns = adnNum(sup(perf).total_runs);
  const perfAxis: ExploreAdnAxis = {
    key: 'PERF',
    label: 'Perf',
    score: failRate != null ? Math.max(0, Math.min(100, Math.round(100 - failRate))) : null,
    desc:
      failRate != null
        ? `Taux d'échec ${adnPct(failRate)}${totalRuns != null ? ` · ${totalRuns} run(s)` : ''}.`
        : 'Aucun run enregistré pour ce projet — affiché « — ».',
  };

  // SEC (Sécurité) — banded from contributors + active RLS; null when the gov
  // supporting object is absent (no per-project governance signal at all).
  const contributors = adnNum(sup(gov).contributors);
  const rls = adnNum(sup(gov).active_rls_policies);
  const hasGovSignal = contributors != null || rls != null;
  const secAxis: ExploreAdnAxis = {
    key: 'SEC',
    label: 'Sécurité',
    score: hasGovSignal
      ? contributors === 0
        ? ADN_BAND.bad
        : rls === 0
          ? ADN_BAND.warn
          : ADN_BAND.good
      : null,
    desc: hasGovSignal
      ? `${contributors ?? '—'} contributeur(s) · ${rls ?? '—'} policy RLS active(s).`
      : 'Pas de signal de gouvernance par-projet — affiché « — ».',
  };

  // STORAGE — banded footprint ONLY when per-project attributed; account-level or
  // unattributed → "—" (there is no honest per-project storage figure otherwise).
  const mb = adnNum(storage?.value) ?? adnNum(sup(storage).storage_mb);
  const storageProject = storage?.scope === 'project';
  const storAxis: ExploreAdnAxis = {
    key: 'STORAGE',
    label: 'Stockage',
    score: mb != null && storageProject ? (mb > 500 ? ADN_BAND.warn : ADN_BAND.good) : null,
    desc:
      mb != null && storageProject
        ? `${adnStorage(mb)} attribués à ce projet.`
        : 'Aucune attribution de stockage par-projet — affiché « — ».',
  };

  // USAGE — adoption over the window. A real 0 (no events) is a true low signal,
  // kept as a real score; only a non-finite count would be "—".
  const events = adnNum(rollup.eventCount30d);
  const usageAxis: ExploreAdnAxis = {
    key: 'USAGE',
    label: 'Usage',
    score: events != null ? (events === 0 ? ADN_BAND.bad : events >= 20 ? ADN_BAND.good : ADN_BAND.warn) : null,
    desc:
      events != null
        ? `${events} évènement(s) sur la fenêtre${totalRuns != null ? ` · ${totalRuns} run(s)` : ''}.`
        : 'Aucune donnée d’activité par-projet — affiché « — ».',
  };

  return [dqAxis, perfAxis, secAxis, storAxis, usageAxis];
}

// Hover popover for one axis (or the overall chip when `axis` is omitted).
function AdnAxisPopover({ axis, overall }: { axis?: ExploreAdnAxis; overall?: number | null }) {
  const score = axis ? axis.score : overall ?? null;
  const label = axis ? axis.label : 'Note ADN globale';
  const pill = score != null ? ADN_TONE[adnTone(score) as AdnTone].pill : ADN_EMPTY.pill;
  return (
    <div className="invisible absolute right-0 top-full z-50 mt-1.5 w-64 translate-y-1 rounded-xl border border-gray-200 bg-white p-3 text-left opacity-0 shadow-xl transition-all duration-150 group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-900 dark:text-white">{label}</span>
        <span className={cn('ml-auto rounded-full px-2 py-0.5 text-[10px] font-bold', pill)}>
          {score != null ? `${score}/100 · ${ratingLabel(score)}` : '— · indisponible'}
        </span>
      </div>
      <p className="text-[11px] leading-snug text-gray-500 dark:text-gray-400">
        {axis
          ? axis.desc
          : 'Score composite des axes par-projet (Qualité · Perf · Sécurité · Stockage · Usage). Les axes sans source par-projet affichent « — ».'}
      </p>
    </div>
  );
}

// One axis chip — real score in its tone, or a muted "—" when the source is absent.
function AdnAxisChip({ axis }: { axis: ExploreAdnAxis }) {
  const Icon = AXIS_ICON[axis.key];
  const t = axis.score != null ? ADN_TONE[adnTone(axis.score) as AdnTone] : ADN_EMPTY;
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={axis.score != null ? `${axis.label} ${axis.score} sur 100` : `${axis.label} indisponible`}
        className={cn('flex items-center gap-0.5 rounded-md px-1 py-0.5 transition-colors', t.chip)}
      >
        {Icon && <Icon className={cn('h-3.5 w-3.5', t.icon)} />}
        <span className={cn('text-[10px] font-semibold', t.score)}>{axis.score != null ? axis.score : '—'}</span>
      </button>
      <AdnAxisPopover axis={axis} />
    </div>
  );
}

// The compact strip: ADN label + 5 axis chips + overall roll-up chip.
function AdnStrip({ axes, overall }: { axes: ExploreAdnAxis[]; overall: number | null }) {
  const pill = overall != null ? ADN_TONE[adnTone(overall) as AdnTone].pill : ADN_EMPTY.pill;
  return (
    <div className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-2 py-1 shadow-sm dark:border-gray-700 dark:bg-gray-900">
      <span className="mr-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-400">ADN</span>
      {axes.map((a) => (
        <AdnAxisChip key={a.key} axis={a} />
      ))}
      <div className="group relative">
        <button
          type="button"
          aria-label={overall != null ? `Note ADN globale ${overall} sur 100` : 'Note ADN globale indisponible'}
          className={cn('ml-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold', pill)}
        >
          {overall != null ? overall : '—'}
        </button>
        <AdnAxisPopover overall={overall} />
      </div>
    </div>
  );
}

// Public badge: isolates the rollup hook so the giant page component stays clean
// and the hook is unconditional. Honest states: no project → nothing; loading →
// skeleton; unavailable/error → muted "ADN —"; data → the per-project strip.
function ExploreAdnBadge({ projectId }: { projectId: string | null }) {
  const { data, loading, error, unavailable } = useProjectRollup(projectId);

  // No project context → nothing to score (don't fabricate an account-level ADN).
  if (!projectId) return null;

  // Loading (incl. the first paint before the effect runs) → skeleton strip, so
  // we never flash the muted state before data arrives (no placeholder zeros).
  // `useProjectRollup` clears `data` at the start of every fetch, so this also
  // covers refetches without regressing to a stale strip.
  if ((loading || !data) && !unavailable && !error) {
    return (
      <div
        className="flex items-center gap-1 rounded-xl border border-gray-200 bg-white px-2 py-1 shadow-sm dark:border-gray-700 dark:bg-gray-900"
        aria-hidden="true"
      >
        <span className="mr-0.5 text-[9px] font-bold uppercase tracking-wider text-gray-400">ADN</span>
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className="h-4 w-5 animate-pulse rounded bg-slate-200 dark:bg-slate-700" />
        ))}
      </div>
    );
  }

  // Unavailable (404/501) / genuine error → honest muted chip. The badge is
  // present but carries no per-project data — never a fabricated score.
  if (unavailable || error || !data) {
    return (
      <div
        title={
          unavailable
            ? 'ADN par-projet non provisionné sur ce backend.'
            : 'ADN par-projet momentanément indisponible.'
        }
        className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2 py-1 shadow-sm dark:border-slate-700 dark:bg-slate-900"
      >
        <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400">ADN</span>
        <span className="text-[11px] font-semibold text-slate-400">—</span>
      </div>
    );
  }

  const axes = deriveExploreAdn(data);
  // Overall = mean over the axes that have a REAL score; zero real axes → "—"
  // (guards against adnOverall([]) === 0, which would be a fake 0).
  const real = axes.map((a) => a.score).filter((s): s is number => s != null);
  const overall = real.length ? Math.round(real.reduce((s, v) => s + v, 0) / real.length) : null;
  return <AdnStrip axes={axes} overall={overall} />;
}

// Main Page Component
export default function ExploreDesignPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { username: currentUsername } = useAuth();
  const { data: sessionData } = useSession();
  const sessionRole = (sessionData?.user as any)?.role as string | undefined;

  // Event tracking (R11/H10) — invoking the hook auto-queues a fire-and-forget
  // PAGE_VIEW on mount (module resolves to `explore_design`). Helpers below
  // instrument key actions: tab switch, model/relationship create, deploy.
  const { trackTabSwitch, trackFeatureClick } = useTrackEvent();

  // Connection status from SSE provider
  const { isConnected, error: connectionError } = useCacheInvalidationContext();

  // SSE cache invalidation: increment key to trigger cascading data reloads
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  const [sseRefreshKey, setSseRefreshKey] = useState(0);
  useEffect(() => {
    if (!lastInvalidation) return;
    const relevantKeys = [CACHE_KEYS.PROJECTS, CACHE_KEYS.TABLES, CACHE_KEYS.DATABASES, CACHE_KEYS.SCHEMAS, CACHE_KEYS.DEPLOYMENTS, CACHE_KEYS.DYNAMIC_TABLES, CACHE_KEYS.STREAMS];
    const shouldRefresh = lastInvalidation.keys.some((k: string) => relevantKeys.includes(k as any));
    if (shouldRefresh) {
      setSseRefreshKey(prev => prev + 1);
    }
  }, [lastInvalidation]);

  // Project State — pre-fill from ?project_id= query param or last used project
  const urlProjectId = searchParams.get('project_id');
  // Account-overview AI advisor deep-link: ?intent=model&from=scan. When set we
  // render a ready, pre-filled AI suggestion (ScanPrefillBanner) instead of
  // leaving the user on empty selectors.
  const scanDeepLink =
    searchParams.get('intent') === 'model' && searchParams.get('from') === 'scan';
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [selectedProjectName, setSelectedProjectName] = useState<string>('');
  // Slide-1 redesign: inline wizard replaces the legacy project-creation popup.
  const [showProjectWizard, setShowProjectWizard] = useState(false);

  // Inline project gate: fetch the explore-design project list so the
  // empty-state can show a real picker (no modal hand-off). Shares the
  // CACHE_KEYS.PROJECTS invalidation key with the header ProjectSelector so
  // an SSE invalidation refreshes both in sync.
  const {
    data: gateProjectsData,
    loading: gateProjectsLoading,
    error: gateProjectsErrorObj,
    refetch: refetchGateProjects,
  } = useCacheAwareQuery(
    () => listProjects({ project_type: 'explore_design', mine_only: false }),
    { cacheKeys: [CACHE_KEYS.PROJECTS], initialData: null },
  );
  const gateProjects = useMemo(
    () =>
      (gateProjectsData?.projects ?? []).map((p) => ({
        id: p.project_id,
        name: p.project_name,
        created_by: p.created_by,
        created_at: p.created_at,
        tags: p.tags ?? null,
      })),
    [gateProjectsData],
  );
  const gateProjectsError = gateProjectsErrorObj
    ? getApiErrorMessage(gateProjectsErrorObj) || 'Failed to load projects'
    : null;

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
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [searchResults, setSearchResults] = useState<GlobalSearchResult[]>([]);

  const [isLoadingDatabases, setIsLoadingDatabases] = useState(false);
  const [isLoadingSchemas, setIsLoadingSchemas] = useState(false);
  const [isLoadingTables, setIsLoadingTables] = useState(false);
  const [isLoadingColumns, setIsLoadingColumns] = useState(false);
  const [columnsLoadError, setColumnsLoadError] = useState<null | { kind: 'timeout' | 'generic'; message: string }>(null);
  const [columnsLoadAttempt, setColumnsLoadAttempt] = useState(0);
  const [isLoadingPolicies, setIsLoadingPolicies] = useState(false);

  // Masking policies from API
  const [maskingPolicies, setMaskingPolicies] = useState<MaskingPolicyDisplay[]>([]);

  // Backend-persisted column mappings (loaded via listMappings on project select)
  const [backendMappings, setBackendMappings] = useState<BackendColumnMapping[]>([]);

  // True only when the SSE stream was rejected with 401/403 — i.e. the user's
  // JWT is actually invalid. All other SSE failures (network, 5xx, CORS) are
  // soft-degraded by useCacheInvalidation so the banner doesn't fire on them.
  const isOffline = connectionError === 'session_expired';

  const [showBulkPKModal, setShowBulkPKModal] = useState(false);
  const [showBulkMaskingModal, setShowBulkMaskingModal] = useState(false);
  const [showRelationsModal, setShowRelationsModal] = useState(false);
  const [showDeploymentModal, setShowDeploymentModal] = useState(false);
  const [showAiGuidedWizard, setShowAiGuidedWizard] = useState(false);
  // Plain-English description seeded into the AI model wizard when the user
  // picked the AI fork in the UnifiedProjectWizard / "Change approach".
  const [aiModelSeed, setAiModelSeed] = useState<string>('');
  // Source tables pre-selected in the AI wizard's Connect step — populated when
  // the user accepts an AI suggestion from the Account-overview scan deep-link
  // (?intent=model&from=scan). Reset on wizard close/approve so the manual AI
  // path (which opens the same wizard) never inherits stale scan selections.
  const [scanSeedTables, setScanSeedTables] = useState<TableRef[]>([]);
  // The advisor deep-link arrives WITHOUT a project (it's just
  // /explore-design?intent=model&from=scan). When the user accepts a suggestion
  // before picking a project, we stash this flag and auto-open the seeded
  // wizard the moment a project becomes selected — so the suggestion survives
  // the "pick a project" step and stays one fluid action.
  const [pendingScanApply, setPendingScanApply] = useState(false);
  // "Change approach" affordance — re-opens the fork for an existing project.
  const [showApproachFork, setShowApproachFork] = useState(false);
  const [showIngestionModal, setShowIngestionModal] = useState(false);
  const [showScaleTest, setShowScaleTest] = useState(false);
  const [showCreateTableModal, setShowCreateTableModal] = useState(false);
  const [showRelationshipModal, setShowRelationshipModal] = useState(false);
  const [showCreateMenuCatalog, setShowCreateMenuCatalog] = useState(false);
  const [showCreateMenuModeling, setShowCreateMenuModeling] = useState(false);

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
  // 404/501 from the classification endpoint — the CTA self-disables (honest
  // unavailable state, InsightActionButton pattern) instead of erroring loudly.
  const [classifyUnavailable, setClassifyUnavailable] = useState(false);

  // Data engineering object listing modal
  const [dataEngModal, setDataEngModal] = useState<{
    isOpen: boolean;
    type: 'dynamic_tables' | 'streams' | 'alerts';
    schema: string;
    items: any[];
    loading: boolean;
  }>({ isOpen: false, type: 'dynamic_tables', schema: '', items: [], loading: false });

  // Inline confirmation for destructive drop actions (replaces browser confirm())
  const [confirmDrop, setConfirmDrop] = useState<{
    type: 'dynamic_table' | 'stream' | 'alert' | 'schema';
    name: string;
  } | null>(null);

  // System 2 Action-RBAC: dropping data-engineering objects maps to
  // explore_design:delete. Fail-open while the allow-set loads (no flash).
  const dropObjPerm = useCanPerform('explore_design', 'delete');
  const canDropObjects = dropObjPerm.allowed || dropObjPerm.loading;
  const dropDeniedReason =
    'You lack the "delete" permission on Explore & Design. Ask an administrator to grant it.';

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('catalog');
  // Persist viewMode to localStorage
  useEffect(() => {
    localStorage.setItem('explore-design-view-mode', viewMode);
  }, [viewMode]);

  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false);
  const [showEventTemplatePicker, setShowEventTemplatePicker] = useState(false);
  const [modelingChoice, setModelingChoice] = useState<ModelingChoice | null>(null);
  // Persist modeling choice per project so re-selecting a project doesn't re-show the modal
  const modelingChoicesByProject = useRef<Map<string, { choice: ModelingChoice; database?: string; schema?: string }>>(new Map());
  // DWH template deployment target (chosen by user in location picker)
  const [dwhTargetDatabase, setDwhTargetDatabase] = useState<string | null>(null);
  const [dwhTargetSchema, setDwhTargetSchema] = useState<string | null>(null);
  const [showLocationPicker, setShowLocationPicker] = useState(false);
  // Right panels default to CLOSED: with the redesign they slide in as
  // overlays instead of fixed sidebars, so leaving them open by default
  // would block the canvas every time the user lands on the page.
  const [showEventPanel, setShowEventPanel] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showHistoryRail, setShowHistoryRail] = useState(false);
  const [selectedColumns, setSelectedColumns] = useState<Set<string>>(new Set());
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [savedPanelState, setSavedPanelState] = useState({ sidebar: true, event: true });

  // Create table type selector
  const [createTableType, setCreateTableType] = useState<SnowflakeTableType>('standard');

  // Catalog policy & ingestion panels
  const [showCatalogPolicyPanel, setShowCatalogPolicyPanel] = useState(false);
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

  const [rightBarOpen, setRightBarOpen] = useState(false);
  const [activeRightTab, setActiveRightTab] = useState<RightBarTab>('actions');
  const [focusedAction, setFocusedAction] = useState<FocusedAction>(null);
  const [classificationDetails, setClassificationDetails] = useState<Array<{ column: string; category: string; tags?: string[]; confidence?: number; description?: string; piiRisk?: string; suggestion?: string }>>([]);
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
    let cancelled = false;

    // ── ADD: new DDL-relevant events → persist to backend ──
    const newDDLEvents = events.filter(
      (e) =>
        DDL_EVENT_TYPES.includes(e.type) &&
        e.status === 'pending' &&
        !ddlEventMapRef.current.has(e.id) &&
        !prevEventIdsRef.current.has(e.id) &&
        !e.synced
    );

    // ─�� REMOVE: events that disappeared (undo/delete) → remove from backend ──
    const removedIds = Array.from(prevEventIdsRef.current).filter(
      (id) => !currentEventIds.has(id) && ddlEventMapRef.current.has(id)
    );

    const syncDDL = async () => {
      // Add new DDL events
      const addPromises = newDDLEvents.map(async (event) => {
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
          if (cancelled) return;
          if (result?.event_id) {
            ddlEventMapRef.current.set(event.id, result.event_id);
          }
          console.debug(`[DDL Sync] Added ${event.type} → ${tableRef}`);
        } catch (err) {
          if (cancelled) return;
          console.warn(`[DDL Sync] Failed to add ${event.type}:`, err);
          ddlEventMapRef.current.delete(event.id);
        }
      });

      // Remove deleted DDL events
      const removePromises = removedIds.map(async (localId) => {
        const backendId = ddlEventMapRef.current.get(localId);
        ddlEventMapRef.current.delete(localId);
        if (!backendId) return;

        try {
          await removeDDLAction(selectedProjectId, backendId);
          if (!cancelled) console.debug(`[DDL Sync] Removed DDL ${backendId} (event ${localId})`);
        } catch (err) {
          if (!cancelled) console.warn(`[DDL Sync] Failed to remove DDL ${backendId}:`, err);
        }
      });

      await Promise.allSettled([...addPromises, ...removePromises]);
    };

    if (newDDLEvents.length > 0 || removedIds.length > 0) {
      syncDDL();
    }

    // Update previous snapshot
    prevEventIdsRef.current = currentEventIds;

    return () => { cancelled = true; };
  }, [events, selectedProjectId]);

  // Read-only guard: returns true (blocked) if user is a viewer
  const readOnlyGuard = useCallback(() => {
    if (isReadOnly) {
      toast.error('You have view-only access to this project');
      return true;
    }
    return false;
  }, [isReadOnly]);

  // ── Scan deep-link: accept an AI-suggested data product ───────────────────
  // Seeds the AI-guided wizard with the suggestion's description + source
  // tables. If a project is already selected we open the wizard immediately;
  // otherwise we flag the intent and the effect below auto-opens it the moment
  // the user selects/creates a project (the deep-link carries no project_id).
  const handleScanSuggestionApply = useCallback((suggestion: ScanSuggestion) => {
    if (readOnlyGuard()) return;
    setAiModelSeed(suggestion.seed);
    setScanSeedTables(suggestion.sources);
    if (selectedProjectId) {
      setShowAiGuidedWizard(true);
    } else {
      setPendingScanApply(true);
      setShowProjectWizard(true);
      toast('Pick or create a project — your AI suggestion is ready and will open automatically.');
    }
  }, [readOnlyGuard, selectedProjectId]);

  // Auto-open the seeded wizard once a project becomes available after the user
  // accepted a scan suggestion without one selected.
  useEffect(() => {
    if (pendingScanApply && selectedProjectId) {
      setPendingScanApply(false);
      setShowAiGuidedWizard(true);
    }
  }, [pendingScanApply, selectedProjectId]);

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

  // Memoized derived values from selectedSchemas Map (avoids Array.from in render paths)
  const schemaKeys = useMemo(() => Array.from(selectedSchemas.keys()), [selectedSchemas]);
  const schemaEntries = useMemo(() => Array.from(selectedSchemas.entries()), [selectedSchemas]);
  const firstSchemaName = useMemo(() => schemaKeys[0] || '', [schemaKeys]);

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

  // Load databases only after a project is selected (also re-triggers on SSE invalidation)
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
        if (Array.isArray(dbList) && dbList.length > 0) {
          const firstDb = dbList[0];
          setSelectedDatabase(prev => prev || firstDb);
          // Auto-load schemas for ALL databases in parallel, skip system schemas
          const allSchemasMap = new Map<string, string>();
          const allSchemaNames: string[] = [];
          await Promise.allSettled(dbList.map(async (db: string) => {
            try {
              const schemaList = await getSchemas(db);
              if (schemaList) schemaList.forEach((s: string) => {
                allSchemasMap.set(s, db);
                allSchemaNames.push(s);
              });
            } catch { /* skip inaccessible db */ }
          }));
          setSchemas(allSchemaNames);
          setSelectedSchemas(allSchemasMap);
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
  }, [selectedProjectId, isOffline, router, sseRefreshKey]);

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
  // Loading/error UI for the default DWH (target) model load in Modeling view
  const [isLoadingModelingTables, setIsLoadingModelingTables] = useState(false);

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

  // Load schemas when database changes (skip — all-DB load handles this now)
  useEffect(() => {
    if (!selectedDatabase) {
      return; // schemas loaded by all-DB effect
    }
    // Skip single-DB schema load — all-DB effect handles this
    return;

    const loadSchemas = async () => {
      setIsLoadingSchemas(true);
      try {
        const schemaList = await getSchemas(selectedDatabase);
        setSchemas(schemaList || []);
        if (schemaList && schemaList.length > 0) {
          const allMap = new Map<string, string>();
          schemaList.forEach((s: string) => allMap.set(s, selectedDatabase));
          setSelectedSchemas(allMap);
        }
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
        // Expand using DB.SCHEMA keys to match VirtualizedTableList grouping
        const expandKeys = new Set<string>();
        for (const [schemaName, dbName] of Array.from(selectedSchemas.entries())) {
          expandKeys.add(`${dbName}.${schemaName}`);
        }
        setExpandedSchemas(expandKeys);

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
        ...categorizeColumns(cachedColumns),
      });
      return;
    }

    const loadColumns = async () => {
      setIsLoadingColumns(true);
      setColumnsLoadError(null);
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
            ...categorizeColumns(formattedColumns),
          });
        }
      } catch (error) {
        // Don't show error for template/DWH tables that don't exist in Snowflake yet
        if (!targetTableIds.has(selectedTable.id)) {
          if (error instanceof TableColumnsTimeoutError) {
            setColumnsLoadError({ kind: 'timeout', message: error.message });
            toast.error('Snowflake query timed out');
          } else {
            const msg = (error as { message?: string })?.message || 'Failed to load columns';
            setColumnsLoadError({ kind: 'generic', message: msg });
            toast.error('Failed to load columns');
          }
        }
      } finally {
        setIsLoadingColumns(false);
      }
    };
    loadColumns();
  }, [selectedTable, allTableConfigs, targetTableIds, columnsLoadAttempt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset inline panels when selected table changes
  useEffect(() => {
    setShowInlinePreview(false);
    setShowInlineProfile(false);
    setInlinePreviewData(null);
    setInlineProfileData(null);
  }, [selectedTable?.id]);

  // Auto-load preview when table is selected (no toggle needed)
  const [inlinePreviewError, setInlinePreviewError] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedTable || !selectedProjectId) return;
    setShowInlinePreview(true);
    setShowInlineProfile(true);
    setRightBarOpen(true);
    setActiveRightTab('actions');
  }, [selectedTable?.id, selectedProjectId]);
  useEffect(() => {
    if (!showInlinePreview || !selectedTable || !selectedProjectId) return;
    let cancelled = false;
    const load = async () => {
      setIsLoadingInlinePreview(true);
      setInlinePreviewError(null);
      try {
        const data = await tablePreview(selectedProjectId, selectedTable.database, selectedTable.schema, selectedTable.table, { limit: 5 });
        if (!cancelled) {
          setInlinePreviewData({ columns: data.columns, rows: data.rows as Record<string, any>[], total_rows: data.row_count });
        }
      } catch (err) {
        console.error('[E&D] Inline preview failed:', err);
        if (!cancelled) {
          setInlinePreviewData(null);
          const msg = (err as { message?: string })?.message || 'Preview failed';
          setInlinePreviewError(msg);
        }
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
    if (!deferredSearchQuery.trim()) {
      setSearchResults([]);
      return;
    }

    const query = deferredSearchQuery.toLowerCase();
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
  }, [deferredSearchQuery, tables, tableColumns, selectedTable, maskingPolicies]);

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
    // Auto-collapse the Source Tables rail on select so the detail + actions
    // get the full width; the "Show Sources" toggle reopens it.
    setShowSidebar(false);
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

      // Kick off the events fetch in parallel with the contributors fetch —
      // they're independent, so awaiting them sequentially wasted ~500ms per
      // project switch. We fire listProjectEvents now and await its result
      // later, where the events are actually consumed.
      const projectEventsPromise = listProjectEvents(projectId, {});
      // Swallow the rejection here so it isn't flagged as unhandled during the
      // listContributors await window — the real error handling happens in the
      // try/catch below where the promise is actually awaited.
      projectEventsPromise.catch(() => {});

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
        // Use projectsApi.listEvents (same endpoint as addProjectEvent) to ensure we read from where we write.
        // The request was started above, in parallel with listContributors.
        const eventsResponse = await projectEventsPromise;

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
              const restoredTableIds = new Set(restoredTables.map(t => t.id));
              colResults.forEach(result => {
                if (result) {
                  restoredColumnsMap.set(result.tableId, result.columns);
                  // Also add as a table entry if not already present (O(1) Set lookup)
                  if (!restoredTableIds.has(result.tableId)) {
                    restoredTableIds.add(result.tableId);
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
            } else if (modelingTables.size > 0 || backendEvents.some((e: any) => e.type === 'TABLE_CREATED' || e.type === 'SCHEMA_CREATED' || e.type === 'ADD_COLUMN')) {
              // Project already has modeling work but no explicit MODELING_TEMPLATE_CHOSEN event
              // Infer "from_scratch" so the template modal doesn't pop up again
              const inferredChoice: ModelingChoice = 'scratch';
              modelingChoicesByProject.current.set(projectId, { choice: inferredChoice });
              setModelingChoice(inferredChoice);
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

  // UnifiedProjectWizard handoff — branches on the explicit build mode.
  //   manual   → select the project, blank modeling canvas (Start from Scratch).
  //   ai       → select the project, open the AI model wizard seeded.
  //   template → select the project, apply the DWH template.
  const handleProjectCreated = useCallback(
    async (result: UnifiedProjectWizardResult) => {
      // The create-new fork governs its own build mode — cancel any pending
      // scan auto-resume so the effect below can't force-open the AI wizard
      // over an explicit Template/Manual choice. (No-op when not from a scan.)
      setPendingScanApply(false);

      // Pre-seed the per-project modeling cache from the recorded build mode
      // so ModelingTemplateModal won't re-prompt a project created with a
      // deliberate choice.
      const choice: ModelingChoice =
        result.buildMode === 'template' ? 'dwh_template' : 'scratch';
      modelingChoicesByProject.current.set(result.projectId, { choice });

      await handleProjectSelect(result.projectId, result.projectName);

      if (result.buildMode === 'ai') {
        setAiModelSeed(result.aiDescription ?? '');
        // Keep any scan-suggested source tables — they pre-select the AI
        // wizard's Connect step for an AI-mode create that came from a scan.
        setShowAiGuidedWizard(true);
      } else if (result.buildMode === 'template') {
        // Non-AI choice — drop any scan seed so it can't bleed into a later
        // manual AI-wizard open. Apply the DWH template path.
        setAiModelSeed('');
        setScanSeedTables([]);
        setShowLocationPicker(true);
      } else {
        // manual → blank modeling canvas. Drop any scan seed (see above).
        setAiModelSeed('');
        setScanSeedTables([]);
        setModelingChoice('scratch');
        setViewMode('modeling');
      }
    },
    [handleProjectSelect],
  );

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

  // Bulk: detect & set primary keys across the selected tables by matching a
  // column-name pattern. Fires real PRIMARY_KEY_SET events per table (same
  // event-store queue the single-table flow uses) — no fake toast.
  const handleBulkSetPrimaryKey = useCallback((rule: '*_ID' | 'ID_*' | '*_PK') => {
    const matches = (name: string) => {
      const upper = name.toUpperCase();
      if (rule === '*_ID') return upper.endsWith('_ID');
      if (rule === 'ID_*') return upper.startsWith('ID_');
      return upper.endsWith('_PK');
    };

    let tablesAffected = 0;
    selectedTables.forEach(tableId => {
      const table = tables.find(t => t.id === tableId);
      if (!table) return;
      const cols = (tableColumnsMap.get(tableId) || []).filter(c => matches(c.name)).map(c => c.name);
      if (cols.length === 0) return;
      addEvent({
        ...createPrimaryKeyEvent({ database: table.database, schema: table.schema, table: table.table }, cols, true),
        projectId: selectedProjectId ?? undefined,
      });
      tablesAffected += 1;
    });

    if (tablesAffected === 0) {
      toast.error(`No columns matched "${rule}" in the selected tables`);
      return;
    }
    toast.success(`Queued primary keys for ${tablesAffected} table(s) using "${rule}"`);
    setSelectedTables(new Set());
  }, [selectedTables, tables, tableColumnsMap, selectedProjectId, addEvent]);

  // Bulk: apply a masking policy to the currently selected columns across the
  // selected tables. Fires real MASKING_POLICY_APPLIED events per table.
  const handleBulkApplyMasking = useCallback((policyName: string) => {
    const cols = Array.from(selectedColumns);
    if (cols.length === 0) {
      toast.error('Select one or more columns before applying a masking policy');
      return;
    }

    let tablesAffected = 0;
    selectedTables.forEach(tableId => {
      const table = tables.find(t => t.id === tableId);
      if (!table) return;
      const tableCols = new Set((tableColumnsMap.get(tableId) || []).map(c => c.name));
      const applicable = cols.filter(c => tableCols.has(c));
      if (applicable.length === 0) return;
      addEvent({
        ...createMaskingPolicyEvent({ database: table.database, schema: table.schema, table: table.table }, policyName, applicable, true),
        projectId: selectedProjectId ?? undefined,
      });
      tablesAffected += 1;
    });

    if (tablesAffected === 0) {
      toast.error('None of the selected columns exist in the selected tables');
      return;
    }
    toast.success(`Queued masking policy "${policyName}" for ${tablesAffected} table(s)`);
    setSelectedTables(new Set());
  }, [selectedTables, selectedColumns, tables, tableColumnsMap, selectedProjectId, addEvent]);

  const handleSearchResultClick = useCallback((result: GlobalSearchResult) => {
    if (result.type === 'table' && result.database && result.schema) {
      const table = tables.find(t => t.table === result.name && t.schema === result.schema);
      if (table) {
        setSelectedTable(table);
      }
    }
    setSearchQuery('');
  }, [tables]);

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
      const details = Array.isArray(classArray) ? classArray.map((c: any) => ({
        column: c.column || '',
        category: c.category || 'UNKNOWN',
        tags: c.tags || c.semantic_tags || [c.category?.toLowerCase()].filter(Boolean),
        confidence: c.confidence ?? c.score ?? 0.85,
        description: c.description || c.explanation || `Detected as ${(c.category || 'unknown').toLowerCase().replace(/_/g, ' ')}`,
        piiRisk: c.pii_risk || c.pii_type || (c.category === 'PII_CANDIDATE' ? 'high' : undefined),
        suggestion: c.suggestion || c.recommended_action || null,
      })) : [];
      setClassificationDetails(details);
      setActiveRightTab('ai');
      if (!rightBarOpen) setRightBarOpen(true);
      toast.success(`AI classified ${Object.keys(classRecord).length} columns`);
    } catch (err: any) {
      // 404/501 = endpoint not deployed on this backend — self-disable the CTA
      // quietly (no loud error); it re-arms on the next project/table switch.
      const status = err?.response?.status ?? err?.status;
      if (status === 404 || status === 501) {
        setClassifyUnavailable(true);
      } else {
        const errMsg = err?.response?.data?.message || err?.response?.data?.detail || 'AI classification failed';
        toast.error(typeof errMsg === 'string' ? errMsg : 'AI classification failed');
      }
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
      // Backend returns the list under a type-named key ({dynamic_tables|streams|alerts: [...]}).
      // Keep the legacy .data/.items/array fallbacks so any other shape still resolves.
      const items =
        result?.dynamic_tables ||
        result?.streams ||
        result?.alerts ||
        result?.data ||
        result?.items ||
        (Array.isArray(result) ? result : []);
      setDataEngModal(prev => ({ ...prev, items, loading: false }));
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || `Failed to list ${type.replace('_', ' ')}`);
      setDataEngModal(prev => ({ ...prev, loading: false }));
    }
  }, [selectedDatabase]);

  // Data engineering action handlers
  const handleDataEngAction = useCallback(async (objectName: string, action: string) => {
    if (!selectedDatabase || !dataEngModal.schema) return;
    // For drop actions, show inline confirmation instead of browser confirm()
    if (action === 'drop') {
      const typeMap: Record<string, 'dynamic_table' | 'stream' | 'alert'> = {
        dynamic_tables: 'dynamic_table',
        streams: 'stream',
        alerts: 'alert',
      };
      setConfirmDrop({ type: typeMap[dataEngModal.type], name: objectName });
      return;
    }
    const db = selectedDatabase;
    const schema = dataEngModal.schema;
    const toastId = toast.loading(`${action} ${objectName}...`);
    try {
      if (dataEngModal.type === 'dynamic_tables') {
        if (action === 'suspend') await suspendDynamicTable(objectName, db, schema);
        else if (action === 'resume') await resumeDynamicTable(objectName, db, schema);
        else if (action === 'refresh') await refreshDynamicTable(objectName, db, schema);
      } else if (dataEngModal.type === 'streams') {
        if (action === 'view_data') {
          const data = await getStreamData(objectName, db, schema);
          toast.dismiss(toastId);
          toast.success(`Stream has ${data?.rows?.length || 0} change records`);
          return;
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

  // Execute a confirmed drop action (called from the inline confirmation bar)
  const executeConfirmedDrop = useCallback(async () => {
    if (!confirmDrop) return;
    const { type, name } = confirmDrop;
    setConfirmDrop(null);

    if (type === 'schema') {
      // No schema-drop endpoint exists on this backend — be honest, don't imply
      // the operation was queued. Users drop individual objects (tables, dynamic
      // tables, streams, alerts) instead.
      toast.error(`Dropping a whole schema isn't available here. Drop individual objects instead.`);
      return;
    }

    if (!selectedDatabase || !dataEngModal.schema) return;
    const db = selectedDatabase;
    const schema = dataEngModal.schema;
    const toastId = toast.loading(`Dropping ${type.replace('_', ' ')} "${name}"...`);
    try {
      if (type === 'dynamic_table') await dropDynamicTable(name, db, schema);
      else if (type === 'stream') await dropStream(name, db, schema);
      else if (type === 'alert') await dropAlert(name, db, schema);
      toast.dismiss(toastId);
      toast.success(`drop "${name}" completed`);
      handleListDataEngObjects(schema, dataEngModal.type);
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(err?.response?.data?.detail || `drop failed`);
    }
  }, [confirmDrop, selectedDatabase, dataEngModal.schema, dataEngModal.type, handleListDataEngObjects]);

  // Schema action handler.
  // Per-schema "apply to all" governance/ownership/ingestion has no bulk
  // endpoint on the backend — those operations apply per table (with a chosen
  // policy + column), which is exactly what the right-rail Policies / Ingestion
  // Config panels do. Rather than fake a one-click bulk apply, we route the user
  // to the working per-table flow. Only `clone_schema` maps to a real endpoint.
  const handleSchemaAction = useCallback(async (schema: string, action: string) => {
    if (readOnlyGuard()) return;
    const db = selectedDatabase;
    switch (action) {
      case 'transfer_ownership':
        // No schema-level ownership-transfer endpoint exists on this backend.
        toast.error('Schema ownership transfer is not available on this backend yet.');
        break;
      case 'apply_masking_all':
        // No bulk endpoint — masking applies per table+column with a chosen
        // policy. Point the user at the real per-table flow.
        toast('Select a table, then apply masking from the Policies panel (per table + column).');
        break;
      case 'apply_rls_all':
        toast('Select a table, then add row access from the Policies panel (per table).');
        break;
      case 'set_ingestion_all':
        toast('Select a table, then configure ingestion from the Ingestion Config panel.');
        break;
      case 'clone_schema': {
        if (!db) {
          toast.error('Select a database first');
          break;
        }
        const cloneToast = toast.loading(`Cloning schema ${schema}...`);
        try {
          const res = await createSchemaClone({
            source_database: db,
            source_schema: schema,
            target_database: db,
            target_schema: schema,
            naming_strategy: 'version_suffix',
            include_data: true,
            include_constraints: true,
            include_policies: true,
            include_grants: true,
          });
          toast.dismiss(cloneToast);
          toast.success(`Schema ${schema} cloned (${res.tables_cloned}/${res.tables_total} tables)`);
        } catch (err: any) {
          toast.dismiss(cloneToast);
          if (isUnavailable(err)) {
            toast.error('Schema clone is not available on this backend yet.');
          } else {
            toast.error(getApiErrorMessage(err) || 'Schema clone failed');
          }
        }
        break;
      }
      case 'export_ddl':
        // No schema-level DDL export endpoint on this backend.
        toast.error('Schema DDL export is not available yet.');
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
        setConfirmDrop({ type: 'schema', name: schema });
        break;
      default:
        toast.error(`Unknown action: ${action}`);
    }
  }, [handleListDataEngObjects, selectedDatabase]);

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
                Session expired
              </p>
              <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                Your authentication token is no longer valid. Sign in again to
                resume saving changes.
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

      {/* Inline confirmation bar for schema drops */}
      {confirmDrop?.type === 'schema' && (
        <div className="flex items-center gap-3 border-b border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-900/20">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
          <p className="flex-1 text-sm text-red-800 dark:text-red-200">
            Drop schema <span className="font-semibold">{confirmDrop.name}</span>? This action cannot be undone.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmDrop(null)}
            className="text-xs"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={executeConfirmedDrop}
            className="text-xs bg-red-600 hover:bg-red-700 text-white border-red-600"
          >
            Confirm Drop
          </Button>
        </div>
      )}

      {/* ── Unified header ─────────────────────────────────────────────
          Previously 3 stacked rows (breadcrumb + title-toolbar + search-
          panels). Collapsed into ONE sticky row: Project | Tabs | Search
          | Deploy + overflow ⋮. The breadcrumb is rebuilt as a tiny strip
          inside the row, secondary actions live in the overflow menu, and
          panel-toggle buttons moved to the canvas edge. */}
      {!isFullscreen && (
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 lg:px-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* LEFT: project context + view-mode tabs */}
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            <h1 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-white">
              Explore &amp; Design
              <Badge className="bg-blue-100 px-1.5 py-0 text-[10px] text-blue-600">NEW</Badge>
            </h1>
            <span className="hidden h-5 w-px bg-slate-200 dark:bg-slate-700 sm:inline-block" />
            <ProjectSelector
              selectedProjectId={selectedProjectId}
              onProjectSelect={handleProjectSelect}
              autoSelectProjectId={autoProjectId}
              onCreateRequested={() => setShowProjectWizard(true)}
            />
            {selectedProjectId && (
              <button
                type="button"
                onClick={() => setShowApproachFork(true)}
                className="text-[10px] font-medium text-indigo-500 hover:text-indigo-700 hover:underline dark:text-indigo-400"
                title="Switch how this project is built"
              >
                Change approach
              </button>
            )}
            {isReadOnly && (
              <Badge className="flex items-center gap-1 bg-amber-100 px-2 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                <Eye className="h-3 w-3" />
                View Only
              </Badge>
            )}
            {/* View-mode tabs — feel native, not crammed */}
            <div className="ml-1 flex items-center rounded-md bg-slate-100 p-0.5 dark:bg-slate-800">
              <button
                className={cn(
                  'flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  viewMode === 'catalog'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
                )}
                onClick={() => { trackTabSwitch('catalog'); setViewMode('catalog'); }}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                Catalog
              </button>
              <button
                className={cn(
                  'flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium transition-colors',
                  viewMode === 'modeling'
                    ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
                )}
                onClick={() => {
                  if (!modelingChoice && readOnlyGuard()) return;
                  trackTabSwitch('modeling');
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
          </div>

          {/* RIGHT: ADN badge + search + deploy + overflow */}
          <div className="flex items-center gap-2">
            {/* R6 — per-project 5-axis ADN. Honest "—" per axis with no
                per-project source; muted "ADN —" when the rollup is unprovisioned
                (404/501) or errors; hidden until a project is selected. */}
            <ExploreAdnBadge projectId={selectedProjectId} />
            <GlobalSearch
              value={searchQuery}
              onChange={setSearchQuery}
              results={searchResults}
              onResultClick={handleSearchResultClick}
            />

            {/* AI-guided modeling — magic CTA that orchestrates connect →
                detect → sample → validate → approve → deploy. */}
            <AiGuidedModelButton
              onClick={() => {
                if (readOnlyGuard()) return;
                if (!selectedProjectId) {
                  toast.error('Please select a project first');
                  return;
                }
                // Manual entry always starts clean — never inherit a scan
                // suggestion's seed/sources left over from the deep-link path.
                setAiModelSeed('');
                setScanSeedTables([]);
                setShowAiGuidedWizard(true);
              }}
              disabled={!selectedProjectId || isReadOnly}
            />

            {/* Primary action: Deploy — only thing besides search that stays
                always-visible. Everything else lives in the overflow menu. */}
            <Button
              size="sm"
              className="gap-1 bg-gradient-to-r from-blue-600 to-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:from-blue-700 hover:to-indigo-700"
              onClick={async () => {
                if (readOnlyGuard()) return;
                if (!selectedProjectId) {
                  toast.error('Please select a project first');
                  return;
                }
                const eventIds = pendingEvents.map((e) => e.id);
                if (eventIds.length > 0) {
                  const hasConflicts = await checkForConflicts(eventIds);
                  if (hasConflicts) {
                    pendingConflictAction.current = { type: 'deploy', eventIds };
                    return;
                  }
                }
                setActiveRightTab('deploy');
                if (!rightBarOpen) setRightBarOpen(true);
              }}
              disabled={!selectedProjectId || isReadOnly}
            >
              <Rocket className="h-3.5 w-3.5" />
              Deploy
              {displayablePendingEvents.length > 0 && (
                <Badge className="bg-white/20 px-1 py-0 text-[10px] text-white">
                  {displayablePendingEvents.length}
                </Badge>
              )}
            </Button>

            {/* Overflow menu — Undo/Redo + Templates + DAG + Ingestion + AI +
                Refresh + Import + Export + Filters + panel toggles. Replaces
                ~10 visible buttons with one ⋮. Active toggles still glow so
                users see at-a-glance which panels are open. */}
            <OverflowMenu
              items={[
                {
                  label: 'Undo',
                  icon: Undo2,
                  onClick: () => undoEvent(),
                  disabled: !canUndo || isReadOnly,
                },
                {
                  label: 'Redo',
                  icon: Redo2,
                  onClick: () => redoEvent(),
                  disabled: !canRedo || isReadOnly,
                },
                {
                  label: 'Event Templates',
                  icon: BookTemplate,
                  onClick: () => setShowTemplateLibrary(true),
                },
                {
                  label: 'DAG Viewer',
                  icon: Workflow,
                  onClick: () => setShowDagViewer(!showDagViewer),
                  active: showDagViewer,
                  activeColor: 'violet',
                },
                {
                  label: 'Ingestion Runs',
                  icon: BarChart3,
                  onClick: () => setShowIngestionResults(!showIngestionResults),
                  active: showIngestionResults,
                  activeColor: 'teal',
                },
                {
                  label: 'AI Intelligence',
                  icon: Sparkles,
                  onClick: () => setShowAiPanel(!showAiPanel),
                  active: showAiPanel,
                  activeColor: 'purple',
                },
                {
                  label: 'Refresh data',
                  icon: RefreshCw,
                  disabled: !selectedDatabase || isLoadingSchemas || isLoadingTables,
                  onClick: async () => {
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
                  },
                },
                {
                  label: 'Import',
                  icon: Upload,
                  onClick: () => {},
                  disabled: isReadOnly,
                },
                {
                  label: 'Export',
                  icon: Download,
                  onClick: () => {},
                },
                {
                  label: showSidebar ? 'Hide Sources' : 'Show Sources',
                  icon: PanelLeft,
                  onClick: () => setShowSidebar(!showSidebar),
                  active: showSidebar,
                  activeColor: 'blue',
                },
                {
                  label: 'History',
                  icon: PanelRight,
                  onClick: () => { setActiveRightTab('history'); if (!rightBarOpen) setRightBarOpen(true); },
                  active: activeRightTab === 'history' && rightBarOpen,
                  activeColor: 'blue',
                },
              ]}
            />
          </div>
        </div>
      </header>
      )}

      {/* AI-suggested-from-scan banner — only when the Account-overview advisor
          deep-linked here (?intent=model&from=scan). Reads the already-scanned
          objects and offers a ready, one-click AI-suggested data product so the
          user lands on a prefilled suggestion, not empty selectors. The manual
          AI button in the header stays fully intact. */}
      {!isFullscreen && scanDeepLink && (
        <ScanPrefillBanner
          hasProject={!!selectedProjectId}
          isReadOnly={isReadOnly}
          onApply={handleScanSuggestionApply}
        />
      )}

      {/* Wizard overlay — appears centred over the workspace ONLY when the
          user explicitly clicks "New project". Backdrop click cancels. The
          workspace stays mounted underneath so it's not destroyed each time
          the wizard opens. */}
      {!isFullscreen && (
        <UnifiedProjectWizard
          open={showProjectWizard}
          onOpenChange={(open) => {
            setShowProjectWizard(open);
            // Closing the create wizard cancels a pending scan auto-resume so a
            // later, unrelated project pick can't surprise-open the AI wizard.
            // (On a real create, handleProjectCreated already cleared it and
            // drives the build-mode handoff directly.)
            if (!open) setPendingScanApply(false);
          }}
          module="explore-design"
          onCreated={(result) => {
            void handleProjectCreated(result);
          }}
        />
      )}

      {/* "Change approach" — re-opens the manual/AI/template fork for an
          existing project so the build choice is reversible. */}
      {showApproachFork && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Change approach"
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
        >
          <button
            type="button"
            aria-label="Close"
            onClick={() => setShowApproachFork(false)}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-2xl rounded-xl border border-slate-200 bg-white p-5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              Change how you build this data model
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Switch to AI to scaffold from a description, apply the DWH
              template, or keep modeling manually.
            </p>
            <div className="mt-4">
              <ManualAiTemplateFork
                value={null}
                ariaLabel="Change how you build this data model"
                descriptions={{
                  manual: 'Continue modeling on the canvas. Full control.',
                  ai: 'Describe your data model, AI scaffolds the schema.',
                  template: 'Apply the proven DWH starter scaffold.',
                }}
                onChange={(mode: BuildMode) => {
                  setShowApproachFork(false);
                  if (mode === 'ai') {
                    setAiModelSeed('');
                    setScanSeedTables([]);
                    setShowAiGuidedWizard(true);
                  } else if (mode === 'template') {
                    setShowLocationPicker(true);
                  } else {
                    setModelingChoice('scratch');
                    setViewMode('modeling');
                  }
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Unified Project Context (Deployment / History / Grants / Errors / Recos).
          Hidden entirely when no project is selected so the workspace empty
          state below gets the full vertical space. */}
      {/* ProjectContextPanel removed — all tabs now in ContextRightBar */}
      {false && !isFullscreen && selectedProjectId && (
        <ProjectContextPanel
          projectId={selectedProjectId}
          projectName={selectedProjectName}
          variant="explore-design"
          defaultExpanded={false}
          hideWhenEmpty={false}
          deploymentSlot={selectedProjectId ? (
            <div className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Pending events: <span className="font-semibold text-slate-900 dark:text-white">{displayablePendingEvents.length}</span>
                </p>
                {displayablePendingEvents.length > 0 && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    Ready to deploy
                  </span>
                )}
              </div>
              <button
                onClick={async () => {
                  if (readOnlyGuard()) return;
                  const eventIds = pendingEvents.map((e) => e.id);
                  if (eventIds.length > 0) {
                    const hasConflicts = await checkForConflicts(eventIds);
                    if (hasConflicts) {
                      pendingConflictAction.current = { type: 'deploy', eventIds };
                      return;
                    }
                  }
                  setActiveRightTab('deploy');
                  if (!rightBarOpen) setRightBarOpen(true);
                }}
                disabled={isReadOnly}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 transition-colors disabled:opacity-50"
              >
                <Rocket className="h-3.5 w-3.5" />
                Open Deployment Pipeline
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
            <AccessManagementSlot projectId={selectedProjectId!} />
          ) : undefined}
          errorsSlot={<RecentDeploymentErrorsSlot />}
        />
      )}

      {/* Compact Source Selector — hidden, auto-load replaces it */}
      {false && !isFullscreen && selectedProjectId && (
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
        {/* Empty state: NO project selected. Renders the shared inline
            ProjectGatePanel — a real in-page picker, no modal hand-off — so
            this matches the Workflow module's gate exactly. The header
            ProjectSelector dropdown stays for mid-session switching. */}
        {!selectedProjectId && !isFullscreen && (
          <ProjectGatePanel
            module="explore-design"
            projects={gateProjects}
            loading={gateProjectsLoading}
            error={gateProjectsError}
            onRetry={() => { void refetchGateProjects(); }}
            onSelect={(projectId, projectName) => {
              void handleProjectSelect(projectId, projectName);
            }}
            onCreateNew={() => setShowProjectWizard(true)}
          />
        )}

        {/* LEFT Panel - Tables List (collapsible) — workspace hidden until a
            project is selected so the empty state above can take full space. */}
        {selectedProjectId && showSidebar && viewMode === 'catalog' && (() => {
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

              {/* Add to Modeling — animated entrance, shimmer on hover */}
              {selectedTables.size > 0 && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 4 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Button
                    size="sm"
                    onClick={handleAddToModeling}
                    className="group relative w-full gap-2 overflow-hidden bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/30 hover:from-blue-700 hover:to-indigo-700 hover:shadow-lg hover:shadow-blue-500/40"
                  >
                    {/* Shimmer sweep */}
                    <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
                    <Plus className="h-3.5 w-3.5" />
                    Add {selectedTables.size} to Modeling
                    <ArrowRight className="ml-auto h-3 w-3 transition-transform group-hover:translate-x-0.5" />
                  </Button>
                </motion.div>
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

        {/* CENTER Panel - Catalog or Modeling View. Only rendered when a
            project is selected — otherwise the empty-state card above takes
            the full workspace area. */}
        {selectedProjectId && (
        <div className={cn(
          "flex-1 flex flex-col overflow-hidden min-w-0",
          viewMode === 'catalog' && "bg-slate-50 dark:bg-slate-900/50"
        )}>
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

              {/* Center + Right Bar row */}
              <div className="flex flex-1 overflow-hidden min-h-0">
              {/* Table Detail Panel - Now in CENTER */}
              <div className="flex-1 overflow-auto min-w-0">
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

                      {/* Compact KPI strip — profile stats inline */}
                      <div className="px-5 py-2.5 flex items-center gap-3 flex-wrap">
                        <span className="text-xs text-slate-500 flex items-center gap-1">
                          <Columns3 className="h-3.5 w-3.5" />
                          {tableColumns.length} cols
                        </span>
                        {inlineProfileData && (
                          <>
                            <span className="text-xs text-slate-500">{inlineProfileData.row_count.toLocaleString()} rows</span>
                            <span className={cn('text-xs font-medium', inlineProfileData.aggregate_quality_score >= 80 ? 'text-green-600' : inlineProfileData.aggregate_quality_score >= 60 ? 'text-amber-600' : 'text-red-600')}>
                              Quality {inlineProfileData.aggregate_quality_score}%
                            </span>
                          </>
                        )}
                        {tableColumns.some((c) => c.isPrimaryKey) && (
                          <span className="inline-flex items-center gap-0.5 text-xs text-amber-600"><Key className="h-3 w-3" />{tableColumns.filter((c) => c.isPrimaryKey).length} PK</span>
                        )}
                        {tableColumns.some((c) => c.isSensitive) && (
                          <span className="inline-flex items-center gap-0.5 text-xs text-red-500"><Shield className="h-3 w-3" />{tableColumns.filter((c) => c.isSensitive).length} PII</span>
                        )}
                        <span className="flex-1" />
                        {/* Quick actions → open right bar tabs */}
                        <button
                          onClick={() => { if (readOnlyGuard()) return; setActiveRightTab('actions'); setFocusedAction('add_column'); if (!rightBarOpen) setRightBarOpen(true); }}
                          disabled={isReadOnly}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-blue-600 dark:text-blue-400 rounded-md hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors"
                        >
                          <Plus className="h-3 w-3" /> Add Column
                        </button>
                        <button
                          onClick={() => { setActiveRightTab('actions'); setFocusedAction('policies'); if (!rightBarOpen) setRightBarOpen(true); }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-colors"
                        >
                          <Shield className="h-3 w-3" /> Policies
                        </button>
                        <button
                          onClick={() => { setActiveRightTab('actions'); setFocusedAction('ingestion'); if (!rightBarOpen) setRightBarOpen(true); }}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-cyan-600 dark:text-cyan-400 rounded-md hover:bg-cyan-50 dark:hover:bg-cyan-900/30 transition-colors"
                        >
                          <RefreshCw className="h-3 w-3" /> Ingestion
                        </button>
                        <button
                          onClick={() => { setActiveRightTab('ai'); if (!rightBarOpen) setRightBarOpen(true); handleAIClassify(); }}
                          disabled={isClassifying || !selectedProjectId || classifyUnavailable}
                          aria-busy={isClassifying}
                          title={classifyUnavailable ? 'Not available on this backend yet' : undefined}
                          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-purple-600 dark:text-purple-400 rounded-md hover:bg-purple-50 dark:hover:bg-purple-900/30 transition-colors disabled:opacity-50"
                        >
                          {isClassifying ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />} AI Classify
                        </button>
                      </div>
                    </div>

                    {/* Unified Data Preview — columns, types, badges and data in one table */}
                    {showInlinePreview && (
                      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border dark:border-slate-800 overflow-hidden">
                        <div className="bg-blue-50 dark:bg-blue-900/20 px-4 py-2.5 flex items-center justify-between border-b border-blue-100 dark:border-blue-800">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Eye className="h-4 w-4 text-blue-600" />
                            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Data Preview</span>
                            {inlinePreviewData && (
                              <Badge className="bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 text-[10px]">
                                {inlinePreviewData.total_rows.toLocaleString()} rows
                              </Badge>
                            )}
                            <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 text-[10px] gap-1">
                              <Lock className="h-2.5 w-2.5" />as {sessionRole || userRole || 'accountadmin'}
                            </Badge>
                            {tableColumns.some((c) => c.isSensitive) && (
                              <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] gap-1">
                                <Shield className="h-2.5 w-2.5" />{tableColumns.filter((c) => c.isSensitive).length} masked
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
                        <div className="overflow-x-auto">
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
                                  {inlinePreviewData.columns.map((col: string) => {
                                    const colMeta = tableColumns.find((c) => c.name === col || c.name === col.toUpperCase());
                                    return (
                                      <th key={col} className="px-2.5 py-1.5 text-left whitespace-nowrap">
                                        <div className="flex items-center gap-1">
                                          {colMeta?.isPrimaryKey && <Key className="h-3 w-3 text-amber-500 shrink-0" />}
                                          {colMeta?.isSensitive && <Shield className="h-3 w-3 text-red-400 shrink-0" />}
                                          <span className="font-medium text-slate-600 dark:text-slate-300">{col}</span>
                                        </div>
                                      </th>
                                    );
                                  })}
                                  <th className="px-1 py-1.5 w-8" />
                                </tr>
                                {/* Row 2 — type + constraint badges */}
                                <tr className="bg-slate-100/60 dark:bg-slate-800/80 border-b border-slate-200/80 dark:border-slate-700">
                                  <td className="px-2.5 py-0.5 text-[9px] text-slate-400">type</td>
                                  {inlinePreviewData.columns.map((col: string) => {
                                    const colMeta = tableColumns.find((c) => c.name === col || c.name === col.toUpperCase());
                                    return (
                                      <td key={col} className="px-2.5 py-0.5 whitespace-nowrap">
                                        <div className="flex items-center gap-1">
                                          {colMeta?.dataType && (
                                            <span className="px-1.5 py-0 rounded bg-slate-200/80 dark:bg-slate-700 text-[9px] font-mono text-slate-500 dark:text-slate-400">{colMeta.dataType}</span>
                                          )}
                                          {colMeta?.isPrimaryKey && <span className="px-1 py-0 rounded bg-amber-100 dark:bg-amber-900/30 text-[9px] font-semibold text-amber-700 dark:text-amber-400">PK</span>}
                                          {!colMeta?.isNullable && colMeta && <span className="px-1 py-0 rounded bg-blue-100 dark:bg-blue-900/30 text-[9px] font-semibold text-blue-600 dark:text-blue-400">NN</span>}
                                          {colMeta?.isSensitive && <span className="px-1 py-0 rounded bg-red-100 dark:bg-red-900/30 text-[9px] font-semibold text-red-600 dark:text-red-400">PII</span>}
                                          <ClassificationBadge tableId={selectedTable?.id || ''} columnName={col} classifications={columnClassifications} />
                                        </div>
                                      </td>
                                    );
                                  })}
                                  <td className="px-1 py-0.5" />
                                </tr>
                                {/* Row 3 — quality profile: nulls, distinct, quality score */}
                                {inlineProfileData && inlineProfileData.columns.length > 0 && (
                                  <tr className="bg-purple-50/40 dark:bg-purple-900/10 border-b border-slate-200/80 dark:border-slate-700">
                                    <td className="px-2.5 py-0.5 text-[9px] text-purple-400">quality</td>
                                    {inlinePreviewData.columns.map((col: string) => {
                                      const pc = inlineProfileData.columns.find((p: any) => (p.column_name || '').toUpperCase() === col.toUpperCase());
                                      if (!pc) return <td key={col} className="px-2.5 py-0.5 text-[9px] text-slate-300">—</td>;
                                      const nullPct = inlineProfileData.row_count > 0 ? ((pc.null_count ?? 0) / inlineProfileData.row_count * 100) : 0;
                                      const qScore = pc.quality_score ?? 100;
                                      return (
                                        <td key={col} className="px-2.5 py-0.5 whitespace-nowrap">
                                          <div className="flex items-center gap-1.5">
                                            {nullPct > 0 ? (
                                              <span className={cn("text-[9px] font-medium", nullPct > 50 ? "text-red-500" : nullPct > 10 ? "text-amber-500" : "text-slate-500")}>{nullPct.toFixed(0)}% null</span>
                                            ) : (
                                              <span className="text-[9px] text-green-500">0% null</span>
                                            )}
                                            <span className="text-[9px] text-slate-400">{fmtNum(pc.distinct_count)} uniq</span>
                                            <span className="flex items-center gap-0.5">
                                              <span className="w-6 h-1 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden inline-block">
                                                <span className={cn("block h-full rounded-full", qScore >= 80 ? "bg-green-500" : qScore >= 60 ? "bg-yellow-500" : "bg-red-500")} style={{ width: `${qScore}%` }} />
                                              </span>
                                              <span className={cn("text-[9px] font-semibold", qScore >= 80 ? "text-green-600" : qScore >= 60 ? "text-amber-600" : "text-red-600")}>{qScore}%</span>
                                            </span>
                                          </div>
                                        </td>
                                      );
                                    })}
                                    <td className="px-1 py-0.5" />
                                  </tr>
                                )}
                                {/* Row 4 (loading) — profile loading indicator */}
                                {isLoadingInlineProfile && (
                                  <tr className="bg-purple-50/30 dark:bg-purple-900/5 border-b border-slate-200/80 dark:border-slate-700">
                                    <td className="px-2.5 py-0.5 text-[9px] text-purple-400">quality</td>
                                    <td colSpan={inlinePreviewData.columns.length + 1} className="px-2.5 py-0.5">
                                      <div className="flex items-center gap-1.5 text-[9px] text-purple-400">
                                        <RefreshCw className="h-3 w-3 animate-spin" /> Profiling...
                                      </div>
                                    </td>
                                  </tr>
                                )}
                                {/* Add-column row */}
                                <tr className="border-b border-slate-100 dark:border-slate-700">
                                  <td className="px-2.5 py-0.5" />
                                  <td colSpan={inlinePreviewData.columns.length} className="px-2.5 py-0.5">
                                    <button
                                      onClick={() => { if (readOnlyGuard()) return; setActiveRightTab('actions'); setFocusedAction('add_column'); if (!rightBarOpen) setRightBarOpen(true); }}
                                      disabled={isReadOnly}
                                      className="inline-flex items-center gap-1 text-[10px] font-medium text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 transition-colors disabled:opacity-40"
                                    >
                                      <Plus className="h-3 w-3" /> Add column / calculated field
                                    </button>
                                  </td>
                                  <td />
                                </tr>
                              </thead>
                              <tbody>
                                {inlinePreviewData.rows.slice(0, 5).map((row: Record<string, any>, i: number) => (
                                  <tr key={i} className={cn("border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50", i % 2 === 1 && "bg-slate-50/50 dark:bg-slate-800/20")}>
                                    <td className="px-2.5 py-1.5 text-slate-400 font-mono">{i + 1}</td>
                                    {inlinePreviewData.columns.map((col: string) => {
                                      const val = row[col];
                                      const isNull = val === null || val === undefined;
                                      const colMeta = tableColumns.find((c) => c.name === col || c.name === col.toUpperCase());
                                      const isMasked = colMeta?.isSensitive;
                                      const maskedVal = isMasked && !isNull ? '••••••' : null;
                                      return (
                                        <td key={col} className={cn("px-2.5 py-1.5 font-mono truncate max-w-[180px]", isNull ? "text-slate-400 italic" : isMasked ? "text-amber-500/70" : "text-slate-700 dark:text-slate-300")} title={isNull ? 'NULL' : isMasked ? `Masked (${colMeta?.name})` : String(val)}>
                                          {isNull ? <span className="text-slate-400 italic">null</span> : maskedVal ? <span className="flex items-center gap-1"><Lock className="h-2.5 w-2.5 text-amber-400 inline shrink-0" />{maskedVal}</span> : String(val)}
                                        </td>
                                      );
                                    })}
                                    <td className="px-1 py-1.5" />
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ) : inlinePreviewError ? (
                            <div className="py-6 text-center text-sm">
                              <AlertCircle className="h-5 w-5 mx-auto mb-1.5 text-amber-500" />
                              <p className="text-slate-700 dark:text-slate-200 font-medium">Preview failed</p>
                              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">{inlinePreviewError}</p>
                            </div>
                          ) : (
                            <div className="py-6 text-center text-sm text-slate-400">No rows returned (table is empty)</div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Profile data is now integrated into the preview table above */}
                  </div>
                ) : (
                  <div className="h-full w-full">
                    {tables.length > 0 ? (
                      <SourceMindMap
                        databases={databases}
                        schemas={schemas}
                        tables={tables}
                        selectedDatabase={selectedDatabase}
                        onSelectTable={(t) => setSelectedTable(t)}
                      />
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full text-slate-500">
                        <Table2 className="h-16 w-16 mb-4 text-slate-300" />
                        <p className="font-medium text-lg">Select a database & schema</p>
                        <p className="text-sm mt-1">Choose from the toolbar above to browse tables</p>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Context Right Bar — multi-tab cockpit */}
              <ContextRightBar
                selectedTable={selectedTable}
                tableColumns={tableColumns}
                projectId={selectedProjectId}
                isOpen={rightBarOpen}
                onToggle={() => setRightBarOpen(!rightBarOpen)}
                activeTab={activeRightTab}
                onTabChange={setActiveRightTab}
                focusedAction={focusedAction}
                onFocusAction={setFocusedAction}
                columnClassifications={columnClassifications}
                classificationDetails={classificationDetails}
                isClassifying={isClassifying}
                classifyUnavailable={classifyUnavailable}
                onRunClassify={handleAIClassify}
                onAddEvent={addEvent}
                profileData={inlineProfileData}
                historyEvents={events.slice(0, 50).map((e: any) => ({
                  id: e.id || String(Math.random()),
                  type: e.type || 'Event',
                  status: (e.status === 'deployed' || e.status === 'success') ? 'success' as const : e.status === 'error' ? 'error' as const : e.status === 'warning' ? 'warning' as const : 'pending' as const,
                  actor: e.createdBy || e.actor || currentUsername || 'System',
                  timestamp: e.createdAt || e.timestamp || new Date().toISOString(),
                  object: e.target?.table || e.target?.schema || '—',
                  message: e.error || undefined,
                }))}
                pendingEventsCount={displayablePendingEvents.length}
                pendingEvents={displayablePendingEvents}
                selectedDatabase={selectedDatabase}
                selectedSchema={schemas[0] || ''}
                userRole={sessionRole || (userRole as string) || undefined}
                onOpenDeployModal={() => { trackFeatureClick('deploy', { view: 'catalog', pendingEvents: displayablePendingEvents.length }); setShowDeploymentModal(true); }}
                onDeselectTable={() => { setSelectedTable(null); setRightBarOpen(false); }}
              />
              </div>{/* end center+right row */}
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
                          <button
                            className="w-full px-4 py-2 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 text-slate-700 dark:text-slate-300"
                            onClick={() => { setShowIngestionModal(true); setShowCreateMenuModeling(false); }}
                          >
                            <Workflow className="w-4 h-4" /> Guided Ingestion (source → target)
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
                        trackFeatureClick('deploy', { view: 'modeling', pendingEvents: displayablePendingEvents.length });
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
        )}

        {/* Right Events drawer — slides over the canvas instead of stealing
            a fixed column. Same toggle, same data, but the canvas stays full
            width when it's closed (which is the default). Backdrop click
            closes it. */}
        {/* EventPanel + HistoryRail removed — all in ContextRightBar */}
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

      {/* Bulk PK — right-side panel (non-blocking, page stays visible) */}
      {showBulkPKModal && (
        <div
          role="region"
          aria-modal="false"
          aria-label="Configure primary keys for selected tables"
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
              <Key className="h-4 w-4 text-amber-500" />
              Set Primary Keys
            </h3>
            <button
              aria-label="Close primary key panel"
              onClick={() => setShowBulkPKModal(false)}
              className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-5">
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
              Detect primary keys across {selectedTables.size} selected table(s) by matching a column-name pattern.
            </p>
            <div className="space-y-2">
              {([
                { rule: '*_ID' as const, description: 'Columns ending with _ID' },
                { rule: 'ID_*' as const, description: 'Columns starting with ID_' },
                { rule: '*_PK' as const, description: 'Columns ending with _PK' },
              ]).map((option) => (
                <button
                  key={option.rule}
                  className="flex w-full items-center gap-3 rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                  onClick={() => {
                    handleBulkSetPrimaryKey(option.rule);
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
          </div>
          <div className="flex justify-end border-t border-slate-200 px-5 py-3 dark:border-slate-700">
            <Button variant="outline" onClick={() => setShowBulkPKModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Bulk Masking — right-side panel (non-blocking) */}
      {showBulkMaskingModal && (
        <div
          role="region"
          aria-modal="false"
          aria-label="Apply masking policy to selected tables"
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
              <Shield className="h-4 w-4 text-green-500" />
              Apply Masking Policy
            </h3>
            <button
              aria-label="Close masking panel"
              onClick={() => setShowBulkMaskingModal(false)}
              className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-5">
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
              Apply a masking policy to {selectedColumns.size} selected column(s) across {selectedTables.size} selected table(s).
            </p>
            {selectedColumns.size === 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800/50 dark:bg-amber-900/20 dark:text-amber-300">
                No columns are selected. Open a single table and use its detail panel to choose
                columns and apply masking — bulk masking applies the policy to those columns across
                every selected table.
              </div>
            ) : maskingPolicies.length === 0 ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800">
                No masking policies are defined yet. Create one in Governance.
              </div>
            ) : (
              <div className="space-y-2">
                {maskingPolicies.map((policy) => (
                  <button
                    key={policy.name}
                    className="flex w-full items-center gap-3 rounded-lg border border-slate-200 p-3 text-left hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
                    onClick={() => {
                      handleBulkApplyMasking(policy.name);
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
            )}
          </div>
          <div className="flex justify-end border-t border-slate-200 px-5 py-3 dark:border-slate-700">
            <Button variant="outline" onClick={() => setShowBulkMaskingModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Relations — right-side panel (non-blocking) */}
      {showRelationsModal && (
        <div
          role="region"
          aria-modal="false"
          aria-label="Configure relations for selected tables"
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
              <Link2 className="h-4 w-4 text-blue-500" />
              Configure Relations
            </h3>
            <button
              aria-label="Close relations panel"
              onClick={() => setShowRelationsModal(false)}
              className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-5">
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
              Detect foreign-key relationships across {selectedTables.size} selected table(s).
            </p>
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
          </div>
          <div className="flex justify-end border-t border-slate-200 px-5 py-3 dark:border-slate-700">
            <Button variant="outline" onClick={() => setShowRelationsModal(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* DAG Dependency Graph — right-side panel (non-blocking, zero-popup) */}
      {showDagViewer && selectedProjectId && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Dependency Graph (DAG)"
          className="fixed inset-y-0 right-0 z-40 flex w-full max-w-5xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Workflow className="h-5 w-5 text-violet-600" />
              Dependency Graph (DAG)
            </h3>
            <button aria-label="Close dependency graph panel" onClick={() => setShowDagViewer(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <DagViewer projectId={selectedProjectId} className="h-full min-h-[70vh]" />
          </div>
        </div>
      )}

      {/* Ingestion Runs — right-side panel (non-blocking, zero-popup) */}
      {showIngestionResults && selectedProjectId && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label="Ingestion Runs"
          className="fixed inset-y-0 right-0 z-40 flex w-full max-w-3xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-teal-500" />
              Ingestion Runs
            </h3>
            <button aria-label="Close ingestion runs panel" onClick={() => setShowIngestionResults(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <IngestionResultsPanel projectId={selectedProjectId} className="overflow-auto" />
          </div>
        </div>
      )}

      {/* AI Intelligence — right-side panel (non-blocking) */}
      {showAiPanel && (
        <div
          role="dialog"
          aria-label="AI intelligence settings"
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
              <Sparkles className="h-5 w-5 text-purple-500" />
              AI Intelligence
            </h3>
            <button
              aria-label="Close AI panel"
              onClick={() => setShowAiPanel(false)}
              className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-5">
            <AiFeatureToggle />
          </div>
        </div>
      )}

      {/* Deployment Modal — B1-B5 pipeline is now inside DeploymentValidation */}
      <Modal
        isOpen={showDeploymentModal}
        onClose={() => setShowDeploymentModal(false)}
        customSize="1050px"
      >
        <ErrorBoundary>
          <PermissionGate
            module="explore_design"
            action="deploy"
            projectId={selectedProjectId}
            title="Deployment restricted"
            description="You don't have the &quot;deploy&quot; permission on Explore &amp; Design. Applying changes to Snowflake requires an administrator to grant deploy access."
          >
            <DeploymentValidation
              onClose={() => setShowDeploymentModal(false)}
              database={selectedDatabase /*|| 'CP_DATA360'*/}
              schemas={schemaKeys}
              projectId={selectedProjectId!}
            />
          </PermissionGate>
        </ErrorBoundary>
      </Modal>

      {/* AI-Guided Modeling Wizard — on approval it emits model events into the
          event store, then hands off to the existing DeploymentValidation
          wizard (which opens at its default Review step, seeded by the store). */}
      {showAiGuidedWizard && selectedProjectId && (
        <AiGuidedModelWizard
          projectId={selectedProjectId}
          persona={userRole === 'owner' ? 'superadmin' : 'admin'}
          initialDescription={aiModelSeed}
          initialSelectedTables={scanSeedTables}
          onClose={() => {
            setShowAiGuidedWizard(false);
            setAiModelSeed('');
            setScanSeedTables([]);
          }}
          onApproved={() => {
            setShowAiGuidedWizard(false);
            setAiModelSeed('');
            setScanSeedTables([]);
            setShowDeploymentModal(true);
          }}
        />
      )}

      {/* Self-Serve Ingestion Modal */}
      <SelfServeIngestionModal
        isOpen={showIngestionModal}
        onClose={() => setShowIngestionModal(false)}
        projectId={selectedProjectId}
      />

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
          trackFeatureClick('create_table', { tableType: createTableType, columns: columns.length });
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
            trackFeatureClick('create_relationship');
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

      {/* Catalog Policy + Ingestion panels moved to right rail — no modals */}

      {/* Modeling Ingestion Config — right-side panel (non-blocking) */}
      {showModelingIngestionPanel && selectedTable && (
        <div
          role="dialog"
          aria-label="Ingestion configuration"
          className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
            <h3 className="flex items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
              <Upload className="h-4 w-4 text-blue-500" />
              Ingestion Config — {selectedTable.table}
            </h3>
            <button
              aria-label="Close ingestion config panel"
              onClick={() => setShowModelingIngestionPanel(false)}
              className="rounded-lg p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="h-4 w-4 text-slate-500" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-5">
            <IngestionConfigPanel
              table={{ database: selectedTable.database, schema: selectedTable.schema, table: selectedTable.table }}
              projectId={selectedProjectId ?? undefined}
              columns={tableColumns}
              ingestionMode={modelingIngestionMode}
              onModeChange={setModelingIngestionMode}
              onSave={() => setShowModelingIngestionPanel(false)}
            />
          </div>
        </div>
      )}

      {/* Data Engineering Objects Modal */}
      <ActionRail
        isOpen={dataEngModal.isOpen}
        onClose={() => setDataEngModal(prev => ({ ...prev, isOpen: false }))}
        title={
          dataEngModal.type === 'dynamic_tables'
            ? 'Dynamic Tables'
            : dataEngModal.type === 'streams'
              ? 'Streams'
              : 'Alerts'
        }
        description={dataEngModal.schema ? `${selectedDatabase}.${dataEngModal.schema}` : undefined}
        accentClassName={
          dataEngModal.type === 'dynamic_tables'
            ? 'bg-blue-500'
            : dataEngModal.type === 'streams'
              ? 'bg-green-500'
              : 'bg-amber-500'
        }
        className="max-w-lg"
      >
        <div>
          {/* Inline drop confirmation bar */}
          {confirmDrop && confirmDrop.type !== 'schema' && (
            <div className="mb-4 flex items-center gap-3 rounded-lg border border-red-300 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-900/20">
              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0" />
              <p className="flex-1 text-sm text-red-800 dark:text-red-200">
                Drop {confirmDrop.type.replace('_', ' ')} <span className="font-semibold">&quot;{confirmDrop.name}&quot;</span>? This cannot be undone.
              </p>
              <button
                onClick={() => setConfirmDrop(null)}
                className="rounded px-3 py-1 text-xs font-medium text-slate-600 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                onClick={executeConfirmedDrop}
                className="rounded bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
              >
                Confirm Drop
              </button>
            </div>
          )}

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
                      {/* Status: prefer the backend's normalized refresh.health
                          (the only signal that surfaces FAILING dynamic tables —
                          a DT can be scheduled ACTIVE yet have a FAILED last
                          refresh). Falls back to a string-safe scheduling_state /
                          alert state, guarding against variant (non-string) values. */}
                      {(() => {
                        const health: string | undefined = item.refresh?.health;
                        const rawSched = typeof item.scheduling_state === 'string' ? item.scheduling_state : undefined;
                        const rawState = typeof item.state === 'string' ? item.state : undefined;
                        const label = health ?? rawSched ?? rawState;
                        if (!label) return null;
                        const up = label.toUpperCase();
                        const tone =
                          up === 'RUNNING' || up === 'ACTIVE' || up === 'STARTED'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : up === 'FAILING' || up === 'FAILED'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              : up === 'SUSPENDED'
                                ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';
                        return <Badge className={cn('text-[9px]', tone)}>{label}</Badge>;
                      })()}
                      {item.refresh?.health === 'FAILING' && item.refresh?.last_refresh_state_message && (
                        <span
                          className="text-[10px] text-red-500 truncate max-w-[220px]"
                          title={String(item.refresh.last_refresh_state_message)}
                        >
                          {String(item.refresh.last_refresh_state_message)}
                        </span>
                      )}
                      {(item.refresh?.target_lag || item.stale_after) && (
                        <span className="text-[10px] text-slate-400">lag: {item.refresh?.target_lag || item.stale_after}</span>
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
                              disabled={!canDropObjects}
                              title={!canDropObjects ? dropDeniedReason : undefined}
                              className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-40 disabled:cursor-not-allowed"
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
                              disabled={!canDropObjects}
                              title={!canDropObjects ? dropDeniedReason : undefined}
                              className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-40 disabled:cursor-not-allowed"
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
                            disabled={!canDropObjects}
                            title={!canDropObjects ? dropDeniedReason : undefined}
                            className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 disabled:opacity-40 disabled:cursor-not-allowed"
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
      </ActionRail>
      {/* Cross-module links */}
      <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
        <span>Related:</span>
        <a href="/workflow" className="text-blue-600 dark:text-blue-400 hover:underline">Workflow (ETL Pipelines)</a>
        <a href="/data-quality" className="text-blue-600 dark:text-blue-400 hover:underline">Data Quality (Checks)</a>
        <a href="/governance" className="text-blue-600 dark:text-blue-400 hover:underline">Governance (Policies)</a>
      </div>
    </div>
    </ErrorBoundary>
  );
}
