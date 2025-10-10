import fp from 'fastify-plugin';
import { prisma } from '@taskflow/db';

declare module 'fastify' {
  interface FastifyInstance {
    prisma: typeof prisma;
  }
}

export default fp(async (app) => {
  app.decorate('prisma', prisma);

  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
});
