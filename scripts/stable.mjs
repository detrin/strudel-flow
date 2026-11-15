#!/usr/bin/env node
// The stable app: `main` built once and served on its own port, so the app
// you play in never changes under you while code is being edited.
//
//   pnpm stable [ref]        (default: origin/main, else main)
//
// It keeps a git worktree of the ref next to this repo (../strudelton-stable,
// or STRUDELTON_STABLE_DIR), builds it with the bridge on, and serves it
// with `vite preview` on :5174 (STRUDELTON_STABLE_PORT): the Library, the
// bridge for Claude Code and /local/ files work as in development. Run it
// again to pick up new commits, then reload the tab.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dir = resolve(
  process.env.STRUDELTON_STABLE_DIR ?? join(repo, '..', 'strudelton-stable'),
);
const port = process.env.STRUDELTON_STABLE_PORT ?? '5174';
const run = (command, args, options = {}) =>
  execFileSync(command, args, { stdio: 'inherit', ...options });
const quiet = (command, args, options = {}) =>
  execFileSync(command, args, { encoding: 'utf8', ...options }).trim();

let ref = process.argv[2];
if (!ref) {
  try {
    quiet('git', ['-C', repo, 'fetch', '--quiet', 'origin', 'main']);
    ref = 'origin/main';
  } catch {
    ref = 'main';
  }
}
const commit = quiet('git', ['-C', repo, 'rev-parse', ref]);

if (!existsSync(join(dir, '.git')))
  run('git', ['-C', repo, 'worktree', 'add', '--detach', dir, commit]);
else
  run('git', ['-C', dir, 'checkout', '--quiet', '--detach', '--force', commit]);

console.log(
  `\nStable app: ${quiet('git', ['-C', dir, 'log', '-1', '--format=%h %s'])}`,
);
run('pnpm', ['install', '--frozen-lockfile', '--prefer-offline', '--silent'], {
  cwd: dir,
});

// The repo's .env.local (STRUDELTON_LOCAL …) applies to the stable app too.
const env = { ...process.env, VITE_BRIDGE: 'on' };
const local = join(repo, '.env.local');
if (existsSync(local))
  for (const line of readFileSync(local, 'utf8').split('\n')) {
    const match = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match && !(match[1] in process.env))
      env[match[1]] = match[2].replace(/^['"]|['"]$/g, '');
  }
// Relative paths in .env.local mean relative to this repo.
if (env.STRUDELTON_LOCAL)
  env.STRUDELTON_LOCAL = resolve(repo, env.STRUDELTON_LOCAL);

run('pnpm', ['exec', 'vite', 'build', '--logLevel', 'warn'], { cwd: dir, env });
console.log(`\nServing http://localhost:${port} (Ctrl+C stops it)\n`);
const server = spawn(
  'pnpm',
  ['exec', 'vite', 'preview', '--port', port, '--strictPort'],
  { cwd: dir, env, stdio: 'inherit' },
);
server.on('exit', (code) => process.exit(code ?? 0));
