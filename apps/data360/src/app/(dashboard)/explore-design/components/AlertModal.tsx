'use client';
import { useState } from 'react';
import { Modal, Input, Button, Select, Textarea } from 'rizzui';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api-client';
import { AlertTriangle } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sourceTable?: { database: string; schema: string; table: string };
  warehouses?: string[];
}

export default function AlertModal({ isOpen, onClose, sourceTable, warehouses = [] }: Props) {
  const [name, setName] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [schedule, setSchedule] = useState('60 MINUTE');
  const [condition, setCondition] = useState(
    sourceTable ? `SELECT 1 FROM ${sourceTable.database}.${sourceTable.schema}.${sourceTable.table} WHERE 1=0` : ''
  );
  const [action, setAction] = useState('');
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name || !warehouse || !condition || !action) { toast.error('Name, warehouse, condition, and action are required'); return; }
    setLoading(true);
    try {
      await apiClient.post('/api/v1/explore-design/alerts', {
        name, warehouse, schedule, condition, action, comment: comment || undefined,
        database: sourceTable?.database, schema: sourceTable?.schema,
      });
      toast.success(`Alert "${name}" created`);
      onClose();
    } catch (e: any) { toast.error(e?.response?.data?.detail || 'Failed to create alert'); }
    finally { setLoading(false); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
            <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold dark:text-white">Create Alert</h3>
            <p className="text-sm text-slate-500">Scheduled condition monitoring</p>
          </div>
        </div>
        <Input label="Alert Name" placeholder="my_alert" value={name} onChange={(e) => setName(e.target.value)} />
        <Select label="Warehouse" options={warehouses.map(w => ({ label: w, value: w }))} value={warehouse} onChange={(v: any) => setWarehouse(v?.value || v)} placeholder="Select warehouse" />
        <Input label="Schedule" placeholder="60 MINUTE or USING CRON 0 * * * * UTC" value={schedule} onChange={(e) => setSchedule(e.target.value)} />
        <Textarea label="Condition (SQL)" placeholder="SELECT 1 FROM ... WHERE ..." value={condition} onChange={(e) => setCondition(e.target.value)} rows={3} className="font-mono text-sm" />
        <Textarea label="Action (SQL)" placeholder="INSERT INTO alerts_log ..." value={action} onChange={(e) => setAction(e.target.value)} rows={3} className="font-mono text-sm" />
        <Input label="Comment (optional)" placeholder="Description" value={comment} onChange={(e) => setComment(e.target.value)} />
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button isLoading={loading} onClick={handleCreate} className="bg-amber-600 hover:bg-amber-700 text-white">Create</Button>
        </div>
      </div>
    </Modal>
  );
}
