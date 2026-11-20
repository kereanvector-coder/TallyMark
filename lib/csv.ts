import type { LedgerEntry, Receipt } from './database.types';
import { calculateEntryCashEffect, type DebtorCustomerGroup } from './cashbook';
import { formatLagosDateTime, formatNaira, formatPaymentMethod } from './format';

export function escapeCsvCell(value: string | number | boolean | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsvString(
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>
): string {
  const headerLine = headers.map(escapeCsvCell).join(',');
  const bodyLines = rows.map((row) => row.map(escapeCsvCell).join(','));
  // Prefix UTF-8 BOM so Excel opens ₦ (U+20A6) cleanly
  return '\uFEFF' + [headerLine, ...bodyLines].join('\r\n');
}

export function downloadCsvFile(csvContent: string, filename: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function buildReceiptsCsv(receipts: Receipt[]): string {
  const headers = [
    'Date (WAT)',
    'Receipt Code',
    'Kind',
    'Customer',
    'Phone',
    'Payment Method',
    'Status',
    'Total (NGN)',
    'Amount Paid (NGN)',
    'Balance Due (NGN)',
    'Sold By',
    'Notes',
  ];
  const rows = receipts.map((r) => [
    formatLagosDateTime(r.issued_at),
    r.receipt_code,
    r.receipt_kind === 'balance_payment' ? 'Balance Payment' : 'Sale',
    r.customer_name,
    r.customer_phone ?? '',
    formatPaymentMethod(r.payment_method),
    r.status.toUpperCase(),
    formatNaira(r.total_kobo),
    formatNaira(r.amount_paid_kobo),
    formatNaira(r.balance_due_kobo),
    r.sold_by ?? '',
    r.notes ?? '',
  ]);
  return toCsvString(headers, rows);
}

export function buildExpensesCsv(entries: LedgerEntry[]): string {
  const headers = [
    'Entry Date',
    'Time (WAT)',
    'Category',
    'Payee',
    'Description',
    'Payment Method',
    'Amount (NGN)',
    'Has Proof',
  ];
  const rows = entries
    .filter((e) => e.type === 'expense')
    .map((e) => [
      e.entry_date,
      formatLagosDateTime(e.occurred_at),
      e.category ?? 'Other',
      e.payee ?? '',
      e.description,
      formatPaymentMethod(e.payment_method),
      formatNaira(e.amount_kobo),
      e.proof_path ? 'Yes' : 'No',
    ]);
  return toCsvString(headers, rows);
}

export function buildLedgerCsv(entries: LedgerEntry[], receipts: Receipt[]): string {
  const receiptMap: Record<string, Receipt> = {};
  for (const r of receipts) receiptMap[r.id] = r;

  const headers = [
    'Entry Date',
    'Time (WAT)',
    'Type',
    'Category',
    'Description',
    'Payment Method',
    'Sold (NGN)',
    'Money In (NGN)',
    'Money Out (NGN)',
    'Sold By',
  ];
  const rows = entries.map((e) => {
    const eff = calculateEntryCashEffect(e, receiptMap);
    return [
      e.entry_date,
      formatLagosDateTime(e.occurred_at),
      e.type,
      e.category ?? '',
      e.description,
      formatPaymentMethod(e.payment_method),
      eff.soldKobo !== 0 ? formatNaira(eff.soldKobo) : '',
      eff.moneyInKobo > 0 ? formatNaira(eff.moneyInKobo) : '',
      eff.moneyOutKobo > 0 ? formatNaira(eff.moneyOutKobo) : '',
      e.sold_by ?? '',
    ];
  });
  return toCsvString(headers, rows);
}

export function buildDebtorsCsv(groups: DebtorCustomerGroup[]): string {
  const headers = [
    'Customer',
    'Phone',
    'Open Balances',
    'Oldest Unpaid Date',
    'Oldest Age (Days)',
    'Total Billed (NGN)',
    'Total Paid (NGN)',
    'Total Owed (NGN)',
  ];
  const rows = groups.map((g) => [
    g.customerName,
    g.customerPhone ?? '',
    g.openCount,
    g.oldestOpenDate ?? '',
    g.oldestAgeDays,
    formatNaira(g.totalOriginalKobo),
    formatNaira(g.totalPaidKobo),
    formatNaira(g.totalOwedKobo),
  ]);
  return toCsvString(headers, rows);
}
