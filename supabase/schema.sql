-- ============================================================================
-- TALLYMARK — COMPLETE POSTGRESQL / SUPABASE SCHEMA (PHASE 1A)
-- ============================================================================
-- Run this script once in the Supabase SQL Editor (as postgres).
-- Covers: extensions, enums, tables, indexes, RLS policies, SECURITY DEFINER
-- functions (issue_receipt, void_receipt, get_public_receipt), immutability
-- triggers, Africa/Lagos date derivation, and storage buckets + policies.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 2. ENUMS
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ledger_entry_type') THEN
    CREATE TYPE public.ledger_entry_type AS ENUM (
      'sale',
      'payment_received',
      'expense',
      'adjustment'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entry_source') THEN
    CREATE TYPE public.entry_source AS ENUM ('manual', 'voice');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
    CREATE TYPE public.payment_method AS ENUM (
      'cash',
      'transfer',
      'pos',
      'credit',
      'other'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'receipt_status') THEN
    CREATE TYPE public.receipt_status AS ENUM ('issued', 'void');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'debt_status') THEN
    CREATE TYPE public.debt_status AS ENUM ('open', 'partial', 'settled', 'void');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'creditor_status') THEN
    CREATE TYPE public.creditor_status AS ENUM ('open', 'partial', 'settled');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'receipt_template_style') THEN
    CREATE TYPE public.receipt_template_style AS ENUM ('classic', 'modern', 'thermal');
  END IF;
END
$$;

-- ----------------------------------------------------------------------------
-- 3. TABLES
-- ----------------------------------------------------------------------------

-- 3.1 Businesses (multi-tenant root; each business belongs to one auth.uid())
CREATE TABLE IF NOT EXISTS public.businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) > 0),
  phone text,
  email text,
  address text,
  rc_number text,
  tax_id text,
  logo_path text,
  brand_color text NOT NULL DEFAULT '#0F5132'
    CHECK (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  receipt_prefix text NOT NULL DEFAULT 'TM'
    CHECK (receipt_prefix ~ '^[A-Z0-9]{1,8}$'),
  receipt_template public.receipt_template_style NOT NULL DEFAULT 'classic',
  receipt_footer_note text,
  currency text NOT NULL DEFAULT 'NGN' CHECK (currency = 'NGN'),
  timezone text NOT NULL DEFAULT 'Africa/Lagos' CHECK (timezone = 'Africa/Lagos'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.2 Customers
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) > 0),
  phone text,
  email text,
  address text,
  notes text,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.3 Items (saved goods & services catalog)
CREATE TABLE IF NOT EXISTS public.items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(trim(name)) > 0),
  sku text,
  unit text NOT NULL DEFAULT 'unit' CHECK (char_length(trim(unit)) > 0),
  default_price_kobo bigint NOT NULL DEFAULT 0 CHECK (default_price_kobo >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.4 Receipt Counters (per-business row locked FOR UPDATE for gap-free numbering)
CREATE TABLE IF NOT EXISTS public.receipt_counters (
  business_id uuid PRIMARY KEY REFERENCES public.businesses(id) ON DELETE CASCADE,
  last_number bigint NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.5 Receipts (immutable once issued; only voidable via void_receipt())
CREATE TABLE IF NOT EXISTS public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  public_id text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  receipt_number bigint NOT NULL CHECK (receipt_number > 0),
  receipt_code text NOT NULL CHECK (char_length(trim(receipt_code)) > 0),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL DEFAULT 'Walk-in Customer'
    CHECK (char_length(trim(customer_name)) > 0),
  customer_phone text,
  line_items jsonb NOT NULL
    CHECK (jsonb_typeof(line_items) = 'array' AND jsonb_array_length(line_items) > 0),
  subtotal_kobo bigint NOT NULL CHECK (subtotal_kobo >= 0),
  discount_kobo bigint NOT NULL DEFAULT 0
    CHECK (discount_kobo >= 0 AND discount_kobo <= subtotal_kobo),
  tax_kobo bigint NOT NULL DEFAULT 0 CHECK (tax_kobo >= 0),
  total_kobo bigint NOT NULL
    CHECK (total_kobo > 0 AND total_kobo = subtotal_kobo - discount_kobo + tax_kobo),
  amount_paid_kobo bigint NOT NULL
    CHECK (amount_paid_kobo >= 0 AND amount_paid_kobo <= total_kobo),
  balance_due_kobo bigint GENERATED ALWAYS AS (total_kobo - amount_paid_kobo) STORED,
  payment_method public.payment_method NOT NULL DEFAULT 'cash',
  status public.receipt_status NOT NULL DEFAULT 'issued',
  void_reason text,
  voided_at timestamptz,
  voided_by uuid,
  notes text,
  sold_by text,
  source public.entry_source NOT NULL DEFAULT 'manual',
  issued_at timestamptz NOT NULL DEFAULT now(),
  entry_date date NOT NULL,
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, receipt_number),
  UNIQUE (business_id, receipt_code),
  CONSTRAINT receipts_void_consistency CHECK (
    (status = 'issued' AND void_reason IS NULL AND voided_at IS NULL AND voided_by IS NULL)
    OR
    (status = 'void' AND void_reason IS NOT NULL AND char_length(trim(void_reason)) >= 3 AND voided_at IS NOT NULL)
  )
);

