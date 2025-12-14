/**
 * Data Source Connection Service - S3
 * Works in both server-side (SSR) and client-side contexts
 */
import apiClient from '@/lib/api-client';

interface S3FormData {
  integration_name: string;
  bucket_name: string;
  aws_role_arn: string;
  external_id: string;
  stage_name: string;
}

/**
 * Submits the Amazon S3 form data to the API as query parameters.
 * @param {S3FormData} formData - The form data to submit.
 * @returns {Promise<any>} - The Axios response promise.
 */
export const submitS3Form = async (formData: S3FormData): Promise<any> => {
  try {
    const response = await apiClient.get('/connect/data_lake');
    return response.data;
  } catch (error) {
    console.error('Error submitting the S3 form:', error);
    throw error;
  }
};
