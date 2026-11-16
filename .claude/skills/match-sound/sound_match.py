"""Measure a reference track and a Strudelton recording of a sound remade from it.

Run with a Python that has numpy and scipy, isolated from the working dir:
  python3 -I sound_match.py <command> ...

Commands (times in seconds, --bpm and --t0 give the beat grid):
  fetch URL DIR                 download audio as DIR/song.wav (yt-dlp)
  tempo FILE A B                tempo candidates between A and B
  spectro FILE A DUR OUT.png    spectrogram (--side, --fmin, --fmax, --lin)
  sidediff FILE A B C           which bands get louder from [A,B) to [B,C)
  bars FILE N                   per-bar level and 32nd map (--band LO,HI, --side)
  blocks FILE A B               gated blocks: grid position, length, pitches
  harmonics FILE F0 T...        harmonic profile at times T (gains for Strudel)
  compare ORIG REPRO A B        blocks and pitches side by side, aligned
  peaks FILE A B                tonal peaks (--side, --fmin, --fmax)
  loop FILE A B                 how long a passage takes to repeat (→ tempo)
  steps FILE --bpm --t0         per step: note, high partial ×note, levels (--compare TAKE --offset)
  drums FILE --bpm --t0         onsets per 32nd in kick/snare/hats/top bands
  roots FILE --bpm --t0         bass note per half bar (long windows)
  track FILE A B                two strongest pitches every 23 ms, in cents
  melody ORIG REPRO A B         main note of both per frame, agreement per bar
  octaves ORIG REPRO T DUR      one note's octave spectrum in both (--offset)
  entry FILE                    where a part starts after silence (--band)
  lines FILE A B                every steady tone line as a TONES table
  distance ORIG REPRO A DUR     mean dB difference of the spectrograms
"""

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy.io import wavfile
from scipy.signal import butter, find_peaks, sosfiltfilt, stft, welch

NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
SHADES = ' .:-=+*#%@'


def note_name(midi):
    n = int(round(midi))
    return f'{NAMES[n % 12]}{n // 12 - 1}'


def load(path, channel='mid'):
    sr, raw = wavfile.read(path)
    x = raw.astype(float)
    if raw.dtype.kind == 'i':
        x = x / np.iinfo(raw.dtype).max
    if x.ndim == 1:
        return sr, x
    if channel == 'side':
        return sr, (x[:, 0] - x[:, 1]) / 2
    if channel == 'left':
        return sr, x[:, 0]
    if channel == 'right':
        return sr, x[:, 1]
    return sr, x.mean(1)


def bandpass(sr, x, band):
    if not band:
        return x
    lo, hi = band
    sos = butter(4, [lo, min(hi, sr / 2 - 100)], 'bandpass', fs=sr, output='sos')
    return sosfiltfilt(sos, x)


def db(v):
    return 20 * np.log10(np.asarray(v) + 1e-12)


def rms_frames(x, sr, a, b, hop, win):
    seg = x[int(a * sr) : int(b * sr)]
    h, w = int(sr * hop), int(sr * win)
    return np.array(
        [np.sqrt(np.mean(seg[i : i + w] ** 2)) for i in range(0, len(seg) - w, h)]
    )


def blocks_of(sr, x, a, b, floor=20):
    """Sound blocks between a and b: [start, end] where the level is within
    `floor` dB of the window's 90th percentile (not its peak, so one loud hit
    at the edge does not shorten every block), release tails merged."""
    e = db(rms_frames(x, sr, a, b, 0.001, 0.004))
    on = e > np.percentile(e, 90) - floor
    on = np.convolve(on, np.ones(5), 'same') >= 3
    edges = np.flatnonzero(np.diff(on.astype(int)))
    events = [(a + (i + 1) * 0.001, bool(on[i + 1])) for i in edges]
    if on[0]:
        events.insert(0, (a, True))
    out = []
    for (ta, up), (tb, down) in zip(events, events[1:]):
        if up and not down and tb - ta > 0.05:
            out.append([ta, tb])
    if events and events[-1][1] and b - events[-1][0] > 0.05:
        out.append([events[-1][0], b])
    merged = []
    for blk in out:
        if merged and blk[0] - merged[-1][1] < 0.02:
            merged[-1][1] = blk[1]
        else:
            merged.append(blk)
    return merged


