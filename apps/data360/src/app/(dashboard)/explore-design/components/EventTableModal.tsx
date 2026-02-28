'use client';
import { useState } from 'react';
import { Modal, Input, Button, Switch } from 'rizzui';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api-client';
import { Bell } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  context?: { database: string; schema: string };
}

export default function EventTableModal({ isOpen, onClose, context }: Props) {
  const [name, setName] = useState('');
  const [retentionDays, setRetentionDays] = useState(1);
  const [changeTracking, setChangeTracking] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name) { toast.error('Name is required'); return; }
    setLoading(true);
    try {
      await apiClient.post('/api/v1/explore-design/event-tables', {
        name, retention_days: retentionDays, change_tracking: changeTracking,
        database: context?.database, schema: context?.schema,
      });
      toast.success(`Event table "${name}" created`);
      onClose();
    } catch (e: any) { toast.error(e?.response?.data?.detail || 'Failed to create event table'); }
    finally { setLoading(false); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30">
            <Bell className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold dark:text-white">Create Event Table</h3>
            <p className="text-sm text-slate-500">Logging and tracing events</p>
          </div>
        </div>
        <Input label="Event Table Name" placeholder="my_event_table" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Data Retention (days)" type="number" value={String(retentionDays)} onChange={(e) => setRetentionDays(Number(e.target.value))} />
        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
          <div>
            <p className="text-sm font-medium dark:text-white">Change Tracking</p>
            <p className="text-xs text-slate-500">Enable change tracking on this event table</p>
          </div>
          <Switch checked={changeTracking} onChange={() => setChangeTracking(!changeTracking)} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button isLoading={loading} onClick={handleCreate} className="bg-violet-600 hover:bg-violet-700 text-white">Create</Button>
        </div>
      </div>
    </Modal>
  );
}
