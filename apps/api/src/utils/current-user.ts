import { z } from 'zod';
import type { FastifyRequest } from 'fastify';

const payloadSchema = z.object({
  sub: z.string().uuid()
});

export const requireUserId = async (request: FastifyRequest): Promise<string> => {
  try {
    await request.jwtVerify();
  } catch {
    throw request.server.httpErrors.unauthorized('Authentication required');
  }

  const parsed = payloadSchema.safeParse(request.user);

  if (!parsed.success) {
    throw request.server.httpErrors.unauthorized('Invalid authentication context');
  }

  return parsed.data.sub;
};
