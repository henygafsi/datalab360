/**
 * workflow-templates.ts — curated workflow starting points for the
 * UnifiedProjectWizard template fork (module='workflow').
 *
 * A template is intentionally simple: a predefined set of ETL blocks +
 * the edges that wire them. The blocks reuse the catalog's real
 * `type` values so the registered ETLNodeTypes components render them.
 *
 * The first three templates are derived from the catalog `samples`
 * (etl-blocks-catalog.json); "Customer 360" and "IoT anomaly" are added
 * curated entries the catalog ships block types for.
 */
import { MarkerType, type Node, type Edge } from 'reactflow';

export interface WorkflowTemplateBlock {
  id: string;
  type: string;
  label: string;
  config: Record<string, unknown>;
}

export interface WorkflowTemplate {
  id: string;
  title: string;
  description: string;
  /** Tiny preview — the ordered block-type chain shown on the card. */
  preview: string[];
  blocks: WorkflowTemplateBlock[];
  edges: { from: string; to: string }[];
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    id: 'daily-kpi-rollup',
    title: 'Daily KPI rollup',
    description:
      'Read orders, filter the last 24h, group by store, write a KPI table.',
    preview: ['source', 'filter', 'aggregate', 'destination'],
    blocks: [
      {
        id: 'n1',
        type: 'source',
        label: 'Orders',
        config: { database: 'RAW', schema: 'SALES', table: 'ORDERS' },
      },
      {
        id: 'n2',
        type: 'filter',
        label: 'Last 24h',
        config: {
          filter_condition:
            "ORDER_TS >= DATEADD('day', -1, CURRENT_TIMESTAMP())",
        },
      },
      {
        id: 'n3',
        type: 'aggregate',
        label: 'Per store',
        config: {
          group_by: ['STORE_ID'],
          aggregations: [
            { fn: 'SUM', column: 'AMOUNT', alias: 'REVENUE' },
            { fn: 'COUNT', column: '*', alias: 'ORDER_COUNT' },
          ],
        },
      },
      {
        id: 'n4',
        type: 'destination',
        label: 'KPI table',
        config: {
          database: 'ANALYTICS',
          schema: 'KPI',
          table: 'STORE_DAILY',
          write_mode: 'overwrite',
        },
      },
    ],
    edges: [
      { from: 'n1', to: 'n2' },
      { from: 'n2', to: 'n3' },
      { from: 'n3', to: 'n4' },
    ],
  },
  {
    id: 'sentiment-scoring',
    title: 'Sentiment scoring',
    description: 'Read reviews, score sentiment with AI, write enriched rows.',
    preview: ['source', 'ai_sentiment', 'destination'],
    blocks: [
      {
        id: 's1',
        type: 'source',
        label: 'Reviews',
        config: { database: 'RAW', schema: 'REVIEWS', table: 'REVIEWS_RAW' },
      },
      {
        id: 's2',
        type: 'ai_sentiment',
        label: 'Score sentiment',
        config: {
          text_column: 'REVIEW_TEXT',
          output_column: 'SENTIMENT_SCORE',
        },
      },
      {
        id: 's3',
        type: 'destination',
        label: 'Scored reviews',
        config: {
          database: 'ANALYTICS',
          schema: 'REVIEWS',
          table: 'REVIEWS_SCORED',
          write_mode: 'overwrite',
        },
      },
    ],
    edges: [
      { from: 's1', to: 's2' },
      { from: 's2', to: 's3' },
    ],
  },
  {
    id: 'customer-360',
    title: 'Customer 360',
    description:
      'Join orders with customers, rank orders per customer, keep the top 10.',
    preview: ['source', 'source', 'join', 'window_rank', 'destination'],
    blocks: [
      {
        id: 'c1',
        type: 'source',
        label: 'Orders',
        config: { database: 'RAW', schema: 'SALES', table: 'ORDERS' },
      },
      {
        id: 'c2',
        type: 'source',
        label: 'Customers',
        config: { database: 'RAW', schema: 'CRM', table: 'CUSTOMERS' },
      },
      {
        id: 'c3',
        type: 'join',
        label: 'Join on customer',
        config: {
          join_type: 'INNER',
          left_key: 'CUSTOMER_ID',
          right_key: 'CUSTOMER_ID',
        },
      },
      {
        id: 'c4',
        type: 'window_rank',
        label: 'Rank per customer',
        config: {
          partition_by: ['CUSTOMER_ID'],
          order_by: ['ORDER_TS'],
          function: 'ROW_NUMBER',
          output_column: 'RN',
        },
      },
      {
        id: 'c5',
        type: 'destination',
        label: 'Customer 360',
        config: {
          database: 'ANALYTICS',
          schema: 'CUSTOMER',
          table: 'CUSTOMER_360',
          write_mode: 'overwrite',
        },
      },
    ],
    edges: [
      { from: 'c1', to: 'c3' },
      { from: 'c2', to: 'c3' },
      { from: 'c3', to: 'c4' },
      { from: 'c4', to: 'c5' },
    ],
  },
  {
    id: 'iot-anomaly',
    title: 'IoT anomaly detection',
    description:
      'Read sensor readings, flag anomalies, write the alert table.',
    preview: ['source', 'anomaly_detect', 'destination'],
    blocks: [
      {
        id: 'i1',
        type: 'source',
        label: 'Sensor readings',
        config: { database: 'RAW', schema: 'IOT', table: 'SENSOR_READINGS' },
      },
      {
        id: 'i2',
        type: 'anomaly_detect',
        label: 'Detect anomalies',
        config: { input_column: 'READING_VALUE' },
      },
      {
        id: 'i3',
        type: 'destination',
        label: 'Anomaly alerts',
        config: {
          database: 'ANALYTICS',
          schema: 'IOT',
          table: 'SENSOR_ANOMALIES',
          write_mode: 'append',
        },
      },
    ],
    edges: [
      { from: 'i1', to: 'i2' },
      { from: 'i2', to: 'i3' },
    ],
  },
];

