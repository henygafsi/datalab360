'use client';

import React, { useState, useMemo } from 'react';
import { Modal, Button, Badge, Input, Text, Tooltip, Select } from 'rizzui';
import { X, ArrowRight, Plus, Trash2, Search, Check, Link2, AlertTriangle, Wand2 } from 'lucide-react';
import { cn } from '@/lib/utils';
// Column transformation type (previously from old explore-design service)
type ColumnTransformation =
  | null
  | 'CONCAT'
  | 'CONCAT_WS'
  | 'COALESCE'
  | 'UPPER'
  | 'LOWER'
  | 'TRIM'
  | 'SUM';

interface Column {
  name: string;
  dataType: string;
  isPrimaryKey?: boolean;
  isNullable?: boolean;
}

// Data type compatibility matrix
const TYPE_COMPATIBILITY: Record<string, string[]> = {
  // Exact matches
  'VARCHAR': ['VARCHAR', 'TEXT', 'STRING', 'CHAR'],
  'TEXT': ['VARCHAR', 'TEXT', 'STRING', 'CHAR'],
  'STRING': ['VARCHAR', 'TEXT', 'STRING', 'CHAR'],
  'CHAR': ['VARCHAR', 'TEXT', 'STRING', 'CHAR'],
  'NUMBER': ['NUMBER', 'INTEGER', 'INT', 'BIGINT', 'SMALLINT', 'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE'],
  'INTEGER': ['NUMBER', 'INTEGER', 'INT', 'BIGINT', 'SMALLINT', 'DECIMAL', 'NUMERIC'],
  'INT': ['NUMBER', 'INTEGER', 'INT', 'BIGINT', 'SMALLINT', 'DECIMAL', 'NUMERIC'],
  'BIGINT': ['NUMBER', 'INTEGER', 'INT', 'BIGINT', 'DECIMAL', 'NUMERIC'],
  'SMALLINT': ['NUMBER', 'INTEGER', 'INT', 'BIGINT', 'SMALLINT', 'DECIMAL', 'NUMERIC'],
  'DECIMAL': ['NUMBER', 'INTEGER', 'INT', 'BIGINT', 'SMALLINT', 'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE'],
  'NUMERIC': ['NUMBER', 'INTEGER', 'INT', 'BIGINT', 'SMALLINT', 'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE'],
  'FLOAT': ['NUMBER', 'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE'],
  'DOUBLE': ['NUMBER', 'DECIMAL', 'NUMERIC', 'FLOAT', 'DOUBLE'],
  'BOOLEAN': ['BOOLEAN', 'BOOL'],
  'BOOL': ['BOOLEAN', 'BOOL'],
  'DATE': ['DATE', 'TIMESTAMP', 'TIMESTAMP_NTZ', 'TIMESTAMP_LTZ', 'TIMESTAMP_TZ'],
  'TIMESTAMP': ['TIMESTAMP', 'TIMESTAMP_NTZ', 'TIMESTAMP_LTZ', 'TIMESTAMP_TZ', 'DATE'],
  'TIMESTAMP_NTZ': ['TIMESTAMP', 'TIMESTAMP_NTZ', 'TIMESTAMP_LTZ', 'TIMESTAMP_TZ'],
  'TIMESTAMP_LTZ': ['TIMESTAMP', 'TIMESTAMP_NTZ', 'TIMESTAMP_LTZ', 'TIMESTAMP_TZ'],
  'TIMESTAMP_TZ': ['TIMESTAMP', 'TIMESTAMP_NTZ', 'TIMESTAMP_LTZ', 'TIMESTAMP_TZ'],
  'TIME': ['TIME'],
  'VARIANT': ['VARIANT', 'OBJECT', 'ARRAY'],
  'OBJECT': ['VARIANT', 'OBJECT'],
  'ARRAY': ['VARIANT', 'ARRAY'],
  'BINARY': ['BINARY', 'VARBINARY'],
  'VARBINARY': ['BINARY', 'VARBINARY'],
};

// Transformation options for column mappings
const TRANSFORMATION_OPTIONS = [
  { value: '', label: 'No Transformation' },
  { value: 'CONCAT', label: 'CONCAT - Concatenate columns' },
  { value: 'CONCAT_WS', label: 'CONCAT_WS - Concatenate with separator' },
  { value: 'COALESCE', label: 'COALESCE - First non-null value' },
  { value: 'UPPER', label: 'UPPER - Convert to uppercase' },
  { value: 'LOWER', label: 'LOWER - Convert to lowercase' },
  { value: 'TRIM', label: 'TRIM - Remove whitespace' },
  { value: 'SUM', label: 'SUM - Sum numeric values' },
];

