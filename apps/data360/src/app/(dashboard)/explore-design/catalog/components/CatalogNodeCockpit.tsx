'use client';

/**
 * CatalogNodeCockpit — the level-aware right rail for the catalog canvas.
 *
 * One rail, three levels (the node kind decides, never a different component):
 *   • schema  → identity (type · zone · owner · created) + inventory KPIs
 *   • product → status + anchor
 *   • project → owner · created · environments · deployed objects
 *
 * Axis tabs mirror the CDO board (Overview · DQ · Governance · Cost · Perf ·
 * Modeling), and every call-to-action is an {@link InsightActionButton}: a
 * labelled, described, honestly-gated action — never a bare button. The
 * "Enrich type" actions write a real TAG_ASSIGNED event through
 * POST /catalog/schemas/{db}/{schema}/classify.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Boxes,
  Coins,
  Database,
  FolderKanban,
  Gauge,
  Package,
  Search,
  ShieldCheck,
  Sparkles,
  Table2,
  Tags,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getApiErrorMessage } from '@/lib/api-client';
import InsightActionButton from '@/app/shared/insights/InsightActionButton';
import {
  classifyCatalogSchema,
  type CatalogGraphNode,
  type SchemaType,
} from '@/app/services/catalog/graph';
import {
  getCatalogProductAssets,
  getCatalogProductOverview,
  listCatalogSchemaTables,
  previewCatalogTable,
  type CatalogSchemaTable,
  type CatalogTablePreview,
} from '@/app/services/catalog';

type AxisId = 'overview' | 'dq' | 'gov' | 'cost' | 'perf' | 'modeling';

const AXES: Array<{ id: AxisId; label: string; icon: React.ElementType; blurb: string }> = [
  { id: 'overview', label: 'Overview', icon: Boxes, blurb: 'Identity, ownership and inventory of this node.' },
  { id: 'dq', label: 'Quality', icon: Sparkles, blurb: 'Completeness, freshness and rule breaches.' },
  { id: 'gov', label: 'Governance', icon: ShieldCheck, blurb: 'Masking, row-access and tag coverage.' },
  { id: 'cost', label: 'Cost', icon: Coins, blurb: 'Storage and compute attributable to this node.' },
  { id: 'perf', label: 'Performance', icon: Gauge, blurb: 'Query latency, queueing and spill.' },
  { id: 'modeling', label: 'Modeling', icon: Tags, blurb: 'Keys, relations and star-schema conformity.' },
];

const TYPES: SchemaType[] = ['SOURCE', 'PRODUCT', 'PROJECT', 'UNCLASSIFIED'];

function bytes(b?: number): string {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = b;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i += 1; }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${u[i]}`;
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1">
      <dt className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className="min-w-0 truncate text-right text-[11px] font-medium text-slate-700 dark:text-slate-200">
        {value ?? '—'}
      </dd>
    </div>
  );
}

/** Axis body that has no dedicated feeder yet: honest, never a fake number. */
function AxisPending({ blurb }: { blurb: string }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
      {blurb} Select a table on the canvas to open its scored cockpit — schema-level
      rollups for this axis are not computed yet on this environment.
    </p>
  );
}

/** Skeleton rows shared by the async sections (tables list / product facts). */
function SectionSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-1" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-5 animate-pulse rounded bg-slate-100 dark:bg-slate-800/60" />
      ))}
    </div>
  );
}

/** Inline honest error with retry — same palette as TableDataPreview's error. */
function SectionError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50/70 px-2.5 py-1.5 text-[11px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
      <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
      <div className="min-w-0 flex-1">
        <span className="break-words">{message}</span>{' '}
        <button type="button" className="underline" onClick={onRetry}>
          Retry
        </button>
      </div>
    </div>
  );
}

