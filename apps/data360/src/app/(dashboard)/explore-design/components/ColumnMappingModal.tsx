'use client';

import React, { useState, useMemo } from 'react';
import { Modal, Button, Badge, Input, Text } from 'rizzui';
import { X, ArrowRight, Plus, Trash2, Search, Check } from 'lucide-react';
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

interface ColumnMappingModalProps {
  isOpen: boolean;
  onClose: () => void;
  sourceTable: TableInfo | null;
  targetTable: TableInfo | null;
  sourceColumns: Column[];
  targetColumns: Column[];
  onCreateMapping: (sourceColumns: string[], targetColumn: string) => void;
}

const ColumnMappingModal: React.FC<ColumnMappingModalProps> = ({
  isOpen,
  onClose,
  sourceTable,
  targetTable,
  sourceColumns,
  targetColumns,
  onCreateMapping,
}) => {
  const [selectedSourceColumns, setSelectedSourceColumns] = useState<string[]>([]);
  const [selectedTargetColumn, setSelectedTargetColumn] = useState<string | null>(null);
  const [sourceSearch, setSourceSearch] = useState('');
  const [targetSearch, setTargetSearch] = useState('');

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

  const handleSourceColumnToggle = (columnName: string) => {
    setSelectedSourceColumns(prev => {
      if (prev.includes(columnName)) {
        return prev.filter(c => c !== columnName);
      }
      return [...prev, columnName];
    });
  };

  const handleTargetColumnSelect = (columnName: string) => {
    setSelectedTargetColumn(columnName);
  };

  const handleCreateMapping = () => {
    if (selectedSourceColumns.length === 0 || !selectedTargetColumn) return;
    onCreateMapping(selectedSourceColumns, selectedTargetColumn);
    // Reset state
    setSelectedSourceColumns([]);
    setSelectedTargetColumn(null);
    setSourceSearch('');
    setTargetSearch('');
    onClose();
  };

  const handleClose = () => {
    setSelectedSourceColumns([]);
    setSelectedTargetColumn(null);
    setSourceSearch('');
    setTargetSearch('');
    onClose();
  };

  if (!sourceTable || !targetTable) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose} size="xl">
      <div className="p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <Text className="text-lg font-semibold">Column Mapping</Text>
            <Text className="text-sm text-slate-500">
              Map source column(s) to a target column
            </Text>
          </div>
          <button onClick={handleClose} className="p-1 hover:bg-slate-100 rounded">
            <X className="h-5 w-5 text-slate-500" />
          </button>
        </div>

        {/* Tables Info */}
        <div className="flex items-center gap-4 mb-6 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <div className="flex-1">
            <Text className="text-xs text-slate-500 uppercase">Source Table</Text>
            <Text className="font-medium text-blue-600">{sourceTable.table}</Text>
            <Text className="text-xs text-slate-400">{sourceTable.schema}</Text>
          </div>
          <ArrowRight className="h-5 w-5 text-slate-400" />
          <div className="flex-1">
            <Text className="text-xs text-slate-500 uppercase">Target Table</Text>
            <Text className="font-medium text-green-600">{targetTable.table}</Text>
            <Text className="text-xs text-slate-400">{targetTable.schema}</Text>
          </div>
        </div>

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
            <div className="max-h-64 overflow-y-auto">
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
                        'w-5 h-5 rounded border-2 flex items-center justify-center',
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
                Select one column
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
            <div className="max-h-64 overflow-y-auto">
              {filteredTargetColumns.length === 0 ? (
                <div className="p-4 text-center text-slate-500 text-sm">
                  No columns found
                </div>
              ) : (
                filteredTargetColumns.map((col) => {
                  const isSelected = selectedTargetColumn === col.name;
                  return (
                    <div
                      key={col.name}
                      onClick={() => handleTargetColumnSelect(col.name)}
                      className={cn(
                        'flex items-center gap-3 px-4 py-2 cursor-pointer border-b dark:border-slate-700 last:border-0',
                        'hover:bg-slate-50 dark:hover:bg-slate-800',
                        isSelected && 'bg-green-50 dark:bg-green-900/30'
                      )}
                    >
                      <div className={cn(
                        'w-5 h-5 rounded-full border-2 flex items-center justify-center',
                        isSelected
                          ? 'bg-green-500 border-green-500'
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

        {/* Mapping Preview */}
        {selectedSourceColumns.length > 0 && selectedTargetColumn && (
          <div className="mt-6 p-4 bg-slate-50 dark:bg-slate-800 rounded-lg">
            <Text className="text-sm font-medium mb-2">Mapping Preview</Text>
            <div className="flex items-center gap-3">
              <div className="flex flex-wrap gap-1">
                {selectedSourceColumns.map((col, idx) => (
                  <Badge key={col} className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400">
                    {col}
                    {idx < selectedSourceColumns.length - 1 && (
                      <Plus className="h-3 w-3 ml-1" />
                    )}
                  </Badge>
                ))}
              </div>
              <ArrowRight className="h-4 w-4 text-slate-400 flex-shrink-0" />
              <Badge className="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400">
                {selectedTargetColumn}
              </Badge>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t dark:border-slate-700">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            onClick={handleCreateMapping}
            disabled={selectedSourceColumns.length === 0 || !selectedTargetColumn}
            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
          >
            Create Mapping
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default ColumnMappingModal;
