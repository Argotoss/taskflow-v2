import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import prismaPlugin from './plugins/prisma.js';
import { registerHealthRoutes } from './routes/health.js';

export const buildApp = (): FastifyInstance => {
  const app = Fastify({ logger: true });

  void app.register(prismaPlugin);
  app.register(registerHealthRoutes, { prefix: '/health' });

  return app;
};
