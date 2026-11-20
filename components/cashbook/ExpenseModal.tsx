'use client';

import React, { useState } from 'react';
import { Trash2, Upload, X } from 'lucide-react';
import type { LedgerEntry, PaymentMethod } from '@/lib/database.types';
import { useAppContext } from '@/components/providers/AppProviders';
import { useBusiness } from '@/components/app/AppShell';
import { EXPENSE_PRESET_CATEGORIES } from '@/lib/cashbook';
import { formatNaira, koboToNairaString, nairaInputToKobo, todayInLagosDate } from '@/lib/format';
import { expenseInputSchema } from '@/lib/validation';
import { DictationMicButton } from '@/components/ui/DictationMicButton';

export function ExpenseModal({
  defaultDate,
  editingEntry,
  isDayClosed = false,
  onClose,
  onSuccess,
}: {
  defaultDate?: string;
  editingEntry?: LedgerEntry | null;
  isDayClosed?: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { supabase, notify } = useAppContext();
  const { business } = useBusiness();

  const initialCat = editingEntry?.category || 'Stock';
  const isPreset = EXPENSE_PRESET_CATEGORIES.includes(
    initialCat as (typeof EXPENSE_PRESET_CATEGORIES)[number]
  );

  const [amount, setAmount] = useState(
    editingEntry ? koboToNairaString(editingEntry.amount_kobo) : ''
  );
  const [selectedCategory, setSelectedCategory] = useState<string>(
    isPreset ? initialCat : '__custom__'
  );
  const [customCategory, setCustomCategory] = useState(isPreset ? '' : initialCat);
  const [payee, setPayee] = useState(editingEntry?.payee || '');
  const [paymentMethod, setPaymentMethod] = useState<Exclude<PaymentMethod, 'credit'>>(
    editingEntry && editingEntry.payment_method !== 'credit'
      ? editingEntry.payment_method
      : 'cash'
  );
  const [description, setDescription] = useState(editingEntry?.description || '');
  const [entryDate, setEntryDate] = useState(
    editingEntry?.entry_date || defaultDate || todayInLagosDate()
  );
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofFileName, setProofFileName] = useState<string | null>(
    editingEntry?.proof_path ? editingEntry.proof_path.split('/').pop() || 'Attached proof' : null
  );
  const [correctionReason, setCorrectionReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!business) return null;

  const effectiveCategory =
    selectedCategory === '__custom__' ? customCategory.trim() : selectedCategory;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('Proof file must be 5 MB or smaller.');
      return;
    }
    setProofFile(file);
    setProofFileName(file.name);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setErrorMsg(null);

    const amountKobo = nairaInputToKobo(amount);
    const parsed = expenseInputSchema.safeParse({
      business_id: business.id,
      amount_kobo: amountKobo,
      category: effectiveCategory,
      payee: payee.trim() || null,
      payment_method: paymentMethod,
      description: description.trim(),
      entry_date: entryDate,
    });

    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message || 'Check your expense entry.');
      return;
    }

    if (editingEntry && isDayClosed && correctionReason.trim().length < 3) {
      setErrorMsg('Please enter a reason (at least 3 characters) for correcting a closed day.');
      return;
    }

    setSubmitting(true);
    try {
      // Closed-day visible adjustment path
      if (editingEntry && isDayClosed) {
        const { error } = await supabase.rpc('correct_closed_day_entry', {
          p_entry_id: editingEntry.id,
          p_action: 'edit',
          p_new_amount_kobo: parsed.data.amount_kobo,
          p_new_payment_method: parsed.data.payment_method,
          p_new_category: parsed.data.category,
          p_new_payee: parsed.data.payee ?? null,
          p_new_description: parsed.data.description,
          p_reason: correctionReason.trim(),
        });
        if (error) throw new Error(error.message);

        notify({
          title: 'Closed-day correction posted',
          description: 'A visible adjustment entry and edit history record were saved.',
          variant: 'success',
        });
        onSuccess();
        return;
      }

      // Upload optional proof to private 'expense-proofs' bucket scoped by business_id
      let proofPath = editingEntry?.proof_path ?? null;
      if (proofFile) {
        const ext = (proofFile.name.split('.').pop() || 'jpg').toLowerCase();
        const objectPath = `${business.id}/proof-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 7)}.${ext}`;
        const { error: uploadErr } = await supabase.storage
          .from('expense-proofs')
          .upload(objectPath, proofFile, { upsert: false });
        if (uploadErr) {
          throw new Error(`Proof upload failed: ${uploadErr.message}`);
        }
        proofPath = objectPath;
      }

      const today = todayInLagosDate();
      const occurredAt =
        entryDate !== today
          ? `${entryDate}T12:00:00+01:00`
          : editingEntry?.occurred_at || new Date().toISOString();

      if (editingEntry) {
        const { error } = await supabase
          .from('ledger_entries')
          .update({
            amount_kobo: parsed.data.amount_kobo,
            payment_method: parsed.data.payment_method,
            category: parsed.data.category,
            payee: parsed.data.payee ?? null,
            description: parsed.data.description,
            proof_path: proofPath,
            occurred_at: occurredAt,
          })
          .eq('id', editingEntry.id);

        if (error) throw new Error(error.message);
        notify({ title: 'Expense updated', variant: 'success' });
      } else {
        const { error } = await supabase.from('ledger_entries').insert({
          business_id: business.id,
          type: 'expense',
          amount_kobo: parsed.data.amount_kobo,
          payment_method: parsed.data.payment_method,
          category: parsed.data.category,
          payee: parsed.data.payee ?? null,
          description: parsed.data.description,
          proof_path: proofPath,
          occurred_at: occurredAt,
          source: 'manual',
        });

        if (error) throw new Error(error.message);
        notify({
          title: `Expense recorded (${formatNaira(parsed.data.amount_kobo)})`,
          variant: 'success',
        });
      }

      onSuccess();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to save expense.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!supabase || !editingEntry) return;
    setErrorMsg(null);

    if (isDayClosed && correctionReason.trim().length < 3) {
      setErrorMsg('Enter a reason (at least 3 characters) to reverse a closed-day entry.');
      return;
    }

    setDeleting(true);
    try {
      if (isDayClosed) {
        const { error } = await supabase.rpc('correct_closed_day_entry', {
          p_entry_id: editingEntry.id,
          p_action: 'delete',
          p_reason: correctionReason.trim(),
        });
        if (error) throw new Error(error.message);
        notify({
          title: 'Closed-day reversal posted',
          description: 'Original entry kept; visible reversal added to ledger.',
          variant: 'success',
        });
      } else {
        const { error } = await supabase.rpc('delete_open_expense', {
          p_entry_id: editingEntry.id,
        });
        if (error) throw new Error(error.message);
        notify({ title: 'Expense removed', variant: 'default' });
      }
      onSuccess();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Could not delete expense.');
    } finally {
      setDeleting(false);
    }
  };

  const isClosedNonExpense = Boolean(editingEntry && isDayClosed && editingEntry.type !== 'expense');

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="expense-modal-title"
    >
      <div className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 sm:p-6 space-y-5 max-h-[92vh] overflow-y-auto shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="expense-modal-title" className="font-display text-2xl">
              {editingEntry
                ? isDayClosed
                  ? 'Correct Closed-Day Entry'
                  : 'Edit Expense'
                : 'Record Expense'}
            </h2>
            <p className="text-xs text-[#57534E] dark:text-[#A8A29E] mt-0.5">
              {isDayClosed
                ? `Day ${editingEntry?.entry_date} is closed. Changes create a visible adjustment & audit log.`
                : 'Track money leaving the business, with optional proof photo.'}
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
            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                Amount (₦) *
              </span>
              <input
                type="text"
                inputMode="decimal"
                required
                autoFocus
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full min-h-[48px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-lg font-mono-ledger font-semibold focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
              />
            </label>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                Date
              </span>
              <input
                type="date"
                value={entryDate}
                disabled={Boolean(editingEntry && isDayClosed)}
                onChange={(e) => setEntryDate(e.target.value)}
                className="w-full min-h-[48px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm font-mono-ledger disabled:opacity-60"
              />
            </label>
          </div>

          {!isClosedNonExpense && (
            <div className="space-y-2">
              <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                Category
              </span>
              <div className="flex flex-wrap gap-1.5">
                {EXPENSE_PRESET_CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`min-h-[38px] px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                      selectedCategory === cat
                        ? 'border-[#0F5132] bg-[#0F5132] text-white'
                        : 'border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210]'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setSelectedCategory('__custom__')}
                  className={`min-h-[38px] px-3 rounded-xl border text-xs font-semibold cursor-pointer ${
                    selectedCategory === '__custom__'
                      ? 'border-[#0F5132] bg-[#0F5132] text-white'
                      : 'border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210]'
                  }`}
                >
                  + Custom
                </button>
              </div>
              {selectedCategory === '__custom__' && (
                <input
                  type="text"
                  required
                  value={customCategory}
                  onChange={(e) => setCustomCategory(e.target.value)}
                  placeholder="Enter custom category (e.g. Fuel / Generator)"
                  className="w-full min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm"
                />
              )}
            </div>
          )}

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
                Payee / Vendor (optional)
              </span>
              <input
                type="text"
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
                placeholder="Who was paid?"
                className="w-full min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm"
              />
            </label>

            {!isDayClosed && (
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                  Proof Photo / Receipt (optional)
                </span>
                <label className="flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-xl border border-dashed border-[#C7BFA9] dark:border-[#3A3F3A] bg-[#FAF7F0] dark:bg-[#101210] text-xs font-medium cursor-pointer hover:border-[#0F5132]">
                  <Upload className="w-4 h-4 shrink-0" />
                  <span className="truncate">{proofFileName || 'Upload photo / PDF'}</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,application/pdf"
                    onChange={handleFileSelect}
                    className="sr-only"
                  />
                </label>
              </div>
            )}
          </div>

          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
              Description / Note *
            </span>
            <div className="flex gap-2">
              <input
                type="text"
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g. Diesel for shop generator"
                className="flex-1 min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm"
              />
              <DictationMicButton
                label="Dictate expense note"
                onTranscript={(t) => setDescription((p) => (p ? `${p} ${t}` : t))}
              />
            </div>
          </label>

          {editingEntry && isDayClosed && (
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-amber-800 dark:text-amber-300">
                Reason for Closed-Day Correction *
              </span>
              <input
                type="text"
                required
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder="e.g. Receipt showed ₦4,500 instead of ₦5,400"
                className="w-full min-h-[44px] rounded-xl border border-amber-400 dark:border-amber-700 bg-amber-50/60 dark:bg-amber-950/20 px-3.5 text-sm"
              />
            </label>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
            {editingEntry ? (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting || submitting}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-xl border border-red-300 dark:border-red-900/60 text-red-700 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                <span>{deleting ? 'Processing…' : isDayClosed ? 'Reverse & Remove' : 'Delete'}</span>
              </button>
            ) : (
              <span />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-4 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] text-sm font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || deleting}
                className="min-h-[44px] px-6 rounded-xl bg-[#0F5132] hover:bg-[#0B3E26] text-white text-sm font-semibold disabled:opacity-60 cursor-pointer"
              >
                {submitting
                  ? 'Saving…'
                  : editingEntry
                    ? isDayClosed
                      ? 'Post Correction'
                      : 'Save Changes'
                    : 'Save Expense'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
