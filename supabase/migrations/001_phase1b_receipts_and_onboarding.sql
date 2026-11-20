-- ============================================================================
-- TALLYMARK — MIGRATION 001: PHASE 1B RECEIPTS, ONBOARDING & RECORD_PAYMENT
-- ============================================================================
-- Run this in Supabase SQL Editor after schema.sql (safe and idempotent).
-- Adds:
--   1. 'card' payment method enum value
--   2. Onboarding & business settings fields (VAT, prefixes, bank accounts,
--      default terms/notes, opening cash balance)
--   3. Linked balance-payment receipt columns (parent_receipt_id, receipt_kind)
--   4. Updated issue_receipt() supporting hyphenated prefixes like 'RCT-'
--   5. record_payment() SECURITY DEFINER function for part-paid receipts
--   6. Updated get_public_receipt() returning live debt balance & parent info
--   7. delete_my_account_cascade() helper for verified account deletion
-- ============================================================================

-- 1. Add 'card' to payment_method enum
ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'card';

-- 2. Extend businesses table with Phase 1B onboarding & settings fields
ALTER TABLE public.businesses
  DROP CONSTRAINT IF EXISTS businesses_receipt_prefix_check;

ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS invoice_prefix text NOT NULL DEFAULT 'INV-',
  ADD COLUMN IF NOT EXISTS quote_prefix text NOT NULL DEFAULT 'QUO-',
  ADD COLUMN IF NOT EXISTS vat_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vat_mode text NOT NULL DEFAULT 'exclusive',
  ADD COLUMN IF NOT EXISTS vat_rate_bps integer NOT NULL DEFAULT 750,
  ADD COLUMN IF NOT EXISTS bank_accounts jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS default_payment_terms text,
  ADD COLUMN IF NOT EXISTS default_invoice_notes text,
  ADD COLUMN IF NOT EXISTS opening_cash_balance_kobo bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz;

ALTER TABLE public.businesses
  ALTER COLUMN receipt_prefix SET DEFAULT 'RCT-';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'businesses_receipt_prefix_format') THEN
    ALTER TABLE public.businesses
      ADD CONSTRAINT businesses_receipt_prefix_format
      CHECK (receipt_prefix ~ '^[A-Z0-9-]{1,10}$');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'businesses_invoice_prefix_format') THEN
    ALTER TABLE public.businesses
      ADD CONSTRAINT businesses_invoice_prefix_format
      CHECK (invoice_prefix ~ '^[A-Z0-9-]{1,10}$');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'businesses_quote_prefix_format') THEN
    ALTER TABLE public.businesses
      ADD CONSTRAINT businesses_quote_prefix_format
      CHECK (quote_prefix ~ '^[A-Z0-9-]{1,10}$');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'businesses_vat_mode_check') THEN
    ALTER TABLE public.businesses
      ADD CONSTRAINT businesses_vat_mode_check
      CHECK (vat_mode IN ('exclusive', 'inclusive'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'businesses_vat_rate_bps_check') THEN
    ALTER TABLE public.businesses
      ADD CONSTRAINT businesses_vat_rate_bps_check
      CHECK (vat_rate_bps >= 0 AND vat_rate_bps <= 5000);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'businesses_bank_accounts_array') THEN
    ALTER TABLE public.businesses
      ADD CONSTRAINT businesses_bank_accounts_array
      CHECK (jsonb_typeof(bank_accounts) = 'array');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'businesses_opening_cash_check') THEN
    ALTER TABLE public.businesses
      ADD CONSTRAINT businesses_opening_cash_check
      CHECK (opening_cash_balance_kobo >= 0);
  END IF;
END
$$;

-- 3. Extend receipts table for linked balance-payment receipts
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS parent_receipt_id uuid REFERENCES public.receipts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS receipt_kind text NOT NULL DEFAULT 'sale';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'receipts_receipt_kind_check') THEN
    ALTER TABLE public.receipts
      ADD CONSTRAINT receipts_receipt_kind_check
      CHECK (receipt_kind IN ('sale', 'balance_payment'));
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_receipts_parent_receipt_id
  ON public.receipts(parent_receipt_id) WHERE parent_receipt_id IS NOT NULL;

