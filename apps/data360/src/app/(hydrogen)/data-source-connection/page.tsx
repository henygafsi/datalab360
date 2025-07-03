'use client';

import { useState, FormEvent, ChangeEvent } from 'react';
import { Input, Button, Checkbox, Text } from 'rizzui';
import Image from 'next/image';
// REMOVE THIS LINE: import { useToast } from '@/hooks/use-toast';
import toast from 'react-hot-toast'; // IMPORT react-hot-toast directly

// Import the new connection services from the same folder
import {
    setupAzureStorageIntegration,
    setupAzureNotificationIntegration,
    createAzureStage,
    setupAwsStorageIntegration,
    createAwsStage,
    getIntegrationDetails,
} from './connectionServices';

// Assuming submitS3Form is also in the data-source-connection services folder
import { submitS3Form } from '@/app/services/data-source-connection/s3Servicer';

// Import Label from the correct local path
import { Label } from '@/components/ui/label';


// Breadcrumb components (kept local to this file as per "everything in this folder")
type BreadcrumbProps = {
    children: React.ReactNode[];
};

type BreadcrumbItemProps = {
    href: string;
    children: React.ReactNode;
    isCurrent?: boolean;
};

const Breadcrumb = ({ children }: BreadcrumbProps) => (
    <nav className="mb-8 text-sm text-gray-500">
        <ul className="flex space-x-3">
            {children.map((child, index) => (
                <li key={index} className="flex items-center space-x-2">
                    {index !== 0 && <span className="text-gray-300">/</span>}
                    {child}
                </li>
            ))}
        </ul>
    </nav>
);

const BreadcrumbItem = ({ href, children, isCurrent = false }: BreadcrumbItemProps) => (
    isCurrent ? (
        <span className="font-semibold text-gray-800">{children}</span>
    ) : (
        <a href={href} className="transition hover:text-blue-600">
            {children}
        </a>
    )
);

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


