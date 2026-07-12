'use client';

/**
 * RoleSwitcher — change the active Snowflake role (= the Data360 role) without
 * re-login. Lives in the sidebar profile dropdown.
 *
 * Flow (role-scoped-cache correctness, 2026-07-12):
 *  1. GET  /user/profile/roles   → current + available roles (SHOW GRANTS TO USER)
 *  2. POST /user/profile/role    → USE ROLE on the user's Snowflake session AND
 *     a FRESH bearer token minted with the new role + recomputed module items —
 *     the backend keys every role-scoped cache (d360:{account}:{page}:{module}:{role})
 *     and the SVC role lane off the JWT role, so the client MUST swap tokens.
 *  3. useSession().update({access_token, role, items}) swaps the NextAuth JWT.
 *  4. Full reload — every surface refetches under the new role, so Snowflake
 *     masking/RLS policies attached to the role apply everywhere at once.
 */

import { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import toast from 'react-hot-toast';
import { HiOutlineArrowsRightLeft, HiOutlineCheck } from 'react-icons/hi2';
import cn from '@core/utils/class-names';
import { getUserRoles, changeUserRole } from '@/app/services/user/profile';

export default function RoleSwitcher() {
  const { update } = useSession();
  const [roles, setRoles] = useState<{ current: string; available: string[] } | null>(null);
  const [error, setError] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    getUserRoles()
      .then((r) => {
        if (!alive) return;
        setRoles({
          current: r.current_role,
          available: (r.available_roles || []).filter((x) => x !== r.current_role),
        });
      })
      .catch(() => {
        if (alive) setError(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const onSwitch = useCallback(
    async (role: string) => {
      setSwitching(role);
      try {
        const res = await changeUserRole(role);
        if (res.access_token) {
          // Swap the NextAuth JWT for the freshly minted role-scoped bearer.
          await update({
            access_token: res.access_token,
            role: res.current_role,
            items: res.items ?? undefined,
          });
        }
        toast.success(`Role switched to ${res.current_role}`);
        // Full reload: every cached view refetches under the new role, so
        // Snowflake masking/RLS attached to the role apply everywhere.
        window.location.reload();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Role switch failed');
        setSwitching(null);
      }
    },
    [update],
  );

  if (error) return null; // roles unreadable → hide the section, never a broken UI

  return (
    <div className="border-b border-gray-200 px-3 py-3 dark:border-gray-700">
      <p className="mb-1.5 flex items-center gap-1.5 px-3 text-[10px] font-semibold uppercase tracking-wide text-gray-400">
        <HiOutlineArrowsRightLeft className="h-3.5 w-3.5" />
        Active role
      </p>
      {!roles ? (
        <div className="mx-3 h-8 animate-pulse rounded-lg bg-gray-100 dark:bg-gray-800" aria-busy="true" />
      ) : (
        <>
          <div className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium text-gray-900 dark:text-gray-100">
            <HiOutlineCheck className="h-4 w-4 text-emerald-500" />
            {roles.current}
          </div>
          {roles.available.length === 0 ? (
            <p className="px-3 py-1 text-xs text-gray-400">No other roles granted</p>
          ) : (
            <ul className="max-h-44 overflow-y-auto">
              {roles.available.map((r) => (
                <li key={r}>
                  <button
                    type="button"
                    disabled={switching != null}
                    onClick={() => void onSwitch(r)}
                    className={cn(
                      'flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm text-gray-600 transition-colors hover:bg-gray-100 disabled:opacity-50 dark:text-gray-300 dark:hover:bg-gray-800/50',
                      switching === r && 'animate-pulse',
                    )}
                    title={`USE ROLE ${r} — data and modules refresh under this role's Snowflake policies`}
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-300 dark:bg-gray-600" />
                    {switching === r ? `Switching to ${r}…` : r}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
