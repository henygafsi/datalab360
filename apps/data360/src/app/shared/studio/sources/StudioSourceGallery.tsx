'use client';

/**
 * StudioSourceGallery — the AI-first source PICKER (Final UX pass).
 *
 * Not a table of choices and not a long list: an intent bar, up to three
 * relevant proposals, then collapsible CATEGORIES (one per connector
 * family, each with an icon and a one-line summary from the backend's
 * by_family tally — no load to summarize), and inside each a PAGINATED
 * gallery of source cards. Selection is a controlled Set that stays
 * stable across pages, categories and search. Reading a family, opening
 * a card or turning a page costs nothing (metadata + persisted state):
 * it survives the warehouse-credit block.
 *
 * Honesty: statuses are the real catalog statuses ('ready'/'to
 * configure'/…), never invented; a proposal shows the content-scan role
 * it was given, marked as inferred; nothing is auto-selected beyond the
 * proposals the user accepts.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Boxes,
  Cloud,
  Database,
  Plug,
  Radio,
  Search,
  Share2,
  Sparkles,
  Table2,
  Waypoints,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  getStudioSources,
  getStudioSourcesCatalogFull,
  type CatalogByFamily,
  type CatalogConnector,
  type StudioSource,
} from '@/app/services/studio/studio-api';
import { STATUS_LABELS, familyLabel, neutralLabel } from '@/app/shared/studio/sources/sources-kit';
import { ConnectorLogo } from '@/app/shared/studio/sources/ConnectorLogo';

const PAGE_SIZE = 9;

const FAMILY_ICON: Record<string, LucideIcon> = {
  warehouse: Database,
  database: Database,
  object_storage: Cloud,
  cloud_storage: Cloud,
  saas_application: Boxes,
  api: Plug,
  events: Radio,
  media: Share2,
};
function familyIcon(family?: string): LucideIcon {
  return FAMILY_ICON[family ?? ''] ?? Waypoints;
}

/** One selectable source card — a warehouse database or a connector. */
export interface GallerySource {
  id: string; // 'sf:db:<DB>' for a database, connector label for a connector
  kind: 'database' | 'connector';
  label: string;
  family: string;
  status: string; // available | to_configure | partial | not_integrated
}

export interface SourceProposal {
  id: string;
  label: string;
  relevance?: string;
  role?: string;
  why?: string;
}

function statusPill(status: string) {
  const s = STATUS_LABELS[status] ?? STATUS_LABELS.to_configure;
  return <span className={`shrink-0 text-xs ${s.tone}`}>{s.label}</span>;
}

/* ── one paginated category ─────────────────────────────────────────── */

