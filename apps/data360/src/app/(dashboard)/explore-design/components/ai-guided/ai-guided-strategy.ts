/**
 * AI-Guided Modeling — pure strategy logic (no JSX).
 *
 * Data journey: StepConnectSource picks tables → orchestrateDetection() fans out
 * tableProfile + aiClassifyColumns + detectRelations across the explore-design
 * API → assemblePlan() folds the normalized DetectedModel into model events +
 * DDL statements + ingestion tasks the existing deployment wizard consumes.
 */
import {
  tableProfile,
  aiClassifyColumns,
  detectRelations,
} from '@/app/services/api/exploreDesignApi';
import { generateSnowflakeSQL } from '../deployment/deployment-utils';
import { getCached, setCached, hashKey } from './ai-guided-cache';
import type { DesignEvent, EventType } from '../../stores/event-store';
import type {
  TableProfile,
  AiColumnClassification,
  AiColumnCategory,
  ClassifyColumnsResult,
  RelationDetection,
  DetectRelationsResponse,
  ColumnProfileSummary,
  TableRef,
  IngestionMode,
} from '@/app/services/api/types';

/** Where a detected proposal came from — drives the UI "AI vs heuristic" badge. */
export type DetectionSource = 'ai' | 'heuristic';

// ────────────────────────────────────────────────────────────────────────────
// Domain types
// ────────────────────────────────────────────────────────────────────────────

/** A column after detection — carries the raw DDL type plus the AI semantic tag. */
export interface DetectedColumn {
  name: string;
  dataType: string;
  nullable: boolean;
  /** AI semantic category (PII / METRIC / DIMENSION / KEY / AUDIT / …). */
  category: AiColumnClassification['category'] | null;
  subCategory: string | null;
  confidence: number;
  /** True when the user has accepted this column into the model (default: true). */
  accepted: boolean;
  /** True when the user flagged this as a primary-key member. */
  isPrimaryKey: boolean;
  /** True when AI flags this column as personally-identifiable. */
  isPii: boolean;
  /** 'ai' = Cortex classification, 'heuristic' = name-based offline fallback. */
  source: DetectionSource;
}

/** A detected foreign-key relationship — an editable proposal. */
export interface DetectedRelationship {
  id: string;
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  relationType: string;
  confidence: number;
  /** True when the user keeps this FK in the model (default: true). */
  accepted: boolean;
  /** 'ai' = Cortex relation detection, 'heuristic' = name-match fallback. */
  source: DetectionSource;
}

/** One table after schema detection. */
export interface DetectedTable {
  ref: TableRef;
  rowCount: number;
  columns: DetectedColumn[];
  /** Non-fatal detection notes surfaced to the user. */
  warnings: string[];
  /** True when this table's columns came from the offline heuristic fallback. */
  usedHeuristic: boolean;
  /** True when this table's AI classification was served from the cache. */
  cacheHit: boolean;
}

/** Normalized output of orchestrateDetection(). */
export interface DetectedModel {
  tables: DetectedTable[];
  relationships: DetectedRelationship[];
  /**
   * True when ANY part of detection (column classification or relations) fell
   * back to the deterministic heuristic because Cortex was unreachable. The
   * wizard uses this to raise a single "AI offline" toast per run.
   */
  usedHeuristic: boolean;
  /**
   * True when at least one AI call was served from the client cache instead
   * of hitting Cortex. Drives the "(cached)" chip in the Detect step header.
   */
  fromCache: boolean;
}

/** Final assembled plan handed to the approval + deployment steps. */
export interface AssembledPlan {
  tables: DetectedTable[];
  columnCount: number;
  relationships: DetectedRelationship[];
  ddlStatements: string[];
  ingestionTasks: Array<{ table: string; mode: IngestionMode }>;
}

/** A model event ready to be pushed into event-store.ts via addEvent(). */
export type ModelEventDraft = Omit<DesignEvent, 'id' | 'timestamp' | 'status'>;

// ────────────────────────────────────────────────────────────────────────────
// Prompt builders (consumed by the AI narrative card / future Cortex call)
// ────────────────────────────────────────────────────────────────────────────

