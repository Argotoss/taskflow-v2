import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { loadEnv } from './index.js';

describe('loadEnv', () => {
  it('merges process variables with overrides', () => {
    const schema = z.object({
      FOO: z.string(),
      BAR: z.string()
    });

    process.env.FOO = 'from-process';

    const env = loadEnv(schema, {
      overrides: {
        BAR: 'from-override'
      }
    });

    expect(env).toEqual({
      FOO: 'from-process',
      BAR: 'from-override'
    });
  });

  it('supports disabling process env usage', () => {
    const schema = z.object({
      BAZ: z.string()
    });

    process.env.BAZ = 'ignored';

    const env = loadEnv(schema, {
      useProcessEnv: false,
      overrides: {
        BAZ: 'from-override'
      }
    });

    expect(env.BAZ).toBe('from-override');
  });
});
