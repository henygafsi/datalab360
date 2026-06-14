'use client';

/**
 * ProposedPoliciesPanel — AI deep-link prefill for Governance ▸ Policies.
 *
 * Rendered ONLY when the Account-overview AI advisor deep-links in with
 * `?intent=apply&from=scan` (route: /governance/policies?intent=apply&from=scan).
 * On a manual visit it renders nothing, so the standard policies experience is
 * untouched.
 *
 * What it does: turns the latest Snowflake scan into a ranked list of
 * "Proposed policies (AI)" — each pre-filled with the REAL target object and the
 * roles it spreads to — so applying a governance control is one click + a column
 * confirmation away, instead of an empty wizard.
 *
 * HONESTY CONTRACT (the scan has NO column-level or sensitivity data):
 *   • Backend recommendations (the only authoritative "detected" findings) are
 *     rendered verbatim — we never re-author the claim on top of them.
 *   • Object-derived cards carry only REAL fields from object-enrichment:
 *     db.schema.table + the accessing roles (a ≤8 sample; we say "e.g." when the
 *     distinct-role count exceeds the sample). We frame these as "broadly
 *     accessible — N roles read this; review for sensitive columns", NOT as
 *     "contains PII". Access spread is the real signal; sensitivity is the
 *     reviewer's call, confirmed when they pick the column.
 *   • Degraded / empty payloads render an honest empty state — never a
 *     synthesized placeholder proposal.
 *
 * Apply is genuine but never auto-fabricated: applyMasking/applyRLS both need an
 * existing policy + a column the scan can't supply, so "Apply" lands the user in
 * a prefilled mini-form (object filled from the scan; they confirm the column and
 * pick the policy) gated by useCanPerform('gouvernance','apply').
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Select } from 'rizzui';
import toast from 'react-hot-toast';
import {
  PiSparkle,
  PiEyeSlash,
  PiLockKey,
  PiShieldWarning,
  PiUsersThree,
  PiArrowRight,
  PiX,
  PiArrowClockwise,
} from 'react-icons/pi';
import apiClient from '@/lib/api-client';
import { useCanPerform } from '@/hooks/useCanPerform';
import { getObjectEnrichment, type ObjectEnrichmentRow } from '@/app/services/command-center';
import {
  getCommandCenterRecommendations,
  type Recommendation,
  type RecommendationCta,
} from '@/app/services/command-center/recommendations';
import {
  listPoliciesEnriched,
  applyMaskingPolicy,
  applyRLSPolicy,
  formatPolicyError,
  type EnrichedPolicy,
} from '@/app/services/governance/policies';
import { ObjectSelector } from './ObjectSelector';
import ConfirmDialog from '@/components/ui/ConfirmDialog';

// Dimensions emitted by /command-center/recommendations that belong on the
// Governance policies surface. Anything else (cost, performance, storage, dq…)
// is out of scope here and stays on its own module.
const GOV_DIMENSIONS = new Set([
  'governance',
  'security',
  'network',
  'users',
  'access',
  'sharing',
  'privacy',
  'compliance',
]);

type ApplyKind = 'masking' | 'rls';

interface ObjectProposal {
  fqn: string;
  database: string;
  schema: string;
  table: string;
  distinctRoles: number | null;
  rolesSample: string[];
  projects: number | null;
  products: number | null;
  lastAccessed: string | null;
}

const SEVERITY_STYLE: Record<
  string,
  { dot: string; chip: string; label: string }
> = {
  critical: { dot: 'bg-red-500', chip: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300', label: 'Critical' },
  high: { dot: 'bg-orange-500', chip: 'bg-orange-50 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', label: 'High' },
  warning: { dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', label: 'Warning' },
  info: { dot: 'bg-blue-500', chip: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300', label: 'Info' },
};

/** Normalize an enrichment row's keys to lowercase (casing-proof merge). */
function normalizeRow(raw: unknown): ObjectEnrichmentRow {
  return Object.fromEntries(
    Object.entries(raw as Record<string, unknown>).map(([k, v]) => [k.toLowerCase(), v]),
  ) as unknown as ObjectEnrichmentRow;
}

