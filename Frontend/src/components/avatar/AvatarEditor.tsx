/**
 * Profile photo picker with a square crop (drag to frame, slider to zoom). Used in Studio -> Settings (trainer)
 * and in the trainee profile. Saves through /api/files/avatar and updates the signed-in user right away.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Camera, Loader2, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import '@/i18n/ticketsStudio';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { UserAvatar } from '@/components/ui/user-avatar';
import { useAuth } from '@/contexts/AuthContext';
import { cropSquare, deleteAvatar, uploadAvatar } from '@/lib/avatar';
import { cn } from '@/lib/utils';

const VIEW = 260;

type Img = { src: string; w: number; h: number };

export const AvatarEditor: React.FC<{ className?: string; rounded?: string; compact?: boolean }> = ({ className, rounded = 'rounded-full', compact }) => {
  const { t } = useTranslation();
  const { user, setAvatarUrl } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [img, setImg] = useState<Img | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => () => { if (img) URL.revokeObjectURL(img.src); }, [img]);

  const pick = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(t('tix.avatar.notImage'));
      return;
    }
    const src = URL.createObjectURL(file);
    const probe = new Image();
    probe.onload = () => {
      setImg({ src, w: probe.naturalWidth, h: probe.naturalHeight });
      setZoom(1);
      setOff({ x: 0, y: 0 });
      setError('');
    };
    probe.onerror = () => setError(t('tix.avatar.notImage'));
    probe.src = src;
  };

  // Geometry of the preview (same maths as cropSquare)
  const side = img ? Math.min(img.w, img.h) / zoom : 1;
  const k = VIEW / side;
  const freeX = img ? img.w - side : 0;
  const freeY = img ? img.h - side : 0;
  const sx = freeX / 2 + (off.x * freeX) / 2;
  const sy = freeY / 2 + (off.y * freeY) / 2;
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  const nudge = (dx: number, dy: number) =>
    setOff((o) => ({ x: freeX ? clamp(o.x - (dx / k) * (2 / freeX)) : 0, y: freeY ? clamp(o.y - (dy / k) * (2 / freeY)) : 0 }));

  const save = async () => {
    if (!img) return;
    setBusy(true);
    setError('');
    try {
      const blob = await cropSquare(img.src, zoom, off.x, off.y);
      const res = await uploadAvatar(blob);
      setAvatarUrl(res.avatar_url);
      setImg(null);
    } catch (e) {
      setError((e as Error).message || t('tix.avatar.failed'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteAvatar();
      setAvatarUrl(null);
    } catch (e) {
      setError((e as Error).message || t('tix.avatar.failed'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('flex items-center gap-4', compact && 'gap-3')}>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className={cn('group relative flex-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2', rounded)}
        aria-label={user?.avatar_url ? t('tix.avatar.change') : t('tix.avatar.add')}
        title={user?.avatar_url ? t('tix.avatar.change') : t('tix.avatar.add')}
      >
        <UserAvatar name={user?.full_name} src={user?.avatar_url} rounded={rounded} className={cn('bg-primary text-primary-foreground', className || 'h-20 w-20 text-2xl')} />
        <span className={cn('absolute -bottom-1 -end-1 grid h-8 w-8 place-items-center rounded-full border-2 border-background bg-foreground text-background shadow-md transition-transform duration-300 group-hover:scale-110 motion-reduce:transition-none')}>
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
        </span>
      </button>
      {!compact && (
        <div className="min-w-0">
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Camera />
              {user?.avatar_url ? t('tix.avatar.change') : t('tix.avatar.add')}
            </Button>
            {user?.avatar_url && (
              <Button type="button" size="sm" variant="ghost" className="text-destructive" onClick={remove} disabled={busy}>
                <Trash2 />
                {t('tix.avatar.remove')}
              </Button>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{t('tix.avatar.hint')}</p>
          {error && !img && <p className="mt-1 text-xs font-semibold text-destructive">{error}</p>}
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />

      <Dialog open={!!img} onOpenChange={(o) => !o && !busy && setImg(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="ec-page-title !text-4xl">{t('tix.avatar.cropTitle')}</DialogTitle>
            <DialogDescription>{t('tix.avatar.cropHint')}</DialogDescription>
          </DialogHeader>
          {img && (
            <div className="flex flex-col items-center gap-4">
              <div
                className="relative cursor-grab touch-none overflow-hidden rounded-full bg-muted outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
                style={{ width: VIEW, height: VIEW }}
                tabIndex={0}
                role="application"
                aria-label={t('tix.avatar.cropHint')}
                onPointerDown={(e) => {
                  (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                  drag.current = { x: e.clientX, y: e.clientY, ox: 0, oy: 0 };
                }}
                onPointerMove={(e) => {
                  if (!drag.current) return;
                  const dx = e.clientX - drag.current.x;
                  const dy = e.clientY - drag.current.y;
                  drag.current.x = e.clientX;
                  drag.current.y = e.clientY;
                  nudge(dx, dy);
                }}
                onPointerUp={() => (drag.current = null)}
                onPointerCancel={() => (drag.current = null)}
                onKeyDown={(e) => {
                  const step = 12;
                  if (e.key === 'ArrowLeft') nudge(step, 0);
                  else if (e.key === 'ArrowRight') nudge(-step, 0);
                  else if (e.key === 'ArrowUp') nudge(0, step);
                  else if (e.key === 'ArrowDown') nudge(0, -step);
                  else return;
                  e.preventDefault();
                }}
              >
                <img
                  src={img.src}
                  alt=""
                  draggable={false}
                  className="pointer-events-none absolute max-w-none select-none"
                  style={{ width: img.w * k, height: img.h * k, left: -sx * k, top: -sy * k }}
                />
              </div>
              <label className="flex w-full max-w-[260px] items-center gap-3" dir="ltr">
                <ZoomOut className="h-4 w-4 text-muted-foreground" />
                <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-[hsl(var(--primary))]" aria-label={t('tix.avatar.zoom')} />
                <ZoomIn className="h-4 w-4 text-muted-foreground" />
              </label>
              {error && <p className="text-sm font-semibold text-destructive">{error}</p>}
              <div className="flex w-full justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setImg(null)} disabled={busy}>{t('tix.common.cancel')}</Button>
                <Button type="button" onClick={save} disabled={busy}>
                  {busy && <Loader2 className="animate-spin" />}
                  {t('tix.avatar.save')}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AvatarEditor;
