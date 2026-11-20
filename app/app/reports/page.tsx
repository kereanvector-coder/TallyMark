'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Download, FileSpreadsheet } from 'lucide-react';
import type { Customer, Debt, LedgerEntry, Receipt } from '@/lib/database.types';
import { useAppContext } from '@/components/providers/AppProviders';
import { useBusiness } from '@/components/app/AppShell';
import { computeDebtCustomerSummaries, computeReportMetrics } from '@/lib/cashbook';
import {
  buildDebtorsCsv,
  buildExpensesCsv,
  buildLedgerCsv,
  buildReceiptsCsv,
  downloadCsvFile,
} from '@/lib/csv';
import { generateReportsSummaryPdfBytes } from '@/lib/pdf/cashbook-pdf';
import { addDaysToDate, formatNaira, todayInLagosDate } from '@/lib/format';

type PresetPeriod = 'today' | 'week' | 'month' | 'custom';

function getWeekStartYmd(todayYmd: string): string {
  const dt = new Date(`${todayYmd}T12:00:00Z`);
  const day = dt.getUTCDay(); // 0=Sun..6=Sat
  const offsetFromMonday = day === 0 ? -6 : 1 - day;
  return addDaysToDate(todayYmd, offsetFromMonday);
}

export default function ReportsPage() {
  const { supabase, notify } = useAppContext();
  const { business, lastMutationTick } = useBusiness();

  const today = todayInLagosDate();
  const [period, setPeriod] = useState<PresetPeriod>('month');
  const [customStart, setCustomStart] = useState(`${today.slice(0, 7)}-01`);
  const [customEnd, setCustomEnd] = useState(today);

  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);

  const { startDate, endDate } = useMemo(() => {
    if (period === 'today') return { startDate: today, endDate: today };
    if (period === 'week') return { startDate: getWeekStartYmd(today), endDate: today };
    if (period === 'month') return { startDate: `${today.slice(0, 7)}-01`, endDate: today };
    const s = customStart <= customEnd ? customStart : customEnd;
    const e = customStart <= customEnd ? customEnd : customStart;
    return { startDate: s, endDate: e };
  }, [period, today, customStart, customEnd]);

  useEffect(() => {
    if (!supabase || !business) return;
    let active = true;

    Promise.all([
      supabase
        .from('ledger_entries')
        .select('*')
        .eq('business_id', business.id)
        .order('occurred_at', { ascending: true }),
      supabase
        .from('receipts')
        .select('*')
        .eq('business_id', business.id)
        .order('issued_at', { ascending: false }),
      supabase.from('debts').select('*').eq('business_id', business.id),
      supabase.from('customers').select('*').eq('business_id', business.id),
    ]).then(([entriesRes, receiptsRes, debtsRes, custRes]) => {
      if (!active) return;
      setEntries(entriesRes.data ?? []);
      setReceipts(receiptsRes.data ?? []);
      setDebts(debtsRes.data ?? []);
      setCustomers(custRes.data ?? []);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [supabase, business, lastMutationTick]);

  const metrics = useMemo(
    () =>
      computeReportMetrics({
        entries,
        receipts,
        debts,
        customers,
        startDate,
        endDate,
      }),
    [entries, receipts, debts, customers, startDate, endDate]
  );

  const chartMaxKobo = useMemo(() => {
    let maxVal = 1;
    for (const pt of metrics.dailySeries) {
      if (pt.incomeKobo > maxVal) maxVal = pt.incomeKobo;
      if (pt.expenseKobo > maxVal) maxVal = pt.expenseKobo;
    }
    return maxVal;
  }, [metrics.dailySeries]);

  const handleDownloadPdf = async () => {
    if (!business) return;
    setExportingPdf(true);
    try {
      const bytes = await generateReportsSummaryPdfBytes({
        business,
        metrics,
      });
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Tallymark-Report-${startDate}-to-${endDate}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      notify({
        title: 'Report PDF failed',
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'error',
      });
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportCsv = (kind: 'receipts' | 'expenses' | 'ledger' | 'debtors') => {
    if (kind === 'receipts') {
      const periodReceipts = receipts.filter(
        (r) => r.entry_date >= startDate && r.entry_date <= endDate
      );
      downloadCsvFile(
        `Tallymark-Receipts-${startDate}-to-${endDate}.csv`,
        buildReceiptsCsv(periodReceipts)
      );
    } else if (kind === 'expenses') {
      const periodExpenses = entries.filter(
        (e) =>
          e.type === 'expense' && e.entry_date >= startDate && e.entry_date <= endDate
      );
      downloadCsvFile(
        `Tallymark-Expenses-${startDate}-to-${endDate}.csv`,
        buildExpensesCsv(periodExpenses)
      );
    } else if (kind === 'ledger') {
      const periodEntries = entries.filter(
        (e) => e.entry_date >= startDate && e.entry_date <= endDate
      );
      downloadCsvFile(
        `Tallymark-CashBook-${startDate}-to-${endDate}.csv`,
        buildLedgerCsv(periodEntries, receipts)
      );
    } else {
      const groups = computeDebtCustomerSummaries(debts, entries, today);
      downloadCsvFile(`Tallymark-Debtors-${today}.csv`, buildDebtorsCsv(groups));
    }
    notify({ title: 'CSV downloaded', variant: 'success' });
  };

  if (!business) return null;

  return (
    <div className="space-y-6">
      {/* Header & Period Switcher */}
      <section className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[#0F5132] dark:text-[#2D8A5E]">
            Business Performance
          </p>
          <h1 className="font-display text-3xl sm:text-4xl">Reports &amp; Exports</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-1">
            {(
              [
                ['today', 'Today'],
                ['week', 'Week'],
                ['month', 'Month'],
                ['custom', 'Custom'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setPeriod(key)}
                className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  period === key
                    ? 'bg-[#0F5132] text-white'
                    : 'text-[#57534E] dark:text-[#A8A29E]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleDownloadPdf}
            disabled={exportingPdf}
            className="inline-flex items-center gap-2 min-h-[42px] px-4 rounded-xl bg-[#0F5132] hover:bg-[#0B3E26] text-white text-xs sm:text-sm font-semibold disabled:opacity-60 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>{exportingPdf ? 'Generating…' : 'Summary PDF'}</span>
          </button>
        </div>
      </section>

      {period === 'custom' && (
        <section className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-medium">
            <span className="text-[#57534E] dark:text-[#A8A29E]">From</span>
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              className="min-h-[38px] px-2.5 rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] font-mono-ledger"
            />
          </label>
          <label className="flex items-center gap-2 text-xs font-medium">
            <span className="text-[#57534E] dark:text-[#A8A29E]">To</span>
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              className="min-h-[38px] px-2.5 rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] font-mono-ledger"
            />
          </label>
        </section>
      )}

      {/* Top KPI Cards: Sold vs Received, Expenses, Net */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-[#57534E] dark:text-[#A8A29E]">
            Sold (Total Value)
          </p>
          <p className="font-mono-ledger text-2xl sm:text-3xl font-semibold">
            {loading ? '—' : formatNaira(metrics.soldTotalKobo)}
          </p>
          <p className="text-[11px] text-[#57534E] dark:text-[#A8A29E] font-mono-ledger">
            Receipts {formatNaira(metrics.soldReceiptsKobo)} · Quick{' '}
            {formatNaira(metrics.soldQuickCashKobo)} · Credit{' '}
            {formatNaira(metrics.soldCreditKobo)}
          </p>
        </div>

        <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-[#57534E] dark:text-[#A8A29E]">
            Received (Money In)
          </p>
          <p className="font-mono-ledger text-2xl sm:text-3xl font-semibold text-[#0F5132] dark:text-[#7CE0AC]">
            {loading ? '—' : formatNaira(metrics.receivedTotalKobo)}
          </p>
          <p className="text-xs text-[#57534E] dark:text-[#A8A29E]">
            Cash, transfer, POS &amp; debt collections
          </p>
        </div>

        <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-[#57534E] dark:text-[#A8A29E]">
            Expenses &amp; Reversals
          </p>
          <p className="font-mono-ledger text-2xl sm:text-3xl font-semibold text-red-700 dark:text-red-400">
            {loading ? '—' : formatNaira(metrics.expensesTotalKobo)}
          </p>
          <p className="text-xs text-[#57534E] dark:text-[#A8A29E]">
            Money paid out in this period
          </p>
        </div>

        <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 space-y-1.5">
          <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-[#57534E] dark:text-[#A8A29E]">
            Net (money in minus money out)
          </p>
          <p
            className={`font-mono-ledger text-2xl sm:text-3xl font-semibold ${
              metrics.netMoneyInMinusOutKobo >= 0
                ? 'text-[#0F5132] dark:text-[#7CE0AC]'
                : 'text-red-700 dark:text-red-400'
            }`}
          >
            {loading ? '—' : formatNaira(metrics.netMoneyInMinusOutKobo)}
          </p>
          <p className="text-xs text-[#57534E] dark:text-[#A8A29E]">
            Cash flow basis ({startDate} – {endDate})
          </p>
        </div>
      </section>

      {/* Income vs Expenses Daily Chart */}
      <section className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Money Received vs Expenses</h2>
            <p className="text-xs text-[#57534E] dark:text-[#A8A29E]">
              Daily comparison across {startDate} to {endDate}
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#0F5132] dark:bg-[#2D8A5E]" />
              <span>Received</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-red-600 dark:bg-red-500" />
              <span>Expenses</span>
            </span>
          </div>
        </div>

        {metrics.dailySeries.length === 0 ? (
          <div className="h-44 flex items-center justify-center text-sm text-[#57534E] dark:text-[#A8A29E] border border-dashed border-[#E5DFD2] dark:border-[#2A2E2A] rounded-xl">
            No transactions recorded in this date range.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[420px]">
              <svg
                viewBox={`0 0 ${Math.max(420, metrics.dailySeries.length * 46)} 180`}
                className="w-full h-48 overflow-visible"
                role="img"
                aria-label="Income received vs expenses bar chart"
              >
                <line
                  x1="0"
                  y1="145"
                  x2={Math.max(420, metrics.dailySeries.length * 46)}
                  y2="145"
                  stroke="currentColor"
                  className="text-[#E5DFD2] dark:text-[#2A2E2A]"
                  strokeWidth="1"
                />
                {metrics.dailySeries.map((pt, idx) => {
                  const groupX = idx * 46 + 10;
                  const incH = Math.round((pt.incomeKobo / chartMaxKobo) * 125);
                  const expH = Math.round((pt.expenseKobo / chartMaxKobo) * 125);
                  return (
                    <g key={pt.date}>
                      <rect
                        x={groupX}
                        y={145 - incH}
                        width="13"
                        height={Math.max(incH, pt.incomeKobo > 0 ? 3 : 0)}
                        rx="3"
                        className="fill-[#0F5132] dark:fill-[#2D8A5E]"
                      >
                        <title>{`${pt.date} Received: ${formatNaira(pt.incomeKobo)}`}</title>
                      </rect>
                      <rect
                        x={groupX + 16}
                        y={145 - expH}
                        width="13"
                        height={Math.max(expH, pt.expenseKobo > 0 ? 3 : 0)}
                        rx="3"
                        className="fill-red-600 dark:fill-red-500"
                      >
                        <title>{`${pt.date} Expenses: ${formatNaira(pt.expenseKobo)}`}</title>
                      </rect>
                      <text
                        x={groupX + 14}
                        y="165"
                        textAnchor="middle"
                        className="fill-[#57534E] dark:fill-[#A8A29E] text-[9px] font-mono-ledger"
                      >
                        {pt.date.slice(5)}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        )}
      </section>

      {/* Breakdowns Grid */}
      <section className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <BreakdownCard title="Received by Payment Method" rows={metrics.byPaymentMethod} />
        <BreakdownCard
          title="Expenses by Category"
          rows={metrics.byExpenseCategory}
          tone="expense"
        />
        <BreakdownCard title='Money Received by "Sold By"' rows={metrics.bySoldBy} />
        <BreakdownCard title="Top Customers (by Sales)" rows={metrics.topCustomers} />
      </section>

      {/* Outstanding Debts Snapshot + CSV Exports */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Link
          href="/app/debtors"
          className="lg:col-span-5 rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 flex items-center justify-between gap-4 hover:border-[#0F5132] transition-colors"
        >
          <div className="space-y-1">
            <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-[#57534E] dark:text-[#A8A29E]">
              Current Open Customer Debts
            </p>
            <p className="font-mono-ledger text-2xl font-semibold text-amber-700 dark:text-amber-400">
              {loading ? '—' : formatNaira(metrics.outstandingDebtsTotalKobo)}
            </p>
            <p className="text-xs text-[#57534E] dark:text-[#A8A29E]">
              Uncollected balances across all dates
            </p>
          </div>
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F5132] dark:text-[#7CE0AC] shrink-0">
            <span>Debtors</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </Link>

        <div className="lg:col-span-7 rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 space-y-3">
          <div>
            <h2 className="text-sm font-semibold">Export Spreadsheets (CSV)</h2>
            <p className="text-xs text-[#57534E] dark:text-[#A8A29E]">
              Excel-ready UTF-8 files for {startDate} to {endDate}.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {(
              [
                ['receipts', 'Receipts CSV'],
                ['expenses', 'Expenses CSV'],
                ['ledger', 'Cash Book CSV'],
                ['debtors', 'Debtors CSV'],
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                onClick={() => handleExportCsv(kind)}
                className="inline-flex items-center justify-center gap-1.5 min-h-[42px] px-3 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] hover:border-[#0F5132] text-xs font-semibold cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-[#0F5132] dark:text-[#7CE0AC]" />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function BreakdownCard({
  title,
  rows,
  tone = 'default',
}: {
  title: string;
  rows: Array<{ label: string; amountKobo: number; count: number }>;
  tone?: 'default' | 'expense';
}) {
  const maxKobo = rows.reduce((m, r) => Math.max(m, Math.abs(r.amountKobo)), 1);

  return (
    <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 space-y-3.5">
      <h2 className="text-sm font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-xs text-[#57534E] dark:text-[#A8A29E] py-4">
          No entries in this period.
        </p>
      ) : (
        <div className="space-y-2.5">
          {rows.slice(0, 6).map((row) => {
            const pct = Math.max(
              4,
              Math.min(100, Math.round((Math.abs(row.amountKobo) / maxKobo) * 100))
            );
            return (
              <div key={row.label} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-medium truncate">
                    {row.label}{' '}
                    <span className="text-[#57534E] dark:text-[#A8A29E]">({row.count})</span>
                  </span>
                  <span className="font-mono-ledger font-semibold shrink-0">
                    {formatNaira(row.amountKobo)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-[#FAF7F0] dark:bg-[#101210] overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      tone === 'expense'
                        ? 'bg-red-600 dark:bg-red-500'
                        : 'bg-[#0F5132] dark:bg-[#2D8A5E]'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
