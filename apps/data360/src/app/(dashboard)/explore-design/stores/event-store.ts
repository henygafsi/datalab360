/**
 * Event-based architecture store for Explore & Design
 * Records all user actions for validation and deployment
 */

import { atom, useAtom, useAtomValue, useSetAtom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { IngestionMode } from '../../mapping/components/TableDetailPanel';

// Event Types
export type EventType =
  | 'TABLE_SELECTED'
  | 'TABLE_RENAMED'
  | 'COLUMN_RENAMED'
  | 'COLUMN_TYPE_CHANGED'
  | 'ADD_COLUMN'
  | 'REMOVE_COLUMN'
  | 'PRIMARY_KEY_SET'
  | 'PRIMARY_KEY_REMOVED'
  | 'FOREIGN_KEY_ADDED'
  | 'FOREIGN_KEY_REMOVED'
  | 'INGESTION_MODE_SET'
  | 'SCD_CONFIGURED'
  | 'MASKING_POLICY_APPLIED'
  | 'MASKING_POLICY_REMOVED'
  | 'RLS_POLICY_APPLIED'
  | 'RLS_POLICY_REMOVED'
  | 'AGGREGATION_POLICY_APPLIED'
  | 'AGGREGATION_POLICY_REMOVED'
  | 'TAG_APPLIED'
  | 'TAG_REMOVED'
  | 'RELATION_CREATED'
  | 'RELATION_REMOVED'
  | 'TABLE_EXCLUDED'
  | 'TABLE_INCLUDED'
  | 'COLUMN_EXCLUDED'
  | 'COLUMN_INCLUDED'
  | 'BATCH_OPERATION';

// Event Status
export type EventStatus = 'pending' | 'validated' | 'failed' | 'applied';

// Base Event Interface
export interface DesignEvent {
  id: string;
  type: EventType;
  timestamp: Date;
  status: EventStatus;
  target: {
    database: string;
    schema: string;
    table: string;
    column?: string;
  };
  payload: Record<string, any>;
  error?: string;
  userId?: string;
  // Backend sync fields
  backendId?: string; // ID returned from backend after sync
  synced?: boolean; // Whether event has been synced to backend
}

// Table Rename Event
export interface TableRenameEvent extends DesignEvent {
  type: 'TABLE_RENAMED';
  payload: {
    oldName: string;
    newName: string;
  };
}

// Column Rename Event
export interface ColumnRenameEvent extends DesignEvent {
  type: 'COLUMN_RENAMED';
  payload: {
    oldName: string;
    newName: string;
  };
}

// Ingestion Mode Event
export interface IngestionModeEvent extends DesignEvent {
  type: 'INGESTION_MODE_SET';
  payload: {
    mode: IngestionMode;
    config?: {
      incrementalColumn?: string;
      trackingColumns?: string[];
      effectiveDateColumn?: string;
      expirationDateColumn?: string;
      currentFlagColumn?: string;
      previousValueColumn?: string;
    };
  };
}

// Masking Policy Event
export interface MaskingPolicyEvent extends DesignEvent {
  type: 'MASKING_POLICY_APPLIED' | 'MASKING_POLICY_REMOVED';
  payload: {
    policyName: string;
    columns: string[];
  };
}

// Aggregation Policy Event
export interface AggregationPolicyEvent extends DesignEvent {
  type: 'AGGREGATION_POLICY_APPLIED' | 'AGGREGATION_POLICY_REMOVED';
  payload: {
    policyName: string;
    columns: string[];
    aggregationType: 'SUM' | 'AVG' | 'COUNT' | 'MIN' | 'MAX';
  };
}

// Relation Event
export interface RelationEvent extends DesignEvent {
  type: 'RELATION_CREATED' | 'RELATION_REMOVED';
  payload: {
    sourceColumn: string;
    targetTable: {
      database: string;
      schema: string;
      table: string;
    };
    targetColumn: string;
    relationType: 'one_to_one' | 'one_to_many' | 'many_to_one' | 'many_to_many';
  };
}

// Primary Key Event
export interface PrimaryKeyEvent extends DesignEvent {
  type: 'PRIMARY_KEY_SET' | 'PRIMARY_KEY_REMOVED';
  payload: {
    columns: string[];
  };
}

// Foreign Key Event
export interface ForeignKeyEvent extends DesignEvent {
  type: 'FOREIGN_KEY_ADDED' | 'FOREIGN_KEY_REMOVED';
  payload: {
    columns: string[];
    referencedTable: {
      database: string;
      schema: string;
      table: string;
    };
    referencedColumns: string[];
  };
}

// Event Store State
interface EventStoreState {
  events: DesignEvent[];
  undoStack: DesignEvent[];
  redoStack: DesignEvent[];
}

// Generate unique ID
const generateEventId = (): string => {
  return `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

// Validate if event has meaningful changes (not empty/default values)
// Returns true if the event should be stored, false if it should be rejected
const isSignificantEvent = (type: EventType, payload: Record<string, any>): boolean => {
  // Reject if payload is empty or null
  if (!payload || Object.keys(payload).length === 0) {
    console.debug(`[EventStore] Rejecting ${type}: empty payload`);
    return false;
  }

  switch (type) {
    case 'TABLE_RENAMED':
    case 'COLUMN_RENAMED':
      // Must have newName that's different from oldName
      if (!payload.newName || payload.newName === payload.oldName) {
        console.debug(`[EventStore] Rejecting ${type}: no actual rename (${payload.oldName} → ${payload.newName})`);
        return false;
      }
      return true;

    case 'COLUMN_TYPE_CHANGED':
      // Must have different old and new types
      if (!payload.newType || payload.newType === payload.oldType) {
        console.debug(`[EventStore] Rejecting ${type}: no type change`);
        return false;
      }
      return true;

    case 'PRIMARY_KEY_SET':
    case 'PRIMARY_KEY_REMOVED':
      // Must have at least one column
      if (!payload.columns || !Array.isArray(payload.columns) || payload.columns.length === 0) {
        console.debug(`[EventStore] Rejecting ${type}: no columns specified`);
        return false;
      }
      return true;

    case 'FOREIGN_KEY_ADDED':
    case 'FOREIGN_KEY_REMOVED':
      // Must have columns and referenced table info
      if (!payload.columns || payload.columns.length === 0) {
        console.debug(`[EventStore] Rejecting ${type}: no columns`);
        return false;
      }
      if (!payload.referencedTable || !payload.referencedColumns) {
        console.debug(`[EventStore] Rejecting ${type}: missing referenced table info`);
        return false;
      }
      return true;

    case 'INGESTION_MODE_SET':
      // Must have a mode
      if (!payload.mode) {
        console.debug(`[EventStore] Rejecting ${type}: no mode specified`);
        return false;
      }
      return true;

    case 'SCD_CONFIGURED':
      // Must have SCD configuration
      if (!payload.scdType && !payload.effectiveDateColumn) {
        console.debug(`[EventStore] Rejecting ${type}: no SCD config`);
        return false;
      }
      return true;

    case 'MASKING_POLICY_APPLIED':
    case 'MASKING_POLICY_REMOVED':
      // Must have policy name and at least one column
      if (!payload.policyName) {
        console.debug(`[EventStore] Rejecting ${type}: no policy name`);
        return false;
      }
      if (!payload.columns || payload.columns.length === 0) {
        console.debug(`[EventStore] Rejecting ${type}: no columns`);
        return false;
      }
      return true;

    case 'RLS_POLICY_APPLIED':
    case 'RLS_POLICY_REMOVED':
    case 'AGGREGATION_POLICY_APPLIED':
    case 'AGGREGATION_POLICY_REMOVED':
      // Must have policy name
      if (!payload.policyName) {
        console.debug(`[EventStore] Rejecting ${type}: no policy name`);
        return false;
      }
      return true;

    case 'TAG_APPLIED':
    case 'TAG_REMOVED':
      // Must have tag name
      if (!payload.tagName && !payload.tag) {
        console.debug(`[EventStore] Rejecting ${type}: no tag name`);
        return false;
      }
      return true;

    case 'RELATION_CREATED':
    case 'RELATION_REMOVED':
      // Must have source column, target table, and target column
      if (!payload.sourceColumn) {
        console.debug(`[EventStore] Rejecting ${type}: no source column`);
        return false;
      }
      if (!payload.targetTable || !payload.targetColumn) {
        console.debug(`[EventStore] Rejecting ${type}: missing target info`);
        return false;
      }
      return true;

    case 'ADD_COLUMN':
      // Must have column name and type
      if (!payload.columnName && !payload.name) {
        console.debug(`[EventStore] Rejecting ${type}: no column name`);
        return false;
      }
      return true;

    case 'REMOVE_COLUMN':
      // Must have column name
      if (!payload.columnName && !payload.name) {
        console.debug(`[EventStore] Rejecting ${type}: no column name`);
        return false;
      }
      return true;

    case 'TABLE_EXCLUDED':
    case 'TABLE_INCLUDED':
    case 'COLUMN_EXCLUDED':
    case 'COLUMN_INCLUDED':
      // These are valid with just target info (no payload needed)
      return true;

    case 'TABLE_SELECTED':
      // Table selection is just for UI, not a real change - always reject
      console.debug(`[EventStore] Rejecting ${type}: UI-only event`);
      return false;

    case 'BATCH_OPERATION':
      // Must have operations array
      if (!payload.operations || payload.operations.length === 0) {
        console.debug(`[EventStore] Rejecting ${type}: no operations`);
        return false;
      }
      return true;

    default:
      // For unknown types, accept if payload has any non-empty values
      const hasValues = Object.values(payload).some(v =>
        v !== null && v !== undefined && v !== '' &&
        !(Array.isArray(v) && v.length === 0)
      );
      if (!hasValues) {
        console.debug(`[EventStore] Rejecting ${type}: payload has no meaningful values`);
        return false;
      }
      return true;
  }
};

// Atoms with localStorage persistence for caching
export const eventStoreAtom = atomWithStorage<EventStoreState>('explore-design-events', {
  events: [],
  undoStack: [],
  redoStack: [],
});

// Derived atom for pending events
export const pendingEventsAtom = atom((get) => {
  const store = get(eventStoreAtom);
  return store.events.filter((e) => e.status === 'pending');
});

// Derived atom for unsynced events (events that haven't been sent to backend)
export const unsyncedEventsAtom = atom((get) => {
  const store = get(eventStoreAtom);
  return store.events.filter((e) => !e.synced && e.status === 'pending');
});

// Derived atom for event count by type
export const eventCountByTypeAtom = atom((get) => {
  const store = get(eventStoreAtom);
  const counts: Record<EventType, number> = {} as Record<EventType, number>;
  store.events.forEach((e) => {
    counts[e.type] = (counts[e.type] || 0) + 1;
  });
  return counts;
});

// Derived atom for events by table
export const eventsByTableAtom = atom((get) => {
  const store = get(eventStoreAtom);
  const byTable: Record<string, DesignEvent[]> = {};
  store.events.forEach((e) => {
    const key = `${e.target.database}.${e.target.schema}.${e.target.table}`;
    if (!byTable[key]) byTable[key] = [];
    byTable[key].push(e);
  });
  return byTable;
});

// Helper to check if two events are on the same target
const isSameTarget = (a: DesignEvent['target'], b: DesignEvent['target']): boolean => {
  return a.database === b.database &&
         a.schema === b.schema &&
         a.table === b.table &&
         a.column === b.column;
};

// Helper to find a conflicting/mergeable event
const findMergeableEvent = (
  events: DesignEvent[],
  newEvent: Omit<DesignEvent, 'id' | 'timestamp' | 'status'>
): { index: number; event: DesignEvent } | null => {
  // Only look at pending events that can be merged
  for (let i = events.length - 1; i >= 0; i--) {
    const existing = events[i];
    if (existing.status !== 'pending') continue;
    if (!isSameTarget(existing.target, newEvent.target)) continue;

    // Same type events can be consolidated
    if (existing.type === newEvent.type) {
      return { index: i, event: existing };
    }

    // Rename chain detection: TABLE_RENAMED A→B + TABLE_RENAMED B→C = TABLE_RENAMED A→C
    if (existing.type === 'TABLE_RENAMED' && newEvent.type === 'TABLE_RENAMED') {
      if (existing.payload.newName === newEvent.payload.oldName) {
        return { index: i, event: existing };
      }
    }

    // Column rename chain detection
    if (existing.type === 'COLUMN_RENAMED' && newEvent.type === 'COLUMN_RENAMED') {
      if (existing.payload.newName === newEvent.payload.oldName) {
        return { index: i, event: existing };
      }
    }
  }
  return null;
};

// Actions
export const addEventAtom = atom(
  null,
  (get, set, event: Omit<DesignEvent, 'id' | 'timestamp' | 'status'>) => {
    // Validate event before adding - reject empty/non-significant events
    if (!isSignificantEvent(event.type, event.payload)) {
      console.debug(`[EventStore] Event rejected: ${event.type} for ${event.target.database}.${event.target.schema}.${event.target.table}`);
      return null; // Return null to indicate event was not added
    }

    const store = get(eventStoreAtom);

    // Smart deduplication: Check for mergeable/conflicting events
    const mergeable = findMergeableEvent(store.events, event);

    if (mergeable) {
      const { index, event: existingEvent } = mergeable;

      // Handle rename chain consolidation
      if ((existingEvent.type === 'TABLE_RENAMED' || existingEvent.type === 'COLUMN_RENAMED') &&
          existingEvent.type === event.type) {
        // Chain: A→B + B→C becomes A→C
        if (existingEvent.payload.newName === event.payload.oldName) {
          const consolidatedPayload = {
            oldName: existingEvent.payload.oldName,
            newName: event.payload.newName,
          };

          // Check if this results in a no-op (A→B→A = no change)
          if (consolidatedPayload.oldName === consolidatedPayload.newName) {
            // Remove the original event - no net change
            const newEvents = store.events.filter((_, i) => i !== index);
            set(eventStoreAtom, {
              ...store,
              events: newEvents,
              redoStack: [],
            });
            console.debug(`[EventStore] Removed no-op rename: ${existingEvent.payload.oldName}→${event.payload.newName}→${existingEvent.payload.oldName}`);
            return null;
          }

          // Update the existing event with consolidated payload
          const updatedEvents = [...store.events];
          updatedEvents[index] = {
            ...existingEvent,
            payload: consolidatedPayload,
            timestamp: new Date(),
          };
          set(eventStoreAtom, {
            ...store,
            events: updatedEvents,
            redoStack: [],
          });
          console.debug(`[EventStore] Consolidated rename: ${existingEvent.payload.oldName}→${event.payload.newName}`);
          return existingEvent.id;
        }
      }

      // For other same-type events on same target, replace the old with new
      if (existingEvent.type === event.type) {
        const updatedEvents = [...store.events];
        updatedEvents[index] = {
          ...existingEvent,
          payload: event.payload,
          timestamp: new Date(),
        };
        set(eventStoreAtom, {
          ...store,
          events: updatedEvents,
          redoStack: [],
        });
        console.debug(`[EventStore] Replaced event: ${event.type} (kept ${existingEvent.id})`);
        return existingEvent.id;
      }
    }

    // No merge needed - add as new event
    const newEvent: DesignEvent = {
      ...event,
      id: generateEventId(),
      timestamp: new Date(),
      status: 'pending',
    };
    set(eventStoreAtom, {
      ...store,
      events: [...store.events, newEvent],
      redoStack: [], // Clear redo stack on new action
    });
    console.debug(`[EventStore] Event added: ${event.type} (${newEvent.id})`);
    return newEvent.id;
  }
);

export const undoEventAtom = atom(null, (get, set) => {
  const store = get(eventStoreAtom);
  if (store.events.length === 0) return;

  const lastEvent = store.events[store.events.length - 1];
  set(eventStoreAtom, {
    ...store,
    events: store.events.slice(0, -1),
    undoStack: [...store.undoStack, lastEvent],
  });
});

export const redoEventAtom = atom(null, (get, set) => {
  const store = get(eventStoreAtom);
  if (store.undoStack.length === 0) return;

  const lastUndone = store.undoStack[store.undoStack.length - 1];
  set(eventStoreAtom, {
    ...store,
    events: [...store.events, lastUndone],
    undoStack: store.undoStack.slice(0, -1),
  });
});

export const updateEventStatusAtom = atom(
  null,
  (get, set, { eventId, status, error }: { eventId: string; status: EventStatus; error?: string }) => {
    const store = get(eventStoreAtom);
    set(eventStoreAtom, {
      ...store,
      events: store.events.map((e) =>
        e.id === eventId ? { ...e, status, error } : e
      ),
    });
  }
);

export const clearEventsAtom = atom(null, (get, set) => {
  set(eventStoreAtom, {
    events: [],
    undoStack: [],
    redoStack: [],
  });
});

// Clean up applied events (called after successful deployment)
export const cleanupAppliedEventsAtom = atom(null, (get, set) => {
  const store = get(eventStoreAtom);
  const nonAppliedEvents = store.events.filter((e) => e.status !== 'applied');
  set(eventStoreAtom, {
    ...store,
    events: nonAppliedEvents,
    // Clear undo/redo stacks when cleaning up applied events
    undoStack: store.undoStack.filter((e) => e.status !== 'applied'),
    redoStack: store.redoStack.filter((e) => e.status !== 'applied'),
  });
  return store.events.length - nonAppliedEvents.length; // Return count of cleaned events
});

// Clean up failed events (allow retry after fixing issues)
export const cleanupFailedEventsAtom = atom(null, (get, set) => {
  const store = get(eventStoreAtom);
  const nonFailedEvents = store.events.filter((e) => e.status !== 'failed');
  set(eventStoreAtom, {
    ...store,
    events: nonFailedEvents,
  });
  return store.events.length - nonFailedEvents.length;
});

// Clean up empty/non-significant events from the store
export const cleanupEmptyEventsAtom = atom(null, (get, set) => {
  const store = get(eventStoreAtom);
  const significantEvents = store.events.filter((e) => isSignificantEvent(e.type, e.payload));
  const removedCount = store.events.length - significantEvents.length;

  if (removedCount > 0) {
    set(eventStoreAtom, {
      ...store,
      events: significantEvents,
      // Also clean undo/redo stacks
      undoStack: store.undoStack.filter((e) => isSignificantEvent(e.type, e.payload)),
      redoStack: store.redoStack.filter((e) => isSignificantEvent(e.type, e.payload)),
    });
    console.debug(`[EventStore] Cleaned up ${removedCount} empty/non-significant events`);
  }

  return removedCount;
});

// Reset event status to pending (for retry)
export const resetEventStatusAtom = atom(null, (get, set, eventId: string) => {
  const store = get(eventStoreAtom);
  set(eventStoreAtom, {
    ...store,
    events: store.events.map((e) =>
      e.id === eventId ? { ...e, status: 'pending' as EventStatus, error: undefined } : e
    ),
  });
});

export const removeEventAtom = atom(null, (get, set, eventId: string) => {
  const store = get(eventStoreAtom);
  set(eventStoreAtom, {
    ...store,
    events: store.events.filter((e) => e.id !== eventId),
  });
});

// Mark event as synced with backend ID
export const markEventSyncedAtom = atom(
  null,
  (get, set, { localId, backendId }: { localId: string; backendId: string }) => {
    const store = get(eventStoreAtom);
    set(eventStoreAtom, {
      ...store,
      events: store.events.map((e) =>
        e.id === localId ? { ...e, backendId, synced: true } : e
      ),
    });
  }
);

// Get backend IDs for events (returns backendId if synced, otherwise local id)
export const getBackendEventIdsAtom = atom((get) => {
  const store = get(eventStoreAtom);
  return store.events
    .filter((e) => e.status === 'pending' || e.status === 'validated')
    .map((e) => e.backendId || e.id);
});

// Bulk validate events
export const validateEventsAtom = atom(null, async (get, set) => {
  const store = get(eventStoreAtom);
  const pendingEvents = store.events.filter((e) => e.status === 'pending');

  // Simulate validation - in real implementation, call backend API
  const validatedEvents = pendingEvents.map((e) => ({
    ...e,
    status: 'validated' as EventStatus,
  }));

  set(eventStoreAtom, {
    ...store,
    events: store.events.map((e) => {
      const validated = validatedEvents.find((v) => v.id === e.id);
      return validated || e;
    }),
  });

  return validatedEvents.length;
});

// Custom hook for event operations
export function useEventStore() {
  const [store, setStore] = useAtom(eventStoreAtom);
  const pendingEvents = useAtomValue(pendingEventsAtom);
  const unsyncedEvents = useAtomValue(unsyncedEventsAtom);
  const eventsByTable = useAtomValue(eventsByTableAtom);
  const eventCounts = useAtomValue(eventCountByTypeAtom);
  const backendEventIds = useAtomValue(getBackendEventIdsAtom);
  const addEvent = useSetAtom(addEventAtom);
  const undoEvent = useSetAtom(undoEventAtom);
  const redoEvent = useSetAtom(redoEventAtom);
  const updateEventStatus = useSetAtom(updateEventStatusAtom);
  const clearEvents = useSetAtom(clearEventsAtom);
  const removeEvent = useSetAtom(removeEventAtom);
  const validateEvents = useSetAtom(validateEventsAtom);
  const cleanupAppliedEvents = useSetAtom(cleanupAppliedEventsAtom);
  const cleanupFailedEvents = useSetAtom(cleanupFailedEventsAtom);
  const cleanupEmptyEvents = useSetAtom(cleanupEmptyEventsAtom);
  const resetEventStatus = useSetAtom(resetEventStatusAtom);
  const markEventSynced = useSetAtom(markEventSyncedAtom);

  // Helper to get backend ID for an event (returns backendId if synced, else local id)
  const getBackendId = (event: DesignEvent) => event.backendId || event.id;

  return {
    events: store.events,
    pendingEvents,
    unsyncedEvents,
    eventsByTable,
    eventCounts,
    backendEventIds,
    canUndo: store.events.length > 0,
    canRedo: store.undoStack.length > 0,
    addEvent,
    undoEvent,
    redoEvent,
    updateEventStatus,
    clearEvents,
    removeEvent,
    validateEvents,
    cleanupAppliedEvents,
    cleanupFailedEvents,
    cleanupEmptyEvents,
    resetEventStatus,
    markEventSynced,
    getBackendId,
  };
}

// Helper to create events
export const createTableRenameEvent = (
  target: DesignEvent['target'],
  oldName: string,
  newName: string
): Omit<TableRenameEvent, 'id' | 'timestamp' | 'status'> => ({
  type: 'TABLE_RENAMED',
  target,
  payload: { oldName, newName },
});

export const createColumnRenameEvent = (
  target: DesignEvent['target'],
  oldName: string,
  newName: string
): Omit<ColumnRenameEvent, 'id' | 'timestamp' | 'status'> => ({
  type: 'COLUMN_RENAMED',
  target: { ...target, column: oldName },
  payload: { oldName, newName },
});

export const createIngestionModeEvent = (
  target: DesignEvent['target'],
  mode: IngestionMode,
  config?: IngestionModeEvent['payload']['config']
): Omit<IngestionModeEvent, 'id' | 'timestamp' | 'status'> => ({
  type: 'INGESTION_MODE_SET',
  target,
  payload: { mode, config },
});

export const createMaskingPolicyEvent = (
  target: DesignEvent['target'],
  policyName: string,
  columns: string[],
  applied: boolean
): Omit<MaskingPolicyEvent, 'id' | 'timestamp' | 'status'> => ({
  type: applied ? 'MASKING_POLICY_APPLIED' : 'MASKING_POLICY_REMOVED',
  target,
  payload: { policyName, columns },
});

export const createRelationEvent = (
  target: DesignEvent['target'],
  sourceColumn: string,
  targetTable: RelationEvent['payload']['targetTable'],
  targetColumn: string,
  relationType: RelationEvent['payload']['relationType'],
  created: boolean
): Omit<RelationEvent, 'id' | 'timestamp' | 'status'> => ({
  type: created ? 'RELATION_CREATED' : 'RELATION_REMOVED',
  target,
  payload: { sourceColumn, targetTable, targetColumn, relationType },
});

export const createPrimaryKeyEvent = (
  target: DesignEvent['target'],
  columns: string[],
  set: boolean
): Omit<PrimaryKeyEvent, 'id' | 'timestamp' | 'status'> => ({
  type: set ? 'PRIMARY_KEY_SET' : 'PRIMARY_KEY_REMOVED',
  target,
  payload: { columns },
});
