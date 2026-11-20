-- ============================================================================
-- TALLYMARK — MIGRATION 002: PHASE 2 DIGITAL CASH BOOK
-- ============================================================================
-- Run this in the Supabase SQL Editor AFTER schema.sql and 001_phase1b_*.sql.
-- Safe and idempotent.
-- Adds:
--   1. Business reminder time setting (close_day_reminder_time)
--   2. Ledger payee, is_credit_sale flag, and entry_corrections audit table
--   3. receipts.debt_id reference for linked debt payment receipts
--   4. Expanded day_closures summary columns
--   5. Updated triggers (receipt immutability + open-expense delete / quick-sale link)
--   6. Phase 2 SECURITY DEFINER functions:
--      - create_quick_sale
--      - create_quick_credit_sale
--      - issue_receipt_for_quick_sale
--      - record_debt_payment (and updated record_payment delegating to it)
--      - delete_open_expense
--      - correct_closed_day_entry
--      - close_day
--      - pay_creditor
-- ============================================================================

-- 1. Businesses: owner-set close-day reminder time (HH:MM in Africa/Lagos)
ALTER TABLE public.businesses
  ADD COLUMN IF NOT EXISTS close_day_reminder_time text NOT NULL DEFAULT '19:00';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'businesses_close_reminder_time_format') THEN
    ALTER TABLE public.businesses
      ADD CONSTRAINT businesses_close_reminder_time_format
      CHECK (close_day_reminder_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
  END IF;
END
$$;

-- 2. Ledger entries extensions
ALTER TABLE public.ledger_entries
  ADD COLUMN IF NOT EXISTS payee text,
  ADD COLUMN IF NOT EXISTS is_credit_sale boolean NOT NULL DEFAULT false;

-- 3. Receipts: optional link to debts (for informal/quick-credit debt payments)
ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS debt_id uuid REFERENCES public.debts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_receipts_debt_id
  ON public.receipts(debt_id) WHERE debt_id IS NOT NULL;

-- 4. Expand day_closures with full breakdown columns
ALTER TABLE public.day_closures
  ADD COLUMN IF NOT EXISTS total_receipt_sales_kobo bigint NOT NULL DEFAULT 0 CHECK (total_receipt_sales_kobo >= 0),
  ADD COLUMN IF NOT EXISTS total_quick_sales_kobo bigint NOT NULL DEFAULT 0 CHECK (total_quick_sales_kobo >= 0),
  ADD COLUMN IF NOT EXISTS total_credit_sales_kobo bigint NOT NULL DEFAULT 0 CHECK (total_credit_sales_kobo >= 0),
  ADD COLUMN IF NOT EXISTS opening_cash_kobo bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cash_in_kobo bigint NOT NULL DEFAULT 0 CHECK (cash_in_kobo >= 0),
  ADD COLUMN IF NOT EXISTS cash_out_kobo bigint NOT NULL DEFAULT 0 CHECK (cash_out_kobo >= 0),
  ADD COLUMN IF NOT EXISTS transfer_in_kobo bigint NOT NULL DEFAULT 0 CHECK (transfer_in_kobo >= 0),
  ADD COLUMN IF NOT EXISTS pos_in_kobo bigint NOT NULL DEFAULT 0 CHECK (pos_in_kobo >= 0),
  ADD COLUMN IF NOT EXISTS other_in_kobo bigint NOT NULL DEFAULT 0 CHECK (other_in_kobo >= 0),
  ADD COLUMN IF NOT EXISTS net_cash_book_kobo bigint NOT NULL DEFAULT 0;

-- 5. Closed-day entry correction audit log (visible edit history)
CREATE TABLE IF NOT EXISTS public.entry_corrections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  original_entry_id uuid NOT NULL REFERENCES public.ledger_entries(id) ON DELETE CASCADE,
  adjustment_entry_ids uuid[] NOT NULL DEFAULT '{}',
  action text NOT NULL CHECK (action IN ('edit', 'delete')),
  reason text NOT NULL CHECK (char_length(trim(reason)) >= 3),
  before_snapshot jsonb NOT NULL,
  after_snapshot jsonb,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_entry_corrections_business_orig
  ON public.entry_corrections(business_id, original_entry_id, created_at DESC);

ALTER TABLE public.entry_corrections ENABLE ROW LEVEL SECURITY;

REVOKE DELETE, UPDATE, INSERT ON public.entry_corrections FROM authenticated, anon;

DROP POLICY IF EXISTS entry_corrections_select_own ON public.entry_corrections;
CREATE POLICY entry_corrections_select_own ON public.entry_corrections
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ));

-- 6. Update receipt immutability trigger to include debt_id
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
       OR NEW.debt_id IS DISTINCT FROM OLD.debt_id
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

