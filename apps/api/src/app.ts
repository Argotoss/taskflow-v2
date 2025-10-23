import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import sensible from '@fastify/sensible';
import cookiePlugin from './plugins/cookie.js';
import jwtPlugin from './plugins/jwt.js';
import prismaPlugin from './plugins/prisma.js';
import corsPlugin from './plugins/cors.js';
import { registerAuthRoutes } from './routes/auth.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerProfileRoutes } from './routes/profile.js';
import { registerWorkspaceRoutes } from './routes/workspaces.js';
import { registerProjectRoutes } from './routes/projects.js';
import { registerTaskRoutes } from './routes/tasks.js';
import { registerCommentRoutes } from './routes/comments.js';
import { registerAttachmentRoutes } from './routes/attachments.js';
import staticAssetsPlugin from './plugins/static.js';
import rateLimitPlugin from './plugins/rate-limit.js';

export const buildApp = (): FastifyInstance => {
  const app = Fastify({ logger: true });

  void app.register(sensible);
  void app.register(corsPlugin);
  void app.register(cookiePlugin);
  void app.register(jwtPlugin);
  void app.register(prismaPlugin);
  void app.register(rateLimitPlugin);
  app.register(registerAuthRoutes);
  app.register(registerProfileRoutes);
  app.register(registerHealthRoutes, { prefix: '/health' });
  app.register(registerWorkspaceRoutes);
  app.register(registerProjectRoutes);
  app.register(registerTaskRoutes);
  app.register(registerCommentRoutes);
  app.register(registerAttachmentRoutes);
  void app.register(staticAssetsPlugin);

  return app;
};
