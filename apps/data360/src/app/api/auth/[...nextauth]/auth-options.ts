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
          //id: access_token.idaccess_token as string,
          id: token.idUser as string, // Set user ID from access_token
          access_token: token.access_token as string, // Set access_token in session
          email: token.email as string, // Add email to session from JWT access_token
          username: token.username as string, // Add username to session from JWT access_token
        },
      };
    },
    async jwt({ token, user }) {
      if (user) {
      token.idUser = user.id;  // Add user ID
      token.email = user.email; // Add email
      token.username = (user as any).username; // Add username
      token.access_token = (user as any).access_token; // ✅ <-- This line is missing in your version
    }
      return token;
    },
    async redirect({ url, baseUrl }) {
      return baseUrl;
    },
  },
  providers: [
    CredentialsProvider({
      id: 'credentials',
      name: 'Credentials',
      credentials: {
        username: { label: 'Email', type: 'text' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) {
          return null;
        }

        const loginData: LoginData = {
          email: credentials.username,
          password: credentials.password,
        };

        try {
          // Call the login service
          const response: LoginResponse = await login(loginData);

          // If login is successful, return the user object
          if (response.access_token) {
            return {
              id: response.idUser,
              username: credentials.username,
              access_token: response.access_token,
              message: response.message,
              email: response.email,
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
