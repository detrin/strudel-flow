import { isPatternValue, isSource } from '@/components/nodes/define-node';
import { nodeDefinitions } from '@/components/nodes/registry';

/**
 * Where a node sits in its line:
 * - `header`: the line's Arrange (its bars), drawn at the start of the row
 *   but written last in the code, after anything that changes time;
 * - `source`: what the line plays;
 * - `shape`: order matters (time, rhythm, slicing, chance, patterned or
 *   LFO values, raw code), so these stay a chain in their exact order;
 * - `sound`: sets a constant property of every event (level, filter,
 *   reverb…), so its place doesn't matter; these stack like a channel strip.
 */
export type Group =
  'header' | 'source' | 'voice' | 'shape' | 'sound' | 'visual';

/** Effects that change time or read the pattern, whatever their values. */
const SHAPE_TYPES = new Set([
  'time-node',
  'modulate-node',
  'method-node',
  'mix-node',
  'arrange-node',
]);
/** Which instrument plays: next to the source. */
const VOICE_TYPES = new Set([
  'synth-select-node',
  'bank-node',
  'drum-sounds-node',
]);
/** Draws the pattern; never changes what plays. */
const VISUAL_TYPES = new Set(['punchcard-node', 'scope-node', 'analyzer-node']);

type Member = { type: string; data: Record<string, unknown> };

function basicGroup(node: Member, first: boolean): Group {
  const definition = nodeDefinitions[node.type];
  if (first || (definition && isSource(definition))) return 'source';
  if (VISUAL_TYPES.has(node.type)) return 'visual';
  if (!definition || definition.ordered || SHAPE_TYPES.has(node.type))
    return 'shape';
  const patterned = Object.entries(definition.parameters).some(
    ([key, parameter]) =>
      parameter.control === 'knob' && isPatternValue(node.data[key]),
  );
  if (patterned) return 'shape';
  return VOICE_TYPES.has(node.type) ? 'voice' : 'sound';
}

/**
 * Groups of a line's nodes, upstream first. The line's last Arrange is its
 * header when only order-free nodes follow it (`.mask(…).gain(1)`,
 * `.mask(…)._punchcard()`): those can move before it.
 */
export function groupsOf(members: Member[]): Group[] {
  const groups = members.map((node, i) => basicGroup(node, i === 0));
  const last = members.findLastIndex((node) => node.type === 'arrange-node');
  const free = (group: Group) =>
    group === 'sound' || group === 'voice' || group === 'visual';
  if (last > 0 && groups.slice(last + 1).every(free)) groups[last] = 'header';
  return groups;
}

/** The order a tidy line has, by group. */
export const TIDY_ORDER: Group[] = [
  'source',
  'voice',
  'shape',
  'sound',
  'visual',
  'header',
];