-- 3.6 Debts (what customers owe)
CREATE TABLE IF NOT EXISTS public.debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name text NOT NULL CHECK (char_length(trim(customer_name)) > 0),
  customer_phone text,
  receipt_id uuid UNIQUE REFERENCES public.receipts(id) ON DELETE RESTRICT,
  original_amount_kobo bigint NOT NULL CHECK (original_amount_kobo > 0),
  amount_paid_kobo bigint NOT NULL DEFAULT 0
    CHECK (amount_paid_kobo >= 0 AND amount_paid_kobo <= original_amount_kobo),
  balance_kobo bigint GENERATED ALWAYS AS (original_amount_kobo - amount_paid_kobo) STORED,
  status public.debt_status NOT NULL DEFAULT 'open',
  due_date date,
  notes text,
  sold_by text,
  source public.entry_source NOT NULL DEFAULT 'manual',
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.7 Creditors (what the business owes suppliers)
CREATE TABLE IF NOT EXISTS public.creditors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  supplier_name text NOT NULL CHECK (char_length(trim(supplier_name)) > 0),
  supplier_phone text,
  description text,
  original_amount_kobo bigint NOT NULL CHECK (original_amount_kobo > 0),
  amount_paid_kobo bigint NOT NULL DEFAULT 0
    CHECK (amount_paid_kobo >= 0 AND amount_paid_kobo <= original_amount_kobo),
  balance_kobo bigint GENERATED ALWAYS AS (original_amount_kobo - amount_paid_kobo) STORED,
  status public.creditor_status NOT NULL DEFAULT 'open',
  due_date date,
  notes text,
  source public.entry_source NOT NULL DEFAULT 'manual',
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.8 Unified Ledger Entries (digital cash book: sale, payment_received, expense, adjustment)
CREATE TABLE IF NOT EXISTS public.ledger_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  type public.ledger_entry_type NOT NULL,
  amount_kobo bigint NOT NULL CHECK (
    (type = 'adjustment' AND amount_kobo <> 0)
    OR
    (type <> 'adjustment' AND amount_kobo > 0)
  ),
  payment_method public.payment_method NOT NULL DEFAULT 'cash',
  category text,
  description text NOT NULL CHECK (char_length(trim(description)) > 0),
  customer_id uuid REFERENCES public.customers(id) ON DELETE SET NULL,
  receipt_id uuid REFERENCES public.receipts(id) ON DELETE RESTRICT,
  debt_id uuid REFERENCES public.debts(id) ON DELETE RESTRICT,
  creditor_id uuid REFERENCES public.creditors(id) ON DELETE RESTRICT,
  related_entry_id uuid REFERENCES public.ledger_entries(id) ON DELETE RESTRICT,
  proof_path text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  entry_date date NOT NULL,
  sold_by text,
  source public.entry_source NOT NULL DEFAULT 'manual',
  created_by uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 3.9 Day Closures (locks edits to a closed Africa/Lagos calendar date)
