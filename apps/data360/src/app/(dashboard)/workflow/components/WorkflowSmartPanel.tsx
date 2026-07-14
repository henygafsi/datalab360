'use client';

/**
 * WorkflowSmartPanel — the single intelligent right-bar for the Workflow builder.
 *
 * Consolidates the right-panel sections (results / runs / sql / schedules / ai)
 * and the lifecycle actions (Validate / SQL dry-run / Clone-test / Approve-deploy
 * / Rollback) into one panel. There are
 * NO tabs and NO popups: a vertical ICON RAIL on the far-right edge flips the
 * panel body between sections ("flip menu"). The panel is ALWAYS visible
 * (w-[380px], aria-modal=false) — it is not a modal.
 *
 * Section map (one icon per section, single active section at a time):
 *   1. GitCompare  · Changes   — pre-submit diff of pending block changes
 *                                (current canvas vs the loaded baseline). NEW.
 *   2. ShieldCheck · Submit    — submit-for-validation with a strategy selector:
 *                                PRODUCTION → validate on CLONED data
 *                                (clone-data-tests, already wired);
 *                                PIPELINE/source → validate via TEMP TABLES
 *                                (dry-run {mode:'temp_tables'}). NEW.
 *   3. History     · Deploy    — deployment history + versions; Compare/Rollback
 *                                per row (rollback is a destructive confirm via
 *                                the shared ConfirmDialog, not a popup menu). NEW.
 *   4. Box         · Block     — selected-block config (delegates to the wired
 *                                ETLConfigSidebar via the `blockSlot` render-prop
 *                                so editing keeps working).
 *   5. Sparkles    · AI        — rule-based AIActionFlow suggestions for the
 *                                workflow + the legacy run-analysis body. NEW.
 *   6. Eye         · Results   — legacy results body (preserved via `resultsSlot`).
 *   7. ListChecks  · Runs      — legacy ETLExecutionHistory (via `runsSlot`).
 *   8. Code        · SQL       — legacy compiled-SQL body (via `sqlSlot`).
 *   9. Calendar    · Schedule  — legacy ScheduleManager (via `scheduleSlot`).
 *
 * Legacy bodies stay in the builder (they reference ~30 pieces of builder state)
 * and are passed in as render-prop slots, so this file owns the rail + the NEW
 * sections only. The active section is controlled by the parent (`activeSection`
 * / `onSectionChange`) so existing handlers that re-route the panel
 * (e.g. "Fix this block" → AI, error click → Block) keep working.
 *
 * Degradation (mirrors ObjectSmartPanel / smart-rightbar-spec):
 *   loading → skeleton · 404/501 → quiet "Not deployed yet" · other → code
 *   null numeric → "—" (never 0).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  GitCompare,
  ShieldCheck,
  History as HistoryIcon,
  Box,
  Sparkles,
  Eye,
  ListChecks,
  Code,
  Calendar,
  BarChart3,
  DollarSign,
  Shield,
  RotateCcw,
  CheckCircle2,
  XCircle,
  Users,
  UserPlus,
  Trash2,
  PlusCircle,
  MinusCircle,
  PencilLine,
  Plus,
  Download,
  Save,
  Play,
  Pause,
  Loader2,
  ChevronsDownUp,
  ChevronsUpDown,
  type LucideIcon,
} from 'lucide-react';
import type { Node } from 'reactflow';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { useCanPerform } from '@/hooks/useCanPerform';
import InsightActionButton from '@/app/shared/insights/InsightActionButton';
import { HelpPopover } from '@/app/shared/ui/HelpPopover';
import { Tooltip } from '@/app/shared/ui/Tooltip';
import AIActionFlow, { type Suggestion } from '@/app/shared/insights/AIActionFlow';
import ProjectKpiStrip from '@/app/shared/score-cards/ProjectKpiStrip';
import AiActionBlocks from '@/app/shared/command-center/AiActionBlocks';
import { useAtomValue } from 'jotai';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import * as workflowApi from '@/app/services/api/workflowApi';
import type {
  WorkflowDeployment,
  WorkflowVersion,
  WorkflowDeploymentListResponse,
  WorkflowVersionsResponse,
} from '@/app/services/api/types';
import {
  useWorkflowSectionQuery,
  evictWorkflowSectionCache,
} from './useWorkflowSectionCache';
// Lifecycle readiness surfaces (docked, honest states): pre-deploy preconditions
// (POST /workflow/{id}/pre-check) + post-execute block-output verification
// (POST /workflow/{id}/post-verify). Both self-disable on 404/501.
import { PreDeployChecks, PostRunVerify } from './WorkflowReadinessChecks';
// Contributor CRUD lives in the workflow module service (workflow-scoped routes
// GET/POST/DELETE /workflow/{id}/contributors/*). Imported read-only here.
import {
  getWorkflowContributors,
  addWorkflowContributor,
  removeWorkflowContributor,
  type WorkflowContributor,
} from '@/app/services/workflow';
// Operational tabs folded in from the former second rail (WorkflowProjectBar /
// ContextBar). They join THIS single icon rail as the Usage / Cost / Governance
// sections so the builder shows ONE right-tab, not two. Reused verbatim (same
// listRuns/cost-summary/scorecards getters) — no logic duplicated.
import { UsageTab, CostTab, GovernanceTab, type OutputTableRef } from './WorkflowProjectBar';

// ---------------------------------------------------------------------------
// Section identifiers — the rail order
// ---------------------------------------------------------------------------

export type WorkflowPanelSection =
  | 'changes'
  | 'submit'
  | 'deploy'
  | 'block'
  | 'ai'
  | 'results'
  | 'runs'
  | 'usage'
  | 'cost'
  | 'governance'
  | 'sql'
  | 'schedule';

/** Minimal shape of a canvas node we diff against the baseline. */
export interface CanvasNodeSnapshot {
  id: string;
  label: string;
  type: string;
  /** Stable JSON of the block config used to detect "modified". */
  configKey: string;
}

export interface WorkflowSmartPanelProps {
  activeWorkflowId: string | null;
  activeWorkflowName: string | null;
  /** Active section (controlled by the parent builder). */
  activeSection: WorkflowPanelSection;
  onSectionChange: (s: WorkflowPanelSection) => void;

  /** Current canvas blocks (for the Changes diff). */
  currentBlocks: CanvasNodeSnapshot[];
  /** Baseline blocks captured when the workflow was loaded (for the diff). */
  baselineBlocks: CanvasNodeSnapshot[];
  /** Whether the canvas has unsaved edits — annotates the Changes section. */
  isDirty: boolean;

  /** Selected canvas node (drives the Block section header). */
  selectedNode: Node | null;

  /** Read-only / permission flags from the builder. */
  isReadOnly: boolean;
  canDeploy: boolean;
  /** True when a connector-backed source exists (enables clone validation). */
  hasConnectorSource: boolean;

  // --- Behaviour reused from the builder (relocated, not duplicated) ---
  /** Compile-time DAG validation (server-side lint). */
  onValidate: () => Promise<unknown>;
  /** SQL dry-run / compile (no write). */
  onDryRun: () => Promise<unknown>;
  /** Run against a CLONED copy of real source data (production strategy). */
  onCloneValidate: () => Promise<unknown>;
  /** Submit for production-deployment approval. */
  onSubmitDeploy: () => Promise<unknown>;
  /** Open the rollback diff dialog (hard-confirm lives inside it). */
  onOpenRollback: () => void;
  /** Reload the canvas after a deployment is re-executed/rolled back. */
  onReload?: () => void;

  // --- Lifecycle / creation actions (relocated from the canvas toolbar) ---
  // These render in the always-visible "Actions" cluster above the section
  // body so the canvas keeps ONLY its viewport controls (zoom/fit/palette).
  // Handlers are lifted from the builder verbatim (no duplicated logic); the
  // derived gating state is passed alongside so disabled/tooltip parity with
  // the old toolbar is preserved.
  /** Create a new (blank) workflow. */
  onNew: () => void;
  /** Open the AI-generate flow (existing dialog in the builder). */
  onAiCreate: () => void;
  /** Open the warehouse-task import flow (existing dialog in the builder). */
  onImport: () => void;
  /** Save the current workflow. */
  onSave: () => void;
  /** Run the workflow now (writes results). */
  onRun: () => void;
  /** Suspend OR resume the scheduled task (builder picks the branch). */
  onToggleSuspend: () => void;
  /** Open the Schedule section / editor. */
  onSchedule: () => void;

