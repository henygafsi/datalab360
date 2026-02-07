'use client';

import { useState, FormEvent, ChangeEvent, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Input, Button, Checkbox, Text, Password, Badge, Tooltip } from 'rizzui';
import Image from 'next/image';
import toast from 'react-hot-toast';
import {
  HiOutlineCloudArrowUp,
  HiOutlineShieldCheck,
  HiOutlineCheckCircle,
  HiOutlineTrash,
  HiOutlineExclamationCircle
} from 'react-icons/hi2';
import { Database, ArrowLeft } from 'lucide-react';
import { ROLE_PERMISSIONS } from '@/config/constants';
import { routes } from '@/config/routes';

// Import the new connection services from the same folder
import {
    setupAzureStorageIntegration,
    setupAzureNotificationIntegration,
    createAzureStage,
    setupAwsStorageIntegration,
    createAwsStage,
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
    external_id: string;
    stage_name: string;
    load_data: boolean;
    auto_update: boolean;
};

type SnowflakeFormData = {
    datalake_username: string;
    datalake_password: string;
    datalake_account: string;
    datalake_role: string;
};

type DatalakeConnection = {
    id: string;
    provider: 'snowflake' | 'azure' | 'aws' | 'databricks' | 'iceberg' | 'postgres' | 'mysql';
    name: string;
    connected_at: string;
    details: {
        username?: string;
        account?: string;
        tenant_id?: string;
        bucket_name?: string;
        integration_name?: string;
        stage_name?: string;
        host?: string;
        catalog?: string;
        uri?: string;
        namespace?: string;
        database?: string;
    };
};

