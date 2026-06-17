'use client';

import { useState, useMemo } from 'react';
import { Text, Input, Select, Badge, Button, Tooltip } from 'rizzui';
import cn from '@core/utils/class-names';
import { UserPlus } from 'lucide-react';
import {
  PiMagnifyingGlass,
  PiFunnel,
  PiCaretUpDown,
  PiCaretUp,
  PiCaretDown,
  PiDownloadSimple,
  PiArrowSquareOut,
} from 'react-icons/pi';
import { useAuth } from '@/hooks/useAuth';
import { safeToFixed, safeArray } from '@/lib/format-number';
import type { ClientAccount, AccountFilters, HealthScore } from '@/app/services/org-accounts/types';
import AccountLifecycleMenu, { normalizeRole } from './AccountLifecycleMenu';
import AccountCreationWizard from './AccountCreationWizard';

interface AccountsTableProps {
  accounts: ClientAccount[];
  healthScores?: HealthScore[];
  creditUsage?: Record<string, number>;
  storageUsage?: Record<string, number>;
  loading?: boolean;
  onAccountClick?: (account: ClientAccount) => void;
  /** Refetch parent data after a successful lifecycle mutation. */
  onAccountsChanged?: () => void;
  className?: string;
}

type SortField = 'account_name' | 'region' | 'cloud' | 'edition' | 'created_on' | 'credits' | 'storage';
type SortDirection = 'asc' | 'desc';

const cloudOptions = [
  { value: '', label: 'All Clouds' },
  { value: 'AWS', label: 'AWS' },
  { value: 'AZURE', label: 'Azure' },
  { value: 'GCP', label: 'GCP' },
];

const editionOptions = [
  { value: '', label: 'All Editions' },
  { value: 'STANDARD', label: 'Standard' },
  { value: 'ENTERPRISE', label: 'Enterprise' },
  { value: 'BUSINESS_CRITICAL', label: 'Business Critical' },
];

const statusOptions = [
  { value: '', label: 'All Status' },
  { value: 'active', label: 'Active' },
  { value: 'inactive', label: 'Inactive' },
];

function getHealthColor(score: number): string {
  if (score >= 70) return 'bg-green-500';
  if (score >= 50) return 'bg-amber-500';
  return 'bg-red-500';
}

function getCloudBadgeColor(cloud: string | null): 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' {
  switch (cloud) {
    case 'AWS':
      return 'warning';
    case 'AZURE':
      return 'info';
    case 'GCP':
      return 'success';
    default:
      return 'secondary';
  }
}

function getEditionBadgeColor(edition: string | null): 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'info' {
  switch (edition) {
    case 'BUSINESS_CRITICAL':
      return 'danger';
    case 'ENTERPRISE':
      return 'primary';
    case 'STANDARD':
      return 'secondary';
    default:
      return 'secondary';
  }
}

