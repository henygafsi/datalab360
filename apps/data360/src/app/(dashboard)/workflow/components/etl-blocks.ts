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
  type LucideIcon,
} from 'lucide-react';

// ETL Block category types
export type ETLCategory = 'source' | 'transform' | 'destination';

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
  inputCount?: number; // For blocks like Join that have multiple inputs
  tooltip?: string;
}

// All ETL blocks with consistent Lucide icons
export const ETL_BLOCKS: ETLBlockDefinition[] = [
  // Source blocks
  {
    id: 'src',
    type: 'src',
    label: 'Source',
    description: 'Extract data from database',
    icon: Database,
    category: 'source',
    color: 'text-blue-600',
    bgColor: 'bg-blue-50 dark:bg-blue-900/20',
    borderColor: 'border-blue-400',
    hasInput: false,
    hasOutput: true,
    tooltip: 'Input data source (e.g., database table)',
  },

  // Transform blocks
  {
    id: 'join',
    type: 'join',
    label: 'Join',
    description: 'Combine two datasets',
    icon: GitMerge,
    category: 'transform',
    color: 'text-amber-600',
    bgColor: 'bg-amber-50 dark:bg-amber-900/20',
    borderColor: 'border-amber-400',
    hasInput: true,
    hasOutput: true,
    inputCount: 2,
    tooltip: 'Join two data sources on matching keys',
  },
  {
    id: 'aggregate_kpi',
    type: 'aggregate_kpi',
    label: 'Aggregate',
    description: 'Calculate KPIs',
    icon: BarChart3,
    category: 'transform',
    color: 'text-purple-600',
    bgColor: 'bg-purple-50 dark:bg-purple-900/20',
    borderColor: 'border-purple-400',
    hasInput: true,
    hasOutput: true,
    tooltip: 'Aggregate data with SUM, AVG, COUNT, MIN, MAX',
  },
  {
    id: 'sort',
    type: 'sort',
    label: 'Sort',
    description: 'Order data by column',
    icon: ArrowUpDown,
    category: 'transform',
    color: 'text-indigo-600',
    bgColor: 'bg-indigo-50 dark:bg-indigo-900/20',
    borderColor: 'border-indigo-400',
    hasInput: true,
    hasOutput: true,
    tooltip: 'Sort dataset by column (ASC/DESC)',
  },
  {
    id: 'drop_nulls',
    type: 'drop_nulls',
    label: 'Drop Nulls',
    description: 'Remove null values',
    icon: Filter,
    category: 'transform',
    color: 'text-orange-600',
    bgColor: 'bg-orange-50 dark:bg-orange-900/20',
    borderColor: 'border-orange-400',
    hasInput: true,
    hasOutput: true,
    tooltip: 'Remove rows with null values in specified column',
  },
  {
    id: 'drop_duplicates',
    type: 'drop_duplicates',
    label: 'Deduplicate',
    description: 'Remove duplicate rows',
    icon: Copy,
    category: 'transform',
    color: 'text-pink-600',
    bgColor: 'bg-pink-50 dark:bg-pink-900/20',
    borderColor: 'border-pink-400',
    hasInput: true,
    hasOutput: true,
    tooltip: 'Remove duplicate rows based on columns',
  },
  {
    id: 'normalize',
    type: 'normalize',
    label: 'Normalize',
    description: 'Scale numeric values',
    icon: Scale,
    category: 'transform',
    color: 'text-cyan-600',
    bgColor: 'bg-cyan-50 dark:bg-cyan-900/20',
    borderColor: 'border-cyan-400',
    hasInput: true,
    hasOutput: true,
    tooltip: 'Normalize values using Z-Score or Min-Max scaling',
  },

  // Destination blocks
  {
    id: 'destination',
    type: 'destination',
    label: 'Destination',
    description: 'Load to database',
    icon: MapPin,
    category: 'destination',
    color: 'text-green-600',
    bgColor: 'bg-green-50 dark:bg-green-900/20',
    borderColor: 'border-green-400',
    hasInput: true,
    hasOutput: false,
    tooltip: 'Load data to target database table',
  },
  {
    id: 'export_excel',
    type: 'export_excel',
    label: 'Export Excel',
    description: 'Export to spreadsheet',
    icon: FileSpreadsheet,
    category: 'destination',
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50 dark:bg-emerald-900/20',
    borderColor: 'border-emerald-400',
    hasInput: true,
    hasOutput: false,
    tooltip: 'Export data to Excel file',
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
};

// Category icons
export const CATEGORY_ICONS: Record<ETLCategory, LucideIcon> = {
  source: Database,
  transform: Calculator,
  destination: MapPin,
};