  /** Gating: user may create workflows. */
  canCreate: boolean;
  /** Gating: user may edit the loaded workflow. */
  canEdit: boolean;
  /** Gating: user may execute the workflow. */
  canExecute: boolean;
  /** Save in progress. */
  isSaving: boolean;
  /** Run in progress. */
  isExecuting: boolean;
  /** Suspend/resume request in progress. */
  isSuspendingTask: boolean;
  /** Approval is pending (blocks Save + Run-unless-approved). */
  isPendingApproval: boolean;
  /** Approval has been granted (lets Run through while pending). */
  isApproved: boolean;
  /** The execute route is unavailable on this backend (404/501). */
  executeUnavailable: boolean;
  /**
   * Suspend/Resume slot mode:
   *   'suspend' → schedule started, show Suspend
   *   'resume'  → schedule suspended, show Resume
   *   'none'    → no schedule, show disabled Suspend with a hint
   */
  suspendMode: 'suspend' | 'resume' | 'none';
  /** Has a schedule (drives the Schedule button label/cron summary). */
  hasSchedule: boolean;
  /** Cron summary for the Schedule button when a schedule exists. */
  scheduleCronSummary?: string;

  /**
   * Always-on header region (RunApprovalStatusHero + fix-rail reopen + the
   * persistent error banner + sr-only status). Rendered above EVERY section so
   * runtime errors are never hidden by the active section.
   */
  statusHero?: React.ReactNode;
  /** Selected-block config editor (ETLConfigSidebar), rendered in `block`. */
  blockSlot?: React.ReactNode;
  /** AI Assist agent (embedded GuidedAiWorkflowWizard), rendered in `ai`. */
  aiSlot?: React.ReactNode;
  /**
   * The legacy tab bodies (results / runs / sql / schedules / ai), each still
   * self-guarded on `activeTab` inside the builder. Rendered as-is whenever the
   * active section is one of those legacy ids; the inner self-guards ensure only
   * the matching body shows.
   */
  legacyBodies?: React.ReactNode;
}

const LEGACY_SECTIONS: WorkflowPanelSection[] = ['results', 'runs', 'sql', 'schedule'];

// ---------------------------------------------------------------------------
// Small shared primitives (mirrors ObjectSmartPanel)
// ---------------------------------------------------------------------------

function fmtDate(v: string | null | undefined): string {
  if (!v) return '—';
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function str(v: string | null | undefined): string {
  return v === null || v === undefined || v === '' ? '—' : v;
}

function num(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : String(v);
}

function SkeletonRows({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2 py-1" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-3 rounded bg-gray-100 dark:bg-gray-800 animate-pulse"
          style={{ width: `${85 - i * 12}%` }}
        />
      ))}
    </div>
  );
}

function GapNote() {
  return (
    <p className="text-[11px] italic text-gray-400 dark:text-gray-500 py-1">
      Not deployed yet
    </p>
  );
}

function ErrorNote({ code }: { code?: number }) {
  return (
    <p className="text-[11px] text-rose-600 dark:text-rose-400 py-1">
      Section unavailable{code ? ` (${code})` : ''}
    </p>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
        {title}
      </h3>
      {subtitle && (
        <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{subtitle}</p>
      )}
    </div>
  );
}

function StatusPill({ status }: { status?: string | null }) {
  const s = (status ?? '').toLowerCase();
  const tone =
    s.includes('approv') || s === 'deployed' || s === 'completed' || s === 'success'
      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
      : s.includes('reject') || s.includes('fail')
        ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'
        : s.includes('pending')
          ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300';
  return (
    <span className={cn('inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium', tone)}>
      {str(status)}
    </span>
  );
}

// ---------------------------------------------------------------------------
// 1 — CHANGES (pre-validation diff)
// ---------------------------------------------------------------------------

interface BlockDiff {
  added: CanvasNodeSnapshot[];
  removed: CanvasNodeSnapshot[];
  modified: CanvasNodeSnapshot[];
}

/**
 * Diff current canvas blocks against the loaded baseline.
 * Heuristic (documented, intentionally simple):
 *   - added    = id present now, absent in baseline
 *   - removed  = id present in baseline, absent now
 *   - modified = same id, different configKey (block type or config changed)
 * The diff is computed in-memory from the builder's graph; no backend call.
 */
function diffBlocks(current: CanvasNodeSnapshot[], baseline: CanvasNodeSnapshot[]): BlockDiff {
  const baseById = new Map(baseline.map((b) => [b.id, b]));
  const curById = new Map(current.map((b) => [b.id, b]));
  const added: CanvasNodeSnapshot[] = [];
  const modified: CanvasNodeSnapshot[] = [];
  const removed: CanvasNodeSnapshot[] = [];
  for (const c of current) {
    const base = baseById.get(c.id);
    if (!base) added.push(c);
    else if (base.configKey !== c.configKey || base.type !== c.type) modified.push(c);
  }
  for (const b of baseline) {
    if (!curById.has(b.id)) removed.push(b);
  }
  return { added, removed, modified };
}

