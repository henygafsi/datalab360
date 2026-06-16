'use client';

import { useState, Component, type ReactNode } from 'react';
import { PiWarningCircleBold, PiChartLineUp, PiShieldCheck, PiBuildings } from 'react-icons/pi';
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

const RELATED_MODULES = [
  { href: '/observability', label: 'Observability', sublabel: 'Monitoring', Icon: PiChartLineUp },
  { href: '/governance', label: 'Governance', sublabel: 'Security', Icon: PiShieldCheck },
  { href: '/client-accounts', label: 'Client Accounts', sublabel: 'Org', Icon: PiBuildings },
] as const;

export default function AccountOverviewPage() {
  const [error, setError] = useState<string | null>(null);

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
      {/* Cross-tab "Cost & Metering" + "Explore related" footer removed — it was
          empty for this org and repeated under every tab. The account ADN axes
          rating now lives in the Snowflake Objects overview where it belongs. */}
      <OnboardingTour />
    </AccountOverviewErrorBoundary>
  );
}
