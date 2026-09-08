'use client';

/**
 * StudioModelView — /studio/model: the application's model, full screen.
 *
 * One draft, everything it is made of: the entity graph (React Flow, fed by
 * the backend's precomputed graph{nodes,edges} + relationships), each
 * table's grain, ingestion freshness and lineage risk, the report shape,
 * and the SAME "change it with a sentence" chat as the preview (patch/edit
 * contract — previewed diff, applied only on approval). The first read can
 * be slow backend-side (lineage on a cold cache) — the loading state says
 * so instead of spinning silently.
 */

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, RefreshCw } from 'lucide-react';
import StudioModelCanvas, { StudioRelationsList } from '@/app/shared/studio/StudioModelCanvas';
import { PlainQuestionHeader, QuietAction } from '@/app/shared/studio/PlainKit';
import EmptyState from '@/components/ui/EmptyState';
import {
  getModel,
  getModelTableOps,
  grainText,
  listDrafts,
  type StudioDraftSummary,
  type StudioModelView as ModelPayload,
} from '@/app/services/studio/studio-api';
import RefineChat from '@/app/shared/studio/onboarding/RefineChat';
import { routes } from '@/config/routes';
import { useTrackEvent } from '@/hooks/useTrackEvent';

function fmtCount(n?: number | null): string {
  return n == null ? '—' : n.toLocaleString();
}

type Phase =
  | { kind: 'boot' }
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; model: ModelPayload };

