import { AudioLines, Piano, SlidersHorizontal } from 'lucide-react';
import { nodeDefinitions } from '@/components/nodes/registry';
import type { NodeDefinition } from '@/components/nodes/define-node';

/**
 * The add-node menus: each category in the order you'd reach for things,
 * effects grouped by what they do (roughly in signal-chain order). A node
 * not listed here still shows up, under "More", so a new node is never lost.
 */
const LAYOUT: {
  label: string;
  category: string;
  icon: typeof Piano;
  sections: { title?: string; ids: string[] }[];
}[] = [
  {
    label: 'Instruments',
    category: 'Instruments',
    icon: Piano,
    sections: [
      {
        ids: [
          'beat-machine-node',
          'notes-node',
          'pad-node',
          'chord-node',
          'sound-node',
          'custom-node',
        ],
      },
    ],
  },
  {
    label: 'Sounds',
    category: 'Synths',
    icon: AudioLines,
    sections: [{ ids: ['synth-select-node', 'drum-sounds-node', 'bank-node'] }],
  },
  {
    label: 'Effects',
    category: 'Audio Effects',
    icon: SlidersHorizontal,
    sections: [
      {
        title: 'Rhythm',
        ids: [
          'rhythm-node',
          'time-node',
          'chance-node',
          'slice-node',
          'sample-node',
        ],
      },
      {
        title: 'Tone',
        ids: [
          'pitch-node',
          'adsr-node',
          'pitch-envelope-node',
          'texture-node',
          'unison-node',
          'distortion-node',
        ],
      },
      { title: 'Filter', ids: ['lpf-node', 'hpf-node', 'phaser-node'] },
      { title: 'Space', ids: ['delay-node', 'room-node', 'stereo-node'] },
      { title: 'Movement', ids: ['modulate-node', 'sidechain-node'] },
      {
        title: 'Mix & song',
        ids: ['level-node', 'mix-node', 'arrange-node', 'output-node'],
      },
      {
        title: 'Visuals',
        ids: ['analyzer-node', 'scope-node', 'punchcard-node'],
      },
      { title: 'Code', ids: ['method-node'] },
    ],
  },
];

export const radialMenuItems = LAYOUT.map(({ sections, ...category }) => {
  const all = Object.values(nodeDefinitions).filter(
    (node) => node.category === category.category,
  );
  const placed = sections.map(({ title, ids }) => ({
    title,
    items: ids.flatMap((id) => all.filter((node) => node.id === id)),
  }));
  const listed = new Set(sections.flatMap((section) => section.ids));
  const rest = all.filter((node) => !listed.has(node.id));
  const grouped: { title?: string; items: NodeDefinition[] }[] = [
    ...placed.filter((section) => section.items.length),
    ...(rest.length ? [{ title: 'More', items: rest }] : []),
  ];
  return {
    ...category,
    sections: grouped,
    items: grouped.flatMap((section) => section.items),
  };
});
