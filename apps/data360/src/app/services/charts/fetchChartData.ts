import axios from 'axios';
import { getSession } from 'next-auth/react';
import { ChartDataResponse, ChartRequest } from './types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export async function fetchChartData(request: ChartRequest): Promise<ChartDataResponse> {
    const session = await getSession();
    if (!session?.user?.access_token) {
        throw new Error('No access token available');
    }
    const token = session.user.access_token;

    const url = `${API_BASE_URL}/bi_reporting/charts/data`;

    const { data } = await axios.post<ChartDataResponse>(url, request, {
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
        },
    });
    console.log('fetchChartData', data.data);

    return data;
}





