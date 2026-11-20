'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Ban,
  CopyPlus,
  FileText,
  MessageCircle,
  Plus,
  Search,
  Wallet,
} from 'lucide-react';
import type { Debt, Receipt } from '@/lib/database.types';
import { useAppContext } from '@/components/providers/AppProviders';
import { useBusiness } from '@/components/app/AppShell';
import {
  buildWhatsAppMessage,
  buildWhatsAppShareUrl,
  formatLagosDateTime,
  formatNaira,
  formatPaymentMethod,
  getPublicReceiptUrl,
  todayInLagosDate,
} from '@/lib/format';
import {
  ReceiveBalanceModal,
  VoidReceiptModal,
} from '@/components/receipts/ReceiptActionModals';

type StatusFilter = 'all' | 'paid' | 'part_paid' | 'void';
type DateFilter = 'all' | 'today' | 'week' | 'custom';

export default function ReceiptsListPage() {
  const router = useRouter();
  const { supabase } = useAppContext();
  const { business } = useBusiness();

  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [debtsByReceiptId, setDebtsByReceiptId] = useState<Record<string, Debt>>({});
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [customDate, setCustomDate] = useState('');
  const [customerFilter, setCustomerFilter] = useState('all');

  const [receiveTarget, setReceiveTarget] = useState<{
    receipt: Receipt;
    balance: number;
  } | null>(null);
  const [voidTarget, setVoidTarget] = useState<Receipt | null>(null);

  const [refreshNonce, setRefreshNonce] = useState(0);

  const reloadReceipts = useCallback(() => {
    setLoading(true);
    setErrorMsg(null);
    setRefreshNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!supabase || !business) return;
    let active = true;
    (async () => {
      try {
        const [recRes, debtRes] = await Promise.all([
          supabase
            .from('receipts')
            .select('*')
            .eq('business_id', business.id)
            .order('issued_at', { ascending: false })
            .limit(300),
          supabase.from('debts').select('*').eq('business_id', business.id),
        ]);

        if (!active) return;
        if (recRes.error) throw new Error(recRes.error.message);

        setReceipts(recRes.data ?? []);
        const map: Record<string, Debt> = {};
        for (const d of debtRes.data ?? []) {
          if (d.receipt_id) map[d.receipt_id] = d;
        }
        setDebtsByReceiptId(map);
      } catch (err) {
        if (!active) return;
        setErrorMsg(err instanceof Error ? err.message : 'Failed to load receipts.');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [supabase, business, refreshNonce]);

  const customerNames = useMemo(() => {
    const set = new Set<string>();
    for (const r of receipts) {
      set.add(r.customer_name);
    }
    return Array.from(set).sort();
  }, [receipts]);

  const getBalance = useCallback(
    (r: Receipt) => {
      if (r.status === 'void') return 0;
      const d = debtsByReceiptId[r.id];
      return d ? d.balance_kobo : r.balance_due_kobo;
    },
    [debtsByReceiptId]
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const today = todayInLagosDate();
    const weekAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 86_400_000)
      .toISOString()
      .slice(0, 10);

    return receipts.filter((r) => {
      const bal = getBalance(r);

      if (statusFilter === 'void' && r.status !== 'void') return false;
      if (statusFilter === 'paid' && (r.status === 'void' || bal > 0)) return false;
      if (statusFilter === 'part_paid' && (r.status === 'void' || bal <= 0)) return false;

      if (dateFilter === 'today' && r.entry_date !== today) return false;
      if (dateFilter === 'week' && r.entry_date < weekAgo) return false;
      if (dateFilter === 'custom' && customDate && r.entry_date !== customDate) return false;

      if (customerFilter !== 'all' && r.customer_name !== customerFilter) return false;

      if (q) {
        const matchCode = r.receipt_code.toLowerCase().includes(q);
        const matchCust = r.customer_name.toLowerCase().includes(q);
        const matchItem = r.line_items.some((li) =>
          li.description.toLowerCase().includes(q)
        );
        if (!matchCode && !matchCust && !matchItem) return false;
      }

      return true;
    });
  }, [receipts, search, statusFilter, dateFilter, customDate, customerFilter, getBalance]);

  if (!business) return null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl sm:text-4xl">Receipts</h1>
          <p className="text-sm text-[#57534E] dark:text-[#A8A29E]">
            Immutable sequential receipts issued for {business.name}.
          </p>
        </div>
        <Link
          href="/app/receipts/new"
          className="inline-flex items-center justify-center gap-2 min-h-[46px] px-5 rounded-xl bg-[#0F5132] hover:bg-[#0B3E26] text-white text-sm font-semibold whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>New Receipt</span>
        </Link>
      </div>

      {/* Search & Filter Bar */}
      <section className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 text-[#57534E] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search receipt #, customer, or item…"
              className="w-full min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] pl-10 pr-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
            />
          </div>

          <div className="md:col-span-4 flex flex-wrap gap-1.5">
            {(
              [
                ['all', 'All'],
                ['paid', 'Paid'],
                ['part_paid', 'Part Paid'],
                ['void', 'Void'],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                type="button"
                onClick={() => setStatusFilter(val)}
                className={`min-h-[44px] px-3 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                  statusFilter === val
                    ? 'border-[#0F5132] bg-[#0F5132] text-white'
                    : 'border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210]'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="md:col-span-3 flex gap-2">
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value as DateFilter)}
              aria-label="Filter by date"
              className="flex-1 min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3 text-xs font-medium"
            >
              <option value="all">All dates</option>
              <option value="today">Today</option>
              <option value="week">Last 7 days</option>
              <option value="custom">Pick date…</option>
            </select>

            <select
              value={customerFilter}
              onChange={(e) => setCustomerFilter(e.target.value)}
              aria-label="Filter by customer"
              className="flex-1 min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3 text-xs font-medium"
            >
              <option value="all">All customers</option>
              {customerNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {dateFilter === 'custom' && (
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={customDate}
              onChange={(e) => setCustomDate(e.target.value)}
              className="min-h-[40px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3 text-xs font-mono-ledger"
            />
          </div>
        )}
      </section>

      {errorMsg && (
        <div
          role="alert"
          className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-4 text-sm text-red-900 dark:text-red-200"
        >
          {errorMsg}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-20 rounded-2xl bg-[#E5DFD2]/50 dark:bg-[#2A2E2A]/50 animate-pulse"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-10 text-center space-y-3">
          <FileText className="w-8 h-8 mx-auto text-[#57534E] dark:text-[#A8A29E]" />
          <h2 className="font-display text-2xl">
            {receipts.length === 0 ? 'No receipts issued yet' : 'No matching receipts'}
          </h2>
          <p className="text-sm text-[#57534E] dark:text-[#A8A29E] max-w-md mx-auto">
            {receipts.length === 0
              ? 'Issue your first official Naira receipt in under 30 seconds.'
              : 'Try clearing your search or status filters.'}
          </p>
          {receipts.length === 0 && (
            <div className="pt-2">
              <Link
                href="/app/receipts/new"
                className="inline-flex items-center justify-center min-h-[46px] px-5 rounded-xl bg-[#0F5132] text-white text-sm font-semibold"
              >
                Issue First Receipt
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] divide-y divide-[#E5DFD2] dark:divide-[#2A2E2A] overflow-hidden">
          {filtered.map((r) => {
            const bal = getBalance(r);
            const isVoid = r.status === 'void';
            const statusText = isVoid ? 'VOID' : bal > 0 ? 'PART PAID' : 'PAID';
            const statusClass = isVoid
              ? 'text-red-700 dark:text-red-400'
              : bal > 0
                ? 'text-amber-700 dark:text-amber-400'
                : 'text-[#0F5132] dark:text-[#7CE0AC]';

            const shareUrl = buildWhatsAppShareUrl(
              buildWhatsAppMessage({
                businessName: business.name,
                receiptCode: r.receipt_code,
                customerName: r.customer_name,
                totalKobo: r.total_kobo,
                amountPaidKobo: r.amount_paid_kobo,
                balanceDueKobo: bal,
                status: r.status,
                receiptUrl: getPublicReceiptUrl(r.public_id),
              }),
              r.customer_phone
            );

            return (
              <div
                key={r.id}
                className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[#FAF7F0]/70 dark:hover:bg-[#202420]/50 transition-colors"
              >
                <Link href={`/app/receipts/${r.id}`} className="flex-1 min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                    <span className="font-mono-ledger font-semibold text-sm">
                      {r.receipt_code}
                    </span>
                    <span aria-hidden="true" className="text-[#57534E]">·</span>
                    <span className={`font-mono-ledger text-xs font-semibold ${statusClass}`}>
                      {statusText}
                    </span>
                    <span aria-hidden="true" className="text-[#57534E]">·</span>
                    <span className="text-sm font-medium truncate">{r.customer_name}</span>
                  </div>
                  <p className="text-xs text-[#57534E] dark:text-[#A8A29E] truncate">
                    {formatLagosDateTime(r.issued_at)} · {formatPaymentMethod(r.payment_method)}
                    {r.receipt_kind === 'balance_payment' ? ' · Balance Payment' : ''}
                    {bal > 0 && !isVoid ? ` · Owes ${formatNaira(bal)}` : ''}
                  </p>
                </Link>

                <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3">
                  <span className="font-mono-ledger text-base font-semibold">
                    {formatNaira(r.total_kobo)}
                  </span>

                  <div className="flex items-center gap-1.5">
                    {!isVoid && bal > 0 && (
                      <button
                        type="button"
                        onClick={() => setReceiveTarget({ receipt: r, balance: bal })}
                        title="Receive balance"
                        className="inline-flex items-center gap-1 min-h-[40px] px-2.5 rounded-lg border border-amber-400/60 text-amber-800 dark:text-amber-300 text-xs font-medium hover:bg-amber-50 dark:hover:bg-amber-950/30 cursor-pointer"
                      >
                        <Wallet className="w-3.5 h-3.5" />
                        <span>Receive</span>
                      </button>
                    )}

                    <a
                      href={shareUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Share on WhatsApp"
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A] hover:border-[#0F5132]"
                    >
                      <MessageCircle className="w-4 h-4 text-[#0F5132] dark:text-[#7CE0AC]" />
                    </a>

                    <Link
                      href={`/app/receipts/new?duplicate=${r.id}`}
                      title="Duplicate receipt"
                      className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A] hover:border-[#0F5132]"
                    >
                      <CopyPlus className="w-4 h-4" />
                    </Link>

                    {!isVoid && (
                      <button
                        type="button"
                        onClick={() => setVoidTarget(r)}
                        title="Void receipt"
                        className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A] text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                      >
                        <Ban className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {receiveTarget && (
        <ReceiveBalanceModal
          receipt={receiveTarget.receipt}
          outstandingKobo={receiveTarget.balance}
          onClose={() => setReceiveTarget(null)}
          onSuccess={(newRec) => {
            setReceiveTarget(null);
            router.push(`/app/receipts/${newRec.id}?issued=1`);
          }}
        />
      )}

      {voidTarget && (
        <VoidReceiptModal
          receipt={voidTarget}
          onClose={() => setVoidTarget(null)}
          onSuccess={() => {
            setVoidTarget(null);
            reloadReceipts();
          }}
        />
      )}
    </div>
  );
}
