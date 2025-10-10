import type { HttpErrors } from '@fastify/sensible';
import type * as fastifyJwt from '@fastify/jwt';

declare module 'fastify' {
  interface FastifyInstance {
    httpErrors: HttpErrors;
    jwt: fastifyJwt.JWT;
  }
}
