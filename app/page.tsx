import type { Metadata } from 'next';
import Link from 'next/link';
import { Check, Lock, Mic, Receipt, ShieldCheck } from 'lucide-react';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getPublicSupabaseConfig } from '@/lib/supabase/config';
import { MARKETING_CONFIG } from '@/lib/marketing-config';
import { TallyMarkLogo } from '@/components/brand/TallyMarkLogo';
import { PWAInstallButton } from '@/components/pwa/PWAInstallButton';
import { MarketingNav } from '@/components/marketing/MarketingNav';
import { TrackedCtaLink } from '@/components/marketing/TrackedCtaLink';
import { HeroLiveReceiptBuilder } from '@/components/marketing/HeroLiveReceiptBuilder';
import { ScrollStorySection } from '@/components/marketing/ScrollStorySection';
import { InteractiveDailySummaryPreview } from '@/components/marketing/InteractiveDailySummaryPreview';
import { ClickToVerifyQrSection } from '@/components/marketing/ClickToVerifyQrSection';
import { FaqAccordion } from '@/components/marketing/FaqAccordion';
import {
  CustomPointerCursor,
  EditorialHeadingReveal,
  ParallaxPaperLayer,
  ReceiptPrintPreloader,
} from '@/components/marketing/MarketingPolish';

