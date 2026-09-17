'use client';

/**
 * StudioGovernanceMap — data-access IAM as a master-detail, not a wall of blocks.
 *
 * The layering never changes: data permissions live ONCE on the application's
 * access role, and the five Data360 roles (view · edit · operate · approve ·
 * admin) reuse it. Nobody is granted a table directly — so "who can do what"
 * is answered by ASSOCIATING a person or a warehouse role with a Data360 role.
 *
 * The surface used to stack four full-width blocks down the page. Now it is a
 * small tab bar over ONE panel at a time, and access is edited the way the
 * question is actually asked: you SELECT a person or role, and a detail panel
 * opens where you pick the Data360 role from cards that say — in business
 * words — what that role lets them do. Row policies and column masking are
 * their own panels; the prepared change and its dry-run / apply / test live
 * under « Review & apply ».
 *
 * Honesty: nothing here executes, and this panel composes NEW access. A
 * person's already-standing app grant is NOT served per person, so an unset
 * row means "no new grant chosen" — never a verified "has no access". The
 * proof of who can really read is « Test the reads », under Review.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  LayoutGrid,
  Play,
  RefreshCw,
  ShieldCheck,
  UserPlus,
} from 'lucide-react';
import type { AccessView, RlsSuggestion } from '@/app/services/studio/studio-api';
import StudioAccessGrid from '@/app/shared/studio/StudioAccessGrid';
import StudioGiveAccess from '@/app/shared/studio/StudioGiveAccess';
import StudioPolicyCatalog from '@/app/shared/studio/StudioPolicyCatalog';

export interface Principal {
  name: string;
  kind: 'user' | 'role';
  /** warehouse roles this person already holds, when known */
  holds?: string[];
  disabled?: boolean;
}

/** name → Data360 grant type, or '' for "not mapped". */
export type RoleMapping = Record<string, string>;
/** column → grant type → allowed values ('*' = every value). */
export type PolicyMapping = Record<string, Record<string, string[] | '*'>>;

/** The grant type as the parent actually serves it — label + business
 *  description + the concrete actions it allows, so the picker reads as cards
 *  and not as an enum. */
export interface GrantTypeInfo {
  id: string;
  label?: string;
  description?: string;
  actions?: string[];
  product_level?: string;
}

type SubTab = 'policies' | 'grants';

