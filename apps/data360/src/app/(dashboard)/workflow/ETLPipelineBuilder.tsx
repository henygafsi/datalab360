'use client';

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useCanPerform } from '@/hooks/useCanPerform';
import PermissionGate from '@/components/ui/PermissionGate';
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
  ConnectionMode,
} from 'reactflow';
// @ts-ignore — CSS import handled by Next.js bundler
import 'reactflow/dist/style.css';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import {
  Play, Save, Trash2, ChevronRight, ChevronLeft,
  Loader2, History, AlertCircle, AlertTriangle, CheckCircle,
  Eye, Code, Calendar, Sparkles, Users, X, Clock,
  Download, Upload, Copy, FolderOpen, Plus, Pause, Tag, Bug, Settings, Wrench,
} from 'lucide-react';
import { Loader, Button } from 'rizzui';
import { motion, AnimatePresence } from 'framer-motion';

// Components
import ETLPalette from './components/ETLPalette';
import ETLConfigSidebar from './components/ETLConfigSidebar';
import ScheduleManager from './components/ScheduleManager';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

import ETLExecutionHistory from './components/ETLExecutionHistory';
import RunFixRail from './components/RunFixRail';
import AccessManagementSlot from '@/app/(dashboard)/explore-design/components/AccessManagementSlot';
import { etlNodeTypes } from './components/ETLNodeTypes';
import { getBlockByType, convertLegacyType } from './components/etl-blocks';
import { auditCatalogCoherence } from './components/catalog-coherence';
import GuidedAiWorkflowWizard from './components/GuidedAiWorkflowWizard';
import AiBuildSection, {
  type AiBuildDraft,
  type AiBuildReviewRow,
} from './components/AiBuildSection';
import type { AiGenerateSource } from './components/useAiPipelineGenerate';
import ImportTasksModal from './components/ImportTasksModal';
import ScanIntentPrefill, { type ScanSuggestionMeta } from './components/ScanIntentPrefill';
import WorkflowListCockpit, {
  type CockpitOpenSection,
  type CockpitWorkflowItem,
} from './components/WorkflowListCockpit';
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
import AdnHeaderBadge from '@/app/shared/score-cards/AdnHeaderBadge';
import WorkflowSmartPanel, { type CanvasNodeSnapshot } from './components/WorkflowSmartPanel';
import { validateGraph, validateNode } from './components/etl-catalog-grounding';
import CustomConnectionLine from './components/CustomConnectionLine';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

