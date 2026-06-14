'use client';

/**
 * ProjectInspectorPanel — the cross-module PROJECT right-tab (Data360 G7/G11).
 *
 * A self-contained "Adaptive Inspector" for ONE project that surfaces 100% of a
 * project's cross-module footprint in a single docked panel. It composes the
 * shared {@link RightTabPanel} (so it re-harmonises with the other 9 consumers)
 * and is fed ONLY a `projectId` (+ optional name/type) — everything else is
 * derived from the precomputed per-project rollup (`useProjectRollup` →
 * `GET /command-center/projects/{id}/rollup`). Drop-in for any project list /
 * deployment table:
 *
 *   <ProjectInspectorPanel projectId={id} projectName={name} onClose={…} />
 *
 * Sections (icon rail, left→right):
 *   • Overview  — 5-axis ADN (AdnScoreCard, compact) DERIVED from this project's
 *                 own rollup (never the account sample) + a recos summary.
 *   • Modules   — which modules the project TOUCHES (connect/explore/workflow/bi/
 *                 dq/gov), inferred from real rollup `supporting` signals with an
 *                 honest active / quiet / no-signal state + a deep link each.
 *   • Scores    — the per-dimension KPI rollup as a shared AuditTable (DQ · PERF ·
 *                 GOV · STORAGE · COST → Value · Scope · Recos · Status).
 *   • Activity  — last deploy (status + when), last activity, 30d event count.
 *
 * Header KPI strip = `<ProjectKpiStrip compact />` (Runs · Cost · Perf · Recos ·
 * DQ · GOV · Storage). Footer actions are NON-mutating (Refresh + open the recos
 * hub) so nothing is gated — there is no honest mutating action on a read-only
 * rollup, and inventing a useCanPerform key would be worse than no gate.
 *
 * Honesty rules (no fake zeros / no account data as per-project):
 *   · every null/unknown → "—" (never `?? 0`).
 *   · ADN axes lacking a per-project numeric source get a NEUTRAL band, never a
 *     high default, with the real basis surfaced in each axis `desc`.
 *   · loading → skeleton; unavailable (404/501) → a quiet "not provisioned" note,
 *     never a failing Retry; genuine error → one retry affordance.
 */
// ////dependency//// shared.score-cards.ProjectInspectorPanel → shared.score-cards.{useProjectRollup,ProjectKpiStrip}
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowUpRight,
  BadgeCheck,
  BarChart3,
  Boxes,
  Compass,
  History,
  LayoutDashboard,
  Lightbulb,
  Plug,
  RefreshCw,
  ShieldCheck,
  Workflow as WorkflowIcon,
  type LucideIcon,
} from 'lucide-react';
import cn from '@core/utils/class-names';
import RightTabPanel, {
  type RightTabSection,
  type QuickAction,
  type StatusPillSpec,
} from '@/app/shared/governance/right-tab-panel';
import AdnScoreCard, { type ScoreAxis } from '@/app/shared/command-center/AdnScoreCard';
import AuditTable from '@/app/shared/command-center/AuditTable';
import ProjectKpiStrip from '@/app/shared/score-cards/ProjectKpiStrip';
import { useProjectRollup } from '@/app/shared/score-cards/useProjectRollup';
import type {
  ProjectRollup,
  ScoreCard,
  ScoreCardDimension,
} from '@/app/services/command-center/score-cards';

// ── Public API ───────────────────────────────────────────────────────────────

export interface ProjectInspectorPanelProps {
  /** The project to inspect. Self-contained — this is all the panel needs. */
  projectId: string;
  /** Display name for the header (falls back to the id). */
  projectName?: string;
  /** Optional project type, shown as the subtitle. */
  projectType?: string;
  /** Close the panel. */
  onClose: () => void;
  /** Optional lookback window in days (defaults to the backend default, 30). */
  days?: number;
  /** Width class override for the docked panel. Defaults to `w-[400px]`. */
  widthClassName?: string;
}

const EMPTY = '—';

