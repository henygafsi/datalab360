/**
 * Sample Data for Mapping Module
 * This file contains fallback sample data when API calls fail (e.g., CORS errors)
 */

// ============================
// TYPE DEFINITIONS
// ============================

export interface DatabaseItem {
  name: string;
}

export interface SchemaItem {
  name: string;
}

export interface TableItem {
  name: string;
}

export interface ColumnItem {
  name: string;
  data_type: string;
  is_nullable: boolean;
  is_primary_key?: boolean;
  is_foreign_key?: boolean;
}

// ============================
// SAMPLE DATA CONSTANTS
// ============================

/**
 * Sample databases based on RETAIL_DWH scenario
 */
export const SAMPLE_DATABASES: DatabaseItem[] = [
  { name: 'RETAIL_DB' },
  { name: 'ANALYTICS_DB' },
  { name: 'STAGING_DB' }
];

/**
 * Sample schemas for RETAIL_DB
 */
export const SAMPLE_SCHEMAS: SchemaItem[] = [
  { name: 'PUBLIC' },
  { name: 'RETAIL_DW' },
  { name: 'STAGING' },
  { name: 'ARCHIVE' }
];

/**
 * Sample tables for different schemas
 */
export const SAMPLE_TABLES: Record<string, TableItem[]> = {
  'PUBLIC': [
    { name: 'CUSTOMERS' },
    { name: 'PRODUCTS' },
    { name: 'ORDERS' },
    { name: 'SUPPLIERS' }
  ],
  'RETAIL_DW': [
    { name: 'DIM_CUSTOMER' },
    { name: 'DIM_PRODUCT' },
    { name: 'DIM_DATE' },
    { name: 'DIM_SUPPLIER' },
    { name: 'FACT_SALES' },
    { name: 'FACT_ORDERS' }
  ],
  'STAGING': [
    { name: 'STG_CUSTOMERS' },
    { name: 'STG_PRODUCTS' },
    { name: 'STG_ORDERS' }
  ]
};

/**
 * Sample columns for different tables
 */
