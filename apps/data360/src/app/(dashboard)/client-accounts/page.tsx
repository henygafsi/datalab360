'use client';

import OrgAccountsDashboard from '@/app/shared/org-accounts';
import ErrorBoundary from '@/components/ui/ErrorBoundary';

export default function ClientAccountsPage() {
  return (
    <ErrorBoundary>
      <div className="text-xs text-slate-500 dark:text-slate-400 mb-4 px-4">
        <a href="/" className="hover:text-blue-600">Home</a> / <span className="text-slate-700 dark:text-slate-300">Client Accounts</span>
      </div>
      <OrgAccountsDashboard />
      <div className="mt-6 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 px-4">
        <span>Related:</span>
        <a href="/gouvernance" className="text-blue-600 dark:text-blue-400 hover:underline">Governance (Users)</a>
        <a href="/observability" className="text-blue-600 dark:text-blue-400 hover:underline">Observability (Cost)</a>
      </div>
    </ErrorBoundary>
  );
}
