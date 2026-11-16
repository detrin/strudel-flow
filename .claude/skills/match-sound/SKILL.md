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
   `sm blocks` prints it.
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

Clues seen so far: notes exactly on equal temperament with instant jumps
are a hard-tuned vocal; harmonic strengths that change from note to note
mean a voice (fixed formants), the same strengths a synth; a brick-wall
cut in the spectrum is a filter or sample-rate reduction; tones high up
spaced by a fixed f0 that are not its multiples are aliasing from a
bitcrusher (`coarse`, `crush`).

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

## 4. Record and compare

Record from the app with the MCP tools: `set_code`, `record_start`,
`play`, wait (call `get_diagnostics` a few times), `record_stop` with a
path, `stop`. Recording starts with the first cycle, so the remake begins
at its own first onset.

If `record_stop` says "Nothing was recorded" and `get_diagnostics` shows an
empty `evaluated`, the tab was reloaded and its audio is locked until a
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

Also `bars`, `peaks` and `harmonics` on the take, to compare levels per
bar, high tones and timbre. Repeat until the differences are below the grid
(a 64th, about 23 ms at 160 bpm) and say what is still off.

Save takes for the person to listen to in `~/.strudelton/recordings/`,
next to a cut of the original (`ffmpeg -ss A -t D -i song.wav out.wav`).
