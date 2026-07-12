'use client';

/**
 * GrowCtas — the FINAL-TAB-DISPLAY-SPEC wave-2 "Grow" strip + "CTA group"
 * blocks for the Account Overview tabs. Three grid-cell components:
 *
 *   MaturityLadderStrip  (Overview tab)  — Connected → Governed → Optimized →
 *     AI-operated. Every rung is gated by ONE real fact from a live source:
 *       Connected    · account-health live SHOW WAREHOUSES pulse
 *       Governed     · /command-center/summary security policies count
 *       Optimized    · /org-accounts/resource-monitors (SHOW RESOURCE MONITORS)
 *       AI-operated  · /org-accounts/platform-activity/insight (COCO digest)
 *     A rung whose source is unavailable shows '?' with the reason — never a
 *     guess. Skeleton until each fact resolves.
 *
 *   WarehouseCtaGroup    (FinOps tab)    — best-practice lifecycle actions
 *     bound to GET /api/administration/warehouses (live SHOW): suspend an
 *     idle STARTED warehouse · set auto-suspend 60s where >600s/disabled ·
 *     resize the biggest quiet warehouse one size down. Honest gating: the
 *     whole group degrades with the real 403/404 reason, and every action is
 *     an InsightActionButton (runtime errors surface inline, never faked).
 *
 *   SecurityCtaGroup     (Security tab)  — deep-link CTAs: review orphan
 *     grants (governance grants page) and "Require MFA for N users" with N
 *     bound to the tab's already-loaded mfa_coverage KPI (no invented write
 *     endpoint — MFA enforcement is a governance-users task).
 */

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import axios from 'axios';
import {
  ArrowUpRight,
  Bot,
  Cable,
  CheckCircle2,
  Circle,
  Gauge,
  HelpCircle,
  Lock,
  PauseCircle,
  Scale,
  ShieldCheck,
  Timer,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import apiClient, { getApiErrorMessage } from '@/lib/api-client';
import InsightActionButton from '@/app/shared/insights/InsightActionButton';
import type { SummaryResponse } from '@/app/services/command-center/types';
import type { SecurityOverviewResponse } from '@/app/services/org-accounts/types';
import {
  getResourceMonitors,
  getPlatformActivityInsight,
} from '@/app/services/org-accounts/hooks';
import {
  getAccountHealth,
  AccountHealthUnavailableError,
  type AccountHealth,
} from '@/app/services/administration/account-health';

// ─────────────────────────────────────────────────────────────────────────────
// Shared bits
// ─────────────────────────────────────────────────────────────────────────────

function SourceChip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-800 dark:text-slate-400">
      {children}
    </span>
  );
}

