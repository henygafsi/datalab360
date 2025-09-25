import { z } from 'zod';
import { messages } from '@/config/messages';
import {
  validateEmail,
  validatePassword,
  validateConfirmPassword,
} from './common-rules';

// form zod validation schema
export const signUpSchema = z.object({
  organisation_name: z.string().min(1, { message: 'Organization is required' }),
  username: z.string(),
  email: validateEmail,
  password: validatePassword,
  confirm_password: validateConfirmPassword,
  isAgreed: z.boolean(),
});

// generate form types from zod validation schema
export type SignUpSchema = z.infer<typeof signUpSchema>;
