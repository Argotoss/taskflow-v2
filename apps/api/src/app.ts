import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import jwtPlugin from './plugins/jwt.js';
import prismaPlugin from './plugins/prisma.js';
import { registerHealthRoutes } from './routes/health.js';

export const buildApp = (): FastifyInstance => {
  const app = Fastify({ logger: true });

  void app.register(sensible);
  void app.register(jwtPlugin);
  void app.register(prismaPlugin);
  app.register(registerHealthRoutes, { prefix: '/health' });

  return app;
};
