'use client';

import React, { useState, useCallback } from 'react';
import { Button, Input, Select, Textarea, Badge, Text, Tooltip } from 'rizzui';
import { toast } from 'react-hot-toast';
import {
  Code, Database, FileCode2, Play, X, Plus, Check, AlertTriangle,
  Info, Columns3, RefreshCw, Wand2, Copy, Eye, Trash2
} from 'lucide-react';
import { cn } from '@/lib/utils';
import DesignDockPanel from './DesignDockPanel';
import { TableItem, ColumnInfo } from '../../mapping/components/VirtualizedTableList';
import { useEventStore } from '../stores/event-store';

// Types for computed columns
export type ComputedColumnType = 'sql' | 'python';

export interface ComputedColumn {
  name: string;
  dataType: string;
  computationType: ComputedColumnType;
  expression: string;
  description?: string;
  // For Python UDFs
  pythonHandler?: string;
  pythonPackages?: string[];
}

// SQL expression templates
const SQL_TEMPLATES = [
  {
    name: 'Concatenate Columns',
    template: "CONCAT({col1}, ' ', {col2})",
    description: 'Combine two text columns',
    dataType: 'VARCHAR',
  },
  {
    name: 'Extract Year',
    template: 'YEAR({date_col})',
    description: 'Extract year from date column',
    dataType: 'INTEGER',
  },
  {
    name: 'Case When',
    template: "CASE WHEN {col} > 0 THEN 'Positive' ELSE 'Non-Positive' END",
    description: 'Conditional logic',
    dataType: 'VARCHAR',
  },
  {
    name: 'Hash Column',
    template: 'SHA2({col})',
    description: 'Hash sensitive data',
    dataType: 'VARCHAR',
  },
  {
    name: 'Trim & Upper',
    template: 'UPPER(TRIM({col}))',
    description: 'Clean and standardize text',
    dataType: 'VARCHAR',
  },
  {
    name: 'Null Coalesce',
    template: "COALESCE({col}, 'Default Value')",
    description: 'Replace nulls with default',
    dataType: 'VARCHAR',
  },
  {
    name: 'Date Diff Days',
    template: 'DATEDIFF(day, {start_date}, {end_date})',
    description: 'Days between two dates',
    dataType: 'INTEGER',
  },
  {
    name: 'Masked Email',
    template: "CONCAT(LEFT({email}, 2), '***', SUBSTRING({email}, POSITION('@' IN {email})))",
    description: 'Partially mask email address',
    dataType: 'VARCHAR',
  },
];

// Python UDF templates
const PYTHON_TEMPLATES = [
  {
    name: 'Sentiment Analysis',
    template: `def analyze_sentiment(text):
    from textblob import TextBlob
    if text is None:
        return 0.0
    blob = TextBlob(text)
    return blob.sentiment.polarity`,
    description: 'Analyze text sentiment (-1 to 1)',
    dataType: 'FLOAT',
    handler: 'analyze_sentiment',
    packages: ['textblob'],
  },
  {
    name: 'Email Domain Extract',
    template: `def extract_domain(email):
    if email is None or '@' not in email:
        return None
    return email.split('@')[1].lower()`,
    description: 'Extract domain from email',
    dataType: 'VARCHAR',
    handler: 'extract_domain',
    packages: [],
  },
  {
    name: 'Phone Formatter',
    template: `import re
def format_phone(phone):
    if phone is None:
        return None
    digits = re.sub(r'\\D', '', phone)
    if len(digits) == 10:
        return f"({digits[:3]}) {digits[3:6]}-{digits[6:]}"
    return phone`,
    description: 'Format phone number consistently',
    dataType: 'VARCHAR',
    handler: 'format_phone',
    packages: [],
  },
  {
    name: 'JSON Value Extract',
    template: `import json
def extract_json_field(json_str, field):
    if json_str is None:
        return None
    try:
        data = json.loads(json_str)
        return data.get(field)
    except:
        return None`,
    description: 'Extract field from JSON string',
    dataType: 'VARCHAR',
    handler: 'extract_json_field',
    packages: [],
  },
  {
    name: 'Custom Hash',
    template: `import hashlib
def custom_hash(value, salt='secret'):
    if value is None:
        return None
    combined = f"{salt}:{value}"
    return hashlib.sha256(combined.encode()).hexdigest()[:16]`,
    description: 'Custom salted hash function',
    dataType: 'VARCHAR',
    handler: 'custom_hash',
    packages: [],
  },
];

