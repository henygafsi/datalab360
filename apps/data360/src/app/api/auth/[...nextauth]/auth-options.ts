import { type NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { env } from '@/env.mjs';
import { pagesOptions } from './pages-options';
import { login, LoginData, LoginResponse } from '@/app/services/auth/login';

export const authOptions: NextAuthOptions = {
  // debug: true,
  pages: {
    ...pagesOptions,
  },
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },
  callbacks: {
    async session({ session, token }) {
      return {
        ...session,
        user: {
          ...session.user,
          //id: access_token.idaccess_token as string, // This line seems like a leftover or typo
          access_token: token.access_token as string, // Set access_token in session
          account_name: token.account_name as string, // Add account_name to session from JWT access_token
          username: token.username as string, // Add username to session from JWT access_token
          role: token.role as string,
          items: token.items as any  // Keep as array, not string

        },
      };
    },
    async jwt({ token, user }) {
      if (user) {
        token.account_name = (user as any).account_name;  // Add account_name from user to token
        token.username = (user as any).username; // Add username from user to token
        token.role = (user as any).role;
        token.items = (user as any).items
        token.access_token = (user as any).access_token; // ✅ THIS LINE IS CRUCIAL AND NOW INCLUDED
      }
      return token;
    },
    async redirect({ url, baseUrl }) {
      // After login, always redirect to account-overview page
      // Handle callback URLs
      if (url.startsWith('/')) {
        // If it's just the root or sign-in page, redirect to account-overview
        if (url === '/' || url.startsWith('/signin')) {
          return `${baseUrl}/account-overview`;
        }
        // If it's another internal path, use it
        return `${baseUrl}${url}`;
      }
      // If the URL already includes the baseUrl
      if (url.startsWith(baseUrl)) {
        // Check if it's the root path
        if (url === baseUrl || url === `${baseUrl}/` || url.startsWith(`${baseUrl}/signin`)) {
          return `${baseUrl}/account-overview`;
        }
        return url;
      }
      // Default to account-overview
      return `${baseUrl}/account-overview`;
    },
  },
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'Credentials',
      credentials: {
        account_name: { label: 'Account Name', type: 'text' },
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.account_name || !credentials?.username || !credentials?.password) {
          return null;
        }

        const loginData: LoginData = {
          account_name: credentials.account_name,
          username: credentials.username,
          password: credentials.password,
        };

        try {
          // Call the login service
          const response: LoginResponse = await login(loginData);

          // If login is successful, return the user object
          if (response.access_token) {
            // The object returned here is the 'user' object that gets passed to the 'jwt' callback
            return {
              id: response.username, // Ensure you pass an 'id' property if your session expects it
              account_name: credentials.account_name,
              access_token: response.access_token, // Pass the access_token here
              token_type: response.token_type, // Pass token_type if needed in session
              username: credentials.username,
              role: response.role,
              items: response.items,
              message: response.message, // Pass message if needed
            };
          }
        } catch (error) {
          console.error('Login failed:', error);
          return null;
        }

        return null; // Return null if login fails
      },
    }),
    GoogleProvider({
      clientId: env.GOOGLE_CLIENT_ID || '',
      clientSecret: env.GOOGLE_CLIENT_SECRET || '',
      allowDangerousEmailAccountLinking: true,
    }),
  ],
};