'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Text, Button } from 'rizzui';
import { PiArrowRight } from 'react-icons/pi';
import { routes } from '@/config/routes';
import { useTrackEvent } from '@/hooks/useTrackEvent';

/**
 * Data Source Configuration was folded into Data Source Connection.
 * Integration (storage/notification), stage, and connection config all live on
 * the Connections page now, so this legacy route is a real redirect rather than
 * a dead-end interstitial. The "Configuration" nav entry (carbon + hydrogen
 * sidebars) lands users on Connections.
 */
export default function DataSourceConfigRedirectPage() {
  const router = useRouter();
  const { trackFeatureClick } = useTrackEvent();

  useEffect(() => {
    // The auto PAGE_VIEW is debounced and gets cancelled by the immediate
    // unmount, so we emit a manual (synchronously-queued) event to capture
    // hits on this deprecated route before redirecting.
    trackFeatureClick('legacy_data_source_config_redirect');
    router.replace(routes.connexion.dataSourceConnection);
  }, [router, trackFeatureClick]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 p-8">
      <div className="max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center shadow-lg">
        <Text className="text-lg font-semibold text-slate-800 dark:text-white">
          Configuration has moved to Connections
        </Text>
        <Text className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Connections, integrations (storage / notification) and stages are now
          managed from the Data Source Connection page.
        </Text>
        <Button
          className="mt-6"
          onClick={() => router.push(routes.connexion.dataSourceConnection)}
        >
          Open Data Source Connection
          <PiArrowRight aria-hidden="true" className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
