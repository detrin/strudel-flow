#!/usr/bin/env node
// Fails when src/ has an import cycle (type-only imports don't count: they
// vanish at runtime). Cycles made hot reloads crash into a blank page
// (a module re-run before what it imports had finished), so none are
// allowed. Part of `pnpm check`.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'src');

const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)
      ? [path]
      : [];
  });

const EXTENSIONS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];
function resolveImport(from, spec) {
  let base;
  if (spec.startsWith('@/')) base = join(src, spec.slice(2));
  else if (spec.startsWith('.')) base = resolve(dirname(from), spec);
  else return null;
  for (const extension of EXTENSIONS) {
    const path = base + extension;
    if (existsSync(path) && statSync(path).isFile()) return path;
  }
  return null;
}

// Runtime imports: `import x from`, `import { a } from`, `import 'side'`,
// `export … from`; not `import type`/`export type`, nor `{ type a }` only.
const IMPORT =
  /(?:^|\n)\s*(import|export)\s+(type\s+)?([^'"]*?)\s*(?:from\s*)?['"]([^'"]+)['"]/g;
function importsOf(path) {
  const text = readFileSync(path, 'utf8');
  const out = [];
  for (const match of text.matchAll(IMPORT)) {
    const [, keyword, typeOnly, clause, spec] = match;
    if (typeOnly) continue;
    if (keyword === 'export' && !/\bfrom\b/.test(match[0])) continue;
    // `import { type A, type B } from` is type-only too.
    const names = /^\{([^}]*)\}$/.exec(clause.trim())?.[1];
    if (
      names &&
      names
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean)
        .every((name) => name.startsWith('type '))
    )
      continue;
    const target = resolveImport(path, spec);
    if (target) out.push(target);
  }
  return out;
}

const graph = new Map(files(src).map((path) => [path, importsOf(path)]));

// Tarjan's strongly connected components: each one bigger than a single
// module (or a module importing itself) is a cycle.
let index = 0;
const stack = [];
const on = new Set();
const indexOf = new Map();
const low = new Map();
const cycles = [];
function visit(node) {
  indexOf.set(node, index);
  low.set(node, index++);
  stack.push(node);
  on.add(node);
  for (const next of graph.get(node) ?? []) {
    if (!graph.has(next)) continue;
    if (!indexOf.has(next)) {
      visit(next);
      low.set(node, Math.min(low.get(node), low.get(next)));
    } else if (on.has(next))
      low.set(node, Math.min(low.get(node), indexOf.get(next)));
  }
  if (low.get(node) === indexOf.get(node)) {
    const component = [];
    let member;
    do {
      member = stack.pop();
      on.delete(member);
      component.push(member);
    } while (member !== node);
    if (component.length > 1 || graph.get(node).includes(node))
      cycles.push(component);
  }
}
for (const node of graph.keys()) if (!indexOf.has(node)) visit(node);

if (cycles.length) {
  console.error(`Import cycles in src/ (${cycles.length}):`);
  for (const cycle of cycles)
    console.error(`  ${cycle.map((path) => relative(src, path)).join(' → ')}`);
  console.error(
    'Break each one: move what both need into a module that imports neither.',
  );
  process.exit(1);
}
console.log(`No import cycles (${graph.size} modules).`);
