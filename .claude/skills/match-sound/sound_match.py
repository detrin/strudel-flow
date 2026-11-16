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
    best = (-9, 0)
    for lag in range(0, n):
        if lag + n > len(eb[0]):
            break
        c = sum(np.dot(a, b[lag : lag + n]) for a, b in zip(ea, eb)) / n / len(ea)
        best = max(best, (c, lag))
    return best[1] * 0.005, best[0]


def cmd_align(args):
    off, corr = find_offset(args.orig, args.repro, args.bars, args.bpm)
    print(f'{off:.3f}')
    print(f'correlation {corr:.2f} (record at least two loops)', file=sys.stderr)


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

    args = p.parse_args()
    if getattr(args, 't0', 0) is None and args.cmd == 'bars':
        args.t0 = 0.0
    globals()[f'cmd_{args.cmd}'](args)


if __name__ == '__main__':
    main()
