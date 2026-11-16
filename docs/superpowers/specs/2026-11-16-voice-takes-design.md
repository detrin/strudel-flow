# Takes: record, tune and keep sounds in the app

## Why

The person makes hyperpop in Strudelton and wants their own sounds in it:
sung lines, syllables, mouth percussion, any sound from the mic. Hard-tuned
vocals are the genre's signature, so the app tunes them too, by a chosen
amount, and keeps them as sounds a song plays with `s("name")`.

## What it does

- **Record** from the mic in the Library's new **Takes** tab, with the
  song playing (default) so the take lands in time.
- **Tune** the take: key, scale (the app's usual list) and a **Tune**
  amount, 0 % (as recorded) to 100 % (hard snap to the nearest scale
  note). Listen before saving. Leading silence is trimmed.
- **Keep**: a name, then two WAVs in `~/.strudelton/takes/`
  (`name.wav` tuned, `name.raw.wav` as recorded) and `name.json` (key,
  scale, amount, date). The take is a Strudel sound at once and on every
  start: `s("name")`.
- **Redo**: Retune loads the raw take back into the editor; the original
  is never changed. Delete removes all three files.
- Claude: `list_takes`, `tune_take` (retune a take), `import_take` (a WAV
  file becomes a take, tuned like one recorded).

## Approaches

1. **Tune on the take (picked):** tuning runs once when saving, offline,
   and writes a new WAV next to the raw one. Simple, sounds the same every
   time, works with every Strudel effect.
2. Tune as a live effect in the song (`.tune(0.8)`): flexible per section,
   but Strudel has no such effect; it would need a pitch corrector inside
   its audio engine. Not now; two takes at different amounts cover "raw in
   the verse, hard in the drop".

## How

- Pitch: YIN per 10 ms frame (60-1000 Hz), voiced where the YIN dip is
  clear. Correction per frame: nearest scale note, times the amount;
  a short median smooths octave errors.
- Shift: TD-PSOLA (pitch marks from the track, grains two periods long),
  which keeps the voice's formants (no chipmunk) and the take's length.
  Unvoiced parts (breaths, clicks, noise) pass through unchanged, so
  non-pitched sounds are kept as they are.
- Pure TS in `src/lib/takes/tune.ts`, unit-tested on synthetic tones.
- Mic capture reuses the recorder's AudioWorklet; mono, the context's rate.
- Files go through the dev server (`/__library/takes`). Without it (a
  deployed site, `?library=browser`) the tab says recording needs the dev
  server: my call, as everything the person runs has one.

## Not now

Live tuning while singing, a waveform editor, per-note editing,
formant shifting, browser-only storage of takes.
