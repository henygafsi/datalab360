/**
 * Catalog grounding for the Connect module AI connector-helper.
 *
 * Mirrors workflow/components/etl-catalog-grounding.ts. The LLM (Snowflake
 * Cortex) has a tight execution budget, so the catalog cannot be sent in
 * full. This module exposes:
 *
 *  - CONNECTORS / CONNECTOR_BY_ID  — typed access to connectors-catalog.json
 *  - buildConnectorPromptSection() — terse one-line-per-connector index for
 *                                    the LLM prompt
 *  - validateConnectorConfig()     — checks required params + per-type
 *                                    validation before a connection is
 *                                    committed to the backend
 *  - matchConnectorFromText()      — deterministic heuristic: guess the
 *                                    connector id from a pasted connection
 *                                    string / config blob and extract fields.
 *                                    Offline fallback for the AI helper.
 *
 * connectors-catalog.json is the single source of truth for what counts as a
 * "real" connector and which fields each one needs.
 */
import catalogRaw from './connectors-catalog.json';

export type ConnectorParamType = 'string' | 'number' | 'boolean' | 'secret' | 'enum';
export type ConnectorValidation = 'hostname' | 'port' | 'uri' | 'non_empty' | 'account_locator';

export interface ConnectorParam {
  name: string;
  type: ConnectorParamType;
  required: boolean;
  validation?: ConnectorValidation;
  default?: string | number | boolean;
  enum?: string[];
  description?: string;
}

export interface ConnectorDef {
  id: string;
  label: string;
  category: string;
  description: string;
  icon: string;
  params: ConnectorParam[];
  endpoints: Record<string, string>;
  supports_test: boolean;
  wizard_steps: string[];
}

export interface ConnectorSample {
  title: string;
  summary: string;
  connector: string;
  config: Record<string, unknown>;
}

interface CatalogShape {
  version: string;
  purpose: string;
  categories: Record<string, string>;
  connectors: ConnectorDef[];
  samples: ConnectorSample[];
}

export const CONNECTOR_CATALOG = catalogRaw as unknown as CatalogShape;

export const CONNECTORS: ConnectorDef[] = CONNECTOR_CATALOG.connectors;
export const CONNECTOR_IDS: string[] = CONNECTORS.map((c) => c.id);
export const CONNECTOR_BY_ID = new Map<string, ConnectorDef>(
  CONNECTORS.map((c) => [c.id, c]),
);
export const CONNECTOR_CATEGORIES: Record<string, string> = CONNECTOR_CATALOG.categories;
export const CONNECTOR_SAMPLES: ConnectorSample[] = CONNECTOR_CATALOG.samples;

/**
 * Build the catalog section injected into the LLM prompt — one terse line
 * per connector so the whole index fits a small token budget:
 *   id (category): description | required: a,b,c | test: ✓/✗
 */
export function buildConnectorPromptSection(): string {
  return CONNECTORS.map((c) => {
    const reqs = c.params.filter((p) => p.required).map((p) => p.name).join(',') || '—';
    return `- ${c.id} (${c.category}): ${c.description} | required: ${reqs} | test: ${c.supports_test ? 'yes' : 'no'}`;
  }).join('\n');
}

// ───────────────────────────────────────────────────────────────────────
// Validation — the "validate every input before commit" gate.
// ───────────────────────────────────────────────────────────────────────

export interface ConnectorValidationResult {
  ok: boolean;
  missing: string[];
  invalid: Array<{ field: string; reason: string }>;
}

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

const HOSTNAME_RE = /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*$/;
// account locator: <locator> or <locator>.<region>[.<cloud>] or org-account
const ACCOUNT_LOCATOR_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

