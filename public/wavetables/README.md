# Wavetables

Strudel plays any sound named `wt_*` as a wavetable: the `.wav` is cut into frames of 2048 samples and
`.wt(0..1)` picks the position between them. Load one in a song with

```js
samples({ wt_flumestack: '/wavetables/flumestack.wav' });
```

| file             | frames                 | stack (`wt` position)                                                                                                                              |
| ---------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flumestack.wav` | 16 x 2048, mono 16-bit | 0 sine, 0.125 triangle, 0.25 saw, 0.375 square, 0.5 pulse 20%, 0.625 hard sync x2.5, 0.75 FM 2:1, 0.875 vowel "a", 1 wavefold (crossfaded between) |

`flumestack.wav` is built by `strudel/wavetables/make_stack.py` in the tidalcycles songs folder.