-- 4. Update receipt immutability trigger to include parent_receipt_id & receipt_kind
CREATE OR REPLACE FUNCTION public.tg_enforce_receipt_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_setting('tallymark.via_issue_receipt', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Direct INSERT into receipts is forbidden. Use issue_receipt() or record_payment().';
    END IF;
    NEW.entry_date := (NEW.issued_at AT TIME ZONE 'Africa/Lagos')::date;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF current_setting('tallymark.via_void_receipt', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Issued receipts are immutable and cannot be updated directly. Use void_receipt().';
    END IF;

    IF OLD.status <> 'issued' OR NEW.status <> 'void' THEN
      RAISE EXCEPTION 'Only issued receipts can be transitioned to void.';
    END IF;

    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.business_id IS DISTINCT FROM OLD.business_id
       OR NEW.public_id IS DISTINCT FROM OLD.public_id
       OR NEW.receipt_number IS DISTINCT FROM OLD.receipt_number
       OR NEW.receipt_code IS DISTINCT FROM OLD.receipt_code
       OR NEW.parent_receipt_id IS DISTINCT FROM OLD.parent_receipt_id
       OR NEW.receipt_kind IS DISTINCT FROM OLD.receipt_kind
       OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
       OR NEW.customer_name IS DISTINCT FROM OLD.customer_name
       OR NEW.customer_phone IS DISTINCT FROM OLD.customer_phone
       OR NEW.line_items IS DISTINCT FROM OLD.line_items
       OR NEW.subtotal_kobo IS DISTINCT FROM OLD.subtotal_kobo
       OR NEW.discount_kobo IS DISTINCT FROM OLD.discount_kobo
       OR NEW.tax_kobo IS DISTINCT FROM OLD.tax_kobo
       OR NEW.total_kobo IS DISTINCT FROM OLD.total_kobo
       OR NEW.amount_paid_kobo IS DISTINCT FROM OLD.amount_paid_kobo
       OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
       OR NEW.notes IS DISTINCT FROM OLD.notes
       OR NEW.sold_by IS DISTINCT FROM OLD.sold_by
       OR NEW.source IS DISTINCT FROM OLD.source
       OR NEW.issued_at IS DISTINCT FROM OLD.issued_at
       OR NEW.entry_date IS DISTINCT FROM OLD.entry_date
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION 'Voiding a receipt cannot modify its original amounts, items, or metadata.';
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF current_setting('tallymark.allow_cascade_delete', true) = 'on' THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'Issued receipts cannot be deleted. Use void_receipt() to void.';
  END IF;

  RETURN NULL;
END;
$$;

-- 5. Update issue_receipt() to format prefixes cleanly ('RCT-' -> 'RCT-00001', 'TM' -> 'TM-00001')
CREATE OR REPLACE FUNCTION public.issue_receipt(
  p_business_id uuid,
  p_line_items jsonb,
  p_customer_id uuid DEFAULT NULL,
  p_customer_name text DEFAULT 'Walk-in Customer',
  p_customer_phone text DEFAULT NULL,
  p_discount_kobo bigint DEFAULT 0,
  p_tax_kobo bigint DEFAULT 0,
  p_amount_paid_kobo bigint DEFAULT NULL,
  p_payment_method public.payment_method DEFAULT 'cash',
  p_notes text DEFAULT NULL,
  p_sold_by text DEFAULT NULL,
  p_source public.entry_source DEFAULT 'manual',
  p_due_date date DEFAULT NULL,
  p_issued_at timestamptz DEFAULT NULL
)
RETURNS public.receipts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_business public.businesses%ROWTYPE;
  v_next_number bigint;
  v_receipt_code text;
  v_item jsonb;
  v_clean_items jsonb := '[]'::jsonb;
  v_desc text;
  v_qty numeric;
  v_unit text;
  v_unit_price bigint;
  v_item_discount bigint;
  v_line_total bigint;
  v_item_id uuid;
  v_subtotal_kobo bigint := 0;
  v_discount_kobo bigint := COALESCE(p_discount_kobo, 0);
  v_tax_kobo bigint := COALESCE(p_tax_kobo, 0);
  v_total_kobo bigint;
  v_amount_paid_kobo bigint;
  v_balance_due_kobo bigint;
  v_issued_at timestamptz := COALESCE(p_issued_at, now());
  v_entry_date date;
  v_customer_name text;
  v_customer_phone text := NULLIF(trim(COALESCE(p_customer_phone, '')), '');
  v_receipt public.receipts%ROWTYPE;
  v_debt_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT * INTO v_business
  FROM public.businesses
  WHERE id = p_business_id
    AND owner_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: business not found or not owned by user.';
  END IF;

  IF p_customer_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = p_customer_id AND c.business_id = p_business_id
    ) THEN
      RAISE EXCEPTION 'Customer does not belong to this business.';
    END IF;
  END IF;

  IF p_line_items IS NULL OR jsonb_typeof(p_line_items) <> 'array' OR jsonb_array_length(p_line_items) = 0 THEN
    RAISE EXCEPTION 'At least one line item is required.';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_line_items)
  LOOP
    v_desc := trim(COALESCE(v_item->>'description', ''));
    IF char_length(v_desc) = 0 THEN
      RAISE EXCEPTION 'Every line item must have a description.';
    END IF;

    v_qty := COALESCE((v_item->>'quantity')::numeric, 0);
    IF v_qty <= 0 THEN
      RAISE EXCEPTION 'Line item quantity must be greater than zero.';
    END IF;

    v_unit_price := COALESCE((v_item->>'unit_price_kobo')::bigint, -1);
    IF v_unit_price < 0 THEN
      RAISE EXCEPTION 'Line item unit_price_kobo must be >= 0.';
    END IF;

    v_item_discount := COALESCE((v_item->>'discount_kobo')::bigint, 0);
    IF v_item_discount < 0 THEN
      RAISE EXCEPTION 'Line item discount_kobo cannot be negative.';
    END IF;

    v_unit := COALESCE(NULLIF(trim(COALESCE(v_item->>'unit', '')), ''), 'unit');
    v_item_id := NULLIF(trim(COALESCE(v_item->>'item_id', '')), '')::uuid;

    IF v_item_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.items i WHERE i.id = v_item_id AND i.business_id = p_business_id
    ) THEN
      RAISE EXCEPTION 'Referenced item % does not belong to this business.', v_item_id;
    END IF;

    v_line_total := GREATEST(0, round(v_qty * v_unit_price)::bigint - v_item_discount);
    v_subtotal_kobo := v_subtotal_kobo + v_line_total;

    v_clean_items := v_clean_items || jsonb_build_array(
      jsonb_build_object(
        'item_id', v_item_id,
        'description', v_desc,
        'quantity', v_qty,
        'unit', v_unit,
        'unit_price_kobo', v_unit_price,
        'discount_kobo', v_item_discount,
        'line_total_kobo', v_line_total
      )
    );
  END LOOP;

  IF v_discount_kobo < 0 OR v_discount_kobo > v_subtotal_kobo THEN
    RAISE EXCEPTION 'Discount must be between 0 and subtotal.';
  END IF;

  IF v_tax_kobo < 0 THEN
    RAISE EXCEPTION 'Tax cannot be negative.';
  END IF;

  v_total_kobo := v_subtotal_kobo - v_discount_kobo + v_tax_kobo;
  IF v_total_kobo <= 0 THEN
    RAISE EXCEPTION 'Receipt total must be greater than zero.';
  END IF;

  v_amount_paid_kobo := COALESCE(
    p_amount_paid_kobo,
    CASE WHEN p_payment_method = 'credit' THEN 0 ELSE v_total_kobo END
  );

  IF v_amount_paid_kobo < 0 OR v_amount_paid_kobo > v_total_kobo THEN
    RAISE EXCEPTION 'Amount paid must be between 0 and receipt total.';
  END IF;

  v_balance_due_kobo := v_total_kobo - v_amount_paid_kobo;
  v_entry_date := (v_issued_at AT TIME ZONE 'Africa/Lagos')::date;

  IF EXISTS (
    SELECT 1 FROM public.day_closures dc
    WHERE dc.business_id = p_business_id AND dc.closure_date = v_entry_date
  ) THEN
    RAISE EXCEPTION 'Day % is closed. Cannot issue a receipt for a closed day.', v_entry_date;
  END IF;

  v_customer_name := COALESCE(NULLIF(trim(COALESCE(p_customer_name, '')), ''), 'Walk-in Customer');

  INSERT INTO public.receipt_counters (business_id, last_number)
  VALUES (p_business_id, 0)
  ON CONFLICT (business_id) DO NOTHING;

  SELECT last_number + 1
  INTO v_next_number
  FROM public.receipt_counters
  WHERE business_id = p_business_id
  FOR UPDATE;

  UPDATE public.receipt_counters
  SET last_number = v_next_number,
      updated_at = now()
  WHERE business_id = p_business_id;

  v_receipt_code := CASE
    WHEN right(v_business.receipt_prefix, 1) = '-'
      THEN v_business.receipt_prefix || lpad(v_next_number::text, 5, '0')
    ELSE v_business.receipt_prefix || '-' || lpad(v_next_number::text, 5, '0')
  END;

  PERFORM set_config('tallymark.via_issue_receipt', 'on', true);

  INSERT INTO public.receipts (
    business_id,
    receipt_number,
    receipt_code,
    receipt_kind,
    customer_id,
    customer_name,
    customer_phone,
    line_items,
    subtotal_kobo,
    discount_kobo,
    tax_kobo,
    total_kobo,
    amount_paid_kobo,
    payment_method,
    status,
    notes,
    sold_by,
    source,
    issued_at,
    entry_date,
    created_by
  )
  VALUES (
    p_business_id,
    v_next_number,
    v_receipt_code,
    'sale',
    p_customer_id,
    v_customer_name,
    v_customer_phone,
    v_clean_items,
    v_subtotal_kobo,
    v_discount_kobo,
    v_tax_kobo,
    v_total_kobo,
    v_amount_paid_kobo,
    p_payment_method,
    'issued',
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    NULLIF(trim(COALESCE(p_sold_by, '')), ''),
    p_source,
    v_issued_at,
    v_entry_date,
    v_uid
  )
  RETURNING * INTO v_receipt;

  PERFORM set_config('tallymark.via_issue_receipt', 'off', true);

  IF v_balance_due_kobo > 0 THEN
    INSERT INTO public.debts (
      business_id,
      customer_id,
      customer_name,
      customer_phone,
      receipt_id,
      original_amount_kobo,
      amount_paid_kobo,
      status,
      due_date,
      notes,
      sold_by,
      source,
      created_by
    )
    VALUES (
      p_business_id,
      p_customer_id,
      v_customer_name,
      v_customer_phone,
      v_receipt.id,
      v_balance_due_kobo,
      0,
      'open',
      p_due_date,
      'Balance due from receipt ' || v_receipt_code,
      v_receipt.sold_by,
      p_source,
      v_uid
    )
    RETURNING id INTO v_debt_id;
  END IF;

  INSERT INTO public.ledger_entries (
    business_id,
    type,
    amount_kobo,
    payment_method,
    category,
    description,
    customer_id,
    receipt_id,
    debt_id,
    occurred_at,
    entry_date,
    sold_by,
    source,
    created_by
  )
  VALUES (
    p_business_id,
    'sale',
    v_total_kobo,
    p_payment_method,
    'Sales',
    'Receipt ' || v_receipt_code || ' — ' || v_customer_name,
    p_customer_id,
    v_receipt.id,
    v_debt_id,
    v_issued_at,
    v_entry_date,
    v_receipt.sold_by,
    p_source,
    v_uid
  );

  RETURN v_receipt;
