'use client';

/**
 * Explore & Design ▸ Catalog — the Sources | Products | All cataloging
 * sub-page (redesign spec §6, mockup 12-catalog). A clean grid of catalog
 * objects with SOURCE/PRODUCT badges, project + tag chips, quality/trust
 * mini-signals, facet filters and a DOCKED detail drawer. No mindmap, no
 * popups. Tab state syncs to ?tab= (per-tab URLs, no Suspense panels).
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';
import { routes } from '@/config/routes';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import EmptyState from '@/components/ui/EmptyState';
import CatalogCard from './components/CatalogCard';
import CatalogDetailDrawer from './components/CatalogDetailDrawer';
import CatalogGraphCanvas from './components/CatalogGraphCanvas';
import CatalogNodeCockpit from './components/CatalogNodeCockpit';
import type { CatalogGraphNode } from '@/app/services/catalog/graph';
import {
  useExploreCatalog,
  type CatalogItem,
} from './components/useExploreCatalog';

type CatalogTab = 'sources' | 'products' | 'all';

const TABS: Array<{ id: CatalogTab; label: string }> = [
  { id: 'sources', label: 'Sources' },
  { id: 'products', label: 'Products' },
  { id: 'all', label: 'All' },
];

function parseTab(raw: string | null): CatalogTab {
  return raw === 'sources' || raw === 'products' || raw === 'all' ? raw : 'all';
}

function fmtAvg(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : String(Math.round(v));
}

export default function ExploreDesignCatalogPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { trackFeatureClick } = useTrackEvent();

  const tab = parseTab(searchParams.get('tab'));
  const setTab = useCallback(
    (next: CatalogTab) => {
      router.replace(`${routes.exploreDesign.catalog}?tab=${next}`, { scroll: false });
      trackFeatureClick('ed_catalog_tab', { module: 'explore_design', tab: next });
    },
    [router, trackFeatureClick],
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

  // ── Center view: floating graph canvas (default) or classic grid ──────────
  const [view, setView] = useState<'canvas' | 'grid'>('canvas');

  // ── Docked detail drawer ───────────────────────────────────────────────────
  const [selected, setSelected] = useState<CatalogItem | null>(null);

  // Canvas node → the level-aware cockpit (same rail for schema/product/project;
  // all three are model/table based, so the axes never change shape).
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
  const inputClass =
    'rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200';

  return (
    <div className="p-4">
      {/* ── Header ── */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href={routes.exploreDesign.view}
            className="mb-1 inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
          >
            <ArrowLeft className="h-3 w-3" aria-hidden="true" />
            Explore &amp; Design
          </Link>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Catalog</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Sources, published data products and their tags — one governed inventory.
          </p>
        </div>

        <div className="flex items-center gap-4">
          <dl className="flex items-center gap-4 text-center">
            {[
              ['Trust', averages?.trust ?? averages?.trust_avg],
              ['Quality', averages?.quality ?? averages?.quality_avg],
              ['Governance', averages?.governance ?? averages?.governance_avg],
            ].map(([label, value]) => (
              <div key={String(label)}>
                <dt className="text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {String(label)}
                </dt>
                <dd className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                  {fmtAvg(value as number | null | undefined)}
                </dd>
              </div>
            ))}
          </dl>
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

      {/* ── Tabs ── */}
      <div
        role="tablist"
        aria-label="Catalog view"
        className="mb-3 flex gap-1 border-b border-slate-200 dark:border-slate-700"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'border-b-2 px-3 py-1.5 text-xs font-medium transition-colors',
              tab === t.id
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Facet filters ── */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
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
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-md border border-slate-200 p-0.5 text-[11px] dark:border-slate-700" role="group" aria-label="Center view">
            {(['canvas', 'grid'] as const).map((v) => (
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
          <span className="text-[11px] text-slate-400 dark:text-slate-500">
            {loading ? '…' : `${filtered.length} object(s)`}
          </span>
        </div>
      </div>

      {/* ── Honest degradation notes ── */}
      {(sourcesUnavailable || productsUnavailable) && (
        <p className="mb-3 rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-[11px] text-slate-500 dark:border-slate-600 dark:bg-slate-800/40 dark:text-slate-400">
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

      {/* ── Center (canvas | grid) + docked drawer ── */}
      <div className="flex gap-4">
        <div className="min-w-0 flex-1">
          {view === 'canvas' ? (
            <CatalogGraphCanvas key={graphNonce} onSelectNode={onSelectNode} />
          ) : loading && items.length === 0 ? (
            <div
              className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
              aria-hidden="true"
            >
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="h-28 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800"
                />
              ))}
            </div>
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
          ) : filtered.length === 0 ? (
            <EmptyState
              title="No catalog objects match"
              description={
                items.length === 0
                  ? 'Connect a source or publish a data product to populate the catalog.'
                  : 'Try clearing the search or filters.'
              }
            />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((item) => (
                <CatalogCard
                  key={item.id}
                  item={item}
                  selected={selected?.id === item.id}
                  onSelect={(i) => {
                    setSelected((prev) => (prev?.id === i.id ? null : i));
                    trackFeatureClick('ed_catalog_object_selected', {
                      module: 'explore_design',
                      kind: i.kind,
                    });
                  }}
                />
              ))}
            </div>
          )}
        </div>

        {view === 'canvas' && selectedNode ? (
          <CatalogNodeCockpit
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            onClassified={() => setGraphNonce((n) => n + 1)}
          />
        ) : selected ? (
          <div className="w-80 shrink-0">
            <CatalogDetailDrawer item={selected} onClose={() => setSelected(null)} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
