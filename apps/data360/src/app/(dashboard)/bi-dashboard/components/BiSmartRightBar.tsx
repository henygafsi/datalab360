'use client';

/**
 * BiSmartRightBar — the single docked right panel for the BI dashboard builder.
 *
 * Replaces the centered config POPUPS (ChartConfigModal / KpiCardConfigModal /
 * TableConfigModal). There are NO popups: a vertical icon rail on the far-right
 * edge flips the panel body between sections, mirroring WorkflowSmartPanel /
 * ObjectSmartPanel (the Data360 right-bar pattern). The panel is collapsible
 * (hidable) — collapsed it is just the 48px icon rail, and the grid reflows.
 *
 * Sections:
 *   Configure — the selected widget's source / filters / query / calculations,
 *               hosted inline via `configSlot` (the existing config form in
 *               variant="panel"). Empty state guides the user to the left palette.
 *   AI        — rule-based, never-errors proposals (pre-filled selections / CTAs).
 *   Runs      — snapshot versions + manual refresh. Honest empty states where the
 *               backend has no run history yet (404/absent → "Not available yet").
 *   Schedule  — refresh-schedule. Server-side scheduling isn't exposed yet, so it
 *               states that honestly and points at the in-bar auto-refresh.
 *   Share     — contributors / visibility (draft vs live), with a CTA to
 *               governance. Honest empty until a sharing endpoint exists.
 *   Details   — project metadata.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import {
  SlidersHorizontal,
  Plus,
  Sparkles,
  History as HistoryIcon,
  Calendar,
  Users,
  Info,
  Table2,
  Database,
  Camera,
  RefreshCw,
  Loader2,
  PanelRightClose,
  ChevronRight,
  ShieldCheck,
  ArrowUpRight,
  Rocket,
  Send,
  Trash2,
  Lock,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DashboardWidget } from '@/app/services/api/types';
import {
  listDashboardShares,
  shareDashboard,
  revokeDashboardShare,
  getDashboardCost,
  isBiRouteUnavailable,
  type DashboardShare,
  type DashboardCost,
} from '@/app/services/api/biDashboardApi';
import { getD360Roles, type D360Role } from '@/app/services/governance/fetch_roles';
import { getUsers } from '@/app/services/governance/fetch_users';
import ProjectKpiStrip from '@/app/shared/score-cards/ProjectKpiStrip';
import AiActionBlocks from '@/app/shared/command-center/AiActionBlocks';
import { useCanPerform } from '@/hooks/useCanPerform';
import { useDashboardStatus, type UseDashboardStatus } from './useDashboardStatus';

export type BiPanelSection =
  | 'configure'
  | 'add'
  | 'data'
  | 'ai'
  | 'runs'
  | 'schedule'
  | 'share'
  | 'details';

export interface AiProposal {
  id: string;
  title: string;
  rationale: string;
  href?: string;
  hrefLabel?: string;
}

interface BiSmartRightBarProps {
  projectId: string;
  projectName: string;
  projectStatus: 'draft' | 'live';
  pageCount: number;
  widgetCount: number;

  section: BiPanelSection;
  onSectionChange: (s: BiPanelSection) => void;
  collapsed: boolean;
  onCollapsedChange: (c: boolean) => void;

  /** The widget currently being configured (drives the Configure header). */
  editingWidget: DashboardWidget | null;
  /** The config form (a *ConfigModal in variant="panel"), hosted in Configure. */
  configSlot?: React.ReactNode;

  /** Distinct data sources (DB.SCHEMA.TABLE) on the active page — Overview list. */
  dataSources?: string[];

  /** The widget being drilled into (drives the Data section header). */
  drillWidget?: DashboardWidget | null;
  /** The drill-through form+result (DrillThroughPanel variant="panel"), docked. */
  drillSlot?: React.ReactNode;

  /** The docked add-widget picker (AddWidgetSection: tiles + templates). */
  addSlot?: React.ReactNode;

  /** The docked AI Build flow (AiBuildSection: prompt → grid + review). */
  aiBuildSlot?: React.ReactNode;

  onSnapshot: () => void;
  snapshotting: boolean;
  lastSnapshotId: string | null;
  onRefreshNow: () => void;
  executing: boolean;

  /** Rule-based AI proposals (never errors — deterministic). */
  aiProposals: AiProposal[];
}

