'use server';

import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { evaluateJobFilter } from '@/config/filters';
import { sanitizeHtml } from '@/lib/sanitize';

export interface PasteJobActionState {
  error?: string;
  success?: boolean;
  message?: string;
  filterWarning?: string;
}

export async function pasteJobAction(
  prevState: PasteJobActionState | null,
  formData: FormData
): Promise<PasteJobActionState> {
  try {
    const user = await requireAuth();
    const title = (formData.get('title') as string || '').trim();
    const companyName = (formData.get('company_name') as string || '').trim();
    const location = (formData.get('location') as string || '').trim();
    const jobUrl = (formData.get('job_url') as string || '').trim();
    const rawDescription = (formData.get('description') as string || '').trim();

    if (!title || !companyName || !location || !jobUrl || !rawDescription) {
      return { error: 'All fields (Title, Company, Location, Job URL, Description) are required.' };
    }

    // Evaluate filter rules
    const filterResult = evaluateJobFilter(title, location);
    if (!filterResult.passed) {
      return {
        error: `Job does not meet target criteria: ${filterResult.reason || 'Title or location mismatch'}. Only Product roles in India / eligible Remote are stored.`,
      };
    }

    const cleanDescription = sanitizeHtml(rawDescription);
    const supabase = await createClient();

    // Check for existing duplicate job URL (including dismissed jobs)
    const { data: existing } = await supabase
      .from('jobs')
      .select('id, dismissed')
      .eq('user_id', user.id)
      .eq('job_url', jobUrl)
      .maybeSingle();

    if (existing) {
      if (existing.dismissed) {
        return { error: `This job URL was previously saved and dismissed.` };
      }
      return { error: `This job URL has already been imported/saved.` };
    }

    const { error: insertError } = await supabase.from('jobs').insert({
      user_id: user.id,
      title,
      company_name: companyName,
      location,
      job_url: jobUrl,
      description: cleanDescription,
      source: 'manual',
      needs_eligibility_check: filterResult.needsEligibilityCheck,
      dismissed: false,
      score_status: 'pending',
    });

    if (insertError) {
      if (insertError.code === '23505') {
        return { error: 'A job with this URL already exists.' };
      }
      return { error: `Failed to save job: ${insertError.message}` };
    }

    revalidatePath('/jobs');
    revalidatePath('/companies');

    return {
      success: true,
      message: `Job "${title}" at ${companyName} saved successfully with score_status = 'pending'!`,
      filterWarning: filterResult.needsEligibilityCheck
        ? 'Flagged with "Check eligibility" badge (unspecified remote location).'
        : undefined,
    };
  } catch (err: any) {
    return { error: err?.message || 'An unexpected error occurred while saving the job.' };
  }
}

export async function dismissJobAction(formData: FormData) {
  try {
    const user = await requireAuth();
    const jobId = formData.get('job_id') as string;

    if (!jobId) return;

    const supabase = await createClient();
    await supabase
      .from('jobs')
      .update({ dismissed: true })
      .eq('id', jobId)
      .eq('user_id', user.id);

    revalidatePath('/jobs');
  } catch (err) {
    console.error('Error dismissing job:', err);
  }
}

export async function restoreJobAction(formData: FormData) {
  try {
    const user = await requireAuth();
    const jobId = formData.get('job_id') as string;

    if (!jobId) return;

    const supabase = await createClient();
    await supabase
      .from('jobs')
      .update({ dismissed: false })
      .eq('id', jobId)
      .eq('user_id', user.id);

    revalidatePath('/jobs');
  } catch (err) {
    console.error('Error restoring job:', err);
  }
}

// Alias for backwards compatibility
export const deleteJobAction = dismissJobAction;
