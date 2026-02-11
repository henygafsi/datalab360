'use client';

import React, { useRef, useMemo, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui';
import { ChevronRight, ChevronDown, Database, Table2, Key, AlertTriangle, Columns3 } from 'lucide-react';
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

const STATUS_CONFIG = {
  configured: {
    dot: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
    label: 'configured',
  },
  pending: {
    dot: 'bg-amber-400',
    text: 'text-amber-600 dark:text-amber-400',
    label: 'pending',
  },
  warning: {
    dot: 'bg-red-500',
    text: 'text-red-600 dark:text-red-400',
    label: 'warning',
  },
};

const TableRow: React.FC<{
  table: TableItem;
  isSelected: boolean;
  onSelect: (selected: boolean) => void;
  onClick: () => void;
}> = ({ table, isSelected, onSelect, onClick }) => {
  const status = STATUS_CONFIG[table.status];

  const handleCheckboxClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
  };

  const handleCheckboxChange = (checked: boolean | 'indeterminate') => {
    onSelect(checked === true);
  };

  const handleRowClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest('[role="checkbox"]') || target.closest('button')) {
      return;
    }
    onClick();
  };

  return (
    <div
      className={cn(
        'flex items-start gap-2.5 px-3 py-2 cursor-pointer transition-all border-b border-slate-100 dark:border-slate-800/60',
        'hover:bg-blue-50/50 dark:hover:bg-slate-800/40',
        isSelected
          ? 'bg-blue-50 dark:bg-blue-900/15 border-l-2 border-l-blue-500'
          : 'border-l-2 border-l-transparent',
      )}
      onClick={handleRowClick}
    >
      <div className="pt-0.5" onClick={handleCheckboxClick}>
        <Checkbox
          checked={isSelected}
          onCheckedChange={handleCheckboxChange}
        />
      </div>

      <div className="flex-1 min-w-0">
        {/* Table name - full width, no truncation fighting */}
        <div className="flex items-center gap-1.5">
          <Table2 className={cn(
            'h-3.5 w-3.5 shrink-0',
            isSelected ? 'text-blue-500' : 'text-slate-400',
          )} />
          <span className={cn(
            'text-sm font-medium truncate',
            isSelected ? 'text-blue-700 dark:text-blue-300' : 'text-slate-800 dark:text-slate-200',
          )}>
            {table.table}
          </span>
        </div>

        {/* Metadata row */}
        <div className="flex items-center gap-2 mt-0.5 ml-5">
          {table.columnCount > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-400">
              <Columns3 className="h-2.5 w-2.5" />
              {table.columnCount}
            </span>
          )}
          {table.hasPrimaryKey && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-amber-500" title="Has Primary Key">
              <Key className="h-2.5 w-2.5" />
              PK
            </span>
          )}
          {table.sensitiveColumns != null && table.sensitiveColumns > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-red-500" title={`${table.sensitiveColumns} sensitive`}>
              <AlertTriangle className="h-2.5 w-2.5" />
              {table.sensitiveColumns}
            </span>
          )}
          <span className={cn('inline-flex items-center gap-1 text-[11px]', status.text)}>
            <span className={cn('h-1.5 w-1.5 rounded-full', status.dot)} />
            {status.label}
          </span>
        </div>
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

  // Extract just the schema name from "DB.SCHEMA"
  const parts = schema.split('.');
  const schemaName = parts.length > 1 ? parts[1] : schema;
  const dbName = parts.length > 1 ? parts[0] : '';

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors sticky top-0 z-10 border-b',
        'bg-slate-50 dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-700/80',
        'border-slate-200 dark:border-slate-700',
      )}
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
        <ChevronDown className="h-3.5 w-3.5 text-slate-500 shrink-0" />
      ) : (
        <ChevronRight className="h-3.5 w-3.5 text-slate-500 shrink-0" />
      )}

      <Database className="h-3.5 w-3.5 text-indigo-500 shrink-0" />

      <div className="flex-1 min-w-0">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate block">
          {schemaName}
        </span>
        {dbName && (
          <span className="text-[10px] text-slate-400 dark:text-slate-500 truncate block">
            {dbName}
          </span>
        )}
      </div>

      <Badge variant="outline" className="text-[10px] px-1.5 py-0 shrink-0 font-medium">
        {tables.length}
      </Badge>
      {selectedCount > 0 && (
        <Badge className="bg-blue-500 text-white text-[10px] px-1.5 py-0 shrink-0 font-medium">
          {selectedCount}
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
      return flatItems[index]?.type === 'schema' ? 48 : 48;
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
          const itemKey = item.type === 'schema'
            ? `schema-${item.schema}`
            : `table-${item.data.id}`;

          return (
            <div
              key={itemKey}
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
        <div className="flex flex-col items-center justify-center h-full text-center p-4">
          <Database className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {searchQuery ? 'No tables match your search' : 'No tables available'}
          </p>
        </div>
      )}
    </div>
  );
};

export default VirtualizedTableList;
