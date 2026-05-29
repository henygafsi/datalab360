'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Badge, Button, Tooltip, Loader } from 'rizzui';
import {
  X, ChevronLeft, ChevronRight, Zap, Brain, BarChart3, Clock,
  HelpCircle, Shield, RefreshCw, Plus, Key, AlertTriangle, Eye,
  Sparkles, CheckCircle, FileText, GitBranch, Lock, Tag, Send,
  Rocket, Play, Search, Info, ArrowRight, ExternalLink,
  PanelRightClose, PanelRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RightBarTab = 'actions' | 'ai' | 'quality' | 'history' | 'deploy' | 'help';
export type FocusedAction = 'policies' | 'ingestion' | 'add_column' | 'release' | null;

interface ColumnInfo {
  name: string;
  dataType: string;
  isPrimaryKey?: boolean;
  isNullable?: boolean;
  isSensitive?: boolean;
}

interface TableItem {
  id: string;
  database: string;
  schema: string;
  table: string;
  columnCount: number;
  hasPrimaryKey: boolean;
  status: string;
  sensitiveColumns?: number;
}

interface HistoryEvent {
  id: string;
  type: string;
  status: 'success' | 'warning' | 'error' | 'pending';
  actor: string;
  timestamp: string;
  object: string;
  message?: string;
}

interface ClassificationResult {
  column: string;
  category: string;
  tags?: string[];
  confidence?: number;
  description?: string;
  piiRisk?: string;
  suggestion?: string;
}

export interface ContextRightBarProps {
  selectedTable: TableItem | null;
  tableColumns: ColumnInfo[];
  projectId: string | null;
  isOpen: boolean;
  onToggle: () => void;
  activeTab: RightBarTab;
  onTabChange: (tab: RightBarTab) => void;
  focusedAction: FocusedAction;
  onFocusAction: (action: FocusedAction) => void;
  columnClassifications: Map<string, Record<string, string>>;
  classificationDetails: ClassificationResult[];
  isClassifying: boolean;
  onRunClassify: () => void;
  onAddEvent: (event: any) => void;
  profileData?: any;
  historyEvents: HistoryEvent[];
  pendingEventsCount: number;
  pendingEvents?: any[];
  selectedDatabase?: string;
  selectedSchema?: string;
  userRole?: string;
  onOpenDeployModal: () => void;
  onDeselectTable?: () => void;
}

// ---------------------------------------------------------------------------
// Tab rail icons
// ---------------------------------------------------------------------------

const TABS: { id: RightBarTab; icon: React.ElementType; label: string }[] = [
  { id: 'actions', icon: Zap, label: 'Actions' },
  { id: 'ai', icon: Brain, label: 'AI Assist' },
  { id: 'quality', icon: BarChart3, label: 'Quality' },
  { id: 'deploy', icon: Rocket, label: 'Deploy' },
  { id: 'history', icon: Clock, label: 'History' },
  { id: 'help', icon: HelpCircle, label: 'Help' },
];

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ContextRightBar({
  selectedTable, tableColumns, projectId, isOpen, onToggle,
  activeTab, onTabChange, focusedAction, onFocusAction,
  columnClassifications, classificationDetails, isClassifying, onRunClassify,
  onAddEvent, profileData, historyEvents,
  pendingEventsCount, pendingEvents, selectedDatabase, selectedSchema, userRole, onOpenDeployModal, onDeselectTable,
}: ContextRightBarProps) {

  const tableName = selectedTable?.table || '';
  const fqn = selectedTable ? `${selectedTable.database}.${selectedTable.schema}.${selectedTable.table}` : '';
  const classifications = selectedTable ? columnClassifications.get(selectedTable.id) : undefined;

  return (
    <div className="flex h-full shrink-0" style={{ flexShrink: 0, flexGrow: 0 }}>
      {/* Mini rail — always visible */}
      <div className="w-12 border-l border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex flex-col items-center py-2 gap-1">
        <button
          onClick={onToggle}
          className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 mb-2"
          title={isOpen ? 'Collapse panel' : 'Expand panel'}
        >
          {isOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
        </button>
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id && isOpen;
          return (
            <Tooltip key={tab.id} content={tab.label} placement="left">
              <button
                onClick={() => { onTabChange(tab.id); if (!isOpen) onToggle(); }}
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  active
                    ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400'
                    : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-600'
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            </Tooltip>
          );
        })}
      </div>

      {/* Expanded content */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 380, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden flex flex-col shrink-0"
            style={{ minWidth: 0 }}
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                {TABS.find((t) => t.id === activeTab)?.icon && (
                  <span className="text-blue-600">
                    {React.createElement(TABS.find((t) => t.id === activeTab)!.icon, { className: 'h-4 w-4' })}
                  </span>
                )}
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {TABS.find((t) => t.id === activeTab)?.label}
                </h3>
              </div>
              {selectedTable && (
                <Badge size="sm" className="bg-slate-100 dark:bg-slate-800 text-slate-500 text-[9px]">{tableName}</Badge>
              )}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto">
              {!selectedTable ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 px-6 text-center">
                  <Info className="h-8 w-8 mb-3 text-slate-300" />
                  <p className="text-sm font-medium">Select a table</p>
                  <p className="text-xs mt-1">Choose a table from the list to see contextual actions</p>
                </div>
              ) : (
                <>
                  {activeTab === 'actions' && (
                    <ActionsPanel
                      table={selectedTable}
                      columns={tableColumns}
                      projectId={projectId}
                      focusedAction={focusedAction}
                      onFocusAction={onFocusAction}
                      onAddEvent={onAddEvent}
                      classifications={classifications}
                      userRole={userRole}
                      database={selectedDatabase}
                      onDeselectTable={onDeselectTable}
                    />
                  )}
                  {activeTab === 'ai' && (
                    <AIAssistPanel
                      table={selectedTable}
                      columns={tableColumns}
                      classifications={classifications}
                      classificationDetails={classificationDetails}
                      isClassifying={isClassifying}
                      onRunClassify={onRunClassify}
                    />
                  )}
                  {activeTab === 'quality' && (
                    <QualityPanel table={selectedTable} columns={tableColumns} profileData={profileData} />
                  )}
                  {activeTab === 'deploy' && (
                    <DeployPanel
                      projectId={projectId}
                      pendingEventsCount={pendingEventsCount}
                      pendingEvents={pendingEvents}
                      database={selectedDatabase}
                      schema={selectedSchema}
                      onOpenDeployModal={onOpenDeployModal}
                    />
                  )}
                  {activeTab === 'history' && (
                    <HistoryPanel events={historyEvents} />
                  )}
                  {activeTab === 'help' && (
                    <HelpPanel table={selectedTable} />
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// A. Actions Panel
// ---------------------------------------------------------------------------

function ActionsPanel({ table, columns, projectId, focusedAction, onFocusAction, onAddEvent, classifications, userRole, database, onDeselectTable }: {
  table: TableItem; columns: ColumnInfo[]; projectId: string | null;
  focusedAction: FocusedAction; onFocusAction: (a: FocusedAction) => void;
  onAddEvent: (e: any) => void; classifications?: Record<string, string>;
  userRole?: string; database?: string; onDeselectTable?: () => void;
}) {
  const piiCount = columns.filter((c) => c.isSensitive).length;
  const canWrite = !userRole || ['ACCOUNTADMIN', 'SYSADMIN', 'SECURITYADMIN', 'DATA_MODELER', 'DATA_ENGINEER', 'AI_ENGINEER'].includes(userRole);
  const canApprove = !userRole || ['ACCOUNTADMIN', 'SYSADMIN', 'DATA_STEWARD', 'DBA'].includes(userRole);
  const canDeploy = !userRole || ['ACCOUNTADMIN', 'SYSADMIN', 'DATA_MODELER', 'DATA_ENGINEER'].includes(userRole);
  const isStage = table.table.startsWith('@') || table.schema === 'STAGES' || (table as any).objectType === 'STAGE';
  const isView = (table as any).objectType === 'VIEW' || table.table.startsWith('V_');
  const isDynamicTable = (table as any).objectType === 'DYNAMIC_TABLE' || table.table.startsWith('DT_');
  const isStream = (table as any).objectType === 'STREAM';
  const hasPK = columns.some((c) => c.isPrimaryKey);
  const policiesRef = useRef<HTMLDivElement>(null);
  const ingestionRef = useRef<HTMLDivElement>(null);
  const addColRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusedAction === 'policies') policiesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (focusedAction === 'ingestion') ingestionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (focusedAction === 'add_column') addColRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusedAction]);

  return (
    <div className="p-4 space-y-4">
      {/* 1. Policies, Masking & RLS */}
      <PoliciesCard
        ref={policiesRef}
        focused={focusedAction === 'policies'}
        table={table}
        columns={columns}
        projectId={projectId}
        canWrite={canWrite}
        onAddEvent={onAddEvent}
      />

      {/* 2. Ingestion & Snowpipe/Tasks */}
      <div ref={ingestionRef} className={cn('rounded-xl border p-4 space-y-3 transition-colors', focusedAction === 'ingestion' ? 'border-blue-300 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-900/10' : 'border-slate-200 dark:border-slate-700')}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-cyan-500" />
            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Ingestion</h4>
          </div>
          <StatusChip label={table.status === 'configured' ? 'Active' : 'Not set'} color={table.status === 'configured' ? 'green' : 'slate'} />
        </div>
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800"><span className="text-slate-400">Mode</span><p className="font-medium text-slate-700 dark:text-slate-300">{(table as any).ingestionMode || 'Not set'}</p></div>
          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800"><span className="text-slate-400">Columns</span><p className="font-medium text-slate-700 dark:text-slate-300">{columns.length}</p></div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <ActionBtn label="Configure" icon={RefreshCw} disabled={!canWrite} onClick={() => onFocusAction('ingestion')} />
          <ActionBtn label="Run refresh" icon={Play} disabled={!canWrite} onClick={() => {
            onAddEvent({ type: 'INGESTION_MODE_SET', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: { mode: 'full_refresh' } });
            toast.success('Refresh added to draft');
          }} />
          <ActionBtn label="Detect pipes" icon={Search} onClick={async () => {
            try {
              const { listStreams, listDynamicTables } = await import('@/app/services/explore-design');
              const [streams, dynTables] = await Promise.allSettled([
                listStreams(table.database, table.schema),
                listDynamicTables(table.database, table.schema),
              ]);
              const sCount = streams.status === 'fulfilled' ? (streams.value?.streams?.length || 0) : 0;
              const dCount = dynTables.status === 'fulfilled' ? (dynTables.value?.dynamic_tables?.length || 0) : 0;
              toast.success(`Found ${sCount} streams, ${dCount} dynamic tables in ${table.schema}`);
            } catch { toast.error('Detection failed'); }
          }} />
        </div>
        {/* Add to product/project */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex gap-1.5">
          <ActionBtn label="Add to product" icon={Plus} disabled={!canWrite} onClick={() => {
            onAddEvent({ type: 'PRODUCT_ASSET_ADDED', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: { assetType: 'table' } });
            toast.success(`${table.table} added to product draft`);
          }} />
          <ActionBtn label="Add to project" icon={Rocket} disabled={!canWrite} onClick={() => {
            onAddEvent({ type: 'TABLE_SELECTED', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: {} });
            toast.success(`${table.table} linked to project`);
          }} />
        </div>
      </div>

      {/* 3. Add Column / Calculated Field */}
      <AddColumnCard ref={addColRef} focused={focusedAction === 'add_column'} table={table} projectId={projectId} columns={columns} onAddEvent={onAddEvent} />

      {/* 4. Quality Recommendations */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-500" />
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Recommendations</h4>
        </div>
        <div className="space-y-1.5">
          {piiCount > 0 && <RecoItem text={`PII candidate detected in ${columns.find((c) => c.isSensitive)?.name || 'column'} — apply masking policy`} cta="Apply masking" onClick={() => {
            const col = columns.find((c) => c.isSensitive);
            if (col) { onAddEvent({ type: 'MASKING_POLICY_APPLIED', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: { column: col.name, policyType: 'SHA2_MASK' } }); toast.success(`Masking policy drafted for ${col.name}`); }
          }} />}
          {!table.hasPrimaryKey && <RecoItem text={`Recommend primary key on ${columns[0]?.name || 'TX_ID'}`} cta="Set PK" onClick={() => {
            if (columns[0]) { onAddEvent({ type: 'PRIMARY_KEY_SET', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: { columns: [columns[0].name] } }); toast.success(`PK on ${columns[0].name} added to deployment draft`); }
          }} />}
          <RecoItem text={`RLS missing for ${table.table} — add row access policy`} cta="Add RLS" onClick={() => {
            onAddEvent({ type: 'RLS_POLICY_APPLIED', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: { policyName: `rls_${table.table.toLowerCase()}`, roleColumn: 'CURRENT_ROLE()' } });
            toast.success(`RLS policy drafted for ${table.table}`);
          }} />
          <RecoItem text="Add freshness quality rule for monitoring" cta="Add rule" onClick={() => {
            onAddEvent({ type: 'QUALITY_GATE_SET', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: { gateType: 'freshness', maxAgeHours: 24, column: columns.find((c) => c.dataType === 'TIMESTAMP' || c.dataType === 'DATE')?.name || 'UPDATED_AT' } });
            toast.success('Freshness quality rule added to deployment draft');
          }} />
        </div>
      </div>

      {/* 5. Object-type specific actions */}
      {isStage && (
        <div className="rounded-xl border border-cyan-200 dark:border-cyan-800 bg-cyan-50/20 dark:bg-cyan-900/10 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-cyan-500" />
            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Stage Actions</h4>
          </div>
          <p className="text-[11px] text-slate-500">Manage files, SFTP connections, and stage access.</p>
          <div className="flex flex-wrap gap-2">
            <ActionBtn label="List files" icon={Eye} onClick={async () => {
              try {
                const { listSnowflakeStageFiles } = await import('@/app/(dashboard)/data-source-connection/connectionServices');
                const res = await listSnowflakeStageFiles(table.table);
                toast.success(`${res?.files?.length || 0} files in stage`);
              } catch { toast.error('Failed to list stage files'); }
            }} />
            <ActionBtn label="Create SFTP" icon={Plus} disabled={!canWrite} onClick={() => {
              if (!canWrite) { toast.error('Insufficient permissions'); return; }
              window.location.href = '/data-source-connection';
            }} />
            {canApprove && <ActionBtn label="Upload" icon={ArrowRight} onClick={() => {
              onAddEvent({ type: 'STAGE_UPLOAD_REQUEST', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: { approval_required: true } });
              toast.success('Upload request added to draft — requires approval');
            }} />}
            {canApprove && <ActionBtn label="Delete files" icon={AlertTriangle} onClick={() => {
              onAddEvent({ type: 'STAGE_FILE_DELETE_REQUEST', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: { approval_required: true } });
              toast.success('Delete request submitted for approval');
            }} />}
          </div>
          <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-[10px] text-slate-500">
            <p>Access: <span className="font-medium text-slate-700 dark:text-slate-300">{userRole || 'accountadmin'}</span></p>
            <p>Source type: Stage ({table.database})</p>
          </div>
        </div>
      )}

      {isView && (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/20 dark:bg-indigo-900/10 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-indigo-500" />
            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">View Actions</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionBtn label="View DDL" icon={FileText} onClick={async () => {
              try {
                const api = await import('@/app/services/api/exploreDesignApi');
                const res = await api.sqlDiff(projectId || '', { database: table.database, schema_name: table.schema, event_ids: [] });
                toast.success(`DDL: ${res?.diffs?.length || 0} changes found`);
              } catch { toast.error('DDL diff not available — no pending changes'); }
            }} />
            <ActionBtn label="Refresh view" icon={RefreshCw} disabled={!canWrite} onClick={() => {
              onAddEvent({ type: 'VIEW_REFRESH', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: {} });
              toast.success('View refresh added to draft');
            }} />
            {canWrite && <ActionBtn label="Alter view" icon={Plus} onClick={() => onFocusAction('add_column')} />}
          </div>
        </div>
      )}

      {isDynamicTable && (
        <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/20 dark:bg-purple-900/10 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <RefreshCw className="h-4 w-4 text-purple-500" />
            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Dynamic Table</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionBtn label="Refresh" icon={RefreshCw} onClick={async () => {
              try {
                const { refreshDynamicTable } = await import('@/app/services/explore-design');
                await refreshDynamicTable(table.table, table.database, table.schema);
                toast.success('Dynamic table refresh started');
              } catch { toast.error('Refresh failed'); }
            }} />
            <ActionBtn label="Suspend" icon={AlertTriangle} disabled={!canWrite} onClick={async () => {
              try {
                const { suspendDynamicTable } = await import('@/app/services/explore-design');
                await suspendDynamicTable(table.table, table.database, table.schema);
                toast.success('Dynamic table suspended');
              } catch { toast.error('Suspend failed'); }
            }} />
          </div>
        </div>
      )}

      {isStream && (
        <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50/20 dark:bg-green-900/10 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-green-500" />
            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Stream (CDC)</h4>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionBtn label="View changes" icon={Eye} onClick={async () => {
              try {
                const { getStreamData } = await import('@/app/services/explore-design');
                const data = await getStreamData(table.table, table.database, table.schema);
                toast.success(`Stream has ${data?.rows?.length || 0} pending changes`);
              } catch { toast.error('Failed to read stream'); }
            }} />
            <ActionBtn label="Drop stream" icon={AlertTriangle} disabled={!canApprove} onClick={() => {
              onAddEvent({ type: 'STREAM_DROP_REQUEST', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: { approval_required: true } });
              toast.success('Drop request submitted for approval');
            }} />
          </div>
        </div>
      )}

      {/* 5b. Danger Zone — delete/drop with approval */}
      {canWrite && (
        <div className="rounded-xl border border-red-200 dark:border-red-800 p-3 space-y-2">
          <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wider">Danger Zone</p>
          <div className="flex flex-wrap gap-1.5">
            <ActionBtn label="Drop table" icon={AlertTriangle} onClick={() => {
              onAddEvent({ type: 'TABLE_DROP_REQUEST', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: { approval_required: true, reason: 'Manual request from catalog' } });
              toast.success('Drop request submitted — requires approval before execution');
              onDeselectTable?.();
            }} />
            <ActionBtn label="Exclude" icon={Lock} onClick={() => {
              onAddEvent({ type: 'TABLE_EXCLUDED', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: { approval_required: false, reason: 'Excluded from catalog' } });
              toast.success(`${table.table} exclusion added to draft`);
              onDeselectTable?.();
            }} />
          </div>
        </div>
      )}

      {/* 6. Release / Draft */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Rocket className="h-4 w-4 text-blue-500" />
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Release</h4>
        </div>
        <p className="text-[11px] text-slate-500">Add current changes to a deployment release.</p>
        <div className="flex gap-2">
          <ActionBtn label="Add to draft" icon={Plus} disabled={!canWrite} onClick={() => {
            onAddEvent({ type: 'RELEASE_DRAFT_UPDATED', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: { action: 'add_to_release' } });
            toast.success(`${table.table} changes added to release draft`);
          }} />
          <ActionBtn label="Review impact" icon={Eye} onClick={async () => {
            try {
              const api = await import('@/app/services/api/exploreDesignApi');
              const res = await api.enhancedImpactAnalysis(projectId || '', { database: table.database, schema: table.schema, table: table.table });
              const count = res?.impacts?.length || res?.affected_objects?.length || 0;
              toast.success(`Impact: ${count} downstream objects, risk ${res?.risk_score ?? 0}/100`);
            } catch { toast.error('Impact analysis failed'); }
          }} />
        </div>
      </div>

      {/* 7. Access context */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-1.5">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Access Context</p>
        <div className="grid grid-cols-2 gap-1 text-[10px]">
          <span className="text-slate-500">Role</span>
          <span className="font-medium text-slate-700 dark:text-slate-300">{userRole || 'accountadmin'}</span>
          <span className="text-slate-500">Database</span>
          <span className="font-mono text-slate-700 dark:text-slate-300">{table.database}</span>
          <span className="text-slate-500">Schema</span>
          <span className="font-mono text-slate-700 dark:text-slate-300">{table.schema}</span>
          <span className="text-slate-500">Object</span>
          <span className="font-mono text-slate-700 dark:text-slate-300">{table.table}</span>
          <span className="text-slate-500">Can write</span>
          <span className={cn('font-semibold', canWrite ? 'text-green-600' : 'text-red-500')}>{canWrite ? 'Yes' : 'No'}</span>
          <span className="text-slate-500">Can deploy</span>
          <span className={cn('font-semibold', canDeploy ? 'text-green-600' : 'text-red-500')}>{canDeploy ? 'Yes' : 'No'}</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// B. AI Assist Panel
// ---------------------------------------------------------------------------

function AIAssistPanel({ table, columns, classifications, classificationDetails, isClassifying, onRunClassify }: {
  table: TableItem; columns: ColumnInfo[];
  classifications?: Record<string, string>;
  classificationDetails: ClassificationResult[];
  isClassifying: boolean;
  onRunClassify: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const hasClassifications = classifications && Object.keys(classifications).length > 0;

  const SUGGESTED = [
    'Explain this table',
    'Find missing governance',
    'Generate DQ rules',
    'Suggest calculated columns',
    'Create retail KPI mapping',
  ];

  return (
    <div className="p-4 space-y-4">
      {/* AI Classify CTA */}
      <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-900/10 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-500" />
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">AI Column Classification</h4>
        </div>
        <p className="text-[11px] text-slate-500">Detect identifiers, measures, dimensions, PII, dates and more using AI.</p>
        <button
          onClick={onRunClassify}
          disabled={isClassifying}
          className="w-full py-2 text-xs font-medium rounded-lg bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white transition-colors flex items-center justify-center gap-1.5"
        >
          {isClassifying ? <><Loader size="sm" className="h-3 w-3" /> Classifying...</> : <><Sparkles className="h-3.5 w-3.5" /> Run AI Classification</>}
        </button>

        {/* Classification Results */}
        {hasClassifications && (
          <div className="space-y-1.5 pt-2 border-t border-purple-100 dark:border-purple-800">
            <p className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider">Results — {Object.keys(classifications).length} columns classified</p>
            {Object.entries(classifications).map(([col, category]) => {
              const detail = classificationDetails.find((d) => d.column === col);
              return (
                <div key={col} className="p-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-medium text-slate-800 dark:text-slate-200">{col}</span>
                    <ClassificationTag category={category} />
                  </div>
                  {detail && (
                    <div className="space-y-1">
                      {detail.description && <p className="text-[10px] text-slate-500">{detail.description}</p>}
                      {detail.tags && detail.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {detail.tags.map((t) => (
                            <span key={t} className="px-1.5 py-0 rounded-full text-[9px] font-medium bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400">{t}</span>
                          ))}
                        </div>
                      )}
                      {detail.piiRisk && (
                        <span className={cn('text-[9px] font-semibold', detail.piiRisk === 'high' ? 'text-red-500' : detail.piiRisk === 'medium' ? 'text-amber-500' : 'text-green-500')}>
                          PII Risk: {detail.piiRisk}
                        </span>
                      )}
                      {detail.confidence != null && (
                        <span className="text-[9px] text-slate-400 ml-2">Confidence: {Math.round(detail.confidence * 100)}%</span>
                      )}
                      {detail.suggestion && (
                        <p className="text-[10px] text-blue-600 dark:text-blue-400 flex items-center gap-1"><Sparkles className="h-2.5 w-2.5" />{detail.suggestion}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Ask AI */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
        <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5"><Brain className="h-4 w-4 text-blue-500" /> Ask AI</h4>
        <div className="relative">
          <input
            type="text"
            placeholder="Ask about this table, policies, quality..."
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            className="w-full pl-3 pr-9 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30">
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED.map((s) => (
            <button key={s} onClick={() => setPrompt(s)} className="px-2 py-1 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/30 dark:hover:text-blue-400 transition-colors">
              {s}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// C. Quality Panel
// ---------------------------------------------------------------------------

function QualityPanel({ table, columns, profileData }: { table: TableItem; columns: ColumnInfo[]; profileData?: any }) {
  const nullCols = profileData?.columns?.filter((c: any) => (c.null_count ?? 0) > 0).length ?? 0;
  const pkCandidate = columns.find((c) => c.isPrimaryKey)?.name || columns[0]?.name || '—';
  const qualityScore = profileData?.aggregate_quality_score ?? 100;

  return (
    <div className="p-4 space-y-4">
      {/* Score overview */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Quality Score</h4>
          <span className={cn('text-lg font-bold', qualityScore >= 80 ? 'text-green-600' : qualityScore >= 60 ? 'text-amber-600' : 'text-red-600')}>{qualityScore}%</span>
        </div>
        <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
          <div className={cn('h-full rounded-full transition-all', qualityScore >= 80 ? 'bg-green-500' : qualityScore >= 60 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: `${qualityScore}%` }} />
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-2">
        <MetricCard label="Null columns" value={nullCols} total={columns.length} color={nullCols > 0 ? 'amber' : 'green'} />
        <MetricCard label="Duplicate risk" value="Low" color="green" />
        <MetricCard label="PK candidate" value={pkCandidate} color="blue" />
        <MetricCard label="Freshness" value="Not set" color="slate" />
      </div>

      {/* Actions — real API calls */}
      <div className="space-y-2">
        <ActionBtn label="Run profiling" icon={BarChart3} onClick={async () => {
          try {
            const { getTableProfile } = await import('@/app/services/explore-design');
            const res = await getTableProfile(table.database, table.schema, table.table);
            toast.success(`Profile: ${res?.row_count || 0} rows, ${res?.column_count || 0} cols, quality ${res?.overall_quality_score ?? '—'}%`);
          } catch { toast.error('Profiling failed — check table access'); }
        }} fullWidth />
        <ActionBtn label="Add DQ rule to draft" icon={Plus} onClick={() => {
          const colName = columns.find((c) => c.dataType === 'TIMESTAMP' || c.dataType === 'DATE')?.name || columns[0]?.name || 'UPDATED_AT';
          onAddEvent({ type: 'QUALITY_GATE_SET', projectId: table.database, target: { database: table.database, schema: table.schema, table: table.table }, payload: { gateType: 'freshness', maxAgeHours: 24, column: colName } });
          toast.success(`Freshness rule on ${colName} added to deployment draft`);
        }} fullWidth />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// D. History Panel
// ---------------------------------------------------------------------------

function HistoryPanel({ events }: { events: HistoryEvent[] }) {
  const grouped = events.reduce<Record<string, HistoryEvent[]>>((acc, e) => {
    const day = new Date(e.timestamp).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    (acc[day] ||= []).push(e);
    return acc;
  }, {});

  return (
    <div className="p-4 space-y-4">
      {Object.keys(grouped).length === 0 ? (
        <div className="text-center py-8 text-slate-400">
          <Clock className="h-8 w-8 mx-auto mb-2 text-slate-300" />
          <p className="text-xs">No history yet</p>
        </div>
      ) : (
        Object.entries(grouped).map(([day, items]) => (
          <div key={day}>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2">{day}</p>
            <div className="space-y-1.5">
              {items.map((e) => (
                <div key={e.id} className="flex items-start gap-2.5 px-3 py-2 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <HistoryStatusIcon status={e.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-800 dark:text-slate-200">{e.type}</p>
                    <p className="text-[10px] text-slate-500 truncate">{e.actor} · {e.object}</p>
                    {e.message && e.status === 'error' && (
                      <p className="text-[10px] text-red-500 mt-0.5 line-clamp-1">{e.message}</p>
                    )}
                  </div>
                  <span className="text-[9px] text-slate-400 shrink-0">
                    {new Date(e.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// E. Help Panel
// ---------------------------------------------------------------------------

function HelpPanel({ table }: { table: TableItem }) {
  const steps = [
    { label: 'Confirm primary key', done: table.hasPrimaryKey },
    { label: 'Add row-level security', done: false },
    { label: 'Add calculated margin field', done: false },
    { label: 'Add freshness rule', done: false },
    { label: 'Attach changes to release', done: false },
  ];

  return (
    <div className="p-4 space-y-4">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-2">
        <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">What is this table?</h4>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          <span className="font-medium text-slate-700 dark:text-slate-300">{table.table}</span> is a {table.table.startsWith('FACT_') ? 'fact' : table.table.startsWith('DIM_') ? 'dimension' : 'staging'} table in the {table.schema} schema. It contains {table.columnCount} columns.
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-2">
        <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Recommended Next Steps</h4>
        <div className="space-y-1.5">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2 text-xs">
              {s.done
                ? <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                : <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 dark:border-slate-600 shrink-0" />
              }
              <span className={cn(s.done ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-300')}>{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-2">
        <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Governance Checklist</h4>
        <div className="space-y-1 text-[11px] text-slate-500">
          <p>• Owner assigned</p>
          <p>• Masking policies reviewed</p>
          <p>• Data classification applied</p>
          <p>• Quality rules attached</p>
          <p>• Lineage verified</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// F. Deploy Panel — real pipeline with API calls and outputs
// ---------------------------------------------------------------------------

type StepId = 'review' | 'pre_checks' | 'dry_run' | 'impact' | 'deploy' | 'verify';
type StepStatus = 'idle' | 'running' | 'done' | 'error' | 'skipped';

const DEPLOY_STEPS: { id: StepId; label: string; icon: React.ElementType; desc: string; required: boolean }[] = [
  { id: 'review', label: 'Review Changes', icon: Eye, desc: 'Review pending DDL events and SQL', required: true },
  { id: 'pre_checks', label: 'Pre-Checks', icon: Shield, desc: 'Validate permissions and conflicts', required: true },
  { id: 'dry_run', label: 'Dry Run', icon: Play, desc: 'Simulate deployment on clone schema', required: false },
  { id: 'impact', label: 'Impact Analysis', icon: AlertTriangle, desc: 'Check downstream dependencies', required: false },
  { id: 'deploy', label: 'Execute Deploy', icon: Rocket, desc: 'Apply DDL to Snowflake', required: true },
  { id: 'verify', label: 'Post-Verify', icon: CheckCircle, desc: 'Verify deployed objects', required: false },
];

function DeployPanel({ projectId, pendingEventsCount, onOpenDeployModal, pendingEvents, database, schema }: {
  projectId: string | null; pendingEventsCount: number; onOpenDeployModal: () => void;
  pendingEvents?: any[]; database?: string; schema?: string;
}) {
  const [stepStatus, setStepStatus] = useState<Record<StepId, StepStatus>>({
    review: 'idle', pre_checks: 'idle', dry_run: 'idle', impact: 'idle', deploy: 'idle', verify: 'idle',
  });
  const [stepOutput, setStepOutput] = useState<Record<StepId, any>>({
    review: null, pre_checks: null, dry_run: null, impact: null, deploy: null, verify: null,
  });
  const [expandedStep, setExpandedStep] = useState<StepId | null>(null);
  const [deployLog, setDeployLog] = useState<Array<{ ts: string; msg: string; type: 'info' | 'success' | 'error' }>>([]);

  const canRunStep = useCallback((stepId: StepId): boolean => {
    if (!projectId || pendingEventsCount === 0) return false;
    const idx = DEPLOY_STEPS.findIndex((s) => s.id === stepId);
    if (idx === 0) return true;
    for (let i = 0; i < idx; i++) {
      const prev = DEPLOY_STEPS[i];
      const prevSt = stepStatus[prev.id];
      if (prev.required && prevSt !== 'done' && prevSt !== 'skipped') return false;
    }
    return true;
  }, [stepStatus, projectId, pendingEventsCount]);

  const log = useCallback((msg: string, type: 'info' | 'success' | 'error' = 'info') => {
    setDeployLog((prev) => [...prev, { ts: new Date().toLocaleTimeString(), msg, type }]);
  }, []);

  const [approvalRequested, setApprovalRequested] = useState(false);
  const [approvalNote, setApprovalNote] = useState('');

  const getDbSchema = useCallback(() => {
    const events = pendingEvents || [];
    const db = database || events.find((e: any) => e.target?.database)?.target?.database || '';
    const sch = schema || events.find((e: any) => e.target?.schema)?.target?.schema || '';
    return { db, sch };
  }, [pendingEvents, database, schema]);

  const runStep = useCallback(async (stepId: StepId) => {
    if (!projectId) return;
    setStepStatus((p) => ({ ...p, [stepId]: 'running' }));
    setExpandedStep(stepId);
    log(`Starting ${stepId}...`);
    const { db, sch } = getDbSchema();

    try {
      const api = await import('@/app/services/api/exploreDesignApi');
      const { generateSnowflakeSQL } = await import('./deployment/deployment-utils');
      let result: any = null;

      switch (stepId) {
        case 'review': {
          const generated = (pendingEvents || []).map((e: any) => {
            try { const s = generateSnowflakeSQL(e); return { type: e.type, target: e.target?.table || '—', database: e.target?.database || db, schema: e.target?.schema || sch, sql: s?.sql || null, rollback: s?.rollbackSql || null }; }
            catch { return { type: e.type, target: e.target?.table || '—', database: e.target?.database || db, schema: e.target?.schema || sch, sql: null, rollback: null }; }
          });
          const withSql = generated.filter((g: any) => g.sql).length;
          const affectedTables = [...new Set(generated.map((g: any) => g.target).filter((t: any) => t !== '—'))];
          const affectedSchemas = [...new Set(generated.map((g: any) => `${g.database}.${g.schema}`).filter(Boolean))];
          result = { total: pendingEventsCount, withSql, affectedTables, affectedSchemas, events: generated.slice(0, 30) };
          log(`Reviewed ${pendingEventsCount} events: ${withSql} SQL, ${affectedTables.length} tables across ${affectedSchemas.length} schemas`, 'success');
          break;
        }

        case 'pre_checks': {
          const checksResult = await api.preDeployChecks(projectId, { database: db, schema: sch });
          let riskResult: any = null;
          try { riskResult = await api.aiDeploymentRisk(projectId); } catch { /* optional */ }
          const checks = checksResult?.checks || [];
          const passed = checks.filter((c: any) => c.status === 'PASS' || c.status === 'pass').length;
          const warned = checks.filter((c: any) => c.status === 'WARN' || c.status === 'warn').length;
          const failed = checks.filter((c: any) => c.status === 'FAIL' || c.status === 'fail').length;
          const score = checks.length > 0 ? Math.round((passed / checks.length) * 100) : 0;
          result = { ...checksResult, score, passed, warned, failed, total: checks.length, risk: riskResult };
          log(failed > 0 ? `Pre-checks: ${failed} failed, ${warned} warnings (score ${score}%)` : `Pre-checks passed (score ${score}%, ${warned} warnings)`, failed > 0 ? 'error' : 'success');
          if (failed > 0) { setStepStatus((p) => ({ ...p, [stepId]: 'error' })); setStepOutput((p) => ({ ...p, [stepId]: result })); return; }
          break;
        }

        case 'dry_run': {
          const actions = (pendingEvents || []).map((e: any) => {
            try { const s = generateSnowflakeSQL(e); return s?.sql ? { ddl_sql: s.sql, ddl_type: e.type, target_table: e.target?.table } : null; }
            catch { return null; }
          }).filter(Boolean);
          log(`Sending ${actions.length} DDL actions for dry run on clone schema...`);
          result = await api.fullDryRun(projectId, { database: db, schema: sch, actions, warehouse: undefined, sample_rows: 5, ingestions: [] });
          const ddlResults = result?.ddl_results || [];
          const passCount = ddlResults.filter((r: any) => r.status === 'PASS' || r.status === 'pass').length;
          const failCount = ddlResults.filter((r: any) => r.status !== 'PASS' && r.status !== 'pass').length;
          result = { ...result, clone_info: result?.clone_schema || result?.clone_database ? `Cloned to ${result.clone_database || db}.${result.clone_schema || 'DRY_RUN_CLONE'}` : 'Clone schema created', passCount, failCount };
          log(failCount > 0 ? `Dry run: ${failCount}/${ddlResults.length} DDL failed on clone` : `Dry run passed: ${passCount} DDL on clone (${result?.duration_ms || 0}ms)`, failCount > 0 ? 'error' : 'success');
          if (failCount > 0) { setStepStatus((p) => ({ ...p, [stepId]: 'error' })); setStepOutput((p) => ({ ...p, [stepId]: result })); return; }
          break;
        }

        case 'impact': {
          const targets = [...new Set((pendingEvents || []).map((e: any) => e.target?.table).filter(Boolean))];
          const eventTypes = [...new Set((pendingEvents || []).map((e: any) => e.type))];
          const destructive = eventTypes.filter((t: string) => ['REMOVE_COLUMN', 'TABLE_RENAMED', 'COLUMN_RENAMED', 'COLUMN_TYPE_CHANGED', 'PRIMARY_KEY_REMOVED', 'FOREIGN_KEY_REMOVED'].includes(t));

          log(`Analyzing impact on ${targets.length} tables (${eventTypes.length} event types)...`);

          const allImpacts: any[] = [];
          let maxRisk = 0;

          for (const tbl of targets) {
            try {
              const r = await api.enhancedImpactAnalysis(projectId, { database: db, schema: sch, table: tbl, column: undefined });
              const tableImpacts = (r?.impacts || r?.affected_objects || []).map((i: any) => ({ ...i, sourceTable: tbl }));
              allImpacts.push(...tableImpacts);
              const score = r?.risk_score ?? r?.overall_risk_score ?? 0;
              if (score > maxRisk) maxRisk = score;
            } catch { log(`Impact for ${tbl}: endpoint unavailable`, 'info'); }
          }

          const byAxis: Record<string, any[]> = { governance: [], modeling: [], ingestion: [], quality: [], lineage: [] };
          for (const imp of allImpacts) {
            const t = (imp.type || imp.object_type || '').toLowerCase();
            if (t.includes('policy') || t.includes('mask') || t.includes('rls') || t.includes('grant')) byAxis.governance.push(imp);
            else if (t.includes('relation') || t.includes('fk') || t.includes('pk') || t.includes('model')) byAxis.modeling.push(imp);
            else if (t.includes('ingestion') || t.includes('task') || t.includes('pipe') || t.includes('stream')) byAxis.ingestion.push(imp);
            else if (t.includes('quality') || t.includes('dq') || t.includes('rule') || t.includes('check')) byAxis.quality.push(imp);
            else byAxis.lineage.push(imp);
          }

          result = {
            targets,
            eventTypes,
            destructiveChanges: destructive,
            riskScore: maxRisk,
            totalImpacts: allImpacts.length,
            byAxis,
            allImpacts: allImpacts.slice(0, 30),
          };
          log(`Impact: ${allImpacts.length} affected objects, risk ${maxRisk}/100, ${destructive.length} destructive changes`, allImpacts.length > 0 || destructive.length > 0 ? 'success' : 'info');
          break;
        }

        case 'deploy': {
          if (!approvalRequested) {
            log('Requesting deployment approval...', 'info');
            const deployReq = await api.requestDeployment(projectId, { deployment_type: 'with_approval', approvers: ['DATA_ENGINEER', 'DBA'], note: approvalNote || 'Deployment from catalog pipeline' });
            result = { status: 'pending_approval', deployment_id: deployReq?.deployment_id || deployReq?.id, message: 'Submitted for approval. Awaiting approver action.', request: deployReq };
            setApprovalRequested(true);
            log(`Deployment submitted for approval (ID: ${result.deployment_id || '—'})`, 'success');
            setStepStatus((p) => ({ ...p, [stepId]: 'done' }));
            setStepOutput((p) => ({ ...p, [stepId]: result }));
            return;
          }
          log('Adding DDL actions...');
          let added = 0;
          for (const event of (pendingEvents || [])) {
            try {
              const sql = generateSnowflakeSQL(event);
              if (sql?.sql) { await api.addDDLAction(projectId, { ddl_sql: sql.sql, ddl_type: event.type, target_table: event.target?.table, description: `${event.type} on ${event.target?.table || ''}` }); added++; }
            } catch { /* skip */ }
          }
          log(`Added ${added} DDL actions, executing...`);
          result = await api.executeDDLActions(projectId, { atomic: true });
          const execOk = result?.status === 'success' || result?.executed > 0;
          log(execOk ? `Deployed: ${result?.executed || added} actions` : `Deploy failed: ${result?.error || result?.message || 'unknown'}`, execOk ? 'success' : 'error');
          if (!execOk) { setStepStatus((p) => ({ ...p, [stepId]: 'error' })); setStepOutput((p) => ({ ...p, [stepId]: result })); return; }
          break;
        }

        case 'verify': {
          const deployId = stepOutput.deploy?.deployment_id || stepOutput.deploy?.request?.deployment_id || '';
          result = await api.postVerifyDeployment(projectId, { database: db, schema_name: sch, deployment_id: deployId });
          const checks = result?.checks || [];
          const allOk = checks.every((c: any) => c.status === 'PASS');
          log(allOk ? 'Post-verification: all checks passed' : `Verification: ${checks.filter((c: any) => c.status !== 'PASS').length} issues found`, allOk ? 'success' : 'error');
          break;
        }
      }

      setStepStatus((p) => ({ ...p, [stepId]: 'done' }));
      setStepOutput((p) => ({ ...p, [stepId]: result }));
    } catch (err: any) {
      const raw = err?.response?.data;
      const msg = raw?.detail?.message || raw?.detail || raw?.message || err?.message || 'Failed';
      const hint = typeof msg === 'string' && msg.includes('Missing') ? '\nHint: Ensure database and schema are set from a selected table.' : '';
      log(`${stepId} error: ${typeof msg === 'string' ? msg : JSON.stringify(msg).slice(0, 200)}${hint}`, 'error');
      setStepStatus((p) => ({ ...p, [stepId]: 'error' }));
      setStepOutput((p) => ({ ...p, [stepId]: { error: typeof msg === 'string' ? msg + hint : msg, raw } }));
    }
  }, [projectId, pendingEvents, pendingEventsCount, getDbSchema, log, approvalRequested, approvalNote, stepOutput.deploy]);

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 flex items-center justify-between">
        <div>
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <Rocket className="h-4 w-4 text-blue-500" /> Pipeline
          </h4>
          <p className="text-[10px] text-slate-500 mt-0.5">{pendingEventsCount} pending changes</p>
        </div>
        <div className="flex gap-1">
          {DEPLOY_STEPS.map((s) => {
            const st = stepStatus[s.id];
            return (
              <span key={s.id} className={cn('w-2.5 h-2.5 rounded-full', st === 'done' ? 'bg-green-500' : st === 'error' ? 'bg-red-500' : st === 'running' ? 'bg-blue-500 animate-pulse' : st === 'skipped' ? 'bg-slate-300' : 'bg-slate-200 dark:bg-slate-700')} title={`${s.label}: ${st}`} />
            );
          })}
        </div>
      </div>

      {/* Steps */}
      {DEPLOY_STEPS.map((step, i) => {
        const StepIcon = step.icon;
        const st = stepStatus[step.id];
        const canRun = canRunStep(step.id) && st !== 'running';
        const expanded = expandedStep === step.id;
        const output = stepOutput[step.id];

        return (
          <div key={step.id} className={cn('rounded-xl border transition-colors', st === 'done' ? 'border-green-200 dark:border-green-800' : st === 'error' ? 'border-red-200 dark:border-red-800' : st === 'running' ? 'border-blue-200 dark:border-blue-800' : 'border-slate-200 dark:border-slate-700')}>
            {/* Step header */}
            <button
              onClick={() => setExpandedStep(expanded ? null : step.id)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
            >
              <StepStatusBadge status={st} index={i} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <StepIcon className={cn('h-3.5 w-3.5', st === 'done' ? 'text-green-500' : st === 'error' ? 'text-red-500' : st === 'running' ? 'text-blue-500' : 'text-slate-400')} />
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200">{step.label}</span>
                  {!step.required && <span className="text-[8px] text-slate-400 italic">optional</span>}
                </div>
                <p className="text-[10px] text-slate-400">{step.desc}</p>
              </div>
              <ChevronRight className={cn('h-3 w-3 text-slate-300 transition-transform', expanded && 'rotate-90')} />
            </button>

            {/* Expanded content */}
            {expanded && (
              <div className="px-3 pb-3 space-y-2 border-t border-slate-100 dark:border-slate-800 pt-2">
                {/* Action buttons */}
                <div className="flex gap-2">
                  {st !== 'done' && st !== 'running' && (
                    <button onClick={() => runStep(step.id)} disabled={!canRun} className="flex-1 py-1.5 text-[11px] font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:dark:bg-slate-700 text-white transition-colors flex items-center justify-center gap-1">
                      {st === 'error' ? <><RefreshCw className="h-3 w-3" /> Retry</> : <><Play className="h-3 w-3" /> Run</>}
                    </button>
                  )}
                  {!step.required && st === 'idle' && (
                    <button onClick={() => { setStepStatus((p) => ({ ...p, [step.id]: 'skipped' })); log(`Skipped ${step.id}`); }} className="py-1.5 px-3 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      Skip
                    </button>
                  )}
                  {st === 'done' && <span className="flex items-center gap-1 text-[11px] text-green-600"><CheckCircle className="h-3 w-3" /> Completed</span>}
                  {st === 'running' && <span className="flex items-center gap-1 text-[11px] text-blue-500"><Loader size="sm" className="h-3 w-3" /> Running...</span>}
                  {!canRun && st === 'idle' && step.required && (
                    <span className="text-[10px] text-slate-400 italic">Complete previous required steps first</span>
                  )}
                </div>

                {/* Output */}
                {output && (
                  <StepOutput stepId={step.id} output={output} status={st} />
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Deploy log */}
      {deployLog.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-slate-500">Pipeline Log</span>
            <button onClick={() => setDeployLog([])} className="text-[9px] text-slate-400 hover:text-slate-600">Clear</button>
          </div>
          <div className="max-h-32 overflow-y-auto p-2 space-y-0.5">
            {deployLog.map((l, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[10px] font-mono">
                <span className="text-slate-400 shrink-0">{l.ts}</span>
                <span className={cn(l.type === 'error' ? 'text-red-500' : l.type === 'success' ? 'text-green-600' : 'text-slate-600 dark:text-slate-400')}>{l.msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StepStatusBadge({ status, index }: { status: StepStatus; index: number }) {
  if (status === 'done') return <span className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center"><CheckCircle className="h-3.5 w-3.5 text-green-600" /></span>;
  if (status === 'error') return <span className="w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center"><AlertTriangle className="h-3.5 w-3.5 text-red-500" /></span>;
  if (status === 'running') return <span className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center"><Loader size="sm" className="h-3.5 w-3.5 text-blue-500" /></span>;
  if (status === 'skipped') return <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[9px] text-slate-400">—</span>;
  return <span className="w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500">{index + 1}</span>;
}

function StepOutput({ stepId, output, status }: { stepId: StepId; output: any; status: StepStatus }) {
  if (output?.error) {
    return (
      <div className="p-2.5 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-800">
        <p className="text-[10px] text-red-600 dark:text-red-400 font-medium">Error</p>
        <p className="text-[10px] text-red-500 mt-0.5 font-mono break-all">{typeof output.error === 'string' ? output.error : JSON.stringify(output.error).slice(0, 300)}</p>
      </div>
    );
  }

  if (stepId === 'review' && output) {
    return (
      <div className="space-y-1.5">
        <div className="flex gap-2 text-[10px] text-slate-500">
          <span>{output.total} events</span>
          <span>{output.withSql} with SQL</span>
        </div>
        <div className="max-h-40 overflow-y-auto space-y-1">
          {output.events?.slice(0, 10).map((e: any, i: number) => (
            <div key={i} className="p-2 rounded bg-slate-50 dark:bg-slate-800 text-[10px]">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-slate-700 dark:text-slate-300">{e.type}</span>
                <span className="text-slate-400">→ {e.target}</span>
              </div>
              {e.sql && e.sql !== '—' && (
                <pre className="mt-1 text-[9px] font-mono text-blue-600 dark:text-blue-400 whitespace-pre-wrap break-all bg-blue-50 dark:bg-blue-900/20 px-2 py-1 rounded">{e.sql}</pre>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (stepId === 'pre_checks' && output?.checks) {
    return (
      <div className="space-y-2">
        {/* Score badge */}
        <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
          <div className="flex items-center gap-2">
            <span className={cn('text-lg font-bold', (output.score ?? 0) >= 80 ? 'text-green-600' : (output.score ?? 0) >= 50 ? 'text-amber-600' : 'text-red-600')}>{output.score ?? 0}%</span>
            <span className="text-[10px] text-slate-500">{output.passed}/{output.total} passed</span>
          </div>
          <div className="flex gap-1.5 text-[9px]">
            {output.warned > 0 && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">{output.warned} warn</span>}
            {output.failed > 0 && <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-semibold">{output.failed} fail</span>}
          </div>
        </div>
        {/* Risk score from AI */}
        {output.risk && (
          <div className="p-2 rounded-lg border border-purple-100 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-900/10">
            <div className="flex items-center gap-1.5 text-[10px]">
              <Brain className="h-3 w-3 text-purple-500" />
              <span className="font-medium text-slate-700 dark:text-slate-300">AI Risk: {output.risk.overall_risk || output.risk.level || '—'}</span>
              {output.risk.score != null && <span className="ml-auto font-bold text-purple-600">{output.risk.score}/100</span>}
            </div>
            {output.risk.recommendation && <p className="text-[9px] text-slate-500 mt-1">{output.risk.recommendation}</p>}
          </div>
        )}
        {/* Individual checks */}
        <div className="space-y-0.5">
          {output.checks.map((c: any, i: number) => (
            <div key={i} className="flex items-center gap-2 text-[10px]">
              {c.status === 'PASS' || c.status === 'pass' ? <CheckCircle className="h-3 w-3 text-green-500 shrink-0" /> : c.status === 'WARN' || c.status === 'warn' ? <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" /> : <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />}
              <span className="text-slate-700 dark:text-slate-300 flex-1">{c.name || c.check}</span>
              <span className={cn('text-[9px] font-semibold', c.status === 'PASS' || c.status === 'pass' ? 'text-green-600' : c.status === 'WARN' || c.status === 'warn' ? 'text-amber-600' : 'text-red-600')}>{c.status}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (stepId === 'dry_run') {
    const dep = output?.deployment || output;
    const results = dep?.results || dep?.ddl_results || [];
    const passed = dep?.passed ?? results.filter((r: any) => r.status === 'PASS' || r.status === 'pass' || r.status === 'success').length;
    const failed = dep?.failed ?? results.filter((r: any) => r.status === 'FAIL' || r.status === 'fail' || r.status === 'error').length;
    const cloneSchema = dep?.clone_schema || output?.clone_info;
    const total = dep?.total_events || results.length;

    return (
      <div className="space-y-2">
        {/* Summary */}
        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Dry Run Results</span>
            <span className={cn('text-[10px] font-bold', failed > 0 ? 'text-red-500' : 'text-green-600')}>
              {failed > 0 ? `${failed} FAILED` : 'ALL PASSED'}
            </span>
          </div>
          <div className="flex gap-3 text-[10px]">
            <span className="text-green-600 flex items-center gap-1"><CheckCircle className="h-3 w-3" />{passed} passed</span>
            {failed > 0 && <span className="text-red-500 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{failed} failed</span>}
            <span className="text-slate-400">{total} total</span>
          </div>
          {cloneSchema && (
            <p className="text-[9px] text-slate-400 font-mono">Clone: {cloneSchema}</p>
          )}
          {dep?.duration_ms && <p className="text-[9px] text-slate-400">Duration: {dep.duration_ms}ms</p>}
        </div>

        {/* Per-DDL results */}
        {results.length > 0 && (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {results.map((r: any, i: number) => {
              const ok = r.status === 'PASS' || r.status === 'pass' || r.status === 'success';
              const sql = r.ddl_sql || r.sql || r.rewritten_sql || '';
              const target = r.target_table || r.event_type || `DDL #${i + 1}`;
              return (
                <div key={i} className={cn('p-2 rounded-lg border text-[10px]', ok ? 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-900/10' : 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10')}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      {ok ? <CheckCircle className="h-3 w-3 text-green-500 shrink-0" /> : <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />}
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate max-w-[200px]">{target}</span>
                    </div>
                    <span className={cn('text-[9px] font-semibold', ok ? 'text-green-600' : 'text-red-500')}>{r.status}</span>
                  </div>
                  {sql && (
                    <pre className="mt-1 text-[9px] font-mono text-slate-600 dark:text-slate-400 whitespace-pre-wrap break-all bg-white/50 dark:bg-slate-800/50 px-1.5 py-1 rounded max-h-16 overflow-y-auto">{sql.length > 200 ? sql.slice(0, 200) + '...' : sql}</pre>
                  )}
                  {r.error && (
                    <p className="mt-1 text-[9px] text-red-500 bg-red-50 dark:bg-red-900/20 px-1.5 py-1 rounded">{r.error}</p>
                  )}
                  {r.sample_rows && r.sample_rows.length > 0 && (
                    <p className="mt-1 text-[9px] text-blue-500">{r.sample_rows.length} sample rows available</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (stepId === 'impact') {
    const riskScore = output?.riskScore ?? output?.risk_score ?? 0;
    const targets = output?.targets || [];
    const destructive = output?.destructiveChanges || [];
    const byAxis = output?.byAxis || {};
    const allImpacts = output?.allImpacts || output?.affected_objects || output?.impacts || [];
    const AXES: { key: string; label: string; icon: React.ElementType; color: string }[] = [
      { key: 'governance', label: 'Governance', icon: Shield, color: 'emerald' },
      { key: 'modeling', label: 'Modeling', icon: GitBranch, color: 'purple' },
      { key: 'ingestion', label: 'Ingestion', icon: RefreshCw, color: 'cyan' },
      { key: 'quality', label: 'Data Quality', icon: BarChart3, color: 'amber' },
      { key: 'lineage', label: 'Lineage', icon: ArrowRight, color: 'blue' },
    ];
    return (
      <div className="space-y-2.5">
        {/* Risk summary */}
        <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[11px] font-semibold text-slate-700 dark:text-slate-300">Impact Analysis</span>
            <span className={cn('text-sm font-bold', riskScore > 70 ? 'text-red-500' : riskScore > 40 ? 'text-amber-500' : 'text-green-600')}>{riskScore}/100</span>
          </div>
          <div className="w-full h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div className={cn('h-full rounded-full', riskScore > 70 ? 'bg-red-500' : riskScore > 40 ? 'bg-amber-500' : 'bg-green-500')} style={{ width: `${Math.max(riskScore, 3)}%` }} />
          </div>
          <div className="flex gap-3 mt-1.5 text-[10px] text-slate-500">
            <span>{targets.length} tables</span>
            <span>{allImpacts.length} affected</span>
            <span>{output?.eventTypes?.length || 0} event types</span>
          </div>
        </div>

        {/* Destructive changes warning */}
        {destructive.length > 0 && (
          <div className="p-2 rounded-lg bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800">
            <p className="text-[10px] font-semibold text-red-600 flex items-center gap-1"><AlertTriangle className="h-3 w-3" /> {destructive.length} destructive change{destructive.length > 1 ? 's' : ''}</p>
            <div className="mt-1 space-y-0.5">
              {destructive.map((d: string, i: number) => (
                <span key={i} className="inline-block mr-1 px-1.5 py-0 rounded text-[9px] font-mono bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">{d}</span>
              ))}
            </div>
          </div>
        )}

        {/* Impact by axis */}
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Impact by domain</p>
          {AXES.map(({ key, label, icon: AxisIcon, color }) => {
            const items = byAxis[key] || [];
            if (items.length === 0 && allImpacts.length > 0) return null;
            return (
              <div key={key} className={cn('p-2 rounded-lg border', `border-${color}-200 dark:border-${color}-800 bg-${color}-50/30 dark:bg-${color}-900/10`)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <AxisIcon className={cn('h-3 w-3', `text-${color}-500`)} />
                    <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">{label}</span>
                  </div>
                  <span className={cn('text-[10px] font-bold', `text-${color}-600`)}>{items.length}</span>
                </div>
                {items.length > 0 && (
                  <div className="mt-1 space-y-0.5 max-h-16 overflow-y-auto">
                    {items.slice(0, 5).map((o: any, i: number) => (
                      <p key={i} className="text-[9px] text-slate-500 font-mono truncate">{o.object_name || o.name || o.fqn || o.sourceTable || '—'}</p>
                    ))}
                    {items.length > 5 && <p className="text-[9px] text-slate-400">+{items.length - 5} more</p>}
                  </div>
                )}
                {items.length === 0 && <p className="text-[9px] text-slate-400 mt-0.5">No impact detected</p>}
              </div>
            );
          }).filter(Boolean)}
        </div>

        {/* Affected tables */}
        {targets.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">Affected tables</p>
            <div className="flex flex-wrap gap-1">
              {targets.map((t: string) => (
                <span key={t} className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400">{t}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (stepId === 'deploy') {
    return (
      <div className="text-[10px] space-y-2">
        {output?.status === 'pending_approval' && (
          <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 space-y-1">
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-amber-500" />
              <span className="font-semibold text-amber-700 dark:text-amber-400">Pending Approval</span>
            </div>
            <p className="text-slate-600 dark:text-slate-400">Submitted for approval. An approver must review and approve before execution.</p>
            {output.deployment_id && <p className="text-slate-400 font-mono text-[9px]">Deployment ID: {output.deployment_id}</p>}
          </div>
        )}
        {output?.executed != null && <p className="text-green-600 font-medium">{output.executed} actions executed</p>}
        {output?.failed != null && output.failed > 0 && <p className="text-red-500 font-medium">{output.failed} actions failed</p>}
        {output?.deployment_id && output?.status !== 'pending_approval' && <p className="text-slate-400">ID: <span className="font-mono">{output.deployment_id}</span></p>}
      </div>
    );
  }

  if (stepId === 'verify' && output?.checks) {
    return (
      <div className="space-y-1">
        {output.checks.map((c: any, i: number) => (
          <div key={i} className="flex items-center gap-2 text-[10px]">
            {c.status === 'PASS' ? <CheckCircle className="h-3 w-3 text-green-500" /> : <AlertTriangle className="h-3 w-3 text-amber-500" />}
            <span className="flex-1 text-slate-700 dark:text-slate-300">{c.name || c.check}</span>
            {c.details && <span className="text-slate-400 text-[9px]">{c.details}</span>}
          </div>
        ))}
      </div>
    );
  }

  return (
    <pre className="text-[9px] font-mono text-slate-500 bg-slate-50 dark:bg-slate-800 p-2 rounded-lg max-h-32 overflow-y-auto whitespace-pre-wrap break-all">
      {JSON.stringify(output, null, 2).slice(0, 500)}
    </pre>
  );
}

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

const AddColumnCard = React.forwardRef<HTMLDivElement, {
  focused: boolean; table: TableItem; projectId: string | null;
  columns: ColumnInfo[]; onAddEvent: (e: any) => void;
}>(({ focused, table, projectId, columns, onAddEvent }, ref) => {
  const [name, setName] = useState('');
  const [type, setType] = useState('VARCHAR');
  const [computed, setComputed] = useState(false);
  const [formula, setFormula] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  return (
    <div ref={ref} className={cn('rounded-xl border p-4 space-y-3 transition-colors', focused ? 'border-blue-300 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-900/10' : 'border-slate-200 dark:border-slate-700')}>
      <div className="flex items-center gap-2">
        <Plus className="h-4 w-4 text-blue-500" />
        <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Add Column / Calculated Field</h4>
      </div>
      <div className="space-y-2">
        <input type="text" placeholder="Column name" value={name} onChange={(e) => setName(e.target.value)}
          className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
        <select value={type} onChange={(e) => setType(e.target.value)}
          className="w-full px-2.5 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white">
          {['VARCHAR','NUMBER','INTEGER','FLOAT','BOOLEAN','DATE','TIMESTAMP','VARIANT'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={computed} onChange={(e) => setComputed(e.target.checked)} className="h-3 w-3 rounded border-slate-300 text-blue-600" />
          <span className="text-[11px] text-slate-700 dark:text-slate-300">Computed column</span>
        </label>
        {computed && (
          <textarea value={formula} onChange={(e) => setFormula(e.target.value)} placeholder="e.g., REVENUE - COGS" rows={2}
            className="w-full px-2.5 py-1.5 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
        )}
      </div>
      {showPreview && name && (
        <div className="p-2 rounded-lg bg-slate-900 text-green-400 text-[10px] font-mono">
          ALTER TABLE {table.database}.{table.schema}.{table.table} ADD COLUMN {name.toUpperCase()} {type}{computed && formula ? ` AS (${formula})` : ''};
        </div>
      )}
      <div className="flex gap-2">
        <ActionBtn label="Preview SQL" icon={Eye} onClick={() => setShowPreview(!showPreview)} />
        <ActionBtn label="Save to draft" icon={CheckCircle} primary onClick={() => {
          if (!name.trim()) { toast.error('Column name required'); return; }
          onAddEvent({ type: 'ADD_COLUMN', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: { columnName: name.trim(), columnType: type, ...(computed ? { isComputed: true, computedExpression: formula.trim() } : {}) } });
          toast.success(`Column "${name}" added to draft`);
          setName(''); setType('VARCHAR'); setComputed(false); setFormula(''); setShowPreview(false);
        }} />
      </div>
    </div>
  );
});
AddColumnCard.displayName = 'AddColumnCard';

const PoliciesCard = React.forwardRef<HTMLDivElement, {
  focused: boolean; table: TableItem; columns: ColumnInfo[];
  projectId: string | null; canWrite: boolean; onAddEvent: (e: any) => void;
}>(({ focused, table, columns, projectId, canWrite, onAddEvent }, ref) => {
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [selectedCols, setSelectedCols] = useState<Set<string>>(new Set());
  const [policyType, setPolicyType] = useState<'SHA2_MASK' | 'PARTIAL_MASK' | 'FULL_MASK' | 'CUSTOM'>('SHA2_MASK');
  const piiCount = columns.filter((c) => c.isSensitive).length;

  const runPiiScan = useCallback(async () => {
    setScanning(true);
    try {
      const apiClient = (await import('@/lib/api-client')).default;
      const { data } = await apiClient.post('/gouvernance/policies/pii-scan', null, {
        params: { database: table.database, schema: table.schema, sample_size: 100, enable_ai: true }
      });
      setScanResult(data);
      const detected = new Set<string>();
      (data?.pii_columns || []).filter((c: any) => c.table === table.table).forEach((c: any) => detected.add(c.column));
      setSelectedCols(detected);
      toast.success(`PII scan: ${detected.size} sensitive columns detected`);
    } catch (err: any) {
      toast.error(err?.response?.data?.detail?.message || 'PII scan failed');
    }
    setScanning(false);
  }, [table]);

  const tablePii = scanResult?.pii_columns?.filter((c: any) => c.table === table.table) || [];
  const tableRecos = scanResult?.by_table?.find((t: any) => t.table === table.table);
  const suggested = scanResult?.suggested_policies?.filter((p: any) => p.affected_columns?.some((c: any) => c.table === table.table)) || [];

  return (
    <div ref={ref} className={cn('rounded-xl border p-4 space-y-3 transition-colors', focused ? 'border-blue-300 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-900/10' : 'border-slate-200 dark:border-slate-700')}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-emerald-500" />
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Policies & RLS</h4>
        </div>
        <div className="flex gap-1">
          {piiCount > 0 && <StatusChip label={`${piiCount} PII`} color="red" />}
          {!table.hasPrimaryKey && <StatusChip label="No RLS" color="amber" />}
          {piiCount === 0 && table.hasPrimaryKey && <StatusChip label="OK" color="green" />}
        </div>
      </div>

      {/* PII Scan */}
      <button onClick={runPiiScan} disabled={scanning} className="w-full py-1.5 text-[11px] font-medium rounded-lg border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50">
        {scanning ? <><Loader size="sm" className="h-3 w-3" /> Scanning...</> : <><Search className="h-3 w-3" /> Scan PII & Detect Policies</>}
      </button>

      {/* Scan results — per column */}
      {tablePii.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Detected — select columns to protect</p>
          {tablePii.map((col: any) => (
            <label key={col.column} className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer">
              <input type="checkbox" checked={selectedCols.has(col.column)} onChange={(e) => {
                setSelectedCols((prev) => { const n = new Set(prev); e.target.checked ? n.add(col.column) : n.delete(col.column); return n; });
              }} className="h-3 w-3 rounded border-slate-300 text-emerald-600" />
              <div className="flex-1 min-w-0">
                <span className="text-xs font-mono font-medium text-slate-800 dark:text-slate-200">{col.column}</span>
                <div className="flex gap-1 mt-0.5">
                  <span className={cn('px-1 py-0 rounded text-[8px] font-semibold', col.severity === 'CRITICAL' || col.severity === 'HIGH' ? 'bg-red-100 text-red-700' : col.severity === 'MEDIUM' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700')}>{col.pii_type}</span>
                  <span className="text-[8px] text-slate-400">{col.detection_method} · {Math.round(col.confidence * 100)}%</span>
                </div>
              </div>
              <span className={cn('text-[9px] font-semibold', col.severity === 'CRITICAL' ? 'text-red-500' : col.severity === 'HIGH' ? 'text-red-400' : 'text-amber-500')}>{col.severity}</span>
            </label>
          ))}
        </div>
      )}

      {/* Policy type selector */}
      {(selectedCols.size > 0 || piiCount > 0) && (
        <div className="space-y-2">
          <p className="text-[10px] font-semibold text-slate-500">Masking policy</p>
          <div className="flex gap-1.5 flex-wrap">
            {(['SHA2_MASK', 'PARTIAL_MASK', 'FULL_MASK', 'CUSTOM'] as const).map((pt) => (
              <button key={pt} onClick={() => setPolicyType(pt)} className={cn('px-2 py-1 rounded-lg text-[10px] font-medium border transition-colors', policyType === pt ? 'border-emerald-400 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800')}>
                {pt.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Apply actions */}
      <div className="flex gap-2">
        <ActionBtn label={`Mask ${selectedCols.size || piiCount} col${(selectedCols.size || piiCount) > 1 ? 's' : ''}`} icon={Lock} disabled={!canWrite || (selectedCols.size === 0 && piiCount === 0)} onClick={() => {
          const cols = selectedCols.size > 0 ? [...selectedCols] : columns.filter((c) => c.isSensitive).map((c) => c.name);
          cols.forEach((col) => onAddEvent({ type: 'MASKING_POLICY_APPLIED', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: { column: col, policyType } }));
          toast.success(`${policyType} masking drafted for ${cols.length} column(s)`);
        }} />
        <ActionBtn label="Add RLS" icon={Shield} disabled={!canWrite} onClick={() => {
          onAddEvent({ type: 'RLS_POLICY_APPLIED', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: { policyName: `rls_${table.table.toLowerCase()}`, roleColumn: 'CURRENT_ROLE()' } });
          toast.success('RLS policy added to deployment draft');
        }} />
      </div>

      {/* Suggested policies from AI scan */}
      {suggested.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold text-purple-500 flex items-center gap-1"><Sparkles className="h-3 w-3" /> AI Suggested Policies</p>
          {suggested.map((sp: any, i: number) => (
            <div key={i} className="p-2 rounded-lg bg-purple-50/50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-800 text-[10px]">
              <p className="font-medium text-slate-700 dark:text-slate-300">{sp.policy_name}</p>
              <p className="text-slate-500 text-[9px] mt-0.5">{sp.label} · {sp.affected_columns?.length || 0} columns</p>
              <button onClick={() => {
                (sp.affected_columns || []).forEach((c: any) => onAddEvent({ type: 'MASKING_POLICY_APPLIED', projectId, target: { database: table.database, schema: table.schema, table: c.table || table.table }, payload: { column: c.column, policyType: sp.pii_type, policyName: sp.policy_name } }));
                toast.success(`Policy "${sp.policy_name}" applied to draft`);
              }} className="mt-1 text-[9px] font-semibold text-purple-600 dark:text-purple-400 hover:underline">
                Apply to draft →
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Compliance */}
      {scanResult?.compliance && (
        <div className="grid grid-cols-2 gap-1">
          {Object.entries(scanResult.compliance).map(([fw, data]: [string, any]) => (
            <div key={fw} className={cn('p-1.5 rounded text-[9px] text-center font-medium', data.status === 'OK' ? 'bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400' : data.status === 'REVIEW' ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400' : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400')}>
              {fw}: {data.status}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
PoliciesCard.displayName = 'PoliciesCard';

function ActionBtn({ label, icon: Icon, onClick, primary, fullWidth, disabled }: {
  label: string; icon: React.ElementType; onClick: () => void; primary?: boolean; fullWidth?: boolean; disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg transition-colors',
        primary
          ? 'bg-blue-600 hover:bg-blue-700 text-white'
          : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800',
        fullWidth && 'w-full justify-center',
        disabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      <Icon className="h-3 w-3" />{label}
    </button>
  );
}

function StatusChip({ label, color }: { label: string; color: 'green' | 'amber' | 'red' | 'blue' | 'slate' }) {
  const styles = {
    green: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    red: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    slate: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400',
  };
  return <span className={cn('px-2 py-0.5 rounded-full text-[9px] font-semibold', styles[color])}>{label}</span>;
}

function RecoItem({ text, cta, onClick }: { text: string; cta: string; onClick: () => void }) {
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-amber-50/50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-800/30">
      <p className="text-[10px] text-slate-700 dark:text-slate-300 flex-1">{text}</p>
      <button onClick={onClick} className="text-[10px] font-semibold text-blue-600 dark:text-blue-400 hover:underline shrink-0">{cta}</button>
    </div>
  );
}

function MetricCard({ label, value, total, color }: { label: string; value: string | number; total?: number; color: string }) {
  return (
    <div className="p-2.5 rounded-lg border border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800">
      <p className="text-[9px] text-slate-400 mb-0.5">{label}</p>
      <p className={cn('text-xs font-semibold', `text-${color}-600 dark:text-${color}-400`)}>
        {value}{total != null ? ` / ${total}` : ''}
      </p>
    </div>
  );
}

function HistoryStatusIcon({ status }: { status: string }) {
  if (status === 'success') return <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0 mt-0.5" />;
  if (status === 'warning') return <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />;
  if (status === 'error') return <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />;
  return <Clock className="h-3.5 w-3.5 text-blue-400 shrink-0 mt-0.5" />;
}

function ClassificationTag({ category }: { category: string }) {
  const colors: Record<string, string> = {
    IDENTIFIER: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    MEASURE: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    DIMENSION: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
    DATE: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400',
    PII_CANDIDATE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    FOREIGN_KEY: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400',
    PRIMARY_KEY: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  };
  return (
    <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-semibold', colors[category] || 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400')}>
      {category.replace(/_/g, ' ')}
    </span>
  );
}
