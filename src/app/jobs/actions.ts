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

/**
 * Resets a job's score status back to 'pending' to trigger re-scoring.
 */
export async function resetJobScoreAction(jobId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const user = await requireAuth();
    const supabase = await createClient();

    const { error } = await supabase
      .from('jobs')
      .update({
        score_status: 'pending',
        fit_score: null,
        match_analysis: null,
        seniority_match: null,
        scored_model: null,
        score_error: null,
        scored_at: null,
      })
      .eq('id', jobId)
      .eq('user_id', user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/jobs');
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to reset score' };
  }
}

/**
 * Records or toggles thumbs up / down feedback on a scored job.
 */
export async function submitFeedbackAction(
  jobId: string,
  rating: 'up' | 'down'
): Promise<{ success: boolean; error?: string; rating?: 'up' | 'down' | null }> {
  try {
    const user = await requireAuth();
    const supabase = await createClient();

    // Check existing feedback
    const { data: existing } = await supabase
      .from('feedback')
      .select('id, rating')
      .eq('user_id', user.id)
      .eq('job_id', jobId)
      .maybeSingle();

    if (existing) {
      if (existing.rating === rating) {
        // Toggle off if clicked same rating
        await supabase
          .from('feedback')
          .delete()
          .eq('id', existing.id)
          .eq('user_id', user.id);
        revalidatePath('/jobs');
        return { success: true, rating: null };
      } else {
        // Switch rating
        await supabase
          .from('feedback')
          .update({ rating })
          .eq('id', existing.id)
          .eq('user_id', user.id);
        revalidatePath('/jobs');
        return { success: true, rating };
      }
    } else {
      // Insert new rating
      await supabase.from('feedback').insert({
        user_id: user.id,
        job_id: jobId,
        rating,
      });
      revalidatePath('/jobs');
      return { success: true, rating };
    }
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to submit feedback' };
  }
}

/**
 * Re-runs HTML sanitization on all existing jobs for the current user.
 */
export async function recleanJobDescriptionsAction(): Promise<{
  success: boolean;
  message: string;
  cleanedCount: number;
}> {
  try {
    const user = await requireAuth();
    const supabase = await createClient();

    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('id, description')
      .eq('user_id', user.id);

    if (error || !jobs) {
      return {
        success: false,
        message: error?.message || 'Failed to fetch jobs.',
        cleanedCount: 0,
      };
    }

    let cleanedCount = 0;
    for (const job of jobs) {
      const sanitized = sanitizeHtml(job.description);
      if (sanitized !== job.description) {
        await supabase
          .from('jobs')
          .update({ description: sanitized })
          .eq('id', job.id)
          .eq('user_id', user.id);
        cleanedCount++;
      }
    }

    revalidatePath('/jobs');
    return {
      success: true,
      message: `Re-cleaned descriptions for ${cleanedCount} of ${jobs.length} jobs.`,
      cleanedCount,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Unexpected error while re-cleaning descriptions.',
      cleanedCount: 0,
    };
  }
}

// Alias for backwards compatibility
export const deleteJobAction = dismissJobAction;
