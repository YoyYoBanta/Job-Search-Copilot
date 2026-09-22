import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export interface AuthValidationResult {
  user: any | null;
  isAuthenticated: boolean;
  isAuthorized: boolean;
  error?: string;
}

/**
 * Returns the list of permitted user emails from ALLOWED_EMAILS or fallback ALLOWED_EMAIL.
 */
export function getAllowedEmails(): string[] {
  const raw = process.env.ALLOWED_EMAILS || process.env.ALLOWED_EMAIL || '';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
}

/**
 * Checks if a given email is in the allowed whitelist.
 */
export function isEmailAllowed(email?: string | null): boolean {
  if (!email || typeof email !== 'string') return false;
  const allowed = getAllowedEmails();
  if (allowed.length === 0) return false;
  return allowed.includes(email.trim().toLowerCase());
}

/**
 * Validates the current session and checks against the ALLOWED_EMAILS whitelist.
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

  const isAuthorized = isEmailAllowed(user.email);

  return {
    user,
    isAuthenticated: true,
    isAuthorized,
    error: isAuthorized ? undefined : 'Email not in allowed whitelist',
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
