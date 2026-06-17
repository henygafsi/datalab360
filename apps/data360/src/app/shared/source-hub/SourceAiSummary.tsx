'use client';

/**
 * SourceAiSummary — an EPHEMERAL, per-view natural-language summary of a data
 * source / schema / table.
 *
 * Given a descriptor (+ optional governance / lineage / profile context), it
 * asks the AI completion service for a short plain-language brief covering four
 * things: what this source is, its key entities, quality/governance signals,
 * and a suggested next action. The result is held only in local state — it is
 * regenerated when the descriptor changes or the user hits Refresh, and is
 * never persisted or cached. Drop it into any source-detail view / right panel.
 *
 * Brand rule (house policy): no vendor or product names ever reach the user.
 *   1. The prompt instructs the model to use neutral terms only.
 *   2. A post-process sanitizer scrubs the model output as a hard safety net,
 *      because the prompt alone is not a guarantee.
 *
 * The AI never throws to the user: any failure (4xx/5xx/network/parse) degrades
 * to a quiet "summary unavailable" note — never a raw error or stack trace.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Sparkles, RefreshCw, Loader2, Info } from 'lucide-react';
import {
  generateCompletion,
  type LLMModel,
} from '@/app/services/cortex/ml-features';

// ============================================================================
// Public types
// ============================================================================

export type SourceKind = 'source' | 'schema' | 'table' | 'view' | 'dataset' | 'column';

/** What is being summarised — the subject of the brief. */
export interface SourceDescriptor {
  /** The granularity of the subject. Defaults to 'table' when omitted. */
  kind?: SourceKind;
  /** Display name of the object (e.g. table name). */
  name: string;
  /** Optional database / catalog the object lives in. */
  database?: string;
  /** Optional schema the object lives in. */
  schema?: string;
  /** Fully-qualified name, if the caller has one (overrides db.schema.name). */
  fullName?: string;
  /** Free-text description, if curated. */
  description?: string;
  /** Owner / steward, if known. */
  owner?: string;
  /** Approximate row count (tables). */
  rowCount?: number;
  /** Column count (tables). */
  columnCount?: number;
  /** Size on disk, in bytes. */
  sizeBytes?: number;
  /** Business / catalog tags. */
  tags?: string[];
  /** Key columns or child entities (column names for a table, table names for a schema). */
  entities?: string[];
}

/** Optional governance signals to ground the summary. */
export interface GovernanceContext {
  /** Sensitivity classification, e.g. 'Confidential', 'Public'. */
  classification?: string;
  /** Column names known to hold sensitive / PII data. */
  sensitiveColumns?: string[];
  /** Column names currently protected by a masking policy. */
  maskedColumns?: string[];
  /** Names of access / row-access policies applied. */
  policies?: string[];
}

/** Optional lineage signals. */
export interface LineageContext {
  /** Upstream sources this object derives from. */
  upstream?: string[];
  /** Downstream consumers that depend on this object. */
  downstream?: string[];
}

/** Optional data-quality / profiling signals. */
export interface ProfileContext {
  /** 0–100 composite quality score. */
  qualityScore?: number;
  /** Percentage of null values across profiled columns. */
  nullRatePct?: number;
  /** Percentage of duplicate rows. */
  duplicateRatePct?: number;
  /** Human freshness label, e.g. 'updated 2h ago'. */
  freshness?: string;
  /** Notable quality issues already detected. */
  issues?: string[];
}

export interface SourceAiSummaryProps {
  /** The subject of the summary. Required. */
  descriptor: SourceDescriptor;
  /** Optional governance grounding. */
  governance?: GovernanceContext;
  /** Optional lineage grounding. */
  lineage?: LineageContext;
  /** Optional data-quality grounding. */
  profile?: ProfileContext;
  /** Completion model to use. Defaults to the fast model. */
  model?: LLMModel;
  /** Generate automatically on mount / when the descriptor changes. Default true. */
  autoRun?: boolean;
  /** Optional heading shown above the summary. */
  title?: string;
  /** Extra classes for the outer wrapper. */
  className?: string;
}

// ============================================================================
// Brand-neutral prompt + output sanitizer
// ============================================================================

