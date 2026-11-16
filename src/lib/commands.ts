/**
 * Every change to the song, as a command: `apply(song, command)` returns
 * what changes, and nothing else writes the song's nodes, wires or tempo.
 * The canvas, the code console, keyboard shortcuts, the mixer, MIDI and
 * Claude's tools all go through here (the store's `dispatch`), so each
 * change is checked in one place, tested on its own, and logged: the last
 * commands are in the diagnostics, enough to replay a bug.
 *
 * Pure: imports nothing from the store.
 */
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  reconnectEdge,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
} from '@xyflow/react';
import type { AppNode } from '@/components/nodes/types';
import { programOf } from '@/lib/program';
import { flatten } from '@/lib/program/compile';
import { insertNodeAfter } from '@/lib/node-placement';
import { nodeDefinitions } from '@/components/nodes/registry';
import { isPatternValue } from '@/components/nodes/define-node';

/** The parts of the store a command may change. */
export type Song = {
  nodes: AppNode[];
  edges: Edge[];
  cpm: string;
  bpc: string;
  prelude: string;
};

export type Command =
  /** New nodes (and wires between them or to existing nodes). */
  | {
      type: 'add';
      nodes: AppNode[];
      edges?: Edge[];
      /** Wires the new ones replace (a wire re-routed through the node). */
      removeEdges?: string[];
      select?: boolean;
    }
  /** A node spliced into a line right after another. */
  | { type: 'insertAfter'; after: string; node: AppNode; select?: boolean }
  | { type: 'remove'; ids: string[] }
  /** Merges values into nodes' data (`undefined` deletes a key). */
  | { type: 'setData'; updates: Record<string, Record<string, unknown>> }
  /** Mutes or unmutes the whole line holding a node. */
  | { type: 'setMuted'; id: string; muted: boolean }
  /** Solos a node's line; `add` keeps other solos (Cmd/Ctrl-click). */
  | { type: 'setSolo'; id: string; soloed: boolean; add?: boolean }
  | { type: 'clearSolo' }
  | { type: 'connect'; connection: Connection; replacing?: Edge }
  | { type: 'reconnect'; edge: Edge; connection: Connection }
  /** Selects exactly these nodes. */
  | { type: 'select'; ids: string[] }
  /** React Flow's own changes: dragging, measuring, selecting, deleting. */
  | { type: 'nodeChanges'; changes: NodeChange<AppNode>[] }
  | { type: 'edgeChanges'; changes: EdgeChange[] }
  /** The whole graph at once: code typed, undo, Auto-arrange, a patch. */
  | {
      type: 'setGraph';
      nodes: AppNode[];
      edges: Edge[];
      /** With the rest of the song, when it changes with the graph. */
      cpm?: string;
      bpc?: string;
      prelude?: string;
      reason: string;
    }
  | { type: 'setTempo'; cpm?: string; bpc?: string }
  /** The code before the lines (consts, samples, notes and frames). */
  | { type: 'setPrelude'; prelude: string };

/** Thrown for a command that would break the song; nothing changes. */
export class CommandError extends Error {}

const lineOf = (song: Song, id: string) =>
  new Set(
    programOf(song)
      .lines.map((line) => flatten(line.sink).map((node) => node.id!))
      .find((ids) => ids.includes(id)) ?? [id],
  );

/** True when `source` is already downstream of `target` (a loop). */
function makesLoop(edges: Edge[], source: string, target: string) {
  const seen = new Set<string>();
  const stack = [target];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === source) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const edge of edges) if (edge.source === id) stack.push(edge.target);
  }
  return false;
}

const withData = (node: AppNode, updates: Record<string, unknown>): AppNode => {
  const data = { ...node.data, ...updates } as Record<string, unknown>;
  for (const [key, value] of Object.entries(updates))
    if (value === undefined) delete data[key];
  return { ...node, data: data as AppNode['data'] };
};

/**
 * Why a value can't go into a node's parameter, or null when it can. A
 * knob holds a number or code (a pattern, an expression); a select one of
 * its options; a text field text. Keys that aren't parameters (a pad's
 * notes, a line's state) are the node's own business.
 */
