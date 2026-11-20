'use client';

import React, { useState } from 'react';
import { Check, Copy, Download, MessageCircle, Printer, Share2 } from 'lucide-react';
import type { PublicReceiptResponse, ReceiptTemplateStyle } from '@/lib/database.types';
import {
  buildWhatsAppMessage,
  buildWhatsAppShareUrl,
  getPublicReceiptUrl,
} from '@/lib/format';
import { downloadPdfBlob, generateReceiptPdfBytes } from '@/lib/pdf/receipt-pdf';
import { useAppContext } from '@/components/providers/AppProviders';

export function ReceiptShareActions({
  data,
  template,
  logoUrl,
  customerPhone,
}: {
  data: PublicReceiptResponse;
  template: ReceiptTemplateStyle;
  logoUrl?: string | null;
  customerPhone?: string | null;
}) {
  const { notify } = useAppContext();
  const [downloading, setDownloading] = useState(false);
  const [copied, setCopied] = useState(false);

  const publicUrl = getPublicReceiptUrl(data.receipt.public_id);
  const whatsappMsg = buildWhatsAppMessage({
    businessName: data.business.name,
    receiptCode: data.receipt.receipt_code,
    customerName: data.receipt.customer_name,
    totalKobo: data.receipt.total_kobo,
    amountPaidKobo: data.receipt.amount_paid_kobo,
    balanceDueKobo:
      typeof data.receipt.outstanding_balance_kobo === 'number' &&
      data.receipt.receipt_kind === 'sale'
        ? data.receipt.outstanding_balance_kobo
        : data.receipt.balance_due_kobo,
    status: data.receipt.status,
    receiptUrl: publicUrl,
  });
  const whatsappUrl = buildWhatsAppShareUrl(whatsappMsg, customerPhone);

  const handleDownloadPdf = async () => {
    try {
      setDownloading(true);
      const bytes = await generateReceiptPdfBytes({
        data,
        template,
        logoUrl,
        publicUrl,
      });
      downloadPdfBlob(bytes, `Receipt_${data.receipt.receipt_code}.pdf`);
    } catch {
      notify({
        title: 'PDF export failed',
        description: 'Could not generate the receipt PDF. Please try printing instead.',
        variant: 'error',
      });
    } finally {
      setDownloading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl);
      setCopied(true);
      notify({ title: 'Public link copied', variant: 'success' });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      notify({ title: 'Copy failed', description: publicUrl, variant: 'error' });
    }
  };

  const handleWebShare = async () => {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `Receipt ${data.receipt.receipt_code} — ${data.business.name}`,
          text: whatsappMsg,
          url: publicUrl,
        });
        return;
      } catch {
        // User cancelled or fallback to copy
      }
    }
    await handleCopy();
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="no-print flex flex-wrap items-center gap-2.5">
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl bg-[#0F5132] text-white text-sm font-medium hover:bg-[#0B3E26] transition-colors whitespace-nowrap shrink-0"
      >
        <MessageCircle className="w-4 h-4" />
        <span>Share on WhatsApp</span>
      </a>

      <button
        type="button"
        onClick={handleDownloadPdf}
        disabled={downloading}
        className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] text-sm font-medium text-[#141413] dark:text-[#F4F1EA] hover:bg-[#F3EFE4] dark:hover:bg-[#202420] disabled:opacity-60 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Download className="w-4 h-4" />
        <span>{downloading ? 'Preparing PDF…' : 'Download PDF'}</span>
      </button>

      <button
        type="button"
        onClick={handlePrint}
        className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] text-sm font-medium text-[#141413] dark:text-[#F4F1EA] hover:bg-[#F3EFE4] dark:hover:bg-[#202420] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Printer className="w-4 h-4" />
        <span>Print</span>
      </button>

      <button
        type="button"
        onClick={handleWebShare}
        className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] text-sm font-medium text-[#141413] dark:text-[#F4F1EA] hover:bg-[#F3EFE4] dark:hover:bg-[#202420] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        <Share2 className="w-4 h-4" />
        <span>Share</span>
      </button>

      <button
        type="button"
        onClick={handleCopy}
        className="inline-flex items-center justify-center gap-2 min-h-[44px] px-3.5 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] text-sm font-medium text-[#57534E] dark:text-[#A8A29E] hover:text-[#141413] dark:hover:text-[#F4F1EA] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
      >
        {copied ? <Check className="w-4 h-4 text-[#0F5132]" /> : <Copy className="w-4 h-4" />}
        <span>{copied ? 'Copied' : 'Copy Link'}</span>
      </button>
    </div>
  );
}
