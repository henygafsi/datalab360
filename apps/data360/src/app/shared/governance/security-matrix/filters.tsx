'use client';

import { Input, Select } from 'rizzui';
import { Search } from 'lucide-react';

type FiltersProps = {
  searchText: string;
  onSearchChange: (value: string) => void;
  accessLevelFilter?: string;
  onAccessLevelChange?: (value: string) => void;
  statusFilter?: string;
  onStatusChange?: (value: string) => void;
  idpFilter?: string;
  onIdpChange?: (value: string) => void;
  mode?: 'matrix' | 'users';
};

export default function SecurityMatrixFilters({
  searchText,
  onSearchChange,
  accessLevelFilter,
  onAccessLevelChange,
  statusFilter,
  onStatusChange,
  idpFilter,
  onIdpChange,
  mode = 'matrix',
}: FiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative flex-1 min-w-[200px] max-w-[320px]">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          size="sm"
          aria-label={mode === 'matrix' ? 'Search roles' : 'Search users'}
          value={searchText}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={mode === 'matrix' ? 'Search roles...' : 'Search users...'}
          className="pl-9 w-full"
        />
      </div>

      {mode === 'matrix' && onAccessLevelChange && (
        <Select
          size="sm"
          options={[
            { label: 'All Levels', value: '' },
            { label: 'READ', value: 'READ' },
            { label: 'WRITE', value: 'WRITE' },
            { label: 'ADMIN', value: 'ADMIN' },
          ]}
          value={accessLevelFilter || ''}
          onChange={(v: any) => onAccessLevelChange(v?.value ?? '')}
          className="w-[140px]"
        />
      )}

      {mode === 'users' && onStatusChange && (
        <Select
          size="sm"
          options={[
            { label: 'All Status', value: '' },
            { label: 'Active', value: 'ACTIVE' },
            { label: 'Disabled', value: 'DISABLED' },
            { label: 'Locked', value: 'LOCKED' },
          ]}
          value={statusFilter || ''}
          onChange={(v: any) => onStatusChange(v?.value ?? '')}
          className="w-[140px]"
        />
      )}

      {mode === 'users' && onIdpChange && (
        <Select
          size="sm"
          options={[
            { label: 'All Providers', value: '' },
            { label: 'Local', value: 'LOCAL' },
            { label: 'Entra ID', value: 'ENTRA_ID' },
            { label: 'Okta', value: 'OKTA' },
            { label: 'SAML Custom', value: 'SAML_CUSTOM' },
            { label: 'Key Pair', value: 'KEY_PAIR' },
          ]}
          value={idpFilter || ''}
          onChange={(v: any) => onIdpChange(v?.value ?? '')}
          className="w-[160px]"
        />
      )}
    </div>
  );
}
