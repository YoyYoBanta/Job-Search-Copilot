'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

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
  const allowedEmail = (process.env.ALLOWED_EMAIL || '').trim().toLowerCase();

  if (!email || !password) {
    return { error: 'Please enter both email and password.' };
  }

  if (!allowedEmail) {
    return {
      error: 'Server configuration error: ALLOWED_EMAIL environment variable is not set.',
    };
  }

  // Early check against ALLOWED_EMAIL
  if (email !== allowedEmail) {
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
  if (!allowedEmail || authenticatedEmail !== allowedEmail) {
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
