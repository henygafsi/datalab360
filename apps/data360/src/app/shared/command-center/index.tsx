'use client';

import React, {
  useState,
  useEffect,
  useCallback,
  useTransition,
  useMemo,
  useDeferredValue,
  useRef,
  memo,
  lazy,
  Suspense,
} from 'react';
import Link from 'next/link';
import { Text, Title, Badge } from 'rizzui';
import cn from '@core/utils/class-names';
import toast from 'react-hot-toast';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import {
  RefreshCw,
  LayoutDashboard,
  Activity,
  Server,
  GitBranch,
  Shield,
  DollarSign,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  MinusCircle,
  Users,
  Database,
  Cpu,
  Box,
  BarChart3,
  Zap,
  Upload,
  Clock,
  Gauge,
  Lock,
  FileText,
  Layers,
  Rocket,
  ChevronUp,
  ChevronDown,
  ArrowUpRight,
  Download,
  Search,
  X,
  Filter,
  PanelRight,
  ArrowUpDown,
  Check,
  XCircle,
  Calendar,
  Timer,
  Eye,
  Cloud,
  Sparkles,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import {
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  AreaChart,
  Area,
  ComposedChart,
  Line,
} from 'recharts';

import QueryHistoryTable from '@/components/audit/QueryHistoryTable';
import LoginHistoryTable from '@/components/audit/LoginHistoryTable';
import MetricHelp, { type MetricHelpProps } from '@/components/ui/MetricHelp';
import SmartAuditTable, { type Row as SmartRow } from './AuditTable';

import {
  getSummary,
  getModuleHealth,
  getActivityFeed,
  getInfrastructure,
  getPipelines,
  getCostBreakdown,
  installOverviewKpis,
  type OverviewRange,
} from '@/app/services/command-center';
import type {
  SummaryResponse,
  ModuleHealthResponse,
  ActivityFeedResponse,
  InfrastructureResponse,
  PipelinesResponse,
  CostBreakdownResponse,
} from '@/app/services/command-center/types';
import {
  getSecurityOverview,
  getPerformanceOverview,
  getCortexCosts,
  getPlatformActivity,
  getProjectsOverview,
  getGovernanceGrantsOverview,
  getDataOperationsOverview,
  getPlatformActivityFiltered,
  getFilterOptions,
} from '@/app/services/org-accounts/hooks';
import {
  approveDeployment,
  rejectDeployment,
} from '@/app/services/api/projectsApi';
import apiClient, { getApiErrorMessage } from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import AIActionFlow, { type Suggestion as AISuggestion } from '@/app/shared/insights/AIActionFlow';
import ProjectKpiStrip from '@/app/shared/score-cards/ProjectKpiStrip';
import {
  getCommandCenterRecommendationsForDimension,
  type Recommendation as CcRecommendation,
  type RecommendationCta as CcRecommendationCta,
} from '@/app/services/command-center/recommendations';
import { useOverviewKpis } from '@/hooks/useOverviewKpis';
import { useAuth } from '@/hooks/useAuth';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { useCanPerform } from '@/hooks/useCanPerform';
import { CACHE_KEYS, useCacheInvalidationSubscription as useCacheInvalidation } from '@/components/providers/CacheInvalidationProvider';
import { isAdminRole } from '@/config/constants';

// Lazy-loaded new tabs
const ModulesTab = lazy(() => import('./modules-tab'));
const SnowflakeExplorerTab = lazy(() => import('./snowflake-explorer-tab'));
const OrgAccountsTab = lazy(() => import('./OrgAccountsTab'));
const SnowflakeAccountsTab = lazy(() => import('./SnowflakeAccountsTab'));
const OrgSummaryTab = lazy(() => import('./OrgSummaryTab'));
const DwhActionPlanTab = lazy(() => import('./dwh-action-plan-tab'));
import ApprovalDetailModal from './ApprovalDetailModal';
import CommandCenterActionsPanel from './ActionsPanel';
import ServerlessFinOpsCards from './serverless-finops-cards';
import TopProblemsPanel from './TopProblemsPanel';
import WhatChangedCard from './WhatChangedCard';
import ExecutiveOverview from './ExecutiveOverview';
import AiAdvisor from './AiAdvisor';
import SnowflakeInsightsAdvisor from './SnowflakeInsightsAdvisor';
import SecurityMap from './SecurityMap';
import ObjectStorageAudit from './ObjectStorageAudit';
import SnowflakeObjectsTab from './SnowflakeObjectsTab';
import AdnHeaderBadge from '@/app/shared/score-cards/AdnHeaderBadge';
import CostPreview from './CostPreview';
import { dash, fmtNum, EM_DASH } from '@/app/shared/ui/format';
import { safeToFixed } from '@/lib/format-number';
import type {
  SecurityOverviewResponse,
  PerformanceOverviewResponse,
  CortexCostsResponse,
  PlatformActivityResponse,
  ProjectsOverviewResponse,
  GovernanceGrantsOverviewResponse,
  DataOperationsOverviewResponse,
  CommandCenterFilters,
  FilterOptionsResponse,
} from '@/app/services/org-accounts/types';

// ─── Constants ───────────────────────────────────────────────────────────────

const COLORS = [
  '#3B82F6',
  '#10B981',
  '#F59E0B',
  '#EF4444',
  '#8B5CF6',
  '#EC4899',
  '#06B6D4',
  '#F97316',
];

const STATUS_COLOR: Record<string, string> = {
  healthy: 'text-green-500',
  degraded: 'text-amber-500',
  inactive: 'text-gray-400',
};

const STATUS_BG: Record<string, string> = {
  healthy: 'bg-green-500',
  degraded: 'bg-amber-500',
  needs_setup: 'bg-amber-500',
  warning: 'bg-amber-500',
  critical: 'bg-red-500',
  inactive: 'bg-gray-300 dark:bg-gray-600',
};

interface TabItem {
  id: string;
  label: string;
  icon: React.ElementType;
}

/**
 * Tab spec (9 tabs) — see Screens/Account-overview/_features.md for full
 * UX specification per tab.
 *
 * Renames vs the previous 7-tab version (preserved as aliases below):
 *   snowflake-explorer → snowflake-objects
 *   security-adv       → security
 *   cost               → finops
 *   overview           → overview (label "Overview", was "Dashboard")
 *   projects           → projects (label "Projects", was "Projects & AI")
 *
 * Two NEW tabs:
 *   org-accounts        — wires existing /org-accounts/dashboard/* + /accounts
 *   snowflake-accounts  — wires existing /org-accounts/accounts/{id}/*
 */
const tabs: TabItem[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'dwh-plan', label: 'DWH Action Plan', icon: Wrench },
  { id: 'snowflake-objects', label: 'Data Objects', icon: Database },
  { id: 'finops', label: 'FinOps', icon: DollarSign },
  { id: 'modules', label: 'Modules', icon: Box },
  { id: 'platform-activity', label: 'Platform Activity', icon: Layers },
  { id: 'projects', label: 'Projects', icon: Rocket },
  // Merged: Security posture/audit + the Security Map graph (was 'security-map').
  { id: 'security', label: 'Security', icon: Lock },
  // Merged: Org Summary + ORGADMIN-gated Org Accounts + Snowflake Accounts.
  { id: 'organization', label: 'Organization', icon: GitBranch },
];

/**
 * Backward-compat: old tab ids → new tab ids. Anything reading from
 * localStorage / URL with the old id is rewritten transparently.
 */
const TAB_ALIAS: Record<string, string> = {
  'snowflake-explorer': 'snowflake-objects',
  'security-adv': 'security',
  cost: 'finops',
  // Merged Security tab — Security Map folded into 'security'.
  'security-map': 'security',
  // Merged Organization tab — org-summary + org-accounts + snowflake-accounts.
  'org-summary': 'organization',
  'org-accounts': 'organization',
  'snowflake-accounts': 'organization',
  // 'overview', 'modules', 'projects', 'platform-activity' unchanged
};

/** Resolve any incoming tab id (legacy or current) to the canonical new id. */
function resolveTabId(id: string | null | undefined): string {
  if (!id) return 'overview';
  return TAB_ALIAS[id] ?? id;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Safe cell renderer for AuditTable columns without a custom render function.
 * Prevents "Objects are not valid as React child" crashes when API returns
 * an object (e.g. {error_code, message}) instead of a primitive value.
 */
function safeCellValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) return '-';
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  if (typeof value === 'object') {
    // Gracefully stringify unexpected objects (e.g. Snowflake error payloads)
    try {
      return JSON.stringify(value);
    } catch {
      return '[object]';
    }
  }
  return String(value);
}

/**
 * Guard: detect API error objects returned as 200 OK (e.g. {error_code, message}).
 * These bypass HTTP error handling and cause "Objects are not valid as React child" if rendered.
 */
function isApiError(data: unknown): boolean {
  if (data === null || data === undefined) return false;
  if (typeof data !== 'object' || Array.isArray(data)) return false;
  const d = data as Record<string, unknown>;
  return (
    ('error_code' in d && 'message' in d) ||
    ('success' in d && d.success === false && 'error_code' in d)
  );
}

/** Safe string coercion for dynamic JSX text — prevents object-as-child crashes. */
function safeStr(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return fallback;
}

/**
 * Safe numeric coercion. `Number(undefined)` is `NaN`, and `NaN ?? fallback`
 * does NOT fall back (?? only catches null/undefined), so the common
 * `Number(x) ?? 0` idiom renders literal "NaN". Use this instead — it returns
 * `fallback` for null/undefined AND for any non-finite result.
 */
function safeNum(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Honest numeric coercion: returns the real finite number when present, else
 * `null` — never a fabricated 0. Use for KPI values that must render "—" (via
 * formatKpiValue / KpiCard) when the backend field is absent or non-finite.
 */
function safeNumOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Safe percentage from part/total. Returns 0 when total is 0/invalid (never
 * NaN/Infinity). Rounds to the nearest integer by default.
 */
function safePct(part: unknown, total: unknown, fallback = 0): number {
  const p = safeNum(part, NaN);
  const t = safeNum(total, NaN);
  if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0) return fallback;
  return Math.round((p / t) * 100);
}

/**
 * Backfill missing day buckets so daily-trend charts render an even category
 * axis. Returns an array of `days` entries, each carrying the original row
 * when present and zero-filled defaults otherwise. Dates are ISO yyyy-mm-dd.
 */
function backfillDailySeries<T extends { date: string }>(
  rows: T[],
  days: number,
  defaults: Omit<T, 'date'>
): T[] {
  const byDate = new Map<string, T>();
  for (const r of rows) {
    if (r && typeof r.date === 'string') byDate.set(r.date.slice(0, 10), r);
  }
  const result: T[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const existing = byDate.get(key);
    result.push(existing ?? ({ date: key, ...defaults } as T));
  }
  return result;
}

/** Coalesces consecutive activity events from the same user/module/event_type
 *  occurring within `windowMs` of each other into a single grouped row. */
function coalesceActivityEvents<
  E extends {
    module?: unknown;
    username?: unknown;
    event_type?: unknown;
    timestamp?: string | null;
  },
>(events: E[], windowMs = 60_000): Array<E & { count: number }> {
  const out: Array<E & { count: number }> = [];
  for (const evt of events) {
    const prev = out[out.length - 1];
    const prevTs = prev?.timestamp ? new Date(prev.timestamp).getTime() : NaN;
    const curTs = evt.timestamp ? new Date(evt.timestamp).getTime() : NaN;
    const sameBucket =
      prev !== undefined &&
      prev.module === evt.module &&
      prev.username === evt.username &&
      prev.event_type === evt.event_type &&
      !isNaN(prevTs) &&
      !isNaN(curTs) &&
      Math.abs(prevTs - curTs) <= windowMs;
    if (sameBucket) {
      prev.count += 1;
    } else {
      out.push({ ...evt, count: 1 });
    }
  }
  return out;
}

/**
 * Honest KPI display string (Data360 score-card standard): null / undefined /
 * NaN / empty → "—" (never a fabricated 0). A real numeric 0 is preserved.
 * Defends against unexpected API-error objects reaching the value slot.
 */
function formatKpiValue(value: string | number | null | undefined): string {
  if (value == null) return '—';
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value.toLocaleString() : '—';
  }
  if (typeof value === 'object') {
    return (value as unknown as { message?: string }).message ?? '—';
  }
  const s = String(value).trim();
  if (!s || /^(nan|undefined|null)$/i.test(s)) return '—';
  return s;
}

const KpiCard = memo(function KpiCard({
  label,
  value,
  icon: Icon,
  trend,
  color = 'blue',
  suffix,
  previousValue,
  invertTrend,
  help,
  href,
  onActivate,
}: {
  label: string;
  value: string | number | null | undefined;
  icon: React.ElementType;
  trend?: number;
  color?: string;
  suffix?: string;
  previousValue?: number;
  invertTrend?: boolean;
  help?: MetricHelpProps;
  /** Optional drill-down to another route — turns the headline value into a link. */
  href?: string;
  /** Optional in-module drill-down (e.g. switch dashboard tab) — turns the
   *  headline value into a button. Ignored when `href` is set. */
  onActivate?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  // Honest display string + suffix only shown when there's a real value.
  const display = formatKpiValue(value);
  const showSuffix = suffix && display !== '—';

  // Compute delta from previous period if provided
  const delta = useMemo(() => {
    if (trend !== undefined) return trend;
    if (
      previousValue !== undefined &&
      previousValue !== 0 &&
      typeof value === 'number'
    ) {
      return Math.round(((value - previousValue) / previousValue) * 100);
    }
    return undefined;
  }, [trend, previousValue, value]);

  const isPositiveGood = invertTrend ? (delta ?? 0) < 0 : (delta ?? 0) > 0;

  // Health badge based on delta
  const healthBadge =
    delta !== undefined
      ? Math.abs(delta) < 5
        ? {
            label: 'Stable',
            cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
          }
        : isPositiveGood
          ? {
              label: 'Improving',
              cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
            }
          : {
              label: 'Declining',
              cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
            }
      : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      whileHover={{ y: -2 }}
      className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-3 shadow-sm transition-shadow duration-200 hover:border-gray-300 hover:shadow-md dark:border-gray-700 dark:bg-gray-900 dark:hover:border-gray-600"
    >
      {/* Subtle gradient halo on hover — sits behind the icon, fades in only
          when the card is hovered. Adds depth without competing with data. */}
      <div
        className={cn(
          'pointer-events-none absolute -right-6 -top-6 h-20 w-20 rounded-full bg-gradient-to-br opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100',
          `from-${color}-300/40 to-${color}-500/30`,
        )}
      />
      <div className="relative flex items-center justify-between">
        <motion.div
          whileHover={{ rotate: -4, scale: 1.05 }}
          transition={{ type: 'spring', stiffness: 380, damping: 20 }}
          className={`rounded-lg bg-${color}-100 dark:bg-${color}-900/30 p-1.5`}
        >
          <Icon
            className={`h-4 w-4 text-${color}-600 dark:text-${color}-400`}
          />
        </motion.div>
        <div className="flex items-center gap-1.5">
          {delta !== undefined && delta !== 0 && (
            <span
              className={cn(
                'flex items-center gap-1 text-xs font-medium',
                isPositiveGood
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-500'
              )}
            >
              {delta > 0 ? (
                <TrendingUp className="h-3 w-3" />
              ) : (
                <TrendingDown className="h-3 w-3" />
              )}
              {delta > 0 ? '+' : ''}
              {Math.abs(delta)}%
              <span className="ml-0.5 font-normal text-gray-400 dark:text-gray-400">
                vs prev
              </span>
            </span>
          )}
          <button
            aria-label={expanded ? 'Collapse details' : 'Expand details'}
            onClick={() => setExpanded(!expanded)}
            className="rounded p-1 transition-colors hover:bg-gray-100 dark:hover:bg-gray-800"
            title={expanded ? 'Collapse' : 'Expand details'}
          >
            {expanded ? (
              <ChevronUp className="h-3.5 w-3.5 text-gray-400" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
            )}
          </button>
        </div>
      </div>
      <p className="mt-2 text-xl font-bold text-gray-900 dark:text-white">
        {href && display !== '—' ? (
          <Link
            href={href}
            aria-label={`View ${label}`}
            className="inline-flex items-center gap-1 transition-colors hover:text-primary focus:outline-none focus-visible:text-primary"
          >
            {display}
            {showSuffix ? suffix : null}
            <ArrowUpRight className="h-4 w-4 text-gray-300 transition-colors group-hover:text-primary dark:text-gray-600" />
          </Link>
        ) : onActivate && display !== '—' ? (
          <button
            type="button"
            onClick={onActivate}
            aria-label={`View ${label}`}
            className="inline-flex items-center gap-1 transition-colors hover:text-primary focus:outline-none focus-visible:text-primary"
          >
            {display}
            {showSuffix ? suffix : null}
            <ArrowUpRight className="h-4 w-4 text-gray-300 transition-colors group-hover:text-primary dark:text-gray-600" />
          </button>
        ) : (
          <>
            {display}
            {showSuffix ? suffix : null}
          </>
        )}
      </p>
      <p className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
        {label}
        {help && <MetricHelp {...help} />}
      </p>
      {expanded && (
        <div className="mt-3 space-y-1.5 border-t border-gray-100 pt-3 dark:border-gray-800">
          {healthBadge && (
            <span
              className={cn(
                'inline-block rounded-full px-2 py-0.5 text-[10px] font-medium',
                healthBadge.cls
              )}
            >
              {healthBadge.label}
            </span>
          )}
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Current:{' '}
            <strong className="text-gray-700 dark:text-gray-300">
              {display}
              {showSuffix ? suffix : null}
            </strong>
            {delta !== undefined && (
              <>
                {' '}
                | Change:{' '}
                <strong
                  className={isPositiveGood ? 'text-green-600' : 'text-red-500'}
                >
                  {delta > 0 ? '+' : ''}
                  {delta}%
                </strong>
              </>
            )}
          </p>
        </div>
      )}
    </motion.div>
  );
});

const SectionCard = memo(function SectionCard({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900',
        className
      )}
    >
      <h3 className="mb-4 text-sm font-semibold text-gray-900 dark:text-white">
        {title}
      </h3>
      {children}
    </div>
  );
});

function LoadingSection() {
  return (
    <div className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {[...Array(6)].map((_, i) => (
          <div
            key={i}
            className="h-24 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700"
          />
        ))}
      </div>
      <div className="h-48 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
      <div className="h-48 animate-pulse rounded-xl bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}

/** Inline error + Retry — shown when a tab fetch fails, so a failed request
 *  renders an actionable message instead of an infinite loading skeleton. */
function TabErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="m-4 flex flex-col items-center justify-center gap-3 rounded-xl border border-red-100 bg-red-50 p-8 text-center dark:border-red-900/50 dark:bg-red-950/40">
      <AlertTriangle className="h-6 w-6 text-red-500" />
      <p className="text-sm font-medium text-red-700 dark:text-red-300">{message}</p>
      <button
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-700 dark:bg-red-900/30 dark:text-red-200 dark:hover:bg-red-900/50"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Retry
      </button>
    </div>
  );
}

function relativeTime(ts: string | null): string {
  if (!ts) return '';
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const MODULE_COLORS: Record<string, string> = {
  connect: 'blue',
  explore_design: 'violet',
  workflow: 'amber',
  governance: 'rose',
  bi_reporting: 'cyan',
  cortex: 'purple',
  data_quality: 'green',
  observability: 'orange',
};

// ─── Custom tooltip for dark mode ────────────────────────────────────────────

const ChartTooltip = memo(function ChartTooltip({
  active,
  payload,
  label,
}: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-3 text-xs shadow-lg dark:border-gray-700 dark:bg-gray-800">
      {label && (
        <p className="mb-1 text-gray-500 dark:text-gray-400">{label}</p>
      )}
      {payload.map((entry: any, i: number) => (
        <p key={i} style={{ color: entry.color }} className="font-medium">
          {entry.name}:{' '}
          {typeof entry.value === 'number'
            ? entry.value.toLocaleString()
            : entry.value}
        </p>
      ))}
    </div>
  );
});

// ─── Time Intelligence Presets ────────────────────────────────────────────────

interface TimePreset {
  label: string;
  days: number;
  getRange: () => { start_date: string; end_date: string };
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

const TIME_PRESETS: TimePreset[] = [
  {
    label: 'Last 24h',
    days: 1,
    getRange: () => {
      const end = new Date();
      const start = new Date(end.getTime() - 86400000);
      return { start_date: formatDate(start), end_date: formatDate(end) };
    },
  },
  {
    label: 'Last 7d',
    days: 7,
    getRange: () => {
      const end = new Date();
      const start = new Date(end.getTime() - 7 * 86400000);
      return { start_date: formatDate(start), end_date: formatDate(end) };
    },
  },
  {
    label: 'Last 30d',
    days: 30,
    getRange: () => {
      const end = new Date();
      const start = new Date(end.getTime() - 30 * 86400000);
      return { start_date: formatDate(start), end_date: formatDate(end) };
    },
  },
  {
    label: 'Last 90d',
    days: 90,
    getRange: () => {
      const end = new Date();
      const start = new Date(end.getTime() - 90 * 86400000);
      return { start_date: formatDate(start), end_date: formatDate(end) };
    },
  },
];

// ─── Global Filter Bar ───────────────────────────────────────────────────────

const FilterSelect = memo(function FilterSelect({
  label,
  value,
  options,
  onChange,
  icon: Icon,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  icon?: React.ElementType;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {Icon && <Icon className="h-3.5 w-3.5 text-gray-400" />}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
      >
        <option value="">{label}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o?.replace(/_/g, ' ')}
          </option>
        ))}
      </select>
    </div>
  );
});

const GlobalFilterBar = memo(function GlobalFilterBar({
  filters,
  setFilters,
  options,
  lastUpdated,
  isRefreshing,
}: {
  filters: CommandCenterFilters;
  setFilters: (f: CommandCenterFilters) => void;
  options: FilterOptionsResponse | null;
  lastUpdated: Date | null;
  isRefreshing?: boolean;
}) {
  const [showCustomRange, setShowCustomRange] = useState(false);
  const [customStart, setCustomStart] = useState(filters.start_date || '');
  const [customEnd, setCustomEnd] = useState(filters.end_date || '');

  const activePreset = TIME_PRESETS.find(
    (p) => p.days === filters.days && !filters.start_date
  );
  const isCustom = !!filters.start_date;

  // Static field filters (project/user/role/env/status/module) removed — they
  // were decorative and didn't reflect real data. Per-tab dynamic filters now
  // detect date + distinct categorical fields from each table's actual data
  // (see AuditTable), the way the BI dashboard detects filters from queries.

  const handlePresetClick = useCallback(
    (preset: TimePreset) => {
      // Preset = only set `days`. Clear custom start_date/end_date so activePreset highlights correctly.
      const { start_date: _s, end_date: _e, ...rest } = filters;
      setFilters({ ...rest, days: preset.days });
      setShowCustomRange(false);
    },
    [filters, setFilters]
  );

  const handleCustomApply = useCallback(() => {
    if (customStart && customEnd) {
      const startD = new Date(customStart);
      const endD = new Date(customEnd);
      const diffDays = Math.ceil(
        (endD.getTime() - startD.getTime()) / 86400000
      );
      setFilters({
        ...filters,
        days: Math.max(diffDays, 1),
        start_date: customStart,
        end_date: customEnd,
      });
      setShowCustomRange(false);
    }
  }, [customStart, customEnd, filters, setFilters]);

  return (
    <div className="space-y-2 pb-3 pt-2.5">
      {/* Time Intelligence Row */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-700 dark:bg-gray-800/50">
        <div className="mr-1 flex items-center gap-1.5">
          <Calendar className="h-4 w-4 text-gray-500 dark:text-gray-400" />
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
            Time Range
          </span>
        </div>
        {/* Preset buttons */}
        {TIME_PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => handlePresetClick(preset)}
            className={cn(
              'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
              activePreset?.days === preset.days && !isCustom
                ? 'bg-primary text-white shadow-sm'
                : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
            )}
          >
            {preset.label}
          </button>
        ))}
        <button
          onClick={() => setShowCustomRange(!showCustomRange)}
          className={cn(
            'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
            isCustom
              ? 'bg-primary text-white shadow-sm'
              : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400 dark:hover:bg-gray-700'
          )}
        >
          Custom
        </button>

        {/* Date display */}
        {filters.start_date && filters.end_date && (
          <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
            {filters.start_date} to {filters.end_date}
          </span>
        )}

        {/* Last updated + auto-refresh indicator */}
        <div className="ml-auto flex items-center gap-3">
          {isRefreshing && (
            <span
              className="flex items-center gap-1.5 text-xs font-medium text-primary"
              aria-live="polite"
            >
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
              </span>
              Refreshing…
            </span>
          )}
          {lastUpdated && !isRefreshing && (
            <span className="flex items-center gap-1 text-xs text-gray-400 dark:text-gray-400">
              <Timer className="h-3 w-3" />
              Updated {relativeTime(lastUpdated.toISOString())}
            </span>
          )}
        </div>
      </div>

      {/* Custom Date Range Picker (expandable) */}
      {showCustomRange && (
        <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-gray-200 bg-white px-3 py-2.5 dark:border-gray-700 dark:bg-gray-900">
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 dark:text-gray-400">
              From
            </label>
            <input
              type="date"
              aria-label="Start date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 dark:text-gray-400">
              To
            </label>
            <input
              type="date"
              aria-label="End date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-primary dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300"
            />
          </div>
          <button
            onClick={handleCustomApply}
            disabled={!customStart || !customEnd}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      )}

    </div>
  );
});

// ─── Audit Table ─────────────────────────────────────────────────────────────

interface AuditColumn<T> {
  key: keyof T & string;
  label: string;
  sortable?: boolean;
  filterable?: boolean;
  render?: (value: any, row: T) => React.ReactNode;
  width?: string;
  align?: 'left' | 'right' | 'center';
}

