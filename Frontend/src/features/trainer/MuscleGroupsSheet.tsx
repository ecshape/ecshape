import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Loader2, Lock, Pencil, Plus, Trash2, X } from 'lucide-react';
import { api } from '@/features/trainee/api';
import { InfoTip } from '@/components/ui/info-tip';
import { useToast } from '@/hooks/use-toast';
import { Sheet } from './ui';

export interface MuscleGroup { id: number; name: string; name_he?: string | null }
export const groupSlug = (name: string) => name.toLowerCase().replace(/\s+/g, '_');

/**
 * Muscle-group manager (#18): explains what groups are for, shows the built-in ones with their exercise counts,
 * and lets the trainer add, rename (English and Hebrew side by side) and delete custom groups inline.
 */
export const MuscleGroupsSheet: React.FC<{
  open: boolean;
  onOpenChange: (o: boolean) => void;
  builtIn: string[];
  groups: MuscleGroup[];
  counts: Record<string, number>;
  labelOf: (slug: string) => string;
  onChange: (groups: MuscleGroup[]) => void;
}> = ({ open, onOpenChange, builtIn, groups, counts, labelOf, onChange }) => {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [en, setEn] = useState('');
  const [he, setHe] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [editEn, setEditEn] = useState('');
  const [editHe, setEditHe] = useState('');
  const [confirmId, setConfirmId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  const add = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!en.trim()) { setError(t('exerciseBank.muscleGroupNameRequired')); return; }
    setBusy(true); setError('');
    try {
      const g = await api<MuscleGroup>('/muscle-groups/', { method: 'POST', body: { name: en.trim(), name_he: he.trim() || null } });
      onChange([...groups, g]);
      setEn(''); setHe('');
      toast({ title: t('exerciseBank.muscleGroupCreated') });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const save = async (id: number) => {
    if (!editEn.trim()) { setError(t('exerciseBank.muscleGroupNameRequired')); return; }
    setBusy(true); setError('');
    try {
      const g = await api<MuscleGroup>(`/muscle-groups/${id}`, { method: 'PUT', body: { name: editEn.trim(), name_he: editHe.trim() || null } });
      onChange(groups.map((x) => (x.id === id ? g : x)));
      setEditId(null);
      toast({ title: t('exerciseBank.muscleGroupUpdated') });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  const remove = async (id: number) => {
    setBusy(true); setError('');
    try {
      await api(`/muscle-groups/${id}`, { method: 'DELETE' });
      onChange(groups.filter((x) => x.id !== id));
      setConfirmId(null);
      toast({ title: t('exerciseBank.muscleGroupDeleted') });
    } catch (e) { fail(e); } finally { setBusy(false); }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={t('tt.mg.title')} description={t('tt.mg.lead')}>
      <div className="tr-wide space-y-6 pb-2">
        {/* Add */}
        <form onSubmit={add} className="tp-card space-y-3 p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-bold">{t('tt.mg.add')}<InfoTip>{t('tt.mg.addInfo')}</InfoTip></h3>
          <div className="tr-mg-names">
            <label className="tr-field">
              <span className="tr-field-label">{t('tt.mg.nameEn')}</span>
              <input className="tp-input tr-input-sm" dir="ltr" value={en} onChange={(e) => { setEn(e.target.value); setError(''); }} placeholder={t('exerciseBank.newMuscleGroupNameEnPlaceholder')} />
            </label>
            <label className="tr-field">
              <span className="tr-field-label">{t('tt.mg.nameHe')}</span>
              <input className="tp-input tr-input-sm" dir="rtl" value={he} onChange={(e) => setHe(e.target.value)} placeholder={t('exerciseBank.newMuscleGroupNameHePlaceholder')} />
            </label>
            <button type="submit" className="tp-btn tp-btn--primary tp-btn--sm tp-press self-end" disabled={busy || !en.trim()}>
              {busy && !editId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {t('tt.common.add')}
            </button>
          </div>
          {error && <p className="text-xs font-semibold text-[hsl(var(--tr-bad))]" role="alert">{error}</p>}
        </form>

        {/* Custom */}
        <section>
          <h3 className="mb-2.5 flex items-center gap-1.5 text-sm font-bold">{t('tt.mg.custom')}<InfoTip>{t('tt.mg.customInfo')}</InfoTip></h3>
          {groups.length === 0 ? (
            <p className="rounded-2xl bg-foreground/[.04] p-4 text-sm text-muted-foreground">{t('tt.mg.noCustom')}</p>
          ) : (
            <ul className="tr-mg-list">
              {groups.map((g) => {
                const n = counts[groupSlug(g.name)] ?? 0;
                if (editId === g.id) {
                  return (
                    <li key={g.id} className="tp-card tr-mg-card" data-editing>
                      <div className="tr-mg-names">
                        <input className="tp-input tr-input-sm" dir="ltr" aria-label={t('tt.mg.nameEn')} value={editEn} onChange={(e) => setEditEn(e.target.value)} autoFocus />
                        <input className="tp-input tr-input-sm" dir="rtl" aria-label={t('tt.mg.nameHe')} value={editHe} onChange={(e) => setEditHe(e.target.value)} />
                      </div>
                      <div className="flex gap-1.5">
                        <button type="button" className="tp-icon-btn tp-press !h-9 !w-9" onClick={() => save(g.id)} disabled={busy} aria-label={t('tt.common.save')} title={t('tt.common.save')}><Check className="h-4 w-4" /></button>
                        <button type="button" className="tp-icon-btn tp-press !h-9 !w-9" onClick={() => setEditId(null)} aria-label={t('tt.common.cancel')} title={t('tt.common.cancel')}><X className="h-4 w-4" /></button>
                      </div>
                    </li>
                  );
                }
                return (
                  <li key={g.id} className="tp-card tr-mg-card">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold" dir="rtl">{g.name_he || '–'}</p>
                      <p className="truncate text-xs text-muted-foreground" dir="ltr">{g.name}</p>
                    </div>
                    <span className="tp-chip flex-none tabular-nums" title={t('tt.mg.count', { count: n })}>{t('tt.mg.count', { count: n })}</span>
                    {confirmId === g.id ? (
                      <div className="flex flex-none items-center gap-1.5">
                        <button type="button" className="tp-btn tp-btn--sm tp-press !min-h-9 bg-[hsl(var(--tr-bad))] !px-3 text-white" onClick={() => remove(g.id)} disabled={busy}>{t('tt.common.delete')}</button>
                        <button type="button" className="tp-icon-btn tp-press !h-9 !w-9" onClick={() => setConfirmId(null)} aria-label={t('tt.common.cancel')}><X className="h-4 w-4" /></button>
                      </div>
                    ) : (
                      <div className="flex flex-none gap-1.5">
                        <button type="button" className="tp-icon-btn tp-press !h-9 !w-9" onClick={() => { setEditId(g.id); setEditEn(g.name); setEditHe(g.name_he ?? ''); setError(''); }} aria-label={t('tt.common.edit')} title={t('tt.common.edit')}><Pencil className="h-4 w-4" /></button>
                        <button type="button" className="tp-icon-btn tp-press !h-9 !w-9 text-[hsl(var(--tr-bad))]" onClick={() => setConfirmId(g.id)} aria-label={t('tt.common.delete')} title={n > 0 ? t('tt.mg.deleteUsed', { count: n }) : t('tt.common.delete')}><Trash2 className="h-4 w-4" /></button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Built-in */}
        <section>
          <h3 className="mb-2.5 flex items-center gap-1.5 text-sm font-bold">{t('tt.mg.builtIn')}<InfoTip>{t('tt.mg.builtInInfo')}</InfoTip></h3>
          <div className="flex flex-wrap gap-1.5">
            {builtIn.map((slug) => (
              <span key={slug} className="tp-chip">
                <Lock className="h-3 w-3 opacity-60" aria-hidden />
                {labelOf(slug)}
                <span className="tabular-nums opacity-70">{counts[slug] ?? 0}</span>
              </span>
            ))}
          </div>
        </section>
      </div>
    </Sheet>
  );
};

export default MuscleGroupsSheet;
