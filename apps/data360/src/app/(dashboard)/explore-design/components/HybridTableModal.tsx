'use client';
import { useState } from 'react';
import { Input, Button, Switch } from 'rizzui';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api-client';
import { Layers, Plus, Trash2 } from 'lucide-react';
import DesignDockPanel from './DesignDockPanel';

interface ColumnDef {
  name: string;
  data_type: string;
  primary_key: boolean;
  not_null: boolean;
  autoincrement: boolean;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  context?: { database: string; schema: string };
}

const EMPTY_COL: ColumnDef = { name: '', data_type: 'VARCHAR', primary_key: false, not_null: false, autoincrement: false };

export default function HybridTableModal({ isOpen, onClose, context }: Props) {
  const [name, setName] = useState('');
  const [columns, setColumns] = useState<ColumnDef[]>([{ ...EMPTY_COL, name: 'id', data_type: 'NUMBER', primary_key: true, not_null: true, autoincrement: true }]);
  const [loading, setLoading] = useState(false);

  const addColumn = () => setColumns([...columns, { ...EMPTY_COL }]);
  const removeColumn = (i: number) => setColumns(columns.filter((_, idx) => idx !== i));
  const updateColumn = (i: number, field: keyof ColumnDef, value: any) => {
    const updated = [...columns];
    (updated[i] as any)[field] = value;
    setColumns(updated);
  };

  const handleCreate = async () => {
    if (!name) { toast.error('Name is required'); return; }
    if (!columns.some(c => c.primary_key)) { toast.error('At least one column must be a primary key'); return; }
    setLoading(true);
    try {
      await apiClient.post('/explore-design/hybrid-tables', {
        name, columns, database: context?.database, schema: context?.schema,
      });
      toast.success(`Hybrid table "${name}" created`);
      onClose();
    } catch (e: any) { toast.error(e?.response?.data?.detail || 'Failed to create hybrid table'); }
    finally { setLoading(false); }
  };

  return (
    <DesignDockPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Create Hybrid Table"
      subtitle="OLTP table with primary key enforcement"
      icon={
        <div className="p-2 rounded-lg bg-indigo-100 dark:bg-indigo-900/30">
          <Layers className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
        </div>
      }
      widthClass="max-w-xl"
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button isLoading={loading} onClick={handleCreate} className="bg-indigo-600 hover:bg-indigo-700 text-white">Create</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input label="Table Name" placeholder="my_hybrid_table" value={name} onChange={(e) => setName(e.target.value)} />
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-sm font-medium dark:text-white">Columns</label>
            <Button size="sm" variant="outline" onClick={addColumn}><Plus className="h-3 w-3 mr-1" />Add</Button>
          </div>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {columns.map((col, i) => (
              <div key={i} className="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg">
                <Input size="sm" placeholder="name" value={col.name} onChange={(e) => updateColumn(i, 'name', e.target.value)} className="flex-1" />
                <Input size="sm" placeholder="type" value={col.data_type} onChange={(e) => updateColumn(i, 'data_type', e.target.value)} className="w-28" />
                <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                  <input type="checkbox" checked={col.primary_key} onChange={(e) => updateColumn(i, 'primary_key', e.target.checked)} />PK
                </label>
                <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                  <input type="checkbox" checked={col.not_null} onChange={(e) => updateColumn(i, 'not_null', e.target.checked)} />NN
                </label>
                <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                  <input type="checkbox" checked={col.autoincrement} onChange={(e) => updateColumn(i, 'autoincrement', e.target.checked)} />AI
                </label>
                <button onClick={() => removeColumn(i)} className="text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </DesignDockPanel>
  );
}
