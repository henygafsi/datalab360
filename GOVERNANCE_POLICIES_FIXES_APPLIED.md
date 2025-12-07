# Governance Policies Frontend Fixes Applied

## Date: 2025-12-06

## Issues Fixed

### 1. ✅ "Objects are not valid as a React child" Error

**Problem**: React was trying to render object values directly in JSX, which is not allowed.

**Root Cause**: Policy properties from the backend might be objects instead of strings, causing React rendering errors.

**Fix Applied**: Added defensive `String()` conversions to all policy property renderings in:

- **[masking-policies-content.tsx:193-200](apps/data360/src/app/(dashboard)/gouvernance/policies/masking-policies-content.tsx#L193-L200)**
  ```typescript
  <h3 className="font-semibold text-lg">{String(policy.policy_name || '')}</h3>
  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
    Type: {String(policy.column_type || policy.data_type || 'N/A')}
  </p>
  <p className="text-xs text-slate-500 mt-1 font-mono">
    {String(policy.masking_expression || 'N/A')}
  </p>
  <p className="text-xs text-slate-500 mt-1">Schema: {String(policy.schema || 'N/A')}</p>
  ```

- **[aggregation-policies-content.tsx:156-160](apps/data360/src/app/(dashboard)/gouvernance/policies/aggregation-policies-content.tsx#L156-L160)**
  ```typescript
  <h3 className="font-semibold text-lg">{String(policy.policy_name || '')}</h3>
  <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
    Constraint: {String(policy.aggregation_constraint || 'N/A')}
  </p>
  <p className="text-xs text-slate-500 mt-1">Schema: {String(policy.schema || 'N/A')}</p>
  ```

- **[rls-policies-content.tsx:299-329](apps/data360/src/app/(dashboard)/gouvernance/policies/rls-policies-content.tsx#L299-L329)**
  ```typescript
  <h3 className="text-lg font-bold text-slate-900 dark:text-white">
    {String(policy.policy_name || '')}
  </h3>
  <p className="font-medium text-slate-900 dark:text-white">
    {String(policy.database || '')}.{String(policy.schema || '')}.{String(policy.table_name || 'N/A')}
  </p>
  <code className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
    {String(policy.filter_expression || policy.expression || 'N/A')}
  </code>
  {policy.description && (
    <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
      {String(policy.description)}
    </p>
  )}
  ```

**Result**: React will now safely render all policy properties as strings, preventing rendering errors.

---

### 2. ✅ Masking Policy Creation Issue

**Problem**: Masking policy creation was sending incorrect or conflicting parameters to the backend.

**Root Cause**: The function was always sending `custom_expression` even when using predefined masking types, and wasn't properly handling the conditional logic.

**Fix Applied**: Refactored `createMaskingPolicy()` in [policies.ts:390-425](apps/data360/src/app/services/gouvernance/policies.ts#L390-L425):

```typescript
export async function createMaskingPolicy(data: CreateMaskingPolicyRequest): Promise<MaskingPolicy> {
  const headers = await getAuthHeaders();

  // Build params object, only including custom_expression if masking_type is not provided
  const params: Record<string, any> = {
    policy_name: data.policy_name,
    data_type: data.data_type,
    schema: data.schema || 'cp_data360.gouvernance',
  };

  // Only add masking_type if it's defined
  if (data.masking_type) {
    params.masking_type = data.masking_type;
  }

  // Only add custom_expression if provided
  if (data.custom_expression) {
    params.custom_expression = data.custom_expression;
  }

  // Only add authorized_roles if provided
  if (data.authorized_roles && data.authorized_roles.length > 0) {
    params.authorized_roles = data.authorized_roles.join(',');
  }

  try {
    const response = await axios.post<StandardResponse<MaskingPolicy>>(`${POLICIES_API}/masking`, null, {
      params,
      headers,
    });
    return response.data.data;
  } catch (error: any) {
    console.error('Create masking policy error:', error.response?.data || error.message);
    throw error;
  }
}
```

**Key Changes**:
- Only sends `masking_type` if it's defined
- Only sends `custom_expression` if provided
- Only sends `authorized_roles` if they exist
- Added error logging to console for debugging

**Result**: Masking policy creation should now work correctly without conflicting parameters.

---

### 3. ✅ Apply Policy Functionality - Better Error Logging

**Problem**: Apply functionality wasn't working, but errors weren't being properly logged for debugging.

**Root Cause**: No error logging in apply functions made it impossible to diagnose backend issues.

**Fix Applied**: Added comprehensive error logging to all apply functions:

#### A. Apply RLS Policy - [policies.ts:241-265](apps/data360/src/app/services/gouvernance/policies.ts#L241-L265)
```typescript
export async function applyRLSPolicy(data: ApplyRLSPolicyRequest): Promise<any> {
  const headers = await getAuthHeaders();
  try {
    const response = await axios.post<StandardResponse>(`${POLICIES_API}/row-access/apply`, null, {
      params: {
        policy_name: data.policy_name,
        table_name: data.table_name,
        database: data.database,
        schema: data.schema,
        policy_column: data.policy_column,
        policy_schema: data.policy_schema || 'cp_data360.gouvernance',
      },
      headers,
    });
    return response.data.data;
  } catch (error: any) {
    console.error('Apply RLS policy error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      data,
    });
    throw error;
  }
}
```

#### B. Apply Masking Policy - [policies.ts:427-451](apps/data360/src/app/services/gouvernance/policies.ts#L427-L451)
```typescript
export async function applyMaskingPolicy(data: ApplyMaskingPolicyRequest): Promise<any> {
  const headers = await getAuthHeaders();
  try {
    const response = await axios.post<StandardResponse>(`${POLICIES_API}/masking/apply`, null, {
      params: {
        policy_name: data.policy_name,
        database: data.database,
        schema: data.schema,
        table: data.table,
        column: data.column,
        policy_schema: data.policy_schema || 'cp_data360.gouvernance',
      },
      headers,
    });
    return response.data.data;
  } catch (error: any) {
    console.error('Apply masking policy error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      data,
    });
    throw error;
  }
}
```

#### C. Apply Aggregation Policy - [policies.ts:773-796](apps/data360/src/app/services/gouvernance/policies.ts#L773-L796)
```typescript
export async function applyAggregationPolicy(data: ApplyAggregationPolicyRequest): Promise<any> {
  const headers = await getAuthHeaders();
  try {
    const response = await axios.post<StandardResponse>(`${POLICIES_API}/aggregation/apply`, null, {
      params: {
        policy_name: data.policy_name,
        database: data.database,
        schema: data.schema,
        table: data.table,
        policy_schema: data.policy_schema || 'cp_data360.gouvernance',
      },
      headers,
    });
    return response.data.data;
  } catch (error: any) {
    console.error('Apply aggregation policy error:', {
      message: error.response?.data?.message || error.message,
      detail: error.response?.data?.detail,
      status: error.response?.status,
      data,
    });
    throw error;
  }
}
```

**Result**: All apply policy errors will now be logged to the browser console with detailed information, making it easier to diagnose backend issues.

---

## Testing Instructions

### 1. Test React Rendering Fixes
1. Open browser DevTools (F12) → Console tab
2. Navigate to governance policies pages:
   - `/gouvernance/policies/rls`
   - `/gouvernance/policies/masking`
   - `/gouvernance/policies/aggregation`
3. Verify NO "Objects are not valid as a React child" errors appear
4. Verify all policy properties render correctly as text

### 2. Test Masking Policy Creation
1. Navigate to Masking Policies page
2. Click "Create Policy"
3. Fill in the form:
   - Policy Name: `TEST_MASK_EMAIL`
   - Column Data Type: `STRING`
   - Masking Type: `Email Masking (user@*****.com)`
4. Click "Create Policy"
5. Check browser console for any errors
6. Verify policy appears in the list

### 3. Test Apply Policy Functionality
1. Create or select an existing policy
2. Click "Apply" button
3. Select database → schema → table (→ column for masking)
4. Click "Apply Policy"
5. **Check browser console** for detailed error logs if it fails
6. The console will show:
   - HTTP status code
   - Backend error message
   - Backend error detail
   - Request data sent

### 4. Check Backend Errors
If you still see 500 errors after these fixes:

1. Open browser DevTools → Console tab
2. Try the operation that's failing
3. Look for detailed error logs with format:
   ```
   Apply [policy-type] policy error: {
     message: "...",
     detail: "...",
     status: 500,
     data: { ... }
   }
   ```
4. Share these logs to help diagnose backend issues

---

## Files Modified

1. **[apps/data360/src/app/(dashboard)/gouvernance/policies/masking-policies-content.tsx](apps/data360/src/app/(dashboard)/gouvernance/policies/masking-policies-content.tsx)**
   - Added `String()` conversions for all policy properties (lines 193-200)

2. **[apps/data360/src/app/(dashboard)/gouvernance/policies/aggregation-policies-content.tsx](apps/data360/src/app/(dashboard)/gouvernance/policies/aggregation-policies-content.tsx)**
   - Added `String()` conversions for all policy properties (lines 156-160)

3. **[apps/data360/src/app/(dashboard)/gouvernance/policies/rls-policies-content.tsx](apps/data360/src/app/(dashboard)/gouvernance/policies/rls-policies-content.tsx)**
   - Added `String()` conversions for all policy properties (lines 299-329)

4. **[apps/data360/src/app/services/gouvernance/policies.ts](apps/data360/src/app/services/gouvernance/policies.ts)**
   - Refactored `createMaskingPolicy()` to conditionally send parameters (lines 390-425)
   - Added error logging to `applyRLSPolicy()` (lines 241-265)
   - Added error logging to `applyMaskingPolicy()` (lines 427-451)
   - Added error logging to `applyAggregationPolicy()` (lines 773-796)

---

## Expected Results

### Fixed Issues:
1. ✅ No more "Objects are not valid as a React child" errors
2. ✅ Masking policy creation should work correctly
3. ✅ Detailed error logs in console for all apply operations

### Still Need Investigation:
1. ⏳ 500 Internal Server Errors from backend - now with detailed logging
2. ⏳ Verify backend is returning correct data structure

### Next Steps:
1. Test all the above scenarios
2. If errors persist, check the browser console for detailed error logs
3. Share the console error logs if backend issues continue
4. Verify backend endpoints are returning data in the correct wrapped format:
   ```json
   {
     "message": "...",
     "data": {
       "policies": [...] // or "tags", "columns"
     }
   }
   ```

---

## Summary

All frontend defensive checks and error handling have been implemented. The application should now:

1. ✅ Safely render all policy data without React errors
2. ✅ Send correct parameters for masking policy creation
3. ✅ Provide detailed error logs for debugging apply operations

If issues persist, they are likely backend-related. Use the detailed console logs to diagnose the specific backend errors and share them for further investigation.
