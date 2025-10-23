#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import fs from 'node:fs';
import process from 'node:process';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, '..');
const composeFile = resolve(projectRoot, 'docker-compose.dev.yml');

const log = (message) => {
  process.stdout.write(`${message}\n`);
};

const run = (command, args, options = {}) =>
  new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      ...options
    });

    child.on('close', (code, signal) => {
      if (signal === 'SIGINT' || signal === 'SIGTERM') {
        rejectPromise(new Error(`${command} terminated by signal ${signal}`));
        return;
      }
      if (code !== 0) {
        rejectPromise(new Error(`${command} exited with code ${code}`));
        return;
      }
      resolvePromise();
    });
  });

const loadEnvFile = () => {
  const envLocal = resolve(projectRoot, '.env.local');
  const envDefault = resolve(projectRoot, '.env');

  if (fs.existsSync(envLocal)) {
    log('• Loading environment from .env.local');
    const envEntries = fs.readFileSync(envLocal, 'utf8').split('\n');
    for (const entry of envEntries) {
      const trimmed = entry.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=');
      process.env[key] ??= value;
    }
    return;
  }

  if (fs.existsSync(envDefault)) {
    log('• Loading environment from .env');
    const envEntries = fs.readFileSync(envDefault, 'utf8').split('\n');
    for (const entry of envEntries) {
      const trimmed = entry.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...valueParts] = trimmed.split('=');
      const value = valueParts.join('=');
      process.env[key] ??= value;
    }
  }
};

const ensureEnvDefaults = () => {
  const defaults = {
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/taskflow?schema=public',
    JWT_SECRET: 'dev-jwt-secret',
    REFRESH_TOKEN_TTL_DAYS: '30',
    RESET_PASSWORD_TOKEN_TTL_MINUTES: '60',
    REDIS_URL: 'redis://localhost:6379',
    ATTACHMENTS_BUCKET: 'local-attachments',
    AWS_REGION: 'us-east-1',
    VITE_API_BASE_URL: 'http://localhost:3000'
  };

  for (const [key, value] of Object.entries(defaults)) {
    if (!process.env[key] || process.env[key]?.length === 0) {
      process.env[key] = value;
      log(`• Using default ${key}=${value}`);
    }
  }
};

const waitForDatabase = async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    log('• DATABASE_URL not set, skipping database readiness check');
    return;
  }

  let host = 'localhost';
  let port = '5432';

  try {
    const parsed = new NodeURL(databaseUrl.replace('postgresql://', 'postgres://'));
    host = parsed.hostname || host;
    port = parsed.port || port;
  } catch (error) {
    log(`• Warning: unable to parse DATABASE_URL (${error.message}), falling back to tcp:localhost:5432`);
  }

  log(`► Waiting for database at ${host}:${port}`);
  await run('npx', ['wait-on', `tcp:${host}:${port}`, '--timeout', '30000']);
};

const detectComposeCommand = () => {
  const preferred = process.env.CONTAINER_RUNTIME?.trim().toLowerCase();
  const candidates = preferred ? [preferred] : ['docker', 'podman'];

  for (const runtime of candidates) {
    const check = spawnSync(runtime, ['--version'], {
      stdio: 'ignore',
      shell: process.platform === 'win32'
    });

    if (check.status === 0) {
      if (runtime === 'docker' || runtime === 'podman') {
        return runtime;
      }
      return runtime;
    }
  }

  throw new Error(
    'Container runtime not found. Install Docker or Podman and ensure it is on your PATH, or set CONTAINER_RUNTIME to the runtime executable.'
  );
};

const main = async () => {
  const args = process.argv.slice(2);
  const shouldSeed = args.includes('--seed');

  loadEnvFile();
  ensureEnvDefaults();

  if (!fs.existsSync(composeFile)) {
    throw new Error(`Cannot find ${composeFile}. Please ensure docker-compose.dev.yml exists in the project root.`);
  }

  const compose = detectComposeCommand();
  log(`► Starting local services via ${compose} compose`);
  const composeArgs = ['compose', '-f', composeFile, 'up', '-d'];
  await run(compose, composeArgs);

  await waitForDatabase();

  log('► Generating Prisma client');
  await run('npm', ['run', 'prisma:generate']);

  log('► Applying database migrations');
  await run('npx', ['prisma', 'migrate', 'deploy', '--schema', 'packages/db/prisma/schema.prisma']);

  if (shouldSeed) {
    log('► Seeding database');
    await run('npm', ['run', 'db:seed']);
  }

  log('► Launching API and Web dev servers');
  const apiProcess = spawn('npm', ['run', 'dev', '--workspace', '@taskflow/api'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env
  });

  const webProcess = spawn('npm', ['run', 'dev', '--workspace', '@taskflow/web'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env
  });

  const shutdown = (signal) => {
    log(`\n► Received ${signal}, shutting down…`);
    apiProcess.kill('SIGINT');
    webProcess.kill('SIGINT');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  apiProcess.on('exit', (code) => {
    if (code !== 0) {
      log(`API dev server exited with code ${code}`);
    }
  });
  webProcess.on('exit', (code) => {
    if (code !== 0) {
      log(`Web dev server exited with code ${code}`);
    }
  });
};

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
});
