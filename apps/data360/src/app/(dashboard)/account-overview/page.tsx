'use client';

import { useState, useEffect, Component, type ReactNode } from 'react';
import { Loader } from 'rizzui';
import { PiWarningCircleBold } from 'react-icons/pi';
import CommandCenterDashboard from '@/app/shared/command-center';

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
      return null; // Error UI is rendered by the parent
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
      <div className="flex items-center justify-center py-20">
        <Loader size="lg" />
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
      <CommandCenterDashboard />
    </AccountOverviewErrorBoundary>
  );
}
