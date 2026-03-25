'use client';

import { useState, useMemo, FormEvent, ChangeEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Input, Button, Checkbox, Text, Password, Badge, Tooltip } from 'rizzui';
import Image from 'next/image';
import toast from 'react-hot-toast';
import {
  HiOutlineCloudArrowUp,
  HiOutlineShieldCheck,
  HiOutlineCheckCircle,
  HiOutlineExclamationCircle
} from 'react-icons/hi2';
import { Database, ArrowLeft } from 'lucide-react';
import ErrorBoundary from '@/components/ui/ErrorBoundary';
import { ROLE_PERMISSIONS } from '@/config/constants';
import { routes } from '@/config/routes';

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
    postgresIngest,
    mysqlIngest,
    databricksTest,
    databricksCatalogs,
    databricksSchemas,
    databricksTables,
    databricksIngest,
    icebergTest,
    icebergNamespaces,
    icebergTables,
    icebergIngest,
    oracleTest,
    oracleIngest,
    oracleSampleStage,
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
          <button type="button" onClick={onHomeClick} className="cursor-pointer transition-colors hover:text-slate-900 dark:hover:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 rounded">
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
                  : 'bg-slate-200 text-slate-500 dark:bg-slate-700'
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
    name: string;
    schema_name?: string;
    database_name?: string;
    connector_type?: string | null;
};