const RANK_BY_TYPE: Record<string, number> = {
  source: 0,
  cdc_merge: 0,
  stream_consume: 0,
  destination: 4,
  export_file: 4,
  dynamic_table: 4,
};

function rankOf(type: string): number {
  if (type in RANK_BY_TYPE) return RANK_BY_TYPE[type];
  return 2; // transforms / AI blocks sit in the middle
}

/**
 * Convert a template into ReactFlow nodes + edges, matching the dual-key
 * `data` convention (`data.config?.X || data.X`) the registered ETLNodeTypes
 * components read — identical to the AI wizard's `layoutBlocks`.
 */
export function templateToReactFlow(template: WorkflowTemplate): {
  nodes: Node[];
  edges: Edge[];
} {
  const X = 280;
  const Y = 140;
  const byRank = new Map<number, WorkflowTemplateBlock[]>();
  for (const b of template.blocks) {
    const r = rankOf(b.type);
    if (!byRank.has(r)) byRank.set(r, []);
    byRank.get(r)!.push(b);
  }
  const nodes: Node[] = [];
  for (const rank of Array.from(byRank.keys()).sort((a, b) => a - b)) {
    byRank.get(rank)!.forEach((b, idx) => {
      nodes.push({
        id: b.id,
        type: b.type,
        position: { x: rank * X, y: idx * Y },
        data: {
          ...b.config,
          label: b.label,
          name: b.label,
          fromTemplate: true,
          config: b.config,
        },
      });
    });
  }
  const edges: Edge[] = template.edges.map((e, i) => ({
    id: `te-${i}-${e.from}-${e.to}`,
    source: e.from,
    target: e.to,
    animated: true,
    markerEnd: { type: MarkerType.ArrowClosed, color: '#10B981' },
    style: { strokeWidth: 2, stroke: '#10B981' },
  }));
  return { nodes, edges };
}