export default function StudioModelView() {
  const params = useSearchParams();
  useTrackEvent();

  const [drafts, setDrafts] = useState<StudioDraftSummary[]>([]);
  const [draftId, setDraftId] = useState<string | null>(params.get('draft'));
  const [phase, setPhase] = useState<Phase>({ kind: 'boot' });
  const [selectedEntity, setSelectedEntity] = useState<string | null>(null);

  useEffect(() => {
    void listDrafts()
      .then((all) => {
        setDrafts(all);
        setDraftId((prev) => prev ?? all[0]?.draft_id ?? null);
      })
      .catch(() => setDrafts([]));
  }, []);

  const load = useCallback(async (id: string) => {
    setPhase({ kind: 'loading' });
    try {
      // Lazy contract: the graph answers in ~2 s; per-table ingestion +
      // lineage load on click (getModelTableOps, role cache 15 min).
      const model = await getModel(id, false);
      setPhase(
        (model.tables?.length ?? 0) > 0 ? { kind: 'ready', model } : { kind: 'none' },
      );
    } catch (e) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      if (status === 404) setPhase({ kind: 'none' });
      else
        setPhase({
          kind: 'error',
          message: e instanceof Error ? e.message : 'The model could not be read.',
        });
    }
  }, []);

  useEffect(() => {
    if (draftId) void load(draftId);
  }, [draftId, load]);

  const model = phase.kind === 'ready' ? phase.model : null;

  const entity = model?.tables?.find((t) => t.entity_id === selectedEntity) ?? null;

  /* lazy ops: fetched on first click of each table, folded into the model */
  const [opsLoading, setOpsLoading] = useState(false);
  useEffect(() => {
    if (!entity || !draftId) return;
    const hasOps =
      entity.ingestion?.ingestion_type != null || (entity.lineage?.source ?? null) != null;
    if (hasOps) return;
    let alive = true;
    setOpsLoading(true);
    void getModelTableOps(draftId, entity.fqn)
      .then((ops) => {
        if (!alive || !ops) return;
        setPhase((prev) => {
          if (prev.kind !== 'ready') return prev;
          return {
            kind: 'ready',
            model: {
              ...prev.model,
              tables: prev.model.tables?.map((t) =>
                t.entity_id === entity.entity_id
                  ? { ...t, ingestion: ops.ingestion ?? t.ingestion, lineage: ops.lineage ?? t.lineage }
                  : t,
              ),
            },
          };
        });
      })
      .finally(() => alive && setOpsLoading(false));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEntity, draftId]);

  return (
    <div className="flex h-[calc(100dvh-120px)] min-h-0 flex-col gap-3 p-4 md:p-5">
      <PlainQuestionHeader
        question={model?.title ? String(model.title) : 'Your application model'}
        detail="Every table, link and figure of this application — and one sentence to change any of it."
        backHref={routes.studio}
        backLabel="Studio"
        actions={
          <>
            {drafts.length > 1 && (
              <select
                aria-label="Application"
                value={draftId ?? ''}
                onChange={(e) => setDraftId(e.target.value)}
                className="h-8 max-w-[220px] rounded-lg border border-slate-200 bg-white px-2 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              >
                {drafts.map((d) => (
                  <option key={d.draft_id} value={d.draft_id}>
                    {d.title || d.draft_id}
                  </option>
                ))}
              </select>
            )}
            {draftId && (
              <QuietAction label="Reload" icon={RefreshCw} onClick={() => void load(draftId)} />
            )}
          </>
        }
      />

      {phase.kind === 'boot' || phase.kind === 'loading' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-accent-600" aria-hidden />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Reading the model…
          </p>
        </div>
      ) : phase.kind === 'error' ? (
        <EmptyState
          icon={AlertCircle}
          title="The model could not be read"
          description={phase.message}
          action={
            draftId ? (
              <QuietAction label="Retry" icon={RefreshCw} onClick={() => void load(draftId)} />
            ) : undefined
          }
        />
      ) : phase.kind === 'none' ? (
        <EmptyState
          title="No model yet"
          description="Run the journey's understanding step first — the model is built from what you confirm."
          action={<QuietAction label="Open the Studio" href={routes.studio} />}
        />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 xl:grid-cols-[1fr,360px]">
          {/* the graph — pro table nodes + cardinality edges */}
          <div className="min-h-[320px] space-y-3">
            {model && (
              <>
                <StudioModelCanvas
                  model={model}
                  height={460}
                  onSelectTable={setSelectedEntity}
                  selectedEntity={selectedEntity}
                />
                <StudioRelationsList model={model} />
              </>
            )}
          </div>

          {/* rail: table detail + report shape + the edit chat */}
          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-0.5">
            {entity ? (
              <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                  {entity.name}
                </p>
                {entity.description && (
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">
                    {entity.description}
                    {entity.description_source === 'ai' && (
                      <span className="ml-1 text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
                        ai
                      </span>
                    )}
                  </p>
                )}
                <dl className="mt-1.5 space-y-0.5 text-xs text-slate-600 dark:text-slate-300">
                  <div className="flex gap-1.5">
                    <dt className="text-slate-400 dark:text-slate-500">One row is</dt>
                    <dd>{grainText(entity.grain) ?? '—'}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-slate-400 dark:text-slate-500">Rows</dt>
                    <dd className="tabular-nums">{fmtCount(entity.row_count_approx)}</dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-slate-400 dark:text-slate-500">Columns</dt>
                    <dd className="tabular-nums">
                      {typeof entity.fields === 'number'
                        ? entity.fields
                        : entity.fields?.length ?? '—'}
                    </dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-slate-400 dark:text-slate-500">Ingestion</dt>
                    <dd>
                      {opsLoading
                        ? 'reading…'
                        : `${entity.ingestion?.ingestion_type ?? '—'}${
                            entity.ingestion?.days_since_last_load != null
                              ? ` · last load ${entity.ingestion.days_since_last_load} day(s) ago`
                              : ''
                          }`}
                    </dd>
                  </div>
                  <div className="flex gap-1.5">
                    <dt className="text-slate-400 dark:text-slate-500">Lineage</dt>
                    <dd>
                      {opsLoading
                        ? 'reading…'
                        : entity.lineage?.source
                          ? `${entity.lineage.upstream_count ?? entity.lineage.upstream?.length ?? 0} upstream · ${entity.lineage.downstream_count ?? entity.lineage.downstream?.length ?? 0} downstream · risk ${(entity.lineage.risk_level ?? '—').toLowerCase()}`
                          : '—'}
                    </dd>
                  </div>
                </dl>
              </section>
            ) : (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                Click a table in the graph to see its grain, freshness and lineage.
              </p>
            )}

            {/* the report this model feeds */}
            <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">Report</p>
              {model?.report ? (
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                  “{model.report.title}” — {model.report.kpis?.length ?? 0} key figure(s),{' '}
                  {model.report.charts?.length ?? 0} chart(s)
                  {model.report.detail ? ', one detail table' : ''}.
                </p>
              ) : (
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  No report generated yet — it is built in the journey's preview step.
                </p>
              )}
              {(model?.definitions ?? []).filter((d) => d.status === 'to_confirm').length > 0 && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  {model!.definitions!.filter((d) => d.status === 'to_confirm').length} definition(s)
                  still to confirm.
                </p>
              )}
            </section>

            {draftId && (
              <RefineChat
                draftId={draftId}
                onApplied={() => {
                  // a new draft version exists — re-read rather than guess
                  void load(draftId);
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
