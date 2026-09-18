-- Migration 02: Create Companies and Jobs Tables with Row Level Security (RLS)
-- Scoped strictly to the authenticated user (auth.uid())
-- Fully idempotent: safe to run multiple times.

-- 1. Helper function for updated_at timestamp (creates if not already present from migration 01)
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at = pg_catalog.now();
    RETURN NEW;
END;
$$;

-- 2. Create companies table
CREATE TABLE IF NOT EXISTS public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    board_type TEXT NOT NULL CHECK (board_type IN ('greenhouse', 'lever', 'ashby')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, slug, board_type)
);

-- 3. Enable Row Level Security (RLS) on companies
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies for companies (idempotent with DROP POLICY IF EXISTS)
DROP POLICY IF EXISTS "Users can view their own companies" ON public.companies;
CREATE POLICY "Users can view their own companies"
    ON public.companies
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own companies" ON public.companies;
CREATE POLICY "Users can insert their own companies"
    ON public.companies
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own companies" ON public.companies;
CREATE POLICY "Users can update their own companies"
    ON public.companies
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own companies" ON public.companies;
CREATE POLICY "Users can delete their own companies"
    ON public.companies
    FOR DELETE
    USING (auth.uid() = user_id);

-- 5. Set updated_at trigger for companies
DROP TRIGGER IF EXISTS set_companies_updated_at ON public.companies;
CREATE TRIGGER set_companies_updated_at
    BEFORE UPDATE ON public.companies
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 6. Create jobs table
CREATE TABLE IF NOT EXISTS public.jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    company_name TEXT NOT NULL,
    location TEXT NOT NULL,
    job_url TEXT NOT NULL,
    description TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'feed' CHECK (source IN ('feed', 'manual')),
    needs_eligibility_check BOOLEAN NOT NULL DEFAULT false,
    dismissed BOOLEAN NOT NULL DEFAULT false,
    score_status TEXT NOT NULL DEFAULT 'pending' CHECK (score_status IN ('pending', 'scored', 'failed')),
    fit_score INTEGER,
    match_analysis JSONB,
    seniority_match TEXT CHECK (seniority_match IN ('under', 'fit', 'over')),
    scored_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, job_url)
);

-- Ensure column 'dismissed' exists if table was created in an earlier run
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS dismissed BOOLEAN NOT NULL DEFAULT false;

-- Update score_status check constraint if needed
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_score_status_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_score_status_check CHECK (score_status IN ('pending', 'scored', 'failed'));

-- 7. Enable Row Level Security (RLS) on jobs
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- 8. Create RLS Policies for jobs (idempotent + enforces company_id belongs to same user_id)
DROP POLICY IF EXISTS "Users can view their own jobs" ON public.jobs;
CREATE POLICY "Users can view their own jobs"
    ON public.jobs
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own jobs" ON public.jobs;
CREATE POLICY "Users can insert their own jobs"
    ON public.jobs
    FOR INSERT
    WITH CHECK (
        auth.uid() = user_id
        AND (
            company_id IS NULL
            OR EXISTS (
                SELECT 1 FROM public.companies c
                WHERE c.id = company_id AND c.user_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Users can update their own jobs" ON public.jobs;
CREATE POLICY "Users can update their own jobs"
    ON public.jobs
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (
        auth.uid() = user_id
        AND (
            company_id IS NULL
            OR EXISTS (
                SELECT 1 FROM public.companies c
                WHERE c.id = company_id AND c.user_id = auth.uid()
            )
        )
    );

DROP POLICY IF EXISTS "Users can delete their own jobs" ON public.jobs;
CREATE POLICY "Users can delete their own jobs"
    ON public.jobs
    FOR DELETE
    USING (auth.uid() = user_id);

-- 9. Set updated_at trigger for jobs
DROP TRIGGER IF EXISTS set_jobs_updated_at ON public.jobs;
CREATE TRIGGER set_jobs_updated_at
    BEFORE UPDATE ON public.jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 10. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_user_id_created_at ON public.jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_jobs_company_id ON public.jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_companies_user_id ON public.companies(user_id);
