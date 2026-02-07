/**
 * Sample Data for Workflow Module
 * Dev/demo only. Do not display to users when API fails: show empty list and message instead.
 * The workflow page already sets workflows to [] on fetch error and does not use this file.
 */

// ============================
// TYPE DEFINITIONS
// ============================

export interface WorkflowItem {
  workflow_name: string;
  steps: WorkflowStep[];
  schedule_interval_str?: string;
  status?: 'active' | 'paused' | 'draft' | 'error';
  last_run?: string;
  next_run?: string;
}

export interface WorkflowStep {
  step_order: number;
  action_type: string;
  payload: { [key: string]: any };
}

// ============================
// SAMPLE WORKFLOW DATA
// ============================

/**
 * Sample workflows for demonstration purposes
 * These workflows represent typical data processing scenarios
 */
export const SAMPLE_WORKFLOWS: WorkflowItem[] = [
  {
    workflow_name: 'Customer Data ETL',
    status: 'active',
    schedule_interval_str: 'daily',
    last_run: '2024-11-29T08:00:00Z',
    next_run: '2024-11-30T08:00:00Z',
    steps: [
      {
        step_order: 1,
        action_type: 'extract',
        payload: {
          source: 'RETAIL_DB.PUBLIC.CUSTOMERS',
          description: 'Extract customer data from source database'
        }
      },
      {
        step_order: 2,
        action_type: 'transform',
        payload: {
          operation: 'clean_duplicates',
          description: 'Remove duplicate customer records'
        }
      },
      {
        step_order: 3,
        action_type: 'transform',
        payload: {
          operation: 'enrich',
          description: 'Add calculated fields (full_name, customer_age)'
        }
      },
      {
        step_order: 4,
        action_type: 'load',
        payload: {
          target: 'RETAIL_DB.RETAIL_DW.DIM_CUSTOMER',
          description: 'Load transformed data into data warehouse'
        }
      }
    ]
  },
  {
    workflow_name: 'Product Sync Workflow',
    status: 'active',
    schedule_interval_str: 'hourly',
    last_run: '2024-11-30T07:00:00Z',
    next_run: '2024-11-30T08:00:00Z',
    steps: [
      {
        step_order: 1,
        action_type: 'extract',
        payload: {
          source: 'RETAIL_DB.PUBLIC.PRODUCTS',
          description: 'Extract product catalog'
        }
      },
      {
        step_order: 2,
        action_type: 'transform',
        payload: {
          operation: 'validate',
          description: 'Validate product data quality'
        }
      },
      {
        step_order: 3,
        action_type: 'load',
        payload: {
          target: 'RETAIL_DB.RETAIL_DW.DIM_PRODUCT',
          description: 'Sync products to warehouse'
        }
      }
    ]
  },
  {
    workflow_name: 'Sales Aggregation',
    status: 'paused',
    schedule_interval_str: 'weekly',
    last_run: '2024-11-25T08:00:00Z',
    next_run: '2024-12-02T08:00:00Z',
    steps: [
      {
        step_order: 1,
        action_type: 'extract',
        payload: {
          source: 'RETAIL_DB.PUBLIC.ORDERS',
          description: 'Extract sales transactions'
        }
      },
      {
        step_order: 2,
        action_type: 'transform',
        payload: {
          operation: 'aggregate',
          description: 'Calculate sales metrics by customer, product, and date'
        }
      },
      {
        step_order: 3,
        action_type: 'load',
        payload: {
          target: 'RETAIL_DB.RETAIL_DW.FACT_SALES',
          description: 'Load aggregated sales fact table'
        }
      }
    ]
  },
  {
    workflow_name: 'Data Quality Check',
    status: 'draft',
    schedule_interval_str: 'daily',
    steps: [
      {
        step_order: 1,
        action_type: 'validate',
        payload: {
          target: 'RETAIL_DB.PUBLIC.*',
          description: 'Run data quality checks on all source tables'
        }
      },
      {
        step_order: 2,
        action_type: 'notify',
        payload: {
          channel: 'email',
          description: 'Send quality report to data team'
        }
      }
    ]
  }
];

// ============================
// EXPECTED JSON FORMAT (DOCUMENTATION)
// ============================

/**
 * Expected JSON format for /workflow/get_workflows endpoint
 *
 * GET /workflow/get_workflows/
 * Authorization: Bearer <token>
 *
 * Response format:
 * {
 *   "workflows": [
 *     {
 *       "workflow_name": "Customer Data ETL",
 *       "status": "active",
 *       "schedule_interval_str": "daily",
 *       "last_run": "2024-11-29T08:00:00Z",
 *       "next_run": "2024-11-30T08:00:00Z",
 *       "steps": [
 *         {
 *           "step_order": 1,
 *           "action_type": "extract",
 *           "payload": {
 *             "source": "RETAIL_DB.PUBLIC.CUSTOMERS",
 *             "description": "Extract customer data from source database"
 *           }
 *         },
 *         {
 *           "step_order": 2,
 *           "action_type": "transform",
 *           "payload": {
 *             "operation": "clean_duplicates",
 *             "description": "Remove duplicate customer records"
 *           }
 *         }
 *       ]
 *     }
 *   ]
 * }
 */

/**
 * TODO (Backend): Configure CORS headers to allow requests from the frontend
 *
 * Required CORS configuration on backend:
 * ```python
 * from fastapi.middleware.cors import CORSMiddleware
 *
 * app.add_middleware(
 *     CORSMiddleware,
 *     allow_origins=["http://localhost:3000"],  # Frontend URL
 *     allow_credentials=True,
 *     allow_methods=["*"],
 *     allow_headers=["*"],
 * )
 * ```
 */