/** Builds a one-shot prompt asking the AI to narrate a table's sample rows. */
export function buildSampleNarrativePrompt(
  table: TableRef,
  columns: string[],
  sampleRows: Record<string, unknown>[],
): string {
  const preview = sampleRows
    .slice(0, 10)
    .map((r) => columns.map((c) => `${c}=${String(r[c] ?? 'NULL')}`).join(', '))
    .join('\n');
  return [
    `You are a data architect. Inspect this sample from ${table.database}.${table.schema}.${table.table}.`,
    `Columns: ${columns.join(', ')}`,
    `Sample rows:`,
    preview,
    '',
    'In 2-3 sentences: what kind of table is this (fact / dimension / bridge),',
    'what is the grain, which column is the primary measure, and what time span',
    'does any date column cover? Flag any anomalies.',
  ].join('\n');
}

/** Builds a prompt asking the AI to propose a model shape from a table profile. */
export function buildSchemaProposalPrompt(table: TableRef, profile: TableProfile): string {
  const cols = profile.columns
    .map((c) => `${c.column_name} ${c.data_type}${c.nullable ? '' : ' NOT NULL'}`)
    .join('; ');
  return [
    `Propose a warehouse model for ${table.database}.${table.schema}.${table.table}`,
    `(${profile.row_count.toLocaleString()} rows, ${profile.column_count} columns).`,
    `Columns: ${cols}`,
    '',
    'Identify the likely primary key, candidate foreign keys, measures vs dimensions,',
    'and the best ingestion mode (full_refresh / incremental / scd_type2).',
  ].join('\n');
}

// ────────────────────────────────────────────────────────────────────────────
// Deterministic anomaly detection (no backend needed)
// ────────────────────────────────────────────────────────────────────────────