const RAIL: { id: BiPanelSection; icon: LucideIcon; label: string }[] = [
  { id: 'configure', icon: SlidersHorizontal, label: 'Configure widget' },
  { id: 'add', icon: Plus, label: 'Add widgets & templates' },
  { id: 'data', icon: Table2, label: 'Drill-through data' },
  { id: 'ai', icon: Sparkles, label: 'AI Build' },
  { id: 'runs', icon: HistoryIcon, label: 'Runs & snapshots' },
  { id: 'schedule', icon: Calendar, label: 'Refresh schedule' },
  { id: 'share', icon: Users, label: 'Share & users' },
  { id: 'details', icon: Info, label: 'Project details' },
];

const SECTION_KEY = 'data360.bi.panel.section.v1';
const COLLAPSED_KEY = 'data360.bi.panel.collapsed.v1';

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
        {title}
      </h3>
      {subtitle && <p className="mt-0.5 text-[11px] text-gray-400 dark:text-gray-500">{subtitle}</p>}
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-3 py-4 text-center text-[11px] text-gray-400 dark:border-gray-700 dark:bg-gray-800/40 dark:text-gray-500">
      {children}
    </div>
  );
}

function CtaLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 rounded-md border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-[11px] font-medium text-cyan-700 transition-colors hover:bg-cyan-100 dark:border-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-300"
    >
      {label}
      <ArrowUpRight className="h-3 w-3" />
    </Link>
  );
}

