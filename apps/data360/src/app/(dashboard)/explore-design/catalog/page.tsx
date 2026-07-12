'use client';

/**
 * Explore & Design ▸ Catalog — viewport-fit master console (redesign 2026-07).
 *
 * ONE page, NO page scroll: a compact header row, a per-axis summary strip
 * (real /catalog/scores rollup — quality · governance · modeling · finops ·
 * ml-ready · trust), then a MASTER TABLE of catalog objects (default) with a
 * docked drill-in drawer, or the floating graph canvas as the alternate view.
 * Inner regions scroll; the page itself never does. Tab state stays local
 * (instant switch, ?tab= synced via history.replaceState — no navigation).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Boxes,
  ChevronLeft,
  ChevronRight,
  Database,
  Package,
  RefreshCw,
  Search,
  SlidersHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { routes } from '@/config/routes';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import EmptyState from '@/components/ui/EmptyState';
import CatalogDetailDrawer from './components/CatalogDetailDrawer';
import CatalogGraphCanvas from './components/CatalogGraphCanvas';
import CatalogNodeCockpit from './components/CatalogNodeCockpit';
import type { CatalogGraphNode } from '@/app/services/catalog/graph';
import {
  useExploreCatalog,
  type CatalogItem,
} from './components/useExploreCatalog';

type CatalogTab = 'sources' | 'products' | 'all';
type ViewMode = 'table' | 'canvas';
type SortKey = 'name' | 'kind' | 'tables' | 'quality' | 'trust';

const TABS: Array<{ id: CatalogTab; label: string }> = [
  { id: 'sources', label: 'Sources' },
  { id: 'products', label: 'Products' },
  { id: 'all', label: 'All' },
];

const PAGE_SIZES = [12, 24, 48] as const;

/** The scanned goal axes of the /catalog/scores rollup, in board order. */
const SCORE_AXES: Array<{ key: string; label: string }> = [
  { key: 'quality', label: 'Quality' },
  { key: 'governance', label: 'Governance' },
  { key: 'modeling', label: 'Modeling' },
  { key: 'finops', label: 'FinOps' },
  { key: 'ml_ready', label: 'ML ready' },
  { key: 'trust', label: 'Trust' },
];

function parseTab(raw: string | null): CatalogTab {
  return raw === 'sources' || raw === 'products' || raw === 'all' ? raw : 'all';
}

function bucket(v: number | null | undefined): 'critical' | 'warn' | 'healthy' | 'none' {
  if (v === null || v === undefined) return 'none';
  if (v < 40) return 'critical';
  if (v < 70) return 'warn';
  return 'healthy';
}

const BUCKET_TEXT: Record<string, string> = {
  critical: 'text-red-600 dark:text-red-400',
  warn: 'text-amber-600 dark:text-amber-400',
  healthy: 'text-emerald-600 dark:text-emerald-400',
  none: 'text-slate-400 dark:text-slate-500',
};

const BUCKET_BAR: Record<string, string> = {
  critical: 'bg-red-500',
  warn: 'bg-amber-500',
  healthy: 'bg-emerald-500',
  none: 'bg-slate-300 dark:bg-slate-600',
};

const BUCKET_WORD: Record<string, string> = {
  critical: 'Critical',
  warn: 'Watch',
  healthy: 'Healthy',
  none: 'Not scanned',
};

function fmtScore(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : String(Math.round(v));
}

function fmtCount(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : v.toLocaleString();
}

/** One per-axis highlight card of the summary strip. */
function AxisCard({
  label,
  value,
  loading,
  sub,
}: {
  label: string;
  value: number | null | undefined;
  loading: boolean;
  sub?: string;
}) {
  const b = bucket(value);
  return (
    <div className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {label}
        </span>
        {loading ? (
          <span className="h-5 w-8 animate-pulse rounded bg-slate-100 dark:bg-slate-800" aria-hidden="true" />
        ) : (
          <span className={cn('text-lg font-semibold leading-5 tabular-nums', BUCKET_TEXT[b])}>
            {fmtScore(value)}
          </span>
        )}
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true">
        {!loading && value !== null && value !== undefined && (
          <div
            className={cn('h-full rounded-full', BUCKET_BAR[b])}
            style={{ width: `${Math.max(2, Math.min(100, value))}%` }}
          />
        )}
      </div>
      <p className="mt-1 truncate text-[10px] text-slate-400 dark:text-slate-500">
        {loading ? '…' : sub ?? BUCKET_WORD[b]}
      </p>
    </div>
  );
}

