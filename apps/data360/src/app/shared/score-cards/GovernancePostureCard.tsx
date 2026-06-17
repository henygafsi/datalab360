'use client';

/**
 * GovernancePostureCard — ONE shared governance-posture card (Data360 T2 §4a).
 *
 * Kills the rendering duplication that had grown across five surfaces, each of
 * which hand-rolled the same governance read:
 *   - sources/ObjectSmartPanel        (Governance section — TableGovernance shape)
 *   - data-products/Object360Panel    (GovernanceTab — ObjectGovernance shape)
 *   - data-quality/SmartRightBar      (Governance section — classification tags)
 *   - explore-design/ContextRightBar  (PoliciesCard — PII posture)
 *   - administration/AccessInspector  (Policies & posture — PostureRow shape)
 *
 * It accepts the UNION of those payloads via `data` and normalizes them — by
 * FIELD PROVENANCE, never by magnitude — into one canonical model, then renders:
 *   • a 2×2 count grid  → Gov score · Sensitive · Masked · Unprotected
 *   • tag chips         → classification / governance tags
 *   • a policy list     → masking + row-access (RLS) policies, merged
 *   • RED pills         → unmasked-PII columns (rose = NONE, amber = PARTIAL,
 *                         emerald = OK) — only when a per-column array exists
 *   • a supplementary module-posture block (granted roles · features · bound
 *     policies) when those fields are present (AccessInspector facet)
 *
 * Honesty rules (no fake data):
 *   - a missing number renders as "—" (via shared `dash`), NEVER a fabricated 0
 *   - RED pills require the per-column `pii_columns[]` array; with count-only
 *     payloads (ObjectGovernance) the grid renders WITHOUT pills, never invented
 *   - on the self-fetch path a 404/501 (route not deployed) hides the card
 *     entirely rather than showing a permanent broken state
 *
 * Sourcing — three mutually-exclusive props (precedence: data → objectRef → projectId):
 *   <GovernancePostureCard data={gov} />                     // pre-fetched (kills dup today)
 *   <GovernancePostureCard objectRef="DB.SCHEMA.TABLE" />    // self-fetch object governance
 *   <GovernancePostureCard projectId={id} />                 // honest stub — see note below
 *
 * NOTE: there is no rich per-PROJECT governance-posture endpoint yet
 * (`getProjectScoreCards` returns a single score, not sensitive/masked/tags/
 * policies). Rather than fabricate a 2×2 from one number, the projectId path
 * degrades to an honest empty until that backend lands. Pass `data` to render a
 * project posture today.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  KeyRound,
  ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { dash, isBlank } from '@/app/shared/ui/format';
import { isUnavailable } from '@/lib/http-status';
import { getApiErrorMessage } from '@/lib/api-client';
import { getObjectGovernanceTab, objectIdFromTable } from '@/app/services/catalog';

// ── Union input shape (superset of every consumer's governance payload) ───────

export interface GovernancePostureData {
  // Count-based (ObjectGovernance / Object360 GovernanceTab)
  score?: number | null;
  governance_score?: number | null;
  sensitive_columns?: number | null;
  masked_sensitive_columns?: number | null;
  unprotected_sensitive_columns?: number | null;
  tags?: Array<{ tag_name?: string; tag_value?: string | null }> | null;
  policies?: Array<{ policy_name?: string; policy_type?: string; status?: string }> | null;

  // Array-based (TableGovernance / ObjectSmartPanel)
  gov_rate?: number | null;
  pii_columns?: Array<{
    column_name: string;
    masking_status?: 'OK' | 'PARTIAL' | 'NONE' | string | null;
  }> | null;
  rls_policies?: Array<{ policy_name?: string; axis?: string; segments?: string[] }> | null;

  // Module-posture facet (PostureRow / AccessInspector)
  granted_roles?: string[] | null;
  features_enabled?: number | null;
  features_total?: number | null;
  bound_policies?: number | null;
}

export interface GovernancePostureCardProps {
  /** Pre-fetched governance payload (union shape). Highest precedence. */
  data?: GovernancePostureData | null;
  /** Fully-qualified `DB.SCHEMA.TABLE` — self-fetches object governance. */
  objectRef?: string | null;
  /** Project id — honest stub today (no rich per-project posture endpoint). */
  projectId?: string | null;
  /** Card heading (default "Governance posture"). */
  title?: string;
  /** Tighter padding for dense right-rail contexts. */
  compact?: boolean;
  className?: string;
}

