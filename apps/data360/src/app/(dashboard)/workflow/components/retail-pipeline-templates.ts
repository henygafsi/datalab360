/**
 * Pre-built Retail ETL Pipeline Templates
 *
 * Ready-to-use DAG definitions for common retail data scenarios
 * referencing ShopSphere connector schemas (Salesforce, SAP, HubSpot, Oracle).
 *
 * Each template produces ReactFlow-compatible Node[] and Edge[] arrays
 * with fully typed configs matching the ETL service types.
 */

import type { Node, Edge } from 'reactflow';
import { MarkerType } from 'reactflow';
import type {
  SourceConfig,
  JoinConfig,
  AggregateConfig,
  FilterConfig,
  FormulaConfig,
  DestinationConfig,
} from '@/app/services/etl/types';

// ============================================
// TEMPLATE INTERFACE
// ============================================

export type PipelineTemplateCategory = 'retail' | 'finance' | 'marketing' | 'operations';

export interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  category: PipelineTemplateCategory;
  tags: string[];
  nodes: Node[];
  edges: Edge[];
}

// ============================================
// HELPER — consistent edge styling
// ============================================

function edge(id: string, source: string, target: string, targetHandle?: string): Edge {
  return {
    id,
    source,
    target,
    targetHandle,
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { strokeWidth: 2 },
  };
}

// ============================================
// 1. RETAIL SALES PIPELINE
// ============================================
//
// DAG:
//   [Salesforce Opportunities] ──> [Aggregate daily by store] ──> [Join with SAP Store Locations] ──> [ANALYTICS.DAILY_SALES_SUMMARY]
//   [SAP Store Locations] ─────────────────────────────────────┘

const retailSalesNodes: Node[] = [
  {
    id: 'rs_src_opportunities',
    type: 'salesforce_source',
    position: { x: 0, y: 80 },
    data: {
      name: 'Salesforce Opportunities',
      config: {
        database: 'SHOPSPHERE',
        schema: 'SALESFORCE',
        table: 'OPPORTUNITIES',
        columns: [
          'OPPORTUNITY_ID',
          'STORE_ID',
          'CLOSE_DATE',
          'AMOUNT',
          'QUANTITY',
          'PRODUCT_ID',
          'STAGE_NAME',
        ],
        where_clause: "STAGE_NAME = 'Closed Won'",
      } satisfies SourceConfig,
    },
  },
  {
    id: 'rs_agg_daily',
    type: 'aggregate',
    position: { x: 350, y: 80 },
    data: {
      name: 'Daily Store Totals',
      config: {
        group_by: ['STORE_ID', 'CLOSE_DATE'],
        aggregations: [
          { column: 'AMOUNT', function: 'SUM', alias: 'DAILY_REVENUE' },
          { column: 'QUANTITY', function: 'SUM', alias: 'DAILY_UNITS_SOLD' },
          { column: 'OPPORTUNITY_ID', function: 'COUNT', alias: 'TRANSACTION_COUNT' },
          { column: 'AMOUNT', function: 'AVG', alias: 'AVG_TRANSACTION_VALUE' },
        ],
      } satisfies AggregateConfig,
    },
  },
  {
    id: 'rs_src_stores',
    type: 'sap_source',
    position: { x: 350, y: 280 },
    data: {
      name: 'SAP Store Locations',
      config: {
        database: 'SHOPSPHERE',
        schema: 'SAP',
        table: 'STORE_LOCATIONS',
        columns: [
          'STORE_ID',
          'STORE_NAME',
          'REGION',
          'CITY',
          'COUNTRY',
          'STORE_TYPE',
          'OPENING_DATE',
        ],
      } satisfies SourceConfig,
    },
  },
  {
    id: 'rs_join_store',
    type: 'join',
    position: { x: 700, y: 140 },
    data: {
      name: 'Enrich with Store Details',
      config: {
        join_type: 'LEFT',
        left_key: 'STORE_ID',
        right_key: 'STORE_ID',
        exclude_right_columns: ['STORE_ID'],
      } satisfies JoinConfig,
    },
  },
  {
    id: 'rs_dest_summary',
    type: 'destination',
    position: { x: 1050, y: 140 },
    data: {
      name: 'Daily Sales Summary',
      config: {
        database: 'SHOPSPHERE',
        schema: 'ANALYTICS',
        table: 'DAILY_SALES_SUMMARY',
        write_mode: 'append',
      } satisfies DestinationConfig,
    },
  },
];

const retailSalesEdges: Edge[] = [
  edge('rs_e1', 'rs_src_opportunities', 'rs_agg_daily'),
  edge('rs_e2', 'rs_agg_daily', 'rs_join_store', 'input1'),
  edge('rs_e3', 'rs_src_stores', 'rs_join_store', 'input2'),
  edge('rs_e4', 'rs_join_store', 'rs_dest_summary'),
];

