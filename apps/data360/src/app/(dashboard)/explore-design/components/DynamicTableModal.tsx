'use client';
import { useState } from 'react';
import { Modal, Input, Button, Select, Textarea } from 'rizzui';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api-client';
import { RefreshCw } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sourceTable?: { database: string; schema: string; table: string };
  warehouses?: string[];
}

export default function DynamicTableModal({ isOpen, onClose, sourceTable, warehouses = [] }: Props) {
  const [name, setName] = useState('');
  const [targetLag, setTargetLag] = useState('20 minutes');
  const [warehouse, setWarehouse] = useState('');
  const [query, setQuery] = useState(sourceTable ? `SELECT * FROM ${sourceTable.database}.${sourceTable.schema}.${sourceTable.table}` : '');
  const [refreshMode, setRefreshMode] = useState<string>('AUTO');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name || !warehouse || !query) { toast.error('Name, warehouse, and query are required'); return; }
    setLoading(true);
    try {
      await apiClient.post('/api/v1/explore-design/dynamic-tables', {
        name, target_lag: targetLag, warehouse, query, refresh_mode: refreshMode,
        database: sourceTable?.database, schema: sourceTable?.schema,
      });
      toast.success(`Dynamic table "${name}" created`);
      onClose();
    } catch (e: any) { toast.error(e?.response?.data?.detail || 'Failed to create dynamic table'); }
    finally { setLoading(false); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-teal-100 dark:bg-teal-900/30">
            <RefreshCw className="h-5 w-5 text-teal-600 dark:text-teal-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold dark:text-white">Create Dynamic Table</h3>
            <p className="text-sm text-slate-500">Auto-refreshing materialized view</p>
          </div>
        </div>
        <Input label="Name" placeholder="my_dynamic_table" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Target Lag" placeholder="20 minutes" value={targetLag} onChange={(e) => setTargetLag(e.target.value)} />
        <Select label="Warehouse" options={warehouses.map(w => ({ label: w, value: w }))} value={warehouse} onChange={(v: any) => setWarehouse(v?.value || v)} placeholder="Select warehouse" />
        <Select label="Refresh Mode" options={[{label:'AUTO',value:'AUTO'},{label:'FULL',value:'FULL'},{label:'INCREMENTAL',value:'INCREMENTAL'}]} value={refreshMode} onChange={(v: any) => setRefreshMode(v?.value || v)} />
        <Textarea label="SELECT Query" placeholder="SELECT * FROM ..." value={query} onChange={(e) => setQuery(e.target.value)} rows={4} className="font-mono text-sm" />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button isLoading={loading} onClick={handleCreate} className="bg-teal-600 hover:bg-teal-700 text-white">Create</Button>
        </div>
      </div>
    </Modal>
  );
}
