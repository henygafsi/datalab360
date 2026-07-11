'use client';
import React, { useState, useEffect, useCallback, useMemo, useRef, useDeferredValue } from 'react';
import { toMessage } from '@/lib/error-messages';
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
  Settings, ChevronRight, ChevronDown, Filter, Upload,
  Layers, Grid3X3, LayoutGrid, CheckSquare, Square, AlertTriangle,
  Clock, History, Lock, Eye, Play, Save, X, Plus, Minus, Trash2,
  FileText, BookOpen, Sparkles, Zap, GitBranch, ArrowRight, ArrowLeft,
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
import { toServiceError } from '@/app/services/_errors';
import { isUnavailable } from '@/lib/http-status';
import { fmtNum } from '@/app/shared/ui/format';
import { safeLocale } from '@/lib/format-number';
import { createSchemaClone, getERDLayout } from '@/app/services/explore-design';
// TODO verify endpoint: reuses the org-accounts warehouse usage rollup (the only
// existing contract that lists warehouse names) to populate DE create modals.
import { getWarehouses } from '@/app/services/org-accounts/hooks';
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
import type { RightBarTab, FocusedAction, RailSeverity } from './components/ContextRightBar';
import ModelKpiStrip, { type ModelKpis } from './components/ModelKpiStrip';
import DeployStateButton, { deriveDeployState, type DeployState } from './components/DeployStateButton';
import ReleasePanel from './components/release/ReleasePanel';
import DeployedProduction from './components/release/DeployedProduction';
import ProjectIdentityChips from './components/ProjectIdentityChips';
import AiChangeAnalyst from './components/AiChangeAnalyst';
import { useReleaseState } from './components/release/useReleaseState';
import type { AxisSignal, ReleaseStatus } from './components/release/types';
import { useDeploymentReadiness } from './hooks/useDeploymentReadiness';
import { useIngestionTrace } from '@/hooks/useIngestionTrace';
import EventTable from './components/EventTable';
import DeploymentValidation from './components/DeploymentValidation';
import ManageAccessButton from '@/app/shared/governance/ManageAccessButton';
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
  createIngestionModeEvent,
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
// R6 — per-project ADN header badge: the consolidated, null-aware 5-axis strip.
import AdnHeaderBadge from '@/app/shared/score-cards/AdnHeaderBadge';
import HybridTableModal from './components/HybridTableModal';
import IngestionConfigPanel from './components/IngestionConfigPanel';
import TemplateLibrary from './components/TemplateLibrary';
import SqlDiffViewer from './components/SqlDiffViewer';
import IngestionResultsPanel from './components/IngestionResultsPanel';
import DagViewer from './components/DagViewer';
import CascadeConfirmModal from './components/CascadeConfirmModal';
import ImpactAnalysisPanel from './components/ImpactAnalysisPanel';
import WhereClauseBuilder from './components/WhereClauseBuilder';
import QualityGatesPanel from './components/QualityGatesPanel';
import IngestionDryRunPanel from './components/IngestionDryRunPanel';
import ConflictResolutionModal, { EventConflict } from './components/ConflictResolutionModal';
import EventTemplatePickerModal from './components/EventTemplatePickerModal';
import AiFeatureToggle from './components/AiFeatureToggle';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { useAiAnalysis } from './hooks/useAiAnalysis';
import { useAiFeatures, useAiSuggestions, type AiSuggestion } from './stores/ai-store';
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
  /** Data-first: table fetch in flight → the count badge skeletons instead of a fake "0 tables". */
  isLoadingTables?: boolean;
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
  isLoadingTables = false,
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
    // Only actions backed by a working endpoint are exposed. Transfer Ownership,
    // Export DDL, Drop Schema, and the "apply … to All" bulk operations have no
    // backend support yet — their handlers stay in handleSchemaAction (kept as
    // dead switch cases) but are no longer surfaced, so the menu never offers a
    // broken no-op action.
    { id: 'clone_schema', label: 'Clone Schema', icon: Layers },
    { id: 'divider2', label: '' },
    { id: 'list_dynamic_tables', label: 'List Dynamic Tables', icon: RefreshCw },
    { id: 'list_streams', label: 'List Streams', icon: GitBranch },
    { id: 'list_alerts', label: 'List Alerts', icon: AlertTriangle },
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
                {/* Count only — the selected schema NAMES live in the action
                    chips beside this button (≤3). Repeating the single schema
                    name in both the button and its chip read as a duplicate
                    (UX audit 2026-07-11). */}
                {selectedSchemas.size > 0
                  ? `${selectedSchemas.size} ${selectedSchemas.size === 1 ? 'schema' : 'schemas'} selected`
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
        {isLoadingTables && stats.total === 0 ? (
          // Skeleton while the table fetch is in flight — "0 tables" here
          // would be a fabricated value (data-first rule).
          <span className="h-4 w-14 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
        ) : (
          <Badge className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 text-[10px] px-1.5">
            {stats.total} tables
          </Badge>
        )}
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
                    <button aria-label="Close schema health" onClick={() => setHealthOpen(false)} className="p-0.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded">
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
                      Score not available
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

/**
 * ModelOverview — the model-general landing for the modeling right cockpit when
 * no node is selected (replaces the bare empty canvas / 6× "Select a table").
 * Pure read summary from page-level data already in hand: #tables, #relations,
 * target DWH, and the per-project 5-axis ADN badge (self-hides when no rollup).
 * Honest "—" when a value isn't known (no fabricated zeros).
 */
function ModelOverview({ tableCount, relationCount, targetDwh, projectId }: {
  tableCount: number; relationCount: number; targetDwh: string; projectId: string | null;
}) {
  const Stat = ({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: React.ReactNode; tone: string }) => (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={cn('h-3.5 w-3.5', tone)} />
        <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className="text-lg font-bold text-slate-800 dark:text-slate-100 font-mono truncate">{value}</p>
    </div>
  );
  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Workflow className="h-4 w-4 text-blue-500" />
        <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">Model overview</h4>
      </div>
      <p className="text-[11px] text-slate-500">Select a table in the canvas to see contextual actions, or review the model summary below.</p>

      <div className="grid grid-cols-2 gap-2">
        <Stat icon={Table2} label="Tables" value={tableCount} tone="text-blue-500" />
        <Stat icon={GitBranch} label="Relations" value={relationCount} tone="text-purple-500" />
        <Stat icon={Database} label="Target DWH" value={targetDwh || '—'} tone="text-cyan-500" />
        <Stat icon={Layers} label="Project" value={projectId ? 'Linked' : '—'} tone="text-emerald-500" />
      </div>

      {/* Per-project ADN — self-hides (renders nothing) when no rollup exists,
          so this never shows a fabricated score. */}
      {projectId && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Data health (ADN)</span>
          <div className="flex">
            <AdnHeaderBadge projectId={projectId} compact />
          </div>
        </div>
      )}

      <p className="text-[10px] text-slate-400 italic">Use the canvas Fit / Auto-layout controls to arrange the model. Click a node to inspect and act on it.</p>
    </div>
  );
}

