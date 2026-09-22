-- Migration 08: JSearch Job Source, Search Queries, Cross-Source Deduplication & Scoring Pre-filtering
-- Scoped strictly to the authenticated user (auth.uid())
-- Fully idempotent: safe to run multiple times.

-- 1. Create search_queries table
CREATE TABLE IF NOT EXISTS public.search_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    query TEXT NOT NULL,
    country TEXT NOT NULL DEFAULT 'in',
    date_posted TEXT NOT NULL DEFAULT 'week',
    enabled BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_user_query UNIQUE (user_id, query)
);

-- 2. Enable Row Level Security (RLS) on search_queries
ALTER TABLE public.search_queries ENABLE ROW LEVEL SECURITY;

-- 3. Create RLS Policies for search_queries
DROP POLICY IF EXISTS "Users can view their own search queries" ON public.search_queries;
CREATE POLICY "Users can view their own search queries"
    ON public.search_queries
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own search queries" ON public.search_queries;
CREATE POLICY "Users can insert their own search queries"
    ON public.search_queries
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own search queries" ON public.search_queries;
CREATE POLICY "Users can update their own search queries"
    ON public.search_queries
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own search queries" ON public.search_queries;
CREATE POLICY "Users can delete their own search queries"
    ON public.search_queries
    FOR DELETE
    USING (auth.uid() = user_id);

-- 4. Set updated_at trigger for search_queries
DROP TRIGGER IF EXISTS set_search_queries_updated_at ON public.search_queries;
CREATE TRIGGER set_search_queries_updated_at
    BEFORE UPDATE ON public.search_queries
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 5. Seed default search queries for the owner user (profiles table user)
INSERT INTO public.search_queries (user_id, query, country, date_posted, enabled)
SELECT p.user_id, q.query, 'in', 'week', true
FROM public.profiles p
CROSS JOIN (
    VALUES
        ('Associate Product Manager in India'),
        ('Product Manager remote India'),
        ('APM Bengaluru')
) AS q(query)
ON CONFLICT (user_id, query) DO NOTHING;

-- 6. Add columns to jobs table
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS external_id TEXT;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS apply_options JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 7. Update jobs source CHECK constraint to include 'search'
ALTER TABLE public.jobs DROP CONSTRAINT IF EXISTS jobs_source_check;
ALTER TABLE public.jobs ADD CONSTRAINT jobs_source_check CHECK (source IN ('feed', 'manual', 'search'));

-- 8. Add metrics columns to cron_runs table
ALTER TABLE public.cron_runs ADD COLUMN IF NOT EXISTS prefiltered INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.cron_runs ADD COLUMN IF NOT EXISTS search_calls INTEGER NOT NULL DEFAULT 0;

-- 9. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_jobs_user_external_id ON public.jobs(user_id, external_id);
CREATE INDEX IF NOT EXISTS idx_jobs_user_company_created ON public.jobs(user_id, company_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_queries_user_enabled ON public.search_queries(user_id, enabled);
