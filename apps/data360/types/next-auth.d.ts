import { DefaultSession } from 'next-auth';
import 'next-auth/jwt';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      username: string;   // Add the username field
      access_token: string;      // Add the token field
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  /** Returned by the `jwt` callback and `getToken`, when using JWT sessions */
  interface JWT {
    idToken?: string;
    idUser?: string;    // Add the idUser field
    access_token?: string;     // Add the token field
    username?: string;  // Add the username field
  }
}
