// The bridge hub, served by the Vite dev (or preview) server at /__bridge.
// Strudelton tabs connect as `app`, Claude Code's MCP servers (mcp/server.mjs)
// as `agent`. An agent's request goes to the newest tab still open; its reply
// comes back to that agent. Any number of tabs and agents can come and go.
import { WebSocketServer } from 'ws';

export const BRIDGE_PATH = '/__bridge';
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
/** How long a request waits for a tab to (re)connect, e.g. after a reload. */
const WAIT_FOR_TAB_MS = 3000;
export const NO_TAB =
  'Strudelton is not open. Open the app (the dev server prints its URL); it connects by itself.';

/** Attaches the hub to an HTTP server; returns a function that closes it. */
export function attachHub(httpServer) {
  const sockets = new WebSocketServer({ noServer: true });
  /** Open tabs, oldest first. */
  const apps = [];
  const agents = new Set();
  /** Hub request id → the agent and its own id. */
  const pending = new Map();
  /** Requests waiting for a tab to connect. */
  let waiting = [];
  let nextId = 1;

  const forward = (app, agent, request) => {
    const id = nextId++;
    pending.set(id, { agent, id: request.id, app, request });
    app.send(JSON.stringify({ ...request, id }));
  };
  /** Sends to the newest tab, or waits a moment for one to connect. */
  const route = (agent, request) => {
    const app = newestApp();
    if (app) return forward(app, agent, request);
    const entry = { agent, request };
    entry.timer = setTimeout(() => {
      waiting = waiting.filter((other) => other !== entry);
      if (isOpen(agent))
        agent.send(JSON.stringify({ id: request.id, error: NO_TAB }));
    }, WAIT_FOR_TAB_MS);
    waiting.push(entry);
  };

  const isOpen = (socket) => socket.readyState === socket.OPEN;
  const newestApp = () => apps.findLast(isOpen);
  const tellApps = () => {
    const message = JSON.stringify({ type: 'agents', count: agents.size });
    for (const app of apps) if (isOpen(app)) app.send(message);
  };

  sockets.on('connection', (socket, role) => {
    if (role === 'app') {
      apps.push(socket);
      socket.send(JSON.stringify({ type: 'agents', count: agents.size }));
      for (const { agent, request, timer } of waiting) {
        clearTimeout(timer);
        if (isOpen(agent)) forward(socket, agent, request);
      }
      waiting = [];
      socket.on('message', (data) => {
        let reply;
        try {
          reply = JSON.parse(String(data));
        } catch {
          return;
        }
        const waiting = pending.get(reply.id);
        if (!waiting) return;
        pending.delete(reply.id);
        if (isOpen(waiting.agent))
          waiting.agent.send(JSON.stringify({ ...reply, id: waiting.id }));
      });
      socket.on('close', () => {
        apps.splice(apps.indexOf(socket), 1);
        // A tab that closed (reloaded) mid-request: ask the newest instead.
        for (const [id, entry] of pending)
          if (entry.app === socket) {
            pending.delete(id);
            if (isOpen(entry.agent)) route(entry.agent, entry.request);
          }
      });
      return;
    }
    agents.add(socket);
    tellApps();
    socket.on('message', (data) => {
      let request;
      try {
        request = JSON.parse(String(data));
      } catch {
        return;
      }
      route(socket, request);
    });
    socket.on('close', () => {
      agents.delete(socket);
      tellApps();
    });
  });

  const onUpgrade = (request, socket, head) => {
    const url = new URL(request.url ?? '', 'http://localhost');
    if (url.pathname !== BRIDGE_PATH) return; // Vite's own HMR socket etc.
    const origin = request.headers.origin;
    // Only pages served from this machine (and local tools) may connect.
    if (origin && !LOCAL_ORIGIN.test(origin)) {
      socket.destroy();
      return;
    }
    const role = url.searchParams.get('role') === 'agent' ? 'agent' : 'app';
    sockets.handleUpgrade(request, socket, head, (ws) =>
      sockets.emit('connection', ws, role),
    );
  };
  httpServer.on('upgrade', onUpgrade);
  return () => {
    httpServer.off('upgrade', onUpgrade);
    sockets.close();
  };
}
