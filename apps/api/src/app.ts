import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { registerHealthRoutes } from './routes/health.js';

export const buildApp = (): FastifyInstance => {
  const app = Fastify({ logger: true });

  app.register(registerHealthRoutes, { prefix: '/health' });

  return app;
};
