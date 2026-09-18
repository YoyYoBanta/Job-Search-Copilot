-- Migration 02: Create Companies and Jobs Tables with Row Level Security (RLS)
-- Scoped strictly to the authenticated user (auth.uid())

-- 1. Create companies table
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

-- 2. Enable Row Level Security (RLS) on companies
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies for companies
CREATE POLICY "Users can view their own companies"
    ON public.companies
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own companies"
    ON public.companies
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own companies"
    ON public.companies
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own companies"
    ON public.companies
    FOR DELETE
    USING (auth.uid() = user_id);

-- 4. Set updated_at trigger for companies
DROP TRIGGER IF EXISTS set_companies_updated_at ON public.companies;
CREATE TRIGGER set_companies_updated_at
    BEFORE UPDATE ON public.companies
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 5. Create jobs table
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
    score_status TEXT NOT NULL DEFAULT 'pending' CHECK (score_status IN ('pending', 'scored', 'scoring failed')),
    fit_score INTEGER,
    match_analysis JSONB,
    seniority_match TEXT CHECK (seniority_match IN ('under', 'fit', 'over')),
    scored_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, job_url)
);

-- 6. Enable Row Level Security (RLS) on jobs
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS Policies for jobs
CREATE POLICY "Users can view their own jobs"
    ON public.jobs
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own jobs"
    ON public.jobs
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own jobs"
    ON public.jobs
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own jobs"
    ON public.jobs
    FOR DELETE
    USING (auth.uid() = user_id);

-- 8. Set updated_at trigger for jobs
DROP TRIGGER IF EXISTS set_jobs_updated_at ON public.jobs;
CREATE TRIGGER set_jobs_updated_at
    BEFORE UPDATE ON public.jobs
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
