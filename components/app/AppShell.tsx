'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AlertCircle,
  BarChart3,
  BookOpen,
  FileText,
  Home,
  LogOut,
  Menu,
  Moon,
  Plus,
  Receipt,
  Settings,
  Sun,
  Users,
  X,
} from 'lucide-react';
import type { Business } from '@/lib/database.types';
import { useAppContext } from '@/components/providers/AppProviders';
import { TallyMarkLogo } from '@/components/brand/TallyMarkLogo';
import { PWAInstallButton } from '@/components/pwa/PWAInstallButton';
import {
  NewEntryChooserModal,
  type NewEntryAction,
} from '@/components/cashbook/NewEntryChooserModal';
import { QuickSaleModal } from '@/components/cashbook/QuickSaleModal';
import { QuickCreditSaleModal } from '@/components/cashbook/QuickCreditSaleModal';
import { ExpenseModal } from '@/components/cashbook/ExpenseModal';
import {
  currentLagosTimeHHMM,
  formatLagosDate,
  todayInLagosDate,
  yesterdayInLagosDate,
} from '@/lib/format';

interface BusinessContextValue {
  business: Business | null;
  logoUrl: string | null;
  userId: string;
  userEmail: string;
  setBusiness: (biz: Business | null) => void;
  refreshBusiness: () => Promise<Business | null>;
  lastMutationTick: number;
  notifyMutation: () => void;
  openNewEntryChooser: (defaultDate?: string) => void;
  openQuickSaleModal: (defaultDate?: string) => void;
  openQuickCreditSaleModal: (defaultDate?: string) => void;
  openExpenseModal: (defaultDate?: string) => void;
}

const BusinessContext = createContext<BusinessContextValue | null>(null);

export function useBusiness() {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error('useBusiness must be used inside AppShell');
  return ctx;
}

const SIDEBAR_NAV_ITEMS = [
  { href: '/app', label: 'Home', icon: Home, exact: true },
  { href: '/app/cashbook', label: 'Cash Book', icon: BookOpen, exact: false },
  { href: '/app/receipts', label: 'Receipts', icon: FileText, exact: false },
  { href: '/app/debtors', label: 'Debtors', icon: Users, exact: false },
  { href: '/app/expenses', label: 'Expenses', icon: Receipt, exact: false },
  { href: '/app/reports', label: 'Reports', icon: BarChart3, exact: false },
  { href: '/app/settings', label: 'Settings', icon: Settings, exact: false },
];

const MORE_DRAWER_ITEMS = [
  {
    href: '/app/debtors',
    label: 'Debtors & Creditors',
    subtitle: 'Who owes you & suppliers you owe',
    icon: Users,
  },
  {
    href: '/app/expenses',
    label: 'Expenses',
    subtitle: 'Track money out & proof photos',
    icon: Receipt,
  },
  {
    href: '/app/reports',
    label: 'Reports & Exports',
    subtitle: 'Sold vs received, charts & CSV/PDF',
    icon: BarChart3,
  },
  {
    href: '/app/settings',
    label: 'Business Settings',
    subtitle: 'Profile, brand color, VAT & close reminder',
    icon: Settings,
  },
];

