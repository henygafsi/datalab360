'use client';

import React, { useState, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Input, Tooltip } from 'rizzui';
import {
  Table2, RefreshCw, Clock, History, Shield, Key, Link2, Edit2,
  Trash2, Check, X, AlertTriangle, ChevronDown, ChevronRight,
  Filter, Search, Play, Undo2, CheckCircle2, XCircle, Clock4,
  Plus, Minus, Eye, Tag, Layers
} from 'lucide-react';
import { useEventStore, DesignEvent, EventType, EventStatus } from '../stores/event-store';

// Event type icons and labels
const eventTypeConfig: Record<EventType, { icon: React.ComponentType<any>; label: string; color: string }> = {
  TABLE_SELECTED: { icon: Table2, label: 'Table Selected', color: 'bg-slate-100 text-slate-600' },
  TABLE_RENAMED: { icon: Edit2, label: 'Table Renamed', color: 'bg-blue-100 text-blue-600' },
  COLUMN_RENAMED: { icon: Edit2, label: 'Column Renamed', color: 'bg-blue-100 text-blue-600' },
  COLUMN_TYPE_CHANGED: { icon: Table2, label: 'Type Changed', color: 'bg-purple-100 text-purple-600' },
  ADD_COLUMN: { icon: Plus, label: 'Column Added', color: 'bg-green-100 text-green-600' },
  REMOVE_COLUMN: { icon: Minus, label: 'Column Removed', color: 'bg-red-100 text-red-600' },
  PRIMARY_KEY_SET: { icon: Key, label: 'PK Set', color: 'bg-amber-100 text-amber-600' },
  PRIMARY_KEY_REMOVED: { icon: Key, label: 'PK Removed', color: 'bg-amber-100 text-amber-600' },
  FOREIGN_KEY_ADDED: { icon: Link2, label: 'FK Added', color: 'bg-purple-100 text-purple-600' },
  FOREIGN_KEY_REMOVED: { icon: Link2, label: 'FK Removed', color: 'bg-purple-100 text-purple-600' },
  INGESTION_MODE_SET: { icon: RefreshCw, label: 'Ingestion Mode', color: 'bg-green-100 text-green-600' },
  SCD_CONFIGURED: { icon: History, label: 'SCD Configured', color: 'bg-indigo-100 text-indigo-600' },
  MASKING_POLICY_APPLIED: { icon: Shield, label: 'Masking Applied', color: 'bg-red-100 text-red-600' },
  MASKING_POLICY_REMOVED: { icon: Shield, label: 'Masking Removed', color: 'bg-red-100 text-red-600' },
  RLS_POLICY_APPLIED: { icon: Eye, label: 'RLS Applied', color: 'bg-blue-100 text-blue-600' },
  RLS_POLICY_REMOVED: { icon: Eye, label: 'RLS Removed', color: 'bg-blue-100 text-blue-600' },
  AGGREGATION_POLICY_APPLIED: { icon: Layers, label: 'Aggregation Applied', color: 'bg-cyan-100 text-cyan-600' },
  AGGREGATION_POLICY_REMOVED: { icon: Layers, label: 'Aggregation Removed', color: 'bg-cyan-100 text-cyan-600' },
  TAG_APPLIED: { icon: Tag, label: 'Tag Applied', color: 'bg-indigo-100 text-indigo-600' },
  TAG_REMOVED: { icon: Tag, label: 'Tag Removed', color: 'bg-indigo-100 text-indigo-600' },
  RELATION_CREATED: { icon: Link2, label: 'Relation Created', color: 'bg-purple-100 text-purple-600' },
  RELATION_REMOVED: { icon: Link2, label: 'Relation Removed', color: 'bg-purple-100 text-purple-600' },
  TABLE_EXCLUDED: { icon: Trash2, label: 'Table Excluded', color: 'bg-red-100 text-red-600' },
  TABLE_INCLUDED: { icon: Check, label: 'Table Included', color: 'bg-green-100 text-green-600' },
  COLUMN_EXCLUDED: { icon: Trash2, label: 'Column Excluded', color: 'bg-red-100 text-red-600' },
  COLUMN_INCLUDED: { icon: Check, label: 'Column Included', color: 'bg-green-100 text-green-600' },
  BATCH_OPERATION: { icon: Table2, label: 'Batch Operation', color: 'bg-slate-100 text-slate-600' },
};

