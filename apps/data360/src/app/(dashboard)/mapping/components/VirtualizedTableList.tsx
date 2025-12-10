'use client';

import React, { useRef, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui';
import { ChevronRight, ChevronDown, Database, Table2, Key, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface TableItem {
  id: string;
  database: string;
  schema: string;
  table: string;
  columnCount: number;
  hasPrimaryKey: boolean;
  status: 'configured' | 'pending' | 'warning';
  sensitiveColumns?: number;
  columns?: ColumnInfo[];
}

export interface ColumnInfo {
  name: string;
  dataType: string;
  isPrimaryKey?: boolean;
  isNullable?: boolean;
  isSensitive?: boolean;
}

interface GroupedTables {
  [schema: string]: TableItem[];
}

interface VirtualizedTableListProps {
  tables: TableItem[];
  selectedTables: Set<string>;
  onSelectionChange: (tableId: string, selected: boolean) => void;
  onSelectAll: (tableIds: string[], selected: boolean) => void;
  onTableClick: (table: TableItem) => void;
  expandedSchemas: Set<string>;
  onSchemaToggle: (schema: string) => void;
  searchQuery?: string;
  className?: string;
}

const TableRow: React.FC<{
  table: TableItem;
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
  onClick: () => void;
}> = ({ table, isSelected, onSelect, onClick }) => {
  const statusColors = {
    configured: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    warning: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors border-b border-slate-100 dark:border-slate-800',
        isSelected && 'bg-blue-50 dark:bg-blue-900/20'
      )}
      onClick={onClick}
    >
      <Checkbox
        checked={isSelected}
        onCheckedChange={(checked) => {
          onSelect(checked as boolean);
        }}
        onClick={(e) => e.stopPropagation()}
      />

      <div className="flex items-center gap-2 flex-1 min-w-0">
        <Table2 className="h-4 w-4 text-slate-400 flex-shrink-0" />
        <span className="font-medium truncate">{table.table}</span>
        {table.hasPrimaryKey && (
          <span title="Has Primary Key">
            <Key className="h-3 w-3 text-amber-500 flex-shrink-0" />
          </span>
        )}
        {table.sensitiveColumns && table.sensitiveColumns > 0 && (
          <span title={`${table.sensitiveColumns} sensitive columns`}>
            <AlertTriangle className="h-3 w-3 text-red-500 flex-shrink-0" />
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm text-slate-500">{table.columnCount} cols</span>
        <Badge className={cn('text-xs', statusColors[table.status])}>
          {table.status}
        </Badge>
      </div>
    </div>
  );
};

const SchemaHeader: React.FC<{
  schema: string;
  tables: TableItem[];
  isExpanded: boolean;
  onToggle: () => void;
  selectedCount: number;
  onSelectAll: (selected: boolean) => void;
}> = ({ schema, tables, isExpanded, onToggle, selectedCount, onSelectAll }) => {
  const allSelected = selectedCount === tables.length && tables.length > 0;
  const someSelected = selectedCount > 0 && selectedCount < tables.length;

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 bg-slate-100 dark:bg-slate-800 cursor-pointer hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors sticky top-0 z-10"
      onClick={onToggle}
    >
      <Checkbox
        checked={allSelected}
        // @ts-ignore - indeterminate is valid but not in types
        indeterminate={someSelected}
        onCheckedChange={(checked) => {
          onSelectAll(checked as boolean);
        }}
        onClick={(e) => e.stopPropagation()}
      />

      {isExpanded ? (
        <ChevronDown className="h-4 w-4 text-slate-500" />
      ) : (
        <ChevronRight className="h-4 w-4 text-slate-500" />
      )}

      <Database className="h-4 w-4 text-slate-500" />
      <span className="font-semibold">{schema}</span>
      <Badge variant="outline" className="ml-auto">
        {tables.length} tables
      </Badge>
      {selectedCount > 0 && (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
          {selectedCount} selected
        </Badge>
      )}
    </div>
  );
};

export const VirtualizedTableList: React.FC<VirtualizedTableListProps> = ({
  tables,
  selectedTables,
  onSelectionChange,
  onSelectAll,
  onTableClick,
  expandedSchemas,
  onSchemaToggle,
  searchQuery = '',
  className,
}) => {
  const parentRef = useRef<HTMLDivElement>(null);

  // Filter tables based on search query
  const filteredTables = useMemo(() => {
    if (!searchQuery.trim()) return tables;
    const query = searchQuery.toLowerCase();
    return tables.filter(
      (t) =>
        t.table.toLowerCase().includes(query) ||
        t.schema.toLowerCase().includes(query) ||
        t.database.toLowerCase().includes(query)
    );
  }, [tables, searchQuery]);

  // Group tables by schema
  const groupedTables = useMemo(() => {
    const groups: GroupedTables = {};
    filteredTables.forEach((table) => {
      const key = `${table.database}.${table.schema}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(table);
    });
    return groups;
  }, [filteredTables]);

  // Build flat list for virtualization
  const flatItems = useMemo(() => {
    const items: Array<{ type: 'schema' | 'table'; data: any; schema: string }> = [];

    Object.entries(groupedTables).forEach(([schemaKey, schemaTables]) => {
      items.push({ type: 'schema', data: { schema: schemaKey, tables: schemaTables }, schema: schemaKey });

      if (expandedSchemas.has(schemaKey)) {
        schemaTables.forEach((table) => {
          items.push({ type: 'table', data: table, schema: schemaKey });
        });
      }
    });

    return items;
  }, [groupedTables, expandedSchemas]);

  const rowVirtualizer = useVirtualizer({
    count: flatItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback((index: number) => {
      return flatItems[index]?.type === 'schema' ? 40 : 52;
    }, [flatItems]),
    overscan: 10,
  });

  const getSelectedCountForSchema = useCallback(
    (schemaKey: string) => {
      const schemaTables = groupedTables[schemaKey] || [];
      return schemaTables.filter((t) => selectedTables.has(t.id)).length;
    },
    [groupedTables, selectedTables]
  );

  const handleSchemaSelectAll = useCallback(
    (schemaKey: string, selected: boolean) => {
      const schemaTables = groupedTables[schemaKey] || [];
      onSelectAll(
        schemaTables.map((t) => t.id),
        selected
      );
    },
    [groupedTables, onSelectAll]
  );

  return (
    <div
      ref={parentRef}
      className={cn('h-full overflow-auto', className)}
    >
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {rowVirtualizer.getVirtualItems().map((virtualItem) => {
          const item = flatItems[virtualItem.index];

          return (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              {item.type === 'schema' ? (
                <SchemaHeader
                  schema={item.data.schema}
                  tables={item.data.tables}
                  isExpanded={expandedSchemas.has(item.schema)}
                  onToggle={() => onSchemaToggle(item.schema)}
                  selectedCount={getSelectedCountForSchema(item.schema)}
                  onSelectAll={(selected) => handleSchemaSelectAll(item.schema, selected)}
                />
              ) : (
                <TableRow
                  table={item.data}
                  isSelected={selectedTables.has(item.data.id)}
                  onSelect={(selected) => onSelectionChange(item.data.id, selected)}
                  onClick={() => onTableClick(item.data)}
                />
              )}
            </div>
          );
        })}
      </div>

      {flatItems.length === 0 && (
        <div className="flex items-center justify-center h-full text-slate-500">
          {searchQuery ? 'No tables match your search' : 'No tables available'}
        </div>
      )}
    </div>
  );
};

export default VirtualizedTableList;
