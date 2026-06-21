'use client';
import { useState } from 'react';
import { Input, Button, Select, Textarea } from 'rizzui';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api-client';
import { toServiceError } from '@/app/services/_errors';
import { RefreshCw } from 'lucide-react';
import DesignDockPanel from './DesignDockPanel';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sourceTable?: { database: string; schema: string; table: string };
  warehouses?: string[];
  /** Called after a successful create with the live object's location so the
   *  canvas can inject it (with real columns) and show it. */
  onCreated?: (created: { database?: string; schema?: string; table: string }) => void;
}

export default function DynamicTableModal({ isOpen, onClose, sourceTable, warehouses = [], onCreated }: Props) {
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
      await apiClient.post('/explore-design/dynamic-tables', {
        name, target_lag: targetLag, warehouse, query, refresh_mode: refreshMode,
        database: sourceTable?.database, schema: sourceTable?.schema,
      });
      toast.success(`Dynamic table "${name}" created`);
      onCreated?.({ database: sourceTable?.database, schema: sourceTable?.schema, table: name });
      onClose();
    } catch (e: any) { toast.error(toServiceError(e, 'Failed to create dynamic table').message); }
    finally { setLoading(false); }
  };

  return (
    <DesignDockPanel
      isOpen={isOpen}
      onClose={onClose}
      title="Create Dynamic Table"
      subtitle="Auto-refreshing materialized view"
      icon={
        <div className="p-2 rounded-lg bg-teal-100 dark:bg-teal-900/30">
          <RefreshCw className="h-5 w-5 text-teal-600 dark:text-teal-400" />
        </div>
      }
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button isLoading={loading} onClick={handleCreate} className="bg-teal-600 hover:bg-teal-700 text-white">Create</Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Input label="Name" placeholder="my_dynamic_table" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Target Lag" placeholder="20 minutes" value={targetLag} onChange={(e) => setTargetLag(e.target.value)} />
        <Select label="Warehouse" options={warehouses.map(w => ({ label: w, value: w }))} value={warehouse} onChange={(v: any) => setWarehouse(v?.value || v)} placeholder="Select warehouse" />
        <Select label="Refresh Mode" options={[{label:'AUTO',value:'AUTO'},{label:'FULL',value:'FULL'},{label:'INCREMENTAL',value:'INCREMENTAL'}]} value={refreshMode} onChange={(v: any) => setRefreshMode(v?.value || v)} />
        <Textarea label="SELECT Query" placeholder="SELECT * FROM ..." value={query} onChange={(e) => setQuery(e.target.value)} rows={4} className="font-mono text-sm" />
      </div>
    </DesignDockPanel>
  );
}
