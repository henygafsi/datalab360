/**
 * Event Dependency Graph — DAG builder for deployment ordering
 *
 * Builds a directed acyclic graph from design events to determine
 * correct execution order and detect circular dependencies.
 *
 * Dependency rules:
 * - SCHEMA_CREATED → TABLE_CREATED in that schema
 * - TABLE_CREATED → ADD_COLUMN, PRIMARY_KEY_SET, MASKING_POLICY_APPLIED, etc. on that table
 * - ADD_COLUMN → FOREIGN_KEY_ADDED referencing that column
 * - FK/RELATION referencing table R → TABLE_CREATED for R (if R is new)
 */

import type { DesignEvent, EventType } from './event-store';

// ---- Types ----

export interface DependencyNode {
  eventId: string;
  event: DesignEvent;
  dependsOn: Set<string>; // event IDs this node must wait for
  dependedBy: Set<string>; // event IDs that depend on this node
  level: number; // topological level (0 = no dependencies)
}

export interface DependencyGraph {
  nodes: Map<string, DependencyNode>;
  sorted: DesignEvent[]; // topologically sorted events
  cycles: CycleInfo[];
  warnings: DependencyWarning[];
}

export interface CycleInfo {
  path: string[]; // event IDs forming the cycle
  description: string;
}

