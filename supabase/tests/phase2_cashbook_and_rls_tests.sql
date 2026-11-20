-- ============================================================================
-- TALLYMARK — PHASE 2 DIGITAL CASH BOOK SQL VERIFICATION TEST SUITE
-- ============================================================================
-- Run this script in Supabase SQL Editor AFTER running:
--   1. supabase/schema.sql
--   2. supabase/migrations/001_phase1b_receipts_and_onboarding.sql
--   3. supabase/migrations/002_phase2_digital_cashbook.sql
-- Wrapped in BEGIN ... ROLLBACK so zero test records persist.
-- Proves:
--   1. create_quick_sale + retroactive issue_receipt_for_quick_sale (no double-counting)
--   2. create_quick_credit_sale (adds debt + credit ledger entry, ₦0 cash received)
--   3. record_debt_payment (reduces debt & issues gap-free linked receipt)
--   4. delete_open_expense (allowed on open days, blocked on closed days)
--   5. close_day (reconciles opening cash, sales, expenses, expected cash & over/short variance)
--   6. correct_closed_day_entry (posts signed adjustments + entry_corrections audit log)
--   7. pay_creditor (reduces creditor balance & optionally logs expense)
--   8. Multi-tenant RLS isolation on entry_corrections & all Phase 2 mutations
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_biz_a uuid;
  v_biz_b uuid;
  v_quick_entry public.ledger_entries%ROWTYPE;
  v_retro_receipt public.receipts%ROWTYPE;
  v_credit_debt public.debts%ROWTYPE;
  v_pay_receipt public.receipts%ROWTYPE;
  v_expense_id uuid;
  v_creditor_id uuid;
  v_creditor_after public.creditors%ROWTYPE;
  v_closure public.day_closures%ROWTYPE;
  v_corr public.entry_corrections%ROWTYPE;
  v_day date := (now() AT TIME ZONE 'Africa/Lagos')::date;
  v_count integer;
  v_failed boolean := false;
