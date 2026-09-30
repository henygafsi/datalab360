'use client';

/**
 * ConnectionCreateForm — create a first-class connection from the
 * CONNECTOR'S OWN SCHEMA (GET /studio/connections/types): fields, secret
 * flags and auth modes come from the backend, so a new connector type
 * needs no frontend change. Only `usable` types are offered; the others
 * are listed with what is missing — never simulated. Nothing is tested at
 * creation: the form says so and hands off to the sheet's explicit test.
 */

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import {
  createConnection,
  getConnectionTypes,
  type ConnectionTypeInfo,
  type Refusal,
} from '@/app/services/studio/connections';
import { invalidateSourcesCaches } from '@/app/services/studio/studio-api';
import { RefusalView } from '@/app/shared/studio/sources/connection-bits';

export default function ConnectionCreateForm({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  /** the new connection's id — the caller opens its sheet (next step: test) */
  onCreated: (connectionId: string) => void;
}) {
  const [types, setTypes] = useState<ConnectionTypeInfo[] | 'loading' | 'error'>('loading');
  const [typeId, setTypeId] = useState('');
  const [name, setName] = useState('');
  const [environment, setEnvironment] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);

  useEffect(() => {
    void getConnectionTypes()
      .then((t) => {
        setTypes(t.types);
        const firstUsable = t.types.find((x) => x.usable && x.type !== 'snowflake_session');
        if (firstUsable) setTypeId(firstUsable.type);
      })
      .catch(() => setTypes('error'));
  }, []);

  const list = useMemo(() => (Array.isArray(types) ? types : []), [types]);
  const selected = useMemo(() => list.find((t) => t.type === typeId), [list, typeId]);
  const fields = (selected?.fields ?? []).filter((f) => f.scope !== 'object');

  const submit = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setRefusal(null);
    const params: Record<string, unknown> = {};
    const secrets: Record<string, string> = {};
    for (const f of fields) {
      const v = values[f.name] ?? '';
      if (v === '') continue;
      if (f.secret) secrets[f.name] = v;
      else params[f.name] = v;
    }
    const r = await createConnection({
      type: selected.type,
      name: name.trim() || `${selected.label ?? selected.type} connection`,
      environment: environment.trim() || undefined,
      params,
      secrets,
    });
    setBusy(false);
    if (r.ok) {
      invalidateSourcesCaches();
      onCreated(r.value.connection_id);
    } else {
      setRefusal(r.refusal);
    }
  };

  if (types === 'loading')
    return (
      <div role="status" className="h-24 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800">
        <span className="sr-only">Reading the connector schemas…</span>
      </div>
    );
  if (types === 'error')
    return (
      <p className="rounded-xl border border-slate-200 bg-white p-3 text-[13px] text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
        The connector schemas could not be read.
      </p>
    );

  return (
    <section
      aria-label="New connection"
      className="rounded-xl border border-accent-200 bg-white p-3 dark:border-accent-900/50 dark:bg-slate-900"
    >
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">New connection</h3>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded px-2 py-1 text-xs text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-400"
        >
          Close
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-2.5">
        <label className="block">
          <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">System</span>
          <select
            value={typeId}
            onChange={(e) => {
              setTypeId(e.target.value);
              setValues({});
              setRefusal(null);
            }}
            aria-label="Connection type"
            className="h-8 w-64 rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {list
              .filter((t) => t.type !== 'snowflake_session')
              .map((t) => (
                <option key={t.type} value={t.type} disabled={!t.usable}>
                  {t.label ?? t.type}
                  {t.usable ? '' : ' — not usable yet'}
                </option>
              ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">
            Name (business — renamable)
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="h-8 w-56 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          />
        </label>
        <label className="block">
          <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">Environment</span>
          <input
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
            placeholder="prod / test…"
            className="h-8 w-32 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          />
        </label>
      </div>

      {selected && !selected.usable && (
        <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">
          {selected.note ?? 'This connector is not usable yet.'}
          {(selected.capabilities?.missing ?? []).length > 0 &&
            ` Missing: ${(selected.capabilities?.missing ?? []).join(', ')}.`}
        </p>
      )}

      {selected?.usable && (
        <div className="mt-2 flex flex-wrap gap-2.5">
          {fields.map((f) => (
            <label key={f.name} className="block">
              <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">
                {f.label ?? f.name}
                {f.required ? ' *' : ''}
                {f.secret ? ' (write-only)' : ''}
              </span>
              <input
                type={f.secret ? 'password' : 'text'}
                value={values[f.name] ?? ''}
                placeholder={f.placeholder}
                onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                className="h-8 w-56 rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
              />
            </label>
          ))}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3 border-t border-slate-100 pt-2.5 dark:border-slate-800">
        <button
          type="button"
          disabled={busy || !selected?.usable}
          onClick={() => void submit()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        >
          {busy && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
          Create the connection
        </button>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          Nothing is tested at creation — the sheet opens next with its explicit, bounded test.
        </span>
      </div>
      {refusal && (
        <div className="mt-2">
          <RefusalView refusal={refusal} />
        </div>
      )}
    </section>
  );
}
