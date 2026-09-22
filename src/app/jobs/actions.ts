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

    const supabase = await createClient();

    // Load custom user_filters if configured
    const { data: userFilterRow } = await supabase
      .from('user_filters')
      .select('include_titles, exclude_titles, allowed_locations, allow_remote')
      .eq('user_id', user.id)
      .maybeSingle();

    // Evaluate filter rules with user's settings
    const filterResult = evaluateJobFilter(title, location, userFilterRow || undefined);
    if (!filterResult.passed) {
      return {
        error: `Job does not meet target criteria: ${filterResult.reason || 'Title or location mismatch'}. Only Product roles in India / eligible Remote are stored.`,
      };
    }

    const cleanDescription = sanitizeHtml(rawDescription);

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

export async function dismissJobAction(jobIdOrFormData: string | FormData): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    const user = await requireAuth();
    let jobId: string;
    if (typeof jobIdOrFormData === 'string') {
      jobId = jobIdOrFormData;
    } else {
      jobId = jobIdOrFormData.get('job_id') as string;
    }

    if (!jobId) {
      return { success: false, error: 'Missing job ID to dismiss.' };
    }

    const supabase = await createClient();
    const { error } = await supabase
      .from('jobs')
      .update({ dismissed: true })
      .eq('id', jobId)
      .eq('user_id', user.id);

    if (error) {
      return { success: false, error: `Failed to dismiss job: ${error.message}` };
    }

    revalidatePath('/jobs');
    revalidatePath('/');

    return { success: true, message: 'Job dismissed.' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Unexpected error while dismissing job.' };
  }
}

