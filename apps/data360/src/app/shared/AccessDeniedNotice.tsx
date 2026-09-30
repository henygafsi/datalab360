'use client';

/**
 * AccessDeniedNotice — says WHY the user is looking at this page instead of the
 * one they asked for.
 *
 * The route-level module gate (src/middleware.ts) refuses a page whose module the
 * signed-in user's role does not hold, and redirects to
 * `/?denied=<apiName>&from=<path>`, which `/` forwards here. Without this notice
 * the refusal is indistinguishable from a misclick: the user presses Governance
 * and simply arrives on the overview.
 *
 * Deliberate choices:
 *  • It names the module in the SAME words the sidebar uses — resolved from
 *    MODULES[].name, never a hardcoded string (brand rule), so "gouvernance"
 *    never leaks to the user as a raw apiName.
 *  • It says this is a ROLE limit and names the remedy (ask an administrator),
 *    because "access denied" with no actor leaves the user with nowhere to go.
 *  • It is DISMISSIBLE and clears the query params, so a refusal does not stick
 *    to the overview for the rest of the session.
 *  • If the apiName matches no known module, it degrades to the neutral
 *    "a module" rather than printing an internal identifier.
 */

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PiLockKeyBold, PiXBold } from 'react-icons/pi';

import { MODULES } from '@/config/modules';

/** The sidebar's own words for a module, from its backend apiName. */
function moduleLabel(apiName: string | null): string | null {
  if (!apiName) return null;
  const hit = MODULES.find(
    (m) =>
      m.apiName === apiName ||
      m.subModules?.some((s) => s.apiName === apiName)
  );
  if (!hit) return null;
  const sub = hit.subModules?.find((s) => s.apiName === apiName);
  return sub && sub.apiName !== hit.apiName ? `${hit.name} — ${sub.name}` : hit.name;
}

export default function AccessDeniedNotice() {
  const params = useSearchParams();
  const router = useRouter();
  const denied = params.get('denied');
  const from = params.get('from');
  const [dismissed, setDismissed] = useState(false);

  // A new refusal must re-open a previously dismissed notice.
  useEffect(() => setDismissed(false), [denied, from]);

  if (!denied || dismissed) return null;

  const label = moduleLabel(denied);

  const clear = () => {
    setDismissed(true);
    const next = new URLSearchParams(params.toString());
    next.delete('denied');
    next.delete('from');
    const qs = next.toString();
    router.replace(qs ? `?${qs}` : window.location.pathname, { scroll: false });
  };

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/40"
    >
      <PiLockKeyBold className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="min-w-0 flex-1 text-sm">
        <p className="font-medium text-amber-900 dark:text-amber-200">
          {label
            ? `${label} is not part of your access`
            : 'That page is not part of your access'}
        </p>
        <p className="mt-0.5 text-amber-800 dark:text-amber-300">
          You are signed in — this is a limit of your role, not a session problem.
          {from ? (
            <>
              {' '}
              We brought you here instead of{' '}
              <code className="rounded bg-amber-100 px-1 py-px font-mono text-[12px] dark:bg-amber-900/40">
                {from}
              </code>
              .
            </>
          ) : null}{' '}
          An administrator can grant it if you need it.
        </p>
      </div>
      <button
        type="button"
        onClick={clear}
        aria-label="Dismiss"
        className="rounded p-1 text-amber-700 hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 dark:text-amber-300 dark:hover:bg-amber-900/40"
      >
        <PiXBold className="h-4 w-4" />
      </button>
    </div>
  );
}
