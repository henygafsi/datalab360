'use client';

import { PiShareNetwork } from 'react-icons/pi';
import { Text } from 'rizzui';

export default function SocialMediaDashboardPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] p-8">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-12 max-w-lg text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 mx-auto mb-6">
          <PiShareNetwork className="h-8 w-8 text-slate-500 dark:text-slate-400" />
        </div>
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white mb-2">
          Social Media Analytics
        </h2>
        <Text className="text-slate-600 dark:text-slate-400 mb-4">
          No sample or static data is displayed. Connect your social accounts or integrate your analytics API to load real data here.
        </Text>
        <Text className="text-sm text-slate-500 dark:text-slate-500">
          Dashboards, lists and reports on this page will be driven by your API when configured.
        </Text>
      </div>
    </div>
  );
}
