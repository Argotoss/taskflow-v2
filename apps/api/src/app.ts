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
import { registerAttachmentRoutes } from './routes/attachments.js';

export const buildApp = (): FastifyInstance => {
  const app = Fastify({ logger: true });

  void app.register(sensible);
  void app.register(jwtPlugin);
  void app.register(prismaPlugin);
  app.register(registerHealthRoutes, { prefix: '/health' });
  app.register(registerWorkspaceRoutes);
  app.register(registerProjectRoutes);
  app.register(registerTaskRoutes);
  app.register(registerCommentRoutes);
  app.register(registerAttachmentRoutes);

  return app;
};
