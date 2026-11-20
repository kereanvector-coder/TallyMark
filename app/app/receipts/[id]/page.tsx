'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Ban, CopyPlus, Wallet } from 'lucide-react';
import type {
  Debt,
  PublicReceiptResponse,
  Receipt,
  ReceiptTemplateStyle,
} from '@/lib/database.types';
import { useAppContext } from '@/components/providers/AppProviders';
import { useBusiness } from '@/components/app/AppShell';
import { formatLagosDateTime, formatNaira } from '@/lib/format';
import { ReceiptTemplateRenderer } from '@/components/receipts/ReceiptTemplateRenderer';
import { ReceiptShareActions } from '@/components/receipts/ReceiptShareActions';
import {
  ReceiveBalanceModal,
  VoidReceiptModal,
} from '@/components/receipts/ReceiptActionModals';

function ReceiptDetailContent() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const justIssued = searchParams.get('issued') === '1';

  const { supabase } = useAppContext();
  const { business, logoUrl } = useBusiness();

  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [debt, setDebt] = useState<Debt | null>(null);
  const [parentReceipt, setParentReceipt] = useState<Receipt | null>(null);
  const [childReceipts, setChildReceipts] = useState<Receipt[]>([]);
  const [templateOverride, setTemplateOverride] = useState<ReceiptTemplateStyle | null>(null);
  const template: ReceiptTemplateStyle = templateOverride ?? business?.receipt_template ?? 'classic';
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);

  const reloadData = useCallback(() => {
    setLoading(true);
    setErrorMsg(null);
    setRefreshNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!supabase || !id) return;
    let active = true;
    (async () => {
      try {
        const { data: rec, error } = await supabase
          .from('receipts')
          .select('*')
          .eq('id', id)
          .maybeSingle();

        if (!active) return;
        if (error) throw new Error(error.message);
        if (!rec) {
          setReceipt(null);
          setLoading(false);
          return;
        }

        setReceipt(rec);

        const [debtRes, childrenRes, parentRes] = await Promise.all([
          supabase.from('debts').select('*').eq('receipt_id', rec.id).maybeSingle(),
          supabase
            .from('receipts')
            .select('*')
            .eq('parent_receipt_id', rec.id)
            .order('issued_at', { ascending: true }),
          rec.parent_receipt_id
            ? supabase
                .from('receipts')
                .select('*')
                .eq('id', rec.parent_receipt_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
        ]);

        if (!active) return;
        setDebt(debtRes.data ?? null);
        setChildReceipts(childrenRes.data ?? []);
        setParentReceipt(parentRes.data ?? null);
      } catch (err) {
        if (!active) return;
        setErrorMsg(err instanceof Error ? err.message : 'Could not load receipt.');
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => {
      active = false;
    };
  }, [supabase, id, refreshNonce]);

  const outstandingBalance = useMemo(() => {
    if (!receipt || receipt.status === 'void') return 0;
    if (debt) return debt.balance_kobo;
    return receipt.balance_due_kobo;
  }, [receipt, debt]);

  const renderData: PublicReceiptResponse | null = useMemo(() => {
    if (!receipt || !business) return null;
    return {
      receipt: {
        public_id: receipt.public_id,
        receipt_code: receipt.receipt_code,
        receipt_number: receipt.receipt_number,
        receipt_kind: receipt.receipt_kind,
        parent_receipt_code: parentReceipt?.receipt_code || null,
        parent_public_id: parentReceipt?.public_id || null,
        customer_name: receipt.customer_name,
        line_items: receipt.line_items,
        subtotal_kobo: receipt.subtotal_kobo,
        discount_kobo: receipt.discount_kobo,
        tax_kobo: receipt.tax_kobo,
        total_kobo: receipt.total_kobo,
        amount_paid_kobo: receipt.amount_paid_kobo,
        balance_due_kobo: receipt.balance_due_kobo,
        outstanding_balance_kobo: outstandingBalance,
        payment_method: receipt.payment_method,
        status: receipt.status,
        void_reason: receipt.void_reason,
        voided_at: receipt.voided_at,
        notes: receipt.notes,
        sold_by: receipt.sold_by,
        issued_at: receipt.issued_at,
        entry_date: receipt.entry_date,
      },
      business: {
        name: business.name,
        phone: business.phone,
        email: business.email,
        address: business.address,
        rc_number: business.rc_number,
        tax_id: business.tax_id,
        logo_path: business.logo_path,
        brand_color: business.brand_color,
        receipt_template: template,
        receipt_footer_note: business.receipt_footer_note,
        currency: business.currency,
        vat_enabled: business.vat_enabled,
      },
    };
  }, [receipt, business, parentReceipt, outstandingBalance, template]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-10 w-48 rounded-xl bg-[#E5DFD2]/60 dark:bg-[#2A2E2A] animate-pulse" />
        <div className="h-96 rounded-2xl bg-[#E5DFD2]/50 dark:bg-[#2A2E2A]/60 animate-pulse" />
      </div>
    );
  }

  if (errorMsg) {
    return (
      <div className="rounded-2xl border border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/40 p-6 text-sm text-red-900 dark:text-red-200">
        {errorMsg}
      </div>
    );
  }

  if (!receipt || !renderData) {
    return (
      <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-8 text-center space-y-3">
        <h1 className="font-display text-3xl">Receipt not found</h1>
        <Link
          href="/app/receipts"
          className="inline-flex items-center justify-center min-h-[44px] px-5 rounded-xl bg-[#0F5132] text-white text-sm font-medium"
        >
          Back to Receipts
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Controls */}
      <div className="no-print flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link
            href="/app/receipts"
            className="inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] hover:bg-[#FAF7F0] dark:hover:bg-[#202420]"
            aria-label="Back to receipts"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <p className="text-xs text-[#57534E] dark:text-[#A8A29E]">
              {justIssued ? 'Issued just now · Ready to share' : 'Receipt Record'}
            </p>
            <h1 className="font-mono-ledger text-xl sm:text-2xl font-semibold">
              {receipt.receipt_code}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {receipt.status === 'issued' && outstandingBalance > 0 && (
            <button
              type="button"
              onClick={() => setShowReceiveModal(true)}
              className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-semibold cursor-pointer"
            >
              <Wallet className="w-4 h-4" />
              <span>Receive Balance ({formatNaira(outstandingBalance)})</span>
            </button>
          )}

          <Link
            href={`/app/receipts/new?duplicate=${receipt.id}`}
            className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] text-xs sm:text-sm font-medium hover:bg-[#FAF7F0] dark:hover:bg-[#202420]"
          >
            <CopyPlus className="w-4 h-4" />
            <span>Duplicate</span>
          </Link>

          {receipt.status === 'issued' && (
            <button
              type="button"
              onClick={() => setShowVoidModal(true)}
              className="inline-flex items-center gap-2 min-h-[44px] px-4 rounded-xl border border-red-300 dark:border-red-900/60 text-red-700 dark:text-red-400 text-xs sm:text-sm font-medium hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
            >
              <Ban className="w-4 h-4" />
              <span>Void</span>
            </button>
          )}
        </div>
      </div>

      {/* Template Switcher + Share Actions */}
      <div className="no-print rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-4 sm:p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-[#57534E] dark:text-[#A8A29E]">
            <span>{receipt.customer_name}</span>
            <span aria-hidden="true" className="mx-2">·</span>
            <span className="font-mono-ledger">{formatLagosDateTime(receipt.issued_at)}</span>
            {parentReceipt && (
              <>
                <span aria-hidden="true" className="mx-2">·</span>
                <Link
                  href={`/app/receipts/${parentReceipt.id}`}
                  className="underline text-[#0F5132] dark:text-[#7CE0AC]"
                >
                  Parent: {parentReceipt.receipt_code}
                </Link>
              </>
            )}
          </div>

          <div className="inline-flex items-center gap-1 p-1 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#202420]">
            {(['classic', 'modern', 'thermal'] as ReceiptTemplateStyle[]).map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => setTemplateOverride(style)}
                className={`min-h-[36px] px-3 rounded-lg text-xs font-medium capitalize cursor-pointer ${
                  template === style
                    ? 'bg-white dark:bg-[#181B18] text-[#141413] dark:text-[#F4F1EA] shadow-sm'
                    : 'text-[#57534E] dark:text-[#A8A29E]'
                }`}
              >
                {style === 'thermal' ? '80mm Thermal' : style}
              </button>
            ))}
          </div>
        </div>

        <ReceiptShareActions
          data={renderData}
          template={template}
          logoUrl={logoUrl}
          customerPhone={receipt.customer_phone}
        />
      </div>

      {/* Linked Balance Payments */}
      {childReceipts.length > 0 && (
        <section className="no-print rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-4 sm:p-5 space-y-3">
          <h2 className="text-sm font-semibold">Linked Balance Payment Receipts</h2>
          <div className="divide-y divide-[#E5DFD2] dark:divide-[#2A2E2A]">
            {childReceipts.map((cr) => (
              <Link
                key={cr.id}
                href={`/app/receipts/${cr.id}`}
                className="flex items-center justify-between py-2.5 text-sm hover:opacity-80"
              >
                <div>
                  <span className="font-mono-ledger font-semibold text-[#0F5132] dark:text-[#7CE0AC]">
                    {cr.receipt_code}
                  </span>
                  <span className="mx-2 text-[#57534E]">·</span>
                  <span className="text-xs text-[#57534E] dark:text-[#A8A29E]">
                    {formatLagosDateTime(cr.issued_at)}
                  </span>
                </div>
                <span className="font-mono-ledger font-semibold">
                  {formatNaira(cr.amount_paid_kobo)}
                </span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Rendered Receipt */}
      <ReceiptTemplateRenderer data={renderData} template={template} logoUrl={logoUrl} />

      {showReceiveModal && (
        <ReceiveBalanceModal
          receipt={receipt}
          outstandingKobo={outstandingBalance}
          onClose={() => setShowReceiveModal(false)}
          onSuccess={(newRec) => {
            setShowReceiveModal(false);
            router.push(`/app/receipts/${newRec.id}?issued=1`);
          }}
        />
      )}

      {showVoidModal && (
        <VoidReceiptModal
          receipt={receipt}
          onClose={() => setShowVoidModal(false)}
          onSuccess={() => {
            setShowVoidModal(false);
            reloadData();
          }}
        />
      )}
    </div>
  );
}

export default function ReceiptDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <div className="h-10 w-48 rounded-xl bg-[#E5DFD2]/60 dark:bg-[#2A2E2A] animate-pulse" />
          <div className="h-96 rounded-2xl bg-[#E5DFD2]/50 dark:bg-[#2A2E2A]/60 animate-pulse" />
        </div>
      }
    >
      <ReceiptDetailContent />
    </Suspense>
  );
}
