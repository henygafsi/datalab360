import {
  Database,
  GitMerge,
  BarChart3,
  ArrowUpDown,
  Trash2,
  Copy,
  Scale,
  MapPin,
  FileSpreadsheet,
  Filter,
  Calculator,
  Columns,
  Edit3,
  Hash,
  FunctionSquare,
  Layers,
  ListFilter,
  FileDown,
  Sparkles,
  Users,
  CircleDot,
  // New icons for merged blocks
  GitBranch,
  FileCode,
  Code2,
  BookOpen,
  RefreshCw,
  Server,
  Container,
  Shield,
  Building2,
  type LucideIcon,
} from 'lucide-react';
// Category type for palette grouping
export type ETLCategory = 'source' | 'transform' | 'destination' | 'infrastructure';

// ETL Block definition
export interface ETLBlockDefinition {
  id: string;
  type: string;
  label: string;
  description: string;
  icon: LucideIcon;
  category: ETLCategory;
  color: string;
  bgColor: string;
  borderColor: string;
  hasInput: boolean;
  hasOutput: boolean;
  minInputs: number;
  maxInputs: number;
  tooltip?: string;
}

// All ETL blocks aligned with new backend component templates
export const ETL_BLOCKS: ETLBlockDefinition[] = [
  // ============================================
  // SOURCE BLOCKS
  // ============================================
  {
    id: 'source',
    type: 'source',
    label: 'Source',
    description: 'Read data from Snowflake table',
    icon: Database,
    category: 'source',
    color: 'text-green-600',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    borderColor: 'border-green-400',
    hasInput: false,
    hasOutput: true,
    minInputs: 0,
    maxInputs: 0,
    tooltip: 'Read data from a Snowflake table',
  },
  {
    id: 'org_usage_source',
    type: 'org_usage_source',
    label: 'Org Usage',
    description: 'Read from ORGANIZATION_USAGE views (cross-account costs, storage, compute)',
    icon: Building2,
    category: 'source',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
    borderColor: 'border-indigo-400',
    hasInput: false,
    hasOutput: true,
    minInputs: 0,
    maxInputs: 0,
    tooltip: 'Read cross-account usage data from SNOWFLAKE.ORGANIZATION_USAGE (credits, storage, warehouse metering, data transfer)',
  },
  {
    id: 'audit_source',
    type: 'audit_source',
    label: 'Audit Source',
    description: 'Read from ACCOUNT_USAGE audit views (queries, access, logins)',
    icon: Shield,
    category: 'source',
    color: 'text-rose-600',
    bgColor: 'bg-rose-50 dark:bg-rose-900/20',
    borderColor: 'border-rose-400',
    hasInput: false,
    hasOutput: true,
    minInputs: 0,
    maxInputs: 0,
    tooltip: 'Read audit data from SNOWFLAKE.ACCOUNT_USAGE (QUERY_HISTORY, ACCESS_HISTORY, LOGIN_HISTORY)',
  },

  // ============================================
  // TRANSFORM BLOCKS
  // ============================================
  {
    id: 'join',
    type: 'join',
    label: 'Join',
    description: 'Join two data sources',
    icon: GitMerge,
    category: 'transform',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    borderColor: 'border-amber-400',
    hasInput: true,
    hasOutput: true,
    minInputs: 2,
    maxInputs: 2,
    tooltip: 'Join two data sources on matching keys (INNER, LEFT, RIGHT, FULL, CROSS)',
  },
  {
    id: 'filter',
    type: 'filter',
    label: 'Filter',
    description: 'Filter rows by conditions',
    icon: Filter,
    category: 'transform',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    borderColor: 'border-orange-400',
    hasInput: true,
    hasOutput: true,
    minInputs: 1,
    maxInputs: 1,
    tooltip: 'Filter rows based on column conditions (WHERE clause)',
  },
  {
    id: 'aggregate',
    type: 'aggregate',
    label: 'Aggregate',
    description: 'GROUP BY + aggregations',
    icon: BarChart3,
    category: 'transform',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    borderColor: 'border-purple-400',
    hasInput: true,
    hasOutput: true,
    minInputs: 1,
    maxInputs: 1,
    tooltip: 'Group data and calculate aggregations (SUM, AVG, COUNT, MIN, MAX)',
  },
  {
    id: 'select',
    type: 'select',
    label: 'Select',
    description: 'Select specific columns',
    icon: Columns,
    category: 'transform',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-400',
    hasInput: true,
    hasOutput: true,
    minInputs: 1,
    maxInputs: 1,
    tooltip: 'Select specific columns to include in output',
  },
  {
    id: 'rename',
    type: 'rename',
    label: 'Rename',
    description: 'Rename columns',
    icon: Edit3,
    category: 'transform',
    color: 'text-teal-600',
    bgColor: 'bg-teal-50 dark:bg-teal-900/20',
    borderColor: 'border-teal-400',
    hasInput: true,
    hasOutput: true,
    minInputs: 1,
    maxInputs: 1,
    tooltip: 'Rename one or more columns',
  },
  {
    id: 'cast',
    type: 'cast',
    label: 'Cast',
    description: 'Cast column types',
    icon: Hash,
    category: 'transform',
    color: 'text-rose-600',
    bgColor: 'bg-rose-50 dark:bg-rose-900/20',
    borderColor: 'border-rose-400',
    hasInput: true,
    hasOutput: true,
    minInputs: 1,
    maxInputs: 1,
    tooltip: 'Cast column data types (e.g., STRING to DATE)',
  },
  {
    id: 'formula',
    type: 'formula',
    label: 'Formula',
    description: 'Add calculated columns',
    icon: FunctionSquare,
    category: 'transform',
    color: 'text-violet-600',
    bgColor: 'bg-violet-50 dark:bg-violet-900/20',
    borderColor: 'border-violet-400',
    hasInput: true,
    hasOutput: true,
    minInputs: 1,
    maxInputs: 1,
    tooltip: 'Add new columns with calculated expressions',
  },
  {
    id: 'sort',
    type: 'sort',
    label: 'Sort',
    description: 'Order by columns',
    icon: ArrowUpDown,
    category: 'transform',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
    borderColor: 'border-indigo-400',
    hasInput: true,
    hasOutput: true,
    minInputs: 1,
    maxInputs: 1,
    tooltip: 'Sort data by one or more columns (ORDER BY)',
  },
  {
    id: 'union',
    type: 'union',
    label: 'Union',
    description: 'Combine multiple datasets',
    icon: Layers,
    category: 'transform',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50 dark:bg-cyan-900/20',
    borderColor: 'border-cyan-400',
    hasInput: true,
    hasOutput: true,
    minInputs: 2,
    maxInputs: 10, // Support multiple inputs
    tooltip: 'Combine multiple datasets vertically (UNION / UNION ALL)',
  },
  {
    id: 'distinct',
    type: 'distinct',
    label: 'Distinct',
    description: 'Remove duplicate rows',
    icon: Copy,
    category: 'transform',
    color: 'text-pink-600',
    bgColor: 'bg-pink-50 dark:bg-pink-900/20',
    borderColor: 'border-pink-400',
    hasInput: true,
    hasOutput: true,
    minInputs: 1,
    maxInputs: 1,
    tooltip: 'Remove duplicate rows (SELECT DISTINCT)',
  },
  {
    id: 'limit',
    type: 'limit',
    label: 'Limit',
    description: 'Limit number of rows',
    icon: ListFilter,
    category: 'transform',
    color: 'text-slate-600',
    bgColor: 'bg-slate-50 dark:bg-slate-900/20',
    borderColor: 'border-slate-400',
    hasInput: true,
    hasOutput: true,
    minInputs: 1,
    maxInputs: 1,
    tooltip: 'Limit the number of output rows (LIMIT)',
  },

  // ============================================
  // ML / AI DEFAULT CAPABILITIES (Recommendation, Segmentation, Clustering)
  // ============================================
  {
    id: 'recommendation',
    type: 'recommendation',
    label: 'Recommendation',
    description: 'Score or rank items (Cortex LLM or custom model)',
    icon: Sparkles,
    category: 'transform',
    color: 'text-fuchsia-600',
    bgColor: 'bg-fuchsia-50 dark:bg-fuchsia-900/20',
    borderColor: 'border-fuchsia-400',
    hasInput: true,
    hasOutput: true,
    minInputs: 1,
    maxInputs: 1,
    tooltip: 'Add recommendation scores using Cortex or custom model; output scored/ranked data',
  },
  {
    id: 'segmentation',
    type: 'segmentation',
    label: 'Segmentation',
    description: 'Assign segments (RFM, rules, or model)',
    icon: Users,
    category: 'transform',
    color: 'text-lime-600',
    bgColor: 'bg-lime-50 dark:bg-lime-900/20',
    borderColor: 'border-lime-400',
    hasInput: true,
    hasOutput: true,
    minInputs: 1,
    maxInputs: 1,
    tooltip: 'Segment data by rules, RFM, or ML model; add segment column',
  },
  {
    id: 'clustering',
    type: 'clustering',
    label: 'Clustering',
    description: 'Assign clusters (Cortex ML or k-means)',
    icon: CircleDot,
    category: 'transform',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    borderColor: 'border-amber-400',
    hasInput: true,
    hasOutput: true,
    minInputs: 1,
    maxInputs: 1,
    tooltip: 'Cluster data using Cortex ML or SQL k-means; add cluster_id column',
  },

  // ============================================
  // DESTINATION BLOCKS
  // ============================================
  {
    id: 'destination',
    type: 'destination',
    label: 'Destination',
    description: 'Write to Snowflake table',
    icon: MapPin,
    category: 'destination',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    borderColor: 'border-emerald-400',
    hasInput: true,
    hasOutput: false,
    minInputs: 1,
    maxInputs: 1,
    tooltip: 'Write data to a target Snowflake table (overwrite, append, or merge)',
  },
  {
    id: 'export_file',
    type: 'export_file',
    label: 'Export File',
    description: 'Export to file',
    icon: FileDown,
    category: 'destination',
    color: 'text-sky-600',
    bgColor: 'bg-sky-50 dark:bg-sky-900/20',
    borderColor: 'border-sky-400',
    hasInput: true,
    hasOutput: false,
    minInputs: 1,
    maxInputs: 1,
    tooltip: 'Export data to CSV, Parquet, or JSON file',
  },

  // ============================================
  // SOURCE BLOCKS (merged from data-engineering & developer)
  // ============================================
  {
    id: 'stream_consume',
    type: 'stream_consume',
    label: 'Create Stream',
    description: 'Create & consume CDC stream on table/view',
    icon: GitBranch,
    category: 'source',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50 dark:bg-cyan-900/20',
    borderColor: 'border-cyan-400',
    hasInput: false,
    hasOutput: true,
    minInputs: 0,
    maxInputs: 0,
    tooltip: 'Create a Snowflake Stream on a table or view to capture change data (CDC). The stream tracks INSERT, UPDATE, DELETE changes.',
  },
  {
    id: 'git_file',
    type: 'git_file',
    label: 'Git File',
    description: 'Read file from Git repo',
    icon: FileCode,
    category: 'source',
    color: 'text-slate-600',
    bgColor: 'bg-slate-50 dark:bg-slate-900/20',
    borderColor: 'border-slate-400',
    hasInput: false,
    hasOutput: true,
    minInputs: 0,
    maxInputs: 0,
    tooltip: 'Read a file from a Snowflake Git repository',
  },

  // ============================================
  // TRANSFORM BLOCKS (code runner)
  // ============================================
  {
    id: 'sql_script',
    type: 'sql_script',
    label: 'SQL Script',
    description: 'Run custom SQL',
    icon: Code2,
    category: 'transform',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-400',
    hasInput: true,
    hasOutput: true,
    minInputs: 0,
    maxInputs: 4,
    tooltip: 'Execute custom SQL with inline editor and test button. Results are previewed (limited to 10 rows).',
  },
  {
    id: 'python_script',
    type: 'python_script',
    label: 'Python Script',
    description: 'Run Snowpark Python',
    icon: Hash,
    category: 'transform',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-50 dark:bg-yellow-900/20',
    borderColor: 'border-yellow-400',
    hasInput: true,
    hasOutput: true,
    minInputs: 0,
    maxInputs: 4,
    tooltip: 'Execute Snowpark Python — call an existing stored procedure or write inline code. Supports testing with live output.',
  },
  {
    id: 'notebook_run',
    type: 'notebook_run',
    label: 'Run Notebook',
    description: 'Execute Snowflake notebook',
    icon: BookOpen,
    category: 'transform',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    borderColor: 'border-orange-400',
    hasInput: true,
    hasOutput: true,
    minInputs: 0,
    maxInputs: 1,
    tooltip: 'Execute a Snowflake Notebook and capture output',
  },

  // ============================================
  // DESTINATION BLOCKS (data engineering)
  // ============================================
  {
    id: 'dynamic_table',
    type: 'dynamic_table',
    label: 'Dynamic Table',
    description: 'Auto-refreshing materialized table',
    icon: RefreshCw,
    category: 'destination',
    color: 'text-teal-600',
    bgColor: 'bg-teal-50 dark:bg-teal-900/20',
    borderColor: 'border-teal-400',
    hasInput: true,
    hasOutput: false,
    minInputs: 1,
    maxInputs: 1,
    tooltip: 'Create a Snowflake Dynamic Table that auto-refreshes based on TARGET_LAG. Requires a warehouse and a SELECT query as the table definition.',
  },

  // ============================================
  // INFRASTRUCTURE BLOCKS (developer tools)
  // ============================================
  {
    id: 'compute_pool',
    type: 'compute_pool',
    label: 'Compute Pool',
    description: 'Provision compute',
    icon: Server,
    category: 'infrastructure',
    color: 'text-violet-600',
    bgColor: 'bg-violet-50 dark:bg-violet-900/20',
    borderColor: 'border-violet-400',
    hasInput: false,
    hasOutput: true,
    minInputs: 0,
    maxInputs: 0,
    tooltip: 'Provision a compute pool for container workloads',
  },
  {
    id: 'container_service',
    type: 'container_service',
    label: 'Container Service',
    description: 'Run containerized job',
    icon: Container,
    category: 'infrastructure',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
    borderColor: 'border-indigo-400',
    hasInput: true,
    hasOutput: true,
    minInputs: 0,
    maxInputs: 1,
    tooltip: 'Run a containerized service in Snowpark Container Services',
  },
];

