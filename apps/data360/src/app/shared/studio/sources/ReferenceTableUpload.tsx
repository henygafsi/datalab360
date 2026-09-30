'use client';

/**
 * ReferenceTableUpload — bring a reference table INTO the platform from a file.
 *
 * The gap this closes: the Studio could read tables that already existed in the
 * warehouse, but there was no way to ADD one. Reference data (regions, product
 * families, store lists, mapping tables) usually starts life as a spreadsheet,
 * and without this the user had to leave the product to get it in.
 *
 * The journey mirrors what the backend actually does, and says so at each step:
 *   stage → upload → preview → INFER_SCHEMA + CREATE + COPY
 *
 * Honesty rules applied here:
 *  - the PREVIEW is optional. Its read lane is currently unreliable (503
 *    CACHE_NOT_READY on this account) and a failed preview must not look like a
 *    failed upload — we say the preview is unavailable and still let the user
 *    create the table, because the create path does not depend on it.
 *  - counts come from the backend response (rows_loaded), never from counting
 *    the file client-side, so the number shown is the number Snowflake accepted.
 *  - every failure shows the backend's own wording rather than a generic retry.
 */

import { useCallback, useRef, useState } from 'react';
import {
  PiUploadSimpleBold,
  PiCheckCircleBold,
  PiWarningCircleBold,
  PiTableBold,
  PiSpinnerGapBold,
} from 'react-icons/pi';

import {
  createReferenceTableFromFile,
  type LoadTableResult,
  type StagePreview,
} from '@/app/services/studio/reference-tables';

type Step = 'idle' | 'stage' | 'upload' | 'preview' | 'load' | 'done' | 'error';

const STEP_LABEL: Record<Exclude<Step, 'idle' | 'done' | 'error'>, string> = {
  stage: 'Preparing the landing area…',
  upload: 'Uploading the file…',
  preview: 'Reading the first rows…',
  load: 'Creating the table and copying the rows…',
};