export default function BiSmartRightBar({
  projectId,
  projectName,
  projectStatus,
  pageCount,
  widgetCount,
  section,
  onSectionChange,
  collapsed,
  onCollapsedChange,
  editingWidget,
  configSlot,
  dataSources,
  drillWidget,
  drillSlot,
  addSlot,
  aiBuildSlot,
  onSnapshot,
  snapshotting,
  lastSnapshotId,
  onRefreshNow,
  executing,
  aiProposals,
}: BiSmartRightBarProps) {
  const active = RAIL.find((r) => r.id === section) ?? RAIL[0];

  // Real draft/live status fetched by projectId — the `projectStatus` prop is
  // only the seed (DashboardEditor hardcodes "draft" and can't be edited here).
  const liveStatus = useDashboardStatus(projectId, projectStatus);

  // Per-project quick-actions gating (System 2 Action-RBAC). Fail-open while the
  // allow-set loads (`allowed || loading`) so the bar never flashes disabled; the
  // gate tightens once `/my-permissions` resolves (mirrors ContextRightBar).
  const canEdit = useCanPerform('bi_reporting', 'edit', projectId);
  const canPublish = useCanPerform('bi_reporting', 'publish', projectId);
  const canShare = useCanPerform('bi_reporting', 'share', projectId);
  const refreshPerm = useCanPerform('bi_reporting', 'refresh', projectId);
  const snapshotPerm = useCanPerform('bi_reporting', 'snapshot', projectId);
  const canRefresh = refreshPerm.allowed || refreshPerm.loading;
  const canSnapshot = snapshotPerm.allowed || snapshotPerm.loading;

  // Per-dashboard query cost — lazy-loaded only when the Details section is active.
  const [cost, setCost] = useState<DashboardCost | null>(null);
  const [costLoading, setCostLoading] = useState(false);
  const [costUnavailable, setCostUnavailable] = useState(false);
  useEffect(() => {
    if (section !== 'details') return;
    let alive = true;
    setCostLoading(true);
    getDashboardCost(projectId)
      .then((c) => { if (alive) setCost(c); })
      .catch((err) => {
        if (!alive) return;
        if (isBiRouteUnavailable(err)) setCostUnavailable(true);
        setCost(null);
      })
      .finally(() => { if (alive) setCostLoading(false); });
    return () => { alive = false; };
  }, [section, projectId]);

  // Persist section + collapse (versioned keys; "draft of menu" → preselect).
  useEffect(() => {
    try { window.localStorage.setItem(SECTION_KEY, section); } catch { /* ignore */ }
  }, [section]);
  useEffect(() => {
    try { window.localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0'); } catch { /* ignore */ }
  }, [collapsed]);

  const pickSection = useCallback(
    (id: BiPanelSection) => {
      if (collapsed) onCollapsedChange(false);
      onSectionChange(id);
    },
    [collapsed, onCollapsedChange, onSectionChange],
  );

  // Minimal, coherent quick-actions: each just FOCUSES an existing section
  // (Configure / Publish — in Details / Share) instead of duplicating that
  // section's logic. Role-filtered — only the actions the role can do are shown.
  const quickActions = (
    [
      (canEdit.allowed || canEdit.loading) && {
        id: 'configure',
        label: 'Configure',
        icon: SlidersHorizontal,
        onClick: () => pickSection('configure'),
      },
      (canPublish.allowed || canPublish.loading) && {
        id: 'publish',
        label: liveStatus.status === 'live' ? 'Unpublish' : 'Publish',
        icon: Rocket,
        onClick: () => pickSection('details'),
      },
      (canShare.allowed || canShare.loading) && {
        id: 'share',
        label: 'Share',
        icon: Users,
        onClick: () => pickSection('share'),
      },
    ] as ({ id: string; label: string; icon: LucideIcon; onClick: () => void } | false)[]
  ).filter(Boolean) as { id: string; label: string; icon: LucideIcon; onClick: () => void }[];

  // ── Collapsed: only the icon rail (grid gets the width back) ──
  if (collapsed) {
    return (
      <nav
        aria-label="BI panel sections (collapsed)"
        className="flex w-12 shrink-0 flex-col items-center gap-1 border-l border-gray-200 bg-gray-50 py-2 dark:border-gray-700 dark:bg-gray-800/60"
      >
        <button
          type="button"
          onClick={() => onCollapsedChange(false)}
          title="Expand panel"
          aria-label="Expand panel"
          className="mb-1 flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-200 dark:text-gray-400 dark:hover:bg-gray-700"
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
        </button>
        {RAIL.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => pickSection(item.id)}
              aria-label={item.label}
              title={item.label}
              className={cn(
                'relative flex h-9 w-9 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700',
                item.id === 'configure' && editingWidget && 'text-cyan-600 dark:text-cyan-400',
                item.id === 'data' && drillWidget && 'text-cyan-600 dark:text-cyan-400',
              )}
            >
              <Icon className="h-4 w-4" />
              {((item.id === 'configure' && editingWidget) || (item.id === 'data' && drillWidget)) && (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-cyan-500" />
              )}
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <div
      role="region"
      aria-label="BI dashboard smart panel"
      className="flex h-full w-[380px] shrink-0 border-l border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900"
    >
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between gap-2 border-b border-gray-200 px-4 py-3 dark:border-gray-700">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-cyan-600 dark:text-cyan-400">
              {active.label}
            </p>
            <h2 className="truncate text-sm font-bold text-gray-900 dark:text-white">{projectName}</h2>
          </div>
          <button
            type="button"
            onClick={() => onCollapsedChange(true)}
            title="Hide panel"
            aria-label="Hide panel"
            className="mt-0.5 shrink-0 rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>

        {/* Per-project KPI strip + role-filtered quick-actions (always per-PROJECT,
            never per-account). The strip self-hides when the rollup isn't
            provisioned; quick-actions only show what this role can do. */}
        <div
          data-testid="bi-kpi-strip"
          className="shrink-0 border-b border-gray-200 px-4 py-2.5 dark:border-gray-700"
        >
          <ProjectKpiStrip projectId={projectId} compact />
          {quickActions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {quickActions.map((qa) => {
                const Icon = qa.icon;
                return (
                  <button
                    key={qa.id}
                    type="button"
                    onClick={qa.onClick}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {qa.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Body */}
        <div
          className={cn(
            'flex-1 min-h-0',
            (section === 'configure' && configSlot) || (section === 'data' && drillSlot)
              ? 'overflow-y-auto'
              : 'overflow-y-auto p-4',
          )}
        >
          {section === 'configure' &&
            (configSlot ? (
              configSlot
            ) : (
              /* No widget selected → a purposeful Overview, not a blank prompt.
                 Name lives in the header + KPIs in the always-on strip; here we
                 surface structure (pages / widgets / sources) + visibility. */
              <div className="p-4">
                <SectionHeader title="Dashboard overview" subtitle="Structure, sources & status of this dashboard." />
                <dl className="space-y-2 text-xs">
                  <Row k="Widgets" v={String(widgetCount)} />
                  <Row k="Pages" v={String(pageCount)} />
                  <Row k="Visibility" v={<StatusPill status={liveStatus.status} />} />
                </dl>
                <div className="mt-4">
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                    Data sources
                  </p>
                  {dataSources && dataSources.length > 0 ? (
                    <ul className="space-y-1">
                      {dataSources.map((s) => (
                        <li
                          key={s}
                          className="flex items-center gap-1.5 truncate rounded-md border border-gray-200 px-2 py-1 font-mono text-[11px] text-gray-700 dark:border-gray-700 dark:text-gray-300"
                          title={s}
                        >
                          <Database className="h-3 w-3 shrink-0 text-cyan-500" />
                          <span className="truncate">{s}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <EmptyNote>No data source bound yet. Add a widget from the left palette to connect one.</EmptyNote>
                  )}
                </div>
                <p className="mt-4 text-[11px] text-gray-400 dark:text-gray-500">
                  Select a widget on the canvas (its <SlidersHorizontal className="inline h-3 w-3" /> button)
                  to configure it here — or add one from the left palette. No popups.
                </p>
              </div>
            ))}

          {section === 'add' && (
            <div>
              <SectionHeader
                title="Add widgets"
                subtitle="Charts, KPIs, tables, text & templates — configured right here."
              />
              {addSlot ?? (
                <EmptyNote>Open a dashboard page to add widgets.</EmptyNote>
              )}
            </div>
          )}

          {section === 'data' &&
            (drillSlot ? (
              drillSlot
            ) : (
              <div>
                <SectionHeader title="Drill-through data" subtitle="Inspect the rows behind a chart — right here, no popup." />
                <EmptyNote>
                  Open a chart&apos;s <Table2 className="inline h-3 w-3" /> drill-through from the canvas to load its
                  underlying rows into this panel.
                </EmptyNote>
              </div>
            ))}

          {section === 'ai' && (
            <div>
              {/* Docked AI Build — prompt → charts land directly on the grid,
                  with an Undo/Refine review list (AiBuildSection). */}
              {aiBuildSlot && (
                <div className="mb-4">
                  <SectionHeader
                    title="AI Build"
                    subtitle="Describe charts — they're generated straight onto the grid."
                  />
                  {aiBuildSlot}
                </div>
              )}
              {/* AI-prefilled cross-module CTA blocks (deep-link with intent), scoped
                  to this module + project. Rendered above the rule-based proposals. */}
              <AiActionBlocks
                context={{ scope: 'module', module: 'bi_reporting', projectId }}
                title="Actions IA suggérées"
                className="mb-4"
              />
              <SectionHeader title="AI proposals" subtitle="Ready selections you can apply — never blocks on errors." />
              {aiProposals.length === 0 ? (
                <EmptyNote>No proposals for this page yet. Add a widget or pick a data source to get suggestions.</EmptyNote>
              ) : (
                <ul className="space-y-2">
                  {aiProposals.map((p) => (
                    <li key={p.id} className="rounded-lg border border-gray-200 p-2.5 dark:border-gray-700">
                      <p className="flex items-center gap-1.5 text-xs font-semibold text-gray-800 dark:text-gray-200">
                        <Sparkles className="h-3.5 w-3.5 text-cyan-500" />
                        {p.title}
                      </p>
                      <p className="mt-1 text-[11px] text-gray-500 dark:text-gray-400">{p.rationale}</p>
                      {p.href && (
                        <div className="mt-2">
                          <CtaLink href={p.href} label={p.hrefLabel || 'Open'} />
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {section === 'runs' && (
            <div className="space-y-4">
              <SectionHeader title="Runs & snapshots" subtitle="Refresh data or save a restorable version." />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onRefreshNow}
                  disabled={!canRefresh || executing}
                  title={!canRefresh ? 'Requires the "refresh" permission on Business Reporting.' : undefined}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
                >
                  {executing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Refresh now
                </button>
                <button
                  type="button"
                  onClick={onSnapshot}
                  disabled={!canSnapshot || snapshotting}
                  title={!canSnapshot ? 'Requires the "snapshot" permission on Business Reporting.' : undefined}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-cyan-700 disabled:opacity-50"
                >
                  {snapshotting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                  Save snapshot
                </button>
              </div>
              {lastSnapshotId ? (
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Last snapshot saved this session: <span className="font-mono">{lastSnapshotId}</span>
                </p>
              ) : (
                <EmptyNote>No snapshot saved yet this session. Snapshots capture the current design as a restorable version.</EmptyNote>
              )}
              <p className="text-[11px] italic text-gray-400 dark:text-gray-500">
                Full run history (scheduled refreshes, version list) isn't exposed by the API yet.
              </p>
            </div>
          )}

          {section === 'schedule' && (
            <div className="space-y-3">
              <SectionHeader title="Refresh schedule" subtitle="When this dashboard re-queries its data." />
              <EmptyNote>
                Server-side scheduled refresh isn't available on this backend yet. Use{' '}
                <span className="font-medium">Auto</span> in the filter bar to poll on an interval, or{' '}
                <span className="font-medium">Refresh now</span> in Runs.
              </EmptyNote>
            </div>
          )}

          {section === 'share' && (
            <div className="space-y-3">
              <SectionHeader title="Share & users" subtitle="Visibility and who can see this dashboard." />
              <div className="flex items-center justify-between rounded-lg border border-gray-200 px-3 py-2 text-xs dark:border-gray-700">
                <span className="text-gray-600 dark:text-gray-300">Visibility</span>
                <StatusPill status={liveStatus.status} />
              </div>
              <ShareManager projectId={projectId} onSharesChanged={liveStatus.refresh} />
            </div>
          )}

          {section === 'details' && (
            <div className="space-y-3">
              <SectionHeader title="Project details" />
              <dl className="space-y-2 text-xs">
                <Row k="Name" v={projectName} />
                <Row k="Project ID" v={<span className="font-mono text-[11px]">{projectId}</span>} />
                <Row k="Status" v={<StatusPill status={liveStatus.status} />} />
                <Row k="Pages" v={String(pageCount)} />
                <Row k="Widgets" v={String(widgetCount)} />
              </dl>
              {/* Query cost card — GET /bi-dashboard/{id}/cost */}
              <div className="rounded-lg border border-gray-200 p-3 dark:border-gray-700">
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
                  Query cost
                </p>
                {costUnavailable ? (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">Not provisioned on this backend yet.</p>
                ) : costLoading ? (
                  <p className="text-[11px] text-gray-400 dark:text-gray-500">Loading&hellip;</p>
                ) : (
                  <dl className="space-y-1.5 text-xs">
                    <Row k="Credits" v={cost?.credits != null ? String(cost.credits) : '—'} />
                    <Row k="Bytes scanned" v={cost?.bytes_scanned != null ? fmtBytes(cost.bytes_scanned) : '—'} />
                    <Row k="Renders (30d)" v={cost?.render_activity?.render_count != null ? String(cost.render_activity.render_count) : '—'} />
                  </dl>
                )}
                {cost?.partial && !costUnavailable && (
                  <p className="mt-1.5 text-[10px] italic text-gray-400 dark:text-gray-500">
                    {cost.note ?? 'Partial — credits not directly attributable.'}
                  </p>
                )}
              </div>
              <PublishControl status={liveStatus} />
            </div>
          )}
        </div>
      </div>

      {/* Icon rail */}
      <nav
        aria-label="BI panel sections"
        className="flex w-12 shrink-0 flex-col items-center gap-1 border-l border-gray-200 bg-gray-50 py-2 dark:border-gray-700 dark:bg-gray-800/60"
      >
        {RAIL.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === section;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => pickSection(item.id)}
              aria-label={item.label}
              aria-pressed={isActive}
              title={item.label}
              className={cn(
                'relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
                isActive
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-gray-500 hover:bg-gray-200 hover:text-gray-700 dark:text-gray-400 dark:hover:bg-gray-700 dark:hover:text-gray-200',
              )}
            >
              <Icon className="h-4 w-4" />
              {((item.id === 'configure' && editingWidget) || (item.id === 'data' && drillWidget)) && !isActive && (
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-cyan-500" />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-gray-500 dark:text-gray-400">{k}</dt>
      <dd className="truncate text-right font-medium text-gray-800 dark:text-gray-200">{v}</dd>
    </div>
  );
}

function fmtBytes(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} GB`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)} KB`;
  return `${n} B`;
}

function StatusPill({ status }: { status: 'draft' | 'live' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold',
        status === 'live'
          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
      )}
    >
      {status === 'live' ? <ShieldCheck className="h-3 w-3" /> : null}
      {status === 'live' ? 'Live' : 'Draft'}
    </span>
  );
}

// ── Publishing (draft ↔ live) ───────────────────────────────────────────────

function PublishControl({ status }: { status: UseDashboardStatus }) {
  const isLive = status.status === 'live';

  // Action-RBAC gate (System 2): publish/unpublish are separate registry actions
  // on bi_reporting (backend POST /publish → 'publish', /unpublish → 'unpublish').
  // Fail-open while the allow-set loads; honest disabled + tooltip on a deny.
  const publishPerm = useCanPerform('bi_reporting', 'publish');
  const canPublish = publishPerm.allowed || publishPerm.loading;
  const unpublishPerm = useCanPerform('bi_reporting', 'unpublish');
  const canUnpublish = unpublishPerm.allowed || unpublishPerm.loading;

  const doPublish = async () => {
    try {
      const res = await status.publish();
      const n = res.notified_count ?? 0;
      toast.success(
        n > 0
          ? `Published — ${n} ${n === 1 ? 'grantee' : 'grantees'} notified via the activity log.`
          : 'Published. Share it below to notify viewers.',
      );
    } catch (err) {
      toast.error(
        isBiRouteUnavailable(err)
          ? "Publish endpoint isn't live on this backend yet."
          : "Couldn't publish the dashboard.",
      );
    }
  };

  const doUnpublish = async () => {
    try {
      await status.unpublish();
      toast.success('Reverted to draft.');
    } catch (err) {
      toast.error(
        isBiRouteUnavailable(err)
          ? "Unpublish endpoint isn't live on this backend yet."
          : "Couldn't unpublish the dashboard.",
      );
    }
  };

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 p-3 dark:border-gray-700">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-600 dark:text-gray-300">
        Publishing
      </p>
      <p className="text-[11px] text-gray-500 dark:text-gray-400">
        {isLive
          ? 'Live — visible to the people and roles it is shared with.'
          : 'Draft — only editors can see it until you publish.'}
      </p>
      {status.unavailable ? (
        <p className="text-[11px] italic text-gray-400 dark:text-gray-500">
          Publish/unpublish routes aren't provisioned on this backend yet.
        </p>
      ) : isLive ? (
        <button
          type="button"
          onClick={doUnpublish}
          disabled={status.busy || status.loading || !canUnpublish}
          title={!canUnpublish ? 'Requires the "unpublish" permission on Business Reporting.' : undefined}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
        >
          {status.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Lock className="h-3.5 w-3.5" />}
          Unpublish (back to draft)
        </button>
      ) : (
        <button
          type="button"
          onClick={doPublish}
          disabled={status.busy || status.loading || !canPublish}
          title={!canPublish ? 'Requires the "publish" permission on Business Reporting.' : undefined}
          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {status.busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Rocket className="h-3.5 w-3.5" />}
          Publish dashboard
        </button>
      )}
    </div>
  );
}

// ── Share with a user or D360 role ──────────────────────────────────────────

function ShareManager({ projectId, onSharesChanged }: { projectId: string; onSharesChanged?: () => void }) {
  // Action-RBAC gate (System 2): grant = 'share', revoke = 'revoke-share'
  // (backend POST /share, DELETE /shares/{id}). Fail-open while the allow-set
  // loads; honest disabled + tooltip on a deny.
  const sharePerm = useCanPerform('bi_reporting', 'share');
  const canShare = sharePerm.allowed || sharePerm.loading;
  const revokePerm = useCanPerform('bi_reporting', 'revoke-share');
  const canRevoke = revokePerm.allowed || revokePerm.loading;

  const [shares, setShares] = useState<DashboardShare[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);

  const [granteeType, setGranteeType] = useState<'role' | 'user'>('role');
  const [roles, setRoles] = useState<D360Role[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [selected, setSelected] = useState('');
  const [granting, setGranting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadShares = useCallback(async () => {
    setLoading(true);
    try {
      const s = await listDashboardShares(projectId);
      setShares(s);
      setUnavailable(false);
    } catch (err) {
      if (isBiRouteUnavailable(err)) setUnavailable(true);
      setShares(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void loadShares(); }, [loadShares]);

  // Roles the CURRENT user can see — via the governance roles service (scoped),
  // NOT a raw list of every Snowflake role.
  useEffect(() => {
    let alive = true;
    getD360Roles()
      .then((r) => { if (alive) setRoles(r); })
      .catch(() => { /* picker just stays empty */ });
    return () => { alive = false; };
  }, []);

  // Users loaded lazily the first time the picker switches to "user".
  useEffect(() => {
    if (granteeType !== 'user' || users.length > 0) return;
    let alive = true;
    setPickerLoading(true);
    getUsers()
      .then((u) => { if (alive) setUsers(u.map((x) => ({ id: x.id, name: x.name || x.id }))); })
      .catch(() => { /* leave empty */ })
      .finally(() => { if (alive) setPickerLoading(false); });
    return () => { alive = false; };
  }, [granteeType, users.length]);

  const options = granteeType === 'role'
    ? roles.map((r) => ({ value: r.role_name, label: r.display_name || r.role_name }))
    : users.map((u) => ({ value: u.id, label: u.name }));

  const grant = async () => {
    if (!selected) return;
    setGranting(true);
    try {
      await shareDashboard(projectId, { grantee_type: granteeType, grantee: selected });
      toast.success(`Shared with ${granteeType} "${selected}".`);
      setSelected('');
      await loadShares();
      onSharesChanged?.();
    } catch (err) {
      toast.error(
        isBiRouteUnavailable(err)
          ? "Sharing endpoint isn't live on this backend yet."
          : "Couldn't share the dashboard.",
      );
    } finally {
      setGranting(false);
    }
  };

  const revoke = async (share: DashboardShare) => {
    if (revokingId) return;
    setRevokingId(share.share_id);
    try {
      await revokeDashboardShare(projectId, share.share_id);
      toast.success(`Access removed for ${share.grantee}.`);
      await loadShares();
      onSharesChanged?.();
    } catch {
      toast.error("Couldn't revoke access.");
    } finally {
      setRevokingId(null);
    }
  };

  if (unavailable) {
    return (
      <div className="space-y-2">
        <EmptyNote>Per-dashboard sharing isn't provisioned on this backend yet.</EmptyNote>
        <CtaLink href="/governance/grants" label="Manage access in Governance" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Grant form */}
      <div className="space-y-2 rounded-lg border border-gray-200 p-2.5 dark:border-gray-700">
        <div className="flex gap-1.5">
          <select
            value={granteeType}
            onChange={(e) => { setGranteeType(e.target.value as 'role' | 'user'); setSelected(''); }}
            aria-label="Share with a role or a user"
            className="rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[11px] text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            <option value="role">Role</option>
            <option value="user">User</option>
          </select>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            aria-label="Pick who to share with"
            className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-1.5 py-1 text-[11px] text-gray-700 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-200"
          >
            <option value="">
              {pickerLoading ? 'Loading…' : `Select a ${granteeType}…`}
            </option>
            {options.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <button
          type="button"
          onClick={grant}
          disabled={!selected || granting || !canShare}
          title={!canShare ? 'Requires the "share" permission on Business Reporting.' : undefined}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md bg-cyan-600 px-2.5 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-cyan-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {granting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          Grant view access
        </button>
        {granteeType === 'role' && roles.length === 0 && (
          <p className="text-[10px] text-gray-400 dark:text-gray-500">Only roles you can see are listed.</p>
        )}
      </div>

      {/* Current shares */}
      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Current access
        </p>
        {loading ? (
          <div className="h-10 animate-pulse rounded-md bg-gray-100 dark:bg-gray-800" />
        ) : !shares || shares.length === 0 ? (
          <EmptyNote>Not shared with anyone yet. Pick a role or user above to grant view access.</EmptyNote>
        ) : (
          <ul className="space-y-1.5">
            {shares.map((s) => (
              <li
                key={s.share_id}
                className="flex items-center justify-between gap-2 rounded-md border border-gray-200 px-2.5 py-1.5 dark:border-gray-700"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className={cn(
                    'rounded px-1 py-0.5 text-[9px] font-semibold uppercase',
                    s.grantee_type === 'role'
                      ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300'
                      : 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300',
                  )}>
                    {s.grantee_type}
                  </span>
                  <span className="truncate text-[11px] font-medium text-gray-800 dark:text-gray-200">{s.grantee}</span>
                </span>
                <button
                  type="button"
                  onClick={() => revoke(s)}
                  disabled={!canRevoke || !!revokingId}
                  aria-busy={revokingId === s.share_id}
                  aria-label={`Revoke access for ${s.grantee}`}
                  title={canRevoke ? 'Revoke access' : 'Requires the "revoke-share" permission on Business Reporting.'}
                  className="shrink-0 rounded p-1 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-gray-400"
                >
                  {revokingId === s.share_id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <CtaLink href="/governance/grants" label="Advanced access in Governance" />
    </div>
  );
}
