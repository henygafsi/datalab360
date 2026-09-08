'use client';

/**
 * /studio/workspace — LEGACY URL. The workspace now lives at
 * /studio/apps/[id] (?view=…); this page only forwards, keeping old links
 * and bookmarks alive. Without a draft it forwards to the Studio home.
 */
import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { routes } from '@/config/routes';

function Forward() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    const draft = params.get('draft');
    router.replace(draft ? routes.studioApp(draft) : routes.studio);
  }, [params, router]);
  return null;
}

export default function LegacyWorkspaceRedirect() {
  return (
    <Suspense fallback={null}>
      <Forward />
    </Suspense>
  );
}