// Check if two data types are compatible
const checkTypeCompatibility = (sourceType: string, targetType: string): { compatible: boolean; warning?: string } => {
  // Normalize types (remove size info like VARCHAR(255) -> VARCHAR)
  const normalizeType = (t: string) => t.toUpperCase().split('(')[0].trim();
  const src = normalizeType(sourceType);
  const tgt = normalizeType(targetType);

  // Same type is always compatible
  if (src === tgt) return { compatible: true };

  // Check compatibility matrix
  const compatibleTypes = TYPE_COMPATIBILITY[src] || [];
  if (compatibleTypes.includes(tgt)) {
    // Compatible but might need attention
    if ((src.includes('INT') || src === 'NUMBER') && (tgt === 'FLOAT' || tgt === 'DOUBLE')) {
      return { compatible: true, warning: 'Integer to float conversion - possible precision change' };
    }
    if (src === 'DATE' && tgt.includes('TIMESTAMP')) {
      return { compatible: true, warning: 'Date to timestamp - time will be 00:00:00' };
    }
    return { compatible: true };
  }

  // Incompatible types
  return {
    compatible: false,
    warning: `Incompatible types: ${src} → ${tgt}. May require transformation.`
  };
};

interface TableInfo {
  id: string;
  database: string;
  schema: string;
  table: string;
}

// A single mapping: multiple source columns → one target column
interface ColumnMapping {
  id: string;
  sourceColumns: string[];
  targetColumn: string;
  transformation?: ColumnTransformation;
}

interface ColumnMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceTable: TableInfo | null;
  targetTable: TableInfo | null;
  sourceColumns: Column[];
  targetColumns: Column[];
  onCreateMapping: (sourceColumns: string[], targetColumn: string, transformation?: ColumnTransformation) => void;
  existingMappings?: ColumnMapping[];
  onRemoveMapping?: (mappingId: string) => void;
  /**
   * Empty-target support: when the target table has no columns yet (e.g. an
   * "Empty table" added from the canvas), this lets the user inherit columns
   * from the source so the table can actually be fed. Each returned column
   * becomes a new target column; the caller also wires the 1:1 mapping.
   */
  onCreateTargetColumns?: (cols: { name: string; dataType: string }[]) => void;
}

