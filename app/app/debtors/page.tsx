'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  HandCoins,
  MessageCircle,
  Plus,
  Search,
  Wallet,
} from 'lucide-react';
import type { Creditor, Debt, LedgerEntry } from '@/lib/database.types';
import { useAppContext } from '@/components/providers/AppProviders';
import { useBusiness } from '@/components/app/AppShell';
import {
  buildDebtReminderWhatsAppMessage,
  computeDebtCustomerSummaries,
} from '@/lib/cashbook';
import {
  buildWhatsAppShareUrl,
  formatLagosDate,
  formatLagosDateTime,
  formatNaira,
  formatPaymentMethod,
  todayInLagosDate,
} from '@/lib/format';
import { DebtorPaymentModal } from '@/components/cashbook/DebtorPaymentModal';
import { CreditorModal } from '@/components/cashbook/CreditorModal';

export default function DebtorsPage() {
  const { supabase } = useAppContext();
  const { business, lastMutationTick, notifyMutation, openQuickCreditSaleModal } = useBusiness();

  const [tab, setTab] = useState<'debtors' | 'creditors'>('debtors');
  const [debts, setDebts] = useState<Debt[]>([]);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [creditors, setCreditors] = useState<Creditor[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [showSettled, setShowSettled] = useState(false);

  const [payingDebt, setPayingDebt] = useState<Debt | null>(null);
  const [creditorModalState, setCreditorModalState] = useState<
    { mode: 'add' } | { mode: 'pay'; creditor: Creditor } | null
  >(null);

  const today = todayInLagosDate();

  useEffect(() => {
    if (!supabase || !business) return;
    let active = true;

    Promise.all([
      supabase
        .from('debts')
        .select('*')
        .eq('business_id', business.id)
        .order('created_at', { ascending: false }),
      supabase
        .from('ledger_entries')
        .select('*')
        .eq('business_id', business.id)
        .eq('type', 'payment_received')
        .order('occurred_at', { ascending: false }),
      supabase
        .from('creditors')
        .select('*')
        .eq('business_id', business.id)
        .order('created_at', { ascending: false }),
    ]).then(([debtsRes, payRes, credRes]) => {
      if (!active) return;
      setDebts(debtsRes.data ?? []);
      setEntries(payRes.data ?? []);
      setCreditors(credRes.data ?? []);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [supabase, business, lastMutationTick]);

  const customerGroups = useMemo(
    () => computeDebtCustomerSummaries(debts, entries, today),
    [debts, entries, today]
  );

  const filteredGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customerGroups.filter((g) => {
      if (!showSettled && g.totalOwedKobo <= 0) return false;
      if (!q) return true;
      return (
        g.customerName.toLowerCase().includes(q) ||
        (g.customerPhone && g.customerPhone.toLowerCase().includes(q))
      );
    });
  }, [customerGroups, search, showSettled]);

  const filteredCreditors = useMemo(() => {
    const q = search.trim().toLowerCase();
    return creditors.filter((c) => {
      if (!showSettled && c.balance_kobo <= 0) return false;
      if (!q) return true;
      return (
        c.supplier_name.toLowerCase().includes(q) ||
        (c.description && c.description.toLowerCase().includes(q))
      );
    });
  }, [creditors, search, showSettled]);

  const totals = useMemo(() => {
    const totalOwedToUs = customerGroups.reduce((s, g) => s + g.totalOwedKobo, 0);
    const customersOwing = customerGroups.filter((g) => g.totalOwedKobo > 0).length;
    const totalWeOwe = creditors
      .filter((c) => c.status !== 'settled')
      .reduce((s, c) => s + c.balance_kobo, 0);
    const openSuppliers = creditors.filter((c) => c.status !== 'settled').length;
    return { totalOwedToUs, customersOwing, totalWeOwe, openSuppliers };
  }, [customerGroups, creditors]);

  if (!business) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[#0F5132] dark:text-[#2D8A5E]">
            Credit Book
          </p>
          <h1 className="font-display text-3xl sm:text-4xl">Debtors &amp; Creditors</h1>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => openQuickCreditSaleModal(today)}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-semibold cursor-pointer"
          >
            <HandCoins className="w-4 h-4" />
            <span>Quick Credit Sale</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('creditors');
              setCreditorModalState({ mode: 'add' });
            }}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] text-xs sm:text-sm font-semibold hover:border-[#0F5132] cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Supplier Owed</span>
          </button>
        </div>
      </section>

      {/* Summary Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
          type="button"
          onClick={() => setTab('debtors')}
          className={`text-left rounded-2xl border p-5 space-y-1 transition-colors cursor-pointer ${
            tab === 'debtors'
              ? 'border-[#0F5132] bg-white dark:bg-[#181B18]'
              : 'border-[#E5DFD2] dark:border-[#2A2E2A] bg-white/70 dark:bg-[#181B18]/70'
          }`}
        >
          <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-[#57534E] dark:text-[#A8A29E]">
            Customers Owe You (Debtors)
          </p>
          <p className="font-mono-ledger text-2xl sm:text-3xl font-semibold text-amber-700 dark:text-amber-400">
            {loading ? '—' : formatNaira(totals.totalOwedToUs)}
          </p>
          <p className="text-xs text-[#57534E] dark:text-[#A8A29E]">
            Across {totals.customersOwing} {totals.customersOwing === 1 ? 'customer' : 'customers'}
          </p>
        </button>

        <button
          type="button"
          onClick={() => setTab('creditors')}
          className={`text-left rounded-2xl border p-5 space-y-1 transition-colors cursor-pointer ${
            tab === 'creditors'
              ? 'border-[#0F5132] bg-white dark:bg-[#181B18]'
              : 'border-[#E5DFD2] dark:border-[#2A2E2A] bg-white/70 dark:bg-[#181B18]/70'
          }`}
        >
          <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-[#57534E] dark:text-[#A8A29E]">
            You Owe Suppliers (Creditors)
          </p>
          <p className="font-mono-ledger text-2xl sm:text-3xl font-semibold text-red-700 dark:text-red-400">
            {loading ? '—' : formatNaira(totals.totalWeOwe)}
          </p>
          <p className="text-xs text-[#57534E] dark:text-[#A8A29E]">
            Across {totals.openSuppliers} open{' '}
            {totals.openSuppliers === 1 ? 'supplier' : 'suppliers'}
          </p>
        </button>
      </section>

      {/* Tabs & Filters */}
      <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-1 self-start">
          <button
            type="button"
            onClick={() => setTab('debtors')}
            className={`min-h-[38px] px-4 rounded-lg text-xs sm:text-sm font-semibold cursor-pointer ${
              tab === 'debtors'
                ? 'bg-[#0F5132] text-white'
                : 'text-[#57534E] dark:text-[#A8A29E]'
            }`}
          >
            Debtors ({totals.customersOwing})
          </button>
          <button
            type="button"
            onClick={() => setTab('creditors')}
            className={`min-h-[38px] px-4 rounded-lg text-xs sm:text-sm font-semibold cursor-pointer ${
              tab === 'creditors'
                ? 'bg-[#0F5132] text-white'
                : 'text-[#57534E] dark:text-[#A8A29E]'
            }`}
          >
            Creditors ({totals.openSuppliers})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 flex-1 sm:max-w-md justify-end">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="w-4 h-4 text-[#57534E] dark:text-[#A8A29E] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={
                tab === 'debtors' ? 'Search customer name or phone…' : 'Search supplier…'
              }
              className="w-full min-h-[42px] pl-10 pr-3.5 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] text-sm"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-xs font-medium text-[#57534E] dark:text-[#A8A29E] cursor-pointer">
            <input
              type="checkbox"
              checked={showSettled}
              onChange={(e) => setShowSettled(e.target.checked)}
              className="w-4 h-4 rounded accent-[#0F5132]"
            />
            <span>Show settled</span>
          </label>
        </div>
      </section>

      {/* Content */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-28 rounded-2xl bg-[#E5DFD2]/50 dark:bg-[#2A2E2A]/50 animate-pulse"
            />
          ))}
        </div>
      ) : tab === 'debtors' ? (
        filteredGroups.length === 0 ? (
          <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-8 sm:p-10 text-center space-y-3">
            <h2 className="font-display text-2xl sm:text-3xl">
              {customerGroups.length === 0 ? 'No customer debts recorded' : 'No matching debtors'}
            </h2>
            <p className="text-sm text-[#57534E] dark:text-[#A8A29E] max-w-md mx-auto">
              Part-paid receipts and Quick Credit Sales automatically appear here so nothing is
              forgotten.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredGroups.map((group) => {
              const firstOpenDebt = group.debts.find(
                (d) => d.balance_kobo > 0 && (d.status === 'open' || d.status === 'partial')
              );
              const reminderMsg = buildDebtReminderWhatsAppMessage({
                businessName: business.name,
                customerName: group.customerName,
                amountOwedKobo: group.totalOwedKobo,
                oldestAgeDays: group.oldestAgeDays,
              });
              const waUrl = buildWhatsAppShareUrl(reminderMsg, group.customerPhone);

              return (
                <article
                  key={group.key}
                  className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold">{group.customerName}</h2>
                        {group.customerPhone && (
                          <span className="font-mono-ledger text-xs text-[#57534E] dark:text-[#A8A29E]">
                            · {group.customerPhone}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[#57534E] dark:text-[#A8A29E] mt-0.5">
                        {group.totalOwedKobo > 0
                          ? `Oldest open debt: ${
                              group.oldestAgeDays === 0
                                ? 'Today'
                                : `${group.oldestAgeDays} ${
                                    group.oldestAgeDays === 1 ? 'day' : 'days'
                                  } ago`
                            }`
                          : 'All balances settled'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <div className="text-left sm:text-right mr-2">
                        <p className="text-[11px] uppercase tracking-[0.06em] text-[#57534E] dark:text-[#A8A29E]">
                          Total Owed
                        </p>
                        <p
                          className={`font-mono-ledger text-xl font-semibold ${
                            group.totalOwedKobo > 0
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-[#0F5132] dark:text-[#7CE0AC]'
                          }`}
                        >
                          {formatNaira(group.totalOwedKobo)}
                        </p>
                      </div>

                      {group.totalOwedKobo > 0 && (
                        <>
                          <a
                            href={waUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] text-xs font-semibold hover:border-[#0F5132]"
                          >
                            <MessageCircle className="w-4 h-4 text-[#0F5132] dark:text-[#7CE0AC]" />
                            <span>WhatsApp Reminder</span>
                          </a>

                          {firstOpenDebt && (
                            <button
                              type="button"
                              onClick={() => setPayingDebt(firstOpenDebt)}
                              className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-xl bg-[#0F5132] hover:bg-[#0B3E26] text-white text-xs font-semibold cursor-pointer"
                            >
                              <Wallet className="w-4 h-4" />
                              <span>Record Payment</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Individual Debt Items */}
                  <div className="border-t border-[#E5DFD2] dark:border-[#2A2E2A] pt-3 space-y-2">
                    {group.debts
                      .filter((d) => showSettled || d.balance_kobo > 0)
                      .map((debt) => (
                        <div
                          key={debt.id}
                          className="rounded-xl bg-[#FAF7F0] dark:bg-[#101210] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                          <div className="space-y-0.5 min-w-0">
                            <p className="font-medium">
                              {debt.notes || 'Credit / Part-paid sale'}
                            </p>
                            <p className="text-[#57534E] dark:text-[#A8A29E] font-mono-ledger">
                              Created {formatLagosDate(debt.created_at)}
                              {debt.due_date ? ` · Due ${debt.due_date}` : ''}
                              {debt.receipt_id ? ' · Receipt linked' : ' · Informal credit'}
                            </p>
                          </div>

                          <div className="flex items-center gap-3 shrink-0">
                            <div className="text-right font-mono-ledger">
                              <p className="font-semibold">
                                {debt.balance_kobo > 0
                                  ? `Owes ${formatNaira(debt.balance_kobo)}`
                                  : 'Settled'}
                              </p>
                              <p className="text-[11px] text-[#57534E] dark:text-[#A8A29E]">
                                Paid {formatNaira(debt.amount_paid_kobo)} of{' '}
                                {formatNaira(debt.original_amount_kobo)}
                              </p>
                            </div>

                            {debt.receipt_id && (
                              <Link
                                href={`/app/receipts/${debt.receipt_id}`}
                                className="min-h-[32px] px-2.5 inline-flex items-center rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A] font-medium hover:border-[#0F5132]"
                              >
                                Receipt
                              </Link>
                            )}

                            {debt.balance_kobo > 0 && (
                              <button
                                type="button"
                                onClick={() => setPayingDebt(debt)}
                                className="min-h-[32px] px-2.5 rounded-lg bg-[#0F5132] text-white font-semibold cursor-pointer"
                              >
                                Pay
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                  </div>

                  {/* Payment History */}
                  {group.paymentHistory.length > 0 && (
                    <div className="border-t border-[#E5DFD2] dark:border-[#2A2E2A] pt-3 space-y-1.5">
                      <p className="text-[11px] uppercase tracking-[0.06em] font-semibold text-[#57534E] dark:text-[#A8A29E]">
                        Payment History
                      </p>
                      {group.paymentHistory.slice(0, 5).map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center justify-between text-xs text-[#57534E] dark:text-[#A8A29E]"
                        >
                          <span className="truncate">
                            {formatLagosDateTime(p.occurred_at)} ·{' '}
                            {formatPaymentMethod(p.payment_method)}
                            {p.receipt_id ? (
                              <>
                                {' · '}
                                <Link
                                  href={`/app/receipts/${p.receipt_id}`}
                                  className="text-[#0F5132] dark:text-[#7CE0AC] underline"
                                >
                                  View Receipt
                                </Link>
                              </>
                            ) : null}
                          </span>
                          <span className="font-mono-ledger font-semibold text-[#0F5132] dark:text-[#7CE0AC] shrink-0">
                            +{formatNaira(p.amount_kobo)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )
      ) : filteredCreditors.length === 0 ? (
        <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-8 sm:p-10 text-center space-y-3">
          <h2 className="font-display text-2xl sm:text-3xl">
            {creditors.length === 0 ? 'No supplier debts recorded' : 'No matching suppliers'}
          </h2>
          <p className="text-sm text-[#57534E] dark:text-[#A8A29E] max-w-md mx-auto">
            Keep track of stock bought on credit from wholesalers or suppliers and mark payments as
            you settle them.
          </p>
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setCreditorModalState({ mode: 'add' })}
              className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl bg-[#0F5132] text-white text-sm font-semibold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Supplier Owed</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredCreditors.map((cred) => (
            <article
              key={cred.id}
              className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
            >
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-base font-semibold">{cred.supplier_name}</h2>
                  {cred.supplier_phone && (
                    <span className="font-mono-ledger text-xs text-[#57534E] dark:text-[#A8A29E]">
                      · {cred.supplier_phone}
                    </span>
                  )}
                  {cred.status === 'settled' && (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F5132] dark:text-[#7CE0AC]">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Settled
                    </span>
                  )}
                </div>
                {cred.description && (
                  <p className="text-sm text-[#57534E] dark:text-[#A8A29E]">{cred.description}</p>
                )}
                <p className="text-xs font-mono-ledger text-[#57534E] dark:text-[#A8A29E]">
                  Added {formatLagosDate(cred.created_at)}
                  {cred.due_date ? ` · Due ${cred.due_date}` : ''} · Paid{' '}
                  {formatNaira(cred.amount_paid_kobo)} of {formatNaira(cred.original_amount_kobo)}
                </p>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <div className="text-left sm:text-right">
                  <p className="text-[11px] uppercase tracking-[0.06em] text-[#57534E] dark:text-[#A8A29E]">
                    Balance Owed
                  </p>
                  <p
                    className={`font-mono-ledger text-xl font-semibold ${
                      cred.balance_kobo > 0
                        ? 'text-red-700 dark:text-red-400'
                        : 'text-[#0F5132] dark:text-[#7CE0AC]'
                    }`}
                  >
                    {formatNaira(cred.balance_kobo)}
                  </p>
                </div>

                {cred.balance_kobo > 0 && (
                  <button
                    type="button"
                    onClick={() => setCreditorModalState({ mode: 'pay', creditor: cred })}
                    className="min-h-[42px] px-4 rounded-xl bg-[#0F5132] hover:bg-[#0B3E26] text-white text-xs sm:text-sm font-semibold cursor-pointer"
                  >
                    Pay / Mark Paid
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Modals */}
      {payingDebt && (
        <DebtorPaymentModal
          debt={payingDebt}
          onClose={() => setPayingDebt(null)}
          onSuccess={() => {
            setPayingDebt(null);
            notifyMutation();
          }}
        />
      )}

      {creditorModalState && (
        <CreditorModal
          payingCreditor={
            creditorModalState.mode === 'pay' ? creditorModalState.creditor : null
          }
          onClose={() => setCreditorModalState(null)}
          onSuccess={() => {
            setCreditorModalState(null);
            notifyMutation();
          }}
        />
      )}
    </div>
  );
}
