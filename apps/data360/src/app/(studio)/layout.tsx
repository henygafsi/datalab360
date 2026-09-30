'use client';

/**
 * (studio) group layout — the Studio's autonomous light shell.
 *
 * Same guards and live-invalidation as the platform (SessionGuard +
 * CacheInvalidationProvider) but NONE of the platform chrome: no sidebar,
 * no global header stack, no permanent AI panel, no footer. StudioShell
 * provides the single compact bar (Iteration A shell rule — a page that
 * merely lives under /studio is not enough, the inherited layout is what
 * produced the stacked-chrome defects).
 */

import { useIsMounted } from '@core/hooks/use-is-mounted';
import SessionGuard from '@/components/auth/SessionGuard';
import { CacheInvalidationProvider } from '@/components/providers/CacheInvalidationProvider';
import StudioShell from '@/app/shared/studio/StudioShell';

export default function StudioLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionGuard>
      <CacheInvalidationProvider>
        <Mounted>{children}</Mounted>
      </CacheInvalidationProvider>
    </SessionGuard>
  );
}

function Mounted({ children }: { children: React.ReactNode }) {
  const isMounted = useIsMounted();
  if (!isMounted) return null;
  return <StudioShell>{children}</StudioShell>;
}
