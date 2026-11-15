declare module '@strudel/web' {
  export type StrudelSession = {
    scheduler: { now: () => number; cps?: number; pattern?: Pattern };
    state: { evalError?: unknown };
  };

  export function initStrudel(): Promise<StrudelSession>;
  export function evaluate(code: string): Promise<unknown>;
  export function hush(): void;
  export function noteToMidi(note: string): number;
  /** Parses mini-notation into a pattern. */
  export function mini(code: string): unknown;
  export function getADSRValues(
    values: (number | undefined)[],
    curve?: string,
    unset?: number[],
  ): [number, number, number, number];
  export function samples(source: string): Promise<unknown>;
  export function transpiler(
    code: string,
    options: {
      emitWidgets?: boolean;
      emitMiniLocations?: boolean;
      wrapAsync?: boolean;
      addReturn?: boolean;
    },
  ): { output: string };

  export class Pattern {
    analyze(id: string | number): Pattern;
    _scope(options?: { id?: string | number }): Pattern;
    _tscope(options?: { id?: string | number }): Pattern;
  }

  export const analysers: Record<string, AnalyserNode | undefined>;
  export function getAudioContext(): AudioContext;
  export function getSuperdoughAudioController(): unknown;
  export function drawTimeScope(
    analyser: AnalyserNode | undefined,
    options: {
      id: string;
      ctx: CanvasRenderingContext2D;
      scale: number;
      pos: number;
      color: string;
    },
  ): void;
}

declare module '@strudel/soundfonts' {
  /** Registers the General MIDI soundfonts (gm_*) as sounds. */
  export function registerSoundfonts(): void;
}
