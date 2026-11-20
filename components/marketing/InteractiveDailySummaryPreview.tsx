'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';
import { formatNaira } from '@/lib/format';
import { trackPublicEvent } from '@/lib/analytics-client';

type PreviewPeriod = 'today' | 'week' | 'month';

interface BarPoint {
  label: string;
  salesKobo: number;
  expensesKobo: number;
}

interface PeriodDataset {
  label: string;
  soldKobo: number;
  receivedKobo: number;
  expensesKobo: number;
  netKobo: number;
  bars: BarPoint[];
}

const SAMPLE_DATASETS: Record<PreviewPeriod, PeriodDataset> = {
  today: {
    label: 'Today (WAT)',
    soldKobo: 16850000,
    receivedKobo: 14250000,
    expensesKobo: 1840000,
    netKobo: 12410000,
    bars: [
      { label: '9am', salesKobo: 2100000, expensesKobo: 300000 },
      { label: '11am', salesKobo: 3850000, expensesKobo: 250000 },
      { label: '1pm', salesKobo: 2900000, expensesKobo: 640000 },
      { label: '3pm', salesKobo: 4600000, expensesKobo: 200000 },
      { label: '5pm', salesKobo: 3400000, expensesKobo: 450000 },
    ],
  },
  week: {
    label: 'Last 7 days',
    soldKobo: 98400000,
    receivedKobo: 91200000,
    expensesKobo: 14650000,
    netKobo: 76550000,
    bars: [
      { label: 'Mon', salesKobo: 14200000, expensesKobo: 2100000 },
      { label: 'Tue', salesKobo: 11800000, expensesKobo: 1850000 },
      { label: 'Wed', salesKobo: 16400000, expensesKobo: 2600000 },
      { label: 'Thu', salesKobo: 15100000, expensesKobo: 1900000 },
      { label: 'Fri', salesKobo: 19200000, expensesKobo: 3100000 },
      { label: 'Sat', salesKobo: 21700000, expensesKobo: 3100000 },
    ],
  },
  month: {
    label: 'This month',
    soldKobo: 384000000,
    receivedKobo: 361500000,
    expensesKobo: 58200000,
    netKobo: 303300000,
    bars: [
      { label: 'Wk 1', salesKobo: 88500000, expensesKobo: 13400000 },
      { label: 'Wk 2', salesKobo: 94200000, expensesKobo: 15100000 },
      { label: 'Wk 3', salesKobo: 102800000, expensesKobo: 14900000 },
      { label: 'Wk 4', salesKobo: 98500000, expensesKobo: 14800000 },
    ],
  },
};

function AnimatedNaira({ valueKobo }: { valueKobo: number }) {
  const prefersReducedMotion = useReducedMotion();
  const [displayKobo, setDisplayKobo] = useState(valueKobo);
  const currentRef = useRef(valueKobo);

  useEffect(() => {
    if (prefersReducedMotion) {
      currentRef.current = valueKobo;
      const t = window.setTimeout(() => setDisplayKobo(valueKobo), 0);
      return () => window.clearTimeout(t);
    }

    const from = currentRef.current;
    const to = valueKobo;
    if (from === to) return;

    const start = performance.now();
    const duration = 360;
    let rafId = 0;

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextVal = Math.round(from + (to - from) * eased);
      currentRef.current = nextVal;
      setDisplayKobo(nextVal);
      if (progress < 1) {
        rafId = window.requestAnimationFrame(step);
      }
    };

    rafId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(rafId);
  }, [valueKobo, prefersReducedMotion]);

  return (
    <span className="font-mono-ledger tabular-figures">
      {formatNaira(prefersReducedMotion ? valueKobo : displayKobo)}
    </span>
  );
}

