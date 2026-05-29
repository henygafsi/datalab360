'use client';

import ErrorBoundary from '@/components/ui/ErrorBoundary';
import NetworkPoliciesContent from '../policies/network-policies-content';

/**
 * Standalone /governance/network-policies route.
 *
 * Delegates to the same NetworkPoliciesContent component used by the unified
 * Policies page so there is a single, real, service-backed implementation.
 * (This page previously held a parallel mock data layer with hardcoded sample
 * policies — removed in favour of the live component.)
 */
export default function NetworkPoliciesPage() {
  return (
    <ErrorBoundary>
      <div className="space-y-6">
        <NetworkPoliciesContent />
      </div>
    </ErrorBoundary>
  );
}
