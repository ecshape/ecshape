/**
 * Optimistic loading — the rule everywhere in ECshape: the screen never waits for the server to show
 * what it already knows or what the user just did.
 *
 *  1. Reads: every React Query result is kept in this browser (per signed-in account) and painted at once on the
 *     next visit, then quietly refreshed (stale-while-revalidate). Changing a filter keeps the previous data on
 *     screen instead of a spinner (keepPreviousData).
 *  2. Writes: the change is applied to the screen first, sent in the background, and rolled back with a message
 *     only if the server refuses it — `optimisticList` for useState lists, `optimisticQuery` for React Query data.
 */
import { keepPreviousData, QueryClient, dehydrate, hydrate, type QueryKey } from '@tanstack/react-query';

const STORE_KEY = 'ec-query-cache-v1';
const MAX_AGE = 24 * 60 * 60_000; // painted from cache for a day at most
const MAX_BYTES = 1_500_000;

/** A stable, non-secret tag of the signed-in account (never the token itself). */
function ownerTag(): string {
  try {
    const t = localStorage.getItem('access_token');
    if (!t) return '';
    const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return String(payload.sub ?? payload.user_id ?? payload.id ?? '');
  } catch {
    return '';
  }
}

export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: MAX_AGE,
        refetchOnWindowFocus: true,
        retry: 1,
        placeholderData: keepPreviousData,
      },
    },
  });
}

/** Paint the last known data instantly, then keep the stored copy in step with the cache. */
export function persistQueries(client: QueryClient): () => void {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as { owner: string; at: number; state: unknown };
      const owner = ownerTag();
      if (owner && saved.owner === owner && Date.now() - saved.at < MAX_AGE) hydrate(client, saved.state);
      else localStorage.removeItem(STORE_KEY);
    }
  } catch {
    /* storage blocked or corrupt: start empty */
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  const save = () => {
    timer = null;
    const owner = ownerTag();
    try {
      if (!owner) { localStorage.removeItem(STORE_KEY); return; }
      const state = dehydrate(client, {
        shouldDehydrateQuery: (q) => q.state.status === 'success' && q.meta?.persist !== false,
      });
      const body = JSON.stringify({ owner, at: Date.now(), state });
      if (body.length <= MAX_BYTES) localStorage.setItem(STORE_KEY, body);
    } catch {
      /* quota / private mode: the app simply loads from the network */
    }
  };
  const unsub = client.getQueryCache().subscribe(() => {
    if (!timer) timer = setTimeout(save, 1500);
  });
  return () => { unsub(); if (timer) clearTimeout(timer); };
}

/** Forget this browser's copy (sign-out / account switch). */
export function clearPersistedQueries(client?: QueryClient) {
  try { localStorage.removeItem(STORE_KEY); } catch { /* ignore */ }
  client?.clear();
}

/**
 * Apply a change to local state now, send it, roll back if it fails.
 *   await optimisticList(setLeads, (ls) => ls.filter(...), () => studioApi.deleteLead(id), onError)
 * Returns the server result (or undefined after a rollback).
 */
export async function optimisticList<S, R>(
  setState: (fn: (prev: S) => S) => void,
  change: (prev: S) => S,
  send: () => Promise<R>,
  onError?: (e: unknown) => void,
  reconcile?: (prev: S, result: R) => S,
): Promise<R | undefined> {
  let before: S | undefined;
  setState((prev) => { before = prev; return change(prev); });
  try {
    const result = await send();
    if (reconcile) setState((prev) => reconcile(prev, result));
    return result;
  } catch (e) {
    if (before !== undefined) { const b = before; setState(() => b); }
    onError?.(e);
    return undefined;
  }
}

/** Same idea for React Query data: patch the cache, send, roll back on error, refetch when done. */
export async function optimisticQuery<T, R>(
  client: QueryClient,
  key: QueryKey,
  change: (prev: T | undefined) => T | undefined,
  send: () => Promise<R>,
  onError?: (e: unknown) => void,
): Promise<R | undefined> {
  await client.cancelQueries({ queryKey: key });
  const before = client.getQueryData<T>(key);
  client.setQueryData<T>(key, (prev) => change(prev));
  try {
    return await send();
  } catch (e) {
    client.setQueryData<T>(key, before);
    onError?.(e);
    return undefined;
  } finally {
    client.invalidateQueries({ queryKey: key });
  }
}

/** Temporary ids for rows created optimistically (negative: never collide with server ids). */
let tmp = -1;
export const tempId = () => tmp--;