function DiffGroup({
  icon: Icon,
  tone,
  label,
  items,
}: {
  icon: LucideIcon;
  tone: string;
  label: string;
  items: CanvasNodeSnapshot[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className={cn('flex items-center gap-1.5 text-[11px] font-semibold', tone)}>
        <Icon className="h-3.5 w-3.5" />
        {label} ({items.length})
      </p>
      <ul className="space-y-0.5 pl-5">
        {items.map((b) => (
          <li key={b.id} className="flex items-center justify-between gap-2 text-[11px] text-gray-700 dark:text-gray-300">
            <span className="truncate">{b.label}</span>
            <span className="shrink-0 rounded bg-gray-100 px-1 py-0.5 text-[9px] uppercase text-gray-500 dark:bg-gray-800 dark:text-gray-400">
              {b.type}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ChangesSection({
  current,
  baseline,
  isDirty,
}: {
  current: CanvasNodeSnapshot[];
  baseline: CanvasNodeSnapshot[];
  isDirty: boolean;
}) {
  const diff = useMemo(() => diffBlocks(current, baseline), [current, baseline]);
  const total = diff.added.length + diff.removed.length + diff.modified.length;
  return (
    <div>
      <SectionHeader
        title="Pending changes"
        subtitle="What will change in this workflow before you submit it."
      />
      {total === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-4 text-center dark:border-gray-700 dark:bg-gray-800/40">
          <CheckCircle2 className="mx-auto mb-1.5 h-5 w-5 text-emerald-500" />
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {isDirty
              ? 'Edits in progress, but no block-level changes vs the saved version.'
              : 'No pending changes — canvas matches the saved version.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[11px] text-gray-400 dark:text-gray-500">
            {total} block change{total === 1 ? '' : 's'} pending vs the loaded baseline.
          </p>
          <DiffGroup icon={PlusCircle} tone="text-emerald-600 dark:text-emerald-400" label="Added" items={diff.added} />
          <DiffGroup icon={PencilLine} tone="text-amber-600 dark:text-amber-400" label="Modified" items={diff.modified} />
          <DiffGroup icon={MinusCircle} tone="text-rose-600 dark:text-rose-400" label="Removed" items={diff.removed} />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2 — SUBMIT FOR VALIDATION (strategy selector)
// ---------------------------------------------------------------------------

type ValidateStrategy = 'production_clone' | 'pipeline_temp_tables';

function SubmitSection({
  workflowId,
  isReadOnly,
  hasConnectorSource,
  onValidate,
  onDryRun,
  onCloneValidate,
  onSubmitDeploy,
}: {
  workflowId: string | null;
  isReadOnly: boolean;
  hasConnectorSource: boolean;
  onValidate: () => Promise<unknown>;
  onDryRun: () => Promise<unknown>;
  onCloneValidate: () => Promise<unknown>;
  onSubmitDeploy: () => Promise<unknown>;
}) {
  const { trackFeatureClick } = useTrackEvent();
  const [strategy, setStrategy] = useState<ValidateStrategy>(
    hasConnectorSource ? 'production_clone' : 'pipeline_temp_tables',
  );

  const fireEvent = useCallback(
    (extra: Record<string, unknown>) => {
      trackFeatureClick('workflow_validation_submitted', {
        workflow_id: workflowId,
        strategy,
        ...extra,
      });
    },
    [trackFeatureClick, workflowId, strategy],
  );

  // Temp-tables path: dry-run with a {mode} payload, routed through the typed
  // workflowApi contract (same POST /workflow/{id}/dry-run). Whether the backend
  // honours `mode` is unconfirmed — InsightActionButton self-disables on 404/501.
  const runTempTables = useCallback(async () => {
    if (!workflowId) throw new Error('No workflow selected');
    const data = await workflowApi.dryRunSavedWorkflow(workflowId, 'temp_tables');
    fireEvent({ outcome: 'ok' });
    return data;
  }, [workflowId, fireEvent]);

  const runClone = useCallback(async () => {
    const res = await onCloneValidate();
    fireEvent({ outcome: 'ok' });
    return res;
  }, [onCloneValidate, fireEvent]);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Submit for validation"
        subtitle="Pick how to validate before it touches real data."
      />

      {/* Strategy selector */}
      <fieldset className="space-y-2" disabled={isReadOnly}>
        <legend className="sr-only">Validation strategy</legend>
        <label
          className={cn(
            'flex cursor-pointer gap-2 rounded-lg border p-2.5 transition-colors',
            strategy === 'production_clone'
              ? 'border-violet-300 bg-violet-50 dark:border-violet-700 dark:bg-violet-900/20'
              : 'border-gray-200 hover:border-gray-300 dark:border-gray-700',
          )}
        >
          <input
            type="radio"
            name="validate-strategy"
            className="mt-0.5"
            checked={strategy === 'production_clone'}
            onChange={() => setStrategy('production_clone')}
          />
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-gray-800 dark:text-gray-200">
              Validate on cloned data
            </span>
            <span className="block text-[11px] text-gray-500 dark:text-gray-400">
              Target is production. Runs against a zero-copy clone of real source
              data — no production write.
            </span>
            <span className="mt-1 block text-[10px] text-gray-400">
              cost: ~clone credits · risk: low (isolated copy)
            </span>
          </span>
        </label>

        <label
          className={cn(
            'flex cursor-pointer gap-2 rounded-lg border p-2.5 transition-colors',
            strategy === 'pipeline_temp_tables'
              ? 'border-cyan-300 bg-cyan-50 dark:border-cyan-700 dark:bg-cyan-900/20'
              : 'border-gray-200 hover:border-gray-300 dark:border-gray-700',
          )}
        >
          <input
            type="radio"
            name="validate-strategy"
            className="mt-0.5"
            checked={strategy === 'pipeline_temp_tables'}
            onChange={() => setStrategy('pipeline_temp_tables')}
          />
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-gray-800 dark:text-gray-200">
              Validate via temp tables
            </span>
            <span className="block text-[11px] text-gray-500 dark:text-gray-400">
              Source is a pipeline / ingestion. Materialises into temporary
              tables, then discards them.
            </span>
            <span className="mt-1 block text-[10px] text-gray-400">
              cost: ~compute only · risk: low (transient tables)
            </span>
          </span>
        </label>
      </fieldset>

      {/* Pre-flight: a cheap server-side DAG lint before the heavier validate. */}
      <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 dark:border-gray-800">
        <InsightActionButton
          label="Lint DAG"
          icon={ShieldCheck}
          variant="subtle"
          size="md"
          onAction={onValidate}
          successToast="DAG validated"
          capable={!!workflowId && !isReadOnly}
          unavailableHint="Validate isn't available on this backend"
        />
        <InsightActionButton
          label="Preview SQL"
          icon={Code}
          variant="subtle"
          size="md"
          onAction={onDryRun}
          successToast="SQL compiled"
          capable={!!workflowId && !isReadOnly}
          unavailableHint="Dry-run isn't available on this backend"
        />
      </div>

      {/* Primary submit — the strategy-bound validation run. */}
      <div className="space-y-2">
        {strategy === 'production_clone' ? (
          <InsightActionButton
            label="Submit for validation (cloned data)"
            icon={ShieldCheck}
            variant="primary"
            size="md"
            onAction={runClone}
            successToast="Clone validation started"
            pingBell
            capable={!!workflowId && !isReadOnly && hasConnectorSource}
            unavailableHint={
              !hasConnectorSource
                ? 'Add a connector-backed source to validate on cloned data'
                : 'Clone validation isn’t available on this backend'
            }
            className="w-full justify-center"
          />
        ) : (
          <InsightActionButton
            label="Submit for validation (temp tables)"
            icon={ShieldCheck}
            variant="primary"
            size="md"
            onAction={runTempTables}
            successToast="Temp-table validation started"
            pingBell
            capable={!!workflowId && !isReadOnly}
            unavailableHint="Temp-table validation isn’t available on this backend yet"
            className="w-full justify-center"
          />
        )}

        {/* Readiness gate — preconditions BEFORE approval + per-block output
            verification AFTER a run. Both are docked checklists that self-disable
            when the backend route is absent (404/501). */}
        <div className="space-y-2 border-t border-gray-100 pt-3 dark:border-gray-800">
          <PreDeployChecks workflowId={workflowId} isReadOnly={isReadOnly} />
          <PostRunVerify workflowId={workflowId} />
        </div>

        {/* After validation passes, request the production deployment approval. */}
        <InsightActionButton
          label="Submit for deployment approval"
          icon={ShieldCheck}
          variant="subtle"
          size="md"
          onAction={onSubmitDeploy}
          successToast="Submitted for approval"
          pingBell
          capable={!!workflowId && !isReadOnly}
          unavailableHint="Deployment approval isn’t available on this backend"
          confirm={{
            title: 'Submit for deployment approval?',
            body: 'This requests a production deployment. An administrator must approve it before it runs.',
            confirmLabel: 'Submit',
            variant: 'warning',
          }}
          className="w-full justify-center"
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3 — DEPLOYMENT HISTORY & VERSIONING
// ---------------------------------------------------------------------------

type FetchStatus = 'loading' | 'ok' | 'gap' | 'error';

function DeploySection({
  workflowId,
  isReadOnly,
  canDeploy,
  onOpenRollback,
  onReload,
}: {
  workflowId: string | null;
  isReadOnly: boolean;
  /**
   * Action-RBAC `workflow:deploy` allow (from useCanPerform in the builder).
   * Separation-of-duties: approving / rejecting / re-running a deployment is a
   * privileged production action gated on this permission — NOT merely on being
   * a non-viewer contributor (isReadOnly).
   */
  canDeploy: boolean;
  onOpenRollback: () => void;
  onReload?: () => void;
}) {
  // Cached, keyed by [workflowId, section]. Re-activating the Deploy tab serves
  // the cached lists instead of refiring the listDeployments + listVersions
  // waterfall; an SSE invalidation (handled in the panel root) evicts these so a
  // freshly-submitted deployment / new version still shows up immediately.
  const dep = useWorkflowSectionQuery<WorkflowDeploymentListResponse>(
    workflowId ? `wf:${workflowId}:deployments` : null,
    () => workflowApi.listDeployments(workflowId as string, { limit: 20 }),
    { enabled: !!workflowId },
  );
  const ver = useWorkflowSectionQuery<WorkflowVersionsResponse>(
    workflowId ? `wf:${workflowId}:versions` : null,
    () => workflowApi.listVersions(workflowId as string, { limit: 20 }),
    { enabled: !!workflowId },
  );

  // Inline (docked) reject flow: which deployment is being rejected + its reason.
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const deployments: WorkflowDeployment[] = dep.data?.deployments ?? [];
  const versions: WorkflowVersion[] = ver.data?.versions ?? [];
  const isGap = (s: number | null) => s === 404 || s === 501;
  const depStatus: FetchStatus =
    dep.state === 'done'
      ? 'ok'
      : dep.state === 'error'
        ? isGap(dep.errorStatus)
          ? 'gap'
          : 'error'
        : 'loading';
  const depCode = dep.errorStatus ?? undefined;
  const verStatus: FetchStatus =
    ver.state === 'done'
      ? 'ok'
      : ver.state === 'error'
        ? isGap(ver.errorStatus)
          ? 'gap'
          : 'error'
        : 'loading';

  return (
    <div className="space-y-5">
      <div>
        <SectionHeader title="Deployments" subtitle="Production deployment history for this workflow." />
        {depStatus === 'loading' && <SkeletonRows />}
        {depStatus === 'gap' && <GapNote />}
        {depStatus === 'error' && <ErrorNote code={depCode} />}
        {depStatus === 'ok' && deployments.length === 0 && (
          <p className="text-[11px] italic text-gray-400 dark:text-gray-500">Not deployed yet</p>
        )}
        {depStatus === 'ok' && deployments.length > 0 && (
          <ul className="space-y-2">
            {deployments.map((d) => (
              <li
                key={d.deployment_id}
                className="rounded-lg border border-gray-200 p-2.5 text-xs dark:border-gray-700"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    {d.deployment_type ? d.deployment_type.replace(/_/g, ' ') : 'deployment'}
                  </span>
                  <StatusPill status={d.status} />
                </div>
                <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                  <span>By: {str(d.requested_by)}</span>
                  <span>Approved: {str(d.approved_by)}</span>
                  <span className="col-span-2">When: {fmtDate(d.deployed_at ?? d.created_at)}</span>
                </div>
                {d.status === 'pending_approval' && !isReadOnly && canDeploy && (
                  <div className="mt-2 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <InsightActionButton
                        label="Approve"
                        icon={CheckCircle2}
                        variant="subtle"
                        size="sm"
                        onAction={() => workflowApi.approveDeployment(workflowId!, d.deployment_id)}
                        successToast="Deployment approved"
                        pingBell
                        onDone={() => {
                          dep.reload();
                          onReload?.();
                        }}
                        unavailableHint="Approve is not available on this backend"
                        confirm={{
                          title: 'Approve this deployment?',
                          body: 'Approving lets this production deployment be executed.',
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setRejectingId(rejectingId === d.deployment_id ? null : d.deployment_id);
                          setRejectReason('');
                        }}
                        className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[11px] font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
                      >
                        <XCircle className="h-3.5 w-3.5" />
                        Reject
                      </button>
                    </div>
                    {rejectingId === d.deployment_id && (
                      <div className="space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800/50">
                        <textarea
                          value={rejectReason}
                          onChange={(e) => setRejectReason(e.target.value)}
                          rows={2}
                          placeholder="Reason for rejection (optional)"
                          className="w-full resize-none rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
                        />
                        <InsightActionButton
                          label="Confirm reject"
                          icon={XCircle}
                          variant="danger"
                          size="sm"
                          onAction={() =>
                            workflowApi.rejectDeployment(workflowId!, d.deployment_id, {
                              reason: rejectReason.trim() || undefined,
                            })
                          }
                          successToast="Deployment rejected"
                          pingBell
                          onDone={() => {
                            setRejectingId(null);
                            setRejectReason('');
                            dep.reload();
                            onReload?.();
                          }}
                          unavailableHint="Reject is not available on this backend"
                        />
                      </div>
                    )}
                  </div>
                )}
                {d.status === 'approved' && !isReadOnly && canDeploy && (
                  <div className="mt-2">
                    <InsightActionButton
                      label="Re-run deployment"
                      icon={CheckCircle2}
                      variant="subtle"
                      size="sm"
                      onAction={() => workflowApi.executeDeployment(workflowId!, d.deployment_id)}
                      successToast="Deployment executed"
                      pingBell
                      onDone={() => {
                        dep.reload();
                        onReload?.();
                      }}
                      unavailableHint="Deployment execute isn’t available on this backend"
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
            Versions
          </h3>
          {!isReadOnly && versions.length > 0 && (
            <button
              type="button"
              onClick={onOpenRollback}
              className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-[10px] font-semibold text-gray-600 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
              title="Roll back to a previous version (diff preview before commit)"
            >
              <RotateCcw className="h-3 w-3" />
              Compare / Rollback
            </button>
          )}
        </div>
        {verStatus === 'loading' && <SkeletonRows />}
        {verStatus === 'gap' && <GapNote />}
        {verStatus === 'error' && <ErrorNote />}
        {verStatus === 'ok' && versions.length === 0 && (
          <p className="text-[11px] italic text-gray-400 dark:text-gray-500">No versions yet</p>
        )}
        {verStatus === 'ok' && versions.length > 0 && (
          <ul className="space-y-1.5">
            {versions.map((v) => (
              <li
                key={v.version_id}
                className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs dark:border-gray-700"
              >
                <div className="min-w-0">
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    v{num(v.version_number)}
                    {v.version_name ? ` · ${v.version_name}` : ''}
                  </span>
                  <span className="block text-[10px] text-gray-400">
                    {str(v.created_by)} · {fmtDate(v.created_at)}
                  </span>
                </div>
                <StatusPill status={v.status} />
              </li>
            ))}
          </ul>
        )}
      </div>

      <ContributorsSection workflowId={workflowId} isReadOnly={isReadOnly} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3b — CONTRIBUTORS (access management for this workflow)
// ---------------------------------------------------------------------------

const contribName = (c: any): string => c?.username ?? c?.user_name ?? c?.name ?? '';
const contribKey = (c: any): string =>
  c?.contributor_id ?? c?.id ?? c?.username ?? c?.user_name ?? Math.random().toString(36);

function ContributorsSection({
  workflowId,
  isReadOnly,
}: {
  workflowId: string | null;
  isReadOnly: boolean;
}) {
  const list = useWorkflowSectionQuery<WorkflowContributor[]>(
    workflowId ? `wf:${workflowId}:contributors` : null,
    () => getWorkflowContributors(workflowId as string),
    { enabled: !!workflowId },
  );

  const [newUser, setNewUser] = useState('');
  const [newRole, setNewRole] = useState<'viewer' | 'editor'>('viewer');

  const contributors = list.data ?? [];
  const isGap = (s: number | null) => s === 404 || s === 501;
  const status: FetchStatus =
    list.state === 'done'
      ? 'ok'
      : list.state === 'error'
        ? isGap(list.errorStatus)
          ? 'gap'
          : 'error'
        : 'loading';

  const reloadList = () => {
    if (workflowId) evictWorkflowSectionCache(`wf:${workflowId}:contributors`);
    list.reload();
  };

  return (
    <div className="border-t border-gray-100 pt-4 dark:border-gray-800">
      <div className="mb-3 flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5 text-gray-500" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
          Contributors
        </h3>
      </div>

      {status === 'loading' && <SkeletonRows />}
      {status === 'gap' && <GapNote />}
      {status === 'error' && <ErrorNote code={list.errorStatus ?? undefined} />}
      {status === 'ok' && contributors.length === 0 && (
        <p className="text-[11px] italic text-gray-400 dark:text-gray-500">No contributors yet</p>
      )}
      {status === 'ok' && contributors.length > 0 && (
        <ul className="space-y-1.5">
          {contributors.map((c) => (
            <li
              key={contribKey(c)}
              className="flex items-center justify-between gap-2 rounded-lg border border-gray-200 px-2.5 py-1.5 text-xs dark:border-gray-700"
            >
              <div className="min-w-0">
                <span className="block truncate font-medium text-gray-800 dark:text-gray-200">
                  {contribName(c) || '—'}
                </span>
                <span className="text-[10px] uppercase tracking-wide text-gray-400">
                  {str((c as any).role)}
                </span>
              </div>
              {!isReadOnly && (c as any).role !== 'owner' && contribName(c) && (
                <InsightActionButton
                  label="Remove"
                  icon={Trash2}
                  variant="danger"
                  size="sm"
                  onAction={() => removeWorkflowContributor(workflowId!, contribName(c))}
                  successToast="Contributor removed"
                  pingBell
                  onDone={reloadList}
                  unavailableHint="Removing contributors is not available on this backend"
                  confirm={{
                    title: 'Remove contributor?',
                    body: `${contribName(c)} will lose access to this workflow.`,
                    variant: 'warning',
                  }}
                />
              )}
            </li>
          ))}
        </ul>
      )}

      {!isReadOnly && (status === 'ok' || status === 'error') && (
        <div className="mt-3 space-y-2 rounded-lg border border-gray-200 bg-gray-50 p-2 dark:border-gray-700 dark:bg-gray-800/50">
          <div className="flex items-center gap-2">
            <input
              value={newUser}
              onChange={(e) => setNewUser(e.target.value)}
              placeholder="username"
              className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 outline-none focus:border-gray-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as 'viewer' | 'editor')}
              className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] text-gray-700 outline-none dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
            >
              <option value="viewer">viewer</option>
              <option value="editor">editor</option>
            </select>
          </div>
          <InsightActionButton
            label="Add contributor"
            icon={UserPlus}
            variant="subtle"
            size="sm"
            onAction={async () => {
              const u = newUser.trim();
              if (!u) throw new Error('Enter a username to add');
              return addWorkflowContributor(workflowId!, u, newRole);
            }}
            successToast="Contributor added"
            pingBell
            onDone={() => {
              setNewUser('');
              setNewRole('viewer');
              reloadList();
            }}
            unavailableHint="Adding contributors is not available on this backend"
          />
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 5 — AI ASSIST
// ---------------------------------------------------------------------------

function AiSection({
  workflowId,
  blocks,
}: {
  workflowId: string | null;
  blocks: CanvasNodeSnapshot[];
}) {
  // Rule-based, deterministic suggestions derived from the current graph.
  const suggestions = useMemo<Suggestion[]>(() => {
    const out: Suggestion[] = [];
    const hasQualityGate = blocks.some((b) => /quality|validate|test|check|assert/i.test(b.type));
    const hasLoad = blocks.some((b) => /load|destination|write|insert|merge|upsert|sink/i.test(b.type));
    if (hasLoad && !hasQualityGate) {
      out.push({
        id: 'add-quality-gate',
        title: 'Add a quality gate before load',
        rationale:
          'This workflow writes to a destination but has no data-quality check upstream. Adding a quality gate catches bad rows before they land.',
        navigate: { label: 'Open Data Quality', href: '/data-quality' },
      });
    }
    out.push({
      id: 'schedule-off-peak',
      title: 'Schedule off-peak',
      rationale:
        'Running heavy transforms off-peak reduces warehouse contention and credit cost. Use the Schedule section to set an off-peak cron.',
    });
    if (workflowId) {
      out.push({
        id: 'dry-run-first',
        title: 'Dry-run before deploying',
        rationale:
          'Preview the compiled SQL with a dry-run so you can review the generated queries before any production write.',
        action: {
          label: 'Run dry-run',
          endpoint: API.workflow.dryRun(workflowId),
          method: 'POST',
          payload: { mode: 'temp_tables' },
          cost: '~compute only',
          risk: 'low — no production write',
        },
      });
    }
    return out;
  }, [blocks, workflowId]);

  return (
    <div className="space-y-4">
      <SectionHeader title="AI assist" subtitle="Rule-based suggestions for this workflow." />
      <AIActionFlow
        context={{
          module: 'workflow',
          entityType: 'workflow',
          entityId: workflowId ?? 'new',
        }}
        suggestions={suggestions}
        title="Suggestions"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ACTIONS cluster — lifecycle/creation actions relocated from the toolbar
// ---------------------------------------------------------------------------

/** Compact icon+label action button used in the Actions cluster. */
function ActionBtn({
  icon: Icon,
  label,
  onClick,
  disabled,
  busy,
  title,
  tone = 'neutral',
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  title?: string;
  tone?: 'neutral' | 'primary' | 'success' | 'create' | 'ai' | 'warn' | 'schedule';
}) {
  const tones: Record<string, string> = {
    neutral:
      'border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700',
    primary:
      'bg-blue-600 text-white hover:bg-blue-700 shadow-sm',
    success:
      'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
    create:
      'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
    ai:
      'bg-gradient-to-r from-purple-600 to-fuchsia-600 text-white hover:opacity-90 shadow-sm',
    warn:
      'bg-amber-500 text-white hover:bg-amber-600 shadow-sm',
    schedule:
      'border border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-900/40 dark:bg-blue-900/20 dark:text-blue-300 dark:hover:bg-blue-900/30',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      aria-label={label}
      className={cn(
        'flex h-8 items-center justify-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        tones[tone],
      )}
    >
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Icon className="h-3.5 w-3.5" />}
      <span className="truncate">{label}</span>
    </button>
  );
}

function ActionsCluster(props: WorkflowSmartPanelProps) {
  const {
    activeWorkflowId,
    isReadOnly,
    onNew,
    onAiCreate,
    onImport,
    onSave,
    onRun,
    onToggleSuspend,
    onSchedule,
    canCreate,
    canEdit,
    canExecute,
    isSaving,
    isExecuting,
    isSuspendingTask,
    isPendingApproval,
    isApproved,
    executeUnavailable,
    suspendMode,
    hasSchedule,
    scheduleCronSummary,
  } = props;

  // System-2 Action-RBAC, owned by the panel. useCanPerform is a module-cached
  // singleton — these share the builder's existing fetch (no extra request, no
  // drift). The parent already passes fail-open booleans (allowed||loading) for
  // the *disabled* state; we additionally read the raw verdict here to HIDE an
  // action on a *resolved* deny. Loading and hard-error both fail open (keep the
  // button visible), so a denied role only loses the buttons it truly can't use.
  const createPerm = useCanPerform('workflow', 'create', activeWorkflowId ?? undefined);
  const editPerm = useCanPerform('workflow', 'edit', activeWorkflowId ?? undefined);
  const executePerm = useCanPerform('workflow', 'execute', activeWorkflowId ?? undefined);
  const isResolvedDeny = (p: { allowed: boolean; loading: boolean; error: boolean }) =>
    !p.allowed && !p.loading && !p.error;
  const deniedCreate = isResolvedDeny(createPerm);
  const deniedEdit = isResolvedDeny(editPerm);
  const deniedExecute = isResolvedDeny(executePerm);

  // Per-action visibility (task mapping: Run→execute, Save→edit/create,
  // Schedule→create). New/AI/Import are all create-gated; Suspend/Resume manage
  // an existing schedule and ride with Schedule under 'create'.
  const showCreateGroup = !deniedCreate;
  const showSave = activeWorkflowId ? !deniedEdit : !deniedCreate;
  const showRun = !deniedExecute;
  const showScheduleGroup = !deniedCreate;
  const showLifecycle = showSave || showRun || showScheduleGroup;

  const saveDisabled =
    isSaving || isReadOnly || isPendingApproval || (activeWorkflowId ? !canEdit : !canCreate);
  const runDisabled =
    isExecuting ||
    !activeWorkflowId ||
    isReadOnly ||
    executeUnavailable ||
    (isPendingApproval && !isApproved) ||
    !canExecute;

  // Fully-denied role (no create/edit/execute) → no actions to show at all.
  if (!showCreateGroup && !showLifecycle) return null;

  return (
    <div className="border-b border-gray-200 bg-gray-50/60 px-3 py-2.5 dark:border-gray-700 dark:bg-gray-800/40">
      {/* Zone label — anchors this strip as the COMMITTED lifecycle/creation
          actions, the counterpart to (and visually distinct from) the AI assist
          suggestions in the AI section, so a suggestion is never mistaken for a
          committed action. The AI banner points users back here ("Actions bar"). */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
          <Play className="h-3 w-3" aria-hidden />
          Actions
        </p>
        <span className="text-[9px] font-medium text-gray-400 dark:text-gray-500">
          take effect when clicked
        </span>
      </div>

      {/* Create cluster */}
      {showCreateGroup && (
      <div className="mb-2">
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          Create
        </p>
        <div className="grid grid-cols-3 gap-1.5">
          <ActionBtn
            icon={Plus}
            label="New"
            tone="create"
            onClick={onNew}
            disabled={!canCreate}
            title={canCreate ? 'Create a new workflow' : 'You lack the "create" permission on workflow.'}
          />
          <ActionBtn
            icon={Sparkles}
            label="AI"
            tone="ai"
            onClick={onAiCreate}
            disabled={!canCreate}
            title={canCreate ? 'Generate a workflow with AI' : 'You lack the "create" permission on workflow.'}
          />
          <ActionBtn
            icon={Download}
            label="Import"
            tone="neutral"
            onClick={onImport}
            disabled={!canCreate}
            title={canCreate ? 'Import warehouse task graphs as workflows' : 'You lack the "create" permission on workflow.'}
          />
        </div>
      </div>
      )}

      {/* Lifecycle cluster */}
      {showLifecycle && (
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">
          Lifecycle
        </p>
        <div className="grid grid-cols-2 gap-1.5">
          {showSave && (
          <ActionBtn
            icon={Save}
            label="Save"
            tone="primary"
            onClick={onSave}
            disabled={saveDisabled}
            busy={isSaving}
            title={
              activeWorkflowId && !canEdit
                ? 'You lack the "edit" permission on workflow.'
                : !activeWorkflowId && !canCreate
                  ? 'You lack the "create" permission on workflow.'
                  : isPendingApproval
                    ? 'Pending approval — cannot modify'
                    : 'Save workflow (Ctrl+S)'
            }
          />
          )}
          {showRun && (
          <ActionBtn
            icon={Play}
            label="Run"
            tone="success"
            onClick={onRun}
            disabled={runDisabled}
            busy={isExecuting}
            title={
              !canExecute
                ? 'You lack the "execute" permission on workflow.'
                : executeUnavailable
                  ? 'Run isn’t available on this backend'
                  : isPendingApproval
                    ? 'Pending approval — waiting for admin'
                    : 'Run the workflow now (Ctrl+Enter)'
            }
          />
          )}
          {showScheduleGroup && (suspendMode === 'suspend' ? (
            <ActionBtn
              icon={Pause}
              label="Suspend"
              tone="warn"
              onClick={onToggleSuspend}
              disabled={isReadOnly || isSuspendingTask}
              busy={isSuspendingTask}
              title={isReadOnly ? 'View-only access' : 'Pause the scheduled task'}
            />
          ) : suspendMode === 'resume' ? (
            <ActionBtn
              icon={Play}
              label="Resume"
              tone="success"
              onClick={onToggleSuspend}
              disabled={isReadOnly || isSuspendingTask}
              busy={isSuspendingTask}
              title={isReadOnly ? 'View-only access' : 'Resume the suspended scheduled task'}
            />
          ) : (
            <ActionBtn
              icon={Pause}
              label="Suspend"
              tone="neutral"
              onClick={() => {}}
              disabled
              title={!activeWorkflowId ? 'Save the workflow first' : 'No schedule yet — create one with Schedule'}
            />
          ))}
          {showScheduleGroup && (
          <ActionBtn
            icon={Calendar}
            label={hasSchedule ? (scheduleCronSummary ? `Scheduled · ${scheduleCronSummary}` : 'Scheduled') : 'Schedule'}
            tone={hasSchedule ? 'schedule' : 'primary'}
            onClick={onSchedule}
            disabled={isReadOnly || !activeWorkflowId}
            title={
              !activeWorkflowId
                ? 'Save the workflow first'
                : isReadOnly
                  ? 'View-only access'
                  : hasSchedule
                    ? `Edit schedule — ${scheduleCronSummary || 'open editor'}`
                    : 'Create a schedule for this workflow'
            }
          />
          )}
        </div>
      </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icon rail definition
// ---------------------------------------------------------------------------

interface RailItem {
  id: WorkflowPanelSection;
  icon: LucideIcon;
  label: string;
}

const RAIL: RailItem[] = [
  { id: 'changes', icon: GitCompare, label: 'Changes' },
  { id: 'submit', icon: ShieldCheck, label: 'Submit for validation' },
  { id: 'deploy', icon: HistoryIcon, label: 'Deployments & versions' },
  { id: 'block', icon: Box, label: 'Block details' },
  { id: 'ai', icon: Sparkles, label: 'AI build' },
  { id: 'results', icon: Eye, label: 'Results' },
  { id: 'runs', icon: ListChecks, label: 'Run history' },
  // Operational sections folded in from the former WorkflowProjectBar rail.
  { id: 'usage', icon: BarChart3, label: 'Usage' },
  { id: 'cost', icon: DollarSign, label: 'Cost' },
  { id: 'governance', icon: Shield, label: 'Governance' },
  { id: 'sql', icon: Code, label: 'Compiled SQL' },
  { id: 'schedule', icon: Calendar, label: 'Schedule' },
];

const RAIL_IDS = new Set(RAIL.map((r) => r.id));

// In-journey click "?" help for each section (R14/H3). Shown next to the active
// section title in the panel header via <HelpPopover>. Typed as a total record
// so TypeScript flags any missing section — the header is the single help point
// for ALL sections, including those whose bodies live in other files
// (Usage/Cost/Governance + the legacy Results/Runs/SQL/Schedule bodies). Plain
// language, no vendor names.
const SECTION_HELP: Record<WorkflowPanelSection, string> = {
  changes:
    'Shows the blocks you have added, changed or removed since this workflow was last saved. Review it before you submit so you know exactly what will go live.',
  submit:
    'Runs a safe validation of the workflow before it touches real data. Pick "cloned data" for production sources or "temp tables" for pipelines, then submit it for deployment approval.',
  deploy:
    'Lists every production deployment and saved version of this workflow, with who did what and when. Use it to compare versions or roll back to an earlier one.',
  block:
    'Configure the block you selected on the canvas — its source, transform or destination settings. Click any block on the canvas to edit it here.',
  ai:
    'Describe the pipeline you want and the AI builds the blocks directly on the canvas as a draft. Review each block here, then accept, undo or refine it. Smart improvement suggestions appear below the builder.',
  results:
    'The output of the most recent run, so you can confirm the workflow produced the data you expected.',
  runs:
    'A history of every time this workflow ran, with status and timing. Use it to spot failed or slow runs.',
  usage:
    'How often this workflow runs and how much data it moves over time, so you can track activity at a glance.',
  cost:
    'The estimated compute cost of running this workflow. Use it to keep an eye on spend and find the most expensive steps.',
  governance:
    'Who can access this workflow and which data policies apply to it. Use it to check permissions and compliance.',
  sql:
    'The query this workflow compiles to, shown read-only. Review it to understand exactly what will run before you deploy.',
  schedule:
    'Set when this workflow runs automatically on a recurring schedule. You can also pause or resume an existing schedule here.',
};

// Short, hover-length descriptions for each rail icon (what each tab does). The
// rail buttons only carry an icon, so the native bare label ("Changes") was not
// self-explanatory — this gives a one-line "what it does" on hover/focus via the
// shared <Tooltip>. The longer click-help stays in SECTION_HELP (header
// <HelpPopover>). Total record so a missing section is a TS error. No vendor
// names.
const RAIL_TIP: Record<WorkflowPanelSection, string> = {
  changes: 'Review blocks added, changed or removed since the last save',
  submit: 'Safely validate the workflow, then submit it for deployment approval',
  deploy: 'Deployment history and saved versions — compare or roll back',
  block: 'Configure the block you selected on the canvas',
  ai: 'Describe a pipeline and the AI builds the blocks on the canvas — review, accept or undo the draft here',
  results: 'Output of the most recent run',
  runs: 'History of every run, with status and timing',
  usage: 'How often this workflow runs and how much data it moves',
  cost: 'Estimated compute cost of running this workflow',
  governance: 'Who can access this workflow and which policies apply',
  sql: 'The read-only query this workflow compiles to',
  schedule: 'Run this workflow automatically on a recurring schedule',
};

// Versioned, minimal localStorage keys (client-localstorage-schema): persist the
// user's last section ("draft of menu" → preselect on return) and whether the
// always-on actions strip is collapsed so the active section can run full-height.
const PANEL_SECTION_KEY = 'data360.wf.panel.section.v1';
const PANEL_ACTIONS_COLLAPSED_KEY = 'data360.wf.panel.actionsCollapsed.v1';

// SSE cache-invalidation keys that should drop this workflow's cached section
// data (Deploy / Usage / Cost / Governance). Mirrors the keys the builder already
// reacts to (deployments / projects) plus the run/version/workflow spine.
const WORKFLOW_INVALIDATION_KEYS = new Set<string>([
  CACHE_KEYS.WORKFLOWS,
  CACHE_KEYS.DEPLOYMENTS,
  CACHE_KEYS.RUNS,
  CACHE_KEYS.PROJECTS,
  CACHE_KEYS.PROJECT_VERSIONS,
  CACHE_KEYS.APPROVALS,
]);

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

/**
 * Capability tier chip — Owner / Editor / Viewer — mirroring the Explore & Design
 * right bar's RoleContextChip so both cockpits surface "what can I do here" the
 * same way. Built from the fail-open action-RBAC booleans the builder already
 * resolves (canDeploy → Owner, create/edit → Editor, else Viewer); display-only.
 */
function WorkflowRoleChip({ canCreate, canEdit, canDeploy, canExecute }: {
  canCreate: boolean; canEdit: boolean; canDeploy: boolean; canExecute: boolean;
}) {
  const write = canCreate || canEdit;
  const tier = canDeploy ? 'Owner' : write ? 'Editor' : 'Viewer';
  const verb = canDeploy ? 'can deploy' : write ? 'can edit' : 'read-only';
  const tone = canDeploy
    ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
    : write
    ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400';
  const TierIcon = canDeploy ? ShieldCheck : write ? Shield : Eye;
  const label =
    `${tier} · ${verb} — Create/edit: ${write ? 'yes' : 'no'}, ` +
    `Deploy: ${canDeploy ? 'yes' : 'no'}, Run: ${canExecute ? 'yes' : 'no'}`;
  return (
    <Tooltip side="bottom" label={label}>
      <span className={cn('mt-1 inline-flex w-fit items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold cursor-default', tone)}>
        <TierIcon className="h-2.5 w-2.5" aria-hidden />
        {tier} · {verb}
      </span>
    </Tooltip>
  );
}

export default function WorkflowSmartPanel(props: WorkflowSmartPanelProps) {
  const {
    activeWorkflowId,
    activeWorkflowName,
    activeSection,
    onSectionChange,
    currentBlocks,
    baselineBlocks,
    isDirty,
    selectedNode,
    isReadOnly,
    canCreate,
    canEdit,
    canDeploy,
    canExecute,
    hasConnectorSource,
    onValidate,
    onDryRun,
    onCloneValidate,
    onSubmitDeploy,
    onOpenRollback,
    onReload,
    statusHero,
    blockSlot,
    aiSlot,
    legacyBodies,
  } = props;

  // The selected block's OUTPUT table, fed to the Governance tab's Data Access
  // section ("who can read this output"). Block configs disagree on key names:
  //   • copy_into / cdc_merge …  → target_database / target_schema / target_table
  //   • destination / source …   → database(_name) / schema(_name) / table(_name)
  // and `table` is sometimes a full DB.SCHEMA.TABLE FQN. Handle them all.
  const selectedOutputTable = useMemo<OutputTableRef | null>(() => {
    const d = selectedNode?.data as Record<string, unknown> | undefined;
    const cfg = ((d?.config as Record<string, unknown>) ?? d ?? {}) as Record<string, unknown>;
    const pick = (...keys: string[]) => {
      for (const k of keys) { const v = cfg[k]; if (typeof v === 'string' && v.trim()) return v.trim(); }
      return undefined;
    };
    let db = pick('target_database', 'database', 'database_name');
    let sc = pick('target_schema', 'schema', 'schema_name');
    let tb = pick('target_table', 'table', 'table_name');
    // `table` may already be a qualified DB.SCHEMA.TABLE — split and backfill.
    if (tb && tb.includes('.')) {
      const parts = tb.split('.');
      tb = parts.pop();
      if (parts.length >= 2) { sc = sc ?? parts.pop(); db = db ?? parts.pop(); }
      else if (parts.length === 1) { sc = sc ?? parts.pop(); }
    }
    if (db && sc && tb) return { database: db, schema: sc, table: tb };
    return null;
  }, [selectedNode]);

  const active = RAIL.find((r) => r.id === activeSection) ?? RAIL[0];

  // Collapse the always-on actions strip (lazy init from storage; functional
  // updater keeps the toggle callback stable — rerender-lazy-state-init).
  const [actionsCollapsed, setActionsCollapsed] = useState<boolean>(() => {
    try { return window.localStorage.getItem(PANEL_ACTIONS_COLLAPSED_KEY) === '1'; }
    catch { return false; }
  });
  const toggleActions = useCallback(() => setActionsCollapsed((c) => !c), []);

  // Restore the last-used section ONCE on mount (draft → preselect).
  const restoredRef = React.useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    try {
      const saved = window.localStorage.getItem(PANEL_SECTION_KEY);
      if (saved && saved !== activeSection && RAIL_IDS.has(saved as WorkflowPanelSection)) {
        onSectionChange(saved as WorkflowPanelSection);
      }
    } catch { /* storage unavailable — keep current section */ }
    // run-once on mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep the lazy-section cache honest after mutations. The panel is always
  // mounted, so it (not the unmounted sections) owns the eviction: when an SSE
  // invalidation touches a workflow-relevant key, drop this workflow's cached
  // section data so the active section refetches at once and the others fetch
  // fresh on their next activation. Without this, "fetch-once / serve-on-revisit"
  // would otherwise mask a freshly-submitted deployment, a new run, or a new
  // version — the same freshness contract the rest of the app gets via
  // useCacheAwareQuery.
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  useEffect(() => {
    if (!lastInvalidation || !activeWorkflowId) return;
    const relevant = lastInvalidation.keys.some((k) => WORKFLOW_INVALIDATION_KEYS.has(k));
    if (relevant) evictWorkflowSectionCache(`wf:${activeWorkflowId}:`);
  }, [lastInvalidation, activeWorkflowId]);

  // Persist section + collapse state as they change.
  useEffect(() => {
    try { window.localStorage.setItem(PANEL_SECTION_KEY, activeSection); } catch { /* ignore */ }
  }, [activeSection]);
  useEffect(() => {
    try { window.localStorage.setItem(PANEL_ACTIONS_COLLAPSED_KEY, actionsCollapsed ? '1' : '0'); }
    catch { /* ignore */ }
  }, [actionsCollapsed]);

  return (
    <div
      role="region"
      aria-modal="false"
      aria-label="Workflow smart panel"
      className="flex h-full w-[380px] shrink-0 border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
    >
      {/* ── Panel body ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header — active section label + workflow name + actions-collapse toggle */}
        <div className="flex items-start justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
                {active.label}
              </p>
              {/* In-journey click "?" help for the ACTIVE section (R14/H3). */}
              <HelpPopover
                label={SECTION_HELP[active.id]}
                title={active.label}
                side="bottom"
                ariaLabel={`What is the ${active.label} section?`}
              />
            </div>
            <h2 className="truncate text-sm font-bold text-gray-900 dark:text-white">
              {activeWorkflowName || 'New workflow'}
            </h2>
            <WorkflowRoleChip
              canCreate={canCreate}
              canEdit={canEdit}
              canDeploy={canDeploy}
              canExecute={canExecute}
            />
          </div>
          <button
            type="button"
            onClick={toggleActions}
            aria-pressed={actionsCollapsed}
            title={actionsCollapsed ? 'Show actions' : 'Hide actions — give this section full height'}
            aria-label={actionsCollapsed ? 'Show actions' : 'Hide actions'}
            className="mt-0.5 shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          >
            {actionsCollapsed
              ? <ChevronsUpDown className="h-4 w-4" />
              : <ChevronsDownUp className="h-4 w-4" />}
          </button>
        </div>

        {/* Per-project KPI strip (G7). A workflow IS a project — `activeWorkflowId`
            is the project_id (the builder's setters and WorkflowProjectBar both
            treat it as one) — so this is honest PER-PROJECT context, never
            per-account data. Rendered only for a loaded/saved workflow; skipped
            for the new/unsaved state (no id yet). The strip self-degrades:
            skeleton while loading, "—" for null KPIs, and renders nothing at all
            when the rollup isn't provisioned on this backend (404/501). */}
        {activeWorkflowId && (
          <div className="px-3 pt-2 pb-1">
            <ProjectKpiStrip projectId={activeWorkflowId} compact />
          </div>
        )}

        {/* Actions strip — collapsible so the active section can run full-height.
            Hidden state is persisted; the toggle lives in the header above. */}
        {actionsCollapsed ? null : <ActionsCluster {...props} />}

        {/* Status hero (deploy/run snapshot from the builder) */}
        {statusHero}

        {/* Active section body — min-h-0 so this flex item can shrink and its
            scrollbar activates. The block section hosts ETLConfigSidebar
            full-bleed (it pins its own header/footer and scrolls its form
            area), so it gets overflow-hidden + no padding instead of an outer
            scroll that would strand the sidebar footer. */}
        <div
          className={cn(
            'flex-1 min-h-0',
            activeSection === 'block' && blockSlot
              ? 'overflow-hidden'
              : 'overflow-y-auto p-4',
          )}
        >
          {!activeWorkflowId &&
          activeSection !== 'changes' &&
          activeSection !== 'ai' &&
          activeSection !== 'block' ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <Box className="mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" />
              <p className="text-xs text-gray-400 dark:text-gray-500">
                Select or create a workflow to use this section.
              </p>
            </div>
          ) : (
            <>
              {activeSection === 'changes' && (
                <ChangesSection current={currentBlocks} baseline={baselineBlocks} isDirty={isDirty} />
              )}
              {activeSection === 'submit' && (
                <SubmitSection
                  workflowId={activeWorkflowId}
                  isReadOnly={isReadOnly || !canDeploy}
                  hasConnectorSource={hasConnectorSource}
                  onValidate={onValidate}
                  onDryRun={onDryRun}
                  onCloneValidate={onCloneValidate}
                  onSubmitDeploy={onSubmitDeploy}
                />
              )}
              {activeSection === 'deploy' && (
                <DeploySection
                  workflowId={activeWorkflowId}
                  isReadOnly={isReadOnly}
                  canDeploy={canDeploy}
                  onOpenRollback={onOpenRollback}
                  onReload={onReload}
                />
              )}
              {/* Operational sections folded in from the former second rail.
                  Each tab's fetch is gated on it being the ACTIVE section (not a
                  hardcoded `enabled`), so even if a future refactor keeps them
                  mounted for transitions they won't fetch until active; the
                  module cache then serves re-activations without a refetch. */}
              {activeSection === 'usage' && activeWorkflowId && (
                <UsageTab workflowId={activeWorkflowId} enabled={activeSection === 'usage'} />
              )}
              {activeSection === 'cost' && activeWorkflowId && (
                <CostTab workflowId={activeWorkflowId} enabled={activeSection === 'cost'} />
              )}
              {activeSection === 'governance' && activeWorkflowId && (
                <GovernanceTab
                  workflowId={activeWorkflowId}
                  enabled={activeSection === 'governance'}
                  output={selectedOutputTable}
                />
              )}
              {activeSection === 'block' && (
                blockSlot ?? (
                  <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                    <Box className="mb-2 h-8 w-8 text-gray-300 dark:text-gray-600" />
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {selectedNode ? 'Loading block…' : 'Select a block on the canvas to configure it.'}
                    </p>
                  </div>
                )
              )}
              {activeSection === 'ai' && (
                <div className="space-y-3">
                  {/* Clear AI/action boundary: the AI builds a DRAFT on the
                      canvas that only becomes real when the user accepts it.
                      Visually + textually separated from the committed
                      lifecycle "Actions" strip above so an AI draft is never
                      mistaken for a committed action. */}
                  <div className="flex items-start gap-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 dark:border-violet-900/50 dark:bg-violet-900/15">
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-violet-500" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-violet-700 dark:text-violet-300">
                        AI build · drafts on the canvas
                      </p>
                      <p className="mt-0.5 text-[11px] leading-snug text-violet-600/80 dark:text-violet-300/70">
                        The AI adds blocks directly to the canvas as a draft —
                        nothing is saved until you accept it here. To Save, Run
                        or Submit the workflow itself, use the Actions bar above.
                      </p>
                    </div>
                  </div>
                  {/* Primary: the docked AI Build flow (prompt → blocks on the
                      canvas → review/accept/undo/refine). Falls back to the
                      rule-based suggestions when the builder passes no slot. */}
                  {aiSlot ?? <AiSection workflowId={activeWorkflowId} blocks={currentBlocks} />}
                  {/* AI-prefilled cross-module CTA blocks (deep-link with intent),
                      scoped to workflow + the active project. Secondary to the
                      build flow above. */}
                  <AiActionBlocks
                    context={{
                      scope: 'module',
                      module: 'workflow',
                      projectId: activeWorkflowId ?? undefined,
                    }}
                    title="Suggestions IA"
                  />
                </div>
              )}
              {/* Legacy bodies self-guard on `activeTab` internally; render them
                  for the legacy sections and append the legacy run-analysis body
                  under the new AI suggestions on the `ai` section. */}
              {(LEGACY_SECTIONS.includes(activeSection) || activeSection === 'ai') &&
                (legacyBodies ?? (activeSection === 'ai' ? null : <GapNote />))}
            </>
          )}
        </div>
      </div>

      {/* ── Icon rail (far-right edge, vertical flip menu) ── */}
      {/* Keep overflow-y-auto: the parent builder row is overflow-hidden, so the
          rail MUST be able to scroll to stay reachable under browser zoom / short
          viewports (WCAG reflow) — reachability wins over a styled bubble. A
          scroll container also clips the leftward <Tooltip> bubble at the rail
          edge, so the bubble degrades gracefully to the shared component's native
          title/aria mirror (still a hover/focus tooltip, just unstyled in the
          rail). On-click deep help stays in the header <HelpPopover>. */}
      <nav
        aria-label="Workflow panel sections"
        className="flex w-12 shrink-0 flex-col items-center gap-1 overflow-y-auto border-l border-gray-200 bg-gray-50 py-2 dark:border-gray-700 dark:bg-gray-800/60"
      >
        {RAIL.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activeSection;
          // Hover/focus tooltip (what each tab does) via the shared <Tooltip>;
          // it mirrors the description into title + aria for touch/SR users. The
          // button keeps its own short accessible name (the section label), and
          // the on-click deep help is the header <HelpPopover> that reflects
          // whichever rail icon is active — so every rail icon has BOTH a
          // tooltip and on-click help without crowding the 48px rail.
          return (
            <Tooltip
              key={item.id}
              side="left"
              label={`${item.label}: ${RAIL_TIP[item.id]}`}
            >
              <button
                type="button"
                onClick={() => onSectionChange(item.id)}
                aria-label={item.label}
                aria-pressed={isActive}
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200',
                )}
              >
                <Icon className="h-4 w-4" />
              </button>
            </Tooltip>
          );
        })}
      </nav>
    </div>
  );
}
