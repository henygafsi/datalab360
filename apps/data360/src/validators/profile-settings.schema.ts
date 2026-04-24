import { z } from 'zod';
import { messages } from '@/config/messages';
import { validateEmail } from './common-rules';

export const profileFormSchema = z.object({
  username: z.string().min(1, { message: messages.firstNameRequired }),
  email: validateEmail.optional(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
});

export type ProfileFormTypes = z.infer<typeof profileFormSchema>;

export const defaultValues = {
  username: '',
  email: '',
  first_name: '',
  last_name: '',
};