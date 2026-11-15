// Vite plugins for development: the bridge hub (mcp/hub.mjs) and a
// read-only route serving a local folder, e.g. songs and samples on disk.
import { createReadStream, statSync } from 'node:fs';
import { extname, resolve, sep } from 'node:path';
import { attachHub } from './hub.mjs';

/** Runs the bridge hub at /__bridge on the dev and preview servers. */
export function bridgeHub() {
  return {
    name: 'strudel-flow-bridge',
    configureServer(server) {
      if (server.httpServer) attachHub(server.httpServer);
    },
    configurePreviewServer(server) {
      attachHub(server.httpServer);
    },
  };
}

const TYPES = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
  '.json': 'application/json',
  '.js': 'text/javascript',
  '.strudel': 'text/plain',
  '.txt': 'text/plain',
  '.md': 'text/plain',
};

/**
 * Serves the files under `dir` at `/local/…` (with CORS, so Strudel's
 * `samples()` can load them). Off when `dir` is empty.
 */
export function localFiles(dir) {
  const root = dir ? resolve(dir) : '';
  const middleware = (request, response, next) => {
    if (!root || !request.url?.startsWith('/local/')) return next();
    const path = decodeURIComponent(new URL(request.url, 'http://x').pathname);
    const file = resolve(root, `.${path.slice('/local'.length)}`);
    // Never outside the folder.
    if (file !== root && !file.startsWith(root + sep)) {
      response.statusCode = 403;
      return response.end();
    }
    let stats;
    try {
      stats = statSync(file);
    } catch {
      response.statusCode = 404;
      return response.end();
    }
    if (!stats.isFile()) {
      response.statusCode = 404;
      return response.end();
    }
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader(
      'Content-Type',
      TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream',
    );
    response.setHeader('Content-Length', stats.size);
    createReadStream(file).pipe(response);
  };
  return {
    name: 'strudel-flow-local-files',
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}
