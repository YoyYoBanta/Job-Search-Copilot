-- Migration 09: Multi-User Support, Per-User Dynamic Filters & Profile Display Names
-- Scoped strictly to the authenticated user (auth.uid())
-- Fully idempotent: safe to run multiple times.

-- 1. Add display_name to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS display_name TEXT;

-- 2. Create user_filters table
CREATE TABLE IF NOT EXISTS public.user_filters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    include_titles TEXT[] NOT NULL DEFAULT ARRAY['Product Manager', 'APM', 'Associate Product', 'Product Owner', 'Product Analyst']::text[],
    exclude_titles TEXT[] NOT NULL DEFAULT ARRAY['Director', 'Head of', 'VP', 'Principal', 'Group Product', 'Staff', 'Senior', 'Lead', 'Sr']::text[],
    allowed_locations TEXT[] NOT NULL DEFAULT ARRAY['India', 'Bangalore', 'Bengaluru', 'Mumbai', 'Pune', 'Gurgaon', 'Gurugram', 'Delhi', 'New Delhi', 'Noida', 'Hyderabad', 'Chennai']::text[],
    allow_remote BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_user_filter UNIQUE (user_id)
);

-- 3. Enable Row Level Security (RLS) on user_filters
ALTER TABLE public.user_filters ENABLE ROW LEVEL SECURITY;

-- 4. Create RLS Policies for user_filters
DROP POLICY IF EXISTS "Users can view their own filters" ON public.user_filters;
CREATE POLICY "Users can view their own filters"
    ON public.user_filters
    FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own filters" ON public.user_filters;
CREATE POLICY "Users can insert their own filters"
    ON public.user_filters
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own filters" ON public.user_filters;
CREATE POLICY "Users can update their own filters"
    ON public.user_filters
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own filters" ON public.user_filters;
CREATE POLICY "Users can delete their own filters"
    ON public.user_filters
    FOR DELETE
    USING (auth.uid() = user_id);

-- 5. Set updated_at trigger for user_filters
DROP TRIGGER IF EXISTS set_user_filters_updated_at ON public.user_filters;
CREATE TRIGGER set_user_filters_updated_at
    BEFORE UPDATE ON public.user_filters
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- 6. Seed default user_filters for all existing profiles
INSERT INTO public.user_filters (user_id, include_titles, exclude_titles, allowed_locations, allow_remote)
SELECT p.user_id,
       ARRAY['Product Manager', 'APM', 'Associate Product', 'Product Owner', 'Product Analyst']::text[],
       ARRAY['Director', 'Head of', 'VP', 'Principal', 'Group Product', 'Staff', 'Senior', 'Lead', 'Sr']::text[],
       ARRAY['India', 'Bangalore', 'Bengaluru', 'Mumbai', 'Pune', 'Gurgaon', 'Gurugram', 'Delhi', 'New Delhi', 'Noida', 'Hyderabad', 'Chennai']::text[],
       true
FROM public.profiles p
ON CONFLICT (user_id) DO NOTHING;

-- 7. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_user_filters_user_id ON public.user_filters(user_id);
CREATE INDEX IF NOT EXISTS idx_cron_runs_started_at ON public.cron_runs(started_at);
