'use client';

import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import type { Customer, Debt } from '@/lib/database.types';
import { useAppContext } from '@/components/providers/AppProviders';
import { useBusiness } from '@/components/app/AppShell';
import { formatNaira, nairaInputToKobo, todayInLagosDate } from '@/lib/format';
import { quickCreditSaleInputSchema } from '@/lib/validation';
import { DictationMicButton } from '@/components/ui/DictationMicButton';

export function QuickCreditSaleModal({
  defaultDate,
  onClose,
  onSuccess,
}: {
  defaultDate?: string;
  onClose: () => void;
  onSuccess: (debt: Debt) => void;
}) {
  const { supabase, notify } = useAppContext();
  const { business } = useBusiness();

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [soldBy, setSoldBy] = useState('');
  const [entryDate, setEntryDate] = useState(defaultDate || todayInLagosDate());
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase || !business) return;
    supabase
      .from('customers')
      .select('*')
      .eq('business_id', business.id)
      .order('name', { ascending: true })
      .then(({ data }) => {
        if (data) setCustomers(data);
      });
  }, [supabase, business]);

  if (!business) return null;

  const filteredCustomers = customers
    .filter((c) => {
      const q = customerName.trim().toLowerCase();
      if (!q) return true;
      return c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q));
    })
    .slice(0, 5);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setErrorMsg(null);

    const amountKobo = nairaInputToKobo(amount);
    const parsed = quickCreditSaleInputSchema.safeParse({
      business_id: business.id,
      amount_kobo: amountKobo,
      customer_name: customerName,
      customer_phone: customerPhone.trim() || null,
      customer_id: customerId,
      description: description.trim() || null,
      due_date: dueDate || null,
      sold_by: soldBy.trim() || null,
      entry_date: entryDate,
    });

    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message || 'Check credit sale details.');
      return;
    }

    setSubmitting(true);
    try {
      const today = todayInLagosDate();
      const occurredAt =
        entryDate !== today ? `${entryDate}T12:00:00+01:00` : new Date().toISOString();

      const { data, error } = await supabase.rpc('create_quick_credit_sale', {
        p_business_id: business.id,
        p_amount_kobo: parsed.data.amount_kobo,
        p_customer_name: parsed.data.customer_name,
        p_customer_phone: parsed.data.customer_phone ?? null,
        p_customer_id: parsed.data.customer_id ?? null,
        p_description: parsed.data.description ?? null,
        p_due_date: parsed.data.due_date ?? null,
        p_sold_by: parsed.data.sold_by ?? null,
        p_occurred_at: occurredAt,
        p_source: 'manual',
      });

      if (error || !data) {
        throw new Error(error?.message || 'Could not record credit sale.');
      }

      notify({
        title: `Credit sale recorded (${formatNaira(data.original_amount_kobo)})`,
        description: `Added to ${data.customer_name}'s debt balance. ₦0.00 counted as cash received.`,
        variant: 'success',
      });
      onSuccess(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save credit sale.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="credit-sale-title"
    >
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 sm:p-6 space-y-5 max-h-[92vh] overflow-y-auto shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="credit-sale-title" className="font-display text-2xl">
              Quick Credit Sale
            </h2>
            <p className="text-xs text-[#57534E] dark:text-[#A8A29E] mt-0.5">
              Informal &ldquo;borrowed&rdquo; sale. Adds to Debtors; no cash counts as received until paid.
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

        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-3.5 py-2.5 text-xs text-red-900 dark:text-red-200"
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="relative space-y-1.5">
              <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                Customer Name *
              </span>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  required
                  autoFocus
                  value={customerName}
                  onFocus={() => setShowSuggest(true)}
                  onBlur={() => setTimeout(() => setShowSuggest(false), 160)}
                  onChange={(e) => {
                    setCustomerId(null);
                    setCustomerName(e.target.value);
                  }}
                  placeholder="Who took on credit?"
                  className="flex-1 min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
                />
                <DictationMicButton
                  label="Dictate customer name"
                  onTranscript={(t) => setCustomerName((p) => (p ? `${p} ${t}` : t))}
                />
              </div>

              {showSuggest && filteredCustomers.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] shadow-lg overflow-hidden">
                  {filteredCustomers.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onMouseDown={() => {
                        setCustomerId(c.id);
                        setCustomerName(c.name);
                        setCustomerPhone(c.phone || '');
                        setShowSuggest(false);
                      }}
                      className="w-full min-h-[40px] px-3 text-left text-xs hover:bg-[#FAF7F0] dark:hover:bg-[#202420] flex items-center justify-between border-b last:border-b-0 border-[#E5DFD2] dark:border-[#2A2E2A] cursor-pointer"
                    >
                      <span className="font-medium">{c.name}</span>
                      {c.phone && <span className="font-mono-ledger opacity-75">{c.phone}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                Customer Phone (for WhatsApp reminder)
              </span>
              <input
                type="tel"
                inputMode="tel"
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="0803 000 0000"
                className="w-full min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm font-mono-ledger"
              />
            </label>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
              Amount Owed (₦) *
            </span>
            <input
              type="text"
              inputMode="decimal"
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full min-h-[52px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-4 text-2xl font-mono-ledger font-semibold focus:outline-none focus:ring-2 focus:ring-amber-600"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
              Items / Note (optional)
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. 4 cartons Indomie"
                className="flex-1 min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm"
              />
              <DictationMicButton
                label="Dictate items"
                onTranscript={(t) => setDescription((p) => (p ? `${p} ${t}` : t))}
              />
            </div>
          </label>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                Due Date (optional)
              </span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3 text-sm font-mono-ledger"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                Entry Date
              </span>
              <input
                type="date"
                value={entryDate}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3 text-sm font-mono-ledger"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                Sold By (optional)
              </span>
              <input
                type="text"
                value={soldBy}
                onChange={(e) => setSoldBy(e.target.value)}
                placeholder="Staff"
                className="w-full min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3 text-sm"
              />
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[46px] px-4 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] text-sm font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[46px] px-6 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-sm font-semibold disabled:opacity-60 cursor-pointer"
            >
              {submitting ? 'Recording…' : 'Record Credit Sale'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