function Category({
  family,
  items,
  summary,
  open,
  onToggleOpen,
  selected,
  onToggleSelect,
  onConfigure,
  query,
}: {
  family: string;
  items: GallerySource[];
  summary: string;
  open: boolean;
  onToggleOpen: () => void;
  selected: Set<string>;
  onToggleSelect: (s: GallerySource) => void;
  onConfigure?: (s: GallerySource) => void;
  query: string;
}) {
  const [page, setPage] = useState(0);
  const Icon = familyIcon(family);
  const q = query.trim().toLowerCase();
  const filtered = q ? items.filter((i) => i.label.toLowerCase().includes(q)) : items;
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => {
    if (page > 0 && page >= pageCount) setPage(0);
  }, [page, pageCount]);
  const shown = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const selectedHere = items.filter((i) => selected.has(i.id)).length;

  // a search that matches nothing here hides the category entirely
  if (q && filtered.length === 0) return null;

  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggleOpen}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:hover:bg-slate-800/60"
        >
          <Icon aria-hidden className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
            {familyLabel(family)}
          </span>
          <span className="text-xs text-slate-500 dark:text-slate-400">{summary}</span>
          {selectedHere > 0 && (
            <span className="rounded-full bg-accent-600/10 px-1.5 py-px text-xs text-accent-800 dark:bg-accent-900/30 dark:text-accent-200">
              {selectedHere} picked
            </span>
          )}
          <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">{open ? '−' : '+'}</span>
        </button>
      </h3>
      {open && (
        <div className="border-t border-slate-100 p-3 dark:border-slate-800">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((s) => {
              const on = selected.has(s.id);
              const dead = s.status === 'not_integrated';
              // Only a ready warehouse database is directly selectable. A
              // database still 'to configure'/'partial' — like any connector —
              // routes to setup instead of silently selecting (the downstream
              // scan only reads 'available' sources, so a non-ready pick would
              // do nothing).
              const pickable = s.kind === 'database' && s.status === 'available';
              const needsSetup = !pickable && !dead;
              return (
                <div
                  key={s.id}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 transition-colors ${
                    on
                      ? 'border-accent-500 ring-1 ring-accent-500'
                      : dead
                        ? 'border-slate-100 opacity-60 dark:border-slate-800/60'
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-600'
                  }`}
                >
                  {s.kind === 'database' ? (
                    <Table2 aria-hidden className="h-3.5 w-3.5 shrink-0 text-slate-400 dark:text-slate-500" />
                  ) : (
                    <ConnectorLogo label={s.label} family={s.family} className="h-3.5 w-3.5" />
                  )}
                  <button
                    type="button"
                    disabled={dead}
                    aria-pressed={pickable ? on : undefined}
                    onClick={() => (pickable ? onToggleSelect(s) : onConfigure?.(s))}
                    title={
                      dead
                        ? 'This connector is not integrated yet.'
                        : pickable
                          ? `Use ${s.label}`
                          : `${s.label} — ${STATUS_LABELS[s.status]?.label ?? 'set up'}. Opens setup.`
                    }
                    className="min-w-0 flex-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 disabled:cursor-not-allowed"
                  >
                    <span className="block truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                      {neutralLabel(s.label) || s.label}
                    </span>
                  </button>
                  {needsSetup ? (
                    <span className="shrink-0 text-xs font-medium text-accent-600 dark:text-accent-400">Set up</span>
                  ) : (
                    statusPill(s.status)
                  )}
                </div>
              );
            })}
          </div>
          {shown.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500">No source in this category.</p>
          )}
          {pageCount > 1 && (
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <button
                type="button"
                disabled={page <= 0}
                onClick={() => setPage((p) => p - 1)}
                className="rounded-lg border border-slate-200 px-2 py-0.5 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700"
              >
                Previous
              </button>
              <span className="tabular-nums">page {page + 1} of {pageCount}</span>
              <button
                type="button"
                disabled={page >= pageCount - 1}
                onClick={() => setPage((p) => p + 1)}
                className="rounded-lg border border-slate-200 px-2 py-0.5 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ── the gallery ────────────────────────────────────────────────────── */

export default function StudioSourceGallery({
  need,
  proposals,
  selected,
  onToggle,
  onConfigure,
  onClearAll,
}: {
  need?: string;
  /** up to three, from the persisted content scan — shown, never invented */
  proposals?: SourceProposal[];
  /** controlled selection: source ids, stable across pages/categories */
  selected: Set<string>;
  onToggle: (s: GallerySource) => void;
  /** open the connector setup sheet (config → test → add) */
  onConfigure?: (s: GallerySource) => void;
  /** clear the whole selection at once (optional) */
  onClearAll?: () => void;
}) {
  const [dbs, setDbs] = useState<StudioSource[] | null>(null);
  const [connectors, setConnectors] = useState<CatalogConnector[] | null>(null);
  const [byFamily, setByFamily] = useState<CatalogByFamily>({});
  const [query, setQuery] = useState('');
  const [openFamily, setOpenFamily] = useState<string | null>('warehouse');

  useEffect(() => {
    // metadata only — survives the warehouse-credit block
    void getStudioSources().then(setDbs).catch(() => setDbs([]));
    void getStudioSourcesCatalogFull()
      .then((r) => {
        setConnectors(r.connectors);
        setByFamily(r.by_family);
      })
      .catch(() => setConnectors([]));
  }, []);

  const sourcesByFamily = useMemo(() => {
    const map = new Map<string, GallerySource[]>();
    const add = (s: GallerySource) => {
      if (!map.has(s.family)) map.set(s.family, []);
      map.get(s.family)!.push(s);
    };
    // real warehouse databases are ready-to-use sources
    for (const d of dbs ?? []) {
      add({
        id: d.id,
        kind: 'database',
        label: d.label || d.id.replace(/^sf:db:/, ''),
        family: 'warehouse',
        status: d.status ?? 'available',
      });
    }
    for (const c of connectors ?? []) {
      add({
        id: `conn:${String(c.label)}`,
        kind: 'connector',
        label: String(c.label ?? ''),
        family: String(c.family ?? 'api'),
        status: String(c.status ?? 'to_configure'),
      });
    }
    return map;
  }, [connectors, dbs]);

  const familyOrder = useMemo(() => {
    const order = ['warehouse', 'database', 'object_storage', 'saas_application', 'api', 'events', 'media'];
    const present = [...sourcesByFamily.keys()];
    return [...order.filter((f) => present.includes(f)), ...present.filter((f) => !order.includes(f))];
  }, [sourcesByFamily]);

  const summaryOf = useCallback(
    (family: string): string => {
      // warehouse count is the real database count, not the catalog tally
      if (family === 'warehouse') {
        const n = sourcesByFamily.get('warehouse')?.length ?? 0;
        return `${n} database${n === 1 ? '' : 's'} · ready`;
      }
      const bf = byFamily[family];
      if (!bf) return `${sourcesByFamily.get(family)?.length ?? 0}`;
      const parts = [
        bf.available ? `${bf.available} ready` : null,
        bf.to_configure ? `${bf.to_configure} to configure` : null,
        bf.partial ? `${bf.partial} partial` : null,
      ].filter(Boolean);
      return `${bf.total ?? 0}${parts.length ? ` · ${parts.join(', ')}` : ''}`;
    },
    [byFamily, sourcesByFamily],
  );

  const loading = dbs === null || connectors === null;

  return (
    <div className="space-y-3">
      {/* intent bar: the need in context + one global search */}
      <div className="flex flex-wrap items-center gap-2">
        {need && (
          <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Sparkles aria-hidden className="h-3 w-3 shrink-0 text-accent-500" />
            <span className="min-w-0 truncate">for: {need}</span>
          </span>
        )}
        <label className="relative ml-auto">
          <Search aria-hidden className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search every source"
            aria-label="Search every source"
            className="h-8 w-56 rounded-lg border border-slate-200 bg-white pl-7 pr-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          />
        </label>
      </div>

      {/* up to three relevant proposals — content-scan roles, never invented */}
      {(proposals ?? []).length > 0 && (
        <section className="rounded-xl border border-accent-200 bg-accent-50/40 p-3 dark:border-accent-900/50 dark:bg-accent-900/10">
          <p className="text-xs font-medium uppercase tracking-wide text-accent-800 dark:text-accent-300">
            Most relevant to your need
          </p>
          <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            {(proposals ?? []).slice(0, 3).map((p) => {
              const on = selected.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    onToggle({ id: p.id, kind: 'database', label: p.label, family: 'warehouse', status: 'available' })
                  }
                  title={p.why || undefined}
                  className={`rounded-lg border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                    on
                      ? 'border-accent-500 bg-white ring-1 ring-accent-500 dark:bg-slate-950'
                      : 'border-slate-200 bg-white hover:border-accent-300 dark:border-slate-700 dark:bg-slate-950'
                  }`}
                >
                  <span className="block truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                    {p.label.split('.').slice(-1)[0]}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1">
                    {p.role && p.role !== 'unknown' && (
                      <span className="rounded-full bg-sky-50 px-1.5 py-px text-[10px] text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                        {p.role} · inferred
                      </span>
                    )}
                    {p.relevance && (
                      <span className="text-[10px] text-slate-400 dark:text-slate-500">{p.relevance}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* the categories */}
      {loading ? (
        <div role="status" className="h-40 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800">
          <span className="sr-only">Reading the sources…</span>
        </div>
      ) : (
        <div className="space-y-2">
          {familyOrder.map((family) => (
            <Category
              key={family}
              family={family}
              items={sourcesByFamily.get(family) ?? []}
              summary={summaryOf(family)}
              open={openFamily === family || query.trim().length > 0}
              onToggleOpen={() => setOpenFamily((f) => (f === family ? null : family))}
              selected={selected}
              onToggleSelect={onToggle}
              onConfigure={onConfigure}
              query={query}
            />
          ))}
        </div>
      )}

      {/* the selection tray — stable across pages and categories */}
      {selected.size > 0 && (
        <section
          aria-label="Selected sources"
          className="sticky bottom-0 rounded-xl border border-slate-200 bg-white/95 p-2.5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
        >
          <p className="mb-1 flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            {selected.size} source{selected.size === 1 ? '' : 's'} selected
            {onClearAll && (
              <button
                type="button"
                onClick={onClearAll}
                className="ml-auto font-normal text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-500 dark:hover:text-slate-300"
              >
                Clear all
              </button>
            )}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {[...selected].map((id) => {
              const label = id.startsWith('sf:db:')
                ? id.replace(/^sf:db:/, '')
                : id.replace(/^conn:/, '');
              return (
                <span
                  key={id}
                  className="inline-flex items-center gap-1 rounded-full bg-accent-600/10 px-2 py-0.5 text-xs text-accent-800 dark:bg-accent-900/30 dark:text-accent-200"
                >
                  {neutralLabel(label) || label}
                  <button
                    type="button"
                    aria-label={`Remove ${label}`}
                    onClick={() =>
                      onToggle({
                        id,
                        kind: id.startsWith('sf:db:') ? 'database' : 'connector',
                        label,
                        family: 'warehouse',
                        status: 'available',
                      })
                    }
                    className="text-accent-700 hover:text-accent-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-300"
                  >
                    <X aria-hidden className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
