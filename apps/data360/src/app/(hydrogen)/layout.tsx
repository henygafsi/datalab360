'use client';

import { useIsMounted } from '@core/hooks/use-is-mounted';
import CarbonLayout from '@/layouts/carbon/carbon-layout';

type LayoutProps = {
  children: React.ReactNode;
};

export default function DefaultLayout({ children }: LayoutProps) {
  return <LayoutProvider>{children}</LayoutProvider>;
}

function LayoutProvider({ children }: LayoutProps) {
  const isMounted = useIsMounted();

  if (!isMounted) {
    return null;
  }

  return <CarbonLayout>{children}</CarbonLayout>;
}
