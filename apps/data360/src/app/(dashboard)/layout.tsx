'use client';

import { useIsMounted } from '@core/hooks/use-is-mounted';
import CarbonLayout from '@/layouts/carbon/carbon-layout';
import SessionGuard from '@/components/auth/SessionGuard';
import { CacheInvalidationProvider } from '@/components/providers/CacheInvalidationProvider';

type LayoutProps = {
  children: React.ReactNode;
};

export default function DefaultLayout({ children }: LayoutProps) {
  return (
    <SessionGuard>
      <CacheInvalidationProvider showIndicator>
        <LayoutProvider>{children}</LayoutProvider>
      </CacheInvalidationProvider>
    </SessionGuard>
  );
}

function LayoutProvider({ children }: LayoutProps) {
  const isMounted = useIsMounted();

  if (!isMounted) {
    return null;
  }

  return <CarbonLayout>{children}</CarbonLayout>;
}
