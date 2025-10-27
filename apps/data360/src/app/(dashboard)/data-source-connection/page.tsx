'use client';

import { useState, FormEvent, ChangeEvent } from 'react';
import { Input, Button, Checkbox, Text, Password, Badge } from 'rizzui';
import Image from 'next/image';
import toast from 'react-hot-toast';
import {
  HiOutlineCloudArrowUp,
  HiOutlineShieldCheck,
  HiOutlineCheckCircle
} from 'react-icons/hi2';
import { Database } from 'lucide-react';

// Import the new connection services from the same folder
import {
    setupAzureStorageIntegration,
    setupAzureNotificationIntegration,
    createAzureStage,
    setupAwsStorageIntegration,
    createAwsStage,
    getIntegrationDetails, // Ensure this is imported
} from './connectionServices';
import { silentReauth } from '@/app/services/auth/silentReauth';

// Assuming submitS3Form is also in the data-source-connection services folder
import { submitS3Form } from '@/app/services/data-source-connection/s3Servicer';

// Import Label from the correct local path
import { Label } from '@/components/ui/label';

// Modern breadcrumb component
function Breadcrumb() {
  return (
    <nav className="mb-8">
      <div className="flex items-center space-x-2 text-sm text-slate-600 dark:text-slate-400">
        <span className="cursor-pointer transition-colors hover:text-slate-900 dark:hover:text-slate-200">
          Home
        </span>
        <span>/</span>
        <span className="cursor-pointer transition-colors hover:text-slate-900 dark:hover:text-slate-200">
          Integration
        </span>
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
}: {
  name: string;
  icon: string;
  description: string;
  isSelected: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`group relative cursor-pointer rounded-2xl border-2 p-8 transition-all duration-300 hover:scale-105 ${
        isSelected
          ? 'border-blue-500 bg-blue-50/50 shadow-lg shadow-blue-500/20 dark:bg-blue-950/20'
          : 'border-slate-200 bg-white/50 hover:border-slate-300 hover:shadow-lg dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600'
      }`}
    >
      {/* Background pattern */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-transparent via-white/10 to-white/20 dark:from-transparent dark:via-slate-800/10 dark:to-slate-900/20" />

      <div className="relative z-10 text-center">
        <div className="mb-6 flex justify-center">
          <div
            className={`flex h-16 w-16 items-center justify-center rounded-xl transition-all duration-300 ${
              isSelected
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

export default function DataSourceConnectionPage() {
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<number>(0);
  
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

  const logos: Record<string, string> = {
      s3: '/data-sources/aws-s3.png',
      snowflake: '/data-sources/snowflake-logo.png',
      azure: '/data-sources/azure-logo.png',
      aws: '/data-sources/aws-s3.png',
  };

  const dataSources = [
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
      description:
        'Microsoft cloud storage solution for big data and analytics',
    },
    {
      id: 'aws',
      name: 'Amazon S3',
      icon: '/data-sources/aws-s3.png',
      description: 'Amazon Simple Storage Service for scalable cloud storage',
    },
  ];

  const handleSourceSelect = (sourceId: string) => {
    setSelectedSource(sourceId);
    setCurrentStep(1);
  };

  const handleBackToProviderSelection = () => {
      setSelectedSource('');
      setCurrentStep(0);
      // Reset specific form data when going back to selection
      setAzureFormData({
          storage_integration_name: '', notification_integration_name: '', tenant_id: '', storage_url: '', queue_url: '',
          stage_name: '', load_data: true, auto_update: false // Reset load_data to true
      });
      setAwsFormData({
          integration_name: '', bucket_name: '', aws_role_arn: '', external_id: '',
          stage_name: '', load_data: false, auto_update: false
      });
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>, provider: 'azure' | 'aws') => {
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

  const handleAzureSubmit = async (e: FormEvent) => {
      e.preventDefault();
      setLoading(true);
      try {
          if (azureCurrentSubStep === 1) { // Step 1: Create Storage Integration
              await setupAzureStorageIntegration(
                  azureFormData.storage_integration_name,
                  azureFormData.tenant_id,
                  azureFormData.storage_url
              );
              setAzureStorageIntegrationCreated(true);
              toast.success('Azure Storage Integration created successfully!');
              setAzureCurrentSubStep(2); // Move to Storage consent/details step
          } else if (azureCurrentSubStep === 2) { // Step 2: Get Storage Integration Details (Consent URL)
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
                  // If notification option is OFF, skip to Stage creation
                  toast.success('Notification integration creation skipped.');
                  setAzureCurrentSubStep(4); // Go to Create Stage as a separate step
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
                  setCurrentStep(0); // All Azure setup complete
                  setSelectedSource('');
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
              try {
                  if (typeof window !== 'undefined') {
                      window.localStorage.setItem('features.datalakeConnected', '1');
                      window.dispatchEvent(new Event('app:refresh-menu'));
                  }
              } catch {}
              try { await silentReauth(); } catch {}
              setCurrentStep(0); // All Azure setup complete
              setSelectedSource('');
          }
      } catch (error: any) {
          toast.error(`Failed: ${error.message || 'An unexpected error occurred.'}`);
          console.error('Error:', error);
      } finally {
          setLoading(false);
      }
  };

  // --- AWS Connection Steps ---
  const [awsCurrentSubStep, setAwsCurrentSubStep] = useState<number>(1);
  const [awsIntegrationCreated, setAwsIntegrationCreated] = useState<boolean>(false);

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
              try {
                  if (typeof window !== 'undefined') {
                      window.localStorage.setItem('features.datalakeConnected', '1');
                      window.dispatchEvent(new Event('app:refresh-menu'));
                  }
              } catch {}
              try { await silentReauth(); } catch {}
              setCurrentStep(0);
              setSelectedSource('');
          }
      } catch (error: any) {
          toast.error(`Failed: ${error.message || 'An unexpected error occurred.'}`);
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
                          <Input
                              name="storage_url"
                              label="Azure Storage URL"
                              placeholder="azure://<account_name>.blob.core.windows.net/<container>"
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
                          <h4 className="text-xl font-medium text-gray-800 dark:text-gray-200">Step 2: Azure Storage Consent Details</h4>
                          <Text className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                              Retrieve and display details required for Azure Active Directory consent for the Storage Integration.
                          </Text>

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
                              <Button type="button" onClick={() => handleAzureSubmit({ preventDefault: () => {} } as FormEvent)}
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
              <Button className="mt-6 w-full bg-surface-secondary hover:bg-surface-tertiary border border-border-secondary transition-all duration-300 hover:shadow-elevation-2" onClick={handleBackToProviderSelection} disabled={loading}>
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
              <Button className="mt-6 w-full bg-surface-secondary hover:bg-surface-tertiary border border-border-secondary transition-all duration-300 hover:shadow-elevation-2" onClick={handleBackToProviderSelection} disabled={loading}>
                  Back to Data Source Selection
              </Button>
          </div>
      );
  };

  const renderForm = () => {
        if (currentStep === 0) {
            return (
                <div className="bg-white/70 dark:bg-slate-800/70 backdrop-blur-sm rounded-3xl border border-slate-200/60 dark:border-slate-700/60 shadow-xl p-8">
                    
                    {/* Header */}
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

                    {/* Data Source Cards */}
                    <div className="mx-auto grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                        {dataSources.map((source) => (
                            <DataSourceCard
                                key={source.id}
                                name={source.name}
                                icon={source.icon}
                                description={source.description}
                                isSelected={selectedSource === source.id}
                                onClick={() => handleSourceSelect(source.id)}
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
                </div>
            );
        }

        if (currentStep === 1) {
            switch (selectedSource) {
                case 'azure':
                    return (
                        <div className="mx-auto max-w-2xl space-y-8">
                            <Breadcrumb />
                            <StepIndicator currentStep={azureCurrentSubStep} totalSteps={showAzureNotificationOption ? 5 : 4} />
                            {renderAzureForm()}
                        </div>
                    );
                case 'aws':
                    return (
                        <div className="mx-auto max-w-2xl space-y-8">
                            <Breadcrumb />
                            <StepIndicator currentStep={awsCurrentSubStep} totalSteps={2} />
                            {renderAwsForm()}
                        </div>
                    );
                default:
                    return null;
            }
        }
        return null;
    };

    return (
        <div className="space-y-8">
            <Breadcrumb />
            
            {/* Page Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
                        <Database className="w-6 h-6 text-white" />
                    </div>
                    <div>
                        <h1 className="text-3xl font-bold bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-300 bg-clip-text text-transparent">
                            Data Source Connection
                        </h1>
                        <p className="text-slate-600 dark:text-slate-400">
                            {selectedSource 
                                ? `Configure your ${dataSources.find(s => s.id === selectedSource)?.name} connection`
                                : "Connect and integrate your data sources with powerful cloud platforms"
                            }
                        </p>
                    </div>
                </div>
                
                {selectedSource && (
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
