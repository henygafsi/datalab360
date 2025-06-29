'use client';

import { useState, FormEvent, ChangeEvent } from 'react';
import { Input, Button, Checkbox } from 'rizzui';
import Image from 'next/image';
import { submitS3Form } from '@/app/services/data-source-connection/s3Servicer';

type BreadcrumbProps = {
  children: React.ReactNode[];
};

type BreadcrumbItemProps = {
  href: string;
  children: React.ReactNode;
  isCurrent?: boolean;
};

type FormData = {
  integration_name: string;
  bucket_name: string;
  aws_role_arn: string;
  external_id: string;
  stage_name: string;
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

export default function DataSourcePage() {
  const [selectedSource, setSelectedSource] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false); // Loading state
  const [showLoadOptions, setShowLoadOptions] = useState<boolean>(false); // State for modal
  const [formData, setFormData] = useState<FormData>({
    integration_name: '',
    bucket_name: '',
    aws_role_arn: '',
    external_id: '',
    stage_name: '',
  });

  const titles: Record<string, string> = {
    s3: 'Amazon S3',
    snowflake: 'Snowflake',
    azure: 'Azure',
  };

  const logos: Record<string, string> = {
    s3: '/data-sources/aws-s3.png',
    snowflake: '/data-sources/snowflake-logo.png',
    azure: '/data-sources/azure-logo.png',
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true); // Set loading to true before submitting
    try {
      const response = await submitS3Form(formData);
      alert('Form submitted successfully!');
      console.log('Response:', response);

    } catch (error) {
      alert('Failed to submit form.');
      console.error('Error:', error);
    } finally {
      setLoading(false); // Set loading to false after submission
    }
  };
  

  

  const renderForm = () => {
    if (!selectedSource) {
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
              {['s3', 'snowflake', 'azure'].map((source) => (
                <div
                  key={source}
                  onClick={() => setSelectedSource(source)}
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

    return (
      <div className="mx-auto w-full max-w-lg transform rounded-2xl bg-white p-10 shadow-xl transition hover:scale-105">
        <div className="mb-8 flex items-center justify-between">
          <h3 className="text-2xl font-semibold text-blue-600">
            {titles[selectedSource]}
          </h3>
          <Image src={logos[selectedSource]} alt={titles[selectedSource]} width={80} height={80} />
        </div>
        <form className="space-y-6" onSubmit={handleSubmit}>
          {Object.keys(formData).map((key) => (
            <Input
              key={key}
              name={key}
              label={key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              placeholder={`Enter ${key}`}
              value={formData[key as keyof FormData]}
              onChange={handleChange}
              required
            />
          ))}
          <Button type="submit" className="mt-8 w-full bg-gradient-to-r from-blue-500 to-indigo-600" disabled={loading}>
  {loading ? 'Submitting...' : 'Connect'}
</Button>
        </form>
        {loading && <div className="mt-4 text-center text-gray-600">Please wait, submitting...</div>}

        <Button className="mt-6 w-full bg-gray-200" onClick={() => setSelectedSource('')}>
          Change Data Source
        </Button>
      </div>
    );
  };

  return (
    <div className="container mx-auto p-6">
      <Breadcrumb>
        <BreadcrumbItem href="/">Home</BreadcrumbItem>
        <BreadcrumbItem href="/data-source" isCurrent>
          Data Source Connection
        </BreadcrumbItem>
      </Breadcrumb>
      <div>{renderForm()}</div>
    </div>
  );
}
