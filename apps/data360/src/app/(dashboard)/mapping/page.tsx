'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Text, Button } from 'rizzui';
import { PiArrowRight } from 'react-icons/pi';
import { routes } from '@/config/routes';

/**
 * Mapping page was migrated to Explore & Design.
 * This route redirects to Explore & Design for data modeling, wrangling, and policies.
 */
export default function MappingRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(routes.exploreDesign.view);
  }, [router]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 p-8">
      <div className="max-w-md rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center shadow-lg">
        <Text className="text-lg font-semibold text-slate-800 dark:text-white">
          Mapping has moved to Explore & Design
        </Text>
        <Text className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          Data modeling, wrangling, policies, and column enrichment are now in Explore & Design.
        </Text>
        <Button
          className="mt-6"
          onClick={() => router.push(routes.exploreDesign.view)}
        >
          Open Explore & Design
          <PiArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
