#!/usr/bin/env node
import process from 'node:process';
import { spawn } from 'node:child_process';

const defaultUrl = 'postgresql://postgres:postgres@localhost:5432/taskflow';
const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? defaultUrl
};

const child = spawn('npx', ['prisma', 'generate', '--schema', 'packages/db/prisma/schema.prisma'], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32'
});

child.on('close', (code) => {
  process.exit(code ?? 1);
});
