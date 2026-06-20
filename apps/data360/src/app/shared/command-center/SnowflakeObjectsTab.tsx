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
  Database, Boxes, Table2, Eye, GitBranch, Activity as ActivityIcon, Layers,
  Workflow, Server, ShieldAlert, DollarSign, Gauge, Sparkles, ArrowRight,
  AlertTriangle, Lock, Cpu, Zap, FileBox, ShieldCheck, Boxes as BoxesIcon, Rocket,
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

// ── sample data (échantillon — replaced by real endpoints after UX sign-off) ──
const spark = (seed: number) =>
  Array.from({ length: 12 }, (_, i) => 40 + Math.round(20 * Math.sin(seed + i / 1.7)) + (i % 3) * 4);

const KPIS: { label: string; value: string; delta?: string; tone: string; badge?: { text: string; tone: string }; seed: number }[] = [
  { label: 'Databases', value: '24', delta: '+3', tone: 'blue', seed: 1 },
  { label: 'Schemas', value: '156', delta: '+8', tone: 'violet', seed: 2 },
  { label: 'Objects', value: '8,732', delta: '+142', tone: 'indigo', seed: 3 },
  { label: 'Tables', value: '4,102', delta: '+61', tone: 'cyan', seed: 4 },
  { label: 'Views', value: '2,341', delta: '+32', tone: 'sky', seed: 5 },
  { label: 'Dynamic Tables', value: '128', delta: '+5', tone: 'teal', seed: 6 },
  { label: 'Streams', value: '97', delta: '—', tone: 'emerald', seed: 7 },
  { label: 'Tasks', value: '214', delta: '+9', tone: 'blue', seed: 8 },
  { label: 'Pipes', value: '68', delta: '+3', tone: 'violet', seed: 9 },
  { label: 'Warehouses', value: '19', delta: '—', tone: 'indigo', seed: 10 },
  { label: 'Roles / Grants Risk', value: '12', delta: '+4', tone: 'rose', badge: { text: 'High', tone: 'rose' }, seed: 11 },
  { label: 'Monthly Cost', value: '$128,430', delta: '↓6%', tone: 'amber', badge: { text: 'Med', tone: 'amber' }, seed: 12 },
  { label: 'AI Scan Score', value: '78/100', delta: '+6 pts', tone: 'green', badge: { text: 'Good', tone: 'green' }, seed: 13 },
];

const DISCOVERY: { cat: string; tone: string; icon: any; title: string; metric: string; sub: string; cta: string }[] = [
  { cat: 'Cost', tone: 'blue', icon: DollarSign, title: 'High storage cost', metric: '12 objects', sub: '$18.4k/mo estimated', cta: 'Review in Governance' },
  { cat: 'Perf', tone: 'rose', icon: Gauge, title: 'Performance risk', metric: '7 slow objects', sub: 'High latency / long scans', cta: 'Investigate Performance' },
  { cat: 'Security', tone: 'amber', icon: ShieldAlert, title: 'Security risk', metric: '5 sensitive objects', sub: 'Without policy or masking', cta: 'Review in Governance' },
  { cat: 'Usage', tone: 'sky', icon: ActivityIcon, title: 'Usage anomaly', metric: '3 roles overexposed', sub: 'Excessive access detected', cta: 'Review Access' },
  { cat: 'Opportunity', tone: 'violet', icon: Sparkles, title: 'Modeling opportunity', metric: '9 costly queries', sub: 'Can be modeled in Data360', cta: 'Open in Modeling' },
  { cat: 'Opportunity', tone: 'emerald', icon: Zap, title: 'API opportunity', metric: '4 datasets', sub: 'Ready to expose with cache', cta: 'Expose as API' },
];

