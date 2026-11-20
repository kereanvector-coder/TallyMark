'use client';

import React, { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Mic, MicOff } from 'lucide-react';

interface SpeechRecognitionEventLike {
  results: ArrayLike<ArrayLike<{ transcript: string }>>;
}

interface SpeechRecognitionErrorEventLike {
  error: string;
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  continuous: boolean;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
}

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

const emptySubscribe = () => () => {};

export function DictationMicButton({
  onTranscript,
  label = 'Dictate text',
  className = '',
}: {
  onTranscript: (text: string) => void;
  label?: string;
  className?: string;
}) {
  const supported = useSyncExternalStore(
    emptySubscribe,
    () => !!getSpeechRecognitionCtor(),
    () => false
  );
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const retriedFallbackRef = useRef(false);

  useEffect(() => {
    return () => {
      recognitionRef.current?.abort();
    };
  }, []);

  if (!supported) {
    return null;
  }

  const startRecognition = (lang: string) => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    const rec = new Ctor();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.continuous = false;

    rec.onresult = (event) => {
      const chunks: string[] = [];
      for (let i = 0; i < event.results.length; i++) {
        const res = event.results[i];
        if (res && res[0]?.transcript) {
          chunks.push(res[0].transcript.trim());
        }
      }
      const text = chunks.join(' ').trim();
      if (text) {
        onTranscript(text);
      }
    };

    rec.onerror = (event) => {
      if (
        (event.error === 'language-not-supported' || event.error === 'service-not-allowed') &&
        lang === 'en-NG' &&
        !retriedFallbackRef.current
      ) {
        retriedFallbackRef.current = true;
        startRecognition('en-US');
        return;
      }
      setListening(false);
    };

    rec.onend = () => {
      setListening(false);
    };

    recognitionRef.current = rec;
    setListening(true);
    try {
      rec.start();
    } catch {
      setListening(false);
    }
  };

  const toggle = () => {
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    retriedFallbackRef.current = false;
    startRecognition('en-NG');
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={listening ? 'Stop dictation' : label}
      title={listening ? 'Tap to stop dictation' : `${label} (en-NG)`}
      className={`inline-flex items-center justify-center min-h-[44px] min-w-[44px] rounded-lg border transition-colors shrink-0 cursor-pointer ${
        listening
          ? 'border-red-600 bg-red-600 text-white'
          : 'border-[#E5DFD2] dark:border-[#2A2E2A] bg-white dark:bg-[#181B18] text-[#57534E] dark:text-[#A8A29E] hover:text-[#0F5132] dark:hover:text-[#2D8A5E] hover:border-[#0F5132]/40'
      } ${className}`}
    >
      {listening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
    </button>
  );
}