// Dev-only probe for the e2e boundary test (e2e/ed-ux.spec.ts): when the page
// is opened with ?__force_chunk_error=1 it throws a synthetic ChunkLoadError
// exactly once per browser session, so the test can verify the ErrorBoundary's
// automatic transient-error retry without depending on a real HMR/chunk race.
// The throw is ARMED from an effect (post-hydration) on purpose: an error
// thrown during hydration is silently retried by React's client-render
// fallback and never reaches the boundary's componentDidCatch — a real lost
// chunk also fails on a post-hydration render (lazy import), so this matches.
// Renders nothing (and never throws) in production builds or without the flag.
function ChunkErrorProbe({ enabled }: { enabled: boolean }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (
      enabled &&
      process.env.NODE_ENV !== 'production' &&
      !window.sessionStorage.getItem('d360-chunk-probe-thrown')
    ) {
      setArmed(true);
    }
  }, [enabled]);
  if (armed) {
    window.sessionStorage.setItem('d360-chunk-probe-thrown', '1');
    const err = new Error('Loading chunk d360-probe failed. (simulated transient chunk error)');
    err.name = 'ChunkLoadError';
    throw err;
  }
  return null;
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
  // Data-Quality deep-link: ?intent=model&from=data-quality&table=X
  // Pre-selects the matching source table once the catalog is loaded.
  const urlTable = searchParams.get('table');
  // e2e-only escape hatch (see ChunkErrorProbe above) — inert in production.
  const forceChunkError = searchParams.get('__force_chunk_error') === '1';
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
    // Granted-only (owner/contributor) — matches the selector default; the
    // "mine filter broken for admins" workaround was disproven live 2026-07-10.
    () => listProjects({ project_type: 'explore_design', mine_only: true }),
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
  // ONE bulk, account-global ingestion trace (Snowpipe + COPY). Hydrated after
  // first paint; exposes an O(1) `lookup` used by the source-table list rows and
  // the right-bar — no per-row fetch (no N+1).
  const { lookup: ingestionLookup } = useIngestionTrace(7);
  const selectedIngestion = selectedTable
    ? ingestionLookup(selectedTable.database, selectedTable.schema, selectedTable.table)
    : null;
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
  // Distinguish a failed schema/table read from a genuinely-empty catalog so the
  // catalog can show an inline error + Retry instead of the "No tables loaded"
  // empty state (which silently masks the failure).
  const [catalogLoadError, setCatalogLoadError] = useState<string | null>(null);
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
  // (deployment is now a docked right-bar tab, not a modal — no open/close state)
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
  // Account warehouses for the DE create modals (Dynamic Table / Alert). Fetched
  // once, non-blocking; failures (e.g. non-admin → 403) degrade to [] and the
  // modals fall back to their default warehouse. Sourced from the existing
  // org-accounts usage rollup — the only contract that lists warehouse names.
  const [accountWarehouses, setAccountWarehouses] = useState<string[]>([]);

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

  // Action-RBAC for in-place column ALTERs (rename / retype). Fail-open while
  // the allow-set loads (mirrors canDropObjects). Drop reuses dropObjPerm.
  const editColPerm = useCanPerform('explore_design', 'edit');
  const canEditCols = editColPerm.allowed || editColPerm.loading;

  // Action-RBAC for CREATE DDL (schema clone + add-column). Replaces the prior
  // hardcoded viewer-role gate on those actions. Fail-open while the allow-set
  // loads (mirrors canDropObjects / canEditCols). readOnlyGuard (contributor
  // role axis) is kept alongside — the two guards cover different concerns.
  const createObjPerm = useCanPerform('explore_design', 'create');
  const canCreateObjects = createObjPerm.allowed || createObjPerm.loading;
  const createDeniedReason =
    'You lack the "create" permission on Explore & Design. Ask an administrator to grant it.';
  // Inline per-column ALTER editor (rename / retype / drop-confirm). No browser
  // dialogs (this file replaced confirm() with inline state, see confirmDrop).
  const [columnEdit, setColumnEdit] = useState<
    { column: string; mode: 'rename' | 'retype' | 'drop'; value: string; oldType: string } | null
  >(null);
  // Snowflake types offered by the retype picker (mirrors AddColumnModal DATA_TYPES).
  const COLUMN_TYPE_OPTIONS = ['VARCHAR', 'NUMBER', 'INTEGER', 'FLOAT', 'BOOLEAN', 'DATE', 'TIMESTAMP', 'VARIANT', 'ARRAY', 'OBJECT'];

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('catalog');
  // Persist viewMode to localStorage
  useEffect(() => {
    localStorage.setItem('explore-design-view-mode', viewMode);
  }, [viewMode]);

  // Restore the active view from the deep-link (?view) on first load so a
  // shared link reopens where the user was (catalog vs modeling).
  useEffect(() => {
    const v = searchParams.get('view');
    if (v === 'modeling' || v === 'catalog') setViewMode(v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep ?project_id + ?view in the URL so the page is shareable/bookmarkable
  // and restores the selected project + view. router.replace (not push) avoids
  // polluting history on every switch. Only writes once a project is selected,
  // so an incoming ?project_id deep-link survives until it auto-selects.
  useEffect(() => {
    if (typeof window === 'undefined' || !selectedProjectId) return;
    const params = new URLSearchParams(Array.from(searchParams.entries()));
    params.set('project_id', selectedProjectId);
    params.set('view', viewMode);
    router.replace(`${window.location.pathname}?${params.toString()}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProjectId, viewMode]);

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
  // T1 unification bridge: ModelingCanvas registers its live context-action
  // dispatcher here so the unified ContextRightBar's "Modeling actions" group can
  // route table actions (FK/relation/PK/duplicate/DE-tables/exclude) through the
  // SAME handleNodeContextAction path the old node menu used. Ref (not state) so
  // registration never triggers a re-render.
  const canvasActionDispatchRef = useRef<((tableId: string, action: string) => void) | null>(null);
  const handleNodeContextAction = useCallback((tableId: string, action: string) => {
    canvasActionDispatchRef.current?.(tableId, action);
  }, []);
  // A node's "more"/context action opens the ONE right bar on its Actions tab
  // (replaces the retired standalone TableOptionsSidebar). selectedTable is set by
  // the canvas via onTableSelect before this fires; we only need to open + focus.
  const handleOpenContextBar = useCallback((table: TableItem) => {
    setSelectedTable(table);
    setActiveRightTab('actions');
    setFocusedAction(null);
    setRightBarOpen(true);
  }, []);
  // Stable so it doesn't defeat ModelingCanvas's React.memo or re-run its register
  // effect every render. Stores the canvas's live dispatcher into the ref above.
  const handleRegisterActionDispatch = useCallback((dispatch: (tableId: string, action: string) => void) => {
    canvasActionDispatchRef.current = dispatch;
  }, []);
  const [classificationDetails, setClassificationDetails] = useState<Array<{ column: string; category: string; tags?: string[]; confidence?: number | null; description?: string; piiRisk?: string; suggestion?: string }>>([]);
  // Conflict detection modal
  const [showConflictModal, setShowConflictModal] = useState(false);
  const [currentConflict, setCurrentConflict] = useState<EventConflict | null>(null);
  // Stores the pending action to resume after conflict resolution
  const pendingConflictAction = useRef<{ type: 'deploy'; eventIds: string[] } | null>(null);

  // Modeling table selection - tracks which tables are included in the modeling view
  const [modelingTableIds, setModelingTableIds] = useState<Set<string>>(new Set());
  // Live mirror for effects that must not re-run when canvas membership changes
  // (the catalog table loader below). Reading the ref inside a functional
  // setState always sees the current membership, without adding it as a dep.
  const modelingTableIdsRef = useRef(modelingTableIds);
  modelingTableIdsRef.current = modelingTableIds;

  // Target table IDs - tracks which tables are DWH/target tables (default tables from DATA360.RETAIL_DWH)
  // These are the tables that user-added source tables must map TO
  const [targetTableIds, setTargetTableIds] = useState<Set<string>>(new Set());

  // Default relationships for modeling view
  const [defaultRelationships, setDefaultRelationships] = useState<TableRelationship[]>([]);

  // Refresh trigger for tables
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  // Load account warehouses once for the DE create modals — fail-soft so a
  // 403 (non-admin) or slow query never blocks the page; modals fall back to
  // their default warehouse when the list is empty.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await getWarehouses();
        if (cancelled) return;
        setAccountWarehouses(
          (res?.warehouses ?? [])
            .map((w) => w.warehouse_name)
            .filter((n): n is string => Boolean(n)),
        );
      } catch {
        if (!cancelled) setAccountWarehouses([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

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

  // AI suggestion apply path (Class A — LOCAL canvas dispatches, no backend
  // route → no 404/501 gate). markApplied keeps the row visible with an
  // "Applied" state; the action CTA is the SOLE apply path.
  const { markApplied: markAiSuggestionApplied } = useAiSuggestions(selectedProjectId);

  // ── Auto-sync DDL actions to backend ────────────────────────────────────
  // Maps local event ID → backend DDL event_id for add/remove tracking
  const ddlEventMapRef = useRef<Map<string, string>>(new Map());
  const prevEventIdsRef = useRef<Set<string>>(new Set());
  // One-shot guard: fires at most once per page-load so the ?table= deep-link
  // doesn't re-select on every schema reload.
  const urlTableAppliedRef = useRef(false);

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

  // ── Per-column ALTER dispatchers (P0) ─────────────────────────────────────
  // Wire DROP / RENAME / retype into the existing EventStore. The deployment-
  // utils generator already emits the SQL + rollbackSql for each of these event
  // types — we only need to emit the event with the exact payload shape it reads:
  //   COLUMN_RENAMED      → payload.oldName / payload.newName, target.column = oldName
  //   COLUMN_TYPE_CHANGED → target.column, payload.oldType / payload.newType
  //   REMOVE_COLUMN       → payload.columnName (+ target.column)
  // addEvent() silently rejects non-significant events (returns null), so oldType
  // and a changed value are load-bearing — without them the action no-ops.
  const handleColumnRename = useCallback((columnName: string, newName: string) => {
    if (readOnlyGuard()) return;
    if (!selectedTable) return;
    const trimmed = newName.trim().toUpperCase();
    if (!trimmed || trimmed === columnName.toUpperCase()) { setColumnEdit(null); return; }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(trimmed)) {
      toast.error('Invalid column name');
      return;
    }
    const added = addEvent({
      type: 'COLUMN_RENAMED',
      projectId: selectedProjectId || undefined,
      target: {
        database: selectedTable.database,
        schema: selectedTable.schema,
        table: selectedTable.table,
        column: columnName,
      },
      payload: { oldName: columnName, newName: trimmed },
    });
    setColumnEdit(null);
    if (added) toast.success(`Rename "${columnName}" → "${trimmed}" queued`);
  }, [readOnlyGuard, selectedTable, selectedProjectId, addEvent]);

  const handleColumnRetype = useCallback((columnName: string, oldType: string, newType: string) => {
    if (readOnlyGuard()) return;
    if (!selectedTable) return;
    if (!newType || newType === oldType) { setColumnEdit(null); return; }
    const added = addEvent({
      type: 'COLUMN_TYPE_CHANGED',
      projectId: selectedProjectId || undefined,
      target: {
        database: selectedTable.database,
        schema: selectedTable.schema,
        table: selectedTable.table,
        column: columnName,
      },
      payload: { oldType, newType },
    });
    setColumnEdit(null);
    if (added) toast.success(`Type change "${columnName}" ${oldType || '?'} → ${newType} queued`);
  }, [readOnlyGuard, selectedTable, selectedProjectId, addEvent]);

  const handleColumnDrop = useCallback((columnName: string) => {
    if (readOnlyGuard()) return;
    if (!selectedTable) return;
    const added = addEvent({
      type: 'REMOVE_COLUMN',
      projectId: selectedProjectId || undefined,
      target: {
        database: selectedTable.database,
        schema: selectedTable.schema,
        table: selectedTable.table,
        column: columnName,
      },
      payload: { columnName },
    });
    setColumnEdit(null);
    if (added) toast.success(`Drop column "${columnName}" queued`);
  }, [readOnlyGuard, selectedTable, selectedProjectId, addEvent]);

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

  // ?table= deep-link: pre-select the matching source table once the catalog
  // is loaded. Fires at most once per page-load (urlTableAppliedRef guard).
  // NOTE: tables only populate after project+database+schema are selected, so
  // this is a no-op on a bare deep-link until the user browses to a schema.
  useEffect(() => {
    if (!urlTable || tables.length === 0 || urlTableAppliedRef.current) return;
    const needle = urlTable.toLowerCase();
    const match = tables.find(
      (t) =>
        t.table.toLowerCase() === needle ||
        `${t.schema}.${t.table}`.toLowerCase() === needle ||
        `${t.database}.${t.schema}.${t.table}`.toLowerCase() === needle,
    );
    if (!match) return;
    urlTableAppliedRef.current = true;
    setSelectedTable(match);
    setActiveRightTab('actions');
  }, [tables, urlTable]); // eslint-disable-line react-hooks/exhaustive-deps

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
      // Conflict resolved — resume deploy by switching to the docked Deploy tab
      // (the 8-step stepper now lives in the right bar, not a modal).
      setActiveRightTab('deploy');
      setRightBarOpen(true);
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

  // ── Redesign Wave A: top KPI strip + Deploy state-machine + rail severity ──
  // All derived from data already in hand. Any value we can't source honestly is
  // left `undefined` → the strip renders "—" (never a fabricated 0). The
  // deployment-readiness GET degrades silently on 404/501 (unavailable flag).
  const { data: deploymentReadiness } = useDeploymentReadiness(selectedProjectId);

  // Blocking issues = breaking changes (fallback: high-risk impacts) from the
  // readiness rollup. `undefined` readiness → 0 blockers (honest: none known).
  const deployBlockers =
    deploymentReadiness?.lineage_impact?.breaking_changes?.length ??
    deploymentReadiness?.lineage_impact?.impact_summary?.high_risk ??
    0;

  // Project-level PII signal from whatever column classification has actually run
  // (empty until the user classifies → undefined, not a fake "Low").
  const piiLevel = useMemo<'Low' | 'Medium' | 'High' | undefined>(() => {
    if (!classificationDetails || classificationDetails.length === 0) return undefined;
    let hasPii = false;
    let hasMedium = false;
    for (const c of classificationDetails) {
      const r = (c.piiRisk || '').toString().toLowerCase();
      if (r === 'high') return 'High';
      if (r === 'medium') hasMedium = true;
      if (r === 'high' || r === 'medium' || r === 'low') hasPii = true;
    }
    if (hasMedium) return 'Medium';
    return hasPii ? 'Low' : undefined;
  }, [classificationDetails]);

  // Real counts sourced from the same page state ModelOverview uses.
  const kpiTableCount = tables.length || modelingTableIds.size;
  const kpiRelationCount = tables.length > 0
    ? defaultRelationships.length + initialColumnMappings.length
    : 0;
  const kpiColumnTotal = tables.reduce((sum, t) => sum + (t.columnCount || 0), 0);

  const modelKpis = useMemo<ModelKpis>(() => ({
    // No clean project-level model-health / cost($/mo) / DQ% source today →
    // honest "—" rather than inventing them (spec: never fake).
    modelHealth: undefined,
    // Data-first: while the catalog fetch is in flight a bare 0 would be a
    // fabricated value (the model may well have tables) → "—" until data
    // lands; a real post-load 0 still renders as 0.
    tables: { count: isLoadingTables && kpiTableCount === 0 ? undefined : kpiTableCount },
    relations: { count: isLoadingTables && kpiTableCount === 0 ? undefined : kpiRelationCount },
    // Columns lazy-load per table; a 0 sum on a populated model means "not loaded
    // yet", so show "—" rather than a misleading 0.
    columns: { count: kpiColumnTotal > 0 ? kpiColumnTotal : undefined },
    dataQuality: undefined,
    piiRisk: piiLevel ? { level: piiLevel } : undefined,
    costImpact: undefined,
    releaseReadiness: {
      status: deployBlockers > 0
        ? 'Blocked'
        : displayablePendingEvents.length > 0
          ? 'On track'
          : undefined,
    },
  }), [kpiTableCount, kpiRelationCount, kpiColumnTotal, piiLevel, deployBlockers, displayablePendingEvents.length, isLoadingTables]);

  // Server release-state (GET /explore-design/{id}/release-state): the full
  // 12-state machine + per-axis signals, SSE-refreshed. Degrades to null/derived
  // on 404 (endpoint not deployed yet) — local heuristics below take over.
  const { state: releaseServerState, degraded: releaseDegraded } =
    useReleaseState(selectedProjectId);

  // Deploy button state — server truth first (full lifecycle incl. approval /
  // deployed / failed phases the page can't source locally); the local
  // pendingChanges+blockers heuristic is the degraded fallback.
  const deployState = useMemo<DeployState>(() => {
    if (releaseServerState && !releaseDegraded) {
      const map: Record<ReleaseStatus, DeployState> = {
        no_changes: 'no-changes',
        draft_changes: 'draft',
        checks_not_run: 'checks-not-run',
        blocked: 'blocked',
        ready_for_approval: 'ready-not-approved',
        awaiting_approval: 'awaiting-approval',
        approved: 'approved',
        deploying: 'approved',
        deployed: 'deployed',
        verified: 'deployed',
        failed: 'failed',
        rolled_back: 'failed',
      };
      return map[releaseServerState.status] ?? 'draft';
    }
    return deriveDeployState({
      pendingChanges: displayablePendingEvents.length,
      blockers: deployBlockers,
    });
  }, [releaseServerState, releaseDegraded, displayablePendingEvents.length, deployBlockers]);

  // Per-tab colour dots on the collapsed rail — local heuristics first, then the
  // server release-state axis_signals overlay them (server truth wins where it
  // has a non-grey signal). Keyed by the current RightBarTab union.
  const rightBarSeverity = useMemo<Partial<Record<RightBarTab, RailSeverity>>>(() => {
    const sev: Partial<Record<RightBarTab, RailSeverity>> = {};
    sev.deploy = deployBlockers > 0
      ? 'blocker'
      : displayablePendingEvents.length > 0
        ? 'pending'
        : 'idle';
    if (piiLevel === 'High') sev.governance = 'blocker';
    else if (piiLevel === 'Medium') sev.governance = 'warn';
    if (displayablePendingEvents.length > 0) sev.history = 'pending';

    const signals = releaseServerState?.axis_signals;
    if (signals) {
      const toRail: Record<AxisSignal, RailSeverity> = {
        green: 'ok', orange: 'warn', red: 'blocker', blue: 'pending', grey: 'idle',
      };
      // Axis → right-bar tab homes (grey = "no signal source" → keep local value).
      const homes: Array<[keyof NonNullable<typeof signals>, RightBarTab]> = [
        ['data_quality', 'quality'],
        ['governance', 'governance'],
        ['impact_cost', 'cost'],
        ['release', 'deploy'],
        ['history', 'history'],
      ];
      for (const [axis, tab] of homes) {
        const s = signals[axis];
        if (s && s !== 'grey') sev[tab] = toRail[s];
      }
    }
    return sev;
  }, [deployBlockers, displayablePendingEvents.length, piiLevel, releaseServerState]);

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
          // Select the first db ONLY — do NOT fan getSchemas across EVERY database.
          // That fan-out (one getSchemas per db, then getTables per (db,schema), then
          // getTableColumns per table) ran on project open over the user's no-retry
          // connection — the cause of the "project display so long" + a cursor-race
          // amplifier. The loadSchemas effect (keyed on selectedDatabase) loads the
          // selected db's schemas into the picker; schema/table loading is user-driven
          // from the restored CompactSourceSelector.
          setSelectedDatabase(prev => prev || dbList[0]);
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

  // Load masking policies — DEFERRED off the initial critical path. The
  // /masking/batch-details call is ~1.4s and masking is only needed once the
  // user opens the policies/security section, so loading it during project-open
  // made the catalog "display too long". Fire it after the first paint settles.
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
    const t = setTimeout(loadMaskingPolicies, 2500);
    return () => clearTimeout(t);
  }, []);

  // Load DWH template tables from hardcoded DDL — only when DWH template chosen
  const [defaultModelingTablesLoaded, setDefaultModelingTablesLoaded] = useState(false);

  // Rehydrate the saved model. PUT /erd persisted tables + relationships, but
  // nothing ever called GET /erd — so every project reopened with an empty canvas
  // and the work looked lost ("no real modeling"). Load it once per project, and
  // only ADD: never clobber tables the user has already put on the canvas.
  const [erdRehydratedFor, setErdRehydratedFor] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedProjectId || erdRehydratedFor === selectedProjectId) return;
    let cancelled = false;
    (async () => {
      try {
        const layout: any = await getERDLayout(selectedProjectId);
        if (cancelled) return;
        const saved = Array.isArray(layout?.tables) ? layout.tables : [];
        if (saved.length === 0) return;

        const savedTables: TableItem[] = saved
          .filter((t: any) => t?.id && t?.table)
          .map((t: any): TableItem => ({
            // Real TableItem shape — the canvas node reads `table` for its title
            // and the catalog loader dedups on `id`. (The old `{name, rowCount}`
            // shape wasn't a TableItem at all; it only went unnoticed because
            // these entries used to be clobbered before they could render.)
            id: String(t.id),
            database: String(t.database ?? ''),
            schema: String(t.schema ?? ''),
            table: String(t.table),
            columnCount: 0,
            hasPrimaryKey: false,
            status: 'configured',
          }));

        setTables((prev) => {
          const seen = new Set(prev.map((t: any) => t.id));
          return [...prev, ...savedTables.filter((t: any) => !seen.has(t.id))];
        });
        setModelingTableIds((prev) => {
          const merged = new Set(prev);
          savedTables.forEach((t: any) => merged.add(t.id));
          return merged;
        });

        // The API speaks source_/target_; the canvas draws child_/parent_.
        // Without this translation the tables appeared but no edges did.
        const savedRels = (Array.isArray(layout?.relationships) ? layout.relationships : [])
          .filter((r: any) => r?.source_table && r?.target_table)
          .map((r: any) => {
            const [, srcSchema = '', srcTable = ''] = String(r.source_table).split('.');
            const [, tgtSchema = '', tgtTable = ''] = String(r.target_table).split('.');
            return {
              constraint_name: String(r.relationship_id ?? `${srcTable}_${r.source_column}_fk`),
              child_schema: srcSchema,
              child_table: srcTable,
              child_column: String(r.source_column ?? ''),
              parent_schema: tgtSchema,
              parent_table: tgtTable,
              parent_column: String(r.target_column ?? ''),
            };
          });
        if (savedRels.length > 0) {
          setDefaultRelationships((prev) => {
            const seen = new Set(prev.map((r: any) =>
              `${r.child_table}.${r.child_column}->${r.parent_table}.${r.parent_column}`));
            return [...prev, ...savedRels.filter((r: any) =>
              !seen.has(`${r.child_table}.${r.child_column}->${r.parent_table}.${r.parent_column}`))];
          });
        }
      } catch {
        /* an unsaved or unreadable ERD must not block the page */
      } finally {
        if (!cancelled) setErdRehydratedFor(selectedProjectId);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedProjectId, erdRehydratedFor]);
  // Loading/error UI for the default DWH (target) model load in Modeling view
  const [isLoadingModelingTables, setIsLoadingModelingTables] = useState(false);
  // Guards the "no DWH target → open picker" prompt so it fires once per project (no modal loop).
  const targetPromptRef = useRef<string | null>(null);

  useEffect(() => {
    // Only load when in modeling view AND DWH template was chosen
    if (viewMode !== 'modeling' || modelingChoice !== 'dwh_template') return;
    // Skip if already loaded and tables exist
    if (defaultModelingTablesLoaded && tables.some(t => targetTableIds.has(t.id))) return;
    // Need a target location. If none is set (new project, or a restored choice with no
    // saved location), OPEN the location picker once instead of silently doing nothing —
    // a silent return here = zero TABLE_CREATED events = Deploy creates no real DWH tables.
    if (!dwhTargetDatabase || !dwhTargetSchema) {
      if (selectedProjectId && targetPromptRef.current !== selectedProjectId) {
        targetPromptRef.current = selectedProjectId;
        setShowLocationPicker(true);
      }
      return;
    }

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
      return;
    }
    // Load schemas for the SELECTED database. R2 removed the old all-databases
    // fan-out that used to populate this; this single-DB loader is now what fills
    // the source picker AND makes the Catalog show tables. It was previously
    // short-circuited by an early `return` → empty Catalog ("No tables loaded").
    let cancelled = false;
    const loadSchemas = async () => {
      setIsLoadingSchemas(true);
      setCatalogLoadError(null);
      try {
        const schemaList = await getSchemas(selectedDatabase);
        if (cancelled) return;
        setSchemas(schemaList || []);
        if (schemaList && schemaList.length > 0) {
          // Auto-select the first non-system schema so tables render immediately
          // (one schema, not a fan-out). The user adds more via the source picker.
          const firstSchema = schemaList.find((s: string) => !/^INFORMATION_SCHEMA$/i.test(s)) || schemaList[0];
          setSelectedSchemas(new Map([[firstSchema, selectedDatabase]]));
        } else {
          setSelectedSchemas(new Map());
        }
      } catch (error) {
        if (cancelled) return;
        console.error('[Explore-Design] Failed to load schemas:', error);
        setCatalogLoadError('Failed to load schemas. Check your connection and retry.');
        toast.error('Failed to load schemas');
      } finally {
        if (!cancelled) setIsLoadingSchemas(false);
      }
    };
    loadSchemas();
    return () => { cancelled = true; };
    // refreshTrigger included so the catalog "Retry" button (which bumps it) also
    // re-runs a failed schema load, not just the table load.
  }, [selectedDatabase, refreshTrigger]);

  // Load tables when schemas are selected
  useEffect(() => {
    if (selectedSchemas.size === 0) {
      // Keep default DWH tables (targetTableIds) AND tables on the modeling
      // canvas (the GET /erd rehydrated model) — only remove browse-catalog tables
      setTables(prev => prev.filter(t => targetTableIds.has(t.id) || modelingTableIdsRef.current.has(t.id)));
      return;
    }

    let cancelled = false;
    const loadTables = async () => {
      setIsLoadingTables(true);
      setCatalogLoadError(null);
      try {
        const newTables: TableItem[] = [];

        // Fetch each schema's table list concurrently — the per-schema reads are
        // independent (one doesn't consume another's result), so wait for max(...)
        // not sum(...). allSettled keeps one slow/failed schema from blocking the
        // rest; results stay in schema order to preserve the prior list ordering.
        const schemaEntries = Array.from(selectedSchemas.entries());
        const tableListResults = await Promise.allSettled(
          schemaEntries.map(([schemaName, dbName]) => getTables(dbName, schemaName)),
        );
        // Guard fast project/schema switches: a stale in-flight load must not
        // clobber the newer selection's table list.
        if (cancelled) return;
        // Preserve the prior error semantics: a failed schema read used to throw
        // into the outer catch and surface catalogLoadError. With allSettled the
        // healthy schemas still render, but if any rejected we keep that signal
        // visible (never let a failed fetch masquerade as "fewer tables").
        const anyRejected = tableListResults.some((r) => r.status === 'rejected');
        if (anyRejected) {
          setCatalogLoadError('Some schemas failed to load tables. Check your connection and retry.');
        }
        schemaEntries.forEach(([schemaName, dbName], i) => {
          const r = tableListResults[i];
          const tableList = r.status === 'fulfilled' ? r.value : null;
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
        });

        // Merge with existing tables: keep target/DWH tables AND modeling-canvas
        // tables, add new schema tables. P1 root cause: this replacement used to
        // preserve ONLY targetTableIds, silently evicting the GET /erd rehydrated
        // model tables whenever the event-derived schema selection didn't include
        // the model's schema — the saved model then painted zero nodes and its
        // relationships failed the both-ends-exist check.
        setTables(prev => {
          // Keep existing target/DWH tables + tables on the modeling canvas
          const keptTables = prev.filter(t => targetTableIds.has(t.id) || modelingTableIdsRef.current.has(t.id));
          // Get IDs of tables we're adding
          const newTableIds = new Set(newTables.map(t => t.id));
          // Filter out any kept tables that are also in newTables (avoid duplicates)
          const uniqueKeptTables = keptTables.filter(t => !newTableIds.has(t.id));
          // Combine: kept tables + new schema tables
          return [...uniqueKeptTables, ...newTables];
        });
        // Expand using DB.SCHEMA keys to match VirtualizedTableList grouping
        const expandKeys = new Set<string>();
        for (const [schemaName, dbName] of Array.from(selectedSchemas.entries())) {
          expandKeys.add(`${dbName}.${schemaName}`);
        }
        setExpandedSchemas(expandKeys);

        // NOTE: columns are intentionally NOT fetched here. Eagerly loading
        // getTableColumns for EVERY table in the schema (13+ cold calls over a
        // no-retry connection, serialised on the single local Snowflake conn)
        // used to run inside this try — and because `isLoadingTables` only
        // cleared in the `finally` AFTER `await Promise.all(columnsPromises)`,
        // the picker (gated on isLoadingTables) stayed frozen on "Loading
        // tables…" until every column fetch resolved, even though the table
        // LIST (setTables above) was already in hand. The list needs no column
        // data (columnCount stays 0 in the list view). Columns now load lazily:
        // per clicked table (selectedTable effect) and, in the background, for
        // tables actually on the modeling canvas / selected for a bulk action
        // (the hydrate-columns effect below). This decouples the browse path
        // from the slow per-table column reads.
      } catch (error) {
        if (cancelled) return;
        setCatalogLoadError('Failed to load tables. Check your connection and retry.');
        toast.error('Failed to load tables');
      } finally {
        if (!cancelled) setIsLoadingTables(false);
      }
    };
    loadTables();
    return () => { cancelled = true; };
  }, [selectedDatabase, selectedSchemas, allTableConfigs, refreshTrigger, targetTableIds]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lazily hydrate columns for the tables the user actually works with — those
  // on the modeling canvas (nodes render their fields) or checkbox-selected for
  // a bulk action / relationship pick. This REPLACES the old eager "fetch every
  // schema table's columns on open" storm that froze the picker. Non-blocking:
  // the table list is already rendered; these fill tableColumnsMap in the
  // background so the ModelingCanvas nodes, RelationshipModal target-column
  // picker, and the bulk PK/masking handlers have their columns. Idempotent —
  // only ids missing from the map are fetched, so once populated a re-run
  // computes an empty `toLoad`, updates no state, and can't loop.
  useEffect(() => {
    const wanted = new Set<string>([
      ...Array.from(modelingTableIds),
      ...Array.from(selectedTables),
    ]);
    const toLoad = Array.from(wanted).filter(
      id => !tableColumnsMap.has(id) && tables.some(t => t.id === id),
    );
    if (toLoad.length === 0) return;

    let cancelled = false;
    (async () => {
      const results = await Promise.all(
        toLoad.map(async (id) => {
          const table = tables.find(t => t.id === id);
          if (!table) return null;
          try {
            const cols = await getTableColumns(table.database, table.schema, table.table);
            if (!cols || cols.length === 0) return null;
            const formattedColumns: ColumnInfo[] = cols.map((col: any) => ({
              name: col.name || col.COLUMN_NAME || col.column_name || 'unknown',
              dataType: col.data_type || col.type || col.DATA_TYPE || col.dataType || 'VARCHAR',
              isNullable:
                col.isNull === 'Y' || col.is_nullable === 'YES' ||
                col.IS_NULLABLE === 'YES' || col.isNullable !== false,
              isPrimaryKey:
                col.isPk === 'Y' || col.is_primary_key === true ||
                col.IS_PRIMARY_KEY === 'Y' || col.isPrimaryKey === true,
              isSensitive: false,
            }));
            return { id, columns: formattedColumns };
          } catch (err) {
            console.error(`[Explore-Design] Lazy column load failed for ${id}:`, err);
            return null;
          }
        }),
      );
      if (cancelled) return;
      const loaded = results.filter(Boolean) as { id: string; columns: ColumnInfo[] }[];
      if (loaded.length === 0) return;
      setTableColumnsMap(prev => {
        const next = new Map(prev);
        loaded.forEach(r => next.set(r.id, r.columns));
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [modelingTableIds, selectedTables, tables, tableColumnsMap]);

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
            toast.error('Query timed out');
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
  // Entering modeling with nothing selected: open the right cockpit so the model
  // overview is visible without a click (it replaces the bare empty canvas). The
  // user can still collapse it to the w-12 mini-rail to reclaim canvas width.
  useEffect(() => {
    if (viewMode === 'modeling') setRightBarOpen(true);
  }, [viewMode]);
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
    // Selecting a table lands the unified right bar on its Actions tab (T1 spec):
    // one click → one bar, focused on the table's actions. Consistent across the
    // catalog list and the modeling canvas (both route user clicks through here).
    setActiveRightTab('actions');
    // Keep the Source Tables rail PINNED on select. It used to auto-collapse here,
    // which hid the source selection the instant you clicked a table on the canvas
    // ("on la voit plus") — and modeling had no re-open toggle. The user closes it
    // manually via the panel toggle (and can re-open it from the modeling rail).
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
      setErdRehydratedFor(null);
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
      // Probe the saved ERD snapshot in parallel. When a project HAS a saved
      // model (GET /erd returns tables), that snapshot — not the event
      // history — is the source of truth for the canvas: listEvents returns a
      // recency WINDOW of an append-only spine, so replaying it can resurrect
      // tables/FKs from long-abandoned experiments that the current model no
      // longer contains. The event-replay reconstruction below stays as the
      // fallback for projects that predate ERD persistence.
      const erdHasSavedModelPromise = getERDLayout(projectId)
        .then((l) => Array.isArray(l?.tables) && l.tables.length > 0)
        .catch(() => false);

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

      // Show loading toast while restoring project context. Stable id so a
      // re-entrant restore (URL effect + auto-select can both fire) REPLACES
      // the toast instead of stacking a duplicate "Restoring project context…".
      // bottom-right: the default top-center slot sits ON the global search
      // bar for seconds on every project open (UX audit 2026-07-11).
      const loadingToast = toast.loading(`Restoring project context...`, { id: 'restore-project-ctx', position: 'bottom-right' });

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

        // Load DDL actions from backend (for awareness / logging only).
        // Result is discarded (events stay pending — DDL execution happens later
        // in the deployment modal), so fire it WITHOUT awaiting: it overlaps the
        // schema-restore waterfall below instead of serializing in front of it.
        void listDDLActions(projectId)
          .then((ddlResponse) => {
            void (ddlResponse.actions || []); // loaded for awareness only
          })
          .catch((ddlErr) => {
            console.warn('[handleProjectSelect] Failed to load DDL actions:', ddlErr);
          });

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

            // Snapshot-authoritative gate: when the project has a saved ERD
            // model, tables INFERRED from COLUMN_MAPPING events and FKs replayed
            // from the event window must not (re)populate the canvas — the
            // rehydration effect paints the real model, and the stale inference
            // is exactly what used to resurrect dead-schema tables and draw
            // phantom/self edges next to it. TABLE_CREATED restoration is left
            // untouched: user-created tables must survive a reopen either way.
            const erdHasSavedModel = await erdHasSavedModelPromise;
            if (erdHasSavedModel) {
              mappingTableIds.clear();
            }

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

            // Apply restored FK relationships (event-window replay — only when
            // no saved ERD model exists; the snapshot already carries the real
            // relationships and stale replayed FKs would stack phantom edges)
            if (!erdHasSavedModel && restoredFkRelationships.length > 0) {
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

            toast.dismiss(loadingToast);
            // No success toast for a routine project load — the header project
            // selector + populated panels ARE the feedback. The old top-center
            // "Loaded N events…" toast covered the global search bar on every
            // project open (UX audit 2026-07-11). Errors below still toast.
          } catch (schemaError) {
            console.error('Failed to load schemas for restored database:', schemaError);
            toast.dismiss(loadingToast);
          }
        } else {
          toast.dismiss(loadingToast);
          // No schema/database info from events — auto-select first available database
          if (databases.length > 0 && !selectedDatabase) {
            const defaultDb = databases[0];
            setSelectedDatabase(defaultDb);
          }
          if (backendEvents.length === 0) {
            // Actionable guidance (not a routine-success toast): a project with
            // no saved work needs the user to pick a database next.
            toast.success(`Project "${projectName}" selected — choose a database to start`);
          }
        }
      } catch (error) {
        console.error('❌ Error loading project events:', error);
        toast.dismiss(loadingToast);
        // Initialize with empty events if load fails
        await loadProjectEvents({ projectId, events: [] });
        // Honest error copy — the old message ("Project selected") read as a
        // success inside a red error toast.
        toast.error(`Couldn't load saved work for "${projectName}" — starting empty`);
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

  // Apply a LOCAL AI suggestion's action CTA to the canvas event store.
  // Class A (local) only: these dispatch a `eventType`+`payload` into the draft
  // event store — there is no backend route, so NO 404/501 gate applies. Honesty
  // here = the click visibly queues a real, undoable event; otherwise we must NOT
  // claim "Applied". Two analyzer actions (rename, FK) carry no resolvable source
  // table in their payload and FK uses singular keys the event validator rejects,
  // so they cannot produce a real targeted event from the action alone — we fail
  // honestly (info toast, no "Applied") rather than queue a silent no-op.
  const handleAiSuggestionAction = useCallback((suggestion: AiSuggestion) => {
    const action = suggestion.action;
    if (!action || !action.eventType) {
      toast('This suggestion is advisory only.', { icon: 'ℹ️' });
      return;
    }
    if (isReadOnly) {
      toast.error('You have view-only access to this project');
      return;
    }
    if (!selectedProjectId) {
      toast.error('Select a project first');
      return;
    }

    const payload = action.payload ?? {};
    // Resolve a full {database, schema, table} target from the bare table name
    // the analyzer carries — reuse the existing tables-by-name lookup pattern.
    const tableName: string | undefined = payload.table;
    const resolved = tableName ? tables.find(t => t.table === tableName) : undefined;
    const target = resolved
      ? { database: resolved.database, schema: resolved.schema, table: resolved.table }
      : undefined;

    let newId: string | null = null;

    switch (action.eventType) {
      case 'MASKING_POLICY_APPLIED': {
        // Analyzer payload is {columnName, table, policyType} — normalize to the
        // {policyName, columns[]} shape the masking event validator + deploy SQL
        // gen require. We ALSO carry `columnName` so the masking analyzer (which
        // builds its already-masked set from payload.columnName) recognizes this
        // event on the next re-analysis and resolves the suggestion instead of
        // re-surfacing it as if nothing happened. Extra field is inert to SQL gen.
        const columnName: string | undefined = payload.columnName;
        if (!target || !columnName) break;
        const policyName = `AUTO_MASK_${(payload.policyType || 'SHA256')}`.toUpperCase();
        const base = createMaskingPolicyEvent(target, policyName, [columnName], true);
        newId = addEvent({
          ...base,
          payload: { ...base.payload, columnName },
          projectId: selectedProjectId,
        });
        break;
      }
      case 'INGESTION_MODE_SET': {
        const mode = payload.mode;
        if (!target || !mode) break;
        newId = addEvent({
          ...createIngestionModeEvent(target, mode),
          projectId: selectedProjectId,
        });
        break;
      }
      case 'SCD_CONFIGURED': {
        const scdType = payload.scdType;
        if (!target || !scdType) break;
        newId = addEvent({
          type: 'SCD_CONFIGURED',
          projectId: selectedProjectId,
          target,
          payload: { scdType },
        });
        break;
      }
      default:
        // TABLE_RENAMED, FOREIGN_KEY_ADDED, DRY_RUN, etc. — no honest local
        // dispatch is possible from the suggestion payload alone. Do NOT fake it.
        toast('Open the table actions to apply this change.', { icon: 'ℹ️' });
        return;
    }

    if (newId) {
      markAiSuggestionApplied(suggestion);
      toast.success(`Applied "${action.label}" to canvas`);
    } else {
      // Either the target table is no longer in the catalog, or the event store
      // deduped/rejected it. Be honest — never show "Applied" for a no-op.
      toast.error(`Couldn't apply "${action.label}" — open the table actions instead`);
    }
  }, [isReadOnly, selectedProjectId, tables, addEvent, markAiSuggestionApplied]);

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
    markScratchStarted();
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

  // Adding any table IS the "start from scratch" choice — commit it so the
  // Start-Modeling onboarding gate never re-appears over a populated canvas
  // (and survives a reload via the per-project cache).
  const markScratchStarted = useCallback(() => {
    if (modelingChoice) return;
    setModelingChoice('scratch');
    if (selectedProjectId) {
      modelingChoicesByProject.current.set(selectedProjectId, { choice: 'scratch' });
    }
  }, [modelingChoice, selectedProjectId]);

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

  // Canvas "+ Add table" — 'manual' reuses the standard CreateTableModal flow
  // (define columns by hand, Power BI style); 'empty' drops a blank draft table
  // straight onto the canvas so it lands in the model first, then gets fed from
  // sources. Both keep the select -> add-to-modeling -> configure-ingestion flow.
  const handleAddTableFromCanvas = useCallback((mode: 'manual' | 'empty') => {
    if (readOnlyGuard()) return;
    if (!selectedProjectId) { toast.error('Select a project first'); return; }

    // Both modes need somewhere for the table to live. If no DWH target is set
    // (e.g. a "from scratch" model), open the location picker first instead of
    // dead-ending on a toast — also keeps created tables out of an empty schema.
    const db = dwhTargetDatabase || selectedDatabase || '';
    const schema = dwhTargetSchema || '';
    if (!db || !schema) {
      toast('Pick where new tables should live first', { icon: '📍' });
      setShowLocationPicker(true);
      return;
    }

    if (mode === 'manual') {
      setCreateTableType('standard');
      setShowCreateTableModal(true);
      return;
    }

    // 'empty' — blank table to be populated by source mappings.
    let n = 1;
    while (tables.some(t => t.id === `${db}.${schema}.NEW_TABLE_${n}`)) n += 1;
    const tableName = `NEW_TABLE_${n}`;
    const tableId = `${db}.${schema}.${tableName}`;
    const newTable: TableItem = {
      id: tableId,
      database: db,
      schema,
      table: tableName,
      columnCount: 0,
      hasPrimaryKey: false,
      status: 'pending',
      sensitiveColumns: 0,
    };
    markScratchStarted();
    setTables(prev => (prev.some(t => t.id === tableId) ? prev : [...prev, newTable]));
    setTargetTableIds(prev => { const next = new Set(prev); next.add(tableId); return next; });
    setModelingTableIds(prev => { const next = new Set(prev); next.add(tableId); return next; });
    setTableColumnsMap(prev => { const next = new Map(prev); next.set(tableId, []); return next; });
    addEvent({
      type: 'TABLE_CREATED',
      projectId: selectedProjectId || undefined,
      target: { database: db, schema, table: tableName },
      payload: { tableId, tableName, mode: 'empty', columns: 0 },
    });
    setSelectedTable(newTable);
    handleOpenContextBar(newTable);
    toast.success(`Empty table "${tableName}" added — feed it from sources`);
  }, [readOnlyGuard, selectedProjectId, dwhTargetDatabase, selectedDatabase, dwhTargetSchema, tables, addEvent, handleOpenContextBar]);

  // A Data-Engineering create (dynamic / hybrid / event / stream) produces a
  // LIVE object in the warehouse. Inject it into the modeling canvas with its
  // REAL columns (so it can immediately be mapped / PK'd / ingested), select it,
  // and switch to the modeling view so the user actually SEES the result.
  const injectCreatedTable = useCallback(async (created: { database?: string; schema?: string; table: string }) => {
    const db = created.database || dwhTargetDatabase || selectedDatabase || '';
    const schema = created.schema || dwhTargetSchema || '';
    if (!db || !schema || !created.table) {
      // Location unknown — fall back to a source reload so it isn't lost.
      setRefreshTrigger(prev => prev + 1);
      return;
    }
    const tableId = `${db}.${schema}.${created.table}`;
    const newTable: TableItem = {
      id: tableId, database: db, schema, table: created.table,
      columnCount: 0, hasPrimaryKey: false, status: 'configured', sensitiveColumns: 0,
    };
    markScratchStarted();
    setTables(prev => (prev.some(t => t.id === tableId) ? prev : [...prev, newTable]));
    setTargetTableIds(prev => { const next = new Set(prev); next.add(tableId); return next; });
    setModelingTableIds(prev => { const next = new Set(prev); next.add(tableId); return next; });
    setViewMode('modeling');
    setSelectedTable(newTable);
    // Pull the live object's real columns so the node is immediately mappable.
    try {
      const columns = await getTableColumns(db, schema, created.table);
      if (columns && columns.length > 0) {
        const formatted: ColumnInfo[] = columns.map((col: any) => ({
          name: col.name || col.COLUMN_NAME || col.column_name || 'unknown',
          dataType: col.data_type || col.type || col.DATA_TYPE || 'VARCHAR',
          isPrimaryKey: col.isPk === 'Y' || col.isPk === true || col.is_primary_key === true || col.IS_PRIMARY_KEY === 'Y',
          isNullable: col.isNull === 'Y' || col.is_nullable === 'YES' || col.IS_NULLABLE === 'YES',
          isSensitive: detectSensitiveColumn(col.name || col.COLUMN_NAME || col.column_name || ''),
        }));
        setTableColumnsMap(prev => { const next = new Map(prev); next.set(tableId, formatted); return next; });
        setTables(prev => prev.map(t => t.id === tableId
          ? { ...t, columnCount: formatted.length, hasPrimaryKey: formatted.some(f => f.isPrimaryKey) }
          : t));
      }
    } catch {
      // Columns lazy-load when the node is opened; non-fatal.
    }
    toast.success(`${created.table} added to the model`);
  }, [dwhTargetDatabase, selectedDatabase, dwhTargetSchema]);

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
        // Honest render: when the backend omits a confidence/score, keep it null
        // so the UI shows nothing rather than fabricating a 0.85 figure (the
        // Confidence badge is guarded by `!= null`).
        confidence: c.confidence ?? c.score ?? null,
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
        const errMsg = toMessage(err, 'AI classification failed');
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
      // Backend requires top-level database+schema and tables as string names.
      // Use the first table as the db/schema anchor (backend processes one scope
      // per call); all selected tables are filtered by name within that scope.
      const anchor = tables[0];
      const result = await discoverRelationships(selectedProjectId, {
        database: anchor.database,
        schema: anchor.schema,
        tables: tables.map(t => t.table),
      });
      toast.dismiss(toastId);
      const count = result?.relationships?.length || 0;
      toast.success(`Discovered ${count} potential relationships`);
    } catch (err: any) {
      toast.dismiss(toastId);
      toast.error(toServiceError(err, 'Relationship discovery failed').message);
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
      toast.error(toMessage(err, `Failed to list ${type.replace('_', ' ')}`));
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
      toast.error(toServiceError(err, `${action} failed`).message);
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
      toast.error(toServiceError(err, 'drop failed').message);
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
        // Action-RBAC gate: schema clone issues CREATE DDL. A denied role must
        // not be able to trigger it (replaces the old viewer-only check).
        if (!canCreateObjects) {
          toast.error(createDeniedReason);
          break;
        }
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
  }, [handleListDataEngObjects, selectedDatabase, canCreateObjects, createDeniedReason]);

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

  // ── Deploy tab body (docked, no modal) ──
  // The 8-step deployment stepper now lives INSIDE the right-bar "Deploy" tab as
  // an embedded stepper (redesign R1/R2 — match the workflow module's
  // deploy-in-a-tab). This node is injected into ContextRightBar via
  // `deployOverride` for both the catalog and modeling views. Permission gating
  // and the event-store-seeded DeploymentValidation logic are unchanged — only
  // the host (modal → docked panel) differs. We intentionally pass no `onClose`
  // so the embedded stepper stays put (no auto-close on verify success).
  const deployTabNode = (
    <ErrorBoundary>
      {selectedProjectId ? (
        <div className="space-y-4">
          {/* Deployed truth FIRST (user directive): once a model is deployed the
              Release axis must show what is LIVE — execution record, deployed
              objects w/ live row counts where cheap, DE objects of the target
              schema, schedule state — not just the pipeline. Skeletons until
              data lands; honest "Never deployed" empty for fresh projects. */}
          <DeployedProduction projectId={selectedProjectId} />

          {/* Primary Release experience — the 7-step in-panel flow (Changes →
              Readiness → Impact → Approval → Deploy → Verify → Recovery). It
              reads freely and gates its own mutations per step; the whole-tab
              PermissionGate now protects only the legacy stepper below. */}
          <ReleasePanel projectId={selectedProjectId} />

          {/* Legacy technical stepper — kept reachable (its execute spine is
              battle-proven) but collapsed so the Release flow has ONE deploy
              CTA (spec §4: no double deploy button). */}
          <details className="rounded-xl border border-slate-200 dark:border-slate-700">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
              Classic deployment stepper (technical view)
            </summary>
            <div className="border-t border-slate-200 p-3 dark:border-slate-700">
              <PermissionGate
                module="explore_design"
                action="deploy"
                projectId={selectedProjectId}
                title="Deployment restricted"
                description="You don't have the &quot;deploy&quot; permission on Explore &amp; Design. Applying changes to the data warehouse requires an administrator to grant deploy access."
              >
                <DeploymentValidation
                  embedded
                  database={selectedDatabase}
                  schemas={schemaKeys}
                  projectId={selectedProjectId}
                />
              </PermissionGate>
            </div>
          </details>
        </div>
      ) : (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center text-slate-400">
          <Rocket className="mb-3 h-8 w-8 text-slate-300" />
          <p className="text-sm font-medium">Select a project to deploy</p>
          <p className="mt-1 text-xs">Choose a project, then your pending changes appear here for review &amp; deploy.</p>
        </div>
      )}
    </ErrorBoundary>
  );

  return (
    <ErrorBoundary>
    <ChunkErrorProbe enabled={forceChunkError} />
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
            {/* Project identity — icon + product/technical chip + free tags
                editable inline (no popup). Self-fetches its project row. */}
            {selectedProjectId && (
              <ProjectIdentityChips
                projectId={selectedProjectId}
                readOnly={isReadOnly}
                className="max-w-[360px]"
              />
            )}
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
                  // No popup — go straight to the ReactFlow canvas; the inline
                  // onboarding panel (DWH template / scratch) shows on the canvas
                  // itself when no template choice has been made yet.
                  setViewMode('modeling');
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
            <AdnHeaderBadge projectId={selectedProjectId} />
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

            {/* Cross-page governed access — grant/revoke roles for this page. */}
            <ManageAccessButton module="explore-design" page="explore-design" iconOnly objectLabel="Explore & Design" />

            {/* Primary action: Deploy — the state-machine button whose label +
                variant morph by project lifecycle (redesign spec §3). Keeps ALL
                the legacy guards (read-only / no-project / conflict-check) in its
                onClick; the state's own disabled phases are additive on top. */}
            <DeployStateButton
              state={deployState}
              disabled={!selectedProjectId || isReadOnly}
              changeCount={displayablePendingEvents.length}
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
            />

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
          aria-label="Change approach"
          className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setShowApproachFork(false);
          }}
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5 dark:border-slate-700">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Change how you build this data model
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Switch to AI to scaffold from a description, apply the DWH
                template, or keep modeling manually.
              </p>
            </div>
            <button
              type="button"
              aria-label="Close"
              autoFocus
              onClick={() => setShowApproachFork(false)}
              className="shrink-0 rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-5">
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

      {/* Compact Source Selector — DB/schema picker (restores source+data selection).
          Was hard-disabled by `false &&`; the auto-load that "replaced" it left the
          Catalog/Modeling panes with no way to pick a source → "No tables loaded". */}
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
          isLoadingTables={isLoadingTables}
          stats={stats}
          projectId={selectedProjectId}
        />
      )}

      {/* Top KPI strip (redesign Wave A / mockup 01) — one row below the header,
          above the workspace, covering BOTH catalog + modeling views. Props-
          driven; unsourced values render "—" (never fake 0s). */}
      {!isFullscreen && selectedProjectId && (
        <ModelKpiStrip kpis={modelKpis} />
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
            project is selected so the empty state above can take full space.
            Now ALSO shown in modeling view: a source-selection rail to inject
            source tables into the React-Flow model (select → "Add to Modeling"),
            harmonizing modeling with catalog (Power-BI-Desktop style). */}
        {selectedProjectId && showSidebar && (viewMode === 'catalog' || viewMode === 'modeling') && (() => {
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
                  {isLoadingTables && catalogTables.length === 0 ? (
                    // Data-first: no fake "0" while the fetch is in flight.
                    <span className="h-4 w-6 animate-pulse rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
                  ) : (
                    <Badge className="bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-[10px] px-1.5 py-0 font-medium">
                      {catalogTables.length}
                    </Badge>
                  )}
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
              ) : catalogLoadError ? (
                <div className="flex flex-col items-center justify-center h-full text-center p-6">
                  <div className="p-3 bg-rose-50 dark:bg-rose-900/20 rounded-xl mb-3">
                    <Database className="h-8 w-8 text-rose-400 dark:text-rose-500" />
                  </div>
                  <p className="font-medium text-sm text-rose-600 dark:text-rose-400">Couldn&apos;t load the catalog</p>
                  <p className="text-xs mt-1 text-slate-500 dark:text-slate-400 max-w-[220px]">
                    {catalogLoadError}
                  </p>
                  <button
                    type="button"
                    onClick={() => { setCatalogLoadError(null); setRefreshTrigger(prev => prev + 1); }}
                    className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry
                  </button>
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
                  ingestionLookup={ingestionLookup}
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
                  <Tooltip content={isReadOnly ? 'View-only access' : 'Create new object'}>
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

                {/* Right side of the toolbar — the Create button used to sit
                    alone on a full-width empty bar (orphan-button dead zone,
                    UX audit 2026-07-11). Fill it with honest context: the
                    selected table's path + a way BACK to the source map (there
                    was no visible return affordance), or a one-line hint. */}
                {selectedTable ? (
                  <>
                    <span className="ml-auto hidden truncate text-[11px] text-slate-400 md:inline" title={`${selectedTable.database}.${selectedTable.schema}.${selectedTable.table}`}>
                      {selectedTable.database}.{selectedTable.schema}.{selectedTable.table}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedTable(null)}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800 md:ml-2 ml-auto"
                    >
                      <ArrowLeft className="h-3 w-3" />
                      Back to map
                    </button>
                  </>
                ) : (
                  <span className="ml-auto hidden text-[11px] text-slate-400 sm:inline">
                    Click a table in the list — or a node on the map — to inspect it
                  </span>
                )}
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
                            <span className="text-xs text-slate-500">{safeLocale(inlineProfileData.row_count)} rows</span>
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
                          onClick={() => { if (readOnlyGuard()) return; if (!canCreateObjects) { toast.error(createDeniedReason); return; } setActiveRightTab('actions'); setFocusedAction('add_column'); if (!rightBarOpen) setRightBarOpen(true); }}
                          disabled={isReadOnly || !canCreateObjects}
                          title={!canCreateObjects ? createDeniedReason : undefined}
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
                                {safeLocale(inlinePreviewData.total_rows)} rows
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
                                      <th key={col} className="px-2.5 py-1.5 text-left whitespace-nowrap group/col">
                                        <div className="flex items-center gap-1">
                                          {colMeta?.isPrimaryKey && <Key className="h-3 w-3 text-amber-500 shrink-0" />}
                                          {colMeta?.isSensitive && <Shield className="h-3 w-3 text-red-400 shrink-0" />}
                                          {columnEdit?.column === col && columnEdit.mode === 'rename' ? (
                                            <input
                                              autoFocus
                                              defaultValue={col}
                                              onBlur={(e) => handleColumnRename(colMeta?.name ?? col, e.target.value)}
                                              onKeyDown={(e) => {
                                                if (e.key === 'Enter') handleColumnRename(colMeta?.name ?? col, (e.target as HTMLInputElement).value);
                                                else if (e.key === 'Escape') setColumnEdit(null);
                                              }}
                                              className="w-24 px-1 py-0.5 text-[11px] font-mono rounded border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                            />
                                          ) : columnEdit?.column === col && columnEdit.mode === 'retype' ? (
                                            <select
                                              autoFocus
                                              defaultValue={(colMeta?.dataType || '').split('(')[0].toUpperCase()}
                                              onBlur={() => setColumnEdit(null)}
                                              onChange={(e) => handleColumnRetype(colMeta?.name ?? col, (colMeta?.dataType || '').split('(')[0].toUpperCase(), e.target.value)}
                                              className="px-1 py-0.5 text-[11px] font-mono rounded border border-blue-300 dark:border-blue-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-400"
                                            >
                                              {COLUMN_TYPE_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                          ) : columnEdit?.column === col && columnEdit.mode === 'drop' ? (
                                            <span className="flex items-center gap-1">
                                              <span className="font-medium text-red-500">{col}?</span>
                                              <button onClick={() => handleColumnDrop(colMeta?.name ?? col)} className="px-1 rounded bg-red-500 text-white text-[9px] font-semibold hover:bg-red-600">Drop</button>
                                              <button onClick={() => setColumnEdit(null)} className="px-1 rounded bg-slate-200 dark:bg-slate-700 text-[9px] font-semibold text-slate-600 dark:text-slate-300">Cancel</button>
                                            </span>
                                          ) : (
                                            <>
                                              <span className="font-medium text-slate-600 dark:text-slate-300">{col}</span>
                                              {!isReadOnly && (
                                                <span className="inline-flex items-center gap-0.5 opacity-0 group-hover/col:opacity-100 transition-opacity">
                                                  {canEditCols && (
                                                    <>
                                                      <button title="Rename column" onClick={() => { if (readOnlyGuard()) return; setColumnEdit({ column: col, mode: 'rename', value: col, oldType: '' }); }} className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-blue-500"><Columns3 className="h-3 w-3" /></button>
                                                      <button title="Change type" onClick={() => { if (readOnlyGuard()) return; setColumnEdit({ column: col, mode: 'retype', value: '', oldType: (colMeta?.dataType || '').split('(')[0].toUpperCase() }); }} className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-blue-500"><Database className="h-3 w-3" /></button>
                                                    </>
                                                  )}
                                                  {canDropObjects && (
                                                    <button title="Drop column" onClick={() => { if (readOnlyGuard()) return; setColumnEdit({ column: col, mode: 'drop', value: '', oldType: '' }); }} className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-slate-400 hover:text-red-500"><Trash2 className="h-3 w-3" /></button>
                                                  )}
                                                </span>
                                              )}
                                            </>
                                          )}
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
                                      onClick={() => { if (readOnlyGuard()) return; if (!canCreateObjects) { toast.error(createDeniedReason); return; } setActiveRightTab('actions'); setFocusedAction('add_column'); if (!rightBarOpen) setRightBarOpen(true); }}
                                      disabled={isReadOnly || !canCreateObjects}
                                      title={!canCreateObjects ? createDeniedReason : undefined}
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
                onOpenDeployModal={() => { trackFeatureClick('deploy', { view: 'catalog', pendingEvents: displayablePendingEvents.length }); setActiveRightTab('deploy'); setRightBarOpen(true); }}
                onDeselectTable={() => { setSelectedTable(null); setRightBarOpen(false); }}
                analystSlot={selectedProjectId ? <AiChangeAnalyst projectId={selectedProjectId} /> : undefined}
                deployOverride={deployTabNode}
                ingestionTrace={selectedIngestion}
                tabSeverity={rightBarSeverity}
                emptyOverride={
                  <ModelOverview
                    tableCount={tables.length || modelingTableIds.size}
                    relationCount={tables.length > 0 ? defaultRelationships.length + initialColumnMappings.length : 0}
                    targetDwh={selectedDatabase || dwhTargetDatabase || ''}
                    projectId={selectedProjectId}
                  />
                }
              />
              </div>{/* end center+right row */}
            </>
          )}


          {viewMode === 'modeling' && (
            // Modeling View — canvas + right action cockpit (mirrors catalog).
            // Flex row: the canvas child carries `min-w-0` so it yields/reclaims
            // width when the right cockpit collapses, and `<ContextRightBar/>` is
            // a shrink-0 sibling (its own w-12 mini-rail handles the collapsed
            // state). The fullscreen header stays absolutely positioned inside
            // the canvas child.
            <div className="flex-1 overflow-hidden flex">
            <div className="flex-1 min-w-0 overflow-hidden relative">
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
                        setActiveRightTab('deploy');
                        setRightBarOpen(true);
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
              {/* Re-open the source rail when it's hidden (modeling had no toggle,
                  so a manually-hidden rail was lost). A slim left-edge handle. */}
              {!showSidebar && (
                <button
                  onClick={() => setShowSidebar(true)}
                  className="absolute left-0 top-1/2 z-20 -translate-y-1/2 flex items-center rounded-r-lg border border-l-0 border-slate-200 bg-white/95 py-3 pl-1 pr-1.5 text-slate-500 shadow-sm backdrop-blur hover:bg-white hover:text-slate-700 dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-400"
                  title="Show source tables"
                  aria-label="Show source tables"
                >
                  <PanelLeft className="h-4 w-4" />
                </button>
              )}
              {/* Inline onboarding (no popup): choose DWH template or scratch
                  directly on the canvas. Only shown for a genuinely empty,
                  not-yet-started model — never overlay a populated canvas. */}
              {!modelingChoice && modelingTableIds.size === 0 && (
                <ModelingTemplateModal
                  inline
                  isOpen
                  projectName={selectedProjectName || undefined}
                  onSelect={(choice) => {
                    if (choice === 'dwh_template') {
                      setShowLocationPicker(true);
                    } else {
                      setModelingChoice(choice);
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
              )}
              <ModelingCanvas
                tables={tables.filter(t => modelingTableIds.has(t.id))}
                tableColumns={tableColumnsMap}
                onColumnsMapUpdate={setTableColumnsMap}
                onTableSelect={handleTableClick}
                onBlankClick={() => {
                  // Spec §1: empty-canvas click with nothing selected closes the
                  // right-bar; with a selection it only clears the selection
                  // (the bar falls back to the project-overview landing).
                  if (selectedTable) {
                    setSelectedTable(null);
                  } else if (rightBarOpen) {
                    setRightBarOpen(false);
                  }
                }}
                selectedTableId={selectedTable?.id}
                onTableExclude={handleRemoveFromModeling}
                onOpenContextBar={handleOpenContextBar}
                onRegisterActionDispatch={handleRegisterActionDispatch}
                isReadOnly={isReadOnly}
                onRelationCreate={async (source, target, sourceCol, targetCol, transformation) => {
                  if (readOnlyGuard()) return;
                  // Parse table IDs to get database.schema.table components
                  const sourceParts = source.split('.');
                  const targetParts = target.split('.');

                  if (sourceParts.length !== 3 || targetParts.length !== 3) {
                    console.error('[onRelationCreate] Invalid table IDs:', { source, target });
                    // Honest failure — this path cannot persist the mapping, so
                    // never claim success ("Mapping created locally" was a lie).
                    toast.error('Mapping not saved — unrecognized table reference');
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
                onAddTable={handleAddTableFromCanvas}
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

              {/* Right action cockpit — same component as catalog, fed the
                  modeling-selected node as selectedTable. When nothing is
                  selected it shows the model overview (counts / target DWH /
                  ADN) instead of the bare empty canvas. Collapsible via its own
                  w-12 mini-rail (reuses rightBarOpen / onToggle). */}
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
                selectedSchema={selectedTable?.schema || schemas[0] || ''}
                userRole={sessionRole || (userRole as string) || undefined}
                onOpenDeployModal={() => { trackFeatureClick('deploy', { view: 'modeling', pendingEvents: displayablePendingEvents.length }); setActiveRightTab('deploy'); setRightBarOpen(true); }}
                onDeselectTable={() => { setSelectedTable(null); }}
                analystSlot={selectedProjectId ? <AiChangeAnalyst projectId={selectedProjectId} /> : undefined}
                onNodeAction={handleNodeContextAction}
                deployOverride={deployTabNode}
                ingestionTrace={selectedIngestion}
                tabSeverity={rightBarSeverity}
                emptyOverride={
                  <ModelOverview
                    // Count the tables actually present in the model (what the
                    // canvas renders) — not just the explicitly-added set, which
                    // stayed at 0 and read as "0 models" even with a full canvas.
                    // Keep relations consistent: 0 until tables exist.
                    tableCount={tables.length || modelingTableIds.size}
                    relationCount={tables.length > 0 ? defaultRelationships.length + initialColumnMappings.length : 0}
                    targetDwh={selectedDatabase || dwhTargetDatabase || ''}
                    projectId={selectedProjectId}
                  />
                }
              />
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
            <AiFeatureToggle onSuggestionAction={handleAiSuggestionAction} />
          </div>
        </div>
      )}


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
            // Hand off to the docked Deploy tab (stepper opens at Review, seeded
            // by the event store) instead of the removed deployment modal.
            setActiveRightTab('deploy');
            setRightBarOpen(true);
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
        schema={dwhTargetSchema || (schemaKeys.length === 1 ? schemaKeys[0] : '') || ''}
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
        warehouses={accountWarehouses}
        onCreated={injectCreatedTable}
      />
      <StreamModal
        isOpen={streamModal}
        onClose={() => setStreamModal(false)}
        sourceTable={selectedTable || undefined}
        onCreated={injectCreatedTable}
      />
      <AlertModal
        isOpen={alertModal}
        onClose={() => setAlertModal(false)}
        sourceTable={selectedTable || undefined}
        warehouses={accountWarehouses}
        onCreated={() => setRefreshTrigger(prev => prev + 1)}
      />
      <EventTableModal
        isOpen={eventTableModal}
        onClose={() => setEventTableModal(false)}
        context={selectedTable ? { database: selectedTable.database, schema: selectedTable.schema } : undefined}
        onCreated={injectCreatedTable}
      />
      <HybridTableModal
        isOpen={hybridTableModal}
        onClose={() => setHybridTableModal(false)}
        context={selectedTable ? { database: selectedTable.database, schema: selectedTable.schema } : undefined}
        onCreated={injectCreatedTable}
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