CREATE TABLE IF NOT EXISTS public.day_closures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  closure_date date NOT NULL,
  total_sales_kobo bigint NOT NULL DEFAULT 0 CHECK (total_sales_kobo >= 0),
  total_payments_received_kobo bigint NOT NULL DEFAULT 0 CHECK (total_payments_received_kobo >= 0),
  total_expenses_kobo bigint NOT NULL DEFAULT 0 CHECK (total_expenses_kobo >= 0),
  total_adjustments_kobo bigint NOT NULL DEFAULT 0,
  expected_cash_kobo bigint NOT NULL DEFAULT 0,
  actual_cash_counted_kobo bigint CHECK (actual_cash_counted_kobo IS NULL OR actual_cash_counted_kobo >= 0),
  variance_kobo bigint GENERATED ALWAYS AS (
    CASE
      WHEN actual_cash_counted_kobo IS NULL THEN NULL
      ELSE actual_cash_counted_kobo - expected_cash_kobo
    END
  ) STORED,
  notes text,
  closed_by uuid NOT NULL DEFAULT auth.uid(),
  closed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (business_id, closure_date)
);

-- 3.10 Analytics Events
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  event_name text NOT NULL CHECK (char_length(trim(event_name)) > 0),
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 4. INDEXES
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_businesses_owner_id
  ON public.businesses(owner_id);

CREATE INDEX IF NOT EXISTS idx_customers_business_name
  ON public.customers(business_id, name);

CREATE INDEX IF NOT EXISTS idx_items_business_active
  ON public.items(business_id, is_active, name);

CREATE INDEX IF NOT EXISTS idx_receipts_business_issued
  ON public.receipts(business_id, issued_at DESC);

