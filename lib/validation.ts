import { z } from 'zod';

export const bankAccountSchema = z.object({
  id: z.string().min(1),
  bank_name: z.string().trim().min(2, 'Bank name is required').max(80),
  account_name: z.string().trim().min(2, 'Account name is required').max(120),
  account_number: z
    .string()
    .trim()
    .regex(/^\d{10}$/, 'Account number must be 10 digits'),
});

export const businessProfileSchema = z.object({
  name: z.string().trim().min(2, 'Business name is required').max(120),
  phone: z.string().trim().max(30).optional().nullable(),
  email: z
    .string()
    .trim()
    .email('Enter a valid email')
    .optional()
    .or(z.literal(''))
    .nullable(),
  address: z.string().trim().max(240).optional().nullable(),
  rc_number: z.string().trim().max(40).optional().nullable(),
  tax_id: z.string().trim().max(40).optional().nullable(),
  brand_color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, 'Brand color must be a hex color like #0F5132'),
  receipt_prefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{1,10}$/, 'Use 1–10 uppercase letters, numbers, or hyphen'),
  invoice_prefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{1,10}$/, 'Use 1–10 uppercase letters, numbers, or hyphen'),
  quote_prefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9-]{1,10}$/, 'Use 1–10 uppercase letters, numbers, or hyphen'),
  receipt_template: z.enum(['modern', 'classic', 'thermal']),
  receipt_footer_note: z.string().trim().max(200).optional().nullable(),
  currency: z.literal('NGN').default('NGN'),
  vat_enabled: z.boolean().default(false),
  vat_mode: z.enum(['exclusive', 'inclusive']).default('exclusive'),
  vat_rate_bps: z.number().int().min(0).max(5000).default(750),
  bank_accounts: z.array(bankAccountSchema).max(10).default([]),
  default_payment_terms: z.string().trim().max(160).optional().nullable(),
  default_invoice_notes: z.string().trim().max(300).optional().nullable(),
  opening_cash_balance_kobo: z.number().int().min(0).default(0),
  close_day_reminder_time: z
    .string()
    .regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/, 'Reminder time must be HH:MM')
    .default('19:00'),
});

export const receiptLineItemInputSchema = z.object({
  item_id: z.string().uuid().optional().nullable(),
  description: z.string().trim().min(1, 'Item description is required').max(160),
  quantity: z.number().positive('Quantity must be greater than 0').max(1000000),
  unit: z.string().trim().min(1).max(30).default('unit'),
  unit_price_kobo: z.number().int().min(0, 'Unit price cannot be negative'),
  discount_kobo: z.number().int().min(0).default(0),
});

export const issueReceiptInputSchema = z.object({
  business_id: z.string().uuid(),
  customer_id: z.string().uuid().optional().nullable(),
  customer_name: z.string().trim().max(120).default('Walk-in Customer'),
  customer_phone: z.string().trim().max(30).optional().nullable(),
  line_items: z.array(receiptLineItemInputSchema).min(1, 'Add at least one item'),
  discount_kobo: z.number().int().min(0).default(0),
  tax_kobo: z.number().int().min(0).default(0),
  amount_paid_kobo: z.number().int().min(0),
  payment_method: z.enum(['cash', 'transfer', 'pos', 'card', 'credit', 'other']),
  notes: z.string().trim().max(300).optional().nullable(),
  sold_by: z.string().trim().max(80).optional().nullable(),
  due_date: z.string().optional().nullable(),
  issued_at: z.string().optional().nullable(),
  source: z.enum(['manual', 'voice']).default('manual'),
});

export const recordPaymentInputSchema = z.object({
  receipt_id: z.string().uuid(),
  amount_kobo: z.number().int().positive('Payment amount must be greater than 0'),
  payment_method: z.enum(['cash', 'transfer', 'pos', 'card', 'other']),
  notes: z.string().trim().max(240).optional().nullable(),
  sold_by: z.string().trim().max(80).optional().nullable(),
});

export const voidReceiptInputSchema = z.object({
  receipt_id: z.string().uuid(),
  reason: z.string().trim().min(3, 'Please provide a reason (at least 3 characters)').max(240),
});

export const quickSaleInputSchema = z.object({
  business_id: z.string().uuid(),
  amount_kobo: z.number().int().positive('Enter an amount greater than ₦0'),
  payment_method: z.enum(['cash', 'transfer', 'pos', 'card', 'other']),
  description: z.string().trim().max(200).optional().nullable(),
  customer_id: z.string().uuid().optional().nullable(),
  customer_name: z.string().trim().max(120).optional().nullable(),
  sold_by: z.string().trim().max(80).optional().nullable(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const quickCreditSaleInputSchema = z.object({
  business_id: z.string().uuid(),
  amount_kobo: z.number().int().positive('Enter an amount greater than ₦0'),
  customer_name: z.string().trim().min(1, 'Customer name is required').max(120),
  customer_phone: z.string().trim().max(30).optional().nullable(),
  customer_id: z.string().uuid().optional().nullable(),
  description: z.string().trim().max(200).optional().nullable(),
  due_date: z.string().optional().nullable(),
  sold_by: z.string().trim().max(80).optional().nullable(),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const expenseInputSchema = z.object({
  business_id: z.string().uuid(),
  amount_kobo: z.number().int().positive('Expense amount must be greater than ₦0'),
  category: z.string().trim().min(1, 'Select or enter a category').max(60),
  payee: z.string().trim().max(120).optional().nullable(),
  payment_method: z.enum(['cash', 'transfer', 'pos', 'card', 'other']),
  description: z.string().trim().min(1, 'Enter a short description or note').max(240),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const creditorInputSchema = z.object({
  business_id: z.string().uuid(),
  supplier_name: z.string().trim().min(1, 'Supplier name is required').max(120),
  supplier_phone: z.string().trim().max(30).optional().nullable(),
  description: z.string().trim().max(200).optional().nullable(),
  original_amount_kobo: z.number().int().positive('Amount owed must be greater than ₦0'),
  due_date: z.string().optional().nullable(),
  notes: z.string().trim().max(300).optional().nullable(),
});

export const closeDayInputSchema = z.object({
  business_id: z.string().uuid(),
  closure_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  actual_cash_counted_kobo: z.number().int().min(0, 'Counted cash cannot be negative'),
  notes: z.string().trim().max(300).optional().nullable(),
});
