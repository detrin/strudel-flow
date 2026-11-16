import { useEffect, useState } from 'react';
import { Mic, Pencil, Play, Plus, Square, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KEY_OPTIONS, SCALE_TYPE_OPTIONS } from '@/data/sounds';
import { useAppStore } from '@/store/app-store';
import { addLine } from '@/lib/library/insert';
import { startMic, stopMic } from '@/lib/takes/mic';
import { trimSilence, tuneTake, type TuneOptions } from '@/lib/takes/tune';
import {
  decodeAudio,
  deleteTake,
  loadRaw,
  playSamples,
  saveTake,
  stopSamples,
  takeNameOf,
  useTakes,
  type TakeDetails,
} from '@/lib/takes/takes';

const field =
  'w-full rounded-md border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring';
const select = 'h-9 rounded-md border bg-muted/30 px-2 text-xs';
const TUNE_KEY = 'strudelton:take-tune';

/** The key and scale used last (most takes of a song share them). */
function lastTune(): TuneOptions {
  try {
    const saved = JSON.parse(
      localStorage.getItem(TUNE_KEY) ?? 'null',
    ) as TuneOptions | null;
    if (saved && typeof saved.key === 'string') return saved;
  } catch {
    // Unreadable storage: the defaults.
  }
  return { key: 'C', scale: 'major', amount: 1 };
}

type Draft = {
  raw: Float32Array;
  rate: number;
  name: string;
  /** Set when tuning a kept take again: its name stays. */
  retuning?: string;
  tune: TuneOptions;
  /** The last tuned version and the settings it was tuned with. */
  tuned?: { samples: Float32Array; settings: string };
};

const settingsOf = (tune: TuneOptions) =>
  `${tune.key} ${tune.scale} ${tune.amount}`;
const describeTake = (take: TakeDetails) =>
  `${take.key} ${take.scale.replace(':', ' ')} · ${Math.round(take.amount * 100)} % · ${take.seconds} s`;

/** Tuning the draft: once per setting, kept for listening and saving. */
function tunedOf(draft: Draft) {
  const settings = settingsOf(draft.tune);
  if (draft.tuned?.settings === settings) return draft.tuned.samples;
  const samples = tuneTake(draft.raw, draft.rate, draft.tune);
  draft.tuned = { samples, settings };
  return samples;
}

/** After recording (or Retune): name, key, scale, Tune, listen, save. */
function DraftForm({
  draft,
  onChange,
  onDone,
}: {
  draft: Draft;
  onChange: (draft: Draft) => void;
  onDone: (status: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const tune = (change: Partial<TuneOptions>) =>
    onChange({ ...draft, tune: { ...draft.tune, ...change } });
  const name = draft.retuning ?? takeNameOf(draft.name);
  const taken =
    !draft.retuning &&
    useTakes.getState().takes.some((take) => take.name === name);
  return (
    <form
      aria-label="New take"
      className="space-y-2 rounded-md border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!name) return setError('Give the take a name.');
        setBusy(true);
        setError('');
        localStorage.setItem(TUNE_KEY, JSON.stringify(draft.tune));
        saveTake({
          name,
          raw: draft.raw,
          rate: draft.rate,
          tune: draft.tune,
          tuned: tunedOf(draft),
        })
          .then((take) =>
            onDone(`Saved take “${take.name}”: s("${take.name}")`),
          )
          .catch((reason: unknown) => setError(String(reason)))
          .finally(() => setBusy(false));
      }}
    >
      <div className="flex items-center gap-2">
        {draft.retuning ? (
          <span className="font-mono text-sm">{draft.retuning}</span>
        ) : (
          <input
            aria-label="Take name"
            placeholder="Name, e.g. vox_today"
            maxLength={40}
            value={draft.name}
            onChange={(event) =>
              onChange({ ...draft, name: event.target.value })
            }
            className={field}
          />
        )}
        <span className="shrink-0 text-xs text-muted-foreground">
          {(draft.raw.length / draft.rate).toFixed(1)} s
        </span>
      </div>
      {name && !draft.retuning && (
        <p className="text-xs text-muted-foreground">
          Plays as <code className="font-mono">s("{name}")</code>
          {taken && ', replacing the take with that name'}
        </p>
      )}
      <div className="flex items-center gap-2">
        <select
          aria-label="Key"
          value={draft.tune.key}
          onChange={(event) => tune({ key: event.target.value })}
          className={select}
        >
          {KEY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Scale"
          value={draft.tune.scale}
          onChange={(event) => tune({ scale: event.target.value })}
          className={select}
        >
          {SCALE_TYPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <span className="w-10 shrink-0">Tune</span>
        <input
          type="range"
          aria-label="Tune"
          min={0}
          max={100}
          step={5}
          value={Math.round(draft.tune.amount * 100)}
          onChange={(event) =>
            tune({ amount: Number(event.target.value) / 100 })
          }
          className="flex-1"
        />
        <span className="w-10 text-right tabular-nums">
          {Math.round(draft.tune.amount * 100)} %
        </span>
      </label>
      <p className="text-[11px] text-muted-foreground">
        0 % is as recorded; 100 % snaps every note to the scale. Sounds without
        a pitch stay as they are.
      </p>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            stopSamples();
            onDone('');
          }}
        >
          Discard
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => playSamples(draft.raw, draft.rate)}
        >
          <Play /> Raw
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => playSamples(tunedOf(draft), draft.rate)}
        >
          <Play /> Tuned
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Saving…' : 'Save take'}
        </Button>
      </div>
    </form>
  );
}

