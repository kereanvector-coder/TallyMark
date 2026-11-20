'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Eye, EyeOff, Plus, RotateCcw, Trash2 } from 'lucide-react';
import type {
  Customer,
  Item,
  PaymentMethod,
  PublicReceiptResponse,
  Receipt,
  ReceiptTemplateStyle,
} from '@/lib/database.types';
import { useAppContext } from '@/components/providers/AppProviders';
import { useBusiness } from '@/components/app/AppShell';
import {
  formatNaira,
  koboToNairaString,
  nairaInputToKobo,
  todayInLagosDate,
} from '@/lib/format';
import { issueReceiptInputSchema } from '@/lib/validation';
import { DictationMicButton } from '@/components/ui/DictationMicButton';
import { ReceiptTemplateRenderer } from '@/components/receipts/ReceiptTemplateRenderer';

interface DraftLineItem {
  key: string;
  itemId: string | null;
  description: string;
  quantity: string;
  unit: string;
  unitPriceNaira: string;
  discountNaira: string;
}

interface ReceiptDraftState {
  customerId: string | null;
  customerName: string;
  customerPhone: string;
  lineItems: DraftLineItem[];
  receiptDiscountNaira: string;
  paymentMethod: PaymentMethod;
  partPaymentEnabled: boolean;
  amountPaidNaira: string;
  dueDate: string;
  notes: string;
  soldBy: string;
  receiptDate: string;
}

function emptyLine(): DraftLineItem {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    itemId: null,
    description: '',
    quantity: '1',
    unit: 'unit',
    unitPriceNaira: '',
    discountNaira: '',
  };
}

function defaultDraft(): ReceiptDraftState {
  return {
    customerId: null,
    customerName: '',
    customerPhone: '',
    lineItems: [emptyLine()],
    receiptDiscountNaira: '',
    paymentMethod: 'cash',
    partPaymentEnabled: false,
    amountPaidNaira: '',
    dueDate: '',
    notes: '',
    soldBy: '',
    receiptDate: todayInLagosDate(),
  };
}

