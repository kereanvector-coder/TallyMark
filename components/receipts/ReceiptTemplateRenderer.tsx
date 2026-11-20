'use client';

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { PublicReceiptResponse, ReceiptTemplateStyle } from '@/lib/database.types';
import {
  amountInWordsNGN,
  formatLagosDateTime,
  formatNaira,
  formatPaymentMethod,
  getPublicReceiptUrl,
} from '@/lib/format';
import { TallyMarkGlyph } from '@/components/brand/TallyMarkLogo';

function ReceiptStamp({
  label,
  tone,
  brandColor,
  compact = false,
}: {
  label: 'PAID' | 'PART PAID' | 'VOID';
  tone: 'emerald' | 'amber' | 'crimson';
  brandColor: string;
  compact?: boolean;
}) {
  const colorStyle =
    tone === 'crimson'
      ? { color: '#B91C1C', borderColor: '#B91C1C' }
      : tone === 'amber'
        ? { color: '#B45309', borderColor: '#B45309' }
        : { color: brandColor, borderColor: brandColor };

  return (
    <div
      style={colorStyle}
      className={`inline-flex items-center gap-2 border-2 rounded-md -rotate-3 select-none font-mono-ledger font-semibold tracking-widest uppercase ${
        compact ? 'px-2.5 py-1 text-[11px]' : 'px-4 py-1.5 text-sm'
      }`}
    >
      <TallyMarkGlyph
        className={compact ? 'w-3 h-3' : 'w-4 h-4'}
        color={colorStyle.color}
      />
      <span>{label}</span>
    </div>
  );
}

