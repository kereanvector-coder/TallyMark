'use client';

import React, { useState } from 'react';
import { Download, X } from 'lucide-react';
import { usePWAInstall } from './usePWAInstall';

export function PWAInstallButton({ compact = false }: { compact?: boolean }) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`inline-flex items-center justify-center gap-2 rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] text-[#141413] dark:text-[#F4F1EA] hover:bg-[#F3EFE4] dark:hover:bg-[#202420] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          compact ? 'min-h-[40px] px-3 text-xs font-medium' : 'min-h-[44px] px-4 text-sm font-medium'
        }`}
      >
        <Download className="w-4 h-4 text-[#0F5132] dark:text-[#2D8A5E]" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`inline-flex items-center justify-center gap-2 rounded-lg border border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] text-[#141413] dark:text-[#F4F1EA] hover:bg-[#F3EFE4] dark:hover:bg-[#202420] transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
            compact ? 'min-h-[40px] px-3 text-xs font-medium' : 'min-h-[44px] px-4 text-sm font-medium'
          }`}
        >
          <Download className="w-4 h-4 text-[#0F5132] dark:text-[#2D8A5E]" />
          <span>Install App</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl border border-[#E5DFD2] dark:border-[#2A2E2A] bg-[#FAF7F0] dark:bg-[#181B18] p-6 shadow-xl">
              <div className="flex items-start justify-between gap-4">
                <h3 className="font-display text-2xl text-[#141413] dark:text-[#F4F1EA]">
                  Install Tallymark
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close install instructions"
                  className="min-h-[44px] min-w-[44px] -mr-2 -mt-2 flex items-center justify-center rounded-lg text-[#57534E] hover:text-[#141413] dark:text-[#A8A29E] dark:hover:text-[#F4F1EA]"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[#57534E] dark:text-[#A8A29E]">
                Add Tallymark to your iPhone or iPad home screen for instant one-tap access:
              </p>
              <ol className="mt-4 space-y-2 text-sm text-[#141413] dark:text-[#F4F1EA]">
                <li>1. Tap the <strong>Share</strong> icon in Safari’s toolbar.</li>
                <li>2. Scroll down and tap <strong>Add to Home Screen</strong>.</li>
                <li>3. Tap <strong>Add</strong> in the top-right corner.</li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-6 w-full min-h-[44px] rounded-xl bg-[#0F5132] text-white text-sm font-medium hover:bg-[#0B3E26] transition-colors"
              >
                Got it
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
}
