'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  Edit3,
  Eye,
  FilePlus2,
  History,
  Lock,
  Search,
  X,
} from 'lucide-react';
import type {
  DayClosure,
  EntryCorrection,
  LedgerEntry,
  PaymentMethod,
} from '@/lib/database.types';
import { useAppContext } from '@/components/providers/AppProviders';
import { useBusiness } from '@/components/app/AppShell';
import { EXPENSE_PRESET_CATEGORIES } from '@/lib/cashbook';
import {
  formatLagosDate,
  formatLagosDateTime,
  formatNaira,
  formatPaymentMethod,
  todayInLagosDate,
} from '@/lib/format';
import { ExpenseModal } from '@/components/cashbook/ExpenseModal';

export default function ExpensesPage() {
  const { supabase, notify } = useAppContext();
  const { business, lastMutationTick, notifyMutation, openExpenseModal } = useBusiness();

  const [expenses, setExpenses] = useState<LedgerEntry[]>([]);
  const [closedDates, setClosedDates] = useState<Set<string>>(new Set());
  const [corrections, setCorrections] = useState<EntryCorrection[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState<'all' | PaymentMethod>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const [editingEntry, setEditingEntry] = useState<LedgerEntry | null>(null);
  const [proofPreview, setProofPreview] = useState<{
    url: string;
    isPdf: boolean;
    label: string;
  } | null>(null);

  const today = todayInLagosDate();

  useEffect(() => {
    if (!supabase || !business) return;
    let active = true;

    Promise.all([
      supabase
        .from('ledger_entries')
        .select('*')
        .eq('business_id', business.id)
        .eq('type', 'expense')
        .order('occurred_at', { ascending: false }),
      supabase
        .from('day_closures')
        .select('closure_date')
        .eq('business_id', business.id),
      supabase
        .from('entry_corrections')
        .select('*')
        .eq('business_id', business.id)
        .order('created_at', { ascending: false })
        .limit(40),
    ]).then(([expRes, closedRes, corrRes]) => {
      if (!active) return;
      setExpenses(expRes.data ?? []);
      setClosedDates(
        new Set(((closedRes.data as Pick<DayClosure, 'closure_date'>[]) ?? []).map((c) => c.closure_date))
      );
      setCorrections(corrRes.data ?? []);
      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, [supabase, business, lastMutationTick]);

  const availableCategories = useMemo(() => {
    const set = new Set<string>(EXPENSE_PRESET_CATEGORIES);
    for (const e of expenses) {
      if (e.category) set.add(e.category);
    }
    return Array.from(set);
  }, [expenses]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return expenses.filter((e) => {
      if (categoryFilter !== 'all' && (e.category || 'Other') !== categoryFilter) return false;
      if (methodFilter !== 'all' && e.payment_method !== methodFilter) return false;
      if (dateFrom && e.entry_date < dateFrom) return false;
      if (dateTo && e.entry_date > dateTo) return false;
      if (!q) return true;
      return (
        e.description.toLowerCase().includes(q) ||
        (e.payee && e.payee.toLowerCase().includes(q)) ||
        (e.category && e.category.toLowerCase().includes(q))
      );
    });
  }, [expenses, search, categoryFilter, methodFilter, dateFrom, dateTo]);

  const totalFilteredKobo = useMemo(
    () => filtered.reduce((sum, e) => sum + e.amount_kobo, 0),
    [filtered]
  );

  const expenseCorrections = useMemo(() => {
    const expIds = new Set(expenses.map((e) => e.id));
    return corrections.filter((c) => expIds.has(c.original_entry_id));
  }, [expenses, corrections]);

  const handleOpenProof = async (proofPath: string, label: string) => {
    if (!supabase) return;
    const { data, error } = await supabase.storage
      .from('expense-proofs')
      .createSignedUrl(proofPath, 300);
    if (error || !data?.signedUrl) {
      notify({
        title: 'Could not open proof',
        description: error?.message || 'Try again.',
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

  if (!business) return null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <section className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[#0F5132] dark:text-[#2D8A5E]">
            Money Out
          </p>
          <h1 className="font-display text-3xl sm:text-4xl">Expenses</h1>
        </div>

        <button
          type="button"
          onClick={() => openExpenseModal(today)}
          className="inline-flex items-center justify-center gap-2 min-h-[46px] px-5 rounded-xl bg-[#0F5132] hover:bg-[#0B3E26] text-white text-sm font-semibold cursor-pointer"
        >
          <FilePlus2 className="w-4 h-4" />
          <span>Record Expense</span>
        </button>
      </section>

      {/* Summary & Filters */}
      <section className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 pb-3 border-b border-[#E5DFD2] dark:border-[#2A2E2A]">
          <div>
            <p className="text-[11px] uppercase tracking-[0.08em] text-[#57534E] dark:text-[#A8A29E]">
              Total Shown ({filtered.length} {filtered.length === 1 ? 'entry' : 'entries'})
            </p>
            <p className="font-mono-ledger text-2xl sm:text-3xl font-semibold text-red-700 dark:text-red-400 mt-0.5">
              {loading ? '—' : formatNaira(totalFilteredKobo)}
            </p>
          </div>
          {(categoryFilter !== 'all' || methodFilter !== 'all' || dateFrom || dateTo || search) && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setCategoryFilter('all');
                setMethodFilter('all');
                setDateFrom('');
                setDateTo('');
              }}
              className="text-xs font-semibold text-[#0F5132] dark:text-[#7CE0AC] underline cursor-pointer"
            >
              Clear filters
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-[#57534E] dark:text-[#A8A29E] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search note, payee, category…"
              className="w-full min-h-[42px] pl-10 pr-3 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] text-sm"
            />
          </div>

          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
            className="min-h-[42px] px-3 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] text-xs sm:text-sm"
          >
            <option value="all">All Categories</option>
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value as 'all' | PaymentMethod)}
            aria-label="Filter by method"
            className="min-h-[42px] px-3 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] text-xs sm:text-sm"
          >
            <option value="all">All Methods</option>
            <option value="cash">Cash</option>
            <option value="transfer">Bank Transfer</option>
            <option value="pos">POS</option>
            <option value="card">Card</option>
            <option value="other">Other</option>
          </select>

          <div className="grid grid-cols-2 gap-1.5">
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              aria-label="From date"
              className="min-h-[42px] px-2 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] text-xs font-mono-ledger"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              aria-label="To date"
              className="min-h-[42px] px-2 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] text-xs font-mono-ledger"
            />
          </div>
        </div>
      </section>

      {/* Expense List */}
      <section className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-16 rounded-xl bg-[#E5DFD2]/50 dark:bg-[#2A2E2A]/50 animate-pulse"
              />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 sm:p-10 text-center space-y-3">
            <h2 className="font-display text-2xl sm:text-3xl">
              {expenses.length === 0 ? 'No expenses recorded yet' : 'No expenses match your filters'}
            </h2>
            <p className="text-sm text-[#57534E] dark:text-[#A8A29E] max-w-md mx-auto">
              Log stock purchases, rent, transport, fuel, or staff pay and attach a receipt photo for
              reference.
            </p>
            {expenses.length === 0 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => openExpenseModal(today)}
                  className="inline-flex items-center gap-2 min-h-[44px] px-5 rounded-xl bg-[#0F5132] text-white text-sm font-semibold cursor-pointer"
                >
                  <FilePlus2 className="w-4 h-4" />
                  <span>Record First Expense</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-[#E5DFD2] dark:divide-[#2A2E2A]">
            {filtered.map((exp) => {
              const isClosed = closedDates.has(exp.entry_date);
              return (
                <div
                  key={exp.id}
                  className="p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-[#FAF7F0]/70 dark:hover:bg-[#202420]/40"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono-ledger text-[11px] uppercase tracking-[0.06em] font-semibold text-[#57534E] dark:text-[#A8A29E]">
                        {exp.category || 'Other'}
                      </span>
                      <span aria-hidden="true" className="text-[#57534E]">
                        ·
                      </span>
                      <span className="text-sm font-medium">{exp.description}</span>
                      {isClosed && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-[#57534E] dark:text-[#A8A29E]">
                          <Lock className="w-3 h-3" />
                          <span>Closed day</span>
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#57534E] dark:text-[#A8A29E]">
                      {formatLagosDate(`${exp.entry_date}T12:00:00+01:00`)} ·{' '}
                      {formatPaymentMethod(exp.payment_method)}
                      {exp.payee ? ` · Paid to ${exp.payee}` : ''}
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <p className="font-mono-ledger text-base font-semibold text-red-700 dark:text-red-400">
                      -{formatNaira(exp.amount_kobo)}
                    </p>

                    <div className="flex items-center gap-1.5">
                      {exp.proof_path && (
                        <button
                          type="button"
                          onClick={() => handleOpenProof(exp.proof_path!, exp.description)}
                          className="inline-flex items-center gap-1 min-h-[34px] px-2.5 rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A] text-xs font-medium hover:border-[#0F5132] cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Proof</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setEditingEntry(exp)}
                        className="inline-flex items-center gap-1 min-h-[34px] px-2.5 rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A] text-xs font-medium hover:border-[#0F5132] cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        <span>{isClosed ? 'Correct' : 'Edit'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Visible Edit / Correction History for Closed-Day Expenses */}
      {expenseCorrections.length > 0 && (
        <section className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 space-y-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-[#0F5132] dark:text-[#7CE0AC]" />
            <h2 className="text-sm font-semibold">Closed-Day Expense Correction Log</h2>
          </div>
          <div className="divide-y divide-[#E5DFD2] dark:divide-[#2A2E2A] text-xs">
            {expenseCorrections.map((c) => {
              const before = c.before_snapshot as { amount_kobo?: number; description?: string };
              const after = c.after_snapshot as { amount_kobo?: number; description?: string } | null;
              return (
                <div key={c.id} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <p className="font-semibold">
                      {c.action === 'delete' ? 'Reversed & Removed' : 'Edited'}:{' '}
                      {before.description || 'Expense'}
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

      {/* Edit / Correct Modal */}
      {editingEntry && (
        <ExpenseModal
          editingEntry={editingEntry}
          isDayClosed={closedDates.has(editingEntry.entry_date)}
          onClose={() => setEditingEntry(null)}
          onSuccess={() => {
            setEditingEntry(null);
            notifyMutation();
          }}
        />
      )}

      {/* Private Bucket Proof Preview Modal */}
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
