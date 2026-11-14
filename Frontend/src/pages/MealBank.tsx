import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Layout from '../components/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowUpDown, Download, Library, Plus, Search, Upload, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { API_BASE_URL } from '../config/api';
import { useToast } from '../hooks/use-toast';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { ImportReviewDialog, type ImportPreviewRow, type ImportDecision } from '../components/ImportReviewDialog';
import {
  MANUAL_TAGS,
  PROPERTY_TAGS,
  itemTags,
  normalizeMacroType,
  displayName,
  type MacroType,
  type MealBankItem,
  type PropertyTag,
} from '../components/foodbank/foodbankModel';
import { IconOf, MACRO_ICON, PlateIcon } from '../components/foodbank/FoodIcons';
import { FoodCard, FoodCardSkeleton, FoodPhoto, PropertyChip } from '../components/foodbank/FoodParts';
import { FoodLibraryDrawer, libraryKey } from '../components/foodbank/FoodLibraryDrawer';
import '../components/foodbank/foodbank.css';

type MacroFilter = 'all' | MacroType;
type SortKey = 'name' | 'protein' | 'kcalAsc' | 'recent';

const MACROS: MacroType[] = ['protein', 'carb', 'fat'];

interface ItemFormState {
  name: string;
  name_hebrew: string;
  macro_type: MacroType;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  fiber: string;
  measurement_type: 'per_100g' | 'per_portion';
  serving_size: string;
  is_public: boolean;
  image_url: string;
  tags: PropertyTag[];
}

const emptyForm: ItemFormState = {
  name: '',
  name_hebrew: '',
  macro_type: 'protein',
  calories: '',
  protein: '',
  carbs: '',
  fat: '',
  fiber: '',
  measurement_type: 'per_100g',
  serving_size: '',
  is_public: false,
  image_url: '',
  tags: [],
};

