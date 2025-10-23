import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import type { FastifyPluginAsync } from 'fastify';
import { environment } from '../config/environment.js';

const normalizeOrigins = (origins: string[]): true | string[] => {
  if (origins.length === 0) {
    return true;
  }
  if (origins.includes('*')) {
    return true;
  }
  return origins;
};

const corsPlugin: FastifyPluginAsync = async (app) => {
  await app.register(cors, {
    origin: normalizeOrigins(environment.CORS_ORIGIN),
    credentials: true
  });
};

export default fp(corsPlugin);
