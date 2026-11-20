import type { PaymentMethod, ReceiptStatus } from './database.types';

/**
 * Formats integer kobo as Nigerian Naira with thousands separators: ₦12,500.00
 */
export function formatNaira(kobo: number): string {
  const safe = Number.isFinite(kobo) ? Math.round(kobo) : 0;
  const sign = safe < 0 ? '-' : '';
  const abs = Math.abs(safe);
  const naira = Math.floor(abs / 100);
  const remKobo = abs % 100;
  const formattedNaira = naira.toLocaleString('en-NG');
  const formattedKobo = String(remKobo).padStart(2, '0');
  return `${sign}\u20A6${formattedNaira}.${formattedKobo}`;
}

export function koboToNairaString(kobo: number): string {
  if (!Number.isFinite(kobo) || kobo === 0) return '';
  const value = kobo / 100;
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export function nairaInputToKobo(input: string | number): number {
  if (typeof input === 'number') {
    if (!Number.isFinite(input) || input < 0) return 0;
    return Math.round(input * 100);
  }
  const cleaned = input.replace(/[,\s\u20A6NGN]/gi, '').trim();
  if (!cleaned) return 0;
  const parsed = Number(cleaned);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed * 100);
}

const ONES = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
];

const TENS = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
];

const SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion'];

function integerToWords(n: number): string {
  if (n === 0) return 'Zero';
  let num = Math.floor(Math.abs(n));
  const parts: string[] = [];
  let scaleIdx = 0;

  while (num > 0) {
    const chunk = num % 1000;
    if (chunk > 0) {
      const chunkWords = threeDigitsToWords(chunk);
      const scale = SCALES[scaleIdx];
      parts.unshift(scale ? `${chunkWords} ${scale}` : chunkWords);
    }
    num = Math.floor(num / 1000);
    scaleIdx += 1;
  }

  return parts.join(' ').trim();
}

function threeDigitsToWords(n: number): string {
  const words: string[] = [];
  const hundreds = Math.floor(n / 100);
  const rem = n % 100;
  if (hundreds > 0) {
    words.push(`${ONES[hundreds]} Hundred`);
  }
  if (rem > 0) {
    if (rem < 20) {
      words.push(ONES[rem]);
    } else {
      const t = Math.floor(rem / 10);
      const o = rem % 10;
      words.push(o > 0 ? `${TENS[t]}-${ONES[o]}` : TENS[t]);
    }
  }
  return words.join(' ');
}

/**
 * Converts integer kobo to formal Nigerian Naira words.
 */
export function amountInWordsNGN(kobo: number): string {
  const safe = Math.max(0, Math.round(Number.isFinite(kobo) ? kobo : 0));
  const naira = Math.floor(safe / 100);
  const remKobo = safe % 100;
  const nairaPart = `${integerToWords(naira)} Naira`;
  if (remKobo === 0) {
    return `${nairaPart} Only`;
  }
  return `${nairaPart} and ${integerToWords(remKobo)} Kobo Only`;
}

export function todayInLagosDate(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function addDaysToDate(dateYmd: string, deltaDays: number): string {
  const ts = Date.parse(`${dateYmd}T12:00:00Z`);
  if (Number.isNaN(ts)) return dateYmd;
  return new Date(ts + deltaDays * 86_400_000).toISOString().slice(0, 10);
}

export function yesterdayInLagosDate(): string {
  return addDaysToDate(todayInLagosDate(), -1);
}

export function currentLagosTimeHHMM(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Lagos',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

export function daysBetweenDates(olderYmd: string, newerYmd: string): number {
  const t1 = Date.parse(`${olderYmd.slice(0, 10)}T00:00:00Z`);
  const t2 = Date.parse(`${newerYmd.slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return 0;
  return Math.max(0, Math.round((t2 - t1) / 86_400_000));
}

export function formatLagosDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function formatLagosDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('en-NG', {
    timeZone: 'Africa/Lagos',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export function formatPaymentMethod(method: PaymentMethod): string {
  switch (method) {
    case 'cash':
      return 'Cash';
    case 'transfer':
      return 'Bank Transfer';
    case 'pos':
      return 'POS';
    case 'card':
      return 'Card';
    case 'credit':
      return 'Credit';
    case 'other':
      return 'Other';
    default:
      return method;
  }
}

export function getPublicReceiptUrl(publicId: string, origin?: string): string {
  const base =
    origin ||
    (typeof window !== 'undefined' ? window.location.origin : process.env.APP_URL || '');
  return `${base.replace(/\/$/, '')}/r/${publicId}`;
}

export function buildWhatsAppMessage(params: {
  businessName: string;
  receiptCode: string;
  customerName: string;
  totalKobo: number;
  amountPaidKobo: number;
  balanceDueKobo: number;
  status: ReceiptStatus;
  receiptUrl: string;
}): string {
  const {
    businessName,
    receiptCode,
    customerName,
    totalKobo,
    amountPaidKobo,
    balanceDueKobo,
    status,
    receiptUrl,
  } = params;

  if (status === 'void') {
    return [
      `Notice from ${businessName}`,
      `Receipt ${receiptCode} has been marked VOID.`,
      `View receipt record: ${receiptUrl}`,
    ].join('\n');
  }

  const lines = [
    `Hello${customerName && customerName !== 'Walk-in Customer' ? ` ${customerName}` : ''},`,
    `Thank you for your patronage at *${businessName}*.`,
    `Receipt: *${receiptCode}*`,
    `Total: *${formatNaira(totalKobo)}*`,
  ];

  if (balanceDueKobo > 0) {
    lines.push(`Paid: ${formatNaira(amountPaidKobo)}`);
    lines.push(`Balance due: *${formatNaira(balanceDueKobo)}*`);
  } else {
    lines.push(`Status: *PAID IN FULL*`);
  }

  lines.push('', `View & download your receipt: ${receiptUrl}`);
  return lines.join('\n');
}

export function buildWhatsAppShareUrl(message: string, phone?: string | null): string {
  const encoded = encodeURIComponent(message);
  if (phone) {
    const digits = phone.replace(/[^0-9]/g, '');
    const normalized =
      digits.startsWith('0') && digits.length === 11
        ? `234${digits.slice(1)}`
        : digits;
    if (normalized.length >= 10) {
      return `https://wa.me/${normalized}?text=${encoded}`;
    }
  }
  return `https://wa.me/?text=${encoded}`;
}