export const metadata: Metadata = {
  title: `${MARKETING_CONFIG.brandName} — Replace the paper cash book and write receipts in seconds`,
  description:
    'Issue verified Nigerian Naira receipts in seconds, track part payments and debtors automatically, and keep a clean daily digital cash book.',
  alternates: {
    canonical: `${MARKETING_CONFIG.siteUrl}/`,
  },
  openGraph: {
    title: `${MARKETING_CONFIG.brandName} — Issue the receipt. Keep the book. Know your day.`,
    description:
      'Replace handwritten receipt booklets and paper cash books. Issue verifiable receipts, share on WhatsApp, and balance your day cleanly.',
    url: `${MARKETING_CONFIG.siteUrl}/`,
    type: 'website',
    siteName: MARKETING_CONFIG.brandName,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${MARKETING_CONFIG.brandName} — Issue the receipt. Keep the book. Know your day.`,
    description:
      'Digital receipts, part-payment tracking, and a daily cash book built for Nigerian small businesses.',
  },
};

async function getIsSignedIn(): Promise<boolean> {
  const { isConfigured } = getPublicSupabaseConfig();
  if (!isConfigured) return false;
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase.auth.getUser();
    return Boolean(data.user);
  } catch {
    return false;
  }
}

const WHO_ITS_FOR = [
  {
    sector: 'Boutiques & ready-to-wear',
    detail: 'Issue branded receipts on WhatsApp for walk-in and Instagram orders, with clear deposit balances on pre-orders.',
  },
  {
    sector: 'Food vendors & mini-marts',
    detail: 'Log fast counter sales, dispatch rider expenses, and daily drawer counts without slowing down the lunch rush.',
  },
  {
    sector: 'Salons, barbers & studios',
    detail: 'Dictate services and product add-ons by voice, accept cash or bank transfer, and see net intake by evening.',
  },
  {
    sector: 'Pharmacies & patent stores',
    detail: 'Keep sequential gap-free receipts, print 80mm thermal slips at the counter, and optionally show 7.5% VAT.',
  },
  {
    sector: 'Phone, electronics & fabric shops',
    detail: 'Track high-ticket part payments with immutable receipt links so both shop and buyer share the same record.',
  },
  {
    sector: 'Tailors & service providers',
    detail: 'Record advance deposits against agreed totals and issue linked balance receipts when final pickup is paid.',
  },
] as const;

export default async function HomePage() {
  const isSignedIn = await getIsSignedIn();

  const softwareJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: MARKETING_CONFIG.brandName,
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web, Android, iOS',
    url: MARKETING_CONFIG.siteUrl,
    description:
      'Digital receipt issuer and daily cash book built for Nigerian small businesses.',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'NGN',
      description: 'Free during early access',
    },
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F0] dark:bg-[#101210] text-[#141413] dark:text-[#F4F1EA]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(softwareJsonLd).replace(/</g, '\\u003c'),
        }}
      />

      <ReceiptPrintPreloader />
      <CustomPointerCursor />

      {/* 1. Sticky 3-Zone Top Nav */}
      <MarketingNav isSignedIn={isSignedIn} />

      <main className="flex-1">
        {/* 2. Hero + Live Interactive Receipt Builder & Brand Color Picker */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pt-10 pb-16 sm:pt-16 sm:pb-24">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
            <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24">
              <p className="text-[12px] uppercase tracking-[0.08em] font-semibold text-[#0F5132] dark:text-[#7CE0AC]">
                {MARKETING_CONFIG.earlyAccessLabel} · {MARKETING_CONFIG.trustLine}
              </p>

              <h1 className="font-display text-[42px] sm:text-[60px] leading-[1.03] text-[#141413] dark:text-[#F4F1EA] text-balance">
                Replace the paper cash book and write receipts in seconds.
              </h1>

              <p className="text-base sm:text-lg leading-relaxed text-[#57534E] dark:text-[#A8A29E] max-w-xl">
                Issue the receipt. Keep the book. Know your day. Built for Nigerian small
                businesses—type or speak a sale, share a verified link on WhatsApp, and reconcile
                your cash drawer at closing time.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                <TrackedCtaLink
                  isSignedIn={isSignedIn}
                  eventName="hero_cta_clicked"
                  size="lg"
                />
                <PWAInstallButton />
              </div>

              <div className="pt-4 border-t border-[#E5DFD2] dark:border-[#2A2E2A] space-y-2 text-sm text-[#57534E] dark:text-[#A8A29E]">
                <p className="flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#0F5132] dark:text-[#7CE0AC] shrink-0" />
                  <span>Gap-free receipt numbering with WhatsApp, PDF &amp; 80mm thermal output</span>
                </p>
                <p className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-[#0F5132] dark:text-[#7CE0AC] shrink-0" />
                  <span>Private owner-only books backed by Row Level Security</span>
                </p>
              </div>
            </div>

            <div className="lg:col-span-7">
              <ParallaxPaperLayer offset={14}>
                <HeroLiveReceiptBuilder isSignedIn={isSignedIn} />
              </ParallaxPaperLayer>
            </div>
          </div>
        </section>

        {/* 3. The Problem */}
        <section
          id="problem"
          className="border-t border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] py-16 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 space-y-12">
            <EditorialHeadingReveal className="max-w-3xl space-y-3">
              <p className="text-[12px] uppercase tracking-[0.08em] font-semibold text-[#0F5132] dark:text-[#7CE0AC]">
                Why Paper Fails Busy Shops
              </p>
              <h2 className="font-display text-3xl sm:text-5xl leading-tight text-balance">
                Carbon booklets smudge, notebooks go missing, and 9 PM math rarely agrees with the drawer.
              </h2>
            </EditorialHeadingReveal>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-10">
              <div className="pt-5 border-t border-[#E5DFD2] dark:border-[#2A2E2A] space-y-2.5">
                <p className="font-mono-ledger text-xs font-semibold text-[#0F5132] dark:text-[#7CE0AC]">
                  01 · HANDWRITTEN RECEIPTS
                </p>
                <h3 className="text-lg font-semibold">Slow at the counter, impossible to search</h3>
                <p className="text-sm leading-relaxed text-[#57534E] dark:text-[#A8A29E]">
                  Writing line items, Naira words, and dates by hand slows every customer queue.
                  When someone asks for a copy two weeks later, you flip through torn carbon stubs.
                </p>
              </div>

              <div className="pt-5 border-t border-[#E5DFD2] dark:border-[#2A2E2A] space-y-2.5">
                <p className="font-mono-ledger text-xs font-semibold text-[#0F5132] dark:text-[#7CE0AC]">
                  02 · LATE-NIGHT CASH BOOK
                </p>
                <h3 className="text-lg font-semibold">Re-writing the day from bank alerts</h3>
                <p className="text-sm leading-relaxed text-[#57534E] dark:text-[#A8A29E]">
                  Transfers, POS slips, cash sales, rider payouts, and part-paid deposits end up
                  scattered across messages and scraps until someone copies them into a book at night.
                </p>
              </div>

              <div className="pt-5 border-t border-[#E5DFD2] dark:border-[#2A2E2A] space-y-2.5">
                <p className="font-mono-ledger text-xs font-semibold text-[#0F5132] dark:text-[#7CE0AC]">
                  03 · NOT KNOWING HOW THE DAY WENT
                </p>
                <h3 className="text-lg font-semibold">Full till, unclear net position</h3>
                <p className="text-sm leading-relaxed text-[#57534E] dark:text-[#A8A29E]">
                  Cash in hand looks healthy until you subtract stock restocks, fuel, and unpaid
                  balances. Tallymark shows money in, money out, and who still owes before you lock up.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 4. How It Works (Sticky 3-Step Scroll-Driven Story) */}
        <ScrollStorySection />

        {/* 5. Features in Varied Asymmetric Layout with Real UI */}
        <section
          id="features"
          className="border-t border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] py-16 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 space-y-14">
            <EditorialHeadingReveal className="max-w-2xl space-y-3">
              <p className="text-[12px] uppercase tracking-[0.08em] font-semibold text-[#0F5132] dark:text-[#7CE0AC]">
                Inside Tallymark
              </p>
              <h2 className="font-display text-3xl sm:text-5xl leading-tight text-balance">
                Every sale, expense, and balance connected to one book.
              </h2>
            </EditorialHeadingReveal>

            {/* Row A: Asymmetric 5 / 7 Split featuring Interactive Daily Summary Preview */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
              <div className="lg:col-span-5 divide-y divide-[#E5DFD2] dark:divide-[#2A2E2A] border-y border-[#E5DFD2] dark:border-[#2A2E2A]">
                <div className="py-5 space-y-1.5">
                  <div className="flex items-center gap-2 text-xs font-mono-ledger font-semibold text-[#0F5132] dark:text-[#7CE0AC]">
                    <Receipt className="w-4 h-4" />
                    <span>RECEIPTS</span>
                  </div>
                  <h3 className="text-base sm:text-lg font-semibold">
                    30-second receipts with part payments
                  </h3>
                  <p className="text-sm leading-relaxed text-[#57534E] dark:text-[#A8A29E]">
                    Autosuggest saved items and customers, calculate Naira words and optional 7.5%
                    VAT, and create a linked balance receipt when the remainder arrives.
                  </p>
                </div>

                <div className="py-5 space-y-1.5">
                  <p className="text-xs font-mono-ledger font-semibold text-[#0F5132] dark:text-[#7CE0AC]">
                    DAILY CASH BOOK
                  </p>
                  <h3 className="text-base sm:text-lg font-semibold">
                    Automatic book entries + drawer close
                  </h3>
                  <p className="text-sm leading-relaxed text-[#57534E] dark:text-[#A8A29E]">
                    Every receipt writes directly into your Africa/Lagos daily cash book. Count
                    physical cash at closing, verify any difference, and seal the day cleanly.
                  </p>
                </div>

                <div className="py-5 space-y-1.5">
                  <p className="text-xs font-mono-ledger font-semibold text-[#0F5132] dark:text-[#7CE0AC]">
                    DEBTORS &amp; BALANCES
                  </p>
                  <h3 className="text-base sm:text-lg font-semibold">
                    Know exactly who owes and since when
                  </h3>
                  <p className="text-sm leading-relaxed text-[#57534E] dark:text-[#A8A29E]">
                    Part-paid receipts and credit sales group under each customer with days overdue
                    and polite WhatsApp balance reminders ready to send.
                  </p>
                </div>
              </div>

              <div className="lg:col-span-7">
                <InteractiveDailySummaryPreview />
              </div>
            </div>

            {/* Row B: Asymmetric Secondary Capability Strips */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-2">
              <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] p-6 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-mono-ledger font-semibold text-[#0F5132] dark:text-[#7CE0AC]">
                  <Mic className="w-4 h-4" />
                  <span>SPEAK YOUR DAY</span>
                </div>
                <h3 className="text-base font-semibold">Voice dictation on any field</h3>
                <p className="text-sm leading-relaxed text-[#57534E] dark:text-[#A8A29E]">
                  Tap the microphone button in Chrome or Safari to dictate item names, customer
                  details, and notes in Nigerian English—hidden cleanly where unsupported.
                </p>
              </div>

              <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] p-6 space-y-2.5">
                <p className="text-xs font-mono-ledger font-semibold text-[#0F5132] dark:text-[#7CE0AC]">
                  EXPENSES &amp; PROOF
                </p>
                <h3 className="text-base font-semibold">Track stock, fuel, and payouts</h3>
                <p className="text-sm leading-relaxed text-[#57534E] dark:text-[#A8A29E]">
                  Categorize outgoing cash or transfers and attach private receipt photos stored in
                  encrypted owner-only storage buckets.
                </p>
              </div>

              <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] p-6 space-y-2.5">
                <p className="text-xs font-mono-ledger font-semibold text-[#0F5132] dark:text-[#7CE0AC]">
                  REPORTS &amp; EXPORTS
                </p>
                <h3 className="text-base font-semibold">Clean CSVs &amp; full data portability</h3>
                <p className="text-sm leading-relaxed text-[#57534E] dark:text-[#A8A29E]">
                  Filter sold, received, expenses, and net cash flow by day, week, or custom range—and
                  download your entire business history in one click.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 6. The Verified Receipt Explained + Click-to-Verify QR Flip */}
        <section
          id="verify"
          className="border-t border-[#E5DFD2] dark:border-[#2A2E2A] py-16 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-center">
            <div className="lg:col-span-5 space-y-5">
              <p className="text-[12px] uppercase tracking-[0.08em] font-semibold text-[#0F5132] dark:text-[#7CE0AC]">
                The Verified Receipt
              </p>
              <h2 className="font-display text-3xl sm:text-5xl leading-tight text-balance">
                Every receipt carries its own live proof.
              </h2>
              <p className="text-base leading-relaxed text-[#57534E] dark:text-[#A8A29E]">
                Customers and dispatch riders can scan the QR code or open your unguessable{' '}
                <span className="font-mono-ledger text-[#141413] dark:text-[#F4F1EA]">/r/…</span>{' '}
                link without signing in to verify the exact totals stamped by your shop.
              </p>

              <div className="pt-2 space-y-3 text-sm text-[#57534E] dark:text-[#A8A29E]">
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-[#0F5132] dark:text-[#7CE0AC] shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-[#141413] dark:text-[#F4F1EA]">
                      Gap-free sequential locks:
                    </strong>{' '}
                    Receipt numbers advance inside the database transaction so numbers cannot be
                    skipped or silently erased.
                  </span>
                </div>
                <div className="flex items-start gap-2.5">
                  <ShieldCheck className="w-4 h-4 text-[#0F5132] dark:text-[#7CE0AC] shrink-0 mt-0.5" />
                  <span>
                    <strong className="text-[#141413] dark:text-[#F4F1EA]">
                      Honest VOID history:
                    </strong>{' '}
                    If a receipt has a mistake, voiding stamps it VOID publicly with your recorded
                    reason instead of pretending it never happened.
                  </span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-7">
              <ClickToVerifyQrSection />
            </div>
          </div>
        </section>

        {/* 7. Who It's For */}
        <section
          id="who-its-for"
          className="border-t border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] py-16 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-4 space-y-3">
              <p className="text-[12px] uppercase tracking-[0.08em] font-semibold text-[#0F5132] dark:text-[#7CE0AC]">
                Who It&apos;s For
              </p>
              <h2 className="font-display text-3xl sm:text-4xl leading-tight text-balance">
                Made for shops and services run from a phone.
              </h2>
              <p className="text-sm leading-relaxed text-[#57534E] dark:text-[#A8A29E]">
                Whether you sell across a market counter or deliver across town, Tallymark keeps
                receipts clean and your daily book balanced.
              </p>
            </div>

            <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-x-8 divide-y sm:divide-y-0 border-t sm:border-t-0 border-[#E5DFD2] dark:border-[#2A2E2A]">
              {WHO_ITS_FOR.map((item) => (
                <div
                  key={item.sector}
                  className="py-5 sm:border-t sm:border-[#E5DFD2] sm:dark:border-[#2A2E2A] space-y-1.5"
                >
                  <h3 className="text-base font-semibold">{item.sector}</h3>
                  <p className="text-sm leading-relaxed text-[#57534E] dark:text-[#A8A29E]">
                    {item.detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 8. FAQ */}
        <section
          id="faq"
          className="border-t border-[#E5DFD2] dark:border-[#2A2E2A] py-16 sm:py-24"
        >
          <div className="mx-auto max-w-6xl px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-4 space-y-3">
              <p className="text-[12px] uppercase tracking-[0.08em] font-semibold text-[#0F5132] dark:text-[#7CE0AC]">
                Questions
              </p>
              <h2 className="font-display text-3xl sm:text-4xl leading-tight">
                Plain answers before you start.
              </h2>
              <p className="text-sm text-[#57534E] dark:text-[#A8A29E] leading-relaxed">
                {MARKETING_CONFIG.earlyAccessLabel} · {MARKETING_CONFIG.trustLine}
              </p>
            </div>

            <div className="lg:col-span-8">
              <FaqAccordion />
            </div>
          </div>
        </section>

        {/* 9. Final CTA */}
        <section className="border-t border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#0F5132] text-[#FAF7F0] py-16 sm:py-24">
          <div className="mx-auto max-w-4xl px-4 sm:px-6 text-center space-y-6">
            <p className="text-[12px] uppercase tracking-[0.08em] font-semibold text-[#FAF7F0]/80">
              {MARKETING_CONFIG.earlyAccessLabel} · {MARKETING_CONFIG.trustLine}
            </p>
            <EditorialHeadingReveal>
              <h2 className="font-display text-4xl sm:text-6xl leading-[1.05] text-balance">
                Close tonight&apos;s book in five minutes, not forty.
              </h2>
            </EditorialHeadingReveal>
            <p className="text-base sm:text-lg text-[#FAF7F0]/85 max-w-xl mx-auto leading-relaxed">
              Set up your shop prefix, brand color, and bank details once—then issue your first
              verified receipt right away.
            </p>
            <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
              <TrackedCtaLink
                isSignedIn={isSignedIn}
                eventName="final_cta_clicked"
                variant="inverted"
                size="lg"
              />
            </div>
          </div>
        </section>
      </main>

      {/* 10. Footer */}
      <footer className="border-t border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] py-10">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 text-xs text-[#57534E] dark:text-[#A8A29E]">
          <div className="space-y-1.5">
            <TallyMarkLogo size="sm" />
            <p>{MARKETING_CONFIG.creditLine}</p>
          </div>

          <div className="flex flex-wrap items-center gap-6">
            <Link
              href="/privacy"
              className="hover:text-[#141413] dark:hover:text-[#F4F1EA] underline-offset-4 hover:underline"
            >
              Privacy
            </Link>
            <Link
              href="/terms"
              className="hover:text-[#141413] dark:hover:text-[#F4F1EA] underline-offset-4 hover:underline"
            >
              Terms
            </Link>
            <a
              href={`mailto:${MARKETING_CONFIG.contactEmail}`}
              className="hover:text-[#141413] dark:hover:text-[#F4F1EA] underline-offset-4 hover:underline"
            >
              {MARKETING_CONFIG.contactEmail}
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
