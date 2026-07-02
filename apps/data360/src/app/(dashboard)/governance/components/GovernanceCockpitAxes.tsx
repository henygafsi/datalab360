'use client';

/**
 * GovernanceCockpitAxes — axis panel bodies for the governance landing cockpit
 * (`(dashboard)/governance/page.tsx` mounts them inside the shared
 * `<AxisCockpit>` primitive).
 *
 * Data contract:
 *  - The CORE axes (overview / policies / users / access) render from the
 *    `GovCore` snapshot the landing page already fetched for its KPI strip —
 *    no duplicate GETs.
 *  - The PASSIVE axes (history / ai) and the per-project OWNERS section fetch
 *    lazily on first open: `AxisCockpit` only calls `render()` for the active
 *    axis, so mounting a body IS the lazy trigger.
 *
 * Honesty rules (CLAUDE.md): an undetermined value renders "—" (never a fake
 * 0); a failed feed states that it is unavailable; real zeros are shown.
 * No vendor names in copy ("warehouse roles", "AI recommendations").
 */

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  EyeOff,
  Fingerprint,
  FolderKanban,
  KeyRound,
  Lock,
  ShieldCheck,
  ShieldPlus,
  UserPlus,
  UserX,
  Users,
} from 'lucide-react';
import { routes } from '@/config/routes';
import {
  countNeedsAttention,
  type AccessReviewSummary,
  type ComplianceScore,
} from '@/app/services/governance/posture';
import {
  getAllUsersActivity,
  type UserActivityWithQuery,
} from '@/app/services/governance';
import {
  getCatalogRecommendations,
  type Recommendation,
} from '@/app/services/catalog';
import { listContributors, listProjects } from '@/app/services/api/projectsApi';
import type { Project } from '@/app/services/api/types';
import type { UserTableDataType } from '@/app/shared/governance/users/table';
import type { RoleTableDataType } from '@/app/shared/governance/roles/table';

// ─────────────────────────────────────────────────────────────────────────────
// Shared core snapshot (fetched once by the landing page, reused by KPI strip
// and the core axes).
// ─────────────────────────────────────────────────────────────────────────────

export interface GovCore {
  loading: boolean;
  /** Getter degrades internally — gate on `.available`, never on null alone. */
  compliance: ComplianceScore | null;
  accessReview: AccessReviewSummary | null;
  /** null = undetermined (fetch failed) · [] = an honest zero. */
  users: UserTableDataType[] | null;
  roles: RoleTableDataType[] | null;
  /** Policy counts by type; null = undetermined. */
  masking: number | null;
  rowAccess: number | null;
  aggregation: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiny shared pieces
// ─────────────────────────────────────────────────────────────────────────────

const dash = (v: string | number | null | undefined): string =>
  v === null || v === undefined || v === '' ? '—' : String(v);

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
      {children}
    </h4>
  );
}

function StatRow({
  icon: Icon,
  label,
  value,
  tone = 'slate',
  href,
  hrefLabel = 'Manage',
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  tone?: 'slate' | 'amber' | 'red' | 'emerald';
  href?: string;
  hrefLabel?: string;
}) {
  const toneText =
    tone === 'red'
      ? 'text-red-600 dark:text-red-400'
      : tone === 'amber'
        ? 'text-amber-600 dark:text-amber-400'
        : tone === 'emerald'
          ? 'text-emerald-600 dark:text-emerald-400'
          : 'text-slate-900 dark:text-white';
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800">
      <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-sm text-slate-600 dark:text-slate-300">
        {label}
      </span>
      <span className={`text-sm font-bold tabular-nums ${toneText}`}>{value}</span>
      {href && (
        <Link
          href={href}
          className="text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
        >
          {hrefLabel}
        </Link>
      )}
    </div>
  );
}

function HonestEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-xs text-slate-400 dark:border-slate-700 dark:text-slate-500">
      {children}
    </p>
  );
}

