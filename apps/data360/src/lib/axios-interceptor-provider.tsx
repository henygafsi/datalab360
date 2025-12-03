'use client';

import { useEffect } from 'react';
import { setupAxiosInterceptor } from './axios-interceptor';

/**
 * Client component that initializes the global axios interceptor
 * Must be rendered in the app to catch backend connectivity issues
 */
export default function AxiosInterceptorProvider() {
  useEffect(() => {
    setupAxiosInterceptor();
  }, []);

  return null;
}
