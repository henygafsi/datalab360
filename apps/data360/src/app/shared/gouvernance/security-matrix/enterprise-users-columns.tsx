'use client';

import { createColumnHelper } from '@tanstack/react-table';
import { Badge, Button } from 'rizzui';
import { Trash2 } from 'lucide-react';
import EditableCell from './editable-cell';
import type { EnterpriseUser } from '@/app/services/gouvernance/security_matrix';

const columnHelper = createColumnHelper<EnterpriseUser>();

const IDP_COLORS: Record<string, string> = {
  LOCAL: 'bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300',
  ENTRA_ID: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  OKTA: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400',
  SAML_CUSTOM: 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400',
  KEY_PAIR: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  DISABLED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  LOCKED: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
};

function formatTimestamp(ts?: string | null): string {
  if (!ts) return '—';
  try {
    return new Date(ts).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return ts;
  }
}

export function getEnterpriseUsersColumns(
  dirtyRows: Set<string>,
  onCellChange: (username: string, field: string, value: string | null) => void,
  onDelete: (user: EnterpriseUser) => void,
) {
  return [
    columnHelper.accessor('USERNAME', {
      id: 'USERNAME',
      size: 140,
      header: 'Username',
      cell: ({ row }) => (
        <span className="text-sm font-semibold text-slate-900 dark:text-white">
          {row.original.USERNAME}
        </span>
      ),
    }),
    columnHelper.accessor('DISPLAY_NAME', {
      id: 'DISPLAY_NAME',
      size: 160,
      header: 'Display Name',
      cell: ({ row }) => (
        <EditableCell
          value={row.original.DISPLAY_NAME}
          type="text"
          placeholder="—"
          onChange={(val) => onCellChange(row.original.USERNAME, 'display_name', val)}
        />
      ),
    }),
    columnHelper.accessor('EMAIL', {
      id: 'EMAIL',
      size: 200,
      header: 'Email',
      cell: ({ row }) => (
        <EditableCell
          value={row.original.EMAIL}
          type="text"
          placeholder="—"
          onChange={(val) => onCellChange(row.original.USERNAME, 'email', val)}
        />
      ),
    }),
    columnHelper.accessor('DEFAULT_ROLE', {
      id: 'DEFAULT_ROLE',
      size: 140,
      header: 'Default Role',
      cell: ({ row }) => (
        <EditableCell
          value={row.original.DEFAULT_ROLE}
          type="text"
          placeholder="—"
          onChange={(val) => onCellChange(row.original.USERNAME, 'default_role', val)}
        />
      ),
    }),
    columnHelper.accessor('IDENTITY_PROVIDER', {
      id: 'IDENTITY_PROVIDER',
      size: 120,
      header: 'Identity Provider',
      cell: ({ row }) => {
        const idp = row.original.IDENTITY_PROVIDER || 'LOCAL';
        return (
          <Badge className={IDP_COLORS[idp] || IDP_COLORS.LOCAL}>
            {idp.replace('_', ' ')}
          </Badge>
        );
      },
    }),
    columnHelper.accessor('STATUS', {
      id: 'STATUS',
      size: 90,
      header: 'Status',
      cell: ({ row }) => {
        const status = row.original.STATUS || 'ACTIVE';
        return (
          <Badge className={STATUS_COLORS[status] || STATUS_COLORS.ACTIVE}>
            {status}
          </Badge>
        );
      },
    }),
    columnHelper.accessor('HAS_MFA', {
      id: 'HAS_MFA',
      size: 70,
      header: 'MFA',
      cell: ({ row }) => (
        <Badge className={row.original.HAS_MFA
          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
          : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
        }>
          {row.original.HAS_MFA ? 'Yes' : 'No'}
        </Badge>
      ),
    }),
    columnHelper.accessor('LAST_LOGIN', {
      id: 'LAST_LOGIN',
      size: 160,
      header: 'Last Login',
      cell: ({ row }) => (
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {formatTimestamp(row.original.LAST_LOGIN)}
        </span>
      ),
    }),
    columnHelper.accessor('SYNCED_AT', {
      id: 'SYNCED_AT',
      size: 140,
      header: 'Last Synced',
      cell: ({ row }) => (
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {formatTimestamp(row.original.SYNCED_AT)}
        </span>
      ),
    }),
    columnHelper.display({
      id: 'actions',
      size: 70,
      header: '',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          {dirtyRows.has(row.original.USERNAME) && (
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
