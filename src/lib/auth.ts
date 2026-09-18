import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export interface AuthValidationResult {
  user: any | null;
  isAuthenticated: boolean;
  isAuthorized: boolean;
  error?: string;
}

/**
 * Validates the current session and checks against ALLOWED_EMAIL.
 */
export async function validateUserSession(): Promise<AuthValidationResult> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return {
      user: null,
      isAuthenticated: false,
      isAuthorized: false,
      error: error?.message || 'Not authenticated',
    };
  }

  const allowedEmail = (process.env.ALLOWED_EMAIL || '').trim().toLowerCase();
  const userEmail = (user.email || '').trim().toLowerCase();

  const isAuthorized = Boolean(allowedEmail && userEmail === allowedEmail);

  return {
    user,
    isAuthenticated: true,
    isAuthorized,
    error: isAuthorized ? undefined : 'Email not in whitelist',
  };
}

/**
 * Server helper to guard routes and server actions.
 * Redirects to /login if unauthenticated, or /unauthorized if email is not allowed.
 */
export async function requireAuth() {
  const { user, isAuthenticated, isAuthorized } = await validateUserSession();

  if (!isAuthenticated || !user) {
    redirect('/login');
  }

  if (!isAuthorized) {
    redirect('/unauthorized');
  }

  return user;
}
