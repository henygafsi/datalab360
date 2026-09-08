'use client';

/**
 * StudioConnectorSetup — a connector's setup, INSIDE the Studio.
 *
 * Until now the Studio listed connectors and, the moment one needed
 * configuring, sent the reader away to the legacy admin page ("finish its
 * setup in Connect Data"). The steps below are the SAME steps that page
 * runs — same service functions, same routes, one source of truth — laid
 * out in the guided shape the Studio already uses everywhere else.
 *
 * Per family, mirrored from the legacy flows:
 *   database (PostgreSQL / MySQL)  Connection → Tables → Load
 *   AWS S3                         Integration → IAM trust → Stage
 *   Azure Blob                     Integration → Consent → Stage
 *   Google Cloud Storage           Integration → Stage
 *   Snowflake account-to-account   Credentials → Connect
 *
 * Two honesty rules: a provider whose backend flow is not integrated says
 * so instead of showing a dead form, and every server answer that the user
 * must ACT on (an IAM external id, a consent URL) is displayed verbatim —
 * losing those means the setup cannot be completed anywhere.
 */

import { useState } from 'react';
import { Check, Copy, RefreshCw } from 'lucide-react';
import {
  connectSnowflakeDatalake,
  createAwsStage,
  createAzureStage,
  createGcsStage,
  customApiIngest,
  databricksIngest,
  databricksTest,
  mysqlIngest,
  oracleIngest,
  oracleTest,
  postgresIngest,
  setupAwsStorageIntegration,
  setupAzureStorageIntegration,
  setupGcsStorageIntegration,
} from '@/app/(dashboard)/data-source-connection/connectionServices';
import StudioStepper, { type StepDef } from '@/app/shared/studio/StudioStepper';
import { readFailure } from '@/app/shared/studio/studio-errors';

export interface CatalogConnector {
  connector_id?: string;
  label?: string;
  family?: string;
  status?: string;
  connection_schema?: { required?: string[]; optional?: string[] };
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  width = 'w-64',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  width?: string;
}) {
  return (
    <label className="block">
      <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`h-8 ${width} rounded-lg border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200`}
      />
    </label>
  );
}

/** A value the READER must carry to their cloud console — shown, copyable, never truncated. */
function HandOff({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  if (!value) return null;
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-2 dark:border-amber-900/50 dark:bg-amber-900/10">
      <p className="text-xs font-medium text-amber-800 dark:text-amber-300">{label}</p>
      <p className="mt-0.5 flex items-center gap-1.5">
        <code className="min-w-0 flex-1 break-all font-mono text-xs text-slate-800 dark:text-slate-200">
          {value}
        </code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(value).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            });
          }}
          className="shrink-0 rounded p-1 text-slate-400 hover:text-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check aria-hidden className="h-3.5 w-3.5 text-emerald-600" /> : <Copy aria-hidden className="h-3.5 w-3.5" />}
        </button>
      </p>
    </div>
  );
}

type Result = { ok: boolean; text: string; handoffs?: Array<{ label: string; value: string }> };

