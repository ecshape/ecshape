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
import { ArrowUpDown, Download, LayoutTemplate, Library, Plus, Search, Upload, X } from 'lucide-react';
import { ActionBtn, PageTitle } from '@/features/trainer/ui';
import { InfoTip } from '@/components/ui/info-tip';
import { TemplatesSheet } from '@/features/trainer/TemplatesSheet';
import { FoodFormSheet, isStorablePhoto } from '../components/foodbank/FoodFormSheet';
import { FoodDetailSheet } from '../components/foodbank/FoodDetailSheet';
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
import { PortalSelect } from '@/components/ui/portal-select';

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
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<MealBankItem | null>(null);
  const [saving, setSaving] = useState(false);

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
    if (imageUrl && !isStorablePhoto(imageUrl)) {
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

    setSaving(true);
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
    } finally {
      setSaving(false);
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
        {/* Header (#27): same page title as the rest of the portal, no icon */}
        <PageTitle
          className="!mb-0"
          eyebrow={
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              {loading ? t('foodBankPro.eyebrow') : t('foodBankPro.countFoods', { count: stats.total })}
              {!loading && <span className="text-muted-foreground">· {t('foodBankPro.countPhotos', { count: stats.photos })}</span>}
              <InfoTip>{t('banks.food.ctaScale')}</InfoTip>
            </span>
          }
          title={t('foodBankPro.title')}
          lead={t('foodBankPro.subtitle')}
          actions={
            <>
              <button type="button" onClick={() => setLibraryOpen(true)} className="tp-btn tp-btn--primary tp-btn--sm tp-press max-sm:flex-1">
                <Library className="h-4 w-4" />
                {t('foodBankPro.openLibrary')}
              </button>
              <ActionBtn icon={Plus} label={t('foodBankPro.addManual')} onClick={openCreate} />
              <ActionBtn icon={LayoutTemplate} label={t('tt.tpl.mealButton')} onClick={() => setTemplatesOpen(true)} />
              <ActionBtn icon={Download} label={t('common.exportExcel')} onClick={handleExportExcel} compact />
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
              <ActionBtn
                icon={Upload}
                label={isImporting ? t('common.importing') : t('common.importExcel')}
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                compact
              />
            </>
          }
        />
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
            <PortalSelect
              className="shrink-0"
              icon={ArrowUpDown}
              label={t('foodBankPro.sort.label')}
              value={sortKey}
              onChange={(v) => setSortKey(v as SortKey)}
              align="end"
              options={(['name', 'protein', 'kcalAsc', 'recent'] as const).map((k) => ({ value: k, label: t(`foodBankPro.sort.${k}`) }))}
            />
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
                onOpen={() => setDetailItem(item)}
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

      {/* Create / edit (#25) */}
      <FoodFormSheet
        open={createDialogOpen}
        editing={editingItem}
        form={itemForm}
        setForm={setItemForm}
        onSubmit={handleSubmit}
        onClose={handleCloseDialog}
        saving={saving}
      />

      {/* Detail (#16) */}
      <FoodDetailSheet
        item={detailItem}
        canEdit={!!detailItem && canEdit(detailItem)}
        onClose={() => setDetailItem(null)}
        onEdit={(item) => { setDetailItem(null); startEdit(item); }}
        onDelete={(item) => { setDetailItem(null); setPendingDelete(item); }}
      />

      <TemplatesSheet open={templatesOpen} onOpenChange={setTemplatesOpen} initialKind="meal" />
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