const ColumnMappingModal: React.FC<ColumnMappingModalProps> = ({
  isOpen,
  onClose,
  sourceTable,
  targetTable,
  sourceColumns,
  targetColumns,
  onCreateMapping,
  existingMappings = [],
  onRemoveMapping,
  onCreateTargetColumns,
}) => {
  const [selectedSourceColumns, setSelectedSourceColumns] = useState<string[]>([]);
  const [selectedTargetColumn, setSelectedTargetColumn] = useState<string | null>(null);
  const [selectedTransformation, setSelectedTransformation] = useState<ColumnTransformation>(null);
  const [sourceSearch, setSourceSearch] = useState('');
  const [targetSearch, setTargetSearch] = useState('');

  // Local mappings created in this session (before closing modal)
  const [localMappings, setLocalMappings] = useState<ColumnMapping[]>([]);

  // Filter columns based on search
  const filteredSourceColumns = useMemo(() => {
    if (!sourceSearch) return sourceColumns;
    return sourceColumns.filter(col =>
      col.name.toLowerCase().includes(sourceSearch.toLowerCase())
    );
  }, [sourceColumns, sourceSearch]);

  const filteredTargetColumns = useMemo(() => {
    if (!targetSearch) return targetColumns;
    return targetColumns.filter(col =>
      col.name.toLowerCase().includes(targetSearch.toLowerCase())
    );
  }, [targetColumns, targetSearch]);

  // Get all mappings (existing + local)
  const allMappings = useMemo(() => {
    return [...existingMappings, ...localMappings];
  }, [existingMappings, localMappings]);

  // Get target columns that are already mapped
  const mappedTargetColumns = useMemo(() => {
    return new Set(allMappings.map(m => m.targetColumn));
  }, [allMappings]);

  // Check type compatibility for current selection
  const currentCompatibility = useMemo(() => {
    if (selectedSourceColumns.length === 0 || !selectedTargetColumn) {
      return { hasWarnings: false, hasErrors: false, warnings: [] as string[] };
    }

    const targetCol = targetColumns.find(c => c.name === selectedTargetColumn);
    if (!targetCol) return { hasWarnings: false, hasErrors: false, warnings: [] as string[] };

    const warnings: string[] = [];
    let hasErrors = false;

    selectedSourceColumns.forEach(srcColName => {
      const srcCol = sourceColumns.find(c => c.name === srcColName);
      if (srcCol) {
        const result = checkTypeCompatibility(srcCol.dataType, targetCol.dataType);
        if (!result.compatible) {
          hasErrors = true;
          warnings.push(`${srcColName}: ${result.warning}`);
        } else if (result.warning) {
          warnings.push(`${srcColName}: ${result.warning}`);
        }
      }
    });

    return { hasWarnings: warnings.length > 0, hasErrors, warnings };
  }, [selectedSourceColumns, selectedTargetColumn, sourceColumns, targetColumns]);

  // Empty-target: inherit columns from the source. Uses the user's current
  // source selection if any, otherwise all source columns.
  const handleInheritFromSource = () => {
    if (!onCreateTargetColumns) return;
    const chosen = selectedSourceColumns.length > 0
      ? selectedSourceColumns
      : sourceColumns.map((c) => c.name);
    const cols = chosen.map((name) => {
      const sc = sourceColumns.find((c) => c.name === name);
      return { name, dataType: sc?.dataType || 'VARCHAR' };
    });
    if (cols.length === 0) return;
    onCreateTargetColumns(cols);
    setSelectedSourceColumns([]);
  };

  const handleSourceColumnToggle = (columnName: string) => {
    setSelectedSourceColumns(prev => {
      if (prev.includes(columnName)) {
        return prev.filter(c => c !== columnName);
      }
      return [...prev, columnName];
    });
  };

  const handleTargetColumnSelect = (columnName: string) => {
    // Don't allow selecting already mapped target columns
    if (mappedTargetColumns.has(columnName)) return;
    setSelectedTargetColumn(columnName);
  };

  // Add a mapping to local list
  const handleAddMapping = () => {
    if (selectedSourceColumns.length === 0 || !selectedTargetColumn) return;

    const newMapping: ColumnMapping = {
      id: `mapping-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
      sourceColumns: [...selectedSourceColumns],
      targetColumn: selectedTargetColumn,
      transformation: selectedTransformation || undefined,
    };

    setLocalMappings(prev => [...prev, newMapping]);

    // Reset selection for next mapping
    setSelectedSourceColumns([]);
    setSelectedTargetColumn(null);
    setSelectedTransformation(null);
  };

  // Remove a local mapping
  const handleRemoveLocalMapping = (mappingId: string) => {
    setLocalMappings(prev => prev.filter(m => m.id !== mappingId));
  };

  // Save all mappings and close
  const handleSaveAndClose = () => {
    // Create events for all local mappings
    localMappings.forEach(mapping => {
      onCreateMapping(mapping.sourceColumns, mapping.targetColumn, mapping.transformation);
    });

    // Reset and close
    handleClose();
  };

  const handleClose = () => {
    setSelectedSourceColumns([]);
    setSelectedTargetColumn(null);
    setSelectedTransformation(null);
    setSourceSearch('');
    setTargetSearch('');
    setLocalMappings([]);
    onClose();
  };

  if (!sourceTable || !targetTable) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="xl">
      <div className="p-6 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Text className="text-lg font-semibold">Column Mapping</Text>
            <Text className="text-sm text-slate-500">
              Map multiple source columns to target columns
            </Text>
          </div>
          <button onClick={handleClose} className="p-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Tables Info */}
        <div className="flex items-center gap-4 mb-6 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="flex-1">
            <Text className="text-xs text-slate-500 uppercase">Source Table</Text>
            <Text className="font-medium text-blue-600">{sourceTable.table}</Text>
            <Text className="text-xs text-slate-400">{sourceTable.database}.{sourceTable.schema}</Text>
          </div>
          <ArrowRight className="h-5 w-5 text-slate-400" />
          <div className="flex-1">
            <Text className="text-xs text-slate-500 uppercase">Target Table</Text>
            <Text className="font-medium text-green-600">{targetTable.table}</Text>
            <Text className="text-xs text-slate-400">{targetTable.database}.{targetTable.schema}</Text>
          </div>
        </div>

        {/* Empty-target: inherit schema from source so the table can be fed */}
        {targetColumns.length === 0 && onCreateTargetColumns && (
          <div className="mb-6 rounded-lg border border-teal-200 bg-teal-50 p-3 dark:border-teal-900/40 dark:bg-teal-900/20">
            <Text className="text-sm font-semibold text-teal-800 dark:text-teal-200">
              This target table is empty
            </Text>
            <Text className="mt-0.5 text-xs text-teal-600 dark:text-teal-300">
              Add columns from <span className="font-medium">{sourceTable.table}</span> to start — select source
              columns below (or none for all), then add them. You can map &amp; transform afterwards.
            </Text>
            <Button
              size="sm"
              className="mt-2 gap-1 bg-teal-600 text-white hover:bg-teal-700"
              onClick={handleInheritFromSource}
            >
              <Plus className="h-3.5 w-3.5" />
              Add {selectedSourceColumns.length > 0 ? selectedSourceColumns.length : sourceColumns.length} column
              {(selectedSourceColumns.length > 0 ? selectedSourceColumns.length : sourceColumns.length) === 1 ? '' : 's'} from source
            </Button>
          </div>
        )}

        {/* Existing & Local Mappings List */}
        {allMappings.length > 0 && (
          <div className="mb-6">
            <Text className="text-sm font-medium mb-2 flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Created Mappings ({allMappings.length})
            </Text>
            <div className="space-y-2 max-h-40 overflow-y-auto">
              {allMappings.map((mapping) => {
                const isExisting = existingMappings.some(m => m.id === mapping.id);
                const isLocal = localMappings.some(m => m.id === mapping.id);

                return (
                  <div
                    key={mapping.id}
                    className={cn(
                      'flex items-center justify-between p-3 rounded-lg border',
                      isLocal
                        ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                        : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                    )}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="flex flex-wrap gap-1">
                        {mapping.sourceColumns.map((col, idx) => (
                          <React.Fragment key={col}>
                            <Badge size="sm" className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400 text-xs">
                              {col}
                            </Badge>
                            {idx < mapping.sourceColumns.length - 1 && (
                              <span className="text-slate-400 text-xs">+</span>
                            )}
                          </React.Fragment>
                        ))}
                      </div>
                      {mapping.transformation && (
                        <Badge size="sm" className="bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400 text-xs flex items-center gap-1">
                          <Wand2 className="h-3 w-3" />
                          {mapping.transformation}
                        </Badge>
                      )}
                      <ArrowRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <Badge size="sm" className="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400 text-xs">
                        {mapping.targetColumn}
                      </Badge>
                      {isLocal && (
                        <Badge size="sm" className="bg-amber-100 text-amber-700 text-[10px]">
                          NEW
                        </Badge>
                      )}
                      {isExisting && (
                        <Badge size="sm" className="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400 text-[10px]">
                          ETL
                        </Badge>
                      )}
                    </div>
                    {isLocal ? (
                      <button
                        onClick={() => handleRemoveLocalMapping(mapping.id)}
                        className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 ml-2"
                        title="Remove mapping"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ) : (
                      <Tooltip content="Saved ETL column mapping">
                        <div className="p-1.5 text-green-500 ml-2">
                          <Link2 className="h-4 w-4" />
                        </div>
                      </Tooltip>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Column Selection */}
        <div className="grid grid-cols-2 gap-6">
          {/* Source Columns */}
          <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
            <div className="bg-blue-50 dark:bg-blue-900/20 px-4 py-2 border-b dark:border-slate-700">
              <Text className="font-medium text-blue-700 dark:text-blue-400">
                Source Columns
              </Text>
              <Text className="text-xs text-blue-600/70 dark:text-blue-400/70">
                Select one or more columns
              </Text>
            </div>

            {/* Search */}
            <div className="p-2 border-b dark:border-slate-700">
              <Input
                size="sm"
                placeholder="Search columns..."
                value={sourceSearch}
                onChange={(e) => setSourceSearch(e.target.value)}
                prefix={<Search className="h-4 w-4 text-slate-400" />}
              />
            </div>

            {/* Column List */}
            <div className="max-h-48 overflow-y-auto">
              {filteredSourceColumns.length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-sm">
                  No columns found
                </div>
              ) : (
                filteredSourceColumns.map((col) => {
                  const isSelected = selectedSourceColumns.includes(col.name);
                  return (
                    <div
                      key={col.name}
                      onClick={() => handleSourceColumnToggle(col.name)}
                      className={cn(
                        'flex items-center gap-3 px-4 py-2 cursor-pointer border-b dark:border-slate-700 last:border-0',
                        'hover:bg-slate-50 dark:hover:bg-slate-800',
                        isSelected && 'bg-blue-50 dark:bg-blue-900/30'
                      )}
                    >
                      <div className={cn(
                        'w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0',
                        isSelected
                          ? 'bg-blue-500 border-blue-500'
                          : 'border-slate-300 dark:border-slate-600'
                      )}>
                        {isSelected && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Text className="font-mono text-sm truncate">{col.name}</Text>
                        <Text className="text-xs text-slate-400">{col.dataType}</Text>
                      </div>
                      {col.isPrimaryKey && (
                        <Badge size="sm" className="bg-amber-100 text-amber-700 text-[10px]">
                          PK
                        </Badge>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Selected Count */}
            {selectedSourceColumns.length > 0 && (
              <div className="px-4 py-2 bg-blue-100 dark:bg-blue-900/40 border-t dark:border-slate-700">
                <Text className="text-xs text-blue-700 dark:text-blue-400">
                  {selectedSourceColumns.length} column(s) selected
                </Text>
              </div>
            )}
          </div>

          {/* Target Columns */}
          <div className="border dark:border-slate-700 rounded-lg overflow-hidden">
            <div className="bg-green-50 dark:bg-green-900/20 px-4 py-2 border-b dark:border-slate-700">
              <Text className="font-medium text-green-700 dark:text-green-400">
                Target Column
              </Text>
              <Text className="text-xs text-green-600/70 dark:text-green-400/70">
                Select one column (unmapped only)
              </Text>
            </div>

            {/* Search */}
            <div className="p-2 border-b dark:border-slate-700">
              <Input
                size="sm"
                placeholder="Search columns..."
                value={targetSearch}
                onChange={(e) => setTargetSearch(e.target.value)}
                prefix={<Search className="h-4 w-4 text-slate-400" />}
              />
            </div>

            {/* Column List */}
            <div className="max-h-48 overflow-y-auto">
              {filteredTargetColumns.length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-sm">
                  No columns found
                </div>
              ) : (
                filteredTargetColumns.map((col) => {
                  const isSelected = selectedTargetColumn === col.name;
                  const isMapped = mappedTargetColumns.has(col.name);

                  return (
                    <div
                      key={col.name}
                      onClick={() => handleTargetColumnSelect(col.name)}
                      className={cn(
                        'flex items-center gap-3 px-4 py-2 border-b dark:border-slate-700 last:border-0',
                        isMapped
                          ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800/50'
                          : 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800',
                        isSelected && !isMapped && 'bg-green-50 dark:bg-green-900/30'
                      )}
                    >
                      <div className={cn(
                        'w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0',
                        isMapped
                          ? 'bg-slate-300 border-slate-300 dark:bg-slate-600 dark:border-slate-600'
                          : isSelected
                            ? 'bg-green-500 border-green-500'
                            : 'border-slate-300 dark:border-slate-600'
                      )}>
                        {(isSelected || isMapped) && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <Text className={cn('font-mono text-sm truncate', isMapped && 'text-slate-400')}>
                          {col.name}
                        </Text>
                        <Text className="text-xs text-slate-400">{col.dataType}</Text>
                      </div>
                      {col.isPrimaryKey && (
                        <Badge size="sm" className="bg-amber-100 text-amber-700 text-[10px]">
                          PK
                        </Badge>
                      )}
                      {isMapped && (
                        <Badge size="sm" className="bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400 text-[10px]">
                          MAPPED
                        </Badge>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Selected Column */}
            {selectedTargetColumn && (
              <div className="px-4 py-2 bg-green-100 dark:bg-green-900/40 border-t dark:border-slate-700">
                <Text className="text-xs text-green-700 dark:text-green-400">
                  Selected: {selectedTargetColumn}
                </Text>
              </div>
            )}
          </div>
        </div>

        {/* Current Selection Preview & Add Button */}
        {selectedSourceColumns.length > 0 && selectedTargetColumn && (
          <div className={cn(
            "mt-4 p-4 rounded-lg border",
            currentCompatibility.hasErrors
              ? "bg-gradient-to-r from-red-50 to-amber-50 dark:from-red-900/20 dark:to-amber-900/20 border-red-300 dark:border-red-800"
              : currentCompatibility.hasWarnings
                ? "bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 border-amber-300 dark:border-amber-800"
                : "bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-900/20 dark:to-green-900/20 border-blue-200 dark:border-blue-800"
          )}>
            {/* Mapping Preview Row */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Text className="text-sm font-medium text-slate-600 dark:text-slate-300">New Mapping:</Text>
                <div className="flex flex-wrap gap-1 items-center">
                  {selectedSourceColumns.map((col, idx) => (
                    <React.Fragment key={col}>
                      <Badge size="sm" className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400">
                        {col}
                      </Badge>
                      {idx < selectedSourceColumns.length - 1 && (
                        <Plus className="h-3 w-3 text-slate-400" />
                      )}
                    </React.Fragment>
                  ))}
                </div>
                {selectedTransformation && (
                  <Badge size="sm" className="bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-400 flex items-center gap-1">
                    <Wand2 className="h-3 w-3" />
                    {selectedTransformation}
                  </Badge>
                )}
                <ArrowRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
                <Badge size="sm" className="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400">
                  {selectedTargetColumn}
                </Badge>
                {/* Compatibility indicator */}
                {currentCompatibility.hasErrors && (
                  <Tooltip content="Incompatible data types detected">
                    <div className="flex items-center gap-1 px-2 py-0.5 bg-red-100 dark:bg-red-900/40 rounded text-red-600 dark:text-red-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span className="text-xs font-medium">Error</span>
                    </div>
                  </Tooltip>
                )}
                {!currentCompatibility.hasErrors && currentCompatibility.hasWarnings && (
                  <Tooltip content="Check type compatibility warnings">
                    <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 dark:bg-amber-900/40 rounded text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span className="text-xs font-medium">Warning</span>
                    </div>
                  </Tooltip>
                )}
              </div>
            </div>

            {/* Transformation Selection Row */}
            <div className="flex items-center gap-3 mb-3 p-3 bg-white/50 dark:bg-slate-800/50 rounded-lg border border-purple-200 dark:border-purple-800">
              <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
                <Wand2 className="h-4 w-4" />
                <Text className="text-sm font-medium">Transformation:</Text>
              </div>
              <div className="flex-1 max-w-xs">
                <Select
                  size="sm"
                  options={TRANSFORMATION_OPTIONS}
                  value={selectedTransformation || ''}
                  onChange={(option: any) => setSelectedTransformation(option?.value || null)}
                  className="w-full"
                  placeholder="Select transformation..."
                />
              </div>
              {selectedSourceColumns.length > 1 && !selectedTransformation && (
                <Tooltip content="When mapping multiple source columns, consider using CONCAT, CONCAT_WS, COALESCE, or SUM">
                  <div className="flex items-center gap-1 px-2 py-1 bg-amber-100 dark:bg-amber-900/40 rounded text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    <span className="text-xs">Transformation recommended</span>
                  </div>
                </Tooltip>
              )}
            </div>

            {/* Add Button Row */}
            <div className="flex items-center justify-end">
              <Button
                size="sm"
                onClick={handleAddMapping}
                className={cn(
                  currentCompatibility.hasErrors
                    ? "bg-red-600 hover:bg-red-700 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
                )}
              >
                <Plus className="h-4 w-4 mr-1" />
                {currentCompatibility.hasErrors ? 'Add Anyway' : 'Add Mapping'}
              </Button>
            </div>

            {/* Compatibility warnings list */}
            {currentCompatibility.warnings.length > 0 && (
              <div className={cn(
                "mt-3 pt-3 border-t",
                currentCompatibility.hasErrors
                  ? "border-red-200 dark:border-red-800"
                  : "border-amber-200 dark:border-amber-800"
              )}>
                <Text className={cn(
                  "text-xs font-medium mb-1.5",
                  currentCompatibility.hasErrors
                    ? "text-red-600 dark:text-red-400"
                    : "text-amber-600 dark:text-amber-400"
                )}>
                  {currentCompatibility.hasErrors ? 'Type Compatibility Errors:' : 'Type Compatibility Warnings:'}
                </Text>
                <ul className="space-y-1">
                  {currentCompatibility.warnings.map((warning, idx) => (
                    <li key={idx} className={cn(
                      "flex items-start gap-2 text-xs",
                      currentCompatibility.hasErrors
                        ? "text-red-600 dark:text-red-400"
                        : "text-amber-600 dark:text-amber-400"
                    )}>
                      <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                      <span>{warning}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between mt-6 pt-4 border-t dark:border-slate-700">
          <Text className="text-sm text-slate-500">
            {localMappings.length > 0
              ? `${localMappings.length} new mapping(s) to save`
              : 'Select columns and add mappings'
            }
          </Text>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSaveAndClose}
              disabled={localMappings.length === 0}
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
            >
              Save {localMappings.length > 0 ? `(${localMappings.length})` : ''} Mappings
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
};

export default ColumnMappingModal;
