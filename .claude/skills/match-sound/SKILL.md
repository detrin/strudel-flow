---
name: match-sound
description: Use when the person asks what a sound in a song or video is, or to remake a sound, riff, vocal chop, glitch or effect from a reference track (YouTube link, audio file) in Strudelton, or says a remade sound is "not close enough" or "off". Measures the reference and recordings of the remake with sound_match.py and iterates until the numbers agree. DO NOT TRIGGER for writing new music with no reference, or for app bugs.
---

# Match a sound from a reference track

Find what a sound is, then remake it in the open patch and prove it matches.
Never trust your ear or a guess: measure the original, record the remake
from the app, measure it the same way, compare, adjust. When the person
says it is off, measure again more finely and show the numbers.

Tool: `sound_match.py` next to this file. It needs a Python with numpy and
scipy (here only `/opt/homebrew/bin/python3.11` has them). Run it with
`-I` and keep downloads in their own folder:

```sh
sm() { /opt/homebrew/bin/python3.11 -I .claude/skills/match-sound/sound_match.py "$@"; }
sm --help
```

Define `sm` again in each Bash call (shell state does not carry over); a
variable (`sm`) does not work, zsh does not split it into words.

## 1. Get the audio

```sh
sm fetch "https://www.youtube.com/watch?v=…" /tmp/match/dl
```

YouTube breaks old yt-dlp quickly (HTTP 403, "page needs to be reloaded").
Update the global one with the Python it was installed with
(`head -1 $(which yt-dlp)`), here:
`/opt/homebrew/opt/python@3.11/bin/python3.11 -m pip install -U "yt-dlp[default]" --break-system-packages`.

## 2. Find the sound

1. Tempo and grid: `sm tempo song.wav 30 110` (it may say half or double;
   check against block starts). Beat 1 is the first onset of the section:
   `sm blocks` prints it. For anything that loops, `sm loop song.wav A B`
   first: the loop is a whole number of bars, so its length fixes the tempo.
   `tempo` can lock onto a cross-rhythm (it said 142.5 for a 4.5 s loop that
   is 2 bars at 106.67, a 4:3 feel).
2. Look at short stretches, not the whole song: `sm spectro song.wav A 6
out.png`, then Read the PNG. Whole-song pictures hide the detail.
3. Sounds the person calls "high" or "glitchy" often live only in the side
   channel (left minus right) and above 8 kHz: `sm sidediff song.wav A B C`
   shows which bands get louder at the moment they name, then
   `sm spectro … --side --lin --fmin 5000` and `sm peaks … --side`.
   Never resample to 22 kHz before this: it removes everything above 11 kHz.
4. Song sections, for the Arrange node: `sm bars song.wav 36 --bpm B --t0 T`
   (add `--side --band LO,HI` to follow one sound). `gaps` lists silent 32nds
   per bar: a gate shows as the same gaps every bar.
5. Rhythm and notes of a chopped or gated part:
   `sm blocks song.wav A B --bpm B --t0 T` gives each block's grid position
   and length in 64ths and the pitch changes inside it.
6. Timbre of a pitched sound: `sm harmonics song.wav F0 t1 t2 …` (times
   inside held notes) prints `const HARM = […]` for an additive remake.
7. Several parts at once (melody over chords, a bassline): `sm roll song.wav
A B --bpm B --t0 T` lists the notes in each 16th (`--div 8` for 8ths,
   `--lo/--hi` MIDI range per part). A 16th window cannot resolve notes under
   about 60 Hz: for a bassline or 808 use `sm roots song.wav --bpm B --t0 T
--bars N --div 2` (half bars; `--div 4` for quarters), long windows with
   the strongest peak beside the note (trust the peak when they disagree).
8. A lead or melody: `sm track song.wav A B --lo HZ --hi HZ --bpm B --t0 T`
   gives the two strongest pitches every 23 ms with exact cents. Write the
   notes from it, not from `roll` alone: it shows held notes, short bends,
   rests and a second voice (a fifth under or over, often 5-10 dB down) that
   a 16th grid hides. Tuning comes only from `track`: FFT peaks read about
   10 cents flat at these window sizes, and a detune that is not there beats
   against every other part (it sounds "distorted", "uncanny").
