/**
 * Recording a take from the microphone: the raw signal (no echo
 * cancelling, noise suppression or automatic gain, which smear a voice),
 * mono, at the audio context's rate, through the recorder's worklet.
 */
import { audioContext } from '@/lib/strudel-internals';
import { join, loadRecorderWorklet } from '@/lib/recorder';

let session:
  | {
      stream: MediaStream;
      source: MediaStreamAudioSourceNode;
      node: AudioWorkletNode;
      blocks: Float32Array[];
    }
  | undefined;

/** Starts recording; throws when there is no mic or no permission. */
export async function startMic() {
  if (session) return;
  if (!navigator.mediaDevices?.getUserMedia)
    throw new Error('This browser cannot record from a microphone.');
  const context = audioContext();
  await context.resume();
  await loadRecorderWorklet(context);
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    },
  });
  const source = context.createMediaStreamSource(stream);
  const node = new AudioWorkletNode(context, 'strudelton-recorder', {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    channelCount: 1,
    channelCountMode: 'explicit',
  });
  const blocks: Float32Array[] = [];
  node.port.onmessage = (event: MessageEvent<Float32Array[]>) => {
    const block = event.data[0];
    if (block) blocks.push(block);
  };
  source.connect(node);
  // Its output is silence; connected so the browser keeps it running.
  node.connect(context.destination);
  session = { stream, source, node, blocks };
}

/** Stops recording; the take, or null when nothing came in. */
export function stopMic(): { samples: Float32Array; rate: number } | null {
  if (!session) return null;
  const { stream, source, node, blocks } = session;
  session = undefined;
  source.disconnect();
  node.disconnect();
  node.port.onmessage = null;
  stream.getTracks().forEach((track) => track.stop());
  if (!blocks.length) return null;
  return { samples: join(blocks), rate: node.context.sampleRate };
}
