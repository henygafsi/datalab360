/**
 * Catalog grounding for the AI Guided Workflow wizard.
 *
 * The LLM (Snowflake Cortex Mistral-7b) has a hard 15s SQL execution budget,
 * so the catalog cannot be sent in full. This module exposes:
 *
 *  - CATALOG / BLOCK_BY_TYPE       — typed access to etl-blocks-catalog.json
 *  - buildCatalogPromptSection()   — terse one-line-per-block index that fits
 *                                    the prompt budget (default = "core" set)
 *  - validateNode()                — checks required params against the catalog
 *  - fallbackGenerateWorkflow()    — deterministic keyword → real-block-types
 *                                    pipeline, used when /cortex/complete is
 *                                    unreachable or returns garbage
 *
 * The wizard must produce blocks whose `type` is in BLOCK_TYPES; this module
 * is the single source of truth for what counts as a "real" block.
 */
import catalogRaw from './etl-blocks-catalog.json';

export interface CatalogParam {
  name: string;
  type: string;
  required: boolean;
  description?: string;
  default?: unknown;
  enum?: string[];
}

export interface CatalogBlock {
  id: string;
  type: string;
  label: string;
  category: string;
  description: string;
  ports: {
    hasInput: boolean;
    hasOutput: boolean;
    minInputs: number;
    maxInputs: number;
  };
  params: CatalogParam[];
  outputs?: { schema?: string };
  usage?: string;
}

interface CatalogShape {
  version: string;
  blocks: CatalogBlock[];
  categories: Record<string, string>;
  samples?: unknown[];
  graph_contract?: unknown;
}

export const CATALOG = catalogRaw as unknown as CatalogShape;

export const BLOCK_TYPES: string[] = CATALOG.blocks.map((b) => b.type);
export const BLOCK_BY_TYPE = new Map<string, CatalogBlock>(
  CATALOG.blocks.map((b) => [b.type, b]),
);

// Category → vertical rank in the auto-layout (lower = further left).
// Drives layoutBlocks(); replaces the old 7-entry hand-coded map.
export const RANK_BY_CATEGORY: Record<string, number> = {
  source: 0,
  python: 1,
  transform: 2,
  transform_advanced: 2,
  ai_functions: 3,
  ml_training: 3,
  templates: 3,
  destination: 4,
};

export function rankForType(type: string): number {
  const def = BLOCK_BY_TYPE.get(type);
  return def ? RANK_BY_CATEGORY[def.category] ?? 2 : 2;
}

// The "core" set — the LLM gets these by default. Covers ~95% of the
// pipelines users describe in plain English while staying small enough to
// fit alongside the user's description inside Cortex's 15s budget.
const CORE_TYPES = new Set<string>([
  // sources
  'source', 'cdc_merge', 'stream_consume', 's3_source', 'postgres_source',
  'mysql_source', 'api_source', 'salesforce_source',
  // basic transforms
  'filter', 'join', 'aggregate', 'select', 'rename', 'cast', 'formula',
  'sort', 'union', 'distinct', 'limit',
  // advanced
  'window_rank', 'pivot', 'unpivot', 'date_transform', 'fill_nulls',
  'case_when', 'qualify_filter', 'json_flatten', 'json_extract',
  // ML / AI
  'recommendation', 'segmentation', 'clustering',
  'ai_sentiment', 'ai_classify', 'ai_extract', 'ai_complete',
  'ai_translate', 'ai_filter', 'ai_agg',
  'anomaly_detect', 'forecast',
  // python
  'python_script', 'sql_script', 'notebook_run',
  // destinations
  'destination', 'export_file', 'dynamic_table',
]);

/**
 * Build the catalog section injected into the LLM prompt.
 *
 * One line per block to stay terse:
 *   type (category): description | required: a,b,c | I/O: ✓/✗ ✓/✗
 *
 * Default scope "core" keeps the section ~35 lines (~1.5 KB) so the full
 * prompt + user description still fits the Cortex 15s budget.
 */
export function buildCatalogPromptSection(scope: 'core' | 'all' = 'core'): string {
  const blocks = scope === 'all'
    ? CATALOG.blocks
    : CATALOG.blocks.filter((b) => CORE_TYPES.has(b.type));
  return blocks
    .map((b) => {
      const reqs = b.params.filter((p) => p.required).map((p) => p.name).join(',') || '—';
      const io = `${b.ports.hasInput ? 'I' : '·'}${b.ports.hasOutput ? 'O' : '·'}`;
      return `- ${b.type} (${b.category}): ${b.description} | required: ${reqs} | ${io}`;
    })
    .join('\n');
}