/* Segmented control with a sliding indicator (transform-only motion). */
function MacroSegmented({
  value,
  onChange,
  counts,
}: {
  value: MacroFilter;
  onChange: (v: MacroFilter) => void;
  counts: Record<MacroFilter, number>;
}) {
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState<{ x: number; w: number } | null>(null);
  const options: MacroFilter[] = ['all', ...MACROS];

  useLayoutEffect(() => {
    const measure = () => {
      const el = wrapRef.current?.querySelector<HTMLButtonElement>(`[data-value="${value}"]`);
      if (el) setInd({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [value, counts]);

  return (
    <div ref={wrapRef} className="fb-seg flex w-full gap-1 rounded-xl border border-border/70 bg-muted/40 p-1 sm:w-auto" role="group">
      {ind && <span className="fb-seg__ind" style={{ width: ind.w, transform: `translateX(${ind.x}px)` }} />}
      {options.map((opt) => (
        <button
          key={opt}
          type="button"
          data-value={opt}
          aria-pressed={value === opt ? 'true' : 'false'}
          onClick={() => onChange(opt)}
          className="fb-seg__btn flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none sm:text-sm"
        >
          {opt !== 'all' && <IconOf icon={MACRO_ICON[opt]} size={16} />}
          <span className={cn(opt !== 'all' && 'hidden sm:inline')}>
            {opt === 'all' ? t('foodBankPro.all') : t(`foodBankPro.macro.${opt}`)}
          </span>
          <span className="tabular-nums text-[11px] opacity-70">{counts[opt]}</span>
        </button>
      ))}
    </div>
  );
}

const MealBank = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { t, i18n } = useTranslation();
  const lang = (i18n.language || 'he').slice(0, 2);

  const [items, setItems] = useState<MealBankItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [macroFilter, setMacroFilter] = useState<MacroFilter>('all');
  const [tagFilter, setTagFilter] = useState<PropertyTag[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>('name');

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<MealBankItem | null>(null);
  const [activeTab, setActiveTab] = useState('details');
  const [itemForm, setItemForm] = useState<ItemFormState>(emptyForm);
  const [pendingDelete, setPendingDelete] = useState<MealBankItem | null>(null);
  const [libraryOpen, setLibraryOpen] = useState(false);

  const [importFile, setImportFile] = useState<File | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [duplicateData, setDuplicateData] = useState<{ rows: ImportPreviewRow[]; message?: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const authHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('access_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchItems = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/v2/meals/meal-bank?include_public=true`, {
        headers: authHeaders(),
      });
      if (response.ok) {
        const data = (await response.json()) as Array<MealBankItem & { macro_type: string }>;
        setItems(data.map((item) => ({ ...item, macro_type: normalizeMacroType(item.macro_type) })));
      } else {
        throw new Error(String(response.status));
      }
    } catch (error) {
      console.error('Error fetching meal bank items:', error);
      toast({ title: t('common.error'), description: t('foodBank.errorLoad'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- Derived data ---------------- */

  const tagsById = useMemo(() => {
    const map = new Map<number, PropertyTag[]>();
    items.forEach((item) => map.set(item.id, itemTags(item)));
    return map;
  }, [items]);

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const searchMatches = (item: MealBankItem) =>
    !normalizedSearch ||
    (item.name ?? '').toLowerCase().includes(normalizedSearch) ||
    (item.name_hebrew ?? '').toLowerCase().includes(normalizedSearch) ||
    (item.brand ?? '').toLowerCase().includes(normalizedSearch);
  const tagMatches = (item: MealBankItem) => {
    const tags = tagsById.get(item.id) ?? [];
    return tagFilter.every((tag) => tags.includes(tag));
  };

  const macroCounts = useMemo(() => {
    const base = items.filter((i) => searchMatches(i) && tagMatches(i));
    return {
      all: base.length,
      protein: base.filter((i) => i.macro_type === 'protein').length,
      carb: base.filter((i) => i.macro_type === 'carb').length,
      fat: base.filter((i) => i.macro_type === 'fat').length,
    } as Record<MacroFilter, number>;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, normalizedSearch, tagFilter, tagsById]);

  const tagCounts = useMemo(() => {
    const base = items.filter((i) => searchMatches(i) && (macroFilter === 'all' || i.macro_type === macroFilter));
    const counts = new Map<PropertyTag, number>();
    base.forEach((i) => (tagsById.get(i.id) ?? []).forEach((tag) => counts.set(tag, (counts.get(tag) ?? 0) + 1)));
    return counts;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, normalizedSearch, macroFilter, tagsById]);

  const visibleItems = useMemo(() => {
    const list = items.filter(
      (i) => searchMatches(i) && tagMatches(i) && (macroFilter === 'all' || i.macro_type === macroFilter),
    );
    const nameOf = (i: MealBankItem) => displayName(i, lang).primary;
    const sorted = [...list];
    if (sortKey === 'name') sorted.sort((a, b) => nameOf(a).localeCompare(nameOf(b), lang));
    if (sortKey === 'protein') sorted.sort((a, b) => (b.protein ?? -1) - (a.protein ?? -1));
    if (sortKey === 'kcalAsc') sorted.sort((a, b) => (a.calories ?? Infinity) - (b.calories ?? Infinity));
    if (sortKey === 'recent') sorted.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
    return sorted;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, normalizedSearch, tagFilter, macroFilter, sortKey, lang, tagsById]);

  const importedKeys = useMemo(
    () =>
      new Set(
        items
          .filter((i) => i.created_by === user?.id)
          .map((i) => libraryKey(i.source, i.source_id))
          .filter(Boolean),
      ),
    [items, user?.id],
  );

  const stats = useMemo(
    () => ({
      total: items.length,
      photos: items.filter((i) => !!i.image_url).length,
      library: items.filter((i) => !!i.source).length,
    }),
    [items],
  );

  const filtersActive = tagFilter.length > 0 || macroFilter !== 'all' || !!normalizedSearch;
  const gridKey = `${macroFilter}|${tagFilter.join(',')}|${sortKey}|${normalizedSearch}`;
  const canEdit = (item: MealBankItem) => item.created_by === user?.id || user?.role === 'ADMIN';

  const toggleTag = (tag: PropertyTag) =>
    setTagFilter((prev) => (prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag]));

  const clearFilters = () => {
    setTagFilter([]);
    setMacroFilter('all');
    setSearchTerm('');
  };

  /* ---------------- Create / edit / delete ---------------- */

  const resetForm = () => {
    setItemForm(emptyForm);
    setActiveTab('details');
  };

  const handleCloseDialog = () => {
    setCreateDialogOpen(false);
    setEditingItem(null);
    resetForm();
  };

  const openCreate = () => {
    setEditingItem(null);
    resetForm();
    setCreateDialogOpen(true);
  };

  const startEdit = (item: MealBankItem) => {
    const normalizedItem = { ...item, macro_type: normalizeMacroType(item.macro_type) };
    setEditingItem(normalizedItem);
    setItemForm({
      name: normalizedItem.name || '',
      name_hebrew: normalizedItem.name_hebrew || normalizedItem.name || '',
      macro_type: normalizedItem.macro_type,
      calories: normalizedItem.calories?.toString() || '',
      protein: normalizedItem.protein?.toString() || '',
      carbs: normalizedItem.carbs?.toString() || '',
      fat: normalizedItem.fat?.toString() || '',
      fiber: normalizedItem.fiber?.toString() || '',
      measurement_type: normalizedItem.measurement_type || 'per_100g',
      serving_size: normalizedItem.serving_size || '',
      is_public: !!normalizedItem.is_public,
      image_url: normalizedItem.image_url || '',
      tags: (normalizedItem.tags || []).filter((tag): tag is PropertyTag =>
        (MANUAL_TAGS as string[]).includes(tag),
      ),
    });
    setActiveTab('details');
    setCreateDialogOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = itemForm.name.trim();
    const trimmedHebrewName = itemForm.name_hebrew.trim();
    if (!trimmedName && !trimmedHebrewName) {
      toast({ title: t('common.error'), description: t('foodBank.nameRequired'), variant: 'destructive' });
      return;
    }
    const imageUrl = itemForm.image_url.trim();
    if (imageUrl && !imageUrl.startsWith('https://')) {
      toast({ title: t('common.error'), description: t('foodBankPro.form.photoHint'), variant: 'destructive' });
      return;
    }

    // Keep the stored macro-derived tags out: they are recomputed from the values.
    const payload: Record<string, unknown> = {
      name: trimmedName || trimmedHebrewName,
      name_hebrew: trimmedHebrewName || undefined,
      macro_type: itemForm.macro_type,
      calories: itemForm.calories ? parseInt(itemForm.calories) : null,
      protein: itemForm.protein ? parseFloat(itemForm.protein) : null,
      carbs: itemForm.carbs ? parseFloat(itemForm.carbs) : null,
      fat: itemForm.fat ? parseFloat(itemForm.fat) : null,
      fiber: itemForm.fiber ? parseFloat(itemForm.fiber) : null,
      measurement_type: itemForm.measurement_type,
      serving_size: itemForm.serving_size || null,
      is_public: itemForm.is_public,
      image_url: imageUrl || null,
      tags: itemForm.tags,
    };
    if (editingItem && (editingItem.image_url || '') !== imageUrl) {
      payload.image_credit = null;
    }

    try {
      const url = editingItem
        ? `${API_BASE_URL}/v2/meals/meal-bank/${editingItem.id}`
        : `${API_BASE_URL}/v2/meals/meal-bank`;
      const response = await fetch(url, {
        method: editingItem ? 'PUT' : 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (response.ok) {
        toast({
          title: t('common.success'),
          description: editingItem ? t('foodBank.successUpdated') : t('foodBank.successCreated'),
        });
        handleCloseDialog();
        fetchItems();
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast({
          title: t('common.error'),
          description: typeof errorData.detail === 'string' ? errorData.detail : t('foodBank.errorCreate'),
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error saving meal bank item:', error);
      toast({ title: t('common.error'), description: t('foodBank.errorCreate'), variant: 'destructive' });
    }
  };

  const confirmDelete = async () => {
    const item = pendingDelete;
    setPendingDelete(null);
    if (!item) return;
    try {
      const response = await fetch(`${API_BASE_URL}/v2/meals/meal-bank/${item.id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (response.ok) {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        toast({ title: t('common.success'), description: t('foodBank.successDeleted') });
      } else {
        toast({ title: t('common.error'), description: t('foodBank.errorDelete'), variant: 'destructive' });
      }
    } catch (error) {
      console.error('Error deleting meal bank item:', error);
      toast({ title: t('common.error'), description: t('foodBank.errorDelete'), variant: 'destructive' });
    }
  };

  /* ---------------- Excel export / import ---------------- */

  const handleExportExcel = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/v2/meals/meal-bank/export/excel`, { headers: authHeaders() });
      if (!response.ok) throw new Error('Export failed');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `meal_bank_export_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      toast({ title: t('common.success'), description: t('foodBankPro.exportSuccess') });
    } catch {
      toast({ title: t('common.error'), description: t('foodBankPro.exportError'), variant: 'destructive' });
    }
  };

  const handleImportExcel = async (file?: File) => {
    const fileToImport = file || importFile;
    if (!fileToImport) {
      toast({
        title: t('common.error'),
        description: t('foodBank.selectFileToImport'),
        variant: 'destructive',
      });
      return;
    }
    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', fileToImport);
      const response = await fetch(`${API_BASE_URL}/v2/meals/meal-bank/import/excel`, {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      if (response.ok) {
        const result = await response.json();
        const rows: ImportPreviewRow[] = result.rows ?? [];
        if (rows.length === 0) {
          toast({
            title: t('common.error'),
            description: result.message || t('foodBank.importReviewNoRows'),
            variant: 'destructive',
          });
          setImportFile(null);
          return;
        }
        setDuplicateData({ rows, message: result.message });
        setDuplicateDialogOpen(true);
      } else {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || t('foodBankPro.importError'));
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('foodBankPro.importError'),
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImportReviewConfirm = async (decisions: Record<number, ImportDecision>) => {
    if (!duplicateData?.rows) return;
    setIsImporting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/v2/meals/meal-bank/import/excel/process`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: duplicateData.rows, decisions }),
      });
      if (response.ok) {
        const result = await response.json();
        toast({
          title: t('common.success'),
          description: result.message || t('foodBankPro.importDone', { count: result.imported_count ?? 0 }),
        });
        setDuplicateDialogOpen(false);
        setDuplicateData(null);
        setImportFile(null);
        fetchItems();
      } else {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.detail || t('foodBankPro.importError'));
      }
    } catch (error) {
      toast({
        title: t('common.error'),
        description: error instanceof Error ? error.message : t('foodBankPro.importError'),
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
    }
  };

  /* ---------------- Render ---------------- */

  const perLabel =
    itemForm.measurement_type === 'per_100g' ? t('foodBankPro.per100g') : t('foodBankPro.perPortion');
  const presentTags = PROPERTY_TAGS.filter((tag) => (tagCounts.get(tag) ?? 0) > 0 || tagFilter.includes(tag));

  return (
    <Layout currentPage="meal-bank">
      <div className="fb-root container mx-auto space-y-6 p-4 md:p-6">
        {/* Header */}
        <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <div className="fb-reveal fb-hero-mark hidden h-14 w-14 shrink-0 place-items-center rounded-2xl border border-border/70 text-primary sm:grid">
              <PlateIcon size={28} />
            </div>
            <div className="min-w-0">
              <p className="fb-reveal fb-eyebrow text-[11px] font-semibold uppercase text-primary" style={{ ['--d' as string]: 0 }}>
                {t('foodBankPro.eyebrow')}
              </p>
              <h1 className="fb-reveal text-3xl font-bold tracking-tight text-foreground sm:text-4xl" style={{ ['--d' as string]: 1 }}>
                {t('foodBankPro.title')}
              </h1>
              <p className="fb-reveal mt-1 max-w-xl text-sm text-muted-foreground sm:text-base" style={{ ['--d' as string]: 2 }}>
                {t('foodBankPro.subtitle')}
              </p>
              <div className="fb-reveal mt-3 flex flex-wrap gap-2 text-xs" style={{ ['--d' as string]: 3 }}>
                {loading ? (
                  <>
                    <span className="fb-skel h-6 w-20 rounded-full" />
                    <span className="fb-skel h-6 w-24 rounded-full" />
                  </>
                ) : (
                  <>
                    <span className="rounded-full border border-border/70 bg-card px-2.5 py-1 font-medium tabular-nums">
                      {t('foodBankPro.countFoods', { count: stats.total })}
                    </span>
                    <span className="rounded-full border border-border/70 bg-card px-2.5 py-1 text-muted-foreground tabular-nums">
                      {t('foodBankPro.countPhotos', { count: stats.photos })}
                    </span>
                    {stats.library > 0 && (
                      <span className="rounded-full border border-border/70 bg-card px-2.5 py-1 text-muted-foreground tabular-nums">
                        {t('foodBankPro.countLibrary', { count: stats.library })}
                      </span>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>

          <p className="fb-reveal -mb-2 text-xs text-muted-foreground" style={{ ['--d' as string]: 2 }}>
            {t('banks.food.ctaScale')}
          </p>
          <div className="fb-reveal flex flex-wrap gap-2" style={{ ['--d' as string]: 2 }}>
            <Button onClick={() => setLibraryOpen(true)} className="h-11 flex-1 gap-2 rounded-xl px-4 shadow-lg shadow-primary/20 transition-transform active:scale-[.97] sm:flex-none">
              <Library className="h-4 w-4" />
              {t('foodBankPro.openLibrary')}
            </Button>
            <Button variant="outline" onClick={openCreate} className="h-11 flex-1 gap-2 rounded-xl px-4 transition-transform active:scale-[.97] sm:flex-none">
              <Plus className="h-4 w-4" />
              {t('foodBankPro.addManual')}
            </Button>
            <Button
              variant="outline"
              onClick={handleExportExcel}
              className="h-11 gap-2 rounded-xl px-3 transition-transform active:scale-[.97]"
              title={t('common.exportExcel')}
            >
              <Download className="h-4 w-4" />
              <span className="hidden md:inline">{t('common.exportExcel')}</span>
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              disabled={isImporting}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setImportFile(file);
                  handleImportExcel(file);
                }
              }}
            />
            <Button
              variant="outline"
              disabled={isImporting}
              onClick={() => fileInputRef.current?.click()}
              className="h-11 gap-2 rounded-xl px-3 transition-transform active:scale-[.97]"
              title={t('common.importExcel')}
            >
              <Upload className="h-4 w-4" />
              <span className="hidden md:inline">{isImporting ? t('common.importing') : t('common.importExcel')}</span>
            </Button>
          </div>
        </header>

        {/* Toolbar */}
        <section className="fb-reveal space-y-3 rounded-2xl border border-border/70 bg-card/60 p-3 sm:p-4" style={{ ['--d' as string]: 3 }}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder={t('foodBankPro.searchPlaceholder')}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="h-11 w-full rounded-xl ps-9 pe-9"
                dir="auto"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute end-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={t('foodBankPro.clearFilters')}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <MacroSegmented value={macroFilter} onChange={setMacroFilter} counts={macroCounts} />
            <label className="relative flex h-11 shrink-0 items-center gap-2 rounded-xl border border-border/70 bg-background px-3 text-sm">
              <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
              <span className="sr-only">{t('foodBankPro.sort.label')}</span>
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as SortKey)}
                className="h-full bg-transparent pe-1 text-sm outline-none"
              >
                <option value="name">{t('foodBankPro.sort.name')}</option>
                <option value="protein">{t('foodBankPro.sort.protein')}</option>
                <option value="kcalAsc">{t('foodBankPro.sort.kcalAsc')}</option>
                <option value="recent">{t('foodBankPro.sort.recent')}</option>
              </select>
            </label>
          </div>

          {presentTags.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="hidden shrink-0 text-xs font-medium text-muted-foreground sm:inline">
                {t('foodBankPro.properties')}
              </span>
              <div className="-mx-1 flex flex-1 gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin] sm:flex-wrap sm:overflow-visible sm:pb-0">
                {presentTags.map((tag) => (
                  <PropertyChip
                    key={tag}
                    tag={tag}
                    active={tagFilter.includes(tag)}
                    count={tagCounts.get(tag) ?? 0}
                    onClick={() => toggleTag(tag)}
                  />
                ))}
              </div>
              {filtersActive && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-medium text-primary hover:bg-primary/10"
                >
                  <X className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t('foodBankPro.clearFilters')}</span>
                </button>
              )}
            </div>
          )}
        </section>

        {/* Grid */}
        {loading ? (
          <div className="fb-grid" aria-busy="true">
            {Array.from({ length: 8 }).map((_, i) => (
              <FoodCardSkeleton key={i} index={i} />
            ))}
          </div>
        ) : visibleItems.length > 0 ? (
          <div key={gridKey} className="fb-grid">
            {visibleItems.map((item, index) => (
              <FoodCard
                key={item.id}
                item={item}
                index={index}
                canEdit={canEdit(item)}
                activeTags={tagFilter}
                onToggleTag={toggleTag}
                onEdit={() => startEdit(item)}
                onDelete={() => setPendingDelete(item)}
              />
            ))}
          </div>
        ) : (
          <div className="fb-card flex flex-col items-center justify-center rounded-2xl border border-dashed border-border px-6 py-16 text-center">
            <div className="fb-hero-mark mb-4 grid h-16 w-16 place-items-center rounded-2xl border border-border/70 text-primary">
              <PlateIcon size={30} />
            </div>
            <h2 className="text-lg font-semibold">
              {items.length === 0 ? t('foodBankPro.empty.title') : t('foodBankPro.empty.filtered')}
            </h2>
            <p className="mt-1 max-w-md text-sm text-muted-foreground">
              {items.length === 0 ? t('foodBankPro.empty.body') : t('foodBankPro.empty.filteredBody')}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {items.length === 0 ? (
                <>
                  <Button onClick={() => setLibraryOpen(true)} className="gap-2 rounded-xl">
                    <Library className="h-4 w-4" />
                    {t('foodBankPro.openLibrary')}
                  </Button>
                  <Button variant="outline" onClick={openCreate} className="gap-2 rounded-xl">
                    <Plus className="h-4 w-4" />
                    {t('foodBankPro.addManual')}
                  </Button>
                </>
              ) : (
                <Button variant="outline" onClick={clearFilters} className="gap-2 rounded-xl">
                  <X className="h-4 w-4" />
                  {t('foodBankPro.clearFilters')}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Food library drawer */}
      <FoodLibraryDrawer
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
        importedKeys={importedKeys}
        onImported={(item) => setItems((prev) => [...prev, item])}
      />

      {/* Create / edit dialog */}
      <Dialog
        open={createDialogOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseDialog();
          else setCreateDialogOpen(true);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto border border-border bg-background text-foreground shadow-2xl">
          <DialogHeader>
            <DialogTitle>{editingItem ? t('foodBank.editFoodItem') : t('foodBank.addNewFoodItem')}</DialogTitle>
            <DialogDescription>
              {editingItem ? t('foodBank.editDescription') : t('foodBank.createDescription')}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList>
                <TabsTrigger value="details">{t('common.details')}</TabsTrigger>
                <TabsTrigger value="nutrition">{t('common.nutrition')}</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('foodBank.macroType')} *</Label>
                  <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label={t('foodBank.macroType')}>
                    {MACROS.map((m) => (
                      <button
                        key={m}
                        type="button"
                        role="radio"
                        aria-checked={itemForm.macro_type === m}
                        onClick={() => setItemForm({ ...itemForm, macro_type: m })}
                        className={cn(
                          'flex flex-col items-center gap-1 rounded-xl border px-2 py-3 text-sm font-medium transition-all active:scale-[.97]',
                          itemForm.macro_type === m
                            ? `fb-macro-badge fb-accent-${m} border-transparent shadow-md`
                            : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
                        )}
                      >
                        <IconOf icon={MACRO_ICON[m]} size={22} />
                        {t(`foodBankPro.macro.${m}`)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="name_hebrew">{t('foodBank.foodNameHebrew')} *</Label>
                    <Input
                      id="name_hebrew"
                      placeholder={t('foodBank.foodNameHebrewPlaceholder')}
                      value={itemForm.name_hebrew}
                      onChange={(e) => setItemForm({ ...itemForm, name_hebrew: e.target.value })}
                      dir="rtl"
                      required
                    />
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="name">{t('foodBank.foodName')}</Label>
                    <Input
                      id="name"
                      placeholder={t('foodBank.foodNamePlaceholder')}
                      value={itemForm.name}
                      onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
                      dir="auto"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="image_url">{t('foodBankPro.form.photo')}</Label>
                  <div className="flex items-center gap-3">
                    <FoodPhoto
                      src={itemForm.image_url.startsWith('https://') ? itemForm.image_url : null}
                      alt=""
                      macro={itemForm.macro_type}
                      iconSize={22}
                      className="!aspect-square w-14 shrink-0 rounded-xl"
                    />
                    <Input
                      id="image_url"
                      type="url"
                      inputMode="url"
                      placeholder="https://"
                      value={itemForm.image_url}
                      onChange={(e) => setItemForm({ ...itemForm, image_url: e.target.value })}
                      dir="ltr"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">{t('foodBankPro.form.photoHint')}</p>
                </div>

                <div className="space-y-2">
                  <Label>{t('foodBankPro.form.properties')}</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {MANUAL_TAGS.map((tag) => (
                      <PropertyChip
                        key={tag}
                        tag={tag}
                        active={itemForm.tags.includes(tag)}
                        onClick={() =>
                          setItemForm((f) => ({
                            ...f,
                            tags: f.tags.includes(tag) ? f.tags.filter((x) => x !== tag) : [...f.tags, tag],
                          }))
                        }
                      />
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">{t('foodBankPro.form.propertiesHint')}</p>
                </div>

                <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 px-3 py-2.5">
                  <Label htmlFor="is_public" className="cursor-pointer">
                    {t('foodBankPro.form.isPublic')}
                  </Label>
                  <Switch
                    id="is_public"
                    checked={itemForm.is_public}
                    onCheckedChange={(checked) => setItemForm({ ...itemForm, is_public: checked })}
                  />
                </div>

                {editingItem?.source && (
                  <p className="text-xs text-muted-foreground">
                    {t('foodBankPro.form.source', {
                      source: editingItem.source === 'openfoodfacts' ? 'Open Food Facts' : t('foodBankPro.library.staples'),
                    })}
                  </p>
                )}
              </TabsContent>

              <TabsContent value="nutrition" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="measurement_type">{t('foodBank.measurementType')}</Label>
                    <select
                      id="measurement_type"
                      value={itemForm.measurement_type}
                      onChange={(e) =>
                        setItemForm({ ...itemForm, measurement_type: e.target.value as 'per_100g' | 'per_portion' })
                      }
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                    >
                      <option value="per_100g">{t('foodBankPro.per100g')}</option>
                      <option value="per_portion">{t('foodBankPro.perPortion')}</option>
                    </select>
                  </div>
                  <div className="min-w-0 space-y-2">
                    <Label htmlFor="serving_size">{t('foodBank.servingSize')}</Label>
                    <Input
                      id="serving_size"
                      placeholder={
                        itemForm.measurement_type === 'per_100g' ? '100g' : t('foodBank.servingSizePlaceholderPerPortion')
                      }
                      value={itemForm.serving_size}
                      onChange={(e) => setItemForm({ ...itemForm, serving_size: e.target.value })}
                    />
                  </div>
                  {(
                    [
                      ['calories', t('foodBank.calories'), '165', '1'],
                      ['protein', t('foodBank.protein'), '31', '0.1'],
                      ['carbs', t('foodBank.carbs'), '0', '0.1'],
                      ['fat', t('foodBank.fat'), '3.6', '0.1'],
                      ['fiber', t('foodBankPro.form.fiber'), '0', '0.1'],
                    ] as Array<[keyof ItemFormState, string, string, string]>
                  ).map(([field, label, placeholder, step]) => (
                    <div key={field} className="min-w-0 space-y-2">
                      <Label htmlFor={field}>
                        {label} <span className="text-muted-foreground">({perLabel})</span>
                      </Label>
                      <Input
                        id={field}
                        type="number"
                        min="0"
                        step={step}
                        placeholder={placeholder}
                        value={itemForm[field] as string}
                        onChange={(e) => setItemForm({ ...itemForm, [field]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
              </TabsContent>
            </Tabs>

            <div className="flex gap-3 border-t pt-4">
              <Button type="button" variant="outline" className="flex-1" onClick={handleCloseDialog}>
                {t('foodBank.cancel')}
              </Button>
              <Button type="submit" className="flex-1">
                {editingItem ? t('foodBank.updateFoodItem') : t('foodBank.createFoodItem')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('foodBankPro.deleteTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && t('foodBankPro.deleteBody', { name: displayName(pendingDelete, lang).primary })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('foodBankPro.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {t('foodBankPro.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Excel import review */}
      {duplicateData && (
        <ImportReviewDialog
          open={duplicateDialogOpen}
          rows={duplicateData.rows}
          message={duplicateData.message}
          onClose={() => {
            setDuplicateDialogOpen(false);
            setDuplicateData(null);
            setImportFile(null);
          }}
          onConfirm={handleImportReviewConfirm}
        />
      )}
    </Layout>
  );
};

export default MealBank;
