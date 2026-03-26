'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Badge } from 'rizzui';
import {
  Network, Loader2, AlertTriangle, Shield,
} from 'lucide-react';
import { useDeploymentContext } from './DeploymentContext';
import { DDL_EVENT_TYPES } from './deployment-utils';
import * as exploreDesignApi from '@/app/services/api/exploreDesignApi';
import type { EnhancedImpactAnalysisResult } from '@/app/services/api/types';

export default function StepImpact() {
  const { projectId, pendingEvents, results, setResults } = useDeploymentContext();
  const [isLoading, setIsLoading] = useState(false);

  const ddlEvents = useMemo(
    () => pendingEvents.filter(e => DDL_EVENT_TYPES.includes(e.type)),
    [pendingEvents],
  );

  // Destructive changes summary
  const destructiveChanges = useMemo(
    () => ddlEvents.filter(e =>
      ['REMOVE_COLUMN', 'TABLE_RENAMED', 'COLUMN_RENAMED', 'COLUMN_TYPE_CHANGED',
       'PRIMARY_KEY_REMOVED', 'FOREIGN_KEY_REMOVED'].includes(e.type),
    ),
    [ddlEvents],
  );

  // Affected tables
  const affectedTables = useMemo(
    () => Array.from(new Set(ddlEvents.map(e => `${e.target.database}.${e.target.schema}.${e.target.table}`))),
    [ddlEvents],
  );

  // Fetch enhanced impact on mount
  useEffect(() => {
    if (results.enhancedImpactResult || !projectId) return;

    const firstDdl = ddlEvents[0];
    if (!firstDdl) return;

    setIsLoading(true);
    exploreDesignApi.enhancedImpactAnalysis(projectId, {
      database: firstDdl.target.database,
      schema: firstDdl.target.schema,
      table: firstDdl.target.table,
      column: firstDdl.target.column || undefined,
    })
      .then(result => setResults(prev => ({ ...prev, enhancedImpactResult: result })))
      .catch(() => { /* server-side unavailable */ })
      .finally(() => setIsLoading(false));
  }, [projectId, ddlEvents, results.enhancedImpactResult, setResults]);

  const impact = results.enhancedImpactResult;

  return (
      <div className="p-6 space-y-6">
      <h3 className="text-sm font-semibold flex items-center gap-2">
        <Network className="h-4 w-4 text-orange-500" />
        Impact Analysis
      </h3>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-4 border dark:border-slate-700 rounded-lg text-center">
          <p className="text-2xl font-bold text-blue-600">{affectedTables.length}</p>
          <p className="text-xs text-slate-500">Affected Tables</p>
        </div>
        <div className="p-4 border dark:border-slate-700 rounded-lg text-center">
          <p className="text-2xl font-bold text-amber-600">{ddlEvents.length}</p>
          <p className="text-xs text-slate-500">DDL Operations</p>
        </div>
        <div className="p-4 border dark:border-slate-700 rounded-lg text-center">
          <p className={cn('text-2xl font-bold', destructiveChanges.length > 0 ? 'text-red-600' : 'text-green-600')}>
            {destructiveChanges.length}
          </p>
          <p className="text-xs text-slate-500">Destructive Changes</p>
        </div>
      </div>

      {/* Destructive Changes Warning */}
      {destructiveChanges.length > 0 && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <span className="text-sm font-medium text-red-700 dark:text-red-300">Destructive Changes Detected</span>
          </div>
          <div className="space-y-1">
            {destructiveChanges.map(e => (
              <div key={e.id} className="text-xs text-red-600 dark:text-red-400 flex items-center gap-2">
                <span className="font-mono">{e.type.replace(/_/g, ' ')}</span>
                <span className="text-red-400">→</span>
                <span>{e.target.table}{e.target.column ? `.${e.target.column}` : ''}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Enhanced Impact Analysis (A4) */}
      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Fetching enhanced impact analysis...
        </div>
      )}

      {impact && (
        <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
            <span className="font-medium text-sm flex items-center gap-2">
              <Shield className="h-4 w-4 text-indigo-500" />
              Enhanced Impact — {impact.table}
            </span>
            <div className="flex items-center gap-2">
              <Badge className={cn(
                'text-xs',
                impact.safe_to_proceed ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600',
              )}>
                {impact.safe_to_proceed ? 'Safe to proceed' : 'Caution required'}
              </Badge>
              <Badge className="bg-slate-100 text-slate-600 text-xs">
                Score: {impact.risk_score}
              </Badge>
            </div>
          </div>

          {impact.impacts.length > 0 && (
            <div className="divide-y dark:divide-slate-700">
              {impact.impacts.map((item, idx) => (
                <div key={idx} className="px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge size="sm" className={cn(
                      'text-[10px]',
                      item.risk_level === 'HIGH' ? 'bg-red-100 text-red-600' :
                      item.risk_level === 'MEDIUM' ? 'bg-amber-100 text-amber-600' :
                      'bg-green-100 text-green-600',
                    )}>
                      {item.risk_level}
                    </Badge>
                    <div>
                      <span className="text-sm font-medium">{item.object_name}</span>
                      <span className="text-xs text-slate-500 ml-2">{item.object_type}</span>
                    </div>
                  </div>
                  <span className="text-xs text-slate-500 max-w-[300px] text-right">{item.recommendation}</span>
                </div>
              ))}
            </div>
          )}

          {/* Summary bar */}
          <div className="px-4 py-2 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-4 text-xs text-slate-500">
            <span className="text-red-500">High: {impact.high_risk}</span>
            <span className="text-amber-500">Medium: {impact.medium_risk}</span>
            <span className="text-green-500">Low: {impact.low_risk}</span>
            <span className="text-slate-400">Total: {impact.total}</span>
          </div>
        </div>
      )}

      {/* Affected Tables List */}
      <div>
        <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
          Affected Objects
        </h4>
        <div className="grid grid-cols-2 gap-2">
          {affectedTables.map(table => (
            <div key={table} className="px-3 py-2 bg-slate-50 dark:bg-slate-800/50 rounded text-xs font-mono">
              {table}
            </div>
          ))}
        </div>
      </div>

      </div>
  );
}
