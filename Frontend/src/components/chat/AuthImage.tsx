import React, { useEffect, useState } from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { progressPhotoUrl } from './api';

// Object URLs of authenticated progress photos, shared across the chat.
const cache = new Map<string, Promise<string | null>>();

const load = (filename: string) => {
  let p = cache.get(filename);
  if (!p) {
    const token = localStorage.getItem('access_token');
    p = fetch(progressPhotoUrl(filename), { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(async (r) => (r.ok ? URL.createObjectURL(await r.blob()) : null))
      .catch(() => null);
    p.then((url) => { if (!url) cache.delete(filename); });
    cache.set(filename, p);
  }
  return p;
};

interface Props {
  filename: string;
  alt: string;
  className?: string;
}

/** Progress photo fetched with the bearer token (the media endpoint is protected). */
const AuthImage: React.FC<Props> = ({ filename, alt, className }) => {
  const [src, setSrc] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    setSrc(undefined);
    load(filename).then((u) => { if (alive) setSrc(u); });
    return () => { alive = false; };
  }, [filename]);

  if (src === undefined) return <div className={cn('ec-chat-shimmer bg-muted', className)} aria-hidden />;
  if (src === null) {
    return (
      <div className={cn('grid place-items-center bg-muted text-muted-foreground', className)}>
        <ImageOff className="h-5 w-5" aria-hidden />
      </div>
    );
  }
  return <img src={src} alt={alt} className={cn('object-cover', className)} draggable={false} />;
};

export default AuthImage;
