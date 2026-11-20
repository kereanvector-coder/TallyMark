'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { PublicReceiptResponse, ReceiptTemplateStyle } from '@/lib/database.types';
import { ReceiptTemplateRenderer } from './ReceiptTemplateRenderer';
import { ReceiptShareActions } from './ReceiptShareActions';
import { TallyMarkLogo } from '@/components/brand/TallyMarkLogo';
import { formatLagosDateTime, formatNaira } from '@/lib/format';

export function PublicReceiptViewer({
  data,
  logoUrl,
}: {
  data: PublicReceiptResponse;
  logoUrl: string | null;
}) {
  const [template, setTemplate] = useState<ReceiptTemplateStyle>(
    data.business.receipt_template || 'classic'
  );
  const isVoid = data.receipt.status === 'void';
  const remaining =
    data.receipt.receipt_kind === 'sale'
      ? data.receipt.outstanding_balance_kobo
      : data.receipt.balance_due_kobo;

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF7F0] dark:bg-[#101210] text-[#141413] dark:text-[#F4F1EA]">
      <header className="no-print border-b border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0]/90 dark:bg-[#101210]/90 backdrop-blur-md">
        <div className="mx-auto max-w-4xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/">
            <TallyMarkLogo size="sm" />
          </Link>

          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold ${
              isVoid
                ? 'bg-red-100 text-red-900 border border-red-300'
                : 'bg-[#0F5132]/10 text-[#0F5132] dark:bg-[#2D8A5E]/20 dark:text-[#7CE0AC] border border-[#0F5132]/25'
            }`}
          >
            {isVoid ? (
              <>
                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                <span>VOID RECEIPT</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                <span>VALID RECEIPT</span>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 mx-auto w-full max-w-4xl px-4 sm:px-6 py-8 space-y-6">
        {/* Verification Banner */}
        <section className="no-print rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <p className="text-xs uppercase tracking-[0.08em] font-semibold text-[#57534E] dark:text-[#A8A29E]">
              {isVoid ? 'Voided Record' : 'Verified Digital Receipt'}
            </p>
            <p className="text-sm sm:text-base font-medium">
              <span className="font-mono-ledger font-semibold">{data.receipt.receipt_code}</span>
              <span aria-hidden="true" className="mx-2 text-[#57534E]">·</span>
              <span className="font-mono-ledger font-semibold">
                {formatNaira(data.receipt.total_kobo)}
              </span>
              {!isVoid && remaining > 0 && (
                <>
                  <span aria-hidden="true" className="mx-2 text-[#57534E]">·</span>
                  <span className="text-amber-700 dark:text-amber-400 font-medium">
                    Balance due {formatNaira(remaining)}
                  </span>
                </>
              )}
            </p>
            {isVoid && data.receipt.voided_at && (
              <p className="text-xs text-red-700 dark:text-red-400">
                Voided on {formatLagosDateTime(data.receipt.voided_at)}
                {data.receipt.void_reason ? ` — ${data.receipt.void_reason}` : ''}
              </p>
            )}
          </div>

          <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#202420] self-start">
            {(['classic', 'modern', 'thermal'] as ReceiptTemplateStyle[]).map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => setTemplate(style)}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-medium capitalize transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  template === style
                    ? 'bg-white dark:bg-[#181B18] text-[#141413] dark:text-[#F4F1EA] shadow-sm'
                    : 'text-[#57534E] dark:text-[#A8A29E] hover:text-[#141413] dark:hover:text-[#F4F1EA]'
                }`}
              >
                {style === 'thermal' ? '80mm' : style}
              </button>
            ))}
          </div>
        </section>

        {/* Actions */}
        <ReceiptShareActions data={data} template={template} logoUrl={logoUrl} />

        {/* Receipt Body */}
        <ReceiptTemplateRenderer data={data} template={template} logoUrl={logoUrl} />
      </main>

      <footer className="no-print border-t border-[#E5DFD2] dark:border-[#2A2E2A] py-6 text-center text-xs text-[#57534E] dark:text-[#A8A29E]">
        <span>Issued on Tallymark · </span>
        <Link href="/" className="underline hover:text-[#141413] dark:hover:text-[#F4F1EA]">
          Create receipts for your business
        </Link>
      </footer>
    </div>
  );
}
