'use client';

/**
 * GovernanceDenialListener — mounted ONCE in the dashboard shell.
 *
 * Listens for the global `data360:governance-denied` event the apiClient emits on
 * a backend GOVERNANCE_DENIED 403, and surfaces a single "Request access" toast
 * that routes the user to the access-request flow. This is the reusable
 * "rediriger vers la demande dans l'UI" seam — no per-component wiring needed.
 *
 * Hide/grey of features+actions per role is handled separately and inline by
 * {@link GovernedActionButton} (denyMode 'hide' | 'disable') + useCanPerform.
 * This listener covers the runtime case: an action the user reached but the
 * backend governed-denied.
 */
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from '@/hooks/use-toast';
import type { GovernanceDenial } from '@/lib/api-client';

export default function GovernanceDenialListener() {
  const router = useRouter();
  const lastShown = useRef<{ key: string; at: number } | null>(null);

  useEffect(() => {
    function onDenied(e: Event) {
      const detail = (e as CustomEvent<{ message: string; governance: GovernanceDenial }>).detail;
      const governance = detail?.governance;
      if (!governance) return;
      // Dedupe a burst of identical denials (a page firing many gated calls at once).
      const key = `${governance.requiredModule ?? ''}:${(governance.requiredRoles ?? []).join(',')}`;
      const now = Date.now();
      if (lastShown.current && lastShown.current.key === key && now - lastShown.current.at < 4000) return;
      lastShown.current = { key, at: now };

      const roles = governance.requiredRoles?.length
        ? ` Requires: ${governance.requiredRoles.join(' / ')}.`
        : '';
      toast({
        title: 'Access restricted',
        description: `${detail?.message || 'You do not have access to this action.'}${roles}`,
        action: (
          <button
            type="button"
            onClick={() => router.push('/administration/access-center')}
            className="inline-flex shrink-0 items-center rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200"
          >
            Request access
          </button>
        ),
      });
    }
    window.addEventListener('data360:governance-denied', onDenied);
    return () => window.removeEventListener('data360:governance-denied', onDenied);
  }, [router]);

  return null;
}
