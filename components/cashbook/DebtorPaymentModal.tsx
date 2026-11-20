'use client';

import React, { useState } from 'react';
import { X } from 'lucide-react';
import type { Debt, PaymentMethod, Receipt } from '@/lib/database.types';
import { useAppContext } from '@/components/providers/AppProviders';
import { formatNaira, koboToNairaString, nairaInputToKobo } from '@/lib/format';
import { DictationMicButton } from '@/components/ui/DictationMicButton';

export function DebtorPaymentModal({
  debt,
  onClose,
  onSuccess,
}: {
  debt: Debt;
  onClose: () => void;
  onSuccess: (newReceipt: Receipt) => void;
}) {
  const { supabase, notify } = useAppContext();
  const [amountInput, setAmountInput] = useState(koboToNairaString(debt.balance_kobo));
  const [paymentMethod, setPaymentMethod] = useState<Exclude<PaymentMethod, 'credit'>>('cash');
  const [notes, setNotes] = useState('');
  const [soldBy, setSoldBy] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setErrorMsg(null);

    const amountKobo = nairaInputToKobo(amountInput);
    if (amountKobo <= 0) {
      setErrorMsg('Payment amount must be greater than ₦0.');
      return;
    }
    if (amountKobo > debt.balance_kobo) {
      setErrorMsg(`Payment cannot exceed ${formatNaira(debt.balance_kobo)}.`);
      return;
    }

    setSubmitting(true);
    try {
      const { data: newReceipt, error } = await supabase.rpc('record_debt_payment', {
        p_debt_id: debt.id,
        p_amount_kobo: amountKobo,
        p_payment_method: paymentMethod,
        p_notes: notes.trim() || null,
        p_sold_by: soldBy.trim() || null,
        p_source: 'manual',
      });

      if (error || !newReceipt) {
        throw new Error(error?.message || 'Could not record payment.');
      }

      notify({
        title: `Payment recorded (${formatNaira(amountKobo)})`,
        description: `Issued linked receipt ${newReceipt.receipt_code}.`,
        variant: 'success',
      });
      onSuccess(newReceipt);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to record payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="debt-payment-title"
    >
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 sm:p-6 space-y-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="debt-payment-title" className="font-display text-2xl">
              Record Debt Payment
            </h2>
            <p className="text-xs text-[#57534E] dark:text-[#A8A29E] mt-0.5">
              {debt.customer_name} · Owes{' '}
              <span className="font-mono-ledger font-semibold text-[#141413] dark:text-[#F4F1EA]">
                {formatNaira(debt.balance_kobo)}
              </span>
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
          <label className="block space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                Amount Received (₦)
              </span>
              <button
                type="button"
                onClick={() => setAmountInput(koboToNairaString(debt.balance_kobo))}
                className="text-xs font-medium text-[#0F5132] dark:text-[#7CE0AC] underline cursor-pointer"
              >
                Full ({formatNaira(debt.balance_kobo)})
              </button>
            </div>
            <input
              type="text"
              inputMode="decimal"
              required
              autoFocus
              value={amountInput}
              onChange={(e) => setAmountInput(e.target.value)}
              className="w-full min-h-[48px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-lg font-mono-ledger font-semibold focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
            />
          </label>

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
                  className={`min-h-[42px] rounded-xl border text-xs font-semibold cursor-pointer ${
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                Note (optional)
              </span>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Part payment"
                  className="flex-1 min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3 text-sm"
                />
                <DictationMicButton
                  label="Dictate note"
                  onTranscript={(t) => setNotes((p) => (p ? `${p} ${t}` : t))}
                />
              </div>
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                Collected By (optional)
              </span>
              <input
                type="text"
                value={soldBy}
                onChange={(e) => setSoldBy(e.target.value)}
                placeholder="Staff / owner"
                className="w-full min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3 text-sm"
              />
            </label>
          </div>

          <p className="text-[11px] text-[#57534E] dark:text-[#A8A29E]">
            This atomically reduces the debt and issues a linked official receipt for the payment.
          </p>

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
              {submitting ? 'Recording…' : 'Record & Issue Receipt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