function AuditTable<T extends Record<string, any>>({
  data,
  columns,
  pageSize = 15,
  title,
  emptyMessage = 'No data',
}: {
  data: T[];
  columns: AuditColumn<T>[];
  pageSize?: number;
  title?: string;
  emptyMessage?: string;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const deferredColFilters = useDeferredValue(colFilters);
  const [page, setPage] = useState(0);
  const [showFilters, setShowFilters] = useState(false);

  // Filter (memoized + deferred for smooth typing on large datasets)
  const filtered = useMemo(
    () =>
      data.filter((row) =>
        Object.entries(deferredColFilters).every(([key, val]) => {
          if (!val) return true;
          const cellVal = String(row[key] ?? '').toLowerCase();
          return cellVal.includes(val.toLowerCase());
        })
      ),
    [data, deferredColFilters]
  );

  // Sort (memoized for large datasets)
  const sorted = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        if (!sortKey) return 0;
        const av = a[sortKey],
          bv = b[sortKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (typeof av === 'number' && typeof bv === 'number')
          return sortDir === 'asc' ? av - bv : bv - av;
        return sortDir === 'asc'
          ? String(av).localeCompare(String(bv))
          : String(bv).localeCompare(String(av));
      }),
    [filtered, sortKey, sortDir]
  );

  const totalPages = Math.ceil(sorted.length / pageSize);
  const pageData = useMemo(
    () => sorted.slice(page * pageSize, (page + 1) * pageSize),
    [sorted, page, pageSize]
  );

  const handleSort = useCallback(
    (key: string) => {
      if (sortKey === key) {
        setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
      } else {
        setSortKey(key);
        setSortDir('desc');
      }
      setPage(0);
    },
    [sortKey, sortDir]
  );

  const exportCsv = useCallback(() => {
    const headers = columns.map((c) => c.label).join(',');
    const rows = sorted.map((row) =>
      columns
        .map((c) => `"${String(row[c.key] ?? '').replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [headers, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [columns, sorted, title]);

  return (
    <div className="rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 dark:border-gray-700">
        <div className="flex items-center gap-3">
          {title && (
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              {title}
            </h3>
          )}
          <Badge size="sm" variant="flat" color="secondary">
            {sorted.length} rows
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <button
            aria-label={
              showFilters ? 'Hide search filters' : 'Show search filters'
            }
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'rounded-lg p-1.5 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300',
              showFilters && 'bg-primary/10 text-primary'
            )}
          >
            <Search className="h-4 w-4" />
          </button>
          <button
            aria-label="Export to CSV"
            onClick={exportCsv}
            className="rounded-lg p-1.5 text-gray-400 transition-colors hover:text-gray-600 dark:hover:text-gray-300"
          >
            <Download className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-gray-50 dark:bg-gray-800/80">
            <tr className="border-b border-gray-200 dark:border-gray-700">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'px-3 py-2.5 font-medium text-gray-500 dark:text-gray-400',
                    col.align === 'right' ? 'text-right' : 'text-left',
                    col.width
                  )}
                >
                  {col.sortable ? (
                    <button
                      onClick={() => handleSort(col.key)}
                      className="flex items-center gap-1 transition-colors hover:text-gray-700 dark:hover:text-gray-200"
                    >
                      {col.label}
                      {sortKey === col.key ? (
                        sortDir === 'asc' ? (
                          <ChevronUp className="h-3 w-3" />
                        ) : (
                          <ChevronDown className="h-3 w-3" />
                        )
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30" />
                      )}
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              ))}
            </tr>
            {showFilters && (
              <tr className="border-b border-gray-200 dark:border-gray-700">
                {columns.map((col) => (
                  <th key={`f-${col.key}`} className="px-3 py-1.5">
                    {col.filterable ? (
                      <input
                        type="text"
                        placeholder="Filter…"
                        aria-label={`Filter by ${col.label}`}
                        value={colFilters[col.key] || ''}
                        onChange={(e) => {
                          setColFilters({
                            ...colFilters,
                            [col.key]: e.target.value,
                          });
                          setPage(0);
                        }}
                        className="w-full rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-primary dark:border-gray-700 dark:bg-gray-900 dark:text-gray-300 dark:placeholder-gray-500"
                      />
                    ) : null}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {pageData.map((row, ri) => (
              <tr
                key={ri}
                className="border-b border-gray-100 transition-colors hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className={cn(
                      'px-3 py-2',
                      col.align === 'right' ? 'text-right' : 'text-left',
                      !col.render && 'text-gray-700 dark:text-gray-300'
                    )}
                  >
                    {col.render
                      ? col.render(row[col.key], row)
                      : safeCellValue(row[col.key])}
                  </td>
                ))}
              </tr>
            ))}
            {pageData.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-10 text-center text-sm text-gray-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-200 px-4 py-2.5 dark:border-gray-700">
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {page * pageSize + 1}–
            {Math.min((page + 1) * pageSize, sorted.length)} of {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <button
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
              className="rounded px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              Prev
            </button>
            {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
              const p =
                totalPages <= 5
                  ? i
                  : Math.max(0, Math.min(page - 2, totalPages - 5)) + i;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={cn(
                    'rounded px-2.5 py-1 text-xs transition-colors',
                    p === page
                      ? 'bg-primary text-white'
                      : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'
                  )}
                >
                  {p + 1}
                </button>
              );
            })}
            <button
              disabled={page >= totalPages - 1}
              onClick={() => setPage(page + 1)}
              className="rounded px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-30 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function statusBadgeColor(
  s: string | null
): 'success' | 'danger' | 'warning' | 'secondary' | 'info' {
  if (!s) return 'secondary';
  const v = s.toLowerCase();
  if (
    [
      'deployed',
      'success',
      'succeeded',
      'active',
      'started',
      'healthy',
    ].includes(v)
  )
    return 'success';
  if (['failed', 'error', 'dropped', 'cancelled'].includes(v)) return 'danger';
  if (['pending', 'pending_approval', 'warning', 'degraded'].includes(v))
    return 'warning';
  if (['approved', 'running', 'in_progress'].includes(v)) return 'info';
  return 'secondary';
}

// ─── Main Component ──────────────────────────────────────────────────────────

function CommandCenterDashboardInner() {
  // Lightweight, fire-and-forget analytics. Calling the hook auto-fires a
  // PAGE_VIEW event on mount (route change) for the account-overview module;
  // trackTabSwitch / trackFeatureClick cover the key in-page actions below.
  const { trackTabSwitch, trackFeatureClick } = useTrackEvent();
  /**
   * Tab id is persisted in localStorage + may arrive via `?tab=` URL param.
   * Legacy ids (snowflake-explorer / security-adv / cost / etc.) are mapped to
   * their new canonical ids by resolveTabId so old deep-links keep working.
   */
  // Start deterministically at 'overview' so the SSR'd shell (the always-rendered
  // tab bar) matches the first client render — the persisted/`?tab=` value is
  // resolved in a post-mount effect below. Reading window/localStorage in the
  // lazy initializer diverged server vs client → a hydration mismatch + wrong-tab
  // flash on the primary navigation.
  const [activeTab, _setActiveTab] = useState<string>('overview');
  const setActiveTab = useCallback((id: string) => {
    const resolved = resolveTabId(id);
    _setActiveTab(resolved);
    trackTabSwitch(resolved);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('data360.command-center.activeTab', resolved);
      const url = new URL(window.location.href);
      url.searchParams.set('tab', resolved);
      window.history.replaceState({}, '', url.toString());
    }
  }, [trackTabSwitch]);
  // Resolve the persisted / `?tab=` tab AFTER mount (not in the initializer) so
  // hydration is deterministic. Sets state directly — bypasses setActiveTab's
  // localStorage/URL/track side effects so no spurious tab-switch is recorded.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const fromUrl = new URL(window.location.href).searchParams.get('tab');
    const fromStorage = window.localStorage.getItem('data360.command-center.activeTab');
    const resolved = resolveTabId(fromUrl ?? fromStorage ?? 'overview');
    if (resolved !== 'overview') _setActiveTab(resolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [isTabTransitioning, startTabTransition] = useTransition();
  // Docked actions right-bar (the module's single centralized action surface).
  const [panelOpen, setPanelOpen] = useState(false);
  // Drill-down: switch tabs from a KPI card without a full navigation.
  const goToTab = useCallback(
    (id: string) => startTabTransition(() => setActiveTab(id)),
    [setActiveTab],
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // True when the overview fetcher attempted all four backend calls and every
  // one came back null/error — used to surface a clear "backend offline" banner
  // instead of an empty chart wall.
  const [backendUnreachable, setBackendUnreachable] = useState(false);
  // True when every overview call failed specifically because the analytics
  // service-cache isn't connected yet (503 CACHE_NOT_READY / svc_connect_failed).
  // The backend IS reachable — the data cache is provisioning — so we show an
  // honest "warming up" state instead of the misleading "Backend unreachable".
  const [cacheWarming, setCacheWarming] = useState(false);

  // Safety net: the page-level skeleton blocks every tab until `isLoading`
  // flips false. If the very first fetch hangs (e.g. the request is queued
  // behind a session refresh that never resolves), we never escape the
  // skeleton. Force-escape after 10s so the user at least sees tabs + an
  // empty/error state with a Retry button.
  useEffect(() => {
    if (!isLoading) return;
    const t = setTimeout(() => setIsLoading(false), 10_000);
    return () => clearTimeout(t);
  }, [isLoading]);

  // Client-side tab data cache — prevents re-fetching on every tab switch,
  // but DOES refetch when filters change (key includes filtersKey).
  const tabDataCache = useRef<
    Record<string, { data: any; timestamp: number; filtersKey: string }>
  >({});
  const CACHE_TTL_MS = 120_000; // 2 minutes client-side cache

  // Stable serializer for the filters object so every fetch closure produces
  // an identical key from identical filter values. Order matters here —
  // changing it would invalidate every existing cached entry but otherwise
  // wouldn't break behaviour.
  const buildFiltersKey = useCallback(
    (f: CommandCenterFilters): string =>
      `${f.days}|${f.start_date ?? ''}|${f.end_date ?? ''}|${f.project_type ?? ''}|${f.username ?? ''}|${f.role_name ?? ''}|${f.environment ?? ''}|${f.status ?? ''}|${f.module_name ?? ''}`,
    [],
  );

  // Shared activity-feed cache (limit=100). Overview slices to 10 in render,
  // Platform Activity renders the full list — one fetch serves both tabs.
  // filtersKey ensures we don't reuse a feed fetched for a different scope.
  const activityFeedRef = useRef<{
    data: ActivityFeedResponse;
    timestamp: number;
    filtersKey: string;
  } | null>(null);
  const moduleHealthRef = useRef<{
    data: ModuleHealthResponse;
    timestamp: number;
    daysKey: number;
  } | null>(null);

  // Note: render-level crash protection is handled by CommandCenterErrorBoundary (class component below).

  // Data states per tab
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [moduleHealth, setModuleHealth] = useState<ModuleHealthResponse | null>(
    null
  );
  const [activityFeed, setActivityFeed] = useState<ActivityFeedResponse | null>(
    null
  );
  // obsKpis state removed: data was fetched from /observability/intelligent-kpis
  // but never read by render. Saved one 25s timeout per overview refresh.
  const [infra, setInfra] = useState<InfrastructureResponse | null>(null);
  const [pipelines, setPipelines] = useState<PipelinesResponse | null>(null);
  const [costData, setCostData] = useState<CostBreakdownResponse | null>(null);
  // Tab data states
  const [securityData, setSecurityData] =
    useState<SecurityOverviewResponse | null>(null);
  const [projectsData, setProjectsData] =
    useState<ProjectsOverviewResponse | null>(null);
  const [govGrantsData, setGovGrantsData] =
    useState<GovernanceGrantsOverviewResponse | null>(null);
  const [dataOpsData, setDataOpsData] =
    useState<DataOperationsOverviewResponse | null>(null);
  const [performanceData, setPerformanceData] =
    useState<PerformanceOverviewResponse | null>(null);
  const [platformData, setPlatformData] =
    useState<PlatformActivityResponse | null>(null);
  // healthScore state removed: never fetched, never read — pure dead prop.

  // Global filters — default to Last 30d (no start_date/end_date so preset button highlights)
  const [filters, setFilters] = useState<CommandCenterFilters>({
    days: 30,
  });
  const [filterOptions, setFilterOptions] =
    useState<FilterOptionsResponse | null>(null);

  // Auto-refresh has been removed entirely. Data freshness is now driven only
  // by SSE cache-invalidation events from the backend + the manual refresh
  // button in the header.
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Whether the user has scrolled past the page top — used to drop a subtle
  // shadow under the sticky tab+filter cluster so it visually detaches from
  // content rather than floating ambiguously.
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const [tabLoading, setTabLoading] = useState<Record<string, boolean>>({
    overview: true,
    projects: false,
    security: false,
    'governance-grants': false,
    'data-ops': false,
    performance: false,
    finops: false,
    compute: false,
    'platform-activity': false,
  });

  // Per-tab error state — a failed fetch (catch OR isApiError branch) must set
  // this so the tab renders an inline error + Retry instead of an infinite
  // skeleton (CostTab/SecurityAdvTab fall to <LoadingSection/> on `!data`).
  const [tabError, setTabError] = useState<Record<string, string | null>>({});

  // ── Fetchers ─────────────────────────────────────────────────────────────

  const fetchOverview = useCallback(async () => {
    setTabLoading((p) => ({ ...p, overview: true }));
    setError(null);
    try {
      const filterParams = {
        days: filters.days,
        start_date: filters.start_date,
        end_date: filters.end_date,
      };
      // Each call wrapped in .catch(() => null) so one slow/404 endpoint
      // doesn't block Promise.all. Per-call timeout is 25s: the slowest
      // valid backend response we measured is /command-center/module-health
      // at ~17s, so 25s leaves a small safety margin. The page-level safety
      // timeout (10s on `isLoading`) still escapes the skeleton at 10s,
      // and per-card empty-states render gracefully while slow calls land.
      const OVERVIEW_TIMEOUT_MS = 25000;
      // Capture whether any failure was the analytics-cache-warming 503 so the
      // banner can distinguish "warming up" (reachable) from "unreachable".
      let sawCacheWarming = false;
      const withTimeout = <T,>(p: Promise<T>): Promise<T | null> =>
        Promise.race<T | null>([
          p.catch((e: any) => {
            const detail = e?.response?.data?.detail;
            const code =
              (detail && typeof detail === 'object' ? detail.error_code || detail.errorCode : undefined) ||
              detail?.reason;
            const sig = `${e?.message ?? ''} ${code ?? ''}`;
            if (/warming up|CACHE_NOT_READY|svc_connect_failed/i.test(sig)) sawCacheWarming = true;
            return null;
          }),
          new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), OVERVIEW_TIMEOUT_MS),
          ),
        ]);
      // Activity feed: fetch limit=100 (same as Platform Activity tab) so both
      // tabs share one network round-trip. Overview's render layer already
      // slices to 10, so behaviour is identical. If Platform Activity already
      // populated activityFeed during this session, reuse it directly.
      const cachedFeed = activityFeedRef.current;
      const cachedFeedFresh =
        cachedFeed &&
        cachedFeed.filtersKey ===
          `${filters.days}|${filters.module_name ?? ''}|${filters.username ?? ''}` &&
        Date.now() - cachedFeed.timestamp < CACHE_TTL_MS;

      const activityFeedTask = cachedFeedFresh
        ? Promise.resolve(cachedFeed!.data)
        : withTimeout(
            getActivityFeed(100, {
              days: filters.days,
              module_name: filters.module_name,
              username: filters.username,
            }),
          );

      // Module-health only depends on `days` — reuse cache when only
      // user/module filters changed. Backend call is ~17s so the win is real.
      const cachedMh = moduleHealthRef.current;
      const cachedMhFresh =
        cachedMh &&
        cachedMh.daysKey === filters.days &&
        Date.now() - cachedMh.timestamp < CACHE_TTL_MS;
      const moduleHealthTask: Promise<ModuleHealthResponse | null> = cachedMhFresh
        ? Promise.resolve(cachedMh!.data)
        : withTimeout(getModuleHealth({ days: filters.days }));

      // Progressive resolution: each call resolves into its own state
      // independently so the UI reveals as fast as the fastest call.
      // `getSummary` is the slowest (8-28s); `getIntelligentKpis` is usually
      // a sub-second cache hit. Previously the whole tab waited for the slow
      // one. We track readiness flags and tear down the spinner the moment
      // either kpis OR summary returns successfully — whichever lands first.
      let firstHit = false;
      const dropSpinner = () => {
        if (firstHit) return;
        firstHit = true;
        setTabLoading((p) => ({ ...p, overview: false }));
        setIsLoading(false);
        setLastUpdated(new Date());
        tabDataCache.current['overview'] = { data: true, timestamp: Date.now(), filtersKey: buildFiltersKey(filters) };
      };

      const summaryP = withTimeout(getSummary(filterParams)).then((s) => {
        if (s && !isApiError(s)) setSummary(s);
        dropSpinner();
        return s;
      });
      const mhP = moduleHealthTask.then((mh) => {
        if (mh && !isApiError(mh)) {
          setModuleHealth(mh);
          moduleHealthRef.current = {
            data: mh,
            timestamp: Date.now(),
            daysKey: filters.days,
          };
        }
        return mh;
      });
      const afP = activityFeedTask.then((af) => {
        if (af && !isApiError(af)) {
          setActivityFeed(af);
          activityFeedRef.current = {
            data: af,
            timestamp: Date.now(),
            filtersKey: `${filters.days}|${filters.module_name ?? ''}|${filters.username ?? ''}`,
          };
        }
        return af;
      });
      // getIntelligentKpis() removed: response was stored in `obsKpis` state
      // but never read by render — the Observability radar that consumed it
      // was always gated to never render. One less 25s timeout per overview
      // refresh, and one less network round-trip.

      // Wait for ALL to settle so we can flag "backend unreachable" if every
      // call failed. Per-call .catch was already inside withTimeout, so this
      // Promise.all never rejects.
      const [s, mh, af] = await Promise.all([summaryP, mhP, afP]);
      const gotSummary = !!(s && !isApiError(s));
      const gotModuleHealth = !!(mh && !isApiError(mh));
      const gotActivity = !!(af && !isApiError(af));
      const allFailed = !gotSummary && !gotModuleHealth && !gotActivity;
      // If everything failed because the cache is warming, that's NOT
      // "unreachable" — show the honest warming banner instead.
      setCacheWarming(allFailed && sawCacheWarming);
      setBackendUnreachable(allFailed && !sawCacheWarming);
      // Safety net: if nothing landed (every call timed out), drop the
      // spinner so the user sees the empty-state banner instead of an
      // infinite skeleton.
      dropSpinner();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load summary';
      setError(msg);
      toast.error(msg);
      setTabLoading((p) => ({ ...p, overview: false }));
      setIsLoading(false);
    }
  }, [filters]);

  const fetchProjects = useCallback(async () => {
    setTabLoading((p) => ({ ...p, projects: true }));
    setTabError((p) => ({ ...p, projects: null }));
    try {
      const data = await getProjectsOverview(filters);
      if (isApiError(data)) {
        console.warn('[CommandCenter] projects-overview returned error:', data);
        setTabError((p) => ({ ...p, projects: 'Failed to load projects data' }));
        return;
      }
      setProjectsData(data);
      setLastUpdated(new Date());
      tabDataCache.current['projects'] = { data: true, timestamp: Date.now(), filtersKey: buildFiltersKey(filters) };
    } catch (err) {
      const msg = getApiErrorMessage(err) || 'Failed to load projects data';
      toast.error(msg);
      setTabError((p) => ({ ...p, projects: msg }));
    } finally {
      setTabLoading((p) => ({ ...p, projects: false }));
    }
  }, [filters]);

  const fetchSecurityAdv = useCallback(async () => {
    setTabLoading((p) => ({ ...p, security: true }));
    setTabError((p) => ({ ...p, security: null }));
    try {
      const data = await getSecurityOverview(filters.days, filters);
      if (isApiError(data)) {
        console.warn('[CommandCenter] security-overview returned error:', data);
        setTabError((p) => ({ ...p, security: 'Failed to load security data' }));
        return;
      }
      setSecurityData(data);
      setLastUpdated(new Date());
      tabDataCache.current['security'] = {
        data: true,
        timestamp: Date.now(),
        filtersKey: buildFiltersKey(filters),
      };
    } catch (err) {
      const msg = getApiErrorMessage(err) || 'Failed to load security data';
      toast.error(msg);
      setTabError((p) => ({ ...p, security: msg }));
    } finally {
      setTabLoading((p) => ({ ...p, security: false }));
    }
  }, [filters]);

  const fetchGovGrants = useCallback(async () => {
    setTabLoading((p) => ({ ...p, 'governance-grants': true }));
    try {
      const data = await getGovernanceGrantsOverview(filters);
      if (isApiError(data)) {
        console.warn('[CommandCenter] governance-grants returned error:', data);
        return;
      }
      setGovGrantsData(data);
      setLastUpdated(new Date());
      tabDataCache.current['governance-grants'] = {
        data: true,
        timestamp: Date.now(),
        filtersKey: buildFiltersKey(filters),
      };
    } catch (err) {
      toast.error('Failed to load governance & grants data');
    } finally {
      setTabLoading((p) => ({ ...p, 'governance-grants': false }));
    }
  }, [filters]);

  const fetchDataOps = useCallback(async () => {
    setTabLoading((p) => ({ ...p, 'data-ops': true }));
    try {
      const data = await getDataOperationsOverview(filters);
      if (isApiError(data)) {
        console.warn('[CommandCenter] data-ops returned error:', data);
        return;
      }
      setDataOpsData(data);
      setLastUpdated(new Date());
      tabDataCache.current['data-ops'] = { data: true, timestamp: Date.now(), filtersKey: buildFiltersKey(filters) };
    } catch (err) {
      toast.error('Failed to load data operations overview');
    } finally {
      setTabLoading((p) => ({ ...p, 'data-ops': false }));
    }
  }, [filters]);

  const fetchPerformance = useCallback(async () => {
    setTabLoading((p) => ({ ...p, performance: true }));
    try {
      const perfDays = filters.days > 30 ? 7 : filters.days;
      const data = await getPerformanceOverview(perfDays, filters);
      if (isApiError(data)) {
        console.warn('[CommandCenter] performance returned error:', data);
        return;
      }
      setPerformanceData(data);
      setLastUpdated(new Date());
      tabDataCache.current['performance'] = {
        data: true,
        timestamp: Date.now(),
        filtersKey: buildFiltersKey(filters),
      };
    } catch (err) {
      toast.error('Failed to load performance data');
    } finally {
      setTabLoading((p) => ({ ...p, performance: false }));
    }
  }, [filters]);

  const fetchCost = useCallback(async () => {
    setTabLoading((p) => ({ ...p, finops: true }));
    setTabError((p) => ({ ...p, finops: null }));
    try {
      const [cost, cortex] = await Promise.all([
        getCostBreakdown(filters.days, {
          start_date: filters.start_date,
          end_date: filters.end_date,
        }),
        // Cortex spend is a secondary overlay on the FinOps tab — if it fails
        // the primary cost breakdown still renders. Surface the failure as a
        // non-blocking toast (instead of silently swallowing) then degrade to
        // null so the tab stays usable.
        getCortexCosts(filters.days, filters).catch((e) => {
          console.warn('[CommandCenter] cortex-costs failed:', e);
          toast.error(getApiErrorMessage(e) || 'Could not load AI cost overlay');
          return null;
        }),
      ]);
      if (isApiError(cost)) {
        console.warn('[CommandCenter] cost-breakdown returned error:', cost);
        setTabError((p) => ({ ...p, finops: 'Failed to load cost data' }));
        return;
      }
      const cortexCredits =
        cortex && !isApiError(cortex)
          ? Number(cortex.summary?.total_credits ?? 0)
          : 0;
      setCostData({
        ...cost,
        cortex_credits_30d: cortexCredits,
        cortex_total: cortexCredits,
      } as CostBreakdownResponse);
      setLastUpdated(new Date());
      tabDataCache.current['finops'] = { data: true, timestamp: Date.now(), filtersKey: buildFiltersKey(filters) };
    } catch (err) {
      const msg = getApiErrorMessage(err) || 'Failed to load cost data';
      toast.error(msg);
      setTabError((p) => ({ ...p, finops: msg }));
    } finally {
      setTabLoading((p) => ({ ...p, finops: false }));
    }
  }, [filters]);

  const fetchCompute = useCallback(async () => {
    setTabLoading((p) => ({ ...p, compute: true }));
    try {
      const data = await getInfrastructure({ days: filters.days });
      if (isApiError(data)) {
        console.warn('[CommandCenter] infrastructure returned error:', data);
        return;
      }
      setInfra(data);
      setLastUpdated(new Date());
      tabDataCache.current['compute'] = { data: true, timestamp: Date.now(), filtersKey: buildFiltersKey(filters) };
    } catch (err) {
      toast.error('Failed to load compute data');
    } finally {
      setTabLoading((p) => ({ ...p, compute: false }));
    }
  }, [filters]);

  const fetchPlatformActivity = useCallback(async () => {
    setTabLoading((p) => ({ ...p, 'platform-activity': true }));
    try {
      const feedFiltersKey = `${filters.days}|${filters.module_name ?? ''}|${filters.username ?? ''}`;
      const cachedFeed = activityFeedRef.current;
      const cachedFeedFresh =
        cachedFeed &&
        cachedFeed.filtersKey === feedFiltersKey &&
        Date.now() - cachedFeed.timestamp < CACHE_TTL_MS;

      // Reuse Overview's limit=100 activity-feed fetch when available.
      const activityFeedTask: Promise<ActivityFeedResponse | null> = cachedFeedFresh
        ? Promise.resolve(cachedFeed!.data)
        : getActivityFeed(100, {
            days: filters.days,
            module_name: filters.module_name,
            username: filters.username,
          });

      const [plat, af] = await Promise.all([
        getPlatformActivityFiltered(filters),
        activityFeedTask,
      ]);
      if (!isApiError(plat)) setPlatformData(plat);
      if (af && !isApiError(af)) {
        setActivityFeed(af);
        activityFeedRef.current = {
          data: af,
          timestamp: Date.now(),
          filtersKey: feedFiltersKey,
        };
      }
      setLastUpdated(new Date());
      tabDataCache.current['platform-activity'] = {
        data: true,
        timestamp: Date.now(),
        filtersKey: buildFiltersKey(filters),
      };
    } catch (err) {
      toast.error('Failed to load platform activity');
    } finally {
      setTabLoading((p) => ({ ...p, 'platform-activity': false }));
    }
  }, [filters]);

  // ── Effects ──────────────────────────────────────────────────────────────

  // Initial data load is handled by the tab-switch effect below (activeTab defaults to 'overview')
  useEffect(() => {
    getFilterOptions()
      .then(setFilterOptions)
      .catch(() => {});
  }, []);

  // Warm backend caches on first visit (fire-and-forget)
  useEffect(() => {
    const cacheWarmed = sessionStorage.getItem('data360_cache_warmed');
    if (!cacheWarmed) {
      apiClient.post('/command-center/warm-user-cache').catch(() => {});
      sessionStorage.setItem('data360_cache_warmed', 'true');
    }
  }, []);

  // Re-fetch active tab when filters or activeTab change (skip if cached for
  // THIS filter combination within TTL). The cache key must include filter
  // values — otherwise changing a filter wouldn't trigger a refetch and the
  // user would see stale data (the bug that broke filters until the fix).
  const filtersCacheKey = buildFiltersKey(filters);
  useEffect(() => {
    const cached = tabDataCache.current[activeTab];
    if (
      cached &&
      cached.filtersKey === filtersCacheKey &&
      Date.now() - cached.timestamp < CACHE_TTL_MS
    ) {
      // Same tab + same filters + still fresh → skip re-fetch.
      return;
    }
    switch (activeTab) {
      case 'overview':
        fetchOverview();
        break;
      case 'projects':
        fetchProjects();
        break;
      case 'security':
        fetchSecurityAdv();
        break;
      case 'finops':
        fetchCost();
        break;
      case 'platform-activity':
        fetchPlatformActivity();
        break;
      // org-accounts + snowflake-accounts + snowflake-objects + modules
      // own their fetch lifecycle inside their tab components.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, filters]);

  // Refresh is now driven solely by SSE cache-invalidation events (handled
  // elsewhere via useCacheInvalidation) and by the manual refresh button.

  const handleRefresh = useCallback(() => {
    trackFeatureClick('refresh', { tab: activeTab });
    // Invalidate client-side tab cache on manual refresh
    tabDataCache.current = {};
    activityFeedRef.current = null;
    moduleHealthRef.current = null;
    setSummary(null);
    setModuleHealth(null);
    setActivityFeed(null);
    setInfra(null);
    setPipelines(null);
    setCostData(null);
    setSecurityData(null);
    setProjectsData(null);
    setGovGrantsData(null);
    setDataOpsData(null);
    setPerformanceData(null);
    setPlatformData(null);
    setBackendUnreachable(false);
    setCacheWarming(false);
    // Re-fetch current active tab
    switch (activeTab) {
      case 'overview':
        fetchOverview();
        break;
      case 'projects':
        fetchProjects();
        break;
      case 'security':
        fetchSecurityAdv();
        break;
      case 'finops':
        fetchCost();
        break;
      case 'platform-activity':
        fetchPlatformActivity();
        break;
      default:
        fetchOverview();
        break;
    }
  }, [
    activeTab,
    fetchOverview,
    fetchProjects,
    fetchSecurityAdv,
    fetchGovGrants,
    fetchDataOps,
    fetchPerformance,
    fetchCost,
    fetchCompute,
    fetchPlatformActivity,
    trackFeatureClick,
  ]);

  // ── Real-time refresh via SSE cache-invalidation ──────────────────────────
  // Subscribe to backend cache-invalidation events and silently reload the
  // ACTIVE tab when an event touches data it actually renders (key→tab map
  // below). Unlike the manual Refresh button we do NOT fire `trackFeatureClick`
  // (these are backend-driven, not user clicks) and we do NOT null the section
  // state (loaders refresh in place — no skeleton flash). Tabs whose data is
  // owned by their own child component (Organization/Modules/Snowflake
  // Objects/Snowflake Explorer) manage their own lifecycle and are not driven
  // from here — see the deferred gap note.
  useCacheInvalidation({
    onInvalidate: (keys) => {
      const TAB_KEYS: Record<string, string[]> = {
        overview: [CACHE_KEYS.USER_ACTIVITY, CACHE_KEYS.DASHBOARD],
        projects: [CACHE_KEYS.PROJECTS],
        security: [
          CACHE_KEYS.GRANTS,
          CACHE_KEYS.SECURITY_MATRIX,
          CACHE_KEYS.USER_ACTIVITY,
        ],
        'platform-activity': [CACHE_KEYS.USER_ACTIVITY],
      };
      const relevant = TAB_KEYS[activeTab] ?? [];
      if (!keys.some((k) => relevant.includes(k))) return;
      // Bust the client-side tab memo so the loader re-hits the backend.
      tabDataCache.current = {};
      switch (activeTab) {
        case 'overview':
          fetchOverview();
          break;
        case 'projects':
          fetchProjects();
          break;
        case 'security':
          fetchSecurityAdv();
          break;
        case 'platform-activity':
          fetchPlatformActivity();
          break;
      }
    },
  });

  // ── Loading state ────────────────────────────────────────────────────────
  //
  // PERF: the dashboard shell (header + tab bar + active tab) now renders
  // IMMEDIATELY rather than being gated behind a full-page `if (isLoading)`
  // skeleton. The old gate blocked every child of the Overview tab —
  // crucially `<ExecutiveOverview>` (cross-module + sensors) and the fast
  // `useOverviewKpis` cache call — until `fetchOverview`'s FIRST endpoint
  // (summary / module-health / activity-feed, 8–28s) resolved and tripped
  // `dropSpinner()`. That serialized ExecutiveOverview's 4 endpoints BEHIND
  // the slowest-of-first-batch (sum-not-max) on the priority tab.
  //
  // Every tab component already accepts a `loading` prop and streams its own
  // section skeleton (OverviewTab → <LoadingSection/> while `loading && !data`),
  // so the shell renders at once and each section fills in as its own endpoint
  // lands. `ExecutiveOverview` + `useOverviewKpis` now mount on first paint and
  // fetch CONCURRENTLY with `fetchOverview`, turning the Overview wall-time from
  // (first-Overview-hit + cross-module/sensors) into max(all-of-them).
  //
  // `dropSpinner()` is still live — it drives `lastUpdated`, clears
  // `tabLoading.overview`, and seeds `tabDataCache`. The `isLoading` state +
  // its 10s safety-net effect (above) are now VESTIGIAL: nothing reads
  // `isLoading` in render anymore, so the safety-net only flips a state no one
  // observes. Left in place (harmless) to keep `dropSpinner`'s shape unchanged;
  // could be deleted in a later cleanup. The active tab streams its own section
  // skeleton (OverviewTab renders <LoadingSection/> while
  // `loading && !summary && !kpis`), so no separate full-page skeleton is needed.

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="@container">
      {/* Flex row: content column + the docked Actions right-bar sibling. */}
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
      {/* ── Header ────────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
        className="mb-6 flex items-center justify-between"
      >
        <div>
          <Title as="h1" className="bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900 bg-clip-text text-xl font-bold tracking-tight text-transparent dark:from-white dark:via-slate-200 dark:to-white md:text-2xl">
            Command Center
          </Title>
          <Text className="mt-1 text-gray-500 dark:text-gray-400">
            Your Data360 platform at a glance
          </Text>
        </div>
        <div className="flex items-center gap-3">
        {/* Account-level Command Center has no single project to score, so the
            per-project ADN badge self-hides (projectId=null → renders nothing).
            The slot is kept for placement parity; no fabricated account ADN. */}
        <div className="hidden lg:block">
          <AdnHeaderBadge projectId={null} />
        </div>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => {
            trackFeatureClick('actions_panel', { open: !panelOpen });
            setPanelOpen((o) => !o);
          }}
          aria-expanded={panelOpen}
          aria-label="Toggle actions panel"
          className={cn(
            'group relative flex items-center gap-2 overflow-hidden rounded-lg border px-3 py-2 text-sm shadow-sm transition-all hover:shadow-md',
            panelOpen
              ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
              : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-300 dark:hover:border-gray-600',
          )}
        >
          {/* Subtle gradient shimmer on hover */}
          <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-blue-500/10 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
          <PanelRight className="h-4 w-4" />
          Actions
        </motion.button>
        </div>
      </motion.div>

      {/* ── Error Banner ──────────────────────────────────────────── */}
      {error && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/50">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Cache-warming banner — the backend IS reachable but the account's
          analytics service-cache isn't connected yet (503 CACHE_NOT_READY).
          This is transient + recoverable, so it reads as "warming up", not
          "unreachable". Takes precedence over the offline banner. */}
      {cacheWarming && !error && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 dark:border-blue-900/50 dark:bg-blue-950/50">
          <RefreshCw className="mt-0.5 h-5 w-5 flex-shrink-0 animate-spin text-blue-500" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
              Live analytics are warming up
            </p>
            <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-300">
              The backend is reachable; your account&apos;s data cache is being provisioned. KPIs and charts will appear once it&apos;s ready — this usually clears on its own.
            </p>
          </div>
          <button
            onClick={handleRefresh}
            className="flex-shrink-0 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-900/30 dark:text-blue-200 dark:hover:bg-blue-900/50"
          >
            Retry
          </button>
        </div>
      )}

      {/* Backend-offline banner — fires when every overview call returned null
          (server down, network blocked, JWT rejected). Gives the user a clear
          single message + retry instead of a wall of empty cards. */}
      {backendUnreachable && !error && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/50">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-500" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
              Backend unreachable
            </p>
            <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
              Data360 API didn't respond. Charts and KPIs are empty until the connection is restored.
            </p>
          </div>
          <button
            onClick={handleRefresh}
            className="flex-shrink-0 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200 dark:hover:bg-amber-900/50"
          >
            Retry
          </button>
        </div>
      )}

      {/* ── Sticky Tab + Filter Cluster ──────────────────────────────
          Tabs and filter bar stick to the top of the viewport as the user
          scrolls long tab content, so navigation + filter state stay one
          click away. Backdrop blur softens the boundary against the
          background so cards still feel grounded. A subtle shadow fades in
          once the user has actually scrolled — visual cue that the bar is
          floating over content. */}
      <div
        className={cn(
          'sticky top-0 z-30 -mx-4 mb-6 px-4 pt-3 backdrop-blur transition-shadow duration-200',
          'bg-white/85 supports-[backdrop-filter]:bg-white/70 dark:bg-gray-950/85 dark:supports-[backdrop-filter]:bg-gray-950/70',
          scrolled && 'shadow-[0_4px_12px_-6px_rgba(0,0,0,0.12)] dark:shadow-[0_4px_16px_-6px_rgba(0,0,0,0.6)]'
        )}
      >

      {/* ── Tabs with sliding gradient indicator ─────────────────────
          `layoutId="cc-tab-indicator"` makes the underline glide smoothly
          between tabs using framer-motion's shared-layout transitions. */}
      <LayoutGroup id="command-center-tabs">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <div
            className="no-scrollbar -mb-px flex snap-x snap-mandatory space-x-1 overflow-x-auto scroll-smooth"
            role="tablist"
            aria-label="Account overview tabs"
          >
            {tabs.map((tab, idx) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
                // WAI-ARIA tabs pattern: Left/Right move focus + select; Home/End jump to edges.
                let nextIdx: number | null = null;
                if (e.key === 'ArrowRight') nextIdx = (idx + 1) % tabs.length;
                else if (e.key === 'ArrowLeft') nextIdx = (idx - 1 + tabs.length) % tabs.length;
                else if (e.key === 'Home') nextIdx = 0;
                else if (e.key === 'End') nextIdx = tabs.length - 1;
                if (nextIdx === null) return;
                e.preventDefault();
                const nextTab = tabs[nextIdx];
                startTabTransition(() => setActiveTab(nextTab.id));
                window.requestAnimationFrame(() => {
                  const el = document.getElementById(`tab-${nextTab.id}`);
                  el?.focus();
                  el?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                    inline: 'nearest',
                  });
                });
              };
              return (
                <button
                  key={tab.id}
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`tabpanel-${tab.id}`}
                  id={`tab-${tab.id}`}
                  tabIndex={isActive ? 0 : -1}
                  onKeyDown={onTabKeyDown}
                  onClick={(e) => {
                    startTabTransition(() => setActiveTab(tab.id));
                    e.currentTarget.scrollIntoView({
                      behavior: 'smooth',
                      block: 'nearest',
                      inline: 'nearest',
                    });
                  }}
                  className={cn(
                    'group relative flex shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-t-md px-4 py-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-900',
                    isActive
                      ? 'text-primary'
                      : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200',
                  )}
                >
                  <Icon
                    className={cn(
                      'h-4 w-4 transition-transform',
                      isActive
                        ? 'scale-110'
                        : 'text-gray-400 group-hover:scale-105 group-hover:text-gray-600 dark:group-hover:text-gray-300',
                    )}
                  />
                  {tab.label}
                  {isActive && (
                    <motion.span
                      layoutId="cc-tab-indicator"
                      className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-violet-500"
                      transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </LayoutGroup>

      {/* Cross-tab filter bar removed — each tab now detects its own filters
          (date + distinct categorical fields) from its displayed data via
          AuditTable, the way the BI dashboard detects filters from queries.
          `filters.days` stays at its default window for the data fetches. */}

      </div>
      {/* /sticky cluster ───────────────────────────────────────────── */}

      {/* ── Tab Content with smooth crossfade ─────────────────────── */}
      <div
        className="space-y-6"
        role="tabpanel"
        id={`tabpanel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.22, ease: 'easeOut' }}
            className="space-y-6"
          >
            {activeTab === 'overview' && (
              <OverviewTab
                summary={summary}
                moduleHealth={moduleHealth}
                activityFeed={activityFeed}
                loading={tabLoading.overview}
                onRetry={fetchOverview}
                globalDays={filters.days}
                onNavigateTab={goToTab}
              />
            )}
            {activeTab === 'dwh-plan' && (
              <Suspense fallback={<LoadingSection />}>
                <DwhActionPlanTab />
              </Suspense>
            )}
            {activeTab === 'snowflake-objects' && (
              /* Refactored Data Catalog Explorer (UI-first, sample data on the
                 not-yet-wired fields): 8 sub-tabs, KPI grid, AI Discovery,
                 rich object explorer + detail panel with Data360 migration
                 classification. Real ACCOUNT_USAGE on the data sub-tabs. */
              <SnowflakeObjectsTab />
            )}
            {activeTab === 'finops' && (
              tabError.finops && !tabLoading.finops ? (
                <TabErrorState message={tabError.finops} onRetry={fetchCost} />
              ) : (
                <CostTab
                  data={costData}
                  loading={tabLoading.finops}
                  days={filters.days}
                  onNavigateTab={goToTab}
                />
              )
            )}
            {activeTab === 'modules' && (
              <Suspense fallback={<LoadingSection />}>
                <ModulesTab />
              </Suspense>
            )}
            {activeTab === 'platform-activity' && (
              <PlatformActivityTab
                platformData={platformData}
                activityFeed={activityFeed}
                summary={summary}
                loading={tabLoading['platform-activity']}
                onNavigateTab={goToTab}
              />
            )}
            {activeTab === 'projects' && (
              tabError.projects && !tabLoading.projects ? (
                <TabErrorState message={tabError.projects} onRetry={fetchProjects} />
              ) : (
                <ProjectsTab
                  data={projectsData}
                  loading={tabLoading.projects}
                  onRefresh={fetchProjects}
                />
              )
            )}
            {/* Merged Security tab: posture/audit (SecurityAdvTab) stacked with
                the Security Map graph. Two clearly-headed sections, no popup. */}
            {activeTab === 'security' && (
              <div className="space-y-8">
                <section>
                  <h2 className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Security posture &amp; audit
                  </h2>
                  {tabError.security && !tabLoading['security'] ? (
                    <TabErrorState message={tabError.security} onRetry={fetchSecurityAdv} />
                  ) : (
                    <SecurityAdvTab
                      data={securityData}
                      loading={tabLoading['security']}
                      onNavigateTab={goToTab}
                    />
                  )}
                </section>
                <section>
                  <h2 className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Security map
                  </h2>
                  <SecurityMap days={filters.days} />
                </section>
              </div>
            )}
            {/* Merged Organization tab: org summary + ORGADMIN-gated org accounts
                + Snowflake accounts honest-empty states, stacked. Each child owns
                its own ORGADMIN gating + honest empty messaging. */}
            {activeTab === 'organization' && (
              <Suspense fallback={<LoadingSection />}>
                <div className="space-y-8">
                  <section>
                    {/* Self-contained: owns its own date-range + role/module/account
                        filters; does NOT consume the parent global filter bar. */}
                    <OrgSummaryTab />
                  </section>
                  <section>
                    <h2 className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Org accounts
                    </h2>
                    <OrgAccountsTab />
                  </section>
                  <section>
                    <h2 className="mb-3 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Connected Accounts
                    </h2>
                    <SnowflakeAccountsTab />
                  </section>
                </div>
              </Suspense>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
        </div>
        {/* ── Docked Actions right-bar (module action surface) ───────── */}
        {panelOpen && (
          <CommandCenterActionsPanel
            onRefresh={handleRefresh}
            lastUpdated={lastUpdated}
            refreshing={!!tabLoading[activeTab]}
            onClose={() => setPanelOpen(false)}
          />
        )}
      </div>
    </div>
  );
}

// ── Tasks Quick Widget (used in Overview tab) ──

function TasksQuickWidget() {
  const [taskData, setTaskData] = useState<any>(null);
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setStatus('loading');
    apiClient
      .get('/observability/lineage/with-tasks', { params: { days: 7 } })
      .then((res) => {
        if (cancelled) return;
        setTaskData(res.data);
        setStatus('ok');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const active = taskData?.summary?.active_tasks ?? 0;
  const suspended = taskData?.summary?.suspended_tasks ?? 0;
  const succeeded = taskData?.task_stats?.succeeded ?? 0;
  const failed = taskData?.task_stats?.failed ?? 0;
  const total = active + suspended + succeeded + failed;

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
          <Clock className="h-4 w-4 text-blue-500" /> Scheduled Tasks
        </h3>
        <a
          href="/observability"
          className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
        >
          View All &rarr;
        </a>
      </div>
      {status === 'loading' && (
        <div className="grid grid-cols-4 gap-2 text-center">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1">
              <div className="mx-auto h-5 w-8 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
              <div className="mx-auto h-3 w-12 animate-pulse rounded bg-gray-200 dark:bg-gray-700" />
            </div>
          ))}
        </div>
      )}
      {status === 'error' && (
        <div className="flex flex-col items-center justify-center gap-2 py-4 text-center">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">
            Couldn't load tasks
          </p>
          <p className="text-xs text-gray-500">
            Observability endpoint didn't respond.
          </p>
          <button
            onClick={() => setAttempt((a) => a + 1)}
            className="rounded-md border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-200 dark:hover:bg-gray-800"
          >
            Retry
          </button>
        </div>
      )}
      {status === 'ok' && total > 0 && (
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <p className="text-lg font-bold text-green-600">{active}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Active</p>
          </div>
          <div>
            <p className="text-lg font-bold text-amber-600">{suspended}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Suspended</p>
          </div>
          <div>
            <p className="text-lg font-bold text-blue-600">{succeeded}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Succeeded</p>
          </div>
          <div>
            <p className="text-lg font-bold text-red-600">{failed}</p>
            <p className="text-[10px] text-gray-500 dark:text-gray-400">Failed</p>
          </div>
        </div>
      )}
      {status === 'ok' && total === 0 && (
        <div className="flex flex-col items-center justify-center py-4 text-center">
          <div className="text-sm font-medium text-gray-600 dark:text-gray-300">
            No scheduled tasks
          </div>
          <p className="mt-1 text-xs text-gray-500">
            Active and historical task runs appear here once a scheduled task is
            created and executed.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Bootstrap recovery banner ─────────────────────────────────────────────
// Surfaces when the overview-kpis cache schema is missing (most common
// failure mode after account creation) and lets the user re-run the bootstrap
// without having to file a ticket. Detects the OBJECT_NOT_FOUND error code
// or any 404 / "does not exist" message from the kpis hook.
function BootstrapRecoveryBanner({ kpisError }: { kpisError: Error | null }) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<'idle' | 'success' | 'error'>('idle');
  const [resultMsg, setResultMsg] = useState<string>('');

  if (!kpisError) return null;

  // Best-effort match — the error message may be a plain string or a wrapped
  // axios error. We only show the banner for the "missing object" class of
  // failure, not for generic transport errors.
  const msg = String(kpisError.message ?? '');
  const isMissingObject =
    /does not exist|OBJECT_NOT_FOUND|DATA360_CACHE|object_not_found/i.test(msg);
  if (!isMissingObject && result !== 'success') return null;

  const runBootstrap = async () => {
    setRunning(true);
    setResult('idle');
    try {
      await apiClient.post('/user/bootstrap-account/');
      setResult('success');
      setResultMsg(
        'Bootstrap completed. The Overview KPIs cache will populate within ~5 minutes (next backend task tick).',
      );
    } catch (e) {
      setResult('error');
      const detail = (e as any)?.response?.data?.detail?.message
        ?? (e as Error)?.message
        ?? 'Unknown error';
      setResultMsg(String(detail));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-xs dark:border-blue-900/40 dark:bg-blue-900/20">
      <div className="flex flex-wrap items-center justify-between gap-2 text-blue-900 dark:text-blue-200">
        <div className="flex-1 min-w-0">
          <p className="font-semibold">Overview cache not initialised</p>
          <p className="mt-0.5 text-blue-700 dark:text-blue-300">
            The Snowflake schema <code>CP_DATA360.DATA360_CACHE</code> is
            missing or unauthorised for this account. The Overview tab falls
            back to live queries (8-25s) until it's created.
          </p>
        </div>
        <button
          onClick={runBootstrap}
          disabled={running}
          className="inline-flex items-center gap-1.5 rounded-md border border-blue-300 bg-white px-3 py-1.5 text-[11px] font-medium text-blue-800 transition-colors hover:bg-blue-100 disabled:cursor-wait disabled:opacity-60 dark:border-blue-700 dark:bg-blue-900/40 dark:text-blue-100 dark:hover:bg-blue-900/60"
        >
          {running && (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-blue-300 border-t-transparent" />
          )}
          {running ? 'Bootstrapping…' : 'Re-run bootstrap'}
        </button>
      </div>
      {result === 'success' && (
        <p className="mt-2 rounded bg-green-50 px-2 py-1 text-[11px] text-green-800 dark:bg-green-900/30 dark:text-green-200">
          {resultMsg}
        </p>
      )}
      {result === 'error' && (
        <p className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-800 dark:bg-red-900/30 dark:text-red-200">
          Bootstrap failed: {resultMsg}
        </p>
      )}
    </div>
  );
}

// Admin-only "Provision KPIs" affordance. Shown when the OVERVIEW_KPIS cache
// table is unprovisioned (the synthetic empty payload → `provisioned === false`)
// AND the caller holds an admin role. Calls POST /command-center/overview-kpis/install
// (creates Snowflake objects), behind a confirm, and reports the outcome
// honestly — including the "endpoint not deployed yet" (404) and "not
// permitted" (403) cases. The client role gate is UX-only; the backend 403 is
// the real guard.
function ProvisionKpisBanner({
  onProvisioned,
}: {
  onProvisioned: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [outcome, setOutcome] = useState<
    | { kind: 'idle' }
    | { kind: 'ok' }
    | { kind: 'not-deployed' }
    | { kind: 'forbidden'; message: string }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });

  const provision = async () => {
    if (
      typeof window !== 'undefined' &&
      !window.confirm(
        'Provision the Overview KPIs cache?\n\nThis creates Snowflake objects (a cache table, a stored procedure, and refresh tasks) under CP_DATA360.DATA360_CACHE. Continue?',
      )
    ) {
      return;
    }
    setRunning(true);
    setOutcome({ kind: 'idle' });
    const res = await installOverviewKpis();
    setRunning(false);
    if (res.status === 'ok') {
      setOutcome({ kind: 'ok' });
      onProvisioned();
    } else if (res.status === 'not-deployed') {
      setOutcome({ kind: 'not-deployed' });
    } else if (res.status === 'forbidden') {
      setOutcome({ kind: 'forbidden', message: res.message });
    } else {
      setOutcome({ kind: 'error', message: res.message });
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-xs dark:border-indigo-900/40 dark:bg-indigo-900/20">
      <div className="flex flex-wrap items-center justify-between gap-2 text-indigo-900 dark:text-indigo-200">
        <div className="flex-1 min-w-0">
          <p className="font-semibold">Overview KPIs not provisioned</p>
          <p className="mt-0.5 text-indigo-700 dark:text-indigo-300">
            The fast Overview cache (<code>OVERVIEW_KPIS</code>) isn't installed
            for this account, so cache-only metrics show as{' '}
            <span className="font-mono">—</span> and the rest fall back to the
            live summary. Provision it to enable the full Overview snapshot.
          </p>
        </div>
        <button
          onClick={provision}
          disabled={running}
          className="inline-flex items-center gap-1.5 rounded-md border border-indigo-300 bg-white px-3 py-1.5 text-[11px] font-medium text-indigo-800 transition-colors hover:bg-indigo-100 disabled:cursor-wait disabled:opacity-60 dark:border-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-100 dark:hover:bg-indigo-900/60"
        >
          {running && (
            <span className="h-3 w-3 animate-spin rounded-full border-2 border-indigo-300 border-t-transparent" />
          )}
          {running ? 'Provisioning…' : 'Provision KPIs'}
        </button>
      </div>
      {outcome.kind === 'ok' && (
        <p className="mt-2 rounded bg-green-50 px-2 py-1 text-[11px] text-green-800 dark:bg-green-900/30 dark:text-green-200">
          Provisioning started. The cache will populate within ~5 minutes (next
          backend task tick) — this view refreshes automatically.
        </p>
      )}
      {outcome.kind === 'not-deployed' && (
        <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          Not available on this backend yet — the install endpoint
          (POST /command-center/overview-kpis/install) isn't deployed on this
          environment.
        </p>
      )}
      {outcome.kind === 'forbidden' && (
        <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
          Your role can't provision this: {outcome.message}
        </p>
      )}
      {outcome.kind === 'error' && (
        <p className="mt-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-800 dark:bg-red-900/30 dark:text-red-200">
          Provisioning failed: {outcome.message}
        </p>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// Cross-cutting actionable CTAs (recommendations + deterministic chips)
// ═════════════════════════════════════════════════════════════════════════════
//
// `useRecommendations(dimension)` reads the backend's structured, CTA-bearing
// recommendations for ONE dimension (valid: dq · gov · perf · storage · cost).
// A 404 (route not provisioned) or 400 (unknown dimension) resolves to an empty
// list, so `RecoCtaList` renders nothing rather than a broken panel — the CTAs
// light up automatically when the backend ships them (no redeploy).

function useRecommendations(dimension: string, days?: number) {
  const [recommendations, setRecommendations] = useState<CcRecommendation[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let ignore = false;
    setLoading(true);
    getCommandCenterRecommendationsForDimension(dimension, days)
      .then((res) => {
        if (ignore) return;
        setRecommendations(
          Array.isArray(res?.recommendations) ? res.recommendations : [],
        );
        setLoading(false);
      })
      .catch(() => {
        // 404 (not provisioned) / 400 (unknown dimension) / network → no
        // actionable recos on this backend; render nothing (never a fake panel).
        if (ignore) return;
        setRecommendations([]);
        setLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [dimension, days]);
  return { recommendations, loading };
}

/** Same-page tab targets (e.g. `/account-overview?tab=finops`) must switch the
 *  active tab in-place — the dashboard only reads `?tab=` at mount, so a plain
 *  <Link> would change the URL without switching tabs. */
const SAME_PAGE_TAB_RE = /^\/account-overview\?tab=([\w-]+)/;

function recoSevDot(sev?: string): string {
  const s = (sev || '').toLowerCase();
  if (s === 'critical' || s === 'high') return 'bg-red-500';
  if (s === 'warning' || s === 'medium') return 'bg-amber-500';
  return 'bg-blue-500';
}

const CTA_CHIP_CLS =
  'inline-flex flex-shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors';

const CTA_TONE: Record<'amber' | 'red' | 'blue' | 'green', string> = {
  amber:
    'border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/30',
  red: 'border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300 dark:hover:bg-red-900/30',
  blue: 'border-blue-300 text-blue-700 hover:bg-blue-100 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-900/30',
  green:
    'border-emerald-300 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-700 dark:text-emerald-300 dark:hover:bg-emerald-900/30',
};

/** A deterministic, threshold-driven CTA chip (navigate to a route or switch a
 *  tab). Use for the honest, computed-on-the-client calls to action. */
function ActionChip({
  label,
  href,
  onClick,
  tone = 'amber',
  icon: Icon = ArrowUpRight,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  tone?: 'amber' | 'red' | 'blue' | 'green';
  icon?: React.ElementType;
}) {
  const cls = cn(CTA_CHIP_CLS, CTA_TONE[tone]);
  const inner = (
    <>
      {Icon ? <Icon className="h-3 w-3" /> : null}
      {label}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/** Renders one backend recommendation's CTA — routing same-page `?tab=` targets
 *  through `onNavigateTab` and everything else through a real <Link>. */
function RecoCtaButton({
  cta,
  onNavigateTab,
}: {
  cta: CcRecommendationCta;
  onNavigateTab?: (id: string) => void;
}) {
  const cls = cn(CTA_CHIP_CLS, CTA_TONE.blue);
  const inner = (
    <>
      {cta.label}
      <ArrowUpRight className="h-3 w-3" />
    </>
  );
  const m = SAME_PAGE_TAB_RE.exec(cta.target || '');
  if (m && onNavigateTab) {
    const tab = m[1];
    return (
      <button type="button" onClick={() => onNavigateTab(tab)} className={cls}>
        {inner}
      </button>
    );
  }
  return (
    <Link href={cta.target || '#'} className={cls}>
      {inner}
    </Link>
  );
}

/** A compact, self-contained list of the backend's actionable recommendations
 *  for one dimension. Renders nothing when there are none (honest empty). CTAs
 *  that point at the tab we're already on are dropped (circular). */
function RecoCtaList({
  dimension,
  days,
  currentTab,
  onNavigateTab,
  title = 'Recommended actions',
  max = 4,
  exclude,
}: {
  dimension: string;
  days?: number;
  currentTab?: string;
  onNavigateTab?: (id: string) => void;
  title?: string;
  max?: number;
  /** Drop recos already covered by a deterministic chip (avoids dup CTAs). */
  exclude?: (r: CcRecommendation) => boolean;
}) {
  const { recommendations } = useRecommendations(dimension, days);
  const items = useMemo(
    () =>
      recommendations
        .filter((r) => r?.cta?.label && r?.cta?.target)
        .filter((r) => !(exclude && exclude(r)))
        .filter((r) => {
          const m = SAME_PAGE_TAB_RE.exec(r.cta?.target || '');
          return !(m && currentTab && m[1] === currentTab);
        })
        .slice(0, max),
    [recommendations, currentTab, max, exclude],
  );

  if (items.length === 0) return null;

  return (
    <SectionCard title={title}>
      <ul className="space-y-2">
        {items.map((r) => (
          <li
            key={r.id}
            className="flex items-start justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/30"
          >
            <div className="flex min-w-0 items-start gap-2">
              <span
                className={cn(
                  'mt-1 h-2 w-2 flex-shrink-0 rounded-full',
                  recoSevDot(r.severity),
                )}
              />
              <div className="min-w-0">
                <p className="text-xs font-medium text-gray-900 dark:text-white">
                  {r.title}
                </p>
                {r.detail ? (
                  <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                    {r.detail}
                  </p>
                ) : null}
              </div>
            </div>
            <RecoCtaButton cta={r.cta} onNavigateTab={onNavigateTab} />
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

/** Inline body for the FinOps "Optimization Recommendations" panel — wires the
 *  real `cost`-dimension recommendations (Create budget / review sizing …) as
 *  CTAs. Drops the circular "open finops" CTA. Honest empty when none. */
function FinOpsCostRecos({
  onNavigateTab,
}: {
  onNavigateTab?: (id: string) => void;
}) {
  const { recommendations } = useRecommendations('cost');
  const items = recommendations
    .filter((r) => r?.cta?.label && r?.cta?.target)
    .filter((r) => {
      const m = SAME_PAGE_TAB_RE.exec(r.cta?.target || '');
      return !(m && m[1] === 'finops'); // we're already on FinOps — drop circular
    })
    .slice(0, 5);

  if (items.length === 0) {
    return (
      <p className="py-8 text-center text-xs text-gray-400">
        No optimization recommendations yet.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {items.map((r) => (
        <li
          key={r.id}
          className="rounded-lg bg-amber-50 p-3 dark:bg-amber-900/10"
        >
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-gray-900 dark:text-white">
                {r.title}
              </p>
              {r.detail ? (
                <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                  {r.detail}
                </p>
              ) : null}
              {r.business_impact ? (
                <p className="mt-1 text-[11px] italic text-gray-400 dark:text-gray-500">
                  {r.business_impact}
                </p>
              ) : null}
              {(r.roi?.estimate || r.ttm) ? (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {r.roi?.estimate ? (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                      {r.roi.estimate}
                    </span>
                  ) : null}
                  {r.ttm ? (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                      {r.ttm}
                    </span>
                  ) : null}
                </div>
              ) : null}
              <div className="mt-2">
                <RecoCtaButton cta={r.cta} onNavigateTab={onNavigateTab} />
              </div>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// TAB 1: OVERVIEW
// ═════════════════════════════════════════════════════════════════════════════

const OverviewTab = memo(function OverviewTab({
  summary,
  moduleHealth,
  activityFeed,
  loading,
  onRetry,
  globalDays,
  onNavigateTab,
}: {
  onRetry?: () => void;
  summary: SummaryResponse | null;
  moduleHealth: ModuleHealthResponse | null;
  activityFeed: ActivityFeedResponse | null;
  loading: boolean;
  /** Drill-down: switch the parent dashboard to another tab. */
  onNavigateTab?: (id: string) => void;
  /**
   * The global Time Range value (days) coming from the parent filter bar.
   * The hero-strip range picker syncs to this so the user only has ONE
   * source of truth for the time window. Previously the two were
   * independent and that's what made the date filters "feel broken" —
   * the global filter would update the summary/module-health calls while
   * the hero picker kept the KPI cache stuck on a different range.
   */
  globalDays?: number;
}) {
  /**
   * Cache-backed KPI source — single round-trip to
   * `DATA360_CACHE.OVERVIEW_KPIS` (refreshed every 5 min by a Snowflake
   * TASK). Falls back to the legacy `summary` payload when the cache row
   * isn't there yet (e.g. cold-start in a fresh account).
   */
  // Initial range derived from the parent's global Time Range, so first
  // render matches what the rest of the page is showing.
  const daysToRange = (d: number): OverviewRange => {
    if (d <= 1) return '24h';
    if (d <= 7) return '7d';
    if (d <= 30) return '30d';
    return '90d';
  };
  const {
    range,
    setRange,
    data: kpis,
    loading: kpisLoading,
    refreshing,
    error: kpisError,
    refresh: refreshKpis,
  } = useOverviewKpis(daysToRange(globalDays ?? 30));

  // Role gates the admin-only "Provision KPIs" affordance (UX gate only —
  // the backend 403 is the real guard).
  const { role } = useAuth();

  // Compact the AI recommendations block so the Overview isn't a long scroll.
  // The three advisors (Snowflake insights · AI advisor · top problems) live
  // in a single collapsible, bounded-height panel — expanded by default but
  // capped at a scrollable summary rather than a full-page wall of lists.
  const [aiRecosOpen, setAiRecosOpen] = useState(true);

  // Sync hero range picker to the global Time Range whenever the parent
  // changes it. Without this, the user clicks "7d" in the global filter
  // bar, summary/module-health refetch with days=7, but the KPI cache
  // call still uses range=30d → mixed-window data → "filter doesn't work".
  useEffect(() => {
    if (globalDays === undefined) return;
    const next = daysToRange(globalDays);
    if (next !== range) setRange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [globalDays]);

  // Only skeleton while we're actively loading AND we have nothing to show.
  // If kpis or summary has landed, we can render immediately — partial data
  // is better than a 25s spinner.
  if (loading && !summary && !kpis) return <LoadingSection />;
  // Backend may return a structured empty envelope with _fallback=true when
  // the metadata DB / ACCOUNT_USAGE views aren't reachable.
  const summaryFallback = (summary as { _fallback?: boolean } | null)?._fallback === true;
  // Hard-fail state: nothing landed at all (neither summary nor kpis) AND
  // we're no longer loading — surface a retry instead of empty cards.
  if (!summary && !kpis && !loading) {
    return (
      <div className="mx-4 mt-6 rounded-xl border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/40 dark:bg-amber-900/20">
        <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Couldn't load the overview
        </h3>
        <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
          Both /command-center/summary and /command-center/overview-kpis
          didn't respond. Retry, or switch to another tab.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={() => {
              onRetry?.();
              refreshKpis();
            }}
            className="inline-flex items-center rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // gradeColor + obsKpis radarData removed: the Observability Scores card
  // they fed (`/observability/intelligent-kpis`) was gated to render only
  // when scores were non-zero, but the endpoint payload never included
  // populated scores. We removed both the call and the widget.

  // The kpis payload is "real" unless it's the synthetic empty envelope the
  // service returns when the OVERVIEW_KPIS cache table is unprovisioned (404).
  // When NOT provisioned we must NOT trust its all-zero fields — fall the
  // cards back to /command-center/summary, or render "—" (no fake 0s).
  const provisioned = kpis?._provisioned !== false;
  // KPI-cache provisioning has no granular Action-RBAC action to gate on, so
  // this stays a coarse admin-role check — via the shared isAdminRole helper
  // rather than an inline role-array literal.
  const isAdmin = isAdminRole(role);

  // Prefer cache row over legacy summary call.
  // NOTE: `Number(x) ?? 0` is a trap — Number(undefined) is NaN and `?? 0`
  // does NOT catch NaN, so missing summary fields used to render "NaN%·NaN".
  // safeNum() coerces null/undefined/NaN/Infinity to the fallback.
  // The `provisioned ? … : undefined` guard makes the kpis side fall THROUGH
  // to summary when the cache is missing (a raw `0 ?? summary` short-circuits).
  // Honest values: real number when present, else `null` → "—" (no fake 0s).
  const creditsUsed =
    (provisioned ? safeNumOrNull(kpis?.credits_used) : null) ??
    safeNumOrNull(summary?.cost?.credits_30d);
  const activeUsers =
    (provisioned ? safeNumOrNull(kpis?.data360_users) : null) ??
    safeNumOrNull(summary?.platform?.active_users_7d);
  const totalProjects =
    (provisioned ? safeNumOrNull(kpis?.active_projects) : null) ??
    safeNumOrNull(summary?.platform?.total_projects);
  const qualityScore =
    (provisioned ? safeNumOrNull(kpis?.workspace_health_pct) : null) ??
    safeNumOrNull(summary?.quality?.health_score);
  const mfaCoverage = safeNumOrNull(summary?.security?.mfa_coverage_pct);
  const aiModels = safeNumOrNull(summary?.ai?.semantic_models);
  const cacheAgeLabel = (() => {
    if (kpisLoading && !kpis) return 'Loading…';
    if (!kpis?.cache_age_seconds && kpis?.cache_age_seconds !== 0) return null;
    const s = kpis.cache_age_seconds;
    if (s < 60) return `Updated ${Math.round(s)}s ago`;
    if (s < 3600) return `Updated ${Math.round(s / 60)} min ago`;
    return `Updated ${Math.round(s / 3600)}h ago`;
  })();

  // Identity strip values (from cached payload — see Screens/Account-overview/01-overview/_features.md).
  const subscriptionEndLabel = (() => {
    if (!kpis?.subscription_end) return '—';
    const d = new Date(kpis.subscription_end);
    if (Number.isNaN(d.getTime())) return kpis.subscription_end;
    const diffDays = Math.round((d.getTime() - Date.now()) / 86_400_000);
    return `${d.toLocaleDateString()} (${diffDays >= 0 ? `${diffDays}d left` : `${Math.abs(diffDays)}d ago`})`;
  })();
  // Days until subscription end (null when unknown) — drives the expiry banner.
  const subscriptionDaysLeft = (() => {
    if (!kpis?.subscription_end) return null;
    const d = new Date(kpis.subscription_end);
    if (Number.isNaN(d.getTime())) return null;
    return Math.round((d.getTime() - Date.now()) / 86_400_000);
  })();

  // ── P1 zero-cost derived KPIs (all fields already in the response types).
  //    kpis-derived values respect the `provisioned` gate at render; summary-
  //    derived ones guard on the relevant sub-object existing. Every ratio
  //    guards its denominator so a 0 never renders as "NaN%". ──────────────
  const fmtBytes = (b: number): string => {
    if (!b || b <= 0) return '0 B';
    const tb = b / 1024 ** 4;
    if (tb >= 1) return `${tb.toFixed(2)} TB`;
    const gb = b / 1024 ** 3;
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = b / 1024 ** 2;
    if (mb >= 1) return `${mb.toFixed(1)} MB`;
    const kb = b / 1024;
    if (kb >= 1) return `${kb.toFixed(1)} KB`;
    return `${Math.round(b)} B`;
  };
  const deploySuccessRate = (() => {
    const total = safeNum(kpis?.deployments_30d, 0);
    const failed = safeNum(kpis?.deployments_30d_failed, 0);
    // null (not 0) when there's nothing to report — the Overview tab renders
    // "—" rather than a fake 0% (which would read as "everything failed").
    return total > 0 ? Math.round(((total - failed) / total) * 100) : null;
  })();
  const taskFailureRate = (() => {
    const total = safeNum(kpis?.workflow_runs_24h, 0);
    const failed = safeNum(kpis?.workflow_runs_24h_failed, 0);
    return total > 0 ? Math.round((failed / total) * 100) : null;
  })();
  const adoptionRate = (() => {
    const total = safeNum(summary?.platform?.total_users, 0);
    const active = safeNum(summary?.platform?.active_users_7d, 0);
    return total > 0 ? Math.round((active / total) * 100) : null;
  })();
  const cortexSpend = safeNum(kpis?.cortex_credits, 0);
  const failedLogins7d = safeNum(summary?.security?.failed_logins_7d, 0);
  const securityPolicies =
    safeNum(summary?.security?.masking_policies, 0) +
    safeNum(summary?.security?.rls_policies, 0);
  const hasSecuritySummary = !!summary?.security;
  const hasPlatformSummary = !!summary?.platform;
  const storageTotalBytes = safeNum(kpis?.storage_bytes, 0);
  const stageBytes = safeNum(kpis?.stage_bytes, 0);
  const failsafeBytes = safeNum(kpis?.failsafe_bytes, 0);

  return (
    <div className="space-y-6">
      {/* Backend served an empty envelope — the Snowflake metadata tables or
          ACCOUNT_USAGE views aren't readable for this account. Show one
          clear notice instead of leaving the user puzzled at all-zero cards. */}
      {summaryFallback && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
          <span className="font-semibold">Limited data available.</span>{' '}
          Some analytics views (e.g. <code>SNOWFLAKE.ACCOUNT_USAGE.*</code>,
          <code> CP_DATA360.EVENT_STORE.*</code>) are not readable with the
          current role. KPIs that depend on them show as zero.
        </div>
      )}
      {/* Partial-failure banner: rendering from cached KPIs but the slower
          summary call didn't return. User can retry just that call without
          reloading the whole page. */}
      {!summary && kpis && !loading && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200">
          <span>
            <span className="font-semibold">Showing cached snapshot.</span> Live
            summary (MFA, AI models, quality) didn't respond yet.
          </span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="inline-flex items-center rounded-md border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60"
            >
              Retry
            </button>
          )}
        </div>
      )}
      {/* Bootstrap recovery banner: the overview-kpis cache lives in a
          Snowflake schema (CP_DATA360.DATA360_CACHE) that must be created
          during account bootstrap. If it's missing, kpisError will be set —
          surface a one-click action to re-run the bootstrap rather than
          leaving the user staring at "live mode" forever. */}
      <BootstrapRecoveryBanner kpisError={kpisError} />
      {/* Provision-KPIs affordance: surfaces when the OVERVIEW_KPIS cache is
          unprovisioned (the synthetic empty payload sets _provisioned=false,
          which a swallowed 404 would otherwise hide) and the user is an admin.
          BootstrapRecoveryBanner above only fires on a THROWN error, which the
          404→empty-payload path no longer raises — so this is the affordance
          users actually see on the unprovisioned backend. */}
      {!provisioned && isAdmin && (
        <ProvisionKpisBanner onProvisioned={() => void refreshKpis()} />
      )}

      {/* Hero strip — Snowflake account identity. The visual anchor of the
          page: gradient background, larger account name, badges grouped on
          the left, range picker + refresh on the right. */}
      <div className="overflow-hidden rounded-2xl border border-blue-100 bg-gradient-to-r from-blue-50 via-white to-indigo-50/50 dark:border-blue-900/40 dark:from-blue-950/40 dark:via-gray-900 dark:to-indigo-950/30">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600/10 dark:bg-blue-400/10">
              <Database className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold leading-tight text-gray-900 dark:text-white">
                  {kpis?.account_name ?? '—'}
                </span>
                {kpis?.edition && (
                  <span className="rounded-md bg-blue-600/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700 dark:bg-blue-400/15 dark:text-blue-300">
                    {kpis.edition}
                  </span>
                )}
                {kpis?.region && (
                  <span className="rounded-md bg-slate-200/60 px-1.5 py-0.5 text-[10px] font-medium text-slate-700 dark:bg-slate-700/50 dark:text-slate-300">
                    {kpis.region}
                  </span>
                )}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-600 dark:text-slate-400">
                {kpis?.account_locator && (
                  <span>{kpis.account_locator}</span>
                )}
                {kpis?.current_role && (
                  <span>
                    role <span className="font-medium text-slate-700 dark:text-slate-300">{kpis.current_role}</span>
                  </span>
                )}
                <span>
                  subscription <span className="font-medium text-slate-700 dark:text-slate-300">{subscriptionEndLabel}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            {(cacheAgeLabel || kpisError) && (
              <div className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                {cacheAgeLabel && <span>{cacheAgeLabel}</span>}
                {kpisError && (
                  <span
                    className="font-medium text-amber-600 dark:text-amber-400"
                    title={kpisError.message || 'overview-kpis cache unavailable'}
                  >
                    · live mode
                  </span>
                )}
              </div>
            )}
            {/* Window indicator — read-only badge that mirrors the global
                Time Range filter above. The redundant per-tab range picker
                was removed because (a) it duplicated the global filter
                without syncing, which made the page feel broken, and
                (b) the only endpoint it controlled was overview-kpis,
                whose backend cache is sometimes missing. Now there is
                ONE source of truth: the Time Range bar at the top. */}
            <span className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <Calendar className="h-3 w-3 text-slate-400" />
              <span className="tabular-nums">{range}</span>
              <span className="text-slate-400">window</span>
            </span>
            <motion.button
              whileHover={!refreshing ? { scale: 1.03 } : undefined}
              whileTap={!refreshing ? { scale: 0.97 } : undefined}
              onClick={() => void refreshKpis()}
              disabled={refreshing}
              className="group flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50 hover:shadow-md disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-700"
            >
              <RefreshCw
                className={cn(
                  'h-3.5 w-3.5 transition-transform duration-500',
                  refreshing ? 'animate-spin' : 'group-hover:rotate-180',
                )}
              />
              Refresh cache
            </motion.button>
          </div>
        </div>
      </div>

      {/* Subscription-expiry banner — only when a real end date is within 30d. */}
      {subscriptionDaysLeft != null && subscriptionDaysLeft < 30 ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/20">
          <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
            <Calendar className="h-4 w-4 flex-shrink-0" />
            <span>
              {subscriptionDaysLeft >= 0
                ? `Subscription expires in ${subscriptionDaysLeft} day${subscriptionDaysLeft === 1 ? '' : 's'}.`
                : `Subscription expired ${Math.abs(subscriptionDaysLeft)} day${Math.abs(subscriptionDaysLeft) === 1 ? '' : 's'} ago.`}
            </span>
          </div>
          <ActionChip
            label="Review accounts"
            tone="amber"
            onClick={() => onNavigateTab?.('organization')}
          />
        </div>
      ) : null}

      {/* Tab-level actionable CTAs — drill into cost, enforce MFA, enable
          modules. Each is gated on a real signal (no fake prompts). */}
      <div className="flex flex-wrap items-center gap-2">
        <ActionChip
          label="View cost drivers"
          tone="amber"
          icon={DollarSign}
          onClick={() => onNavigateTab?.('finops')}
        />
        {mfaCoverage != null && mfaCoverage < 80 ? (
          <ActionChip
            label="Require MFA"
            tone="red"
            icon={Lock}
            href="/governance/users"
          />
        ) : null}
        {provisioned &&
        kpis?.modules_total != null &&
        (kpis.modules_active ?? 0) < kpis.modules_total ? (
          <ActionChip
            label="Enable modules"
            tone="blue"
            icon={Layers}
            onClick={() => onNavigateTab?.('modules')}
          />
        ) : null}
      </div>

      {/* ── Executive overview: real cross-tab Data360 × Snowflake summary
             (live endpoints; replaces the cards gated on the dead KPI cache) ── */}
      <ExecutiveOverview days={globalDays ?? 30} onNavigateTab={onNavigateTab} />

      {/* ── What changed this week? — cost-spike anomalies (z-score) from the
             last 7 days. Separate signal from the recommendations panels below;
             degrades silently to null when the endpoint is role-gated. ── */}
      <WhatChangedCard />

      {/* ── AI recommendations: Snowflake-feature insights · ready module
             actions · top cross-tab problems. Compacted into ONE collapsible,
             bounded-height panel (scrollable summary) so the Overview stays
             skimmable instead of a long stacked wall of lists. Data is real;
             only the display is tightened. ── */}
      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900/40">
        <button
          type="button"
          onClick={() => setAiRecosOpen((o) => !o)}
          aria-expanded={aiRecosOpen}
          className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40"
        >
          <span className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            <Sparkles className="h-3.5 w-3.5" />
            AI recommendations
          </span>
          {aiRecosOpen ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>
        {aiRecosOpen && (
          <div className="max-h-[28rem] space-y-4 overflow-y-auto border-t border-slate-100 px-4 py-4 dark:border-slate-800">
            <SnowflakeInsightsAdvisor />
            <AiAdvisor days={globalDays ?? 30} />
            <TopProblemsPanel
              days={globalDays ?? 30}
              limit={4}
              onNavigateTab={onNavigateTab}
            />
          </div>
        )}
      </section>

      {/* ── KPI section: 6 primary metrics ─────────────────────────── */}
      <section>
        <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Key metrics
        </h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label={`Active Users (${range})`}
          value={activeUsers}
          icon={Users}
          color="blue"
        />
        <KpiCard
          label="Connected Accounts"
          value={provisioned ? kpis?.connected_accounts ?? null : null}
          icon={Database}
          color="cyan"
          onActivate={() => onNavigateTab?.('organization')}
        />
        <KpiCard
          label="Active Projects"
          value={totalProjects}
          icon={Box}
          color="violet"
          onActivate={() => onNavigateTab?.('projects')}
        />
        <KpiCard
          label="Modules Active"
          value={
            provisioned && kpis?.modules_total != null
              ? `${kpis?.modules_active ?? 0}/${kpis.modules_total}`
              : null
          }
          icon={Layers}
          color="indigo"
          onActivate={() => onNavigateTab?.('modules')}
        />
        <KpiCard
          label={`Credits (${range})`}
          value={creditsUsed}
          icon={DollarSign}
          color="amber"
          trend={Number(summary?.cost?.credit_trend_pct) || undefined}
          help={{
            title: 'Credits',
            definition: 'Compute consumption units billed for query and pipeline execution over the selected period.',
            source: 'data warehouse metering history',
          }}
          onActivate={() => onNavigateTab?.('finops')}
        />
        <KpiCard
          label="Open Alerts"
          value={provisioned ? kpis?.open_alerts ?? null : null}
          icon={AlertTriangle}
          color={provisioned && (kpis?.open_alerts ?? 0) > 0 ? 'rose' : 'green'}
          onActivate={() => onNavigateTab?.('security')}
        />
      </div>
      </section>

      {/* ── Health gauges section ──────────────────────────────────── */}
      <section>
        <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Health & posture
        </h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          label="Workspace Health"
          value={qualityScore != null ? `${qualityScore}%` : null}
          icon={CheckCircle}
          color="green"
        />
        <KpiCard
          label="Warehouse Health"
          value={
            provisioned && kpis?.snowflake_health_pct != null
              ? `${kpis.snowflake_health_pct}%`
              : null
          }
          icon={Gauge}
          color="blue"
        />
        <KpiCard
          label="Optimization Score"
          value={
            provisioned && kpis?.optimization_score_pct != null
              ? `${kpis.optimization_score_pct}%`
              : null
          }
          icon={Zap}
          color="amber"
        />
        <KpiCard
          label="MFA / AI Models"
          value={
            mfaCoverage != null || aiModels != null
              ? `${mfaCoverage != null ? `${mfaCoverage}%` : '—'} · ${aiModels != null ? aiModels : '—'}`
              : null
          }
          icon={Shield}
          color="rose"
        />
      </div>
      </section>

      {/* ── Operations & security section (P1 zero-cost renders) ────────── */}
      <section>
        <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Operations &amp; security
        </h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="Deploy Success (30d)"
          value={
            provisioned && deploySuccessRate !== null
              ? `${deploySuccessRate}%`
              : '—'
          }
          icon={Rocket}
          color="green"
        />
        <KpiCard
          label="Task Failure (24h)"
          value={
            provisioned && taskFailureRate !== null
              ? `${taskFailureRate}%`
              : '—'
          }
          icon={AlertTriangle}
          color={
            provisioned && (taskFailureRate ?? 0) > 0 ? 'rose' : 'green'
          }
        />
        <KpiCard
          label="AI Spend"
          value={provisioned ? cortexSpend.toLocaleString() : null}
          icon={Sparkles}
          color="violet"
          onActivate={() => onNavigateTab?.('finops')}
        />
        <KpiCard
          label="Adoption Rate"
          value={
            hasPlatformSummary && adoptionRate !== null
              ? `${adoptionRate}%`
              : '—'
          }
          icon={Users}
          color="blue"
        />
        <KpiCard
          label="Failed Logins (7d)"
          value={hasSecuritySummary ? failedLogins7d : '—'}
          icon={Lock}
          color={hasSecuritySummary && failedLogins7d > 0 ? 'rose' : 'green'}
        />
        <KpiCard
          label="Security Policies"
          value={hasSecuritySummary ? securityPolicies : '—'}
          icon={ShieldCheck}
          color="indigo"
        />
      </div>
      </section>

      {/* Storage breakdown (database/total vs stage vs failsafe) — from the
          cached KPI payload; shows "—" until OVERVIEW_KPIS is provisioned. */}
      <SectionCard title="Storage Breakdown">
        {provisioned ? (
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-blue-50 p-4 text-center dark:bg-blue-900/20">
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                {fmtBytes(storageTotalBytes)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Total</p>
            </div>
            <div className="rounded-lg bg-violet-50 p-4 text-center dark:bg-violet-900/20">
              <p className="text-xl font-bold text-violet-600 dark:text-violet-400">
                {fmtBytes(stageBytes)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Stage</p>
            </div>
            <div className="rounded-lg bg-amber-50 p-4 text-center dark:bg-amber-900/20">
              <p className="text-xl font-bold text-amber-600 dark:text-amber-400">
                {fmtBytes(failsafeBytes)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Failsafe
              </p>
            </div>
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-gray-400">
            Storage breakdown appears once the KPI cache is provisioned.
          </p>
        )}
      </SectionCard>

      {/* Module Health Grid */}
      {moduleHealth && Array.isArray(moduleHealth.modules) && moduleHealth.modules.length > 0 && (
        <SectionCard title="Module Health">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {moduleHealth.modules.map((m) => {
              // Backend uses status_reason (e.g. "4 stages, 0 streams, 0 tasks");
              // older builds returned key_metric. Pick whichever is populated.
              const subtitle =
                (typeof m.status_reason === 'string' && m.status_reason) ||
                (typeof m.key_metric === 'string' && m.key_metric) ||
                '';
              const dot = STATUS_BG[m.status] ?? 'bg-gray-300 dark:bg-gray-600';
              const healthScore =
                typeof m.health_score === 'number' ? m.health_score : null;
              const issues = Array.isArray(m.issues) ? m.issues : [];
              const hasCritical = issues.some(
                (it) => (it?.severity ?? '').toLowerCase() === 'critical',
              );
              return (
                <div
                  key={m.module_key}
                  className="rounded-lg border border-gray-100 p-3 dark:border-gray-800"
                  title={m.status}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'h-2.5 w-2.5 flex-shrink-0 rounded-full',
                        dot,
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                        {safeStr(m.module)}
                      </p>
                      <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                        {subtitle}
                      </p>
                    </div>
                    {issues.length > 0 && (
                      <span
                        className={cn(
                          'flex-shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold',
                          hasCritical
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
                        )}
                        title={issues
                          .map((it) => safeStr(it?.message))
                          .filter(Boolean)
                          .join('\n')}
                      >
                        {issues.length}{' '}
                        {issues.length === 1 ? 'issue' : 'issues'}
                      </span>
                    )}
                  </div>
                  {healthScore !== null && (
                    <div className="mt-2">
                      <div className="mb-1 flex items-center justify-between text-[10px] text-gray-500 dark:text-gray-400">
                        <span>Health</span>
                        <span className="tabular-nums">
                          {Math.round(healthScore)}%
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                        <div
                          className={cn(
                            'h-full rounded-full transition-all',
                            healthScore >= 80
                              ? 'bg-green-500'
                              : healthScore >= 50
                                ? 'bg-amber-500'
                                : 'bg-red-500',
                          )}
                          style={{
                            width: `${Math.max(0, Math.min(100, healthScore))}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* ── Workspace Overview composite + Snowflake Account Overview rail ── */}
      {(() => {
        const projectsByType =
          (kpis?.projects_by_type as Record<string, number> | null) ??
          ((summary as unknown as { platform?: { projects_by_type?: Record<string, number> | null } })
            ?.platform?.projects_by_type ?? null);
        const modulesByType =
          (kpis?.module_usage_7d as Record<string, number> | null) ??
          ((summary as unknown as { platform?: { modules_by_type?: Record<string, number> | null } })
            ?.platform?.modules_by_type ?? null);
        const deployments30d =
          kpis?.deployments_30d ??
          ((summary as unknown as { platform?: { deployments_30d?: number } })
            ?.platform?.deployments_30d ?? null);
        // Real 24h workflow-run count from the cached KPI payload. (The old
        // summary.platform.workflow_runs_30d read was phantom — not in any
        // response type — so the value was always the 24h figure anyway.)
        const workflowRuns24h = kpis?.workflow_runs_24h ?? null;

        const toDonutData = (rec: Record<string, number> | null) => {
          if (!rec) return [];
          return Object.entries(rec).map(([name, value]) => ({
            name,
            value: Number(value) || 0,
          }));
        };
        const projectsDonut = toDonutData(projectsByType);
        const modulesDonut = toDonutData(modulesByType);
        const DONUT_COLORS = [
          '#3B82F6',
          '#10B981',
          '#F59E0B',
          '#EF4444',
          '#8B5CF6',
          '#06B6D4',
          '#EC4899',
        ];

        const DonutOrEmpty = ({
          data,
          label,
        }: {
          data: Array<{ name: string; value: number }>;
          label: string;
        }) => {
          if (!data || data.length === 0) {
            return (
              <div className="flex h-24 items-center justify-center text-[11px] text-gray-400">
                No data
              </div>
            );
          }
          return (
            <div className="h-24">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={22}
                    outerRadius={40}
                    paddingAngle={2}
                  >
                    {data.map((_, i) => (
                      <Cell
                        key={`${label}-${i}`}
                        fill={DONUT_COLORS[i % DONUT_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: '#1F2937',
                      border: 'none',
                      borderRadius: 6,
                      fontSize: 11,
                      color: '#F9FAFB',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          );
        };

        const topModules: Array<{ name: string; count: number }> = (() => {
          const fromSummary =
            (summary as unknown as {
              platform?: { top_modules?: Array<{ name: string; count: number }> | null };
            })?.platform?.top_modules ?? null;
          if (Array.isArray(fromSummary) && fromSummary.length > 0) {
            return fromSummary.slice(0, 5).map((m) => ({
              name: safeStr(m?.name),
              count: Number(m?.count) || 0,
            }));
          }
          if (
            moduleHealth &&
            Array.isArray(moduleHealth.modules) &&
            moduleHealth.modules.length > 0
          ) {
            return moduleHealth.modules.slice(0, 5).map((m) => ({
              name: safeStr(m.module),
              count: Number(m.events_7d) || 0,
            }));
          }
          return [];
        })();

        // Recommendations may arrive as either strings or structured objects
        // ({ title, description, category, priority, impact }). Normalise to
        // a plain string before rendering so React never receives a raw object
        // as a child (this used to crash the Overview tab).
        type RecoObject = {
          title?: string;
          description?: string;
          category?: string;
          priority?: string;
          impact?: string;
          message?: string;
        };
        const toRecoString = (r: unknown): string | null => {
          if (typeof r === 'string') return r.trim() || null;
          if (r && typeof r === 'object') {
            const o = r as RecoObject;
            const head = o.title || o.message || '';
            const tail = o.description || '';
            const combined = [head, tail].filter(Boolean).join(' — ');
            return combined.trim() || null;
          }
          return null;
        };
        const recommendations: string[] = (() => {
          const fromSummary =
            (summary as unknown as { recommendations?: unknown[] | null })
              ?.recommendations ?? null;
          if (Array.isArray(fromSummary) && fromSummary.length > 0) {
            const mapped = fromSummary.map(toRecoString).filter((s): s is string => !!s);
            if (mapped.length > 0) return mapped.slice(0, 5);
          }
          // obsKpis fallback removed along with the dead getIntelligentKpis call.
          return [];
        })();

        return (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            {/* Workspace Overview composite — spans 2 cols */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900 lg:col-span-2">
              <div className="mb-4 flex items-center gap-2">
                <Database className="h-4 w-4 text-blue-500" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Data360 Workspace Overview
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <div className="rounded-lg border border-gray-100 p-3 dark:border-gray-800">
                  <p className="mb-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                    Projects by Type
                  </p>
                  <DonutOrEmpty data={projectsDonut} label="projects" />
                </div>
                <div className="rounded-lg border border-gray-100 p-3 dark:border-gray-800">
                  <p className="mb-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                    Modules Active
                  </p>
                  <DonutOrEmpty data={modulesDonut} label="modules" />
                </div>
                <div className="flex flex-col justify-between rounded-lg border border-gray-100 p-3 dark:border-gray-800">
                  <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                    Deployments (30d)
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                    {deployments30d ?? '—'}
                  </p>
                </div>
                <div className="flex flex-col justify-between rounded-lg border border-gray-100 p-3 dark:border-gray-800">
                  <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                    Workflow Runs (24h)
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">
                    {workflowRuns24h ?? '—'}
                  </p>
                </div>
              </div>
            </div>

            {/* Snowflake Account Overview — right rail */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cloud className="h-4 w-4 text-blue-500" />
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                    Account Overview
                  </h3>
                </div>
                <a
                  href="/account-overview?tab=snowflake-accounts"
                  className="rounded-md border border-gray-200 px-2 py-1 text-[11px] font-medium text-blue-600 hover:bg-blue-50 dark:border-gray-700 dark:text-blue-400 dark:hover:bg-blue-900/20"
                >
                  View Connected Accounts
                </a>
              </div>
              <dl className="grid grid-cols-1 gap-y-2 text-xs">
                {[
                  ['Account name', kpis?.account_name],
                  ['Account locator', kpis?.account_locator],
                  ['Region', kpis?.region],
                  ['Edition', kpis?.edition],
                  ['Current role', kpis?.current_role],
                  ['Subscription end', kpis?.subscription_end],
                ].map(([label, value]) => (
                  <div
                    key={String(label)}
                    className="flex items-center justify-between gap-2 border-b border-gray-100 py-1 last:border-0 dark:border-gray-800"
                  >
                    <dt className="text-gray-500 dark:text-gray-400">
                      {label}
                    </dt>
                    <dd className="truncate font-medium text-gray-800 dark:text-gray-200">
                      {value ? String(value) : '—'}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>

            {/* Top Apps */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900">
              <div className="mb-3 flex items-center gap-2">
                <Layers className="h-4 w-4 text-blue-500" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Top Apps
                </h3>
              </div>
              {topModules.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  No module activity yet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {topModules.map((m, i) => (
                    <li
                      key={`${m.name}-${i}`}
                      className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 dark:bg-gray-800"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <Activity className="h-3.5 w-3.5 shrink-0 text-blue-500" />
                        <span className="truncate text-xs text-gray-800 dark:text-gray-200">
                          {m.name}
                        </span>
                      </div>
                      <Badge size="sm" variant="flat" color="info">
                        {m.count}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Top Recommendations */}
            <div className="rounded-xl border border-gray-200 bg-white p-5 dark:border-gray-700 dark:bg-gray-900 lg:col-span-2">
              <div className="mb-3 flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                  Top Recommendations
                </h3>
              </div>
              {recommendations.length === 0 ? (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  No active recommendations.
                </p>
              ) : (
                <ul className="space-y-2">
                  {recommendations.map((r, i) => (
                    <li
                      key={`reco-${i}`}
                      className="flex items-start gap-2 rounded-lg border border-gray-100 p-3 dark:border-gray-800"
                    >
                      <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-green-500" />
                      <span className="text-xs text-gray-700 dark:text-gray-300">
                        {r}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        );
      })()}

      {/* Snowflake Tasks Quick View */}
      <TasksQuickWidget />

      {/* Recent Activity — radar widget removed (obsKpis was dead state) */}
      <div className="grid grid-cols-1 gap-6">
        <SectionCard title="Recent Activity">
          {(() => {
            const evRows = coalesceActivityEvents(
              Array.isArray(activityFeed?.events) ? activityFeed.events : []
            );
            return evRows.length > 0 ? (
              <SmartAuditTable
                rows={
                  evRows.map((evt: any) => ({
                    module: safeStr(evt.module),
                    username: safeStr(evt.username),
                    event_type: safeStr(evt.event_type),
                    status: safeStr(evt.status),
                    count: evt.count,
                    timestamp: evt.timestamp ?? null,
                  })) as SmartRow[]
                }
                subtitle="ACTIVITY_FEED"
                pageSize={10}
              />
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <div className="text-sm font-medium text-gray-600 dark:text-gray-300">
                  No recent activity
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  User events appear here as soon as someone interacts with a
                  module.
                </p>
              </div>
            );
          })()}
        </SectionCard>
      </div>
    </div>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// TAB 2: PROJECTS & DEPLOYMENTS
// ═════════════════════════════════════════════════════════════════════════════

const ProjectsTab = memo(function ProjectsTab({
  data: dataProp,
  loading,
  onRefresh,
}: {
  data: ProjectsOverviewResponse | null;
  loading: boolean;
  onRefresh?: () => void;
}) {
  // Local copy for optimistic updates after approve/reject
  const [localData, setLocalData] = useState<ProjectsOverviewResponse | null>(
    dataProp
  );
  useEffect(() => {
    setLocalData(dataProp);
  }, [dataProp]);
  const data = localData;
  // Action-RBAC gate for deployment approval — same module/action used on
  // explore-design. Fail-open on hard error (see useCanPerform). Mirrors the
  // gating that already protects approve/deploy elsewhere.
  const { allowed: canApprove } = useCanPerform('explore_design', 'approve');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<{
    projectId: string;
    deploymentId: string;
    projectName: string;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  // Inline non-blocking confirm for Approve (mirrors rejectModal) so the
  // one-click Approve is symmetric with Reject and never fires accidentally.
  const [approveModal, setApproveModal] = useState<{
    projectId: string;
    deploymentId: string;
    projectName: string;
  } | null>(null);
  const [detailModal, setDetailModal] = useState<{
    projectId: string;
    projectName: string;
    projectType: string;
    deploymentId: string;
    requestedBy: string;
    requestedAt: string;
  } | null>(null);

  const handleApprove = useCallback(
    async (projectId: string, deploymentId: string, projectName: string) => {
      if (actionLoading) return;
      setActionLoading(deploymentId);
      try {
        const res = await approveDeployment(projectId, deploymentId);
        console.log('[Approve] Response:', res);
        toast.success(`Deployment approved for ${projectName}`);
        // Optimistic update: status changes to 'approved', update counts
        setLocalData((prev) => {
          if (!prev) return prev;
          const updateStatus = (list: any[]) =>
            list.map((d: any) =>
              d.deployment_id === deploymentId
                ? { ...d, status: 'approved' }
                : d
            );
          const newPending = (prev.pending_approvals || []).filter(
            (d: any) => d.deployment_id !== deploymentId
          );
          return {
            ...prev,
            recent_deployments: updateStatus(prev.recent_deployments || []),
            pending_approvals: newPending,
            summary: prev.summary
              ? {
                  ...prev.summary,
                  pending_approvals: Math.max(
                    0,
                    (prev.summary.pending_approvals ?? 0) - 1
                  ),
                }
              : prev.summary,
            deployment_status: (prev.deployment_status || []).map((s: any) => {
              if (s.status === 'pending_approval')
                return { ...s, count: Math.max(0, s.count - 1) };
              if (s.status === 'approved')
                return { ...s, count: (s.count || 0) + 1 };
              return s;
            }),
          };
        });
        onRefresh?.();
      } catch (err: any) {
        toast.error(
          getApiErrorMessage(err) || 'Failed to approve deployment'
        );
      } finally {
        setActionLoading(null);
      }
    },
    [actionLoading, onRefresh]
  );

  const handleReject = useCallback(async () => {
    if (!rejectModal || actionLoading) return;
    setActionLoading(rejectModal.deploymentId);
    try {
      await rejectDeployment(rejectModal.projectId, rejectModal.deploymentId, {
        reason: rejectReason || undefined,
      });
      toast.success(`Deployment rejected for ${rejectModal.projectName}`);
      // Optimistic update
      const rejectedId = rejectModal.deploymentId;
      setLocalData((prev) => {
        if (!prev) return prev;
        const updateStatus = (list: any[]) =>
          list.map((d: any) =>
            d.deployment_id === rejectedId ? { ...d, status: 'rejected' } : d
          );
        const newPending = (prev.pending_approvals || []).filter(
          (d: any) => d.deployment_id !== rejectedId
        );
        return {
          ...prev,
          recent_deployments: updateStatus(prev.recent_deployments || []),
          pending_approvals: newPending,
          summary: prev.summary
            ? {
                ...prev.summary,
                pending_approvals: Math.max(
                  0,
                  (prev.summary.pending_approvals ?? 0) - 1
                ),
              }
            : prev.summary,
          deployment_status: (prev.deployment_status || []).map((s: any) => {
            if (s.status === 'pending_approval')
              return { ...s, count: Math.max(0, s.count - 1) };
            if (s.status === 'rejected')
              return { ...s, count: (s.count || 0) + 1 };
            return s;
          }),
        };
      });
      setRejectModal(null);
      setRejectReason('');
      onRefresh?.();
    } catch (err: any) {
      toast.error(getApiErrorMessage(err) || 'Failed to reject deployment');
    } finally {
      setActionLoading(null);
    }
  }, [rejectModal, actionLoading, rejectReason, onRefresh]);

  const typePieData = useMemo(() => {
    const byType = (data?.summary || {}).by_type || {};
    return Object.entries(byType)
      .filter(([_, v]) => (v as number) > 0)
      .map(([name, value]) => ({
        name: name.replace(/_/g, ' '),
        value: value as number,
      }));
  }, [data]);

  const statusPieData = useMemo(() => {
    const ds = Array.isArray(data?.deployment_status)
      ? data.deployment_status
      : [];
    return ds
      .filter((d: any) => d.count > 0)
      .map((d: any) => ({
        name: d.status?.replace(/_/g, ' '),
        value: d.count,
      }));
  }, [data]);

  // Project status mix (summary.by_status) — distinct from deployment status
  // above; this is the lifecycle state of the projects themselves.
  const statusByProjectData = useMemo(() => {
    const byStatus: Record<string, number> =
      (data?.summary as any)?.by_status || {};
    return Object.entries(byStatus)
      .filter(([, v]) => Number(v) > 0)
      .map(([name, value]) => ({
        name: name.replace(/_/g, ' '),
        value: Number(value),
      }));
  }, [data]);

  if (loading || !data) return <LoadingSection />;

  const summary = data.summary || ({} as any);
  const byType = summary.by_type || {};
  const deploymentStatus = Array.isArray(data.deployment_status)
    ? data.deployment_status
    : [];
  const recentDeployments = Array.isArray(data.recent_deployments)
    ? data.recent_deployments
    : [];
  const pendingApprovals = Array.isArray(data.pending_approvals)
    ? data.pending_approvals
    : [];
  const executionDaily = Array.isArray(data.execution_daily)
    ? data.execution_daily
    : [];
  const memberRoles = Array.isArray(data.member_roles) ? data.member_roles : [];
  const topContributors = Array.isArray(data.top_contributors)
    ? data.top_contributors
    : [];

  const statusColors: Record<string, string> = {
    deployed: '#10B981',
    pending_approval: '#F59E0B',
    approved: '#3B82F6',
    failed: '#EF4444',
    rejected: '#9CA3AF',
    cancelled: '#6B7280',
  };

  // Honest deployment-health CTA. A low success rate here is most often driven
  // by PENDING (not-yet-approved) deployments, not failures — so we label the
  // call to action by its actual cause: "failed" only when failures exist.
  const deploySuccessRate =
    summary.deployment_success_rate != null
      ? Number(summary.deployment_success_rate)
      : null;
  const failedDeployments = Number(summary.failed_deployments ?? 0);

  const scrollToSection = (id: string) =>
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <>
      {/* Deployment-health CTA — points at the real cause (failures vs pending). */}
      {failedDeployments > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-900/20">
          <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-300">
            <XCircle className="h-4 w-4 flex-shrink-0" />
            <span>
              {failedDeployments} failed deployment
              {failedDeployments === 1 ? '' : 's'} in this period
              {deploySuccessRate != null
                ? ` · ${deploySuccessRate}% success rate`
                : ''}
              .
            </span>
          </div>
          <ActionChip
            label="Review failed deployments"
            tone="red"
            onClick={() => scrollToSection('cc-recent-deployments')}
          />
        </div>
      ) : deploySuccessRate != null &&
        deploySuccessRate < 80 &&
        pendingApprovals.length > 0 ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/20">
          <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
            <Clock className="h-4 w-4 flex-shrink-0" />
            <span>
              Deployment success rate is {deploySuccessRate}% —{' '}
              {pendingApprovals.length} deployment
              {pendingApprovals.length === 1 ? '' : 's'} awaiting approval.
            </span>
          </div>
          <ActionChip
            label="Review pending approvals"
            tone="amber"
            onClick={() => scrollToSection('cc-pending-approvals')}
          />
        </div>
      ) : null}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <KpiCard
          label="Total Projects"
          value={summary.total_projects ?? null}
          icon={Rocket}
          color="blue"
        />
        <KpiCard
          label="Explore Design"
          value={byType.explore_design ?? null}
          icon={Database}
          color="violet"
        />
        <KpiCard
          label="Workflows"
          value={byType.workflow ?? null}
          icon={GitBranch}
          color="amber"
        />
        <KpiCard
          label="Pending Approvals"
          value={summary.pending_approvals ?? null}
          icon={Clock}
          color="orange"
        />
        <KpiCard
          label="Deploy Success"
          value={
            summary.deployment_success_rate != null
              ? `${summary.deployment_success_rate}%`
              : null
          }
          icon={CheckCircle}
          color="green"
        />
      </div>

      {/* Secondary KPI row — fields the backend already computes but the UI
          never surfaced (failed deployments / total deployment volume /
          unique members across projects). */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <KpiCard
          label="Failed Deployments"
          value={summary.failed_deployments ?? null}
          icon={XCircle}
          color="red"
        />
        <KpiCard
          label="Deployment Volume"
          value={summary.deployments_period ?? null}
          icon={Upload}
          color="cyan"
        />
        <KpiCard
          label="Unique Members"
          value={summary.unique_members ?? null}
          icon={Users}
          color="indigo"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Projects by Type */}
        <SectionCard title="Projects by Type">
          {typePieData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={typePieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {typePieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">
              No projects
            </p>
          )}
        </SectionCard>

        {/* Deployment Status */}
        <SectionCard title="Deployment Status">
          {statusPieData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {statusPieData.map((_entry, i) => (
                      <Cell
                        key={i}
                        fill={
                          statusColors[deploymentStatus[i]?.status] ||
                          COLORS[i % COLORS.length]
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">
              No deployments
            </p>
          )}
        </SectionCard>

        {/* Daily Execution Runs */}
        <SectionCard title="Daily Execution Runs">
          {executionDaily.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={executionDaily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#9CA3AF', fontSize: 10 }}
                  />
                  <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    dataKey="success"
                    fill="#10B981"
                    name="Success"
                    stackId="a"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="failed"
                    fill="#EF4444"
                    name="Failed"
                    stackId="a"
                    radius={[4, 4, 0, 0]}
                  />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">
              No execution data
            </p>
          )}
        </SectionCard>
      </div>

      {/* Project status mix + deployment duration/step detail — all from
          fields the projects-overview endpoint already returns. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Projects by Status">
          {statusByProjectData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusByProjectData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {statusByProjectData.map((_entry, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">
              No projects
            </p>
          )}
        </SectionCard>

        <SectionCard title="Deployment Duration & Steps">
          {executionDaily.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={executionDaily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#9CA3AF', fontSize: 10 }}
                  />
                  <YAxis
                    yAxisId="left"
                    tick={{ fill: '#9CA3AF', fontSize: 11 }}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    tick={{ fill: '#9CA3AF', fontSize: 11 }}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar
                    yAxisId="left"
                    dataKey="steps_executed"
                    fill="#3B82F6"
                    name="Steps"
                    stackId="s"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    yAxisId="left"
                    dataKey="steps_failed"
                    fill="#EF4444"
                    name="Steps Failed"
                    stackId="s"
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="avg_duration"
                    stroke="#F59E0B"
                    strokeWidth={2}
                    name="Avg Duration (s)"
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">
              No execution data
            </p>
          )}
        </SectionCard>
      </div>

      {/* Recent Deployments Audit Table */}
      <div id="cc-recent-deployments">
      <AuditTable
        data={recentDeployments}
        title={`Recent Deployments (${data.period_days ?? 7}d)`}
        emptyMessage="No deployments in this period"
        columns={[
          {
            key: 'project_name',
            label: 'Project',
            sortable: true,
            filterable: true,
            render: (v: string) => (
              <span className="font-medium text-gray-900 dark:text-white">
                {v}
              </span>
            ),
          },
          {
            key: 'project_type',
            label: 'Type',
            sortable: true,
            filterable: true,
            render: (v: string) => (
              <Badge size="sm" variant="flat" color="info">
                {v?.replace(/_/g, ' ')}
              </Badge>
            ),
          },
          {
            // Per-project KPI rollup (DQ·PERF·GOV·cost) inline per deployment.
            // Self-disables (renders nothing) when the rollup route isn't
            // provisioned — never a fake badge. Only the paged 15 rows mount.
            key: 'project_id',
            label: 'Project KPIs',
            sortable: false,
            render: (_: string, row: any) =>
              row.project_id ? (
                <ProjectKpiStrip
                  projectId={row.project_id}
                  compact
                  dimensions={['perf', 'gov', 'dq', 'cost']}
                />
              ) : (
                <span className="text-gray-400">—</span>
              ),
          },
          {
            key: 'status',
            label: 'Status',
            sortable: true,
            filterable: true,
            render: (v: string) => (
              <Badge size="sm" variant="flat" color={statusBadgeColor(v)}>
                {v?.replace(/_/g, ' ')}
              </Badge>
            ),
          },
          {
            key: 'deployment_type',
            label: 'Deploy Type',
            sortable: true,
            filterable: true,
            render: (v: string) =>
              v ? (
                <Badge size="sm" variant="flat" color="secondary">
                  {v.replace(/_/g, ' ')}
                </Badge>
              ) : (
                <span className="text-gray-400">—</span>
              ),
          },
          {
            key: 'environment',
            label: 'Env',
            sortable: true,
            filterable: true,
          },
          {
            key: 'requested_by',
            label: 'Requested By',
            sortable: true,
            filterable: true,
          },
          { key: 'approved_by', label: 'Approved By', sortable: true },
          {
            key: 'deployed_at',
            label: 'Deployed',
            sortable: true,
            render: (v: string) => <span title={v}>{relativeTime(v)}</span>,
          },
          {
            key: 'retry_count',
            label: 'Retries',
            sortable: true,
            align: 'right',
            render: (v: number) =>
              v && v > 0 ? (
                <Badge size="sm" variant="flat" color="warning">
                  {v}
                </Badge>
              ) : (
                <span className="text-gray-400">0</span>
              ),
          },
          {
            key: 'rejection_reason',
            label: 'Rejection Reason',
            filterable: true,
            render: (v: string) =>
              v ? (
                <span className="block max-w-xs truncate" title={v}>
                  {v}
                </span>
              ) : (
                <span className="text-gray-400">—</span>
              ),
          },
          {
            key: 'deployment_id',
            label: 'Actions',
            sortable: false,
            render: (_: string, row: any) =>
              row.status === 'pending_approval' ? (
                <div className="flex items-center gap-1">
                  <button
                    aria-label="View details"
                    onClick={() =>
                      setDetailModal({
                        projectId: row.project_id,
                        projectName: safeStr(row.project_name),
                        projectType: safeStr(row.project_type),
                        deploymentId: row.deployment_id,
                        requestedBy: safeStr(row.requested_by),
                        requestedAt: row.requested_at,
                      })
                    }
                    className="rounded-md bg-blue-100 p-1.5 text-blue-700 transition-colors hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                    title="View details"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  {canApprove && (
                    <button
                      aria-label="Approve deployment"
                      onClick={() =>
                        setApproveModal({
                          projectId: row.project_id,
                          deploymentId: row.deployment_id,
                          projectName: safeStr(row.project_name),
                        })
                      }
                      disabled={actionLoading === row.deployment_id}
                      className="rounded-md bg-green-100 p-1.5 text-green-700 transition-colors hover:bg-green-200 disabled:opacity-50 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
                      title="Approve deployment"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    aria-label="Reject deployment"
                    onClick={() =>
                      setRejectModal({
                        projectId: row.project_id,
                        deploymentId: row.deployment_id,
                        projectName: row.project_name,
                      })
                    }
                    disabled={actionLoading === row.deployment_id}
                    className="rounded-md bg-red-100 p-1.5 text-red-700 transition-colors hover:bg-red-200 disabled:opacity-50 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                    title="Reject deployment"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null,
          },
        ]}
      />
      </div>

      {/* Pending Approvals + Members */}
      <div
        id="cc-pending-approvals"
        className="grid grid-cols-1 gap-6 lg:grid-cols-2"
      >
        {/* Pending Approvals */}
        <SectionCard title={`Pending Approvals (${pendingApprovals.length})`}>
          {pendingApprovals.length > 0 ? (
            <div className="space-y-3">
              {pendingApprovals.map((p: any, i: number) => (
                <div
                  key={p.deployment_id ?? i}
                  className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20"
                >
                  {/* Header: project name + actions */}
                  <div className="mb-2 flex items-center justify-between">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                        {safeStr(p.project_name)}
                      </span>
                      <Badge size="sm" variant="flat" color="warning">
                        {safeStr(p.environment, 'production')}
                      </Badge>
                      <Badge size="sm" variant="flat" color="info">
                        {safeStr(p.project_type, '').replace(/_/g, ' ')}
                      </Badge>
                    </div>
                    <div className="flex flex-shrink-0 items-center gap-1.5">
                      <button
                        onClick={() =>
                          setDetailModal({
                            projectId: p.project_id,
                            projectName: safeStr(p.project_name),
                            projectType: safeStr(p.project_type),
                            deploymentId: p.deployment_id,
                            requestedBy: safeStr(p.requested_by),
                            requestedAt: p.requested_at,
                          })
                        }
                        className="rounded-md bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-700 transition-colors hover:bg-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
                      >
                        Details
                      </button>
                      {canApprove && (
                        <button
                          onClick={() =>
                            setApproveModal({
                              projectId: p.project_id,
                              deploymentId: p.deployment_id,
                              projectName: safeStr(p.project_name),
                            })
                          }
                          disabled={actionLoading === p.deployment_id}
                          className="rounded-md bg-green-100 px-2.5 py-1 text-xs font-medium text-green-700 transition-colors hover:bg-green-200 disabled:opacity-50 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50"
                        >
                          {actionLoading === p.deployment_id ? '...' : 'Approve'}
                        </button>
                      )}
                      <button
                        onClick={() =>
                          setRejectModal({
                            projectId: p.project_id,
                            deploymentId: p.deployment_id,
                            projectName: p.project_name,
                          })
                        }
                        disabled={actionLoading === p.deployment_id}
                        className="rounded-md bg-red-100 px-2.5 py-1 text-xs font-medium text-red-700 transition-colors hover:bg-red-200 disabled:opacity-50 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                  {/* Detail section: what's being approved */}
                  <div className="space-y-1">
                    {/* Per-project KPI rollup — renders nothing until the
                        rollup route is provisioned (no fake badges). */}
                    {p.project_id ? (
                      <ProjectKpiStrip
                        projectId={p.project_id}
                        compact
                        dimensions={['perf', 'gov', 'dq', 'cost']}
                        className="pb-0.5"
                      />
                    ) : null}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-400">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Requested by{' '}
                        <span className="font-medium text-gray-800 dark:text-gray-200">
                          {safeStr(p.requested_by)}
                        </span>{' '}
                        — {relativeTime(p.requested_at)}
                      </span>
                      {p.deployment_id && (
                        <span className="font-mono text-gray-400 dark:text-gray-400">
                          {safeStr(p.deployment_id)}
                        </span>
                      )}
                    </div>
                    {p.deployment_type && (
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span>Deployment type:</span>
                        <Badge size="sm" variant="flat" color="secondary">
                          {safeStr(p.deployment_type).replace(/_/g, ' ')}
                        </Badge>
                      </div>
                    )}
                    {/* Show number of objects in deployment if available */}
                    {(p.event_count != null ||
                      p.step_count != null ||
                      p.ddl_count != null) && (
                      <div className="flex items-center gap-3 text-xs font-medium text-amber-700 dark:text-amber-400">
                        {p.event_count != null && (
                          <span>{p.event_count} events</span>
                        )}
                        {p.step_count != null && (
                          <span>{p.step_count} steps</span>
                        )}
                        {p.ddl_count != null && (
                          <span>{p.ddl_count} DDL actions</span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <CheckCircle className="mx-auto mb-2 h-8 w-8 text-green-500" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No pending approvals
              </p>
            </div>
          )}
        </SectionCard>

        {/* Project Members */}
        <SectionCard title="Members & Contributors">
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-blue-50 p-3 text-center dark:bg-blue-900/20">
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                {summary.unique_members ?? '—'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Unique Members
              </p>
            </div>
            {memberRoles.slice(0, 2).map((r: any, i: number) => (
              <div
                key={i}
                className="rounded-lg bg-gray-50 p-3 text-center dark:bg-gray-800"
              >
                <p className="text-xl font-bold text-gray-900 dark:text-white">
                  {safeStr(r.user_count, '—')}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {safeStr(r.role)}
                </p>
              </div>
            ))}
          </div>
          {topContributors.length > 0 ? (
            <SmartAuditTable
              rows={
                topContributors.map((c: any) => ({
                  username: safeStr(c.username),
                  role: safeStr(c.role),
                  projects: c.project_count ?? null,
                })) as SmartRow[]
              }
              subtitle="CONTRIBUTORS"
              pageSize={10}
            />
          ) : (
            <p className="py-4 text-center text-sm text-gray-400">
              No contributors
            </p>
          )}
        </SectionCard>
      </div>

      {/* Reject Deployment — inline non-blocking confirm (no scrim) */}
      {rejectModal && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 sm:justify-end">
          <div
            role="alertdialog"
            aria-labelledby="reject-modal-title"
            aria-describedby="reject-modal-desc"
            className="pointer-events-auto w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setRejectModal(null);
                setRejectReason('');
              }
            }}
          >
            <h3
              id="reject-modal-title"
              className="mb-1 text-lg font-semibold text-gray-900 dark:text-white"
            >
              Reject Deployment
            </h3>
            <p id="reject-modal-desc" className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              Reject deployment for{' '}
              <span className="font-medium text-gray-900 dark:text-white">
                {rejectModal.projectName}
              </span>
            </p>
            <textarea
              autoFocus
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (optional)"
              className="w-full resize-none rounded-lg border border-gray-300 bg-white p-3 text-sm text-gray-900 placeholder-gray-400 focus:border-red-500 focus:ring-1 focus:ring-red-500 dark:border-gray-600 dark:bg-gray-800 dark:text-white dark:placeholder-gray-500"
              rows={3}
            />
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => {
                  setRejectModal(null);
                  setRejectReason('');
                }}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleReject}
                disabled={actionLoading === rejectModal.deploymentId}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
              >
                {actionLoading === rejectModal.deploymentId
                  ? 'Rejecting...'
                  : 'Reject Deployment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approve Deployment — inline non-blocking confirm (mirrors Reject) */}
      {approveModal && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4 sm:justify-end">
          <div
            role="alertdialog"
            aria-labelledby="approve-modal-title"
            aria-describedby="approve-modal-desc"
            className="pointer-events-auto w-full max-w-md rounded-xl border border-gray-200 bg-white p-6 shadow-2xl dark:border-gray-700 dark:bg-gray-900"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setApproveModal(null);
            }}
          >
            <h3
              id="approve-modal-title"
              className="mb-1 text-lg font-semibold text-gray-900 dark:text-white"
            >
              Approve Deployment
            </h3>
            <p id="approve-modal-desc" className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              Approve and release the deployment for{' '}
              <span className="font-medium text-gray-900 dark:text-white">
                {approveModal.projectName}
              </span>
              ? This action will proceed immediately.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={() => setApproveModal(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const m = approveModal;
                  setApproveModal(null);
                  await handleApprove(m.projectId, m.deploymentId, m.projectName);
                }}
                disabled={actionLoading === approveModal.deploymentId}
                className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-green-700 disabled:opacity-50"
              >
                {actionLoading === approveModal.deploymentId
                  ? 'Approving...'
                  : 'Approve Deployment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Approval Detail Modal */}
      {detailModal && (
        <ApprovalDetailModal
          isOpen={!!detailModal}
          onClose={() => setDetailModal(null)}
          projectId={detailModal.projectId}
          projectName={detailModal.projectName}
          projectType={detailModal.projectType}
          deploymentId={detailModal.deploymentId}
          requestedBy={detailModal.requestedBy}
          requestedAt={detailModal.requestedAt}
          isActionLoading={!!actionLoading}
          canApprove={canApprove}
          onApprove={async () => {
            await handleApprove(
              detailModal.projectId,
              detailModal.deploymentId,
              detailModal.projectName
            );
            setDetailModal(null);
          }}
          onReject={() => {
            setRejectModal({
              projectId: detailModal.projectId,
              deploymentId: detailModal.deploymentId,
              projectName: detailModal.projectName,
            });
            setDetailModal(null);
          }}
        />
      )}
    </>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// TAB 6: COST INTELLIGENCE
// ═════════════════════════════════════════════════════════════════════════════

const CostTab = memo(function CostTab({
  data,
  loading,
  days = 30,
  onNavigateTab,
}: {
  data: CostBreakdownResponse | null;
  loading: boolean;
  /** Active global Time Range (days) — drives period labels instead of a
   * hardcoded "30d". CostBreakdownResponse carries no period field, so the
   * parent passes filters.days; defaults to 30 for back-compat. */
  days?: number;
  /** Switch the parent dashboard to another tab (for same-page CTA targets). */
  onNavigateTab?: (id: string) => void;
}) {
  const periodDays = days ?? 30;
  const categoryPieData = useMemo(() => {
    const byCategory = data?.by_category || {};
    return Object.entries(byCategory)
      .filter(([_, v]) => (v as number) > 0)
      .map(([name, value]) => ({
        name: name.replace(/_/g, ' '),
        value: Math.round((value as number) * 100) / 100,
      }));
  }, [data]);

  const storagePieData = useMemo(() => {
    const storage = data?.storage || ({} as any);
    return [
      { name: 'Database', value: storage.database_tb ?? 0 },
      { name: 'Stage', value: storage.stage_tb ?? 0 },
      { name: 'Failsafe', value: storage.failsafe_tb ?? 0 },
    ].filter((d) => d.value > 0);
  }, [data]);

  const dailyAvg = useMemo(() => {
    const dailyTrend = Array.isArray(data?.daily_trend) ? data.daily_trend : [];
    return dailyTrend.length > 0
      ? Math.round(
          (dailyTrend.reduce((s: number, d: any) => s + d.credits, 0) /
            dailyTrend.length) *
            100
        ) / 100
      : 0;
  }, [data]);

  if (loading || !data) return <LoadingSection />;

  const storage = data.storage || ({} as any);
  const balance = data.balance || ({} as any);
  const dailyTrend = Array.isArray(data.daily_trend) ? data.daily_trend : [];
  const topWarehouses = Array.isArray(data.top_warehouses)
    ? data.top_warehouses
    : [];

  // Cortex spend (when present in payload — see Screens/Account-overview/03-finops spec).
  const cortexCredits =
    (data as any).cortex_credits_30d ?? (data as any).cortex_total ?? 0;
  const storageTb =
    safeNum(storage.database_tb, 0) +
    safeNum(storage.stage_tb, 0) +
    safeNum(storage.failsafe_tb, 0);

  // Iter 4 — additive FinOps panels (all optional fields, graceful fallbacks).
  const lastTrend: any = dailyTrend[dailyTrend.length - 1] || {};
  const creditsToday = Number(lastTrend.credits ?? 0);
  const activeWarehouses = topWarehouses.length;
  const optimization: any = (data as any).optimization_recommendations || {};
  const estimatedSavings = Number(optimization.estimated_savings ?? 0);
  const recommendationItems: any[] = Array.isArray(optimization.items)
    ? optimization.items
    : [];
  // No frontend fallbacks — if the backend can't produce recommendations the
  // panel renders its empty state. Anything else would be invented data.
  const recommendationsToShow = recommendationItems.slice(0, 5);

  const computeVsStorage = dailyTrend.map((d: any) => ({
    date: d.date,
    compute: Number(d.compute_credits ?? d.credits ?? 0),
    storage: Number(d.storage_credits ?? 0),
  }));
  const hasComputeStorageSplit = dailyTrend.some(
    (d: any) => d.compute_credits != null || d.storage_credits != null
  );

  const resourceMonitors: any[] = Array.isArray((data as any).resource_monitors)
    ? (data as any).resource_monitors
    : [];
  const anomalies: any[] = Array.isArray((data as any).anomalies)
    ? (data as any).anomalies
    : [];

  return (
    <>
      {/* KPI Cards — 6 cards per Screens/Account-overview/03-finops spec */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label={`Credits (${periodDays}d)`}
          value={data?.total_credits ?? null}
          icon={DollarSign}
          color="amber"
          trend={data?.credit_trend_pct}
          help={{
            title: 'Credits',
            definition: 'Compute consumption units billed for query and pipeline execution over the selected period.',
            source: 'data warehouse metering history',
          }}
        />
        <KpiCard
          label={`∆ vs prev ${periodDays}d`}
          value={
            data?.credit_trend_pct != null
              ? `${data.credit_trend_pct > 0 ? '+' : ''}${data.credit_trend_pct}%`
              : null
          }
          icon={(data?.credit_trend_pct ?? 0) >= 0 ? TrendingUp : TrendingDown}
          color={(data?.credit_trend_pct ?? 0) >= 0 ? 'red' : 'green'}
        />
        <KpiCard
          label="Storage (TB)"
          value={data?.storage ? storageTb.toFixed(3) : null}
          icon={Database}
          color="blue"
          help={{
            title: 'Storage',
            definition: 'Total data volume held across active tables, time-travel and fail-safe retention.',
            source: 'data warehouse storage metrics',
          }}
        />
        <KpiCard
          label="Daily Avg"
          value={dailyTrend.length > 0 ? dailyAvg.toLocaleString() : null}
          icon={BarChart3}
          color="violet"
        />
        <KpiCard
          label={`AI Spend (${periodDays}d)`}
          value={cortexCredits > 0 ? Number(cortexCredits).toLocaleString() : null}
          icon={Zap}
          color="purple"
        />
        <KpiCard
          label="Capacity"
          value={balance.capacity ?? null}
          icon={DollarSign}
          color="green"
        />
      </div>

      {/* Iter 4 — additional KPI tiles (Credits Today / Active Warehouses / Estimated Savings) */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <KpiCard
          label="Credits Today"
          value={lastTrend.credits != null ? creditsToday.toLocaleString() : null}
          icon={Zap}
          color="amber"
        />
        <KpiCard
          label="Top Warehouses"
          value={activeWarehouses.toLocaleString()}
          icon={Server}
          color="blue"
          help={{
            title: 'Active Warehouses',
            definition: 'Number of compute clusters that consumed credits during the selected period.',
            source: 'data warehouse metering history',
          }}
        />
        <KpiCard
          label="Estimated Savings"
          value={optimization.estimated_savings != null ? estimatedSavings.toLocaleString() : null}
          icon={Sparkles}
          color="green"
        />
      </div>

      {/* Cost-spike CTA — when spend rose materially vs the prior period, link to
          the observability cost dashboard to drill into the drivers. */}
      {(data?.credit_trend_pct ?? 0) > 20 && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-900/20">
          <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
            <TrendingUp className="h-4 w-4 flex-shrink-0" />
            <span>
              Credit consumption is up {data?.credit_trend_pct}% vs the previous {periodDays}d.
            </span>
          </div>
          <a
            href="/observability"
            className="inline-flex flex-shrink-0 items-center gap-0.5 rounded-lg border border-amber-300 px-3 py-1.5 text-xs font-medium text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300 dark:hover:bg-amber-900/30"
          >
            Review cost drivers →
          </a>
        </div>
      )}

      {/* 30d cost projection for the top spending warehouse (cost-simulation).
          Degrades quietly when the backend route isn't deployed yet. */}
      {topWarehouses[0]?.name && (
        <CostPreview
          objectType="warehouse"
          objectId={String(topWarehouses[0].name)}
          days={periodDays}
        />
      )}

      {/* AI flow: discussion → proposed action → execute → capitalize as an event.
          Rule-based (no LLM). Only renders on a material spend increase. One real
          mutation (refresh the KPI cache) plus a business-flow-automation hand-off
          to the workflow builder pre-loaded with a cost-report template. */}
      {(data?.credit_trend_pct ?? 0) > 20 && (
        <AIActionFlow
          title="Recommended next steps"
          context={{
            module: 'command_center',
            entityType: 'finops',
            entityId: `${periodDays}d`,
            data: { creditTrendPct: data?.credit_trend_pct, periodDays },
          }}
          suggestions={[
            {
              id: 'cc-cost-report-workflow',
              title: 'Schedule cost report workflow',
              rationale: `Spend is up ${data?.credit_trend_pct}% vs the previous ${periodDays}d. A scheduled cost-report workflow keeps stakeholders informed without manual pulls.`,
              navigate: {
                label: 'Create cost report →',
                href: '/workflow?template=cost-report',
              },
            },
            {
              id: 'cc-refresh-kpis',
              title: 'Refresh KPI cache',
              rationale: 'The KPIs above are served from a cache. Refresh it to confirm the spike against the latest metering data before acting on it.',
              action: {
                label: 'Refresh KPIs',
                endpoint: API.commandCenter.overviewKpisRefresh(),
                method: 'POST',
                payload: { source: 'ai_action_flow' },
                cost: '~0.01 credits',
                risk: 'none',
              },
            },
          ] satisfies AISuggestion[]}
        />
      )}

      {/* Daily Credit Trend */}
      <SectionCard title={`Daily Credit Trend (${periodDays}d)`}>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={dailyTrend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
              <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="credits"
                stroke="#F59E0B"
                fill="#F59E0B"
                fillOpacity={0.2}
                name="Credits"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      {/* Iter 4 — Compute vs Storage stacked area + Optimization Recommendations rail */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <SectionCard
          title={`Compute vs Storage (${periodDays}d)`}
          className="lg:col-span-3"
        >
          {hasComputeStorageSplit && computeVsStorage.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={computeVsStorage}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    dataKey="date"
                    tick={{ fill: '#9CA3AF', fontSize: 11 }}
                  />
                  <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area
                    type="monotone"
                    dataKey="compute"
                    stackId="1"
                    stroke="#3B82F6"
                    fill="#3B82F6"
                    fillOpacity={0.4}
                    name="Compute"
                  />
                  <Area
                    type="monotone"
                    dataKey="storage"
                    stackId="1"
                    stroke="#10B981"
                    fill="#10B981"
                    fillOpacity={0.4}
                    name="Storage"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">
              Compute vs Storage breakdown not available — daily trend chart
              only.
            </p>
          )}
        </SectionCard>

        <SectionCard
          title="Optimization Recommendations"
          className="lg:col-span-1"
        >
          {recommendationsToShow.length === 0 ? (
            // The backend's `optimization_recommendations.items` rail is not
            // populated on this deployment; surface the real, CTA-bearing
            // `cost`-dimension recommendations instead (honest empty if none).
            <FinOpsCostRecos onNavigateTab={onNavigateTab} />
          ) : (
            <ul className="space-y-3">
              {recommendationsToShow.map((rec: any, i: number) => {
                const title = String(
                  rec?.title ?? rec?.label ?? rec?.name ?? `Recommendation ${i + 1}`
                );
                const detail = String(rec?.detail ?? rec?.description ?? rec?.message ?? '');
                const saving =
                  rec?.estimated_savings ?? rec?.savings ?? rec?.credits ?? null;
                return (
                  <li
                    key={i}
                    className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 dark:bg-amber-900/10"
                  >
                    <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-gray-900 dark:text-white">
                        {title}
                      </p>
                      {detail ? (
                        <p className="mt-0.5 text-[11px] text-gray-500 dark:text-gray-400">
                          {detail}
                        </p>
                      ) : null}
                      {saving != null ? (
                        <p className="mt-1 text-[11px] font-medium text-green-600 dark:text-green-400">
                          Save ~{Number(saving).toLocaleString()} credits
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* P0 surfacing — FinOps/governance KPIs the backend already computes but
          the UI never showed (cost-by-warehouse/service, clustering, pipe,
          MV refresh, tasks, role hierarchy). Self-contained, fetches on mount. */}
      <ServerlessFinOpsCards days={30} />

      {/* Category Pie + Top Warehouses */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Cost by Category">
          {categoryPieData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={categoryPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {categoryPieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">All zero</p>
          )}
        </SectionCard>

        <SectionCard title="Top Warehouses">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topWarehouses.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fill: '#9CA3AF', fontSize: 11 }}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar
                  dataKey="credits"
                  fill="#F59E0B"
                  name="Credits"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      {/* Storage + Balance */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Storage Breakdown">
          {storagePieData.length > 0 ? (
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={storagePieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                  >
                    {storagePieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">
              No storage data
            </p>
          )}
        </SectionCard>

        <SectionCard title="Credit Balance">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg bg-green-50 p-4 text-center dark:bg-green-900/20">
              <p className="text-xl font-bold text-green-600 dark:text-green-400">
                {fmtNum(balance.free_remaining)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Free Remaining
              </p>
            </div>
            <div className="rounded-lg bg-blue-50 p-4 text-center dark:bg-blue-900/20">
              <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                {fmtNum(balance.capacity)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Capacity
              </p>
            </div>
            <div className="rounded-lg bg-amber-50 p-4 text-center dark:bg-amber-900/20">
              <p className="text-xl font-bold text-amber-600 dark:text-amber-400">
                {fmtNum(balance.on_demand)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                On-Demand
              </p>
            </div>
            <div className="rounded-lg bg-purple-50 p-4 text-center dark:bg-purple-900/20">
              <p className="text-xl font-bold text-purple-600 dark:text-purple-400">
                {fmtNum(balance.rollover)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Rollover
              </p>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Iter 4 — Budgets & Resource Monitors + Cost Anomalies */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Budgets & Resource Monitors">
          <div className="mb-3 flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <ShieldCheck className="h-4 w-4 text-green-500" />
            <span>Credit budgets configured at the account level.</span>
          </div>
          {resourceMonitors.length > 0 ? (
            <div className="space-y-3">
              {resourceMonitors.map((m: any, i: number) => {
                const name = m.name ?? m.monitor ?? `Monitor ${i + 1}`;
                const used = Number(m.used ?? m.used_credits ?? 0);
                const threshold = Number(
                  m.threshold ?? m.credit_quota ?? m.quota ?? 0
                );
                const pct =
                  threshold > 0
                    ? Math.min(100, Math.round((used / threshold) * 100))
                    : 0;
                const status = (
                  m.status ??
                  (pct >= 100 ? 'exceeded' : pct >= 80 ? 'warning' : 'ok')
                ).toString();
                const statusColor =
                  status === 'ok' || status === 'OK'
                    ? 'success'
                    : status === 'warning' || pct >= 80
                      ? 'warning'
                      : 'danger';
                return (
                  <div
                    key={i}
                    className="rounded-lg border border-gray-200 p-3 dark:border-gray-700"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className="truncate text-xs font-semibold text-gray-900 dark:text-white">
                        {name}
                      </span>
                      <Badge color={statusColor as any} size="sm">
                        {status}
                      </Badge>
                    </div>
                    <div className="mb-1 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400">
                      <span>
                        {used.toLocaleString()} / {threshold.toLocaleString()}{' '}
                        credits
                      </span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all',
                          pct >= 100
                            ? 'bg-red-500'
                            : pct >= 80
                              ? 'bg-amber-500'
                              : 'bg-green-500'
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-gray-400">
              No resource monitors configured. Add one to track
              credit budgets.
            </p>
          )}
        </SectionCard>

        <SectionCard title="Cost Anomalies">
          {anomalies.length > 0 ? (
            <SmartAuditTable
              rows={
                anomalies.map((a: any) => {
                  const raw = a.deviation_pct ?? a.deviation;
                  const dev = Number(raw);
                  return {
                    date: a.date ?? a.day ?? null,
                    warehouse: a.warehouse ?? a.name ?? null,
                    deviation: Number.isFinite(dev)
                      ? `${dev > 0 ? '+' : ''}${dev}%`
                      : null,
                  };
                }) as SmartRow[]
              }
              subtitle="WAREHOUSE_METERING"
              pageSize={10}
            />
          ) : (
            <p className="py-6 text-center text-sm text-gray-400">
              No cost anomalies detected in the last {periodDays} days.
            </p>
          )}
        </SectionCard>
      </div>
    </>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// TAB: SECURITY (Advanced — Snowflake Login/Session/MFA)
// ═════════════════════════════════════════════════════════════════════════════

const SecurityAdvTab = memo(function SecurityAdvTab({
  data,
  loading,
  onNavigateTab,
}: {
  data: SecurityOverviewResponse | null;
  loading: boolean;
  /** Switch the parent dashboard to another tab (for same-page CTA targets). */
  onNavigateTab?: (id: string) => void;
}) {
  if (loading || !data) return <LoadingSection />;

  const loginSummary = Array.isArray(data.login_summary)
    ? data.login_summary
    : [];
  const loginTrend = Array.isArray(data.login_trend) ? data.login_trend : [];
  const clientTypes = Array.isArray(data.client_types) ? data.client_types : [];
  const failedLogins = Array.isArray(data.failed_logins)
    ? data.failed_logins
    : [];
  const mfaCoverage =
    data.mfa_coverage &&
    typeof data.mfa_coverage === 'object' &&
    !Array.isArray(data.mfa_coverage)
      ? data.mfa_coverage
      : ({} as any);

  const { totalLogins, successLogins } = loginSummary.reduce(
    (acc: { totalLogins: number; successLogins: number }, r: any) => {
      acc.totalLogins += r.event_count;
      if (r.is_success === 'YES') acc.successLogins += r.event_count;
      return acc;
    },
    { totalLogins: 0, successLogins: 0 }
  );
  const failedLoginCount = totalLogins - successLogins;
  const successRatePct = safePct(successLogins, totalLogins, 0);
  // Whether this window has ANY login telemetry. When false we show a single
  // clear "no login activity" empty state rather than a wall of 0 / 0% cards
  // and an empty bar chart, which read as broken.
  const hasLoginActivity =
    totalLogins > 0 ||
    loginTrend.some(
      (r: any) => safeNum(r?.success) + safeNum(r?.failure) + safeNum(r?.total) > 0,
    );

  // Iter 5 additive panels — pull optional fields with graceful fallbacks
  const identity = ((data as any)?.identity ?? {}) as {
    roles?: number;
    privileged_users?: number;
    service_accounts?: number;
    inactive_users?: number;
  };
  const userSecurityScore =
    (data as any)?.user_security_score ?? null;
  const policies = ((data as any)?.policies ?? {}) as {
    network_pct?: number;
    password_pct?: number;
  };
  const risksFromApi: Array<{ title?: string; severity?: string }> = Array.isArray(
    (data as any)?.risks
  )
    ? (data as any).risks
    : [];
  // No fake risks. Empty list renders the panel's empty state.
  const topRisks = risksFromApi.slice(0, 5);
  const identityHasData =
    (identity.roles ?? 0) +
      (identity.privileged_users ?? 0) +
      (identity.service_accounts ?? 0) +
      (identity.inactive_users ?? 0) >
    0;
  const identityBreakdown = [
    { name: 'Roles', value: identity.roles ?? 0 },
    { name: 'Privileged Users', value: identity.privileged_users ?? 0 },
    { name: 'Service Accounts', value: identity.service_accounts ?? 0 },
    { name: 'Inactive Users', value: identity.inactive_users ?? 0 },
  ];
  const mfaPct = mfaCoverage.mfa_percentage ?? 0;
  const networkPolicyPct = policies.network_pct ?? 0;
  const passwordPolicyPct = policies.password_pct ?? 0;
  // Real network-policy count — the backend returns `network_policies_count`
  // (plural); the singular `network_policy_count` is usually null. Prefer the
  // populated one; null when neither exists (→ honest "—", never a fake 0).
  const networkPolicyCount =
    (data as any).network_policies_count ??
    (data as any).network_policy_count ??
    null;
  // Per-policy coverage percentages live on a `policies` object this backend
  // doesn't return — so we must show "—" rather than a fabricated 0% bar.
  const mfaComputed = mfaCoverage.mfa_percentage != null;
  const hasNetworkPolicyPct = policies.network_pct != null;
  const hasPasswordPolicyPct = policies.password_pct != null;
  const privilegedUsers = identity.privileged_users ?? null;
  const severityCls = (sev?: string) => {
    const s = (sev || '').toLowerCase();
    if (s === 'high' || s === 'critical')
      return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
    if (s === 'medium')
      return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
    return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
  };

  return (
    <>
      {/* KPI Cards — 6 base + 2 Iter-5 cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-8">
        <KpiCard
          label="Total Logins"
          value={totalLogins.toLocaleString()}
          icon={Users}
          color="blue"
        />
        <KpiCard
          label="Success Rate"
          value={totalLogins > 0 ? `${successRatePct}%` : '—'}
          icon={CheckCircle}
          color="green"
        />
        <KpiCard
          label="Failed Attempts"
          value={failedLoginCount.toLocaleString()}
          icon={AlertTriangle}
          color={failedLoginCount > 0 ? 'red' : 'green'}
        />
        <KpiCard
          label="MFA Coverage"
          value={
            mfaCoverage.mfa_percentage == null
              ? '—'
              : `${safeNum(mfaCoverage.mfa_percentage, 0)}%`
          }
          icon={Lock}
          color="violet"
        />
        <KpiCard
          label="Network Policies"
          value={networkPolicyCount}
          icon={Shield}
          color="amber"
        />
        <KpiCard
          label="Open Alerts"
          value={(data as any).open_security_alerts ?? null}
          icon={AlertTriangle}
          color={
            ((data as any).open_security_alerts ?? 0) > 0 ? 'rose' : 'green'
          }
        />
        <KpiCard
          label="Privileged Users"
          value={identity.privileged_users ?? null}
          icon={ShieldCheck}
          color="rose"
        />
        <KpiCard
          label="User Security Score"
          value={userSecurityScore == null ? '—' : userSecurityScore}
          icon={Gauge}
          color="cyan"
          suffix={userSecurityScore == null ? undefined : '/100'}
        />
      </div>

      {/* Actionable security CTAs — deterministic chips (rendered immediately
          from already-loaded data) cover network-policy / privileged / audit;
          MFA is owned by the chip, so we exclude MFA from the data-driven
          governance recommendations below to avoid a duplicate CTA. */}
      <div className="flex flex-wrap items-center gap-2">
        {mfaComputed && mfaPct < 80 ? (
          <ActionChip
            label="Require MFA"
            tone="red"
            icon={Lock}
            href="/governance/users"
          />
        ) : null}
        {privilegedUsers != null && privilegedUsers > 5 ? (
          <ActionChip
            label="Review privileged access"
            tone="amber"
            icon={ShieldCheck}
            href="/governance/roles"
          />
        ) : null}
        {networkPolicyCount === 0 ? (
          <ActionChip
            label="Apply network policy"
            tone="amber"
            icon={Shield}
            href="/governance"
          />
        ) : null}
        <ActionChip
          label="View access audit"
          tone="blue"
          icon={Eye}
          onClick={() =>
            document
              .getElementById('cc-access-audit')
              ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        />
      </div>

      <RecoCtaList
        dimension="gov"
        currentTab="security"
        onNavigateTab={onNavigateTab}
        title="Recommended security actions"
        exclude={(r) => /mfa/i.test(r.title)}
      />

      {/* Login Trend Chart */}
      <SectionCard title={`Login Activity (${data.period_days ?? 7}d)`}>
        {hasLoginActivity ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={loginTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar
                  dataKey="success"
                  fill="#10B981"
                  name="Success"
                  radius={[4, 4, 0, 0]}
                  stackId="a"
                />
                <Bar
                  dataKey="failure"
                  fill="#EF4444"
                  name="Failed"
                  radius={[4, 4, 0, 0]}
                  stackId="a"
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex h-64 flex-col items-center justify-center gap-1 text-center">
            <Lock className="h-8 w-8 text-gray-300 dark:text-gray-600" />
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              No login activity in this window
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500">
              No successful or failed sign-ins were recorded for the selected
              time range. Widen the range or check that audit views are
              readable.
            </p>
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Client Type Distribution */}
        <SectionCard title="Login by Client Type">
          {clientTypes.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={clientTypes.map((c: any) => ({
                      name: c.client_type || 'Unknown',
                      value: c.login_count,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {clientTypes.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">No data</p>
          )}
        </SectionCard>

        {/* MFA Coverage Card */}
        <SectionCard title="User Security Overview">
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-blue-50 p-4 text-center dark:bg-blue-900/20">
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                  {dash(mfaCoverage.total_users)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Total Users
                </p>
              </div>
              <div className="rounded-lg bg-green-50 p-4 text-center dark:bg-green-900/20">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {dash(mfaCoverage.mfa_enabled)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  MFA Enabled
                </p>
              </div>
              <div className="rounded-lg bg-red-50 p-4 text-center dark:bg-red-900/20">
                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {dash(mfaCoverage.disabled_users)}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Disabled
                </p>
              </div>
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  MFA Adoption
                </span>
                <span className="text-sm font-medium text-gray-900 dark:text-white">
                  {safeNum(mfaCoverage.mfa_percentage, 0)}%
                </span>
              </div>
              <div className="h-3 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-3 rounded-full bg-green-500 transition-all"
                  style={{ width: `${Math.min(100, safeNum(mfaCoverage.mfa_percentage, 0))}%` }}
                />
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Iter 5 — Identity & Access Health + Top Risks + Policy Coverage */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard title="Identity & Access Health" className="lg:col-span-2">
          {identityHasData ? (
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {identityBreakdown.map((row, i) => (
                <div
                  key={row.name}
                  className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center dark:border-gray-700 dark:bg-gray-800/40"
                >
                  <div
                    className="mx-auto mb-2 h-2 w-12 rounded-full"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />
                  <p className="text-xl font-bold text-gray-900 dark:text-white">
                    {row.value.toLocaleString()}
                  </p>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    {row.name}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {identityBreakdown.map((row, i) => (
                  <div
                    key={row.name}
                    className="rounded-lg border border-gray-200 bg-gray-50 p-4 text-center dark:border-gray-700 dark:bg-gray-800/40"
                  >
                    <div
                      className="mx-auto mb-2 h-2 w-12 rounded-full opacity-40"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }}
                    />
                    <p className="text-xl font-bold text-gray-400 dark:text-gray-500">
                      0
                    </p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      {row.name}
                    </p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-center text-xs text-gray-500 dark:text-gray-400">
                Identity breakdown not yet computed
              </p>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Top Risks">
          {topRisks.length === 0 ? (
            <p className="py-6 text-center text-xs text-gray-400">
              No active risks detected.
            </p>
          ) : (
            <ul className="space-y-2">
              {topRisks.map((risk, i) => (
                <li
                  key={`${risk.title ?? 'risk'}-${i}`}
                  className="flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/30"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-500" />
                  <div className="flex-1">
                    <p className="text-xs font-medium text-gray-900 dark:text-white">
                      {String(risk.title ?? '—')}
                    </p>
                    <span
                      className={cn(
                        'mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium',
                        severityCls(risk.severity)
                      )}
                    >
                      {(risk.severity || 'info').toString().toUpperCase()}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      <SectionCard title="Policy Coverage">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {[
            {
              label: 'MFA Coverage',
              value: mfaPct,
              available: mfaComputed,
              color: 'bg-green-500',
            },
            {
              label: 'Network Policy',
              value: networkPolicyPct,
              available: hasNetworkPolicyPct,
              color: 'bg-blue-500',
            },
            {
              label: 'Password Policy',
              value: passwordPolicyPct,
              available: hasPasswordPolicyPct,
              color: 'bg-violet-500',
            },
          ].map((p) => (
            <div key={p.label}>
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  {p.label}
                </span>
                {/* Honest: "—" when the backend hasn't computed this coverage,
                    never a fabricated 0%. */}
                <span className="text-xs font-medium text-gray-900 dark:text-white">
                  {p.available ? `${p.value}%` : '—'}
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                {p.available ? (
                  <div
                    className={cn('h-2 rounded-full transition-all', p.color)}
                    style={{ width: `${Math.min(100, Math.max(0, p.value))}%` }}
                  />
                ) : null}
              </div>
              {!p.available ? (
                <p className="mt-1 text-[10px] text-gray-400 dark:text-gray-500">
                  not yet computed
                </p>
              ) : null}
            </div>
          ))}
        </div>
      </SectionCard>

      {/* Failed Logins Audit Table */}
      {failedLogins.length > 0 && (
        <SmartAuditTable
          title="Top Failed Login Attempts"
          subtitle="LOGIN_HISTORY"
          pageSize={10}
          rows={
            failedLogins.map((f: any) => ({
              user: safeStr(f.user_name),
              failures: f.failure_count ?? null,
              last_failure: f.last_failure ?? null,
              error: f.last_error ?? null,
            })) as SmartRow[]
          }
        />
      )}

      {/* Access audit — full query + login history (scroll target for the
          "View access audit" CTA above). */}
      <div id="cc-access-audit" className="space-y-6">
        {/* Full Query History Audit (from ACCOUNT_USAGE) */}
        <QueryHistoryTable days={data.period_days || 7} />

        {/* Full Login History Audit (from ACCOUNT_USAGE) */}
        <LoginHistoryTable days={data.period_days || 7} />
      </div>
    </>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// TAB 4: GOVERNANCE & GRANTS (merged)
// ═════════════════════════════════════════════════════════════════════════════

const GovernanceGrantsTab = memo(function GovernanceGrantsTab({
  data,
  loading,
}: {
  data: GovernanceGrantsOverviewResponse | null;
  loading: boolean;
}) {
  if (loading || !data) return <LoadingSection />;

  const s = data.summary || ({} as any);
  const objectCoverage = Array.isArray(data.object_coverage)
    ? data.object_coverage
    : [];
  const roleGrantDist = Array.isArray(data.role_grant_distribution)
    ? data.role_grant_distribution
    : [];
  const privilegeDist = Array.isArray(data.privilege_distribution)
    ? data.privilege_distribution
    : [];
  const policyCoverage = Array.isArray(data.policy_coverage)
    ? data.policy_coverage
    : [];
  const userRoleDist = Array.isArray(data.user_role_distribution)
    ? data.user_role_distribution
    : [];
  const recentChanges = Array.isArray(data.recent_changes)
    ? data.recent_changes
    : [];
  const auditLog = Array.isArray(data.audit_log) ? data.audit_log : [];

  const policyPieData = [
    { name: 'Masking', value: s.masking_policies ?? 0 },
    { name: 'Row Access', value: s.rls_policies ?? 0 },
    { name: 'Aggregation', value: s.aggregation_policies ?? 0 },
  ].filter((d) => d.value > 0);

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
        <KpiCard
          label="Total Roles"
          value={s.role_count ?? null}
          icon={Users}
          color="blue"
        />
        <KpiCard
          label="Policies"
          value={s.total_policies ?? null}
          icon={Shield}
          color="violet"
        />
        <KpiCard
          label="Tags Applied"
          value={s.total_tags ?? null}
          icon={Layers}
          color="cyan"
        />
        <KpiCard
          label="Total Grants"
          value={s.total_role_grants ?? null}
          icon={FileText}
          color="green"
        />
        <KpiCard
          label="Users with Roles"
          value={s.users_with_roles ?? null}
          icon={Users}
          color="amber"
        />
        <KpiCard
          label="Object Types"
          value={s.object_types_covered ?? null}
          icon={Database}
          color="rose"
        />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Policy Distribution Pie */}
        <SectionCard title="Policy Distribution">
          {policyPieData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={policyPieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {policyPieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">
              No policies defined
            </p>
          )}
        </SectionCard>

        {/* Grants by Object Type */}
        <SectionCard title="Grants by Object Type">
          {objectCoverage.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={objectCoverage.map((o: any) => ({
                      name: o.object_type,
                      value: o.grant_count,
                    }))}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {objectCoverage.map((_: any, i: number) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">
              No grants data
            </p>
          )}
        </SectionCard>
      </div>

      {/* Grants per Role + Privilege Distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Grants per Role (Top 15)">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={roleGrantDist.slice(0, 15)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="role_name"
                  width={140}
                  tick={{ fill: '#9CA3AF', fontSize: 10 }}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar
                  dataKey="total_grants"
                  fill="#3B82F6"
                  name="Total Grants"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        <SectionCard title="Privilege Distribution (Top 15)">
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={privilegeDist.slice(0, 15)}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="privilege"
                  tick={{ fill: '#9CA3AF', fontSize: 10 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                />
                <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar
                  dataKey="grant_count"
                  fill="#8B5CF6"
                  name="Grants"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      {/* Policy Coverage + User-Role Distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Policy Coverage">
          <div className="space-y-3">
            {policyCoverage.map((p: any, i: number) => (
              <div
                key={i}
                className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    {safeStr(p.policy_kind)}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge size="sm" variant="flat" color="primary">
                      {p.unique_policies} policies
                    </Badge>
                    <Badge size="sm" variant="flat" color="success">
                      {p.objects_covered} objects
                    </Badge>
                  </div>
                </div>
              </div>
            ))}
            {policyCoverage.length === 0 && (
              <p className="py-4 text-center text-sm text-gray-400">
                No policy references
              </p>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Roles per User (Top 15)">
          <div className="max-h-64 space-y-2 overflow-y-auto">
            {userRoleDist.slice(0, 15).map((u: any, i: number) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-800"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {safeStr(u.user_name)}
                  </p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {Array.isArray(u.roles)
                      ? u.roles.join(', ')
                      : safeStr(u.roles)}
                  </p>
                </div>
                <Badge
                  size="sm"
                  variant="flat"
                  color={u.role_count > 5 ? 'warning' : 'primary'}
                >
                  {u.role_count} roles
                </Badge>
              </div>
            ))}
            {userRoleDist.length === 0 && (
              <p className="py-4 text-center text-sm text-gray-400">
                No user-role data
              </p>
            )}
          </div>
        </SectionCard>
      </div>

      {/* Recent Grant Changes */}
      <SectionCard title={`Recent Grant Changes (${data.period_days ?? 180}d)`}>
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {recentChanges.slice(0, 20).map((c: any, i: number) => (
            <div
              key={i}
              className={cn(
                'rounded-lg p-3',
                c.action === 'GRANTED'
                  ? 'bg-green-50 dark:bg-green-900/20'
                  : 'bg-red-50 dark:bg-red-900/20'
              )}
            >
              <div className="mb-1 flex items-center justify-between">
                <Badge
                  size="sm"
                  variant="flat"
                  color={c.action === 'GRANTED' ? 'success' : 'danger'}
                >
                  {c.action}
                </Badge>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {relativeTime(
                    c.action === 'GRANTED' ? c.created_on : c.deleted_on
                  )}
                </span>
              </div>
              <p className="text-sm text-gray-900 dark:text-white">
                {safeStr(c.privilege)} on {safeStr(c.object_type)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Role: {safeStr(c.role_name)} | Object: {safeStr(c.object_name)}
              </p>
            </div>
          ))}
          {recentChanges.length === 0 && (
            <p className="py-4 text-center text-sm text-gray-400">
              No recent changes
            </p>
          )}
        </div>
      </SectionCard>

      {/* Audit Trail */}
      {auditLog.length > 0 && (
        <AuditTable
          data={auditLog}
          title="Recent Audit Trail"
          columns={[
            {
              key: 'action',
              label: 'Action',
              sortable: true,
              filterable: true,
              render: (v: string) => (
                <Badge
                  size="sm"
                  variant="flat"
                  color={
                    v?.includes('CREATE')
                      ? 'success'
                      : v?.includes('DROP')
                        ? 'danger'
                        : 'info'
                  }
                >
                  {v}
                </Badge>
              ),
            },
            {
              key: 'entity_type',
              label: 'Entity',
              sortable: true,
              filterable: true,
              render: (v: string, row: any) => (
                <span className="text-gray-900 dark:text-white">
                  {v}: {row.entity_name}
                </span>
              ),
            },
            {
              key: 'target_type',
              label: 'Target',
              filterable: true,
              render: (v: string, row: any) =>
                v ? `${v}: ${row.target_name}` : '-',
            },
            {
              key: 'performed_by',
              label: 'By',
              sortable: true,
              filterable: true,
            },
            {
              key: 'performed_at',
              label: 'When',
              sortable: true,
              render: (v: string) => <span title={v}>{relativeTime(v)}</span>,
            },
          ]}
        />
      )}
    </>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// TAB 5: DATA OPERATIONS (merged Data Loading + Automation)
// ═════════════════════════════════════════════════════════════════════════════

const DataOperationsTab = memo(function DataOperationsTab({
  data,
  loading,
}: {
  data: DataOperationsOverviewResponse | null;
  loading: boolean;
}) {
  if (loading || !data) return <LoadingSection />;

  const loadingSummary = (data as any).loading_summary || {};
  const automationSummary = (data as any).automation_summary || {};
  const dailyVolume = Array.isArray((data as any).daily_volume)
    ? (data as any).daily_volume
    : [];
  const pipeActivity = Array.isArray((data as any).pipe_activity)
    ? (data as any).pipe_activity
    : [];
  const loadingErrors = Array.isArray((data as any).loading_errors)
    ? (data as any).loading_errors
    : [];
  const taskDaily = Array.isArray((data as any).task_daily)
    ? (data as any).task_daily
    : [];
  const activeTasks = Array.isArray((data as any).active_tasks)
    ? (data as any).active_tasks
    : [];
  const dynamicTables = Array.isArray((data as any).dynamic_tables)
    ? (data as any).dynamic_tables
    : [];
  const recentTasks = Array.isArray((data as any).recent_tasks)
    ? (data as any).recent_tasks
    : [];

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-6">
        <KpiCard
          label="Files Loaded"
          value={loadingSummary.total_files ?? null}
          icon={Upload}
          color="blue"
        />
        <KpiCard
          label="Rows Ingested"
          value={loadingSummary.total_rows ?? null}
          icon={Database}
          color="green"
        />
        <KpiCard
          label="Data Volume"
          value={
            loadingSummary.total_bytes != null
              ? `${(loadingSummary.total_bytes / 1073741824).toFixed(2)} GB`
              : null
          }
          icon={Box}
          color="violet"
        />
        <KpiCard
          label="Load Success"
          value={
            loadingSummary.success_rate != null
              ? `${loadingSummary.success_rate}%`
              : null
          }
          icon={CheckCircle}
          color="emerald"
        />
        <KpiCard
          label="Task Runs"
          value={automationSummary.total_runs ?? null}
          icon={Clock}
          color="amber"
        />
        <KpiCard
          label="Active Tasks"
          value={automationSummary.active_tasks ?? null}
          icon={Zap}
          color="cyan"
        />
      </div>

      {/* Data Loading Section */}
      <div className="mt-2">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
          <Upload className="h-4 w-4" /> Data Loading
        </h3>
      </div>

      {/* Daily Volume Chart */}
      {dailyVolume.length > 0 && (
        <SectionCard title="Daily Loading Volume">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dailyVolume}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#9CA3AF', fontSize: 11 }}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fill: '#9CA3AF', fontSize: 11 }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: '#9CA3AF', fontSize: 11 }}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar
                  yAxisId="left"
                  dataKey="file_count"
                  fill="#3B82F6"
                  name="Files"
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="total_rows"
                  stroke="#10B981"
                  name="Rows"
                  strokeWidth={2}
                  dot={false}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Pipe Activity */}
        <SectionCard title="Snowpipe Activity">
          {pipeActivity.length > 0 ? (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {pipeActivity.slice(0, 10).map((p: any, i: number) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-800"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {safeStr(p.pipe_name)}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {safeStr(p.files_inserted, '0')} files,{' '}
                      {((Number(p.bytes_inserted) || 0) / 1048576).toFixed(1)}{' '}
                      MB
                    </p>
                  </div>
                  <Badge size="sm" variant="flat" color="primary">
                    {safeToFixed(p.credits, 2)} credits
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">
              No pipe activity
            </p>
          )}
        </SectionCard>

        {/* Loading Errors */}
        <SectionCard title="Recent Loading Errors">
          {loadingErrors.length > 0 ? (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {loadingErrors.slice(0, 10).map((e: any, i: number) => (
                <div
                  key={i}
                  className="rounded-lg bg-red-50 p-3 dark:bg-red-900/20"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {safeStr(e.table)}
                    </p>
                    <Badge size="sm" variant="flat" color="danger">
                      {safeStr(e.error_count, '0')} errors
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">
                    {safeStr(e.error_message)}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-8 text-center">
              <CheckCircle className="mx-auto mb-2 h-8 w-8 text-green-500" />
              <p className="text-sm text-gray-500 dark:text-gray-400">
                No loading errors
              </p>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Automation Section */}
      <div className="mt-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
          <Zap className="h-4 w-4" /> Automation & Tasks
        </h3>
      </div>

      {/* Task Execution Trend */}
      {taskDaily.length > 0 && (
        <SectionCard title="Task Execution Trend">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={taskDaily}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#9CA3AF', fontSize: 11 }}
                />
                <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar
                  dataKey="success"
                  fill="#10B981"
                  name="Success"
                  stackId="a"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="failure"
                  fill="#EF4444"
                  name="Failed"
                  stackId="a"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="skipped"
                  fill="#9CA3AF"
                  name="Skipped"
                  stackId="a"
                  radius={[4, 4, 0, 0]}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Active Tasks */}
        <SectionCard title="Active Tasks">
          {activeTasks.length > 0 ? (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {activeTasks.slice(0, 15).map((t: any, i: number) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-800"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {t.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {t.database}.{t.schema}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {t.schedule && (
                      <span className="text-xs text-gray-400">
                        {t.schedule}
                      </span>
                    )}
                    <Badge
                      size="sm"
                      variant="flat"
                      color={t.state === 'started' ? 'success' : 'secondary'}
                    >
                      {t.state}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">
              No active tasks
            </p>
          )}
        </SectionCard>

        {/* Dynamic Tables */}
        <SectionCard title="Dynamic Tables">
          {dynamicTables.length > 0 ? (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {dynamicTables.slice(0, 15).map((dt: any, i: number) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-800"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {dt.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {dt.database}.{dt.schema}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge size="sm" variant="flat" color="info">
                      {dt.target_lag}
                    </Badge>
                    <Badge size="sm" variant="flat" color="secondary">
                      {dt.refresh_mode}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">
              No dynamic tables
            </p>
          )}
        </SectionCard>
      </div>

      {/* Recent Failed Tasks Audit Table */}
      {recentTasks.filter((t: any) => t.state === 'FAILED').length > 0 && (
        <AuditTable
          data={recentTasks.filter((t: any) => t.state === 'FAILED')}
          title="Recent Failed Tasks"
          columns={[
            {
              key: 'task_name',
              label: 'Task',
              sortable: true,
              filterable: true,
              render: (v: string) => (
                <span className="font-medium text-gray-900 dark:text-white">
                  {v}
                </span>
              ),
            },
            {
              key: 'database',
              label: 'Database',
              sortable: true,
              filterable: true,
            },
            {
              key: 'error_message',
              label: 'Error',
              filterable: true,
              render: (v: string) => (
                <span className="block max-w-xs truncate">{v}</span>
              ),
            },
            {
              key: 'scheduled_time',
              label: 'Time',
              sortable: true,
              render: (v: string) => <span title={v}>{relativeTime(v)}</span>,
            },
          ]}
        />
      )}
    </>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// TAB: PERFORMANCE
// ═════════════════════════════════════════════════════════════════════════════

const PerformanceTab = memo(function PerformanceTab({
  data,
  loading,
}: {
  data: PerformanceOverviewResponse | null;
  loading: boolean;
}) {
  const { avgP50, avgP95, totalQueries } = useMemo(() => {
    const queryPerf = Array.isArray(data?.query_performance)
      ? data.query_performance
      : [];
    if (queryPerf.length === 0)
      return { avgP50: 0, avgP95: 0, totalQueries: 0 };
    let sumP50 = 0,
      sumP95 = 0,
      sumQueries = 0;
    for (const r of queryPerf) {
      sumP50 += r.p50_ms ?? 0;
      sumP95 += r.p95_ms ?? 0;
      sumQueries += r.query_count ?? 0;
    }
    return {
      avgP50: Math.round(sumP50 / queryPerf.length),
      avgP95: Math.round(sumP95 / queryPerf.length),
      totalQueries: sumQueries,
    };
  }, [data]);

  if (loading || !data) return <LoadingSection />;

  const queryPerf = Array.isArray(data.query_performance)
    ? data.query_performance
    : [];
  const slowQueries = Array.isArray(data.slow_queries) ? data.slow_queries : [];
  const queryTypes = Array.isArray(data.query_types) ? data.query_types : [];

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <KpiCard
          label="Total Queries"
          value={totalQueries.toLocaleString()}
          icon={BarChart3}
          color="blue"
        />
        <KpiCard
          label="P50 Latency"
          value={`${(avgP50 / 1000).toFixed(1)}s`}
          icon={Gauge}
          color="green"
        />
        <KpiCard
          label="P95 Latency"
          value={`${(avgP95 / 1000).toFixed(1)}s`}
          icon={Gauge}
          color="amber"
        />
        <KpiCard
          label="Slow Queries"
          value={slowQueries.length}
          icon={AlertTriangle}
          color="red"
        />
        <KpiCard
          label="Query Types"
          value={queryTypes.length}
          icon={Cpu}
          color="violet"
        />
      </div>

      {/* Query Latency Trend */}
      <SectionCard title={`Query Latency Trend (${data.period_days ?? 7}d)`}>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={queryPerf}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
              <YAxis
                tick={{ fill: '#9CA3AF', fontSize: 11 }}
                label={{
                  value: 'ms',
                  angle: -90,
                  position: 'insideLeft',
                  fill: '#9CA3AF',
                }}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="p99_ms"
                stroke="#EF4444"
                fill="#EF4444"
                fillOpacity={0.1}
                name="P99"
              />
              <Area
                type="monotone"
                dataKey="p95_ms"
                stroke="#F59E0B"
                fill="#F59E0B"
                fillOpacity={0.1}
                name="P95"
              />
              <Line
                type="monotone"
                dataKey="p50_ms"
                stroke="#10B981"
                strokeWidth={2}
                name="P50"
                dot={false}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Query Type Distribution */}
        <SectionCard title="Query Type Distribution">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={queryTypes.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="type"
                  width={100}
                  tick={{ fill: '#9CA3AF', fontSize: 11 }}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar
                  dataKey="count"
                  fill="#3B82F6"
                  name="Count"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>

        {/* Compilation vs Execution */}
        <SectionCard title="Compile vs Execute Time">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={queryPerf}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#9CA3AF', fontSize: 11 }}
                />
                <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="avg_compile_ms"
                  stroke="#8B5CF6"
                  fill="#8B5CF6"
                  fillOpacity={0.2}
                  name="Compile"
                  stackId="1"
                />
                <Area
                  type="monotone"
                  dataKey="avg_exec_ms"
                  stroke="#3B82F6"
                  fill="#3B82F6"
                  fillOpacity={0.2}
                  name="Execute"
                  stackId="1"
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      </div>

      {/* Slow Queries Audit Table */}
      {slowQueries.length > 0 && (
        <AuditTable
          data={slowQueries}
          title="Slowest Queries"
          columns={[
            {
              key: 'query_text',
              label: 'Query',
              filterable: true,
              render: (v: string) => (
                <span className="block max-w-xs truncate font-mono text-xs text-gray-900 dark:text-white">
                  {v}
                </span>
              ),
            },
            { key: 'user', label: 'User', sortable: true, filterable: true },
            {
              key: 'warehouse',
              label: 'Warehouse',
              sortable: true,
              filterable: true,
            },
            {
              key: 'duration_ms',
              label: 'Duration',
              sortable: true,
              align: 'right',
              render: (v: number) => (
                <Badge
                  size="sm"
                  variant="flat"
                  color={v > 60000 ? 'danger' : 'warning'}
                >
                  {(v / 1000).toFixed(1)}s
                </Badge>
              ),
            },
            {
              key: 'start_time',
              label: 'When',
              sortable: true,
              render: (v: string) => <span title={v}>{relativeTime(v)}</span>,
            },
          ]}
        />
      )}
    </>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// TAB 8: COMPUTE & INFRASTRUCTURE
// ═════════════════════════════════════════════════════════════════════════════

const ComputeTab = memo(function ComputeTab({
  data,
  loading,
}: {
  data: InfrastructureResponse | null;
  loading: boolean;
}) {
  const { totalCredits, sorted, topWarehouse } = useMemo(() => {
    const warehouses = Array.isArray(data?.warehouses) ? data.warehouses : [];
    const total = warehouses.reduce(
      (s: number, w: any) => s + safeNum(w.total_credits, 0),
      0
    );
    const s = [...warehouses].sort(
      (a: any, b: any) => (b.total_credits || 0) - (a.total_credits || 0)
    );
    return { totalCredits: total, sorted: s, topWarehouse: s[0] || null };
  }, [data]);

  if (loading || !data) return <LoadingSection />;

  const warehouses = Array.isArray(data.warehouses) ? data.warehouses : [];
  const replicationDbs = Array.isArray(data.replication?.databases)
    ? data.replication.databases
    : [];

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KpiCard
          label="Warehouses"
          value={warehouses.length}
          icon={Server}
          color="blue"
        />
        <KpiCard
          label="Total Credits"
          value={totalCredits.toFixed(2)}
          icon={DollarSign}
          color="amber"
        />
        <KpiCard
          label="Top Consumer"
          value={topWarehouse?.warehouse_name || '-'}
          icon={Cpu}
          color="violet"
        />
        <KpiCard
          label="Replication DBs"
          value={replicationDbs.length}
          icon={GitBranch}
          color="green"
        />
      </div>

      {/* Warehouse Credits Bar Chart */}
      {sorted.length > 0 && (
        <SectionCard title="Warehouse Credits">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sorted.slice(0, 12)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis type="number" tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="warehouse_name"
                  width={130}
                  tick={{ fill: '#9CA3AF', fontSize: 10 }}
                />
                <Tooltip content={<ChartTooltip />} />
                <Bar
                  dataKey="total_credits"
                  fill="#F59E0B"
                  name="Credits"
                  radius={[0, 4, 4, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </SectionCard>
      )}

      {/* Warehouse Details Audit Table */}
      <AuditTable
        data={warehouses}
        title="Warehouse Details"
        emptyMessage="No warehouses found"
        columns={[
          {
            key: 'warehouse_name',
            label: 'Warehouse',
            sortable: true,
            filterable: true,
            render: (v: string) => (
              <span className="font-medium text-gray-900 dark:text-white">
                {v}
              </span>
            ),
          },
          {
            key: 'total_credits',
            label: 'Total Credits',
            sortable: true,
            align: 'right',
            render: (v: number) => safeToFixed(v, 2, EM_DASH),
          },
          {
            key: 'compute_credits',
            label: 'Compute',
            sortable: true,
            align: 'right',
            render: (v: number) => safeToFixed(v, 2, EM_DASH),
          },
          {
            key: 'cloud_credits',
            label: 'Cloud',
            sortable: true,
            align: 'right',
            render: (v: number) => safeToFixed(v, 2, EM_DASH),
          },
        ]}
      />

      {/* Replication + Tasks Summary */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Replication">
          {replicationDbs.length > 0 ? (
            <div className="max-h-64 space-y-2 overflow-y-auto">
              {replicationDbs.map((r: any, i: number) => (
                <div
                  key={i}
                  className="flex items-center justify-between rounded-lg bg-gray-50 p-3 dark:bg-gray-800"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {r.database_name || r.name}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      DATABASE
                    </p>
                  </div>
                  <Badge size="sm" variant="flat" color="info">
                    {safeToFixed(r.credits, 2, EM_DASH)} credits
                  </Badge>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-gray-400">
              No replication configured
            </p>
          )}
        </SectionCard>

        <SectionCard title="Tasks & Pipes">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-blue-50 p-4 text-center dark:bg-blue-900/20">
              <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {dash(data.tasks?.total_7d)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Tasks (7d)
              </p>
            </div>
            <div className="rounded-lg bg-green-50 p-4 text-center dark:bg-green-900/20">
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">
                {dash(data.pipes?.total_files)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Pipes</p>
            </div>
            <div className="rounded-lg bg-amber-50 p-4 text-center dark:bg-amber-900/20">
              <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                {safeToFixed(data.clustering?.total_credits, 2, EM_DASH)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Cluster Credits
              </p>
            </div>
            <div className="rounded-lg bg-violet-50 p-4 text-center dark:bg-violet-900/20">
              <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">
                {safeToFixed(data.materialized_views?.total_credits, 2, EM_DASH)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                MV Credits
              </p>
            </div>
          </div>
        </SectionCard>
      </div>
    </>
  );
});

// ═════════════════════════════════════════════════════════════════════════════
// TAB 9: PLATFORM ACTIVITY (Data360 Internal + Activity Feed)
// ═════════════════════════════════════════════════════════════════════════════

const PlatformActivityTab = memo(function PlatformActivityTab({
  platformData,
  activityFeed,
  summary,
  loading,
  onNavigateTab,
}: {
  platformData: PlatformActivityResponse | null;
  activityFeed: ActivityFeedResponse | null;
  summary: SummaryResponse | null;
  loading: boolean;
  /** Switch the parent dashboard to another tab (for same-page CTA targets). */
  onNavigateTab?: (id: string) => void;
}) {
  const { totalEvents, totalSessions, uniqueUsersTotal } = useMemo(() => {
    const ea = Array.isArray(platformData?.event_activity)
      ? platformData.event_activity
      : [];
    const us = Array.isArray(platformData?.user_sessions)
      ? platformData.user_sessions
      : [];
    // Honest totals: `null` (→ "—") when the source array is absent/empty,
    // never a fabricated 0-sum over no rows.
    return {
      totalEvents: ea.length > 0 ? ea.reduce((s: number, e: any) => s + safeNum(e.count), 0) : null,
      totalSessions: us.length > 0 ? us.reduce((s: number, u: any) => s + safeNum(u.sessions), 0) : null,
      uniqueUsersTotal:
        us.length > 0 ? Math.max(...us.map((u: any) => safeNum(u.unique_users))) : null,
    };
  }, [platformData]);

  // Aggregate module usage for pie chart
  const modulePieData = useMemo(() => {
    const mu = Array.isArray(platformData?.module_usage)
      ? platformData.module_usage
      : [];
    const agg: Record<string, number> = {};
    mu.forEach((m: any) => {
      agg[m.module] = (agg[m.module] || 0) + m.count;
    });
    return Object.entries(agg)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [platformData]);

  // Activity feed as table data
  const activityRows = useMemo(() => {
    const events = Array.isArray(activityFeed?.events)
      ? activityFeed.events
      : [];
    return events.map((evt: any) => ({
      module: evt.module,
      event_type: evt.event_type,
      username: evt.username,
      status: evt.status,
      timestamp: evt.timestamp,
    }));
  }, [activityFeed]);

  if (loading || (!platformData && !activityFeed)) return <LoadingSection />;

  const safeEventActivity = Array.isArray(platformData?.event_activity)
    ? platformData.event_activity
    : [];
  const safeUserSessions = Array.isArray(platformData?.user_sessions)
    ? platformData.user_sessions
    : [];
  const safeModuleUsage = Array.isArray(platformData?.module_usage)
    ? platformData.module_usage
    : [];

  // Module action breakdown — aggregate module_usage[].action across modules
  // (the backend already returns a per-(module, action) count). Surfaces the
  // verb mix (view/create/run/delete…) that the module-name pie hides.
  const moduleActionData = (() => {
    const agg: Record<string, number> = {};
    safeModuleUsage.forEach((m) => {
      const action = (m?.action ?? '').toString().trim() || 'unknown';
      agg[action] = (agg[action] || 0) + (Number(m?.count) || 0);
    });
    return Object.entries(agg)
      .map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  })();

  // Iter 5 — extra KPIs + heatmap + top users + client types + notifications
  const totals = (platformData as any)?.totals ?? {};
  const bytesScanned: number = totals.bytes_scanned ?? 0;
  const creditsConsumed: number = totals.credits_consumed ?? 0;
  const avgQueryMs: number = totals.avg_query_ms ?? 0;
  const formatBytes = (b: number): string => {
    if (!b || b <= 0) return '0 B';
    const tb = b / 1024 ** 4;
    if (tb >= 1) return `${tb.toFixed(2)} TB`;
    const gb = b / 1024 ** 3;
    if (gb >= 1) return `${gb.toFixed(2)} GB`;
    const mb = b / 1024 ** 2;
    if (mb >= 1) return `${mb.toFixed(2)} MB`;
    const kb = b / 1024;
    if (kb >= 1) return `${kb.toFixed(1)} KB`;
    return `${b} B`;
  };

  const heatmap: Array<{ day: number; hour: number; value: number }> =
    Array.isArray((platformData as any)?.heatmap)
      ? (platformData as any).heatmap
      : [];
  const heatmapMatrix: number[][] = (() => {
    const m: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
    heatmap.forEach((h) => {
      if (
        typeof h?.day === 'number' &&
        typeof h?.hour === 'number' &&
        h.day >= 0 &&
        h.day <= 6 &&
        h.hour >= 0 &&
        h.hour <= 23
      ) {
        m[h.day][h.hour] = h.value || 0;
      }
    });
    return m;
  })();
  const heatmapMax = heatmap.reduce(
    (max, h) => (h.value > max ? h.value : max),
    0
  );
  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  const topUsers: Array<{ user?: string; count?: number }> = Array.isArray(
    (platformData as any)?.top_users
  )
    ? (platformData as any).top_users
    : [];
  const topUsersData = topUsers
    .filter((u) => u && (u.user || u.count !== undefined))
    .slice(0, 10)
    .map((u) => ({ user: u.user || 'Unknown', count: u.count ?? 0 }));

  const clientTypesActivity: Array<{ client?: string; count?: number }> =
    Array.isArray((platformData as any)?.client_types)
      ? (platformData as any).client_types
      : [];
  const clientTypesPie = clientTypesActivity
    .filter((c) => c && (c.client || c.count !== undefined))
    .map((c) => ({ name: c.client || 'Unknown', value: c.count ?? 0 }));

  const apiNotifications: Array<{ title?: string; level?: string }> =
    Array.isArray((platformData as any)?.notifications)
      ? (platformData as any).notifications
      : [];
  // No invented notifications. Empty list renders the panel's empty state.
  const notifications = apiNotifications.slice(0, 5);

  return (
    <>
      {/* KPI Cards — 6 base + 3 Iter-5 cards */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-9">
        <KpiCard
          label="Total Events"
          value={totalEvents}
          icon={Activity}
          color="blue"
        />
        <KpiCard
          label="Sessions"
          value={totalSessions}
          icon={Users}
          color="green"
        />
        <KpiCard
          label="Max Daily Users"
          value={uniqueUsersTotal}
          icon={Users}
          color="violet"
        />
        <KpiCard
          label="Modules Active"
          value={modulePieData.length}
          icon={Layers}
          color="cyan"
        />
        <KpiCard
          label="Roles"
          value={platformData?.governance_stats?.roles ?? null}
          icon={Shield}
          color="amber"
        />
        <KpiCard
          label="Permissions"
          value={platformData?.governance_stats?.permissions ?? null}
          icon={Lock}
          color="rose"
        />
        {/* `totals` (bytes/credits/avg-query) isn't part of this backend's
            platform-activity payload — render honest "—" rather than a fake 0. */}
        <KpiCard
          label="Bytes Scanned"
          value={totals.bytes_scanned != null ? formatBytes(bytesScanned) : null}
          icon={Database}
          color="blue"
        />
        <KpiCard
          label="Credits Consumed"
          value={
            totals.credits_consumed != null
              ? creditsConsumed.toLocaleString()
              : null
          }
          icon={Zap}
          color="amber"
        />
        <KpiCard
          label="Avg Query ms"
          value={totals.avg_query_ms != null ? avgQueryMs.toLocaleString() : null}
          icon={Timer}
          color="violet"
        />
      </div>

      {/* Actionable platform recommendations (perf dimension — cache hit,
          query intelligence, warehouse sizing). Renders nothing when none. */}
      <RecoCtaList
        dimension="perf"
        currentTab="platform-activity"
        onNavigateTab={onNavigateTab}
        title="Recommended platform actions"
      />

      {/* User Sessions Trend */}
      <SectionCard
        title={`User Sessions (${platformData?.period_days ?? 30}d)`}
      >
        {safeUserSessions.length >= 3 ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={backfillDailySeries(
                  safeUserSessions,
                  platformData?.period_days ?? 30,
                  { sessions: 0, unique_users: 0 }
                )}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis
                  dataKey="date"
                  type="category"
                  interval="preserveStartEnd"
                  tick={{ fill: '#9CA3AF', fontSize: 11 }}
                />
                <YAxis tick={{ fill: '#9CA3AF', fontSize: 11 }} />
                <Tooltip content={<ChartTooltip />} />
                <Bar
                  dataKey="sessions"
                  fill="#3B82F6"
                  name="Sessions"
                  radius={[4, 4, 0, 0]}
                  barSize={20}
                />
                <Line
                  type="monotone"
                  dataKey="unique_users"
                  stroke="#10B981"
                  strokeWidth={2}
                  name="Unique Users"
                  dot={false}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="text-sm font-medium text-gray-600 dark:text-gray-300">
              Not enough activity yet to render a 30-day trend
            </div>
            <p className="mt-1 text-xs text-gray-500">
              Sessions appear here once at least three days of user activity
              have been recorded.
            </p>
          </div>
        )}
      </SectionCard>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Module Usage Distribution */}
        <SectionCard title="Module Usage">
          {modulePieData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={modulePieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {modulePieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="text-sm font-medium text-gray-600 dark:text-gray-300">
                No module activity yet
              </div>
              <p className="mt-1 text-xs text-gray-500">
                A breakdown of usage by module appears here once users start
                interacting with Data360 modules.
              </p>
            </div>
          )}
        </SectionCard>

        {/* Module Action Breakdown — replaces the duplicated Platform
            Governance card (Roles/Permissions are already shown as KPI cards
            above, and full governance lives on its own tab). */}
        <SectionCard title="Action Breakdown">
          {moduleActionData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={moduleActionData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    type="number"
                    tick={{ fill: '#9CA3AF', fontSize: 10 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={110}
                    tick={{ fill: '#9CA3AF', fontSize: 10 }}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    dataKey="value"
                    fill="#06B6D4"
                    radius={[0, 4, 4, 0]}
                    name="Events"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="text-sm font-medium text-gray-600 dark:text-gray-300">
                No module activity yet
              </div>
              <p className="mt-1 text-xs text-gray-500">
                A breakdown of actions (view, create, run…) appears here once
                users start interacting with Data360 modules.
              </p>
            </div>
          )}
        </SectionCard>
      </div>

      {/* Iter 5 — Heatmap + Top Users + Client Types */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <SectionCard title="User Activity Heatmap" className="lg:col-span-2">
          {heatmap.length > 0 && heatmapMax > 0 ? (
            <div className="overflow-x-auto">
              <div className="inline-block">
                <div className="flex items-center gap-1">
                  <div className="w-10" />
                  {Array.from({ length: 24 }).map((_, h) => (
                    <div
                      key={h}
                      className="w-3.5 text-center text-[9px] text-gray-400"
                    >
                      {h % 3 === 0 ? h : ''}
                    </div>
                  ))}
                </div>
                {heatmapMatrix.map((row, d) => (
                  <div key={d} className="mt-0.5 flex items-center gap-1">
                    <div className="w-10 text-right text-[10px] text-gray-500">
                      {dayLabels[d]}
                    </div>
                    {row.map((value, h) => {
                      const opacity =
                        heatmapMax > 0 ? Math.max(0.08, value / heatmapMax) : 0;
                      return (
                        <div
                          key={h}
                          title={`${dayLabels[d]} ${h}:00 — ${value}`}
                          className="h-4 w-3.5 rounded-sm"
                          style={{
                            backgroundColor: `rgba(59, 130, 246, ${opacity})`,
                          }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-gray-400">
                Hour of day (0–23) · Higher opacity = more events
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <div className="text-sm font-medium text-gray-600 dark:text-gray-300">
                No heatmap data available
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Events not yet aggregated.
              </p>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Top Users by Activity">
          {topUsersData.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={topUsersData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis
                    type="number"
                    tick={{ fill: '#9CA3AF', fontSize: 10 }}
                  />
                  <YAxis
                    type="category"
                    dataKey="user"
                    width={90}
                    tick={{ fill: '#9CA3AF', fontSize: 10 }}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar
                    dataKey="count"
                    fill="#8B5CF6"
                    radius={[0, 4, 4, 0]}
                    name="Events"
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-xs text-gray-500">
              No user activity data
            </p>
          )}
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectionCard title="Activity by Client Type">
          {clientTypesPie.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={clientTypesPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={90}
                    paddingAngle={2}
                  >
                    {clientTypesPie.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="py-8 text-center text-xs text-gray-500">
              No client-type data
            </p>
          )}
        </SectionCard>

        <SectionCard title="System Notifications">
          {notifications.length === 0 ? (
            <p className="py-6 text-center text-xs text-gray-400">
              No system notifications.
            </p>
          ) : (
            <ul className="space-y-2">
              {notifications.map((n, i) => (
                <li
                  key={`${n.title ?? 'notif'}-${i}`}
                  className="flex items-start gap-2 rounded-lg border border-gray-100 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-800/30"
                >
                  <Activity className="mt-0.5 h-4 w-4 flex-shrink-0 text-blue-500" />
                  <p className="text-xs text-gray-700 dark:text-gray-300">
                    {String(n.title ?? '')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>

      {/* Full Activity Feed as Audit Table */}
      <SmartAuditTable
        title="Activity Feed"
        subtitle="ACTIVITY_FEED"
        pageSize={10}
        rows={activityRows as SmartRow[]}
      />

      {/* Recent Platform Audit */}
      {platformData?.recent_audit && platformData.recent_audit.length > 0 && (
        <SmartAuditTable
          title="Platform Audit Trail"
          subtitle="AUDIT_TRAIL"
          pageSize={10}
          rows={platformData.recent_audit as unknown as SmartRow[]}
        />
      )}
    </>
  );
});

// ─── Error Boundary wrapper ──────────────────────────────────────────────────
// Catches "Objects are not valid as React child" crashes that occur before
// inline isApiError() guards fire (e.g. from deeply nested unexpected API shapes).

class CommandCenterErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { hasError: true, message: msg };
  }
  componentDidCatch(err: unknown, info: React.ErrorInfo) {
    console.error('[CommandCenter] Render error:', err, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center">
          <div className="mx-auto mb-4 h-10 w-10 text-4xl text-red-400">⚠</div>
          <p className="font-medium text-red-500">
            Dashboard encountered a rendering error.
          </p>
          <p className="mb-4 mt-1 text-xs text-gray-400">
            {this.state.message}
          </p>
          <button
            onClick={() => {
              this.setState({ hasError: false, message: '' });
              window.location.reload();
            }}
            className="rounded-lg bg-red-500 px-4 py-2 text-sm text-white transition-colors hover:bg-red-600"
          >
            Reload Dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function CommandCenterDashboard() {
  return (
    <CommandCenterErrorBoundary>
      <CommandCenterDashboardInner />
    </CommandCenterErrorBoundary>
  );
}
