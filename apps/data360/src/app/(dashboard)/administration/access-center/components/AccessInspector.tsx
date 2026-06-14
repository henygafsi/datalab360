'use client';

/**
 * AccessInspector — the right-hand detail inspector for a selected module,
 * built on the shared `RightTabPanel` ("Adaptive Inspector").
 *
 * Sections: Roles-with-access · Usage · Policies/posture · Entitlements toggle.
 * The parent owns the role-matrix Save / Apply-template flow and passes them in
 * as `quickActions` + a header `statusPill`.
 */
import { Users, Activity, ShieldCheck, ToggleRight, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import RightTabPanel, {
  type RightTabSection,
  type QuickAction,
  type StatusPillSpec,
} from '@/app/shared/governance/right-tab-panel';
import {
  capabilityOf,
  CAPABILITY_LABEL,
  type EntitlementFeature,
  type PostureRow,
} from '@/app/services/administration/entitlements';
import { Chip, NA, type ModuleUsage } from './shared';

export interface AccessInspectorProps {
  moduleKey: string;
  moduleLabel: string;
  selectedRole: string;
  roleAllow: number;
  roleDeny: number;
  features: EntitlementFeature[];
  canGovern: boolean;
  togglingKey: string | null;
  onToggleFeature: (feat: EntitlementFeature) => void;
  usage: ModuleUsage | undefined;
  posture: PostureRow | undefined;
  statusPill: StatusPillSpec;
  quickActions: QuickAction[];
  activeSection: string;
  onSectionChange: (id: string) => void;
  onClose: () => void;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-slate-100 py-1.5 text-[11px] last:border-0 dark:border-slate-800">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span className="font-medium text-slate-700 dark:text-slate-200">{children}</span>
    </div>
  );
}

function FeatureToggle({
  feat,
  pending,
  canGovern,
  onToggle,
}: {
  feat: EntitlementFeature;
  pending: boolean;
  canGovern: boolean;
  onToggle: () => void;
}) {
  const cap = capabilityOf(feat.module, feat.feature_key);
  return (
    <li className="flex items-start gap-2.5 py-2">
      <button
        type="button"
        role="switch"
        aria-checked={feat.enabled}
        aria-label={`${feat.enabled ? 'Disable' : 'Enable'} ${feat.label}`}
        disabled={!canGovern || pending}
        onClick={onToggle}
        className={cn(
          'relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
          feat.enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600',
          (!canGovern || pending) && 'cursor-not-allowed opacity-60',
        )}
      >
        <span
          className={cn(
            'inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform',
            feat.enabled ? 'translate-x-[18px]' : 'translate-x-1',
          )}
        />
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[12px] font-medium text-slate-800 dark:text-slate-100">
            {feat.label}
          </span>
          <Chip tone="violet" title="Capability gated by this feature">
            {CAPABILITY_LABEL[cap]}
          </Chip>
          {feat.source === 'override' && (
            <span className="text-[10px] text-slate-400">admin override</span>
          )}
        </div>
        {feat.description && (
          <p className="mt-0.5 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
            {feat.description}
          </p>
        )}
      </div>
    </li>
  );
}

