import { nodeDefinitions } from '@/components/nodes/registry';
import { isSource } from '@/components/nodes/define-node';
import { programOf } from '@/lib/program';
import { flatten } from '@/lib/program/compile';
import { useAppStore } from '@/store/app-store';
import { commandLog } from '@/lib/commands';
import { loadCode, setCode } from '@/store/code-sync';
import { codeMeta } from '@/lib/community-patches';
import { tidyLines } from '@/lib/tidy';
import { setSoloed } from '@/lib/mixer';
import { themes } from '@/themes';
import { currentProblems, diagnostics } from '@/lib/diagnostics';
import { evaluatedCode } from '@/lib/live';
import { QUANTIZE_OPTIONS, useLaunch, type Quantize } from '@/lib/launch';
import {
  recordingName,
  startRecording,
  stopRecording,
  useRecorder,
} from '@/lib/recorder';
import {
  addAnnotation,
  annotationsOf,
  FRAME_SIZE,
  type Annotation,
} from '@/lib/annotations';
import { useLibrary } from '@/store/library-store';
import {
  lineLabels,
  presetFromLine,
  withoutArrangement,
  suggestTags,
  type Preset,
} from '@/lib/library/presets';
import { previewCode } from '@/lib/library/preview';
import { addLine, currentCode } from '@/lib/library/insert';
import { readSounds, tagsOfSound } from '@/lib/library/sounds';
import { hasTags, matches } from '@/lib/library/filter';

/**
 * What an external agent (Claude Code over MCP) can do to the open patch.
 * Every command returns plain JSON; invalid input throws with a message the
 * agent can act on.
 */
type Params = Record<string, unknown>;
const state = () => useAppStore.getState();
/** Node data the canvas uses for itself, not for sound. */
const UI_KEYS = new Set(['title', 'icon', 'state', 'label']);

/** Big values (a pad's grid, a clip's notes) as a short summary. */
function compactValue(value: unknown) {
  if (Array.isArray(value)) return `[${value.length} items]`;
  if (value && typeof value === 'object') return '{…}';
  if (typeof value === 'string' && value.length > 200)
    return `${value.slice(0, 200)}… (${value.length} chars)`;
  return value;
}

function describeNode(id: string, compact = false) {
  const node = state().nodes.find((candidate) => candidate.id === id)!;
  const definition = nodeDefinitions[node.type];
  const values = Object.fromEntries(
    Object.entries({ ...node.data, ...definition.getValues(node.data) })
      .filter(([key]) => !UI_KEYS.has(key))
      .map(([key, value]) => [key, compact ? compactValue(value) : value]),
  );
  return { id, type: node.type, title: definition.title, values };
}

/**
 * The patch as an agent sees it: its code, and its lines as node chains.
 * `compact` summarises big values, so a song stays readable.
 */
export function describe(compact = false) {
  const current = state();
  const lines = programOf(current).lines.map((line) => ({
    label: line.label,
    muted: line.muted,
    soloed: Boolean(line.soloed),
    // Upstream first, like the code reads.
    nodes: flatten(line.sink)
      .reverse()
      .map((node) => describeNode(node.id!, compact)),
  }));
  const inLines = new Set(lines.flatMap((line) => line.nodes.map((n) => n.id)));
  return {
    code: current.code,
    codeError: current.codeError,
    playing: current.isPlaying,
    playbackError: current.error,
    bpm: Number(current.cpm),
    beatsPerCycle: Number(current.bpc),
    theme: current.theme,
    launchQuantizeBars: useLaunch.getState().quantize,
    recording: useRecorder.getState().since !== null,
    annotations: annotationsOf(current.prelude),
    lines,
    unconnectedNodes: current.nodes
      .filter((node) => !inLines.has(node.id))
      .map((node) => describeNode(node.id, compact)),
  };
}

function requireString(params: Params, key: string) {
  const value = params[key];
  if (typeof value !== 'string') throw new Error(`"${key}" must be a string.`);
  return value;
}

