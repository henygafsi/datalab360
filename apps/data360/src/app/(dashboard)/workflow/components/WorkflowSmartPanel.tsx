'use client';

/**
 * WorkflowSmartPanel — the single intelligent right-bar for the Workflow builder.
 *
 * Replaces the old horizontal-tab right panel (results / runs / sql / schedules
 * / ai) AND the dispersed lifecycle buttons that used to live in the top toolbar
 * (Validate / SQL dry-run / Clone-test / Approve-deploy / Rollback). There are
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
  RotateCcw,
  CheckCircle2,
  PlusCircle,
  MinusCircle,
  PencilLine,
  type LucideIcon,
} from 'lucide-react';
import type { Node } from 'reactflow';
import { cn } from '@/lib/utils';
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import InsightActionButton from '@/app/shared/insights/InsightActionButton';
import AIActionFlow, { type Suggestion } from '@/app/shared/insights/AIActionFlow';
import * as workflowApi from '@/app/services/api/workflowApi';
import type {
  WorkflowDeployment,
  WorkflowVersion,
} from '@/app/services/api/types';

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

  /**
   * Always-on header region (RunApprovalStatusHero + fix-rail reopen + the
   * persistent error banner + sr-only status). Rendered above EVERY section so
   * runtime errors are never hidden by the active section.
   */
  statusHero?: React.ReactNode;
  /** Selected-block config editor (ETLConfigSidebar), rendered in `block`. */
  blockSlot?: React.ReactNode;
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

  // Temp-tables path: dry-run with a {mode} payload. Whether the backend honours
  // `mode` is unconfirmed — InsightActionButton self-disables on 404/501, and
  // this is flagged as Henry P1 in the report.
  const runTempTables = useCallback(async () => {
    if (!workflowId) throw new Error('No workflow selected');
    const res = await apiClient.post(API.workflow.dryRun(workflowId), { mode: 'temp_tables' });
    fireEvent({ outcome: 'ok' });
    return res.data;
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
  onOpenRollback,
  onReload,
}: {
  workflowId: string | null;
  isReadOnly: boolean;
  onOpenRollback: () => void;
  onReload?: () => void;
}) {
  const [depStatus, setDepStatus] = useState<FetchStatus>('loading');
  const [depCode, setDepCode] = useState<number | undefined>(undefined);
  const [deployments, setDeployments] = useState<WorkflowDeployment[]>([]);
  const [verStatus, setVerStatus] = useState<FetchStatus>('loading');
  const [versions, setVersions] = useState<WorkflowVersion[]>([]);

  const load = useCallback(async () => {
    if (!workflowId) return;
    setDepStatus('loading');
    setVerStatus('loading');
    // Deployments
    try {
      const res = await workflowApi.listDeployments(workflowId, { limit: 20 });
      setDeployments(res.deployments ?? []);
      setDepStatus('ok');
    } catch (err: unknown) {
      const code = (err as { response?: { status?: number } })?.response?.status;
      setDepCode(code);
      setDepStatus(code === 404 || code === 501 ? 'gap' : 'error');
    }
    // Versions
    try {
      const res = await workflowApi.listVersions(workflowId, { limit: 20 });
      setVersions(res.versions ?? []);
      setVerStatus('ok');
    } catch (err: unknown) {
      const code = (err as { response?: { status?: number } })?.response?.status;
      setVerStatus(code === 404 || code === 501 ? 'gap' : 'error');
    }
  }, [workflowId]);

  useEffect(() => {
    void load();
  }, [load]);

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
                {d.status === 'approved' && !isReadOnly && (
                  <div className="mt-2">
                    <InsightActionButton
                      label="Re-run deployment"
                      icon={CheckCircle2}
                      variant="subtle"
                      size="sm"
                      onAction={() => workflowApi.executeDeployment(workflowId!, d.deployment_id)}
                      successToast="Deployment executed"
                      pingBell
                      onDone={() => onReload?.()}
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
  { id: 'ai', icon: Sparkles, label: 'AI assist' },
  { id: 'results', icon: Eye, label: 'Results' },
  { id: 'runs', icon: ListChecks, label: 'Run history' },
  { id: 'sql', icon: Code, label: 'Compiled SQL' },
  { id: 'schedule', icon: Calendar, label: 'Schedule' },
];

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

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
    canDeploy,
    hasConnectorSource,
    onValidate,
    onDryRun,
    onCloneValidate,
    onSubmitDeploy,
    onOpenRollback,
    onReload,
    statusHero,
    blockSlot,
    legacyBodies,
  } = props;

  const active = RAIL.find((r) => r.id === activeSection) ?? RAIL[0];

  return (
    <div
      role="region"
      aria-modal="false"
      aria-label="Workflow smart panel"
      className="flex h-full w-[380px] shrink-0 border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
    >
      {/* ── Panel body ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-400">
            {active.label}
          </p>
          <h2 className="truncate text-sm font-bold text-gray-900 dark:text-white">
            {activeWorkflowName || 'New workflow'}
          </h2>
        </div>

        {/* Status hero (deploy/run snapshot from the builder) */}
        {statusHero}

        {/* Active section body */}
        <div className="flex-1 overflow-y-auto p-4">
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
                  onOpenRollback={onOpenRollback}
                  onReload={onReload}
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
                <AiSection workflowId={activeWorkflowId} blocks={currentBlocks} />
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
      <nav
        aria-label="Workflow panel sections"
        className="flex w-12 shrink-0 flex-col items-center gap-1 border-l border-gray-200 bg-gray-50 py-2 dark:border-gray-700 dark:bg-gray-800/60"
      >
        {RAIL.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activeSection;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSectionChange(item.id)}
              aria-label={item.label}
              aria-pressed={isActive}
              title={item.label}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                isActive
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200',
              )}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </nav>
    </div>
  );
}
