'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  ReactFlowProvider,
  ReactFlowInstance,
  BackgroundVariant,
  MarkerType,
} from 'reactflow';
// @ts-ignore — CSS import handled by Next.js bundler
import 'reactflow/dist/style.css';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  Play, Save, Trash2, ChevronRight, ChevronLeft,
  Loader2, History, AlertCircle, AlertTriangle, CheckCircle,
  Eye, Code, Calendar, Sparkles, Users, X, Clock,
  Download, Copy, FolderOpen, Plus, Pause, Tag, Bug,
} from 'lucide-react';
import { Loader, Button } from 'rizzui';
import { motion, AnimatePresence } from 'framer-motion';

// Components
import ETLPalette from './components/ETLPalette';
import ETLConfigSidebar from './components/ETLConfigSidebar';
import ScheduleManager from './components/ScheduleManager';
import WorkflowProjectGate from './components/WorkflowProjectGate';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

import ETLExecutionHistory from './components/ETLExecutionHistory';
import AccessManagementSlot from '@/app/(dashboard)/explore-design/components/AccessManagementSlot';
import { etlNodeTypes } from './components/ETLNodeTypes';
import { getBlockByType, convertLegacyType } from './components/etl-blocks';
import { auditCatalogCoherence } from './components/catalog-coherence';
import GuidedAiWorkflowWizard from './components/GuidedAiWorkflowWizard';
import ImportTasksModal from './components/ImportTasksModal';
import ProjectGatePanel from '@/components/project-onboarding/ProjectGatePanel';
import UnifiedProjectWizard, {
  type UnifiedProjectWizardResult,
} from '@/components/project-onboarding/UnifiedProjectWizard';
import ManualAiTemplateFork, {
  type BuildMode,
} from '@/components/project-onboarding/ManualAiTemplateFork';
import {
  WORKFLOW_TEMPLATES,
  templateToReactFlow,
} from '@/components/project-onboarding/workflow-templates';
import RunApprovalStatusHero from './components/RunApprovalStatusHero';
import RollbackVersionDialog from './components/RollbackVersionDialog';
import { validateGraph } from './components/etl-catalog-grounding';
import CustomConnectionLine from './components/CustomConnectionLine';
import {
  Dialog as UiDialog,
  DialogContent as UiDialogContent,
  DialogHeader as UiDialogHeader,
  DialogTitle as UiDialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

// Workflow API services
import * as workflowApi from '@/app/services/api/workflowApi';
import { listProjects, listContributors } from '@/app/services/api/projectsApi';
import apiClient, { getApiErrorMessage } from '@/lib/api-client';
import { useAtomValue } from 'jotai';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import type { ContributorRole } from '@/app/services/api/types';
import type {
  Workflow,
  WorkflowStep,
  WorkflowActionType,
  WorkflowExecutionResponse,
  CompileWorkflowResponse,
  ValidateWorkflowResponse,
} from '@/app/services/api/types';

// ============================================
// TYPES
// ============================================

interface ETLPipelineBuilderProps {
  className?: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/** Safely extract a string from an error that might be an object {error_code, message} */
function extractErrorString(err: unknown): string {
  if (!err) return '';
  if (typeof err === 'string') return err;
  if (typeof err === 'object') {
    const obj = err as Record<string, unknown>;
    if (typeof obj.message === 'string') return obj.message;
    if (typeof obj.detail === 'string') return obj.detail;
    if (typeof obj.error_code === 'string') return obj.error_code;
    return JSON.stringify(err);
  }
  return String(err);
}

/**
 * Translate a raw Snowflake / backend error into a headline + actionable hint.
 * The runs panel pasted the full ODBC-style payload before; now the user sees:
 *   "Couldn't record this run in the audit log" / "Try Run again" / [Show raw]
 * The original string is still available behind a disclosure.
 */
function friendlyError(raw: string): { headline: string; hint?: string; isPlatform: boolean } {
  const text = raw || '';
  // Non-null violation on PROJECT_RUNS.STARTED_BY (screenshot #6 case).
  if (/100072|NULL result in a non-nullable column/i.test(text)
      && /PROJECT_RUNS|EVENT_STORE/i.test(text)) {
    return {
      headline: 'Couldn’t record this run in the audit log',
      hint: 'The backend tried to insert a NULL into PROJECT_RUNS.STARTED_BY. Re-run after the session refreshes, or report to admin if it persists.',
      isPlatform: true,
    };
  }
  // Generic non-null violation.
  if (/100072|NULL result in a non-nullable column/i.test(text)) {
    const col = text.match(/non-nullable column ([A-Z_]+)/i)?.[1];
    return {
      headline: 'A required column was empty',
      hint: col ? `Column ${col} cannot be NULL. Check the block before this step and fill it in.` : 'A required column was empty — check the upstream block.',
      isPlatform: false,
    };
  }
  // Constraint / referential integrity.
  if (/\b(23000|23001|23502|23503|23505)\b/.test(text)) {
    return {
      headline: 'Constraint violation in the destination table',
      hint: 'A primary key, unique, or foreign key constraint was broken. Check duplicates, missing parents, or column nullability.',
      isPlatform: false,
    };
  }
  // Backend's deployment/approval SQL bug: references CHANGES_SUMMARY column
  // that the EVENT_STORE doesn't have (screenshot #12 case). Platform-side.
  if (/invalid identifier ['"]?CHANGES_SUMMARY['"]?/i.test(text)) {
    return {
      headline: 'Couldn’t submit for approval — platform-side',
      hint: 'The deployment endpoint references a missing column (CHANGES_SUMMARY) in the audit table. Report to admin; pipeline-side changes won’t fix this.',
      isPlatform: true,
    };
  }
  // Generic Snowflake compile / SQL error.
  if (/SQL compilation error|invalid identifier|syntax error/i.test(text)) {
    const col = text.match(/invalid identifier ['"]?([A-Z_]+)['"]?/i)?.[1];
    return {
      headline: 'Snowflake refused the compiled SQL',
      hint: col
        ? `Column "${col}" doesn’t exist in the referenced table. Open the SQL tab to see the failing statement.`
        : 'The generated SQL references a table or column that doesn’t exist. Open the SQL tab to see the failing statement.',
      isPlatform: false,
    };
  }
  // Cortex / warehouse timeout.
  if (/QUERY_CANCELLED|604|warehouse.*suspend|timeout/i.test(text)) {
    return {
      headline: 'Snowflake cancelled the query',
      hint: 'Warehouse limit hit or query took too long. Try a smaller sample, or wait for the warehouse to resume.',
      isPlatform: false,
    };
  }
  // Auth / permission.
  if (/insufficient privileges|access denied|401|403/i.test(text)) {
    return {
      headline: 'You don’t have permission for this action',
      hint: 'Ask an account admin to grant the required role to your user.',
      isPlatform: false,
    };
  }
  // Fallback: keep the original short headline if it fits.
  const short = text.length > 120 ? text.slice(0, 117) + '…' : text;
  return { headline: short, isPlatform: false };
}

function generateId(): string {
  return `comp_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

// Build CreateWorkflowStepInput array from ReactFlow nodes/edges
// Payload uses flat keys matching the API (database_name, schema_name, etc.)
// plus reserved keys: inputs (step_ids this step reads from), cte_alias, position, nodeId
function nodesToStepInputs(nodes: Node[], edges: Edge[]) {
  return nodes.map((node) => {
    const inputs = edges
      .filter((edge) => edge.target === node.id)
      .map((edge) => edge.source);

    const config = node.data?.config || node.data || {};
    const stepName = node.data?.name || node.type || 'step';
    const nodeType = node.type || 'source';

    // Derive flat payload keys from structured config for backend template compatibility
    const derived: Record<string, any> = {};

    // Filter: conditions[] → filter_condition string
    if (nodeType === 'filter' && Array.isArray(config.conditions) && config.conditions.length > 0 && !config.filter_condition) {
      const logic = config.logic || 'AND';
      derived.filter_condition = config.conditions
        .map((c: any) => {
          const val = typeof c.value === 'string' ? `'${c.value.replace(/'/g, "''")}'` : c.value;
          return `${c.column} ${c.operator || '='} ${val}`;
        })
        .join(` ${logic} `);
    }

    // Aggregate: aggregations[] → flat keys for template
    if (nodeType === 'aggregate' && Array.isArray(config.aggregations) && config.aggregations.length > 0) {
      const agg = config.aggregations[0];
      if (!config.agg_type) derived.agg_type = agg.function || 'COUNT';
      if (!config.column) derived.column = agg.column || '*';
      if (!config.new_kpi_name) derived.new_kpi_name = agg.alias || `${agg.function}_${agg.column}`;
      if (Array.isArray(config.group_by)) {
        derived.group_by_columns = config.group_by.join(', ');
      }
    }

    // Sort: keep order_by array for reload, add flat order_by_str for backend
    if (nodeType === 'sort' && Array.isArray(config.order_by) && config.order_by.length > 0) {
      derived.order_by = config.order_by; // keep structured array
      derived.order_by_str = config.order_by
        .map((o: any) => typeof o === 'object' ? `${o.column} ${o.direction || 'ASC'}` : o)
        .join(', ');
    }

    // Formula: formulas[] → backend expects { formulas: [{ name, expression }] }
    // For single formula also derive flat expression + output_column as fallback
    if (nodeType === 'formula' && Array.isArray(config.formulas) && config.formulas.length > 0) {
      derived.formulas = config.formulas.map((f: any) => ({
        name: f.name || f.alias || 'COMPUTED',
        expression: f.expression || '',
      }));
      if (!config.expression) {
        const f = config.formulas[0];
        derived.expression = f.expression || '';
        derived.output_column = f.name || f.alias || 'COMPUTED';
      }
    }

    // Limit: limit → row_count
    if (nodeType === 'limit' && config.limit && !config.row_count) {
      derived.row_count = config.limit;
    }

    // Select: columns array → comma-separated string for backend template
    if (nodeType === 'select' && Array.isArray(config.columns) && config.columns.length > 0) {
      derived.columns = config.columns.join(', ');
    }

    // Rename: mappings object → flat old_name/new_name for backend template
    if (nodeType === 'rename' && config.mappings && typeof config.mappings === 'object') {
      const entries = Object.entries(config.mappings);
      if (entries.length > 0) {
        derived.old_name = entries[0][0];
        derived.new_name = entries[0][1];
      }
    }

    // Cast: casts object → flat column/target_type for backend template
    if (nodeType === 'cast' && config.casts && typeof config.casts === 'object') {
      const entries = Object.entries(config.casts);
      if (entries.length > 0) {
        derived.column = entries[0][0];
        derived.target_type = entries[0][1];
      }
    }

    return {
      action_type: convertLegacyType(nodeType) as WorkflowActionType,
      step_name: stepName,
      payload: {
        ...config,
        ...derived,
        inputs,
        cte_alias: stepName.toLowerCase().replace(/\s+/g, '_'),
        position: node.position,
        nodeId: node.id,
      },
    };
  });
}

// Convert workflow steps to ReactFlow nodes/edges
// Payload stores flat keys (database_name, schema_name, etc.) + reserved keys (inputs, cte_alias, position, nodeId)
function stepsToReactFlow(steps: WorkflowStep[]): { nodes: Node[]; edges: Edge[] } {
  // Build step_order → nodeId map for API-created pipelines
  const orderToNodeId: Record<string, string> = {};

  const nodes: Node[] = steps.map((step, idx) => {
    const payload = step.payload || {};
    // Auto-layout: horizontal flow (left→right), stagger vertically for joins
    const isSource = step.action_type === 'source' || step.action_type?.endsWith('_source');
    const sourceCount = steps.filter((s, i) => i < idx && (s.action_type === 'source' || s.action_type?.endsWith('_source'))).length;
    const nonSourceIdx = idx - steps.filter((s, i) => i <= idx && (s.action_type === 'source' || s.action_type?.endsWith('_source'))).length + (isSource ? 0 : steps.filter(s => s.action_type === 'source' || s.action_type?.endsWith('_source')).length);
    const defaultPos = isSource
      ? { x: 50, y: 50 + sourceCount * 250 }
      : { x: 100 + nonSourceIdx * 350, y: 150 };
    const position = (payload.position as { x: number; y: number }) || defaultPos;
    const stepName = step.step_name;
    const nodeId = (payload.nodeId as string) || step.step_id;

    // Map step_order to nodeId for edge resolution
    orderToNodeId[String(step.step_order)] = nodeId;

    // Extract config (everything except reserved keys)
    const { inputs: _inputs, cte_alias: _cte, position: _pos, nodeId: _nid,
            input_step: _is, left_step: _ls, right_step: _rs, ...config } = payload;

    return {
      id: nodeId,
      type: convertLegacyType(step.action_type),
      position,
      data: {
        ...config,
        name: stepName,
        step_order: step.step_order,
        config,
      },
    };
  });

  const edges: Edge[] = [];
  steps.forEach((step) => {
    const payload = step.payload || {};
    const nodeId = (payload.nodeId as string) || step.step_id;
    const blockDef = getBlockByType(step.action_type);

    // Method 1: Frontend-saved format — payload.inputs = [nodeId1, nodeId2]
    const inputs = (payload.inputs as string[]) || [];
    if (inputs.length > 0) {
      inputs.forEach((inputId, index) => {
        edges.push({
          id: `${inputId}-${nodeId}`,
          source: inputId,
          target: nodeId,
          targetHandle: blockDef?.maxInputs === 2 ? `input${index + 1}` : undefined,
          markerEnd: { type: MarkerType.ArrowClosed, color: '#10B981' },
          style: { strokeWidth: 2, stroke: '#10B981' },
          animated: false,
        });
      });
      return;
    }

    // Method 2: API-created format — left_step/right_step (join) or input_step (others)
    const leftStep = payload.left_step as string;
    const rightStep = payload.right_step as string;
    const inputStep = payload.input_step as string;

    if (leftStep && orderToNodeId[leftStep]) {
      edges.push({
        id: `${orderToNodeId[leftStep]}-${nodeId}-L`,
        source: orderToNodeId[leftStep],
        target: nodeId,
        targetHandle: 'input1',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#10B981' },
        style: { strokeWidth: 2, stroke: '#10B981' },
        animated: false,
      });
    }
    if (rightStep && orderToNodeId[rightStep]) {
      edges.push({
        id: `${orderToNodeId[rightStep]}-${nodeId}-R`,
        source: orderToNodeId[rightStep],
        target: nodeId,
        targetHandle: 'input2',
        markerEnd: { type: MarkerType.ArrowClosed, color: '#10B981' },
        style: { strokeWidth: 2, stroke: '#10B981' },
        animated: false,
      });
    }
    if (inputStep && orderToNodeId[inputStep] && !leftStep) {
      edges.push({
        id: `${orderToNodeId[inputStep]}-${nodeId}`,
        source: orderToNodeId[inputStep],
        target: nodeId,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#10B981' },
        style: { strokeWidth: 2, stroke: '#10B981' },
        animated: false,
      });
    }
  });

  // Method 3: Infer edges from step_order when no explicit connections exist
  // If a non-source step has no incoming edge, connect it to the previous step by order
  if (edges.length === 0 && steps.length > 1) {
    const sortedSteps = [...steps].sort((a, b) => (a.step_order ?? 0) - (b.step_order ?? 0));
    for (let i = 1; i < sortedSteps.length; i++) {
      const prevStep = sortedSteps[i - 1];
      const currStep = sortedSteps[i];
      const prevId = (prevStep.payload?.nodeId as string) || prevStep.step_id;
      const currId = (currStep.payload?.nodeId as string) || currStep.step_id;
      const currBlockDef = getBlockByType(currStep.action_type);
      // Skip if current step is a source (sources have no input)
      if (currStep.action_type === 'source' || currStep.action_type?.endsWith('_source')) continue;
      edges.push({
        id: `inferred-${prevId}-${currId}`,
        source: prevId,
        target: currId,
        targetHandle: currBlockDef?.maxInputs === 2 ? 'input1' : undefined,
        markerEnd: { type: MarkerType.ArrowClosed, color: '#94A3B8' },
        style: { strokeWidth: 1.5, stroke: '#94A3B8', strokeDasharray: '5,5' },
        animated: false,
        label: 'inferred',
      });
    }
  }

  return { nodes, edges };
}

