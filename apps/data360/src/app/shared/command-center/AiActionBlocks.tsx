'use client';

/**
 * AiActionBlocks — a compact, reusable right-rail panel that turns the
 * Account-Overview AI advisors (recommendations + Snowflake feature insights +
 * per-object enrichment) into AI-prefilled CALL-TO-ACTION BLOCKS.
 *
 * Each block = severity dot + AI-comprehended title + one-line rationale +
 * context chips (the object / project + key metric) + a single primary CTA that
 * `router.push`-es a COHERENT module route with `?intent=…&from=rightbar`, so
 * the target page prefills the action on arrival (the same intent contract the
 * existing ScanPrefillBanner / ProposedPoliciesPanel pages already read).
 *
 * "AI comprehension" here is CLIENT-SIDE synthesis: we fetch the same getters
 * the advisors use, then rank / filter / select the items relevant to the given
 * context (scope = account | module | object | project). We do NOT rewrite the
 * backend titles — the synthesis is the selection.
 *
 * Routing coherence (the task's map):
 *   security / governance / users / network → /governance/*
 *   cost                                    → /account-overview?tab=finops
 *   modeling / storage                      → /explore-design
 *   dq / reliability                        → /data-quality
 *   analysis                                → /bi-dashboard
 *   automation / performance                → /workflow
 * Insights already carry a coherent `action.route` + `action.intent` computed
 * server-side — those are pushed VERBATIM. The coherence map only supplies the
 * missing intent for recommendations, builds routes for object-synthesized
 * blocks, and decides module-membership for scope filtering.
 *
 * Honest states: distinct loading / empty ("Aucune action — sain") / degraded
 * rendering. Never a fake zero — a thrown recommendations call + a failed
 * insights payload render as "Analyse indisponible", not as healthy.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Sparkles, ArrowUpRight, RefreshCw, AlertTriangle, ShieldCheck, Boxes,
} from 'lucide-react';
import {
  getSnowflakeInsights,
  getObjectEnrichment,
  type SnowflakeInsight,
  type ObjectEnrichmentRow,
} from '@/app/services/command-center';
import {
  getCommandCenterRecommendations,
  type Recommendation,
} from '@/app/services/command-center/recommendations';

// ── Public API ──────────────────────────────────────────────────────────────
export type ActionScope = 'account' | 'module' | 'object' | 'project';

export interface AiActionContext {
  scope: ActionScope;
  /** Module identifier when scope = 'module' (free string, normalized). */
  module?: string;
  /** Fully-qualified object "DB.SCHEMA.TABLE" when scope = 'object'. */
  objectFqn?: string;
  /** Active project id when scope = 'project'. */
  projectId?: string;
  /** Human-readable project name (chip label). */
  projectName?: string;
}

export interface AiActionBlocksProps {
  context: AiActionContext;
  /** Max blocks to render (fits a ~320px rail). Default 4. */
  limit?: number;
  /** Panel heading. Default "Actions IA". */
  title?: string;
  /** Analysis window in days (passed to the getters). Default 30. */
  days?: number;
  /** Extra classes for the panel shell. */
  className?: string;
}

// ── Domain types ──────────────────────────────────────────────────────────────
type Sev = 'critical' | 'high' | 'warning' | 'info';
type ModuleKey =
  | 'governance' | 'finops' | 'explore-design'
  | 'data-quality' | 'bi-dashboard' | 'workflow';

interface ActionBlock {
  id: string;
  sev: Sev;
  mod: ModuleKey;
  title: string;
  rationale: string;
  metric: string | null;
  ctaLabel: string;
  href: string;       // fully-built route + ?intent=…&from=rightbar(+object/project)
  priority: number;   // source tie-break: object(0) > insight(1) > rec(2)
}

// ── Static presentation (NO dynamic Tailwind interpolation) ───────────────────
const SEV_META: Record<Sev, { rank: number; dot: string; label: string }> = {
  critical: { rank: 0, dot: 'bg-rose-500', label: 'Critique' },
  high:     { rank: 1, dot: 'bg-orange-500', label: 'Élevé' },
  warning:  { rank: 2, dot: 'bg-amber-500', label: 'Attention' },
  info:     { rank: 3, dot: 'bg-slate-400', label: 'OK' },
};

