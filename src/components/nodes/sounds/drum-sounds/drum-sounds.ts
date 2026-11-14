export type DrumSoundsData = { sound?: string };

export const DEFAULT_SOUND = '';

export function generatePattern(data: DrumSoundsData) {
  return data.sound ? `sound(${JSON.stringify(data.sound)})` : '';
}
