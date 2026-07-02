'use client';

/**
 * SnowflakeObjectsTab — refactored Data Catalog Explorer (UI-first).
 *
 * Matches the target UX: 8 sub-tabs (Overview · Databases · Schemas · Objects ·
 * Tasks & Pipelines · Governance · Cost & Performance · Activity), an Overview
 * with a KPI grid (sparklines) + AI Discovery Summary + a rich object explorer
 * (AI score, cost impact, product/project associativity via tags) + a detail
 * panel (Summary/Lineage/Governance/Cost/Usage) carrying the Data360 migration
 * classification (product / preparation / MVP / cloned).
 *
 * SAMPLE data drives the not-yet-wired fields (AI score, product/project links,
 * migration class) so the UX can be validated; real endpoints replace them after
 * sign-off. Real-data sub-tabs (Tasks&Pipelines/Governance/Cost&Performance/
 * Activity) already read live ACCOUNT_USAGE via AuditTable. Sample blocks are
 * tagged with a small "échantillon" pill so nothing fake reads as real.
 */

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Database, Boxes, Table2, GitBranch, Layers,
  DollarSign, Gauge, Sparkles, ArrowRight,
  AlertTriangle, Lock, Zap, FileBox, ShieldCheck, Boxes as BoxesIcon, Rocket,
} from 'lucide-react';
import AuditTable from './AuditTable';
import LineageFlow from './LineageFlow';
import { AXIS_ICON } from './AdnAxes';
import {
  getTaskHistory, getRoleHierarchy, getCostByWarehouse, getTableStorage,
  getObjectEnrichment,
} from '@/app/services/command-center';
import type { ObjectEnrichmentRow } from '@/app/services/command-center';
import { safeToFixed } from '@/lib/format-number';
import type { Row } from './AuditTable';

// ── sub-tabs ──────────────────────────────────────────────────────────────────
const SUBTABS = [
  'Overview', 'Databases', 'Schemas', 'Objects', 'Tasks & Pipelines',
  'Governance', 'Cost & Performance', 'Activity',
] as const;
type SubTab = (typeof SUBTABS)[number];

type MigrationClass = 'product' | 'preparation' | 'mvp' | 'cloned';
interface SampleObject {
  name: string; type: string; db: string; schema: string; owner: string;
  // aiScore: no quality/AI-scan feed exists in the loaded payload → always
  // `null`, rendered "—". Never a fabricated score.
  aiScore: number | null; storage: string;
  // perfRisk: threshold derivation of REAL fields (clustering key + row count);
  // `null` (→ "—") when row_count is absent and there is no clustering signal.
  perfRisk: 'Low' | 'Medium' | 'High' | null;
  // secRisk: REAL masking/RLS/policy-reference signal is NOT in the loaded
  // ACCOUNT_USAGE payload (no such field on ObjectEnrichmentRow / table-storage),
  // so this is always `null` → rendered "—". Never a fabricated 'Low'.
  secRisk: 'Low' | 'Medium' | 'High' | null;
  roles: number | null; projects: number | null;
  products: number | null; cost: string; costMo: string; nextAction: string;
  migration: MigrationClass; tags: string[]; sensitivity: string;
  classification: string; policy: string; rows: string; cols: number | null; timeTravel: string;
  // ── real per-object enrichment overlay (present only when a matching
  //    /command-center/object-enrichment row merged onto this storage row) ──
  enriched?: boolean;
  rolesSample?: string[];
  accessCount?: number | null;
  distinctUsers?: number | null;
  lastAccessed?: string | null;
  storageUsd?: number | null;       // storage-derived monthly estimate (from table-storage)
  attributedUsd?: number | null;    // attributed COMPUTE $ (≤ total), not total cost
  attributedCredits?: number | null;
  billableQueries?: number | null;
}

