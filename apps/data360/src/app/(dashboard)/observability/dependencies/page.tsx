'use client';

import Breadcrumb from '@/components/ui/Breadcrumb';
import DependenciesCard from '@/app/shared/observability/dependencies-card';
import FreshnessDisclaimer from '@/app/shared/observability/freshness-disclaimer';

/**
 * Standalone object-dependencies route (upstream/downstream lineage + full
 * dependency graph). Backed by /observability/dependencies and
 * /observability/dependencies/graph. DependenciesCard owns its async states.
 */
export default function DependencyGraphPage() {
  return (
    <div className="@container p-4">
      <Breadcrumb
        items={[
          { label: 'Observability', href: '/observability' },
          { label: 'Dependencies', href: '/observability/dependencies' },
        ]}
      />
      <FreshnessDisclaimer
        className="mb-4"
        detail="Dependencies come from Snowflake ACCOUNT_USAGE.OBJECT_DEPENDENCIES, which is delayed (typically up to a few hours). Newly created objects may not appear immediately."
      />
      <DependenciesCard />
    </div>
  );
}