export interface NodeLike {
  type: string;
  config?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

export interface ValidationIssue {
  kind: 'unknown_type' | 'missing_required' | 'orphan_input' | 'orphan_output';
  field?: string;
  message: string;
}

/**
 * Validate a single node against the catalog. Returns the list of issues
 * (missing required params, unknown types). Empty list = node is OK.
 * Reads both data.config[k] and data[k] because the existing node components
 * (ETLNodeTypes.tsx) use the dual-key convention.
 */
export function validateNode(node: NodeLike): ValidationIssue[] {
  const def = BLOCK_BY_TYPE.get(node.type);
  if (!def) {
    return [{ kind: 'unknown_type', message: `Unknown block type "${node.type}"` }];
  }
  const cfg = (node.config ?? node.data ?? {}) as Record<string, unknown>;
  const issues: ValidationIssue[] = [];
  for (const p of def.params) {
    if (!p.required) continue;
    const v = cfg[p.name] ?? (node.data as Record<string, unknown> | undefined)?.[p.name];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) {
      issues.push({
        kind: 'missing_required',
        field: p.name,
        message: `Missing required param "${p.name}"`,
      });
    }
  }
  return issues;
}

/**
 * Validate a whole graph: per-node param checks + port-rule checks.
 * (a) hasInput=false ⇒ no incoming edges
 * (b) hasOutput=false ⇒ no outgoing edges
 */
export function validateGraph(
  nodes: Array<{ id: string; type: string; data?: Record<string, unknown> }>,
  edges: Array<{ source: string; target: string }>,
): { ok: boolean; perNode: Record<string, ValidationIssue[]>; graphLevel: ValidationIssue[] } {
  const perNode: Record<string, ValidationIssue[]> = {};
  const graphLevel: ValidationIssue[] = [];

  const incoming = new Map<string, number>();
  const outgoing = new Map<string, number>();
  for (const e of edges) {
    incoming.set(e.target, (incoming.get(e.target) ?? 0) + 1);
    outgoing.set(e.source, (outgoing.get(e.source) ?? 0) + 1);
  }

  for (const n of nodes) {
    const issues = validateNode({ type: n.type, data: n.data });
    const def = BLOCK_BY_TYPE.get(n.type);
    if (def) {
      const inc = incoming.get(n.id) ?? 0;
      const out = outgoing.get(n.id) ?? 0;
      if (!def.ports.hasInput && inc > 0) {
        issues.push({ kind: 'orphan_input', message: 'This block cannot have incoming edges' });
      }
      if (!def.ports.hasOutput && out > 0) {
        issues.push({ kind: 'orphan_output', message: 'This block cannot have outgoing edges' });
      }
    }
    if (issues.length > 0) perNode[n.id] = issues;
  }

  const ok = Object.keys(perNode).length === 0 && graphLevel.length === 0;
  return { ok, perNode, graphLevel };
}

// ───────────────────────────────────────────────────────────────────────
// Offline fallback — runs when /cortex/complete is unreachable, returns
// garbage, or proposes types we don't know. Keyword-matching is rough but
// produces a valid graph from real catalog types that the user can refine.
// ───────────────────────────────────────────────────────────────────────

export interface FallbackBlock {
  id: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
}
export interface FallbackEdge {
  from: string;
  to: string;
  targetHandle?: string;
}

const DEFAULT_CONFIG_FOR: Record<string, Record<string, unknown>> = {
  source: { database: '', schema: '', table: '' },
  cdc_merge: { database: '', schema: '', table: '' },
  stream_consume: { stream_name: '' },
  join: { join_type: 'INNER', left_key: '', right_key: '' },
  filter: { filter_condition: '' },
  aggregate: { group_by: [], aggregations: [] },
  select: { columns: [] },
  sort: { sort_columns: [] },
  destination: { database: '', schema: '', table: '', write_mode: 'overwrite' },
  ai_sentiment: { text_column: '', output_column: 'SENTIMENT_SCORE' },
  ai_classify: { text_column: '', categories: [] },
  ai_extract: { text_column: '', fields: [] },
  ai_translate: { text_column: '', target_language: 'en' },
  ai_complete: { prompt_template: '' },
  ai_filter: { text_column: '', filter_prompt: '' },
  anomaly_detect: { input_column: '' },
  forecast: { timestamp_column: '', target_column: '', horizon: 7 },
  recommendation: { user_column: '', item_column: '' },
  segmentation: { input_columns: [] },
  clustering: { input_columns: [], n_clusters: 3 },
  pivot: { pivot_column: '', value_column: '' },
  window_rank: { partition_by: [], order_by: [], function: 'ROW_NUMBER', output_column: 'RN' },
  python_script: { script: '' },
  sql_script: { sql: '' },
  export_file: { file_path: '', format: 'csv' },
};

function defaultConfig(type: string): Record<string, unknown> {
  return { ...(DEFAULT_CONFIG_FOR[type] ?? {}) };
}

