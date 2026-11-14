import { describe, expect, it } from 'vitest';
import { DEFAULT_THEME, themeByName, themes } from './index';
import { applyTheme, uiTokens } from './ui';

describe('strudel.cc themes', () => {
  it('ships every strudel.cc theme, default first', () => {
    expect(themes.length).toBeGreaterThanOrEqual(40);
    expect(themes[0].name).toBe(DEFAULT_THEME);
    expect(themes.map((theme) => theme.name)).toEqual(
      expect.arrayContaining(['strudelTheme', 'bluescreen', 'teletext']),
    );
  });

  it.each(themes.map((theme) => [theme.name, theme] as const))(
    '%s has the colours the UI needs',
    (_name, theme) => {
      for (const key of ['background', 'foreground', 'selection'] as const)
        expect(theme.settings[key]).toBeTruthy();
    },
  );

  it('knows which themes are dark', () => {
    expect(themeByName('bluescreen').dark).toBe(true);
    expect(themeByName('githubLight').dark).toBe(false);
  });

  it('falls back to the default for unknown names', () => {
    expect(themeByName('caffeine').name).toBe(DEFAULT_THEME);
  });

  it('maps editor colours onto UI tokens and applies them', () => {
    const { settings } = themeByName('bluescreen');
    expect(uiTokens(settings)).toMatchObject({
      background: '#051DB5',
      foreground: 'white',
      primary: 'white',
    });
    applyTheme('bluescreen');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.getElementById('strudel-theme')?.textContent).toContain(
      '--background:#051DB5;',
    );
  });
});
