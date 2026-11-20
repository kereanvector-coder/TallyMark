import { PDFDocument, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import type { Business, DayClosure } from '../database.types';
import type { CashBookRow, PeriodReportMetrics } from '../cashbook';
import { formatLagosDate, formatLagosDateTime, formatNaira, formatPaymentMethod } from '../format';

interface FontBytesCache {
  sansRegular: Uint8Array;
  sansBold: Uint8Array;
  monoRegular: Uint8Array;
  monoBold: Uint8Array;
  serifRegular: Uint8Array;
}

let fontCache: FontBytesCache | null = null;

async function fetchAssetBytes(path: string): Promise<Uint8Array> {
  const res = await fetch(path, { cache: 'force-cache' });
  if (!res.ok) {
    throw new Error(`Failed to load font asset ${path}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}

async function loadFonts(): Promise<FontBytesCache> {
  if (fontCache) return fontCache;
  const [sansRegular, sansBold, monoRegular, monoBold, serifRegular] = await Promise.all([
    fetchAssetBytes('/fonts/IBMPlexSans-Regular.ttf'),
    fetchAssetBytes('/fonts/IBMPlexSans-SemiBold.ttf'),
    fetchAssetBytes('/fonts/IBMPlexMono-Regular.ttf'),
    fetchAssetBytes('/fonts/IBMPlexMono-SemiBold.ttf'),
    fetchAssetBytes('/fonts/InstrumentSerif-Regular.ttf'),
  ]);
  fontCache = { sansRegular, sansBold, monoRegular, monoBold, serifRegular };
  return fontCache;
}

function drawRight(
  page: PDFPage,
  text: string,
  rightX: number,
  y: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>
) {
  const w = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: rightX - w, y, size, font, color });
}

function truncateToFit(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (font.widthOfTextAtSize(clean, size) <= maxWidth) return clean;
  let out = clean;
  while (out.length > 3 && font.widthOfTextAtSize(`${out}…`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

export async function generateDailySummaryPdfBytes(params: {
  business: Pick<Business, 'name' | 'phone' | 'address' | 'brand_color'>;
  closure: DayClosure;
  rows: CashBookRow[];
}): Promise<Uint8Array> {
  const { business, closure, rows } = params;
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const raw = await loadFonts();

  const sans = await pdfDoc.embedFont(raw.sansRegular, { subset: true });
  const sansBold = await pdfDoc.embedFont(raw.sansBold, { subset: true });
  const mono = await pdfDoc.embedFont(raw.monoRegular, { subset: true });
  const monoBold = await pdfDoc.embedFont(raw.monoBold, { subset: true });
  const serif = await pdfDoc.embedFont(raw.serifRegular, { subset: true });

  const W = 595.28;
  const H = 841.89;
  const M = 42;
  const ink = rgb(0.08, 0.08, 0.075);
  const muted = rgb(0.36, 0.34, 0.31);
  const emerald = rgb(0.06, 0.32, 0.2);
  const crimson = rgb(0.75, 0.14, 0.14);
  const hairline = rgb(0.86, 0.83, 0.77);

  let page = pdfDoc.addPage([W, H]);
  let y = H - 46;

  page.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: emerald });
  page.drawText('DAILY CASH BOOK SUMMARY', { x: M, y, size: 9, font: monoBold, color: emerald });
  drawRight(
    page,
    formatLagosDate(`${closure.closure_date}T12:00:00+01:00`),
    W - M,
    y,
    monoBold,
    10,
    ink
  );
  y -= 24;

  page.drawText(business.name, { x: M, y, size: 22, font: serif, color: ink });
  y -= 16;
  if (business.address || business.phone) {
    page.drawText([business.address, business.phone].filter(Boolean).join(' · '), {
      x: M,
      y,
      size: 8.5,
      font: sans,
      color: muted,
    });
    y -= 14;
  }

  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: hairline });
  y -= 20;

  // Summary Key-Value Grid
  const summaryRows: Array<[string, string, ReturnType<typeof rgb>]> = [
    ['Opening Cash in Hand', formatNaira(closure.opening_cash_kobo), ink],
    ['Receipted Sales', formatNaira(closure.total_receipt_sales_kobo), ink],
    ['Quick Sales (no receipt)', formatNaira(closure.total_quick_sales_kobo), ink],
    ['Credit Sales Given (unpaid)', formatNaira(closure.total_credit_sales_kobo), muted],
    ['Debt Payments Received', formatNaira(closure.total_payments_received_kobo), emerald],
    ['Expenses Paid', formatNaira(closure.total_expenses_kobo), crimson],
    ['Cash In / Cash Out', `${formatNaira(closure.cash_in_kobo)} / ${formatNaira(closure.cash_out_kobo)}`, ink],
    ['Transfer In / POS In', `${formatNaira(closure.transfer_in_kobo)} / ${formatNaira(closure.pos_in_kobo)}`, ink],
    ['Net (money in minus money out)', formatNaira(closure.net_cash_book_kobo), closure.net_cash_book_kobo >= 0 ? emerald : crimson],
    ['Expected Cash in Hand', formatNaira(closure.expected_cash_kobo), ink],
    [
      'Actual Cash Counted',
      formatNaira(closure.actual_cash_counted_kobo ?? closure.expected_cash_kobo),
      ink,
    ],
    [
      'Over / Short Difference',
      closure.variance_kobo === 0 || closure.variance_kobo === null
        ? '₦0.00 (Exact)'
        : closure.variance_kobo > 0
          ? `+${formatNaira(closure.variance_kobo)} (Over)`
          : `${formatNaira(closure.variance_kobo)} (Short)`,
      closure.variance_kobo && closure.variance_kobo < 0 ? crimson : emerald,
    ],
  ];

  for (const [label, val, col] of summaryRows) {
    page.drawText(label, { x: M, y, size: 9.5, font: sans, color: muted });
    drawRight(page, val, W - M, y, monoBold, 9.5, col);
    y -= 16;
  }

  if (closure.notes) {
    y -= 4;
    page.drawText(`Closure Note: ${truncateToFit(closure.notes, sans, 8.5, W - M * 2)}`, {
      x: M,
      y,
      size: 8.5,
      font: sans,
      color: muted,
    });
    y -= 16;
  }

  y -= 8;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: hairline });
  y -= 18;

  page.drawText('CHRONOLOGICAL ENTRIES', { x: M, y, size: 8.5, font: monoBold, color: muted });
  y -= 14;

  const drawTableHeader = (targetPage: PDFPage, startY: number) => {
    targetPage.drawText('DESCRIPTION', { x: M, y: startY, size: 7.5, font: monoBold, color: muted });
    drawRight(targetPage, 'METHOD', M + 290, startY, monoBold, 7.5, muted);
    drawRight(targetPage, 'IN / OUT', M + 405, startY, monoBold, 7.5, muted);
    drawRight(targetPage, 'CASH BAL', W - M, startY, monoBold, 7.5, muted);
    return startY - 14;
  };

  y = drawTableHeader(page, y);

  for (const row of rows) {
    if (y < 60) {
      page = pdfDoc.addPage([W, H]);
      y = H - 46;
      y = drawTableHeader(page, y);
    }

    const desc = truncateToFit(row.entry.description, sans, 8.5, 220);
    const inOutText =
      row.effect.moneyInKobo > 0
        ? `+${formatNaira(row.effect.moneyInKobo)}`
        : row.effect.moneyOutKobo > 0
          ? `-${formatNaira(row.effect.moneyOutKobo)}`
          : 'Credit (₦0)';

    page.drawText(desc, { x: M, y, size: 8.5, font: sans, color: ink });
    drawRight(page, formatPaymentMethod(row.entry.payment_method), M + 290, y, sans, 8, muted);
    drawRight(
      page,
      inOutText,
      M + 405,
      y,
      mono,
      8.5,
      row.effect.moneyOutKobo > 0 ? crimson : row.effect.moneyInKobo > 0 ? emerald : muted
    );
    drawRight(page, formatNaira(row.runningCashKobo), W - M, y, monoBold, 8.5, ink);
    y -= 15;
  }

  page.drawText(`Sealed ${formatLagosDateTime(closure.closed_at)} · Tallymark`, {
    x: M,
    y: 28,
    size: 7.5,
    font: mono,
    color: muted,
  });

  return await pdfDoc.save();
}

export async function generateReportsSummaryPdfBytes(params: {
  business: Pick<Business, 'name' | 'phone' | 'address'>;
  metrics: PeriodReportMetrics;
}): Promise<Uint8Array> {
  const { business, metrics } = params;
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const raw = await loadFonts();

  const sans = await pdfDoc.embedFont(raw.sansRegular, { subset: true });
  const sansBold = await pdfDoc.embedFont(raw.sansBold, { subset: true });
  const mono = await pdfDoc.embedFont(raw.monoRegular, { subset: true });
  const monoBold = await pdfDoc.embedFont(raw.monoBold, { subset: true });
  const serif = await pdfDoc.embedFont(raw.serifRegular, { subset: true });

  const W = 595.28;
  const H = 841.89;
  const M = 42;
  const ink = rgb(0.08, 0.08, 0.075);
  const muted = rgb(0.36, 0.34, 0.31);
  const emerald = rgb(0.06, 0.32, 0.2);
  const crimson = rgb(0.75, 0.14, 0.14);
  const hairline = rgb(0.86, 0.83, 0.77);

  const page = pdfDoc.addPage([W, H]);
  let y = H - 46;

  page.drawRectangle({ x: 0, y: H - 8, width: W, height: 8, color: emerald });
  page.drawText('BUSINESS FINANCIAL REPORT', { x: M, y, size: 9, font: monoBold, color: emerald });
  drawRight(page, `${metrics.startDate} to ${metrics.endDate}`, W - M, y, monoBold, 9.5, ink);
  y -= 24;

  page.drawText(business.name, { x: M, y, size: 22, font: serif, color: ink });
  y -= 16;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: hairline });
  y -= 20;

  const topRows: Array<[string, string, ReturnType<typeof rgb>]> = [
    ['Total Sold (receipts + quick + credit)', formatNaira(metrics.soldTotalKobo), ink],
    ['• Receipted Sales', formatNaira(metrics.soldReceiptsKobo), muted],
    ['• Quick Sales (no receipt)', formatNaira(metrics.soldQuickCashKobo), muted],
    ['• Credit Sales Given', formatNaira(metrics.soldCreditKobo), muted],
    ['Money Actually Received', formatNaira(metrics.receivedTotalKobo), emerald],
    ['Total Expenses & Reversals', formatNaira(metrics.expensesTotalKobo), crimson],
    [
      'Net (money in minus money out)',
      formatNaira(metrics.netMoneyInMinusOutKobo),
      metrics.netMoneyInMinusOutKobo >= 0 ? emerald : crimson,
    ],
    ['Current Open Customer Debts (All-time)', formatNaira(metrics.outstandingDebtsTotalKobo), ink],
  ];

  for (const [label, val, col] of topRows) {
    page.drawText(label, { x: M, y, size: 9.5, font: sans, color: col === muted ? muted : ink });
    drawRight(page, val, W - M, y, monoBold, 10, col);
    y -= 16;
  }

  const drawSection = (title: string, items: Array<{ label: string; amountKobo: number; count: number }>) => {
    if (y < 110) return;
    y -= 8;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: hairline });
    y -= 16;
    page.drawText(title, { x: M, y, size: 8.5, font: monoBold, color: emerald });
    y -= 14;
    if (items.length === 0) {
      page.drawText('No entries in this period.', { x: M, y, size: 8.5, font: sans, color: muted });
      y -= 14;
      return;
    }
    for (const item of items.slice(0, 8)) {
      if (y < 60) break;
      page.drawText(`${truncateToFit(item.label, sans, 9, 280)} (${item.count})`, {
        x: M,
        y,
        size: 9,
        font: sansBold,
        color: ink,
      });
      drawRight(page, formatNaira(item.amountKobo), W - M, y, monoBold, 9, ink);
      y -= 14;
    }
  };

  drawSection('RECEIVED BY PAYMENT METHOD', metrics.byPaymentMethod);
  drawSection('EXPENSES BY CATEGORY', metrics.byExpenseCategory);
  drawSection('MONEY RECEIVED BY STAFF ("SOLD BY")', metrics.bySoldBy);
  drawSection('TOP CUSTOMERS (BY SALES)', metrics.topCustomers);

  page.drawText(`Generated ${formatLagosDateTime(new Date().toISOString())} · Tallymark`, {
    x: M,
    y: 28,
    size: 7.5,
    font: mono,
    color: muted,
  });

  return await pdfDoc.save();
}
