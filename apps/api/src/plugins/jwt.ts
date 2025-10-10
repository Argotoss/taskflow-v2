import fp from 'fastify-plugin';
import jwt from '@fastify/jwt';
import { environment } from '../config/environment.js';

export default fp(async (app) => {
  await app.register(jwt, {
    secret: environment.JWT_SECRET,
    sign: {
      expiresIn: environment.JWT_EXPIRES_IN
    }
  });
});
