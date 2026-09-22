'use server';

import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import {
  DEFAULT_INCLUDE_TITLES,
  DEFAULT_EXCLUDE_TITLES,
  DEFAULT_ALLOWED_LOCATIONS,
  DEFAULT_ALLOW_REMOTE,
} from '@/config/filters';

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
    const displayName = (formData.get('display_name') as string || '').trim();
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

    const profilePayload: Record<string, any> = {
      user_id: user.id,
      resume_text: resumeText,
      total_years_experience: totalYears,
      pm_years_experience: pmYears,
      target_roles: targetRoles,
      updated_at: isoTimestamp,
    };

    if (displayName) {
      profilePayload.display_name = displayName;
    }

    const { error: profileError } = await supabase
      .from('profiles')
      .upsert(profilePayload, { onConflict: 'user_id' });

    if (profileError) {
      return {
        error: `Failed to save profile: ${profileError.message}`,
      };
    }

    revalidatePath('/profile');
    revalidatePath('/jobs');
    revalidatePath('/');

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

export interface FiltersActionState {
  error?: string;
  success?: boolean;
  message?: string;
  updatedAt?: string;
}

export async function saveUserFiltersAction(
  prevState: FiltersActionState | null,
  formData: FormData
): Promise<FiltersActionState> {
  try {
    const user = await requireAuth();
    const includeTitlesRaw = (formData.get('include_titles') as string || '');
    const excludeTitlesRaw = (formData.get('exclude_titles') as string || '');
    const allowedLocationsRaw = (formData.get('allowed_locations') as string || '');
    const allowRemote = formData.get('allow_remote') === 'on' || formData.get('allow_remote') === 'true';

    const includeTitles = includeTitlesRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const excludeTitles = excludeTitlesRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const allowedLocations = allowedLocationsRaw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    const supabase = await createClient();
    const isoTimestamp = new Date().toISOString();

    const { error } = await supabase
      .from('user_filters')
      .upsert(
        {
          user_id: user.id,
          include_titles: includeTitles.length > 0 ? includeTitles : [...DEFAULT_INCLUDE_TITLES],
          exclude_titles: excludeTitles,
          allowed_locations: allowedLocations.length > 0 ? allowedLocations : [...DEFAULT_ALLOWED_LOCATIONS],
          allow_remote: allowRemote,
          updated_at: isoTimestamp,
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      return {
        error: `Failed to save filters: ${error.message}`,
      };
    }

    revalidatePath('/profile');
    revalidatePath('/jobs');
    revalidatePath('/companies');

    return {
      success: true,
      message: 'Target job filters updated successfully!',
      updatedAt: isoTimestamp,
    };
  } catch (err: any) {
    return {
      error: err?.message || 'An unexpected error occurred while saving filters.',
    };
  }
}

// Alias for backwards compatibility
export const saveResumeAction = saveProfileAction;
