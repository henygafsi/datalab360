'use client';

/**
 * EventTimeline — reusable vertical timeline for `POST /projects/{id}/events`.
 *
 * Visual rhythm borrowed from
 *   apps/data360/src/app/shared/logistics/tracking/timeline.tsx
 * (24px left rail with a colored dot, sticky day grouping, icon + summary row).
 *
 * The renderer registry is keyed by `event_type` so callers can extend the
 * timeline with custom event kinds (AI_CODE_GENERATED, SANDBOX_RUN, …) without
 * forking the component. DEFAULT_RENDERERS ships sensible defaults for the
 * event types listed in the contract.
 */

import * as React from 'react';
import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Cog,
  Copy,
  CopyCheck,
  CpuIcon,
  FileCheck2,
  FlaskConical,
  GitBranch,
  Info,
  PackageCheck,
  PauseCircle,
  PlayCircle,
  Rocket,
  Search,
  Server,
  ShieldAlert,
  Skull,
  Sparkles,
  Trash2,
  UserPlus,
  UserX,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  format,
  formatDistanceToNowStrict,
  isToday,
  isYesterday,
  parseISO,
} from 'date-fns';

import { cn } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface AuditEvent {
  event_id: string;
  project_id?: string;
  event_type: string;
  event_details: Record<string, unknown>;
  actor?: { username?: string; role?: string };
  severity?: 'info' | 'warn' | 'error' | 'destructive';
  timestamp: string;
}

export type EventTint =
  | 'slate'
  | 'blue'
  | 'emerald'
  | 'amber'
  | 'rose'
  | 'violet';

export interface EventTypeRenderer {
  icon: React.ComponentType<{ className?: string }>;
  summary: (e: AuditEvent) => React.ReactNode;
  detail?: (e: AuditEvent) => React.ReactNode;
  tint?: EventTint;
}

interface EventTimelineProps {
  events: AuditEvent[];
  renderers?: Record<string, EventTypeRenderer>;
  showFilters?: boolean;
  maxHeight?: number | string;
  onEventClick?: (event: AuditEvent) => void;
  persona?: 'superadmin' | 'admin' | 'qa';
  /** Loading + error pass-through so the same component can mirror RTK Query state. */
  isLoading?: boolean;
  error?: string | null;
  className?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function safeStr(v: unknown, fallback = '—'): string {
  if (v === null || v === undefined) return fallback;
  if (typeof v === 'string') return v.length ? v : fallback;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return fallback;
  }
}

function detailField<T = string>(e: AuditEvent, key: string, fallback?: T): T | string {
  const v = e.event_details?.[key];
  if (v === undefined || v === null) return (fallback as T) ?? '—';
  return (typeof v === 'object' ? safeStr(v) : (v as unknown as T)) as T;
}

const tintToDot: Record<EventTint, string> = {
  slate: 'bg-slate-400 ring-slate-400/30',
  blue: 'bg-blue-500 ring-blue-500/30',
  emerald: 'bg-emerald-500 ring-emerald-500/30',
  amber: 'bg-amber-500 ring-amber-500/30',
  rose: 'bg-rose-500 ring-rose-500/30',
  violet: 'bg-violet-500 ring-violet-500/30',
};

const severityToBadge: Record<NonNullable<AuditEvent['severity']>, string> = {
  info: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  warn: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  error: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300',
  destructive:
    'bg-rose-600 text-white dark:bg-rose-700 dark:text-rose-50',
};

// ---------------------------------------------------------------------------
// Default renderer registry
// ---------------------------------------------------------------------------

const r = (
  icon: EventTypeRenderer['icon'],
  summary: EventTypeRenderer['summary'],
  tint: EventTint = 'slate',
  detail?: EventTypeRenderer['detail'],
): EventTypeRenderer => ({ icon, summary, tint, detail });

