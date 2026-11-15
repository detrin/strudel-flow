import { useAppStore } from '@/store/app-store';
import { commands } from './commands';

const RETRY_MS = 2000;

/** Request from an agent (through the hub), and the app's reply. */
type Request = { id: number; method: string; params?: Record<string, unknown> };
/** The hub tells the tab how many agents (Claude sessions) are attached. */
type Notice = { type: 'agents'; count: number };

export function handle({ method, params = {} }: Request) {
  const command = commands[method];
  if (!command) throw new Error(`Unknown method "${method}".`);
  return command(params);
}

/**
 * The bridge hub the dev server runs (mcp/hub.mjs), on the page's own
 * origin, or null when the bridge is off. On by default in development;
 * `?bridge` turns it on in any build served with the hub (`vite preview`),
 * `?bridge=off` turns it off.
 */
export function bridgeUrl(
  href = window.location.href,
  dev = import.meta.env.DEV,
) {
  const url = new URL(href);
  const param = url.searchParams.get('bridge');
  if (param === 'off' || (param === null && !dev)) return null;
  const scheme = url.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${url.host}/__bridge?role=app`;
}

/** Keeps the tab connected to the hub; returns a stop function. */
export function startBridge() {
  const url = bridgeUrl();
  if (url === null) return () => {};
  let socket: WebSocket | undefined;
  let retry: number | undefined;
  let stopped = false;
  const setStatus = (bridge: 'connecting' | 'connected') =>
    useAppStore.setState({ bridge });

  const open = () => {
    setStatus('connecting');
    socket = new WebSocket(url);
    socket.onclose = () => {
      if (stopped) return;
      setStatus('connecting');
      retry = window.setTimeout(open, RETRY_MS);
    };
    socket.onmessage = async (event) => {
      let message: Request | Notice;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if ('type' in message) {
        // "Agent connected" shows while a Claude session is attached.
        setStatus(message.count > 0 ? 'connected' : 'connecting');
        return;
      }
      const request = message;
      let reply: object;
      try {
        // Some commands (recording) answer later.
        reply = { id: request.id, result: (await handle(request)) ?? null };
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
