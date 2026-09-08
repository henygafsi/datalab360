'use client';

/**
 * StudioRestBuilder — build a REST connector by filling a form.
 *
 * The user asked to "generate a connection and ingestion via config in
 * form". The backend exposes one engine with per-SaaS presets, so the flow
 * is: pick a preset → fill base URL, auth and secrets → Preview (bounded,
 * writes nothing) → Save the reusable definition → Ingest. Every refusal
 * the engine can raise — a secret in the URL, a placeholder base URL, an
 * unreachable host — comes back as an answer shown in place, never a dead
 * spinner.
 *
 * Secrets are write-only: typed here, sent in the body, never read back —
 * the connector only ever tells which keys are set.
 */

import { useEffect, useMemo, useState } from 'react';
import { Check, Play, RefreshCw, Save, Search } from 'lucide-react';
import {
  getRestPresets,
  ingestRestConnector,
  previewRest,
  saveRestConnector,
  type RestConfig,
  type RestConnector,
  type RestPreset,
  type RestPresetsView,
  type RestPreview,
  type RestSecrets,
} from '@/app/services/studio/studio-api';

const SECRET_LABEL: Record<string, string> = {
  token: 'Bearer token',
  api_key: 'API key',
  password: 'Password',
  client_secret: 'Client secret',
};

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder,
  width = 'w-full max-w-md',
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

