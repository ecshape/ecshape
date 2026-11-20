import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import '@/i18n/uxAudit';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/** Warn before a reload or tab close while an editor holds unsaved changes. */
export function useBeforeUnload(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);
}

/** "Leave without saving?" — shared by the editors that have a Cancel / Back with unsaved work. */
export default function DiscardChangesDialog({ open, onKeep, onLeave }: { open: boolean; onKeep: () => void; onLeave: () => void }) {
  const { t } = useTranslation();
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onKeep()}>
      <AlertDialogContent className="rounded-[1.5rem]">
        <AlertDialogHeader>
          <AlertDialogTitle>{t('ux.discardTitle')}</AlertDialogTitle>
          <AlertDialogDescription>{t('ux.discardBody')}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t('ux.discardKeep')}</AlertDialogCancel>
          <AlertDialogAction onClick={onLeave} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{t('ux.discardLeave')}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
