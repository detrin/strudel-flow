import { useEffect } from 'react';
import { loadFromUrl, stateFromJson } from '@/lib/project-state';
import { applyPatch, capturePatch } from '@/lib/patch-state';
import { upgradePatch } from '@/store/code-sync';
import { useAppStore } from '@/store/app-store';

/** Where the open patch is kept between visits (this browser only). */
const STORAGE_KEY = 'strudelton:patch';

const hasPatchLink = (url: URL) =>
  url.searchParams.has('state') || url.hash.startsWith('#patch=');

/**
 * Keeps the open patch across reloads in local storage, so the address bar
 * stays clean. A share link (`#patch=…`, made in the Patches menu) opens
 * its patch, then leaves the address as it was without the patch.
 */
export function useUrlState() {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let loading = false;
    let lastPatch = '';
    const save = () => {
      clearTimeout(timer);
      timer = undefined;
      const serialized = JSON.stringify(capturePatch());
      if (serialized === lastPatch) return;
      lastPatch = serialized;
      try {
        localStorage.setItem(STORAGE_KEY, serialized);
      } catch {
        // Storage can be full or unavailable; the patch just isn't kept.
      }
    };
    const open = (state: ReturnType<typeof loadFromUrl>, link: boolean) => {
      if (state && applyPatch(state)) upgradePatch();
      else if (link)
        useAppStore
          .getState()
          .setError(
            'This patch link is invalid or uses an unsupported module.',
          );
    };
    const load = () => {
      clearTimeout(timer);
      timer = undefined;
      loading = true;
      const url = new URL(window.location.href);
      if (hasPatchLink(url)) {
        open(loadFromUrl(), true);
        // The patch is open; the address goes back to plain.
        url.searchParams.delete('state');
        url.hash = '';
        window.history.replaceState(window.history.state, '', url);
      } else if (!lastPatch) {
        let saved: string | null = null;
        try {
          saved = localStorage.getItem(STORAGE_KEY);
        } catch {
          // Nothing kept: start from the default patch.
        }
        if (saved) open(stateFromJson(saved), false);
      }
      lastPatch = JSON.stringify(capturePatch());
      loading = false;
    };
    load();
    const unsubscribe = useAppStore.subscribe((state, previous) => {
      if (
        loading ||
        // The song, not the canvas: selecting a node saves nothing.
        (state.song === previous.song &&
          state.name === previous.name &&
          state.author === previous.author &&
          state.description === previous.description)
      )
        return;
      clearTimeout(timer);
      timer = setTimeout(save, 200);
    });
    const flush = () => {
      if (timer !== undefined) save();
    };
    const onVisibilityChange = () => {
      if (document.hidden) flush();
    };
    // A share link pasted into the address bar opens too.
    const onHashChange = () => {
      if (hasPatchLink(new URL(window.location.href))) load();
    };
    window.addEventListener('hashchange', onHashChange);
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      flush();
      unsubscribe();
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);
}
