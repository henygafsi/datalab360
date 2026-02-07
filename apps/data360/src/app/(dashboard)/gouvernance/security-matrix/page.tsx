'use client';

import { useState, useEffect, useCallback } from 'react';
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
  HiOutlineTableCells,
} from 'react-icons/hi2';
import { toast } from 'react-hot-toast';
import {
  getSecurityAxes,
  createSecurityAxis,
  updateSecurityAxis,
  deleteSecurityAxis,
  SecurityAxis,
} from '@/app/services/gouvernance/security-matrix';
import {
  getSecurityMatrix,
  createSecurityMatrixEntry,
  updateSecurityMatrixEntry,
  deleteSecurityMatrixEntry,
  type SecurityMatrixEntryRow,
  type SecurityMatrixResponse,
  type CreateMatrixEntryPayload,
} from '@/app/services/gouvernance/security_matrix';
import ErrorDisplay from '@/components/ui/ErrorDisplay';
import TableSkeleton from '@/components/ui/TableSkeleton';
import { formatApiDetail } from '@/lib/utils';

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

const defaultMatrixForm = {
  role_name: '',
  region_id: '' as string | null,
  store_id: '' as string | null,
  department_id: '' as string | null,
  product_category: '' as string | null,
  customer_segment: '' as string | null,
  access_level: 'READ',
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

  // Access matrix (Snowflake SECURITY_MATRIX table)
  const [matrixData, setMatrixData] = useState<SecurityMatrixResponse | null>(null);
  const [matrixLoading, setMatrixLoading] = useState(false);
  const [matrixError, setMatrixError] = useState<string | null>(null);
  const [showMatrixEntryModal, setShowMatrixEntryModal] = useState(false);
  const [editingMatrixRow, setEditingMatrixRow] = useState<SecurityMatrixEntryRow | null>(null);
  const [matrixForm, setMatrixForm] = useState<typeof defaultMatrixForm>(defaultMatrixForm);

  useEffect(() => {
    loadAxes();
  }, []);

  const loadMatrix = useCallback(async () => {
    try {
      setMatrixLoading(true);
      setMatrixError(null);
      const data = await getSecurityMatrix();
      setMatrixData(data);
    } catch (err: any) {
      const msg = err?.response?.data?.detail != null ? formatApiDetail(err.response.data.detail) : (err?.message ?? 'Failed to load access matrix');
      setMatrixError(typeof msg === 'string' ? msg : 'Failed to load access matrix');
    } finally {
      setMatrixLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMatrix();
  }, [loadMatrix]);

  const loadAxes = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getSecurityAxes();
      setAxes(data);
    } catch (err: any) {
      const msg = err?.response?.data?.detail != null ? formatApiDetail(err.response.data.detail) : (err?.message ?? 'Failed to load security axes');
      setError(typeof msg === 'string' ? msg : 'Failed to load security axes');
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
      toast.error(formatApiDetail(error.response?.data?.detail) || 'Failed to create security axis');
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
      toast.error(formatApiDetail(error.response?.data?.detail) || 'Failed to update security axis');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this security axis?')) return;
    try {
      await deleteSecurityAxis(id);
      toast.success('Security axis deleted successfully');
      loadAxes();
    } catch (error: any) {
      toast.error(formatApiDetail(error.response?.data?.detail) || 'Failed to delete security axis');
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

  const resetMatrixForm = () => {
    setMatrixForm(defaultMatrixForm);
    setEditingMatrixRow(null);
  };

  const handleAddMatrixEntry = async () => {
    try {
      await createSecurityMatrixEntry({
        role_name: matrixForm.role_name.trim(),
        axes: {
          region_id: matrixForm.region_id || null,
          store_id: matrixForm.store_id || null,
          department_id: matrixForm.department_id || null,
          product_category: matrixForm.product_category || null,
          customer_segment: matrixForm.customer_segment || null,
        },
        access_level: matrixForm.access_level,
      });
      toast.success('Entrée ajoutée à la matrice d\'accès');
      setShowMatrixEntryModal(false);
      resetMatrixForm();
      loadMatrix();
    } catch (err: any) {
      toast.error(formatApiDetail(err?.response?.data?.detail) || 'Erreur lors de l\'ajout');
    }
  };

  const handleUpdateMatrixEntry = async () => {
    if (!editingMatrixRow) return;
    try {
      await updateSecurityMatrixEntry(editingMatrixRow.id, {
        axes: {
          region_id: matrixForm.region_id || null,
          store_id: matrixForm.store_id || null,
          department_id: matrixForm.department_id || null,
          product_category: matrixForm.product_category || null,
          customer_segment: matrixForm.customer_segment || null,
        },
        access_level: matrixForm.access_level,
      });
      toast.success('Entrée mise à jour');
      setShowMatrixEntryModal(false);
      resetMatrixForm();
      loadMatrix();
    } catch (err: any) {
      toast.error(formatApiDetail(err?.response?.data?.detail) || 'Erreur lors de la mise à jour');
    }
  };

  const handleDeleteMatrixEntry = async (row: SecurityMatrixEntryRow) => {
    if (!confirm('Supprimer cette entrée de la matrice d\'accès ?')) return;
    try {
      await deleteSecurityMatrixEntry(row.id);
      toast.success('Entrée supprimée');
      loadMatrix();
    } catch (err: any) {
      toast.error(formatApiDetail(err?.response?.data?.detail) || 'Erreur lors de la suppression');
    }
  };

  const openEditMatrix = (row: SecurityMatrixEntryRow) => {
    setEditingMatrixRow(row);
    setMatrixForm({
      role_name: row.role_name,
      region_id: row.region_id ?? '',
      store_id: row.store_id ?? '',
      department_id: row.department_id ?? '',
      product_category: row.product_category ?? '',
      customer_segment: row.customer_segment ?? '',
      access_level: row.access_level || 'READ',
    });
    setShowMatrixEntryModal(true);
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

      {/* Access Matrix (Snowflake SECURITY_MATRIX table) - editable grid */}
      <ModernCard className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <HiOutlineTableCells className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Matrice d&apos;accès (table Snowflake)</h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                Table stockée dans Snowflake : modifiez chaque ligne pour définir les accès par rôle (gouvernance).
              </p>
            </div>
          </div>
          <Button
            onClick={() => { resetMatrixForm(); setShowMatrixEntryModal(true); }}
            className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
          >
            <HiOutlinePlus className="w-5 h-5 mr-2" />
            Ajouter une entrée
          </Button>
        </div>

        {matrixLoading ? (
          <TableSkeleton rows={5} columns={8} />
        ) : matrixError ? (
          <ErrorDisplay error={matrixError} onRetry={loadMatrix} context="general" />
        ) : !matrixData?.entries?.length ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50 p-8 text-center">
            <p className="text-slate-600 dark:text-slate-400">Aucune entrée. Initialisez le schéma ou ajoutez une entrée.</p>
            <Button onClick={() => { resetMatrixForm(); setShowMatrixEntryModal(true); }} className="mt-4">
              Ajouter une entrée
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Rôle</th>
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Région</th>
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Store</th>
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Département</th>
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Catégorie produit</th>
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Segment client</th>
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300">Niveau accès</th>
                  <th className="px-4 py-3 font-semibold text-slate-700 dark:text-slate-300 w-24">Actions</th>
                </tr>
              </thead>
              <tbody>
                {matrixData.entries.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 dark:border-slate-700/60 hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                    <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">{row.role_name}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{row.region_id ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{row.store_id ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{row.department_id ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{row.product_category ?? '—'}</td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{row.customer_segment ?? '—'}</td>
                    <td className="px-4 py-3">
                      <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">{row.access_level}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" onClick={() => openEditMatrix(row)} className="text-blue-600">
                          <HiOutlinePencil className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleDeleteMatrixEntry(row)} className="text-red-600">
                          <HiOutlineTrash className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ModernCard>

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

      {/* Add/Edit Access Matrix Entry Modal */}
      <Modal
        isOpen={showMatrixEntryModal}
        onClose={() => { setShowMatrixEntryModal(false); resetMatrixForm(); }}
      >
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <HiOutlineTableCells className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                {editingMatrixRow ? 'Modifier l\'entrée' : 'Nouvelle entrée matrice d\'accès'}
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400">Rôle et axes (région, store, département, etc.)</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Rôle</label>
              <Input
                value={matrixForm.role_name}
                onChange={(e) => setMatrixForm((f) => ({ ...f, role_name: e.target.value }))}
                placeholder="ex: ROLE_REGION_NORTH"
                disabled={!!editingMatrixRow}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Niveau d&apos;accès</label>
              <Select
                options={[
                  { label: 'READ', value: 'READ' },
                  { label: 'WRITE', value: 'WRITE' },
                  { label: 'ADMIN', value: 'ADMIN' },
                ]}
                value={matrixForm.access_level}
                onChange={(v: any) => setMatrixForm((f) => ({ ...f, access_level: v?.value ?? 'READ' }))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Région</label>
              <Select
                options={[
                  { label: '— Toutes', value: '' },
                  ...(matrixData?.available_axes?.regions?.map((r) => ({ label: r.name, value: r.id })) ?? []),
                ]}
                value={matrixForm.region_id ?? ''}
                onChange={(v: any) => setMatrixForm((f) => ({ ...f, region_id: v?.value || null }))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Store</label>
              <Select
                options={[
                  { label: '— Tous', value: '' },
                  ...(matrixData?.available_axes?.stores?.map((s) => ({ label: s.name, value: s.id })) ?? []),
                ]}
                value={matrixForm.store_id ?? ''}
                onChange={(v: any) => setMatrixForm((f) => ({ ...f, store_id: v?.value || null }))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Département</label>
              <Select
                options={[
                  { label: '— Tous', value: '' },
                  ...(matrixData?.available_axes?.departments?.map((d) => ({ label: d.name, value: d.id })) ?? []),
                ]}
                value={matrixForm.department_id ?? ''}
                onChange={(v: any) => setMatrixForm((f) => ({ ...f, department_id: v?.value || null }))}
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Catégorie produit</label>
              <Input
                value={matrixForm.product_category ?? ''}
                onChange={(e) => setMatrixForm((f) => ({ ...f, product_category: e.target.value || null }))}
                placeholder="optionnel"
                className="w-full"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Segment client</label>
              <Input
                value={matrixForm.customer_segment ?? ''}
                onChange={(e) => setMatrixForm((f) => ({ ...f, customer_segment: e.target.value || null }))}
                placeholder="optionnel"
                className="w-full"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => { setShowMatrixEntryModal(false); resetMatrixForm(); }}>
              Annuler
            </Button>
            <Button
              onClick={editingMatrixRow ? handleUpdateMatrixEntry : handleAddMatrixEntry}
              disabled={!matrixForm.role_name.trim()}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white"
            >
              {editingMatrixRow ? 'Enregistrer' : 'Ajouter'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