export default function AccessInspector({
  moduleKey,
  moduleLabel,
  selectedRole,
  roleAllow,
  roleDeny,
  features,
  canGovern,
  togglingKey,
  onToggleFeature,
  usage,
  posture,
  statusPill,
  quickActions,
  activeSection,
  onSectionChange,
  onClose,
}: AccessInspectorProps) {
  const grantedRoles = posture?.granted_roles ?? null;
  const postureUsage = posture?.usage ?? null;

  const sections: RightTabSection[] = [
    {
      id: 'roles',
      icon: Users,
      label: 'Roles with access',
      render: () => (
        <div className="space-y-3">
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Selected role · {selectedRole || '—'}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {selectedRole ? (
                <>
                  <Chip tone="emerald">{roleAllow} allow</Chip>
                  {roleDeny > 0 && <Chip tone="rose">{roleDeny} deny</Chip>}
                  {roleAllow === 0 && roleDeny === 0 && (
                    <span className="text-[11px] text-slate-400">inherit only (no explicit rule here)</span>
                  )}
                </>
              ) : (
                <span className="text-[11px] text-slate-400">Pick a role to see its grants here.</span>
              )}
            </div>
          </div>
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Roles granted this module
            </p>
            {grantedRoles && grantedRoles.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {grantedRoles.map((r) => (
                  <Chip key={r} tone="slate">
                    {r}
                  </Chip>
                ))}
              </div>
            ) : (
              <NA title="No role-grant attribution returned by governance-posture" />
            )}
          </div>
        </div>
      ),
    },
    {
      id: 'usage',
      icon: Activity,
      label: 'Usage',
      render: () => {
        const u = usage;
        const errRate =
          postureUsage && postureUsage.requests > 0
            ? (postureUsage.error_rate * 100).toFixed(1)
            : u && u.requests > 0
              ? ((u.errors / u.requests) * 100).toFixed(1)
              : null;
        if (!u && !postureUsage) {
          return (
            <p className="text-[11px] text-slate-400">
              No usage attribution available for this module — <NA />.
            </p>
          );
        }
        return (
          <div className="space-y-0.5">
            <Row label="Requests (7d)">
              {(postureUsage?.requests ?? u?.requests ?? 0).toLocaleString()}
            </Row>
            <Row label="Distinct users">
              {postureUsage?.distinct_users ?? u?.distinctUsers ?? <NA />}
            </Row>
            <Row label="Errors">
              {postureUsage?.failed ?? u?.errors ?? <NA />}
            </Row>
            <Row label="Error rate">{errRate != null ? `${errRate}%` : <NA />}</Row>
            <Row label="Last activity">
              {postureUsage?.last_activity_at
                ? new Date(postureUsage.last_activity_at).toLocaleString()
                : u?.lastSeen
                  ? new Date(u.lastSeen).toLocaleString()
                  : <NA />}
            </Row>
          </div>
        );
      },
    },
    {
      id: 'posture',
      icon: ShieldCheck,
      label: 'Policies & posture',
      render: () => {
        if (!posture) {
          return (
            <p className="text-[11px] text-slate-400">
              Governance-posture not available for this module — <NA />.
            </p>
          );
        }
        return (
          <div className="space-y-0.5">
            <Row label="Features enabled">
              {posture.features_enabled}/{posture.features_total}
            </Row>
            <Row label="Bound policies">
              {typeof posture.bound_policies === 'number' ? posture.bound_policies : <NA />}
            </Row>
            {posture.disabled && posture.disabled.length > 0 && (
              <div className="pt-2">
                <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  Disabled features
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {posture.disabled.map((d) => (
                    <Chip key={d} tone="amber">
                      {d}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      },
    },
    {
      id: 'entitlements',
      icon: ToggleRight,
      label: 'Entitlements',
      render: () => (
        <div className="space-y-2">
          {!canGovern && (
            <div className="flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] text-amber-700 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
              <Lock className="h-3 w-3 shrink-0" />
              Read-only — account admin required to change entitlements.
            </div>
          )}
          {features.length === 0 ? (
            <p className="text-[11px] text-slate-400">
              No governable features registered for this module — <NA />.
            </p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {features.map((f) => (
                <FeatureToggle
                  key={`${f.module}:${f.feature_key}`}
                  feat={f}
                  pending={togglingKey === `${f.module}:${f.feature_key}`}
                  canGovern={canGovern}
                  onToggle={() => onToggleFeature(f)}
                />
              ))}
            </ul>
          )}
        </div>
      ),
    },
  ];

  return (
    <RightTabPanel
      title={moduleLabel}
      subtitle={`module · ${moduleKey}`}
      sections={sections}
      activeSection={activeSection}
      onSectionChange={onSectionChange}
      onClose={onClose}
      storageKey="data360.admin.accessCenter.inspector.v1"
      accentClassName="bg-violet-500"
      statusPill={statusPill}
      quickActions={quickActions}
    />
  );
}
