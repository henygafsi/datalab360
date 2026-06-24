'use client';

/**
 * ObjectDdlActions — governed schema (DDL) actions for the selected catalog object,
 * surfaced as an "Actions" section inside the Sources ObjectSmartPanel.
 *
 * Reuses the EXISTING explore-design DDL service functions (each runs governed DDL
 * via GET /explore-design/guided/manage_table). Only the projectId-free operations
 * are surfaced here, because the Sources catalog has no active Explore project:
 *   Rename table · Add column · Rename column · Change type · Drop column · Add FK
 *
 * Mark-sensitive / Exclude column / Add PK are intentionally NOT here — they require
 * a real project_id (mark-sensitive/exclude/add-PK service fns take one) and belong
 * to the Explore & Design project workspace, not the read-mostly catalog surface.
 *
 * Every action: typed inputs → confirm dialog → loading → success/error toast →
 * onChanged() refetch. Gated through System-2 Action-RBAC (`explore_design`); a
 * resolved denial honestly disables the controls with an ask-admin tooltip.
 */

import { useState } from 'react';
import { Plus, Pencil, Type, Trash2, GitMerge, Table2 } from 'lucide-react';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useCanPerform } from '@/hooks/useCanPerform';
import { getApiErrorMessage } from '@/lib/api-client';
import { toast } from '@/hooks/use-toast';
import {
  renameTable,
  addColumn,
  renameColumn,
  changeColumnType,
  dropColumn,
  addForeignKey,
} from '@/app/services/explore-design';

interface PendingAction {
  label: string;
  title: string;
  message: string;
  destructive: boolean;
  run: () => Promise<unknown>;
}

export interface ObjectDdlActionsProps {
  database: string;
  schema: string;
  table: string;
  /** Optional column names (from object360 profiling) used as a datalist hint. */
  columns?: string[];
  /** Refetch hook so structure-dependent panel sections refresh after a change. */
  onChanged?: () => void;
}

const FIELD =
  'w-full rounded-md border border-gray-200 bg-white px-2 py-1.5 text-[11px] text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100';
const BTN =
  'flex w-full items-center justify-center gap-1.5 rounded-md bg-blue-600 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50';