-- 7. Update ledger rules trigger:
--    - Supports controlled open-day expense deletion via delete_open_expense()
--    - Supports linking a quick sale to a newly issued receipt via issue_receipt_for_quick_sale()
--    - Continues blocking direct DELETE and all edits on closed days!
CREATE OR REPLACE FUNCTION public.tg_enforce_ledger_rules()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_closed boolean;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('tallymark.allow_cascade_delete', true) = 'on' THEN
      RETURN OLD;
    END IF;

    IF current_setting('tallymark.allow_open_expense_delete', true) = 'on'
       AND OLD.type = 'expense'
       AND OLD.receipt_id IS NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.day_closures dc
        WHERE dc.business_id = OLD.business_id AND dc.closure_date = OLD.entry_date
      ) INTO v_is_closed;

      IF NOT v_is_closed THEN
        RETURN OLD;
      END IF;
    END IF;

    RAISE EXCEPTION 'Ledger entries cannot be deleted. Record an adjustment entry instead.';
  END IF;

  -- Always derive entry_date in Africa/Lagos from occurred_at
  NEW.entry_date := (NEW.occurred_at AT TIME ZONE 'Africa/Lagos')::date;

  IF TG_OP = 'INSERT' THEN
    SELECT EXISTS (
      SELECT 1
      FROM public.day_closures dc
      WHERE dc.business_id = NEW.business_id
        AND dc.closure_date = NEW.entry_date
    ) INTO v_is_closed;

    IF v_is_closed AND NEW.type <> 'adjustment' THEN
      RAISE EXCEPTION 'Day % is closed. Only visible adjustment entries may be added to a closed day.', NEW.entry_date;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.business_id IS DISTINCT FROM OLD.business_id
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
       OR NEW.created_by IS DISTINCT FROM OLD.created_by
    THEN
      RAISE EXCEPTION 'Cannot change ledger entry identity or audit metadata.';
    END IF;

    IF OLD.receipt_id IS NOT NULL THEN
      RAISE EXCEPTION 'Ledger entries created by a receipt cannot be edited. Void the receipt or add an adjustment entry.';
    END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.day_closures dc
      WHERE dc.business_id = OLD.business_id
        AND dc.closure_date IN (OLD.entry_date, NEW.entry_date)
    ) INTO v_is_closed;

    IF v_is_closed THEN
      RAISE EXCEPTION 'Entries belonging to a closed day cannot be edited. Record a visible adjustment entry instead.';
    END IF;

    NEW.updated_at := now();
    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

-- 8. Quick Sale without receipt (5-second cash/transfer/POS/card sale)
CREATE OR REPLACE FUNCTION public.create_quick_sale(
  p_business_id uuid,
  p_amount_kobo bigint,
  p_payment_method public.payment_method DEFAULT 'cash',
  p_description text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_customer_name text DEFAULT NULL,
  p_sold_by text DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT NULL,
  p_source public.entry_source DEFAULT 'manual'
)
RETURNS public.ledger_entries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_occurred_at timestamptz := COALESCE(p_occurred_at, now());
  v_entry_date date;
  v_note text;
  v_cust_name text := NULLIF(trim(COALESCE(p_customer_name, '')), '');
  v_desc text;
  v_entry public.ledger_entries%ROWTYPE;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = p_business_id AND b.owner_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Unauthorized: business not found or not owned by user.';
  END IF;

  IF p_amount_kobo IS NULL OR p_amount_kobo <= 0 THEN
    RAISE EXCEPTION 'Sale amount must be greater than zero.';
  END IF;

  IF p_payment_method = 'credit' THEN
    RAISE EXCEPTION 'Use create_quick_credit_sale for credit sales.';
  END IF;

  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = p_customer_id AND c.business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'Customer does not belong to this business.';
  END IF;

  v_entry_date := (v_occurred_at AT TIME ZONE 'Africa/Lagos')::date;

  IF EXISTS (
    SELECT 1 FROM public.day_closures dc
    WHERE dc.business_id = p_business_id AND dc.closure_date = v_entry_date
  ) THEN
    RAISE EXCEPTION 'Day % is closed. Cannot add a quick sale to a closed day.', v_entry_date;
  END IF;

  v_note := NULLIF(trim(COALESCE(p_description, '')), '');
  v_desc := COALESCE(v_note, 'Quick sale');
  IF v_cust_name IS NOT NULL THEN
    v_desc := v_desc || ' — ' || v_cust_name;
  END IF;

  INSERT INTO public.ledger_entries (
    business_id,
    type,
    amount_kobo,
    payment_method,
    category,
    description,
    customer_id,
    is_credit_sale,
    occurred_at,
    entry_date,
    sold_by,
    source,
    created_by
  )
  VALUES (
    p_business_id,
    'sale',
    p_amount_kobo,
    p_payment_method,
    'Quick Sale',
    v_desc,
    p_customer_id,
    false,
    v_occurred_at,
    v_entry_date,
    NULLIF(trim(COALESCE(p_sold_by, '')), ''),
    p_source,
    v_uid
  )
  RETURNING * INTO v_entry;

  RETURN v_entry;
END;
$$;

REVOKE ALL ON FUNCTION public.create_quick_sale(
  uuid, bigint, public.payment_method, text, uuid, text, text, timestamptz, public.entry_source
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_quick_sale(
  uuid, bigint, public.payment_method, text, uuid, text, text, timestamptz, public.entry_source
) TO authenticated;

-- 9. Quick Credit Sale ("borrowed", informal — creates debt with no document, 0 received)
CREATE OR REPLACE FUNCTION public.create_quick_credit_sale(
  p_business_id uuid,
  p_amount_kobo bigint,
  p_customer_name text,
  p_customer_phone text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_due_date date DEFAULT NULL,
  p_sold_by text DEFAULT NULL,
  p_occurred_at timestamptz DEFAULT NULL,
  p_source public.entry_source DEFAULT 'manual'
)
RETURNS public.debts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_occurred_at timestamptz := COALESCE(p_occurred_at, now());
  v_entry_date date;
  v_cust_name text := trim(COALESCE(p_customer_name, ''));
  v_cust_phone text := NULLIF(trim(COALESCE(p_customer_phone, '')), '');
  v_note text := NULLIF(trim(COALESCE(p_description, '')), '');
  v_sold_by text := NULLIF(trim(COALESCE(p_sold_by, '')), '');
  v_debt public.debts%ROWTYPE;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = p_business_id AND b.owner_id = v_uid
  ) THEN
    RAISE EXCEPTION 'Unauthorized: business not found or not owned by user.';
  END IF;

  IF char_length(v_cust_name) < 1 THEN
    RAISE EXCEPTION 'Customer name is required for a credit sale.';
  END IF;

  IF p_amount_kobo IS NULL OR p_amount_kobo <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be greater than zero.';
  END IF;

  IF p_customer_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.customers c
    WHERE c.id = p_customer_id AND c.business_id = p_business_id
  ) THEN
    RAISE EXCEPTION 'Customer does not belong to this business.';
  END IF;

  v_entry_date := (v_occurred_at AT TIME ZONE 'Africa/Lagos')::date;

  IF EXISTS (
    SELECT 1 FROM public.day_closures dc
    WHERE dc.business_id = p_business_id AND dc.closure_date = v_entry_date
  ) THEN
    RAISE EXCEPTION 'Day % is closed. Cannot record a credit sale on a closed day.', v_entry_date;
  END IF;

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
    created_by,
    created_at
  )
  VALUES (
    p_business_id,
    p_customer_id,
    v_cust_name,
    v_cust_phone,
    NULL,
    p_amount_kobo,
    0,
    'open',
    p_due_date,
    COALESCE(v_note, 'Credit sale (no receipt)'),
    v_sold_by,
    p_source,
    v_uid,
    v_occurred_at
  )
  RETURNING * INTO v_debt;

  INSERT INTO public.ledger_entries (
    business_id,
    type,
    amount_kobo,
    payment_method,
    category,
    description,
    customer_id,
    debt_id,
    is_credit_sale,
    occurred_at,
    entry_date,
    sold_by,
    source,
    created_by
  )
  VALUES (
    p_business_id,
    'sale',
    p_amount_kobo,
    'credit',
    'Credit Sale',
    COALESCE(v_note || ' — ', 'Credit sale — ') || v_cust_name,
    p_customer_id,
    v_debt.id,
    true,
    v_occurred_at,
    v_entry_date,
    v_sold_by,
    p_source,
    v_uid
  );

  RETURN v_debt;
