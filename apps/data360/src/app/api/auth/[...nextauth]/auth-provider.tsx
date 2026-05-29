'use client';

import { SessionProvider } from 'next-auth/react';

const SESSION_REFETCH_INTERVAL = 300; // seconds (5 min) – reduce /api/auth/session polling

export default function AuthProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session: any;
}): React.ReactNode {
  return (
    <SessionProvider session={session} refetchInterval={SESSION_REFETCH_INTERVAL} refetchOnWindowFocus={false}>
      {children}
    </SessionProvider>
  );
}
