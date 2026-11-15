import { describe, expect, it } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { localFiles } from '../../mcp/dev-server.mjs';

type Middleware = (
  request: { url: string },
  response: Record<string, unknown>,
  next: () => void,
) => void;

/** Runs the /local/ route for a URL; resolves with status or `next`. */
function get(dir: string, url: string) {
  let middleware: Middleware | undefined;
  const plugin = localFiles(dir) as unknown as {
    configureServer: (server: unknown) => void;
  };
  plugin.configureServer({
    middlewares: { use: (fn: Middleware) => (middleware = fn) },
  });
  return new Promise<string | number>((done) => {
    const response = Object.assign(
      new Writable({ write: (_chunk, _encoding, next) => next() }),
      { statusCode: 200, setHeader: () => {} },
    );
    response.on('finish', () => done(response.statusCode));
    middleware!({ url }, response as unknown as Record<string, unknown>, () =>
      done('next'),
    );
  });
}

describe('the /local/ route', () => {
  const dir = mkdtempSync(join(tmpdir(), 'flow-local-'));
  writeFileSync(join(dir, 'song.strudel'), 's("bd")');

  it('serves files in its folder, and nothing outside it', async () => {
    expect(await get(dir, '/local/song.strudel')).toBe(200);
    expect(await get(dir, '/local/missing.mp3')).toBe(404);
    expect(await get(dir, '/local/..%2F..%2Fetc%2Fpasswd')).toBe(403);
  });

  it('leaves other paths, and is off without a folder', async () => {
    expect(await get(dir, '/index.html')).toBe('next');
    expect(await get('', '/local/song.strudel')).toBe('next');
  });
});