CREATE INDEX IF NOT EXISTS idx_receipts_business_date
  ON public.receipts(business_id, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_receipts_public_id
  ON public.receipts(public_id);

CREATE INDEX IF NOT EXISTS idx_ledger_business_date
  ON public.ledger_entries(business_id, entry_date DESC, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_business_type
  ON public.ledger_entries(business_id, type, entry_date DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_receipt_id
  ON public.ledger_entries(receipt_id) WHERE receipt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_debts_business_status
  ON public.debts(business_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_creditors_business_status
  ON public.creditors(business_id, status, due_date);

CREATE INDEX IF NOT EXISTS idx_day_closures_business_date
  ON public.day_closures(business_id, closure_date DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_business_created
  ON public.analytics_events(business_id, created_at DESC);

-- ----------------------------------------------------------------------------
-- 5. TRIGGERS & IMMUTABILITY ENFORCEMENT
-- ----------------------------------------------------------------------------

-- 5.1 Generic updated_at timestamp trigger
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_businesses_updated_at ON public.businesses;
CREATE TRIGGER set_businesses_updated_at
  BEFORE UPDATE ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS set_customers_updated_at ON public.customers;
CREATE TRIGGER set_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS set_items_updated_at ON public.items;
CREATE TRIGGER set_items_updated_at
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS set_receipt_counters_updated_at ON public.receipt_counters;
CREATE TRIGGER set_receipt_counters_updated_at
  BEFORE UPDATE ON public.receipt_counters
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS set_debts_updated_at ON public.debts;
CREATE TRIGGER set_debts_updated_at
  BEFORE UPDATE ON public.debts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

DROP TRIGGER IF EXISTS set_creditors_updated_at ON public.creditors;
CREATE TRIGGER set_creditors_updated_at
  BEFORE UPDATE ON public.creditors
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 5.2 Auto-initialize receipt_counters when a business is created
CREATE OR REPLACE FUNCTION public.tg_init_receipt_counter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.receipt_counters (business_id, last_number)
  VALUES (NEW.id, 0)
  ON CONFLICT (business_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS init_business_receipt_counter ON public.businesses;
CREATE TRIGGER init_business_receipt_counter
  AFTER INSERT ON public.businesses
  FOR EACH ROW EXECUTE FUNCTION public.tg_init_receipt_counter();

-- 5.3 Auto-sync status for debts & creditors
CREATE OR REPLACE FUNCTION public.tg_sync_debt_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status <> 'void' THEN
    IF NEW.amount_paid_kobo = 0 THEN
      NEW.status := 'open';
    ELSIF NEW.amount_paid_kobo < NEW.original_amount_kobo THEN
      NEW.status := 'partial';
    ELSE
      NEW.status := 'settled';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_debt_status ON public.debts;
CREATE TRIGGER sync_debt_status
  BEFORE INSERT OR UPDATE ON public.debts
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_debt_status();

CREATE OR REPLACE FUNCTION public.tg_sync_creditor_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.amount_paid_kobo = 0 THEN
    NEW.status := 'open';
  ELSIF NEW.amount_paid_kobo < NEW.original_amount_kobo THEN
    NEW.status := 'partial';
  ELSE
    NEW.status := 'settled';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_creditor_status ON public.creditors;
CREATE TRIGGER sync_creditor_status
  BEFORE INSERT OR UPDATE ON public.creditors
  FOR EACH ROW EXECUTE FUNCTION public.tg_sync_creditor_status();

-- 5.4 Receipt immutability trigger (blocks direct INSERT/UPDATE/DELETE)
CREATE OR REPLACE FUNCTION public.tg_enforce_receipt_immutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF current_setting('tallymark.via_issue_receipt', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'Direct INSERT into receipts is forbidden. Use issue_receipt().';
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

    -- Guarantee no financial or identity fields were altered during voiding
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.business_id IS DISTINCT FROM OLD.business_id
       OR NEW.public_id IS DISTINCT FROM OLD.public_id
       OR NEW.receipt_number IS DISTINCT FROM OLD.receipt_number
       OR NEW.receipt_code IS DISTINCT FROM OLD.receipt_code
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

DROP TRIGGER IF EXISTS enforce_receipt_immutability ON public.receipts;
CREATE TRIGGER enforce_receipt_immutability
  BEFORE INSERT OR UPDATE OR DELETE ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_receipt_immutability();

-- 5.5 Ledger entries: Africa/Lagos entry_date + closed-day & receipt protection
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

DROP TRIGGER IF EXISTS enforce_ledger_rules ON public.ledger_entries;
CREATE TRIGGER enforce_ledger_rules
  BEFORE INSERT OR UPDATE OR DELETE ON public.ledger_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_enforce_ledger_rules();

-- 5.6 Financial table delete protection for debts, creditors, day_closures, receipt_counters
CREATE OR REPLACE FUNCTION public.tg_block_financial_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF current_setting('tallymark.allow_cascade_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'Financial records in % cannot be deleted.', TG_TABLE_NAME;
END;
$$;

DROP TRIGGER IF EXISTS block_debts_delete ON public.debts;
CREATE TRIGGER block_debts_delete
  BEFORE DELETE ON public.debts
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_financial_delete();

DROP TRIGGER IF EXISTS block_creditors_delete ON public.creditors;
CREATE TRIGGER block_creditors_delete
  BEFORE DELETE ON public.creditors
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_financial_delete();

DROP TRIGGER IF EXISTS block_day_closures_delete ON public.day_closures;
CREATE TRIGGER block_day_closures_delete
  BEFORE DELETE ON public.day_closures
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_financial_delete();

DROP TRIGGER IF EXISTS block_receipt_counters_delete ON public.receipt_counters;
CREATE TRIGGER block_receipt_counters_delete
  BEFORE DELETE ON public.receipt_counters
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_financial_delete();

-- Day closures cannot be updated once sealed
CREATE OR REPLACE FUNCTION public.tg_block_day_closure_update()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Closed days cannot be modified once sealed.';
END;
$$;

DROP TRIGGER IF EXISTS block_day_closures_update ON public.day_closures;
CREATE TRIGGER block_day_closures_update
  BEFORE UPDATE ON public.day_closures
  FOR EACH ROW EXECUTE FUNCTION public.tg_block_day_closure_update();

-- ----------------------------------------------------------------------------
-- 6. SECURITY DEFINER FUNCTIONS
-- ----------------------------------------------------------------------------

-- 6.1 Atomically issue a receipt, its SALE ledger entry, and (if balance due) its debt
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

  -- Verify business ownership
  SELECT * INTO v_business
  FROM public.businesses
  WHERE id = p_business_id
    AND owner_id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Unauthorized: business not found or not owned by user.';
  END IF;

  -- Verify optional customer belongs to the same business
  IF p_customer_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.customers c
      WHERE c.id = p_customer_id AND c.business_id = p_business_id
    ) THEN
      RAISE EXCEPTION 'Customer does not belong to this business.';
    END IF;
  END IF;

  -- Validate and normalize line items server-side
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

    v_unit := COALESCE(NULLIF(trim(COALESCE(v_item->>'unit', '')), ''), 'unit');
    v_item_id := NULLIF(trim(COALESCE(v_item->>'item_id', '')), '')::uuid;

    IF v_item_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.items i WHERE i.id = v_item_id AND i.business_id = p_business_id
    ) THEN
      RAISE EXCEPTION 'Referenced item % does not belong to this business.', v_item_id;
    END IF;

    v_line_total := round(v_qty * v_unit_price)::bigint;
    v_subtotal_kobo := v_subtotal_kobo + v_line_total;

    v_clean_items := v_clean_items || jsonb_build_array(
      jsonb_build_object(
        'item_id', v_item_id,
        'description', v_desc,
        'quantity', v_qty,
        'unit', v_unit,
        'unit_price_kobo', v_unit_price,
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

  -- Prevent issuing normal sales onto a closed day
  IF EXISTS (
    SELECT 1 FROM public.day_closures dc
    WHERE dc.business_id = p_business_id AND dc.closure_date = v_entry_date
  ) THEN
    RAISE EXCEPTION 'Day % is closed. Cannot issue a receipt for a closed day.', v_entry_date;
  END IF;

  v_customer_name := COALESCE(NULLIF(trim(COALESCE(p_customer_name, '')), ''), 'Walk-in Customer');

  -- Lock per-business counter row for gap-free sequential receipt numbers
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

  v_receipt_code := v_business.receipt_prefix || '-' || lpad(v_next_number::text, 5, '0');

  -- Insert immutable receipt (guarded by tallymark.via_issue_receipt)
  PERFORM set_config('tallymark.via_issue_receipt', 'on', true);

  INSERT INTO public.receipts (
    business_id,
    receipt_number,
    receipt_code,
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

  -- Create debt row when applicable (unpaid balance > 0)
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

  -- Create corresponding SALE entry in the unified ledger
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

-- 6.2 Void an issued receipt (preserves row, records reason, posts visible reversal entry)
CREATE OR REPLACE FUNCTION public.void_receipt(
  p_receipt_id uuid,
  p_reason text
)
RETURNS public.receipts
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid;
  v_reason text;
  v_receipt public.receipts%ROWTYPE;
  v_owner_id uuid;
  v_sale_entry_id uuid;
  v_now timestamptz := now();
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required.';
  END IF;

  v_reason := trim(COALESCE(p_reason, ''));
  IF char_length(v_reason) < 3 THEN
    RAISE EXCEPTION 'A void reason of at least 3 characters is required.';
  END IF;

  SELECT r.*
  INTO v_receipt
  FROM public.receipts r
  WHERE r.id = p_receipt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Receipt not found.';
  END IF;

  SELECT owner_id INTO v_owner_id
  FROM public.businesses
  WHERE id = v_receipt.business_id;

  IF v_owner_id IS DISTINCT FROM v_uid THEN
    RAISE EXCEPTION 'Unauthorized: you do not own this receipt.';
  END IF;

  IF v_receipt.status <> 'issued' THEN
    RAISE EXCEPTION 'Receipt % is already voided.', v_receipt.receipt_code;
  END IF;

  -- Perform controlled void update
  PERFORM set_config('tallymark.via_void_receipt', 'on', true);

  UPDATE public.receipts
  SET status = 'void',
      void_reason = v_reason,
      voided_at = v_now,
      voided_by = v_uid
  WHERE id = p_receipt_id
  RETURNING * INTO v_receipt;

  PERFORM set_config('tallymark.via_void_receipt', 'off', true);

  -- Void any open/partial debt linked to this receipt
  UPDATE public.debts
  SET status = 'void',
      notes = COALESCE(notes || ' | ', '') || 'Voided with receipt: ' || v_reason,
      updated_at = v_now
  WHERE receipt_id = p_receipt_id
    AND status IN ('open', 'partial');

  -- Locate original SALE ledger entry to link the visible adjustment
  SELECT id INTO v_sale_entry_id
  FROM public.ledger_entries
  WHERE receipt_id = p_receipt_id
    AND type = 'sale'
  LIMIT 1;

  INSERT INTO public.ledger_entries (
    business_id,
    type,
    amount_kobo,
    payment_method,
    category,
    description,
    customer_id,
    receipt_id,
    related_entry_id,
    occurred_at,
    entry_date,
    sold_by,
    source,
    created_by
  )
  VALUES (
    v_receipt.business_id,
    'adjustment',
    -v_receipt.total_kobo,
    v_receipt.payment_method,
    'Void Reversal',
    'Voided receipt ' || v_receipt.receipt_code || ' — ' || v_reason,
    v_receipt.customer_id,
    v_receipt.id,
    v_sale_entry_id,
    v_now,
    (v_now AT TIME ZONE 'Africa/Lagos')::date,
    v_receipt.sold_by,
    'manual',
    v_uid
  );

  RETURN v_receipt;
END;
$$;

-- 6.3 Public receipt lookup for anon viewers (no direct table access required)
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
      'customer_name', r.customer_name,
      'line_items', r.line_items,
      'subtotal_kobo', r.subtotal_kobo,
      'discount_kobo', r.discount_kobo,
      'tax_kobo', r.tax_kobo,
      'total_kobo', r.total_kobo,
      'amount_paid_kobo', r.amount_paid_kobo,
      'balance_due_kobo', r.balance_due_kobo,
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
      'currency', b.currency
    )
  )
  INTO v_result
  FROM public.receipts r
  JOIN public.businesses b ON b.id = r.business_id
  WHERE r.public_id = v_clean_id;

  RETURN v_result;
END;
$$;

-- ----------------------------------------------------------------------------
-- 7. PERMISSIONS & ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------

-- Revoke DELETE on all financial tables from authenticated and anon
REVOKE DELETE ON public.receipts,
                 public.ledger_entries,
                 public.debts,
                 public.creditors,
                 public.day_closures,
                 public.receipt_counters
  FROM authenticated, anon;

-- Clients never insert or update receipts or receipt_counters directly
REVOKE INSERT, UPDATE ON public.receipts, public.receipt_counters FROM authenticated, anon;

-- Sealed day_closures cannot be updated directly
REVOKE UPDATE ON public.day_closures FROM authenticated, anon;

-- Public anon role has NO direct table access anywhere
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;

-- Function execution privileges
REVOKE ALL ON FUNCTION public.issue_receipt(
  uuid, jsonb, uuid, text, text, bigint, bigint, bigint,
  public.payment_method, text, text, public.entry_source, date, timestamptz
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.issue_receipt(
  uuid, jsonb, uuid, text, text, bigint, bigint, bigint,
  public.payment_method, text, text, public.entry_source, date, timestamptz
) TO authenticated;

REVOKE ALL ON FUNCTION public.void_receipt(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.void_receipt(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION public.get_public_receipt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_receipt(text) TO anon, authenticated;

-- Enable RLS on EVERY table
ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.creditors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.day_closures ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- 7.1 businesses policies (owner-only)
DROP POLICY IF EXISTS businesses_select_own ON public.businesses;
CREATE POLICY businesses_select_own ON public.businesses
  FOR SELECT TO authenticated
  USING (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS businesses_insert_own ON public.businesses;
CREATE POLICY businesses_insert_own ON public.businesses
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS businesses_update_own ON public.businesses;
CREATE POLICY businesses_update_own ON public.businesses
  FOR UPDATE TO authenticated
  USING (owner_id = (SELECT auth.uid()))
  WITH CHECK (owner_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS businesses_delete_own ON public.businesses;
CREATE POLICY businesses_delete_own ON public.businesses
  FOR DELETE TO authenticated
  USING (owner_id = (SELECT auth.uid()));

-- 7.2 customers policies
DROP POLICY IF EXISTS customers_select_own ON public.customers;
CREATE POLICY customers_select_own ON public.customers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS customers_insert_own ON public.customers;
CREATE POLICY customers_insert_own ON public.customers
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS customers_update_own ON public.customers;
CREATE POLICY customers_update_own ON public.customers
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS customers_delete_own ON public.customers;
CREATE POLICY customers_delete_own ON public.customers
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ));

-- 7.3 items policies
DROP POLICY IF EXISTS items_select_own ON public.items;
CREATE POLICY items_select_own ON public.items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS items_insert_own ON public.items;
CREATE POLICY items_insert_own ON public.items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS items_update_own ON public.items;
CREATE POLICY items_update_own ON public.items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS items_delete_own ON public.items;
CREATE POLICY items_delete_own ON public.items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ));

-- 7.4 receipt_counters policies (read-only for owner; mutated only inside issue_receipt)
DROP POLICY IF EXISTS receipt_counters_select_own ON public.receipt_counters;
CREATE POLICY receipt_counters_select_own ON public.receipt_counters
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ));

-- 7.5 receipts policies (read-only for owner; mutated only via issue_receipt / void_receipt)
DROP POLICY IF EXISTS receipts_select_own ON public.receipts;
CREATE POLICY receipts_select_own ON public.receipts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ));

-- 7.6 debts policies (no DELETE)
DROP POLICY IF EXISTS debts_select_own ON public.debts;
CREATE POLICY debts_select_own ON public.debts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS debts_insert_own ON public.debts;
CREATE POLICY debts_insert_own ON public.debts
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS debts_update_own ON public.debts;
CREATE POLICY debts_update_own ON public.debts
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ));

-- 7.7 creditors policies (no DELETE)
DROP POLICY IF EXISTS creditors_select_own ON public.creditors;
CREATE POLICY creditors_select_own ON public.creditors
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS creditors_insert_own ON public.creditors;
CREATE POLICY creditors_insert_own ON public.creditors
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS creditors_update_own ON public.creditors;
CREATE POLICY creditors_update_own ON public.creditors
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ));

