import { useRef, useState } from 'react';
import { Download, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  lineLabels,
  presetFromLine,
  suggestTags,
  withoutArrangement,
  type Preset,
} from '@/lib/library/presets';
import { hasTags, matches, tagCounts } from '@/lib/library/filter';
import { addLine, currentCode } from '@/lib/library/insert';
import { tagsOfSound } from '@/lib/library/sounds';
import { downloadText } from '@/lib/project-state';
import { useLibrary } from '@/store/library-store';
import { TagFilter, TagInput, chip } from './tag-input';

/** Tags people commonly sort tracks by. */
const COMMON = [
  'bass',
  'drums',
  'vocals',
  'lead',
  'chords',
  'pad',
  'arp',
  'fx',
];
const field =
  'w-full rounded-md border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring';

/** Saving a line of the song as a preset: which line, its name and tags. */
function SaveForm({ onDone }: { onDone: (text: string) => void }) {
  const saving = useLibrary((state) => state.saving);
  const savePreset = useLibrary((state) => state.savePreset);
  const code = currentCode();
  const labels = lineLabels(code);
  const [label, setLabel] = useState(
    saving && labels.includes(saving) ? saving : labels[0],
  );
  const [name, setName] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [keepArrangement, setKeepArrangement] = useState(false);
  const found = label ? presetFromLine(code, label) : null;
  const loose = found && withoutArrangement(found.body);
  const arranged = !!found && loose !== found.body;
  const line =
    found && arranged && !keepArrangement ? { ...found, body: loose! } : found;
  const suggestions = line
    ? [...new Set([...suggestTags(label, line.body, tagsOfSound), ...COMMON])]
    : COMMON;
  if (!labels.length)
    return (
      <p className="text-xs text-muted-foreground">
        The song has no lines to save yet.
      </p>
    );
  return (
    <form
      aria-label="Save a line as a preset"
      className="space-y-2 rounded-md border p-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!line) return;
        const preset = savePreset({ ...line, name: name || label, tags });
        onDone(`Saved preset “${preset.name}”`);
      }}
    >
      <div className="flex gap-2">
        <select
          aria-label="Line to save"
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          className="h-9 rounded-md border bg-muted/30 px-2 font-mono text-xs"
        >
          {labels.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <input
          aria-label="Preset name"
          placeholder={`Name (${label})`}
          maxLength={60}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={field}
        />
      </div>
      {line && (
        <pre className="max-h-24 overflow-auto rounded bg-muted/40 p-2 font-mono text-[10px] text-muted-foreground">
          {[...line.needs, line.body].join('\n')}
        </pre>
      )}
      {arranged && (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={keepArrangement}
            onChange={(event) => setKeepArrangement(event.target.checked)}
          />
          Keep its arrangement (which bars it plays in this song)
        </label>
      )}
      <TagInput
        label="Preset tags"
        tags={tags}
        onChange={setTags}
        suggestions={suggestions}
      />
      <div className="flex justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onDone('')}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm">
          Save preset
        </Button>
      </div>
    </form>
  );
}

