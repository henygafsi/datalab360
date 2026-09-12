'use client';

/**
 * StudioModelInspector — the working panel of the model view.
 *
 * Closed when nothing is selected (the parent only mounts it with a
 * selection). Three selection depths:
 *  - a TABLE (target or source): full column table, grain, mapping,
 *    responsible process, allowed edit actions;
 *  - a COLUMN: definition, mapping/transformation, rule, report usages,
 *    inline edit of what the backend allows;
 *  - a RELATION (sources): declared from real columns of both tables —
 *    selects, never free text.
 *
 * The AI is a complementary action that proposes an inspectable diff —
 * never the only way to edit.
 */

import { useEffect, useMemo, useState } from 'react';
import { Check, Link2, RefreshCw, Search, ShieldCheck, Sparkles, X } from 'lucide-react';
import {
  deriveColumn,
  getQuality,
  getTableColumns,
  grainText,
  patchModel,
  suggestRls,
  type DerivedColumnPreview,
  type SourceColumnsPage,
  type ModelGrain,
  type ModelTable,
  type RlsSuggestion,
  type StudioModelView as ModelPayload,
  type StudioReportSpec,
  type StudioTarget,
  type TargetsView,
} from '@/app/services/studio/studio-api';
import { grainKeysOf, columnRole } from '@/app/shared/studio/StudioModelCanvas';
import StudioSourceCard from '@/app/shared/studio/StudioSourceCard';
import {
  CONFIDENCE_CLS,
  cardinalityWords,
  indexSourceKeys,
  readKey,
  readRelation,
  readTargetColumnKey,
  type KeyFacts,
} from '@/app/shared/studio/studio-keys';

function errText(e: unknown): string {
  const detail = (e as { response?: { data?: { detail?: { message?: string } | string } } })
    ?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail?.message) return detail.message;
  return e instanceof Error ? e.message : 'The change could not be applied.';
}

type RealColumn = {
  name: string;
  type?: string;
  role?: string;
  nullable?: boolean;
  expression?: string | null;
  source?: { fqn?: string; column?: string } | null;
  rule?: { rule_id?: string; kind?: string; behavior?: string } | null;
  responsible_job_id?: string;
};

/** Cardinality in words — the label the user picks, not the enum. */
const CARD_WORDS: Record<string, string> = {
  many_to_one: 'many → one',
  one_to_many: 'one → many',
  one_to_one: 'one — one',
  many_to_many: 'many — many',
};

const ROLE_WORD: Record<string, string> = {
  key: 'grain key',
  candidate: 'candidate',
  time: 'time',
  measure: 'measure',
  dimension: 'dimension',
  watermark: 'watermark',
  dedup: 'dedup key',
};

/** Where one column appears in the saved report. */
function reportUsages(
  report: StudioReportSpec | null | undefined,
  fqn: string | undefined,
  column: string,
): string[] {
  if (!report || !fqn) return [];
  const target = fqn.toUpperCase();
  const col = column.toUpperCase();
  const out: string[] = [];
  for (const spec of [...(report.kpis ?? []), ...(report.charts ?? [])]) {
    if (typeof spec !== 'object' || spec == null) continue;
    const ds = spec.dataset;
    if (!ds || `${ds.database}.${ds.schema}.${ds.table}`.toUpperCase() !== target) continue;
    const inMeasures = (spec.measures ?? []).some((m) => m.column?.toUpperCase() === col);
    const inDims = (spec.dimensions ?? []).some(
      (d) => (typeof d === 'string' ? d : d.column)?.toUpperCase() === col,
    );
    if (inMeasures || inDims) out.push(spec.title ?? spec.chart_id ?? 'untitled widget');
  }
  return out;
}

