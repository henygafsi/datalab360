'use client';

/**
 * SourcesStep — "Where does this data live?"
 *
 * Backed by the NEW /studio module (contract T1, schema studio.v1):
 * getStudioSources() returns the 44 unified, permission-filtered sources.
 * Layout is one-page Lite-compressed: a horizontal FLOW BAR of the selected
 * sources (editable icon chips), a compact multi-select grid with instant
 * search + family filters (bounded height, internal scroll), and a compact
 * honest-status connector catalog. Nothing is auto-selected: discovery ≠
 * inclusion (mission §18).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  Boxes,
  Cloud,
  Database,
  Plug,
  RefreshCw,
  Search,
  Share2,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react';
import { PlainQuestionHeader, QuietAction } from '@/app/shared/studio/PlainKit';
import StudioLimitControl from '@/app/shared/studio/StudioLimitControl';
import {
  createDraftDirect,
  getStudioObjects,
  getStudioSources,
  getStudioSourcesCatalog,
  scanDatalake,
  getPreviewUsage,
  suggestSources,
  type CatalogConnector,
  type StudioSource,
} from '@/app/services/studio/studio-api';
import EmptyState from '@/components/ui/EmptyState';
import { DATABASE_CONFIG } from '@/config/database.config';
import { routes } from '@/config/routes';
import type { JourneyDraft } from './journey';

/* ── Family → icon (sources use object_storage, catalog cloud_storage) ─ */

const FAMILY_ICON: Record<string, LucideIcon> = {
  warehouse: Database,
  cloud_storage: Cloud,
  object_storage: Cloud,
  api: Plug,
  share: Share2,
};

function familyIcon(family?: string): LucideIcon {
  return FAMILY_ICON[family ?? ''] ?? Boxes;
}

/**
 * Brand rule: never show vendor names in customer-facing PROSE.
 *
 * It must never touch an IDENTIFIER. A database really named
 * SNOWFLAKE_INTELLIGENCE has to render as SNOWFLAKE_INTELLIGENCE: the user
 * matches this list against objects in their own warehouse, and rewriting
 * it to « your warehouse_INTELLIGENCE » names something that exists
 * nowhere. So only a standalone vendor word is neutralised — never a word
 * that is part of a larger identifier (underscores, dots, digits).
 */
function neutralLabel(label: string): string {
  const looksLikeIdentifier = /[._]/.test(label) || /^[A-Z0-9_]+$/.test(label);
  if (looksLikeIdentifier) return label;
  return label
    .replace(/\bsnowflake\b/gi, 'your warehouse')
    .replace(/\bcortex\b/gi, 'AI')
    .replace(/\bkimi\b/gi, 'AI');
}

/** Semantic health dot: ok → emerald, unknown/absent → slate, else amber. */
function healthDotClass(s: StudioSource): string {
  const state = s.health?.state;
  if (state === 'ok') return 'bg-emerald-500';
  if (!state || state === 'unknown') return 'bg-slate-300 dark:bg-slate-600';
  return 'bg-amber-400';
}

const CATALOG_STATUS_LABEL: Record<string, string> = {
  available: 'available',
  to_configure: 'to configure',
  partial: 'partial',
  not_integrated: 'not integrated',
};

const CATALOG_STATUS_TONE: Record<string, string> = {
  available: 'text-emerald-600 dark:text-emerald-400',
  to_configure: 'text-amber-600 dark:text-amber-400',
  partial: 'text-amber-600 dark:text-amber-400',
  not_integrated: 'text-slate-400 dark:text-slate-500',
};

/* ── Auto-discovery (user rule: the data should already be found) ────
 * When the step opens with an empty selection, Data360 looks for the
 * data itself: tokens from the need + business context are matched
 * against database, schema and table NAMES (catalog metadata only — no
 * row is read), the best tables are PRE-selected, and the user adjusts
 * freely. When nothing matches, the step orients to the source flow
 * instead of presenting an empty picker. Name-match discovery, labeled
 * as such — never presented as an AI fact.                              */

const STOPWORDS = new Set([
  'which', 'what', 'where', 'when', 'this', 'that', 'with', 'from', 'into',
  'their', 'there', 'have', 'does', 'much', 'many', 'most', 'them', 'they',
  'losing', 'money', 'weekly', 'monthly', 'daily', 'alert', 'report', 'under',
  'above', 'about', 'level', 'usual', 'versus',
]);

