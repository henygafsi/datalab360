import axios from 'axios';
import { getSession } from 'next-auth/react';

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
  //const params = new URLSearchParams(formData as Record<string, string>);
  const session = await getSession();
  if (!session?.user?.access_token) {
    throw new Error('No access token available');
  }
  const token = session.user.access_token;
  const url = `${process.env.NEXT_PUBLIC_API_URL}/connect/data_lake`;

  try {
    const response = await axios.get(url, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
    });
    return response.data;
  } catch (error) {
    console.error('Error submitting the S3 form:', error);
    throw error;
  }
};
