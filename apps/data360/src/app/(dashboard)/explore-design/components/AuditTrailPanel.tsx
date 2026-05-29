'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button, Badge, Input, Select } from 'rizzui';
import {
  History, Search, ChevronDown, ChevronRight, RefreshCw,
  User, Calendar, FileText, Filter,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { getAuditTrail } from '@/app/services/api/exploreDesignApi';
import { getApiErrorMessage } from '@/lib/api-client';
import type { AuditEntry, AuditTrailParams } from '@/app/services/api/types';

interface AuditTrailPanelProps {
  projectId: string;
  className?: string;
}

const ACTION_OPTIONS = [
  { label: 'All Actions', value: '' },
  { label: 'CREATE', value: 'CREATE' },
  { label: 'ALTER', value: 'ALTER' },
  { label: 'DROP', value: 'DROP' },
  { label: 'RENAME', value: 'RENAME' },
  { label: 'ADD_COLUMN', value: 'ADD_COLUMN' },
  { label: 'DROP_COLUMN', value: 'DROP_COLUMN' },
];

const ENTITY_TYPE_OPTIONS = [
  { label: 'All Types', value: '' },
  { label: 'TABLE', value: 'TABLE' },
  { label: 'VIEW', value: 'VIEW' },
  { label: 'COLUMN', value: 'COLUMN' },
  { label: 'FOREIGN_KEY', value: 'FOREIGN_KEY' },
];

const AuditTrailPanel: React.FC<AuditTrailPanelProps> = ({
  projectId,
  className,
}) => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [expandedEntry, setExpandedEntry] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Filter state
  const [entityType, setEntityType] = useState('');
  const [entityFqn, setEntityFqn] = useState('');
  const [action, setAction] = useState('');
  const [username, setUsername] = useState('');

  const fetchAudit = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: AuditTrailParams = { limit: 50 };
      if (entityType) params.entity_type = entityType;
      if (entityFqn) params.entity_fqn = entityFqn;
      if (action) params.action = action;
      if (username) params.username = username;

      const result = await getAuditTrail(projectId, params);
      setEntries(result.entries);
      setTotal(result.total);
    } catch (err) {
      toast.error(getApiErrorMessage(err) || 'Failed to load audit trail');
    } finally {
      setIsLoading(false);
    }
  }, [projectId, entityType, entityFqn, action, username]);

  useEffect(() => {
    fetchAudit();
  }, [fetchAudit]);

  const toggleEntry = (id: string) => {
    setExpandedEntry((prev) => (prev === id ? null : id));
  };

  return (
    <div className={cn('border dark:border-slate-700 rounded-lg overflow-hidden', className)}>
      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
        <span className="font-medium text-sm flex items-center gap-2">
          <History className="h-4 w-4 text-purple-500" />
          Audit Trail
          {total > 0 && (
            <Badge size="sm" className="bg-purple-100 text-purple-600 dark:bg-purple-900/30">
              {total} entries
            </Badge>
          )}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="gap-1.5"
          >
            <Filter className="h-3.5 w-3.5" />
            Filters
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchAudit}
            disabled={isLoading}
            className="gap-1.5"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isLoading && 'animate-spin')} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="px-4 py-3 bg-slate-50/50 dark:bg-slate-800/30 border-b dark:border-slate-700 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Entity Type</label>
            <Select
              size="sm"
              options={ENTITY_TYPE_OPTIONS}
              value={entityType}
              onChange={(opt: any) => setEntityType(opt?.value ?? '')}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Action</label>
            <Select
              size="sm"
              options={ACTION_OPTIONS}
              value={action}
              onChange={(opt: any) => setAction(opt?.value ?? '')}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Entity FQN</label>
            <Input
              size="sm"
              placeholder="e.g. RAW.PUBLIC.ORDERS"
              value={entityFqn}
              onChange={(e) => setEntityFqn(e.target.value)}
              prefix={<Search className="h-3.5 w-3.5" />}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Username</label>
            <Input
              size="sm"
              placeholder="Filter by user"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              prefix={<User className="h-3.5 w-3.5" />}
            />
          </div>
        </div>
      )}

      {/* Entries */}
      <div className="divide-y dark:divide-slate-700 max-h-[500px] overflow-auto">
        {isLoading && entries.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-sm text-slate-500">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            Loading audit trail...
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <FileText className="h-6 w-6 mx-auto mb-2 text-slate-300" />
            <p className="text-sm">No audit entries found</p>
            <p className="text-xs mt-1 text-slate-400">Actions will be recorded as you make changes</p>
          </div>
        ) : (
          entries.map((entry) => {
            const isOpen = expandedEntry === entry.audit_id;
            return (
              <div key={entry.audit_id}>
                <button
                  className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
                  onClick={() => toggleEntry(entry.audit_id)}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Badge
                      size="sm"
                      className={cn(
                        'text-xs shrink-0',
                        entry.action === 'DROP'
                          ? 'bg-red-100 text-red-600 dark:bg-red-900/30'
                          : entry.action === 'CREATE'
                          ? 'bg-green-100 text-green-600 dark:bg-green-900/30'
                          : 'bg-blue-100 text-blue-600 dark:bg-blue-900/30',
                      )}
                    >
                      {entry.action}
                    </Badge>
                    <span className="text-sm truncate">
                      <span className="text-slate-500">{entry.entity_type}:</span>{' '}
                      <span className="font-mono text-xs">{entry.entity_fqn}</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 ml-3">
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {entry.username}
                    </span>
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {new Date(entry.timestamp).toLocaleString()}
                    </span>
                    {isOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    )}
                  </div>
                </button>
                {isOpen && (
                  <div className="px-4 pb-3 pl-10 grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1">Old Value</p>
                      <pre className="text-xs text-slate-600 dark:text-slate-400 bg-red-50 dark:bg-red-900/10 rounded p-2 overflow-auto max-h-[200px]">
                        {entry.old_value ? JSON.stringify(entry.old_value, null, 2) : '—'}
                      </pre>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-slate-500 mb-1">New Value</p>
                      <pre className="text-xs text-slate-600 dark:text-slate-400 bg-green-50 dark:bg-green-900/10 rounded p-2 overflow-auto max-h-[200px]">
                        {entry.new_value ? JSON.stringify(entry.new_value, null, 2) : '—'}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AuditTrailPanel;
