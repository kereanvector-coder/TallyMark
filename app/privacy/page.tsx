import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { TallyMarkLogo } from '@/components/brand/TallyMarkLogo';
import { MARKETING_CONFIG } from '@/lib/marketing-config';

export const metadata = {
  title: 'Privacy Policy — Tallymark',
  description:
    'How Tallymark handles your business books, receipt links, and personal data under the Nigeria Data Protection Act (NDPA).',
};

export default function PrivacyPage() {
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
            Legal · Nigeria Data Protection Act (NDPA 2023)
          </p>
          <h1 className="font-display text-4xl sm:text-5xl">Privacy Policy</h1>
          <p className="text-sm text-[#57534E] dark:text-[#A8A29E]">
            Last updated November 2026 · Tallymark ({MARKETING_CONFIG.contactEmail})
          </p>
        </div>

        <div
          role="note"
          className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-4 text-xs sm:text-sm text-amber-950 dark:text-amber-100 leading-relaxed"
        >
          <strong>Early-access draft notice:</strong> This Privacy Policy is structured around
          the Nigeria Data Protection Act (NDPA 2023) for a Nigerian SaaS product and should be
          reviewed by qualified Nigerian legal counsel prior to general commercial launch.
        </div>

        <div className="space-y-7 text-[15px] leading-relaxed text-[#57534E] dark:text-[#A8A29E]">
          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-[#141413] dark:text-[#F4F1EA]">
              1. Who We Are &amp; Scope
            </h2>
            <p>
              Tallymark provides digital receipt issuance, cash-book record keeping, debtor and
              creditor tracking, and daily summary tools for Nigerian small businesses. Under the
              Nigeria Data Protection Act 2023 (NDPA), Tallymark acts as a Data Controller for
              account registration details and as a Data Processor for the customer and transaction
              records you enter on behalf of your business.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-[#141413] dark:text-[#F4F1EA]">
              2. Data We Collect &amp; Lawful Basis
            </h2>
            <ul className="list-disc pl-5 space-y-1.5">
              <li>
                <strong className="text-[#141413] dark:text-[#F4F1EA]">Account &amp; Business Profile:</strong>{' '}
                Your sign-in email (via Google Sign-In or magic link), business name, phone number,
                address, logo, bank account details you choose to store, and VAT preferences — processed
                to perform our contract with you.
              </li>
              <li>
                <strong className="text-[#141413] dark:text-[#F4F1EA]">Transaction &amp; Ledger Records:</strong>{' '}
                Receipts, quick sales, credit sales, expenses, proof uploads, and day closures you
                create. Every record belongs to your business and is isolated via database Row Level
                Security.
              </li>
              <li>
                <strong className="text-[#141413] dark:text-[#F4F1EA]">Anonymous First-Party Landing Events:</strong>{' '}
                On the public website, we log non-identifying interaction counts (such as button
                clicks and interactive demo usage with event name, path, and timestamp only). We do
                not store names, emails, or personal identifiers in landing analytics, nor do we sell
                or share data with third-party ad brokers.
              </li>
              <li>
                <strong className="text-[#141413] dark:text-[#F4F1EA]">Voice Dictation:</strong>{' '}
                When you tap the microphone icon inside fields, audio is handled directly by your
                device browser&apos;s Web Speech API and is not stored as raw audio recordings by
                Tallymark.
              </li>
            </ul>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-[#141413] dark:text-[#F4F1EA]">
              3. Public Receipt Verification Links (/r/id)
            </h2>
            <p>
              When you share a receipt link or QR code with a customer, anyone holding that
              unguessable link can view the printed receipt fields (business name, line items, Naira
              totals, payment method, and VALID/VOID status). Private internal notes, expenses, and
              customer phone numbers are excluded from the public endpoint.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-[#141413] dark:text-[#F4F1EA]">
              4. Storage, Cross-Border Transfers &amp; Security
            </h2>
            <p>
              Data is hosted on encrypted PostgreSQL and object storage infrastructure operated by
              Supabase with TLS in transit and encryption at rest. Business logos reside in a public
              prefix-scoped bucket solely so they can render on your shared receipts, while expense
              proof photos and PDFs reside in a private bucket accessible only through short-lived
              signed links to the authenticated owner.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-[#141413] dark:text-[#F4F1EA]">
              5. Your Rights Under the NDPA
            </h2>
            <p>
              Subject to Nigerian law, you have the right to access, correct, export (portability),
              or delete your personal and business data. Inside Tallymark Settings, you can export a
              complete JSON backup, download CSVs from Reports, or permanently delete your account
              and all associated records at any time.
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-lg font-semibold text-[#141413] dark:text-[#F4F1EA]">
              6. Contact
            </h2>
            <p>
              For privacy requests, NDPA inquiries, or data removal assistance, email{' '}
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