export default function StudioConnectorSetup({
  connector,
  onClose,
  onConnected,
}: {
  connector: CatalogConnector;
  onClose: () => void;
  /** called after a step that actually created something server-side */
  onConnected?: () => void;
}) {
  const id = String(connector.connector_id ?? '');
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [f, setF] = useState<Record<string, string>>({});
  const set = (k: string) => (v: string) => setF((x) => ({ ...x, [k]: v }));

  const run = async (fn: () => Promise<Result>) => {
    setBusy(true);
    setResult(null);
    try {
      const r = await fn();
      setResult(r);
      if (r.ok) onConnected?.();
    } catch (e) {
      setResult({ ok: false, text: readFailure(e instanceof Error ? e.message : e).text });
    } finally {
      setBusy(false);
    }
  };

  const resultBlock = (
    <>
      {result && (
        <div className="mt-2 space-y-1.5">
          <p
            role="status"
            className={`rounded-lg px-2.5 py-1.5 text-[13px] ${
              result.ok
                ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200'
                : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300'
            }`}
          >
            {result.text}
          </p>
          {result.handoffs?.map((h) => <HandOff key={h.label} label={h.label} value={h.value} />)}
        </div>
      )}
    </>
  );

  /* ── the per-family steps, mirroring the legacy flows ─────────────── */
  let steps: StepDef[] | null = null;

  if (id === 'conn.postgresql' || id === 'conn.mysql') {
    const engine = id === 'conn.postgresql' ? 'PostgreSQL' : 'MySQL';
    const defPort = id === 'conn.postgresql' ? '5432' : '3306';
    const canConnect = Boolean(f.host && f.database && f.user);
    steps = [
      {
        id: 'conn',
        label: 'Connection',
        title: `Where is the ${engine} server?`,
        subtitle: 'The credentials are used for this load only — nothing is stored in the browser.',
        canContinue: canConnect,
        blockedReason: 'Host, database and user are needed.',
        content: (
          <div className="flex flex-wrap gap-2.5">
            <Field label="Host" value={f.host ?? ''} onChange={set('host')} placeholder="db.internal or 127.0.0.1" />
            <Field label="Port" value={f.port ?? defPort} onChange={set('port')} width="w-24" />
            <Field label="Database" value={f.database ?? ''} onChange={set('database')} />
            <Field label="User" value={f.user ?? ''} onChange={set('user')} />
            <Field label="Password" type="password" value={f.password ?? ''} onChange={set('password')} />
          </div>
        ),
      },
      {
        id: 'tables',
        label: 'Tables',
        title: 'Which tables should be read?',
        subtitle: 'Comma-separated names. Leave empty to load every table of the database.',
        content: (
          <Field
            label="Tables (optional)"
            value={f.tables ?? ''}
            onChange={set('tables')}
            placeholder="public.src_orders, public.src_items"
            width="w-full max-w-lg"
          />
        ),
      },
      {
        id: 'load',
        label: 'Load',
        title: 'Load into the warehouse',
        subtitle: 'Runs the real ingestion — the result states how many tables landed.',
        content: (
          <>
            <button
              type="button"
              disabled={busy || !canConnect}
              onClick={() =>
                void run(async () => {
                  const body = {
                    host: f.host!,
                    port: Number(f.port ?? defPort) || Number(defPort),
                    database: f.database!,
                    user: f.user!,
                    password: f.password ?? '',
                    ...(f.tables?.trim()
                      ? { tables: f.tables.split(',').map((t) => t.trim()).filter(Boolean) }
                      : {}),
                  };
                  const r = (id === 'conn.postgresql'
                    ? await postgresIngest(body)
                    : await mysqlIngest(body)) as { message: string; tables?: number };
                  return {
                    ok: true,
                    text: `${r.message}${r.tables != null ? ` — ${r.tables} table(s).` : ''}`,
                  };
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
            >
              {busy && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
              Load {engine} now
            </button>
            {resultBlock}
          </>
        ),
      },
    ];
  } else if (id === 'conn.amazon_s3') {
    steps = [
      {
        id: 'integration',
        label: 'Integration',
        title: 'Create the storage integration',
        subtitle: 'The warehouse gets an IAM identity for your bucket — the trust values come back here.',
        canContinue: Boolean(f.integration_name && f.bucket_name && f.aws_role_arn),
        blockedReason: 'Integration name, bucket and role ARN are needed.',
        content: (
          <>
            <div className="flex flex-wrap gap-2.5">
              <Field label="Integration name" value={f.integration_name ?? ''} onChange={set('integration_name')} placeholder="S3_INT_SALES" />
              <Field label="Bucket" value={f.bucket_name ?? ''} onChange={set('bucket_name')} placeholder="my-company-data" />
              <Field label="IAM role ARN" value={f.aws_role_arn ?? ''} onChange={set('aws_role_arn')} width="w-96" placeholder="arn:aws:iam::123456789:role/snowflake-access" />
            </div>
            <button
              type="button"
              disabled={busy || !(f.integration_name && f.bucket_name && f.aws_role_arn)}
              onClick={() =>
                void run(async () => {
                  const r = await setupAwsStorageIntegration(f.integration_name!, f.bucket_name!, f.aws_role_arn!);
                  return {
                    ok: true,
                    text: `${r.message} Put these two values into your role's trust policy, then continue.`,
                    handoffs: [
                      { label: 'STORAGE_AWS_IAM_USER_ARN', value: r.STORAGE_AWS_IAM_USER_ARN },
                      { label: 'STORAGE_AWS_EXTERNAL_ID', value: r.STORAGE_AWS_EXTERNAL_ID },
                    ],
                  };
                })
              }
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40"
            >
              {busy && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
              Create the integration
            </button>
            {resultBlock}
          </>
        ),
      },
      {
        id: 'stage',
        label: 'Stage',
        title: 'Create the stage on the bucket',
        subtitle: 'Once the trust policy carries the two values from the previous step.',
        content: (
          <>
            <div className="flex flex-wrap gap-2.5">
              <Field label="Stage name" value={f.stage_name ?? ''} onChange={set('stage_name')} placeholder="S3_STAGE_SALES" />
            </div>
            <button
              type="button"
              disabled={busy || !(f.stage_name && f.bucket_name && f.integration_name)}
              onClick={() =>
                void run(async () => {
                  await createAwsStage(f.stage_name!, f.bucket_name!, f.integration_name!, true, true);
                  return { ok: true, text: `Stage ${f.stage_name} created on ${f.bucket_name}.` };
                })
              }
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40"
            >
              {busy && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
              Create the stage
            </button>
            {resultBlock}
          </>
        ),
      },
    ];
  } else if (id === 'conn.azure_blob_storage') {
    steps = [
      {
        id: 'integration',
        label: 'Integration',
        title: 'Create the storage integration',
        subtitle: 'Azure answers with a consent URL an administrator must open once.',
        canContinue: Boolean(f.integration_name && f.tenant_id && f.url),
        blockedReason: 'Integration name, tenant id and container URL are needed.',
        content: (
          <>
            <div className="flex flex-wrap gap-2.5">
              <Field label="Integration name" value={f.integration_name ?? ''} onChange={set('integration_name')} placeholder="AZ_INT_SALES" />
              <Field label="Tenant id" value={f.tenant_id ?? ''} onChange={set('tenant_id')} width="w-80" />
              <Field label="Container URL" value={f.url ?? ''} onChange={set('url')} width="w-96" placeholder="azure://account.blob.core.windows.net/container" />
            </div>
            <button
              type="button"
              disabled={busy || !(f.integration_name && f.tenant_id && f.url)}
              onClick={() =>
                void run(async () => {
                  const r = await setupAzureStorageIntegration(f.integration_name!, f.tenant_id!, f.url!);
                  return {
                    ok: true,
                    text: r.message,
                    handoffs: r.azure_consent_url
                      ? [{ label: 'Azure consent URL — open it as an administrator', value: r.azure_consent_url }]
                      : [],
                  };
                })
              }
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40"
            >
              {busy && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
              Create the integration
            </button>
            {resultBlock}
          </>
        ),
      },
      {
        id: 'stage',
        label: 'Stage',
        title: 'Create the stage on the container',
        content: (
          <>
            <Field label="Stage name" value={f.stage_name ?? ''} onChange={set('stage_name')} placeholder="AZ_STAGE_SALES" />
            <button
              type="button"
              disabled={busy || !(f.stage_name && f.url && f.integration_name)}
              onClick={() =>
                void run(async () => {
                  await createAzureStage(f.stage_name!, f.url!, f.integration_name!, true, true);
                  return { ok: true, text: `Stage ${f.stage_name} created.` };
                })
              }
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40"
            >
              {busy && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
              Create the stage
            </button>
            {resultBlock}
          </>
        ),
      },
    ];
  } else if (id === 'conn.google_cloud_storage') {
    steps = [
      {
        id: 'integration',
        label: 'Integration',
        title: 'Create the storage integration',
        canContinue: Boolean(f.integration_name && f.bucket_name),
        blockedReason: 'Integration name and bucket are needed.',
        content: (
          <>
            <div className="flex flex-wrap gap-2.5">
              <Field label="Integration name" value={f.integration_name ?? ''} onChange={set('integration_name')} placeholder="GCS_INT_SALES" />
              <Field label="Bucket" value={f.bucket_name ?? ''} onChange={set('bucket_name')} placeholder="my-company-data" />
            </div>
            <button
              type="button"
              disabled={busy || !(f.integration_name && f.bucket_name)}
              onClick={() =>
                void run(async () => {
                  await setupGcsStorageIntegration(f.integration_name!, f.bucket_name!);
                  return { ok: true, text: 'Storage integration created — grant its service account access to the bucket, then continue.' };
                })
              }
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40"
            >
              {busy && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
              Create the integration
            </button>
            {resultBlock}
          </>
        ),
      },
      {
        id: 'stage',
        label: 'Stage',
        title: 'Create the stage on the bucket',
        content: (
          <>
            <Field label="Stage name" value={f.stage_name ?? ''} onChange={set('stage_name')} placeholder="GCS_STAGE_SALES" />
            <button
              type="button"
              disabled={busy || !(f.stage_name && f.bucket_name && f.integration_name)}
              onClick={() =>
                void run(async () => {
                  await createGcsStage(f.stage_name!, f.bucket_name!, f.integration_name!, true, true);
                  return { ok: true, text: `Stage ${f.stage_name} created on ${f.bucket_name}.` };
                })
              }
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40"
            >
              {busy && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
              Create the stage
            </button>
            {resultBlock}
          </>
        ),
      },
    ];
  } else if (id === 'conn.databricks') {
    const canConnect = Boolean(f.host && f.http_path && f.access_token);
    steps = [
      {
        id: 'conn',
        label: 'Connection',
        title: 'Connect the Databricks warehouse',
        subtitle: 'A personal access token with read on the catalog is enough.',
        canContinue: canConnect,
        blockedReason: 'Host, HTTP path and token are needed.',
        content: (
          <>
            <div className="flex flex-wrap gap-2.5">
              <Field label="Host" value={f.host ?? ''} onChange={set('host')} width="w-80" placeholder="dbc-xxxx.cloud.databricks.com" />
              <Field label="HTTP path" value={f.http_path ?? ''} onChange={set('http_path')} width="w-80" placeholder="/sql/1.0/warehouses/abc123" />
              <Field label="Access token" type="password" value={f.access_token ?? ''} onChange={set('access_token')} width="w-80" />
            </div>
            <button
              type="button"
              disabled={busy || !canConnect}
              onClick={() =>
                void run(async () => {
                  const r = await databricksTest({ host: f.host!, http_path: f.http_path!, access_token: f.access_token! });
                  return { ok: Boolean(r.ok), text: r.ok ? 'Connected — the warehouse answered.' : 'The warehouse did not accept the connection.' };
                })
              }
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-accent-500 px-3 py-1.5 text-[13px] font-medium text-accent-700 hover:bg-accent-50 disabled:opacity-40 dark:text-accent-300 dark:hover:bg-accent-900/30"
            >
              {busy && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
              Test the connection
            </button>
            {resultBlock}
          </>
        ),
      },
      {
        id: 'load',
        label: 'Load',
        title: 'Load a catalog’s tables',
        subtitle: 'Names the catalog and schema; leave tables empty to load the whole schema.',
        content: (
          <>
            <div className="flex flex-wrap gap-2.5">
              <Field label="Catalog" value={f.catalog ?? ''} onChange={set('catalog')} />
              <Field label="Schema" value={f.schema_name ?? ''} onChange={set('schema_name')} />
              <Field label="Tables (optional)" value={f.tables ?? ''} onChange={set('tables')} width="w-full max-w-lg" placeholder="orders, customers" />
            </div>
            <button
              type="button"
              disabled={busy || !(canConnect && f.catalog && f.schema_name)}
              onClick={() =>
                void run(async () => {
                  const r = await databricksIngest({
                    host: f.host!, http_path: f.http_path!, access_token: f.access_token!,
                    catalog: f.catalog!, schema_name: f.schema_name!,
                    ...(f.tables?.trim() ? { tables: f.tables.split(',').map((t) => t.trim()).filter(Boolean) } : {}),
                  });
                  return { ok: true, text: `${r.message}${r.tables ? ` — ${r.tables.length} table(s).` : ''}` };
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40"
            >
              {busy && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
              Load from Databricks
            </button>
            {resultBlock}
          </>
        ),
      },
    ];
  } else if (id === 'conn.oracle_database') {
    const canConnect = Boolean(f.host && f.service_name && f.username);
    steps = [
      {
        id: 'conn',
        label: 'Connection',
        title: 'Connect the Oracle database',
        canContinue: canConnect,
        blockedReason: 'Host, service name and user are needed.',
        content: (
          <>
            <div className="flex flex-wrap gap-2.5">
              <Field label="Host" value={f.host ?? ''} onChange={set('host')} placeholder="db.internal" />
              <Field label="Port" value={f.port ?? '1521'} onChange={set('port')} width="w-24" />
              <Field label="Service name" value={f.service_name ?? ''} onChange={set('service_name')} placeholder="ORCLPDB1" />
              <Field label="User" value={f.username ?? ''} onChange={set('username')} />
              <Field label="Password" type="password" value={f.password ?? ''} onChange={set('password')} />
            </div>
            <button
              type="button"
              disabled={busy || !canConnect}
              onClick={() =>
                void run(async () => {
                  const r = await oracleTest({
                    host: f.host!, port: Number(f.port ?? '1521') || 1521,
                    service_name: f.service_name!, username: f.username!, password: f.password ?? '',
                  });
                  return {
                    ok: Boolean(r.ok),
                    text: r.ok ? `Connected — Oracle ${r.version ?? ''}, ${r.table_count ?? '?'} table(s) visible.` : 'Oracle did not accept the connection.',
                  };
                })
              }
              className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-accent-500 px-3 py-1.5 text-[13px] font-medium text-accent-700 hover:bg-accent-50 disabled:opacity-40 dark:text-accent-300 dark:hover:bg-accent-900/30"
            >
              {busy && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
              Test the connection
            </button>
            {resultBlock}
          </>
        ),
      },
      {
        id: 'load',
        label: 'Load',
        title: 'Load the tables',
        subtitle: 'Comma-separated names, or leave empty to load every table.',
        content: (
          <>
            <Field label="Tables (optional)" value={f.tables ?? ''} onChange={set('tables')} width="w-full max-w-lg" placeholder="SALES.ORDERS, SALES.CUSTOMERS" />
            <button
              type="button"
              disabled={busy || !canConnect}
              onClick={() =>
                void run(async () => {
                  const r = await oracleIngest({
                    host: f.host!, port: Number(f.port ?? '1521') || 1521,
                    service_name: f.service_name!, username: f.username!, password: f.password ?? '',
                    ...(f.tables?.trim() ? { tables: f.tables.split(',').map((t) => t.trim()).filter(Boolean) } : {}),
                  });
                  return { ok: true, text: (r as { message?: string }).message ?? 'Loaded from Oracle.' };
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40"
            >
              {busy && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
              Load from Oracle
            </button>
            {resultBlock}
          </>
        ),
      },
    ];
  } else if (id === 'conn.custom_rest_api') {
    steps = [
      {
        id: 'conn',
        label: 'Endpoint',
        title: 'Point at the JSON API',
        subtitle: 'Fetched server-side and landed as a table. The row path picks the array inside the response.',
        canContinue: Boolean(f.url && f.target_table),
        blockedReason: 'A URL and a target table name are needed.',
        content: (
          <div className="flex flex-wrap gap-2.5">
            <Field label="URL" value={f.url ?? ''} onChange={set('url')} width="w-full max-w-lg" placeholder="https://api.example.com/v1/orders" />
            <Field label="Row path (optional)" value={f.json_path ?? ''} onChange={set('json_path')} placeholder="data.items" />
            <Field label="Target table" value={f.target_table ?? ''} onChange={set('target_table')} placeholder="EXT_ORDERS" />
          </div>
        ),
      },
      {
        id: 'load',
        label: 'Load',
        title: 'Fetch and land it',
        content: (
          <>
            <button
              type="button"
              disabled={busy || !(f.url && f.target_table)}
              onClick={() =>
                void run(async () => {
                  const r = await customApiIngest({
                    url: f.url!,
                    ...(f.json_path?.trim() ? { json_path: f.json_path.trim() } : {}),
                    target_database: 'DATA360_LITE',
                    target_table: f.target_table!.trim(),
                    mode: 'replace',
                  });
                  return { ok: true, text: `${r.status ?? 'Loaded'} — ${r.rows_loaded ?? 0} row(s) into ${r.table ?? f.target_table}.` };
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40"
            >
              {busy && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
              Fetch and load
            </button>
            {resultBlock}
          </>
        ),
      },
    ];
  } else if (id === 'conn.snowflake_account_to_account') {
    steps = [
      {
        id: 'creds',
        label: 'Credentials',
        title: 'Connect the other account',
        subtitle: 'A read-only role on the source account is enough — least privilege applies.',
        canContinue: Boolean(f.account && f.username && f.password && f.role),
        blockedReason: 'Account, user, password and role are needed.',
        content: (
          <div className="flex flex-wrap gap-2.5">
            <Field label="Account" value={f.account ?? ''} onChange={set('account')} placeholder="org-account" />
            <Field label="User" value={f.username ?? ''} onChange={set('username')} />
            <Field label="Password" type="password" value={f.password ?? ''} onChange={set('password')} />
            <Field label="Role" value={f.role ?? ''} onChange={set('role')} placeholder="READER_ROLE" />
          </div>
        ),
      },
      {
        id: 'connect',
        label: 'Connect',
        title: 'Test and register the link',
        content: (
          <>
            <button
              type="button"
              disabled={busy || !(f.account && f.username && f.password && f.role)}
              onClick={() =>
                void run(async () => {
                  await connectSnowflakeDatalake(f.username!, f.password!, f.account!, f.role!);
                  return { ok: true, text: `Connected to ${f.account} as ${f.username}.` };
                })
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40"
            >
              {busy && <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" />}
              Connect
            </button>
            {resultBlock}
          </>
        ),
      },
    ];
  }

  return (
    <section
      aria-label={`Set up ${connector.label ?? id}`}
      className="rounded-xl border border-accent-200 bg-white p-3 dark:border-accent-900/50 dark:bg-slate-900"
    >
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {connector.label ?? id}
        </h3>
        <span className="text-xs text-slate-400">{connector.family}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto rounded px-2 py-1 text-xs text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-400"
        >
          Close
        </button>
      </div>

      {steps ? (
        <StudioStepper steps={steps} current={step} onStep={setStep} onFinish={onClose} finishLabel="Done" />
      ) : (
        /* no invented form for a flow the backend does not carry */
        <p className="text-[13px] text-slate-500 dark:text-slate-400">
          {connector.status === 'not_integrated'
            ? `${connector.label ?? 'This connector'} has no integration on this platform yet — the form will appear when its backend flow lands. Nothing is simulated meanwhile.`
            : `The setup for ${connector.label ?? 'this connector'} is not wired into the Studio yet — it stays available from the administration view.`}
        </p>
      )}
    </section>
  );
}
