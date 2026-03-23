import { z } from 'zod';

const snowflakeIdentifier = z
  .string()
  .min(1, 'Name is required')
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*$/,
    'Must start with a letter or underscore and contain only letters, numbers, and underscores'
  );

const columnSchema = z.object({
  id: z.string(),
  name: snowflakeIdentifier,
  dataType: z.string().min(1, 'Data type is required'),
  nullable: z.boolean(),
  primaryKey: z.boolean(),
  defaultValue: z.string().optional(),
  comment: z.string().optional(),
});

// Zod validation schema for Create Table form
export const createTableSchema = z
  .object({
    tableName: snowflakeIdentifier,
    tableType: z.enum(['standard', 'temporary', 'transient', 'external', 'iceberg']),
    tableComment: z.string().optional(),
    columns: z.array(columnSchema).min(1, 'At least one column is required'),
    // External table fields
    stageLocation: z.string().optional(),
    fileFormat: z.string().optional(),
    filePattern: z.string().optional(),
    autoRefresh: z.boolean().optional(),
    // Iceberg table fields
    externalVolume: z.string().optional(),
    icebergCatalog: z.string().optional(),
    baseLocation: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.tableType === 'external' && !data.stageLocation?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Stage location is required for external tables',
        path: ['stageLocation'],
      });
    }
    if (data.tableType === 'iceberg') {
      if (!data.externalVolume?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'External volume is required for Iceberg tables',
          path: ['externalVolume'],
        });
      }
      if (!data.baseLocation?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Base location is required for Iceberg tables',
          path: ['baseLocation'],
        });
      }
    }
    // Check for duplicate column names
    const names = data.columns
      .map((c) => c.name.trim().toUpperCase())
      .filter(Boolean);
    const seen = new Set<string>();
    for (const name of names) {
      if (seen.has(name)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate column name: ${name}`,
          path: ['columns'],
        });
        break;
      }
      seen.add(name);
    }
  });

export type CreateTableFormValues = z.infer<typeof createTableSchema>;
