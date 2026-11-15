import { nodeDefinitions } from '@/components/nodes/registry';
import { isSource } from '@/components/nodes/define-node';
import { programOf } from '@/lib/program';
import { flatten } from '@/lib/program/compile';
import { useAppStore } from '@/store/app-store';
import { loadCode, setCode } from '@/store/code-sync';
import { codeMeta } from '@/lib/community-patches';
import { tidyLines } from '@/lib/tidy';
import { setSoloed } from '@/lib/mixer';
import { themes } from '@/themes';
import { currentProblems, diagnostics } from '@/lib/diagnostics';
import { evaluatedCode } from '@/lib/live';

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
    useAppStore.setState((current) => ({
      nodes: current.nodes.map((node) =>
        node.selected === (node.id === id)
          ? node
          : { ...node, selected: node.id === id },
      ),
      focusRequest: { id, at: Date.now() },
    }));
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
    };
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