// ── Value helpers (local, mirrors ProjectKpiStrip formatting) ────────────────

function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function findCard(rollup: ProjectRollup, dim: ScoreCardDimension): ScoreCard | undefined {
  return rollup.cards.find((c) => c.dimension === dim);
}

function supportingOf(card: ScoreCard | undefined): Record<string, unknown> {
  return (card?.supporting ?? {}) as Record<string, unknown>;
}

function formatPct(v: number): string {
  return `${Number.isInteger(v) ? v : Math.round(v * 10) / 10}%`;
}

function formatStorage(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${Math.round(mb)} MB`;
}

function formatCredits(v: number): string {
  if (v >= 1000) return `${(v / 1000).toFixed(1)}k cr`;
  return `${v.toLocaleString(undefined, { maximumFractionDigits: 1 })} cr`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return EMPTY;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return EMPTY;
  const sec = Math.floor((Date.now() - t) / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

/** Display string for a rollup card's headline value (honest "—" when null). */
function formatCardValue(card: ScoreCard | undefined): string {
  if (!card || card.value == null) return EMPTY;
  const v = card.value;
  if (typeof v !== 'number') return String(v);
  if (card.dimension === 'storage') return formatStorage(v);
  if (card.dimension === 'cost') return formatCredits(v);
  const unit = card.unit?.trim() ?? '';
  if (unit === '%') return formatPct(v);
  const n = Number.isInteger(v) ? v.toLocaleString() : (Math.round(v * 10) / 10).toLocaleString();
  return unit ? `${n} ${unit}` : n;
}

// ── 5-axis ADN derivation (per-project, NOT the account sample) ──────────────
//
// Only DQ (coverage %) and PERF (100 − fail-rate) have a native 0-100 source.
// SEC/STORAGE/USAGE are *banded* with the SAME good/warn/bad thresholds the rest
// of the UI uses (ProjectKpiStrip), then mapped to representative band scores so
// adnTone reads emerald/amber/rose consistently. The real basis lives in `desc`.

const BAND = { good: 85, warn: 65, bad: 42, neutral: 58 } as const;

function deriveProjectAdn(rollup: ProjectRollup): ScoreAxis[] {
  const dq = findCard(rollup, 'dq');
  const perf = findCard(rollup, 'perf');
  const gov = findCard(rollup, 'gov');
  const storage = findCard(rollup, 'storage');

  // ── DQ (Qualité) — coverage % when scored per-project ──
  const dqVal = num(dq?.value);
  const dqIsProject = dq?.scope === 'project';
  const dqAxis: ScoreAxis = {
    key: 'DQ',
    label: 'Qualité',
    score: dqVal != null && dqIsProject ? Math.round(dqVal) : BAND.neutral,
    desc:
      dqVal != null && dqIsProject
        ? `Couverture qualité ${formatPct(dqVal)} sur les objets de ce projet.`
        : 'Pas de source qualité par-projet (objets non monitorés DMF).',
  };

  // ── PERF — score = 100 − fail-rate% (more runs failing → lower) ──
  const failRate = num(perf?.value);
  const totalRuns = num(supportingOf(perf).total_runs);
  const perfAxis: ScoreAxis = {
    key: 'PERF',
    label: 'Perf',
    score: failRate != null ? Math.max(0, Math.min(100, Math.round(100 - failRate))) : BAND.neutral,
    desc:
      failRate != null
        ? `Taux d'échec ${formatPct(failRate)}${totalRuns != null ? ` · ${totalRuns} run(s)` : ''}.`
        : 'Aucun run enregistré pour ce projet.',
  };

  // ── SEC (Sécurité/Gov) — banded from contributors + active RLS ──
  const contributors = num(supportingOf(gov).contributors);
  const rls = num(supportingOf(gov).active_rls_policies);
  let secScore: number = BAND.neutral;
  if (contributors === 0) secScore = BAND.bad;
  else if (rls === 0) secScore = BAND.warn;
  else if (contributors != null || rls != null) secScore = BAND.good;
  const secAxis: ScoreAxis = {
    key: 'SEC',
    label: 'Sécurité',
    score: secScore,
    desc: `${contributors ?? EMPTY} contributeur(s) · ${rls ?? EMPTY} policy RLS active(s).`,
  };

  // ── STORAGE — banded footprint (>500 MB warn), account-level → neutral ──
  const mb = num(storage?.value) ?? num(supportingOf(storage).storage_mb);
  const storageIsProject = storage?.scope === 'project';
  let storScore: number = BAND.neutral;
  if (mb != null && storageIsProject) storScore = mb > 500 ? BAND.warn : BAND.good;
  const storAxis: ScoreAxis = {
    key: 'STORAGE',
    label: 'Stockage',
    score: storScore,
    desc:
      mb != null
        ? `${formatStorage(mb)}${storageIsProject ? '' : ' (niveau compte)'}.`
        : 'Aucun objet de stockage attribuable à ce projet.',
  };

  // ── USAGE — adoption/activity over the window (events + runs) ──
  const events = num(rollup.eventCount30d);
  let usageScore: number = BAND.neutral;
  if (events != null) {
    usageScore = events === 0 ? BAND.bad : events >= 20 ? BAND.good : BAND.warn;
  }
  const usageAxis: ScoreAxis = {
    key: 'USAGE',
    label: 'Usage',
    score: usageScore,
    desc: `${events ?? EMPTY} évènement(s) sur la fenêtre${totalRuns != null ? ` · ${totalRuns} run(s)` : ''}.`,
  };

  return [dqAxis, perfAxis, secAxis, storAxis, usageAxis];
}

