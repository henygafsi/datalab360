'use client';

import Link from 'next/link';
import OrgAccountsDashboard from '@/app/shared/org-accounts';
import AdminRouteGuard from '@/components/AdminRouteGuard';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { useTrackEvent } from '@/hooks/useTrackEvent';

// Admin-only: gate the route itself so non-admins get an explanatory restricted
// state instead of the org-accounts shell with 403ing data calls.
export default function ClientAccountsPage() {
  return (
    <AdminRouteGuard surface="Client Accounts">
      <ClientAccountsPageContent />
    </AdminRouteGuard>
  );
}

function ClientAccountsPageContent() {
  // Auto-fires PAGE_VIEW on mount (via the hook's pathname effect); exposes
  // trackFeatureClick for the related-link navigation below.
  const { trackFeatureClick } = useTrackEvent();

  return (
    <ErrorBoundary>
      <nav
        aria-label="Breadcrumb"
        className="text-xs text-slate-500 dark:text-slate-400 mb-4 px-4"
      >
        <Link href="/" className="hover:text-blue-600 dark:hover:text-blue-400">
          Home
        </Link>{' '}
        / <span className="text-slate-700 dark:text-slate-300">Client Accounts</span>
      </nav>
      <OrgAccountsDashboard />
      <div className="mt-6 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 px-4">
        <span>Related:</span>
        <Link
          href="/governance"
          onClick={() => trackFeatureClick('related_link', { target: 'governance' })}
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          Governance (Users)
        </Link>
        <Link
          href="/observability"
          onClick={() => trackFeatureClick('related_link', { target: 'observability' })}
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          Observability (Cost)
        </Link>
      </div>
    </ErrorBoundary>
  );
}
