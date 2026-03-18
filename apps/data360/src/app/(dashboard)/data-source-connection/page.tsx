'use client';

import { useState, FormEvent, ChangeEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/hooks/useAuth';
import { Input, Button, Checkbox, Text, Password, Badge, Tooltip, Loader } from 'rizzui';
import Image from 'next/image';
import toast from 'react-hot-toast';
import {
  HiOutlineCloudArrowUp,
  HiOutlineShieldCheck,
  HiOutlineCheckCircle,
  HiOutlineExclamationCircle
} from 'react-icons/hi2';
import { Database, ArrowLeft, Zap, FolderOpen, Search, AlertTriangle, CheckCircle, XCircle, Clock, Plus, Share2, BarChart3 } from 'lucide-react';
import SourceCatalog from './SourceCatalog';
import { ROLE_PERMISSIONS } from '@/config/constants';
import { routes } from '@/config/routes';
import { PipesTab, StreamsTab, DynamicTablesTab, ExternalTablesTab } from './InfrastructureTabs';
import AutomationTab from './AutomationTab';
import ProvisioningTab from './ProvisioningTab';
import DatabricksProvisionTab from './DatabricksProvisionTab';

// Import the new connection services from the same folder
import {
    setupAzureStorageIntegration,
    setupAzureNotificationIntegration,
    createAzureStage,
    setupAwsStorageIntegration,
    createAwsStage,
    patchStorageIntegration,
    type AwsStorageIntegrationResponse,
    setupGcsStorageIntegration,
    createGcsStage,
    setupGcsNotificationIntegration,
    type GcsStorageIntegrationResponse,
    connectSnowflakeDatalake,
    listSnowflakeStages,
    listSnowflakeStageFiles,
    getIntegrationDetails,
    postgresTest,
    mysqlTest,
    oracleTest,
    postgresIngest,
    mysqlIngest,
    ingestFromConnector,
    salesforceIngest,
    sapIngest,
    oracleIngest,
    hubspotIngest,
    servicenowIngest,
    customApiIngest,
    databricksTest,
    databricksCatalogs,
    databricksSchemas,
    databricksTables,
    databricksIngest,
    icebergTest,
    icebergNamespaces,
    icebergTables,
    icebergIngest,
    listRegisteredConnectors,
    testConnector,
    getExpiringCredentials,
    RegisteredConnector,
    ExpiringCredential,
    TestConnectionResult,
    setupGcsStorageIntegration,
    createGcsStage,
    createFileFormat,
    listFileFormats,
    createExternalTable,
    createStream,
    createDynamicTable,
    createTask,
    resumeTask,
    suspendTask,
} from './connectionServices';
import { silentReauth } from '@/app/services/auth/silentReauth';

// Assuming submitS3Form is also in the data-source-connection services folder
import { submitS3Form } from '@/app/services/data-source-connection/s3Servicer';

// Import Label from the correct local path
import { Label } from '@/components/ui/label';
import DatalakeBrowser from './DatalakeBrowser';

// Modern breadcrumb component – Home links to dashboard
function Breadcrumb({ onHomeClick }: { onHomeClick?: () => void }) {
  return (
    <nav className="mb-8" aria-label="Breadcrumb">
      <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
        {onHomeClick ? (
          <button type="button" onClick={onHomeClick} className="cursor-pointer transition-colors hover:text-slate-900 dark:hover:text-slate-200 focus:outline-none focus:underline">
            Home
          </button>
        ) : (
          <span>Home</span>
        )}
        <span>/</span>
        <span>Integration</span>
        <span>/</span>
        <span className="font-medium text-slate-900 dark:text-slate-200">
          Data Source Connection
        </span>
      </div>
    </nav>
  );
}

// Safe error message extraction — handles string, object {error_code, message}, or nested objects
function extractErrorMsg(error: any): string {
  const detail = error?.response?.data?.detail;
  if (detail) {
    if (typeof detail === 'string') return detail;
    if (typeof detail === 'object') return detail.message || detail.error_code || JSON.stringify(detail);
  }
  if (typeof error?.message === 'string') return error.message;
  return 'An unexpected error occurred.';
}

// Modern data source card
function DataSourceCard({
  name,
  icon,
  description,
  isSelected,
  onClick,
  comingSoon,
}: {
  name: string;
  icon: string;
  description: string;
  isSelected: boolean;
  onClick: () => void;
  comingSoon?: boolean;
}) {
  return (
    <div
      onClick={onClick}
      className={`group relative rounded-2xl border-2 p-8 transition-all duration-300 ${
        comingSoon
          ? 'cursor-pointer border-slate-200 bg-slate-50/80 opacity-75 dark:border-slate-700 dark:bg-slate-800/30'
          : 'cursor-pointer hover:scale-105 ' + (isSelected
            ? 'border-blue-500 bg-blue-50/50 shadow-lg shadow-blue-500/20 dark:bg-blue-950/20'
            : 'border-slate-200 bg-white/50 hover:border-slate-300 hover:shadow-lg dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600')
      }`}
    >
      {comingSoon && (
        <div className="absolute right-4 top-4">
          <Badge size="sm" className="bg-amber-500/90 text-white">Coming soon</Badge>
        </div>
      )}
      {/* Background pattern */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-transparent via-white/10 to-white/20 dark:from-transparent dark:via-slate-800/10 dark:to-slate-900/20" />

      <div className="relative z-10 text-center">
        <div className="mb-6 flex justify-center">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-xl transition-all duration-300 ${
              comingSoon ? 'bg-slate-200 dark:bg-slate-600' : isSelected
                ? 'bg-blue-100 dark:bg-blue-900/30'
                : 'bg-slate-100 group-hover:bg-slate-200 dark:bg-slate-700 dark:group-hover:bg-slate-600'
            }`}
          >
            <Image
              src={icon}
              alt={name}
              width={40}
              height={40}
              className="transition-transform duration-300 group-hover:scale-110"
              unoptimized={icon.endsWith('.svg')}
            />
          </div>
        </div>

        <h3 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">
          {name}
        </h3>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          {description}
        </p>

        {isSelected && (
          <div className="absolute -right-3 -top-3 flex h-8 w-8 items-center justify-center rounded-full bg-blue-500">
            <HiOutlineCheckCircle className="h-5 w-5 text-white" />
          </div>
        )}
      </div>
    </div>
  );
}

// Step indicator component
function StepIndicator({
  currentStep,
  totalSteps,
}: {
  currentStep: number;
  totalSteps: number;
}) {
  return (
    <div className="mb-8 flex items-center justify-center space-x-4">
      {Array.from({ length: totalSteps }, (_, i) => (
        <div key={i} className="flex items-center">
          <div
            className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-all duration-300 ${
              i < currentStep
                ? 'bg-blue-500 text-white'
                : i === currentStep
                  ? 'bg-blue-100 text-blue-600 ring-4 ring-blue-500/20 dark:bg-blue-900/30 dark:text-blue-400'
                  : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
            }`}
          >
            {i < currentStep ? (
              <HiOutlineCheckCircle className="h-4 w-4" />
            ) : (
              i + 1
            )}
          </div>
          {i < totalSteps - 1 && (
            <div
              className={`h-0.5 w-16 transition-all duration-300 ${
                i < currentStep
                  ? 'bg-blue-500'
                  : 'bg-slate-200 dark:bg-slate-700'
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// Define specific form data types for each provider's steps
type AzureFormData = {
    storage_integration_name: string;
    notification_integration_name: string;
    tenant_id: string;
    storage_url: string;
    queue_url: string;
    stage_name: string;
    load_data: boolean; // Will be set to true internally
    auto_update: boolean;
};

type AwsFormData = {
    integration_name: string;
    bucket_name: string;
    aws_role_arn: string;
    stage_name: string;
    load_data: boolean;
    auto_update: boolean;
};

type GcsFormData = {
    integration_name: string;
    bucket_name: string;
    stage_name: string;
    prefix: string;
    load_data: boolean;
    auto_update: boolean;
    notification_integration_name: string;
    gcp_pubsub_subscription_name: string;
};

type SnowflakeFormData = {
    datalake_username: string;
    datalake_password: string;
    datalake_account: string;
    datalake_role: string;
};

type StageConnection = {
    id: string;
    provider: 'snowflake' | 'azure' | 'aws' | 'gcp' | 'databricks' | 'iceberg' | 'postgres' | 'mysql' | 'salesforce' | 'sap' | 'oracle' | 'hubspot' | 'servicenow' | 'custom_api';
    name: string;
    schema_name?: string;
    database_name?: string;
};

export default function DataSourceConnectionPage() {
  const router = useRouter();
  const { username, isAuthenticated, role } = useAuth();
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [showDatalakeBrowser, setShowDatalakeBrowser] = useState<boolean>(false);
  const [connectedProvider, setConnectedProvider] = useState<'snowflake' | 'azure' | 'aws' | 'gcs' | 'databricks' | 'iceberg' | 'postgres' | 'mysql' | null>(null);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [activeConnections, setActiveConnections] = useState<StageConnection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState<boolean>(false);
  const [connectPageTab, setConnectPageTab] = useState<'connect' | 'connectors' | 'explorer' | 'automation' | 'provisioning'>('connectors');
  const [connectedProvider, setConnectedProvider] = useState<'snowflake' | 'azure' | 'aws' | 'gcp' | 'databricks' | 'iceberg' | 'postgres' | 'mysql' | 'salesforce' | 'sap' | 'oracle' | 'hubspot' | 'servicenow' | 'custom_api' | null>(null);
  const [activeConnections, setActiveConnections] = useState<DatalakeConnection[]>([]);
  const [errorMessages, setErrorMessages] = useState<string[]>([]); // État persistant pour les erreurs
  const [showAddConnection, setShowAddConnection] = useState<boolean>(false); // Contrôle affichage section Add Connection
  const [registeredConnectors, setRegisteredConnectors] = useState<RegisteredConnector[]>([]);
  const [expiringCredentials, setExpiringCredentials] = useState<ExpiringCredential[]>([]);
  const [testingConnector, setTestingConnector] = useState<string | null>(null);

  const [azureFormData, setAzureFormData] = useState<AzureFormData>({
      storage_integration_name: '',
      notification_integration_name: '',
      tenant_id: '',
      storage_url: '',
      queue_url: '',
      stage_name: '',
      load_data: true, // Default load_data to true
      auto_update: false,
  });

  const [awsFormData, setAwsFormData] = useState<AwsFormData>({
      integration_name: '',
      bucket_name: '',
      aws_role_arn: '',
      stage_name: '',
      load_data: false,
      auto_update: false,
  });

  const [gcsFormData, setGcsFormData] = useState<GcsFormData>({
      integration_name: '',
      bucket_name: '',
      stage_name: '',
      prefix: '',
      load_data: false,
      auto_update: false,
      notification_integration_name: '',
      gcp_pubsub_subscription_name: '',
  });

  const [snowflakeFormData, setSnowflakeFormData] = useState<SnowflakeFormData>({
      datalake_username: '',
      datalake_password: '',
      datalake_account: '',
      datalake_role: '',
  });

  const logos: Record<string, string> = {
      s3: '/data-sources/aws-s3.png',
      snowflake: '/data-sources/snowflake-logo.png',
      azure: '/data-sources/azure-logo.png',
      aws: '/data-sources/aws-s3.png',
      gcs: '/data-sources/gcs-logo.svg',
      databricks: '/data-sources/databricks-logo.svg',
      iceberg: '/data-sources/iceberg-logo.svg',
      postgres: '/data-sources/postgres-logo.svg',
      mysql: '/data-sources/mysql-logo.svg',
      salesforce: '/data-sources/salesforce-logo.svg',
      sap: '/data-sources/sap-logo.svg',
      oracle: '/data-sources/oracle-logo.svg',
      hubspot: '/data-sources/hubspot-logo.svg',
      servicenow: '/data-sources/servicenow-logo.svg',
      custom_api: '/data-sources/api-logo.svg',
      gcp: '/data-sources/gcp-logo.svg',
  };

  type DataSourceDef = { id: string; name: string; icon: string; description: string; direction: 'inbound' | 'outbound'; category: string; comingSoon?: boolean };

  const dataSourceGroups: { label: string; direction: 'inbound' | 'outbound'; sources: DataSourceDef[] }[] = [
    {
      label: 'Cloud Storage',
      direction: 'inbound',
      sources: [
        { id: 'aws', name: 'Amazon S3', icon: '/data-sources/aws-s3.png', description: 'Scalable cloud object storage', direction: 'inbound', category: 'Cloud Storage' },
        { id: 'azure', name: 'Azure Blob Storage', icon: '/data-sources/azure-logo.png', description: 'Microsoft cloud storage for big data', direction: 'inbound', category: 'Cloud Storage' },
        { id: 'gcp', name: 'Google Cloud Storage', icon: '/data-sources/gcp-logo.svg', description: 'Google Cloud object storage for analytics', direction: 'inbound', category: 'Cloud Storage' },
      ],
    },
    {
      label: 'Data Platforms',
      direction: 'inbound',
      sources: [
        { id: 'databricks', name: 'Databricks', icon: '/data-sources/databricks-logo.svg', description: 'Unified analytics and lakehouse platform', direction: 'inbound', category: 'Data Platform' },
        { id: 'iceberg', name: 'Apache Iceberg', icon: '/data-sources/iceberg-logo.svg', description: 'Open table format for large analytic datasets', direction: 'inbound', category: 'Data Platform' },
      ],
    },
    {
      label: 'Databases',
      direction: 'inbound',
      sources: [
        { id: 'postgres', name: 'PostgreSQL', icon: '/data-sources/postgres-logo.svg', description: 'Open-source relational database', direction: 'inbound', category: 'Database' },
        { id: 'mysql', name: 'MySQL', icon: '/data-sources/mysql-logo.svg', description: 'Popular open-source relational database', direction: 'inbound', category: 'Database' },
        { id: 'oracle', name: 'Oracle Database', icon: '/data-sources/oracle-logo.svg', description: 'Enterprise relational database system', direction: 'inbound', category: 'Database' },
      ],
    },
    {
      id: 'gcs',
      name: 'Google Cloud Storage',
      icon: '/data-sources/gcs-logo.svg',
      description: 'Google Cloud Storage for scalable object storage on GCP',
    },
    {
      id: 'databricks',
      name: 'Databricks',
      icon: '/data-sources/databricks-logo.svg',
      description: 'Unified analytics and lakehouse platform',
      label: 'SaaS / CRM / ERP',
      direction: 'inbound',
      sources: [
        { id: 'salesforce', name: 'Salesforce', icon: '/data-sources/salesforce-logo.svg', description: 'CRM platform for sales and service data', direction: 'inbound', category: 'SaaS' },
        { id: 'hubspot', name: 'HubSpot', icon: '/data-sources/hubspot-logo.svg', description: 'Marketing, sales, and CRM platform', direction: 'inbound', category: 'SaaS' },
        { id: 'servicenow', name: 'ServiceNow', icon: '/data-sources/servicenow-logo.svg', description: 'IT service management and workflows', direction: 'inbound', category: 'SaaS' },
        { id: 'sap', name: 'SAP', icon: '/data-sources/sap-logo.svg', description: 'Enterprise resource planning system', direction: 'inbound', category: 'ERP' },
        { id: 'custom_api', name: 'Custom REST API', icon: '/data-sources/api-logo.svg', description: 'Connect any REST API with authentication', direction: 'inbound', category: 'API' },
      ],
    },
    {
      label: 'Data Sharing',
      direction: 'outbound',
      sources: [
        { id: 'snowflake', name: 'Snowflake Shares', icon: '/data-sources/snowflake-logo.png', description: 'Share data with other Snowflake accounts', direction: 'outbound', category: 'Share' },
      ],
    },
  ];

  const dataSources = dataSourceGroups.flatMap(g => g.sources);

  // Check user permissions
  const userRole = (role?.toUpperCase() || 'ACCOUNTADMIN') as keyof typeof ROLE_PERMISSIONS;
  const canManageConnections = ROLE_PERMISSIONS[userRole]?.modules?.includes(1) ?? true;

  // Synchronous token check — reads localStorage on first render before useEffect fires.
  // This prevents a false redirect while useAuth() is still reading the token asynchronously.
  const hasToken =
    typeof window !== 'undefined' &&
    !!(localStorage.getItem('access_token') || localStorage.getItem('snowflake_token'));

  // Redirect if no permission (skip on initial render — useAuth needs a tick to read localStorage)
  const [authChecked, setAuthChecked] = useState(false);
  useEffect(() => { setAuthChecked(true); }, [isAuthenticated]);
  useEffect(() => {
    if (!authChecked) return;
    // Use both reactive isAuthenticated (post-effect) and synchronous hasToken as fallback
    if (!isAuthenticated && !hasToken) {
      router.push(routes.signIn);
      return;
    }
    if (!canManageConnections) {
      toast.error('You do not have permission to manage data source connections');
      router.push('/access-denied');
    }
  }, [authChecked, isAuthenticated, hasToken, canManageConnections, router]);

  // Load stages from backend API
  const loadConnections = async () => {
    setConnectionsLoading(true);
    try {
      const response = await listSnowflakeStages();
      const stages: any[] = Array.isArray(response?.stages) ? response.stages : [];
      const connections: StageConnection[] = stages
        .filter((s: any) => !s.error)
        .map((s: any) => ({
          id: s.name ?? s.stage_name ?? String(s),
          name: s.name ?? s.stage_name ?? String(s),
          schema_name: s.schema_name,
          database_name: s.database_name,
        }));
      setActiveConnections(connections);
    } catch (err) {
      console.error('Failed to load stages', err);
      setActiveConnections([]);
    } finally {
      setConnectionsLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'authenticated' && canManageConnections) {
      loadConnections();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, canManageConnections]);

  const browseConnection = (connection: StageConnection) => {
    // All stages are Snowflake stages (external or internal)
    setConnectedProvider('snowflake');
    setActiveConnectionId(connection.id);
  useEffect(() => {
    async function loadRegisteredConnectors() {
      try {
        const connectors = await listRegisteredConnectors();
        setRegisteredConnectors(connectors);
        const expiring = await getExpiringCredentials(7);
        setExpiringCredentials(expiring);
      } catch (err) {
        console.warn('Failed to load registered connectors:', err);
      }
    }
    loadRegisteredConnectors();
  }, []);

  const saveConnection = async (connection: DatalakeConnection) => {
    const updated = [...activeConnections, connection];
    setActiveConnections(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('datalake_connections', JSON.stringify(updated));
    }
    // Refresh registered connectors from metadata
    try {
      const refreshed = await listRegisteredConnectors();
      setRegisteredConnectors(refreshed);
    } catch {}
  };

  const removeConnection = (connectionId: string) => {
    const updated = activeConnections.filter(c => c.id !== connectionId);
    setActiveConnections(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('datalake_connections', JSON.stringify(updated));
    }
  };

  const browseConnection = (connection: DatalakeConnection) => {
    setConnectedProvider(connection.provider);
    setShowDatalakeBrowser(true);
    setCurrentStep(0);
  };

  const handleSourceSelect = (sourceId: string) => {
    setSelectedSource(sourceId);
    setCurrentStep(1);
  };

  const handleBackToProviderSelection = () => {
      setSelectedSource('');
      setCurrentStep(0);
      setShowDatalakeBrowser(false);
      setConnectedProvider(null);
      setActiveConnectionId(null);
      // Reset specific form data when going back to selection
      setAzureFormData({
          storage_integration_name: '', notification_integration_name: '', tenant_id: '', storage_url: '', queue_url: '',
          stage_name: '', load_data: true, auto_update: false // Reset load_data to true
      });
      setAwsFormData({
          integration_name: '', bucket_name: '', aws_role_arn: '',
          stage_name: '', load_data: false, auto_update: false
      });
      setGcsFormData({
          integration_name: '', bucket_name: '', stage_name: '', prefix: '',
          load_data: false, auto_update: false,
          notification_integration_name: '', gcp_pubsub_subscription_name: ''
      });
      setAwsCurrentSubStep(1);
      setAwsIntegrationCreated(false);
      setAwsIamUserArn(null);
      setAwsExternalId(null);
      setGcsCurrentSubStep(1);
      setGcsIntegrationCreated(false);
      setGcsServiceAccount(null);
      setGcsNotificationCreated(false);
      setGcsPubsubServiceAccount(null);
      setSnowflakeFormData({
          datalake_username: '', datalake_password: '', datalake_account: '', datalake_role: ''
      });
      setGcsFormData({ integration_name: '', bucket_name: '', stage_name: '', prefix: '', load_data: false, auto_update: false });
      setGcsCurrentSubStep(1);
      setGcsIntegrationCreated(false);
      setGcsServiceAccount(null);
      setDatabricksFormData({ host: '', http_path: '', access_token: '', catalog: '', schema_name: '', tables: [] });
      setDatabricksStep('connect');
      setIcebergFormData({ uri: '', warehouse: '', credential: '', namespace: '', tables: [] });
      setIcebergStep('connect');
      setPostgresFormData({ host: '', port: 5432, database: '', user: '', password: '' });
      setMySQLFormData({ host: '', port: 3306, database: '', user: '', password: '', ssl: false });
      setDbTestResult(null);
      setDbTestStep('form');
  };

  const handleTestConnection = async (connectorId: string) => {
    setTestingConnector(connectorId);
    try {
      const result = await testConnector(connectorId);
      if (result.ok) {
        toast.success(`Connection test passed (${result.latency_ms}ms)`);
      } else {
        toast.error(`Connection test failed: ${result.message}`);
      }
    } catch (err: any) {
      toast.error(`Test failed: ${extractErrorMsg(err)}`);
    } finally {
      setTestingConnector(null);
    }
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>, provider: 'azure' | 'aws' | 'gcs' | 'snowflake') => {
      const { name, value, type } = e.target;
      const target = e.target as HTMLInputElement;

      if (provider === 'azure') {
          setAzureFormData(prev => ({
              ...prev,
              [name]: type === 'checkbox' ? target.checked : value,
          }));
      } else if (provider === 'aws') {
          setAwsFormData(prev => ({
              ...prev,
              [name]: type === 'checkbox' ? target.checked : value,
          }));
      } else if (provider === 'gcs') {
          setGcsFormData(prev => ({
              ...prev,
              [name]: type === 'checkbox' ? target.checked : value,
          }));
      } else if (provider === 'snowflake') {
          setSnowflakeFormData(prev => ({
              ...prev,
              [name]: value,
          }));
      }
  };

  // --- Azure Connection Steps ---
  const [azureCurrentSubStep, setAzureCurrentSubStep] = useState<number>(1);
  const [showAzureNotificationOption, setShowAzureNotificationOption] = useState<boolean>(false);
  const [azureStorageIntegrationCreated, setAzureStorageIntegrationCreated] = useState<boolean>(false);
  const [azureNotificationIntegrationCreated, setAzureNotificationIntegrationCreated] = useState<boolean>(false);
  const [azureNotificationDetailsFetched, setAzureNotificationDetailsFetched] = useState<boolean>(false); // State to track if details are fetched
  const [azureConsentUrl, setAzureConsentUrl] = useState<string | null>(null); // State for consent URL
  const [azureMultiTenantAppName, setAzureMultiTenantAppName] = useState<string | null>(null); // State for app name
  // New state for Storage Integration consent/details step
  const [azureStorageDetailsFetched, setAzureStorageDetailsFetched] = useState<boolean>(false);
  const [azureStorageConsentUrl, setAzureStorageConsentUrl] = useState<string | null>(null);
  const [azureStorageMultiTenantAppName, setAzureStorageMultiTenantAppName] = useState<string | null>(null);

  const handleAzureNextStep = async () => {
      setLoading(true);
      try {
          if (azureCurrentSubStep === 3 && !showAzureNotificationOption) {
              // Skip notification, go directly to stage creation
              setAzureCurrentSubStep(4);
              setLoading(false);
              return;
          }
          setLoading(false);
      } catch (error: any) {
          const errorMsg = extractErrorMsg(error);
          setErrorMessages(prev => [...prev, errorMsg]);
          toast.error(`Failed: ${errorMsg}`);
          console.error('Error:', error);
      } finally {
          setLoading(false);
      }
  };

  const handleAzureSubmit = async (e: FormEvent) => {
      e.preventDefault();
      setLoading(true);
      setErrorMessages([]); // Clear previous errors
      try {
          if (azureCurrentSubStep === 1) { // Step 1: Create Storage Integration
              const createResponse = await setupAzureStorageIntegration(
                  azureFormData.storage_integration_name,
                  azureFormData.tenant_id,
                  azureFormData.storage_url
              );
              setAzureStorageIntegrationCreated(true);
              toast.success('Azure Storage Integration created successfully!');
              setAzureCurrentSubStep(2); // Move to Storage consent/details step (wait for user consent)
              // Use consent URL from create response so user sees it immediately without clicking "Fetch Consent Details"
              if (createResponse.azure_consent_url) {
                  setAzureStorageConsentUrl(createResponse.azure_consent_url);
                  setAzureStorageMultiTenantAppName(createResponse.azure_multi_tenant_app_name ?? null);
                  setAzureStorageDetailsFetched(true);
              }
          } else if (azureCurrentSubStep === 2) { // Step 2: Show consent URL / optional: re-fetch (Verify)
              const response = await getIntegrationDetails(azureFormData.storage_integration_name);
              setAzureStorageConsentUrl(response?.azure_consent_url || null);
              setAzureStorageMultiTenantAppName(response?.azure_multi_tenant_app_name || null);
              setAzureStorageDetailsFetched(true);
              toast.success('Storage integration details fetched successfully!');
          } else if (azureCurrentSubStep === 3) { // Step 3: Handle Notification Option
              if (showAzureNotificationOption) {
                  // If notification option is ON, try to create notification integration
                  await setupAzureNotificationIntegration(
                      azureFormData.notification_integration_name,
                      azureFormData.tenant_id,
                      azureFormData.queue_url
                  );
                  setAzureNotificationIntegrationCreated(true);
                  toast.success('Azure Notification Integration created successfully!');
                  setAzureCurrentSubStep(4); // Move to Notification details
              } else {
                  // If notification option is OFF, just move to next step without API call
                  setAzureCurrentSubStep(4);
              }
          } else if (azureCurrentSubStep === 4) { // Step 4: Get Notification Integration Details (Conditional)
              if (!showAzureNotificationOption) {
                  // If notification is off, step 4 is Create Stage
                  const notificationIntegrationParam = null;

                  await createAzureStage(
                      azureFormData.stage_name,
                      azureFormData.storage_url,
                      azureFormData.storage_integration_name,
                      true, // load_data is always true
                      azureFormData.auto_update,
                      notificationIntegrationParam
                  );
                  toast.success('Azure Stage created successfully!');
                  await loadConnections();
                  try { await silentReauth(); } catch {}
                  setConnectedProvider('snowflake');
                  setShowDatalakeBrowser(true);
                  setCurrentStep(0);
              } else {
              if (!azureNotificationIntegrationCreated) {
                  throw new Error("Notification integration not created, cannot fetch details.");
              }
              const response = await getIntegrationDetails(azureFormData.notification_integration_name);
              console.log('Notification Integration Details:', response);
              // Assuming response.details contains the fields
              setAzureConsentUrl(response?.azure_consent_url || null);
              setAzureMultiTenantAppName(response?.azure_multi_tenant_app_name || null);
              setAzureNotificationDetailsFetched(true);
              toast.success('Notification integration details fetched successfully!');
                  // setAzureCurrentSubStep(5); // Move to Stage creation
              }
          } else if (azureCurrentSubStep === 5) { // Final Step when notification is ON: Create Azure Stage
              const notificationIntegrationParam = (azureFormData.auto_update && showAzureNotificationOption && azureNotificationDetailsFetched)
                  ? azureFormData.notification_integration_name
                  : null;

              await createAzureStage(
                  azureFormData.stage_name,
                  azureFormData.storage_url,
                  azureFormData.storage_integration_name,
                  true, // load_data is always true
                  azureFormData.auto_update,
                  notificationIntegrationParam
              );
              toast.success('Azure Stage created successfully!');

              await loadConnections();
              try { await silentReauth(); } catch {}

              setConnectedProvider('snowflake');
              setShowDatalakeBrowser(true);
              setCurrentStep(0);
          }
      } catch (error: any) {
          const errorMsg = extractErrorMsg(error);
          setErrorMessages(prev => [...prev, errorMsg]);
          toast.error(`Failed: ${errorMsg}`);
          console.error('Error:', error);
      } finally {
          setLoading(false);
      }
  };

  // --- AWS Connection Steps ---
  const [awsCurrentSubStep, setAwsCurrentSubStep] = useState<number>(1);
  const [awsIntegrationCreated, setAwsIntegrationCreated] = useState<boolean>(false);
  const [awsIamUserArn, setAwsIamUserArn] = useState<string | null>(null);
  const [awsExternalId, setAwsExternalId] = useState<string | null>(null);

  // --- GCS Connection Steps ---
  const [gcsCurrentSubStep, setGcsCurrentSubStep] = useState<number>(1);
  const [gcsIntegrationCreated, setGcsIntegrationCreated] = useState<boolean>(false);
  const [gcsServiceAccount, setGcsServiceAccount] = useState<string | null>(null);
  const [gcsNotificationCreated, setGcsNotificationCreated] = useState<boolean>(false);
  const [gcsPubsubServiceAccount, setGcsPubsubServiceAccount] = useState<string | null>(null);

  // --- GCS Connection Steps ---
  const [gcsFormData, setGcsFormData] = useState({
    integration_name: '', bucket_name: '', stage_name: '', prefix: '',
    load_data: false, auto_update: false,
  });
  const [gcsCurrentSubStep, setGcsCurrentSubStep] = useState<number>(1);
  const [gcsIntegrationCreated, setGcsIntegrationCreated] = useState<boolean>(false);
  const [gcsServiceAccount, setGcsServiceAccount] = useState<string | null>(null);

  // --- Snowflake Connection ---
  const [snowflakeConnected, setSnowflakeConnected] = useState<boolean>(false);

  // --- Databricks ---
  const [databricksFormData, setDatabricksFormData] = useState({
    host: '', http_path: '', access_token: '',
    catalog: '', schema_name: '', tables: [] as string[],
  });
  const [databricksCatalogsList, setDatabricksCatalogsList] = useState<string[]>([]);
  const [databricksSchemasList, setDatabricksSchemasList] = useState<string[]>([]);
  const [databricksTablesList, setDatabricksTablesList] = useState<string[]>([]);
  const [databricksStep, setDatabricksStep] = useState<'connect' | 'catalog' | 'schema' | 'tables' | 'ingest'>('connect');

  // --- Iceberg ---
  const [icebergFormData, setIcebergFormData] = useState({
    uri: '', warehouse: '', credential: '',
    namespace: '', tables: [] as string[],
  });
  const [icebergNamespacesList, setIcebergNamespacesList] = useState<string[]>([]);
  const [icebergTablesList, setIcebergTablesList] = useState<string[]>([]);
  const [icebergStep, setIcebergStep] = useState<'connect' | 'namespace' | 'tables' | 'ingest'>('connect');

  // --- PostgreSQL / MySQL ---
  const [postgresFormData, setPostgresFormData] = useState({
    host: '', port: 5432, database: '', user: '', password: '',
  });
  const [mysqlFormData, setMySQLFormData] = useState({
    host: '', port: 3306, database: '', user: '', password: '', ssl: false,
  });
  // --- Database test results (shared for Postgres, MySQL, Oracle) ---
  const [dbTestResult, setDbTestResult] = useState<TestConnectionResult | null>(null);
  const [dbTestStep, setDbTestStep] = useState<'form' | 'tested' | 'ingesting'>('form');

  // --- CRM / ERP / SaaS ---
  const [salesforceFormData, setSalesforceFormData] = useState({
    instance_url: '', client_id: '', client_secret: '', username: '', security_token: '',
  });
  const [sapFormData, setSapFormData] = useState({
    host: '', system_id: '', client: '100', username: '', password: '',
  });
  const [oracleFormData, setOracleFormData] = useState({
    host: '', port: 1521, service_name: '', username: '', password: '',
  });
  const [hubspotFormData, setHubspotFormData] = useState({
    api_key: '',
  });
  const [servicenowFormData, setServicenowFormData] = useState({
    instance_url: '', username: '', password: '',
  });
  const [customApiFormData, setCustomApiFormData] = useState({
    base_url: '', auth_type: 'bearer', auth_token: '', target_table: '',
  });

  const handleAwsSubmit = async (e: FormEvent) => {
      e.preventDefault();
      setLoading(true);
      try {
          if (awsCurrentSubStep === 1) {
              const result = await setupAwsStorageIntegration(
                  awsFormData.integration_name,
                  awsFormData.bucket_name,
                  awsFormData.aws_role_arn,
              );
              setAwsIntegrationCreated(true);
              setAwsIamUserArn(result.STORAGE_AWS_IAM_USER_ARN || null);
              setAwsExternalId(result.STORAGE_AWS_EXTERNAL_ID || null);
              toast.success('AWS Storage Integration created successfully!');
              setAwsCurrentSubStep(2);
          } else if (awsCurrentSubStep === 3) {
              // Patch the integration with the external_id before creating the stage
              if (awsExternalId) {
                  await patchStorageIntegration(awsFormData.integration_name, {
                      storage_aws_external_id: awsExternalId,
                  });
              }
              await createAwsStage(
                  awsFormData.stage_name,
                  awsFormData.bucket_name,
                  awsFormData.integration_name,
                  awsFormData.load_data,
                  awsFormData.auto_update
              );
              toast.success('AWS Stage created successfully!');

              await loadConnections();
              try { await silentReauth(); } catch {}

              setConnectedProvider('snowflake');
              setShowDatalakeBrowser(true);
              setCurrentStep(0);
          }
      } catch (error: any) {
          const errorMsg = error.message || 'An unexpected error occurred.';
          setErrorMessages(prev => [...prev, errorMsg]);
          toast.error(`Failed: ${errorMsg}`);
          console.error('Error:', error);
      } finally {
          setLoading(false);
      }
  };

  const handleGcsSubmit = async (e: FormEvent) => {
      e.preventDefault();
      setLoading(true);
      try {
          if (gcsCurrentSubStep === 1) {
              const result = await setupGcsStorageIntegration(
                  gcsFormData.integration_name,
                  gcsFormData.bucket_name
              );
              setGcsIntegrationCreated(true);
              setGcsServiceAccount(result.STORAGE_GCP_SERVICE_ACCOUNT);
              toast.success('GCS Storage Integration created successfully!');
              setGcsCurrentSubStep(2); // Move to IAM guide step
          } else if (gcsCurrentSubStep === 3) {
              await createGcsStage(
                  gcsFormData.stage_name,
                  gcsFormData.bucket_name,
                  gcsFormData.integration_name,
                  gcsFormData.load_data,
                  gcsFormData.auto_update,
                  gcsFormData.prefix || null
              );
              toast.success('GCS Stage created successfully!');

              // Save connection
              await loadConnections();
              try { await silentReauth(); } catch {}

              setConnectedProvider('snowflake');
              setShowDatalakeBrowser(true);
              setCurrentStep(0);
          }
      } catch (error: any) {
          const errorMsg = extractErrorMsg(error);
          setErrorMessages(prev => [...prev, errorMsg]);
          toast.error(`Failed: ${errorMsg}`);
          console.error('Error:', error);
      } finally {
          setLoading(false);
      }
  };

  const handleGcpSubmit = async (e: FormEvent) => {
      e.preventDefault();
      setLoading(true);
      try {
          if (gcsCurrentSubStep === 1) {
              const result = await setupGcsStorageIntegration({
                  integration_name: gcsFormData.integration_name,
                  bucket_name: gcsFormData.bucket_name,
              });
              setGcsIntegrationCreated(true);
              setGcsServiceAccount(result.STORAGE_GCS_SERVICE_ACCOUNT || null);
              toast.success('GCS Storage Integration created successfully!');
              setGcsCurrentSubStep(2);
          } else if (gcsCurrentSubStep === 2) {
              // IAM binding info step — just advance
              setGcsCurrentSubStep(3);
          } else if (gcsCurrentSubStep === 3) {
              await createGcsStage({
                  stage_name: gcsFormData.stage_name,
                  bucket_name: gcsFormData.bucket_name,
                  integration_name: gcsFormData.integration_name,
                  prefix: gcsFormData.prefix || undefined,
                  load_data: gcsFormData.load_data,
                  auto_update: gcsFormData.auto_update,
              });
              toast.success('GCS Stage created successfully!');

              const connection: DatalakeConnection = {
                  id: `gcp_${Date.now()}`,
                  provider: 'gcp',
                  name: `GCS - ${gcsFormData.stage_name}`,
                  connected_at: new Date().toISOString(),
                  details: {
                      bucket_name: gcsFormData.bucket_name,
                      integration_name: gcsFormData.integration_name,
                      stage_name: gcsFormData.stage_name,
                  }
              };
              saveConnection(connection);

              try {
                  if (typeof window !== 'undefined') {
                      window.localStorage.setItem('features.datalakeConnected', '1');
                      window.dispatchEvent(new Event('app:refresh-menu'));
                  }
              } catch {}
              try { await silentReauth(); } catch {}

              setConnectedProvider('gcp');
              setShowDatalakeBrowser(true);
              setCurrentStep(0);
          }
      } catch (error: any) {
          const errorMsg = extractErrorMsg(error);
          setErrorMessages(prev => [...prev, errorMsg]);
          toast.error(`Failed: ${errorMsg}`);
          console.error('Error:', error);
      } finally {
          setLoading(false);
      }
  };

  const handleSnowflakeSubmit = async (e: FormEvent) => {
      e.preventDefault();
      setLoading(true);
      try {
          await connectSnowflakeDatalake(
              snowflakeFormData.datalake_username,
              snowflakeFormData.datalake_password,
              snowflakeFormData.datalake_account,
              snowflakeFormData.datalake_role
          );
          setSnowflakeConnected(true);
          toast.success('Snowflake Datalake connected successfully!');

          await loadConnections();
          try { await silentReauth(); } catch {}

          setConnectedProvider('snowflake');
          setShowDatalakeBrowser(true);
          setCurrentStep(0);
      } catch (error: any) {
          const errorMsg = extractErrorMsg(error);
          setErrorMessages(prev => [...prev, errorMsg]);
          toast.error(`Failed: ${errorMsg}`);
          console.error('Error:', error);
      } finally {
          setLoading(false);
      }
  };

  const renderAzureForm = () => {
      return (
          <div className="mx-auto w-full max-w-lg transform rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl p-10 shadow-xl border border-slate-200/50 dark:border-slate-700/50">
              <div className="mb-8 flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-blue-600 bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text text-transparent">Azure Connection</h3>
                  <div className="animate-float">
                      <Image src={logos['azure']} alt="Azure Logo" width={80} height={80} className="transition-transform duration-300 hover:scale-110" />
                  </div>
              </div>

              {/* Error Messages Display */}
              {errorMessages.length > 0 && (
                  <div className="mb-6 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 p-4">
                      <div className="flex items-start">
                          <HiOutlineExclamationCircle className="h-5 w-5 text-red-600 mt-0.5 mr-2" />
                          <div className="flex-1">
                              <h4 className="text-sm font-semibold text-red-800 dark:text-red-300 mb-2">Errors occurred:</h4>
                              <ul className="space-y-1">
                                  {errorMessages.map((msg, idx) => (
                                      <li key={idx} className="text-sm text-red-700 dark:text-red-400">• {msg}</li>
                                  ))}
                              </ul>
                          </div>
                          <button
                              onClick={() => setErrorMessages([])}
                              className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                          >
                              ✕
                          </button>
                      </div>
                  </div>
              )}

              <form className="space-y-6" onSubmit={handleAzureSubmit}>
                  {azureCurrentSubStep === 1 && (
                      <>
                          <h4 className="text-xl font-medium text-gray-800 dark:text-gray-200">Step 1: Storage Integration</h4>
                          <Input
                              name="storage_integration_name"
                              label="Storage Integration Name"
                              placeholder="e.g., azure_storage_integration"
                              value={azureFormData.storage_integration_name}
                              onChange={(e) => handleChange(e, 'azure')}
                              required
                              disabled={azureStorageIntegrationCreated || loading}
                              className="w-full"
                          />
                          <Input
                              name="tenant_id"
                              label="Azure Tenant ID"
                              placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                              helperText="Found in Azure Portal → Azure Active Directory → Overview"
                              value={azureFormData.tenant_id}
                              onChange={(e) => handleChange(e, 'azure')}
                              required
                              disabled={azureStorageIntegrationCreated || loading}
                              className="w-full"
                          />
                          <Input
                              name="storage_url"
                              label="Azure Storage URL"
                              placeholder="azure://account.blob.core.windows.net/container"
                              helperText="Format: azure://account_name.blob.core.windows.net/container_name"
                              value={azureFormData.storage_url}
                              onChange={(e) => handleChange(e, 'azure')}
                              required
                              disabled={azureStorageIntegrationCreated || loading}
                              className="w-full"
                          />
                          {!azureStorageIntegrationCreated && (
                              <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-elevation-2 hover:shadow-elevation-3 transition-all duration-300 transform hover:scale-[1.02]" disabled={loading}>
                                  {loading ? 'Setting up...' : 'Create Storage Integration'}
                              </Button>
                          )}
                          {azureStorageIntegrationCreated && (
                              <Button type="button" onClick={() => setAzureCurrentSubStep(2)} className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 shadow-elevation-2 hover:shadow-elevation-3 transition-all duration-300 transform hover:scale-[1.02]" disabled={loading}>
                                  Continue to Consent Details
                              </Button>
                          )}
                      </>
                  )}

                  {azureCurrentSubStep === 2 && (
                      <>
                          <h4 className="text-xl font-medium text-gray-800 dark:text-gray-200">Step 2: Azure Storage Consent (wait for you)</h4>
                          <div className="bg-amber-50 dark:bg-amber-950/20 border-l-4 border-amber-500 p-4 mb-4">
                              <Text className="text-sm text-gray-700 dark:text-gray-300">
                                  {azureStorageDetailsFetched
                                      ? "Waiting for consent: open the URL below in a new tab, grant permissions to the Snowflake app in Azure Portal, then return here and click Continue."
                                      : "Click \"Fetch Consent Details\" to get the Azure consent URL, then open it in Azure Portal and grant permissions."}
                              </Text>
                          </div>

                          {azureStorageDetailsFetched ? (
                              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-300 dark:border-blue-800 p-5 rounded-lg space-y-3 shadow-md">
                                  <h5 className="text-lg font-bold text-blue-700 dark:text-blue-300">Consent Information:</h5>
                                  <div>
                                      <Text className="font-semibold text-gray-800 dark:text-gray-200">Application Name:</Text>
                                      <Text className="break-all text-base text-gray-900 dark:text-gray-100">
                                          {azureStorageMultiTenantAppName || 'N/A'}
                                      </Text>
                                  </div>
                                  <div>
                                      <Text className="font-semibold text-gray-800 dark:text-gray-200">Consent URL:</Text>
                                      {azureStorageConsentUrl ? (
                                          <a
                                              href={azureStorageConsentUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="block text-blue-600 dark:text-blue-400 hover:underline break-all text-base font-medium"
                                          >
                                              {azureStorageConsentUrl}
                                          </a>
                                      ) : (
                                          <Text className="text-sm text-gray-700 dark:text-gray-300 italic">URL not available.</Text>
                                      )}
                                  </div>

                                  <div className="border-t border-blue-200 dark:border-blue-800 pt-4 mt-4">
                                      <Text className="font-semibold text-gray-800 dark:text-gray-200 mb-3">
                                          Follow these steps in your Azure Portal:
                                      </Text>
                                      <ol className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
                                          <li className="flex items-start space-x-2">
                                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">1</span>
                                              <span>Open the <strong>Consent URL</strong> above in a new browser tab</span>
                                          </li>
                                          <li className="flex items-start space-x-2">
                                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">2</span>
                                              <span>Sign in with an Azure AD admin account and click <strong>Accept</strong> to grant permissions to the Snowflake application</span>
                                          </li>
                                          <li className="flex items-start space-x-2">
                                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">3</span>
                                              <span>Go to <strong>Azure Portal &rarr; Storage accounts &rarr; your storage account &rarr; Access Control (IAM)</strong></span>
                                          </li>
                                          <li className="flex items-start space-x-2">
                                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">4</span>
                                              <span>Click <strong>Add role assignment</strong>, select <strong>Storage Blob Data Reader</strong> (or <strong>Contributor</strong> for write access)</span>
                                          </li>
                                          <li className="flex items-start space-x-2">
                                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">5</span>
                                              <span>Under <strong>Members</strong>, select the Snowflake application (<code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">{azureStorageMultiTenantAppName || 'Snowflake app'}</code>) and click <strong>Review + assign</strong></span>
                                          </li>
                                          <li className="flex items-start space-x-2">
                                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">6</span>
                                              <span>Return here and click <strong>Continue</strong></span>
                                          </li>
                                      </ol>
                                  </div>

                                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3 mt-4">
                                      <div className="flex items-start space-x-2">
                                          <HiOutlineExclamationCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                                          <Text className="text-sm text-amber-800 dark:text-amber-300">
                                              The stage creation will fail if the Snowflake app has not been granted access to your storage account. Complete all steps above before proceeding.
                                          </Text>
                                      </div>
                                  </div>
                              </div>
                          ) : (
                              <Text className="text-base text-gray-700 dark:text-gray-300 font-semibold text-center py-4">
                                  {loading ? "Fetching consent URL and application name..." : "Click 'Fetch Consent Details' to retrieve the URL and application name."}
                              </Text>
                          )}

                          {!azureStorageDetailsFetched && (
                              <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-elevation-2 hover:shadow-elevation-3 transition-all duration-300 transform hover:scale-[1.02]" disabled={loading}>
                                  {loading ? 'Fetching Details...' : 'Fetch Consent Details'}
                              </Button>
                          )}
                          {azureStorageDetailsFetched && (
                              <Button type="button" onClick={() => setAzureCurrentSubStep(3)} className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 shadow-elevation-2 hover:shadow-elevation-3 transition-all duration-300 transform hover:scale-[1.02]" disabled={loading}>
                                  Continue to Notification Setup
                              </Button>
                          )}
                      </>
                  )}

                  {azureCurrentSubStep === 3 && (
                      <>
                          <h4 className="text-xl font-medium text-gray-800 dark:text-gray-200">Step 3: Notification Integration (Optional)</h4>
                          <Text className="text-sm text-gray-600 dark:text-gray-400">
                              If you want to enable automatic data loading via Snowpipe, set up a Notification Integration.
                          </Text>
                          <Checkbox
                              label="Enable Notification Integration (for Snowpipe)"
                              checked={showAzureNotificationOption}
                              onChange={(e) => setShowAzureNotificationOption(e.target.checked)}
                              className="mb-4"
                              disabled={loading}
                          />
                          {showAzureNotificationOption && (
                              <>
                                  <Input
                                      name="notification_integration_name"
                                      label="Notification Integration Name"
                                      placeholder="e.g., azure_notification_integration"
                                      value={azureFormData.notification_integration_name}
                                      onChange={(e) => handleChange(e, 'azure')}
                                      required={showAzureNotificationOption}
                                      disabled={azureNotificationIntegrationCreated || loading}
                                      className="w-full"
                                  />
                                  <Input
                                      name="queue_url"
                                      label="Azure Queue URL"
                                      placeholder="azure://account.queue.core.windows.net/queue-name"
                                      helperText="Azure Storage Queue URL for event notifications"
                                      value={azureFormData.queue_url}
                                      onChange={(e) => handleChange(e, 'azure')}
                                      required={showAzureNotificationOption}
                                      disabled={azureNotificationIntegrationCreated || loading}
                                      className="w-full"
                                  />
                                  {!azureNotificationIntegrationCreated && (
                                      <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-elevation-2 hover:shadow-elevation-3 transition-all duration-300 transform hover:scale-[1.02]" disabled={loading || !azureFormData.queue_url || !azureFormData.notification_integration_name}>
                                          {loading ? 'Setting up...' : 'Create Notification Integration'}
                                      </Button>
                                  )}
                              </>
                          )}
                          {(azureNotificationIntegrationCreated || !showAzureNotificationOption) && (
                              <Button type="button" onClick={handleAzureNextStep}
                                  className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 shadow-elevation-2 hover:shadow-elevation-3 transition-all duration-300 transform hover:scale-[1.02]" disabled={loading}>
                                  Continue
                              </Button>
                          )}
                      </>
                  )}

                  {azureCurrentSubStep === 4 && showAzureNotificationOption && azureNotificationIntegrationCreated && (
                      <>
                          <h4 className="text-xl font-medium text-gray-800 dark:text-gray-200">Step 4: Azure Consent Details</h4>
                          <Text className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                              Retrieving and displaying details required for Azure Active Directory consent.
                          </Text>
                          
                          {/* Display area for fetched details */}
                          {azureNotificationDetailsFetched ? (
                              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-300 dark:border-blue-800 p-5 rounded-lg space-y-3 shadow-md">
                                  <h5 className="text-lg font-bold text-blue-700 dark:text-blue-300">Consent Information:</h5>
                                  <div>
                                      <Text className="font-semibold text-gray-800 dark:text-gray-200">Application Name:</Text>
                                      <Text className="break-all text-base text-gray-900 dark:text-gray-100">
                                          {azureMultiTenantAppName || 'N/A'}
                                      </Text>
                                  </div>
                                  <div>
                                      <Text className="font-semibold text-gray-800 dark:text-gray-200">Consent URL:</Text>
                                      {azureConsentUrl ? (
                                          <a
                                              href={azureConsentUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="block text-blue-600 dark:text-blue-400 hover:underline break-all text-base font-medium"
                                          >
                                              {azureConsentUrl}
                                          </a>
                                      ) : (
                                          <Text className="text-sm text-gray-700 dark:text-gray-300 italic">URL not available.</Text>
                                      )}
                                  </div>
                                  <div className="border-t border-blue-200 dark:border-blue-800 pt-4 mt-4">
                                      <Text className="font-semibold text-gray-800 dark:text-gray-200 mb-3">
                                          Follow these steps in your Azure Portal:
                                      </Text>
                                      <ol className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
                                          <li className="flex items-start space-x-2">
                                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">1</span>
                                              <span>Open the <strong>Consent URL</strong> above in a new browser tab</span>
                                          </li>
                                          <li className="flex items-start space-x-2">
                                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">2</span>
                                              <span>Sign in with an Azure AD admin account and click <strong>Accept</strong> to grant permissions to the Snowflake application</span>
                                          </li>
                                          <li className="flex items-start space-x-2">
                                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">3</span>
                                              <span>Go to <strong>Azure Portal &rarr; Storage account &rarr; Events</strong></span>
                                          </li>
                                          <li className="flex items-start space-x-2">
                                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">4</span>
                                              <span>Create an <strong>Event Subscription</strong> with event type <strong>Blob Created</strong>, endpoint type <strong>Storage Queue</strong>, and select the queue you configured</span>
                                          </li>
                                          <li className="flex items-start space-x-2">
                                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">5</span>
                                              <span>Return here and click <strong>Continue</strong></span>
                                          </li>
                                      </ol>
                                  </div>

                                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3 mt-4">
                                      <div className="flex items-start space-x-2">
                                          <HiOutlineExclamationCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                                          <Text className="text-sm text-amber-800 dark:text-amber-300">
                                              Snowpipe will not work until consent is granted and the Event Grid subscription is configured. Complete all steps above before proceeding.
                                          </Text>
                                      </div>
                                  </div>
                              </div>
                          ) : (
                              <Text className="text-base text-gray-700 dark:text-gray-300 font-semibold text-center py-4">
                                  {loading ? "Fetching consent URL and application name..." : "Click 'Fetch Consent Details' to retrieve the URL and application name."}
                              </Text>
                          )}

                          {!azureNotificationDetailsFetched && (
                              <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-elevation-2 hover:shadow-elevation-3 transition-all duration-300 transform hover:scale-[1.02]" disabled={loading}>
                                  {loading ? 'Fetching Details...' : 'Fetch Consent Details'}
                              </Button>
                          )}
                          {azureNotificationDetailsFetched && (
                              <Button type="button" onClick={() => setAzureCurrentSubStep(5)} className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 shadow-elevation-2 hover:shadow-elevation-3 transition-all duration-300 transform hover:scale-[1.02]" disabled={loading}>
                                  Continue to Create Stage
                              </Button>
                          )}
                      </>
                  )}

                  { (showAzureNotificationOption && azureCurrentSubStep === 5) || (!showAzureNotificationOption && azureCurrentSubStep === 4) ? (
                      <>
                          <h4 className="text-xl font-medium text-gray-800 dark:text-gray-200">Step {showAzureNotificationOption ? '5' : '4'}: Create Azure Stage</h4>
                          <Input
                              name="stage_name"
                              label="Stage Name"
                              placeholder="e.g., my_azure_stage"
                              value={azureFormData.stage_name}
                              onChange={(e) => handleChange(e, 'azure')}
                              required
                              disabled={loading}
                              className="w-full"
                          />
                           <Text className="text-sm text-gray-600 dark:text-gray-400">
                              Stage URL will be the same as Storage URL: {azureFormData.storage_url}
                          </Text>
                          <Input
                              name="storage_integration_name"
                              label="Storage Integration Name"
                              value={azureFormData.storage_integration_name}
                              disabled
                              className="w-full"
                          />
                          <div className="flex items-center space-x-2">
                              <Checkbox
                                  name="load_data"
                                  checked={true}
                                  disabled={true}
                                  id="load_data_checkbox"
                              />
                              <Label htmlFor="load_data_checkbox" className="text-sm">Load data into tables after stage creation</Label>
                          </div>
                          {showAzureNotificationOption && (
                              <Checkbox
                                  name="auto_update"
                                  label="Enable automatic updates (Snowpipe)"
                                  checked={azureFormData.auto_update}
                                  onChange={(e) => handleChange(e, 'azure')}
                                  disabled={loading || !azureNotificationIntegrationCreated || !azureNotificationDetailsFetched}
                              />
                          )}
                          {!showAzureNotificationOption && (
                              <Text className="text-sm text-gray-600 dark:text-gray-400 italic">
                                  Automatic updates (Snowpipe) require a Notification Integration to be enabled in Step 3.
                              </Text>
                          )}

                          {/* Snowpipe / Azure Event Grid Guide */}
                          {azureFormData.auto_update && showAzureNotificationOption && (
                              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 dark:border-indigo-800 dark:bg-indigo-950/30 p-5 space-y-4">
                                  <Text className="font-semibold text-indigo-800 dark:text-indigo-300">
                                      Snowpipe Setup &mdash; Azure Event Grid
                                  </Text>
                                  <div className="border-t border-indigo-200 dark:border-indigo-800 pt-4">
                                      <Text className="font-semibold text-gray-800 dark:text-gray-200 mb-3">
                                          Ensure the following is configured in your Azure Portal:
                                      </Text>
                                      <ol className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
                                          <li className="flex items-start space-x-2">
                                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold shrink-0">1</span>
                                              <span>Go to <strong>Azure Portal &rarr; Storage account &rarr; Events</strong></span>
                                          </li>
                                          <li className="flex items-start space-x-2">
                                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold shrink-0">2</span>
                                              <span>Create an <strong>Event Subscription</strong> with Event type: <strong>Blob Created</strong></span>
                                          </li>
                                          <li className="flex items-start space-x-2">
                                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold shrink-0">3</span>
                                              <span>Set endpoint type to <strong>Storage Queue</strong> and select the queue URL you used for the notification integration</span>
                                          </li>
                                          <li className="flex items-start space-x-2">
                                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold shrink-0">4</span>
                                              <span>Click <strong>Create</strong> to enable automatic event notifications</span>
                                          </li>
                                      </ol>
                                  </div>
                                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3">
                                      <div className="flex items-start space-x-2">
                                          <HiOutlineExclamationCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                                          <Text className="text-sm text-amber-800 dark:text-amber-300">
                                              Snowpipe will start ingesting data automatically once the Event Grid subscription delivers blob-created events to your Storage Queue.
                                          </Text>
                                      </div>
                                  </div>
                              </div>
                          )}

                          <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-elevation-2 hover:shadow-elevation-3 transition-all duration-300 transform hover:scale-[1.02]" disabled={loading || (azureFormData.auto_update && !azureFormData.notification_integration_name)}>
                              {loading ? 'Creating Stage...' : 'Create Azure Stage'}
                          </Button>
                      </>
                  ) : null}
              </form>
              <Button className="mt-6 w-full bg-surface-secondary hover:bg-surface-tertiary border border-border-secondary transition-all duration-300 hover:shadow-elevation-2" onClick={handleBackToProviderSelection} disabled={loading} title="Back to Data Source Selection">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Data Source Selection
              </Button>
          </div>
      );
  };

  const renderAwsForm = () => {
      return (
          <div className="mx-auto w-full max-w-lg transform rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl p-10 shadow-xl border border-slate-200/50 dark:border-slate-700/50">
              <div className="mb-8 flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-blue-600 bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text text-transparent">AWS Connection</h3>
                  <div className="animate-float">
                      <Image src={logos['aws']} alt="AWS Logo" width={80} height={80} className="transition-transform duration-300 hover:scale-110" />
                  </div>
              </div>
              <form className="space-y-6" onSubmit={handleAwsSubmit}>
                  {awsCurrentSubStep === 1 && (
                      <>
                          <h4 className="text-xl font-medium text-gray-800 dark:text-gray-200">Step 1: Storage Integration</h4>
                          <Input
                              name="integration_name"
                              label="Integration Name"
                              placeholder="e.g., aws_storage_integration"
                              value={awsFormData.integration_name}
                              onChange={(e) => handleChange(e, 'aws')}
                              required
                              disabled={awsIntegrationCreated || loading}
                              className="w-full"
                          />
                          <Input
                              name="bucket_name"
                              label="AWS Bucket Name"
                              placeholder="e.g., my-s3-bucket"
                              value={awsFormData.bucket_name}
                              onChange={(e) => handleChange(e, 'aws')}
                              required
                              disabled={awsIntegrationCreated || loading}
                              className="w-full"
                          />
                          <Input
                              name="aws_role_arn"
                              label="AWS Role ARN"
                              placeholder="arn:aws:iam::123456789012:role/MySnowflakeRole"
                              helperText="IAM role that grants Snowflake access to your S3 bucket"
                              value={awsFormData.aws_role_arn}
                              onChange={(e) => handleChange(e, 'aws')}
                              required
                              disabled={awsIntegrationCreated || loading}
                              className="w-full"
                          />
                        
                          <Input
                              name="external_id"
                              label="External ID"
                              placeholder="e.g., YOUR_EXTERNAL_ID"
                              helperText="Found in the IAM role trust policy — used for secure cross-account access"
                              value={awsFormData.external_id}
                              onChange={(e) => handleChange(e, 'aws')}
                              required
                              disabled={awsIntegrationCreated || loading}
                              className="w-full"
                          />
                          {!awsIntegrationCreated && (
                              <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-elevation-2 hover:shadow-elevation-3 transition-all duration-300 transform hover:scale-[1.02]" disabled={loading}>
                                  {loading ? 'Setting up...' : 'Create Storage Integration'}
                              </Button>
                          )}
                          {awsIntegrationCreated && (
                              <Button type="button" onClick={() => setAwsCurrentSubStep(2)} className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 shadow-elevation-2 hover:shadow-elevation-3 transition-all duration-300 transform hover:scale-[1.02]" disabled={loading}>
                                  Continue to IAM Setup
                              </Button>
                          )}
                      </>
                  )}

                  {/* Step 2: AWS IAM Trust Policy Guide */}
                  {awsCurrentSubStep === 2 && (
                      <>
                          <h4 className="text-xl font-medium text-gray-800 dark:text-gray-200">Step 2: Configure AWS IAM Trust Policy</h4>
                          <div className="rounded-xl border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30 p-6 space-y-4">
                              <div className="flex items-start space-x-3">
                                  <HiOutlineShieldCheck className="h-6 w-6 text-blue-500 mt-0.5 shrink-0" />
                                  <div className="flex-1">
                                      <Text className="font-semibold text-blue-800 dark:text-blue-300 mb-1">
                                          Snowflake IAM User ARN
                                      </Text>
                                      {awsIamUserArn ? (
                                          <div className="flex items-center space-x-2 bg-white dark:bg-slate-900 rounded-lg px-4 py-2 border border-blue-200 dark:border-blue-700">
                                              <code className="text-sm font-mono text-blue-700 dark:text-blue-300 break-all select-all">
                                                  {awsIamUserArn}
                                              </code>
                                              <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="outline"
                                                  className="shrink-0 text-xs"
                                                  onClick={() => {
                                                      navigator.clipboard.writeText(awsIamUserArn || '');
                                                      toast.success('IAM User ARN copied!');
                                                  }}
                                              >
                                                  Copy
                                              </Button>
                                          </div>
                                      ) : (
                                          <div className="space-y-2">
                                              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3">
                                                  <Text className="text-sm text-amber-800 dark:text-amber-300">
                                                      IAM User ARN was not returned by the API. Click below to fetch integration details.
                                                  </Text>
                                              </div>
                                              <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="outline"
                                                  className="text-xs"
                                                  disabled={loading}
                                                  onClick={async () => {
                                                      setLoading(true);
                                                      try {
                                                          const details = await getIntegrationDetails(awsFormData.integration_name);
                                                          const props = (details as any)?.properties ?? details;
                                                          const arn = props?.STORAGE_AWS_IAM_USER_ARN ?? '';
                                                          const extId = props?.STORAGE_AWS_EXTERNAL_ID ?? '';
                                                          if (arn) {
                                                              setAwsIamUserArn(arn);
                                                              if (extId) setAwsExternalId(extId);
                                                              toast.success('IAM details retrieved!');
                                                          } else {
                                                              toast.error('IAM User ARN not found. Check your integration in Snowflake.');
                                                          }
                                                      } catch (err: any) {
                                                          toast.error(`Failed to fetch details: ${err.message}`);
                                                      } finally {
                                                          setLoading(false);
                                                      }
                                                  }}
                                              >
                                                  {loading ? 'Fetching...' : 'Verify Integration & Fetch IAM Details'}
                                              </Button>
                                          </div>
                                      )}
                                  </div>
                              </div>

                              {awsExternalId && (
                                  <div className="flex items-start space-x-3">
                                      <HiOutlineShieldCheck className="h-6 w-6 text-indigo-500 mt-0.5 shrink-0" />
                                      <div className="flex-1">
                                          <Text className="font-semibold text-indigo-800 dark:text-indigo-300 mb-1">
                                              Snowflake External ID
                                          </Text>
                                          <div className="flex items-center space-x-2 bg-white dark:bg-slate-900 rounded-lg px-4 py-2 border border-indigo-200 dark:border-indigo-700">
                                              <code className="text-sm font-mono text-indigo-700 dark:text-indigo-300 break-all select-all">
                                                  {awsExternalId}
                                              </code>
                                              <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="outline"
                                                  className="shrink-0 text-xs"
                                                  onClick={() => {
                                                      navigator.clipboard.writeText(awsExternalId || '');
                                                      toast.success('External ID copied!');
                                                  }}
                                              >
                                                  Copy
                                              </Button>
                                          </div>
                                      </div>
                                  </div>
                              )}

                              <div className="border-t border-blue-200 dark:border-blue-800 pt-4">
                                  <Text className="font-semibold text-gray-800 dark:text-gray-200 mb-3">
                                      Follow these steps in your AWS Console:
                                  </Text>
                                  <ol className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
                                      <li className="flex items-start space-x-2">
                                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">1</span>
                                          <span>Go to <strong>AWS Console &rarr; IAM &rarr; Roles</strong> and find the role you specified (<code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">{awsFormData.aws_role_arn}</code>)</span>
                                      </li>
                                      <li className="flex items-start space-x-2">
                                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">2</span>
                                          <span>Click the <strong>Trust relationships</strong> tab, then <strong>Edit trust policy</strong></span>
                                      </li>
                                      <li className="flex items-start space-x-2">
                                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">3</span>
                                          <span>Update the trust policy to allow the Snowflake IAM User ARN above to assume this role. Replace the <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">AWS</code> principal with the ARN and set the <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">sts:ExternalId</code> condition to the External ID above</span>
                                      </li>
                                      <li className="flex items-start space-x-2">
                                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">4</span>
                                          <span>The trust policy should look like:</span>
                                      </li>
                                  </ol>
                                  <pre className="mt-2 rounded-lg bg-slate-900 dark:bg-slate-950 p-4 text-xs text-green-400 overflow-x-auto">
{`{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {
      "AWS": "${awsIamUserArn || '<STORAGE_AWS_IAM_USER_ARN>'}"
    },
    "Action": "sts:AssumeRole",
    "Condition": {
      "StringEquals": {
        "sts:ExternalId": "${awsExternalId || '<STORAGE_AWS_EXTERNAL_ID>'}"
      }
    }
  }]
}`}
                                  </pre>
                                  <ol className="space-y-3 text-sm text-gray-700 dark:text-gray-300 mt-4" start={5}>
                                      <li className="flex items-start space-x-2">
                                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">5</span>
                                          <span>Click <strong>Update policy</strong>, then come back here and continue</span>
                                      </li>
                                  </ol>
                              </div>

                              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3">
                                  <div className="flex items-start space-x-2">
                                      <HiOutlineExclamationCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                                      <Text className="text-sm text-amber-800 dark:text-amber-300">
                                          The stage creation will fail if the trust policy has not been updated. Make sure to complete the IAM setup before proceeding.
                                      </Text>
                                  </div>
                              </div>
                          </div>

                          <Button
                              type="button"
                              onClick={() => setAwsCurrentSubStep(3)}
                              className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 shadow-elevation-2 hover:shadow-elevation-3 transition-all duration-300 transform hover:scale-[1.02]"
                              disabled={loading}
                          >
                              I&apos;ve completed the IAM setup &mdash; Continue to Stage Creation
                          </Button>
                      </>
                  )}

                  {awsCurrentSubStep === 3 && (
                      <>
                          <h4 className="text-xl font-medium text-gray-800 dark:text-gray-200">Step 3: Create AWS Stage</h4>
                          <Input
                              name="stage_name"
                              label="Stage Name"
                              placeholder="e.g., my_aws_stage"
                              value={awsFormData.stage_name}
                              onChange={(e) => handleChange(e, 'aws')}
                              required
                              disabled={loading}
                              className="w-full"
                          />
                          <Text className="text-sm text-gray-600 dark:text-gray-400">
                              Stage Bucket Name will be the same as Storage Bucket Name: {awsFormData.bucket_name}
                          </Text>
                          <Input
                              name="integration_name"
                              label="Storage Integration Name"
                              value={awsFormData.integration_name}
                              disabled
                              className="w-full"
                          />
                          <Checkbox
                              name="load_data"
                              label="Load data into tables after stage creation"
                              checked={awsFormData.load_data}
                              onChange={(e) => handleChange(e, 'aws')}
                              disabled={loading}
                          />
                          <Checkbox
                              name="auto_update"
                              label="Enable automatic updates (Snowpipe)"
                              checked={awsFormData.auto_update}
                              onChange={(e) => handleChange(e, 'aws')}
                              disabled={loading}
                          />

                          {/* Snowpipe / AWS SQS Event Notification Guide */}
                          {awsFormData.auto_update && (
                              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 dark:border-indigo-800 dark:bg-indigo-950/30 p-5 space-y-4">
                                  <Text className="font-semibold text-indigo-800 dark:text-indigo-300">
                                      Snowpipe Setup &mdash; S3 Event Notification
                                  </Text>
                                  <Text className="text-sm text-gray-600 dark:text-gray-400">
                                      Snowpipe uses SQS to detect new files in your S3 bucket. After stage creation, configure event notifications on your bucket.
                                  </Text>
                                  <div className="border-t border-indigo-200 dark:border-indigo-800 pt-4">
                                      <Text className="font-semibold text-gray-800 dark:text-gray-200 mb-3">
                                          After stage creation, follow these steps in the AWS Console:
                                      </Text>
                                      <ol className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
                                          <li className="flex items-start space-x-2">
                                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold shrink-0">1</span>
                                              <span>Go to <strong>AWS Console &rarr; S3 &rarr; your bucket &rarr; Properties</strong></span>
                                          </li>
                                          <li className="flex items-start space-x-2">
                                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold shrink-0">2</span>
                                              <span>Scroll to <strong>Event notifications</strong> and click <strong>Create event notification</strong></span>
                                          </li>
                                          <li className="flex items-start space-x-2">
                                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold shrink-0">3</span>
                                              <span>Select event types: <strong>All object create events</strong> (<code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">s3:ObjectCreated:*</code>)</span>
                                          </li>
                                          <li className="flex items-start space-x-2">
                                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold shrink-0">4</span>
                                              <span>Under <strong>Destination</strong>, choose <strong>SQS Queue</strong> and enter the Snowflake SQS ARN (found via <code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">SHOW PIPES</code> in Snowflake after creating the pipe)</span>
                                          </li>
                                          <li className="flex items-start space-x-2">
                                              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold shrink-0">5</span>
                                              <span>Click <strong>Save changes</strong></span>
                                          </li>
                                      </ol>
                                  </div>
                                  <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3">
                                      <div className="flex items-start space-x-2">
                                          <HiOutlineExclamationCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                                          <Text className="text-sm text-amber-800 dark:text-amber-300">
                                              Snowpipe will start working once the S3 event notification is configured to send events to the Snowflake SQS queue.
                                          </Text>
                                      </div>
                                  </div>
                              </div>
                          )}

                          <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-elevation-2 hover:shadow-elevation-3 transition-all duration-300 transform hover:scale-[1.02]" disabled={loading}>
                              {loading ? 'Creating Stage...' : 'Create AWS Stage'}
                          </Button>
                      </>
                  )}
              </form>
              <Button className="mt-6 w-full bg-surface-secondary hover:bg-surface-tertiary border border-border-secondary transition-all duration-300 hover:shadow-elevation-2" onClick={handleBackToProviderSelection} disabled={loading} title="Back to Data Source Selection">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Data Source Selection
              </Button>
          </div>
      );
  };

  const renderGcsForm = () => {
      return (
          <div className="mx-auto w-full max-w-lg transform rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl p-10 shadow-xl border border-slate-200/50 dark:border-slate-700/50">
              <div className="mb-8 flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-blue-600 bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text text-transparent">Google Cloud Storage</h3>
                  <div className="animate-float">
                      <Image src={logos['gcs']} alt="GCS Logo" width={80} height={80} className="transition-transform duration-300 hover:scale-110" unoptimized />
                  </div>
              </div>
              <form className="space-y-6" onSubmit={handleGcsSubmit}>
                  {/* Step 1: Create Storage Integration */}
  const renderGcpForm = () => {
      return (
          <div className="mx-auto w-full max-w-lg transform rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl p-10 shadow-xl border border-slate-200/50 dark:border-slate-700/50">
              <div className="mb-8 flex items-center justify-between">
                  <h3 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-green-600 bg-clip-text text-transparent">GCS Connection</h3>
                  <div className="animate-float">
                      <Image src={logos['gcp']} alt="GCP Logo" width={80} height={80} className="transition-transform duration-300 hover:scale-110" />
                  </div>
              </div>

              {errorMessages.length > 0 && (
                  <div className="mb-6 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 p-4">
                      <div className="flex items-start">
                          <HiOutlineExclamationCircle className="h-5 w-5 text-red-600 mt-0.5 mr-2" />
                          <div className="flex-1">
                              <h4 className="text-sm font-semibold text-red-800 dark:text-red-300 mb-2">Errors occurred:</h4>
                              <ul className="space-y-1">
                                  {errorMessages.map((msg, idx) => (
                                      <li key={idx} className="text-sm text-red-700 dark:text-red-400">{msg}</li>
                                  ))}
                              </ul>
                          </div>
                          <button onClick={() => setErrorMessages([])} className="text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300">x</button>
                      </div>
                  </div>
              )}

              <form className="space-y-6" onSubmit={handleGcpSubmit}>
                  {gcsCurrentSubStep === 1 && (
                      <>
                          <h4 className="text-xl font-medium text-gray-800 dark:text-gray-200">Step 1: Storage Integration</h4>
                          <Input
                              name="integration_name"
                              label="Integration Name"
                              placeholder="e.g., GCS_MY_DATALAKE"
                              value={gcsFormData.integration_name}
                              onChange={(e) => handleChange(e, 'gcs')}
                              placeholder="e.g., gcs_storage_integration"
                              helperText="Unique name for the Snowflake storage integration"
                              value={gcsFormData.integration_name}
                              onChange={(e) => setGcsFormData(prev => ({ ...prev, integration_name: e.target.value }))}
                              required
                              disabled={gcsIntegrationCreated || loading}
                              className="w-full"
                          />
                          <Input
                              name="bucket_name"
                              label="GCS Bucket Name"
                              placeholder="e.g., my-company-datalake (without gs:// prefix)"
                              value={gcsFormData.bucket_name}
                              onChange={(e) => handleChange(e, 'gcs')}
                              placeholder="e.g., my-gcs-bucket"
                              helperText="Google Cloud Storage bucket name (without gs:// prefix)"
                              value={gcsFormData.bucket_name}
                              onChange={(e) => setGcsFormData(prev => ({ ...prev, bucket_name: e.target.value }))}
                              required
                              disabled={gcsIntegrationCreated || loading}
                              className="w-full"
                          />
                          {!gcsIntegrationCreated && (
                              <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-elevation-2 hover:shadow-elevation-3 transition-all duration-300 transform hover:scale-[1.02]" disabled={loading}>
                              <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 shadow-elevation-2 hover:shadow-elevation-3 transition-all duration-300 transform hover:scale-[1.02]" disabled={loading}>
                                  {loading ? 'Setting up...' : 'Create Storage Integration'}
                              </Button>
                          )}
                          {gcsIntegrationCreated && (
                              <Button type="button" onClick={() => setGcsCurrentSubStep(2)} className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 shadow-elevation-2 hover:shadow-elevation-3 transition-all duration-300 transform hover:scale-[1.02]" disabled={loading}>
                                  Continue to IAM Setup
                              </Button>
                          )}
                      </>
                  )}

                  {/* Step 2: IAM Setup Guide */}
                  {gcsCurrentSubStep === 2 && (
                      <>
                          <h4 className="text-xl font-medium text-gray-800 dark:text-gray-200">Step 2: Configure GCP IAM Access</h4>
                          <div className="rounded-xl border border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30 p-6 space-y-4">
                              <div className="flex items-start space-x-3">
                                  <HiOutlineShieldCheck className="h-6 w-6 text-blue-500 mt-0.5 shrink-0" />
                                  <div className="flex-1">
                                      <Text className="font-semibold text-blue-800 dark:text-blue-300 mb-1">
                                          Snowflake GCS Service Account
                                      </Text>
                                      {gcsServiceAccount ? (
                                          <div className="flex items-center space-x-2 bg-white dark:bg-slate-900 rounded-lg px-4 py-2 border border-blue-200 dark:border-blue-700">
                                              <code className="text-sm font-mono text-blue-700 dark:text-blue-300 break-all select-all">
                                                  {gcsServiceAccount}
                                              </code>
                                              <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="outline"
                                                  className="shrink-0 text-xs"
                                                  onClick={() => {
                                                      navigator.clipboard.writeText(gcsServiceAccount || '');
                                                      toast.success('Service account copied!');
                                                  }}
                                              >
                                                  Copy
                                              </Button>
                                          </div>
                                      ) : (
                                          <div className="space-y-2">
                                              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3">
                                                  <Text className="text-sm text-amber-800 dark:text-amber-300">
                                                      Service account was not returned by the API. Click below to fetch integration details.
                                                  </Text>
                                              </div>
                                              <Button
                                                  type="button"
                                                  size="sm"
                                                  variant="outline"
                                                  className="text-xs"
                                                  disabled={loading}
                                                  onClick={async () => {
                                                      setLoading(true);
                                                      try {
                                                          const details = await getIntegrationDetails(gcsFormData.integration_name);
                                                          const props = (details as any)?.properties ?? details;
                                                          const sa = props?.STORAGE_GCP_SERVICE_ACCOUNT ?? '';
                                                          if (sa) {
                                                              setGcsServiceAccount(sa);
                                                              toast.success('Service account retrieved!');
                                                          } else {
                                                              toast.error('Service account not found in integration properties. Please check your integration in Snowflake.');
                                                          }
                                                      } catch (err: any) {
                                                          toast.error(`Failed to fetch details: ${err.message}`);
                                                      } finally {
                                                          setLoading(false);
                                                      }
                                                  }}
                                              >
                                                  {loading ? 'Fetching...' : 'Verify Integration & Fetch Service Account'}
                                              </Button>
                                          </div>
                                      )}
                                  </div>
                              </div>

                              <div className="border-t border-blue-200 dark:border-blue-800 pt-4">
                                  <Text className="font-semibold text-gray-800 dark:text-gray-200 mb-3">
                                      Follow these steps in your GCP Console:
                                  </Text>
                                  <ol className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
                                      <li className="flex items-start space-x-2">
                                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">1</span>
                                          <span>Go to <strong>GCP Console &rarr; Cloud Storage &rarr; your bucket &rarr; Permissions</strong></span>
                                      </li>
                                      <li className="flex items-start space-x-2">
                                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">2</span>
                                          <span>Click <strong>Grant Access</strong></span>
                                      </li>
                                      <li className="flex items-start space-x-2">
                                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">3</span>
                                          <span>Paste the service account above as the <strong>New principal</strong></span>
                                      </li>
                                      <li className="flex items-start space-x-2">
                                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">4</span>
                                          <span>Assign the role:
                                              <br /><strong>Storage Object Viewer</strong> (<code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">roles/storage.objectViewer</code>) for read-only
                                              <br /><strong>Storage Object Admin</strong> (<code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">roles/storage.objectAdmin</code>) for read + write
                                          </span>
                                      </li>
                                      <li className="flex items-start space-x-2">
                                          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 text-xs font-bold shrink-0">5</span>
                                          <span>Click <strong>Save</strong>, then come back here and continue</span>
                                      </li>
                                  </ol>
                              </div>

                              <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3">
                                  <div className="flex items-start space-x-2">
                                      <HiOutlineExclamationCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                                      <Text className="text-sm text-amber-800 dark:text-amber-300">
                                          The stage creation will fail if the service account has not been granted access to the bucket. Make sure to complete the IAM setup before proceeding.
                                      </Text>
                                  </div>
                              </div>
                          </div>

                          <Button
                              type="button"
                              onClick={() => setGcsCurrentSubStep(3)}
                              className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 shadow-elevation-2 hover:shadow-elevation-3 transition-all duration-300 transform hover:scale-[1.02]"
                              disabled={loading}
                          >
                              I&apos;ve completed the IAM setup &mdash; Continue to Stage Creation
                  {gcsCurrentSubStep === 2 && (
                      <>
                          <h4 className="text-xl font-medium text-gray-800 dark:text-gray-200">Step 2: Grant IAM Access</h4>
                          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-4 space-y-3">
                              <p className="text-sm text-blue-800 dark:text-blue-300 font-medium">Before proceeding, grant Snowflake access to your GCS bucket:</p>
                              {gcsServiceAccount && (
                                  <div className="space-y-2">
                                      <Text className="text-sm text-gray-700 dark:text-gray-300">Snowflake Service Account:</Text>
                                      <div className="flex items-center gap-2">
                                          <code className="flex-1 rounded bg-gray-100 dark:bg-gray-800 px-3 py-2 text-sm font-mono text-gray-900 dark:text-gray-100 break-all">
                                              {gcsServiceAccount}
                                          </code>
                                          <Button type="button" variant="outline" size="sm"
                                              onClick={() => { navigator.clipboard.writeText(gcsServiceAccount); toast.success('Copied!'); }}
                                              className="shrink-0 border-slate-300 dark:border-slate-600"
                                          >
                                              Copy
                                          </Button>
                                      </div>
                                  </div>
                              )}
                              <ol className="list-decimal list-inside text-sm text-gray-700 dark:text-gray-300 space-y-1">
                                  <li>Go to your GCS bucket in the Google Cloud Console</li>
                                  <li>Navigate to <strong>Permissions</strong> tab</li>
                                  <li>Click <strong>Grant Access</strong></li>
                                  <li>Add the service account above as a principal</li>
                                  <li>Assign the <strong>Storage Object Viewer</strong> role (or <strong>Storage Object Admin</strong> for write access)</li>
                                  <li>Click <strong>Save</strong></li>
                              </ol>
                          </div>
                          <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 shadow-elevation-2 hover:shadow-elevation-3 transition-all duration-300 transform hover:scale-[1.02]" disabled={loading}>
                              I have granted access — Continue
                          </Button>
                      </>
                  )}

                  {/* Step 3: Create GCS Stage */}
                  {gcsCurrentSubStep === 3 && (
                      <>
                          <h4 className="text-xl font-medium text-gray-800 dark:text-gray-200">Step 3: Create GCS Stage</h4>
                          <Input
                              name="stage_name"
                              label="Stage Name"
                              placeholder="e.g., STG_GCS_DATALAKE"
                              value={gcsFormData.stage_name}
                              onChange={(e) => handleChange(e, 'gcs')}
                              placeholder="e.g., my_gcs_stage"
                              value={gcsFormData.stage_name}
                              onChange={(e) => setGcsFormData(prev => ({ ...prev, stage_name: e.target.value }))}
                              required
                              disabled={loading}
                              className="w-full"
                          />
                          <Text className="text-sm text-gray-600 dark:text-gray-400">
                              Bucket: <strong>{gcsFormData.bucket_name}</strong> &middot; Integration: <strong>{gcsFormData.integration_name}</strong>
                              Bucket: <strong>{gcsFormData.bucket_name}</strong> | Integration: <strong>{gcsFormData.integration_name}</strong>
                          </Text>
                          <Input
                              name="prefix"
                              label="Path Prefix (optional)"
                              placeholder="e.g., raw/2024/"
                              value={gcsFormData.prefix}
                              onChange={(e) => handleChange(e, 'gcs')}
                              placeholder="e.g., data/raw/"
                              helperText="Optional sub-path within the bucket to use as stage root"
                              value={gcsFormData.prefix}
                              onChange={(e) => setGcsFormData(prev => ({ ...prev, prefix: e.target.value }))}
                              disabled={loading}
                              className="w-full"
                          />
                          <Checkbox
                              name="load_data"
                              label="Load data into tables after stage creation"
                              checked={gcsFormData.load_data}
                              onChange={(e) => handleChange(e, 'gcs')}
                              onChange={(e) => setGcsFormData(prev => ({ ...prev, load_data: (e.target as HTMLInputElement).checked }))}
                              disabled={loading}
                          />
                          <Checkbox
                              name="auto_update"
                              label="Enable automatic updates (Snowpipe)"
                              checked={gcsFormData.auto_update}
                              onChange={(e) => handleChange(e, 'gcs')}
                              disabled={loading}
                          />

                          {/* Snowpipe / GCS Notification Integration Setup */}
                          {gcsFormData.auto_update && (
                              <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 dark:border-indigo-800 dark:bg-indigo-950/30 p-5 space-y-4">
                                  <Text className="font-semibold text-indigo-800 dark:text-indigo-300">
                                      Snowpipe Setup &mdash; GCP Pub/Sub Notification Integration
                                  </Text>
                                  <Text className="text-sm text-gray-600 dark:text-gray-400">
                                      Snowpipe requires a Pub/Sub subscription to auto-ingest new files. Create a notification integration below.
                                  </Text>
                                  <Input
                                      name="notification_integration_name"
                                      label="Notification Integration Name"
                                      placeholder="e.g., GCS_NOTIF_INTEGRATION"
                                      value={gcsFormData.notification_integration_name}
                                      onChange={(e) => handleChange(e, 'gcs')}
                                      required
                                      disabled={gcsNotificationCreated || loading}
                                      className="w-full"
                                  />
                                  <Input
                                      name="gcp_pubsub_subscription_name"
                                      label="GCP Pub/Sub Subscription Name"
                                      placeholder="e.g., projects/my-project/subscriptions/my-sub"
                                      value={gcsFormData.gcp_pubsub_subscription_name}
                                      onChange={(e) => handleChange(e, 'gcs')}
                                      required
                                      disabled={gcsNotificationCreated || loading}
                                      className="w-full"
                                  />

                                  {!gcsNotificationCreated && (
                                      <Button
                                          type="button"
                                          className="w-full bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white"
                                          disabled={loading || !gcsFormData.notification_integration_name || !gcsFormData.gcp_pubsub_subscription_name}
                                          onClick={async () => {
                                              setLoading(true);
                                              try {
                                                  const result = await setupGcsNotificationIntegration(
                                                      gcsFormData.notification_integration_name,
                                                      gcsFormData.gcp_pubsub_subscription_name
                                                  );
                                                  setGcsNotificationCreated(true);
                                                  setGcsPubsubServiceAccount(result.GCP_PUBSUB_SERVICE_ACCOUNT || null);
                                                  toast.success('GCS Notification Integration created!');
                                              } catch (err: any) {
                                                  toast.error(err.message || 'Failed to create notification integration');
                                              } finally {
                                                  setLoading(false);
                                              }
                                          }}
                                      >
                                          {loading ? 'Creating...' : 'Create Notification Integration'}
                                      </Button>
                                  )}

                                  {gcsNotificationCreated && (
                                      <div className="space-y-4">
                                          <div className="flex items-center space-x-2 text-green-600 dark:text-green-400">
                                              <HiOutlineCheckCircle className="h-5 w-5" />
                                              <Text className="font-medium text-sm">Notification Integration created!</Text>
                                          </div>

                                          {gcsPubsubServiceAccount && (
                                              <div className="flex items-start space-x-3">
                                                  <HiOutlineShieldCheck className="h-6 w-6 text-indigo-500 mt-0.5 shrink-0" />
                                                  <div className="flex-1">
                                                      <Text className="font-semibold text-indigo-800 dark:text-indigo-300 mb-1">
                                                          GCP Pub/Sub Service Account
                                                      </Text>
                                                      <div className="flex items-center space-x-2 bg-white dark:bg-slate-900 rounded-lg px-4 py-2 border border-indigo-200 dark:border-indigo-700">
                                                          <code className="text-sm font-mono text-indigo-700 dark:text-indigo-300 break-all select-all">
                                                              {gcsPubsubServiceAccount}
                                                          </code>
                                                          <Button
                                                              type="button"
                                                              size="sm"
                                                              variant="outline"
                                                              className="shrink-0 text-xs"
                                                              onClick={() => {
                                                                  navigator.clipboard.writeText(gcsPubsubServiceAccount || '');
                                                                  toast.success('Pub/Sub service account copied!');
                                                              }}
                                                          >
                                                              Copy
                                                          </Button>
                                                      </div>
                                                  </div>
                                              </div>
                                          )}

                                          <div className="border-t border-indigo-200 dark:border-indigo-800 pt-4">
                                              <Text className="font-semibold text-gray-800 dark:text-gray-200 mb-3">
                                                  Configure GCP Pub/Sub IAM:
                                              </Text>
                                              <ol className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
                                                  <li className="flex items-start space-x-2">
                                                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold shrink-0">1</span>
                                                      <span>Go to <strong>GCP Console &rarr; Pub/Sub &rarr; Subscriptions</strong> and select your subscription</span>
                                                  </li>
                                                  <li className="flex items-start space-x-2">
                                                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold shrink-0">2</span>
                                                      <span>Click the <strong>Permissions</strong> tab, then <strong>Grant Access</strong></span>
                                                  </li>
                                                  <li className="flex items-start space-x-2">
                                                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold shrink-0">3</span>
                                                      <span>Paste the service account above as the <strong>New principal</strong></span>
                                                  </li>
                                                  <li className="flex items-start space-x-2">
                                                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold shrink-0">4</span>
                                                      <span>Assign the role <strong>Pub/Sub Subscriber</strong> (<code className="text-xs bg-gray-100 dark:bg-gray-800 px-1 rounded">roles/pubsub.subscriber</code>)</span>
                                                  </li>
                                                  <li className="flex items-start space-x-2">
                                                      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 text-xs font-bold shrink-0">5</span>
                                                      <span>Click <strong>Save</strong>, then come back here and create the stage</span>
                                                  </li>
                                              </ol>
                                          </div>

                                          <div className="rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3">
                                              <div className="flex items-start space-x-2">
                                                  <HiOutlineExclamationCircle className="h-5 w-5 text-amber-500 mt-0.5 shrink-0" />
                                                  <Text className="text-sm text-amber-800 dark:text-amber-300">
                                                      Snowpipe will not work until the Pub/Sub service account has been granted Subscriber access. Complete the IAM setup above before creating the stage.
                                                  </Text>
                                              </div>
                                          </div>
                                      </div>
                                  )}
                              </div>
                          )}

                          <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-elevation-2 hover:shadow-elevation-3 transition-all duration-300 transform hover:scale-[1.02]" disabled={loading || (gcsFormData.auto_update && !gcsNotificationCreated)}>
                              onChange={(e) => setGcsFormData(prev => ({ ...prev, auto_update: (e.target as HTMLInputElement).checked }))}
                              disabled={loading}
                          />
                          <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-green-500 hover:from-blue-600 hover:to-green-600 shadow-elevation-2 hover:shadow-elevation-3 transition-all duration-300 transform hover:scale-[1.02]" disabled={loading}>
                              {loading ? 'Creating Stage...' : 'Create GCS Stage'}
                          </Button>
                      </>
                  )}
              </form>
              <Button className="mt-6 w-full bg-surface-secondary hover:bg-surface-tertiary border border-border-secondary transition-all duration-300 hover:shadow-elevation-2" onClick={handleBackToProviderSelection} disabled={loading} title="Back to Data Source Selection">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Data Source Selection
              </Button>
          </div>
      );
  };

  const renderSnowflakeForm = () => {
      return (
          <div className="mx-auto w-full max-w-lg transform rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl p-10 shadow-xl border border-slate-200/50 dark:border-slate-700/50">
              <div className="mb-8 flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-blue-600 bg-gradient-to-r from-blue-600 to-blue-700 bg-clip-text text-transparent">Snowflake Connection</h3>
                  <div className="animate-float">
                      <Image src={logos['snowflake']} alt="Snowflake Logo" width={80} height={80} className="transition-transform duration-300 hover:scale-110" />
                  </div>
              </div>
              <form className="space-y-6" onSubmit={handleSnowflakeSubmit}>
                  <h4 className="text-xl font-medium text-gray-800 dark:text-gray-200">Connect to Snowflake Datalake</h4>
                  <Input
                      name="datalake_username"
                      label="Datalake Username"
                      placeholder="e.g., snowflake_user"
                      helperText="Snowflake login username for the target data lake account"
                      value={snowflakeFormData.datalake_username}
                      onChange={(e) => handleChange(e, 'snowflake')}
                      required
                      disabled={snowflakeConnected || loading}
                      className="w-full"
                  />
                  <Password
                      name="datalake_password"
                      label="Datalake Password"
                      placeholder="Enter your datalake password"
                      helperText="Password for the Snowflake user above"
                      value={snowflakeFormData.datalake_password}
                      onChange={(e) => handleChange(e, 'snowflake')}
                      required
                      disabled={snowflakeConnected || loading}
                      className="w-full"
                  />
                  <Input
                      name="datalake_account"
                      label="Datalake Account"
                      placeholder="e.g., abc12345.us-east-1"
                      helperText="Snowflake account identifier — format: org-account.region (from Snowsight URL)"
                      value={snowflakeFormData.datalake_account}
                      onChange={(e) => handleChange(e, 'snowflake')}
                      required
                      disabled={snowflakeConnected || loading}
                      className="w-full"
                  />
                  <Input
                      name="datalake_role"
                      label="Datalake Role"
                      placeholder="e.g., ACCOUNTADMIN"
                      helperText="Snowflake role with access to stages, integrations, and data loading"
                      value={snowflakeFormData.datalake_role}
                      onChange={(e) => handleChange(e, 'snowflake')}
                      required
                      disabled={snowflakeConnected || loading}
                      className="w-full"
                  />

                  <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-elevation-2 hover:shadow-elevation-3 transition-all duration-300 transform hover:scale-[1.02]" disabled={loading}>
                      {loading ? 'Connecting...' : 'Connect to Snowflake'}
                  </Button>
              </form>
              <Button className="mt-6 w-full bg-surface-secondary hover:bg-surface-tertiary border border-border-secondary transition-all duration-300 hover:shadow-elevation-2" onClick={handleBackToProviderSelection} disabled={loading} title="Back to Data Source Selection">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Data Source Selection
              </Button>
          </div>
      );
  };

  const renderDatabricksForm = () => {
      const handleDbxTest = async (e: FormEvent) => {
          e.preventDefault();
          setLoading(true);
          try {
              await databricksTest({ host: databricksFormData.host, http_path: databricksFormData.http_path, access_token: databricksFormData.access_token });
              toast.success('Connection successful');
              const { catalogs } = await databricksCatalogs(databricksFormData);
              setDatabricksCatalogsList(catalogs || []);
              setDatabricksStep('catalog');
          } catch (err: any) {
              toast.error(extractErrorMsg(err));
          } finally {
              setLoading(false);
          }
      };
      const handleDbxSelectCatalog = async (catalog: string) => {
          setDatabricksFormData((p) => ({ ...p, catalog }));
          setLoading(true);
          try {
              const { schemas } = await databricksSchemas(databricksFormData, catalog);
              setDatabricksSchemasList(schemas || []);
              setDatabricksStep('schema');
          } catch (err: any) {
              toast.error(extractErrorMsg(err));
          } finally {
              setLoading(false);
          }
      };
      const handleDbxSelectSchema = async (schema_name: string) => {
          setDatabricksFormData((p) => ({ ...p, schema_name }));
          setLoading(true);
          try {
              const { tables } = await databricksTables(databricksFormData, databricksFormData.catalog, schema_name);
              setDatabricksTablesList(tables || []);
              setDatabricksStep('tables');
          } catch (err: any) {
              toast.error(extractErrorMsg(err));
          } finally {
              setLoading(false);
          }
      };
      const handleDbxIngest = async (e: FormEvent) => {
          e.preventDefault();
          setLoading(true);
          try {
              await databricksIngest({
                  host: databricksFormData.host,
                  http_path: databricksFormData.http_path,
                  access_token: databricksFormData.access_token,
                  catalog: databricksFormData.catalog,
                  schema_name: databricksFormData.schema_name,
                  tables: databricksFormData.tables.length ? databricksFormData.tables : undefined,
              });
              toast.success('Databricks ingest completed');
              await loadConnections();
              setCurrentStep(0);
              setSelectedSource('');
          } catch (err: any) {
              toast.error(extractErrorMsg(err));
          } finally {
              setLoading(false);
          }
      };
      const box = 'mx-auto w-full max-w-lg transform rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl p-10 shadow-xl border border-slate-200/50 dark:border-slate-700/50';
      if (databricksStep === 'connect') {
          return (
              <div className={box}>
                  <div className="mb-6 flex items-center justify-between">
                      <h3 className="text-2xl font-bold text-slate-800 dark:text-white">Databricks</h3>
                      <Image src={logos.databricks} alt="Databricks" width={56} height={56} unoptimized />
                  </div>
                  <form onSubmit={handleDbxTest} className="space-y-4">
                      <Input label="Workspace host" placeholder="adb-xxx.azuredatabricks.net" helperText="Databricks workspace URL — found in your browser address bar" value={databricksFormData.host} onChange={(e) => setDatabricksFormData((p) => ({ ...p, host: e.target.value }))} required disabled={loading} />
                      <Input label="HTTP path (SQL warehouse)" placeholder="/sql/1.0/warehouses/abc123" helperText="Found in SQL Warehouse settings → Connection Details" value={databricksFormData.http_path} onChange={(e) => setDatabricksFormData((p) => ({ ...p, http_path: e.target.value }))} required disabled={loading} />
                      <Password label="Access token" helperText="Personal access token — generate in User Settings → Developer → Access Tokens" value={databricksFormData.access_token} onChange={(e) => setDatabricksFormData((p) => ({ ...p, access_token: e.target.value }))} required disabled={loading} />
                      <Button type="submit" disabled={loading}>{loading ? 'Testing...' : 'Test & list catalogs'}</Button>
                  </form>
              </div>
          );
      }
      if (databricksStep === 'catalog') {
          return (
              <div className={box}>
                  <h3 className="text-xl font-semibold mb-4 text-slate-900 dark:text-white">Select catalog</h3>
                  <div className="space-y-2">
                      {databricksCatalogsList.map((c) => (
                          <button key={c} type="button" onClick={() => handleDbxSelectCatalog(c)} className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-white">{c}</button>
                      ))}
                  </div>
                  <Button className="mt-4" variant="outline" onClick={() => setDatabricksStep('connect')} title="Back"><ArrowLeft className="w-4 h-4 mr-2" />Back</Button>
              </div>
          );
      }
      if (databricksStep === 'schema') {
          return (
              <div className={box}>
                  <h3 className="text-xl font-semibold mb-4 text-slate-900 dark:text-white">Select schema</h3>
                  <div className="space-y-2">
                      {databricksSchemasList.map((s) => (
                          <button key={s} type="button" onClick={() => handleDbxSelectSchema(s)} className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-white">{s}</button>
                      ))}
                  </div>
                  <Button className="mt-4" variant="outline" onClick={() => setDatabricksStep('catalog')} title="Back"><ArrowLeft className="w-4 h-4 mr-2" />Back</Button>
              </div>
          );
      }
      if (databricksStep === 'tables') {
          const toggle = (t: string) => setDatabricksFormData((p) => ({ ...p, tables: p.tables.includes(t) ? p.tables.filter((x) => x !== t) : [...p.tables, t] }));
          return (
              <div className={box}>
                  <h3 className="text-xl font-semibold mb-2 text-slate-900 dark:text-white">Select tables to ingest (or leave empty for all)</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Data will be copied to Snowflake schema CP_DATA360.DATABRICKS</p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                      {databricksTablesList.map((t) => (
                          <label key={t} className="flex items-center gap-2 cursor-pointer text-slate-900 dark:text-white">
                              <input type="checkbox" checked={databricksFormData.tables.includes(t)} onChange={() => toggle(t)} className="rounded border-slate-300 dark:border-slate-600" />
                              <span>{t}</span>
                          </label>
                      ))}
                  </div>
                  <div className="mt-4 flex gap-2">
                      <Button variant="outline" onClick={() => setDatabricksStep('schema')} title="Back"><ArrowLeft className="w-4 h-4 mr-2" />Back</Button>
                      <Button onClick={handleDbxIngest} disabled={loading}>{loading ? 'Ingesting...' : 'Ingest to Snowflake'}</Button>
                  </div>
              </div>
          );
      }
      return null;
  };

  const renderIcebergForm = () => {
      const handleIceTest = async (e: FormEvent) => {
          e.preventDefault();
          setLoading(true);
          try {
              await icebergTest({ uri: icebergFormData.uri, warehouse: icebergFormData.warehouse || undefined, credential: icebergFormData.credential || undefined });
              toast.success('Connection successful');
              const { namespaces } = await icebergNamespaces(icebergFormData);
              setIcebergNamespacesList(namespaces || []);
              setIcebergStep('namespace');
          } catch (err: any) {
              toast.error(extractErrorMsg(err));
          } finally {
              setLoading(false);
          }
      };
      const handleIceSelectNamespace = (namespace: string) => {
          setIcebergFormData((p) => ({ ...p, namespace }));
          setLoading(true);
          icebergTables(icebergFormData, namespace).then(({ tables }) => {
              setIcebergTablesList(tables || []);
              setIcebergStep('tables');
          }).catch((err: any) => toast.error(err?.message || 'Failed to list tables')).finally(() => setLoading(false));
      };
      const handleIceIngest = async (e: FormEvent) => {
          e.preventDefault();
          setLoading(true);
          try {
              await icebergIngest({
                  uri: icebergFormData.uri,
                  warehouse: icebergFormData.warehouse || undefined,
                  credential: icebergFormData.credential || undefined,
                  namespace: icebergFormData.namespace,
                  tables: icebergFormData.tables.length ? icebergFormData.tables : undefined,
              });
              toast.success('Iceberg ingest completed');
              await loadConnections();
              setCurrentStep(0);
              setSelectedSource('');
          } catch (err: any) {
              toast.error(extractErrorMsg(err));
          } finally {
              setLoading(false);
          }
      };
      const box = 'mx-auto w-full max-w-lg transform rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl p-10 shadow-xl border border-slate-200/50 dark:border-slate-700/50';
      if (icebergStep === 'connect') {
          return (
              <div className={box}>
                  <div className="mb-6 flex items-center justify-between">
                      <h3 className="text-2xl font-bold text-slate-800 dark:text-white">Apache Iceberg</h3>
                      <Image src={logos.iceberg} alt="Iceberg" width={56} height={56} unoptimized />
                  </div>
                  <form onSubmit={handleIceTest} className="space-y-4">
                      <Input label="REST catalog URI" placeholder="http://host:8181" helperText="REST catalog endpoint (e.g. Tabular, Nessie, or local)" value={icebergFormData.uri} onChange={(e) => setIcebergFormData((p) => ({ ...p, uri: e.target.value }))} required disabled={loading} />
                      <Input label="Warehouse (optional)" placeholder="s3://bucket/warehouse" helperText="Root path for Iceberg table data (S3, GCS, or HDFS)" value={icebergFormData.warehouse} onChange={(e) => setIcebergFormData((p) => ({ ...p, warehouse: e.target.value }))} disabled={loading} />
                      <Password label="Credential (optional)" helperText="Bearer token or credential for catalog authentication" value={icebergFormData.credential} onChange={(e) => setIcebergFormData((p) => ({ ...p, credential: e.target.value }))} disabled={loading} />
                      <Button type="submit" disabled={loading}>{loading ? 'Testing...' : 'Test & list namespaces'}</Button>
                  </form>
              </div>
          );
      }
      if (icebergStep === 'namespace') {
          return (
              <div className={box}>
                  <h3 className="text-xl font-semibold mb-4 text-slate-900 dark:text-white">Select namespace</h3>
                  <div className="space-y-2">
                      {icebergNamespacesList.map((n) => (
                          <button key={n} type="button" onClick={() => handleIceSelectNamespace(n)} className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-900 dark:text-white">{n}</button>
                      ))}
                  </div>
                  <Button className="mt-4" variant="outline" onClick={() => setIcebergStep('connect')} title="Back"><ArrowLeft className="w-4 h-4 mr-2" />Back</Button>
              </div>
          );
      }
      if (icebergStep === 'tables') {
          const toggle = (t: string) => setIcebergFormData((p) => ({ ...p, tables: p.tables.includes(t) ? p.tables.filter((x) => x !== t) : [...p.tables, t] }));
          return (
              <div className={box}>
                  <h3 className="text-xl font-semibold mb-2 text-slate-900 dark:text-white">Select tables to ingest (or leave empty for all)</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Data will be copied to Snowflake schema CP_DATA360.ICEBERG</p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                      {icebergTablesList.map((t) => (
                          <label key={t} className="flex items-center gap-2 cursor-pointer text-slate-900 dark:text-white">
                              <input type="checkbox" checked={icebergFormData.tables.includes(t)} onChange={() => toggle(t)} className="rounded border-slate-300 dark:border-slate-600" />
                              <span>{t}</span>
                          </label>
                      ))}
                  </div>
                  <div className="mt-4 flex gap-2">
                      <Button variant="outline" onClick={() => setIcebergStep('namespace')} title="Back"><ArrowLeft className="w-4 h-4 mr-2" />Back</Button>
                      <Button onClick={handleIceIngest} disabled={loading}>{loading ? 'Ingesting...' : 'Ingest to Snowflake'}</Button>
                  </div>
              </div>
          );
      }
      return null;
  };

  const renderPostgresForm = () => {
      const handleTest = async (e: FormEvent) => {
          e.preventDefault();
          setLoading(true);
          setDbTestResult(null);
          try {
              const result = await postgresTest(postgresFormData);
              setDbTestResult(result);
              setDbTestStep('tested');
              toast.success(`Connected — ${result.table_count} tables found (${result.latency_ms}ms)`);
          } catch (err: any) {
              const msg = extractErrorMsg(err);
              setDbTestResult({ ok: false, latency_ms: 0, message: msg });
              toast.error(msg);
          } finally {
              setLoading(false);
          }
      };
      const handleIngest = async () => {
          setLoading(true);
          setDbTestStep('ingesting');
          try {
              await postgresIngest(postgresFormData);
              toast.success('PostgreSQL ingest completed. Tables in CP_DATA360.POSTGRES');
              await loadConnections();
              const connection: DatalakeConnection = {
                  id: `postgres_${Date.now()}`,
                  provider: 'postgres',
                  name: `PostgreSQL - ${postgresFormData.database}`,
                  connected_at: new Date().toISOString(),
                  details: { host: postgresFormData.host, database: postgresFormData.database },
              };
              saveConnection(connection);
              setDbTestStep('form');
              setDbTestResult(null);
              setCurrentStep(0);
              setSelectedSource('');
          } catch (err: any) {
              toast.error(extractErrorMsg(err));
              setDbTestStep('tested');
          } finally {
              setLoading(false);
          }
      };
      const handleSaveOnly = async () => {
          toast.success('Connection saved. You can ingest later from Registered Connectors.');
          const connection: DatalakeConnection = {
              id: `postgres_${Date.now()}`,
              provider: 'postgres',
              name: `PostgreSQL - ${postgresFormData.database}`,
              connected_at: new Date().toISOString(),
              details: { host: postgresFormData.host, database: postgresFormData.database },
          };
          saveConnection(connection);
          setDbTestStep('form');
          setDbTestResult(null);
          setCurrentStep(0);
          setSelectedSource('');
      };
      const box = 'mx-auto w-full max-w-lg transform rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl p-10 shadow-xl border border-slate-200/50 dark:border-slate-700/50';
      return (
          <div className={box}>
              <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-slate-800 dark:text-white">PostgreSQL</h3>
                  <Image src={logos.postgres} alt="PostgreSQL" width={56} height={56} unoptimized />
              </div>
              {/* Step indicator */}
              <div className="flex items-center gap-2 mb-6">
                  {['Credentials', 'Test', 'Ingest'].map((label, i) => {
                      const stepIdx = dbTestStep === 'form' ? 0 : dbTestStep === 'tested' ? 1 : 2;
                      return (
                          <div key={label} className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i <= stepIdx ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                                  {i < stepIdx ? <CheckCircle className="w-4 h-4" /> : i + 1}
                              </div>
                              <span className={`text-xs ${i <= stepIdx ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-slate-400 dark:text-slate-500'}`}>{label}</span>
                              {i < 2 && <div className={`w-6 h-0.5 ${i < stepIdx ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`} />}
                          </div>
                      );
                  })}
              </div>
              <form onSubmit={handleTest} className="space-y-4">
                  <Input label="Host" placeholder="ep-cool-dawn-123456.us-east-2.aws.neon.tech" helperText="Hostname or IP address of your PostgreSQL server (e.g. Neon, Supabase, RDS)" value={postgresFormData.host} onChange={(e) => setPostgresFormData((p) => ({ ...p, host: e.target.value }))} required disabled={loading || dbTestStep !== 'form'} />
                  <Input type="number" label="Port" placeholder="5432" helperText="Default: 5432. Supabase uses 6543 for pooled connections" value={String(postgresFormData.port)} onChange={(e) => setPostgresFormData((p) => ({ ...p, port: parseInt(e.target.value, 10) || 5432 }))} disabled={loading || dbTestStep !== 'form'} />
                  <Input label="Database" placeholder="neondb" helperText="The database name to connect to" value={postgresFormData.database} onChange={(e) => setPostgresFormData((p) => ({ ...p, database: e.target.value }))} required disabled={loading || dbTestStep !== 'form'} />
                  <Input label="User" placeholder="postgres" helperText="Database user with read access to the tables you want to ingest" value={postgresFormData.user} onChange={(e) => setPostgresFormData((p) => ({ ...p, user: e.target.value }))} required disabled={loading || dbTestStep !== 'form'} />
                  <Password label="Password" helperText="The password for the database user" value={postgresFormData.password} onChange={(e) => setPostgresFormData((p) => ({ ...p, password: e.target.value }))} disabled={loading || dbTestStep !== 'form'} />

                  {/* Test result banner */}
                  {dbTestResult && (
                      <div className={`rounded-lg p-3 text-sm flex items-start gap-2 ${dbTestResult.ok ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'}`}>
                          {dbTestResult.ok ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                          <div>
                              {dbTestResult.ok ? (
                                  <>
                                      <p className="font-medium">Connection successful ({dbTestResult.latency_ms}ms)</p>
                                      <p className="text-xs mt-1">{dbTestResult.version?.split(',')[0]}</p>
                                      <p className="text-xs">{dbTestResult.table_count} tables found in &quot;{dbTestResult.database}&quot;</p>
                                      {dbTestResult.tables && dbTestResult.tables.length > 0 && (
                                          <p className="text-xs mt-1 opacity-75">Tables: {dbTestResult.tables.slice(0, 10).join(', ')}{dbTestResult.tables.length > 10 ? ` +${dbTestResult.tables.length - 10} more` : ''}</p>
                                      )}
                                  </>
                              ) : (
                                  <p className="font-medium">{dbTestResult.message}</p>
                              )}
                          </div>
                      </div>
                  )}

                  {/* Buttons based on step */}
                  {dbTestStep === 'form' && (
                      <Button type="submit" className="w-full" disabled={loading}>
                          {loading ? 'Testing...' : 'Test Connection'}
                      </Button>
                  )}
                  {dbTestStep === 'tested' && dbTestResult?.ok && (
                      <div className="space-y-2">
                          <Button type="button" className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white" onClick={handleIngest} disabled={loading}>
                              Ingest to Snowflake
                          </Button>
                          <Button type="button" variant="outline" className="w-full" onClick={handleSaveOnly} disabled={loading}>
                              Save Connection (ingest later)
                          </Button>
                          <Button type="button" variant="text" className="w-full text-xs" onClick={() => { setDbTestStep('form'); setDbTestResult(null); }}>
                              Edit credentials
                          </Button>
                      </div>
                  )}
                  {dbTestStep === 'tested' && !dbTestResult?.ok && (
                      <Button type="button" className="w-full" onClick={() => { setDbTestStep('form'); setDbTestResult(null); }}>
                          Retry
                      </Button>
                  )}
                  {dbTestStep === 'ingesting' && (
                      <Button disabled className="w-full">Ingesting tables to Snowflake...</Button>
                  )}
              </form>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">Public tables will be copied to CP_DATA360.POSTGRES</p>
          </div>
      );
  };

  const renderMySQLForm = () => {
      const handleTest = async (e: FormEvent) => {
          e.preventDefault();
          setLoading(true);
          setDbTestResult(null);
          try {
              const result = await mysqlTest(mysqlFormData);
              setDbTestResult(result);
              setDbTestStep('tested');
              toast.success(`Connected — ${result.table_count} tables found (${result.latency_ms}ms)`);
          } catch (err: any) {
              const msg = extractErrorMsg(err);
              setDbTestResult({ ok: false, latency_ms: 0, message: msg });
              toast.error(msg);
          } finally {
              setLoading(false);
          }
      };
      const handleIngest = async () => {
          setLoading(true);
          setDbTestStep('ingesting');
          try {
              await mysqlIngest(mysqlFormData);
              toast.success('MySQL ingest completed. Tables in CP_DATA360.MYSQL');
              await loadConnections();
              const connection: DatalakeConnection = {
                  id: `mysql_${Date.now()}`,
                  provider: 'mysql',
                  name: `MySQL - ${mysqlFormData.database}`,
                  connected_at: new Date().toISOString(),
                  details: { host: mysqlFormData.host, database: mysqlFormData.database },
              };
              saveConnection(connection);
              setDbTestStep('form');
              setDbTestResult(null);
              setCurrentStep(0);
              setSelectedSource('');
          } catch (err: any) {
              toast.error(extractErrorMsg(err));
              setDbTestStep('tested');
          } finally {
              setLoading(false);
          }
      };
      const handleSaveOnly = async () => {
          toast.success('Connection saved. You can ingest later from Registered Connectors.');
          const connection: DatalakeConnection = {
              id: `mysql_${Date.now()}`,
              provider: 'mysql',
              name: `MySQL - ${mysqlFormData.database}`,
              connected_at: new Date().toISOString(),
              details: { host: mysqlFormData.host, database: mysqlFormData.database },
          };
          saveConnection(connection);
          setDbTestStep('form');
          setDbTestResult(null);
          setCurrentStep(0);
          setSelectedSource('');
      };
      const box = 'mx-auto w-full max-w-lg transform rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl p-10 shadow-xl border border-slate-200/50 dark:border-slate-700/50';
      return (
          <div className={box}>
              <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-slate-800 dark:text-white">MySQL</h3>
                  <Image src={logos.mysql} alt="MySQL" width={56} height={56} unoptimized />
              </div>
              {/* Step indicator */}
              <div className="flex items-center gap-2 mb-6">
                  {['Credentials', 'Test', 'Ingest'].map((label, i) => {
                      const stepIdx = dbTestStep === 'form' ? 0 : dbTestStep === 'tested' ? 1 : 2;
                      return (
                          <div key={label} className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i <= stepIdx ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                                  {i < stepIdx ? <CheckCircle className="w-4 h-4" /> : i + 1}
                              </div>
                              <span className={`text-xs ${i <= stepIdx ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-slate-400 dark:text-slate-500'}`}>{label}</span>
                              {i < 2 && <div className={`w-6 h-0.5 ${i < stepIdx ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`} />}
                          </div>
                      );
                  })}
              </div>
              <form onSubmit={handleTest} className="space-y-4">
                  <Input label="Host" placeholder="gateway01.us-east-1.prod.aws.tidbcloud.com" helperText="Hostname of your MySQL server (e.g. TiDB Cloud, Aiven, RDS, PlanetScale)" value={mysqlFormData.host} onChange={(e) => setMySQLFormData((p) => ({ ...p, host: e.target.value }))} required disabled={loading || dbTestStep !== 'form'} />
                  <Input type="number" label="Port" placeholder="3306" helperText="Default: 3306. TiDB Cloud uses port 4000" value={String(mysqlFormData.port)} onChange={(e) => setMySQLFormData((p) => ({ ...p, port: parseInt(e.target.value, 10) || 3306 }))} disabled={loading || dbTestStep !== 'form'} />
                  <Input label="Database" placeholder="test" helperText="The database name to connect to" value={mysqlFormData.database} onChange={(e) => setMySQLFormData((p) => ({ ...p, database: e.target.value }))} required disabled={loading || dbTestStep !== 'form'} />
                  <Input label="User" placeholder="root" helperText="Database user with read access to tables" value={mysqlFormData.user} onChange={(e) => setMySQLFormData((p) => ({ ...p, user: e.target.value }))} required disabled={loading || dbTestStep !== 'form'} />
                  <Password label="Password" helperText="The password for the database user" value={mysqlFormData.password} onChange={(e) => setMySQLFormData((p) => ({ ...p, password: e.target.value }))} disabled={loading || dbTestStep !== 'form'} />
                  <Checkbox label="Enable SSL/TLS" helperText="Required for cloud MySQL (TiDB, Aiven, RDS)" checked={mysqlFormData.ssl} onChange={(e) => setMySQLFormData((p) => ({ ...p, ssl: (e.target as HTMLInputElement).checked }))} disabled={loading || dbTestStep !== 'form'} />

                  {/* Test result banner */}
                  {dbTestResult && (
                      <div className={`rounded-lg p-3 text-sm flex items-start gap-2 ${dbTestResult.ok ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'}`}>
                          {dbTestResult.ok ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                          <div>
                              {dbTestResult.ok ? (
                                  <>
                                      <p className="font-medium">Connection successful ({dbTestResult.latency_ms}ms)</p>
                                      <p className="text-xs mt-1">{dbTestResult.version}</p>
                                      <p className="text-xs">{dbTestResult.table_count} tables found in &quot;{dbTestResult.database}&quot;</p>
                                      {dbTestResult.tables && dbTestResult.tables.length > 0 && (
                                          <p className="text-xs mt-1 opacity-75">Tables: {dbTestResult.tables.slice(0, 10).join(', ')}{dbTestResult.tables.length > 10 ? ` +${dbTestResult.tables.length - 10} more` : ''}</p>
                                      )}
                                  </>
                              ) : (
                                  <p className="font-medium">{dbTestResult.message}</p>
                              )}
                          </div>
                      </div>
                  )}

                  {dbTestStep === 'form' && (
                      <Button type="submit" className="w-full" disabled={loading}>
                          {loading ? 'Testing...' : 'Test Connection'}
                      </Button>
                  )}
                  {dbTestStep === 'tested' && dbTestResult?.ok && (
                      <div className="space-y-2">
                          <Button type="button" className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white" onClick={handleIngest} disabled={loading}>
                              Ingest to Snowflake
                          </Button>
                          <Button type="button" variant="outline" className="w-full" onClick={handleSaveOnly} disabled={loading}>
                              Save Connection (ingest later)
                          </Button>
                          <Button type="button" variant="text" className="w-full text-xs" onClick={() => { setDbTestStep('form'); setDbTestResult(null); }}>
                              Edit credentials
                          </Button>
                      </div>
                  )}
                  {dbTestStep === 'tested' && !dbTestResult?.ok && (
                      <Button type="button" className="w-full" onClick={() => { setDbTestStep('form'); setDbTestResult(null); }}>
                          Retry
                      </Button>
                  )}
                  {dbTestStep === 'ingesting' && (
                      <Button disabled className="w-full">Ingesting tables to Snowflake...</Button>
                  )}
              </form>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">Tables will be copied to CP_DATA360.MYSQL</p>
          </div>
      );
  };

  const renderSalesforceForm = () => {
      const handleSubmit = async (e: FormEvent) => {
          e.preventDefault();
          setLoading(true);
          try {
              await salesforceIngest(salesforceFormData);
              toast.success('Salesforce ingest completed. Objects in CP_DATA360.SALESFORCE');
              const connection: DatalakeConnection = {
                  id: `salesforce_${Date.now()}`,
                  provider: 'salesforce',
                  name: `Salesforce - ${salesforceFormData.instance_url}`,
                  connected_at: new Date().toISOString(),
                  details: { host: salesforceFormData.instance_url },
              };
              saveConnection(connection);
              setCurrentStep(0);
              setSelectedSource('');
          } catch (err: any) {
              toast.error(extractErrorMsg(err));
          } finally {
              setLoading(false);
          }
      };
      return (
          <div className="mx-auto w-full max-w-lg transform rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl p-10 shadow-xl border border-slate-200/50 dark:border-slate-700/50">
              <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-slate-800 dark:text-white">Salesforce</h3>
                  <Image src={logos.salesforce} alt="Salesforce" width={56} height={56} unoptimized />
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                  <Input label="Instance URL" placeholder="https://myorg.salesforce.com" helperText="Your Salesforce org URL (must start with https://)" value={salesforceFormData.instance_url} onChange={(e) => setSalesforceFormData((p) => ({ ...p, instance_url: e.target.value }))} required disabled={loading} />
                  <Input label="Client ID" helperText="From Setup → App Manager → Connected App → Consumer Key" value={salesforceFormData.client_id} onChange={(e) => setSalesforceFormData((p) => ({ ...p, client_id: e.target.value }))} required disabled={loading} />
                  <Password label="Client Secret" helperText="From Setup → App Manager → Connected App → Consumer Secret" value={salesforceFormData.client_secret} onChange={(e) => setSalesforceFormData((p) => ({ ...p, client_secret: e.target.value }))} required disabled={loading} />
                  <Input label="Username" helperText="Salesforce login email" value={salesforceFormData.username} onChange={(e) => setSalesforceFormData((p) => ({ ...p, username: e.target.value }))} required disabled={loading} />
                  <Password label="Security Token" helperText="From Settings → Reset My Security Token (check email)" value={salesforceFormData.security_token} onChange={(e) => setSalesforceFormData((p) => ({ ...p, security_token: e.target.value }))} disabled={loading} />
                  <Button type="submit" disabled={loading}>{loading ? 'Ingesting...' : 'Ingest to Snowflake'}</Button>
              </form>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Objects will be synced to CP_DATA360.SALESFORCE</p>
          </div>
      );
  };

  const renderSAPForm = () => {
      const handleSubmit = async (e: FormEvent) => {
          e.preventDefault();
          setLoading(true);
          try {
              await sapIngest(sapFormData);
              toast.success('SAP ingest completed. Tables in CP_DATA360.SAP');
              const connection: DatalakeConnection = {
                  id: `sap_${Date.now()}`,
                  provider: 'sap',
                  name: `SAP - ${sapFormData.system_id}`,
                  connected_at: new Date().toISOString(),
                  details: { host: sapFormData.host },
              };
              saveConnection(connection);
              setCurrentStep(0);
              setSelectedSource('');
          } catch (err: any) {
              toast.error(extractErrorMsg(err));
          } finally {
              setLoading(false);
          }
      };
      return (
          <div className="mx-auto w-full max-w-lg transform rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl p-10 shadow-xl border border-slate-200/50 dark:border-slate-700/50">
              <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-slate-800 dark:text-white">SAP</h3>
                  <Image src={logos.sap} alt="SAP" width={56} height={56} unoptimized />
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                  <Input label="Host" placeholder="sap-host.example.com" helperText="SAP application server hostname or IP" value={sapFormData.host} onChange={(e) => setSapFormData((p) => ({ ...p, host: e.target.value }))} required disabled={loading} />
                  <Input label="System ID (SID)" placeholder="PRD" helperText="3-character SAP System ID" value={sapFormData.system_id} onChange={(e) => setSapFormData((p) => ({ ...p, system_id: e.target.value }))} required disabled={loading} />
                  <Input label="Client" placeholder="100" helperText="SAP client number (e.g. 100, 200, 800)" value={sapFormData.client} onChange={(e) => setSapFormData((p) => ({ ...p, client: e.target.value }))} required disabled={loading} />
                  <Input label="Username" value={sapFormData.username} onChange={(e) => setSapFormData((p) => ({ ...p, username: e.target.value }))} required disabled={loading} />
                  <Password label="Password" value={sapFormData.password} onChange={(e) => setSapFormData((p) => ({ ...p, password: e.target.value }))} required disabled={loading} />
                  <Button type="submit" disabled={loading}>{loading ? 'Ingesting...' : 'Ingest to Snowflake'}</Button>
              </form>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Tables will be copied to CP_DATA360.SAP</p>
          </div>
      );
  };

  const renderOracleForm = () => {
      const handleTest = async (e: FormEvent) => {
          e.preventDefault();
          setLoading(true);
          setDbTestResult(null);
          try {
              const result = await oracleTest(oracleFormData);
              setDbTestResult(result);
              setDbTestStep('tested');
              toast.success(`Connected — ${result.table_count} tables found (${result.latency_ms}ms)`);
          } catch (err: any) {
              const msg = extractErrorMsg(err);
              setDbTestResult({ ok: false, latency_ms: 0, message: msg });
              toast.error(msg);
          } finally {
              setLoading(false);
          }
      };
      const handleIngest = async () => {
          setLoading(true);
          setDbTestStep('ingesting');
          try {
              await oracleIngest(oracleFormData);
              toast.success('Oracle ingest completed. Tables in CP_DATA360.ORACLE');
              const connection: DatalakeConnection = {
                  id: `oracle_${Date.now()}`,
                  provider: 'oracle',
                  name: `Oracle - ${oracleFormData.service_name}`,
                  connected_at: new Date().toISOString(),
                  details: { host: oracleFormData.host },
              };
              saveConnection(connection);
              setDbTestStep('form');
              setDbTestResult(null);
              setCurrentStep(0);
              setSelectedSource('');
          } catch (err: any) {
              toast.error(extractErrorMsg(err));
              setDbTestStep('tested');
          } finally {
              setLoading(false);
          }
      };
      const handleSaveOnly = async () => {
          toast.success('Connection saved. You can ingest later from Registered Connectors.');
          const connection: DatalakeConnection = {
              id: `oracle_${Date.now()}`,
              provider: 'oracle',
              name: `Oracle - ${oracleFormData.service_name}`,
              connected_at: new Date().toISOString(),
              details: { host: oracleFormData.host },
          };
          saveConnection(connection);
          setDbTestStep('form');
          setDbTestResult(null);
          setCurrentStep(0);
          setSelectedSource('');
      };
      const box = 'mx-auto w-full max-w-lg transform rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl p-10 shadow-xl border border-slate-200/50 dark:border-slate-700/50';
      return (
          <div className={box}>
              <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-slate-800 dark:text-white">Oracle Database</h3>
                  <Image src={logos.oracle} alt="Oracle" width={56} height={56} unoptimized />
              </div>
              {/* Step indicator */}
              <div className="flex items-center gap-2 mb-6">
                  {['Credentials', 'Test', 'Ingest'].map((label, i) => {
                      const stepIdx = dbTestStep === 'form' ? 0 : dbTestStep === 'tested' ? 1 : 2;
                      return (
                          <div key={label} className="flex items-center gap-2">
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i <= stepIdx ? 'bg-blue-600 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400'}`}>
                                  {i < stepIdx ? <CheckCircle className="w-4 h-4" /> : i + 1}
                              </div>
                              <span className={`text-xs ${i <= stepIdx ? 'text-blue-600 dark:text-blue-400 font-medium' : 'text-slate-400 dark:text-slate-500'}`}>{label}</span>
                              {i < 2 && <div className={`w-6 h-0.5 ${i < stepIdx ? 'bg-blue-600' : 'bg-slate-200 dark:bg-slate-700'}`} />}
                          </div>
                      );
                  })}
              </div>
              <form onSubmit={handleTest} className="space-y-4">
                  <Input label="Host" placeholder="adb.us-ashburn-1.oraclecloud.com" helperText="Oracle hostname from tnsnames.ora or OCI console" value={oracleFormData.host} onChange={(e) => setOracleFormData((p) => ({ ...p, host: e.target.value }))} required disabled={loading || dbTestStep !== 'form'} />
                  <Input type="number" label="Port" placeholder="1521" helperText="Default: 1521. Oracle Cloud ATP uses 1522 with TLS" value={String(oracleFormData.port)} onChange={(e) => setOracleFormData((p) => ({ ...p, port: parseInt(e.target.value, 10) || 1521 }))} disabled={loading || dbTestStep !== 'form'} />
                  <Input label="Service Name" placeholder="ORCL" helperText="Oracle TNS service name (not the SID) — find it in tnsnames.ora" value={oracleFormData.service_name} onChange={(e) => setOracleFormData((p) => ({ ...p, service_name: e.target.value }))} required disabled={loading || dbTestStep !== 'form'} />
                  <Input label="Username" placeholder="ADMIN" helperText="Database user with read access (e.g. ADMIN for Oracle Cloud)" value={oracleFormData.username} onChange={(e) => setOracleFormData((p) => ({ ...p, username: e.target.value }))} required disabled={loading || dbTestStep !== 'form'} />
                  <Password label="Password" helperText="The password for the database user" value={oracleFormData.password} onChange={(e) => setOracleFormData((p) => ({ ...p, password: e.target.value }))} disabled={loading || dbTestStep !== 'form'} />

                  {/* Test result banner */}
                  {dbTestResult && (
                      <div className={`rounded-lg p-3 text-sm flex items-start gap-2 ${dbTestResult.ok ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 text-green-800 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-800 dark:text-red-300'}`}>
                          {dbTestResult.ok ? <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" /> : <XCircle className="w-4 h-4 mt-0.5 shrink-0" />}
                          <div>
                              {dbTestResult.ok ? (
                                  <>
                                      <p className="font-medium">Connection successful ({dbTestResult.latency_ms}ms)</p>
                                      <p className="text-xs mt-1">{dbTestResult.version}</p>
                                      <p className="text-xs">{dbTestResult.table_count} tables found</p>
                                      {dbTestResult.tables && dbTestResult.tables.length > 0 && (
                                          <p className="text-xs mt-1 opacity-75">Tables: {dbTestResult.tables.slice(0, 10).join(', ')}{dbTestResult.tables.length > 10 ? ` +${dbTestResult.tables.length - 10} more` : ''}</p>
                                      )}
                                  </>
                              ) : (
                                  <p className="font-medium">{dbTestResult.message}</p>
                              )}
                          </div>
                      </div>
                  )}

                  {dbTestStep === 'form' && (
                      <Button type="submit" className="w-full" disabled={loading}>
                          {loading ? 'Testing...' : 'Test Connection'}
                      </Button>
                  )}
                  {dbTestStep === 'tested' && dbTestResult?.ok && (
                      <div className="space-y-2">
                          <Button type="button" className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white" onClick={handleIngest} disabled={loading}>
                              Ingest to Snowflake
                          </Button>
                          <Button type="button" variant="outline" className="w-full" onClick={handleSaveOnly} disabled={loading}>
                              Save Connection (ingest later)
                          </Button>
                          <Button type="button" variant="text" className="w-full text-xs" onClick={() => { setDbTestStep('form'); setDbTestResult(null); }}>
                              Edit credentials
                          </Button>
                      </div>
                  )}
                  {dbTestStep === 'tested' && !dbTestResult?.ok && (
                      <Button type="button" className="w-full" onClick={() => { setDbTestStep('form'); setDbTestResult(null); }}>
                          Retry
                      </Button>
                  )}
                  {dbTestStep === 'ingesting' && (
                      <Button disabled className="w-full">Ingesting tables to Snowflake...</Button>
                  )}
              </form>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">Tables will be copied to CP_DATA360.ORACLE</p>
          </div>
      );
  };

  const renderHubSpotForm = () => {
      const handleSubmit = async (e: FormEvent) => {
          e.preventDefault();
          setLoading(true);
          try {
              await hubspotIngest(hubspotFormData);
              toast.success('HubSpot ingest completed. Objects in CP_DATA360.HUBSPOT');
              const connection: DatalakeConnection = {
                  id: `hubspot_${Date.now()}`,
                  provider: 'hubspot',
                  name: `HubSpot`,
                  connected_at: new Date().toISOString(),
                  details: {},
              };
              saveConnection(connection);
              setCurrentStep(0);
              setSelectedSource('');
          } catch (err: any) {
              toast.error(extractErrorMsg(err));
          } finally {
              setLoading(false);
          }
      };
      return (
          <div className="mx-auto w-full max-w-lg transform rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl p-10 shadow-xl border border-slate-200/50 dark:border-slate-700/50">
              <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-slate-800 dark:text-white">HubSpot</h3>
                  <Image src={logos.hubspot} alt="HubSpot" width={56} height={56} unoptimized />
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                  <Password label="API Key" helperText="Private app access token from Settings → Integrations → Private Apps" value={hubspotFormData.api_key} onChange={(e) => setHubspotFormData((p) => ({ ...p, api_key: e.target.value }))} required disabled={loading} />
                  <Button type="submit" disabled={loading}>{loading ? 'Ingesting...' : 'Ingest to Snowflake'}</Button>
              </form>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Objects will be synced to CP_DATA360.HUBSPOT</p>
          </div>
      );
  };

  const renderServiceNowForm = () => {
      const handleSubmit = async (e: FormEvent) => {
          e.preventDefault();
          setLoading(true);
          try {
              await servicenowIngest(servicenowFormData);
              toast.success('ServiceNow ingest completed. Tables in CP_DATA360.SERVICENOW');
              const connection: DatalakeConnection = {
                  id: `servicenow_${Date.now()}`,
                  provider: 'servicenow',
                  name: `ServiceNow - ${servicenowFormData.instance_url}`,
                  connected_at: new Date().toISOString(),
                  details: { host: servicenowFormData.instance_url },
              };
              saveConnection(connection);
              setCurrentStep(0);
              setSelectedSource('');
          } catch (err: any) {
              toast.error(extractErrorMsg(err));
          } finally {
              setLoading(false);
          }
      };
      return (
          <div className="mx-auto w-full max-w-lg transform rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl p-10 shadow-xl border border-slate-200/50 dark:border-slate-700/50">
              <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-slate-800 dark:text-white">ServiceNow</h3>
                  <Image src={logos.servicenow} alt="ServiceNow" width={56} height={56} unoptimized />
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                  <Input label="Instance URL" placeholder="https://myorg.service-now.com" helperText="Your ServiceNow instance URL (must start with https://)" value={servicenowFormData.instance_url} onChange={(e) => setServicenowFormData((p) => ({ ...p, instance_url: e.target.value }))} required disabled={loading} />
                  <Input label="Username" helperText="ServiceNow admin user (default: admin on developer instances)" value={servicenowFormData.username} onChange={(e) => setServicenowFormData((p) => ({ ...p, username: e.target.value }))} required disabled={loading} />
                  <Password label="Password" helperText="Password for the ServiceNow user" value={servicenowFormData.password} onChange={(e) => setServicenowFormData((p) => ({ ...p, password: e.target.value }))} required disabled={loading} />
                  <Button type="submit" disabled={loading}>{loading ? 'Ingesting...' : 'Ingest to Snowflake'}</Button>
              </form>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Tables will be synced to CP_DATA360.SERVICENOW</p>
          </div>
      );
  };

  const renderCustomAPIForm = () => {
      const handleSubmit = async (e: FormEvent) => {
          e.preventDefault();
          setLoading(true);
          try {
              await customApiIngest({
                  base_url: customApiFormData.base_url,
                  auth_type: customApiFormData.auth_type,
                  auth_config: { token: customApiFormData.auth_token },
                  endpoints: [{ path: '/', method: 'GET', target_table: customApiFormData.target_table || 'API_DATA' }],
              });
              toast.success('API ingest completed. Data in CP_DATA360.CUSTOM_API');
              const connection: DatalakeConnection = {
                  id: `custom_api_${Date.now()}`,
                  provider: 'custom_api',
                  name: `API - ${customApiFormData.base_url}`,
                  connected_at: new Date().toISOString(),
                  details: { host: customApiFormData.base_url },
              };
              saveConnection(connection);
              setCurrentStep(0);
              setSelectedSource('');
          } catch (err: any) {
              toast.error(extractErrorMsg(err));
          } finally {
              setLoading(false);
          }
      };
      return (
          <div className="mx-auto w-full max-w-lg transform rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl p-10 shadow-xl border border-slate-200/50 dark:border-slate-700/50">
              <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-slate-800 dark:text-white">Custom REST API</h3>
                  <Image src={logos.custom_api} alt="API" width={56} height={56} unoptimized />
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                  <Input label="Base URL" placeholder="https://api.example.com/v1" helperText="REST API base URL (must start with https://)" value={customApiFormData.base_url} onChange={(e) => setCustomApiFormData((p) => ({ ...p, base_url: e.target.value }))} required disabled={loading} />
                  <div>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-200">Auth Type</label>
                      <select
                          value={customApiFormData.auth_type}
                          onChange={(e) => setCustomApiFormData((p) => ({ ...p, auth_type: e.target.value }))}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          disabled={loading}
                      >
                          <option value="bearer">Bearer Token</option>
                          <option value="basic">Basic Auth</option>
                          <option value="api_key">API Key</option>
                          <option value="oauth2">OAuth2</option>
                      </select>
                  </div>
                  <Password label="Auth Token / Key" helperText="Bearer token, API key, or OAuth2 credentials" value={customApiFormData.auth_token} onChange={(e) => setCustomApiFormData((p) => ({ ...p, auth_token: e.target.value }))} required disabled={loading} />
                  <Input label="Target Table Name" placeholder="API_DATA" helperText="Snowflake table name for ingested data (uppercase)" value={customApiFormData.target_table} onChange={(e) => setCustomApiFormData((p) => ({ ...p, target_table: e.target.value }))} disabled={loading} />
                  <Button type="submit" disabled={loading}>{loading ? 'Ingesting...' : 'Ingest to Snowflake'}</Button>
              </form>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">Data will be ingested to CP_DATA360.CUSTOM_API</p>
          </div>
      );
  };

  // ── My Data Tab: Registered connectors + active connections ──
  const renderMyDataTab = () => {
      const totalSources = registeredConnectors.length + activeConnections.length;
      const totalActive = registeredConnectors.filter(c => c.STATUS === 'ACTIVE').length + activeConnections.length;
      return (
          <div className="space-y-6">
              {/* Summary KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                      { label: 'Data Sources', value: totalSources, color: 'blue', icon: <Database className="w-4 h-4" /> },
                      { label: 'Active', value: totalActive, color: 'green', icon: <CheckCircle className="w-4 h-4" /> },
                      { label: 'Errors', value: registeredConnectors.filter(c => c.STATUS === 'ERROR').length, color: 'red', icon: <XCircle className="w-4 h-4" /> },
                      { label: 'Expiring', value: expiringCredentials.length, color: 'amber', icon: <AlertTriangle className="w-4 h-4" /> },
                  ].map((kpi) => (
                      <div key={kpi.label} className="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700">
                          <div className="flex items-center gap-2 mb-1">
                              <span className={`text-${kpi.color}-500`}>{kpi.icon}</span>
                              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{kpi.label}</span>
                          </div>
                          <p className="text-2xl font-bold text-slate-900 dark:text-white">{kpi.value}</p>
                      </div>
                  ))}
              </div>

              {/* Expiring credentials warning */}
              {expiringCredentials.length > 0 && (
                  <div className="flex items-start gap-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 p-4">
                      <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <div>
                          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                              {expiringCredentials.length} credential{expiringCredentials.length > 1 ? 's' : ''} expiring soon
                          </p>
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                              {expiringCredentials.map(c => `${c.CONNECTOR_NAME} (${c.CREDENTIAL_KEY}: ${c.DAYS_UNTIL_EXPIRY}d)`).join(', ')}
                          </p>
                      </div>
                  </div>
              )}

              {/* Registered Connectors */}
              {registeredConnectors.length > 0 ? (
                  <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm rounded-2xl border border-slate-200/60 dark:border-slate-700/60 p-6">
                      <div className="flex items-center justify-between mb-6">
                          <h3 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                              <Database className="h-5 w-5 text-blue-500" />
                              External Connectors
                          </h3>
                          <Button size="sm" onClick={() => setConnectPageTab('connect')} className="bg-blue-600 hover:bg-blue-700 text-white">
                              <Plus className="h-4 w-4 mr-1" /> Add Source
                          </Button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                          {registeredConnectors.map((conn) => {
                              const connLogo = logos[conn.CONNECTOR_TYPE?.toLowerCase()] || logos.custom_api;
                              const expiring = expiringCredentials.find(c => c.CONNECTOR_ID === conn.CONNECTOR_ID);
                              const configHost = (conn.CONFIG as any)?.host || (conn.CONFIG as any)?.instance_url || (conn.CONFIG as any)?.base_url;
                              return (
                                  <div key={conn.CONNECTOR_ID} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 hover:shadow-md transition-shadow">
                                      {/* Header */}
                                      <div className="flex items-center justify-between mb-3">
                                          <div className="flex items-center gap-2 min-w-0">
                                              <Image src={connLogo} alt={conn.CONNECTOR_TYPE} width={28} height={28} unoptimized className="rounded shrink-0" />
                                              <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">{conn.CONNECTOR_NAME}</span>
                                          </div>
                                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${
                                              conn.STATUS === 'ACTIVE' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' :
                                              conn.STATUS === 'ERROR' ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' :
                                              conn.STATUS === 'EXPIRED' ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400' :
                                              'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                          }`}>
                                              {conn.STATUS === 'ACTIVE' && <CheckCircle className="w-3 h-3" />}
                                              {conn.STATUS === 'ERROR' && <XCircle className="w-3 h-3" />}
                                              {conn.STATUS === 'EXPIRED' && <Clock className="w-3 h-3" />}
                                              {conn.STATUS}
                                          </span>
                                      </div>

                                      {/* Data metrics bar */}
                                      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mb-3 pb-3 border-b border-slate-100 dark:border-slate-800">
                                          <div className="flex items-center gap-1">
                                              <Database className="w-3 h-3" />
                                              <span className="font-medium text-slate-700 dark:text-slate-300">{conn.TABLES_SYNCED}</span> tables
                                          </div>
                                          <div>
                                              <span className="font-medium text-slate-700 dark:text-slate-300">{conn.ROWS_SYNCED?.toLocaleString()}</span> rows
                                          </div>
                                          {conn.LAST_SYNC_AT && (
                                              <div className="ml-auto text-[10px]">
                                                  {new Date(conn.LAST_SYNC_AT).toLocaleDateString()}
                                              </div>
                                          )}
                                      </div>

                                      {/* Metadata */}
                                      <div className="mb-3 space-y-1 text-[11px] text-slate-400 dark:text-slate-500">
                                          {conn.TARGET_SCHEMA && (
                                              <div className="flex items-center gap-1">
                                                  <span className="text-slate-500 dark:text-slate-400">Target:</span>
                                                  <span className="font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 px-1.5 py-0.5 rounded">{conn.TARGET_SCHEMA}</span>
                                              </div>
                                          )}
                                          {configHost && (
                                              <div className="truncate">
                                                  <span className="text-slate-500 dark:text-slate-400">Host:</span>{' '}
                                                  <span className="text-slate-600 dark:text-slate-300">{String(configHost).replace(/^https?:\/\//, '')}</span>
                                              </div>
                                          )}
                                          {conn.CREATED_BY && (
                                              <div>by <span className="text-slate-600 dark:text-slate-300">{conn.CREATED_BY}</span>{conn.CREATED_AT ? ` on ${new Date(conn.CREATED_AT).toLocaleDateString()}` : ''}</div>
                                          )}
                                          {conn.LAST_SYNC_STATUS && conn.LAST_SYNC_STATUS !== 'SUCCESS' && (
                                              <div className="text-red-500 dark:text-red-400 font-medium">Last sync: {conn.LAST_SYNC_STATUS}</div>
                                          )}
                                          {expiring && (
                                              <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                                  <AlertTriangle className="w-3 h-3" />
                                                  Credential expires in {expiring.DAYS_UNTIL_EXPIRY}d
                                              </div>
                                          )}
                                      </div>

                                      {/* Type badge */}
                                      <div className="flex items-center gap-2 mb-3">
                                          <Badge size="sm" className="bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-[10px]">{conn.CONNECTOR_TYPE}</Badge>
                                      </div>

                                      {/* Actions */}
                                      <div className="grid grid-cols-2 gap-2">
                                          <button
                                              onClick={() => handleTestConnection(conn.CONNECTOR_ID)}
                                              disabled={testingConnector === conn.CONNECTOR_ID}
                                              className="text-center text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                                          >
                                              {testingConnector === conn.CONNECTOR_ID ? 'Testing...' : 'Test'}
                                          </button>
                                          <button
                                              onClick={async () => {
                                                  try {
                                                      setLoading(true);
                                                      toast.loading('Ingesting data...', { id: `ingest-${conn.CONNECTOR_ID}` });
                                                      const result = await ingestFromConnector(conn.CONNECTOR_ID);
                                                      toast.success(`Ingest complete: ${result.tables_count || 0} tables, ${result.rows_total?.toLocaleString() || 0} rows`, { id: `ingest-${conn.CONNECTOR_ID}` });
                                                      const refreshed = await listRegisteredConnectors();
                                                      setRegisteredConnectors(refreshed);
                                                  } catch (err: any) {
                                                      toast.error(extractErrorMsg(err), { id: `ingest-${conn.CONNECTOR_ID}` });
                                                  } finally {
                                                      setLoading(false);
                                                  }
                                              }}
                                              disabled={loading}
                                              className="text-center text-xs font-medium rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 px-3 py-2 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors disabled:opacity-50"
                                          >
                                              {loading ? 'Syncing...' : 'Sync Now'}
                                          </button>
                                      </div>
                                  </div>
                              );
                          })}
                      </div>
                  </div>
              ) : activeConnections.length === 0 && (
                  <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm rounded-2xl border border-slate-200/60 dark:border-slate-700/60 p-12 text-center">
                      <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-700 mb-4">
                          <Database className="h-8 w-8 text-slate-400 dark:text-slate-500" />
                      </div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No data sources yet</h3>
                      <p className="text-sm text-slate-500 dark:text-slate-400 mb-6 max-w-md mx-auto">
                          Connect your first data source to start ingesting data into your Snowflake warehouse.
                      </p>
                      <Button onClick={() => setConnectPageTab('connect')} className="bg-blue-600 hover:bg-blue-700 text-white">
                          <Plus className="h-4 w-4 mr-2" /> Add Your First Connection
                      </Button>
                  </div>
              )}

              {/* Active session connections */}
              {activeConnections.length > 0 && (
                  <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm rounded-2xl border border-slate-200/60 dark:border-slate-700/60 p-6">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
                          Active Sessions ({activeConnections.length})
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
                          {activeConnections.map((conn) => (
                              <div key={conn.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:shadow-sm transition-shadow">
                                  <Image src={logos[conn.provider]} alt={conn.provider} width={24} height={24} className="rounded shrink-0" unoptimized={logos[conn.provider]?.endsWith('.svg')} />
                                  <div className="min-w-0 flex-1">
                                      <p className="text-xs font-medium text-slate-900 dark:text-white truncate">{conn.name}</p>
                                      <p className="text-[10px] text-slate-400 dark:text-slate-500">{new Date(conn.connected_at).toLocaleDateString()}</p>
                                  </div>
                                  <div className="flex items-center gap-1 shrink-0">
                                      <button onClick={() => { setConnectPageTab('explorer'); browseConnection(conn); }} className="text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300" title="Browse data">
                                          <FolderOpen className="w-3.5 h-3.5" />
                                      </button>
                                      <button onClick={() => { removeConnection(conn.id); toast.success('Session removed'); }} className="text-red-400 hover:text-red-600 dark:text-red-500 dark:hover:text-red-400" title="Remove">
                                          <HiOutlineTrash className="w-3.5 h-3.5" />
                                      </button>
                                  </div>
                              </div>
                          ))}
                      </div>
                  </div>
              )}
          </div>
      );
  };

  const renderForm = () => {
        // Show datalake browser if connected (from connect flow)
        if (showDatalakeBrowser && connectedProvider) {
            return (
                <DatalakeBrowser
                    provider={connectedProvider}
                    onBack={handleBackToProviderSelection}
                />
            );
        }

        if (currentStep === 0) {
            return (
                <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm rounded-3xl border border-slate-200/60 dark:border-slate-700/60 shadow-xl p-8">
                    <div className="space-y-6 text-center mb-12">
                        <div className="mb-8 inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-600 shadow-2xl shadow-blue-500/25">
                            <Database className="h-10 w-10 text-white" />
                        </div>
                        <h2 className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 bg-clip-text text-4xl font-bold text-transparent dark:from-white dark:via-slate-200 dark:to-slate-300">
                            Choose Your Data Platform
                        </h2>
                        <p className="mx-auto max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-400">
                            Select a cloud data platform to establish secure, high-performance connections for your analytics workflows
                        </p>
                    </div>

                    {/* Active Connections - Tab-Based View */}
                    {activeConnections.length > 0 && (
                        <div className="mb-12">
                            <div className="flex items-center justify-between mb-6">
                                <h3 className="text-xl font-semibold text-slate-900 dark:text-white flex items-center">
                                    <Database className="h-6 w-6 mr-2 text-green-600" />
                                    Connected Data Sources
                                </h3>
                                <Badge className="bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 border border-green-300 dark:border-green-700">
                                    {activeConnections.length} Active
                                </Badge>
                            </div>

                            {/* Tab Navigation */}
                            <div className="border-b border-slate-200 dark:border-slate-700 mb-6">
                                <div className="flex space-x-1 overflow-x-auto">
                                    {activeConnections.map((conn) => (
                                        <button
                                            key={conn.id}
                                            onClick={() => browseConnection(conn)}
                                            className={`relative px-6 py-3 text-sm font-medium transition-all duration-200 whitespace-nowrap flex items-center space-x-2 border-b-2 ${
                                                activeConnectionId === conn.id
                                                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20'
                                                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                            }`}
                                        >
                                            <Database className="h-4 w-4 opacity-80" />
                                            <span>{conn.name}</span>
                                        </button>
                    {/* Data Source Cards — grouped by category */}
                    <div className="mx-auto max-w-6xl space-y-10">
                        {dataSourceGroups.map((group) => (
                            <div key={group.label}>
                                <div className="mb-4 flex items-center gap-3">
                                    <Badge className={group.direction === 'inbound' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'}>
                                        {group.direction === 'inbound' ? 'Inbound' : 'Outbound'}
                                    </Badge>
                                    <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200">{group.label}</h3>
                                    <span className="text-xs text-slate-400 dark:text-slate-500">
                                        {group.direction === 'inbound' ? 'Data INTO Snowflake' : 'Data FROM Snowflake'}
                                    </span>
                                </div>
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                                    {group.sources.map((source) => (
                                        <DataSourceCard
                                            key={source.id}
                                            name={source.name}
                                            icon={source.icon}
                                            description={source.description}
                                            isSelected={selectedSource === source.id}
                                            comingSoon={source.comingSoon}
                                            onClick={() => {
                                                if (source.comingSoon) {
                                                    toast('This connector will be available soon.', { icon: '🔜' });
                                                    return;
                                                }
                                                handleSourceSelect(source.id);
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>

                            {/* Tab Content — Browser when a connection is selected, Quick Access otherwise */}
                            {showDatalakeBrowser && connectedProvider ? (
                                <DatalakeBrowser
                                    provider={connectedProvider}
                                    onBack={() => {
                                        setShowDatalakeBrowser(false);
                                        setConnectedProvider(null);
                                        setActiveConnectionId(null);
                                    }}
                                />
                            ) : (
                            <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800/50 dark:to-slate-900/50 rounded-xl p-6 border border-slate-200 dark:border-slate-700">
                                <div className="space-y-4">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h4 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                                                Quick Access
                                            </h4>
                                            <Text className="text-sm text-slate-600 dark:text-slate-400">
                                                Click on a connection tab above to browse its stages and files
                                            </Text>
                                        </div>
                                        <Button
                                            onClick={() => setShowAddConnection(!showAddConnection)}
                                            className="bg-blue-600 hover:bg-blue-700 text-white"
                                        >
                                            <HiOutlineCloudArrowUp className="h-4 w-4 mr-2" />
                                            {showAddConnection ? 'Hide' : 'Add Connection'}
                                        </Button>
                                    </div>

                                    {/* Connection Summary Grid */}
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
                                        {activeConnections.map((conn) => (
                                            <div
                                                key={conn.id}
                                                className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow cursor-pointer"
                                                onClick={() => browseConnection(conn)}
                                            >
                                                <div className="flex items-center space-x-3 mb-3">
                                                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600">
                                                        <Database className="h-5 w-5 text-white" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h5 className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                                                            {conn.name}
                                                        </h5>
                                                        <Text className="text-xs text-slate-500 dark:text-slate-400">
                                                            Stage
                                                        </Text>
                                                    </div>
                                                </div>
                                                <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                                                    {conn.database_name && (
                                                        <div className="flex items-center">
                                                            <span className="font-medium mr-1">Database:</span>
                                                            <span className="truncate">{conn.database_name}</span>
                                                        </div>
                                                    )}
                                                    {conn.schema_name && (
                                                        <div className="flex items-center">
                                                            <span className="font-medium mr-1">Schema:</span>
                                                            <span className="truncate">{conn.schema_name}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex items-center text-green-600 dark:text-green-400 mt-2">
                                                        <div className="h-2 w-2 rounded-full bg-green-500 mr-2 animate-pulse"></div>
                                                        <span>Active</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                            )}

                            <div className="mt-6 border-t border-slate-200 dark:border-slate-700"></div>
                        </div>
                    )}

                    {/* Header - Conditionnel selon si on a des connexions */}
                    {(activeConnections.length === 0 || showAddConnection) && (
                        <>
                            <div className="space-y-6 text-center mb-12">
                                <div className="mb-8 inline-flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 via-indigo-600 to-purple-600 shadow-2xl shadow-blue-500/25">
                                    <Database className="h-10 w-10 text-white" />
                                </div>
                                <h2 className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-700 bg-clip-text text-4xl font-bold text-transparent dark:from-white dark:via-slate-200 dark:to-slate-300">
                                    {activeConnections.length > 0 ? 'Add Another Connection' : 'Choose Your Data Platform'}
                                </h2>
                                <p className="mx-auto max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-400">
                                    Select a cloud data platform to establish secure, high-performance connections for your analytics workflows
                    {/* Features */}
                    <div className="mx-auto mt-16 grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">
                        {[
                            {
                                icon: <HiOutlineCloudArrowUp className="h-6 w-6" />,
                                title: 'Secure Upload',
                                description: 'End-to-end encryption for all data transfers',
                            },
                            {
                                icon: <HiOutlineShieldCheck className="h-6 w-6" />,
                                title: 'Compliance Ready',
                                description: 'GDPR, SOC 2, and other compliance standards',
                            },
                            {
                                icon: <Database className="h-6 w-6" />,
                                title: 'Real-time Sync',
                                description: 'Automatic data synchronization and updates',
                            },
                        ].map((feature, index) => (
                            <div
                                key={index}
                                className="rounded-xl border border-slate-200/50 bg-white/30 p-6 text-center backdrop-blur-sm dark:border-slate-700/50 dark:bg-slate-800/30"
                            >
                                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                    {feature.icon}
                                </div>
                                <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">
                                    {feature.title}
                                </h3>
                                <p className="text-sm text-slate-600 dark:text-slate-400">
                                    {feature.description}
                                </p>
                            </div>
                        ))}
                    </div>
                </div>
            );
        }

        if (currentStep === 1) {
            switch (selectedSource) {
                case 'azure':
                    return (
                        <div className="mx-auto max-w-2xl space-y-8">
                            <Breadcrumb onHomeClick={() => router.push(routes.home)} />
                            <StepIndicator currentStep={azureCurrentSubStep} totalSteps={showAzureNotificationOption ? 5 : 4} />
                            {renderAzureForm()}
                        </div>
                    );
                case 'aws':
                    return (
                        <div className="mx-auto max-w-2xl space-y-8">
                            <Breadcrumb onHomeClick={() => router.push(routes.home)} />
                            <StepIndicator currentStep={awsCurrentSubStep} totalSteps={3} />
                            {renderAwsForm()}
                        </div>
                    );
                case 'gcs':
                case 'gcp':
                    return (
                        <div className="mx-auto max-w-2xl space-y-8">
                            <Breadcrumb onHomeClick={() => router.push(routes.home)} />
                            <StepIndicator currentStep={gcsCurrentSubStep} totalSteps={3} />
                            {renderGcsForm()}
                            {renderGcpForm()}
                        </div>
                    );
                case 'snowflake':
                    return (
                        <div className="mx-auto max-w-2xl space-y-8">
                            <Breadcrumb onHomeClick={() => router.push(routes.home)} />
                            {renderSnowflakeForm()}
                        </div>
                    );
                case 'databricks':
                    return (
                        <div className="mx-auto max-w-2xl space-y-8">
                            <Breadcrumb onHomeClick={() => router.push(routes.home)} />
                            {renderDatabricksForm()}
                        </div>
                    );
                case 'iceberg':
                    return (
                        <div className="mx-auto max-w-2xl space-y-8">
                            <Breadcrumb onHomeClick={() => router.push(routes.home)} />
                            {renderIcebergForm()}
                        </div>
                    );
                case 'postgres':
                    return (
                        <div className="mx-auto max-w-2xl space-y-8">
                            <Breadcrumb onHomeClick={() => router.push(routes.home)} />
                            {renderPostgresForm()}
                        </div>
                    );
                case 'mysql':
                    return (
                        <div className="mx-auto max-w-2xl space-y-8">
                            <Breadcrumb onHomeClick={() => router.push(routes.home)} />
                            {renderMySQLForm()}
                        </div>
                    );
                case 'salesforce':
                    return (
                        <div className="mx-auto max-w-2xl space-y-8">
                            <Breadcrumb onHomeClick={() => router.push(routes.home)} />
                            {renderSalesforceForm()}
                        </div>
                    );
                case 'sap':
                    return (
                        <div className="mx-auto max-w-2xl space-y-8">
                            <Breadcrumb onHomeClick={() => router.push(routes.home)} />
                            {renderSAPForm()}
                        </div>
                    );
                case 'oracle':
                    return (
                        <div className="mx-auto max-w-2xl space-y-8">
                            <Breadcrumb onHomeClick={() => router.push(routes.home)} />
                            {renderOracleForm()}
                        </div>
                    );
                case 'hubspot':
                    return (
                        <div className="mx-auto max-w-2xl space-y-8">
                            <Breadcrumb onHomeClick={() => router.push(routes.home)} />
                            {renderHubSpotForm()}
                        </div>
                    );
                case 'servicenow':
                    return (
                        <div className="mx-auto max-w-2xl space-y-8">
                            <Breadcrumb onHomeClick={() => router.push(routes.home)} />
                            {renderServiceNowForm()}
                        </div>
                    );
                case 'custom_api':
                    return (
                        <div className="mx-auto max-w-2xl space-y-8">
                            <Breadcrumb onHomeClick={() => router.push(routes.home)} />
                            {renderCustomAPIForm()}
                        </div>
                    );
                default:
                    return null;
            }
        }
        return null;
    };

    // Show loading state while checking authentication
    if (false) {
        return (
            <div className="flex justify-center items-center min-h-[400px]">
                <Loader size="xl" />
            </div>
        );
    }

    // Don't render anything if unauthenticated or no permission (redirect will happen in useEffect).
    // Use hasToken (synchronous) as fallback while useAuth() is still settling on first render.
    if ((!isAuthenticated && !hasToken) || !canManageConnections) {
        return null;
    }

    const showHeaderBack = currentStep === 1 || showDatalakeBrowser;

    return (
        <div className="space-y-8">
            <Breadcrumb onHomeClick={() => router.push(routes.home)} />

            {/* Page Header */}
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center space-x-4 flex-1 min-w-0">
                    {showHeaderBack && (
                        <Button
                            variant="outline"
                            onClick={handleBackToProviderSelection}
                            disabled={loading}
                            className="shrink-0 border-slate-300 dark:border-slate-600"
                            title="Back to Data Source Selection"
                            aria-label="Back to Data Source Selection"
                        >
                            <ArrowLeft className="w-4 h-4 mr-2" />
                            Back
                        </Button>
                    )}
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shrink-0">
                        <Database className="w-6 h-6 text-white" />
                    </div>
                    <div className="min-w-0">
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                            Data Source Connection
                        </h1>
                        <p className="text-slate-600 dark:text-slate-400 truncate">
                            {selectedSource
                                ? `Configure your ${dataSources.find(s => s.id === selectedSource)?.name} connection`
                                : "Connect and integrate your data sources with powerful cloud platforms"
                            }
                        </p>
                    </div>
                </div>

                {selectedSource && !showHeaderBack && (
                    <div className="flex items-center space-x-3">
                        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                            {dataSources.find(s => s.id === selectedSource)?.name}
                        </Badge>
                    </div>
                )}
            </div>

            {/* Top-Level Tab Navigation */}
            <div className="border-b border-slate-200 dark:border-slate-700">
                <div className="flex space-x-1 overflow-x-auto">
                    {[
                        { id: 'connectors' as const, label: 'My Data', icon: <BarChart3 className="h-4 w-4" />, badge: registeredConnectors.length > 0 ? registeredConnectors.length : undefined },
                        { id: 'connect' as const, label: 'New Connection', icon: <Plus className="h-4 w-4" /> },
                        { id: 'explorer' as const, label: 'Data Explorer', icon: <Search className="h-4 w-4" /> },
                        { id: 'automation' as const, label: 'Automation', icon: <Zap className="h-4 w-4" /> },
                        { id: 'provisioning' as const, label: 'Provisioning', icon: <Database className="h-4 w-4" /> },
                    ].map((tab) => (
                        <button
                            key={tab.id}
                            onClick={() => {
                                setConnectPageTab(tab.id);
                                if (tab.id === 'explorer' && activeConnections.length > 0 && !showDatalakeBrowser) {
                                    browseConnection(activeConnections[0]);
                                }
                            }}
                            className={`relative flex items-center space-x-2 px-5 py-3 text-sm font-medium transition-all duration-200 whitespace-nowrap border-b-2 ${
                                connectPageTab === tab.id
                                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20'
                                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                            }`}
                        >
                            {tab.icon}
                            <span>{tab.label}</span>
                            {'badge' in tab && tab.badge && (
                                <span className="ml-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/40 px-1.5 text-[10px] font-bold text-blue-700 dark:text-blue-300">
                                    {tab.badge}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* Tab Content */}
            {connectPageTab === 'connect' && (
                <div className="animate-fade-in-up">{renderForm()}</div>
            )}
            {connectPageTab === 'connectors' && (
                <div className="animate-fade-in-up">{renderMyDataTab()}</div>
            )}
            {connectPageTab === 'explorer' && (
                <div className="animate-fade-in-up">
                    {showDatalakeBrowser && connectedProvider === 'databricks' ? (
                        <div>
                            <Button variant="outline" size="sm" className="mb-4" onClick={() => { setShowDatalakeBrowser(false); setConnectedProvider(null); }}>
                                <ArrowLeft className="h-4 w-4 mr-2" /> Back to Sources
                            </Button>
                            <DatabricksProvisionTab />
                        </div>
                    ) : showDatalakeBrowser && connectedProvider ? (
                        <DatalakeBrowser provider={connectedProvider} onBack={() => { setShowDatalakeBrowser(false); setConnectedProvider(null); }} />
                    ) : (
                        <div className="space-y-6">
                            {/* Quick access to browse connections */}
                            {activeConnections.length > 0 && (
                                <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm rounded-2xl border border-slate-200/60 dark:border-slate-700/60 p-6">
                                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                                        <FolderOpen className="h-5 w-5 text-blue-500" />
                                        Browse Connected Sources
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                        {activeConnections.map((conn) => (
                                            <button
                                                key={conn.id}
                                                onClick={() => browseConnection(conn)}
                                                className="flex items-center gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:shadow-md hover:border-blue-300 dark:hover:border-blue-600 transition-all text-left"
                                            >
                                                <Image src={logos[conn.provider]} alt={conn.provider} width={28} height={28} className="rounded" unoptimized={logos[conn.provider]?.endsWith('.svg')} />
                                                <div className="min-w-0">
                                                    <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{conn.name}</p>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400">Browse stages & files</p>
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                            <SourceCatalog />
                        </div>
                    )}
                </div>
            )}
            {connectPageTab === 'automation' && (
                <AutomationTab />
            )}
            {connectPageTab === 'provisioning' && (
                <ProvisioningTab />
            )}
        </div>
    );
}