// ============================================
// MAIN COMPONENT
// ============================================

const ETLPipelineBuilder: React.FC<ETLPipelineBuilderProps> = ({ className }) => {
  const { isAuthenticated } = useAuth();
  const accessToken = typeof window !== 'undefined' ? (localStorage.getItem('access_token') || localStorage.getItem('snowflake_token') || '') : '';

  // URL search params for shareable links: ?project=<workflow_id>
  // Capture the initial ?project value ONCE at mount so the URL-sync effect can't
  // strip it before the workflows list arrives.
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const initialProjectIdRef = useRef<string | null>(
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('project')
      : null,
  );
  const projectGateDismissedRef = useRef(false);

  // ReactFlow state
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [reactFlowInstance, setReactFlowInstance] = useState<ReactFlowInstance | null>(null);

  // Pipeline/Workflow state
  const [activeWorkflowId, setActiveWorkflowId] = useState<string | null>(null);
  const [activeWorkflowName, setActiveWorkflowName] = useState<string>('New Workflow');
  const [pipelineName, setPipelineName] = useState('New Workflow');
  const [isSaving, setIsSaving] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [isPipelineLoading, setIsPipelineLoading] = useState(false);
  // Approval state: 'none' | 'pending' | 'approved'
  const [approvalStatus, setApprovalStatus] = useState<'none' | 'pending' | 'approved'>('none');
  const isPendingApproval = approvalStatus === 'pending';
  const isApproved = approvalStatus === 'approved';
  const [executionRefreshKey, setExecutionRefreshKey] = useState(0);

  // Dev-only catalog coherence audit — surfaces drift between
  // etl-blocks-catalog.json, ETL_BLOCKS, and etlNodeTypes.
  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const issues = auditCatalogCoherence();
    if (issues.length === 0) return;
    // Group as a single console.warn so it's collapsible in DevTools.
    /* eslint-disable no-console */
    console.warn(`[catalog-coherence] ${issues.length} discrepancies found:`, issues);
    /* eslint-enable no-console */
  }, []);

  // SSE: listen for deployment approval changes and refresh approval status
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  useEffect(() => {
    if (!lastInvalidation || !activeWorkflowId) return;
    const relevant = lastInvalidation.keys.some((k: string) =>
      k === 'deployments' || k === 'projects'
    );
    if (!relevant || approvalStatus === 'none') return;
    // Re-check deployment status from backend
    workflowApi.listDeployments(activeWorkflowId, { limit: 1 })
      .then((res: any) => {
        const latest = res?.deployments?.[0];
        if (!latest) return;
        if (latest.status === 'approved') setApprovalStatus('approved');
        else if (latest.status === 'pending_approval') setApprovalStatus('pending');
        else setApprovalStatus('none');
      })
      .catch(() => {});
  }, [lastInvalidation, activeWorkflowId, approvalStatus]);

  // Dirty state tracking for unsaved indicator + incremental save
  const [isDirty, setIsDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const lastSavedNodesRef = useRef<string>('');
  const lastSavedEdgesRef = useRef<string>('');
  const dirtyNodeIdsRef = useRef<Set<string>>(new Set());

  // UI state
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showPalette, setShowPalette] = useState(true);
  const [showSidebar, setShowSidebar] = useState(false);
  const [activeTab, setActiveTab] = useState<'runs' | 'schedules' | 'sql' | 'ai' | 'results'>('runs');
  const [showMembers, setShowMembers] = useState(false);
  // Right panel closed by default — gives the canvas full width on landing.
  // User opens it via the "Panel" toggle button in the top-right when they
  // need Results / Runs / SQL / Schedule / AI tabs.
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [showErrorPanel, setShowErrorPanel] = useState(false);
  // Modals — both opened from the header (PDF page 8 #1 + #2).
  const [showAiGenerate, setShowAiGenerate] = useState(false);
  const [showImportTasks, setShowImportTasks] = useState(false);
  // UnifiedProjectWizard (manual / AI / template fork) for project creation.
  const [showCreateWizard, setShowCreateWizard] = useState(false);
  // Description seeded into the AI workflow wizard when the user picked the
  // AI fork in the UnifiedProjectWizard / "Change approach" affordance.
  const [aiSeedDescription, setAiSeedDescription] = useState<string>('');
  // "Change approach" affordance — re-opens the fork for an existing project.
  const [showApproachFork, setShowApproachFork] = useState(false);
  // After an AI-generated workflow auto-saves, show a one-time hint
  // banner telling the user to configure each block before running. Auto-
  // dismissed by clicking the X or starting to configure a node.
  const [aiNextStepHint, setAiNextStepHint] = useState(false);

  // Workflow tags (chip strip in header). Loaded from getWorkflow when a
  // workflow is opened; saving back to the backend isn't wired (no
  // updateWorkflow endpoint yet) so the tagsGap flag drives a Backend-Gap
  // tooltip on the "+ tag" affordance.
  const [workflowTags, setWorkflowTags] = useState<string[]>([]);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  // Auto-save / draft restore state.
  const [draftRestorePrompt, setDraftRestorePrompt] = useState<null | {
    key: string;
    payload: { nodes: Node[]; edges: Edge[]; pipelineName: string; savedAt: number };
  }>(null);
  const lastLoadedUpdatedAtRef = useRef<number>(0);

  // Header action modals — schedule popover + rollback dialog.
  // Kept here so the four new CTAs (Suspend/Resume/Schedule/Rollback) are
  // wired without touching the right panel or other modules.
  const [showScheduleDialog, setShowScheduleDialog] = useState(false);
  const [showRollbackDialog, setShowRollbackDialog] = useState(false);
  const [isSuspendingTask, setIsSuspendingTask] = useState(false);

  // Results preview state
  const [previewData, setPreviewData] = useState<{ columns: string[]; rows: Record<string, any>[]; total_rows: number; table: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Role-based access
  const { username: currentUsername } = useAuth();
  const [userRole, setUserRole] = useState<ContributorRole | null>(null);
  const isReadOnly = userRole === 'viewer';

  const readOnlyGuard = useCallback(() => {
    if (isReadOnly) {
      toast.error('You have view-only access to this workflow');
      return true;
    }
    return false;
  }, [isReadOnly]);

  // Execution state
  const [lastExecution, setLastExecution] = useState<WorkflowExecutionResponse | null>(null);
  const [compiledSql, setCompiledSql] = useState<CompileWorkflowResponse | null>(null);
  const [validation, setValidation] = useState<ValidateWorkflowResponse | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<string | null>(null);
  const [aiSuggestionsLoading, setAiSuggestionsLoading] = useState(false);
  // Persistent error display (shown in Runs panel instead of disappearing toast)
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  // ─── Live client-side validation ───────────────────────────────────────
  // Runs on every graph change (debounced) so a stale "Validation: …" banner
  // clears automatically as soon as the user fixes the issue, instead of
  // forcing them to re-click Validate. The deep server-side validate (which
  // costs credits) stays gated behind the explicit button.
  useEffect(() => {
    if (!pipelineError || !pipelineError.startsWith('Validation:')) return;
    const t = window.setTimeout(() => {
      const v = validateGraph(
        nodes.map((n) => ({ id: n.id, type: String(n.type), data: n.data as Record<string, unknown> })),
        edges.map((e) => ({ source: e.source, target: e.target })),
      );
      if (v.ok) {
        setPipelineError(null);
        setValidation((prev) => (prev && !prev.valid ? { ...prev, valid: true, error: undefined } : prev));
      }
    }, 600);
    return () => window.clearTimeout(t);
  }, [nodes, edges, pipelineError]);

  // ============================================
  // LOAD DATA
  // ============================================

  // Load workflows on mount
  const loadWorkflowsFn = useCallback(
    // mine_only=false: same reason as ProjectSelector — backend's "mine" filter
    // is contributor-based and returns 0 for accountadmins on projects they made.
    () => listProjects({ project_type: 'workflow', mine_only: false }),
    [accessToken]
  );

  const { data: workflowsData, loading: isLoading, error: loadErrorObj, refetch: loadWorkflows } = useCacheAwareQuery(
    loadWorkflowsFn,
    { cacheKeys: [CACHE_KEYS.WORKFLOWS], enabled: !!accessToken, initialData: null }
  );

  const workflows = useMemo(
    () =>
      (workflowsData?.projects || []).map((p: any) => ({
        id: p.project_id,
        name: p.project_name,
        created_by: p.created_by,
        created_at: p.created_at,
        tags: p.tags ?? null,
      })),
    [workflowsData]
  );
  const loadError = loadErrorObj ? (getApiErrorMessage(loadErrorObj) || 'Failed to load workflows') : null;

  // ============================================
  // HEADER CTA STATE — Schedule + Versions
  // ============================================
  // Drives the four new header buttons (Suspend / Resume / Schedule / Rollback).
  // Both queries re-run automatically when activeWorkflowId changes via the
  // `enabled` flag + memoised fetcher.

  const loadHeaderSchedulesFn = useCallback(
    () =>
      activeWorkflowId
        ? workflowApi.getWorkflowSchedules(activeWorkflowId)
        : Promise.resolve({ workflow_id: '', schedules: [], count: 0 }),
    [activeWorkflowId],
  );
  const {
    data: headerSchedulesData,
    refetch: refetchHeaderSchedules,
  } = useCacheAwareQuery(loadHeaderSchedulesFn, {
    cacheKeys: [CACHE_KEYS.WORKFLOWS],
    enabled: !!activeWorkflowId,
    initialData: null,
  });

  const loadHeaderVersionsFn = useCallback(
    () =>
      activeWorkflowId
        ? workflowApi.listVersions(activeWorkflowId, { limit: 10 })
        : Promise.resolve({ versions: [], count: 0 }),
    [activeWorkflowId],
  );
  const { data: headerVersionsData } = useCacheAwareQuery(
    loadHeaderVersionsFn,
    {
      cacheKeys: [CACHE_KEYS.WORKFLOWS],
      enabled: !!activeWorkflowId,
      initialData: null,
    },
  );

  // useScheduleState — derive header CTA visibility from the schedules payload.
  // hasSchedule:  at least one schedule exists.
  // isSuspended:  primary schedule is not in the 'started' state (matches
  //               ScheduleManager which uses `state === 'started'` for active).
  // cronSummary:  human-friendly string for the "Scheduled · edit" pill.
  const scheduleState = useMemo(() => {
    const schedules = headerSchedulesData?.schedules ?? [];
    if (schedules.length === 0) {
      return {
        hasSchedule: false,
        isSuspended: false,
        isStarted: false,
        cronSummary: '',
        scheduleId: null as string | null,
      };
    }
    const primary = schedules[0];
    const isStarted = primary.state === 'started';
    return {
      hasSchedule: true,
      isStarted,
      isSuspended: !isStarted,
      cronSummary: primary.schedule || primary.cron_expression || '',
      scheduleId: primary.schedule_id ?? null,
    };
  }, [headerSchedulesData]);

  const hasVersions = (headerVersionsData?.versions?.length ?? 0) > 0;

  // ---- Suspend / Resume handlers --------------------------------------
  const handleSuspendTask = useCallback(async () => {
    if (!activeWorkflowId || isSuspendingTask) return;
    if (readOnlyGuard()) return;
    setIsSuspendingTask(true);
    try {
      await workflowApi.suspendTask(activeWorkflowId);
      toast.success('Scheduled task suspended');
      refetchHeaderSchedules();
    } catch (err) {
      console.error('Suspend failed:', err);
      toast.error(getApiErrorMessage(err) || 'Failed to suspend task');
    } finally {
      setIsSuspendingTask(false);
    }
  }, [activeWorkflowId, isSuspendingTask, readOnlyGuard, refetchHeaderSchedules]);

  const handleResumeTask = useCallback(async () => {
    if (!activeWorkflowId || isSuspendingTask) return;
    if (readOnlyGuard()) return;
    setIsSuspendingTask(true);
    try {
      await workflowApi.resumeTask(activeWorkflowId);
      toast.success('Scheduled task resumed');
      refetchHeaderSchedules();
    } catch (err) {
      console.error('Resume failed:', err);
      toast.error(getApiErrorMessage(err) || 'Failed to resume task');
    } finally {
      setIsSuspendingTask(false);
    }
  }, [activeWorkflowId, isSuspendingTask, readOnlyGuard, refetchHeaderSchedules]);

  // Keyboard shortcuts
  const handleSaveRef = useRef<(() => void) | null>(null);
  const handleExecuteRef = useRef<((dryRun: boolean) => void) | null>(null);
  // Global aria-live announcement for keyboard shortcuts (⌘S, ⌘Enter)
  // so screen-reader users get the same "Saved" feedback as the toast.
  const [shortcutAnnounce, setShortcutAnnounce] = useState<string>('');
  // Stable ref so the keydown listener (mounted once) reads the latest read-only flag.
  const isReadOnlyRef = useRef(isReadOnly);
  useEffect(() => { isReadOnlyRef.current = isReadOnly; }, [isReadOnly]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (isReadOnlyRef.current) {
          const msg = 'View-only — save disabled';
          toast.error(msg);
          setShortcutAnnounce(msg);
          return;
        }
        handleSaveRef.current?.();
        const msg = 'Saved · ⌘S';
        toast.success(msg, { id: 'cmd-s-saved' });
        setShortcutAnnounce(msg);
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleExecuteRef.current?.(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty && nodes.length > 0) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty, nodes.length]);

  // ── Local-storage auto-save (debounced 30s) ──
  // Writes a draft snapshot under data360.workflow.autosave.<id|draft>
  // so users don't lose 30 min of canvas work to a tab crash. Independent
  // from the backend save (which still requires the Save button).
  const autosaveKey = useMemo(
    () => `data360.workflow.autosave.${activeWorkflowId ?? 'draft'}`,
    [activeWorkflowId],
  );
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (isReadOnly) return;
    if (nodes.length === 0) return; // don't write empty drafts
    const handle = window.setTimeout(() => {
      try {
        const payload = {
          nodes,
          edges,
          pipelineName,
          savedAt: Date.now(),
        };
        window.localStorage.setItem(autosaveKey, JSON.stringify(payload));
      } catch {
        // Quota exceeded or private-mode — silently skip.
      }
    }, 30_000);
    return () => window.clearTimeout(handle);
  }, [nodes, edges, pipelineName, autosaveKey, isReadOnly]);

  // ── Draft restore prompt ──
  // After loading a workflow, check whether a local draft exists newer than
  // the workflow's last-known timestamp. If so, surface a soft ConfirmDialog
  // asking the user whether to restore.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!activeWorkflowId) return;
    try {
      const raw = window.localStorage.getItem(autosaveKey);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { nodes: Node[]; edges: Edge[]; pipelineName: string; savedAt: number };
      if (!parsed?.savedAt) return;
      // Draft must be newer than the loaded workflow's timestamp.
      if (parsed.savedAt <= lastLoadedUpdatedAtRef.current) return;
      // Draft must differ from what we just loaded — skip if same node count and same names.
      if (parsed.nodes?.length === nodes.length) {
        const sameNames = (parsed.nodes ?? []).every((n: Node, i: number) => {
          const cur = nodes[i];
          return cur && cur.id === n.id;
        });
        if (sameNames) return;
      }
      setDraftRestorePrompt({ key: autosaveKey, payload: parsed });
    } catch {
      // Malformed payload — drop it.
      try { window.localStorage.removeItem(autosaveKey); } catch { /* noop */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkflowId]);

  // Auto-fit canvas after loading a workflow
  useEffect(() => {
    if (reactFlowInstance && nodes.length > 0 && !isLoading) {
      setTimeout(() => reactFlowInstance.fitView({ padding: 0.2, duration: 300 }), 100);
    }
  }, [reactFlowInstance, isLoading]);

  // Collapse right panel on small screens
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 1200) {
      setShowRightPanel(false);
    }
  }, []);

  // Keep URL in sync with the active workflow for shareable links.
  // Guard the strip branch with !isLoading && !isPipelineLoading so we don't clobber a
  // deep-link ?project=<id> before the auto-select effect has had a chance to consume it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const current = searchParams?.get('project') || null;
    if (activeWorkflowId && current !== activeWorkflowId) {
      const params = new URLSearchParams(searchParams?.toString() || '');
      params.set('project', activeWorkflowId);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    } else if (!activeWorkflowId && current && !isLoading && !isPipelineLoading) {
      const params = new URLSearchParams(searchParams?.toString() || '');
      params.delete('project');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : (pathname || '/workflow'), { scroll: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeWorkflowId, isLoading, isPipelineLoading]);

  // If the active right-pane tab becomes disabled (canvas empty), fall back to AI
  useEffect(() => {
    const emptyDisabledTabs: Array<typeof activeTab> = ['results', 'runs', 'sql', 'schedules'];
    if (nodes.length === 0 && emptyDisabledTabs.includes(activeTab)) {
      setActiveTab('ai');
    }
  }, [nodes.length, activeTab]);

  // ============================================
  // DRAG AND DROP
  // ============================================

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      if (isReadOnly) { toast.error('You have view-only access to this workflow'); return; }

      const type = event.dataTransfer.getData('application/reactflow');
      if (!type || !reactFlowInstance || !reactFlowWrapper.current) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode: Node = {
        id: generateId(),
        type,
        position,
        data: { config: {} },
      };

      setNodes((nds) => [...nds, newNode]);
      setIsDirty(true);
      dirtyNodeIdsRef.current.add(newNode.id);
    },
    [reactFlowInstance, setNodes]
  );

  // ============================================
  // CONNECTIONS
  // ============================================

  // Reject illegal connections WHILE the user is dragging — ReactFlow uses
  // this to colour the target handle red and prevent the drop instead of
  // letting the user release into nothing and then yelling with a toast.
  // (Old UX from screenshot #7: "Filter can only have 1 input(s)" toast.)
  const isValidConnection = useCallback(
    (params: Connection) => {
      if (isReadOnly) return false;
      if (!params.source || !params.target) return false;
      if (params.source === params.target) return false; // no self-loops

      const targetNode = nodes.find((n) => n.id === params.target);
      if (!targetNode) return false;
      const blockDef = getBlockByType(targetNode.type || '');
      if (!blockDef) return false;

      // Already-connected source → target combo is not a new edge.
      const exists = edges.some(
        (e) => e.source === params.source && e.target === params.target,
      );
      if (exists) return false;

      // Saturated input port: maxInputs reached.
      const existingInputs = edges.filter((e) => e.target === params.target).length;
      if (existingInputs >= blockDef.maxInputs) return false;

      return true;
    },
    [isReadOnly, nodes, edges],
  );

  // Tracks the source node id while the user is dragging a connection out.
  // Read by `enrichedNodes` to add a glow class on every node that could
  // legally receive this edge — pro-UX hint that you can drop here.
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);

  const onConnectStart = useCallback((_: unknown, params: { nodeId: string | null }) => {
    setConnectingFromId(params.nodeId);
  }, []);
  const onConnectEnd = useCallback(() => {
    setConnectingFromId(null);
  }, []);

  // Predicate variant taking only the two ids — used by the custom
  // connection line during the drag (no Connection object available yet).
  const isValidPair = useCallback(
    (sourceId: string, targetId: string) => {
      if (sourceId === targetId) return false;
      const targetNode = nodes.find((n) => n.id === targetId);
      if (!targetNode) return false;
      const blockDef = getBlockByType(targetNode.type || '');
      if (!blockDef) return false;
      const dup = edges.some((e) => e.source === sourceId && e.target === targetId);
      if (dup) return false;
      const existingInputs = edges.filter((e) => e.target === targetId).length;
      return existingInputs < blockDef.maxInputs;
    },
    [nodes, edges],
  );

  const onConnect = useCallback(
    (params: Connection) => {
      // isValidConnection already gates illegal drops, but ReactFlow still
      // calls onConnect for the legal path — keep this lean.
      if (!params.source || !params.target) return;
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            markerEnd: { type: MarkerType.ArrowClosed, color: '#10B981' },
            style: { strokeWidth: 2, stroke: '#10B981' },
            animated: false,
          },
          eds,
        ),
      );
      setIsDirty(true);
    },
    [setEdges],
  );

  // ============================================
  // NODE SELECTION & EDITING
  // ============================================

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
    setShowSidebar(true);
    // User is following the AI hint — dismiss the banner.
    setAiNextStepHint(false);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setShowSidebar(false);
    // Dynamically adapt the right-panel tab when the user deselects a node.
    // Without this, a stale Schedule / SQL / Results tab from the previous
    // selection lingers even though the canvas no longer has anything
    // selected. Pick the most-useful tab for the current workflow state:
    //   - empty canvas → AI (where the user starts)
    //   - has a last run → Results
    //   - otherwise → Runs (where errors surface)
    setActiveTab((current) => {
      // Don't override if user is actively on AI / Runs (sticky-friendly).
      if (current === 'ai' || current === 'runs') return current;
      if (nodes.length === 0) return 'ai';
      if (lastExecution) return 'results';
      return 'runs';
    });
  }, [nodes.length, lastExecution]);

  const handleNodeSave = useCallback(
    (nodeId: string, data: any) => {
      if (readOnlyGuard()) return;
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId
            ? { ...node, data: { ...node.data, ...data } }
            : node
        )
      );
      setIsDirty(true);
      dirtyNodeIdsRef.current.add(nodeId);
      toast.success('Node configuration saved');
    },
    [setNodes]
  );

  const handleNodeDelete = useCallback(
    (nodeId: string) => {
      if (readOnlyGuard()) return;
      setNodes((nds) => nds.filter((node) => node.id !== nodeId));
      setEdges((eds) =>
        eds.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)
      );
      setSelectedNode(null);
      setShowSidebar(false);
      toast.success('Node deleted');
    },
    [setNodes, setEdges]
  );

  // ============================================
  // COLUMN PROPAGATION
  // ============================================

  /**
   * Recursively calculate output columns for a node based on its type and upstream inputs.
   * This enables column propagation through the entire pipeline.
   */
  const getNodeOutputColumns = useCallback((nodeId: string, visited: Set<string> = new Set()): string[] => {
    // Prevent infinite loops in circular graphs
    if (visited.has(nodeId)) return [];
    visited.add(nodeId);

    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return [];

    const nodeType = node.type || '';
    const config = node.data?.config || node.data || {};

    // Get input columns from upstream nodes
    const inputEdges = edges.filter((e) => e.target === nodeId);
    const getUpstreamColumns = (): string[] => {
      const allColumns: string[] = [];
      inputEdges.forEach((edge) => {
        const upstreamCols = getNodeOutputColumns(edge.source, new Set(visited));
        allColumns.push(...upstreamCols);
      });
      return Array.from(new Set(allColumns));
    };

    // Calculate output columns based on node type
    switch (nodeType) {
      // SOURCE: Returns selected columns from the table
      case 'source':
      case 'src':
      case 's3_source':
      case 'azure_source':
      case 'gcs_source':
      case 'postgres_source':
      case 'mysql_source':
      case 'external_table_source':
      case 'dynamic_table_source':
      case 'shared_data_source':
      case 'salesforce_source':
      case 'sap_source':
      case 'oracle_source':
      case 'hubspot_source':
      case 'servicenow_source':
      case 'api_source':
      case 'stream_consume': {
        const columns = config.columns || [];
        return Array.isArray(columns) ? (columns as string[]) : [];
      }

      // JOIN: Combine columns from both inputs (minus excluded columns)
      case 'join':
      case 'join_tables': {
        const sortedEdges = inputEdges.sort((a, b) =>
          (a.targetHandle || '').localeCompare(b.targetHandle || '')
        );
        const leftCols: string[] = [];
        const rightCols: string[] = [];

        sortedEdges.forEach((edge, index) => {
          const upstreamCols = getNodeOutputColumns(edge.source, new Set(visited));
          if (index === 0) {
            leftCols.push(...upstreamCols);
          } else {
            rightCols.push(...upstreamCols);
          }
        });

        // Exclude specified right columns (to avoid duplicates like join keys)
        const excludeRight = config.exclude_right_columns || [];
        const filteredRight = rightCols.filter((c) => !excludeRight.includes(c));

        return [...leftCols, ...filteredRight];
      }

      // AGGREGATE: Returns ALL upstream columns + aggregation aliases (window function approach)
      case 'aggregate':
      case 'aggregate_kpi': {
        const upstreamCols = getUpstreamColumns();
        const aggregations = config.aggregations || [];
        const aggAliases = aggregations
          .map((agg: { alias?: string; column?: string; function?: string }) =>
            agg.alias || `${agg.function}_${agg.column}`)
          .filter(Boolean);
        return [...upstreamCols, ...aggAliases];
      }   

      // SELECT: Returns only the selected columns
      case 'select': {
        const selectedCols = config.columns || [];
        return Array.isArray(selectedCols) ? (selectedCols as string[]) : [];
      }

      // RENAME: Returns columns with renamed names applied
      case 'rename': {
        const upstreamCols = getUpstreamColumns();
        const mappings: Record<string, string> = config.mappings || {};
        return upstreamCols.map((col) => mappings[col] || col);
      }

      // FORMULA: Returns input columns + new formula column names
      case 'formula':
      case 'normalize': {
        const upstreamCols = getUpstreamColumns();
        const formulas = config.formulas || [];
        const newColumns = formulas
          .map((f: { name?: string }) => f.name)
          .filter(Boolean);
        return [...upstreamCols, ...newColumns];
      }

      // CAST: Columns remain the same (only types change)
      case 'cast': {
        return getUpstreamColumns();
      }

      // RECOMMENDATION: Passes through + adds score column
      case 'recommendation': {
        const upstreamCols = getUpstreamColumns();
        const scoreCol = config.score_column;
        return scoreCol ? [...upstreamCols, scoreCol] : upstreamCols;
      }

      // SEGMENTATION: Passes through + adds segment column
      case 'segmentation': {
        const upstreamCols = getUpstreamColumns();
        const segCol = config.segment_column;
        return segCol ? [...upstreamCols, segCol] : upstreamCols;
      }

      // CLUSTERING: Passes through + adds cluster column
      case 'clustering': {
        const upstreamCols = getUpstreamColumns();
        const clusterCol = config.cluster_column;
        return clusterCol ? [...upstreamCols, clusterCol] : upstreamCols;
      }

      // FILTER, SORT, DISTINCT, LIMIT: Pass through all upstream columns unchanged
      case 'filter':
      case 'drop_nulls':
      case 'sort':
      case 'distinct':
      case 'drop_duplicates':
      case 'limit':
      case 'fill_nulls':
      case 'date_transform':
      case 'time_slice': {
        return getUpstreamColumns();
      }

      // WINDOW functions: Pass through + add computed column
      case 'window_rank':
      case 'window_lag_lead':
      case 'window_aggregate':
      case 'window_ntile': {
        const upstreamCols = getUpstreamColumns();
        const outputCol = config.output_column || config.alias;
        return outputCol ? [...upstreamCols, outputCol] : upstreamCols;
      }

      // CASE WHEN / SPLIT: Pass through + add new column
      case 'case_when': {
        const upstreamCols = getUpstreamColumns();
        const newCol = config.output_column || config.alias;
        return newCol ? [...upstreamCols, newCol] : upstreamCols;
      }

      case 'split_column': {
        const upstreamCols = getUpstreamColumns();
        const parts: string[] = config.output_columns || [];
        return [...upstreamCols, ...(Array.isArray(parts) ? parts : [])];
      }

      // JSON transforms: Pass through + add extracted/flattened columns
      case 'json_flatten':
      case 'json_extract': {
        const upstreamCols = getUpstreamColumns();
        const extractedCols: string[] = config.output_columns || config.columns || [];
        return [...upstreamCols, ...(Array.isArray(extractedCols) ? extractedCols : [])];
      }

      case 'json_construct': {
        const upstreamCols = getUpstreamColumns();
        const jsonCol = config.output_column || 'JSON_OUTPUT';
        return [...upstreamCols, jsonCol];
      }

      // PIVOT / UNPIVOT: Schema-changing — use config output columns or pass through
      case 'pivot':
      case 'unpivot': {
        const outputCols: string[] = config.output_columns || config.columns || [];
        return Array.isArray(outputCols) && outputCols.length > 0
          ? outputCols
          : getUpstreamColumns();
      }

      // AI Functions: Pass through + add AI output column
      case 'ai_classify':
      case 'ai_sentiment':
      case 'ai_translate':
      case 'ai_extract':
      case 'ai_complete': {
        const upstreamCols = getUpstreamColumns();
        const aiCol = config.output_column || config.alias || `${nodeType}_result`;
        return [...upstreamCols, aiCol];
      }

      // ML Training / Prediction: Pass through + add prediction columns
      case 'classification_train':
      case 'anomaly_detect':
      case 'forecast': {
        const upstreamCols = getUpstreamColumns();
        const predCol = config.output_column || 'PREDICTION';
        return [...upstreamCols, predCol];
      }

      // Code blocks: Output columns unknown at design time — pass through
      case 'sql_script':
      case 'python_script':
      case 'notebook_run':
      case 'create_udf':
      case 'create_procedure':
      case 'apply_udf':
      case 'finetune':
      case 'document_ai': {
        return getUpstreamColumns();
      }

      // UNION: Combine columns from all inputs (use first input's column order)
      case 'union': {
        if (inputEdges.length === 0) return [];
        // Use columns from first input as the schema
        return getNodeOutputColumns(inputEdges[0].source, new Set(visited));
      }

      // DESTINATION / EXPORT / DYNAMIC TABLE: Sinks, pass through columns for reference
      case 'destination':
      case 'export_file':
      case 'export_excel':
      case 'dynamic_table': {
        return getUpstreamColumns();
      }

      default:
        return getUpstreamColumns();
    }
  }, [nodes, edges]);

  // Get available columns for selected node (uses column propagation)
  const getAvailableColumns = useCallback((): string[] => {
    if (!selectedNode) return [];

    // Get columns from all input nodes using propagation
    const inputEdges = edges.filter((e) => e.target === selectedNode.id);
    const columns: string[] = [];

    inputEdges.forEach((edge) => {
      const upstreamCols = getNodeOutputColumns(edge.source);
      columns.push(...upstreamCols);
    });

    return Array.from(new Set(columns));
  }, [selectedNode, edges, getNodeOutputColumns]);

  // Get columns for join node inputs (uses column propagation)
  const getJoinInputColumns = useCallback((): { left: string[]; right: string[] } => {
    if (!selectedNode || (selectedNode.type !== 'join_tables' && selectedNode.type !== 'join')) return { left: [], right: [] };

    const inputEdges = edges
      .filter((e) => e.target === selectedNode.id)
      .sort((a, b) => (a.targetHandle || '').localeCompare(b.targetHandle || ''));

    const left: string[] = [];
    const right: string[] = [];

    inputEdges.forEach((edge, index) => {
      const upstreamCols = getNodeOutputColumns(edge.source);
      if (index === 0) {
        left.push(...upstreamCols);
      } else {
        right.push(...upstreamCols);
      }
    });

    return { left, right };
  }, [selectedNode, edges, getNodeOutputColumns]);

  // ============================================
  // PIPELINE OPERATIONS
  // ============================================

  const handleNewPipeline = useCallback(() => {
    setNodes([]);
    setEdges([]);
    setActiveWorkflowId(null);
    setActiveWorkflowName('New Workflow');
    setPipelineName('New Workflow');
    setLastExecution(null);
    setCompiledSql(null);
    setValidation(null);
    setUserRole('owner'); // creating new = you're the owner
    setIsDirty(false);
    dirtyNodeIdsRef.current.clear();
    setSaveStatus('idle');
    setWorkflowTags([]);
    lastLoadedUpdatedAtRef.current = 0;
  }, [setNodes, setEdges]);

  const handleLoadPipeline = useCallback(
    async (wf: { id: string; name: string }) => {
      try {
        setIsPipelineLoading(true);
        // Fetch full workflow metadata (tags, created_at) alongside steps.
        // getWorkflow was previously dead in app code — now used to feed
        // the header tags chip strip and the draft-restore comparison.
        const [stepsResponse, workflowMeta] = await Promise.all([
          workflowApi.listSteps(wf.id),
          workflowApi.getWorkflow(wf.id).catch(() => null),
        ]);
        const { nodes: newNodes, edges: newEdges } = stepsToReactFlow(stepsResponse.steps || []);
        setNodes(newNodes);
        setEdges(newEdges);
        setActiveWorkflowId(wf.id);
        setActiveWorkflowName(wf.name);
        setPipelineName(wf.name);
        setWorkflowTags(workflowMeta?.tags ?? []);
        lastLoadedUpdatedAtRef.current = workflowMeta?.created_at
          ? new Date(workflowMeta.created_at).getTime()
          : 0;
        setIsDirty(false);
        setApprovalStatus('none');
        dirtyNodeIdsRef.current.clear();
        setSaveStatus('idle');

        // Determine user's role for this workflow project
        try {
          const contributors = await listContributors(wf.id);
          const me = contributors.find(
            (c) => c.username.toLowerCase() === currentUsername.toLowerCase()
          );
          setUserRole(me?.role ?? 'owner');
        } catch {
          setUserRole('owner');
        }

        // Check if there's an active pending/approved deployment
        try {
          const deploymentsRes = await workflowApi.listDeployments(wf.id, { limit: 1 });
          const latest = (deploymentsRes as any)?.deployments?.[0];
          if (latest?.status === 'pending_approval') {
            setApprovalStatus('pending');
          } else if (latest?.status === 'approved') {
            setApprovalStatus('approved');
          }
        } catch {
          // ignore — deployment check is non-critical
        }

        toast.success(`Loaded workflow: ${wf.name}`);
      } catch (error) {
        console.error('Failed to load workflow:', error);
        toast.error('Failed to load workflow');
      } finally {
        setIsPipelineLoading(false);
      }
    },
    [setNodes, setEdges]
  );

  // Auto-select workflow from URL ?project=<id> once workflows are loaded
  useEffect(() => {
    const initialId = initialProjectIdRef.current;
    if (
      initialId &&
      !activeWorkflowId &&
      workflows.length > 0 &&
      !isPipelineLoading
    ) {
      const wf = workflows.find((w) => w.id === initialId);
      if (wf) {
        projectGateDismissedRef.current = true;
        handleLoadPipeline(wf);
      }
      // Consume the initial value so a subsequent state change can't retrigger this.
      initialProjectIdRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workflows.length]);

  const handleSavePipeline = useCallback(async () => {
    if (readOnlyGuard()) return;
    if (nodes.length === 0) {
      toast.error('Cannot save empty workflow');
      return;
    }

    setIsSaving(true);
    setPipelineError(null);
    try {
      const stepInputs = nodesToStepInputs(nodes, edges);

      if (activeWorkflowId) {
        // Incremental save: only update modified steps
        const existing = await workflowApi.listSteps(activeWorkflowId);
        const existingSteps = existing.steps || [];
        const dirtyIds = dirtyNodeIdsRef.current;

        for (let i = 0; i < stepInputs.length; i++) {
          const nodeId = stepInputs[i].payload?.nodeId;
          const isNew = i >= existingSteps.length;
          const isModified = !nodeId || dirtyIds.has(nodeId) || dirtyIds.size === 0;

          if (isNew) {
            await workflowApi.addStep(activeWorkflowId, stepInputs[i]);
          } else if (isModified) {
            await workflowApi.updateStep(activeWorkflowId, existingSteps[i].step_id, {
              step_name: stepInputs[i].step_name,
              payload: { ...stepInputs[i].payload, action_type: stepInputs[i].action_type },
            });
          }
          // else: unchanged — skip API call
        }

        // Delete removed steps
        if (existingSteps.length > stepInputs.length) {
          for (let i = stepInputs.length; i < existingSteps.length; i++) {
            await workflowApi.deleteStep(activeWorkflowId, existingSteps[i].step_id).catch(() => {});
          }
        }

        toast.success('Workflow updated');
      } else {
        // Create new
        const response = await workflowApi.createWorkflow({
          project_name: pipelineName,
          steps: stepInputs,
        });
        setActiveWorkflowId(response.project_id);
        setActiveWorkflowName(response.project_name);
        toast.success('Workflow created');
      }

      // Mark clean
      setIsDirty(false);
      dirtyNodeIdsRef.current.clear();
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
      // Drop the local autosave: the canonical version now lives in the backend.
      try {
        if (typeof window !== 'undefined') {
          window.localStorage.removeItem(autosaveKey);
        }
      } catch {
        /* noop */
      }

      // Refresh workflow list
      await loadWorkflows();
    } catch (error: any) {
      console.error('Failed to save workflow:', error);
      const errMsg = getApiErrorMessage(error) || 'Failed to save workflow';
      toast.error(errMsg);
      setPipelineError(`Save failed: ${errMsg}`);
    } finally {
      setIsSaving(false);
    }
  }, [nodes, edges, pipelineName, activeWorkflowId, autosaveKey]);
  handleSaveRef.current = handleSavePipeline;

  const handleDeletePipeline = useCallback(async () => {
    if (readOnlyGuard()) return;
    if (!activeWorkflowId) return;

    if (!confirm(`Delete workflow "${activeWorkflowName}"?`)) return;

    try {
      // Delete all steps to effectively clear the workflow
      const existing = await workflowApi.listSteps(activeWorkflowId);
      for (const step of existing.steps || []) {
        await workflowApi.deleteStep(activeWorkflowId, step.step_id).catch((err: any) => {
          if (err?.response?.status !== 404) throw err;
        });
      }
      await loadWorkflows();
      handleNewPipeline();
      toast.success('Workflow deleted');
    } catch (error) {
      console.error('Failed to delete workflow:', error);
      toast.error('Failed to delete workflow');
    }
  }, [activeWorkflowId, activeWorkflowName, handleNewPipeline]);

  // ============================================
  // RESULTS PREVIEW
  // ============================================

  const loadResultsPreview = useCallback(async () => {
    // Find the destination node to get database/schema/table
    const destNode = nodes.find((n) => n.type === 'destination');
    const config = destNode?.data?.config || destNode?.data || {};
    const database = config.database_name || config.database;
    const schema = config.schema_name || config.schema;
    const table = config.table_name || config.table;

    if (!database || !schema || !table) {
      // No destination configured — show execution summary only
      setPreviewData(null);
      setPreviewError(null);
      setActiveTab('results');
      setShowRightPanel(true);
      return;
    }

    setPreviewLoading(true);
    setPreviewError(null);
    setActiveTab('results');
    setShowRightPanel(true);

    try {
      const { data } = await apiClient.get('/workflow/preview-table', {
        params: { database, schema, table, limit: 100 },
      });
      setPreviewData(data);
    } catch (err: any) {
      console.error('Failed to load results preview:', err);
      setPreviewError(getApiErrorMessage(err) || 'Failed to load table preview');
    } finally {
      setPreviewLoading(false);
    }
  }, [nodes]);

  // ============================================
  // EXECUTION
  // ============================================

  const handleExecute = useCallback(
    async (dryRun: boolean = false) => {
      if (!dryRun && readOnlyGuard()) return;
      setPipelineError(null); // Clear previous errors
      if (!activeWorkflowId && nodes.length === 0) {
        setPipelineError('No workflow to execute. Add blocks to the canvas first.');
        return;
      }

      if (!activeWorkflowId) {
        setPipelineError('Save the workflow first before executing.');
        return;
      }

      setIsExecuting(true);
      try {
        if (dryRun) {
          // Compile (dry-run): generates SQL without executing
          const compileResult = await workflowApi.compileWorkflow(activeWorkflowId);
          setCompiledSql(compileResult);
          setActiveTab('sql');
          toast.success('SQL generated (dry run)');
        } else {
          // Execute
          const response = await workflowApi.executeWorkflow(activeWorkflowId, {
            trigger_type: 'manual',
          });
          setLastExecution(response);

          if (response.status === 'completed' || response.status === 'success') {
            toast.success(`Executed successfully! ${response.rows_affected || 0} rows affected`);
            // Auto-load destination table preview
            loadResultsPreview();
          } else if (response.status === 'failed') {
            const errorDetail = response.error
              ? extractErrorString(response.error)
              : 'Check execution history for details';
            setPipelineError(`Execution failed: ${errorDetail}`);
            setActiveTab('runs'); // Switch to runs tab to show error details
          }
        }
      } catch (error: any) {
        console.error('Execution failed:', error);
        setPipelineError(getApiErrorMessage(error) || 'Execution failed');
        setActiveTab('runs');
      } finally {
        setIsExecuting(false);
        // Force execution history to refresh after execution completes
        setExecutionRefreshKey((k) => k + 1);
      }
    },
    [activeWorkflowId, nodes]
  );
  handleExecuteRef.current = handleExecute;

  const handleValidate = useCallback(async () => {
    setPipelineError(null);
    if (!activeWorkflowId) {
      setPipelineError('Save the workflow first before validating.');
      return;
    }

    try {
      setAiSuggestions(null);
      const result = await workflowApi.validateWorkflow(activeWorkflowId);
      setValidation(result);

      if (result.valid) {
        toast.success('Pipeline is valid');
        setPipelineError(null);
      } else {
        const errMsg = extractErrorString(result.error) || 'Check the error panel for details';
        setPipelineError(`Validation: ${errMsg}`);
      }
    } catch (error: any) {
      console.error('Validation failed:', error);
      setPipelineError(getApiErrorMessage(error) || 'Validation failed');
    }
  }, [activeWorkflowId]);

  const handleGetAiSuggestions = useCallback(async () => {
    if (!validation) return;
    setAiSuggestionsLoading(true);
    setAiSuggestions(null);
    try {
      // AI suggestions not available via workflow API — show validation info
      const info: string[] = [];
      if (validation.error) info.push(`Error: ${extractErrorString(validation.error)}`);
      if (validation.mode) info.push(`Mode: ${validation.mode}`);
      if (validation.steps_count) info.push(`Steps: ${validation.steps_count}`);
      if (validation.destination) info.push(`Destination: ${validation.destination}`);
      setAiSuggestions(info.length > 0 ? info.join('\n') : 'No suggestions available.');
    } catch (err: any) {
      toast.error('AI suggestions unavailable');
      setAiSuggestions(null);
    } finally {
      setAiSuggestionsLoading(false);
    }
  }, [validation]);

  // ============================================
  // SUBMIT FOR APPROVAL
  // ============================================

  const handleSubmitForApproval = useCallback(async () => {
    if (!activeWorkflowId) {
      toast.error('Save the pipeline first');
      return;
    }
    if (readOnlyGuard()) return;

    try {
      // Get the latest version ID
      const versionsResponse = await workflowApi.listVersions(activeWorkflowId, { limit: 1 });
      const versions = (versionsResponse as any)?.versions || [];
      if (versions.length === 0) {
        toast.error('No version found. Save the pipeline first to create a version.');
        return;
      }
      const latestVersionId = versions[0].version_id;

      await workflowApi.requestDeployment(activeWorkflowId, {
        version_id: latestVersionId,
        deployment_type: 'with_approval',
      });
      toast.success('Pipeline submitted for approval!');
      setApprovalStatus('pending');
    } catch (error: any) {
      console.error('Submit for approval failed:', error);
      // Snowflake compile errors come back as a wall of text. Pipe through
      // friendlyError() so the toast reads "Couldn't request approval —
      // backend column missing" instead of "000904 (42000): … invalid
      // identifier 'CHANGES_SUMMARY'". Also surface the platform-side
      // pipelineError banner so the user can drill into the raw payload.
      const raw = getApiErrorMessage(error) || 'Failed to submit for approval';
      const { headline, hint } = friendlyError(raw);
      toast.error(headline);
      setPipelineError(`Approval: ${raw}${hint ? `  —  ${hint}` : ''}`);
    }
  }, [activeWorkflowId, readOnlyGuard]);

  // ============================================
  // EXPORT & DUPLICATE
  // ============================================

  const handleExportJSON = useCallback(() => {
    const data = {
      name: pipelineName,
      workflow_id: activeWorkflowId,
      steps: nodesToStepInputs(nodes, edges),
      exported_at: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pipelineName.replace(/\s+/g, '_').toLowerCase()}_workflow.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Workflow exported');
  }, [pipelineName, activeWorkflowId, nodes, edges]);

  const handleDuplicate = useCallback(async () => {
    if (nodes.length === 0) {
      toast.error('Nothing to duplicate');
      return;
    }
    const newName = `${pipelineName} (copy)`;
    try {
      const stepInputs = nodesToStepInputs(nodes, edges);
      const response = await workflowApi.createWorkflow({
        project_name: newName,
        steps: stepInputs,
      });
      setActiveWorkflowId(response.project_id);
      setActiveWorkflowName(response.project_name);
      setPipelineName(response.project_name);
      setIsDirty(false);
      await loadWorkflows();
      toast.success(`Duplicated as "${newName}"`);
    } catch (error: any) {
      toast.error(getApiErrorMessage(error) || 'Failed to duplicate');
    }
  }, [pipelineName, nodes, edges]);

  // ============================================
  // RENDER
  // ============================================

  // Normalize validation errors into an array for the error panel and node states
  const validationErrors = useMemo(() => {
    if (!validation || validation.valid) return [];
    if (Array.isArray((validation as any).errors) && (validation as any).errors.length > 0) {
      return (validation as any).errors;
    }
    if (validation.error) {
      return [{ message: validation.error }];
    }
    return [];
  }, [validation]);

  // Map validation errors to node IDs for visual error states on canvas nodes
  const nodeErrors = useMemo(() => {
    const errors: Record<string, string> = {};
    validationErrors.forEach((err: any) => {
      const nodeId = err.step_id || err.node_id;
      if (nodeId) errors[nodeId] = typeof err === 'string' ? err : err.message || err.error || '';
    });
    return errors;
  }, [validationErrors]);

  // Map execution step results to nodes for post-execution visual states
  const executionNodeState = useMemo(() => {
    const state: Record<string, {
      executionStatus: 'pending' | 'running' | 'completed' | 'failed';
      rowsAffected?: number;
      durationMs?: number;
      error?: string;
      stepIndex?: number;
    }> = {};

    if (!lastExecution) return state;

    // Map step results to node IDs by step order (nodes are ordered as steps)
    const stepResults = (lastExecution as any)?.execution_details?.steps_results
      || (lastExecution as any)?.steps_results
      || [];

    // Try to match by step_id first, then by order
    const orderedNodeIds = nodes
      .filter(n => n.type !== 'default')
      .sort((a, b) => {
        const aOrder = a.data?.stepOrder ?? a.data?.step_number ?? 999;
        const bOrder = b.data?.stepOrder ?? b.data?.step_number ?? 999;
        return aOrder - bOrder;
      })
      .map(n => n.id);

    stepResults.forEach((step: any, idx: number) => {
      // Match by step_id or by order
      const nodeId = step.step_id || step.node_id || orderedNodeIds[idx];
      if (!nodeId) return;

      state[nodeId] = {
        executionStatus: step.status === 'completed' || step.status === 'success'
          ? 'completed'
          : step.status === 'failed' || step.status === 'error'
            ? 'failed'
            : step.status === 'running' ? 'running' : 'pending',
        rowsAffected: step.rows_affected ?? step.row_count,
        durationMs: step.duration_ms ?? step.duration,
        error: step.error,
        stepIndex: idx + 1,
      };
    });

    // If execution failed but no step results, mark all as failed
    if (stepResults.length === 0 && (lastExecution.status === 'failed' || lastExecution.status === 'partial_failure')) {
      const errMsg = typeof lastExecution.error === 'string'
        ? lastExecution.error
        : (lastExecution as any).error_log || 'Execution failed';
      orderedNodeIds.forEach((id, idx) => {
        state[id] = { executionStatus: 'failed', error: errMsg, stepIndex: idx + 1 };
      });
    }

    return state;
  }, [lastExecution, nodes]);

  // Also set execution state when pipeline is running
  const runningNodeState = useMemo(() => {
    if (!isExecuting) return {} as Record<string, {
      executionStatus: 'pending' | 'running' | 'completed' | 'failed';
      rowsAffected?: number;
      durationMs?: number;
      error?: string;
      stepIndex?: number;
    }>;
    const state: Record<string, {
      executionStatus: 'pending' | 'running' | 'completed' | 'failed';
      rowsAffected?: number;
      durationMs?: number;
      error?: string;
      stepIndex?: number;
    }> = {};
    nodes.forEach(n => { state[n.id] = { executionStatus: 'running' }; });
    return state;
  }, [isExecuting, nodes]);

  // Build a map: cte_alias (slugified label) -> { duration_ms, status, rows }
  // pulled from lastExecution.execution_details.steps_results[].
  const stepResultByCte = useMemo(() => {
    const map: Record<string, { status: 'success' | 'failed' | 'running' | 'pending'; duration_ms?: number; rows?: number }> = {};
    if (!lastExecution) return map;
    const steps = (lastExecution as { execution_details?: { steps_results?: unknown[] } })?.execution_details?.steps_results
      || (lastExecution as { steps_results?: unknown[] })?.steps_results
      || [];
    if (!Array.isArray(steps)) return map;
    for (const s of steps as Record<string, unknown>[]) {
      const cte = (s?.cte_alias as string | undefined) || (s?.step_id as string | undefined);
      if (!cte) continue;
      const rawStatus = (s?.status as string | undefined) ?? '';
      const status: 'success' | 'failed' | 'running' | 'pending' =
        rawStatus === 'completed' || rawStatus === 'success' ? 'success'
        : rawStatus === 'failed' || rawStatus === 'error' ? 'failed'
        : rawStatus === 'running' ? 'running'
        : 'pending';
      map[cte] = {
        status,
        duration_ms: (s?.duration_ms as number | undefined) ?? (s?.duration as number | undefined),
        rows: (s?.rows_affected as number | undefined) ?? (s?.row_count as number | undefined),
      };
    }
    return map;
  }, [lastExecution]);

  // Extract per-CTE snippets from the merged compiled SQL. Best-effort regex —
  // fails open (returns {}) if the SQL is nested or non-standard.
  const compiledSnippetByCte = useMemo(() => {
    const map: Record<string, string> = {};
    const sql = compiledSql?.compiled_sql || (lastExecution as { compiled_sql?: string } | null)?.compiled_sql;
    if (typeof sql !== 'string' || sql.length === 0) return map;
    // Match `alias AS (...)` blocks at depth 0. Simple paren-balanced slice.
    const re = /([A-Za-z_][A-Za-z0-9_]*)\s+AS\s*\(/gi;
    let match: RegExpExecArray | null;
    while ((match = re.exec(sql)) !== null) {
      const alias = match[1];
      const start = re.lastIndex; // just past the '('
      let depth = 1;
      let i = start;
      while (i < sql.length && depth > 0) {
        const ch = sql[i];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        i++;
      }
      if (depth === 0) {
        const body = sql.slice(start, i - 1).trim();
        map[alias.toLowerCase()] = body;
      }
    }
    return map;
  }, [compiledSql, lastExecution]);

  // Build upstream/downstream summaries from edges, keyed by node id.
  const adjacency = useMemo(() => {
    const labelById = new Map<string, { id: string; label: string; type?: string }>();
    for (const n of nodes) {
      const lbl = (n.data as { name?: string; label?: string } | undefined)?.name
        || (n.data as { name?: string; label?: string } | undefined)?.label
        || n.id;
      labelById.set(n.id, { id: n.id, label: lbl, type: n.type });
    }
    const up: Record<string, { id: string; label: string; type?: string }[]> = {};
    const down: Record<string, { id: string; label: string; type?: string }[]> = {};
    for (const e of edges) {
      const src = labelById.get(e.source);
      const tgt = labelById.get(e.target);
      if (src && tgt) {
        (down[e.source] ||= []).push(tgt);
        (up[e.target] ||= []).push(src);
      }
    }
    return { up, down };
  }, [nodes, edges]);

  // Enrich nodes with error data + execution state for visual states on canvas
  const enrichedNodes = useMemo(() => {
    const execState = isExecuting ? runningNodeState : executionNodeState;

    return nodes.map((node) => {
      const error = nodeErrors[node.id];
      const exec = execState[node.id];
      const nodeLabel = (node.data as { name?: string; label?: string } | undefined)?.name
        || (node.data as { name?: string; label?: string } | undefined)?.label
        || node.id;
      const cteKey = String(nodeLabel).toLowerCase().replace(/\s+/g, '_');
      const lastRun = stepResultByCte[cteKey] ?? stepResultByCte[node.id] ?? null;
      const compiledSnippet = compiledSnippetByCte[cteKey];
      const upstream = adjacency.up[node.id] ?? [];
      const downstream = adjacency.down[node.id] ?? [];
      return {
        ...node,
        data: {
          ...node.data,
          ...(error ? { error } : {}),
          ...(exec ? {
            executionStatus: exec.executionStatus,
            rowsAffected: exec.rowsAffected,
            durationMs: exec.durationMs,
            executionError: exec.error,
            stepIndex: exec.stepIndex,
          } : {}),
          _lastRun: lastRun,
          _compiledSnippet: compiledSnippet,
          _upstream: upstream,
          _downstream: downstream,
          // Drop-target hint: while the user is dragging FROM another
          // node, mark this node as a valid receiver or not. ETLNodeWrapper
          // reads this to add a green glow / red dim during the drag.
          _dropHint:
            connectingFromId && connectingFromId !== node.id
              ? (isValidPair(connectingFromId, node.id) ? 'valid' : 'invalid')
              : null,
          _onOpenConfig: () => {
            setSelectedNode(node);
            setShowSidebar(true);
          },
        },
      };
    });
  }, [nodes, nodeErrors, executionNodeState, runningNodeState, isExecuting, stepResultByCte, compiledSnippetByCte, adjacency, connectingFromId, isValidPair]);

  // Enrich edges with execution state — red dashed for failed paths, green for completed
  const enrichedEdges = useMemo(() => {
    if (Object.keys(executionNodeState).length === 0 && !isExecuting) return edges;
    const execState = isExecuting ? runningNodeState : executionNodeState;
    return edges.map((edge) => {
      const sourceState = execState[edge.source];
      const targetState = execState[edge.target];
      if (sourceState?.executionStatus === 'failed' || targetState?.executionStatus === 'failed') {
        return {
          ...edge,
          style: { strokeWidth: 2, stroke: '#ef4444' },  // red-500
          animated: true,
          className: 'stroke-red-500',
        };
      }
      if (sourceState?.executionStatus === 'completed' && targetState?.executionStatus === 'completed') {
        return {
          ...edge,
          style: { strokeWidth: 2, stroke: '#22c55e' },  // green-500
          animated: false,
        };
      }
      if (isExecuting) {
        return {
          ...edge,
          style: { strokeWidth: 2, stroke: '#3b82f6' },  // blue-500
          animated: true,
        };
      }
      return edge;
    });
  }, [edges, executionNodeState, runningNodeState, isExecuting]);

  const joinInputColumns = useMemo(() => getJoinInputColumns(), [getJoinInputColumns]);

  // Project-gate selector callback — declared BEFORE any early returns so
  // React's rules-of-hooks aren't violated when the gate renders.
  const handleGateSelect = useCallback(
    (workflowId: string, workflowName: string) => {
      projectGateDismissedRef.current = true;
      const wf = workflows.find((w) => w.id === workflowId);
      if (wf) {
        handleLoadPipeline(wf);
      } else {
        // Newly-created workflow may not be in the list yet — set directly
        setActiveWorkflowId(workflowId);
        setActiveWorkflowName(workflowName);
        setPipelineName(workflowName);
        setUserRole('owner');
        setNodes([]);
        setEdges([]);
        setIsDirty(false);
        loadWorkflows();
      }
    },
    [workflows, handleLoadPipeline, setNodes, setEdges, loadWorkflows],
  );

  // UnifiedProjectWizard handoff — branches on the explicit build mode.
  //   manual   → land on the empty canvas (default).
  //   ai       → open GuidedAiWorkflowWizard pre-seeded with the description.
  //   template → load the template's nodes/edges onto the canvas.
  const handleProjectCreated = useCallback(
    (result: UnifiedProjectWizardResult) => {
      projectGateDismissedRef.current = true;
      // The project shell already exists — adopt it as the active workflow.
      setActiveWorkflowId(result.projectId);
      setActiveWorkflowName(result.projectName);
      setPipelineName(result.projectName);
      setUserRole('owner');
      setNodes([]);
      setEdges([]);
      setIsDirty(false);
      void loadWorkflows();

      if (result.buildMode === 'ai') {
        setAiSeedDescription(result.aiDescription ?? '');
        setShowAiGenerate(true);
      } else if (result.buildMode === 'template' && result.templateId) {
        const tpl = WORKFLOW_TEMPLATES.find((t) => t.id === result.templateId);
        if (tpl) {
          const { nodes: tplNodes, edges: tplEdges } = templateToReactFlow(tpl);
          setNodes(tplNodes as unknown as typeof nodes);
          setEdges(tplEdges as unknown as typeof edges);
          setIsDirty(true);
          toast.success(`Template "${tpl.title}" loaded — review and save`);
        }
      }
    },
    [setNodes, setEdges, loadWorkflows],
  );

  // Page-level loading state
  if (isLoading && workflows.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader size="lg" />
      </div>
    );
  }

  // Page-level error state
  if (loadError && workflows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertTriangle className="h-10 w-10 text-amber-500" />
        <p className="text-sm text-gray-600 dark:text-gray-400">{loadError}</p>
        <Button onClick={loadWorkflows} variant="outline">Retry</Button>
      </div>
    );
  }

  // Show the project gate when no workflow is loaded (after workflows finished loading) and the
  // user hasn't dismissed it via "New Workflow" creation. Skipping the gate while loading avoids
  // a flash before URL-auto-select can run.
  const showProjectGate =
    !activeWorkflowId &&
    !isLoading &&
    !isPipelineLoading &&
    !projectGateDismissedRef.current;

  // Inline pre-state: render a visible project picker + create CTA when no
  // workflow is selected. Replaces the modal-only gate so the page never
  // shows a blank canvas (rizzui Modal portaling could fail silently).
  if (showProjectGate) {
    return (
      <div className={cn('h-full flex flex-col bg-slate-50 dark:bg-slate-900', className)}>
        <div className="px-3 lg:px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <nav className="flex items-center text-xs text-gray-500 dark:text-gray-400 gap-1" aria-label="Breadcrumb">
            <span>Home</span>
            <span aria-hidden="true">/</span>
            <span className="text-gray-900 dark:text-white font-medium">Workflow</span>
          </nav>
        </div>
        <ProjectGatePanel
          module="workflow"
          projects={workflows}
          loading={isLoading}
          error={loadError}
          onRetry={loadWorkflows}
          onSelect={(projectId) => {
            const w = workflows.find((wf) => wf.id === projectId);
            if (!w) return;
            projectGateDismissedRef.current = true;
            handleLoadPipeline(w);
          }}
          onCreateNew={() => setShowCreateWizard(true)}
        />
        {/* Unified creation flow — reachable from the inline pre-state. */}
        <UnifiedProjectWizard
          open={showCreateWizard}
          onOpenChange={setShowCreateWizard}
          module="workflow"
          onCreated={handleProjectCreated}
        />
      </div>
    );
  }

  return (
    <div className={cn('h-full flex flex-col bg-slate-100 dark:bg-slate-900', className)}>
      {/* Global keyboard-shortcut announcer (⌘S / view-only). Persists across
          right-panel toggles so screen-reader users always hear the feedback. */}
      <div aria-live="polite" aria-atomic="true" className="sr-only" role="status">
        {shortcutAnnounce}
      </div>
      {/* Project Gate: blocks the canvas until a workflow project is selected */}
      <WorkflowProjectGate
        isOpen={showProjectGate}
        onSelect={handleGateSelect}
        onCreated={handleProjectCreated}
      />
      {/* Unified creation flow — also reachable from the main canvas. */}
      <UnifiedProjectWizard
        open={showCreateWizard}
        onOpenChange={setShowCreateWizard}
        module="workflow"
        onCreated={handleProjectCreated}
      />

      {/* "Change approach" — re-opens the manual/AI/template fork for an
          existing workflow so the build choice is reversible. */}
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
              Change how you build this workflow
            </h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Switch to AI to scaffold from a description, or keep building
              manually. Your current canvas is preserved.
            </p>
            <div className="mt-4">
              <ManualAiTemplateFork
                value={null}
                onChange={(mode: BuildMode) => {
                  setShowApproachFork(false);
                  if (mode === 'ai') {
                    setAiSeedDescription('');
                    setShowAiGenerate(true);
                  } else if (mode === 'template') {
                    setShowCreateWizard(true);
                  }
                  // manual → just dismiss; the canvas stays as-is.
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Breadcrumb Header */}
      <div className="px-3 lg:px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 flex items-center justify-between gap-3">
        <nav className="flex items-center text-xs text-gray-500 dark:text-gray-400 gap-1" aria-label="Breadcrumb">
          <span>Home</span>
          <span aria-hidden="true">/</span>
          <span>Workflow</span>
          <span aria-hidden="true">/</span>
          <span className="text-gray-900 dark:text-white font-medium truncate max-w-[240px]">
            {activeWorkflowName || pipelineName || 'New Workflow'}
          </span>
          {activeWorkflowId && (
            <button
              type="button"
              onClick={() => {
                projectGateDismissedRef.current = false;
                setActiveWorkflowId(null);
              }}
              className="ml-2 px-1.5 py-0.5 text-[10px] font-medium rounded border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
              title="Change workflow project"
            >
              Change
            </button>
          )}
          {activeWorkflowId && (
            <button
              type="button"
              onClick={() => setShowApproachFork(true)}
              className="ml-1 px-1.5 py-0.5 text-[10px] font-medium rounded text-indigo-500 hover:text-indigo-700 hover:underline dark:text-indigo-400 transition-colors"
              title="Switch how this workflow is built"
            >
              Change approach
            </button>
          )}
        </nav>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowRightPanel(!showRightPanel)}
            className={cn(
              'px-2.5 py-1.5 text-xs font-medium rounded-md border flex items-center gap-1.5 transition-colors',
              showRightPanel
                ? 'bg-blue-600 text-white border-blue-600 hover:bg-blue-700'
                : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
            )}
            title={showRightPanel ? 'Hide side panel' : 'Show side panel'}
          >
            {showRightPanel ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronLeft className="h-3.5 w-3.5" />}
            Panel
          </button>
        </div>
      </div>

      {/* ── Header — grouped clusters with subtle separators ──
          Cluster 1 (Create):   New / AI / Import
          Cluster 2 (Project):  selector | name | status badges
          Cluster 3 (Actions):  Save / Validate / SQL / Run / Approve | utilities
          Each cluster sits in a pill-shaped surface with consistent height
          and gap rhythm so the eye groups them automatically. */}
      <div className="border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-3">

          {/* ── Cluster 1: Create ── */}
          <div className="flex h-9 items-center gap-1.5 rounded-xl bg-slate-50 p-1 dark:bg-slate-900/60">
            <motion.button
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.92 }}
              onClick={handleNewPipeline}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 text-white shadow-sm shadow-green-500/40 transition-shadow hover:shadow-md hover:shadow-green-500/50"
              title="Create new workflow"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
            </motion.button>
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setShowAiGenerate(true)}
              className="group relative flex h-7 items-center gap-1 overflow-hidden rounded-lg bg-gradient-to-r from-purple-600 to-fuchsia-600 px-2 text-[11px] font-semibold text-white shadow-sm shadow-purple-500/40 transition-shadow hover:shadow-md hover:shadow-purple-500/60"
              title="Generate workflow with AI"
            >
              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              <Sparkles className="h-3 w-3" />
              AI
            </motion.button>
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setShowImportTasks(true)}
              className="flex h-7 items-center gap-1 rounded-lg bg-gradient-to-r from-cyan-600 to-blue-600 px-2 text-[11px] font-semibold text-white shadow-sm shadow-cyan-500/40 transition-shadow hover:shadow-md hover:shadow-cyan-500/60"
              title="Import Snowflake task graphs as workflow projects"
            >
              <Download className="h-3 w-3" />
              <span className="hidden md:inline">Import</span>
            </motion.button>
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />

          {/* ── Cluster 2: Project context ── */}
          <div className="flex items-center gap-2">
            <select
              value={activeWorkflowId || ''}
              onChange={(e) => {
                const wf = workflows.find((w) => w.id === e.target.value);
                if (wf) handleLoadPipeline(wf);
                else handleNewPipeline();
              }}
              className="h-8 min-w-[140px] rounded-lg border border-slate-200 bg-white px-2.5 text-xs shadow-sm transition-colors hover:border-slate-300 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
            >
              <option value="">New workflow</option>
              {workflows.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={pipelineName}
              onChange={(e) => { setPipelineName(e.target.value); setIsDirty(true); }}
              className="h-8 w-[180px] rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold shadow-sm transition-colors hover:border-slate-300 focus:border-purple-500 focus:outline-none focus:ring-2 focus:ring-purple-500/20 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600"
              placeholder="Workflow name…"
              readOnly={isReadOnly}
            />

            {/* Status badges — animated entrance so they don't pop in jarringly */}
            <AnimatePresence>
              {isDirty && (nodes.length > 0 || activeWorkflowId) && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-orange-600 dark:text-orange-400"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
                  </span>
                  Unsaved
                </motion.span>
              )}
              {!isDirty && saveStatus === 'saved' && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  className="flex items-center gap-1 whitespace-nowrap text-[11px] font-medium text-emerald-600 dark:text-emerald-400"
                >
                  <CheckCircle className="h-3 w-3" />
                  Saved
                </motion.span>
              )}
              {isReadOnly && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                >
                  <Eye className="h-3 w-3" />
                  View only
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          {/* ── Tags chip strip ──
              Reads tags from getWorkflow (loaded on handleLoadPipeline).
              No backend updateWorkflow endpoint exists today — clicks
              mutate local state and surface a Backend-Gap tooltip on
              the "+ tag" affordance so the limitation is visible. */}
          {activeWorkflowId && (
            <div className="flex items-center gap-1 flex-wrap max-w-[320px]" aria-label="Workflow tags">
              {workflowTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                >
                  <Tag className="h-2.5 w-2.5 opacity-60" />
                  {tag}
                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        setWorkflowTags((prev) => prev.filter((t) => t !== tag));
                        toast('Backend Gap: PATCH /workflow/{id} not implemented — tag removed locally only', { icon: 'ℹ️' });
                      }}
                      className="ml-0.5 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-slate-600 dark:hover:text-slate-100"
                      aria-label={`Remove tag ${tag}`}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </span>
              ))}
              {!isReadOnly && (
                showTagInput ? (
                  <input
                    type="text"
                    autoFocus
                    value={tagDraft}
                    onChange={(e) => setTagDraft(e.target.value)}
                    onBlur={() => { setShowTagInput(false); setTagDraft(''); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const next = tagDraft.trim();
                        if (next && !workflowTags.includes(next)) {
                          setWorkflowTags((prev) => [...prev, next]);
                          toast('Backend Gap: PATCH /workflow/{id} not implemented — tag added locally only', { icon: 'ℹ️' });
                        }
                        setShowTagInput(false);
                        setTagDraft('');
                      } else if (e.key === 'Escape') {
                        setShowTagInput(false);
                        setTagDraft('');
                      }
                    }}
                    placeholder="tag…"
                    className="h-5 w-20 rounded-full border border-slate-300 bg-white px-2 text-[10px] outline-none focus:border-purple-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    aria-label="New tag"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowTagInput(true)}
                    className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[10px] font-medium text-slate-500 transition-colors hover:border-purple-400 hover:text-purple-600 dark:border-slate-600 dark:text-slate-400"
                    title="Add tag (Backend Gap: PATCH /workflow/{id} for metadata isn't wired — tag stays local)"
                  >
                    <Plus className="h-2.5 w-2.5" />
                    tag
                  </button>
                )
              )}
            </div>
          )}

          {validation && (
            <div className="relative">
              <span
                onClick={() => !validation.valid && validationErrors.length > 0 && setShowErrorPanel(!showErrorPanel)}
                className={cn(
                  'px-2 py-1 rounded-full text-[11px] font-semibold flex items-center gap-1 whitespace-nowrap',
                  validation.valid
                    ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                    : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 cursor-pointer hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors'
                )}
              >
                {validation.valid ? <CheckCircle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                {validation.valid ? 'Valid' : `${validationErrors.length} Error${validationErrors.length !== 1 ? 's' : ''}`}
              </span>
              {showErrorPanel && validationErrors.length > 0 && (
                <div className="absolute top-full left-0 z-50 mt-1 bg-white dark:bg-slate-800 border border-red-200 dark:border-red-800 rounded-lg shadow-xl p-3 max-h-[300px] overflow-y-auto min-w-[320px]">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-semibold text-red-600 dark:text-red-400">
                      {validationErrors.length} Validation Error{validationErrors.length > 1 ? 's' : ''}
                    </h4>
                    <button onClick={() => setShowErrorPanel(false)} className="text-slate-400 hover:text-slate-600" aria-label="Close error panel">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-2">
                    {validationErrors.map((err: any, i: number) => (
                      <div key={i}
                        className="flex items-start gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 cursor-pointer hover:bg-red-100 dark:hover:bg-red-900/30"
                        onClick={() => {
                          const nodeId = err.step_id || err.node_id;
                          if (nodeId) {
                            const node = nodes.find(n => n.id === nodeId);
                            if (node) { setSelectedNode(node); setShowSidebar(true); }
                          }
                          setShowErrorPanel(false);
                        }}
                      >
                        <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-red-700 dark:text-red-300">
                            {err.step_name || err.action_type || `Step ${err.step_order || i + 1}`}
                          </p>
                          <p className="text-xs text-red-600 dark:text-red-400 mt-0.5">
                            {typeof err === 'string' ? err : err.message || err.error || JSON.stringify(err)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Spacer */}
          <div className="flex-1" />

          {/* ── Cluster 3: Actions ──
              Primary lifecycle buttons grouped in their own pill surface,
              utility icons sit slightly apart so they read as secondary. */}
          <div className="flex h-9 shrink-0 items-center gap-1 rounded-xl bg-slate-50 p-1 dark:bg-slate-900/60">
            <motion.button
              whileHover={!(isSaving || isReadOnly || isPendingApproval) ? { scale: 1.04 } : undefined}
              whileTap={!(isSaving || isReadOnly || isPendingApproval) ? { scale: 0.96 } : undefined}
              onClick={handleSavePipeline}
              disabled={isSaving || isReadOnly || isPendingApproval}
              className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 px-2.5 text-[11px] font-semibold text-white shadow-sm shadow-blue-500/40 transition-shadow hover:shadow-md hover:shadow-blue-500/60 disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none dark:disabled:from-slate-700 dark:disabled:to-slate-600"
              title={isPendingApproval ? 'Pending approval — cannot modify' : 'Save workflow (Ctrl+S)'}
            >
              {isSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
              Save
            </motion.button>

            <motion.button
              whileHover={activeWorkflowId ? { scale: 1.04 } : undefined}
              whileTap={activeWorkflowId ? { scale: 0.96 } : undefined}
              onClick={handleValidate}
              disabled={!activeWorkflowId}
              className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-br from-amber-400 to-amber-500 px-2.5 text-[11px] font-semibold text-white shadow-sm shadow-amber-500/40 transition-shadow hover:shadow-md hover:shadow-amber-500/60 disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none dark:disabled:from-slate-700 dark:disabled:to-slate-600"
              title="Check for errors in the workflow DAG before execution"
            >
              <CheckCircle className="h-3 w-3" />
              Validate
            </motion.button>

            <motion.button
              whileHover={!(isExecuting || !activeWorkflowId) ? { scale: 1.04 } : undefined}
              whileTap={!(isExecuting || !activeWorkflowId) ? { scale: 0.96 } : undefined}
              onClick={() => handleExecute(true)}
              disabled={isExecuting || !activeWorkflowId}
              className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-br from-slate-500 to-slate-600 px-2.5 text-[11px] font-semibold text-white shadow-sm shadow-slate-500/30 transition-shadow hover:shadow-md disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none dark:disabled:from-slate-700 dark:disabled:to-slate-600"
              title="Preview the compiled SQL without executing it"
            >
              <Eye className="h-3 w-3" />
              SQL
            </motion.button>

            <motion.button
              whileHover={!(isExecuting || !activeWorkflowId || isReadOnly || (isPendingApproval && !isApproved)) ? { scale: 1.04 } : undefined}
              whileTap={!(isExecuting || !activeWorkflowId || isReadOnly || (isPendingApproval && !isApproved)) ? { scale: 0.96 } : undefined}
              onClick={() => handleExecute(false)}
              disabled={isExecuting || !activeWorkflowId || isReadOnly || (isPendingApproval && !isApproved)}
              className="group relative flex h-7 items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-lg bg-gradient-to-br from-green-500 to-emerald-600 px-2.5 text-[11px] font-semibold text-white shadow-sm shadow-green-500/40 transition-shadow hover:shadow-md hover:shadow-green-500/60 disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none dark:disabled:from-slate-700 dark:disabled:to-slate-600"
              title={isPendingApproval ? 'Pending approval — waiting for admin' : 'Run the workflow now (Ctrl+Enter)'}
            >
              <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
              {isExecuting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
              Run
            </motion.button>

            {/* ── Suspend / Resume — mutually exclusive single slot ──
                Suspend is visible only when a schedule exists AND is started.
                Resume is visible only when a schedule exists AND is suspended.
                When no schedule exists we render Suspend disabled with a
                tooltip explaining why — keeps the slot stable for muscle
                memory and gives admins a hint that they need to schedule. */}
            {scheduleState.hasSchedule && scheduleState.isStarted ? (
              <motion.button
                whileHover={!(isReadOnly || isSuspendingTask) ? { scale: 1.04 } : undefined}
                whileTap={!(isReadOnly || isSuspendingTask) ? { scale: 0.96 } : undefined}
                onClick={handleSuspendTask}
                disabled={isReadOnly || isSuspendingTask}
                className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 px-2.5 text-[11px] font-semibold text-white shadow-sm shadow-orange-500/40 transition-shadow hover:shadow-md hover:shadow-orange-500/60 disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none dark:disabled:from-slate-700 dark:disabled:to-slate-600"
                title={isReadOnly ? 'View-only access' : 'Pause the scheduled task'}
                aria-label="Suspend scheduled task"
              >
                {isSuspendingTask ? <Loader2 className="h-3 w-3 animate-spin" /> : <Pause className="h-3 w-3" />}
                Suspend
              </motion.button>
            ) : scheduleState.hasSchedule && scheduleState.isSuspended ? (
              <motion.button
                whileHover={!(isReadOnly || isSuspendingTask) ? { scale: 1.04 } : undefined}
                whileTap={!(isReadOnly || isSuspendingTask) ? { scale: 0.96 } : undefined}
                onClick={handleResumeTask}
                disabled={isReadOnly || isSuspendingTask}
                className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 px-2.5 text-[11px] font-semibold text-white shadow-sm shadow-emerald-500/40 transition-shadow hover:shadow-md hover:shadow-emerald-500/60 disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none dark:disabled:from-slate-700 dark:disabled:to-slate-600"
                title={isReadOnly ? 'View-only access' : 'Resume the suspended scheduled task'}
                aria-label="Resume scheduled task"
              >
                {isSuspendingTask ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                Resume
              </motion.button>
            ) : (
              <motion.button
                disabled
                className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg bg-slate-200 px-2.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                title={!activeWorkflowId ? 'Save the workflow first' : 'No schedule yet — create one with the Schedule button'}
                aria-label="Suspend (no schedule)"
              >
                <Pause className="h-3 w-3" />
                Suspend
              </motion.button>
            )}

            {/* ── Schedule — opens ScheduleManager in a popover ──
                Two visual states driven by useScheduleState:
                  • no schedule → "Schedule" with calendar icon
                  • has schedule → pill showing the cron summary */}
            {scheduleState.hasSchedule ? (
              <motion.button
                whileHover={!isReadOnly && !!activeWorkflowId ? { scale: 1.04 } : undefined}
                whileTap={!isReadOnly && !!activeWorkflowId ? { scale: 0.96 } : undefined}
                onClick={() => setShowScheduleDialog(true)}
                disabled={isReadOnly || !activeWorkflowId}
                className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg border border-blue-200 bg-blue-50 px-2.5 text-[11px] font-semibold text-blue-700 transition-colors hover:bg-blue-100 disabled:opacity-50 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30"
                title={isReadOnly ? 'View-only access' : `Edit schedule — ${scheduleState.cronSummary || 'open editor'}`}
                aria-label="Edit schedule"
              >
                <Calendar className="h-3 w-3" />
                <span>Scheduled</span>
                {scheduleState.cronSummary && (
                  <span className="text-[10px] font-normal text-blue-600/80 dark:text-blue-400/80">
                    · {scheduleState.cronSummary}
                  </span>
                )}
                <span className="text-[10px] font-normal opacity-70">· edit</span>
              </motion.button>
            ) : (
              <motion.button
                whileHover={!isReadOnly && !!activeWorkflowId ? { scale: 1.04 } : undefined}
                whileTap={!isReadOnly && !!activeWorkflowId ? { scale: 0.96 } : undefined}
                onClick={() => setShowScheduleDialog(true)}
                disabled={isReadOnly || !activeWorkflowId}
                className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-br from-indigo-500 to-blue-600 px-2.5 text-[11px] font-semibold text-white shadow-sm shadow-indigo-500/40 transition-shadow hover:shadow-md hover:shadow-indigo-500/60 disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none dark:disabled:from-slate-700 dark:disabled:to-slate-600"
                title={!activeWorkflowId ? 'Save the workflow first' : isReadOnly ? 'View-only access' : 'Create a schedule for this workflow'}
                aria-label="Schedule workflow"
              >
                <Calendar className="h-3 w-3" />
                Schedule
              </motion.button>
            )}

            <motion.button
              whileHover={!(!activeWorkflowId || isReadOnly || isPendingApproval) ? { scale: 1.04 } : undefined}
              whileTap={!(!activeWorkflowId || isReadOnly || isPendingApproval) ? { scale: 0.96 } : undefined}
              onClick={handleSubmitForApproval}
              disabled={!activeWorkflowId || isReadOnly || isPendingApproval}
              className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 px-2.5 text-[11px] font-semibold text-white shadow-sm shadow-violet-500/40 transition-shadow hover:shadow-md hover:shadow-violet-500/60 disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none dark:disabled:from-slate-700 dark:disabled:to-slate-600"
              title={isPendingApproval ? 'Already submitted for approval' : 'Request approval for production deployment'}
            >
              <AlertCircle className="h-3 w-3" />
              Approve
            </motion.button>

            {/* ── Rollback — opens RollbackVersionDialog with diff preview ──
                Hidden when no versions exist, disabled in view-only. */}
            {hasVersions && (
              <motion.button
                whileHover={!isReadOnly && !!activeWorkflowId ? { scale: 1.04 } : undefined}
                whileTap={!isReadOnly && !!activeWorkflowId ? { scale: 0.96 } : undefined}
                onClick={() => setShowRollbackDialog(true)}
                disabled={isReadOnly || !activeWorkflowId}
                className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg bg-gradient-to-br from-slate-500 to-slate-700 px-2.5 text-[11px] font-semibold text-white shadow-sm shadow-slate-500/30 transition-shadow hover:shadow-md disabled:from-slate-300 disabled:to-slate-400 disabled:shadow-none dark:disabled:from-slate-700 dark:disabled:to-slate-600"
                title={isReadOnly ? 'View-only access' : 'Roll back to a previous version (diff preview shown before commit)'}
                aria-label="Roll back to a previous version"
              >
                <History className="h-3 w-3" />
                Rollback
              </motion.button>
            )}
          </div>

          {/* Divider */}
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />

          {/* ── Cluster 4: Utility icons ── */}
          <div className="flex shrink-0 items-center gap-0.5">
            <motion.button
              whileHover={nodes.length > 0 ? { scale: 1.1 } : undefined}
              whileTap={nodes.length > 0 ? { scale: 0.92 } : undefined}
              onClick={handleExportJSON}
              disabled={nodes.length === 0}
              className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              title="Export workflow as JSON"
              aria-label="Export workflow"
            >
              <Download className="h-3.5 w-3.5" />
            </motion.button>

            <motion.button
              whileHover={nodes.length > 0 ? { scale: 1.1 } : undefined}
              whileTap={nodes.length > 0 ? { scale: 0.92 } : undefined}
              onClick={handleDuplicate}
              disabled={nodes.length === 0}
              className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              title="Duplicate workflow"
              aria-label="Duplicate workflow"
            >
              <Copy className="h-3.5 w-3.5" />
            </motion.button>

            {activeWorkflowId && !isReadOnly && (
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.92 }}
                onClick={handleDeletePipeline}
                className="rounded-md p-1.5 text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20"
                title="Delete workflow"
                aria-label="Delete workflow"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </motion.button>
            )}
          </div>
        </div>
      </div>

      {/* AI next-step hint — shown once after the wizard auto-saves a draft.
          Sets expectations: the visual graph is generated but each block
          still needs its database/columns before Save → Validate → Run
          produce a real SQL workflow. */}
      <AnimatePresence>
        {aiNextStepHint && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-purple-200 bg-gradient-to-r from-purple-50 via-fuchsia-50 to-purple-50 dark:border-purple-900/40 dark:from-purple-950/30 dark:via-fuchsia-950/30 dark:to-purple-950/30"
          >
            <div className="flex items-start gap-3 px-4 py-2.5">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-purple-600 dark:text-purple-400" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-purple-900 dark:text-purple-200">
                  AI generated the structure — now configure each block
                </p>
                <p className="mt-0.5 text-[11px] text-purple-800 dark:text-purple-300">
                  Click a block on the canvas to set its database, table,
                  columns and conditions. Then <strong>Save</strong> →{' '}
                  <strong>Validate</strong> → <strong>Run</strong>. Until each
                  block is configured the workflow won&apos;t execute.
                </p>
              </div>
              <button
                onClick={() => setAiNextStepHint(false)}
                className="rounded-md p-1 text-purple-600 transition-colors hover:bg-purple-100 dark:text-purple-400 dark:hover:bg-purple-900/40"
                aria-label="Dismiss"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left palette */}
        <div
          className={cn(
            'bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transition-all duration-300',
            showPalette ? 'w-72' : 'w-0'
          )}
        >
          {showPalette && (
            <ETLPalette
              className="h-full"
              projectId={activeWorkflowId ?? undefined}
            />
          )}
        </div>

        {/* Toggle palette button */}
        <button
          onClick={() => setShowPalette(!showPalette)}
          className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-r-lg shadow-sm"
          style={{ left: showPalette ? '288px' : '0' }}
          aria-label={showPalette ? 'Hide block palette' : 'Show block palette'}
        >
          {showPalette ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {/* Canvas */}
        <div ref={reactFlowWrapper} className="flex-1 relative">
          <ReactFlow
            nodes={enrichedNodes}
            edges={enrichedEdges}
            onNodesChange={isReadOnly ? undefined : onNodesChange}
            onEdgesChange={isReadOnly ? undefined : onEdgesChange}
            onConnect={isReadOnly ? undefined : onConnect}
            onConnectStart={isReadOnly ? undefined : onConnectStart}
            onConnectEnd={isReadOnly ? undefined : onConnectEnd}
            isValidConnection={isValidConnection}
            connectionRadius={30}
            connectionMode={'strict' as 'strict' | 'loose'}
            connectionLineComponent={(p) => (
              <CustomConnectionLine {...p} isValid={isValidPair} />
            )}
            onInit={setReactFlowInstance}
            onDrop={isReadOnly ? undefined : onDrop}
            onDragOver={isReadOnly ? undefined : onDragOver}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            nodesConnectable={!isReadOnly}
            nodesDraggable={!isReadOnly}
            nodeTypes={etlNodeTypes}
            fitView
            deleteKeyCode={null}
            onlyRenderVisibleElements
            className="bg-slate-50 dark:bg-slate-900"
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            <Controls />
            <MiniMap
              position="bottom-right"
              zoomable
              pannable
              nodeColor={() => '#0ea5e9'}
              className="!bg-white/90 dark:!bg-slate-900/90 !border !border-slate-200 dark:!border-slate-700 rounded-md shadow-sm"
            />
          </ReactFlow>

          {/* Empty state overlay — pointer-events-none so drops pass through to ReactFlow */}
          {nodes.length === 0 && !isLoading && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className="text-center space-y-5 max-w-md">
                {/* Visual flow diagram */}
                <div className="flex items-center justify-center gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-14 h-14 rounded-xl bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-2 shadow-sm">
                      <svg className="h-7 w-7 text-green-600 dark:text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4" /></svg>
                    </div>
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Source</span>
                  </div>
                  <svg className="h-5 w-5 text-slate-300 dark:text-slate-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  <div className="flex flex-col items-center">
                    <div className="w-14 h-14 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center mb-2 shadow-sm">
                      <svg className="h-7 w-7 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    </div>
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Transform</span>
                  </div>
                  <svg className="h-5 w-5 text-slate-300 dark:text-slate-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  <div className="flex flex-col items-center">
                    <div className="w-14 h-14 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mb-2 shadow-sm">
                      <svg className="h-7 w-7 text-emerald-600 dark:text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Destination</span>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                    Drag blocks from the left panel to start building your workflow
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                    Connect blocks to define data flow, then click each block to configure it
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right panel — conditional, PUSHES canvas */}
        {showRightPanel && (
        <div className="w-[420px] flex-shrink-0 bg-white dark:bg-slate-800 border-l border-slate-200 dark:border-slate-700 flex flex-col">
          {/* Tabs — single compact row */}
          <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
            {[
              { id: 'results', label: 'Results', icon: Eye, disabledWhenEmpty: true },
              { id: 'runs', label: 'Runs', icon: History, disabledWhenEmpty: true },
              { id: 'sql', label: 'SQL', icon: Code, disabledWhenEmpty: true },
              { id: 'schedules', label: 'Schedule', icon: Calendar, disabledWhenPending: true, disabledWhenEmpty: true },
              { id: 'ai', label: 'AI', icon: Sparkles },
            ].map((tab) => {
              const isEmpty = nodes.length === 0;
              const disabledByEmpty = (tab as any).disabledWhenEmpty && isEmpty;
              const disabledByPending = (tab as any).disabledWhenPending && isPendingApproval;
              const isTabDisabled = disabledByEmpty || disabledByPending;
              const disabledTitle = disabledByEmpty
                ? `Add at least one block to view ${tab.label}`
                : disabledByPending
                ? 'Pending approval — scheduling disabled'
                : undefined;
              return (
              <button
                key={tab.id}
                onClick={() => !isTabDisabled && setActiveTab(tab.id as any)}
                disabled={isTabDisabled}
                aria-disabled={isTabDisabled || undefined}
                title={disabledTitle}
                className={cn(
                  'flex-1 px-2 py-2.5 text-[11px] font-medium flex items-center justify-center gap-1 transition-colors whitespace-nowrap min-w-0',
                  isTabDisabled && 'opacity-40 cursor-not-allowed',
                  activeTab === tab.id && !isTabDisabled
                    ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400 bg-blue-50/50 dark:bg-blue-900/10'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/30'
                )}
              >
                <tab.icon className="h-3.5 w-3.5 flex-shrink-0" />
                {tab.label}
              </button>
            );
            })}
          </div>

          {/* ── Status hero: surfaces last run + approval + deployment at a
              glance so the user doesn't need to click into each tab to know
              where their workflow stands. Only shown once a workflow is
              loaded; hidden for the empty/new-pipeline state. ── */}
          {activeWorkflowId && (
            <RunApprovalStatusHero
              runStatus={
                isExecuting
                  ? 'running'
                  : !lastExecution
                  ? 'never'
                  : lastExecution.status === 'completed' || lastExecution.status === 'success'
                  ? 'success'
                  : lastExecution.status === 'partial_failure'
                  ? 'partial'
                  : lastExecution.status === 'failed'
                  ? 'failed'
                  : 'running'
              }
              rowsAffected={lastExecution?.rows_affected ?? null}
              durationMs={
                (lastExecution as { duration_ms?: number; execution_time_ms?: number } | null)?.duration_ms
                ?? (lastExecution as { duration_ms?: number; execution_time_ms?: number } | null)?.execution_time_ms
                ?? null
              }
              ranAt={
                (lastExecution as { completed_at?: string; started_at?: string } | null)?.completed_at
                ?? (lastExecution as { completed_at?: string; started_at?: string } | null)?.started_at
                ?? null
              }
              approvalStatus={approvalStatus === 'none' ? 'none' : approvalStatus}
              approver={null}
              approvedAt={null}
              activeDeploymentId={null}
            />
          )}

          {/* Persistent error banner (replaces disappearing toasts).
              Snowflake DML errors come back as a wall of text — friendlyError()
              parses common codes (100072 = non-null violation, 22000 = data
              exception, 23000 = constraint) and adds a human action line. */}
          <div aria-live="polite" aria-atomic="true">
            {pipelineError && (() => {
              const { headline, hint, isPlatform } = friendlyError(pipelineError);
              return (
                <div className="mx-4 mt-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2" role="alert">
                  <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0 space-y-1">
                    <p className="text-xs font-semibold text-red-800 dark:text-red-200">{headline}</p>
                    {hint && (
                      <p className="text-[11px] text-red-700 dark:text-red-300">{hint}</p>
                    )}
                    {isPlatform && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-[10px] italic text-red-600 dark:text-red-400">
                          Platform-side issue — not caused by your block configuration.
                        </p>
                        <a
                          href={`mailto:support@datalab360.io?subject=${encodeURIComponent(
                            'Platform error — workflow builder',
                          )}&body=${encodeURIComponent(
                            [
                              'Hi support team,',
                              '',
                              '<one-paragraph description of what you were doing>',
                              '',
                              `Workflow ID: ${activeWorkflowId ?? '(unsaved)'}`,
                              `Workflow name: ${activeWorkflowName || pipelineName}`,
                              `User: ${currentUsername || '(unknown)'}`,
                              `Timestamp: ${new Date().toISOString()}`,
                              '',
                              '--- Raw error ---',
                              pipelineError ?? '',
                            ].join('\n'),
                          )}`}
                          className="inline-flex items-center gap-1 rounded border border-red-300 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-red-700 transition-colors hover:bg-red-50 dark:border-red-700 dark:bg-red-950/40 dark:text-red-300 dark:hover:bg-red-900/40"
                          aria-label="Report this platform bug to support"
                          title="Opens your mail client with error details prefilled"
                        >
                          <Bug className="h-2.5 w-2.5" />
                          Report this bug
                        </a>
                      </div>
                    )}
                    <details className="group">
                      <summary className="cursor-pointer text-[10px] uppercase tracking-wider text-red-500/80 hover:text-red-600">
                        Show raw error
                      </summary>
                      <pre className="mt-1 max-h-[80px] overflow-auto rounded bg-red-100/60 dark:bg-red-950/30 p-1.5 font-mono text-[10px] text-red-800 dark:text-red-300 whitespace-pre-wrap">
                        {pipelineError}
                      </pre>
                    </details>
                  </div>
                  <button onClick={() => setPipelineError(null)} className="text-red-400 hover:text-red-600 flex-shrink-0" aria-label="Dismiss error">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })()}
          </div>

          {/* Execution status for screen readers */}
          <div aria-live="polite" className="sr-only">
            {isExecuting ? 'Pipeline is executing...' : ''}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-auto p-4">
            {activeTab === 'results' && (
              <div className="space-y-3 -mx-4 -mt-4">
                {/* Execution summary */}
                {lastExecution && (
                  <div className="px-4 pt-4 space-y-2">
                    <div className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium',
                      lastExecution.status === 'completed' || lastExecution.status === 'success'
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                        : lastExecution.status === 'failed'
                        ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'
                        : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                    )}>
                      {lastExecution.status === 'completed' || lastExecution.status === 'success'
                        ? <CheckCircle className="h-4 w-4" />
                        : lastExecution.status === 'failed'
                        ? <AlertCircle className="h-4 w-4" />
                        : <Loader2 className="h-4 w-4 animate-spin" />}
                      <span className="capitalize">{lastExecution.status}</span>
                      <span className="text-xs opacity-75 ml-auto">
                        {lastExecution.rows_affected != null && `${lastExecution.rows_affected} rows`}
                        {lastExecution.steps_executed != null && ` · ${lastExecution.steps_executed}/${lastExecution.steps_total} steps`}
                      </span>
                    </div>

                    {/* Step-by-step results */}
                    {lastExecution.execution_details?.steps_results?.length > 0 && (
                      <div className="space-y-1">
                        {lastExecution.execution_details.steps_results.map((step: any, i: number) => (
                          <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded bg-slate-50 dark:bg-slate-700/50">
                            <span className={cn(
                              'w-1.5 h-1.5 rounded-full flex-shrink-0',
                              step.status === 'completed' || step.status === 'success' ? 'bg-green-500' : 'bg-red-500'
                            )} />
                            <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                              {step.cte_alias || step.step_id || `Step ${i + 1}`}
                            </span>
                            {step.rows_affected != null && (
                              <span className="ml-auto text-slate-500">{step.rows_affected} rows</span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Table data preview */}
                {previewLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
                    <span className="ml-2 text-sm text-slate-500">Loading preview...</span>
                  </div>
                ) : previewError ? (
                  <div className="mx-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <p className="text-xs text-red-600 dark:text-red-400">{previewError}</p>
                    <button
                      onClick={loadResultsPreview}
                      className="mt-2 text-xs text-red-700 dark:text-red-300 underline"
                    >
                      Retry
                    </button>
                  </div>
                ) : previewData ? (
                  <div className="px-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {previewData.table}
                      </h4>
                      <span className="text-[11px] text-slate-500">
                        {previewData.rows.length} of {previewData.total_rows} rows
                      </span>
                    </div>
                    <div className="border border-slate-200 dark:border-slate-700 rounded-lg overflow-auto max-h-[500px]">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 dark:bg-slate-700/50 sticky top-0">
                          <tr>
                            {previewData.columns.map((col) => (
                              <th key={col} className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap border-b border-slate-200 dark:border-slate-600">
                                {col}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {previewData.rows.map((row, i) => (
                            <tr key={i} className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-700/30">
                              {previewData.columns.map((col) => (
                                <td key={col} className="px-3 py-1.5 text-slate-700 dark:text-slate-300 whitespace-nowrap max-w-[200px] truncate">
                                  {row[col] != null ? String(row[col]) : <span className="text-slate-400 italic">null</span>}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <button
                      onClick={loadResultsPreview}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Refresh
                    </button>
                  </div>
                ) : !lastExecution ? (
                  <div className="px-4 py-8 text-center">
                    <Eye className="h-8 w-8 mx-auto mb-2 text-slate-300 dark:text-slate-600" />
                    <p className="text-sm text-slate-500 dark:text-slate-400">No results yet</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                      Execute the workflow to see the destination table data here.
                    </p>
                  </div>
                ) : (
                  <div className="px-4 py-4 text-center">
                    <p className="text-sm text-slate-500">No destination table configured.</p>
                    <p className="text-xs text-slate-400 mt-1">Add a Destination block to preview output data.</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'runs' && (
              <ETLExecutionHistory
                key={executionRefreshKey}
                pipelineId={activeWorkflowId}
                pipelineName={activeWorkflowName}
                compact
                className="-mx-4 -mt-4"
              />
            )}

            {activeTab === 'schedules' && (
              <>
                {validation && !validation.valid && (
                  <div className="px-3 py-2 mb-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                    <p className="text-xs text-amber-700 dark:text-amber-300 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Pipeline has validation errors. Fix errors and run successfully before scheduling.
                    </p>
                  </div>
                )}
                <ScheduleManager
                  pipelineId={activeWorkflowId}
                  pipelineName={activeWorkflowName}
                  compact
                  isReadOnly={isReadOnly}
                  className="-mx-4 -mt-4"
                />
              </>
            )}

            {activeTab === 'sql' && (() => {
              const sqlText = compiledSql?.compiled_sql || lastExecution?.compiled_sql || '';
              const handleCopySql = async () => {
                if (!sqlText) return;
                try {
                  await navigator.clipboard.writeText(sqlText);
                  toast.success('SQL copied to clipboard');
                } catch {
                  toast.error('Copy failed — select & copy manually');
                }
              };
              return (
                <div className="space-y-3">
                  {sqlText ? (
                    <div className="relative p-3 bg-slate-900 rounded-lg">
                      <button
                        type="button"
                        onClick={handleCopySql}
                        className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md border border-slate-700 bg-slate-800/80 px-2 py-1 text-[10px] font-medium text-slate-200 transition-colors hover:bg-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-400"
                        title="Copy SQL to clipboard"
                        aria-label="Copy compiled SQL"
                      >
                        <Copy className="h-3 w-3" />
                        Copy
                      </button>
                      <div className="text-xs text-slate-400 mb-1 pr-16">
                        {compiledSql?.compiled_sql
                          ? `Mode: ${compiledSql.mode} | Steps: ${compiledSql.steps_count}`
                          : 'Compiled SQL'}
                      </div>
                      <pre className="text-xs text-green-400 whitespace-pre-wrap font-mono">
                        {sqlText}
                      </pre>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500 text-center py-4">
                      Run &quot;Preview SQL&quot; to see generated queries
                    </p>
                  )}
                </div>
              );
            })()}

            {activeTab === 'ai' && (
              <div className="space-y-3">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Corrections, warnings, and optimizations for your workflow.
                </p>
                {validation ? (
                  <>
                    {validation.error && (
                      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 p-2">
                        <div className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Errors</div>
                        <p className="text-xs text-red-600 dark:text-red-300">{extractErrorString(validation.error)}</p>
                      </div>
                    )}
                    {!validation.valid && !validation.error && (
                      <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-2">
                        <div className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">Warnings</div>
                        <p className="text-xs text-amber-600 dark:text-amber-300">Pipeline validation failed</p>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={handleGetAiSuggestions}
                      disabled={aiSuggestionsLoading}
                      className="w-full px-3 py-2 text-sm font-medium rounded-lg bg-violet-600 text-white hover:bg-violet-700 flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {aiSuggestionsLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="h-4 w-4" />
                      )}
                      {aiSuggestionsLoading ? 'Analyzing...' : 'AI Suggestions (Cortex)'}
                    </button>
                    {aiSuggestions != null && (
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3">
                        <div className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">AI Response</div>
                        <div className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                          {aiSuggestions}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-slate-500 text-center py-4">
                    Click &quot;Validate&quot; to see errors, warnings, and request AI suggestions.
                  </p>
                )}
              </div>
            )}


          </div>
        </div>
        )}

        {/* Config sidebar */}
        {showSidebar && selectedNode && (
          <ETLConfigSidebar
            node={selectedNode}
            onClose={() => {
              setSelectedNode(null);
              setShowSidebar(false);
            }}
            onSave={handleNodeSave}
            onDelete={handleNodeDelete}
            availableColumns={getAvailableColumns()}
            accessToken={accessToken}
            leftInputColumns={joinInputColumns.left}
            rightInputColumns={joinInputColumns.right}
          />
        )}
      </div>

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 bg-white/80 dark:bg-gray-900/80 flex items-center justify-center z-50">
          <Loader size="lg" />
        </div>
      )}

      {/* AI Guided Workflow — 9-step wizard. Generated nodes/edges are
          dropped onto the React Flow canvas via setNodes/setEdges, AND
          auto-saved to the backend as a draft project so the user has a
          real, named workflow to come back to (not just transient state). */}
      <GuidedAiWorkflowWizard
        open={showAiGenerate}
        initialDescription={aiSeedDescription}
        onClose={() => {
          setShowAiGenerate(false);
          setAiSeedDescription('');
        }}
        onCreated={async (genNodes, genEdges, meta) => {
          // 1) Drop nodes/edges on the canvas immediately so the user sees
          //    the result of their wizard work without delay.
          setNodes(genNodes as unknown as typeof nodes);
          setEdges(genEdges as unknown as typeof edges);
          setIsDirty(true);
          setAiNextStepHint(true);

          // 2) Persist the AI-generated steps. Two paths:
          //    - activeWorkflowId set (came from UnifiedProjectWizard's AI
          //      fork): the project shell already exists with the user's
          //      chosen name + `build:ai` tag — ADD steps to it. Creating a
          //      second project here would orphan the named shell.
          //    - activeWorkflowId null (legacy header "AI" button on a blank
          //      canvas): auto-save as a NEW "[AI Draft] …" project.
          const draftName = `[AI Draft] ${(meta.description || 'Untitled').slice(0, 30)}`;
          try {
            // Build steps with real action_type (from node.type, falling back
            // to "sql" only for legacy generic placeholders). Carry `inputs`
            // (incoming edges) in the payload so stepsToReactFlow can rebuild
            // the DAG on reload — `outgoing` was the wrong direction.
            const steps = genNodes.map((n, i) => {
              const incoming = genEdges
                .filter((e) => e.target === n.id)
                .map((e) => e.source);
              return {
                action_type: String(n.type || 'sql'),
                step_name: String((n.data as { label?: string } | undefined)?.label ?? `Step ${i + 1}`),
                description: `AI-generated ${String(n.type)} block.`,
                payload: {
                  ai_generated: true,
                  node_type: String(n.type),
                  nodeId: n.id,
                  position: n.position,
                  inputs: incoming,
                  // Spread data so the registered node components find all
                  // fields on the dual-key path (data.X || data.config.X).
                  ...((n.data as Record<string, unknown>) ?? {}),
                },
              };
            });

            let targetProjectId: string;

            if (activeWorkflowId) {
              // Project already exists (UnifiedProjectWizard AI fork). Replace
              // its steps with the AI-generated ones — keep the project's
              // name + `build:ai` tag intact.
              targetProjectId = activeWorkflowId;
              try {
                const existing = await workflowApi.listSteps(activeWorkflowId);
                for (const s of existing.steps || []) {
                  await workflowApi.deleteStep(activeWorkflowId, s.step_id).catch(() => {});
                }
              } catch { /* no steps yet — fine */ }
              for (const s of steps) {
                await workflowApi.addStep(activeWorkflowId, s);
              }
              void loadWorkflows();
              toast.success(`AI workflow added to "${activeWorkflowName}" — running validation…`);
            } else {
              // Legacy path: no project yet — auto-save as a new draft.
              // Carry the wizard's self-review checklist into the tags so
              // downstream audit/governance can read which compliance cards
              // the author acknowledged. This is a recorded self-attestation,
              // per the wizard's honest-step-3 copy.
              const complianceMeta = (meta as { compliance_review?: Record<string, 'reviewed' | 'unchecked'> }).compliance_review;
              const created = await workflowApi.createWorkflow({
                project_name: draftName,
                description: meta.description,
                tags: complianceMeta
                  ? ['ai-draft', 'build:ai', ...Object.entries(complianceMeta).filter(([, v]) => v === 'reviewed').map(([k]) => `compliance:${k}`)]
                  : ['ai-draft', 'build:ai'],
                steps,
              });
              targetProjectId = created.project_id;
              void loadWorkflows();
              setActiveWorkflowId(created.project_id);
              setPipelineName(draftName);
              toast.success(`Saved as "${draftName}" — running validation…`);
            }

            // Run the backend validation + dry-run sequence so the user sees
            // immediately whether the workflow is runnable end-to-end before
            // they request deployment. Failures surface as toasts; the draft
            // itself stays in place so the user can refine.
            try {
              const validation = await workflowApi.validateWorkflow(targetProjectId);
              const issues = (validation as { errors?: unknown[] })?.errors ?? [];
              if (Array.isArray(issues) && issues.length > 0) {
                toast.error(`Validation found ${issues.length} issue${issues.length === 1 ? '' : 's'} — see Runs panel`);
              } else {
                toast.success('Validation passed — ready to run');
              }
            } catch (validateErr) {
              toast.error(
                `Validation failed: ${getApiErrorMessage(validateErr) || 'backend error'}`,
              );
            }
          } catch (err) {
            const msg = getApiErrorMessage(err) || 'Auto-save failed — click Save to retry';
            toast.error(msg);
          }
        }}
      />

      {/* Import Snowflake task graphs as workflow projects */}
      <ImportTasksModal
        open={showImportTasks}
        onClose={() => setShowImportTasks(false)}
        onImported={(projectName) => {
          // Refresh the workflow list via the cache-aware query's refetch
          // so the imported project shows up in the header selector.
          void loadWorkflows();
          toast.success(`"${projectName}" imported — pick it from the workflow selector`);
        }}
      />

      {/* Schedule popover — reuses the existing ScheduleManager so the
          create/edit/suspend flow stays in one place. Triggered from the
          Schedule / "Scheduled · edit" button in the header. */}
      <UiDialog open={showScheduleDialog} onOpenChange={setShowScheduleDialog}>
        <UiDialogContent className="max-w-lg bg-white p-0 dark:bg-slate-900">
          <UiDialogHeader className="border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <UiDialogTitle className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
              <Calendar className="h-4 w-4 text-blue-500" />
              Schedule — {activeWorkflowName || pipelineName}
            </UiDialogTitle>
          </UiDialogHeader>
          {activeWorkflowId ? (
            <ScheduleManager
              pipelineId={activeWorkflowId}
              pipelineName={activeWorkflowName}
              isReadOnly={isReadOnly}
              compact
              onScheduleChange={() => {
                refetchHeaderSchedules();
              }}
            />
          ) : (
            <div className="p-6 text-center text-sm text-slate-500">
              Save the workflow first to manage schedules.
            </div>
          )}
        </UiDialogContent>
      </UiDialog>

      {/* Local-draft restore prompt — soft confirm. Shown only when a draft
          newer than the loaded workflow exists in localStorage. */}
      <ConfirmDialog
        open={!!draftRestorePrompt}
        onOpenChange={(open) => { if (!open) setDraftRestorePrompt(null); }}
        title="Restore local draft?"
        body={
          draftRestorePrompt ? (
            <div>
              <p>
                We saved a local draft{' '}
                {(() => {
                  const ageMs = Date.now() - draftRestorePrompt.payload.savedAt;
                  const mins = Math.max(1, Math.round(ageMs / 60_000));
                  return mins < 60 ? `${mins} minute${mins === 1 ? '' : 's'} ago` : `${Math.round(mins / 60)} hour${Math.round(mins / 60) === 1 ? '' : 's'} ago`;
                })()}{' '}
                with {draftRestorePrompt.payload.nodes?.length ?? 0} block
                {(draftRestorePrompt.payload.nodes?.length ?? 0) === 1 ? '' : 's'}.
                Restore it? Your current loaded workflow will be replaced on the canvas.
              </p>
              <p className="mt-2 text-[11px] text-slate-500">
                Local-only — the backend version is not modified until you click Save.
              </p>
            </div>
          ) : null
        }
        confirmLabel="Restore draft"
        cancelLabel="Discard draft"
        onCancel={() => {
          if (draftRestorePrompt) {
            try { window.localStorage.removeItem(draftRestorePrompt.key); } catch { /* noop */ }
          }
        }}
        onConfirm={() => {
          if (draftRestorePrompt) {
            const { nodes: dn, edges: de, pipelineName: dn2 } = draftRestorePrompt.payload;
            setNodes(dn);
            setEdges(de);
            setPipelineName(dn2);
            setIsDirty(true);
            toast.success('Draft restored');
          }
          setDraftRestorePrompt(null);
        }}
      />

      {/* Rollback dialog — diff preview + hard-tier confirm gate. */}
      <RollbackVersionDialog
        open={showRollbackDialog}
        onOpenChange={setShowRollbackDialog}
        workflowId={activeWorkflowId}
        workflowName={activeWorkflowName || pipelineName}
        onRolledBack={() => {
          if (activeWorkflowId) {
            // Re-load steps so the canvas reflects the rolled-back definition.
            handleLoadPipeline({ id: activeWorkflowId, name: activeWorkflowName });
          }
        }}
      />
    </div>
  );
};

// Wrap with ReactFlowProvider
const ETLPipelineBuilderWithProvider: React.FC<ETLPipelineBuilderProps> = (props) => (
  <ReactFlowProvider>
    <ETLPipelineBuilder {...props} />
  </ReactFlowProvider>
);

export default ETLPipelineBuilderWithProvider;