export default function ObjectDdlActions({
  database,
  schema,
  table,
  columns,
  onChanged,
}: ObjectDdlActionsProps) {
  // System-2 Action-RBAC: mutating schema → explore_design:create (mirrors the
  // ContextRightBar "create" gate for table/column ops). Fail-open while loading.
  const perm = useCanPerform('explore_design', 'create');
  const canEdit = perm.allowed || perm.loading;
  const deniedReason =
    'You lack the "create" permission on Explore & Design. Ask an administrator to grant it.';

  const [pending, setPending] = useState<PendingAction | null>(null);
  const [busy, setBusy] = useState(false);

  // Form state
  const [newTableName, setNewTableName] = useState('');
  const [addColName, setAddColName] = useState('');
  const [addColType, setAddColType] = useState('VARCHAR');
  const [renColFrom, setRenColFrom] = useState('');
  const [renColTo, setRenColTo] = useState('');
  const [retypeCol, setRetypeCol] = useState('');
  const [retypeType, setRetypeType] = useState('');
  const [dropCol, setDropCol] = useState('');
  const [fkCol, setFkCol] = useState('');
  const [fkRefTable, setFkRefTable] = useState('');
  const [fkRefCol, setFkRefCol] = useState('');

  const execute = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      await pending.run();
      toast({ title: `${pending.label} applied`, description: `${database}.${schema}.${table}` });
      onChanged?.();
      // Clear the inputs that drove the action so a re-run is deliberate.
      setNewTableName(''); setAddColName(''); setRenColFrom(''); setRenColTo('');
      setRetypeCol(''); setRetypeType(''); setDropCol('');
      setFkCol(''); setFkRefTable(''); setFkRefCol('');
    } catch (err) {
      toast({ variant: 'destructive', title: `${pending.label} failed`, description: getApiErrorMessage(err) });
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const colListId = `ddl-cols-${database}-${schema}-${table}`;
  const hasCols = !!columns && columns.length > 0;

  return (
    <div className="space-y-3">
      <p className="text-[11px] leading-relaxed text-gray-400 dark:text-gray-500">
        Governed schema changes on this object. Each runs real DDL after you confirm.
      </p>

      {!canEdit && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-400">
          {deniedReason}
        </p>
      )}

      {hasCols && (
        <datalist id={colListId}>
          {columns!.map((c) => <option key={c} value={c} />)}
        </datalist>
      )}

      {/* Rename table */}
      <ActionCard icon={<Table2 className="h-3 w-3" />} title="Rename table">
        <input className={FIELD} placeholder="New table name" aria-label="New table name" value={newTableName} onChange={(e) => setNewTableName(e.target.value)} disabled={!canEdit} />
        <button
          type="button" className={BTN} disabled={!canEdit || !newTableName.trim()}
          onClick={() => setPending({
            label: 'Rename table', destructive: false,
            title: 'Rename this table?',
            message: `Rename ${table} to "${newTableName.trim()}". Downstream references must be updated.`,
            run: () => renameTable(database, schema, table, newTableName.trim()),
          })}
        >Rename table</button>
      </ActionCard>

      {/* Add column */}
      <ActionCard icon={<Plus className="h-3 w-3" />} title="Add column">
        <div className="flex gap-1.5">
          <input className={FIELD} placeholder="Column name" aria-label="New column name" value={addColName} onChange={(e) => setAddColName(e.target.value)} disabled={!canEdit} />
          <input className={FIELD} placeholder="Type (e.g. VARCHAR)" aria-label="New column type" value={addColType} onChange={(e) => setAddColType(e.target.value)} disabled={!canEdit} />
        </div>
        <button
          type="button" className={BTN} disabled={!canEdit || !addColName.trim() || !addColType.trim()}
          onClick={() => setPending({
            label: 'Add column', destructive: false,
            title: 'Add this column?',
            message: `Add column "${addColName.trim()}" ${addColType.trim()} to ${table}.`,
            run: () => addColumn(database, schema, table, addColName.trim(), addColType.trim()),
          })}
        >Add column</button>
      </ActionCard>

      {/* Rename column */}
      <ActionCard icon={<Pencil className="h-3 w-3" />} title="Rename column">
        <div className="flex gap-1.5">
          <input className={FIELD} list={hasCols ? colListId : undefined} placeholder="Column" aria-label="Column to rename" value={renColFrom} onChange={(e) => setRenColFrom(e.target.value)} disabled={!canEdit} />
          <input className={FIELD} placeholder="New name" aria-label="New column name" value={renColTo} onChange={(e) => setRenColTo(e.target.value)} disabled={!canEdit} />
        </div>
        <button
          type="button" className={BTN} disabled={!canEdit || !renColFrom.trim() || !renColTo.trim()}
          onClick={() => setPending({
            label: 'Rename column', destructive: false,
            title: 'Rename this column?',
            message: `Rename column "${renColFrom.trim()}" to "${renColTo.trim()}" on ${table}.`,
            run: () => renameColumn(database, schema, table, renColFrom.trim(), renColTo.trim()),
          })}
        >Rename column</button>
      </ActionCard>

      {/* Change type */}
      <ActionCard icon={<Type className="h-3 w-3" />} title="Change column type">
        <div className="flex gap-1.5">
          <input className={FIELD} list={hasCols ? colListId : undefined} placeholder="Column" aria-label="Column to retype" value={retypeCol} onChange={(e) => setRetypeCol(e.target.value)} disabled={!canEdit} />
          <input className={FIELD} placeholder="New type" aria-label="New column type" value={retypeType} onChange={(e) => setRetypeType(e.target.value)} disabled={!canEdit} />
        </div>
        <button
          type="button" className={BTN} disabled={!canEdit || !retypeCol.trim() || !retypeType.trim()}
          onClick={() => setPending({
            label: 'Change type', destructive: false,
            title: 'Change this column type?',
            message: `Change "${retypeCol.trim()}" to ${retypeType.trim()} on ${table}. Incompatible data may fail the cast.`,
            run: () => changeColumnType(database, schema, table, retypeCol.trim(), retypeType.trim()),
          })}
        >Change type</button>
      </ActionCard>

      {/* Add foreign key */}
      <ActionCard icon={<GitMerge className="h-3 w-3" />} title="Add foreign key">
        <input className={FIELD} list={hasCols ? colListId : undefined} placeholder="Column" aria-label="Foreign key column" value={fkCol} onChange={(e) => setFkCol(e.target.value)} disabled={!canEdit} />
        <div className="flex gap-1.5">
          <input className={FIELD} placeholder="Ref table (DB.SCHEMA.TABLE)" aria-label="Referenced table" value={fkRefTable} onChange={(e) => setFkRefTable(e.target.value)} disabled={!canEdit} />
          <input className={FIELD} placeholder="Ref column" aria-label="Referenced column" value={fkRefCol} onChange={(e) => setFkRefCol(e.target.value)} disabled={!canEdit} />
        </div>
        <button
          type="button" className={BTN} disabled={!canEdit || !fkCol.trim() || !fkRefTable.trim() || !fkRefCol.trim()}
          onClick={() => setPending({
            label: 'Add foreign key', destructive: false,
            title: 'Add this foreign key?',
            message: `Add FK on "${fkCol.trim()}" referencing ${fkRefTable.trim()}(${fkRefCol.trim()}).`,
            run: () => addForeignKey(database, schema, table, fkCol.trim(), fkRefTable.trim(), fkRefCol.trim()),
          })}
        >Add foreign key</button>
      </ActionCard>

      {/* Drop column (destructive) */}
      <ActionCard icon={<Trash2 className="h-3 w-3 text-rose-500" />} title="Drop column">
        <input className={FIELD} list={hasCols ? colListId : undefined} placeholder="Column to drop" aria-label="Column to drop" value={dropCol} onChange={(e) => setDropCol(e.target.value)} disabled={!canEdit} />
        <button
          type="button"
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-rose-300 px-2 py-1.5 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-900/20"
          disabled={!canEdit || !dropCol.trim()}
          onClick={() => setPending({
            label: 'Drop column', destructive: true,
            title: 'Drop this column?',
            message: `Permanently drop column "${dropCol.trim()}" from ${table}. This cannot be undone and may break downstream consumers.`,
            run: () => dropColumn(database, schema, table, dropCol.trim()),
          })}
        >Drop column</button>
      </ActionCard>

      <ConfirmDialog
        open={!!pending}
        title={pending?.title || ''}
        message={pending?.message || ''}
        confirmLabel={busy ? 'Working…' : pending?.label || 'Confirm'}
        destructive={pending?.destructive ?? false}
        onConfirm={() => { if (!busy) void execute(); }}
        onCancel={() => { if (!busy) setPending(null); }}
      />
    </div>
  );
}

function ActionCard({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-gray-100 p-2.5 dark:border-gray-800">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold text-gray-700 dark:text-gray-300">
        {icon}{title}
      </p>
      {children}
    </div>
  );
}