export function ReceiptTemplateRenderer({
  data,
  template,
  logoUrl,
  publicUrl,
}: {
  data: PublicReceiptResponse;
  template?: ReceiptTemplateStyle;
  logoUrl?: string | null;
  publicUrl?: string;
}) {
  const { receipt, business } = data;
  const activeTemplate = template || business.receipt_template || 'classic';
  const brandColor = /^#[0-9A-Fa-f]{6}$/.test(business.brand_color)
    ? business.brand_color
    : '#0F5132';
  const resolvedUrl = publicUrl || getPublicReceiptUrl(receipt.public_id);
  const [qrSrc, setQrSrc] = useState<string>('');

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(resolvedUrl, {
      width: 180,
      margin: 1,
      color: { dark: '#141413', light: '#FFFFFF' },
    })
      .then((url) => {
        if (active) setQrSrc(url);
      })
      .catch(() => {
        if (active) setQrSrc('');
      });
    return () => {
      active = false;
    };
  }, [resolvedUrl]);

  const isVoid = receipt.status === 'void';
  const currentBalance =
    typeof receipt.outstanding_balance_kobo === 'number'
      ? receipt.outstanding_balance_kobo
      : receipt.balance_due_kobo;
  const isPartPaid = !isVoid && currentBalance > 0;
  const stampLabel: 'PAID' | 'PART PAID' | 'VOID' = isVoid
    ? 'VOID'
    : isPartPaid
      ? 'PART PAID'
      : 'PAID';
  const stampTone = isVoid ? 'crimson' : isPartPaid ? 'amber' : 'emerald';

  if (activeTemplate === 'thermal') {
    return (
      <article className="print-only-container print-thermal mx-auto w-full max-w-[340px] thermal-paper-bg text-[#141413] border border-[#E5DFD2] shadow-sm rounded-sm overflow-hidden">
        <div className="p-5 font-mono-ledger text-[13px] leading-snug">
          <div className="text-center space-y-1">
            {logoUrl && (
              <div className="flex justify-center mb-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoUrl}
                  alt={business.name}
                  referrerPolicy="no-referrer"
                  className="h-10 w-auto object-contain"
                />
              </div>
            )}
            <h2 className="font-sans-ui text-base font-bold tracking-tight text-[#141413]">
              {business.name}
            </h2>
            {business.address && (
              <p className="font-sans-ui text-[11px] text-[#57534E]">{business.address}</p>
            )}
            {(business.phone || business.email) && (
              <p className="text-[11px] text-[#57534E]">
                {[business.phone, business.email].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>

          <div className="my-3.5 border-t border-dashed border-[#A8A29E]" />

          <div className="space-y-1 text-[12px]">
            <div className="flex items-center justify-between gap-2">
              <span className="uppercase text-[10px] tracking-wider text-[#57534E]">
                {receipt.receipt_kind === 'balance_payment' ? 'Balance Receipt' : 'Receipt'}
              </span>
              <span className="font-semibold" style={{ color: brandColor }}>
                {receipt.receipt_code}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[11px] text-[#57534E]">
              <span>Date</span>
              <span>{formatLagosDateTime(receipt.issued_at)}</span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[#57534E]">Customer</span>
              <span className="font-sans-ui font-medium text-right">{receipt.customer_name}</span>
            </div>
            {receipt.sold_by && (
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-[#57534E]">Sold by</span>
                <span className="font-sans-ui">{receipt.sold_by}</span>
              </div>
            )}
            {receipt.parent_receipt_code && (
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-[#57534E]">For Receipt</span>
                <span>{receipt.parent_receipt_code}</span>
              </div>
            )}
          </div>

          <div className="my-3.5 border-t border-dashed border-[#A8A29E]" />

          <div className="space-y-2.5">
            {receipt.line_items.map((item, idx) => (
              <div key={`${item.description}-${idx}`} className="space-y-0.5">
                <p className="font-sans-ui font-medium text-[#141413] text-[13px]">
                  {item.description}
                </p>
                <div className="flex items-center justify-between text-[12px] text-[#57534E]">
                  <span>
                    {item.quantity} {item.unit} × {formatNaira(item.unit_price_kobo)}
                  </span>
                  <span className="font-medium text-[#141413]">
                    {formatNaira(item.line_total_kobo)}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="my-3.5 border-t border-dashed border-[#A8A29E]" />

          <div className="space-y-1.5 text-[12px]">
            {receipt.discount_kobo > 0 && (
              <div className="flex justify-between text-[#57534E]">
                <span>Discount</span>
                <span>-{formatNaira(receipt.discount_kobo)}</span>
              </div>
            )}
            {receipt.tax_kobo > 0 && (
              <div className="flex justify-between text-[#57534E]">
                <span>VAT (7.5%)</span>
                <span>{formatNaira(receipt.tax_kobo)}</span>
              </div>
            )}
            <div className="flex justify-between text-[14px] font-semibold text-[#141413] pt-1">
              <span>TOTAL</span>
              <span>{formatNaira(receipt.total_kobo)}</span>
            </div>
            <div className="flex justify-between text-[#57534E]">
              <span>Paid ({formatPaymentMethod(receipt.payment_method)})</span>
              <span className="text-[#141413]">{formatNaira(receipt.amount_paid_kobo)}</span>
            </div>
            {receipt.balance_due_kobo > 0 && (
              <div className="flex justify-between font-semibold text-amber-800">
                <span>Balance at issue</span>
                <span>{formatNaira(receipt.balance_due_kobo)}</span>
              </div>
            )}
            {typeof receipt.outstanding_balance_kobo === 'number' &&
              receipt.receipt_kind === 'sale' &&
              receipt.balance_due_kobo > 0 &&
              receipt.outstanding_balance_kobo !== receipt.balance_due_kobo && (
                <div className="flex justify-between font-semibold" style={{ color: brandColor }}>
                  <span>Current balance</span>
                  <span>{formatNaira(receipt.outstanding_balance_kobo)}</span>
                </div>
              )}
          </div>

          <p className="mt-3 font-sans-ui text-[11px] leading-relaxed text-[#57534E]">
            {amountInWordsNGN(receipt.total_kobo)}
          </p>

          {receipt.notes && (
            <p className="mt-2 font-sans-ui text-[11px] text-[#57534E]">Note: {receipt.notes}</p>
          )}

          {isVoid && receipt.void_reason && (
            <div className="mt-3 border border-red-300 bg-red-50 p-2 rounded text-[11px] font-sans-ui text-red-900">
              <strong>VOID:</strong> {receipt.void_reason}
            </div>
          )}

          <div className="my-4 flex justify-center">
            <ReceiptStamp
              label={stampLabel}
              tone={stampTone}
              brandColor={brandColor}
              compact
            />
          </div>

          {qrSrc && (
            <div className="flex flex-col items-center gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={qrSrc} alt="Receipt verification QR code" className="w-20 h-20" />
              <span className="text-[10px] text-[#57534E]">Scan to verify receipt</span>
            </div>
          )}

          {business.receipt_footer_note && (
            <p className="mt-3 text-center font-sans-ui text-[11px] text-[#57534E]">
              {business.receipt_footer_note}
            </p>
          )}

          <div className="mt-4 pt-3 border-t border-dashed border-[#A8A29E] flex items-center justify-center gap-1.5 font-sans-ui text-[11px] text-[#57534E]">
            <TallyMarkGlyph className="w-3.5 h-3.5" color={brandColor} />
            <span>Tallymark Verified</span>
          </div>
        </div>
        <div className="h-2 receipt-perforated-edge" />
      </article>
    );
  }

  const isClassic = activeTemplate === 'classic';

  return (
    <article
      className={`print-only-container mx-auto w-full max-w-[740px] rounded-xl border overflow-hidden shadow-sm text-[#141413] ${
        isClassic
          ? 'bg-[#FAF7F0] border-[#D9CFBA]'
          : 'bg-white border-[#E5DFD2]'
      }`}
    >
      {!isClassic && <div className="h-2.5 w-full" style={{ backgroundColor: brandColor }} />}
      {isClassic && (
        <div className="h-1.5 w-full bg-[#B4924A]/45" />
      )}

      <div className="p-6 sm:p-10 space-y-7">
        {/* Header */}
        <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-6 pb-6 border-b border-[#E5DFD2]">
          <div className="flex items-start gap-4">
            {logoUrl && (
              <div className="w-14 h-14 rounded-lg border border-[#E5DFD2] bg-white p-1.5 flex items-center justify-center shrink-0 overflow-hidden">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={logoUrl}
                  alt={business.name}
                  referrerPolicy="no-referrer"
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            )}
            <div className="space-y-1">
              <h2
                className={
                  isClassic
                    ? 'font-display text-3xl sm:text-4xl text-[#141413] leading-none'
                    : 'font-sans-ui text-xl sm:text-2xl font-bold tracking-tight text-[#141413]'
                }
              >
                {business.name}
              </h2>
              {business.address && (
                <p className="text-xs sm:text-sm text-[#57534E] max-w-sm leading-relaxed">
                  {business.address}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#57534E]">
                {business.phone && <span>{business.phone}</span>}
                {business.phone && business.email && <span aria-hidden="true">·</span>}
                {business.email && <span>{business.email}</span>}
                {(business.rc_number || business.tax_id) && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono-ledger text-[11px]">
                      {[
                        business.rc_number ? `RC ${business.rc_number}` : null,
                        business.tax_id ? `TIN ${business.tax_id}` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="sm:text-right space-y-1 shrink-0">
            <p
              className="font-mono-ledger text-[11px] font-semibold uppercase tracking-[0.12em]"
              style={{ color: brandColor }}
            >
              {receipt.receipt_kind === 'balance_payment' ? 'Balance Receipt' : 'Official Receipt'}
            </p>
            <p className="font-mono-ledger text-xl sm:text-2xl font-semibold text-[#141413]">
              {receipt.receipt_code}
            </p>
            <p className="font-mono-ledger text-xs text-[#57534E]">
              {formatLagosDateTime(receipt.issued_at)}
            </p>
          </div>
        </header>

        {/* Customer / Payment Metadata */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-[#57534E]">
              Issued To
            </p>
            <p className="mt-1 font-semibold text-[#141413]">{receipt.customer_name}</p>
            {receipt.parent_receipt_code && (
              <p className="mt-0.5 font-mono-ledger text-xs" style={{ color: brandColor }}>
                For receipt {receipt.parent_receipt_code}
              </p>
            )}
          </div>

          <div>
            <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-[#57534E]">
              Payment Method
            </p>
            <p className="mt-1 font-medium text-[#141413]">
              {formatPaymentMethod(receipt.payment_method)}
            </p>
          </div>

          {receipt.sold_by && (
            <div className="sm:text-right">
              <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-[#57534E]">
                Sold By
              </p>
              <p className="mt-1 font-medium text-[#141413]">{receipt.sold_by}</p>
            </div>
          )}
        </section>

        {/* Line Items Table */}
        <section className="overflow-x-auto">
          <table
            className={`w-full border-collapse text-left ${
              isClassic ? 'border border-[#D9CFBA]' : ''
            }`}
          >
            <thead>
              <tr
                className={
                  isClassic
                    ? 'bg-[#EFE9DA] border-b border-[#D9CFBA]'
                    : 'bg-[#F6F5F0] border-y border-[#E5DFD2]'
                }
              >
                <th className="py-2.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#57534E]">
                  Item Description
                </th>
                <th className="py-2.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#57534E] text-right">
                  Qty
                </th>
                <th className="py-2.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#57534E] text-right">
                  Unit Price
                </th>
                <th className="py-2.5 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#57534E] text-right">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E5DFD2]">
              {receipt.line_items.map((item, idx) => (
                <tr key={`${item.description}-${idx}`}>
                  <td className="py-3 px-3 text-sm font-medium text-[#141413]">
                    {item.description}
                  </td>
                  <td className="py-3 px-3 font-mono-ledger text-[13px] text-[#57534E] text-right whitespace-nowrap">
                    {item.quantity} {item.unit}
                  </td>
                  <td className="py-3 px-3 font-mono-ledger text-[13px] text-[#57534E] text-right whitespace-nowrap">
                    {formatNaira(item.unit_price_kobo)}
                  </td>
                  <td className="py-3 px-3 font-mono-ledger text-[13px] font-semibold text-[#141413] text-right whitespace-nowrap">
                    {formatNaira(item.line_total_kobo)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Summary & Stamp */}
        <section className="flex flex-col-reverse sm:flex-row sm:items-start justify-between gap-6 pt-2">
          <div className="space-y-4 max-w-sm">
            <div>
              <ReceiptStamp
                label={stampLabel}
                tone={stampTone}
                brandColor={brandColor}
              />
            </div>

            <div>
              <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-[#57534E]">
                Amount in Words
              </p>
              <p className="mt-1 text-xs sm:text-sm text-[#141413] leading-relaxed">
                {amountInWordsNGN(receipt.total_kobo)}
              </p>
            </div>

            {receipt.notes && (
              <div>
                <p className="text-[11px] uppercase tracking-[0.08em] font-medium text-[#57534E]">
                  Notes
                </p>
                <p className="mt-1 text-xs text-[#57534E] leading-relaxed">{receipt.notes}</p>
              </div>
            )}

            {isVoid && receipt.void_reason && (
              <div className="rounded-lg border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs text-red-900">
                <p className="font-semibold">Void Reason</p>
                <p className="mt-0.5">{receipt.void_reason}</p>
              </div>
            )}
          </div>

          <div className="w-full sm:w-64 space-y-2 text-sm shrink-0">
            <div className="flex justify-between text-[#57534E]">
              <span>Subtotal</span>
              <span className="font-mono-ledger text-[13px] text-[#141413]">
                {formatNaira(receipt.subtotal_kobo)}
              </span>
            </div>
            {receipt.discount_kobo > 0 && (
              <div className="flex justify-between text-[#57534E]">
                <span>Discount</span>
                <span className="font-mono-ledger text-[13px]">
                  -{formatNaira(receipt.discount_kobo)}
                </span>
              </div>
            )}
            {receipt.tax_kobo > 0 && (
              <div className="flex justify-between text-[#57534E]">
                <span>VAT (7.5%)</span>
                <span className="font-mono-ledger text-[13px] text-[#141413]">
                  {formatNaira(receipt.tax_kobo)}
                </span>
              </div>
            )}
            <div className="pt-2 border-t border-[#E5DFD2] flex justify-between items-baseline">
              <span className="font-semibold text-[#141413]">Total</span>
              <span className="font-mono-ledger text-lg font-semibold text-[#141413]">
                {formatNaira(receipt.total_kobo)}
              </span>
            </div>
            <div className="flex justify-between text-[#57534E]">
              <span>Paid at issue</span>
              <span
                className="font-mono-ledger text-[13px] font-semibold"
                style={{ color: brandColor }}
              >
                {formatNaira(receipt.amount_paid_kobo)}
              </span>
            </div>
            {receipt.balance_due_kobo > 0 && (
              <div className="flex justify-between font-semibold text-amber-800">
                <span>Balance at issue</span>
                <span className="font-mono-ledger text-[13px]">
                  {formatNaira(receipt.balance_due_kobo)}
                </span>
              </div>
            )}
            {typeof receipt.outstanding_balance_kobo === 'number' &&
              receipt.receipt_kind === 'sale' &&
              receipt.balance_due_kobo > 0 &&
              receipt.outstanding_balance_kobo !== receipt.balance_due_kobo && (
                <div
                  className="flex justify-between font-semibold pt-1 border-t border-dashed border-[#E5DFD2]"
                  style={{ color: brandColor }}
                >
                  <span>Current balance</span>
                  <span className="font-mono-ledger text-[13px]">
                    {formatNaira(receipt.outstanding_balance_kobo)}
                  </span>
                </div>
              )}
          </div>
        </section>

        {/* Footer with QR & Tallymark signature */}
        <footer className="pt-6 border-t border-[#E5DFD2] flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-2">
            {business.receipt_footer_note && (
              <p className="text-xs text-[#141413]">{business.receipt_footer_note}</p>
            )}
            <div className="flex items-center gap-2 text-xs text-[#57534E]">
              <TallyMarkGlyph className="w-4 h-4" color={brandColor} />
              <span>Issued &amp; verified with Tallymark</span>
            </div>
            <p className="font-mono-ledger text-[11px] text-[#57534E] break-all">
              {resolvedUrl}
            </p>
          </div>

          {qrSrc && (
            <div className="flex items-center gap-3 shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrSrc}
                alt="QR code to verify receipt"
                className="w-16 h-16 rounded border border-[#E5DFD2] bg-white p-0.5"
              />
            </div>
          )}
        </footer>
      </div>
    </article>
  );
}