function BodySkeleton() {
  return (
    <div className="space-y-2" aria-label="Loading">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-9 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800"
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERVIEW — compliance score + posture digest
// ─────────────────────────────────────────────────────────────────────────────

export function OverviewAxisBody({
  core,
  onOpenAccess,
}: {
  core: GovCore;
  onOpenAccess: () => void;
}) {
  if (core.loading) return <BodySkeleton />;
  const cs = core.compliance;
  const ar = core.accessReview;
  const scoreKnown = Boolean(cs?.available);
  const score = scoreKnown && cs ? Math.round(cs.score) : null;
  const attention = ar?.available ? countNeedsAttention(ar) : null;

  const bars: { label: string; score: number; weight: number }[] =
    scoreKnown && cs
      ? [
          { label: 'Masking coverage', score: cs.breakdown.masking.score, weight: cs.breakdown.masking.weight },
          { label: 'Row access coverage', score: cs.breakdown.row_access.score, weight: cs.breakdown.row_access.weight },
          { label: 'Tagging coverage', score: cs.breakdown.tagging.score, weight: cs.breakdown.tagging.weight },
        ]
      : [];

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 p-4 text-center dark:border-slate-800">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          Compliance score
        </div>
        <div className="mt-1 text-4xl font-bold tabular-nums text-slate-900 dark:text-white">
          {dash(score)}
          <span className="ml-1 text-base font-semibold text-slate-400">/100</span>
        </div>
        {scoreKnown && cs?.computed_at && (
          <div className="mt-1 text-[10.5px] text-slate-400">
            Computed {new Date(cs.computed_at).toLocaleString()}
          </div>
        )}
        {!scoreKnown && (
          <div className="mt-1 text-[11px] text-slate-400">
            Score unavailable right now — shown as “—”, never a fake 0.
          </div>
        )}
      </div>

      {bars.length > 0 && (
        <div className="space-y-3">
          <SectionTitle>Breakdown</SectionTitle>
          {bars.map((b) => {
            const w = Math.max(0, Math.min(100, Math.round(b.score)));
            return (
              <div key={b.label}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-slate-600 dark:text-slate-300">{b.label}</span>
                  <span className="font-semibold tabular-nums text-slate-900 dark:text-white">
                    {w}%
                    <span className="ml-1 font-normal text-slate-400">· weight {b.weight}</span>
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className={`h-full rounded-full ${w >= 75 ? 'bg-emerald-500' : w >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                    style={{ width: `${w}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {scoreKnown && cs && cs.warnings.length > 0 && (
        <div className="space-y-1.5">
          <SectionTitle>Warnings</SectionTitle>
          {cs.warnings.slice(0, 3).map((w, i) => (
            <p
              key={i}
              className="flex items-start gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              {w}
            </p>
          ))}
        </div>
      )}

      <div className="space-y-2">
        <SectionTitle>Posture</SectionTitle>
        <button
          type="button"
          onClick={onOpenAccess}
          className="flex w-full items-center gap-2.5 rounded-lg border border-slate-100 px-3 py-2 text-left transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
        >
          <AlertTriangle
            className={`h-4 w-4 shrink-0 ${attention ? 'text-amber-500' : 'text-slate-400'}`}
            aria-hidden
          />
          <span className="min-w-0 flex-1 text-sm text-slate-600 dark:text-slate-300">
            Access items needing review
          </span>
          <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">
            {dash(attention)}
          </span>
          <ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-hidden />
        </button>
        <Link
          href={routes.governance.securityMatrix}
          className="flex items-center gap-2.5 rounded-lg border border-slate-100 px-3 py-2 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
        >
          <Fingerprint className="h-4 w-4 shrink-0 text-slate-400" aria-hidden />
          <span className="min-w-0 flex-1 text-sm text-slate-600 dark:text-slate-300">
            Security matrix &amp; enterprise identities
          </span>
          <ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-hidden />
        </Link>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// POLICIES — counts by type + manage links
// ─────────────────────────────────────────────────────────────────────────────

export function PoliciesAxisBody({ core }: { core: GovCore }) {
  if (core.loading) return <BodySkeleton />;
  const allUnknown =
    core.masking === null && core.rowAccess === null && core.aggregation === null;
  const expiring = core.accessReview?.available
    ? core.accessReview.expiring_policies.length
    : null;

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <SectionTitle>Active policies by type</SectionTitle>
        {allUnknown ? (
          <HonestEmpty>
            Policy counts are unavailable right now. Open the policy manager for the
            live inventory.
          </HonestEmpty>
        ) : (
          <>
            <StatRow icon={EyeOff} label="Masking" value={dash(core.masking)} href={routes.governance.policies} />
            <StatRow icon={Lock} label="Row access" value={dash(core.rowAccess)} href={routes.governance.policies} />
            <StatRow icon={BarChart3} label="Aggregation" value={dash(core.aggregation)} href={routes.governance.policies} />
          </>
        )}
      </div>

      <div className="space-y-2">
        <SectionTitle>Lifecycle</SectionTitle>
        <StatRow
          icon={AlertTriangle}
          label="Expiring soon"
          value={dash(expiring)}
          tone={expiring ? 'amber' : 'slate'}
          href={`${routes.governance.securityMatrix}?drill=expiring`}
          hrefLabel="Review"
        />
      </div>

      <Link
        href={routes.governance.policies}
        className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800"
      >
        Open policy manager
        <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
      <p className="text-[10.5px] text-slate-400 dark:text-slate-500">
        Network, tag, password and session policies are managed on the same page.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// USERS & OWNERS — counts, quick CRUD entry points, per-project owners
// ─────────────────────────────────────────────────────────────────────────────

interface OwnerRow {
  project: Project;
  /** null = undetermined for this project. */
  owners: string[] | null;
}

function OwnersSection() {
  const [state, setState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [rows, setRows] = useState<OwnerRow[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await listProjects({ limit: 25 });
        const recent = [...(res?.projects ?? [])]
          .sort(
            (a, b) =>
              (new Date(b.updated_at ?? b.created_at).getTime() || 0) -
              (new Date(a.updated_at ?? a.created_at).getTime() || 0),
          )
          .slice(0, 5);
        const contribs = await Promise.allSettled(
          recent.map((p) => listContributors(p.project_id)),
        );
        if (!alive) return;
        setRows(
          recent.map((project, i) => {
            const r = contribs[i];
            if (r.status === 'fulfilled' && Array.isArray(r.value)) {
              const owners = r.value
                .filter((c) => c.role === 'owner')
                .map((c) => c.username);
              // No explicit owner contributor → the creator is the de-facto owner.
              return {
                project,
                owners: owners.length
                  ? owners
                  : project.created_by
                    ? [project.created_by]
                    : null,
              };
            }
            return {
              project,
              owners: project.created_by ? [project.created_by] : null,
            };
          }),
        );
        setState('ready');
      } catch {
        if (alive) setState('error');
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (state === 'loading') return <BodySkeleton />;
  if (state === 'error') {
    return (
      <HonestEmpty>
        Owners appear per project.{' '}
        <Link
          href={routes.governance.projects}
          className="font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Open project governance
        </Link>
      </HonestEmpty>
    );
  }
  if (rows.length === 0) {
    return (
      <HonestEmpty>
        No projects yet — owners appear per project once one exists.
      </HonestEmpty>
    );
  }
  return (
    <div className="space-y-2">
      {rows.map(({ project, owners }) => (
        <Link
          key={project.project_id}
          href={routes.governance.projectDeepLink(project.project_id)}
          className="block rounded-lg border border-slate-100 px-3 py-2 transition-colors hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/60"
        >
          <div className="flex items-center gap-2">
            <FolderKanban className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-white">
              {project.project_name}
            </span>
            <span className="text-[10px] uppercase tracking-wide text-slate-400">
              {project.project_type}
            </span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1 pl-5">
            {owners === null ? (
              <span className="text-xs text-slate-400">Owner —</span>
            ) : (
              owners.slice(0, 3).map((o) => (
                <span
                  key={o}
                  className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                >
                  {o}
                </span>
              ))
            )}
            {owners !== null && owners.length > 3 && (
              <span className="text-[10.5px] text-slate-400">+{owners.length - 3}</span>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}

export function UsersOwnersAxisBody({
  core,
  canCreate,
  createDeniedTitle,
  onAddUser,
  onAddRole,
}: {
  core: GovCore;
  canCreate: boolean;
  createDeniedTitle?: string;
  onAddUser: () => void;
  onAddRole: () => void;
}) {
  const users = core.users;
  const roles = core.roles;
  const active = users ? users.filter((u) => u.status === 'Active').length : null;
  const disabled = users ? users.filter((u) => u.status === 'Disabled').length : null;

  return (
    <div className="space-y-5">
      {core.loading ? (
        <BodySkeleton />
      ) : (
        <div className="space-y-2">
          <SectionTitle>Directory</SectionTitle>
          <StatRow icon={Users} label="Users" value={dash(users?.length ?? null)} href={routes.governance.users} />
          <StatRow icon={ShieldCheck} label="Active" value={dash(active)} tone="emerald" />
          <StatRow icon={UserX} label="Disabled" value={dash(disabled)} tone={disabled ? 'amber' : 'slate'} />
          <StatRow icon={KeyRound} label="Roles" value={dash(roles?.length ?? null)} href={routes.governance.roles} />
        </div>
      )}

      <div className="space-y-2">
        <SectionTitle>Quick actions</SectionTitle>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onAddUser}
            disabled={!canCreate}
            title={createDeniedTitle}
            className="flex items-center justify-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-indigo-300 dark:disabled:bg-indigo-900"
          >
            <UserPlus className="h-3.5 w-3.5" aria-hidden />
            Add user
          </button>
          <button
            type="button"
            onClick={onAddRole}
            disabled={!canCreate}
            title={createDeniedTitle}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            <ShieldPlus className="h-3.5 w-3.5" aria-hidden />
            Add role
          </button>
        </div>
        <div className="grid grid-cols-1 gap-1 text-xs">
          <Link href={routes.governance.users} className="rounded px-1 py-0.5 font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Manage users → edit · enable/disable · assign or revoke roles
          </Link>
          <Link href={routes.governance.roles} className="rounded px-1 py-0.5 font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Manage roles → edit · delete · permission matrix
          </Link>
          <Link href={routes.governance.grants} className="rounded px-1 py-0.5 font-medium text-indigo-600 hover:underline dark:text-indigo-400">
            Module grants → grant / revoke module access
          </Link>
        </div>
      </div>

      <div className="space-y-2">
        <SectionTitle>Owners of recent projects</SectionTitle>
        <OwnersSection />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACCESS — MFA gaps / expiring policies / orphan grants with drill links
// ─────────────────────────────────────────────────────────────────────────────

function AccessBlock({
  title,
  count,
  tone,
  drill,
  children,
}: {
  title: string;
  count: number;
  tone: 'red' | 'amber' | 'emerald';
  drill: 'mfa' | 'expiring' | 'orphan';
  children?: React.ReactNode;
}) {
  const dotClass =
    tone === 'red' ? 'bg-red-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <div className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} aria-hidden />
        <span className="min-w-0 flex-1 text-sm font-medium text-slate-700 dark:text-slate-200">
          {title}
        </span>
        <span className="text-sm font-bold tabular-nums text-slate-900 dark:text-white">
          {count}
        </span>
      </div>
      {children && <div className="mt-2 space-y-1">{children}</div>}
      {count > 0 && (
        <Link
          href={`${routes.governance.securityMatrix}?drill=${drill}`}
          className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Review all
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      )}
    </div>
  );
}

const previewLine = (key: string, main: string, sub: string) => (
  <div key={key} className="truncate pl-4 text-xs text-slate-500 dark:text-slate-400">
    <span className="font-medium text-slate-700 dark:text-slate-300">{main}</span>
    {sub && <span className="ml-1.5">{sub}</span>}
  </div>
);

export function AccessAxisBody({ core }: { core: GovCore }) {
  if (core.loading) return <BodySkeleton />;
  const ar = core.accessReview;
  if (!ar?.available) {
    return (
      <HonestEmpty>
        The access review is unavailable right now — no counts are shown rather
        than fake zeros. Try again from the security matrix.
      </HonestEmpty>
    );
  }
  return (
    <div className="space-y-3">
      <AccessBlock
        title="MFA gaps"
        count={ar.mfa_gaps.length}
        tone={ar.mfa_gaps.length > 0 ? 'red' : 'emerald'}
        drill="mfa"
      >
        {ar.mfa_gaps.slice(0, 3).map((g, i) =>
          previewLine(`${g.username}-${i}`, g.username, g.default_role ? `· ${g.default_role}` : ''),
        )}
      </AccessBlock>

      <AccessBlock
        title="Expiring policies"
        count={ar.expiring_policies.length}
        tone={ar.expiring_policies.length > 0 ? 'amber' : 'emerald'}
        drill="expiring"
      >
        {ar.expiring_policies.slice(0, 3).map((p, i) =>
          previewLine(
            `${p.name ?? 'policy'}-${i}`,
            p.name ?? '—',
            p.expiration_date ? `· expires ${p.expiration_date}` : '',
          ),
        )}
      </AccessBlock>

      <AccessBlock
        title="Orphan grants"
        count={ar.orphan_grants.length}
        tone={ar.orphan_grants.length > 0 ? 'amber' : 'emerald'}
        drill="orphan"
      >
        {ar.orphan_grants.slice(0, 3).map((o, i) =>
          previewLine(
            `${o.grantee ?? 'grantee'}-${i}`,
            o.grantee ?? '—',
            [o.privilege, o.object].filter(Boolean).join(' on '),
          ),
        )}
      </AccessBlock>

      <p className="text-[10.5px] leading-relaxed text-slate-400 dark:text-slate-500">
        {ar.window_days}-day review window · orphan scan covered{' '}
        {ar.orphan_scan.scanned_users}/{ar.orphan_scan.user_cap} users
        {ar.generated_at
          ? ` · snapshot ${new Date(ar.generated_at).toLocaleString()}`
          : ''}
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// HISTORY — governance activity feed (lazy)
// ─────────────────────────────────────────────────────────────────────────────

export function HistoryAxisBody() {
  // undefined = loading · null = feed unavailable · [] = honest empty
  const [rows, setRows] = useState<UserActivityWithQuery[] | null | undefined>(undefined);

  useEffect(() => {
    let alive = true;
    getAllUsersActivity({})
      .then((r) => {
        if (alive) setRows(Array.isArray(r) ? r.slice(0, 15) : []);
      })
      .catch(() => {
        if (alive) setRows(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (rows === undefined) return <BodySkeleton />;
  if (rows === null) {
    return (
      <HonestEmpty>
        The activity feed is unavailable on this deployment — nothing is shown
        rather than fabricated events.
      </HonestEmpty>
    );
  }
  if (rows.length === 0) {
    return <HonestEmpty>No governance activity recorded yet.</HonestEmpty>;
  }
  return (
    <div className="space-y-1.5">
      {rows.map((e, i) => {
        const status = (e.EVENT_STATUS || '').toUpperCase();
        const dot =
          status === 'SUCCESS'
            ? 'bg-emerald-500'
            : status === 'ERROR' || status === 'FAILED'
              ? 'bg-red-500'
              : 'bg-slate-300 dark:bg-slate-600';
        return (
          <div
            key={e.EVENT_ID ?? `${e.USERNAME}-${e.EVENT_DATE}-${i}`}
            className="rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800"
          >
            <div className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-xs font-medium text-slate-800 dark:text-slate-200">
                {dash(e.EVENT_TYPE)}
              </span>
              <span className="whitespace-nowrap text-[10px] text-slate-400">
                {e.EVENT_DATE ? new Date(e.EVENT_DATE).toLocaleString() : '—'}
              </span>
            </div>
            <div className="mt-0.5 truncate pl-3.5 text-[11px] text-slate-500 dark:text-slate-400">
              {dash(e.USERNAME)} · {dash(e.MODULE_NAME)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// AI — governance-relevant recommendations (lazy)
// ─────────────────────────────────────────────────────────────────────────────

const GOV_TOPIC =
  /governan|polic|access|security|mask|rls|row.?access|grant|tag|mfa|permission|role/i;

const SEV_CLASS: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300',
  high: 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300',
  medium: 'bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300',
  low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  info: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

export function AiAxisBody() {
  // undefined = loading · null = unavailable · ready otherwise
  const [state, setState] = useState<
    { gov: Recommendation[]; total: number } | null | undefined
  >(undefined);

  useEffect(() => {
    let alive = true;
    getCatalogRecommendations({ limit: 30 })
      .then((res) => {
        if (!alive) return;
        const items = Array.isArray(res?.items) ? res.items : [];
        const gov = items.filter((r) =>
          GOV_TOPIC.test(
            [r.category, r.feature, r.title, r.rationale, r.explanation]
              .filter(Boolean)
              .join(' '),
          ),
        );
        setState({ gov: gov.slice(0, 6), total: items.length });
      })
      .catch(() => {
        if (alive) setState(null);
      });
    return () => {
      alive = false;
    };
  }, []);

  if (state === undefined) return <BodySkeleton />;
  if (state === null) {
    return (
      <HonestEmpty>
        AI recommendations are unavailable right now — nothing is shown rather
        than canned suggestions.
      </HonestEmpty>
    );
  }
  if (state.gov.length === 0) {
    return (
      <HonestEmpty>
        No governance-related recommendations right now
        {state.total > 0
          ? ` — ${state.total} recommendation${state.total > 1 ? 's' : ''} exist in other areas.`
          : '.'}
      </HonestEmpty>
    );
  }
  return (
    <div className="space-y-2">
      {state.gov.map((r) => {
        const sev = (r.severity || '').toLowerCase();
        return (
          <div
            key={r.reco_id}
            className="rounded-lg border border-slate-100 px-3 py-2 dark:border-slate-800"
          >
            <div className="flex items-start gap-2">
              <span
                className={`mt-0.5 shrink-0 rounded-full px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${SEV_CLASS[sev] ?? SEV_CLASS.info}`}
              >
                {sev || 'info'}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {r.title || r.feature || '—'}
                </div>
                {(r.rationale || r.explanation) && (
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                    {r.rationale || r.explanation}
                  </p>
                )}
                {typeof r.estimated_savings_usd === 'number' &&
                  r.estimated_savings_usd > 0 && (
                    <div className="mt-0.5 text-[10.5px] font-semibold text-emerald-600 dark:text-emerald-400">
                      Est. savings ${r.estimated_savings_usd.toLocaleString()}
                    </div>
                  )}
              </div>
            </div>
          </div>
        );
      })}
      <p className="text-[10.5px] text-slate-400 dark:text-slate-500">
        Governance-related subset of the account-wide AI recommendations.
      </p>
    </div>
  );
}
