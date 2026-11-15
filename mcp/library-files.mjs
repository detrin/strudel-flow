// The Library on disk: presets and sound tags in ~/.strudelton (or
// $STRUDELTON_HOME), one JSON file per preset, read and written by the dev
// server for the app at /__library.
import {
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
function writeJson(file, value) {
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(temporary, file);
}

export function createLibrary(root = libraryRoot()) {
  const presetsDir = join(root, 'presets');
  const tagsFile = join(root, 'sound-tags.json');

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
  };
}

function body(request) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      // Presets with embedded samples are big, but not this big.
      if (size > 50e6) reject(new Error('Too large.'));
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
