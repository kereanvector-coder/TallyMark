'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Menu, X } from 'lucide-react';
import { TallyMarkLogo } from '@/components/brand/TallyMarkLogo';
import { TrackedCtaLink } from './TrackedCtaLink';

const NAV_LINKS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#verify', label: 'Verify' },
  { href: '#faq', label: 'FAQ' },
] as const;

export function MarketingNav({ isSignedIn }: { isSignedIn: boolean }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="w-full border-b border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0]/95 dark:bg-[#101210]/95 backdrop-blur-sm sticky top-0 z-40">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Zone 1: Brand */}
        <Link href="/" className="whitespace-nowrap shrink-0" aria-label="Tallymark home">
          <TallyMarkLogo size="md" />
        </Link>

        {/* Zone 2: Desktop Anchor Links */}
        <nav
          aria-label="Primary sections"
          className="hidden md:flex items-center gap-7 text-sm font-medium text-[#57534E] dark:text-[#A8A29E]"
        >
          {NAV_LINKS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              className="hover:text-[#141413] dark:hover:text-[#F4F1EA] transition-colors whitespace-nowrap shrink-0"
            >
              {item.label}
            </a>
          ))}
        </nav>

        {/* Zone 3: Single Primary CTA + Mobile Nav Button */}
        <div className="flex items-center gap-2 shrink-0">
          <TrackedCtaLink
            isSignedIn={isSignedIn}
            eventName="nav_cta_clicked"
            size="sm"
          />

          <button
            type="button"
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-expanded={mobileOpen}
            aria-controls="mobile-marketing-menu"
            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
            className="md:hidden min-h-[40px] min-w-[40px] inline-flex items-center justify-center rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] text-[#141413] dark:text-[#F4F1EA] cursor-pointer"
          >
            {mobileOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {mobileOpen && (
        <nav
          id="mobile-marketing-menu"
          aria-label="Mobile section navigation"
          className="md:hidden border-t border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-4 py-3 flex flex-col gap-1"
        >
          {NAV_LINKS.map((item) => (
            <a
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className="min-h-[44px] flex items-center text-sm font-medium text-[#141413] dark:text-[#F4F1EA] hover:text-[#0F5132]"
            >
              {item.label}
            </a>
          ))}
        </nav>
      )}
    </header>
  );
}
