import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import fp from 'fastify-plugin';
import fastifyStatic from '@fastify/static';
import '@fastify/static';
import type { FastifyInstance } from 'fastify';

const currentDir = path.dirname(fileURLToPath(new URL('.', import.meta.url)));
const webDistPath = path.resolve(currentDir, '../../web/dist');

const fallbackHtml = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Taskflow</title>
    <style>
      :root {
        color-scheme: light dark;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        background-color: #0f172a;
        color: #f8fafc;
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
      }
      .container {
        text-align: center;
        padding: 3rem 1.5rem;
        max-width: 560px;
      }
      h1 {
        margin-bottom: 1rem;
        font-size: clamp(2.5rem, 4vw, 3.5rem);
        letter-spacing: -0.04em;
      }
      p {
        margin: 0 auto;
        font-size: 1.125rem;
        line-height: 1.6;
        color: rgba(248, 250, 252, 0.82);
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.35rem 0.9rem;
        border-radius: 999px;
        background: rgba(59, 130, 246, 0.18);
        color: #93c5fd;
        font-size: 0.875rem;
        margin-bottom: 2rem;
      }
    </style>
  </head>
  <body>
    <main class="container">
      <span class="badge">Taskflow</span>
      <h1>Build in progress</h1>
      <p>
        The Taskflow web client is not bundled yet. Push a build of the frontend and this
        page will transform into the full workspace experience.
      </p>
    </main>
  </body>
</html>`;

export default fp(async (app: FastifyInstance) => {
  if (!fs.existsSync(webDistPath)) {
    app.log.warn({ webDistPath }, 'web assets not found, serving fallback landing page');
    app.get('/', async (_, reply) => reply.type('text/html').send(fallbackHtml));
    app.get('/*', async (_, reply) => reply.type('text/html').send(fallbackHtml));
    return;
  }

  await app.register(fastifyStatic, {
    root: webDistPath,
    prefix: '/',
    decorateReply: true
  });

  app.get('/', async (_, reply) => reply.type('text/html').sendFile('index.html'));

  app.get('/*', async (request, reply) => {
    if (request.method !== 'GET') {
      return reply.callNotFound();
    }

    const accepts = request.headers.accept ?? '';
    if (!accepts || accepts.includes('text/html') || accepts === '*/*') {
      return reply.type('text/html').sendFile('index.html');
    }

    return reply.callNotFound();
  });
});