export function InteractiveDailySummaryPreview() {
  const [period, setPeriod] = useState<PreviewPeriod>('today');
  const [activeBarIdx, setActiveBarIdx] = useState<number>(0);

  const dataset = SAMPLE_DATASETS[period];
  const safeBarIdx = Math.min(activeBarIdx, dataset.bars.length - 1);
  const activeBar = dataset.bars[safeBarIdx];
  const maxSale = Math.max(...dataset.bars.map((b) => b.salesKobo), 1);

  const handlePeriodChange = (next: PreviewPeriod) => {
    setPeriod(next);
    setActiveBarIdx(0);
    trackPublicEvent('summary_preview_period_changed');
  };

  return (
    <div className="rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] p-5 sm:p-6 space-y-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[#E5DFD2] dark:border-[#2A2E2A]">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold">Daily &amp; Period Summary</h3>
            <span className="font-mono-ledger text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-[#E5DFD2] dark:border-[#2A2E2A] text-[#57534E] dark:text-[#A8A29E]">
              Sample data
            </span>
          </div>
          <p className="text-xs text-[#57534E] dark:text-[#A8A29E] mt-0.5">
            {dataset.label} · Hover or tap any bar to inspect cash movement
          </p>
        </div>

        <div
          role="tablist"
          aria-label="Summary period"
          className="inline-flex items-center gap-1 p-1 rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210]"
        >
          {(['today', 'week', 'month'] as PreviewPeriod[]).map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={period === key}
              onClick={() => handlePeriodChange(key)}
              className={`min-h-[34px] px-3 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer ${
                period === key
                  ? 'bg-white dark:bg-[#181B18] text-[#141413] dark:text-[#F4F1EA] shadow-xs'
                  : 'text-[#57534E] dark:text-[#A8A29E] hover:text-[#141413] dark:hover:text-[#F4F1EA]'
              }`}
            >
              {key}
            </button>
          ))}
        </div>
      </div>

      {/* 4 Honest Metrics */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] p-3.5">
          <p className="text-[11px] uppercase tracking-wider text-[#57534E] dark:text-[#A8A29E]">
            Sold
          </p>
          <p className="text-base sm:text-lg font-semibold mt-1">
            <AnimatedNaira valueKobo={dataset.soldKobo} />
          </p>
        </div>

        <div className="rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] p-3.5">
          <p className="text-[11px] uppercase tracking-wider text-[#57534E] dark:text-[#A8A29E]">
            Received
          </p>
          <p className="text-base sm:text-lg font-semibold mt-1 text-[#0F5132] dark:text-[#7CE0AC]">
            <AnimatedNaira valueKobo={dataset.receivedKobo} />
          </p>
        </div>

        <div className="rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] p-3.5">
          <p className="text-[11px] uppercase tracking-wider text-[#57534E] dark:text-[#A8A29E]">
            Expenses
          </p>
          <p className="text-base sm:text-lg font-semibold mt-1 text-red-700 dark:text-red-400">
            <AnimatedNaira valueKobo={dataset.expensesKobo} />
          </p>
        </div>

        <div className="rounded-xl border border-[#0F5132]/30 bg-[#0F5132]/5 dark:bg-[#0F5132]/15 p-3.5">
          <p className="text-[11px] uppercase tracking-wider text-[#0F5132] dark:text-[#7CE0AC]">
            Net (money in minus money out)
          </p>
          <p className="text-base sm:text-lg font-semibold mt-1 text-[#0F5132] dark:text-[#7CE0AC]">
            <AnimatedNaira valueKobo={dataset.netKobo} />
          </p>
        </div>
      </div>

      {/* Interactive Bar Chart + Live Tooltip Readout */}
      <div className="space-y-3 pt-1">
        <div
          className="rounded-xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#101210] px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs"
          aria-live="polite"
        >
          <span className="font-mono-ledger font-semibold">{activeBar.label}</span>
          <div className="flex flex-wrap items-center gap-3 font-mono-ledger">
            <span className="text-[#0F5132] dark:text-[#7CE0AC]">
              In: {formatNaira(activeBar.salesKobo)}
            </span>
            <span className="text-red-700 dark:text-red-400">
              Out: {formatNaira(activeBar.expensesKobo)}
            </span>
          </div>
        </div>

        <div className="pt-2">
          <svg
            viewBox={`0 0 ${dataset.bars.length * 64} 136`}
            className="w-full h-36 overflow-visible"
            role="img"
            aria-label={`Interactive cash inflow and expense bars for ${dataset.label}`}
          >
            {dataset.bars.map((bar, idx) => {
              const x = idx * 64 + 10;
              const saleHeight = Math.max(12, Math.round((bar.salesKobo / maxSale) * 92));
              const expHeight = Math.max(6, Math.round((bar.expensesKobo / maxSale) * 92));
              const selected = idx === safeBarIdx;

              return (
                <g
                  key={bar.label}
                  tabIndex={0}
                  role="button"
                  aria-label={`${bar.label}: In ${formatNaira(bar.salesKobo)}, Out ${formatNaira(bar.expensesKobo)}`}
                  onMouseEnter={() => setActiveBarIdx(idx)}
                  onFocus={() => setActiveBarIdx(idx)}
                  onClick={() => setActiveBarIdx(idx)}
                  className="cursor-pointer focus:outline-none"
                >
                  <rect
                    x={x - 4}
                    y={4}
                    width={52}
                    height={108}
                    rx={8}
                    fill={selected ? 'rgba(15, 81, 50, 0.08)' : 'transparent'}
                  />
                  {/* Sales In bar */}
                  <rect
                    x={x + 4}
                    y={104 - saleHeight}
                    width={18}
                    height={saleHeight}
                    rx={4}
                    fill={selected ? '#0F5132' : '#2D8A5E'}
                  />
                  {/* Expenses Out bar */}
                  <rect
                    x={x + 25}
                    y={104 - expHeight}
                    width={14}
                    height={expHeight}
                    rx={4}
                    fill={selected ? '#B91C1C' : '#D97706'}
                    opacity={selected ? 0.9 : 0.65}
                  />
                  <text
                    x={x + 22}
                    y={124}
                    textAnchor="middle"
                    className="fill-[#57534E] dark:fill-[#A8A29E] text-[10px] font-mono-ledger"
                  >
                    {bar.label}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      </div>
    </div>
  );
}