export default function ProposedPoliciesPanel() {
  const searchParams = useSearchParams();
  const intent = searchParams.get('intent');
  const from = searchParams.get('from');
  const active = intent === 'apply' && from === 'scan';

  const router = useRouter();

  // Action-RBAC: gate every mutating / install button. Fail-open while loading
  // so there's no flash of disabled, mirroring masking-content.
  const applyPerm = useCanPerform('gouvernance', 'apply');
  const canApply = applyPerm.allowed || applyPerm.loading;

  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [recos, setRecos] = useState<Recommendation[]>([]);
  const [objects, setObjects] = useState<ObjectProposal[]>([]);
  const [scanDegraded, setScanDegraded] = useState(false);
  const [maskingPolicies, setMaskingPolicies] = useState<EnrichedPolicy[]>([]);
  const [rlsPolicies, setRlsPolicies] = useState<EnrichedPolicy[]>([]);

  // Per-card expanded apply mini-form (one at a time).
  const [expanded, setExpanded] = useState<{ fqn: string; kind: ApplyKind } | null>(null);
  const [pickPolicy, setPickPolicy] = useState('');
  const [pickColumn, setPickColumn] = useState('');
  const [applyError, setApplyError] = useState<string | null>(null);

  // Confirm + run state for the real apply.
  const [confirm, setConfirm] = useState<{
    proposal: ObjectProposal;
    kind: ApplyKind;
    policy: string;
    column: string;
  } | null>(null);
  const [applying, setApplying] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [recoRes, enrichRes, maskRes, rlsRes] = await Promise.allSettled([
      getCommandCenterRecommendations(),
      getObjectEnrichment(90),
      listPoliciesEnriched('MASKING'),
      listPoliciesEnriched('ROW_ACCESS'),
    ]);

    // --- Recommendations (rendered verbatim) -------------------------------
    if (recoRes.status === 'fulfilled' && recoRes.value) {
      const payload = recoRes.value;
      const collected: Recommendation[] = [];
      const byDim = payload.by_dimension ?? {};
      for (const [dim, rows] of Object.entries(byDim)) {
        if (GOV_DIMENSIONS.has(String(dim).toLowerCase()) && Array.isArray(rows)) {
          collected.push(...rows);
        }
      }
      // Fallback to the flat list if by_dimension didn't bucket anything.
      if (collected.length === 0 && Array.isArray(payload.recommendations)) {
        collected.push(
          ...payload.recommendations.filter((r) =>
            GOV_DIMENSIONS.has(String(r.dimension).toLowerCase()),
          ),
        );
      }
      const rank: Record<string, number> = { critical: 0, high: 1, warning: 2, info: 3 };
      collected.sort((a, b) => (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9));
      setRecos(collected);
    } else {
      setRecos([]);
    }

    // --- Object-derived proposals (REAL fields only) -----------------------
    if (enrichRes.status === 'fulfilled' && enrichRes.value) {
      const enrich = enrichRes.value;
      const degraded =
        !!enrich.degraded ||
        (enrich.meta as { degraded?: boolean } | undefined)?.degraded === true;
      setScanDegraded(degraded);
      if (!degraded) {
        const mapped: ObjectProposal[] = (enrich.data ?? [])
          .map(normalizeRow)
          .filter((r) => r.database_name && r.table_name && (r.distinct_roles ?? 0) > 0)
          .sort((a, b) => (b.distinct_roles ?? 0) - (a.distinct_roles ?? 0))
          .slice(0, 6)
          .map((r) => ({
            fqn: `${r.database_name}.${r.schema_name}.${r.table_name}`,
            database: r.database_name,
            schema: r.schema_name,
            table: r.table_name,
            distinctRoles: r.distinct_roles,
            rolesSample: (r.roles ?? []).filter(Boolean),
            projects: r.projects,
            products: r.products,
            lastAccessed: r.last_accessed,
          }));
        setObjects(mapped);
      } else {
        setObjects([]);
      }
    } else {
      setScanDegraded(true);
      setObjects([]);
    }

    setMaskingPolicies(
      maskRes.status === 'fulfilled' && Array.isArray(maskRes.value) ? maskRes.value : [],
    );
    setRlsPolicies(
      rlsRes.status === 'fulfilled' && Array.isArray(rlsRes.value) ? rlsRes.value : [],
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!active) return;
    void load();
  }, [active, load]);

  const dispatchCta = useCallback(
    async (cta: RecommendationCta) => {
      if (cta.action === 'navigate') {
        router.push(cta.target);
        return;
      }
      if (cta.action === 'refresh') {
        void load();
        return;
      }
      if (cta.action === 'install') {
        if (!canApply) {
          toast.error('You lack the "apply" permission on governance.');
          return;
        }
        try {
          await apiClient.post(cta.target);
          toast.success('Provisioning started.');
          void load();
        } catch (e) {
          toast.error(formatPolicyError(e, 'Could not start provisioning.'));
        }
      }
    },
    [router, load, canApply],
  );

  const openApply = (proposal: ObjectProposal, kind: ApplyKind) => {
    setExpanded({ fqn: proposal.fqn, kind });
    setPickPolicy('');
    setPickColumn('');
    setApplyError(null);
  };

  const runApply = async () => {
    if (!confirm) return;
    setApplying(true);
    setApplyError(null);
    try {
      if (confirm.kind === 'masking') {
        await applyMaskingPolicy({
          policy_name: confirm.policy,
          database: confirm.proposal.database,
          schema: confirm.proposal.schema,
          table: confirm.proposal.table,
          column: confirm.column,
        });
      } else {
        await applyRLSPolicy({
          policy_name: confirm.policy,
          table_name: confirm.proposal.table,
          database: confirm.proposal.database,
          schema: confirm.proposal.schema,
          policy_column: confirm.column,
        });
      }
      toast.success(
        `${confirm.kind === 'masking' ? 'Masking' : 'Row-access'} policy applied to ` +
          `${confirm.proposal.fqn}.${confirm.column}`,
      );
      setConfirm(null);
      setExpanded(null);
    } catch (e) {
      setApplyError(formatPolicyError(e, 'Failed to apply policy'));
    } finally {
      setApplying(false);
    }
  };

  const hasAnything = recos.length > 0 || objects.length > 0;

  const summary = useMemo(() => {
    const parts: string[] = [];
    if (recos.length) parts.push(`${recos.length} detected gap${recos.length === 1 ? '' : 's'}`);
    if (objects.length) parts.push(`${objects.length} broadly-accessed object${objects.length === 1 ? '' : 's'}`);
    return parts.join(' · ');
  }, [recos.length, objects.length]);

  if (!active || dismissed) return null;

  return (
    <div className="rounded-2xl border border-violet-200/70 dark:border-violet-700/40 bg-gradient-to-br from-violet-50 via-white to-fuchsia-50/40 dark:from-violet-950/30 dark:via-slate-900 dark:to-fuchsia-950/20 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 p-4 sm:p-5 border-b border-violet-200/60 dark:border-violet-800/40">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300 flex items-center justify-center shrink-0">
            <PiSparkle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">Proposed policies (AI)</h2>
              <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300">
                From your latest scan
              </span>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
              {loading
                ? 'Reading the scan and matching governance controls…'
                : summary
                  ? `${summary}. Each proposal is pre-filled with the real target — review and apply.`
                  : 'No governance proposals from the current scan.'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => void load()}
            title="Re-run the scan match"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-white/70 dark:hover:bg-slate-800/70 transition-colors"
          >
            <PiArrowClockwise className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setDismissed(true)}
            title="Dismiss AI proposals"
            className="p-2 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-white/70 dark:hover:bg-slate-800/70 transition-colors"
          >
            <PiX className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-5">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 animate-pulse rounded-xl bg-white/70 dark:bg-slate-800/50" />
            ))}
          </div>
        ) : !hasAnything ? (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white/60 dark:bg-slate-900/40 p-6 text-center">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {scanDegraded
                ? 'Object scan is unavailable on this edition or with the current privileges, and no governance recommendations are open. Use the manual policy tabs below.'
                : 'The scan surfaced no open governance gaps or broadly-accessed objects right now. Use the manual policy tabs below.'}
            </p>
          </div>
        ) : (
          <>
            {/* Recommendation-derived proposals (account-level gaps) */}
            {recos.length > 0 && (
              <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <PiShieldWarning className="w-4 h-4" /> Detected governance gaps
                </h3>
                <div className="grid gap-2.5 sm:grid-cols-2">
                  {recos.map((r) => {
                    const sev = SEVERITY_STYLE[r.severity] ?? SEVERITY_STYLE.info;
                    return (
                      <div
                        key={r.id}
                        className="rounded-xl border border-slate-200/70 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-3.5 flex flex-col gap-2"
                      >
                        <div className="flex items-start gap-2">
                          <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${sev.dot}`} />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-slate-900 dark:text-white">{r.title}</span>
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${sev.chip}`}>{sev.label}</span>
                              <span className="text-[10px] uppercase tracking-wide text-slate-400">{r.dimension}</span>
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{r.detail}</p>
                          </div>
                        </div>
                        {r.cta && (
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void dispatchCta(r.cta)}
                              className="text-xs"
                            >
                              {r.cta.label || 'Resolve'}
                              <PiArrowRight className="w-3.5 h-3.5 ml-1" />
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Object-derived proposals (broadly accessible → review + apply) */}
            {objects.length > 0 && (
              <section className="space-y-3">
                <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <PiUsersThree className="w-4 h-4" /> Broadly-accessed objects — apply access controls
                </h3>
                <div className="space-y-2.5">
                  {objects.map((o) => {
                    const total = o.distinctRoles ?? o.rolesSample.length;
                    const truncated = total > o.rolesSample.length && o.rolesSample.length > 0;
                    const isExpanded = expanded?.fqn === o.fqn;
                    const policies = expanded?.kind === 'rls' ? rlsPolicies : maskingPolicies;
                    return (
                      <div
                        key={o.fqn}
                        className="rounded-xl border border-slate-200/70 dark:border-slate-700/60 bg-white dark:bg-slate-900 p-3.5"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <code className="text-sm font-semibold text-slate-900 dark:text-white truncate">{o.fqn}</code>
                              {total > 0 && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
                                  {total} role{total === 1 ? '' : 's'} read this
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                              Broadly accessible — review for sensitive columns and apply a control.
                              {o.rolesSample.length > 0 && (
                                <>
                                  {' '}Spreads to {truncated ? 'e.g. ' : ''}
                                  <span className="font-medium text-slate-700 dark:text-slate-300">
                                    {o.rolesSample.slice(0, 6).join(', ')}
                                  </span>
                                  {truncated ? ` (+${total - o.rolesSample.length} more)` : ''}.
                                </>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <Button
                              size="sm"
                              variant={isExpanded && expanded?.kind === 'masking' ? 'solid' : 'outline'}
                              disabled={!canApply}
                              title={!canApply ? 'You lack the "apply" permission on governance.' : undefined}
                              onClick={() => openApply(o, 'masking')}
                              className="text-xs"
                            >
                              <PiEyeSlash className="w-3.5 h-3.5 mr-1" /> Mask a column
                            </Button>
                            <Button
                              size="sm"
                              variant={isExpanded && expanded?.kind === 'rls' ? 'solid' : 'outline'}
                              disabled={!canApply}
                              title={!canApply ? 'You lack the "apply" permission on governance.' : undefined}
                              onClick={() => openApply(o, 'rls')}
                              className="text-xs"
                            >
                              <PiLockKey className="w-3.5 h-3.5 mr-1" /> Row access
                            </Button>
                          </div>
                        </div>

                        {/* Inline prefilled apply mini-form */}
                        {isExpanded && (
                          <div className="mt-3 pt-3 border-t border-slate-200/70 dark:border-slate-700/60 grid gap-3 sm:grid-cols-2">
                            <Select
                              label={`${expanded?.kind === 'rls' ? 'Row-access' : 'Masking'} policy`}
                              value={pickPolicy}
                              onChange={(val: any) => setPickPolicy(typeof val === 'object' ? val?.value : val)}
                              options={policies.map((p) => ({ label: p.name, value: p.name }))}
                              placeholder={policies.length ? 'Choose an existing policy' : 'No policy exists yet — create one below'}
                              disabled={policies.length === 0}
                            />
                            <ObjectSelector
                              level="column"
                              database={o.database}
                              schema={o.schema}
                              table={o.table}
                              value={pickColumn}
                              onSelect={setPickColumn}
                              label="Column (confirm the sensitive one)"
                            />
                            <div className="sm:col-span-2 flex items-center justify-between gap-3">
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                Target <span className="font-medium">{o.fqn}</span> is pre-filled from the scan. Pick the column to confirm what is sensitive.
                                {policies.length === 0 && ' No policy of this type exists yet — create one in the tab below, then return.'}
                              </p>
                              <Button
                                size="sm"
                                disabled={!canApply || !pickPolicy || !pickColumn}
                                onClick={() =>
                                  setConfirm({
                                    proposal: o,
                                    kind: expanded!.kind,
                                    policy: pickPolicy,
                                    column: pickColumn,
                                  })
                                }
                                className="bg-violet-600 hover:bg-violet-700 text-xs shrink-0"
                              >
                                Apply
                              </Button>
                            </div>
                            {applyError && (
                              <p role="alert" className="sm:col-span-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-700/60 dark:bg-red-900/20 dark:text-red-300">
                                {applyError}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}
          </>
        )}
      </div>

      {/* Confirm before the real apply */}
      <ConfirmDialog
        open={!!confirm}
        title={`Apply ${confirm?.kind === 'rls' ? 'row-access' : 'masking'} policy?`}
        destructive={false}
        message={
          confirm
            ? `Policy "${confirm.policy}" will be applied to ${confirm.proposal.fqn}.${confirm.column}.\n\n` +
              `This object is read by ${confirm.proposal.distinctRoles ?? '—'} role(s); applying the control affects every one of them.` +
              (applying ? '\n\nApplying…' : '') +
              (applyError ? `\n\nError: ${applyError}` : '')
            : ''
        }
        confirmLabel={applying ? 'Applying…' : 'Confirm apply'}
        cancelLabel="Back"
        onConfirm={() => { if (!applying) void runApply(); }}
        onCancel={() => { if (!applying) { setConfirm(null); setApplyError(null); } }}
      />
    </div>
  );
}
