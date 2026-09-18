-- Migration 05: Add tailored outreach columns to public.jobs
-- Scoped strictly to the authenticated user (auth.uid())
-- Fully idempotent: safe to run multiple times.

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS cover_note TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS referral_message TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS last_generated_cover_note TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS last_generated_referral TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS outreach_model TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS outreach_updated_at TIMESTAMPTZ;