/** Seed tokens per industry — the vocabulary its data usually speaks. */
const INDUSTRY_TOKENS: Record<string, string[]> = {
  retail: ['retail', 'sales', 'store', 'stock', 'item', 'transaction', 'customer'],
  manufacturing: ['quality', 'defect', 'plant', 'line', 'batch', 'production'],
  public_sector: ['request', 'public', 'citizen', 'zone'],
  logistics: ['shipment', 'carrier', 'delivery', 'hub', 'transport'],
  iot: ['sensor', 'event', 'equipment', 'measure', 'site'],
  data_platform: ['warehouse', 'query', 'credit', 'usage', 'cost'],
  energy: ['energy', 'meter', 'consumption', 'load', 'site'],
  healthcare: ['patient', 'visit', 'unit', 'care'],
  financial_services: ['account', 'transaction', 'exposure', 'payment'],
  telecom_media: ['subscriber', 'plan', 'session', 'network'],
  marketing: ['campaign', 'channel', 'lead', 'funnel'],
  hr: ['employee', 'team', 'hiring', 'people'],
  technology: ['account', 'feature', 'usage', 'ticket'],
};

function discoveryTokens(draft: JourneyDraft): string[] {
  const words = (draft.need.text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  const ctx = draft.need.context;
  const seeds = ctx?.industry_id ? INDUSTRY_TOKENS[ctx.industry_id] ?? [ctx.industry_id] : [];
  const hier = (ctx?.hierarchy ?? []).map((h) => h.toLowerCase());
  // singular-ish variants so "stores" finds STORE and vice versa
  const all = [...new Set([...words, ...seeds, ...hier])];
  return [...new Set(all.flatMap((t) => (t.endsWith('s') ? [t, t.slice(0, -1)] : [t])))];
}

function nameHits(name: string, tokens: string[]): number {
  const n = name.toLowerCase();
  return tokens.reduce((acc, t) => (n.includes(t) ? acc + 1 : acc), 0);
}

type Discovery =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'found'; tables: number; dbs: string[] }
  | { kind: 'none' };