export function valueProblem(type: string, key: string, value: unknown) {
  const parameter = nodeDefinitions[type]?.parameters[key];
  if (!parameter || value === undefined) return null;
  const shown = JSON.stringify(value);
  switch (parameter.control) {
    case 'knob':
      if (typeof value === 'number')
        return Number.isFinite(value) ? null : `${key} can't be ${shown}`;
      return typeof value === 'string' &&
        (isPatternValue(value) || Number.isFinite(Number(value))) &&
        value.trim() !== ''
        ? null
        : `${key} must be a number or code, not ${shown}`;
    case 'select':
      return parameter.options.some((option) => option.value === value)
        ? null
        : `${key} must be one of ${parameter.options
            .map((option) => option.value)
            .join(', ')}, not ${shown}`;
    case 'text':
      return typeof value === 'string' || typeof value === 'number'
        ? null
        : `${key} must be text, not ${shown}`;
  }
}

const deselected = (nodes: AppNode[]) =>
  nodes.map((node) => (node.selected ? { ...node, selected: false } : node));

/** What `command` changes in `song`. Throws CommandError if invalid. */
export function apply(song: Song, command: Command): Partial<Song> {
  const has = new Set(song.nodes.map((node) => node.id));
  const need = (id: string) => {
    if (!has.has(id)) throw new CommandError(`No node "${id}".`);
  };
  switch (command.type) {
    case 'add': {
      for (const node of command.nodes)
        if (has.has(node.id))
          throw new CommandError(`A node "${node.id}" already exists.`);
      const nodes = command.select
        ? [
            ...deselected(song.nodes),
            ...command.nodes.map((node) => ({ ...node, selected: true })),
          ]
        : [...song.nodes, ...command.nodes];
      const dropped = new Set(command.removeEdges ?? []);
      const edges = [
        ...song.edges.filter((edge) => !dropped.has(edge.id)),
        ...(command.edges ?? []),
      ];
      const problems = problemsOf({ nodes, edges });
      if (problems.length) throw new CommandError(problems.join('; '));
      return { nodes, edges };
    }
    case 'insertAfter': {
      need(command.after);
      const graph = insertNodeAfter(song, command.after, command.node);
      return {
        edges: graph.edges,
        nodes: command.select
          ? graph.nodes.map((node) =>
              node.id === command.node.id
                ? { ...node, selected: true }
                : node.selected
                  ? { ...node, selected: false }
                  : node,
            )
          : graph.nodes,
      };
    }
    case 'remove': {
      const ids = new Set(command.ids);
      return {
        nodes: song.nodes.filter((node) => !ids.has(node.id)),
        edges: song.edges.filter(
          (edge) => !ids.has(edge.source) && !ids.has(edge.target),
        ),
      };
    }
    case 'setData': {
      Object.keys(command.updates).forEach(need);
      const types = new Map(song.nodes.map((node) => [node.id, node.type]));
      for (const [id, values] of Object.entries(command.updates))
        for (const [key, value] of Object.entries(values)) {
          const problem = valueProblem(types.get(id) ?? '', key, value);
          if (problem) throw new CommandError(`${id}: ${problem}`);
        }
      return {
        nodes: song.nodes.map((node) => {
          const updates = command.updates[node.id];
          return updates ? withData(node, updates) : node;
        }),
      };
    }
    case 'setMuted': {
      need(command.id);
      const line = lineOf(song, command.id);
      const state = command.muted ? 'paused' : 'running';
      return {
        nodes: song.nodes.map((node) =>
          line.has(node.id) && node.data.state !== state
            ? withData(node, { state })
            : node,
        ),
      };
    }
    case 'setSolo': {
      need(command.id);
      const line = lineOf(song, command.id);
      return {
        nodes: song.nodes.map((node) => {
          const solo = line.has(node.id)
            ? command.soloed
            : Boolean(command.add) && node.data.solo === true;
          return Boolean(node.data.solo) === solo
            ? node
            : withData(node, { solo: solo || undefined });
        }),
      };
    }
    case 'clearSolo':
      return {
        nodes: song.nodes.map((node) =>
          node.data.solo ? withData(node, { solo: undefined }) : node,
        ),
      };
    case 'connect': {
      const { source, target, sourceHandle, targetHandle } = command.connection;
      need(source);
      need(target);
      if (source === target)
        throw new CommandError('A node cannot feed itself.');
      const edges = command.replacing
        ? song.edges.filter((edge) => edge.id !== command.replacing!.id)
        : song.edges;
      if (makesLoop(edges, source, target))
        throw new CommandError('That wire would make a loop.');
      return {
        edges: addEdge(
          {
            id: `${source}-${target}`,
            source,
            target,
            type: 'default',
            ...(sourceHandle ? { sourceHandle } : {}),
            ...(targetHandle ? { targetHandle } : {}),
          },
          edges,
        ),
      };
    }
    case 'reconnect': {
      const { source, target } = command.connection;
      need(source);
      need(target);
      if (source === target)
        throw new CommandError('A node cannot feed itself.');
      const rest = song.edges.filter((edge) => edge.id !== command.edge.id);
      if (makesLoop(rest, source, target))
        throw new CommandError('That wire would make a loop.');
      return {
        edges: reconnectEdge(command.edge, command.connection, song.edges),
      };
    }
    case 'select': {
      const ids = new Set(command.ids);
      return {
        nodes: song.nodes.map((node) =>
          Boolean(node.selected) === ids.has(node.id)
            ? node
            : { ...node, selected: ids.has(node.id) },
        ),
      };
    }
    case 'nodeChanges':
      return { nodes: applyNodeChanges(command.changes, song.nodes) };
    case 'edgeChanges':
      return { edges: applyEdgeChanges(command.changes, song.edges) };
    case 'setGraph': {
      const problems = problemsOf(command);
      if (problems.length) throw new CommandError(problems.join('; '));
      // A node the canvas already measured keeps its size (undo, code):
      // no flash of an unmeasured node, no layout from a wrong size.
      const before = new Map(song.nodes.map((node) => [node.id, node]));
      const nodes = command.nodes.map((node) => {
        const old = before.get(node.id);
        return !node.measured && old?.measured && old.type === node.type
          ? { ...node, measured: old.measured }
          : node;
      });
      return {
        nodes,
        edges: command.edges,
        ...(command.cpm !== undefined ? { cpm: command.cpm } : {}),
        ...(command.bpc !== undefined ? { bpc: command.bpc } : {}),
        ...(command.prelude !== undefined ? { prelude: command.prelude } : {}),
      };
    }
    case 'setPrelude':
      return { prelude: command.prelude };
    case 'setTempo':
      return {
        ...(command.cpm !== undefined ? { cpm: command.cpm } : {}),
        ...(command.bpc !== undefined ? { bpc: command.bpc } : {}),
      };
  }
}