/** Deep-link CTA chip + its why-line (spec: what · why-from-real-state). */
function DeepLinkCta({
  label,
  href,
  why,
  source,
  icon: Icon = ArrowUpRight,
  tone = 'blue',
  testid,
}: {
  label: string;
  href: string;
  why: string;
  source: string;
  icon?: React.ElementType;
  tone?: 'blue' | 'red' | 'amber';
  testid?: string;
}) {
  const TONE: Record<string, string> = {
    blue: 'border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-900/40 dark:text-blue-300 dark:hover:bg-blue-900/20',
    red: 'border-red-200 text-red-700 hover:bg-red-50 dark:border-red-900/40 dark:text-red-300 dark:hover:bg-red-900/20',
    amber:
      'border-amber-200 text-amber-700 hover:bg-amber-50 dark:border-amber-900/40 dark:text-amber-300 dark:hover:bg-amber-900/20',
  };
  return (
    <div
      data-testid={testid}
      className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900"
    >
      <Link
        href={href}
        className={cn(
          'inline-flex w-fit items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-semibold transition-colors',
          TONE[tone],
        )}
      >
        <Icon className="h-3 w-3" aria-hidden />
        {label}
      </Link>
      <p
        data-testid="cta-why"
        className="text-[11px] leading-snug text-slate-500 dark:text-slate-400"
      >
        {why}
      </p>
      <SourceChip>{source}</SourceChip>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 1 · MaturityLadderStrip (Overview tab "Grow")
// ─────────────────────────────────────────────────────────────────────────────

type RungStatus = 'pending' | 'achieved' | 'missed' | 'unknown';

interface Rung {
  id: string;
  label: string;
  icon: React.ElementType;
  status: RungStatus;
  /** The gating fact ("Governed — 12 masking policies active") or the honest
   *  unavailability reason ('?'). Never a guess. */
  fact: string;
  source: string;
}

interface FactState<T> {
  status: 'pending' | 'ok' | 'error';
  value: T | null;
  reason?: string;
}

const RUNG_ICON_CLS: Record<RungStatus, string> = {
  achieved: 'text-emerald-500',
  missed: 'text-slate-300 dark:text-slate-600',
  unknown: 'text-amber-500',
  pending: 'text-slate-300 dark:text-slate-600',
};

export function MaturityLadderStrip({
  summary,
  summaryLoading,
}: {
  summary: SummaryResponse | null;
  /** Parent overview loading flag — governs the "Governed" rung skeleton. */
  summaryLoading: boolean;
}) {
  const [health, setHealth] = useState<FactState<AccountHealth>>({
    status: 'pending',
    value: null,
  });
  const [monitors, setMonitors] = useState<FactState<number>>({
    status: 'pending',
    value: null,
  });
  const [coco, setCoco] = useState<
    FactState<{ narrative: string | null; model: string; degraded: string | null }>
  >({ status: 'pending', value: null });

  useEffect(() => {
    let cancelled = false;
    getAccountHealth()
      .then((h) => !cancelled && setHealth({ status: 'ok', value: h }))
      .catch((e) => {
        if (cancelled) return;
        const reason =
          e instanceof AccountHealthUnavailableError
            ? 'account-health endpoint not deployed'
            : getApiErrorMessage(e);
        setHealth({ status: 'error', value: null, reason });
      });
    getResourceMonitors()
      .then((r) => {
        if (cancelled) return;
        const count = Number(r?.count ?? (Array.isArray(r?.monitors) ? r.monitors.length : NaN));
        if (Number.isFinite(count)) setMonitors({ status: 'ok', value: count });
        else setMonitors({ status: 'error', value: null, reason: 'unexpected monitors payload' });
      })
      .catch((e) => {
        if (cancelled) return;
        setMonitors({ status: 'error', value: null, reason: getApiErrorMessage(e) });
      });
    getPlatformActivityInsight()
      .then((r) => {
        if (cancelled) return;
        setCoco({
          status: 'ok',
          value: {
            narrative: r?.narrative ?? null,
            model: r?.model ?? '',
            degraded: r?.degraded_reason ?? null,
          },
        });
      })
      .catch((e) => {
        if (cancelled) return;
        setCoco({ status: 'error', value: null, reason: getApiErrorMessage(e) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Rung 1 · Connected — live account facts are readable right now. ──
  const connected: Rung = (() => {
    const base = { id: 'connected', label: 'Connected', icon: Cable, source: 'live SHOW WAREHOUSES' };
    if (health.status === 'ok' && health.value?.chips.warehouses) {
      const w = health.value.chips.warehouses;
      return {
        ...base,
        status: 'achieved' as const,
        fact: `${w.total} warehouses visible live (${w.running} running)`,
      };
    }
    if (health.status === 'ok') {
      // Endpoint answered but the warehouses chip degraded — fall back to the
      // summary presence (the account is still readable) before saying '?'.
      const degradedWhy = health.value?.degraded?.warehouses ?? 'warehouses pulse degraded';
      if (summary?.platform) {
        return {
          ...base,
          status: 'achieved' as const,
          fact: 'account summary readable (warehouse pulse degraded)',
          source: '/command-center/summary',
        };
      }
      return { ...base, status: 'unknown' as const, fact: degradedWhy };
    }
    if (health.status === 'error') {
      if (summary?.platform) {
        return {
          ...base,
          status: 'achieved' as const,
          fact: 'account summary readable',
          source: '/command-center/summary',
        };
      }
      return { ...base, status: 'unknown' as const, fact: health.reason ?? 'health pulse unavailable' };
    }
    return { ...base, status: 'pending' as const, fact: '' };
  })();

  // ── Rung 2 · Governed — active masking/RLS policies (> 0). ──
  const governed: Rung = (() => {
    const base = { id: 'governed', label: 'Governed', icon: ShieldCheck, source: '/command-center/summary' };
    if (summary?.security) {
      const masking = Number(summary.security.masking_policies ?? 0);
      const rls = Number(summary.security.rls_policies ?? 0);
      const total = masking + rls;
      return total > 0
        ? {
            ...base,
            status: 'achieved' as const,
            fact: `${masking} masking + ${rls} row-access policies active`,
          }
        : {
            ...base,
            status: 'missed' as const,
            fact: '0 governance policies — add a masking or row-access policy',
          };
    }
    if (summaryLoading) return { ...base, status: 'pending' as const, fact: '' };
    return {
      ...base,
      status: 'unknown' as const,
      fact: 'summary security KPIs unavailable',
    };
  })();

  // ── Rung 3 · Optimized — resource monitors bound spend (> 0). ──
  const optimized: Rung = (() => {
    const base = { id: 'optimized', label: 'Optimized', icon: Gauge, source: 'SHOW RESOURCE MONITORS' };
    if (monitors.status === 'ok' && monitors.value != null) {
      return monitors.value > 0
        ? {
            ...base,
            status: 'achieved' as const,
            fact: `${monitors.value} resource monitor${monitors.value === 1 ? '' : 's'} capping credit spend`,
          }
        : {
            ...base,
            status: 'missed' as const,
            fact: '0 resource monitors — credit spend is unbounded',
          };
    }
    if (monitors.status === 'error') {
      return { ...base, status: 'unknown' as const, fact: monitors.reason ?? 'monitors list unavailable' };
    }
    return { ...base, status: 'pending' as const, fact: '' };
  })();

  // ── Rung 4 · AI-operated — the COCO activity digest is live. ──
  const aiOperated: Rung = (() => {
    const base = { id: 'ai-operated', label: 'AI-operated', icon: Bot, source: 'platform-activity/insight' };
    if (coco.status === 'ok' && coco.value) {
      if (coco.value.narrative) {
        return {
          ...base,
          status: 'achieved' as const,
          fact: `COCO activity digest live${coco.value.model ? ` (${coco.value.model})` : ''}`,
        };
      }
      return {
        ...base,
        status: 'missed' as const,
        fact: coco.value.degraded
          ? `Cortex degraded: ${coco.value.degraded}`
          : 'no AI digest produced for the last 24h',
      };
    }
    if (coco.status === 'error') {
      return { ...base, status: 'unknown' as const, fact: coco.reason ?? 'activity insight unavailable' };
    }
    return { ...base, status: 'pending' as const, fact: '' };
  })();

  const rungs = [connected, governed, optimized, aiOperated];
  // Position = highest CONSECUTIVE achieved rung (a gap breaks the ladder).
  let position = -1;
  for (const r of rungs) {
    if (r.status === 'achieved') position += 1;
    else break;
  }
  const anyPending = rungs.some((r) => r.status === 'pending');

  return (
    <section
      data-testid="maturity-ladder"
      aria-label="Account maturity ladder"
      className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/40"
    >
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <TrendingUp className="h-3.5 w-3.5" aria-hidden />
          Maturity ladder — next step to grow
        </h3>
        {!anyPending && (
          <span
            data-testid="ladder-position"
            className="rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300"
          >
            {position >= 0 ? `You are: ${rungs[position].label}` : 'Not connected yet'}
          </span>
        )}
      </div>
      <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {rungs.map((r, i) => {
          const isCurrent = i === position;
          const isNext = i === position + 1 && r.status !== 'pending';
          const Icon = r.icon;
          return (
            <li
              key={r.id}
              data-testid={`ladder-rung-${r.id}`}
              data-rung-status={r.status}
              className={cn(
                'rounded-lg border p-2.5',
                isCurrent
                  ? 'border-indigo-300 bg-indigo-50/60 dark:border-indigo-800 dark:bg-indigo-900/20'
                  : isNext
                    ? 'border-dashed border-indigo-200 dark:border-indigo-900/50'
                    : 'border-slate-200 dark:border-slate-700',
              )}
            >
              <div className="flex items-center gap-1.5">
                {r.status === 'achieved' ? (
                  <CheckCircle2 className={cn('h-3.5 w-3.5 shrink-0', RUNG_ICON_CLS.achieved)} aria-hidden />
                ) : r.status === 'unknown' ? (
                  <HelpCircle className={cn('h-3.5 w-3.5 shrink-0', RUNG_ICON_CLS.unknown)} aria-hidden />
                ) : (
                  <Circle className={cn('h-3.5 w-3.5 shrink-0', RUNG_ICON_CLS[r.status])} aria-hidden />
                )}
                <Icon className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {i + 1}. {r.label}
                </span>
                {isNext && (
                  <span className="ml-auto rounded bg-indigo-100 px-1 py-px text-[9px] font-bold uppercase text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                    next
                  </span>
                )}
              </div>
              {r.status === 'pending' ? (
                <div className="mt-1.5 h-3 w-4/5 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
              ) : (
                <p className="mt-1 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
                  {r.status === 'unknown' ? '? — ' : ''}
                  {r.fact}
                </p>
              )}
              <div className="mt-1.5">
                <SourceChip>{r.source}</SourceChip>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 · WarehouseCtaGroup (FinOps tab CTA group)
// ─────────────────────────────────────────────────────────────────────────────

const WH_API = '/api/administration/warehouses';

interface WarehouseRow {
  name: string;
  state?: string;
  size?: string;
  running?: number;
  queued?: number;
  auto_suspend?: number | null;
  auto_resume?: string | boolean;
}

type WhListState =
  | { status: 'loading' }
  | { status: 'ready'; items: WarehouseRow[] }
  | { status: 'gated'; reason: string }
  | { status: 'absent' }
  | { status: 'error'; reason: string };

/** SHOW WAREHOUSES size labels, smallest→largest, with API resize tokens. */
const SIZE_LADDER: Array<{ match: string; token: string; label: string }> = [
  { match: 'XSMALL', token: 'XSMALL', label: 'X-Small' },
  { match: 'SMALL', token: 'SMALL', label: 'Small' },
  { match: 'MEDIUM', token: 'MEDIUM', label: 'Medium' },
  { match: 'LARGE', token: 'LARGE', label: 'Large' },
  { match: 'XLARGE', token: 'XLARGE', label: 'X-Large' },
  { match: '2XLARGE', token: 'XXLARGE', label: '2X-Large' },
  { match: '3XLARGE', token: 'XXXLARGE', label: '3X-Large' },
  { match: '4XLARGE', token: 'X4LARGE', label: '4X-Large' },
  { match: '5XLARGE', token: 'X5LARGE', label: '5X-Large' },
  { match: '6XLARGE', token: 'X6LARGE', label: '6X-Large' },
];

function sizeIndex(size: string | undefined): number {
  const norm = String(size ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return SIZE_LADDER.findIndex((s) => s.match === norm);
}

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function WarehouseCtaGroup() {
  const [list, setList] = useState<WhListState>({ status: 'loading' });

  const load = useCallback(async () => {
    try {
      const res = await apiClient.get(WH_API, { timeout: 60_000 });
      const payload = (res.data?.data ?? res.data) as { items?: WarehouseRow[] };
      setList({ status: 'ready', items: Array.isArray(payload?.items) ? payload.items : [] });
    } catch (e) {
      if (axios.isAxiosError(e)) {
        const st = e.response?.status;
        if (st === 401 || st === 403) {
          setList({ status: 'gated', reason: getApiErrorMessage(e) });
          return;
        }
        if (st === 404 || st === 501) {
          setList({ status: 'absent' });
          return;
        }
      }
      setList({ status: 'error', reason: getApiErrorMessage(e) });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const header = (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <Timer className="h-3.5 w-3.5" aria-hidden />
        Warehouse lifecycle actions
      </h3>
      <SourceChip>live SHOW WAREHOUSES</SourceChip>
    </div>
  );

  const shell = (children: ReactNode) => (
    <section
      data-testid="finops-cta-group"
      aria-label="Warehouse lifecycle actions"
      className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/40"
    >
      {header}
      {children}
    </section>
  );

  if (list.status === 'loading') {
    return shell(
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>,
    );
  }
  if (list.status === 'absent') {
    return shell(
      <p data-testid="finops-cta-gate" className="text-[11px] text-slate-400">
        The warehouse lifecycle API (/api/administration/warehouses) is not
        deployed on this backend — no actions offered.
      </p>,
    );
  }
  if (list.status === 'gated') {
    return shell(
      <p data-testid="finops-cta-gate" className="text-[11px] text-amber-600 dark:text-amber-400">
        Warehouse lifecycle requires an account-admin role — {list.reason}
      </p>,
    );
  }
  if (list.status === 'error') {
    return shell(
      <div className="flex items-center justify-between gap-2">
        <p data-testid="finops-cta-gate" className="text-[11px] text-red-600 dark:text-red-400">
          Could not list warehouses — {list.reason}
        </p>
        <button
          type="button"
          onClick={() => {
            setList({ status: 'loading' });
            void load();
          }}
          className="rounded-md border border-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          Retry
        </button>
      </div>,
    );
  }

  const items = list.items;
  const started = items.filter((w) => String(w.state ?? '').toUpperCase() === 'STARTED');

  // Candidate 1 — suspend: a STARTED warehouse with nothing running/queued.
  const suspendTarget = started.find((w) => num(w.running) === 0 && num(w.queued) === 0);
  // Candidate 2 — auto-suspend 60s: disabled (null/0) or above the 600s best practice.
  const autoSuspendTarget = items.find(
    (w) => w.auto_suspend == null || num(w.auto_suspend) === 0 || num(w.auto_suspend) > 600,
  );
  // Candidate 3 — resize down: the LARGEST above-XSMALL warehouse with 0 running.
  const resizeTarget = items
    .filter((w) => sizeIndex(w.size) > 0 && num(w.running) === 0)
    .sort((a, b) => sizeIndex(b.size) - sizeIndex(a.size))[0];
  const resizeDown = resizeTarget ? SIZE_LADDER[sizeIndex(resizeTarget.size) - 1] : undefined;

  const ctas: ReactNode[] = [];
  if (suspendTarget) {
    ctas.push(
      <div
        key="suspend"
        data-testid="finops-cta-suspend"
        className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900"
      >
        <InsightActionButton
          label={`Suspend ${suspendTarget.name}`}
          icon={PauseCircle}
          successToast={`Warehouse ${suspendTarget.name} suspended`}
          confirm={{
            title: `Suspend warehouse ${suspendTarget.name}?`,
            body: 'Running queries are allowed to finish; new queries will auto-resume it only if AUTO_RESUME is on.',
            variant: 'warning',
          }}
          onAction={() =>
            apiClient.post(`${WH_API}/${encodeURIComponent(suspendTarget.name)}/suspend`, {}, { timeout: 60_000 })
          }
          onDone={() => void load()}
        />
        <p data-testid="cta-why" className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
          STARTED with {num(suspendTarget.running)} running / {num(suspendTarget.queued)} queued
          queries — an idle warehouse burns credits until suspended.
        </p>
      </div>,
    );
  }
  if (autoSuspendTarget) {
    const s = autoSuspendTarget.auto_suspend;
    ctas.push(
      <div
        key="auto-suspend"
        data-testid="finops-cta-autosuspend"
        className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900"
      >
        <InsightActionButton
          label={`Set auto-suspend 60s on ${autoSuspendTarget.name}`}
          icon={Timer}
          successToast={`Auto-suspend set to 60s on ${autoSuspendTarget.name}`}
          onAction={() =>
            apiClient.patch(
              `${WH_API}/${encodeURIComponent(autoSuspendTarget.name)}/auto-suspend`,
              { seconds: 60 },
              { timeout: 60_000 },
            )
          }
          onDone={() => void load()}
        />
        <p data-testid="cta-why" className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
          {s == null || num(s) === 0
            ? 'Auto-suspend is disabled — this warehouse never suspends itself.'
            : `auto_suspend ${num(s)}s (> 600s best practice) — 60s stops idle burn right after each query burst.`}
        </p>
      </div>,
    );
  }
  if (resizeTarget && resizeDown) {
    ctas.push(
      <div
        key="resize"
        data-testid="finops-cta-resize"
        className="flex flex-col gap-1 rounded-lg border border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900"
      >
        <InsightActionButton
          label={`Resize ${resizeTarget.name} to ${resizeDown.label}`}
          icon={Scale}
          successToast={`Warehouse ${resizeTarget.name} resized to ${resizeDown.label}`}
          confirm={{
            title: `Resize ${resizeTarget.name} to ${resizeDown.label}?`,
            body: `Currently ${resizeTarget.size ?? 'unknown size'} with 0 queries running. Resizing down halves the credit rate; resize back up if queues appear.`,
          }}
          onAction={() =>
            apiClient.post(
              `${WH_API}/${encodeURIComponent(resizeTarget.name)}/resize`,
              { size: resizeDown.token },
              { timeout: 60_000 },
            )
          }
          onDone={() => void load()}
        />
        <p data-testid="cta-why" className="text-[11px] leading-snug text-slate-500 dark:text-slate-400">
          {resizeTarget.size} with {num(resizeTarget.running)} queries running now — one size down
          ({resizeDown.label}) costs half the credits per hour.
        </p>
      </div>,
    );
  }

  return shell(
    ctas.length === 0 ? (
      <p data-testid="finops-cta-empty" className="text-[11px] text-slate-500 dark:text-slate-400">
        {items.length} warehouse{items.length === 1 ? '' : 's'} listed — none needs a lifecycle
        action right now (all suspended or auto-suspend ≤ 600s).
      </p>
    ) : (
      <>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">{ctas.slice(0, 4)}</div>
        <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
          {items.length} warehouses · {started.length} started — actions run as your role
          (Snowflake RBAC applies; failures surface inline).
        </p>
      </>
    ),
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// 3 · SecurityCtaGroup (Security tab CTA group)
// ─────────────────────────────────────────────────────────────────────────────

export function SecurityCtaGroup({ data }: { data: SecurityOverviewResponse | null }) {
  const mfa =
    data?.mfa_coverage && typeof data.mfa_coverage === 'object' && !Array.isArray(data.mfa_coverage)
      ? data.mfa_coverage
      : null;
  const totalUsers = mfa ? num(mfa.total_users) : null;
  const mfaEnabled = mfa ? num(mfa.mfa_enabled) : null;
  const usersWithoutMfa =
    totalUsers != null && mfaEnabled != null ? Math.max(0, totalUsers - mfaEnabled) : null;
  const mfaPct = mfa?.mfa_percentage != null ? num(mfa.mfa_percentage) : null;

  return (
    <section
      data-testid="security-cta-group"
      aria-label="Security best-practice actions"
      className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900/40"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Best-practice actions
        </h3>
        <SourceChip>LOGIN_HISTORY / USERS · grants API</SourceChip>
      </div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
        <DeepLinkCta
          testid="security-cta-grants"
          label="Review orphan grants"
          href="/governance/grants"
          icon={ShieldCheck}
          tone="amber"
          why="Audit who holds which role and object grants on the governance grants page — revoke anything no active user needs."
          source="governance grants"
        />
        {usersWithoutMfa != null ? (
          usersWithoutMfa > 0 ? (
            <DeepLinkCta
              testid="security-cta-mfa"
              label={`Require MFA for ${usersWithoutMfa} user${usersWithoutMfa === 1 ? '' : 's'}`}
              href="/governance/users"
              icon={Lock}
              tone="red"
              why={`${usersWithoutMfa} of ${totalUsers} users sign in without MFA${
                mfaPct != null ? ` (coverage ${mfaPct}%)` : ''
              } — enforce it per user on the governance users page.`}
              source="USERS · mfa_coverage"
            />
          ) : (
            <div
              data-testid="security-cta-mfa"
              className="flex flex-col justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5 dark:border-emerald-900/40 dark:bg-emerald-900/10"
            >
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                MFA coverage complete
              </span>
              <p data-testid="cta-why" className="text-[11px] text-emerald-700/80 dark:text-emerald-300/80">
                All {totalUsers} users have MFA enabled — nothing to enforce.
              </p>
            </div>
          )
        ) : (
          <div
            data-testid="security-cta-mfa"
            className="flex flex-col justify-center gap-1 rounded-lg border border-dashed border-slate-300 p-2.5 dark:border-slate-700"
          >
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
              <HelpCircle className="h-3.5 w-3.5 text-amber-500" aria-hidden />
              MFA enforcement — source unavailable
            </span>
            <p data-testid="cta-why" className="text-[11px] text-slate-400">
              mfa_coverage (USERS / LOGIN_HISTORY) did not load for this window, so the affected
              user count can&apos;t be shown honestly.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
