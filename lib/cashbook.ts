import type {
  Customer,
  DayClosure,
  Debt,
  LedgerEntry,
  PaymentMethod,
  Receipt,
} from './database.types';
import {
  daysBetweenDates,
  formatLagosDate,
  formatNaira,
  todayInLagosDate,
} from './format';

export const EXPENSE_PRESET_CATEGORIES = [
  'Stock',
  'Rent',
  'Transport',
  'Salaries',
  'Utilities',
  'Marketing',
  'Other',
] as const;

export interface EntryCashEffect {
  soldKobo: number;
  receiptSaleKobo: number;
  quickSaleKobo: number;
  creditSaleKobo: number;
  paymentReceivedKobo: number;
  moneyInKobo: number;
  moneyOutKobo: number;
  expenseKobo: number;
  adjustmentDeltaKobo: number;
  cashDeltaKobo: number;
  transferDeltaKobo: number;
  posDeltaKobo: number;
  cardOtherDeltaKobo: number;
  isCreditSale: boolean;
  isQuickSale: boolean;
  isVoidReversal: boolean;
}

export function calculateEntryCashEffect(
  entry: LedgerEntry,
  receiptMap: Record<string, Receipt>
): EntryCashEffect {
  const receipt = entry.receipt_id ? receiptMap[entry.receipt_id] : undefined;

  let soldKobo = 0;
  let receiptSaleKobo = 0;
  let quickSaleKobo = 0;
  let creditSaleKobo = 0;
  let paymentReceivedKobo = 0;
  let moneyInKobo = 0;
  let moneyOutKobo = 0;
  let expenseKobo = 0;
  let adjustmentDeltaKobo = 0;
  let isCreditSale = false;
  let isQuickSale = false;
  let isVoidReversal = false;

  if (entry.type === 'sale') {
    soldKobo = entry.amount_kobo;
    if (entry.receipt_id) {
      receiptSaleKobo = entry.amount_kobo;
      moneyInKobo = receipt ? receipt.amount_paid_kobo : entry.amount_kobo;
    } else if (entry.is_credit_sale || entry.payment_method === 'credit') {
      isCreditSale = true;
      creditSaleKobo = entry.amount_kobo;
      moneyInKobo = 0;
    } else {
      isQuickSale = true;
      quickSaleKobo = entry.amount_kobo;
      moneyInKobo = entry.amount_kobo;
    }
  } else if (entry.type === 'payment_received') {
    paymentReceivedKobo = entry.amount_kobo;
    moneyInKobo = entry.amount_kobo;
  } else if (entry.type === 'expense') {
    expenseKobo = entry.amount_kobo;
    moneyOutKobo = entry.amount_kobo;
  } else if (entry.type === 'adjustment') {
    if (entry.receipt_id && receipt && receipt.status === 'void') {
      isVoidReversal = true;
      soldKobo = -receipt.total_kobo;
      moneyOutKobo = receipt.amount_paid_kobo;
      adjustmentDeltaKobo = -receipt.amount_paid_kobo;
    } else {
      adjustmentDeltaKobo = entry.amount_kobo;
      if (entry.amount_kobo > 0) {
        moneyInKobo = entry.amount_kobo;
      } else {
        moneyOutKobo = Math.abs(entry.amount_kobo);
      }
    }
  }

  const netChannelDelta = moneyInKobo - moneyOutKobo;
  const cashDeltaKobo = entry.payment_method === 'cash' ? netChannelDelta : 0;
  const transferDeltaKobo = entry.payment_method === 'transfer' ? netChannelDelta : 0;
  const posDeltaKobo = entry.payment_method === 'pos' ? netChannelDelta : 0;
  const cardOtherDeltaKobo =
    entry.payment_method === 'card' || entry.payment_method === 'other' ? netChannelDelta : 0;

  return {
    soldKobo,
    receiptSaleKobo,
    quickSaleKobo,
    creditSaleKobo,
    paymentReceivedKobo,
    moneyInKobo,
    moneyOutKobo,
    expenseKobo,
    adjustmentDeltaKobo,
    cashDeltaKobo,
    transferDeltaKobo,
    posDeltaKobo,
    cardOtherDeltaKobo,
    isCreditSale,
    isQuickSale,
    isVoidReversal,
  };
}

