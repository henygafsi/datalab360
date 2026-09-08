'use client';

/**
 * UnderstandingStep — "Did we understand your data right?"
 *
 * /studio contract (T1, schema studio.v1). The user EXPLICITLY picks the
 * tables to analyze from the databases chosen in SourcesStep (discovery ≠
 * inclusion — we never load the whole account into the model), then ONE
 * bounded pass of POST /studio/understand classifies columns, proposes
 * relationships (sample-inferred = hypothesis, never fact) and surfaces
 * the domain definitions the USER must decide — nothing is pre-answered.
 * No workspace project is required: the /studio contract doesn't use one.
 *
 * SEAM (M2 → M3, PreviewStep): just before onNext() the raw
 * StudioUnderstanding payload — exactly as returned by understand() — is
 * written to sessionStorage['studio:understanding:v1'] as JSON.
 * PreviewStep parses that key and feeds generateReport({ understanding })
 * without re-running the analysis; the user's definition choices live in
 * draft.understanding.decisions (definition_id → chosen option), and
 * draft.understanding.approvedPlanId carries the run_id of the approved
 * analysis.
 */

import { useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  type Edge,
  type Node,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Database, Search, Sparkles, TableProperties } from 'lucide-react';
import { PlainQuestionHeader, QuietAction } from '@/app/shared/studio/PlainKit';
import EmptyState from '@/components/ui/EmptyState';
import { routes } from '@/config/routes';
import { useRouter } from 'next/navigation';
import { DecisionsPanel, CoveragePanel } from './ProposalPanels';
import {
  generateReport,
  getStudioObjects,
  relEndpoints,
  suggestSources,
  understandDirect,
  type SourceSuggestion,
  type StudioDecision,
  type StudioObject,
  type StudioUnderstanding,
  type StudioEntity,
  type StudioRelationship,
} from '@/app/services/studio/studio-api';
import type { JourneyDraft } from './journey';

const MAX_PICKS = 8;
const UNDERSTANDING_SEAM_KEY = 'studio:understanding:v1';
const DB_PREFIX = 'sf:db:';

/* ── small honest formatters ───────────────────────────────────────── */

/** '—' for unknown, real number (0 included) otherwise — never a fake 0. */
function fmtRows(n?: number | null): string {
  return n == null ? '—' : n.toLocaleString();
}

/**
 * The live backend returns `grain` as an object ({ statement, key, … })
 * while older payloads used a plain string — accept both, show a sentence.
 */
function grainText(grain: unknown): string | null {
  if (typeof grain === 'string' && grain.trim()) return grain;
  if (grain && typeof grain === 'object') {
    const g = grain as { statement?: unknown; key?: unknown };
    if (typeof g.statement === 'string' && g.statement.trim()) return g.statement;
    if (Array.isArray(g.key) && g.key.length) return `one row per ${g.key.join(' + ')}`;
  }
  return null;
}

/** Live payload uses row_count_approx; the typed client says approx_row_count. */
function entityRows(e: StudioEntity): number | null {
  if (e.approx_row_count != null) return e.approx_row_count;
  const raw = (e as unknown as { row_count_approx?: number | null }).row_count_approx;
  return raw ?? null;
}

function rolesSummary(e: StudioEntity): string[] {
  const fields = e.fields ?? [];
  const measures = fields.filter((f) => f.role === 'measure').length;
  const dimensions = fields.filter((f) => f.role === 'dimension').length;
  const time = fields.find((f) => f.role === 'time')?.name;
  const parts: string[] = [];
  if (measures > 0) parts.push(`${measures} measure${measures === 1 ? '' : 's'}`);
  if (dimensions > 0) parts.push(`${dimensions} dimension${dimensions === 1 ? '' : 's'}`);
  if (time) parts.push(`time: ${time}`);
  return parts;
}

function relationshipKeys(r: StudioRelationship): string {
  return relEndpoints(r).keys ?? '—';
}

type UnderstandStep = { step?: unknown; status?: unknown; duration_ms?: unknown };

