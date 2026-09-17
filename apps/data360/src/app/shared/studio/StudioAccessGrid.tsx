'use client';

/**
 * StudioAccessGrid — the whole governance surface as ONE navigable page: the
 * application's columns down the axis, the Data360 roles across, and in every
 * cell what that role sees — every row or a row expression, masked or in clear.
 * It replaces the two "palette" tabs (a wall of column cards) the user rejected
 * with a matrix you read at a glance and drill into to edit.
 *
 * Honesty invariants carried from the palette (do not regress):
 *  • ONE row per COLUMN. The plan is keyed by the bare column name, so REGION
 *    under SRC_STORES and under SRC_TARGETS is ONE rule — shown once, its
 *    tables annotated. Two rows secretly sharing one state is the wrong-table
 *    bug the palette was built to avoid; the matrix must not reintroduce it.
 *  • Masking is FLAT: a masked column is hidden from every role except the
 *    exemption list, which is ONE list for the whole change, not per column.
 *    So mask cells are DERIVED and read-only per cell; the toggle lives on the
 *    column (mask on/off) and on the role header (this role reads clear).
 *  • No invented per-role READ. Object grants live once on <APP>_ACCESS and are
 *    reused by every role, so a read column would be five identical cells and,
 *    for anyone but you, unverified. The baseline is stated once; "Test the
 *    reads" stays the only claim of verification.
 *  • Edits flow into the SAME policy / maskedCols state the parent stages and
 *    applies — never a parallel copy, or the "policy-only can't Prepare" gate
 *    breaks again.
 *
 * PII / GDPR lives on the column axis (it is a column attribute): a name match
 * is a PROPOSAL, content is evidence, opaque columns are never guessed. Confirm
 * a proposal, mask it, and the detect→confirm→mask→compliant path is one
 * gesture in the same grid instead of a separate screen.
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronRight,
  Database,
  Eye,
  EyeOff,
  Fingerprint,
  KeyRound,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
} from 'lucide-react';
import {
  detectPii,
  decidePii,
  getPii,
  simulateRlsPlan,
  type PiiFinding,
  type PiiReport,
  type RlsPlanSimulation,
} from '@/app/services/studio/studio-api';
import { getStudioSummary, type AccessSummary } from '@/app/services/studio/summary';
import type { GrantTypeInfo, PolicyMapping } from '@/app/shared/studio/StudioGovernanceMap';

/** A governable column, collapsed to ONE per bare name (the plan's key). */
export interface GridColumn {
  column: string;
  tables: string[];
  fqns: string[];
  values: string[];
}

type Layer = 'rls' | 'cls' | 'pii';

const LAYERS: Array<{ id: Layer; label: string; hint: string; icon: typeof KeyRound }> = [
  { id: 'rls', label: 'Row rules (RLS)', hint: 'which rows each role sees', icon: KeyRound },
  { id: 'cls', label: 'Column masking (CLS)', hint: 'which columns are masked, and for whom', icon: EyeOff },
  { id: 'pii', label: 'PII / GDPR', hint: 'detect sensitive columns → confirm → mask', icon: Fingerprint },
];

/** name-only PII match confidence caps at ~0.5 — colour by evidence, not just
 *  the number: a "proposed" (name) finding is amber, "inferred"/"observed"
 *  (content) is stronger. */
