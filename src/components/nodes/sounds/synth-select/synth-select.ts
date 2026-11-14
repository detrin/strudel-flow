export type VoiceData = { sound?: string };

export const DEFAULT_SOUND = '';

export function generatePattern(data: VoiceData) {
  return data.sound ? `sound(${JSON.stringify(data.sound)})` : '';
}