/** Real pipeline steps from the payload — rendered post-run as provenance. */
function stepsLine(u: StudioUnderstanding): string | null {
  const steps = (Array.isArray(u.steps) ? u.steps : []).filter(
    (s): s is UnderstandStep => Boolean(s) && typeof s === 'object',
  );
  if (steps.length === 0) return null;
  return steps
    .map((s) => {
      const name = String(s.step ?? '').replace(/_/g, ' ');
      if (!name) return null;
      if (s.status === 'skipped') return `${name} (skipped)`;
      const ms = typeof s.duration_ms === 'number' ? s.duration_ms : null;
      return ms != null && ms >= 100 ? `${name} ${(ms / 1000).toFixed(1)}s` : name;
    })
    .filter(Boolean)
    .join(' · ');
}

function toErrorMessage(e: unknown): string {
  const resp = (e as { response?: { status?: number; data?: { detail?: { message?: string } | string } } })
    ?.response;
  const detail = resp?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail?.message) return detail.message;
  // Plain 5xx / timeout: each table is profiled one by one backend-side, so
  // large selections are the usual cause — say so instead of an axios code.
  if ((resp?.status ?? 0) >= 500 || /timeout/i.test(String((e as Error)?.message ?? ''))) {
    return 'The analysis did not finish — with many tables it can exceed the backend limit. Try again with fewer tables (each one is profiled), then add the rest in a second pass.';
  }
  return e instanceof Error ? e.message : 'Analysis failed';
}

/* ── component ─────────────────────────────────────────────────────── */

type Pick_ = { database: string; fqn: string };
type DbObjects = { db: string; objects: StudioObject[]; truncated?: boolean; error?: boolean };
type Analysis =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; u: StudioUnderstanding }
  | { kind: 'error'; message: string };

