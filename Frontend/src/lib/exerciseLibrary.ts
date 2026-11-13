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
  search: (p: { q?: string; muscle?: string; equipment?: string; level?: string; offset?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    Object.entries(p).forEach(([k, v]) => v !== undefined && v !== '' && qs.set(k, String(v)));
    return call<{ total: number; items: LibraryExercise[] }>(`?${qs}`);
  },
  importIds: (ids: string[]) => call<{ created: number; skipped: number }>('/import', { method: 'POST', body: JSON.stringify({ ids }) }),
};
