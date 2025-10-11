/* eslint-disable no-unused-vars, @typescript-eslint/no-unused-vars */
import type * as fastifyJwt from '@fastify/jwt';
import type { HttpErrors } from '@fastify/sensible';
import type { SendOptions } from '@fastify/static';

declare module 'fastify' {
  interface FastifyInstance {
    httpErrors: HttpErrors;
    jwt: fastifyJwt.JWT;
  }

  interface FastifyReply {
    sendFile(_filename: string, _rootPath?: string): this;
    sendFile(_filename: string, _options?: SendOptions): this;
    sendFile(_filename: string, _rootPath?: string, _options?: SendOptions): this;
  }
}
