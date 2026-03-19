'use client';

import React, { useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge } from 'rizzui';
import {
  ChevronDown, ChevronRight, FileCode, Database, Download, Copy,
  Eye, EyeOff,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useDeploymentContext } from './DeploymentContext';
import {
  sortEventsForDeployment, DDL_EVENT_TYPES, SCHEMA_EVENT_TYPES, INGESTION_EVENT_TYPES,
  EVENT_PRIORITY, generateSnowflakeSQL, formatEventType, getEventSummary,
  generateDeploymentScript, generateRollbackScript,
} from './deployment-utils';

export default function StepReview() {
  const { events, pendingEvents, projectId, database } = useDeploymentContext();
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [showSQL, setShowSQL] = useState(false);
  const [showRollback, setShowRollback] = useState(false);

  const ddlPendingEvents = useMemo(
    () => pendingEvents.filter(e => DDL_EVENT_TYPES.includes(e.type)),
    [pendingEvents],
  );

  // Group by table, sorted by priority
  const eventsByTable = useMemo(() => {
    const sorted = sortEventsForDeployment(ddlPendingEvents);
    const groups: Record<string, typeof sorted> = {};
    sorted.forEach(event => {
      const key = `${event.target.database}.${event.target.schema}.${event.target.table}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    });
    return Object.entries(groups).sort(([, a], [, b]) => {
      const minA = Math.min(...a.map(e => EVENT_PRIORITY[e.type] ?? 99));
      const minB = Math.min(...b.map(e => EVENT_PRIORITY[e.type] ?? 99));
      return minA - minB;
    });
  }, [ddlPendingEvents]);

  // Categorize events
  const { schemaCount, ingestionCount } = useMemo(() => ({
    schemaCount: pendingEvents.filter(e => SCHEMA_EVENT_TYPES.includes(e.type)).length,
    ingestionCount: pendingEvents.filter(e => INGESTION_EVENT_TYPES.includes(e.type)).length,
  }), [pendingEvents]);

  // Stats
  const stats = useMemo(() => {
    const ddlEvents = events.filter(e => DDL_EVENT_TYPES.includes(e.type));
    return {
      total: ddlEvents.length,
      pending: ddlPendingEvents.length,
      validated: ddlEvents.filter(e => e.status === 'validated').length,
      applied: ddlEvents.filter(e => e.status === 'applied').length,
      failed: ddlEvents.filter(e => e.status === 'failed').length,
      columnMappings: events.filter(e => e.type === 'COLUMN_MAPPING_CREATED').length,
    };
  }, [events, ddlPendingEvents]);

  const allSQL = useMemo(() => generateDeploymentScript(pendingEvents, projectId, database), [pendingEvents, projectId, database]);
  const allRollbackSQL = useMemo(() => generateRollbackScript(pendingEvents, projectId), [pendingEvents, projectId]);

  const toggleExpand = (id: string) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleDownload = (content: string, name: string) => {
    const blob = new Blob([content], { type: 'text/sql' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}-${new Date().toISOString().split('T')[0]}.sql`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`${name} script downloaded`);
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(allSQL);
      toast.success('SQL copied to clipboard');
    } catch { toast.error('Failed to copy SQL'); }
  };

  return (
    <div className="p-6 space-y-4">
      {/* Stats Bar */}
      <div className="flex items-center gap-6 text-sm flex-wrap pb-3 border-b dark:border-slate-700">
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Total DDL:</span>
          <Badge>{stats.total}</Badge>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-slate-500">Pending:</span>
          <Badge className="bg-amber-100 text-amber-600">{stats.pending}</Badge>
        </div>
        {stats.columnMappings > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-slate-500">Mappings:</span>
            <Badge className="bg-blue-100 text-blue-600">{stats.columnMappings}</Badge>
          </div>
        )}
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-slate-400">Schema: {schemaCount} | Ingestion: {ingestionCount}</span>
        </div>
      </div>

      {/* Event Groups */}
      {eventsByTable.length === 0 ? (
        <div className="text-center py-12 text-slate-400">
          <Database className="h-8 w-8 mx-auto mb-3 opacity-50" />
          <p className="text-sm">No pending events to deploy</p>
        </div>
      ) : (
        <div className="space-y-3">
          {eventsByTable.map(([tableKey, tableEvents]) => (
            <div key={tableKey} className="border dark:border-slate-700 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Database className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-sm font-mono font-medium">{tableKey}</span>
                  <Badge size="sm" className="bg-slate-100 text-slate-500">{tableEvents.length}</Badge>
                </div>
              </div>
              <div className="divide-y dark:divide-slate-700">
                {tableEvents.map(event => {
                  const isExpanded = expandedEvents.has(event.id);
                  const { sql, rollbackSql } = generateSnowflakeSQL(event);
                  return (
                    <div key={event.id}>
                      <button
                        className="w-full px-4 py-2 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors text-left"
                        onClick={() => toggleExpand(event.id)}
                      >
                        {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400 shrink-0" />}
                        <Badge size="sm" className={cn(
                          'text-[10px] shrink-0',
                          event.type.includes('REMOVE') || event.type.includes('DROP') ? 'bg-red-100 text-red-600' :
                          event.type.includes('CREATE') || event.type.includes('ADD') ? 'bg-green-100 text-green-600' :
                          'bg-blue-100 text-blue-600'
                        )}>
                          {formatEventType(event.type)}
                        </Badge>
                        <span className="text-xs text-slate-500 truncate">{getEventSummary(event)}</span>
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-3 pl-10">
                          <pre className="text-xs bg-slate-900 text-green-400 p-3 rounded-lg overflow-x-auto">{sql}</pre>
                          {rollbackSql && (
                            <pre className="text-xs bg-slate-900 text-red-400 p-3 rounded-lg overflow-x-auto mt-2">{rollbackSql}</pre>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SQL Preview Toggle */}
      <div className="flex items-center gap-2 pt-2">
        <Button variant="outline" size="sm" onClick={() => setShowSQL(!showSQL)} className="gap-1.5">
          {showSQL ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          {showSQL ? 'Hide' : 'Show'} Full SQL
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleDownload(allSQL, 'deploy')} className="gap-1.5">
          <Download className="h-3.5 w-3.5" /> Deploy Script
        </Button>
        <Button variant="outline" size="sm" onClick={() => handleDownload(allRollbackSQL, 'rollback')} className="gap-1.5">
          <Download className="h-3.5 w-3.5" /> Rollback Script
        </Button>
        <Button variant="outline" size="sm" onClick={handleCopy} className="gap-1.5">
          <Copy className="h-3.5 w-3.5" /> Copy SQL
        </Button>
      </div>

      {showSQL && (
        <pre className="text-xs bg-slate-900 text-green-400 p-4 rounded-lg overflow-auto max-h-[300px]">{allSQL}</pre>
      )}

    </div>
  );
}