export function fallbackGenerateWorkflow(description: string): {
  blocks: FallbackBlock[];
  edges: FallbackEdge[];
} {
  const d = description.toLowerCase();
  const has = (re: RegExp) => re.test(d);

  const wantsSentiment = has(/sentiment|negative|positive|opinion|review/);
  const wantsTranslate = has(/translat|multi.?lingual/);
  const wantsClassify = has(/classif|categoriz|tag\b|label\b/);
  const wantsAnomaly = has(/anomal|outlier|fraud|suspicious/);
  const wantsForecast = has(/forecast|predict|projection|trend/);
  const wantsRecommend = has(/recommend|suggest/);
  const wantsCluster = has(/cluster|segment|cohort/);
  const wantsAggregate = has(/kpi|aggregat|sum |count|group by|rollup|metric|daily|weekly|monthly/);
  const wantsFilter = has(/filter|where|last \d|recent|today|window|past \d|since/);
  const wantsJoin = has(/join|merge|combine|enrich|attach/);
  const wantsCDC = has(/cdc|change data|incremental|streaming|stream\b/);
  const wantsExport = has(/export|file\b|csv|parquet|s3|download/);

  const blocks: FallbackBlock[] = [];
  const edges: FallbackEdge[] = [];
  let nextId = 1;
  const mkId = () => `n${nextId++}`;

  // 1) Source(s)
  const sourceType = wantsCDC ? 'cdc_merge' : 'source';
  const s1 = mkId();
  blocks.push({ id: s1, type: sourceType, label: `Source (${sourceType})`, config: defaultConfig(sourceType) });
  let cursor = s1;

  if (wantsJoin) {
    const s2 = mkId();
    blocks.push({ id: s2, type: 'source', label: 'Second source', config: defaultConfig('source') });
    const j = mkId();
    blocks.push({ id: j, type: 'join', label: 'Join', config: defaultConfig('join') });
    edges.push({ from: s1, to: j, targetHandle: 'input1' });
    edges.push({ from: s2, to: j, targetHandle: 'input2' });
    cursor = j;
  }

  if (wantsFilter) {
    const f = mkId();
    blocks.push({ id: f, type: 'filter', label: 'Filter rows', config: defaultConfig('filter') });
    edges.push({ from: cursor, to: f });
    cursor = f;
  }

  if (wantsSentiment) {
    const a = mkId();
    blocks.push({ id: a, type: 'ai_sentiment', label: 'AI sentiment', config: defaultConfig('ai_sentiment') });
    edges.push({ from: cursor, to: a });
    cursor = a;
  }
  if (wantsClassify) {
    const a = mkId();
    blocks.push({ id: a, type: 'ai_classify', label: 'AI classify', config: defaultConfig('ai_classify') });
    edges.push({ from: cursor, to: a });
    cursor = a;
  }
  if (wantsTranslate) {
    const a = mkId();
    blocks.push({ id: a, type: 'ai_translate', label: 'AI translate', config: defaultConfig('ai_translate') });
    edges.push({ from: cursor, to: a });
    cursor = a;
  }
  if (wantsAnomaly) {
    const m = mkId();
    blocks.push({ id: m, type: 'anomaly_detect', label: 'Anomaly detection', config: defaultConfig('anomaly_detect') });
    edges.push({ from: cursor, to: m });
    cursor = m;
  }
  if (wantsForecast) {
    const m = mkId();
    blocks.push({ id: m, type: 'forecast', label: 'Forecast', config: defaultConfig('forecast') });
    edges.push({ from: cursor, to: m });
    cursor = m;
  }
  if (wantsRecommend) {
    const r = mkId();
    blocks.push({ id: r, type: 'recommendation', label: 'Recommendation', config: defaultConfig('recommendation') });
    edges.push({ from: cursor, to: r });
    cursor = r;
  }
  if (wantsCluster) {
    const c = mkId();
    blocks.push({ id: c, type: 'clustering', label: 'Clustering', config: defaultConfig('clustering') });
    edges.push({ from: cursor, to: c });
    cursor = c;
  }

  if (wantsAggregate) {
    const a = mkId();
    blocks.push({ id: a, type: 'aggregate', label: 'Aggregate', config: defaultConfig('aggregate') });
    edges.push({ from: cursor, to: a });
    cursor = a;
  }

  // 2) Destination — file export if hinted, otherwise table.
  const destType = wantsExport ? 'export_file' : 'destination';
  const dest = mkId();
  blocks.push({ id: dest, type: destType, label: `Destination (${destType})`, config: defaultConfig(destType) });
  edges.push({ from: cursor, to: dest });

  return { blocks, edges };
}

/**
 * Returns true if a generated graph is "usable" — at least one source,
 * one destination, and every block type is in the catalog. Used by the
 * wizard to decide whether to accept the LLM output or fall back.
 */
export function isUsableGraph(
  blocks: Array<{ type: string }>,
  edges: Array<{ from?: string; to?: string; source?: string; target?: string }>,
): boolean {
  if (blocks.length < 2) return false;
  if (!blocks.every((b) => BLOCK_BY_TYPE.has(b.type))) return false;
  const hasSource = blocks.some((b) => {
    const def = BLOCK_BY_TYPE.get(b.type);
    return def && !def.ports.hasInput;
  });
  const hasDestination = blocks.some((b) => {
    const def = BLOCK_BY_TYPE.get(b.type);
    return def && !def.ports.hasOutput;
  });
  return hasSource && hasDestination && edges.length > 0;
}
