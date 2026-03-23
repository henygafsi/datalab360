import { z } from 'zod';

// Zod validation schema for RLS Policy creation form
export const rlsPolicySchema = z.object({
  policy_name: z
    .string()
    .min(1, 'Policy name is required')
    .regex(
      /^[A-Za-z_][A-Za-z0-9_]*$/,
      'Policy name must start with a letter or underscore and contain only letters, numbers, and underscores'
    ),
  signature: z
    .string()
    .min(1, 'Signature is required')
    .regex(/^\(.*\)$/, 'Signature must be in the format (param_name TYPE)'),
  expression: z
    .string()
    .min(1, 'Expression is required')
    .min(5, 'Expression must be at least 5 characters'),
  description: z.string().optional(),
  expiration_date: z.string().optional(),
});

export type RLSPolicyFormValues = z.infer<typeof rlsPolicySchema>;
