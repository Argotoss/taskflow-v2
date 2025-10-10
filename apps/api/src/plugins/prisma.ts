import fp from 'fastify-plugin';
import { prisma } from '@taskflow/db';
import type { FastifyInstance } from 'fastify';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: typeof prisma;
  }
}

export default fp(async (app: FastifyInstance) => {
  app.decorate('prisma', prisma);

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
});