function PresetRow({
  preset,
  onStatus,
}: {
  preset: Preset;
  onStatus: (text: string) => void;
}) {
  const updatePreset = useLibrary((state) => state.updatePreset);
  const deletePreset = useLibrary((state) => state.deletePreset);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  return (
    <li className="py-2" data-preset={preset.name}>
      <div className="flex items-start gap-1">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{preset.name}</p>
          <p className="truncate font-mono text-[10px] text-muted-foreground">
            {preset.body.split('\n')[0]}
          </p>
          {preset.tags.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {preset.tags.map((tag) => (
                <span
                  key={tag}
                  className={`${chip} h-5 border-border text-[10px]`}
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant="secondary"
          aria-label={`Insert ${preset.name}`}
          onClick={() => onStatus(`Added line ${addLine(preset)}`)}
        >
          <Plus className="size-3.5" />
          Insert
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="size-8"
          aria-label={`Edit ${preset.name}`}
          aria-expanded={editing}
          onClick={() => setEditing(!editing)}
        >
          <Pencil className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className={`size-8 ${confirming ? 'text-destructive' : ''}`}
          aria-label={
            confirming
              ? `Really delete ${preset.name}`
              : `Delete ${preset.name}`
          }
          title={confirming ? 'Click again to delete' : 'Delete'}
          onBlur={() => setConfirming(false)}
          onClick={() => {
            if (!confirming) return setConfirming(true);
            deletePreset(preset.id);
            onStatus(`Deleted “${preset.name}”`);
          }}
        >
          <Trash2 className="size-3.5" />
        </Button>
      </div>
      {editing && (
        <div className="mt-2 space-y-2 rounded-md border bg-muted/30 p-2">
          <input
            aria-label="Preset name"
            value={preset.name}
            maxLength={60}
            onChange={(event) =>
              updatePreset(preset.id, { name: event.target.value })
            }
            className={field}
          />
          <TagInput
            label="Preset tags"
            tags={preset.tags}
            onChange={(tags) => updatePreset(preset.id, { tags })}
            suggestions={COMMON}
          />
        </div>
      )}
    </li>
  );
}

/** Saved tracks: save lines of the song, find them by name or tag, insert. */
export function PresetsTab({ onStatus }: { onStatus: (text: string) => void }) {
  const presets = useLibrary((state) => state.presets);
  const saving = useLibrary((state) => state.saving);
  const importPresets = useLibrary((state) => state.importPresets);
  const storage = useLibrary((state) => state.storage);
  const storageError = useLibrary((state) => state.storageError);
  const [formOpen, setFormOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const file = useRef<HTMLInputElement>(null);
  const showForm = formOpen || saving !== undefined;
  const found = presets.filter(
    (p) => matches(query, p.name, p.tags) && hasTags(p.tags, selected),
  );
  return (
    <div className="space-y-2">
      {showForm ? (
        <SaveForm
          key={saving}
          onDone={(text) => {
            setFormOpen(false);
            useLibrary.setState({ saving: undefined });
            if (text) onStatus(text);
          }}
        />
      ) : (
        <Button size="sm" className="w-full" onClick={() => setFormOpen(true)}>
          <Plus className="size-3.5" />
          Save a line as a preset
        </Button>
      )}
      {presets.length > 0 && (
        <>
          <input
            type="search"
            aria-label="Search presets"
            placeholder="Search presets"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className={field}
          />
          <TagFilter
            tags={tagCounts(found)}
            selected={selected}
            onChange={setSelected}
          />
        </>
      )}
      {presets.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No presets yet. Save a line (a bass line, a beat, a vocal chop) to
          reuse it in other songs, or use “Save as preset” in a node’s menu.
        </p>
      ) : (
        <ul className="divide-y divide-border/60" aria-label="Presets">
          {found.map((preset) => (
            <PresetRow key={preset.id} preset={preset} onStatus={onStatus} />
          ))}
        </ul>
      )}
      <div className="flex gap-1 border-t pt-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={!presets.length}
          onClick={() =>
            downloadText(
              JSON.stringify({ presets }, null, 2),
              'strudelton-presets.json',
              'application/json',
            )
          }
        >
          <Download className="size-3.5" />
          Export presets
        </Button>
        <Button variant="ghost" size="sm" onClick={() => file.current?.click()}>
          <Upload className="size-3.5" />
          Import
        </Button>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          aria-label="Import presets file"
          className="hidden"
          onChange={async (event) => {
            const chosen = event.target.files?.[0];
            event.target.value = '';
            if (!chosen) return;
            try {
              const data = JSON.parse(await chosen.text()) as {
                presets?: Preset[];
              };
              const added = importPresets(data.presets ?? []);
              onStatus(`Imported ${added} preset${added === 1 ? '' : 's'}`);
            } catch {
              onStatus('That file has no presets.');
            }
          }}
        />
      </div>
      <p
        className="text-[10px] text-muted-foreground"
        data-storage={storage.kind}
      >
        {storage.kind === 'folder'
          ? `Saved in ${storage.folder}/presets, a file per preset.`
          : 'Saved in this browser only. Export them to keep a copy.'}
      </p>
      {storageError && (
        <p role="alert" className="text-xs text-destructive">
          {storageError}
        </p>
      )}
    </div>
  );
}
