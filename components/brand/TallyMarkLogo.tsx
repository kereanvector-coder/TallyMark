import React from 'react';

export function TallyMarkGlyph({
  className = 'w-6 h-6',
  color = 'currentColor',
}: {
  className?: string;
  color?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <g stroke={color} strokeWidth="2.5" strokeLinecap="round">
        <line x1="7" y1="6" x2="7" y2="26" />
        <line x1="13" y1="6" x2="13" y2="26" />
        <line x1="19" y1="6" x2="19" y2="26" />
        <line x1="25" y1="6" x2="25" y2="26" />
        <line x1="3.5" y1="22.5" x2="28.5" y2="9.5" />
      </g>
    </svg>
  );
}

export function TallyMarkLogo({
  size = 'md',
  showWordmark = true,
  className = '',
}: {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  className?: string;
}) {
  const glyphSizes = {
    sm: 'w-5 h-5',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  };
  const wordmarkSizes = {
    sm: 'text-xl',
    md: 'text-2xl',
    lg: 'text-3xl',
  };

  return (
    <span className={`inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 ${className}`}>
      <TallyMarkGlyph
        className={`${glyphSizes[size]} text-[#0F5132] dark:text-[#2D8A5E]`}
      />
      {showWordmark && (
        <span
          className={`font-display ${wordmarkSizes[size]} leading-none text-[#141413] dark:text-[#F4F1EA]`}
        >
          Tallymark
        </span>
      )}
    </span>
  );
}