const MOD_META: Record<ModuleKey, { label: string; badge: string }> = {
  governance:       { label: 'Gouvernance',      badge: 'bg-violet-50 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300' },
  finops:           { label: 'FinOps',           badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300' },
  'explore-design': { label: 'Explore & Design', badge: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300' },
  'data-quality':   { label: 'Data Quality',     badge: 'bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300' },
  'bi-dashboard':   { label: 'BI Dashboard',     badge: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-950/50 dark:text-cyan-300' },
  workflow:         { label: 'Workflow',         badge: 'bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300' },
};

// Dimension / category → coherent module + default route + default intent.
// Used for recommendations (supply the missing intent), object-synthesized
// blocks, and module-membership filtering. Insights push their OWN route.
const COHERENCE: Record<string, { mod: ModuleKey; route: string; intent: string }> = {
  security:    { mod: 'governance', route: '/governance/policies', intent: 'apply' },
  governance:  { mod: 'governance', route: '/governance/policies', intent: 'apply' },
  gov:         { mod: 'governance', route: '/governance/policies', intent: 'apply' },
  users:       { mod: 'governance', route: '/governance/grants',   intent: 'review' },
  network:     { mod: 'governance', route: '/governance/oauth',    intent: 'review' },
  sharing:     { mod: 'governance', route: '/governance/grants',   intent: 'review' },
  cost:        { mod: 'finops', route: '/account-overview?tab=finops', intent: 'optimize' },
  storage:     { mod: 'explore-design', route: '/explore-design', intent: 'model' },
  modeling:    { mod: 'explore-design', route: '/explore-design', intent: 'model' },
  dq:          { mod: 'data-quality', route: '/data-quality', intent: 'enable-dmf' },
  reliability: { mod: 'data-quality', route: '/data-quality', intent: 'enable-dmf' },
  quality:     { mod: 'data-quality', route: '/data-quality', intent: 'enable-dmf' },
  analysis:    { mod: 'bi-dashboard', route: '/bi-dashboard', intent: 'publish' },
  perf:        { mod: 'workflow', route: '/workflow', intent: 'create' },
  performance: { mod: 'workflow', route: '/workflow', intent: 'create' },
  automation:  { mod: 'workflow', route: '/workflow', intent: 'create' },
};

// Modules whose actions are relevant to a single object.
const OBJECT_MODULES = new Set<ModuleKey>(['explore-design', 'governance', 'data-quality', 'finops']);

// ── Pure helpers ──────────────────────────────────────────────────────────────
/** Append intent/from (+ optional object/project) respecting an existing `?`. */
function buildRoute(
  route: string,
  intent: string,
  extra: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();
  params.set('intent', intent);
  params.set('from', 'scan'); // target pages prefill on from=scan → right-bar CTAs land pre-filled, not empty
  for (const [k, v] of Object.entries(extra)) if (v) params.set(k, v);
  const sep = route.includes('?') ? '&' : '?';
  return `${route}${sep}${params.toString()}`;
}

function normalizeModuleKey(m?: string): ModuleKey | null {
  if (!m) return null;
  const s = m.toLowerCase();
  if (/(govern|security|grant|oauth|polic|rbac|access|mfa|network)/.test(s)) return 'governance';
  if (/(finops|cost|billing|credit|spend)/.test(s)) return 'finops';
  if (/(explore|design|model|storage|source|etl|ingest|catalog|product)/.test(s)) return 'explore-design';
  if (/(quality|dq|dmf|reliab)/.test(s)) return 'data-quality';
  if (/(^bi$|\bbi[-_]|dashboard|analy|report)/.test(s)) return 'bi-dashboard';
  if (/(workflow|automation|orchestr|pipeline|task)/.test(s)) return 'workflow';
  return null;
}

function insightModuleKey(i: SnowflakeInsight): ModuleKey {
  const m = i.action.module;
  if (m === 'finops-tab') return 'finops';
  if (m === 'security-tab') return 'governance';
  if (m === 'governance' || m === 'explore-design' || m === 'data-quality' || m === 'workflow' || m === 'bi-dashboard') return m;
  // 'connect' / unknown → derive from the insight category.
  return COHERENCE[i.category]?.mod ?? 'explore-design';
}

function insightMetric(i: SnowflakeInsight): string | null {
  if (i.metric === null || i.metric === undefined || i.metric === '') return null;
  return `${i.metric}${i.unit ? ` ${i.unit}` : ''}`;
}

function recMetric(r: Recommendation): string | null {
  if (r.value === null || r.value === undefined || r.value === '') return null;
  return typeof r.value === 'number' ? r.value.toLocaleString() : String(r.value);
}

function rowFqn(r: ObjectEnrichmentRow): string {
  return `${r.database_name}.${r.schema_name}.${r.table_name}`;
}

// ── Synthesis (the "AI comprehension": rank + filter + select) ────────────────
function synthesize(
  recs: Recommendation[],
  insights: SnowflakeInsight[],
  objRows: ObjectEnrichmentRow[],
  ctx: AiActionContext,
  limit: number,
): ActionBlock[] {
  const extra: Record<string, string | undefined> = {
    object: ctx.objectFqn,
    project: ctx.projectId,
  };

  const candidates: ActionBlock[] = [];

  // 1) Per-object synthesized blocks (only from data we actually have) ─────────
  let matchedRow: ObjectEnrichmentRow | null = null;
  if (ctx.objectFqn) {
    const target = ctx.objectFqn.toLowerCase();
    matchedRow = objRows.find((r) => rowFqn(r).toLowerCase() === target) ?? null;
  }
  if (matchedRow) {
    const r = matchedRow;
    const used = (r.access_count ?? 0) > 0;
    // Not yet a Data360 product → model it.
    if ((r.projects ?? 0) === 0 && (r.products ?? 0) === 0) {
      const c = COHERENCE.modeling;
      candidates.push({
        id: `obj-model-${r.table_name}`, sev: used ? 'high' : 'warning', mod: c.mod, priority: 0,
        title: 'Modéliser cet objet en produit Data360',
        rationale: 'Objet scanné dans l’entrepôt mais non rattaché à un produit/projet — l’IA recommande de le modéliser.',
        metric: r.access_count != null ? `${r.access_count.toLocaleString()} accès` : null,
        ctaLabel: 'Créer un produit',
        href: buildRoute(c.route, c.intent, extra),
      });
    }
    // Attributed compute cost → optimize.
    if (r.attributed_usd != null && r.attributed_usd > 0) {
      const c = COHERENCE.cost;
      candidates.push({
        id: `obj-cost-${r.table_name}`, sev: r.attributed_usd >= 100 ? 'high' : 'warning', mod: c.mod, priority: 0,
        title: 'Optimiser le coût attribué',
        rationale: 'Compute attribué non négligeable sur cet objet — examiner l’optimisation FinOps.',
        metric: `$${r.attributed_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
        ctaLabel: 'Examiner le coût',
        href: buildRoute(c.route, c.intent, extra),
      });
    }
    // Multiple accessing users → review governance.
    if (r.distinct_users != null && r.distinct_users > 0) {
      const c = COHERENCE.users;
      candidates.push({
        id: `obj-gov-${r.table_name}`, sev: (r.distinct_users >= 5 ? 'warning' : 'info'), mod: c.mod, priority: 0,
        title: 'Réviser les accès & la gouvernance',
        rationale: 'Objet accédé par plusieurs utilisateurs — vérifier policies de masquage et grants.',
        metric: `${r.distinct_users} utilisateur${r.distinct_users > 1 ? 's' : ''}`,
        ctaLabel: 'Réviser les accès',
        href: buildRoute(c.route, c.intent, extra),
      });
    }
    // Actively used → enable DQ monitoring.
    if (used) {
      const c = COHERENCE.dq;
      candidates.push({
        id: `obj-dq-${r.table_name}`, sev: 'info', mod: c.mod, priority: 0,
        title: 'Activer le monitoring qualité',
        rationale: 'Objet actif sans mesures de qualité — activer le monitoring (DMF) pour le surveiller.',
        metric: r.last_accessed ? 'actif' : null,
        ctaLabel: 'Activer le DMF',
        href: buildRoute(c.route, c.intent, extra),
      });
    }
  }

  // 2) Snowflake feature insights — push their OWN coherent route verbatim ─────
  for (const i of insights) {
    // `info` = the feature is OK / healthy — not a call-to-action. Skipping it
    // lets a genuinely-clean account fall through to the "Aucune action — sain"
    // empty state instead of rendering "OK" blocks with CTAs.
    if (i.severity === 'info') continue;
    const mod = insightModuleKey(i);
    candidates.push({
      id: `ins-${i.id}`, sev: i.severity, mod, priority: 1,
      title: i.title,
      rationale: i.detail,
      metric: insightMetric(i),
      ctaLabel: i.action.label,
      href: buildRoute(i.action.route, i.action.intent, extra),
    });
  }

  // 3) Cross-module recommendations — supply the missing intent from COHERENCE ─
  for (const rec of recs) {
    const c = COHERENCE[rec.dimension];
    // Prefer the backend-given navigate target; else the coherent route.
    const navTarget =
      rec.cta?.action === 'navigate' && rec.cta.target?.startsWith('/')
        ? rec.cta.target
        : c?.route;
    if (!navTarget) continue; // not a deep-linkable recommendation on this build
    const mod = c?.mod ?? normalizeModuleKey(rec.dimension);
    if (!mod) continue;
    candidates.push({
      id: `rec-${rec.id}`, sev: rec.severity, mod, priority: 2,
      title: rec.title,
      rationale: rec.detail,
      metric: recMetric(rec),
      ctaLabel: rec.cta?.label || `Ouvrir ${MOD_META[mod].label}`,
      href: buildRoute(navTarget, c?.intent ?? 'review', extra),
    });
  }

  // 4) Scope filter ────────────────────────────────────────────────────────────
  let scoped = candidates;
  if (ctx.scope === 'module') {
    const targetMod = normalizeModuleKey(ctx.module);
    if (targetMod) scoped = candidates.filter((b) => b.mod === targetMod);
  } else if (ctx.scope === 'object') {
    // Object's own blocks first, plus account-level actions in object-relevant
    // modules (chipped with the FQN). Honest fallback when no row matched.
    scoped = candidates.filter((b) => b.priority === 0 || OBJECT_MODULES.has(b.mod));
  }
  // 'account' and 'project' keep all candidates ('project' is account-wide data
  // surfaced in project context, chipped with the project name).

  // 5) Rank (severity → source) + dedupe by route ─────────────────────────────
  scoped.sort((a, b) =>
    SEV_META[a.sev].rank - SEV_META[b.sev].rank || a.priority - b.priority,
  );
  const seen = new Set<string>();
  const out: ActionBlock[] = [];
  for (const b of scoped) {
    const key = b.href.split('&from=')[0]; // route + intent identity
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(b);
    if (out.length >= limit) break;
  }
  return out;
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function AiActionBlocks({
  context,
  limit = 4,
  title = 'Actions IA',
  days = 30,
  className = '',
}: AiActionBlocksProps) {
  const router = useRouter();

  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [insights, setInsights] = useState<SnowflakeInsight[]>([]);
  const [objRows, setObjRows] = useState<ObjectEnrichmentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [degradedNote, setDegradedNote] = useState<string[]>([]);

  const { scope, module, objectFqn, projectId, projectName } = context;

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    const tasks: [
      Promise<Awaited<ReturnType<typeof getCommandCenterRecommendations>>>,
      Promise<Awaited<ReturnType<typeof getSnowflakeInsights>>>,
      Promise<Awaited<ReturnType<typeof getObjectEnrichment>> | null>,
    ] = [
      getCommandCenterRecommendations(days),
      getSnowflakeInsights(),
      objectFqn ? getObjectEnrichment(Math.min(days, 90)) : Promise.resolve(null),
    ];

    Promise.allSettled(tasks).then(([recsR, insR, objR]) => {
      if (!active) return;
      const notes: string[] = [];

      // getCommandCenterRecommendations can THROW (no try/catch in the service).
      const recsRejected = recsR.status === 'rejected';
      if (recsRejected) notes.push('recommandations');
      else setRecs(recsR.value.recommendations ?? []);

      // getSnowflakeInsights never throws — it returns a degraded payload.
      let insightsFailed = false;
      if (insR.status === 'fulfilled') {
        setInsights(insR.value.insights ?? []);
        const deg = (insR.value.degraded ?? []).filter((d) => d !== 'request_failed');
        insightsFailed = (insR.value.degraded ?? []).includes('request_failed');
        if (deg.length) notes.push(...deg);
      } else {
        insightsFailed = true;
      }

      // getObjectEnrichment never throws — degraded flag instead.
      if (objectFqn) {
        if (objR.status === 'fulfilled' && objR.value) {
          setObjRows(objR.value.data ?? []);
          if (objR.value.degraded) notes.push('enrichissement objet');
        } else {
          setObjRows([]);
          notes.push('enrichissement objet');
        }
      } else {
        setObjRows([]);
      }

      // Degraded ONLY when every usable source is down — never a fake "sain".
      setFailed(recsRejected && insightsFailed);
      setDegradedNote(Array.from(new Set(notes)));
    }).finally(() => { if (active) setLoading(false); });

    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, objectFqn]);

  useEffect(() => load(), [load]);

  const blocks = useMemo(
    () => synthesize(recs, insights, objRows, context, limit),
    [recs, insights, objRows, context, limit],
  );

  const contextChip = useMemo(() => {
    if (scope === 'object' && objectFqn) return objectFqn.split('.').slice(-2).join('.');
    if (scope === 'project') return projectName || projectId || null;
    if (scope === 'module') {
      const k = normalizeModuleKey(module);
      return k ? MOD_META[k].label : module || null;
    }
    return null;
  }, [scope, objectFqn, projectName, projectId, module]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <section
      className={`rounded-2xl border border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900/60 shadow-sm overflow-hidden ${className}`}
      aria-label="AI action blocks"
    >
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-950/60 dark:text-violet-300">
            <Sparkles className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
              {loading
                ? 'Analyse IA…'
                : failed
                  ? 'Analyse indisponible'
                  : blocks.length > 0
                    ? `${blocks.length} action${blocks.length > 1 ? 's' : ''} prête${blocks.length > 1 ? 's' : ''}`
                    : 'Aucune action requise'}
              {contextChip ? ` · ${contextChip}` : ''}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          aria-label="Rafraîchir l’analyse"
          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50 dark:hover:bg-slate-800"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </header>

      <div className="p-3">
        {loading ? (
          <LoadingState />
        ) : failed ? (
          <DegradedState onRetry={load} />
        ) : blocks.length === 0 ? (
          <EmptyState note={degradedNote} />
        ) : (
          <ul className="space-y-2.5">
            {blocks.map((b) => (
              <BlockCard
                key={b.id}
                block={b}
                contextChip={contextChip}
                onAct={() => router.push(b.href)}
              />
            ))}
            {degradedNote.length > 0 && (
              <li className="flex items-start gap-1.5 px-0.5 pt-1 text-[10px] text-amber-600 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3 w-3 flex-shrink-0" />
                <span>Partiel — analyses indisponibles : {degradedNote.join(', ')}.</span>
              </li>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}

// ── Block card ────────────────────────────────────────────────────────────────
function BlockCard({
  block, contextChip, onAct,
}: { block: ActionBlock; contextChip: string | null; onAct: () => void }) {
  const sev = SEV_META[block.sev];
  const mod = MOD_META[block.mod];
  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3 transition hover:shadow-sm dark:border-slate-700 dark:bg-slate-900/50">
      <div className="flex items-start gap-2">
        <span className={`mt-1 h-2 w-2 flex-shrink-0 rounded-full ${sev.dot}`} aria-hidden />
        <h4 className="line-clamp-2 min-w-0 flex-1 text-[13px] font-semibold leading-snug text-slate-900 dark:text-white">
          {block.title}
        </h4>
        <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium ${mod.badge}`}>
          {mod.label}
        </span>
      </div>

      <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
        {block.rationale}
      </p>

      {(contextChip || block.metric) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {contextChip && (
            <span
              title={contextChip}
              className="max-w-[160px] truncate rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 dark:bg-slate-800 dark:text-slate-400"
            >
              {contextChip}
            </span>
          )}
          {block.metric && (
            <span className="rounded bg-slate-900/5 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-200">
              {block.metric}
            </span>
          )}
        </div>
      )}

      <button
        type="button"
        onClick={onAct}
        className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-slate-700 dark:bg-white dark:text-slate-900 dark:hover:bg-slate-200"
      >
        {block.ctaLabel}
        <ArrowUpRight className="h-3.5 w-3.5" />
      </button>
    </li>
  );
}

// ── States ────────────────────────────────────────────────────────────────────
function LoadingState() {
  return (
    <div className="space-y-2.5 animate-pulse" aria-hidden>
      {[0, 1, 2].map((n) => (
        <div key={n} className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <div className="h-2 w-2 rounded-full bg-slate-200 dark:bg-slate-700" />
            <div className="h-3.5 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
          </div>
          <div className="mt-2 h-3 w-full rounded bg-slate-100 dark:bg-slate-800/60" />
          <div className="mt-2 h-7 w-full rounded-lg bg-slate-200 dark:bg-slate-800" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ note }: { note: string[] }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
        <ShieldCheck className="h-5 w-5" />
      </span>
      <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Aucune action — sain</h4>
      <p className="max-w-[220px] text-[11px] text-slate-500 dark:text-slate-400">
        L’analyse IA n’a rien trouvé à traiter ici pour le moment.
      </p>
      {note.length > 0 && (
        <p className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-3 w-3" /> Partiel : {note.join(', ')}.
        </p>
      )}
    </div>
  );
}

function DegradedState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2.5 py-8 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        <Boxes className="h-5 w-5" />
      </span>
      <div>
        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Analyse indisponible</h4>
        <p className="mt-0.5 max-w-[220px] text-[11px] text-slate-500 dark:text-slate-400">
          Les recommandations IA n’ont pas pu être chargées. C’est généralement temporaire.
        </p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-semibold text-white hover:opacity-90 dark:bg-white dark:text-slate-900"
      >
        <RefreshCw className="h-3.5 w-3.5" /> Réessayer
      </button>
    </div>
  );
}