9. When a lead still sounds "close but not exact" (two voices, harmonics
   that change from note to note, the second voice's harmonics landing on
   the first's), stop modelling notes and resynthesize the tone lines:
   `sm lines song.wav A B --bpm B --t0 T --table` prints every steady line
   of the spectrogram as `const TONES = [[start16, len16, midi, peak,
attack, decay, sustain], …]`, played with

   ```js
   tones: stack(
     ...TONES.map(([s, d, m, g, a, dc, su]) =>
       timeCat(
         ...[
           [s, silence],
           [
             d,
             note(m)
               .gain(g * 0.55)
               .attack(a)
               .decay(dc)
               .sustain(su),
           ],
           [LOOP16 - s - d, silence],
         ].filter(([w]) => w > 0),
       ).slow(LOOP16 / 16),
     ),
   )
     .sound('sine')
     .release(0.03);
   ```

   (`LOOP16` = 16ths in the whole loop; Strudel reads backtick strings as
   mini-notation, so build patterns with `timeCat`, not template strings).
   Keep the 4096 window: 2048 blurs low tones and scored worse. Add
   band-limited noise gated with the notes if the original has it between
   the lines (without it the distance doubled here). On one lead this went
   from 7.7 dB (hand-written notes) to 4.3 dB.

10. Add only parts you measured. Before adding chords or a pad, check the
    band they would fill (`sm bands` on the original, or `octaves`): a pad
    under a lead that has none was the main thing that sounded wrong in one
    remake. Two voices of one instrument are two lines with their own levels.
11. Drums: `sm drums song.wav --bpm B --t0 T --bars N` prints onsets per
    32nd in kick, snare, hats and top bands. A hit in every band at once is a
    snare or clap, not a chord; rolls often sit in the top band only; a kick
    row that follows the bassline is the 808.
12. A sequence that changes every step (an arp, a glitch loop): `sm steps
song.wav --bpm B --t0 T --n 32` gives per 16th the note, its strongest
    partial above 2.5 kHz as a multiple of the note, that partial's level re
    the note, and the step's level. Write the remake's patterns from these
    columns (notes, `fmh`, `fm`, `gain` per step).

Clues seen so far: notes exactly on equal temperament with instant jumps
are a hard-tuned vocal; harmonic strengths that change from note to note
mean a voice (fixed formants), the same strengths a synth; a brick-wall
cut in the spectrum is a filter or sample-rate reduction; tones high up
spaced by a fixed f0 that are not its multiples are aliasing from a
bitcrusher (`coarse`, `crush`); a high tone whose frequency is a fixed
multiple of the bass note (it moves with it and pulses at the bass
frequency) is a high harmonic of the 808 itself, remade as sines at
`bass * 290, 291, 292`; dense harmonics up to 16 kHz that vanish when one
part rests mean that part is a bright saw, whatever the mix suggests;
pairs of high partials at exactly (k-1) and (k+1) times the note with
nothing at k are FM: a sine with `.fmh(k)`, and Strudel's `.fm(i)` index is
about 2·10^(sideband dB/20) (it matched within 1-2 dB); k that jumps from
note to note is what makes such a loop sound glitchy.

## 3. Remake it

- `setcpm(bpm/4)` so one cycle is one bar; then each line ends with
  `.mask("<1!4 0!32>")`, which the canvas shows as an Arrange node.
- Write gated or chopped parts on a 64th grid: one beat is `[… ]` with
  weights summing to 16 (`[63@8 65@3 ~@5]`), a two-beat block `[…]@2`.
- Timbre from measured harmonics beats any preset:
  `stack(...HARM.map((g, i) => note(MEL).add(note(12 * Math.log2(i + 1))).gain(g))).sound("sine")`
  with `MEL` a pattern of MIDI numbers. It matched to 0.5 dB where
  sawtooth + `vowel` was 8 to 15 dB off.
- `gm_*` voices played silence on first use here (soundfont loading);
  play one twice before judging it.
- Notes sound about 20 ms longer than written (release and room): write
  them shorter, and check with `compare`, not by arithmetic.
- `coarse`/`crush` seem to run after the filters: a low-pass will not
  remove the aliasing they add.
- Per-step patterns (`fm`, `fmh`, `gain` from `steps`) go before `.slow()`:
  `note(N).fm(I).fmh(R).gain(G).slow(2)`. After `.slow(2)` they would run
  twice as fast as the notes.

## 4. Record and compare

Record from the app with the MCP tools: `set_code`, `record_start`,
`play`, wait (call `get_diagnostics` a few times), `record_stop` with a
path, `stop`. Playback does not restart at cycle 0, and `play` right after
`set_code` may still run the old code for a moment (check `evaluated`):
record at least two loops and find bar 1 with
`sm align song.wav take.wav --bars N --bpm B` (cross-correlation over one
loop). `sm bands song.wav take.wav --bars N --bpm B` then prints the level
per bar in fixed bands (sub, low, mid, snare, hats, air, plus `--band LO,HI`)
and the take minus the original: fix the part that owns each band.
`set_node` cannot change a Voice node's sound; use `set_code`.

Work on your own dev server (own worktree and port) when another session
uses the app. The MCP tools only reach :5174 and :5173; for another port
talk to `/__bridge?role=agent` on it with the same JSON messages
(`{id, method, params}`; `play` is `set_playing`). If the Playwright MCP
browser is busy, launch Chromium from the worktree's `@playwright/test` with
`--autoplay-policy=no-user-gesture-required`, open the app and click
"Play code": that tab gets the commands and records without a click.

After the app is rebuilt (`pnpm stable`) the person's tab reloads and its
audio is locked until a click, so open the Playwright tab before the first
take instead of finding out from a failed one. If `record_stop` says "Nothing
was recorded" and `get_diagnostics` shows an empty `evaluated`, the tab was
reloaded and its audio is locked until a
click. Do not ask the person: open the app in Playwright
(`browser_navigate` to the same URL, click "Play code"), then commands go
to that newest tab. Close it afterwards and `set_code` again so the
person's tab gets the final version.

```sh
sm compare song.wav take.wav A B
```

prints, per block: start, and where the level falls 6, 12 and 20 dB under
the block's peak, for both, with the differences. Read it as:

- `d_start`: onset timing. Within a few ms is right.
- `d-12`: where the gate cuts. This is the note length to fix.
- `d-6`: the shape inside the block (decay too slow or fast).
- `d-20`: the tail after the cut (release).

For a melody, per-bar levels are not enough: they matched within 1 dB on
a remake whose notes and timbre were clearly off. Also run, with the offset
of the take's bar 1 minus the original's:

- `sm melody song.wav take.wav A B --offset O --bpm B --lo HZ --hi HZ`: the
  share of 23 ms frames where the main note agrees, per bar (aim for 85%+;
  the rest should be one-frame edges), the frames that differ, and the
  tuning difference.
- `sm octaves song.wav take.wav T DUR --offset O` on a few held notes: energy
  per octave against the note's loudest octave. Within about 4 dB is right.
  Fill a band only on the notes it is missing on: noise added to raise a
  per-bar level made the notes 10-20 dB too noisy.

`sm distance song.wav take.wav A DUR --offset O --bpm B` gives one number
for the whole passage (mean dB difference of the spectrograms, per bar),
and refines the offset within 60 ms. Use it to choose between two versions;
the per-frame `melody` score can prefer a version that sounds further off,
because it only looks at the strongest note.

For a step sequence, `sm steps song.wav --bpm B --t0 0 --compare take.wav
--offset O` puts the take's row beside each step of the original and ends
with "notes the same: N/32; mean |Δlevel|". All notes the same and under
1 dB was a match.

`sm align` also prints the runner-up offset (at least a beat away): when
its correlation is close to the best one, the match is ambiguous. `sm align`
can be off by 50 ms or more. Check it with `sm entry take.wav`
(where a part enters after silence, default the sub band) against the same
part in the original, and pass `--offset` to `bands` yourself.

Also `bars`, `peaks` and `harmonics` on the take, to compare levels per
bar, high tones and timbre. Repeat until the differences are below the grid
(a 64th, about 23 ms at 160 bpm) and say what is still off.

Save takes for the person to listen to in `~/.strudelton/recordings/`,
next to a cut of the original (`ffmpeg -ss A -t D -i song.wav out.wav`).

## 5. Keep it and show it

- Finished tracks go to the Library, which is local
  (`~/.strudelton/presets/`): `save_preset` per line, named "song: part",
  tagged with the song, the role and "N bpm" (presets do not keep the
  tempo; `preview_preset` plays them at it). The repo is public: never commit
  the person's songs or presets unless they ask; code fixes found on the way
  are fine.
- The tempo is global. When songs at different tempi share a patch, mute
  the others (`_label:`) and note each song's tempo in a comment above its
  constants.
- Lay the canvas out per song: the layout from `pnpm shot FILE --tidy --code
OUT` (Auto-arrange in a background tab measures nothing and stacks nodes on
  a default grid), each song's group moved down 100-200 px from the previous
  one, then one `// @frame` per song from 60 px above its first row to 70 px
  above the next song, labels under about 20 characters (longer ones are
  cut). Check with `pnpm shot FILE --fit` and read the PNG before opening it
  in the person's tab (`open_file` reads the file on disk).