/** Honest degrade note (endpoint absent on this environment / nothing to show). */
function SectionNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-4 text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Table data preview — non-project modal (the w-80 rail is too narrow for a
// grid). Light inline overlay: fixed inset, Esc/backdrop close, aria-modal.
// Data comes from POST /explore-design/table/preview via previewCatalogTable —
// the shared TableDataPreview requires a projectId the catalog canvas lacks.
// ---------------------------------------------------------------------------

const PREVIEW_LIMITS = [100, 500, 1000] as const;

function previewCell(v: unknown): { text: string; isNull: boolean } {
  if (v === null || v === undefined) return { text: 'NULL', isNull: true };
  if (typeof v === 'object') return { text: JSON.stringify(v), isNull: false };
  return { text: String(v), isNull: false };
}

function TablePreviewOverlay({
  database,
  schema,
  table,
  onClose,
}: {
  database: string;
  schema: string;
  table: string;
  onClose: () => void;
}) {
  const [state, setState] = useState<'loading' | 'done' | 'error'>('loading');
  const [data, setData] = useState<CatalogTablePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState<number>(100);
  const closeRef = useRef<HTMLButtonElement>(null);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      setData(await previewCatalogTable(database, schema, table, limit));
      setState('done');
    } catch (err) {
      setError(getApiErrorMessage(err));
      setState('error');
    }
  }, [database, schema, table, limit]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const cols = data?.columns ?? [];
  const rows = data?.rows ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Data preview of ${database}.${schema}.${table}`}
    >
      <div
        className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative flex max-h-[80vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-slate-900">
        <header className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
          <Table2 className="h-4 w-4 shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1">
            <h3 className="truncate font-mono text-xs font-semibold text-slate-900 dark:text-white">
              {database}.{schema}.{table}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {state === 'done'
                ? `${rows.length.toLocaleString()} rows shown (limit ${data?.limit ?? limit})`
                : 'Live data preview'}
            </p>
          </div>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="rounded border border-slate-200 bg-transparent px-1 py-0.5 text-[10px] text-slate-600 dark:border-slate-700 dark:text-slate-300"
            aria-label="Row limit"
          >
            {PREVIEW_LIMITS.map((l) => (
              <option key={l} value={l}>
                {l} rows
              </option>
            ))}
          </select>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close data preview"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-auto p-3">
          {state === 'loading' && <SectionSkeleton rows={8} />}
          {state === 'error' && error && <SectionError message={error} onRetry={() => void load()} />}
          {state === 'done' && rows.length === 0 && (
            <SectionNote>This table has no rows.</SectionNote>
          )}
          {state === 'done' && rows.length > 0 && (
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0 z-10">
                <tr>
                  <th className="border-b border-slate-200 bg-slate-50 px-2 py-1 text-right font-mono text-[9px] text-slate-400 dark:border-slate-700 dark:bg-slate-800">
                    #
                  </th>
                  {cols.map((c) => (
                    <th
                      key={c}
                      className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-2 py-1 text-left font-semibold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, ri) => (
                  <tr key={ri} className="odd:bg-slate-50/50 dark:odd:bg-slate-800/30">
                    <td className="px-2 py-1 text-right font-mono text-[9px] text-slate-300 dark:text-slate-600">
                      {ri + 1}
                    </td>
                    {cols.map((c) => {
                      const { text, isNull } = previewCell(row[c]);
                      return (
                        <td
                          key={c}
                          className={cn(
                            'max-w-[280px] truncate whitespace-nowrap px-2 py-1 font-mono',
                            isNull
                              ? 'italic text-slate-300 dark:text-slate-600'
                              : 'text-slate-700 dark:text-slate-200',
                          )}
                          title={text}
                        >
                          {text}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Schema tables — real inventory of db.schema (GET /common/tables + best-effort
// row counts from the observability schema probe), 8/page, searchable.
// ---------------------------------------------------------------------------

const TABLES_PAGE_SIZE = 8;

function SchemaTablesSection({ db, schema }: { db: string; schema: string }) {
  const [state, setState] = useState<'loading' | 'done' | 'error' | 'unavailable'>('loading');
  const [tables, setTables] = useState<CatalogSchemaTable[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState('loading');
    setError(null);
    try {
      const res = await listCatalogSchemaTables(db, schema);
      if (!res.available) {
        setState('unavailable');
        return;
      }
      setTables(res.tables);
      setState('done');
    } catch (err) {
      setError(getApiErrorMessage(err));
      setState('error');
    }
  }, [db, schema]);

  useEffect(() => {
    setQuery('');
    setPage(0);
    setPreview(null);
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    if (!q) return tables;
    return tables.filter((t) => t.name.toUpperCase().includes(q));
  }, [tables, query]);

  const pages = Math.max(1, Math.ceil(filtered.length / TABLES_PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const visible = filtered.slice(safePage * TABLES_PAGE_SIZE, (safePage + 1) * TABLES_PAGE_SIZE);

  return (
    <section className="space-y-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Tables{state === 'done' ? ` · ${tables.length}` : ''}
      </h3>

      {state === 'loading' && <SectionSkeleton rows={5} />}
      {state === 'unavailable' && (
        <SectionNote>Table inventory not available on this environment.</SectionNote>
      )}
      {state === 'error' && error && <SectionError message={error} onRetry={() => void load()} />}
      {state === 'done' && tables.length === 0 && (
        <SectionNote>No tables in this schema yet.</SectionNote>
      )}

      {state === 'done' && tables.length > 0 && (
        <>
          {tables.length > TABLES_PAGE_SIZE && (
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
                placeholder="Filter tables…"
                aria-label="Filter tables by name"
                className="w-full rounded-md border border-slate-200 bg-transparent py-1 pl-6 pr-2 text-[11px] text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none dark:border-slate-700 dark:text-slate-200 dark:placeholder:text-slate-500"
              />
            </div>
          )}

          {filtered.length === 0 ? (
            <SectionNote>No table matches “{query.trim()}”.</SectionNote>
          ) : (
            <ul className="divide-y divide-slate-50 rounded-lg border border-slate-100 dark:divide-slate-800/60 dark:border-slate-800">
              {visible.map((t) => (
                <li key={t.name}>
                  <button
                    type="button"
                    onClick={() => setPreview(t.name)}
                    aria-label={`Preview data of ${t.name}`}
                    title={`Preview real rows of ${db}.${schema}.${t.name}`}
                    className="flex w-full items-center gap-1.5 px-2 py-1 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  >
                    <Table2 className="h-3 w-3 shrink-0 text-slate-300 dark:text-slate-600" />
                    <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-slate-700 dark:text-slate-200">
                      {t.name}
                    </span>
                    {t.rowCount != null && (
                      <span className="shrink-0 text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
                        {t.rowCount.toLocaleString()} rows
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {pages > 1 && (
            <div className="flex items-center justify-end gap-1 text-[10px] text-slate-400 dark:text-slate-500">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                aria-label="Previous page of tables"
                className="rounded px-1.5 py-0.5 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800"
              >
                ‹
              </button>
              <span aria-live="polite">page {safePage + 1}/{pages}</span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(pages - 1, p + 1))}
                disabled={safePage >= pages - 1}
                aria-label="Next page of tables"
                className="rounded px-1.5 py-0.5 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-slate-800"
              >
                ›
              </button>
            </div>
          )}
        </>
      )}

      {preview && (
        <TablePreviewOverlay
          database={db}
          schema={schema}
          table={preview}
          onClose={() => setPreview(null)}
        />
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Product overview — the higher-level view: card + scores + counts from
// GET /catalog/products/{id}/overview, bound assets from .../assets.
// Each call degrades independently (404 → the sub-section is omitted).
// ---------------------------------------------------------------------------

/** Wire shape of GET /catalog/products/{id}/overview (products_facade.get_product_overview). */
interface ProductOverviewData {
  product_id: string;
  name?: string | null;
  table_fqn?: string | null;
  owner?: string | null;
  description?: string | null;
  sla_freshness_hours?: number;
  quality_threshold?: number;
  tags?: unknown[];
  status?: string | null;
  consumers?: number;
  created_by?: string | null;
  created_at?: string | null;
  trust_score?: number | null;
  /** Gold KPIs: dq / gov / cost / perf / modeling / ml_ready (0–100 or null). */
  scores?: Record<string, unknown>;
  kpi_count?: number;
  asset_count?: number;
}

/** Wire shape of GET /catalog/products/{id}/assets (products_facade.get_product_assets). */
interface ProductAssetEntry {
  object_fqn: string | null;
  role?: string;
  trust_score?: number | null;
}

const PRODUCT_SCORE_AXES: Array<{ key: string; label: string }> = [
  { key: 'dq', label: 'DQ' },
  { key: 'gov', label: 'GOV' },
  { key: 'cost', label: 'COST' },
  { key: 'perf', label: 'PERF' },
  { key: 'modeling', label: 'MOD' },
  { key: 'ml_ready', label: 'ML' },
];

type SectionFetch<T> = { kind: 'ok'; data: T } | { kind: 'unavailable' } | { kind: 'error' };

async function fetchSection<T>(call: () => Promise<T>): Promise<SectionFetch<T>> {
  try {
    return { kind: 'ok', data: await call() };
  } catch (err: unknown) {
    const status = (err as { response?: { status?: number } })?.response?.status;
    if (status === 404 || status === 501) return { kind: 'unavailable' };
    return { kind: 'error' };
  }
}

function ProductOverviewSection({ productId }: { productId: string }) {
  const [loading, setLoading] = useState(true);
  const [overview, setOverview] = useState<SectionFetch<ProductOverviewData> | null>(null);
  const [assets, setAssets] = useState<SectionFetch<{ assets?: ProductAssetEntry[] }> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [ov, as] = await Promise.all([
      fetchSection<ProductOverviewData>(() => getCatalogProductOverview(productId)),
      fetchSection<{ assets?: ProductAssetEntry[] }>(() => getCatalogProductAssets(productId)),
    ]);
    setOverview(ov);
    setAssets(as);
    setLoading(false);
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading) {
    return (
      <section className="space-y-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Product</h3>
        <SectionSkeleton rows={5} />
      </section>
    );
  }

  const hasError = overview?.kind === 'error' || assets?.kind === 'error';
  const allGone = overview?.kind === 'unavailable' && assets?.kind === 'unavailable';

  if (allGone) {
    return (
      <section className="space-y-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
        <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Product</h3>
        <SectionNote>Product detail endpoints are not available on this environment.</SectionNote>
      </section>
    );
  }

  const ov = overview?.kind === 'ok' ? overview.data : null;
  const assetList = assets?.kind === 'ok' ? assets.data.assets ?? [] : null;
  const scoreChips = ov?.scores
    ? PRODUCT_SCORE_AXES
        .map(({ key, label }) => ({ label, value: ov.scores?.[key] }))
        .filter((c): c is { label: string; value: number } => typeof c.value === 'number')
    : [];
  const tagChips = (ov?.tags ?? []).filter((t): t is string => typeof t === 'string');

  return (
    <section className="space-y-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
      <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Product</h3>

      {hasError && (
        <SectionError message="Some product details failed to load." onRetry={() => void load()} />
      )}

      {ov && (
        <>
          <dl className="rounded-lg border border-slate-100 px-2.5 py-1.5 dark:border-slate-800">
            <Fact label="Owner" value={ov.owner} />
            <Fact label="Created" value={ov.created_at?.slice(0, 10)} />
            <Fact label="Created by" value={ov.created_by} />
            <Fact label="Consumers" value={(ov.consumers ?? 0).toLocaleString()} />
            <Fact label="KPIs" value={ov.kpi_count ?? 0} />
            <Fact label="Assets" value={ov.asset_count ?? 0} />
            <Fact
              label="Trust score"
              value={typeof ov.trust_score === 'number' ? `${Math.round(ov.trust_score)} / 100` : '—'}
            />
          </dl>
          {ov.description && (
            <p className="text-[11px] leading-4 text-slate-500 dark:text-slate-400">{ov.description}</p>
          )}
          {scoreChips.length > 0 && (
            <div className="flex flex-wrap gap-1" aria-label="Product scores">
              {scoreChips.map((c) => (
                <span
                  key={c.label}
                  className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  title={`${c.label} score (0–100)`}
                >
                  {c.label} {Math.round(c.value)}
                </span>
              ))}
            </div>
          )}
          {tagChips.length > 0 && (
            <div className="flex flex-wrap gap-1" aria-label="Product tags">
              {tagChips.map((t) => (
                <span
                  key={t}
                  className="rounded border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500 dark:border-slate-700 dark:text-slate-400"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </>
      )}

      {assetList && assetList.length > 0 && (
        <div className="space-y-0.5">
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Bound assets
          </h4>
          <ul className="divide-y divide-slate-50 rounded-lg border border-slate-100 dark:divide-slate-800/60 dark:border-slate-800">
            {assetList.map((a, i) => (
              <li key={a.object_fqn ?? i} className="flex items-center gap-1.5 px-2 py-1">
                <Table2 className="h-3 w-3 shrink-0 text-slate-300 dark:text-slate-600" />
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-slate-600 dark:text-slate-300">
                  {a.object_fqn ?? '—'}
                </span>
                {a.role && (
                  <span className="shrink-0 rounded bg-slate-100 px-1 py-0.5 text-[9px] uppercase text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                    {a.role}
                  </span>
                )}
                {typeof a.trust_score === 'number' && (
                  <span className="shrink-0 text-[10px] tabular-nums text-slate-400 dark:text-slate-500">
                    {Math.round(a.trust_score)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export interface CatalogNodeCockpitProps {
  node: CatalogGraphNode;
  onClose: () => void;
  onClassified?: () => void;
}

export default function CatalogNodeCockpit({ node, onClose, onClassified }: CatalogNodeCockpitProps) {
  const [axis, setAxis] = useState<AxisId>('overview');

  const Icon = node.kind === 'database' ? Database
    : node.kind === 'product' ? Package
    : node.kind === 'project' ? FolderKanban
    : Boxes;

  const isSchema = node.kind === 'schema';
  const [db, schema] = useMemo(() => {
    if (!isSchema) return [null, null] as const;
    const fqn = node.id.replace(/^schema:/, '');
    const dot = fqn.indexOf('.');
    return [fqn.slice(0, dot), fqn.slice(dot + 1)] as const;
  }, [isSchema, node.id]);

  return (
    <aside className="flex h-full min-h-[560px] w-80 shrink-0 flex-col rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {/* Identity header */}
      <header className="flex items-start gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{node.label}</h2>
          <p className="truncate text-[11px] capitalize text-slate-500 dark:text-slate-400">
            {node.kind}
            {node.schema_type ? ` · ${node.schema_type.toLowerCase()}` : ''}
            {node.database ? ` · ${node.database}` : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close cockpit"
          className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </header>

      {/* Axis rail — same axes on every level (model/table based) */}
      <nav role="tablist" aria-label="Cockpit axes" className="flex gap-0.5 overflow-x-auto border-b border-slate-100 px-2 py-1 dark:border-slate-800">
        {AXES.map((a) => {
          const AIcon = a.icon;
          return (
            <button
              key={a.id}
              role="tab"
              aria-selected={axis === a.id}
              title={a.blurb}
              onClick={() => setAxis(a.id)}
              className={cn(
                'flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors',
                axis === a.id
                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
                  : 'text-slate-500 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800',
              )}
            >
              <AIcon className="h-3 w-3" />
              {a.label}
            </button>
          );
        })}
      </nav>

      <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        <p className="text-[11px] leading-4 text-slate-500 dark:text-slate-400">
          {AXES.find((a) => a.id === axis)?.blurb}
        </p>

        {axis === 'overview' ? (
          <dl className="rounded-lg border border-slate-100 px-2.5 py-1.5 dark:border-slate-800">
            {isSchema && (
              <>
                <Fact label="Type" value={node.schema_type} />
                <Fact label="Zone" value={node.zone ?? '—'} />
                <Fact label="Classified by" value={node.classified_by} />
                <Fact label="Owner" value={node.owner} />
                <Fact label="Created" value={node.created?.slice(0, 10)} />
                <Fact label="Tables" value={node.kpis?.tables ?? 0} />
                <Fact label="Rows" value={(node.kpis?.rows ?? 0).toLocaleString()} />
                <Fact label="Size" value={bytes(node.kpis?.bytes)} />
              </>
            )}
            {node.kind === 'project' && (
              <>
                <Fact label="Owner" value={node.owner} />
                <Fact label="Created" value={node.created?.slice(0, 10)} />
                <Fact label="Type" value={node.project_type} />
                <Fact label="Environments" value={(node.environments ?? []).join(', ') || 'dev'} />
                <Fact label="Deployed objects" value={node.objects ?? 0} />
              </>
            )}
            {node.kind === 'product' && (
              <>
                <Fact label="Status" value={node.status ?? 'DRAFT'} />
                <Fact label="Anchor" value={node.anchor_fqn} />
              </>
            )}
            {node.kind === 'database' && <Fact label="Scope" value="Database container" />}
          </dl>
        ) : (
          <AxisPending blurb={AXES.find((a) => a.id === axis)!.blurb} />
        )}

        {/* Schema level — real table inventory + click-to-preview real rows */}
        {axis === 'overview' && isSchema && db && schema && (
          <SchemaTablesSection db={db} schema={schema} />
        )}

        {/* Product level — higher-level card: owner, counts, gold scores, assets */}
        {axis === 'overview' && node.kind === 'product' && (
          <ProductOverviewSection productId={node.id.replace(/^product:/, '')} />
        )}

        {/* Contextual actions — rich, described, honestly gated */}
        {isSchema && db && schema && (
          <section className="space-y-1.5 border-t border-slate-100 pt-3 dark:border-slate-800">
            <h3 className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Enrich classification
            </h3>
            <p className="text-[11px] leading-4 text-slate-500 dark:text-slate-400">
              Persists the TYPE on this schema and records a governed{' '}
              <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">TAG_ASSIGNED</code> event
              in the Data360 event store. Auto-detection stays as the fallback.
            </p>
            {TYPES.filter((t) => t !== node.schema_type).map((t) => (
              <InsightActionButton
                key={t}
                label={`Mark as ${t.toLowerCase()}`}
                icon={Tags}
                size="sm"
                variant="subtle"
                successToast={`${schema} classified as ${t.toLowerCase()}`}
                unavailableHint="Schema classification is not enabled on this backend."
                onAction={async () => {
                  await classifyCatalogSchema(db, schema, t, node.zone ?? null);
                  onClassified?.();
                }}
              />
            ))}
          </section>
        )}
      </div>
    </aside>
  );
}
