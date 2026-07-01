'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toMessage } from '@/lib/error-messages';
import { Badge, Button, Loader, Textarea } from 'rizzui';
import toast from 'react-hot-toast';
import {
  PiSparkle,
  PiArrowsClockwise,
  PiArrowCounterClockwise,
  PiWarningCircle,
  PiLightning,
  PiCheckCircle,
  PiEye,
  PiClock,
  PiMoon,
  PiXCircle,
  PiCurrencyDollar,
} from 'react-icons/pi';
import { Inbox } from 'lucide-react';
import EmptyState from '@/components/ui/EmptyState';
import { ActionRail, useActionPanel } from '@/app/shared/action-rail';
import {
  listRecommendations,
  analyzeRecommendations,
  acknowledgeRecommendation,
  resolveRecommendation,
  dismissRecommendation,
  snoozeRecommendation,
  reopenRecommendation,
  type Recommendation,
  type RecoStatus,
} from '@/app/services/recommendations';

// ── Constants ────────────────────────────────────────────────────────────

const PAGE = 'intelligent';
const MODULE = 'intelligence';

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  high: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  low: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  info: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
};

function severityClass(sev: string): string {
  return SEVERITY_BADGE[(sev || '').toLowerCase()] || SEVERITY_BADGE.info;
}

function fmtSavings(v: number | null | undefined): string {
  if (v === null || v === undefined) return '—';
  return `$${Math.round(v).toLocaleString()}/mo`;
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function errMsg(e: any): string {
  // toMessage() guarantees a string even when the backend `detail` is a
  // structured object (503 cache/svc states) — prevents "object as React child".
  return toMessage(e, 'Something went wrong');
}

// Status buckets for the Active / Archived filter. Snoozed rows stay "active"
// (they auto-reopen once their snooze date passes); resolved/dismissed are the
// recoverable archive, where the Reopen action lives.
const ACTIVE_STATUSES: RecoStatus[] = ['open', 'acknowledged', 'snoozed'];
const ARCHIVED_STATUSES: RecoStatus[] = ['resolved', 'dismissed'];

function isArchivedStatus(s: string | null | undefined): boolean {
  const v = (s || '').toLowerCase();
  return v === 'resolved' || v === 'dismissed';
}

// Quick snooze presets (days) offered in the detail rail.
const SNOOZE_PRESETS: { days: number; label: string }[] = [
  { days: 1, label: 'Tomorrow' },
  { days: 7, label: '7 days' },
  { days: 30, label: '30 days' },
];

// ── Elapsed timer (visible during long analyze) ──────────────────────────

function ElapsedTimer({ running }: { running: boolean }) {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (!running) {
      setElapsed(0);
      return;
    }
    startRef.current = Date.now();
    setElapsed(0);
    const id = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 250);
    return () => clearInterval(id);
  }, [running]);

  if (!running) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400">
      <PiClock className="w-3.5 h-3.5" />
      Analyzing… {elapsed}s
    </span>
  );
}

