'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { isEmailAllowed, getAllowedEmails } from '@/lib/auth';

export interface AuthActionState {
  error?: string;
  success?: boolean;
}

export async function signInAction(
  prevState: AuthActionState | null,
  formData: FormData
): Promise<AuthActionState> {
  const email = (formData.get('email') as string || '').trim().toLowerCase();
  const password = formData.get('password') as string;
  const allowedEmails = getAllowedEmails();

  if (!email || !password) {
    return { error: 'Please enter both email and password.' };
  }

  if (allowedEmails.length === 0) {
    return {
      error: 'Server configuration error: ALLOWED_EMAILS environment variable is not set.',
    };
  }

  // Early check against allowed emails whitelist
  if (!isEmailAllowed(email)) {
    return {
      error: 'Not authorised. This email address is not permitted to access this application.',
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  const authenticatedEmail = (data.user?.email || '').trim().toLowerCase();
  if (!isEmailAllowed(authenticatedEmail)) {
    await supabase.auth.signOut();
    redirect('/unauthorized');
  }

  redirect('/profile');
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