export interface CashBookRow {
  entry: LedgerEntry;
  effect: EntryCashEffect;
  runningCashKobo: number;
  runningBankPosKobo: number;
  runningTotalKobo: number;
  linkedReceipt: Receipt | null;
}

export interface DailyCashBookSummary {
  date: string;
  openingCashKobo: number;
  openingBankPosKobo: number;
  openingTotalKobo: number;
  totalSoldKobo: number;
  receiptSalesKobo: number;
  quickSalesKobo: number;
  creditSalesKobo: number;
  paymentsReceivedKobo: number;
  moneyInTotalKobo: number;
  moneyOutTotalKobo: number;
  expensesKobo: number;
  adjustmentsCashImpactKobo: number;
  netCashBookKobo: number;
  cashInKobo: number;
  cashOutKobo: number;
  transferInKobo: number;
  transferOutKobo: number;
  posInKobo: number;
  posOutKobo: number;
  otherInKobo: number;
  otherOutKobo: number;
  expectedClosingCashKobo: number;
  closingBankPosKobo: number;
  closingTotalKobo: number;
}

export function computeDailyCashBook(params: {
  businessOpeningCashKobo: number;
  entries: LedgerEntry[];
  receipts: Receipt[];
  date: string;
}): {
  rows: CashBookRow[];
  summary: DailyCashBookSummary;
} {
  const { businessOpeningCashKobo, entries, receipts, date } = params;
  const receiptMap: Record<string, Receipt> = {};
  for (const r of receipts) {
    receiptMap[r.id] = r;
  }

  let openingCashKobo = businessOpeningCashKobo;
  let openingBankPosKobo = 0;

  const dayEntries: LedgerEntry[] = [];

  for (const entry of entries) {
    if (entry.entry_date < date) {
      const eff = calculateEntryCashEffect(entry, receiptMap);
      openingCashKobo += eff.cashDeltaKobo;
      openingBankPosKobo += eff.transferDeltaKobo + eff.posDeltaKobo + eff.cardOtherDeltaKobo;
    } else if (entry.entry_date === date) {
      dayEntries.push(entry);
    }
  }

  // Chronological order for running balance
  dayEntries.sort((a, b) => a.occurred_at.localeCompare(b.occurred_at));

  const openingTotalKobo = openingCashKobo + openingBankPosKobo;
  let runningCashKobo = openingCashKobo;
  let runningBankPosKobo = openingBankPosKobo;

  let totalSoldKobo = 0;
  let receiptSalesKobo = 0;
  let quickSalesKobo = 0;
  let creditSalesKobo = 0;
  let paymentsReceivedKobo = 0;
  let moneyInTotalKobo = 0;
  let moneyOutTotalKobo = 0;
  let expensesKobo = 0;
  let adjustmentsCashImpactKobo = 0;
  let cashInKobo = 0;
  let cashOutKobo = 0;
  let transferInKobo = 0;
  let transferOutKobo = 0;
  let posInKobo = 0;
  let posOutKobo = 0;
  let otherInKobo = 0;
  let otherOutKobo = 0;

  const rows: CashBookRow[] = dayEntries.map((entry) => {
    const effect = calculateEntryCashEffect(entry, receiptMap);

    runningCashKobo += effect.cashDeltaKobo;
    runningBankPosKobo +=
      effect.transferDeltaKobo + effect.posDeltaKobo + effect.cardOtherDeltaKobo;

    totalSoldKobo += effect.soldKobo;
    receiptSalesKobo += effect.receiptSaleKobo;
    quickSalesKobo += effect.quickSaleKobo;
    creditSalesKobo += effect.creditSaleKobo;
    paymentsReceivedKobo += effect.paymentReceivedKobo;
    moneyInTotalKobo += effect.moneyInKobo;
    moneyOutTotalKobo += effect.moneyOutKobo;
    expensesKobo += effect.expenseKobo;
    adjustmentsCashImpactKobo += effect.adjustmentDeltaKobo;

    if (entry.payment_method === 'cash') {
      cashInKobo += effect.moneyInKobo;
      cashOutKobo += effect.moneyOutKobo;
    } else if (entry.payment_method === 'transfer') {
      transferInKobo += effect.moneyInKobo;
      transferOutKobo += effect.moneyOutKobo;
    } else if (entry.payment_method === 'pos') {
      posInKobo += effect.moneyInKobo;
      posOutKobo += effect.moneyOutKobo;
    } else if (entry.payment_method === 'card' || entry.payment_method === 'other') {
      otherInKobo += effect.moneyInKobo;
      otherOutKobo += effect.moneyOutKobo;
    }

    return {
      entry,
      effect,
      runningCashKobo,
      runningBankPosKobo,
      runningTotalKobo: runningCashKobo + runningBankPosKobo,
      linkedReceipt: entry.receipt_id ? receiptMap[entry.receipt_id] ?? null : null,
    };
  });

  return {
    rows,
    summary: {
      date,
      openingCashKobo,
      openingBankPosKobo,
      openingTotalKobo,
      totalSoldKobo,
      receiptSalesKobo,
      quickSalesKobo,
      creditSalesKobo,
      paymentsReceivedKobo,
      moneyInTotalKobo,
      moneyOutTotalKobo,
      expensesKobo,
      adjustmentsCashImpactKobo,
      netCashBookKobo: moneyInTotalKobo - moneyOutTotalKobo,
      cashInKobo,
      cashOutKobo,
      transferInKobo,
      transferOutKobo,
      posInKobo,
      posOutKobo,
      otherInKobo,
      otherOutKobo,
      expectedClosingCashKobo: runningCashKobo,
      closingBankPosKobo: runningBankPosKobo,
      closingTotalKobo: runningCashKobo + runningBankPosKobo,
    },
  };
}