def pitch_track(sr, x, a, b, lo=48, hi=84, hop=0.004, n=2048):
    """Pitch segments (start offset, midi) inside [a, b] by harmonic sum."""
    cand = np.arange(lo, hi + 0.01, 0.25)
    f0s = 440 * 2 ** ((cand - 69) / 12)
    fr = np.fft.rfftfreq(n * 4, 1 / sr)
    segs = []
    for t in np.arange(a + 0.01, b - 0.01, hop):
        c = int(t * sr)
        s = x[max(0, c - n // 2) : c + n // 2]
        if len(s) < n:
            continue
        spec = np.abs(np.fft.rfft(s * np.hanning(n), n * 4))
        score = [
            sum(np.interp(f * k, fr, spec) / k**0.3 for k in range(1, 8))
            - 0.5 * np.interp(f * 0.5, fr, spec)
            for f in f0s
        ]
        m = int(round(cand[int(np.argmax(score))]))
        if segs and segs[-1][1] == m:
            segs[-1][2] = t
        else:
            segs.append([t, m, t])
    return [(s - a, m) for s, m, e in segs if e - s >= 0.012]


def cmd_fetch(args):
    out = Path(args.dir)
    out.mkdir(parents=True, exist_ok=True)
    if not shutil.which('yt-dlp'):
        sys.exit('yt-dlp not found')
    cmd = ['yt-dlp', '--js-runtimes', 'node', '-f', 'bestaudio', '-x']
    cmd += ['--audio-format', 'wav', '-o', str(out / 'song.%(ext)s'), args.url]
    if subprocess.run(cmd).returncode:
        sys.exit('download failed: update yt-dlp first (see SKILL.md)')
    print(out / 'song.wav')


def cmd_tempo(args):
    sr, x = load(args.file)
    seg = x[int(args.a * sr) : int(args.b * sr)]
    _, _, z = stft(seg, sr, nperseg=1024, noverlap=768)
    flux = np.maximum(0, np.diff(np.log1p(np.abs(z) * 100), axis=1)).sum(0)
    flux -= flux.mean()
    ac = np.correlate(flux, flux, 'full')[len(flux) - 1 :]
    fps = sr / 256
    scores = []
    for bpm in np.arange(60, 200, 0.5):
        lag = 60 / bpm * fps
        s = sum(np.interp(lag * k, np.arange(len(ac)), ac) for k in (1, 2, 4))
        scores.append((s, bpm))
    scores.sort(reverse=True)
    print('best bpm:', ', '.join(f'{b:g}' for _, b in scores[:6]))


def cmd_spectro(args):
    chain = '0.5*c0-0.5*c1' if args.side else '0.5*c0+0.5*c1'
    scale = 'lin' if args.lin else 'log'
    lavfi = (
        f'showspectrumpic=s=2000x700:legend=1:scale=log:fscale={scale}'
        f':color=intensity:start={args.fmin}:stop={args.fmax}'
    )
    cmd = ['ffmpeg', '-loglevel', 'error', '-y', '-ss', str(args.a)]
    cmd += ['-t', str(args.dur), '-i', args.file, '-af', f'pan=mono|c0={chain}']
    cmd += ['-lavfi', lavfi, args.out]
    subprocess.run(cmd, check=True)
    print(args.out)


def cmd_sidediff(args):
    sr, stereo = wavfile.read(args.file)
    stereo = stereo.astype(float)
    edges = [100, 400, 1000, 2000, 4000, 6000, 8000, 10000, 12000, 16000, 20000]
    for name, sig in (
        ('mid', stereo.mean(1)),
        ('side', (stereo[:, 0] - stereo[:, 1]) / 2),
    ):
        f, p1 = welch(sig[int(args.a * sr) : int(args.b * sr)], sr, nperseg=8192)
        _, p2 = welch(sig[int(args.b * sr) : int(args.c * sr)], sr, nperseg=8192)
        d = 10 * np.log10(p2 + 1e-15) - 10 * np.log10(p1 + 1e-15)
        cells = [
            f'{lo // 1000}-{hi // 1000}k:{np.mean(d[(f >= lo) & (f < hi)]):+.1f}'
            for lo, hi in zip(edges, edges[1:])
        ]
        print(f'{name:4s}', ' '.join(cells))


def cmd_bars(args):
    sr, x = load(args.file, 'side' if args.side else 'mid')
    x = bandpass(sr, x, args.band)
    bar = 60 / args.bpm * 4
    step = bar / 32
    rows = []
    for b in range(args.n):
        t = args.t0 + b * bar
        v = [
            np.sqrt(np.mean(x[int((t + i * step) * sr) : int((t + (i + 1) * step) * sr)] ** 2))
            for i in range(32)
        ]
        rows.append(db(v))
    top = max(r.max() for r in rows)
    for b, r in enumerate(rows):
        r = r - top
        shade = ''.join(SHADES[min(9, max(0, int((v + 40) / 4)))] for v in r)
        gaps = [i for i in range(32) if r[i] < np.median(r) - 15]
        t = args.t0 + b * bar
        print(f'bar{b + 1:4d} {t:7.2f}s |{shade}| {r.mean():6.1f} dB  gaps {gaps}')


def grid_pos(t, t0, bpm):
    return (t - t0) / (60 / bpm / 16)


def cmd_blocks(args):
    sr, x = load(args.file)
    t0 = args.t0 if args.t0 is not None else None
    found = blocks_of(sr, x, args.a, args.b)
    if not found:
        sys.exit('no blocks found')
    t0 = found[0][0] if t0 is None else t0
    sixty4 = 60 / args.bpm / 16
    print(f'grid: 64th = {sixty4 * 1000:.2f} ms, beat 1 at {t0:.3f}s')
    for a, b in found:
        segs = pitch_track(sr, x, a, b)
        notes = ' '.join(
            f'{note_name(m)}@{grid_pos(a + s, t0, args.bpm):.1f}' for s, m in segs
        )
        print(
            f'{a:7.3f}-{b:7.3f}s  64th {grid_pos(a, t0, args.bpm):6.1f}'
            f'  len {(b - a) * 1000:5.0f} ms = {(b - a) / sixty4:4.1f} 64ths  {notes}'
        )


def cmd_harmonics(args):
    sr, x = load(args.file)
    # low notes need a longer window; pad to resolve each harmonic
    n = 8192 if args.f0 > 150 else 16384
    pad = 1 << 18
    fr = np.fft.rfftfreq(pad, 1 / sr)
    profiles = []
    for t in args.times:
        s = x[int(t * sr) : int(t * sr) + n]
        spec = np.abs(np.fft.rfft(s * np.hanning(len(s)), pad))
        h = np.array(
            [
                spec[np.abs(fr - args.f0 * k) <= max(0.03 * args.f0 * k, 2 * sr / n)].max()
                for k in range(1, args.count + 1)
            ]
        )
        profiles.append(db(h / h.max()))
    p = np.median(profiles, 0)
    print('dB  ', ' '.join(f'{v:4.0f}' for v in p))
    gains = ', '.join(f'{10 ** (v / 20):.2g}' for v in p)
    print(f'const HARM = [{gains}]')
    print('vox: stack(...HARM.map((g, i) => note(MEL).add(note(12 * Math.log2(i + 1))).gain(g))).sound("sine")')


def first_onset(sr, x):
    e = rms_frames(x, sr, 0, min(len(x) / sr, 10), 0.001, 0.004)
    return np.flatnonzero(e > e.max() * 0.05)[0] * 0.001


def fall_times(sr, x, a, b, drops=(6, 12, 20)):
    """Milliseconds after `a` where the level last sits within each drop (dB)
    of the block's peak: -6 is the body, -20 the tail."""
    e = db(rms_frames(x, sr, a, b, 0.001, 0.004))
    return [
        (np.flatnonzero(e > e.max() - d)[-1] + 1) if (e > e.max() - d).any() else 0
        for d in drops
    ]


def cmd_compare(args):
    sra, xa = load(args.orig)
    srb, xb = load(args.repro)
    oa = blocks_of(sra, xa, args.a, args.b)
    rb = first_onset(srb, xb)
    ob = blocks_of(srb, xb, rb - 0.005, rb + (args.b - oa[0][0]) + 0.2)
    print('start (ms from first block), end where the level is 6/12/20 dB under the block peak')
    print('   orig start  -6 -12 -20 | repro start  -6 -12 -20 | d_start  d-6 d-12 d-20')
    for (a1, a2), (b1, b2) in zip(oa, ob):
        ds = ((b1 - ob[0][0]) - (a1 - oa[0][0])) * 1000
        fa = fall_times(sra, xa, a1, a2 + 0.03)
        fb = fall_times(srb, xb, b1, b2 + 0.03)
        diff = ' '.join(f'{q - p:+4d}' for p, q in zip(fa, fb))
        print(
            f'  {(a1 - oa[0][0]) * 1000:10.0f} {fa[0]:3d} {fa[1]:3d} {fa[2]:3d} |'
            f' {(b1 - ob[0][0]) * 1000:11.0f} {fb[0]:3d} {fb[1]:3d} {fb[2]:3d} |'
            f' {ds:+7.0f} {diff}'
        )
        for name, sr, x, s, e in (('orig', sra, xa, a1, a2), ('repro', srb, xb, b1, b2)):
            segs = pitch_track(sr, x, s, e)
            print(f'      {name:5s}', ' '.join(f'{note_name(m)}@{t * 1000:.0f}' for t, m in segs))
    if len(oa) != len(ob):
        print(f'block count differs: orig {len(oa)}, repro {len(ob)}')


def band_env(sr, x, lo, hi, hop=0.005):
    y = bandpass(sr, x, (lo, hi))
    h = int(sr * hop)
    e = np.log(np.array([np.sqrt(np.mean(y[i : i + h] ** 2)) for i in range(0, len(y) - h, h)]) + 1e-6)
    return (e - e.mean()) / (e.std() + 1e-9)


def find_offset(orig, repro, bars, bpm):
    """Seconds into `repro` where the original's bar 1 lines up, searched over
    one loop of `bars` bars (playback does not restart at cycle 0)."""
    sra, xa = load(orig)
    srb, xb = load(repro)
    period = bars * 60 / bpm * 4
    n = int(period / 0.005)
    ea = [band_env(sra, xa, lo, hi)[:n] for lo, hi in ((25, 60), (600, 2500), (6000, 12000))]
    n = min(n, *(len(a) for a in ea))
    ea = [a[:n] for a in ea]
    eb = [band_env(srb, xb, lo, hi) for lo, hi in ((25, 60), (600, 2500), (6000, 12000))]
    scores = []
    for lag in range(0, n):
        if lag + n > len(eb[0]):
            break
        scores.append((sum(np.dot(a, b[lag : lag + n]) for a, b in zip(ea, eb)) / n / len(ea), lag))
    scores.sort(reverse=True)
    best = scores[0]
    beat = 60 / bpm / 0.005
    rival = next((s for s in scores[1:] if abs(s[1] - best[1]) > beat), None)
    find_offset.rival = (rival[1] * 0.005, rival[0]) if rival else None
    return best[1] * 0.005, best[0]


def cmd_align(args):
    off, corr = find_offset(args.orig, args.repro, args.bars, args.bpm)
    print(f'{off:.3f}')
    rival = getattr(find_offset, 'rival', None)
    note = f'; runner-up {rival[0]:.3f}s at {rival[1]:.2f}' if rival else ''
    print(f'correlation {corr:.2f}{note} (record at least two loops; a runner-up close to the best means check by ear or with `entry`)', file=sys.stderr)


BANDS = {
    'sub 25-60': (25, 60),
    'low 60-250': (60, 250),
    'mid 600-2.5k': (600, 2500),
    'snare 1.5-4k': (1500, 4000),
    'hats 8-12k': (8000, 12000),
    'air 12-16k': (12000, 16000),
}


def cmd_bands(args):
    """Level per bar in fixed bands, original vs take aligned with `align`."""
    sra, xa = load(args.orig)
    srb, xb = load(args.repro)
    off = args.offset
    if off is None:
        off, _ = find_offset(args.orig, args.repro, args.bars, args.bpm)
    bar = 60 / args.bpm * 4
    bands = dict(BANDS)
    for spec in args.band or []:
        lo, hi = (float(v) for v in spec.split(','))
        bands[f'{lo:g}-{hi:g}'] = (lo, hi)
    print(f'take bar 1 at {off:.3f}s; dB per bar, then take minus original')
    for name, (lo, hi) in bands.items():
        ya, yb = bandpass(sra, xa, (lo, hi)), bandpass(srb, xb, (lo, hi))
        la = [db(np.sqrt(np.mean(ya[int(i * bar * sra) : int((i + 1) * bar * sra)] ** 2))) for i in range(args.bars)]
        lb = [db(np.sqrt(np.mean(yb[int((off + i * bar) * srb) : int((off + (i + 1) * bar) * srb)] ** 2))) for i in range(args.bars)]
        print(f'{name:14s}', ' '.join(f'{v:6.1f}' for v in la), ' | ', ' '.join(f'{b - a:+5.1f}' for a, b in zip(la, lb)))


def cmd_roll(args):
    """Piano roll: notes sounding in each grid step (polyphonic), strongest
    first, from a constant-Q-like sum of the spectrum around each semitone."""
    sr, x = load(args.file, 'side' if args.side else 'mid')
    step = 60 / args.bpm / args.div * 4
    n = int(2 ** np.ceil(np.log2(sr * max(step, 0.09))))
    fr = np.fft.rfftfreq(n * 2, 1 / sr)
    midis = np.arange(args.lo, args.hi + 1)
    centers = 440 * 2 ** ((midis - 69) / 12)
    bands = [(fr > c * 2 ** (-0.5 / 12)) & (fr < c * 2 ** (0.5 / 12)) for c in centers]
    t = args.t0 if args.t0 is not None else args.a
    rows = []
    while t < args.b:
        c = int((t + step / 2) * sr)
        if c + n // 2 > len(x):
            break
        s = x[max(0, c - n // 2) : c + n // 2]
        s = np.pad(s, (n - len(s), 0))
        spec = np.abs(np.fft.rfft(s * np.hanning(n), n * 2)) ** 2
        e = np.array([spec[m].sum() if m.any() else 0 for m in bands])
        # remove energy explained by harmonics of lower notes
        e2 = e.copy()
        for i, m in enumerate(midis):
            for k, semis in ((2, 12), (3, 19), (4, 24), (5, 28)):
                j = i + semis
                if j < len(e2):
                    e2[j] = max(0, e2[j] - e[i] / k)
        rows.append((t, db(np.sqrt(e2))))
        t += step
    top = max(r.max() for _, r in rows)
    for t, r in rows:
        r = r - top
        idx = [i for i in np.argsort(r)[::-1] if r[i] > -args.floor][: args.max]
        pos = (t - (args.t0 if args.t0 is not None else args.a)) / step
        notes = ' '.join(f'{note_name(midis[i])}({r[i]:.0f})' for i in idx)
        print(f'{t:7.3f}s step {pos:5.0f}  {notes}')


def cmd_peaks(args):
    sr, x = load(args.file, 'side' if args.side else 'mid')
    f, p = welch(x[int(args.a * sr) : int(args.b * sr)], sr, nperseg=32768)
    w = (f > args.fmin) & (f < args.fmax)
    pk, props = find_peaks(10 * np.log10(p[w] + 1e-15), prominence=6)
    top = sorted(zip(props['prominences'], f[w][pk]), reverse=True)[:10]
    for prom, freq in sorted(top, key=lambda v: v[1]):
        midi = 69 + 12 * np.log2(freq / 440)
        print(f'{freq:8.0f} Hz  {note_name(midi):5s} prominence {prom:4.1f} dB')
    if len(top) > 2:
        fs = np.sort([v for _, v in top])
        print('spacings:', ' '.join(f'{d:.0f}' for d in np.diff(fs)))


def track_frames(sr, x, a, b, lo, hi, hop=0.0234375, win=0.06):
    """Two strongest pitches per frame by harmonic sum (4 harmonics), as
    (time, level dB, [(midi, rel dB), (midi, rel dB)]). Cents are exact, not
    rounded to FFT bins, and a fifth or octave above is not taken for a note."""
    from scipy.ndimage import maximum_filter1d
    w, h, z = int(win * sr), int(hop * sr), 1 << 16
    fr = np.fft.rfftfreq(z, 1 / sr)
    cand = 440 * 2 ** ((np.arange(12 * np.log2(lo / 440) * 10, 12 * np.log2(hi / 440) * 10) / 10) / 12)
    idx = [np.clip(np.round(cand * k / fr[1]).astype(int), 0, len(fr) - 1) for k in range(1, 5)]
    out = []
    for c in range(int(a * sr), int(b * sr) - w, h):
        sp = maximum_filter1d(np.abs(np.fft.rfft(x[c : c + w] * np.hanning(w), z)), 7)
        hs = sum(sp[i] / np.sqrt(k + 1) for k, i in enumerate(idx))
        picks = []
        for i in np.argsort(hs)[::-1]:
            m = 69 + 12 * np.log2(cand[i] / 440)
            if all(abs(m - q) > 1.5 and abs(abs(m - q) - 12) > 0.5 for q, _ in picks):
                picks.append((m, db(hs[i] / hs.max())))
            if len(picks) == 2:
                break
        out.append((c / sr, float(db(hs.max() / w)), picks))
    return out


def cents(m):
    return f'{note_name(m)}{(m - round(m)) * 100:+3.0f}'


def cmd_track(args):
    sr, x = load(args.file)
    for t, lv, picks in track_frames(sr, x, args.a, args.b, args.lo, args.hi):
        pos = f'  16th {(t - args.t0) / (15 / args.bpm):6.2f}' if args.t0 is not None else ''
        (m1, _), (m2, r2) = picks
        print(f'{t:7.3f}{pos} {lv:5.0f} dB  {cents(m1):9s} {cents(m2):9s}({r2:4.0f})')


def cmd_melody(args):
    """The main note of the original and the take, frame by frame: how often
    they agree per bar, and every frame where they do not (A, B on the
    original; the take is read at the same times plus --offset)."""
    sra, xa = load(args.orig)
    srb, xb = load(args.repro)
    ta = track_frames(sra, xa, args.a, args.b, args.lo, args.hi)
    tb = track_frames(srb, xb, args.a + args.offset, args.b + args.offset, args.lo, args.hi)
    bar = 240 / args.bpm
    top = max(lv for _, lv, _ in ta)
    stats, wrong = {}, []
    for (t, la, pa), (_, lb, pb) in zip(ta, tb):
        if la < top - args.floor:
            continue
        k = int((t - args.a) / bar) + 1
        na, nb = round(pa[0][0]), round(pb[0][0])
        s = stats.setdefault(k, [0, 0, 0])
        s[0] += 1
        if na == nb:
            s[1] += 1
        elif na in (round(m) for m, _ in pb) or nb in (round(m) for m, _ in pa):
            s[2] += 1
        else:
            wrong.append(f'{t:7.3f}  16th {(t - args.a) / (15 / args.bpm):6.2f}  orig {cents(pa[0][0]):9s} take {cents(pb[0][0])}')
        if abs(pa[0][0] - pb[0][0]) < 0.5:
            s.append(pa[0][0] - pb[0][0])
    for k, s in sorted(stats.items()):
        tune = np.median(s[3:]) * 100 if len(s) > 3 else 0
        print(f'bar {k}: same note {100 * s[1] / s[0]:3.0f}%, voices swapped {100 * s[2] / s[0]:3.0f}%, '
              f'other {100 * (s[0] - s[1] - s[2]) / s[0]:3.0f}%; original is {tune:+.0f} cents from the take')
    print('\n'.join(wrong))


def octave_levels(sr, x, a, dur):
    y = x[int(a * sr) : int((a + dur) * sr)]
    sp = np.abs(np.fft.rfft(y * np.hanning(len(y)))) ** 2
    fr = np.fft.rfftfreq(len(y), 1 / sr)
    edges = [100, 200, 400, 800, 1600, 3200, 6400, 12800, 20000]
    return edges, np.array([10 * np.log10(sp[(fr >= lo) & (fr < hi)].sum() + 1e-12) for lo, hi in zip(edges, edges[1:])])


def cmd_octaves(args):
    """One held note (T on the original, T + --offset on the take): energy per
    octave relative to its loudest octave. Harmonics too weak, a noise layer
    missing or a part that should not be there all show here."""
    sra, xa = load(args.orig)
    srb, xb = load(args.repro)
    edges, la = octave_levels(sra, xa, args.t, args.dur)
    _, lb = octave_levels(srb, xb, args.t + args.offset, args.dur)
    la, lb = la - la.max(), lb - lb.max()
    print('octave       ' + ' '.join(f'{lo:>6}' for lo in edges[:-1]))
    print('original     ' + ' '.join(f'{v:6.0f}' for v in la))
    print('take         ' + ' '.join(f'{v:6.0f}' for v in lb))
    print('take - orig  ' + ' '.join(f'{b - a:+6.0f}' for a, b in zip(la, lb)))


def cmd_entry(args):
    """First time the band rises above --level dB after at least --quiet
    seconds under it: where a part enters (the 808 after an intro). Use it for
    the take's offset when `align` disagrees with what you hear."""
    sr, x = load(args.file)
    y = bandpass(sr, x, args.band)
    h = int(0.005 * sr)
    e = db(np.sqrt(np.convolve(y ** 2, np.ones(h) / h, 'same'))[::h])
    q = int(args.quiet / 0.005)
    for i in range(q, len(e)):
        if e[i] > args.level and e[i - q : i].max() <= args.level:
            print(f'{i * 0.005:.3f}')
            return
    sys.exit('no entry found')


def tone_lines(sr, x, a, b, lo, hi, n=4096, minlen=0.07, floor=60):
    """Peaks of an STFT linked over time into lines (within 1.2% in
    frequency). Each line: start, end, Hz, median, start, end and peak level
    (dB re the loudest bin), and seconds from its start to its peak."""
    from scipy.signal import stft as _stft
    y = x[int(a * sr) : int(b * sr)]
    hop = 256
    fr, tt, z = _stft(y, sr, nperseg=n, noverlap=n - hop, nfft=4 * n)
    s = db(np.abs(z))
    top = s.max()
    w = (fr > lo) & (fr < hi)
    f, s = fr[w], s[w]
    done, act = [], []
    for j in range(s.shape[1]):
        col = s[:, j]
        pk, _ = find_peaks(col, prominence=10, height=top - floor)
        peaks = []
        for i in pk:
            if 0 < i < len(col) - 1:
                p, q, r = col[i - 1], col[i], col[i + 1]
                peaks.append((f[i] + 0.5 * (p - r) / (p - 2 * q + r) * (f[1] - f[0]), q))
        used, keep = set(), []
        for tr in act:
            last = tr['f'][-1]
            near = [k for k, (q, _) in enumerate(peaks) if k not in used and abs(q / last - 1) < 0.012]
            if near:
                k = min(near, key=lambda k: abs(peaks[k][0] - last))
                used.add(k)
                tr['f'].append(peaks[k][0]); tr['l'].append(peaks[k][1]); tr['e'] = j
                keep.append(tr)
            elif j - tr['e'] <= 2:
                keep.append(tr)
            else:
                done.append(tr)
        keep += [{'s': j, 'e': j, 'f': [q], 'l': [l]} for k, (q, l) in enumerate(peaks) if k not in used]
        act = keep
    out = []
    for tr in done + act:
        ts, te = a + tt[tr['s']], a + tt[tr['e']]
        if te - ts < minlen:
            continue
        lv = np.array(tr['l']) - top
        k = max(1, min(6, len(lv) // 3))
        out.append((ts, te, float(np.median(tr['f'])), float(np.median(lv)), float(np.median(lv[:k])),
                    float(np.median(lv[-k:])), float(lv.max()), float(tt[tr['s'] + int(np.argmax(lv))] - tt[tr['s']])))
    return sorted(out)


def cmd_lines(args):
    """Every steady tone of a passage, for a remake that plays them as sines:
    a list, then (with --bpm and --t0) a TONES table of [start and length in
    16ths, MIDI note with cents, peak level, time to the peak, decay to the
    end, end level / peak] for lines whose peak is above --min dB."""
    sr, x = load(args.file)
    rows = tone_lines(sr, x, args.a, args.b, args.lo, args.hi, n=args.window)
    s16 = 15 / args.bpm
    t0 = args.a if args.t0 is None else args.t0
    table = []
    for ts, te, hz, med, l0, l1, lp, tp in rows:
        m = 69 + 12 * np.log2(hz / 440)
        if not args.table:
            print(f'{ts:7.3f}-{te:7.3f}  16th {(ts - t0) / s16:6.2f}  {hz:7.1f} Hz {cents(m):9s} '
                  f'median {med:4.0f}  start {l0:4.0f}  end {l1:4.0f}  peak {lp:4.0f} dB')
        if lp <= args.min:
            continue
        st = max(0, round((ts - t0) / s16 * 4) / 4)
        ln = max(0.25, round((te - t0) / s16 * 4) / 4 - st)
        dur = ln * s16
        att = min(max(tp, 0.005), dur * 0.9)
        table.append([st, ln, round(float(m), 2), round(10 ** (lp / 20), 4), round(att, 3),
                      round(max(dur - att, 0.01), 3), round(min(10 ** ((l1 - lp) / 20), 1), 3)])
    if args.table:
        body = ',\n  '.join(', '.join('[' + ','.join(f'{v:g}' for v in r) + ']' for r in table[i : i + 4])
                            for i in range(0, len(table), 4))
        print(f'// {len(table)} tone lines, {args.a:g}-{args.b:g} s\nconst TONES = [\n  {body}\n]')


def cmd_distance(args):
    """Mean absolute dB difference between the two spectrograms (third
    octaves 250 Hz-8 kHz, 23 ms frames) after matching overall level, per bar
    and overall: one number to choose between remakes. Frames where the
    original is 40 dB under its peak are skipped. The offset is refined
    within 60 ms (the best one is printed)."""
    def spec(path, a):
        sr, x = load(path)
        y = x[int(a * sr) : int((a + args.dur) * sr)]
        hop = int(sr * 0.0234375)
        fr, _, z = stft(y, sr, nperseg=2048, noverlap=2048 - hop)
        pw = np.abs(z) ** 2
        edges = 250 * 2 ** (np.arange(16) / 3)
        return 10 * np.log10(np.array([pw[(fr >= lo) & (fr < hi)].sum(0) for lo, hi in zip(edges, edges[1:])]) + 1e-12)
    sa = spec(args.orig, args.a)
    keep_a = sa.max(0) > sa.max() - 40
    best = None
    for off in np.arange(args.offset - 0.06, args.offset + 0.0601, 0.005):
        sb = spec(args.repro, args.a + off)
        n = min(sa.shape[1], sb.shape[1])
        a_, b_ = sa[:, :n], sb[:, :n]
        b_ = b_ - np.median(b_ - a_)
        keep = keep_a[:n]
        d = np.abs(a_ - b_)[:, keep]
        if best is None or d.mean() < best[0]:
            best = (d.mean(), off, d, np.arange(n)[keep])
    _, off, d, frames = best
    bar = (frames * 0.0234375 // (240 / args.bpm)).astype(int)
    per = ' '.join(f'{d[:, bar == k].mean():.2f}' for k in range(int(args.dur // (240 / args.bpm))))
    print(f'best offset {off:.3f}')
    print(f'mean {d.mean():.2f} dB; per bar {per}')


def cmd_loop(args):
    """How long a passage takes to repeat: spectral autocorrelation between
    --min and --max seconds. Derive the tempo from this (a loop is a whole
    number of bars), not only from `tempo`, which can lock onto a cross-rhythm."""
    sr, x = load(args.file)
    seg = x[int(args.a * sr) : int(args.b * sr)]
    hop = 480
    _, _, z = stft(seg, sr, nperseg=2048, noverlap=2048 - hop)
    s = np.log1p(np.abs(z))
    s = s - s.mean(1, keepdims=True)
    fps = sr / hop
    out = []
    for lag_s in np.arange(args.min, args.max, 0.005):
        lag = int(lag_s * fps)
        if lag >= s.shape[1] - 10:
            break
        a, b = s[:, :-lag], s[:, lag:]
        out.append((np.sum(a * b) / np.sqrt(np.sum(a * a) * np.sum(b * b)), lag_s))
    out.sort(reverse=True)
    picked = []
    for c, lag_s in out:
        if all(abs(lag_s - q) > 0.05 for _, q in picked):
            picked.append((c, lag_s))
        if len(picked) == 4:
            break
    for c, lag_s in picked:
        bpms = ', '.join(f'{bars} bar{"s" if bars > 1 else ""} at {240 * bars / lag_s:.2f} bpm' for bars in (1, 2, 4))
        print(f'{lag_s:.3f}s  correlation {c:.2f}   = {bpms}')


def step_table(path, t0, bpm, n, div):
    """Per step: main note (harmonic sum of harmonics 1-4), its strongest
    partial above 2.5 kHz as a multiple of that note, that partial's level
    re the note (dB), and the step's level (dB)."""
    sr, x = load(path)
    st = 60 / bpm * 4 / div
    cand = np.arange(28, 96, 1.0)
    big = 1 << 16
    f = np.fft.rfftfreq(big, 1 / sr)
    rows = []
    for k in range(n):
        a = t0 + k * st + 0.015
        s = x[int(a * sr) : int((a + st - 0.03) * sr)]
        if len(s) < 64:
            break
        spec = np.abs(np.fft.rfft(s * np.hanning(len(s)), big))
        score = []
        for m in cand:
            f0 = 440 * 2 ** ((m - 69) / 12)
            score.append(sum(np.interp(f0 * h, f, spec) / h for h in (1, 2, 3, 4) if f0 * h < 2500))
        m = int(cand[int(np.argmax(score))])
        f0 = 440 * 2 ** ((m - 69) / 12)
        w = f > 2500
        hp = f[w][np.argmax(spec[w])]
        side = db(spec[w].max() / max(np.interp(f0, f, spec), 1e-12))
        rows.append((k, m, hp / f0, side, db(np.sqrt(np.mean(s**2)))))
    return rows


def cmd_steps(args):
    """One row per grid step (16ths by default): note, strongest high partial
    as a multiple of the note (FM: sidebands at (k-1) and (k+1) times the note
    mean fmh(k)), that partial's level re the note, and the step's level. With
    --compare TAKE --offset S, the take's row beside the original's and the
    level difference."""
    a = step_table(args.file, args.t0 or 0.0, args.bpm, args.n, args.div)
    b = step_table(args.compare, args.offset, args.bpm, args.n, args.div) if args.compare else None
    print('step  note  ×note  high dB  level' + ('   | take: note  ×note  high dB  level  Δlevel' if b else ''))
    for i, (k, m, r, side, lv) in enumerate(a):
        line = f'{k:4d}  {note_name(m):4s} {r:6.2f}  {side:6.0f}  {lv:6.1f}'
        if b and i < len(b):
            _, m2, r2, s2, l2 = b[i]
            same = '' if m2 == m else ' ≠'
            line += f'   | {note_name(m2):4s}{same:2s}{r2:6.2f}  {s2:6.0f}  {l2:6.1f}  {l2 - lv:+5.1f}'
        print(line)
    if b:
        diffs = [abs(bb[4] - aa[4]) for aa, bb in zip(a, b)]
        same = sum(aa[1] == bb[1] for aa, bb in zip(a, b))
        print(f'notes the same: {same}/{min(len(a), len(b))}; mean |Δlevel| {np.mean(diffs):.2f} dB')


DRUM_BANDS = (('kick 40-100', 40, 100), ('snare 1.5-4k', 1500, 4000), ('hats 7-12k', 7000, 12000), ('top 12-18k', 12000, 18000))


def cmd_drums(args):
    """Onsets per 32nd in drum bands, one row per bar: '#' a jump over 9 dB,
    '+' over 5 dB. A hit in every band at once is a snare or clap, not a
    chord; rolls often live in the top band only; a 'kick' row that follows
    the bassline is the 808, not a kick."""
    sr, x = load(args.file)
    st = 60 / args.bpm / 8
    t0 = args.t0 or 0.0
    h = int(sr * 0.005)
    for name, lo, hi in DRUM_BANDS:
        y = bandpass(sr, x, (lo, hi))
        e = db(np.array([np.sqrt(np.mean(y[i : i + h] ** 2)) for i in range(0, len(y) - h, h)]))
        print(name)
        for bar in range(args.first - 1, args.first - 1 + args.bars):
            row = ''
            for k in range(32):
                i = int((t0 + bar * 32 * st + k * st) / 0.005)
                jump = e[i : i + 4].max() - e[max(0, i - 5) : max(1, i - 1)].mean()
                row += '#' if jump > 9 else ('+' if jump > 5 else '.')
            print(f'  bar{bar + 1:3d} |' + ' '.join(row[j : j + 8] for j in range(0, 32, 8)) + '|')


def cmd_roots(args):
    """Bass note per part of a bar (--div 2: half bars), from long windows
    with harmonics 1-4: a 16th-note `roll` cannot resolve notes under ~60 Hz.
    Also prints the strongest peak, which is the truth when the harmonic sum
    picks a neighbour (an 808's 2nd and 3rd harmonics decide)."""
    sr, x = load(args.file)
    bar = 60 / args.bpm * 4
    t0 = args.t0 or 0.0
    big = 1 << 18
    f = np.fft.rfftfreq(big, 1 / sr)
    cand = np.arange(23, 60, 0.05)
    f0s = 440 * 2 ** ((cand - 69) / 12)
    for b in range(args.bars):
        cells = []
        for part in range(args.div):
            a = t0 + b * bar + part * bar / args.div + 0.05
            s = x[int(a * sr) : int((a + bar / args.div - 0.1) * sr)]
            spec = np.abs(np.fft.rfft(s * np.hanning(len(s)), big))
            score = [sum(np.interp(q * k, f, spec) / k**0.5 for k in (1, 2, 3, 4)) for q in f0s]
            m = cand[int(np.argmax(score))]
            w = (f > 25) & (f < 130)
            pk = f[w][np.argmax(spec[w])]
            cells.append(f'{note_name(m):4s}(peak {pk:5.1f} Hz)')
        print(f'bar{b + 1:3d}: ' + '  '.join(cells))


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest='cmd', required=True)

    def grid(sp):
        sp.add_argument('--bpm', type=float, default=120)
        sp.add_argument('--t0', type=float, default=None)

    s = sub.add_parser('fetch'); s.add_argument('url'); s.add_argument('dir')
    s = sub.add_parser('tempo'); s.add_argument('file'); s.add_argument('a', type=float); s.add_argument('b', type=float)
    s = sub.add_parser('spectro')
    s.add_argument('file'); s.add_argument('a', type=float); s.add_argument('dur', type=float); s.add_argument('out')
    s.add_argument('--side', action='store_true'); s.add_argument('--lin', action='store_true')
    s.add_argument('--fmin', type=float, default=20); s.add_argument('--fmax', type=float, default=20000)
    s = sub.add_parser('sidediff')
    s.add_argument('file'); s.add_argument('a', type=float); s.add_argument('b', type=float); s.add_argument('c', type=float)
    s = sub.add_parser('bars'); s.add_argument('file'); s.add_argument('n', type=int); grid(s)
    s.add_argument('--side', action='store_true')
    s.add_argument('--band', type=lambda v: [float(k) for k in v.split(',')], default=None)
    s = sub.add_parser('blocks'); s.add_argument('file'); s.add_argument('a', type=float); s.add_argument('b', type=float); grid(s)
    s = sub.add_parser('harmonics')
    s.add_argument('file'); s.add_argument('f0', type=float); s.add_argument('times', type=float, nargs='+')
    s.add_argument('--count', type=int, default=16)
    s = sub.add_parser('compare')
    s.add_argument('orig'); s.add_argument('repro'); s.add_argument('a', type=float); s.add_argument('b', type=float)
    s = sub.add_parser('align'); s.add_argument('orig'); s.add_argument('repro')
    s.add_argument('--bars', type=int, default=4); s.add_argument('--bpm', type=float, default=120)
    s = sub.add_parser('bands'); s.add_argument('orig'); s.add_argument('repro')
    s.add_argument('--bars', type=int, default=4); s.add_argument('--bpm', type=float, default=120)
    s.add_argument('--offset', type=float, default=None); s.add_argument('--band', action='append')
    s = sub.add_parser('roll'); s.add_argument('file'); s.add_argument('a', type=float); s.add_argument('b', type=float); grid(s)
    s.add_argument('--div', type=int, default=16, help='steps per bar')
    s.add_argument('--lo', type=int, default=36); s.add_argument('--hi', type=int, default=96)
    s.add_argument('--floor', type=float, default=18); s.add_argument('--max', type=int, default=6)
    s.add_argument('--side', action='store_true')
    s = sub.add_parser('peaks'); s.add_argument('file'); s.add_argument('a', type=float); s.add_argument('b', type=float)
    s.add_argument('--side', action='store_true')
    s.add_argument('--fmin', type=float, default=2000); s.add_argument('--fmax', type=float, default=20000)

    for name in ('track',):
        s = sub.add_parser(name); s.add_argument('file'); s.add_argument('a', type=float); s.add_argument('b', type=float); grid(s)
        s.add_argument('--lo', type=float, default=150); s.add_argument('--hi', type=float, default=1000)
    s = sub.add_parser('melody'); s.add_argument('orig'); s.add_argument('repro')
    s.add_argument('a', type=float); s.add_argument('b', type=float); s.add_argument('--offset', type=float, required=True)
    s.add_argument('--bpm', type=float, default=120); s.add_argument('--floor', type=float, default=12)
    s.add_argument('--lo', type=float, default=150); s.add_argument('--hi', type=float, default=1000)
    s = sub.add_parser('octaves'); s.add_argument('orig'); s.add_argument('repro')
    s.add_argument('t', type=float); s.add_argument('dur', type=float); s.add_argument('--offset', type=float, required=True)
    s = sub.add_parser('lines'); s.add_argument('file'); s.add_argument('a', type=float); s.add_argument('b', type=float); grid(s)
    s.add_argument('--lo', type=float, default=150); s.add_argument('--hi', type=float, default=6000)
    s.add_argument('--window', type=int, default=4096); s.add_argument('--min', type=float, default=-33)
    s.add_argument('--table', action='store_true')
    s = sub.add_parser('distance'); s.add_argument('orig'); s.add_argument('repro')
    s.add_argument('a', type=float); s.add_argument('dur', type=float)
    s.add_argument('--offset', type=float, required=True); s.add_argument('--bpm', type=float, default=120)
    s = sub.add_parser('entry'); s.add_argument('file')
    s.add_argument('--band', type=lambda v: [float(k) for k in v.split(',')], default=[25, 60])
    s.add_argument('--quiet', type=float, default=3); s.add_argument('--level', type=float, default=-30)

    s = sub.add_parser('loop'); s.add_argument('file'); s.add_argument('a', type=float); s.add_argument('b', type=float)
    s.add_argument('--min', type=float, default=1.0); s.add_argument('--max', type=float, default=8.0)
    s = sub.add_parser('steps'); s.add_argument('file'); grid(s)
    s.add_argument('--n', type=int, default=32); s.add_argument('--div', type=int, default=16, help='steps per bar')
    s.add_argument('--compare'); s.add_argument('--offset', type=float, default=0.0)
    s = sub.add_parser('drums'); s.add_argument('file'); grid(s)
    s.add_argument('--bars', type=int, default=4); s.add_argument('--first', type=int, default=1)
    s = sub.add_parser('roots'); s.add_argument('file'); grid(s)
    s.add_argument('--bars', type=int, default=4); s.add_argument('--div', type=int, default=2)

    args = p.parse_args()
    if getattr(args, 't0', 0) is None and args.cmd == 'bars':
        args.t0 = 0.0
    globals()[f'cmd_{args.cmd}'](args)


if __name__ == '__main__':
    main()
