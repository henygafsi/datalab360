'use client';

import { useState, useEffect } from 'react';
import { Button, Badge, Input, Select, Modal, Text } from 'rizzui';
import {
  HiOutlineGlobeAlt,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlinePencil,
  HiOutlineShieldCheck,
  HiOutlineServer,
} from 'react-icons/hi2';
import { toast } from 'react-hot-toast';

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

interface NetworkPolicy {
  id: string;
  name: string;
  type: 'allow' | 'deny';
  ip_ranges: string[];
  description?: string;
  created_at: string;
  updated_at: string;
}

export default function NetworkPoliciesPage() {
  const [policies, setPolicies] = useState<NetworkPolicy[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<NetworkPolicy | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'allow' as 'allow' | 'deny',
    description: '',
    ip_ranges: '',
  });

  useEffect(() => {
    loadPolicies();
  }, []);

  const loadPolicies = async () => {
    try {
      setLoading(true);
      // TODO: Replace with actual API call
      // const data = await getNetworkPolicies();
      // setPolicies(data);

      // Mock data for now
      setPolicies([
        {
          id: '1',
          name: 'Corporate Network',
          type: 'allow',
          ip_ranges: ['10.0.0.0/8', '172.16.0.0/12'],
          description: 'Allow access from corporate network',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        {
          id: '2',
          name: 'Block Suspicious IPs',
          type: 'deny',
          ip_ranges: ['192.168.100.0/24'],
          description: 'Block known malicious IP ranges',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ]);
    } catch (error: any) {
      toast.error(error.message || 'Failed to load network policies');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    try {
      const ip_ranges = formData.ip_ranges.split(',').map(ip => ip.trim()).filter(Boolean);

      // TODO: Replace with actual API call
      // await createNetworkPolicy({
      //   name: formData.name,
      //   type: formData.type,
      //   description: formData.description,
      //   ip_ranges,
      // });

      const newPolicy: NetworkPolicy = {
        id: Date.now().toString(),
        name: formData.name,
        type: formData.type,
        ip_ranges,
        description: formData.description,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      setPolicies([...policies, newPolicy]);
      toast.success('Network policy created successfully');
      setShowAddModal(false);
      resetForm();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to create network policy');
    }
  };

  const handleUpdate = async () => {
    if (!editingPolicy) return;
    try {
      const ip_ranges = formData.ip_ranges.split(',').map(ip => ip.trim()).filter(Boolean);

      // TODO: Replace with actual API call
      // await updateNetworkPolicy(editingPolicy.id, {
      //   name: formData.name,
      //   description: formData.description,
      //   ip_ranges,
      // });

      setPolicies(policies.map(p =>
        p.id === editingPolicy.id
          ? { ...p, name: formData.name, description: formData.description, ip_ranges, updated_at: new Date().toISOString() }
          : p
      ));

      toast.success('Network policy updated successfully');
      setEditingPolicy(null);
      resetForm();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update network policy');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this network policy?')) return;
    try {
      // TODO: Replace with actual API call
      // await deleteNetworkPolicy(id);

      setPolicies(policies.filter(p => p.id !== id));
      toast.success('Network policy deleted successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to delete network policy');
    }
  };

  const handleEdit = (policy: NetworkPolicy) => {
    setEditingPolicy(policy);
    setFormData({
      name: policy.name,
      type: policy.type,
      description: policy.description || '',
      ip_ranges: policy.ip_ranges.join(', '),
    });
  };

  const resetForm = () => {
    setFormData({ name: '', type: 'allow', description: '', ip_ranges: '' });
  };

  const Breadcrumb = () => {
    return (
      <nav className="mb-8">
        <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
          <span className="hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer transition-colors">Home</span>
          <span>/</span>
          <span className="hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer transition-colors">Governance</span>
          <span>/</span>
          <span className="text-slate-900 dark:text-slate-200 font-medium">Network Policies</span>
        </div>
      </nav>
    );
  };

  const allowCount = policies.filter(p => p.type === 'allow').length;
  const denyCount = policies.filter(p => p.type === 'deny').length;
  const totalIPs = policies.reduce((sum, p) => sum + p.ip_ranges.length, 0);

  return (
    <div className="space-y-8">
      <Breadcrumb />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center shadow-xl shadow-blue-500/25">
            <HiOutlineGlobeAlt className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
              Network Policies
            </h1>
            <p className="text-slate-600 dark:text-slate-400 text-lg">
              Manage IP-based access control policies for your Snowflake account
            </p>
          </div>
        </div>

        <Button
          onClick={() => setShowAddModal(true)}
          className="bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white shadow-lg shadow-blue-500/30"
        >
          <HiOutlinePlus className="w-5 h-5 mr-2" />
          Add Network Policy
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <ModernCard className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-green-500 to-emerald-600 flex items-center justify-center">
                <HiOutlineShieldCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Allow Policies</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{allowCount}</p>
              </div>
            </div>
          </div>
        </ModernCard>

        <ModernCard className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-rose-600 flex items-center justify-center">
                <HiOutlineShieldCheck className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Deny Policies</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{denyCount}</p>
              </div>
            </div>
          </div>
        </ModernCard>

        <ModernCard className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center">
                <HiOutlineServer className="w-6 h-6 text-white" />
              </div>
              <div>
                <p className="text-sm text-slate-600 dark:text-slate-400">Total IP Ranges</p>
                <p className="text-2xl font-bold text-slate-900 dark:text-white">{totalIPs}</p>
              </div>
            </div>
          </div>
        </ModernCard>
      </div>

      {/* Policies Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {loading ? (
          <div className="col-span-2 text-center py-12">
            <div className="inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="mt-4 text-slate-600 dark:text-slate-400">Loading network policies...</p>
          </div>
        ) : policies.length === 0 ? (
          <div className="col-span-2 text-center py-12">
            <HiOutlineGlobeAlt className="w-16 h-16 text-slate-300 dark:text-slate-600 mx-auto mb-4" />
            <p className="text-slate-600 dark:text-slate-400">No network policies defined yet</p>
            <Button onClick={() => setShowAddModal(true)} className="mt-4">
              Create your first policy
            </Button>
          </div>
        ) : (
          policies.map((policy) => {
            const colorClass = policy.type === 'allow'
              ? 'from-green-500 to-emerald-600 border-green-200 dark:border-green-700'
              : 'from-red-500 to-rose-600 border-red-200 dark:border-red-700';

            const badgeClass = policy.type === 'allow'
              ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
              : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';

            return (
              <ModernCard key={policy.id} className={`p-6 hover:shadow-xl transition-all duration-300 border-2 ${colorClass.split(' ')[2]}`}>
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${colorClass.split(' ').slice(0, 2).join(' ')} flex items-center justify-center`}>
                      <HiOutlineGlobeAlt className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">{policy.name}</h3>
                      <Badge className={`mt-1 capitalize ${badgeClass}`}>{policy.type}</Badge>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(policy)}
                      className="text-blue-600 hover:bg-blue-50"
                    >
                      <HiOutlinePencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(policy.id)}
                      className="text-red-600 hover:bg-red-50"
                    >
                      <HiOutlineTrash className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {policy.description && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{policy.description}</p>
                )}

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                    IP Ranges ({policy.ip_ranges.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {policy.ip_ranges.map((ip, idx) => (
                      <Badge key={idx} className="bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300 font-mono text-xs">
                        {ip}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Last updated: {new Date(policy.updated_at).toLocaleString()}
                  </p>
                </div>
              </ModernCard>
            );
          })
        )}
      </div>

      {/* Add/Edit Modal */}
      <Modal isOpen={showAddModal || !!editingPolicy} onClose={() => { setShowAddModal(false); setEditingPolicy(null); resetForm(); }}>
        <div className="p-6 space-y-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center">
              <HiOutlinePlus className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                {editingPolicy ? 'Edit Network Policy' : 'Create Network Policy'}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">Define IP-based access control</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Policy Name</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Corporate Network Access"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Policy Type</label>
              <Select
                options={[
                  { label: 'Allow', value: 'allow' },
                  { label: 'Deny', value: 'deny' },
                ]}
                value={formData.type}
                onChange={(value: any) => setFormData({ ...formData, type: value?.value || value })}
                disabled={!!editingPolicy}
                className="w-full"
              />
              <p className="mt-2 text-xs text-slate-500">
                Allow policies grant access, Deny policies block access
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Description (Optional)</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of this policy"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                IP Ranges (comma-separated)
              </label>
              <textarea
                value={formData.ip_ranges}
                onChange={(e) => setFormData({ ...formData, ip_ranges: e.target.value })}
                placeholder="e.g., 10.0.0.0/8, 172.16.0.0/12, 192.168.1.0/24"
                rows={4}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white font-mono text-sm"
              />
              <p className="mt-2 text-xs text-slate-500">Enter IP ranges in CIDR notation, separated by commas</p>
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddModal(false);
                setEditingPolicy(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={editingPolicy ? handleUpdate : handleAdd}
              className="bg-gradient-to-r from-blue-500 to-cyan-600 hover:from-blue-600 hover:to-cyan-700 text-white"
            >
              {editingPolicy ? 'Update' : 'Create'} Policy
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
