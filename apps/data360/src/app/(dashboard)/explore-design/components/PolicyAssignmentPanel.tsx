'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button, Badge, Tooltip, Modal, Select, Input, Text } from 'rizzui';
import { toast } from 'react-hot-toast';
import {
  Shield, Lock, Tag, Eye, Users, X, Plus, ChevronDown, ChevronRight,
  Database, Table2, Columns3, RefreshCw, Check, AlertTriangle, Trash2,
  Info, Settings, Layers, Filter
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { TableItem, ColumnInfo } from '../../mapping/components/VirtualizedTableList';

// Import existing policy services
import {
  getMaskingPolicies,
  getRLSPolicies,
  getTags,
  getAggregationPolicies,
  applyMaskingPolicy,
  applyRLSPolicy,
  applyTag,
  applyAggregationPolicy,
  removeMaskingPolicy,
  removeRLSPolicy,
  removeTag,
  removeAggregationPolicy,
  MaskingPolicy,
  RLSPolicy,
  Tag as TagType,
  AggregationPolicy,
  MaskingType,
} from '@/app/services/gouvernance/policies';

// Policy types that can be applied
type PolicyCategory = 'masking' | 'rls' | 'tags' | 'aggregation';

// Applied policy info
interface AppliedPolicy {
  type: PolicyCategory;
  name: string;
  target: string; // column name for masking/tags, table for RLS/aggregation
  details?: string;
}

interface PolicyAssignmentPanelProps {
  table: TableItem | null;
  columns: ColumnInfo[];
  selectedColumn?: string | null;
  onPolicyApplied?: (policy: AppliedPolicy) => void;
  onClose?: () => void;
  className?: string;
}

// Policy Category Tab
const PolicyTab: React.FC<{
  category: PolicyCategory;
  label: string;
  icon: React.ElementType;
  active: boolean;
  onClick: () => void;
  count?: number;
}> = ({ category, label, icon: Icon, active, onClick, count }) => (
  <button
    className={cn(
      'flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg transition-colors',
      active
        ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300'
        : 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800'
    )}
    onClick={onClick}
  >
    <Icon className="h-4 w-4" />
    {label}
    {count !== undefined && count > 0 && (
      <Badge className="ml-1 bg-blue-500 text-white text-xs">{count}</Badge>
    )}
  </button>
);

// Masking Policy Section
const MaskingPolicySection: React.FC<{
  table: TableItem;
  columns: ColumnInfo[];
  selectedColumn?: string | null;
  onApply: (policy: AppliedPolicy) => void;
}> = ({ table, columns, selectedColumn, onApply }) => {
  const [policies, setPolicies] = useState<MaskingPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<string>('');
  const [targetColumn, setTargetColumn] = useState<string>(selectedColumn || '');
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    loadPolicies();
  }, []);

  useEffect(() => {
    if (selectedColumn) {
      setTargetColumn(selectedColumn);
    }
  }, [selectedColumn]);

  const loadPolicies = async () => {
    setLoading(true);
    try {
      const data = await getMaskingPolicies();
      setPolicies(data);
    } catch (error) {
      console.error('Failed to load masking policies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!selectedPolicy || !targetColumn) {
      toast.error('Please select a policy and column');
      return;
    }

    setApplying(true);
    try {
      await applyMaskingPolicy({
        policy_name: selectedPolicy,
        database: table.database,
        schema: table.schema,
        table: table.table,
        column: targetColumn,
      });
      toast.success(`Masking policy "${selectedPolicy}" applied to ${targetColumn}`);
      onApply({
        type: 'masking',
        name: selectedPolicy,
        target: targetColumn,
      });
      setSelectedPolicy('');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to apply masking policy');
    } finally {
      setApplying(false);
    }
  };

  const sensitiveColumns = columns.filter(c => c.isSensitive);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Text className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Apply Masking Policy
        </Text>
        <Button
          variant="text"
          size="sm"
          onClick={loadPolicies}
          className="gap-1"
        >
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Auto-detected sensitive columns */}
      {sensitiveColumns.length > 0 && (
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400 mb-2">
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">Sensitive Columns Detected</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {sensitiveColumns.map(col => (
              <button
                key={col.name}
                className={cn(
                  'px-2 py-1 text-xs rounded-full transition-colors',
                  targetColumn === col.name
                    ? 'bg-amber-500 text-white'
                    : 'bg-amber-100 dark:bg-amber-800 text-amber-700 dark:text-amber-300 hover:bg-amber-200'
                )}
                onClick={() => setTargetColumn(col.name)}
              >
                {col.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Policy selector */}
      <div className="space-y-3">
        <Select
          label="Select Masking Policy"
          options={policies.map(p => ({
            label: `${p.policy_name} (${p.data_type})`,
            value: p.policy_name,
          }))}
          value={selectedPolicy}
          onChange={(val: any) => setSelectedPolicy(typeof val === 'object' ? val?.value : val)}
          placeholder={loading ? 'Loading policies...' : 'Choose a policy'}
          disabled={loading}
        />

        <Select
          label="Target Column"
          options={columns.map(c => ({
            label: `${c.name} (${c.dataType || 'unknown'})`,
            value: c.name,
          }))}
          value={targetColumn}
          onChange={(val: any) => setTargetColumn(typeof val === 'object' ? val?.value : val)}
          placeholder="Select column to mask"
        />

        <Button
          className="w-full gap-2"
          onClick={handleApply}
          disabled={!selectedPolicy || !targetColumn || applying}
        >
          {applying ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Shield className="h-4 w-4" />
          )}
          Apply Masking Policy
        </Button>
      </div>

      {/* Available policies list */}
      <div className="mt-4">
        <Text className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
          Available Policies ({policies.length})
        </Text>
        <div className="max-h-48 overflow-auto space-y-1">
          {policies.map(policy => (
            <div
              key={policy.policy_name}
              className={cn(
                'flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors',
                selectedPolicy === policy.policy_name
                  ? 'bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800'
                  : 'hover:bg-slate-50 dark:hover:bg-slate-800'
              )}
              onClick={() => setSelectedPolicy(policy.policy_name)}
            >
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-green-500" />
                <span className="text-sm font-medium">{policy.policy_name}</span>
              </div>
              <Badge className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                {policy.data_type}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// RLS Policy Section
const RLSPolicySection: React.FC<{
  table: TableItem;
  columns: ColumnInfo[];
  onApply: (policy: AppliedPolicy) => void;
}> = ({ table, columns, onApply }) => {
  const [policies, setPolicies] = useState<RLSPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<string>('');
  const [filterColumn, setFilterColumn] = useState<string>('');
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    loadPolicies();
  }, []);

  const loadPolicies = async () => {
    setLoading(true);
    try {
      const data = await getRLSPolicies();
      setPolicies(data);
    } catch (error) {
      console.error('Failed to load RLS policies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!selectedPolicy || !filterColumn) {
      toast.error('Please select a policy and filter column');
      return;
    }

    setApplying(true);
    try {
      await applyRLSPolicy({
        policy_name: selectedPolicy,
        table_name: table.table,
        database: table.database,
        schema: table.schema,
        policy_column: filterColumn,
      });
      toast.success(`RLS policy "${selectedPolicy}" applied to ${table.table}`);
      onApply({
        type: 'rls',
        name: selectedPolicy,
        target: table.table,
        details: `Filter column: ${filterColumn}`,
      });
      setSelectedPolicy('');
      setFilterColumn('');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to apply RLS policy');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Text className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Apply Row-Level Security (RLS)
        </Text>
        <Button variant="text" size="sm" onClick={loadPolicies} className="gap-1">
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 mb-1">
          <Info className="h-4 w-4" />
          <span className="text-sm font-medium">About RLS Policies</span>
        </div>
        <p className="text-xs text-blue-600 dark:text-blue-300">
          Row-Level Security restricts which rows users can access based on their role or attributes.
        </p>
      </div>

      <div className="space-y-3">
        <Select
          label="Select RLS Policy"
          options={policies.map(p => ({
            label: p.policy_name,
            value: p.policy_name,
          }))}
          value={selectedPolicy}
          onChange={(val: any) => setSelectedPolicy(typeof val === 'object' ? val?.value : val)}
          placeholder={loading ? 'Loading policies...' : 'Choose a policy'}
          disabled={loading}
        />

        <Select
          label="Filter Column"
          options={columns.map(c => ({
            label: `${c.name} (${c.dataType || 'unknown'})`,
            value: c.name,
          }))}
          value={filterColumn}
          onChange={(val: any) => setFilterColumn(typeof val === 'object' ? val?.value : val)}
          placeholder="Column to filter on"
        />

        <Button
          className="w-full gap-2"
          onClick={handleApply}
          disabled={!selectedPolicy || !filterColumn || applying}
        >
          {applying ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Eye className="h-4 w-4" />
          )}
          Apply RLS Policy
        </Button>
      </div>

      {/* Policy details */}
      {selectedPolicy && (
        <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <Text className="text-xs font-medium text-slate-500 mb-2">Policy Expression</Text>
          <code className="text-xs text-slate-700 dark:text-slate-300 block whitespace-pre-wrap">
            {policies.find(p => p.policy_name === selectedPolicy)?.expression || 'N/A'}
          </code>
        </div>
      )}
    </div>
  );
};

// Tags Section
const TagsSection: React.FC<{
  table: TableItem;
  columns: ColumnInfo[];
  selectedColumn?: string | null;
  onApply: (policy: AppliedPolicy) => void;
}> = ({ table, columns, selectedColumn, onApply }) => {
  const [tags, setTags] = useState<TagType[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTag, setSelectedTag] = useState<string>('');
  const [tagValue, setTagValue] = useState<string>('');
  const [objectType, setObjectType] = useState<'table' | 'column'>('table');
  const [targetColumn, setTargetColumn] = useState<string>(selectedColumn || '');
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    loadTags();
  }, []);

  useEffect(() => {
    if (selectedColumn) {
      setTargetColumn(selectedColumn);
      setObjectType('column');
    }
  }, [selectedColumn]);

  const loadTags = async () => {
    setLoading(true);
    try {
      const data = await getTags();
      setTags(data);
    } catch (error) {
      console.error('Failed to load tags:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!selectedTag || !tagValue) {
      toast.error('Please select a tag and enter a value');
      return;
    }

    if (objectType === 'column' && !targetColumn) {
      toast.error('Please select a target column');
      return;
    }

    setApplying(true);
    try {
      await applyTag({
        tag_name: selectedTag,
        tag_value: tagValue,
        object_type: objectType.toUpperCase(),
        database: table.database,
        schema: table.schema,
        table: table.table,
        column: objectType === 'column' ? targetColumn : undefined,
      });
      toast.success(`Tag "${selectedTag}" applied`);
      onApply({
        type: 'tags',
        name: selectedTag,
        target: objectType === 'column' ? targetColumn : table.table,
        details: `Value: ${tagValue}`,
      });
      setSelectedTag('');
      setTagValue('');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to apply tag');
    } finally {
      setApplying(false);
    }
  };

  const selectedTagDetails = tags.find(t => t.tag_name === selectedTag);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Text className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Apply Classification Tags
        </Text>
        <Button variant="text" size="sm" onClick={loadTags} className="gap-1">
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Object type selector */}
      <div className="flex gap-2">
        <button
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border transition-colors',
            objectType === 'table'
              ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700'
              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
          )}
          onClick={() => setObjectType('table')}
        >
          <Table2 className="h-4 w-4" />
          Table
        </button>
        <button
          className={cn(
            'flex-1 flex items-center justify-center gap-2 py-2 rounded-lg border transition-colors',
            objectType === 'column'
              ? 'bg-blue-50 border-blue-300 text-blue-700 dark:bg-blue-900/30 dark:border-blue-700'
              : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
          )}
          onClick={() => setObjectType('column')}
        >
          <Columns3 className="h-4 w-4" />
          Column
        </button>
      </div>

      <div className="space-y-3">
        <Select
          label="Select Tag"
          options={tags.map(t => ({
            label: t.tag_name,
            value: t.tag_name,
          }))}
          value={selectedTag}
          onChange={(val: any) => {
            const tagName = typeof val === 'object' ? val?.value : val;
            setSelectedTag(tagName);
            setTagValue('');
          }}
          placeholder={loading ? 'Loading tags...' : 'Choose a tag'}
          disabled={loading}
        />

        {selectedTagDetails?.allowed_values ? (
          <Select
            label="Tag Value"
            options={selectedTagDetails.allowed_values.split(',').map(v => ({
              label: v.trim(),
              value: v.trim(),
            }))}
            value={tagValue}
            onChange={(val: any) => setTagValue(typeof val === 'object' ? val?.value : val)}
            placeholder="Select allowed value"
          />
        ) : (
          <Input
            label="Tag Value"
            value={tagValue}
            onChange={(e) => setTagValue(e.target.value)}
            placeholder="Enter tag value"
          />
        )}

        {objectType === 'column' && (
          <Select
            label="Target Column"
            options={columns.map(c => ({
              label: `${c.name} (${c.dataType || 'unknown'})`,
              value: c.name,
            }))}
            value={targetColumn}
            onChange={(val: any) => setTargetColumn(typeof val === 'object' ? val?.value : val)}
            placeholder="Select column"
          />
        )}

        <Button
          className="w-full gap-2"
          onClick={handleApply}
          disabled={!selectedTag || !tagValue || applying || (objectType === 'column' && !targetColumn)}
        >
          {applying ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Tag className="h-4 w-4" />
          )}
          Apply Tag
        </Button>
      </div>

      {/* Common sensitivity tags */}
      <div>
        <Text className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
          Quick Apply - Sensitivity Tags
        </Text>
        <div className="flex flex-wrap gap-2">
          {['PII', 'PHI', 'PCI', 'CONFIDENTIAL', 'PUBLIC'].map(level => (
            <button
              key={level}
              className="px-3 py-1 text-xs rounded-full border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              onClick={() => {
                setSelectedTag('SENSITIVITY');
                setTagValue(level);
              }}
            >
              {level}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

// Aggregation Policy Section
const AggregationPolicySection: React.FC<{
  table: TableItem;
  onApply: (policy: AppliedPolicy) => void;
}> = ({ table, onApply }) => {
  const [policies, setPolicies] = useState<AggregationPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<string>('');
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    loadPolicies();
  }, []);

  const loadPolicies = async () => {
    setLoading(true);
    try {
      const data = await getAggregationPolicies();
      setPolicies(data);
    } catch (error) {
      console.error('Failed to load aggregation policies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async () => {
    if (!selectedPolicy) {
      toast.error('Please select a policy');
      return;
    }

    setApplying(true);
    try {
      await applyAggregationPolicy({
        policy_name: selectedPolicy,
        database: table.database,
        schema: table.schema,
        table: table.table,
      });
      toast.success(`Aggregation policy "${selectedPolicy}" applied to ${table.table}`);
      onApply({
        type: 'aggregation',
        name: selectedPolicy,
        target: table.table,
      });
      setSelectedPolicy('');
    } catch (error: any) {
      toast.error(error.response?.data?.message || 'Failed to apply aggregation policy');
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Text className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Apply Aggregation Policy
        </Text>
        <Button variant="text" size="sm" onClick={loadPolicies} className="gap-1">
          <RefreshCw className={cn('h-3 w-3', loading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
        <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400 mb-1">
          <Info className="h-4 w-4" />
          <span className="text-sm font-medium">About Aggregation Policies</span>
        </div>
        <p className="text-xs text-purple-600 dark:text-purple-300">
          Aggregation policies enforce minimum group sizes to prevent individual record identification.
        </p>
      </div>

      <div className="space-y-3">
        <Select
          label="Select Aggregation Policy"
          options={policies.map(p => ({
            label: p.policy_name,
            value: p.policy_name,
          }))}
          value={selectedPolicy}
          onChange={(val: any) => setSelectedPolicy(typeof val === 'object' ? val?.value : val)}
          placeholder={loading ? 'Loading policies...' : 'Choose a policy'}
          disabled={loading}
        />

        <Button
          className="w-full gap-2"
          onClick={handleApply}
          disabled={!selectedPolicy || applying}
        >
          {applying ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Layers className="h-4 w-4" />
          )}
          Apply Aggregation Policy
        </Button>
      </div>

      {/* Policy constraint preview */}
      {selectedPolicy && (
        <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
          <Text className="text-xs font-medium text-slate-500 mb-2">Constraint</Text>
          <code className="text-xs text-slate-700 dark:text-slate-300 block whitespace-pre-wrap">
            {policies.find(p => p.policy_name === selectedPolicy)?.aggregation_constraint || 'N/A'}
          </code>
        </div>
      )}
    </div>
  );
};

// Main Panel Component
const PolicyAssignmentPanel: React.FC<PolicyAssignmentPanelProps> = ({
  table,
  columns,
  selectedColumn,
  onPolicyApplied,
  onClose,
  className,
}) => {
  const [activeTab, setActiveTab] = useState<PolicyCategory>('masking');
  const [appliedPolicies, setAppliedPolicies] = useState<AppliedPolicy[]>([]);

  if (!table) {
    return (
      <div className={cn('p-6 text-center', className)}>
        <Shield className="h-12 w-12 text-slate-300 mx-auto mb-3" />
        <Text className="text-slate-500">Select a table to configure policies</Text>
      </div>
    );
  }

  const handlePolicyApplied = (policy: AppliedPolicy) => {
    setAppliedPolicies(prev => [...prev, policy]);
    onPolicyApplied?.(policy);
  };

  return (
    <div className={cn('flex flex-col h-full', className)}>
      {/* Header */}
      <div className="px-4 py-3 border-b dark:border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-blue-500" />
          <div>
            <Text className="font-medium">{table.table}</Text>
            <Text className="text-xs text-slate-500">{table.database}.{table.schema}</Text>
          </div>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="px-4 py-2 border-b dark:border-slate-700 flex gap-1 overflow-x-auto">
        <PolicyTab
          category="masking"
          label="Masking"
          icon={Lock}
          active={activeTab === 'masking'}
          onClick={() => setActiveTab('masking')}
        />
        <PolicyTab
          category="rls"
          label="RLS"
          icon={Eye}
          active={activeTab === 'rls'}
          onClick={() => setActiveTab('rls')}
        />
        <PolicyTab
          category="tags"
          label="Tags"
          icon={Tag}
          active={activeTab === 'tags'}
          onClick={() => setActiveTab('tags')}
        />
        <PolicyTab
          category="aggregation"
          label="Aggregation"
          icon={Layers}
          active={activeTab === 'aggregation'}
          onClick={() => setActiveTab('aggregation')}
        />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {activeTab === 'masking' && (
          <MaskingPolicySection
            table={table}
            columns={columns}
            selectedColumn={selectedColumn}
            onApply={handlePolicyApplied}
          />
        )}
        {activeTab === 'rls' && (
          <RLSPolicySection
            table={table}
            columns={columns}
            onApply={handlePolicyApplied}
          />
        )}
        {activeTab === 'tags' && (
          <TagsSection
            table={table}
            columns={columns}
            selectedColumn={selectedColumn}
            onApply={handlePolicyApplied}
          />
        )}
        {activeTab === 'aggregation' && (
          <AggregationPolicySection
            table={table}
            onApply={handlePolicyApplied}
          />
        )}
      </div>

      {/* Applied policies summary */}
      {appliedPolicies.length > 0 && (
        <div className="px-4 py-3 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
          <Text className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
            Applied in this session
          </Text>
          <div className="space-y-1 max-h-32 overflow-auto">
            {appliedPolicies.map((p, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <Check className="h-3 w-3 text-green-500" />
                <span className="font-medium">{p.name}</span>
                <span className="text-slate-400">→</span>
                <span>{p.target}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PolicyAssignmentPanel;
