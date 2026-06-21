'use client';

/**
 * PublishGate — quality / governance / lineage threshold gate on publishing a
 * data product as a live Snowflake share.
 *
 * Reads the REAL scores for the product's backing table from the Object-360
 * aggregate (`getObject360`) and checks each against a threshold. Publish is
 * only enabled once every checked dimension clears its bar. Missing scores
 * render as "—" and BLOCK publish with a visible reason — we never fabricate a
 * passing score or default to 0.
 *
 * Publish hits the real share flow (`publishDataProduct` →
 * POST /data-products/{id}/publish → CREATE SHARE + GRANT). That route is
 * ACCOUNTADMIN-tier; a 403/409 surfaces inline.
 */
import { useCallback, useEffect, useState } from 'react';
import { useAtomValue } from 'jotai';
import { useCanPerform } from '@/hooks/useCanPerform';
import { lastInvalidationAtom } from '@/components/providers/CacheInvalidationProvider';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import {
  AlertCircle,
  CheckCircle2,
  Loader2,
  Lock,
  ShieldCheck,
  Share2,
  XCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { getApiErrorMessage } from '@/lib/api-client';
import {
  getObject360,
  objectIdFromTable,
  type Object360Response,
} from '@/app/services/catalog';
import {
  publishDataProduct,
  type PublishProductResponse,
} from '@/app/services/data-products';

type AsyncState = 'idle' | 'running' | 'done' | 'error';

/** Threshold bars for the gate. Tune per product policy if needed. */
const THRESHOLDS = {
  quality: 70,
  governance: 70,
  lineage: 1, // at least one upstream/downstream dependency known
};

interface GateCheck {
  key: 'quality' | 'governance' | 'lineage';
  label: string;
  /** Actual measured value, or null when the score is unavailable. */
  value: number | null;
  threshold: number;
  /** null = unknown (blocks); true = pass; false = fail. */
  pass: boolean | null;
  unit?: string;
}

export interface PublishGateProps {
  productId: string;
  tableFqn: string;
  status: string;
  onPublished?: (res: PublishProductResponse) => void;
}

export default function PublishGate({
  productId,
  tableFqn,
  status,
  onPublished,
}: PublishGateProps) {
  // System 2 Action-RBAC: publishing → data_products:publish.
  // Fail-open while the allow-set loads (no flash of disabled).
  const publishPerm = useCanPerform('data_products', 'publish');
  const canPublish = publishPerm.allowed || publishPerm.loading;

  const objectId = deriveObjectId(tableFqn);
  const [scoreState, setScoreState] = useState<AsyncState>('idle');
  const [obj, setObj] = useState<Object360Response | null>(null);
  const [scoreError, setScoreError] = useState<string | null>(null);

  const [publishState, setPublishState] = useState<AsyncState>('idle');
  const [publishError, setPublishError] = useState<string | null>(null);
  const [published, setPublished] = useState(status === 'PUBLISHED');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const loadScores = useCallback(async () => {
    if (!objectId) return;
    setScoreState('running');
    setScoreError(null);
    try {
      const data = await getObject360(objectId, {
        include_profile: true,
        include_dependencies: true,
      });
      setObj(data);
      setScoreState('done');
    } catch (err) {
      setScoreError(getApiErrorMessage(err));
      setScoreState('error');
    }
  }, [objectId]);

  useEffect(() => {
    void loadScores();
  }, [loadScores]);

  // SSE cache invalidation: re-pull the publish-gate scores when the backend
  // recomputes catalog object scores (closes the up-to-30-min staleness window
  // where this panel kept showing the old pass/fail until reopened). Guarded to
  // settled states only — `lastInvalidationAtom` is a persistent global that
  // stays non-null after the first event, so without the idle/running guard a
  // panel mounting later in the session would double-fetch on mount.
  const lastInvalidation = useAtomValue(lastInvalidationAtom);
  useEffect(() => {
    if (!lastInvalidation) return;
    if (scoreState === 'idle' || scoreState === 'running') return;
    const relevant = lastInvalidation.keys.some(
      (k: string) => k === CACHE_KEYS.CATALOG_OBJECTS || k === CACHE_KEYS.CATALOG_SCORES,
    );
    if (relevant) void loadScores();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lastInvalidation]);

  const checks = buildChecks(obj);
  // Gate is open only when every check has a known, passing value.
  const allPass = checks.every((c) => c.pass === true);
  const anyUnknown = checks.some((c) => c.pass === null);

  const doPublish = useCallback(async () => {
    setPublishState('running');
    setPublishError(null);
    try {
      const res = await publishDataProduct(productId);
      setPublished(true);
      setPublishState('done');
      onPublished?.(res);
    } catch (err) {
      setPublishError(getApiErrorMessage(err));
      setPublishState('error');
    }
  }, [productId, onPublished]);

  return (
    <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
          <ShieldCheck className="h-3.5 w-3.5" />
          Publish gate
        </h4>
        {published && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            <CheckCircle2 className="h-3 w-3" />
            Published
          </span>
        )}
      </div>

      {!objectId ? (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          Backing table is not a fully-qualified DB.SCHEMA.TABLE — cannot
          evaluate publish thresholds.
        </p>
      ) : scoreState === 'running' || scoreState === 'idle' ? (
        <div className="space-y-1.5" aria-hidden="true">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-6 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
          ))}
        </div>
      ) : scoreState === 'error' ? (
        <div className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <div className="flex-1">
            <span className="break-words">{scoreError}</span>{' '}
            <button type="button" className="underline" onClick={() => void loadScores()}>
              Retry
            </button>
          </div>
        </div>
      ) : (
        <ul className="space-y-1.5">
          {checks.map((c) => (
            <li
              key={c.key}
              className="flex items-center justify-between text-[11px]"
            >
              <span className="text-slate-600 dark:text-slate-400">{c.label}</span>
              <span className="flex items-center gap-1.5">
                <span
                  className={cn(
                    'font-mono font-semibold',
                    c.pass === true
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : c.pass === false
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-slate-400',
                  )}
                >
                  {c.value === null ? '—' : `${c.value}${c.unit ?? ''}`}
                </span>
                <span className="text-slate-400">/ {c.threshold}{c.unit ?? ''}</span>
                {c.pass === true ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                ) : c.pass === false ? (
                  <XCircle className="h-3.5 w-3.5 text-red-500" />
                ) : (
                  <Lock className="h-3.5 w-3.5 text-slate-400" />
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {publishError && (
        <div
          role="alert"
          className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
        >
          <AlertCircle className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="break-words">{publishError}</span>
        </div>
      )}

      {!published && (
        <>
          <button
            type="button"
            disabled={
              publishState === 'running' ||
              scoreState !== 'done' ||
              !allPass ||
              !canPublish
            }
            title={!canPublish ? 'You lack the "publish" permission on data products. Ask an administrator to grant it.' : undefined}
            onClick={() => setConfirmOpen(true)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {publishState === 'running' ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Share2 className="h-3.5 w-3.5" />
            )}
            Publish as Snowflake share
          </button>
          {scoreState === 'done' && !allPass && (
            <p className="text-[10px] text-amber-600 dark:text-amber-400">
              {anyUnknown
                ? 'Publish is blocked: one or more scores are unavailable. Recompute scores in the catalog first.'
                : 'Publish is blocked until quality, governance and lineage clear their thresholds.'}
            </p>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Publish this product?"
        message="It creates a data share and grants subscribers access."
        confirmLabel="Publish"
        destructive={false}
        onConfirm={() => {
          setConfirmOpen(false);
          void doPublish();
        }}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}

function deriveObjectId(tableFqn: string): string | null {
  const parts = (tableFqn || '').split('.');
  if (parts.length !== 3 || parts.some((p) => !p.trim())) return null;
  const [db, schema, name] = parts;
  return objectIdFromTable(db.trim(), schema.trim(), name.trim());
}

/** Pull real scores from the Object-360 response — null when unknown. */
function buildChecks(obj: Object360Response | null): GateCheck[] {
  const persisted = obj?.persisted_scores?.scores;
  const qualityRaw = roundOrNull(persisted?.quality_score);
  const govObject = roundOrNull(obj?.scores?.governance_object);
  const govScore =
    govObject ?? roundOrNull(persisted?.governance_score);
  const deps = obj?.tiers?.dependencies;
  const lineageKnown =
    deps == null
      ? null
      : (deps.upstream_count ?? 0) + (deps.downstream_count ?? 0);

  const mk = (
    key: GateCheck['key'],
    label: string,
    value: number | null,
    threshold: number,
    unit?: string,
  ): GateCheck => ({
    key,
    label,
    value,
    threshold,
    unit,
    pass: value === null ? null : value >= threshold,
  });

  return [
    mk('quality', 'Quality score', qualityRaw, THRESHOLDS.quality, ''),
    mk('governance', 'Governance score', govScore, THRESHOLDS.governance, ''),
    mk('lineage', 'Lineage links', lineageKnown, THRESHOLDS.lineage, ''),
  ];
}

function roundOrNull(v: number | null | undefined): number | null {
  return v === null || v === undefined ? null : Math.round(v);
}
