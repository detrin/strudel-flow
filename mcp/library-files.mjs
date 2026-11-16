// The Library on disk: presets and sound tags in ~/.strudelton (or
// $STRUDELTON_HOME), one JSON file per preset, and takes (recorded sounds:
// takes/<name>.wav tuned, <name>.raw.wav as recorded, <name>.json), read
// and written by the dev server for the app at /__library.
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

export const libraryRoot = () =>
  resolve(process.env.STRUDELTON_HOME || join(homedir(), '.strudelton'));

/** A file name from a preset's name: "Acid bass!" → "acid-bass". */
export function slugOf(name) {
  return (
    String(name)
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'preset'
  );
}

const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return undefined;
  }
};

/** Writes through a temporary file, so a crash never leaves half a file. */
function writeAtomic(file, data) {
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, data);
  renameSync(temporary, file);
}
const writeJson = (file, value) =>
  writeAtomic(file, `${JSON.stringify(value, null, 2)}\n`);

/** A take's name is its Strudel sound: lower case, digits and _. */
export const TAKE_NAME = /^[a-z][a-z0-9_]{0,39}$/;
/** A sound name from what the person typed: "Clean windows!" → "clean_windows". */
export function takeNameOf(name) {
  const slug = slugOf(name).replace(/-/g, '_');
  return /^[a-z]/.test(slug) ? slug.slice(0, 40) : `take_${slug}`.slice(0, 40);
}

export function createLibrary(root = libraryRoot()) {
  const presetsDir = join(root, 'presets');
  const tagsFile = join(root, 'sound-tags.json');
  const takesDir = join(root, 'takes');
  const takeFile = (name, kind) => {
    if (!TAKE_NAME.test(name)) throw new Error(`Not a take name: "${name}".`);
    return join(
      takesDir,
      kind === 'meta'
        ? `${name}.json`
        : kind === 'raw'
          ? `${name}.raw.wav`
          : `${name}.wav`,
    );
  };

  /** Preset files with their contents (unreadable files are skipped). */
  function files() {
    let names = [];
    try {
      names = readdirSync(presetsDir).filter((name) => name.endsWith('.json'));
    } catch {
      return [];
    }
    return names.flatMap((name) => {
      const preset = readJson(join(presetsDir, name));
      return preset && typeof preset.id === 'string' ? [{ name, preset }] : [];
    });
  }

  return {
    root,
    /** Everything; `empty` when nothing was ever saved here. */
    read() {
      const presets = files().map((file) => file.preset);
      const soundTags = readJson(tagsFile);
      return {
        presets,
        soundTags: soundTags && typeof soundTags === 'object' ? soundTags : {},
        empty: presets.length === 0 && soundTags === undefined,
      };
    },
    /** Saves a preset in a file named after it (renamed with the preset). */
    savePreset(preset) {
      if (!preset || typeof preset.id !== 'string')
        throw new Error('A preset needs an id.');
      mkdirSync(presetsDir, { recursive: true });
      const all = files();
      const own = all.find((file) => file.preset.id === preset.id);
      const taken = new Set(
        all.filter((file) => file !== own).map((file) => file.name),
      );
      const base = slugOf(preset.name);
      let name = `${base}.json`;
      for (let n = 2; taken.has(name); n++) name = `${base}-${n}.json`;
      writeJson(join(presetsDir, name), preset);
      if (own && own.name !== name) rmSync(join(presetsDir, own.name));
      return name;
    },
    deletePreset(id) {
      const own = files().find((file) => file.preset.id === id);
      if (own) rmSync(join(presetsDir, own.name));
      return Boolean(own);
    },
    saveSoundTags(tags) {
      mkdirSync(root, { recursive: true });
      writeJson(tagsFile, tags ?? {});
    },
    /** Every take's details (key, scale, amount, seconds, savedAt), by name. */
    listTakes() {
      let names = [];
      try {
        names = readdirSync(takesDir).filter((name) => name.endsWith('.json'));
      } catch {
        return [];
      }
      return names
        .map((file) => file.slice(0, -'.json'.length))
        .filter(
          (name) => TAKE_NAME.test(name) && existsSync(takeFile(name, 'tuned')),
        )
        .map((name) => ({ ...readJson(takeFile(name, 'meta')), name }))
        .sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
    },
    /** Writes a take: both WAVs (Buffers) and its details. */
    saveTake(name, { raw, tuned, ...meta }) {
      if (!Buffer.isBuffer(raw) || !Buffer.isBuffer(tuned))
        throw new Error('A take needs its raw and tuned audio.');
      mkdirSync(takesDir, { recursive: true });
      writeAtomic(takeFile(name, 'raw'), raw);
      writeAtomic(takeFile(name, 'tuned'), tuned);
      const details = { ...meta, name, savedAt: Date.now() };
      writeJson(takeFile(name, 'meta'), details);
      return details;
    },
    /** A take's audio ('tuned' or 'raw'), or undefined. */
    readTake(name, kind = 'tuned') {
      try {
        return readFileSync(takeFile(name, kind));
      } catch {
        return undefined;
      }
    },
    deleteTake(name) {
      const files = ['meta', 'raw', 'tuned'].map((kind) =>
        takeFile(name, kind),
      );
      const found = files.some((file) => existsSync(file));
      for (const file of files) rmSync(file, { force: true });
      return found;
    },
  };
}