/**
 * Hard safety net: scrub any vendor / product name the model might echo back,
 * replacing it with a neutral term. Case-insensitive, word-boundary matched.
 * This — not the prompt — is the guarantee that no vendor name reaches the user.
 */
const BRAND_SCRUB: Array<[RegExp, string]> = [
  [/\bsnowflake\b/gi, 'data warehouse'],
  [/\bcortex\b/gi, 'AI'],
  [/\bkimi\b/gi, 'AI'],
];

export function sanitizeBrand(text: string): string {
  return BRAND_SCRUB.reduce((acc, [re, replacement]) => acc.replace(re, replacement), text);
}

function fmtBytes(bytes?: number): string | null {
  if (bytes == null) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function qualifiedName(d: SourceDescriptor): string {
  if (d.fullName) return d.fullName;
  return [d.database, d.schema, d.name].filter(Boolean).join('.');
}

/** "key entities" means different things per kind — make the ask concrete. */
function entityLabel(kind: SourceKind): string {
  switch (kind) {
    case 'schema':
      return 'key tables';
    case 'source':
    case 'dataset':
      return 'key datasets/tables';
    case 'column':
      return 'related fields';
    default:
      return 'key columns/fields';
  }
}

/**
 * Build the completion prompt. Brand-neutral by construction: it instructs the
 * model to use neutral terms and never names a vendor itself.
 */
export function buildSummaryPrompt(
  descriptor: SourceDescriptor,
  governance?: GovernanceContext,
  lineage?: LineageContext,
  profile?: ProfileContext,
): string {
  const kind = descriptor.kind ?? 'table';
  const lines: string[] = [];

  lines.push(`SUBJECT (${kind}): ${qualifiedName(descriptor)}`);
  if (descriptor.description) lines.push(`Description: ${descriptor.description.slice(0, 300)}`);
  if (descriptor.owner) lines.push(`Owner/steward: ${descriptor.owner}`);

  const stats: string[] = [];
  if (descriptor.rowCount != null) stats.push(`${descriptor.rowCount.toLocaleString()} rows`);
  if (descriptor.columnCount != null) stats.push(`${descriptor.columnCount} columns`);
  const size = fmtBytes(descriptor.sizeBytes);
  if (size) stats.push(size);
  if (stats.length) lines.push(`Stats: ${stats.join(', ')}`);

  if (descriptor.entities?.length) {
    lines.push(`${entityLabel(kind)}: ${descriptor.entities.slice(0, 25).join(', ')}`);
  }
  if (descriptor.tags?.length) lines.push(`Tags: ${descriptor.tags.slice(0, 15).join(', ')}`);

  if (governance) {
    const g: string[] = [];
    if (governance.classification) g.push(`classification ${governance.classification}`);
    if (governance.sensitiveColumns?.length) g.push(`sensitive fields: ${governance.sensitiveColumns.slice(0, 12).join(', ')}`);
    if (governance.maskedColumns?.length) g.push(`masked fields: ${governance.maskedColumns.slice(0, 12).join(', ')}`);
    if (governance.policies?.length) g.push(`policies: ${governance.policies.slice(0, 10).join(', ')}`);
    if (g.length) lines.push(`Governance: ${g.join('; ')}`);
  }

  if (lineage) {
    const l: string[] = [];
    if (lineage.upstream?.length) l.push(`upstream: ${lineage.upstream.slice(0, 12).join(', ')}`);
    if (lineage.downstream?.length) l.push(`downstream consumers: ${lineage.downstream.slice(0, 12).join(', ')}`);
    if (l.length) lines.push(`Lineage: ${l.join('; ')}`);
  }

  if (profile) {
    const p: string[] = [];
    if (profile.qualityScore != null) p.push(`quality score ${profile.qualityScore}/100`);
    if (profile.nullRatePct != null) p.push(`${profile.nullRatePct}% nulls`);
    if (profile.duplicateRatePct != null) p.push(`${profile.duplicateRatePct}% duplicates`);
    if (profile.freshness) p.push(`freshness: ${profile.freshness}`);
    if (profile.issues?.length) p.push(`issues: ${profile.issues.slice(0, 8).join(', ')}`);
    if (p.length) lines.push(`Data quality: ${p.join('; ')}`);
  }

  return `You are a data catalog assistant. Write a concise brief (max ~90 words) for a data team about the ${kind} below.

Cover, in this order, as flowing prose (no headings, no bullets, no JSON):
1. What this ${kind} is, in plain business language.
2. Its ${entityLabel(kind)}.
3. Quality and governance signals worth noting (only if present in the facts).
4. One concrete suggested next action.

Rules:
- Use ONLY the facts below. Do not invent column names, owners, or metrics that are not given. If a fact is absent, omit it rather than guessing.
- Use neutral, vendor-agnostic terms only: say "AI", "data warehouse", or "analytics engine". Never name any vendor, product, or model.
- Be specific and useful, not generic. No preamble like "This summary".

FACTS:
${lines.join('\n')}`;
}

// ============================================================================
// Stable serialization key — keep the auto-run effect off object identity.
// ============================================================================

/**
 * Callers pass object literals, so depending on the objects themselves would
 * re-fire the LLM call on every parent render. Depend on a serialized key of
 * the fields we actually read instead.
 */
function summaryKey(props: SourceAiSummaryProps): string {
  return JSON.stringify([
    props.descriptor,
    props.governance ?? null,
    props.lineage ?? null,
    props.profile ?? null,
    props.model ?? null,
  ]);
}

// ============================================================================
// Component
// ============================================================================

type Status = 'idle' | 'loading' | 'ready' | 'error';

export default function SourceAiSummary({
  descriptor,
  governance,
  lineage,
  profile,
  model = 'mistral-7b',
  autoRun = true,
  title = 'AI summary',
  className = '',
}: SourceAiSummaryProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [summary, setSummary] = useState<string>('');

  // Monotonic token: a slow earlier call must not clobber a newer one.
  const runToken = useRef(0);

  // Stable dependency key — avoids re-running on every render from new object refs.
  const key = summaryKey({ descriptor, governance, lineage, profile, model, autoRun, title, className });

  const run = useCallback(async () => {
    const token = ++runToken.current;
    setStatus('loading');
    try {
      const prompt = buildSummaryPrompt(descriptor, governance, lineage, profile);
      const completion = await generateCompletion({ prompt, model });
      if (token !== runToken.current) return; // a newer run superseded this one
      const text = sanitizeBrand((completion.response ?? '').trim());
      if (!text) {
        setStatus('error');
        return;
      }
      setSummary(text);
      setStatus('ready');
    } catch (err) {
      // The service throws on 4xx/5xx/network — never surface it. Soft-degrade.
      // eslint-disable-next-line no-console
      console.error('SourceAiSummary generation failed:', err);
      if (token !== runToken.current) return;
      setStatus('error');
    }
    // descriptor/governance/lineage/profile are captured via `key` below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, model]);

  useEffect(() => {
    if (!autoRun) return;
    void run();
    // Invalidate any in-flight run when the subject changes / on unmount.
    return () => {
      runToken.current++;
    };
  }, [autoRun, run]);

  const busy = status === 'loading';

  return (
    <section
      className={`rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-900/40 ${className}`}
      aria-busy={busy}
    >
      {/* Header */}
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-fuchsia-500" aria-hidden />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{title}</h3>
        </div>
        <button
          type="button"
          onClick={() => void run()}
          disabled={busy}
          aria-label="Regenerate summary"
          title="Regenerate summary"
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} aria-hidden />
          Refresh
        </button>
      </div>

      {/* Body */}
      {status === 'loading' && (
        <div className="flex items-center gap-2 py-2 text-sm text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          <span>Generating summary…</span>
        </div>
      )}

      {status === 'ready' && (
        <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700 dark:text-slate-200">
          {summary}
        </p>
      )}

      {status === 'error' && (
        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-400">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            Summary unavailable right now. You can try again with Refresh — the rest of this view is unaffected.
          </span>
        </div>
      )}

      {status === 'idle' && (
        <button
          type="button"
          onClick={() => void run()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          Generate summary
        </button>
      )}

      {(status === 'ready' || status === 'error') && (
        <p className="mt-2 text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">
          AI-generated · for guidance only
        </p>
      )}
    </section>
  );
}