export default function StudioModelInspector({
  draftId,
  model,
  view,
  selection,
  onClose,
  onApplied,
  onAskAi,
  onOpenJob,
  onOpenAccess,
}: {
  draftId: string;
  model: ModelPayload;
  view: TargetsView | null;
  /** `t:<target_id>` or `s:<entity_id>` (legacy bare entity ids accepted). */
  selection: string;
  onClose: () => void;
  onApplied: () => void;
  onAskAi?: (instruction: string) => void;
  /** Open the responsible process in the Jobs editor. */
  onOpenJob?: (jobId: string) => void;
  /** Hand a row-access restriction to the Access view (plan → apply). */
  onOpenAccess?: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openCol, setOpenCol] = useState<string | null>(null);
  const [rel, setRel] = useState<{ to: string; fromCol: string; toCol: string; card: string }>({
    to: '',
    fromCol: '',
    toCol: '',
    card: 'many_to_one',
  });
  /** extra column pairs of a COMPOSITE relation — one source can point at a
   *  target through several columns, and the right side need not be a
   *  declared PK. */
  const [relPairs, setRelPairs] = useState<Array<{ fromCol: string; toCol: string }>>([]);
  /** the verdict of the LAST check-and-declare — counted on the real data */
  const [relCheck, setRelCheck] = useState<
    | null
    | 'running'
    | { verdict: string; orphans?: number; leftRows?: number; orphanPct?: number; scope?: string }
    | { note: string }
  >(null);
  const [addCol, setAddCol] = useState<{ open: boolean; name: string; type: string; expr: string }>(
    { open: false, name: '', type: 'TEXT', expr: '' },
  );
  /** the AI-derived column: type it in words → free preview (SQL + probe) →
   *  confirm persists and regenerates the producer job. */
  const [derive, setDerive] = useState<{ nl: string; preview: DerivedColumnPreview | 'loading' | null }>(
    { nl: '', preview: null },
  );
  /* governance names + RLS candidates — fetched on demand (live counts) */
  const [gov, setGov] = useState<RlsSuggestion | 'loading' | 'error' | null>(null);
  /* relations of a target are capped so the LINK builder below stays
   * reachable without scrolling a hub table's full list */
  const [relLimit, setRelLimit] = useState(6);
  /* the descriptive fiche of a target, opened in place in the right bar —
   * the right bar led with technical detail only, never the meaning */
  const [sheetOpen, setSheetOpen] = useState(false);
  /* a SOURCE table's columns, searchable and bounded */
  const [colQuery, setColQuery] = useState('');
  const [colLimit, setColLimit] = useState(25);
  const [colPage, setColPage] = useState<SourceColumnsPage | 'loading' | 'error' | null>(null);
  /** source key facts by FQN.COLUMN — a target column's key lives on its
   *  source, so relations resolve without a model call once seen. */
  const [sourceKeyIndex, setSourceKeyIndex] = useState<Map<string, KeyFacts>>(new Map());

  const isTarget = selection.startsWith('t:');
  const rawId = selection.replace(/^[st]:/, '');

  const tables = model.tables ?? [];
  const srcIdx = tables.findIndex((t) => t.entity_id === rawId);
  const srcTable: ModelTable | undefined = !isTarget ? tables[srcIdx] : undefined;

  const targets = view?.targets ?? [];
  const tgtIdx = targets.findIndex((t) => t.target_id === rawId);
  const target: StudioTarget | undefined = isTarget ? targets[tgtIdx] : undefined;

  const producerJob = useMemo(
    () =>
      target
        ? (view?.jobs ?? []).find(
            (j) =>
              j.job_id === target.producer_job_id || (j.target_ids ?? []).includes(target.target_id),
          )
        : undefined,
    [target, view],
  );

  const cols: RealColumn[] = useMemo(() => {
    if (target) return (target.columns ?? []) as RealColumn[];
    if (srcTable && Array.isArray((srcTable as { columns?: RealColumn[] }).columns))
      return ((srcTable as { columns?: RealColumn[] }).columns ?? []);
    return [];
  }, [target, srcTable]);

  /** the understanding entity a target was built from — carries the
   *  company's functional words (description/business terms) */
  const targetEntity = target ? tables.find((t) => t.entity_id === target.entity_id) : undefined;
  const grain = target ? target.grain : srcTable?.grain;
  const grainObj: ModelGrain | null = grain && typeof grain === 'object' ? (grain as ModelGrain) : null;
  const grainKeys = grainKeysOf(grain as ModelTable['grain']);
  const name = target?.name ?? srcTable?.name ?? rawId;
  const fqn = target?.target_fqn ?? srcTable?.fqn;
  const report = model.report ?? null;

  const others = tables.filter((x) => x.entity_id !== rawId);
  const toTable = others.find((x) => x.entity_id === rel.to);
  const toCols: RealColumn[] = Array.isArray((toTable as { columns?: RealColumn[] } | undefined)?.columns)
    ? ((toTable as { columns?: RealColumn[] }).columns ?? [])
    : [];

  /* a source table's columns come from the dedicated bounded route — the
   * only one that says, per column, whether it already feeds the model.
   * Debounced so typing does not fire a request per keystroke. */
  const srcFqn = srcTable?.fqn;
  useEffect(() => {
    if (!srcFqn) {
      setColPage(null);
      return;
    }
    let cancelled = false;
    setColPage((p) => (p && p !== 'error' ? p : 'loading'));
    const t = setTimeout(() => {
      getTableColumns(draftId, srcFqn, { q: colQuery.trim() || undefined, limit: colLimit })
        .then((page) => {
          if (cancelled) return;
          setColPage(page);
          const idx = indexSourceKeys(srcFqn, page.items);
          if (idx.size) setSourceKeyIndex((m) => new Map([...m, ...idx]));
        })
        .catch(() => !cancelled && setColPage('error'));
    }, colQuery ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [draftId, srcFqn, colQuery, colLimit]);

  if (!target && !srcTable) return null;

  /* The KPI keep/discard and the load-pattern/DQ blocks moved to
   * StudioSourceCard, which reads them all from one /sources/card call. */

  /** CHECK & DECLARE, for real: declare the relation through the validated
   *  patch (entity-level, composite columns supported), then run the
   *  cross-table referential-integrity check and show ITS verdict —
   *  orphans counted on the real data. No AI, no tab change: the reader
   *  stays exactly where they were, in front of the model. */
  const checkAndDeclareRel = (t2: StudioTarget) =>
    act('rel', async () => {
      setRelCheck(null);
      const pairs = [{ fromCol: rel.fromCol, toCol: rel.toCol }, ...relPairs].filter(
        (pr) => pr.fromCol && pr.toCol,
      );
      const leftEntity = target?.entity_id ?? rawId;
      const rightEntity = t2.entity_id ?? '';
      await patchModel(
        draftId,
        [
          {
            op: 'add',
            path: '/understanding/relationships/-',
            value: {
              left: { entity_id: leftEntity, columns: pairs.map((pr) => pr.fromCol) },
              right: { entity_id: rightEntity, columns: pairs.map((pr) => pr.toCol) },
              cardinality: rel.card,
              status: 'declared_not_enforced',
              evidence: {
                source: 'declared by the modeller',
                basis: `${pairs.map((pr) => pr.fromCol).join('+')} was declared to match ${pairs
                  .map((pr) => pr.toCol)
                  .join('+')} on ${t2.name}`,
              },
            },
          },
        ] as never,
        true,
        `declare the relation ${name} → ${t2.name}`,
      );
      setRelCheck('running');
      try {
        const q = await getQuality(draftId, true);
        const cols = pairs.map((pr) => pr.fromCol.toUpperCase()).sort().join(',');
        const hit = (q.cross_table?.checks ?? []).find((c) => {
          const l = c.left as { target?: string; columns?: string[] } | undefined;
          const r = c.right as { target?: string; columns?: string[] } | undefined;
          return (
            l?.target === target?.name &&
            r?.target === t2.name &&
            (l?.columns ?? []).map((x) => x.toUpperCase()).sort().join(',') === cols
          );
        });
        if (hit) {
          const ev = (hit.evidence ?? {}) as { orphans?: number; left_rows?: number; orphan_pct?: number };
          setRelCheck({
            verdict: String(hit.verdict ?? ''),
            orphans: ev.orphans,
            leftRows: ev.left_rows,
            orphanPct: ev.orphan_pct,
            scope: String(hit.sample_vs_full ?? ''),
          });
        } else {
          setRelCheck({
            note: 'Declared. The integrity check has no verdict yet — it runs once both tables are loaded.',
          });
        }
      } catch {
        setRelCheck({
          note: 'Declared. The integrity check could not run right now — it is not lost, Quality carries it.',
        });
      }
    });

  const act = async (key: string, fn: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(key);
    setError(null);
    try {
      await fn();
      onApplied();
    } catch (e) {
      setError(errText(e));
    } finally {
      setBusy(null);
    }
  };

  /** translate plain words → SQL against this table's real columns; a free
   *  preview that writes nothing (probe + referenced columns for review). */
  const translateColumn = async () => {
    if (!target || !derive.nl.trim()) return;
    setError(null);
    setDerive((d) => ({ ...d, preview: 'loading' }));
    try {
      const p = await deriveColumn(draftId, {
        target_id: target.target_id,
        natural_language: derive.nl.trim(),
        name: addCol.name.trim().toUpperCase() || undefined,
        type: addCol.type.trim() || undefined,
        confirm: false,
      });
      setDerive((d) => ({ ...d, preview: p }));
    } catch (e) {
      setDerive((d) => ({ ...d, preview: null }));
      setError(errText(e));
    }
  };
  /** persist the previewed column — regenerates the producer job's SQL. */
  const addDerived = () => {
    if (!target || !derive.preview || derive.preview === 'loading') return;
    const updatedAt = (view as { updated_at?: string } | null)?.updated_at;
    void act('derive', async () => {
      await deriveColumn(draftId, {
        target_id: target.target_id,
        natural_language: derive.nl.trim(),
        name: addCol.name.trim().toUpperCase() || undefined,
        type: addCol.type.trim() || undefined,
        confirm: true,
        ...(updatedAt ? { expected_updated_at: updatedAt } : {}),
      });
      setDerive({ nl: '', preview: null });
      setAddCol({ open: false, name: '', type: 'TEXT', expr: '' });
    });
  };

  const confirmGrain = () => {
    if (!grainObj) return;
    const path = target
      ? `/model/targets/${tgtIdx}/grain`
      : `/understanding/entities/${srcIdx}/grain`;
    void act('grain', () =>
      patchModel(
        draftId,
        [{ op: 'set', path, value: { ...grainObj, status: 'confirmed' } }],
        true,
        `confirm grain of ${name}`,
      ),
    );
  };

  const selectedCol = openCol ? cols.find((c) => c.name === openCol) : null;
  const selectedColIdx = openCol ? cols.findIndex((c) => c.name === openCol) : -1;

  return (
    <aside
      aria-label={`Details of ${name}`}
      className="flex max-h-[560px] flex-col overflow-y-auto rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <span className="truncate">{name}</span>
            <span className="shrink-0 rounded-full border border-slate-200 px-1.5 py-px text-xs uppercase tracking-wide text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {target ? (target.kind ?? 'target') : 'source'}
            </span>
            {target?.state && (
              <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-px text-xs text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                {target.state}
              </span>
            )}
          </p>
          {fqn && (
            <button
              type="button"
              onClick={() => void navigator.clipboard?.writeText(fqn)}
              title={`${fqn} — click to copy`}
              className="mt-0.5 block max-w-full truncate rounded font-mono text-xs text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-500 dark:hover:text-slate-300"
            >
              {fqn}
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close the panel"
          className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:hover:bg-slate-800"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>

      {/* grain — confirmable, never silently promoted */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2 text-[13px]">
        <span className="text-slate-600 dark:text-slate-300">
          {grainText(grain as ModelTable['grain']) ??
            (typeof grain === 'string' ? grain : 'grain unknown')}
        </span>
        {grainObj?.status && (
          <span
            className={`rounded-full px-1.5 py-px text-xs ${
              grainObj.status === 'confirmed'
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                : 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
            }`}
          >
            {grainObj.status}
          </span>
        )}
        {grainObj && grainObj.status !== 'confirmed' && (
          <button
            type="button"
            disabled={busy === 'grain'}
            onClick={confirmGrain}
            className="inline-flex items-center gap-1 rounded-lg bg-accent-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
          >
            <Check aria-hidden className="h-3 w-3" />
            {busy === 'grain' ? 'Confirming…' : 'Confirm'}
          </button>
        )}
      </div>

      {/* responsible process + primary actions */}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {producerJob && onOpenJob && (
          <button
            type="button"
            onClick={() => onOpenJob(producerJob.job_id)}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-[13px] text-slate-700 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
          >
            Open the process — {producerJob.name ?? producerJob.job_id}
          </button>
        )}
        {target && (
          <button
            type="button"
            onClick={() => setAddCol((a) => ({ ...a, open: !a.open }))}
            className="rounded-lg border border-slate-200 px-2.5 py-1 text-[13px] text-slate-700 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
          >
            Add a column
          </button>
        )}
        {onAskAi && (
          <button
            type="button"
            onClick={() =>
              onAskAi(
                `Improve the model of this application around ${name}: propose the missing relations, the business definitions to confirm, and better measures for its domain — grounded in this application's own knowledge, nothing invented.`,
              )
            }
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-[13px] text-slate-600 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-300"
            title="The AI proposes an inspectable diff — you approve it before anything changes"
          >
            <Sparkles aria-hidden className="h-3.5 w-3.5" />
            Ask the AI
          </button>
        )}
      </div>

      {/* WHAT IT MEANS — the right bar led with technical detail only; the
          functional description (the company's own words, feeding the AI)
          now leads, with the full rich sheet one click away. */}
      {target && (
        <div className="mt-2 rounded-lg border border-slate-100 p-2.5 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              What this table means
            </p>
            {(target.entity_id || target.target_fqn) && (
              <button
                type="button"
                onClick={() => setSheetOpen((v) => !v)}
                aria-expanded={sheetOpen}
                className="ml-auto text-xs font-medium text-accent-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-400"
              >
                {sheetOpen ? 'Hide full sheet' : 'Full sheet'}
              </button>
            )}
          </div>
          <p className="mt-1 text-[13px] text-slate-600 dark:text-slate-300">
            {targetEntity?.description || (
              <span className="text-slate-400 dark:text-slate-500">
                No functional description yet — open the full sheet to add one in your words; it feeds
                the AI at model edit.
              </span>
            )}
          </p>
          {sheetOpen && (target.entity_id || target.target_fqn) && (
            <div className="mt-1.5">
              <StudioSourceCard
                draftId={draftId}
                entityId={target.entity_id}
                fqn={target.entity_id ? undefined : target.target_fqn}
                onChanged={onApplied}
              />
            </div>
          )}
        </div>
      )}

      {addCol.open && target && (
        <div className="mt-2 flex flex-wrap items-end gap-2 rounded-lg border border-slate-100 p-2 dark:border-slate-800">
          <label className="text-xs text-slate-500 dark:text-slate-400">
            Name
            <input
              value={addCol.name}
              onChange={(e) => setAddCol((a) => ({ ...a, name: e.target.value }))}
              className="mt-0.5 block h-7 w-36 rounded-lg border border-slate-200 bg-white px-2 font-mono text-[13px] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
          </label>
          <label className="text-xs text-slate-500 dark:text-slate-400">
            Type
            <input
              value={addCol.type}
              onChange={(e) => setAddCol((a) => ({ ...a, type: e.target.value }))}
              className="mt-0.5 block h-7 w-24 rounded-lg border border-slate-200 bg-white px-2 font-mono text-[13px] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
          </label>
          <label className="text-xs text-slate-500 dark:text-slate-400">
            Expression (SQL)
            <input
              value={addCol.expr}
              onChange={(e) => setAddCol((a) => ({ ...a, expr: e.target.value }))}
              placeholder="e.g. AMOUNT * 1.2"
              className="mt-0.5 block h-7 w-44 rounded-lg border border-slate-200 bg-white px-2 font-mono text-[13px] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
          </label>
          <button
            type="button"
            disabled={!addCol.name.trim() || busy === 'addcol'}
            onClick={() =>
              void act('addcol', async () => {
                await patchModel(
                  draftId,
                  [
                    {
                      op: 'add',
                      path: `/model/targets/${tgtIdx}/columns/-`,
                      value: {
                        name: addCol.name.trim().toUpperCase(),
                        type: addCol.type.trim() || 'TEXT',
                        ...(addCol.expr.trim() ? { expression: addCol.expr.trim() } : {}),
                        nullable: true,
                      },
                    },
                  ],
                  true,
                  `add column ${addCol.name} to ${name}`,
                );
                setAddCol({ open: false, name: '', type: 'TEXT', expr: '' });
              })
            }
            className="h-7 rounded-lg bg-accent-600 px-2.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40"
          >
            {busy === 'addcol' ? 'Adding…' : 'Add'}
          </button>

          {/* …or describe it — the AI writes the SQL from this table's REAL
              columns, previews a bounded sample (free), and only persists
              on confirm (which regenerates the producer job). */}
          <div className="w-full border-t border-slate-100 pt-2 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              …or describe it and let the AI write the SQL
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <input
                value={derive.nl}
                onChange={(e) => setDerive((d) => ({ ...d, nl: e.target.value }))}
                placeholder="e.g. margin = (net_amount − cost) / net_amount"
                aria-label="Describe the column in words"
                className="h-7 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 text-[13px] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
              />
              <button
                type="button"
                disabled={!derive.nl.trim() || !addCol.name.trim() || derive.preview === 'loading'}
                title={
                  !addCol.name.trim()
                    ? 'Name the column first'
                    : 'Translates to SQL and probes a sample — nothing is written until you add it'
                }
                onClick={() => void translateColumn()}
                className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-accent-500 px-2.5 text-[13px] font-medium text-accent-700 hover:bg-accent-50 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-300 dark:hover:bg-accent-900/30"
              >
                {derive.preview === 'loading' ? (
                  <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles aria-hidden className="h-3.5 w-3.5" />
                )}
                Translate with AI
              </button>
            </div>
            {derive.preview && derive.preview !== 'loading' && (
              <div className="mt-1.5 rounded-lg border border-slate-100 p-2 dark:border-slate-800">
                <p className="break-words font-mono text-[13px] text-slate-700 dark:text-slate-200">
                  {derive.preview.expression_sql ?? derive.preview.expression_typed ?? '—'}
                </p>
                {(derive.preview.referenced_columns?.length ?? 0) > 0 && (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    uses {derive.preview.referenced_columns!.join(', ')}
                  </p>
                )}
                {derive.preview.probe?.samples && derive.preview.probe.samples.length > 0 ? (
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    type {derive.preview.probe.type ?? '—'} · sample{' '}
                    {derive.preview.probe.samples.slice(0, 3).map((s) => String(s).slice(0, 18)).join(', ')}
                  </p>
                ) : derive.preview.probe?.state === 'unavailable' ? (
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    sample unavailable — {derive.preview.probe.reason ?? 'the warehouse could not probe it'}
                  </p>
                ) : null}
                <p className="mt-0.5 text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  translated by {derive.preview.translation?.model ?? 'the model'} · preview is free
                </p>
                <button
                  type="button"
                  disabled={busy === 'derive'}
                  onClick={addDerived}
                  className="mt-1.5 inline-flex h-7 items-center gap-1.5 rounded-lg bg-accent-600 px-2.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40"
                >
                  {busy === 'derive' ? 'Adding…' : 'Add this column'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* the full column table */}
      {cols.length > 0 && (
        <div className="mt-2.5 overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
          <table className="min-w-full text-[13px]">
            <thead className="sticky top-0 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400 dark:bg-slate-800 dark:text-slate-500">
              <tr>
                <th className="px-2 py-1 font-medium">Column</th>
                <th className="px-2 py-1 font-medium">Type</th>
                <th className="px-2 py-1 font-medium">Role</th>
                <th className="px-2 py-1 font-medium">Null</th>
                {target && <th className="px-2 py-1 font-medium">From</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {cols.map((c) => {
                const role = columnRole(c, grainKeys);
                const open = openCol === c.name;
                return (
                  <tr
                    key={c.name}
                    onClick={() => setOpenCol((o) => (o === c.name ? null : c.name))}
                    className={`cursor-pointer ${open ? 'bg-accent-50/60 dark:bg-accent-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                  >
                    <td className="whitespace-nowrap px-2 py-1 font-mono text-slate-700 dark:text-slate-300">
                      {c.name}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-slate-500 dark:text-slate-400">
                      {c.type ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-2 py-1 text-slate-500 dark:text-slate-400">
                      {(() => {
                        if (!target) return ROLE_WORD[role] ?? role;
                        const k = readTargetColumnKey(c, target, sourceKeyIndex);
                        return k.role === 'none' ? (
                          (ROLE_WORD[role] ?? role)
                        ) : (
                          <span
                            className={`rounded-full px-1.5 py-px ${CONFIDENCE_CLS[k.confidence]}`}
                            title={`${k.explanation}${k.wouldConfirm ? ` ${k.wouldConfirm}` : ''}`}
                          >
                            {k.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-2 py-1 text-slate-500 dark:text-slate-400">
                      {c.nullable == null ? '—' : c.nullable ? 'yes' : 'no'}
                    </td>
                    {target && (
                      <td className="whitespace-nowrap px-2 py-1 font-mono text-xs text-slate-500 dark:text-slate-400">
                        {c.expression
                          ? `= ${c.expression}`
                          : c.source?.column
                            ? `${(c.source.fqn ?? '').split('.').slice(-1)[0]}.${c.source.column}`
                            : '—'}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* one column, in depth */}
      {selectedCol && (
        <div className="mt-2 rounded-lg border border-slate-100 p-2.5 dark:border-slate-800">
          <p className="font-mono text-[13px] font-medium text-slate-800 dark:text-slate-200">
            {selectedCol.name}
          </p>
          <dl className="mt-1 space-y-0.5 text-[13px] text-slate-600 dark:text-slate-300">
            <div>
              <dt className="inline text-slate-400 dark:text-slate-500">Definition — </dt>
              <dd className="inline">
                {selectedCol.type ?? '—'} · {ROLE_WORD[columnRole(selectedCol, grainKeys)]}
                {selectedCol.nullable === false ? ' · not null' : ''}
              </dd>
            </div>
            {target && (
              <div>
                <dt className="inline text-slate-400 dark:text-slate-500">Mapping — </dt>
                <dd className="inline font-mono text-xs">
                  {selectedCol.expression
                    ? `= ${selectedCol.expression}`
                    : selectedCol.source?.column
                      ? `${selectedCol.source.fqn ?? ''}.${selectedCol.source.column}`
                      : 'no source mapping'}
                </dd>
              </div>
            )}
            {selectedCol.rule?.kind && (
              <div>
                <dt className="inline text-slate-400 dark:text-slate-500">Rule — </dt>
                <dd className="inline">
                  {selectedCol.rule.kind} → {selectedCol.rule.behavior ?? '—'}
                  {(selectedCol.responsible_job_id ?? producerJob?.job_id) && onOpenJob && (
                    <button
                      type="button"
                      onClick={() =>
                        onOpenJob(selectedCol.responsible_job_id ?? producerJob!.job_id)
                      }
                      className="ml-1.5 text-accent-700 hover:underline dark:text-accent-400"
                    >
                      edit in the process
                    </button>
                  )}
                </dd>
              </div>
            )}
            <div>
              <dt className="inline text-slate-400 dark:text-slate-500">Used in — </dt>
              <dd className="inline">
                {(() => {
                  const uses = reportUsages(report, fqn, selectedCol.name);
                  return uses.length > 0 ? uses.join(' · ') : 'no saved widget uses this column';
                })()}
              </dd>
            </div>
          </dl>
          {target && (
            <ColumnEdit
              key={selectedCol.name}
              col={selectedCol}
              sources={tables}
              disabled={busy != null}
              onSave={(patch) =>
                void act('editcol', () =>
                  patchModel(
                    draftId,
                    [
                      {
                        op: 'set',
                        path: `/model/targets/${tgtIdx}/columns/${selectedColIdx}`,
                        value: { ...selectedCol, ...patch },
                      },
                    ],
                    true,
                    `edit column ${selectedCol.name} of ${name}`,
                  ),
                )
              }
            />
          )}
        </div>
      )}

      {/* declare a relation — sources only, selects from real columns */}
      {srcTable && others.length > 0 && (
        <div className="mt-2.5 rounded-lg border border-slate-100 p-2.5 dark:border-slate-800">
          <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Link2 aria-hidden className="h-3 w-3" /> Declare a relation
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px]">
            <select
              value={rel.fromCol}
              onChange={(e) => setRel({ ...rel, fromCol: e.target.value })}
              aria-label={`Column of ${name}`}
              className="h-7 rounded-lg border border-slate-200 bg-white px-1.5 font-mono text-[13px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <option value="">{name} column…</option>
              {cols.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <span className="text-slate-400">→</span>
            <select
              value={rel.to}
              onChange={(e) => setRel({ ...rel, to: e.target.value, toCol: '' })}
              aria-label="Related table"
              className="h-7 rounded-lg border border-slate-200 bg-white px-1.5 text-[13px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <option value="">table…</option>
              {others.map((o) => (
                <option key={o.entity_id} value={o.entity_id}>
                  {o.name}
                </option>
              ))}
            </select>
            <select
              value={rel.toCol}
              onChange={(e) => setRel({ ...rel, toCol: e.target.value })}
              disabled={!rel.to}
              aria-label="Its column"
              className="h-7 rounded-lg border border-slate-200 bg-white px-1.5 font-mono text-[13px] disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              <option value="">its column…</option>
              {toCols.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={rel.card}
              onChange={(e) => setRel({ ...rel, card: e.target.value })}
              aria-label="Cardinality"
              className="h-7 rounded-lg border border-slate-200 bg-white px-1.5 text-[13px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            >
              {['many_to_one', 'one_to_many', 'one_to_one', 'many_to_many'].map((c) => (
                <option key={c} value={c}>
                  {c.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!rel.to || !rel.fromCol || !rel.toCol || busy === 'rel'}
              title="Declared by you — validated against the data before it draws"
              onClick={() =>
                void act('rel', () =>
                  patchModel(
                    draftId,
                    [
                      {
                        op: 'add',
                        path: '/understanding/relationships/-',
                        /* The server's shape, verified against its own
                         * validator — this button could never have worked
                         * before: it sent `from`/`to` (read as None, so
                         * "left entity None not in the model"), a status
                         * outside the enum, and no evidence at all.
                         * `declared_not_enforced` is the honest status for
                         * a relation a person asserts and the data has not
                         * yet confirmed. */
                        value: {
                          left: { entity_id: rawId, column: rel.fromCol },
                          right: { entity_id: rel.to, column: rel.toCol },
                          cardinality: rel.card,
                          status: 'declared_not_enforced',
                          evidence: {
                            source: 'declared by the modeller',
                            basis: `${rel.fromCol} was declared to match ${rel.toCol} on ${toTable?.name ?? rel.to}`,
                          },
                        },
                      },
                    ],
                    true,
                    `declare relation ${name} → ${toTable?.name}`,
                  ),
                )
              }
              className="h-7 rounded-lg bg-accent-600 px-2.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40"
            >
              {busy === 'rel' ? 'Declaring…' : 'Declare'}
            </button>
          </div>
        </div>
      )}

      {/* The rich source sheet: the company's own words (editable, fed to
        * the LLM), health, storage cost with its assumptions, functional
        * relation sentences, load pattern, sample DQ, and the KPI
        * candidates to keep — all from one /sources/card read. Replaces
        * the three ad-hoc blocks that each did a slice of this. */}
      {srcTable && (
        <StudioSourceCard
          draftId={draftId}
          entityId={rawId}
          onChanged={onApplied}
        />
      )}

      {/* a SOURCE table: browse its columns searchably, and see at a glance
        * which ones already feed the application's model — the tool for
        * composing a target from a wide source */}
      {srcTable && (
        <div className="mt-2.5 rounded-lg border border-slate-100 p-2.5 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Columns of this source
            </p>
            <label className="relative ml-auto">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
              />
              <input
                value={colQuery}
                onChange={(e) => setColQuery(e.target.value)}
                placeholder="Search columns"
                aria-label="Search columns"
                className="h-7 w-44 rounded-lg border border-slate-200 bg-white pl-7 pr-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </label>
          </div>
          {colPage === 'loading' ? (
            <p className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] text-slate-500 dark:text-slate-400">
              <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" /> reading the columns…
            </p>
          ) : colPage === 'error' ? (
            <p className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400">
              The column list could not be read.
            </p>
          ) : colPage ? (
            <>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {colPage.total ?? colPage.items.length} column(s)
                {colQuery ? ` matching « ${colQuery} »` : ''} ·{' '}
                {colPage.items.filter((c) => c.target).length} of those shown already feed the model
              </p>
              <div className="mt-1 overflow-x-auto rounded-lg border border-slate-100 dark:border-slate-800">
                <table className="min-w-full text-[13px]">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                    <tr>
                      <th className="px-2 py-1 font-medium">Column</th>
                      <th className="px-2 py-1 font-medium">Type</th>
                      <th className="px-2 py-1 font-medium">Key</th>
                      <th className="px-2 py-1 font-medium">In the model</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {colPage.items.map((c) => (
                      <tr key={c.name}>
                        <td className="whitespace-nowrap px-2 py-1 font-mono text-slate-700 dark:text-slate-300">
                          {c.name}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1 text-slate-500 dark:text-slate-400">
                          {c.type ?? '—'}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1 text-slate-500 dark:text-slate-400">
                          {(() => {
                            const k = readKey(c.key as KeyFacts | null, { columnRole: c.role });
                            return (
                              <span
                                className={`rounded-full px-1.5 py-px ${CONFIDENCE_CLS[k.confidence]}`}
                                title={`${k.explanation}${k.wouldConfirm ? ` ${k.wouldConfirm}` : ''}`}
                              >
                                {k.label}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1">
                          {c.target ? (
                            <span
                              className="text-emerald-700 dark:text-emerald-300"
                              title={`${c.target.column}${c.target.expression ? ` = ${c.target.expression}` : ''}${c.target.rule?.kind ? ` · rule ${c.target.rule.kind}` : ''}`}
                            >
                              yes, as {c.target.column}
                              {c.target.rule?.kind ? ' · checked' : ''}
                            </span>
                          ) : (
                            <span className="text-slate-400 dark:text-slate-500">not yet</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {colPage.has_more && (
                <button
                  type="button"
                  onClick={() => setColLimit((n) => n + 25)}
                  className="mt-1 text-[13px] text-accent-700 hover:underline dark:text-accent-400"
                >
                  Show more columns
                </button>
              )}
            </>
          ) : null}
        </div>
      )}

      {/* relations of THIS target — the join columns, the cardinality, and
        * whether it has actually been checked against the data */}
      {target && (
        <div className="mt-2.5 rounded-lg border border-slate-100 p-2.5 dark:border-slate-800">
          <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <Link2 aria-hidden className="h-3 w-3" /> Relations
          </p>
          {(() => {
            const raw = (view?.relationships ?? []).filter(
              (r) => r.left?.target_id === target.target_id || r.right?.target_id === target.target_id,
            );
            // the same join can arrive twice (both directions) — collapse
            // exact duplicates so the list is read once, not doubled
            const seenRel = new Set<string>();
            const rels = raw.filter((r) => {
              const h = r.left?.target_id === target.target_id ? r.left : r.right;
              const o = r.left?.target_id === target.target_id ? r.right : r.left;
              // include cardinality + status so the collapse is LOSSLESS: two
              // relations on the same columns but a different shape/verdict are
              // kept apart, never silently merged into whichever arrived first
              const meta = r as { cardinality?: string; status?: string };
              const sig = `${(h?.columns ?? []).join(',')}=>${o?.target_id}.${(o?.columns ?? []).join(',')}|${meta.cardinality ?? ''}|${meta.status ?? ''}`;
              if (seenRel.has(sig)) return false;
              seenRel.add(sig);
              return true;
            });
            if (rels.length === 0)
              return (
                <p className="mt-1 text-[13px] text-slate-500 dark:text-slate-400">
                  No relation declared between this table and the others.
                </p>
              );
            return (
              <>
              <ul className="mt-1 space-y-1.5">
                {rels.slice(0, relLimit).map((r, i) => {
                  const here = r.left?.target_id === target.target_id ? r.left : r.right;
                  const other = r.left?.target_id === target.target_id ? r.right : r.left;
                  /* The verdict is DERIVED, not asked: the referenced side's
                     key role decides it, and the application's confirmed
                     grain is the strongest evidence there is. */
                  const otherTarget = (view?.targets ?? []).find(
                    (t) => t.target_id === other?.target_id,
                  );
                  const rightKey = otherTarget
                    ? readTargetColumnKey(
                        { name: (other?.columns ?? [])[0] ?? '' },
                        otherTarget,
                        sourceKeyIndex,
                      )
                    : null;
                  const v = readRelation(r, rightKey);
                  return (
                    <li key={r.relationship_id ?? i} className="text-[13px]">
                      <p
                        className="break-words text-slate-700 dark:text-slate-200"
                        title={`${(here?.columns ?? []).join(', ') || '—'} → ${other?.name ?? '—'}.${(other?.columns ?? []).join(', ') || '—'}`}
                      >
                        <span className="font-mono text-xs">
                          {(here?.columns ?? []).join(', ') || '—'}
                        </span>{' '}
                        → <span className="font-medium">{other?.name ?? '—'}</span>
                        <span className="font-mono text-xs">.{(other?.columns ?? []).join(', ') || '—'}</span>
                      </p>
                      <p className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500 dark:text-slate-400">
                        <span
                          className={`rounded-full px-1.5 py-px ${CONFIDENCE_CLS[v.confidence]}`}
                          title={v.explanation}
                        >
                          {v.label}
                        </span>
                        <span>{cardinalityWords(v.cardinality)}</span>

                        {/* the AI is offered ONLY where the evidence cannot
                            decide — never to restate what it already says */}
                        {v.undecidable && onAskAi && (
                          <button
                            type="button"
                            onClick={() =>
                              onAskAi(
                                `Settle the link ${here?.name}.${(here?.columns ?? []).join('+')} → ${other?.name}.${(other?.columns ?? []).join('+')}: ` +
                                  `is the referenced column unique, and does every value on the left exist on the right? ` +
                                  `If it does not hold, say how many rows break it and propose the correction.`,
                              )
                            }
                            className="text-accent-700 hover:underline dark:text-accent-400"
                          >
                            check it against the data
                          </button>
                        )}
                      </p>
                    </li>
                  );
                })}
              </ul>
              {rels.length > 6 && (
                <button
                  type="button"
                  onClick={() => setRelLimit((n) => (n >= rels.length ? 6 : rels.length))}
                  className="mt-1 text-xs text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-400"
                >
                  {relLimit >= rels.length ? 'show fewer' : `show all ${rels.length} relations`}
                </button>
              )}
              </>
            );
          })()}
          {/* declare one between TARGET tables, from real columns — the link
              builder, kept right under a SHORT list so linking never means
              scrolling a hub table's relations first */}
          {(view?.targets.length ?? 0) > 1 && (
            <div className="mt-2.5 border-t border-slate-100 pt-2 dark:border-slate-800">
              <p className="mb-1 text-xs font-medium text-slate-600 dark:text-slate-300">Add a link</p>
              <div className="grid grid-cols-2 gap-x-2 gap-y-1.5 text-[13px]">
              <label className="min-w-0 text-xs text-slate-500 dark:text-slate-400">
                This column
                <select
                  value={rel.fromCol}
                  onChange={(e) => setRel({ ...rel, fromCol: e.target.value })}
                  aria-label={`Column of ${name}`}
                  className="mt-0.5 block h-8 w-full truncate rounded-lg border border-slate-200 bg-white px-1.5 font-mono text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="">choose…</option>
                  {cols.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="min-w-0 text-xs text-slate-500 dark:text-slate-400">
                Points at
                <select
                  value={rel.to}
                  onChange={(e) => setRel({ ...rel, to: e.target.value, toCol: '' })}
                  aria-label="Related table"
                  className="mt-0.5 block h-8 w-full truncate rounded-lg border border-slate-200 bg-white px-1.5 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="">table…</option>
                  {(view?.targets ?? [])
                    .filter((t) => t.target_id !== target.target_id)
                    .map((t) => (
                      <option key={t.target_id} value={t.target_id}>
                        {t.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="min-w-0 text-xs text-slate-500 dark:text-slate-400">
                Its column
                <select
                  value={rel.toCol}
                  onChange={(e) => setRel({ ...rel, toCol: e.target.value })}
                  disabled={!rel.to}
                  aria-label="Its column"
                  className="mt-0.5 block h-8 w-full truncate rounded-lg border border-slate-200 bg-white px-1.5 font-mono text-[13px] text-slate-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="">choose…</option>
                  {((view?.targets ?? []).find((t) => t.target_id === rel.to)?.columns ?? []).map(
                    (c) => (
                      <option key={c.name} value={c.name}>
                        {c.name}
                      </option>
                    ),
                  )}
                </select>
              </label>
              <label className="min-w-0 text-xs text-slate-500 dark:text-slate-400">
                Shape
                <select
                  value={rel.card}
                  onChange={(e) => setRel({ ...rel, card: e.target.value })}
                  aria-label="Cardinality"
                  className="mt-0.5 block h-8 w-full truncate rounded-lg border border-slate-200 bg-white px-1.5 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {Object.entries(CARD_WORDS).map(([k, v2]) => (
                    <option key={k} value={k}>
                      {v2}
                    </option>
                  ))}
                </select>
              </label>
              </div>
            </div>
          )}

          {/* COMPOSITE: one source can point at a target through several
              columns — each extra pair joins the declaration. The right
              side need not be a declared PK. */}
          {rel.to && (
            <div className="mt-1.5 space-y-1">
              {relPairs.map((pr, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <select
                    value={pr.fromCol}
                    aria-label={`Additional column ${i + 2} of ${name}`}
                    onChange={(e) =>
                      setRelPairs((ps) => ps.map((x, xi) => (xi === i ? { ...x, fromCol: e.target.value } : x)))
                    }
                    className="h-8 w-[42%] truncate rounded-lg border border-slate-200 bg-white px-1.5 font-mono text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <option value="">column…</option>
                    {cols.map((c) => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                  <span aria-hidden className="text-xs text-slate-400">→</span>
                  <select
                    value={pr.toCol}
                    aria-label={`Additional matching column ${i + 2}`}
                    onChange={(e) =>
                      setRelPairs((ps) => ps.map((x, xi) => (xi === i ? { ...x, toCol: e.target.value } : x)))
                    }
                    className="h-8 w-[42%] truncate rounded-lg border border-slate-200 bg-white px-1.5 font-mono text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                  >
                    <option value="">column…</option>
                    {((view?.targets ?? []).find((t) => t.target_id === rel.to)?.columns ?? []).map((c) => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    aria-label={`Remove column pair ${i + 2}`}
                    onClick={() => setRelPairs((ps) => ps.filter((_, xi) => xi !== i))}
                    className="rounded p-1 text-slate-400 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                  >
                    <X aria-hidden className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRelPairs((ps) => [...ps, { fromCol: '', toCol: '' }])}
                  className="text-xs text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-400"
                >
                  + another column pair (composite key)
                </button>
                <button
                  type="button"
                  disabled={!rel.to || !rel.fromCol || !rel.toCol || busy === 'rel'}
                  title="Declares the relation, then counts the orphans on the real data — a key that does not hold is told, not hidden. The matched column need not be a declared PK."
                  onClick={() => {
                    const t2 = (view?.targets ?? []).find((t) => t.target_id === rel.to);
                    if (t2) void checkAndDeclareRel(t2);
                  }}
                  className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent-600 px-3 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                >
                  {busy === 'rel' || relCheck === 'running' ? (
                    <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Check &amp; declare
                </button>
              </div>
              {relCheck && relCheck !== 'running' && (
                <p
                  role="status"
                  className={`rounded-lg px-2.5 py-1.5 text-[13px] ${
                    'verdict' in relCheck
                      ? relCheck.verdict === 'pass'
                        ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200'
                        : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
                      : 'bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300'
                  }`}
                >
                  {'verdict' in relCheck
                    ? relCheck.verdict === 'pass'
                      ? `Checked on the real data: ${relCheck.orphans ?? '—'} orphan(s) of ${relCheck.leftRows != null ? relCheck.leftRows.toLocaleString() : '—'} rows — the key holds.`
                      : `The key does NOT hold: ${relCheck.orphans != null ? relCheck.orphans.toLocaleString() : '—'} orphan(s) of ${relCheck.leftRows != null ? relCheck.leftRows.toLocaleString() : '—'} rows${relCheck.orphanPct != null ? ` (${Math.round(relCheck.orphanPct * 100) / 100}%)` : ''}. The relation stays declared so Quality can point at the rows.`
                    : relCheck.note}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* governance names + row access — the SAME roles the Access view
        * plans; generated for this application, shown at the data */}
      <div className="mt-2.5 rounded-lg border border-slate-100 p-2.5 dark:border-slate-800">
        <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <ShieldCheck aria-hidden className="h-3 w-3" /> Governance & row access
        </p>
        {gov == null && (
          <button
            type="button"
            onClick={() => {
              setGov('loading');
              suggestRls(draftId)
                .then(setGov)
                .catch(() => setGov('error'));
            }}
            className="mt-1.5 text-[13px] text-accent-700 hover:underline dark:text-accent-400"
          >
            Show the data roles and row-access candidates
          </button>
        )}
        {gov === 'loading' && (
          <p className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] text-slate-500 dark:text-slate-400">
            <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" /> reading observed values…
          </p>
        )}
        {gov === 'error' && (
          <p className="mt-1.5 text-[13px] text-slate-500 dark:text-slate-400">
            The suggestion could not be read — the Access view stays available.
          </p>
        )}
        {gov != null && typeof gov === 'object' && (
          <div className="mt-1.5 space-y-1.5 text-[13px] text-slate-600 dark:text-slate-300">
            {gov.roles?.access_role && (
              <p>
                Data-access role (holds the grants once):{' '}
                <button
                  type="button"
                  onClick={() => void navigator.clipboard?.writeText(gov.roles!.access_role!)}
                  title="Click to copy"
                  className="rounded font-mono text-xs text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  {gov.roles.access_role}
                </button>
              </p>
            )}
            {gov.roles?.functional && (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Functional roles:{' '}
                {Object.entries(gov.roles.functional)
                  .map(([k, v]) => `${k} → ${v}`)
                  .join(' · ')}
              </p>
            )}
            {(() => {
              const mine = (gov.candidates ?? []).filter(
                (c) =>
                  !fqn ||
                  c.fqn === fqn ||
                  (target?.columns ?? []).some((tc) => tc.source?.fqn === c.fqn),
              );
              if (mine.length === 0)
                return (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    No row-access candidate observed on this table&apos;s columns.
                  </p>
                );
              return mine.map((c) => (
                <p key={`${c.fqn}.${c.column}`} className="flex flex-wrap items-center gap-x-2">
                  <span className="font-mono text-xs">{c.column}</span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    observed{' '}
                    {(c.observed_values ?? [])
                      .slice(0, 4)
                      .map((v) => `${v.value} (${v.count ?? '—'})`)
                      .join(' · ')}
                    {(c.observed_values?.length ?? 0) > 4
                      ? ` · +${c.observed_values!.length - 4} more`
                      : ''}
                  </span>
                  {onOpenAccess && (
                    <>
                      <button
                        type="button"
                        onClick={onOpenAccess}
                        className="text-xs text-accent-700 hover:underline dark:text-accent-400"
                        title="Plan the row restriction in Governance — it attaches to the data role, reused by every functional role"
                      >
                        restrict rows by {c.column}
                      </button>
                      <button
                        type="button"
                        onClick={onOpenAccess}
                        className="text-xs text-accent-700 hover:underline dark:text-accent-400"
                        title="Mask this column (CLS) in Governance — hidden for the base roles, kept clear for admin & approve"
                      >
                        mask {c.column}
                      </button>
                    </>
                  )}
                </p>
              ));
            })()}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-[13px] text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </aside>
  );
}

/** Inline edit of what the backend allows on a target column — including
 *  the MAPPING STEP (which source column feeds it), never free text. */
function ColumnEdit({
  col,
  sources,
  disabled,
  onSave,
}: {
  col: RealColumn;
  /** The understood source tables with their real columns. */
  sources: ModelTable[];
  disabled: boolean;
  onSave: (patch: Partial<RealColumn>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState(col.type ?? '');
  const [from, setFrom] = useState<'source' | 'expression'>(
    col.expression ? 'expression' : 'source',
  );
  /* NO pre-pick of sources[0]: an unmapped column used to open with an
   * arbitrary table already chosen, so a reader who only touched "source
   * column" saved a mapping to a table they never selected. */
  const [srcFqn, setSrcFqn] = useState(col.source?.fqn ?? '');
  const [srcCol, setSrcCol] = useState(col.source?.column ?? '');
  const [expr, setExpr] = useState(col.expression ?? '');
  const srcTable = sources.find((s) => s.fqn === srcFqn);
  const srcCols: Array<{ name: string }> = Array.isArray(
    (srcTable as { columns?: Array<{ name: string }> } | undefined)?.columns,
  )
    ? ((srcTable as { columns?: Array<{ name: string }> }).columns ?? [])
    : [];
  if (!open)
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1.5 text-[13px] text-accent-700 hover:underline dark:text-accent-400"
      >
        Edit this column
      </button>
    );
  return (
    <div className="mt-2 space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs text-slate-500 dark:text-slate-400">
          Type
          <input
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="mt-0.5 block h-7 w-28 rounded-lg border border-slate-200 bg-white px-2 font-mono text-[13px] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
          />
        </label>
        <label className="text-xs text-slate-500 dark:text-slate-400">
          Fed by
          <select
            value={from}
            onChange={(e) => setFrom(e.target.value as 'source' | 'expression')}
            className="mt-0.5 block h-7 rounded-lg border border-slate-200 bg-white px-1.5 text-[13px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            <option value="source">a source column</option>
            <option value="expression">an SQL expression</option>
          </select>
        </label>
        {from === 'source' ? (
          <>
            {sources.length > 1 && (
              <label className="text-xs text-slate-500 dark:text-slate-400">
                Source table
                <select
                  value={srcFqn}
                  onChange={(e) => {
                    setSrcFqn(e.target.value);
                    setSrcCol('');
                  }}
                  className="mt-0.5 block h-7 max-w-44 rounded-lg border border-slate-200 bg-white px-1.5 font-mono text-xs dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  <option value="">table…</option>
                  {sources.map((s) => (
                    <option key={s.fqn} value={s.fqn}>
                      {s.fqn.split('.').slice(-1)[0]}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-xs text-slate-500 dark:text-slate-400">
              Source column
              <select
                value={srcCol}
                onChange={(e) => setSrcCol(e.target.value)}
                className="mt-0.5 block h-7 rounded-lg border border-slate-200 bg-white px-1.5 font-mono text-[13px] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                <option value="">column…</option>
                {srcCols.map((c) => (
                  <option key={c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <label className="text-xs text-slate-500 dark:text-slate-400">
            Expression (SQL)
            <input
              value={expr}
              onChange={(e) => setExpr(e.target.value)}
              className="mt-0.5 block h-7 w-48 rounded-lg border border-slate-200 bg-white px-2 font-mono text-[13px] dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            />
          </label>
        )}
        <button
          type="button"
          disabled={disabled || (from === 'source' ? !srcFqn || !srcCol : !expr.trim())}
          onClick={() =>
            onSave(
              from === 'source'
                ? {
                    type: type.trim() || undefined,
                    source: { fqn: srcFqn, column: srcCol },
                    expression: null,
                  }
                : { type: type.trim() || undefined, expression: expr.trim(), source: null },
            )
          }
          className="h-7 rounded-lg bg-accent-600 px-2.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="h-7 px-1 text-[13px] text-slate-500 hover:text-slate-700 dark:text-slate-400"
        >
          Cancel
        </button>
      </div>
      <p className="text-xs text-slate-400 dark:text-slate-500">
        Saved to the draft through the validated patch — the process regenerates its SQL from
        this mapping unless it was switched to expert SQL.
      </p>
    </div>
  );
}
