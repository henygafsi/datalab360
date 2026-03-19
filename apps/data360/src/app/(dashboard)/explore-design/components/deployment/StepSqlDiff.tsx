'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { Button, Badge } from 'rizzui';
import {
  GitBranch, Loader2, AlertTriangle,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useDeploymentContext } from './DeploymentContext';
import { generateSnowflakeSQL, DDL_EVENT_TYPES } from './deployment-utils';
import SqlDiffViewer from '../SqlDiffViewer';
import * as exploreDesignApi from '@/app/services/api/exploreDesignApi';
import { getApiErrorMessage } from '@/lib/api-client';
import type { SqlDiffResult } from '@/app/services/api/types';

export default function StepSqlDiff() {
  const { projectId, database, schemas, pendingEvents } = useDeploymentContext();
  const [serverDiff, setServerDiff] = useState<SqlDiffResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedEventIdx, setSelectedEventIdx] = useState(0);

  const ddlEvents = useMemo(
    () => pendingEvents.filter(e => DDL_EVENT_TYPES.includes(e.type)),
    [pendingEvents],
  );

  // Fetch server-side diff
  const fetchDiff = useCallback(async () => {
    if (!projectId || !database) return;
    setIsLoading(true);
    try {
      const result = await exploreDesignApi.sqlDiff(projectId, {
        database,
        schema_name: schemas[0] || 'PUBLIC',
        event_ids: ddlEvents.map(e => e.id),
      });
      setServerDiff(result);
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Failed to fetch SQL diff');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, database, schemas, ddlEvents]);

  // Client-side diff fallback
  const currentEvent = ddlEvents[selectedEventIdx];
  const { sql: proposedSql, rollbackSql } = currentEvent
    ? generateSnowflakeSQL(currentEvent)
    : { sql: '', rollbackSql: '' };

  return (
      <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-purple-500" />
          SQL Diff Preview
        </h3>
        <Button variant="outline" size="sm" onClick={fetchDiff} disabled={isLoading} className="gap-1.5">
          {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GitBranch className="h-3.5 w-3.5" />}
          Fetch Server Diff
        </Button>
      </div>

      {/* Server diff results */}
      {serverDiff && serverDiff.diffs.length > 0 ? (
        <div className="space-y-3">
          {serverDiff.diffs.map((diff, idx) => (
            <div key={idx} className="border dark:border-slate-700 rounded-lg overflow-hidden">
              <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-2">
                <Badge size="sm" className="bg-purple-100 text-purple-600 text-[10px]">
                  {diff.ddl_type}
                </Badge>
                <span className="text-xs font-mono">{diff.target_table}</span>
              </div>
              <SqlDiffViewer
                beforeSql={diff.before.columns.join('\n')}
                afterSql={diff.after.columns.join('\n')}
                beforeLabel="Current"
                afterLabel="Proposed"
              />
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Client-side per-event diff */}
          {ddlEvents.length > 0 ? (
            <div className="space-y-3">
              {/* Event selector */}
              <div className="flex items-center gap-2 flex-wrap">
                {ddlEvents.map((evt, idx) => (
                  <button
                    key={evt.id}
                    onClick={() => setSelectedEventIdx(idx)}
                    className={`px-3 py-1.5 rounded-lg text-xs border transition-all ${
                      selectedEventIdx === idx
                        ? 'border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-900/20'
                        : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    {evt.type.replace(/_/g, ' ')} — {evt.target.table}
                  </button>
                ))}
              </div>

              <SqlDiffViewer
                beforeSql={rollbackSql || '-- No previous state'}
                afterSql={proposedSql}
                beforeLabel="Rollback SQL"
                afterLabel="Proposed SQL"
              />
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400">
              <AlertTriangle className="h-6 w-6 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No DDL events to diff</p>
            </div>
          )}
        </>
      )}

      </div>
  );
}