export default function UnderstandingStep({
  draft,
  onPatch,
  onNext,
  onBack,
}: {
  draft: JourneyDraft;
  onPatch: (patch: Partial<JourneyDraft>) => void;
  onNext: () => void;
  onBack?: () => void;
}) {
  // Databases = the base-kind studio sources picked in SourcesStep
  // ('sf:db:<DB>'). Other source kinds have no table discovery here.
  const databases = useMemo(
    () =>
      draft.sources.connectionIds
        .filter((id) => id.startsWith(DB_PREFIX))
        .map((id) => id.slice(DB_PREFIX.length)),
    [draft.sources.connectionIds],
  );
  const skippedSources = draft.sources.connectionIds.length - databases.length;

  const [byDb, setByDb] = useState<DbObjects[] | null>(null);
  const [query, setQuery] = useState('');
  // Resume-friendly: draft.sources.objects already holds {connectionId: db, name: fqn}.
  const [picks, setPicks] = useState<Pick_[]>(() =>
    draft.sources.objects.map((o) => ({ database: o.connectionId, fqn: o.name })),
  );
  const [analysis, setAnalysis] = useState<Analysis>({ kind: 'idle' });
  // Graph → list link: clicking a node rings the matching entity card.
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);

  useEffect(() => {
    if (databases.length === 0) {
      setByDb([]);
      return;
    }
    let alive = true;
    Promise.allSettled(databases.map((db) => getStudioObjects(db))).then((results) => {
      if (!alive) return;
      setByDb(
        results.map((r, i) =>
          r.status === 'fulfilled'
            ? { db: databases[i], objects: r.value.objects, truncated: r.value.truncated }
            : { db: databases[i], objects: [], error: true },
        ),
      );
    });
    return () => {
      alive = false;
    };
  }, [databases]);

  const anyTruncated = (byDb ?? []).some((d) => d.truncated);
  const failedDbs = (byDb ?? []).filter((d) => d.error).map((d) => d.db);

  const togglePick = (database: string, fqn: string) => {
    const has = picks.some((p) => p.fqn === fqn);
    if (!has && picks.length >= MAX_PICKS) return;
    const next = has ? picks.filter((p) => p.fqn !== fqn) : [...picks, { database, fqn }];
    setPicks(next);
    setAnalysis({ kind: 'idle' }); // the proposal was derived from the old picks
    onPatch({
      sources: {
        ...draft.sources,
        objects: next.map((p) => ({ connectionId: p.database, name: p.fqn })),
      },
    });
  };

  /* ── AI table detection: rank the ALREADY-DISCOVERED candidates against
     the need (no extra database scan — candidates ranking, not name-scan)
     and PRE-TICK only what the backend marks preselect. It stays a
     proposal: every chip is visible, editable, and un-tickable — technical
     noise (migrations, logs) ranks unrelated and is left out. ─────────── */
  const [aiPick, setAiPick] = useState<'idle' | 'running' | 'done'>('idle');
  const [aiPickError, setAiPickError] = useState<string | null>(null);
  const [suggestionByFqn, setSuggestionByFqn] = useState<Record<string, SourceSuggestion>>({});

  const aiPickTables = async () => {
    if (aiPick === 'running' || byDb == null) return;
    const candidates = byDb.flatMap((d) => d.objects.map((o) => ({ fqn: o.fqn })));
    if (candidates.length === 0) return;
    setAiPick('running');
    setAiPickError(null);
    try {
      const { suggestions } = await suggestSources({
        need: draft.need.text,
        domain_id: draft.need.domainId ?? undefined,
        draft_id: draft.draftId ?? undefined,
        candidates,
      });
      const map: Record<string, SourceSuggestion> = {};
      for (const s of suggestions) map[s.fqn] = s;
      setSuggestionByFqn(map);
      // preselect is the ONLY preselect signal — ranked-high alone never ticks
      const auto = suggestions.filter((s) => s.preselect).slice(0, MAX_PICKS);
      if (auto.length > 0) {
        const next = auto.map((s) => ({ database: s.fqn.split('.')[0] ?? '', fqn: s.fqn }));
        setPicks(next);
        setAnalysis({ kind: 'idle' });
        onPatch({
          sources: {
            ...draft.sources,
            objects: next.map((p) => ({ connectionId: p.database, name: p.fqn })),
          },
        });
      }
      setAiPick('done');
    } catch (e) {
      // a budget refusal is a product answer (the envelope panel can raise it)
      setAiPickError(toErrorMessage(e));
      setAiPick('idle');
    }
  };

  const analyze = async () => {
    if (picks.length === 0 || analysis.kind === 'running') return;
    setAnalysis({ kind: 'running' });
    setSelectedEntityId(null); // entity ids belong to one run

    try {
      // Bounded fetch transport — the axios→proxy path has been observed to
      // stall on exactly this POST (see studioPostDirect in studio-api).
      const u = await understandDirect({
        need: draft.need.text,
        domain_id: draft.need.domainId ?? undefined,
        // Business context from the industry selector — persisted in the
        // draft and fed to the AI prompt (best-display + drill order).
        context: draft.need.context ?? undefined,
        objects: picks.map((p) => ({ fqn: p.fqn })),
        use_ai: true,
        // Count the free-preview envelope on THIS journey's backend draft.
        draft_id: draft.draftId ?? undefined,
      });
      setAnalysis({ kind: 'done', u });
    } catch (e) {
      setAnalysis({ kind: 'error', message: toErrorMessage(e) });
    }
  };

  const u = analysis.kind === 'done' ? analysis.u : null;

  /** THE draft every decision/generation must target: when the journey's
   *  own draft was not persisted yet at analyze time, understand
   *  AUTO-CREATED one (u.draft) and THAT is the application — posting
   *  decisions anywhere else bypasses the canonical validation. */
  const analysisDraftId = u?.draft?.draft_id ?? draft.draftId ?? null;

  /* proposal → React Flow (backend layout: facts left, dimensions right;
     grid fallback when no positions) — dashed edge = hypothesis */
  const { nodes: graphNodes, edges: graphEdges } = useMemo((): {
    nodes: Node[];
    edges: Edge[];
  } => {
    if (!u) return { nodes: [], edges: [] };
    const nodes: Node[] = (u.entities ?? []).map((e, i) => ({
      id: String(e.entity_id ?? e.source_fqn),
      position:
        e.position?.x != null && e.position?.y != null
          ? { x: e.position.x, y: e.position.y }
          : { x: (i % 3) * 280, y: Math.floor(i / 3) * 140 },
      data: { label: `${e.name} · ${fmtRows(entityRows(e))} rows` },
      style: { fontSize: 12, borderRadius: 12, padding: 8 },
    }));
    const edges: Edge[] = (u.relationships ?? []).flatMap((r, i) => {
      const ends = relEndpoints(r);
      const source = ends.from.id ?? ends.from.name;
      const target = ends.to.id ?? ends.to.name;
      if (!source || !target) return []; // a relation without references never draws
      const label = ends.keys ?? ends.label;
      return [
        {
          id: `e${i}`,
          source: String(source),
          target: String(target),
          label: label ? String(label) : undefined,
          markerEnd: { type: MarkerType.ArrowClosed },
          labelStyle: { fontSize: 10 },
          // sample-inferred link — dashed until the user validates it
          ...(r.status !== 'validated' ? { style: { strokeDasharray: '6 3' } } : {}),
        },
      ];
    });
    return { nodes, edges };
  }, [u]);

  const entities = u?.entities ?? [];
  const relationships = u?.relationships ?? [];
  const runSteps = u ? stepsLine(u) : null;

  // Unified decisions contract; older payloads (definitions_to_confirm with
  // plain string options) are adapted so nothing renders broken.
  const decisions: StudioDecision[] = useMemo(() => {
    const list = (u?.decisions ?? u?.definitions_to_confirm ?? []) as Array<
      StudioDecision & { definition_id?: string; options?: string[] }
    >;
    return list.map((d) => ({
      ...d,
      decision_id: d.decision_id ?? d.definition_id ?? d.label ?? 'decision',
      choices:
        d.choices ??
        (d.options ?? []).filter(Boolean).map((o) => ({ value: o })),
      input: d.input ?? 'single_select',
      status: d.status === 'to_confirm' ? 'proposed' : d.status,
    }));
  }, [u]);

  const [reportStale, setReportStale] = useState(false);
  const [opening, setOpening] = useState<'idle' | 'working' | 'error'>('idle');
  const [openError, setOpenError] = useState<string | null>(null);
  const router = useRouter();

  /** Iteration A: the assistant ends HERE — generate the report and open
   *  the APPLICATION directly. Unresolved (deferred) decisions only make
   *  their dependent results unavailable, they never block the workspace. */
  const openApplication = async () => {
    if (!u || opening === 'working') return;
    setOpening('working');
    setOpenError(null);
    try {
      // legacy seam kept for the in-journey preview path
      window.sessionStorage.setItem(UNDERSTANDING_SEAM_KEY, JSON.stringify(u));
    } catch {
      /* storage unavailable */
    }
    try {
      const res = await generateReport({
        understanding: u,
        need: draft.need.text,
        draft_id: analysisDraftId ?? undefined,
      });
      const appId = res.draft_id ?? analysisDraftId;
      if (!appId) throw new Error('The application id did not come back.');
      const runId = (u as { run_id?: string }).run_id ?? null;
      onPatch({
        understanding: { ...draft.understanding, approvedPlanId: runId },
        preview: { reportDraftId: res.draft_id ?? null },
      });
      router.push(routes.studioApp(appId));
    } catch (e) {
      setOpening('error');
      setOpenError(toErrorMessage(e));
    }
  };

  const q = query.trim().toLowerCase();

  return (
    <div className="space-y-3">
      <PlainQuestionHeader
        question="Did we understand your data right?"
        detail={`Let the AI detect the tables that matter for “${draft.need.text || 'your goal'}” — or pick up to ${MAX_PICKS} yourself. One analysis run profiles them AND runs the sample quality checks (keys, duplicates, nulls) in the same pass, then proposes the model. You confirm — nothing is decided for you.`}
      />

      {/* 1 · explicit table picks from the /studio object discovery */}
      <section aria-label="Pick tables">
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <TableProperties className="h-4 w-4 text-slate-400" aria-hidden />
            Tables to analyze · {picks.length}/{MAX_PICKS}
          </h3>
          <button
            type="button"
            disabled={aiPick === 'running' || byDb == null || (byDb ?? []).every((d) => d.objects.length === 0)}
            onClick={() => void aiPickTables()}
            title="Ranks the discovered tables against your need — technical noise ranks unrelated. A proposal: you can untick anything."
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent-500 px-2.5 py-1 text-xs font-medium text-accent-700 hover:bg-accent-50 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-300 dark:hover:bg-accent-900/30"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {aiPick === 'running' ? 'Detecting…' : 'Let the AI pick'}
          </button>
          <label className="relative ml-auto">
            <Search
              aria-hidden
              className="pointer-events-none absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-slate-400"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter tables…"
              aria-label="Filter tables"
              className="w-44 rounded-lg border border-slate-200 bg-white py-1 pl-6 pr-2 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            />
          </label>
        </div>

        {databases.length === 0 ? (
          <EmptyState
            compact
            icon={Database}
            title="No table-based source selected"
            description="The sources you picked don't expose tables to analyze — go back and pick at least one warehouse database."
          />
        ) : byDb === null ? (
          <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4" aria-hidden>
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-7 animate-pulse rounded-lg border border-slate-200 bg-slate-100 dark:border-slate-800 dark:bg-slate-800/60"
              />
            ))}
          </div>
        ) : (
          <div className="max-h-40 space-y-2 overflow-y-auto pr-1">
            {byDb.map(({ db, objects, truncated, error }) => {
              const visible = q
                ? objects.filter((o) => o.fqn.toLowerCase().includes(q))
                : objects;
              return (
                <div key={db}>
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <Database className="h-3 w-3 text-slate-400" aria-hidden />
                    {db} · {error ? 'unreadable' : `${visible.length} table${visible.length === 1 ? '' : 's'}`}
                    {truncated && (
                      <span className="font-normal text-slate-400 dark:text-slate-500">
                        · List bounded by the preview policy
                      </span>
                    )}
                  </p>
                  {error ? (
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      Couldn&apos;t list tables for {db} with your access.
                    </p>
                  ) : visible.length === 0 ? (
                    <p className="text-xs text-slate-400 dark:text-slate-500">
                      {q ? 'No table matches the filter.' : 'No readable table in this database.'}
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 gap-1 md:grid-cols-3 xl:grid-cols-4">
                      {visible.map((o) => {
                        const sel = picks.some((p) => p.fqn === o.fqn);
                        const full = picks.length >= MAX_PICKS && !sel;
                        return (
                          <button
                            key={o.fqn}
                            type="button"
                            onClick={() => togglePick(db, o.fqn)}
                            aria-pressed={sel}
                            disabled={full}
                            title={`${o.fqn}${o.type ? ` · ${o.type}` : ''} · ${fmtRows(o.approx_row_count)} rows`}
                            className={`flex items-center gap-1.5 rounded-lg border px-2 py-1 text-left text-xs transition-colors ${
                              sel
                                ? 'border-accent-500 bg-accent-600/5 ring-1 ring-accent-500'
                                : full
                                  ? 'cursor-not-allowed border-slate-200 bg-white opacity-40 dark:border-slate-700 dark:bg-slate-900'
                                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-slate-600'
                            }`}
                          >
                            <span className="min-w-0 flex-1 truncate font-medium text-slate-800 dark:text-slate-200">
                              {o.schema}.{o.table}
                            </span>
                            {(() => {
                              const s = suggestionByFqn[o.fqn];
                              if (!s || (s.relevance !== 'high' && s.relevance !== 'medium')) return null;
                              return (
                                <span
                                  className={`shrink-0 rounded-full px-1.5 py-px text-[10px] ${
                                    s.relevance === 'high'
                                      ? 'bg-accent-600/10 text-accent-700 dark:text-accent-300'
                                      : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                  }`}
                                  title={(s.reasons ?? []).join(' · ') || `relevance: ${s.relevance}`}
                                >
                                  {s.relevance}
                                </span>
                              );
                            })()}
                            <span className="shrink-0 tabular-nums text-xs text-slate-500 dark:text-slate-400">
                              {fmtRows(o.approx_row_count)}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {aiPick === 'done' && (
          <p role="status" className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {picks.length > 0
              ? `The AI pre-ticked ${picks.length} table(s) it marked relevant to your need — the chips say why on hover. Untick anything; nothing runs before Analyze.`
              : 'No table was confidently matched to your need — pick manually, or reword the need.'}
          </p>
        )}
        {aiPickError && (
          <p role="alert" className="mt-1 text-xs text-amber-700 dark:text-amber-400">
            {aiPickError}
          </p>
        )}
        {skippedSources > 0 && (
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {skippedSources} selected source{skippedSources === 1 ? '' : 's'} without table
            discovery stay{skippedSources === 1 ? 's' : ''} out of this analysis.
          </p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={picks.length === 0 || analysis.kind === 'running' || failedDbs.length === databases.length}
            onClick={() => void analyze()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden />
            {analysis.kind === 'running'
              ? 'Analyzing…'
              : `Analyze ${picks.length || ''} table${picks.length === 1 ? '' : 's'}`}
          </button>
          {analysis.kind === 'running' && picks.length > 2 && (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Each table is profiled — {picks.length} tables take roughly{' '}
              {Math.round((picks.length * 12) / 60) || 1} min.
            </p>
          )}
          {runSteps && (
            <p className="text-xs tabular-nums text-slate-400 dark:text-slate-500" title="What the analysis actually did">
              {runSteps}
            </p>
          )}
        </div>
      </section>

      {analysis.kind === 'error' && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {analysis.message}
        </p>
      )}

      {/* budget ran out — partial answer, said plainly (never a fake full one) */}
      {u?.partial && (u.skipped?.length ?? 0) > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
          {u.skipped!.length} table(s) kept metadata only — the profiling budget (
          {u.budget?.understand_budget_s ?? 75}s) ran out after {u.budget?.elapsed_s ?? '—'}s:{' '}
          {u.skipped!.map((s) => s.fqn.split('.').slice(-1)[0]).join(', ')}. Re-run with fewer
          tables, or confirm their keys yourself below.
        </p>
      )}

      {/* 2 · the proposal — plain words, hypotheses stay hypotheses */}
      {u && (
        <section aria-label="What the analysis proposes" className="space-y-2">
          {u.ai?.status === 'unavailable' && (
            <p
              className="text-xs text-slate-500 dark:text-slate-400"
              title={u.ai.reason || undefined}
            >
              AI reading unavailable — heuristics only.
            </p>
          )}
          {u.ai?.status === 'ok' && u.ai.summary && (
            <p className="text-xs text-slate-600 dark:text-slate-300">{u.ai.summary}</p>
          )}

          {entities.length > 0 && (
            <div>
              <div className="h-[300px] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                <ReactFlow
                  nodes={graphNodes}
                  edges={graphEdges}
                  onNodeClick={(_, n) => setSelectedEntityId(n.id)}
                  fitView
                  proOptions={{ hideAttribution: true }}
                >
                  <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
                  <Controls showInteractive={false} />
                </ReactFlow>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Dashed links are hypotheses — confirmed only when you validate them.
                </p>
                {draft.draftId && (
                  <QuietAction
                    label="Open in the full model view"
                    href={`${routes.studioModel}?draft=${draft.draftId}`}
                  />
                )}
              </div>
            </div>
          )}

          {entities.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              The analysis returned no entity for the picked tables.
            </p>
          ) : (
            <ul className="max-h-36 divide-y divide-slate-100 overflow-y-auto rounded-xl border border-slate-200 bg-white dark:divide-slate-800 dark:border-slate-800 dark:bg-slate-900">
              {entities.map((e) => {
                const grain = grainText(e.grain);
                const key = e.candidate_keys?.[0];
                const keyCols = key?.columns ?? [];
                const roles = rolesSummary(e);
                return (
                  <li
                    key={e.entity_id ?? e.source_fqn}
                    className={`flex flex-wrap items-baseline gap-x-2 px-3 py-1.5 text-xs ${
                      selectedEntityId === String(e.entity_id ?? e.source_fqn)
                        ? 'ring-1 ring-accent-500'
                        : ''
                    }`}
                    title={e.source_fqn}
                  >
                    <span className="font-medium text-slate-800 dark:text-slate-200">{e.name}</span>
                    {grain && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">— {grain}</span>
                    )}
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {e.fields?.length ?? '—'} fields
                    </span>
                    {keyCols.length > 0 && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        keys: {keyCols.join(' + ')}
                        {key?.status && (
                          <span
                            className={`ml-1 rounded-full px-1.5 py-0.5 text-xs font-medium ${
                              key.status === 'hypothesis'
                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300'
                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                            }`}
                          >
                            {key.status.replace(/_/g, ' ')}
                          </span>
                        )}
                      </span>
                    )}
                    {roles.length > 0 && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {roles.join(', ')}
                      </span>
                    )}
                    <span className="ml-auto tabular-nums text-xs text-slate-400 dark:text-slate-500">
                      {fmtRows(entityRows(e))} rows
                    </span>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="max-h-32 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2.5 dark:border-slate-800 dark:bg-slate-900">
            <h4 className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              How they connect
            </h4>
            {relationships.length === 0 ? (
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                No relationship proposed between the picked tables. That can be right — or a
                sign the linking keys live in a table you didn&apos;t pick.
              </p>
            ) : (
              (() => {
                const sorted = [...relationships].sort(
                  (a, b) => (b.confidence ?? 0) - (a.confidence ?? 0),
                );
                const top = sorted.slice(0, 6);
                const rest = sorted.slice(6);
                const Row = ({ r }: { r: StudioRelationship }) => {
                  const ends = relEndpoints(r);
                  return (
                  <li className="flex flex-wrap items-center gap-1.5 text-xs text-slate-700 dark:text-slate-300">
                    <span>
                      each{' '}
                      <span className="font-medium">
                        {ends.from.name ?? ends.from.fqn?.split('.').pop() ?? '—'}
                      </span>{' '}
                      to its{' '}
                      <span className="font-medium">
                        {ends.to.name ?? ends.to.fqn?.split('.').pop() ?? '—'}
                      </span>{' '}
                      · {relationshipKeys(r)}
                    </span>
                    {r.status === 'hypothesis' ? (
                      <span
                        className="rounded-full bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                        title="Inferred from a bounded sample — it stays a hypothesis until you validate it."
                      >
                        hypothesis
                        {typeof r.confidence === 'number'
                          ? ` · ${Math.round(r.confidence * (r.confidence <= 1 ? 100 : 1))}%`
                          : ''}
                      </span>
                    ) : r.status ? (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        {r.status.replace(/_/g, ' ')}
                      </span>
                    ) : null}
                    {r.duplication_risk === 'high' && (
                      <span
                        className="rounded-full bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300"
                        title="Joining through this link can multiply rows — totals may inflate."
                      >
                        duplication risk
                      </span>
                    )}
                  </li>
                  );
                };
                return (
                  <>
                    <ul className="mt-1.5 space-y-1">
                      {top.map((r, i) => (
                        <Row key={i} r={r} />
                      ))}
                    </ul>
                    {rest.length > 0 && (
                      <details className="mt-1.5">
                        <summary className="cursor-pointer list-none text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
                          {rest.length} weaker propositions — open only if a link you expected is missing
                        </summary>
                        <ul className="mt-1 space-y-1">
                          {rest.map((r, i) => (
                            <Row key={i} r={r} />
                          ))}
                        </ul>
                      </details>
                    )}
                  </>
                );
              })()
            )}
          </div>

          {/* 3 · the domain, honestly sourced */}
          {u?.domain && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              Domain: <span className="font-medium text-slate-700 dark:text-slate-200">{u.domain.label ?? u.domain.domain_id}</span>
              {u.domain.inferred && (
                <>
                  <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                    inferred from your need
                    {u.domain.inferred_from?.length ? ` (${u.domain.inferred_from.join(', ')})` : ''}
                  </span>
                  {onBack && <QuietAction label="change the context" onClick={onBack} />}
                </>
              )}
            </p>
          )}

          {/* 4 · coverage — what is honestly in and out */}
          {u?.coverage && <CoveragePanel coverage={u.coverage} />}

          {/* 5 · decisions — the unified contract, persisted server-side */}
          <DecisionsPanel
            draftId={analysisDraftId}
            decisions={decisions}
            onReportStale={() => setReportStale(true)}
          />
          {reportStale && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
              A decision changed what the report can show — it is rebuilt when you open the
              application, never rewritten silently.
            </p>
          )}
        </section>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button
          type="button"
          disabled={!u || opening === 'working'}
          onClick={() => void openApplication()}
          title={!u ? 'Run the analysis first' : undefined}
          className="rounded-lg bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {opening === 'working' ? 'Opening your application…' : 'Looks right — open the application'}
        </button>
        {onBack && <QuietAction label="Fix the sources instead" onClick={onBack} />}
        {openError && (
          <span role="alert" className="text-xs text-red-600 dark:text-red-400">
            {openError}
          </span>
        )}
      </div>
    </div>
  );
}