// ============================================
// 2. INVENTORY SYNC PIPELINE
// ============================================
//
// DAG:
//   [SAP Materials] ──────> [Join Materials + POs] ──> [Calc Stock Levels] ──> [Filter Reorder] ──> [ANALYTICS.REORDER_ALERTS]
//   [SAP Purchase Orders] ─┘

const inventorySyncNodes: Node[] = [
  {
    id: 'inv_src_materials',
    type: 'sap_source',
    position: { x: 0, y: 60 },
    data: {
      name: 'SAP Materials',
      config: {
        database: 'SHOPSPHERE',
        schema: 'SAP',
        table: 'MATERIALS',
        columns: [
          'MATERIAL_ID',
          'MATERIAL_NAME',
          'CATEGORY',
          'UNIT_OF_MEASURE',
          'CURRENT_STOCK',
          'REORDER_POINT',
          'REORDER_QUANTITY',
          'UNIT_COST',
          'SUPPLIER_ID',
        ],
      } satisfies SourceConfig,
    },
  },
  {
    id: 'inv_src_pos',
    type: 'sap_source',
    position: { x: 0, y: 300 },
    data: {
      name: 'SAP Purchase Orders',
      config: {
        database: 'SHOPSPHERE',
        schema: 'SAP',
        table: 'PURCHASE_ORDERS',
        columns: [
          'PO_ID',
          'MATERIAL_ID',
          'ORDER_QUANTITY',
          'RECEIVED_QUANTITY',
          'ORDER_DATE',
          'EXPECTED_DELIVERY_DATE',
          'PO_STATUS',
        ],
        where_clause: "PO_STATUS IN ('OPEN', 'PARTIAL')",
      } satisfies SourceConfig,
    },
  },
  {
    id: 'inv_join_mat_po',
    type: 'join',
    position: { x: 380, y: 140 },
    data: {
      name: 'Materials + Open POs',
      config: {
        join_type: 'LEFT',
        left_key: 'MATERIAL_ID',
        right_key: 'MATERIAL_ID',
        exclude_right_columns: ['MATERIAL_ID'],
      } satisfies JoinConfig,
    },
  },
  {
    id: 'inv_calc_stock',
    type: 'formula',
    position: { x: 730, y: 140 },
    data: {
      name: 'Calculate Stock Levels',
      config: {
        formulas: [
          {
            name: 'STOCK_LEVEL',
            expression: 'CURRENT_STOCK + COALESCE(RECEIVED_QUANTITY, 0) - COALESCE(ORDER_QUANTITY, 0)',
          },
          {
            name: 'DAYS_UNTIL_DELIVERY',
            expression: 'DATEDIFF(day, CURRENT_DATE(), EXPECTED_DELIVERY_DATE)',
          },
          {
            name: 'STOCK_VALUE',
            expression: 'STOCK_LEVEL * UNIT_COST',
          },
          {
            name: 'IS_CRITICAL',
            expression: "CASE WHEN STOCK_LEVEL < REORDER_POINT * 0.5 THEN 'YES' ELSE 'NO' END",
          },
        ],
      } satisfies FormulaConfig,
    },
  },
  {
    id: 'inv_filter_reorder',
    type: 'filter',
    position: { x: 1080, y: 140 },
    data: {
      name: 'Below Reorder Point',
      config: {
        conditions: [
          {
            column: 'STOCK_LEVEL',
            operator: '<',
            value: 'REORDER_POINT',
          },
        ],
        logic: 'AND',
      } satisfies FilterConfig,
    },
  },
  {
    id: 'inv_dest_alerts',
    type: 'destination',
    position: { x: 1400, y: 140 },
    data: {
      name: 'Reorder Alerts',
      config: {
        database: 'SHOPSPHERE',
        schema: 'ANALYTICS',
        table: 'REORDER_ALERTS',
        write_mode: 'overwrite',
      } satisfies DestinationConfig,
    },
  },
];

const inventorySyncEdges: Edge[] = [
  edge('inv_e1', 'inv_src_materials', 'inv_join_mat_po', 'input1'),
  edge('inv_e2', 'inv_src_pos', 'inv_join_mat_po', 'input2'),
  edge('inv_e3', 'inv_join_mat_po', 'inv_calc_stock'),
  edge('inv_e4', 'inv_calc_stock', 'inv_filter_reorder'),
  edge('inv_e5', 'inv_filter_reorder', 'inv_dest_alerts'),
];

