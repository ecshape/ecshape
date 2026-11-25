import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Download, FileText, Lock, ShieldOff, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { API_BASE_URL } from '@/config/api';
import { useAuth } from '@/contexts/AuthContext';
import { SectionCard } from '@/features/trainer/ui';
import { cn } from '@/lib/utils';
import { consentCopy } from '@/legal/consentText';
import { recheckConsent } from '@/components/legal/ConsentGate';
import { api } from './api';
import { Sheet } from './ui';

/** Legal audit 2026-11: right of access / copy (export), withdrawal of health-data consent and erasure, self-service. */
const PrivacyCard: React.FC<{ style?: React.CSSProperties }> = ({ style }) => {
  const { i18n } = useTranslation();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const c = consentCopy(i18n.language || 'he');
  const [busy, setBusy] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  const exportData = async () => {
    setBusy(true);
    try {
      const token = localStorage.getItem('access_token');
      const res = await fetch(`${API_BASE_URL}/privacy/export`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ecshape-my-data-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success(c.exportDone);
    } catch {
      toast.error(c.exportError);
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    if (!window.confirm(c.withdrawConfirm)) return;
    try {
      await api('/privacy/consent/withdraw', { method: 'POST', body: { kind: 'health_data' } });
      recheckConsent();
    } catch {
      toast.error(c.error);
    }
  };

  return (
    <SectionCard icon={Lock} title={c.cardTitle} className="tp-rise" style={style} bodyClassName="-mx-2 space-y-1">
      <p className="px-2 pb-2 text-sm leading-relaxed text-muted-foreground">{c.cardText}</p>
      <Row icon={Download} label={c.exportBtn} onClick={exportData} disabled={busy} />
      <Row icon={FileText} label={c.policies} onClick={() => navigate('/legal/privacy')} />
      <Row icon={ShieldOff} label={c.withdrawBtn} onClick={withdraw} />
      <Row icon={Trash2} label={c.deleteBtn} onClick={() => setDelOpen(true)} danger />
      <DeleteSheet open={delOpen} onOpenChange={setDelOpen} onDeleted={logout} />
    </SectionCard>
  );
};

const Row: React.FC<{ icon: React.ElementType; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }> = ({ icon: Icon, label, onClick, danger, disabled }) => (
  <button type="button" onClick={onClick} disabled={disabled} className={cn('tp-press flex min-h-[3.25rem] w-full items-center gap-3 rounded-2xl px-2 text-start font-semibold hover:bg-foreground/[.05] disabled:opacity-60', danger && 'text-destructive')}>
    <span className={cn('grid h-9 w-9 flex-none place-items-center rounded-xl', danger ? 'bg-destructive/12' : 'bg-primary/12 text-primary')}><Icon className="h-4 w-4" /></span>
    <span className="min-w-0 flex-1">{label}</span>
  </button>
);

const DeleteSheet: React.FC<{ open: boolean; onOpenChange: (o: boolean) => void; onDeleted: () => void }> = ({ open, onOpenChange, onDeleted }) => {
  const { i18n } = useTranslation();
  const c = consentCopy(i18n.language || 'he');
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const ok = typed.trim() === 'DELETE';
  const submit = async () => {
    if (!ok) return;
    setBusy(true);
    try {
      await api('/privacy/me', { method: 'DELETE', body: { confirm: 'DELETE' } });
      onOpenChange(false);
      onDeleted();
    } catch {
      toast.error(c.deleteError);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title={c.deleteTitle} description={c.deleteText}
      footer={
        <div className="flex w-full gap-2">
          <button type="button" onClick={() => onOpenChange(false)} className="tp-btn tp-press flex-1">{c.cancel}</button>
          <button type="button" onClick={submit} disabled={!ok || busy} className="tp-btn tp-press flex-1 !bg-destructive !text-destructive-foreground">{c.deleteConfirm}</button>
        </div>
      }>
      <form className="pb-2 pt-1" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <label className="block">
          <span className="mb-1 block text-sm text-muted-foreground">{c.deleteType}</span>
          <input className="tp-input" value={typed} onChange={(e) => setTyped(e.target.value)} dir="ltr" autoComplete="off" autoCapitalize="characters" />
        </label>
      </form>
    </Sheet>
  );
};

export default PrivacyCard;
