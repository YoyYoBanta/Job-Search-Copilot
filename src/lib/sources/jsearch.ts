import 'server-only';
import { SupabaseClient } from '@supabase/supabase-js';
import { evaluateJobFilter } from '@/config/filters';
import { sanitizeHtml } from '@/lib/sanitize';
import { evaluateScoringPreFilter } from '@/lib/matcher/prefilter';
import { isJobDuplicate, ExistingJobDedupeRecord, ApplyOption } from './dedupe';

export interface JSearchRawJob {
  job_id?: string;
  id?: string;
  job_title?: string;
  title?: string;
  employer_name?: string;
  company_name?: string;
  employer?: string;
  job_city?: string | null;
  city?: string | null;
  job_country?: string | null;
  country?: string | null;
  job_is_remote?: boolean;
  is_remote?: boolean;
  work_from_home?: boolean;
  job_apply_link?: string;
  apply_link?: string;
  job_url?: string;
  job_apply_is_direct?: boolean;
  is_direct?: boolean;
  job_description?: string;
  description?: string;
  job_posted_at_datetime_utc?: string;
  posted_at?: string;
  date_posted?: string;
  job_posted_at_timestamp?: number;
  required_experience_years?: number | null;
  required_experience_in_months?: number | null;
  job_required_experience?: {
    required_experience_in_months?: number | null;
    no_experience_required?: boolean;
    experience_mentioned?: boolean;
  };
  seniority_level?: string | null;
  job_highlights?: {
    Qualifications?: string[];
    Responsibilities?: string[];
  };
  apply_options?: Array<{
    publisher?: string;
    apply_link?: string;
    link?: string;
    url?: string;
    is_direct?: boolean;
    isDirect?: boolean;
  }>;
}

export interface JSearchIngestionMetrics {
  query: string;
  totalFetched: number;
  passedFilter: number;
  prefiltered: number;
  newInserted: number;
  duplicatesCount: number;
  error?: string;
}

/**
 * Formats location string from JSearch metadata ensuring standard India/Remote representations.
 */
export function formatJSearchLocation(raw: {
  city?: string | null;
  country?: string | null;
  isRemote?: boolean;
}): string {
  const isRemote = Boolean(raw.isRemote);
  const city = (raw.city || '').trim();
  const countryCode = (raw.country || '').trim().toUpperCase();
  const isIndia = countryCode === 'IN' || countryCode === 'INDIA';

  if (isRemote) {
    if (city && isIndia) return `${city}, India (Remote)`;
    if (isIndia) return 'Remote, India';
    return 'Remote';
  }

  if (city && isIndia) return `${city}, India`;
  if (city) return `${city}, ${countryCode}`;
  if (isIndia) return 'India';
  return countryCode || 'India';
}

/**
 * Extracts clean apply options from JSearch response, ensuring direct links are preserved.
 */
export function extractApplyOptions(rawJob: JSearchRawJob): ApplyOption[] {
  const options: ApplyOption[] = [];
  const seenLinks = new Set<string>();

  const rawOptions = rawJob.apply_options;
  if (Array.isArray(rawOptions)) {
    for (const opt of rawOptions) {
      const link = (opt.apply_link || opt.link || opt.url || '').trim();
      const publisher = (opt.publisher || 'Direct').trim();
      if (link && !seenLinks.has(link)) {
        seenLinks.add(link);
        options.push({
          publisher,
          apply_link: link,
          is_direct: Boolean(opt.is_direct ?? opt.isDirect),
        });
      }
    }
  }

  // Fallback to direct apply links if no apply_options present
  const fallbackLink = (rawJob.job_apply_link || rawJob.apply_link || rawJob.job_url || '').trim();
  if (options.length === 0 && fallbackLink) {
    options.push({
      publisher: 'Publisher Link',
      apply_link: fallbackLink,
      is_direct: Boolean(rawJob.job_apply_is_direct ?? rawJob.is_direct),
    });
  }

  return options;
}

/**
 * Calls RapidAPI JSearch search endpoint (defaults to /search-v2).
 */
