import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyInstance } from 'fastify';
import { environment } from '../config/environment.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: Record<string, unknown>;
    user: Record<string, unknown>;
  }
}

export default fp(async (app: FastifyInstance) => {
  await app.register(jwt, {
    secret: environment.JWT_SECRET,
    sign: {
      expiresIn: environment.JWT_EXPIRES_IN
    }
  });
});
