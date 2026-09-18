-- Migration 04: Add score_error column to jobs for logging readable failure reasons
-- Scoped strictly to the authenticated user (auth.uid())
-- Fully idempotent: safe to run multiple times.

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS score_error TEXT;
