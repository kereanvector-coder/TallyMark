'use client';

import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { MARKETING_CONFIG } from '@/lib/marketing-config';
import { trackPublicEvent } from '@/lib/analytics-client';

interface FaqItem {
  id: string;
  question: string;
  answer: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    id: 'pricing',
    question: 'Is it free?',
    answer: MARKETING_CONFIG.pricingFaqAnswer,
  },
  {
    id: 'install',
    question: 'Do I need to install anything?',
    answer:
      'No app store download is required. Tallymark opens directly in Chrome or Safari on your phone or laptop, and you can tap "Install App" once to add it to your home screen so it opens fast on weak data connections.',
  },
  {
    id: 'safety',
    question: 'Is my data safe?',
    answer:
      'Your data stays yours. Every receipt, expense, and customer balance is isolated to your account with database Row Level Security, encrypted in transit and at rest, and exportable as JSON or CSV whenever you want.',
  },
  {
    id: 'vat',
    question: 'Can I add VAT?',
    answer:
      'Yes. VAT (7.5%) is off by default and can be turned on in Settings as either VAT-inclusive or VAT-exclusive. You can also choose whether to show or omit VAT on individual receipts.',
  },
  {
    id: 'print',
    question: 'Can I print receipts?',
    answer:
      'Yes. Every receipt formats cleanly for 80mm Bluetooth thermal printers via your browser print dialog, and also exports as an A4/A5 PDF with crisp Naira (₦) typography.',
  },
  {
    id: 'cashbook',
    question: 'Does it replace my cash book?',
    answer:
      'Yes. Issuing a receipt automatically posts the sale into your daily cash book. You can also record walk-in counter sales without a customer name, log expenses with receipt photos, track customers who owe you, and close the day against counted drawer cash.',
  },
];

export function FaqAccordion() {
  const [openId, setOpenId] = useState<string>('pricing');

  const toggle = (id: string) => {
    setOpenId((prev) => (prev === id ? '' : id));
    trackPublicEvent('faq_toggled');
  };

  return (
    <div className="divide-y divide-[#E5DFD2] dark:divide-[#2A2E2A] border-y border-[#E5DFD2] dark:border-[#2A2E2A]">
      {FAQ_ITEMS.map((item) => {
        const isOpen = openId === item.id;
        const panelId = `faq-panel-${item.id}`;
        const buttonId = `faq-trigger-${item.id}`;

        return (
          <div key={item.id}>
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
                className="w-full min-h-[56px] py-5 flex items-center justify-between gap-4 text-left cursor-pointer group"
              >
                <span className="text-base sm:text-lg font-semibold text-[#141413] dark:text-[#F4F1EA] group-hover:text-[#0F5132] dark:group-hover:text-[#7CE0AC] transition-colors">
                  {item.question}
                </span>
                <ChevronDown
                  className={`w-5 h-5 text-[#57534E] dark:text-[#A8A29E] shrink-0 transition-transform duration-200 ${
                    isOpen ? 'rotate-180 text-[#0F5132] dark:text-[#7CE0AC]' : ''
                  }`}
                />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              hidden={!isOpen}
              className="pb-5 pr-8"
            >
              <p className="text-sm sm:text-base leading-relaxed text-[#57534E] dark:text-[#A8A29E]">
                {item.answer}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