-- 7.8 ledger_entries policies (no DELETE; closed-day edits blocked by trigger)
DROP POLICY IF EXISTS ledger_entries_select_own ON public.ledger_entries;
CREATE POLICY ledger_entries_select_own ON public.ledger_entries
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS ledger_entries_insert_own ON public.ledger_entries;
CREATE POLICY ledger_entries_insert_own ON public.ledger_entries
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS ledger_entries_update_own ON public.ledger_entries;
CREATE POLICY ledger_entries_update_own ON public.ledger_entries
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ));

-- 7.9 day_closures policies (SELECT + INSERT only; sealed once created)
DROP POLICY IF EXISTS day_closures_select_own ON public.day_closures;
CREATE POLICY day_closures_select_own ON public.day_closures
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS day_closures_insert_own ON public.day_closures;
CREATE POLICY day_closures_insert_own ON public.day_closures
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ));

-- 7.10 analytics_events policies
DROP POLICY IF EXISTS analytics_events_select_own ON public.analytics_events;
CREATE POLICY analytics_events_select_own ON public.analytics_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS analytics_events_insert_own ON public.analytics_events;
CREATE POLICY analytics_events_insert_own ON public.analytics_events
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.businesses b
    WHERE b.id = business_id AND b.owner_id = (SELECT auth.uid())
  ));

