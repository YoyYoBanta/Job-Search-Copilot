'use server';

import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { BoardType, CompanyRecord, IngestionMetrics } from '@/lib/ats/types';
import { ingestJobsForCompany } from '@/lib/ats/fetcher';
import { isRapidApiMonthlyCapReached } from '@/lib/cron/budget';
import { ingestJobsForSearchQuery, JSearchIngestionMetrics } from '@/lib/sources/jsearch';

export interface CompanyActionState {
  error?: string;
  success?: boolean;
  message?: string;
}

export interface SearchQueryRecord {
  id: string;
  user_id: string;
  query: string;
  country: string;
  date_posted: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface SearchQueryActionState {
  error?: string;
  success?: boolean;
  message?: string;
  query?: SearchQueryRecord;
}

export async function addCompanyAction(
  prevState: CompanyActionState | null,
  formData: FormData
): Promise<CompanyActionState> {
  try {
    const user = await requireAuth();
    const name = (formData.get('name') as string || '').trim();
    const slug = (formData.get('slug') as string || '').trim().toLowerCase();
    const boardType = (formData.get('board_type') as string || '').trim().toLowerCase() as BoardType;

    if (!name || !slug || !boardType) {
      return { error: 'Please fill in Company Name, Slug, and Board Type.' };
    }

    if (!['greenhouse', 'lever', 'ashby'].includes(boardType)) {
      return { error: 'Invalid board type. Supported: Greenhouse, Lever, Ashby.' };
    }

    const supabase = await createClient();

    const { error } = await supabase.from('companies').insert({
      user_id: user.id,
      name,
      slug,
      board_type: boardType,
    });

    if (error) {
      if (error.code === '23505') {
        return { error: `Company slug "${slug}" with board "${boardType}" is already in your list.` };
      }
      return { error: `Failed to add company: ${error.message}` };
    }

    revalidatePath('/companies');
    return {
      success: true,
      message: `Added "${name}" (${boardType}) successfully!`,
    };
  } catch (err: any) {
    return { error: err?.message || 'An unexpected error occurred.' };
  }
}

export async function deleteCompanyAction(formData: FormData) {
  try {
    const user = await requireAuth();
    const companyId = formData.get('company_id') as string;

    if (!companyId) return;

    const supabase = await createClient();
    await supabase
      .from('companies')
      .delete()
      .eq('id', companyId)
      .eq('user_id', user.id);

    revalidatePath('/companies');
    revalidatePath('/jobs');
  } catch (err) {
    console.error('Error deleting company:', err);
  }
}

export async function triggerFetchForCompany(
  companyId: string
): Promise<IngestionMetrics> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: company, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', companyId)
    .eq('user_id', user.id)
    .single();

  if (error || !company) {
    return {
      companyName: 'Unknown',
      companySlug: '',
      boardType: 'greenhouse',
      totalFetched: 0,
      passedFilter: 0,
      newInserted: 0,
      duplicatesCount: 0,
      error: 'Company not found.',
    };
  }

  const metrics = await ingestJobsForCompany(company as CompanyRecord, user.id);
  revalidatePath('/companies');
  revalidatePath('/jobs');
  return metrics;
}

export async function triggerFetchAllCompanies(): Promise<IngestionMetrics[]> {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: companies, error } = await supabase
    .from('companies')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error || !companies || companies.length === 0) {
    return [];
  }

  const results: IngestionMetrics[] = [];
  for (const company of companies) {
    const metric = await ingestJobsForCompany(company as CompanyRecord, user.id);
    results.push(metric);
  }

  revalidatePath('/companies');
  revalidatePath('/jobs');
  return results;
}

export async function addSearchQueryAction(
  prevState: SearchQueryActionState | null,
  formData: FormData
): Promise<SearchQueryActionState> {
  try {
    const user = await requireAuth();
    const query = (formData.get('query') as string || '').trim();
    const country = (formData.get('country') as string || 'in').trim().toLowerCase();
    const datePosted = (formData.get('date_posted') as string || 'week').trim().toLowerCase();

    if (!query) {
      return { error: 'Please enter a search query.' };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from('search_queries')
      .insert({
        user_id: user.id,
        query,
        country,
        date_posted: datePosted,
        enabled: true,
      })
      .select('*')
      .single();

    if (error) {
      if (error.code === '23505') {
        return { error: `Search query "${query}" already exists.` };
      }
      return { error: `Failed to add query: ${error.message}` };
    }

    revalidatePath('/companies');
    return {
      success: true,
      message: `Search query "${query}" added!`,
      query: data as SearchQueryRecord,
    };
  } catch (err: any) {
    return { error: err?.message || 'An unexpected error occurred.' };
  }
}

export async function toggleSearchQueryAction(
  queryId: string,
  enabled: boolean
): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();
    const supabase = await createClient();

    const { error } = await supabase
      .from('search_queries')
      .update({ enabled })
      .eq('id', queryId)
      .eq('user_id', user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/companies');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update search query' };
  }
}