END;
$$;

-- 6. record_payment(): Receive balance on a part-paid receipt and issue a new linked receipt
CREATE OR REPLACE FUNCTION public.record_payment(
  p_receipt_id uuid,
  p_amount_kobo bigint,
  p_payment_method public.payment_method DEFAULT 'cash',
  p_notes text DEFAULT NULL,
  p_sold_by text DEFAULT NULL,
  p_source public.entry_source DEFAULT 'manual',
  p_paid_at timestamptz DEFAULT NULL
)
RETURNS public.receipts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_parent public.receipts%ROWTYPE;
  v_business public.businesses%ROWTYPE;
  v_debt public.debts%ROWTYPE;
  v_next_number bigint;
  v_receipt_code text;
  v_paid_at timestamptz := COALESCE(p_paid_at, now());
  v_entry_date date;
  v_new_receipt public.receipts%ROWTYPE;
  v_remaining_after bigint;
  v_line_items jsonb;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF p_amount_kobo IS NULL OR p_amount_kobo <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero.';
  END IF;

  IF p_payment_method = 'credit' THEN
    RAISE EXCEPTION 'Balance payment cannot use credit as the payment method.';
  END IF;

  SELECT r.* INTO v_parent
  FROM public.receipts r
  WHERE r.id = p_receipt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent receipt not found.';
  END IF;

  SELECT * INTO v_business
  FROM public.businesses
  WHERE id = v_parent.business_id
    AND owner_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: you do not own this receipt.';
  END IF;

  IF v_parent.status <> 'issued' THEN
    RAISE EXCEPTION 'Cannot receive payment on a voided receipt.';
  END IF;

  SELECT * INTO v_debt
  FROM public.debts
  WHERE receipt_id = p_receipt_id
  FOR UPDATE;

  IF NOT FOUND OR v_debt.status IN ('settled', 'void') OR v_debt.balance_kobo <= 0 THEN
    RAISE EXCEPTION 'This receipt has no outstanding balance.';
  END IF;

  IF p_amount_kobo > v_debt.balance_kobo THEN
    RAISE EXCEPTION 'Payment exceeds outstanding balance.';
  END IF;

  v_entry_date := (v_paid_at AT TIME ZONE 'Africa/Lagos')::date;

  IF EXISTS (
    SELECT 1 FROM public.day_closures dc
    WHERE dc.business_id = v_business.id AND dc.closure_date = v_entry_date
  ) THEN
    RAISE EXCEPTION 'Day % is closed. Cannot record a payment for a closed day.', v_entry_date;
  END IF;

  -- Update debt balance (trigger auto-syncs status to partial or settled)
  UPDATE public.debts
  SET amount_paid_kobo = amount_paid_kobo + p_amount_kobo,
      updated_at = now()
  WHERE id = v_debt.id;

  v_remaining_after := v_debt.balance_kobo - p_amount_kobo;

  -- Lock counter for gap-free sequential number
  INSERT INTO public.receipt_counters (business_id, last_number)
  VALUES (v_business.id, 0)
  ON CONFLICT (business_id) DO NOTHING;

  SELECT last_number + 1
  INTO v_next_number
  FROM public.receipt_counters
  WHERE business_id = v_business.id
  FOR UPDATE;

  UPDATE public.receipt_counters
  SET last_number = v_next_number,
      updated_at = now()
  WHERE business_id = v_business.id;

  v_receipt_code := CASE
    WHEN right(v_business.receipt_prefix, 1) = '-'
      THEN v_business.receipt_prefix || lpad(v_next_number::text, 5, '0')
    ELSE v_business.receipt_prefix || '-' || lpad(v_next_number::text, 5, '0')
  END;

  v_line_items := jsonb_build_array(
    jsonb_build_object(
      'item_id', NULL,
      'description', 'Balance payment for receipt ' || v_parent.receipt_code,
      'quantity', 1,
      'unit', 'payment',
      'unit_price_kobo', p_amount_kobo,
      'discount_kobo', 0,
      'line_total_kobo', p_amount_kobo
    )
  );

  PERFORM set_config('tallymark.via_issue_receipt', 'on', true);

  INSERT INTO public.receipts (
    business_id,
    receipt_number,
    receipt_code,
    parent_receipt_id,
    receipt_kind,
    customer_id,
    customer_name,
    customer_phone,
    line_items,
    subtotal_kobo,
    discount_kobo,
    tax_kobo,
    total_kobo,
    amount_paid_kobo,
    payment_method,
    status,
    notes,
    sold_by,
    source,
    issued_at,
    entry_date,
    created_by
  )
  VALUES (
    v_business.id,
    v_next_number,
    v_receipt_code,
    v_parent.id,
    'balance_payment',
    v_parent.customer_id,
    v_parent.customer_name,
    v_parent.customer_phone,
    v_line_items,
    p_amount_kobo,
    0,
    0,
    p_amount_kobo,
    p_amount_kobo,
    p_payment_method,
    'issued',
    COALESCE(
      NULLIF(trim(COALESCE(p_notes, '')), ''),
      CASE
        WHEN v_remaining_after = 0 THEN 'Final balance settlement for ' || v_parent.receipt_code
        ELSE 'Part balance payment for ' || v_parent.receipt_code
      END
    ),
    COALESCE(NULLIF(trim(COALESCE(p_sold_by, '')), ''), v_parent.sold_by),
    p_source,
    v_paid_at,
    v_entry_date,
    v_uid
  )
  RETURNING * INTO v_new_receipt;

  PERFORM set_config('tallymark.via_issue_receipt', 'off', true);

  INSERT INTO public.ledger_entries (
    business_id,
    type,
    amount_kobo,
    payment_method,
    category,
    description,
    customer_id,
    receipt_id,
    debt_id,
    occurred_at,
    entry_date,
    sold_by,
    source,
    created_by
  )
  VALUES (
    v_business.id,
    'payment_received',
    p_amount_kobo,
    p_payment_method,
    'Debt Collection',
    'Balance payment ' || v_receipt_code || ' for ' || v_parent.receipt_code || ' — ' || v_parent.customer_name,
    v_parent.customer_id,
    v_new_receipt.id,
    v_debt.id,
    v_paid_at,
    v_entry_date,
    v_new_receipt.sold_by,
    p_source,
    v_uid
  );

  RETURN v_new_receipt;