// ── Normalization ────────────────────────────────────────────────────────────

interface NormalizedPosture {
  govScore: number | null;
  sensitive: number | null;
  masked: number | null;
  unprotected: number | null;
  tags: { name: string; value: string | null }[];
  policies: { name: string; type: string | null }[];
  /** Per-column PII pills (null when the payload is count-only — no array). */
  piiPills: { column: string; status: string }[] | null;
  unmaskedCount: number | null;
  grantedRoles: string[] | null;
  featuresEnabled: number | null;
  featuresTotal: number | null;
  boundPolicies: number | null;
}

function n(v: number | null | undefined): number | null {
  return isBlank(v) ? null : (v as number);
}

/**
 * Normalize a union payload into the canonical posture model. Gov score is keyed
 * off WHICH field is present (provenance), not its magnitude — `gov_rate` is a
 * 0–1 ratio (×100), `score`/`governance_score` are already 0–100. We never
 * auto-detect by value (which would corrupt a real 1% rate).
 */
function normalize(d: GovernancePostureData): NormalizedPosture {
  let govScore: number | null = null;
  if (!isBlank(d.governance_score)) govScore = Math.round(d.governance_score as number);
  else if (!isBlank(d.score)) govScore = Math.round(d.score as number);
  else if (!isBlank(d.gov_rate)) govScore = Math.round((d.gov_rate as number) * 100);

  const pii = Array.isArray(d.pii_columns) ? d.pii_columns : null;
  const statusOf = (s: string | null | undefined) => (s ?? 'NONE').toUpperCase();

  // Counts: prefer explicit count fields; else derive from the per-column array.
  const sensitive = !isBlank(d.sensitive_columns)
    ? (d.sensitive_columns as number)
    : pii
      ? pii.length
      : null;
  const masked = !isBlank(d.masked_sensitive_columns)
    ? (d.masked_sensitive_columns as number)
    : pii
      ? pii.filter((c) => statusOf(c.masking_status) !== 'NONE').length
      : null;
  const unprotected = !isBlank(d.unprotected_sensitive_columns)
    ? (d.unprotected_sensitive_columns as number)
    : pii
      ? pii.filter((c) => statusOf(c.masking_status) === 'NONE').length
      : null;

  const tags = (d.tags ?? [])
    .filter(Boolean)
    .map((t) => ({ name: t.tag_name ?? '—', value: t.tag_value ?? null }));

  const policies = [
    ...(d.policies ?? []).map((p) => ({ name: p.policy_name ?? '—', type: p.policy_type ?? null })),
    ...(d.rls_policies ?? []).map((p) => ({
      name: p.policy_name ?? '—',
      type: p.axis ? `RLS · ${p.axis}` : 'RLS',
    })),
  ];

  const piiPills = pii
    ? pii.map((c) => ({ column: c.column_name, status: statusOf(c.masking_status) }))
    : null;
  const unmaskedCount = piiPills
    ? piiPills.filter((c) => c.status === 'NONE').length
    : !isBlank(d.unprotected_sensitive_columns)
      ? (d.unprotected_sensitive_columns as number)
      : null;

  return {
    govScore,
    sensitive,
    masked,
    unprotected,
    tags,
    policies,
    piiPills,
    unmaskedCount,
    grantedRoles: Array.isArray(d.granted_roles) ? d.granted_roles : null,
    featuresEnabled: n(d.features_enabled),
    featuresTotal: n(d.features_total),
    boundPolicies: n(d.bound_policies),
  };
}