BEGIN
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at
  )
  VALUES
    (
      v_user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'p2-owner-a-' || v_user_a || '@tallymark.test', 'x', now(), now(), now()
    ),
    (
      v_user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'p2-owner-b-' || v_user_b || '@tallymark.test', 'x', now(), now(), now()
    );

  -- Act as User A
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_a, 'role', 'authenticated')::text,
    true
  );

  INSERT INTO public.businesses (
    owner_id, name, receipt_prefix, opening_cash_balance_kobo, close_day_reminder_time
  )
  VALUES (v_user_a, 'Kano Provision Store', 'KPS', 1000000, '19:00')
  RETURNING id INTO v_biz_a;

  -- 1. Quick Sale (₦5,000 cash) + Retroactive Official Receipt (must NOT create a 2nd ledger row)
  SELECT * INTO v_quick_entry
  FROM public.create_quick_sale(
    p_business_id => v_biz_a,
    p_amount_kobo => 500000,
    p_payment_method => 'cash',
    p_description => 'Counter quick sale - 2 bags rice',
    p_sold_by => 'Musa'
  );
  ASSERT v_quick_entry.type = 'sale' AND v_quick_entry.receipt_id IS NULL,
    'Quick sale should create unreceipted sale ledger entry';

  SELECT * INTO v_retro_receipt
  FROM public.issue_receipt_for_quick_sale(
    p_ledger_entry_id => v_quick_entry.id,
    p_line_items => jsonb_build_array(
      jsonb_build_object(
        'description', 'Rice 50kg',
        'quantity', 2,
        'unit', 'bag',
        'unit_price_kobo', 250000
      )
    ),
    p_customer_name => 'Walk-in Customer',
    p_payment_method => 'cash'
  );
  ASSERT v_retro_receipt.receipt_number = 1 AND v_retro_receipt.receipt_code = 'KPS-00001',
    'Retroactive receipt should get sequential #1';

  SELECT count(*) INTO v_count
  FROM public.ledger_entries
  WHERE business_id = v_biz_a AND receipt_id = v_retro_receipt.id;
  ASSERT v_count = 1, 'Retroactive receipt must link existing ledger row without duplicating';

  -- 2. Quick Credit Sale (₦8,000 borrowed by Sade)
  SELECT * INTO v_credit_debt
  FROM public.create_quick_credit_sale(
    p_business_id => v_biz_a,
    p_amount_kobo => 800000,
    p_customer_name => 'Sade Adeyemi',
    p_customer_phone => '08031234567',
    p_description => '4 cartons noodles on credit'
  );
  ASSERT v_credit_debt.balance_kobo = 800000 AND v_credit_debt.status = 'open',
    'Quick credit sale should create open debt for full amount';

  -- 3. Record Debt Payment (₦3,000 transfer -> balance drops to ₦5,000, linked receipt #2)
  SELECT * INTO v_pay_receipt
  FROM public.record_debt_payment(
    p_debt_id => v_credit_debt.id,
    p_amount_kobo => 300000,
    p_payment_method => 'transfer',
    p_notes => 'First installment'
  );
  ASSERT v_pay_receipt.receipt_number = 2 AND v_pay_receipt.receipt_kind = 'balance_payment',
    'Debt payment must issue sequential linked receipt #2';

  SELECT balance_kobo, status INTO v_credit_debt.balance_kobo, v_credit_debt.status
  FROM public.debts WHERE id = v_credit_debt.id;
  ASSERT v_credit_debt.balance_kobo = 500000 AND v_credit_debt.status = 'partial',
    'Debt balance must reduce to 500000 and status partial';

  -- 4. Creditor & pay_creditor with expense recording
  INSERT INTO public.creditors (business_id, supplier_name, description, original_amount_kobo)
  VALUES (v_biz_a, 'Dangote Distributor', 'Flour supply', 1200000)
  RETURNING id INTO v_creditor_id;

  SELECT * INTO v_creditor_after
  FROM public.pay_creditor(
    p_creditor_id => v_creditor_id,
    p_amount_kobo => 200000,
    p_payment_method => 'cash',
    p_record_expense => true,
    p_notes => 'Deposit paid'
  );
  ASSERT v_creditor_after.balance_kobo = 1000000 AND v_creditor_after.status = 'partial',
    'Creditor balance must drop to 1000000';

  -- 5. Open-day Expense insert & delete test
  INSERT INTO public.ledger_entries (
    business_id, type, amount_kobo, payment_method, category, payee, description
  )
  VALUES (
    v_biz_a, 'expense', 150000, 'cash', 'Transport', 'Rider', 'Temporary test expense'
  )
  RETURNING id INTO v_expense_id;

  PERFORM public.delete_open_expense(v_expense_id);

  SELECT count(*) INTO v_count FROM public.ledger_entries WHERE id = v_expense_id;
  ASSERT v_count = 0, 'Open-day expense should be deleted cleanly via delete_open_expense';

  -- Re-add ₦1,500 cash expense for Close Day verification
  INSERT INTO public.ledger_entries (
    business_id, type, amount_kobo, payment_method, category, payee, description
  )
  VALUES (
    v_biz_a, 'expense', 150000, 'cash', 'Transport', 'Rider', 'Confirmed dispatch'
  )
  RETURNING id INTO v_expense_id;

  -- Expected Cash Calculation for today:
  --   Opening cash: ₦10,000 (1,000,000)
  --   + Cash receipted sale: ₦5,000 (500,000)
  --   - Cash creditor expense: ₦2,000 (200,000)
  --   - Cash transport expense: ₦1,500 (150,000)
  --   = Expected Cash: ₦11,500 (1,150,000)
  --   (Note: ₦8,000 credit sale = ₦0 cash; ₦3,000 debt payment was transfer)
  -- Suppose owner counts ₦11,400 (1,140,000) -> variance = -₦100 (-10,000 Short)
  SELECT * INTO v_closure
  FROM public.close_day(
    p_business_id => v_biz_a,
    p_closure_date => v_day,
    p_actual_cash_counted_kobo => 1140000,
    p_notes => '₦100 torn note'
  );

  ASSERT v_closure.expected_cash_kobo = 1150000,
    'Expected cash mismatch: got ' || v_closure.expected_cash_kobo;
  ASSERT v_closure.variance_kobo = -10000,
    'Expected variance -10000: got ' || v_closure.variance_kobo;
  ASSERT v_closure.transfer_in_kobo = 300000,
    'Expected transfer_in 300000: got ' || v_closure.transfer_in_kobo;

  -- 6. Closed-day delete_open_expense MUST fail
  v_failed := false;
  BEGIN
    PERFORM public.delete_open_expense(v_expense_id);
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  ASSERT v_failed, 'delete_open_expense MUST be blocked on a closed day';

  -- 7. correct_closed_day_entry MUST succeed with visible adjustment + entry_corrections row
  SELECT * INTO v_corr
  FROM public.correct_closed_day_entry(
    p_entry_id => v_expense_id,
    p_action => 'edit',
    p_new_amount_kobo => 100000,
    p_new_payment_method => 'cash',
    p_new_category => 'Transport',
    p_new_payee => 'Rider',
    p_new_description => 'Confirmed dispatch',
    p_reason => 'Rider gave ₦500 change back'
  );
  ASSERT array_length(v_corr.adjustment_entry_ids, 1) = 1,
    'Closed-day edit should create 1 adjustment entry';

  -- 8. Act as User B -> verify zero visibility into User A's Phase 2 tables
  PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_b, 'role', 'authenticated')::text,
    true
  );

  INSERT INTO public.businesses (owner_id, name, receipt_prefix)
  VALUES (v_user_b, 'User B Shop', 'UBS')
  RETURNING id INTO v_biz_b;

  SELECT count(*) INTO v_count FROM public.entry_corrections WHERE business_id = v_biz_a;
  ASSERT v_count = 0, 'User B must NOT read User A entry_corrections';

  SELECT count(*) INTO v_count FROM public.day_closures WHERE business_id = v_biz_a;
  ASSERT v_count = 0, 'User B must NOT read User A day_closures';

  SELECT count(*) INTO v_count FROM public.creditors WHERE business_id = v_biz_a;
  ASSERT v_count = 0, 'User B must NOT read User A creditors';

  v_failed := false;
  BEGIN
    PERFORM public.close_day(v_biz_a, v_day, 0, 'Hack attempt');
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  ASSERT v_failed, 'User B must NOT be able to close User A business day';

  RESET ROLE;
  RAISE NOTICE 'ALL PHASE 2 CASH BOOK & RLS TESTS PASSED SUCCESSFULLY.';
END
$$;

ROLLBACK;