// ============================================
// 3. CUSTOMER 360 PIPELINE
// ============================================
//
// DAG:
//   [Salesforce Contacts] ──> [Join SF + HS] ──> [Join with Oracle Orders] ──> [Compute LTV & Loyalty] ──> [ANALYTICS.CUSTOMER_360]
//   [HubSpot Contacts] ────┘                       ┘
//   [Oracle Customer Orders] ──────────────────────┘

const customer360Nodes: Node[] = [
  {
    id: 'c360_src_sf',
    type: 'salesforce_source',
    position: { x: 0, y: 0 },
    data: {
      name: 'Salesforce Contacts',
      config: {
        database: 'SHOPSPHERE',
        schema: 'SALESFORCE',
        table: 'CONTACTS',
        columns: [
          'CUSTOMER_ID',
          'FIRST_NAME',
          'LAST_NAME',
          'EMAIL',
          'PHONE',
          'ACCOUNT_ID',
          'CREATED_DATE',
        ],
      } satisfies SourceConfig,
    },
  },
  {
    id: 'c360_src_hs',
    type: 'hubspot_source',
    position: { x: 0, y: 240 },
    data: {
      name: 'HubSpot Contacts',
      config: {
        database: 'SHOPSPHERE',
        schema: 'HUBSPOT',
        table: 'CONTACTS',
        columns: [
          'CUSTOMER_ID',
          'LIFECYCLE_STAGE',
          'LEAD_SOURCE',
          'MARKETING_OPT_IN',
          'LAST_ENGAGEMENT_DATE',
          'ENGAGEMENT_SCORE',
        ],
      } satisfies SourceConfig,
    },
  },
  {
    id: 'c360_join_sf_hs',
    type: 'join',
    position: { x: 380, y: 80 },
    data: {
      name: 'Merge SF + HubSpot',
      config: {
        join_type: 'LEFT',
        left_key: 'CUSTOMER_ID',
        right_key: 'CUSTOMER_ID',
        exclude_right_columns: ['CUSTOMER_ID'],
      } satisfies JoinConfig,
    },
  },
  {
    id: 'c360_src_oracle',
    type: 'oracle_source',
    position: { x: 380, y: 340 },
    data: {
      name: 'Oracle Customer Orders',
      config: {
        database: 'SHOPSPHERE',
        schema: 'ORACLE',
        table: 'CUSTOMER_ORDERS',
        columns: [
          'CUSTOMER_ID',
          'ORDER_ID',
          'ORDER_DATE',
          'ORDER_TOTAL',
          'ORDER_STATUS',
          'PRODUCT_CATEGORY',
        ],
        where_clause: "ORDER_STATUS = 'COMPLETED'",
      } satisfies SourceConfig,
    },
  },
  {
    id: 'c360_join_orders',
    type: 'join',
    position: { x: 730, y: 160 },
    data: {
      name: 'Join with Orders',
      config: {
        join_type: 'LEFT',
        left_key: 'CUSTOMER_ID',
        right_key: 'CUSTOMER_ID',
        exclude_right_columns: ['CUSTOMER_ID'],
      } satisfies JoinConfig,
    },
  },
  {
    id: 'c360_agg_orders',
    type: 'aggregate',
    position: { x: 1080, y: 160 },
    data: {
      name: 'Order Aggregates per Customer',
      config: {
        group_by: [
          'CUSTOMER_ID',
          'FIRST_NAME',
          'LAST_NAME',
          'EMAIL',
          'PHONE',
          'ACCOUNT_ID',
          'CREATED_DATE',
          'LIFECYCLE_STAGE',
          'LEAD_SOURCE',
          'MARKETING_OPT_IN',
          'LAST_ENGAGEMENT_DATE',
          'ENGAGEMENT_SCORE',
        ],
        aggregations: [
          { column: 'ORDER_TOTAL', function: 'SUM', alias: 'LIFETIME_VALUE' },
          { column: 'ORDER_ID', function: 'COUNT', alias: 'TOTAL_ORDERS' },
          { column: 'ORDER_TOTAL', function: 'AVG', alias: 'AVG_ORDER_VALUE' },
          { column: 'ORDER_DATE', function: 'MAX', alias: 'LAST_PURCHASE_DATE' },
          { column: 'ORDER_DATE', function: 'MIN', alias: 'FIRST_PURCHASE_DATE' },
        ],
      } satisfies AggregateConfig,
    },
  },
  {
    id: 'c360_calc_loyalty',
    type: 'formula',
    position: { x: 1430, y: 160 },
    data: {
      name: 'Compute Loyalty Score',
      config: {
        formulas: [
          {
            name: 'LOYALTY_SCORE',
            expression:
              "ROUND((" +
              "LEAST(LIFETIME_VALUE / 1000, 40) + " +
              "LEAST(TOTAL_ORDERS * 2, 30) + " +
              "CASE WHEN DATEDIFF(day, LAST_PURCHASE_DATE, CURRENT_DATE()) < 30 THEN 20 " +
              "WHEN DATEDIFF(day, LAST_PURCHASE_DATE, CURRENT_DATE()) < 90 THEN 10 ELSE 0 END + " +
              "COALESCE(ENGAGEMENT_SCORE, 0) / 10" +
              "), 1)",
          },
          {
            name: 'LOYALTY_TIER',
            expression:
              "CASE " +
              "WHEN LOYALTY_SCORE >= 80 THEN 'PLATINUM' " +
              "WHEN LOYALTY_SCORE >= 60 THEN 'GOLD' " +
              "WHEN LOYALTY_SCORE >= 40 THEN 'SILVER' " +
              "ELSE 'BRONZE' END",
          },
          {
            name: 'DAYS_SINCE_LAST_PURCHASE',
            expression: 'DATEDIFF(day, LAST_PURCHASE_DATE, CURRENT_DATE())',
          },
          {
            name: 'CUSTOMER_TENURE_MONTHS',
            expression: 'DATEDIFF(month, FIRST_PURCHASE_DATE, CURRENT_DATE())',
          },
        ],
      } satisfies FormulaConfig,
    },
  },
  {
    id: 'c360_dest',
    type: 'destination',
    position: { x: 1780, y: 160 },
    data: {
      name: 'Customer 360',
      config: {
        database: 'SHOPSPHERE',
        schema: 'ANALYTICS',
        table: 'CUSTOMER_360',
        write_mode: 'overwrite',
      } satisfies DestinationConfig,
    },
  },
];

