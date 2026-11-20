'use client';

import React from 'react';
import { Banknote, FilePlus2, HandCoins, ReceiptText, X } from 'lucide-react';

export type NewEntryAction = 'receipt' | 'quick_sale' | 'credit_sale' | 'expense';

export function NewEntryChooserModal({
  onClose,
  onSelect,
}: {
  onClose: () => void;
  onSelect: (action: NewEntryAction) => void;
}) {
  const options: Array<{
    action: NewEntryAction;
    title: string;
    subtitle: string;
    icon: React.ComponentType<{ className?: string }>;
    accent: string;
  }> = [
    {
      action: 'receipt',
      title: 'Issue Official Receipt',
      subtitle: 'Line items, customer, PDF, WhatsApp link & QR code',
      icon: ReceiptText,
      accent: 'text-[#0F5132] dark:text-[#7CE0AC]',
    },
    {
      action: 'quick_sale',
      title: 'Quick Sale (No Receipt)',
      subtitle: 'Log money received in 5 seconds; issue receipt later if needed',
      icon: Banknote,
      accent: 'text-[#0F5132] dark:text-[#7CE0AC]',
    },
    {
      action: 'credit_sale',
      title: 'Quick Credit Sale ("Borrowed")',
      subtitle: 'Record goods taken on credit; adds to Debtors',
      icon: HandCoins,
      accent: 'text-amber-700 dark:text-amber-400',
    },
    {
      action: 'expense',
      title: 'Record Expense',
      subtitle: 'Money out for stock, rent, fuel, salaries or bills',
      icon: FilePlus2,
      accent: 'text-red-700 dark:text-red-400',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="chooser-title"
    >
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 sm:p-6 space-y-4 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="chooser-title" className="font-display text-2xl">
              Record New Entry
            </h2>
            <p className="text-xs text-[#57534E] dark:text-[#A8A29E] mt-0.5">
              Choose what you want to write in your book.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#57534E] hover:bg-[#FAF7F0] dark:hover:bg-[#202420] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-2.5">
          {options.map((opt) => {
            const Icon = opt.icon;
            return (
              <button
                key={opt.action}
                type="button"
                onClick={() => onSelect(opt.action)}
                className="w-full min-h-[64px] p-4 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] hover:border-[#0F5132] dark:hover:border-[#7CE0AC] text-left flex items-center gap-3.5 transition-colors cursor-pointer"
              >
                <div className="w-10 h-10 rounded-xl bg-white dark:bg-[#181B18] border border-[#E5DFD2] dark:border-[#2A2E2A] flex items-center justify-center shrink-0">
                  <Icon className={`w-5 h-5 ${opt.accent}`} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{opt.title}</p>
                  <p className="text-xs text-[#57534E] dark:text-[#A8A29E] mt-0.5">
                    {opt.subtitle}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