function KindBadge({ kind }: { kind: CatalogItem['kind'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        kind === 'product'
          ? 'bg-violet-50 text-violet-700 dark:bg-violet-500/10 dark:text-violet-300'
          : 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
      )}
    >
      {kind === 'product' ? (
        <Package className="h-2.5 w-2.5" aria-hidden="true" />
      ) : (
        <Database className="h-2.5 w-2.5" aria-hidden="true" />
      )}
      {kind}
    </span>
  );
}

function ScoreCell({ value }: { value: number | null }) {
  const b = bucket(value);
  return <span className={cn('font-medium tabular-nums', BUCKET_TEXT[b])}>{fmtScore(value)}</span>;
}

export default function ExploreDesignCatalogPage() {
  const searchParams = useSearchParams();
  const { trackFeatureClick } = useTrackEvent();

  // ?tab= is parsed ONCE on mount (deep links keep working); switches are
  // pure state + history.replaceState — no navigation, no remount.
  const [tab, setTabState] = useState<CatalogTab>(() => parseTab(searchParams.get('tab')));
  const setTab = useCallback(
    (next: CatalogTab) => {
      setTabState(next);
      window.history.replaceState(null, '', `?tab=${next}`);
      trackFeatureClick('ed_catalog_tab', { module: 'explore_design', tab: next });
    },
    [trackFeatureClick],
  );

  const {
    items,
    scores,
    loading,
    error,
    sourcesUnavailable,
    productsUnavailable,
    refresh,
  } = useExploreCatalog();

  // ── Facet filters ──────────────────────────────────────────────────────────
  const [query, setQuery] = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');

  const projects = useMemo(
    () =>
      Array.from(new Set(items.map((i) => i.projectLabel).filter(Boolean) as string[])).sort(),
    [items],
  );
  const tags = useMemo(
    () => Array.from(new Set(items.flatMap((i) => i.tags))).sort(),
    [items],
  );

  const counts = useMemo(
    () => ({
      sources: items.filter((i) => i.kind === 'source').length,
      products: items.filter((i) => i.kind === 'product').length,
      all: items.length,
    }),
    [items],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (tab === 'sources' && i.kind !== 'source') return false;
      if (tab === 'products' && i.kind !== 'product') return false;
      if (q && !i.name.toLowerCase().includes(q)) return false;
      if (projectFilter && i.projectLabel !== projectFilter) return false;
      if (tagFilter && !i.tags.includes(tagFilter)) return false;
      return true;
    });
  }, [items, tab, query, projectFilter, tagFilter]);

  // ── Sort (master table) ────────────────────────────────────────────────────
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const onSort = useCallback((k: SortKey) => {
    setSortKey((prev) => {
      if (prev === k) {
        setSortAsc((a) => !a);
        return prev;
      }
      setSortAsc(k === 'name' || k === 'kind');
      return k;
    });
  }, []);

  const sorted = useMemo(() => {
    const dir = sortAsc ? 1 : -1;
    const val = (i: CatalogItem): string | number => {
      switch (sortKey) {
        case 'kind':
          return i.kind;
        case 'tables':
          return i.tableCount ?? -1;
        case 'quality':
          return i.qualityScore ?? -1;
        case 'trust':
          return i.trustScore ?? -1;
        default:
          return i.name.toLowerCase();
      }
    };
    return [...filtered].sort((a, b) => {
      const va = val(a);
      const vb = val(b);
      if (va < vb) return -dir;
      if (va > vb) return dir;
      return 0;
    });
  }, [filtered, sortKey, sortAsc]);

  // ── Master pagination ──────────────────────────────────────────────────────
  const [pageSize, setPageSize] = useState<number>(24);
  const [page, setPage] = useState(1);
  useEffect(() => {
    setPage(1);
  }, [tab, query, projectFilter, tagFilter, pageSize]);
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const paged = useMemo(
    () => sorted.slice((safePage - 1) * pageSize, safePage * pageSize),
    [sorted, safePage, pageSize],
  );

  // ── Center view: master table (default) | floating graph canvas ───────────
  const [view, setView] = useState<ViewMode>('table');

  // ── Docked drill-ins ───────────────────────────────────────────────────────
  const [selected, setSelected] = useState<CatalogItem | null>(null);
  const [selectedNode, setSelectedNode] = useState<CatalogGraphNode | null>(null);
  const [graphNonce, setGraphNonce] = useState(0);
  const onSelectNode = useCallback(
    (node: CatalogGraphNode) => {
      setSelectedNode(node);
      setSelected(null);
      trackFeatureClick('ed_catalog_graph_node', {
        module: 'explore_design',
        kind: node.kind,
        schema_type: node.schema_type ?? null,
      });
    },
    [trackFeatureClick],
  );
  useEffect(() => {
    // Drop the selection if it filtered out of view (honest sync).
    if (selected && !filtered.some((i) => i.id === selected.id)) setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered]);

  const averages = scores?.averages;
  const scoredObjects = scores?.scored_objects;
  const inputClass =
    'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200';

  const thClass =
    'sticky top-0 z-10 whitespace-nowrap border-b border-slate-200 bg-slate-50/95 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-wide text-slate-400 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-500';

  const sortHint = (k: SortKey) => (sortKey === k ? (sortAsc ? ' ▲' : ' ▼') : '');

  return (
    <div className="flex h-[calc(100dvh-224px)] min-h-[540px] flex-col gap-3 overflow-hidden">
      {/* ── Row 1: compact header — identity · tabs · view toggle ── */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex items-center gap-3">
          <Link
            href={routes.exploreDesign.view}
            aria-label="Back to Explore & Design"
            className="rounded-md border border-slate-200 p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-600 dark:border-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
          <div>
            <h1 className="text-base font-semibold leading-5 text-slate-900 dark:text-white">Catalog</h1>
            <p className="text-[11px] leading-4 text-slate-500 dark:text-slate-400">
              Sources, published data products and their tags — one governed inventory.
            </p>
          </div>
        </div>

        <div
          role="tablist"
          aria-label="Catalog view"
          className="flex gap-1 rounded-lg border border-slate-200 p-0.5 dark:border-slate-700"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition-colors',
                tab === t.id
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
              )}
            >
              {t.label}
              <span
                className={cn(
                  'ml-1 tabular-nums',
                  tab === t.id ? 'text-blue-100' : 'text-slate-400 dark:text-slate-500',
                )}
              >
                {loading ? '…' : counts[t.id]}
              </span>
            </button>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div
            className="flex rounded-md border border-slate-200 p-0.5 text-[11px] dark:border-slate-700"
            role="group"
            aria-label="Center view"
          >
            {(['table', 'canvas'] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={cn(
                  'rounded px-2 py-0.5 font-medium capitalize transition-colors',
                  view === v
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400',
                )}
              >
                {v}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            aria-label="Refresh catalog"
            title="Refresh catalog"
            className="rounded-md border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* ── Row 2: per-axis summary strip (real /catalog/scores rollup) ── */}
      <section aria-label="Catalog score highlights" className="flex gap-2 overflow-x-auto">
        {SCORE_AXES.map((a) => (
          <AxisCard
            key={a.key}
            label={a.label}
            value={(averages as Record<string, number | null> | undefined)?.[a.key]}
            loading={loading && !scores}
            sub={
              a.key === 'trust' && scoredObjects !== undefined
                ? `${fmtCount(scoredObjects)} object(s) scanned`
                : undefined
            }
          />
        ))}
      </section>

      {/* ── Row 3: filters ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search objects…"
            aria-label="Search catalog objects"
            className={cn(inputClass, 'w-56 pl-7')}
          />
        </div>
        <select
          value={projectFilter}
          onChange={(e) => setProjectFilter(e.target.value)}
          aria-label="Filter by project"
          className={inputClass}
        >
          <option value="">All projects</option>
          {projects.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select
          value={tagFilter}
          onChange={(e) => setTagFilter(e.target.value)}
          aria-label="Filter by tag"
          className={inputClass}
        >
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <span className="ml-auto text-[11px] text-slate-400 dark:text-slate-500">
          {loading ? '…' : `${filtered.length} object(s)`}
        </span>
      </div>

      {/* ── Honest degradation notes ── */}
      {(sourcesUnavailable || productsUnavailable) && (
        <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500 dark:border-slate-600 dark:bg-slate-800/40 dark:text-slate-400">
          {[
            sourcesUnavailable ? 'The sources inventory' : null,
            productsUnavailable ? 'The data-product catalog' : null,
          ]
            .filter(Boolean)
            .join(' and ')}{' '}
          {sourcesUnavailable && productsUnavailable ? 'are' : 'is'} not available yet on this
          environment.
        </p>
      )}

      {/* ── Row 4: master area (fills the rest — inner scroll only) ── */}
      <div className="flex min-h-0 flex-1 gap-3">
        <div className="flex min-w-0 flex-1 flex-col">
          {view === 'canvas' ? (
            <CatalogGraphCanvas key={graphNonce} onSelectNode={onSelectNode} className="h-full min-h-0" />
          ) : error ? (
            <EmptyState
              icon={SlidersHorizontal}
              title="Catalog could not be loaded"
              description={error}
              action={
                <button
                  type="button"
                  onClick={refresh}
                  className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
                >
                  Retry
                </button>
              }
            />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              <div className="min-h-0 flex-1 overflow-auto">
                <table className="w-full border-separate border-spacing-0 text-xs">
                  <thead>
                    <tr>
                      <th className={thClass}>
                        <button type="button" onClick={() => onSort('name')} className="uppercase tracking-wide">
                          Object{sortHint('name')}
                        </button>
                      </th>
                      <th className={thClass}>
                        <button type="button" onClick={() => onSort('kind')} className="uppercase tracking-wide">
                          Kind{sortHint('kind')}
                        </button>
                      </th>
                      <th className={thClass}>Status / Type</th>
                      <th className={thClass}>Owner</th>
                      <th className={thClass}>Domain / DB</th>
                      <th className={cn(thClass, 'text-right')}>Schemas</th>
                      <th className={cn(thClass, 'text-right')}>
                        <button type="button" onClick={() => onSort('tables')} className="uppercase tracking-wide">
                          Tables{sortHint('tables')}
                        </button>
                      </th>
                      <th className={cn(thClass, 'text-right')}>
                        <button type="button" onClick={() => onSort('quality')} className="uppercase tracking-wide">
                          Quality{sortHint('quality')}
                        </button>
                      </th>
                      <th className={cn(thClass, 'text-right')}>
                        <button type="button" onClick={() => onSort('trust')} className="uppercase tracking-wide">
                          Trust{sortHint('trust')}
                        </button>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading && items.length === 0 ? (
                      Array.from({ length: 8 }).map((_, i) => (
                        <tr key={i} aria-hidden="true">
                          <td colSpan={9} className="border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                            <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
                          </td>
                        </tr>
                      ))
                    ) : paged.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-10">
                          <EmptyState
                            title="No catalog objects match"
                            description={
                              items.length === 0
                                ? 'Connect a source or publish a data product to populate the catalog.'
                                : 'Try clearing the search or filters.'
                            }
                          />
                        </td>
                      </tr>
                    ) : (
                      paged.map((item) => {
                        const status =
                          item.kind === 'product' ? item.product?.status ?? null : item.source?.type ?? null;
                        const owner =
                          item.kind === 'product'
                            ? item.product?.owner ?? null
                            : item.source?.owner ?? null;
                        const isSel = selected?.id === item.id;
                        return (
                          <tr
                            key={item.id}
                            aria-selected={isSel}
                            onClick={() => {
                              setSelected((prev) => (prev?.id === item.id ? null : item));
                              setSelectedNode(null);
                              trackFeatureClick('ed_catalog_object_selected', {
                                module: 'explore_design',
                                kind: item.kind,
                              });
                            }}
                            className={cn(
                              'cursor-pointer transition-colors',
                              isSel
                                ? 'bg-blue-50/70 dark:bg-blue-500/10'
                                : 'hover:bg-slate-50 dark:hover:bg-slate-800/50',
                            )}
                          >
                            <td className="max-w-[220px] border-b border-slate-100 px-3 py-1.5 dark:border-slate-800">
                              <span className="flex items-center gap-1.5">
                                <Boxes
                                  className="h-3 w-3 shrink-0 text-slate-300 dark:text-slate-600"
                                  aria-hidden="true"
                                />
                                <span
                                  className="truncate font-medium text-slate-800 dark:text-slate-100"
                                  title={item.name}
                                >
                                  {item.name || '(unnamed)'}
                                </span>
                              </span>
                            </td>
                            <td className="border-b border-slate-100 px-3 py-1.5 dark:border-slate-800">
                              <KindBadge kind={item.kind} />
                            </td>
                            <td className="border-b border-slate-100 px-3 py-1.5 text-slate-600 dark:border-slate-800 dark:text-slate-300">
                              {status ?? '—'}
                            </td>
                            <td className="max-w-[140px] truncate border-b border-slate-100 px-3 py-1.5 text-slate-600 dark:border-slate-800 dark:text-slate-300">
                              {owner ?? '—'}
                            </td>
                            <td className="max-w-[160px] truncate border-b border-slate-100 px-3 py-1.5 text-slate-600 dark:border-slate-800 dark:text-slate-300">
                              {item.projectLabel ?? '—'}
                            </td>
                            <td className="border-b border-slate-100 px-3 py-1.5 text-right tabular-nums text-slate-600 dark:border-slate-800 dark:text-slate-300">
                              {fmtCount(item.schemaCount)}
                            </td>
                            <td className="border-b border-slate-100 px-3 py-1.5 text-right tabular-nums text-slate-600 dark:border-slate-800 dark:text-slate-300">
                              {fmtCount(item.tableCount)}
                            </td>
                            <td className="border-b border-slate-100 px-3 py-1.5 text-right dark:border-slate-800">
                              <ScoreCell value={item.qualityScore} />
                            </td>
                            <td className="border-b border-slate-100 px-3 py-1.5 text-right dark:border-slate-800">
                              <ScoreCell value={item.trustScore} />
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              {/* Master pagination — table footer, always visible */}
              <nav
                aria-label="Catalog pagination"
                className="flex items-center justify-between gap-3 border-t border-slate-200 px-3 py-1.5 dark:border-slate-700"
              >
                <label className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                  Per page
                  <select
                    value={pageSize}
                    onChange={(e) => setPageSize(Number(e.target.value))}
                    aria-label="Objects per page"
                    className={inputClass}
                  >
                    {PAGE_SIZES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    aria-label="Previous page"
                    className="rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <span
                    aria-current="page"
                    className="text-[11px] tabular-nums text-slate-500 dark:text-slate-400"
                  >
                    Page {safePage} / {pageCount}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                    disabled={safePage >= pageCount}
                    aria-label="Next page"
                    className="rounded-md border border-slate-200 p-1 text-slate-500 hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
                <span className="text-[11px] tabular-nums text-slate-400 dark:text-slate-500">
                  {sorted.length === 0
                    ? '0 object(s)'
                    : `Showing ${(safePage - 1) * pageSize + 1}–${Math.min(
                        safePage * pageSize,
                        sorted.length,
                      )} of ${sorted.length}`}
                </span>
              </nav>
            </div>
          )}
        </div>

        {/* Docked drill-in: canvas node cockpit or master-table drawer */}
        {view === 'canvas' && selectedNode ? (
          <div className="min-h-0 overflow-y-auto">
            <CatalogNodeCockpit
              node={selectedNode}
              onClose={() => setSelectedNode(null)}
              onClassified={() => setGraphNonce((n) => n + 1)}
            />
          </div>
        ) : selected ? (
          <div className="w-80 shrink-0 overflow-y-auto">
            <CatalogDetailDrawer item={selected} onClose={() => setSelected(null)} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
