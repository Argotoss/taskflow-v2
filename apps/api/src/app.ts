import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import jwtPlugin from './plugins/jwt.js';
import prismaPlugin from './plugins/prisma.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerWorkspaceRoutes } from './routes/workspaces.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerTaskRoutes } from './routes/tasks.js';
import { registerCommentRoutes } from './routes/comments.js';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export const buildApp = (): FastifyInstance => {
  const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  void app.register(sensible);
  void app.register(jwtPlugin);
  void app.register(prismaPlugin);
  app.register(registerHealthRoutes, { prefix: '/health' });
  app.register(registerWorkspaceRoutes);
  app.register(registerProjectRoutes);
  app.register(registerTaskRoutes);
  app.register(registerCommentRoutes);

  return app;
};
