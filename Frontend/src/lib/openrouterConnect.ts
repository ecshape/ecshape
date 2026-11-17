/**
 * One-click AI connection (QA #98): OpenRouter's OAuth PKCE flow. The coach signs in at OpenRouter (Google, GitHub
 * or email), presses "Authorize", and comes back here with a key that reaches Claude, ChatGPT, Gemini, Mistral…
 * through one account. No key to find, copy or paste. Docs: https://openrouter.ai/docs/use-cases/oauth-pkce
 */
const VERIFIER_KEY = 'ec-or-pkce';

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export const OPENROUTER_RETURN = 'or-connect';

export async function startOpenRouterConnect(): Promise<void> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  try { sessionStorage.setItem(VERIFIER_KEY, verifier); } catch { /* private mode: the exchange below will say so */ }
  const back = `${window.location.origin}${window.location.pathname}?${OPENROUTER_RETURN}=1`;
  const url = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(back)}&code_challenge=${b64url(digest)}&code_challenge_method=S256`;
  window.location.assign(url);
}

/** On the way back: the one-time code from the URL, if this page load is the return from OpenRouter. */
export function openRouterReturnCode(): string | null {
  const q = new URLSearchParams(window.location.search);
  return q.get(OPENROUTER_RETURN) && q.get('code') ? q.get('code') : null;
}

/** Trades the one-time code for the coach's OpenRouter key. */
export async function finishOpenRouterConnect(code: string): Promise<string> {
  let verifier: string | null = null;
  try { verifier = sessionStorage.getItem(VERIFIER_KEY); sessionStorage.removeItem(VERIFIER_KEY); } catch { /* ignore */ }
  if (!verifier) throw new Error('verifier');
  const r = await fetch('https://openrouter.ai/api/v1/auth/keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }),
  });
  if (!r.ok) throw new Error(`exchange ${r.status}`);
  const j = (await r.json()) as { key?: string };
  if (!j.key) throw new Error('no key');
  return j.key;
}

/** Removes ?or-connect / ?code from the address bar after the return. */
export function clearOpenRouterReturn(): void {
  const u = new URL(window.location.href);
  u.searchParams.delete(OPENROUTER_RETURN);
  u.searchParams.delete('code');
  window.history.replaceState(null, '', `${u.pathname}${u.search}#ai-keys`);
}
