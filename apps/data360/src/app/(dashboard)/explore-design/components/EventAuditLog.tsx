'use client';

import React, { useState, useMemo } from 'react';
import { Select, Text, Badge } from 'rizzui';
import { Filter } from 'lucide-react';

interface AuditEntry {
  timestamp: string;
  userId: string;
  type: string;
  target: string;
  status: string;
}

interface EventAuditLogProps {
  entries: AuditEntry[];
}

export default function EventAuditLog({ entries }: EventAuditLogProps) {
  const [filterUser, setFilterUser] = useState('');
  const [filterType, setFilterType] = useState('');

  const users = useMemo(
    () => [...new Set(entries.map((e) => e.userId).filter(Boolean))],
    [entries]
  );
  const types = useMemo(
    () => [...new Set(entries.map((e) => e.type))],
    [entries]
  );

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (filterUser && e.userId !== filterUser) return false;
      if (filterType && e.type !== filterType) return false;
      return true;
    });
  }, [entries, filterUser, filterType]);

  const statusBadge = (status: string) => {
    const color =
      status === 'validated'
        ? 'success'
        : status === 'failed'
          ? 'danger'
          : status === 'applied'
            ? 'info'
            : 'warning';
    return (
      <Badge size="sm" variant="flat" color={color}>
        {status}
      </Badge>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Text className="font-semibold text-gray-900 dark:text-white">
          Event Audit Log
        </Text>
        <Badge variant="flat">{filtered.length} entries</Badge>
      </div>

      <div className="flex gap-3">
        <Select
          size="sm"
          placeholder="All Users"
          value={filterUser}
          onChange={(e: any) => setFilterUser(e?.value || '')}
          options={[
            { label: 'All Users', value: '' },
            ...users.map((u) => ({ label: u, value: u })),
          ]}
          className="w-40"
        />
        <Select
          size="sm"
          placeholder="All Types"
          value={filterType}
          onChange={(e: any) => setFilterType(e?.value || '')}
          options={[
            { label: 'All Types', value: '' },
            ...types.map((t) => ({ label: t, value: t })),
          ]}
          className="w-48"
        />
      </div>

      <div className="overflow-x-auto max-h-96">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-gray-50 dark:bg-gray-800">
            <tr className="border-b border-gray-200 dark:border-gray-700">
              <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">
                Time
              </th>
              <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">
                User
              </th>
              <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">
                Event
              </th>
              <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">
                Target
              </th>
              <th className="text-left py-2 px-3 text-gray-600 dark:text-gray-400">
                Status
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((entry, idx) => (
              <tr
                key={idx}
                className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50"
              >
                <td className="py-2 px-3 text-gray-500 dark:text-gray-400 font-mono text-xs">
                  {entry.timestamp}
                </td>
                <td className="py-2 px-3 text-gray-900 dark:text-white">
                  {entry.userId}
                </td>
                <td className="py-2 px-3">
                  <Badge size="sm" variant="outline">
                    {entry.type}
                  </Badge>
                </td>
                <td className="py-2 px-3 text-gray-700 dark:text-gray-300">
                  {entry.target}
                </td>
                <td className="py-2 px-3">{statusBadge(entry.status)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