-- ----------------------------------------------------------------------------
-- 8. STORAGE BUCKETS & POLICIES
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'logos',
    'logos',
    true,
    2097152,
    ARRAY['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml']
  ),
  (
    'expense-proofs',
    'expense-proofs',
    false,
    5242880,
    ARRAY['image/png', 'image/jpeg', 'image/webp', 'application/pdf']
  )
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Public read access for business logos (needed on /r/{id} and receipt PDFs)
DROP POLICY IF EXISTS logos_public_read ON storage.objects;
CREATE POLICY logos_public_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'logos');

-- Owner-only upload/update/delete for logos scoped by {business_id}/ prefix
DROP POLICY IF EXISTS logos_owner_insert ON storage.objects;
CREATE POLICY logos_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'logos'
    AND EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id::text = (storage.foldername(name))[1]
        AND b.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS logos_owner_update ON storage.objects;
CREATE POLICY logos_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'logos'
    AND EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id::text = (storage.foldername(name))[1]
        AND b.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    bucket_id = 'logos'
    AND EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id::text = (storage.foldername(name))[1]
        AND b.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS logos_owner_delete ON storage.objects;
CREATE POLICY logos_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'logos'
    AND EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id::text = (storage.foldername(name))[1]
        AND b.owner_id = (SELECT auth.uid())
    )
  );

-- Private owner-only access for expense-proofs scoped by {business_id}/ prefix
DROP POLICY IF EXISTS expense_proofs_owner_select ON storage.objects;
CREATE POLICY expense_proofs_owner_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'expense-proofs'
    AND EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id::text = (storage.foldername(name))[1]
        AND b.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS expense_proofs_owner_insert ON storage.objects;
CREATE POLICY expense_proofs_owner_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'expense-proofs'
    AND EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id::text = (storage.foldername(name))[1]
        AND b.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS expense_proofs_owner_update ON storage.objects;
CREATE POLICY expense_proofs_owner_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'expense-proofs'
    AND EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id::text = (storage.foldername(name))[1]
        AND b.owner_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    bucket_id = 'expense-proofs'
    AND EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id::text = (storage.foldername(name))[1]
        AND b.owner_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS expense_proofs_owner_delete ON storage.objects;
CREATE POLICY expense_proofs_owner_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'expense-proofs'
    AND EXISTS (
      SELECT 1 FROM public.businesses b
      WHERE b.id::text = (storage.foldername(name))[1]
        AND b.owner_id = (SELECT auth.uid())
    )
  );
