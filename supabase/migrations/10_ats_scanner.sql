-- Migration 10: ATS Keyword Scanner Cache, Fingerprint & Coverage Columns
-- Scoped strictly to the authenticated user (auth.uid())
-- Fully idempotent: safe to run multiple times.

-- 1. Add ATS scanner columns to public.jobs table
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS ats_scan JSONB;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS ats_coverage INTEGER;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS ats_scanned_at TIMESTAMPTZ;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS ats_model TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS ats_resume_fingerprint TEXT;

-- 2. Performance Index for user jobs and ATS coverage
CREATE INDEX IF NOT EXISTS idx_jobs_user_ats_coverage ON public.jobs(user_id, ats_coverage);