export interface DependencyWarning {
  eventId: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

// ---- Helpers ----

/** Fully-qualified table name from an event target */
function fqtn(target: { database: string; schema: string; table: string }): string {
  return `${target.database}.${target.schema}.${target.table}`.toUpperCase();
}

/** Event types that create a table (it must exist before referencing events) */
const TABLE_CREATION_TYPES: Set<EventType> = new Set([
  'TABLE_CREATED',
  'DYNAMIC_TABLE_CREATED',
  'EVENT_TABLE_CREATED',
  'HYBRID_TABLE_CREATED',
]);

/** Event types that require the target table to exist */
const TABLE_DEPENDENT_TYPES: Set<EventType> = new Set([
  'ADD_COLUMN',
  'REMOVE_COLUMN',
  'COLUMN_RENAMED',
  'COLUMN_TYPE_CHANGED',
  'PRIMARY_KEY_SET',
  'PRIMARY_KEY_REMOVED',
  'FOREIGN_KEY_ADDED',
  'FOREIGN_KEY_REMOVED',
  'MASKING_POLICY_APPLIED',
  'MASKING_POLICY_REMOVED',
  'RLS_POLICY_APPLIED',
  'RLS_POLICY_REMOVED',
  'AGGREGATION_POLICY_APPLIED',
  'AGGREGATION_POLICY_REMOVED',
  'TAG_APPLIED',
  'TAG_REMOVED',
  'TABLE_RENAMED',
  'INGESTION_MODE_SET',
  'SCD_CONFIGURED',
  'COLUMN_EXCLUDED',
  'COLUMN_INCLUDED',
  'COLUMN_MAPPING_CREATED',
  'STREAM_CREATED',
  'ALERT_CREATED',
]);

/** Event types that reference another table (FK, relation, mapping) */
const CROSS_TABLE_TYPES: Set<EventType> = new Set([
  'FOREIGN_KEY_ADDED',
  'RELATION_CREATED',
  'COLUMN_MAPPING_CREATED',
]);

/** UI-only events to exclude from the dependency graph */
const UI_ONLY_TYPES: Set<EventType> = new Set([
  'TABLE_SELECTED',
  'SCHEMA_SELECTED',
  'TABLE_ADDED_TO_MODELING',
  'TABLE_REMOVED_FROM_MODELING',
  'BATCH_OPERATION',
]);

// ---- Graph Builder ----

/**
 * Build a dependency graph from a list of design events.
 * Only includes events that produce DDL (excludes UI-only events).
 */
export function buildDependencyGraph(events: DesignEvent[]): DependencyGraph {
  const warnings: DependencyWarning[] = [];

  // Filter to significant events only
  const significantEvents = events.filter(
    (e) => e.status === 'pending' && !UI_ONLY_TYPES.has(e.type)
  );

  // Index: fqtn → event that creates the table
  const tableCreators = new Map<string, string>(); // fqtn → event.id
  // Index: fqtn → event that creates the schema
  const schemaCreators = new Map<string, string>(); // db.schema → event.id
  // Index: fqtn.column → event that adds the column
  const columnCreators = new Map<string, string>(); // fqtn.COLUMN → event.id

  // First pass: index creators
  for (const evt of significantEvents) {
    if (evt.type === 'SCHEMA_CREATED') {
      const key = `${evt.target.database}.${evt.target.schema}`.toUpperCase();
      schemaCreators.set(key, evt.id);
    }
    if (TABLE_CREATION_TYPES.has(evt.type)) {
      tableCreators.set(fqtn(evt.target), evt.id);
    }
    if (evt.type === 'ADD_COLUMN' && evt.payload.columnName) {
      const key = `${fqtn(evt.target)}.${String(evt.payload.columnName).toUpperCase()}`;
      columnCreators.set(key, evt.id);
    }
  }

  // Build nodes
  const nodes = new Map<string, DependencyNode>();
  for (const evt of significantEvents) {
    nodes.set(evt.id, {
      eventId: evt.id,
      event: evt,
      dependsOn: new Set(),
      dependedBy: new Set(),
      level: 0,
    });
  }

  // Second pass: establish edges
  for (const evt of significantEvents) {
    const node = nodes.get(evt.id)!;
    const tbl = fqtn(evt.target);
    const schemaKey = `${evt.target.database}.${evt.target.schema}`.toUpperCase();

    // Rule 1: If this event's target table is created by another event, depend on it
    if (TABLE_DEPENDENT_TYPES.has(evt.type)) {
      const creatorId = tableCreators.get(tbl);
      if (creatorId && creatorId !== evt.id) {
        addEdge(nodes, creatorId, evt.id);
      }
    }

    // Rule 2: TABLE_CREATED depends on SCHEMA_CREATED for the same schema
    if (TABLE_CREATION_TYPES.has(evt.type)) {
      const schemaCreatorId = schemaCreators.get(schemaKey);
      if (schemaCreatorId && schemaCreatorId !== evt.id) {
        addEdge(nodes, schemaCreatorId, evt.id);
      }
    }

    // Rule 3: FK/RELATION/MAPPING depend on the referenced table existing
    if (CROSS_TABLE_TYPES.has(evt.type)) {
      let refTable: string | null = null;

      if (evt.type === 'FOREIGN_KEY_ADDED' && evt.payload.referencedTable) {
        refTable = fqtn(evt.payload.referencedTable);
      } else if (evt.type === 'RELATION_CREATED' && evt.payload.targetTable) {
        refTable = fqtn(evt.payload.targetTable);
      } else if (evt.type === 'COLUMN_MAPPING_CREATED' && evt.payload.target) {
        refTable = fqtn(evt.payload.target);
      }

      if (refTable) {
        const refCreatorId = tableCreators.get(refTable);
        if (refCreatorId && refCreatorId !== evt.id) {
          addEdge(nodes, refCreatorId, evt.id);
        }
      }
    }

    // Rule 4: FK referencing a column that was just added depends on the ADD_COLUMN
    if (evt.type === 'FOREIGN_KEY_ADDED' && evt.payload.columns) {
      for (const col of evt.payload.columns as string[]) {
        const colKey = `${tbl}.${col.toUpperCase()}`;
        const colCreatorId = columnCreators.get(colKey);
        if (colCreatorId && colCreatorId !== evt.id) {
          addEdge(nodes, colCreatorId, evt.id);
        }
      }
      // Also check referenced columns
      if (evt.payload.referencedTable && evt.payload.referencedColumns) {
        const refTbl = fqtn(evt.payload.referencedTable);
        for (const col of evt.payload.referencedColumns as string[]) {
          const colKey = `${refTbl}.${col.toUpperCase()}`;
          const colCreatorId = columnCreators.get(colKey);
          if (colCreatorId && colCreatorId !== evt.id) {
            addEdge(nodes, colCreatorId, evt.id);
          }
        }
      }
    }

    // Rule 5: PK must be set before FK referencing this table
    if (evt.type === 'FOREIGN_KEY_ADDED' && evt.payload.referencedTable) {
      const refTbl = fqtn(evt.payload.referencedTable);
      // Find PK event for the referenced table
      for (const other of significantEvents) {
        if (
          other.type === 'PRIMARY_KEY_SET' &&
          fqtn(other.target) === refTbl &&
          other.id !== evt.id
        ) {
          addEdge(nodes, other.id, evt.id);
        }
      }
    }

    // Rule 6: Policies and tags should come after columns/PKs on the same table
    if (
      (evt.type === 'MASKING_POLICY_APPLIED' ||
        evt.type === 'RLS_POLICY_APPLIED' ||
        evt.type === 'AGGREGATION_POLICY_APPLIED' ||
        evt.type === 'TAG_APPLIED')
    ) {
      for (const other of significantEvents) {
        if (
          fqtn(other.target) === tbl &&
          (other.type === 'ADD_COLUMN' || other.type === 'PRIMARY_KEY_SET') &&
          other.id !== evt.id
        ) {
          addEdge(nodes, other.id, evt.id);
        }
      }
    }

    // Rule 7: TABLE_RENAMED must be last for that table (after all other modifications)
    if (evt.type === 'TABLE_RENAMED') {
      for (const other of significantEvents) {
        if (
          fqtn(other.target) === tbl &&
          other.type !== 'TABLE_RENAMED' &&
          other.id !== evt.id
        ) {
          addEdge(nodes, other.id, evt.id);
        }
      }
    }

    // Rule 8: INGESTION_MODE_SET should come after table structure is finalized
    if (evt.type === 'INGESTION_MODE_SET' || evt.type === 'SCD_CONFIGURED') {
      for (const other of significantEvents) {
        if (
          fqtn(other.target) === tbl &&
          (TABLE_CREATION_TYPES.has(other.type) ||
            other.type === 'ADD_COLUMN' ||
            other.type === 'PRIMARY_KEY_SET') &&
          other.id !== evt.id
        ) {
          addEdge(nodes, other.id, evt.id);
        }
      }
    }
  }

  // Detect cycles
  const cycles = detectCircularDependencies(nodes);

  // If cycles exist, add warnings
  for (const cycle of cycles) {
    warnings.push({
      eventId: cycle.path[0],
      message: cycle.description,
      severity: 'error',
    });
  }

  // Topological sort (Kahn's algorithm)
  const sorted = cycles.length === 0
    ? topologicalSort(nodes)
    : fallbackPrioritySort(significantEvents);

  // Compute levels
  computeLevels(nodes);

  return { nodes, sorted, cycles, warnings };
}

// ---- Internal functions ----

function addEdge(nodes: Map<string, DependencyNode>, fromId: string, toId: string): void {
  const fromNode = nodes.get(fromId);
  const toNode = nodes.get(toId);
  if (fromNode && toNode && fromId !== toId) {
    fromNode.dependedBy.add(toId);
    toNode.dependsOn.add(fromId);
  }
}

/**
 * Detect circular dependencies using DFS-based cycle detection.
 */
export function detectCircularDependencies(
  nodes: Map<string, DependencyNode>
): CycleInfo[] {
  const cycles: CycleInfo[] = [];
  const visited = new Set<string>();
  const inStack = new Set<string>();
  const path: string[] = [];

  function dfs(nodeId: string): void {
    if (inStack.has(nodeId)) {
      // Found a cycle — extract it
      const cycleStart = path.indexOf(nodeId);
      const cyclePath = path.slice(cycleStart);
      cyclePath.push(nodeId); // close the loop
      const descriptions = cyclePath.map((id) => {
        const n = nodes.get(id);
        return n ? `${n.event.type}(${n.event.target.table})` : id;
      });
      cycles.push({
        path: cyclePath,
        description: `Circular dependency: ${descriptions.join(' → ')}`,
      });
      return;
    }
    if (visited.has(nodeId)) return;

    visited.add(nodeId);
    inStack.add(nodeId);
    path.push(nodeId);

    const node = nodes.get(nodeId);
    if (node) {
      for (const depId of node.dependedBy) {
        dfs(depId);
      }
    }

    path.pop();
    inStack.delete(nodeId);
  }

  for (const nodeId of nodes.keys()) {
    if (!visited.has(nodeId)) {
      dfs(nodeId);
    }
  }

  return cycles;
}

/**
 * Topological sort using Kahn's algorithm.
 * Returns events in correct execution order.
 */
export function topologicalSort(nodes: Map<string, DependencyNode>): DesignEvent[] {
  // Compute in-degree
  const inDegree = new Map<string, number>();
  for (const [id, node] of nodes) {
    inDegree.set(id, node.dependsOn.size);
  }

  // Start with nodes that have no dependencies
  const queue: string[] = [];
  for (const [id, deg] of inDegree) {
    if (deg === 0) queue.push(id);
  }

  // Sort zero-degree nodes by static priority for stable ordering
  queue.sort((a, b) => {
    const pa = STATIC_PRIORITY[nodes.get(a)?.event.type ?? 'BATCH_OPERATION'] ?? 99;
    const pb = STATIC_PRIORITY[nodes.get(b)?.event.type ?? 'BATCH_OPERATION'] ?? 99;
    return pa - pb;
  });

  const result: DesignEvent[] = [];
  const processed = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (processed.has(current)) continue;
    processed.add(current);

    const node = nodes.get(current);
    if (node) {
      result.push(node.event);

      // Collect next candidates and sort by priority
      const candidates: string[] = [];
      for (const nextId of node.dependedBy) {
        const nextDeg = (inDegree.get(nextId) ?? 1) - 1;
        inDegree.set(nextId, nextDeg);
        if (nextDeg === 0 && !processed.has(nextId)) {
          candidates.push(nextId);
        }
      }
      candidates.sort((a, b) => {
        const pa = STATIC_PRIORITY[nodes.get(a)?.event.type ?? 'BATCH_OPERATION'] ?? 99;
        const pb = STATIC_PRIORITY[nodes.get(b)?.event.type ?? 'BATCH_OPERATION'] ?? 99;
        return pa - pb;
      });
      queue.push(...candidates);
    }
  }

