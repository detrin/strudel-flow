/**
 * Records what the app plays (the master output) to a WAV file: a jam,
 * captured as it happens. An AudioWorklet copies the raw samples; stopping
 * encodes them as 16-bit PCM WAV.
 */
import { create } from 'zustand';
import {
  audioContext as getAudioContext,
  masterOutput,
} from '@/lib/strudel-internals';

/** 16-bit PCM WAV of the given channels (equal lengths, -1…1). */
export function encodeWav(channels: Float32Array[], sampleRate: number) {
  const frames = channels[0]?.length ?? 0;
  const count = channels.length;
  const bytes = frames * count * 2;
  const buffer = new ArrayBuffer(44 + bytes);
  const view = new DataView(buffer);
  const text = (at: number, value: string) =>
    [...value].forEach((char, i) => view.setUint8(at + i, char.charCodeAt(0)));
  text(0, 'RIFF');
  view.setUint32(4, 36 + bytes, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, count, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * count * 2, true);
  view.setUint16(32, count * 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, bytes, true);
  let at = 44;
  for (let frame = 0; frame < frames; frame++)
    for (const channel of channels) {
      const sample = Math.max(-1, Math.min(1, channel[frame]));
      view.setInt16(at, sample < 0 ? sample * 0x8000 : sample * 0x7fff, true);
      at += 2;
    }
  return buffer;
}

/** Joins recorded blocks into one array. */
export function join(blocks: Float32Array[]) {
  const out = new Float32Array(blocks.reduce((n, b) => n + b.length, 0));
  let at = 0;
  for (const block of blocks) {
    out.set(block, at);
    at += block.length;
  }
  return out;
}

const WORKLET = `
registerProcessor('strudelton-recorder', class extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input.length)
      this.port.postMessage(input.map((channel) => channel.slice(0)));
    return true;
  }
});`;

type Recorder = {
  /** When recording started (ms since epoch), or null. */
  since: number | null;
  error: string | null;
};
export const useRecorder = create<Recorder>()(() => ({
  since: null,
  error: null,
}));

let session:
  | {
      node: AudioWorkletNode;
      source?: AudioNode;
      blocks: Float32Array[][];
      poll: ReturnType<typeof setInterval>;
    }
  | undefined;
let loaded: Promise<void> | undefined;

/** The worklet that copies its input to the main thread, once per tab. */
export async function loadRecorderWorklet(context: BaseAudioContext) {
  try {
    loaded ??= context.audioWorklet.addModule(
      URL.createObjectURL(new Blob([WORKLET], { type: 'text/javascript' })),
    );
    await loaded;
  } catch (error) {
    loaded = undefined;
    throw error;
  }
}

export async function startRecording() {
  if (session) return;
  const context = getAudioContext();
  try {
    await loadRecorderWorklet(context);
  } catch (error) {
    useRecorder.setState({
      error: error instanceof Error ? error.message : String(error),
    });
    return;
  }
  const node = new AudioWorkletNode(context, 'strudelton-recorder', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 2,
    channelCountMode: 'explicit',
  });
  const blocks: Float32Array[][] = [];
  node.port.onmessage = (event: MessageEvent<Float32Array[]>) =>
    blocks.push(event.data);
  // Its output is silence; connected so the browser keeps it running.
  node.connect(context.destination);
  // The output appears with the first sound, and Strudel may rebuild it.
  const attach = () => {
    const output = masterOutput();
    if (!session || !output || output === session.source) return;
    output.connect(node);
    session.source = output;
  };
  session = { node, blocks, poll: setInterval(attach, 250) };
  attach();
  useRecorder.setState({ since: Date.now(), error: null });
}

/** Stops recording; returns the WAV, or null if nothing was recorded. */
export function stopRecording(): Blob | null {
  if (!session) return null;
  const { node, source, blocks, poll } = session;
  session = undefined;
  clearInterval(poll);
  try {
    source?.disconnect(node);
  } catch {
    // Already gone with a rebuilt output.
  }
  node.disconnect();
  node.port.onmessage = null;
  useRecorder.setState({ since: null });
  if (!blocks.length) return null;
  const channels = [0, 1].map((index) =>
    join(blocks.map((block) => block[index] ?? block[0])),
  );
  return new Blob([encodeWav(channels, node.context.sampleRate)], {
    type: 'audio/wav',
  });
}

/** `undertow-2026-11-15-1432.wav` */
export function recordingName(patch: string, date = new Date()) {
  const slug =
    patch
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'strudelton';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${slug}-${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}.wav`;
}