export default function DataSourceConnectionPage() {
  const router = useRouter();
  const { data: session, status } = useSession();
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  const [showDatalakeBrowser, setShowDatalakeBrowser] = useState<boolean>(false);
  const [connectedProvider, setConnectedProvider] = useState<'snowflake' | 'azure' | 'aws' | 'databricks' | 'iceberg' | 'postgres' | 'mysql' | null>(null);
  const [activeConnections, setActiveConnections] = useState<DatalakeConnection[]>([]);
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
      external_id: '',
      stage_name: '',
      load_data: false,
      auto_update: false,
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
      databricks: '/data-sources/databricks-logo.svg',
      iceberg: '/data-sources/iceberg-logo.svg',
      postgres: '/data-sources/postgres-logo.svg',
      mysql: '/data-sources/mysql-logo.svg',
  };

  const dataSources: { id: string; name: string; icon: string; description: string; comingSoon?: boolean }[] = [
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
  ];

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

  // Load connections from localStorage only (no mock/static list; connections are created by user via form + API)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('datalake_connections');
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as DatalakeConnection[];
          setActiveConnections(Array.isArray(parsed) ? parsed : []);
        } catch (e) {
          console.error('Failed to parse stored connections', e);
        }
      }
    }
  }, []);

  const saveConnection = (connection: DatalakeConnection) => {
    const updated = [...activeConnections, connection];
    setActiveConnections(updated);
    if (typeof window !== 'undefined') {
      localStorage.setItem('datalake_connections', JSON.stringify(updated));
    }
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
      // Reset specific form data when going back to selection
      setAzureFormData({
          storage_integration_name: '', notification_integration_name: '', tenant_id: '', storage_url: '', queue_url: '',
          stage_name: '', load_data: true, auto_update: false // Reset load_data to true
      });
      setAwsFormData({
          integration_name: '', bucket_name: '', aws_role_arn: '', external_id: '',
          stage_name: '', load_data: false, auto_update: false
      });
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

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>, provider: 'azure' | 'aws' | 'snowflake') => {
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
                  try {
                      if (typeof window !== 'undefined') {
                          window.localStorage.setItem('features.datalakeConnected', '1');
                          window.dispatchEvent(new Event('app:refresh-menu'));
                      }
                  } catch {}
                  try { await silentReauth(); } catch {}
                  // Show browser instead of going back to selection
                  setConnectedProvider('azure');
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

              // Save connection
              const connection: DatalakeConnection = {
                  id: `azure_${Date.now()}`,
                  provider: 'azure',
                  name: `Azure - ${azureFormData.stage_name}`,
                  connected_at: new Date().toISOString(),
                  details: {
                      tenant_id: azureFormData.tenant_id,
                      integration_name: azureFormData.storage_integration_name,
                      stage_name: azureFormData.stage_name,
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

              // Show browser instead of redirecting for consistency
              setConnectedProvider('azure');
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

  const handleAwsSubmit = async (e: FormEvent) => {
      e.preventDefault();
      setLoading(true);
      try {
          if (awsCurrentSubStep === 1) {
              await setupAwsStorageIntegration(
                  awsFormData.integration_name,
                  awsFormData.bucket_name,
                  awsFormData.aws_role_arn,
                  awsFormData.external_id
              );
              setAwsIntegrationCreated(true);
              toast.success('AWS Storage Integration created successfully!');
              setAwsCurrentSubStep(2);
          } else if (awsCurrentSubStep === 2) {
              await createAwsStage(
                  awsFormData.stage_name,
                  awsFormData.bucket_name,
                  awsFormData.integration_name,
                  awsFormData.load_data,
                  awsFormData.auto_update
              );
              toast.success('AWS Stage created successfully!');

              // Save connection
              const connection: DatalakeConnection = {
                  id: `aws_${Date.now()}`,
                  provider: 'aws',
                  name: `AWS - ${awsFormData.stage_name}`,
                  connected_at: new Date().toISOString(),
                  details: {
                      bucket_name: awsFormData.bucket_name,
                      integration_name: awsFormData.integration_name,
                      stage_name: awsFormData.stage_name,
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

              // Show browser instead of redirecting for consistency
              setConnectedProvider('aws');
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

          // Save connection
          const connection: DatalakeConnection = {
              id: `snowflake_${Date.now()}`,
              provider: 'snowflake',
              name: `Snowflake - ${snowflakeFormData.datalake_account}`,
              connected_at: new Date().toISOString(),
              details: {
                  username: snowflakeFormData.datalake_username,
                  account: snowflakeFormData.datalake_account,
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

          // Show browser instead of redirecting for consistency
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
                                  <Text className="text-sm text-slate-600 dark:text-slate-400 mt-3">
                                      Please open the URL above in a new tab, follow the instructions to grant consent, then return here to continue.
                                  </Text>
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
                                  <Text className="text-sm text-slate-600 dark:text-slate-400 mt-3">
                                      Please open the URL above in a new tab, follow the instructions to grant consent, then return here to continue.
                                  </Text>
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
                                  disabled={loading || !azureNotificationIntegrationCreated || !azureNotificationDetailsFetched} // Disable if notification not created or details not fetched
                              />
                          )}
                          {!showAzureNotificationOption && (
                              <Text className="text-sm text-gray-600 dark:text-gray-400 italic">
                                  Automatic updates (Snowpipe) require a Notification Integration to be enabled in Step 3.
                              </Text>
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
                          <Input
                              name="external_id"
                              label="External ID"
                              placeholder="e.g., YOUR_EXTERNAL_ID"
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
                                  Continue to Stage Setup
                              </Button>
                          )}
                      </>
                  )}

                  {awsCurrentSubStep === 2 && (
                      <>
                          <h4 className="text-xl font-medium text-gray-800 dark:text-gray-200">Step 2: Create AWS Stage</h4>
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
              const connection: DatalakeConnection = {
                  id: `databricks_${Date.now()}`,
                  provider: 'databricks',
                  name: `Databricks - ${databricksFormData.catalog}`,
                  connected_at: new Date().toISOString(),
                  details: { host: databricksFormData.host, catalog: databricksFormData.catalog },
              };
              saveConnection(connection);
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
              const connection: DatalakeConnection = {
                  id: `iceberg_${Date.now()}`,
                  provider: 'iceberg',
                  name: `Iceberg - ${icebergFormData.namespace}`,
                  connected_at: new Date().toISOString(),
                  details: { uri: icebergFormData.uri, namespace: icebergFormData.namespace },
              };
              saveConnection(connection);
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
              const connection: DatalakeConnection = {
                  id: `postgres_${Date.now()}`,
                  provider: 'postgres',
                  name: `PostgreSQL - ${postgresFormData.database}`,
                  connected_at: new Date().toISOString(),
                  details: { host: postgresFormData.host, database: postgresFormData.database },
              };
              saveConnection(connection);
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
              const connection: DatalakeConnection = {
                  id: `mysql_${Date.now()}`,
                  provider: 'mysql',
                  name: `MySQL - ${mysqlFormData.database}`,
                  connected_at: new Date().toISOString(),
                  details: { host: mysqlFormData.host, database: mysqlFormData.database },
              };
              saveConnection(connection);
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

  const renderForm = () => {
        // Show datalake browser if connected
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
                                                connectedProvider === conn.provider
                                                    ? 'border-blue-600 text-blue-600 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20'
                                                    : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                            }`}
                                        >
                                            <Image
                                                src={logos[conn.provider]}
                                                alt={conn.provider}
                                                width={20}
                                                height={20}
                                                className="opacity-80"
                                            />
                                            <span>{conn.name}</span>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    removeConnection(conn.id);
                                                    toast.success('Connection removed');
                                                }}
                                                className="ml-2 text-red-500 hover:text-red-700 opacity-0 hover:opacity-100 group-hover:opacity-100 transition-opacity"
                                                title="Remove connection"
                                            >
                                                <HiOutlineTrash className="h-4 w-4" />
                                            </button>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Tab Content - Connection Details */}
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
                                                        <Image
                                                            src={logos[conn.provider]}
                                                            alt={conn.provider}
                                                            width={24}
                                                            height={24}
                                                        />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <h5 className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                                                            {conn.name}
                                                        </h5>
                                                        <Text className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                                                            {conn.provider}
                                                        </Text>
                                                    </div>
                                                </div>
                                                <div className="space-y-1 text-xs text-slate-600 dark:text-slate-400">
                                                    {conn.details.account && (
                                                        <div className="flex items-center">
                                                            <span className="font-medium mr-1">Account:</span>
                                                            <span className="truncate">{conn.details.account}</span>
                                                        </div>
                                                    )}
                                                    {conn.details.bucket_name && (
                                                        <div className="flex items-center">
                                                            <span className="font-medium mr-1">Bucket:</span>
                                                            <span className="truncate">{conn.details.bucket_name}</span>
                                                        </div>
                                                    )}
                                                    {conn.details.tenant_id && (
                                                        <div className="flex items-center">
                                                            <span className="font-medium mr-1">Tenant:</span>
                                                            <span className="truncate">{conn.details.tenant_id}</span>
                                                        </div>
                                                    )}
                                                    <div className="flex items-center text-green-600 dark:text-green-400 mt-2">
                                                        <div className="h-2 w-2 rounded-full bg-green-500 mr-2 animate-pulse"></div>
                                                        <span>Connected {new Date(conn.connected_at).toLocaleDateString()}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>

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
                                </p>
                            </div>

                            {/* Data Source Cards */}
                            <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
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
                            <StepIndicator currentStep={awsCurrentSubStep} totalSteps={2} />
                            {renderAwsForm()}
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
                default:
                    return null;
            }
        }
        return null;
    };

    // Show loading state while checking authentication
    if (status === 'loading') {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-blue-600 border-r-transparent mb-4"></div>
                    <p className="text-slate-600 dark:text-slate-400">Loading...</p>
                </div>
            </div>
        );
    }

    // Don't render anything if unauthenticated or no permission (redirect will happen in useEffect)
    if (status === 'unauthenticated' || !canManageConnections) {
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

            <div className="animate-fade-in-up">{renderForm()}</div>
        </div>
    );
}
