'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { Badge, Input, Tooltip } from 'rizzui';
import {
  Shield, Key, Lock, Search, RefreshCw, AlertTriangle, Plus, X, ChevronUp,
  ExternalLink, BookOpen, HelpCircle, Check, ChevronRight, ChevronLeft,
  Copy, Download, Eye, EyeOff, Zap, Globe, Settings,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { useCanPerform } from '@/hooks/useCanPerform';
import {
  listOAuthIntegrations,
  listApiKeys,
  createServiceUser,
  assignRSAKey,
  revokeRSAKey,
  createOAuthIntegration,
  type OAuthIntegration,
  type ApiKeyUser,
} from '@/app/services/governance';

function getApiErrorMessage(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { response?: { data?: { detail?: unknown } }; message?: unknown };
    const detail = e.response?.data?.detail;
    if (typeof detail === 'string' && detail) return detail;
    if (typeof e.message === 'string' && e.message) return e.message;
  }
  return 'Operation failed';
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type TabType = 'integrations' | 'api-keys';
type ProviderType = 'azure' | 'okta' | 'custom' | null;

const TABS: { id: TabType; name: string; icon: typeof Shield; description: string }[] = [
  { id: 'integrations', name: 'Security Integrations', icon: Shield, description: 'OAuth, SAML, SCIM providers' },
  { id: 'api-keys', name: 'API Keys & Service Accounts', icon: Key, description: 'RSA key pair authentication' },
];

// ---------------------------------------------------------------------------
// Skeleton loader
// ---------------------------------------------------------------------------
function SkeletonRows({ cols, rows = 5 }: { cols: number; rows?: number }) {
  return (
    <>
      {Array.from({ length: rows }).map((_, r) => (
        <tr key={r} className="animate-pulse">
          {Array.from({ length: cols }).map((_, c) => (
            <td key={c} className="px-4 py-3">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Sort helper
// ---------------------------------------------------------------------------
type SortDir = 'asc' | 'desc';

function useSortable<T>(data: T[], defaultKey: keyof T) {
  const [sortKey, setSortKey] = useState<keyof T>(defaultKey);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const av = String(a[sortKey] ?? '');
      const bv = String(b[sortKey] ?? '');
      return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
    });
  }, [data, sortKey, sortDir]);

  const toggle = useCallback(
    (key: keyof T) => {
      if (key === sortKey) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key);
        setSortDir('asc');
      }
    },
    [sortKey]
  );

  return { sorted, sortKey, sortDir, toggle };
}

// ---------------------------------------------------------------------------
// Header cell
// ---------------------------------------------------------------------------
function SortHeader<T>({
  label,
  field,
  sortKey,
  sortDir,
  onSort,
}: {
  label: string;
  field: keyof T;
  sortKey: keyof T;
  sortDir: SortDir;
  onSort: (k: keyof T) => void;
}) {
  const active = sortKey === field;
  return (
    <th
      className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-900 dark:hover:text-white transition-colors"
      onClick={() => onSort(field)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && <span>{sortDir === 'asc' ? '\u2191' : '\u2193'}</span>}
      </span>
    </th>
  );
}

// ---------------------------------------------------------------------------
// Enabled / Disabled badge
// ---------------------------------------------------------------------------
function StatusBadge({ value }: { value: string | boolean }) {
  const enabled =
    value === true || String(value).toLowerCase() === 'true' || String(value).toLowerCase() === 'enabled';
  return (
    <Badge
      className={
        enabled
          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
      }
    >
      {enabled ? 'Enabled' : 'Disabled'}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// FieldLabel with tooltip
// ---------------------------------------------------------------------------
function FieldLabel({ label, tooltip, required }: { label: string; tooltip: string; required?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 mb-1">
      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <Tooltip content={tooltip}>
        <span className="cursor-help">
          <HelpCircle className="h-3.5 w-3.5 text-gray-400" />
        </span>
      </Tooltip>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stepper progress bar
// ---------------------------------------------------------------------------
function StepperBar({ steps, current }: { steps: string[]; current: number }) {
  return (
    <div className="flex items-center gap-2 mb-6">
      {steps.map((step, idx) => {
        const isCompleted = idx < current;
        const isCurrent = idx === current;
        return (
          <div key={idx} className="flex items-center gap-2 flex-1">
            <div className="flex items-center gap-2 flex-shrink-0">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
                  isCompleted
                    ? 'bg-green-500 text-white'
                    : isCurrent
                    ? 'bg-indigo-600 text-white ring-2 ring-indigo-300 dark:ring-indigo-800'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                }`}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : idx + 1}
              </div>
              <span
                className={`text-sm font-medium ${
                  isCurrent
                    ? 'text-indigo-700 dark:text-indigo-400'
                    : isCompleted
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-gray-500 dark:text-gray-400'
                }`}
              >
                {step}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div
                className={`flex-1 h-0.5 rounded ${
                  isCompleted ? 'bg-green-400' : 'bg-gray-200 dark:bg-gray-700'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SQL Preview component
// ---------------------------------------------------------------------------
function SqlPreview({ sql, title }: { sql: string; title?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 bg-gray-100 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
          {title || 'Generated SQL'}
        </span>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white rounded transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="p-4 text-sm font-mono text-gray-800 dark:text-gray-200 bg-gray-50 dark:bg-gray-900 overflow-x-auto whitespace-pre-wrap">
        {sql}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Provider Selection Card
// ---------------------------------------------------------------------------
function ProviderCard({
  title,
  description,
  icon,
  color,
  selected,
  onClick,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col items-center gap-3 p-6 rounded-xl border-2 transition-all duration-200 text-center ${
        selected
          ? `border-${color}-500 bg-${color}-50 dark:bg-${color}-900/20 ring-2 ring-${color}-300 dark:ring-${color}-800 shadow-lg`
          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600 hover:shadow-md'
      }`}
    >
      {selected && (
        <div className="absolute top-3 right-3">
          <Check className="w-5 h-5 text-green-500" />
        </div>
      )}
      {icon}
      <div>
        <h4 className="font-semibold text-gray-900 dark:text-white">{title}</h4>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{description}</p>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Integration Wizard
// ---------------------------------------------------------------------------
function IntegrationWizard({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  // Provider selection
  const [provider, setProvider] = useState<ProviderType>(null);
  const [step, setStep] = useState(0);
  const [creating, setCreating] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  // Creating a security integration is a mutating action — gate on
  // gouvernance:create, mirroring the gated revoke sibling (fail-open while the
  // allow-set loads). The Review-SQL step + explicit button serve as the confirm.
  const createPerm = useCanPerform('gouvernance', 'create');
  const canCreate = createPerm.allowed || createPerm.loading;

  // Shared fields
  const [integrationName, setIntegrationName] = useState('');
  const [enabled, setEnabled] = useState(true);

  // Azure fields
  const [azureTenantId, setAzureTenantId] = useState('');
  const [azureClientId, setAzureClientId] = useState('');

  // Okta fields
  const [oktaOrgUrl, setOktaOrgUrl] = useState('');
  const [oktaClientId, setOktaClientId] = useState('');

  // Custom fields
  const [customTokenEndpoint, setCustomTokenEndpoint] = useState('');
  const [customAuthEndpoint, setCustomAuthEndpoint] = useState('');
  const [customClientId, setCustomClientId] = useState('');

  const getSteps = (): string[] => {
    if (!provider) return ['Select Provider'];
    if (provider === 'azure') return ['Configure Azure', 'Review SQL', 'Create & Verify'];
    if (provider === 'okta') return ['Configure Okta', 'Review SQL', 'Create & Verify'];
    return ['Configure Provider', 'Review SQL', 'Create & Verify'];
  };

  const steps = getSteps();

  // Generate SQL for preview
  const generateSql = (): string => {
    const name = integrationName || '<INTEGRATION_NAME>';
    const enabledStr = enabled ? 'TRUE' : 'FALSE';

    if (provider === 'azure') {
      const tenant = azureTenantId || '<TENANT_ID>';
      const clientId = azureClientId || '<CLIENT_ID>';
      return `CREATE OR REPLACE SECURITY INTEGRATION ${name}
    TYPE = EXTERNAL_OAUTH
    ENABLED = ${enabledStr}
    EXTERNAL_OAUTH_TYPE = AZURE
    EXTERNAL_OAUTH_ISSUER = 'https://sts.windows.net/${tenant}/'
    EXTERNAL_OAUTH_JWS_KEYS_URL = 'https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys'
    EXTERNAL_OAUTH_AUDIENCE_LIST = ('${clientId}')
    EXTERNAL_OAUTH_TOKEN_USER_MAPPING_CLAIM = 'upn'
    EXTERNAL_OAUTH_SNOWFLAKE_USER_MAPPING_ATTRIBUTE = 'LOGIN_NAME'
    EXTERNAL_OAUTH_ANY_ROLE_MODE = 'ENABLE';`;
    }

    if (provider === 'okta') {
      const orgUrl = oktaOrgUrl || 'https://your-org.okta.com';
      const clientId = oktaClientId || '<CLIENT_ID>';
      return `CREATE OR REPLACE SECURITY INTEGRATION ${name}
    TYPE = EXTERNAL_OAUTH
    ENABLED = ${enabledStr}
    EXTERNAL_OAUTH_TYPE = OKTA
    EXTERNAL_OAUTH_ISSUER = '${orgUrl}'
    EXTERNAL_OAUTH_JWS_KEYS_URL = '${orgUrl}/v1/keys'
    EXTERNAL_OAUTH_AUDIENCE_LIST = ('${clientId}')
    EXTERNAL_OAUTH_TOKEN_USER_MAPPING_CLAIM = 'sub'
    EXTERNAL_OAUTH_SNOWFLAKE_USER_MAPPING_ATTRIBUTE = 'LOGIN_NAME';`;
    }

    // Custom
    const tokenEp = customTokenEndpoint || '<TOKEN_ENDPOINT>';
    const clientId = customClientId || '<CLIENT_ID>';
    return `CREATE OR REPLACE SECURITY INTEGRATION ${name}
    TYPE = EXTERNAL_OAUTH
    ENABLED = ${enabledStr}
    EXTERNAL_OAUTH_TYPE = CUSTOM
    EXTERNAL_OAUTH_ISSUER = '${tokenEp}'
    EXTERNAL_OAUTH_TOKEN_USER_MAPPING_CLAIM = 'sub'
    EXTERNAL_OAUTH_SNOWFLAKE_USER_MAPPING_ATTRIBUTE = 'LOGIN_NAME'
    EXTERNAL_OAUTH_ANY_ROLE_MODE = 'ENABLE';`;
  };

  const canProceed = (): boolean => {
    if (step === 0) {
      if (provider === 'azure') return !!(integrationName.trim() && azureTenantId.trim() && azureClientId.trim());
      if (provider === 'okta') return !!(integrationName.trim() && oktaOrgUrl.trim() && oktaClientId.trim());
      if (provider === 'custom') return !!(integrationName.trim() && customTokenEndpoint.trim() && customClientId.trim());
      return false;
    }
    return true;
  };

  const handleCreate = async () => {
    setCreating(true);
    setResult(null);
    try {
      if (provider === 'azure') {
        await createOAuthIntegration({
          name: integrationName,
          oauth_provider: 'AZURE',
          oauth_client_id: azureClientId,
          azure_tenant_id: azureTenantId,
          enabled,
        });
      } else if (provider === 'okta') {
        await createOAuthIntegration({
          name: integrationName,
          oauth_provider: 'OKTA',
          oauth_client_id: oktaClientId,
          oauth_token_endpoint: oktaOrgUrl,
          enabled,
        });
      } else {
        await createOAuthIntegration({
          name: integrationName,
          oauth_provider: 'CUSTOM',
          oauth_client_id: customClientId,
          oauth_token_endpoint: customTokenEndpoint,
          oauth_authorization_endpoint: customAuthEndpoint,
          enabled,
        });
      }
      setResult({ success: true, message: `Security integration "${integrationName}" created successfully.` });
      toast.success(`Integration ${integrationName} created`);
      onCreated();
    } catch (err) {
      const msg = getApiErrorMessage(err);
      setResult({ success: false, message: msg });
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  // Provider not yet selected
  if (!provider) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">New Security Integration</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              Select a provider to begin the integration wizard
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ProviderCard
            title="Azure Entra ID"
            description="Connect Azure AD for SSO and OAuth"
            icon={
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg">
                <Shield className="w-7 h-7 text-white" />
              </div>
            }
            color="blue"
            selected={false}
            onClick={() => { setProvider('azure'); setStep(0); }}
          />
          <ProviderCard
            title="Okta"
            description="Connect Okta for SSO and OAuth"
            icon={
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-700 flex items-center justify-center shadow-lg">
                <Globe className="w-7 h-7 text-white" />
              </div>
            }
            color="indigo"
            selected={false}
            onClick={() => { setProvider('okta'); setStep(0); }}
          />
          <ProviderCard
            title="Custom OAuth"
            description="Connect any OAuth 2.0 provider"
            icon={
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-gray-600 to-gray-800 flex items-center justify-center shadow-lg">
                <Settings className="w-7 h-7 text-white" />
              </div>
            }
            color="gray"
            selected={false}
            onClick={() => { setProvider('custom'); setStep(0); }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            provider === 'azure' ? 'bg-blue-100 dark:bg-blue-900/30' :
            provider === 'okta' ? 'bg-indigo-100 dark:bg-indigo-900/30' :
            'bg-gray-200 dark:bg-gray-700'
          }`}>
            {provider === 'azure' ? <Shield className="w-5 h-5 text-blue-600 dark:text-blue-400" /> :
             provider === 'okta' ? <Globe className="w-5 h-5 text-indigo-600 dark:text-indigo-400" /> :
             <Settings className="w-5 h-5 text-gray-600 dark:text-gray-400" />}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {provider === 'azure' ? 'Azure Entra ID Integration' :
               provider === 'okta' ? 'Okta Integration' : 'Custom OAuth Integration'}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400">Step {step + 1} of {steps.length}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Stepper */}
      <StepperBar steps={steps} current={step} />

      {/* Step Content */}
      {step === 0 && provider === 'azure' && (
        <div className="space-y-4">
          {/* Prerequisites */}
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-4">
            <h4 className="font-semibold text-blue-800 dark:text-blue-300 flex items-center gap-2">
              <ExternalLink className="h-4 w-4" /> Prerequisites — Azure Portal
            </h4>
            <ol className="mt-2 text-sm text-blue-700 dark:text-blue-400 space-y-1 list-decimal list-inside">
              <li>Go to Azure Portal &rarr; Azure Active Directory &rarr; App Registrations</li>
              <li>Click &quot;New registration&quot;, name it &quot;Data360 Snowflake SSO&quot;</li>
              <li>Set redirect URI to your Snowflake account URL</li>
              <li>Copy the Application (Client) ID and Directory (Tenant) ID</li>
            </ol>
            <a
              href="https://docs.snowflake.com/en/user-guide/oauth-azure"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              <BookOpen className="h-3 w-3" /> Snowflake Documentation: External OAuth for Azure
            </a>
          </div>

          {/* Fields */}
          <div>
            <FieldLabel label="Integration Name" tooltip="A unique name for this security integration in Snowflake (e.g., AZURE_OAUTH_DATA360)" required />
            <input
              type="text"
              value={integrationName}
              onChange={(e) => setIntegrationName(e.target.value)}
              placeholder="e.g. AZURE_OAUTH_DATA360"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Azure Tenant ID" tooltip="Found in Azure Portal -> Azure Active Directory -> Properties -> Directory (tenant) ID" required />
              <input
                type="text"
                value={azureTenantId}
                onChange={(e) => setAzureTenantId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
            <div>
              <FieldLabel label="Application (Client) ID" tooltip="Found in Azure Portal -> App Registrations -> Your App -> Overview -> Application (client) ID" required />
              <input
                type="text"
                value={azureClientId}
                onChange={(e) => setAzureClientId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-300 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
            <span className="text-sm text-gray-700 dark:text-gray-300">Enable integration immediately</span>
          </div>
        </div>
      )}

      {step === 0 && provider === 'okta' && (
        <div className="space-y-4">
          {/* Prerequisites */}
          <div className="rounded-lg bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-800 p-4">
            <h4 className="font-semibold text-indigo-800 dark:text-indigo-300 flex items-center gap-2">
              <ExternalLink className="h-4 w-4" /> Prerequisites — Okta Admin Console
            </h4>
            <ol className="mt-2 text-sm text-indigo-700 dark:text-indigo-400 space-y-1 list-decimal list-inside">
              <li>Go to Okta Admin Console &rarr; Applications &rarr; Create App Integration</li>
              <li>Select OIDC / OpenID Connect, then Web Application</li>
              <li>Set sign-in redirect URI to your Snowflake account URL</li>
              <li>Copy the Client ID and your Okta org URL</li>
            </ol>
            <a
              href="https://docs.snowflake.com/en/user-guide/oauth-okta"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              <BookOpen className="h-3 w-3" /> Snowflake Documentation: External OAuth for Okta
            </a>
          </div>

          <div>
            <FieldLabel label="Integration Name" tooltip="A unique name for this security integration in Snowflake (e.g., OKTA_OAUTH_DATA360)" required />
            <input
              type="text"
              value={integrationName}
              onChange={(e) => setIntegrationName(e.target.value)}
              placeholder="e.g. OKTA_OAUTH_DATA360"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Okta Org URL" tooltip="Your Okta organization URL (e.g., https://your-company.okta.com). Found in the top-right of your Okta admin console." required />
              <input
                type="text"
                value={oktaOrgUrl}
                onChange={(e) => setOktaOrgUrl(e.target.value)}
                placeholder="https://your-company.okta.com"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <FieldLabel label="Client ID" tooltip="Found in Okta Admin Console -> Applications -> Your App -> General -> Client ID" required />
              <input
                type="text"
                value={oktaClientId}
                onChange={(e) => setOktaClientId(e.target.value)}
                placeholder="0oa1b2c3d4e5f6g7h8i9"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-300 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
            <span className="text-sm text-gray-700 dark:text-gray-300">Enable integration immediately</span>
          </div>
        </div>
      )}

      {step === 0 && provider === 'custom' && (
        <div className="space-y-4">
          {/* Prerequisites */}
          <div className="rounded-lg bg-gray-100 dark:bg-gray-900/50 border border-gray-300 dark:border-gray-700 p-4">
            <h4 className="font-semibold text-gray-800 dark:text-gray-300 flex items-center gap-2">
              <ExternalLink className="h-4 w-4" /> Prerequisites — Custom OAuth 2.0 Provider
            </h4>
            <ol className="mt-2 text-sm text-gray-700 dark:text-gray-400 space-y-1 list-decimal list-inside">
              <li>Register a new OAuth 2.0 application with your identity provider</li>
              <li>Configure the redirect URI to point to your Snowflake account</li>
              <li>Obtain the token endpoint URL, authorization endpoint, and Client ID</li>
              <li>Ensure the provider issues JWTs with a &quot;sub&quot; claim for user mapping</li>
            </ol>
            <a
              href="https://docs.snowflake.com/en/user-guide/oauth-ext-overview"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-xs text-gray-600 dark:text-gray-400 hover:underline"
            >
              <BookOpen className="h-3 w-3" /> Snowflake Documentation: External OAuth Overview
            </a>
          </div>

          <div>
            <FieldLabel label="Integration Name" tooltip="A unique name for this security integration in Snowflake (e.g., CUSTOM_OAUTH_DATA360)" required />
            <input
              type="text"
              value={integrationName}
              onChange={(e) => setIntegrationName(e.target.value)}
              placeholder="e.g. CUSTOM_OAUTH_DATA360"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Token Endpoint URL" tooltip="The OAuth 2.0 token endpoint of your identity provider (e.g., https://idp.example.com/oauth2/token)" required />
              <input
                type="text"
                value={customTokenEndpoint}
                onChange={(e) => setCustomTokenEndpoint(e.target.value)}
                placeholder="https://idp.example.com/oauth2/token"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500"
              />
            </div>
            <div>
              <FieldLabel label="Authorization Endpoint URL" tooltip="The OAuth 2.0 authorization endpoint (optional, for authorization code flow)" />
              <input
                type="text"
                value={customAuthEndpoint}
                onChange={(e) => setCustomAuthEndpoint(e.target.value)}
                placeholder="https://idp.example.com/oauth2/authorize"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500"
              />
            </div>
          </div>

          <div>
            <FieldLabel label="Client ID" tooltip="The OAuth client ID from your identity provider" required />
            <input
              type="text"
              value={customClientId}
              onChange={(e) => setCustomClientId(e.target.value)}
              placeholder="your-client-id"
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-gray-500 font-mono"
            />
          </div>

          <div className="flex items-center gap-3">
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={enabled}
                onChange={(e) => setEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-gray-300 dark:bg-gray-600 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-gray-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-gray-700"></div>
            </label>
            <span className="text-sm text-gray-700 dark:text-gray-300">Enable integration immediately</span>
          </div>
        </div>
      )}

      {/* Step 1: Review SQL */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-4">
            <h4 className="font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-2">
              <Eye className="h-4 w-4" /> Review the SQL that will be executed
            </h4>
            <p className="mt-1 text-sm text-amber-700 dark:text-amber-400">
              This SQL statement will create a security integration in your Snowflake account.
              Verify the configuration values are correct before proceeding.
            </p>
          </div>
          <SqlPreview sql={generateSql()} title="CREATE SECURITY INTEGRATION" />
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span>This will use <code className="bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded font-mono text-xs">CREATE OR REPLACE</code>, which overwrites any existing integration with the same name.</span>
          </div>
        </div>
      )}

      {/* Step 2: Create & Verify */}
      {step === 2 && (
        <div className="space-y-4">
          {!result && (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
                provider === 'azure' ? 'bg-blue-100 dark:bg-blue-900/30' :
                provider === 'okta' ? 'bg-indigo-100 dark:bg-indigo-900/30' :
                'bg-gray-200 dark:bg-gray-700'
              }`}>
                <Zap className={`w-8 h-8 ${
                  provider === 'azure' ? 'text-blue-600 dark:text-blue-400' :
                  provider === 'okta' ? 'text-indigo-600 dark:text-indigo-400' :
                  'text-gray-600 dark:text-gray-400'
                }`} />
              </div>
              <div className="text-center">
                <h4 className="text-lg font-semibold text-gray-900 dark:text-white">Ready to Create</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Click the button below to execute the SQL and create the security integration.
                </p>
              </div>
              <button
                onClick={handleCreate}
                disabled={creating || !canCreate}
                title={!canCreate ? 'You do not have permission to create security integrations.' : undefined}
                className="inline-flex items-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors shadow-lg shadow-green-500/25"
              >
                {creating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Creating Integration...
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Create Security Integration
                  </>
                )}
              </button>
            </div>
          )}

          {result && (
            <div className={`rounded-lg p-6 border ${
              result.success
                ? 'bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800'
                : 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800'
            }`}>
              <div className="flex items-center gap-3 mb-3">
                {result.success ? (
                  <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                    <Check className="w-5 h-5 text-green-600 dark:text-green-400" />
                  </div>
                ) : (
                  <div className="w-10 h-10 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
                  </div>
                )}
                <div>
                  <h4 className={`font-semibold ${result.success ? 'text-green-800 dark:text-green-300' : 'text-red-800 dark:text-red-300'}`}>
                    {result.success ? 'Integration Created Successfully' : 'Creation Failed'}
                  </h4>
                  <p className={`text-sm mt-1 ${result.success ? 'text-green-700 dark:text-green-400' : 'text-red-700 dark:text-red-400'}`}>
                    {result.message}
                  </p>
                </div>
              </div>

              {result.success && (
                <div className="mt-4 space-y-2 text-sm text-green-700 dark:text-green-400">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    <span>Integration <strong>{integrationName}</strong> is now {enabled ? 'active' : 'disabled'}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4" />
                    <span>Provider: <strong>{provider === 'azure' ? 'Azure Entra ID' : provider === 'okta' ? 'Okta' : 'Custom OAuth'}</strong></span>
                  </div>
                </div>
              )}

              {!result.success && (
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => { setResult(null); }}
                    className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={() => setStep(0)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    Back to Configuration
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Navigation buttons */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          onClick={() => {
            if (step === 0) { setProvider(null); }
            else { setStep((s) => s - 1); }
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          {step === 0 ? 'Change Provider' : 'Back'}
        </button>
        <div className="flex items-center gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            Cancel
          </button>
          {step < steps.length - 1 && (
            <button
              onClick={() => setStep((s) => s + 1)}
              disabled={!canProceed()}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {step === steps.length - 1 && result?.success && (
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
            >
              <Check className="w-4 h-4" />
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 1: Security Integrations
// ---------------------------------------------------------------------------
function IntegrationsTab({
  data,
  loading,
  search,
  onRefresh,
}: {
  data: OAuthIntegration[];
  loading: boolean;
  search: string;
  onRefresh: () => void;
}) {
  const [showWizard, setShowWizard] = useState(false);

  const filtered = useMemo(
    () =>
      data.filter(
        (i) =>
          i.name?.toLowerCase().includes(search) ||
          i.type?.toLowerCase().includes(search) ||
          i.category?.toLowerCase().includes(search)
      ),
    [data, search]
  );

  const { sorted, sortKey, sortDir, toggle } = useSortable<OAuthIntegration>(filtered, 'name' as keyof OAuthIntegration);

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          OAuth, SAML, and SCIM security integrations configured in your Snowflake account.
        </p>
        <button
          onClick={() => setShowWizard((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
        >
          {showWizard ? <ChevronUp className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showWizard ? 'Close Wizard' : 'New Integration'}
        </button>
      </div>

      {/* Wizard */}
      {showWizard && (
        <IntegrationWizard
          onClose={() => setShowWizard(false)}
          onCreated={() => {
            onRefresh();
          }}
        />
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="border-b border-gray-200 dark:border-gray-700">
            <tr>
              <SortHeader<OAuthIntegration> label="Name" field={'name' as keyof OAuthIntegration} sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              <SortHeader<OAuthIntegration> label="Type" field={'type' as keyof OAuthIntegration} sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              <SortHeader<OAuthIntegration> label="Category" field={'category' as keyof OAuthIntegration} sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <SortHeader<OAuthIntegration> label="Created" field={'created_on' as keyof OAuthIntegration} sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {loading ? (
              <SkeletonRows cols={5} />
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                  No security integrations found
                </td>
              </tr>
            ) : (
              sorted.map((item, idx) => (
                <tr
                  key={idx}
                  className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                    {item.name}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400">
                      {item.type || 'N/A'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                    {item.category || '-'}
                  </td>
                  <td className="px-4 py-3 text-sm">
                    <StatusBadge value={item.enabled} />
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    {item.created_on ? new Date(item.created_on).toLocaleDateString() : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tab 2: API Keys / Service Accounts
// ---------------------------------------------------------------------------
function ApiKeysTab({
  data,
  loading,
  search,
  onRefresh,
}: {
  data: ApiKeyUser[];
  loading: boolean;
  search: string;
  onRefresh: () => void;
}) {
  // Create service user state
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [newRole, setNewRole] = useState('PUBLIC');
  const [newComment, setNewComment] = useState('');
  const [creating, setCreating] = useState(false);

  // Assign RSA key state
  const [assigningUser, setAssigningUser] = useState<string | null>(null);
  // Mirror the gated revoke sibling: create service user → gouvernance:create,
  // assign RSA key → gouvernance:apply (attach a credential to a user). Fail-open
  // while the allow-set loads. The multi-field forms serve as the confirm step.
  const canRevoke = useCanPerform('gouvernance', 'revoke');
  const createPerm = useCanPerform('gouvernance', 'create');
  const canCreate = createPerm.allowed || createPerm.loading;
  const applyPerm = useCanPerform('gouvernance', 'apply');
  const canApply = applyPerm.allowed || applyPerm.loading;
  const [rsaKey, setRsaKey] = useState('');
  const [assigning, setAssigning] = useState(false);

  // Revoke state
  const [revoking, setRevoking] = useState<string | null>(null);

  // Key generation state
  const [generatingKey, setGeneratingKey] = useState(false);
  const [generatedPublicKey, setGeneratedPublicKey] = useState('');
  const [generatedPrivateKey, setGeneratedPrivateKey] = useState('');
  const [showPrivateKey, setShowPrivateKey] = useState(false);

  const handleCreate = async () => {
    if (!newUsername.trim()) {
      toast.error('Username is required');
      return;
    }
    setCreating(true);
    try {
      await createServiceUser({ username: newUsername.trim(), default_role: newRole, comment: newComment });
      toast.success(`Service user ${newUsername} created`);
      setShowCreate(false);
      setNewUsername('');
      setNewRole('PUBLIC');
      setNewComment('');
      onRefresh();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const handleAssignKey = async () => {
    if (!rsaKey.trim()) {
      toast.error('RSA public key is required');
      return;
    }
    setAssigning(true);
    try {
      await assignRSAKey({ username: assigningUser!, rsa_public_key: rsaKey.trim() });
      toast.success(`RSA key assigned to ${assigningUser}`);
      setAssigningUser(null);
      setRsaKey('');
      setGeneratedPublicKey('');
      setGeneratedPrivateKey('');
      onRefresh();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setAssigning(false);
    }
  };

  const handleRevoke = async (username: string) => {
    if (!window.confirm(`Revoke the RSA key for ${username}? This immediately disables key-pair authentication for that user.`)) return;
    setRevoking(username);
    try {
      await revokeRSAKey(username);
      toast.success(`RSA key revoked for ${username}`);
      onRefresh();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setRevoking(null);
    }
  };

  const arrayBufferToPem = (buffer: ArrayBuffer, type: string): string => {
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    const lines = base64.match(/.{1,64}/g) || [];
    return `-----BEGIN ${type}-----\n${lines.join('\n')}\n-----END ${type}-----`;
  };

  const handleGenerateKeyPair = async () => {
    setGeneratingKey(true);
    try {
      const keyPair = await window.crypto.subtle.generateKey(
        {
          name: 'RSASSA-PKCS1-v1_5',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256',
        },
        true,
        ['sign', 'verify']
      );
      const publicKeyBuffer = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
      const privateKeyBuffer = await window.crypto.subtle.exportKey('pkcs8', keyPair.privateKey);

      const pemPublicKey = arrayBufferToPem(publicKeyBuffer, 'PUBLIC KEY');
      const pemPrivateKey = arrayBufferToPem(privateKeyBuffer, 'PRIVATE KEY');

      setGeneratedPublicKey(pemPublicKey);
      setGeneratedPrivateKey(pemPrivateKey);
      setRsaKey(pemPublicKey);
      toast.success('RSA 2048-bit key pair generated');
    } catch (err) {
      toast.error('Failed to generate key pair. Your browser may not support WebCrypto.');
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleDownloadPrivateKey = () => {
    const blob = new Blob([generatedPrivateKey], { type: 'application/x-pem-file' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${assigningUser || 'service-user'}_rsa_key.p8`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Private key downloaded');
  };

  const filtered = useMemo(
    () =>
      data.filter(
        (k) =>
          k.user_name?.toLowerCase().includes(search) ||
          k.default_role?.toLowerCase().includes(search)
      ),
    [data, search]
  );

  const { sorted, sortKey, sortDir, toggle } = useSortable<ApiKeyUser>(filtered, 'user_name' as keyof ApiKeyUser);

  return (
    <div className="space-y-4">
      {/* Create Service User header + toggle */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          All Snowflake users. Users with RSA keys can authenticate via key-pair (no password required).
        </p>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors"
        >
          {showCreate ? <ChevronUp className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showCreate ? 'Cancel' : 'Create Service User'}
        </button>
      </div>

      {/* Collapsible create form */}
      {showCreate && (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5 space-y-4">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">New Service User</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <FieldLabel label="Username" tooltip="A Snowflake username for the service account (e.g., SVC_ANALYTICS). Will be uppercased." required />
              <input
                type="text"
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                placeholder="e.g. SVC_ANALYTICS"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <FieldLabel label="Default Role" tooltip="The default Snowflake role for this user. Typically a custom role with limited privileges." />
              <input
                type="text"
                value={newRole}
                onChange={(e) => setNewRole(e.target.value)}
                placeholder="PUBLIC"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div>
            <FieldLabel label="Comment" tooltip="Describe the purpose of this service user for audit and documentation." />
            <textarea
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Describe the purpose of this service user..."
              rows={2}
              className="w-full px-3 py-2 text-sm bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setShowCreate(false); setNewUsername(''); setNewRole('PUBLIC'); setNewComment(''); }}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !newUsername.trim() || !canCreate}
              title={!canCreate ? 'You do not have permission to create service users.' : undefined}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              {creating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* Assign RSA Key inline panel */}
      {assigningUser && (
        <div className="bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-200 dark:border-amber-800 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Assign RSA Key to <span className="text-amber-600 dark:text-amber-400">{assigningUser}</span>
            </h3>
            <button
              onClick={() => { setAssigningUser(null); setRsaKey(''); setGeneratedPublicKey(''); setGeneratedPrivateKey(''); }}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Generate Key Pair button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleGenerateKeyPair}
              disabled={generatingKey}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              {generatingKey ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Key className="w-4 h-4" />
                  Generate Key Pair
                </>
              )}
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              RSA 2048-bit key pair generated in your browser (never sent to server)
            </span>
          </div>

          {/* Generated private key download section */}
          {generatedPrivateKey && (
            <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  <span className="text-sm font-semibold text-red-800 dark:text-red-300">
                    Private Key — Download and store securely
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowPrivateKey((v) => !v)}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 rounded transition-colors"
                  >
                    {showPrivateKey ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    {showPrivateKey ? 'Hide' : 'Show'}
                  </button>
                  <button
                    onClick={handleDownloadPrivateKey}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    Download .p8
                  </button>
                </div>
              </div>
              {showPrivateKey && (
                <pre className="text-xs font-mono text-red-800 dark:text-red-300 bg-red-100 dark:bg-red-900/20 rounded p-2 overflow-x-auto whitespace-pre-wrap">
                  {generatedPrivateKey}
                </pre>
              )}
              <p className="text-xs text-red-600 dark:text-red-400">
                This private key will NOT be shown again. Download it now and store it in a secure location (vault, secrets manager).
              </p>
            </div>
          )}

          <div>
            <FieldLabel
              label="RSA Public Key (PEM)"
              tooltip="Paste an RSA public key in PEM format, or use the Generate Key Pair button above. Only the public key is sent to Snowflake."
              required
            />
            <textarea
              value={rsaKey}
              onChange={(e) => setRsaKey(e.target.value)}
              placeholder={"-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"}
              rows={6}
              className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
            />
          </div>

          {!generatedPrivateKey && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Or generate manually with:{' '}
              <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded text-xs font-mono">
                openssl genrsa 2048 | openssl rsa -pubout
              </code>
            </p>
          )}

          <div className="flex justify-end gap-2">
            <button
              onClick={() => { setAssigningUser(null); setRsaKey(''); setGeneratedPublicKey(''); setGeneratedPrivateKey(''); }}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAssignKey}
              disabled={assigning || !rsaKey.trim() || !canApply}
              title={!canApply ? 'You do not have permission to assign RSA keys.' : undefined}
              className="px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors"
            >
              {assigning ? 'Assigning...' : 'Assign Key'}
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="border-b border-gray-200 dark:border-gray-700">
            <tr>
              <SortHeader<ApiKeyUser> label="User Name" field={'user_name' as keyof ApiKeyUser} sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                RSA Key
              </th>
              <SortHeader<ApiKeyUser> label="Last Login" field={'last_success_login' as keyof ApiKeyUser} sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Status
              </th>
              <SortHeader<ApiKeyUser> label="Default Role" field={'default_role' as keyof ApiKeyUser} sortKey={sortKey} sortDir={sortDir} onSort={toggle} />
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 dark:text-gray-400 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {loading ? (
              <SkeletonRows cols={6} />
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">
                  No service accounts found
                </td>
              </tr>
            ) : (
              sorted.map((user, idx) => {
                const disabled = String(user.disabled).toLowerCase() === 'true';
                const hasKey = String(user.has_rsa_public_key).toLowerCase() === 'true';
                return (
                  <tr
                    key={idx}
className="hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                  >
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 dark:text-white">
                      <span className="inline-flex items-center gap-2">
                        <Key className="w-4 h-4 text-amber-500" />
                        {user.user_name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {hasKey ? (
                        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                          <Lock className="w-3 h-3 mr-1 inline" />
                          Has Key
                        </Badge>
                      ) : (
                        <Badge className="bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                          No Key
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                      {user.last_success_login
                        ? new Date(user.last_success_login).toLocaleString()
                        : 'Never'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <Badge
                        className={
                          disabled
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        }
                      >
                        {disabled ? 'Disabled' : 'Active'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {user.default_role || '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex items-center gap-2">
                        {!hasKey && (
                          <button
                            onClick={() => { setAssigningUser(user.user_name); setRsaKey(''); setGeneratedPublicKey(''); setGeneratedPrivateKey(''); }}
                            disabled={assigningUser === user.user_name}
                            className="px-2 py-1 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors disabled:opacity-50"
                          >
                            Assign Key
                          </button>
                        )}
                        {hasKey && (
                          <>
                            <button
                              onClick={() => { setAssigningUser(user.user_name); setRsaKey(''); setGeneratedPublicKey(''); setGeneratedPrivateKey(''); }}
                              disabled={assigningUser === user.user_name}
                              className="px-2 py-1 text-xs font-medium text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-50"
                            >
                              Replace Key
                            </button>
                            <button
                              onClick={() => handleRevoke(user.user_name)}
                              disabled={revoking === user.user_name || (!canRevoke.allowed && !canRevoke.loading)}
                              title={(!canRevoke.allowed && !canRevoke.loading) ? 'You do not have permission to revoke RSA keys.' : undefined}
                              className="px-2 py-1 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors disabled:opacity-50"
                            >
                              {revoking === user.user_name ? 'Revoking...' : 'Revoke Key'}
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documentation Links section
// ---------------------------------------------------------------------------
const SNOWFLAKE_DOCS = [
  { title: 'External OAuth Overview', url: 'https://docs.snowflake.com/en/user-guide/oauth-ext-overview' },
  { title: 'Azure AD OAuth', url: 'https://docs.snowflake.com/en/user-guide/oauth-azure' },
  { title: 'Okta OAuth', url: 'https://docs.snowflake.com/en/user-guide/oauth-okta' },
  { title: 'SAML SSO Setup', url: 'https://docs.snowflake.com/en/user-guide/admin-security-fed-auth-configure-snowflake' },
  { title: 'SCIM Provisioning', url: 'https://docs.snowflake.com/en/user-guide/admin-security-fed-auth-use-scim' },
  { title: 'Key Pair Authentication', url: 'https://docs.snowflake.com/en/user-guide/key-pair-auth' },
  { title: 'Network Policies', url: 'https://docs.snowflake.com/en/user-guide/network-policies' },
];

function DocumentationLinks() {
  return (
    <div className="mt-8 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
      <h3 className="font-semibold text-gray-900 dark:text-white mb-3 flex items-center gap-2">
        <BookOpen className="h-5 w-5" /> Snowflake Documentation
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {SNOWFLAKE_DOCS.map((doc) => (
          <a
            key={doc.url}
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 p-3 text-sm hover:bg-gray-50 dark:hover:bg-gray-800 hover:shadow-sm transition-all"
          >
            <ExternalLink className="h-4 w-4 text-blue-500 flex-shrink-0" />
            <span className="text-gray-700 dark:text-gray-300">{doc.title}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error state
// ---------------------------------------------------------------------------
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <AlertTriangle className="w-8 h-8 text-red-500" />
      <p className="text-gray-600 dark:text-gray-400 text-sm">{message}</p>
      <button
        onClick={onRetry}
        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------
export default function OAuthManagementPage() {
  const [activeTab, setActiveTab] = useState<TabType>('integrations');
  const [search, setSearch] = useState('');

  // Data states
  const [integrations, setIntegrations] = useState<OAuthIntegration[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyUser[]>([]);

  // Loading / error per tab
  const [loading, setLoading] = useState<Record<TabType, boolean>>({
    integrations: true,
    'api-keys': true,
  });
  const [errors, setErrors] = useState<Record<TabType, string | null>>({
    integrations: null,
    'api-keys': null,
  });

  const fetchIntegrations = useCallback(async () => {
    setLoading((l) => ({ ...l, integrations: true }));
    setErrors((e) => ({ ...e, integrations: null }));
    try {
      const res = await listOAuthIntegrations();
      setIntegrations(res.integrations ?? []);
    } catch (err: any) {
      setErrors((e) => ({ ...e, integrations: err?.message ?? 'Failed to load integrations' }));
    } finally {
      setLoading((l) => ({ ...l, integrations: false }));
    }
  }, []);

  const fetchApiKeys = useCallback(async () => {
    setLoading((l) => ({ ...l, 'api-keys': true }));
    setErrors((e) => ({ ...e, 'api-keys': null }));
    try {
      const res = await listApiKeys();
      setApiKeys(res.api_keys ?? []);
    } catch (err: any) {
      setErrors((e) => ({ ...e, 'api-keys': err?.message ?? 'Failed to load API keys' }));
    } finally {
      setLoading((l) => ({ ...l, 'api-keys': false }));
    }
  }, []);

  // Fetch all on mount
  useEffect(() => {
    fetchIntegrations();
    fetchApiKeys();
  }, [fetchIntegrations, fetchApiKeys]);

  const handleRefresh = useCallback(() => {
    if (activeTab === 'integrations') fetchIntegrations();
    else fetchApiKeys();
  }, [activeTab, fetchIntegrations, fetchApiKeys]);

  const lowerSearch = search.toLowerCase();

  // KPI counts
  const counts: Record<TabType, number> = {
    integrations: integrations.length,
    'api-keys': apiKeys.length,
  };

  return (
    <ErrorBoundary>
      <div className="space-y-8">
        {/* Breadcrumb */}
        <nav className="mb-2">
          <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
            <Link href="/" className="hover:text-gray-900 dark:hover:text-gray-200 cursor-pointer transition-colors">
              Home
            </Link>
            <span>/</span>
            <Link href="/governance" className="hover:text-gray-900 dark:hover:text-gray-200 cursor-pointer transition-colors">
              Governance
            </Link>
            <span>/</span>
            <span className="text-gray-900 dark:text-gray-200 font-medium">OAuth & Auth</span>
          </div>
        </nav>

        {/* Gradient Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-xl shadow-indigo-500/25">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 bg-clip-text text-transparent">
                OAuth & External Auth
              </h1>
              <p className="text-gray-600 dark:text-gray-400 text-lg">
                Manage security integrations, network policies, and service account API keys
              </p>
            </div>
          </div>

          {/* KPI badges */}
          <div className="flex items-center gap-3">
            <Badge className="bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400 px-3 py-1 text-sm font-medium">
              {counts.integrations} Integrations
            </Badge>
            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 px-3 py-1 text-sm font-medium">
              {counts['api-keys']} API Keys
            </Badge>
          </div>
        </div>

        {/* Main card */}
        <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-200/60 dark:border-gray-700/60 shadow-xl p-6">
          {/* Tab bar + search */}
          <div className="flex items-center justify-between mb-6 border-b border-gray-200 dark:border-gray-700 pb-4">
            <div className="flex gap-2">
              {TABS.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium rounded-lg transition-all duration-200 ${
                      isActive
                        ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-50 dark:hover:bg-gray-800'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <div className="text-left">
                      <div>{tab.name}</div>
                      <div className="text-xs opacity-70">{tab.description}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Search..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Tooltip content="Refresh current tab">
                <button
                  onClick={handleRefresh}
                  className="p-2 rounded-lg text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Tab content */}
          {activeTab === 'integrations' && (
            errors.integrations ? (
              <ErrorState message={errors.integrations} onRetry={fetchIntegrations} />
            ) : (
              <IntegrationsTab data={integrations} loading={loading.integrations} search={lowerSearch} onRefresh={fetchIntegrations} />
            )
          )}
          {activeTab === 'api-keys' && (
            errors['api-keys'] ? (
              <ErrorState message={errors['api-keys']} onRetry={fetchApiKeys} />
            ) : (
              <ApiKeysTab data={apiKeys} loading={loading['api-keys']} search={lowerSearch} onRefresh={fetchApiKeys} />
            )
          )}
        </div>

        {/* Documentation Links */}
        <DocumentationLinks />
      </div>
    </ErrorBoundary>
  );
}