function checkType(param: ConnectorParam, value: unknown): string | null {
  // type-level checks
  if (param.type === 'number') {
    const n = typeof value === 'number' ? value : Number(value);
    if (Number.isNaN(n)) return 'must be a number';
  }
  if (param.type === 'enum' && param.enum && !param.enum.includes(String(value))) {
    return `must be one of: ${param.enum.join(', ')}`;
  }
  if (param.type === 'secret' && typeof value === 'string' && value.trim() === '') {
    return 'secret must not be empty';
  }

  // validation-keyword checks
  switch (param.validation) {
    case 'hostname': {
      const host = String(value).trim();
      if (!HOSTNAME_RE.test(host)) return 'is not a valid hostname';
      break;
    }
    case 'port': {
      const n = typeof value === 'number' ? value : Number(value);
      if (!Number.isInteger(n) || n < 1 || n > 65535) return 'port must be an integer between 1 and 65535';
      break;
    }
    case 'uri': {
      const uri = String(value).trim();
      if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(uri)) return 'must be a valid URI (scheme://...)';
      break;
    }
    case 'account_locator': {
      if (!ACCOUNT_LOCATOR_RE.test(String(value).trim())) return 'is not a valid account locator';
      break;
    }
    case 'non_empty': {
      if (isEmpty(value)) return 'must not be empty';
      break;
    }
    default:
      break;
  }
  return null;
}

/**
 * Validate a connector config against the catalog. Returns the missing
 * required params and the per-type validation failures. ok === true means
 * the config is safe to commit to the backend.
 */
export function validateConnectorConfig(
  id: string,
  config: Record<string, unknown>,
): ConnectorValidationResult {
  const def = CONNECTOR_BY_ID.get(id);
  if (!def) {
    return { ok: false, missing: [], invalid: [{ field: id, reason: `Unknown connector "${id}"` }] };
  }
  const missing: string[] = [];
  const invalid: Array<{ field: string; reason: string }> = [];

  for (const param of def.params) {
    const value = config[param.name];
    const empty = isEmpty(value);
    if (param.required && empty) {
      missing.push(param.name);
      continue;
    }
    // Skip type checks for empty optional fields.
    if (empty) continue;
    const reason = checkType(param, value);
    if (reason) invalid.push({ field: param.name, reason });
  }

  return { ok: missing.length === 0 && invalid.length === 0, missing, invalid };
}

// ───────────────────────────────────────────────────────────────────────
// Deterministic text matcher — offline fallback for the AI helper.
// Given a pasted connection string / config blob, guess the connector id
// and extract whatever fields it can. Runs before (and without) the LLM.
// ───────────────────────────────────────────────────────────────────────

export interface ConnectorMatch {
  /** Connector id, or null when nothing matched. */
  id: string | null;
  /** 0..1 — rough confidence in the match. */
  confidence: number;
  /** Fields extracted from the text, keyed by the connector's param names. */
  fields: Record<string, string | number | boolean>;
  /** Short note on what triggered the match (for the UI). */
  reason: string;
}

/** Parse a `key = value` / `key: value` config blob into a flat map. */
function parseKeyValueBlob(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*["']?([A-Za-z0-9_.-]+)["']?\s*[:=]\s*["']?([^"'\n]*?)["']?\s*,?\s*$/);
    if (m) out[m[1].toLowerCase().replace(/[.-]/g, '_')] = m[2].trim();
  }
  return out;
}

function pick(blob: Record<string, string>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    if (blob[k] !== undefined && blob[k] !== '') return blob[k];
  }
  return undefined;
}

/**
 * Heuristic connector detector. Recognises the common connection-string
 * shapes and config-blob key names for each catalog connector.
 */