// ── Modules-touched derivation (inferred presence, never asserted) ───────────

type ModuleState = 'active' | 'quiet' | 'none';

interface ModuleRow {
  id: string;
  name: string;
  icon: LucideIcon;
  state: ModuleState;
  basis: string;
  href: string;
}

function deriveModules(rollup: ProjectRollup): ModuleRow[] {
  const perf = findCard(rollup, 'perf');
  const gov = findCard(rollup, 'gov');
  const dq = findCard(rollup, 'dq');
  const storage = findCard(rollup, 'storage');
  const cost = findCard(rollup, 'cost');

  const totalRuns = num(supportingOf(perf).total_runs);
  const contributors = num(supportingOf(gov).contributors);
  const rls = num(supportingOf(gov).active_rls_policies);
  const deployed = num(supportingOf(dq).deployed_objects);
  const monitored = num(supportingOf(dq).monitored_objects);
  const mb = num(storage?.value) ?? num(supportingOf(storage).storage_mb);
  const costIsProject = cost?.scope === 'project';

  return [
    {
      id: 'connect',
      name: 'Connect',
      icon: Plug,
      // No per-project ingestion signal lives in the rollup — stay honest.
      state: 'none',
      basis: 'Aucun signal d’ingestion par-projet dans le rollup.',
      href: '/sources',
    },
    {
      id: 'explore',
      name: 'Explore / Catalog',
      icon: Compass,
      state: (deployed ?? 0) > 0 || (mb ?? 0) > 0 ? 'active' : deployed === 0 ? 'quiet' : 'none',
      basis:
        deployed != null
          ? `${deployed} objet(s) déployé(s)${mb != null ? ` · ${formatStorage(mb)}` : ''}.`
          : mb != null
            ? `${formatStorage(mb)} de stockage.`
            : 'Aucun objet catalogué détecté.',
      href: '/explore-design',
    },
    {
      id: 'workflow',
      name: 'Workflow',
      icon: WorkflowIcon,
      state: totalRuns == null ? 'none' : totalRuns > 0 ? 'active' : 'quiet',
      basis:
        totalRuns == null
          ? 'Aucune donnée d’exécution.'
          : totalRuns > 0
            ? `${totalRuns} run(s) sur la fenêtre.`
            : 'Aucun run sur la fenêtre.',
      href: '/workflow',
    },
    {
      id: 'bi',
      name: 'BI / Dashboards',
      icon: BarChart3,
      // The rollup carries no BI usage signal — render the honest empty state.
      state: 'none',
      basis: 'Aucun signal BI par-projet dans le rollup.',
      href: '/bi-dashboard',
    },
    {
      id: 'dq',
      name: 'Data Quality',
      icon: BadgeCheck,
      state:
        (monitored ?? 0) > 0 ? 'active' : (deployed ?? 0) > 0 ? 'quiet' : 'none',
      basis:
        monitored != null
          ? `${monitored} objet(s) monitoré(s)${deployed != null ? ` / ${deployed} déployé(s)` : ''}.`
          : 'Aucun objet monitoré.',
      href: '/data-quality',
    },
    {
      id: 'gov',
      name: 'Governance',
      icon: ShieldCheck,
      state:
        (contributors ?? 0) > 0 || (rls ?? 0) > 0
          ? 'active'
          : contributors === 0
            ? 'quiet'
            : 'none',
      basis: `${contributors ?? EMPTY} contributeur(s) · ${rls ?? EMPTY} RLS active(s).`,
      href: '/governance/projects',
    },
  ];
}

