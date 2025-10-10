import { config as loadDotenv } from 'dotenv';
import type { ZodTypeAny } from 'zod';

type EnvOverrides = Record<string, string | undefined>;

interface LoadEnvOptions {
  path?: string;
  overrides?: EnvOverrides;
  useProcessEnv?: boolean;
}

let dotenvLoaded = false;

const mergeSources = (overrides?: EnvOverrides, useProcessEnv: boolean = true): EnvOverrides => {
  const base: EnvOverrides = useProcessEnv ? { ...process.env } : {};
  if (!overrides) {
    return base;
  }

  return Object.keys(overrides).reduce<EnvOverrides>((acc, key) => {
    const value = overrides[key];
    if (typeof value === 'undefined') {
      delete acc[key];
    } else {
      acc[key] = value;
    }
    return acc;
  }, base);
};

export const loadEnv = <Schema extends ZodTypeAny>(
  schema: Schema,
  options?: LoadEnvOptions
): ReturnType<Schema['parse']> => {
  if (!dotenvLoaded) {
    if (options?.path) {
      loadDotenv({ path: options.path });
    } else {
      loadDotenv();
    }
    dotenvLoaded = true;
  }

  const source = mergeSources(options?.overrides, options?.useProcessEnv ?? true);
  return schema.parse(source);
};
