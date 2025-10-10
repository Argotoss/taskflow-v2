import { loadEnv } from '@taskflow/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  HOST: z.string().min(1).default('0.0.0.0'),
  PORT: z.coerce.number().int().min(1).default(3000),
  JWT_SECRET: z.string().min(32).default('change-this-in-production-change-this-in-production'),
  JWT_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30)
});

export const environment = loadEnv(schema);