function body(request, limit = 50e6) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      // Presets with embedded samples are big, but not this big.
      if (size > limit) reject(new Error('Too large.'));
      else chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

/** The /__library routes on the dev and preview servers. */
export function libraryFiles() {
  const library = createLibrary();
  const home = homedir();
  const shown = library.root.startsWith(home)
    ? `~${library.root.slice(home.length)}`
    : library.root;
  const middleware = async (request, response, next) => {
    const url = new URL(request.url ?? '', 'http://x');
    if (!url.pathname.startsWith('/__library')) return next();
    const send = (status, value) => {
      response.statusCode = status;
      response.setHeader('Content-Type', 'application/json');
      response.end(JSON.stringify(value));
    };
    try {
      const rest = url.pathname.slice('/__library'.length);
      const preset = /^\/presets\/([^/]+)$/.exec(rest);
      if (request.method === 'GET' && (rest === '' || rest === '/'))
        return send(200, { ...library.read(), folder: shown });
      if (request.method === 'PUT' && preset)
        return send(200, {
          file: library.savePreset({
            ...(await body(request)),
            id: decodeURIComponent(preset[1]),
          }),
        });
      if (request.method === 'DELETE' && preset)
        return send(200, {
          deleted: library.deletePreset(decodeURIComponent(preset[1])),
        });
      if (request.method === 'GET' && rest === '/takes')
        return send(200, { takes: library.listTakes() });
      const audio = /^\/takes\/([a-z0-9_]+)(\.raw)?\.wav$/.exec(rest);
      if (request.method === 'GET' && audio) {
        const wav = library.readTake(audio[1], audio[2] ? 'raw' : 'tuned');
        if (!wav) return send(404, { error: 'No such take.' });
        response.statusCode = 200;
        response.setHeader('Content-Type', 'audio/wav');
        response.setHeader('Cache-Control', 'no-cache');
        return response.end(wav);
      }
      const take = /^\/takes\/([^/.]+)$/.exec(rest);
      if (request.method === 'PUT' && take) {
        // Minutes of audio, twice, as base64.
        const { raw, tuned, ...meta } = await body(request, 400e6);
        return send(200, {
          take: library.saveTake(decodeURIComponent(take[1]), {
            ...meta,
            raw: Buffer.from(String(raw ?? ''), 'base64'),
            tuned: Buffer.from(String(tuned ?? ''), 'base64'),
          }),
        });
      }
      if (request.method === 'DELETE' && take)
        return send(200, {
          deleted: library.deleteTake(decodeURIComponent(take[1])),
        });
      if (request.method === 'PUT' && rest === '/sound-tags') {
        library.saveSoundTags(await body(request));
        return send(200, {});
      }
      return send(404, { error: 'Unknown library route.' });
    } catch (error) {
      return send(500, { error: String(error?.message ?? error) });
    }
  };
  return {
    name: 'strudelton-library-files',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
