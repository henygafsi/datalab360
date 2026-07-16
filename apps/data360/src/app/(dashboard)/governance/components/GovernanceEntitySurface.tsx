'use client';

/**
 * Governance consolidation (validated direction: "users / roles / grants sur
 * des pages différentes → une surface avec tabs"). Mirrors the
 * AccessCenterSurface mechanism exactly: a static tab list, LOCAL tab state
 * (the host page owns any URL param — this component never writes the URL),
 * and lazy bodies ({tab === x && <Surface/>}) so each section fetches in
 * isolation.
 *
 * v1 embeds the four entity surfaces the user named (Users · Roles · Grants ·
 * Access matrix). The heavy self-contained pages (Policies, Security matrix,
 * Authentication, Projects) stay linked routes per the draw.io design notes —
 * they appear as link chips at the right of the tab bar so the habit stays
 * one-surface-first.
 */

import { useState } from 'react';
import Link from 'next/link';
import {
  ExternalLink, Grid3x3, KeyRound, ShieldCheck, Users as UsersIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { UsersSurface } from '../users/page';
import { RolesSurface } from '../roles/page';
import { GrantsSurface } from '../grants/page';
import { AccessMatrixSurface } from '../access-matrix/page';
import { routes } from '@/config/routes';

export type GovernanceTabId = 'users' | 'roles' | 'grants' | 'access';

const TABS: Array<{ id: GovernanceTabId; label: string; icon: React.ElementType }> = [
  { id: 'users', label: 'Users', icon: UsersIcon },
  { id: 'roles', label: 'Roles', icon: ShieldCheck },
  { id: 'grants', label: 'Grants', icon: KeyRound },
  { id: 'access', label: 'Access matrix', icon: Grid3x3 },
];

// Heavy, self-contained governance pages that stay as routes (draw.io note:
// projects has a ?tab= collision; oauth/security-matrix embed lazily later).
const LINKED: Array<{ label: string; href: string }> = [
  { label: 'Policies', href: routes.governance.policies },
  { label: 'Security matrix', href: routes.governance.securityMatrix },
  { label: 'Authentication', href: routes.governance.oauth },
];

export default function GovernanceEntitySurface({
  initialTab,
}: {
  /** Seed tab (host reads its own URL param once); local state after that. */
  initialTab?: GovernanceTabId;
}) {
  const [tab, setTab] = useState<GovernanceTabId>(initialTab ?? 'users');

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 pb-1.5 dark:border-slate-700">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium transition-colors',
              tab === id
                ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
                : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-slate-200 dark:bg-slate-700" aria-hidden="true" />
        {LINKED.map(({ label, href }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          >
            {label}
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </Link>
        ))}
      </div>

      {/* Lazy bodies — only the active surface mounts (isolated fetching). */}
      {tab === 'users' && <UsersSurface />}
      {tab === 'roles' && <RolesSurface />}
      {tab === 'grants' && <GrantsSurface />}
      {tab === 'access' && <AccessMatrixSurface />}
    </div>
  );
}