/** A table name Snowflake will accept unquoted, derived from the file name. */
function tableNameFrom(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, '');
  const cleaned = base.toUpperCase().replace(/[^A-Z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
  if (!cleaned) return 'REFERENCE_TABLE';
  return /^[A-Z_]/.test(cleaned) ? cleaned : `T_${cleaned}`;
}

export interface ReferenceTableUploadProps {
  /** Default target database — the application's working database. */
  defaultDatabase?: string;
  defaultSchema?: string;
  /** Called once the table exists, so the caller can refresh its source list. */
  onCreated?: (result: LoadTableResult) => void;
}

export default function ReferenceTableUpload({
  defaultDatabase = 'DATA360_LITE',
  defaultSchema = 'PUBLIC',
  onCreated,
}: ReferenceTableUploadProps) {
  const [file, setFile] = useState<File | null>(null);
  const [database, setDatabase] = useState(defaultDatabase);
  const [schema, setSchema] = useState(defaultSchema);
  const [table, setTable] = useState('');
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LoadTableResult | null>(null);
  const [preview, setPreview] = useState<StagePreview | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const busy = step !== 'idle' && step !== 'done' && step !== 'error';

  const pick = useCallback((f: File | null) => {
    setFile(f);
    setResult(null);
    setPreview(null);
    setError(null);
    setStep('idle');
    if (f && !table) setTable(tableNameFrom(f.name));
  }, [table]);

  const run = useCallback(async () => {
    if (!file) return;
    setError(null);
    setResult(null);
    try {
      const { load, preview: pv } = await createReferenceTableFromFile(
        file,
        { database: database.trim(), schema_name: schema.trim(), table: table.trim(), mode: 'create' },
        (s) => setStep(s)
      );
      setPreview(pv);
      setResult(load);
      setStep('done');
      onCreated?.(load);
    } catch (e) {
      const err = e as { response?: { data?: { detail?: unknown } }; message?: string };
      const d = err?.response?.data?.detail;
      const msg =
        typeof d === 'string'
          ? d
          : d && typeof d === 'object'
            ? ((d as { detail?: string; message?: string }).detail ??
               (d as { message?: string }).message ??
               'The table could not be created.')
            : (err?.message ?? 'The table could not be created.');
      setError(msg);
      setStep('error');
    }
  }, [file, database, schema, table, onCreated]);

  const canRun = !!file && !!database.trim() && !!schema.trim() && !!table.trim() && !busy;

  return (
    <section className="rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-5">
      <header className="flex items-start gap-3 mb-4">
        <PiTableBold className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            Add a reference table
          </h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Bring a list the business maintains — regions, product families, store
            codes, a mapping table — in from a file. The columns and their types are
            inferred from the file itself; nothing is created until you choose a name.
          </p>
        </div>
      </header>

      {/* ── file ─────────────────────────────────────────────────────────── */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (busy) return;
          pick(e.dataTransfer.files?.[0] ?? null);
        }}
        className="rounded-lg border-2 border-dashed border-gray-200 dark:border-gray-700 p-5 text-center"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.tsv,.json,.parquet,text/csv"
          className="sr-only"
          onChange={(e) => pick(e.target.files?.[0] ?? null)}
        />
        <PiUploadSimpleBold className="w-6 h-6 mx-auto text-gray-400" />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className="mt-2 text-sm font-medium text-blue-600 hover:text-blue-700 disabled:opacity-50"
        >
          {file ? 'Choose a different file' : 'Choose a file'}
        </button>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
          {file
            ? `${file.name} · ${(file.size / 1024).toFixed(1)} KB`
            : 'or drop it here — CSV, TSV, JSON or Parquet'}
        </p>
        {/* Measured: 8.6 MB took 280s to reach the stage. Saying so up front is the
            difference between "it's working" and "it's broken". */}
        {file && file.size > 2 * 1024 * 1024 && (
          <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
            Large file — uploading to the warehouse takes roughly{' '}
            {Math.max(1, Math.round((file.size / (1024 * 1024)) * 0.75))} minute
            {Math.max(1, Math.round((file.size / (1024 * 1024)) * 0.75)) === 1 ? '' : 's'}.
            Keep this tab open.
          </p>
        )}
      </div>

      {/* ── target ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Database</span>
          <input
            value={database}
            disabled={busy}
            onChange={(e) => setDatabase(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm disabled:opacity-50"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Schema</span>
          <input
            value={schema}
            disabled={busy}
            onChange={(e) => setSchema(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm disabled:opacity-50"
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Table</span>
          <input
            value={table}
            disabled={busy}
            placeholder="DIM_REGION"
            onChange={(e) => setTable(e.target.value.toUpperCase())}
            className="mt-1 w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-transparent px-3 py-2 text-sm disabled:opacity-50"
          />
        </label>
      </div>

      {/* ── action ───────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mt-4">
        <button
          type="button"
          disabled={!canRun}
          onClick={run}
          className="rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:hover:bg-blue-600 text-white text-sm font-medium px-4 py-2"
        >
          Create the table
        </button>
        {busy && (
          <span role="status" className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
            <PiSpinnerGapBold className="w-4 h-4 animate-spin" />
            {STEP_LABEL[step as Exclude<Step, 'idle' | 'done' | 'error'>]}
          </span>
        )}
      </div>

      {/* ── preview, when the read lane served it ────────────────────────── */}
      {preview?.unavailable && step === 'done' && (
        <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
          {preview.unavailable}
        </p>
      )}

      {/* ── outcome ──────────────────────────────────────────────────────── */}
      {step === 'done' && result && (
        <div
          role="status"
          className="mt-4 flex items-start gap-3 rounded-lg bg-green-50 dark:bg-green-950/40 border border-green-100 dark:border-green-900/50 p-4"
        >
          <PiCheckCircleBold className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-green-800 dark:text-green-300">
              {result.target} — {result.rows_loaded.toLocaleString()} row
              {result.rows_loaded === 1 ? '' : 's'} loaded
            </p>
            <p className="text-green-700 dark:text-green-400 mt-0.5">
              {result.created ? 'The table was created' : 'The table already existed and was written to'}{' '}
              from {result.file}. It is now available as a source for your model.
            </p>
          </div>
        </div>
      )}

      {step === 'error' && error && (
        <div
          role="alert"
          className="mt-4 flex items-start gap-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 p-4"
        >
          <PiWarningCircleBold className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium text-red-700 dark:text-red-400">The table was not created</p>
            <p className="text-red-600 dark:text-red-400 mt-0.5">{error}</p>
          </div>
        </div>
      )}
    </section>
  );
}
