import { themeByName, type ThemeSettings } from './index';

const mix = (color: string, percent: number, base: string) =>
  `color-mix(in oklab, ${color} ${percent}%, ${base})`;

/**
 * A strudel.cc theme's few editor colours, spread over the UI's design
 * tokens: panels are the background tinted towards the text colour, and
 * the caret colour is the accent.
 */
export function uiTokens({
  background,
  foreground,
  caret,
  selection,
}: ThemeSettings) {
  const accent = caret ?? selection ?? foreground;
  const tint = (percent: number) => mix(foreground, percent, background);
  return {
    background,
    foreground,
    card: tint(5),
    'card-foreground': foreground,
    popover: tint(7),
    'popover-foreground': foreground,
    primary: accent,
    'primary-foreground': background,
    secondary: tint(10),
    'secondary-foreground': foreground,
    muted: tint(10),
    'muted-foreground': tint(62),
    accent: tint(14),
    'accent-foreground': foreground,
    destructive: '#e5484d',
    'destructive-foreground': '#ffffff',
    border: tint(20),
    input: tint(20),
    ring: accent,
  };
}

const STYLE_ID = 'strudel-theme';

/** Paints the whole UI with a theme. Unknown names fall back to the default. */
export function applyTheme(name: string) {
  const theme = themeByName(name);
  const declarations = Object.entries(uiTokens(theme.settings))
    .map(([token, value]) => `--${token}:${value};`)
    .join('');
  let style = document.getElementById(STYLE_ID);
  if (!style) {
    style = document.createElement('style');
    style.id = STYLE_ID;
    document.head.appendChild(style);
  }
  style.textContent = `:root{${declarations}color-scheme:${theme.dark ? 'dark' : 'light'};}`;
  document.documentElement.classList.toggle('dark', theme.dark);
  document.documentElement.dataset.theme = theme.name;
  return theme;
}
