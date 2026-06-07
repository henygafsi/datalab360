'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Select } from 'rizzui';
import {
  History, ChevronDown, ChevronRight, RefreshCw,
  User, Calendar, FileText, Filter,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getExploreEvents } from '@/app/services/api/exploreDesignApi';
import { getApiErrorMessage } from '@/lib/api-client';
import type { ProjectEvent } from '@/app/services/api/types';

interface AuditTrailPanelProps {
  projectId: string;
  className?: string;
}

const EVENT_TYPE_OPTIONS = [
  { label: 'All Events', value: '' },
  { label: 'DDL', value: 'DDL' },
  { label: 'INGESTION', value: 'INGESTION' },
  { label: 'DEPLOYMENT', value: 'DEPLOYMENT' },
  { label: 'QUALITY_GATE', value: 'QUALITY_GATE' },
];

const AuditTrailPanel: React.FC<AuditTrailPanelProps> = ({
  projectId,
  className,
}) => {
  const [events, setEvents] = useState<ProjectEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Filter state
  const [eventType, setEventType] = useState('');

  const fetchAudit = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await getExploreEvents(projectId, {
        event_type: eventType || undefined,
        limit: 50,
      });
      setEvents(result.events);
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Failed to load project events');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, eventType]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const toggleEntry = (id: string) => {
    setExpandedEntry((prev) => (prev === id ? null : id));
  };

  return (
    <div className={cn('border dark:border-slate-700 rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
        <span className="font-medium text-sm flex items-center gap-2">
          <History className="h-4 w-4 text-purple-500" />
          Project Events
          {events.length > 0 && (
            <Badge size="sm" className="bg-purple-100 text-purple-600 dark:bg-purple-900/30">
              {events.length} events
            </Badge>
          )}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-1.5"
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAudit}
            disabled={isLoading}
            className="gap-1.5"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="px-4 py-3 bg-slate-50/50 dark:bg-slate-800/30 border-b dark:border-slate-700 flex gap-3">
          <div className="w-48">
            <label className="text-xs text-slate-500 mb-1 block">Event Type</label>
            <Select
              size="sm"
              options={EVENT_TYPE_OPTIONS}
              value={eventType}
              onChange={(opt: any) => setEventType(opt?.value ?? '')}
            />
          </div>
        </div>
      )}

      {/* Events */}
      <div className="divide-y dark:divide-slate-700 max-h-[500px] overflow-auto">
        {isLoading && events.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-sm text-slate-500">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            Loading events...
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <FileText className="h-6 w-6 mx-auto mb-2 text-slate-300" />
            <p className="text-sm">No events found</p>
            <p className="text-xs mt-1 text-slate-400">Events are recorded as you perform actions</p>
          </div>
        ) : (
          events.map((ev) => {
            const isOpen = expandedEntry === ev.event_id;
            const statusColor =
              ev.status === 'SUCCESS' ? 'bg-green-100 text-green-600 dark:bg-green-900/30'
              : ev.status === 'FAILED' ? 'bg-red-100 text-red-600 dark:bg-red-900/30'
              : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30';
            return (
              <div key={ev.event_id}>
                <button
                  className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
                  onClick={() => toggleEntry(ev.event_id)}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Badge size="sm" className={cn('text-xs shrink-0', statusColor)}>
                      {ev.event_type}
                    </Badge>
                    <span className="text-sm truncate">
                      {ev.event_subtype && (
                        <span className="text-slate-500">{ev.event_subtype}: </span>
                      )}
                      <span className="font-mono text-xs">{ev.entity_id ?? ev.entity_type ?? '—'}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {ev.username}
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(ev.timestamp).toLocaleString()}
                    </span>
                    {isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    )}
                  </div>
                </button>
                {isOpen && ev.details && (
                  <div className="px-4 pb-3 pl-10">
                    <p className="text-xs font-medium text-slate-500 mb-1">Details</p>
                    <pre className="text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 rounded p-2 overflow-auto max-h-[200px]">
                      {JSON.stringify(ev.details, null, 2)}
                    </pre>
                    {ev.error_message && (
                      <p className="text-xs text-red-500 mt-1">{ev.error_message}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AuditTrailPanel;