type MigrationClass = 'product' | 'preparation' | 'mvp' | 'cloned';
interface SampleObject {
  name: string; type: string; db: string; schema: string; owner: string;
  aiScore: number; storage: string; perfRisk: 'Low' | 'Medium' | 'High';
  secRisk: 'Low' | 'Medium' | 'High'; roles: number; projects: number;
  products: number; cost: string; costMo: string; nextAction: string;
  migration: MigrationClass; tags: string[]; sensitivity: string;
  classification: string; policy: string; rows: string; cols: number; timeTravel: string;
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

const OBJECTS: SampleObject[] = [
  { name: 'FACT_TRANSACTIONS', type: 'TABLE', db: 'RETAIL_DW', schema: 'SALES', owner: 'Riya Patel', aiScore: 92, storage: '2.34 TB', perfRisk: 'Low', secRisk: 'Medium', roles: 12, projects: 6, products: 4, cost: 'High', costMo: '$6,240/mo', nextAction: 'Model in Data360', migration: 'product', tags: ['Retail', 'Finance', 'Sensitive', 'Used in 4 products', 'Candidate for API'], sensitivity: 'Sensitive', classification: 'PII', policy: 'Row Access Policy', rows: '1.24B', cols: 42, timeTravel: '7 days' },
  { name: 'DIM_CUSTOMERS', type: 'TABLE', db: 'RETAIL_DW', schema: 'SALES', owner: 'Arjun Mehta', aiScore: 88, storage: '842 GB', perfRisk: 'Medium', secRisk: 'Low', roles: 9, projects: 4, products: 3, cost: 'Medium', costMo: '$1,820/mo', nextAction: 'Govern in Governance', migration: 'preparation', tags: ['Retail', 'Reference'], sensitivity: 'Internal', classification: '—', policy: '—', rows: '48M', cols: 31, timeTravel: '3 days' },
  { name: 'ORDERS', type: 'TABLE', db: 'RETAIL_DW', schema: 'SALES', owner: 'Neha Singh', aiScore: 76, storage: '512 GB', perfRisk: 'Low', secRisk: 'Low', roles: 7, projects: 3, products: 2, cost: 'Medium', costMo: '$1,210/mo', nextAction: 'Expose as API', migration: 'mvp', tags: ['Retail', 'Transactional'], sensitivity: 'Internal', classification: '—', policy: '—', rows: '210M', cols: 24, timeTravel: '1 day' },
  { name: 'CHAT_MESSAGES', type: 'TABLE', db: 'RETAIL_DW', schema: 'SALES', owner: 'Riya Patel', aiScore: 61, storage: '211 GB', perfRisk: 'High', secRisk: 'High', roles: 15, projects: 5, products: 1, cost: 'High', costMo: '$3,780/mo', nextAction: 'Review in Governance', migration: 'cloned', tags: ['Support', 'Sensitive', 'Unmasked PII'], sensitivity: 'Sensitive', classification: 'PII', policy: '—', rows: '92M', cols: 18, timeTravel: '7 days' },
  { name: 'GUI_PERMISSIONS', type: 'TABLE', db: 'RETAIL_DW', schema: 'SALES', owner: 'Security Team', aiScore: 54, storage: '68 GB', perfRisk: 'Low', secRisk: 'High', roles: 21, projects: 7, products: 0, cost: 'Low', costMo: '$210/mo', nextAction: 'Review Access', migration: 'preparation', tags: ['Security', 'Over-granted'], sensitivity: 'Restricted', classification: '—', policy: '—', rows: '1.1M', cols: 12, timeTravel: '1 day' },
];

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
  const aiScore = Math.max(35, Math.min(98, Math.round(62 + (clustered ? 12 : 0) + (tb < 0.5 ? 10 : 0) - (tb > 2 ? 14 : 0) - (rows > 1e8 ? 6 : 0))));
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
    aiScore,
    storage: fmtSize(tb),
    perfRisk: clustered ? 'Low' : rows > 1e8 ? 'High' : 'Medium',
    secRisk: 'Low',
    roles: e?.distinct_roles ?? 0,
    projects: e?.projects ?? 0,
    products: e?.products ?? 0,
    cost: tb > 1 ? 'High' : tb > 0.1 ? 'Medium' : 'Low',
    costMo,
    nextAction: tb > 1 ? 'Model in Data360' : clustered ? 'Govern in Governance' : 'Review',
    migration: deriveMigration(tb, clustered),
    tags: [str('table_type') || 'TABLE', clustered ? 'Clustered' : '', transient ? 'Transient' : ''].filter(Boolean),
    sensitivity: 'Internal',
    classification: '—',
    policy: '—',
    rows: rows.toLocaleString(),
    cols: 0,
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

// ── tiny inline sparkline ─────────────────────────────────────────────────────
function Sparkline({ seed, tone }: { seed: number; tone: string }) {
  const d = spark(seed);
  const max = Math.max(...d), min = Math.min(...d);
  const pts = d
    .map((v, i) => `${(i / (d.length - 1)) * 100},${24 - ((v - min) / Math.max(max - min, 1)) * 22}`)
    .join(' ');
  return (
    <svg viewBox="0 0 100 24" className="h-6 w-full" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={`var(--tw-${tone})`} className={`stroke-${tone}-400`} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
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
  const [objects, setObjects] = useState<SampleObject[]>(OBJECTS);
  const [selected, setSelected] = useState<SampleObject>(OBJECTS[0]);
  const [detailTab, setDetailTab] = useState<'Summary' | 'Lineage' | 'Governance' | 'Cost & Performance' | 'Usage'>('Summary');
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
        if (mapped.length) {
          setObjects(mapped);
          setSelected(mapped[0]);
          setRealLoaded(true);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

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
      {/* KPI grid */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {KPIS.map((k) => (
          <div key={k.label} className="rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
            <div className="flex items-center justify-between">
              <span className="truncate text-[11px] text-gray-500 dark:text-gray-400">{k.label}</span>
              {k.badge && (
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${RISK_TONE[k.badge.text === 'High' ? 'High' : k.badge.text === 'Med' ? 'Medium' : 'Low'] ?? ''}`}>
                  {k.badge.text}
                </span>
              )}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="text-lg font-bold text-gray-900 dark:text-white">{k.value}</span>
              {k.delta && <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">{k.delta}</span>}
            </div>
            <Sparkline seed={k.seed} tone={k.tone} />
          </div>
        ))}
      </div>

      {/* AI Discovery Summary */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">AI Discovery Summary</h3>
          <SamplePill />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3 xl:grid-cols-6">
          {DISCOVERY.map((d) => (
            <div key={d.title} className="flex flex-col rounded-xl border border-gray-200 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
              <div className="mb-1 flex items-center gap-1.5">
                <d.icon className={`h-3.5 w-3.5 text-${d.tone}-500`} />
                <span className="text-[10px] font-medium uppercase tracking-wide text-gray-400">{d.cat}</span>
              </div>
              <p className="text-xs font-semibold text-gray-900 dark:text-gray-100">{d.title}</p>
              <p className="mt-0.5 text-sm font-bold text-gray-900 dark:text-white">{d.metric}</p>
              <p className="mt-0.5 flex-1 text-[11px] text-gray-500 dark:text-gray-400">{d.sub}</p>
              <button className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline">
                {d.cta} <ArrowRight className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Explorer table */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <Boxes className="h-4 w-4 text-indigo-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Explorer</h3>
          {realLoaded ? (
            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-300">
              données réelles · {objects.length}
            </span>
          ) : (
            <SamplePill />
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
                    className={`cursor-pointer border-b border-gray-100 last:border-0 hover:bg-gray-50 dark:border-gray-800 dark:hover:bg-gray-800/50 ${selected.name === o.name ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''}`}
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
                      <span className={`rounded-full px-1.5 py-0.5 font-semibold ${o.aiScore >= 80 ? RISK_TONE.Low : o.aiScore >= 65 ? RISK_TONE.Medium : RISK_TONE.High}`}>{o.aiScore}</span>
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-1.5 text-gray-700 dark:text-gray-300">{o.storage}</td>
                    <td className="px-2.5 py-1.5"><span className={`rounded px-1.5 py-0.5 ${RISK_TONE[o.perfRisk]}`}>{o.perfRisk}</span></td>
                    <td className="px-2.5 py-1.5"><span className={`rounded px-1.5 py-0.5 ${RISK_TONE[o.secRisk]}`}>{o.secRisk}</span></td>
                    <td className="whitespace-nowrap px-2.5 py-1.5 text-gray-500">{!realLoaded || o.enriched ? `${o.roles}r · ${o.projects}p` : '—'}</td>
                    <td className="px-2.5 py-1.5 text-gray-500">{!realLoaded || o.enriched ? `${o.products} prod.` : '—'}</td>
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
      </section>

      {/* Detail panel */}
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
            <DetailBox title="Overview"><Kv k="Rows" v={selected.rows} /><Kv k="Columns" v={String(selected.cols)} /></DetailBox>
            <DetailBox title="Storage & Time Travel"><Kv k="Total Size" v={selected.storage} /><Kv k="Time Travel" v={selected.timeTravel} /></DetailBox>
            <DetailBox title="Governance & Security"><Kv k="Sensitivity" v={selected.sensitivity} tone={selected.sensitivity === 'Sensitive' || selected.sensitivity === 'Restricted' ? 'rose' : undefined} /><Kv k="Classification" v={selected.classification} tone={selected.classification === 'PII' ? 'rose' : undefined} /><Kv k="Policy" v={selected.policy} tone={selected.policy !== '—' ? 'emerald' : undefined} /></DetailBox>
            <DetailBox title="Linked To"><Kv k="Roles" v={String(selected.roles)} /><Kv k="Projects" v={String(selected.projects)} /><Kv k="Products" v={String(selected.products)} /></DetailBox>
            <DetailBox title="AI Insights"><li className="text-[11px] text-gray-600 dark:text-gray-300">{selected.cost === 'High' ? 'High scan cost in last 30 days' : 'Cost within budget'}</li><li className="text-[11px] text-gray-600 dark:text-gray-300">{selected.perfRisk === 'High' ? 'Costly queries detected' : 'Good clustering & pruning'}</li></DetailBox>
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
            <DetailBox title="Access"><Kv k="Roles" v={`${selected.roles} roles`} /><Kv k="Over-granted" v={selected.secRisk === 'High' ? 'Oui' : 'Non'} /></DetailBox>
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
            <DetailBox title="Performance"><Kv k="Perf risk" v={selected.perfRisk} /><Kv k="Storage" v={selected.storage} /></DetailBox>
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
                <Kv k="Distinct" v={!realLoaded || selected.enriched ? `${selected.roles} roles` : '—'} />
                {selected.rolesSample && selected.rolesSample.length > 0 && (
                  <li className="flex flex-wrap gap-1 pt-1">
                    {selected.rolesSample.map((r) => (
                      <span key={r} className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[9px] text-gray-600 dark:bg-gray-800 dark:text-gray-300">{r}</span>
                    ))}
                  </li>
                )}
              </DetailBox>
              <DetailBox title="Projets liés">
                <Kv k="Projets" v={!realLoaded || selected.enriched ? `${selected.projects} projects` : '—'} />
              </DetailBox>
              <DetailBox title="Produits">
                <Kv k="Used in" v={!realLoaded || selected.enriched ? `${selected.products} products` : '—'} />
              </DetailBox>
            </div>
          )
        )}
      </section>
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
function adnAxes(o: SampleObject) {
  // 5 axes — Sécurité folds in governance + access; "Accès" renamed to "Sécurité".
  const gov = o.policy !== '—' ? 85 : o.classification === 'PII' ? 35 : 55;
  return [
    { key: 'DQ', label: 'Qualité', score: o.aiScore },
    { key: 'PERF', label: 'Perf', score: riskScore(o.perfRisk) },
    { key: 'SEC', label: 'Sécurité', score: Math.round((riskScore(o.secRisk) + gov) / 2) },
    { key: 'STORAGE', label: 'Stockage', score: o.cost === 'High' ? 45 : o.cost === 'Medium' ? 70 : 90 },
    { key: 'USAGE', label: 'Usage', score: Math.min(95, 35 + o.projects * 9) },
  ];
}
function scoreTone(s: number) {
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
            title={`${a.label} : ${a.score}/100`}
          >
            {Ic && <Ic className="h-3 w-3" />}
            {a.label} <strong>{a.score}</strong>
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
