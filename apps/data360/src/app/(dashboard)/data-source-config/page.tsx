'use client';

import PageHeader from '@/app/shared/page-header';
import { Button } from 'rizzui';
import { PiDatabase, PiGear, PiLink } from 'react-icons/pi';
import Link from 'next/link';

export default function DataSourceConfigPage() {
  return (
    <div className="space-y-8">
      <PageHeader
        title="Data Source Configuration"
        breadcrumb={[
          { name: 'Home', href: '/' },
          { name: 'Data Sources', href: '/data-source-connection' },
          { name: 'Configuration' },
        ]}
      />

      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-8">
        <div className="max-w-xl space-y-6">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-blue-100 dark:bg-blue-900/30">
              <PiGear className="h-7 w-7 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                Configuration des sources de données
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                Gérer les connexions, intégrations (Azure, AWS, Snowflake) et stages.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Link href="/data-source-connection">
              <Button className="gap-2" size="lg">
                <PiLink className="w-5 h-5" />
                Ouvrir les connexions
              </Button>
            </Link>
            <Link href="/data-source-connection">
              <Button variant="outline" className="gap-2" size="lg">
                <PiDatabase className="w-5 h-5" />
                Data Source Connection
              </Button>
            </Link>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-500">
            La configuration des intégrations (storage, notification) et des stages se fait depuis la page Connexions.
          </p>
        </div>
      </div>
    </div>
  );
}
