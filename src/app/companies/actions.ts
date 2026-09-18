'use server';

import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { BoardType, CompanyRecord, IngestionMetrics } from '@/lib/ats/types';
import { ingestJobsForCompany } from '@/lib/ats/fetcher';

export interface CompanyActionState {
  error?: string;
  success?: boolean;
  message?: string;
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
