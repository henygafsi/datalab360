'use client';

import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui';

export default function MaskingTable({ data }: { data: any[] }) {
  return (
    <div className="bg-slate-50/50 dark:bg-slate-900/20 rounded-xl p-1 border border-slate-200/50 dark:border-slate-700/50">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Data Type</TableHead>
            <TableHead>Return Type</TableHead>
            <TableHead>Role</TableHead>
            <TableHead>Replace With</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {(data || []).map((p: any, idx: number) => (
            <TableRow key={p.policy_name || idx}>
              <TableCell>{p.policy_name || p.name || '-'}</TableCell>
              <TableCell>{p.data_type || '-'}</TableCell>
              <TableCell>{p.return_type || '-'}</TableCell>
              <TableCell>{p.role_name || '-'}</TableCell>
              <TableCell>{p.replace_with || '-'}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}


