'use client';

import React, { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import type { PaymentMethod, Receipt } from '@/lib/database.types';
import { formatNaira, koboToNairaString, nairaInputToKobo } from '@/lib/format';
import { recordPaymentInputSchema, voidReceiptInputSchema } from '@/lib/validation';
import { useAppContext } from '@/components/providers/AppProviders';
import { DictationMicButton } from '@/components/ui/DictationMicButton';

export function ReceiveBalanceModal({
  receipt,
  outstandingKobo,
  onClose,
  onSuccess,
}: {
  receipt: Receipt;
  outstandingKobo: number;
  onClose: () => void;
  onSuccess: (newReceipt: Receipt) => void;
}) {
  const { supabase, notify } = useAppContext();
  const [amountStr, setAmountStr] = useState(koboToNairaString(outstandingKobo));
  const [method, setMethod] = useState<Exclude<PaymentMethod, 'credit'>>('cash');
  const [notes, setNotes] = useState('');
  const [soldBy, setSoldBy] = useState(receipt.sold_by || '');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setErrorMsg(null);

    const amountKobo = nairaInputToKobo(amountStr);
    const parsed = recordPaymentInputSchema.safeParse({
      receipt_id: receipt.id,
      amount_kobo: amountKobo,
      payment_method: method,
      notes: notes || null,
      sold_by: soldBy || null,
    });

    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message || 'Enter a valid payment amount.');
      return;
    }

    if (amountKobo > outstandingKobo) {
      setErrorMsg(`Amount cannot exceed remaining balance (${formatNaira(outstandingKobo)}).`);
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('record_payment', {
        p_receipt_id: receipt.id,
        p_amount_kobo: amountKobo,
        p_payment_method: method,
        p_notes: notes.trim() || null,
        p_sold_by: soldBy.trim() || null,
        p_source: 'manual',
      });

      if (error || !data) {
        throw new Error(error?.message || 'Could not record payment.');
      }

      notify({
        title: `Balance payment recorded (${data.receipt_code})`,
        description: `${formatNaira(amountKobo)} received for ${receipt.receipt_code}.`,
        variant: 'success',
      });
      onSuccess(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to record balance payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-6 space-y-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[#0F5132] dark:text-[#2D8A5E]">
              Receive Balance
            </p>
            <h3 className="font-display text-2xl mt-0.5">{receipt.receipt_code}</h3>
            <p className="text-xs text-[#57534E] dark:text-[#A8A29E] mt-1">
              {receipt.customer_name} · Remaining{' '}
              <span className="font-mono-ledger font-semibold text-[#141413] dark:text-[#F4F1EA]">
                {formatNaira(outstandingKobo)}
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-xl text-[#57534E] hover:text-[#141413] dark:text-[#A8A29E] dark:hover:text-[#F4F1EA] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/50 px-3.5 py-2.5 text-xs text-red-900 dark:text-red-200"
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
                onClick={() => setAmountStr(koboToNairaString(outstandingKobo))}
                className="text-xs font-medium text-[#0F5132] dark:text-[#7CE0AC] underline cursor-pointer"
              >
                Full balance
              </button>
            </div>
            <input
              type="text"
              inputMode="decimal"
              required
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="w-full min-h-[48px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-base font-mono-ledger font-semibold focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
            />
          </label>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
              Payment Method
            </span>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
              {(['cash', 'transfer', 'pos', 'card', 'other'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={`min-h-[44px] rounded-xl border text-xs font-medium uppercase cursor-pointer transition-colors ${
                    method === m
                      ? 'border-[#0F5132] bg-[#0F5132] text-white'
                      : 'border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210]'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
              Received by (optional)
            </span>
            <input
              type="text"
              value={soldBy}
              onChange={(e) => setSoldBy(e.target.value)}
              placeholder="Staff name"
              className="w-full min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
              Note (optional)
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="e.g. GTBank transfer ref"
                className="flex-1 min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm"
              />
              <DictationMicButton
                label="Dictate payment note"
                onTranscript={(t) => setNotes((p) => (p ? `${p} ${t}` : t))}
              />
            </div>
          </label>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[48px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] text-sm font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 min-h-[48px] rounded-xl bg-[#0F5132] hover:bg-[#0B3E26] text-white text-sm font-semibold disabled:opacity-60 cursor-pointer"
            >
              {submitting ? 'Issuing receipt…' : 'Record & Issue Receipt'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function VoidReceiptModal({
  receipt,
  onClose,
  onSuccess,
}: {
  receipt: Receipt;
  onClose: () => void;
  onSuccess: (updated: Receipt) => void;
}) {
  const { supabase, notify } = useAppContext();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setErrorMsg(null);

    const parsed = voidReceiptInputSchema.safeParse({
      receipt_id: receipt.id,
      reason,
    });

    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message || 'Enter a valid void reason.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('void_receipt', {
        p_receipt_id: receipt.id,
        p_reason: parsed.data.reason,
      });

      if (error || !data) {
        throw new Error(error?.message || 'Could not void receipt.');
      }

      notify({
        title: `Receipt ${receipt.receipt_code} voided`,
        description: 'The receipt remains in your ledger marked VOID with a reversal entry.',
        variant: 'default',
      });
      onSuccess(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to void receipt.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4">
      <div className="w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-6 space-y-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-display text-2xl">Void {receipt.receipt_code}</h3>
              <p className="text-xs text-[#57534E] dark:text-[#A8A29E] mt-1 leading-relaxed">
                This permanently stamps the receipt as VOID and posts a reversal entry. Sequential
                numbering stays gap-free.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-xl text-[#57534E] cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/50 px-3.5 py-2.5 text-xs text-red-900 dark:text-red-200"
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
              Reason for Voiding *
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                required
                minLength={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Wrong item price entered"
                className="flex-1 min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-600"
              />
              <DictationMicButton
                label="Dictate void reason"
                onTranscript={(t) => setReason((p) => (p ? `${p} ${t}` : t))}
              />
            </div>
          </label>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[48px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] text-sm font-medium cursor-pointer"
            >
              Keep Receipt
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 min-h-[48px] rounded-xl bg-red-700 hover:bg-red-800 text-white text-sm font-semibold disabled:opacity-60 cursor-pointer"
            >
              {submitting ? 'Voiding…' : 'Confirm Void'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