// ── Presentational atoms ─────────────────────────────────────────────────────

const STATE_STYLE: Record<ModuleState, { dot: string; label: string; text: string }> = {
  active: { dot: 'bg-emerald-500', label: 'Active', text: 'text-emerald-700 dark:text-emerald-300' },
  quiet: { dot: 'bg-amber-400', label: 'Quiet', text: 'text-amber-700 dark:text-amber-300' },
  none: { dot: 'bg-gray-300 dark:bg-gray-600', label: EMPTY, text: 'text-gray-400 dark:text-gray-500' },
};

function ModuleItem({ m }: { m: ModuleRow }) {
  const s = STATE_STYLE[m.state];
  const Icon = m.icon;
  return (
    <Link
      href={m.href}
      title={m.basis}
      className="group flex items-center gap-2.5 rounded-lg border border-gray-200 bg-white px-2.5 py-2 transition-colors hover:border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600 dark:hover:bg-gray-800"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium text-gray-800 dark:text-gray-100">{m.name}</span>
          <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold', s.text)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', s.dot)} />
            {s.label}
          </span>
        </span>
        <span className="mt-0.5 block truncate text-[10px] text-gray-400 dark:text-gray-500">{m.basis}</span>
      </span>
      <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-gray-300 transition-colors group-hover:text-gray-500 dark:text-gray-600 dark:group-hover:text-gray-300" />
    </Link>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 px-2.5 py-2 dark:border-gray-800">
      <span className="text-[11px] text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-right text-xs font-medium text-gray-800 dark:text-gray-100">{children}</span>
    </div>
  );
}

const STATUS_TONE: Record<string, string> = {
  success: 'text-emerald-600 dark:text-emerald-400',
  completed: 'text-emerald-600 dark:text-emerald-400',
  failed: 'text-red-600 dark:text-red-400',
  error: 'text-red-600 dark:text-red-400',
  pending: 'text-amber-600 dark:text-amber-400',
  running: 'text-amber-600 dark:text-amber-400',
};

function deployStatusClass(status: string | null): string {
  if (!status) return 'text-gray-400 dark:text-gray-500';
  return STATUS_TONE[status.toLowerCase()] ?? 'text-gray-700 dark:text-gray-200';
}

function prettyScope(scope?: string): string {
  if (scope === 'project') return 'project';
  if (scope === 'account') return 'account';
  return EMPTY;
}

function prettyStatus(status: string): string {
  if (status === 'ok') return 'OK';
  if (status === 'not_computed') return 'Not computed';
  if (status === 'error') return 'Error';
  return status;
}

// ── Loading / unavailable / error bodies (honest states) ─────────────────────

function BodySkeleton() {
  return (
    <div className="space-y-2" aria-busy="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-9 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" />
      ))}
    </div>
  );
}

