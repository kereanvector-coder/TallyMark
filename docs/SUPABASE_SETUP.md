# Tallymark — Supabase Setup Guide (Phase 1A)

Follow these steps in your Supabase project dashboard before starting Phase 1B.

---

## 1. Create the Supabase Project
1. Go to [supabase.com](https://supabase.com) and create a new project named **Tallymark**.
2. Choose a region close to Nigeria (recommended: **Europe West (London) — `eu-west-2`** or **Ireland — `eu-west-1`**).
3. Save your database password securely.

---

## 2. Run the Schema SQL & Phase Migrations
1. In the Supabase Dashboard, open **SQL Editor → New Query**.
2. Copy the entire contents of `supabase/schema.sql` and paste it into the editor.
3. Click **Run** (⌘/Ctrl + Enter).
4. Next, open another **New Query** tab, paste `supabase/migrations/001_phase1b_receipts_and_onboarding.sql`, and click **Run**.
5. Next, open another **New Query** tab, paste `supabase/migrations/002_phase2_digital_cashbook.sql`, and click **Run**.
6. Next, open another **New Query** tab, paste `supabase/migrations/003_phase4_public_analytics.sql`, and click **Run**.
7. Verify there are no errors. Together these create:
   - All enums (`'card'` included) and 11 tables (`businesses`, `customers`, `items`, `receipt_counters`, `receipts`, `debts`, `creditors`, `ledger_entries`, `day_closures`, `entry_corrections`, `analytics_events`)
   - Phase 1B & Phase 2 business fields (VAT toggle & mode, invoice/quote prefixes, bank accounts, opening cash balance, close-day reminder time) and linked receipt/ledger columns
   - Indexes, RLS policies on every table, immutability triggers, and Africa/Lagos date triggers
   - `SECURITY DEFINER` functions: `issue_receipt`, `record_payment`, `void_receipt`, `get_public_receipt`, `delete_owner_data`, `create_quick_sale`, `create_quick_credit_sale`, `issue_receipt_for_quick_sale`, `record_debt_payment`, `delete_open_expense`, `correct_closed_day_entry`, `close_day`, `pay_creditor`
   - Storage buckets (`logos` public, `expense-proofs` private) and prefix-scoped policies

---

## 3. Run the Verification SQL Tests
1. Open a new tab in **SQL Editor → New Query**.
2. Paste `supabase/tests/rls_and_immutability_tests.sql` and click **Run** → confirm `ALL PHASE 1A TESTS PASSED SUCCESSFULLY.`
3. Open another tab, paste `supabase/tests/phase2_cashbook_and_rls_tests.sql`, and click **Run** → confirm `ALL PHASE 2 CASH BOOK & RLS TESTS PASSED SUCCESSFULLY.`
   *(Both test scripts end with `ROLLBACK;` so zero test records remain in your database.)*

---

## 4. Verify Storage Buckets
1. Open **Storage** in the left sidebar.
2. Confirm two buckets exist:
   - `logos` (marked **Public**)
   - `expense-proofs` (marked **Private**)

---

## 5. Enable Authentication Providers
Open **Authentication → Providers**:

### A. Email (Magic Link Fallback)
1. Click **Email**.
2. Ensure **Enable Email provider** is **ON**.
3. Ensure **Confirm email** is **ON** (required for magic links / OTP).

### B. Google Sign-In
1. In Google Cloud Console (**APIs & Services → Credentials**), create an **OAuth 2.0 Client ID** (Web application).
2. Add this Authorized Redirect URI in Google Cloud Console:
   `https://<YOUR-PROJECT-REF>.supabase.co/auth/v1/callback`
3. Back in Supabase Dashboard (**Authentication → Providers → Google**):
   - Toggle **Enable Sign in with Google** to **ON**.
   - Paste your Google **Client ID** and **Client Secret**.
   - Save.

---

## 6. Configure Redirect URLs
Open **Authentication → URL Configuration**:
1. **Site URL**: set to your primary app URL (e.g. `https://ais-dev-b32gm5vagkpcveizvrqw4j-116639572141.europe-west2.run.app` during development, or your production custom domain).
2. **Redirect URLs** — add all of the following:
   - `http://localhost:3000/auth/callback`
   - `https://ais-dev-b32gm5vagkpcveizvrqw4j-116639572141.europe-west2.run.app/auth/callback`
   - `https://ais-pre-b32gm5vagkpcveizvrqw4j-116639572141.europe-west2.run.app/auth/callback`
   - *(Plus your production domain `/auth/callback` when deployed.)*

---

## 7. Add Secrets in AI Studio
Open **Project Settings → API** in Supabase to copy your keys, then add these exact Secrets in the AI Studio **Secrets** panel:

| Secret Name | Source in Supabase Dashboard | Exposure |
|---|---|---|
| `SUPABASE_URL` | Project Settings → API → Project URL | Public / Server |
| `SUPABASE_ANON_KEY` | Project Settings → API → `anon` `public` key | Browser-safe (protected by RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | Project Settings → API → `service_role` `secret` key | **Server-only** (never expose to client) |
