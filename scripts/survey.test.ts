// How much of a folder of songs the canvas models with real nodes, and
// what is left as raw code (Code and Method nodes). Run with `pnpm survey
// <folder>`; see scripts/survey.mjs.
import { it } from 'vitest';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseProgram } from '@/lib/program/parse';
import { flatten } from '@/lib/program/compile';

const folder = process.env.SURVEY_DIR!;
const out = process.env.SURVEY_OUT;
const SONG = /\.(strudel|strudel\.js)$/;

function songs(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return songs(path);
    return SONG.test(name) && !name.includes('.original.') ? [path] : [];
  });
}
const count = (map: Map<string, number>, key: string) =>
  map.set(key, (map.get(key) ?? 0) + 1);
const top = (map: Map<string, number>, n: number) =>
  [...map]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([key, value]) => `${key} ${value}`)
    .join(', ');

it('surveys the songs', () => {
  const files = songs(folder);
  const types = new Map<string, number>();
  const methods = new Map<string, number>();
  const sources = new Map<string, number>();
  const failed: string[] = [];
  let lines = 0;
  for (const file of files) {
    // Embedded samples (one huge line) say nothing about the code.
    const code = readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => line.length < 3000)
      .join('\n');
    const result = parseProgram(code);
    if (!result.ok) {
      failed.push(file);
      continue;
    }
    for (const line of result.program.lines) {
      lines++;
      for (const node of flatten(line.sink)) {
        count(types, node.type);
        if (node.type === 'method-node')
          for (const [, name] of String(node.data.calls).matchAll(
            /(?:^|\.)\s*([A-Za-z_$][\w$]*)\(/g,
          ))
            count(methods, name);
        if (node.type === 'custom-node')
          count(
            sources,
            /^([A-Za-z_$][\w$]*)\(/.exec(
              String(node.data.customPattern),
            )?.[1] ?? '(other)',
          );
      }
    }
  }
  const total = [...types.values()].reduce((a, b) => a + b, 0);
  const raw = (types.get('method-node') ?? 0) + (types.get('custom-node') ?? 0);
  const report = {
    songs: files.length,
    failed,
    lines,
    nodes: total,
    rawNodes: raw,
    rawPercent: Math.round((1000 * raw) / Math.max(total, 1)) / 10,
    byType: Object.fromEntries([...types].sort((a, b) => b[1] - a[1])),
    rawMethods: Object.fromEntries([...methods].sort((a, b) => b[1] - a[1])),
    codeSources: Object.fromEntries([...sources].sort((a, b) => b[1] - a[1])),
  };
  if (out) writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(
    [
      `${files.length} songs, ${lines} lines, ${total} nodes${failed.length ? ` (${failed.length} did not parse)` : ''}`,
      `raw code: ${raw} nodes (${report.rawPercent}%)`,
      `most raw methods: ${top(methods, 15)}`,
      `Code nodes start with: ${top(sources, 8)}`,
    ].join('\n'),
  );
});