/** True when a normalized posture carries nothing worth showing. */
function isEmptyPosture(p: NormalizedPosture): boolean {
  return (
    p.govScore == null &&
    p.sensitive == null &&
    p.masked == null &&
    p.unprotected == null &&
    p.tags.length === 0 &&
    p.policies.length === 0 &&
    (p.piiPills == null || p.piiPills.length === 0) &&
    (p.grantedRoles == null || p.grantedRoles.length === 0) &&
    p.featuresEnabled == null &&
    p.featuresTotal == null &&
    p.boundPolicies == null
  );
}

// ── Presentation helpers ─────────────────────────────────────────────────────

function scoreTone(score: number | null): string {
  if (score == null) return 'text-slate-400 dark:text-slate-500';
  if (score >= 80) return 'text-emerald-600 dark:text-emerald-400';
  if (score >= 50) return 'text-amber-600 dark:text-amber-400';
  return 'text-rose-600 dark:text-rose-400';
}

function piiPillTone(status: string): string {
  if (status === 'NONE') return 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300';
  if (status === 'PARTIAL') return 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
  return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300';
}

function MetricCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | null;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
      <p className="text-[10px] text-slate-500 dark:text-slate-400">{label}</p>
      <p className={cn('text-sm font-bold', tone ?? 'text-slate-900 dark:text-white')}>
        {dash(value)}
      </p>
    </div>
  );
}

// ── Pure presentational body (the duplication killer) ────────────────────────

