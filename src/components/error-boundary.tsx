import { Component, type ReactNode } from 'react';

const RELOADED = 'strudelton:crash-reload';

/**
 * Catches a crash anywhere in the app. Instead of a blank page: in
 * development (a hot update gone wrong) it reloads once by itself — the
 * patch is kept in local storage — and otherwise shows the error with a
 * Reload button.
 */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  { error?: Error }
> {
  state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('Strudelton crashed:', error);
    if (!import.meta.env.DEV) return;
    let last = 0;
    try {
      last = Number(sessionStorage.getItem(RELOADED) ?? 0);
      // Not again within 10 s, so a real bug can't reload forever.
      if (Date.now() - last < 10_000) return;
      sessionStorage.setItem(RELOADED, String(Date.now()));
    } catch {
      return;
    }
    location.reload();
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        role="alert"
        className="flex h-screen flex-col items-center justify-center gap-3 bg-background p-4 text-center text-foreground"
      >
        <p className="text-sm font-medium">Something went wrong.</p>
        <pre className="max-w-xl overflow-auto whitespace-pre-wrap rounded border border-border p-2 text-left text-xs text-muted-foreground">
          {error.message}
        </pre>
        <p className="text-xs text-muted-foreground">
          Your patch is saved; reloading brings it back.
        </p>
        <button
          type="button"
          onClick={() => location.reload()}
          className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-accent"
        >
          Reload
        </button>
      </div>
    );
  }
}