export interface DebtorCustomerGroup {
  key: string;
  customerId: string | null;
  customerName: string;
  customerPhone: string | null;
  totalOwedKobo: number;
  totalOriginalKobo: number;
  totalPaidKobo: number;
  openCount: number;
  oldestOpenDate: string | null;
  oldestAgeDays: number;
  debts: Debt[];
  paymentHistory: LedgerEntry[];
}

export function computeDebtCustomerSummaries(
  debts: Debt[],
  entries: LedgerEntry[],
  referenceDate: string = todayInLagosDate()
): DebtorCustomerGroup[] {
  const groups = new Map<string, DebtorCustomerGroup>();

  for (const d of debts) {
    if (d.status === 'void') continue;
    const normName = d.customer_name.trim().toLowerCase();
    const key = d.customer_id ? `id:${d.customer_id}` : `name:${normName}`;
    let grp = groups.get(key);
    if (!grp) {
      grp = {
        key,
        customerId: d.customer_id,
        customerName: d.customer_name,
        customerPhone: d.customer_phone,
        totalOwedKobo: 0,
        totalOriginalKobo: 0,
        totalPaidKobo: 0,
        openCount: 0,
        oldestOpenDate: null,
        oldestAgeDays: 0,
        debts: [],
        paymentHistory: [],
      };
      groups.set(key, grp);
    }

    if (!grp.customerPhone && d.customer_phone) {
      grp.customerPhone = d.customer_phone;
    }

    grp.debts.push(d);
    grp.totalOriginalKobo += d.original_amount_kobo;
    grp.totalPaidKobo += d.amount_paid_kobo;

    if (d.balance_kobo > 0 && (d.status === 'open' || d.status === 'partial')) {
      grp.totalOwedKobo += d.balance_kobo;
      grp.openCount += 1;
      const createdYmd = d.created_at.slice(0, 10);
      if (!grp.oldestOpenDate || createdYmd < grp.oldestOpenDate) {
        grp.oldestOpenDate = createdYmd;
      }
    }
  }

  const debtIdToKey = new Map<string, string>();
  for (const grp of groups.values()) {
    for (const d of grp.debts) {
      debtIdToKey.set(d.id, grp.key);
    }
    if (grp.oldestOpenDate) {
      grp.oldestAgeDays = daysBetweenDates(grp.oldestOpenDate, referenceDate);
    }
    grp.debts.sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  for (const e of entries) {
    if (e.type === 'payment_received' && e.debt_id) {
      const k = debtIdToKey.get(e.debt_id);
      if (k) {
        groups.get(k)?.paymentHistory.push(e);
      }
    }
  }

  for (const grp of groups.values()) {
    grp.paymentHistory.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  }

  return Array.from(groups.values()).sort((a, b) => {
    if (b.totalOwedKobo !== a.totalOwedKobo) return b.totalOwedKobo - a.totalOwedKobo;
    return b.oldestAgeDays - a.oldestAgeDays;
  });
}

export interface ReportBreakdownRow {
  label: string;
  amountKobo: number;
  count: number;
}

export interface ReportDailyPoint {
  date: string;
  incomeKobo: number;
  expenseKobo: number;
  soldKobo: number;
}

export interface PeriodReportMetrics {
  startDate: string;
  endDate: string;
  soldTotalKobo: number;
  soldReceiptsKobo: number;
  soldQuickCashKobo: number;
  soldCreditKobo: number;
  receivedTotalKobo: number;
  expensesTotalKobo: number;
  adjustmentsNetKobo: number;
  netMoneyInMinusOutKobo: number;
  outstandingDebtsTotalKobo: number;
  byPaymentMethod: ReportBreakdownRow[];
  byExpenseCategory: ReportBreakdownRow[];
  bySoldBy: ReportBreakdownRow[];
  topCustomers: ReportBreakdownRow[];
  dailySeries: ReportDailyPoint[];
}

export function computeReportMetrics(params: {
  entries: LedgerEntry[];
  receipts: Receipt[];
  debts: Debt[];
  customers: Customer[];
  startDate: string;
  endDate: string;
}): PeriodReportMetrics {
  const { entries, receipts, debts, customers, startDate, endDate } = params;

  const receiptMap: Record<string, Receipt> = {};
  for (const r of receipts) receiptMap[r.id] = r;

  const customerMap: Record<string, string> = {};
  for (const c of customers) customerMap[c.id] = c.name;

  let soldReceiptsKobo = 0;
  let soldQuickCashKobo = 0;
  let soldCreditKobo = 0;
  let receivedTotalKobo = 0;
  let expensesTotalKobo = 0;
  let adjustmentsNetKobo = 0;

  const methodTotals = new Map<PaymentMethod, { amount: number; count: number }>();
  const categoryTotals = new Map<string, { amount: number; count: number }>();
  const staffTotals = new Map<string, { amount: number; count: number }>();
  const customerTotals = new Map<string, { amount: number; count: number }>();
  const dailyMap = new Map<string, ReportDailyPoint>();

  const ensureDay = (d: string) => {
    let pt = dailyMap.get(d);
    if (!pt) {
      pt = { date: d, incomeKobo: 0, expenseKobo: 0, soldKobo: 0 };
      dailyMap.set(d, pt);
    }
    return pt;
  };

  for (const entry of entries) {
    if (entry.entry_date < startDate || entry.entry_date > endDate) continue;
    const eff = calculateEntryCashEffect(entry, receiptMap);
    const dayPt = ensureDay(entry.entry_date);

    soldReceiptsKobo += eff.receiptSaleKobo;
    soldQuickCashKobo += eff.quickSaleKobo;
    soldCreditKobo += eff.creditSaleKobo;

    if (eff.isVoidReversal) {
      soldReceiptsKobo += eff.soldKobo;
    }

    receivedTotalKobo += eff.moneyInKobo;
    expensesTotalKobo += eff.expenseKobo;
    if (entry.type === 'adjustment') {
      adjustmentsNetKobo += eff.adjustmentDeltaKobo;
    }

    dayPt.soldKobo += eff.soldKobo;
    dayPt.incomeKobo += eff.moneyInKobo;
    dayPt.expenseKobo += eff.expenseKobo + (entry.type === 'adjustment' && eff.moneyOutKobo > 0 ? eff.moneyOutKobo : 0);

    // Received by payment method (inflows minus void reversals on that method)
    if (eff.moneyInKobo > 0 && entry.payment_method !== 'credit') {
      const prev = methodTotals.get(entry.payment_method) ?? { amount: 0, count: 0 };
      methodTotals.set(entry.payment_method, {
        amount: prev.amount + eff.moneyInKobo,
        count: prev.count + 1,
      });
    } else if (eff.isVoidReversal && eff.moneyOutKobo > 0) {
      const prev = methodTotals.get(entry.payment_method) ?? { amount: 0, count: 0 };
      methodTotals.set(entry.payment_method, {
        amount: prev.amount - eff.moneyOutKobo,
        count: prev.count,
      });
    }

    if (entry.type === 'expense') {
      const cat = entry.category?.trim() || 'Other';
      const prev = categoryTotals.get(cat) ?? { amount: 0, count: 0 };
      categoryTotals.set(cat, { amount: prev.amount + entry.amount_kobo, count: prev.count + 1 });
    }

    if (entry.type === 'sale' || entry.type === 'payment_received') {
      const staff = entry.sold_by?.trim() || 'Owner / Unassigned';
      const amt = eff.moneyInKobo;
      if (amt > 0) {
        const prev = staffTotals.get(staff) ?? { amount: 0, count: 0 };
        staffTotals.set(staff, { amount: prev.amount + amt, count: prev.count + 1 });
      }
    }

    if (entry.type === 'sale') {
      const rec = entry.receipt_id ? receiptMap[entry.receipt_id] : undefined;
      const custName =
        rec?.customer_name ||
        (entry.customer_id ? customerMap[entry.customer_id] : undefined) ||
        'Walk-in Customer';
      if (custName !== 'Walk-in Customer') {
        const prev = customerTotals.get(custName) ?? { amount: 0, count: 0 };
        customerTotals.set(custName, {
          amount: prev.amount + entry.amount_kobo,
          count: prev.count + 1,
        });
      }
    }
  }

  // Account for negative adjustments outside expenses in money out
  const extraOutFromAdjustments = entries
    .filter((e) => e.entry_date >= startDate && e.entry_date <= endDate && e.type === 'adjustment')
    .reduce((acc, e) => acc + calculateEntryCashEffect(e, receiptMap).moneyOutKobo, 0);

  const soldTotalKobo = soldReceiptsKobo + soldQuickCashKobo + soldCreditKobo;
  const netMoneyInMinusOutKobo = receivedTotalKobo - expensesTotalKobo - extraOutFromAdjustments;

  const outstandingDebtsTotalKobo = debts
    .filter((d) => d.status === 'open' || d.status === 'partial')
    .reduce((sum, d) => sum + d.balance_kobo, 0);

  const toSortedRows = (map: Map<string, { amount: number; count: number }>): ReportBreakdownRow[] =>
    Array.from(map.entries())
      .map(([label, v]) => ({ label, amountKobo: v.amount, count: v.count }))
      .sort((a, b) => b.amountKobo - a.amountKobo);

  const methodOrder: PaymentMethod[] = ['cash', 'transfer', 'pos', 'card', 'other'];
  const byPaymentMethod: ReportBreakdownRow[] = methodOrder
    .filter((m) => methodTotals.has(m))
    .map((m) => {
      const v = methodTotals.get(m)!;
      const label =
        m === 'cash'
          ? 'Cash'
          : m === 'transfer'
            ? 'Bank Transfer'
            : m === 'pos'
              ? 'POS'
              : m === 'card'
                ? 'Card'
                : 'Other';
      return { label, amountKobo: v.amount, count: v.count };
    });

  const dailySeries = Array.from(dailyMap.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  return {
    startDate,
    endDate,
    soldTotalKobo,
    soldReceiptsKobo,
    soldQuickCashKobo,
    soldCreditKobo,
    receivedTotalKobo,
    expensesTotalKobo: expensesTotalKobo + extraOutFromAdjustments,
    adjustmentsNetKobo,
    netMoneyInMinusOutKobo,
    outstandingDebtsTotalKobo,
    byPaymentMethod,
    byExpenseCategory: toSortedRows(categoryTotals),
    bySoldBy: toSortedRows(staffTotals),
    topCustomers: toSortedRows(customerTotals).slice(0, 10),
    dailySeries,
  };
}

export function buildDailySummaryWhatsAppMessage(params: {
  businessName: string;
  closure: DayClosure;
}): string {
  const { businessName, closure } = params;
  const variance = closure.variance_kobo ?? 0;
  const varianceText =
    variance === 0
      ? 'Exact match (₦0.00)'
      : variance > 0
        ? `Over by ${formatNaira(variance)}`
        : `Short by ${formatNaira(Math.abs(variance))}`;

  return [
    `*${businessName} — Daily Summary*`,
    `Date: ${formatLagosDate(`${closure.closure_date}T12:00:00+01:00`)}`,
    ``,
    `Total Sales: ${formatNaira(closure.total_sales_kobo)}`,
    `• Receipted sales: ${formatNaira(closure.total_receipt_sales_kobo)}`,
    `• Quick sales: ${formatNaira(closure.total_quick_sales_kobo)}`,
    `• Credit given: ${formatNaira(closure.total_credit_sales_kobo)}`,
    `Debt payments received: ${formatNaira(closure.total_payments_received_kobo)}`,
    `Expenses: ${formatNaira(closure.total_expenses_kobo)}`,
    ``,
    `Cash in: ${formatNaira(closure.cash_in_kobo)} | Cash out: ${formatNaira(closure.cash_out_kobo)}`,
    `Transfer in: ${formatNaira(closure.transfer_in_kobo)} | POS in: ${formatNaira(closure.pos_in_kobo)}`,
    `*Net (money in minus money out): ${formatNaira(closure.net_cash_book_kobo)}*`,
    ``,
    `Expected Cash in Hand: ${formatNaira(closure.expected_cash_kobo)}`,
    `Counted Cash: ${formatNaira(closure.actual_cash_counted_kobo ?? closure.expected_cash_kobo)}`,
    `Over / Short: ${varianceText}`,
    closure.notes ? `Note: ${closure.notes}` : '',
    ``,
    `Closed via Tallymark`,
  ]
    .filter((line) => line !== undefined)
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');
}

export function buildDebtReminderWhatsAppMessage(params: {
  businessName: string;
  customerName: string;
  amountOwedKobo: number;
  oldestAgeDays: number;
}): string {
  const { businessName, customerName, amountOwedKobo, oldestAgeDays } = params;
  const ageLine =
    oldestAgeDays > 0
      ? ` (pending for ${oldestAgeDays} ${oldestAgeDays === 1 ? 'day' : 'days'})`
      : '';
  return [
    `Hello ${customerName},`,
    `Warm greetings from *${businessName}*.`,
    `This is a polite reminder regarding your outstanding balance of *${formatNaira(amountOwedKobo)}*${ageLine}.`,
    `Please let us know when it will be convenient to settle. Thank you for your patronage.`,
  ].join('\n');
}
