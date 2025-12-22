'use client';

import React, { useMemo } from 'react';
import { Text, Badge, Button } from 'rizzui';
import { cn } from '@/lib/utils';
import {
  X, ArrowRight, Download, Trash2, Table2,
  ChevronDown, ChevronRight, GitMerge
} from 'lucide-react';

// ETL Column Mapping (Source → Target for data loading)
// NOT to be confused with FK relationships which are database constraints
interface ColumnMapping {
  id: string;
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  transformation?: string; // Optional: UPPER(), TRIM(), etc.
}

interface MappingSummaryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  mappings: ColumnMapping[];
  onRemoveMapping?: (mappingId: string) => void;
  onExport?: () => void;
  className?: string;
}

// Group mappings by source table
const groupMappingsBySource = (mappings: ColumnMapping[]) => {
  const groups = new Map<string, ColumnMapping[]>();

  mappings.forEach(mapping => {
    if (!groups.has(mapping.sourceTable)) {
      groups.set(mapping.sourceTable, []);
    }
    groups.get(mapping.sourceTable)!.push(mapping);
  });

  return groups;
};

const MappingSummaryPanel: React.FC<MappingSummaryPanelProps> = ({
  isOpen,
  onClose,
  mappings,
  onRemoveMapping,
  onExport,
  className,
}) => {
  const [expandedGroups, setExpandedGroups] = React.useState<Set<string>>(new Set());

  // Group mappings by source table
  const groupedMappings = useMemo(() => groupMappingsBySource(mappings), [mappings]);

  // Stats
  const stats = useMemo(() => {
    const total = mappings.length;
    const uniqueSourceTables = new Set(mappings.map(m => m.sourceTable)).size;
    const uniqueTargetTables = new Set(mappings.map(m => m.targetTable)).size;

    return { total, uniqueSourceTables, uniqueTargetTables };
  }, [mappings]);

  const toggleGroup = (groupName: string) => {
    setExpandedGroups(prev => {
      const newSet = new Set(prev);
      if (newSet.has(groupName)) {
        newSet.delete(groupName);
      } else {
        newSet.add(groupName);
      }
      return newSet;
    });
  };

  const expandAll = () => {
    setExpandedGroups(new Set(groupedMappings.keys()));
  };

  const collapseAll = () => {
    setExpandedGroups(new Set());
  };

  // Export mappings as JSON
  const handleExport = () => {
    if (onExport) {
      onExport();
      return;
    }

    const exportData = {
      exportedAt: new Date().toISOString(),
      description: 'ETL Column Mappings (Source → Target)',
      totalMappings: mappings.length,
      mappings: mappings.map(m => ({
        source: `${m.sourceTable}.${m.sourceColumn}`,
        target: `${m.targetTable}.${m.targetColumn}`,
        transformation: m.transformation || null,
      })),
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'etl-column-mappings.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isOpen) return null;

  return (
    <div className={cn(
      "flex flex-col h-full bg-white dark:bg-slate-900 border-l dark:border-slate-700",
      className
    )}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b dark:border-slate-700 bg-gradient-to-r from-blue-50 to-green-50 dark:from-blue-900/20 dark:to-green-900/20">
        <div>
          <div className="flex items-center gap-2">
            <GitMerge className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            <Text className="font-semibold">ETL Mappings</Text>
          </div>
          <Text className="text-xs text-slate-500 mt-0.5">
            {stats.total} mapping{stats.total !== 1 ? 's' : ''} • {stats.uniqueSourceTables} source → {stats.uniqueTargetTables} target table{stats.uniqueTargetTables !== 1 ? 's' : ''}
          </Text>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          <X className="h-5 w-5 text-slate-500" />
        </button>
      </div>

      {/* Actions Bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
        <Badge size="sm" className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400">
          {stats.total} mappings
        </Badge>
        <div className="flex items-center gap-2">
          <button
            onClick={expandAll}
            className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            Expand all
          </button>
          <span className="text-slate-300">|</span>
          <button
            onClick={collapseAll}
            className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400"
          >
            Collapse all
          </button>
        </div>
      </div>

      {/* Mappings List */}
      <div className="flex-1 overflow-y-auto">
        {mappings.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
              <ArrowRight className="h-8 w-8 text-slate-400" />
            </div>
            <Text className="font-medium text-slate-600 dark:text-slate-400">No mappings yet</Text>
            <Text className="text-sm text-slate-500 mt-1">
              Connect source tables to target DWH tables and map columns
            </Text>
          </div>
        ) : (
          <div className="divide-y dark:divide-slate-700">
            {Array.from(groupedMappings.entries()).map(([sourceTable, tableMappings]) => {
              const isExpanded = expandedGroups.has(sourceTable);

              return (
                <div key={sourceTable} className="bg-white dark:bg-slate-900">
                  {/* Group Header */}
                  <button
                    onClick={() => toggleGroup(sourceTable)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    )}
                    <Table2 className="h-4 w-4 text-blue-500" />
                    <Text className="font-medium flex-1 text-left truncate">{sourceTable}</Text>
                    <Badge size="sm" className="bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400 text-[10px]">
                      {tableMappings.length} mapping{tableMappings.length !== 1 ? 's' : ''}
                    </Badge>
                  </button>

                  {/* Group Content */}
                  {isExpanded && (
                    <div className="pb-2">
                      {tableMappings.map((mapping) => (
                        <div
                          key={mapping.id}
                          className="flex items-center gap-2 mx-4 my-1 px-3 py-2 rounded-lg border bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800"
                        >
                          {/* Source Column */}
                          <Badge size="sm" className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400 text-xs">
                            {mapping.sourceColumn}
                          </Badge>

                          <ArrowRight className="h-3.5 w-3.5 text-slate-400 flex-shrink-0" />

                          {/* Target */}
                          <div className="flex items-center gap-1 flex-1 min-w-0">
                            <Text className="text-xs text-slate-500 truncate">{mapping.targetTable}.</Text>
                            <Badge size="sm" className="bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-400 text-xs">
                              {mapping.targetColumn}
                            </Badge>
                          </div>

                          {/* Transformation indicator */}
                          {mapping.transformation && (
                            <Badge size="sm" className="bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-400 text-[10px]">
                              {mapping.transformation}
                            </Badge>
                          )}

                          {/* Remove button */}
                          {onRemoveMapping && (
                            <button
                              onClick={() => onRemoveMapping(mapping.id)}
                              className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-400 hover:text-red-600"
                              title="Remove mapping"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      {mappings.length > 0 && (
        <div className="flex items-center justify-between px-4 py-3 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
          <Text className="text-xs text-slate-500">
            {stats.total} mapping{stats.total !== 1 ? 's' : ''} ready for deployment
          </Text>
          <Button
            size="sm"
            variant="outline"
            onClick={handleExport}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            Export
          </Button>
        </div>
      )}
    </div>
  );
};

export default MappingSummaryPanel;
