import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import type { FastifyJWT } from '@fastify/jwt';
import { environment } from '../config/environment.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: Record<string, unknown>;
    user: Record<string, unknown>;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    jwt: FastifyJWT;
  }
}

export default fp(async (app) => {
  await app.register(jwt, {
    secret: environment.JWT_SECRET,
    sign: {
      expiresIn: environment.JWT_EXPIRES_IN
    }
  });
});
