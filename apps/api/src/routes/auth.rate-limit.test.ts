import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app.js';
import { environment } from '../config/environment.js';

const loginPayload = {
  email: 'rate.limit@test.dev',
  password: 'irrelevant'
};

describe('auth rate limiting', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = buildApp();
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
    vi.restoreAllMocks();
  });

  it('throttles repeated login attempts from the same address', async () => {
    vi.spyOn(app.prisma.user, 'findUnique').mockResolvedValue(null);

    const attempts = environment.AUTH_RATE_LIMIT_MAX;
    for (let index = 0; index < attempts; index += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: loginPayload,
        remoteAddress: '203.0.113.5'
      });
      expect(response.statusCode).toBe(401);
    }

    const limited = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: loginPayload,
      remoteAddress: '203.0.113.5'
    });

    expect(limited.statusCode).toBe(429);

    const differentAddress = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: loginPayload,
      remoteAddress: '203.0.113.6'
    });

    expect(differentAddress.statusCode).toBe(401);
  });
});
