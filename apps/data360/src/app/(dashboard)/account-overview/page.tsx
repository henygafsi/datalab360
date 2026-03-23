'use client';

import { useState, useEffect, Component, type ReactNode } from 'react';
import { PiWarningCircleBold } from 'react-icons/pi';
import CommandCenterDashboard from '@/app/shared/command-center';
import OnboardingTour from '@/app/shared/onboarding-tour';
import Breadcrumb from '@/components/ui/Breadcrumb';

interface ErrorBoundaryProps {
  children: ReactNode;
  onError: (error: string) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class AccountOverviewErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    this.props.onError(error.message || 'An unexpected error occurred');
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 bg-white dark:bg-gray-900 rounded-xl border border-red-200 dark:border-red-800 m-4 p-8">
          <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <svg className="w-6 h-6 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Something went wrong</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-md">
            An error occurred while loading this page. This is usually temporary.
          </p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function AccountOverviewPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Allow the component tree to mount, then hide loading
    const timer = setTimeout(() => {
      setLoading(false);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 p-4">
        <div className="h-16 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
        <div className="h-48 bg-gray-200 dark:bg-gray-700 rounded-xl animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="@container">
        <div className="flex items-start gap-3 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-100 dark:border-red-900/50 p-4">
          <PiWarningCircleBold className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <AccountOverviewErrorBoundary onError={(msg) => setError(msg)}>
      <div className="px-4 pt-3">
        <Breadcrumb items={[{ label: 'Account Overview', href: '/account-overview' }]} />
      </div>
      <CommandCenterDashboard />
      <OnboardingTour />
      {/* Cross-module links */}
      <div className="mx-4 mt-6 pt-4 border-t border-slate-200 dark:border-slate-700 flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
        <span>Related:</span>
        <a href="/observability" className="text-blue-600 dark:text-blue-400 hover:underline">Observability (Monitoring)</a>
        <a href="/gouvernance" className="text-blue-600 dark:text-blue-400 hover:underline">Governance (Security)</a>
        <a href="/client-accounts" className="text-blue-600 dark:text-blue-400 hover:underline">Client Accounts (Org)</a>
      </div>
    </AccountOverviewErrorBoundary>
  );
}
