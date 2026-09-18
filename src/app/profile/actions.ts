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

export async function saveResumeAction(
  prevState: ProfileActionState | null,
  formData: FormData
): Promise<ProfileActionState> {
  try {
    const user = await requireAuth();
    const resumeText = (formData.get('resume_text') as string || '').trim();
    const isoTimestamp = new Date().toISOString();

    const supabase = await createClient();

    const { error } = await supabase
      .from('profiles')
      .upsert(
        {
          user_id: user.id,
          resume_text: resumeText,
          updated_at: isoTimestamp,
        },
        { onConflict: 'user_id' }
      );

    if (error) {
      return {
        error: `Failed to save resume: ${error.message}`,
      };
    }

    revalidatePath('/profile');

    return {
      success: true,
      message: 'Resume profile saved successfully!',
      updatedAt: isoTimestamp,
    };
  } catch (err: any) {
    return {
      error: err?.message || 'An unexpected error occurred while saving resume.',
    };
  }
}
