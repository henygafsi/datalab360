'use client';

/**
 * SourceQuickAccess — a compact, global "jump to a source" launcher.
 *
 * A small trigger (drop it in the app header / any global nav) that opens a
 * popover with the user's PINNED sources and RECENTLY-opened sources, plus a
 * searchable browse list of every connected source. Clicking a source routes to
 * the Source Catalog ( /sources ) — so users reach a source without first
 * drilling into the two source pages.
 *
 * Design notes:
 *  - Pinned & recent are persisted in localStorage (Jotai `atomWithStorage`,
 *    same pattern as useProjectContext) so they render INSTANTLY and SURVIVE a
 *    `getCatalogSources()` failure. The network fetch only feeds the optional
 *    "browse all" section; if it fails, that one section degrades to a quiet
 *    note while pinned/recent keep working (mirrors SourceAiSummary's ethos).
 *  - Honest counts: a missing schema/table count renders as "—", never `?? 0`.
 *  - This is a NAVIGATOR, not a selector. It does not emit SourceSelection
 *    (that is SourceHub's contract) and does not gate on permissions (pure
 *    navigation; the destination pages gate themselves).
 *
 * BRAND RULE: never emit "Kimi" / "Snowflake" / "Cortex". The raw connector
 * `type` is stored verbatim but ALWAYS neutralised at render time via
 * `neutralTypeLabel`, so even stale localStorage entries that carry a vendor
 * token are scrubbed before they reach the UI.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { atom, useAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import {
  Database,
  Server,
  Search,
  Pin,
  PinOff,
  ChevronRight,
  Plug,
  ExternalLink,
  AlertTriangle,
  Loader2,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { routes } from '@/config/routes';
import { getCatalogSources, type CatalogSourcesResponse } from '@/app/services/catalog';
import { getApiErrorMessage } from '@/lib/api-client';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/** A single connected-source entity from `GET /catalog/sources`. */
export type CatalogSource = CatalogSourcesResponse['sources'][number];

/** Lightweight, storage-safe shape kept in localStorage for pins / recents. */
export interface StoredSource {
  name: string;
  /** Raw connector type — neutralised at render, never trusted as-is. */
  type?: string;
  database?: string;
  schema_count?: number;
  table_count?: number;
}

