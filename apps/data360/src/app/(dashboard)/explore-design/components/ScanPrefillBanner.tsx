'use client';

// ScanPrefillBanner — the Account-Overview AI advisor deep-links here with
// `?intent=model&from=scan`. Instead of dropping the user on empty selectors,
// this banner reads the already-scanned objects (GET /command-center/
// object-enrichment, via the existing getObjectEnrichment getter), ranks them
// by real usage, and renders a READY AI-suggested data product — named,
// sourced, and one click from the AI-guided modeling wizard.
//
// Honest data: object-enrichment returns 200 + `degraded:true` on non-Enterprise
// editions (usage/cost columns null) or on request failure (empty rows). We
// distinguish the two: empty → "couldn't load" note; rows-present-but-null →
// suggest by FQN and render "—" for missing usage, never a fabricated 0.
// Copy stays vendor-neutral (no warehouse brand names) — it's customer-facing.

import React, { useEffect, useMemo, useState } from 'react';
import { Sparkles, Loader2, X, ArrowRight, Boxes, Database, Eye } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getObjectEnrichment, type ObjectEnrichmentRow } from '@/app/services/command-center';
import type { TableRef } from '@/app/services/api/types';

export interface ScanSuggestion {
  /** AI-suggested data product name, derived from the most-active source. */
  name: string;
  /** "Materialized analytics mart" | "Curated view" — inferred from usage. */
  modelType: string;
  /** Suggested source tables (1–3), passed straight into the wizard. */
  sources: TableRef[];
  /** Display FQNs for the sources. */
  fqns: string[];
  /** Schema the suggestion is anchored on. */
  anchorSchema: string;
  /** Sum of access_count across sources — null when usage is unavailable. */
  totalAccess: number | null;
  /** Peak distinct users across sources — null when unavailable. */
  totalUsers: number | null;
  /** Plain-English description seeded into the AI wizard. */
  seed: string;
  /** True when usage/cost columns are unavailable on this edition. */
  degraded: boolean;
}

interface ScanPrefillBannerProps {
  /** Whether a project is currently selected (the wizard requires one). */
  hasProject: boolean;
  /** Viewer role — read-only users can't create, so the CTA is suppressed. */
  isReadOnly?: boolean;
  /** Fired on the one-click CTA. Page seeds + opens the AI-guided wizard. */
  onApply: (suggestion: ScanSuggestion) => void;
}

const fqn = (r: ObjectEnrichmentRow) => `${r.database_name}.${r.schema_name}.${r.table_name}`;