export default function DataSourcePage() {
    // REMOVE THIS LINE: const { toast } = useToast(); // No longer needed
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
    
    const titles: Record<string, string> = {
        s3: 'Amazon S3',
        snowflake: 'Snowflake',
        azure: 'Azure',
        aws: 'AWS',
    };

    const logos: Record<string, string> = {
        s3: '/data-sources/aws-s3.png',
        snowflake: '/data-sources/snowflake-logo.png',
        azure: '/data-sources/azure-logo.png',
        aws: '/data-sources/aws-s3.png',
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
                toast.success('Storage integration created successfully!'); // Updated toast
                setAzureCurrentSubStep(2); // Move to Notification step
            } else if (azureCurrentSubStep === 2) { // Step 2: Handle Notification Option
                if (showAzureNotificationOption) {
                    // If notification option is ON, try to create notification integration
                    await setupAzureNotificationIntegration(
                        azureFormData.notification_integration_name,
                        azureFormData.tenant_id,
                        azureFormData.queue_url
                    );
                    setAzureNotificationIntegrationCreated(true);
                    toast.success('Notification integration created successfully!'); // Updated toast
                    setAzureCurrentSubStep(3); // Move to new step: Get Notification Details
                } else {
                    // If notification option is OFF, skip to Stage creation
                    toast('Notification integration creation skipped.'); // Updated toast (general message)
                    setAzureCurrentSubStep(4); // Skip directly to Stage creation
                }
            } else if (azureCurrentSubStep === 3) { // Step 3: Get Notification Integration Details (Conditional)
                if (!azureNotificationIntegrationCreated) {
                    throw new Error("Notification integration not created, cannot fetch details.");
                }
                const response = await getIntegrationDetails(azureFormData.notification_integration_name);
                console.log('Notification Integration Details:', response);
                setAzureConsentUrl(response?.azure_consent_url || null);
                setAzureMultiTenantAppName(response?.azure_multi_tenant_app_name || null);
                setAzureNotificationDetailsFetched(true);
                toast.success('Notification integration details fetched successfully!'); // Updated toast
                // Removed automatic step advancement here
            } else if (azureCurrentSubStep === 4) { // Final Step: Create Azure Stage
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
                toast.success('Azure Stage created successfully!'); // Updated toast
                setCurrentStep(0); // All Azure setup complete
                setSelectedSource('');
            }
        } catch (error: any) {
            // Updated error toast
            toast.error(`Failed: ${error.message || 'An unexpected error occurred.'}`);
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    };

    const renderAzureForm = () => {
        return (
            <div className="mx-auto w-full max-w-lg transform rounded-2xl bg-white p-10 shadow-xl">
                <div className="mb-8 flex items-center justify-between">
                    <h3 className="text-2xl font-semibold text-blue-600">Azure Connection</h3>
                    <Image src={logos['azure']} alt="Azure Logo" width={80} height={80} />
                </div>
                <form className="space-y-6" onSubmit={handleAzureSubmit}>
                    {azureCurrentSubStep === 1 && (
                        <>
                            <h4 className="text-xl font-medium text-gray-800">Step 1: Storage Integration</h4>
                            <Input
                                name="storage_integration_name"
                                label="Storage Integration Name"
                                placeholder="e.g., azure_storage_integration"
                                value={azureFormData.storage_integration_name}
                                onChange={(e) => handleChange(e, 'azure')}
                                required
                                disabled={azureStorageIntegrationCreated || loading}
                            />
                            <Input
                                name="tenant_id"
                                label="Azure Tenant ID"
                                placeholder="Your Azure Tenant ID"
                                value={azureFormData.tenant_id}
                                onChange={(e) => handleChange(e, 'azure')}
                                required
                                disabled={azureStorageIntegrationCreated || loading}
                            />
                            <Input
                                name="storage_url"
                                label="Azure Storage URL"
                                placeholder="azure://<account_name>.blob.core.windows.net/<container>"
                                value={azureFormData.storage_url}
                                onChange={(e) => handleChange(e, 'azure')}
                                required
                                disabled={azureStorageIntegrationCreated || loading}
                            />
                            {!azureStorageIntegrationCreated && (
                                <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-indigo-600" disabled={loading}>
                                    {loading ? 'Setting up...' : 'Create Storage Integration'}
                                </Button>
                            )}
                            {azureStorageIntegrationCreated && (
                                <Button type="button" onClick={() => setAzureCurrentSubStep(2)} className="w-full bg-green-500 hover:bg-green-600" disabled={loading}>
                                    Continue to Notification Setup
                                </Button>
                            )}
                        </>
                    )}

                    {azureCurrentSubStep === 2 && (
                        <>
                            <h4 className="text-xl font-medium text-gray-800">Step 2: Notification Integration (Optional)</h4>
                            <Text className="text-sm text-gray-600">
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
                                    />
                                    <Input
                                        name="queue_url"
                                        label="Azure Queue URL"
                                        placeholder="azure://<account_name>.queue.core.windows.net/<queue_name>"
                                        value={azureFormData.queue_url}
                                        onChange={(e) => handleChange(e, 'azure')}
                                        required={showAzureNotificationOption}
                                        disabled={azureNotificationIntegrationCreated || loading}
                                    />
                                    {!azureNotificationIntegrationCreated && (
                                        <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-indigo-600" disabled={loading || !azureFormData.queue_url || !azureFormData.notification_integration_name}>
                                            {loading ? 'Setting up...' : 'Create Notification Integration'}
                                        </Button>
                                    )}
                                </>
                            )}
                            {(azureNotificationIntegrationCreated || !showAzureNotificationOption) && (
                                <Button type="button" onClick={() => handleAzureSubmit({ preventDefault: () => {} } as FormEvent)}
                                    className="w-full bg-green-500 hover:bg-green-600" disabled={loading}>
                                    Continue
                                </Button>
                            )}
                        </>
                    )}

                    {azureCurrentSubStep === 3 && showAzureNotificationOption && azureNotificationIntegrationCreated && (
                        <>
                            <h4 className="text-xl font-medium text-gray-800">Step 3: Azure Consent Details</h4>
                            <Text className="text-sm text-gray-600 mb-4">
                                Retrieving and displaying details required for Azure Active Directory consent.
                            </Text>
                            
                            {/* Display area for fetched details */}
                            {azureNotificationDetailsFetched ? (
                                <div className="bg-blue-50 border border-blue-300 p-5 rounded-lg space-y-3 shadow-md">
                                    <h5 className="text-lg font-bold text-blue-700">Consent Information:</h5>
                                    <div>
                                        <Text className="font-semibold text-gray-800">Application Name:</Text>
                                        <Text className="break-all text-base text-gray-900">
                                            {azureMultiTenantAppName || 'N/A'}
                                        </Text>
                                    </div>
                                    <div>
                                        <Text className="font-semibold text-gray-800">Consent URL:</Text>
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
                                            <Text className="text-sm text-gray-700 italic">URL not available.</Text>
                                        )}
                                    </div>
                                    <Text className="text-sm text-muted-foreground mt-3">
                                        Please open the URL above in a new tab, follow the instructions to grant consent, then return here to continue.
                                    </Text>
                                </div>
                            ) : (
                                <Text className="text-base text-gray-700 font-semibold text-center py-4">
                                    {loading ? "Fetching consent URL and application name..." : "Click 'Fetch Consent Details' to retrieve the URL and application name."}
                                </Text>
                            )}

                            {!azureNotificationDetailsFetched && (
                                <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-indigo-600" disabled={loading}>
                                    {loading ? 'Fetching Details...' : 'Fetch Consent Details'}
                                </Button>
                            )}
                            {azureNotificationDetailsFetched && (
                                <Button type="button" onClick={() => setAzureCurrentSubStep(4)} className="w-full bg-green-500 hover:bg-green-600" disabled={loading}>
                                    Continue to Create Stage
                                </Button>
                            )}
                        </>
                    )}

                    {azureCurrentSubStep === 4 && (
                        <>
                            <h4 className="text-xl font-medium text-gray-800">Step {showAzureNotificationOption ? '4' : '3'}: Create Azure Stage</h4>
                            <Input
                                name="stage_name"
                                label="Stage Name"
                                placeholder="e.g., my_azure_stage"
                                value={azureFormData.stage_name}
                                onChange={(e) => handleChange(e, 'azure')}
                                required
                                disabled={loading}
                            />
                             <Text className="text-sm text-gray-600">
                                Stage URL will be the same as Storage URL: {azureFormData.storage_url}
                            </Text>
                            <Input
                                name="storage_integration_name"
                                label="Storage Integration Name"
                                value={azureFormData.storage_integration_name}
                                disabled
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
                                <Text className="text-sm text-gray-600 italic">
                                    Automatic updates (Snowpipe) require a Notification Integration to be enabled in Step 2.
                                </Text>
                            )}

                            <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-indigo-600" disabled={loading || (azureFormData.auto_update && !azureFormData.notification_integration_name)}>
                                {loading ? 'Creating Stage...' : 'Create Azure Stage'}
                            </Button>
                        </>
                    )}
                </form>
                <Button className="mt-6 w-full bg-gray-200" onClick={handleBackToProviderSelection} disabled={loading}>
                    Back to Data Source Selection
                </Button>
            </div>
        );
    };

    // --- AWS Connection Steps (unchanged for this request) ---
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
                toast.success('Storage integration created successfully!'); // Updated toast
                setAwsCurrentSubStep(2);
            } else if (awsCurrentSubStep === 2) {
                await createAwsStage(
                    awsFormData.stage_name,
                    awsFormData.bucket_name,
                    awsFormData.integration_name,
                    awsFormData.load_data,
                    awsFormData.auto_update
                );
                toast.success('AWS Stage created successfully!'); // Updated toast
                setCurrentStep(0);
                setSelectedSource('');
            }
        } catch (error: any) {
            toast.error(`Failed: ${error.message || 'An unexpected error occurred.'}`); // Updated toast
            console.error('Error:', error);
        } finally {
            setLoading(false);
        }
    };

    const renderAwsForm = () => {
        return (
            <div className="mx-auto w-full max-w-lg transform rounded-2xl bg-white p-10 shadow-xl">
                <div className="mb-8 flex items-center justify-between">
                    <h3 className="text-2xl font-semibold text-blue-600">AWS Connection</h3>
                    <Image src={logos['aws']} alt="AWS Logo" width={80} height={80} />
                </div>
                <form className="space-y-6" onSubmit={handleAwsSubmit}>
                    {awsCurrentSubStep === 1 && (
                        <>
                            <h4 className="text-xl font-medium text-gray-800">Step 1: Storage Integration</h4>
                            <Input
                                name="integration_name"
                                label="Integration Name"
                                placeholder="e.g., aws_storage_integration"
                                value={awsFormData.integration_name}
                                onChange={(e) => handleChange(e, 'aws')}
                                required
                                disabled={awsIntegrationCreated || loading}
                            />
                            <Input
                                name="bucket_name"
                                label="AWS Bucket Name"
                                placeholder="e.g., my-s3-bucket"
                                value={awsFormData.bucket_name}
                                onChange={(e) => handleChange(e, 'aws')}
                                required
                                disabled={awsIntegrationCreated || loading}
                            />
                            <Input
                                name="aws_role_arn"
                                label="AWS Role ARN"
                                placeholder="arn:aws:iam::123456789012:role/MySnowflakeRole"
                                value={awsFormData.aws_role_arn}
                                onChange={(e) => handleChange(e, 'aws')}
                                required
                                disabled={awsIntegrationCreated || loading}
                            />
                            <Input
                                name="external_id"
                                label="External ID"
                                placeholder="e.g., YOUR_EXTERNAL_ID"
                                value={awsFormData.external_id}
                                onChange={(e) => handleChange(e, 'aws')}
                                required
                                disabled={awsIntegrationCreated || loading}
                            />
                            {!awsIntegrationCreated && (
                                <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-indigo-600" disabled={loading}>
                                    {loading ? 'Setting up...' : 'Create Storage Integration'}
                                </Button>
                            )}
                            {awsIntegrationCreated && (
                                <Button type="button" onClick={() => setAwsCurrentSubStep(2)} className="w-full bg-green-500 hover:bg-green-600" disabled={loading}>
                                    Continue to Stage Setup
                                </Button>
                            )}
                        </>
                    )}

                    {awsCurrentSubStep === 2 && (
                        <>
                            <h4 className="text-xl font-medium text-gray-800">Step 2: Create AWS Stage</h4>
                            <Input
                                name="stage_name"
                                label="Stage Name"
                                placeholder="e.g., my_aws_stage"
                                value={awsFormData.stage_name}
                                onChange={(e) => handleChange(e, 'aws')}
                                required
                                disabled={loading}
                            />
                            <Text className="text-sm text-gray-600">
                                Stage Bucket Name will be the same as Storage Bucket Name: {awsFormData.bucket_name}
                            </Text>
                            <Input
                                name="integration_name"
                                label="Storage Integration Name"
                                value={awsFormData.integration_name}
                                disabled
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
                            <Button type="submit" className="w-full bg-gradient-to-r from-blue-500 to-indigo-600" disabled={loading}>
                                {loading ? 'Creating Stage...' : 'Create AWS Stage'}
                            </Button>
                        </>
                    )}
                </form>
                <Button className="mt-6 w-full bg-gray-200" onClick={handleBackToProviderSelection} disabled={loading}>
                    Back to Data Source Selection
                </Button>
            </div>
        );
    };

    const renderSnowflakeConnect = () => {
        return (
            <div className="mx-auto w-full max-w-lg transform rounded-2xl bg-white p-10 shadow-xl">
                <div className="mb-8 flex items-center justify-between">
                    <h3 className="text-2xl font-semibold text-blue-600">Snowflake Connection</h3>
                    <Image src={logos['snowflake']} alt="Snowflake Logo" width={80} height={80} />
                </div>
                <div className="space-y-4 text-center">
                    <p className="text-lg text-gray-700">
                        Snowflake is typically the destination for data.
                        To integrate with Snowflake, you usually perform setup steps within your Snowflake account
                        (e.g., creating storage integrations, stages, pipes) which are then referenced by your cloud storage.
                    </p>
                    <p className="text-md text-gray-600">
                        The previous steps for Azure or AWS have helped configure external stages in Snowflake.
                        You might need to grant privileges or run SQL commands in Snowflake directly.
                    </p>
                    <Button onClick={handleBackToProviderSelection} className="mt-6 w-full bg-gradient-to-r from-blue-500 to-indigo-600">
                        Return to Data Source Selection
                    </Button>
                </div>
            </div>
        );
    };

    const renderForm = () => {
        if (currentStep === 0) {
            return (
                <div className="flex min-h-screen items-start justify-center pt-12">
                    <div className="text-center">
                        <h3 className="mb-8 text-3xl font-bold text-gray-800">
                            Connect your data source
                        </h3>
                        <p className="mb-12 text-lg text-gray-600">
                            Choose one of the following data sources to get started
                        </p>
                        <div className="flex justify-center space-x-10">
                            {['s3', 'snowflake', 'azure', 'aws'].map((source) => (
                                <div
                                    key={source}
                                    onClick={() => {
                                        setSelectedSource(source);
                                        setCurrentStep(1);
                                    }}
                                    className="flex h-56 w-56 transform cursor-pointer flex-col items-center justify-center rounded-lg bg-white p-8 shadow-lg transition duration-200 hover:scale-105 hover:shadow-2xl"
                                >
                                    <Image src={logos[source]} alt={titles[source]} width={70} height={70} />
                                    <p className="mt-4 text-lg font-medium text-gray-700">
                                        {titles[source]}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            );
        }

        if (currentStep === 1) {
            switch (selectedSource) {
                case 's3':
                    return (
                        <div className="mx-auto w-full max-w-lg transform rounded-2xl bg-white p-10 shadow-xl">
                            <div className="mb-8 flex items-center justify-between">
                                <h3 className="text-2xl font-semibold text-blue-600">
                                    {titles[selectedSource]} Generic Connection
                                </h3>
                                <Image src={logos[selectedSource]} alt={titles[selectedSource]} width={80} height={80} />
                            </div>
                            <form className="space-y-6" onSubmit={async (e) => {
                                e.preventDefault();
                                setLoading(true);
                                try {
                                    const dummyFormData = {
                                        integration_name: 's3_dummy_integration',
                                        bucket_name: 'my-bucket',
                                        aws_role_arn: 'arn:aws:iam::123:role/dummy',
                                        external_id: 'dummy_id',
                                        stage_name: 'dummy_stage',
                                    };
                                    const response = await submitS3Form(dummyFormData);
                                    toast.success('Generic S3 form submitted successfully!'); // Updated toast
                                    console.log('Response:', response);
                                    setSelectedSource('');
                                    setCurrentStep(0);
                                } catch (error: any) {
                                    toast.error(`Failed: ${error.message || 'An unexpected error occurred.'}`); // Updated toast
                                    console.error('Error:', error);
                                } finally {
                                    setLoading(false);
                                }
                            }}>
                                <Text className="text-sm text-gray-600 mb-4">
                                    This form is for a generic S3 connection. If you intend to integrate S3 with Snowflake, please select the 'AWS' option to configure the necessary Snowflake integrations.
                                </Text>
                                <Input
                                    name="bucket_name_generic"
                                    label="S3 Bucket Name"
                                    placeholder="e.g., my-generic-s3-bucket"
                                    required
                                    disabled={loading}
                                />
                                <Button type="submit" className="mt-8 w-full bg-gradient-to-r from-blue-500 to-indigo-600" disabled={loading}>
                                    {loading ? 'Submitting...' : 'Connect Generic S3'}
                                </Button>
                            </form>
                            <Button className="mt-6 w-full bg-gray-200" onClick={handleBackToProviderSelection} disabled={loading}>
                                Back to Data Source Selection
                            </Button>
                        </div>
                    );
                case 'snowflake':
                    return renderSnowflakeConnect();
                case 'azure':
                    return renderAzureForm();
                case 'aws':
                    return renderAwsForm();
                default:
                    return null;
            }
        }
        return null;
    };

    return (
        <div className="container mx-auto p-6">
            <Breadcrumb>
                <BreadcrumbItem href="/">Home</BreadcrumbItem>
                <BreadcrumbItem href="/data-source-connection" isCurrent>
                    Data Source Connection
                </BreadcrumbItem>
            </Breadcrumb>
            <div>{renderForm()}</div>
        </div>
    );
}