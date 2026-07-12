'use client';

/**
 * IntelligentCockpit — the docked right cockpit + KPI strip for the
 * Intelligent Analytics module (first consumer of the shared AxisCockpit /
 * KpiStrip primitives, 2026-07-02 redesign).
 *
 * AI as a SCORE + a FUNCTIONAL (robotize / optimize) view:
 *   ai_score        — honest client-side composite ("Intelligence Score") with
 *                     the formula shown transparently; unavailable inputs are
 *                     EXCLUDED and named, never faked.
 *   recommendations — top-5 active recommendation lifecycle (ack / resolve /
 *                     snooze / dismiss) via /api/recommendations/*.
 *   models          — semantic + trained model counts (wired GETs only).
 *   functional      — "Robotize & optimize": query-analysis findings, redundant
 *                     groups (savings candidates), top-insights deep links.
 *   history         — stored AI conversations (GET /cortex/conversations).
 *   governance      — the caller's real allow/deny state for every AI action
 *                     gated in this module (useCanPerform, shown honestly).
 *
 * State is shared between the strip (under the page header) and the cockpit
 * (right edge) through module-level Jotai atoms — the cockpit owns ALL data
 * fetching (each dataset fetched once, reused by strip + axes; axis-only
 * details like redundant groups stay lazy).
 *
 * Zero popups. Honest "—" for anything not loaded. No vendor names in copy.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { toast } from 'react-hot-toast';
import {
  Gauge,
  Lightbulb,
  Boxes,
  Bot,
  History,
  ShieldCheck,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
} from 'lucide-react';

import AxisCockpit, { type AxisDef, type AxisSeverity } from '@/app/shared/cockpit/AxisCockpit';
import KpiStrip, { type KpiItem, type KpiDotTone } from '@/app/shared/cockpit/KpiStrip';
import apiClient from '@/lib/api-client';
import { API } from '@/lib/api-contracts';
import { useCacheAwareQuery } from '@/hooks/useCacheAwareQuery';
import { CACHE_KEYS } from '@/hooks/useCacheInvalidation';
import { useCanPerform } from '@/hooks/useCanPerform';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { toMessage } from '@/lib/error-messages';
import {
  listRecommendations,
  acknowledgeRecommendation,
  resolveRecommendation,
  dismissRecommendation,
  snoozeRecommendation,
  type Recommendation,
  type RecoStatus,
} from '@/app/services/recommendations';
import {
  listCortexConversations,
  getCortexConversation,
  getQueryAnalyticsSummary,
  getRedundantGroups,
  type CortexConversation,
  type CortexConversationDetail,
  type AnalyticsSummary,
  type RedundantGroup,
  type CortexKpis,
} from '@/app/services/cortex';

// ── Shared page-scoped state (strip <-> cockpit) ──────────────────────────

export interface IntelligentSignals {
  /** 0–100 composite, null until at least one input is available. */
  score: number | null;
  /** Critical ACTIVE recommendations (drives 'warn' severity). */
  critical: number;
  activeRecos: number | null;
  models: number | null;
  /** Query-analysis findings (optimization + slow + error + redundant). */
  insights: number | null;
  conversations: number | null;
}

const cockpitOpenAtom = atom<boolean>(true); // auto-open with a purposeful overview
const cockpitAxisAtom = atom<string | null>('ai_score');
const intelligentSignalsAtom = atom<IntelligentSignals | null>(null);

// Same scope keys as the AI Advisor tab so counts always line up.
const RECO_PAGE = 'intelligent';
const RECO_MODULE = 'intelligence';

const ACTIVE_STATUSES: RecoStatus[] = ['open', 'acknowledged', 'snoozed'];
const ALL_STATUSES: RecoStatus[] = ['open', 'acknowledged', 'snoozed', 'resolved', 'dismissed'];

const SEVERITY_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };

// ── Small helpers ─────────────────────────────────────────────────────────

function errMsg(e: unknown): string {
  return toMessage(e, 'Something went wrong');
}

function relTime(iso?: string | null): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '—';
  const diff = Date.now() - t;
  if (diff < 60_000) return 'just now';
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtMs(ms?: number | null): string {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = s / 60;
  if (m < 60) return `${Math.round(m)}m`;
  return `${(m / 60).toFixed(1)}h`;
}

function ageDays(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.max(0, (Date.now() - t) / 86_400_000);
}

/** Defensive array extraction for the ML registry list endpoints. */
function toArr(v: unknown, ...keys: string[]): Record<string, unknown>[] {
  const obj = v as Record<string, unknown> | null | undefined;
  for (const k of keys) {
    const inner = obj?.[k];
    if (Array.isArray(inner)) return inner as Record<string, unknown>[];
  }
  return Array.isArray(v) ? (v as Record<string, unknown>[]) : [];
}

function pickName(m: Record<string, unknown>): string {
  const v =
    m.name ?? m.NAME ?? m.model_name ?? m.MODEL_NAME ?? m.instance_name ?? m.INSTANCE_NAME ??
    m.job_id ?? m.JOB_ID ?? m.id ?? m.ID ?? null;
  return v == null || v === '' ? '—' : String(v);
}

// ── Shared micro-UI (loading / unavailable / error rows) ──────────────────

function BodySkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-10 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
      ))}
    </div>
  );
}