const RISK_TONE: Record<string, string> = {
  Low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  Medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  High: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
};
const MIGRATION_META: Record<MigrationClass, { label: string; tone: string; icon: any }> = {
  product: { label: 'Product', tone: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300', icon: FileBox },
  preparation: { label: 'Preparation', tone: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300', icon: Layers },
  mvp: { label: 'MVP', tone: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300', icon: Zap },
  cloned: { label: 'Cloned data', tone: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', icon: GitBranch },
};

// ── map REAL /command-center/table-storage rows → the object view ─────────────
function fmtSize(tb: number): string {
  const gb = tb * 1024;
  if (tb >= 1) return `${tb.toFixed(2)} TB`;
  if (gb >= 1) return `${gb.toFixed(1)} GB`;
  return `${(gb * 1024).toFixed(0)} MB`;
}
function deriveMigration(tb: number, clustered: boolean): MigrationClass {
  if (tb > 1) return 'product';
  if (clustered) return 'preparation';
  if (tb < 0.05) return 'cloned';
  return 'mvp';
}
function fmtDate(s?: string | null): string {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString();
}
function mapObject(
  r: Record<string, unknown>,
  enrich?: Map<string, ObjectEnrichmentRow>,
): SampleObject {
  const num = (k: string) => Number(r[k] ?? 0);
  const str = (k: string) => (r[k] == null ? '' : String(r[k]));
  const tb = num('total_tb');
  const clustered = !!str('clustering_key');
  const rows = num('row_count');
  const usd = num('est_monthly_usd');
  const transient = r['is_transient'] === true || str('is_transient').toLowerCase() === 'yes' || str('is_transient').toLowerCase() === 'true';
  const hasRowCount = r['row_count'] != null;
  const db = str('database_name');
  const schema = str('schema_name');
  const name = str('table_name') || '—';

  // Overlay live usage + attributed-compute enrichment keyed on the uppercased FQN
  // (ACCESS_HISTORY / TAG_REFERENCES emit unquoted identifiers in UPPERCASE).
  const e = enrich?.get(`${db}.${schema}.${name}`.toUpperCase());
  const enriched = !!e;
  const attributedUsd = e?.attributed_usd ?? null;
  // Cost Impact: prefer attributed compute $ when present, else the real
  // storage-derived monthly estimate, else "—" (no fake 0s).
  const costMo = attributedUsd != null
    ? `$${attributedUsd.toLocaleString()}/mo`
    : usd > 0
      ? `$${usd.toLocaleString()}/mo`
      : '—';

  return {
    name,
    type: str('table_type') || 'TABLE',
    db,
    schema,
    owner: str('owner') || '—',
    // No AI/quality scan feed in this payload → unknown ("—"), never invented.
    aiScore: null,
    storage: fmtSize(tb),
    // Threshold read of real fields; unknown ("—") when neither signal exists.
    perfRisk: clustered ? 'Low' : hasRowCount ? (rows > 1e8 ? 'High' : 'Medium') : null,
    // No masking/RLS/policy signal in this payload → unknown, render "—".
    secRisk: null,
    roles: e?.distinct_roles ?? null,
    projects: e?.projects ?? null,
    products: e?.products ?? null,
    cost: tb > 1 ? 'High' : tb > 0.1 ? 'Medium' : 'Low',
    costMo,
    nextAction: tb > 1 ? 'Model in Data360' : clustered ? 'Govern in Governance' : 'Review',
    migration: deriveMigration(tb, clustered),
    tags: [str('table_type') || 'TABLE', clustered ? 'Clustered' : '', transient ? 'Transient' : ''].filter(Boolean),
    // No sensitivity/classification feed in this payload → honest "—",
    // never a fabricated per-object classification.
    sensitivity: '—',
    classification: '—',
    policy: '—',
    rows: hasRowCount ? rows.toLocaleString() : '—',
    cols: null,
    timeTravel: '—',
    enriched,
    rolesSample: e?.roles ?? undefined,
    accessCount: e?.access_count ?? null,
    distinctUsers: e?.distinct_users ?? null,
    lastAccessed: e?.last_accessed ?? null,
    storageUsd: usd > 0 ? usd : null,
    attributedUsd,
    attributedCredits: e?.attributed_credits ?? null,
    billableQueries: e?.billable_queries ?? null,
  };
}

// ── derived KPIs (computed from the REAL table-storage rows — no fabrication) ──
// We surface only what the loaded ACCOUNT_USAGE objects let us count honestly:
//   Databases / Schemas / Objects / Tables / Views + total storage.
// Everything not derivable from this payload (Warehouses, Tasks, Pipes, Streams,
// Monthly Cost, AI Scan Score) renders "—" rather than a fabricated number.
interface DerivedKpi { label: string; value: string }
function deriveKpis(objects: SampleObject[], loaded: boolean): DerivedKpi[] {
  const dash = '—';
  if (!loaded || objects.length === 0) {
    return [
      { label: 'Databases', value: dash },
      { label: 'Schemas', value: dash },
      { label: 'Objects', value: dash },
      { label: 'Tables', value: dash },
      { label: 'Views', value: dash },
      { label: 'Total storage', value: dash },
    ];
  }
  const dbs = new Set<string>();
  const schemas = new Set<string>();
  let tables = 0;
  let views = 0;
  let totalTb = 0;
  for (const o of objects) {
    if (o.db) dbs.add(o.db);
    if (o.db || o.schema) schemas.add(`${o.db}.${o.schema}`);
    const t = (o.type || '').toUpperCase();
    if (t.includes('VIEW')) views += 1;
    else tables += 1;
    // storage strings are "x.xx TB" / "x.x GB" / "x MB" — parse back to TB
    const m = /([\d.]+)\s*(TB|GB|MB)/.exec(o.storage || '');
    if (m) {
      const n = parseFloat(m[1]);
      totalTb += m[2] === 'TB' ? n : m[2] === 'GB' ? n / 1024 : n / (1024 * 1024);
    }
  }
  return [
    { label: 'Databases', value: dbs.size.toLocaleString() },
    { label: 'Schemas', value: schemas.size.toLocaleString() },
    { label: 'Objects', value: objects.length.toLocaleString() },
    { label: 'Tables', value: tables.toLocaleString() },
    { label: 'Views', value: views.toLocaleString() },
    { label: 'Total storage', value: totalTb > 0 ? fmtSize(totalTb) : dash },
  ];
}

// ── Discovery — REAL findings derived from the loaded objects (no fabrication) ─
interface DiscoveryItem { cat: string; tone: string; icon: any; title: string; metric: string; sub: string; cta: string; route: string }
function deriveDiscovery(objects: SampleObject[]): DiscoveryItem[] {
  const items: DiscoveryItem[] = [];
  const highCost = objects.filter((o) => o.cost === 'High').length;
  if (highCost > 0) {
    items.push({
      cat: 'Cost', tone: 'blue', icon: DollarSign, title: 'High-storage objects',
      metric: `${highCost} object${highCost > 1 ? 's' : ''}`, sub: 'Largest storage footprint',
      cta: 'Review in Governance', route: '/governance',
    });
  }
  const perfRisk = objects.filter((o) => o.perfRisk === 'High').length;
  if (perfRisk > 0) {
    items.push({
      cat: 'Perf', tone: 'rose', icon: Gauge, title: 'Performance risk',
      metric: `${perfRisk} object${perfRisk > 1 ? 's' : ''}`, sub: 'Unclustered / very large tables',
      cta: 'Open in Modeling', route: '/explore-design',
    });
  }
  // Migration opportunity — objects scanned but not yet linked to a Data360
  // project/product (enrichment overlay present, zero links).
  const unmigrated = objects.filter((o) => o.enriched && o.projects === 0 && o.products === 0).length;
  if (unmigrated > 0) {
    items.push({
      cat: 'Opportunity', tone: 'violet', icon: Sparkles, title: 'Modeling opportunity',
      metric: `${unmigrated} object${unmigrated > 1 ? 's' : ''}`, sub: 'Not yet a Data360 product',
      cta: 'Model in Data360', route: '/explore-design?intent=model&from=scan',
    });
  }
  const productCandidates = objects.filter((o) => o.migration === 'product').length;
  if (productCandidates > 0) {
    items.push({
      cat: 'Opportunity', tone: 'emerald', icon: Zap, title: 'API opportunity',
      metric: `${productCandidates} dataset${productCandidates > 1 ? 's' : ''}`, sub: 'Large governed candidates to expose',
      cta: 'Expose as API', route: '/governance/oauth',
    });
  }
  return items;
}

function SamplePill() {
  return (
    <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-gray-400 dark:bg-gray-800">
      échantillon
    </span>
  );
}

// ── Overview sub-tab ──────────────────────────────────────────────────────────
function OverviewSub() {
  const router = useRouter();
  const [objects, setObjects] = useState<SampleObject[]>([]);
  const [selected, setSelected] = useState<SampleObject | null>(null);
  const [detailTab, setDetailTab] = useState<'Summary' | 'Lineage' | 'Governance' | 'Cost & Performance' | 'Usage'>('Summary');
  const [loadingObjects, setLoadingObjects] = useState(true);
  const [realLoaded, setRealLoaded] = useState(false);
  const [enrichDegraded, setEnrichDegraded] = useState(false);
  const [page, setPage] = useState(0);
  const [dbFilter, setDbFilter] = useState<string | null>(null);
  const [schemaFilter, setSchemaFilter] = useState<string | null>(null);
  const PAGE_SIZE = 8;

  // Replace the sample objects with REAL ACCOUNT_USAGE objects (storage/owner/
  // type/rows from table-storage) AND overlay live per-object usage + attributed
  // compute from /command-center/object-enrichment. Both helpers swallow their
  // own errors, so Promise.all never rejects. When enrichment is `degraded`
  // (non-Enterprise edition / no privilege / request failed) we keep storage
  // columns live and render "—" for usage/cost instead of fake zeros.
  useEffect(() => {
    let active = true;
    setLoadingObjects(true);
    Promise.all([getTableStorage(120), getObjectEnrichment(90)])
      .then(([storage, enrich]) => {
        if (!active) return;
        const degraded =
          !!enrich?.degraded ||
          (enrich?.meta as { degraded?: boolean } | undefined)?.degraded === true;
        setEnrichDegraded(degraded);

        const emap = new Map<string, ObjectEnrichmentRow>();
        if (!degraded) {
          for (const raw of (enrich?.data ?? [])) {
            // Normalize keys to lowercase so the merge is casing-proof regardless
            // of backend key casing, then key on the uppercased FQN.
            const row = Object.fromEntries(
              Object.entries(raw as unknown as Record<string, unknown>).map(([k, v]) => [k.toLowerCase(), v]),
            ) as unknown as ObjectEnrichmentRow;
            const key = `${row.database_name}.${row.schema_name}.${row.table_name}`.toUpperCase();
            if (row.database_name && row.table_name) emap.set(key, row);
          }
        }

        const mapped = ((storage?.data ?? []) as Record<string, unknown>[]).map((r) =>
          mapObject(r, emap),
        );
        // Always reflect the REAL result — including an honest-empty (clean
        // account) — instead of retaining seeded sample rows.
        setObjects(mapped);
        setSelected(mapped[0] ?? null);
        setRealLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setObjects([]);
        setSelected(null);
        setRealLoaded(false);
      })
      .finally(() => {
        if (active) setLoadingObjects(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const kpis = deriveKpis(objects, realLoaded);
  const discovery = deriveDiscovery(objects);

  // Hierarchy filter (db → schema) + pagination → keep the table to one page.
  const filtered = objects.filter(
    (o) => (!dbFilter || o.db === dbFilter) && (!schemaFilter || o.schema === schemaFilter),
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const paged = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const pickDb = (db: string) => {
    setDbFilter(db);
    setSchemaFilter(null);
    setPage(0);
  };
  const pickSchema = (sc: string) => {
    setSchemaFilter(sc);
    setPage(0);
  };

  return (
    <div className="space-y-5">
      {/* KPI grid — counts derived from the REAL table-storage payload.
          Non-derivable metrics render "—" (never a fabricated number / fake 0). */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <span className="truncate text-[11px] text-gray-500 dark:text-gray-400">{k.label}</span>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-gray-900 dark:text-white">
                {loadingObjects && !realLoaded ? '…' : k.value}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Discovery — real findings computed from the loaded objects. CTAs are
          wired to the actual module routes; no fabricated metrics. */}
      {realLoaded && discovery.length > 0 && (
        <section>
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Discovery</h3>
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300">
              données réelles
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {discovery.map((d) => (
              <div key={d.title} className="flex flex-col rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                <div className="mb-1 flex items-center gap-1.5">
                  <d.icon className={`h-3.5 w-3.5 text-${d.tone}-500`} />
                  <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{d.cat}</span>
                </div>
                <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{d.title}</p>
                <p className="mt-0.5 text-sm font-bold text-gray-900 dark:text-white">{d.metric}</p>
                <p className="mt-0.5 flex-1 text-[11px] text-gray-500 dark:text-gray-400">{d.sub}</p>
                <button onClick={() => router.push(d.route)} className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
                  {d.cta} <ArrowRight className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Explorer table */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Boxes className="h-4 w-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Explorer</h3>
          {realLoaded && objects.length > 0 && (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300">
              données réelles · {objects.length}
            </span>
          )}
        </div>
        {realLoaded && enrichDegraded && (
          <div className="mb-2 flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            ACCESS_HISTORY indisponible — usage &amp; coût par objet non disponibles (édition / privilège). Stockage affiché.
          </div>
        )}
        {(dbFilter || schemaFilter) && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="text-gray-400">Hiérarchie :</span>
            {dbFilter && (
              <button
                onClick={() => { setDbFilter(null); setSchemaFilter(null); setPage(0); }}
                className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700 hover:bg-indigo-100 dark:bg-indigo-900/30 dark:text-indigo-300"
              >
                {dbFilter} ✕
              </button>
            )}
            {schemaFilter && (
              <>
                <span className="text-gray-300">/</span>
                <button
                  onClick={() => { setSchemaFilter(null); setPage(0); }}
                  className="rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-700 hover:bg-sky-100 dark:bg-sky-900/30 dark:text-sky-300"
                >
                  {schemaFilter} ✕
                </button>
              </>
            )}
            <span className="text-gray-400">· {filtered.length} objets</span>
          </div>
        )}
        {loadingObjects && !realLoaded ? (
          <div className="h-48 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
        ) : !selected ? (
          <div className="rounded-xl border border-gray-200 bg-white p-8 text-center dark:border-gray-700 dark:bg-gray-900">
            <Database className="mx-auto mb-2 h-6 w-6 text-gray-300 dark:text-gray-600" />
            <p className="text-sm font-medium text-gray-600 dark:text-gray-300">Aucun objet de stockage détecté</p>
            <p className="mt-1 text-xs text-gray-400">
              ACCOUNT_USAGE.TABLE_STORAGE_METRICS n’a renvoyé aucune ligne pour ce compte.
            </p>
          </div>
        ) : (
        <>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-900">
          <table className="w-full text-left text-[11px]">
            <thead className="border-b border-gray-200 dark:border-gray-700">
              <tr className="text-gray-500 dark:text-gray-400">
                {['Object Name', 'Type', 'Database', 'Schema', 'Owner', 'AI Score', 'Storage', 'Perf risk', 'Security risk', 'Roles / Projects', 'Used in', 'Migration', 'Cost Impact', 'Next Best Action'].map((h) => (
                  <th key={h} className="whitespace-nowrap px-2.5 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {paged.map((o) => {
                const M = MIGRATION_META[o.migration];
                return (
                  <tr
                    key={`${o.db}.${o.schema}.${o.name}`}
                    onClick={() => setSelected(o)}
                    className={`cursor-pointer border-b border-gray-100 last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50 ${selected?.name === o.name ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''}`}
                  >
                    <td className="whitespace-nowrap px-2.5 py-1.5 font-medium text-gray-900 dark:text-gray-100">{o.name}</td>
                    <td className="px-2.5 py-1.5 text-gray-500">{o.type}</td>
                    <td className="px-2.5 py-1.5">
                      <button onClick={(e) => { e.stopPropagation(); pickDb(o.db); }} className="text-indigo-600 hover:underline dark:text-indigo-400" title="Filtrer par base">{o.db || '—'}</button>
                    </td>
                    <td className="px-2.5 py-1.5">
                      <button onClick={(e) => { e.stopPropagation(); pickSchema(o.schema); }} className="text-sky-600 hover:underline dark:text-sky-400" title="Filtrer par schéma">{o.schema || '—'}</button>
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-1.5 text-gray-600 dark:text-gray-300">{o.owner}</td>
                    <td className="px-2.5 py-1.5">
                      {o.aiScore != null ? (
                        <span className={`rounded-full px-1.5 py-0.5 font-semibold ${o.aiScore >= 80 ? RISK_TONE.Low : o.aiScore >= 65 ? RISK_TONE.Medium : RISK_TONE.High}`}>{o.aiScore}</span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-1.5 text-gray-700 dark:text-gray-300">{o.storage}</td>
                    <td className="px-2.5 py-1.5">{o.perfRisk ? <span className={`rounded px-1.5 py-0.5 ${RISK_TONE[o.perfRisk]}`}>{o.perfRisk}</span> : <span className="text-gray-400">—</span>}</td>
                    <td className="px-2.5 py-1.5">{o.secRisk ? <span className={`rounded px-1.5 py-0.5 ${RISK_TONE[o.secRisk]}`}>{o.secRisk}</span> : <span className="text-gray-400">—</span>}</td>
                    <td className="whitespace-nowrap px-2.5 py-1.5 text-gray-500">{(!realLoaded || o.enriched) && o.roles != null && o.projects != null ? `${o.roles}r · ${o.projects}p` : '—'}</td>
                    <td className="px-2.5 py-1.5 text-gray-500">{(!realLoaded || o.enriched) && o.products != null ? `${o.products} prod.` : '—'}</td>
                    <td className="px-2.5 py-1.5"><span className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium ${M.tone}`}><M.icon className="h-3 w-3" />{M.label}</span></td>
                    <td className="whitespace-nowrap px-2.5 py-1.5"><span className="text-gray-700 dark:text-gray-300">{o.cost}</span> <span className="text-gray-400">{o.costMo}</span></td>
                    <td className="whitespace-nowrap px-2.5 py-1.5"><span className="rounded-lg border border-gray-200 px-2 py-0.5 text-primary dark:border-gray-700">{o.nextAction}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {pageCount > 1 && (
            <div className="flex items-center justify-between border-t border-gray-100 px-3 py-2 text-[11px] text-gray-500 dark:border-gray-800">
              <span>{filtered.length} objets · page {safePage + 1}/{pageCount}</span>
              <span className="flex items-center gap-1.5">
                <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} className="rounded px-2 py-0.5 enabled:hover:bg-gray-100 disabled:opacity-40 dark:enabled:hover:bg-gray-800">‹ Préc.</button>
                <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1} className="rounded px-2 py-0.5 enabled:hover:bg-gray-100 disabled:opacity-40 dark:enabled:hover:bg-gray-800">Suiv. ›</button>
              </span>
            </div>
          )}
        </div>
          <ActionRail o={selected} onGo={(r) => router.push(r)} />
        </div>
        </>
        )}
      </section>

      {/* Detail panel */}
      {selected && (
      <section className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-900">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <Table2 className="h-4 w-4 text-indigo-500" />
          <h3 className="text-sm font-bold text-gray-900 dark:text-white">{selected.name}</h3>
          <span className="text-[11px] text-gray-400">{selected.type} · {selected.db}.{selected.schema} · Owner: {selected.owner}</span>
          <span className={`ml-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${MIGRATION_META[selected.migration].tone}`}>
            {MIGRATION_META[selected.migration].label}
          </span>
        </div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {selected.tags.map((t) => (
            <span key={t} className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">{t}</span>
          ))}
        </div>
        <div className="mb-3">
          <AdnStrip o={selected} />
        </div>
        <div className="mb-3 flex flex-wrap gap-4 border-b border-gray-100 pb-2 text-[12px] dark:border-gray-800">
          {(['Summary', 'Lineage', 'Governance', 'Cost & Performance', 'Usage'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setDetailTab(t)}
              className={`pb-1 ${detailTab === t ? 'border-b-2 border-primary font-semibold text-primary' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}
            >
              {t}
            </button>
          ))}
        </div>

        {detailTab === 'Summary' && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
            <DetailBox title="Overview"><Kv k="Rows" v={selected.rows} /><Kv k="Columns" v={selected.cols != null ? String(selected.cols) : '—'} /></DetailBox>
            <DetailBox title="Storage & Time Travel"><Kv k="Total Size" v={selected.storage} /><Kv k="Time Travel" v={selected.timeTravel} /></DetailBox>
            <DetailBox title="Governance & Security"><Kv k="Sensitivity" v={selected.sensitivity} tone={selected.sensitivity === 'Sensitive' || selected.sensitivity === 'Restricted' ? 'rose' : undefined} /><Kv k="Classification" v={selected.classification} tone={selected.classification === 'PII' ? 'rose' : undefined} /><Kv k="Policy" v={selected.policy} tone={selected.policy !== '—' ? 'emerald' : undefined} /></DetailBox>
            <DetailBox title="Linked To"><Kv k="Roles" v={selected.roles != null ? String(selected.roles) : '—'} /><Kv k="Projects" v={selected.projects != null ? String(selected.projects) : '—'} /><Kv k="Products" v={selected.products != null ? String(selected.products) : '—'} /></DetailBox>
            {/* Honest storage-derived signals only — no invented "AI" claims. */}
            <DetailBox title="Storage Signals"><li className="text-[11px] text-gray-600 dark:text-gray-300">{selected.costMo !== '—' ? `Est. monthly cost ${selected.costMo}` : 'Monthly cost not available'}</li><li className="text-[11px] text-gray-600 dark:text-gray-300">{selected.tags.includes('Clustered') ? 'Clustering key defined' : 'No clustering key'}</li></DetailBox>
            <DetailBox title="Opportunities"><li className="text-[11px] text-gray-600 dark:text-gray-300">Model in Data360 ({MIGRATION_META[selected.migration].label})</li><li className="text-[11px] text-gray-600 dark:text-gray-300">Expose as API with cache</li></DetailBox>
          </div>
        )}
        {detailTab === 'Lineage' && (
          <LineageFlow object={selected.name} db={selected.db} schema={selected.schema} />
        )}
        {detailTab === 'Governance' && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <DetailBox title="Sensitivity"><Kv k="Level" v={selected.sensitivity} /><Kv k="Classification" v={selected.classification} /></DetailBox>
            <DetailBox title="Policies"><Kv k="Row Access" v={selected.policy} /><Kv k="Masking" v={selected.classification === 'PII' ? 'À appliquer' : '—'} /></DetailBox>
            <DetailBox title="Access"><Kv k="Roles" v={selected.roles != null ? `${selected.roles} roles` : '—'} /><Kv k="Over-granted" v={selected.secRisk == null ? '—' : selected.secRisk === 'High' ? 'Oui' : 'Non'} /></DetailBox>
          </div>
        )}
        {detailTab === 'Cost & Performance' && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <DetailBox title="Coût">
              <Kv k="Impact" v={selected.cost} />
              <Kv k="Stockage (est.)" v={selected.storageUsd != null ? `$${selected.storageUsd.toLocaleString()}/mo` : '—'} />
              <Kv k="Compute attribué" v={selected.attributedUsd != null ? `$${selected.attributedUsd.toLocaleString()}` : '—'} tone={selected.attributedUsd != null ? 'amber' : undefined} />
              <Kv k="Crédits attribués" v={selected.attributedCredits != null ? safeToFixed(selected.attributedCredits, 2) : '—'} />
              <Kv k="Requêtes facturables" v={selected.billableQueries != null ? String(selected.billableQueries) : '—'} />
            </DetailBox>
            <DetailBox title="Performance"><Kv k="Perf risk" v={selected.perfRisk ?? '—'} /><Kv k="Storage" v={selected.storage} /></DetailBox>
            <DetailBox title="Optimisation"><li className="text-[11px] text-gray-600 dark:text-gray-300">Right-size / cluster</li><li className="text-[11px] text-gray-600 dark:text-gray-300">Lower Time-Travel</li></DetailBox>
          </div>
        )}
        {detailTab === 'Usage' && (
          enrichDegraded ? (
            <div className="flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              ACCESS_HISTORY indisponible — usage par rôle / projet / produit non calculable sur cette édition.
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
              <DetailBox title="Accès">
                <Kv k="Requêtes" v={selected.accessCount != null ? selected.accessCount.toLocaleString() : '—'} />
                <Kv k="Utilisateurs" v={selected.distinctUsers != null ? String(selected.distinctUsers) : '—'} />
                <Kv k="Dernier accès" v={fmtDate(selected.lastAccessed)} />
              </DetailBox>
              <DetailBox title="Rôles accédants">
                <Kv k="Distinct" v={(!realLoaded || selected.enriched) && selected.roles != null ? `${selected.roles} roles` : '—'} />
                {selected.rolesSample && selected.rolesSample.length > 0 && (
                  <li className="flex flex-wrap gap-1 pt-1">
                    {selected.rolesSample.map((r) => (
                      <span key={r} className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">{r}</span>
                    ))}
                  </li>
                )}
              </DetailBox>
              <DetailBox title="Projets liés">
                <Kv k="Projets" v={(!realLoaded || selected.enriched) && selected.projects != null ? `${selected.projects} projects` : '—'} />
              </DetailBox>
              <DetailBox title="Produits">
                <Kv k="Used in" v={(!realLoaded || selected.enriched) && selected.products != null ? `${selected.products} products` : '—'} />
              </DetailBox>
            </div>
          )
        )}
      </section>
      )}
    </div>
  );
}

function DetailBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-100 bg-gray-50/60 p-3 dark:border-gray-800 dark:bg-gray-800/30">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{title}</p>
      <ul className="space-y-1">{children}</ul>
    </div>
  );
}
function Kv({ k, v, tone }: { k: string; v: string; tone?: string }) {
  return (
    <li className="flex items-center justify-between text-[11px]">
      <span className="text-gray-500 dark:text-gray-400">{k}</span>
      <span className={`font-medium ${tone ? `text-${tone}-600 dark:text-${tone}-400` : 'text-gray-800 dark:text-gray-200'}`}>{v}</span>
    </li>
  );
}

// ── ADN migration axes (the 6 dimensions that decide migration readiness) ─────
function riskScore(r: 'Low' | 'Medium' | 'High') {
  return r === 'Low' ? 90 : r === 'Medium' ? 65 : 40;
}
interface AdnAxis { key: string; label: string; score: number | null }
function adnAxes(o: SampleObject): AdnAxis[] {
  // 5 axes — Sécurité folds in governance + access; "Accès" renamed to "Sécurité".
  // Only axes backed by a REAL signal get a number:
  //   DQ    — no quality/AI-scan feed in this payload → unknown ("—").
  //   PERF  — threshold read of real clustering/row-count fields (null → "—").
  //   SEC   — no masking/RLS/policy-reference signal in the payload → "—".
  //   STORAGE — threshold read of the real storage size.
  //   USAGE — a real project COUNT exists but no measured usage *score*; we
  //           refuse to synthesize one (was `35 + projects*9`) → "—".
  return [
    { key: 'DQ', label: 'Qualité', score: o.aiScore },
    { key: 'PERF', label: 'Perf', score: o.perfRisk ? riskScore(o.perfRisk) : null },
    { key: 'SEC', label: 'Sécurité', score: null },
    { key: 'STORAGE', label: 'Stockage', score: o.cost === 'High' ? 45 : o.cost === 'Medium' ? 70 : 90 },
    { key: 'USAGE', label: 'Usage', score: null },
  ];
}
function scoreTone(s: number | null) {
  if (s == null) return 'gray';
  return s >= 80 ? 'emerald' : s >= 60 ? 'amber' : 'rose';
}
function AdnStrip({ o }: { o: SampleObject }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">ADN migration</span>
      {adnAxes(o).map((a) => {
        const t = scoreTone(a.score);
        const Ic = AXIS_ICON[a.key];
        return (
          <span
            key={a.key}
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium bg-${t}-100 text-${t}-700 dark:bg-${t}-900/30 dark:text-${t}-300`}
            title={a.score != null ? `${a.label} : ${a.score}/100` : `${a.label} : indisponible`}
          >
            {Ic && <Ic className="h-3 w-3" />}
            {a.label} <strong>{a.score != null ? a.score : '—'}</strong>
          </span>
        );
      })}
    </div>
  );
}

// ── migration action rail (start migrating into Data360 modules) ──────────────
const MIGRATION_CTAS = [
  { key: 'govern', icon: ShieldCheck, title: 'Govern in Governance', desc: 'Classification, policies, owners + access reviews.', route: '/governance', tone: 'indigo' },
  { key: 'model', icon: BoxesIcon, title: 'Model in Data360', desc: 'Create a governed product / add to a data model.', route: '/explore-design', tone: 'blue' },
  { key: 'api', icon: Zap, title: 'Expose as API', desc: 'Publish as a governed API with caching + observability.', route: '/governance/oauth', tone: 'amber' },
];
function ActionRail({ o, onGo }: { o: SampleObject; onGo: (route: string) => void }) {
  return (
    <aside className="h-fit rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
      <div className="mb-1 flex items-center gap-1.5">
        <Rocket className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold text-gray-900 dark:text-white">Migrer vers Data360</span>
      </div>
      <p className="mb-2 text-[11px] text-gray-500 dark:text-gray-400">
        Contexte : <strong className="text-gray-700 dark:text-gray-300">{o.name}</strong> · classe{' '}
        <span className={`rounded px-1 ${MIGRATION_META[o.migration].tone}`}>{MIGRATION_META[o.migration].label}</span>
      </p>
      <div className="space-y-2">
        {MIGRATION_CTAS.map((c) => (
          <button
            key={c.key}
            onClick={() => onGo(c.route)}
            className="flex w-full items-start gap-2 rounded-lg border border-gray-200 p-2 text-left transition-colors hover:border-primary dark:border-gray-700"
          >
            <c.icon className={`mt-0.5 h-4 w-4 shrink-0 text-${c.tone}-500`} />
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-semibold text-gray-900 dark:text-gray-100">{c.title}</span>
              <span className="block text-[10px] text-gray-500 dark:text-gray-400">{c.desc}</span>
              <span className="mt-0.5 block text-[9px] font-medium text-primary">Context prefilled</span>
            </span>
            <ArrowRight className="mt-1 h-3.5 w-3.5 shrink-0 text-gray-400" />
          </button>
        ))}
      </div>
      <p className="mt-2 flex items-center gap-1 text-[9px] text-gray-400">
        <Lock className="h-2.5 w-2.5" /> All actions pass the selected context
      </p>
    </aside>
  );
}

// ── real-data sub-tab (AuditTable from a live endpoint) ───────────────────────
function LiveTableSub({ loader, title, subtitle }: { loader: () => Promise<{ data?: Row[] } | null>; title: string; subtitle: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setLoading(true);
    loader()
      .then((r) => active && setRows((r?.data ?? []) as Row[]))
      .catch(() => active && setRows([]))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (loading) return <div className="h-48 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />;
  return <AuditTable rows={rows} title={title} subtitle={subtitle} />;
}

export default function SnowflakeObjectsTab() {
  const [sub, setSub] = useState<SubTab>('Overview');

  return (
    <div>
      {/* sub-tab bar */}
      <div className="mb-4 flex flex-wrap gap-1 border-b border-gray-200 dark:border-gray-700">
        {SUBTABS.map((t) => (
          <button
            key={t}
            onClick={() => setSub(t)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
              sub === t
                ? 'border-primary text-primary'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {sub === 'Overview' && <OverviewSub />}
      {sub === 'Databases' && <LiveTableSub loader={() => getTableStorage(500)} title="Inventaire stockage par table (proxy databases/schemas)" subtitle="ACCOUNT_USAGE.TABLE_STORAGE_METRICS" />}
      {sub === 'Schemas' && <LiveTableSub loader={() => getTableStorage(500)} title="Objets par schéma" subtitle="ACCOUNT_USAGE.TABLE_STORAGE_METRICS" />}
      {sub === 'Objects' && <LiveTableSub loader={() => getTableStorage(1000)} title="Tous les objets avec stockage" subtitle="ACCOUNT_USAGE.TABLE_STORAGE_METRICS" />}
      {sub === 'Tasks & Pipelines' && <LiveTableSub loader={() => getTaskHistory(30)} title="Tasks — exécutions & coût serverless" subtitle="ACCOUNT_USAGE.TASK_HISTORY" />}
      {sub === 'Governance' && <LiveTableSub loader={() => getRoleHierarchy()} title="Hiérarchie de rôles & grants" subtitle="SHOW ROLES" />}
      {sub === 'Cost & Performance' && <LiveTableSub loader={() => getCostByWarehouse(30)} title="Coût par warehouse" subtitle="ACCOUNT_USAGE.WAREHOUSE_METERING_HISTORY" />}
      {sub === 'Activity' && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-xs text-gray-400 dark:border-gray-700 dark:bg-gray-900">
          Activité par objet — branché sur <code>/command-center/audit/access-history</code> après validation UX. <SamplePill />
        </div>
      )}
    </div>
  );
}
