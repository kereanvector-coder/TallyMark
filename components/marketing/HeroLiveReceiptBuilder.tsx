'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { motion, useReducedMotion } from 'motion/react';
import { ArrowRight, Plus, Printer, RotateCcw, Trash2 } from 'lucide-react';
import type { PublicReceiptResponse, ReceiptTemplateStyle } from '@/lib/database.types';
import { amountInWordsNGN, formatNaira, nairaInputToKobo } from '@/lib/format';
import { DictationMicButton } from '@/components/ui/DictationMicButton';
import { TallyMarkGlyph } from '@/components/brand/TallyMarkLogo';
import { trackPublicEvent } from '@/lib/analytics-client';

interface DemoItem {
  id: string;
  description: string;
  quantity: number;
  unitPriceKobo: number;
}

const PRESET_CHIPS: Array<{ description: string; priceKobo: number }> = [
  { description: 'Super Wax Print (6 yds)', priceKobo: 1850000 },
  { description: 'Jollof Tray & Chicken', priceKobo: 1450000 },
  { description: 'Phone Screen Replacement', priceKobo: 2800000 },
  { description: 'Knotless Braids Session', priceKobo: 1600000 },
  { description: 'Dispatch Rider Fee', priceKobo: 350000 },
];

const BRAND_SWATCHES = [
  { name: 'Forest Emerald', hex: '#0F5132' },
  { name: 'Lagos Indigo', hex: '#1E3A8A' },
  { name: 'Terracotta', hex: '#9A3412' },
  { name: 'Charcoal Ink', hex: '#1F2937' },
  { name: 'Deep Plum', hex: '#581C87' },
  { name: 'Warm Brass', hex: '#92400E' },
] as const;