function truthTone(t?: string): { cls: string; word: string } {
  if (t === 'observed') return { cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300', word: 'observed' };
  if (t === 'inferred') return { cls: 'bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300', word: 'inferred' };
  return { cls: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300', word: 'proposed' };
}

export default function StudioAccessGrid({
  initialLayer,
  draftId,
  grantTypes,
  columns,
  policy,
  onPolicy,
  masking,
  onToggleMask,
  onToggleUnmask,
  accessRole,
  tablesCount,
  actionBar,
}: {
  /** which layer to open on (a model detection deep-links to 'pii'/'rls') */
  initialLayer?: Layer;
  draftId: string;
  grantTypes: GrantTypeInfo[];
  columns: GridColumn[];
  policy: PolicyMapping;
  onPolicy: (column: string, grantType: string, values: string[] | '*') => void;
  masking: { columns: string[]; unmasked: string[] };
  onToggleMask: (column: string) => void;
  onToggleUnmask: (grantType: string) => void;
  accessRole?: string;
  tablesCount?: number;
  /** the shared Prepare / Test / Review bar, so the grid is self-sufficient */
  actionBar?: React.ReactNode;
}) {
  const [layer, setLayer] = useState<Layer>(initialLayer ?? 'rls');
  useEffect(() => {
    if (initialLayer) setLayer(initialLayer);
  }, [initialLayer]);
  const [openCol, setOpenCol] = useState<string | null>(null);
  const [maskInput, setMaskInput] = useState('');
  const grantLabel = (id: string): string => grantTypes.find((g) => g.id === id)?.label ?? id;

  /* the honest denominator + in-force/staged counts — read once so the grid
     header can say "N in footprint" instead of implying the columns shown are
     all there are. */
  const [access, setAccess] = useState<AccessSummary | null>(null);
  useEffect(() => {
    let alive = true;
    void getStudioSummary(draftId, ['access'])
      .then((r) => alive && setAccess(r.access ?? {}))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [draftId]);

  /* ── PII: read persisted findings on demand, never on mount ───────────── */
  const [pii, setPii] = useState<PiiReport | null>(null);
  const [piiBusy, setPiiBusy] = useState(false);
  const [piiErr, setPiiErr] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);

  const loadPii = useCallback(async () => {
    setPiiErr(null);
    try {
      setPii(await getPii(draftId));
    } catch {
      /* no run yet is not an error — detect will create one */
      setPii({ findings: [] });
    }
  }, [draftId]);

  const runDetect = useCallback(
    async (useSample = false) => {
      setPiiBusy(true);
      setPiiErr(null);
      try {
        setPii(await detectPii(draftId, { use_sample: useSample }));
      } catch (e) {
        setPiiErr(e instanceof Error ? e.message : 'Detection failed.');
      } finally {
        setPiiBusy(false);
      }
    },
    [draftId],
  );

  /* AGENTIC: the persisted classification is read when the grid mounts — a
     free GET of an existing run, never a re-detection — so the grid can LEAD
     with what the AI already understood ("N columns look personal") instead
     of waiting for someone to press a button. Detection itself (a new run)
     stays an explicit click. */
  useEffect(() => {
    if (pii === null) void loadPii();
  }, [pii, loadPii]);

  /** proposals still waiting on a human call — the deduced call-to-action */
  const piiUndecided = useMemo(
    () => (pii && pii !== null ? (pii.findings ?? []).filter((f) => f.pii !== false && !f.decision).length : 0),
    [pii],
  );

  const decide = useCallback(
    async (f: PiiFinding, decision: 'confirm' | 'reject') => {
      const key = `${f.fqn}.${f.column}`;
      setDeciding(key);
      try {
        const r = await decidePii(draftId, {
          fqn: f.fqn ?? '',
          column: f.column ?? '',
          decision,
          category: f.category,
        });
        setPii(r);
        // one gesture: confirming a maskable column also STAGES the mask into
        // the same change the rest of the grid applies (compliant, not just
        // classified). Hashing (special categories) is staged as masking too —
        // the profile apply promotes it to columns_encrypted.
        if (decision === 'confirm' && f.column && f.recommended_action !== 'none' && f.recommended_action !== 'row_restrict') {
          if (!masking.columns.includes(f.column.toUpperCase()) && !masking.columns.includes(f.column)) {
            onToggleMask(f.column.toUpperCase());
          }
        }
      } catch (e) {
        setPiiErr(e instanceof Error ? e.message : 'Could not record the decision.');
      } finally {
        setDeciding(null);
      }
    },
    [draftId, masking.columns, onToggleMask],
  );

  /* PII finding by bare column (uppercased) — a badge on any matrix row whose
     column carries a finding. Confirmed/rejected win over undecided. */
  const piiByColumn = useMemo(() => {
    const m = new Map<string, PiiFinding>();
    for (const f of pii?.findings ?? []) {
      const k = (f.column ?? '').toUpperCase();
      if (!k) continue;
      const cur = m.get(k);
      if (!cur || (f.decision && !cur.decision)) m.set(k, f);
    }
    return m;
  }, [pii]);

  /* rows of the matrix: the governable columns (candidates) plus any masked
     column that is not itself a candidate — one row per bare column. */
  const rows = useMemo(() => {
    const byCol = new Map<string, GridColumn>();
    for (const c of columns) byCol.set(c.column, c);
    for (const col of masking.columns)
      if (!byCol.has(col)) byCol.set(col, { column: col, tables: [], fqns: [], values: [] });
    return [...byCol.values()];
  }, [columns, masking.columns]);

  /* ── plan-level RLS simulation per column (preserved from the palette) ── */
  const [sims, setSims] = useState<Record<string, RlsPlanSimulation | 'running' | { error: string }>>({});
  const simulate = async (c: GridColumn) => {
    const narrowed = Object.values(policy[c.column] ?? {}).some((v) => Array.isArray(v) && v.length > 0);
    if (!narrowed) return;
    const byGrant: Record<string, string[] | '*'> = {};
    for (const g of grantTypes) {
      const v = policy[c.column]?.[g.id];
      byGrant[g.id] = Array.isArray(v) && v.length > 0 ? v : '*';
    }
    setSims((m) => ({ ...m, [c.column]: 'running' }));
    try {
      const r = await simulateRlsPlan(draftId, {
        fqn: c.fqns[0] ?? '',
        column: c.column,
        allowed_values_by_grant_type: byGrant,
        rows: 3,
      });
      setSims((m) => ({ ...m, [c.column]: r }));
    } catch (e) {
      setSims((m) => ({ ...m, [c.column]: { error: e instanceof Error ? e.message : 'The simulation failed.' } }));
    }
  };

  /* the cell state, per (column, role) — the SINGLE source is the staged
     policy/masking, never an invented read. */
  const rlsCell = (col: GridColumn, roleId: string): { restricted: boolean; count: number } => {
    const v = policy[col.column]?.[roleId];
    const kept = Array.isArray(v) ? v : [];
    return { restricted: kept.length > 0, count: kept.length };
  };
  const clsCell = (col: GridColumn, roleId: string): 'unset' | 'masked' | 'clear' => {
    if (!masking.columns.includes(col.column)) return 'unset';
    // ACCOUNTADMIN and any exempt role read the real value
    return masking.unmasked.includes(roleId) ? 'clear' : 'masked';
  };

  const stagedMasks = masking.columns.length;
  const stagedRules = rows.filter((c) =>
    grantTypes.some((g) => {
      const v = policy[c.column]?.[g.id];
      return Array.isArray(v) && v.length > 0;
    }),
  ).length;

  const fp = access?.footprint;
  const ap = access?.applied;
  const st = access?.staged;

  return (
    <div className="space-y-3">
      {/* ── header: the honest counts + the baseline read ────────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
            Access grid — columns × roles
          </p>
          {access && (
            <span
              className="text-xs text-slate-500 dark:text-slate-400"
              title={access.kpi_method ?? undefined}
            >
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {ap?.masked_columns ?? '—'}
              </span>{' '}
              masked applied ·{' '}
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {(st?.masked_columns ?? 0) + stagedMasks}
              </span>{' '}
              staged ·{' '}
              <span className="font-medium text-slate-700 dark:text-slate-200">
                {fp?.columns ?? '—'}
              </span>{' '}
              columns in footprint
              {fp?.pii_columns_confirmed != null && fp.pii_columns_confirmed > 0 && (
                <> · {fp.pii_columns_confirmed} PII confirmed</>
              )}
            </span>
          )}
        </div>
        {/* the DEDUCED call-to-action — the AI already classified the columns
            (persisted run, free read); the user accepts or rejects, they never
            have to know a "detect" button exists. */}
        {piiUndecided > 0 && layer !== 'pii' && (
          <button
            type="button"
            onClick={() => setLayer('pii')}
            className="mt-1.5 inline-flex items-center gap-1.5 rounded-lg border border-amber-300/70 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200 dark:hover:bg-amber-950/50"
          >
            <Fingerprint aria-hidden className="h-3.5 w-3.5" />
            {piiUndecided} column{piiUndecided > 1 ? 's' : ''} look{piiUndecided > 1 ? '' : 's'} personal —
            review &amp; mask
          </button>
        )}
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Every role reads the {tablesCount ?? '—'} table(s) this application exposes
          {accessRole ? (
            <>
              {' '}
              through <span className="font-mono">{accessRole}</span>
            </>
          ) : null}{' '}
          — object grants live once and are reused, so per-role differences below are{' '}
          <span className="font-medium">row rules</span> and{' '}
          <span className="font-medium">masking</span> only. What a role can really read is proven by{' '}
          <span className="font-medium">Test the reads</span>, not asserted here.
        </p>
      </section>

      {/* ── the grant-type navigator (the "navigable par type de grant") ─── */}
      <div role="tablist" aria-label="Grant type" className="flex flex-wrap gap-1">
        {LAYERS.map((l) => {
          const on = layer === l.id;
          const Icon = l.icon;
          const count =
            l.id === 'rls'
              ? stagedRules || undefined
              : l.id === 'cls'
                ? stagedMasks || undefined
                : piiUndecided || undefined;
          return (
            <button
              key={l.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setLayer(l.id)}
              title={l.hint}
              className={`inline-flex items-center gap-1.5 border-b-2 px-3 py-1.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                on
                  ? 'border-accent-600 font-medium text-accent-700 dark:border-accent-400 dark:text-accent-300'
                  : 'border-transparent text-slate-600 hover:border-slate-300 dark:text-slate-300 dark:hover:border-slate-600'
              }`}
            >
              <Icon aria-hidden className="h-3.5 w-3.5" />
              {l.label}
              {count != null && (
                <span className={`rounded-full px-1.5 text-xs ${on ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ═══ PII / GDPR ═══════════════════════════════════════════════════ */}
      {layer === 'pii' ? (
        <PiiPanel
          pii={pii}
          piiBusy={piiBusy}
          piiErr={piiErr}
          deciding={deciding}
          onDetect={() => void runDetect(false)}
          onDetectContent={() => void runDetect(true)}
          footprintColumns={fp?.columns ?? null}
          onDecide={decide}
          masking={masking}
        />
      ) : (
        /* ═══ the MATRIX (Row rules / Masking) ═══════════════════════════ */
        <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
          {layer === 'cls' && (
            <MaskingHeader
              grantTypes={grantTypes}
              masking={masking}
              onToggleUnmask={onToggleUnmask}
              maskInput={maskInput}
              setMaskInput={setMaskInput}
              onToggleMask={onToggleMask}
            />
          )}

          {rows.length === 0 ? (
            <p className="text-[13px] text-slate-500 dark:text-slate-400">
              {layer === 'rls'
                ? 'No column in this application carries a small set of repeated values, so there is nothing to restrict rows by. Mask a sensitive column under Column masking, or run PII detection.'
                : 'No column is masked yet. Type a column to mask above, or run PII / GDPR detection to find sensitive ones.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="sticky left-0 z-10 bg-white py-1.5 pr-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-900 dark:text-slate-400">
                      Column
                    </th>
                    {grantTypes.map((g) => (
                      <th key={g.id} className="px-2 py-1.5 text-center align-bottom">
                        <span className="block text-xs font-medium text-slate-700 dark:text-slate-200">
                          {g.label ?? g.id}
                        </span>
                        {layer === 'cls' && (
                          <button
                            type="button"
                            aria-pressed={masking.unmasked.includes(g.id)}
                            onClick={() => onToggleUnmask(g.id)}
                            title={
                              masking.unmasked.includes(g.id)
                                ? `${g.label ?? g.id} reads masked columns in CLEAR — click to mask for them too`
                                : `${g.label ?? g.id} reads masked columns MASKED — click to exempt (reads clear)`
                            }
                            className={`mt-0.5 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                              masking.unmasked.includes(g.id)
                                ? 'border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-500/40 dark:bg-amber-900/30 dark:text-amber-300'
                                : 'border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700 dark:text-slate-400'
                            }`}
                          >
                            {masking.unmasked.includes(g.id) ? (
                              <>
                                <Eye aria-hidden className="h-2.5 w-2.5" /> clear
                              </>
                            ) : (
                              <>
                                <EyeOff aria-hidden className="h-2.5 w-2.5" /> masked
                              </>
                            )}
                          </button>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((c) => {
                    const open = openCol === c.column;
                    const finding = piiByColumn.get(c.column.toUpperCase());
                    const isMasked = masking.columns.includes(c.column);
                    return (
                      <Fragment key={c.column}>
                        <tr className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 dark:border-slate-800 dark:hover:bg-slate-800/40">
                          <th scope="row" className="sticky left-0 z-10 bg-white py-1.5 pr-3 text-left align-top dark:bg-slate-900">
                            <button
                              type="button"
                              aria-expanded={open}
                              onClick={() => setOpenCol(open ? null : c.column)}
                              className="flex items-start gap-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                            >
                              {open ? (
                                <ChevronDown aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                              ) : (
                                <ChevronRight aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                              )}
                              <span className="min-w-0">
                                <span className="flex flex-wrap items-center gap-1">
                                  <span className="font-mono text-xs font-medium text-slate-800 dark:text-slate-200">
                                    {c.column}
                                  </span>
                                  {isMasked && layer !== 'cls' && (
                                    <EyeOff aria-hidden className="h-3 w-3 text-accent-500" />
                                  )}
                                  {finding && finding.pii !== false && (
                                    <span
                                      title={`${finding.label ?? finding.category} — ${finding.note ?? finding.basis_summary ?? ''}`}
                                      className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-px text-[10px] ${truthTone(finding.truth).cls}`}
                                    >
                                      <ShieldAlert aria-hidden className="h-2.5 w-2.5" />
                                      {finding.gdpr ? 'GDPR' : 'PII'}
                                      {finding.decision === 'confirm' ? ' ✓' : ''}
                                    </span>
                                  )}
                                </span>
                                {c.tables.length > 0 && (
                                  <span className="block max-w-[16rem] truncate text-[11px] text-slate-400">
                                    {c.tables.join(', ')}
                                    {c.tables.length > 1 ? ' — one rule, all tables' : ''}
                                  </span>
                                )}
                              </span>
                            </button>
                          </th>

                          {grantTypes.map((g) => {
                            if (layer === 'rls') {
                              const { restricted, count } = rlsCell(c, g.id);
                              return (
                                <td key={g.id} className="px-2 py-1.5 text-center align-middle">
                                  <button
                                    type="button"
                                    onClick={() => setOpenCol(open ? null : c.column)}
                                    title={
                                      restricted
                                        ? `${g.label ?? g.id} is restricted to ${count} value(s) — click to edit`
                                        : `${g.label ?? g.id} sees every row — click to restrict`
                                    }
                                    className={`inline-flex min-w-[4.5rem] items-center justify-center rounded-full px-2 py-0.5 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                                      restricted
                                        ? 'bg-accent-600/10 font-medium text-accent-700 dark:bg-accent-900/30 dark:text-accent-200'
                                        : 'text-slate-400 hover:bg-slate-100 dark:text-slate-500 dark:hover:bg-slate-800'
                                    }`}
                                  >
                                    {restricted ? `= ${count} value${count > 1 ? 's' : ''}` : 'every row'}
                                  </button>
                                </td>
                              );
                            }
                            const state = clsCell(c, g.id);
                            return (
                              <td key={g.id} className="px-2 py-1.5 text-center align-middle">
                                {state === 'unset' ? (
                                  <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                                ) : state === 'masked' ? (
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                    <EyeOff aria-hidden className="h-3 w-3" /> masked
                                  </span>
                                ) : (
                                  <span
                                    title="This role is exempt — it reads the real value"
                                    className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                                  >
                                    <Eye aria-hidden className="h-3 w-3" /> clear
                                  </span>
                                )}
                              </td>
                            );
                          })}
                        </tr>

                        {open && (
                          <tr className="border-b border-slate-100 dark:border-slate-800">
                            <td colSpan={grantTypes.length + 1} className="bg-slate-50/70 p-2.5 dark:bg-slate-800/40">
                              {layer === 'rls' ? (
                                <RlsEditor
                                  col={c}
                                  grantTypes={grantTypes}
                                  policy={policy}
                                  onPolicy={onPolicy}
                                  sim={sims[c.column]}
                                  onSimulate={() => void simulate(c)}
                                  grantLabel={grantLabel}
                                />
                              ) : (
                                <MaskEditor
                                  col={c}
                                  isMasked={isMasked}
                                  masking={masking}
                                  onToggleMask={onToggleMask}
                                  grantTypes={grantTypes}
                                  grantLabel={grantLabel}
                                  finding={piiByColumn.get(c.column.toUpperCase())}
                                />
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {layer === 'rls'
              ? 'A cell shows what that role sees; click a column to restrict its rows per role. Values come from the data actually observed. A row rule lives on the Data360 role and is reused by everyone who holds it — nothing is applied here.'
              : 'A masked column is hidden from every role except the exempt ones in the header (ACCOUNTADMIN always reads clear). Masking is one exemption list for the whole change, not per column — that is why the header, not each cell, carries the toggle.'}
          </p>
        </section>
      )}

      {actionBar}
    </div>
  );
}

/* ── the per-column RLS editor (opened row) — one line of value chips per
 *  role, plus the "Who would see what?" plan simulation preserved intact. ── */
function RlsEditor({
  col,
  grantTypes,
  policy,
  onPolicy,
  sim,
  onSimulate,
  grantLabel,
}: {
  col: GridColumn;
  grantTypes: GrantTypeInfo[];
  policy: PolicyMapping;
  onPolicy: (column: string, grantType: string, values: string[] | '*') => void;
  sim: RlsPlanSimulation | 'running' | { error: string } | undefined;
  onSimulate: () => void;
  grantLabel: (id: string) => string;
}) {
  const hasRule = Object.values(policy[col.column] ?? {}).some((v) => Array.isArray(v) && v.length > 0);
  if (col.values.length === 0) {
    return (
      <p className="text-xs text-slate-500 dark:text-slate-400">
        No repeated values were observed in <span className="font-mono">{col.column}</span>, so its rows
        cannot be restricted by value. Mask it instead, under Column masking.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {grantTypes.map((g) => {
        const cur = policy[col.column]?.[g.id];
        const kept = Array.isArray(cur) ? cur : [];
        const seeAll = kept.length === 0;
        return (
          <div key={g.id} className="flex flex-wrap items-center gap-1.5">
            <span className="w-20 shrink-0 text-xs font-medium text-slate-600 dark:text-slate-300">
              {g.label ?? g.id}
            </span>
            <button
              type="button"
              aria-pressed={seeAll}
              onClick={() => onPolicy(col.column, g.id, '*')}
              className={`rounded-full border px-2 py-0.5 text-xs ${
                seeAll
                  ? 'border-accent-500 bg-accent-600 text-white'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
              }`}
            >
              every row
            </button>
            {col.values.map((v) => {
              const on = kept.includes(v);
              return (
                <button
                  key={v}
                  type="button"
                  aria-pressed={on}
                  onClick={() =>
                    onPolicy(col.column, g.id, seeAll ? [v] : on ? kept.filter((x) => x !== v) : [...kept, v])
                  }
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    on
                      ? 'border-accent-500 bg-accent-600 text-white'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                  }`}
                >
                  {v}
                </button>
              );
            })}
          </div>
        );
      })}

      <div>
        <button
          type="button"
          disabled={!hasRule || sim === 'running'}
          onClick={onSimulate}
          title={hasRule ? 'Count, on the real data, what each role would see — nothing is applied' : 'Restrict at least one role first'}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-slate-300 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-300"
        >
          {sim === 'running' ? <RefreshCw aria-hidden className="h-3 w-3 animate-spin" /> : <Eye aria-hidden className="h-3 w-3" />}
          Who would see what?
        </button>
        {sim && sim !== 'running' && 'error' in sim && (
          <p role="alert" className="mt-1 text-xs text-red-600 dark:text-red-400">
            {sim.error}
          </p>
        )}
        {sim && sim !== 'running' && !('error' in sim) && (
          <div role="status" className="mt-1 space-y-0.5 rounded-lg bg-white p-1.5 text-xs dark:bg-slate-900">
            <p className="text-slate-500 dark:text-slate-400">
              measured on <span className="font-mono">{col.fqns[0]?.split('.').slice(-1)[0] ?? col.column}</span> ·{' '}
              {sim.total_rows ?? '—'} rows — simulated on the plan, nothing applied
            </p>
            {Object.entries(sim.by_grant_type ?? {}).map(([gt, r]) => {
              const everything = r.allowed_values !== '*' && (r.share ?? 0) >= 1;
              return (
                <p key={gt} title={r.filter} className={everything ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-slate-700 dark:text-slate-200'}>
                  {grantLabel(gt)}: {r.visible_rows ?? '—'} of {sim.total_rows ?? '—'} rows
                  {r.share != null ? ` (${Math.round(r.share * 100)}%)` : ''}
                  {everything && ' — the chosen values cover the whole table; this restricts nothing'}
                </p>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── the per-column mask editor (opened row): the on/off toggle + the reminder
 *  that the exemption is shared across every masked column. ── */
function MaskEditor({
  col,
  isMasked,
  masking,
  onToggleMask,
  grantTypes,
  grantLabel,
  finding,
}: {
  col: GridColumn;
  isMasked: boolean;
  masking: { columns: string[]; unmasked: string[] };
  onToggleMask: (column: string) => void;
  grantTypes: GrantTypeInfo[];
  grantLabel: (id: string) => string;
  finding?: PiiFinding;
}) {
  const seenClear = grantTypes.filter((g) => masking.unmasked.includes(g.id)).map((g) => g.label ?? g.id);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={isMasked}
          onClick={() => onToggleMask(col.column)}
          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
            isMasked
              ? 'bg-accent-600 text-white hover:bg-accent-700'
              : 'border border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
          }`}
        >
          {isMasked ? <EyeOff aria-hidden className="h-3.5 w-3.5" /> : <Eye aria-hidden className="h-3.5 w-3.5" />}
          {isMasked ? 'Masked — click to stop masking' : 'Mask this column'}
        </button>
        {finding && finding.pii !== false && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Flagged {finding.gdpr ? 'GDPR ' : ''}
            {finding.label ?? finding.category} ({truthTone(finding.truth).word})
          </span>
        )}
      </div>
      {isMasked && (
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Seen in clear by {seenClear.length ? seenClear.join(', ') : 'no one'} (plus ACCOUNTADMIN). This
          exemption is shared by every masked column — change who sees clear from the role headers above.
          The masking policy is written for text columns; adapt the column type before applying.
        </p>
      )}
    </div>
  );
}

/* ── the masking layer's header: the shared exemption list + a way to mask a
 *  column that is not in the observed candidates. ── */
function MaskingHeader({
  grantTypes,
  masking,
  onToggleUnmask,
  maskInput,
  setMaskInput,
  onToggleMask,
}: {
  grantTypes: GrantTypeInfo[];
  masking: { columns: string[]; unmasked: string[] };
  onToggleUnmask: (grantType: string) => void;
  maskInput: string;
  setMaskInput: (v: string) => void;
  onToggleMask: (column: string) => void;
}) {
  return (
    <div className="mb-3 space-y-2 rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/50">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">Seen in clear by</span>
        {grantTypes.map((g) => {
          const on = masking.unmasked.includes(g.id);
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggleUnmask(g.id)}
              className={`rounded-lg px-2.5 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                on ? 'bg-accent-600 font-medium text-white' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700'
              }`}
            >
              {g.label ?? g.id}
            </button>
          );
        })}
        <span className="text-[11px] text-slate-400">everyone else reads masked</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          value={maskInput}
          onChange={(e) => setMaskInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && maskInput.trim()) {
              onToggleMask(maskInput.trim().toUpperCase());
              setMaskInput('');
            }
          }}
          placeholder="mask a column not listed (e.g. EMAIL)"
          aria-label="Column to mask"
          className="h-8 w-64 rounded-lg border border-slate-200 bg-white px-2 font-mono text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        />
        <button
          type="button"
          disabled={!maskInput.trim()}
          onClick={() => {
            onToggleMask(maskInput.trim().toUpperCase());
            setMaskInput('');
          }}
          className="h-8 rounded-lg border border-slate-200 px-2.5 text-[13px] text-slate-700 hover:border-slate-300 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
        >
          Mask
        </button>
      </div>
    </div>
  );
}

/* ── the PII / GDPR layer — detect → confirm/reject → (mask staged) ─────── */
function PiiPanel({
  pii,
  piiBusy,
  piiErr,
  deciding,
  onDetect,
  onDetectContent,
  footprintColumns,
  onDecide,
  masking,
}: {
  pii: PiiReport | null;
  piiBusy: boolean;
  piiErr: string | null;
  deciding: string | null;
  onDetect: () => void;
  /** the bounded content pass (use_sample) — credit-costing, labelled so */
  onDetectContent?: () => void;
  /** the honest denominator — how many columns the app actually reads */
  footprintColumns?: number | null;
  onDecide: (f: PiiFinding, d: 'confirm' | 'reject') => void;
  masking: { columns: string[]; unmasked: string[] };
}) {
  const findings = (pii?.findings ?? []).filter((f) => f.pii !== false);
  // special (health/national-id/bank) first, then by confidence
  const ordered = [...findings].sort(
    (a, b) => Number(!!b.special) - Number(!!a.special) || (b.confidence ?? 0) - (a.confidence ?? 0),
  );
  const counts = pii?.counts;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-center gap-2">
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <Fingerprint aria-hidden className="h-3.5 w-3.5" />
          PII / GDPR — sensitive columns
        </p>
        <span className="ml-auto flex items-center gap-1.5">
          {/* a NAME-only run already exists: the credit-costing content pass is
              the deduced next step for proposals stuck at "proposed" — labelled
              with its cost, never a bare verb */}
          {onDetectContent && pii && (pii.findings?.length ?? 0) > 0 && (
            <button
              type="button"
              disabled={piiBusy}
              onClick={onDetectContent}
              title="Reads a bounded sample of the real values to turn name-based proposals into evidence — a credit-costing read, never run on its own"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-600 hover:border-slate-300 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-300"
            >
              Add content evidence (credit-costing)
            </button>
          )}
          <button
            type="button"
            disabled={piiBusy}
            onClick={onDetect}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          >
            {piiBusy ? <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" /> : <Fingerprint aria-hidden className="h-3.5 w-3.5" />}
            {/* the button carries its deduced denominator — what it would
                classify, and that the name pass is free */}
            {pii && (pii.findings?.length ?? 0) > 0
              ? 'Re-detect (name-based, free)'
              : `Detect PII / GDPR${footprintColumns != null ? ` — classify the ${footprintColumns} columns` : ''} (name-based, free)`}
          </button>
        </span>
      </div>

      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {pii?.principle ??
          'A name match is a proposal to confirm, not a fact; opaque columns are never guessed. Masking is one control — confirming here does not make the application GDPR-compliant on its own.'}
      </p>

      {/* WHICH detectors actually ran — name-only must never read as full
          coverage; the deeper bases (content, samples, the warehouse's own
          classifier) are priced options, said as such */}
      {pii?.bases_used && (
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-400 dark:text-slate-500">
          <span className="font-medium text-slate-500 dark:text-slate-400">Detection coverage:</span>
          <span>
            {[
              pii.bases_used.name && 'column names',
              pii.bases_used.scan && 'content scan',
              pii.bases_used.sample && 'value samples',
              (pii.bases_used as Record<string, unknown>).native === true &&
                'the warehouse’s built-in classifier',
            ]
              .filter(Boolean)
              .join(' · ') || 'none yet'}
          </span>
          {!(pii.bases_used.scan || pii.bases_used.sample) && (
            <span>
              — deeper detection is a priced option on{' '}
              <a
                href="/studio/source"
                className="rounded text-accent-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-400"
              >
                the Sources page
              </a>
              .
            </span>
          )}
        </p>
      )}

      {piiErr && (
        <p role="alert" className="mt-2 text-[13px] text-red-600 dark:text-red-400">
          {piiErr}
        </p>
      )}

      {pii === null ? (
        <div className="mt-3 h-16 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" aria-hidden />
      ) : ordered.length === 0 ? (
        <p className="mt-3 text-[13px] text-slate-500 dark:text-slate-400">
          {pii.findings === undefined
            ? 'Run detection to classify this application’s columns.'
            : 'No sensitive column was found by name. Content-based evidence would need a bounded value scan.'}
        </p>
      ) : (
        <>
          {counts && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(counts.by_category ?? {}).map(([cat, n]) => (
                <span key={cat} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {cat.replace(/_/g, ' ')} · {n}
                </span>
              ))}
              {(counts.confirmed ?? 0) > 0 && (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                  {counts.confirmed} confirmed
                </span>
              )}
            </div>
          )}

          <ul className="mt-2 space-y-1.5">
            {ordered.map((f) => {
              const key = `${f.fqn}.${f.column}`;
              const staged = f.column && (masking.columns.includes(f.column.toUpperCase()) || masking.columns.includes(f.column));
              const tone = truthTone(f.truth);
              return (
                <li
                  key={key}
                  className={`rounded-lg border p-2 ${
                    f.decision === 'reject'
                      ? 'border-slate-200 bg-slate-50/50 opacity-60 dark:border-slate-800 dark:bg-slate-900/40'
                      : f.special
                        ? 'border-red-200 dark:border-red-500/30'
                        : 'border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-mono text-xs font-medium text-slate-800 dark:text-slate-200">{f.column}</span>
                    <span className="max-w-[14rem] truncate text-[11px] text-slate-400">
                      {String(f.fqn ?? '').split('.').slice(-1)[0]}
                    </span>
                    <span className={`rounded-full px-1.5 py-px text-[11px] ${tone.cls}`}>{tone.word}</span>
                    {f.special && (
                      <span className="rounded-full bg-red-50 px-1.5 py-px text-[11px] font-medium text-red-700 dark:bg-red-900/30 dark:text-red-300">
                        special category
                      </span>
                    )}
                    {f.gdpr && (
                      <span className="rounded-full bg-slate-100 px-1.5 py-px text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        GDPR
                      </span>
                    )}
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {f.label ?? f.category}
                      {f.confidence != null ? ` · ${Math.round(f.confidence * 100)}%` : ''}
                    </span>
                    <span className="ml-auto flex items-center gap-1">
                      {f.decision === 'confirm' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                          <Check aria-hidden className="h-3 w-3" /> confirmed
                          {staged ? ' · mask staged' : ''}
                        </span>
                      ) : f.decision === 'reject' ? (
                        <button
                          type="button"
                          disabled={deciding === key}
                          onClick={() => onDecide(f, 'confirm')}
                          className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:border-slate-300 disabled:opacity-40 dark:border-slate-700 dark:text-slate-300"
                        >
                          Undo — confirm
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            disabled={deciding === key}
                            onClick={() => onDecide(f, 'confirm')}
                            title={
                              f.recommended_action === 'row_restrict'
                                ? 'Confirm — recommended control is a row restriction, set it under Row rules'
                                : 'Confirm and stage the mask for this column'
                            }
                            className="inline-flex items-center gap-1 rounded-lg bg-accent-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
                          >
                            {deciding === key ? <RefreshCw aria-hidden className="h-3 w-3 animate-spin" /> : <ShieldCheck aria-hidden className="h-3 w-3" />}
                            {f.recommended_action === 'row_restrict' ? 'Confirm' : 'Confirm & mask'}
                          </button>
                          <button
                            type="button"
                            disabled={deciding === key}
                            onClick={() => onDecide(f, 'reject')}
                            className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-500 hover:border-slate-300 disabled:opacity-40 dark:border-slate-700 dark:text-slate-400"
                          >
                            Not PII
                          </button>
                        </>
                      )}
                    </span>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
                    <Database aria-hidden className="h-3 w-3 shrink-0 text-slate-400" />
                    {(f.basis ?? []).map((b) => b.detail).filter(Boolean).join(' · ') || f.basis_summary || 'name match'}
                    {f.why_action ? ` — recommended: ${f.recommended_action}` : ''}
                  </p>
                </li>
              );
            })}
          </ul>

          <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Confirming stages a mask into the change below; it becomes compliant only once an administrator
            applies it, and masking is one control among several — detection is not, by itself, GDPR compliance.
          </p>
        </>
      )}
    </section>
  );
}
