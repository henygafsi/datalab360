'use client';

/**
 * CatalogDetailDrawer — DOCKED right-side 360 summary for a selected catalog
 * item (never a popup, per the zero-popup contract). Product details come from
 * the WIRED /catalog/products/{id}/overview + /kpis; sources render their
 * inventory facts. Every feeder degrades honestly.
 */

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { getApiErrorMessage } from '@/lib/api-client';
import { isUnavailable } from '@/lib/http-status';
import {
  getCatalogProductKpis,
  getCatalogProductOverview,
} from '@/app/services/catalog';
import type { CatalogItem } from './useExploreCatalog';

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-2 py-1">
      <dt className="shrink-0 text-[11px] text-slate-400 dark:text-slate-500">{label}</dt>
      <dd className="min-w-0 break-all text-right text-[11px] text-slate-700 dark:text-slate-200">
        {value ?? '—'}
      </dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
        {title}
      </h4>
      {children}
    </section>
  );
}

function fmtScore(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : String(Math.round(v));
}

function scoreClass(v: number | null | undefined): string {
  if (v === null || v === undefined) return '';
  if (v >= 70) return 'font-semibold text-emerald-600 dark:text-emerald-400';
  if (v >= 40) return 'font-semibold text-amber-600 dark:text-amber-400';
  return 'font-semibold text-red-600 dark:text-red-400';
}

function ScoreValue({ value }: { value: number | null | undefined }) {
  return <span className={scoreClass(value)}>{fmtScore(value)}</span>;
}

function TagChips({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return <span className="text-[11px] text-slate-400 dark:text-slate-500">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span
          key={t}
          className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] text-slate-500 dark:bg-slate-700/70 dark:text-slate-300"
        >
          {t}
        </span>
      ))}
    </div>
  );
}

export default function CatalogDetailDrawer({
  item,
  onClose,
}: {
  item: CatalogItem;
  onClose: () => void;
}) {
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [kpis, setKpis] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  const productId = item.product?.product_id ?? null;

  useEffect(() => {
    setOverview(null);
    setKpis(null);
    setError(null);
    setUnavailable(false);
    if (!productId) return;

    let cancelled = false;
    setLoading(true);
    void Promise.allSettled([
      getCatalogProductOverview(productId),
      getCatalogProductKpis(productId),
    ]).then(([o, k]) => {
      if (cancelled) return;
      if (o.status === 'fulfilled') setOverview(o.value ?? null);
      else if (isUnavailable(o.reason)) setUnavailable(true);
      else setError(getApiErrorMessage(o.reason));
      if (k.status === 'fulfilled') setKpis(k.value ?? null);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [productId]);

  const p = item.product;
  const s = item.source;
  const kpiList = Array.isArray((kpis as { kpis?: unknown[] } | null)?.kpis)
    ? ((kpis as { kpis: Array<Record<string, unknown>> }).kpis)
    : [];
  const description =
    (overview as { description?: string } | null)?.description ?? null;

  return (
    <aside
      aria-label={`${item.name} details`}
      className="flex h-full w-full flex-col rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-800/60"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-700/60">
        <h3 className="truncate text-xs font-semibold text-slate-800 dark:text-slate-100">
          {item.name}
        </h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {item.kind === 'product' && p ? (
          <div className="space-y-3">
            <Section title="Identity">
              <dl className="divide-y divide-slate-100 dark:divide-slate-700/60">
                <Row label="Name" value={p.name || '—'} />
                <Row label="Product ID" value={p.product_id || '—'} />
                <Row label="Domain" value={p.domain || '—'} />
                <Row label="Status" value={p.status || '—'} />
                <Row label="Owner" value={p.owner || '—'} />
              </dl>
            </Section>

            <Section title="Scores">
              <dl className="divide-y divide-slate-100 dark:divide-slate-700/60">
                <Row label="Quality" value={<ScoreValue value={p.quality_score} />} />
                <Row label="Trust" value={<ScoreValue value={p.trust_score} />} />
                <Row label="Governance" value={<ScoreValue value={p.governance_score} />} />
                <Row label="FinOps" value={<ScoreValue value={p.finops_score} />} />
                <Row label="ROI" value={<ScoreValue value={p.roi_score} />} />
              </dl>
            </Section>

            <Section title="Inventory">
              <dl className="divide-y divide-slate-100 dark:divide-slate-700/60">
                <Row label="Sources" value={p.source_count ?? '—'} />
                <Row label="Models" value={p.model_count ?? '—'} />
                <Row label="KPIs" value={p.kpi_count ?? '—'} />
                <Row label="Dashboards" value={p.dashboard_count ?? '—'} />
              </dl>
            </Section>

            <Section title="Tags">
              <TagChips tags={item.tags} />
            </Section>

            {loading ? (
              <div className="space-y-2" aria-hidden="true">
                <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-700/60" />
                <div className="h-4 animate-pulse rounded bg-slate-100 dark:bg-slate-700/60" />
              </div>
            ) : unavailable ? (
              <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-500 dark:border-slate-600 dark:bg-slate-800/40 dark:text-slate-400">
                The product 360 overview is not available yet on this environment.
              </p>
            ) : error ? (
              <p className="text-[11px] text-red-600 dark:text-red-400">{error}</p>
            ) : (
              <>
                {description && (
                  <p className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-300">
                    {description}
                  </p>
                )}
                {kpiList.length > 0 && (
                  <div>
                    <h4 className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                      KPIs
                    </h4>
                    <ul className="space-y-1">
                      {kpiList.slice(0, 8).map((k, i) => (
                        <li
                          key={i}
                          className="truncate rounded bg-slate-50 px-2 py-1 text-[11px] text-slate-600 dark:bg-slate-900/40 dark:text-slate-300"
                        >
                          {String(k.name ?? k.kpi_id ?? 'KPI')}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <Section title="Identity">
              <dl className="divide-y divide-slate-100 dark:divide-slate-700/60">
                <Row label="Name" value={s?.name || item.name || '—'} />
                <Row label="Type" value={s?.type || '—'} />
                <Row label="Database" value={s?.database || '—'} />
              </dl>
            </Section>

            <Section title="Inventory">
              <dl className="divide-y divide-slate-100 dark:divide-slate-700/60">
                <Row label="Schemas" value={s?.schema_count ?? '—'} />
                <Row label="Tables" value={s?.table_count ?? '—'} />
              </dl>
            </Section>

            <Section title="Tags">
              <TagChips tags={item.tags} />
            </Section>

            <p className="text-[11px] text-slate-400 dark:text-slate-500">
              Source-type tags are stored locally for now — a shared tag write is
              not available yet on this environment.
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}