// Get blocks by category
export const getBlocksByCategory = (category: ETLCategory): ETLBlockDefinition[] => {
  return ETL_BLOCKS.filter((block) => block.category === category);
};

// Get block by type
export const getBlockByType = (type: string): ETLBlockDefinition | undefined => {
  return ETL_BLOCKS.find((block) => block.type === type);
};

// Category labels
export const CATEGORY_LABELS: Record<ETLCategory, string> = {
  source: 'Data Sources',
  transform: 'Transformations',
  destination: 'Destinations',
  infrastructure: 'Infrastructure',
};

// Category icons
export const CATEGORY_ICONS: Record<ETLCategory, LucideIcon> = {
  source: Database,
  transform: Calculator,
  destination: MapPin,
  infrastructure: Server,
};

// ============================================
// LEGACY MAPPINGS (for backward compatibility)
// ============================================

// Map old node types to new types
export const LEGACY_TYPE_MAP: Record<string, string> = {
  src: 'source',
  join_tables: 'join',
  aggregate_kpi: 'aggregate',
  drop_nulls: 'filter',
  drop_duplicates: 'distinct',
  normalize: 'formula', // Can be implemented as formula
  export_excel: 'export_file',
};

// Convert legacy node type to new type
export function convertLegacyType(legacyType: string): string {
  return LEGACY_TYPE_MAP[legacyType] || legacyType;
}
