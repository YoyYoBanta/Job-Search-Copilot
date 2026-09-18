'use server';

import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface ProfileActionState {
  error?: string;
  success?: boolean;
  message?: string;
  updatedAt?: string; // ISO-8601 string
}

export async function saveProfileAction(
  prevState: ProfileActionState | null,
  formData: FormData
): Promise<ProfileActionState> {
  try {
    const user = await requireAuth();
    const resumeText = (formData.get('resume_text') as string || '').trim();
    const totalYears = parseFloat((formData.get('total_years_experience') as string) || '0') || 0;
    const pmYears = parseFloat((formData.get('pm_years_experience') as string) || '0') || 0;
    const targetRolesRaw = (formData.get('target_roles') as string || '');

    const targetRoles = targetRolesRaw
      .split(',')
      .map((r) => r.trim())
      .filter((r) => r.length > 0);

    const isoTimestamp = new Date().toISOString();
    const supabase = await createClient();

    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          user_id: user.id,
          resume_text: resumeText,
          total_years_experience: totalYears,
          pm_years_experience: pmYears,
          target_roles: targetRoles,
          updated_at: isoTimestamp,
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      return {
        error: `Failed to save profile: ${error.message}`,
      };
    }

    revalidatePath('/profile');
    revalidatePath('/jobs');

    return {
      success: true,
      message: 'Profile & candidate experience saved successfully!',
      updatedAt: isoTimestamp,
    };
  } catch (err: any) {
    return {
      error: err?.message || 'An unexpected error occurred while saving profile.',
    };
  }
}

// Alias for backwards compatibility
export const saveResumeAction = saveProfileAction;
