-- Migration 07: Create Cron Runs Logging Table with Row Level Security (RLS)
-- Scoped strictly to the authenticated user (auth.uid()) for SELECT.
-- Service role operations bypass RLS and perform INSERT/UPDATE.
-- Fully idempotent: safe to run multiple times.

-- 1. Create cron_runs table
CREATE TABLE IF NOT EXISTS public.cron_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'partial', 'failed')),
    stopped_reason TEXT NOT NULL DEFAULT 'done' CHECK (stopped_reason IN ('cap', 'time', 'rate_limit', 'done', 'error')),
    fetched INTEGER NOT NULL DEFAULT 0,
    matched INTEGER NOT NULL DEFAULT 0,
    inserted INTEGER NOT NULL DEFAULT 0,
    scored INTEGER NOT NULL DEFAULT 0,
    errors JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure stopped_reason column exists if table was created in an earlier iteration
ALTER TABLE public.cron_runs ADD COLUMN IF NOT EXISTS stopped_reason TEXT NOT NULL DEFAULT 'done';

-- 2. Enable Row Level Security (RLS) on cron_runs
ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies for cron_runs (SELECT only for authenticated user)
DROP POLICY IF EXISTS "Users can view their own cron runs" ON public.cron_runs;
CREATE POLICY "Users can view their own cron runs"
    ON public.cron_runs
    FOR SELECT
    USING (auth.uid() = user_id);

-- Explicitly drop any write policies to ensure strict service-role-only writes
DROP POLICY IF EXISTS "Users can insert their own cron runs" ON public.cron_runs;
DROP POLICY IF EXISTS "Users can update their own cron runs" ON public.cron_runs;
DROP POLICY IF EXISTS "Users can delete their own cron runs" ON public.cron_runs;

-- 4. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_cron_runs_user_started ON public.cron_runs(user_id, started_at DESC);