const strings = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];

/** A preset's listing: everything but its (possibly huge) code. */
const presetSummary = (preset: Preset, compact = true) => ({
  id: preset.id,
  name: preset.name,
  tags: preset.tags,
  label: preset.label,
  body: compact ? compactValue(preset.body) : preset.body,
  needs: preset.needs.map((need) => (compact ? compactValue(need) : need)),
});

/** A preset by id, or by name when unambiguous. */
function findPreset(params: Params) {
  const key = requireString(params, 'preset');
  const presets = useLibrary.getState().presets;
  const byId = presets.find((preset) => preset.id === key);
  if (byId) return byId;
  const byName = presets.filter(
    (preset) => preset.name.toLowerCase() === key.toLowerCase(),
  );
  if (byName.length === 1) return byName[0];
  throw new Error(
    byName.length
      ? `Several presets are named "${key}"; use an id from list_presets.`
      : `No preset "${key}". Call list_presets.`,
  );
}

/** A WAV blob as base64, for the MCP server to write to disk. */
async function base64Of(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let at = 0; at < bytes.length; at += 0x8000)
    binary += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
  return btoa(binary);
}

export const commands: Record<string, (params: Params) => unknown> = {
  get_patch: (params) => describe(params.detail !== 'full'),

  /** Opens code as a new patch (a song file, an empty patch). */
  open_code: (params) => {
    const code = requireString(params, 'code');
    const meta = codeMeta(code);
    const file = typeof params.name === 'string' ? params.name : '';
    loadCode(code, {
      name: meta.name ?? (file.split('/').pop() || 'Untitled patch'),
      author: meta.author ?? '',
      description: meta.description ?? '',
    });
    const { codeError } = state();
    if (codeError) throw new Error(`The code did not parse: ${codeError}`);
    return describe(true);
  },

  tidy: (params) => {
    const node = typeof params.node === 'string' ? params.node : undefined;
    const kept = tidyLines(node);
    return { linesKeptInOrder: kept, ...describe(true) };
  },

  select_node: (params) => {
    const id = requireString(params, 'id');
    if (!state().nodes.some((node) => node.id === id))
      throw new Error(`No node with id "${id}". Call get_patch for ids.`);
    state().dispatch({ type: 'select', ids: [id] });
    useAppStore.setState({ focusRequest: { id, at: Date.now() } });
    return describeNode(id, true);
  },

  set_code: (params) => {
    setCode(requireString(params, 'code'));
    const { codeError } = state();
    if (codeError) throw new Error(`The code did not parse: ${codeError}`);
    return describe();
  },

  set_node: (params) => {
    const id = requireString(params, 'id');
    const node = state().nodes.find((candidate) => candidate.id === id);
    if (!node)
      throw new Error(`No node with id "${id}". Call get_patch for ids.`);
    const definition = nodeDefinitions[node.type];
    const values = params.values;
    if (!values || typeof values !== 'object')
      throw new Error('"values" must be an object.');
    const allowed = new Set([
      ...Object.keys(definition.parameters),
      ...Object.keys(definition.defaults),
    ]);
    const unknown = Object.keys(values).filter((key) => !allowed.has(key));
    if (unknown.length)
      throw new Error(
        `${definition.title} has no ${unknown.join(', ')}. It has: ${[...allowed].join(', ')}.`,
      );
    state().updateNodeData(id, definition.encode(values as Params));
    return describeNode(id);
  },

  set_muted: (params) => {
    const muted = params.muted !== false;
    const label = typeof params.line === 'string' ? params.line : undefined;
    const line = programOf(state()).lines.find((l) => l.label === label);
    if (!line) {
      const labels = programOf(state()).lines.map((l) => l.label);
      throw new Error(`No line "${label}". Lines: ${labels.join(', ')}.`);
    }
    state().setMuted(line.sink.id!, muted);
    return describe().lines.find((l) => l.label === label);
  },

  set_solo: (params) => {
    const label = typeof params.line === 'string' ? params.line : undefined;
    const lines = programOf(state()).lines;
    const line = lines.find((l) => l.label === label);
    if (!line)
      throw new Error(
        `No line "${label}". Lines: ${lines.map((l) => l.label).join(', ')}.`,
      );
    setSoloed(line.sink.id!, params.soloed !== false, params.add === true);
    return describe().lines.map(({ label, muted, soloed }) => ({
      label,
      muted,
      soloed,
    }));
  },

  set_tempo: (params) => {
    const { bpm, beatsPerCycle } = params;
    for (const [key, value] of Object.entries({ bpm, beatsPerCycle }))
      if (value !== undefined && !(Number(value) > 0))
        throw new Error(`"${key}" must be a positive number.`);
    if (bpm !== undefined) state().setCpm(String(bpm));
    if (beatsPerCycle !== undefined) state().setBpc(String(beatsPerCycle));
    return { bpm: Number(state().cpm), beatsPerCycle: Number(state().bpc) };
  },

  set_playing: (params) => {
    useAppStore.setState({
      isPlaying: params.playing !== false,
      preview: null,
      error: null,
    });
    return { playing: state().isPlaying };
  },

  set_theme: (params) => {
    const name = requireString(params, 'name');
    if (!themes.some((theme) => theme.name === name))
      throw new Error(
        `Unknown theme. Themes: ${themes.map((t) => t.name).join(', ')}.`,
      );
    state().setTheme(name);
    return { theme: name };
  },

  get_diagnostics: (params) => {
    const s = state();
    const limit = typeof params.limit === 'number' ? params.limit : 30;
    return {
      problems: currentProblems(),
      playbackError: s.error,
      codeError: s.codeError,
      playing: s.isPlaying,
      preview: s.preview?.id ?? null,
      nodes: s.nodes.length,
      // What Strudel last played (head), to compare with the code.
      evaluated: evaluatedCode().slice(0, 2000),
      log: diagnostics().slice(-limit),
      // The last changes to the song, to replay what led here.
      commands: commandLog().slice(-limit),
    };
  },

  /** A node's power button: disabled nodes are commented out in the code. */
  set_enabled: (params) => {
    const id = requireString(params, 'id');
    if (!state().nodes.some((node) => node.id === id))
      throw new Error(`No node with id "${id}". Call get_patch for ids.`);
    state().updateNodeData(id, { disabled: params.enabled === false });
    return { ...describeNode(id, true), code: state().code };
  },

  set_launch: (params) => {
    const bars = Number(params.bars);
    if (!(QUANTIZE_OPTIONS as readonly number[]).includes(bars))
      throw new Error(`"bars" must be one of ${QUANTIZE_OPTIONS.join(', ')}.`);
    useLaunch.getState().setQuantize(bars as Quantize);
    return { launchQuantizeBars: bars };
  },

  record_start: async () => {
    await startRecording();
    const { since, error } = useRecorder.getState();
    if (error) throw new Error(`Recording failed: ${error}`);
    return { recording: since !== null, playing: state().isPlaying };
  },

  /** Stops recording; the WAV comes back as base64 for the server to save. */
  record_stop: async () => {
    const wav = stopRecording();
    if (!wav)
      throw new Error(
        'Nothing was recorded (not recording, or nothing played).',
      );
    return {
      name: recordingName(state().name),
      bytes: wav.size,
      base64: await base64Of(wav),
    };
  },

  /** Adds a note or frame to the canvas (a comment in the code). */
  add_annotation: (params) => {
    const kind = params.kind === 'frame' ? 'frame' : 'note';
    const text = requireString(params, 'text');
    const number = (key: string, fallback: number) =>
      typeof params[key] === 'number' ? (params[key] as number) : fallback;
    const annotation: Annotation = {
      kind,
      text,
      x: number('x', 0),
      y: number('y', -200),
      ...(kind === 'frame'
        ? {
            width: number('width', FRAME_SIZE.width),
            height: number('height', FRAME_SIZE.height),
          }
        : {}),
    };
    addAnnotation(annotation);
    return { annotations: annotationsOf(state().prelude) };
  },

  list_sounds: (params) => {
    const query = typeof params.query === 'string' ? params.query : '';
    const kind = typeof params.kind === 'string' ? params.kind : undefined;
    const tags = strings(params.tags);
    const limit = typeof params.limit === 'number' ? params.limit : 50;
    const own = useLibrary.getState().soundTags;
    const found = readSounds()
      .map((sound) => ({
        ...sound,
        tags: [...new Set([...sound.tags, ...(own[sound.name] ?? [])])],
      }))
      .filter(
        (sound) =>
          (!kind || sound.kind === kind) &&
          hasTags(sound.tags, tags) &&
          matches(query, sound.name, sound.tags),
      );
    return { total: found.length, sounds: found.slice(0, limit) };
  },

  list_presets: (params) => {
    const query = typeof params.query === 'string' ? params.query : '';
    const tags = strings(params.tags);
    const { presets, storage } = useLibrary.getState();
    return {
      storage,
      presets: presets
        .filter(
          (preset) =>
            hasTags(preset.tags, tags) &&
            matches(query, preset.name, preset.tags),
        )
        .map((preset) => presetSummary(preset, params.detail !== 'full')),
    };
  },

  /** Saves a line of the song as a preset. */
  save_preset: (params) => {
    const label = requireString(params, 'line');
    const code = currentCode();
    const found = presetFromLine(code, label);
    if (!found)
      throw new Error(
        `No line "${label}". Lines: ${lineLabels(code).join(', ')}.`,
      );
    const body =
      params.keepArrangement === true
        ? found.body
        : withoutArrangement(found.body);
    const tags = params.tags
      ? strings(params.tags)
      : suggestTags(label, body, tagsOfSound);
    const name = typeof params.name === 'string' ? params.name : label;
    const preset = useLibrary
      .getState()
      .savePreset({ ...found, body, name, tags });
    return presetSummary(preset);
  },

  /** Adds a preset as a new line at the end of the song. */
  insert_preset: (params) => {
    const preset = findPreset(params);
    const label = addLine({
      body: preset.body,
      label:
        typeof params.label === 'string' && params.label
          ? params.label
          : preset.label,
      needs: preset.needs,
    });
    const { codeError } = state();
    if (codeError) throw new Error(`The code did not parse: ${codeError}`);
    return { label, ...describe(true) };
  },

  /** Plays a preset on its own instead of the song; `stop` ends it. */
  preview_preset: (params) => {
    if (params.stop === true) {
      useAppStore.setState({ preview: null });
      return { previewing: null };
    }
    const preset = findPreset(params);
    useAppStore.setState({
      preview: { id: preset.id, code: previewCode(preset, state()) },
      error: null,
    });
    return { previewing: preset.name };
  },

  delete_preset: (params) => {
    const preset = findPreset(params);
    useLibrary.getState().deletePreset(preset.id);
    return { deleted: preset.name };
  },

  list_node_types: () =>
    Object.values(nodeDefinitions).map((definition) => ({
      type: definition.id,
      title: definition.title,
      kind: isSource(definition) ? 'source' : 'effect',
      methods: definition.methods,
      parameters: Object.fromEntries(
        Object.entries(definition.parameters).map(([key, parameter]) => [
          key,
          {
            control: parameter.control,
            default: parameter.default,
            ...(parameter.control === 'knob'
              ? { min: parameter.min, max: parameter.max }
              : {}),
            ...(parameter.control === 'select'
              ? { options: parameter.options.map((option) => option.value) }
              : {}),
          },
        ]),
      ),
    })),
};