export const SAMPLE_COLUMNS: Record<string, ColumnItem[]> = {
  'CUSTOMERS': [
    { name: 'CUSTOMER_ID', data_type: 'NUMBER', is_nullable: false, is_primary_key: true },
    { name: 'FIRST_NAME', data_type: 'VARCHAR', is_nullable: false },
    { name: 'LAST_NAME', data_type: 'VARCHAR', is_nullable: false },
    { name: 'EMAIL', data_type: 'VARCHAR', is_nullable: true },
    { name: 'PHONE', data_type: 'VARCHAR', is_nullable: true },
    { name: 'CREATED_AT', data_type: 'TIMESTAMP', is_nullable: false },
    { name: 'UPDATED_AT', data_type: 'TIMESTAMP', is_nullable: true }
  ],
  'PRODUCTS': [
    { name: 'PRODUCT_ID', data_type: 'NUMBER', is_nullable: false, is_primary_key: true },
    { name: 'PRODUCT_NAME', data_type: 'VARCHAR', is_nullable: false },
    { name: 'CATEGORY', data_type: 'VARCHAR', is_nullable: false },
    { name: 'PRICE', data_type: 'NUMBER', is_nullable: false },
    { name: 'SUPPLIER_ID', data_type: 'NUMBER', is_nullable: true, is_foreign_key: true },
    { name: 'CREATED_AT', data_type: 'TIMESTAMP', is_nullable: false }
  ],
  'ORDERS': [
    { name: 'ORDER_ID', data_type: 'NUMBER', is_nullable: false, is_primary_key: true },
    { name: 'CUSTOMER_ID', data_type: 'NUMBER', is_nullable: false, is_foreign_key: true },
    { name: 'ORDER_DATE', data_type: 'DATE', is_nullable: false },
    { name: 'TOTAL_AMOUNT', data_type: 'NUMBER', is_nullable: false },
    { name: 'STATUS', data_type: 'VARCHAR', is_nullable: false }
  ],
  'DIM_CUSTOMER': [
    { name: 'CUSTOMER_KEY', data_type: 'NUMBER', is_nullable: false, is_primary_key: true },
    { name: 'CUSTOMER_ID', data_type: 'NUMBER', is_nullable: false },
    { name: 'FULL_NAME', data_type: 'VARCHAR', is_nullable: false },
    { name: 'EMAIL', data_type: 'VARCHAR', is_nullable: true },
    { name: 'PHONE', data_type: 'VARCHAR', is_nullable: true },
    { name: 'VALID_FROM', data_type: 'TIMESTAMP', is_nullable: false },
    { name: 'VALID_TO', data_type: 'TIMESTAMP', is_nullable: true },
    { name: 'IS_CURRENT', data_type: 'BOOLEAN', is_nullable: false }
  ],
  'DIM_PRODUCT': [
    { name: 'PRODUCT_KEY', data_type: 'NUMBER', is_nullable: false, is_primary_key: true },
    { name: 'PRODUCT_ID', data_type: 'NUMBER', is_nullable: false },
    { name: 'PRODUCT_NAME', data_type: 'VARCHAR', is_nullable: false },
    { name: 'CATEGORY', data_type: 'VARCHAR', is_nullable: false },
    { name: 'CURRENT_PRICE', data_type: 'NUMBER', is_nullable: false },
    { name: 'VALID_FROM', data_type: 'TIMESTAMP', is_nullable: false },
    { name: 'VALID_TO', data_type: 'TIMESTAMP', is_nullable: true },
    { name: 'IS_CURRENT', data_type: 'BOOLEAN', is_nullable: false }
  ],
  'FACT_SALES': [
    { name: 'SALES_KEY', data_type: 'NUMBER', is_nullable: false, is_primary_key: true },
    { name: 'ORDER_ID', data_type: 'NUMBER', is_nullable: false },
    { name: 'CUSTOMER_KEY', data_type: 'NUMBER', is_nullable: false, is_foreign_key: true },
    { name: 'PRODUCT_KEY', data_type: 'NUMBER', is_nullable: false, is_foreign_key: true },
    { name: 'DATE_KEY', data_type: 'NUMBER', is_nullable: false, is_foreign_key: true },
    { name: 'QUANTITY', data_type: 'NUMBER', is_nullable: false },
    { name: 'UNIT_PRICE', data_type: 'NUMBER', is_nullable: false },
    { name: 'TOTAL_AMOUNT', data_type: 'NUMBER', is_nullable: false }
  ]
};

// ============================
// EXPECTED JSON FORMATS (DOCUMENTATION)
// ============================

/**
 * Expected JSON format for /mapping/databases endpoint
 *
 * GET /mapping/databases
 * Authorization: Bearer <token>
 *
 * Response format:
 * {
 *   "databases": [
 *     { "name": "RETAIL_DB" },
 *     { "name": "ANALYTICS_DB" }
 *   ]
 * }
 */

/**
 * Expected JSON format for /mapping/schemas endpoint
 *
 * GET /mapping/schemas?database=RETAIL_DB
 * Authorization: Bearer <token>
 *
 * Response format:
 * {
 *   "schemas": [
 *     { "name": "PUBLIC" },
 *     { "name": "RETAIL_DW" }
 *   ]
 * }
 */

/**
 * Expected JSON format for /mapping/tables endpoint
 *
 * GET /mapping/tables?database=RETAIL_DB&schema=PUBLIC
 * Authorization: Bearer <token>
 *
 * Response format:
 * {
 *   "tables": [
 *     { "name": "CUSTOMERS" },
 *     { "name": "PRODUCTS" },
 *     { "name": "ORDERS" }
 *   ]
 * }
 */

/**
 * Expected JSON format for /mapping/columns endpoint
 *
 * GET /mapping/columns?database=RETAIL_DB&schema=PUBLIC&table=CUSTOMERS
 * Authorization: Bearer <token>
 *
 * Response format:
 * {
 *   "columns": [
 *     {
 *       "name": "CUSTOMER_ID",
 *       "data_type": "NUMBER",
 *       "is_nullable": false,
 *       "is_primary_key": true,
 *       "is_foreign_key": false
 *     },
 *     {
 *       "name": "FIRST_NAME",
 *       "data_type": "VARCHAR",
 *       "is_nullable": false,
 *       "is_primary_key": false,
 *       "is_foreign_key": false
 *     }
 *   ]
 * }
 */