export function NewReceiptBuilder() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const duplicateId = searchParams.get('duplicate');
  const fromEntryId = searchParams.get('fromEntry');

  const { supabase, notify } = useAppContext();
  const { business, logoUrl } = useBusiness();

  const [draft, setDraft] = useState<ReceiptDraftState>(defaultDraft);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [activeItemRowKey, setActiveItemRowKey] = useState<string | null>(null);
  const [showCustomerSuggest, setShowCustomerSuggest] = useState(false);
  const [saveNewCustomer, setSaveNewCustomer] = useState(false);
  const [previewTemplateOverride, setPreviewTemplateOverride] =
    useState<ReceiptTemplateStyle | null>(null);
  const previewTemplate: ReceiptTemplateStyle =
    previewTemplateOverride ?? business?.receipt_template ?? 'classic';
  const [mobileShowPreview, setMobileShowPreview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);

  const draftStorageKey = business ? `tallymark:receipt_draft:${business.id}` : null;

  // Load saved customers & items for autosuggest
  useEffect(() => {
    if (!supabase || !business) return;
    let active = true;
    Promise.all([
      supabase
        .from('customers')
        .select('*')
        .eq('business_id', business.id)
        .order('name', { ascending: true }),
      supabase
        .from('items')
        .select('*')
        .eq('business_id', business.id)
        .eq('is_active', true)
        .order('name', { ascending: true }),
    ]).then(([custRes, itemRes]) => {
      if (!active) return;
      if (custRes.data) setCustomers(custRes.data);
      if (itemRes.data) setItems(itemRes.data);
    });
    return () => {
      active = false;
    };
  }, [supabase, business]);

  // Duplicate existing receipt, convert Quick Sale (?fromEntry=), OR restore persisted local draft
  useEffect(() => {
    if (!business) return;

    if (fromEntryId && supabase) {
      supabase
        .from('ledger_entries')
        .select('*')
        .eq('id', fromEntryId)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) return;
          setDraft({
            customerId: data.customer_id,
            customerName: '',
            customerPhone: '',
            lineItems: [
              {
                key: `qs-${Date.now()}`,
                itemId: null,
                description: data.description || 'Goods / Service',
                quantity: '1',
                unit: 'unit',
                unitPriceNaira: koboToNairaString(data.amount_kobo),
                discountNaira: '',
              },
            ],
            receiptDiscountNaira: '',
            paymentMethod: data.payment_method === 'credit' ? 'cash' : data.payment_method,
            partPaymentEnabled: false,
            amountPaidNaira: '',
            dueDate: '',
            notes: '',
            soldBy: data.sold_by || '',
            receiptDate: data.entry_date,
          });
        });
      return;
    }

    if (duplicateId && supabase) {
      supabase
        .from('receipts')
        .select('*')
        .eq('id', duplicateId)
        .maybeSingle()
        .then(({ data }) => {
          if (!data) return;
          setDraft({
            customerId: data.customer_id,
            customerName: data.customer_name === 'Walk-in Customer' ? '' : data.customer_name,
            customerPhone: data.customer_phone || '',
            lineItems: data.line_items.map((li, idx) => ({
              key: `dup-${idx}-${Date.now()}`,
              itemId: li.item_id ?? null,
              description: li.description,
              quantity: String(li.quantity),
              unit: li.unit || 'unit',
              unitPriceNaira: koboToNairaString(li.unit_price_kobo),
              discountNaira: li.discount_kobo ? koboToNairaString(li.discount_kobo) : '',
            })),
            receiptDiscountNaira: data.discount_kobo
              ? koboToNairaString(data.discount_kobo)
              : '',
            paymentMethod: data.payment_method === 'credit' ? 'cash' : data.payment_method,
            partPaymentEnabled: false,
            amountPaidNaira: '',
            dueDate: '',
            notes: data.notes || '',
            soldBy: data.sold_by || '',
            receiptDate: todayInLagosDate(),
          });
        });
      return;
    }

    if (!draftStorageKey) return;
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      try {
        const saved = window.localStorage.getItem(draftStorageKey);
        if (saved) {
          const parsed = JSON.parse(saved) as Partial<ReceiptDraftState>;
          if (parsed && Array.isArray(parsed.lineItems) && parsed.lineItems.length > 0) {
            setDraft({ ...defaultDraft(), ...parsed });
            setDraftRestored(true);
          }
        }
      } catch {
        // ignore corrupted draft
      }
    });
    return () => {
      active = false;
    };
  }, [business, duplicateId, fromEntryId, draftStorageKey, supabase]);

  // Persist draft locally on every edit
  useEffect(() => {
    if (!draftStorageKey || duplicateId || fromEntryId) return;
    try {
      window.localStorage.setItem(draftStorageKey, JSON.stringify(draft));
    } catch {
      // ignore storage quota errors
    }
  }, [draft, draftStorageKey, duplicateId, fromEntryId]);

  const computed = useMemo(() => {
    const cleanItems = draft.lineItems.map((row) => {
      const qty = Number(row.quantity) || 0;
      const unitPriceKobo = nairaInputToKobo(row.unitPriceNaira);
      const itemDiscountKobo = nairaInputToKobo(row.discountNaira);
      const gross = Math.round(qty * unitPriceKobo);
      const lineTotalKobo = Math.max(0, gross - itemDiscountKobo);
      return {
        item_id: row.itemId,
        description: row.description.trim() || 'Item',
        quantity: qty > 0 ? qty : 0,
        unit: row.unit.trim() || 'unit',
        unit_price_kobo: unitPriceKobo,
        discount_kobo: itemDiscountKobo,
        line_total_kobo: lineTotalKobo,
      };
    });

    const subtotalKobo = cleanItems.reduce((acc, i) => acc + i.line_total_kobo, 0);
    const receiptDiscountKobo = Math.min(
      subtotalKobo,
      nairaInputToKobo(draft.receiptDiscountNaira)
    );
    const taxableKobo = Math.max(0, subtotalKobo - receiptDiscountKobo);

    let taxKobo = 0;
    if (business?.vat_enabled && business.vat_mode === 'exclusive') {
      taxKobo = Math.round((taxableKobo * (business.vat_rate_bps || 750)) / 10000);
    }

    const totalKobo = taxableKobo + taxKobo;
    const amountPaidKobo = draft.partPaymentEnabled
      ? Math.min(totalKobo, nairaInputToKobo(draft.amountPaidNaira))
      : totalKobo;
    const balanceDueKobo = Math.max(0, totalKobo - amountPaidKobo);

    return {
      cleanItems,
      subtotalKobo,
      discountKobo: receiptDiscountKobo,
      taxKobo,
      totalKobo,
      amountPaidKobo,
      balanceDueKobo,
    };
  }, [draft, business]);

  const filteredCustomers = useMemo(() => {
    const q = draft.customerName.trim().toLowerCase();
    if (!q) return customers.slice(0, 6);
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.phone && c.phone.toLowerCase().includes(q))
      )
      .slice(0, 6);
  }, [customers, draft.customerName]);

  const getFilteredItems = (query: string) => {
    const q = query.trim().toLowerCase();
    if (!q) return items.slice(0, 6);
    return items.filter((i) => i.name.toLowerCase().includes(q)).slice(0, 6);
  };

  const updateLine = (key: string, patch: Partial<DraftLineItem>) => {
    setDraft((prev) => ({
      ...prev,
      lineItems: prev.lineItems.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    }));
  };

  const addLine = () => {
    setDraft((prev) => ({
      ...prev,
      lineItems: [...prev.lineItems, emptyLine()],
    }));
  };

  const removeLine = (key: string) => {
    setDraft((prev) => {
      if (prev.lineItems.length <= 1) return prev;
      return {
        ...prev,
        lineItems: prev.lineItems.filter((r) => r.key !== key),
      };
    });
  };

  const clearDraft = () => {
    const fresh = defaultDraft();
    setDraft(fresh);
    setDraftRestored(false);
    if (draftStorageKey) {
      window.localStorage.removeItem(draftStorageKey);
    }
  };

  const livePreviewData: PublicReceiptResponse | null = useMemo(() => {
    if (!business) return null;
    const prefix = business.receipt_prefix || 'RCT-';
    const previewCode = prefix.endsWith('-') ? `${prefix}PREVIEW` : `${prefix}-PREVIEW`;
    return {
      receipt: {
        public_id: 'live-preview-placeholder',
        receipt_code: previewCode,
        receipt_number: 1,
        receipt_kind: 'sale',
        parent_receipt_code: null,
        parent_public_id: null,
        customer_name: draft.customerName.trim() || 'Walk-in Customer',
        line_items: computed.cleanItems,
        subtotal_kobo: computed.subtotalKobo,
        discount_kobo: computed.discountKobo,
        tax_kobo: computed.taxKobo,
        total_kobo: computed.totalKobo,
        amount_paid_kobo: computed.amountPaidKobo,
        balance_due_kobo: computed.balanceDueKobo,
        outstanding_balance_kobo: computed.balanceDueKobo,
        payment_method: draft.paymentMethod,
        status: 'issued',
        void_reason: null,
        voided_at: null,
        notes:
          draft.notes.trim() ||
          (business.vat_enabled && business.vat_mode === 'inclusive'
            ? 'Prices include 7.5% VAT.'
            : null),
        sold_by: draft.soldBy.trim() || null,
        issued_at: new Date().toISOString(),
        entry_date: draft.receiptDate || todayInLagosDate(),
      },
      business: {
        name: business.name,
        phone: business.phone,
        email: business.email,
        address: business.address,
        rc_number: business.rc_number,
        tax_id: business.tax_id,
        logo_path: business.logo_path,
        brand_color: business.brand_color,
        receipt_template: previewTemplate,
        receipt_footer_note: business.receipt_footer_note,
        currency: business.currency,
        vat_enabled: business.vat_enabled,
      },
    };
  }, [business, draft, computed, previewTemplate]);

  const handleIssueReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !business) return;
    setErrorMsg(null);

    const payloadItems = draft.lineItems.map((row) => ({
      item_id: row.itemId,
      description: row.description.trim(),
      quantity: Number(row.quantity) || 0,
      unit: row.unit.trim() || 'unit',
      unit_price_kobo: nairaInputToKobo(row.unitPriceNaira),
      discount_kobo: nairaInputToKobo(row.discountNaira),
    }));

    const parsed = issueReceiptInputSchema.safeParse({
      business_id: business.id,
      customer_id: draft.customerId,
      customer_name: draft.customerName.trim() || 'Walk-in Customer',
      customer_phone: draft.customerPhone.trim() || null,
      line_items: payloadItems,
      discount_kobo: computed.discountKobo,
      tax_kobo: computed.taxKobo,
      amount_paid_kobo: computed.amountPaidKobo,
      payment_method: draft.paymentMethod,
      notes: draft.notes.trim() || null,
      sold_by: draft.soldBy.trim() || null,
      due_date: computed.balanceDueKobo > 0 && draft.dueDate ? draft.dueDate : null,
      source: 'manual',
    });

    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message || 'Check your receipt entries.');
      return;
    }

    if (computed.totalKobo <= 0) {
      setErrorMsg('Receipt total must be greater than ₦0.00.');
      return;
    }

    setSubmitting(true);
    try {
      let resolvedCustomerId = parsed.data.customer_id ?? null;

      if (
        !resolvedCustomerId &&
        saveNewCustomer &&
        draft.customerName.trim() &&
        draft.customerName.trim() !== 'Walk-in Customer'
      ) {
        const { data: createdCust } = await supabase
          .from('customers')
          .insert({
            business_id: business.id,
            name: draft.customerName.trim(),
            phone: draft.customerPhone.trim() || null,
          })
          .select('id')
          .single();
        if (createdCust?.id) {
          resolvedCustomerId = createdCust.id;
        }
      }

      // Build issued_at in Africa/Lagos if user picked a different date, else now()
      const todayLagos = todayInLagosDate();
      const issuedAt =
        draft.receiptDate && draft.receiptDate !== todayLagos
          ? `${draft.receiptDate}T12:00:00+01:00`
          : null;

      const vatInclusiveNote =
        business.vat_enabled && business.vat_mode === 'inclusive'
          ? 'Prices include 7.5% VAT.'
          : '';
      const combinedNotes = [parsed.data.notes, vatInclusiveNote].filter(Boolean).join(' · ') || null;

      const { data: issued, error } = fromEntryId
        ? await supabase.rpc('issue_receipt_for_quick_sale', {
            p_ledger_entry_id: fromEntryId,
            p_line_items: parsed.data.line_items,
            p_customer_id: resolvedCustomerId,
            p_customer_name: parsed.data.customer_name,
            p_customer_phone: parsed.data.customer_phone ?? null,
            p_discount_kobo: parsed.data.discount_kobo,
            p_tax_kobo: parsed.data.tax_kobo,
            p_amount_paid_kobo: parsed.data.amount_paid_kobo,
            p_payment_method: parsed.data.payment_method,
            p_notes: combinedNotes,
            p_sold_by: parsed.data.sold_by ?? null,
            p_due_date: parsed.data.due_date ?? null,
          })
        : await supabase.rpc('issue_receipt', {
            p_business_id: business.id,
            p_line_items: parsed.data.line_items,
            p_customer_id: resolvedCustomerId,
            p_customer_name: parsed.data.customer_name,
            p_customer_phone: parsed.data.customer_phone ?? null,
            p_discount_kobo: parsed.data.discount_kobo,
            p_tax_kobo: parsed.data.tax_kobo,
            p_amount_paid_kobo: parsed.data.amount_paid_kobo,
            p_payment_method: parsed.data.payment_method,
            p_notes: combinedNotes,
            p_sold_by: parsed.data.sold_by ?? null,
            p_source: 'manual',
            p_due_date: parsed.data.due_date ?? null,
            p_issued_at: issuedAt,
          });

      if (error || !issued) {
        throw new Error(error?.message || 'Could not issue receipt.');
      }

      if (draftStorageKey && !fromEntryId) {
        window.localStorage.removeItem(draftStorageKey);
      }

      notify({
        title: `Receipt ${issued.receipt_code} issued`,
        description: fromEntryId
          ? 'Linked to your quick sale without duplicating it in your Cash Book.'
          : `${formatNaira(issued.total_kobo)} recorded in your ledger.`,
        variant: 'success',
      });

      router.push(`/app/receipts/${issued.id}?issued=1`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to issue receipt.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!business) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl">
            {fromEntryId ? 'Issue Receipt for Quick Sale' : 'New Receipt'}
          </h1>
          <p className="text-xs sm:text-sm text-[#57534E] dark:text-[#A8A29E]">
            {fromEntryId
              ? 'Converts your quick sale into an official sequential receipt without double-counting.'
              : draftRestored
                ? 'Local draft restored automatically.'
                : 'Draft saves automatically on this device.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMobileShowPreview((p) => !p)}
            className="lg:hidden inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] text-xs font-semibold cursor-pointer"
          >
            {mobileShowPreview ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            <span>{mobileShowPreview ? 'Edit Form' : 'Live Preview'}</span>
          </button>

          <button
            type="button"
            onClick={clearDraft}
            className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] text-xs font-medium text-[#57534E] dark:text-[#A8A29E] hover:text-[#141413] dark:hover:text-[#F4F1EA] cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/50 px-4 py-3 text-sm text-red-900 dark:text-red-200"
        >
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Form Column */}
        <form
          onSubmit={handleIssueReceipt}
          className={`lg:col-span-7 space-y-5 ${mobileShowPreview ? 'hidden lg:block' : 'block'}`}
        >
          {/* Customer */}
          <section className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Customer (optional)</h2>
              <span className="text-xs text-[#57534E] dark:text-[#A8A29E]">
                Leave blank for walk-in
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="relative">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={draft.customerName}
                    onFocus={() => setShowCustomerSuggest(true)}
                    onBlur={() => setTimeout(() => setShowCustomerSuggest(false), 180)}
                    onChange={(e) =>
                      setDraft((p) => ({
                        ...p,
                        customerId: null,
                        customerName: e.target.value,
                      }))
                    }
                    placeholder="Customer name"
                    className="flex-1 min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
                  />
                  <DictationMicButton
                    label="Dictate customer name"
                    onTranscript={(t) =>
                      setDraft((p) => ({
                        ...p,
                        customerId: null,
                        customerName: p.customerName ? `${p.customerName} ${t}` : t,
                      }))
                    }
                  />
                </div>

                {showCustomerSuggest && filteredCustomers.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] shadow-lg overflow-hidden">
                    {filteredCustomers.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onMouseDown={() => {
                          setDraft((p) => ({
                            ...p,
                            customerId: c.id,
                            customerName: c.name,
                            customerPhone: c.phone || '',
                          }));
                          setShowCustomerSuggest(false);
                        }}
                        className="w-full min-h-[44px] px-3.5 py-2 text-left text-sm hover:bg-[#FAF7F0] dark:hover:bg-[#202420] flex items-center justify-between border-b last:border-b-0 border-[#E5DFD2] dark:border-[#2A2E2A] cursor-pointer"
                      >
                        <span className="font-medium">{c.name}</span>
                        {c.phone && (
                          <span className="font-mono-ledger text-xs text-[#57534E] dark:text-[#A8A29E]">
                            {c.phone}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <input
                type="tel"
                inputMode="tel"
                value={draft.customerPhone}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, customerPhone: e.target.value }))
                }
                placeholder="WhatsApp / phone (optional)"
                className="w-full min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm font-mono-ledger focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
              />
            </div>

            {!draft.customerId && draft.customerName.trim().length > 1 && (
              <label className="inline-flex items-center gap-2 text-xs text-[#57534E] dark:text-[#A8A29E] cursor-pointer">
                <input
                  type="checkbox"
                  checked={saveNewCustomer}
                  onChange={(e) => setSaveNewCustomer(e.target.checked)}
                  className="w-4 h-4 rounded accent-[#0F5132]"
                />
                <span>Save customer for quick autosuggest next time</span>
              </label>
            )}
          </section>

          {/* Line Items */}
          <section className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-4 sm:p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Items Sold</h2>
              <button
                type="button"
                onClick={addLine}
                className="inline-flex items-center gap-1.5 min-h-[40px] px-3 rounded-xl bg-[#FAF7F0] dark:bg-[#202420] border border-[#E5DFD2] dark:border-[#2A2E2A] text-xs font-semibold hover:border-[#0F5132] cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Add Item</span>
              </button>
            </div>

            <div className="space-y-3">
              {draft.lineItems.map((row, index) => {
                const suggestions =
                  activeItemRowKey === row.key ? getFilteredItems(row.description) : [];
                const qty = Number(row.quantity) || 0;
                const price = nairaInputToKobo(row.unitPriceNaira);
                const disc = nairaInputToKobo(row.discountNaira);
                const rowTotal = Math.max(0, Math.round(qty * price) - disc);

                return (
                  <div
                    key={row.key}
                    className="rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] p-3.5 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono-ledger text-[11px] font-semibold text-[#57534E] dark:text-[#A8A29E]">
                        ITEM {index + 1}
                      </span>
                      <div className="flex items-center gap-3">
                        <span className="font-mono-ledger text-sm font-semibold">
                          {formatNaira(rowTotal)}
                        </span>
                        {draft.lineItems.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeLine(row.key)}
                            aria-label={`Remove item ${index + 1}`}
                            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="relative flex gap-2">
                      <input
                        type="text"
                        required
                        value={row.description}
                        onFocus={() => setActiveItemRowKey(row.key)}
                        onBlur={() => setTimeout(() => setActiveItemRowKey(null), 180)}
                        onChange={(e) =>
                          updateLine(row.key, {
                            itemId: null,
                            description: e.target.value,
                          })
                        }
                        placeholder="Item or service description"
                        className="flex-1 min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
                      />
                      <DictationMicButton
                        label={`Dictate item ${index + 1} description`}
                        onTranscript={(t) =>
                          updateLine(row.key, {
                            itemId: null,
                            description: row.description ? `${row.description} ${t}` : t,
                          })
                        }
                      />

                      {suggestions.length > 0 && (
                        <div className="absolute left-0 right-12 top-full mt-1 z-20 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] shadow-lg overflow-hidden">
                          {suggestions.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onMouseDown={() => {
                                updateLine(row.key, {
                                  itemId: item.id,
                                  description: item.name,
                                  unit: item.unit,
                                  unitPriceNaira: koboToNairaString(item.default_price_kobo),
                                });
                                setActiveItemRowKey(null);
                              }}
                              className="w-full min-h-[44px] px-3.5 py-2 text-left text-sm hover:bg-[#FAF7F0] dark:hover:bg-[#202420] flex items-center justify-between border-b last:border-b-0 border-[#E5DFD2] dark:border-[#2A2E2A] cursor-pointer"
                            >
                              <span className="font-medium">{item.name}</span>
                              <span className="font-mono-ledger text-xs text-[#57534E] dark:text-[#A8A29E]">
                                {formatNaira(item.default_price_kobo)} / {item.unit}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2.5">
                      <label className="block space-y-1">
                        <span className="text-[11px] text-[#57534E] dark:text-[#A8A29E]">Qty</span>
                        <input
                          type="text"
                          inputMode="decimal"
                          required
                          value={row.quantity}
                          onChange={(e) => updateLine(row.key, { quantity: e.target.value })}
                          className="w-full min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] px-3 text-sm font-mono-ledger focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
                        />
                      </label>

                      <label className="block space-y-1">
                        <span className="text-[11px] text-[#57534E] dark:text-[#A8A29E]">
                          Unit Price (₦)
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          required
                          value={row.unitPriceNaira}
                          onChange={(e) =>
                            updateLine(row.key, { unitPriceNaira: e.target.value })
                          }
                          placeholder="0.00"
                          className="w-full min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] px-3 text-sm font-mono-ledger focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
                        />
                      </label>

                      <label className="block space-y-1">
                        <span className="text-[11px] text-[#57534E] dark:text-[#A8A29E]">
                          Item Discount (₦)
                        </span>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={row.discountNaira}
                          onChange={(e) =>
                            updateLine(row.key, { discountNaira: e.target.value })
                          }
                          placeholder="0"
                          className="w-full min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] px-3 text-sm font-mono-ledger focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Payment & Totals */}
          <section className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-4 sm:p-5 space-y-5">
            <div className="space-y-2">
              <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                Payment Method
              </span>
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                {(
                  [
                    ['cash', 'Cash'],
                    ['transfer', 'Transfer'],
                    ['pos', 'POS'],
                    ['card', 'Card'],
                    ['other', 'Other'],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDraft((p) => ({ ...p, paymentMethod: value }))}
                    className={`min-h-[46px] rounded-xl border text-xs sm:text-sm font-semibold transition-colors cursor-pointer ${
                      draft.paymentMethod === value
                        ? 'border-[#0F5132] bg-[#0F5132] text-white'
                        : 'border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                  Overall Discount (₦ optional)
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={draft.receiptDiscountNaira}
                  onChange={(e) =>
                    setDraft((p) => ({ ...p, receiptDiscountNaira: e.target.value }))
                  }
                  placeholder="0.00"
                  className="w-full min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm font-mono-ledger"
                />
              </label>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                    Amount Paid
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setDraft((p) => ({
                        ...p,
                        partPaymentEnabled: !p.partPaymentEnabled,
                        amountPaidNaira: p.partPaymentEnabled
                          ? ''
                          : koboToNairaString(computed.totalKobo),
                      }))
                    }
                    className="text-xs font-medium text-[#0F5132] dark:text-[#7CE0AC] underline cursor-pointer"
                  >
                    {draft.partPaymentEnabled ? 'Switch to Paid in Full' : 'Enter Part Payment'}
                  </button>
                </div>

                {draft.partPaymentEnabled ? (
                  <input
                    type="text"
                    inputMode="decimal"
                    value={draft.amountPaidNaira}
                    onChange={(e) =>
                      setDraft((p) => ({ ...p, amountPaidNaira: e.target.value }))
                    }
                    placeholder="0.00"
                    className="w-full min-h-[46px] rounded-xl border border-amber-500 bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm font-mono-ledger font-semibold"
                  />
                ) : (
                  <div className="min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#F3EFE4] dark:bg-[#202420] px-3.5 flex items-center justify-between text-sm">
                    <span className="text-[#57534E] dark:text-[#A8A29E]">Paid in full</span>
                    <span className="font-mono-ledger font-semibold">
                      {formatNaira(computed.totalKobo)}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {computed.balanceDueKobo > 0 && (
              <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                    Balance Due: <span className="font-mono-ledger">{formatNaira(computed.balanceDueKobo)}</span>
                  </p>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300">
                    Issuing this receipt will automatically record this balance in customer debts.
                  </p>
                </div>
                <label className="block space-y-1 shrink-0">
                  <span className="text-[11px] text-amber-900 dark:text-amber-200">
                    Due Date (optional)
                  </span>
                  <input
                    type="date"
                    value={draft.dueDate}
                    onChange={(e) => setDraft((p) => ({ ...p, dueDate: e.target.value }))}
                    className="min-h-[40px] rounded-lg border border-amber-300 dark:border-amber-700 bg-white dark:bg-[#181B18] px-2.5 text-xs font-mono-ledger"
                  />
                </label>
              </div>
            )}

            {/* Metadata: Sold by, Date, Note */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-[#E5DFD2] dark:border-[#2A2E2A]">
              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                  Sold By (optional)
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={draft.soldBy}
                    onChange={(e) => setDraft((p) => ({ ...p, soldBy: e.target.value }))}
                    placeholder="Staff / cashier name"
                    className="flex-1 min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm"
                  />
                  <DictationMicButton
                    label="Dictate seller name"
                    onTranscript={(t) =>
                      setDraft((p) => ({ ...p, soldBy: p.soldBy ? `${p.soldBy} ${t}` : t }))
                    }
                  />
                </div>
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                  Receipt Date
                </span>
                <input
                  type="date"
                  value={draft.receiptDate}
                  onChange={(e) => setDraft((p) => ({ ...p, receiptDate: e.target.value }))}
                  className="w-full min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm font-mono-ledger"
                />
              </label>

              <label className="block space-y-1.5 sm:col-span-2">
                <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                  Note (optional)
                </span>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={draft.notes}
                    onChange={(e) => setDraft((p) => ({ ...p, notes: e.target.value }))}
                    placeholder="e.g. Goods checked in good condition"
                    className="flex-1 min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm"
                  />
                  <DictationMicButton
                    label="Dictate note"
                    onTranscript={(t) =>
                      setDraft((p) => ({ ...p, notes: p.notes ? `${p.notes} ${t}` : t }))
                    }
                  />
                </div>
              </label>
            </div>

            {/* Totals Bar & Submit */}
            <div className="pt-4 border-t border-[#E5DFD2] dark:border-[#2A2E2A] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-0.5">
                <p className="text-xs text-[#57534E] dark:text-[#A8A29E]">
                  {business.vat_enabled
                    ? business.vat_mode === 'exclusive'
                      ? `Includes 7.5% VAT (${formatNaira(computed.taxKobo)})`
                      : '7.5% VAT included in prices'
                    : 'Total Due'}
                </p>
                <p className="font-mono-ledger text-2xl font-semibold">
                  {formatNaira(computed.totalKobo)}
                </p>
              </div>

              <button
                type="submit"
                disabled={submitting || computed.totalKobo <= 0}
                className="w-full sm:w-auto min-h-[50px] px-7 rounded-xl bg-[#0F5132] hover:bg-[#0B3E26] text-white text-sm font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                {submitting ? 'Issuing Receipt…' : 'Issue Official Receipt'}
              </button>
            </div>
          </section>
        </form>

        {/* Live Preview Column */}
        <div
          className={`lg:col-span-5 space-y-3 lg:sticky lg:top-6 ${
            mobileShowPreview ? 'block' : 'hidden lg:block'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
              Live Receipt Preview
            </span>
            <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18]">
              {(['classic', 'modern', 'thermal'] as ReceiptTemplateStyle[]).map((style) => (
                <button
                  key={style}
                  type="button"
                  onClick={() => setPreviewTemplateOverride(style)}
                  className={`min-h-[34px] px-2.5 rounded-lg text-xs font-medium capitalize cursor-pointer ${
                    previewTemplate === style
                      ? 'bg-[#0F5132] text-white'
                      : 'text-[#57534E] dark:text-[#A8A29E]'
                  }`}
                >
                  {style === 'thermal' ? '80mm' : style}
                </button>
              ))}
            </div>
          </div>

          {livePreviewData && (
            <ReceiptTemplateRenderer
              data={livePreviewData}
              template={previewTemplate}
              logoUrl={logoUrl}
            />
          )}
        </div>
      </div>
    </div>
  );
}