  return result;
}

/**
 * Compute the topological level for each node (for visualization).
 * Level 0 = no dependencies, level N = longest path from a root.
 */
function computeLevels(nodes: Map<string, DependencyNode>): void {
  // BFS from roots
  const queue: string[] = [];
  for (const [id, node] of nodes) {
    if (node.dependsOn.size === 0) {
      node.level = 0;
      queue.push(id);
    }
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const node = nodes.get(current)!;
    for (const depId of node.dependedBy) {
      const depNode = nodes.get(depId);
      if (depNode) {
        depNode.level = Math.max(depNode.level, node.level + 1);
        queue.push(depId);
      }
    }
  }
}

/** Static priority for stable ordering within the same dependency level */
const STATIC_PRIORITY: Record<string, number> = {
  SCHEMA_CREATED: 0,
  SCHEMA_SELECTED: 0,
  TABLE_CREATED: 1,
  DYNAMIC_TABLE_CREATED: 1,
  EVENT_TABLE_CREATED: 1,
  HYBRID_TABLE_CREATED: 1,
  ADD_COLUMN: 2,
  COLUMN_RENAMED: 3,
  COLUMN_TYPE_CHANGED: 3,
  REMOVE_COLUMN: 3,
  PRIMARY_KEY_SET: 4,
  PRIMARY_KEY_REMOVED: 4,
  FOREIGN_KEY_ADDED: 5,
  FOREIGN_KEY_REMOVED: 5,
  RELATION_CREATED: 5,
  RELATION_REMOVED: 5,
  COLUMN_MAPPING_CREATED: 5,
  COLUMN_MAPPING_REMOVED: 5,
  MASKING_POLICY_APPLIED: 6,
  MASKING_POLICY_REMOVED: 6,
  RLS_POLICY_APPLIED: 6,
  RLS_POLICY_REMOVED: 6,
  AGGREGATION_POLICY_APPLIED: 6,
  AGGREGATION_POLICY_REMOVED: 6,
  TAG_APPLIED: 7,
  TAG_REMOVED: 7,
  COLUMN_EXCLUDED: 7,
  COLUMN_INCLUDED: 7,
  TABLE_EXCLUDED: 7,
  TABLE_INCLUDED: 7,
  INGESTION_MODE_SET: 8,
  SCD_CONFIGURED: 8,
  TABLE_RENAMED: 9,
  STREAM_CREATED: 10,
  ALERT_CREATED: 10,
  BATCH_OPERATION: 99,
};

