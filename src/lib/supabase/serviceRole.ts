import 'server-only';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Creates an administrative Supabase client using the service role key.
 * This client bypasses Row Level Security (RLS) and is intended solely
 * for unauthenticated background/cron tasks.
 *
 * SAFETY:
 * - Never export or expose this client to client components or browsers.
 * - Always explicitly filter all database queries by user_id when using this client.
 */
export function createServiceRoleClient(): SupabaseClient {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
