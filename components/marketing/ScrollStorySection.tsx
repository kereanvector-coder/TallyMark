'use client';

import React, { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Check, CheckCheck, Lock, Mic, ShieldCheck } from 'lucide-react';
import { TallyMarkGlyph } from '@/components/brand/TallyMarkLogo';

const STEPS = [
  {
    number: '01',
    title: 'Type or speak the sale',
    summary:
      'Tap saved items, enter a quick counter amount, or press the mic to dictate the sale. Part payments and credit sales land in the right book immediately.',
  },
  {
    number: '02',
    title: 'Share the verified receipt',
    summary:
      'Send a clean WhatsApp message containing an unguessable verification link, or download a crisp Naira PDF and 80mm thermal slip in one tap.',
  },
  {
    number: '03',
    title: 'Close the day and see the summary',
    summary:
      'Count the cash in your drawer at night. Tallymark reconciles cash, bank transfers, POS, expenses, and debts — then seals the day cleanly.',
  },
] as const;

export function ScrollStorySection() {
  const prefersReducedMotion = useReducedMotion();
  const [activeStep, setActiveStep] = useState(0);
  const stepRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    stepRefs.current.forEach((el, idx) => {
      if (!el) return;
      const obs = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              setActiveStep(idx);
            }
          });
        },
        { rootMargin: '-35% 0px -45% 0px', threshold: 0.1 }
      );
      obs.observe(el);
      observers.push(obs);
    });

    return () => {
      observers.forEach((o) => o.disconnect());
    };
  }, []);

  return (
    <section
      id="how-it-works"
      className="mx-auto max-w-6xl px-4 sm:px-6 py-16 sm:py-24 border-t border-[#E5DFD2] dark:border-[#2A2E2A]"
    >
      <div className="max-w-2xl space-y-3 mb-12">
        <p className="text-[12px] uppercase tracking-[0.08em] font-semibold text-[#0F5132] dark:text-[#2D8A5E]">
          How It Works
        </p>
        <h2 className="font-display text-3xl sm:text-5xl leading-tight text-balance">
          Three minutes saved on every sale, zero guesswork at closing time.
        </h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
        {/* Step Narrative Column */}
        <div className="lg:col-span-5 space-y-4">
          {STEPS.map((step, idx) => {
            const active = activeStep === idx;
            return (
              <button
                key={step.number}
                ref={(el) => {
                  stepRefs.current[idx] = el;
                }}
                type="button"
                onClick={() => setActiveStep(idx)}
                className={`w-full text-left rounded-2xl border p-5 sm:p-6 transition-colors cursor-pointer ${
                  active
                    ? 'border-[#0F5132] bg-white dark:bg-[#181B18]'
                    : 'border-[#E5DFD2] dark:border-[#2A2E2A] bg-transparent opacity-75 hover:opacity-100'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className={`font-mono-ledger text-xs font-semibold ${
                      active
                        ? 'text-[#0F5132] dark:text-[#7CE0AC]'
                        : 'text-[#57534E] dark:text-[#A8A29E]'
                    }`}
                  >
                    {step.number}.
                  </span>
                  <h3 className="text-base sm:text-lg font-semibold">{step.title}</h3>
                </div>
                <p className="text-sm leading-relaxed text-[#57534E] dark:text-[#A8A29E]">
                  {step.summary}
                </p>
              </button>
            );
          })}
        </div>

        {/* Sticky Transforming Stage */}
        <div className="lg:col-span-7 lg:sticky lg:top-24">
          <div className="rounded-3xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 sm:p-8 min-h-[420px] flex flex-col justify-between overflow-hidden">
            <div className="flex items-center justify-between text-xs text-[#57534E] dark:text-[#A8A29E] pb-4 border-b border-[#E5DFD2] dark:border-[#2A2E2A]">
              <span className="font-mono-ledger font-semibold uppercase tracking-wider">
                Step {STEPS[activeStep].number} · {STEPS[activeStep].title}
              </span>
              <span className="font-mono-ledger">Sample preview</span>
            </div>

            <div className="py-6 flex-1 flex items-center justify-center">
              {activeStep === 0 && (
                <motion.div
                  key="story-1"
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="w-full max-w-md space-y-4"
                >
                  <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] p-4 space-y-3">
                    <div className="flex items-center justify-between text-xs text-[#57534E] dark:text-[#A8A29E]">
                      <span>Quick entry · Dictation or tap</span>
                      <span className="inline-flex items-center gap-1 font-medium text-[#0F5132] dark:text-[#7CE0AC]">
                        <Mic className="w-3.5 h-3.5" />
                        en-NG
                      </span>
                    </div>
                    <p className="text-sm sm:text-base font-medium">
                      &ldquo;Two crates malt and one bag rice for Mama Tunde — Transfer ₦24,500&rdquo;
                    </p>
                  </div>

                  <div className="rounded-2xl border border-[#0F5132]/30 bg-[#0F5132]/5 dark:bg-[#0F5132]/15 p-4 flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <p className="text-xs font-mono-ledger text-[#0F5132] dark:text-[#7CE0AC] font-semibold">
                        RCT-00149 · LEDGER UPDATED
                      </p>
                      <p className="text-sm font-semibold">Mama Tunde · Bank Transfer</p>
                    </div>
                    <p className="font-mono-ledger text-lg font-semibold tabular-figures text-[#0F5132] dark:text-[#7CE0AC]">
                      ₦24,500.00
                    </p>
                  </div>
                </motion.div>
              )}

              {activeStep === 1 && (
                <motion.div
                  key="story-2"
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="w-full max-w-[320px] rounded-[28px] border-2 border-[#141413] dark:border-[#3A3E3A] bg-[#EFEAE2] dark:bg-[#111915] p-3 shadow-md"
                >
                  {/* Phone Chat Header */}
                  <div className="rounded-t-2xl bg-[#075E54] text-white px-3.5 py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs font-semibold">Mama Tunde</p>
                      <p className="text-[10px] opacity-80">WhatsApp chat</p>
                    </div>
                    <TallyMarkGlyph className="w-4 h-4" color="#FFFFFF" />
                  </div>

                  {/* Animated Link Card & Message */}
                  <div className="p-3 space-y-2.5 min-h-[210px] flex flex-col justify-end">
                    <motion.div
                      initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.94, y: 14 }}
                      animate={{ opacity: 1, scale: 1, y: 0 }}
                      transition={{ duration: 0.38, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
                      className="ml-auto max-w-[92%] rounded-xl bg-[#D9FDD3] dark:bg-[#193B2C] text-[#141413] dark:text-[#F4F1EA] p-2.5 space-y-2 shadow-xs"
                    >
                      <div className="rounded-lg bg-white/90 dark:bg-[#101210] border border-[#0F5132]/20 p-2.5 space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-mono-ledger text-[#0F5132] dark:text-[#7CE0AC] font-semibold">
                          <span>VERIFIED RECEIPT</span>
                          <ShieldCheck className="w-3.5 h-3.5" />
                        </div>
                        <p className="text-xs font-semibold">
                          Receipt RCT-00149 · Balogun Textiles
                        </p>
                        <p className="text-[11px] text-[#57534E] dark:text-[#A8A29E] font-mono-ledger">
                          VALID · ₦24,500.00 Paid
                        </p>
                      </div>

                      <p className="text-[11px] leading-relaxed">
                        Thank you for your patronage. Receipt <strong>RCT-00149</strong> (₦24,500.00
                        — PAID IN FULL). View &amp; verify: tallymark.ng/r/8fK2...
                      </p>

                      <div className="flex items-center justify-end gap-1 text-[10px] text-[#57534E] dark:text-[#A8A29E]">
                        <span>11:42 AM</span>
                        <CheckCheck className="w-3.5 h-3.5 text-[#0F5132] dark:text-[#7CE0AC]" />
                      </div>
                    </motion.div>
                  </div>
                </motion.div>
              )}

              {activeStep === 2 && (
                <motion.div
                  key="story-3"
                  initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className="w-full max-w-md rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] p-5 space-y-3 text-sm"
                >
                  <div className="flex items-center justify-between pb-2.5 border-b border-[#E5DFD2] dark:border-[#2A2E2A]">
                    <span className="font-semibold">End-of-Day Cash Book</span>
                    <span className="inline-flex items-center gap-1 font-mono-ledger text-xs font-semibold text-[#0F5132] dark:text-[#7CE0AC]">
                      <Lock className="w-3.5 h-3.5" />
                      Sealed
                    </span>
                  </div>

                  <div className="space-y-1.5 text-xs sm:text-sm">
                    <div className="flex justify-between">
                      <span className="text-[#57534E] dark:text-[#A8A29E]">Opening Cash</span>
                      <span className="font-mono-ledger">₦15,000.00</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#57534E] dark:text-[#A8A29E]">Cash &amp; Transfer In</span>
                      <span className="font-mono-ledger text-[#0F5132] dark:text-[#7CE0AC]">
                        +₦142,500.00
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#57534E] dark:text-[#A8A29E]">Expenses Paid</span>
                      <span className="font-mono-ledger text-red-700 dark:text-red-400">
                        -₦18,400.00
                      </span>
                    </div>
                    <div className="pt-2 border-t border-[#E5DFD2] dark:border-[#2A2E2A] flex justify-between font-semibold">
                      <span>Net (money in minus money out)</span>
                      <span className="font-mono-ledger">₦124,100.00</span>
                    </div>
                    <div className="pt-2 border-t border-dashed border-[#E5DFD2] dark:border-[#2A2E2A] flex items-center justify-between text-xs">
                      <span className="text-[#57534E] dark:text-[#A8A29E]">
                        Counted cash vs expected
                      </span>
                      <span className="inline-flex items-center gap-1 font-mono-ledger font-semibold text-[#0F5132] dark:text-[#7CE0AC]">
                        <Check className="w-3.5 h-3.5" />
                        ₦0.00 Exact match
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Step Dots Switcher for Mobile / Keyboard */}
            <div className="flex items-center justify-between pt-4 border-t border-[#E5DFD2] dark:border-[#2A2E2A]">
              <div className="flex items-center gap-2">
                {STEPS.map((s, idx) => (
                  <button
                    key={s.number}
                    type="button"
                    onClick={() => setActiveStep(idx)}
                    aria-label={`Show step ${idx + 1}: ${s.title}`}
                    className={`min-h-[34px] px-3 rounded-lg font-mono-ledger text-xs font-semibold cursor-pointer ${
                      activeStep === idx
                        ? 'bg-[#0F5132] text-white'
                        : 'border border-[#E5DFD2] dark:border-[#2A2E2A] text-[#57534E] dark:text-[#A8A29E]'
                    }`}
                  >
                    {s.number}
                  </button>
                ))}
              </div>
              <span className="text-xs text-[#57534E] dark:text-[#A8A29E]">
                Step {activeStep + 1} of 3
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
