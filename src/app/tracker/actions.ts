'use server';

import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { ApplicationStage, getTodayIST, getDaysAheadIST, StageHistoryEntry } from '@/lib/tracker/dates';

export interface ActionResponse {
  success: boolean;
  message?: string;
  error?: string;
  application?: any;
}

/**
 * Tracks a job in the applications pipeline.
 */
export async function trackJobAction(
  jobId: string,
  initialStage: ApplicationStage = 'saved'
): Promise<ActionResponse> {
  try {
    const user = await requireAuth();
    const supabase = await createClient();

    // Verify job belongs to user
    const { data: job, error: jobErr } = await supabase
      .from('jobs')
      .select('id, title, company_name')
      .eq('id', jobId)
      .eq('user_id', user.id)
      .single();

    if (jobErr || !job) {
      return { success: false, error: 'Job not found or access denied.' };
    }

    const nowIso = new Date().toISOString();
    const initialHistory: StageHistoryEntry[] = [
      { stage: initialStage, timestamp: nowIso },
    ];

    const appliedDate = initialStage === 'applied' ? getTodayIST() : null;

    const { data: inserted, error: insertErr } = await supabase
      .from('applications')
      .insert({
        user_id: user.id,
        job_id: jobId,
        stage: initialStage,
        applied_date: appliedDate,
        stage_history: initialHistory,
      })
      .select('*, jobs(*)')
      .single();

    if (insertErr) {
      // If conflict (already tracked), fetch existing
      if (insertErr.code === '23505') {
        const { data: existing } = await supabase
          .from('applications')
          .select('*, jobs(*)')
          .eq('user_id', user.id)
          .eq('job_id', jobId)
          .single();
        return { success: true, message: 'Already tracked.', application: existing };
      }
      return { success: false, error: insertErr.message };
    }

    revalidatePath('/jobs');
    revalidatePath('/tracker');
    return { success: true, message: `Added ${job.company_name} to Tracker!`, application: inserted };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to track job.' };
  }
}

/**
 * Updates application stage, logging timestamp to stage_history and handling IST defaults.
 */
export async function updateApplicationStageAction(
  applicationId: string,
  newStage: ApplicationStage,
  extra?: {
    referrer_name?: string;
    applied_date?: string;
    next_follow_up_date?: string;
  }
): Promise<ActionResponse> {
  try {
    const user = await requireAuth();
    const supabase = await createClient();

    const { data: app, error: appErr } = await supabase
      .from('applications')
      .select('id, stage, applied_date, referrer_name, next_follow_up_date, stage_history')
      .eq('id', applicationId)
      .eq('user_id', user.id)
      .single();

    if (appErr || !app) {
      return { success: false, error: 'Application not found.' };
    }

    const nowIso = new Date().toISOString();
    const currentHistory: StageHistoryEntry[] = Array.isArray(app.stage_history)
      ? [...app.stage_history]
      : [];

    currentHistory.push({
      stage: newStage,
      timestamp: nowIso,
    });

    const updatePayload: Record<string, any> = {
      stage: newStage,
      stage_history: currentHistory,
      updated_at: nowIso,
    };

    // When moving to 'applied', set applied_date to today IST if not already set
    if (newStage === 'applied') {
      updatePayload.applied_date = extra?.applied_date || app.applied_date || getTodayIST();
    } else if (extra?.applied_date !== undefined) {
      updatePayload.applied_date = extra.applied_date;
    }

    // When moving to 'referral_asked', set referrer_name if provided
    if (extra?.referrer_name !== undefined) {
      updatePayload.referrer_name = extra.referrer_name;
    }

    if (extra?.next_follow_up_date !== undefined) {
      updatePayload.next_follow_up_date = extra.next_follow_up_date;
    }

    const { error: updateErr } = await supabase
      .from('applications')
      .update(updatePayload)
      .eq('id', applicationId)
      .eq('user_id', user.id);

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    revalidatePath('/jobs');
    revalidatePath('/tracker');
    return { success: true, message: `Moved to ${newStage.replace('_', ' ')}.` };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update stage.' };
  }
}

/**
 * Updates application metadata (channel, notes, dates, referrer).
 */
export async function updateApplicationDetailsAction(
  applicationId: string,
  fields: {
    channel?: string;
    referrer_name?: string | null;
    applied_date?: string | null;
    next_follow_up_date?: string | null;
    notes?: string;
  }
): Promise<ActionResponse> {
  try {
    const user = await requireAuth();
    const supabase = await createClient();

    const { error } = await supabase
      .from('applications')
      .update({
        ...fields,
        updated_at: new Date().toISOString(),
      })
      .eq('id', applicationId)
      .eq('user_id', user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/tracker');
    return { success: true, message: 'Updated application details.' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to update details.' };
  }
}

/**
 * Snoozes follow-up date by N days in Asia/Kolkata timezone.
 */
export async function snoozeFollowUpAction(
  applicationId: string,
  days: number = 7
): Promise<ActionResponse> {
  try {
    const user = await requireAuth();
    const supabase = await createClient();

    const newFollowUpDate = getDaysAheadIST(days);

    const { error } = await supabase
      .from('applications')
      .update({
        next_follow_up_date: newFollowUpDate,
        updated_at: new Date().toISOString(),
      })
      .eq('id', applicationId)
      .eq('user_id', user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/tracker');
    return { success: true, message: `Follow-up snoozed to ${newFollowUpDate} (IST).` };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to snooze follow-up.' };
  }
}

/**
 * Untracks / removes an application from pipeline.
 */
export async function untrackApplicationAction(applicationId: string): Promise<ActionResponse> {
  try {
    const user = await requireAuth();
    const supabase = await createClient();

    const { error } = await supabase
      .from('applications')
      .delete()
      .eq('id', applicationId)
      .eq('user_id', user.id);

    if (error) {
      return { success: false, error: error.message };
    }

    revalidatePath('/jobs');
    revalidatePath('/tracker');
    return { success: true, message: 'Removed from tracker.' };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Failed to untrack application.' };
  }
}