// Status config
const statusConfig: Record<EventStatus, { icon: React.ComponentType<any>; label: string; color: string }> = {
  pending: { icon: Clock4, label: 'Pending', color: 'bg-amber-100 text-amber-600' },
  validated: { icon: CheckCircle2, label: 'Validated', color: 'bg-green-100 text-green-600' },
  failed: { icon: XCircle, label: 'Failed', color: 'bg-red-100 text-red-600' },
  applied: { icon: Check, label: 'Applied', color: 'bg-blue-100 text-blue-600' },
};

// Format timestamp
const formatTime = (date: Date): string => {
  const d = new Date(date);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
};

// Event Row Component
const EventRow: React.FC<{
  event: DesignEvent;
  onRemove: () => void;
  onValidate: () => void;
  isExpanded: boolean;
  onToggle: () => void;
}> = ({ event, onRemove, onValidate, isExpanded, onToggle }) => {
  const config = eventTypeConfig[event.type] || {
    icon: Table2,
    label: event.type,
    color: 'bg-slate-100 text-slate-600'
  };
  const status = statusConfig[event.status] || {
    icon: Clock4,
    label: event.status,
    color: 'bg-slate-100 text-slate-600'
  };
  const Icon = config.icon;
  const StatusIcon = status.icon;

  return (
    <div className="border-b dark:border-slate-700 last:border-0">
      <div
        className={cn(
          'flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer',
          event.status === 'failed' && 'bg-red-50 dark:bg-red-900/10'
        )}
        onClick={onToggle}
      >
        {/* Expand Toggle */}
        <button className="p-0.5">
          {isExpanded ? (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400" />
          )}
        </button>

        {/* Event Type */}
        <div className={cn('flex items-center gap-2 px-2 py-1 rounded-full text-xs font-medium', config.color)}>
          <Icon className="h-3 w-3" />
          <span>{config.label}</span>
        </div>

        {/* Target */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {event.target.table}
            {event.target.column && (
              <span className="text-slate-400">.{event.target.column}</span>
            )}
          </p>
          <p className="text-xs text-slate-500 truncate">
            {event.target.database}.{event.target.schema}
          </p>
        </div>

        {/* Status */}
        <div className={cn('flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium', status.color)}>
          <StatusIcon className="h-3 w-3" />
          <span>{status.label}</span>
        </div>

        {/* Timestamp */}
        <span className="text-xs text-slate-400">
          {formatTime(event.timestamp)}
        </span>

        {/* Actions */}
        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {event.status === 'pending' && (
            <Tooltip content="Validate">
              <Button
                variant="text"
                size="sm"
                onClick={onValidate}
                className="p-1.5 text-green-600 hover:bg-green-50"
              >
                <Play className="h-4 w-4" />
              </Button>
            </Tooltip>
          )}
          <Tooltip content="Remove">
            <Button
              variant="text"
              size="sm"
              onClick={onRemove}
              className="p-1.5 text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
      </div>

      {/* Expanded Details */}
      {isExpanded && (
        <div className="px-4 pb-3 ml-10">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg text-sm">
            <p className="font-medium mb-2">Event Details</p>
            <pre className="text-xs text-slate-600 dark:text-slate-400 overflow-auto">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
            {event.error && (
              <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-red-600 dark:text-red-400 text-xs">
                <strong>Error:</strong> {event.error}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// Main Component
interface EventTableProps {
  className?: string;
  compact?: boolean;
}

const EventTable: React.FC<EventTableProps> = ({ className, compact }) => {
  const { events, pendingEvents, removeEvent, updateEventStatus, clearEvents, validateEvents, undoEvent, canUndo } = useEventStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<EventStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<EventType | 'all'>('all');
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  // Filtered events
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesTarget =
          event.target.table.toLowerCase().includes(query) ||
          event.target.schema.toLowerCase().includes(query) ||
          (event.target.column?.toLowerCase().includes(query));
        if (!matchesTarget) return false;
      }

      // Status filter
      if (statusFilter !== 'all' && event.status !== statusFilter) return false;

      // Type filter
      if (typeFilter !== 'all' && event.type !== typeFilter) return false;

      return true;
    });
  }, [events, searchQuery, statusFilter, typeFilter]);

  // Group events by table
  const groupedEvents = useMemo(() => {
    const groups: Record<string, DesignEvent[]> = {};
    filteredEvents.forEach((event) => {
      const key = `${event.target.database}.${event.target.schema}.${event.target.table}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(event);
    });
    return groups;
  }, [filteredEvents]);

  const handleToggleExpand = (eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  };

  const handleValidateSingle = (eventId: string) => {
    // In real implementation, call backend API
    updateEventStatus({ eventId, status: 'validated' });
  };

  if (compact) {
    return (
      <div className={cn('bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700', className)}>
        <div className="px-4 py-3 border-b dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-slate-400" />
            <span className="font-medium">Pending Changes</span>
            <Badge className="bg-amber-100 text-amber-600">{pendingEvents.length}</Badge>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip content="Undo Last">
              <Button
                variant="text"
                size="sm"
                onClick={() => undoEvent()}
                disabled={!canUndo}
                className="p-1.5"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            </Tooltip>
            <Tooltip content="Clear All">
              <Button
                variant="text"
                size="sm"
                onClick={() => clearEvents()}
                disabled={events.length === 0}
                className="p-1.5 text-red-500"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </Tooltip>
          </div>
        </div>
        <div className="max-h-60 overflow-auto">
          {events.length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-sm">
              No changes recorded yet
            </div>
          ) : (
            events.slice(-5).reverse().map((event) => {
              const config = eventTypeConfig[event.type] || {
                icon: Table2,
                label: event.type,
                color: 'bg-slate-100 text-slate-600'
              };
              const Icon = config.icon;
              return (
                <div
                  key={event.id}
                  className="flex items-center gap-2 px-4 py-2 border-b dark:border-slate-700 last:border-0"
                >
                  <div className={cn('p-1 rounded', config.color)}>
                    <Icon className="h-3 w-3" />
                  </div>
                  <span className="text-sm flex-1 truncate">{event.target.table}</span>
                  <span className="text-xs text-slate-400">{formatTime(event.timestamp)}</span>
                </div>
              );
            })
          )}
        </div>
        {events.length > 5 && (
          <div className="px-4 py-2 text-center border-t dark:border-slate-700">
            <span className="text-xs text-slate-500">+{events.length - 5} more events</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={cn('bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 flex flex-col', className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b dark:border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-slate-400" />
            <h3 className="font-semibold">Event History</h3>
            <Badge className="bg-slate-100 text-slate-600">{events.length} total</Badge>
            {pendingEvents.length > 0 && (
              <Badge className="bg-amber-100 text-amber-600">{pendingEvents.length} pending</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => validateEvents()}
              disabled={pendingEvents.length === 0}
              className="gap-1"
            >
              <Play className="h-4 w-4" />
              Validate All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => clearEvents()}
              disabled={events.length === 0}
              className="gap-1 text-red-500 border-red-200 hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
              Clear
            </Button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 text-sm"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as EventStatus | 'all')}
            className="px-3 py-2 border rounded-lg dark:bg-slate-700 dark:border-slate-600 text-sm"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="validated">Validated</option>
            <option value="failed">Failed</option>
            <option value="applied">Applied</option>
          </select>
        </div>
      </div>

      {/* Event List */}
      <div className="flex-1 overflow-auto">
        {filteredEvents.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-slate-500">
            <History className="h-12 w-12 mb-3 text-slate-300" />
            <p className="font-medium">No events found</p>
            <p className="text-sm mt-1">
              {events.length === 0
                ? 'Start making changes to see them here'
                : 'Try adjusting your filters'}
            </p>
          </div>
        ) : (
          filteredEvents.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              onRemove={() => removeEvent(event.id)}
              onValidate={() => handleValidateSingle(event.id)}
              isExpanded={expandedEvents.has(event.id)}
              onToggle={() => handleToggleExpand(event.id)}
            />
          ))
        )}
      </div>

      {/* Footer Summary */}
      <div className="px-4 py-3 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <span className="text-slate-500">
              <span className="font-medium text-amber-600">{pendingEvents.length}</span> pending
            </span>
            <span className="text-slate-500">
              <span className="font-medium text-green-600">
                {events.filter((e) => e.status === 'validated').length}
              </span> validated
            </span>
            <span className="text-slate-500">
              <span className="font-medium text-red-600">
                {events.filter((e) => e.status === 'failed').length}
              </span> failed
            </span>
          </div>
          <span className="text-slate-400 text-xs">
            Last updated: {events.length > 0 ? formatTime(events[events.length - 1].timestamp) : '-'}
          </span>
        </div>
      </div>
    </div>
  );
};

export default EventTable;
