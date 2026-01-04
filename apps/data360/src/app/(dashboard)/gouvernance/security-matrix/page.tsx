'use client';

import { useState, useEffect } from 'react';
import { Button, Badge, Input, Select, Modal, Text } from 'rizzui';
import {
  HiOutlineShieldCheck,
  HiOutlinePlus,
  HiOutlineTrash,
  HiOutlinePencil,
  HiOutlineGlobeAlt,
  HiOutlineBuildingStorefront,
  HiOutlineBriefcase,
  HiOutlineUsers,
} from 'react-icons/hi2';
import { toast } from 'react-hot-toast';
import {
  getSecurityAxes,
  createSecurityAxis,
  updateSecurityAxis,
  deleteSecurityAxis,
  SecurityAxis,
} from '@/app/services/gouvernance/security-matrix';
import ErrorDisplay from '@/components/ui/ErrorDisplay';
import TableSkeleton from '@/components/ui/TableSkeleton';

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

const AXIS_TYPE_ICONS = {
  region: HiOutlineGlobeAlt,
  store: HiOutlineBuildingStorefront,
  department: HiOutlineBriefcase,
  custom: HiOutlineShieldCheck,
};

const AXIS_TYPE_COLORS = {
  region: 'from-blue-500 to-cyan-600',
  store: 'from-emerald-500 to-teal-600',
  department: 'from-purple-500 to-violet-600',
  custom: 'from-amber-500 to-orange-600',
};

