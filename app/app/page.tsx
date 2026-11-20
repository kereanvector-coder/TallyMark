'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Banknote,
  BookOpen,
  CheckCircle2,
  Clock,
  FilePlus2,
  HandCoins,
  PlusCircle,
} from 'lucide-react';
import type { DayClosure, Debt, LedgerEntry, Receipt } from '@/lib/database.types';
import { useAppContext } from '@/components/providers/AppProviders';
import { useBusiness } from '@/components/app/AppShell';
import { computeDailyCashBook } from '@/lib/cashbook';
import {
  formatLagosDate,
  formatLagosDateTime,
  formatNaira,
  formatPaymentMethod,
  todayInLagosDate,
  yesterdayInLagosDate,
} from '@/lib/format';

export default function AppHomePage() {
  const { supabase } = useAppContext();
  const {
    business,
    lastMutationTick,
    openQuickSaleModal,
    openQuickCreditSaleModal,
    openExpenseModal,
  } = useBusiness();

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [openDebts, setOpenDebts] = useState<Debt[]>([]);
  const [closures, setClosures] = useState<DayClosure[]>([]);
  const [loading, setLoading] = useState(true);

  const today = todayInLagosDate();
  const yesterday = yesterdayInLagosDate();

  useEffect(() => {
    if (!supabase || !business) return;
    let active = true;

    Promise.all([
      supabase
        .from('ledger_entries')
        .select('*')
        .eq('business_id', business.id)
        .lte('entry_date', today)
        .order('occurred_at', { ascending: true }),
      supabase
        .from('receipts')
        .select('*')
        .eq('business_id', business.id)
        .lte('entry_date', today)
        .order('issued_at', { ascending: false }),
      supabase
        .from('debts')
        .select('*')
        .eq('business_id', business.id)
        .in('status', ['open', 'partial']),
      supabase
        .from('day_closures')
        .select('*')
        .eq('business_id', business.id)
        .in('closure_date', [yesterday, today]),
    ]).then(([entriesRes, receiptsRes, debtsRes, closuresRes]) => {
      if (!active) return;
      setEntries(entriesRes.data ?? []);
      setReceipts(receiptsRes.data ?? []);
      setOpenDebts(debtsRes.data ?? []);
      setClosures(closuresRes.data ?? []);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [supabase, business, today, yesterday, lastMutationTick]);

  const cashBookToday = useMemo(() => {
    if (!business) return null;
    return computeDailyCashBook({
      businessOpeningCashKobo: business.opening_cash_balance_kobo,
      entries,
      receipts,
      date: today,
    });
  }, [business, entries, receipts, today]);

  const yesterdayClosure = useMemo(
    () => closures.find((c) => c.closure_date === yesterday) ?? null,
    [closures, yesterday]
  );

  const todayClosure = useMemo(
    () => closures.find((c) => c.closure_date === today) ?? null,
    [closures, today]
  );

  const yesterdayHasEntries = useMemo(
    () => entries.some((e) => e.entry_date === yesterday),
    [entries, yesterday]
  );

  const outstandingDebtsKobo = useMemo(
    () => openDebts.reduce((sum, d) => sum + d.balance_kobo, 0),
    [openDebts]
  );

  const recentActivity = useMemo(() => {
    return [...entries].reverse().slice(0, 8);
  }, [entries]);

  if (!business || !cashBookToday) return null;

  const { summary } = cashBookToday;

  return (
    <div className="space-y-8">
      {/* Header & Quick Actions */}
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[#0F5132] dark:text-[#2D8A5E]">
            {formatLagosDate(`${today}T12:00:00+01:00`)} · {business.name}
          </p>
          <h1 className="font-display text-3xl sm:text-5xl">Today&apos;s Book</h1>
        </div>

        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          <Link
            href="/app/receipts/new"
            className="inline-flex items-center justify-center gap-2 min-h-[46px] px-4 rounded-xl bg-[#0F5132] hover:bg-[#0B3E26] text-white text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap"
          >
            <PlusCircle className="w-4 h-4 shrink-0" />
            <span>Issue Receipt</span>
          </Link>
          <button
            type="button"
            onClick={() => openQuickSaleModal(today)}
            className="inline-flex items-center justify-center gap-2 min-h-[46px] px-4 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] hover:border-[#0F5132] text-xs sm:text-sm font-semibold cursor-pointer whitespace-nowrap"
          >
            <Banknote className="w-4 h-4 text-[#0F5132] dark:text-[#7CE0AC] shrink-0" />
            <span>Quick Sale</span>
          </button>
          <button
            type="button"
            onClick={() => openQuickCreditSaleModal(today)}
            className="inline-flex items-center justify-center gap-2 min-h-[46px] px-4 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] hover:border-amber-600 text-xs sm:text-sm font-semibold cursor-pointer whitespace-nowrap"
          >
            <HandCoins className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0" />
            <span>Credit Sale</span>
          </button>
          <button
            type="button"
            onClick={() => openExpenseModal(today)}
            className="inline-flex items-center justify-center gap-2 min-h-[46px] px-4 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] hover:border-red-600 text-xs sm:text-sm font-semibold cursor-pointer whitespace-nowrap"
          >
            <FilePlus2 className="w-4 h-4 text-red-700 dark:text-red-400 shrink-0" />
            <span>Expense</span>
          </button>
        </div>
      </section>

      {/* Primary KPI Strip */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-[#57534E] dark:text-[#A8A29E]">
            Today&apos;s Sales
          </p>
          <p className="font-mono-ledger text-2xl sm:text-3xl font-semibold tabular-figures text-[#0F5132] dark:text-[#7CE0AC]">
            {loading ? '—' : formatNaira(summary.totalSoldKobo)}
          </p>
          <p className="text-xs text-[#57534E] dark:text-[#A8A29E]">
            Collected today: {loading ? '—' : formatNaira(summary.moneyInTotalKobo)}
          </p>
        </div>

        <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-[#57534E] dark:text-[#A8A29E]">
            Today&apos;s Expenses
          </p>
          <p className="font-mono-ledger text-2xl sm:text-3xl font-semibold tabular-figures text-red-700 dark:text-red-400">
            {loading ? '—' : formatNaira(summary.expensesKobo)}
          </p>
          <p className="text-xs text-[#57534E] dark:text-[#A8A29E]">
            Total money out: {loading ? '—' : formatNaira(summary.moneyOutTotalKobo)}
          </p>
        </div>

        <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-[#57534E] dark:text-[#A8A29E]">
            Net (money in minus money out)
          </p>
          <p
            className={`font-mono-ledger text-2xl sm:text-3xl font-semibold tabular-figures ${
              summary.netCashBookKobo >= 0
                ? 'text-[#0F5132] dark:text-[#7CE0AC]'
                : 'text-red-700 dark:text-red-400'
            }`}
          >
            {loading ? '—' : formatNaira(summary.netCashBookKobo)}
          </p>
          <p className="text-xs text-[#57534E] dark:text-[#A8A29E]">
            Excludes unpaid credit ({formatNaira(summary.creditSalesKobo)})
          </p>
        </div>

        <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-[#57534E] dark:text-[#A8A29E]">
            Cash in Hand
          </p>
          <p className="font-mono-ledger text-2xl sm:text-3xl font-semibold tabular-figures">
            {loading ? '—' : formatNaira(summary.expectedClosingCashKobo)}
          </p>
          <p className="text-xs text-[#57534E] dark:text-[#A8A29E]">
            Transfer &amp; POS bal: {loading ? '—' : formatNaira(summary.closingBankPosKobo)}
          </p>
        </div>
      </section>

      {/* Debts & Day Closure Status Strip */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Link
          href="/app/debtors"
          className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 flex items-center justify-between gap-4 hover:border-[#0F5132] transition-colors"
        >
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-[#57534E] dark:text-[#A8A29E]">
              Owed to You (Debtors)
            </p>
            <p className="font-mono-ledger text-2xl font-semibold text-amber-700 dark:text-amber-400">
              {loading ? '—' : formatNaira(outstandingDebtsKobo)}
            </p>
            <p className="text-xs text-[#57534E] dark:text-[#A8A29E]">
              {openDebts.length} open customer {openDebts.length === 1 ? 'balance' : 'balances'}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F5132] dark:text-[#7CE0AC] shrink-0">
            <span>Manage</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </Link>

        <Link
          href={`/app/cashbook?date=${yesterdayHasEntries && !yesterdayClosure ? yesterday : today}`}
          className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 flex items-center justify-between gap-4 hover:border-[#0F5132] transition-colors"
        >
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-[#57534E] dark:text-[#A8A29E]">
              Day Closure Status
            </p>
            {yesterdayHasEntries && !yesterdayClosure ? (
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-400">
                <Clock className="w-5 h-5 shrink-0" />
                <span className="text-lg font-semibold">Yesterday unclosed</span>
              </div>
            ) : todayClosure ? (
              <div className="flex items-center gap-2 text-[#0F5132] dark:text-[#7CE0AC]">
                <CheckCircle2 className="w-5 h-5 shrink-0" />
                <span className="text-lg font-semibold">Today is closed</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-[#0F5132] dark:text-[#7CE0AC] shrink-0" />
                <span className="text-lg font-semibold">
                  {yesterdayClosure ? 'Yesterday closed · Today open' : 'Today is open'}
                </span>
              </div>
            )}
            <p className="text-xs text-[#57534E] dark:text-[#A8A29E]">
              {yesterdayHasEntries && !yesterdayClosure
                ? `Tap to count cash and seal ${yesterday}`
                : 'Open Cash Book to review entries or close the day'}
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F5132] dark:text-[#7CE0AC] shrink-0">
            <span>Cash Book</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </Link>
      </section>

      {/* Recent Cash Book Activity */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Recent Ledger Activity</h2>
          <Link
            href="/app/cashbook"
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F5132] dark:text-[#7CE0AC] hover:underline"
          >
            <span>Open full Cash Book</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        {loading ? (
          <div className="space-y-2.5">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 rounded-2xl bg-[#E5DFD2]/50 dark:bg-[#2A2E2A]/50 animate-pulse"
              />
            ))}
          </div>
        ) : recentActivity.length === 0 ? (
          <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-8 sm:p-10 text-center space-y-3">
            <h3 className="font-display text-2xl sm:text-3xl">
              Your digital cash book starts with your first entry
            </h3>
            <p className="text-sm text-[#57534E] dark:text-[#A8A29E] max-w-md mx-auto leading-relaxed">
              Issue a receipt, tap Quick Sale for fast counter sales, or record an expense. Every
              entry updates your Cash Book automatically.
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-2">
              <Link
                href="/app/receipts/new"
                className="inline-flex items-center justify-center gap-2 min-h-[46px] px-5 rounded-xl bg-[#0F5132] text-white text-sm font-semibold"
              >
                <PlusCircle className="w-4 h-4" />
                <span>Issue Receipt</span>
              </Link>
              <button
                type="button"
                onClick={() => openQuickSaleModal(today)}
                className="inline-flex items-center justify-center gap-2 min-h-[46px] px-5 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] text-sm font-semibold cursor-pointer"
              >
                <Banknote className="w-4 h-4 text-[#0F5132] dark:text-[#7CE0AC]" />
                <span>Quick Sale</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] divide-y divide-[#E5DFD2] dark:divide-[#2A2E2A]">
            {recentActivity.map((e) => {
              const isOut =
                e.type === 'expense' || (e.type === 'adjustment' && e.amount_kobo < 0);
              const isCredit = e.is_credit_sale || e.payment_method === 'credit';
              const targetHref = e.receipt_id
                ? `/app/receipts/${e.receipt_id}`
                : `/app/cashbook?date=${e.entry_date}`;

              return (
                <Link
                  key={e.id}
                  href={targetHref}
                  className="p-4 sm:px-5 flex items-center justify-between gap-4 hover:bg-[#FAF7F0]/70 dark:hover:bg-[#202420]/50 transition-colors"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="font-mono-ledger text-[11px] uppercase tracking-[0.06em] font-semibold text-[#57534E] dark:text-[#A8A29E]">
                        {e.type === 'sale'
                          ? isCredit
                            ? 'Credit Sale'
                            : e.receipt_id
                              ? 'Receipt Sale'
                              : 'Quick Sale'
                          : e.type === 'payment_received'
                            ? 'Debt Payment'
                            : e.type === 'expense'
                              ? e.category || 'Expense'
                              : 'Adjustment'}
                      </span>
                      <span aria-hidden="true" className="text-[#57534E]">
                        ·
                      </span>
                      <span className="text-sm font-medium truncate">{e.description}</span>
                    </div>
                    <p className="text-xs text-[#57534E] dark:text-[#A8A29E]">
                      {formatLagosDateTime(e.occurred_at)} · {formatPaymentMethod(e.payment_method)}
                      {e.sold_by ? ` · ${e.sold_by}` : ''}
                    </p>
                  </div>

                  <div className="text-right shrink-0">
                    <p
                      className={`font-mono-ledger text-sm sm:text-base font-semibold ${
                        isOut
                          ? 'text-red-700 dark:text-red-400'
                          : isCredit
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-[#0F5132] dark:text-[#7CE0AC]'
                      }`}
                    >
                      {isOut ? '-' : isCredit ? '' : '+'}
                      {formatNaira(Math.abs(e.amount_kobo))}
                    </p>
                    {isCredit && (
                      <p className="text-[11px] text-[#57534E] dark:text-[#A8A29E]">
                        Credit (₦0 cash)
                      </p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