/** Fallback: sort by static priority when cycles prevent topological sort */
function fallbackPrioritySort(events: DesignEvent[]): DesignEvent[] {
  return [...events].sort((a, b) => {
    const pa = STATIC_PRIORITY[a.type] ?? 99;
    const pb = STATIC_PRIORITY[b.type] ?? 99;
    if (pa !== pb) return pa - pb;
    return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
  });
}

// ---- Cross-Event Validation ----

/** FK column type compatibility families */
const TYPE_FAMILIES: Record<string, string> = {
  NUMBER: 'numeric',
  INT: 'numeric',
  INTEGER: 'numeric',
  BIGINT: 'numeric',
  SMALLINT: 'numeric',
  TINYINT: 'numeric',
  FLOAT: 'numeric',
  DOUBLE: 'numeric',
  DECIMAL: 'numeric',
  NUMERIC: 'numeric',
  REAL: 'numeric',
  VARCHAR: 'string',
  STRING: 'string',
  TEXT: 'string',
  CHAR: 'string',
  CHARACTER: 'string',
  DATE: 'temporal',
  TIMESTAMP: 'temporal',
  TIMESTAMP_NTZ: 'temporal',
  TIMESTAMP_LTZ: 'temporal',
  TIMESTAMP_TZ: 'temporal',
  DATETIME: 'temporal',
  BOOLEAN: 'boolean',
  VARIANT: 'semi_structured',
  OBJECT: 'semi_structured',
  ARRAY: 'semi_structured',
};

