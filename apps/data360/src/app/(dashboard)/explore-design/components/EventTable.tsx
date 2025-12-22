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
  SCHEMA_SELECTED: { icon: Table2, label: 'Schema Selected', color: 'bg-slate-100 text-slate-600' },
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
  TABLE_ADDED_TO_MODELING: { icon: Plus, label: 'Added to Modeling', color: 'bg-green-100 text-green-600' },
  TABLE_REMOVED_FROM_MODELING: { icon: Minus, label: 'Removed from Modeling', color: 'bg-red-100 text-red-600' },
  COLUMN_MAPPING_CREATED: { icon: Link2, label: 'Column Mapped', color: 'bg-blue-100 text-blue-600' },
  COLUMN_MAPPING_REMOVED: { icon: Link2, label: 'Mapping Removed', color: 'bg-red-100 text-red-600' },
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
  onExecuteChanges?: () => void;
  isExecuting?: boolean;
  projectId?: string | null;
}

const EventTable: React.FC<EventTableProps> = ({ className, compact, onExecuteChanges, isExecuting, projectId }) => {
  const { events, pendingEvents, removeEvent, updateEventStatus, clearEvents, validateEvents, undoEvent, canUndo } = useEventStore(projectId);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<EventStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<EventType | 'all'>('all');
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());

  // Event types that should be displayed in the Changes panel
  // Only show actual schema changes, not UI state events like SCHEMA_SELECTED
  const displayableEventTypes: EventType[] = [
    'TABLE_RENAMED',
    'COLUMN_RENAMED',
    'INGESTION_MODE_SET',
    'MASKING_POLICY_APPLIED',
    'MASKING_POLICY_REMOVED',
    'AGGREGATION_POLICY_APPLIED',
    'AGGREGATION_POLICY_REMOVED',
    'PRIMARY_KEY_SET',
    'PRIMARY_KEY_REMOVED',
    'ADD_COLUMN',
    'REMOVE_COLUMN',
    'RLS_POLICY_APPLIED',
    'RLS_POLICY_REMOVED',
  ];

  // Filter pending events to only count displayable ones
  const displayablePendingEvents = useMemo(() => {
    return pendingEvents.filter(event => displayableEventTypes.includes(event.type));
  }, [pendingEvents]);

  // Filtered events
  const filteredEvents = useMemo(() => {
    return events.filter((event) => {
      // Only show displayable event types (exclude SCHEMA_SELECTED, TABLE_SELECTED, etc.)
      if (!displayableEventTypes.includes(event.type)) return false;

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

  // Helper function to render event details
  const renderEventDetails = (event: DesignEvent) => {
    const { type, payload, target } = event;

    switch (type) {
      case 'TABLE_RENAMED':
        return (
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            <span className="line-through">{payload.oldName}</span>
            <span className="mx-1">→</span>
            <span className="text-blue-600 dark:text-blue-400 font-medium">{payload.newName}</span>
          </div>
        );
      case 'COLUMN_RENAMED':
        return (
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            <span className="line-through">{payload.oldName}</span>
            <span className="mx-1">→</span>
            <span className="text-blue-600 dark:text-blue-400 font-medium">{payload.newName}</span>
          </div>
        );
      case 'PRIMARY_KEY_SET':
        return (
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            <span className="text-amber-600 dark:text-amber-400">PK: </span>
            <span className="font-mono">{payload.columns?.join(', ') || target.column}</span>
          </div>
        );
      case 'PRIMARY_KEY_REMOVED':
        return (
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            <span className="text-red-500">Removed: </span>
            <span className="font-mono line-through">{payload.columns?.join(', ')}</span>
          </div>
        );
      case 'MASKING_POLICY_APPLIED':
        return (
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            <span className="text-green-600 dark:text-green-400">Policy: </span>
            <span>{payload.policyName}</span>
            <span className="text-slate-400 mx-1">on</span>
            <span className="font-mono">{payload.columns?.join(', ')}</span>
          </div>
        );
      case 'MASKING_POLICY_REMOVED':
        return (
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            <span className="text-red-500">Removed: </span>
            <span>{payload.policyName}</span>
          </div>
        );
      case 'COLUMN_TYPE_CHANGED':
        return (
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            <span className="font-mono">{target.column}: </span>
            <span className="line-through">{payload.oldType}</span>
            <span className="mx-1">→</span>
            <span className="text-purple-600 dark:text-purple-400">{payload.newType}</span>
          </div>
        );
      case 'ADD_COLUMN':
        return (
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            <span className="text-green-600 dark:text-green-400">+ </span>
            <span className="font-mono">{payload.columnName}</span>
            <span className="text-slate-400 ml-1">({payload.columnType})</span>
          </div>
        );
      case 'REMOVE_COLUMN':
        return (
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            <span className="text-red-500">- </span>
            <span className="font-mono line-through">{payload.columnName || target.column}</span>
          </div>
        );
      case 'FOREIGN_KEY_ADDED':
        return (
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            <span className="font-mono">{payload.columnName || target.column}</span>
            <span className="mx-1">→</span>
            <span className="text-purple-600 dark:text-purple-400">{payload.refTable}.{payload.refColumn}</span>
          </div>
        );
      case 'INGESTION_MODE_SET':
        return (
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            <span className="text-blue-600 dark:text-blue-400">Mode: </span>
            <span>{payload.mode?.replace('_', ' ')}</span>
          </div>
        );
      case 'TABLE_INCLUDED':
      case 'TABLE_EXCLUDED':
        return (
          <div className="text-[10px] text-slate-500 dark:text-slate-400">
            {target.database}.{target.schema}
          </div>
        );
      default:
        if (Object.keys(payload).length > 0) {
          const firstKey = Object.keys(payload)[0];
          const firstValue = payload[firstKey];
          return (
            <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
              {typeof firstValue === 'string' ? firstValue : JSON.stringify(firstValue).slice(0, 30)}
            </div>
          );
        }
        return null;
    }
  };

  if (compact) {
    return (
      <div className={cn('bg-white dark:bg-slate-800 rounded-lg border dark:border-slate-700 flex flex-col', className)}>
        <div className="px-3 py-2 border-b dark:border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <History className="h-4 w-4 text-slate-400" />
            <span className="font-medium text-sm">Changes</span>
            <Badge className="bg-amber-100 text-amber-600 text-xs">{displayablePendingEvents.length}</Badge>
          </div>
          <div className="flex items-center gap-1">
            <Tooltip content="Undo Last">
              <Button
                variant="text"
                size="sm"
                onClick={() => undoEvent()}
                disabled={!canUndo}
                className="p-1"
              >
                <Undo2 className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
            <Tooltip content="Clear All">
              <Button
                variant="text"
                size="sm"
                onClick={() => clearEvents()}
                disabled={events.length === 0}
                className="p-1 text-red-500"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </Tooltip>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {events.length === 0 ? (
            <div className="p-4 text-center text-slate-500 text-sm">
              No changes recorded yet
            </div>
          ) : (
            events.slice(-10).reverse().map((event) => {
              const config = eventTypeConfig[event.type] || {
                icon: Table2,
                label: event.type,
                color: 'bg-slate-100 text-slate-600'
              };
              const status = statusConfig[event.status] || statusConfig.pending;
              const Icon = config.icon;
              const StatusIcon = status.icon;
              const isExpanded = expandedEvents.has(event.id);

              return (
                <div
                  key={event.id}
                  className={cn(
                    "border-b dark:border-slate-700 last:border-0",
                    event.status === 'failed' && 'bg-red-50 dark:bg-red-900/10'
                  )}
                >
                  {/* Main Row - Clickable */}
                  <div
                    className="flex flex-col px-3 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-700/50"
                    onClick={() => handleToggleExpand(event.id)}
                  >
                    <div className="flex items-center gap-2">
                      {/* Expand/Collapse Icon */}
                      <button className="p-0.5 flex-shrink-0">
                        {isExpanded ? (
                          <ChevronDown className="h-3 w-3 text-slate-400" />
                        ) : (
                          <ChevronRight className="h-3 w-3 text-slate-400" />
                        )}
                      </button>

                      <div className={cn('p-1 rounded flex-shrink-0', config.color)}>
                        <Icon className="h-3 w-3" />
                      </div>
                      <span className="text-xs flex-1 truncate font-medium">{event.target.table}</span>
                      {/* Status Badge */}
                      <div className={cn('flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0', status.color)}>
                        <StatusIcon className="h-2.5 w-2.5" />
                      </div>
                    </div>
                    {/* Show error message for failed events even when collapsed */}
                    {event.status === 'failed' && event.error && !isExpanded && (
                      <div className="ml-7 mt-1 text-[10px] text-red-500 dark:text-red-400 truncate">
                        ⚠️ {typeof event.error === 'string'
                          ? event.error
                          : (event.error as any)?.msg || (event.error as any)?.message || JSON.stringify(event.error)}
                      </div>
                    )}
                  </div>

                  {/* Expanded Details */}
                  {isExpanded && (
                    <div className="px-3 pb-2 ml-6">
                      <div className="p-2 bg-slate-50 dark:bg-slate-800/50 rounded text-xs space-y-1">
                        {/* Event Type Label */}
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-medium text-slate-500">{config.label}</span>
                          <span className="text-[10px] text-slate-400">{formatTime(event.timestamp)}</span>
                        </div>

                        {/* Location */}
                        <div className="text-[10px] text-slate-400">
                          {event.target.database}.{event.target.schema}
                          {event.target.column && <span>.{event.target.column}</span>}
                        </div>

                        {/* Event-specific Details */}
                        {renderEventDetails(event)}

                        {/* Error message if failed */}
                        {event.status === 'failed' && event.error && (
                          <div className="mt-1 p-1.5 bg-red-50 dark:bg-red-900/20 rounded text-[10px] text-red-600 dark:text-red-400">
                            {typeof event.error === 'string'
                              ? event.error
                              : (event.error as any)?.msg || (event.error as any)?.message || JSON.stringify(event.error)}
                          </div>
                        )}

                        {/* Action buttons */}
                        <div className="flex items-center gap-1 pt-1">
                          {event.status === 'pending' && (
                            <Button
                              variant="text"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleValidateSingle(event.id);
                              }}
                              className="p-1 text-green-600 hover:bg-green-50 text-[10px]"
                            >
                              <Play className="h-3 w-3" />
                            </Button>
                          )}
                          <Button
                            variant="text"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeEvent(event.id);
                            }}
                            className="p-1 text-red-500 hover:bg-red-50 text-[10px]"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
        {/* Execute Changes Button */}
        {displayablePendingEvents.length > 0 && onExecuteChanges && (
          <div className="px-3 py-2 border-t dark:border-slate-700">
            <Button
              size="sm"
              onClick={onExecuteChanges}
              disabled={isExecuting}
              className="w-full gap-1.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-xs"
            >
              {isExecuting ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Executing...
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" />
                  Execute ({displayablePendingEvents.length})
                </>
              )}
            </Button>
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
            {displayablePendingEvents.length > 0 && (
              <Badge className="bg-amber-100 text-amber-600">{displayablePendingEvents.length} pending</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onExecuteChanges && (
              <Button
                size="sm"
                onClick={onExecuteChanges}
                disabled={displayablePendingEvents.length === 0 || isExecuting}
                className="gap-1 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
              >
                {isExecuting ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Executing...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" />
                    Execute All
                  </>
                )}
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => validateEvents()}
              disabled={displayablePendingEvents.length === 0}
              className="gap-1"
            >
              <Check className="h-4 w-4" />
              Validate
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
              <span className="font-medium text-amber-600">{displayablePendingEvents.length}</span> pending
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
