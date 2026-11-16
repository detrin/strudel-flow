import { regionsOf, statementsOf } from '@/lib/lines';

/**
 * Presets are saved lines ("tracks") of a song: the line's code without
 * its label, plus any top-level declarations it uses (a slider's `const`,
 * a shared pattern), so it still plays when inserted into another song.
 */

export type Preset = {
  id: string;
  name: string;
  tags: string[];
  /** The line's expression, without `label:`. */
  body: string;
  /** The label it had. */
  label: string;
  /** `const x = …` statements the body uses. */
  needs: string[];
  createdAt: number;
};

const LAYOUT = /^\s*\/\/\s*@layout\b.*$/;

/**
 * Top-level statements a line can depend on: `const/let/var x = …`,
 * `register('x', …)` and `function x()` (named), and `samples(…)` (the
 * sample packs a song loads; unnamed).
 */
export function declarationsOf(code: string) {
  const out: { name?: string; method?: boolean; text: string }[] = [];
  const rows = code.split('\n');
  const statements = statementsOf(code);
  const offsets: number[] = [];
  rows.reduce((at, row) => (offsets.push(at), at + row.length + 1), 0);
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const declared = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(row);
    const registered =
      /^(?:(?:const|let|var)\s+[\w$]+\s*=\s*)?register\(\s*['"`]([\w$]+)/.exec(
        row,
      );
    const fn = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(row);
    const loads = /^samples\(/.test(row);
    if (!declared && !registered && !fn && !loads) continue;
    let end = i + 1;
    // Continuation rows: to the statement's real end when the code parses
    // (`let x =` with its value on the next rows), else indented rows,
    // closing brackets and chained calls.
    const statement = statements?.find((s) => s.start === offsets[i]);
    if (statement) {
      while (end < rows.length && offsets[end] < statement.end) end++;
    } else
      while (end < rows.length && /^(\s+\S|[.)\]}])/.test(rows[end])) end++;
    const text = rows.slice(i, end).join('\n');
    if (registered) out.push({ name: registered[1], method: true, text });
    else if (declared || fn) out.push({ name: (declared ?? fn)![1], text });
    else out.push({ text });
    i = end - 1;
  }
  return out;
}

const uses = (text: string, name: string, method = false) =>
  new RegExp(
    `(^|[^\\w$${method ? '' : '.'}])${name.replace(/\$/g, '\\$')}(?![\\w$])`,
  ).test(text);

