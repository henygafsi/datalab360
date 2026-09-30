'use client';

/**
 * DomainAvailabilityMatrix — compact "domain → availability" matrix, the
 * centerpiece of the Account overview screen.
 *
 * Renders one cell per reporting domain from the B1 `availability` block
 * (see ./meta.ts). Semantic status colors only: emerald = ready, amber =
 * attention / in progress, red = failed, slate = unknown / neutral.
 * Emerald is NEVER used outside the `ready` state.
 */

import EmptyState from '@/components/ui/EmptyState';
import {
  AvailabilityBlock,
  DomainAvailability,
  DOMAIN_LABELS,
  formatAge,
} from './meta';

export interface DomainAvailabilityMatrixProps {
  availability: AvailabilityBlock | null;
  loading?: boolean;
  isAdmin?: boolean;
  onDomainClick?: (domainKey: string) => void;
  onInstall?: (domainKey: string, installEndpoint: string) => void;
  className?: string;
}

const GRID_CLASS = 'grid grid-cols-1 gap-1.5 md:grid-cols-2';

/** Sentence-case fallback label for domains missing from DOMAIN_LABELS. */
function humanizeKey(key: string): string {
  const words = key.replace(/[_-]+/g, ' ').trim();
  if (!words) return key;
  return words.charAt(0).toUpperCase() + words.slice(1).toLowerCase();
}

/** Age in seconds — prefers the explicit field, else derives from computed_at. */
function effectiveAgeSeconds(d: DomainAvailability): number | null {
  if (d.age_seconds != null && Number.isFinite(d.age_seconds)) return d.age_seconds;
  if (d.computed_at) {
    const t = Date.parse(d.computed_at);
    if (!Number.isNaN(t)) return Math.max(0, (Date.now() - t) / 1000);
  }
  return null;
}

interface CellPresentation {
  dotClass: string;
  text: string;
  textClass: string;
  dashedBorder: boolean;
  showInstall: boolean;
}

function presentDomain(d: DomainAvailability): CellPresentation {
  // In-progress wins over the nominal state (a ready domain can be refreshing).
  if (d.state === 'preparing' || d.refreshing) {
    return {
      dotClass: 'bg-amber-500 animate-pulse',
      text: 'Preparing…',
      textClass: 'text-slate-500 dark:text-slate-400',
      dashedBorder: false,
      showInstall: false,
    };
  }
  switch (d.state) {
    case 'ready': {
      const age = formatAge(effectiveAgeSeconds(d)) ?? '—';
      return d.stale
        ? {
            dotClass: 'bg-emerald-500',
            text: `Updated ${age} ago (stale)`,
            textClass: 'text-amber-600 dark:text-amber-500',
            dashedBorder: false,
            showInstall: false,
          }
        : {
            dotClass: 'bg-emerald-500',
            text: `Updated ${age} ago`,
            textClass: 'text-slate-500 dark:text-slate-400',
            dashedBorder: false,
            showInstall: false,
          };
    }
    case 'cold':
      return {
        dotClass: 'bg-amber-400',
        text: 'Loads on first visit',
        textClass: 'text-slate-500 dark:text-slate-400',
        dashedBorder: false,
        showInstall: false,
      };
    case 'unconfigured':
      return {
        dotClass: 'bg-slate-300 dark:bg-slate-600',
        text: 'Not set up',
        textClass: 'text-slate-500 dark:text-slate-400',
        dashedBorder: true,
        showInstall: true,
      };
    case 'failed':
      return {
        dotClass: 'bg-red-500',
        text: 'Last update failed',
        textClass: 'text-red-600 dark:text-red-400',
        dashedBorder: false,
        showInstall: false,
      };
    default:
      return {
        dotClass: 'bg-slate-300 dark:bg-slate-600',
        text: 'No signal',
        textClass: 'text-slate-500 dark:text-slate-400',
        dashedBorder: false,
        showInstall: false,
      };
  }
}

/** The only place source/cache internals may surface: the hover title. */
function cellTitle(d: DomainAvailability): string | undefined {
  const parts: string[] = [];
  if (d.source) parts.push(`Source: ${d.source}`);
  if (d.cache_key) parts.push(`Cache: ${d.cache_key}`);
  if (d.reason) parts.push(`Reason: ${d.reason}`);
  return parts.length > 0 ? parts.join('\n') : undefined;
}

