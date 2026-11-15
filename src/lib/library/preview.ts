import { useAppStore } from '@/store/app-store';
import type { Preset } from './presets';

/**
 * Code that plays a preset on its own: at its own tempo when a tag says it
 * ("136 bpm"), otherwise the song's, with what it needs.
 */
export function previewCode(
  preset: Pick<Preset, 'label' | 'body' | 'needs' | 'tags'>,
  song: { cpm: string; bpc: string },
) {
  const bpm = preset.tags
    .map((tag) => /^(\d+(?:\.\d+)?) bpm$/.exec(tag)?.[1])
    .find(Boolean);
  const tempo = bpm ? `setcpm(${bpm}/4)` : `setcpm(${song.cpm}/${song.bpc})`;
  const label = /^[A-Za-z_$][\w$]*$/.test(preset.label)
    ? preset.label
    : 'preview';
  return [tempo, ...preset.needs, `${label}: ${preset.body}`].join('\n');
}

/** Plays a preset instead of the song, or stops it if it is the one playing. */
export function togglePreview(preset: Preset) {
  const state = useAppStore.getState();
  if (state.preview?.id === preset.id) {
    useAppStore.setState({ preview: null });
    return;
  }
  useAppStore.setState({
    preview: { id: preset.id, code: previewCode(preset, state) },
    error: null,
  });
}

export const stopPreview = () => {
  if (useAppStore.getState().preview) useAppStore.setState({ preview: null });
};
