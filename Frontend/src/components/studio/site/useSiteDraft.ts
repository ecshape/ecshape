/**
 * Draft / publish state of Studio -> My site, for the three languages at once.
 *  - published: what visitors see (defaults merged with the overrides saved on the server)
 *  - drafts: what the trainer is editing. Kept in this browser (localStorage) as overrides, so nothing is lost
 *    when leaving the editor; "Publish" sends the overrides of every changed language to the server.
 *  - photos and the section layout are shared by every language (see SHARED_PATHS).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { studioApi } from '@/lib/studioApi';
import { diffContent, getIn, parsePath, setIn } from '@/lib/siteContentOps';
import { DEFAULT_CONTENT, SITE_LANGS, mergeContent, type SiteContent, type SiteLang } from '@/site/content';
import { isSharedPath } from '@/site/sections';

export type Drafts = Record<SiteLang, SiteContent>;
const DRAFT_KEY = (lang: SiteLang) => `ec-site-draft:${lang}`;
const HISTORY_MAX = 120;

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const defaults = (): Drafts => ({ ...DEFAULT_CONTENT });

function readStoredDraft(lang: SiteLang): SiteContent | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY(lang));
    if (!raw) return null;
    return mergeContent(DEFAULT_CONTENT[lang], JSON.parse(raw));
  } catch {
    return null;
  }
}

function writeStoredDraft(lang: SiteLang, draft: SiteContent | null) {
  try {
    if (!draft) localStorage.removeItem(DRAFT_KEY(lang));
    else localStorage.setItem(DRAFT_KEY(lang), JSON.stringify(diffContent(DEFAULT_CONTENT[lang], draft) || {}));
  } catch {
    // Storage full or blocked: drop the stored copy so an older draft is never restored over newer edits.
    try {
      localStorage.removeItem(DRAFT_KEY(lang));
    } catch {
      /* blocked: nothing stored anyway */
    }
  }
}

/** Unpublished drafts kept in this browser (for the badge on the My site home page). */
export function hasStoredDrafts() {
  try {
    return SITE_LANGS.some((l) => !!localStorage.getItem(DRAFT_KEY(l)));
  } catch {
    return false;
  }
}

/** Throws when the server can't be read: treating the defaults as "published" would let a publish wipe the site. */
async function fetchPublished(lang: SiteLang): Promise<SiteContent> {
  const { content } = await studioApi.siteContent(lang);
  return mergeContent(DEFAULT_CONTENT[lang], content || {});
}