export async function deleteSearchQueryAction(formData: FormData) {
  try {
    const user = await requireAuth();
    const queryId = formData.get('query_id') as string;
    if (!queryId) return;

    const supabase = await createClient();
    await supabase
      .from('search_queries')
      .delete()
      .eq('id', queryId)
      .eq('user_id', user.id);

    revalidatePath('/companies');
  } catch (err) {
    console.error('Error deleting search query:', err);
  }
}

export interface RunJSearchResult {
  success: boolean;
  message?: string;
  error?: string;
  details?: {
    totalFetched: number;
    passedFilter: number;
    prefiltered: number;
    newInserted: number;
    duplicatesCount: number;
    successfulCalls: number;
    errors: string[];
  };
}

export async function runJSearchNowAction(): Promise<RunJSearchResult> {
  try {
    const user = await requireAuth();
    const supabase = await createClient();

    // Check monthly cap before starting
    const initialCapCheck = await isRapidApiMonthlyCapReached(supabase);
    if (initialCapCheck.reached) {
      return {
        success: false,
        error: `RapidAPI monthly cap reached (${initialCapCheck.usage}/${initialCapCheck.cap}). JSearch stopped.`,
      };
    }

    const { data: searchQueries, error: qErr } = await supabase
      .from('search_queries')
      .select('*')
      .eq('user_id', user.id)
      .eq('enabled', true)
      .order('created_at', { ascending: true });

    if (qErr) {
      return { success: false, error: `Failed to load search queries: ${qErr.message}` };
    }

    if (!searchQueries || searchQueries.length === 0) {
      return {
        success: false,
        error: 'No enabled search queries found. Please add or enable at least one search query first.',
      };
    }

    let totalFetched = 0;
    let passedFilter = 0;
    let prefiltered = 0;
    let newInserted = 0;
    let duplicatesCount = 0;
    let successfulCalls = 0;
    const errors: string[] = [];

    const startedAtIso = new Date().toISOString();

    for (const queryRow of searchQueries) {
      // Re-check monthly cap before each call
      const capCheck = await isRapidApiMonthlyCapReached(supabase);
      if (capCheck.reached) {
        errors.push(`Monthly cap reached (${capCheck.usage}/${capCheck.cap}). Stopped remaining queries.`);
        break;
      }

      const metrics = await ingestJobsForSearchQuery(
        {
          query: queryRow.query,
          country: queryRow.country,
          date_posted: queryRow.date_posted,
        },
        user.id,
        supabase
      );

      if (metrics.error) {
        errors.push(`[${queryRow.query}] ${metrics.error}`);
      } else {
        successfulCalls++;
        totalFetched += metrics.totalFetched;
        passedFilter += metrics.passedFilter;
        prefiltered += metrics.prefiltered;
        newInserted += metrics.newInserted;
        duplicatesCount += metrics.duplicatesCount;
      }
    }

    const endedAtIso = new Date().toISOString();

    // Log run to cron_runs only if successful calls occurred
    if (successfulCalls > 0) {
      await supabase.from('cron_runs').insert({
        user_id: user.id,
        started_at: startedAtIso,
        ended_at: endedAtIso,
        status: errors.length > 0 ? 'partial' : 'success',
        stopped_reason: 'done',
        fetched: totalFetched,
        matched: passedFilter,
        prefiltered: prefiltered,
        search_calls: successfulCalls,
        inserted: newInserted,
        scored: 0,
        errors,
      });
    }

    revalidatePath('/companies');
    revalidatePath('/jobs');

    if (successfulCalls === 0 && errors.length > 0) {
      return {
        success: false,
        error: errors.join(' | '),
        details: {
          totalFetched,
          passedFilter,
          prefiltered,
          newInserted,
          duplicatesCount,
          successfulCalls,
          errors,
        },
      };
    }

    return {
      success: true,
      message: `JSearch finished: ${newInserted} new jobs added (${passedFilter} matched filter, ${prefiltered} prefiltered, ${totalFetched} total fetched across ${successfulCalls} queries).`,
      details: {
        totalFetched,
        passedFilter,
        prefiltered,
        newInserted,
        duplicatesCount,
        successfulCalls,
        errors,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: err?.message || 'Unexpected error running JSearch.',
    };
  }
}
