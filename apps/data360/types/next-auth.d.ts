import { DefaultSession } from 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      username: string;
      account_name: string;
      access_token: string;
      role: string;
      items?: any[];
    } & DefaultSession['user'];
    // Token expiration status
    tokenExpired?: boolean;
    error?: 'TokenExpired' | string;
  }

  interface User {
    id: string;
    username: string;
    account_name: string;
    access_token: string;
    token_type?: string;
    role: string;
    items?: any[];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    idToken?: string;
    idUser?: string;
    access_token?: string;
    token_type?: string;
    account_name?: string;
    username?: string;
    role?: string;
    items?: any[];
    token_issued_at?: number;
  }
}
