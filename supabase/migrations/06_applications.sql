-- Migration 06: Create Applications Tracker Table with Row Level Security (RLS)
-- Scoped strictly to the authenticated user (auth.uid())
-- Fully idempotent: safe to run multiple times.

-- 1. Create applications table
CREATE TABLE IF NOT EXISTS public.applications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
    stage TEXT NOT NULL DEFAULT 'saved' CHECK (stage IN ('saved', 'referral_asked', 'applied', 'interviewing', 'offer', 'rejected', 'withdrawn')),
    applied_date DATE,
    channel TEXT DEFAULT 'company_site' CHECK (channel IN ('company_site', 'linkedin', 'referral', 'other')),
    referrer_name TEXT,
    next_follow_up_date DATE,
    notes TEXT DEFAULT '',
    stage_history JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_user_job_application UNIQUE (user_id, job_id)
);

-- 2. Enable Row Level Security (RLS) on applications
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies for applications (idempotent + enforces job_id belongs to same user_id)
DROP POLICY IF EXISTS "Users can view their own applications" ON public.applications;
CREATE POLICY "Users can view their own applications"
    ON public.applications
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own applications" ON public.applications;
CREATE POLICY "Users can insert their own applications"
    ON public.applications
    FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.jobs j
            WHERE j.id = job_id AND j.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can update their own applications" ON public.applications;
CREATE POLICY "Users can update their own applications"
    ON public.applications
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (
        auth.uid() = user_id
        AND EXISTS (
            SELECT 1 FROM public.jobs j
            WHERE j.id = job_id AND j.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Users can delete their own applications" ON public.applications;
CREATE POLICY "Users can delete their own applications"
    ON public.applications
    FOR DELETE
    USING (auth.uid() = user_id);

-- 4. Set updated_at trigger for applications using public.handle_updated_at()
DROP TRIGGER IF EXISTS set_applications_updated_at ON public.applications;
CREATE TRIGGER set_applications_updated_at
    BEFORE UPDATE ON public.applications
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 5. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_applications_user_stage ON public.applications(user_id, stage);
CREATE INDEX IF NOT EXISTS idx_applications_user_follow_up ON public.applications(user_id, next_follow_up_date);
CREATE INDEX IF NOT EXISTS idx_applications_job_id ON public.applications(job_id);
