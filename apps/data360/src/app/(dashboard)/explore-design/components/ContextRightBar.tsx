'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Badge, Button, Tooltip, Loader } from 'rizzui';
import {
  X, ChevronLeft, ChevronRight, Zap, Brain, BarChart3, Clock,
  HelpCircle, Shield, RefreshCw, Plus, Key, AlertTriangle, Eye,
  Sparkles, CheckCircle, FileText, GitBranch, Lock, Tag, Send,
  Rocket, Play, Search, Info, ArrowRight, ExternalLink,
  PanelRight, Ban, Coins,
  Edit2, Copy, Link2, Database, Boxes, Activity, Layers, Trash2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { isUnavailable } from '@/lib/http-status';
import { toServiceError } from '@/app/services/_errors';
import RightTabPanel, { type RightTabSection, type QuickAction } from '@/app/shared/governance/right-tab-panel';
import toast from 'react-hot-toast';
import { useCanPerform } from '@/hooks/useCanPerform';
import PermissionGate from '@/components/ui/PermissionGate';
import ProjectKpiStrip from '@/app/shared/score-cards/ProjectKpiStrip';
import GovernancePostureCard from '@/app/shared/score-cards/GovernancePostureCard';
import AiActionBlocks from '@/app/shared/command-center/AiActionBlocks';
import IngestionBadge, { relativeTimeShort } from './IngestionBadge';
import type { IngestionTraceEntry } from '@/app/services/explore-design/ingestionTrace';
import GovernanceAccessPanel from './GovernanceAccessPanel';
import AiSavingsDashboard from './AiSavingsDashboard';
import { listIngestionRuns } from '@/app/services/api/exploreDesignApi';
import type { IngestionRun } from '@/app/services/api/types';

// Static Tailwind class maps. Interpolated classes like `text-${color}-600` are
// invisible to the Tailwind compiler and get PURGED unless safelisted (the axis
// colors emerald/amber/slate are not), so map each colour to LITERAL strings the
// content scanner can see — otherwise the axis/metric colours silently vanish.
const AXIS_BOX_CLASS: Record<string, string> = {
  emerald: 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/30 dark:bg-emerald-900/10',
  purple: 'border-purple-200 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-900/10',
  cyan: 'border-cyan-200 dark:border-cyan-800 bg-cyan-50/30 dark:bg-cyan-900/10',
  amber: 'border-amber-200 dark:border-amber-800 bg-amber-50/30 dark:bg-amber-900/10',
  blue: 'border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-900/10',
};
const AXIS_ICON_CLASS: Record<string, string> = {
  emerald: 'text-emerald-500', purple: 'text-purple-500', cyan: 'text-cyan-500', amber: 'text-amber-500', blue: 'text-blue-500',
};
const AXIS_COUNT_CLASS: Record<string, string> = {
  emerald: 'text-emerald-600', purple: 'text-purple-600', cyan: 'text-cyan-600', amber: 'text-amber-600', blue: 'text-blue-600',
};
const METRIC_TEXT_CLASS: Record<string, string> = {
  amber: 'text-amber-600 dark:text-amber-400', blue: 'text-blue-600 dark:text-blue-400',
  slate: 'text-slate-600 dark:text-slate-400', green: 'text-green-600 dark:text-green-400',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RightBarTab = 'actions' | 'ai' | 'quality' | 'cost' | 'governance' | 'history' | 'deploy' | 'help';
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
  confidence?: number | null;
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
  /** The classification endpoint returned 404/501 — honest disabled CTA. */
  classifyUnavailable?: boolean;
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
  /**
   * Modeling-only bridge (T1 unification). When supplied, the Actions section shows
   * a "Modeling actions" group whose buttons dispatch through the SAME
   * handleNodeContextAction path the retired TableOptionsSidebar used (rename,
   * duplicate, set PK, create FK/relation, tags, aggregation, dynamic/event/hybrid
   * table, exclude-from-model). The catalog view does NOT pass this, so the group is
   * hidden there (no canvas / no dispatch bridge) — catalog behaviour is unchanged.
   * Called with the table's id and the action key.
   */
  onNodeAction?: (tableId: string, action: string) => void;
  /**
   * Optional model-general landing rendered in place of the bare "Select a table"
   * EmptyState when no table is selected. The modeling view passes a model
   * overview (counts / target DWH / ADN) so the right cockpit has an honest
   * landing instead of 6× empty states; the catalog view passes nothing →
   * behaviour unchanged. Additive only — does NOT split the section model.
   */
  emptyOverride?: React.ReactNode;
  /**
   * Optional node rendered as the entire "Deploy" tab body in place of the
   * built-in inline pipeline. The page passes the full 8-step deployment stepper
   * (`<DeploymentValidation embedded />`, already wired with schemas / project /
   * permission gate) so the deploy wizard lives docked in this tab instead of a
   * centered modal (redesign rule R1/R2 — match the workflow module's
   * deploy-in-a-tab). When omitted, the legacy inline `DeployPanel` is shown.
   * Unlike the other sections this is NOT gated on a selected table: deployment
   * is project/event-scoped and is useful even with nothing selected.
   */
  deployOverride?: React.ReactNode;
  /**
   * Per-table Snowpipe/COPY ingestion trace for the SELECTED table, from the
   * page's single bulk `useIngestionTrace` call (account-global COPY_HISTORY,
   * aggregated client-side). Drives the "Ingestion & Cost" block in the Quality
   * tab. `null` → graceful "—". Cost is sourced separately (per-table catalog
   * SmartRightBar service) inside the block, not here.
   */
  ingestionTrace?: IngestionTraceEntry | null;
  /**
   * Optional per-tab severity → colour dot on each collapsed mini-rail icon
   * (redesign spec §1 tab colour indicators): 🟢 ok · 🟠 warn · 🔴 blocker ·
   * 🔵 pending/changes · ⚪ idle/not-configured. When omitted (default), no dots
   * render — behaviour unchanged. Keyed by the current `RightBarTab` union.
   */
  tabSeverity?: Partial<Record<RightBarTab, RailSeverity>>;
  /**
   * Optional live-analyst card rendered as the panel's sticky footer, visible
   * across every tab (redesign spec §5 — "AI Change Analyst · Live" at the
   * bottom of the right-bar). Omitted → no footer, behaviour unchanged.
   */
  analystSlot?: React.ReactNode;
}

// Rail severity → literal Tailwind dot classes. Interpolated `bg-${x}-500` would
// be purged by the content scanner, so map each severity to a LITERAL string.
export type RailSeverity = 'ok' | 'warn' | 'blocker' | 'pending' | 'idle';
const RAIL_SEVERITY_DOT: Record<RailSeverity, string> = {
  ok: 'bg-emerald-500',
  warn: 'bg-amber-500',
  blocker: 'bg-red-500',
  pending: 'bg-blue-500',
  idle: 'bg-slate-300 dark:bg-slate-600',
};

// ---------------------------------------------------------------------------
// Tab rail icons
// ---------------------------------------------------------------------------

// The collapsed mini-rail is derived from the SAME `sections` array that drives the
// docked panel (id + icon + label + description), so the two can never drift — this
// removes the former hard-coded `TABS` list whose 'Release' label had already
// diverged from the section's 'Deploy'.

// Versioned, minimal localStorage key (client-localstorage-schema): the shared
// RightTabPanel persists the user's last-viewed section ("draft of menu") to this
// key and restores it (validated against the known section ids) on mount.
const ACTIVE_TAB_KEY = 'data360.exploreDesign.contextTab.v1';

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ContextRightBar({
  selectedTable, tableColumns, projectId, isOpen, onToggle,
  activeTab, onTabChange, focusedAction, onFocusAction,
  columnClassifications, classificationDetails, isClassifying, classifyUnavailable, onRunClassify,
  onAddEvent, profileData, historyEvents,
  pendingEventsCount, pendingEvents, selectedDatabase, selectedSchema, userRole, onDeselectTable,
  emptyOverride, onNodeAction, deployOverride, ingestionTrace, tabSeverity,
  analystSlot,
}: ContextRightBarProps) {

  // Model-general landing: when nothing is selected and the caller supplied an
  // overview, show it in place of the bare "Select a table" empty state across
  // every section. Catalog passes nothing → unchanged 6× EmptyState behaviour.
  const empty = emptyOverride ?? <EmptyState />;

  const tableName = selectedTable?.table || '';
  const fqn = selectedTable ? `${selectedTable.database}.${selectedTable.schema}.${selectedTable.table}` : '';
  // The primary (first) axis is mode-dependent: with a table selected it is that
  // table's do-everything hub ("Table"); with nothing selected it is the project
  // roll-up ("Overview"). One label drives both the docked rail and the collapsed
  // mini-rail (the mini-rail is derived from `sections`, so they never drift).
  const primaryLabel = selectedTable ? 'Table' : 'Overview';
  const classifications = selectedTable ? columnClassifications.get(selectedTable.id) : undefined;

  // Role-filtered quick-actions (System 2 Action-RBAC, project-scoped). Each one
  // reuses an EXISTING panel handler — no rebuilt logic. Fail-open while the
  // allow-set loads (`allowed || loading`), mirroring ActionsPanel below.
  const canCreate = useCanPerform('explore_design', 'create', projectId);
  const canApprove = useCanPerform('explore_design', 'approve', projectId);
  const canDeploy = useCanPerform('explore_design', 'deploy', projectId);

  // Role-context chip — a compact, capability-derived ("Owner / Editor / Viewer")
  // badge with a tooltip listing the effective can-create/approve/deploy/execute
  // grants. Derived from the SAME useCanPerform allow-set above (no new RBAC
  // source); the raw d360Role lands in the tooltip. Rendered at the TOP of the bar
  // (kpiStrip slot) so it is visible on every tab, regardless of selection.
  const canExecuteTop = useCanPerform('explore_design', 'execute', projectId);
  const roleChip = (
    <RoleContextChip
      canCreate={canCreate}
      canApprove={canApprove}
      canDeploy={canDeploy}
      canExecute={canExecuteTop}
      fallbackRole={userRole}
    />
  );

  // Per-project KPI strip — only when a project context is in scope (per-PROJECT,
  // never per-account). The strip is per-project, not per-table, so it shows even
  // with no table selected; it self-hides (renders null) when the rollup isn't
  // provisioned. No project id → no strip (don't invent one). The role chip is
  // ALWAYS shown (project-independent), so the slot itself is always defined —
  // otherwise the chip would vanish on projectless views (RightTabPanel only
  // renders the kpi slot when truthy).
  const kpiStrip = (
    <div className="space-y-2">
      {roleChip}
      {projectId ? <ProjectKpiStrip projectId={projectId} compact /> : null}
    </div>
  );
  const quickActions: QuickAction[] = [];
  if (canCreate.allowed || canCreate.loading) {
    quickActions.push({
      id: 'create',
      label: 'Add column',
      icon: Plus,
      onClick: () => { onTabChange('actions'); onFocusAction('add_column'); },
    });
  }
  if (canApprove.allowed || canApprove.loading) {
    // The only approval flow in this panel is the Deploy pipeline's request step,
    // so "Review & approve" focuses that tab (named for the destination, honestly).
    quickActions.push({
      id: 'approve',
      label: 'Review & approve',
      icon: CheckCircle,
      onClick: () => onTabChange('deploy'),
    });
  }
  if (canDeploy.allowed || canDeploy.loading) {
    quickActions.push({
      id: 'deploy',
      label: 'Deploy',
      icon: Rocket,
      tone: 'primary',
      // Deploy is now a docked tab (the embedded 8-step stepper), not a modal:
      // switch to it instead of opening a popup. `onOpenDeployModal` is retained
      // for back-compat but the page now also routes it to this same tab.
      onClick: () => onTabChange('deploy'),
    });
  }

  // Six docked sections — bodies kept verbatim from the previous panel. Each
  // guards on `selectedTable` so an unselected table shows the same empty state
  // across every section (behaviour preserved from the old inline tab content).
  // Each section is a data-modelling / cataloging AXIS. `label` is the axis name
  // (mode-aware for the first one), `description` is the icon-rail tooltip, and
  // `help` powers the "?" popover next to the active section title. A visible
  // one-line <AxisIntro> at the top of each body states the axis + its actions so
  // the panel is self-explaining without a hover. NOTE: `id`s are FROZEN — they are
  // the shared RightBarTab union that page.tsx keys its state/severity/quick-actions
  // on. This is a labelling/clarity pass, not an id/data-flow change.
  const sections: RightTabSection[] = [
    {
      id: 'actions', icon: Zap, label: primaryLabel,
      description: selectedTable
        ? 'Everything you can do to this table — structure, keys, ingestion, governance and release.'
        : 'Project overview — model health, tables, relations and release readiness.',
      help: selectedTable
        ? 'The table hub. Draft modelling changes (rename, keys, relations), configure ingestion, apply masking/RLS, and add changes to a release. Every mutating action is role-gated and queued for deploy.'
        : 'With no table selected this is the project roll-up: model health, table/relation counts, data-quality, PII risk, cost impact and release readiness. Pick a table on the left to act on it.',
      render: () => selectedTable ? (
        <>
          <AxisIntro icon={Zap} text={`Act on ${tableName}: modelling, keys, ingestion, governance and release — all queued for deploy.`} />
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
            onNodeAction={onNodeAction}
          />
        </>
      ) : empty,
    },
    {
      id: 'ai', icon: Brain, label: 'AI Assist',
      description: 'Classify columns and ask the AI about this table and model.',
      help: 'AI helpers for modelling: auto-classify columns (identifiers, measures, PII, dates…) and a free-text assistant that answers questions about the table, its policies and quality. Suggestions appear even before a table is picked.',
      render: () => (
        <div>
          <AxisIntro icon={Brain} text="Auto-classify columns and ask the AI about this table's structure, quality and governance." />
          {/* AI-prefilled cross-module CTA blocks (deep-link with intent), scoped
              to explore-design + the selected object / active project. Shown above
              the per-table AI assist so suggestions exist even before a table is
              picked. */}
          <div className="p-4 pb-0">
            <AiActionBlocks
              context={{
                scope: 'module',
                module: 'explore_design',
                objectFqn: fqn || undefined,
                projectId: projectId ?? undefined,
              }}
              title="Suggested AI actions"
            />
          </div>
          {selectedTable ? (
            <AIAssistPanel
              table={selectedTable}
              columns={tableColumns}
              classifications={classifications}
              classificationDetails={classificationDetails}
              isClassifying={isClassifying}
              classifyUnavailable={classifyUnavailable}
              onRunClassify={onRunClassify}
            />
          ) : empty}
        </div>
      ),
    },
    {
      id: 'quality', icon: BarChart3, label: 'Data Quality',
      description: 'Profiling results and freshness / completeness monitoring.',
      help: 'The data-quality axis: quality score, null columns, primary-key candidate and freshness. Run profiling on demand and draft freshness monitoring (applied on deploy). Read-only for viewers.',
      render: () => selectedTable
        ? <QualityPanel table={selectedTable} columns={tableColumns} projectId={projectId} profileData={profileData} onAddEvent={onAddEvent} ingestionTrace={ingestionTrace ?? null} />
        : empty,
    },
    {
      // Per-PROJECT cost & KPIs — read-only rollup (runs · cost · perf · recos ·
      // storage) from `useProjectRollup`, via the shared ProjectKpiStrip. Gated on
      // `projectId` (NOT `selectedTable`): these are project-level, not per-table,
      // so the tab is useful even with nothing selected. The strip renders honest
      // "—" for null/unprovisioned KPIs and self-hides (renders null) on a 404/501
      // — i.e. when the rollup route isn't provisioned the body is simply empty.
      id: 'cost', icon: Coins, label: 'Impact & Cost',
      description: 'Per-project cost, usage, savings and KPI roll-up.',
      help: 'Project-level (not per-table) economics: runs, cost, performance, recommendations and storage, plus AI credits saved / ROI and the most-recent ingestion run. Read-only; "—" means not yet provisioned for this project.',
      render: () => projectId ? <CostKpiPanel projectId={projectId} /> : <SelectProjectEmpty />,
    },
    {
      // Read-only Governance & Access status. Mirrors the dedupe contract: the
      // WRITE/apply path stays in the Actions tab Governance group
      // (PoliciesCard/PolicyAssignmentPanel); this section only DISPLAYS what
      // governance is queued/applied and which roles it affects. Its single CTA
      // deep-links back to that Actions group (onTabChange + onFocusAction).
      id: 'governance', icon: Shield, label: 'Governance',
      description: 'Masking, row-level security and access on this table.',
      help: 'The governance axis (read-only status): which masking / row-access / aggregation policies are queued this session vs. live on the object, and which roles they affect. Apply new policies from the Table tab.',
      render: () => selectedTable ? (
        <>
          <AxisIntro icon={Shield} text="Masking, row-level security and access on this table — apply new policies from the Table tab." />
          <GovernanceAccessPanel
            table={selectedTable}
            columns={tableColumns}
            projectId={projectId}
            onApplyPolicy={() => { onTabChange('actions'); onFocusAction('policies'); }}
          />
        </>
      ) : empty,
    },
    {
      // Release (deploy) tab body. The page injects the embedded multi-step
      // deployment stepper via `deployOverride` (docked, no modal) — rendered
      // regardless of table selection since deployment is project/event-scoped.
      // Fallback: the legacy inline `DeployPanel` (table-gated) when no override.
      // NOTE: id stays 'deploy' (frozen union / page width logic); only the
      // user-facing label is the axis name 'Release'.
      id: 'deploy', icon: Rocket, label: 'Release',
      description: 'Review, validate and deploy the pending changes.',
      help: 'The release axis: a guided pipeline over the changes queued in this project — review the DDL/SQL, run pre-checks and a dry-run, analyse downstream impact, then execute the deploy and post-verify. Project/release-scoped, not per-table.',
      render: () => deployOverride ?? (selectedTable ? (
        <DeployPanel
          projectId={projectId}
          pendingEventsCount={pendingEventsCount}
          pendingEvents={pendingEvents}
          database={selectedDatabase}
          schema={selectedSchema}
        />
      ) : empty),
    },
    {
      id: 'history', icon: Clock, label: 'History',
      description: 'Timeline of changes, deploys and events.',
      help: 'The audit trail for this table: modelling edits, policy changes, ingestion runs and deploys, grouped by day with actor and status. Read-only.',
      render: () => selectedTable ? (
        <>
          <AxisIntro icon={Clock} text="Timeline of changes, deploys and events for this table — most recent first." />
          <HistoryPanel events={historyEvents} />
        </>
      ) : empty,
    },
    {
      // Kept as a small, secondary help affordance (last on the rail) rather than a
      // primary modelling axis. Each axis also carries its own inline "?" popover
      // (the section `help` above), so this tab is a fallback, not the main guide.
      id: 'help', icon: HelpCircle, label: 'Help',
      description: 'What this table is and recommended next steps.',
      help: 'A guided summary for this table — what it is, recommended next modelling steps, and a governance readiness checklist. Every other tab also has its own "?" for axis-specific help.',
      render: () => selectedTable ? <HelpPanel table={selectedTable} /> : empty,
    },
  ];

  // Both branches stay MOUNTED and toggle via `hidden`. Keeping RightTabPanel
  // mounted across collapse/expand is deliberate: its section-restore effect runs
  // once per mount, so an unmount-on-collapse ternary would re-restore (and revert
  // an explicit tab choice) on every expand. Visibility toggling preserves the old
  // "restore once on page-load mount" behaviour and lets the many openers that set
  // a tab + open (mini-rail icons, the page's Add Column / Policies / Deploy
  // quick-actions) land on the section they asked for.
  return (
    <div className="flex h-full shrink-0" style={{ flexShrink: 0, flexGrow: 0 }}>
      {/* Collapsed mini-rail — re-expands the panel (and jumps to a section). */}
      <div className={cn('w-12 border-l border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 flex flex-col items-center py-2 gap-1', isOpen && 'hidden')}>
        <button
          onClick={onToggle}
          className="p-2 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 mb-2"
          title="Expand panel"
          aria-label="Expand panel"
        >
          <PanelRight className="h-4 w-4" />
        </button>
        {sections.map((tab) => {
          const Icon = tab.icon;
          const severity = tabSeverity?.[tab.id as RightBarTab];
          return (
            <Tooltip key={tab.id} content={tab.description ?? tab.label} placement="left">
              <button
                onClick={() => { onTabChange(tab.id as RightBarTab); onToggle(); }}
                aria-label={tab.label}
                aria-pressed={false}
                className="relative p-2 rounded-lg transition-colors text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-600"
              >
                <Icon className="h-4 w-4" />
                {severity && (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute right-1 top-1 h-1.5 w-1.5 rounded-full ring-1 ring-white dark:ring-slate-900',
                      RAIL_SEVERITY_DOT[severity],
                    )}
                  />
                )}
              </button>
            </Tooltip>
          );
        })}
      </div>

      <div className={cn(!isOpen && 'hidden')}>
        <RightTabPanel
          // Honest header: with a table selected the title is its name (fqn in the
          // subtitle); with nothing selected the panel is the project overview, not
          // "Table actions".
          title={selectedTable ? tableName : 'Overview'}
          subtitle={selectedTable ? fqn : 'Project model & release'}
          accentClassName="bg-blue-500"
          kpiStrip={kpiStrip}
          quickActions={quickActions}
          sections={sections}
          activeSection={activeTab}
          onSectionChange={(id) => onTabChange(id as RightBarTab)}
          // Escape collapses only when open — never expands a collapsed (hidden) panel.
          onClose={() => { if (isOpen) onToggle(); }}
          storageKey={ACTIVE_TAB_KEY}
          // The Deploy tab hosts the full 8-step wizard — it needs room to
          // breathe (horizontal stepper with labels + the review/diff/impact
          // content). Widen the docked panel only while Deploy is active; all
          // other sections stay at the compact rail width.
          widthClassName={activeTab === 'deploy' ? 'w-[720px] max-w-[60vw]' : 'w-[380px]'}
          // Deploy hosts a pinned Back/Next footer — cap the panel shorter so it
          // fits at its flow position and the footer stays on-screen without
          // scrolling the page (the default cap let the footer fall ~86px below
          // the fold). Other tabs keep the taller default.
          maxHeightClassName={activeTab === 'deploy' ? 'max-h-[calc(100vh-13rem)]' : undefined}
          footer={
            analystSlot ? (
              <div className="max-h-56 overflow-y-auto">{analystSlot}</div>
            ) : undefined
          }
        />
      </div>
    </div>
  );
}

