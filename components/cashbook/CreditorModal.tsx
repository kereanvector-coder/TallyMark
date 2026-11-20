'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { Creditor, PaymentMethod } from '@/lib/database.types';
import { useAppContext } from '@/components/providers/AppProviders';
import { useBusiness } from '@/components/app/AppShell';
import { formatNaira, koboToNairaString, nairaInputToKobo } from '@/lib/format';
import { creditorInputSchema } from '@/lib/validation';
import { DictationMicButton } from '@/components/ui/DictationMicButton';

export function CreditorModal({
  payingCreditor = null,
  onClose,
  onSuccess,
}: {
  payingCreditor?: Creditor | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { supabase, notify } = useAppContext();
  const { business } = useBusiness();

  // Add mode states
  const [supplierName, setSupplierName] = useState('');
  const [supplierPhone, setSupplierPhone] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');

  // Shared / Pay mode states
  const [amount, setAmount] = useState(
    payingCreditor ? koboToNairaString(payingCreditor.balance_kobo) : ''
  );
  const [paymentMethod, setPaymentMethod] = useState<Exclude<PaymentMethod, 'credit'>>('transfer');
  const [recordAsExpense, setRecordAsExpense] = useState(true);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!business) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setErrorMsg(null);

    const amountKobo = nairaInputToKobo(amount);
    setSubmitting(true);

    try {
      if (payingCreditor) {
        if (amountKobo <= 0) {
          throw new Error('Payment amount must be greater than ₦0.');
        }
        if (amountKobo > payingCreditor.balance_kobo) {
          throw new Error(`Payment cannot exceed ${formatNaira(payingCreditor.balance_kobo)}.`);
        }

        const { error } = await supabase.rpc('pay_creditor', {
          p_creditor_id: payingCreditor.id,
          p_amount_kobo: amountKobo,
          p_payment_method: paymentMethod,
          p_record_expense: recordAsExpense,
          p_notes: notes.trim() || null,
        });
        if (error) throw new Error(error.message);

        notify({
          title: `Paid ${payingCreditor.supplier_name} (${formatNaira(amountKobo)})`,
          description: recordAsExpense
            ? 'Balance reduced and recorded as an expense in your Cash Book.'
            : 'Supplier balance updated.',
          variant: 'success',
        });
      } else {
        const parsed = creditorInputSchema.safeParse({
          business_id: business.id,
          supplier_name: supplierName,
          supplier_phone: supplierPhone.trim() || null,
          description: description.trim() || null,
          original_amount_kobo: amountKobo,
          due_date: dueDate || null,
          notes: notes.trim() || null,
        });

        if (!parsed.success) {
          throw new Error(parsed.error.issues[0]?.message || 'Check supplier details.');
        }

        const { error } = await supabase.from('creditors').insert({
          business_id: business.id,
          supplier_name: parsed.data.supplier_name,
          supplier_phone: parsed.data.supplier_phone ?? null,
          description: parsed.data.description ?? null,
          original_amount_kobo: parsed.data.original_amount_kobo,
          due_date: parsed.data.due_date ?? null,
          notes: parsed.data.notes ?? null,
          source: 'manual',
        });

        if (error) throw new Error(error.message);

        notify({
          title: `Added supplier owed (${formatNaira(amountKobo)})`,
          description: `${parsed.data.supplier_name} added to Creditors.`,
          variant: 'success',
        });
      }

      onSuccess();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Operation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="creditor-modal-title"
    >
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 sm:p-6 space-y-5 max-h-[92vh] overflow-y-auto shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="creditor-modal-title" className="font-display text-2xl">
              {payingCreditor ? 'Pay Supplier' : 'Add Supplier Owed'}
            </h2>
            <p className="text-xs text-[#57534E] dark:text-[#A8A29E] mt-0.5">
              {payingCreditor
                ? `${payingCreditor.supplier_name} · Remaining ${formatNaira(payingCreditor.balance_kobo)}`
                : 'Track goods or bills your business owes to suppliers.'}
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
          {!payingCreditor && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                    Supplier Name *
                  </span>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      required
                      autoFocus
                      value={supplierName}
                      onChange={(e) => setSupplierName(e.target.value)}
                      placeholder="e.g. Alhaji Bala Foods"
                      className="flex-1 min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3 text-sm"
                    />
                    <DictationMicButton
                      label="Dictate supplier name"
                      onTranscript={(t) => setSupplierName((p) => (p ? `${p} ${t}` : t))}
                    />
                  </div>
                </label>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                    Phone (optional)
                  </span>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={supplierPhone}
                    onChange={(e) => setSupplierPhone(e.target.value)}
                    placeholder="0803 000 0000"
                    className="w-full min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3 text-sm font-mono-ledger"
                  />
                </label>
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                  What Was Supplied (optional)
                </span>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g. 20 cartons vegetable oil"
                  className="w-full min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm"
                />
              </label>
            </>
          )}

          <label className="block space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                {payingCreditor ? 'Amount to Pay (₦) *' : 'Amount Owed (₦) *'}
              </span>
              {payingCreditor && (
                <button
                  type="button"
                  onClick={() => setAmount(koboToNairaString(payingCreditor.balance_kobo))}
                  className="text-xs font-medium text-[#0F5132] dark:text-[#7CE0AC] underline cursor-pointer"
                >
                  Full ({formatNaira(payingCreditor.balance_kobo)})
                </button>
              )}
            </div>
            <input
              type="text"
              inputMode="decimal"
              required
              autoFocus={Boolean(payingCreditor)}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full min-h-[48px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-lg font-mono-ledger font-semibold"
            />
          </label>

          {payingCreditor ? (
            <>
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                  Payment Method
                </span>
                <div className="grid grid-cols-5 gap-1.5">
                  {(
                    [
                      ['cash', 'Cash'],
                      ['transfer', 'Transfer'],
                      ['pos', 'POS'],
                      ['card', 'Card'],
                      ['other', 'Other'],
                    ] as const
                  ).map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setPaymentMethod(val)}
                      className={`min-h-[40px] rounded-xl border text-xs font-semibold cursor-pointer ${
                        paymentMethod === val
                          ? 'border-[#0F5132] bg-[#0F5132] text-white'
                          : 'border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-start gap-2.5 text-xs text-[#57534E] dark:text-[#A8A29E] cursor-pointer">
                <input
                  type="checkbox"
                  checked={recordAsExpense}
                  onChange={(e) => setRecordAsExpense(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded accent-[#0F5132]"
                />
                <span>
                  Also record this payout as an expense in today&apos;s Cash Book (recommended)
                </span>
              </label>
            </>
          ) : (
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                Due Date (optional)
              </span>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm font-mono-ledger"
              />
            </label>
          )}

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
              Note (optional)
            </span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={payingCreditor ? 'Transfer ref or comment' : 'Agreed terms'}
              className="w-full min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm"
            />
          </label>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[44px] px-4 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] text-sm font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="min-h-[44px] px-5 rounded-xl bg-[#0F5132] hover:bg-[#0B3E26] text-white text-sm font-semibold disabled:opacity-60 cursor-pointer"
            >
              {submitting
                ? 'Saving…'
                : payingCreditor
                  ? 'Record Supplier Payment'
                  : 'Save Supplier Debt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
