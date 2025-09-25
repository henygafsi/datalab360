'use client';

import { signIn } from 'next-auth/react';

export async function silentReauth(): Promise<boolean> {
  try {
    if (typeof window === 'undefined') return false;
    const account_name = window.sessionStorage.getItem('auth.account_name') || window.localStorage.getItem('auth.account_name');
    const username = window.sessionStorage.getItem('auth.username') || window.localStorage.getItem('auth.username');
    const password = window.sessionStorage.getItem('auth.password') || window.localStorage.getItem('auth.password');
    if (!account_name || !username || !password) {
      return false;
    }
    const res = await signIn('credentials', {
      redirect: false,
      account_name,
      username,
      password,
    });
    return !res?.error;
  } catch {
    return false;
  }
}









