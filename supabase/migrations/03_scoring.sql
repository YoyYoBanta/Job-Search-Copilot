-- Migration 03: AI Scoring, Candidate Seniority Profile & Feedback
-- Scoped strictly to the authenticated user (auth.uid())
-- Fully idempotent: safe to run multiple times.

-- 1. Add candidate experience & target role columns to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS total_years_experience NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS pm_years_experience NUMERIC NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS target_roles TEXT[] NOT NULL DEFAULT '{}';

-- 2. Add scored_model column to jobs
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS scored_model TEXT;

-- 3. Create feedback table for fit score sanity ratings (thumbs up/down)
CREATE TABLE IF NOT EXISTS public.feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    rating TEXT NOT NULL CHECK (rating IN ('up', 'down')),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, job_id)
);

-- 4. Enable Row Level Security (RLS) on feedback
ALTER TABLE public.feedback ENABLE ROW LEVEL SECURITY;

-- 5. Create RLS Policies for feedback (idempotent)
DROP POLICY IF EXISTS "Users can view their own feedback" ON public.feedback;
CREATE POLICY "Users can view their own feedback"
    ON public.feedback
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own feedback" ON public.feedback;
CREATE POLICY "Users can insert their own feedback"
    ON public.feedback
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own feedback" ON public.feedback;
CREATE POLICY "Users can update their own feedback"
    ON public.feedback
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own feedback" ON public.feedback;
CREATE POLICY "Users can delete their own feedback"
    ON public.feedback
    FOR DELETE
    USING (auth.uid() = user_id);

-- 6. Set updated_at trigger for feedback
DROP TRIGGER IF EXISTS set_feedback_updated_at ON public.feedback;
CREATE TRIGGER set_feedback_updated_at
    BEFORE UPDATE ON public.feedback
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 7. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_feedback_user_job ON public.feedback(user_id, job_id);
CREATE INDEX IF NOT EXISTS idx_jobs_fit_score ON public.jobs(user_id, fit_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_jobs_score_status ON public.jobs(user_id, score_status);
