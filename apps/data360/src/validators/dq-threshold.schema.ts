import { z } from 'zod';

// Zod validation schema for Data Quality Threshold form
export const dqThresholdSchema = z.object({
  table_name: z.string().optional(),
  metric: z.enum(['completeness', 'uniqueness', 'freshness', 'schema'], {
    required_error: 'Metric is required',
  }),
  threshold: z
    .number({ required_error: 'Threshold is required', invalid_type_error: 'Threshold must be a number' })
    .min(0, 'Threshold must be at least 0%')
    .max(100, 'Threshold cannot exceed 100%'),
});

export type DQThresholdFormValues = z.infer<typeof dqThresholdSchema>;
