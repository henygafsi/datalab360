'use client';

import { createColumnHelper } from '@tanstack/react-table';
import { Badge, Button } from 'rizzui';
import { Trash2 } from 'lucide-react';
import EditableCell from './editable-cell';
import type { SecurityMatrixEntryRow, SecurityAxes } from '@/app/services/gouvernance/security_matrix';

const columnHelper = createColumnHelper<SecurityMatrixEntryRow>();

const ACCESS_LEVEL_COLORS: Record<string, string> = {
  READ: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  WRITE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  ADMIN: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
};

export function getMatrixColumns(
  availableAxes: SecurityAxes | undefined,
  dirtyRows: Set<number>,
  onCellChange: (rowId: number, field: string, value: string | null) => void,
  onDelete: (row: SecurityMatrixEntryRow) => void,
) {
  return [
    columnHelper.accessor('role_name', {
      id: 'role_name',
      size: 140,
      header: 'Role',
      cell: ({ row }) => (
        <span className="text-sm font-semibold text-slate-900 dark:text-white">
          {row.original.role_name}
        </span>
      ),
    }),
    columnHelper.accessor('region_id', {
      id: 'region_id',
      size: 130,
      header: 'Region',
      cell: ({ row }) => (
        <EditableCell
          value={row.original.region_id}
          type="select"
          options={availableAxes?.regions?.map((r) => ({ label: r.name, value: r.id })) ?? []}
          onChange={(val) => onCellChange(row.original.id, 'region_id', val)}
        />
      ),
    }),
    columnHelper.accessor('store_id', {
      id: 'store_id',
      size: 130,
      header: 'Store',
      cell: ({ row }) => (
        <EditableCell
          value={row.original.store_id}
          type="select"
          options={availableAxes?.stores?.map((s) => ({ label: s.name, value: s.id })) ?? []}
          onChange={(val) => onCellChange(row.original.id, 'store_id', val)}
        />
      ),
    }),
    columnHelper.accessor('department_id', {
      id: 'department_id',
      size: 140,
      header: 'Department',
      cell: ({ row }) => (
        <EditableCell
          value={row.original.department_id}
          type="select"
          options={availableAxes?.departments?.map((d) => ({ label: d.name, value: d.id })) ?? []}
          onChange={(val) => onCellChange(row.original.id, 'department_id', val)}
        />
      ),
    }),
    columnHelper.accessor('product_category', {
      id: 'product_category',
      size: 140,
      header: 'Product Cat.',
      cell: ({ row }) => (
        <EditableCell
          value={row.original.product_category}
          type="text"
          placeholder="—"
          onChange={(val) => onCellChange(row.original.id, 'product_category', val)}
        />
      ),
    }),
    columnHelper.accessor('customer_segment', {
      id: 'customer_segment',
      size: 140,
      header: 'Segment',
      cell: ({ row }) => (
        <EditableCell
          value={row.original.customer_segment}
          type="text"
          placeholder="—"
          onChange={(val) => onCellChange(row.original.id, 'customer_segment', val)}
        />
      ),
    }),
    columnHelper.accessor('access_level', {
      id: 'access_level',
      size: 110,
      header: 'Access',
      cell: ({ row }) => (
        <EditableCell
          value={row.original.access_level}
          type="select"
          options={[
            { label: 'READ', value: 'READ' },
            { label: 'WRITE', value: 'WRITE' },
            { label: 'ADMIN', value: 'ADMIN' },
          ]}
          onChange={(val) => onCellChange(row.original.id, 'access_level', val)}
        />
      ),
    }),
    columnHelper.display({
      id: 'actions',
      size: 80,
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          {dirtyRows.has(row.original.id) && (
            <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Unsaved" />
          )}
          <Button
            size="sm"
            variant="text"
            className="text-red-500 hover:text-red-700 p-1"
            onClick={() => onDelete(row.original)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      ),
    }),
  ];
}
