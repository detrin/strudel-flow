import { Component, type ReactNode } from 'react';
import { report } from '@/lib/diagnostics';

/**
 * One node failing to draw shows an error in its place; the canvas, the
 * other nodes and the music go on. The error is logged (diagnostics, and
 * ~/.strudelton/logs/), and Retry draws the node again.
 */
export class NodeErrorBoundary extends Component<
  { id: string; title: string; children: ReactNode },
  { error?: Error }
> {
  override state: { error?: Error } = {};

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  override componentDidCatch(error: Error) {
    report(`node ${this.props.title}`, error, { id: this.props.id });
  }

  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div
        role="alert"
        className="w-64 rounded-md border border-destructive/60 bg-card p-3 text-xs"
      >
        <p className="font-semibold text-destructive">
          {this.props.title} could not be drawn
        </p>
        <p className="mt-1 font-mono break-words text-muted-foreground">
          {error.message}
        </p>
        <button
          type="button"
          className="nodrag mt-2 rounded border border-border px-2 py-1 hover:bg-accent"
          onClick={() => this.setState({ error: undefined })}
        >
          Retry
        </button>
      </div>
    );
  }
}
