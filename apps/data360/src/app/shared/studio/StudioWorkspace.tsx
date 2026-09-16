'use client';

/**
 * StudioWorkspace — /studio/workspace: one application, everything on it.
 *
 * The reporting + modeling workspace under an application (?draft=): the
 * REPORTING view runs the generated report live with prefilled rails
 * (widgets, filters, the model's columns) and the "one sentence" refine
 * chat; MODEL shows the entity graph (same React Flow language as
 * /studio/model); SOURCES lists every table the application reads with an
 * honest score computed ONLY from the signals shown on the row; JOBS &
 * QUALITY runs the real DQ gate (rule verdicts, blockers) and lists the
 * AI-PROPOSED automations for this application — proposals only, honestly
 * labeled, nothing launches from here; KNOWLEDGE is the AI enrichment
 * registry (this application's items to confirm/reject + the confirmed
 * account-wide context); GOVERNANCE shows the activation state and hands
 * to the chat-only access flow.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import StudioModelTab from '@/app/shared/studio/StudioModelTab';
import DynamicChart from '@/app/(dashboard)/bi-dashboard/components/DynamicChart';
import StudioJobsPanel from '@/app/shared/studio/StudioJobsPanel';
import StudioQualityPanel from '@/app/shared/studio/StudioQualityPanel';
import StudioReadyKpis from '@/app/shared/studio/StudioReadyKpis';
import StudioSourceCard from '@/app/shared/studio/StudioSourceCard';
import StudioAccessPanel from '@/app/shared/studio/StudioAccessPanel';
import StudioViewKpis from '@/app/shared/studio/StudioViewKpis';
import StudioSourceSystems from '@/app/shared/studio/sources/StudioSourceSystems';
import StudioQualitySummary from '@/app/shared/studio/StudioQualitySummary';
import StudioAppCostBadge from '@/app/shared/studio/StudioAppCostBadge';
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  ChevronDown,
  ChevronRight,
  Database,
  LayoutDashboard,
  LineChart as LineChartIcon,
  Maximize2,
  Minimize2,
  Network,
  PanelRight,
  PanelRightClose,
  PieChart as PieChartIcon,
  Plus,
  RefreshCw,
  Share2,
  Bell,
  Gauge,
  ShieldCheck,
  Table2,
  Workflow as WorkflowIcon,
  X,
  type LucideIcon,
} from 'lucide-react';
import StudioOverviewBrief from '@/app/shared/studio/StudioOverviewBrief';
import StudioWorkflowsPanel from '@/app/shared/studio/StudioWorkflowsPanel';
import StudioDetectionsPanel from '@/app/shared/studio/StudioDetectionsPanel';
import StudioKnowledgeHeader from '@/app/shared/studio/StudioKnowledgeHeader';
import StudioAccessProfilesPanel from '@/app/shared/studio/StudioAccessProfilesPanel';
import StudioGlossary from '@/app/shared/studio/StudioGlossary';
import ObjectsPanel from '@/app/shared/studio/sources/ObjectsPanel';
import {
  LIFECYCLE_CLS,
  LIFECYCLE_WORDS,
  deriveLifecycle,
} from '@/app/shared/studio/application-lifecycle';
import { PlainQuestionHeader, QuietAction } from '@/app/shared/studio/PlainKit';
import {
  ChartVizView,
  isRenderableChart,
  normalizeViz,
  type ChartViz,
} from '@/app/shared/studio/StudioCharts';
import EmptyState from '@/components/ui/EmptyState';
import {
  decideEnrichment,
  decideEnrichmentsMany,
  deleteDraft,
  generateReport,
  getActivation,
  getConsistency,
  getDraftData,
  getDraftReport,
  getTargetsView,
  getModel,
  getModelTableOps,
  grainText,
  listDrafts,
  patchModel,
  listEnrichments,
  publishDraft,
  runChartBatch,
  runDqGate,
  understandDirect,
  updateDraft,
  getAppCost,
  type AppCost,
  type ConsistencyIssue,
  type AiEnrichment,
  type DqGateResult,
  type GlobalFilter,
  type SkippedGlobalFilter,
  type StudioDataView,
  type ModelTable,
  type RunResult,
  type StudioChartSpec,
  type StudioTarget,
  type StudioDraftSummary,
  type StudioModelView as ModelPayload,
} from '@/app/services/studio/studio-api';
import StudioExportMenu from '@/app/shared/studio/StudioExportMenu';
import StudioReportFilters from '@/app/shared/studio/StudioReportFilters';
import { getObservedValues } from '@/app/services/studio/access-profiles';
import StudioReportPages, { MoveToPage } from '@/app/shared/studio/StudioReportPages';
import { readFailure } from '@/app/shared/studio/studio-errors';
import { useAuth } from '@/hooks/useAuth';
import { isAdminRole } from '@/config/constants';
import AtelierRails, { CHART_TYPES } from '@/app/shared/studio/AtelierRails';
import RefineChat from '@/app/shared/studio/onboarding/RefineChat';
import { routes } from '@/config/routes';
import { useTrackEvent } from '@/hooks/useTrackEvent';

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'number') {
    return Number.isInteger(v)
      ? v.toLocaleString()
      : v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  return String(v);
}

/** The KPI headline must be the MEASURE's cell — rows[0][0] can be a leading
 *  dimension (a product id, a date, a channel string), and a string presented
 *  as the figure is an invented number. Resolve the measure's column in the
 *  result; else the first numeric-looking cell; else say "—" honestly. */
function kpiHeadline(
  spec: { measures?: Array<{ column?: string; aggregator?: string }> },
  result: { columns?: string[] | null; rows?: unknown[][] | null } | undefined,
): { value: unknown; ok: boolean } {
  const row = result?.rows?.[0];
  if (!row || row.length === 0) return { value: null, ok: true };
  const cols = (result?.columns ?? []).map((c) => String(c).toUpperCase());
  const m = spec.measures?.[0];
  if (m?.column) {
    const col = String(m.column).toUpperCase();
    const agg = String(m.aggregator ?? '').toUpperCase();
    const exact = [
      agg && `${col}_${agg}`,
      agg && `${agg}_${col}`,
      agg && `${agg}(${col})`,
      col,
    ].filter(Boolean) as string[];
    for (const w of exact) {
      const i = cols.indexOf(w);
      if (i >= 0) return { value: row[i], ok: true };
    }
    const i2 = cols.findIndex((c) => c.includes(col) && (!agg || c.includes(agg)));
    if (i2 >= 0) return { value: row[i2], ok: true };
  }
  const isNumeric = (v: unknown) =>
    typeof v === 'number' ||
    (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v)) && !/^\d{4}-\d{2}-\d{2}/.test(v));
  const iNum = row.findIndex(isNumeric);
  if (iNum >= 0) {
    const v = row[iNum];
    return { value: typeof v === 'string' ? Number(v) : v, ok: true };
  }
  return { value: null, ok: false };
}

/** Business-label the chart feed: the measure alias becomes "{agg} {column}"
 *  in plain words, other columns lose their underscores, and time values
 *  shorten to the spec's grain — the warehouse alias never labels an axis.
 *  On any label collision the raw names stay (never merge two series). */
function chartFeed(
  spec: {
    measures?: Array<{ column?: string; aggregator?: string }>;
    time?: { column?: string; grain?: string } | null;
  },
  result: { columns?: string[] | null; rows?: unknown[][] | null },
): { x: string | null; data: Array<Record<string, unknown>> } {
  const cols = result.columns ?? [];
  const m = spec.measures?.[0];
  const mCol = m?.column ? String(m.column).toUpperCase() : null;
  const mAgg = m?.aggregator ? String(m.aggregator).toUpperCase() : null;
  const toLabel = (c: string): string => {
    const cu = c.toUpperCase();
    if (mCol && cu.includes(mCol) && (!mAgg || cu.includes(mAgg)))
      return `${(m?.aggregator ?? '').toLowerCase()} ${String(m?.column ?? '')
        .replace(/_/g, ' ')
        .toLowerCase()}`.trim();
    return c.replace(/_/g, ' ').toLowerCase();
  };
  let labels = cols.map(toLabel);
  if (new Set(labels).size !== labels.length) labels = cols;
  const grain = String(spec.time?.grain ?? '').toLowerCase();
  const timeCol = spec.time?.column ? String(spec.time.column).toUpperCase() : null;
  const fmtTime = (v: unknown): unknown => {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(v)) return v;
    if (grain.startsWith('year')) return v.slice(0, 4);
    if (grain.startsWith('month')) return v.slice(0, 7);
    return v.slice(0, 10);
  };
  const data = (result.rows ?? []).map((row) =>
    Object.fromEntries(
      cols.map((c, ci) => {
        const isTime = (timeCol && c.toUpperCase() === timeCol) || ci === 0;
        return [labels[ci], isTime ? fmtTime(row[ci]) : row[ci]];
      }),
    ),
  );
  return { x: labels[0] ?? null, data };
}

type Tab =
  | 'overview'
  | 'reporting'
  | 'model'
  | 'sources'
  | 'jobs'
  | 'quality'
  | 'knowledge'
  | 'governance'
  | 'workflows'
  | 'detection';

/** The convergence navigation: five first-level views over ONE application
 *  context — Overview (the brief), Data, Insights, Automation, Access —
 *  with the former tabs as second-level views. Deep URLs keep the OLD
 *  ?view= vocabulary working (every tab id stays addressable). */
