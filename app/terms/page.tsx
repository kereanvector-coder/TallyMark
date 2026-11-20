import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { TallyMarkLogo } from '@/components/brand/TallyMarkLogo';
import { MARKETING_CONFIG } from '@/lib/marketing-config';

export const metadata = {
  title: 'Terms of Service — Tallymark',
  description:
    'Terms governing the use of Tallymark digital receipts, cash-book records, and early access service.',
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-[#FAF7F0] dark:bg-[#101210] text-[#141413] dark:text-[#F4F1EA]">
      <header className="border-b border-[#E5DFD2] dark:border-[#2A2E2A]">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/">
            <TallyMarkLogo size="sm" />
          </Link>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#57534E] dark:text-[#A8A29E] hover:text-[#141413] dark:hover:text-[#F4F1EA]"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 sm:px-6 py-12 sm:py-16 space-y-8">
        <div className="space-y-2">
          <p className="text-[12px] uppercase tracking-[0.08em] font-semibold text-[#0F5132] dark:text-[#2D8A5E]">
            Legal · Service Terms
          </p>
          <h1 className="font-display text-4xl sm:text-5xl">Terms of Service</h1>
          <p className="text-sm text-[#57534E] dark:text-[#A8A29E]">
            Last updated November 2026 · Tallymark ({MARKETING_CONFIG.contactEmail})
          </p>
        </div>

        <div
          role="note"
          className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 text-xs sm:text-sm text-amber-950 dark:text-amber-100 leading-relaxed"
        >
          <strong>Early-access draft notice:</strong> These Terms of Service are written for a
          Nigerian SaaS application and should be reviewed by qualified Nigerian legal counsel prior
          to general commercial launch.
        </div>

        <div className="space-y-7 text-[15px] leading-relaxed text-[#57534E] dark:text-[#A8A29E]">
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-[#141413] dark:text-[#F4F1EA]">
              1. Acceptance &amp; Early Access
            </h2>
            <p>
              By creating an account or using Tallymark, you agree to these Terms. Tallymark is
              currently offered free during early access. If paid plans are introduced in the
              future, existing early-access accounts will receive advance notice and may export
              their complete records at any time without lock-in.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-[#141413] dark:text-[#F4F1EA]">
              2. Receipt Immutability &amp; Ledger Audit Trail
            </h2>
            <p>
              To protect merchants and buyers from alteration or silent deletion, issued receipts
              receive sequential numbers without gaps and cannot be overwritten or deleted. Errors on
              an issued receipt must be voided with an explicit reason and re-issued. Similarly, once
              a day is closed in your Cash Book, changes post a visible adjustment entry with a
              recorded reason.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-[#141413] dark:text-[#F4F1EA]">
              3. Merchant &amp; Tax Responsibility
            </h2>
            <p>
              Tallymark is a book-keeping and receipting tool, not a licensed tax adviser, auditor,
              or payment processor. You are responsible for the accuracy of item descriptions,
              Nigerian Naira prices, VAT toggles (including 7.5% FIRS VAT applicability), customer
              balances, and statutory filings.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-[#141413] dark:text-[#F4F1EA]">
              4. Ownership &amp; Acceptable Use
            </h2>
            <p>
              You retain 100% ownership of your business records. You agree not to use Tallymark to
              issue fraudulent receipts, impersonate another merchant, or attempt unauthorized
              access to the platform or rate-limited endpoints.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-[#141413] dark:text-[#F4F1EA]">
              5. Governing Law &amp; Contact
            </h2>
            <p>
              These Terms are governed by the laws of the Federal Republic of Nigeria. Questions or
              support notices may be sent to{' '}
              <a
                href={`mailto:${MARKETING_CONFIG.contactEmail}`}
                className="text-[#0F5132] dark:text-[#7CE0AC] underline"
              >
                {MARKETING_CONFIG.contactEmail}
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
