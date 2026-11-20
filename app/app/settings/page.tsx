'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, Plus, Trash2 } from 'lucide-react';
import type { Customer, Item } from '@/lib/database.types';
import { useAppContext } from '@/components/providers/AppProviders';
import { useBusiness } from '@/components/app/AppShell';
import { BusinessProfileForm } from '@/components/app/BusinessProfileForm';
import { formatNaira, nairaInputToKobo } from '@/lib/format';

export default function SettingsPage() {
  const router = useRouter();
  const { supabase, notify } = useAppContext();
  const { business } = useBusiness();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newItemName, setNewItemName] = useState('');
  const [newItemUnit, setNewItemUnit] = useState('unit');
  const [newItemPrice, setNewItemPrice] = useState('');

  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [showDeleteBox, setShowDeleteBox] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  const [refreshNonce, setRefreshNonce] = useState(0);

  const reloadCatalog = useCallback(() => {
    setRefreshNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!supabase || !business) return;
    let active = true;
    Promise.all([
      supabase
        .from('customers')
        .select('*')
        .eq('business_id', business.id)
        .order('name', { ascending: true }),
      supabase
        .from('items')
        .select('*')
        .eq('business_id', business.id)
        .order('name', { ascending: true }),
    ]).then(([cRes, iRes]) => {
      if (!active) return;
      if (cRes.data) setCustomers(cRes.data);
      if (iRes.data) setItems(iRes.data);
    });
    return () => {
      active = false;
    };
  }, [supabase, business, refreshNonce]);

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !business || !newCustName.trim()) return;
    const { error } = await supabase.from('customers').insert({
      business_id: business.id,
      name: newCustName.trim(),
      phone: newCustPhone.trim() || null,
    });
    if (error) {
      notify({ title: 'Could not save customer', description: error.message, variant: 'error' });
    } else {
      setNewCustName('');
      setNewCustPhone('');
      reloadCatalog();
    }
  };

  const handleDeleteCustomer = async (id: string) => {
    if (!supabase) return;
    await supabase.from('customers').delete().eq('id', id);
    reloadCatalog();
  };

  const handleAddItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase || !business || !newItemName.trim()) return;
    const { error } = await supabase.from('items').insert({
      business_id: business.id,
      name: newItemName.trim(),
      unit: newItemUnit.trim() || 'unit',
      default_price_kobo: nairaInputToKobo(newItemPrice),
    });
    if (error) {
      notify({ title: 'Could not save item', description: error.message, variant: 'error' });
    } else {
      setNewItemName('');
      setNewItemUnit('unit');
      setNewItemPrice('');
      reloadCatalog();
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!supabase) return;
    await supabase.from('items').delete().eq('id', id);
    reloadCatalog();
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirm !== 'DELETE') return;
    setDeletingAccount(true);
    try {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Could not delete account.');
      }
      notify({ title: 'Account deleted', variant: 'default' });
      router.replace('/');
      router.refresh();
    } catch (err) {
      notify({
        title: 'Account deletion failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'error',
      });
      setDeletingAccount(false);
    }
  };

  if (!business) return null;

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-3xl sm:text-4xl">Settings</h1>
        <p className="text-sm text-[#57534E] dark:text-[#A8A29E]">
          Update your business details, saved customers &amp; items, or export your data.
        </p>
      </div>

      <BusinessProfileForm mode="settings" />

      {/* Saved Customers & Items for Fast Autosuggest */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Customers */}
        <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold">Saved Customers</h2>
            <p className="text-xs text-[#57534E] dark:text-[#A8A29E]">
              Autosuggested while creating receipts.
            </p>
          </div>

          <form onSubmit={handleAddCustomer} className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              required
              value={newCustName}
              onChange={(e) => setNewCustName(e.target.value)}
              placeholder="Name"
              className="flex-1 min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3 text-sm"
            />
            <input
              type="tel"
              value={newCustPhone}
              onChange={(e) => setNewCustPhone(e.target.value)}
              placeholder="Phone"
              className="sm:w-36 min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3 text-sm font-mono-ledger"
            />
            <button
              type="submit"
              className="min-h-[44px] px-4 rounded-xl bg-[#0F5132] text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </form>

          {customers.length === 0 ? (
            <p className="text-xs text-[#57534E] dark:text-[#A8A29E] py-3">
              No saved customers yet.
            </p>
          ) : (
            <div className="divide-y divide-[#E5DFD2] dark:divide-[#2A2E2A] max-h-64 overflow-y-auto">
              {customers.map((c) => (
                <div key={c.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.name}</p>
                    {c.phone && (
                      <p className="text-xs font-mono-ledger text-[#57534E] dark:text-[#A8A29E]">
                        {c.phone}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteCustomer(c.id)}
                    aria-label={`Delete ${c.name}`}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Items Catalog */}
        <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 space-y-4">
          <div>
            <h2 className="text-base font-semibold">Saved Items &amp; Prices</h2>
            <p className="text-xs text-[#57534E] dark:text-[#A8A29E]">
              Tap to auto-fill description and price on receipts.
            </p>
          </div>

          <form onSubmit={handleAddItem} className="grid grid-cols-12 gap-2">
            <input
              type="text"
              required
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              placeholder="Item name"
              className="col-span-6 min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3 text-sm"
            />
            <input
              type="text"
              inputMode="decimal"
              value={newItemPrice}
              onChange={(e) => setNewItemPrice(e.target.value)}
              placeholder="₦ Price"
              className="col-span-3 min-h-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-2.5 text-sm font-mono-ledger"
            />
            <button
              type="submit"
              className="col-span-3 min-h-[44px] rounded-xl bg-[#0F5132] text-white text-xs font-semibold inline-flex items-center justify-center gap-1 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add</span>
            </button>
          </form>

          {items.length === 0 ? (
            <p className="text-xs text-[#57534E] dark:text-[#A8A29E] py-3">
              No saved items yet.
            </p>
          ) : (
            <div className="divide-y divide-[#E5DFD2] dark:divide-[#2A2E2A] max-h-64 overflow-y-auto">
              {items.map((item) => (
                <div key={item.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs font-mono-ledger text-[#57534E] dark:text-[#A8A29E]">
                      {formatNaira(item.default_price_kobo)} / {item.unit}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteItem(item.id)}
                    aria-label={`Delete ${item.name}`}
                    className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Data Export & Account Deletion */}
      <section className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 sm:p-6 space-y-5">
        <div>
          <h2 className="text-base font-semibold">Data Portability &amp; Account</h2>
          <p className="text-xs text-[#57534E] dark:text-[#A8A29E] mt-0.5">
            Download a complete archive of your receipts and ledger or permanently close your
            account.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <a
            href="/api/export"
            className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#202420] text-sm font-medium hover:bg-[#F3EFE4] dark:hover:bg-[#2A2E2A]"
          >
            <Download className="w-4 h-4" />
            <span>Export All Data (JSON)</span>
          </a>

          <button
            type="button"
            onClick={() => setShowDeleteBox((s) => !s)}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl border border-red-300 dark:border-red-900/60 text-red-700 dark:text-red-400 text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
          >
            <span>Delete Account</span>
          </button>
        </div>

        {showDeleteBox && (
          <div className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30 p-4 space-y-3 max-w-md">
            <p className="text-xs text-red-900 dark:text-red-200 leading-relaxed">
              This permanently deletes your business profile, receipts, and sign-in account. Type{' '}
              <strong className="font-mono-ledger">DELETE</strong> to confirm.
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                placeholder="Type DELETE"
                className="flex-1 min-h-[44px] rounded-xl border border-red-300 dark:border-red-800 bg-white dark:bg-[#101210] px-3 text-sm font-mono-ledger"
              />
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteConfirm !== 'DELETE' || deletingAccount}
                className="min-h-[44px] px-4 rounded-xl bg-red-700 text-white text-xs font-semibold disabled:opacity-50 cursor-pointer"
              >
                {deletingAccount ? 'Deleting…' : 'Confirm Delete'}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
