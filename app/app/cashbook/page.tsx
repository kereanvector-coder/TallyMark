'use client';

import React, { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Banknote,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  FilePlus2,
  FileText,
  HandCoins,
  History,
  Lock,
  PlusCircle,
  Search,
  X,
} from 'lucide-react';
import type {
  DayClosure,
  EntryCorrection,
  LedgerEntry,
  LedgerEntryType,
  PaymentMethod,
  Receipt,
} from '@/lib/database.types';
import { useAppContext } from '@/components/providers/AppProviders';
import { useBusiness } from '@/components/app/AppShell';
import { computeDailyCashBook } from '@/lib/cashbook';
import {
  addDaysToDate,
  formatLagosDate,
  formatLagosDateTime,
  formatNaira,
  formatPaymentMethod,
  todayInLagosDate,
} from '@/lib/format';
import { CloseDayModal } from '@/components/cashbook/CloseDayModal';
import { ExpenseModal } from '@/components/cashbook/ExpenseModal';

function CashBookContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = todayInLagosDate();
  const selectedDate = searchParams.get('date') || today;
  const wantsCloseParam = searchParams.get('close') === '1';

  const { supabase, notify } = useAppContext();
  const {
    business,
    lastMutationTick,
    notifyMutation,
    openQuickSaleModal,
    openQuickCreditSaleModal,
    openExpenseModal,
  } = useBusiness();

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [dayClosure, setDayClosure] = useState<DayClosure | null>(null);
  const [corrections, setCorrections] = useState<EntryCorrection[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | LedgerEntryType>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | PaymentMethod>('all');

  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closeModalDismissed, setCloseModalDismissed] = useState(false);
  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);

  // Proof signed URL preview modal
  const [proofPreview, setProofPreview] = useState<{
    url: string;
    isPdf: boolean;
    label: string;
  } | null>(null);

  useEffect(() => {
    if (!supabase || !business) return;
    let active = true;

    Promise.all([
      supabase
        .from('ledger_entries')
        .select('*')
        .eq('business_id', business.id)
        .lte('entry_date', selectedDate)
        .order('occurred_at', { ascending: true }),
      supabase
        .from('receipts')
        .select('*')
        .eq('business_id', business.id)
        .lte('entry_date', selectedDate),
      supabase
        .from('day_closures')
        .select('*')
        .eq('business_id', business.id)
        .eq('closure_date', selectedDate)
        .maybeSingle(),
      supabase
        .from('entry_corrections')
        .select('*')
        .eq('business_id', business.id)
        .order('created_at', { ascending: false })
        .limit(30),
    ]).then(([entriesRes, receiptsRes, closureRes, corrRes]) => {
      if (!active) return;
      setEntries(entriesRes.data ?? []);
      setReceipts(receiptsRes.data ?? []);
      setDayClosure(closureRes.data ?? null);
      setCorrections(corrRes.data ?? []);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [supabase, business, selectedDate, lastMutationTick]);

  const cashBook = useMemo(() => {
    if (!business) return null;
    return computeDailyCashBook({
      businessOpeningCashKobo: business.opening_cash_balance_kobo,
      entries,
      receipts,
      date: selectedDate,
    });
  }, [business, entries, receipts, selectedDate]);

  const filteredRows = useMemo(() => {
    if (!cashBook) return [];
    const q = searchQuery.trim().toLowerCase();
    return cashBook.rows.filter((row) => {
      if (typeFilter !== 'all' && row.entry.type !== typeFilter) return false;
      if (methodFilter !== 'all' && row.entry.payment_method !== methodFilter) return false;
      if (!q) return true;
      return (
        row.entry.description.toLowerCase().includes(q) ||
        (row.entry.payee && row.entry.payee.toLowerCase().includes(q)) ||
        (row.entry.category && row.entry.category.toLowerCase().includes(q)) ||
        (row.entry.sold_by && row.entry.sold_by.toLowerCase().includes(q)) ||
        (row.linkedReceipt &&
          (row.linkedReceipt.receipt_code.toLowerCase().includes(q) ||
            row.linkedReceipt.customer_name.toLowerCase().includes(q)))
      );
    });
  }, [cashBook, searchQuery, typeFilter, methodFilter]);

  const dayCorrections = useMemo(() => {
    if (!cashBook) return [];
    const dayEntryIds = new Set(cashBook.rows.map((r) => r.entry.id));
    return corrections.filter((c) => dayEntryIds.has(c.original_entry_id));
  }, [cashBook, corrections]);

  const navigateToDate = (newDate: string) => {
    setLoading(true);
    setCloseModalDismissed(false);
    setCloseModalOpen(false);
    router.push(`/app/cashbook?date=${newDate}`);
  };

  const handleOpenProof = async (proofPath: string, label: string) => {
    if (!supabase) return;
    const { data, error } = await supabase.storage
      .from('expense-proofs')
      .createSignedUrl(proofPath, 300);
    if (error || !data?.signedUrl) {
      notify({
        title: 'Could not load proof',
        description: error?.message || 'Storage link unavailable.',
        variant: 'error',
      });
      return;
    }
    setProofPreview({
      url: data.signedUrl,
      isPdf: proofPath.toLowerCase().endsWith('.pdf'),
      label,
    });
  };

  if (!business || !cashBook) return null;

  const { summary } = cashBook;
  const isClosed = Boolean(dayClosure);
  const showCloseModal =
    closeModalOpen || (wantsCloseParam && !closeModalDismissed && !loading);

  return (
    <div className="space-y-6">
      {/* Top Bar & Date Navigation */}
      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[#0F5132] dark:text-[#2D8A5E]">
            Digital Cash Book
          </p>
          <h1 className="font-display text-3xl sm:text-4xl">
            {formatLagosDate(`${selectedDate}T12:00:00+01:00`)}
          </h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-1">
            <button
              type="button"
              onClick={() => navigateToDate(addDaysToDate(selectedDate, -1))}
              aria-label="Previous day"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg hover:bg-[#FAF7F0] dark:hover:bg-[#202420] cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <label className="relative flex items-center px-2">
              <Calendar className="w-3.5 h-3.5 text-[#57534E] dark:text-[#A8A29E] mr-1.5" />
              <input
                type="date"
                value={selectedDate}
                max={today}
                onChange={(e) => {
                  if (e.target.value) navigateToDate(e.target.value);
                }}
                aria-label="Choose date"
                className="bg-transparent text-xs sm:text-sm font-mono-ledger font-medium focus:outline-none cursor-pointer"
              />
            </label>
            <button
              type="button"
              disabled={selectedDate >= today}
              onClick={() => navigateToDate(addDaysToDate(selectedDate, 1))}
              aria-label="Next day"
              className="min-h-[38px] min-w-[38px] flex items-center justify-center rounded-lg hover:bg-[#FAF7F0] dark:hover:bg-[#202420] disabled:opacity-40 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {selectedDate !== today && (
            <button
              type="button"
              onClick={() => navigateToDate(today)}
              className="min-h-[42px] px-3.5 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] text-xs font-semibold cursor-pointer"
            >
              Today
            </button>
          )}

          {isClosed ? (
            <button
              type="button"
              onClick={() => setCloseModalOpen(true)}
              className="inline-flex items-center gap-2 min-h-[42px] px-4 rounded-xl bg-[#0F5132]/10 dark:bg-[#2D8A5E]/20 border border-[#0F5132]/30 text-[#0F5132] dark:text-[#7CE0AC] text-xs sm:text-sm font-semibold cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Day Sealed · View Summary</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setCloseModalOpen(true)}
              className="inline-flex items-center gap-2 min-h-[42px] px-4 rounded-xl bg-[#0F5132] hover:bg-[#0B3E26] text-white text-xs sm:text-sm font-semibold cursor-pointer"
            >
              <Lock className="w-4 h-4" />
              <span>Close Day</span>
            </button>
          )}
        </div>
      </section>

      {/* Quick Entry Toolbar (for open days, or notice on closed days) */}
      {isClosed ? (
        <div className="rounded-2xl border border-[#0F5132]/25 bg-[#0F5132]/5 dark:bg-[#0F5132]/15 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <p className="text-[#141413] dark:text-[#F4F1EA]">
            <span className="font-semibold">This day is sealed.</span> Direct edits are locked —
            use <span className="font-semibold">Correct</span> on any expense or quick sale to post
            a visible adjustment with reason.
          </p>
          <span className="font-mono-ledger text-[#0F5132] dark:text-[#7CE0AC]">
            Counted Cash: {formatNaira(dayClosure?.actual_cash_counted_kobo ?? summary.expectedClosingCashKobo)}
          </span>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/app/receipts/new"
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-xl bg-[#0F5132] hover:bg-[#0B3E26] text-white text-xs font-semibold"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>Issue Receipt</span>
          </Link>
          <button
            type="button"
            onClick={() => openQuickSaleModal(selectedDate)}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] text-xs font-semibold hover:border-[#0F5132] cursor-pointer"
          >
            <Banknote className="w-3.5 h-3.5 text-[#0F5132] dark:text-[#7CE0AC]" />
            <span>Quick Sale</span>
          </button>
          <button
            type="button"
            onClick={() => openQuickCreditSaleModal(selectedDate)}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] text-xs font-semibold hover:border-amber-600 cursor-pointer"
          >
            <HandCoins className="w-3.5 h-3.5 text-amber-700 dark:text-amber-400" />
            <span>Credit Sale</span>
          </button>
          <button
            type="button"
            onClick={() => openExpenseModal(selectedDate)}
            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] text-xs font-semibold hover:border-red-600 cursor-pointer"
          >
            <FilePlus2 className="w-3.5 h-3.5 text-red-700 dark:text-red-400" />
            <span>Expense</span>
          </button>
        </div>
      )}

      {/* Daily Balances Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-[#57534E] dark:text-[#A8A29E]">
            Opening Balance
          </p>
          <p className="font-mono-ledger text-xl font-semibold">
            {loading ? '—' : formatNaira(summary.openingTotalKobo)}
          </p>
          <p className="text-[11px] text-[#57534E] dark:text-[#A8A29E] font-mono-ledger">
            Cash {formatNaira(summary.openingCashKobo)} · Bank/POS{' '}
            {formatNaira(summary.openingBankPosKobo)}
          </p>
        </div>

        <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-[#57534E] dark:text-[#A8A29E]">
            Money In Today
          </p>
          <p className="font-mono-ledger text-xl font-semibold text-[#0F5132] dark:text-[#7CE0AC]">
            {loading ? '—' : formatNaira(summary.moneyInTotalKobo)}
          </p>
          <p className="text-[11px] text-[#57534E] dark:text-[#A8A29E] font-mono-ledger">
            Cash {formatNaira(summary.cashInKobo)} · Trf {formatNaira(summary.transferInKobo)} · POS{' '}
            {formatNaira(summary.posInKobo)}
          </p>
        </div>

        <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-[#57534E] dark:text-[#A8A29E]">
            Money Out Today
          </p>
          <p className="font-mono-ledger text-xl font-semibold text-red-700 dark:text-red-400">
            {loading ? '—' : formatNaira(summary.moneyOutTotalKobo)}
          </p>
          <p className="text-[11px] text-[#57534E] dark:text-[#A8A29E] font-mono-ledger">
            Expenses {formatNaira(summary.expensesKobo)} · Credit given{' '}
            {formatNaira(summary.creditSalesKobo)}
          </p>
        </div>

        <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-4 space-y-1">
          <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-[#57534E] dark:text-[#A8A29E]">
            Closing Balance
          </p>
          <p className="font-mono-ledger text-xl font-semibold">
            {loading ? '—' : formatNaira(summary.closingTotalKobo)}
          </p>
          <p className="text-[11px] text-[#57534E] dark:text-[#A8A29E] font-mono-ledger">
            Cash {formatNaira(summary.expectedClosingCashKobo)} · Net{' '}
            {formatNaira(summary.netCashBookKobo)}
          </p>
        </div>
      </section>

      {/* Search & Filters */}
      <section className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#57534E] dark:text-[#A8A29E] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search description, receipt code, payee, staff…"
            className="w-full min-h-[44px] pl-10 pr-3.5 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] text-sm"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'all' | LedgerEntryType)}
          aria-label="Filter by entry type"
          className="min-h-[44px] px-3 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] text-xs sm:text-sm"
        >
          <option value="all">All Types</option>
          <option value="sale">Sales</option>
          <option value="payment_received">Debt Payments</option>
          <option value="expense">Expenses</option>
          <option value="adjustment">Adjustments</option>
        </select>

        <select
          value={methodFilter}
          onChange={(e) => setMethodFilter(e.target.value as 'all' | PaymentMethod)}
          aria-label="Filter by payment method"
          className="min-h-[44px] px-3 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] text-xs sm:text-sm"
        >
          <option value="all">All Methods</option>
          <option value="cash">Cash</option>
          <option value="transfer">Bank Transfer</option>
          <option value="pos">POS</option>
          <option value="card">Card</option>
          <option value="credit">Credit</option>
          <option value="other">Other</option>
        </select>
      </section>

      {/* Chronological Ledger Entries */}
      <section className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-14 rounded-xl bg-[#E5DFD2]/50 dark:bg-[#2A2E2A]/50 animate-pulse"
              />
            ))}
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="p-8 sm:p-10 text-center space-y-2">
            <p className="font-display text-2xl">
              {cashBook.rows.length === 0
                ? 'No entries recorded for this day'
                : 'No entries match your filter'}
            </p>
            <p className="text-xs sm:text-sm text-[#57534E] dark:text-[#A8A29E] max-w-md mx-auto">
              {cashBook.rows.length === 0
                ? 'Opening balance carries forward cleanly from previous days. Use Quick Sale, Issue Receipt, or Expense above to record activity.'
                : 'Clear your search or filter to see all chronological entries.'}
            </p>
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5DFD2] dark:border-[#2A2E2A] text-[11px] uppercase tracking-[0.06em] font-mono-ledger text-[#57534E] dark:text-[#A8A29E]">
                    <th className="py-3 px-4">Time &amp; Type</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4">Method</th>
                    <th className="py-3 px-4 text-right">In / Out</th>
                    <th className="py-3 px-4 text-right">Cash Bal</th>
                    <th className="py-3 px-4 text-right">Bank/POS Bal</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5DFD2] dark:divide-[#2A2E2A] text-sm">
                  {filteredRows.map(({ entry, effect, runningCashKobo, runningBankPosKobo, linkedReceipt }) => {
                    const canCorrect =
                      !entry.receipt_id &&
                      !effect.isCreditSale &&
                      (entry.type === 'expense' || (isClosed && entry.type === 'sale'));

                    return (
                      <tr
                        key={entry.id}
                        className="hover:bg-[#FAF7F0]/70 dark:hover:bg-[#202420]/40"
                      >
                        <td className="py-3 px-4 whitespace-nowrap align-top">
                          <p className="font-mono-ledger text-xs text-[#57534E] dark:text-[#A8A29E]">
                            {new Intl.DateTimeFormat('en-NG', {
                              timeZone: 'Africa/Lagos',
                              hour: '2-digit',
                              minute: '2-digit',
                              hour12: true,
                            }).format(new Date(entry.occurred_at))}
                          </p>
                          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#57534E] dark:text-[#A8A29E]">
                            {effect.isQuickSale
                              ? 'Quick Sale'
                              : effect.isCreditSale
                                ? 'Credit Sale'
                                : entry.type === 'expense'
                                  ? entry.category || 'Expense'
                                  : entry.type === 'payment_received'
                                    ? 'Debt Payment'
                                    : entry.type === 'adjustment'
                                      ? 'Adjustment'
                                      : 'Receipt'}
                          </p>
                        </td>

                        <td className="py-3 px-4 align-top max-w-xs">
                          <p className="font-medium leading-snug">{entry.description}</p>
                          <p className="text-xs text-[#57534E] dark:text-[#A8A29E] mt-0.5">
                            {[
                              linkedReceipt ? linkedReceipt.receipt_code : null,
                              entry.payee ? `Payee: ${entry.payee}` : null,
                              entry.sold_by ? `By: ${entry.sold_by}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap align-top text-xs">
                          {formatPaymentMethod(entry.payment_method)}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap align-top text-right font-mono-ledger font-semibold">
                          {effect.moneyInKobo > 0 ? (
                            <span className="text-[#0F5132] dark:text-[#7CE0AC]">
                              +{formatNaira(effect.moneyInKobo)}
                            </span>
                          ) : effect.moneyOutKobo > 0 ? (
                            <span className="text-red-700 dark:text-red-400">
                              -{formatNaira(effect.moneyOutKobo)}
                            </span>
                          ) : (
                            <span className="text-amber-700 dark:text-amber-400 text-xs">
                              {formatNaira(entry.amount_kobo)} credit
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap align-top text-right font-mono-ledger text-xs">
                          {formatNaira(runningCashKobo)}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap align-top text-right font-mono-ledger text-xs text-[#57534E] dark:text-[#A8A29E]">
                          {formatNaira(runningBankPosKobo)}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap align-top text-right">
                          <div className="inline-flex items-center justify-end gap-1.5">
                            {effect.isQuickSale && !isClosed && (
                              <Link
                                href={`/app/receipts/new?fromEntry=${entry.id}`}
                                className="inline-flex items-center gap-1 min-h-[32px] px-2.5 rounded-lg border border-[#0F5132]/40 text-[#0F5132] dark:text-[#7CE0AC] text-xs font-semibold hover:bg-[#0F5132]/10"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                <span>Issue Receipt</span>
                              </Link>
                            )}
                            {entry.receipt_id && (
                              <Link
                                href={`/app/receipts/${entry.receipt_id}`}
                                className="inline-flex items-center gap-1 min-h-[32px] px-2.5 rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A] text-xs font-medium hover:border-[#0F5132]"
                              >
                                <span>Receipt</span>
                              </Link>
                            )}
                            {entry.proof_path && (
                              <button
                                type="button"
                                onClick={() => handleOpenProof(entry.proof_path!, entry.description)}
                                className="inline-flex items-center gap-1 min-h-[32px] px-2.5 rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A] text-xs font-medium cursor-pointer"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                <span>Proof</span>
                              </button>
                            )}
                            {canCorrect && (
                              <button
                                type="button"
                                onClick={() => setEditingEntry(entry)}
                                className="inline-flex items-center gap-1 min-h-[32px] px-2.5 rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A] text-xs font-medium hover:border-[#0F5132] cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>{isClosed ? 'Correct' : 'Edit'}</span>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-[#E5DFD2] dark:divide-[#2A2E2A]">
              {filteredRows.map(({ entry, effect, runningCashKobo, runningBankPosKobo, linkedReceipt }) => {
                const canCorrect =
                  !entry.receipt_id &&
                  !effect.isCreditSale &&
                  (entry.type === 'expense' || (isClosed && entry.type === 'sale'));

                return (
                  <div key={entry.id} className="p-4 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-[11px] uppercase tracking-[0.06em] font-mono-ledger text-[#57534E] dark:text-[#A8A29E]">
                          {effect.isQuickSale
                            ? 'Quick Sale'
                            : effect.isCreditSale
                              ? 'Credit Sale'
                              : entry.type === 'expense'
                                ? entry.category || 'Expense'
                                : entry.type === 'payment_received'
                                  ? 'Debt Payment'
                                  : entry.type}{' '}
                          · {formatPaymentMethod(entry.payment_method)}
                        </p>
                        <p className="text-sm font-medium">{entry.description}</p>
                        {(linkedReceipt || entry.payee || entry.sold_by) && (
                          <p className="text-xs text-[#57534E] dark:text-[#A8A29E]">
                            {[
                              linkedReceipt?.receipt_code,
                              entry.payee ? `Payee: ${entry.payee}` : null,
                              entry.sold_by ? `By: ${entry.sold_by}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0">
                        <p
                          className={`font-mono-ledger text-sm font-semibold ${
                            effect.moneyInKobo > 0
                              ? 'text-[#0F5132] dark:text-[#7CE0AC]'
                              : effect.moneyOutKobo > 0
                                ? 'text-red-700 dark:text-red-400'
                                : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {effect.moneyInKobo > 0
                            ? `+${formatNaira(effect.moneyInKobo)}`
                            : effect.moneyOutKobo > 0
                              ? `-${formatNaira(effect.moneyOutKobo)}`
                              : `${formatNaira(entry.amount_kobo)} credit`}
                        </p>
                        <p className="font-mono-ledger text-[11px] text-[#57534E] dark:text-[#A8A29E]">
                          Cash {formatNaira(runningCashKobo)} · Bank {formatNaira(runningBankPosKobo)}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {effect.isQuickSale && !isClosed && (
                        <Link
                          href={`/app/receipts/new?fromEntry=${entry.id}`}
                          className="inline-flex items-center gap-1 min-h-[34px] px-3 rounded-lg border border-[#0F5132]/40 text-[#0F5132] dark:text-[#7CE0AC] text-xs font-semibold"
                        >
                          <FileText className="w-3.5 h-3.5" />
                          <span>Issue Receipt</span>
                        </Link>
                      )}
                      {entry.receipt_id && (
                        <Link
                          href={`/app/receipts/${entry.receipt_id}`}
                          className="inline-flex items-center gap-1 min-h-[34px] px-3 rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A] text-xs font-medium"
                        >
                          <span>View Receipt</span>
                        </Link>
                      )}
                      {entry.proof_path && (
                        <button
                          type="button"
                          onClick={() => handleOpenProof(entry.proof_path!, entry.description)}
                          className="inline-flex items-center gap-1 min-h-[34px] px-3 rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A] text-xs font-medium cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Proof</span>
                        </button>
                      )}
                      {canCorrect && (
                        <button
                          type="button"
                          onClick={() => setEditingEntry(entry)}
                          className="inline-flex items-center gap-1 min-h-[34px] px-3 rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A] text-xs font-medium cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>{isClosed ? 'Correct' : 'Edit'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* Visible Closed-Day Edit History */}
      {dayCorrections.length > 0 && (
        <section className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#0F5132] dark:text-[#7CE0AC]" />
            <h2 className="text-sm font-semibold">Closed-Day Correction History</h2>
          </div>
          <div className="divide-y divide-[#E5DFD2] dark:divide-[#2A2E2A] text-xs">
            {dayCorrections.map((c) => {
              const before = c.before_snapshot as {
                amount_kobo?: number;
                description?: string;
                payment_method?: string;
              };
              const after = c.after_snapshot as {
                amount_kobo?: number;
                description?: string;
                payment_method?: string;
              } | null;

              return (
                <div key={c.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <p className="font-semibold">
                      {c.action === 'delete' ? 'Reversed & Removed' : 'Corrected'}:{' '}
                      {before.description || 'Entry'}
                    </p>
                    <p className="text-[#57534E] dark:text-[#A8A29E]">Reason: {c.reason}</p>
                  </div>
                  <div className="font-mono-ledger text-right text-[#57534E] dark:text-[#A8A29E]">
                    <span>{formatNaira(before.amount_kobo || 0)}</span>
                    {after ? (
                      <span> → {formatNaira(after.amount_kobo || 0)}</span>
                    ) : (
                      <span> → Reversed</span>
                    )}
                    <p className="text-[11px]">{formatLagosDateTime(c.created_at)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Close Day / Sealed Summary Modal */}
      {showCloseModal && (
        <CloseDayModal
          date={selectedDate}
          summary={summary}
          rows={cashBook.rows}
          existingClosure={dayClosure}
          onClose={() => {
            setCloseModalOpen(false);
            setCloseModalDismissed(true);
            if (wantsCloseParam) {
              router.replace(`/app/cashbook?date=${selectedDate}`);
            }
          }}
          onClosed={(closure) => {
            setDayClosure(closure);
            notifyMutation();
          }}
        />
      )}

      {/* Edit / Correct Expense or Closed-Day Entry Modal */}
      {editingEntry && (
        <ExpenseModal
          editingEntry={editingEntry}
          isDayClosed={isClosed}
          onClose={() => setEditingEntry(null)}
          onSuccess={() => {
            setEditingEntry(null);
            notifyMutation();
          }}
        />
      )}

      {/* Signed URL Proof Preview Modal */}
      {proofPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] overflow-hidden shadow-2xl">
            <div className="px-4 py-3 border-b border-[#E5DFD2] dark:border-[#2A2E2A] flex items-center justify-between gap-3">
              <p className="text-sm font-semibold truncate">Proof: {proofPreview.label}</p>
              <button
                type="button"
                onClick={() => setProofPreview(null)}
                aria-label="Close proof preview"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg hover:bg-[#FAF7F0] dark:hover:bg-[#202420] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-[#FAF7F0] dark:bg-[#101210] max-h-[75vh] overflow-auto flex justify-center">
              {proofPreview.isPdf ? (
                <iframe
                  src={proofPreview.url}
                  title={proofPreview.label}
                  className="w-full h-[65vh] rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A]"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={proofPreview.url}
                  alt={proofPreview.label}
                  className="max-h-[65vh] w-auto rounded-lg object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function CashBookPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="h-12 w-48 rounded-xl bg-[#E5DFD2]/50 dark:bg-[#2A2E2A]/50 animate-pulse" />
          <div className="h-64 rounded-2xl bg-[#E5DFD2]/50 dark:bg-[#2A2E2A]/50 animate-pulse" />
        </div>
      }
    >
      <CashBookContent />
    </Suspense>
  );
}