END;
$$;

REVOKE ALL ON FUNCTION public.create_quick_credit_sale(
  uuid, bigint, text, text, uuid, text, date, text, timestamptz, public.entry_source
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_quick_credit_sale(
  uuid, bigint, text, text, uuid, text, date, text, timestamptz, public.entry_source
) TO authenticated;

-- 10. Issue an official receipt retroactively from a Quick Sale ledger entry (no double-counting)
CREATE OR REPLACE FUNCTION public.issue_receipt_for_quick_sale(
  p_ledger_entry_id uuid,
  p_line_items jsonb,
  p_customer_id uuid DEFAULT NULL,
  p_customer_name text DEFAULT 'Walk-in Customer',
  p_customer_phone text DEFAULT NULL,
  p_discount_kobo bigint DEFAULT 0,
  p_tax_kobo bigint DEFAULT 0,
  p_amount_paid_kobo bigint DEFAULT NULL,
  p_payment_method public.payment_method DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_sold_by text DEFAULT NULL,
  p_due_date date DEFAULT NULL
)
RETURNS public.receipts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_entry public.ledger_entries%ROWTYPE;
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
  v_method public.payment_method;
  v_customer_name text;
  v_customer_phone text := NULLIF(trim(COALESCE(p_customer_phone, '')), '');
  v_receipt public.receipts%ROWTYPE;
  v_debt_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT * INTO v_entry
  FROM public.ledger_entries
  WHERE id = p_ledger_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quick sale entry not found.';
  END IF;

  SELECT * INTO v_business
  FROM public.businesses
  WHERE id = v_entry.business_id AND owner_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: you do not own this sale entry.';
  END IF;

  IF v_entry.type <> 'sale' OR v_entry.receipt_id IS NOT NULL OR v_entry.is_credit_sale THEN
    RAISE EXCEPTION 'Only an unreceipted quick sale can be converted to a receipt.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.day_closures dc
    WHERE dc.business_id = v_entry.business_id AND dc.closure_date = v_entry.entry_date
  ) THEN
    RAISE EXCEPTION 'Day % is closed. Cannot issue a receipt onto a closed day.', v_entry.entry_date;
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

  v_method := COALESCE(p_payment_method, v_entry.payment_method);
  v_amount_paid_kobo := COALESCE(p_amount_paid_kobo, v_total_kobo);
  IF v_amount_paid_kobo < 0 OR v_amount_paid_kobo > v_total_kobo THEN
    RAISE EXCEPTION 'Amount paid must be between 0 and receipt total.';
  END IF;
  v_balance_due_kobo := v_total_kobo - v_amount_paid_kobo;
  v_customer_name := COALESCE(NULLIF(trim(COALESCE(p_customer_name, '')), ''), 'Walk-in Customer');

  INSERT INTO public.receipt_counters (business_id, last_number)
  VALUES (v_business.id, 0)
  ON CONFLICT (business_id) DO NOTHING;

  SELECT last_number + 1 INTO v_next_number
  FROM public.receipt_counters
  WHERE business_id = v_business.id
  FOR UPDATE;

  UPDATE public.receipt_counters
  SET last_number = v_next_number, updated_at = now()
  WHERE business_id = v_business.id;

  v_receipt_code := CASE
    WHEN right(v_business.receipt_prefix, 1) = '-'
      THEN v_business.receipt_prefix || lpad(v_next_number::text, 5, '0')
    ELSE v_business.receipt_prefix || '-' || lpad(v_next_number::text, 5, '0')
  END;

  PERFORM set_config('tallymark.via_issue_receipt', 'on', true);

  INSERT INTO public.receipts (
    business_id, receipt_number, receipt_code, receipt_kind,
    customer_id, customer_name, customer_phone, line_items,
    subtotal_kobo, discount_kobo, tax_kobo, total_kobo, amount_paid_kobo,
    payment_method, status, notes, sold_by, source, issued_at, entry_date, created_by
  )
  VALUES (
    v_business.id, v_next_number, v_receipt_code, 'sale',
    COALESCE(p_customer_id, v_entry.customer_id), v_customer_name, v_customer_phone, v_clean_items,
    v_subtotal_kobo, v_discount_kobo, v_tax_kobo, v_total_kobo, v_amount_paid_kobo,
    v_method, 'issued', NULLIF(trim(COALESCE(p_notes, '')), ''),
    COALESCE(NULLIF(trim(COALESCE(p_sold_by, '')), ''), v_entry.sold_by),
    v_entry.source, v_entry.occurred_at, v_entry.entry_date, v_uid
  )
  RETURNING * INTO v_receipt;

  PERFORM set_config('tallymark.via_issue_receipt', 'off', true);

  IF v_balance_due_kobo > 0 THEN
    INSERT INTO public.debts (
      business_id, customer_id, customer_name, customer_phone, receipt_id,
      original_amount_kobo, amount_paid_kobo, status, due_date, notes, sold_by, source, created_by
    )
    VALUES (
      v_business.id, COALESCE(p_customer_id, v_entry.customer_id), v_customer_name, v_customer_phone,
      v_receipt.id, v_balance_due_kobo, 0, 'open', p_due_date,
      'Balance due from receipt ' || v_receipt_code, v_receipt.sold_by, v_entry.source, v_uid
    )
    RETURNING id INTO v_debt_id;
  END IF;

  UPDATE public.ledger_entries
  SET receipt_id = v_receipt.id,
      debt_id = v_debt_id,
      customer_id = COALESCE(p_customer_id, v_entry.customer_id),
      amount_kobo = v_total_kobo,
      payment_method = v_method,
      category = 'Sales',
      description = 'Receipt ' || v_receipt_code || ' — ' || v_customer_name,
      sold_by = v_receipt.sold_by
  WHERE id = v_entry.id;

  RETURN v_receipt;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_receipt_for_quick_sale(
  uuid, jsonb, uuid, text, text, bigint, bigint, bigint, public.payment_method, text, text, date
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_receipt_for_quick_sale(
  uuid, jsonb, uuid, text, text, bigint, bigint, bigint, public.payment_method, text, text, date
) TO authenticated;

-- 11. record_debt_payment(): supports BOTH receipt-backed debts AND quick-credit-sale debts
CREATE OR REPLACE FUNCTION public.record_debt_payment(
  p_debt_id uuid,
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
  v_debt public.debts%ROWTYPE;
  v_parent public.receipts%ROWTYPE;
  v_has_parent boolean := false;
  v_business public.businesses%ROWTYPE;
  v_next_number bigint;
  v_receipt_code text;
  v_paid_at timestamptz := COALESCE(p_paid_at, now());
  v_entry_date date;
  v_new_receipt public.receipts%ROWTYPE;
  v_remaining_after bigint;
  v_line_items jsonb;
  v_desc text;
  v_note text;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF p_amount_kobo IS NULL OR p_amount_kobo <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero.';
  END IF;

  IF p_payment_method = 'credit' THEN
    RAISE EXCEPTION 'Debt payment cannot use credit as the payment method.';
  END IF;

  SELECT * INTO v_debt
  FROM public.debts
  WHERE id = p_debt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Debt record not found.';
  END IF;

  SELECT * INTO v_business
  FROM public.businesses
  WHERE id = v_debt.business_id AND owner_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: you do not own this debt record.';
  END IF;

  IF v_debt.status IN ('settled', 'void') OR v_debt.balance_kobo <= 0 THEN
    RAISE EXCEPTION 'This debt has already been settled or voided.';
  END IF;

  IF p_amount_kobo > v_debt.balance_kobo THEN
    RAISE EXCEPTION 'Payment exceeds outstanding balance.';
  END IF;

  IF v_debt.receipt_id IS NOT NULL THEN
    SELECT * INTO v_parent
    FROM public.receipts
    WHERE id = v_debt.receipt_id
    FOR UPDATE;
    IF FOUND THEN
      v_has_parent := true;
      IF v_parent.status <> 'issued' THEN
        RAISE EXCEPTION 'Cannot receive payment on a voided receipt.';
      END IF;
    END IF;
  END IF;

  v_entry_date := (v_paid_at AT TIME ZONE 'Africa/Lagos')::date;

  IF EXISTS (
    SELECT 1 FROM public.day_closures dc
    WHERE dc.business_id = v_business.id AND dc.closure_date = v_entry_date
  ) THEN
    RAISE EXCEPTION 'Day % is closed. Cannot record a payment for a closed day.', v_entry_date;
  END IF;

  UPDATE public.debts
  SET amount_paid_kobo = amount_paid_kobo + p_amount_kobo,
      updated_at = now()
  WHERE id = v_debt.id;

  v_remaining_after := v_debt.balance_kobo - p_amount_kobo;

  INSERT INTO public.receipt_counters (business_id, last_number)
  VALUES (v_business.id, 0)
  ON CONFLICT (business_id) DO NOTHING;

  SELECT last_number + 1 INTO v_next_number
  FROM public.receipt_counters
  WHERE business_id = v_business.id
  FOR UPDATE;

  UPDATE public.receipt_counters
  SET last_number = v_next_number, updated_at = now()
  WHERE business_id = v_business.id;

  v_receipt_code := CASE
    WHEN right(v_business.receipt_prefix, 1) = '-'
      THEN v_business.receipt_prefix || lpad(v_next_number::text, 5, '0')
    ELSE v_business.receipt_prefix || '-' || lpad(v_next_number::text, 5, '0')
  END;

  IF v_has_parent THEN
    v_desc := 'Balance payment for receipt ' || v_parent.receipt_code;
    v_note := CASE
      WHEN v_remaining_after = 0 THEN 'Final balance settlement for ' || v_parent.receipt_code
      ELSE 'Part balance payment for ' || v_parent.receipt_code
    END;
  ELSE
    v_desc := 'Payment on credit balance — ' || v_debt.customer_name;
    v_note := CASE
      WHEN v_remaining_after = 0 THEN 'Final settlement of credit balance'
      ELSE 'Part payment on credit balance'
    END;
  END IF;

  v_line_items := jsonb_build_array(
    jsonb_build_object(
      'item_id', NULL,
      'description', v_desc,
      'quantity', 1,
      'unit', 'payment',
      'unit_price_kobo', p_amount_kobo,
      'discount_kobo', 0,
      'line_total_kobo', p_amount_kobo
    )
  );

  PERFORM set_config('tallymark.via_issue_receipt', 'on', true);

  INSERT INTO public.receipts (
    business_id, receipt_number, receipt_code, parent_receipt_id, receipt_kind, debt_id,
    customer_id, customer_name, customer_phone, line_items,
    subtotal_kobo, discount_kobo, tax_kobo, total_kobo, amount_paid_kobo,
    payment_method, status, notes, sold_by, source, issued_at, entry_date, created_by
  )
  VALUES (
    v_business.id, v_next_number, v_receipt_code,
    CASE WHEN v_has_parent THEN v_parent.id ELSE NULL END,
    'balance_payment',
    v_debt.id,
    v_debt.customer_id, v_debt.customer_name, v_debt.customer_phone, v_line_items,
    p_amount_kobo, 0, 0, p_amount_kobo, p_amount_kobo,
    p_payment_method, 'issued',
    COALESCE(NULLIF(trim(COALESCE(p_notes, '')), ''), v_note),
    COALESCE(NULLIF(trim(COALESCE(p_sold_by, '')), ''), v_debt.sold_by),
    p_source, v_paid_at, v_entry_date, v_uid
  )
  RETURNING * INTO v_new_receipt;

  PERFORM set_config('tallymark.via_issue_receipt', 'off', true);

  INSERT INTO public.ledger_entries (
    business_id, type, amount_kobo, payment_method, category, description,
    customer_id, receipt_id, debt_id, occurred_at, entry_date, sold_by, source, created_by
  )
  VALUES (
    v_business.id,
    'payment_received',
    p_amount_kobo,
    p_payment_method,
    'Debt Collection',
    CASE
      WHEN v_has_parent THEN 'Balance payment ' || v_receipt_code || ' for ' || v_parent.receipt_code || ' — ' || v_debt.customer_name
      ELSE 'Debt payment ' || v_receipt_code || ' — ' || v_debt.customer_name
    END,
    v_debt.customer_id,
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

REVOKE ALL ON FUNCTION public.record_debt_payment(
  uuid, bigint, public.payment_method, text, text, public.entry_source, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_debt_payment(
  uuid, bigint, public.payment_method, text, text, public.entry_source, timestamptz
) TO authenticated;

-- Keep record_payment(p_receipt_id, ...) delegating cleanly to record_debt_payment()
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
  v_debt_id uuid;
BEGIN
  SELECT id INTO v_debt_id
  FROM public.debts
  WHERE receipt_id = p_receipt_id
  LIMIT 1;

  IF v_debt_id IS NULL THEN
    RAISE EXCEPTION 'This receipt has no outstanding balance.';
  END IF;

  RETURN public.record_debt_payment(
    v_debt_id,
    p_amount_kobo,
    p_payment_method,
    p_notes,
    p_sold_by,
    p_source,
    p_paid_at
  );
END;
$$;

-- 12. Delete an open-day expense safely (blocked if day is closed)
CREATE OR REPLACE FUNCTION public.delete_open_expense(p_entry_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_entry public.ledger_entries%ROWTYPE;
  v_is_closed boolean;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT le.* INTO v_entry
  FROM public.ledger_entries le
  JOIN public.businesses b ON b.id = le.business_id
  WHERE le.id = p_entry_id AND b.owner_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Expense entry not found or unauthorized.';
  END IF;

  IF v_entry.type <> 'expense' OR v_entry.receipt_id IS NOT NULL THEN
    RAISE EXCEPTION 'Only standalone expense entries can be deleted directly.';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.day_closures dc
    WHERE dc.business_id = v_entry.business_id AND dc.closure_date = v_entry.entry_date
  ) INTO v_is_closed;

  IF v_is_closed THEN
    RAISE EXCEPTION 'Day % is closed. Use a visible closed-day correction instead of deleting.', v_entry.entry_date;
  END IF;

  PERFORM set_config('tallymark.allow_open_expense_delete', 'on', true);
  DELETE FROM public.ledger_entries WHERE id = p_entry_id;
  PERFORM set_config('tallymark.allow_open_expense_delete', 'off', true);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_open_expense(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_open_expense(uuid) TO authenticated;

-- 13. Closed-day visible correction entry (for expenses / non-receipt entries on closed days)
CREATE OR REPLACE FUNCTION public.correct_closed_day_entry(
  p_entry_id uuid,
  p_action text, -- 'edit' or 'delete'
  p_new_amount_kobo bigint DEFAULT NULL,
  p_new_payment_method public.payment_method DEFAULT NULL,
  p_new_category text DEFAULT NULL,
  p_new_payee text DEFAULT NULL,
  p_new_description text DEFAULT NULL,
  p_reason text DEFAULT NULL
)
RETURNS public.entry_corrections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_entry public.ledger_entries%ROWTYPE;
  v_reason text := trim(COALESCE(p_reason, ''));
  v_new_amount bigint;
  v_new_method public.payment_method;
  v_new_cat text;
  v_new_payee text;
  v_new_desc text;
  v_adj_ids uuid[] := '{}';
  v_adj_id uuid;
  v_delta bigint;
  v_corr public.entry_corrections%ROWTYPE;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF p_action NOT IN ('edit', 'delete') THEN
    RAISE EXCEPTION 'Correction action must be edit or delete.';
  END IF;

  IF char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A correction reason of at least 3 characters is required.';
  END IF;

  SELECT le.* INTO v_entry
  FROM public.ledger_entries le
  JOIN public.businesses b ON b.id = le.business_id
  WHERE le.id = p_entry_id AND b.owner_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ledger entry not found or unauthorized.';
  END IF;

  IF v_entry.receipt_id IS NOT NULL THEN
    RAISE EXCEPTION 'Receipt entries must be voided via void_receipt().';
  END IF;

  IF v_entry.type NOT IN ('expense', 'sale') OR v_entry.is_credit_sale THEN
    RAISE EXCEPTION 'Only expense or quick sale entries can be corrected with this action.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.day_closures dc
    WHERE dc.business_id = v_entry.business_id AND dc.closure_date = v_entry.entry_date
  ) THEN
    RAISE EXCEPTION 'Day % is still open; edit or delete the entry directly.', v_entry.entry_date;
  END IF;

  IF p_action = 'delete' THEN
    -- For expense reversal: money returns (+amount). For quick sale reversal: money removed (-amount).
    v_delta := CASE WHEN v_entry.type = 'expense' THEN v_entry.amount_kobo ELSE -v_entry.amount_kobo END;
    INSERT INTO public.ledger_entries (
      business_id, type, amount_kobo, payment_method, category, payee,
      description, related_entry_id, occurred_at, entry_date, sold_by, source, created_by
    )
    VALUES (
      v_entry.business_id,
      'adjustment',
      v_delta,
      v_entry.payment_method,
      CASE WHEN v_entry.type = 'expense' THEN 'Expense Reversal' ELSE 'Sale Reversal' END,
      v_entry.payee,
      'Closed-day removal of "' || v_entry.description || '" — ' || v_reason,
      v_entry.id,
      v_entry.occurred_at,
      v_entry.entry_date,
      v_entry.sold_by,
      'manual',
      v_uid
    )
    RETURNING id INTO v_adj_id;
    v_adj_ids := ARRAY[v_adj_id];
  ELSE
    v_new_amount := COALESCE(p_new_amount_kobo, v_entry.amount_kobo);
    IF v_new_amount <= 0 THEN
      RAISE EXCEPTION 'Corrected amount must be greater than zero.';
    END IF;
    v_new_method := COALESCE(p_new_payment_method, v_entry.payment_method);
    v_new_cat := COALESCE(NULLIF(trim(COALESCE(p_new_category, '')), ''), v_entry.category);
    v_new_payee := COALESCE(NULLIF(trim(COALESCE(p_new_payee, '')), ''), v_entry.payee);
    v_new_desc := COALESCE(NULLIF(trim(COALESCE(p_new_description, '')), ''), v_entry.description);

    IF v_new_method = v_entry.payment_method THEN
      v_delta := CASE
        WHEN v_entry.type = 'expense' THEN v_entry.amount_kobo - v_new_amount
        ELSE v_new_amount - v_entry.amount_kobo
      END;
      IF v_delta <> 0 THEN
        INSERT INTO public.ledger_entries (
          business_id, type, amount_kobo, payment_method, category, payee,
          description, related_entry_id, occurred_at, entry_date, sold_by, source, created_by
        )
        VALUES (
          v_entry.business_id,
          'adjustment',
          v_delta,
          v_new_method,
          'Closed-Day Correction',
          v_new_payee,
          'Closed-day edit ("' || v_new_desc || '"): ' || v_reason,
          v_entry.id,
          v_entry.occurred_at,
          v_entry.entry_date,
          v_entry.sold_by,
          'manual',
          v_uid
        )
        RETURNING id INTO v_adj_id;
        v_adj_ids := ARRAY[v_adj_id];
      END IF;
    ELSE
      -- Payment method changed: reverse original bucket and post corrected amount to new bucket
      INSERT INTO public.ledger_entries (
        business_id, type, amount_kobo, payment_method, category, payee,
        description, related_entry_id, occurred_at, entry_date, sold_by, source, created_by
      )
      VALUES (
        v_entry.business_id,
        'adjustment',
        CASE WHEN v_entry.type = 'expense' THEN v_entry.amount_kobo ELSE -v_entry.amount_kobo END,
        v_entry.payment_method,
        'Closed-Day Correction',
        v_entry.payee,
        'Reclassified payment method from ' || v_entry.payment_method::text || ': ' || v_reason,
        v_entry.id,
        v_entry.occurred_at,
        v_entry.entry_date,
        v_entry.sold_by,
        'manual',
        v_uid
      )
      RETURNING id INTO v_adj_id;
      v_adj_ids := array_append(v_adj_ids, v_adj_id);

      INSERT INTO public.ledger_entries (
        business_id, type, amount_kobo, payment_method, category, payee,
        description, related_entry_id, occurred_at, entry_date, sold_by, source, created_by
      )
      VALUES (
        v_entry.business_id,
        'adjustment',
        CASE WHEN v_entry.type = 'expense' THEN -v_new_amount ELSE v_new_amount END,
        v_new_method,
        'Closed-Day Correction',
        v_new_payee,
        'Corrected entry ("' || v_new_desc || '") on ' || v_new_method::text || ': ' || v_reason,
        v_entry.id,
        v_entry.occurred_at,
        v_entry.entry_date,
        v_entry.sold_by,
        'manual',
        v_uid
      )
      RETURNING id INTO v_adj_id;
      v_adj_ids := array_append(v_adj_ids, v_adj_id);
    END IF;
  END IF;

  INSERT INTO public.entry_corrections (
    business_id, original_entry_id, adjustment_entry_ids, action, reason,
    before_snapshot, after_snapshot, created_by
  )
  VALUES (
    v_entry.business_id,
    v_entry.id,
    v_adj_ids,
    p_action,
    v_reason,
    jsonb_build_object(
      'amount_kobo', v_entry.amount_kobo,
      'payment_method', v_entry.payment_method,
      'category', v_entry.category,
      'payee', v_entry.payee,
      'description', v_entry.description
    ),
    CASE
      WHEN p_action = 'delete' THEN NULL
      ELSE jsonb_build_object(
        'amount_kobo', v_new_amount,
        'payment_method', v_new_method,
        'category', v_new_cat,
        'payee', v_new_payee,
        'description', v_new_desc
      )
    END,
    v_uid
  )
  RETURNING * INTO v_corr;

  RETURN v_corr;
END;
$$;

REVOKE ALL ON FUNCTION public.correct_closed_day_entry(
  uuid, text, bigint, public.payment_method, text, text, text, text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.correct_closed_day_entry(
  uuid, text, bigint, public.payment_method, text, text, text, text
) TO authenticated;

-- 14. Close Day RPC: computes exact ledger totals & carrying-forward cash in hand, then seals day
CREATE OR REPLACE FUNCTION public.close_day(
  p_business_id uuid,
  p_closure_date date,
  p_actual_cash_counted_kobo bigint,
  p_notes text DEFAULT NULL
)
RETURNS public.day_closures
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_business public.businesses%ROWTYPE;
  v_prior_cash_delta bigint := 0;
  v_opening_cash bigint := 0;
  v_receipt_sales bigint := 0;
  v_quick_sales bigint := 0;
  v_credit_sales bigint := 0;
  v_payments_received bigint := 0;
  v_expenses bigint := 0;
  v_adjustments bigint := 0;
  v_cash_in bigint := 0;
  v_cash_out bigint := 0;
  v_transfer_in bigint := 0;
  v_pos_in bigint := 0;
  v_other_in bigint := 0;
  v_expected_cash bigint := 0;
  v_money_in_total bigint := 0;
  v_money_out_total bigint := 0;
  v_net_kobo bigint := 0;
  v_closure public.day_closures%ROWTYPE;
  rec record;
  v_in bigint;
  v_out bigint;
  v_signed_cash bigint;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  SELECT * INTO v_business
  FROM public.businesses
  WHERE id = p_business_id AND owner_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: business not found or not owned by user.';
  END IF;

  IF p_closure_date IS NULL THEN
    RAISE EXCEPTION 'Closure date is required.';
  END IF;

  IF p_actual_cash_counted_kobo IS NULL OR p_actual_cash_counted_kobo < 0 THEN
    RAISE EXCEPTION 'Actual cash counted must be 0 or greater.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.day_closures dc
    WHERE dc.business_id = p_business_id AND dc.closure_date = p_closure_date
  ) THEN
    RAISE EXCEPTION 'Day % is already closed.', p_closure_date;
  END IF;

  -- Compute carrying-forward cash balance from all entries strictly prior to p_closure_date
  FOR rec IN
    SELECT le.*, r.amount_paid_kobo AS receipt_amount_paid, r.status AS receipt_status
    FROM public.ledger_entries le
    LEFT JOIN public.receipts r ON r.id = le.receipt_id
    WHERE le.business_id = p_business_id
      AND le.entry_date < p_closure_date
      AND le.payment_method = 'cash'
  LOOP
    v_signed_cash := 0;
    IF rec.type = 'sale' THEN
      IF rec.receipt_id IS NOT NULL THEN
        v_signed_cash := COALESCE(rec.receipt_amount_paid, rec.amount_kobo);
      ELSIF rec.is_credit_sale OR rec.payment_method = 'credit' THEN
        v_signed_cash := 0;
      ELSE
        v_signed_cash := rec.amount_kobo;
      END IF;
    ELSIF rec.type = 'payment_received' THEN
      v_signed_cash := rec.amount_kobo;
    ELSIF rec.type = 'expense' THEN
      v_signed_cash := -rec.amount_kobo;
    ELSIF rec.type = 'adjustment' THEN
      IF rec.receipt_id IS NOT NULL AND rec.receipt_status = 'void' THEN
        v_signed_cash := -COALESCE(rec.receipt_amount_paid, 0);
      ELSE
        v_signed_cash := rec.amount_kobo;
      END IF;
    END IF;
    v_prior_cash_delta := v_prior_cash_delta + v_signed_cash;
  END LOOP;

  v_opening_cash := v_business.opening_cash_balance_kobo + v_prior_cash_delta;

  -- Compute exact figures for p_closure_date
  FOR rec IN
    SELECT le.*, r.amount_paid_kobo AS receipt_amount_paid, r.status AS receipt_status
    FROM public.ledger_entries le
    LEFT JOIN public.receipts r ON r.id = le.receipt_id
    WHERE le.business_id = p_business_id
      AND le.entry_date = p_closure_date
  LOOP
    v_in := 0;
    v_out := 0;

    IF rec.type = 'sale' THEN
      IF rec.receipt_id IS NOT NULL THEN
        v_receipt_sales := v_receipt_sales + rec.amount_kobo;
        v_in := COALESCE(rec.receipt_amount_paid, rec.amount_kobo);
      ELSIF rec.is_credit_sale OR rec.payment_method = 'credit' THEN
        v_credit_sales := v_credit_sales + rec.amount_kobo;
        v_in := 0;
      ELSE
        v_quick_sales := v_quick_sales + rec.amount_kobo;
        v_in := rec.amount_kobo;
      END IF;
    ELSIF rec.type = 'payment_received' THEN
      v_payments_received := v_payments_received + rec.amount_kobo;
      v_in := rec.amount_kobo;
    ELSIF rec.type = 'expense' THEN
      v_expenses := v_expenses + rec.amount_kobo;
      v_out := rec.amount_kobo;
    ELSIF rec.type = 'adjustment' THEN
      IF rec.receipt_id IS NOT NULL AND rec.receipt_status = 'void' THEN
        v_out := COALESCE(rec.receipt_amount_paid, 0);
        v_adjustments := v_adjustments - v_out;
      ELSE
        v_adjustments := v_adjustments + rec.amount_kobo;
        IF rec.amount_kobo > 0 THEN
          v_in := rec.amount_kobo;
        ELSE
          v_out := abs(rec.amount_kobo);
        END IF;
      END IF;
    END IF;

    v_money_in_total := v_money_in_total + v_in;
    v_money_out_total := v_money_out_total + v_out;

    IF rec.payment_method = 'cash' THEN
      v_cash_in := v_cash_in + v_in;
      v_cash_out := v_cash_out + v_out;
    ELSIF rec.payment_method = 'transfer' THEN
      v_transfer_in := v_transfer_in + v_in;
    ELSIF rec.payment_method = 'pos' THEN
      v_pos_in := v_pos_in + v_in;
    ELSIF rec.payment_method IN ('card', 'other') THEN
      v_other_in := v_other_in + v_in;
    END IF;
  END LOOP;

  v_expected_cash := v_opening_cash + v_cash_in - v_cash_out;
  v_net_kobo := v_money_in_total - v_money_out_total;

  INSERT INTO public.day_closures (
    business_id,
    closure_date,
    total_sales_kobo,
    total_receipt_sales_kobo,
    total_quick_sales_kobo,
    total_credit_sales_kobo,
    total_payments_received_kobo,
    total_expenses_kobo,
    total_adjustments_kobo,
    opening_cash_kobo,
    cash_in_kobo,
    cash_out_kobo,
    transfer_in_kobo,
    pos_in_kobo,
    other_in_kobo,
    net_cash_book_kobo,
    expected_cash_kobo,
    actual_cash_counted_kobo,
    notes,
    closed_by
  )
  VALUES (
    p_business_id,
    p_closure_date,
    v_receipt_sales + v_quick_sales + v_credit_sales,
    v_receipt_sales,
    v_quick_sales,
    v_credit_sales,
    v_payments_received,
    v_expenses,
    v_adjustments,
    v_opening_cash,
    v_cash_in,
    v_cash_out,
    v_transfer_in,
    v_pos_in,
    v_other_in,
    v_net_kobo,
    v_expected_cash,
    p_actual_cash_counted_kobo,
    NULLIF(trim(COALESCE(p_notes, '')), ''),
    v_uid
  )
  RETURNING * INTO v_closure;

  RETURN v_closure;
END;
$$;

REVOKE ALL ON FUNCTION public.close_day(uuid, date, bigint, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.close_day(uuid, date, bigint, text) TO authenticated;

-- 15. Pay Creditor RPC (atomically updates creditor balance & optionally records Cash Book expense)
CREATE OR REPLACE FUNCTION public.pay_creditor(
  p_creditor_id uuid,
  p_amount_kobo bigint,
  p_payment_method public.payment_method DEFAULT 'cash',
  p_record_expense boolean DEFAULT true,
  p_notes text DEFAULT NULL,
  p_paid_at timestamptz DEFAULT NULL
)
RETURNS public.creditors
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_creditor public.creditors%ROWTYPE;
  v_paid_at timestamptz := COALESCE(p_paid_at, now());
  v_entry_date date;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  IF p_amount_kobo IS NULL OR p_amount_kobo <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be greater than zero.';
  END IF;

  IF p_payment_method = 'credit' THEN
    RAISE EXCEPTION 'Supplier payment cannot use credit method.';
  END IF;

  SELECT c.* INTO v_creditor
  FROM public.creditors c
  JOIN public.businesses b ON b.id = c.business_id
  WHERE c.id = p_creditor_id AND b.owner_id = v_uid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Creditor record not found or unauthorized.';
  END IF;

  IF v_creditor.status = 'settled' OR v_creditor.balance_kobo <= 0 THEN
    RAISE EXCEPTION 'This supplier balance is already settled.';
  END IF;

  IF p_amount_kobo > v_creditor.balance_kobo THEN
    RAISE EXCEPTION 'Payment exceeds remaining amount owed to supplier.';
  END IF;

  v_entry_date := (v_paid_at AT TIME ZONE 'Africa/Lagos')::date;

  IF p_record_expense AND EXISTS (
    SELECT 1 FROM public.day_closures dc
    WHERE dc.business_id = v_creditor.business_id AND dc.closure_date = v_entry_date
  ) THEN
    RAISE EXCEPTION 'Day % is closed. Cannot record a supplier payment expense onto a closed day.', v_entry_date;
  END IF;

  UPDATE public.creditors
  SET amount_paid_kobo = amount_paid_kobo + p_amount_kobo,
      updated_at = now()
  WHERE id = v_creditor.id
  RETURNING * INTO v_creditor;

  IF p_record_expense THEN
    INSERT INTO public.ledger_entries (
      business_id, type, amount_kobo, payment_method, category, payee,
      description, creditor_id, occurred_at, entry_date, source, created_by
    )
    VALUES (
      v_creditor.business_id,
      'expense',
      p_amount_kobo,
      p_payment_method,
      'Supplier Payment',
      v_creditor.supplier_name,
      COALESCE(NULLIF(trim(COALESCE(p_notes, '')), ''), 'Paid supplier ' || v_creditor.supplier_name),
      v_creditor.id,
      v_paid_at,
      v_entry_date,
      'manual',
      v_uid
    );
  END IF;

  RETURN v_creditor;
END;
$$;

REVOKE ALL ON FUNCTION public.pay_creditor(
  uuid, bigint, public.payment_method, boolean, text, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pay_creditor(
  uuid, bigint, public.payment_method, boolean, text, timestamptz
) TO authenticated;
