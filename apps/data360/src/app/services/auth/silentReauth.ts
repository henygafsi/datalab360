/**
 * Silent re-authentication utility
 * Attempts to refresh the session without user interaction
 */

import { getSession, signIn } from 'next-auth/react';

/**
 * Silently refresh the authentication session
 * Uses NextAuth's built-in session refresh mechanism
 */
export async function silentReauth(): Promise<boolean> {
  try {
    // Get current session
    const session = await getSession();

    if (!session) {
      console.debug('[silentReauth] No active session');
      return false;
    }

    // Trigger a session refresh by updating the session
    // NextAuth handles token refresh automatically when session is accessed
    const event = new Event('visibilitychange');
    document.dispatchEvent(event);

    // Re-fetch session to get refreshed data
    const refreshedSession = await getSession();

    if (refreshedSession) {
      console.debug('[silentReauth] Session refreshed successfully');
      return true;
    }

    return false;
  } catch (error) {
    console.error('[silentReauth] Error refreshing session:', error);
    return false;
  }
}

export default silentReauth;
