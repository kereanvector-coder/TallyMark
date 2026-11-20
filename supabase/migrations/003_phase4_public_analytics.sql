-- ============================================================================
-- TALLYMARK — PHASE 4 MIGRATION: PUBLIC LANDING PAGE ANALYTICS
-- ============================================================================
-- Run AFTER schema.sql, 001_phase1b_receipts_and_onboarding.sql,
-- and 002_phase2_digital_cashbook.sql.
-- Enables first-party anonymous marketing & demo event logging via the
-- rate-limited server endpoint (/api/analytics) using service_role, while
-- keeping public SELECT/INSERT blocked under RLS.
-- ============================================================================

ALTER TABLE public.analytics_events
  ALTER COLUMN business_id DROP NOT NULL,
  ALTER COLUMN user_id DROP NOT NULL,
  ALTER COLUMN user_id DROP DEFAULT;

CREATE INDEX IF NOT EXISTS idx_analytics_events_event_created
  ON public.analytics_events(event_name, created_at DESC);