// Snowflake data types for computed columns
const DATA_TYPES = [
  { value: 'VARCHAR', label: 'VARCHAR (Text)' },
  { value: 'INTEGER', label: 'INTEGER' },
  { value: 'FLOAT', label: 'FLOAT' },
  { value: 'NUMBER', label: 'NUMBER' },
  { value: 'BOOLEAN', label: 'BOOLEAN' },
  { value: 'DATE', label: 'DATE' },
  { value: 'TIMESTAMP', label: 'TIMESTAMP' },
  { value: 'VARIANT', label: 'VARIANT (JSON)' },
  { value: 'ARRAY', label: 'ARRAY' },
  { value: 'OBJECT', label: 'OBJECT' },
];

interface AddColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  table: TableItem;
  columns: ColumnInfo[];
  onColumnAdd: (column: ComputedColumn) => void;
  projectId?: string | null;
}

const AddColumnModal: React.FC<AddColumnModalProps> = ({
  isOpen,
  onClose,
  table,
  columns,
  onColumnAdd,
  projectId,
}) => {
  const { addEvent } = useEventStore();

  // State
  const [computationType, setComputationType] = useState<ComputedColumnType>('sql');
  const [columnName, setColumnName] = useState('');
  const [dataType, setDataType] = useState('VARCHAR');
  const [expression, setExpression] = useState('');
  const [description, setDescription] = useState('');
  const [pythonHandler, setPythonHandler] = useState('');
  const [pythonPackages, setPythonPackages] = useState<string[]>([]);
  const [newPackage, setNewPackage] = useState('');

  // Reset form
  const resetForm = useCallback(() => {
    setColumnName('');
    setDataType('VARCHAR');
    setExpression('');
    setDescription('');
    setPythonHandler('');
    setPythonPackages([]);
    setNewPackage('');
  }, []);

  // Apply template
  const applyTemplate = useCallback((template: typeof SQL_TEMPLATES[0] | typeof PYTHON_TEMPLATES[0]) => {
    setExpression(template.template);
    setDataType(template.dataType);
    setDescription(template.description);
    if ('handler' in template) {
      setPythonHandler(template.handler);
      setPythonPackages(template.packages);
    }
  }, []);

  // Add package
  const addPackage = useCallback(() => {
    if (newPackage.trim() && !pythonPackages.includes(newPackage.trim())) {
      setPythonPackages([...pythonPackages, newPackage.trim()]);
      setNewPackage('');
    }
  }, [newPackage, pythonPackages]);

  // Remove package
  const removePackage = useCallback((pkg: string) => {
    setPythonPackages(pythonPackages.filter(p => p !== pkg));
  }, [pythonPackages]);

  // Insert column reference
  const insertColumnRef = useCallback((colName: string) => {
    setExpression(prev => prev + colName);
  }, []);

  // Handle submit
  const handleSubmit = useCallback(() => {
    // Validation
    if (!columnName.trim()) {
      toast.error('Please enter a column name');
      return;
    }

    if (!expression.trim()) {
      toast.error('Please enter an expression');
      return;
    }

    // Check for duplicate column names
    if (columns.some(c => c.name.toLowerCase() === columnName.trim().toLowerCase())) {
      toast.error('A column with this name already exists');
      return;
    }

    // Validate column name format
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(columnName.trim())) {
      toast.error('Column name must start with a letter or underscore and contain only alphanumeric characters');
      return;
    }

    const computedColumn: ComputedColumn = {
      name: columnName.trim().toUpperCase(),
      dataType,
      computationType,
      expression: expression.trim(),
      description: description.trim() || undefined,
      pythonHandler: computationType === 'python' ? pythonHandler : undefined,
      pythonPackages: computationType === 'python' && pythonPackages.length > 0 ? pythonPackages : undefined,
    };

    // Create event for the design change
    const eventData = {
      type: 'ADD_COLUMN' as const,
      projectId: projectId || undefined,
      target: {
        database: table.database,
        schema: table.schema,
        table: table.table,
        column: computedColumn.name,
      },
      payload: {
        columnName: computedColumn.name,
        columnType: computedColumn.dataType,
        isComputed: true,
        computedExpression: computedColumn.expression,
        computationType,
        description: computedColumn.description,
        column: computedColumn,
      },
    };

    addEvent(eventData);
    onColumnAdd(computedColumn);
    toast.success(`Computed column "${computedColumn.name}" added`);
    resetForm();
    onClose();
  }, [
    columnName, dataType, computationType, expression, description,
    pythonHandler, pythonPackages, columns, table, addEvent, onColumnAdd, resetForm, onClose
  ]);

  return (
    <DesignDockPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Add Computed Column"
      subtitle={`${table.database}.${table.schema}.${table.table}`}
      icon={
        <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
          <Plus className="h-5 w-5 text-blue-600" />
        </div>
      }
      widthClass="max-w-xl"
      footer={
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-4 w-4" />
            <Text className="text-sm">Column will be created during deployment</Text>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Column
            </Button>
          </div>
        </div>
      }
    >
      <div>
        {/* Content */}
        <div>
          <div className="grid grid-cols-3 gap-6">
            {/* Left side - Form */}
            <div className="col-span-2 space-y-5">
              {/* Computation type selector */}
              <div>
                <Text className="text-sm font-medium mb-2">Computation Type</Text>
                <div className="flex gap-2">
                  <button
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border-2 transition-all',
                      computationType === 'sql'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    )}
                    onClick={() => setComputationType('sql')}
                  >
                    <Database className="h-5 w-5" />
                    <span className="font-medium">SQL Expression</span>
                  </button>
                  <button
                    className={cn(
                      'flex-1 flex items-center justify-center gap-2 py-3 rounded-lg border-2 transition-all',
                      computationType === 'python'
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300'
                        : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                    )}
                    onClick={() => setComputationType('python')}
                  >
                    <FileCode2 className="h-5 w-5" />
                    <span className="font-medium">Python UDF</span>
                  </button>
                </div>
              </div>

              {/* Column name and data type */}
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Column Name"
                  value={columnName}
                  onChange={(e) => setColumnName(e.target.value.toUpperCase())}
                  placeholder="NEW_COLUMN_NAME"
                />
                <Select
                  label="Return Data Type"
                  options={DATA_TYPES}
                  value={dataType}
                  onChange={(val: any) => setDataType(typeof val === 'object' ? val?.value : val)}
                />
              </div>

              {/* Expression/Code editor */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Text className="text-sm font-medium">
                    {computationType === 'sql' ? 'SQL Expression' : 'Python Function'}
                  </Text>
                  <div className="flex items-center gap-2">
                    <Tooltip content="Copy to clipboard">
                      <button
                        className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded"
                        onClick={() => {
                          navigator.clipboard.writeText(expression);
                          toast.success('Copied to clipboard');
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </button>
                    </Tooltip>
                  </div>
                </div>
                <Textarea
                  value={expression}
                  onChange={(e) => setExpression(e.target.value)}
                  placeholder={computationType === 'sql'
                    ? "e.g., CONCAT(first_name, ' ', last_name)"
                    : "def my_function(value):\n    return transformed_value"
                  }
                  rows={8}
                  className="font-mono text-sm"
                />
              </div>

              {/* Python-specific fields */}
              {computationType === 'python' && (
                <>
                  <Input
                    label="Handler Function Name"
                    value={pythonHandler}
                    onChange={(e) => setPythonHandler(e.target.value)}
                    placeholder="e.g., my_function"
                  />

                  <div>
                    <Text className="text-sm font-medium mb-2">Python Packages</Text>
                    <div className="flex gap-2 mb-2">
                      <Input
                        value={newPackage}
                        onChange={(e) => setNewPackage(e.target.value)}
                        placeholder="Package name (e.g., pandas)"
                        className="flex-1"
                        onKeyDown={(e) => e.key === 'Enter' && addPackage()}
                      />
                      <Button variant="outline" onClick={addPackage}>
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {pythonPackages.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {pythonPackages.map(pkg => (
                          <Badge
                            key={pkg}
                            className="flex items-center gap-1 bg-green-100 text-green-700 dark:bg-green-900/30"
                          >
                            {pkg}
                            <button onClick={() => removePackage(pkg)}>
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Description */}
              <Input
                label="Description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What does this computed column do?"
              />
            </div>

            {/* Right side - Templates & Column list */}
            <div className="space-y-4">
              {/* Available columns */}
              <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
                <Text className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                  Available Columns
                </Text>
                <div className="max-h-32 overflow-auto space-y-1">
                  {columns.map(col => (
                    <button
                      key={col.name}
                      className="w-full flex items-center justify-between px-2 py-1 text-xs rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-left"
                      onClick={() => insertColumnRef(col.name)}
                    >
                      <span className="font-mono">{col.name}</span>
                      <span className="text-slate-400">{(col.dataType || 'unknown').split('(')[0]}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Templates */}
              <div>
                <Text className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                  Quick Templates
                </Text>
                <div className="space-y-1 max-h-[300px] overflow-auto">
                  {(computationType === 'sql' ? SQL_TEMPLATES : PYTHON_TEMPLATES).map(template => (
                    <button
                      key={template.name}
                      className="w-full p-2 text-left rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      onClick={() => applyTemplate(template)}
                    >
                      <div className="flex items-center gap-2">
                        <Wand2 className="h-3 w-3 text-purple-500" />
                        <span className="text-sm font-medium">{template.name}</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">{template.description}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DesignDockPanel>
  );
};

export default AddColumnModal;