export default function AccountsTable({
  accounts,
  healthScores = [],
  creditUsage = {},
  storageUsage = {},
  loading = false,
  onAccountClick,
  onAccountsChanged,
  className,
}: AccountsTableProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<AccountFilters>({});
  const [sortField, setSortField] = useState<SortField>('account_name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [showFilters, setShowFilters] = useState(false);
  const [showCreateWizard, setShowCreateWizard] = useState(false);

  // Role-aware actions. Falls back to 'user' if the auth hook hasn't
  // resolved yet — kebab will then hide everything except View + Export.
  const { role: rawRole, username: currentUsername } = useAuth();
  const userRole = normalizeRole(rawRole, currentUsername);

  // Create health score map for quick lookup
  const healthScoreMap = useMemo(() => {
    return new Map(safeArray(healthScores).map((h) => [h.account_name, h]));
  }, [healthScores]);

  // Filter and sort accounts
  const filteredAccounts = useMemo(() => {
    let result = [...accounts];

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (a) =>
          a.account_name.toLowerCase().includes(query) ||
          a.region?.toLowerCase().includes(query) ||
          a.comment?.toLowerCase().includes(query)
      );
    }

    // Apply filters
    if (filters.cloud) {
      result = result.filter((a) => a.cloud === filters.cloud);
    }
    if (filters.edition) {
      result = result.filter((a) => a.edition === filters.edition);
    }
    if (filters.status) {
      result = result.filter((a) =>
        filters.status === 'active' ? a.is_active : !a.is_active
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      let aVal: string | number = '';
      let bVal: string | number = '';

      switch (sortField) {
        case 'account_name':
          aVal = a.account_name.toLowerCase();
          bVal = b.account_name.toLowerCase();
          break;
        case 'region':
          aVal = a.region?.toLowerCase() || '';
          bVal = b.region?.toLowerCase() || '';
          break;
        case 'cloud':
          aVal = a.cloud?.toLowerCase() || '';
          bVal = b.cloud?.toLowerCase() || '';
          break;
        case 'edition':
          aVal = a.edition?.toLowerCase() || '';
          bVal = b.edition?.toLowerCase() || '';
          break;
        case 'created_on':
          aVal = a.created_on || '';
          bVal = b.created_on || '';
          break;
        case 'credits':
          aVal = creditUsage[a.account_name] || 0;
          bVal = creditUsage[b.account_name] || 0;
          break;
        case 'storage':
          aVal = storageUsage[a.account_name] || 0;
          bVal = storageUsage[b.account_name] || 0;
          break;
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1;
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });

    return result;
  }, [accounts, searchQuery, filters, sortField, sortDirection, creditUsage, storageUsage]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <PiCaretUpDown className="h-4 w-4 text-gray-400" />;
    }
    return sortDirection === 'asc' ? (
      <PiCaretUp className="h-4 w-4 text-primary" />
    ) : (
      <PiCaretDown className="h-4 w-4 text-primary" />
    );
  };

  const exportToCSV = () => {
    const headers = ['Account Name', 'Region', 'Cloud', 'Edition', 'Status', 'Created On', 'Credits (30d)', 'Storage (TB)'];
    const rows = filteredAccounts.map((a) => [
      a.account_name,
      a.region || '',
      a.cloud || '',
      a.edition || '',
      a.is_active ? 'Active' : 'Inactive',
      a.created_on ? new Date(a.created_on).toLocaleDateString() : '',
      creditUsage[a.account_name] != null ? safeToFixed(creditUsage[a.account_name], 2, '') : '',
      storageUsage[a.account_name] != null ? safeToFixed(storageUsage[a.account_name], 2, '') : '',
    ]);

    const csvContent = [headers, ...rows].map((row) => row.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `client-accounts-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className={cn('rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800', className)}>
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="h-10 w-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        </div>
        <div className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-12 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={cn('rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800', className)}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <PiMagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search accounts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 w-64"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className={cn(showFilters && 'bg-gray-100 dark:bg-gray-700')}
            >
              <PiFunnel className="h-4 w-4 mr-2" />
              Filters
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <Text className="text-sm text-gray-500">
              {filteredAccounts.length} of {accounts.length} accounts
            </Text>
            <Button variant="outline" size="sm" onClick={exportToCSV}>
              <PiDownloadSimple className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            {(userRole === 'orgadmin' || userRole === 'accountadmin') && (
              <Button
                variant="solid"
                size="sm"
                onClick={() => setShowCreateWizard(true)}
              >
                <UserPlus className="h-4 w-4 mr-2" />
                New account
              </Button>
            )}
          </div>
        </div>

        {/* Filters Row */}
        {showFilters && (
          <div className="mt-4 flex flex-wrap gap-3">
            <Select
              options={cloudOptions}
              value={filters.cloud || ''}
              onChange={(option: any) => setFilters({ ...filters, cloud: option.value })}
              className="w-36"
              placeholder="Cloud"
            />
            <Select
              options={editionOptions}
              value={filters.edition || ''}
              onChange={(option: any) => setFilters({ ...filters, edition: option.value })}
              className="w-44"
              placeholder="Edition"
            />
            <Select
              options={statusOptions}
              value={filters.status || ''}
              onChange={(option: any) => setFilters({ ...filters, status: option.value })}
              className="w-36"
              placeholder="Status"
            />
            {(filters.cloud || filters.edition || filters.status) && (
              <Button
                variant="text"
                size="sm"
                onClick={() => setFilters({})}
                className="text-red-500"
              >
                Clear filters
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Create wizard */}
      <AccountCreationWizard
        open={showCreateWizard}
        onOpenChange={setShowCreateWizard}
        currentUserRole={userRole}
        onCreated={(newAccount) => {
          onAccountsChanged?.();
          onAccountClick?.(newAccount);
        }}
      />

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
              <th className="px-4 py-3 text-left">
                <button
                  className="flex items-center gap-1 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider"
                  onClick={() => handleSort('account_name')}
                >
                  Account Name
                  <SortIcon field="account_name" />
                </button>
              </th>
              <th className="px-4 py-3 text-left">
                <button
                  className="flex items-center gap-1 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider"
                  onClick={() => handleSort('region')}
                >
                  Region
                  <SortIcon field="region" />
                </button>
              </th>
              <th className="px-4 py-3 text-left">
                <button
                  className="flex items-center gap-1 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider"
                  onClick={() => handleSort('cloud')}
                >
                  Cloud
                  <SortIcon field="cloud" />
                </button>
              </th>
              <th className="px-4 py-3 text-left">
                <button
                  className="flex items-center gap-1 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider"
                  onClick={() => handleSort('edition')}
                >
                  Edition
                  <SortIcon field="edition" />
                </button>
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left">
                <button
                  className="flex items-center gap-1 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider"
                  onClick={() => handleSort('created_on')}
                >
                  Created
                  <SortIcon field="created_on" />
                </button>
              </th>
              <th className="px-4 py-3 text-right">
                <button
                  className="flex items-center gap-1 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider ml-auto"
                  onClick={() => handleSort('credits')}
                >
                  Credits (30d)
                  <SortIcon field="credits" />
                </button>
              </th>
              <th className="px-4 py-3 text-right">
                <button
                  className="flex items-center gap-1 text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider ml-auto"
                  onClick={() => handleSort('storage')}
                >
                  Storage
                  <SortIcon field="storage" />
                </button>
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                Health
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 dark:text-gray-300 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {filteredAccounts.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                  No accounts found matching your criteria
                </td>
              </tr>
            ) : (
              filteredAccounts.map((account) => {
                const health = healthScoreMap.get(account.account_name);
                // Distinguish "not loaded / no data" (render —) from a real 0.
                const creditsVal = creditUsage[account.account_name];
                const storageVal = storageUsage[account.account_name];
                const hasCredits = creditsVal != null;
                const hasStorage = storageVal != null;

                return (
                  <tr
                    key={account.account_name}
                    className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
                    onClick={() => onAccountClick?.(account)}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Text className="font-medium text-gray-900 dark:text-white">
                          {account.account_name}
                        </Text>
                        {account.account_url && (
                          <a
                            href={account.account_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="text-gray-400 hover:text-primary"
                          >
                            <PiArrowSquareOut className="h-4 w-4" />
                          </a>
                        )}
                      </div>
                      {account.comment && (
                        <Text className="text-xs text-gray-500 truncate max-w-[200px]">
                          {account.comment}
                        </Text>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Text className="text-sm text-gray-600 dark:text-gray-300">
                        {account.region || '-'}
                      </Text>
                    </td>
                    <td className="px-4 py-3">
                      {account.cloud ? (
                        <Badge
                          variant="flat"
                          color={getCloudBadgeColor(account.cloud)}
                          className="text-xs"
                        >
                          {account.cloud}
                        </Badge>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {account.edition ? (
                        <Badge
                          variant="flat"
                          color={getEditionBadgeColor(account.edition)}
                          className="text-xs"
                        >
                          {account.edition.replace('_', ' ')}
                        </Badge>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant="flat"
                        color={account.is_active ? 'success' : 'danger'}
                        className="text-xs"
                      >
                        {account.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Text className="text-sm text-gray-600 dark:text-gray-300">
                        {account.created_on
                          ? new Date(account.created_on).toLocaleDateString()
                          : '-'}
                      </Text>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Text className="text-sm font-medium text-gray-900 dark:text-white">
                        {hasCredits ? safeToFixed(creditsVal, 2) : '—'}
                      </Text>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Text className="text-sm font-medium text-gray-900 dark:text-white">
                        {hasStorage ? `${safeToFixed(storageVal, 2)} TB` : '—'}
                      </Text>
                    </td>
                    <td className="px-4 py-3">
                      {health ? (
                        <Tooltip content={`Score: ${health.overall_score}/100`}>
                          <div className="flex justify-center">
                            <div
                              className={cn(
                                'h-3 w-3 rounded-full',
                                getHealthColor(health.overall_score)
                              )}
                            />
                          </div>
                        </Tooltip>
                      ) : (
                        <div className="flex justify-center">
                          <div className="h-3 w-3 rounded-full bg-gray-300" />
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <AccountLifecycleMenu
                          account={account}
                          currentUserRole={userRole}
                          currentUsername={currentUsername}
                          onViewDetails={(a) => onAccountClick?.(a)}
                          onChanged={onAccountsChanged}
                          onDropped={onAccountsChanged}
                        />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
