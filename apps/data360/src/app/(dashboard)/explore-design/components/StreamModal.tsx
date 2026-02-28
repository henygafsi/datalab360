'use client';
import { useState } from 'react';
import { Modal, Input, Button, Select, Switch } from 'rizzui';
import toast from 'react-hot-toast';
import apiClient from '@/lib/api-client';
import { GitBranch } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  sourceTable?: { database: string; schema: string; table: string };
}

export default function StreamModal({ isOpen, onClose, sourceTable }: Props) {
  const [name, setName] = useState('');
  const [sourceTableName, setSourceTableName] = useState(
    sourceTable ? `${sourceTable.database}.${sourceTable.schema}.${sourceTable.table}` : ''
  );
  const [appendOnly, setAppendOnly] = useState(false);
  const [showInitialRows, setShowInitialRows] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCreate = async () => {
    if (!name || !sourceTableName) { toast.error('Name and source table are required'); return; }
    setLoading(true);
    try {
      await apiClient.post('/api/v1/explore-design/streams', {
        name, source_table: sourceTableName, append_only: appendOnly, show_initial_rows: showInitialRows,
        database: sourceTable?.database, schema: sourceTable?.schema,
      });
      toast.success(`Stream "${name}" created`);
      onClose();
    } catch (e: any) { toast.error(e?.response?.data?.detail || 'Failed to create stream'); }
    finally { setLoading(false); }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
            <GitBranch className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold dark:text-white">Create Stream</h3>
            <p className="text-sm text-slate-500">Change Data Capture on a table</p>
          </div>
        </div>
        <Input label="Stream Name" placeholder="my_stream" value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Source Table" placeholder="DB.SCHEMA.TABLE" value={sourceTableName} onChange={(e) => setSourceTableName(e.target.value)} />
        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
          <div>
            <p className="text-sm font-medium dark:text-white">Append Only</p>
            <p className="text-xs text-slate-500">Track only INSERT operations</p>
          </div>
          <Switch checked={appendOnly} onChange={() => setAppendOnly(!appendOnly)} />
        </div>
        <div className="flex items-center justify-between p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
          <div>
            <p className="text-sm font-medium dark:text-white">Show Initial Rows</p>
            <p className="text-xs text-slate-500">Include existing rows in first consumption</p>
          </div>
          <Switch checked={showInitialRows} onChange={() => setShowInitialRows(!showInitialRows)} />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button isLoading={loading} onClick={handleCreate} className="bg-cyan-600 hover:bg-cyan-700 text-white">Create</Button>
        </div>
      </div>
    </Modal>
  );
}
