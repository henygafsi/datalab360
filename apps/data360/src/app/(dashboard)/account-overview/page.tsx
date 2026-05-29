'use client';

import { useState, Component, type ReactNode } from 'react';
import { PiWarningCircleBold, PiChartLineUp, PiShieldCheck, PiBuildings } from 'react-icons/pi';
import CommandCenterDashboard from '@/app/shared/command-center';
import OnboardingTour from '@/app/shared/onboarding-tour';
import Breadcrumb from '@/components/ui/Breadcrumb';
import MeteringPanel from '@/components/metering/MeteringPanel';

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
      {/* Cost & Metering — pricing surface across sources / projects / modules. */}
      <div className="mx-4 mt-6">
        <MeteringPanel />
      </div>
      <OnboardingTour />
      {/* Related modules */}
      <nav
        aria-label="Related modules"
        className="mx-4 mt-6 pt-4 border-t border-slate-200 dark:border-slate-700"
      >
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Explore related
        </p>
        <ul className="flex flex-wrap gap-2">
          {RELATED_MODULES.map(({ href, label, sublabel, Icon }) => (
            <li key={href}>
              <a
                href={href}
                className="group inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:border-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300"
              >
                <Icon className="h-4 w-4 text-slate-500 group-hover:text-blue-600 dark:text-slate-400 dark:group-hover:text-blue-400" aria-hidden />
                <span className="font-medium">{label}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500">{sublabel}</span>
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </AccountOverviewErrorBoundary>
  );
}
