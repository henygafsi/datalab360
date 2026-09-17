import { Suspense } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { RoleMembershipSurface } from '@/app/(dashboard)/governance/components/RoleMembershipSurface';

/**
 * /studio/admin — Data360 roles administration, nothing else.
 *
 * The user's rule for this page: Administration shows WHO holds each Data360
 * role (the access grants of users to roles), and the door to creating roles
 * and users. Application administration (settings, digests, registries) was
 * removed — data access is governed per application under its Access tab.
 */
export const metadata: Metadata = {
  title: 'Studio — Administration',
};

export default function StudioAdminPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 px-4 py-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Data360 roles &amp; users
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Who holds each Data360 role. Data access itself is granted per application, on its
            Access tab — always to roles, never to a person.
          </p>
        </div>
        <Link
          href="/administration"
          className="rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-600 hover:border-slate-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-300"
        >
          Create roles &amp; users — full administration
        </Link>
      </header>
      <Suspense fallback={null}>
        <RoleMembershipSurface />
      </Suspense>
    </div>
  );
}
