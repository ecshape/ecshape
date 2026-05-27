import React, { useState, useMemo, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { FileSpreadsheet, AlertTriangle, CheckCircle2, Plus, XCircle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface ImportRowMatch {
  id: number;
  name: string | null;
  name_hebrew: string | null;
  macro_type: string;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  similarity?: number;
}

export interface ImportRowData {
  row_index: number;
  name: string;
  name_hebrew?: string | null;
  macro_type: string;
  calories?: number | null;
  protein?: number | null;
  carbs?: number | null;
  fat?: number | null;
}

export interface ImportPreviewRow {
  row_index: number;
  data: ImportRowData;
  status: 'new' | 'possible_duplicate';
  matches: ImportRowMatch[];
}

export type ImportDecision = 'skip' | 'add' | `replace:${number}`;

interface ImportReviewDialogProps {
  open: boolean;
  rows: ImportPreviewRow[];
  message?: string;
  onClose: () => void;
  onConfirm: (decisions: Record<number, ImportDecision>) => void;
}

function getDefaultDecision(row: ImportPreviewRow): ImportDecision {
  if (row.status === 'new') return 'add';
  if (row.matches.length > 0) return `replace:${row.matches[0].id}`;
  return 'skip';
}

export const ImportReviewDialog: React.FC<ImportReviewDialogProps> = ({
  open,
  rows,
  message,
  onClose,
  onConfirm,
}) => {
  const { t, i18n } = useTranslation();
  const [decisions, setDecisions] = useState<Record<number, ImportDecision>>(() => {
    const initial: Record<number, ImportDecision> = {};
    rows.forEach((r) => {
      initial[r.row_index] = getDefaultDecision(r);
    });
    return initial;
  });

  useEffect(() => {
    const initial: Record<number, ImportDecision> = {};
    rows.forEach((r) => {
      initial[r.row_index] = getDefaultDecision(r);
    });
    setDecisions(initial);
  }, [rows]);

  const summary = useMemo(() => {
    let add = 0;
    let replace = 0;
    let skip = 0;
    Object.values(decisions).forEach((d) => {
      if (d === 'skip') skip++;
      else if (d === 'add') add++;
      else if (d.startsWith('replace:')) replace++;
    });
    return { add, replace, skip };
  }, [decisions]);

  const handleDecision = (rowIndex: number, decision: ImportDecision) => {
    setDecisions((prev) => ({ ...prev, [rowIndex]: decision }));
  };

  const handleConfirm = () => {
    onConfirm(decisions);
  };

  const getMacroLabel = (macroType: string) => {
    switch (macroType) {
      case 'protein':
        return t('meals.protein', 'Protein');
      case 'carb':
        return t('meals.carbs', 'Carbs');
      case 'fat':
        return t('meals.fat', 'Fat');
      default:
        return macroType;
    }
  };

  const isRtl = i18n.language === 'he';

  if (rows.length === 0) {
    return (
      <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5" />
              {t('foodBank.importReviewTitle', 'Review Import')}
            </DialogTitle>
            <DialogDescription>
              {t('foodBank.importReviewNoRows', 'No valid rows to import from the file.')}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end">
            <Button variant="outline" onClick={onClose}>
              {t('common.close', 'Close')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="max-w-5xl max-h-[90vh] flex flex-col gap-4"
        dir={isRtl ? 'rtl' : 'ltr'}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5" />
            {t('foodBank.importReviewTitle', 'Review Import')}
          </DialogTitle>
          <DialogDescription>
            {message ||
              t(
                'foodBank.importReviewDescription',
                'Review each row and choose: Skip, Add as new, or Replace an existing item. Like replacing files in Explorer.'
              )}
          </DialogDescription>
        </DialogHeader>

        <div className="text-sm text-muted-foreground">
          {t('foodBank.importReviewSummary', 'Summary')}: {summary.add} {t('foodBank.importActionAdd', 'Add')},{' '}
          {summary.replace} {t('foodBank.importActionReplace', 'Replace')}, {summary.skip}{' '}
          {t('foodBank.importActionSkip', 'Skip')}
        </div>

        <ScrollArea className="border rounded-md flex-1 min-h-[200px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">{t('foodBank.importReviewRow', 'Row')}</TableHead>
                <TableHead>{t('foodBank.importReviewName', 'Name')}</TableHead>
                <TableHead className="whitespace-nowrap">{t('foodBank.importReviewMacro', 'Macro')}</TableHead>
                <TableHead className="whitespace-nowrap">{t('foodBank.importReviewCalories', 'Cal')}</TableHead>
                <TableHead>{t('foodBank.importReviewStatus', 'Status')}</TableHead>
                <TableHead className="min-w-[220px]">{t('foodBank.importReviewAction', 'Action')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => {
                const d = row.data;
                const current = decisions[row.row_index] ?? getDefaultDecision(row);
                const isReplace = typeof current === 'string' && current.startsWith('replace:');
                const replaceId = isReplace ? parseInt(current.split(':')[1], 10) : null;

                return (
                  <TableRow key={row.row_index}>
                    <TableCell className="font-mono text-muted-foreground">{row.row_index}</TableCell>
                    <TableCell dir="rtl" className="max-w-[180px] truncate">
                      {d.name_hebrew || d.name}
                      {d.name_hebrew && d.name && (
                        <span className="block text-xs text-muted-foreground truncate" dir="ltr">
                          {d.name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>{getMacroLabel(d.macro_type)}</TableCell>
                    <TableCell>{d.calories ?? '—'}</TableCell>
                    <TableCell>
                      {row.status === 'possible_duplicate' ? (
                        <Badge variant="secondary" className="gap-1">
                          <AlertTriangle className="w-3 h-3" />
                          {t('foodBank.importStatusPossibleDuplicate', 'Possible duplicate')}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          {t('foodBank.importStatusNew', 'New')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant={current === 'skip' ? 'default' : 'outline'}
                          onClick={() => handleDecision(row.row_index, 'skip')}
                          className="gap-1"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          {t('foodBank.importActionSkip', 'Skip')}
                        </Button>
                        <Button
                          size="sm"
                          variant={current === 'add' ? 'default' : 'outline'}
                          onClick={() => handleDecision(row.row_index, 'add')}
                          className="gap-1"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          {t('foodBank.importActionAdd', 'Add')}
                        </Button>
                        {row.matches.length > 0 && (
                          <Select
                            value={isReplace && replaceId ? String(replaceId) : ''}
                            onValueChange={(val) => handleDecision(row.row_index, `replace:${val}` as ImportDecision)}
                          >
                            <SelectTrigger className="w-[180px] h-8 text-xs">
                              <RefreshCw className="w-3.5 h-3.5 me-1" />
                              <SelectValue placeholder={t('foodBank.importActionReplaceWith', 'Replace with...')} />
                            </SelectTrigger>
                            <SelectContent>
                              {row.matches.map((m) => (
                                <SelectItem key={m.id} value={String(m.id)}>
                                  {m.name_hebrew || m.name || `#${m.id}`}
                                  {m.similarity != null ? ` (${Math.round(m.similarity * 100)}%)` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>

        <div className="flex justify-end gap-2 pt-2 border-t">
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel', 'Cancel')}
          </Button>
          <Button onClick={handleConfirm} className="gradient-green">
            {t('foodBank.confirmImport', 'Confirm Import')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