export async function restoreJobAction(jobIdOrFormData: string | FormData): Promise<{
  success: boolean;
  message?: string;
  filterWarning?: string;
  error?: string;
}> {
  try {
    const user = await requireAuth();
    let jobId: string;
    if (typeof jobIdOrFormData === 'string') {
      jobId = jobIdOrFormData;
    } else {
      jobId = jobIdOrFormData.get('job_id') as string;
    }

    if (!jobId) {
      return { success: false, error: 'Missing job ID to restore.' };
    }

    const supabase = await createClient();

    // 1. Fetch job to inspect title & location for filter awareness
    const { data: job, error: fetchErr } = await supabase
      .from('jobs')
      .select('id, title, location')
      .eq('id', jobId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (fetchErr) {
      return { success: false, error: `Failed to fetch job details: ${fetchErr.message}` };
    }

    // 2. Perform restore update (Always restore regardless of filter match)
    const { error: updateErr } = await supabase
      .from('jobs')
      .update({ dismissed: false })
      .eq('id', jobId)
      .eq('user_id', user.id);

    if (updateErr) {
      return { success: false, error: `Database update error: ${updateErr.message}` };
    }

    revalidatePath('/jobs');
    revalidatePath('/');

    let filterWarning: string | undefined;
    if (job) {
      const { data: userFilterRow } = await supabase
        .from('user_filters')
        .select('include_titles, exclude_titles, allowed_locations, allow_remote')
        .eq('user_id', user.id)
        .maybeSingle();

      const filterResult = evaluateJobFilter(job.title, job.location, userFilterRow || undefined);
      if (!filterResult.passed) {
        filterWarning = `Location "${job.location}" is outside target criteria, but was restored as requested.`;
      }
    }

    return {
      success: true,
      message: job?.title ? `"${job.title}" restored successfully.` : 'Job restored successfully.',
      filterWarning,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Unexpected error while restoring job.' };
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

export interface GenerateOutreachOptions {
  forceRegenerate?: boolean;
  recipientName?: string | null;
  relationship?: 'cold' | 'alumni' | 'ex-colleague' | 'mutual_connection' | null;
}

/**
 * Generates tailored cover note and LinkedIn referral message for a job.
 */
export async function generateOutreachAction(
  jobId: string,
  options: GenerateOutreachOptions = {}
): Promise<{
  success: boolean;
  cover_note?: string;
  referral_message?: string;
  last_generated_cover_note?: string;
  last_generated_referral?: string;
  outreach_model?: string;
  outreach_updated_at?: string;
  fabricationWarnings?: string[];
  cached?: boolean;
  error?: string;
}> {
  try {
    const user = await requireAuth();
    const supabase = await createClient();

    // 1. Fetch job record
    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('id, title, company_name, location, job_url, description, match_analysis, score_status, seniority_match, cover_note, referral_message, last_generated_cover_note, last_generated_referral, outreach_model, outreach_updated_at')
      .eq('id', jobId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (jobErr || !job) {
      return { success: false, error: jobErr?.message || 'Job not found.' };
    }

    if (job.score_status !== 'scored') {
      return { success: false, error: 'Job must be scored before generating tailored outreach.' };
    }

    // 2. Return cached drafts if already generated and not forced
    if (!options.forceRegenerate && job.cover_note && job.referral_message) {
      return {
        success: true,
        cover_note: job.cover_note,
        referral_message: job.referral_message,
        last_generated_cover_note: job.last_generated_cover_note || job.cover_note,
        last_generated_referral: job.last_generated_referral || job.referral_message,
        outreach_model: job.outreach_model || undefined,
        outreach_updated_at: job.outreach_updated_at || undefined,
        cached: true,
      };
    }

    // 3. Fetch user profile
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('resume_text, total_years_experience, pm_years_experience, target_roles')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileErr || !profile || !profile.resume_text?.trim()) {
      return { success: false, error: 'Please add your resume in My Profile before generating outreach.' };
    }

    // 4. Call Tailor LLM Generator
    const { generateTailoredOutreach } = await import('@/lib/tailor/generator');
    const result = await generateTailoredOutreach({
      resumeText: profile.resume_text,
      totalYearsExperience: profile.total_years_experience,
      pmYearsExperience: profile.pm_years_experience,
      targetRoles: profile.target_roles,
      candidateEmail: user.email,
      jobTitle: job.title,
      companyName: job.company_name,
      jobLocation: job.location,
      jobUrl: job.job_url || 'https://company.com/careers',
      jobDescription: job.description,
      matchAnalysis: job.match_analysis,
      recipientName: options.recipientName,
      relationship: options.relationship || 'cold',
    });

    const nowIso = new Date().toISOString();

    // 5. Persist generated outreach to database
    const { error: updateErr } = await supabase
      .from('jobs')
      .update({
        cover_note: result.data.cover_note,
        referral_message: result.data.referral_message,
        last_generated_cover_note: result.data.cover_note,
        last_generated_referral: result.data.referral_message,
        outreach_model: result.modelUsed,
        outreach_updated_at: nowIso,
      })
      .eq('id', jobId)
      .eq('user_id', user.id);

    if (updateErr) {
      return { success: false, error: `Failed to save generated outreach: ${updateErr.message}` };
    }

    revalidatePath('/jobs');

    return {
      success: true,
      cover_note: result.data.cover_note,
      referral_message: result.data.referral_message,
      last_generated_cover_note: result.data.cover_note,
      last_generated_referral: result.data.referral_message,
      outreach_model: result.modelUsed,
      outreach_updated_at: nowIso,
      fabricationWarnings: result.validation.fabricationWarnings,
      cached: false,
    };
  } catch (err: any) {
    console.error('[generateOutreachAction error]:', err);
    return { success: false, error: err?.message || 'Failed to generate tailored outreach.' };
  }
}

/**
 * Saves user edits to a job's cover note and referral message.
 */
export async function saveOutreachDraftAction(
  jobId: string,
  coverNote: string,
  referralMessage: string
): Promise<{ success: boolean; error?: string; outreach_updated_at?: string }> {
  try {
    const user = await requireAuth();
    const supabase = await createClient();

    const nowIso = new Date().toISOString();
    const { error } = await supabase
      .from('jobs')
      .update({
        cover_note: coverNote,
        referral_message: referralMessage,
        outreach_updated_at: nowIso,
      })
      .eq('id', jobId)
      .eq('user_id', user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/jobs');
    return { success: true, outreach_updated_at: nowIso };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to save outreach draft.' };
  }
}


