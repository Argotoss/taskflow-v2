/* eslint-disable no-unused-vars, @typescript-eslint/no-unused-vars */
import type * as fastifyJwt from '@fastify/jwt';
import type { HttpErrors } from '@fastify/sensible';
import type { SendOptions } from '@fastify/static';
import type { FastifyCookieOptions } from '@fastify/cookie';

declare module 'fastify' {
  interface FastifyInstance {
    httpErrors: HttpErrors;
    jwt: fastifyJwt.JWT;
  }

  interface FastifyRequest {
    jwtVerify(): Promise<void>;
    user: fastifyJwt.FastifyJWT['user'];
    cookies: Record<string, string>;
  }

  interface FastifyReply {
    sendFile(_filename: string, _rootPath?: string): this;
    sendFile(_filename: string, _options?: SendOptions): this;
    sendFile(_filename: string, _rootPath?: string, _options?: SendOptions): this;
    notFound(message?: string): this;
    setCookie(name: string, value: string, options?: FastifyCookieOptions): this;
    clearCookie(name: string, options?: FastifyCookieOptions): this;
  }
}
