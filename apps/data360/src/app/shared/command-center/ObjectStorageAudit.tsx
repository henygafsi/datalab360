'use client';

/**
 * ObjectStorageAudit — an always-on per-table storage audit for the Snowflake
 * Objects tab. The explorer inventory is cache-table-backed and shows 0 until a
 * sync completes; this table reads SNOWFLAKE.ACCOUNT_USAGE.TABLE_STORAGE_METRICS
 * directly (via /command-center/table-storage), so the tab always shows real
 * object data — active / time-travel / fail-safe / clone bytes + est. $ per table —
 * even when the catalog cache is empty.
 */

import { useEffect, useState } from 'react';
import { getTableStorage } from '@/app/services/command-center';
import AuditTable, { type Row } from './AuditTable';

export default function ObjectStorageAudit({ limit = 200 }: { limit?: number }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    getTableStorage(limit)
      .then((r) => active && setRows(((r?.data ?? []) as Row[]) || []))
      .catch(() => active && setRows([]))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [limit]);

  return (
    <div className="mt-6">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Stockage par table — audit
        </h3>
        <span className="text-[11px] uppercase tracking-wide text-gray-400">
          ACCOUNT_USAGE.TABLE_STORAGE_METRICS
        </span>
      </div>
      {loading ? (
        <div className="h-48 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
      ) : (
        <AuditTable
          rows={rows}
          title="Tables — actif / time-travel / fail-safe / clone (+ $/mois estimé)"
          subtitle="lecture directe ACCOUNT_USAGE (indépendante du cache catalogue)"
        />
      )}
    </div>
  );
}