/**
 * What must always hold: unique ids, wires between existing nodes, no
 * node feeding itself. Returns what is wrong (empty when all is well).
 */
export function problemsOf(song: Pick<Song, 'nodes' | 'edges'>) {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const node of song.nodes) {
    if (ids.has(node.id)) problems.push(`two nodes "${node.id}"`);
    ids.add(node.id);
  }
  for (const edge of song.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target))
      problems.push(`wire ${edge.id} to a missing node`);
    if (edge.source === edge.target)
      problems.push(`node ${edge.source} feeds itself`);
  }
  return problems;
}

/** The last commands (React Flow's drag and measure steps left out). */
const LOG_LIMIT = 200;
const log: { at: string; command: string }[] = [];
const quiet = (command: Command) =>
  (command.type === 'nodeChanges' &&
    command.changes.every((c) =>
      ['position', 'dimensions', 'select'].includes(c.type),
    )) ||
  (command.type === 'edgeChanges' &&
    command.changes.every((c) => c.type === 'select'));

/** A short, readable record of a command (no whole graphs). */
function summary(command: Command) {
  switch (command.type) {
    case 'setGraph':
      return `setGraph (${command.reason}): ${command.nodes.length} nodes, ${command.edges.length} wires`;
    case 'add':
      return `add ${command.nodes.map((n) => `${n.type}#${n.id}`).join(', ')}`;
    case 'insertAfter':
      return `insertAfter ${command.after}: ${command.node.type}#${command.node.id}`;
    case 'nodeChanges':
    case 'edgeChanges':
      return `${command.type} ${command.changes.map((c) => c.type).join(', ')}`;
    default:
      return JSON.stringify(command);
  }
}

export function logCommand(command: Command) {
  if (quiet(command)) return;
  log.push({ at: new Date().toISOString(), command: summary(command) });
  if (log.length > LOG_LIMIT) log.splice(0, log.length - LOG_LIMIT);
}
export const commandLog = () => [...log];