export default function StudioRestBuilder({ onClose }: { onClose?: () => void }) {
  const [meta, setMeta] = useState<RestPresetsView | null>(null);
  const [presetId, setPresetId] = useState<string>('generic');
  const [baseUrl, setBaseUrl] = useState('');
  const [authType, setAuthType] = useState('bearer');
  const [secretVal, setSecretVal] = useState('');
  const [username, setUsername] = useState('');
  const [tokenUrl, setTokenUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [path, setPath] = useState('/');
  const [rowPath, setRowPath] = useState('');
  const [table, setTable] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<RestPreview | null>(null);
  const [saved, setSaved] = useState<RestConnector | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    void getRestPresets()
      .then((m) => setMeta(m))
      .catch(() => undefined);
  }, []);

  const preset: RestPreset | undefined = useMemo(
    () => (meta?.presets ?? []).find((p) => p.preset === presetId),
    [meta, presetId],
  );

  // adopt a preset's defaults when it is chosen
  useEffect(() => {
    if (!preset) return;
    setAuthType(preset.auth?.type ?? 'bearer');
    if (preset.base_url_hint && !baseUrl) setBaseUrl('');
    const ep = (preset.endpoints ?? [])[0] as { path?: string; row_path?: string; target_table?: string } | undefined;
    if (ep) {
      setPath(ep.path ?? '/');
      setRowPath(ep.row_path ?? '');
      setTable(ep.target_table ?? '');
    }
  }, [presetId]); // eslint-disable-line react-hooks/exhaustive-deps

  const secretKey = (preset?.secret_keys ?? ['token'])[0] ?? 'token';

  const buildConfig = (): RestConfig => ({
    preset: presetId,
    base_url: baseUrl.trim(),
    auth: {
      type: authType,
      ...(authType === 'basic' ? { username: username.trim() } : {}),
      ...(authType === 'oauth2_client_credentials'
        ? { token_url: tokenUrl.trim(), client_id: clientId.trim() }
        : {}),
    },
    pagination: (preset?.pagination as Record<string, unknown>) ?? { type: 'none' },
    endpoints: [
      {
        id: 'main',
        path: path.trim() || '/',
        method: 'GET',
        row_path: rowPath.trim(),
        target_table: table.trim() || 'REST_TABLE',
      },
    ],
    target: { database: 'DATA360_LITE', schema: 'REST_API', mode: 'replace' },
  });

  const buildSecrets = (): RestSecrets => (secretVal ? { [secretKey]: secretVal } : {});

  const canPreview = Boolean(baseUrl.trim() && table.trim());

  const runPreview = async () => {
    setBusy('preview');
    setMsg(null);
    setPreview(null);
    const r = await previewRest({ config: buildConfig(), secrets: buildSecrets(), endpoint_id: 'main', rows: 20 });
    setBusy(null);
    if (r.ok && r.preview) {
      setPreview(r.preview);
    } else {
      setMsg({ ok: false, text: `${r.error?.error_code ? `${r.error.error_code}: ` : ''}${r.error?.message ?? 'Preview failed.'}` });
    }
  };

  const runSave = async () => {
    setBusy('save');
    setMsg(null);
    const r = await saveRestConnector({ config: buildConfig(), secrets: buildSecrets() });
    setBusy(null);
    if (r.ok && r.connector) {
      setSaved(r.connector);
      setMsg({ ok: true, text: 'Connector saved — it is reusable now. Ingest when you are ready.' });
    } else {
      setMsg({ ok: false, text: `${r.error?.error_code ? `${r.error.error_code}: ` : ''}${r.error?.message ?? 'Save failed.'}` });
    }
  };

  const runIngest = async () => {
    if (!saved?.connector_id) return;
    setBusy('ingest');
    setMsg(null);
    const r = await ingestRestConnector(saved.connector_id, { max_rows: 50_000 });
    setBusy(null);
    if (r.ok && r.result) {
      const rows = r.result.rows_loaded ?? 0;
      setMsg({ ok: r.result.status !== 'failed', text: `${r.result.status ?? 'done'} — ${rows} row(s) loaded.` });
    } else {
      setMsg({ ok: false, text: `${r.error?.error_code ? `${r.error.error_code}: ` : ''}${r.error?.message ?? 'Ingest failed.'}` });
    }
  };

  return (
    <section
      aria-label="REST connector builder"
      className="rounded-xl border border-accent-200 bg-white p-3 dark:border-accent-900/50 dark:bg-slate-900"
    >
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Build a REST connection
        </h3>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="ml-auto rounded px-2 py-1 text-xs text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-slate-400"
          >
            Close
          </button>
        )}
      </div>

      {/* preset */}
      <label className="block">
        <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">Kind of API</span>
        <select
          value={presetId}
          aria-label="API preset"
          onChange={(e) => setPresetId(e.target.value)}
          className="h-8 w-full max-w-md rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
        >
          {(meta?.presets ?? [{ preset: 'generic', label: 'Custom REST API' }]).map((p) => (
            <option key={p.preset} value={p.preset}>
              {p.label ?? p.preset}
              {p.status === 'partial' ? ' (partial)' : ''}
            </option>
          ))}
        </select>
      </label>
      {preset?.note && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{preset.note}</p>
      )}

      <div className="mt-2 flex flex-wrap gap-2.5">
        <Field label="Base URL" value={baseUrl} onChange={setBaseUrl} placeholder={preset?.base_url_hint ?? 'https://api.example.com/v1'} />
        <label className="block">
          <span className="mb-0.5 block text-xs text-slate-500 dark:text-slate-400">Auth</span>
          <select
            value={authType}
            aria-label="Auth type"
            onChange={(e) => setAuthType(e.target.value)}
            className="h-8 w-44 rounded-lg border border-slate-200 bg-white px-2 text-[13px] text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {(meta?.auth_types ?? ['none', 'bearer', 'api_key', 'basic', 'oauth2_client_credentials']).map((t) => (
              <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
            ))}
          </select>
        </label>
      </div>

      {/* auth details */}
      {authType !== 'none' && (
        <div className="mt-2 flex flex-wrap gap-2.5">
          {authType === 'basic' && (
            <Field label="Username" value={username} onChange={setUsername} width="w-52" />
          )}
          {authType === 'oauth2_client_credentials' && (
            <>
              <Field label="Token URL" value={tokenUrl} onChange={setTokenUrl} width="w-72" placeholder="https://login.example.com/oauth/token" />
              <Field label="Client id" value={clientId} onChange={setClientId} width="w-52" />
            </>
          )}
          <Field
            label={`${SECRET_LABEL[secretKey] ?? secretKey} (write-only — never shown again)`}
            type="password"
            value={secretVal}
            onChange={setSecretVal}
            width="w-72"
          />
        </div>
      )}

      {/* endpoint → table */}
      <div className="mt-2 flex flex-wrap gap-2.5">
        <Field label="Endpoint path" value={path} onChange={setPath} width="w-52" placeholder="/users" />
        <Field label="Row path (optional)" value={rowPath} onChange={setRowPath} width="w-40" placeholder="results / value / d.results" />
        <Field label="Target table" value={table} onChange={setTable} width="w-52" placeholder="EXT_USERS" />
      </div>

      {/* actions: preview → save → ingest */}
      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2.5 dark:border-slate-800">
        <button
          type="button"
          disabled={busy != null || !canPreview}
          onClick={() => void runPreview()}
          title={canPreview ? 'Fetch a few rows — writes nothing' : 'A base URL and a target table are needed'}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] text-slate-700 hover:border-slate-300 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:border-slate-700 dark:text-slate-200"
        >
          {busy === 'preview' ? <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" /> : <Search aria-hidden className="h-3.5 w-3.5" />}
          Preview
        </button>
        <button
          type="button"
          disabled={busy != null || !canPreview}
          onClick={() => void runSave()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent-600 px-3 py-1.5 text-[13px] font-medium text-white hover:bg-accent-700 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500"
        >
          {busy === 'save' ? <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" /> : <Save aria-hidden className="h-3.5 w-3.5" />}
          Save the connector
        </button>
        {saved?.connector_id && (
          <button
            type="button"
            disabled={busy != null}
            onClick={() => void runIngest()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-accent-500 px-3 py-1.5 text-[13px] font-medium text-accent-700 hover:bg-accent-50 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 dark:text-accent-300 dark:hover:bg-accent-900/30"
          >
            {busy === 'ingest' ? <RefreshCw aria-hidden className="h-3.5 w-3.5 animate-spin" /> : <Play aria-hidden className="h-3.5 w-3.5" />}
            Ingest into {saved.target?.schema ?? 'REST_API'}
          </button>
        )}
      </div>

      {msg && (
        <p
          role="status"
          className={`mt-2 rounded-lg px-2.5 py-1.5 text-[13px] ${
            msg.ok
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200'
              : 'bg-amber-50 text-amber-900 dark:bg-amber-900/20 dark:text-amber-200'
          }`}
        >
          {msg.text}
        </p>
      )}

      {/* the bounded preview — the proof before saving anything */}
      {preview && (
        <div className="mt-2 rounded-lg border border-slate-200 p-2 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {preview.row_count ?? 0} row(s) — {preview.scope?.note ?? 'a bounded preview, nothing written'}
          </p>
          {(preview.schema ?? []).length > 0 && (
            <p className="mt-1 flex flex-wrap gap-1">
              {(preview.schema ?? []).slice(0, 20).map((c) => (
                <span
                  key={c.name}
                  className="rounded-full bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                >
                  {c.name}
                </span>
              ))}
            </p>
          )}
          {preview.request?.url && (
            <p className="mt-1 truncate font-mono text-xs text-slate-400 dark:text-slate-500" title={preview.request.url}>
              {preview.request.method ?? 'GET'} {preview.request.url}
            </p>
          )}
        </div>
      )}

      <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
        The secret travels in a header, is stored encrypted apart from the definition, and is never
        shown again. Preview writes nothing; ingest is bounded and says when the source has more.
      </p>
    </section>
  );
}