/** Flags obvious data anomalies from a profile — used before the AI narrative lands. */
export function detectAnomalies(profile: TableProfile): string[] {
  const out: string[] = [];
  for (const col of profile.columns) {
    if (
      col.null_count !== null &&
      profile.row_count > 0 &&
      col.null_count >= profile.row_count
    ) {
      out.push(`Column "${col.column_name}" is entirely NULL.`);
    }
    const isTextType = /VARCHAR|TEXT|STRING|CHAR/i.test(col.data_type);
    if (
      isTextType &&
      col.distinct_count !== null &&
      profile.row_count > 0 &&
      col.distinct_count >= profile.row_count * 0.95 &&
      profile.row_count > 20
    ) {
      out.push(
        `Column "${col.column_name}" is high-cardinality text — it may be an identifier, not a dimension.`,
      );
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Deterministic offline fallback (Cortex unreachable)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Name-based column classification — the offline fallback for `aiClassifyColumns`.
 *
 * Heuristics (first match wins), mapped onto the existing `AiColumnCategory`
 * union (we never widen the type):
 *   - `id` / `*_id` / `*_key`            → KEY
 *   - `*_at` / `*_date` / `*_ts` / date types → AUDIT
 *   - `amount` / `price` / `qty` / `count` / `total` (also `*_amount` etc.) → METRIC
 *   - `is_*` / `has_*`                   → DIMENSION (boolean flag — closest fit)
 *   - everything else                   → DIMENSION
 *
 * Confidence is intentionally low (0.5) so the UI never presents a heuristic
 * guess as an AI-confident result.
 */
export function heuristicClassifyColumn(
  columnName: string,
  dataType: string,
): { category: AiColumnCategory; subCategory: string } {
  const n = columnName.toLowerCase();
  const measureWords = ['amount', 'price', 'qty', 'quantity', 'count', 'total', 'sum', 'revenue', 'cost'];

  if (n === 'id' || n.endsWith('_id') || n.endsWith('_key') || n.endsWith('_pk')) {
    return { category: 'KEY', subCategory: 'identifier' };
  }
  if (
    n.endsWith('_at') ||
    n.endsWith('_date') ||
    n.endsWith('_ts') ||
    n === 'date' ||
    /DATE|TIMESTAMP|TIME/i.test(dataType)
  ) {
    return { category: 'AUDIT', subCategory: 'timestamp' };
  }
  if (measureWords.some((w) => n === w || n.endsWith(`_${w}`) || n.startsWith(`${w}_`))) {
    return { category: 'METRIC', subCategory: 'measure' };
  }
  if (n.startsWith('is_') || n.startsWith('has_')) {
    return { category: 'DIMENSION', subCategory: 'boolean flag' };
  }
  return { category: 'DIMENSION', subCategory: 'dimension' };
}

/** Detects PK candidates by name: a single `id` column, or `<table>_id`. */
function heuristicPrimaryKey(tableName: string, columnName: string): boolean {
  const n = columnName.toLowerCase();
  return n === 'id' || n === `${tableName.toLowerCase()}_id`;
}

/**
 * Name-match FK detection — the offline fallback for `detectRelations`.
 * A column `<other>_id` on table A is treated as an FK to `<other>.id` when a
 * table named `<other>` (or its plural/singular) exists in the selection.
 */
export function heuristicRelations(
  detectedTables: DetectedTable[],
): DetectedRelationship[] {
  const out: DetectedRelationship[] = [];
  // Index tables by a normalized (lower, de-pluralized) name.
  const norm = (s: string) => s.toLowerCase().replace(/s$/, '');
  const byName = new Map<string, DetectedTable>();
  for (const t of detectedTables) byName.set(norm(t.ref.table), t);

  for (const t of detectedTables) {
    for (const col of t.columns) {
      const cn = col.name.toLowerCase();
      if (!cn.endsWith('_id')) continue;
      const refName = norm(cn.slice(0, -3));
      const target = byName.get(refName);
      if (!target || target.ref.table === t.ref.table) continue;
      // Target must expose an `id`-like PK column to point at.
      const targetPk =
        target.columns.find((c) => c.name.toLowerCase() === 'id') ??
        target.columns.find((c) => c.isPrimaryKey);
      if (!targetPk) continue;
      out.push({
        id: `heuristic-${t.ref.table}-${col.name}`,
        sourceTable: t.ref.table,
        sourceColumn: col.name,
        targetTable: target.ref.table,
        targetColumn: targetPk.name,
        relationType: 'many_to_one',
        confidence: 0.5,
        accepted: true,
        source: 'heuristic',
      });
    }
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Detection orchestration
// ────────────────────────────────────────────────────────────────────────────

/** Heuristic: a column whose name looks like a PK and matches the AI KEY category. */
function looksLikePrimaryKey(name: string, category: string | null): boolean {
  const upper = name.toUpperCase();
  return (
    category === 'KEY' &&
    (upper === 'ID' || upper.endsWith('_ID') || upper.endsWith('_KEY') || upper.endsWith('_PK'))
  );
}

/** Maps a `ColumnProfileSummary` + classification into a `DetectedColumn`. */
function buildColumn(
  col: ColumnProfileSummary,
  tableName: string,
  ai: AiColumnClassification | undefined,
): DetectedColumn {
  if (ai) {
    return {
      name: col.column_name,
      dataType: col.data_type,
      nullable: col.nullable,
      category: ai.category,
      subCategory: ai.sub_category ?? null,
      confidence: ai.confidence,
      accepted: true,
      isPrimaryKey: looksLikePrimaryKey(col.column_name, ai.category),
      isPii: ai.category === 'PII',
      source: 'ai',
    };
  }
  // Heuristic fallback — name-based, low confidence, clearly tagged.
  const h = heuristicClassifyColumn(col.column_name, col.data_type);
  return {
    name: col.column_name,
    dataType: col.data_type,
    nullable: col.nullable,
    category: h.category,
    subCategory: h.subCategory,
    confidence: 0.5,
    accepted: true,
    isPrimaryKey: heuristicPrimaryKey(tableName, col.column_name),
    isPii: false,
    source: 'heuristic',
  };
}

/** Callback fired once per table as its detection resolves (skeleton-fill). */
export type TableResolvedHandler = (table: DetectedTable, index: number) => void;

/**
 * Fans out detection across all picked tables.
 *
 * Per-table: `tableProfile` + `aiClassifyColumns` via `Promise.allSettled` so
 * partial failures degrade gracefully. When `aiClassifyColumns` is unreachable
 * (Cortex down) the column classification falls back to `heuristicClassifyColumn`
 * and the table is tagged `usedHeuristic`. On the full set: `detectRelations`,
 * with `heuristicRelations` as the offline fallback.
 *
 * Caching: both the per-table classification and the relations call are cached
 * keyed on `projectId + sorted(table FQNs)`. `bustCache` forces a refresh.
 *
 * `onTableResolved` fires as each table's `Promise.allSettled` entry settles,
 * letting the Detect step fill its skeleton cards one by one.
 */
export async function orchestrateDetection(
  projectId: string,
  tables: TableRef[],
  options?: {
    onTableResolved?: TableResolvedHandler;
    bustCache?: boolean;
  },
): Promise<DetectedModel> {
  const onTableResolved = options?.onTableResolved;
  const bustCache = options?.bustCache ?? false;

  const perTable = await Promise.allSettled(
    tables.map(async (ref, index): Promise<DetectedTable> => {
      const fqn = `${ref.database}.${ref.schema}.${ref.table}`;
      const classifyKey = hashKey('classify', projectId, [fqn]);

      // Profile is not cached — it carries fresh row counts; the AI
      // classification (the expensive Cortex call) is what we cache.
      const profilePromise = tableProfile(projectId, ref.database, ref.schema, ref.table);

      let classifications: AiColumnClassification[] = [];
      let classifyFailed = false;
      if (!bustCache) {
        const hit = getCached(classifyKey);
        if (hit) {
          try {
            classifications = (JSON.parse(hit) as ClassifyColumnsResult).classifications;
          } catch {
            classifications = [];
          }
        }
      }
      const hadCacheHit = classifications.length > 0;

      const [profileRes, classifyRes] = await Promise.allSettled([
        profilePromise,
        hadCacheHit
          ? Promise.resolve<ClassifyColumnsResult | null>(null)
          : aiClassifyColumns(projectId, {
              database: ref.database,
              schema: ref.schema,
              table: ref.table,
            }),
      ]);

      const warnings: string[] = [];
      let profile: TableProfile | null = null;
      if (profileRes.status === 'fulfilled') {
        profile = profileRes.value;
        warnings.push(...detectAnomalies(profile));
      } else {
        warnings.push('Profile unavailable — column types could not be detected.');
      }

      if (!hadCacheHit) {
        if (classifyRes.status === 'fulfilled' && classifyRes.value) {
          classifications = classifyRes.value.classifications;
          setCached(classifyKey, JSON.stringify(classifyRes.value), 'classify');
        } else if (classifyRes.status === 'rejected') {
          classifyFailed = true;
          warnings.push(
            'AI offline — column tags below are heuristic name-based guesses.',
          );
        }
      }

      const byColumn = new Map(classifications.map((c) => [c.column.toUpperCase(), c]));
      const columns: DetectedColumn[] = (profile?.columns ?? []).map((col) =>
        buildColumn(col, ref.table, byColumn.get(col.column_name.toUpperCase())),
      );

      const detected: DetectedTable = {
        ref,
        rowCount: profile?.row_count ?? 0,
        columns,
        warnings,
        usedHeuristic: classifyFailed,
        cacheHit: hadCacheHit,
      };
      onTableResolved?.(detected, index);
      return detected;
    }),
  );

  const detectedTables: DetectedTable[] = perTable
    .filter((r): r is PromiseFulfilledResult<DetectedTable> => r.status === 'fulfilled')
    .map((r) => r.value);

  // Relationship detection runs across the whole selection.
  let relationships: DetectedRelationship[] = [];
  let relationsHeuristic = false;
  let relationsCacheHit = false;
  if (tables.length > 1) {
    const fqns = tables.map((t) => `${t.database}.${t.schema}.${t.table}`);
    const relKey = hashKey('relations', projectId, fqns);
    let relData: DetectRelationsResponse | null = null;

    if (!bustCache) {
      const hit = getCached(relKey);
      if (hit) {
        try {
          relData = JSON.parse(hit) as DetectRelationsResponse;
          relationsCacheHit = true;
        } catch {
          relData = null;
        }
      }
    }

    if (!relData) {
      try {
        relData = await detectRelations(projectId, { tables });
        setCached(relKey, JSON.stringify(relData), 'relations');
      } catch {
        // Cortex relation detection unreachable — fall back to name-match.
        relationsHeuristic = true;
        relationships = heuristicRelations(detectedTables);
      }
    }

    if (relData) {
      relationships = relData.relations.map((r: RelationDetection) => ({
        id: r.detection_id,
        sourceTable: r.left_table,
        sourceColumn: r.left_column,
        targetTable: r.right_table,
        targetColumn: r.right_column,
        relationType: r.relation_type,
        confidence: r.confidence,
        accepted: true,
        source: 'ai' as DetectionSource,
      }));
    }
  }

  const usedHeuristic =
    relationsHeuristic || detectedTables.some((t) => t.usedHeuristic);
  const fromCache =
    relationsCacheHit || detectedTables.some((t) => t.cacheHit);

  return { tables: detectedTables, relationships, usedHeuristic, fromCache };
}

// ────────────────────────────────────────────────────────────────────────────
// Plan assembly
// ────────────────────────────────────────────────────────────────────────────

const tableKey = (r: TableRef) => `${r.database}.${r.schema}.${r.table}`;

/** Builds the model events (TABLE_CREATED + PRIMARY_KEY_SET + FOREIGN_KEY_ADDED). */
export function buildModelEvents(
  model: DetectedModel,
  projectId: string,
): ModelEventDraft[] {
  const events: ModelEventDraft[] = [];

  for (const table of model.tables) {
    const accepted = table.columns.filter((c) => c.accepted);
    if (accepted.length === 0) continue;

    events.push({
      type: 'TABLE_CREATED' as EventType,
      projectId,
      target: { ...table.ref },
      payload: {
        tableName: table.ref.table,
        columns: accepted.map((c) => ({
          name: c.name,
          dataType: c.dataType,
          nullable: c.nullable,
          primaryKey: c.isPrimaryKey,
        })),
        primaryKeys: accepted.filter((c) => c.isPrimaryKey).map((c) => c.name),
      },
    });

    const pkColumns = accepted.filter((c) => c.isPrimaryKey).map((c) => c.name);
    if (pkColumns.length > 0) {
      events.push({
        type: 'PRIMARY_KEY_SET' as EventType,
        projectId,
        target: { ...table.ref },
        payload: { columns: pkColumns },
      });
    }
  }

  // Foreign keys — resolve table refs from the detected set.
  const refByTableName = new Map(model.tables.map((t) => [t.ref.table, t.ref]));
  for (const rel of model.relationships) {
    if (!rel.accepted) continue;
    const sourceRef = refByTableName.get(rel.sourceTable);
    const targetRef = refByTableName.get(rel.targetTable);
    if (!sourceRef || !targetRef) continue;
    events.push({
      type: 'FOREIGN_KEY_ADDED' as EventType,
      projectId,
      target: { ...sourceRef, column: rel.sourceColumn },
      payload: {
        columns: [rel.sourceColumn],
        referencedTable: { ...targetRef },
        referencedColumns: [rel.targetColumn],
        constraintName: `FK_${rel.sourceTable}_${rel.sourceColumn}`,
      },
    });
  }

  return events;
}

/**
 * Folds the detected model into the final plan: tables, DDL statements
 * (via the existing generateSnowflakeSQL), and ingestion tasks.
 */
export function assemblePlan(
  model: DetectedModel,
  ingestionModes: Record<string, IngestionMode>,
): AssembledPlan {
  // projectId is irrelevant for DDL preview — generateSnowflakeSQL only reads
  // event.target + event.payload — so we pass '' here.
  const events = buildModelEvents(model, '');
  const ddlStatements = events.map((e) => {
    const stub: DesignEvent = {
      ...e,
      id: 'preview',
      timestamp: new Date(),
      status: 'pending',
    };
    return generateSnowflakeSQL(stub).sql;
  });

  const ingestionTasks = model.tables.map((t) => ({
    table: tableKey(t.ref),
    mode: ingestionModes[tableKey(t.ref)] ?? ('full_refresh' as IngestionMode),
  }));

  const columnCount = model.tables.reduce(
    (sum, t) => sum + t.columns.filter((c) => c.accepted).length,
    0,
  );

  return {
    tables: model.tables,
    columnCount,
    relationships: model.relationships.filter((r) => r.accepted),
    ddlStatements,
    ingestionTasks,
  };
}

/** Builds the plan-summary payload persisted to the project audit log on approval. */
export function buildApprovalDetails(plan: AssembledPlan) {
  return {
    table_count: plan.tables.length,
    column_count: plan.columnCount,
    relationship_count: plan.relationships.length,
    ddl_statement_count: plan.ddlStatements.length,
    ingestion_tasks: plan.ingestionTasks,
    tables: plan.tables.map((t) => tableKey(t.ref)),
    approved_at: new Date().toISOString(),
  };
}