export const DEFAULT_RENDERERS: Record<string, EventTypeRenderer> = {
  // Workflow lifecycle ------------------------------------------------------
  WORKFLOW_CREATED: r(
    Sparkles,
    (e) => (
      <>
        Workflow <strong>{safeStr(detailField(e, 'workflow_name'))}</strong> created
      </>
    ),
    'blue',
  ),
  WORKFLOW_VALIDATED: r(
    FileCheck2,
    (e) => (
      <>
        Validation passed —{' '}
        <span className="text-muted-foreground">
          {safeStr(detailField(e, 'block_count'))} blocks,{' '}
          {safeStr(detailField(e, 'edge_count'))} edges
        </span>
      </>
    ),
    'emerald',
  ),
  WORKFLOW_EXECUTED: r(
    PlayCircle,
    (e) => (
      <>
        Workflow executed in{' '}
        <strong>{safeStr(detailField(e, 'duration_ms'))} ms</strong>
      </>
    ),
    'emerald',
  ),
  WORKFLOW_FAILED: r(
    XCircle,
    (e) => (
      <>
        Workflow failed —{' '}
        <span className="text-rose-600 dark:text-rose-400">
          {safeStr(detailField(e, 'error') ?? detailField(e, 'reason'))}
        </span>
      </>
    ),
    'rose',
  ),

  // Run lifecycle -----------------------------------------------------------
  RUN_STARTED: r(
    PlayCircle,
    (e) => (
      <>
        Run <strong>{safeStr(detailField(e, 'run_id'))}</strong> started
      </>
    ),
    'blue',
  ),
  RUN_COMPLETED: r(
    CheckCircle2,
    (e) => (
      <>
        Run <strong>{safeStr(detailField(e, 'run_id'))}</strong> completed in{' '}
        {safeStr(detailField(e, 'duration_ms'))} ms
      </>
    ),
    'emerald',
  ),
  RUN_FAILED: r(
    AlertTriangle,
    (e) => (
      <>
        Run <strong>{safeStr(detailField(e, 'run_id'))}</strong> failed:{' '}
        <span className="text-rose-600 dark:text-rose-400">
          {safeStr(detailField(e, 'error_message') ?? detailField(e, 'error'))}
        </span>
      </>
    ),
    'rose',
  ),
  RUN_KILLED: r(
    PauseCircle,
    (e) => (
      <>
        Run <strong>{safeStr(detailField(e, 'run_id'))}</strong> killed by{' '}
        {safeStr(detailField(e, 'killed_by') ?? e.actor?.username)}
      </>
    ),
    'amber',
  ),

  // Deployments ------------------------------------------------------------
  DEPLOYMENT_REQUESTED: r(
    GitBranch,
    (e) => (
      <>
        Deployment requested for version{' '}
        <strong>{safeStr(detailField(e, 'version_num'))}</strong>
      </>
    ),
    'blue',
  ),
  DEPLOYMENT_APPROVED: r(
    CheckCircle2,
    (e) => (
      <>
        Deployment <strong>{safeStr(detailField(e, 'deployment_id'))}</strong>{' '}
        approved
      </>
    ),
    'emerald',
  ),
  DEPLOYMENT_REJECTED: r(
    Ban,
    (e) => (
      <>
        Deployment rejected —{' '}
        <span className="text-muted-foreground">
          {safeStr(detailField(e, 'reason'))}
        </span>
      </>
    ),
    'rose',
  ),
  DEPLOYMENT_EXECUTED: r(
    Rocket,
    (e) => (
      <>
        Deployment <strong>{safeStr(detailField(e, 'deployment_id'))}</strong>{' '}
        executed on {safeStr(detailField(e, 'target_env', 'prod'))}
      </>
    ),
    'violet',
  ),

  // AI + sandbox -----------------------------------------------------------
  AI_CODE_GENERATED: r(
    Sparkles,
    (e) => (
      <>
        AI generated <strong>{safeStr(detailField(e, 'language', 'code'))}</strong>{' '}
        via {safeStr(detailField(e, 'model'))}
      </>
    ),
    'violet',
  ),
  SANDBOX_RUN: r(
    FlaskConical,
    (e) => (
      <>
        Sandbox run on{' '}
        <strong>{safeStr(detailField(e, 'language', 'code'))}</strong> —{' '}
        {safeStr(detailField(e, 'status', 'unknown'))}
      </>
    ),
    'amber',
  ),
  ARTEFACT_PUBLISHED: r(
    PackageCheck,
    (e) => (
      <>
        Artefact <strong>{safeStr(detailField(e, 'artefact_name'))}</strong>{' '}
        published ({safeStr(detailField(e, 'artefact_type'))})
      </>
    ),
    'emerald',
  ),

  // Accounts (destructive scope) -------------------------------------------
  ACCOUNT_CREATED: r(
    UserPlus,
    (e) => (
      <>
        Account <strong>{safeStr(detailField(e, 'account_name'))}</strong>{' '}
        created
      </>
    ),
    'blue',
  ),
  ACCOUNT_SUSPENDED: r(
    ShieldAlert,
    (e) => (
      <>
        Account <strong>{safeStr(detailField(e, 'account_name'))}</strong>{' '}
        suspended — {safeStr(detailField(e, 'reason'))}
      </>
    ),
    'amber',
  ),
  ACCOUNT_DELETED: r(
    Skull,
    (e) => (
      <>
        Account <strong>{safeStr(detailField(e, 'account_name'))}</strong>{' '}
        deleted — {safeStr(detailField(e, 'reason'))}
      </>
    ),
    'rose',
  ),

  // Compute service lifecycle ---------------------------------------------
  SPCS_SERVICE_CREATED: r(
    Server,
    (e) => (
      <>
        Compute service{' '}
        <strong>{safeStr(detailField(e, 'service_name'))}</strong> created on{' '}
        {safeStr(detailField(e, 'compute_pool'))}
      </>
    ),
    'blue',
  ),
  SPCS_SERVICE_DROPPED: r(
    Trash2,
    (e) => (
      <>
        Compute service{' '}
        <strong>{safeStr(detailField(e, 'service_name'))}</strong> dropped —{' '}
        {safeStr(detailField(e, 'reason'))}
      </>
    ),
    'rose',
  ),
};