function PostureBody({ posture }: { posture: NormalizedPosture }) {
  const { tags, policies, piiPills } = posture;
  const hasPostureFacet =
    (posture.grantedRoles?.length ?? 0) > 0 ||
    posture.featuresEnabled != null ||
    posture.featuresTotal != null ||
    posture.boundPolicies != null;

  return (
    <div className="space-y-3">
      {/* 2×2 count grid */}
      <div className="grid grid-cols-2 gap-2">
        <MetricCell label="Gov score" value={posture.govScore} tone={scoreTone(posture.govScore)} />
        <MetricCell label="Sensitive" value={posture.sensitive} />
        <MetricCell label="Masked" value={posture.masked} />
        <MetricCell
          label="Unprotected"
          value={posture.unprotected}
          tone={
            posture.unprotected != null && posture.unprotected > 0
              ? 'text-rose-600 dark:text-rose-400'
              : undefined
          }
        />
      </div>

      {/* RED pills — per-column PII (only when a column array exists) */}
      {piiPills && piiPills.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            PII columns ({piiPills.length})
          </p>
          <div className="flex flex-wrap gap-1">
            {piiPills.slice(0, 12).map((c) => (
              <span
                key={c.column}
                title={`Masking: ${c.status}`}
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-medium',
                  piiPillTone(c.status),
                )}
              >
                {c.column}
              </span>
            ))}
            {piiPills.length > 12 && (
              <span className="text-[10px] text-slate-400">+{piiPills.length - 12} more</span>
            )}
          </div>
        </div>
      )}

      {/* Tag chips */}
      {tags.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Tags
          </p>
          <div className="flex flex-wrap gap-1">
            {tags.slice(0, 12).map((t, i) => (
              <span
                key={`${t.name}-${i}`}
                className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-900/30 dark:text-violet-300"
              >
                {t.name}
                {t.value ? `: ${t.value}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Policy list */}
      {policies.length > 0 && (
        <div>
          <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Policies
          </p>
          <ul className="space-y-1">
            {policies.slice(0, 8).map((p, i) => (
              <li
                key={`${p.name}-${i}`}
                className="rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              >
                {p.name} <span className="text-slate-400">({p.type ?? '—'})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Supplementary module-posture facet (AccessInspector) */}
      {hasPostureFacet && (
        <div className="space-y-2 border-t border-slate-100 pt-2 dark:border-slate-800">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Features enabled</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {posture.featuresEnabled == null && posture.featuresTotal == null
                  ? '—'
                  : `${dash(posture.featuresEnabled)}/${dash(posture.featuresTotal)}`}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50">
              <p className="text-[10px] text-slate-500 dark:text-slate-400">Bound policies</p>
              <p className="text-sm font-bold text-slate-900 dark:text-white">
                {dash(posture.boundPolicies)}
              </p>
            </div>
          </div>
          {posture.grantedRoles && posture.grantedRoles.length > 0 && (
            <div>
              <p className="mb-1.5 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                <KeyRound className="h-3 w-3" /> Granted roles ({posture.grantedRoles.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {posture.grantedRoles.slice(0, 12).map((r) => (
                  <span
                    key={r}
                    className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  >
                    {r}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Shell + states ───────────────────────────────────────────────────────────

function Shell({
  title,
  compact,
  className,
  children,
}: {
  title: string;
  compact?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={cn(
        'rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900',
        compact ? 'p-3' : 'p-4',
        className,
      )}
    >
      <div className="mb-3 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-emerald-500" />
        <h3 className="text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

function SkeletonBody() {
  return (
    <div className="space-y-2" aria-hidden="true">
      <div className="grid grid-cols-2 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        ))}
      </div>
      <div className="h-6 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
    </div>
  );
}

type FetchStatus = 'loading' | 'ok' | 'gap' | 'error';

/**
 * GovernancePostureCard — the single shared governance posture surface.
 */
export default function GovernancePostureCard({
  data,
  objectRef,
  projectId,
  title = 'Governance posture',
  compact,
  className,
}: GovernancePostureCardProps) {
  // Self-fetch state (used only on the objectRef path — the `data` path skips it).
  const [fetched, setFetched] = useState<GovernancePostureData | null>(null);
  const [status, setStatus] = useState<FetchStatus>('loading');
  const [error, setError] = useState<string | null>(null);

  const objectId =
    objectRef && !data
      ? (() => {
          const parts = objectRef.split('.');
          if (parts.length !== 3 || parts.some((p) => !p.trim())) return null;
          const [db, schema, name] = parts;
          return objectIdFromTable(db.trim(), schema.trim(), name.trim());
        })()
      : null;

  const load = useCallback(async () => {
    if (!objectId) return;
    setStatus('loading');
    setError(null);
    try {
      const res = await getObjectGovernanceTab(objectId);
      setFetched(res as GovernancePostureData);
      setStatus('ok');
    } catch (err) {
      if (isUnavailable(err)) setStatus('gap');
      else {
        setError(getApiErrorMessage(err));
        setStatus('error');
      }
    }
  }, [objectId]);

  useEffect(() => {
    if (objectId) void load();
  }, [objectId, load]);

  // ── Precedence: data → objectRef (self-fetch) → projectId (honest stub) ──────

  // 1) Pre-fetched data — pure presentational path, no state machine.
  if (data) {
    const posture = normalize(data);
    return (
      <Shell title={title} compact={compact} className={className}>
        {isEmptyPosture(posture) ? (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            No governance signals reported for this object yet.
          </p>
        ) : (
          <PostureBody posture={posture} />
        )}
      </Shell>
    );
  }

  // 2) objectRef — self-fetch object governance.
  if (objectRef) {
    if (!objectId) {
      return (
        <Shell title={title} compact={compact} className={className}>
          <p className="text-xs text-slate-400 dark:text-slate-500">
            “{objectRef}” is not a fully-qualified DB.SCHEMA.TABLE name.
          </p>
        </Shell>
      );
    }
    // Route not deployed here → hide entirely (honest, no broken shell).
    if (status === 'gap') return null;
    return (
      <Shell title={title} compact={compact} className={className}>
        {status === 'loading' && <SkeletonBody />}
        {status === 'error' && (
          <div className="flex flex-col items-start gap-2 text-xs text-rose-600 dark:text-rose-400">
            <span className="flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error ?? 'Could not load governance posture.'}
            </span>
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-rose-300 px-2.5 py-1 text-[11px] font-medium hover:bg-rose-50 dark:border-rose-800 dark:hover:bg-rose-900/20"
            >
              Retry
            </button>
          </div>
        )}
        {status === 'ok' &&
          (() => {
            const posture = normalize(fetched ?? {});
            return isEmptyPosture(posture) ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">
                No governance signals reported for this object yet.
              </p>
            ) : (
              <PostureBody posture={posture} />
            );
          })()}
      </Shell>
    );
  }

  // 3) projectId-only — honest stub (no rich per-project posture endpoint yet).
  if (projectId) return null;

  // Nothing to source from.
  return null;
}
