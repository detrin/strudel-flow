import type { Extension } from '@codemirror/state';

/** The colour settings every strudel.cc theme exports. */
export type ThemeSettings = {
  background: string;
  foreground: string;
  /** Some themes have none; the UI then uses `selection`. */
  caret?: string;
  selection: string;
  light?: boolean;
  selectionMatch?: string;
  lineHighlight: string;
  lineBackground?: string;
  gutterBackground?: string;
  gutterForeground?: string;
};
export type Theme = {
  name: string;
  label: string;
  dark: boolean;
  settings: ThemeSettings;
  editor: Extension;
};

const modules = import.meta.glob<{
  default: Extension;
  settings: ThemeSettings;
}>(['./strudel/*.mjs', '!./strudel/theme-helper.mjs'], { eager: true });

/** strudel.cc's own names, so saved settings mean the same thing there. */
const RENAMED: Record<string, string> = {
  'strudel-theme': 'strudelTheme',
  tokioNightStorm: 'tokyoNightStorm',
};
const LABELS: Record<string, string> = {
  strudelTheme: 'Strudel',
  bluescreen: 'Blue Screen',
  bluescreenlight: 'Blue Screen Light',
  CutiePi: 'Cutie Pi',
};

const camel = (file: string) =>
  file.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase());
const humanize = (name: string) =>
  name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/^\w/, (c) => c.toUpperCase());

/** Relative luminance of a #rgb / #rrggbb colour; named colours count as light. */
function luminance(color: string) {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})/i.exec(color)?.[1];
  if (!hex) return 1;
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const [r, g, b] = [0, 2, 4].map(
    (i) => parseInt(full.slice(i, i + 2), 16) / 255,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export const DEFAULT_THEME = 'strudelTheme';

export const themes: Theme[] = Object.entries(modules)
  .map(([path, module]) => {
    const file = path.replace(/^.*\/|\.mjs$/g, '');
    const name = RENAMED[file] ?? camel(file);
    return {
      name,
      label: LABELS[name] ?? humanize(name),
      dark: module.settings.light
        ? false
        : luminance(module.settings.background) < 0.5,
      settings: module.settings,
      editor: module.default,
    };
  })
  .sort(
    (a, b) =>
      Number(b.name === DEFAULT_THEME) - Number(a.name === DEFAULT_THEME) ||
      a.label.localeCompare(b.label),
  );

export const themeByName = (name: string) =>
  themes.find((theme) => theme.name === name) ??
  themes.find((theme) => theme.name === DEFAULT_THEME)!;
