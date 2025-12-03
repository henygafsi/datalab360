import { routes } from '@/config/routes';
import { PagesOptions } from 'next-auth';

export const pagesOptions: Partial<PagesOptions> = {
  signIn: routes.signIn,
  error: routes.signIn, // Redirect to sign-in on auth errors (including backend disconnection)
};