function UnavailableNote() {
  return (
    <p className="rounded-lg border border-dashed border-gray-200 px-3 py-4 text-center text-[11px] text-gray-400 dark:border-gray-700 dark:text-gray-500">
      Project rollup isn’t provisioned on this backend yet.
    </p>
  );
}

function ErrorRetry({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-medium text-gray-500 transition-colors hover:text-gray-700 dark:border-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
    >
      <RefreshCw className="h-3.5 w-3.5" /> Couldn’t load — retry
    </button>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

const SECTION_IDS = ['overview', 'modules', 'scores', 'activity'] as const;
type SectionId = (typeof SECTION_IDS)[number];

export default function ProjectInspectorPanel({
  projectId,
  projectName,
  projectType,
  onClose,
  days,
  widthClassName = 'w-[400px]',
}: ProjectInspectorPanelProps) {
  const { data, loading, error, unavailable, refetch } = useProjectRollup(projectId, days);
  const [section, setSection] = useState<SectionId>('overview');

  const adn = useMemo<ScoreAxis[] | null>(() => (data ? deriveProjectAdn(data) : null), [data]);
  const modules = useMemo<ModuleRow[] | null>(() => (data ? deriveModules(data) : null), [data]);

  // Scores AuditTable rows — pre-formatted strings (the rows-API table can't
  // render chips/links and auto-formats values, so format up-front).
  const scoreRows = useMemo(() => {
    if (!data) return [];
    return data.cards.map((c) => ({
      Dimension: c.label,
      Value: formatCardValue(c),
      Scope: prettyScope(c.scope),
      Recos:
        c.openRecos + c.criticalRecos > 0
          ? `${c.openRecos} open${c.criticalRecos > 0 ? ` · ${c.criticalRecos} crit` : ''}`
          : EMPTY,
      Status: prettyStatus(c.status),
    }));
  }, [data]);

  // Health pill derived from authoritative project-level reco totals.
  const statusPill: StatusPillSpec | undefined = useMemo(() => {
    if (!data) return undefined;
    const { open, critical } = data.recos;
    if (critical > 0) return { label: `${critical} critical`, tone: 'error' };
    if (open > 0) return { label: `${open} recos`, tone: 'warn' };
    return { label: 'Healthy', tone: 'ok' };
  }, [data]);

  // A small "served from" provenance line — honest about rollup vs live compute.
  const provenance = data
    ? data.servedFrom === 'live'
      ? 'Computed live (rollup cache cold).'
      : 'Served from precomputed rollup.'
    : null;

  // ── Section renderers ──
  const renderOverview = () => {
    if (loading && !data) return <BodySkeleton />;
    if (unavailable) return <UnavailableNote />;
    if (error || !data || !adn) return <ErrorRetry onRetry={refetch} />;
    const { open, critical } = data.recos;
    return (
      <div className="space-y-3">
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
            ADN — this project
          </p>
          <AdnScoreCard axes={adn} title="ADN" compact />
          <p className="mt-1.5 text-[10px] leading-snug text-gray-400 dark:text-gray-500">
            Axes derived from this project’s own rollup — see the Scores tab for each dimension’s value.
          </p>
        </div>
        <div className="rounded-lg border border-gray-100 px-3 py-2.5 dark:border-gray-800">
          <div className="flex items-center gap-2 text-xs">
            <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
            <span className="font-medium text-gray-700 dark:text-gray-200">
              {open === 0 && critical === 0
                ? 'No open recommendations'
                : `${open} open recommendation${open === 1 ? '' : 's'}`}
            </span>
            {critical > 0 ? (
              <span className="ml-auto rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-600 dark:bg-red-900/30 dark:text-red-300">
                {critical} critical
              </span>
            ) : null}
          </div>
        </div>
        {provenance ? (
          <p className="text-[10px] italic text-gray-400 dark:text-gray-500">{provenance}</p>
        ) : null}
      </div>
    );
  };

  const renderModules = () => {
    if (loading && !data) return <BodySkeleton />;
    if (unavailable) return <UnavailableNote />;
    if (error || !data || !modules) return <ErrorRetry onRetry={refetch} />;
    return (
      <div className="space-y-2">
        <p className="text-[10px] leading-snug text-gray-400 dark:text-gray-500">
          Modules this project touches — inferred from its rollup signals.
        </p>
        <div className="space-y-1.5">
          {modules.map((m) => (
            <ModuleItem key={m.id} m={m} />
          ))}
        </div>
      </div>
    );
  };

  const renderScores = () => {
    if (loading && !data) return <BodySkeleton />;
    if (unavailable) return <UnavailableNote />;
    if (error || !data) return <ErrorRetry onRetry={refetch} />;
    return (
      <AuditTable
        rows={scoreRows}
        columns={['Dimension', 'Value', 'Scope', 'Recos', 'Status']}
        title="Per-dimension rollup"
        subtitle="DQ · PERF · GOV · STORAGE · COST"
      />
    );
  };

  const renderActivity = () => {
    if (loading && !data) return <BodySkeleton />;
    if (unavailable) return <UnavailableNote />;
    if (error || !data) return <ErrorRetry onRetry={refetch} />;
    return (
      <div className="space-y-2">
        <FieldRow label="Last deployment">
          {data.lastDeployAt ? (
            <span className="inline-flex items-center gap-1.5">
              {data.lastDeployStatus ? (
                <span className={cn('text-[11px] font-semibold capitalize', deployStatusClass(data.lastDeployStatus))}>
                  {data.lastDeployStatus}
                </span>
              ) : null}
              <span className="text-gray-500 dark:text-gray-400">{relativeTime(data.lastDeployAt)}</span>
            </span>
          ) : (
            <span className="text-gray-400">{EMPTY}</span>
          )}
        </FieldRow>
        <FieldRow label="Last activity">{relativeTime(data.lastEventAt)}</FieldRow>
        <FieldRow label="Events (window)">
          {data.eventCount30d > 0 ? data.eventCount30d.toLocaleString() : EMPTY}
        </FieldRow>
        {provenance ? (
          <p className="pt-1 text-[10px] italic text-gray-400 dark:text-gray-500">{provenance}</p>
        ) : null}
      </div>
    );
  };

  const sections: RightTabSection[] = [
    { id: 'overview', icon: LayoutDashboard, label: 'Overview', render: renderOverview },
    { id: 'modules', icon: Boxes, label: 'Modules', render: renderModules },
    { id: 'scores', icon: BarChart3, label: 'Scores', render: renderScores },
    { id: 'activity', icon: History, label: 'Activity', render: renderActivity },
  ];

  // Non-mutating actions — no useCanPerform gate (nothing here mutates).
  const quickActions: QuickAction[] = [
    {
      id: 'refresh',
      label: 'Refresh',
      icon: RefreshCw,
      onClick: refetch,
      disabled: loading,
    },
  ];

  const footer = (
    <>
      <Link
        href="/account-overview"
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
      >
        <Lightbulb className="h-3.5 w-3.5" /> Recommendations
      </Link>
      <Link
        href="/governance/projects"
        className="inline-flex items-center gap-1.5 rounded-lg border border-transparent bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white shadow-sm transition-colors hover:bg-slate-800 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-100"
      >
        <ShieldCheck className="h-3.5 w-3.5" /> Open project
      </Link>
    </>
  );

  return (
    <RightTabPanel
      title={projectName || projectId}
      subtitle={projectType || 'Project'}
      sections={sections}
      activeSection={section}
      onSectionChange={(id) => setSection(id as SectionId)}
      onClose={onClose}
      storageKey="data360.project.inspector.section.v1"
      accentClassName="bg-violet-500"
      widthClassName={widthClassName}
      statusPill={statusPill}
      kpiStrip={<ProjectKpiStrip projectId={projectId} days={days} compact />}
      quickActions={quickActions}
      footer={footer}
    />
  );
}
