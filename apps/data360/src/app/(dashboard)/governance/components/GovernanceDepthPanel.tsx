'use client';

/**
 * GovernanceDepthPanel — three advisory, read-only governance "depth" probes:
 *
 *   D1  Row-access simulate   — who-can-see preview for a table under a role/user
 *   D2  Masking preview       — masking expression (+ sample) applied per column
 *   D3  Least-privilege       — granted-but-unused grants for a role (advisory)
 *
 * Each section uses {@link InsightActionButton}, which SELF-DISABLES when the
 * backend route is absent (404/501) — so this panel ships safely before the
 * endpoints are deployed and lights up with zero redeploy once they are.
 *
 * Honesty rules (per CLAUDE.md):
 *  - `available: false` → render the note only, never fabricated values.
 *  - null/undefined metrics render as "—", never `?? 0`.
 *  - data flagged unavailable is never rendered.
 *  - all three are ~0-credit, read-only probes (annotated in the UI).
 *
 * Gating: each action is gated with useCanPerform('gouvernance', 'view') —
 * these are advisory reads, so they require the view capability only.
 */
import { useState } from 'react';
import { PiEyeSlash, PiLockKey, PiShieldCheck } from 'react-icons/pi';
import InsightActionButton from '@/app/shared/insights/InsightActionButton';
import { useCanPerform } from '@/hooks/useCanPerform';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { DEFAULTS } from '@/config/database.config';
import {
  simulateRowAccess,
  previewMasking,
  getRoleLeastPrivilege,
  type RowAccessSimulateResult,
  type MaskingPreviewResult,
  type LeastPrivilegeResult,
} from '@/app/services/governance/policies';

/** Render a nullable number as a localized value or an em-dash. */
function num(n: number | null | undefined): string {
  return n == null ? '—' : n.toLocaleString();
}

/** Render a nullable string as itself or an em-dash. */
function str(s: string | null | undefined): string {
  return s == null || s === '' ? '—' : s;
}

const inputCls =
  'w-full rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none focus:ring-1 focus:ring-blue-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100';
const labelCls =
  'mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400';

function Section({
  icon: Icon,
  title,
  subtitle,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-sm dark:border-slate-700/70 dark:bg-slate-900">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            {title}
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">
              ~0 credits · read-only
            </span>
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400">{subtitle}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

/** Quiet advisory note (used for available:false and backend `note` text). */
function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-md bg-slate-50 px-2.5 py-2 text-xs text-slate-600 dark:bg-slate-800/60 dark:text-slate-400">
      {children}
    </p>
  );
}

