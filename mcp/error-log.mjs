// Errors from open tabs, written to disk so they can be read later without
// anyone describing them: ~/.strudelton/logs/<date>.jsonl (STRUDELTON_HOME
// moves it), one JSON object per line. The app posts them to /__log.
import { appendFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { libraryRoot } from './library-files.mjs';

/** Where the log for `date` goes. */
export const logFile = (date = new Date()) =>
  join(libraryRoot(), 'logs', `${date.toISOString().slice(0, 10)}.jsonl`);

/** Appends entries (objects) to today's log. */
export function writeLog(entries, page) {
  const file = logFile();
  mkdirSync(join(file, '..'), { recursive: true });
  appendFileSync(
    file,
    entries.map((entry) => `${JSON.stringify({ ...entry, page })}\n`).join(''),
  );
}

/** POST /__log on the dev and preview servers. */
export function errorLog() {
  const middleware = (request, response, next) => {
    if (request.url !== '/__log' || request.method !== 'POST') return next();
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size < 1e6) chunks.push(chunk);
    });
    request.on('end', () => {
      try {
        const { entries, page } = JSON.parse(Buffer.concat(chunks).toString());
        if (Array.isArray(entries)) writeLog(entries.slice(0, 200), page);
        response.statusCode = 204;
      } catch {
        response.statusCode = 400;
      }
      response.end();
    });
  };
  return {
    name: 'strudelton-error-log',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
