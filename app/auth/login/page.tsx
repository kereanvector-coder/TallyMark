'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react';
import { useAppContext } from '@/components/providers/AppProviders';
import { TallyMarkLogo } from '@/components/brand/TallyMarkLogo';

export default function LoginPage() {
  const { supabase, isSupabaseConfigured } = useAppContext();
  const [email, setEmail] = useState('');
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingEmail, setLoadingEmail] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const getRedirectUrl = () => {
    if (typeof window === 'undefined') return '/auth/callback';
    return `${window.location.origin}/auth/callback`;
  };

  const handleGoogleSignIn = async () => {
    if (!supabase) return;
    setErrorMsg(null);
    setLoadingGoogle(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: getRedirectUrl(),
        },
      });
      if (error) {
        setErrorMsg(error.message);
        setLoadingGoogle(false);
      }
    } catch {
      setErrorMsg('Could not start Google sign-in. Please try again.');
      setLoadingGoogle(false);
    }
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) return;
    const trimmed = email.trim();
    if (!trimmed) {
      setErrorMsg('Enter your email address.');
      return;
    }
    setErrorMsg(null);
    setLoadingEmail(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: trimmed,
        options: {
          emailRedirectTo: getRedirectUrl(),
        },
      });
      if (error) {
        setErrorMsg(error.message);
      } else {
        setSentTo(trimmed);
      }
    } catch {
      setErrorMsg('Could not send sign-in link. Check your connection and try again.');
    } finally {
      setLoadingEmail(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F0] dark:bg-[#101210] text-[#141413] dark:text-[#F4F1EA]">
      <header className="border-b border-[#E5DFD2] dark:border-[#2A2E2A]">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/">
            <TallyMarkLogo size="md" />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#57534E] dark:text-[#A8A29E] hover:text-[#141413] dark:hover:text-[#F4F1EA]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Home</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-6 sm:p-8 shadow-sm space-y-6">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.08em] font-semibold text-[#0F5132] dark:text-[#2D8A5E]">
              Merchant Access
            </p>
            <h1 className="font-display text-3xl sm:text-4xl">Sign in to Tallymark</h1>
            <p className="text-sm text-[#57534E] dark:text-[#A8A29E] leading-relaxed">
              Issue receipts, track balances, and keep your daily cash book from phone or desktop.
            </p>
          </div>

          {!isSupabaseConfigured ? (
            <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 p-4 text-sm text-amber-900 dark:text-amber-100 space-y-1.5">
              <p className="font-semibold">Supabase secrets not configured</p>
              <p className="text-xs leading-relaxed">
                Add <code className="font-mono-ledger">SUPABASE_URL</code>,{' '}
                <code className="font-mono-ledger">SUPABASE_ANON_KEY</code>, and{' '}
                <code className="font-mono-ledger">SUPABASE_SERVICE_ROLE_KEY</code> in the Secrets
                panel, then run <code className="font-mono-ledger">supabase/schema.sql</code> and{' '}
                <code className="font-mono-ledger">
                  supabase/migrations/001_phase1b_receipts_and_onboarding.sql
                </code>
                .
              </p>
            </div>
          ) : sentTo ? (
            <div className="rounded-xl border border-[#0F5132]/30 bg-[#0F5132]/5 dark:bg-[#2D8A5E]/10 p-5 space-y-3">
              <div className="flex items-center gap-2 text-[#0F5132] dark:text-[#7CE0AC] font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Magic link sent</span>
              </div>
              <p className="text-sm text-[#57534E] dark:text-[#A8A29E] leading-relaxed">
                We sent a sign-in link to <strong className="text-[#141413] dark:text-[#F4F1EA]">{sentTo}</strong>.
                Open the email on this device to continue.
              </p>
              <button
                type="button"
                onClick={() => setSentTo(null)}
                className="text-xs font-medium text-[#0F5132] dark:text-[#7CE0AC] underline cursor-pointer"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {errorMsg && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/50 px-4 py-3 text-xs text-red-900 dark:text-red-200"
                >
                  {errorMsg}
                </div>
              )}

              <button
                type="button"
                onClick={handleGoogleSignIn}
                disabled={loadingGoogle || loadingEmail}
                className="w-full min-h-[48px] px-4 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#202420] hover:bg-[#F3EFE4] dark:hover:bg-[#2A2E2A] text-sm font-semibold text-[#141413] dark:text-[#F4F1EA] flex items-center justify-center gap-3 transition-colors disabled:opacity-60 cursor-pointer"
              >
                <span>{loadingGoogle ? 'Connecting to Google…' : 'Continue with Google'}</span>
              </button>

              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-[#E5DFD2] dark:border-[#2A2E2A]" />
                <span className="px-3 text-xs text-[#57534E] dark:text-[#A8A29E]">
                  or email magic link
                </span>
                <div className="flex-grow border-t border-[#E5DFD2] dark:border-[#2A2E2A]" />
              </div>

              <form onSubmit={handleMagicLink} className="space-y-3">
                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E]">
                    Business or personal email
                  </span>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="amina@shopname.ng"
                    className="w-full min-h-[46px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#101210] px-3.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
                  />
                </label>
                <button
                  type="submit"
                  disabled={loadingEmail || loadingGoogle}
                  className="w-full min-h-[48px] px-4 rounded-xl bg-[#0F5132] hover:bg-[#0B3E26] text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
                >
                  <Mail className="w-4 h-4" />
                  <span>{loadingEmail ? 'Sending link…' : 'Send Magic Link'}</span>
                </button>
              </form>
            </div>
          )}

          <p className="text-xs text-[#57534E] dark:text-[#A8A29E] leading-relaxed">
            By signing in, you agree to our{' '}
            <Link href="/terms" className="underline">
              Terms
            </Link>{' '}
            and{' '}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
