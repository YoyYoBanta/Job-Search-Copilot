import { CompanyRecord, IngestionMetrics, RawJobPosting } from './types';
import { fetchGreenhouseJobs } from './greenhouse';
import { fetchLeverJobs } from './lever';
import { fetchAshbyJobs } from './ashby';
import { filterNewCandidateJobs } from './deduplication';
import { evaluateJobFilter } from '@/config/filters';
import { sanitizeHtml } from '@/lib/sanitize';
import { createClient } from '@/lib/supabase/server';

export { filterNewCandidateJobs };

export async function fetchRawJobsForCompany(company: CompanyRecord): Promise<RawJobPosting[]> {
  switch (company.board_type) {
    case 'greenhouse':
      return await fetchGreenhouseJobs(company.slug, company.name);
    case 'lever':
      return await fetchLeverJobs(company.slug, company.name);
    case 'ashby':
      return await fetchAshbyJobs(company.slug, company.name);
    default:
      throw new Error(`Unsupported board type: ${company.board_type}`);
  }
}

export async function ingestJobsForCompany(
  company: CompanyRecord,
  userId: string,
  customClient?: any
): Promise<IngestionMetrics> {
  const metrics: IngestionMetrics = {
    companyName: company.name,
    companySlug: company.slug,
    boardType: company.board_type,
    totalFetched: 0,
    passedFilter: 0,
    newInserted: 0,
    duplicatesCount: 0,
  };

  try {
    const supabase = customClient || (await createClient());

    // Load custom user_filters if configured
    const { data: userFilterRow } = await supabase
      .from('user_filters')
      .select('include_titles, exclude_titles, allowed_locations, allow_remote')
      .eq('user_id', userId)
      .maybeSingle();

    // 1. Fetch raw jobs
    const rawJobs = await fetchRawJobsForCompany(company);
    metrics.totalFetched = rawJobs.length;

    if (rawJobs.length === 0) {
      return metrics;
    }

    // 2. Filter jobs according to title and location rules
    const filteredJobs = rawJobs
      .map((job) => {
        const filterResult = evaluateJobFilter(job.title, job.location, userFilterRow || undefined);
        return {
          ...job,
          filterResult,
        };
      })
      .filter((item) => item.filterResult.passed && item.url);

    metrics.passedFilter = filteredJobs.length;

    if (filteredJobs.length === 0) {
      return metrics;
    }

    // 3. Query existing job URLs for this batch only, chunked in batches of 200
    // Note: Does NOT filter by dismissed; dismissed rows are preserved in DB and skipped
    const candidateUrls = filteredJobs.map((j) => j.url);
    const existingUrlsInDb: string[] = [];
    const CHUNK_SIZE = 200;

    for (let i = 0; i < candidateUrls.length; i += CHUNK_SIZE) {
      const chunk = candidateUrls.slice(i, i + CHUNK_SIZE);
      const { data: existingRows, error: selectError } = await supabase
        .from('jobs')
        .select('job_url')
        .eq('user_id', userId)
        .in('job_url', chunk);

      if (selectError) {
        throw new Error(`Failed querying existing job URLs: ${selectError.message}`);
      }

      if (existingRows) {
        for (const row of existingRows) {
          existingUrlsInDb.push(row.job_url);
        }
      }
    }

    const { newJobs: newJobsToInsert, duplicatesCount } = filterNewCandidateJobs(
      filteredJobs,
      existingUrlsInDb
    );

    metrics.duplicatesCount = duplicatesCount;

    if (newJobsToInsert.length === 0) {
      return metrics;
    }

    // 4. Sanitize descriptions and prepare rows for bulk insert
    const insertPayload = newJobsToInsert.map((job) => ({
      user_id: userId,
      company_id: company.id,
      title: job.title.trim(),
      company_name: company.name,
      location: job.location.trim(),
      job_url: job.url.trim(),
      description: sanitizeHtml(job.rawDescription),
      source: 'feed',
      needs_eligibility_check: job.filterResult.needsEligibilityCheck,
      dismissed: false,
      score_status: 'pending',
    }));

    // 5. Use upsert with ignoreDuplicates to safely handle race conditions and ignore duplicates
    const { data: insertedRows, error: insertError } = await supabase
      .from('jobs')
      .upsert(insertPayload, {
        onConflict: 'user_id,job_url',
        ignoreDuplicates: true,
      })
      .select('id');

    if (insertError) {
      throw new Error(`Database upsert error: ${insertError.message}`);
    }

    // Count only rows actually inserted
    metrics.newInserted = insertedRows ? insertedRows.length : 0;
    metrics.duplicatesCount = metrics.passedFilter - metrics.newInserted;
    return metrics;
  } catch (err: any) {
    metrics.error = err?.message || 'Unknown ingestion error';
    return metrics;
  }
}