const customer360Edges: Edge[] = [
  edge('c360_e1', 'c360_src_sf', 'c360_join_sf_hs', 'input1'),
  edge('c360_e2', 'c360_src_hs', 'c360_join_sf_hs', 'input2'),
  edge('c360_e3', 'c360_join_sf_hs', 'c360_join_orders', 'input1'),
  edge('c360_e4', 'c360_src_oracle', 'c360_join_orders', 'input2'),
  edge('c360_e5', 'c360_join_orders', 'c360_agg_orders'),
  edge('c360_e6', 'c360_agg_orders', 'c360_calc_loyalty'),
  edge('c360_e7', 'c360_calc_loyalty', 'c360_dest'),
];

// ============================================
// TEMPLATE REGISTRY
// ============================================

export const RETAIL_PIPELINE_TEMPLATES: PipelineTemplate[] = [
  {
    id: 'retail_sales_pipeline',
    name: 'Retail Sales Pipeline',
    description:
      'Aggregate Salesforce opportunities by store and day, enrich with SAP store location details, and write to ANALYTICS.DAILY_SALES_SUMMARY.',
    category: 'retail',
    tags: ['salesforce', 'sap', 'sales', 'aggregation', 'daily'],
    nodes: retailSalesNodes,
    edges: retailSalesEdges,
  },
  {
    id: 'inventory_sync_pipeline',
    name: 'Inventory Sync Pipeline',
    description:
      'Join SAP materials with open purchase orders, compute effective stock levels, and filter items below their reorder point into ANALYTICS.REORDER_ALERTS.',
    category: 'retail',
    tags: ['sap', 'inventory', 'reorder', 'supply-chain'],
    nodes: inventorySyncNodes,
    edges: inventorySyncEdges,
  },
  {
    id: 'customer_360_pipeline',
    name: 'Customer 360 Pipeline',
    description:
      'Unify customer data from Salesforce, HubSpot, and Oracle orders. Compute lifetime value, loyalty score, and tier, then write to ANALYTICS.CUSTOMER_360.',
    category: 'retail',
    tags: ['salesforce', 'hubspot', 'oracle', 'customer', 'ltv', 'loyalty'],
    nodes: customer360Nodes,
    edges: customer360Edges,
  },
];

// ============================================
// LOOKUP HELPERS
// ============================================

/** Get all templates for a given category */
export function getTemplatesByCategory(category: PipelineTemplateCategory): PipelineTemplate[] {
  return RETAIL_PIPELINE_TEMPLATES.filter((t) => t.category === category);
}

/** Get a single template by id */
export function getTemplateById(id: string): PipelineTemplate | undefined {
  return RETAIL_PIPELINE_TEMPLATES.find((t) => t.id === id);
}

/** Search templates by keyword (matches name, description, and tags) */
export function searchTemplates(query: string): PipelineTemplate[] {
  const q = query.toLowerCase();
  return RETAIL_PIPELINE_TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some((tag) => tag.includes(q))
  );
}