export default function StudioGovernanceMap({
  draftId,
  view,
  gov,
  grantTypes,
  principals,
  principalsNote,
  mapping,
  onMap,
  policy,
  onPolicy,
  masking,
  onToggleMask,
  onToggleUnmask,
  onPrepare,
  onTest,
  busy,
  canPrepare,
  footer,
  prefill,
}: {
  draftId: string;
  view: AccessView;
  /** a model/quality detection deep-links here with the layer to open and
   *  the column already in play — the redirect lands on a READY form */
  prefill?: { kind: 'mask' | 'row'; column?: string } | null;
  gov: RlsSuggestion | null;
  grantTypes: GrantTypeInfo[];
  principals: Principal[] | null;
  /** why the list is short or empty — never leave that unexplained */
  principalsNote?: string;
  mapping: RoleMapping;
  onMap: (name: string, grantType: string) => void;
  policy: PolicyMapping;
  onPolicy: (column: string, grantType: string, values: string[] | '*') => void;
  /** column-level security: which columns are hidden, and which Data360
   *  roles still see them in clear (defaults to admin + approve). */
  masking: { columns: string[]; unmasked: string[] };
  onToggleMask: (column: string) => void;
  onToggleUnmask: (grantType: string) => void;
  /** stage / verify actions, so a policy tab is self-sufficient — the full
   *  checkboxed apply still lives under « Review & apply ». */
  onPrepare?: () => void;
  onTest?: () => void;
  busy?: string | null;
  canPrepare?: boolean;
  footer?: React.ReactNode;
}) {
  const [subTab, setSubTab] = useState<SubTab>('policies');
  // a detection redirect opens the grid on the right layer, seeded
  useEffect(() => {
    if (!prefill) return;
    setSubTab('policies');
    if (prefill.kind === 'mask' && prefill.column && !masking.columns.includes(prefill.column)) {
      onToggleMask(prefill.column); // pre-stage the mask on the detected column
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill]);
  const roles = gov?.roles ?? view.diff?.roles ?? {};
  const functional = roles.functional ?? {};
  const objects = view.me?.objects ?? [];

  /* one candidate per column — the same column on two tables is one policy,
   * and showing it twice invites granting the values of the wrong table */
  const columns = useMemo(() => {
    const byCol = new Map<string, { column: string; tables: string[]; fqns: string[]; values: string[] }>();
    for (const c of gov?.candidates ?? []) {
      const col = c.column ?? '';
      if (!col) continue;
      const cur = byCol.get(col) ?? { column: col, tables: [], fqns: [], values: [] };
      if (c.fqn) {
        cur.tables.push(c.fqn.split('.').slice(-1)[0]);
        cur.fqns.push(c.fqn);
      }
      for (const v of c.observed_values ?? []) {
        const s = String(v.value ?? '');
        if (s && !cur.values.includes(s)) cur.values.push(s);
      }
      byCol.set(col, cur);
    }
    return [...byCol.values()];
  }, [gov]);

  const mapped = Object.values(mapping).filter(Boolean).length;
  /* a rule is a role NARROWED to specific values — `*`/unset means "sees
   * every row", the default, which is not a restriction. */
  const ruleCount = columns.filter((c) =>
    grantTypes.some((g) => {
      const v = policy[c.column]?.[g.id];
      return Array.isArray(v) && v.length > 0;
    }),
  ).length;

  /* Prepare / Test on the policy tab itself — the full checkboxed apply
     stays under « Review & apply », one click away. */
  const actionBar = (onPrepare || onTest) && (
    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
      {onPrepare && (
        <button
          type="button"
          disabled={busy != null || canPrepare === false}
          // the prepared change, its result and any error render under
          // « Review & apply »; open it so the outcome is on the tab the user
          // is looking at, instead of a spinner that stops with nothing shown.
          onClick={() => {
            onPrepare();
            setSubTab('grants');
          }}
          title={
            canPrepare === false
              ? 'Map a person/role, paint a row rule, or mask a column first'
              : 'Stage this change — nothing runs yet'
          }
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        >
          {busy === 'plan' && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
          Prepare the change
        </button>
      )}
      {onTest && (
        <button
          type="button"
          disabled={busy != null}
          // the test results render under « Review & apply » — open it so the
          // reads show where the user is looking, not on a hidden tab.
          onClick={() => {
            onTest();
            setSubTab('grants');
          }}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-600 hover:border-slate-300 disabled:opacity-50 dark:border-slate-700 dark:text-slate-300"
        >
          {busy === 'test' ? (
            <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play aria-hidden className="h-3.5 w-3.5" />
          )}
          Test the reads
        </button>
      )}
      <button
        type="button"
        onClick={() => setSubTab('grants')}
        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-600 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-300"
      >
        Review &amp; apply
        <ChevronRight aria-hidden className="h-3.5 w-3.5" />
      </button>
    </div>
  );

  /* the user's chosen shape: TWO flows only — policies (row rules, masking,
   * PII, the account catalog) and grants (data-access levels to roles, then
   * review & apply). People management lives in Administration, not here. */
  const TABS: Array<{ id: SubTab; label: string; icon: typeof UserPlus; count?: number }> = [
    { id: 'policies', label: 'Policies', icon: LayoutGrid, count: ruleCount + masking.columns.length || undefined },
    { id: 'grants', label: 'Grants', icon: UserPlus, count: mapped || undefined },
  ];

  return (
    <div className="space-y-3">
      {/* ── what already exists, stated once, compactly ──────────────── */}
      <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center gap-2">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
            <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
            The roles this application already has
          </p>
          {roles.access_role && (
            <span
              className="rounded-lg border border-slate-200 px-2 py-0.5 font-mono text-xs text-slate-700 dark:border-slate-700 dark:text-slate-300"
              title="Data permissions live here once — and are reused by every functional role"
            >
              {roles.access_role}
            </span>
          )}
          <span className="flex flex-wrap items-center gap-1">
            {Object.keys(functional).length > 0
              ? Object.entries(functional).map(([k, name]) => (
                  <span
                    key={k}
                    className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                    title={String(name)}
                  >
                    {k}
                  </span>
                ))
              : grantTypes.map((g) => (
                  <span key={g.id} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                    {g.label ?? g.id}
                  </span>
                ))}
          </span>
        </div>
        <p
          className="mt-1.5 text-xs text-slate-500 dark:text-slate-400"
          title="People → Data360 roles → the access role and its policies. A person is never granted a table directly. This panel composes NEW access; a standing grant is verified by Test the reads, not assumed."
        >
          {/* ONE line — the full doctrine stays in the tooltip, not on the page */}
          A person gets a role, never a table. Viewer = read the application; higher roles add what
          they may do.
        </p>
      </section>

      {/* ── the sub-tab bar: one panel opens at a time ───────────────── */}
      <div role="tablist" aria-label="Governance surface" className="flex flex-wrap gap-1">
        {TABS.map((t) => {
          const on = subTab === t.id;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={on}
              onClick={() => setSubTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 ${
                on
                  ? 'bg-accent-600 font-medium text-white'
                  : 'border border-slate-200 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
              }`}
            >
              <Icon aria-hidden className="h-3.5 w-3.5" />
              {t.label}
              {t.count != null && (
                <span className={`rounded-full px-1.5 text-xs ${on ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ══ GRANTS — data-access levels to roles, then review & apply ═ */}
      {subTab === 'grants' && (
        <div className="space-y-3">
          <StudioGiveAccess
            draftId={draftId}
            principals={principals}
            principalsNote={principalsNote}
            grantTypes={grantTypes}
            onMap={onMap}
            tablesCount={objects.length}
            actionBar={actionBar}
          />
          <section className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
              <ShieldCheck aria-hidden className="h-3.5 w-3.5" />
              Review &amp; apply
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {mapped || ruleCount || masking.columns.length
                ? `Staged: ${mapped} grant(s)${ruleCount ? `, ${ruleCount} row rule(s)` : ''}${masking.columns.length ? `, ${masking.columns.length} masked column(s)` : ''}. Prepare it, then tick and run the operations below.`
                : 'Nothing staged yet — pick a role above, or stage a row rule / mask under Policies, then prepare the change. Any operations already listed below are the baseline access-role scaffolding this application needs.'}
            </p>
            <div className="mt-2">{footer}</div>
          </section>
        </div>
      )}

      {/* ══ POLICIES — the catalog, then the column-level editors ═════ */}
      {subTab === 'policies' && (
        <div className="space-y-3">
          <StudioPolicyCatalog draftId={draftId} />
          <StudioAccessGrid
          initialLayer={prefill ? (prefill.kind === 'mask' ? 'pii' : 'rls') : undefined}
          draftId={draftId}
          grantTypes={grantTypes}
          columns={columns}
          policy={policy}
          onPolicy={onPolicy}
          masking={masking}
          onToggleMask={onToggleMask}
          onToggleUnmask={onToggleUnmask}
          accessRole={roles.access_role}
          tablesCount={objects.length}
            actionBar={actionBar}
          />
        </div>
      )}

    </div>
  );
}