export function AppShell({
  userId,
  userEmail,
  initialBusiness,
  children,
}: {
  userId: string;
  userEmail: string;
  initialBusiness: Business | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { supabase, supabaseUrl, theme, toggleTheme, notify } = useAppContext();

  const [business, setBusiness] = useState<Business | null>(initialBusiness);
  const [lastMutationTick, setLastMutationTick] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);

  // Global + New Modal state
  const [activeModal, setActiveModal] = useState<
    'chooser' | 'quick_sale' | 'credit_sale' | 'expense' | null
  >(null);
  const [modalDefaultDate, setModalDefaultDate] = useState<string | undefined>(undefined);

  // Day closure reminder banners
  const [yesterdayUnclosedDate, setYesterdayUnclosedDate] = useState<string | null>(null);
  const [todayReadyToClose, setTodayReadyToClose] = useState<string | null>(null);
  const [dismissedBanner, setDismissedBanner] = useState(false);

  const isOnboardingRoute = pathname.startsWith('/app/onboarding');

  const notifyMutation = useCallback(() => {
    setLastMutationTick((t) => t + 1);
  }, []);

  const refreshBusiness = useCallback(async () => {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('businesses')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!error) {
      setBusiness(data ?? null);
      return data ?? null;
    }
    return null;
  }, [supabase, userId]);

  useEffect(() => {
    if (!business && !isOnboardingRoute) {
      router.replace('/app/onboarding');
    }
  }, [business, isOnboardingRoute, router]);

  // Check if yesterday has unclosed entries or today has passed close_day_reminder_time
  useEffect(() => {
    if (!supabase || !business || isOnboardingRoute) return;
    let active = true;
    const yesterday = yesterdayInLagosDate();
    const today = todayInLagosDate();
    const nowTime = currentLagosTimeHHMM();
    const reminderTime = business.close_day_reminder_time || '18:00';

    Promise.all([
      supabase
        .from('day_closures')
        .select('closure_date')
        .eq('business_id', business.id)
        .in('closure_date', [yesterday, today]),
      supabase
        .from('ledger_entries')
        .select('id, entry_date')
        .eq('business_id', business.id)
        .in('entry_date', [yesterday, today])
        .limit(20),
    ]).then(([closuresRes, entriesRes]) => {
      if (!active) return;
      const closedDates = new Set((closuresRes.data ?? []).map((c) => c.closure_date));
      const entryRows = entriesRes.data ?? [];
      const hasYesterdayEntries = entryRows.some((e) => e.entry_date === yesterday);
      const hasTodayEntries = entryRows.some((e) => e.entry_date === today);

      setYesterdayUnclosedDate(
        hasYesterdayEntries && !closedDates.has(yesterday) ? yesterday : null
      );
      setTodayReadyToClose(
        hasTodayEntries && !closedDates.has(today) && nowTime >= reminderTime ? today : null
      );
    });

    return () => {
      active = false;
    };
  }, [supabase, business, isOnboardingRoute, lastMutationTick]);

  const logoUrl = useMemo(() => {
    if (!business?.logo_path || !supabaseUrl) return null;
    return `${supabaseUrl}/storage/v1/object/public/logos/${business.logo_path}`;
  }, [business?.logo_path, supabaseUrl]);

  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    notify({ title: 'Signed out', variant: 'default' });
    router.replace('/auth/login');
    router.refresh();
  };

  const openNewEntryChooser = useCallback((defaultDate?: string) => {
    setModalDefaultDate(defaultDate);
    setActiveModal('chooser');
    setMoreOpen(false);
  }, []);

  const openQuickSaleModal = useCallback((defaultDate?: string) => {
    setModalDefaultDate(defaultDate);
    setActiveModal('quick_sale');
    setMoreOpen(false);
  }, []);

  const openQuickCreditSaleModal = useCallback((defaultDate?: string) => {
    setModalDefaultDate(defaultDate);
    setActiveModal('credit_sale');
    setMoreOpen(false);
  }, []);

  const openExpenseModal = useCallback((defaultDate?: string) => {
    setModalDefaultDate(defaultDate);
    setActiveModal('expense');
    setMoreOpen(false);
  }, []);

  const handleChooserSelect = (action: NewEntryAction) => {
    if (action === 'receipt') {
      setActiveModal(null);
      router.push('/app/receipts/new');
      return;
    }
    setActiveModal(action);
  };

  const contextValue = useMemo<BusinessContextValue>(
    () => ({
      business,
      logoUrl,
      userId,
      userEmail,
      setBusiness,
      refreshBusiness,
      lastMutationTick,
      notifyMutation,
      openNewEntryChooser,
      openQuickSaleModal,
      openQuickCreditSaleModal,
      openExpenseModal,
    }),
    [
      business,
      logoUrl,
      userId,
      userEmail,
      refreshBusiness,
      lastMutationTick,
      notifyMutation,
      openNewEntryChooser,
      openQuickSaleModal,
      openQuickCreditSaleModal,
      openExpenseModal,
    ]
  );

  const isNavActive = (href: string, exact = false) => {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  };

  const isMoreActive = MORE_DRAWER_ITEMS.some((item) => pathname.startsWith(item.href));

  if (isOnboardingRoute) {
    return (
      <BusinessContext.Provider value={contextValue}>
        <div className="min-h-screen bg-[#FAF7F0] dark:bg-[#101210] text-[#141413] dark:text-[#F4F1EA]">
          <header className="border-b border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210]">
            <div className="mx-auto max-w-4xl px-4 sm:px-6 h-16 flex items-center justify-between">
              <TallyMarkLogo size="md" />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={toggleTheme}
                  aria-label="Toggle theme"
                  className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] cursor-pointer"
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl text-xs font-medium text-[#57534E] dark:text-[#A8A29E] hover:text-[#141413] dark:hover:text-[#F4F1EA] cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign out</span>
                </button>
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-3xl px-4 sm:px-6 py-8 sm:py-12">{children}</main>
        </div>
      </BusinessContext.Provider>
    );
  }

  return (
    <BusinessContext.Provider value={contextValue}>
      <div className="min-h-screen flex bg-[#FAF7F0] dark:bg-[#101210] text-[#141413] dark:text-[#F4F1EA]">
        {/* Desktop Sidebar */}
        <aside className="no-print hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0 border-r border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18]">
          <div className="h-16 px-5 flex items-center border-b border-[#E5DFD2] dark:border-[#2A2E2A]">
            <Link href="/app">
              <TallyMarkLogo size="md" />
            </Link>
          </div>

          <div className="px-5 py-4 border-b border-[#E5DFD2] dark:border-[#2A2E2A] space-y-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-[#57534E] dark:text-[#A8A29E]">
                Business
              </p>
              <p className="mt-0.5 text-sm font-semibold truncate">
                {business?.name || 'Setting up…'}
              </p>
              <p className="text-xs text-[#57534E] dark:text-[#A8A29E] truncate">{userEmail}</p>
            </div>

            <button
              type="button"
              onClick={() => openNewEntryChooser()}
              className="w-full inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-[#0F5132] hover:bg-[#0B3E26] text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>New Entry</span>
            </button>
          </div>

          <nav aria-label="Primary" className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {SIDEBAR_NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = isNavActive(item.href, item.exact);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 min-h-[44px] px-3.5 rounded-xl text-sm font-medium transition-colors ${
                    active
                      ? 'bg-[#0F5132]/10 dark:bg-[#2D8A5E]/20 text-[#0F5132] dark:text-[#7CE0AC]'
                      : 'text-[#57534E] dark:text-[#A8A29E] hover:bg-[#FAF7F0] dark:hover:bg-[#202420] hover:text-[#141413] dark:hover:text-[#F4F1EA]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="p-4 border-t border-[#E5DFD2] dark:border-[#2A2E2A] space-y-2.5">
            <PWAInstallButton />
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={toggleTheme}
                className="flex-1 inline-flex items-center justify-center gap-2 min-h-[40px] px-3 rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A] text-xs font-medium text-[#57534E] dark:text-[#A8A29E] hover:text-[#141413] dark:hover:text-[#F4F1EA] cursor-pointer"
              >
                {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
                <span>{theme === 'dark' ? 'Light' : 'Dark'}</span>
              </button>
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-3 rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A] text-xs font-medium text-[#57534E] dark:text-[#A8A29E] hover:text-red-700 dark:hover:text-red-400 cursor-pointer"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Out</span>
              </button>
            </div>
          </div>
        </aside>

        {/* Main Viewport */}
        <div className="flex-1 md:pl-64 flex flex-col min-w-0">
          {/* Mobile Compact Top Bar */}
          <header className="no-print md:hidden sticky top-0 z-30 h-14 px-4 border-b border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0]/90 dark:bg-[#101210]/90 backdrop-blur-md flex items-center justify-between gap-3">
            <Link href="/app" className="min-w-0 flex items-center gap-2">
              <TallyMarkLogo size="sm" showWordmark={false} />
              <span className="font-semibold text-sm truncate">
                {business?.name || 'Tallymark'}
              </span>
            </Link>
            <div className="flex items-center gap-1.5 shrink-0">
              <PWAInstallButton compact />
              <button
                type="button"
                onClick={toggleTheme}
                aria-label="Toggle theme"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] cursor-pointer"
              >
                {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </header>

          <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-10 space-y-6">
            {/* Yesterday Unclosed / End-of-day Reminder Banner */}
            {!dismissedBanner && (yesterdayUnclosedDate || todayReadyToClose) && (
              <div className="no-print rounded-2xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-start gap-2.5 text-xs sm:text-sm text-amber-950 dark:text-amber-100">
                  <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    {yesterdayUnclosedDate ? (
                      <p>
                        <span className="font-semibold">
                          Yesterday ({formatLagosDate(`${yesterdayUnclosedDate}T12:00:00+01:00`)})
                          is not closed yet.
                        </span>{' '}
                        Count your cash and seal yesterday&apos;s book before wrapping up today.
                      </p>
                    ) : (
                      <p>
                        <span className="font-semibold">Ready to close today?</span> Your reminder
                        time ({business?.close_day_reminder_time || '18:00'} WAT) has passed.
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Link
                    href={`/app/cashbook?date=${yesterdayUnclosedDate || todayReadyToClose}&close=1`}
                    className="inline-flex items-center min-h-[36px] px-3.5 rounded-lg bg-[#0F5132] hover:bg-[#0B3E26] text-white text-xs font-semibold"
                  >
                    Close {yesterdayUnclosedDate ? 'Yesterday' : 'Today'}
                  </Link>
                  <button
                    type="button"
                    onClick={() => setDismissedBanner(true)}
                    aria-label="Dismiss reminder"
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-amber-900 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {children}
          </main>

          {/* Mobile Fixed Bottom Nav (5 slots: Home, Cash Book, + New, Receipts, More) */}
          <nav
            aria-label="Mobile Navigation"
            className="no-print md:hidden fixed bottom-0 left-0 right-0 z-40 h-16 border-t border-[#E5DFD2] dark:border-[#2A2E2A] bg-white/95 dark:bg-[#181B18]/95 backdrop-blur-md grid grid-cols-5 items-center px-1"
          >
            <Link
              href="/app"
              onClick={() => setMoreOpen(false)}
              className={`min-h-[48px] flex flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
                isNavActive('/app', true)
                  ? 'text-[#0F5132] dark:text-[#7CE0AC]'
                  : 'text-[#57534E] dark:text-[#A8A29E]'
              }`}
            >
              <Home className="w-5 h-5" />
              <span className="text-[11px] font-medium leading-none">Home</span>
            </Link>

            <Link
              href="/app/cashbook"
              onClick={() => setMoreOpen(false)}
              className={`min-h-[48px] flex flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
                isNavActive('/app/cashbook')
                  ? 'text-[#0F5132] dark:text-[#7CE0AC]'
                  : 'text-[#57534E] dark:text-[#A8A29E]'
              }`}
            >
              <BookOpen className="w-5 h-5" />
              <span className="text-[11px] font-medium leading-none">Cash Book</span>
            </Link>

            <button
              type="button"
              onClick={() => openNewEntryChooser()}
              aria-label="New entry"
              className="flex flex-col items-center justify-center gap-0.5 cursor-pointer"
            >
              <span className="w-11 h-9 rounded-xl bg-[#0F5132] text-white flex items-center justify-center shadow-sm">
                <Plus className="w-5 h-5" />
              </span>
              <span className="text-[10px] font-semibold text-[#0F5132] dark:text-[#7CE0AC] leading-none">
                New
              </span>
            </button>

            <Link
              href="/app/receipts"
              onClick={() => setMoreOpen(false)}
              className={`min-h-[48px] flex flex-col items-center justify-center gap-1 rounded-lg transition-colors ${
                isNavActive('/app/receipts')
                  ? 'text-[#0F5132] dark:text-[#7CE0AC]'
                  : 'text-[#57534E] dark:text-[#A8A29E]'
              }`}
            >
              <FileText className="w-5 h-5" />
              <span className="text-[11px] font-medium leading-none">Receipts</span>
            </Link>

            <button
              type="button"
              onClick={() => setMoreOpen((v) => !v)}
              className={`min-h-[48px] flex flex-col items-center justify-center gap-1 rounded-lg transition-colors cursor-pointer ${
                moreOpen || isMoreActive
                  ? 'text-[#0F5132] dark:text-[#7CE0AC]'
                  : 'text-[#57534E] dark:text-[#A8A29E]'
              }`}
            >
              <Menu className="w-5 h-5" />
              <span className="text-[11px] font-medium leading-none">More</span>
            </button>
          </nav>

          {/* Mobile More Sheet */}
          {moreOpen && (
            <div
              className="md:hidden fixed inset-0 z-30 bg-black/40 backdrop-blur-xs"
              onClick={() => setMoreOpen(false)}
            >
              <div
                className="fixed bottom-16 left-0 right-0 rounded-t-3xl border-t border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 space-y-3 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.08em] font-semibold text-[#57534E] dark:text-[#A8A29E]">
                    More Books &amp; Tools
                  </p>
                  <button
                    type="button"
                    onClick={() => setMoreOpen(false)}
                    aria-label="Close menu"
                    className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#57534E]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-2">
                  {MORE_DRAWER_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = pathname.startsWith(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setMoreOpen(false)}
                        className={`flex items-center gap-3 p-3.5 rounded-xl border transition-colors ${
                          active
                            ? 'border-[#0F5132] bg-[#0F5132]/10 dark:bg-[#2D8A5E]/20 text-[#0F5132] dark:text-[#7CE0AC]'
                            : 'border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210]'
                        }`}
                      >
                        <Icon className="w-5 h-5 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold">{item.label}</p>
                          <p className="text-xs text-[#57534E] dark:text-[#A8A29E]">
                            {item.subtitle}
                          </p>
                        </div>
                      </Link>
                    );
                  })}
                </div>

                <div className="pt-2 border-t border-[#E5DFD2] dark:border-[#2A2E2A] flex items-center justify-between gap-3">
                  <PWAInstallButton />
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="inline-flex items-center gap-1.5 min-h-[40px] px-3.5 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] text-xs font-medium text-red-700 dark:text-red-400"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Global Phase 2 Entry Modals */}
      {activeModal === 'chooser' && (
        <NewEntryChooserModal
          onClose={() => setActiveModal(null)}
          onSelect={handleChooserSelect}
        />
      )}
      {activeModal === 'quick_sale' && (
        <QuickSaleModal
          defaultDate={modalDefaultDate}
          onClose={() => setActiveModal(null)}
          onSuccess={() => {
            setActiveModal(null);
            notifyMutation();
          }}
        />
      )}
      {activeModal === 'credit_sale' && (
        <QuickCreditSaleModal
          defaultDate={modalDefaultDate}
          onClose={() => setActiveModal(null)}
          onSuccess={() => {
            setActiveModal(null);
            notifyMutation();
          }}
        />
      )}
      {activeModal === 'expense' && (
        <ExpenseModal
          defaultDate={modalDefaultDate}
          onClose={() => setActiveModal(null)}
          onSuccess={() => {
            setActiveModal(null);
            notifyMutation();
          }}
        />
      )}
    </BusinessContext.Provider>
  );
}