/**
 * Check if two Snowflake column types are compatible for FK relationships.
 */
export function areTypesCompatible(sourceType: string, targetType: string): boolean {
  const srcFamily = TYPE_FAMILIES[sourceType.toUpperCase().split('(')[0]] ?? 'unknown';
  const tgtFamily = TYPE_FAMILIES[targetType.toUpperCase().split('(')[0]] ?? 'unknown';
  if (srcFamily === 'unknown' || tgtFamily === 'unknown') return true; // allow unknown types
  return srcFamily === tgtFamily;
}

/**
 * Validate cross-event dependencies and return warnings.
 * Call this before deployment to catch issues the single-event validator misses.
 */
export function validateCrossEventDependencies(
  events: DesignEvent[],
  existingTables: Set<string> // FQTNs of tables that already exist in Snowflake
): DependencyWarning[] {
  const warnings: DependencyWarning[] = [];
  const pendingEvents = events.filter((e) => e.status === 'pending');

  // Index tables created in this batch
  const createdTables = new Set<string>();
  for (const evt of pendingEvents) {
    if (TABLE_CREATION_TYPES.has(evt.type)) {
      createdTables.add(fqtn(evt.target));
    }
  }

  for (const evt of pendingEvents) {
    // Check FK references existing or created tables
    if (evt.type === 'FOREIGN_KEY_ADDED' && evt.payload.referencedTable) {
      const refTbl = fqtn(evt.payload.referencedTable);
      if (!existingTables.has(refTbl) && !createdTables.has(refTbl)) {
        warnings.push({
          eventId: evt.id,
          message: `FK references table ${refTbl} which does not exist and is not being created in this batch`,
          severity: 'error',
        });
      }
    }

    // Check RELATION references
    if (evt.type === 'RELATION_CREATED' && evt.payload.targetTable) {
      const refTbl = fqtn(evt.payload.targetTable);
      if (!existingTables.has(refTbl) && !createdTables.has(refTbl)) {
        warnings.push({
          eventId: evt.id,
          message: `Relation references table ${refTbl} which does not exist`,
          severity: 'error',
        });
      }
    }

    // Check that TABLE_DEPENDENT events target an existing or created table
    if (TABLE_DEPENDENT_TYPES.has(evt.type)) {
      const tbl = fqtn(evt.target);
      if (!existingTables.has(tbl) && !createdTables.has(tbl)) {
        warnings.push({
          eventId: evt.id,
          message: `${evt.type} targets table ${tbl} which does not exist`,
          severity: 'error',
        });
      }
    }

    // Check column mapping targets exist
    if (evt.type === 'COLUMN_MAPPING_CREATED' && evt.payload.target) {
      const tgtTbl = fqtn(evt.payload.target);
      if (!existingTables.has(tgtTbl) && !createdTables.has(tgtTbl)) {
        warnings.push({
          eventId: evt.id,
          message: `Column mapping target table ${tgtTbl} does not exist`,
          severity: 'warning',
        });
      }
    }
  }

  return warnings;
}
