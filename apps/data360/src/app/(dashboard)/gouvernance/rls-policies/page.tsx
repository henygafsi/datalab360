'use client';

import { useState, useEffect } from 'react';
import { Button, Badge, Input, Modal, Select } from 'rizzui';
import {
  HiOutlineLockClosed,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlineCheckCircle,
  HiOutlineXCircle,
  HiOutlinePlay,
  HiOutlineStop,
} from 'react-icons/hi2';
import { toast } from 'react-hot-toast';
import {
  getRLSPolicies,
  createRLSPolicy,
  applyRLSPolicy,
  removeRLSPolicy,
  RLSPolicy,
} from '@/app/services/gouvernance/security-matrix';
import { getDatabases } from '@/app/services/mapping/getDatabases';
import { getSchemas } from '@/app/services/mapping/getSchema';
import { getTablesTarget } from '@/app/services/mapping/getTablesTarget';

// Modern Card Component
const ModernCard = ({ children, className = '', ...props }: { children: React.ReactNode; className?: string }) => {
  return (
    <div
      className={`bg-white/80 dark:bg-slate-800/80 backdrop-blur-sm rounded-2xl border border-slate-200/60 dark:border-slate-700/60 shadow-lg shadow-slate-200/20 dark:shadow-slate-900/20 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};

export default function RLSPoliciesPage() {
  const [policies, setPolicies] = useState<RLSPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  // Explicit error state so a failed list load is surfaced instead of an empty list.
  const [error, setError] = useState<string | null>(null);
  // Apply runs `ALTER TABLE ... ADD ROW ACCESS POLICY` on Snowflake — track RUNNING + elapsed.
  const [isApplying, setIsApplying] = useState(false);
  const [applyElapsedMs, setApplyElapsedMs] = useState(0);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showApplyModal, setShowApplyModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<RLSPolicy | null>(null);

  const [databases, setDatabases] = useState<string[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [tables, setTables] = useState<string[]>([]);

  const [formData, setFormData] = useState({
    policy_name: '',
    database: '',
    schema: '',
    table_name: '',
    filter_expression: '',
    description: '',
  });

  const [applyForm, setApplyForm] = useState({
    database: '',
    schema: '',
    table_name: '',
  });

  useEffect(() => {
    loadPolicies();
    loadDatabases();
  }, []);

  useEffect(() => {
    if (formData.database) {
      loadSchemas(formData.database);
    }
  }, [formData.database]);

  useEffect(() => {
    if (formData.database && formData.schema) {
      loadTables(formData.database, formData.schema);
    }
  }, [formData.database, formData.schema]);

  const loadDatabases = async () => {
    try {
      const dbs = await getDatabases();
      setDatabases(dbs || []);
    } catch (error) {
      console.error('Error loading databases:', error);
    }
  };

  const loadSchemas = async (database: string) => {
    try {
      const schs = await getSchemas(database);
      setSchemas(schs || []);
    } catch (error) {
      console.error('Error loading schemas:', error);
    }
  };

  const loadTables = async (database: string, schema: string) => {
    try {
      const tbls = await getTablesTarget(database, schema);
      setTables(tbls || []);
    } catch (error) {
      console.error('Error loading tables:', error);
    }
  };

  // Extract the most useful message from the centralized error envelope
  // ({ error: { message }, detail, snowflake{...} }) or a plain Error.
  const extractError = (err: any, fallback: string): string =>
    err?.response?.data?.error?.message ||
    err?.response?.data?.detail ||
    err?.response?.data?.message ||
    err?.message ||
    fallback;

  const loadPolicies = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getRLSPolicies();
      setPolicies(data);
    } catch (err: any) {
      const message = extractError(err, 'Failed to load RLS policies');
      setError(message);
      setPolicies([]);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      await createRLSPolicy({
        policy_name: formData.policy_name,
        table_name: formData.table_name,
        database: formData.database,
        schema: formData.schema,
        filter_expression: formData.filter_expression,
        description: formData.description,
      });
      toast.success('RLS Policy created successfully');
      setShowCreateModal(false);
      resetForm();
      loadPolicies();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to create RLS policy');
    }
  };

  const handleApply = async () => {
    if (!selectedPolicy) return;
    setIsApplying(true);
    setApplyElapsedMs(0);
    const startedAt = Date.now();
    // Tick elapsed time while Snowflake executes the ALTER TABLE ... ADD ROW ACCESS POLICY DDL.
    const timer = setInterval(() => setApplyElapsedMs(Date.now() - startedAt), 200);
    try {
      await applyRLSPolicy(
        selectedPolicy.policy_name,
        applyForm.table_name,
        applyForm.database,
        applyForm.schema
      );
      toast.success('RLS Policy applied successfully');
      setShowApplyModal(false);
      setSelectedPolicy(null);
      resetApplyForm();
      loadPolicies();
    } catch (err: any) {
      toast.error(extractError(err, 'Failed to apply RLS policy'));
    } finally {
      clearInterval(timer);
      setIsApplying(false);
    }
  };

  const handleRemove = async (policy: RLSPolicy) => {
    if (!confirm(`Remove RLS policy from ${policy.table_name}?`)) return;
    try {
      await removeRLSPolicy(policy.table_name, policy.database, policy.schema);
      toast.success('RLS Policy removed successfully');
      loadPolicies();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to remove RLS policy');
    }
  };

  const resetForm = () => {
    setFormData({
      policy_name: '',
      database: '',
      schema: '',
      table_name: '',
      filter_expression: '',
      description: '',
    });
  };

  const resetApplyForm = () => {
    setApplyForm({
      database: '',
      schema: '',
      table_name: '',
    });
  };

  const Breadcrumb = () => {
    return (
      <nav className="mb-8">
        <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
          <span className="hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer transition-colors">Home</span>
          <span>/</span>
          <span className="hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer transition-colors">Governance</span>
          <span>/</span>
          <span className="text-slate-900 dark:text-slate-200 font-medium">RLS Policies</span>
        </div>
      </nav>
    );
  };

  const stats = {
    total: policies.length,
    active: policies.filter(p => p.active).length,
    inactive: policies.filter(p => !p.active).length,
  };

  return (
    <div className="space-y-8">
      <Breadcrumb />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-xl shadow-indigo-500/25">
            <HiOutlineLockClosed className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
              Row Level Security (RLS)
            </h1>
            <p className="text-slate-600 dark:text-slate-400 text-lg">
              Control row-level access to data based on security matrix filters
            </p>
          </div>
        </div>

        <Button
          onClick={() => setShowCreateModal(true)}
          className="bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white shadow-lg shadow-indigo-500/30"
        >
          <HiOutlinePlus className="w-5 h-5 mr-2" />
          Create RLS Policy
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ModernCard className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Total Policies</p>
              <p className="text-3xl font-bold text-slate-900 dark:text-white">{stats.total}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-100 to-indigo-100 dark:from-blue-900/30 dark:to-indigo-900/30 flex items-center justify-center">
              <HiOutlineLockClosed className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
        </ModernCard>

        <ModernCard className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Active</p>
              <p className="text-3xl font-bold text-green-600">{stats.active}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-100 to-emerald-100 dark:from-green-900/30 dark:to-emerald-900/30 flex items-center justify-center">
              <HiOutlineCheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
        </ModernCard>

        <ModernCard className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-600 dark:text-slate-400">Inactive</p>
              <p className="text-3xl font-bold text-slate-600">{stats.inactive}</p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-600 flex items-center justify-center">
              <HiOutlineXCircle className="w-6 h-6 text-slate-600 dark:text-slate-400" />
            </div>
          </div>
        </ModernCard>
      </div>

      {/* Policies List */}
      <ModernCard className="p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white">RLS Policies</h2>
          <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
            {policies.length} policies
          </Badge>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="mt-4 text-slate-600 dark:text-slate-400">Loading RLS policies...</p>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center dark:border-red-800 dark:bg-red-900/20">
            <HiOutlineXCircle className="mx-auto mb-3 h-12 w-12 text-red-500" />
            <p className="font-semibold text-red-800 dark:text-red-300">Failed to load RLS policies</p>
            <p className="mt-1 text-sm text-red-700 dark:text-red-400 break-words">{error}</p>
            <Button onClick={loadPolicies} variant="outline" className="mt-4 border-red-300 text-red-700 hover:bg-red-100 dark:border-red-700 dark:text-red-300">
              Retry
            </Button>
          </div>
        ) : policies.length === 0 ? (
          <div className="text-center py-12">
            <HiOutlineLockClosed className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-400">No RLS policies created yet</p>
            <Button onClick={() => setShowCreateModal(true)} className="mt-4">
              Create your first policy
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {policies.map((policy, idx) => (
              <div
                key={idx}
                className="p-6 border border-slate-200 dark:border-slate-700 rounded-xl hover:shadow-md transition-all duration-200"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">{policy.policy_name}</h3>
                      {policy.active ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                          <HiOutlineCheckCircle className="w-3 h-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-600">
                          <HiOutlineXCircle className="w-3 h-3 mr-1" />
                          Inactive
                        </Badge>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">Table</p>
                        <p className="font-medium text-slate-900 dark:text-white">
                          {policy.database}.{policy.schema}.{policy.table_name}
                        </p>
                      </div>
                      <div>
                        <p className="text-slate-500 dark:text-slate-400">Filter Expression</p>
                        <code className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                          {policy.filter_expression}
                        </code>
                      </div>
                    </div>

                    {policy.description && (
                      <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">{policy.description}</p>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedPolicy(policy);
                        setShowApplyModal(true);
                      }}
                      className="text-blue-600 hover:bg-blue-50"
                    >
                      <HiOutlinePlay className="w-4 h-4 mr-1" />
                      Apply
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRemove(policy)}
                      className="text-red-600 hover:bg-red-50"
                    >
                      <HiOutlineTrash className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ModernCard>

      {/* Create Modal */}
      <Modal isOpen={showCreateModal} onClose={() => { setShowCreateModal(false); resetForm(); }}>
        <div className="p-6 space-y-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center">
              <HiOutlinePlus className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Create RLS Policy</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">Define row-level security filter</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Policy Name</label>
              <Input
                value={formData.policy_name}
                onChange={(e) => setFormData({ ...formData, policy_name: e.target.value })}
                placeholder="e.g., restrict_by_region"
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Database</label>
                <Select
                  options={[
                    { label: 'Select Database', value: '' },
                    ...databases.map(db => ({ label: db, value: db }))
                  ]}
                  value={formData.database}
                  onChange={(value: any) => setFormData({ ...formData, database: value?.value || value || '', schema: '', table_name: '' })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Schema</label>
                <Select
                  options={[
                    { label: 'Select Schema', value: '' },
                    ...schemas.map(sch => ({ label: sch, value: sch }))
                  ]}
                  value={formData.schema}
                  onChange={(value: any) => setFormData({ ...formData, schema: value?.value || value || '', table_name: '' })}
                  disabled={!formData.database}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Table</label>
                <Select
                  options={[
                    { label: 'Select Table', value: '' },
                    ...tables.map(tbl => ({ label: tbl, value: tbl }))
                  ]}
                  value={formData.table_name}
                  onChange={(value: any) => setFormData({ ...formData, table_name: value?.value || value || '' })}
                  disabled={!formData.schema}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Filter Expression (SQL)
              </label>
              <textarea
                value={formData.filter_expression}
                onChange={(e) => setFormData({ ...formData, filter_expression: e.target.value })}
                placeholder="e.g., region = CURRENT_USER_REGION() AND department = CURRENT_USER_DEPARTMENT()"
                rows={4}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-sm"
              />
              <p className="mt-2 text-xs text-slate-500">Use SQL WHERE clause syntax with security matrix functions</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Description</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Optional description"
              />
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={() => { setShowCreateModal(false); resetForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={handleCreate}
              disabled={!formData.policy_name || !formData.filter_expression || !formData.table_name}
              className="bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 text-white"
            >
              Create Policy
            </Button>
          </div>
        </div>
      </Modal>

      {/* Apply Modal */}
      <Modal isOpen={showApplyModal} onClose={() => { setShowApplyModal(false); setSelectedPolicy(null); resetApplyForm(); }}>
        <div className="p-6 space-y-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
              <HiOutlinePlay className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Apply RLS Policy</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Apply "{selectedPolicy?.policy_name}" to a table
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Database</label>
                <Select
                  options={[
                    { label: 'Select Database', value: '' },
                    ...databases.map(db => ({ label: db, value: db }))
                  ]}
                  value={applyForm.database}
                  onChange={(value: any) => setApplyForm({ ...applyForm, database: value?.value || value || '', schema: '', table_name: '' })}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Schema</label>
                <Select
                  options={[
                    { label: 'Select Schema', value: '' },
                    ...schemas.map(sch => ({ label: sch, value: sch }))
                  ]}
                  value={applyForm.schema}
                  onChange={(value: any) => setApplyForm({ ...applyForm, schema: value?.value || value || '', table_name: '' })}
                  disabled={!applyForm.database}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Table</label>
                <Select
                  options={[
                    { label: 'Select Table', value: '' },
                    ...tables.map(tbl => ({ label: tbl, value: tbl }))
                  ]}
                  value={applyForm.table_name}
                  onChange={(value: any) => setApplyForm({ ...applyForm, table_name: value?.value || value || '' })}
                  disabled={!applyForm.schema}
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <Button variant="outline" disabled={isApplying} onClick={() => { setShowApplyModal(false); setSelectedPolicy(null); resetApplyForm(); }}>
              Cancel
            </Button>
            <Button
              onClick={handleApply}
              disabled={!applyForm.table_name || isApplying}
              className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white disabled:opacity-60"
            >
              {isApplying
                ? `Applying on Snowflake... ${(applyElapsedMs / 1000).toFixed(1)}s`
                : 'Apply Policy'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
