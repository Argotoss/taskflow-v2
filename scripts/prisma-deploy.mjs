#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const schemaArg = ['--schema', 'packages/db/prisma/schema.prisma'];

const run = (cmd, args, env = process.env) => {
  const res = spawnSync(cmd, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
  return res.status ?? 1;
};

const tryDeploy = () => run('npx', ['prisma', 'migrate', 'deploy', ...schemaArg]);

const tryResolve = (name) => {
  const rolled = run('npx', ['prisma', 'migrate', 'resolve', '--rolled-back', name, ...schemaArg]);
  if (rolled !== 0) return rolled;
  return run('npx', ['prisma', 'migrate', 'resolve', '--applied', name, ...schemaArg]);
};

const firstAttempt = spawnSync('npx', ['prisma', 'migrate', 'deploy', ...schemaArg], {
  env: process.env,
  shell: process.platform === 'win32',
  encoding: 'utf8'
});

if ((firstAttempt.status ?? 1) === 0) {
  process.exit(0);
}

const stderr = [firstAttempt.stdout, firstAttempt.stderr].filter(Boolean).join('\n');

const p3009 = /P3009/.test(stderr);
const failedNameMatch = stderr.match(/The `(.*?)` migration/);

if (p3009 && failedNameMatch && failedNameMatch[1]) {
  const name = failedNameMatch[1];
  const resolved = tryResolve(name);
  if (resolved !== 0) {
    process.exit(resolved);
  }
  const again = tryDeploy();
  process.exit(again);
}

process.exit(firstAttempt.status ?? 1);

