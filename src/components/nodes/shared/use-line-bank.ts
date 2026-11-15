import { useAppStore } from '@/store/app-store';

/**
 * The drum machine (`.bank(...)`) on a node's line: the Bank node wired
 * before or after it, if any.
 */
export function useLineBank(id: string) {
  return useAppStore((state) => {
    const seen = new Set([id]);
    const queue = [id];
    while (queue.length) {
      const at = queue.shift()!;
      for (const edge of state.edges) {
        const next =
          edge.source === at
            ? edge.target
            : edge.target === at
              ? edge.source
              : null;
        if (next && !seen.has(next)) {
          seen.add(next);
          queue.push(next);
        }
      }
    }
    const bank = state.nodes.find(
      (node) => seen.has(node.id) && node.type === 'bank-node',
    )?.data.bank;
    return typeof bank === 'string' && bank ? bank : undefined;
  });
}