export function matchConnectorFromText(text: string): ConnectorMatch {
  const t = (text || '').trim();
  if (!t) return { id: null, confidence: 0, fields: {}, reason: 'empty input' };
  const lower = t.toLowerCase();
  const blob = parseKeyValueBlob(t);
  const fields: Record<string, string | number | boolean> = {};

  // --- PostgreSQL: postgres:// or postgresql:// URL ---
  const pgUrl = t.match(/(?:postgres(?:ql)?):\/\/(?:([^:@/]+)(?::([^@/]*))?@)?([^:/?]+)(?::(\d+))?\/?([^?\s]*)/i);
  if (pgUrl || /jdbc:postgresql/i.test(lower)) {
    if (pgUrl) {
      if (pgUrl[1]) fields.user = pgUrl[1];
      if (pgUrl[2]) fields.password = pgUrl[2];
      if (pgUrl[3]) fields.host = pgUrl[3];
      if (pgUrl[4]) fields.port = parseInt(pgUrl[4], 10);
      if (pgUrl[5]) fields.database = pgUrl[5];
    }
    return { id: 'postgres', confidence: 0.95, fields, reason: 'postgres:// connection URL' };
  }

  // --- MySQL: mysql:// or jdbc:mysql ---
  const myUrl = t.match(/mysql:\/\/(?:([^:@/]+)(?::([^@/]*))?@)?([^:/?]+)(?::(\d+))?\/?([^?\s]*)/i);
  const jdbcMy = t.match(/jdbc:mysql:\/\/([^:/?]+)(?::(\d+))?\/?([^?\s]*)/i);
  if (myUrl || jdbcMy) {
    const m = myUrl || jdbcMy;
    if (m) {
      if (myUrl) {
        if (m[1]) fields.user = m[1];
        if (m[2]) fields.password = m[2];
        if (m[3]) fields.host = m[3];
        if (m[4]) fields.port = parseInt(m[4], 10);
        if (m[5]) fields.database = m[5];
      } else {
        if (m[1]) fields.host = m[1];
        if (m[2]) fields.port = parseInt(m[2], 10);
        if (m[3]) fields.database = m[3];
      }
    }
    return { id: 'mysql', confidence: 0.95, fields, reason: 'mysql connection URL' };
  }

  // --- Databricks: workspace host + http_path ---
  if (/azuredatabricks\.net|databricks\.com|cloud\.databricks/i.test(lower) || /\/sql\/1\.0\/warehouses\//i.test(lower)) {
    const host = pick(blob, 'host', 'server_hostname', 'workspace_host')
      || (t.match(/([a-z0-9-]+\.(?:azuredatabricks\.net|cloud\.databricks\.com))/i)?.[1]);
    const httpPath = pick(blob, 'http_path', 'httppath')
      || (t.match(/(\/sql\/1\.0\/warehouses\/[a-z0-9]+)/i)?.[1]);
    const token = pick(blob, 'access_token', 'token', 'pat');
    if (host) fields.host = host;
    if (httpPath) fields.http_path = httpPath;
    if (token) fields.access_token = token;
    return { id: 'databricks', confidence: 0.85, fields, reason: 'Databricks workspace host / HTTP path' };
  }

  // --- Azure Blob: .dfs.core.windows.net or azure:// ---
  if (/\.blob\.core\.windows\.net|\.dfs\.core\.windows\.net|^azure:\/\//i.test(lower)) {
    const url = t.match(/((?:azure:\/\/)?[a-z0-9]+\.(?:blob|dfs)\.core\.windows\.net\/[^\s"']*)/i);
    if (url) fields.storage_url = url[1].startsWith('azure://') ? url[1] : `azure://${url[1]}`;
    const tenant = pick(blob, 'tenant_id', 'tenant', 'tenantid');
    if (tenant) fields.tenant_id = tenant;
    return { id: 'azure', confidence: 0.8, fields, reason: 'Azure Blob storage URL' };
  }

  // --- AWS S3: s3:// or an IAM role ARN ---
  if (/^s3:\/\//i.test(lower) || /arn:aws:iam::\d+:role\//i.test(lower) || /\.s3[.-][a-z0-9-]*\.amazonaws\.com/i.test(lower)) {
    const bucket = t.match(/s3:\/\/([a-z0-9.-]+)/i)?.[1]
      || t.match(/([a-z0-9.-]+)\.s3[.-][a-z0-9-]*\.amazonaws\.com/i)?.[1]
      || pick(blob, 'bucket_name', 'bucket');
    const arn = t.match(/(arn:aws:iam::\d+:role\/[A-Za-z0-9+=,.@_-]+)/i)?.[1] || pick(blob, 'aws_role_arn', 'role_arn');
    if (bucket) fields.bucket_name = bucket;
    if (arn) fields.aws_role_arn = arn;
    return { id: 'aws', confidence: 0.8, fields, reason: 'S3 URL / IAM role ARN' };
  }

  // --- GCS: gs:// ---
  if (/^gs:\/\//i.test(lower) || /storage\.googleapis\.com/i.test(lower)) {
    const bucket = t.match(/gs:\/\/([a-z0-9._-]+)/i)?.[1] || pick(blob, 'bucket_name', 'bucket');
    if (bucket) fields.bucket_name = bucket;
    const prefix = t.match(/gs:\/\/[a-z0-9._-]+\/(.+)/i)?.[1];
    if (prefix) fields.prefix = prefix;
    return { id: 'gcs', confidence: 0.85, fields, reason: 'Google Cloud Storage URL' };
  }

  // --- Iceberg: REST catalog hints ---
  if (/iceberg/i.test(lower) || (/catalog/i.test(lower) && /\/v1\/(?:config|namespaces)/i.test(lower))) {
    const uri = pick(blob, 'uri', 'catalog_uri', 'rest_uri') || t.match(/(https?:\/\/[^\s"']+)/i)?.[1];
    if (uri) fields.uri = uri;
    const wh = pick(blob, 'warehouse');
    if (wh) fields.warehouse = wh;
    return { id: 'iceberg', confidence: 0.7, fields, reason: 'Iceberg REST catalog hints' };
  }

  // --- Oracle: ATP / oracle service-name shapes ---
  if (/oraclecloud\.com|jdbc:oracle|oracle/i.test(lower) || /\(description\s*=/i.test(lower)) {
    const host = pick(blob, 'host', 'hostname')
      || t.match(/(?:host\s*=\s*)([a-z0-9.-]+oraclecloud\.com)/i)?.[1]
      || t.match(/([a-z0-9.-]+\.oraclecloud\.com)/i)?.[1];
    const svc = pick(blob, 'service_name', 'service')
      || t.match(/service_name\s*=\s*([a-z0-9._-]+)/i)?.[1];
    const user = pick(blob, 'username', 'user');
    if (host) fields.host = host;
    if (svc) fields.service_name = svc;
    if (user) fields.username = user;
    return { id: 'oracle', confidence: 0.8, fields, reason: 'Oracle / ATP connection descriptor' };
  }

  // --- Snowflake: account locator ---
  if (/snowflakecomputing\.com|snowflake/i.test(lower)) {
    const acct = pick(blob, 'account', 'datalake_account')
      || t.match(/([a-z0-9-]+)\.snowflakecomputing\.com/i)?.[1];
    const user = pick(blob, 'user', 'username', 'datalake_username');
    const role = pick(blob, 'role', 'datalake_role');
    if (acct) fields.datalake_account = acct;
    if (user) fields.datalake_username = user;
    if (role) fields.datalake_role = role;
    return { id: 'snowflake', confidence: 0.75, fields, reason: 'Snowflake account reference' };
  }

  // --- Generic key:value blob — try to disambiguate by key set ---
  if (Object.keys(blob).length > 0) {
    if (blob.http_path || blob.access_token) {
      return { id: 'databricks', confidence: 0.5, fields: { ...blob }, reason: 'config keys look like Databricks' };
    }
    if (blob.service_name && (blob.host || blob.username)) {
      return { id: 'oracle', confidence: 0.5, fields: { ...blob }, reason: 'config keys look like Oracle' };
    }
    if (blob.host && blob.database && blob.user) {
      const port = blob.port ? parseInt(blob.port, 10) : undefined;
      const id = port === 3306 ? 'mysql' : 'postgres';
      const fb: Record<string, string | number> = { ...blob };
      if (port !== undefined) fb.port = port;
      return { id, confidence: 0.45, fields: fb, reason: 'generic host/database/user config' };
    }
  }

  return { id: null, confidence: 0, fields: {}, reason: 'no connector pattern recognised' };
}

/**
 * Coerce a loose match's `fields` into a config typed per the catalog
 * (numbers parsed, enums lower-cased) so it can be fed straight into a
 * connector form and validateConnectorConfig().
 */
export function coerceMatchToConfig(
  id: string,
  fields: Record<string, unknown>,
): Record<string, unknown> {
  const def = CONNECTOR_BY_ID.get(id);
  if (!def) return { ...fields };
  const out: Record<string, unknown> = {};
  for (const param of def.params) {
    const raw = fields[param.name];
    if (raw === undefined || raw === null || raw === '') {
      if (param.default !== undefined) out[param.name] = param.default;
      continue;
    }
    if (param.type === 'number') {
      const n = typeof raw === 'number' ? raw : Number(raw);
      out[param.name] = Number.isNaN(n) ? raw : n;
    } else if (param.type === 'boolean') {
      out[param.name] = raw === true || raw === 'true';
    } else {
      out[param.name] = raw;
    }
  }
  return out;
}
