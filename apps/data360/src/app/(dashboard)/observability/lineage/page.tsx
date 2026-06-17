'use client';

import { useCallback, useState } from 'react';
import { PiWarningCircleBold } from 'react-icons/pi';
import Breadcrumb from '@/components/ui/Breadcrumb';
import EmptyState from '@/components/ui/EmptyState';
import FreshnessDisclaimer from '@/app/shared/observability/freshness-disclaimer';
import { LineageFlowView } from '@/app/shared/observability/cross-module-flow';
import {
  getDataLineage,
  getAccessPatterns,
  isRouteNotDeployed,
} from '@/app/services/observability';
import { getApiErrorMessage } from '@/lib/api-client';

/**
 * Standalone data-lineage route (column/table lineage canvas + access patterns).
 * Backed by /observability/lineage and /observability/lineage/access-patterns.
 * Owns its async states; degrades to an inline error (incl. graceful "not
 * deployed yet" for 404/501) and never fabricates rows.
 */
export default function LineagePage() {
  const [lineageData, setLineageData] = useState<unknown[]>([]);
  const [accessPatterns, setAccessPatterns] = useState<unknown[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notDeployed, setNotDeployed] = useState(false);

  const onLoadLineage = useCallback(
    async (params: { database?: string; table?: string; days: number }) => {
      setLoading(true);
      setError(null);
      setNotDeployed(false);
      try {
        const result = await getDataLineage(params);
        const r = result as unknown as Record<string, unknown>;
        const raw: unknown = r.data ?? r.lineage ?? r;
        setLineageData(Array.isArray(raw) ? raw : []);
      } catch (err) {
        if (isRouteNotDeployed(err)) {
          setNotDeployed(true);
        } else {
          setError(getApiErrorMessage(err));
        }
        setLineageData([]);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const onLoadAccess = useCallback(async (days: number) => {
    setLoading(true);
    setError(null);
    setNotDeployed(false);
    try {
      const result = await getAccessPatterns(days);
      const r = result as unknown as Record<string, unknown>;
      const raw: unknown = r.data ?? r.patterns ?? r;
      setAccessPatterns(Array.isArray(raw) ? raw : []);
    } catch (err) {
      if (isRouteNotDeployed(err)) {
        setNotDeployed(true);
      } else {
        setError(getApiErrorMessage(err));
      }
      setAccessPatterns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="@container p-4">
      <Breadcrumb
        items={[
          { label: 'Observability', href: '/observability' },
          { label: 'Lineage', href: '/observability/lineage' },
        ]}
      />
      <FreshnessDisclaimer
        className="mb-4"
        detail="Lineage is reconstructed from the data warehouse's ACCOUNT_USAGE.ACCESS_HISTORY, which is delayed (typically up to ~3 hours). Recent queries may not be reflected yet."
      />

      {notDeployed ? (
        <EmptyState
          icon={PiWarningCircleBold}
          title="Lineage is not available yet"
          description="The lineage capability is not deployed on the connected backend. It will appear here once the backend exposes /observability/lineage."
        />
      ) : error ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 p-4 dark:border-red-900/50 dark:bg-red-950/50">
          <PiWarningCircleBold className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      ) : (
        <LineageFlowView
          lineageData={lineageData}
          accessPatterns={accessPatterns}
          loading={loading}
          onLoadLineage={onLoadLineage}
          onLoadAccess={onLoadAccess}
        />
      )}
    </div>
  );
}
