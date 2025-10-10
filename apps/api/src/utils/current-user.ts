import { z } from 'zod';
import type { FastifyRequest } from 'fastify';

const headerSchema = z.object({
  userId: z.string().uuid({ message: 'User identifier is required' })
});

export const requireUserId = (request: FastifyRequest): string => {
  const headerValue = request.headers['x-user-id'];
  const parsed = headerSchema.safeParse({ userId: headerValue });

  if (!parsed.success) {
    throw request.server.httpErrors.unauthorized('Missing or invalid user context');
  }

  return parsed.data.userId;
};
