'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import { motion, useReducedMotion } from 'motion/react';
import QRCode from 'qrcode';
import { Ban, QrCode, RotateCw, ShieldCheck } from 'lucide-react';
import { trackPublicEvent } from '@/lib/analytics-client';

const SAMPLE_VERIFY_URL = 'https://tallymark.ng/r/specimen-rct-00148';

export function ClickToVerifyQrSection() {
  const prefersReducedMotion = useReducedMotion();
  const [flipped, setFlipped] = useState(false);
  const [simulatedStatus, setSimulatedStatus] = useState<'valid' | 'void'>('valid');
  const [qrSrc, setQrSrc] = useState('');

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(SAMPLE_VERIFY_URL, {
      width: 176,
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
  }, []);

  const handleFlip = () => {
    setFlipped((prev) => !prev);
    trackPublicEvent('qr_verify_flipped');
  };

  const handleStatusToggle = (nextStatus: 'valid' | 'void') => {
    setSimulatedStatus(nextStatus);
    trackPublicEvent('qr_verify_status_toggled');
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#57534E] dark:text-[#A8A29E]">
        <span>Sample verification specimen · Interactive</span>
        <button
          type="button"
          onClick={handleFlip}
          className="inline-flex items-center gap-1.5 min-h-[38px] px-3 rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] font-medium text-[#141413] dark:text-[#F4F1EA] hover:border-[#0F5132] transition-colors cursor-pointer"
        >
          <RotateCw className="w-3.5 h-3.5 text-[#0F5132] dark:text-[#2D8A5E]" />
          <span>{flipped ? 'Flip back to receipt' : 'Click QR to verify'}</span>
        </button>
      </div>

      {/* Flip Stage */}
      {prefersReducedMotion ? (
        <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] overflow-hidden shadow-sm">
          {!flipped ? (
            <ReceiptFrontCard qrSrc={qrSrc} onFlip={handleFlip} />
          ) : (
            <VerificationBackCard
              status={simulatedStatus}
              onStatusChange={handleStatusToggle}
              onFlip={handleFlip}
            />
          )}
        </div>
      ) : (
        <div className="perspective-1000">
          <motion.div
            animate={{ rotateY: flipped ? 180 : 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
            className="relative transform-style-3d min-h-[380px]"
          >
            <div
              className={`backface-hidden rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] shadow-sm overflow-hidden ${
                flipped ? 'pointer-events-none' : ''
              }`}
              aria-hidden={flipped}
            >
              <ReceiptFrontCard qrSrc={qrSrc} onFlip={handleFlip} />
            </div>

            <div
              className={`absolute inset-0 backface-hidden rotate-y-180 rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] shadow-sm overflow-hidden ${
                flipped ? '' : 'pointer-events-none'
              }`}
              aria-hidden={!flipped}
            >
              <VerificationBackCard
                status={simulatedStatus}
                onStatusChange={handleStatusToggle}
                onFlip={handleFlip}
              />
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}

function ReceiptFrontCard({
  qrSrc,
  onFlip,
}: {
  qrSrc: string;
  onFlip: () => void;
}) {
  return (
    <div className="p-5 sm:p-7 space-y-5 text-[#141413] dark:text-[#F4F1EA]">
      <div className="flex items-start justify-between gap-4 pb-4 border-b border-[#E5DFD2] dark:border-[#2A2E2A]">
        <div>
          <p className="text-[11px] uppercase tracking-[0.1em] font-mono-ledger text-[#0F5132] dark:text-[#2D8A5E] font-semibold">
            Issued Receipt
          </p>
          <p className="font-display text-2xl mt-0.5">Balogun Fine Textiles</p>
          <p className="text-xs text-[#57534E] dark:text-[#A8A29E]">
            Chidi Okafor Enterprises · 19 Nov 2026
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono-ledger text-xs text-[#57534E] dark:text-[#A8A29E]">Number</p>
          <p className="font-mono-ledger text-base font-semibold">RCT-00148</p>
        </div>
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <span>3× Super Wax Print (6 yds)</span>
          <span className="font-mono-ledger font-semibold tabular-figures">₦55,500.00</span>
        </div>
        <div className="flex justify-between gap-3">
          <span>1× Tailoring &amp; Packaging</span>
          <span className="font-mono-ledger font-semibold tabular-figures">₦4,500.00</span>
        </div>
        <div className="pt-2.5 border-t border-dashed border-[#E5DFD2] dark:border-[#2A2E2A] flex justify-between font-semibold">
          <span>Total Paid (Bank Transfer)</span>
          <span className="font-mono-ledger text-lg tabular-figures text-[#0F5132] dark:text-[#7CE0AC]">
            ₦60,000.00
          </span>
        </div>
      </div>

      <div className="pt-3 border-t border-[#E5DFD2] dark:border-[#2A2E2A] flex items-center justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs font-semibold">Scan or tap the QR code</p>
          <p className="text-xs text-[#57534E] dark:text-[#A8A29E] leading-relaxed">
            Checks the live public verification record at <span className="font-mono-ledger">/r/…</span>
          </p>
        </div>

        <button
          type="button"
          onClick={onFlip}
          data-cursor="Verify"
          aria-label="Click QR code to preview live receipt verification"
          className="shrink-0 group relative p-2 rounded-xl border-2 border-[#0F5132]/30 hover:border-[#0F5132] bg-white transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0F5132]"
        >
          {qrSrc ? (
            <Image
              src={qrSrc}
              alt="Sample Tallymark QR verification code"
              width={84}
              height={84}
              referrerPolicy="no-referrer"
              className="w-[84px] h-[84px] block"
            />
          ) : (
            <div className="w-[84px] h-[84px] flex items-center justify-center text-[#57534E]">
              <QrCode className="w-8 h-8" />
            </div>
          )}
          <span className="block text-[10px] font-mono-ledger font-semibold text-[#0F5132] mt-1 text-center">
            Tap to verify
          </span>
        </button>
      </div>
    </div>
  );
}

function VerificationBackCard({
  status,
  onStatusChange,
  onFlip,
}: {
  status: 'valid' | 'void';
  onStatusChange: (next: 'valid' | 'void') => void;
  onFlip: () => void;
}) {
  const isValid = status === 'valid';

  return (
    <div className="p-5 sm:p-7 h-full flex flex-col justify-between space-y-5 text-[#141413] dark:text-[#F4F1EA]">
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-mono-ledger text-[11px] uppercase tracking-wider text-[#57534E] dark:text-[#A8A29E]">
            Public page · /r/specimen
          </span>

          <div
            role="group"
            aria-label="Preview receipt verification status"
            className="inline-flex items-center gap-1 p-1 rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210]"
          >
            <button
              type="button"
              onClick={() => onStatusChange('valid')}
              className={`min-h-[30px] px-2.5 rounded-md text-[11px] font-mono-ledger font-semibold cursor-pointer ${
                isValid
                  ? 'bg-[#0F5132] text-white'
                  : 'text-[#57534E] dark:text-[#A8A29E]'
              }`}
            >
              Valid
            </button>
            <button
              type="button"
              onClick={() => onStatusChange('void')}
              className={`min-h-[30px] px-2.5 rounded-md text-[11px] font-mono-ledger font-semibold cursor-pointer ${
                !isValid
                  ? 'bg-red-700 text-white'
                  : 'text-[#57534E] dark:text-[#A8A29E]'
              }`}
            >
              Voided
            </button>
          </div>
        </div>

        <div
          className={`rounded-xl border p-4 flex items-start gap-3 ${
            isValid
              ? 'border-[#0F5132]/30 bg-[#0F5132]/5 dark:bg-[#0F5132]/15'
              : 'border-red-300 dark:border-red-900 bg-red-50 dark:bg-red-950/30'
          }`}
        >
          {isValid ? (
            <ShieldCheck className="w-5 h-5 text-[#0F5132] dark:text-[#7CE0AC] shrink-0 mt-0.5" />
          ) : (
            <Ban className="w-5 h-5 text-red-700 dark:text-red-400 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1">
            <p
              className={`font-mono-ledger text-xs font-semibold uppercase tracking-wider ${
                isValid
                  ? 'text-[#0F5132] dark:text-[#7CE0AC]'
                  : 'text-red-700 dark:text-red-400'
              }`}
            >
              {isValid ? 'VALID RECEIPT · RCT-00148' : 'VOIDED RECEIPT · RCT-00148'}
            </p>
            <p className="text-xs leading-relaxed text-[#57534E] dark:text-[#A8A29E]">
              {isValid
                ? 'Issued by Balogun Fine Textiles on 19 Nov 2026 at 10:30 AM WAT for ₦60,000.00. Totals match the business ledger.'
                : 'Voided on 19 Nov 2026 at 10:42 AM WAT. Reason: "Wrong customer quantity entered; re-issued as RCT-00149."'}
            </p>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-3 text-xs pt-1">
          <div className="rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] p-3">
            <dt className="text-[#57534E] dark:text-[#A8A29E]">Sequential Lock</dt>
            <dd className="font-mono-ledger font-semibold mt-0.5">#148 (No gaps)</dd>
          </div>
          <div className="rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] p-3">
            <dt className="text-[#57534E] dark:text-[#A8A29E]">Total on Record</dt>
            <dd
              className={`font-mono-ledger font-semibold mt-0.5 ${
                !isValid ? 'line-through text-[#57534E]' : ''
              }`}
            >
              ₦60,000.00
            </dd>
          </div>
        </dl>
      </div>

      <div className="pt-3 border-t border-[#E5DFD2] dark:border-[#2A2E2A] flex items-center justify-between gap-3">
        <span className="text-[11px] text-[#57534E] dark:text-[#A8A29E]">
          Private notes &amp; phone numbers stay hidden.
        </span>
        <button
          type="button"
          onClick={onFlip}
          className="min-h-[38px] px-3 rounded-lg bg-[#141413] dark:bg-[#F4F1EA] text-white dark:text-[#141413] text-xs font-semibold cursor-pointer shrink-0"
        >
          Back to front
        </button>
      </div>
    </div>
  );
}
