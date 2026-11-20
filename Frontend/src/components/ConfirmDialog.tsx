import { useCallback, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

type ConfirmOptions = { title?: ReactNode; body: ReactNode; confirmLabel?: ReactNode; destructive?: boolean };

/**
 * The app's own "are you sure?" in place of window.confirm (which is unstyled, follows the browser's language and
 * blocks the page). `if (!(await confirm({ body: t('x.deleteConfirm') }))) return;` and render `dialog` once.
 */
export function useConfirm(): [(o: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const { t } = useTranslation();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);
  const confirm = useCallback((o: ConfirmOptions) => new Promise<boolean>((resolve) => {
    resolver.current?.(false);
    resolver.current = resolve;
    setOpts(o);
  }), []);
  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpts(null);
  };
  const destructive = opts?.destructive !== false;
  const dialog = (
    <AlertDialog open={!!opts} onOpenChange={(o) => !o && settle(false)}>
      <AlertDialogContent className="rounded-[1.5rem]">
        <AlertDialogHeader>
          <AlertDialogTitle>{opts?.title ?? (destructive ? t('common.delete') : t('common.confirm'))}</AlertDialogTitle>
          <AlertDialogDescription>{opts?.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => settle(false)}>{t('common.cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => settle(true)}
            className={destructive ? 'bg-destructive text-destructive-foreground hover:bg-destructive/90' : undefined}
          >
            {opts?.confirmLabel ?? (destructive ? t('common.delete') : t('common.confirm'))}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
  return [confirm, dialog];
}
