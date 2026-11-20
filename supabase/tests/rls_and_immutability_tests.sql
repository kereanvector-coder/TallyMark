-- ============================================================================
-- TALLYMARK — PHASE 1A SQL VERIFICATION TEST SUITE
-- ============================================================================
-- Run this entire script in the Supabase SQL Editor AFTER running schema.sql.
-- Wrapped in BEGIN ... ROLLBACK so it leaves zero test data in your database.
-- Proves:
--   1. Cross-tenant RLS isolation (User B cannot read or write User A's data)
--   2. Gap-free sequential receipt numbering (failed issuances do not create gaps)
--   3. Receipt immutability (direct INSERT/UPDATE/DELETE blocked; only void_receipt works)
--   4. Closed day protection (blocks edits/normal entries; permits visible adjustments)
--   5. Anon public receipt isolation (anon cannot query tables, only get_public_receipt)
-- ============================================================================

BEGIN;

DO $$
DECLARE
  v_user_a uuid := gen_random_uuid();
  v_user_b uuid := gen_random_uuid();
  v_biz_a uuid;
  v_biz_b uuid;
  v_cust_a uuid;
  v_item_a uuid;
  v_expense_a uuid;
  v_receipt_1 public.receipts%ROWTYPE;
  v_receipt_2 public.receipts%ROWTYPE;
  v_receipt_3 public.receipts%ROWTYPE;
  v_count integer;
  v_public_json jsonb;
  v_failed boolean := false;
BEGIN
  -- --------------------------------------------------------------------------
  -- SETUP: Create two test users in auth.users (rolled back at end of script)
  -- --------------------------------------------------------------------------
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at
  )
  VALUES
    (
      v_user_a, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'test-owner-a-' || v_user_a || '@tallymark.test', 'x', now(), now(), now()
    ),
    (
      v_user_b, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
      'test-owner-b-' || v_user_b || '@tallymark.test', 'x', now(), now(), now()
    );

  -- --------------------------------------------------------------------------
  -- ACT AS USER A: Create business, customer, item, expense, and issue receipt #1
  -- --------------------------------------------------------------------------
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_a, 'role', 'authenticated')::text,
    true
  );

  INSERT INTO public.businesses (owner_id, name, phone, address, receipt_prefix)
  VALUES (v_user_a, 'Amina Fabrics Ltd', '+2348012345678', 'Balogun Market, Lagos', 'AMN')
  RETURNING id INTO v_biz_a;

  INSERT INTO public.customers (business_id, name, phone)
  VALUES (v_biz_a, 'Chidi Okafor', '+2348098765432')
  RETURNING id INTO v_cust_a;

  INSERT INTO public.items (business_id, name, unit, default_price_kobo)
  VALUES (v_biz_a, 'Ankara Yard (6 yards)', 'bundle', 1500000)
  RETURNING id INTO v_item_a;

  INSERT INTO public.creditors (business_id, supplier_name, original_amount_kobo)
  VALUES (v_biz_a, 'Kano Textile Mills', 5000000);

  INSERT INTO public.ledger_entries (
    business_id, type, amount_kobo, payment_method, category, description
  )
  VALUES (
    v_biz_a, 'expense', 250000, 'cash', 'Transport', 'Dispatch rider delivery'
  )
  RETURNING id INTO v_expense_a;

  -- Issue Receipt #1 with partial payment (₦30,000 total, ₦20,000 paid -> ₦10,000 debt)
  SELECT * INTO v_receipt_1
  FROM public.issue_receipt(
    p_business_id => v_biz_a,
    p_line_items => jsonb_build_array(
      jsonb_build_object(
        'item_id', v_item_a,
        'description', 'Ankara Yard (6 yards)',
        'quantity', 2,
        'unit', 'bundle',
        'unit_price_kobo', 1500000
      )
    ),
    p_customer_id => v_cust_a,
    p_customer_name => 'Chidi Okafor',
    p_customer_phone => '+2348098765432',
    p_amount_paid_kobo => 2000000,
    p_payment_method => 'transfer'
  );

  ASSERT v_receipt_1.receipt_number = 1, 'Expected receipt_number = 1';
  ASSERT v_receipt_1.receipt_code = 'AMN-00001', 'Expected receipt_code = AMN-00001';
  ASSERT v_receipt_1.total_kobo = 3000000, 'Expected total_kobo = 3000000';
  ASSERT v_receipt_1.balance_due_kobo = 1000000, 'Expected balance_due_kobo = 1000000';

  -- Verify debt & SALE ledger entry were atomically created
  SELECT count(*) INTO v_count
  FROM public.debts
  WHERE receipt_id = v_receipt_1.id AND original_amount_kobo = 1000000;
  ASSERT v_count = 1, 'Expected automatic debt row for unpaid balance';

  SELECT count(*) INTO v_count
  FROM public.ledger_entries
  WHERE receipt_id = v_receipt_1.id AND type = 'sale' AND amount_kobo = 3000000;
  ASSERT v_count = 1, 'Expected automatic SALE ledger entry';

  -- --------------------------------------------------------------------------
  -- TEST 1 & 2: CROSS-TENANT ISOLATION (USER B CANNOT READ OR WRITE USER A)
  -- --------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_b, 'role', 'authenticated')::text,
    true
  );

  INSERT INTO public.businesses (owner_id, name, receipt_prefix)
  VALUES (v_user_b, 'Tunde Electronics', 'TND')
  RETURNING id INTO v_biz_b;

  -- User B cannot read any of User A's rows
  SELECT count(*) INTO v_count FROM public.businesses WHERE id = v_biz_a;
  ASSERT v_count = 0, 'RLS FAIL: User B read User A business';

  SELECT count(*) INTO v_count FROM public.customers WHERE business_id = v_biz_a;
  ASSERT v_count = 0, 'RLS FAIL: User B read User A customers';

  SELECT count(*) INTO v_count FROM public.items WHERE business_id = v_biz_a;
  ASSERT v_count = 0, 'RLS FAIL: User B read User A items';

  SELECT count(*) INTO v_count FROM public.receipts WHERE business_id = v_biz_a;
  ASSERT v_count = 0, 'RLS FAIL: User B read User A receipts';

  SELECT count(*) INTO v_count FROM public.ledger_entries WHERE business_id = v_biz_a;
  ASSERT v_count = 0, 'RLS FAIL: User B read User A ledger_entries';

  SELECT count(*) INTO v_count FROM public.debts WHERE business_id = v_biz_a;
  ASSERT v_count = 0, 'RLS FAIL: User B read User A debts';

  SELECT count(*) INTO v_count FROM public.creditors WHERE business_id = v_biz_a;
  ASSERT v_count = 0, 'RLS FAIL: User B read User A creditors';

  SELECT count(*) INTO v_count FROM public.receipt_counters WHERE business_id = v_biz_a;
  ASSERT v_count = 0, 'RLS FAIL: User B read User A receipt_counters';

  -- User B cannot INSERT into User A's business
  v_failed := false;
  BEGIN
    INSERT INTO public.customers (business_id, name) VALUES (v_biz_a, 'Attacker');
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := true;
  END;
  ASSERT v_failed, 'RLS FAIL: User B inserted customer into User A business';

  v_failed := false;
  BEGIN
    INSERT INTO public.ledger_entries (business_id, type, amount_kobo, description)
    VALUES (v_biz_a, 'expense', 10000, 'Fake expense');
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := true;
  END;
  ASSERT v_failed, 'RLS FAIL: User B inserted ledger entry into User A business';

  -- User B cannot UPDATE User A's business or customer
  UPDATE public.businesses SET name = 'Hacked' WHERE id = v_biz_a;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  ASSERT v_count = 0, 'RLS FAIL: User B updated User A business';

  -- User B cannot call issue_receipt or void_receipt for User A
  v_failed := false;
  BEGIN
    PERFORM public.issue_receipt(
      p_business_id => v_biz_a,
      p_line_items => '[{"description":"Hack","quantity":1,"unit_price_kobo":100}]'::jsonb
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  ASSERT v_failed, 'RPC FAIL: User B issued receipt on User A business';

  v_failed := false;
  BEGIN
    PERFORM public.void_receipt(v_receipt_1.id, 'Unauthorized void attempt');
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  ASSERT v_failed, 'RPC FAIL: User B voided User A receipt';

  -- --------------------------------------------------------------------------
  -- TEST 3: GAP-FREE RECEIPT NUMBERING (FAILED ISSUANCES LEAVE ZERO GAPS)
  -- --------------------------------------------------------------------------
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_a, 'role', 'authenticated')::text,
    true
  );

  -- Direct INSERT into receipts must fail for authenticated role
  v_failed := false;
  BEGIN
    INSERT INTO public.receipts (
      business_id, receipt_number, receipt_code, line_items,
      subtotal_kobo, total_kobo, amount_paid_kobo, entry_date
    )
    VALUES (
      v_biz_a, 999, 'AMN-00999', '[{"description":"Direct","quantity":1,"unit_price_kobo":1000}]'::jsonb,
      1000, 1000, 1000, current_date
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  ASSERT v_failed, 'IMMUTABILITY FAIL: Direct INSERT into receipts was allowed';

  -- Simulate a failed issue_receipt call (amount_paid > total) -> rolls back subtransaction
  v_failed := false;
  BEGIN
    PERFORM public.issue_receipt(
      p_business_id => v_biz_a,
      p_line_items => '[{"description":"Soap","quantity":1,"unit_price_kobo":50000}]'::jsonb,
      p_amount_paid_kobo => 999999
    );
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  ASSERT v_failed, 'Expected invalid issue_receipt call to fail';

  -- Next valid receipt MUST be #2 (no gap!)
  SELECT * INTO v_receipt_2
  FROM public.issue_receipt(
    p_business_id => v_biz_a,
    p_line_items => '[{"description":"Lace Fabric","quantity":1,"unit_price_kobo":500000}]'::jsonb,
    p_payment_method => 'cash'
  );
  ASSERT v_receipt_2.receipt_number = 2, 'GAP FAIL: Expected receipt_number = 2 after rolled-back attempt';
  ASSERT v_receipt_2.receipt_code = 'AMN-00002', 'GAP FAIL: Expected receipt_code = AMN-00002';

  -- --------------------------------------------------------------------------
  -- TEST 4: ISSUED RECEIPTS CANNOT BE EDITED OR DELETED (ONLY VOIDED)
  -- --------------------------------------------------------------------------
  v_failed := false;
  BEGIN
    UPDATE public.receipts SET total_kobo = 100 WHERE id = v_receipt_1.id;
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  ASSERT v_failed, 'IMMUTABILITY FAIL: authenticated role updated receipt directly';

  v_failed := false;
  BEGIN
    DELETE FROM public.receipts WHERE id = v_receipt_1.id;
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  ASSERT v_failed, 'IMMUTABILITY FAIL: authenticated role deleted receipt';

  -- Even as table owner/postgres, triggers must block direct UPDATE or DELETE
  RESET ROLE;
  v_failed := false;
  BEGIN
    UPDATE public.receipts SET total_kobo = 100 WHERE id = v_receipt_1.id;
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  ASSERT v_failed, 'TRIGGER FAIL: Direct UPDATE bypassed receipt immutability trigger';

  v_failed := false;
  BEGIN
    DELETE FROM public.receipts WHERE id = v_receipt_1.id;
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  ASSERT v_failed, 'TRIGGER FAIL: Direct DELETE bypassed receipt immutability trigger';

  -- Switch back to User A and void receipt #1 via void_receipt()
  SET LOCAL ROLE authenticated;
  PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', v_user_a, 'role', 'authenticated')::text,
    true
  );

  SELECT * INTO v_receipt_1
  FROM public.void_receipt(v_receipt_1.id, 'Customer cancelled order');

  ASSERT v_receipt_1.status = 'void', 'Expected receipt status = void';
  ASSERT v_receipt_1.void_reason = 'Customer cancelled order', 'Expected void_reason persisted';

  -- Verify linked debt was voided and visible adjustment entry was posted
  SELECT count(*) INTO v_count
  FROM public.debts
  WHERE receipt_id = v_receipt_1.id AND status = 'void';
  ASSERT v_count = 1, 'Expected linked debt to be marked void';

  SELECT count(*) INTO v_count
  FROM public.ledger_entries
  WHERE receipt_id = v_receipt_1.id AND type = 'adjustment' AND amount_kobo = -3000000;
  ASSERT v_count = 1, 'Expected negative adjustment ledger entry on void';

  -- --------------------------------------------------------------------------
  -- TEST 5: CLOSED DAY BLOCKS EDITS & REQUIRES VISIBLE ADJUSTMENT ENTRY
  -- --------------------------------------------------------------------------
  INSERT INTO public.day_closures (
    business_id, closure_date, total_sales_kobo, total_expenses_kobo,
    total_adjustments_kobo, expected_cash_kobo, actual_cash_counted_kobo
  )
  VALUES (
    v_biz_a, (now() AT TIME ZONE 'Africa/Lagos')::date,
    3500000, 250000, -3000000, 250000, 250000
  );

  -- Updating an entry on a closed day must fail
  v_failed := false;
  BEGIN
    UPDATE public.ledger_entries
    SET amount_kobo = 999999
    WHERE id = v_expense_a;
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  ASSERT v_failed, 'CLOSED DAY FAIL: Edited ledger entry on a closed day';

  -- Inserting a normal expense or receipt on a closed day must fail
  v_failed := false;
  BEGIN
    INSERT INTO public.ledger_entries (business_id, type, amount_kobo, description)
    VALUES (v_biz_a, 'expense', 10000, 'Late expense on closed day');
  EXCEPTION WHEN OTHERS THEN
    v_failed := true;
  END;
  ASSERT v_failed, 'CLOSED DAY FAIL: Inserted non-adjustment entry on a closed day';

  -- Inserting a visible adjustment entry on a closed day MUST succeed
  INSERT INTO public.ledger_entries (business_id, type, amount_kobo, description)
  VALUES (v_biz_a, 'adjustment', -10000, 'Correction for late dispatch fee');

  -- --------------------------------------------------------------------------
  -- TEST 6: ANON PUBLIC RECEIPT ACCESS (NO DIRECT TABLE ACCESS)
  -- --------------------------------------------------------------------------
  SET LOCAL ROLE anon;

  v_failed := false;
  BEGIN
    PERFORM count(*) FROM public.receipts;
  EXCEPTION WHEN insufficient_privilege THEN
    v_failed := true;
  END;
  ASSERT v_failed, 'ANON FAIL: anon role could query public.receipts directly';

  SELECT public.get_public_receipt(v_receipt_2.public_id) INTO v_public_json;
  ASSERT v_public_json IS NOT NULL, 'Expected public receipt JSON for valid public_id';
  ASSERT (v_public_json->'receipt'->>'receipt_code') = 'AMN-00002', 'Unexpected public receipt_code';
  ASSERT (v_public_json->'business'->>'name') = 'Amina Fabrics Ltd', 'Unexpected business name';
  ASSERT (v_public_json->'receipt' ? 'customer_phone') = false, 'Public receipt leaked customer_phone';
  ASSERT (v_public_json->'business' ? 'owner_id') = false, 'Public receipt leaked owner_id';

  RAISE NOTICE 'ALL PHASE 1A TESTS PASSED SUCCESSFULLY.';
END
$$;

ROLLBACK;
