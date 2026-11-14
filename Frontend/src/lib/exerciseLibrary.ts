import { API_BASE_URL } from '@/config/api';

export interface LibraryExercise {
  id: string;
  name: string;
  level: 'beginner' | 'intermediate' | 'expert' | string;
  equipment: string | null;
  mechanic: string | null;
  force: string | null;
  category: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  frames: string[];
  imported: boolean;
  /** 'wger' for exercises from wger.de (ids are prefixed "wger:"); absent for the built-in library. */
  source?: 'wger';
  name_en?: string;
  license_author?: string | null;
  source_url?: string;
}

export type LibrarySource = 'library' | 'wger';

export interface LibrarySources {
  library: number;
  /** null until the wger catalogue has been downloaded once by the server */
  wger: number | null;
  wger_attribution: string;
}

export interface LibraryFacets {
  total: number;
  muscles: Record<string, number>;
  equipment: Record<string, number>;
  levels: Record<string, number>;
  categories: Record<string, number>;
}

const CDN = 'https://cdn.jsdelivr.net/gh/yuhonas/free-exercise-db@main/exercises';
export const libraryFrames = (libraryId: string) => [`${CDN}/${libraryId}/0.jpg`, `${CDN}/${libraryId}/1.jpg`];

/** Demo frames for any exercise: library animation, wger / uploaded image, or none. */
export const exerciseFrames = (e: { library_id?: string | null; image_path?: string | null }): string[] => {
  if (e.library_id && !e.library_id.startsWith('wger:')) return libraryFrames(e.library_id);
  if (!e.image_path) return [];
  if (/^https?:\/\//.test(e.image_path) || e.image_path.startsWith(API_BASE_URL)) return [e.image_path];
  const file = e.image_path.split('/').pop() || e.image_path.split('\\').pop();
  return [`${API_BASE_URL}/files/media/exercise_images/${file}`];
};

/** Muscle order used for chips (most used first). */
export const LIBRARY_MUSCLES = [
  'chest', 'shoulders', 'lats', 'middle back', 'lower back', 'traps', 'biceps', 'triceps', 'forearms',
  'abdominals', 'quadriceps', 'hamstrings', 'glutes', 'calves', 'adductors', 'abductors', 'neck',
] as const;

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem('access_token');
  const res = await fetch(`${API_BASE_URL}/exercise-library${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(init?.headers || {}) },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.detail || res.statusText);
  return res.json();
}

export const exerciseLibrary = {
  facets: () => call<LibraryFacets>('/facets'),
  sources: () => call<LibrarySources>('/sources'),
  search: (p: { q?: string; muscle?: string; equipment?: string; level?: string; source?: LibrarySource; lang?: string; offset?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    Object.entries(p).forEach(([k, v]) => v !== undefined && v !== '' && qs.set(k, String(v)));
    return call<{ total: number; items: LibraryExercise[]; catalog_total?: number }>(`?${qs}`);
  },
  importIds: (ids: string[], lang?: string) =>
    call<{ created: number; skipped: number }>('/import', { method: 'POST', body: JSON.stringify({ ids, lang }) }),
};