// Shown in any section when no table is selected (same copy as before).
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-slate-400 px-6 text-center">
      <Info className="h-8 w-8 mb-3 text-slate-300" />
      <p className="text-sm font-medium">Select a table</p>
      <p className="text-xs mt-1">Choose a table from the list to see contextual actions</p>
    </div>
  );
}

// Project-scoped empty for the Cost & KPIs tab. The cost rollup is per-PROJECT,
// not per-table, so the table-centric EmptyState copy would be misleading here —
// the only thing this tab needs is a project context.
function SelectProjectEmpty() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-slate-400 px-6 text-center">
      <Coins className="h-8 w-8 mb-3 text-slate-300" />
      <p className="text-sm font-medium">Select a project</p>
      <p className="text-xs mt-1">Choose a project to see its cost &amp; KPI rollup</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Role-context: capability tier derived from the Action-RBAC allow-set.
// ---------------------------------------------------------------------------
//
// One source of truth for the "what can THIS user do here" label, reused by the
// top-of-bar chip, the read-only Actions view, and per-tab hints. We derive a
// human tier from CAPABILITIES (not the raw role string): deploy ⇒ Owner,
// create ⇒ Editor, otherwise Viewer (read-only). `canExecute` (run/refresh) is
// tracked separately so an execute-only viewer is still told they can run jobs.
type CapResult = { allowed: boolean; loading: boolean; d360Role: string | null };

