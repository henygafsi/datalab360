'use client';

import { Grid3x3 } from 'lucide-react';
import PageHeader from '@/components/layout/PageHeader';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { useTrackEvent } from '@/hooks/useTrackEvent';
import { AccessMatrixSurface } from './AccessMatrixSurface';

/**
 * Access Matrix route — real users × Data360 UI pages, each cell the user's
 * governance-resolved page access (per role). The embeddable body lives in
 * ./AccessMatrixSurface (a page file may only export a default page).
 */
export default function AccessMatrixPage() {
  // Auto-emits PAGE_VIEW on mount (this is the top routed component for the route).
  useTrackEvent();

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          <a href="/" className="hover:text-blue-600">Home</a> /{' '}
          <a href="/governance" className="hover:text-blue-600">Governance</a> /{' '}
          <span className="text-slate-700 dark:text-slate-300">Access Matrix</span>
        </div>

        <PageHeader
          icon={<Grid3x3 className="h-6 w-6" />}
          title="User Access Matrix"
          subtitle="Every user × every Data360 page — the access each role grants, resolved live from governance."
          color="blue"
        />

        <AccessMatrixSurface />
      </div>
    </ErrorBoundary>
  );
}