export default function SecurityMatrixPage() {
  const [axes, setAxes] = useState<SecurityAxis[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingAxis, setEditingAxis] = useState<SecurityAxis | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    type: 'region' as 'region' | 'store' | 'department' | 'custom',
    description: '',
    values: '',
  });

  useEffect(() => {
    loadAxes();
  }, []);

  const loadAxes = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getSecurityAxes();
      setAxes(data);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Failed to load security axes');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async () => {
    try {
      const values = formData.values.split(',').map(v => v.trim()).filter(Boolean);
      await createSecurityAxis({
        name: formData.name,
        type: formData.type,
        description: formData.description,
        values,
      });
      toast.success('Security axis created successfully');
      setShowAddModal(false);
      resetForm();
      loadAxes();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to create security axis');
    }
  };

  const handleUpdate = async () => {
    if (!editingAxis) return;
    try {
      const values = formData.values.split(',').map(v => v.trim()).filter(Boolean);
      await updateSecurityAxis(editingAxis.id, {
        name: formData.name,
        description: formData.description,
        values,
      });
      toast.success('Security axis updated successfully');
      setEditingAxis(null);
      resetForm();
      loadAxes();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to update security axis');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this security axis?')) return;
    try {
      await deleteSecurityAxis(id);
      toast.success('Security axis deleted successfully');
      loadAxes();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to delete security axis');
    }
  };

  const handleEdit = (axis: SecurityAxis) => {
    setEditingAxis(axis);
    setFormData({
      name: axis.name,
      type: axis.type,
      description: axis.description || '',
      values: axis.values.join(', '),
    });
  };

  const resetForm = () => {
    setFormData({ name: '', type: 'region', description: '', values: '' });
  };

  const Breadcrumb = () => {
    return (
      <nav className="mb-8">
        <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
          <span className="hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer transition-colors">Home</span>
          <span>/</span>
          <span className="hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer transition-colors">Governance</span>
          <span>/</span>
          <span className="text-slate-900 dark:text-slate-200 font-medium">Security Matrix</span>
        </div>
      </nav>
    );
  };

  return (
    <div className="space-y-8">
      <Breadcrumb />

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-xl shadow-violet-500/25">
            <HiOutlineShieldCheck className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
              Security Matrix
            </h1>
            <p className="text-slate-600 dark:text-slate-400 text-lg">
              Define security axes for region, store, and department-based access control
            </p>
          </div>
        </div>

        <Button
          onClick={() => setShowAddModal(true)}
          className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white shadow-lg shadow-violet-500/30"
        >
          <HiOutlinePlus className="w-5 h-5 mr-2" />
          Add Security Axis
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {['region', 'store', 'department', 'custom'].map((type) => {
          const Icon = AXIS_TYPE_ICONS[type as keyof typeof AXIS_TYPE_ICONS];
          const count = axes.filter(a => a.type === type).length;
          const totalValues = axes
            .filter(a => a.type === type)
            .reduce((sum, a) => sum + a.values.length, 0);

          return (
            <ModernCard key={type} className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${AXIS_TYPE_COLORS[type as keyof typeof AXIS_TYPE_COLORS]} flex items-center justify-center`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-slate-600 dark:text-slate-400 capitalize">{type}s</p>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">{count}</p>
                  </div>
                </div>
                <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                  {totalValues} values
                </Badge>
              </div>
            </ModernCard>
          );
        })}
      </div>

      {/* Axes Grid */}
      {loading ? (
        <div className="space-y-4">
          <TableSkeleton rows={3} columns={2} showHeader={false} />
        </div>
      ) : error ? (
        <ErrorDisplay error={error} onRetry={loadAxes} context="general" />
      ) : axes.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center dark:border-gray-700 dark:bg-gray-800">
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-violet-100 dark:bg-violet-900/30">
            <HiOutlineShieldCheck className="h-10 w-10 text-violet-600 dark:text-violet-400" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Aucun axe de sécurité trouvé</h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Créez votre premier axe pour gérer la matrice de sécurité.
          </p>
          <Button onClick={() => setShowAddModal(true)} className="mt-4 bg-gradient-to-r from-violet-500 to-purple-600">
            <HiOutlinePlus className="mr-2 h-4 w-4" />
            Créer un axe
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {axes.map((axis) => {
            const Icon = AXIS_TYPE_ICONS[axis.type];
            const colorClass = AXIS_TYPE_COLORS[axis.type];

            return (
              <ModernCard key={axis.id} className="p-6 hover:shadow-xl transition-all duration-300">
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center space-x-3">
                    <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${colorClass} flex items-center justify-center`}>
                      <Icon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-slate-900 dark:text-white">{axis.name}</h3>
                      <Badge className="mt-1 capitalize">{axis.type}</Badge>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(axis)}
                      className="text-blue-600 hover:bg-blue-50"
                    >
                      <HiOutlinePencil className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleDelete(axis.id)}
                      className="text-red-600 hover:bg-red-50"
                    >
                      <HiOutlineTrash className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {axis.description && (
                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">{axis.description}</p>
                )}

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">Values ({axis.values.length})</p>
                  <div className="flex flex-wrap gap-2">
                    {axis.values.slice(0, 10).map((value, idx) => (
                      <Badge key={idx} className="bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                        {value}
                      </Badge>
                    ))}
                    {axis.values.length > 10 && (
                      <Badge className="bg-blue-100 text-blue-700">+{axis.values.length - 10} more</Badge>
                    )}
                  </div>
                </div>
              </ModernCard>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={showAddModal || !!editingAxis} onClose={() => { setShowAddModal(false); setEditingAxis(null); resetForm(); }}>
        <div className="p-6 space-y-6">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
              <HiOutlinePlus className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                {editingAxis ? 'Edit Security Axis' : 'Create Security Axis'}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">Define a new security dimension</p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Axis Name</label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., North America, Store Type, IT Department"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Type</label>
              <Select
                options={[
                  { label: 'Region', value: 'region' },
                  { label: 'Store', value: 'store' },
                  { label: 'Department', value: 'department' },
                  { label: 'Custom', value: 'custom' },
                ]}
                value={formData.type}
                onChange={(value: any) => setFormData({ ...formData, type: value?.value || value })}
                disabled={!!editingAxis}
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Description (Optional)</label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Brief description of this axis"
                className="w-full"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                Values (comma-separated)
              </label>
              <textarea
                value={formData.values}
                onChange={(e) => setFormData({ ...formData, values: e.target.value })}
                placeholder="e.g., USA, Canada, Mexico"
                rows={4}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
              />
              <p className="mt-2 text-xs text-slate-500">Enter values separated by commas</p>
            </div>
          </div>

          <div className="flex justify-end space-x-3">
            <Button
              variant="outline"
              onClick={() => {
                setShowAddModal(false);
                setEditingAxis(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={editingAxis ? handleUpdate : handleAdd}
              className="bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white"
            >
              {editingAxis ? 'Update' : 'Create'} Axis
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
