import { useAppStore } from '@/store/app-store';
import { commands } from './commands';

export const DEFAULT_BRIDGE_PORT = 4321;
const RETRY_MS = 2000;

/** Request from the MCP server, and the app's reply. */
type Request = { id: number; method: string; params?: Record<string, unknown> };

export function handle({ method, params = {} }: Request) {
  const command = commands[method];
  if (!command) throw new Error(`Unknown method "${method}".`);
  return command(params);
}

/**
 * The port to reach the local MCP server on, or null when the bridge is
 * off. On by default in development; `?bridge` (or `?bridge=PORT`) turns it
 * on in any build.
 */
export function bridgePort(
  href = window.location.href,
  dev = import.meta.env.DEV,
) {
  const param = new URL(href).searchParams.get('bridge');
  if (param === 'off') return null;
  if (param) return Number(param) || DEFAULT_BRIDGE_PORT;
  return param === '' || dev ? DEFAULT_BRIDGE_PORT : null;
}

/** Keeps a connection to the MCP server open; returns a stop function. */
export function startBridge() {
  const port = bridgePort();
  if (port === null) return () => {};
  let socket: WebSocket | undefined;
  let retry: number | undefined;
  let stopped = false;
  const setStatus = (bridge: 'connecting' | 'connected') =>
    useAppStore.setState({ bridge });

  const open = () => {
    setStatus('connecting');
    socket = new WebSocket(`ws://127.0.0.1:${port}`);
    socket.onopen = () => setStatus('connected');
    socket.onclose = () => {
      if (stopped) return;
      setStatus('connecting');
      retry = window.setTimeout(open, RETRY_MS);
    };
    socket.onmessage = (event) => {
      let request: Request;
      try {
        request = JSON.parse(String(event.data));
      } catch {
        return;
      }
      let reply: object;
      try {
        reply = { id: request.id, result: handle(request) ?? null };
      } catch (error) {
        reply = {
          id: request.id,
          error: error instanceof Error ? error.message : String(error),
        };
      }
      socket?.send(JSON.stringify(reply));
    };
  };
  open();
  return () => {
    stopped = true;
    window.clearTimeout(retry);
    socket?.close();
    useAppStore.setState({ bridge: 'off' });
  };
}