function titleize(s: string): string {
  return s
    .toLowerCase()
    .split(/[_\s.]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const GENERIC_SCHEMAS = new Set(['PUBLIC', 'INFORMATION_SCHEMA']);

/** Rank scanned objects by real usage and assemble one AI-suggested product. */
function buildSuggestion(rows: ObjectEnrichmentRow[], degraded: boolean): ScanSuggestion | null {
  const valid = rows.filter((r) => r.database_name && r.schema_name && r.table_name);
  if (valid.length === 0) return null;

  // Most-used first (usage = analytics value); attributed compute breaks ties.
  const sorted = [...valid].sort((a, b) => {
    const au = a.access_count ?? -1;
    const bu = b.access_count ?? -1;
    if (bu !== au) return bu - au;
    return (b.attributed_usd ?? 0) - (a.attributed_usd ?? 0);
  });

  const anchor = sorted[0];
  // Prefer co-located sources so the suggested model is a coherent mini-mart.
  const sameSchema = sorted.filter(
    (r) => r.database_name === anchor.database_name && r.schema_name === anchor.schema_name,
  );
  const picked = (sameSchema.length >= 1 ? sameSchema : sorted).slice(0, 3);

  const sources: TableRef[] = picked.map((r) => ({
    database: r.database_name,
    schema: r.schema_name,
    table: r.table_name,
  }));
  const fqns = picked.map(fqn);

  // Honest aggregates — null when every contributing value is null.
  const accessVals = picked.map((r) => r.access_count).filter((v): v is number => v != null);
  const totalAccess = accessVals.length > 0 ? accessVals.reduce((s, v) => s + v, 0) : null;
  const userVals = picked.map((r) => r.distinct_users).filter((v): v is number => v != null);
  const totalUsers = userVals.length > 0 ? Math.max(...userVals) : null;

  const base = GENERIC_SCHEMAS.has(anchor.schema_name.toUpperCase())
    ? anchor.table_name
    : anchor.schema_name;
  const name = `${titleize(base)} Mart`;

  const modelType = totalAccess != null && totalAccess >= 50
    ? 'Materialized analytics mart'
    : 'Curated view';

  const usagePart = totalAccess != null
    ? ` (${totalAccess.toLocaleString()} queries${totalUsers != null ? ` by ${totalUsers} users` : ''} in the last 90 days)`
    : '';
  const seed =
    `Build a ${modelType.toLowerCase()} named "${name}" from ${fqns.join(', ')} — ` +
    `the most-active sources detected in your data scan${usagePart}. ` +
    `Connect these sources, let AI detect the schema, then review and approve.`;

  return { name, modelType, sources, fqns, anchorSchema: anchor.schema_name, totalAccess, totalUsers, seed, degraded };
}

const ScanPrefillBanner: React.FC<ScanPrefillBannerProps> = ({ hasProject, isReadOnly, onApply }) => {
  const [status, setStatus] = useState<'loading' | 'ready' | 'empty'>('loading');
  const [rows, setRows] = useState<ObjectEnrichmentRow[]>([]);
  const [degraded, setDegraded] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    getObjectEnrichment(90, 3.0)
      .then((res) => {
        if (!active) return;
        const data = Array.isArray(res.data) ? res.data : [];
        setRows(data);
        setDegraded(!!res.degraded);
        setStatus(data.length > 0 ? 'ready' : 'empty');
      })
      .catch(() => {
        if (!active) return;
        setRows([]);
        setStatus('empty');
      });
    return () => {
      active = false;
    };
  }, []);

  const suggestion = useMemo(
    () => (status === 'ready' ? buildSuggestion(rows, degraded) : null),
    [status, rows, degraded],
  );

  if (dismissed) return null;

  // ── Loading skeleton ──
  if (status === 'loading') {
    return (
      <div className="flex items-center gap-3 border-b border-indigo-200 bg-gradient-to-r from-indigo-50 to-violet-50 px-4 py-3 dark:border-indigo-900/50 dark:from-indigo-950/30 dark:to-violet-950/20">
        <Loader2 className="h-4 w-4 animate-spin text-indigo-500" />
        <p className="text-xs font-medium text-indigo-700 dark:text-indigo-300">
          Reading your scanned objects to prepare an AI-suggested data product…
        </p>
      </div>
    );
  }

  // ── Empty / load-failed — honest dead-end note, manual path still available ──
  if (status === 'empty' || !suggestion) {
    return (
      <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5 dark:border-slate-800 dark:bg-slate-900/40">
        <Sparkles className="h-4 w-4 shrink-0 text-slate-400" />
        <p className="flex-1 text-xs text-slate-600 dark:text-slate-400">
          No scanned objects were available to pre-fill an AI suggestion. You can still start a model
          manually with the AI button above.
        </p>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="rounded p-1 text-slate-400 hover:bg-slate-200/60 hover:text-slate-600 dark:hover:bg-slate-700"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  // ── Ready suggestion ──
  return (
    <div className="border-b border-indigo-200 bg-gradient-to-r from-indigo-50 via-violet-50 to-fuchsia-50 px-4 py-3 dark:border-indigo-900/50 dark:from-indigo-950/40 dark:via-violet-950/30 dark:to-fuchsia-950/20">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-600 to-fuchsia-600 text-white shadow-sm">
          <Sparkles className="h-4 w-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">
              AI-suggested from your scan
            </span>
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300">
              {suggestion.modelType}
            </span>
          </div>
          <p className="mt-0.5 truncate text-sm font-semibold text-slate-900 dark:text-white">
            <Boxes className="mr-1 inline h-3.5 w-3.5 text-indigo-500 align-[-2px]" />
            {suggestion.name}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {suggestion.fqns.map((f) => (
              <span
                key={f}
                title={f}
                className="inline-flex max-w-[260px] items-center gap-1 truncate rounded border border-slate-200 bg-white/70 px-1.5 py-0.5 text-[10px] font-mono text-slate-600 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-300"
              >
                <Database className="h-3 w-3 shrink-0 text-slate-400" />
                {f}
              </span>
            ))}
            <span className="text-[10px] text-slate-500 dark:text-slate-400">
              {suggestion.totalAccess != null
                ? `${suggestion.totalAccess.toLocaleString()} queries · ${suggestion.totalUsers != null ? suggestion.totalUsers : '—'} users (90d)`
                : 'usage unavailable on this edition — suggested by source'}
            </span>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {isReadOnly ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
              <Eye className="h-3 w-3" /> View only
            </span>
          ) : (
            <button
              type="button"
              onClick={() => onApply(suggestion)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors',
                'bg-gradient-to-r from-indigo-600 to-fuchsia-600 hover:from-indigo-700 hover:to-fuchsia-700',
              )}
            >
              <Sparkles className="h-3.5 w-3.5" />
              {hasProject ? 'Create with AI' : 'Select a project & create'}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss suggestion"
            className="rounded p-1 text-indigo-400 hover:bg-indigo-100/60 hover:text-indigo-600 dark:hover:bg-indigo-900/40"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ScanPrefillBanner;