function QuietUnavailable({ label }: { label: string }) {
  return (
    <p role="status" className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
      {label} isn&apos;t provisioned on this account yet — it will appear here automatically once enabled.
    </p>
  );
}

function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 dark:border-amber-800 dark:bg-amber-900/20">
      <p className="flex-1 text-xs text-amber-700 dark:text-amber-300">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 text-xs font-semibold text-amber-700 underline hover:text-amber-900 dark:text-amber-300"
        >
          Retry
        </button>
      )}
    </div>
  );
}

function StatRow({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0 dark:border-slate-800">
      <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right">
        <span className="text-sm font-semibold text-slate-900 dark:text-white">{value}</span>
        {sub && <span className="ml-1.5 text-[11px] text-slate-400 dark:text-slate-500">{sub}</span>}
      </span>
    </div>
  );
}

function TabLink({ tab, children }: { tab: string; children: React.ReactNode }) {
  return (
    <Link
      href={`/intelligent?tab=${tab}`}
      className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
    >
      {children}
      <ArrowUpRight className="h-3 w-3" aria-hidden />
    </Link>
  );
}

// ── Intelligence Score (honest composite) ─────────────────────────────────

interface ScorePart {
  key: 'recos' | 'automation' | 'insights';
  label: string;
  weight: number; // 40 / 30 / 30
  /** 0..1 contribution, or null when this input has no data (excluded). */
  value01: number | null;
  /** Honest plain-text description of the input behind the number. */
  detail: string;
}

function computeScore(parts: ScorePart[]): number | null {
  const avail = parts.filter((p) => p.value01 != null);
  if (avail.length === 0) return null;
  const wSum = avail.reduce((s, p) => s + p.weight, 0);
  const acc = avail.reduce((s, p) => s + p.weight * (p.value01 as number), 0);
  return Math.round((100 * acc) / wSum);
}

