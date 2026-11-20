'use client';

import React, { useMemo, useState } from 'react';
import { CheckCircle2, Download, Lock, MessageCircle, X } from 'lucide-react';
import type { DayClosure } from '@/lib/database.types';
import { useAppContext } from '@/components/providers/AppProviders';
import { useBusiness } from '@/components/app/AppShell';
import {
  buildDailySummaryWhatsAppMessage,
  type CashBookRow,
  type DailyCashBookSummary,
} from '@/lib/cashbook';
import {
  buildWhatsAppShareUrl,
  formatLagosDate,
  formatLagosDateTime,
  formatNaira,
  koboToNairaString,
  nairaInputToKobo,
} from '@/lib/format';
import { closeDayInputSchema } from '@/lib/validation';
import { generateDailySummaryPdfBytes } from '@/lib/pdf/cashbook-pdf';
import { DictationMicButton } from '@/components/ui/DictationMicButton';

export function CloseDayModal({
  date,
  summary,
  rows,
  existingClosure = null,
  onClose,
  onClosed,
}: {
  date: string;
  summary: DailyCashBookSummary;
  rows: CashBookRow[];
  existingClosure?: DayClosure | null;
  onClose: () => void;
  onClosed: (closure: DayClosure) => void;
}) {
  const { supabase, notify } = useAppContext();
  const { business } = useBusiness();

  const [closure, setClosure] = useState<DayClosure | null>(existingClosure);
  const [actualCashInput, setActualCashInput] = useState<string>(
    summary.expectedClosingCashKobo > 0
      ? koboToNairaString(summary.expectedClosingCashKobo)
      : '0'
  );
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const actualCashKobo = useMemo(
    () => nairaInputToKobo(actualCashInput),
    [actualCashInput]
  );
  const varianceKobo = actualCashKobo - summary.expectedClosingCashKobo;

  if (!business) return null;

  const handleCloseDay = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    setErrorMsg(null);

    const parsed = closeDayInputSchema.safeParse({
      business_id: business.id,
      closure_date: date,
      actual_cash_counted_kobo: actualCashKobo,
      notes: notes.trim() || null,
    });

    if (!parsed.success) {
      setErrorMsg(parsed.error.issues[0]?.message || 'Check your cash count.');
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc('close_day', {
        p_business_id: business.id,
        p_closure_date: parsed.data.closure_date,
        p_actual_cash_counted_kobo: parsed.data.actual_cash_counted_kobo,
        p_notes: parsed.data.notes ?? null,
      });

      if (error || !data) {
        throw new Error(error?.message || 'Could not close the day.');
      }

      setClosure(data);
      notify({
        title: `Day ${date} sealed`,
        description: 'Daily summary generated and locked against silent edits.',
        variant: 'success',
      });
      onClosed(data);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to close day.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!closure) return;
    setDownloadingPdf(true);
    try {
      const bytes = await generateDailySummaryPdfBytes({
        business,
        closure,
        rows,
      });
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Tallymark-Daily-Summary-${closure.closure_date}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      notify({
        title: 'PDF export failed',
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setDownloadingPdf(false);
    }
  };

  const whatsappUrl = closure
    ? buildWhatsAppShareUrl(
        buildDailySummaryWhatsAppMessage({
          businessName: business.name,
          closure,
        })
      )
    : '#';

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-xs p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="close-day-title"
    >
      <div className="w-full sm:max-w-xl rounded-t-3xl sm:rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 sm:p-6 space-y-5 max-h-[92vh] overflow-y-auto shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.08em] font-mono-ledger font-semibold text-[#0F5132] dark:text-[#7CE0AC]">
              {formatLagosDate(`${date}T12:00:00+01:00`)}
            </p>
            <h2 id="close-day-title" className="font-display text-2xl sm:text-3xl mt-0.5">
              {closure ? 'Daily Summary Card' : 'Close the Day'}
            </h2>
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

        {closure ? (
          <div className="space-y-5">
            <div className="rounded-xl border border-[#0F5132]/30 dark:border-[#2D8A5E]/40 bg-[#0F5132]/5 dark:bg-[#0F5132]/15 p-3.5 flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-[#0F5132] dark:text-[#7CE0AC] shrink-0" />
              <div className="text-xs">
                <p className="font-semibold text-[#0F5132] dark:text-[#7CE0AC]">
                  Day sealed on {formatLagosDateTime(closure.closed_at)}
                </p>
                <p className="text-[#57534E] dark:text-[#A8A29E] mt-0.5">
                  Entries for {closure.closure_date} are locked. Future edits create visible
                  corrections.
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] p-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-[#57534E] dark:text-[#A8A29E]">Opening Cash in Hand</span>
                <span className="font-mono-ledger font-medium">
                  {formatNaira(closure.opening_cash_kobo)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#57534E] dark:text-[#A8A29E]">Total Sold</span>
                <span className="font-mono-ledger font-semibold">
                  {formatNaira(closure.total_sales_kobo)}
                </span>
              </div>
              <div className="flex justify-between text-xs pl-3">
                <span className="text-[#57534E] dark:text-[#A8A29E]">Receipted Sales</span>
                <span className="font-mono-ledger">
                  {formatNaira(closure.total_receipt_sales_kobo)}
                </span>
              </div>
              <div className="flex justify-between text-xs pl-3">
                <span className="text-[#57534E] dark:text-[#A8A29E]">Quick Sales</span>
                <span className="font-mono-ledger">
                  {formatNaira(closure.total_quick_sales_kobo)}
                </span>
              </div>
              <div className="flex justify-between text-xs pl-3">
                <span className="text-[#57534E] dark:text-[#A8A29E]">Credit Given (unpaid)</span>
                <span className="font-mono-ledger text-amber-700 dark:text-amber-400">
                  {formatNaira(closure.total_credit_sales_kobo)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#57534E] dark:text-[#A8A29E]">
                  Debt Payments Received
                </span>
                <span className="font-mono-ledger font-medium text-[#0F5132] dark:text-[#7CE0AC]">
                  {formatNaira(closure.total_payments_received_kobo)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#57534E] dark:text-[#A8A29E]">Expenses</span>
                <span className="font-mono-ledger font-medium text-red-700 dark:text-red-400">
                  -{formatNaira(closure.total_expenses_kobo)}
                </span>
              </div>
              <div className="pt-2 border-t border-[#E5DFD2] dark:border-[#2A2E2A] flex justify-between font-semibold">
                <span>Net (money in minus money out)</span>
                <span
                  className={`font-mono-ledger ${
                    closure.net_cash_book_kobo >= 0
                      ? 'text-[#0F5132] dark:text-[#7CE0AC]'
                      : 'text-red-700 dark:text-red-400'
                  }`}
                >
                  {formatNaira(closure.net_cash_book_kobo)}
                </span>
              </div>
              <div className="pt-2 border-t border-[#E5DFD2] dark:border-[#2A2E2A] space-y-1.5">
                <div className="flex justify-between text-xs">
                  <span className="text-[#57534E] dark:text-[#A8A29E]">
                    Transfer In · POS In
                  </span>
                  <span className="font-mono-ledger">
                    {formatNaira(closure.transfer_in_kobo)} · {formatNaira(closure.pos_in_kobo)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#57534E] dark:text-[#A8A29E]">
                    Expected Cash in Hand
                  </span>
                  <span className="font-mono-ledger font-semibold">
                    {formatNaira(closure.expected_cash_kobo)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#57534E] dark:text-[#A8A29E]">
                    Actual Cash Counted
                  </span>
                  <span className="font-mono-ledger font-semibold">
                    {formatNaira(closure.actual_cash_counted_kobo ?? closure.expected_cash_kobo)}
                  </span>
                </div>
                <div className="flex justify-between font-semibold">
                  <span>Over / Short</span>
                  <span
                    className={`font-mono-ledger ${
                      (closure.variance_kobo ?? 0) === 0
                        ? 'text-[#0F5132] dark:text-[#7CE0AC]'
                        : (closure.variance_kobo ?? 0) > 0
                          ? 'text-amber-700 dark:text-amber-400'
                          : 'text-red-700 dark:text-red-400'
                    }`}
                  >
                    {(closure.variance_kobo ?? 0) === 0
                      ? '₦0.00 (Exact match)'
                      : (closure.variance_kobo ?? 0) > 0
                        ? `+${formatNaira(closure.variance_kobo ?? 0)} Over`
                        : `${formatNaira(closure.variance_kobo ?? 0)} Short`}
                  </span>
                </div>
              </div>
              {closure.notes && (
                <p className="pt-2 border-t border-[#E5DFD2] dark:border-[#2A2E2A] text-xs text-[#57534E] dark:text-[#A8A29E]">
                  Note: {closure.notes}
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <a
                href={whatsappUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-[#0F5132] hover:bg-[#0B3E26] text-white text-xs sm:text-sm font-semibold"
              >
                <MessageCircle className="w-4 h-4" />
                <span>Share on WhatsApp</span>
              </a>
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] text-xs sm:text-sm font-semibold hover:bg-[#FAF7F0] dark:hover:bg-[#202420] cursor-pointer disabled:opacity-60"
              >
                <Download className="w-4 h-4" />
                <span>{downloadingPdf ? 'Generating…' : 'Download PDF'}</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="min-h-[44px] px-4 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] text-xs sm:text-sm font-medium cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleCloseDay} className="space-y-4">
            <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[#57534E] dark:text-[#A8A29E]">Opening Cash in Hand</span>
                <span className="font-mono-ledger">{formatNaira(summary.openingCashKobo)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#57534E] dark:text-[#A8A29E]">Receipted Sales</span>
                <span className="font-mono-ledger">{formatNaira(summary.receiptSalesKobo)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#57534E] dark:text-[#A8A29E]">Quick Sales</span>
                <span className="font-mono-ledger">{formatNaira(summary.quickSalesKobo)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#57534E] dark:text-[#A8A29E]">
                  Payments Received on Debts
                </span>
                <span className="font-mono-ledger text-[#0F5132] dark:text-[#7CE0AC]">
                  {formatNaira(summary.paymentsReceivedKobo)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#57534E] dark:text-[#A8A29E]">Expenses Paid</span>
                <span className="font-mono-ledger text-red-700 dark:text-red-400">
                  -{formatNaira(summary.expensesKobo)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#57534E] dark:text-[#A8A29E]">
                  New Credit Given (₦0 received)
                </span>
                <span className="font-mono-ledger text-amber-700 dark:text-amber-400">
                  {formatNaira(summary.creditSalesKobo)}
                </span>
              </div>
              <div className="pt-2 border-t border-[#E5DFD2] dark:border-[#2A2E2A] flex justify-between font-semibold">
                <span>Net (money in minus money out)</span>
                <span className="font-mono-ledger">{formatNaira(summary.netCashBookKobo)}</span>
              </div>
              <div className="flex justify-between text-xs text-[#57534E] dark:text-[#A8A29E]">
                <span>Transfer In · POS In</span>
                <span className="font-mono-ledger">
                  {formatNaira(summary.transferInKobo)} · {formatNaira(summary.posInKobo)}
                </span>
              </div>
              <div className="pt-2 border-t border-[#E5DFD2] dark:border-[#2A2E2A] flex justify-between font-semibold text-base">
                <span>Expected Cash in Hand</span>
                <span className="font-mono-ledger text-[#0F5132] dark:text-[#7CE0AC]">
                  {formatNaira(summary.expectedClosingCashKobo)}
                </span>
              </div>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                Actual Physical Cash Counted (₦) *
              </span>
              <input
                type="text"
                inputMode="decimal"
                required
                autoFocus
                value={actualCashInput}
                onChange={(e) => setActualCashInput(e.target.value)}
                placeholder="0.00"
                className="w-full min-h-[52px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-4 text-2xl font-mono-ledger font-semibold focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
              />
            </label>

            <div className="rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] px-4 py-3 flex items-center justify-between text-sm">
              <span className="text-[#57534E] dark:text-[#A8A29E]">Over / Short Difference</span>
              <span
                className={`font-mono-ledger font-semibold ${
                  varianceKobo === 0
                    ? 'text-[#0F5132] dark:text-[#7CE0AC]'
                    : varianceKobo > 0
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-red-700 dark:text-red-400'
                }`}
              >
                {varianceKobo === 0
                  ? '₦0.00 (Exact match)'
                  : varianceKobo > 0
                    ? `+${formatNaira(varianceKobo)} (Over)`
                    : `${formatNaira(varianceKobo)} (Short)`}
              </span>
            </div>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                Closing Note (optional — explain any short/over cash)
              </span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. ₦500 given to dispatch rider"
                  className="flex-1 min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 text-sm"
                />
                <DictationMicButton
                  label="Dictate closing note"
                  onTranscript={(t) => setNotes((p) => (p ? `${p} ${t}` : t))}
                />
              </div>
            </label>

            <p className="text-[11px] text-[#57534E] dark:text-[#A8A29E]">
              Closing seals {date} in the ledger. Changes after closing require a visible
              correction entry with a reason.
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
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
                className="inline-flex items-center gap-2 min-h-[46px] px-6 rounded-xl bg-[#0F5132] hover:bg-[#0B3E26] text-white text-sm font-semibold disabled:opacity-60 cursor-pointer"
              >
                <Lock className="w-4 h-4" />
                <span>{submitting ? 'Sealing Day…' : 'Seal Day & Generate Summary'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
