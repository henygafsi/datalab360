import axios from 'axios';
import { getSession } from 'next-auth/react';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

async function authHeaders() {
    const session = await getSession();
    if (!session?.user?.access_token) throw new Error('No access token available');
    return { Authorization: `Bearer ${session.user.access_token}` };
}

export async function createMaskingPolicy(params: { policy_name: string; data_type: string; return_type: string; role_name: string; replace_with: string; }) {
    const headers = await authHeaders();
    const res = await axios.post(`${API_BASE_URL}/gouvernance/create-masking-policy`, null, { params, headers });
    return res.data;
}

export async function listMaskingPolicies() {
    const headers = await authHeaders();
    const res = await axios.get(`${API_BASE_URL}/gouvernance/list-masking-policies`, { headers });
    return res.data;
}

export async function removeMaskingPolicy(params: { database: string; schema: string; table: string; column: string; }) {
    const headers = await authHeaders();
    const res = await axios.post(`${API_BASE_URL}/gouvernance/remove-masking-policy`, null, { params, headers });
    return res.data;
}

export async function listMaskedColumns(params: { database: string; schema: string; }) {
    const headers = await authHeaders();
    const res = await axios.get(`${API_BASE_URL}/gouvernance/masked-columns`, { params, headers });
    return res.data;
}

export async function applyMaskingPolicy(params: { database: string; schema: string; table: string; column: string; policy_name: string; }) {
    const headers = await authHeaders();
    const res = await axios.post(`${API_BASE_URL}/gouvernance/apply-masking-policy`, null, { params, headers });
    return res.data;
}


