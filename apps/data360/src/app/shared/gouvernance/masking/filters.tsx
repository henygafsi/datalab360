'use client';

import React from 'react';
import { Input } from 'rizzui';
import type { Table } from '@tanstack/react-table';
import type { MaskingTableDataType } from './table-advanced';

export default function Filters({ table }: { table: Table<MaskingTableDataType> }) {
  return (
    <div className="flex gap-3">
      <Input
        placeholder="Filter by policy name..."
        value={(table.getColumn('policy_name')?.getFilterValue() as string) ?? ''}
        onChange={(e) => table.getColumn('policy_name')?.setFilterValue(e.target.value)}
      />
      <Input
        placeholder="Filter by role..."
        value={(table.getColumn('role_name')?.getFilterValue() as string) ?? ''}
        onChange={(e) => table.getColumn('role_name')?.setFilterValue(e.target.value)}
      />
    </div>
  );
}