export default function DataSourceConnectionPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [showDatalakeBrowser, setShowDatalakeBrowser] = useState<boolean>(false);
  const [connectedProvider, setConnectedProvider] = useState<'snowflake' | 'azure' | 'aws' | 'gcs' | 'databricks' | 'iceberg' | 'postgres' | 'mysql' | 'oracle' | null>(null);
  const [activeConnectionId, setActiveConnectionId] = useState<string | null>(null);
  const [activeConnections, setActiveConnections] = useState<StageConnection[]>([]);
  const [connectionsLoading, setConnectionsLoading] = useState<boolean>(false);
  const [errorMessages, setErrorMessages] = useState<string[]>([]); // État persistant pour les erreurs
  const [showAddConnection, setShowAddConnection] = useState<boolean>(false); // Contrôle affichage section Add Connection

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

  const logos: Record<string, string> = useMemo(() => ({
      s3: '/data-sources/aws-s3.png',
      snowflake: '/data-sources/snowflake-logo.png',
      azure: '/data-sources/azure-logo.png',
      aws: '/data-sources/aws-s3.png',
      gcs: '/data-sources/gcs-logo.svg',
      databricks: '/data-sources/databricks-logo.svg',
      iceberg: '/data-sources/iceberg-logo.svg',
      postgres: '/data-sources/postgres-logo.svg',
      mysql: '/data-sources/mysql-logo.svg',
      oracle: '/data-sources/oracle-logo.svg',
  }), []);

  const dataSources = useMemo(() => [
    {
      id: 'snowflake',
      name: 'Snowflake',
      icon: '/data-sources/snowflake-logo.png',
      description: 'Cloud data platform for data warehousing and analytics',
    },
    {
      id: 'azure',
      name: 'Azure Blob Storage',
      icon: '/data-sources/azure-logo.png',
      description: 'Microsoft cloud storage solution for big data and analytics',
    },
    {
      id: 'aws',
      name: 'Amazon S3',
      icon: '/data-sources/aws-s3.png',
      description: 'Amazon Simple Storage Service for scalable cloud storage',
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
    },
    {
      id: 'iceberg',
      name: 'Apache Iceberg',
      icon: '/data-sources/iceberg-logo.svg',
      description: 'Open table format for large analytic datasets',
    },
    {
      id: 'postgres',
      name: 'PostgreSQL',
      icon: '/data-sources/postgres-logo.svg',
      description: 'Open-source relational database',
    },
    {
      id: 'mysql',
      name: 'MySQL',
      icon: '/data-sources/mysql-logo.svg',
      description: 'Popular open-source relational database',
    },
    {
      id: 'oracle',
      name: 'Oracle ATP',
      icon: '/data-sources/oracle-logo.svg',
      description: 'Oracle Autonomous Database — Always Free cloud tier',
    },
  ] as { id: string; name: string; icon: string; description: string; comingSoon?: boolean }[], []);

  // Memoize selected source lookup (avoids .find() on every render)
  const selectedSourceInfo = useMemo(
    () => dataSources.find(s => s.id === selectedSource),
    [dataSources, selectedSource]
  );

  // Check user permissions
  const userRole = session?.user?.role as keyof typeof ROLE_PERMISSIONS;
  const canManageConnections = userRole && ROLE_PERMISSIONS[userRole]?.modules?.includes(1);

  // Redirect if no permission
  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      router.push(routes.signIn);
      return;
    }
    if (!canManageConnections) {
      toast.error('You do not have permission to manage data source connections');
      router.push('/access-denied');
    }
  }, [status, canManageConnections, router]);

  // Load stages from backend API
  const loadConnections = async () => {
    setConnectionsLoading(true);
    try {
      const response = await listSnowflakeStages();
      // Support both old format (response.stages) and new paginated format (response.data)
      const stages: any[] = Array.isArray(response?.stages) ? response.stages
        : Array.isArray(response?.data) ? response.data
        : Array.isArray(response) ? response : [];
      const connections: StageConnection[] = stages
        .filter((s: any) => !s.error)
        .map((s: any) => ({
          id: s.name ?? s.stage_name ?? String(s),
          name: s.name ?? s.stage_name ?? String(s),
          schema_name: s.schema_name,
          database_name: s.database_name,
          connector_type: s.connector_type || null,
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
    setConnectedProvider('snowflake');
    // For non-STAGING schemas, use fully qualified name so backend resolves correctly
    const stageId = connection.schema_name && connection.schema_name !== 'STAGING'
        ? `${connection.database_name}.${connection.schema_name}.${connection.name}`
        : connection.id;
    setActiveConnectionId(stageId);
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
      setDatabricksFormData({ host: '', http_path: '', access_token: '', catalog: '', schema_name: '', tables: [] });
      setDatabricksStep('connect');
      setIcebergFormData({ uri: '', warehouse: '', credential: '', namespace: '', tables: [] });
      setIcebergStep('connect');
      setPostgresFormData({ host: '', port: 5432, database: '', user: '', password: '' });
      setMySQLFormData({ host: '', port: 3306, database: '', user: '', password: '' });
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
          const errorMsg = error.message || 'An unexpected error occurred.';
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
              // console.log('Notification Integration Details:', response);
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
          const errorMsg = error.message || 'An unexpected error occurred.';
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
    host: '', port: 3306, database: '', user: '', password: '',
  });

  const [oracleFormData, setOracleFormData] = useState({
    host: 'adb.eu-paris-1.oraclecloud.com',
    port: 1522,
    service_name: 'g9bbeb1dc290c07_data360_medium.adb.oraclecloud.com',
    username: 'ADMIN',
    password: 'Henuch*1991!',
    connection_mode: 'tls' as 'standard' | 'tls' | 'wallet',
    wallet_path: '',
    wallet_password: '',
  });
  const [oracleTestResult, setOracleTestResult] = useState<{ ok?: boolean; version?: string; table_count?: number; tables?: string[]; latency_ms?: number } | null>(null);

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
          const errorMsg = error.message || 'An unexpected error occurred.';
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
          const errorMsg = error.message || 'An unexpected error occurred.';
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
                              placeholder="Your Azure Tenant ID"
                              value={azureFormData.tenant_id}
                              onChange={(e) => handleChange(e, 'azure')}
                              required
                              disabled={azureStorageIntegrationCreated || loading}
                              className="w-full"
                          />
                          <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Azure Storage URL
                              </label>
                              <Input
                                  name="storage_url"
                                  placeholder="azure://<account_name>.blob.core.windows.net/<container>"
                                  value={azureFormData.storage_url}
                                  onChange={(e) => handleChange(e, 'azure')}
                                  required
                                  disabled={azureStorageIntegrationCreated || loading}
                                  className="w-full"
                                  pattern="^azure://[a-z0-9]+\.blob\.core\.windows\.net/.+"
                                  title="Format: azure://<account>.blob.core.windows.net/<container>"
                              />
                              <Text className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                  Format: azure://account_name.blob.core.windows.net/container_name
                              </Text>
                          </div>
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
                                              className="block text-blue-600 hover:underline break-all text-base font-medium"
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
                                      placeholder="azure://<account_name>.queue.core.windows.net/<queue_name>"
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
                                              className="block text-blue-600 hover:underline break-all text-base font-medium"
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
                              value={awsFormData.aws_role_arn}
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
                  {gcsCurrentSubStep === 1 && (
                      <>
                          <h4 className="text-xl font-medium text-gray-800 dark:text-gray-200">Step 1: Storage Integration</h4>
                          <Input
                              name="integration_name"
                              label="Integration Name"
                              placeholder="e.g., GCS_MY_DATALAKE"
                              value={gcsFormData.integration_name}
                              onChange={(e) => handleChange(e, 'gcs')}
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
                              required
                              disabled={gcsIntegrationCreated || loading}
                              className="w-full"
                          />
                          {!gcsIntegrationCreated && (
                              <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 shadow-elevation-2 hover:shadow-elevation-3 transition-all duration-300 transform hover:scale-[1.02]" disabled={loading}>
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
                              required
                              disabled={loading}
                              className="w-full"
                          />
                          <Text className="text-sm text-gray-600 dark:text-gray-400">
                              Bucket: <strong>{gcsFormData.bucket_name}</strong> &middot; Integration: <strong>{gcsFormData.integration_name}</strong>
                          </Text>
                          <Input
                              name="prefix"
                              label="Path Prefix (optional)"
                              placeholder="e.g., raw/2024/"
                              value={gcsFormData.prefix}
                              onChange={(e) => handleChange(e, 'gcs')}
                              disabled={loading}
                              className="w-full"
                          />
                          <Checkbox
                              name="load_data"
                              label="Load data into tables after stage creation"
                              checked={gcsFormData.load_data}
                              onChange={(e) => handleChange(e, 'gcs')}
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
                      value={snowflakeFormData.datalake_password}
                      onChange={(e) => handleChange(e, 'snowflake')}
                      required
                      disabled={snowflakeConnected || loading}
                      className="w-full"
                  />
                  <Input
                      name="datalake_account"
                      label="Datalake Account"
                      placeholder="e.g., your_account.region"
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
              toast.error(err?.message || 'Connection failed');
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
              toast.error(err?.message || 'Failed to list schemas');
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
              toast.error(err?.message || 'Failed to list tables');
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
              toast.error(err?.message || 'Ingest failed');
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
                      <Input label="Workspace host" placeholder="adb-xxx.azuredatabricks.net" value={databricksFormData.host} onChange={(e) => setDatabricksFormData((p) => ({ ...p, host: e.target.value }))} required disabled={loading} />
                      <Input label="HTTP path (SQL warehouse)" placeholder="/sql/1.0/..." value={databricksFormData.http_path} onChange={(e) => setDatabricksFormData((p) => ({ ...p, http_path: e.target.value }))} required disabled={loading} />
                      <Password label="Access token" value={databricksFormData.access_token} onChange={(e) => setDatabricksFormData((p) => ({ ...p, access_token: e.target.value }))} required disabled={loading} />
                      <Button type="submit" disabled={loading}>{loading ? 'Testing...' : 'Test & list catalogs'}</Button>
                  </form>
              </div>
          );
      }
      if (databricksStep === 'catalog') {
          return (
              <div className={box}>
                  <h3 className="text-xl font-semibold mb-4">Select catalog</h3>
                  <div className="space-y-2">
                      {databricksCatalogsList.map((c) => (
                          <button key={c} type="button" onClick={() => handleDbxSelectCatalog(c)} className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">{c}</button>
                      ))}
                  </div>
                  <Button className="mt-4" variant="outline" onClick={() => setDatabricksStep('connect')} title="Back"><ArrowLeft className="w-4 h-4 mr-2" />Back</Button>
              </div>
          );
      }
      if (databricksStep === 'schema') {
          return (
              <div className={box}>
                  <h3 className="text-xl font-semibold mb-4">Select schema</h3>
                  <div className="space-y-2">
                      {databricksSchemasList.map((s) => (
                          <button key={s} type="button" onClick={() => handleDbxSelectSchema(s)} className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">{s}</button>
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
                  <h3 className="text-xl font-semibold mb-2">Select tables to ingest (or leave empty for all)</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Data will be copied to Snowflake schema CP_DATA360.DATABRICKS</p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                      {databricksTablesList.map((t) => (
                          <label key={t} className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={databricksFormData.tables.includes(t)} onChange={() => toggle(t)} />
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
              toast.error(err?.message || 'Connection failed');
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
              toast.error(err?.message || 'Ingest failed');
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
                      <Input label="REST catalog URI" placeholder="http://host:8181" value={icebergFormData.uri} onChange={(e) => setIcebergFormData((p) => ({ ...p, uri: e.target.value }))} required disabled={loading} />
                      <Input label="Warehouse (optional)" value={icebergFormData.warehouse} onChange={(e) => setIcebergFormData((p) => ({ ...p, warehouse: e.target.value }))} disabled={loading} />
                      <Password label="Credential (optional)" value={icebergFormData.credential} onChange={(e) => setIcebergFormData((p) => ({ ...p, credential: e.target.value }))} disabled={loading} />
                      <Button type="submit" disabled={loading}>{loading ? 'Testing...' : 'Test & list namespaces'}</Button>
                  </form>
              </div>
          );
      }
      if (icebergStep === 'namespace') {
          return (
              <div className={box}>
                  <h3 className="text-xl font-semibold mb-4">Select namespace</h3>
                  <div className="space-y-2">
                      {icebergNamespacesList.map((n) => (
                          <button key={n} type="button" onClick={() => handleIceSelectNamespace(n)} className="w-full text-left px-4 py-3 rounded-lg border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800">{n}</button>
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
                  <h3 className="text-xl font-semibold mb-2">Select tables to ingest (or leave empty for all)</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Data will be copied to Snowflake schema CP_DATA360.ICEBERG</p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                      {icebergTablesList.map((t) => (
                          <label key={t} className="flex items-center gap-2 cursor-pointer">
                              <input type="checkbox" checked={icebergFormData.tables.includes(t)} onChange={() => toggle(t)} />
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
      const handleSubmit = async (e: FormEvent) => {
          e.preventDefault();
          setLoading(true);
          try {
              await postgresIngest(postgresFormData);
              toast.success('PostgreSQL ingest completed. Tables in CP_DATA360.POSTGRES');
              await loadConnections();
              setCurrentStep(0);
              setSelectedSource('');
          } catch (err: any) {
              toast.error(err?.message || 'Ingest failed');
          } finally {
              setLoading(false);
          }
      };
      return (
          <div className="mx-auto w-full max-w-lg transform rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl p-10 shadow-xl border border-slate-200/50 dark:border-slate-700/50">
              <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-slate-800 dark:text-white">PostgreSQL</h3>
                  <Image src={logos.postgres} alt="PostgreSQL" width={56} height={56} unoptimized />
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                  <Input label="Host" value={postgresFormData.host} onChange={(e) => setPostgresFormData((p) => ({ ...p, host: e.target.value }))} required disabled={loading} />
                  <Input type="number" label="Port" value={String(postgresFormData.port)} onChange={(e) => setPostgresFormData((p) => ({ ...p, port: parseInt(e.target.value, 10) || 5432 }))} disabled={loading} />
                  <Input label="Database" value={postgresFormData.database} onChange={(e) => setPostgresFormData((p) => ({ ...p, database: e.target.value }))} required disabled={loading} />
                  <Input label="User" value={postgresFormData.user} onChange={(e) => setPostgresFormData((p) => ({ ...p, user: e.target.value }))} required disabled={loading} />
                  <Password label="Password" value={postgresFormData.password} onChange={(e) => setPostgresFormData((p) => ({ ...p, password: e.target.value }))} disabled={loading} />
                  <Button type="submit" disabled={loading}>{loading ? 'Ingesting...' : 'Ingest to Snowflake'}</Button>
              </form>
              <p className="text-xs text-slate-500 mt-2">Public tables will be copied to CP_DATA360.POSTGRES</p>
          </div>
      );
  };

  const renderMySQLForm = () => {
      const handleSubmit = async (e: FormEvent) => {
          e.preventDefault();
          setLoading(true);
          try {
              await mysqlIngest(mysqlFormData);
              toast.success('MySQL ingest completed. Tables in CP_DATA360.MYSQL');
              await loadConnections();
              setCurrentStep(0);
              setSelectedSource('');
          } catch (err: any) {
              toast.error(err?.message || 'Ingest failed');
          } finally {
              setLoading(false);
          }
      };
      return (
          <div className="mx-auto w-full max-w-lg transform rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl p-10 shadow-xl border border-slate-200/50 dark:border-slate-700/50">
              <div className="mb-6 flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-slate-800 dark:text-white">MySQL</h3>
                  <Image src={logos.mysql} alt="MySQL" width={56} height={56} unoptimized />
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                  <Input label="Host" value={mysqlFormData.host} onChange={(e) => setMySQLFormData((p) => ({ ...p, host: e.target.value }))} required disabled={loading} />
                  <Input type="number" label="Port" value={String(mysqlFormData.port)} onChange={(e) => setMySQLFormData((p) => ({ ...p, port: parseInt(e.target.value, 10) || 3306 }))} disabled={loading} />
                  <Input label="Database" value={mysqlFormData.database} onChange={(e) => setMySQLFormData((p) => ({ ...p, database: e.target.value }))} required disabled={loading} />
                  <Input label="User" value={mysqlFormData.user} onChange={(e) => setMySQLFormData((p) => ({ ...p, user: e.target.value }))} required disabled={loading} />
                  <Password label="Password" value={mysqlFormData.password} onChange={(e) => setMySQLFormData((p) => ({ ...p, password: e.target.value }))} disabled={loading} />
                  <Button type="submit" disabled={loading}>{loading ? 'Ingesting...' : 'Ingest to Snowflake'}</Button>
              </form>
              <p className="text-xs text-slate-500 mt-2">Tables will be copied to CP_DATA360.MYSQL</p>
          </div>
      );
  };

  const renderOracleForm = () => {
      const handleTest = async () => {
          setLoading(true);
          setOracleTestResult(null);
          try {
              const result = await oracleTest(oracleFormData);
              setOracleTestResult(result);
              toast.success(`Connected! ${result.table_count || 0} tables found (${result.latency_ms || 0}ms)`);
          } catch (err: any) {
              toast.error(err?.message || 'Connection failed');
              setOracleTestResult({ ok: false });
          } finally {
              setLoading(false);
          }
      };
      const handleIngest = async (e: FormEvent) => {
          e.preventDefault();
          setLoading(true);
          try {
              const tables = oracleTestResult?.tables || undefined;
              const result = await oracleIngest({ ...oracleFormData, tables });
              toast.success(`Oracle ingest complete: ${result.tables_count} tables, ${result.rows_total} rows`);
              await loadConnections();
              setCurrentStep(0);
              setSelectedSource('');
              setOracleTestResult(null);
          } catch (err: any) {
              toast.error(err?.message || 'Ingest failed');
          } finally {
              setLoading(false);
          }
      };
      const SAMPLE_PRESETS = {
          data360_atp: {
              label: 'Data360 ATP (eu-paris-1)',
              host: 'adb.eu-paris-1.oraclecloud.com',
              port: 1522,
              service_name: 'g9bbeb1dc290c07_data360_medium.adb.oraclecloud.com',
              username: 'ADMIN',
              password: 'Henuch*1991!',
              connection_mode: 'tls' as const,
          },
          custom: {
              label: 'Custom Connection',
              host: '', port: 1521, service_name: '', username: '', password: '',
              connection_mode: 'standard' as const,
          },
      };
      const applySample = (key: keyof typeof SAMPLE_PRESETS) => {
          const p = SAMPLE_PRESETS[key];
          setOracleFormData((prev) => ({ ...prev, ...p }));
          setOracleTestResult(null);
      };
      return (
          <div className="mx-auto w-full max-w-lg transform rounded-2xl bg-white/70 dark:bg-slate-800/70 backdrop-blur-xl p-10 shadow-xl border border-slate-200/50 dark:border-slate-700/50">
              <div className="mb-6 flex items-center justify-between">
                  <div>
                      <h3 className="text-2xl font-bold text-slate-800 dark:text-white">Oracle ATP</h3>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Autonomous Database — Always Free</p>
                  </div>
                  <Image src={logos.oracle} alt="Oracle" width={56} height={56} unoptimized />
              </div>

              {/* Sample presets */}
              <div className="mb-5 rounded-lg bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3">
                  <p className="text-xs font-medium text-blue-700 dark:text-blue-300 mb-2">Quick Connect — Sample Connections</p>
                  <div className="flex gap-2">
                      <button type="button" onClick={() => applySample('data360_atp')}
                          className="flex-1 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors">
                          Data360 ATP (Free)
                      </button>
                      <button type="button" onClick={() => applySample('custom')}
                          className="flex-1 rounded-md bg-slate-200 dark:bg-slate-600 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-300 dark:hover:bg-slate-500 transition-colors">
                          Custom
                      </button>
                  </div>
              </div>

              <form onSubmit={handleIngest} className="space-y-4">
                  <Input label="Host" value={oracleFormData.host} onChange={(e) => setOracleFormData((p) => ({ ...p, host: e.target.value }))} required disabled={loading} />
                  <div className="grid grid-cols-3 gap-3">
                      <Input type="number" label="Port" value={String(oracleFormData.port)} onChange={(e) => setOracleFormData((p) => ({ ...p, port: parseInt(e.target.value, 10) || 1522 }))} disabled={loading} />
                      <div className="col-span-2">
                          <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Mode</label>
                          <select value={oracleFormData.connection_mode}
                              onChange={(e) => setOracleFormData((p) => ({ ...p, connection_mode: e.target.value as any }))}
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-700 dark:text-white"
                              disabled={loading}>
                              <option value="tls">TLS (Autonomous DB)</option>
                              <option value="wallet">Wallet (mTLS)</option>
                              <option value="standard">Standard (on-prem)</option>
                          </select>
                      </div>
                  </div>
                  <Input label="Service Name" value={oracleFormData.service_name} onChange={(e) => setOracleFormData((p) => ({ ...p, service_name: e.target.value }))} required disabled={loading} />
                  <div className="grid grid-cols-2 gap-3">
                      <Input label="Username" value={oracleFormData.username} onChange={(e) => setOracleFormData((p) => ({ ...p, username: e.target.value }))} required disabled={loading} />
                      <Password label="Password" value={oracleFormData.password} onChange={(e) => setOracleFormData((p) => ({ ...p, password: e.target.value }))} disabled={loading} />
                  </div>
                  {oracleFormData.connection_mode === 'wallet' && (
                      <div className="grid grid-cols-2 gap-3">
                          <Input label="Wallet Path" value={oracleFormData.wallet_path} onChange={(e) => setOracleFormData((p) => ({ ...p, wallet_path: e.target.value }))} placeholder="/path/to/wallet" disabled={loading} />
                          <Password label="Wallet Password" value={oracleFormData.wallet_password} onChange={(e) => setOracleFormData((p) => ({ ...p, wallet_password: e.target.value }))} disabled={loading} />
                      </div>
                  )}

                  {/* Test result */}
                  {oracleTestResult && (
                      <div className={`rounded-lg p-3 text-sm ${oracleTestResult.ok ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'}`}>
                          {oracleTestResult.ok ? (
                              <div>
                                  <div className="flex items-center gap-2 font-medium"><HiOutlineCheckCircle className="h-4 w-4" /> Connected</div>
                                  <p className="mt-1 text-xs">{oracleTestResult.version}</p>
                                  <p className="text-xs">{oracleTestResult.table_count} tables — {oracleTestResult.latency_ms}ms</p>
                                  {oracleTestResult.tables && oracleTestResult.tables.length > 0 && (
                                      <div className="mt-2 flex flex-wrap gap-1">
                                          {oracleTestResult.tables.map((t) => (
                                              <Badge key={t} size="sm" className="bg-emerald-100 dark:bg-emerald-800/30 text-emerald-700 dark:text-emerald-300">{t}</Badge>
                                          ))}
                                      </div>
                                  )}
                              </div>
                          ) : (
                              <div>
                                  <div className="flex items-center gap-2"><HiOutlineExclamationCircle className="h-4 w-4" /> Connection failed</div>
                                  <p className="mt-1 text-xs opacity-75">If using TLS mode, ensure mTLS is disabled in Oracle Console (Network &gt; Mutual TLS &gt; uncheck)</p>
                              </div>
                          )}
                      </div>
                  )}

                  <div className="flex gap-3">
                      <Button type="button" variant="outline" onClick={handleTest} disabled={loading} className="flex-1">
                          {loading && !oracleTestResult ? 'Testing...' : 'Test Connection'}
                      </Button>
                      <Button type="submit" disabled={loading || !oracleTestResult?.ok} className="flex-1">
                          {loading ? 'Ingesting...' : 'Ingest to Snowflake'}
                      </Button>
                  </div>
              </form>

              {/* Sample stage — works without Oracle connection */}
              <div className="mt-5 pt-5 border-t border-slate-200 dark:border-slate-700">
                  <div className="rounded-lg bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 mb-3">
                      <p className="text-xs font-medium text-amber-700 dark:text-amber-300">No Oracle connection? Load sample data directly into Snowflake:</p>
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">3 tables: CUSTOMERS (10), ORDERS (15), PRODUCTS (10) — Data360 sample dataset</p>
                  </div>
                  <Button
                      type="button"
                      variant="outline"
                      className="w-full text-sm border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20"
                      disabled={loading}
                      onClick={async () => {
                          setLoading(true);
                          try {
                              const result = await oracleSampleStage();
                              toast.success(`Sample data loaded: ${result.total_rows} rows across ${result.tables?.length} tables → ${result.target_schema}`);
                              setOracleTestResult({ ok: true, table_count: result.tables?.length, tables: result.tables?.map((t) => t.name) });
                          } catch (err: any) {
                              toast.error(err?.message || 'Sample stage load failed');
                          } finally {
                              setLoading(false);
                          }
                      }}
                  >
                      <HiOutlineCloudArrowUp className="h-4 w-4 mr-2" />
                      Load Sample CSVs to Snowflake Stage
                  </Button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">Tables will be loaded to CP_DATA360.ORACLE_SAMPLE schema</p>
          </div>
      );
  };

  const showHeaderBack = useMemo(
    () => currentStep === 1 || showDatalakeBrowser,
    [currentStep, showDatalakeBrowser]
  );

  // Memoize features list (static content, avoids re-creating array on every render)
  const features = useMemo(() => [
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
  ], []);

  const renderForm = () => {
        if (currentStep === 0) {
            return (
                <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm rounded-3xl border border-slate-200/60 dark:border-slate-700/60 shadow-xl p-8">

                    {/* Loading skeleton for connections */}
                    {connectionsLoading && activeConnections.length === 0 && (
                        <div className="mb-12 space-y-4">
                            <div className="h-6 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                {[1, 2, 3].map((i) => (
                                    <div key={i} className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                                        <div className="flex items-center gap-3 mb-3">
                                            <div className="h-10 w-10 rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse" />
                                            <div className="space-y-2 flex-1">
                                                <div className="h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                                                <div className="h-3 w-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                                            </div>
                                        </div>
                                        <div className="h-3 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

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
                                            {conn.connector_type ? (
                                                <Image src={logos[conn.connector_type] || '/data-sources/snowflake-logo.png'} alt={conn.connector_type} width={16} height={16} unoptimized className="opacity-80" />
                                            ) : (
                                                <Database className="h-4 w-4 opacity-80" />
                                            )}
                                            <span>{conn.name}</span>
                                            {conn.connector_type && (
                                                <Badge size="sm" className="text-[10px] bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300">{conn.connector_type.toUpperCase()}</Badge>
                                            )}
                                        </button>
                                    ))}
                                </div>
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

                    {/* Empty state CTA when no connections exist and not loading */}
                    {activeConnections.length === 0 && !connectionsLoading && (
                        <div className="text-center py-12 mb-8 rounded-2xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50/50 dark:bg-slate-800/30">
                            <div className="inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg mb-4">
                                <Database className="h-8 w-8 text-white" />
                            </div>
                            <p className="text-lg font-semibold text-slate-900 dark:text-white mb-2">No connections configured yet</p>
                            <p className="text-slate-500 dark:text-slate-400 mb-6 max-w-md mx-auto">
                                Connect your first data source to start building analytics workflows and exploring your data
                            </p>
                            <button
                                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-lg shadow-blue-500/25"
                                onClick={() => {
                                    const cardsSection = document.getElementById('data-source-cards');
                                    cardsSection?.scrollIntoView({ behavior: 'smooth' });
                                }}
                            >
                                <HiOutlineCloudArrowUp className="h-5 w-5 inline mr-2" />
                                Create First Connection
                            </button>
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
                                </p>
                            </div>

                            {/* Data Source Cards */}
                            <div id="data-source-cards" className="mx-auto grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                                {dataSources.map((source) => (
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

                            {/* Features */}
                            <div className="mx-auto mt-16 grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">
                                {features.map((feature, index) => (
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
                        </>
                    )}
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
                    return (
                        <div className="mx-auto max-w-2xl space-y-8">
                            <Breadcrumb onHomeClick={() => router.push(routes.home)} />
                            <StepIndicator currentStep={gcsCurrentSubStep} totalSteps={3} />
                            {renderGcsForm()}
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
                case 'oracle':
                    return (
                        <div className="mx-auto max-w-2xl space-y-8">
                            <Breadcrumb onHomeClick={() => router.push(routes.home)} />
                            {renderOracleForm()}
                        </div>
                    );
                default:
                    return null;
            }
        }
        return null;
    };

    // Show skeleton layout while checking authentication
    if (status === 'loading') {
        return (
            <div className="space-y-6 p-6">
                {/* Header skeleton */}
                <div className="flex items-center space-x-4">
                    <div className="h-12 w-12 rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse" />
                    <div className="space-y-2">
                        <div className="h-8 w-64 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                        <div className="h-4 w-96 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                    </div>
                </div>
                {/* Connection cards skeleton */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2, 3, 4, 5, 6].map(i => (
                        <div key={i} className="rounded-2xl border-2 border-gray-200 dark:border-gray-700 p-8 space-y-4">
                            <div className="flex justify-center">
                                <div className="h-16 w-16 rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse" />
                            </div>
                            <div className="h-5 w-32 mx-auto bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                            <div className="h-4 w-48 mx-auto bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                        </div>
                    ))}
                </div>
                {/* Features skeleton */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-8">
                    {[1, 2, 3].map(i => (
                        <div key={i} className="rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-3">
                            <div className="h-12 w-12 mx-auto rounded-xl bg-gray-200 dark:bg-gray-700 animate-pulse" />
                            <div className="h-4 w-24 mx-auto bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                            <div className="h-3 w-40 mx-auto bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Don't render anything if unauthenticated or no permission (redirect will happen in useEffect)
    if (status === 'unauthenticated' || !canManageConnections) {
        return null;
    }

    return (
      <ErrorBoundary>
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
                                ? `Configure your ${selectedSourceInfo?.name} connection`
                                : "Connect and integrate your data sources with powerful cloud platforms"
                            }
                        </p>
                    </div>
                </div>

                {selectedSource && !showHeaderBack && (
                    <div className="flex items-center space-x-3">
                        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                            {selectedSourceInfo?.name}
                        </Badge>
                    </div>
                )}
            </div>

            <div className="animate-fade-in-up">{renderForm()}</div>

            {/* Related Modules */}
            <div className="mt-6 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span>Related:</span>
              <a href="/explore-design" className="text-blue-600 dark:text-blue-400 hover:underline">Explore & Design (Model Sources)</a>
              <a href="/workflow" className="text-blue-600 dark:text-blue-400 hover:underline">Workflow (Ingest Pipelines)</a>
            </div>
        </div>
      </ErrorBoundary>
    );
}
