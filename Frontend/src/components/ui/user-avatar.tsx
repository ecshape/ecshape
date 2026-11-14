import React, { useState } from 'react';
import { cn } from '@/lib/utils';
import { avatarSrc, initialsOf } from '@/lib/avatar';

/**
 * Round profile photo with an initials fallback (no photo, or the file failed to load).
 * `className` sets size / colours of the fallback, e.g. "h-9 w-9 bg-primary text-primary-foreground text-sm".
 */
export const UserAvatar: React.FC<{ name?: string | null; src?: string | null; className?: string; rounded?: string; alt?: string }> = ({
  name, src, className, rounded = 'rounded-full', alt = '',
}) => {
  const url = avatarSrc(src);
  const [failed, setFailed] = useState<string | null>(null);
  const showImg = !!url && failed !== url;
  return (
    <span className={cn('relative grid flex-none select-none place-items-center overflow-hidden font-bold', rounded, className)} aria-hidden={alt ? undefined : true}>
      {showImg ? (
        <img src={url} alt={alt} className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" draggable={false} onError={() => setFailed(url)} />
      ) : (
        initialsOf(name)
      )}
    </span>
  );
};

export default UserAvatar;