const GROUPS: Array<{
  id: string;
  label: string;
  icon: LucideIcon;
  tabs: Array<{ id: Tab; label: string; icon: LucideIcon }>;
}> = [
  { id: 'overview', label: 'Overview', icon: Gauge, tabs: [{ id: 'overview', label: 'Overview', icon: Gauge }] },
  {
    id: 'data',
    label: 'Data',
    icon: Database,
    tabs: [
      { id: 'sources', label: 'Sources', icon: Database },
      { id: 'model', label: 'Model', icon: Network },
      { id: 'quality', label: 'Quality', icon: ShieldCheck },
      { id: 'jobs', label: 'Jobs', icon: WorkflowIcon },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    icon: LayoutDashboard,
    tabs: [
      { id: 'reporting', label: 'Reporting', icon: LayoutDashboard },
      { id: 'knowledge', label: 'Knowledge', icon: BookOpen },
    ],
  },
  {
    id: 'automation',
    label: 'Automation',
    icon: WorkflowIcon,
    tabs: [
      { id: 'workflows', label: 'Workflows', icon: WorkflowIcon },
      { id: 'detection', label: 'Detection & alerts', icon: Bell },
    ],
  },
  {
    id: 'access',
    label: 'Access',
    icon: ShieldCheck,
    tabs: [{ id: 'governance', label: 'Access', icon: ShieldCheck }],
  },
];

const TAB_GROUP: Record<Tab, string> = Object.fromEntries(
  GROUPS.flatMap((g) => g.tabs.map((t) => [t.id, g.id])),
) as Record<Tab, string>;

function fmtCount(n?: number | null): string {
  return n == null ? '—' : n.toLocaleString();
}

/** Honest per-source score — every deduction comes from a signal shown on
 *  the row itself, and the title lists exactly what was deducted. Returns
 *  null while ingestion/lineage have not been read yet ('—' state). */
function sourceScore(t: ModelTable): { score: number; title: string } | null {
  if (t.ingestion == null && t.lineage?.source == null) return null;
  let score = 100;
  const cuts: string[] = [];
  const days = t.ingestion?.days_since_last_load;
  if (days != null && days > 7) {
    score -= 30;
    cuts.push('stale load (−30)');
  } else if (days == null) {
    score -= 10;
    cuts.push('load age unknown (−10)');
  }
  const risk = t.lineage?.risk_level?.toUpperCase();
  if (risk === 'HIGH') {
    score -= 20;
    cuts.push('high lineage risk (−20)');
  } else if (risk === 'MEDIUM') {
    score -= 10;
    cuts.push('medium lineage risk (−10)');
  }
  const g = t.grain;
  const hasTime =
    (typeof g === 'object' && g != null && !!g.time_field) ||
    (typeof g === 'string' && g.includes('dated by'));
  if (!hasTime) {
    score -= 10;
    cuts.push('no time field (−10)');
  }
  if (t.row_count_approx == null) {
    score -= 10;
    cuts.push('row count unknown (−10)');
  }
  score = Math.max(0, score);
  return {
    score,
    title: `Score ${score}/100${cuts.length ? ` — ${cuts.join(', ')}` : ' — no deductions'}`,
  };
}

function scorePillClass(s: number): string {
  return s >= 80
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
    : s >= 50
      ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
      : 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300';
}

/** Data & jobs state chip — the four backend states, said in their tone. */
function dataStateClass(state?: string): string {
  return state === 'verified'
    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
    : state === 'running'
      ? 'bg-accent-50 text-accent-700 dark:bg-accent-900/30 dark:text-accent-300'
      : state === 'loaded'
        ? 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300'
        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400';
}

/**
 * What one piece of remembered knowledge SAYS, in words.
 *
 * A stored value is a structure; a reader must never be shown the
 * structure. Strings pass through, lists are joined, and an object is
 * flattened to its meaningful entries — empty ones dropped rather than
 * printed as null. JSON is never the visible label; when nothing readable
 * can be built the row says so instead of dumping the payload.
 */
function enrichmentPreview(value: unknown): string {
  const flatten = (v: unknown, depth = 0): string => {
    if (v == null || v === '') return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (Array.isArray(v)) {
      return v
        .map((x) => flatten(x, depth + 1))
        .filter(Boolean)
        .join(' · ');
    }
    if (typeof v === 'object' && depth < 3) {
      return Object.entries(v as Record<string, unknown>)
        .map(([k, x]) => {
          const inner = flatten(x, depth + 1);
          if (!inner) return '';
          // a single meaningful list needs no key in front of it
          return Array.isArray(x) || typeof x === 'string'
            ? inner
            : `${k.replace(/_/g, ' ')}: ${inner}`;
        })
        .filter(Boolean)
        .join(' · ');
    }
    return '';
  };
  const text = flatten(value).trim();
  return text || 'nothing recorded for this entry';
}

/** A scope key is often a full object path — show the object, keep the
 *  path in the tooltip. */
function scopeLabel(scopeKey?: string | null): string {
  if (!scopeKey) return 'this application';
  const parts = String(scopeKey).split('.');
  return parts.length > 1 ? parts.slice(-2).join('.') : String(scopeKey);
}

function EnrichmentRow({
  e,
  deciding,
  onDecide,
}: {
  e: AiEnrichment;
  deciding?: string | null;
  onDecide?: (id: string, status: 'confirmed' | 'rejected') => void;
}) {
  const status = e.status ?? '—';
  return (
    <li className="flex items-center gap-2 py-1.5 text-[13px]">
      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
        {(e.kind ?? 'note').replace(/_/g, ' ')}
      </span>
      <span
        className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300"
        title={`${e.scope_key ?? ''}\n${enrichmentPreview(e.value)}`}
      >
        <span className="font-medium text-slate-700 dark:text-slate-200">
          {scopeLabel(e.scope_key)}
        </span>
        {' · '}
        {enrichmentPreview(e.value)}
      </span>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${
          status === 'proposed'
            ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
            : status === 'confirmed'
              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
        }`}
      >
        {status}
      </span>
      {onDecide && e.status === 'proposed' && (
        <>
          <button
            type="button"
            disabled={deciding === e.enrichment_id}
            onClick={() => onDecide(e.enrichment_id, 'confirmed')}
            className="shrink-0 rounded-md bg-accent-600 px-2 py-1 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            Confirm
          </button>
          <button
            type="button"
            disabled={deciding === e.enrichment_id}
            onClick={() => onDecide(e.enrichment_id, 'rejected')}
            className="shrink-0 rounded-md border border-slate-200 px-2 py-1 text-[13px] text-slate-600 hover:border-slate-300 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
          >
            Reject
          </button>
        </>
      )}
    </li>
  );
}

type TileState =
  | { status: 'running' }
  | { status: 'done'; result: RunResult }
  /** `error` is ALWAYS a sentence — the batch route declares a string and
   *  sends an object, and rendering that object blanked the application. */
  | { status: 'error'; error: string; budget?: boolean; raw?: string }
  /** The batch ran out of its time budget before reaching this tile. It is
   *  neither a success nor a failure: nothing was asked of the warehouse,
   *  so saying "failed" would be a lie and showing an empty box would be
   *  indistinguishable from a broken widget. */
  | { status: 'not_run'; reason: string; retry?: string };

/** One failing widget must never take the page down with it, and a spent
 *  budget must not read as a broken feature. */
function tileFailure(err: unknown): TileState {
  const f = readFailure(err);
  return { status: 'error', error: f.text, budget: f.budget, raw: f.raw };
}

/** The light model serves report entries as ID STRINGS; only the full
 *  (include_ops) read carries runnable specs — keep the objects only. */
function fullSpecs(arr?: Array<StudioChartSpec | string> | null): StudioChartSpec[] {
  return (arr ?? []).filter(
    (x): x is StudioChartSpec => typeof x === 'object' && x != null && 'chart_id' in x,
  );
}

/** ?view= vocabulary of /studio/apps/[id] → internal tabs.
 *  The widget export moved to StudioExportMenu: serialising the rendered
 *  rows was only ONE of the three scopes the product actually has, and
 *  shipping it unlabelled passed a preview-capped extract off as the
 *  answer. */
const VIEW_TO_TAB: Record<string, Tab> = {
  overview: 'overview',
  reporting: 'reporting',
  model: 'model',
  data: 'sources',
  sources: 'sources',
  workflows: 'workflows',
  automation: 'workflows',
  detection: 'detection',
  alerts: 'detection',
  jobs: 'jobs',
  quality: 'quality',
  access: 'governance',
  knowledge: 'knowledge',
  insights: 'reporting',
};

/**
 * AdvancedGovernance — the role-conditional layer (per-grant-type row rules,
 * masking exemptions, RLS candidate discovery, plan simulation and
 * read-as-principal tests) kept as a SECONDARY surface behind the profile
 * spine. It is the same engine (same access role, same apply/undo history),
 * a different axis — so it stays reachable but does not superpose its long
 * lists on the profiles by default, and it mounts (and fetches) only when
 * opened.
 */
function AdvancedGovernance({ draftId }: { draftId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:hover:bg-slate-800/50"
      >
        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">Advanced governance</span>
        <span className="min-w-0 truncate text-xs text-slate-400 dark:text-slate-500">
          role-conditional row rules, masking exemptions, plan simulation &amp; read-tests
        </span>
        <span className="ml-auto shrink-0 text-xs text-slate-400 dark:text-slate-500">{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 p-4 dark:border-slate-800">
          <StudioAccessPanel draftId={draftId} />
        </div>
      )}
    </section>
  );
}

export default function StudioWorkspace({ appId }: { appId?: string }) {
  const params = useSearchParams();
  const router = useRouter();
  const { trackTabSwitch } = useTrackEvent();

  const [drafts, setDrafts] = useState<StudioDraftSummary[]>([]);
  const [draftId, setDraftId] = useState<string | null>(appId ?? params.get('draft'));
  const [tab, setTabState] = useState<Tab>(() => {
    // setTab writes the RAW tab id to ?view= (e.g. 'governance'), so the reader
    // must accept a raw tab id too — not only the alias vocabulary. Without
    // this, a refresh or deep-link of ?view=governance fell back to Overview
    // (VIEW_TO_TAB only mapped the 'access' alias), silently losing the tab.
    const v = params.get('view') ?? '';
    return VIEW_TO_TAB[v] ?? (v in TAB_GROUP ? (v as Tab) : 'overview');
  });
  /** every tab change stays deep-linkable (?view=) — replaceState, no nav */
  const setTab = useCallback(
    (t: Tab) => {
      setTabState(t);
      trackTabSwitch(`app_${t}`);
      try {
        const p = new URLSearchParams(window.location.search);
        p.set('view', t);
        window.history.replaceState(null, '', `${window.location.pathname}?${p.toString()}`);
      } catch {
        /* SSR/storage quirks — the tab still switches */
      }
    },
    [trackTabSwitch],
  );
  /** an « awaiting activation » link ANYWHERE lands on the one panel */
  const [activationSignal, setActivationSignal] = useState(0);
  const openActivation = useCallback(() => {
    setTab('overview');
    setActivationSignal((n) => n + 1);
  }, [setTab]);
  const [model, setModel] = useState<ModelPayload | null>(null);
  /* per-application cost — fetched ONCE here, shared by the header badge and
     the Overview cost card so the two never drift. Cost is an admin surface
     (same rule as the account-level chip), so only admins fetch it. */
  const { role } = useAuth();
  const costVisible = isAdminRole(role);
  const [appCost, setAppCost] = useState<AppCost | null>(null);
  useEffect(() => {
    if (!draftId || !costVisible) {
      setAppCost(null);
      return;
    }
    let alive = true;
    setAppCost(null);
    void getAppCost(draftId)
      .then((c) => alive && setAppCost(c))
      .catch(() => undefined); // enrichment only — never blocks the page
    return () => {
      alive = false;
    };
  }, [draftId, costVisible]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tiles, setTiles] = useState<Record<string, TileState>>({});
  const [dq, setDq] = useState<DqGateResult | 'running' | null>(null);
  const [activation, setActivation] = useState<Record<string, unknown> | null>(null);
  const [issues, setIssues] = useState<ConsistencyIssue[] | null>(null);
  /** target tables of this application — the composer builds on the model */
  const [targetsForComposer, setTargetsForComposer] = useState<StudioTarget[]>([]);
  const [version, setVersion] = useState<{ version_number?: number; is_draft?: boolean } | null>(null);
  const [publishState, setPublishState] = useState<'idle' | 'working' | 'error'>('idle');
  const [publishError, setPublishError] = useState<string | null>(null);
  /* self-service tile edits: viz switch + resize + add-a-widget composer */
  const [tileEditBusy, setTileEditBusy] = useState<string | null>(null);
  const [tileEditError, setTileEditError] = useState<{ chartId: string; message: string } | null>(null);
  /* remove is two clicks, inline — the first arms, the second deletes */
  const [removeArmed, setRemoveArmed] = useState<string | null>(null);
  /* DQ drill: which table's checks are expanded */
  const [dqOpenTable, setDqOpenTable] = useState<string | null>(null);
  /* the rich source sheet, opened in place under the grid, one at a time */
  const [sourceSheetFor, setSourceSheetFor] = useState<string | null>(null);
  /* a failing check can hand its fix to the reporting chat, prefilled */
  const [chatPrefill, setChatPrefill] = useState<string | null>(null);
  /* clicking a tile focuses ITS editor in the rail */
  const [focusWidget, setFocusWidget] = useState<string | null>(null);
  /** the report right-panel (widgets rails) can be hidden for a full-width
   *  canvas, and the report link copied to share it. */
  const [reportPanelOpen, setReportPanelOpen] = useState(true);
  const [reportShared, setReportShared] = useState(false);
  /* a quality anomaly hands its fix to the responsible job */
  const [jobsFocus, setJobsFocus] = useState<string | null>(null);
  // a job's Target cell opens the model with that node selected ('t:<id>')
  const [modelFocus, setModelFocus] = useState<string | null>(null);
  /* the model canvas selection — opens the editable table detail */
  const [composer, setComposer] = useState<{
    open: boolean;
    /** the MODEL table the widget reads — its own data, not another widget */
    tableFqn: string;
    measureCol: string;
    agg: string;
    dimCol: string;
    viz: ChartViz;
    title: string;
    working: boolean;
    error: string | null;
  }>({
    open: false,
    tableFqn: '',
    measureCol: '',
    agg: 'SUM',
    dimCol: '',
    viz: 'bar',
    title: '',
    working: false,
    error: null,
  });
  /* sources tab: per-table ops read lazily on first open (≤3 in flight) */
  const [opsInFlight, setOpsInFlight] = useState<Set<string>>(new Set());
  const opsSweepRef = useRef<string | null>(null); // draft already swept
  const loadedIdRef = useRef<string | null>(null); // app already on screen
  /* Page filters. The ref is what runTiles reads: keeping the value out of
   * the callback's deps means applying a filter never re-creates `load`
   * (which would re-run the whole application read). */
  const [globalFilters, setGlobalFilters] = useState<GlobalFilter[]>([]);
  const filtersRef = useRef<GlobalFilter[]>([]);
  /* Which dataset-bound page filters the backend did NOT apply to which widgets
   * (per-widget meta.skipped_global_filters). Kept per chart_id and merged like
   * `tiles`, so a single-widget re-run updates only its own entry — surfaced so
   * a filter that scopes to its dataset is honest, not a silent partial apply. */
  const [skippedByChart, setSkippedByChart] = useState<Record<string, SkippedGlobalFilter[]>>({});
  /* The dashboard page being read. A report with no `pages` is one page,
   * so this stays null and every widget shows — existing applications are
   * untouched by the multi-page contract. */
  const [pageId, setPageId] = useState<string | null>(null);
  /* data & jobs: the read-only truth contract, loaded on first tab open */
  const [dataView, setDataView] = useState<StudioDataView | 'loading' | 'error' | null>(null);
  /* knowledge tab: enrichment registry, loaded on first open */
  const [appEnrich, setAppEnrich] = useState<AiEnrichment[] | 'loading' | 'error' | null>(null);
  const [acctEnrich, setAcctEnrich] = useState<AiEnrichment[] | 'loading' | 'error' | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);

  useEffect(() => {
    void listDrafts()
      .then((all) => {
        setDrafts(all);
        setDraftId((prev) => prev ?? all[0]?.draft_id ?? null);
      })
      .catch(() => setDrafts([]));
  }, []);

  const runTiles = useCallback(async (specs: StudioChartSpec[], forDraft?: string) => {
    const queue = specs.filter((s) => s.status !== 'unavailable');
    if (queue.length === 0) return;
    // MERGE — running one widget must never wipe the others into a
    // permanent skeleton (they would show an empty box for ever).
    setTiles((prev) => ({
      ...prev,
      ...Object.fromEntries(queue.map((s) => [s.chart_id, { status: 'running' as const }])),
    }));
    try {
      // ONE call for the whole report — errors stay isolated per tile.
      // The page filters travel with it: a filter the reader set but that
      // never reached the query would make every figure a quiet lie.
      const batch = await runChartBatch(queue, {
        draftId: forDraft,
        globalFilters: filtersRef.current,
      });
      if (batch.version) setVersion(batch.version);
      // record which global filters were skipped per widget (honest partial
      // apply). A tile with no skipped list applied every filter → clear it.
      setSkippedByChart((prev) => {
        const next = { ...prev };
        for (const r of batch.results ?? []) {
          if (!r.chart_id) continue;
          const sk = r.meta?.skipped_global_filters;
          if (Array.isArray(sk) && sk.length) next[r.chart_id] = sk;
          else delete next[r.chart_id];
        }
        return next;
      });
      for (const r of batch.results ?? []) {
        if (!r.chart_id) continue;
        setTiles((prev) => ({
          ...prev,
          [r.chart_id!]:
            r.status === 'not_run'
              ? {
                  status: 'not_run',
                  reason:
                    (r as { reason?: string }).reason ??
                    'the batch ran out of time before this widget was asked for',
                  retry: (r as { retry?: string }).retry,
                }
              : r.status === 'error'
                ? tileFailure(r.error)
                : { status: 'done', result: r as RunResult },
        }));
      }
    } catch (e) {
      const failed = tileFailure(
        (e as { response?: { data?: unknown } })?.response?.data ??
          (e instanceof Error ? e.message : e),
      );
      setTiles(Object.fromEntries(queue.map((s) => [s.chart_id, failed])));
    }
  }, []);

  /* Applying a page filter re-asks the question for every widget at once —
   * a report where half the tiles carry the filter and half do not would be
   * unreadable, and worse, would look consistent. */
  const applyFilters = useCallback(
    (next: GlobalFilter[], specs: StudioChartSpec[]) => {
      filtersRef.current = next;
      setGlobalFilters(next);
      if (loadedIdRef.current) void runTiles(specs, loadedIdRef.current);
    },
    [runTiles],
  );

  const load = useCallback(
    async (id: string) => {
      // A REFRESH of the application already on screen never blanks it —
      // blanking unmounts the whole tab subtree, and any panel state with
      // it (an open job editor, a selected table). Only a different
      // application resets the surface.
      const sameApp = loadedIdRef.current === id;
      loadedIdRef.current = id;
      if (!sameApp) {
        setModel(null);
        setDq(null);
        setDataView(null);
        setAppEnrich(null);
      }
      setLoadError(null);
      setOpsInFlight(new Set());
      opsSweepRef.current = null; // fresh model ⇒ ops are missing again
      try {
        // Two-stage: the light model answers in ~2 s (graph + shell; its
        // report carries only ids), then the FULL specs come from the light
        // include=report read (no ops recompute) and run as ONE batch.
        const m = await getModel(id, false);
        setModel(m);
        void getDraftReport(id)
          .then((report) => {
            if (!report) return;
            setModel((prev) => (prev ? { ...prev, report } : prev));
            void runTiles(
              fullSpecs(report.kpis)
                .concat(fullSpecs(report.charts))
                .concat(report.detail ? [report.detail] : []),
              id,
            );
          })
          .catch(() => undefined); // the light model stays useful
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : 'The application could not be read.');
      }
      void getTargetsView(id)
        .then((v) => setTargetsForComposer(v.targets))
        .catch(() => setTargetsForComposer([]));
      void getActivation(id).then(setActivation);
      setIssues(null);
      void getConsistency(id).then((c) => setIssues(c.issues));
    },
    [runTiles],
  );

  useEffect(() => {
    if (draftId) void load(draftId);
  }, [draftId, load]);

  /* sources tab: the data & jobs truth contract loads on first open —
   * one silent retry first: the cold read right after a backend restart
   * fails transiently while the cache rebuilds. */
  useEffect(() => {
    // sources now render the pinned ObjectsPanel (its own persisted read) —
    // the heavy data view is only for the model tab's per-source states
    if (tab !== 'model' || !draftId || dataView !== null) return;
    setDataView('loading');
    void getDraftData(draftId)
      .then(setDataView)
      .catch(
        () =>
          new Promise((r) => setTimeout(r, 4000)).then(() =>
            getDraftData(draftId).then(setDataView).catch(() => setDataView('error')),
          ),
      );
  }, [tab, draftId, dataView]);

  /* sources tab: on first open, read ingestion+lineage for tables missing
   * them — at most 3 requests in flight, results folded into the model
   * (same fold as StudioModelView's per-click ops effect). */
  useEffect(() => {
    if (tab !== 'sources' || !draftId || !model) return;
    if (opsSweepRef.current === draftId) return;
    opsSweepRef.current = draftId;
    const id = draftId;
    const queue = (model.tables ?? []).filter(
      (t) => t.ingestion == null && t.lineage?.source == null,
    );
    if (queue.length === 0) return;
    setOpsInFlight(new Set(queue.map((t) => t.fqn)));
    const worker = async () => {
      for (let t = queue.shift(); t; t = queue.shift()) {
        const table = t;
        const ops = await getModelTableOps(id, table.fqn);
        if (opsSweepRef.current !== id) return; // draft changed or reloaded
        setOpsInFlight((prev) => {
          const next = new Set(prev);
          next.delete(table.fqn);
          return next;
        });
        if (!ops) continue;
        setModel((prev) =>
          prev
            ? {
                ...prev,
                tables: prev.tables?.map((x) =>
                  x.entity_id === table.entity_id
                    ? { ...x, ingestion: ops.ingestion ?? x.ingestion, lineage: ops.lineage ?? x.lineage }
                    : x,
                ),
              }
            : prev,
        );
      }
    };
    void Promise.all(Array.from({ length: Math.min(3, queue.length) }, () => worker()));
  }, [tab, draftId, model]);

  /* knowledge tab: both registries load on first open */
  useEffect(() => {
    if (tab !== 'knowledge' || !draftId || appEnrich !== null) return;
    setAppEnrich('loading');
    void listEnrichments({ draftId })
      .then(setAppEnrich)
      .catch(() => setAppEnrich('error'));
  }, [tab, draftId, appEnrich]);

  useEffect(() => {
    if (tab !== 'knowledge' || acctEnrich !== null) return;
    setAcctEnrich('loading');
    void listEnrichments({ status: 'confirmed' })
      .then((items) => setAcctEnrich(items.slice(0, 20)))
      .catch(() => setAcctEnrich('error'));
  }, [tab, acctEnrich]);

  const decide = useCallback(async (id: string, status: 'confirmed' | 'rejected') => {
    setDeciding(id);
    try {
      await decideEnrichment(id, status);
      setAppEnrich((prev) =>
        Array.isArray(prev)
          ? prev.map((e) => (e.enrichment_id === id ? { ...e, status } : e))
          : prev,
      );
    } catch {
      // decision not recorded — the row stays proposed, retry is possible
    } finally {
      setDeciding(null);
    }
  }, []);

  /** Which knowledge family is unfolded — one at a time. */
  const [openKnowledge, setOpenKnowledge] = useState<string | null>(null);

  /** Confirm one family's pending entries in a single call. */
  const confirmGroup = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    setDeciding('bulk');
    try {
      await decideEnrichmentsMany({ status: 'confirmed', enrichment_ids: ids });
      setAppEnrich((prev) =>
        Array.isArray(prev)
          ? prev.map((e) => (ids.includes(e.enrichment_id) ? { ...e, status: 'confirmed' } : e))
          : prev,
      );
    } catch {
      // nothing recorded — the rows stay proposed and can be retried
    } finally {
      setDeciding(null);
    }
  }, []);

  /** Confirm every entry still awaiting a decision, in ONE call — the
   *  per-row buttons stay for a targeted decision. */
  const confirmAllPending = useCallback(async () => {
    if (!Array.isArray(appEnrich)) return;
    const ids = appEnrich.filter((e) => e.status === 'proposed').map((e) => e.enrichment_id);
    if (ids.length === 0) return;
    setDeciding('bulk');
    try {
      await decideEnrichmentsMany({ status: 'confirmed', enrichment_ids: ids });
      setAppEnrich((prev) =>
        Array.isArray(prev)
          ? prev.map((e) =>
              ids.includes(e.enrichment_id) ? { ...e, status: 'confirmed' } : e,
            )
          : prev,
      );
    } catch {
      // nothing recorded — the rows stay proposed and can be retried
    } finally {
      setDeciding(null);
    }
  }, [appEnrich]);

  const appGroups = useMemo((): Array<[string, AiEnrichment[]]> => {
    if (!Array.isArray(appEnrich)) return [];
    const by: Record<string, AiEnrichment[]> = {};
    for (const e of appEnrich) {
      const k = e.kind ?? 'other';
      if (!by[k]) by[k] = [];
      by[k].push(e);
    }
    return Object.entries(by);
  }, [appEnrich]);

  const gate = useCallback(async () => {
    if (!draftId || dq === 'running') return;
    setDq('running');
    try {
      setDq(await runDqGate(draftId));
    } catch {
      setDq({ overall: 'error', checks: [] });
    }
  }, [dq, draftId]);

  /** Publish = snapshot the ACTIVE version — consistency shown FIRST, a
   *  blocking drift stops it (409 rendered as-is), nothing silent. */
  const publish = useCallback(async () => {
    if (!draftId || publishState === 'working') return;
    setPublishState('working');
    setPublishError(null);
    try {
      const fresh = await getConsistency(draftId);
      setIssues(fresh.issues);
      if (fresh.issues.some((i) => i.severity === 'blocking')) {
        setPublishState('error');
        setPublishError('Blocking drift — fix the issues listed under Coherence first.');
        return;
      }
      const res = await publishDraft(draftId);
      setVersion({ version_number: res.active_version?.version_number, is_draft: false });
      setPublishState('idle');
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: { consistency?: { issues?: ConsistencyIssue[] } ; message?: string } } } })
        ?.response?.data?.detail;
      if (detail?.consistency?.issues) setIssues(detail.consistency.issues);
      setPublishState('error');
      setPublishError(detail?.message ?? 'Publication was blocked.');
    }
  }, [draftId, publishState]);

  /** Publish depends on the app being ACTIVATION-READY: an application whose
   *  data-quality gate is still blocked (defects not handled) is not ready to
   *  publish. The reason is stated and the click routes to the activation
   *  panel to resolve it — never a silent disable. Null activation = not read
   *  yet, so we do not invent a block. */
  const publishBlockedReason = ((): string | null => {
    const a = activation as
      | { blockers?: unknown[]; tests?: { dq_gate?: { overall?: string; blockers?: unknown[] } } }
      | null;
    if (!a) return null;
    if (a.tests?.dq_gate?.overall === 'blocked') {
      return 'the data-quality gate is blocked';
    }
    const bl = Array.isArray(a.blockers) ? a.blockers : a.tests?.dq_gate?.blockers;
    if (Array.isArray(bl) && bl.length > 0) return `${bl.length} blocker(s) before activation`;
    return null;
  })();

  /* model graph (same mapping as /studio/model) */

  const report = model?.report ?? null;

  /* Invert the per-widget skipped lists into a per-FILTER summary: which
   * dataset-bound page filters did not reach some widgets, and which. So a
   * filter that only applies to its own dataset says so, instead of leaving
   * half the report silently unfiltered. */
  const skippedSummary = useMemo(() => {
    if (!report) return [] as Array<{ column?: string; fqn?: string; charts: string[] }>;
    const titleById = new Map<string, string>();
    const collect = (specs?: Array<{ chart_id?: string; title?: string }> | null) => {
      for (const s of specs ?? []) if (s.chart_id) titleById.set(s.chart_id, s.title || s.chart_id);
    };
    collect(report.kpis);
    collect(report.charts);
    if (report.detail) collect([report.detail]);
    const byFilter = new Map<string, { column?: string; fqn?: string; charts: Set<string> }>();
    for (const [chartId, skips] of Object.entries(skippedByChart)) {
      for (const s of skips) {
        const key = s.filter_id ?? `${s.column ?? ''}|${s.fqn ?? ''}`;
        const cur = byFilter.get(key) ?? { column: s.column, fqn: s.fqn, charts: new Set<string>() };
        cur.charts.add(titleById.get(chartId) ?? chartId);
        byFilter.set(key, cur);
      }
    }
    return [...byFilter.values()].map((v) => ({ column: v.column, fqn: v.fqn, charts: [...v.charts] }));
  }, [report, skippedByChart]);

  /* ── Filter values from the real data ───────────────────────────────
   * A report filter is declared as { filter_id, column, type } with no
   * table, but the distinct-values endpoint needs an fqn. Resolve it from
   * the widgets: a chart that GROUPS BY (dimension/time) a column proves
   * that column belongs to ITS dataset, so it names the table the values
   * live in. Group-by columns win over measures/selection, so a shared
   * dimension resolves to the table that groups by it — not a fact that
   * merely reads it. A column no widget references stays unresolved and
   * the picker honestly falls back to free typing. */
  const filterFqn = useMemo(() => {
    const map = new Map<string, string>();
    const specs = fullSpecs(report?.kpis)
      .concat(fullSpecs(report?.charts))
      .concat(report?.detail ? [report.detail] : []);
    const fqnOf = (c: StudioChartSpec): string | null => {
      const d = c.dataset;
      return d?.database && d?.schema && d?.table ? `${d.database}.${d.schema}.${d.table}` : null;
    };
    // pass 1 — the true group-by columns (dimensions + time)
    for (const c of specs) {
      const fqn = fqnOf(c);
      if (!fqn) continue;
      for (const dim of c.dimensions ?? []) {
        const col = typeof dim === 'string' ? dim : dim?.column;
        if (col && !map.has(col)) map.set(col, fqn);
      }
      if (c.time?.column && !map.has(c.time.column)) map.set(c.time.column, fqn);
    }
    // pass 2 — measures / explicit columns / a widget's own filters
    for (const c of specs) {
      const fqn = fqnOf(c);
      if (!fqn) continue;
      for (const m of c.measures ?? []) if (m.column && !map.has(m.column)) map.set(m.column, fqn);
      for (const col of c.columns ?? []) if (col && !map.has(col)) map.set(col, fqn);
      for (const f of c.filters ?? []) if (f.column && !map.has(f.column)) map.set(f.column, fqn);
    }
    return map;
  }, [report]);

  /* Bounded distinct values for a filter column. Only ever called on the
   * reader's intent (focus / typing), never on mount — each read spends the
   * sample_read envelope. A refusal (envelope used up, column not found)
   * degrades to free typing, never a crash. */
  const filterValuesFor = useCallback(
    async (args: {
      fqn: string;
      column: string;
      q: string;
    }): Promise<Array<{ value: string; count?: number }>> => {
      const id = loadedIdRef.current;
      if (!args.fqn || !id) return [];
      const res = await getObservedValues(id, {
        fqn: args.fqn,
        column: args.column,
        q: args.q.trim() ? args.q.trim() : undefined,
        limit: 25,
      });
      if (!res.ok) return [];
      return res.value.values
        .map((val) => ({ value: String(val.value ?? ''), count: val.count }))
        .filter((val) => val.value !== '');
    },
    [],
  );

  /* ── The dashboard's pages ──────────────────────────────────────────
   * `page_id` lives on the LAYOUT entry, never on the widget spec, so
   * moving a chart between pages is a placement change and its definition
   * is left alone. A report with no pages reads as a single page. */
  const pages = useMemo(() => report?.pages ?? [], [report]);
  const pageOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of report?.layout ?? []) if (l?.chart_id && l.page_id) m.set(l.chart_id, l.page_id);
    return m;
  }, [report]);
  const activePage = pageId ?? pages[0]?.page_id ?? null;
  /* A widget with no placement is shown on the FIRST page rather than
   * hidden: an unplaced widget that renders nowhere is indistinguishable
   * from a widget that failed to load. */
  const onActivePage = useCallback(
    (chartId: string): boolean => {
      if (!activePage || pages.length < 2) return true;
      const p = pageOf.get(chartId);
      return p ? p === activePage : activePage === pages[0]?.page_id;
    },
    [activePage, pageOf, pages],
  );
  const pageCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of pages) c[p.page_id] = 0;
    /* the detail table counts too — it is a widget the reader sees, and
     * the generator places it on its own page, so leaving it out made
     * that page read "0" while plainly showing a table */
    const all = fullSpecs(report?.kpis)
      .concat(fullSpecs(report?.charts))
      .concat(report?.detail ? [report.detail] : []);
    for (const s of all) {
      const p = pageOf.get(s.chart_id) ?? pages[0]?.page_id;
      if (p) c[p] = (c[p] ?? 0) + 1;
    }
    return c;
  }, [pages, pageOf, report]);

  const [pageBusy, setPageBusy] = useState(false);
  const [pageError, setPageError] = useState<string | null>(null);
  const patchPages = useCallback(
    async (ops: Array<Record<string, unknown>>, intent: string) => {
      if (!draftId) return;
      setPageBusy(true);
      setPageError(null);
      try {
        await patchModel(draftId, ops as never, true, intent);
        await load(draftId);
      } catch (e) {
        // the server refuses a page that still carries widgets, and names
        // them — that refusal is the product's answer, so it is shown
        setPageError(
          readFailure(
            (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail ?? e,
          ).text,
        );
      } finally {
        setPageBusy(false);
      }
    },
    [draftId, load],
  );

  /** Columns the model demonstrably knows — datalist for the rail editor. */
  /** The tables a widget can be built on: the application's own model —
   *  its target tables first (what published reporting should read), then
   *  the understood sources. Columns come from the model, so the picker
   *  can only offer names that exist. */
  const composerTables = useMemo(
    (): Array<{
      fqn: string;
      name: string;
      origin: string;
      columns: Array<{ name: string; type?: string }>;
    }> => {
      const out: Array<{
        fqn: string;
        name: string;
        origin: string;
        columns: Array<{ name: string; type?: string }>;
      }> = [];
      for (const t of targetsForComposer)
        if (t.target_fqn)
          out.push({
            fqn: t.target_fqn,
            name: t.name,
            origin: 'application model',
            columns: (t.columns ?? []).map((c) => ({ name: c.name, type: c.type })),
          });
      for (const t of model?.tables ?? []) {
        if (out.some((x) => x.fqn.toUpperCase() === t.fqn.toUpperCase())) continue;
        const cols = Array.isArray((t as { columns?: Array<{ name: string; type?: string }> }).columns)
          ? ((t as { columns?: Array<{ name: string; type?: string }> }).columns ?? [])
          : [];
        out.push({ fqn: t.fqn, name: t.name, origin: 'source', columns: cols });
      }
      return out;
    },
    [targetsForComposer, model],
  );

  const knownColumns = useMemo((): string[] => {
    const cols = new Set<string>();
    for (const t of model?.tables ?? []) {
      const g = t.grain && typeof t.grain === 'object' ? (t.grain as { key?: string[]; time_field?: string }) : null;
      for (const k of g?.key ?? []) cols.add(k);
      if (g?.time_field) cols.add(g.time_field);
      const ec = (t.event_contract ?? {}) as { dedup_key?: string[]; watermark?: string | null };
      for (const k of ec.dedup_key ?? []) cols.add(k);
      if (ec.watermark) cols.add(ec.watermark);
    }
    for (const s of [...fullSpecs(report?.kpis), ...fullSpecs(report?.charts)]) {
      for (const m of s.measures ?? []) if (m.column) cols.add(m.column);
      for (const d of s.dimensions ?? []) cols.add(typeof d === 'string' ? d : d.column);
      if (s.time?.column) cols.add(s.time.column);
      for (const f of s.filters ?? []) if (f.column) cols.add(f.column);
    }
    return [...cols].sort();
  }, [model, report]);

  /* ── self-service reporting edits (viz / size / add) ─────────────────
   * All three persist through the SAME allowlisted patch contract the
   * rails and the NL chat use — a chip click is explicit intent, so ops
   * apply directly (the backend still validates; a refusal renders). */

  /* Server messages are written for whoever calls the API. The reader is
   * not that person: they were being told to "run POST /studio/understand
   * first (inline `understanding` or a draft holding one)" — a route they
   * cannot call, about a payload they never see. readFailure() turns it
   * into the next step THEY can take. */
  const patchErrText = (e: unknown): string =>
    readFailure(
      (e as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail ??
        (e instanceof Error ? e.message : e),
    ).text;

  const chartPatchIndex = useCallback(
    (chartId: string): number =>
      (report?.charts ?? []).findIndex(
        (x) => typeof x === 'object' && x != null && (x as StudioChartSpec).chart_id === chartId,
      ),
    [report],
  );

  /** [{chart_id, w, h, order, page_id}] — the backend's report layout.
   *  Since the multi-page contract this row also says WHICH page a widget
   *  sits on, which is why it is typed once in the service rather than
   *  cast inline here. */
  const layoutEntries = useMemo(
    () => (Array.isArray(report?.layout) ? report!.layout : []),
    [report],
  );
  const layoutW = useCallback(
    (chartId: string): number =>
      layoutEntries.find((l) => l.chart_id === chartId)?.w ?? 12,
    [layoutEntries],
  );

  const setChartViz = useCallback(
    async (chartId: string, viz: ChartViz) => {
      if (!draftId || tileEditBusy) return;
      const idx = chartPatchIndex(chartId);
      if (idx < 0) return;
      setTileEditBusy(chartId);
      setTileEditError(null);
      try {
        await patchModel(
          draftId,
          [{ op: 'set', path: `/report/charts/${idx}/chart_type`, value: viz }],
          true,
          `viz → ${viz}`,
        );
        setModel((prev) =>
          prev?.report
            ? {
                ...prev,
                report: {
                  ...prev.report,
                  charts: prev.report.charts?.map((x) =>
                    typeof x === 'object' && x != null && (x as StudioChartSpec).chart_id === chartId
                      ? { ...(x as StudioChartSpec), chart_type: viz }
                      : x,
                  ),
                },
              }
            : prev,
        );
        setVersion((v) => (v ? { ...v, is_draft: true } : v));
      } catch (e) {
        setTileEditError({ chartId, message: patchErrText(e) });
      } finally {
        setTileEditBusy(null);
      }
    },
    [chartPatchIndex, draftId, tileEditBusy],
  );

  const toggleChartSize = useCallback(
    async (chartId: string) => {
      if (!draftId || tileEditBusy) return;
      setTileEditBusy(chartId);
      setTileEditError(null);
      const nextW = layoutW(chartId) >= 24 ? 12 : 24;
      const has = layoutEntries.some((l) => l.chart_id === chartId);
      const nextLayout = has
        ? layoutEntries.map((l) => (l.chart_id === chartId ? { ...l, w: nextW } : l))
        : [
            ...layoutEntries,
            { chart_id: chartId, w: nextW, h: 6, order: layoutEntries.length },
          ];
      try {
        await patchModel(
          draftId,
          [{ op: 'set', path: '/report/layout', value: nextLayout }],
          true,
          `size → ${nextW >= 24 ? 'full width' : 'half width'}`,
        );
        setModel((prev) =>
          prev?.report ? { ...prev, report: { ...prev.report, layout: nextLayout } } : prev,
        );
        setVersion((v) => (v ? { ...v, is_draft: true } : v));
      } catch (e) {
        setTileEditError({ chartId, message: patchErrText(e) });
      } finally {
        setTileEditBusy(null);
      }
    },
    [draftId, layoutEntries, layoutW, tileEditBusy],
  );

  const removeChart = useCallback(
    async (chartId: string, kind: 'charts' | 'kpis' = 'charts') => {
      if (!draftId || tileEditBusy) return;
      const arr = (kind === 'kpis' ? report?.kpis : report?.charts) ?? [];
      const idx = arr.findIndex(
        (x) => typeof x === 'object' && x != null && (x as StudioChartSpec).chart_id === chartId,
      );
      if (idx < 0) return;
      setTileEditBusy(chartId);
      setTileEditError(null);
      try {
        // the backend drops the matching layout entry itself
        await patchModel(draftId, [{ op: 'remove', path: `/report/${kind}/${idx}` }], true, 'remove widget');
        setModel((prev) =>
          prev?.report
            ? {
                ...prev,
                report: {
                  ...prev.report,
                  charts: prev.report.charts?.filter(
                    (x) =>
                      !(typeof x === 'object' && x != null && (x as StudioChartSpec).chart_id === chartId),
                  ),
                  layout: Array.isArray(prev.report.layout)
                    ? (prev.report.layout as Array<{ chart_id?: string }>).filter(
                        (l) => l.chart_id !== chartId,
                      )
                    : prev.report.layout,
                },
              }
            : prev,
        );
        setVersion((v) => (v ? { ...v, is_draft: true } : v));
      } catch (e) {
        setTileEditError({ chartId, message: patchErrText(e) });
      } finally {
        setTileEditBusy(null);
        setRemoveArmed(null);
      }
    },
    [chartPatchIndex, draftId, tileEditBusy],
  );

  /* an application can exist BEFORE its report (journey stopped early) —
   * the workspace offers the generate action instead of a dead-end */
  const [genState, setGenState] = useState<'idle' | 'working' | 'error'>('idle');
  const [genError, setGenError] = useState<string | null>(null);
  const generateNow = useCallback(async () => {
    if (!draftId || genState === 'working') return;
    setGenState('working');
    setGenError(null);
    try {
      await generateReport({ draft_id: draftId });
      setGenState('idle');
      void load(draftId);
    } catch (e) {
      setGenState('error');
      setGenError(patchErrText(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, genState, load]);

  /** The understand-then-generate chain for an application whose draft
   *  never ran the analysis (the backend refuses generate without it). */
  const runUnderstandingChain = useCallback(async () => {
    if (!draftId || genState === 'working') return;
    const need = String(
      drafts.find((d) => d.draft_id === draftId)?.need ??
        drafts.find((d) => d.draft_id === draftId)?.title ??
        '',
    )
      .replace(/\s*·\s*\d{8}-\d{6}\s*$/, '')
      .trim();
    setGenState('working');
    setGenError(null);
    try {
      await understandDirect({ need: need || 'Describe these sources for a business reader.', draft_id: draftId, use_ai: true });
      await generateReport({ draft_id: draftId });
      setGenState('idle');
      void load(draftId);
    } catch (e) {
      setGenState('error');
      setGenError(patchErrText(e));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, drafts, genState, load]);

  /* delete an application — two explicit clicks, then back to the home */
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const deleteThisApp = useCallback(async () => {
    if (!draftId || deleting) return;
    setDeleting(true);
    try {
      await deleteDraft(draftId);
      router.push(routes.studio);
    } catch (e) {
      setGenError(patchErrText(e));
      setDeleting(false);
      setDeleteArmed(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftId, deleting, router]);

  /** Add = CLONE an existing widget (columns guaranteed valid) with a new
   *  id/type/title — refined afterwards through the rails or the chat. */
  const addWidget = useCallback(async () => {
    if (!draftId || !report || composer.working) return;
    /* A widget is built on a TABLE OF THE MODEL and the columns of that
     * table — not by cloning another widget. A widget on the same table is
     * only used to inherit its proven filters/time when there is one. */
    const table = composerTables.find((t) => t.fqn === composer.tableFqn) ?? composerTables[0];
    if (!table) return;
    const sibling = fullSpecs(report.charts).find(
      (c) =>
        c.dataset &&
        `${c.dataset.database}.${c.dataset.schema}.${c.dataset.table}`.toUpperCase() ===
          table.fqn.toUpperCase(),
    );
    const [database = '', schema = '', tbl = ''] = table.fqn.split('.');
    const spec: StudioChartSpec = {
      chart_id: `chart_custom_${Date.now().toString(36)}`,
      title:
        composer.title.trim() ||
        `${composer.measureCol || 'rows'} by ${composer.dimCol || table.name}`,
      kind: 'chart',
      chart_type: composer.viz,
      dataset: { database, schema, table: tbl },
      measures: composer.measureCol
        ? [{ column: composer.measureCol, aggregator: composer.agg }]
        : [{ column: '*', aggregator: 'COUNT' }],
      dimensions: composer.dimCol ? [composer.dimCol] : [],
      time: sibling?.time ?? null,
      filters: sibling?.filters ?? [],
      sort: null,
      limit: 20,
      presentation: {},
    };
    setComposer((c) => ({ ...c, working: true, error: null }));
    try {
      await patchModel(
        draftId,
        [{ op: 'add', path: '/report/charts/-', value: spec }],
        true,
        `add widget ${spec.title}`,
      );
      setModel((prev) =>
        prev?.report
          ? {
              ...prev,
              report: { ...prev.report, charts: [...(prev.report.charts ?? []), spec] },
            }
          : prev,
      );
      setVersion((v) => (v ? { ...v, is_draft: true } : v));
      setComposer({
        open: false,
        tableFqn: '',
        measureCol: '',
        agg: 'SUM',
        dimCol: '',
        viz: 'bar',
        title: '',
        working: false,
        error: null,
      });
      void runTiles([spec], draftId);
    } catch (e) {
      setComposer((c) => ({ ...c, working: false, error: patchErrText(e) }));
    }
  }, [composer, draftId, report, runTiles]);

  return (
    <div className="flex flex-col gap-3 p-4 md:p-6">
      {/* the header carries the NAME and the state chips only — the long
          AI-written need paragraph moved off it (user directive: standardized
          headers without the AI description); the why/goal lives on Overview. */}
      <PlainQuestionHeader
        question={(() => {
          const d = drafts.find((x) => x.draft_id === draftId);
          return String(d?.display_name ?? model?.title ?? d?.title ?? 'Application workspace');
        })()}
        onRename={async (next) => {
          if (!draftId) return;
          await updateDraft(draftId, { display_name: next });
          setDrafts((prev) =>
            prev?.map((d) => (d.draft_id === draftId ? { ...d, display_name: next } : d)) ?? prev,
          );
        }}
        backHref={routes.studio}
        backLabel="Studio"
        actions={
          <>
            {(() => {
              const u = drafts.find((x) => x.draft_id === draftId)?.updated_at;
              const dt = u ? new Date(u) : null;
              return dt && !Number.isNaN(dt.getTime()) ? (
                <span
                  className="text-xs text-slate-400 dark:text-slate-500"
                  title="Last edit of this application (data freshness is shown on each view)"
                >
                  edited {dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              ) : null;
            })()}
            {draftId && costVisible && appCost && (
              <StudioAppCostBadge cost={appCost} onOpen={() => setTab('overview')} />
            )}
            {(() => {
              /* ONE lifecycle chip — publish/activation stop being two
                 unexplained badges; the click lands on the one panel */
              const lc = deriveLifecycle({ version, activation, issues });
              return (
                <button
                  type="button"
                  onClick={openActivation}
                  title={`${lc.reasons.join(' · ')}${
                    version && !version.is_draft ? ` · version v${version.version_number ?? '?'}` : ''
                  } — opens the activation panel`}
                  className={`rounded-full px-2 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${LIFECYCLE_CLS[lc.state]}`}
                >
                  {LIFECYCLE_WORDS[lc.state]}
                </button>
              );
            })()}
            {draftId && (version?.is_draft ?? true) && (
              <button
                type="button"
                disabled={publishState === 'working' || !!publishBlockedReason}
                onClick={() => {
                  if (publishBlockedReason) {
                    openActivation();
                    return;
                  }
                  void publish();
                }}
                title={
                  publishBlockedReason
                    ? `Not ready to publish — ${publishBlockedReason}. Resolve it in the activation panel first.`
                    : 'Publish snapshots the active version; activation then turns it on.'
                }
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-accent-300 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
              >
                {publishState === 'working' ? 'Publishing…' : 'Publish'}
              </button>
            )}
            {draftId &&
              /* deletion lives HERE, stable whatever the report state —
               * two explicit clicks, scope said in the tooltip */
              (deleteArmed ? (
                <button
                  type="button"
                  disabled={deleting}
                  onClick={() => void deleteThisApp()}
                  className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 dark:text-red-400 dark:hover:bg-red-900/30"
                >
                  {deleting ? 'Deleting…' : 'Delete for good?'}
                </button>
              ) : (
                <button
                  type="button"
                  aria-label="Delete this application"
                  onClick={() => setDeleteArmed(true)}
                  title="Delete this application — its draft, report and process definitions. Asks once more."
                  className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-500 dark:hover:text-red-400"
                >
                  Delete
                </button>
              ))}
            {!appId && drafts.length > 1 && (
              <select
              aria-label="Application"
              value={draftId ?? ''}
              onChange={(e) => setDraftId(e.target.value)}
              className="h-8 max-w-[220px] rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
            >
                {drafts.map((d) => (
                  <option key={d.draft_id} value={d.draft_id}>
                    {d.title || d.draft_id}
                  </option>
                ))}
              </select>
            )}
          </>
        }
      />

      {/* nav rail — two levels over ONE application context: five groups,
          the former tabs as second-level views (deep URLs unchanged) */}
      <div className="space-y-1.5">
        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Workspace views">
          {GROUPS.map((g) => {
            const Icon = g.icon;
            const active = TAB_GROUP[tab] === g.id;
            return (
              <button
                key={g.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setTab(g.tabs[0].id)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                  active
                    ? 'border-accent-500 bg-accent-600 text-white'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                }`}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden />
                {g.label}
              </button>
            );
          })}
        </div>
        {(() => {
          const group = GROUPS.find((g) => g.id === TAB_GROUP[tab]);
          if (!group || group.tabs.length < 2) return null;
          return (
            <div className="flex flex-wrap gap-1.5 pl-1" role="tablist" aria-label={`${group.label} views`}>
              {group.tabs.map((t) => {
                const Icon = t.icon;
                const active = t.id === tab;
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setTab(t.id)}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-0.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                      active
                        ? 'bg-slate-100 font-medium text-slate-900 dark:bg-slate-800 dark:text-slate-100'
                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    <Icon className="h-3 w-3" aria-hidden />
                    {t.label}
                  </button>
                );
              })}
            </div>
          );
        })()}
      </div>

      {loadError ? (
        <EmptyState icon={AlertCircle} title="The application could not be read" description={loadError} />
      ) : !model ? (
        <div className="h-64 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" aria-hidden />
      ) : (
        <>
          {/* ── OVERVIEW — the intelligence brief + the ONE activation ── */}
          {tab === 'overview' && draftId && (
            <StudioOverviewBrief
              draftId={draftId}
              model={model}
              version={version}
              activation={activation}
              issues={issues}
              dq={dq}
              appCost={appCost}
              onGo={(t) => setTab(t)}
              activationSignal={activationSignal}
            />
          )}

          {/* ── AUTOMATION · workflows + the detection registry ────────── */}
          {tab === 'workflows' && draftId && (
            <StudioWorkflowsPanel
              draftId={draftId}
              onOpenActivation={openActivation}
              onOpenAccess={() => setTab('governance')}
            />
          )}
          {tab === 'detection' && draftId && <StudioDetectionsPanel draftId={draftId} />}

          {/* ── REPORTING ─────────────────────────────────────────── */}
          {tab === 'reporting' &&
            (report ? (
              <div className={`grid grid-cols-1 gap-3 ${reportPanelOpen ? 'xl:grid-cols-[1fr,300px]' : ''}`}>
                <div className="min-w-0 space-y-3">
                  {/* the report leads with its own name — the served title was
                      never shown, so the canvas opened on a bare toolbar */}
                  {typeof report.title === 'string' && report.title.trim() !== '' && (
                    <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                      {report.title}
                    </h2>
                  )}
                  {/* report toolbar: share the link, export the detail table,
                      and hide the widgets panel for a full-width canvas */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard
                          ?.writeText(window.location.href)
                          .then(() => {
                            setReportShared(true);
                            window.setTimeout(() => setReportShared(false), 1500);
                          })
                          .catch(() => undefined);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
                    >
                      <Share2 aria-hidden className="h-3.5 w-3.5" />
                      {reportShared ? 'Link copied' : 'Share'}
                    </button>
                    {/* sharing is an ACCESS question — the link only opens for
                        people the Access tab lets in; say it and door it */}
                    <button
                      type="button"
                      onClick={() => setTab('governance')}
                      title="A shared link opens only for people with access — review who that is"
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-300"
                    >
                      Who can open this
                    </button>
                    {report.detail &&
                      (() => {
                        const d = report.detail;
                        const dt = tiles[d.chart_id];
                        return (
                          <StudioExportMenu
                            title="Report — detail table"
                            spec={d}
                            draftId={draftId ?? undefined}
                            globalFilters={globalFilters}
                            result={dt?.status === 'done' ? dt.result : null}
                            disabled={dt?.status !== 'done'}
                          />
                        );
                      })()}
                    <button
                      type="button"
                      onClick={() => setReportPanelOpen((v) => !v)}
                      aria-pressed={!reportPanelOpen}
                      title={reportPanelOpen ? 'Hide the widgets panel — full-width canvas' : 'Show the widgets panel'}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-300"
                    >
                      {reportPanelOpen ? <PanelRightClose aria-hidden className="h-3.5 w-3.5" /> : <PanelRight aria-hidden className="h-3.5 w-3.5" />}
                      {reportPanelOpen ? 'Full screen' : 'Show panel'}
                    </button>
                  </div>
                  {fullSpecs(report.kpis).length + fullSpecs(report.charts).length === 0 && (
                    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/50 dark:bg-amber-900/10">
                      <p className="min-w-0 flex-1 text-xs text-amber-800 dark:text-amber-300">
                        This application has no report yet — generate it from the understood
                        sources, then edit every widget here.
                      </p>
                      <button
                        type="button"
                        disabled={genState === 'working'}
                        onClick={() => void generateNow()}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
                      >
                        {genState === 'working' && (
                          <RefreshCw aria-hidden className="h-3 w-3 animate-spin" />
                        )}
                        {genState === 'working' ? 'Working…' : 'Generate the report'}
                      </button>
                      {genError && (
                        <p role="alert" className="basis-full text-xs text-red-600 dark:text-red-400">
                          {genError}
                        </p>
                      )}
                      {genError && /understand/i.test(genError) && (
                        <button
                          type="button"
                          disabled={genState === 'working'}
                          onClick={() => void runUnderstandingChain()}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-accent-500 px-3 py-1.5 text-xs font-medium text-accent-700 hover:bg-accent-50 disabled:opacity-50 dark:text-accent-300 dark:hover:bg-accent-900/30"
                        >
                          Run the understanding, then the report
                        </button>
                      )}
                      <span className="ml-auto flex shrink-0 items-center gap-2">
                        <QuietAction label="Resume the guided journey" href={routes.studioNew} />
                      </span>
                    </div>
                  )}
                  <StudioReportPages
                    pages={pages}
                    current={activePage ?? ''}
                    counts={pageCounts}
                    busy={pageBusy}
                    /* pages are editable whenever the draft can be patched */
                    editable={Boolean(draftId)}
                    onSelect={setPageId}
                    onAdd={(title) =>
                      patchPages(
                        [
                          {
                            op: 'add',
                            path: '/report/pages/-',
                            value: {
                              page_id: `page_${title.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24) || 'new'}`,
                              title,
                              order: pages.length,
                            },
                          },
                        ],
                        `add the page ${title}`,
                      )
                    }
                    onRename={(id, title) =>
                      patchPages(
                        [
                          {
                            op: 'set',
                            path: `/report/pages/${pages.findIndex((p) => p.page_id === id)}/title`,
                            value: title,
                          },
                        ],
                        `rename the page to ${title}`,
                      )
                    }
                    onRemove={(id) =>
                      patchPages(
                        [
                          {
                            op: 'remove',
                            path: `/report/pages/${pages.findIndex((p) => p.page_id === id)}`,
                          },
                        ],
                        'remove an empty page',
                      )
                    }
                  />
                  {pageError && (
                    <p role="alert" className="text-xs text-amber-700 dark:text-amber-300">
                      {pageError}
                    </p>
                  )}
                  <StudioReportFilters
                    filters={report.filters ?? []}
                    applied={globalFilters}
                    valuesFor={filterValuesFor}
                    fallbackFqn={(col) => filterFqn.get(col)}
                    busy={Object.values(tiles).some((t) => t.status === 'running')}
                    onApply={(next) =>
                      applyFilters(
                        next,
                        fullSpecs(report.kpis)
                          .concat(fullSpecs(report.charts))
                          .concat(report.detail ? [report.detail] : []),
                      )
                    }
                  />
                  {skippedSummary.length > 0 && (
                    <div
                      role="status"
                      className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200"
                    >
                      <p className="flex items-center gap-1.5 font-medium">
                        <AlertCircle aria-hidden className="h-3.5 w-3.5 shrink-0" />
                        {skippedSummary.length} filter{skippedSummary.length > 1 ? 's are' : ' is'} scoped to
                        {skippedSummary.length > 1 ? ' their datasets' : ' its dataset'} — not every widget uses
                        {skippedSummary.length > 1 ? ' them' : ' it'}
                      </p>
                      <ul className="mt-0.5 space-y-0.5">
                        {skippedSummary.map((s, i) => (
                          <li key={`${s.column}-${s.fqn}-${i}`}>
                            <span className="font-mono">{s.column}</span>
                            {s.fqn ? ` · ${s.fqn.split('.').slice(-1)[0]}` : ''} — didn&rsquo;t apply to{' '}
                            {s.charts.length} widget{s.charts.length > 1 ? 's' : ''}
                            {s.charts.length <= 3 ? ` (${s.charts.join(', ')})` : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {fullSpecs(report.kpis).filter((k) => onActivePage(k.chart_id)).map((k) => {
                      const t = tiles[k.chart_id];
                      return (
                        <div
                          key={k.chart_id}
                          title="Click to edit this KPI in the panel"
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest('button')) return;
                            setFocusWidget(k.chart_id);
                          }}
                          className={`cursor-pointer rounded-lg border bg-white px-2.5 py-2 transition-colors dark:bg-slate-900 ${
                            focusWidget === k.chart_id
                              ? 'border-accent-500 ring-1 ring-accent-500'
                              : 'border-slate-200 hover:border-accent-300 dark:border-slate-800 dark:hover:border-accent-700'
                          }`}
                        >
                          <p className="flex items-start justify-between gap-1">
                            <span className="min-w-0 truncate text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                              {k.title}
                            </span>
                            {removeArmed === k.chart_id ? (
                              <button
                                type="button"
                                disabled={tileEditBusy === k.chart_id}
                                onClick={() => void removeChart(k.chart_id, 'kpis')}
                                className="shrink-0 rounded px-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:text-red-400"
                              >
                                {tileEditBusy === k.chart_id ? '…' : 'remove?'}
                              </button>
                            ) : (
                              <button
                                type="button"
                                title="Remove this KPI — asks once more"
                                onClick={() => setRemoveArmed(k.chart_id)}
                                className="shrink-0 rounded p-0.5 text-slate-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400"
                              >
                                <X aria-hidden className="h-3 w-3" />
                              </button>
                            )}
                          </p>
                          {tileEditError?.chartId === k.chart_id && (
                            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                              {tileEditError.message}
                            </p>
                          )}
                          {!t || t.status === 'running' ? (
                            <div className="mt-1 h-5 w-16 animate-pulse rounded bg-slate-100 dark:bg-slate-800" aria-hidden />
                          ) : t.status === 'not_run' ? (
                            <p className="text-xs text-slate-400 dark:text-slate-500" title={t.reason}>
                              not run
                            </p>
                          ) : t.status === 'error' ? (
                            <p className="text-xs text-red-600 dark:text-red-400" title={t.error}>—</p>
                          ) : (
                            (() => {
                              const h = kpiHeadline(k, t.result);
                              return (
                                <p
                                  className="text-base font-semibold tabular-nums text-slate-900 dark:text-slate-100"
                                  title={h.ok ? undefined : 'the result carries no numeric measure cell — check the widget definition'}
                                >
                                  {h.ok ? fmtVal(h.value) : '—'}
                                </p>
                              );
                            })()
                          )}
                          {/* the AI's own reading of the number + the method,
                              both SERVED on the spec — meaning first, formula
                              as evidence */}
                          {k.provenance?.rationale && (
                            <p
                              className="mt-0.5 line-clamp-1 text-[11px] text-slate-400 dark:text-slate-500"
                              title={k.provenance.rationale}
                            >
                              {k.provenance.rationale}
                            </p>
                          )}
                          {k.measures?.[0]?.column && (
                            <p className="mt-0.5 truncate font-mono text-[10px] text-slate-300 dark:text-slate-600">
                              {k.measures[0].aggregator}({k.measures[0].column})
                              {k.dataset?.table ? ` · ${k.dataset.table}` : ''}
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {fullSpecs(report.charts)
                      /* the detail table is a widget the reader sees and the
                         generator gives it its own page — not rendering it left
                         that page blank while the tab claimed it held one. */
                      .concat(report.detail ? [report.detail] : [])
                      .filter((c) => onActivePage(c.chart_id))
                      .map((c) => {
                      const t = tiles[c.chart_id];
                      const viz = normalizeViz(c.chart_type);
                      const wide = layoutW(c.chart_id) >= 24;
                      const busy = tileEditBusy === c.chart_id;
                      const editable = chartPatchIndex(c.chart_id) >= 0;
                      const tableView =
                        t?.status === 'done' ? (
                          <table className="min-w-full text-xs">
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {t.result.rows.slice(0, 8).map((row, ri) => (
                                <tr key={ri}>
                                  {row.slice(0, 3).map((cell, ci) => (
                                    <td key={ci} className="whitespace-nowrap px-1.5 py-0.5 tabular-nums text-slate-600 dark:text-slate-300">
                                      {fmtVal(cell)}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        ) : null;
                      return (
                        <div
                          key={c.chart_id}
                          title="Click to edit this widget in the panel"
                          onClick={(e) => {
                            if ((e.target as HTMLElement).closest('button, input, select, a')) return;
                            setFocusWidget(c.chart_id);
                          }}
                          className={`cursor-pointer rounded-xl border bg-white p-2.5 transition-colors dark:bg-slate-900 ${
                            focusWidget === c.chart_id
                              ? 'border-accent-500 ring-1 ring-accent-500'
                              : 'border-slate-200 hover:border-accent-300 dark:border-slate-800 dark:hover:border-accent-700'
                          } ${wide ? 'md:col-span-2' : ''}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="min-w-0 truncate text-xs font-medium text-slate-800 dark:text-slate-200" title={c.provenance?.rationale ?? undefined}>
                              {c.title}
                              {c.provenance?.rationale && (
                                <span className="ml-1.5 font-normal text-slate-400 dark:text-slate-500">
                                  — {c.provenance.rationale}
                                </span>
                              )}
                            </p>
                            {editable && (
                              <span className="flex shrink-0 items-center gap-0.5">
                                <MoveToPage
                                  pages={pages}
                                  current={pageOf.get(c.chart_id) ?? pages[0]?.page_id ?? ''}
                                  busy={pageBusy}
                                  onMove={(to) => {
                                    const i = (report.layout ?? []).findIndex(
                                      (l) => l?.chart_id === c.chart_id,
                                    );
                                    if (i < 0) return;
                                    return patchPages(
                                      [{ op: 'set', path: `/report/layout/${i}/page_id`, value: to }],
                                      `move ${c.title} to another page`,
                                    );
                                  }}
                                />
                                <StudioExportMenu
                                  title={c.title}
                                  spec={c}
                                  draftId={draftId ?? undefined}
                                  globalFilters={globalFilters}
                                  result={t?.status === 'done' ? t.result : null}
                                  disabled={t?.status !== 'done'}
                                />
                                <button
                                  type="button"
                                  disabled={busy}
                                  title={wide ? 'Back to half width' : 'Expand to full width'}
                                  onClick={() => void toggleChartSize(c.chart_id)}
                                  className="ml-0.5 rounded p-1 text-slate-400 hover:text-slate-600 disabled:opacity-40 dark:hover:text-slate-300"
                                >
                                  {wide ? (
                                    <Minimize2 aria-hidden className="h-3.5 w-3.5" />
                                  ) : (
                                    <Maximize2 aria-hidden className="h-3.5 w-3.5" />
                                  )}
                                </button>
                                {removeArmed === c.chart_id ? (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void removeChart(c.chart_id, 'charts')}
                                    className="rounded px-1.5 py-0.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-40 dark:text-red-400 dark:hover:bg-red-900/30"
                                  >
                                    {busy ? 'removing…' : 'remove?'}
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    disabled={busy}
                                    title="Remove this widget — asks once more"
                                    onClick={() => setRemoveArmed(c.chart_id)}
                                    className="rounded p-1 text-slate-300 hover:text-red-500 disabled:opacity-40 dark:text-slate-600 dark:hover:text-red-400"
                                  >
                                    <X aria-hidden className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </span>
                            )}
                          </div>
                          {tileEditError?.chartId === c.chart_id && (
                            <p role="alert" className="mt-0.5 text-xs text-red-600 dark:text-red-400">
                              {tileEditError.message}
                            </p>
                          )}
                          <div className={`mt-1.5 overflow-auto ${viz === 'table' ? 'max-h-40' : ''}`}>
                            {!t || t.status === 'running' ? (
                              <div className="h-24 animate-pulse rounded bg-slate-100 dark:bg-slate-800" aria-hidden />
                            ) : t.status === 'not_run' ? (
                              <p className="text-xs text-slate-500 dark:text-slate-400">
                                Not asked for yet — {t.reason}. Open this widget on its own to run it.
                              </p>
                            ) : t.status === 'error' ? (
                              <p
                                className={`text-xs ${t.budget ? 'text-amber-700 dark:text-amber-300' : 'text-red-600 dark:text-red-400'}`}
                                title={t.raw}
                              >
                                {t.error}
                              </p>
                            ) : (t.result.rows?.length ?? 0) === 0 ? (
                              <p className="py-6 text-center text-[13px] text-slate-500 dark:text-slate-400">
                                No row matches this widget — nothing to draw.
                              </p>
                            ) : !isRenderableChart(c.chart_type) ? (
                              <ChartVizView viz={viz} result={t.result} table={tableView} />
                            ) : (
                              // the LEGACY BI renderer — real axes, grid,
                              // tooltips, 18 types; one spec, two surfaces
                              (() => {
                                const feed = chartFeed(c, t.result);
                                return (
                                  <div className={wide ? 'h-64' : 'h-52'}>
                                    <DynamicChart
                                      config={{
                                        chartType: c.chart_type,
                                        x: feed.x,
                                        prefetched: { data: feed.data },
                                      }}
                                    />
                                  </div>
                                );
                              })()
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* add a widget — clones a valid spec, then refine via
                        rails or chat; a backend refusal renders as-is */}
                    {fullSpecs(report.charts).length > 0 && (
                      <div id="studio-composer" className="rounded-xl border border-dashed border-slate-300 p-2.5 dark:border-slate-700">
                        {!composer.open ? (
                          <button
                            type="button"
                            onClick={() =>
                              setComposer((cp) => ({
                                ...cp,
                                open: true,
                                tableFqn: cp.tableFqn || (composerTables[0]?.fqn ?? ''),
                              }))
                            }
                            className="flex h-full min-h-[72px] w-full items-center justify-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                          >
                            <Plus aria-hidden className="h-3.5 w-3.5" />
                            Add a widget
                          </button>
                        ) : (
                          <div className="space-y-2">
                            <p className="text-[13px] font-medium text-slate-700 dark:text-slate-300">
                              New widget
                            </p>
                            {(() => {
                              const tbl =
                                composerTables.find((t) => t.fqn === composer.tableFqn) ??
                                composerTables[0];
                              const cols = tbl?.columns ?? [];
                              const nums = cols.filter((c) =>
                                /NUMBER|NUMERIC|DECIMAL|INT|FLOAT|DOUBLE/i.test(c.type ?? ''),
                              );
                              return (
                                <>
                                  <label className="block text-xs text-slate-500 dark:text-slate-400">
                                    Table
                                    <select
                                      value={tbl?.fqn ?? ''}
                                      onChange={(e) =>
                                        setComposer((cp) => ({
                                          ...cp,
                                          tableFqn: e.target.value,
                                          measureCol: '',
                                          dimCol: '',
                                        }))
                                      }
                                      aria-label="Table"
                                      className="mt-0.5 block h-7 w-full rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                    >
                                      {composerTables.map((t) => (
                                        <option key={t.fqn} value={t.fqn}>
                                          {t.name} · {t.origin}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                  <div className="flex flex-wrap items-end gap-1.5">
                                    <label className="text-xs text-slate-500 dark:text-slate-400">
                                      Measure
                                      <select
                                        value={composer.agg}
                                        onChange={(e) =>
                                          setComposer((cp) => ({ ...cp, agg: e.target.value }))
                                        }
                                        aria-label="Aggregate"
                                        className="mt-0.5 block h-7 rounded-lg border border-slate-200 bg-white px-1.5 text-[13px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                      >
                                        {['SUM', 'COUNT', 'AVG', 'MIN', 'MAX', 'COUNT_DISTINCT'].map(
                                          (a) => (
                                            <option key={a} value={a}>
                                              {a}
                                            </option>
                                          ),
                                        )}
                                      </select>
                                    </label>
                                    <label className="min-w-0 flex-1 text-xs text-slate-500 dark:text-slate-400">
                                      Of column
                                      <select
                                        value={composer.measureCol}
                                        onChange={(e) =>
                                          setComposer((cp) => ({ ...cp, measureCol: e.target.value }))
                                        }
                                        aria-label="Measure column"
                                        className="mt-0.5 block h-7 w-full rounded-lg border border-slate-200 bg-white px-1.5 font-mono text-[13px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                      >
                                        <option value="">count the rows</option>
                                        {(nums.length ? nums : cols).map((c) => (
                                          <option key={c.name} value={c.name}>
                                            {c.name}
                                          </option>
                                        ))}
                                      </select>
                                    </label>
                                  </div>
                                  <label className="block text-xs text-slate-500 dark:text-slate-400">
                                    Group by
                                    <select
                                      value={composer.dimCol}
                                      onChange={(e) =>
                                        setComposer((cp) => ({ ...cp, dimCol: e.target.value }))
                                      }
                                      aria-label="Group by"
                                      className="mt-0.5 block h-7 w-full rounded-lg border border-slate-200 bg-white px-2 font-mono text-[13px] text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                    >
                                      <option value="">no grouping</option>
                                      {cols.map((c) => (
                                        <option key={c.name} value={c.name}>
                                          {c.name}
                                        </option>
                                      ))}
                                    </select>
                                  </label>
                                </>
                              );
                            })()}
                            <div>
                              <p className="text-xs text-slate-500 dark:text-slate-400">Chart type</p>
                              <div role="radiogroup" aria-label="Chart type" className="mt-0.5 flex flex-wrap gap-0.5">
                                {CHART_TYPES.map(({ id, label, Icon }) => {
                                  const active = composer.viz === id;
                                  return (
                                    <button
                                      key={id}
                                      type="button"
                                      role="radio"
                                      aria-checked={active}
                                      aria-label={label}
                                      title={label}
                                      onClick={() =>
                                        setComposer((cp) => ({ ...cp, viz: id as ChartViz }))
                                      }
                                      className={`rounded-md p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                                        active
                                          ? 'bg-accent-600 text-white'
                                          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800'
                                      }`}
                                    >
                                      <Icon aria-hidden className="h-4 w-4" />
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                            <label className="block text-xs text-slate-500 dark:text-slate-400">
                              Title
                              <input
                                value={composer.title}
                                onChange={(e) => setComposer((cp) => ({ ...cp, title: e.target.value }))}
                                placeholder="optional"
                                aria-label="Widget title"
                                className="mt-0.5 block h-7 w-full rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                              />
                            </label>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={composer.working}
                                onClick={() => void addWidget()}
                                className="rounded-md bg-accent-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
                              >
                                {composer.working ? 'Creating…' : 'Create'}
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setComposer((cp) => ({ ...cp, open: false, error: null }))
                                }
                                className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400"
                              >
                                Cancel
                              </button>
                            </div>
                            {composer.error && (
                              <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                                {composer.error}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  {/* coherence — grouped by what is wrong, with the repair
                      the backend guarantees; never the same sentence eight
                      times over */}
                  {(issues?.length ?? 0) > 0 && (
                    <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Coherence
                      </p>
                      <ul className="mt-1.5 space-y-1.5">
                        {Object.entries(
                          issues!.reduce<Record<string, ConsistencyIssue[]>>((acc, i) => {
                            const k = i.code ?? i.message ?? 'issue';
                            (acc[k] ??= []).push(i);
                            return acc;
                          }, {}),
                        ).map(([code, group]) => {
                          const head = group[0];
                          const fix = head.fix;
                          const blocking = group.some((g) => g.severity === 'blocking');
                          return (
                            <li key={code} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[13px]">
                              <span
                                className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs ${
                                  blocking
                                    ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                    : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                }`}
                              >
                                {blocking ? 'blocks publishing' : 'to review'}
                              </span>
                              <span className="min-w-0 text-slate-700 dark:text-slate-200">
                                {head.message ?? code}
                              </span>
                              {group.length > 1 && (
                                <span
                                  className="text-slate-400 dark:text-slate-500"
                                  title={group
                                    .map((g) => g.chart_id)
                                    .filter(Boolean)
                                    .join(', ')}
                                >
                                  · {group.length} widgets
                                </span>
                              )}
                              {fix?.available === false && fix.reason && (
                                <span className="text-slate-400 dark:text-slate-500">
                                  · no automatic repair: {fix.reason}
                                </span>
                              )}
                              {fix?.available && fix.kind === 'run_job' && fix.job_id && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setJobsFocus(fix.job_id!);
                                    setTab('jobs');
                                  }}
                                  className="text-accent-700 hover:underline dark:text-accent-400"
                                >
                                  Open the process
                                </button>
                              )}
                              {fix?.available && fix.kind === 'switch_dataset' && (
                                <span className="text-slate-500 dark:text-slate-400">
                                  · reads the target once the widget is repointed to{' '}
                                  <span className="font-mono text-xs">
                                    {String(fix.to ?? '').split('.').slice(-1)[0]}
                                  </span>
                                </span>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </section>
                  )}
                  {publishError && (
                    <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                      {publishError}
                    </p>
                  )}
                  {draftId && (
                    <RefineChat
                      draftId={draftId}
                      prefill={chatPrefill}
                      onPrefillConsumed={() => setChatPrefill(null)}
                      onApplied={() => void load(draftId)}
                    />
                  )}
                </div>

                {/* the EDITABLE atelier rails — same K3 patch contract as the
                    journey preview; a rail edit re-reads the application.
                    Hidden when the report goes full screen. */}
                {reportPanelOpen && (
                <aside className="space-y-3">
                  {draftId && (
                    <AtelierRails
                      draftId={draftId}
                      report={report}
                      knownColumns={knownColumns}
                      focusWidgetId={focusWidget}
                      onApplied={() => void load(draftId)}
                      onAddWidget={() => {
                        setComposer((c) => ({
                          ...c,
                          open: true,
                          tableFqn: c.tableFqn || (composerTables[0]?.fqn ?? ''),
                        }));
                        document
                          .getElementById('studio-composer')
                          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }}
                    />
                  )}
                  <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                    <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Data</p>
                    <ul className="mt-1.5 space-y-1 text-xs text-slate-600 dark:text-slate-300">
                      {/* dedupe by fqn — a table picked through two paths is
                          ONE table here (the duplicate itself is reported) */}
                      {[...new Map((model.tables ?? []).map((t) => [t.fqn, t])).values()].map(
                        (t) => (
                          <li key={t.fqn} title={t.fqn}>
                            <span className="font-medium">{t.name}</span>
                            <span className="text-slate-400 dark:text-slate-500">
                              {' '}
                              — {grainText(t.grain) ?? '—'}
                            </span>
                          </li>
                        ),
                      )}
                    </ul>
                  </section>
                </aside>
                )}
              </div>
            ) : (
              <EmptyState
                title="No report yet"
                description="The AI builds the first report from this application's understood sources — nothing runs without you seeing it."
                action={
                  <span className="flex flex-col items-center gap-1.5">
                    <button
                      type="button"
                      disabled={genState === 'working'}
                      onClick={() => void generateNow()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:opacity-50"
                    >
                      {genState === 'working' && (
                        <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />
                      )}
                      {genState === 'working' ? 'Generating…' : 'Generate the report'}
                    </button>
                    {genError && (
                      <span role="alert" className="text-xs text-red-600 dark:text-red-400">
                        {genError}
                      </span>
                    )}
                  </span>
                }
              />
            ))}

          {/* ── MODEL — target model by default, mapping on demand ── */}
          {tab === 'model' && draftId && (
            <div className="space-y-2">
              <StudioModelTab
                draftId={draftId}
                model={model}
                report={report}
                data={
                  typeof dataView === 'object' && dataView !== null
                    ? new Map(dataView.sources.map((s) => [s.fqn, s]))
                    : null
                }
                onApplied={() => void load(draftId)}
                onAskAi={(instruction) => {
                  setChatPrefill(instruction);
                  setTab('reporting');
                }}
                onOpenJob={(jobId) => {
                  setJobsFocus(jobId);
                  setTab('jobs');
                }}
                onOpenAccess={() => setTab('governance')}
                onOpenInsights={() => setTab('reporting')}
                focusEntity={modelFocus}
              />
              <QuietAction
                label="Open the full model (freshness, lineage, per-table detail)"
                href={draftId ? `${routes.studioModel}?draft=${encodeURIComponent(draftId)}` : routes.studioModel}
              />
            </div>
          )}

          {/* ── SOURCES — the ONE objects surface, pinned to this app ──
              (the convergence rule: same table, same bindings, same sheets
              as /studio/source — the card grid this replaced kept a second
              discovery semantics) */}
          {tab === 'sources' && draftId && (
            <div className="space-y-3">
              {/* the SYSTEMS lead — logo + KPI highlights (user directive);
                  the object-by-object detail is one fold below */}
              <StudioSourceSystems draftId={draftId} />
              <ObjectsPanel
                fixedAppId={draftId}
                onAddSource={() => router.push(routes.studioSource)}
                onOpenConnection={(connectionId) =>
                  router.push(
                    `${routes.studioSource}?view=connections&connection=${encodeURIComponent(connectionId)}`,
                  )
                }
              />
            </div>
          )}

          {/* ── JOBS & QUALITY ────────────────────────────────────── */}
          {/* ── QUALITY — diagnosis of the WHOLE model, rules live in Jobs ── */}
          {tab === 'quality' && (
            <div className="grid grid-cols-1 gap-3">
              {draftId && <StudioQualitySummary draftId={draftId} />}
              {draftId && (
                <StudioQualityPanel
                  draftId={draftId}
                  onFixInJob={(jobId) => {
                    setJobsFocus(jobId);
                    setTab('jobs');
                  }}
                  onChanged={() => draftId && void load(draftId)}
                />
              )}
              {draftId && (
                <StudioReadyKpis
                  draftId={draftId}
                  report={report}
                  tables={model?.tables ?? []}
                  onExplore={() => setTab('reporting')}
                  onChanged={() => draftId && void load(draftId)}
                />
              )}
              <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Data quality gate</h3>
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      On-demand sampled checks — the measured results above are prepared
                      automatically; nothing here is required to see them.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void gate()}
                    disabled={dq === 'running'}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
                  >
                    {dq === 'running' && <RefreshCw className="h-3 w-3 animate-spin" aria-hidden />}
                    Run the checks
                  </button>
                </div>
                {dq && dq !== 'running' && (() => {
                  // whole-model truth first, then a granular per-table drill
                  const gateObj =
                    dq.gate && typeof dq.gate === 'object'
                      ? (dq.gate as { full_ingestion_allowed?: boolean; note?: string })
                      : null;
                  const checks = dq.checks ?? [];
                  const tally = (v: string) => checks.filter((c) => c.verdict === v).length;
                  const byEntity = new Map<string, typeof checks>();
                  for (const c of checks) {
                    const k = c.scope?.fqn ?? c.scope?.entity_id ?? 'model';
                    if (!byEntity.has(k)) byEntity.set(k, []);
                    byEntity.get(k)!.push(c);
                  }
                  const RANK: Record<string, number> = { fail: 0, warn: 1, not_evaluated: 2, pass: 3 };
                  const worst = (cs: typeof checks) =>
                    cs.reduce<string>((w, c) => ((RANK[c.verdict ?? ''] ?? 4) < (RANK[w] ?? 4) ? (c.verdict ?? w) : w), 'pass');
                  const evLine = (c: (typeof checks)[number]) => {
                    const ev = (c.evidence ?? {}) as Record<string, unknown>;
                    return Object.entries(ev)
                      .filter(([k, v]) => v != null && k !== 'note' && typeof v !== 'object')
                      .slice(0, 3)
                      .map(([k, v]) => `${k.replace(/_/g, ' ')}: ${typeof v === 'number' ? v.toLocaleString() : String(v)}`)
                      .join(' · ');
                  };
                  const fixSentence = (c: (typeof checks)[number]) =>
                    `The quality check « ${c.rule ?? c.id} » ${c.verdict === 'fail' ? 'fails' : 'warns'} on ${c.scope?.fqn?.split('.').slice(-1)[0] ?? 'a table'}${c.scope?.column ? ` (${String(c.scope.column)})` : ''} — adjust the model or the report so this data is handled (dedup, filter, or transformation).`;
                  return (
                  <div className="mt-2.5 space-y-2">
                    <div className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="text-slate-500 dark:text-slate-400">Overall:</span>
                      <span
                        className={`rounded-full px-2 py-0.5 font-medium ${
                          dq.overall === 'blocked'
                            ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                        }`}
                      >
                        {dq.overall ?? '—'}
                      </span>
                      {(['pass', 'warn', 'fail', 'not_evaluated'] as const).map((v) =>
                        tally(v) > 0 ? (
                          <span key={v} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            {tally(v)} {v.replace('_', ' ')}
                          </span>
                        ) : null,
                      )}
                      {(dq.blockers?.length ?? 0) > 0 && (
                        <span className="rounded-full bg-red-50 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-300">
                          {dq.blockers!.length} blocker(s)
                        </span>
                      )}
                    </div>
                    {gateObj && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Full ingestion {gateObj.full_ingestion_allowed ? 'allowed' : 'NOT allowed yet'}
                        {gateObj.note ? ` — ${gateObj.note}` : ''}
                      </p>
                    )}
                    <ul className="space-y-1.5">
                      {[...byEntity.entries()].map(([fqn, cs]) => {
                        const w = worst(cs);
                        const open = dqOpenTable === fqn;
                        return (
                          <li key={fqn} className="rounded-lg border border-slate-200 dark:border-slate-800">
                            <button
                              type="button"
                              onClick={() => setDqOpenTable(open ? null : fqn)}
                              aria-expanded={open}
                              className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-left"
                            >
                              <span className="min-w-0 truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                                {fqn.split('.').slice(-1)[0]}
                              </span>
                              <span className="flex shrink-0 items-center gap-1">
                                <span
                                  className={`rounded-full px-1.5 py-0.5 text-xs ${
                                    w === 'fail'
                                      ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                      : w === 'warn'
                                        ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                        : w === 'not_evaluated'
                                          ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                          : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                  }`}
                                >
                                  {w.replace('_', ' ')}
                                </span>
                                <span className="text-xs tabular-nums text-slate-400 dark:text-slate-500">
                                  {cs.length} check(s)
                                </span>
                              </span>
                            </button>
                            {open && (
                              <ul className="space-y-1 border-t border-slate-100 px-2 py-1.5 dark:border-slate-800">
                                {cs.map((c) => (
                                  <li key={c.id} className="text-xs">
                                    <span className="flex items-center gap-2">
                                      <span
                                        className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs ${
                                          c.verdict === 'pass'
                                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                                            : c.verdict === 'fail'
                                              ? 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300'
                                              : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                        }`}
                                      >
                                        {c.verdict ?? '—'}
                                      </span>
                                      <span className="min-w-0 truncate text-slate-600 dark:text-slate-300" title={c.message || c.id}>
                                        {c.rule ?? c.id}
                                        {c.scope?.column ? ` (${String(c.scope.column)})` : ''}
                                        {c.scope?.columns?.length ? ` (${c.scope.columns.join(', ')})` : ''}
                                      </span>
                                      {(c.verdict === 'fail' || c.verdict === 'warn') && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setChatPrefill(fixSentence(c));
                                            setTab('reporting');
                                          }}
                                          className="ml-auto shrink-0 text-xs text-accent-600 hover:underline dark:text-accent-400"
                                        >
                                          Fix with a sentence
                                        </button>
                                      )}
                                    </span>
                                    {evLine(c) && (
                                      <p className="ml-8 text-xs text-slate-400 dark:text-slate-500">{evLine(c)}</p>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                  );
                })()}
                {!dq && (
                  <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
                    Row counts, key completeness and rule checks on the sampled model — run on demand, free.
                  </p>
                )}
              </section>
            </div>
          )}

          {/* ── JOBS — the pilot list; loads & automations behind one filter ── */}
          {tab === 'jobs' && draftId && (
            <div className="space-y-3">
              <StudioViewKpis draftId={draftId} view="jobs" />
              <StudioJobsPanel
                draftId={draftId}
                focusJobId={jobsFocus}
                onChanged={() => draftId && void load(draftId)}
                onOpenQuality={() => setTab('quality')}
                onOpenActivation={openActivation}
                entityMeaning={
                  new Map(
                    (model?.tables ?? [])
                      .filter((t) => t.entity_id && t.description)
                      .map((t) => [t.entity_id, t.description as string]),
                  )
                }
                onOpenTarget={(targetId) => {
                  setModelFocus(`t:${targetId}`);
                  setTab('model');
                }}
              />
            </div>
          )}

          {/* ── KNOWLEDGE ─────────────────────────────────────────── */}
          {tab === 'knowledge' && (
            <div className="space-y-2">
              {draftId && <StudioKnowledgeHeader draftId={draftId} />}
              {draftId && <StudioGlossary draftId={draftId} />}
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      This application
                    </h3>
                    {(() => {
                      /* deciding one by one is unusable past a handful —
                         confirm the whole pending set in one call */
                      const pending = Array.isArray(appEnrich)
                        ? appEnrich.filter((x) => x.status === 'proposed')
                        : [];
                      if (pending.length < 5 || !draftId) return null;
                      return (
                        <button
                          type="button"
                          disabled={deciding === 'bulk'}
                          onClick={() => void confirmAllPending()}
                          title="Confirms every entry still awaiting a decision on this application"
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-[13px] text-slate-700 hover:border-accent-300 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200"
                        >
                          {deciding === 'bulk'
                            ? 'Confirming…'
                            : `Confirm the ${pending.length} pending`}
                        </button>
                      );
                    })()}
                  </div>
                  {appEnrich === null || appEnrich === 'loading' ? (
                    <div className="mt-2.5 h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" aria-hidden />
                  ) : appEnrich === 'error' ? (
                    <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
                      The knowledge base did not answer.
                    </p>
                  ) : appEnrich.length === 0 ? (
                    <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
                      Nothing recorded yet — knowledge appears after each analysis.
                    </p>
                  ) : (
                    <div className="mt-2.5 space-y-1.5">
                      {appGroups.map(([kind, items]) => {
                        /* a long family stays FOLDED: its heading carries the
                           count and its own bulk decision, so nobody scrolls
                           past a hundred rows to find the one that matters */
                        const pending = items.filter((x) => x.status === 'proposed');
                        const open = openKnowledge === kind || items.length <= 8;
                        return (
                          <div
                            key={kind}
                            className="rounded-lg border border-slate-100 dark:border-slate-800"
                          >
                            <div className="flex flex-wrap items-center gap-2 px-2.5 py-1.5">
                              <button
                                type="button"
                                aria-expanded={open}
                                onClick={() =>
                                  setOpenKnowledge((o) => (o === kind ? null : kind))
                                }
                                disabled={items.length <= 8}
                                className="inline-flex items-center gap-1 text-[13px] font-medium text-slate-700 disabled:cursor-default dark:text-slate-200"
                              >
                                {items.length > 8 &&
                                  (open ? (
                                    <ChevronDown aria-hidden className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronRight aria-hidden className="h-3.5 w-3.5" />
                                  ))}
                                {kind.replace(/_/g, ' ')}
                              </button>
                              <span className="text-xs text-slate-500 dark:text-slate-400">
                                {items.length} recorded
                                {pending.length > 0 ? ` · ${pending.length} awaiting you` : ''}
                              </span>
                              {pending.length > 1 && (
                                <button
                                  type="button"
                                  disabled={deciding != null}
                                  onClick={() => void confirmGroup(pending.map((x) => x.enrichment_id))}
                                  className="ml-auto rounded-md border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:border-accent-300 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
                                >
                                  {deciding === `group:${kind}`
                                    ? 'Confirming…'
                                    : `Confirm these ${pending.length}`}
                                </button>
                              )}
                            </div>
                            {open && (
                              <ul className="divide-y divide-slate-100 px-2.5 pb-1 dark:divide-slate-800">
                                {items.map((e) => (
                                  <EnrichmentRow
                                    key={e.enrichment_id}
                                    e={e}
                                    deciding={deciding}
                                    onDecide={(id, st) => void decide(id, st)}
                                  />
                                ))}
                              </ul>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>

                <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    Account knowledge (all applications)
                  </h3>
                  {acctEnrich === null || acctEnrich === 'loading' ? (
                    <div className="mt-2.5 h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" aria-hidden />
                  ) : acctEnrich === 'error' ? (
                    <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
                      The knowledge base did not answer.
                    </p>
                  ) : acctEnrich.length === 0 ? (
                    <p className="mt-2.5 text-xs text-slate-500 dark:text-slate-400">
                      Nothing recorded yet — knowledge appears after each analysis.
                    </p>
                  ) : (
                    <ul className="mt-2.5 divide-y divide-slate-100 dark:divide-slate-800">
                      {acctEnrich.map((e) => (
                        <EnrichmentRow key={e.enrichment_id} e={e} />
                      ))}
                    </ul>
                  )}
                </section>
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                What you confirm here is re-injected into every future AI answer as known context —
                nothing is learned without you.
              </p>
            </div>
          )}

          {/* ── GOVERNANCE ────────────────────────────────────────── */}
          {tab === 'governance' && draftId && (
            <>
              {/* the access business-KPI strip (real served figures) */}
              <StudioViewKpis draftId={draftId} view="access" />
              {/* the PROFILE spine leads (select/create a profile → data &
                  policies → users); the role-conditional engine is one click
                  away as Advanced, not superposed under it */}
              <StudioAccessProfilesPanel draftId={draftId} />
              <AdvancedGovernance draftId={draftId} />
              <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                <button
                  type="button"
                  onClick={openActivation}
                  className="rounded text-left hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:hover:text-accent-400"
                >
                  Activation:{' '}
                  <span className="font-medium">
                    {typeof activation?.status === 'string'
                      ? String(activation.status)
                      : 'not requested'}
                  </span>{' '}
                  — open the panel
                </button>
                <QuietAction
                  label="Account-wide governance & access"
                  icon={ShieldCheck}
                  href={routes.studioGov}
                />
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