const FALLBACK_RENDERER: EventTypeRenderer = {
  icon: Activity,
  summary: (e) => (
    <span className="text-muted-foreground">
      {e.event_type}
      {Object.keys(e.event_details ?? {}).length > 0
        ? ` · ${safeStr(e.event_details)}`
        : ''}
    </span>
  ),
  tint: 'slate',
};

// ---------------------------------------------------------------------------
// Day grouping
// ---------------------------------------------------------------------------

interface DayGroup {
  key: string;
  label: string;
  events: AuditEvent[];
}

function groupByDay(events: AuditEvent[]): DayGroup[] {
  const groups = new Map<string, DayGroup>();
  for (const ev of events) {
    let date: Date;
    try {
      date = parseISO(ev.timestamp);
      if (isNaN(date.getTime())) date = new Date(ev.timestamp);
    } catch {
      date = new Date();
    }
    const key = format(date, 'yyyy-MM-dd');
    if (!groups.has(key)) {
      let label: string;
      if (isToday(date)) label = 'Today';
      else if (isYesterday(date)) label = 'Yesterday';
      else label = format(date, 'PPP');
      groups.set(key, { key, label, events: [] });
    }
    groups.get(key)!.events.push(ev);
  }
  return Array.from(groups.values()).sort((a, b) => (a.key < b.key ? 1 : -1));
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------

interface RowProps {
  event: AuditEvent;
  renderer: EventTypeRenderer;
  persona?: EventTimelineProps['persona'];
  onClick?: (e: AuditEvent) => void;
}

function EventRow({ event, renderer, persona, onClick }: RowProps) {
  const [expanded, setExpanded] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  const Icon = renderer.icon ?? Circle;
  const tint = renderer.tint ?? 'slate';
  const severity = event.severity ?? 'info';

  let when: Date;
  try {
    when = parseISO(event.timestamp);
    if (isNaN(when.getTime())) when = new Date(event.timestamp);
  } catch {
    when = new Date();
  }
  const relative = formatDistanceToNowStrict(when, { addSuffix: true });
  const absolute = format(when, 'PPpp');

  const hasExpandable =
    !!renderer.detail || persona === 'superadmin' || severity === 'destructive';

  const handleToggle = () => {
    if (hasExpandable) setExpanded((v) => !v);
    onClick?.(event);
  };

  const copyId = async (ev: React.MouseEvent) => {
    ev.stopPropagation();
    try {
      await navigator.clipboard.writeText(event.event_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard not available */
    }
  };

  return (
    <li role="listitem" className="relative">
      <div
        role="button"
        aria-expanded={hasExpandable ? expanded : undefined}
        aria-label={`Event ${event.event_type} at ${absolute}`}
        className={cn(
          'group relative flex items-start gap-3 py-3 pl-10 pr-3',
          'border-l border-border ml-3',
          'hover:bg-muted/40 transition-colors cursor-pointer',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
        onClick={handleToggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
          }
        }}
        tabIndex={0}
      >
      {/* rail dot */}
      <span
        aria-hidden
        className={cn(
          'absolute -left-[7px] top-5 h-3.5 w-3.5 rounded-full ring-4',
          tintToDot[tint],
        )}
      />

      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-foreground/70" />

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span
            className="text-xs text-muted-foreground tabular-nums shrink-0"
            title={absolute}
          >
            {relative}
          </span>

          <span className="truncate text-foreground">
            {renderer.summary(event)}
          </span>

          {event.actor?.username && (
            <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              {event.actor.username}
              {event.actor.role ? ` · ${event.actor.role}` : ''}
            </span>
          )}

          {severity !== 'info' && (
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                severityToBadge[severity],
              )}
            >
              {severity}
            </span>
          )}

          {persona === 'superadmin' && (
            <button
              type="button"
              onClick={copyId}
              className="ml-auto inline-flex items-center gap-1 rounded-md border border-border bg-background px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground hover:bg-muted"
              title="Copy event_id"
            >
              {copied ? (
                <CopyCheck className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              <span className="max-w-[10ch] truncate">{event.event_id}</span>
            </button>
          )}

          {hasExpandable && (
            <span
              aria-hidden
              className="ml-1 text-muted-foreground transition-transform"
            >
              {expanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </span>
          )}
        </div>
      </div>
      </div>

      {expanded && (
        <div className="ml-3 border-l border-border pl-10 pr-3 pb-3">
          <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3 text-xs">
            {renderer.detail ? (
              <div>{renderer.detail(event)}</div>
            ) : (
              <div className="text-muted-foreground">
                No additional detail provided.
              </div>
            )}
            {persona === 'superadmin' && (
              <details className="group/json">
                <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
                  Full event JSON
                </summary>
                <pre className="mt-2 max-h-72 overflow-auto rounded bg-background p-2 font-mono text-[11px] leading-relaxed">
                  {JSON.stringify(event, null, 2)}
                </pre>
              </details>
            )}
          </div>
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// Filter strip
// ---------------------------------------------------------------------------

interface FilterStripProps {
  allTypes: string[];
  selectedTypes: Set<string>;
  onToggleType: (t: string) => void;
  severity: string;
  onSeverityChange: (s: string) => void;
  actorQuery: string;
  onActorQueryChange: (q: string) => void;
  persona?: EventTimelineProps['persona'];
  pinSandbox: boolean;
  onPinSandboxChange: (v: boolean) => void;
}

function FilterStrip({
  allTypes,
  selectedTypes,
  onToggleType,
  severity,
  onSeverityChange,
  actorQuery,
  onActorQueryChange,
  persona,
  pinSandbox,
  onPinSandboxChange,
}: FilterStripProps) {
  return (
    <div className="flex flex-col gap-2 border-b border-border bg-background/60 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Event type
        </span>
        <div className="flex flex-wrap gap-1">
          {allTypes.map((t) => {
            const active = selectedTypes.has(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => onToggleType(t)}
                className={cn(
                  'rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors',
                  active
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:bg-muted',
                )}
              >
                {t}
              </button>
            );
          })}
          {allTypes.length === 0 && (
            <span className="text-xs text-muted-foreground">
              No event types yet
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          Severity
          <select
            value={severity}
            onChange={(e) => onSeverityChange(e.target.value)}
            className="rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground"
          >
            <option value="all">All</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
            <option value="destructive">Destructive</option>
          </select>
        </label>

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Search className="h-3 w-3" />
          <input
            type="search"
            placeholder="Actor username"
            value={actorQuery}
            onChange={(e) => onActorQueryChange(e.target.value)}
            className="w-40 rounded-md border border-border bg-background px-2 py-1 text-xs text-foreground placeholder:text-muted-foreground"
          />
        </label>

        {persona === 'qa' && (
          <label className="ml-auto flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={pinSandbox}
              onChange={(e) => onPinSandboxChange(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <FlaskConical className="h-3.5 w-3.5" />
              Pin SANDBOX_RUN near failures
            </span>
          </label>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// State views
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
      <Info className="h-6 w-6 text-muted-foreground" />
      <p className="text-sm font-medium text-foreground">No events yet</p>
      <p className="text-xs text-muted-foreground">
        Activity will appear here as soon as something happens on this project.
      </p>
    </div>
  );
}

function LoadingState() {
  return (
    <ul role="list" className="space-y-1 p-3">
      {Array.from({ length: 5 }).map((_, i) => (
        <li
          key={i}
          role="listitem"
          className="flex items-center gap-3 rounded-md p-3"
        >
          <span className="h-3.5 w-3.5 rounded-full bg-muted animate-pulse" />
          <span className="h-3 w-24 rounded bg-muted animate-pulse" />
          <span className="h-3 flex-1 rounded bg-muted animate-pulse" />
        </li>
      ))}
    </ul>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-12 text-center">
      <AlertTriangle className="h-6 w-6 text-rose-500" />
      <p className="text-sm font-medium text-foreground">
        Could not load events
      </p>
      <p className="max-w-sm text-xs text-muted-foreground">{message}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const VIRTUALIZE_THRESHOLD = 200;
const ROW_ESTIMATE_PX = 56;

export function EventTimeline({
  events,
  renderers,
  showFilters = true,
  maxHeight,
  onEventClick,
  persona,
  isLoading,
  error,
  className,
}: EventTimelineProps) {
  const mergedRenderers = React.useMemo(
    () => ({ ...DEFAULT_RENDERERS, ...(renderers ?? {}) }),
    [renderers],
  );

  const allTypes = React.useMemo(() => {
    const set = new Set<string>();
    for (const e of events) set.add(e.event_type);
    return Array.from(set).sort();
  }, [events]);

  const [selectedTypes, setSelectedTypes] = React.useState<Set<string>>(new Set());
  const [severity, setSeverity] = React.useState<string>('all');
  const [actorQuery, setActorQuery] = React.useState('');
  const [pinSandbox, setPinSandbox] = React.useState(false);

  const toggleType = React.useCallback((t: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next;
    });
  }, []);

  const filteredEvents = React.useMemo(() => {
    const q = actorQuery.trim().toLowerCase();
    let out = events.filter((e) => {
      if (selectedTypes.size > 0 && !selectedTypes.has(e.event_type)) return false;
      if (severity !== 'all' && (e.severity ?? 'info') !== severity) return false;
      if (
        q &&
        !(e.actor?.username ?? '').toLowerCase().includes(q) &&
        !(e.actor?.role ?? '').toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });

    // QA persona: when pinning SANDBOX_RUN, surface only sandbox runs +
    // events within a 10-minute window around failed sandbox runs.
    if (persona === 'qa' && pinSandbox) {
      const failed = out.filter(
        (e) =>
          e.event_type === 'SANDBOX_RUN' &&
          (e.severity === 'error' ||
            String(e.event_details?.['status'] ?? '').toLowerCase() === 'failed'),
      );
      const windows = failed.map((f) => new Date(f.timestamp).getTime());
      const TEN_MIN = 10 * 60 * 1000;
      out = out.filter((e) => {
        if (e.event_type === 'SANDBOX_RUN') return true;
        const t = new Date(e.timestamp).getTime();
        return windows.some((w) => Math.abs(w - t) <= TEN_MIN);
      });
    }

    // Newest first
    return out.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
  }, [events, selectedTypes, severity, actorQuery, persona, pinSandbox]);

  const groups = React.useMemo(() => groupByDay(filteredEvents), [filteredEvents]);

  // Lightweight CSS virtualization: when there are many events we render a
  // windowed slice based on scroll position. No external dep.
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = React.useState(0);
  const [viewportHeight, setViewportHeight] = React.useState(600);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => setScrollTop(el.scrollTop);
    const onResize = () => setViewportHeight(el.clientHeight || 600);
    onResize();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    return () => {
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const virtualize = filteredEvents.length > VIRTUALIZE_THRESHOLD;
  const startIdx = virtualize
    ? Math.max(0, Math.floor(scrollTop / ROW_ESTIMATE_PX) - 10)
    : 0;
  const endIdx = virtualize
    ? Math.min(
        filteredEvents.length,
        startIdx + Math.ceil(viewportHeight / ROW_ESTIMATE_PX) + 20,
      )
    : filteredEvents.length;

  // Build a flat ordered list of (group-header | row) entries so the windowed
  // render still respects day grouping.
  type Entry =
    | { kind: 'header'; key: string; label: string }
    | { kind: 'row'; key: string; event: AuditEvent };

  const flat: Entry[] = React.useMemo(() => {
    const list: Entry[] = [];
    for (const g of groups) {
      list.push({ kind: 'header', key: `h-${g.key}`, label: g.label });
      for (const ev of g.events) {
        list.push({ kind: 'row', key: ev.event_id, event: ev });
      }
    }
    return list;
  }, [groups]);

  const totalRowEntries = flat.filter((f) => f.kind === 'row').length;

  // Map row-entry indices for virtualization; headers ride along with their
  // first visible row.
  const visibleEntries = React.useMemo(() => {
    if (!virtualize) return flat;
    let rowSeen = 0;
    const out: Entry[] = [];
    let lastHeader: Entry | null = null;
    for (const entry of flat) {
      if (entry.kind === 'header') {
        lastHeader = entry;
        continue;
      }
      if (rowSeen >= startIdx && rowSeen < endIdx) {
        if (lastHeader) {
          out.push(lastHeader);
          lastHeader = null;
        }
        out.push(entry);
      }
      rowSeen += 1;
    }
    return out;
  }, [flat, virtualize, startIdx, endIdx]);

  const padTop = virtualize ? startIdx * ROW_ESTIMATE_PX : 0;
  const padBottom = virtualize
    ? Math.max(0, (totalRowEntries - endIdx) * ROW_ESTIMATE_PX)
    : 0;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <div
      className={cn(
        'flex flex-col rounded-lg border border-border bg-background',
        className,
      )}
    >
      {showFilters && (
        <FilterStrip
          allTypes={allTypes}
          selectedTypes={selectedTypes}
          onToggleType={toggleType}
          severity={severity}
          onSeverityChange={setSeverity}
          actorQuery={actorQuery}
          onActorQueryChange={setActorQuery}
          persona={persona}
          pinSandbox={pinSandbox}
          onPinSandboxChange={setPinSandbox}
        />
      )}

      <div
        ref={scrollRef}
        className="flex-1 overflow-auto"
        style={{
          maxHeight:
            typeof maxHeight === 'number' ? `${maxHeight}px` : maxHeight,
        }}
      >
        {error ? (
          <ErrorState message={error} />
        ) : isLoading ? (
          <LoadingState />
        ) : filteredEvents.length === 0 ? (
          <EmptyState />
        ) : (
          <ul role="list" className="relative">
            {padTop > 0 && <li aria-hidden style={{ height: padTop }} />}
            {visibleEntries.map((entry) => {
              if (entry.kind === 'header') {
                return (
                  <li
                    key={entry.key}
                    role="listitem"
                    aria-label={`Day group ${entry.label}`}
                    className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-background/95 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground backdrop-blur"
                  >
                    <Cog className="h-3 w-3 opacity-50" />
                    {entry.label}
                  </li>
                );
              }
              const ev = entry.event;
              const renderer =
                mergedRenderers[ev.event_type] ?? FALLBACK_RENDERER;
              return (
                <EventRow
                  key={entry.key}
                  event={ev}
                  renderer={renderer}
                  persona={persona}
                  onClick={onEventClick}
                />
              );
            })}
            {padBottom > 0 && <li aria-hidden style={{ height: padBottom }} />}
          </ul>
        )}
      </div>
    </div>
  );
}

// Default export keeps Next.js import ergonomics tidy for consumers.
export default EventTimeline;

// Re-export icons used by DEFAULT_RENDERERS for downstream registries that
// want to compose new entries with a matching visual style. Tree-shake friendly.
export const TimelineIcons = {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Circle,
  CpuIcon,
  FileCheck2,
  FlaskConical,
  GitBranch,
  PackageCheck,
  PauseCircle,
  PlayCircle,
  Rocket,
  Server,
  ShieldAlert,
  Skull,
  Sparkles,
  Trash2,
  UserPlus,
  UserX,
  XCircle,
  Zap,
};
