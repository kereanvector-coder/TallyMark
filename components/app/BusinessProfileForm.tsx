'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Trash2, Upload } from 'lucide-react';
import type {
  BankAccount,
  Business,
  ReceiptTemplateStyle,
  VatMode,
} from '@/lib/database.types';
import { useAppContext } from '@/components/providers/AppProviders';
import { useBusiness } from '@/components/app/AppShell';
import { businessProfileSchema } from '@/lib/validation';
import { koboToNairaString, nairaInputToKobo } from '@/lib/format';
import { DictationMicButton } from '@/components/ui/DictationMicButton';

const BRAND_SWATCHES = [
  { label: 'Emerald', hex: '#0F5132' },
  { label: 'Navy', hex: '#1E3A5F' },
  { label: 'Burgundy', hex: '#6B1D2F' },
  { label: 'Charcoal', hex: '#1F2937' },
  { label: 'Terracotta', hex: '#8B3A2B' },
  { label: 'Cobalt', hex: '#1D4ED8' },
];

export function BusinessProfileForm({
  mode,
  onSaved,
}: {
  mode: 'onboarding' | 'settings';
  onSaved?: (biz: Business) => void;
}) {
  const router = useRouter();
  const { supabase, notify } = useAppContext();
  const { business, logoUrl, userId, userEmail, setBusiness } = useBusiness();

  const [name, setName] = useState(business?.name || '');
  const [phone, setPhone] = useState(business?.phone || '');
  const [email, setEmail] = useState(business?.email || userEmail || '');
  const [address, setAddress] = useState(business?.address || '');
  const [rcNumber, setRcNumber] = useState(business?.rc_number || '');
  const [taxId, setTaxId] = useState(business?.tax_id || '');
  const [brandColor, setBrandColor] = useState(business?.brand_color || '#0F5132');
  const [receiptPrefix, setReceiptPrefix] = useState(business?.receipt_prefix || 'RCT-');
  const [invoicePrefix, setInvoicePrefix] = useState(business?.invoice_prefix || 'INV-');
  const [quotePrefix, setQuotePrefix] = useState(business?.quote_prefix || 'QUO-');
  const [receiptTemplate, setReceiptTemplate] = useState<ReceiptTemplateStyle>(
    business?.receipt_template || 'classic'
  );
  const [vatEnabled, setVatEnabled] = useState<boolean>(business?.vat_enabled ?? false);
  const [vatMode, setVatMode] = useState<VatMode>(business?.vat_mode || 'exclusive');
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>(
    Array.isArray(business?.bank_accounts) ? business.bank_accounts : []
  );
  const [defaultPaymentTerms, setDefaultPaymentTerms] = useState(
    business?.default_payment_terms || ''
  );
  const [defaultInvoiceNotes, setDefaultInvoiceNotes] = useState(
    business?.default_invoice_notes || ''
  );
  const [receiptFooterNote, setReceiptFooterNote] = useState(
    business?.receipt_footer_note || 'Thank you for your patronage.'
  );
  const [openingCash, setOpeningCash] = useState(
    business ? koboToNairaString(business.opening_cash_balance_kobo) : ''
  );
  const [closeReminderTime, setCloseReminderTime] = useState(
    business?.close_day_reminder_time || '19:00'
  );

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(logoUrl);
  const [removeLogo, setRemoveLogo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setErrorMsg('Logo file must be 2 MB or smaller.');
      return;
    }
    setLogoFile(file);
    setRemoveLogo(false);
    setLogoPreview(URL.createObjectURL(file));
  };

  const addBankAccount = () => {
    setBankAccounts((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        bank_name: '',
        account_name: '',
        account_number: '',
      },
    ]);
  };

  const updateBank = (id: string, field: keyof BankAccount, val: string) => {
    setBankAccounts((prev) =>
      prev.map((acc) => (acc.id === id ? { ...acc, [field]: val } : acc))
    );
  };

  const removeBank = (id: string) => {
    setBankAccounts((prev) => prev.filter((acc) => acc.id !== id));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setErrorMsg(null);

    const nonEmptyBanks = bankAccounts.filter(
      (b) => b.bank_name.trim() || b.account_name.trim() || b.account_number.trim()
    );

    const parsed = businessProfileSchema.safeParse({
      name,
      phone: phone || null,
      email: email || null,
      address: address || null,
      rc_number: rcNumber || null,
      tax_id: taxId || null,
      brand_color: brandColor,
      receipt_prefix: receiptPrefix.toUpperCase(),
      invoice_prefix: invoicePrefix.toUpperCase(),
      quote_prefix: quotePrefix.toUpperCase(),
      receipt_template: receiptTemplate,
      receipt_footer_note: receiptFooterNote || null,
      currency: 'NGN',
      vat_enabled: vatEnabled,
      vat_mode: vatMode,
      vat_rate_bps: 750,
      bank_accounts: nonEmptyBanks,
      default_payment_terms: defaultPaymentTerms || null,
      default_invoice_notes: defaultInvoiceNotes || null,
      opening_cash_balance_kobo: nairaInputToKobo(openingCash),
      close_day_reminder_time: closeReminderTime || '19:00',
    });

    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message || 'Please check your business details.');
      return;
    }

    setSaving(true);
    try {
      let savedBusiness: Business;
      const v = parsed.data;

      if (!business) {
        const { data: inserted, error: insertErr } = await supabase
          .from('businesses')
          .insert({
            owner_id: userId,
            ...v,
            onboarding_completed_at: new Date().toISOString(),
          })
          .select('*')
          .single();

        if (insertErr || !inserted) {
          throw new Error(insertErr?.message || 'Could not create business profile.');
        }
        savedBusiness = inserted;
      } else {
        const { data: updated, error: updateErr } = await supabase
          .from('businesses')
          .update({
            ...v,
            logo_path: removeLogo ? null : business.logo_path,
            onboarding_completed_at:
              business.onboarding_completed_at || new Date().toISOString(),
          })
          .eq('id', business.id)
          .select('*')
          .single();

        if (updateErr || !updated) {
          throw new Error(updateErr?.message || 'Could not update business settings.');
        }
        savedBusiness = updated;
      }

      if (logoFile) {
        const ext = (logoFile.name.split('.').pop() || 'png').toLowerCase();
        const path = `${savedBusiness.id}/logo-${Date.now()}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('logos')
          .upload(path, logoFile, { upsert: true });

        if (uploadErr) {
          notify({
            title: 'Business saved, logo upload failed',
            description: uploadErr.message,
            variant: 'error',
          });
        } else {
          const { data: withLogo } = await supabase
            .from('businesses')
            .update({ logo_path: path })
            .eq('id', savedBusiness.id)
            .select('*')
            .single();
          if (withLogo) savedBusiness = withLogo;
          setLogoFile(null);
        }
      }

      setBusiness(savedBusiness);
      notify({
        title: mode === 'onboarding' ? 'Business profile ready' : 'Settings saved',
        variant: 'success',
      });
      onSaved?.(savedBusiness);

      if (mode === 'onboarding') {
        router.replace('/app/receipts/new');
        router.refresh();
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save business details.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {errorMsg && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/50 px-4 py-3 text-sm text-red-900 dark:text-red-200"
        >
          {errorMsg}
        </div>
      )}

      {/* Business Identity */}
      <section className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 sm:p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold">Business Identity</h2>
          <p className="text-xs text-[#57534E] dark:text-[#A8A29E] mt-0.5">
            Printed on every receipt and public verification link.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="w-16 h-16 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] flex items-center justify-center overflow-hidden shrink-0">
            {logoPreview && !removeLogo ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={logoPreview}
                alt="Business logo"
                referrerPolicy="no-referrer"
                className="w-full h-full object-contain p-1.5"
              />
            ) : (
              <span className="text-[11px] font-medium text-[#57534E] dark:text-[#A8A29E]">
                No logo
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#202420] text-sm font-medium cursor-pointer hover:bg-[#F3EFE4] dark:hover:bg-[#2A2E2A]">
              <Upload className="w-4 h-4" />
              <span>Upload Logo</span>
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleLogoSelect}
                className="sr-only"
              />
            </label>
            {logoPreview && !removeLogo && (
              <button
                type="button"
                onClick={() => {
                  setRemoveLogo(true);
                  setLogoFile(null);
                  setLogoPreview(null);
                }}
                className="min-h-[44px] px-3 rounded-xl text-xs font-medium text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
              >
                Remove
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
              Business Name *
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Balogun Fine Textiles"
                className="flex-1 min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
              />
              <DictationMicButton
                label="Dictate business name"
                onTranscript={(t) => setName((prev) => (prev ? `${prev} ${t}` : t))}
              />
            </div>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
              Phone Number
            </span>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+234 803 000 0000"
              className="w-full min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
              Business Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="orders@business.ng"
              className="w-full min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
            />
          </label>

          <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
              Shop / Office Address
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="Shop 12, Wuse Market, Abuja"
                className="flex-1 min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
              />
              <DictationMicButton
                label="Dictate address"
                onTranscript={(t) => setAddress((prev) => (prev ? `${prev} ${t}` : t))}
              />
            </div>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
              CAC RC / BN Number (optional)
            </span>
            <input
              type="text"
              value={rcNumber}
              onChange={(e) => setRcNumber(e.target.value)}
              placeholder="RC 1234567"
              className="w-full min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm font-mono-ledger focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
              Tax ID / TIN (optional)
            </span>
            <input
              type="text"
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder="12345678-0001"
              className="w-full min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm font-mono-ledger focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
            />
          </label>
        </div>
      </section>

      {/* Receipt Branding & Numbering */}
      <section className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 sm:p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold">Receipts, Prefixes &amp; VAT</h2>
          <p className="text-xs text-[#57534E] dark:text-[#A8A29E] mt-0.5">
            Customize your receipt color, template style, and numbering prefixes.
          </p>
        </div>

        <div className="space-y-2">
          <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
            Receipt Accent Color
          </span>
          <div className="flex flex-wrap items-center gap-2.5">
            {BRAND_SWATCHES.map((sw) => (
              <button
                key={sw.hex}
                type="button"
                onClick={() => setBrandColor(sw.hex)}
                aria-label={`Select ${sw.label} accent color`}
                className={`min-h-[44px] px-3 rounded-xl border text-xs font-medium inline-flex items-center gap-2 cursor-pointer ${
                  brandColor.toUpperCase() === sw.hex
                    ? 'border-[#141413] dark:border-[#F4F1EA] bg-[#FAF7F0] dark:bg-[#202420]'
                    : 'border-[#E5DFD2] dark:border-[#2A2E2A]'
                }`}
              >
                <span
                  className="w-3.5 h-3.5 rounded-full shrink-0"
                  style={{ backgroundColor: sw.hex }}
                />
                <span>{sw.label}</span>
              </button>
            ))}
            <input
              type="color"
              value={brandColor}
              onChange={(e) => setBrandColor(e.target.value)}
              aria-label="Custom brand hex color"
              className="w-11 h-11 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-transparent cursor-pointer"
            />
          </div>
        </div>

        <div className="space-y-2">
          <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
            Default Receipt Template
          </span>
          <div className="grid grid-cols-3 gap-2">
            {(['classic', 'modern', 'thermal'] as ReceiptTemplateStyle[]).map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => setReceiptTemplate(style)}
                className={`min-h-[44px] rounded-xl border text-xs sm:text-sm font-medium capitalize cursor-pointer transition-colors ${
                  receiptTemplate === style
                    ? 'border-[#0F5132] bg-[#0F5132]/10 text-[#0F5132] dark:text-[#7CE0AC]'
                    : 'border-[#E5DFD2] dark:border-[#2A2E2A]'
                }`}
              >
                {style === 'thermal' ? '80mm Thermal' : style}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
              Receipt Prefix
            </span>
            <input
              type="text"
              required
              value={receiptPrefix}
              onChange={(e) => setReceiptPrefix(e.target.value.toUpperCase())}
              placeholder="RCT-"
              className="w-full min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm font-mono-ledger uppercase focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
              Invoice Prefix
            </span>
            <input
              type="text"
              required
              value={invoicePrefix}
              onChange={(e) => setInvoicePrefix(e.target.value.toUpperCase())}
              placeholder="INV-"
              className="w-full min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm font-mono-ledger uppercase focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
              Quote Prefix
            </span>
            <input
              type="text"
              required
              value={quotePrefix}
              onChange={(e) => setQuotePrefix(e.target.value.toUpperCase())}
              placeholder="QUO-"
              className="w-full min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm font-mono-ledger uppercase focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
              Currency
            </span>
            <input
              type="text"
              value="NGN (₦)"
              readOnly
              className="w-full min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#F3EFE4] dark:bg-[#202420] px-3.5 text-sm font-mono-ledger text-[#57534E] dark:text-[#A8A29E]"
            />
          </label>
        </div>

        {/* VAT 7.5% Toggle */}
        <div className="pt-2 border-t border-[#E5DFD2] dark:border-[#2A2E2A] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Charge Nigerian VAT (7.5%)</p>
            <p className="text-xs text-[#57534E] dark:text-[#A8A29E]">
              Optional. Off by default unless your business collects VAT.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={vatEnabled}
              onClick={() => setVatEnabled((v) => !v)}
              className={`min-h-[44px] px-4 rounded-xl border text-xs font-semibold cursor-pointer transition-colors ${
                vatEnabled
                  ? 'border-[#0F5132] bg-[#0F5132] text-white'
                  : 'border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210]'
              }`}
            >
              {vatEnabled ? 'VAT On (7.5%)' : 'VAT Off'}
            </button>

            {vatEnabled && (
              <select
                value={vatMode}
                onChange={(e) => setVatMode(e.target.value as VatMode)}
                className="min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3 text-xs font-medium"
              >
                <option value="exclusive">Exclusive (add 7.5%)</option>
                <option value="inclusive">Inclusive (included in price)</option>
              </select>
            )}
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
            Receipt Footer Note
          </span>
          <input
            type="text"
            value={receiptFooterNote}
            onChange={(e) => setReceiptFooterNote(e.target.value)}
            placeholder="Thank you for your patronage."
            className="w-full min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
          />
        </label>
      </section>

      {/* Bank Accounts & Cash Book Defaults */}
      <section className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Bank Accounts &amp; Defaults</h2>
            <p className="text-xs text-[#57534E] dark:text-[#A8A29E] mt-0.5">
              Saved for bank transfers, invoices, and opening cash book balance.
            </p>
          </div>
          <button
            type="button"
            onClick={addBankAccount}
            className="inline-flex items-center gap-1.5 min-h-[42px] px-3.5 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] text-xs font-medium hover:bg-[#FAF7F0] dark:hover:bg-[#202420] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Bank Account</span>
          </button>
        </div>

        {bankAccounts.length > 0 && (
          <div className="space-y-3">
            {bankAccounts.map((acc) => (
              <div
                key={acc.id}
                className="grid grid-cols-1 sm:grid-cols-12 gap-3 p-3.5 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210]"
              >
                <input
                  type="text"
                  value={acc.bank_name}
                  onChange={(e) => updateBank(acc.id, 'bank_name', e.target.value)}
                  placeholder="Bank Name (e.g. GTBank)"
                  className="sm:col-span-4 min-h-[44px] rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] px-3 text-sm"
                />
                <input
                  type="text"
                  value={acc.account_name}
                  onChange={(e) => updateBank(acc.id, 'account_name', e.target.value)}
                  placeholder="Account Name"
                  className="sm:col-span-4 min-h-[44px] rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] px-3 text-sm"
                />
                <div className="sm:col-span-4 flex gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    maxLength={10}
                    value={acc.account_number}
                    onChange={(e) =>
                      updateBank(
                        acc.id,
                        'account_number',
                        e.target.value.replace(/\D/g, '').slice(0, 10)
                      )
                    }
                    placeholder="10-digit NUBAN"
                    className="flex-1 min-h-[44px] rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] px-3 text-sm font-mono-ledger"
                  />
                  <button
                    type="button"
                    onClick={() => removeBank(acc.id)}
                    aria-label="Remove bank account"
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
              Opening Cash Balance (₦ optional)
            </span>
            <input
              type="text"
              inputMode="decimal"
              value={openingCash}
              onChange={(e) => setOpeningCash(e.target.value)}
              placeholder="0.00"
              className="w-full min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm font-mono-ledger focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
              Close-Day Reminder Time (WAT)
            </span>
            <input
              type="time"
              value={closeReminderTime}
              onChange={(e) => setCloseReminderTime(e.target.value)}
              className="w-full min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm font-mono-ledger focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
              Default Payment Terms (optional)
            </span>
            <input
              type="text"
              value={defaultPaymentTerms}
              onChange={(e) => setDefaultPaymentTerms(e.target.value)}
              placeholder="e.g. Payment due within 7 days"
              className="w-full min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
            />
          </label>

          <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
              Default Invoice Notes (optional)
            </span>
            <input
              type="text"
              value={defaultInvoiceNotes}
              onChange={(e) => setDefaultInvoiceNotes(e.target.value)}
              placeholder="e.g. Please quote invoice number on bank transfer."
              className="w-full min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
            />
          </label>
        </div>
      </section>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="w-full sm:w-auto min-h-[48px] px-7 rounded-xl bg-[#0F5132] hover:bg-[#0B3E26] text-white text-sm font-semibold transition-colors disabled:opacity-60 cursor-pointer"
        >
          {saving
            ? 'Saving…'
            : mode === 'onboarding'
              ? 'Save & Issue First Receipt'
              : 'Save Business Settings'}
        </button>
      </div>
    </form>
  );
}
