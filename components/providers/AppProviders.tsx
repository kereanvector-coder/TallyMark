'use client';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getSupabaseBrowserClient } from '@/lib/supabase/client';
import { OfflineIndicator } from '@/components/pwa/OfflineIndicator';

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: 'default' | 'success' | 'error';
}

interface AppContextValue {
  supabaseUrl: string;
  supabaseAnonKey: string;
  isSupabaseConfigured: boolean;
  supabase: SupabaseClient<Database> | null;
  theme: 'light' | 'dark';
  toggleTheme: () => void;
  notify: (toast: Omit<ToastItem, 'id'>) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const THEME_EVENT = 'tallymark:theme-change';

function subscribeTheme(callback: () => void) {
  if (typeof window === 'undefined') return () => {};
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  window.addEventListener('storage', callback);
  window.addEventListener(THEME_EVENT, callback);
  mq.addEventListener('change', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(THEME_EVENT, callback);
    mq.removeEventListener('change', callback);
  };
}

function getThemeSnapshot(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  try {
    const stored = window.localStorage.getItem('tallymark:theme');
    if (stored === 'dark' || stored === 'light') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function AppProviders({
  supabaseUrl,
  supabaseAnonKey,
  isSupabaseConfigured,
  children,
}: {
  supabaseUrl: string;
  supabaseAnonKey: string;
  isSupabaseConfigured: boolean;
  children: React.ReactNode;
}) {
  const theme = useSyncExternalStore<'light' | 'dark'>(
    subscribeTheme,
    getThemeSnapshot,
    () => 'light' as const
  );
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggleTheme = useCallback(() => {
    const current = getThemeSnapshot();
    const next = current === 'dark' ? 'light' : 'dark';
    try {
      window.localStorage.setItem('tallymark:theme', next);
    } catch {
      // ignore
    }
    document.documentElement.classList.toggle('dark', next === 'dark');
    window.dispatchEvent(new Event(THEME_EVENT));
  }, []);

  const notify = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4200);
  }, []);

  const supabase = useMemo(() => {
    if (!isSupabaseConfigured || !supabaseUrl || !supabaseAnonKey) return null;
    return getSupabaseBrowserClient(supabaseUrl, supabaseAnonKey);
  }, [isSupabaseConfigured, supabaseUrl, supabaseAnonKey]);

  const value = useMemo<AppContextValue>(
    () => ({
      supabaseUrl,
      supabaseAnonKey,
      isSupabaseConfigured,
      supabase,
      theme,
      toggleTheme,
      notify,
    }),
    [supabaseUrl, supabaseAnonKey, isSupabaseConfigured, supabase, theme, toggleTheme, notify]
  );

  return (
    <AppContext.Provider value={value}>
      {children}
      <OfflineIndicator />
      {toasts.length > 0 && (
        <div
          aria-live="polite"
          className="no-print fixed top-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2 px-4 sm:px-0"
        >
          {toasts.map((t) => (
            <div
              key={t.id}
              className={`rounded-xl border px-4 py-3 shadow-lg backdrop-blur-md transition-all ${
                t.variant === 'error'
                  ? 'border-red-300 dark:border-red-900/60 bg-red-50/95 dark:bg-red-950/95 text-red-900 dark:text-red-100'
                  : t.variant === 'success'
                    ? 'border-[#0F5132]/30 dark:border-[#2D8A5E]/40 bg-white/95 dark:bg-[#181B18]/95 text-[#141413] dark:text-[#F4F1EA]'
                    : 'border-[#E5DFD2] dark:border-[#2A2E2A] bg-white/95 dark:bg-[#181B18]/95 text-[#141413] dark:text-[#F4F1EA]'
              }`}
            >
              <p className="text-sm font-semibold">{t.title}</p>
              {t.description && (
                <p className="mt-0.5 text-xs opacity-85 leading-relaxed">{t.description}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </AppContext.Provider>
  );
}

export function useAppContext() {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppContext must be used inside AppProviders');
  }
  return ctx;
}