export async function fetchJSearchRawJobs(options: {
  query: string;
  country?: string;
  datePosted?: string;
  numPages?: number;
}): Promise<JSearchRawJob[]> {
  const apiKey = process.env.RAPIDAPI_KEY;
  if (!apiKey || !apiKey.trim()) {
    throw new Error('Missing RAPIDAPI_KEY environment variable. JSearch requires a valid RapidAPI Key.');
  }

  const rawEndpoint = process.env.RAPIDAPI_JSEARCH_URL || 'https://jsearch.p.rapidapi.com/search-v2';
  const urlObj = new URL(rawEndpoint.trim());

  urlObj.searchParams.set('query', options.query.trim());
  urlObj.searchParams.set('country', options.country || 'in');
  urlObj.searchParams.set('date_posted', options.datePosted || 'week');
  urlObj.searchParams.set('num_pages', String(options.numPages || 1));
  urlObj.searchParams.set('page', '1');

  const hostHeader = process.env.RAPIDAPI_HOST || urlObj.host || 'jsearch.p.rapidapi.com';

  const response = await fetch(urlObj.toString(), {
    method: 'GET',
    headers: {
      'x-rapidapi-key': apiKey.trim(),
      'x-rapidapi-host': hostHeader,
    },
  });

  if (response.status === 429) {
    console.error(`[JSearch API 429 Rate Limit] URL: ${urlObj.toString()}`);
    const error: any = new Error('RapidAPI JSearch rate limit exceeded (HTTP 429).');
    error.status = 429;
    error.url = urlObj.toString();
    throw error;
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[JSearch API Error] URL: ${urlObj.toString()} | Status: ${response.status} | Response: ${errorText}`);
    const error: any = new Error(`RapidAPI JSearch error (HTTP ${response.status}) at ${urlObj.pathname}: ${errorText}`);
    error.status = response.status;
    error.url = urlObj.toString();
    error.responseBody = errorText;
    throw error;
  }

  const json = await response.json();
  return Array.isArray(json.data) ? json.data : [];
}

/**
 * Ingests and filters jobs from a single JSearch query.
 * 
 * Pipeline:
 * 1. Fetch raw jobs from JSearch
 * 2. Title & Location filter (evaluateJobFilter)
 * 3. Pre-filter (experience >= 6, senior roles, > 21 days old) -> NOT inserted, counted in prefiltered
 * 4. Cross-source deduplication (isJobDuplicate with 14-day company+title and external_id)
 * 5. Sanitize HTML & bulk insert with source = 'search'
 */
export async function ingestJobsForSearchQuery(
  queryConfig: { query: string; country?: string; date_posted?: string },
  userId: string,
  supabase: SupabaseClient
): Promise<JSearchIngestionMetrics> {
  const metrics: JSearchIngestionMetrics = {
    query: queryConfig.query,
    totalFetched: 0,
    passedFilter: 0,
    prefiltered: 0,
    newInserted: 0,
    duplicatesCount: 0,
  };

  try {
    // Load custom user_filters if configured
    const { data: userFilterRow } = await supabase
      .from('user_filters')
      .select('include_titles, exclude_titles, allowed_locations, allow_remote')
      .eq('user_id', userId)
      .maybeSingle();

    const rawJobs = await fetchJSearchRawJobs({
      query: queryConfig.query,
      country: queryConfig.country || 'in',
      datePosted: queryConfig.date_posted || 'week',
      numPages: 1,
    });

    metrics.totalFetched = rawJobs.length;
    if (rawJobs.length === 0) return metrics;

    // 1. Initial Title and Location Filter
    const filterCandidates = rawJobs.map((raw) => {
      const title = (raw.job_title || raw.title || '').trim();
      const company = (raw.employer_name || raw.company_name || raw.employer || '').trim();
      const city = raw.job_city || raw.city || null;
      const country = raw.job_country || raw.country || null;
      const isRemote = Boolean(raw.job_is_remote ?? raw.is_remote ?? raw.work_from_home);

      const location = formatJSearchLocation({
        city,
        country,
        isRemote,
      });

      const filterResult = evaluateJobFilter(title, location, userFilterRow || undefined);
      return {
        raw,
        title,
        company,
        location,
        filterResult,
      };
    });

    const passedFilterCandidates = filterCandidates.filter((item) => item.filterResult.passed);
    metrics.passedFilter = passedFilterCandidates.length;
    if (passedFilterCandidates.length === 0) return metrics;

    // 2. Pre-filter at ingestion (required_experience >= 6, blocked seniority, > 21 days old)
    const validAfterPreFilter: typeof passedFilterCandidates = [];
    for (const candidate of passedFilterCandidates) {
      const raw = candidate.raw;
      let expYears: number | null = null;
      if (typeof raw.required_experience_years === 'number') {
        expYears = raw.required_experience_years;
      } else if (typeof raw.job_required_experience?.required_experience_in_months === 'number') {
        expYears = raw.job_required_experience.required_experience_in_months / 12;
      } else if (typeof raw.required_experience_in_months === 'number') {
        expYears = raw.required_experience_in_months / 12;
      }

      const prefilterResult = evaluateScoringPreFilter({
        title: candidate.title,
        description: raw.job_description || raw.description || '',
        postedAt: raw.job_posted_at_datetime_utc || raw.posted_at || raw.date_posted || raw.job_posted_at_timestamp,
        requiredExperienceYears: expYears,
      });

      if (prefilterResult.passed) {
        validAfterPreFilter.push(candidate);
      } else {
        metrics.prefiltered++;
      }
    }

    if (validAfterPreFilter.length === 0) return metrics;

    // 3. Query existing jobs for cross-source deduplication (last 30 days of jobs for user)
    const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: existingJobsData, error: existingError } = await supabase
      .from('jobs')
      .select('id, job_url, external_id, company_name, title, created_at')
      .eq('user_id', userId)
      .gte('created_at', thirtyDaysAgoIso);

    if (existingError) {
      throw new Error(`Failed to query existing jobs for deduplication: ${existingError.message}`);
    }

    const existingJobs: ExistingJobDedupeRecord[] = (existingJobsData || []).map((j) => ({
      id: j.id,
      job_url: j.job_url,
      external_id: j.external_id,
      company_name: j.company_name,
      title: j.title,
      created_at: j.created_at,
    }));

    // 4. Filter duplicates across sources
    const jobsToInsert: any[] = [];
    for (const item of validAfterPreFilter) {
      const raw = item.raw;
      const applyOptions = extractApplyOptions(raw);
      const mainJobUrl = applyOptions[0]?.apply_link || raw.job_apply_link || raw.apply_link || raw.job_url || '';

      if (!mainJobUrl) continue;

      const jobId = raw.job_id || raw.id || mainJobUrl;
      const dedupeResult = isJobDuplicate(
        {
          job_url: mainJobUrl,
          external_id: jobId,
          company_name: item.company,
          title: item.title,
        },
        existingJobs
      );

      if (dedupeResult.isDuplicate) {
        metrics.duplicatesCount++;
      } else {
        const cleanDescription = sanitizeHtml(raw.job_description || raw.description || '');
        jobsToInsert.push({
          user_id: userId,
          title: item.title,
          company_name: item.company,
          location: item.location,
          job_url: mainJobUrl.trim(),
          description: cleanDescription,
          external_id: jobId,
          apply_options: applyOptions,
          source: 'search',
          needs_eligibility_check: item.filterResult.needsEligibilityCheck,
          dismissed: false,
          score_status: 'pending',
        });
      }
    }

    if (jobsToInsert.length === 0) return metrics;

    // 5. Bulk Upsert into jobs table
    const { data: insertedRows, error: insertError } = await supabase
      .from('jobs')
      .upsert(jobsToInsert, {
        onConflict: 'user_id,job_url',
        ignoreDuplicates: true,
      })
      .select('id');

    if (insertError) {
      throw new Error(`Database upsert error: ${insertError.message}`);
    }

    metrics.newInserted = insertedRows ? insertedRows.length : 0;
    return metrics;
  } catch (err: any) {
    metrics.error = err?.message || 'Unknown JSearch error';
    return metrics;
  }
}