/** Plays sounds (samples, synths, instruments): needs the song's packs. */
const playsSounds = (text: string) => /\b(?:s|sound|bank)\(/.test(text);

/** The labels of a song's lines, in order (muted ones without the `_`). */
export const lineLabels = (code: string) =>
  regionsOf(code).map((region) => region.label);

/** A line of `code` as a preset's parts, or null if there's no such line. */
export function presetFromLine(code: string, label: string) {
  const region = regionsOf(code).find((r) => r.label === label);
  if (!region) return null;
  const text = code
    .slice(region.start, region.end)
    .split('\n')
    .filter((row) => !LAYOUT.test(row))
    .join('\n')
    // Comments after the line's code belong to the next line.
    .replace(/(\n\s*(\/\/[^\n]*)?)+$/, '')
    .trimEnd();
  const body = text.replace(/^\s*_?[A-Za-z_$][\w$]*\s*:\s*/, '');
  // Declarations the body uses, and the ones those use in turn.
  const declarations = declarationsOf(code);
  const needed = new Set<number>();
  const visit = (source: string) => {
    declarations.forEach((declaration, at) => {
      if (
        declaration.name &&
        !needed.has(at) &&
        uses(source, declaration.name, declaration.method)
      ) {
        needed.add(at);
        visit(declaration.text);
      }
    });
  };
  visit(body);
  const parts = [body, ...[...needed].map((at) => declarations[at].text)];
  // The song's sample packs, when anything here plays sounds; sounds
  // embedded in the song (`samples({ name: [...] })`) only if used here.
  if (parts.some(playsSounds))
    declarations.forEach((declaration, at) => {
      if (declaration.name) return;
      const own = [...declaration.text.matchAll(/([\w$]+)\s*:\s*\[/g)].map(
        (match) => match[1],
      );
      if (
        !own.length ||
        own.some((name) =>
          parts.some((part) => new RegExp(`\\b${name}\\b`).test(part)),
        )
      )
        needed.add(at);
    });
  const needs = declarations
    .filter((_, at) => needed.has(at))
    .map((declaration) => declaration.text);
  return { body, label: label.replace(/^\$\d*$/, 'track'), needs };
}

/**
 * A line without its own arrangement: the `.mask(…)` calls chained on the
 * line itself (its Arrange node), not masks inside it (a fill in a stack).
 * In another song the arrangement would leave the track silent for bars.
 */
export function withoutArrangement(body: string) {
  let out = body;
  for (
    let at = out.lastIndexOf('.mask(');
    at >= 0;
    at = out.lastIndexOf('.mask(', at - 1)
  ) {
    if (depthAt(out, at) !== 0) continue;
    const end = closingParen(out, at + '.mask'.length);
    if (end < 0) continue;
    // With the whitespace (a newline and indent) before it.
    let start = at;
    while (start > 0 && /\s/.test(out[start - 1])) start--;
    out = out.slice(0, start) + out.slice(end + 1);
    at = start;
  }
  return out;
}

/** Bracket depth at `position`, outside strings and comments. */
function depthAt(code: string, position: number) {
  let depth = 0;
  for (let i = 0; i < position; i++) {
    const char = code[i];
    if (char === '"' || char === "'" || char === '`') {
      i = stringEnd(code, i);
    } else if (char === '/' && code[i + 1] === '/') {
      const newline = code.indexOf('\n', i);
      i = newline < 0 ? code.length : newline;
    } else if ('([{'.includes(char)) depth++;
    else if (')]}'.includes(char)) depth--;
  }
  return depth;
}

function stringEnd(code: string, open: number) {
  for (let i = open + 1; i < code.length; i++) {
    if (code[i] === '\\') i++;
    else if (code[i] === code[open]) return i;
  }
  return code.length;
}

/** The `)` closing the `(` at `open`, or -1. */
function closingParen(code: string, open: number) {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    const char = code[i];
    if (char === '"' || char === "'" || char === '`') i = stringEnd(code, i);
    else if (char === '(') depth++;
    else if (char === ')' && --depth === 0) return i;
  }
  return -1;
}

/** A label like `base` not used yet in `code` (`bass`, `bass2`, …). */
export function freeLabel(code: string, base: string) {
  const clean =
    base
      .replace(/[^\w$]+/g, '_')
      .replace(/^(\d)/, '_$1')
      .replace(/^_+|_+$/g, '') || 'track';
  const taken = new Set(lineLabels(code));
  if (!taken.has(clean)) return clean;
  let n = 2;
  while (taken.has(`${clean}${n}`)) n++;
  return `${clean}${n}`;
}

/**
 * `code` with a line added at the end: `label: body`, and before it any
 * declarations it needs that the song doesn't have yet.
 */
export function insertLine(
  code: string,
  line: { body: string; label: string; needs?: string[] },
) {
  const label = freeLabel(code, line.label);
  const present = declarationsOf(code);
  const names = new Set(present.map((d) => d.name).filter(Boolean));
  // `samples('…') // a comment` is the same load as without the comment.
  const bare = (text: string) =>
    text
      .split('\n')
      .map((row) => row.replace(/\s*\/\/.*$/, ''))
      .join('\n')
      .trim();
  const texts = new Set(present.map((d) => bare(d.text)));
  const missing = (line.needs ?? []).filter((text) => {
    const [own] = declarationsOf(text);
    if (own?.name ? names.has(own.name) : texts.has(bare(text))) return false;
    texts.add(bare(text));
    return true;
  });
  // Declarations go with the song's others, before its first line (where
  // they are written anyway); the line goes last, a blank line apart.
  // The first line starts at its `// @layout` comment, if it has one.
  let start = regionsOf(code)[0]?.start ?? -1;
  if (start > 0) {
    const above = code.lastIndexOf('\n', start - 2) + 1;
    if (LAYOUT.test(code.slice(above, start - 1))) start = above;
  }
  const head = start >= 0 ? code.slice(0, start).trimEnd() : code.trimEnd();
  const rest = start >= 0 ? code.slice(start).trimEnd() : '';
  const prelude = [head, ...missing].filter(Boolean).join('\n');
  const parts = [prelude, rest, `${label}: ${line.body}`].filter(Boolean);
  return { code: `${parts.join('\n\n')}\n`, label };
}

/** Tags a line suggests: from its label and the names of what it plays. */
export function suggestTags(
  label: string,
  body: string,
  tagsOfSound: (name: string) => string[],
) {
  const tags = new Set<string>();
  const words: [RegExp, string][] = [
    [/bass|sub|808/i, 'bass'],
    [/kick|bd/i, 'kick'],
    [/drum|beat|kick|snare|hat|perc|break/i, 'drums'],
    [/vox|vocal|voice|chop|choir/i, 'vocals'],
    [/lead|melody|hook/i, 'lead'],
    [/pad|chord|stab/i, 'chords'],
    [/arp/i, 'arp'],
    [/fx|riser|sweep|noise|impact/i, 'fx'],
  ];
  for (const [pattern, tag] of words) if (pattern.test(label)) tags.add(tag);
  // Sounds named in s("…") / sound("…"): their own tags.
  for (const match of body.matchAll(/\b(?:s|sound)\(\s*["'`]([^"'`]+)["'`]/g))
    for (const word of match[1].match(/[A-Za-z][\w]*/g) ?? [])
      for (const tag of tagsOfSound(word)) tags.add(tag);
  // Chords: notes stacked with commas ("[c3,e3,g3]"), or chord symbols.
  if (
    /\bchord\(|\.voicing|\bvoicings?\(/.test(body) ||
    /["'`][^"'`]*\b[a-g][#b]?-?\d\s*,\s*[a-g][#b]?-?\d/i.test(body)
  )
    tags.add('chords');
  return [...tags].sort();
}