function DomainCell({
  domainKey,
  domain,
  isAdmin,
  onDomainClick,
  onInstall,
}: {
  domainKey: string;
  domain: DomainAvailability;
  isAdmin: boolean;
  onDomainClick?: (domainKey: string) => void;
  onInstall?: (domainKey: string, installEndpoint: string) => void;
}) {
  const label = DOMAIN_LABELS[domainKey] ?? humanizeKey(domainKey);
  const p = presentDomain(domain);
  const title = cellTitle(domain);
  const installEndpoint = domain.install_endpoint;
  const canInstall = p.showInstall && isAdmin && !!installEndpoint && !!onInstall;

  const cellClass = [
    // Single-line cell — 15 domains must fit the fold at 1366×768.
    'flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left',
    p.dashedBorder ? 'border-dashed' : '',
    'border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
    onDomainClick
      ? 'w-full transition-colors hover:border-slate-300 dark:hover:border-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500'
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  const install = canInstall ? (
    <span
      role="button"
      tabIndex={0}
      className="shrink-0 text-[11px] font-medium text-accent-600 hover:text-accent-700 dark:text-accent-400 dark:hover:text-accent-300"
      onClick={(e) => {
        e.stopPropagation();
        onInstall?.(domainKey, installEndpoint as string);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          onInstall?.(domainKey, installEndpoint as string);
        }
      }}
    >
      Set up
    </span>
  ) : null;

  const inner = (
    <>
      <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${p.dotClass}`} />
      <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700 dark:text-slate-200">
        {label}
      </span>
      <span className={`shrink-0 truncate text-[11px] leading-4 tabular-nums ${p.textClass}`}>
        {p.text}
      </span>
      {install}
    </>
  );

  if (onDomainClick) {
    return (
      <button
        type="button"
        title={title}
        className={cellClass}
        onClick={() => onDomainClick(domainKey)}
      >
        {inner}
      </button>
    );
  }
  return (
    <div title={title} className={cellClass}>
      {inner}
    </div>
  );
}

export default function DomainAvailabilityMatrix({
  availability,
  loading = false,
  isAdmin = false,
  onDomainClick,
  onInstall,
  className = '',
}: DomainAvailabilityMatrixProps) {
  if (loading && !availability) {
    return (
      <div className={`${GRID_CLASS} ${className}`} role="status" aria-label="Loading availability">
        {Array.from({ length: 12 }).map((_, i) => (
          <div
            key={i}
            className="h-[30px] animate-pulse rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/60"
          />
        ))}
      </div>
    );
  }

  if (!availability) {
    return (
      <EmptyState
        compact
        title="Availability unknown"
        description="The account snapshot has not been published yet."
        className={className}
      />
    );
  }

  const domains = availability.domains ?? {};
  const orderedKeys = [
    ...Object.keys(DOMAIN_LABELS).filter((k) => k in domains),
    ...Object.keys(domains).filter((k) => !(k in DOMAIN_LABELS)),
  ];

  if (orderedKeys.length === 0) {
    return (
      <EmptyState
        compact
        title="Availability unknown"
        description="The account snapshot has not been published yet."
        className={className}
      />
    );
  }

  return (
    <div className={`${GRID_CLASS} ${className}`}>
      {orderedKeys.map((key) => (
        <DomainCell
          key={key}
          domainKey={key}
          domain={domains[key]}
          isAdmin={isAdmin}
          onDomainClick={onDomainClick}
          onInstall={onInstall}
        />
      ))}
    </div>
  );
}

/**
 * CoverageKpi — text fragment for the KPI header: "{ready}/{total} domains ready".
 * Calculation is inline for now; swap to `availabilitySummary` from
 * services/command-center/availability.ts once that module lands.
 */
export function CoverageKpi({ availability }: { availability: AvailabilityBlock | null }) {
  if (!availability) return <>—</>;
  const states = Object.values(availability.domains ?? {});
  const total = states.length;
  if (total === 0) return <>—</>;
  const ready = states.filter((d) => d.state === 'ready').length;
  return (
    <span className="tabular-nums">
      {ready}/{total} domains ready
    </span>
  );
}