END;
$$;

REVOKE ALL ON FUNCTION public.record_payment(
  uuid, bigint, public.payment_method, text, text, public.entry_source, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_payment(
  uuid, bigint, public.payment_method, text, text, public.entry_source, timestamptz
) TO authenticated;

-- 7. Update get_public_receipt() to include live debt balance & parent receipt code
CREATE OR REPLACE FUNCTION public.get_public_receipt(p_public_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean_id text := trim(COALESCE(p_public_id, ''));
  v_result jsonb;
BEGIN
  IF char_length(v_clean_id) < 16 THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'receipt', jsonb_build_object(
      'public_id', r.public_id,
      'receipt_code', r.receipt_code,
      'receipt_number', r.receipt_number,
      'receipt_kind', r.receipt_kind,
      'parent_receipt_code', pr.receipt_code,
      'parent_public_id', pr.public_id,
      'customer_name', r.customer_name,
      'line_items', r.line_items,
      'subtotal_kobo', r.subtotal_kobo,
      'discount_kobo', r.discount_kobo,
      'tax_kobo', r.tax_kobo,
      'total_kobo', r.total_kobo,
      'amount_paid_kobo', r.amount_paid_kobo,
      'balance_due_kobo', r.balance_due_kobo,
      'outstanding_balance_kobo', COALESCE(d.balance_kobo, 0),
      'payment_method', r.payment_method,
      'status', r.status,
      'void_reason', r.void_reason,
      'voided_at', r.voided_at,
      'notes', r.notes,
      'sold_by', r.sold_by,
      'issued_at', r.issued_at,
      'entry_date', r.entry_date
    ),
    'business', jsonb_build_object(
      'name', b.name,
      'phone', b.phone,
      'email', b.email,
      'address', b.address,
      'rc_number', b.rc_number,
      'tax_id', b.tax_id,
      'logo_path', b.logo_path,
      'brand_color', b.brand_color,
      'receipt_template', b.receipt_template,
      'receipt_footer_note', b.receipt_footer_note,
      'currency', b.currency,
      'vat_enabled', b.vat_enabled
    )
  )
  INTO v_result
  FROM public.receipts r
  JOIN public.businesses b ON b.id = r.business_id
  LEFT JOIN public.receipts pr ON pr.id = r.parent_receipt_id
  LEFT JOIN public.debts d ON d.receipt_id = r.id
  WHERE r.public_id = v_clean_id;

  RETURN v_result;
END;
$$;

-- 8. Safe account-deletion cascade helper (callable only by service_role or owner)
CREATE OR REPLACE FUNCTION public.delete_owner_data(p_owner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_owner_id AND current_user <> 'service_role' AND current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Unauthorized account deletion.';
  END IF;

  PERFORM set_config('tallymark.allow_cascade_delete', 'on', true);
  DELETE FROM public.businesses WHERE owner_id = p_owner_id;
  PERFORM set_config('tallymark.allow_cascade_delete', 'off', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_owner_data(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_owner_data(uuid) TO authenticated, service_role;
