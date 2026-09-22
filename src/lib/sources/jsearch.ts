import 'server-only';
import { SupabaseClient } from '@supabase/supabase-js';
import { evaluateJobFilter } from '@/config/filters';
import { sanitizeHtml } from '@/lib/sanitize';
import { evaluateScoringPreFilter } from '@/lib/matcher/prefilter';
import { isJobDuplicate, ExistingJobDedupeRecord, ApplyOption } from './dedupe';

export interface JSearchRawJob {
  job_id: string;
  job_title: string;
  employer_name: string;
  job_city?: string | null;
  job_country?: string | null;
  job_is_remote?: boolean;
  job_apply_link?: string;
  job_apply_is_direct?: boolean;
  job_description?: string;
  job_posted_at_datetime_utc?: string;
  job_posted_at_timestamp?: number;
  job_required_experience?: {
    required_experience_in_months?: number | null;
    no_experience_required?: boolean;
    experience_mentioned?: boolean;
  };
  job_highlights?: {
    Qualifications?: string[];
    Responsibilities?: string[];
  };
  apply_options?: Array<{
    publisher?: string;
    apply_link?: string;
    is_direct?: boolean;
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

  if (Array.isArray(rawJob.apply_options)) {
    for (const opt of rawJob.apply_options) {
      const link = (opt.apply_link || '').trim();
      const publisher = (opt.publisher || 'Direct').trim();
      if (link && !seenLinks.has(link)) {
        seenLinks.add(link);
        options.push({
          publisher,
          apply_link: link,
          is_direct: Boolean(opt.is_direct),
        });
      }
    }
  }

  // Fallback to job_apply_link if no apply_options present
  if (options.length === 0 && rawJob.job_apply_link) {
    options.push({
      publisher: 'Publisher Link',
      apply_link: rawJob.job_apply_link.trim(),
      is_direct: Boolean(rawJob.job_apply_is_direct),
    });
  }

  return options;
}

/**
 * Calls RapidAPI JSearch search endpoint.
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

  const query = encodeURIComponent(options.query.trim());
  const country = encodeURIComponent(options.country || 'in');
  const datePosted = encodeURIComponent(options.datePosted || 'week');
  const numPages = options.numPages || 1;

  const url = `https://jsearch.p.rapidapi.com/search?query=${query}&country=${country}&date_posted=${datePosted}&num_pages=${numPages}`;

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'x-rapidapi-key': apiKey,
      'x-rapidapi-host': 'jsearch.p.rapidapi.com',
    },
  });

  if (response.status === 429) {
    const error: any = new Error('RapidAPI JSearch rate limit exceeded (HTTP 429).');
    error.status = 429;
    throw error;
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`RapidAPI JSearch error (HTTP ${response.status}): ${errorText}`);
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
      const location = formatJSearchLocation({
        city: raw.job_city,
        country: raw.job_country,
        isRemote: raw.job_is_remote,
      });
      const filterResult = evaluateJobFilter(raw.job_title, location, userFilterRow || undefined);
      return {
        raw,
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
      const expMonths = candidate.raw.job_required_experience?.required_experience_in_months;
      const expYears = typeof expMonths === 'number' ? expMonths / 12 : null;

      const prefilterResult = evaluateScoringPreFilter({
        title: candidate.raw.job_title,
        description: candidate.raw.job_description,
        postedAt: candidate.raw.job_posted_at_datetime_utc || candidate.raw.job_posted_at_timestamp,
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
      const mainJobUrl = applyOptions[0]?.apply_link || raw.job_apply_link || '';

      if (!mainJobUrl) continue;

      const dedupeResult = isJobDuplicate(
        {
          job_url: mainJobUrl,
          external_id: raw.job_id,
          company_name: raw.employer_name,
          title: raw.job_title,
        },
        existingJobs
      );

      if (dedupeResult.isDuplicate) {
        metrics.duplicatesCount++;
      } else {
        const cleanDescription = sanitizeHtml(raw.job_description || '');
        jobsToInsert.push({
          user_id: userId,
          title: raw.job_title.trim(),
          company_name: raw.employer_name.trim(),
          location: item.location.trim(),
          job_url: mainJobUrl.trim(),
          description: cleanDescription,
          external_id: raw.job_id,
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
