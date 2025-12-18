'use client';

import React, { useState, useMemo } from 'react';
import { Modal, Button, Badge, Input, Text } from 'rizzui';
import { X, ArrowRight, Plus, Trash2, Search, Check, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Column {
  name: string;
  dataType: string;
  isPrimaryKey?: boolean;
  isNullable?: boolean;
}

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
}

interface ColumnMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceTable: TableInfo | null;
  targetTable: TableInfo | null;
  sourceColumns: Column[];
  targetColumns: Column[];
  onCreateMapping: (sourceColumns: string[], targetColumn: string) => void;
  existingMappings?: ColumnMapping[];
  onRemoveMapping?: (mappingId: string) => void;
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
}) => {
  const [selectedSourceColumns, setSelectedSourceColumns] = useState<string[]>([]);
  const [selectedTargetColumn, setSelectedTargetColumn] = useState<string | null>(null);
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
      id: `mapping-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sourceColumns: [...selectedSourceColumns],
      targetColumn: selectedTargetColumn,
    };

    setLocalMappings(prev => [...prev, newMapping]);

    // Reset selection for next mapping
    setSelectedSourceColumns([]);
    setSelectedTargetColumn(null);
  };

  // Remove a local mapping
  const handleRemoveLocalMapping = (mappingId: string) => {
    setLocalMappings(prev => prev.filter(m => m.id !== mappingId));
  };

  // Save all mappings and close
  const handleSaveAndClose = () => {
    // Create events for all local mappings
    localMappings.forEach(mapping => {
      onCreateMapping(mapping.sourceColumns, mapping.targetColumn);
    });

    // Reset and close
    handleClose();
  };

  const handleClose = () => {
    setSelectedSourceColumns([]);
    setSelectedTargetColumn(null);
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
                      <ArrowRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <Badge size="sm" className="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400 text-xs">
                        {mapping.targetColumn}
                      </Badge>
                      {isLocal && (
                        <Badge size="sm" className="bg-amber-100 text-amber-700 text-[10px]">
                          NEW
                        </Badge>
                      )}
                    </div>
                    <button
                      onClick={() => {
                        if (isLocal) {
                          handleRemoveLocalMapping(mapping.id);
                        } else if (onRemoveMapping) {
                          onRemoveMapping(mapping.id);
                        }
                      }}
                      className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-500 ml-2"
                      title="Remove mapping"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
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
          <div className="mt-4 p-4 bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-900/20 dark:to-green-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between">
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
                <ArrowRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
                <Badge size="sm" className="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400">
                  {selectedTargetColumn}
                </Badge>
              </div>
              <Button
                size="sm"
                onClick={handleAddMapping}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Mapping
              </Button>
            </div>
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