export interface SourceQuickAccessProps {
  /** Extra classes on the outer wrapper. */
  className?: string;
  /** Popover horizontal alignment relative to the trigger. Default 'end'. */
  align?: 'start' | 'end';
  /** Trigger label. Default 'Sources'. */
  label?: string;
  /** Render only the icon trigger (no text label). */
  iconOnly?: boolean;
  /** Fired after a source is opened (e.g. to close a parent menu). */
  onNavigate?: (source: StoredSource) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RECENT_CAP = 8;
const PIN_CAP = 24;
const BROWSE_RENDER_CAP = 60;

/** Vendor tokens that must never reach the UI (CLAUDE.md brand rule). */
const FORBIDDEN_TOKENS = ['snowflake', 'cortex', 'kimi'];
const NATIVE_TOKENS = ['native', 'warehouse', 'internal', 'table', 'view', ''];

// ---------------------------------------------------------------------------
// Persisted atoms — shared across every mounted launcher, survive refresh.
// ---------------------------------------------------------------------------

const pinnedSourcesAtom = atomWithStorage<StoredSource[]>('d360_pinned_sources', []);
const recentSourcesAtom = atomWithStorage<StoredSource[]>('d360_recent_sources', []);

/** In-memory cache of the source universe so re-opening the panel is instant. */
const sourcesCacheAtom = atom<CatalogSourcesResponse | null>(null);

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

/** Stable identity for dedupe / pin lookup across both lists. */
function sourceKey(s: { name: string; database?: string }): string {
  return `${s.database ?? ''}::${s.name}`;
}

function toStored(s: CatalogSource | StoredSource): StoredSource {
  return {
    name: s.name,
    type: s.type,
    database: s.database,
    schema_count: s.schema_count,
    table_count: s.table_count,
  };
}

/** Brand-safe, title-cased label for any raw connector `type` token. */
export function neutralTypeLabel(type?: string | null): string {
  const t = (type ?? '').trim();
  const low = t.toLowerCase();
  if (FORBIDDEN_TOKENS.some((f) => low.includes(f))) return 'Data warehouse';
  if (NATIVE_TOKENS.includes(low)) return 'Data warehouse';
  if (low.includes('stage')) return 'Ingestion stage';
  return (
    t
      .split(/[\s._-]+/)
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ') || 'Data warehouse'
  );
}

/** Is this an external connector (vs the native data warehouse)? */
function isExternal(type?: string | null): boolean {
  const label = neutralTypeLabel(type);
  return label !== 'Data warehouse' && label !== 'Ingestion stage';
}

/** Honest count: 0 stays 0, only missing values become "—" (never `?? 0`). */
function fmtCount(n: number | undefined | null): string {
  return n === undefined || n === null ? '—' : n.toLocaleString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SourceQuickAccess({
  className,
  align = 'end',
  label = 'Sources',
  iconOnly = false,
  onNavigate,
}: SourceQuickAccessProps) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [pinned, setPinned] = useAtom(pinnedSourcesAtom);
  const [recent, setRecent] = useAtom(recentSourcesAtom);
  const [sourcesCache, setSourcesCache] = useAtom(sourcesCacheAtom);

  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const wrapRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const loadedRef = useRef(false);

  // --- Source universe fetch (lazy; only feeds the browse section) ----------
  const loadSources = useCallback(async () => {
    setBrowseLoading(true);
    setBrowseError(null);
    try {
      const res = await getCatalogSources();
      setSourcesCache(res);
    } catch (err) {
      // Never blanks the launcher — pinned/recent still render from storage.
      setBrowseError(getApiErrorMessage(err));
    } finally {
      // Mark the attempt done on BOTH paths so the auto-load effect fires at
      // most once per open. On failure the error note rests; the user-driven
      // "Try again" button calls loadSources() directly.
      loadedRef.current = true;
      setBrowseLoading(false);
    }
  }, [setSourcesCache]);

  // Fetch once on first open (or retry if a prior open failed).
  useEffect(() => {
    if (open && !loadedRef.current && !browseLoading) {
      void loadSources();
    }
  }, [open, browseLoading, loadSources]);

  // Focus the search box when the panel opens.
  useEffect(() => {
    if (open) {
      const id = window.setTimeout(() => searchRef.current?.focus(), 60);
      return () => window.clearTimeout(id);
    }
    setQuery('');
  }, [open]);

  // Close on outside-click + Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // --- Derived lists --------------------------------------------------------
  const pinnedKeys = useMemo(() => new Set(pinned.map(sourceKey)), [pinned]);
  const isPinned = useCallback((s: { name: string; database?: string }) => pinnedKeys.has(sourceKey(s)), [pinnedKeys]);

  // Recent minus anything currently pinned, so a source never shows twice.
  const recentVisible = useMemo(
    () => recent.filter((r) => !pinnedKeys.has(sourceKey(r))).slice(0, RECENT_CAP),
    [recent, pinnedKeys],
  );

  const browseResults = useMemo(() => {
    const all = sourcesCache?.sources ?? [];
    const q = query.trim().toLowerCase();
    const matches = q
      ? all.filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.database ?? '').toLowerCase().includes(q) ||
            neutralTypeLabel(s.type).toLowerCase().includes(q),
        )
      : all;
    return [...matches].sort((a, b) => a.name.localeCompare(b.name)).slice(0, BROWSE_RENDER_CAP);
  }, [sourcesCache, query]);

  // --- Actions --------------------------------------------------------------
  const togglePin = useCallback(
    (s: CatalogSource | StoredSource) => {
      const k = sourceKey(s);
      setPinned((prev) =>
        prev.some((p) => sourceKey(p) === k)
          ? prev.filter((p) => sourceKey(p) !== k)
          : [toStored(s), ...prev].slice(0, PIN_CAP),
      );
    },
    [setPinned],
  );

  const openSource = useCallback(
    (s: CatalogSource | StoredSource) => {
      const stored = toStored(s);
      // Push to the front of recent (dedupe, capped).
      const k = sourceKey(stored);
      setRecent((prev) => [stored, ...prev.filter((p) => sourceKey(p) !== k)].slice(0, RECENT_CAP));

      // Land on the Source Catalog. `source`/`database` are forward-compat hints
      // (the catalog page currently consumes only project params) — harmless,
      // and the user reliably lands on the catalog page.
      const params = new URLSearchParams();
      params.set('source', stored.name);
      if (stored.database) params.set('database', stored.database);
      router.push(`${routes.sources.catalog}?${params.toString()}`);

      setOpen(false);
      onNavigate?.(stored);
    },
    [router, setRecent, onNavigate],
  );

  const goTo = useCallback(
    (href: string) => {
      router.push(href);
      setOpen(false);
    },
    [router],
  );

  const hasQuickItems = pinned.length > 0 || recentVisible.length > 0;
  const panelLeftRight = align === 'end' ? 'right-0' : 'left-0';

  // -------------------------------------------------------------------------
  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Quick access to data sources"
        title="Quick access to data sources"
        className={cn(
          'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors',
          open
            ? 'border-indigo-300 bg-indigo-50 text-indigo-700 dark:border-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300'
            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700',
        )}
      >
        <Server className="h-4 w-4 shrink-0" aria-hidden />
        {!iconOnly && <span className="hidden sm:inline">{label}</span>}
        {pinned.length > 0 && (
          <span className="rounded-full bg-indigo-100 px-1.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-800/60 dark:text-indigo-200">
            {pinned.length}
          </span>
        )}
      </button>

      {/* Popover */}
      {open && (
        <div
          role="dialog"
          aria-label="Source quick access"
          className={cn(
            'absolute z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl shadow-slate-900/10 dark:border-slate-700 dark:bg-slate-900 dark:shadow-black/30',
            panelLeftRight,
          )}
        >
          {/* Search */}
          <div className="border-b border-slate-100 p-2.5 dark:border-slate-800">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search connected sources…"
                aria-label="Search connected sources"
                className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-7 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Scrollable body */}
          <div className="max-h-[60vh] overflow-y-auto">
            {/* When searching, show only browse results (pins/recent are name-scoped quick access). */}
            {!query && (
              <>
                {/* Pinned */}
                {pinned.length > 0 && (
                  <Section title="Pinned">
                    {pinned.map((s) => (
                      <SourceRow
                        key={`pin-${sourceKey(s)}`}
                        source={s}
                        pinned
                        onOpen={openSource}
                        onTogglePin={togglePin}
                      />
                    ))}
                  </Section>
                )}

                {/* Recent */}
                {recentVisible.length > 0 && (
                  <Section title="Recent">
                    {recentVisible.map((s) => (
                      <SourceRow
                        key={`recent-${sourceKey(s)}`}
                        source={s}
                        pinned={false}
                        onOpen={openSource}
                        onTogglePin={togglePin}
                      />
                    ))}
                  </Section>
                )}
              </>
            )}

            {/* Browse all (always available — cold-start path with no pins/recent) */}
            <Section title={query ? 'Results' : 'All sources'}>
              {browseLoading ? (
                <BrowseSkeleton />
              ) : browseError ? (
                <div className="px-3 py-3">
                  <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-500" aria-hidden />
                    <div className="flex-1">
                      <p>Couldn’t load the full source list.</p>
                      <button
                        type="button"
                        onClick={() => void loadSources()}
                        className="mt-1 font-medium text-indigo-600 hover:underline dark:text-indigo-400"
                      >
                        Try again
                      </button>
                    </div>
                  </div>
                </div>
              ) : browseResults.length === 0 ? (
                <div className="px-3 py-6 text-center">
                  <Database className="mx-auto mb-2 h-7 w-7 text-slate-300 dark:text-slate-600" aria-hidden />
                  {query ? (
                    <p className="text-xs text-slate-500 dark:text-slate-400">No sources match “{query}”.</p>
                  ) : (
                    <>
                      <p className="text-xs font-medium text-slate-600 dark:text-slate-300">No connected sources yet</p>
                      <p className="mt-0.5 text-[11px] text-slate-400">Connect a data source to get started.</p>
                    </>
                  )}
                </div>
              ) : (
                browseResults.map((s, i) => (
                  <SourceRow
                    key={`browse-${sourceKey(s)}-${i}`}
                    source={s}
                    pinned={isPinned(s)}
                    onOpen={openSource}
                    onTogglePin={togglePin}
                  />
                ))
              )}
            </Section>

            {/* First-run hint when there is literally nothing yet anywhere. */}
            {!query && !hasQuickItems && !browseLoading && !browseError && browseResults.length > 0 && (
              <p className="px-3 pb-2 text-[11px] text-slate-400">
                Tip: pin a source with the pin icon to keep it one click away.
              </p>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 dark:border-slate-800">
            <FooterLink
              icon={<ExternalLink className="h-3.5 w-3.5" />}
              label="Open catalog"
              onClick={() => goTo(routes.sources.catalog)}
            />
            <FooterLink
              icon={<Plug className="h-3.5 w-3.5" />}
              label="Connect a source"
              onClick={() => goTo(routes.connexion.dataSourceConnection)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-1.5">
      <p className="px-3 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
        {title}
      </p>
      {children}
    </div>
  );
}

function SourceRow({
  source,
  pinned,
  onOpen,
  onTogglePin,
}: {
  source: StoredSource;
  pinned: boolean;
  onOpen: (s: StoredSource) => void;
  onTogglePin: (s: StoredSource) => void;
}) {
  const external = isExternal(source.type);
  const typeLabel = neutralTypeLabel(source.type);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`Open ${source.name}`}
      onClick={() => onOpen(source)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(source);
        }
      }}
      className="group flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 transition-colors hover:bg-indigo-50/60 focus:outline-none focus-visible:bg-indigo-50/60 dark:hover:bg-indigo-900/15 dark:focus-visible:bg-indigo-900/15"
    >
      <span
        className={cn(
          'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
          external
            ? 'bg-orange-50 text-orange-500 dark:bg-orange-900/30 dark:text-orange-300'
            : 'bg-indigo-50 text-indigo-500 dark:bg-indigo-900/30 dark:text-indigo-300',
        )}
      >
        {external ? <Plug className="h-3.5 w-3.5" /> : <Database className="h-3.5 w-3.5" />}
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium text-slate-800 dark:text-slate-100">{source.name}</p>
        <p className="truncate text-[11px] text-slate-400 dark:text-slate-500">
          {typeLabel}
          {source.database ? ` · ${source.database}` : ''}
          {source.schema_count !== undefined || source.table_count !== undefined
            ? ` · ${fmtCount(source.schema_count)} schemas · ${fmtCount(source.table_count)} tables`
            : ''}
        </p>
      </div>

      {/* Pin toggle — stop propagation so it never triggers navigation. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onTogglePin(source);
        }}
        aria-label={pinned ? `Unpin ${source.name}` : `Pin ${source.name}`}
        aria-pressed={pinned}
        title={pinned ? 'Unpin' : 'Pin'}
        className={cn(
          'shrink-0 rounded-md p-1 transition-colors',
          pinned
            ? 'text-indigo-500 hover:bg-indigo-100 dark:text-indigo-300 dark:hover:bg-indigo-800/40'
            : 'text-slate-300 opacity-0 hover:bg-slate-100 hover:text-slate-500 focus-visible:opacity-100 group-hover:opacity-100 dark:text-slate-600 dark:hover:bg-slate-800',
        )}
      >
        {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
      </button>

      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-300 dark:text-slate-600" aria-hidden />
    </div>
  );
}

function FooterLink({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-indigo-600 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-indigo-300"
    >
      {icon}
      {label}
    </button>
  );
}

function BrowseSkeleton() {
  return (
    <div className="space-y-1 px-3 py-1">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2.5 py-1.5">
          <div className="h-7 w-7 shrink-0 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 w-2/3 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-2 w-1/2 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          </div>
        </div>
      ))}
    </div>
  );
}