export function HeroLiveReceiptBuilder({ isSignedIn }: { isSignedIn: boolean }) {
  const prefersReducedMotion = useReducedMotion();

  const [items, setItems] = useState<DemoItem[]>([
    {
      id: 'init-1',
      description: 'Super Wax Print (6 yds)',
      quantity: 2,
      unitPriceKobo: 1850000,
    },
  ]);
  const [newDesc, setNewDesc] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [brandColor, setBrandColor] = useState<string>('#0F5132');
  const [template, setTemplate] = useState<ReceiptTemplateStyle>('modern');
  const [serial, setSerial] = useState(148);
  const [printCycle, setPrintCycle] = useState(1);
  const [stampSlammed, setStampSlammed] = useState(true);

  const totalKobo = useMemo(
    () => items.reduce((sum, i) => sum + i.quantity * i.unitPriceKobo, 0),
    [items]
  );

  const triggerStampPrint = (eventName: string) => {
    setPrintCycle((c) => c + 1);
    setStampSlammed(false);
    window.setTimeout(() => setStampSlammed(true), prefersReducedMotion ? 10 : 180);
    trackPublicEvent(eventName);
  };

  const addChipItem = (chip: { description: string; priceKobo: number }) => {
    setItems((prev) => {
      const existing = prev.find((i) => i.description === chip.description);
      if (existing) {
        return prev.map((i) =>
          i.id === existing.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [
        ...prev,
        {
          id: `chip-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          description: chip.description,
          quantity: 1,
          unitPriceKobo: chip.priceKobo,
        },
      ];
    });
    triggerStampPrint('hero_demo_chip_added');
  };

  const handleAddCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const desc = newDesc.trim();
    const priceKobo = nairaInputToKobo(newPrice);
    if (!desc || priceKobo <= 0) return;

    setItems((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        description: desc,
        quantity: 1,
        unitPriceKobo: priceKobo,
      },
    ]);
    setNewDesc('');
    setNewPrice('');
    triggerStampPrint('hero_demo_custom_added');
  };

  const removeItem = (id: string) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((i) => i.id !== id) : prev));
  };

  const handlePrintSlot = () => {
    setSerial((s) => s + 1);
    triggerStampPrint('hero_demo_print_stamped');
  };

  const resetDemo = () => {
    setItems([
      {
        id: 'init-1',
        description: 'Super Wax Print (6 yds)',
        quantity: 2,
        unitPriceKobo: 1850000,
      },
    ]);
    setBrandColor('#0F5132');
    setTemplate('modern');
    triggerStampPrint('hero_demo_reset');
  };

  const previewData: PublicReceiptResponse = {
    receipt: {
      public_id: 'demo-preview',
      receipt_code: `RCT-${String(serial).padStart(5, '0')}`,
      receipt_number: serial,
      receipt_kind: 'sale',
      parent_receipt_code: null,
      parent_public_id: null,
      customer_name: 'Chidi Okafor',
      line_items: items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unit: 'unit',
        unit_price_kobo: i.unitPriceKobo,
        line_total_kobo: i.quantity * i.unitPriceKobo,
      })),
      subtotal_kobo: totalKobo,
      discount_kobo: 0,
      tax_kobo: 0,
      total_kobo: totalKobo,
      amount_paid_kobo: totalKobo,
      balance_due_kobo: 0,
      outstanding_balance_kobo: 0,
      payment_method: 'transfer',
      status: 'issued',
      void_reason: null,
      voided_at: null,
      notes: null,
      sold_by: 'Amina',
      issued_at: '2026-11-19T10:30:00.000Z',
      entry_date: '2026-11-19',
    },
    business: {
      name: 'Balogun Fine Textiles',
      phone: '+234 803 412 8890',
      email: null,
      address: 'Balogun Market Annex, Lagos',
      rc_number: null,
      tax_id: null,
      logo_path: null,
      brand_color: brandColor,
      receipt_template: template,
      receipt_footer_note: 'Thank you for your patronage.',
      currency: 'NGN',
      vat_enabled: false,
    },
  };

  return (
    <div className="space-y-4">
      {/* Mini Interactive Controls Card */}
      <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-xs font-semibold text-[#141413] dark:text-[#F4F1EA]">
              Try issuing a receipt right here
            </p>
            <p className="text-[11px] text-[#57534E] dark:text-[#A8A29E]">
              Tap items, speak or type a price, pick your color — nothing is saved.
            </p>
          </div>
          <button
            type="button"
            onClick={resetDemo}
            aria-label="Reset demo receipt"
            className="inline-flex items-center gap-1 min-h-[34px] px-2.5 rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A] text-[11px] font-medium text-[#57534E] dark:text-[#A8A29E] hover:text-[#141413] dark:hover:text-[#F4F1EA] cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>

        {/* Item Chips */}
        <div className="flex flex-wrap gap-1.5">
          {PRESET_CHIPS.map((chip) => (
            <button
              key={chip.description}
              type="button"
              onClick={() => addChipItem(chip)}
              data-cursor="Stamp"
              className="inline-flex items-center gap-1 min-h-[36px] px-2.5 rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] hover:border-[#0F5132] text-xs font-medium transition-colors cursor-pointer"
            >
              <Plus className="w-3 h-3 text-[#0F5132] dark:text-[#7CE0AC]" />
              <span>{chip.description}</span>
              <span className="font-mono-ledger text-[11px] text-[#57534E] dark:text-[#A8A29E]">
                {formatNaira(chip.priceKobo).replace('.00', '')}
              </span>
            </button>
          ))}
        </div>

        {/* Custom Type or Speak Row */}
        <form onSubmit={handleAddCustom} className="flex flex-col sm:flex-row gap-2">
          <div className="flex-1 flex gap-1.5">
            <input
              type="text"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
              placeholder="Or type / speak item (e.g. Ankara lace)"
              aria-label="Item description"
              className="flex-1 min-h-[42px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
            />
            <DictationMicButton
              label="Dictate demo item"
              onTranscript={(t) => setNewDesc((prev) => (prev ? `${prev} ${t}` : t))}
              className="min-h-[42px] min-w-[42px]"
            />
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              inputMode="decimal"
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              placeholder="₦ Price"
              aria-label="Item price in Naira"
              className="w-28 min-h-[42px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3 text-xs sm:text-sm font-mono-ledger focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
            />
            <button
              type="submit"
              className="min-h-[42px] px-4 rounded-xl bg-[#141413] dark:bg-[#F4F1EA] text-white dark:text-[#141413] text-xs font-semibold hover:opacity-90 cursor-pointer whitespace-nowrap"
            >
              Add
            </button>
          </div>
        </form>

        {/* Brand Color Swatches + Template Morph Switcher */}
        <div className="pt-2 border-t border-[#E5DFD2] dark:border-[#2A2E2A] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-[#57534E] dark:text-[#A8A29E]">
              Brand color
            </span>
            <div className="flex items-center gap-1.5" role="radiogroup" aria-label="Brand color">
              {BRAND_SWATCHES.map((swatch) => {
                const active = brandColor === swatch.hex;
                return (
                  <button
                    key={swatch.hex}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    aria-label={swatch.name}
                    onClick={() => {
                      setBrandColor(swatch.hex);
                      trackPublicEvent('hero_demo_color_changed');
                    }}
                    className={`w-6 h-6 rounded-full cursor-pointer transition-transform ${
                      active ? 'ring-2 ring-offset-2 ring-[#141413] dark:ring-[#F4F1EA] scale-110' : ''
                    }`}
                    style={{ backgroundColor: swatch.hex }}
                  />
                );
              })}
            </div>
          </div>

          <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210]">
            {(['modern', 'classic', 'thermal'] as ReceiptTemplateStyle[]).map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => {
                  setTemplate(style);
                  trackPublicEvent('hero_demo_template_changed');
                }}
                className={`min-h-[32px] px-2.5 rounded-lg text-[11px] font-semibold capitalize transition-colors cursor-pointer ${
                  template === style
                    ? 'bg-white dark:bg-[#181B18] text-[#141413] dark:text-[#F4F1EA] shadow-xs'
                    : 'text-[#57534E] dark:text-[#A8A29E]'
                }`}
              >
                {style === 'thermal' ? 'Compact' : style}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Receipt Slot + Paper Printing Output */}
      <div className="space-y-3">
        {/* Printer Slot Lip */}
        <div className="mx-auto w-[92%] max-w-[500px] h-5 rounded-full bg-[#1C1C1A] dark:bg-[#272A27] border border-[#32322F] flex items-center justify-between px-4 shadow-inner">
          <span className="h-1 w-full rounded-full bg-[#090908]" />
        </div>

        {/* Receipt Paper Card */}
        <motion.div
          key={`${printCycle}-${template}`}
          initial={prefersReducedMotion ? false : { y: -22, opacity: 0.25 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
          data-cursor="Stamp"
          className={`mx-auto -mt-3 overflow-hidden border shadow-md text-[#141413] transition-all ${
            template === 'thermal'
              ? 'max-w-[340px] thermal-paper-bg border-[#D9CFBA] rounded-sm font-mono-ledger'
              : template === 'classic'
                ? 'max-w-[540px] bg-[#FAF7F0] border-[#D4C8AF] rounded-xl'
                : 'max-w-[540px] bg-white border-[#E5DFD2] rounded-2xl'
          }`}
        >
          {template === 'modern' && (
            <div className="h-2.5 w-full transition-colors" style={{ backgroundColor: brandColor }} />
          )}
          {template === 'classic' && (
            <div className="h-1.5 w-full bg-[#B4924A]/60" />
          )}

          <div className={template === 'thermal' ? 'p-4 space-y-3 text-xs' : 'p-5 sm:p-6 space-y-4'}>
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#E5DFD2]">
              <div className="space-y-0.5">
                <p
                  className={
                    template === 'classic'
                      ? 'font-display text-2xl leading-none'
                      : template === 'thermal'
                        ? 'font-sans-ui text-sm font-bold'
                        : 'font-sans-ui text-lg font-bold tracking-tight'
                  }
                >
                  {previewData.business.name}
                </p>
                <p className="text-[11px] text-[#57534E]">{previewData.business.address}</p>
              </div>
              <div className="text-right shrink-0">
                <p
                  className="font-mono-ledger text-[10px] uppercase tracking-[0.12em] font-semibold"
                  style={{ color: brandColor }}
                >
                  Receipt
                </p>
                <p className="font-mono-ledger text-sm font-semibold">
                  {previewData.receipt.receipt_code}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-2 text-xs sm:text-sm"
                >
                  <div className="min-w-0 flex items-center gap-2">
                    {items.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        aria-label={`Remove ${item.description}`}
                        className="text-[#57534E] hover:text-red-700 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <span className="truncate font-medium">
                      {item.quantity}× {item.description}
                    </span>
                  </div>
                  <span className="font-mono-ledger font-semibold shrink-0 tabular-figures">
                    {formatNaira(item.quantity * item.unitPriceKobo)}
                  </span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-dashed border-[#D4C8AF] flex items-end justify-between gap-4">
              <div className="space-y-1 min-w-0">
                <p className="text-[11px] text-[#57534E] leading-snug">
                  {amountInWordsNGN(totalKobo)}
                </p>
                <div className="flex items-center gap-1.5 text-[11px] text-[#57534E]">
                  <TallyMarkGlyph className="w-3.5 h-3.5" color={brandColor} />
                  <span>Transfer · Sold by Amina</span>
                </div>
              </div>

              <div className="text-right shrink-0 space-y-2">
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-[#57534E]">Total Paid</p>
                  <p className="font-mono-ledger text-xl font-semibold tabular-figures">
                    {formatNaira(totalKobo)}
                  </p>
                </div>

                {/* PAID Stamp-Slam */}
                <motion.div
                  initial={
                    prefersReducedMotion ? false : { scale: 1.65, opacity: 0, rotate: -10 }
                  }
                  animate={
                    stampSlammed
                      ? { scale: 1, opacity: 1, rotate: -3 }
                      : { scale: 1.4, opacity: 0, rotate: -8 }
                  }
                  transition={{ type: 'spring', stiffness: 420, damping: 22 }}
                  style={{ color: brandColor, borderColor: brandColor }}
                  className="inline-flex items-center gap-1.5 border-2 rounded-md px-3 py-1 font-mono-ledger text-xs font-semibold tracking-widest uppercase select-none"
                >
                  <TallyMarkGlyph className="w-3.5 h-3.5" color={brandColor} />
                  <span>PAID</span>
                </motion.div>
              </div>
            </div>
          </div>

          {template === 'thermal' && <div className="h-2 receipt-perforated-edge" />}
        </motion.div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 px-1">
          <button
            type="button"
            onClick={handlePrintSlot}
            data-cursor="Stamp"
            className="inline-flex items-center gap-1.5 min-h-[38px] px-3 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] text-xs font-semibold hover:border-[#0F5132] cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5 text-[#0F5132] dark:text-[#7CE0AC]" />
            <span>Re-print &amp; Stamp</span>
          </button>

          <Link
            href={isSignedIn ? '/app' : '/auth/login'}
            onClick={() => trackPublicEvent('hero_make_receipt_yours_clicked')}
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#0F5132] dark:text-[#7CE0AC] hover:underline"
          >
            <span>Make this receipt yours</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