function deriveCapability(caps: {
  canCreate: CapResult; canApprove: CapResult; canDeploy: CapResult; canExecute: CapResult;
}) {
  const loading = caps.canCreate.loading || caps.canDeploy.loading;
  // Fail-open during load mirrors useCanPerform (`allowed || loading`).
  const can = (c: CapResult) => c.allowed || c.loading;
  const write = can(caps.canCreate);
  const deploy = can(caps.canDeploy);
  const approve = can(caps.canApprove);
  const execute = can(caps.canExecute);
  const tier = deploy ? 'Owner' : write ? 'Editor' : 'Viewer';
  const verb = deploy ? 'can deploy' : write ? 'can edit' : 'read-only';
  const role =
    caps.canDeploy.d360Role || caps.canCreate.d360Role || caps.canApprove.d360Role || null;
  return { loading, tier, verb, write, deploy, approve, execute, role };
}

function RoleContextChip({ canCreate, canApprove, canDeploy, canExecute, fallbackRole }: {
  canCreate: CapResult; canApprove: CapResult; canDeploy: CapResult; canExecute: CapResult;
  fallbackRole?: string;
}) {
  const cap = deriveCapability({ canCreate, canApprove, canDeploy, canExecute });
  // While the allow-set is still resolving, show a neutral, non-committal pill
  // rather than flashing a wrong tier.
  if (cap.loading) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-400">
        <Loader size="sm" className="h-2.5 w-2.5" /> Checking access…
      </span>
    );
  }
  const tone =
    cap.tier === 'Owner'
      ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400'
      : cap.tier === 'Editor'
      ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
      : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400';
  const TierIcon = cap.tier === 'Owner' ? Rocket : cap.tier === 'Editor' ? Edit2 : Eye;
  const tip = (
    <div className="space-y-0.5 text-left">
      <p className="font-semibold">{cap.tier} · {cap.verb}</p>
      <p>Create / edit: {cap.write ? 'yes' : 'no'}</p>
      <p>Approve: {cap.approve ? 'yes' : 'no'}</p>
      <p>Deploy: {cap.deploy ? 'yes' : 'no'}</p>
      <p>Run / refresh: {cap.execute ? 'yes' : 'no'}</p>
      {(cap.role || fallbackRole) && <p className="opacity-70">Role: {cap.role || fallbackRole}</p>}
    </div>
  );
  return (
    <Tooltip content={tip} placement="bottom">
      <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold cursor-default', tone)}>
        <TierIcon className="h-2.5 w-2.5" aria-hidden />
        {cap.tier} · {cap.verb}
      </span>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// A0a. Last Ingestion Run card — compact row showing most-recent run stats.
// ---------------------------------------------------------------------------
//
// Fetches once on mount (limit=1). Both rows_affected and duration_seconds
// are nullable — honest "—" on null or empty list; never a fake 0.
function LastIngestionCard({ projectId }: { projectId: string }) {
  const [run, setRun] = useState<IngestionRun | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    listIngestionRuns(projectId, { limit: 1 })
      .then((res) => { if (!cancelled) setRun(res.runs[0] ?? null); })
      .catch(() => { /* silent — "—" is shown for absent data */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  const fmtRows = (n: number | null | undefined) =>
    n == null ? '—' : n.toLocaleString();
  const fmtDur = (s: number | null | undefined) => {
    if (s == null) return '—';
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  };

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-2">
      <div className="flex items-center gap-2">
        <RefreshCw className="h-4 w-4 text-cyan-500" />
        <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Last Ingestion Run</h4>
        {loading && <RefreshCw className="h-3 w-3 animate-spin text-slate-400 ml-auto" />}
      </div>
      {!loading && !run ? (
        <p className="text-[11px] text-slate-400">No ingestion runs recorded for this project.</p>
      ) : (
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
            <p className="text-[10px] text-slate-500 mb-0.5">Status</p>
            <p className={cn(
              'text-xs font-semibold',
              run?.status === 'SUCCESS' ? 'text-emerald-600 dark:text-emerald-400'
                : run?.status === 'FAILED' ? 'text-red-500'
                : run?.status === 'IN_PROGRESS' ? 'text-blue-500'
                : 'text-slate-500',
            )}>
              {run?.status ?? '—'}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
            <p className="text-[10px] text-slate-500 mb-0.5">Rows</p>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {fmtRows(run?.rows_affected)}
            </p>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 rounded-lg p-2">
            <p className="text-[10px] text-slate-500 mb-0.5">Duration</p>
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              {fmtDur(run?.duration_seconds)}
            </p>
          </div>
        </div>
      )}
      {run?.executed_at && (
        <p className="text-[10px] text-slate-400 text-right">
          {relativeTimeShort(run.executed_at)}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// A0. Cost & KPIs Panel (read-only per-project rollup)
// ---------------------------------------------------------------------------
//
// Read-only. Reuses the shared `ProjectKpiStrip` (which consumes the existing
// `useProjectRollup(projectId)` hook — no new service). The strip already:
//   · renders honest "—" for any null/unprovisioned KPI (never a fake 0),
//   · self-hides (returns null) on a 404/501 unprovisioned rollup route, and
//   · scopes everything per-PROJECT (never per-account).
// Non-compact (labels visible) differentiates this tab from the compact strip
// already docked in the panel header. Limited to the spec'd five dimensions:
// runs · cost · perf · recos · storage.
//
// Below the strip: AiSavingsDashboard (credits saved, ROI multiplier, per-feature
// breakdown including warehouse_sizing savings if any) + LastIngestionCard
// (rows and duration of the most-recent ingestion run).
function CostKpiPanel({ projectId }: { projectId: string }) {
  return (
    <div className="p-4 space-y-4">
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-amber-500" />
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Project KPIs</h4>
        </div>
        <p className="text-[11px] text-slate-500">
          Per-project rollup — runs, cost, performance, recommendations and storage.
          Read-only; "—" means not yet provisioned for this project.
        </p>
        <ProjectKpiStrip
          projectId={projectId}
          dimensions={['runs', 'cost', 'perf', 'recos', 'storage']}
        />
      </div>

      {/* Value & ROI — AI credits saved, ROI multiplier, per-feature savings
          (warehouse_sizing savings surface here via by_feature row). */}
      <AiSavingsDashboard projectId={projectId} />

      {/* Last Ingestion Run — rows affected + duration, honest "—" on null. */}
      <LastIngestionCard projectId={projectId} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// A. Actions Panel
// ---------------------------------------------------------------------------

function ActionsPanel({ table, columns, projectId, focusedAction, onFocusAction, onAddEvent, classifications, userRole, database, onDeselectTable, onNodeAction }: {
  table: TableItem; columns: ColumnInfo[]; projectId: string | null;
  focusedAction: FocusedAction; onFocusAction: (a: FocusedAction) => void;
  onAddEvent: (e: any) => void; classifications?: Record<string, string>;
  userRole?: string; database?: string; onDeselectTable?: () => void;
  /** Modeling-only canvas-action bridge (T1). Undefined in catalog view. */
  onNodeAction?: (tableId: string, action: string) => void;
}) {
  const piiCount = columns.filter((c) => c.isSensitive).length;
  // System 2 Action-RBAC (replaces the old hardcoded Snowflake-role allow-lists).
  // Project-scoped via the active explore-design project. While the allow-set is
  // still loading we keep controls enabled (fail-open) to avoid a flash of
  // disabled buttons; the gate tightens once permissions resolve, and useCanPerform
  // also fail-opens on a hard backend error so a hiccup never locks a user out.
  const writePerm = useCanPerform('explore_design', 'create', projectId);
  const approvePerm = useCanPerform('explore_design', 'approve', projectId);
  const deployPerm = useCanPerform('explore_design', 'deploy', projectId);
  const executePerm = useCanPerform('explore_design', 'execute', projectId);
  const canWrite = writePerm.allowed || writePerm.loading;
  const canApprove = approvePerm.allowed || approvePerm.loading;
  const canDeploy = deployPerm.allowed || deployPerm.loading;
  // Distinct from canWrite: running/refreshing an existing object is `execute`,
  // not `create` — so a role granted execute-only can run without modelling rights.
  const canExecute = executePerm.allowed || executePerm.loading;
  const isStage = table.table.startsWith('@') || table.schema === 'STAGES' || (table as any).objectType === 'STAGE';
  const isView = (table as any).objectType === 'VIEW' || table.table.startsWith('V_');
  const isDynamicTable = (table as any).objectType === 'DYNAMIC_TABLE' || table.table.startsWith('DT_');
  const isStream = (table as any).objectType === 'STREAM';
  const hasPK = columns.some((c) => c.isPrimaryKey);
  const policiesRef = useRef<HTMLDivElement>(null);
  const ingestionRef = useRef<HTMLDivElement>(null);
  const addColRef = useRef<HTMLDivElement>(null);
  const [detectingPipes, setDetectingPipes] = useState(false);
  const [listingFiles, setListingFiles] = useState(false);
  const [loadingDdl, setLoadingDdl] = useState(false);

  useEffect(() => {
    if (focusedAction === 'policies') policiesRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (focusedAction === 'ingestion') ingestionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (focusedAction === 'add_column') addColRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [focusedAction]);

  // Read-only experience — when the user has NO write permission (and we're past
  // loading: `canWrite` already folds in `writePerm.loading`, so `!canWrite`
  // never flashes during the in-flight allow-set). Instead of a wall of greyed
  // write buttons, render a tidy notice + ONE primary "Request edit access" CTA
  // and keep the genuinely READ-only affordances visible (governance posture,
  // impact review, profiling pointer, access context). Placed AFTER all hooks so
  // rules-of-hooks hold. The full write-path render below is untouched for
  // write users (every handler preserved byte-for-byte).
  if (!canWrite) {
    return (
      <ReadOnlyActions
        table={table}
        columns={columns}
        projectId={projectId}
        userRole={userRole}
        canExecute={canExecute}
        onAddEvent={onAddEvent}
      />
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* 0. Modeling actions (T1 unification — modeling view only).
          These are the table actions the retired standalone TableOptionsSidebar
          carried that the cockpit didn't already cover. They dispatch through the
          SAME handleNodeContextAction path the node menu used (`onNodeAction`), so
          FK/relation linking modes, the PK picker, duplicate, and the DE-table
          modals all behave identically. Gated on `onNodeAction` so it never shows
          in the catalog view (no canvas / no dispatch bridge there). Mutating rows
          are gated by `canWrite`; `exclude` is destructive → `canApprove`. */}
      {onNodeAction && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Boxes className="h-4 w-4 text-blue-500" />
            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Modeling actions</h4>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Structure</p>
            <div className="flex flex-wrap gap-1.5">
              <ActionBtn label="Rename" icon={Edit2} disabled={!canWrite} onClick={() => onNodeAction(table.id, 'rename')} />
              <ActionBtn label="Duplicate" icon={Copy} disabled={!canWrite} onClick={() => onNodeAction(table.id, 'duplicate')} />
              <ActionBtn label="Set primary key" icon={Key} disabled={!canWrite} onClick={() => onNodeAction(table.id, 'pk_config')} />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Keys &amp; relations</p>
            <div className="flex flex-wrap gap-1.5">
              <ActionBtn label="Create foreign key" icon={Link2} disabled={!canWrite} onClick={() => onNodeAction(table.id, 'fk_config')} />
              <ActionBtn label="Create relation" icon={ArrowRight} disabled={!canWrite} onClick={() => onNodeAction(table.id, 'relation')} />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Governance</p>
            <div className="flex flex-wrap gap-1.5">
              <ActionBtn label="Apply tags" icon={Tag} disabled={!canWrite} onClick={() => onNodeAction(table.id, 'tags')} />
              <ActionBtn label="Apply aggregation" icon={Database} disabled={!canWrite} onClick={() => onNodeAction(table.id, 'aggregation')} />
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Data engineering</p>
            <div className="flex flex-wrap gap-1.5">
              <ActionBtn label="Dynamic table" icon={Boxes} disabled={!canWrite} onClick={() => onNodeAction(table.id, 'dynamic_table')} />
              <ActionBtn label="Event table" icon={Activity} disabled={!canWrite} onClick={() => onNodeAction(table.id, 'event_table')} />
              <ActionBtn label="Hybrid table" icon={Layers} disabled={!canWrite} onClick={() => onNodeAction(table.id, 'hybrid_table')} />
            </div>
          </div>

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
            <ActionBtn label="Exclude from model" icon={Trash2} disabled={!canApprove} onClick={() => { onNodeAction(table.id, 'exclude'); onDeselectTable?.(); }} />
          </div>
        </div>
      )}

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
          <ActionBtn label="Run refresh" icon={Play} disabled={!canExecute} onClick={() => {
            onAddEvent({ type: 'INGESTION_MODE_SET', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: { mode: 'full_refresh' } });
            toast.success('Refresh added — review in Deploy tab');
          }} />
          <ActionBtn label="Detect pipes" icon={Search} loading={detectingPipes} onClick={async () => {
            if (detectingPipes) return;
            setDetectingPipes(true);
            try {
              const { listStreams, listDynamicTables } = await import('@/app/services/explore-design/de-objects');
              const [streams, dynTables] = await Promise.allSettled([
                listStreams(table.database, table.schema),
                listDynamicTables(table.database, table.schema),
              ]);
              const sCount = streams.status === 'fulfilled' ? (streams.value?.streams?.length || 0) : 0;
              const dCount = dynTables.status === 'fulfilled' ? (dynTables.value?.dynamic_tables?.length || 0) : 0;
              toast.success(`Found ${sCount} streams, ${dCount} dynamic tables in ${table.schema}`);
            } catch (e: any) { toast.error(toServiceError(e, 'Detection failed').message); } finally { setDetectingPipes(false); }
          }} />
        </div>
        {/* Add as data-product asset vs. link to project — two distinct flows
            (PRODUCT_ASSET_ADDED publishes the table into a data product; TABLE_SELECTED
            attaches it to the active project). Labels disambiguated; events unchanged. */}
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
          <p className="text-[10px] text-slate-400">Publish to a data product, or attach to this project.</p>
          <div className="flex flex-wrap gap-1.5">
            <ActionBtn label="Add as data-product asset" icon={Plus} disabled={!canWrite} onClick={() => {
              onAddEvent({ type: 'PRODUCT_ASSET_ADDED', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: { assetType: 'table' } });
              toast.success(`${table.table} added to product draft`);
            }} />
            <ActionBtn label="Link to project" icon={Rocket} disabled={!canWrite} onClick={() => {
              onAddEvent({ type: 'TABLE_SELECTED', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: {} });
              toast.success(`${table.table} linked to project`);
            }} />
          </div>
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
          {/* Same QUALITY_GATE_SET event as the Quality tab CTA — no real DMF SQL
              emitted yet (deployment-utils default branch), so labelled as
              "monitoring" not a "quality rule" until the deploy path lands. */}
          <RecoItem text="Set up freshness monitoring" cta="Set up" onClick={() => {
            onAddEvent({ type: 'QUALITY_GATE_SET', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: { gateType: 'freshness', maxAgeHours: 24, column: columns.find((c) => c.dataType === 'TIMESTAMP' || c.dataType === 'DATE')?.name || 'UPDATED_AT' } });
            toast.success('Freshness monitoring added to draft');
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
            <ActionBtn label="List files" icon={Eye} loading={listingFiles} onClick={async () => {
              if (listingFiles) return;
              setListingFiles(true);
              try {
                const { listSnowflakeStageFiles } = await import('@/app/(dashboard)/data-source-connection/connectionServices');
                const res = await listSnowflakeStageFiles(table.table);
                toast.success(`${res?.files?.length || 0} files in stage`);
              } catch (e: any) { toast.error(toServiceError(e, 'Failed to list stage files').message); } finally { setListingFiles(false); }
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
            <p>Access: <span className="font-medium text-slate-700 dark:text-slate-300">{userRole || '—'}</span></p>
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
            <ActionBtn label="View DDL" icon={FileText} loading={loadingDdl} onClick={async () => {
              if (loadingDdl) return;
              setLoadingDdl(true);
              try {
                const api = await import('@/app/services/api/exploreDesignApi');
                const res = await api.sqlDiff(projectId || '', { database: table.database, schema_name: table.schema, event_ids: [] });
                toast.success(`DDL: ${res?.diffs?.length || 0} changes found`);
              } catch (e: any) { toast.error(toServiceError(e, 'DDL diff not available — no pending changes').message); } finally { setLoadingDdl(false); }
            }} />
            <ActionBtn label="Refresh view" icon={RefreshCw} disabled={!canExecute} onClick={() => {
              onAddEvent({ type: 'VIEW_REFRESH', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: {} });
              toast.success('View refresh added — review in Deploy tab');
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
            <ActionBtn label="Refresh" icon={RefreshCw} disabled={!canExecute} onClick={() => {
              onAddEvent({ type: 'DYNAMIC_TABLE_REFRESH', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: {} });
              toast.success('Dynamic table refresh added to deployment draft');
            }} />
            <ActionBtn label="Suspend" icon={AlertTriangle} disabled={!canWrite} onClick={() => {
              onAddEvent({ type: 'DYNAMIC_TABLE_SUSPEND', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: {} });
              toast.success('Dynamic table suspend added to deployment draft');
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
                const { getStreamData } = await import('@/app/services/explore-design/de-objects');
                const data = await getStreamData(table.table, table.database, table.schema);
                toast.success(`Stream has ${data?.rows?.length || 0} pending changes`);
              } catch (e: any) { toast.error(toServiceError(e, 'Failed to read stream').message); }
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
            <ActionBtn label="Drop table" icon={AlertTriangle} disabled={!canApprove} onClick={() => {
              onAddEvent({ type: 'TABLE_DROP_REQUEST', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: { approval_required: true, reason: 'Manual request from catalog' } });
              toast.success('Drop request submitted — requires approval before execution');
              onDeselectTable?.();
            }} />
            {/* In modeling the "Exclude from model" action lives in the Modeling
                actions group above (canvas semantic: removes the node). Hiding this
                catalog-style exclude there avoids two exclude buttons in one bar. */}
            {!onNodeAction && <ActionBtn label="Exclude" icon={Lock} onClick={() => {
              onAddEvent({ type: 'TABLE_EXCLUDED', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: { approval_required: false, reason: 'Excluded from catalog' } });
              toast.success(`${table.table} exclusion added to draft`);
              onDeselectTable?.();
            }} />}
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
              const count = res?.impacts?.length || 0;
              toast.success(`Impact: ${count} downstream objects, risk ${res?.risk_score ?? 0}/100`);
            } catch (e: any) { toast.error(toServiceError(e, 'Impact analysis failed').message); }
          }} />
        </div>
      </div>

      {/* 7. Access context */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-1.5">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Access Context</p>
        <div className="grid grid-cols-2 gap-1 text-[10px]">
          <span className="text-slate-500">Role</span>
          <span className="font-medium text-slate-700 dark:text-slate-300">{userRole || '—'}</span>
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
// A1. Read-only Actions view (no write permission)
// ---------------------------------------------------------------------------
//
// Shown in place of the write-button wall when the user lacks `create`. Keeps the
// READ affordances a viewer legitimately has — governance posture (self-fetching,
// read-only), impact review (a GET), profiling (gated on `execute`), and the
// access-context summary — plus ONE primary "Request edit access" CTA.
function ReadOnlyActions({ table, columns, projectId, userRole, canExecute, onAddEvent }: {
  table: TableItem; columns: ColumnInfo[]; projectId: string | null;
  userRole?: string; canExecute: boolean; onAddEvent: (e: any) => void;
}) {
  const [requesting, setRequesting] = useState(false);
  const [loadingDdl, setLoadingDdl] = useState(false);
  const [listingFiles, setListingFiles] = useState(false);

  // Same object-type detection as the write-path ActionsPanel. A viewer keeps the
  // UNGATED READ operations these object types carry (View DDL / View changes /
  // List files) — those were previously available to everyone, so the read-only
  // branch must not drop them. onClick bodies are copied verbatim from ActionsPanel.
  const isStage = table.table.startsWith('@') || table.schema === 'STAGES' || (table as any).objectType === 'STAGE';
  const isView = (table as any).objectType === 'VIEW' || table.table.startsWith('V_');
  const isStream = (table as any).objectType === 'STREAM';

  const requestEditAccess = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      // STUB — no "request edit access" endpoint exists yet. We record the intent
      // as a draft event (visible in History/Deploy) and toast honestly. When a
      // backend access-request route lands, swap this body for the real call.
      onAddEvent({
        type: 'ACCESS_REQUESTED',
        projectId,
        target: { database: table.database, schema: table.schema, table: table.table },
        payload: { requestedRole: 'editor', reason: 'Requested edit access from explore-design' },
      });
      toast.success('Edit-access request recorded — an owner will review it');
    } finally {
      setRequesting(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* Read-only notice + primary CTA */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Eye className="h-4 w-4 text-slate-400" />
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">View-only access</h4>
        </div>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          You have view-only access to this project. You can review governance,
          impact and quality below{canExecute ? ', and run profiling' : ''} — but
          editing the model, policies and deployments needs edit access.
        </p>
        <button
          onClick={requestEditAccess}
          disabled={requesting}
          aria-busy={requesting}
          className="w-full py-2 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white transition-colors flex items-center justify-center gap-1.5"
        >
          {requesting ? <><Loader size="sm" className="h-3 w-3" /> Requesting…</> : <><Send className="h-3.5 w-3.5" /> Request edit access</>}
        </button>
      </div>

      {/* Governance posture — read-only, self-fetches + self-hides on 404/501. */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <GovernancePostureCard
          objectRef={`${table.database}.${table.schema}.${table.table}`}
          compact
          className="border-0 bg-transparent p-0 dark:bg-transparent"
        />
      </div>

      {/* Read affordances a viewer keeps */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-2">
        <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">What you can do</h4>
        <div className="flex flex-wrap gap-1.5">
          {canExecute && (
            <ActionBtn label="Run profiling" icon={BarChart3} onClick={async () => {
              try {
                const { getTableProfile } = await import('@/app/services/explore-design/de-objects');
                const res = await getTableProfile(table.database, table.schema, table.table);
                toast.success(`Profile: ${res?.row_count || 0} rows, ${res?.column_count || 0} cols, quality ${res?.overall_quality_score ?? '—'}%`);
              } catch (e: any) { toast.error(toServiceError(e, 'Profiling failed — check table access').message); }
            }} />
          )}
          <ActionBtn label="Review impact" icon={Eye} onClick={async () => {
            try {
              const api = await import('@/app/services/api/exploreDesignApi');
              const res = await api.enhancedImpactAnalysis(projectId || '', { database: table.database, schema: table.schema, table: table.table });
              const count = res?.impacts?.length || 0;
              toast.success(`Impact: ${count} downstream objects, risk ${res?.risk_score ?? 0}/100`);
            } catch (e: any) { toast.error(toServiceError(e, 'Impact analysis failed').message); }
          }} />
        </div>
        <p className="text-[10px] text-slate-400">
          Quality, Cost &amp; KPIs and History tabs are fully available in view-only mode.
        </p>
      </div>

      {/* Object-type READ operations (ungated reads, kept for viewers). */}
      {isView && (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/20 dark:bg-indigo-900/10 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-indigo-500" />
            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">View</h4>
          </div>
          <ActionBtn label="View DDL" icon={FileText} loading={loadingDdl} onClick={async () => {
            if (loadingDdl) return;
            setLoadingDdl(true);
            try {
              const api = await import('@/app/services/api/exploreDesignApi');
              const res = await api.sqlDiff(projectId || '', { database: table.database, schema_name: table.schema, event_ids: [] });
              toast.success(`DDL: ${res?.diffs?.length || 0} changes found`);
            } catch (e: any) { toast.error(toServiceError(e, 'DDL diff not available — no pending changes').message); } finally { setLoadingDdl(false); }
          }} />
        </div>
      )}

      {isStream && (
        <div className="rounded-xl border border-green-200 dark:border-green-800 bg-green-50/20 dark:bg-green-900/10 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <GitBranch className="h-4 w-4 text-green-500" />
            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Stream (CDC)</h4>
          </div>
          <ActionBtn label="View changes" icon={Eye} onClick={async () => {
            try {
              const { getStreamData } = await import('@/app/services/explore-design/de-objects');
              const data = await getStreamData(table.table, table.database, table.schema);
              toast.success(`Stream has ${data?.rows?.length || 0} pending changes`);
            } catch (e: any) { toast.error(toServiceError(e, 'Failed to read stream').message); }
          }} />
        </div>
      )}

      {isStage && (
        <div className="rounded-xl border border-cyan-200 dark:border-cyan-800 bg-cyan-50/20 dark:bg-cyan-900/10 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-cyan-500" />
            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Stage</h4>
          </div>
          <ActionBtn label="List files" icon={Eye} loading={listingFiles} onClick={async () => {
            if (listingFiles) return;
            setListingFiles(true);
            try {
              const { listSnowflakeStageFiles } = await import('@/app/(dashboard)/data-source-connection/connectionServices');
              const res = await listSnowflakeStageFiles(table.table);
              toast.success(`${res?.files?.length || 0} files in stage`);
            } catch (e: any) { toast.error(toServiceError(e, 'Failed to list stage files').message); } finally { setListingFiles(false); }
          }} />
        </div>
      )}

      {/* Access context — same honest summary as the write view */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 space-y-1.5">
        <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Access Context</p>
        <div className="grid grid-cols-2 gap-1 text-[10px]">
          <span className="text-slate-500">Role</span>
          <span className="font-medium text-slate-700 dark:text-slate-300">{userRole || '—'}</span>
          <span className="text-slate-500">Database</span>
          <span className="font-mono text-slate-700 dark:text-slate-300">{table.database}</span>
          <span className="text-slate-500">Schema</span>
          <span className="font-mono text-slate-700 dark:text-slate-300">{table.schema}</span>
          <span className="text-slate-500">Object</span>
          <span className="font-mono text-slate-700 dark:text-slate-300">{table.table}</span>
          <span className="text-slate-500">Columns</span>
          <span className="font-medium text-slate-700 dark:text-slate-300">{columns.length}</span>
          <span className="text-slate-500">Can write</span>
          <span className="font-semibold text-red-500">No</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// B. AI Assist Panel
// ---------------------------------------------------------------------------

function AIAssistPanel({ table, columns, classifications, classificationDetails, isClassifying, classifyUnavailable, onRunClassify }: {
  table: TableItem; columns: ColumnInfo[];
  classifications?: Record<string, string>;
  classificationDetails: ClassificationResult[];
  isClassifying: boolean;
  classifyUnavailable?: boolean;
  onRunClassify: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [asking, setAsking] = useState(false);
  const [answer, setAnswer] = useState<string | null>(null);
  const [askError, setAskError] = useState<string | null>(null);
  // 404/501 from the completion endpoint — honest disabled state, not an error.
  const [askUnavailable, setAskUnavailable] = useState(false);
  const hasClassifications = classifications && Object.keys(classifications).length > 0;

  const SUGGESTED = [
    'Explain this table',
    'Find missing governance',
    'Generate DQ rules',
    'Suggest calculated columns',
    'Create retail KPI mapping',
  ];

  const fqn = `${table.database}.${table.schema}.${table.table}`;

  const askAI = async () => {
    const q = prompt.trim();
    if (!q || asking) return;
    setAsking(true);
    setAskError(null);
    setAnswer(null);
    try {
      const { generateCompletion } = await import('@/app/services/cortex');
      const colList = columns
        .slice(0, 40)
        .map((c) => `${c.name} ${c.dataType}${c.isSensitive ? ' (PII)' : ''}${c.isPrimaryKey ? ' [PK]' : ''}`)
        .join(', ');
      const fullPrompt =
        'You are a Snowflake and Data360 data-modelling expert. Answer the question about ' +
        `the table ${fqn} concisely and actionably.\n\nColumns: ${colList || 'unknown'}\n\nQuestion: ${q}`;
      const res = await generateCompletion({ prompt: fullPrompt });
      setAnswer(res.response || 'No response returned.');
    } catch (err: any) {
      // 404/501 = the AI route isn't on this backend — disable quietly
      // (InsightActionButton pattern), don't surface a loud error.
      if (isUnavailable(err)) setAskUnavailable(true);
      else setAskError(err?.message || 'Ask AI failed');
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      {/* AI Classify CTA */}
      <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/30 dark:bg-purple-900/10 p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-purple-500" />
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">AI Column Classification</h4>
        </div>
        <p className="text-[11px] text-slate-500">Detect identifiers, measures, dimensions, PII, dates and more using AI.</p>
        {classifyUnavailable ? (
          <span
            role="status"
            aria-disabled="true"
            title="Not available on this backend yet"
            className="w-full py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed flex items-center justify-center gap-1.5"
          >
            <Ban className="h-3.5 w-3.5" aria-hidden /> AI Classification unavailable
          </span>
        ) : (
          <button
            onClick={onRunClassify}
            disabled={isClassifying}
            aria-busy={isClassifying}
            className="w-full py-2 text-xs font-medium rounded-lg bg-purple-600 hover:bg-purple-700 disabled:bg-purple-400 text-white transition-colors flex items-center justify-center gap-1.5"
          >
            {isClassifying ? <><Loader size="sm" className="h-3 w-3" /> Classifying...</> : <><Sparkles className="h-3.5 w-3.5" /> Run AI Classification</>}
          </button>
        )}

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
            onKeyDown={(e) => { if (e.key === 'Enter') askAI(); }}
            disabled={asking || askUnavailable}
            className="w-full pl-3 pr-9 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
          />
          <button
            onClick={askAI}
            disabled={asking || askUnavailable || !prompt.trim()}
            aria-busy={asking}
            title={askUnavailable ? 'Not available on this backend yet' : 'Ask AI'}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 disabled:opacity-40 disabled:hover:bg-transparent"
          >
            {asking ? <Loader size="sm" className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED.map((s) => (
            <button key={s} onClick={() => setPrompt(s)} className="px-2 py-1 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/30 dark:hover:text-blue-400 transition-colors">
              {s}
            </button>
          ))}
        </div>

        {/* Result / loading / error */}
        {askUnavailable && (
          <p role="status" className="flex items-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500 pt-1">
            <Ban className="h-3 w-3" aria-hidden /> AI assistant isn&apos;t available on this backend yet
          </p>
        )}
        {asking && (
          <div className="flex items-center gap-2 text-[11px] text-slate-500 pt-1">
            <Loader size="sm" className="h-3 w-3" /> Thinking...
          </div>
        )}
        {askError && !asking && (
          <div className="flex items-start gap-1.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/40 dark:bg-red-900/10 p-2 text-[11px] text-red-600 dark:text-red-400">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
            <span>{askError}</span>
          </div>
        )}
        {answer && !asking && (
          <div className="rounded-lg border border-blue-100 dark:border-blue-900/40 bg-blue-50/30 dark:bg-blue-900/10 p-2.5 text-[11px] text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
            {answer}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// C. Quality Panel
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// C0. Ingestion & Cost (selected table) — Snowpipe/COPY trace + per-table cost.
// ---------------------------------------------------------------------------
//
// Ingestion fields come from the page's single bulk ingestion trace (no fetch
// here). Cost reuses the canonical catalog SmartRightBar service
// (`getTableIngestion(...).avg_cost_credits`) — ONE call on table selection, not
// a parallel/new cost fetch and not N+1. Every field is graceful "—":
// null/absent → "—" (no-fake-0); a real numeric 0 is allowed.
function IngestionCostPanel({ table, trace }: { table: TableItem; trace: IngestionTraceEntry | null }) {
  const [credits, setCredits] = useState<number | null>(null);
  const [costLoaded, setCostLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    setCredits(null);
    setCostLoaded(false);
    // Reuse the catalog rightbar service — same per-table context the SmartRightBar
    // uses. avg_cost_credits is best-effort warehouse credits (null when absent).
    void (async () => {
      try {
        const { getTableIngestion } = await import('@/app/services/catalog/rightbar');
        const ing = await getTableIngestion(table.database, table.schema, table.table);
        if (!alive) return;
        setCredits(typeof ing?.avg_cost_credits === 'number' ? ing.avg_cost_credits : null);
      } catch {
        if (alive) setCredits(null);
      } finally {
        if (alive) setCostLoaded(true);
      }
    })();
    return () => { alive = false; };
  }, [table.database, table.schema, table.table]);

  const method = trace?.method ?? null;
  const methodLabel = method === 'SNOWPIPE' ? 'Snowpipe' : method === 'COPY' ? 'COPY' : '—';
  const lastLoad = relativeTimeShort(trace?.lastLoad) ?? '—';
  const rows7d = typeof trace?.rows7d === 'number' ? trace.rows7d.toLocaleString() : '—';
  const errors7d = typeof trace?.errors === 'number' ? trace.errors.toLocaleString() : '—';
  const hasErrors = typeof trace?.errors === 'number' && trace.errors > 0;
  const creditsLabel = credits == null ? (costLoaded ? '—' : '…') : credits.toFixed(3);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className="h-4 w-4 text-amber-500" />
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Ingestion &amp; Cost</h4>
        </div>
        <IngestionBadge entry={trace} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
          <span className="text-slate-400">Method</span>
          <p className="font-medium text-slate-700 dark:text-slate-300">{methodLabel}</p>
        </div>
        <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
          <span className="text-slate-400">Last load</span>
          <p className="font-medium text-slate-700 dark:text-slate-300">{lastLoad}</p>
        </div>
        <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
          <span className="text-slate-400">Rows loaded (7d)</span>
          <p className="font-medium text-slate-700 dark:text-slate-300">{rows7d}</p>
        </div>
        <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800">
          <span className="text-slate-400">Errors (7d)</span>
          <p className={cn('font-medium', hasErrors ? 'text-red-500' : 'text-slate-700 dark:text-slate-300')}>{errors7d}</p>
        </div>
        <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800 col-span-2">
          <span className="text-slate-400">Credits (7d)</span>
          <p className="font-medium text-slate-700 dark:text-slate-300">{creditsLabel}</p>
        </div>
      </div>
      <p className="text-[10px] text-slate-400">
        Source-load activity (Snowpipe &amp; COPY) and best-effort warehouse credits. "—" = no data.
      </p>
    </div>
  );
}

// Subtle, role-aware one-liner for a tab's intro. Keeps it quiet (slate text,
// info icon) — the goal is orientation, not a banner.
// One-line axis descriptor rendered at the very top of a section body. States what
// the axis is + the actions it offers, so each tab is self-explaining without a
// hover/click (complements the icon-rail tooltip + the "?" help popover). Carries
// its own padding since it sits above the panel's own p-4 container.
function AxisIntro({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex items-start gap-2 px-4 pt-3.5 pb-0.5">
      <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5 text-slate-400 dark:text-slate-500" aria-hidden />
      <p className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">{text}</p>
    </div>
  );
}

function QualityPanel({ table, columns, projectId, profileData, onAddEvent, ingestionTrace }: { table: TableItem; columns: ColumnInfo[]; projectId: string | null; profileData?: any; onAddEvent: (e: any) => void; ingestionTrace?: IngestionTraceEntry | null }) {
  // Role-aware hint: a viewer can read every metric here; only "Set up monitoring"
  // drafts a change (gated downstream). canWrite folds in loading (fail-open).
  const writePerm = useCanPerform('explore_design', 'create', projectId);
  const canWrite = writePerm.allowed || writePerm.loading;
  // Honest: only score/count when a real profile exists. Un-profiled tables
  // render an em-dash with neutral (slate) styling — never an asserted 100%.
  const nullCols: number | null = profileData
    ? (profileData?.columns?.filter((c: any) => (c.null_count ?? 0) > 0).length ?? 0)
    : null;
  // Only surface a PK candidate when a real primary key exists — don't present
  // an arbitrary first column as a "candidate".
  const pkCandidate = columns.find((c) => c.isPrimaryKey)?.name ?? '—';
  const qualityScore: number | null =
    profileData?.aggregate_quality_score ?? null;
  const hasScore = qualityScore != null;

  return (
    <div className="p-4 space-y-4">
      <AxisIntro icon={BarChart3} text={canWrite
        ? 'Data quality for this table — profile it and draft freshness / completeness monitoring (applied on deploy).'
        : 'Data quality for this table — all metrics are readable; setting up monitoring needs edit access.'} />
      {/* Ingestion & Cost — Snowpipe/COPY trace + per-table credits for this table. */}
      <IngestionCostPanel table={table} trace={ingestionTrace ?? null} />

      {/* Score overview */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Quality Score</h4>
          <span className={cn('text-lg font-bold', !hasScore ? 'text-slate-400' : qualityScore >= 80 ? 'text-green-600' : qualityScore >= 60 ? 'text-amber-600' : 'text-red-600')}>{hasScore ? `${qualityScore}%` : '—'}</span>
        </div>
        <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
          <div className={cn('h-full rounded-full transition-all', !hasScore ? 'bg-slate-300 dark:bg-slate-600' : qualityScore >= 80 ? 'bg-green-500' : qualityScore >= 60 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: hasScore ? `${qualityScore}%` : '0%' }} />
        </div>
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-2 gap-2">
        <MetricCard label="Null columns" value={nullCols == null ? '—' : nullCols} total={nullCols == null ? undefined : columns.length} color={nullCols == null ? 'slate' : nullCols > 0 ? 'amber' : 'green'} />
        {/* No duplicate-risk / freshness field on the profile payload — render an
            honest "—" rather than a hardcoded "Low" / "Not set" for every table. */}
        <MetricCard label="Duplicate risk" value="—" color="slate" />
        <MetricCard label="PK candidate" value={pkCandidate} color={pkCandidate === '—' ? 'slate' : 'blue'} />
        <MetricCard label="Freshness" value="—" color="slate" />
      </div>

      {/* Actions — real API calls */}
      <div className="space-y-2">
        <ActionBtn label="Run profiling" icon={BarChart3} onClick={async () => {
          try {
            const { getTableProfile } = await import('@/app/services/explore-design/de-objects');
            const res = await getTableProfile(table.database, table.schema, table.table);
            toast.success(`Profile: ${res?.row_count || 0} rows, ${res?.column_count || 0} cols, quality ${res?.overall_quality_score ?? '—'}%`);
          } catch (e: any) { toast.error(toServiceError(e, 'Profiling failed — check table access').message); }
        }} fullWidth />
        {/* "Set up monitoring" (not "Add DQ rule") until QUALITY_GATE_SET emits a
            real ADD DATA METRIC FUNCTION in deployment-utils. Today the SQL
            generator has no case for it (falls into the default branch — a comment
            only, no DMF), so this records intent / drafts a freshness watch but
            does NOT yet move DQ coverage. Honest label + honest toast until the
            deploy path lands. */}
        <ActionBtn label="Set up monitoring" icon={Plus} disabled={!canWrite} onClick={() => {
          const colName = columns.find((c) => c.dataType === 'TIMESTAMP' || c.dataType === 'DATE')?.name || columns[0]?.name || 'UPDATED_AT';
          onAddEvent({ type: 'QUALITY_GATE_SET', projectId, target: { database: table.database, schema: table.schema, table: table.table }, payload: { gateType: 'freshness', maxAgeHours: 24, column: colName } });
          toast.success(`Freshness monitoring on ${colName} added to draft`);
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
  // No-fake-0: only `hasPrimaryKey` is a real signal passed to this panel. The PK
  // step renders its true done/not-done state; the others have no signal here, so
  // they are rendered as honest guidance ("not set" — neutral, NOT a completion
  // checkbox implying tracked state we don't have). We don't thread new props in
  // just to light them up (that would be scope creep into the page).
  const steps: { label: string; done: boolean | null }[] = [
    { label: 'Confirm primary key', done: table.hasPrimaryKey },
    { label: 'Add row-level security', done: null },
    { label: 'Add calculated margin field', done: null },
    { label: 'Add freshness rule', done: null },
    { label: 'Attach changes to release', done: null },
  ];

  // Governance checklist: same honesty rule. `hasPrimaryKey` is the one verifiable
  // item; the rest have no signal in this panel → shown as "—" / "not set", never
  // a fabricated check.
  const govItems: { label: string; state: 'done' | 'unknown' }[] = [
    { label: 'Primary key set', state: table.hasPrimaryKey ? 'done' : 'unknown' },
    { label: 'Owner assigned', state: 'unknown' },
    { label: 'Masking policies reviewed', state: 'unknown' },
    { label: 'Data classification applied', state: 'unknown' },
    { label: 'Quality rules attached', state: 'unknown' },
    { label: 'Lineage verified', state: 'unknown' },
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
              {s.done === true
                ? <CheckCircle className="h-3.5 w-3.5 text-green-500 shrink-0" />
                : <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 dark:border-slate-600 shrink-0" />
              }
              <span className={cn('flex-1', s.done === true ? 'text-slate-400 line-through' : 'text-slate-700 dark:text-slate-300')}>{s.label}</span>
              {s.done === null && <span className="text-[9px] text-slate-400 shrink-0">not set</span>}
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-2">
        <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Governance Checklist</h4>
        <div className="space-y-1 text-[11px]">
          {govItems.map((g) => (
            <div key={g.label} className="flex items-center gap-2">
              {g.state === 'done'
                ? <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                : <span className="w-3 h-3 rounded-full border-2 border-slate-300 dark:border-slate-600 shrink-0" />
              }
              <span className="flex-1 text-slate-600 dark:text-slate-400">{g.label}</span>
              <span className="text-[9px] text-slate-400 shrink-0">{g.state === 'done' ? 'set' : '—'}</span>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-slate-400 pt-1">Only the primary key is verified here; "—" means not tracked in this view.</p>
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
  { id: 'deploy', label: 'Execute Deploy', icon: Rocket, desc: 'Apply changes to the data warehouse', required: true },
  { id: 'verify', label: 'Post-Verify', icon: CheckCircle, desc: 'Verify deployed objects', required: false },
];

function DeployPanel({ projectId, pendingEventsCount, pendingEvents, database, schema }: {
  projectId: string | null; pendingEventsCount: number;
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
              const tableImpacts = (r?.impacts || []).map((i: any) => ({ ...i, sourceTable: tbl }));
              allImpacts.push(...tableImpacts);
              const score = r?.risk_score ?? 0;
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
            result = { status: 'pending_approval', deployment_id: deployReq?.deployment_id, message: 'Submitted for approval. Awaiting approver action.', request: deployReq };
            setApprovalRequested(true);
            log(`Deployment submitted for approval (ID: ${result.deployment_id || '—'})`, 'success');
            setStepStatus((p) => ({ ...p, [stepId]: 'done' }));
            setStepOutput((p) => ({ ...p, [stepId]: result }));
            return;
          }
          log('Adding DDL actions...');
          let added = 0;
          const addFailures: string[] = [];
          for (const event of (pendingEvents || [])) {
            try {
              const sql = generateSnowflakeSQL(event);
              if (sql?.sql) { await api.addDDLAction(projectId, { ddl_sql: sql.sql, ddl_type: event.type, target_table: event.target?.table, description: `${event.type} on ${event.target?.table || ''}` }); added++; }
            } catch {
              // A genuine add-failure must be VISIBLE — silently skipping it led to
              // partial deployments being reported as full success.
              addFailures.push(`${event.type} on ${event.target?.table || '?'}`);
            }
          }
          if (addFailures.length) {
            log(`⚠️ ${addFailures.length} DDL action(s) failed to queue and will NOT be deployed: ${addFailures.join(', ')}`, 'error');
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
      // 404/501 = endpoint not on this backend — quiet gap, not a red error
      // (same rule as InsightActionButton's self-disable).
      if (isUnavailable(err)) {
        log(`${stepId}: not available on this backend yet`, 'info');
        setStepStatus((p) => ({ ...p, [stepId]: 'idle' }));
        setStepOutput((p) => ({ ...p, [stepId]: { unavailable: true } }));
        return;
      }
      const raw = err?.response?.data;
      const msg = raw?.detail?.message || raw?.detail || raw?.message || err?.message || 'Failed';
      const hint = typeof msg === 'string' && msg.includes('Missing') ? '\nHint: Ensure database and schema are set from a selected table.' : '';
      log(`${stepId} error: ${typeof msg === 'string' ? msg : JSON.stringify(msg).slice(0, 200)}${hint}`, 'error');
      setStepStatus((p) => ({ ...p, [stepId]: 'error' }));
      setStepOutput((p) => ({ ...p, [stepId]: { error: typeof msg === 'string' ? msg + hint : msg, raw } }));
    }
  }, [projectId, pendingEvents, pendingEventsCount, getDbSchema, log, approvalRequested, approvalNote, stepOutput.deploy]);

  return (
    <PermissionGate
      module="explore_design"
      action="deploy"
      projectId={projectId}
      title="Deployment restricted"
      description="You don't have the &quot;deploy&quot; permission on Explore &amp; Design. You can keep modelling, but applying changes to the data warehouse requires an administrator to grant deploy access."
    >
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
    </PermissionGate>
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
  if (output?.unavailable) {
    return (
      <p role="status" className="flex items-center gap-1.5 text-[10px] italic text-slate-400 dark:text-slate-500">
        <Ban className="h-3 w-3" aria-hidden /> Not available on this backend yet
      </p>
    );
  }
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
              <div key={key} className={cn('p-2 rounded-lg border', AXIS_BOX_CLASS[color] || AXIS_BOX_CLASS.blue)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <AxisIcon className={cn('h-3 w-3', AXIS_ICON_CLASS[color] || AXIS_ICON_CLASS.blue)} />
                    <span className="text-[10px] font-semibold text-slate-700 dark:text-slate-300">{label}</span>
                  </div>
                  <span className={cn('text-[10px] font-bold', AXIS_COUNT_CLASS[color] || AXIS_COUNT_CLASS.blue)}>{items.length}</span>
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
  // 404/501 from the scan endpoint — honest disabled state (no loud error).
  const [scanUnavailable, setScanUnavailable] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const [selectedCols, setSelectedCols] = useState<Set<string>>(new Set());
  const [policyType, setPolicyType] = useState<'SHA2_MASK' | 'PARTIAL_MASK' | 'FULL_MASK' | 'CUSTOM'>('SHA2_MASK');
  const piiCount = columns.filter((c) => c.isSensitive).length;

  const runPiiScan = useCallback(async () => {
    if (scanning) return; // double-submit guard
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
      if (isUnavailable(err)) setScanUnavailable(true);
      else toast.error(err?.response?.data?.detail?.message || 'PII scan failed');
    } finally {
      setScanning(false);
    }
  }, [table, scanning]);

  const tablePii = scanResult?.pii_columns?.filter((c: any) => c.table === table.table) || [];
  const tableRecos = scanResult?.by_table?.find((t: any) => t.table === table.table);
  const suggested = scanResult?.suggested_policies?.filter((p: any) => p.affected_columns?.some((c: any) => c.table === table.table)) || [];

  return (
    <div ref={ref} className={cn('rounded-xl border p-4 space-y-3 transition-colors', focused ? 'border-blue-300 dark:border-blue-700 bg-blue-50/30 dark:bg-blue-900/10' : 'border-slate-200 dark:border-slate-700')}>
      {/* Governance posture — the ONE shared read-only posture card. Self-fetches
          this object's governance (gov score · sensitive/masked/unprotected · PII
          pills · tags · policies) and hides itself on 404/501. Replaces the old
          bespoke Shield header + PII/RLS status chips (presentational posture);
          flattened so it reads as this card's header rather than nesting a card. */}
      <GovernancePostureCard
        objectRef={`${table.database}.${table.schema}.${table.table}`}
        compact
        className="border-0 bg-transparent p-0 dark:bg-transparent"
      />

      {/* Interactive — PII scan + masking/RLS drafting (kept; the posture card
          above is read-only, this is the write surface). */}
      <div className="flex items-center gap-2">
        <Lock className="h-4 w-4 text-emerald-500" />
        <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Masking &amp; RLS</h4>
      </div>

      {/* PII Scan */}
      {scanUnavailable ? (
        <span
          role="status"
          aria-disabled="true"
          title="Not available on this backend yet"
          className="w-full py-1.5 text-[11px] font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed flex items-center justify-center gap-1.5"
        >
          <Ban className="h-3 w-3" aria-hidden /> PII scan unavailable
        </span>
      ) : (
        <button onClick={runPiiScan} disabled={scanning} aria-busy={scanning} className="w-full py-1.5 text-[11px] font-medium rounded-lg border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50">
          {scanning ? <><Loader size="sm" className="h-3 w-3" /> Scanning...</> : <><Search className="h-3 w-3" /> Scan PII & Detect Policies</>}
        </button>
      )}

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

function ActionBtn({ label, icon: Icon, onClick, primary, fullWidth, disabled, loading }: {
  label: string; icon: React.ElementType; onClick: () => void; primary?: boolean; fullWidth?: boolean; disabled?: boolean; loading?: boolean;
}) {
  const isDisabled = disabled || loading;
  return (
    <button
      onClick={onClick}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg transition-colors',
        primary
          ? 'bg-blue-600 hover:bg-blue-700 text-white'
          : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800',
        fullWidth && 'w-full justify-center',
        isDisabled && 'opacity-40 cursor-not-allowed'
      )}
    >
      {loading ? <Loader variant="spinner" size="sm" className="h-3 w-3" /> : <Icon className="h-3 w-3" />}{label}
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
      <p className={cn('text-xs font-semibold', METRIC_TEXT_CLASS[color] || METRIC_TEXT_CLASS.slate)}>
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
