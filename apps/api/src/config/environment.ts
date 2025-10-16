import { loadEnv } from '@taskflow/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).default(3000),
  JWT_SECRET: z.string().min(32).default('change-this-in-production-change-this-in-production'),
  JWT_EXPIRES_IN_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  RESET_PASSWORD_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(60),
  AWS_REGION: z.string().min(1).default('us-east-1'),
  ATTACHMENTS_BUCKET: z.string().min(1).default('taskflow-local-attachments')
});

export const environment = loadEnv(schema);
