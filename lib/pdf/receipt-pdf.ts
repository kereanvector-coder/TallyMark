import { PDFDocument, rgb, degrees, type PDFFont, type PDFPage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import QRCode from 'qrcode';
import type { PublicReceiptResponse, ReceiptTemplateStyle } from '@/lib/database.types';
import {
  amountInWordsNGN,
  formatLagosDateTime,
  formatNaira,
  formatPaymentMethod,
  getPublicReceiptUrl,
} from '@/lib/format';

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

function hexToRgb(hex: string) {
  const clean = /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : '#0F5132';
  return rgb(
    parseInt(clean.slice(1, 3), 16) / 255,
    parseInt(clean.slice(3, 5), 16) / 255,
    parseInt(clean.slice(5, 7), 16) / 255
  );
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];
  const lines: string[] = [];
  let current = words[0];

  for (let i = 1; i < words.length; i++) {
    const candidate = `${current} ${words[i]}`;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      lines.push(current);
      current = words[i];
    }
  }
  lines.push(current);
  return lines;
}

function drawRightText(
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

function drawTallyMarkVector(
  page: PDFPage,
  x: number,
  y: number,
  size: number,
  color: ReturnType<typeof rgb>
) {
  const h = size;
  const gap = size * 0.22;
  const strokeWidth = Math.max(1, size * 0.11);
  for (let i = 0; i < 4; i++) {
    const sx = x + i * gap;
    page.drawLine({
      start: { x: sx, y },
      end: { x: sx, y: y + h },
      thickness: strokeWidth,
      color,
    });
  }
  page.drawLine({
    start: { x: x - gap * 0.45, y: y + h * 0.2 },
    end: { x: x + gap * 3.45, y: y + h * 0.8 },
    thickness: strokeWidth,
    color,
  });
}

function drawStamp(
  page: PDFPage,
  label: string,
  centerX: number,
  centerY: number,
  font: PDFFont,
  color: ReturnType<typeof rgb>,
  compact = false
) {
  const fontSize = compact ? 10 : 14;
  const textWidth = font.widthOfTextAtSize(label, fontSize);
  const padX = compact ? 8 : 14;
  const padY = compact ? 4 : 6;
  const boxW = textWidth + padX * 2;
  const boxH = fontSize + padY * 2;

  page.drawRectangle({
    x: centerX - boxW / 2,
    y: centerY - boxH / 2,
    width: boxW,
    height: boxH,
    borderColor: color,
    borderWidth: compact ? 1.3 : 1.8,
    rotate: degrees(-6),
    opacity: 0.9,
  });

  page.drawText(label, {
    x: centerX - textWidth / 2,
    y: centerY - fontSize / 3,
    size: fontSize,
    font,
    color,
    rotate: degrees(-6),
    opacity: 0.92,
  });
}

async function dataUrlToBytes(dataUrl: string): Promise<Uint8Array> {
  const base64 = dataUrl.split(',')[1] || '';
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

async function tryLoadLogoImage(pdfDoc: PDFDocument, logoUrl?: string | null) {
  if (!logoUrl) return null;
  try {
    const res = await fetch(logoUrl);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (contentType.includes('png') || logoUrl.toLowerCase().endsWith('.png')) {
      return await pdfDoc.embedPng(bytes);
    }
    if (
      contentType.includes('jpeg') ||
      contentType.includes('jpg') ||
      logoUrl.toLowerCase().endsWith('.jpg') ||
      logoUrl.toLowerCase().endsWith('.jpeg')
    ) {
      return await pdfDoc.embedJpg(bytes);
    }
    return null;
  } catch {
    return null;
  }
}

export async function generateReceiptPdfBytes(params: {
  data: PublicReceiptResponse;
  template: ReceiptTemplateStyle;
  logoUrl?: string | null;
  publicUrl?: string;
}): Promise<Uint8Array> {
  const { data, template, logoUrl } = params;
  const { receipt, business } = data;
  const publicUrl = params.publicUrl || getPublicReceiptUrl(receipt.public_id);

  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);

  const rawFonts = await loadFonts();
  const sans = await pdfDoc.embedFont(rawFonts.sansRegular, { subset: true });
  const sansBold = await pdfDoc.embedFont(rawFonts.sansBold, { subset: true });
  const mono = await pdfDoc.embedFont(rawFonts.monoRegular, { subset: true });
  const monoBold = await pdfDoc.embedFont(rawFonts.monoBold, { subset: true });
  const serif = await pdfDoc.embedFont(rawFonts.serifRegular, { subset: true });

  const qrDataUrl = await QRCode.toDataURL(publicUrl, {
    width: 240,
    margin: 1,
    color: { dark: '#141413', light: '#FFFFFF' },
  });
  const qrImage = await pdfDoc.embedPng(await dataUrlToBytes(qrDataUrl));
  const logoImage = await tryLoadLogoImage(pdfDoc, logoUrl);

  const brandRgb = hexToRgb(business.brand_color);
  const ink = rgb(0.078, 0.078, 0.075);
  const muted = rgb(0.36, 0.34, 0.31);
  const hairline = rgb(0.86, 0.83, 0.77);
  const ivory = rgb(0.985, 0.975, 0.95);
  const crimson = rgb(0.75, 0.14, 0.14);
  const amber = rgb(0.72, 0.45, 0.04);

  const isVoid = receipt.status === 'void';
  const remaining =
    typeof receipt.outstanding_balance_kobo === 'number'
      ? receipt.outstanding_balance_kobo
      : receipt.balance_due_kobo;
  const isPartPaid = !isVoid && remaining > 0;
  const stampLabel = isVoid ? 'VOID' : isPartPaid ? 'PART PAID' : 'PAID';
  const stampColor = isVoid ? crimson : isPartPaid ? amber : brandRgb;

  if (template === 'thermal') {
    // 80mm roll = 226.77pt wide; calculate height dynamically
    const W = 226.77;
    const M = 14;
    const contentW = W - M * 2;
    const estimatedHeight = Math.max(
      430,
      290 + receipt.line_items.length * 30 + (receipt.notes ? 40 : 0) + (isVoid ? 36 : 0)
    );
    const page = pdfDoc.addPage([W, estimatedHeight]);
    let y = estimatedHeight - 18;

    if (logoImage) {
      const scaled = logoImage.scaleToFit(40, 26);
      page.drawImage(logoImage, {
        x: (W - scaled.width) / 2,
        y: y - scaled.height,
        width: scaled.width,
        height: scaled.height,
      });
      y -= scaled.height + 6;
    }

    const bizLines = wrapText(business.name, sansBold, 11, contentW);
    for (const line of bizLines) {
      const lw = sansBold.widthOfTextAtSize(line, 11);
      page.drawText(line, { x: (W - lw) / 2, y, size: 11, font: sansBold, color: ink });
      y -= 13;
    }

    const metaParts = [business.address, business.phone].filter(Boolean) as string[];
    for (const part of metaParts) {
      for (const line of wrapText(part, sans, 7.5, contentW)) {
        const lw = sans.widthOfTextAtSize(line, 7.5);
        page.drawText(line, { x: (W - lw) / 2, y, size: 7.5, font: sans, color: muted });
        y -= 10;
      }
    }

    y -= 4;
    page.drawLine({
      start: { x: M, y },
      end: { x: W - M, y },
      thickness: 0.75,
      dashArray: [2, 2],
      color: muted,
    });
    y -= 14;

    page.drawText(
      receipt.receipt_kind === 'balance_payment' ? 'BALANCE RECEIPT' : 'OFFICIAL RECEIPT',
      { x: M, y, size: 8, font: monoBold, color: ink }
    );
    drawRightText(page, receipt.receipt_code, W - M, y, monoBold, 8.5, brandRgb);
    y -= 11;

    page.drawText(formatLagosDateTime(receipt.issued_at), {
      x: M,
      y,
      size: 7,
      font: mono,
      color: muted,
    });
    y -= 11;

    page.drawText(`Customer: ${receipt.customer_name}`, {
      x: M,
      y,
      size: 8,
      font: sans,
      color: ink,
    });
    y -= 10;

    if (receipt.sold_by) {
      page.drawText(`Sold by: ${receipt.sold_by}`, {
        x: M,
        y,
        size: 7.5,
        font: sans,
        color: muted,
      });
      y -= 10;
    }

    y -= 2;
    page.drawLine({
      start: { x: M, y },
      end: { x: W - M, y },
      thickness: 0.75,
      dashArray: [2, 2],
      color: muted,
    });
    y -= 12;

    for (const item of receipt.line_items) {
      const descLines = wrapText(item.description, sansBold, 8, contentW);
      for (const dl of descLines) {
        page.drawText(dl, { x: M, y, size: 8, font: sansBold, color: ink });
        y -= 10;
      }
      const qtyStr = `${item.quantity} ${item.unit} × ${formatNaira(item.unit_price_kobo)}`;
      page.drawText(qtyStr, { x: M, y, size: 7.5, font: mono, color: muted });
      drawRightText(page, formatNaira(item.line_total_kobo), W - M, y, monoBold, 8, ink);
      y -= 12;
    }

    page.drawLine({
      start: { x: M, y },
      end: { x: W - M, y },
      thickness: 0.75,
      dashArray: [2, 2],
      color: muted,
    });
    y -= 12;

    if (receipt.discount_kobo > 0) {
      page.drawText('Discount', { x: M, y, size: 7.5, font: sans, color: muted });
      drawRightText(page, `-${formatNaira(receipt.discount_kobo)}`, W - M, y, mono, 7.5, muted);
      y -= 10;
    }
    if (receipt.tax_kobo > 0) {
      page.drawText('VAT (7.5%)', { x: M, y, size: 7.5, font: sans, color: muted });
      drawRightText(page, formatNaira(receipt.tax_kobo), W - M, y, mono, 7.5, muted);
      y -= 10;
    }

    page.drawText('TOTAL', { x: M, y, size: 9, font: sansBold, color: ink });
    drawRightText(page, formatNaira(receipt.total_kobo), W - M, y, monoBold, 9.5, ink);
    y -= 12;

    page.drawText(`Paid (${formatPaymentMethod(receipt.payment_method)})`, {
      x: M,
      y,
      size: 7.5,
      font: sans,
      color: muted,
    });
    drawRightText(page, formatNaira(receipt.amount_paid_kobo), W - M, y, mono, 8, ink);
    y -= 11;

    if (receipt.balance_due_kobo > 0) {
      page.drawText('Balance at issue', { x: M, y, size: 7.5, font: sansBold, color: amber });
      drawRightText(
        page,
        formatNaira(receipt.balance_due_kobo),
        W - M,
        y,
        monoBold,
        8,
        amber
      );
      y -= 11;
    }

    y -= 2;
    for (const wLine of wrapText(amountInWordsNGN(receipt.total_kobo), sans, 7, contentW)) {
      page.drawText(wLine, { x: M, y, size: 7, font: sans, color: muted });
      y -= 9;
    }

    if (isVoid && receipt.void_reason) {
      y -= 4;
      for (const vl of wrapText(`VOID REASON: ${receipt.void_reason}`, sansBold, 7.5, contentW)) {
        page.drawText(vl, { x: M, y, size: 7.5, font: sansBold, color: crimson });
        y -= 9;
      }
    }

    y -= 10;
    drawStamp(page, stampLabel, W / 2, y - 6, monoBold, stampColor, true);
    y -= 28;

    const qrSize = 54;
    page.drawImage(qrImage, {
      x: (W - qrSize) / 2,
      y: y - qrSize,
      width: qrSize,
      height: qrSize,
    });
    y -= qrSize + 10;

    if (business.receipt_footer_note) {
      for (const fl of wrapText(business.receipt_footer_note, sans, 7, contentW)) {
        const fw = sans.widthOfTextAtSize(fl, 7);
        page.drawText(fl, { x: (W - fw) / 2, y, size: 7, font: sans, color: muted });
        y -= 9;
      }
    }

    drawTallyMarkVector(page, M, y - 4, 8, brandRgb);
    page.drawText('Verified via Tallymark', {
      x: M + 12,
      y: y - 3,
      size: 7,
      font: sans,
      color: muted,
    });

    return await pdfDoc.save();
  }

  // A4 layout for Modern & Classic
  const W = 595.28;
  const H = 841.89;
  const M = 44;
  const contentW = W - M * 2;
  const page = pdfDoc.addPage([W, H]);

  if (template === 'classic') {
    page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: ivory });
    page.drawRectangle({
      x: 24,
      y: 24,
      width: W - 48,
      height: H - 48,
      borderColor: hairline,
      borderWidth: 1,
    });
  } else {
    page.drawRectangle({ x: 0, y: H - 10, width: W, height: 10, color: brandRgb });
  }

  let y = H - 56;

  // Header left: logo + business info
  let headerLeftX = M;
  if (logoImage) {
    const scaled = logoImage.scaleToFit(56, 56);
    page.drawImage(logoImage, {
      x: M,
      y: y - scaled.height + 10,
      width: scaled.width,
      height: scaled.height,
    });
    headerLeftX = M + scaled.width + 14;
  }

  const titleFont = template === 'classic' ? serif : sansBold;
  const titleSize = template === 'classic' ? 24 : 18;
  page.drawText(business.name, {
    x: headerLeftX,
    y: y - 4,
    size: titleSize,
    font: titleFont,
    color: ink,
  });

  let metaY = y - 22;
  const bizLines = [
    business.address,
    [business.phone, business.email].filter(Boolean).join(' · '),
    [business.rc_number ? `RC: ${business.rc_number}` : '', business.tax_id ? `TIN: ${business.tax_id}` : '']
      .filter(Boolean)
      .join(' · '),
  ].filter(Boolean) as string[];

  for (const bl of bizLines) {
    for (const wrapped of wrapText(bl, sans, 9, 270)) {
      page.drawText(wrapped, { x: headerLeftX, y: metaY, size: 9, font: sans, color: muted });
      metaY -= 12;
    }
  }

  // Header right: Receipt title + number
  const docLabel =
    receipt.receipt_kind === 'balance_payment' ? 'BALANCE RECEIPT' : 'OFFICIAL RECEIPT';
  drawRightText(page, docLabel, W - M, y, monoBold, 9.5, brandRgb);
  drawRightText(page, receipt.receipt_code, W - M, y - 20, monoBold, 16, ink);
  drawRightText(
    page,
    formatLagosDateTime(receipt.issued_at),
    W - M,
    y - 35,
    mono,
    8.5,
    muted
  );

  y = Math.min(metaY, y - 54) - 18;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: hairline });
  y -= 22;

  // Customer & Meta Grid
  page.drawText('ISSUED TO', { x: M, y, size: 8, font: monoBold, color: muted });
  page.drawText('PAYMENT METHOD', { x: M + 250, y, size: 8, font: monoBold, color: muted });
  if (receipt.sold_by) {
    drawRightText(page, 'SOLD BY', W - M, y, monoBold, 8, muted);
  }
  y -= 15;

  page.drawText(receipt.customer_name, { x: M, y, size: 12, font: sansBold, color: ink });
  page.drawText(formatPaymentMethod(receipt.payment_method), {
    x: M + 250,
    y,
    size: 11,
    font: sansBold,
    color: ink,
  });
  if (receipt.sold_by) {
    drawRightText(page, receipt.sold_by, W - M, y, sans, 11, ink);
  }
  y -= 16;

  if (receipt.parent_receipt_code) {
    page.drawText(`Linked to receipt ${receipt.parent_receipt_code}`, {
      x: M,
      y,
      size: 9,
      font: mono,
      color: brandRgb,
    });
    y -= 16;
  }

  y -= 10;

  // Table header
  const colDescX = M + 8;
  const colQtyRight = M + 315;
  const colRateRight = M + 410;
  const colAmtRight = W - M - 8;

  page.drawRectangle({
    x: M,
    y: y - 6,
    width: contentW,
    height: 24,
    color: template === 'modern' ? rgb(0.95, 0.96, 0.95) : rgb(0.94, 0.92, 0.87),
  });

  page.drawText('DESCRIPTION', { x: colDescX, y: y + 2, size: 8, font: monoBold, color: muted });
  drawRightText(page, 'QTY', colQtyRight, y + 2, monoBold, 8, muted);
  drawRightText(page, 'UNIT PRICE', colRateRight, y + 2, monoBold, 8, muted);
  drawRightText(page, 'AMOUNT', colAmtRight, y + 2, monoBold, 8, muted);
  y -= 24;

  // Line items
  for (const item of receipt.line_items) {
    const descLines = wrapText(item.description, sans, 10, 225);
    const rowHeight = Math.max(24, descLines.length * 14 + 10);

    for (let i = 0; i < descLines.length; i++) {
      page.drawText(descLines[i], {
        x: colDescX,
        y: y - i * 14,
        size: 10,
        font: i === 0 ? sansBold : sans,
        color: ink,
      });
    }

    drawRightText(
      page,
      `${item.quantity} ${item.unit}`,
      colQtyRight,
      y,
      mono,
      9.5,
      muted
    );
    drawRightText(
      page,
      formatNaira(item.unit_price_kobo),
      colRateRight,
      y,
      mono,
      9.5,
      muted
    );
    drawRightText(
      page,
      formatNaira(item.line_total_kobo),
      colAmtRight,
      y,
      monoBold,
      10,
      ink
    );

    y -= rowHeight;
    page.drawLine({
      start: { x: M, y: y + 8 },
      end: { x: W - M, y: y + 8 },
      thickness: 0.6,
      color: hairline,
    });
  }

  y -= 16;

  // Bottom summary: Stamp + Amount in words on left, Totals on right
  const summaryTopY = y;

  // Totals right side
  const labelX = W - M - 210;
  const valRight = W - M;
  let ty = summaryTopY;

  page.drawText('Subtotal', { x: labelX, y: ty, size: 9.5, font: sans, color: muted });
  drawRightText(page, formatNaira(receipt.subtotal_kobo), valRight, ty, mono, 9.5, ink);
  ty -= 16;

  if (receipt.discount_kobo > 0) {
    page.drawText('Discount', { x: labelX, y: ty, size: 9.5, font: sans, color: muted });
    drawRightText(
      page,
      `-${formatNaira(receipt.discount_kobo)}`,
      valRight,
      ty,
      mono,
      9.5,
      muted
    );
    ty -= 16;
  }

  if (receipt.tax_kobo > 0) {
    page.drawText('VAT (7.5%)', { x: labelX, y: ty, size: 9.5, font: sans, color: muted });
    drawRightText(page, formatNaira(receipt.tax_kobo), valRight, ty, mono, 9.5, ink);
    ty -= 16;
  }

  page.drawLine({ start: { x: labelX, y: ty + 6 }, end: { x: valRight, y: ty + 6 }, thickness: 1, color: hairline });
  ty -= 10;

  page.drawText('Total', { x: labelX, y: ty, size: 11, font: sansBold, color: ink });
  drawRightText(page, formatNaira(receipt.total_kobo), valRight, ty, monoBold, 12.5, ink);
  ty -= 18;

  page.drawText('Amount Paid', { x: labelX, y: ty, size: 9.5, font: sans, color: muted });
  drawRightText(page, formatNaira(receipt.amount_paid_kobo), valRight, ty, monoBold, 10, brandRgb);
  ty -= 16;

  if (receipt.balance_due_kobo > 0) {
    page.drawText('Balance Due', { x: labelX, y: ty, size: 9.5, font: sansBold, color: amber });
    drawRightText(
      page,
      formatNaira(receipt.balance_due_kobo),
      valRight,
      ty,
      monoBold,
      10.5,
      amber
    );
    ty -= 16;
  }

  // Left side: Stamp + Amount in words
  drawStamp(page, stampLabel, M + 56, summaryTopY - 18, monoBold, stampColor, false);

  let leftY = summaryTopY - 62;
  page.drawText('AMOUNT IN WORDS', { x: M, y: leftY, size: 7.5, font: monoBold, color: muted });
  leftY -= 13;
  for (const wLine of wrapText(amountInWordsNGN(receipt.total_kobo), sans, 9.5, 250)) {
    page.drawText(wLine, { x: M, y: leftY, size: 9.5, font: sans, color: ink });
    leftY -= 13;
  }

  if (receipt.notes) {
    leftY -= 6;
    page.drawText('NOTES', { x: M, y: leftY, size: 7.5, font: monoBold, color: muted });
    leftY -= 12;
    for (const nLine of wrapText(receipt.notes, sans, 9, 250)) {
      page.drawText(nLine, { x: M, y: leftY, size: 9, font: sans, color: muted });
      leftY -= 12;
    }
  }

  if (isVoid && receipt.void_reason) {
    leftY -= 8;
    for (const vLine of wrapText(`VOID REASON: ${receipt.void_reason}`, sansBold, 9, 260)) {
      page.drawText(vLine, { x: M, y: leftY, size: 9, font: sansBold, color: crimson });
      leftY -= 12;
    }
  }

  // Footer with QR code and Tallymark signature
  const footerY = 58;
  page.drawLine({
    start: { x: M, y: footerY + 56 },
    end: { x: W - M, y: footerY + 56 },
    thickness: 0.75,
    color: hairline,
  });

  page.drawImage(qrImage, {
    x: W - M - 52,
    y: footerY - 6,
    width: 52,
    height: 52,
  });

  if (business.receipt_footer_note) {
    const footerLines = wrapText(business.receipt_footer_note, sans, 8.5, contentW - 72).slice(0, 2);
    let fy = footerY + 34;
    for (const fl of footerLines) {
      page.drawText(fl, {
        x: M,
        y: fy,
        size: 8.5,
        font: sans,
        color: ink,
      });
      fy -= 11;
    }
  }

  drawTallyMarkVector(page, M, footerY + 2, 11, brandRgb);
  page.drawText('Issued & verified with Tallymark', {
    x: M + 18,
    y: footerY + 4,
    size: 8.5,
    font: sans,
    color: muted,
  });
  page.drawText(publicUrl, {
    x: M,
    y: footerY - 10,
    size: 7.5,
    font: mono,
    color: muted,
  });

  return await pdfDoc.save();
}

export function downloadPdfBlob(bytes: Uint8Array, filename: string) {
  const blob = new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
