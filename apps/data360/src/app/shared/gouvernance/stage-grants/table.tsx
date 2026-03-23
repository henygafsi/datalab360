'use client';

import { useState, useEffect, useCallback } from 'react';
import { Badge } from 'rizzui';
import { HiOutlineFolder, HiOutlineKey } from 'react-icons/hi2';
import toast from 'react-hot-toast';
import {
  listSnowflakeStages,
  getStageGrants,
} from '@/app/(dashboard)/data-source-connection/connectionServices';

type GrantRow = {
  privilege?: string;
  granted_to?: string;
  grantee_name?: string;
  PRIVILEGE?: string;
  GRANTED_TO?: string;
  GRANTEE_NAME?: string;
};

function norm(key: keyof GrantRow, row: GrantRow): string {
  const v = row[key] ?? row[key.toUpperCase() as keyof GrantRow];
  return typeof v === 'string' ? v : '';
}

export default function StageGrantsTable() {
  const [stages, setStages] = useState<{ name: string }[]>([]);
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [loadingStages, setLoadingStages] = useState(true);
  const [loadingGrants, setLoadingGrants] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStages = useCallback(async () => {
    setLoadingStages(true);
    setError(null);
    try {
      const res = await listSnowflakeStages();
      const list = Array.isArray(res?.stages) ? res.stages : Array.isArray(res?.data) ? res.data : [];
      setStages(list);
      if (list.length > 0) {
        setSelectedStage((prev) => prev || list[0].name);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to load stages');
      toast.error(e?.message || 'Failed to load stages');
      setStages([]);
    } finally {
      setLoadingStages(false);
    }
  }, []);

  useEffect(() => {
    loadStages();
  }, [loadStages]);

  useEffect(() => {
    if (!selectedStage) {
      setGrants([]);
      return;
    }
    let cancelled = false;
    setLoadingGrants(true);
    setError(null);
    getStageGrants(selectedStage)
      .then((data) => {
        if (!cancelled) {
          setGrants(Array.isArray(data?.grants) ? (data.grants as GrantRow[]) : []);
        }
      })
      .catch((e: any) => {
        if (!cancelled) {
          setError(e?.message || 'Failed to load grants');
          toast.error(e?.message || 'Failed to load grants');
          setGrants([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingGrants(false);
      });
    return () => { cancelled = true; };
  }, [selectedStage]);

  if (loadingStages) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500 dark:text-slate-400">
        Loading stages…
      </div>
    );
  }

  if (error && stages.length === 0) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-4 text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
        <p className="font-medium">Cannot load stages</p>
        <p className="text-sm mt-1">{error}</p>
        <p className="text-sm mt-2 text-slate-600 dark:text-slate-400">
          Ensure a Snowflake connection is configured in Data Source Connection and that you have access to list stages.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          <HiOutlineFolder className="h-4 w-4" />
          Stage
        </label>
        <select
          value={selectedStage ?? ''}
          onChange={(e) => setSelectedStage(e.target.value || null)}
          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        >
          <option value="">Select a stage</option>
          {stages.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
        {selectedStage && (
          <Badge className="bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-200">
            <HiOutlineKey className="w-3 h-3 mr-1 inline" />
            {grants.length} grant{grants.length !== 1 ? 's' : ''}
          </Badge>
        )}
      </div>

      {loadingGrants ? (
        <div className="flex items-center justify-center py-8 text-slate-500">
          Loading grants…
        </div>
      ) : selectedStage && grants.length === 0 && !error ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-6 text-center text-slate-600 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-400">
          No grants found for stage <strong>{selectedStage}</strong>.
        </div>
      ) : selectedStage && grants.length > 0 ? (
        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50">
                <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">
                  Privilege
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">
                  Granted To
                </th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200">
                  Grantee
                </th>
              </tr>
            </thead>
            <tbody>
              {grants.map((row, i) => (
                <tr
                  key={i}
                  className="border-b border-slate-100 dark:border-slate-700/50 hover:bg-slate-50 dark:hover:bg-slate-800/30"
                >
                  <td className="px-4 py-2 text-slate-800 dark:text-slate-200">
                    {norm('privilege', row)}
                  </td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                    {norm('granted_to', row)}
                  </td>
                  <td className="px-4 py-2 text-slate-600 dark:text-slate-400">
                    {norm('grantee_name', row)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