function SkeletonCards({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-lg border border-gray-200 dark:border-gray-700 p-4 bg-white dark:bg-gray-800"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="h-5 w-16 rounded-full bg-gray-200 dark:bg-gray-700" />
            <div className="h-5 w-40 rounded bg-gray-200 dark:bg-gray-700" />
          </div>
          <div className="h-3 w-3/4 rounded bg-gray-200 dark:bg-gray-700 mb-2" />
          <div className="h-3 w-1/2 rounded bg-gray-200 dark:bg-gray-700" />
        </div>
      ))}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function AiAdvisorContent() {
  const [recos, setRecos] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  // Active vs Archived (resolved/dismissed) status filter.
  const [view, setView] = useState<'active' | 'archived'>('active');

  // Detail rail (non-blocking; destructive dismiss uses inline confirm in rail)
  const { isOpen, open, close } = useActionPanel<'details'>();
  const [selected, setSelected] = useState<Recommendation | null>(null);
  const [dismissReason, setDismissReason] = useState('');
  const [confirmingDismiss, setConfirmingDismiss] = useState(false);
  const [snoozing, setSnoozing] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  // ── Load stored recommendations (pure read) ─────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await listRecommendations({
        page: PAGE,
        module: MODULE,
        statuses: view === 'archived' ? ARCHIVED_STATUSES : ACTIVE_STATUSES,
        limit: 100,
      });
      setRecos(res.items ?? []);
    } catch (e: any) {
      setLoadError(errMsg(e));
      setRecos([]);
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => {
    load();
  }, [load]);

  // ── Recompute (long Snowflake op) ───────────────────────────────────────
  const handleAnalyze = async () => {
    // Analyze recomputes the active recommendation set — surface results in the
    // Active view so the returned items are not masked by the Archived filter.
    setView('active');
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      const res = await analyzeRecommendations({
        scope: 'ACCOUNT',
        page: PAGE,
        module: MODULE,
        top_n: 25,
        enable_cortex: true,
      });
      setRecos(res.items ?? []);
      setNarrative(res.ai_narrative ?? null);
      setSummary(res.summary ?? null);
      toast.success('Recommendations refreshed');
    } catch (e: any) {
      setAnalyzeError(errMsg(e));
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Lifecycle actions ───────────────────────────────────────────────────
  const openDetails = (reco: Recommendation) => {
    setSelected(reco);
    setConfirmingDismiss(false);
    setDismissReason('');
    setSnoozing(false);
    open('details');
  };

  const replaceReco = (updated: Recommendation) => {
    setRecos((prev) => prev.map((r) => (r.reco_id === updated.reco_id ? updated : r)));
    setSelected(updated);
  };

  const removeReco = (recoId: string) => {
    setRecos((prev) => prev.filter((r) => r.reco_id !== recoId));
  };

  const handleAcknowledge = async (reco: Recommendation) => {
    setActionBusy(true);
    try {
      const updated = await acknowledgeRecommendation(reco.reco_id);
      replaceReco(updated);
      toast.success('Acknowledged');
    } catch (e: any) {
      toast.error(errMsg(e));
    } finally {
      setActionBusy(false);
    }
  };

  const handleSnooze = async (reco: Recommendation, days: number) => {
    setActionBusy(true);
    try {
      const until = new Date(Date.now() + days * 86_400_000).toISOString();
      await snoozeRecommendation(reco.reco_id, until);
      toast.success(`Snoozed for ${days} day${days > 1 ? 's' : ''}`);
      setSnoozing(false);
      close();
      await load();
    } catch (e: any) {
      toast.error(errMsg(e));
    } finally {
      setActionBusy(false);
    }
  };

  const handleReopen = async (reco: Recommendation) => {
    setActionBusy(true);
    try {
      await reopenRecommendation(reco.reco_id);
      // Reopened rows return to 'open' and leave the Archived list.
      removeReco(reco.reco_id);
      toast.success('Reopened');
      close();
    } catch (e: any) {
      toast.error(errMsg(e));
    } finally {
      setActionBusy(false);
    }
  };

  const handleResolve = async (reco: Recommendation) => {
    setActionBusy(true);
    try {
      await resolveRecommendation(reco.reco_id);
      removeReco(reco.reco_id);
      toast.success('Marked as resolved');
      close();
    } catch (e: any) {
      toast.error(errMsg(e));
    } finally {
      setActionBusy(false);
    }
  };

  const handleDismiss = async (reco: Recommendation) => {
    if (!dismissReason.trim()) {
      toast.error('A reason is required to dismiss');
      return;
    }
    setActionBusy(true);
    try {
      await dismissRecommendation(reco.reco_id, dismissReason.trim());
      removeReco(reco.reco_id);
      toast.success('Dismissed');
      close();
    } catch (e: any) {
      toast.error(errMsg(e));
    } finally {
      setActionBusy(false);
    }
  };

  const critical = recos.filter((r) => (r.severity || '').toLowerCase() === 'critical').length;
  const totalSavings = recos.reduce((sum, r) => sum + (r.estimated_savings_usd || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <PiSparkle className="w-5 h-5 text-violet-500" />
            AI Advisor
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            AI-generated recommendations to optimize cost, performance, and governance
            across your platform. Review, action, and track each one.
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <ElapsedTimer running={analyzing} />
          <Button className="gap-2" onClick={handleAnalyze} disabled={analyzing}>
            <PiArrowsClockwise className={`w-4 h-4 ${analyzing ? 'animate-spin' : ''}`} />
            {analyzing ? 'Analyzing…' : 'Run Analysis'}
          </Button>
        </div>
      </div>

      {/* Status filter — Active vs recoverable Archived (resolved/dismissed) */}
      <div
        className="inline-flex items-center gap-1 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-0.5"
        role="group"
        aria-label="Recommendation status filter"
      >
        {([
          { key: 'active', label: 'Active' },
          { key: 'archived', label: 'Resolved / Dismissed' },
        ] as const).map((opt) => (
          <button
            key={opt.key}
            type="button"
            aria-pressed={view === opt.key}
            onClick={() => setView(opt.key)}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              view === opt.key
                ? 'bg-violet-500 text-white'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {view === 'archived' ? 'Archived recommendations' : 'Active recommendations'}
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
            {loading ? '…' : loadError ? '—' : recos.length}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Critical findings</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
            {loading ? '…' : loadError ? '—' : critical}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">Est. savings potential</p>
          <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
            {loading ? '…' : totalSavings > 0 ? fmtSavings(totalSavings) : '—'}
          </p>
        </div>
      </div>

      {/* AI narrative (only after a recompute that produced one) */}
      {(summary || narrative) && (
        <div className="rounded-lg border border-violet-200 dark:border-violet-800 bg-violet-50/60 dark:bg-violet-900/20 p-4">
          {summary && (
            <p className="text-sm font-medium text-violet-800 dark:text-violet-300">{summary}</p>
          )}
          {narrative && (
            <p className="text-sm text-violet-700 dark:text-violet-300/90 mt-2 whitespace-pre-wrap">
              {narrative}
            </p>
          )}
        </div>
      )}

      {/* Analyze error (graceful — table may not be installed yet) */}
      {analyzeError && (
        <div className="flex items-start gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <PiWarningCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-700 dark:text-red-300">{analyzeError}</p>
            <p className="text-xs text-red-600/80 dark:text-red-400/70 mt-1">
              The recommendations store may not be provisioned yet on this account.
            </p>
          </div>
          <Button variant="text" size="sm" className="shrink-0" onClick={handleAnalyze}>
            Retry
          </Button>
        </div>
      )}

      {/* Load error */}
      {loadError && !loading && (
        <div className="flex items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <PiLightning className="w-5 h-5 text-red-500 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-300 flex-1">{loadError}</p>
          <Button variant="text" size="sm" className="shrink-0" onClick={load}>
            Retry
          </Button>
        </div>
      )}

      {/* Body: skeleton → empty → list */}
      {loading ? (
        <SkeletonCards count={3} />
      ) : loadError ? null : recos.length === 0 ? (
        view === 'archived' ? (
          <EmptyState
            icon={Inbox}
            title="Nothing archived yet"
            description="Resolved and dismissed recommendations appear here, where you can reopen them if they become relevant again."
            action={
              <Button variant="outline" className="gap-2" onClick={() => setView('active')}>
                View active recommendations
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Inbox}
            title="No recommendations yet"
            description="Run an analysis to scan this account for cost, performance, and governance improvements."
            action={
              <Button className="gap-2" onClick={handleAnalyze} disabled={analyzing}>
                <PiSparkle className="w-4 h-4" />
                Run Analysis
              </Button>
            }
          />
        )
      ) : (
        <div className="space-y-3">
          {recos.map((reco) => (
            <div
              key={reco.reco_id}
              className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 hover:border-violet-300 dark:hover:border-violet-700 transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={`text-[10px] uppercase ${severityClass(reco.severity)}`}>
                      {reco.severity || 'info'}
                    </Badge>
                    {reco.status && reco.status !== 'open' && (
                      <Badge className="text-[10px] bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                        {reco.status}
                      </Badge>
                    )}
                    {reco.estimated_savings_usd ? (
                      <span className="inline-flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                        <PiCurrencyDollar className="w-3.5 h-3.5" />
                        {fmtSavings(reco.estimated_savings_usd)}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-sm font-medium text-gray-900 dark:text-white mt-2">
                    {reco.title || '—'}
                  </p>
                  {reco.rationale && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                      {reco.rationale}
                    </p>
                  )}
                  {reco.target && (
                    <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1 font-mono truncate">
                      {reco.target}
                    </p>
                  )}
                </div>
                {/* ActionRail trigger — list stays visible, no modal for details */}
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 shrink-0"
                  onClick={() => openDetails(reco)}
                >
                  <PiEye className="w-3.5 h-3.5" />
                  Details
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Detail ActionRail (non-blocking) ──────────────────────────────── */}
      <ActionRail
        isOpen={isOpen && !!selected}
        onClose={close}
        title={selected?.title ?? 'Recommendation'}
        description={selected ? `Severity: ${selected.severity} · Status: ${selected.status}` : undefined}
        accentClassName="bg-violet-500"
        footer={
          selected ? (
            isArchivedStatus(selected.status) ? (
              // Archived (resolved/dismissed) — recoverable via Reopen.
              <div className="flex w-full justify-end">
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => handleReopen(selected)}
                  disabled={actionBusy}
                >
                  {actionBusy ? <Loader size="sm" /> : <PiArrowCounterClockwise className="w-3.5 h-3.5" />}
                  Reopen
                </Button>
              </div>
            ) : (
              <div className="flex w-full items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => handleAcknowledge(selected)}
                    disabled={actionBusy || selected.status === 'acknowledged'}
                  >
                    <PiEye className="w-3.5 h-3.5" />
                    Acknowledge
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setSnoozing((v) => !v)}
                    disabled={actionBusy}
                  >
                    <PiMoon className="w-3.5 h-3.5" />
                    Snooze
                  </Button>
                </div>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => handleResolve(selected)}
                  disabled={actionBusy}
                >
                  {actionBusy ? <Loader size="sm" /> : <PiCheckCircle className="w-3.5 h-3.5" />}
                  Resolve
                </Button>
              </div>
            )
          ) : undefined
        }
      >
        {selected && (
          <div className="space-y-4 text-sm">
            {selected.rationale && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
                  Why this matters
                </p>
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {selected.rationale}
                </p>
              </div>
            )}
            {selected.proposed_action && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
                  Proposed action
                </p>
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                  {selected.proposed_action}
                </p>
              </div>
            )}
            {selected.proposed_sql && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500 mb-1">
                  SQL
                </p>
                <pre className="p-3 bg-slate-900 text-slate-100 rounded-lg text-xs font-mono overflow-x-auto">
                  <code>{selected.proposed_sql}</code>
                </pre>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Est. savings</p>
                <p className="text-gray-700 dark:text-gray-300">
                  {fmtSavings(selected.estimated_savings_usd)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Score</p>
                <p className="text-gray-700 dark:text-gray-300">{selected.score ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">First detected</p>
                <p className="text-gray-700 dark:text-gray-300">
                  {fmtDate(selected.first_detected_at)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Last seen</p>
                <p className="text-gray-700 dark:text-gray-300">{fmtDate(selected.last_seen_at)}</p>
              </div>
            </div>
            {selected.target && (
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Target</p>
                <p className="text-gray-700 dark:text-gray-300 font-mono break-all">
                  {selected.target}
                </p>
              </div>
            )}

            {/* Snooze — inline duration picker inside the rail (no popup) */}
            {snoozing && !isArchivedStatus(selected.status) && (
              <div className="border-t border-gray-100 dark:border-gray-800 pt-4 space-y-2">
                <p className="text-xs font-medium text-violet-600 dark:text-violet-400 flex items-center gap-1.5">
                  <PiMoon className="w-3.5 h-3.5" />
                  Snooze until…
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  {SNOOZE_PRESETS.map((p) => (
                    <Button
                      key={p.days}
                      variant="outline"
                      size="sm"
                      onClick={() => handleSnooze(selected, p.days)}
                      disabled={actionBusy}
                    >
                      {p.label}
                    </Button>
                  ))}
                  <Button
                    variant="text"
                    size="sm"
                    onClick={() => setSnoozing(false)}
                    disabled={actionBusy}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {/* Destructive dismiss — inline confirm inside the rail */}
            {!isArchivedStatus(selected.status) && (
            <div className="border-t border-gray-100 dark:border-gray-800 pt-4">
              {!confirmingDismiss ? (
                <Button
                  variant="text"
                  size="sm"
                  className="gap-1.5 text-red-500 hover:text-red-600"
                  onClick={() => setConfirmingDismiss(true)}
                >
                  <PiXCircle className="w-3.5 h-3.5" />
                  Dismiss as not applicable
                </Button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-red-600 dark:text-red-400">
                    Dismiss this recommendation? Provide a reason.
                  </p>
                  <Textarea
                    value={dismissReason}
                    onChange={(e) => setDismissReason(e.target.value)}
                    placeholder="e.g. False positive — this warehouse is intentionally sized."
                    rows={2}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="bg-red-500 hover:bg-red-600"
                      onClick={() => handleDismiss(selected)}
                      disabled={actionBusy || !dismissReason.trim()}
                    >
                      {actionBusy ? <Loader size="sm" /> : 'Confirm dismiss'}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setConfirmingDismiss(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>
            )}
          </div>
        )}
      </ActionRail>
    </div>
  );
}
