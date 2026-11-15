import { useRef, useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { Copy, Download, FileCode, Share, Upload } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { capturePatch, applyPatch } from '@/lib/patch-state';
import {
  downloadState,
  downloadText,
  getShareUrl,
  stateFromJson,
} from '@/lib/project-state';
import type { ProjectState } from '@/lib/project-state';
import { PatchGallery } from './patch-gallery';
import { ControlButton } from './control-button';
import { useAppStore } from '@/store/app-store';
import { loadCode, patchCode } from '@/store/code-sync';
import { codeMeta } from '@/lib/community-patches';
import type { CommunityPatch } from '@/lib/community-patches';

const fileName = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'patch';

export function PresetPopover() {
  const name = useAppStore((state) => state.name);
  const [link, setLink] = useState('');
  const [status, setStatus] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const { fitView } = useReactFlow();
  const loadPatch = (state: ProjectState | null) => {
    if (!state || !applyPatch(state)) {
      setStatus('Could not load this patch.');
      return;
    }
    setLink(getShareUrl(capturePatch()));
    setStatus('Patch loaded');
    requestAnimationFrame(() => {
      void fitView({ padding: 0.3, maxZoom: 1 });
    });
  };
  const loadCommunity = (patch: CommunityPatch) => {
    if (patch.state) return loadPatch(patch.state);
    loadCode(patch.code, patch);
    setLink(getShareUrl(capturePatch()));
    setStatus('Patch loaded');
  };
  const copy = async () => {
    const url = getShareUrl(capturePatch());
    setLink(url);
    try {
      await navigator.clipboard.writeText(url);
      setStatus('Link copied');
    } catch {
      setStatus('Select and copy the link below.');
    }
  };
  return (
    <Popover
      onOpenChange={(open) => {
        if (open) {
          setLink(getShareUrl(capturePatch()));
          setStatus('');
        }
      }}
    >
      <PopoverTrigger asChild>
        <ControlButton title="Export, share and open patches">
          <Share className="size-4" />
        </ControlButton>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        className="nowheel max-h-[calc(100dvh-100px)] w-[min(420px,calc(100vw-24px))] overflow-y-auto rounded-lg p-4"
      >
        <h3 className="mb-3 text-sm font-medium">Your patch</h3>
        <input
          aria-label="Patch name"
          placeholder="Patch name"
          maxLength={80}
          value={name}
          onChange={(event) =>
            useAppStore.setState({ name: event.target.value })
          }
          className="w-full rounded-md border bg-muted/30 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="my-3 flex gap-1">
          <Button variant="secondary" size="sm" onClick={copy}>
            <Copy className="size-3.5" />
            Copy link
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() =>
              downloadState(capturePatch(), `${fileName(name)}.json`)
            }
          >
            <Download className="size-3.5" />
            Export
          </Button>
          <Button
            variant="ghost"
            size="sm"
            title="The code with every node's position: a complete save"
            onClick={() =>
              downloadText(
                patchCode(),
                `${fileName(name)}.strudel`,
                'text/javascript',
              )
            }
          >
            <FileCode className="size-3.5" />
            Save .strudel
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => input.current?.click()}
          >
            <Upload className="size-3.5" />
            Open
          </Button>
          <input
            ref={input}
            type="file"
            accept=".json,.strudel,.js"
            className="hidden"
            onChange={async (event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (!file) return;
              try {
                const text = await file.text();
                if (!/\.json$/i.test(file.name)) {
                  // A code file: positions come from its // @layout comments.
                  loadCode(text, {
                    name: file.name.replace(/\.(strudel|js)$/i, ''),
                    author: '',
                    description: '',
                    ...codeMeta(text),
                  });
                  setLink(getShareUrl(capturePatch()));
                  setStatus('Patch loaded');
                  return;
                }
                const state = stateFromJson(text);
                loadPatch(
                  state && {
                    ...state,
                    name: state.name ?? file.name.replace(/\.json$/i, ''),
                  },
                );
              } catch {
                setStatus('Could not read this patch file.');
              }
            }}
          />
        </div>
        <input
          aria-label="Shareable patch link"
          value={link}
          readOnly
          onFocus={(event) => event.target.select()}
          className="w-full rounded-md border bg-background/50 px-2 py-2 font-mono text-[10px] text-muted-foreground"
        />
        <p
          role="status"
          className="my-2 min-h-4 text-[11px] text-muted-foreground"
        >
          {status || 'Export your patch or copy a link to share.'}
        </p>
        <PatchGallery onLoad={loadCommunity} />
      </PopoverContent>
    </Popover>
  );
}
