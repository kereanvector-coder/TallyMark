'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { MagneticButton } from './MarketingPolish';
import { trackPublicEvent } from '@/lib/analytics-client';

export function TrackedCtaLink({
  isSignedIn,
  eventName,
  variant = 'primary',
  size = 'md',
  className = '',
}: {
  isSignedIn: boolean;
  eventName: string;
  variant?: 'primary' | 'inverted';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const href = isSignedIn ? '/app' : '/auth/login';
  const label = isSignedIn ? 'Open app' : 'Get started';

  const sizeClass =
    size === 'sm'
      ? 'min-h-[40px] px-4 text-sm'
      : size === 'lg'
        ? 'min-h-[50px] px-7 text-sm sm:text-base'
        : 'min-h-[46px] px-6 text-sm';

  const variantClass =
    variant === 'inverted'
      ? 'bg-[#FAF7F0] text-[#0F5132] hover:bg-white'
      : 'bg-[#0F5132] text-white hover:bg-[#0B3E26]';

  return (
    <MagneticButton>
      <Link
        href={href}
        data-cursor="Open"
        onClick={() => trackPublicEvent(eventName)}
        className={`inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors whitespace-nowrap shrink-0 ${sizeClass} ${variantClass} ${className}`}
      >
        <span>{label}</span>
        <ArrowRight className="w-4 h-4" />
      </Link>
    </MagneticButton>
  );
}
