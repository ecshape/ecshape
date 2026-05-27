import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { AlertCircle, CheckCircle2, XCircle, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface DuplicateMatch {
  id: number;
  name: string;
  name_hebrew?: string;
  macro_type: string;
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
}

interface DuplicateItem {
  new_item: {
    row_index: number;
    name: string;
    name_hebrew?: string;
    macro_type: string;
    calories?: number;
    protein?: number;
    carbs?: number;
    fat?: number;
  };
  matches: DuplicateMatch[];
}

interface DuplicateDetectionDialogProps {
  open: boolean;
  duplicates: DuplicateItem[];
  onClose: () => void;
  onConfirm: (decisions: Record<number, 'replace' | 'add' | 'ignore'>) => void;
}

export const DuplicateDetectionDialog: React.FC<DuplicateDetectionDialogProps> = ({
  open,
  duplicates,
  onClose,
  onConfirm
}) => {
  const { t, i18n } = useTranslation();
  const [decisions, setDecisions] = useState<Record<number, 'replace' | 'add' | 'ignore'>>({});

  const handleDecision = (rowIndex: number, decision: 'replace' | 'add' | 'ignore') => {
    setDecisions(prev => ({ ...prev, [rowIndex]: decision }));
  };

  const handleConfirm = () => {
    // Set default decision (ignore) for any duplicates without a decision
    const finalDecisions: Record<number, 'replace' | 'add' | 'ignore'> = {};
    duplicates.forEach(dup => {
      finalDecisions[dup.new_item.row_index] = decisions[dup.new_item.row_index] || 'ignore';
    });
    onConfirm(finalDecisions);
    setDecisions({});
  };

  const handleCancel = () => {
    setDecisions({});
    onClose();
  };

  const getMacroLabel = (macroType: string) => {
    switch (macroType) {
      case 'protein':
        return t('meals.protein');
      case 'carb':
        return t('meals.carbs');
      case 'fat':
        return t('meals.fat');
      default:
        return macroType;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleCancel}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 text-orange-500" />
            {t('foodBank.duplicateItemsFound', 'Duplicate Items Found')}
          </DialogTitle>
          <DialogDescription>
            {t('foodBank.duplicateItemsDescription', 'The following items may already exist in your meal bank. Choose an action for each item.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {duplicates.map((duplicate, index) => {
            const rowIndex = duplicate.new_item.row_index;
            const currentDecision = decisions[rowIndex] || 'ignore';
            const existingMatch = duplicate.matches[0];

            return (
              <Card key={index} className="border-orange-200">
                <CardContent className="p-4">
                  <div className="space-y-4">
                    {/* New Item */}
                    <div className="flex items-start gap-4">
                      <div className="flex-1">
                        <div className="font-semibold text-sm text-muted-foreground mb-2">
                          {t('foodBank.newItem', 'New Item (from Excel)')}
                        </div>
                        <div className="space-y-1">
                          <div className="font-medium" dir="rtl">
                            {duplicate.new_item.name_hebrew || duplicate.new_item.name}
                          </div>
                          {duplicate.new_item.name_hebrew && duplicate.new_item.name && (
                            <div className="text-sm text-muted-foreground" dir="ltr">
                              {duplicate.new_item.name}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground">
                            {getMacroLabel(duplicate.new_item.macro_type)} • {duplicate.new_item.calories || 'N/A'} {t('meals.kcal', 'kcal')}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Existing Match */}
                    {existingMatch && (
                      <div className="flex items-start gap-4 border-t pt-4">
                        <div className="flex-1">
                          <div className="font-semibold text-sm text-muted-foreground mb-2">
                            {t('foodBank.existingItem', 'Existing Item')}
                          </div>
                          <div className="space-y-1">
                            <div className="font-medium" dir="rtl">
                              {existingMatch.name_hebrew || existingMatch.name}
                            </div>
                            {existingMatch.name_hebrew && existingMatch.name && (
                              <div className="text-sm text-muted-foreground" dir="ltr">
                                {existingMatch.name}
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground">
                              {getMacroLabel(existingMatch.macro_type)} • {existingMatch.calories || 'N/A'} {t('meals.kcal', 'kcal')}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-2 pt-2 border-t">
                      <Button
                        size="sm"
                        variant={currentDecision === 'replace' ? 'default' : 'outline'}
                        onClick={() => handleDecision(rowIndex, 'replace')}
                        className="flex-1"
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" />
                        {t('foodBank.replace', 'Replace')}
                      </Button>
                      <Button
                        size="sm"
                        variant={currentDecision === 'add' ? 'default' : 'outline'}
                        onClick={() => handleDecision(rowIndex, 'add')}
                        className="flex-1"
                      >
                        <Plus className="w-4 h-4 mr-2" />
                        {t('foodBank.addAnyway', 'Add Anyway')}
                      </Button>
                      <Button
                        size="sm"
                        variant={currentDecision === 'ignore' ? 'default' : 'outline'}
                        onClick={() => handleDecision(rowIndex, 'ignore')}
                        className="flex-1"
                      >
                        <XCircle className="w-4 h-4 mr-2" />
                        {t('foodBank.ignore', 'Ignore')}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 mt-6 pt-4 border-t">
          <Button variant="outline" onClick={handleCancel}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConfirm} className="gradient-green">
            {t('foodBank.confirmImport', 'Confirm Import')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