/** Takes: record from the mic, tune, keep, use as s("name"). */
export function TakesTab({ onStatus }: { onStatus: (text: string) => void }) {
  const takes = useTakes((state) => state.takes);
  const available = useTakes((state) => state.available);
  const [since, setSince] = useState<number | null>(null);
  const [startedSong, setStartedSong] = useState(false);
  const [withSong, setWithSong] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  /** The take whose delete button asks to be pressed again. */
  const [deleting, setDeleting] = useState<string | null>(null);
  const [, tick] = useState(0);
  useEffect(() => {
    if (since === null) return;
    const timer = setInterval(() => tick((n) => n + 1), 200);
    return () => clearInterval(timer);
  }, [since]);
  useEffect(() => () => void stopMic(), []);

  if (available === false)
    return (
      <p className="text-xs text-muted-foreground">
        Takes are kept in the Library folder, which needs the dev server (pnpm
        stable or pnpm dev).
      </p>
    );

  const record = async () => {
    onStatus('');
    try {
      await startMic();
    } catch (error) {
      onStatus(
        `Could not record: ${error instanceof Error ? error.message : String(error)}`,
      );
      return;
    }
    const playing = useAppStore.getState().isPlaying;
    if (withSong && !playing) useAppStore.setState({ isPlaying: true });
    setStartedSong(withSong && !playing);
    setSince(Date.now());
  };
  const stop = () => {
    const take = stopMic();
    setSince(null);
    if (startedSong) useAppStore.setState({ isPlaying: false });
    const raw = take && trimSilence(take.samples, take.rate);
    if (!take || !raw || raw.length < take.rate * 0.05)
      return onStatus('Nothing was recorded (is the mic on?).');
    setDraft({
      raw,
      rate: take.rate,
      name: `take_${takes.length + 1}`,
      tune: lastTune(),
    });
  };
  const retune = (take: TakeDetails) =>
    loadRaw(take)
      .then(({ samples, rate }) =>
        setDraft({
          raw: samples,
          rate,
          name: take.name,
          retuning: take.name,
          tune: { key: take.key, scale: take.scale, amount: take.amount },
        }),
      )
      .catch((error: unknown) => onStatus(String(error)));
  const play = (take: TakeDetails) =>
    fetch(`/__library/takes/${take.name}.wav?v=${take.savedAt}`)
      .then((response) => response.arrayBuffer())
      .then(decodeAudio)
      .then(({ samples, rate }) => playSamples(samples, rate))
      .catch((error: unknown) => onStatus(String(error)));

  return (
    <div className="space-y-3">
      {draft ? (
        <DraftForm
          draft={draft}
          onChange={setDraft}
          onDone={(status) => {
            setDraft(null);
            onStatus(status);
          }}
        />
      ) : (
        <div className="flex items-center gap-3">
          {since === null ? (
            <Button size="sm" onClick={() => void record()}>
              <Mic /> Record
            </Button>
          ) : (
            <Button size="sm" variant="destructive" onClick={stop}>
              <Square /> Stop {((Date.now() - since) / 1000).toFixed(1)} s
            </Button>
          )}
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={withSong}
              disabled={since !== null}
              onChange={(event) => setWithSong(event.target.checked)}
            />
            Play the song while recording
          </label>
        </div>
      )}
      {takes.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Record a voice, a click, anything: tune it and use it as{' '}
          <code className="font-mono">s("name")</code>.
        </p>
      ) : (
        <ul aria-label="Takes" className="divide-y rounded-md border">
          {takes.map((take) => (
            <li key={take.name} className="flex items-center gap-2 px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-sm">{take.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {describeTake(take)}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                title={`Play ${take.name}`}
                onClick={() => void play(take)}
              >
                <Play />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title={`Tune ${take.name} again`}
                onClick={() => void retune(take)}
              >
                <Pencil />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                title={`Add ${take.name} to the song`}
                onClick={() => {
                  const label = addLine({
                    body: `s("${take.name}")`,
                    label: take.name,
                  });
                  onStatus(`Added line “${label}”`);
                }}
              >
                <Plus />
              </Button>
              {deleting === take.name ? (
                <Button
                  variant="destructive"
                  size="sm"
                  aria-label={`Really delete ${take.name}`}
                  onClick={() => {
                    setDeleting(null);
                    deleteTake(take.name)
                      .then(() => onStatus(`Deleted take “${take.name}”`))
                      .catch((error: unknown) => onStatus(String(error)));
                  }}
                >
                  Delete
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  title={`Delete ${take.name}`}
                  onClick={() => setDeleting(take.name)}
                >
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
