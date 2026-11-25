import { API_BASE_URL } from '@/config/api';

/** Photos uploaded to this API are stored as a path (/files/media/...); external photos are full https links. */
export const mediaUrl = (src?: string | null) => (src && src.startsWith('/files/') ? `${API_BASE_URL}${src}` : src || undefined);
