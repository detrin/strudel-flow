# Chords: progressions by feeling, heard in the song

## Why

The person writes by feel ("urgency", "too generic", "more optimistic")
and wants to see which chord progressions give which feelings, try them,
and change one without rewriting it. Hearing them at the song's tempo, and
dropping one into the song, matters more than reading theory.

## What it does

- The Library gets a **Chords** tab: a key, a catalog of progressions
  (name, the chords in that key, Roman numerals, the usual feeling, why it
  feels so, tags, a source link), filterable by feeling.
- **Change it** toggles apply research-backed techniques to every
  progression shown: resolve the ending (V), Mario ending (bVI-bVII),
  borrow iv, tonic pedal in the bass, faster changes (two chords a bar),
  colours (add9 / m7), key up a step.
- **Preview** plays one alone at the song's tempo (supersaw chords and a
  sine root bass), like a preset preview; **Use** adds those two lines to
  the song.
- Claude: `list_progressions` (a key and techniques in; chord names and
  the notes as mini-notation out, to write into the song's own lines),
  `preview_progression`, `insert_progression`.

## How

- `src/lib/chords/theory.ts`, pure and unit-tested: Roman numerals
  (case = quality, `b`/`#`, suffixes 7, maj7, m7, sus2, sus4, add9, 6,
  dim) to chords in a key; voicings by least movement from the previous
  chord, around middle C to the A above; roots in octave 2; techniques as
  transforms of bars of numerals.
- `src/data/progressions.ts`: the catalog, each entry citing a source
  (Wikipedia, Music Theory Online, the studies found for this feature).
- Not reading the progression out of the open song (later).

## Approaches

1. **A tab in the Library (picked):** previews and insertion already work
   there; progressions sit beside presets and takes.
2. A separate app: no access to the song or its sounds; only worth it as
   a study tool for others.
3. A canvas node that holds a progression: ties it to one line; the
   catalog and comparing would still need a panel.