function ScoreAxisBody({
  score,
  parts,
  inputsSummary,
  critical,
}: {
  score: number | null;
  parts: ScorePart[];
  inputsSummary: string;
  critical: number;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 text-center dark:border-slate-700 dark:bg-slate-800/40">
        <div className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">
          {score == null ? '—' : score}
          {score != null && <span className="text-base font-medium text-slate-400"> / 100</span>}
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Intelligence Score</p>
        {critical > 0 && (
          <p className="mt-2 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            {critical} critical recommendation{critical === 1 ? '' : 's'} open
          </p>
        )}
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">{inputsSummary}</p>

      <div className="space-y-3">
        {parts.map((p) => (
          <div key={p.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                {p.label} <span className="font-normal text-slate-400">· weight {p.weight}%</span>
              </span>
              <span className="text-xs font-semibold text-slate-900 dark:text-white">
                {p.value01 == null ? 'excluded' : `${Math.round(p.value01 * 100)}%`}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              {p.value01 != null && (
                <div
                  className="h-full rounded-full bg-indigo-500"
                  style={{ width: `${Math.round(p.value01 * 100)}%` }}
                />
              )}
            </div>
            <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{p.detail}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 text-[11px] leading-relaxed text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
        <p className="mb-1 font-semibold text-slate-600 dark:text-slate-300">How this score is computed</p>
        Score = weighted average of <span className="font-medium">recommendation health (40%)</span>,{' '}
        <span className="font-medium">automation (30%)</span> and{' '}
        <span className="font-medium">insight freshness (30%)</span>, computed client-side from the
        data listed above. Inputs without data are excluded and the weights renormalized — nothing
        is estimated or faked.
      </div>
    </div>
  );
}

// ── Recommendations axis (lifecycle on top 5) ─────────────────────────────

const RECO_SEV_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  medium: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  low: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  info: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

function RecosAxisBody({
  items,
  loading,
  unavailable,
  error,
  onRefetch,
}: {
  items: Recommendation[];
  loading: boolean;
  unavailable: boolean;
  error: string | null;
  onRefetch: () => void;
}) {
  // Lifecycle changes are AI mutations — same gate as the rest of the module.
  const generatePerm = useCanPerform('cortex', 'generate');
  const denied = !generatePerm.allowed && !generatePerm.loading;
  const [busyId, setBusyId] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);
  const [dismissReason, setDismissReason] = useState('');

  const top5 = useMemo(
    () =>
      [...items]
        .sort((a, b) => {
          const ra = SEVERITY_RANK[(a.severity || '').toLowerCase()] ?? 9;
          const rb = SEVERITY_RANK[(b.severity || '').toLowerCase()] ?? 9;
          if (ra !== rb) return ra - rb;
          return (b.estimated_savings_usd ?? 0) - (a.estimated_savings_usd ?? 0);
        })
        .slice(0, 5),
    [items],
  );

  const run = useCallback(
    async (reco: Recommendation, action: 'ack' | 'resolve' | 'snooze' | 'dismiss') => {
      setBusyId(reco.reco_id);
      try {
        if (action === 'ack') {
          await acknowledgeRecommendation(reco.reco_id);
          toast.success('Acknowledged');
        } else if (action === 'resolve') {
          await resolveRecommendation(reco.reco_id);
          toast.success('Marked as resolved');
        } else if (action === 'snooze') {
          const until = new Date(Date.now() + 7 * 86_400_000).toISOString();
          await snoozeRecommendation(reco.reco_id, until);
          toast.success('Snoozed for 7 days');
        } else {
          const reason = dismissReason.trim();
          if (!reason) {
            toast.error('A reason is required to dismiss');
            setBusyId(null);
            return;
          }
          await dismissRecommendation(reco.reco_id, reason);
          toast.success('Dismissed');
          setDismissingId(null);
          setDismissReason('');
        }
        onRefetch();
      } catch (e) {
        toast.error(errMsg(e));
      } finally {
        setBusyId(null);
      }
    },
    [dismissReason, onRefetch],
  );

  if (loading) return <BodySkeleton />;
  if (unavailable) return <QuietUnavailable label="The recommendation engine" />;
  if (error) return <InlineError message={error} onRetry={onRefetch} />;

  const btn =
    'rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800';

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Top {top5.length} active recommendation{top5.length === 1 ? '' : 's'} for this module —
        acknowledge, resolve, snooze or dismiss each one.
      </p>
      {denied && (
        <p className="text-[11px] text-amber-600 dark:text-amber-400">
          You don&apos;t have permission for AI actions — the list stays read-only.
        </p>
      )}
      {top5.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
          No active recommendations — nothing needs attention right now.
        </p>
      ) : (
        <ul className="space-y-2">
          {top5.map((r) => {
            const sev = (r.severity || 'info').toLowerCase();
            const busy = busyId === r.reco_id;
            return (
              <li
                key={r.reco_id}
                className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="flex items-start gap-2">
                  <span
                    className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase ${RECO_SEV_BADGE[sev] ?? RECO_SEV_BADGE.info}`}
                  >
                    {sev}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold leading-snug text-slate-900 dark:text-white">
                      {r.title}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-400 dark:text-slate-500">
                      {r.status}
                      {r.estimated_savings_usd != null &&
                        ` · ~$${Math.round(r.estimated_savings_usd).toLocaleString()}/mo`}
                      {r.last_seen_at ? ` · seen ${relTime(r.last_seen_at)}` : ''}
                    </p>
                    {r.proposed_action && (
                      <p className="mt-1 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">
                        {r.proposed_action}
                      </p>
                    )}
                  </div>
                </div>

                {dismissingId === r.reco_id ? (
                  <div className="mt-2 space-y-1.5">
                    <input
                      value={dismissReason}
                      onChange={(e) => setDismissReason(e.target.value)}
                      placeholder="Reason for dismissing (required)"
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-900 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                    />
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        disabled={busy || denied}
                        onClick={() => run(r, 'dismiss')}
                        className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        Confirm dismiss
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setDismissingId(null);
                          setDismissReason('');
                        }}
                        className={btn}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(r.status || '').toLowerCase() === 'open' && (
                      <button
                        type="button"
                        className={btn}
                        disabled={busy || denied}
                        title={denied ? 'No permission for AI actions' : 'Mark as seen'}
                        onClick={() => run(r, 'ack')}
                      >
                        Acknowledge
                      </button>
                    )}
                    <button
                      type="button"
                      className={btn}
                      disabled={busy || denied}
                      title={denied ? 'No permission for AI actions' : 'Mark as resolved once applied'}
                      onClick={() => run(r, 'resolve')}
                    >
                      Resolve
                    </button>
                    <button
                      type="button"
                      className={btn}
                      disabled={busy || denied}
                      title={denied ? 'No permission for AI actions' : 'Hide for 7 days'}
                      onClick={() => run(r, 'snooze')}
                    >
                      Snooze 7d
                    </button>
                    <button
                      type="button"
                      className={btn}
                      disabled={busy || denied}
                      title={denied ? 'No permission for AI actions' : 'Dismiss with a reason'}
                      onClick={() => setDismissingId(r.reco_id)}
                    >
                      Dismiss
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {/* Full list lives behind the axis primary CTA (AI Advisor) — no
          duplicate link here. */}
    </div>
  );
}

// ── Models axis ───────────────────────────────────────────────────────────

interface RegistrySignals {
  finetune: number | null;
  classification: number | null;
  documentAi: number | null;
  topInsights: number | null;
  recent: { name: string; kind: string }[];
}

async function fetchModelRegistry(): Promise<RegistrySignals> {
  const [ft, cls, doc, ti] = await Promise.allSettled([
    apiClient.get(API.cortex.mlFinetuneJobs()),
    apiClient.get(API.cortex.classificationModels()),
    apiClient.get(API.cortex.documentAiModels()),
    apiClient.get(API.cortex.topInsights()),
  ]);
  const ftArr = ft.status === 'fulfilled' ? toArr(ft.value.data, 'jobs', 'data') : null;
  const clsArr = cls.status === 'fulfilled' ? toArr(cls.value.data, 'models', 'data') : null;
  const docArr = doc.status === 'fulfilled' ? toArr(doc.value.data, 'models', 'data') : null;
  const tiArr = ti.status === 'fulfilled' ? toArr(ti.value.data, 'instances', 'data') : null;
  const recent: { name: string; kind: string }[] = [
    ...(clsArr ?? []).map((m) => ({ name: pickName(m), kind: 'classification' })),
    ...(ftArr ?? []).map((m) => ({ name: pickName(m), kind: 'fine-tune' })),
    ...(docArr ?? []).map((m) => ({ name: pickName(m), kind: 'document AI' })),
    ...(tiArr ?? []).map((m) => ({ name: pickName(m), kind: 'top insights' })),
  ].slice(0, 6);
  return {
    finetune: ftArr ? ftArr.length : null,
    classification: clsArr ? clsArr.length : null,
    documentAi: docArr ? docArr.length : null,
    topInsights: tiArr ? tiArr.length : null,
    recent,
  };
}

function ModelsAxisBody({
  registry,
  loading,
  unavailable,
  error,
  onRefetch,
  semanticModels,
}: {
  registry: RegistrySignals | null;
  loading: boolean;
  unavailable: boolean;
  error: string | null;
  onRefetch: () => void;
  semanticModels: number | null;
}) {
  if (loading) return <BodySkeleton />;
  if (unavailable) return <QuietUnavailable label="The model registry" />;
  if (error) return <InlineError message={error} onRetry={onRefetch} />;

  return (
    <div className="space-y-4">
      <div>
        <StatRow label="Semantic models" value={semanticModels ?? '—'} sub="natural-language analytics" />
        <StatRow label="Fine-tune jobs" value={registry?.finetune ?? '—'} />
        <StatRow label="Classification models" value={registry?.classification ?? '—'} />
        <StatRow label="Document AI models" value={registry?.documentAi ?? '—'} />
        <StatRow label="Top-insights instances" value={registry?.topInsights ?? '—'} />
      </div>

      {registry && registry.recent.length > 0 && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
            Registered
          </p>
          <ul className="space-y-1">
            {registry.recent.map((m, i) => (
              <li
                key={`${m.kind}-${m.name}-${i}`}
                className="flex items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5 dark:bg-slate-800/50"
              >
                <span className="truncate font-mono text-[11px] text-slate-700 dark:text-slate-200">
                  {m.name}
                </span>
                <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">{m.kind}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Advanced ML is the axis primary CTA — only the complementary link here. */}
      <div className="flex flex-col gap-1.5">
        <TabLink tab="semantic-models">Semantic Models</TabLink>
      </div>
    </div>
  );
}

// ── Functional (Robotize & optimize) axis ─────────────────────────────────

function FunctionalAxisBody({
  summary,
  loading,
  unavailable,
  error,
  onRefetch,
  topInsightsCount,
  groups,
  groupsLoading,
  groupsError,
}: {
  summary: AnalyticsSummary | null;
  loading: boolean;
  unavailable: boolean;
  error: string | null;
  onRefetch: () => void;
  topInsightsCount: number | null;
  groups: RedundantGroup[] | null;
  groupsLoading: boolean;
  groupsError: string | null;
}) {
  if (loading) return <BodySkeleton />;
  if (unavailable) return <QuietUnavailable label="Query analysis" />;
  if (error) return <InlineError message={error} onRetry={onRefetch} />;

  const findings =
    summary == null
      ? null
      : (summary.OPTIMIZATION_COUNT ?? 0) +
        (summary.SLOW_QUERY_COUNT ?? 0) +
        (summary.ERROR_COUNT ?? 0) +
        (summary.REDUNDANT_COUNT ?? 0);

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Robotize &amp; optimize — where repeated manual work can be automated and query spend
        recovered.
      </p>

      <div>
        <StatRow label="Analyzed queries" value={summary?.TOTAL_ANALYZED ?? '—'} />
        <StatRow
          label="Findings"
          value={findings ?? '—'}
          sub="optimization · slow · error · redundant"
        />
        <StatRow
          label="Redundant groups"
          value={summary?.REDUNDANT_COUNT ?? '—'}
          sub="savings candidates"
        />
        <StatRow
          label="Potential time saved"
          value={summary?.potential_time_saved_ms != null ? fmtMs(summary.potential_time_saved_ms) : '—'}
        />
        <StatRow
          label="Last analysis"
          value={summary?.LAST_ANALYSIS_AT ? relTime(summary.LAST_ANALYSIS_AT) : 'never run'}
        />
        <StatRow label="Top-insights instances" value={topInsightsCount ?? '—'} />
      </div>

      <div>
        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Top savings candidates
        </p>
        {groupsLoading ? (
          <BodySkeleton />
        ) : groupsError ? (
          <InlineError message={groupsError} />
        ) : groups == null || groups.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-[11px] text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
            No redundant query groups detected{summary?.LAST_ANALYSIS_AT ? '' : ' — run an analysis from the Query Analytics tab first'}.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {groups.slice(0, 5).map((g) => (
              <li
                key={g.REDUNDANT_GROUP_ID}
                className="rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[11px] font-semibold text-slate-800 dark:text-slate-100">
                    {g.QUERY_TYPE || 'Query group'}
                  </span>
                  <span className="shrink-0 text-[11px] text-slate-500 dark:text-slate-400">
                    {g.EXECUTION_COUNT}× · {fmtMs(g.AVG_TIME_MS)} avg
                  </span>
                </div>
                {g.RECOMMENDATION && (
                  <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500 dark:text-slate-400">
                    {g.RECOMMENDATION}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Query Analytics is the axis primary CTA — only the complementary link here. */}
      <div className="flex flex-col gap-1.5">
        <TabLink tab="advanced-ml">Top Insights (contribution analysis)</TabLink>
      </div>
    </div>
  );
}

// ── History axis (stored AI conversations) ────────────────────────────────

function HistoryAxisBody({
  conversations,
  loading,
  unavailable,
  error,
  onRefetch,
}: {
  conversations: CortexConversation[];
  loading: boolean;
  unavailable: boolean;
  error: string | null;
  onRefetch: () => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [details, setDetails] = useState<Record<string, CortexConversationDetail | 'loading' | 'error'>>({});

  const toggle = useCallback(
    async (id: string) => {
      if (expandedId === id) {
        setExpandedId(null);
        return;
      }
      setExpandedId(id);
      if (!details[id]) {
        setDetails((d) => ({ ...d, [id]: 'loading' }));
        try {
          const detail = await getCortexConversation(id);
          setDetails((d) => ({ ...d, [id]: detail }));
        } catch {
          setDetails((d) => ({ ...d, [id]: 'error' }));
        }
      }
    },
    [expandedId, details],
  );

  if (loading) return <BodySkeleton />;
  if (unavailable) return <QuietUnavailable label="Conversation history" />;
  if (error) return <InlineError message={error} onRetry={onRefetch} />;

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Your stored AI exchanges, newest first. Expand one to read the answer.
      </p>
      {conversations.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-6 text-center text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/40 dark:text-slate-400">
          No stored conversations yet — questions asked in the AI Chat and AI Console are kept here.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {conversations.slice(0, 10).map((c) => {
            const isOpen = expandedId === c.id;
            const detail = details[c.id];
            return (
              <li
                key={c.id}
                className="rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
              >
                <button
                  type="button"
                  onClick={() => toggle(c.id)}
                  aria-expanded={isOpen}
                  className="flex w-full items-start gap-2 px-2.5 py-2 text-left"
                >
                  {isOpen ? (
                    <ChevronDown className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                  ) : (
                    <ChevronRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="line-clamp-2 text-xs text-slate-800 dark:text-slate-100">
                      {c.preview || c.prompt || '—'}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-slate-400 dark:text-slate-500">
                      {relTime(c.created_at)}
                      {c.semantic_model ? ` · ${c.semantic_model}` : ''}
                    </span>
                  </span>
                </button>
                {isOpen && (
                  <div className="border-t border-slate-100 px-2.5 py-2 dark:border-slate-800">
                    {detail === 'loading' || detail === undefined ? (
                      <p className="text-[11px] text-slate-400">Loading…</p>
                    ) : detail === 'error' ? (
                      <p className="text-[11px] text-amber-600 dark:text-amber-400">
                        Couldn&apos;t load this exchange.
                      </p>
                    ) : (
                      <div className="space-y-1.5">
                        {detail.response ? (
                          <p className="whitespace-pre-wrap text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                            {detail.response}
                          </p>
                        ) : (
                          <p className="text-[11px] text-slate-400">— No stored answer.</p>
                        )}
                        {detail.sql && (
                          <pre className="overflow-x-auto rounded-md bg-slate-900 px-2 py-1.5 text-[10px] leading-relaxed text-green-300">
                            {detail.sql}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {/* AI Chat is the axis primary CTA — only the complementary link here. */}
      <div className="flex flex-col gap-1.5">
        <TabLink tab="ai-console">Ask in the AI Console</TabLink>
      </div>
    </div>
  );
}

// ── Governance axis (honest allow/deny per AI action) ─────────────────────

const AI_ACTIONS: { action: string; label: string }[] = [
  { action: 'generate', label: 'Generate — AI runs, embeddings, analysis' },
  { action: 'create', label: 'Create — models, views, services' },
  { action: 'edit', label: 'Edit — semantic models' },
  { action: 'delete', label: 'Delete — models, services' },
  { action: 'configure', label: 'Configure — container services' },
  { action: 'send', label: 'Send — AI chat messages' },
  { action: 'clear', label: 'Clear — chat history' },
];

function GovActionRow({ action, label }: { action: string; label: string }) {
  const perm = useCanPerform('cortex', action);
  return (
    <li className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 last:border-0 dark:border-slate-800">
      <span className="min-w-0 flex-1 text-xs text-slate-600 dark:text-slate-300">{label}</span>
      {perm.loading ? (
        <span className="shrink-0 text-[11px] text-slate-400">Checking…</span>
      ) : perm.error ? (
        <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
          Unverified
        </span>
      ) : perm.allowed ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
          <Check className="h-3 w-3" aria-hidden /> Allowed
        </span>
      ) : (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700 dark:bg-red-900/30 dark:text-red-400">
          <X className="h-3 w-3" aria-hidden /> Denied
        </span>
      )}
    </li>
  );
}

function GovernanceAxisBody() {
  const anyPerm = useCanPerform('cortex', 'generate');
  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 dark:text-slate-400">
        What YOU are allowed to do with AI in this module — resolved live from the governance
        service{anyPerm.d360Role ? (
          <>
            {' '}for role <span className="font-semibold text-slate-700 dark:text-slate-200">{anyPerm.d360Role}</span>
          </>
        ) : null}
        . Buttons across this module enforce exactly these.
      </p>
      {anyPerm.error && (
        <InlineError message="The permission service didn't answer — statuses shown as Unverified (actions fail open until it recovers)." />
      )}
      <ul>
        {AI_ACTIONS.map((a) => (
          <GovActionRow key={a.action} action={a.action} label={a.label} />
        ))}
      </ul>
      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        Denied actions are disabled (never hidden behind fake buttons). Permission changes apply
        after the governance cache refreshes.
      </p>
    </div>
  );
}

// ── KPI strip (under the page header) ─────────────────────────────────────

export function IntelligentKpiStrip() {
  const signals = useAtomValue(intelligentSignalsAtom);
  const setOpen = useSetAtom(cockpitOpenAtom);
  const setAxis = useSetAtom(cockpitAxisAtom);
  const { trackFeatureClick } = useTrackEvent();

  const openAxis = useCallback(
    (id: string) => {
      setAxis(id);
      setOpen(true);
      trackFeatureClick(`intelligent_cockpit_kpi_${id}`);
    },
    [setAxis, setOpen, trackFeatureClick],
  );

  const scoreDot: KpiDotTone =
    signals == null ? 'idle' : signals.critical > 0 ? 'warn' : signals.score != null ? 'ok' : 'idle';

  const items: KpiItem[] = [
    {
      label: 'Intelligence score',
      value: signals?.score ?? null,
      dot: scoreDot,
      sub: 'recos · models · insights',
      title: 'Composite score — click for the transparent formula',
      onClick: () => openAxis('ai_score'),
    },
    {
      label: 'Active recos',
      value: signals?.activeRecos ?? null,
      delta:
        signals && signals.critical > 0
          ? { text: `${signals.critical} critical`, tone: 'warn' }
          : undefined,
      sub: 'open · acked · snoozed',
      onClick: () => openAxis('recommendations'),
    },
    {
      label: 'Models',
      value: signals?.models ?? null,
      sub: 'semantic + trained',
      onClick: () => openAxis('models'),
    },
    {
      label: 'Insights',
      value: signals?.insights ?? null,
      sub: 'query-analysis findings',
      onClick: () => openAxis('functional'),
    },
    {
      label: 'Stored conversations',
      value: signals?.conversations ?? null,
      sub: 'AI exchanges kept',
      onClick: () => openAxis('history'),
    },
  ];

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 shadow-sm dark:border-slate-800">
      <KpiStrip items={items} />
    </div>
  );
}

// ── The cockpit itself (right edge, owns all fetching) ────────────────────

export default function IntelligentCockpit({ kpis }: { kpis: CortexKpis | null }) {
  const router = useRouter();
  const { trackFeatureClick } = useTrackEvent();
  const [open, setOpen] = useAtom(cockpitOpenAtom);
  const [axis, setAxis] = useAtom(cockpitAxisAtom);
  const setSignals = useSetAtom(intelligentSignalsAtom);

  // ── Shared signal fetches (each dataset fetched ONCE; strip + axes reuse) ──
  const fetchRecos = useCallback(async () => {
    const res = await listRecommendations({
      page: RECO_PAGE,
      module: RECO_MODULE,
      statuses: ALL_STATUSES,
      limit: 200,
    });
    return res.items ?? [];
  }, []);
  const recosQ = useCacheAwareQuery<Recommendation[]>(fetchRecos, {
    cacheKeys: [CACHE_KEYS.CORTEX, CACHE_KEYS.AI_SUGGESTIONS],
    initialData: [],
  });

  const registryQ = useCacheAwareQuery<RegistrySignals>(fetchModelRegistry, {
    cacheKeys: [CACHE_KEYS.ML_MODELS, CACHE_KEYS.FINE_TUNE_JOBS],
  });

  const fetchConversations = useCallback(() => listCortexConversations(25), []);
  const conversationsQ = useCacheAwareQuery<CortexConversation[]>(fetchConversations, {
    cacheKeys: [CACHE_KEYS.CORTEX, CACHE_KEYS.CHAT],
    initialData: [],
  });

  const fetchSummary = useCallback(() => getQueryAnalyticsSummary(), []);
  const summaryQ = useCacheAwareQuery<AnalyticsSummary>(fetchSummary, {
    cacheKeys: [CACHE_KEYS.QUERY_ANALYTICS, CACHE_KEYS.CORTEX],
  });

  // Axis-only detail — LAZY: fetched the first time the functional axis opens.
  const functionalActive = open && axis === 'functional';
  const fetchGroups = useCallback(async () => (await getRedundantGroups(5)).groups ?? [], []);
  const groupsQ = useCacheAwareQuery<RedundantGroup[]>(fetchGroups, {
    cacheKeys: [CACHE_KEYS.QUERY_ANALYTICS],
    enabled: functionalActive,
  });

  const generatePerm = useCanPerform('cortex', 'generate');

  // ── Derive signals + honest score breakdown ─────────────────────────────
  const recosLoaded = recosQ.lastFetchedAt != null && !recosQ.unavailable && !recosQ.error;
  const registryLoaded = registryQ.lastFetchedAt != null && !registryQ.unavailable && !registryQ.error;
  const conversationsLoaded =
    conversationsQ.lastFetchedAt != null && !conversationsQ.unavailable && !conversationsQ.error;
  const summaryLoaded = summaryQ.lastFetchedAt != null && !summaryQ.unavailable && !summaryQ.error;

  const derived = useMemo(() => {
    const allRecos = recosLoaded ? recosQ.data ?? [] : null;
    const activeRecos = allRecos
      ? allRecos.filter((r) => ACTIVE_STATUSES.includes((r.status || '').toLowerCase() as RecoStatus))
      : null;
    const critical = (activeRecos ?? []).filter(
      (r) => (r.severity || '').toLowerCase() === 'critical',
    ).length;

    // Part A — recommendation health: % of stored recos handled (resolved/dismissed).
    const totalRecos = allRecos?.length ?? 0;
    const handled = (allRecos ?? []).filter((r) =>
      ['resolved', 'dismissed'].includes((r.status || '').toLowerCase()),
    ).length;
    const recoPart: ScorePart = {
      key: 'recos',
      label: 'Recommendation health',
      weight: 40,
      value01: allRecos == null || totalRecos === 0 ? null : handled / totalRecos,
      detail:
        allRecos == null
          ? 'excluded — recommendation data unavailable'
          : totalRecos === 0
            ? 'excluded — no recommendations recorded yet'
            : `${handled}/${totalRecos} recommendations handled (resolved or dismissed)`,
    };

    // Part B — automation: active models across semantic + trained registries.
    const registry = registryLoaded ? registryQ.data : null;
    const trainedCounts = registry
      ? [registry.finetune, registry.classification, registry.documentAi, registry.topInsights]
      : [];
    const anyTrainedKnown = trainedCounts.some((c) => c != null);
    const semantic = kpis?.models_active ?? null;
    const modelsKnown = anyTrainedKnown || semantic != null;
    const modelsTotal = modelsKnown
      ? (semantic ?? 0) + trainedCounts.reduce<number>((s, c) => s + (c ?? 0), 0)
      : null;
    const automationPart: ScorePart = {
      key: 'automation',
      label: 'Automation',
      weight: 30,
      value01: modelsTotal == null ? null : Math.min(1, modelsTotal / 5),
      detail:
        modelsTotal == null
          ? 'excluded — model registry unavailable'
          : `${modelsTotal} active model${modelsTotal === 1 ? '' : 's'} (semantic + trained; full credit at 5)`,
    };

    // Part C — insight freshness: has query analysis run, and how recently.
    const summary = summaryLoaded ? summaryQ.data : null;
    let insightValue: number | null = null;
    let insightDetail = 'excluded — query-analysis data unavailable';
    if (summary != null) {
      const days = ageDays(summary.LAST_ANALYSIS_AT);
      if (days == null) {
        insightValue = 0;
        insightDetail = 'query analysis never run (0%)';
      } else if (days <= 7) {
        insightValue = 1;
        insightDetail = `last analysis ${relTime(summary.LAST_ANALYSIS_AT)} — fresh (100%)`;
      } else if (days <= 30) {
        insightValue = 0.6;
        insightDetail = `last analysis ${relTime(summary.LAST_ANALYSIS_AT)} — aging (60%)`;
      } else {
        insightValue = 0.3;
        insightDetail = `last analysis ${relTime(summary.LAST_ANALYSIS_AT)} — stale (30%)`;
      }
    }
    const insightPart: ScorePart = {
      key: 'insights',
      label: 'Insight freshness',
      weight: 30,
      value01: insightValue,
      detail: insightDetail,
    };

    const parts = [recoPart, automationPart, insightPart];
    const score = computeScore(parts);

    const findings =
      summary == null
        ? null
        : (summary.OPTIMIZATION_COUNT ?? 0) +
          (summary.SLOW_QUERY_COUNT ?? 0) +
          (summary.ERROR_COUNT ?? 0) +
          (summary.REDUNDANT_COUNT ?? 0);

    const inputsBits: string[] = [];
    if (allRecos != null) inputsBits.push(`${totalRecos} recommendation${totalRecos === 1 ? '' : 's'}`);
    if (modelsTotal != null) inputsBits.push(`${modelsTotal} model${modelsTotal === 1 ? '' : 's'}`);
    if (summary != null) inputsBits.push(`${summary.TOTAL_ANALYZED ?? 0} analyzed queries`);
    const inputsSummary =
      inputsBits.length > 0 ? `Based on ${inputsBits.join(' · ')}.` : 'No inputs available yet — the score stays honest and empty.';

    const signals: IntelligentSignals = {
      score,
      critical,
      activeRecos: activeRecos ? activeRecos.length : null,
      models: modelsTotal,
      insights: findings,
      conversations: conversationsLoaded ? (conversationsQ.data ?? []).length : null,
    };

    return { signals, parts, score, inputsSummary, activeRecos: activeRecos ?? [], critical };
  }, [
    recosLoaded,
    recosQ.data,
    registryLoaded,
    registryQ.data,
    summaryLoaded,
    summaryQ.data,
    conversationsLoaded,
    conversationsQ.data,
    kpis?.models_active,
  ]);

  // Publish to the strip.
  useEffect(() => {
    setSignals(derived.signals);
  }, [derived.signals, setSignals]);

  // ── Severities (critical recos > 0 → warn; else ok / idle) ──────────────
  const recoSeverity: AxisSeverity = !recosLoaded ? 'idle' : derived.critical > 0 ? 'warn' : 'ok';
  const scoreSeverity: AxisSeverity =
    derived.critical > 0 ? 'warn' : derived.score != null ? 'ok' : 'idle';
  const modelsSeverity: AxisSeverity = registryLoaded || kpis?.models_active != null ? 'ok' : 'idle';
  const functionalSeverity: AxisSeverity = summaryLoaded ? 'ok' : 'idle';
  const historySeverity: AxisSeverity =
    conversationsLoaded && (conversationsQ.data ?? []).length > 0 ? 'ok' : 'idle';
  const govSeverity: AxisSeverity = generatePerm.loading ? 'idle' : 'ok';

  const goTab = useCallback(
    (tab: string) => router.push(`/intelligent?tab=${tab}`),
    [router],
  );

  const axes: AxisDef[] = [
    {
      id: 'ai_score',
      label: 'Intelligence Score',
      railLabel: 'Score',
      icon: Gauge,
      severity: scoreSeverity,
      badge: derived.score != null ? `${derived.score}/100` : undefined,
      render: () => (
        <ScoreAxisBody
          score={derived.score}
          parts={derived.parts}
          inputsSummary={derived.inputsSummary}
          critical={derived.critical}
        />
      ),
    },
    {
      id: 'recommendations',
      label: 'Recommendations',
      railLabel: 'Recos',
      icon: Lightbulb,
      severity: recoSeverity,
      badge: derived.signals.activeRecos != null ? `${derived.signals.activeRecos} active` : undefined,
      primaryCta: {
        label: 'AI Advisor',
        tone: 'neutral',
        onClick: () => goTab('ai-advisor'),
        title: 'Open the full AI Advisor tab',
      },
      render: () => (
        <RecosAxisBody
          items={derived.activeRecos}
          loading={recosQ.loading && recosQ.lastFetchedAt == null}
          unavailable={recosQ.unavailable}
          error={recosQ.error ? errMsg(recosQ.error) : null}
          onRefetch={() => void recosQ.refetch()}
        />
      ),
    },
    {
      id: 'models',
      label: 'Models',
      railLabel: 'Models',
      icon: Boxes,
      severity: modelsSeverity,
      badge: derived.signals.models != null ? String(derived.signals.models) : undefined,
      primaryCta: {
        label: 'Advanced ML',
        tone: 'neutral',
        onClick: () => goTab('advanced-ml'),
        title: 'Open the Advanced ML tab',
      },
      render: () => (
        <ModelsAxisBody
          registry={registryQ.data}
          loading={registryQ.loading && registryQ.lastFetchedAt == null}
          unavailable={registryQ.unavailable}
          error={registryQ.error ? errMsg(registryQ.error) : null}
          onRefetch={() => void registryQ.refetch()}
          semanticModels={kpis?.models_active ?? null}
        />
      ),
    },
    {
      id: 'functional',
      label: 'Robotize & Optimize',
      railLabel: 'Optimize',
      icon: Bot,
      severity: functionalSeverity,
      badge:
        derived.signals.insights != null ? `${derived.signals.insights} findings` : undefined,
      primaryCta: {
        label: 'Query Analytics',
        tone: 'neutral',
        onClick: () => goTab('query-analytics'),
        title: 'Open the Query Analytics tab',
      },
      render: () => (
        <FunctionalAxisBody
          summary={summaryQ.data}
          loading={summaryQ.loading && summaryQ.lastFetchedAt == null}
          unavailable={summaryQ.unavailable}
          error={summaryQ.error ? errMsg(summaryQ.error) : null}
          onRefetch={() => void summaryQ.refetch()}
          topInsightsCount={registryQ.data?.topInsights ?? null}
          groups={groupsQ.data}
          groupsLoading={groupsQ.loading && groupsQ.lastFetchedAt == null}
          groupsError={groupsQ.error ? errMsg(groupsQ.error) : null}
        />
      ),
    },
    {
      id: 'history',
      label: 'AI History',
      railLabel: 'History',
      icon: History,
      severity: historySeverity,
      badge:
        derived.signals.conversations != null ? String(derived.signals.conversations) : undefined,
      primaryCta: {
        label: 'AI Chat',
        tone: 'neutral',
        onClick: () => goTab('cortex-chat'),
        title: 'Open the AI Chat tab',
      },
      render: () => (
        <HistoryAxisBody
          conversations={conversationsQ.data ?? []}
          loading={conversationsQ.loading && conversationsQ.lastFetchedAt == null}
          unavailable={conversationsQ.unavailable}
          error={conversationsQ.error ? errMsg(conversationsQ.error) : null}
          onRefetch={() => void conversationsQ.refetch()}
        />
      ),
    },
    {
      id: 'governance',
      label: 'AI Governance',
      railLabel: 'Gov',
      icon: ShieldCheck,
      severity: govSeverity,
      render: () => <GovernanceAxisBody />,
    },
  ];

  const handleOpenAxis = useCallback(
    (id: string) => {
      setAxis(id);
      setOpen(true);
      trackFeatureClick(`intelligent_cockpit_axis_${id}`);
    },
    [setAxis, setOpen, trackFeatureClick],
  );

  // Docked full-height inside the page's fixed-height one-pager frame
  // (the frame owns the viewport budget — no sticky offset needed).
  return (
    <aside aria-label="Intelligence cockpit" className="z-20 hidden h-full shrink-0 xl:block">
      <AxisCockpit
        axes={axes}
        open={open}
        activeAxis={axis}
        onOpenAxis={handleOpenAxis}
        onClose={() => setOpen(false)}
        className="h-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900"
      />
    </aside>
  );
}
