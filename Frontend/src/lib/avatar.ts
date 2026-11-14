import { API_BASE_URL } from '@/config/api';

/**
 * Profile photos. The server stores "/api/files/avatars/<id>_<random>.webp" (public, immutable); in development the
 * API runs on another origin, so the path is resolved against API_BASE_URL.
 */
export function avatarSrc(url?: string | null): string | undefined {
  if (!url) return undefined;
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  if (url.startsWith('/api/')) return API_BASE_URL.replace(/\/api\/?$/, '') + url;
  return url;
}

export const initialsOf = (name?: string | null) =>
  (name || '?').split(' ').filter(Boolean).map((n) => n[0]).join('').toUpperCase().slice(0, 2);

async function call(method: 'POST' | 'DELETE', body?: FormData): Promise<{ avatar_url: string | null }> {
  const token = localStorage.getItem('access_token');
  const res = await fetch(`${API_BASE_URL}/files/avatar`, {
    method,
    body,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const j = await res.json();
      if (typeof j.detail === 'string') detail = j.detail;
    } catch {
      /* not json */
    }
    throw new Error(detail);
  }
  return res.json();
}

export function uploadAvatar(blob: Blob) {
  const fd = new FormData();
  fd.append('file', blob, 'avatar.webp');
  return call('POST', fd);
}

export const deleteAvatar = () => call('DELETE');

/** Square crop of an image: `zoom` >= 1, offsets in [-1, 1] of the free travel on each axis. */
export async function cropSquare(src: string, zoom: number, ox: number, oy: number, size = 512): Promise<Blob> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const side = Math.min(img.naturalWidth, img.naturalHeight) / zoom;
  const freeX = img.naturalWidth - side;
  const freeY = img.naturalHeight - side;
  const sx = freeX / 2 + (ox * freeX) / 2;
  const sy = freeY / 2 + (oy * freeY) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.88));
  if (blob) return blob;
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.9));
}

/* ------------------------------------------------ last signed-in user on this device (public site bubble) */
const LAST_USER_KEY = 'ec-last-user';
export type LastUser = { name: string; avatar_url: string | null; role: string };

export function rememberLastUser(u: LastUser) {
  try {
    localStorage.setItem(LAST_USER_KEY, JSON.stringify(u));
  } catch {
    /* storage blocked */
  }
}

export function forgetLastUser() {
  try {
    localStorage.removeItem(LAST_USER_KEY);
  } catch {
    /* storage blocked */
  }
}

export function readLastUser(): LastUser | null {
  try {
    const raw = localStorage.getItem(LAST_USER_KEY);
    const u = raw ? JSON.parse(raw) : null;
    return u && typeof u.name === 'string' ? u : null;
  } catch {
    return null;
  }
}
