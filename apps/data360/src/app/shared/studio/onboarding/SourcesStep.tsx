'use client';

/**
 * SourcesStep — "Where does this data live?"
 *
 * Backed by the NEW /studio module (contract T1, schema studio.v1).
 * Two layers: (1) LLM-first discovery — a name-match seed then a bounded
 * CONTENT scan that ranks tables by what they hold (keys, semantics,
 * quality), surfaced as a proposed basket; (2) the AI-first PICKER
 * (StudioSourceGallery): an intent bar, up to three scan-ranked proposals,
 * then collapsible per-family CATEGORIES each with a paginated gallery and
 * a stable selection. No table-as-choice, no long list. Nothing is
 * auto-selected beyond what discovery proposes: discovery ≠ inclusion
 * (mission §18).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { RefreshCw, Sparkles } from 'lucide-react';
import { PlainQuestionHeader, QuietAction } from '@/app/shared/studio/PlainKit';
import StudioLimitControl from '@/app/shared/studio/StudioLimitControl';
import StudioSourceGallery, {
  type SourceProposal,
} from '@/app/shared/studio/sources/StudioSourceGallery';
import {
  createDraftDirect,
  getContentScan,
  getStudioObjects,
  getStudioSources,
  scanDatalake,
  getPreviewUsage,
  startContentScan,
  suggestSources,
  type ContentScanProgress,
  type ContentScanView,
  type StudioSource,
} from '@/app/services/studio/studio-api';
import { DATABASE_CONFIG } from '@/config/database.config';
import { routes } from '@/config/routes';
import type { JourneyDraft } from './journey';

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
  const router = useRouter();
  const [sources, setSources] = useState<StudioSource[] | null>(null);
  const [error, setError] = useState<string | null>(null);
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
        items: Array<{
          fqn: string;
          relevance: string;
          db: string;
          sourceId: string;
          checked: boolean;
          /** content evidence: role sketch, proven key, matched values */
          role?: string;
          why?: string;
          score?: number;
        }>;
        scanned: string[];
        stopped?: string;
      }
  >(null);
  /** live progress of the server-side CONTENT scan */
  const [scanProgress, setScanProgress] = useState<ContentScanProgress | null>(null);
  /** the backend's own per-table time estimate, shown while it runs */
  const [scanEta, setScanEta] = useState<string | null>(null);
  /** a scan that outlived the poll window — kept so « Check again » re-reads
   *  THE SAME paid scan (a free GET) instead of paying for a new one */
  const [pendingScanId, setPendingScanId] = useState<string | null>(null);
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

  /** THE discovery path (user directive): the server reads sampled VALUES
   *  — column semantics (names can lie or be encrypted), PKs proven by
   *  uniqueness, FKs by join coverage, per-column sample DQ and a
   *  fact/dimension sketch — and ranks by CONTENT relevance to the need.
   *  202 + polling; a budget stop is said and raisable, never hidden. */
  const scanAll = async (resumeScanId?: string) => {
    if (basket === 'running') return;
    setBasket('running');
    setScanProgress(null);
    setDeepError(null);
    void getPreviewUsage()
      .then((u) => u.objects_per_draft && setScanBudget({ used: u.objects_per_draft.used ?? 0, limit: u.objects_per_draft.limit ?? 0 }))
      .catch(() => undefined);
    try {
      let scanDraftId = draft.draftId ?? null;
      if (!scanDraftId && !resumeScanId) {
        scanDraftId = await createDraftDirect({ title: draft.need.text.slice(0, 80) || 'New application' });
        if (scanDraftId) onPatch({ draftId: scanDraftId });
      }
      const avail = (sources ?? []).filter((x) => (x.status ?? 'available') === 'available');
      const nameOf = (x: (typeof avail)[number]) => x.label || x.id.replace(/^sf:db:/, '');
      const byDb = new Map(avail.map((x) => [nameOf(x), x.id]));
      const dbs = avail.map(nameOf);
      // the scan takes at most 10 databases — the bound is SAID below
      const target = dbs.slice(0, 10);

      /* resuming re-reads THE SAME scan (free GETs) — the paid start only
         happens on a fresh run */
      let scanId: string;
      let view: ContentScanView;
      if (resumeScanId) {
        scanId = resumeScanId;
        view = await getContentScan(resumeScanId);
        setScanProgress(view.progress ?? null);
      } else {
        const start = await startContentScan({
          databases: target,
          draft_id: scanDraftId,
          need: draft.need.text,
          domain_id: draft.need.domainId ?? undefined,
          use_ai: true,
        });
        if (!start.scan_id) throw new Error('The content scan did not start.');
        scanId = start.scan_id;
        setPendingScanId(start.scan_id);
        setScanEta(start.budget?.expected_seconds_per_table ?? null);
        view = start;
      }
      for (
        let i = 0;
        i < 200 && !['done', 'partial', 'failed'].includes(String(view.status));
        i++
      ) {
        await new Promise((r) => setTimeout(r, 3000));
        view = await getContentScan(scanId);
        setScanProgress(view.progress ?? null);
      }
      /* the poll window can close while the scan still runs server-side — that
         is a TIMEOUT, never a "nothing matched": the paid scan keeps its id and
         « Check again » re-reads it for free. */
      const timedOut = !['done', 'partial', 'failed'].includes(String(view.status));
      if (!timedOut) setPendingScanId(null);

      const tables = view.result?.tables ?? [];
      const items: NonNullable<Exclude<typeof basket, null | 'running'>>['items'] = tables
        .filter((t) => ['high', 'medium'].includes(String(t.domain_relevance?.relevance)))
        .map((t) => {
          const db = t.fqn.split('.')[0] ?? '';
          const pkCol = (t.columns ?? []).find(
            (c) => c.pk_evidence && (c.pk_evidence.unique_ratio ?? 0) >= 0.99,
          );
          const evid = (t.domain_relevance?.evidence ?? [])
            .slice(0, 3)
            .map((ev) => `${ev.kind}: ${String(ev.matched ?? '')}`)
            .join(' · ');
          return {
            fqn: t.fqn,
            relevance: String(t.domain_relevance?.relevance ?? 'medium'),
            db,
            sourceId: byDb.get(db) ?? `sf:db:${db}`,
            checked: t.domain_relevance?.relevance === 'high',
            role: t.model_sketch?.role,
            score: t.domain_relevance?.score,
            why: [
              t.ai?.business_meaning ?? t.model_sketch?.why,
              pkCol ? `key proven on ${pkCol.name} (${Math.round((pkCol.pk_evidence?.unique_ratio ?? 0) * 100)}% unique in sample)` : null,
              evid || null,
            ]
              .filter(Boolean)
              .join(' — '),
          };
        });
      items.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

      const aiErrors = view.result?.ai?.errors ?? [];
      const stopped =
        [
          timedOut
            ? 'The scan is still running server-side — nothing here is a « no ». Check again in a moment; the same scan is re-read, never restarted or re-charged.'
            : null,
          view.status === 'failed' ? 'The scan failed — what was read before the failure is kept.' : null,
          view.status === 'partial' || view.truncated
            ? 'The budget stopped the scan before every table — what was read is kept, and the limit is raisable below.'
            : null,
          dbs.length > target.length
            ? `${dbs.length - target.length} database(s) beyond the 10-per-scan bound were not read — run the scan again to cover them.`
            : null,
          aiErrors.length > 0
            ? 'The AI naming envelope ran out — deterministic content profiles are kept for those tables.'
            : null,
        ]
          .filter(Boolean)
          .join(' ') || undefined;

      setBasket({ items, scanned: target, stopped });
    } catch (e) {
      const detail = (e as { response?: { data?: { detail?: { message?: string } } } })
        ?.response?.data?.detail;
      setBasket({
        items: [],
        scanned: [],
        stopped: detail?.message
          ? `${detail.message} This is an account policy — raise it below; nothing was read.`
          : 'The content scan did not answer.',
      });
    } finally {
      setScanProgress(null);
      setScanEta(null);
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
    // The connector catalog is read by the gallery itself (its own dedup
    // key) — here we only need the selectable sources for discovery.
    void getStudioSources()
      .then((s) => alive && setSources(s))
      .catch(() => alive && setError('Could not list your sources.'));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => load(), [load]);

  const selected = draft.sources.connectionIds;
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  /** The gallery's ≤3 proposals come from the CONTENT scan (never invented):
   *  the top-scored tables, folded to their databases, with the role and
   *  evidence the scan gave them. No scan yet → no proposals block. */
  const galleryProposals = useMemo<SourceProposal[]>(() => {
    if (basket === null || basket === 'running') return [];
    const seen = new Set<string>();
    const out: SourceProposal[] = [];
    for (const it of basket.items) {
      if (seen.has(it.sourceId)) continue;
      seen.add(it.sourceId);
      out.push({ id: it.sourceId, label: it.db, relevance: it.relevance, role: it.role, why: it.why });
      if (out.length >= 3) break;
    }
    return out;
  }, [basket]);

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
            {basket === 'running' ? (scanProgress ? `Reading content… ${scanProgress.tables_done ?? 0}/${scanProgress.tables_total ?? '…'}${scanProgress.current ? ` · ${String(scanProgress.current).split('.').slice(-1)[0]}` : ''}` : 'Reading content…') : 'Scan the content for a fuller basket'}
          </button>
          {basket === 'running' && scanEta && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              about {scanEta} per table — it reads a bounded sample, never the whole table
            </span>
          )}
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
              {basket === 'running' ? (scanProgress ? `Reading content… ${scanProgress.tables_done ?? 0}/${scanProgress.tables_total ?? '…'}${scanProgress.current ? ` · ${String(scanProgress.current).split('.').slice(-1)[0]}` : ''}` : 'Reading content…') : 'Scan the content and propose a basket'}
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
            — by their CONTENT: sampled values, proven keys, column semantics and quality. Names
            were only the seed; hover a line for its evidence. Everything stays « inferred » until
            the understanding confirms it.
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
              {pendingScanId && (
                <button
                  type="button"
                  onClick={() => void scanAll(pendingScanId)}
                  className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-amber-300/70 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-amber-500/30 dark:text-amber-200 dark:hover:bg-amber-950/40"
                >
                  Check the scan again — free, same scan
                </button>
              )}
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
                    <label
                      title={it.why || undefined}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-1.5 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/60"
                    >
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
                        {it.role && it.role !== 'unknown' && (
                          <span className="rounded-full bg-sky-50 px-1.5 py-px text-xs text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" title="Role sketched from the CONTENT — confirmed at understanding">
                            {it.role}
                          </span>
                        )}
                        <span className="text-slate-400 dark:text-slate-500">{it.db}</span>
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

      {/* ── AI-first picker: an intent bar, up to three content-scan
          proposals, then collapsible CATEGORIES (icon + one-line summary
          from the backend tally) each with a PAGINATED gallery. Selection
          stays stable across pages, categories and search. Opening a
          category or turning a page is local state over already-fetched
          metadata — no new warehouse scan, no new LLM call. Replaces the
          old flow bar, the search/family filters, the dense grid and the
          connector list. ── */}
      {error ? (
        <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
          <p role="alert" className="text-xs text-red-600 dark:text-red-400">
            {error}
          </p>
          <div className="mt-1.5">
            <QuietAction label="Try again" icon={RefreshCw} onClick={load} />
          </div>
        </div>
      ) : (
        <StudioSourceGallery
          need={draft.need.text}
          proposals={galleryProposals}
          selected={selectedSet}
          onToggle={(s) => toggle(s.id)}
          onConfigure={() => router.push(routes.connexion.dataSourceConnection)}
          onClearAll={() => setSelected([])}
        />
      )}

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