export default function GovernanceDepthPanel() {
  const { trackFeatureClick } = useTrackEvent();
  const canView = useCanPerform('gouvernance', 'view');
  const capable = canView.loading ? undefined : canView.allowed;

  // --- D1 Row-access simulate ---
  const [rlsDb, setRlsDb] = useState<string>(DEFAULTS.DATABASE);
  const [rlsSchema, setRlsSchema] = useState<string>(DEFAULTS.SCHEMA);
  const [rlsTable, setRlsTable] = useState('');
  const [rlsRole, setRlsRole] = useState('');
  const [rlsResult, setRlsResult] = useState<RowAccessSimulateResult | null>(null);

  // --- D2 Masking preview ---
  const [maskDb, setMaskDb] = useState<string>(DEFAULTS.DATABASE);
  const [maskSchema, setMaskSchema] = useState<string>(DEFAULTS.SCHEMA);
  const [maskTable, setMaskTable] = useState('');
  const [maskColumn, setMaskColumn] = useState('');
  const [maskResult, setMaskResult] = useState<MaskingPreviewResult | null>(null);

  // --- D3 Least-privilege ---
  const [lpRole, setLpRole] = useState('');
  const [lpResult, setLpResult] = useState<LeastPrivilegeResult | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Governance Depth
        </h2>
        <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        <span className="text-[11px] text-slate-400">Advisory probes — no changes applied</span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* D1 — Row-access simulate */}
        <Section
          icon={PiLockKey}
          title="Row-access simulate"
          subtitle="Preview which rows a role or user would see under the row-access policy."
        >
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Database</label>
              <input className={inputCls} value={rlsDb} onChange={(e) => setRlsDb(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Schema</label>
              <input className={inputCls} value={rlsSchema} onChange={(e) => setRlsSchema(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Table</label>
              <input className={inputCls} placeholder="ORDERS" value={rlsTable} onChange={(e) => setRlsTable(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Role</label>
              <input className={inputCls} placeholder="ANALYST" value={rlsRole} onChange={(e) => setRlsRole(e.target.value)} />
            </div>
          </div>

          <div className="mt-3">
            <InsightActionButton
              label="Simulate"
              variant="primary"
              size="md"
              capable={capable && Boolean(rlsTable.trim() && rlsRole.trim())}
              unavailableHint="Provide a table + role (route may not be deployed)"
              successToast="Row-access simulated"
              onAction={async () => {
                const r = await simulateRowAccess({
                  database: rlsDb.trim(),
                  schema: rlsSchema.trim(),
                  table: rlsTable.trim(),
                  role: rlsRole.trim(),
                });
                trackFeatureClick('rls_simulated', { table: rlsTable.trim(), role: rlsRole.trim() });
                return r;
              }}
              onDone={(r) => setRlsResult(r as RowAccessSimulateResult)}
            />
          </div>

          {rlsResult && !rlsResult.available && (
            <Note>{str(rlsResult.note) === '—' ? 'Not available on this backend.' : rlsResult.note}</Note>
          )}
          {rlsResult && rlsResult.available && (
            <div className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between rounded-md bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/60">
                <span className="text-slate-500">Policy applies</span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {rlsResult.applies == null ? '—' : rlsResult.applies ? 'Yes' : 'No'}
                </span>
              </div>
              <div>
                <span className="text-slate-500">Predicate</span>
                <pre className="mt-1 whitespace-pre-wrap break-words rounded-md bg-slate-900/90 px-2.5 py-2 font-mono text-[11px] text-slate-100">
                  {str(rlsResult.predicate)}
                </pre>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md bg-emerald-50 px-2.5 py-1.5 dark:bg-emerald-900/20">
                  <div className="text-[10px] uppercase text-emerald-700 dark:text-emerald-400">Visible</div>
                  <div className="font-semibold text-emerald-800 dark:text-emerald-300">{num(rlsResult.visible_count)}</div>
                </div>
                <div className="rounded-md bg-rose-50 px-2.5 py-1.5 dark:bg-rose-900/20">
                  <div className="text-[10px] uppercase text-rose-700 dark:text-rose-400">Hidden</div>
                  <div className="font-semibold text-rose-800 dark:text-rose-300">{num(rlsResult.hidden_count)}</div>
                </div>
              </div>
              {rlsResult.note && <Note>{rlsResult.note}</Note>}
            </div>
          )}
        </Section>

        {/* D2 — Masking preview */}
        <Section
          icon={PiEyeSlash}
          title="Masking preview"
          subtitle="Inspect the masking expression (and a masked sample) applied per column."
        >
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Database</label>
              <input className={inputCls} value={maskDb} onChange={(e) => setMaskDb(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Schema</label>
              <input className={inputCls} value={maskSchema} onChange={(e) => setMaskSchema(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Table</label>
              <input className={inputCls} placeholder="CUSTOMERS" value={maskTable} onChange={(e) => setMaskTable(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Column (optional)</label>
              <input className={inputCls} placeholder="EMAIL" value={maskColumn} onChange={(e) => setMaskColumn(e.target.value)} />
            </div>
          </div>

          <div className="mt-3">
            <InsightActionButton
              label="Preview masking"
              variant="primary"
              size="md"
              capable={capable && Boolean(maskTable.trim())}
              unavailableHint="Provide a table (route may not be deployed)"
              successToast="Masking preview ready"
              onAction={async () => {
                const r = await previewMasking({
                  database: maskDb.trim(),
                  schema: maskSchema.trim(),
                  table: maskTable.trim(),
                  ...(maskColumn.trim() ? { column: maskColumn.trim() } : {}),
                });
                trackFeatureClick('masking_previewed', {
                  table: maskTable.trim(),
                  column: maskColumn.trim() || undefined,
                });
                return r;
              }}
              onDone={(r) => setMaskResult(r as MaskingPreviewResult)}
            />
          </div>

          {maskResult && (
            <div className="mt-3 space-y-2">
              {maskResult.columns.length === 0 && <Note>No masking policies found for this target.</Note>}
              {maskResult.columns.map((col) => (
                <div
                  key={col.column}
                  className="rounded-md border border-slate-200 px-2.5 py-2 text-xs dark:border-slate-700"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-slate-900 dark:text-white">{col.column}</span>
                    {col.policy && (
                      <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-700 dark:bg-amber-900/20 dark:text-amber-400">
                        {col.policy}
                      </span>
                    )}
                  </div>
                  {col.available ? (
                    <>
                      <pre className="mt-1.5 whitespace-pre-wrap break-words rounded bg-slate-900/90 px-2 py-1.5 font-mono text-[11px] text-slate-100">
                        {str(col.masking_expr)}
                      </pre>
                      {col.preview != null && (
                        <div className="mt-1 text-[11px] text-slate-500">
                          Sample: <span className="font-mono text-slate-700 dark:text-slate-300">{col.preview}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="mt-1 text-[11px] italic text-slate-400">Preview not available for this column.</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* D3 — Least-privilege */}
        <Section
          icon={PiShieldCheck}
          title="Least-privilege review"
          subtitle="Surface privileges granted to a role but unused over a recent window."
        >
          <div>
            <label className={labelCls}>Role</label>
            <input className={inputCls} placeholder="ANALYST" value={lpRole} onChange={(e) => setLpRole(e.target.value)} />
          </div>

          <div className="mt-3">
            <InsightActionButton
              label="Review grants"
              variant="primary"
              size="md"
              capable={capable && Boolean(lpRole.trim())}
              unavailableHint="Provide a role (route may not be deployed)"
              successToast="Least-privilege review ready"
              onAction={async () => {
                const r = await getRoleLeastPrivilege(lpRole.trim());
                trackFeatureClick('least_privilege_reviewed', { role: lpRole.trim() });
                return r;
              }}
              onDone={(r) => setLpResult(r as LeastPrivilegeResult)}
            />
          </div>

          {lpResult && !lpResult.available && (
            <Note>{str(lpResult.note) === '—' ? 'Not available on this backend.' : lpResult.note}</Note>
          )}
          {lpResult && lpResult.available && (
            <div className="mt-3 space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-md bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/60">
                  <div className="text-[10px] uppercase text-slate-500">Granted</div>
                  <div className="font-semibold text-slate-900 dark:text-white">{num(lpResult.granted_count)}</div>
                </div>
                <div className="rounded-md bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/60">
                  <div className="text-[10px] uppercase text-slate-500">Used</div>
                  <div className="font-semibold text-slate-900 dark:text-white">{num(lpResult.used_count)}</div>
                </div>
              </div>
              {lpResult.window_days != null && (
                <p className="text-[11px] text-slate-500">Window: {lpResult.window_days} days</p>
              )}
              <div>
                <div className="mb-1 text-[10px] uppercase text-slate-500">
                  Unused grants ({lpResult.unused_grants.length})
                </div>
                {lpResult.unused_grants.length === 0 ? (
                  <p className="text-[11px] italic text-slate-400">No unused grants — role is well-scoped.</p>
                ) : (
                  <ul className="space-y-1">
                    {lpResult.unused_grants.map((g, i) => (
                      <li
                        key={`${g.privilege}-${g.object}-${i}`}
                        className="flex items-center justify-between rounded-md bg-rose-50 px-2 py-1 dark:bg-rose-900/15"
                      >
                        <span className="font-mono text-[11px] text-rose-800 dark:text-rose-300">{g.privilege}</span>
                        <span className="truncate pl-2 font-mono text-[11px] text-slate-600 dark:text-slate-400">{g.object}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {lpResult.note && <Note>{lpResult.note}</Note>}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}