export default function SourcesStep({
  draft,
  onPatch,
  onNext,
}: {
  draft: JourneyDraft;
  onPatch: (patch: Partial<JourneyDraft>) => void;
  onNext: () => void;
  onBack?: () => void;
}) {
  const [sources, setSources] = useState<StudioSource[] | null>(null);
  const [catalog, setCatalog] = useState<CatalogConnector[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [familyFilter, setFamilyFilter] = useState<string[]>([]);
  const [discovery, setDiscovery] = useState<Discovery>({ kind: 'idle' });
  const [deepSearching, setDeepSearching] = useState<string | null>(null);
  const [deepError, setDeepError] = useState<string | null>(null);
  /** THE BASKET: one sweep over every available database, ranked against
   *  the need — high picks pre-checked, the rest one click away. AI first,
   *  manual always possible; the scan budget refusal is shown, not hidden. */
  /** the free-preview envelope for THIS journey — how many table scans are
   *  left before the policy stops. Read so the reader sees the ceiling
   *  before hitting it, not only after. */
  const [scanBudget, setScanBudget] = useState<{ used: number; limit: number } | null>(null);
  const [basket, setBasket] = useState<
    | null
    | 'running'
    | {
        items: Array<{ fqn: string; relevance: string; db: string; sourceId: string; checked: boolean }>;
        scanned: string[];
        stopped?: string;
      }
  >(null);
  const discovered = useRef(false);

  /** Iteration B: when name-match finds nothing, the user can point the
   *  bounded backend scan at a database whose NAME says nothing about its
   *  content (2 INFORMATION_SCHEMA reads, never a data row). */
  const deepSearch = async (dbName: string, sourceId: string) => {
    if (deepSearching) return;
    setDeepSearching(dbName);
    setDeepError(null);
    try {
      // The scan budget is per DRAFT — make sure this journey has one so a
      // fresh application never inherits someone else's exhausted window.
      let scanDraftId = draft.draftId ?? null;
      if (!scanDraftId) {
        scanDraftId = await createDraftDirect({ title: draft.need.text.slice(0, 80) || 'New application' });
        if (scanDraftId) onPatch({ draftId: scanDraftId });
      }
      const { suggestions } = await suggestSources({
        need: draft.need.text,
        domain_id: draft.need.domainId ?? undefined,
        draft_id: scanDraftId,
        databases: [dbName],
      });
      const picks = suggestions.filter((s) => s.preselect).slice(0, 6);
      if (picks.length === 0) {
        setDiscovery({ kind: 'none' });
        return;
      }
      onPatch({
        sources: {
          connectionIds: [sourceId],
          objects: picks.map((s) => ({ connectionId: sourceId, name: s.fqn })),
        },
      });
      setDiscovery({ kind: 'found', tables: picks.length, dbs: [dbName] });
    } catch (e) {
      // an envelope refusal is NOT "nothing found" — say what happened
      const detail = (e as { response?: { data?: { detail?: { message?: string } } } })
        ?.response?.data?.detail;
      setDeepError(detail?.message ?? 'The scan did not answer — pick manually below.');
    } finally {
      setDeepSearching(null);
    }
  };

  const scanAll = async () => {
    if (basket === 'running') return;
    setBasket('running');
    setDeepError(null);
    void getPreviewUsage()
      .then((u) => u.objects_per_draft && setScanBudget({ used: u.objects_per_draft.used ?? 0, limit: u.objects_per_draft.limit ?? 0 }))
      .catch(() => undefined);
    try {
      let scanDraftId = draft.draftId ?? null;
      if (!scanDraftId) {
        scanDraftId = await createDraftDirect({ title: draft.need.text.slice(0, 80) || 'New application' });
        if (scanDraftId) onPatch({ draftId: scanDraftId });
      }
      const avail = (sources ?? []).filter((x) => (x.status ?? 'available') === 'available');
      const nameOf = (x: (typeof avail)[number]) => x.label || x.id.replace(/^sf:db:/, '');
      const byDb = new Map(avail.map((x) => [nameOf(x), x.id]));
      const dbs = avail.map(nameOf);
      const items: NonNullable<Exclude<typeof basket, null | 'running'>>['items'] = [];
      const scanned: string[] = [];
      let stopped: string | undefined;
      // the route takes at most 5 databases per call — sweep in batches
      // until done or until the scan budget says no (shown, not hidden)
      for (let i = 0; i < dbs.length; i += 5) {
        const slice = dbs.slice(i, i + 5);
        try {
          const { suggestions } = await suggestSources({
            need: draft.need.text,
            domain_id: draft.need.domainId ?? undefined,
            draft_id: scanDraftId,
            databases: slice,
          });
          scanned.push(...slice);
          for (const sg of suggestions) {
            if (sg.relevance !== 'high' && sg.relevance !== 'medium') continue;
            const db = sg.fqn.split('.')[0] ?? '';
            const sourceId = byDb.get(db) ?? '';
            if (!sourceId) continue;
            items.push({
              fqn: sg.fqn,
              relevance: String(sg.relevance),
              db,
              sourceId,
              checked: Boolean(sg.preselect) || sg.relevance === 'high',
            });
          }
        } catch (e) {
          const detail = (e as { response?: { data?: { detail?: { message?: string } } } })
            ?.response?.data?.detail;
          stopped = detail?.message
            ? `The scan reached ${scanned.length} of ${dbs.length} databases, then the free-preview envelope was spent: ${detail.message} This is an account policy — an administrator raises it in Administration; the tables already found are kept.`
            : `The scan stopped after ${scanned.length} of ${dbs.length} databases.`;
          break;
        }
      }
      items.sort((a, b) => (a.relevance === b.relevance ? 0 : a.relevance === 'high' ? -1 : 1));
      setBasket({ items, scanned, stopped });
    } finally {
      setBasket((b) => (b === 'running' ? { items: [], scanned: [], stopped: 'The scan did not answer.' } : b));
    }
  };

  const acceptBasket = () => {
    if (basket === null || basket === 'running') return;
    const picks = basket.items.filter((x) => x.checked);
    if (picks.length === 0) return;
    const conns = [...new Set([...draft.sources.connectionIds, ...picks.map((x) => x.sourceId)])];
    const objects = [
      ...draft.sources.objects,
      ...picks
        .filter((x) => !draft.sources.objects.some((o) => o.name === x.fqn))
        .map((x) => ({ connectionId: x.sourceId, name: x.fqn })),
    ];
    onPatch({ sources: { connectionIds: conns, objects } });
    setDiscovery({ kind: 'found', tables: picks.length, dbs: [...new Set(picks.map((x) => x.db))] });
    setBasket(null);
  };

  const load = useCallback(() => {
    setError(null);
    let alive = true;
    Promise.allSettled([getStudioSources(), getStudioSourcesCatalog()]).then(
      ([s, c]) => {
        if (!alive) return;
        if (s.status === 'fulfilled') setSources(s.value);
        else setError('Could not list your sources.');
        if (c.status === 'fulfilled') setCatalog(c.value);
        else setCatalog([]); // catalog is secondary — the grid still works
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => load(), [load]);

  const selected = draft.sources.connectionIds;
  const byId = useMemo(
    () => new Map((sources ?? []).map((s) => [s.id, s])),
    [sources],
  );

  const setSelected = (next: string[]) => {
    onPatch({
      sources: {
        ...draft.sources,
        connectionIds: next,
        // object picks under a removed source are stale — drop them
        objects: draft.sources.objects.filter((o) => next.includes(o.connectionId)),
      },
    });
  };

  const toggle = (id: string) =>
    setSelected(
      selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id],
    );

  /* Auto-discovery: runs ONCE when the step opens with nothing selected —
   * the data should already be found (user rule). Catalog names only. */
  useEffect(() => {
    if (discovered.current || sources == null || sources.length === 0) return;
    if (draft.sources.connectionIds.length > 0 || draft.sources.objects.length > 0) {
      discovered.current = true;
      return; // a resumed journey keeps the user's own picks
    }
    const tokens = discoveryTokens(draft);
    if (tokens.length === 0) {
      discovered.current = true;
      return;
    }
    discovered.current = true;
    setDiscovery({ kind: 'running' });
    void (async () => {
      try {
        // MULTI-DOMAIN: the bounded datalake scan covers every selected
        // domain and SAYS which stay uncovered — never silently dropped.
        const domains = draft.need.context?.domains ?? [];
        if (domains.length > 1) {
          const scan = await scanDatalake({ need: draft.need.text, domains });
          const fqns = scan.union_preselect ?? [];
          if (fqns.length > 0) {
            const dbs = [...new Set(fqns.map((f) => f.split('.')[0]))];
            const idByName2 = new Map(
              sources.map((s) => [s.label || s.id.replace(/^sf:db:/, ''), s.id] as const),
            );
            onPatch({
              sources: {
                connectionIds: dbs.map((db) => idByName2.get(db) ?? `sf:db:${db}`),
                objects: fqns.map((fqn) => ({ connectionId: fqn.split('.')[1] ?? '', name: fqn })),
              },
            });
            setDiscovery({ kind: 'found', tables: fqns.length, dbs });
            if ((scan.uncovered_domains?.length ?? 0) > 0) {
              setDeepError(
                `Not covered by the available data: ${scan.uncovered_domains!.join(', ')} — the application will say so rather than invent it.`,
              );
            }
            return;
          }
          // an empty scan falls through to the single-domain discovery
        }
        // Candidate databases: the primary platform DB + best name matches.
        const ranked = sources
          .filter((s) => (s.status ?? 'available') === 'available')
          .map((s) => ({ s, hits: nameHits(s.label || s.id, tokens) }))
          .sort((a, b) => b.hits - a.hits);
        // Name → the real source id ('sf:db:<DB>') — the journey's
        // connectionIds MUST be source ids, the Understanding step filters
        // on that prefix (bare names orphan the picks).
        const idByName = new Map(
          sources.map((s) => [s.label || s.id.replace(/^sf:db:/, ''), s.id] as const),
        );
        const candidates = [
          ...new Set(
            [
              DATABASE_CONFIG.PRIMARY_DATABASE,
              ...ranked.filter((r) => r.hits > 0).map((r) => r.s.label || r.s.id.replace(/^sf:db:/, '')),
            ].slice(0, 3),
          ),
        ];
        const results = await Promise.allSettled(candidates.map((db) => getStudioObjects(db)));
        const scored: Array<{ db: string; fqn: string; hits: number; rows: number }> = [];
        results.forEach((r, i) => {
          if (r.status !== 'fulfilled') return;
          for (const o of r.value.objects) {
            const hits = nameHits(o.fqn, tokens);
            if (hits > 0) {
              scored.push({ db: candidates[i], fqn: o.fqn, hits, rows: o.approx_row_count ?? 0 });
            }
          }
        });
        scored.sort((a, b) => b.hits - a.hits || b.rows - a.rows);
        let top = scored.slice(0, 12);
        // Need-aware relevance (backend): only preselect what the ranking
        // justifies — never a table just because it is accessible. The
        // name-match list stays the fallback when the ranking is down.
        if (top.length > 0) {
          try {
            const { suggestions } = await suggestSources({
              need: draft.need.text,
              domain_id: draft.need.domainId ?? undefined,
              candidates: top.map((t) => ({ fqn: t.fqn })),
            });
            const keep = new Set(
              suggestions.filter((s) => s.preselect).map((s) => s.fqn),
            );
            if (suggestions.length > 0) top = top.filter((t) => keep.has(t.fqn));
          } catch {
            /* ranking unavailable — keep the name-match fallback */
          }
        }
        top = top.slice(0, 6);
        if (top.length === 0) {
          setDiscovery({ kind: 'none' });
          return;
        }
        const dbs = [...new Set(top.map((t) => t.db))];
        onPatch({
          sources: {
            connectionIds: dbs.map((db) => idByName.get(db) ?? `sf:db:${db}`),
            // connectionId mirrors connectionIds (source ids) — the removal
            // filter in setSelected compares the two directly.
            objects: top.map((t) => ({
              connectionId: idByName.get(t.db) ?? `sf:db:${t.db}`,
              name: t.fqn,
            })),
          },
        });
        setDiscovery({ kind: 'found', tables: top.length, dbs });
      } catch {
        setDiscovery({ kind: 'none' });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sources]);

  const families = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of sources ?? []) {
      const f = s.family ?? 'other';
      counts.set(f, (counts.get(f) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [sources]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (sources ?? []).filter((s) => {
      if (familyFilter.length > 0 && !familyFilter.includes(s.family ?? 'other')) {
        return false;
      }
      if (!q) return true;
      return (
        s.label.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        (s.family ?? '').toLowerCase().includes(q)
      );
    });
  }, [sources, query, familyFilter]);

  return (
    <div className="space-y-3">
      <PlainQuestionHeader
        question="Where does this data live?"
        detail="Data360 looks for this data itself — a name-based seed here, then the analysis reads real content (keys, semantics, quality) and decides. What it finds is pre-selected, and you adjust freely."
      />

      {/* ── Discovery outcome — honest about how it was found ── */}
      {discovery.kind === 'running' && (
        <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
          <Sparkles aria-hidden className="h-3 w-3 animate-pulse text-accent-500" />
          Looking for data that matches your need — catalog names only, no row is read…
        </p>
      )}
      {discovery.kind === 'found' && (
        <p className="flex items-center gap-1.5 rounded-lg border border-accent-200 bg-accent-50/50 px-3 py-1.5 text-xs text-slate-700 dark:border-accent-800 dark:bg-accent-950/40 dark:text-slate-200">
          <Sparkles aria-hidden className="h-3 w-3 shrink-0 text-accent-500" />
          Data360 found {discovery.tables} table(s) in {discovery.dbs.join(', ')} that look like
          this need (matched by name — adjust freely, the analysis will confirm).
          {/* a name-match is a start, not the ceiling — the full sweep stays
              one click away even when something was found */}
          <button
            type="button"
            disabled={basket === 'running' || (sources ?? []).length === 0}
            onClick={() => void scanAll()}
            className="ml-1 inline-flex items-center gap-1 rounded-lg border border-accent-400 px-2 py-0.5 text-xs font-medium text-accent-700 hover:bg-accent-50 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-300 dark:hover:bg-accent-900/30"
          >
            {basket === 'running' && <RefreshCw aria-hidden className="h-3 w-3 animate-spin" />}
            {basket === 'running' ? 'Scanning every database…' : 'Scan them all for a fuller basket'}
          </button>
          {scanBudget && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {Math.max(0, scanBudget.limit - scanBudget.used)} of {scanBudget.limit} free scans left
              on this application
            </span>
          )}
        </p>
      )}
      {discovery.kind === 'none' && (
        <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
          <p className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            No table NAME matches this need.
            <button
              type="button"
              disabled={basket === 'running' || (sources ?? []).length === 0}
              onClick={() => void scanAll()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            >
              {basket === 'running' && <RefreshCw aria-hidden className="h-3 w-3 animate-spin" />}
              {basket === 'running' ? 'Scanning every database…' : 'Scan them all and propose a basket'}
            </button>
            or pick manually below, or
            <Link
              href={routes.studioSource}
              className="font-medium text-accent-600 hover:underline dark:text-accent-400"
            >
              bring the data in first
            </Link>
          </p>
          {(sources ?? []).length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              Also search inside (a bounded catalog scan — no data row is read):
              {(sources ?? [])
                .filter((s) => (s.status ?? 'available') === 'available')
                .slice(0, 8)
                .map((s) => {
                  const name = s.label || s.id.replace(/^sf:db:/, '');
                  return (
                    <button
                      key={s.id}
                      type="button"
                      disabled={deepSearching != null}
                      onClick={() => void deepSearch(name, s.id)}
                      className="rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:border-accent-300 hover:text-accent-700 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
                    >
                      {deepSearching === name ? 'searching…' : name}
                    </button>
                  );
                })}
            </p>
          )}
          {deepError && (
            <p role="alert" className="text-xs text-amber-700 dark:text-amber-300">
              {deepError}
            </p>
          )}
        </div>
      )}

      {/* THE PROPOSED BASKET — the AI swept the catalog against the need.
          High picks come pre-checked; everything stays one click to add or
          drop, and manual selection below never goes away. */}
      {basket !== null && basket !== 'running' && (
        <section
          aria-label="Proposed source basket"
          className="rounded-lg border border-accent-200 bg-white p-2.5 dark:border-accent-900/50 dark:bg-slate-950"
        >
          <p className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <Sparkles aria-hidden className="h-3.5 w-3.5 text-accent-500" />
            <span className="font-medium text-slate-800 dark:text-slate-200">
              {basket.items.length} table(s) ranked across {basket.scanned.length} database(s)
            </span>
            — a SEED from name matching only. Names can lie (or be cryptic): the truth comes
            from the CONTENT analysis at the next step — sampled rows, proven keys, column
            semantics and quality — which re-ranks freely.
            <button
              type="button"
              onClick={() => setBasket(null)}
              className="ml-auto text-xs text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            >
              dismiss
            </button>
          </p>
          {basket.stopped && (
            <>
              <p role="alert" className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                {basket.stopped}
              </p>
              {/* raise the limit RIGHT HERE — the answer to "where do I set
                  it?" is where you hit it, admin-gated and recorded */}
              <StudioLimitControl onChanged={() => void scanAll()} />
            </>
          )}
          {basket.items.length > 0 && (
            <>
              <ul className="mt-1.5 grid max-h-56 grid-cols-1 gap-0.5 overflow-auto sm:grid-cols-2">
                {basket.items.map((it) => (
                  <li key={it.fqn}>
                    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/60">
                      <input
                        type="checkbox"
                        checked={it.checked}
                        onChange={() =>
                          setBasket((b) =>
                            b && b !== 'running'
                              ? {
                                  ...b,
                                  items: b.items.map((x) =>
                                    x.fqn === it.fqn ? { ...x, checked: !x.checked } : x,
                                  ),
                                }
                              : b,
                          )
                        }
                        className="h-3.5 w-3.5 accent-accent-600"
                      />
                      <span className="min-w-0 truncate font-mono text-slate-700 dark:text-slate-200">
                        {it.fqn.split('.').slice(1).join('.')}
                      </span>
                      <span className="ml-auto flex shrink-0 items-center gap-1.5">
                        <span className="text-slate-400">{it.db}</span>
                        <span
                          className={`rounded-full px-1.5 py-px text-xs ${
                            it.relevance === 'high'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                              : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                          }`}
                        >
                          {it.relevance}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                disabled={!basket.items.some((x) => x.checked)}
                onClick={acceptBasket}
                className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
              >
                Add the {basket.items.filter((x) => x.checked).length} selected to my sources
              </button>
            </>
          )}
          {basket.items.length === 0 && !basket.stopped && (
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Nothing in the scanned catalogs looks related to this need — pick manually below or
              bring the data in first.
            </p>
          )}
        </section>
      )}

      {/* ── Flow bar: the selected connections, visible and editable ── */}
      <section
        aria-label="Selected sources"
        className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-800 dark:bg-slate-950"
      >
        {selected.length === 0 ? (
          <p className="px-1 py-0.5 text-xs text-slate-400 dark:text-slate-500">
            Nothing selected yet — pick below.
          </p>
        ) : (
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {selected.map((id) => {
              const src = byId.get(id);
              const Icon = familyIcon(src?.family);
              return (
                <span
                  key={id}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent-200 bg-accent-50 py-0.5 pl-1.5 pr-0.5 text-xs text-accent-800 dark:border-accent-800 dark:bg-accent-950 dark:text-accent-200"
                >
                  <Icon aria-hidden className="h-3 w-3 shrink-0" />
                  <span className="max-w-[10rem] truncate">
                    {src ? neutralLabel(src.label) : id}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${src ? neutralLabel(src.label) : id}`}
                    onClick={() => toggle(id)}
                    className="rounded-full p-0.5 hover:bg-accent-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:hover:bg-accent-900"
                  >
                    <X aria-hidden className="h-3 w-3" />
                  </button>
                </span>
              );
            })}
            <button
              type="button"
              onClick={() => setSelected([])}
              className="shrink-0 px-1 text-xs text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
            >
              Clear
            </button>
          </div>
        )}
      </section>

      {/* ── Search + family filters ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        <label className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search sources…"
            aria-label="Search sources"
            className="w-48 rounded-md border border-slate-200 bg-white py-1 pl-6 pr-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-accent-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          />
        </label>
        {families.map(([f, n]) => {
          const active = familyFilter.includes(f);
          const Icon = familyIcon(f);
          return (
            <button
              key={f}
              type="button"
              aria-pressed={active}
              onClick={() =>
                setFamilyFilter(
                  active ? familyFilter.filter((x) => x !== f) : [...familyFilter, f],
                )
              }
              className={
                active
                  ? 'inline-flex items-center gap-1 rounded-full border border-accent-500 bg-accent-50 px-2 py-0.5 text-xs text-accent-800 dark:bg-accent-950 dark:text-accent-200'
                  : 'inline-flex items-center gap-1 rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600'
              }
            >
              <Icon aria-hidden className="h-3 w-3" />
              {f.replace(/_/g, ' ')} · {n}
            </button>
          );
        })}
        {sources !== null ? (
          <span className="ml-auto text-xs tabular-nums text-slate-400 dark:text-slate-500">
            {shown.length} of {sources.length} shown
          </span>
        ) : null}
      </div>

      {/* ── Compact multi-select grid (bounded height, internal scroll) ── */}
      <section aria-label="Your sources">
        {error ? (
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
            <p role="alert" className="text-xs text-red-600 dark:text-red-400">
              {error}
            </p>
            <div className="mt-1.5">
              <QuietAction label="Try again" icon={RefreshCw} onClick={load} />
            </div>
          </div>
        ) : sources === null ? (
          <div
            className="grid grid-cols-3 gap-1.5 xl:grid-cols-4"
            aria-hidden
          >
            {Array.from({ length: 12 }).map((_, i) => (
              <div
                key={i}
                className="h-7 animate-pulse rounded-md border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/60"
              />
            ))}
          </div>
        ) : sources.length === 0 ? (
          <EmptyState
            compact
            icon={Database}
            title="No source you can read yet"
            description="Connect something below — nothing here is invented."
          />
        ) : shown.length === 0 ? (
          <p className="py-3 text-center text-xs text-slate-400 dark:text-slate-500">
            No source matches “{query.trim() || '—'}” — clear the search or filters.
          </p>
        ) : (
          <div className="max-h-[38vh] overflow-y-auto rounded-lg border border-slate-200 p-1.5 dark:border-slate-800">
            <div className="grid grid-cols-3 gap-1.5 xl:grid-cols-4">
              {shown.map((s) => {
                const Icon = familyIcon(s.family);
                const isSel = selected.includes(s.id);
                const available = (s.status ?? 'available') === 'available';
                const label = neutralLabel(s.label);
                const meta = [
                  (s.family ?? 'other').replace(/_/g, ' '),
                  (s.status ?? '—').replace(/_/g, ' '),
                ].join(' · ');

                if (!available) {
                  return (
                    <div
                      key={s.id}
                      title={
                        s.health?.signal ??
                        `This source is ${(s.status ?? 'not available').replace(/_/g, ' ')} — it cannot be picked yet.`
                      }
                      className="flex h-7 min-w-0 cursor-not-allowed items-center gap-1.5 rounded-md border border-dashed border-slate-200 px-2 text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500"
                    >
                      <span
                        aria-hidden
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${healthDotClass(s)}`}
                      />
                      <Icon aria-hidden className="h-3 w-3 shrink-0" />
                      <span className="min-w-0 truncate">{label}</span>
                      <span className="shrink-0 text-xs">{meta}</span>
                      <Link
                        href={routes.connexion.dataSourceConnection}
                        className="ml-auto shrink-0 text-xs text-accent-600 hover:underline dark:text-accent-400"
                      >
                        Set up
                      </Link>
                    </div>
                  );
                }

                return (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={isSel}
                    onClick={() => toggle(s.id)}
                    title={`${label} · ${meta} · health ${s.health?.state ?? '—'}`}
                    className={
                      (isSel
                        ? 'border-accent-500 bg-accent-50 ring-1 ring-accent-500 dark:bg-accent-950 '
                        : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-950 dark:hover:border-slate-600 ') +
                      'flex h-7 min-w-0 items-center gap-1.5 rounded-md border px-2 text-left text-xs text-slate-800 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-200'
                    }
                  >
                    <span
                      aria-hidden
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${healthDotClass(s)}`}
                    />
                    <Icon
                      aria-hidden
                      className="h-3 w-3 shrink-0 text-slate-400 dark:text-slate-500"
                    />
                    <span className="min-w-0 truncate font-medium">{label}</span>
                    <span className="ml-auto shrink-0 text-xs text-slate-400 dark:text-slate-500">
                      {meta}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* ── Connect something new (honest catalog statuses) ── */}
      <section aria-label="Connect something new">
        <div className="flex items-baseline justify-between">
          <h3 className="text-xs font-semibold text-slate-900 dark:text-slate-100">
            Connect something new
          </h3>
          <QuietAction
            label="Full connection setup"
            icon={Plug}
            href={routes.connexion.dataSourceConnection}
          />
        </div>
        {catalog === null ? (
          <div
            className="mt-1.5 h-7 w-64 animate-pulse rounded bg-slate-100 dark:bg-slate-800"
            aria-hidden
          />
        ) : catalog.length === 0 ? (
          <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">
            The connector catalog is not answering right now.
          </p>
        ) : (
          <div className="mt-1.5 max-h-[14vh] overflow-y-auto rounded-lg border border-slate-200 p-1.5 dark:border-slate-800">
            <div className="flex flex-wrap gap-1.5">
              {catalog.map((c, i) => {
                const status = typeof c.status === 'string' ? c.status : 'not_integrated';
                const usable = status !== 'not_integrated';
                const Icon = familyIcon(
                  typeof c.family === 'string' ? c.family : undefined,
                );
                const label = neutralLabel(
                  typeof c.label === 'string' && c.label
                    ? c.label
                    : String(c.connector_id ?? c.id ?? '—'),
                );
                const statusLabel = CATALOG_STATUS_LABEL[status] ?? status.replace(/_/g, ' ');
                const inner = (
                  <>
                    <Icon aria-hidden className="h-3 w-3 shrink-0" />
                    {label}
                    <span className={`text-xs ${CATALOG_STATUS_TONE[status] ?? 'text-slate-400'}`}>
                      {statusLabel}
                    </span>
                  </>
                );
                return usable ? (
                  <Link
                    key={String(c.connector_id ?? c.id ?? i)}
                    href={routes.connexion.dataSourceConnection}
                    title={`${label} — ${statusLabel}. Opens the connection setup.`}
                    className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-2 py-0.5 text-xs text-slate-700 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300 dark:hover:border-slate-600"
                  >
                    {inner}
                  </Link>
                ) : (
                  <span
                    key={String(c.connector_id ?? c.id ?? i)}
                    title={`${label} is not integrated on this backend yet — no button here will pretend otherwise.`}
                    className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-full border border-dashed border-slate-200 px-2 py-0.5 text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500"
                  >
                    {inner}
                  </span>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* ── CTA ── */}
      <div className="flex items-center gap-3 pt-0.5">
        <button
          type="button"
          disabled={selected.length === 0}
          onClick={onNext}
          className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue with {selected.length || 'no'} selected
        </button>
        {selected.length === 0 ? (
          <span className="text-xs text-slate-400 dark:text-slate-500">
            Pick at least one source to continue.
          </span>
        ) : null}
      </div>
    </div>
  );
}