export function useSiteDraft() {
  const [published, setPublished] = useState<Drafts>(defaults);
  const [drafts, setDrafts] = useState<Drafts>(defaults);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [restored, setRestored] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const past = useRef<Drafts[]>([]);
  const future = useRef<Drafts[]>([]);
  const lastEdit = useRef<{ key: string; at: number }>({ key: '', at: 0 });
  const [, bump] = useState(0);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;
  const publishedRef = useRef(published);
  publishedRef.current = published;

  const load = useCallback(async () => {
    let pubs: SiteContent[];
    try {
      pubs = await Promise.all(SITE_LANGS.map(fetchPublished));
    } catch {
      setLoadError(true);
      setLoaded(false);
      return;
    }
    setLoadError(false);
    const pub = Object.fromEntries(SITE_LANGS.map((l, i) => [l, pubs[i]])) as Drafts;
    let anyRestored = false;
    const next = Object.fromEntries(
      SITE_LANGS.map((l) => {
        const stored = readStoredDraft(l);
        if (stored && !same(stored, pub[l])) {
          anyRestored = true;
          return [l, stored];
        }
        if (stored) writeStoredDraft(l, null);
        return [l, pub[l]];
      }),
    ) as Drafts;
    setPublished(pub);
    setDrafts(next);
    setRestored(anyRestored);
    past.current = [];
    future.current = [];
    setLoaded(true);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dirtyLangs = useMemo(() => SITE_LANGS.filter((l) => !same(drafts[l], published[l])), [drafts, published]);

  /** Apply a change; quick successive edits of the same field count as one undo step. */
  const commit = useCallback((next: Drafts, coalesceKey?: string) => {
    const now = Date.now();
    const coalesce = !!coalesceKey && lastEdit.current.key === coalesceKey && now - lastEdit.current.at < 900;
    if (!coalesce) {
      past.current = [...past.current.slice(-(HISTORY_MAX - 1)), draftsRef.current];
      future.current = [];
    }
    lastEdit.current = { key: coalesceKey || '', at: now };
    draftsRef.current = next;
    setDrafts(next);
    bump((n) => n + 1);
  }, []);

  /** Persist drafts locally (debounced) and flash "Draft saved". */
  useEffect(() => {
    if (!loaded) return;
    const id = window.setTimeout(() => {
      SITE_LANGS.forEach((l) => writeStoredDraft(l, same(drafts[l], published[l]) ? null : drafts[l]));
      if (SITE_LANGS.some((l) => !same(drafts[l], published[l]))) setSavedAt(Date.now());
    }, 350);
    return () => window.clearTimeout(id);
  }, [drafts, published, loaded]);

  /** Set one value. Photos and layout are copied to every language. */
  const setValue = useCallback(
    (lang: SiteLang, path: string, value: unknown, opts: { coalesce?: boolean } = {}) => {
      const cur = draftsRef.current;
      const parts = parsePath(path);
      const next = { ...cur };
      const langs = isSharedPath(path) ? SITE_LANGS : [lang];
      langs.forEach((l) => {
        // A shared list photo is copied only where the same card exists.
        if (l !== lang && parts.length > 1 && getIn(cur[l], parts.slice(0, -1)) === undefined) return;
        next[l] = setIn(cur[l], parts, value);
      });
      commit(next, opts.coalesce ? `${lang}:${path}` : undefined);
    },
    [commit],
  );

  const update = useCallback(
    (lang: SiteLang, fn: (c: SiteContent) => SiteContent) => {
      const cur = draftsRef.current;
      commit({ ...cur, [lang]: fn(cur[lang]) });
    },
    [commit],
  );

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current = [...future.current, draftsRef.current];
    lastEdit.current = { key: '', at: 0 };
    setDrafts(prev);
    bump((n) => n + 1);
  }, []);

  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current = [...past.current, draftsRef.current];
    lastEdit.current = { key: '', at: 0 };
    setDrafts(next);
    bump((n) => n + 1);
  }, []);

  const discard = useCallback(() => {
    commit({ ...publishedRef.current });
    SITE_LANGS.forEach((l) => writeStoredDraft(l, null));
    setRestored(false);
  }, [commit]);

  /** Save the overrides of every changed language. Returns the languages published. */
  const publish = useCallback(async () => {
    if (!loaded) throw new Error('site not loaded');
    const cur = draftsRef.current;
    const langs = SITE_LANGS.filter((l) => !same(cur[l], publishedRef.current[l]));
    for (const l of langs) {
      const overrides = (diffContent(DEFAULT_CONTENT[l], cur[l]) || {}) as Record<string, unknown>;
      await studioApi.saveSiteContent(l, overrides);
    }
    const nextPub = { ...publishedRef.current };
    langs.forEach((l) => {
      nextPub[l] = cur[l];
      writeStoredDraft(l, null);
    });
    setPublished(nextPub);
    setRestored(false);
    return langs;
  }, [loaded]);

  /** Something else (Agent EC) changed the published site: take it in, keeping the trainer's own edits. */
  const refreshFromServer = useCallback(async () => {
    let pubs: SiteContent[];
    try {
      pubs = await Promise.all(SITE_LANGS.map(fetchPublished));
    } catch {
      return false;
    }
    const old = publishedRef.current;
    const pub = Object.fromEntries(SITE_LANGS.map((l, i) => [l, pubs[i]])) as Drafts;
    const cur = draftsRef.current;
    const next = { ...cur };
    let changed = false;
    SITE_LANGS.forEach((l) => {
      const d = diffContent(old[l], pub[l]);
      if (d !== undefined) {
        next[l] = mergeContent(cur[l], d);
        changed = true;
      }
    });
    setPublished(pub);
    if (changed) commit(next);
    return changed;
  }, [commit]);

  return {
    loaded,
    loadError,
    published,
    drafts,
    dirtyLangs,
    dirty: dirtyLangs.length > 0,
    restored,
    savedAt,
    canUndo: past.current.length > 0,
    canRedo: future.current.length > 0,
    setValue,
    update,
    undo,
    redo,
    discard,
    publish,
    refreshFromServer,
    reload: load,
  };
}

export type SiteDraftApi = ReturnType<typeof useSiteDraft>;
