import { useAppStore } from '@/store/app-store';
import { patchCode, setCode } from '@/store/code-sync';
import { lineNodes } from '@/lib/lines';
import { insertLine } from './presets';

/** The song's code as the console shows it. */
export const currentCode = () => useAppStore.getState().code || patchCode();

/**
 * Adds a line at the end of the song and brings its first node into view.
 * Returns the label it got (a free one, so nothing is replaced).
 */
export function addLine(line: {
  body: string;
  label: string;
  needs?: string[];
}) {
  const { code, label } = insertLine(currentCode(), line);
  setCode(code);
  requestAnimationFrame(() => {
    const id = lineNodes.get(label)?.[0];
    if (id) useAppStore.setState({ focusRequest: { id, at: Date.now() } });
  });
  return label;
}
