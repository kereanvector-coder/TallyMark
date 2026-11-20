'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react';
import { TallyMarkGlyph } from '@/components/brand/TallyMarkLogo';

const emptySubscribe = () => () => {};

function useIsPointerFine() {
  return useSyncExternalStore(
    emptySubscribe,
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(hover: hover) and (pointer: fine)').matches,
    () => false
  );
}

export function CustomPointerCursor() {
  const isPointerFine = useIsPointerFine();
  const prefersReducedMotion = useReducedMotion();
  const cursorRef = useRef<HTMLDivElement | null>(null);
  const [cursorLabel, setCursorLabel] = useState<string | null>(null);
  const posRef = useRef({ x: -100, y: -100, tx: -100, ty: -100 });

  useEffect(() => {
    if (!isPointerFine || prefersReducedMotion) return;

    let rafId = 0;
    const onMove = (e: MouseEvent) => {
      posRef.current.tx = e.clientX;
      posRef.current.ty = e.clientY;
      const target = (e.target as HTMLElement | null)?.closest('[data-cursor]');
      const label = target?.getAttribute('data-cursor') || null;
      setCursorLabel((prev) => (prev === label ? prev : label));
    };

    const onLeave = () => {
      setCursorLabel(null);
    };

    const tick = () => {
      const p = posRef.current;
      p.x += (p.tx - p.x) * 0.24;
      p.y += (p.ty - p.y) * 0.24;
      if (cursorRef.current) {
        cursorRef.current.style.transform = `translate3d(${p.x + 14}px, ${p.y + 14}px, 0)`;
      }
      rafId = window.requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);
    rafId = window.requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseleave', onLeave);
      window.cancelAnimationFrame(rafId);
    };
  }, [isPointerFine, prefersReducedMotion]);

  if (!isPointerFine || prefersReducedMotion || !cursorLabel) {
    return null;
  }

  return (
    <div
      ref={cursorRef}
      aria-hidden="true"
      className="fixed top-0 left-0 z-50 pointer-events-none select-none will-change-transform"
    >
      <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-[#141413] dark:bg-[#F4F1EA] text-[#FAF7F0] dark:text-[#141413] font-mono-ledger text-[11px] font-semibold tracking-wider uppercase shadow-md">
        {cursorLabel}
      </span>
    </div>
  );
}

export function MagneticButton({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const isPointerFine = useIsPointerFine();
  const prefersReducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isPointerFine || prefersReducedMotion || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = Math.max(-7, Math.min(7, (e.clientX - cx) * 0.18));
    const dy = Math.max(-5, Math.min(5, (e.clientY - cy) * 0.18));
    setOffset({ x: dx, y: dy });
  };

  const handleMouseLeave = () => {
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={
        prefersReducedMotion
          ? undefined
          : {
              transform: `translate3d(${offset.x}px, ${offset.y}px, 0)`,
              transition: 'transform 160ms cubic-bezier(0.16, 1, 0.3, 1)',
            }
      }
      className={`inline-block ${className}`}
    >
      {children}
    </div>
  );
}

export function ReceiptPrintPreloader() {
  const prefersReducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion) return;
    let timer: number | undefined;
    const initTimer = window.setTimeout(() => {
      try {
        if (window.sessionStorage.getItem('tallymark:preloader_seen') === '1') {
          return;
        }
        window.sessionStorage.setItem('tallymark:preloader_seen', '1');
        setVisible(true);
        timer = window.setTimeout(() => {
          setVisible(false);
        }, 1250);
      } catch {
        // Ignore storage errors
      }
    }, 10);

    return () => {
      window.clearTimeout(initTimer);
      if (timer) window.clearTimeout(timer);
    };
  }, [prefersReducedMotion]);

  if (!visible || prefersReducedMotion) return null;

  return (
    <div
      role="status"
      aria-label="Loading Tallymark"
      className="fixed inset-0 z-50 bg-[#FAF7F0] dark:bg-[#101210] flex flex-col items-center justify-center p-6"
    >
      <div className="w-64 space-y-4 text-center">
        <div className="h-2.5 rounded-full bg-[#141413] dark:bg-[#2A2E2A] mx-auto w-56 shadow-sm" />
        <motion.div
          initial={{ y: -24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto w-48 bg-white dark:bg-[#181B18] border border-[#E5DFD2] dark:border-[#2A2E2A] px-4 py-5 shadow-md space-y-2.5 text-left"
        >
          <div className="flex items-center justify-between">
            <TallyMarkGlyph className="w-5 h-5 text-[#0F5132] dark:text-[#7CE0AC]" />
            <span className="font-mono-ledger text-[10px] text-[#57534E] dark:text-[#A8A29E]">
              RCT-00001
            </span>
          </div>
          <div className="h-px bg-[#E5DFD2] dark:bg-[#2A2E2A]" />
          <p className="font-display text-xl text-[#141413] dark:text-[#F4F1EA]">Tallymark</p>
          <p className="font-mono-ledger text-[11px] text-[#0F5132] dark:text-[#7CE0AC]">
            Issue the receipt. Keep the book.
          </p>
        </motion.div>
        <button
          type="button"
          onClick={() => setVisible(false)}
          className="text-xs font-medium text-[#57534E] dark:text-[#A8A29E] underline hover:text-[#141413] dark:hover:text-[#F4F1EA] cursor-pointer min-h-[36px] px-3"
        >
          Skip
        </button>
      </div>
    </div>
  );
}

export function ParallaxPaperLayer({
  children,
  offset = 18,
  className = '',
}: {
  children: React.ReactNode;
  offset?: number;
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion();
  const ref = useRef<HTMLDivElement | null>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const y = useTransform(scrollYProgress, [0, 1], [-offset, offset]);

  return (
    <motion.div
      ref={ref}
      style={prefersReducedMotion ? undefined : { y }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function EditorialHeadingReveal({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const prefersReducedMotion = useReducedMotion();

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