// Workflow API services
import * as workflowApi from '@/app/services/api/workflowApi';
import { listProjects, listContributors, deleteProject } from '@/app/services/api/projectsApi';
import apiClient, { getApiErrorMessage } from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { useAtomValue } from 'jotai';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import type { ContributorRole } from '@/app/services/api/types';
import type {
  Workflow,
  WorkflowStep,
  WorkflowActionType,
  WorkflowExecutionResponse,
  CompileWorkflowResponse,
  ValidateWorkflowResponse,
  WorkflowCapabilities,
  CloneDataTestsResult,
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
    if (typeof obj.error === 'string') return obj.error;
    // CTE engine shape: { failed_steps: [{ step_name, error, ... }] } — surface
    // the per-step messages instead of dumping the raw JSON blob.
    if (Array.isArray(obj.failed_steps)) {
      const msgs = (obj.failed_steps as Array<Record<string, unknown>>)
        .map((s) => {
          const label = s.step_name || s.cte_alias || s.action_type || s.action || s.step_id || 'step';
          return `${label}: ${typeof s.error === 'string' ? s.error : 'failed'}`;
        })
        .filter(Boolean);
      if (msgs.length) return msgs.join('\n');
    }
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
      headline: 'The data warehouse refused the compiled SQL',
      hint: col
        ? `Column "${col}" doesn’t exist in the referenced table. Open the SQL tab to see the failing statement.`
        : 'The generated SQL references a table or column that doesn’t exist. Open the SQL tab to see the failing statement.',
      isPlatform: false,
    };
  }
  // Cortex / warehouse timeout.
  if (/QUERY_CANCELLED|604|warehouse.*suspend|timeout/i.test(text)) {
    return {
      headline: 'The data warehouse cancelled the query',
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

/** True when the route is unavailable on this backend — 404 (absent) or 501 (stub). */
function is404(err: unknown): boolean {
  const r = (err as { response?: { status?: number } } | null)?.response;
  return r?.status === 404 || r?.status === 501;
}

// ── Lifecycle state machine ──────────────────────────────────────────────
// Every lifecycle action (save / validate / compile / clone-test / deploy /
// execute) is driven through one of these phases so the UI can honestly
// show idle → running(+elapsed) → completed / empty / error, and — critically —
// flip to `unavailable` (honest disabled state) the moment its route 404s,
// instead of leaving a button that silently 404s on every click.
type LifecyclePhase = 'idle' | 'running' | 'completed' | 'empty' | 'error' | 'unavailable';
type LifecycleAction = 'save' | 'validate' | 'compile' | 'cloneTest' | 'deploy' | 'execute';

/**
 * Project the React Flow nodes into the lightweight block snapshots the
 * WorkflowSmartPanel "Changes" diff consumes (id / label / type / configKey).
 * configKey serialises the block config so config edits register as "modified".
 */
function toBlockSnapshots(nodes: Node[]): CanvasNodeSnapshot[] {
  return nodes.map((n) => {
    const cfg = (n.data?.config || {}) as Record<string, unknown>;
    const label =
      (n.data as { name?: string; label?: string } | undefined)?.name ||
      (n.data as { name?: string; label?: string } | undefined)?.label ||
      n.type || n.id;
    let configKey = '';
    try { configKey = JSON.stringify(cfg); } catch { configKey = String(cfg); }
    return { id: n.id, label: String(label), type: String(n.type || 'block'), configKey };
  });
}
interface LifecycleEntry {
  phase: LifecyclePhase;
  startedAt?: number;   // epoch ms while running, for the elapsed-time ticker
  message?: string;     // human-friendly headline for error / empty / unavailable
}
type LifecycleState = Partial<Record<LifecycleAction, LifecycleEntry>>;

const UNAVAILABLE_HINT = 'Not available on this backend yet';

// ── Source-selection focus state machine ──────────────────────────────────
// G2: the source/block picker (ETLPalette) is a click-to-focus surface.
//   'expanded'  → palette dominates the working area (fills the page) so the
//                 user can browse/search sources without a cramped rail.
//   'collapsed' → palette shrinks back to a slim rail, giving the canvas room.
// Clicking the center canvas collapses an expanded picker (focus shifts to the
// graph). The preference is persisted to versioned, minimal localStorage —
// same "draft of menu → preselect on return" pattern as WorkflowSmartPanel's
// PANEL_SECTION_KEY (client-localstorage-schema).
type SourcePanelState = 'expanded' | 'collapsed';
const SOURCE_PANEL_KEY = 'data360.etl.sourcepanel.v1';

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

// Build the FromGraphRequest node/edge payload from the ReactFlow canvas.
// Used by the RESAVE path (the purged /steps CRUD's bulk replacement).
// from-graph maps node.id → step, stashes `config` as the step payload, and
// reads join handles from edge.targetHandle ('input1'/'input2' → 'left'/'right').
function nodesToFromGraph(nodes: Node[], edges: Edge[]): {
  nodes: { id: string; type: string; config: Record<string, unknown> }[];
  edges: { source: string; target: string; targetHandle?: string }[];
} {
  // Reuse nodesToStepInputs so the same flat-key derivation (filter_condition,
  // agg flattening, etc.) the backend templates expect is applied here too.
  const stepInputs = nodesToStepInputs(nodes, edges);
  const graphNodes = nodes.map((node, i) => {
    const { inputs: _inputs, cte_alias: _cte, position: _pos, nodeId: _nid, ...config } =
      stepInputs[i].payload as Record<string, unknown>;
    return {
      id: node.id,
      // Normalize legacy ReactFlow aliases to canonical action types so the
      // saved steps map to seeded DEFAULT_ACTIONS (required for later
      // compile/run to emit SQL). Idempotent on already-canonical types.
      type: convertLegacyType(node.type || 'source'),
      config: { ...config, position: node.position, nodeId: node.id },
    };
  });
  const graphEdges = edges.map((e) => {
    const handle =
      e.targetHandle === 'input1' ? 'left'
      : e.targetHandle === 'input2' ? 'right'
      : undefined;
    return { source: e.source, target: e.target, ...(handle ? { targetHandle: handle } : {}) };
  });
  return { nodes: graphNodes, edges: graphEdges };
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

  // Usage analytics (R11/H10): PAGE_VIEW auto-fires on mount via this hook;
  // key lifecycle actions (load / run / deploy) fire FEATURE_CLICK below.
  // Fire-and-forget — events are batched and silent-fail; never blocks render.
  const { trackFeatureClick } = useTrackEvent();
  const initialProjectIdRef = useRef<string | null>(
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('project')
      : null,
  );
  const projectGateDismissedRef = useRef(false);

  // Account-Overview AI advisor deep-link: ?intent=create&from=scan. Captured
  // ONCE at mount (same pattern as initialProjectIdRef) so we know to surface
  // the AI-suggested-workflow prefill on the project gate instead of an empty
  // canvas. The manual create path stays fully intact below it.
  const scanIntentRef = useRef<{ intent: string | null; from: string | null }>(
    typeof window !== 'undefined'
      ? {
          intent: new URLSearchParams(window.location.search).get('intent'),
          from: new URLSearchParams(window.location.search).get('from'),
        }
      : { intent: null, from: null },
  );
  const [scanPrefillDismissed, setScanPrefillDismissed] = useState(false);
  const [scanApplying, setScanApplying] = useState(false);

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
  // Source-selection focus state (G2). Lazy-init from versioned localStorage so
  // the read happens once at mount, not on every render (rerender-lazy-state-init).
  // Defaults to 'collapsed' (slim rail) so the CENTRAL canvas is the hero on
  // load — the always-on WorkflowSmartPanel right rail means an expanded picker
  // would bury the canvas. The user expands the palette (capped) to browse.
  const [sourcePanel, setSourcePanel] = useState<SourcePanelState>(() => {
    try {
      return window.localStorage.getItem(SOURCE_PANEL_KEY) === 'expanded'
        ? 'expanded'
        : 'collapsed';
    } catch {
      return 'collapsed';
    }
  });
  // Persist the focus preference whenever it changes.
  useEffect(() => {
    try { window.localStorage.setItem(SOURCE_PANEL_KEY, sourcePanel); }
    catch { /* storage unavailable — keep in-memory state */ }
  }, [sourcePanel]);
  // Collapse the expanded picker to a slim rail — fired when the user clicks
  // into the center canvas (focus shifts to the graph). Stable callback so the
  // canvas handlers don't re-create on every render.
  const collapseSourcePanel = useCallback(() => {
    setSourcePanel((prev) => (prev === 'expanded' ? 'collapsed' : prev));
  }, []);
  // Toggle between the slim rail and the full-width picker (chevron / rail click).
  const toggleSourcePanel = useCallback(() => {
    setSourcePanel((prev) => (prev === 'expanded' ? 'collapsed' : 'expanded'));
  }, []);
  // Single intelligent right-bar: `activeTab` doubles as the WorkflowSmartPanel
  // active SECTION (icon-rail flip menu). It carries both the legacy panel
  // bodies (results/runs/sql/schedules/ai) AND the new sections
  // (changes/submit/deploy/block). 'schedules' is bridged to the panel's
  // 'schedule' id at the prop boundary.
  const [activeTab, setActiveTab] = useState<
    | 'runs' | 'schedules' | 'sql' | 'ai' | 'results' | 'changes' | 'submit' | 'deploy' | 'block'
    // Operational sections folded in from the former WorkflowProjectBar rail.
    | 'usage' | 'cost' | 'governance'
  >('changes');
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
  // Docked AI Build draft (AiBuildSection in the right rail): the generated
  // blocks/edges currently on the canvas pending Accept / Undo / Refine.
  // Lifted here (not inside the section) so the draft survives rail flips.
  const [aiDraft, setAiDraft] = useState<AiBuildDraft | null>(null);
  const [aiAccepting, setAiAccepting] = useState(false);
  // Ref mirror of aiDraft for async closures (pipeline load) that must not
  // capture a stale value — see handleLoadPipeline's draft-preservation.
  const aiDraftRef = useRef<AiBuildDraft | null>(null);
  useEffect(() => {
    aiDraftRef.current = aiDraft;
  }, [aiDraft]);

  // Workflow tags (chip strip in header). Loaded from getWorkflow when a
  // workflow is opened; edits persist via PATCH /workflow/{id} (a workflow is a
  // project row, so tags land in the shared project TAGS column with cache
  // invalidation). Updates are optimistic and revert on error.
  const [workflowTags, setWorkflowTags] = useState<string[]>([]);
  const [showTagInput, setShowTagInput] = useState(false);
  const [tagDraft, setTagDraft] = useState('');
  const [savingTags, setSavingTags] = useState(false);
  // Auto-save / draft restore state.
  const [draftRestorePrompt, setDraftRestorePrompt] = useState<null | {
    key: string;
    payload: { nodes: Node[]; edges: Edge[]; pipelineName: string; savedAt: number };
  }>(null);
  const lastLoadedUpdatedAtRef = useRef<number>(0);
  // Baseline block snapshot captured at load/new — the WorkflowSmartPanel
  // "Changes" section diffs the live canvas against this to pre-display the
  // pending block-level changes before submission.
  const [baselineBlocks, setBaselineBlocks] = useState<CanvasNodeSnapshot[]>([]);

  // Header action surfaces — schedule (inline right-panel tab) + rollback dialog.
  // Rollback stays a dialog (destructive, diff-confirm gate). The schedule
  // editor is NOT a modal: the header Schedule button reveals the existing
  // non-blocking `schedules` tab in the right panel, which already mounts
  // ScheduleManager — the page stays visible while editing.
  const [showRollbackDialog, setShowRollbackDialog] = useState(false);
  const [confirmDeletePipeline, setConfirmDeletePipeline] = useState(false);
  const [isSuspendingTask, setIsSuspendingTask] = useState(false);

  // Results preview state
  const [previewData, setPreviewData] = useState<{ columns: string[]; rows: Record<string, any>[]; total_rows: number; table: string } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Role-based access. `userRole` is the project-CONTRIBUTOR role (owner/editor/
  // viewer) — orthogonal to Data360 Action-RBAC, which gates the mutating CTAs
  // below via System 2 (useCanPerform), scoped to the active workflow project.
  const { username: currentUsername } = useAuth();
  const [userRole, setUserRole] = useState<ContributorRole | null>(null);
  const isReadOnly = userRole === 'viewer';

  // ─── System 2 Action-RBAC gates (project-scoped to the active workflow) ───
  // While the allow-set loads we keep CTAs enabled (fail-open, like useCanPerform
  // on a hard error) so there's no flash of disabled controls; the gate tightens
  // once permissions resolve and re-resolves live when an admin edits the matrix.
  const wfExecutePerm = useCanPerform('workflow', 'execute', activeWorkflowId ?? undefined);
  const wfDeployPerm = useCanPerform('workflow', 'deploy', activeWorkflowId ?? undefined);
  const wfEditPerm = useCanPerform('workflow', 'edit', activeWorkflowId ?? undefined);
  const wfCreatePerm = useCanPerform('workflow', 'create', activeWorkflowId ?? undefined);
  const wfDeletePerm = useCanPerform('workflow', 'delete', activeWorkflowId ?? undefined);
  const canWfExecute = wfExecutePerm.allowed || wfExecutePerm.loading;
  const canWfDeploy = wfDeployPerm.allowed || wfDeployPerm.loading;
  const canWfEdit = wfEditPerm.allowed || wfEditPerm.loading;
  const canWfCreate = wfCreatePerm.allowed || wfCreatePerm.loading;
  const canWfDelete = wfDeletePerm.allowed || wfDeletePerm.loading;
  const EXECUTE_DENIED_HINT = 'You lack the "execute" permission on workflow. Ask an administrator to grant it.';
  const DEPLOY_DENIED_HINT = 'You lack the "deploy" permission on workflow. Ask an administrator to grant it.';
  const EDIT_DENIED_HINT = 'You lack the "edit" permission on workflow. Ask an administrator to grant it.';
  const DELETE_DENIED_HINT = 'You lack the "delete" permission on workflow. Ask an administrator to grant it.';

  const readOnlyGuard = useCallback(() => {
    if (isReadOnly) {
      toast.error('You have view-only access to this workflow');
      return true;
    }
    return false;
  }, [isReadOnly]);

  // Persist the workflow tag set via PATCH /workflow/{id}. Optimistic: the
  // caller already shows `nextTags`; on success we re-sync from the server
  // response, on failure we revert to `prevTags` and surface an honest error.
  const persistWorkflowTags = useCallback(
    async (nextTags: string[], prevTags: string[]) => {
      if (!activeWorkflowId) return;
      setSavingTags(true);
      try {
        const updated = await workflowApi.updateWorkflow(activeWorkflowId, {
          tags: nextTags,
        });
        setWorkflowTags(updated.tags ?? nextTags);
        toast.success('Tag saved');
      } catch (err) {
        setWorkflowTags(prevTags);
        toast.error(getApiErrorMessage(err) || 'Failed to save tag');
      } finally {
        setSavingTags(false);
      }
    },
    [activeWorkflowId],
  );

  const handleRemoveTag = useCallback(
    (tag: string) => {
      if (readOnlyGuard() || savingTags) return;
      const prev = workflowTags;
      const next = prev.filter((t) => t !== tag);
      setWorkflowTags(next);
      void persistWorkflowTags(next, prev);
    },
    [readOnlyGuard, savingTags, workflowTags, persistWorkflowTags],
  );

  const handleAddTag = useCallback(
    (raw: string) => {
      const tag = raw.trim();
      if (!tag) return;
      if (readOnlyGuard() || savingTags) return;
      if (workflowTags.includes(tag)) return;
      const prev = workflowTags;
      const next = [...prev, tag];
      setWorkflowTags(next);
      void persistWorkflowTags(next, prev);
    },
    [readOnlyGuard, savingTags, workflowTags, persistWorkflowTags],
  );

  // Execution state
  const [lastExecution, setLastExecution] = useState<WorkflowExecutionResponse | null>(null);
  const [compiledSql, setCompiledSql] = useState<CompileWorkflowResponse | null>(null);
  const [validation, setValidation] = useState<ValidateWorkflowResponse | null>(null);
  const [aiSuggestions, setAiSuggestions] = useState<string | null>(null);
  const [aiSuggestionsLoading, setAiSuggestionsLoading] = useState(false);
  // Failed-run fix rail (docked, explore-design style). Opens automatically
  // when a run fails so the per-step diagnosis is front-and-center.
  const [showFixRail, setShowFixRail] = useState(false);
  // Persistent error display (shown in Runs panel instead of disappearing toast)
  const [pipelineError, setPipelineError] = useState<string | null>(null);

  // ─── Lifecycle state machine + capability gating ───────────────────────
  // `lifecycle` holds the phase of each lifecycle action. `caps` is the
  // backend's advisory capabilities hint (treated as a HINT only). `caps404`
  // records lifecycle actions whose route returned 404 at runtime — those are
  // gated to an honest disabled state regardless of what capabilities claims.
  const [lifecycle, setLifecycle] = useState<LifecycleState>({});
  const [caps, setCaps] = useState<WorkflowCapabilities | null>(null);
  const [unavailableRoutes, setUnavailableRoutes] = useState<Set<LifecycleAction>>(new Set());
  // Ticks every second while any action is running so elapsed time re-renders.
  const [, setElapsedTick] = useState(0);

  const setPhase = useCallback((action: LifecycleAction, entry: LifecycleEntry) => {
    setLifecycle((prev) => ({ ...prev, [action]: entry }));
  }, []);

  const markUnavailable = useCallback((action: LifecycleAction) => {
    setUnavailableRoutes((prev) => {
      if (prev.has(action)) return prev;
      const next = new Set(prev);
      next.add(action);
      return next;
    });
    setPhase(action, { phase: 'unavailable', message: UNAVAILABLE_HINT });
  }, [setPhase]);

  // Fetch capabilities once we have a token. Capabilities is advisory: a 404
  // here just means the hint is unavailable, NOT that lifecycle is broken —
  // the per-action runtime 404 path is the real gate.
  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    workflowApi
      .getWorkflowCapabilities()
      .then((c) => { if (!cancelled) setCaps(c); })
      .catch(() => { if (!cancelled) setCaps(null); });
    return () => { cancelled = true; };
  }, [accessToken]);

  // Drive the elapsed-time ticker only while something is running.
  const anyRunning = useMemo(
    () => Object.values(lifecycle).some((e) => e?.phase === 'running'),
    [lifecycle],
  );
  useEffect(() => {
    if (!anyRunning) return;
    const id = window.setInterval(() => setElapsedTick((t) => t + 1), 1000);
    return () => window.clearInterval(id);
  }, [anyRunning]);

  // Gating: an action is unavailable if it 404'd at runtime, OR if the backend
  // capabilities hint explicitly says it's unsupported. Only `builder.*`
  // capability flags are authoritative-negative; absence of a flag is treated
  // as "unknown / allowed" (the runtime 404 path will catch a purged route).
  const capabilityDenies = useCallback(
    (action: LifecycleAction): boolean => {
      if (!caps?.builder) return false;
      if (action === 'compile' && caps.builder.supports_compile === false) return true;
      if (action === 'validate' && caps.builder.supports_validate === false) return true;
      if (action === 'cloneTest' && caps.builder.supports_clone_data_tests === false) return true;
      return false;
    },
    [caps],
  );

  const isActionUnavailable = useCallback(
    (action: LifecycleAction): boolean =>
      unavailableRoutes.has(action) || capabilityDenies(action),
    [unavailableRoutes, capabilityDenies],
  );

  // Live elapsed seconds for a running action — read by the toolbar buttons.
  const elapsedSeconds = useCallback(
    (action: LifecycleAction): number | null => {
      const e = lifecycle[action];
      if (e?.phase !== 'running' || !e.startedAt) return null;
      return Math.max(0, Math.floor((Date.now() - e.startedAt) / 1000));
    },
    [lifecycle],
  );

  // Suffix appended to a lifecycle button's label to surface its phase:
  // running shows "· 3s", completed a check, empty/error/unavailable a marker.
  const phaseSuffix = useCallback(
    (action: LifecycleAction): string => {
      if (isActionUnavailable(action)) return '';
      const e = lifecycle[action];
      if (!e) return '';
      if (e.phase === 'running') {
        const s = elapsedSeconds(action);
        return s != null ? ` · ${s}s` : ' · …';
      }
      if (e.phase === 'completed') return ' ✓';
      if (e.phase === 'empty') return ' —';
      if (e.phase === 'error') return ' !';
      return '';
    },
    [lifecycle, elapsedSeconds, isActionUnavailable],
  );

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

  // Auto-fit canvas after loading a workflow AND whenever the node count
  // changes (drag-drop, import, template load) so the graph stays centered in
  // the canvas instead of clustering at the top-left origin.
  useEffect(() => {
    if (reactFlowInstance && nodes.length > 0 && !isLoading) {
      const t = setTimeout(
        () => reactFlowInstance.fitView({ padding: 0.25, duration: 300, includeHiddenNodes: true }),
        120,
      );
      return () => clearTimeout(t);
    }
  }, [reactFlowInstance, isLoading, nodes.length]);

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
    // Route the SmartPanel to the Block section so its config editor shows.
    setActiveTab('block');
    // User is following the AI hint — dismiss the banner.
    setAiNextStepHint(false);
    // Focus shifted to the graph — collapse the full-width source picker (G2).
    collapseSourcePanel();
  }, [collapseSourcePanel]);

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
    setShowSidebar(false);
    // Clicking the center canvas shifts focus to the graph — collapse the
    // full-width source picker back to a slim rail (G2 click-to-focus).
    collapseSourcePanel();
    // Dynamically adapt the right-panel tab when the user deselects a node.
    // Without this, a stale Schedule / SQL / Results tab from the previous
    // selection lingers even though the canvas no longer has anything
    // selected. Pick the most-useful tab for the current workflow state:
    //   - empty canvas → AI (where the user starts)
    //   - has a last run → Results
    //   - otherwise → Runs (where errors surface)
    setActiveTab((current) => {
      // Don't override the sticky / new SmartPanel sections when the user
      // deselects a node — only auto-route away from the block-detail view.
      if (current !== 'block') return current;
      if (nodes.length === 0) return 'ai';
      if (lastExecution) return 'results';
      return 'runs';
    });
  }, [nodes.length, lastExecution, collapseSourcePanel]);

  // Reveal the schedule editor inline (non-blocking): open the right panel
  // and switch to its existing `schedules` tab instead of a centered modal.
  const openSchedulePanel = useCallback(() => {
    setShowRightPanel(true);
    setActiveTab('schedules');
  }, []);

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

  // One-click apply of a structured fix proposed by the AI fix-rail. Currently
  // supports repointing a source block's database/schema/table (the most common
  // failure: a template ships pointing at a table that doesn't exist in the
  // account). Deterministic — patches node.data.config and marks dirty; the user
  // still re-runs. Returns true if applied.
  const applyNodeConfigPatch = useCallback(
    (nodeId: string, patch: Record<string, unknown>): boolean => {
      if (readOnlyGuard()) return false;
      let found = false;
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id !== nodeId) return node;
          found = true;
          return {
            ...node,
            data: { ...node.data, config: { ...(node.data?.config || {}), ...patch } },
          };
        }),
      );
      if (found) {
        setIsDirty(true);
        dirtyNodeIdsRef.current.add(nodeId);
        toast.success('Fix applied — Save and Run again to verify');
      } else {
        toast.error('Could not locate that block on the canvas');
      }
      return found;
    },
    [setNodes, readOnlyGuard],
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
    setBaselineBlocks([]); // empty canvas → every block reads as "added"
  }, [setNodes, setEdges]);

  const handleLoadPipeline = useCallback(
    async (wf: { id: string; name: string }) => {
      try {
        setIsPipelineLoading(true);
        // Fetch full workflow metadata (tags, created_at) alongside steps.
        // getWorkflow feeds the header tags chip strip and the draft-restore
        // comparison.
        // Parallelize the whole open waterfall: steps + metadata + contributors +
        // latest deployment all resolve together instead of in three serial stages.
        // Only `listSteps` is allowed to reject the load (its 404 drives the
        // is404 branch below); the three non-critical reads each `.catch` to a
        // degraded value so a slow/failed sidecar never fails or blocks the open.
        const [stepsResponse, workflowMeta, contributors, deploymentsRes] = await Promise.all([
          workflowApi.listSteps(wf.id),
          // Metadata (tags / created_at) is non-critical and this endpoint may be
          // unavailable (returns 404) — the pipeline loads fully from steps. Degrade
          // SILENTLY to null; never surface a "Not Found" toast for optional metadata.
          workflowApi.getWorkflow(wf.id).catch((e) => {
            console.warn('Workflow metadata unavailable (tags/created_at) — degrading:', e);
            return null;
          }),
          // Contributors → the current user's role for this workflow. Non-critical:
          // degrade to null (derived below as 'owner'), matching the prior catch path.
          listContributors(wf.id).catch(() => null),
          // Latest deployment (limit:1) → pending/approved approval badge.
          // Non-critical: degrade to null and leave approvalStatus at its 'none' default.
          workflowApi.listDeployments(wf.id, { limit: 1 }).catch(() => null),
        ]);
        const { nodes: newNodes, edges: newEdges } = stepsToReactFlow(stepsResponse.steps || []);
        // Preserve a pending AI Build draft: when a load resolves AFTER the
        // docked AI flow dropped a draft on the canvas (slow open, SSE-driven
        // reload), carry the draft nodes/edges over instead of wiping them —
        // they are still pending Accept/Undo in the right rail. The baseline
        // stays loaded-only, so the draft correctly shows as "added" in the
        // Changes diff.
        const pendingDraft = aiDraftRef.current;
        if (pendingDraft) {
          const draftNodeIds = new Set(pendingDraft.nodeIds);
          const draftEdgeIds = new Set(pendingDraft.edgeIds);
          setNodes((prev) => [...newNodes, ...prev.filter((n) => draftNodeIds.has(n.id))]);
          setEdges((prev) => [...newEdges, ...prev.filter((e) => draftEdgeIds.has(e.id))]);
        } else {
          setNodes(newNodes);
          setEdges(newEdges);
        }
        // Capture the loaded graph as the diff baseline for the SmartPanel
        // "Changes" section (live canvas is compared against this).
        setBaselineBlocks(toBlockSnapshots(newNodes));
        setActiveWorkflowId(wf.id);
        setActiveWorkflowName(wf.name);
        setPipelineName(wf.name);
        setWorkflowTags(workflowMeta?.tags ?? []);
        lastLoadedUpdatedAtRef.current = workflowMeta?.created_at
          ? new Date(workflowMeta.created_at).getTime()
          : 0;
        setIsDirty(Boolean(pendingDraft));
        setApprovalStatus('none');
        dirtyNodeIdsRef.current.clear();
        setSaveStatus('idle');

        // Determine the user's role for this workflow project from the already-
        // resolved contributors result. Wrapped in try/catch so a malformed entry
        // (missing username) defaults to 'owner' instead of leaking to the outer
        // catch — preserving the original local-degrade behavior. null → 'owner'.
        try {
          const me = contributors?.find(
            (c) => c.username.toLowerCase() === currentUsername.toLowerCase()
          );
          setUserRole(me?.role ?? 'owner');
        } catch {
          setUserRole('owner');
        }

        // Check if there's an active pending/approved deployment from the
        // already-resolved deployments result (non-critical — null leaves 'none').
        const latestDeployment = (deploymentsRes as any)?.deployments?.[0];
        if (latestDeployment?.status === 'pending_approval') {
          setApprovalStatus('pending');
        } else if (latestDeployment?.status === 'approved') {
          setApprovalStatus('approved');
        }

        toast.success(`Loaded workflow: ${wf.name}`);
        trackFeatureClick('workflow_pipeline_loaded', {
          workflow_id: wf.id,
          step_count: newNodes.length,
        });
      } catch (error) {
        console.error('Failed to load workflow:', error);
        // Be honest: the steps-read route (/steps) is purged on this backend,
        // so existing workflows can't reconstruct their canvas. Don't leave an
        // empty canvas pretending it loaded — surface why and leave state clean.
        if (is404(error)) {
          setPipelineError(
            `Can't reopen this saved workflow — reading its steps is ${UNAVAILABLE_HINT.toLowerCase()}. You can still build and save a new graph.`,
          );
          toast.error('Reopening saved workflows is not available on this backend yet');
        } else {
          toast.error(getApiErrorMessage(error) || 'Failed to load workflow');
        }
      } finally {
        setIsPipelineLoading(false);
      }
    },
    [setNodes, setEdges, trackFeatureClick]
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
    setPhase('save', { phase: 'running', startedAt: Date.now() });
    // from-graph ALWAYS creates a fresh project (it does not upsert), so a
    // resave of an existing workflow produces a duplicate copy, surfaced
    // honestly in the toast rather than claiming an in-place "new version".
    try {
      if (!activeWorkflowId) {
        // CREATE path — POST /workflow (audit-verified wired). Keep new-workflow
        // saves on the proven endpoint rather than the bulk graph route.
        const stepInputs = nodesToStepInputs(nodes, edges);
        const created = await workflowApi.createWorkflow({
          project_name: pipelineName,
          tags: workflowTags.length ? workflowTags : undefined,
          steps: stepInputs,
        });
        setActiveWorkflowId(created.project_id);
        setActiveWorkflowName(created.project_name);
        lastLoadedUpdatedAtRef.current = Date.now();
        setPhase('save', { phase: 'completed' });
        toast.success('Workflow created');
      } else {
        // RESAVE / UPDATE path — the per-step /steps CRUD is purged backend-side,
        // so the only working persist for an existing graph is the bulk
        // POST /workflow/from-graph. It creates a NEW project, so we re-point the
        // active id at the copy and tell the user it's a copy.
        const { nodes: graphNodes, edges: graphEdges } = nodesToFromGraph(nodes, edges);
        const response = await workflowApi.saveWorkflowFromGraph({
          project_name: pipelineName,
          nodes: graphNodes,
          edges: graphEdges,
          tags: workflowTags.length ? workflowTags : undefined,
        });

        // Re-point the active workflow at the saved copy so downstream lifecycle
        // controls (validate / compile / clone-test / run / deploy) target it.
        if (response.project_id) {
          setActiveWorkflowId(response.project_id);
          setActiveWorkflowName(pipelineName);
          lastLoadedUpdatedAtRef.current = Date.now();
        }

        // Surface partial failures honestly instead of claiming a clean save.
        const partialErrors = (response.errors || [])
          .map((e) => (typeof e === 'string' ? e : `${e.node_id ?? 'node'}: ${e.error}`));
        const serverValidationError =
          response.validation && response.validation.valid === false
            ? response.validation.error
            : undefined;

        if (partialErrors.length > 0) {
          setPhase('save', { phase: 'error', message: partialErrors[0] });
          setPipelineError(`Saved as a new copy with ${partialErrors.length} issue(s): ${partialErrors.join('; ')}`);
          toast.error(`Saved with ${partialErrors.length} issue(s)`);
        } else {
          setPhase('save', { phase: 'completed' });
          if (serverValidationError) {
            setPipelineError(`Validation: ${serverValidationError}`);
            toast.success('Saved as a new workflow copy (validation flagged issues)');
          } else {
            // Honest: from-graph cannot update in place, it forks a new copy.
            toast.success('Saved as a new workflow copy');
          }
        }
      }

      // Mark clean — the saved graph becomes the new diff baseline so the
      // SmartPanel "Changes" section resets to zero pending changes. Computed
      // inline from `nodes` (currentBlocks memo is declared below this handler).
      setIsDirty(false);
      setBaselineBlocks(toBlockSnapshots(nodes));
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
      if (is404(error)) {
        // The bulk save route itself is unavailable — honest disabled state.
        markUnavailable('save');
        setPipelineError(`Save unavailable: ${UNAVAILABLE_HINT}`);
        toast.error(UNAVAILABLE_HINT);
      } else {
        const errMsg = getApiErrorMessage(error) || 'Failed to save workflow';
        setPhase('save', { phase: 'error', message: errMsg });
        toast.error(errMsg);
        setPipelineError(`Save failed: ${errMsg}`);
      }
    } finally {
      setIsSaving(false);
    }
  }, [nodes, edges, pipelineName, activeWorkflowId, autosaveKey, workflowTags, setPhase, markUnavailable]);
  handleSaveRef.current = handleSavePipeline;

  const handleDeletePipeline = useCallback(() => {
    if (readOnlyGuard()) return;
    if (!activeWorkflowId) return;
    setConfirmDeletePipeline(true);
  }, [activeWorkflowId]);

  const executeDeletePipeline = useCallback(async () => {
    if (!activeWorkflowId) return;
    setConfirmDeletePipeline(false);
    const t = toast.loading('Deleting workflow…');
    try {
      // A workflow IS a project row (workflow_id === project_id), so the real
      // soft-delete is DELETE /projects/{id}, not just clearing the canvas steps.
      await deleteProject(activeWorkflowId);
      await loadWorkflows();
      handleNewPipeline();
      toast.success('Workflow deleted', { id: t });
    } catch (error) {
      console.error('Failed to delete workflow:', error);
      toast.error(getApiErrorMessage(error) || 'Failed to delete workflow', { id: t });
    }
  }, [activeWorkflowId, handleNewPipeline, loadWorkflows]);

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
      const { data } = await apiClient.get(API.workflow.previewTable(), {
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

      const action: LifecycleAction = dryRun ? 'compile' : 'execute';
      setIsExecuting(true);
      setPhase(action, { phase: 'running', startedAt: Date.now() });
      try {
        if (dryRun) {
          // Compile (dry-run): generates SQL without executing
          const compileResult = await workflowApi.compileWorkflow(activeWorkflowId);
          setCompiledSql(compileResult);
          setActiveTab('sql');
          const hasSql = !!compileResult?.compiled_sql?.trim();
          setPhase('compile', { phase: hasSql ? 'completed' : 'empty' });
          toast.success(hasSql ? 'SQL generated (dry run)' : 'Compiled — no SQL produced');
        } else {
          // Execute
          const response = await workflowApi.executeWorkflow(activeWorkflowId, {
            trigger_type: 'manual',
          });
          setLastExecution(response);
          trackFeatureClick('workflow_pipeline_executed', {
            workflow_id: activeWorkflowId,
            status: response.status,
          });

          if (response.status === 'completed' || response.status === 'success') {
            setPhase('execute', { phase: 'completed' });
            toast.success(
              response.rows_affected != null
                ? `Executed successfully! ${response.rows_affected} rows affected`
                : 'Executed successfully!',
            );
            // Auto-load destination table preview
            loadResultsPreview();
          } else if (response.status === 'failed' || response.status === 'partial_failure') {
            const errorDetail = response.error
              ? extractErrorString(response.error)
              : 'Check execution history for details';
            setPhase('execute', { phase: 'error', message: errorDetail });
            setPipelineError(`Execution failed: ${errorDetail}`);
            // Open the docked fix-rail so the per-step diagnosis + AI fix is
            // front-and-centre rather than buried in a tab.
            setShowFixRail(true);
            setActiveTab('runs');
          } else {
            setPhase('execute', { phase: 'completed' });
          }
        }
      } catch (error: any) {
        if (is404(error)) {
          markUnavailable(action);
          const label = dryRun ? 'SQL preview (compile)' : 'Run (execute)';
          setPipelineError(`${label} unavailable: ${UNAVAILABLE_HINT}`);
        } else {
          console.error('Execution failed:', error);
          const errMsg = getApiErrorMessage(error) || 'Execution failed';
          setPhase(action, { phase: 'error', message: errMsg });
          setPipelineError(errMsg);
          if (!dryRun) setActiveTab('runs');
        }
        // Re-throw so gated callers (InsightActionButton in the SmartPanel)
        // never report a fake success; fire-and-forget callers use
        // runExecuteSafe below. 404/501 flips the gate to `unavailable`.
        throw error;
      } finally {
        setIsExecuting(false);
        // Force execution history to refresh after execution completes
        if (!dryRun) setExecutionRefreshKey((k) => k + 1);
      }
    },
    [activeWorkflowId, nodes, setPhase, markUnavailable, loadResultsPreview, trackFeatureClick]
  );
  // Fire-and-forget variant for non-gated callers (toolbar Run button, ⌘Enter
  // shortcut): the error is already surfaced via pipelineError/phase inside
  // handleExecute — swallow the re-throw to avoid an unhandled rejection.
  const runExecuteSafe = useCallback(
    (dryRun: boolean) => {
      void handleExecute(dryRun).catch(() => {
        /* already surfaced in handleExecute */
      });
    },
    [handleExecute],
  );
  handleExecuteRef.current = runExecuteSafe;

  const handleValidate = useCallback(async () => {
    setPipelineError(null);
    if (!activeWorkflowId) {
      setPipelineError('Save the workflow first before validating.');
      return;
    }

    setPhase('validate', { phase: 'running', startedAt: Date.now() });
    try {
      setAiSuggestions(null);
      const result = await workflowApi.validateWorkflow(activeWorkflowId);
      setValidation(result);

      if (result.valid) {
        setPhase('validate', { phase: 'completed' });
        toast.success('Pipeline is valid');
        setPipelineError(null);
      } else {
        const errMsg = extractErrorString(result.error) || 'Check the error panel for details';
        setPhase('validate', { phase: 'error', message: errMsg });
        setPipelineError(`Validation: ${errMsg}`);
        // Surface the failure to gated callers (no fake "DAG validated" toast).
        throw new Error(`Validation failed: ${errMsg}`);
      }
    } catch (error: any) {
      if (is404(error)) {
        markUnavailable('validate');
        setPipelineError(`Validate unavailable: ${UNAVAILABLE_HINT}`);
      } else if (!(error instanceof Error && error.message.startsWith('Validation failed:'))) {
        console.error('Validation failed:', error);
        const errMsg = getApiErrorMessage(error) || 'Validation failed';
        setPhase('validate', { phase: 'error', message: errMsg });
        setPipelineError(errMsg);
      }
      // Re-throw so InsightActionButton ('Lint DAG') reflects the real outcome;
      // a 404/501 flips it to the honest `unavailable` chip.
      throw error;
    }
  }, [activeWorkflowId, setPhase, markUnavailable]);

  // ============================================
  // CLONE-DATA TESTS — "Test on cloned data"
  // ============================================
  // The standard's test-real-life-via-clone step: runs the pipeline's source
  // connectors against a CLONED copy of the real business data (no prod write).
  // Sits between dry-run (compile) and deploy. Connector ids are derived from
  // the source nodes on the canvas.
  const cloneTestConnectorIds = useMemo(() => {
    const ids = new Set<string>();
    nodes.forEach((n) => {
      const cfg = (n.data?.config || n.data || {}) as Record<string, unknown>;
      const candidate =
        (cfg.connector_id as string) ||
        (cfg.connection_id as string) ||
        (cfg.connectorId as string);
      if (candidate) ids.add(candidate);
    });
    return Array.from(ids);
  }, [nodes]);

  const [cloneTestResult, setCloneTestResult] = useState<CloneDataTestsResult | null>(null);

  // Stable snapshot of the canvas blocks for the SmartPanel "Changes" diff.
  // configKey serialises the block config so config edits register as "modified".
  const currentBlocks = useMemo<CanvasNodeSnapshot[]>(() => toBlockSnapshots(nodes), [nodes]);

  const handleCloneDataTests = useCallback(async () => {
    if (!activeWorkflowId) {
      toast.error('Save the workflow first before testing on cloned data');
      return;
    }
    if (cloneTestConnectorIds.length === 0) {
      toast.error('No source connector found — add a connector-backed source to test on cloned data');
      return;
    }
    setPipelineError(null);
    setCloneTestResult(null);
    setPhase('cloneTest', { phase: 'running', startedAt: Date.now() });
    try {
      const result = await workflowApi.runCloneDataTests(activeWorkflowId, cloneTestConnectorIds);
      setCloneTestResult(result);
      setShowRightPanel(true);
      setActiveTab('results');
      if (!result.reports || result.reports.length === 0) {
        setPhase('cloneTest', { phase: 'empty', message: 'No tables were tested on the clone' });
        toast('Clone test ran but produced no results');
      } else if (result.ok) {
        setPhase('cloneTest', { phase: 'completed' });
        toast.success(`Clone test passed — ${result.connectors_passed}/${result.connector_count} connectors`);
      } else {
        setPhase('cloneTest', {
          phase: 'error',
          message: `${result.connectors_failed} connector(s) failed on the cloned data`,
        });
        setPipelineError(`Clone test: ${result.connectors_failed} connector(s) failed against the cloned data`);
        // Surface the failure to the gated caller (no fake success toast).
        throw new Error(`Clone test: ${result.connectors_failed} connector(s) failed`);
      }
    } catch (error: any) {
      if (is404(error)) {
        markUnavailable('cloneTest');
        setPipelineError(`Test on cloned data unavailable: ${UNAVAILABLE_HINT}`);
      } else if (!(error instanceof Error && error.message.startsWith('Clone test:'))) {
        const errMsg = getApiErrorMessage(error) || 'Clone test failed';
        setPhase('cloneTest', { phase: 'error', message: errMsg });
        setPipelineError(`Clone test failed: ${errMsg}`);
      }
      // Re-throw for the gated SmartPanel caller (404/501 → unavailable chip).
      throw error;
    }
  }, [activeWorkflowId, cloneTestConnectorIds, setPhase, markUnavailable]);

  // AI assist. When a real run exists, ask Cortex to analyze it for a root-cause
  // + fix (live POST /workflow/{id}/runs/{runId}/analyze). Otherwise fall back
  // to summarizing the static validation result.
  const handleGetAiSuggestions = useCallback(async () => {
    const runId = (lastExecution as any)?.run_id;
    setAiSuggestionsLoading(true);
    setAiSuggestions(null);
    try {
      if (activeWorkflowId && runId) {
        const res = await workflowApi.analyzeRun(activeWorkflowId, runId);
        setAiSuggestions(res?.ai_analysis?.trim() || 'No analysis returned.');
        return;
      }
      if (!validation) {
        setAiSuggestions('Run the workflow (or Validate) first so the AI has something to analyze.');
        return;
      }
      const info: string[] = [];
      if (validation.error) info.push(`Error: ${extractErrorString(validation.error)}`);
      if (validation.mode) info.push(`Mode: ${validation.mode}`);
      if (validation.steps_count) info.push(`Steps: ${validation.steps_count}`);
      if (validation.destination) info.push(`Destination: ${validation.destination}`);
      setAiSuggestions(info.length > 0 ? info.join('\n') : 'No suggestions available.');
    } catch (err: any) {
      if (is404(err)) {
        markUnavailable('execute');
        setAiSuggestions('AI run-analysis is not available on this deployment.');
      } else {
        toast.error('AI analysis failed');
        setAiSuggestions(`Could not analyze the run: ${getApiErrorMessage(err) || 'unknown error'}`);
      }
    } finally {
      setAiSuggestionsLoading(false);
    }
  }, [activeWorkflowId, lastExecution, validation, markUnavailable]);

  // ============================================
  // SUBMIT FOR APPROVAL
  // ============================================

  const handleSubmitForApproval = useCallback(async () => {
    if (!activeWorkflowId) {
      toast.error('Save the pipeline first');
      return;
    }
    if (readOnlyGuard()) return;

    setPhase('deploy', { phase: 'running', startedAt: Date.now() });
    try {
      // Get the latest version ID
      const versionsResponse = await workflowApi.listVersions(activeWorkflowId, { limit: 1 });
      const versions = (versionsResponse as any)?.versions || [];
      if (versions.length === 0) {
        setPhase('deploy', { phase: 'empty', message: 'No version to deploy' });
        toast.error('No version found. Save the pipeline first to create a version.');
        // Throw (not return) so the gated caller doesn't toast a fake success.
        throw new Error('NO_VERSION');
      }
      const latestVersionId = versions[0].version_id;

      await workflowApi.requestDeployment(activeWorkflowId, {
        version_id: latestVersionId,
        deployment_type: 'with_approval',
      });
      setPhase('deploy', { phase: 'completed' });
      toast.success('Pipeline submitted for approval!');
      setApprovalStatus('pending');
      trackFeatureClick('workflow_deploy_requested', {
        workflow_id: activeWorkflowId,
        version_id: latestVersionId,
      });
    } catch (error: any) {
      if (is404(error)) {
        // The deployment lifecycle routes are purged — honest disabled state;
        // re-throw so the gated caller flips to the `unavailable` chip.
        markUnavailable('deploy');
        setPipelineError(`Submit for approval unavailable: ${UNAVAILABLE_HINT}`);
        throw error;
      }
      if (error instanceof Error && error.message === 'NO_VERSION') {
        // Already surfaced above — propagate for the gate, skip double-toast.
        throw new Error('No version found. Save the pipeline first to create a version.');
      }
      console.error('Submit for approval failed:', error);
      // Snowflake compile errors come back as a wall of text. Pipe through
      // friendlyError() so the toast reads "Couldn't request approval —
      // backend column missing" instead of "000904 (42000): … invalid
      // identifier 'CHANGES_SUMMARY'". Also surface the platform-side
      // pipelineError banner so the user can drill into the raw payload.
      const raw = getApiErrorMessage(error) || 'Failed to submit for approval';
      const { headline, hint } = friendlyError(raw);
      setPhase('deploy', { phase: 'error', message: headline });
      setPipelineError(`Approval: ${raw}${hint ? `  —  ${hint}` : ''}`);
      // Re-throw so the gated SmartPanel caller reports the real outcome.
      throw new Error(headline);
    }
  }, [activeWorkflowId, readOnlyGuard, setPhase, markUnavailable, trackFeatureClick]);

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

  // Import a workflow/template from a JSON file. Accepts either the raw canvas
  // shape `{name|pipelineName, nodes, edges}` (template files) or the exported
  // step shape `{name, steps[]}` (re-uses stepsToReactFlow for the round-trip).
  const importFileRef = useRef<HTMLInputElement>(null);
  const handleImportJSON = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '')) as {
          name?: string; pipelineName?: string;
          nodes?: Node[]; edges?: Edge[]; steps?: WorkflowStep[];
        };
        let nextNodes: Node[] = [];
        let nextEdges: Edge[] = [];
        if (Array.isArray(parsed.nodes) && parsed.nodes.length > 0) {
          nextNodes = parsed.nodes;
          nextEdges = Array.isArray(parsed.edges) ? parsed.edges : [];
        } else if (Array.isArray(parsed.steps) && parsed.steps.length > 0) {
          const flow = stepsToReactFlow(parsed.steps);
          nextNodes = flow.nodes;
          nextEdges = flow.edges;
        } else {
          toast.error('Unrecognized workflow file — expected { nodes, edges } or { steps }');
          return;
        }
        setNodes(nextNodes);
        setEdges(nextEdges);
        setPipelineName(parsed.name || parsed.pipelineName || 'Imported Workflow');
        setIsDirty(true);
        toast.success(`Imported "${parsed.name || parsed.pipelineName || 'workflow'}" — review, then Save to persist`);
      } catch {
        toast.error('Invalid JSON — could not import workflow');
      }
    };
    reader.readAsText(file);
  }, [setNodes, setEdges]);

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

  // Normalize the per-step results across BOTH execution engines. The CTE
  // engine returns them under `steps` (+ failures under `error.failed_steps`),
  // the legacy engine under `execution_details.steps_results`. Reading only one
  // collapses a CTE failure into a single workflow-level error.
  const normalizedSteps = useMemo(() => {
    if (!lastExecution) return [] as any[];
    const le = lastExecution as any;
    const fromDetails =
      le?.execution_details?.steps ||
      le?.execution_details?.steps_results ||
      le?.steps ||
      le?.steps_results ||
      [];
    if (Array.isArray(fromDetails) && fromDetails.length > 0) return fromDetails;
    // Last resort: only the failed steps came back (error_log.failed_steps).
    const failed = le?.error?.failed_steps || le?.error_log?.failed_steps || [];
    return Array.isArray(failed) ? failed : [];
  }, [lastExecution]);

  // The subset that failed, with a human label resolved per step.
  const failedSteps = useMemo(
    () =>
      normalizedSteps
        .filter((s: any) => s?.status === 'failed' || s?.status === 'error')
        .map((s: any, i: number) => ({
          ...s,
          _label:
            s.step_name || s.cte_alias || s.action_type || s.action || s.step_id || `Step ${s.step_order ?? i + 1}`,
          _order: s.step_order ?? i + 1,
        })),
    [normalizedSteps],
  );

  // Derive deterministic one-click fixes from the failed steps. The dominant
  // failure is a source/destination block pointing at an object that doesn't
  // exist (Snowflake 002003 "does not exist or not authorized"). We can't guess
  // the correct table, but we CAN detect the offending block and pre-stage a
  // repoint: clear the stale table so the config form forces a fresh pick.
  const fixSuggestions = useMemo(() => {
    const out: Array<{ nodeId: string; label: string; description: string; patch: Record<string, unknown> }> = [];
    for (const s of failedSteps) {
      const nodeId = (s.node_id || s.step_id) as string | undefined;
      if (!nodeId) continue;
      const node = nodes.find((n) => n.id === nodeId);
      if (!node) continue;
      const errText = extractErrorString(s.error);
      const missingObj = /does not exist or not authorized|002003|invalid identifier/i.test(errText);
      const cfg = (node.data?.config || {}) as Record<string, unknown>;
      const isLocational = cfg.table != null || cfg.database != null;
      if (missingObj && isLocational) {
        const fqn = [cfg.database, cfg.schema, cfg.table].filter(Boolean).join('.');
        out.push({
          nodeId,
          label: `${s._label}: object not found`,
          description: fqn
            ? `${fqn} doesn't exist or isn't granted. Clear the table to re-pick a valid one, then Save & Run.`
            : 'Re-pick a valid table for this block, then Save & Run.',
          // Clearing table/columns makes the source form re-prompt for a real
          // selection (it cascades database → schema → table). Database/schema
          // are kept so the user starts from the right place.
          patch: { table: '', columns: [] },
        });
      }
    }
    return out;
  }, [failedSteps, nodes]);

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

    // Normalized across CTE + legacy engines (see normalizedSteps above).
    const stepResults = normalizedSteps;

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
      const errMsg = extractErrorString((lastExecution as any).error) || 'Execution failed';
      orderedNodeIds.forEach((id, idx) => {
        state[id] = { executionStatus: 'failed', error: errMsg, stepIndex: idx + 1 };
      });
    }

    return state;
  }, [lastExecution, normalizedSteps, nodes]);

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
            setActiveTab('block');
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

  // ── Docked AI Build (AiBuildSection) — apply / review / undo ─────────────
  // Apply a generated graph DIRECTLY onto the real canvas as an "AI draft":
  // ids are remapped to a unique stamp (no collision with loaded steps or a
  // previous draft), nodes carry data.aiDraft=true (violet badge) and arrive
  // selected; any previous un-accepted draft is swapped out first.
  const handleAiBuildApply = useCallback(
    (
      genNodes: Node[],
      genEdges: Edge[],
      prompt: string,
      source: AiGenerateSource,
      fallbackReason?: string,
    ) => {
      const prevNodeIds = new Set(aiDraft?.nodeIds ?? []);
      const prevEdgeIds = new Set(aiDraft?.edgeIds ?? []);
      const stamp = Date.now().toString(36);
      const idMap = new Map(genNodes.map((n) => [n.id, `ai_${stamp}_${n.id}`]));

      const draftNodes = genNodes.map((n) => ({
        ...n,
        id: idMap.get(n.id)!,
        selected: true,
        data: { ...n.data, aiDraft: true, nodeId: idMap.get(n.id)! },
      }));
      const draftEdges = genEdges
        .filter((e) => idMap.has(e.source) && idMap.has(e.target))
        .map((e, i) => ({
          ...e,
          id: `ai_${stamp}_e${i}`,
          source: idMap.get(e.source)!,
          target: idMap.get(e.target)!,
        }));

      setNodes((prev) => {
        const kept = prev.filter((n) => !prevNodeIds.has(n.id));
        // Drop the new draft BELOW any existing blocks so nothing overlaps.
        const offsetY = kept.length
          ? Math.max(...kept.map((n) => n.position.y)) + 200
          : 0;
        return [
          ...kept.map((n) => ({ ...n, selected: false })),
          ...draftNodes.map((n) => ({
            ...n,
            position: { x: n.position.x, y: n.position.y + offsetY },
          })),
        ];
      });
      setEdges((prev) => [
        ...prev.filter(
          (e) => !prevEdgeIds.has(e.id) && !prevNodeIds.has(e.source) && !prevNodeIds.has(e.target),
        ),
        ...draftEdges,
      ]);
      setIsDirty(true);
      setAiDraft({
        prompt,
        nodeIds: draftNodes.map((n) => n.id),
        edgeIds: draftEdges.map((e) => e.id),
        source,
        fallbackReason,
      });
    },
    [aiDraft, setNodes, setEdges],
  );

  // Undo — remove exactly the draft's nodes/edges from the canvas.
  const handleAiBuildUndo = useCallback(() => {
    if (!aiDraft) return;
    const ids = new Set(aiDraft.nodeIds);
    const eids = new Set(aiDraft.edgeIds);
    setNodes((prev) => prev.filter((n) => !ids.has(n.id)));
    setEdges((prev) =>
      prev.filter((e) => !eids.has(e.id) && !ids.has(e.source) && !ids.has(e.target)),
    );
    setAiDraft(null);
    toast('AI draft removed from the canvas.', { icon: '↩️' });
  }, [aiDraft, setNodes, setEdges]);

  // Live per-block review rows for the docked review list — recomputed from
  // the REAL canvas nodes, so configuring a block on the canvas clears its
  // missing-param flag in the panel immediately.
  const aiDraftReview = useMemo<AiBuildReviewRow[]>(() => {
    if (!aiDraft) return [];
    const ids = new Set(aiDraft.nodeIds);
    return nodes
      .filter((n) => ids.has(n.id))
      .map((n) => {
        const data = (n.data ?? {}) as Record<string, unknown>;
        const issues = validateNode({ type: String(n.type ?? ''), data });
        return {
          id: n.id,
          label: String(data.label ?? data.name ?? n.id),
          type: String(n.type ?? 'unknown'),
          missingParams: issues
            .filter((i) => i.kind === 'missing_required' && i.field)
            .map((i) => i.field as string),
        };
      });
  }, [aiDraft, nodes]);

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
        setActiveTab('ai');
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

  // Strip the advisor deep-link params (intent/from) from the URL once the
  // suggestion is consumed or dismissed, so a refresh doesn't re-prompt and the
  // ?project=<id> share-link stays clean.
  const stripScanParams = useCallback(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      if (!params.has('intent') && !params.has('from')) return;
      params.delete('intent');
      params.delete('from');
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : (pathname || '/workflow'), { scroll: false });
    } catch {
      /* noop */
    }
  }, [router, pathname]);

  // One-click create from the AI-suggested (scan-prefilled) workflow. Mirrors the
  // NEW-PROJECT branch of handleAiCreated but names the project from the scan
  // (e.g. "Curate CUSTOMERS") instead of the "[AI Draft] …" prefix, and tags it
  // `from:scan` for audit. The gate's `activeWorkflowId` is always null here.
  const applyScanSuggestion = useCallback(
    async (genNodes: Node[], genEdges: Edge[], meta: ScanSuggestionMeta) => {
      setScanApplying(true);
      try {
        const steps = genNodes.map((n, i) => {
          const incoming = genEdges.filter((e) => e.target === n.id).map((e) => e.source);
          return {
            action_type: convertLegacyType(String(n.type || 'sql')) as WorkflowActionType,
            step_name: String((n.data as { label?: string } | undefined)?.label ?? `Step ${i + 1}`),
            description: `AI-suggested ${String(n.type)} block (from scan).`,
            payload: {
              ai_generated: true,
              from_scan: true,
              node_type: String(n.type),
              nodeId: n.id,
              position: n.position,
              inputs: incoming,
              ...((n.data as Record<string, unknown>) ?? {}),
            },
          };
        });

        const created = await workflowApi.createWorkflow({
          project_name: meta.name,
          description: meta.description,
          tags: ['ai-suggested', 'from:scan'],
          steps,
        });

        projectGateDismissedRef.current = true;
        setNodes(genNodes as unknown as typeof nodes);
        setEdges(genEdges as unknown as typeof edges);
        setActiveWorkflowId(created.project_id);
        setActiveWorkflowName(created.project_name);
        setPipelineName(created.project_name);
        setUserRole('owner');
        setIsDirty(false);
        setAiNextStepHint(true);
        void loadWorkflows();
        stripScanParams();
        toast.success(`Created "${created.project_name}" from scan — review & run`);

        try {
          const validation = await workflowApi.validateWorkflow(created.project_id);
          const issues = (validation as { errors?: unknown[] })?.errors ?? [];
          if (Array.isArray(issues) && issues.length > 0) {
            toast.error(`Validation found ${issues.length} issue${issues.length === 1 ? '' : 's'} — see Runs panel`);
          }
        } catch {
          /* validation is advisory — the draft stands either way */
        }
      } catch (err) {
        toast.error(getApiErrorMessage(err) || 'Could not create workflow from scan');
      } finally {
        setScanApplying(false);
      }
    },
    [setNodes, setEdges, loadWorkflows, stripScanParams],
  );

  // Active only on a fresh advisor deep-link with no workflow yet selected.
  const scanPrefillActive =
    scanIntentRef.current.intent === 'create' &&
    scanIntentRef.current.from === 'scan' &&
    !activeWorkflowId &&
    !scanPrefillDismissed;

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
        {/* Unified list-view cockpit — KPI strip + right AxisCockpit rail
            (deployment / runs / perf / cost / history / AI entry point).
            LIST VIEW ONLY: the builder view keeps its approved docked right
            bar (WorkflowSmartPanel + AI BUILD) — the two never coexist. */}
        <WorkflowListCockpit
          workflows={workflows}
          workflowsLoading={isLoading}
          onOpenWorkflow={async (wf: CockpitWorkflowItem, section?: CockpitOpenSection) => {
            projectGateDismissedRef.current = true;
            await handleLoadPipeline({ id: wf.id, name: wf.name });
            // Focus the requested SmartPanel section AFTER the steps land: the
            // empty-canvas guard resets 'runs' while nodes are still loading.
            if (section) setActiveTab(section);
          }}
          onBuildWithAi={() => {
            // Hand off to the EXISTING docked AI BUILD bar on a fresh canvas —
            // no new AI surface here.
            projectGateDismissedRef.current = true;
            handleNewPipeline();
            setActiveTab('ai');
          }}
        >
          {/* AI-suggested workflow prefill — shown when the Account-Overview advisor
              deep-links with ?intent=create&from=scan. One click creates a named,
              fully-sourced pipeline from the scanned objects. Manual gate stays below. */}
          {scanPrefillActive && (
            <ScanIntentPrefill
              onApply={applyScanSuggestion}
              onDismiss={() => {
                setScanPrefillDismissed(true);
                stripScanParams();
              }}
              applying={scanApplying}
            />
          )}
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
        </WorkflowListCockpit>
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

  // AI persistence path — shared by the docked AI Build "Accept all" and the
  // classic wizard fallback (the centered-modal mount below, now reachable
  // only via the "classic step-by-step wizard" link in AiBuildSection).
  const handleAiClose = () => {
    setShowAiGenerate(false);
    setAiSeedDescription('');
  };
  const handleAiCreated = async (
    genNodes: Node[],
    genEdges: Edge[],
    meta: { description: string; compliance_review?: Record<string, 'reviewed' | 'unchecked'> },
  ) => {
    setNodes(genNodes as unknown as typeof nodes);
    setEdges(genEdges as unknown as typeof edges);
    setIsDirty(true);
    setAiNextStepHint(true);
    const draftName = `[AI Draft] ${(meta.description || 'Untitled').slice(0, 30)}`;
    try {
      const steps = genNodes.map((n, i) => {
        const incoming = genEdges.filter((e) => e.target === n.id).map((e) => e.source);
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
            ...((n.data as Record<string, unknown>) ?? {}),
          },
        };
      });

      let targetProjectId: string;
      if (activeWorkflowId) {
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

      try {
        const validation = await workflowApi.validateWorkflow(targetProjectId);
        const issues = (validation as { errors?: unknown[] })?.errors ?? [];
        if (Array.isArray(issues) && issues.length > 0) {
          toast.error(`Validation found ${issues.length} issue${issues.length === 1 ? '' : 's'} — see Runs panel`);
        } else {
          toast.success('Validation passed — ready to run');
        }
      } catch (validateErr) {
        toast.error(`Validation failed: ${getApiErrorMessage(validateErr) || 'backend error'}`);
      }
    } catch (err) {
      const msg = getApiErrorMessage(err) || 'Auto-save failed — click Save to retry';
      toast.error(msg);
    }
  };

  // Accept the docked AI Build draft: clear the draft markers on the canvas,
  // then persist the FULL canvas through the existing AI-accept path above
  // (steps replace/create + server-side validation) — no forked persistence.
  const handleAiBuildAccept = async () => {
    if (!aiDraft || aiAccepting) return;
    setAiAccepting(true);
    try {
      const ids = new Set(aiDraft.nodeIds);
      const acceptedNodes = nodes.map((n) =>
        ids.has(n.id)
          ? { ...n, selected: false, data: { ...n.data, aiDraft: false } }
          : n,
      );
      await handleAiCreated(
        acceptedNodes as unknown as Node[],
        edges as unknown as Edge[],
        { description: aiDraft.prompt },
      );
      setAiDraft(null);
      setAiSeedDescription('');
    } finally {
      setAiAccepting(false);
    }
  };

  return (
    <div className={cn('h-full flex flex-col bg-slate-100 dark:bg-slate-900', className)}>
      {/* Global keyboard-shortcut announcer (⌘S / view-only). Persists across
          right-panel toggles so screen-reader users always hear the feedback. */}
      <div aria-live="polite" aria-atomic="true" className="sr-only" role="status">
        {shortcutAnnounce}
      </div>
      {/* The active project gate is ProjectGatePanel, rendered via the early
          return above when `showProjectGate` is true. The legacy modal
          WorkflowProjectGate that used to sit here was unreachable dead code
          (this branch only runs after that early return, where showProjectGate
          is necessarily false) and re-fired a duplicate listProjects query, so
          it has been removed. */}
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
          aria-label="Change approach"
          className="fixed inset-y-0 right-0 z-[60] flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          onKeyDown={(e) => {
            if (e.key === 'Escape') setShowApproachFork(false);
          }}
        >
          <div className="flex items-start justify-between gap-3 border-b border-slate-200 p-5 dark:border-slate-700">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                Change how you build this workflow
              </h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Switch to AI to scaffold from a description, or keep building
                manually. Your current canvas is preserved.
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
              onChange={(mode: BuildMode) => {
                setShowApproachFork(false);
                if (mode === 'ai') {
                  setAiSeedDescription('');
                  setActiveTab('ai');
                } else if (mode === 'template') {
                  setShowCreateWizard(true);
                }
                // manual → just dismiss; the canvas stays as-is.
              }}
            />
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
        {/* R6 — 5-axis ADN health badge (top-right), fed by THIS workflow's
            per-project rollup. Renders honest "—" for any axis without a
            per-project source (no fake 0). Skeleton while loading; nothing
            when the rollup route isn't provisioned (404/501).
            The right-bar (WorkflowSmartPanel) stays visible — no toggle. */}
        <AdnHeaderBadge projectId={activeWorkflowId} />
      </div>

      {/* ── Header — grouped clusters with subtle separators ──
          Cluster 2 (Project):  selector | name | status badges
          Cluster 4 (Utility):  JSON import/export | duplicate | delete
          The Create cluster (New / AI / Import) and the lifecycle Actions
          cluster (Save / Run / Suspend / Schedule) were relocated into the
          WorkflowSmartPanel "Actions" cluster (right-bar). Validate / SQL /
          Approve / Rollback already live in the panel's Submit / Deploy
          sections. The canvas keeps ONLY its viewport controls
          (zoom / fit via ReactFlow <Controls/>, palette toggle). */}
      <div className="border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-700 dark:bg-slate-800">
        <div className="flex items-center gap-3">

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
              Add/remove persist via PATCH /workflow/{id} (handleAddTag /
              handleRemoveTag) — optimistic with revert-on-error. */}
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
                      onClick={() => handleRemoveTag(tag)}
                      disabled={savingTags}
                      className="ml-0.5 rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 disabled:opacity-50 dark:hover:bg-slate-600 dark:hover:text-slate-100"
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
                        handleAddTag(tagDraft);
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
                    disabled={savingTags}
                    className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[10px] font-medium text-slate-500 transition-colors hover:border-purple-400 hover:text-purple-600 disabled:opacity-50 dark:border-slate-600 dark:text-slate-400"
                    title="Add a tag — saved to this workflow"
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
                            if (node) { setSelectedNode(node); setShowSidebar(true); setActiveTab('block'); }
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

          {/* Lifecycle actions (Save / Run / Suspend / Resume / Schedule) and
              the Create cluster (New / AI / Import) were relocated into the
              WorkflowSmartPanel "Actions" cluster (right-bar). Validate / SQL /
              Approve / Rollback live in the panel's Submit / Deploy sections.
              No dispersed lifecycle buttons remain on the canvas toolbar. */}

          {/* Divider */}
          <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />

          {/* ── Cluster 4: Utility icons ── */}
          <div className="flex shrink-0 items-center gap-0.5">
            <input
              ref={importFileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleImportJSON(file);
                e.target.value = '';
              }}
            />
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => importFileRef.current?.click()}
              className="rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              title="Import workflow / template from JSON"
              aria-label="Import workflow"
            >
              <Upload className="h-3.5 w-3.5" />
            </motion.button>
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

            {activeWorkflowId && !isReadOnly && !confirmDeletePipeline && (
              <motion.button
                whileHover={canWfDelete ? { scale: 1.1 } : undefined}
                whileTap={canWfDelete ? { scale: 0.92 } : undefined}
                onClick={handleDeletePipeline}
                disabled={!canWfDelete}
                className="rounded-md p-1.5 text-red-500 transition-colors hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-900/20"
                title={canWfDelete ? 'Delete workflow' : DELETE_DENIED_HINT}
                aria-label="Delete workflow"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </motion.button>
            )}
            {confirmDeletePipeline && (
              <div className="flex items-center gap-1.5 bg-red-50 dark:bg-red-900/20 rounded-lg p-2">
                <span className="text-xs text-red-700 dark:text-red-300 whitespace-nowrap">Delete?</span>
                <button
                  onClick={executeDeletePipeline}
                  className="px-2 py-0.5 text-xs font-medium rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
                >
                  Confirm
                </button>
                <button
                  onClick={() => setConfirmDeletePipeline(false)}
                  className="px-2 py-0.5 text-xs font-medium rounded border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
              </div>
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
        {/* Left source/block picker — click-to-focus (G2).
            Width is driven by two orthogonal controls kept non-contradictory:
              · showPalette === false  → hidden (w-0)
              · expanded               → dominant working width (fills the page);
                                         the canvas shrinks to a thin click-strip
              · collapsed              → slim rail
            The expanded picker is a flex SIBLING of the canvas (not an overlay)
            so the ReactFlow pane stays mounted and clickable — clicking it is
            what collapses the picker back to a rail.
            Wrapped in a `relative` host so the edge chevron tracks the panel's
            right edge across any width unit and isn't clipped by overflow. */}
        <div className="relative flex-shrink-0">
          <div
            className={cn(
              'h-full bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 transition-all duration-300 overflow-hidden',
              !showPalette
                ? 'w-0'
                : sourcePanel === 'expanded'
                  // Capped: the WorkflowSmartPanel right rail (~428px) is ALWAYS
                  // visible, so a 72vw palette crushed the central canvas and its
                  // empty-state overflowed onto the right panel. Keep an expanded
                  // browse width that still leaves the canvas usable.
                  ? 'w-[42vw] max-w-[560px]'
                  : 'w-72'
            )}
          >
            {showPalette ? (
              <ETLPalette
                className="h-full"
                projectId={activeWorkflowId ?? undefined}
              />
            ) : null}
          </div>

          {/* Edge control — anchored to the panel's right edge so it follows
              whatever width the panel takes. Sits outside the clipped panel.
              · When hidden: re-show the rail.
              · When shown: expand/collapse between full-width and slim rail. */}
          {!showPalette ? (
            <button
              onClick={() => setShowPalette(true)}
              className="absolute right-0 translate-x-full top-1/2 -translate-y-1/2 z-10 p-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-r-lg shadow-sm"
              aria-label="Show block palette"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          ) : (
            <button
              onClick={toggleSourcePanel}
              className="absolute right-0 translate-x-full top-1/2 -translate-y-1/2 z-10 p-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-r-lg shadow-sm"
              aria-label={sourcePanel === 'expanded' ? 'Collapse source picker to rail' : 'Expand source picker'}
              aria-expanded={sourcePanel === 'expanded'}
            >
              {sourcePanel === 'expanded' ? (
                <ChevronLeft className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          )}
        </div>

        {/* Canvas — min-w-0 lets it shrink when the right-side panel
            (the single WorkflowSmartPanel rail) is open instead of clipping
            it past the viewport edge. */}
        <div ref={reactFlowWrapper} className="flex-1 min-w-0 relative">
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
            connectionMode={ConnectionMode.Strict}
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
            fitViewOptions={{ padding: 0.25, includeHiddenNodes: true, minZoom: 0.2, maxZoom: 1.5 }}
            minZoom={0.2}
            maxZoom={1.5}
            proOptions={{ hideAttribution: true }}
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

        {/* ── WorkflowSmartPanel — the single intelligent right-bar ──
            ALWAYS visible (no tabs, no popups). An icon rail flips the body
            between Changes / Submit-for-validation / Deployments / Block /
            AI sections, plus the preserved legacy bodies (Results / Runs /
            SQL / Schedule). Lifecycle actions relocated here from the toolbar.
            `activeTab` doubles as the active section ('schedules' bridges to
            the panel's 'schedule' id). */}
        <WorkflowSmartPanel
          activeWorkflowId={activeWorkflowId}
          activeWorkflowName={activeWorkflowName || pipelineName}
          activeSection={activeTab === 'schedules' ? 'schedule' : (activeTab as any)}
          onSectionChange={(s) => setActiveTab(s === 'schedule' ? 'schedules' : (s as any))}
          currentBlocks={currentBlocks}
          baselineBlocks={baselineBlocks}
          isDirty={isDirty}
          selectedNode={selectedNode}
          isReadOnly={isReadOnly}
          canDeploy={canWfDeploy}
          aiSlot={
            /* Docked AI Build — the PRIMARY AI path. NL prompt → blocks land
               directly on the real canvas as a draft; review/accept/undo/
               refine here. The classic GuidedAiWorkflowWizard stays reachable
               via the section's "classic step-by-step wizard" link (modal
               mount below). */
            <AiBuildSection
              seedPrompt={aiSeedDescription}
              canBuild={canWfCreate || canWfEdit}
              isReadOnly={isReadOnly}
              draft={aiDraft}
              draftReview={aiDraftReview}
              isAccepting={aiAccepting}
              onApply={handleAiBuildApply}
              onAccept={handleAiBuildAccept}
              onUndo={handleAiBuildUndo}
              onOpenClassicWizard={() => setShowAiGenerate(true)}
            />
          }
          hasConnectorSource={cloneTestConnectorIds.length > 0}
          onValidate={async () => { await handleValidate(); }}
          onDryRun={async () => { await handleExecute(true); }}
          onCloneValidate={async () => { await handleCloneDataTests(); }}
          onSubmitDeploy={async () => { await handleSubmitForApproval(); }}
          onOpenRollback={() => setShowRollbackDialog(true)}
          onReload={() => {
            if (activeWorkflowId) {
              handleLoadPipeline({ id: activeWorkflowId, name: activeWorkflowName });
            }
          }}
          // --- Lifecycle / creation actions relocated from the toolbar ---
          onNew={handleNewPipeline}
          onAiCreate={() => setActiveTab('ai')}
          onImport={() => setShowImportTasks(true)}
          onSave={handleSavePipeline}
          onRun={() => runExecuteSafe(false)}
          onToggleSuspend={() => {
            if (scheduleState.isStarted) handleSuspendTask();
            else handleResumeTask();
          }}
          onSchedule={openSchedulePanel}
          canCreate={canWfCreate}
          canEdit={canWfEdit}
          canExecute={canWfExecute}
          isSaving={isSaving}
          isExecuting={isExecuting}
          isSuspendingTask={isSuspendingTask}
          isPendingApproval={isPendingApproval}
          isApproved={isApproved}
          executeUnavailable={isActionUnavailable('execute')}
          suspendMode={
            scheduleState.hasSchedule && scheduleState.isStarted
              ? 'suspend'
              : scheduleState.hasSchedule && scheduleState.isSuspended
                ? 'resume'
                : 'none'
          }
          hasSchedule={scheduleState.hasSchedule}
          scheduleCronSummary={scheduleState.cronSummary}
          blockSlot={
            selectedNode ? (
              <ETLConfigSidebar
                node={selectedNode}
                onClose={() => { setSelectedNode(null); setShowSidebar(false); }}
                onSave={handleNodeSave}
                onDelete={handleNodeDelete}
                availableColumns={getAvailableColumns()}
                accessToken={accessToken}
                leftInputColumns={joinInputColumns.left}
                rightInputColumns={joinInputColumns.right}
                embedded
              />
            ) : undefined
          }
          statusHero={
          <>
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

          {/* Persistent reopen path for the fix-rail once a run has failed. */}
          {!isExecuting && !showFixRail
            && (lastExecution?.status === 'failed' || lastExecution?.status === 'partial_failure') && (
            <button
              type="button"
              onClick={() => setShowFixRail(true)}
              className="mx-4 mt-2 inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300 dark:hover:bg-red-900/40"
            >
              <Wrench className="h-3.5 w-3.5" />
              Diagnose &amp; fix {failedSteps.length > 0 ? `(${failedSteps.length})` : ''}
            </button>
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
          </>
          }
          legacyBodies={
          <>
            {activeTab === 'results' && (
              <div className="space-y-3 -mx-4 -mt-4">
                {/* Clone-data test report — "test real-life via clone" results.
                    Shows the per-connector pass/fail of the run against the
                    cloned copy of real source data. */}
                {cloneTestResult && (
                  <div className="px-4 pt-4 space-y-2">
                    <div className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium',
                      cloneTestResult.ok
                        ? 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400'
                        : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400',
                    )}>
                      <Bug className="h-4 w-4" />
                      <span>Clone test {cloneTestResult.ok ? 'passed' : 'failed'}</span>
                      <span className="text-xs opacity-75 ml-auto">
                        {cloneTestResult.connectors_passed}/{cloneTestResult.connector_count} connectors
                      </span>
                    </div>
                    {(cloneTestResult.reports || []).map((r, i) => (
                      <div key={r.connector_id || i} className="flex items-center gap-2 px-3 py-1.5 text-xs rounded bg-slate-50 dark:bg-slate-700/50">
                        <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', r.ok ? 'bg-green-500' : 'bg-red-500')} />
                        <span className="font-medium text-slate-700 dark:text-slate-300 truncate">
                          {r.connector_type || r.connector_id}
                        </span>
                        <span className="text-slate-500 dark:text-slate-400 ml-auto">
                          {r.tables_passed}/{r.tables_tested} tables · {r.pass_rate != null ? `${Math.round(r.pass_rate * 100)}%` : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

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

                    {/* Per-step results — normalized across CTE + legacy engines.
                        Failed steps expand to show their own error + targeted
                        fix CTAs so the user knows WHICH block broke and why. */}
                    {normalizedSteps.length > 0 && (
                      <div className="space-y-1.5">
                        {normalizedSteps.map((step: any, i: number) => {
                          const isFail = step.status === 'failed' || step.status === 'error';
                          const label = step.step_name || step.cte_alias || step.action_type
                            || step.action || step.step_id || `Step ${step.step_order ?? i + 1}`;
                          const nodeId = step.step_id || step.node_id;
                          return (
                            <div
                              key={step.step_id || i}
                              className={cn(
                                'rounded-lg border text-xs',
                                isFail
                                  ? 'border-red-200 dark:border-red-800 bg-red-50/70 dark:bg-red-900/15'
                                  : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-700/40',
                              )}
                            >
                              <div className="flex items-center gap-2 px-3 py-1.5">
                                <span className={cn(
                                  'w-1.5 h-1.5 rounded-full flex-shrink-0',
                                  isFail ? 'bg-red-500' : 'bg-green-500',
                                )} />
                                <span className="text-[10px] font-mono text-slate-400 tabular-nums">
                                  {step.step_order ?? i + 1}
                                </span>
                                <span className="font-medium text-slate-700 dark:text-slate-200 truncate">
                                  {label}
                                </span>
                                {step.action_type && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200/70 dark:bg-slate-600/50 text-slate-500 dark:text-slate-300">
                                    {step.action_type}
                                  </span>
                                )}
                                {step.rows_affected != null && !isFail && (
                                  <span className="ml-auto text-slate-500">{step.rows_affected} rows</span>
                                )}
                                {isFail && <span className="ml-auto text-red-500 font-semibold">failed</span>}
                              </div>
                              {isFail && (
                                <div className="px-3 pb-2 space-y-2">
                                  {step.error && (
                                    <p className="text-[11px] text-red-700 dark:text-red-300 font-mono whitespace-pre-wrap break-words leading-snug">
                                      {extractErrorString(step.error)}
                                    </p>
                                  )}
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {nodeId && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const target = nodes.find((n) => n.id === nodeId);
                                          if (target) {
                                            setSelectedNode(target);
                                            setShowSidebar(true);
                                            setActiveTab('block');
                                          } else {
                                            toast.error('Could not locate this block on the canvas');
                                          }
                                        }}
                                        className="inline-flex items-center gap-1 rounded-md border border-red-300 dark:border-red-700 px-2 py-1 text-[10px] font-semibold text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                                      >
                                        <Settings className="h-3 w-3" />
                                        Fix this block
                                      </button>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => { setActiveTab('ai'); handleGetAiSuggestions(); }}
                                      disabled={aiSuggestionsLoading}
                                      className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2 py-1 text-[10px] font-semibold text-white hover:bg-violet-700 disabled:opacity-50 transition-colors"
                                    >
                                      <Sparkles className="h-3 w-3" />
                                      Ask AI to fix
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
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
                {/* Schedule is a pure-action surface → content-gate on
                    workflow:schedule (project-scoped to the active workflow). */}
                <PermissionGate
                  module="workflow"
                  action="schedule"
                  projectId={activeWorkflowId ?? undefined}
                  compact
                  title="Scheduling restricted"
                  description="You don't have the &quot;schedule&quot; permission on workflow. Ask an administrator to grant it to manage this pipeline's schedule."
                >
                  <ScheduleManager
                    pipelineId={activeWorkflowId}
                    pipelineName={activeWorkflowName}
                    compact
                    isReadOnly={isReadOnly}
                    className="-mx-4 -mt-4"
                    onScheduleChange={refetchHeaderSchedules}
                  />
                </PermissionGate>
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

            {activeTab === 'ai' && (() => {
              const hasRun = !!(lastExecution as any)?.run_id;
              const runFailed = lastExecution?.status === 'failed'
                || lastExecution?.status === 'partial_failure';
              return (
                <div className="space-y-3">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {hasRun
                      ? 'AI root-cause analysis & fix suggestions for the last run.'
                      : 'Corrections, warnings, and optimizations for your workflow.'}
                  </p>

                  {/* Failed-step summary — which blocks broke, at a glance. */}
                  {runFailed && failedSteps.length > 0 && (
                    <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-900/10 p-2.5 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-red-700 dark:text-red-400">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {failedSteps.length} step{failedSteps.length > 1 ? 's' : ''} failed
                      </div>
                      {failedSteps.map((s: any, i: number) => (
                        <div key={s.step_id || i} className="text-[11px] text-red-600 dark:text-red-300">
                          <span className="font-medium">{s._order}. {s._label}</span>
                          {s.error && (
                            <span className="block font-mono opacity-80 break-words leading-snug">
                              {extractErrorString(s.error)}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Static validation errors (when no run yet). */}
                  {!hasRun && validation?.error && (
                    <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10 p-2">
                      <div className="text-xs font-medium text-red-700 dark:text-red-400 mb-1">Errors</div>
                      <p className="text-xs text-red-600 dark:text-red-300">{extractErrorString(validation.error)}</p>
                    </div>
                  )}
                  {!hasRun && validation && !validation.valid && !validation.error && (
                    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-2">
                      <div className="text-xs font-medium text-amber-700 dark:text-amber-400 mb-1">Warnings</div>
                      <p className="text-xs text-amber-600 dark:text-amber-300">Pipeline validation failed</p>
                    </div>
                  )}

                  {hasRun || validation ? (
                    <>
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
                        {aiSuggestionsLoading
                          ? 'Analyzing…'
                          : hasRun ? 'Analyze this run with AI' : 'Analyze with AI'}
                      </button>
                      {aiSuggestions != null && (
                        <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-900/10 p-3">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-violet-700 dark:text-violet-300 mb-2">
                            <Sparkles className="h-3.5 w-3.5" />
                            AI Analysis &amp; Fix
                          </div>
                          <div className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                            {aiSuggestions}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-slate-500 text-center py-4">
                      Run the workflow or click &quot;Validate&quot; — then ask AI to analyze and fix it.
                    </p>
                  )}
                </div>
              );
            })()}
          </>
          }
        />

        {/* The former WorkflowProjectBar (a SECOND icon rail: Runs · Usage ·
            History · Cost · Governance) was consolidated into the single
            WorkflowSmartPanel rail above — its Usage / Cost / Governance tabs
            now live as sections there (Runs + History/versions were already
            covered by the panel's Runs + Deploy sections), and the per-project
            health chips are the panel's ProjectKpiStrip. One rail, not two. */}

        {/* Docked failed-run fix rail — per-step diagnosis, one-click fixes,
            and live Cortex AI analysis. Opens automatically on a failed run. */}
        <RunFixRail
          open={showFixRail}
          onClose={() => setShowFixRail(false)}
          steps={normalizedSteps}
          runStatus={lastExecution?.status}
          extractError={extractErrorString}
          onOpenBlock={(nodeId) => {
            const target = nodes.find((n) => n.id === nodeId);
            if (target) { setSelectedNode(target); setShowSidebar(true); setActiveTab('block'); }
            else toast.error('Could not locate this block on the canvas');
          }}
          onApplyPatch={applyNodeConfigPatch}
          onAskAi={handleGetAiSuggestions}
          aiText={aiSuggestions}
          aiLoading={aiSuggestionsLoading}
          suggestions={fixSuggestions}
        />

        {/* Block config moved into the WorkflowSmartPanel "Block" section
            (Box icon). Selecting a node on the canvas routes the panel there. */}
      </div>

      {/* Refetch indicator — non-blocking. The very first load is handled by the
          page-level full-screen state above (isLoading && workflows.length === 0).
          On every subsequent refetch we keep the canvas interactive and show only
          a subtle corner badge so background syncs never block editing. */}
      {isLoading && workflows.length > 0 && (
        <div className="absolute top-3 right-3 z-50 flex items-center gap-2 rounded-full border border-slate-200 bg-white/90 px-3 py-1.5 text-xs font-medium text-slate-600 shadow-sm backdrop-blur-sm pointer-events-none dark:border-slate-700 dark:bg-slate-900/90 dark:text-slate-300">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
          Refreshing…
        </div>
      )}

      {/* AI Guided Workflow — classic 9-step wizard, kept as a FALLBACK.
          No longer the primary AI path (that's the docked AI Build section in
          the right rail); reachable only via the "classic step-by-step
          wizard" link there. Generated nodes/edges are dropped onto the React
          Flow canvas via setNodes/setEdges, AND auto-saved to the backend as
          a draft project. */}
      <GuidedAiWorkflowWizard
        open={showAiGenerate}
        initialDescription={aiSeedDescription}
        onClose={handleAiClose}
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

      {/* Schedule editing happens inline in the right panel's `schedules`
          tab (ScheduleManager), revealed by the header Schedule button via
          openSchedulePanel — no centered modal. */}

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
