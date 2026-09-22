import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { CompanyManager } from '@/components/CompanyManager';
import { SearchQueriesSection } from '@/components/SearchQueriesSection';
import { CompanyRecord } from '@/lib/ats/types';
import { SearchQueryRecord } from './actions';

import { ensureUserOnboarded } from '@/lib/onboarding';

export const dynamic = 'force-dynamic';

export default async function CompaniesPage() {
  const user = await requireAuth();
  const supabase = await createClient();

  // Ensure user is onboarded
  await ensureUserOnboarded(supabase, user.id, user.email);

  const { data: companies } = await supabase
    .from('companies')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  const { data: searchQueries } = await supabase
    .from('search_queries')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true });

  return (
    <div style={{ maxWidth: '1000px', margin: '1rem auto 3rem' }}>
      <CompanyManager initialCompanies={(companies as CompanyRecord[]) || []} />
      <SearchQueriesSection initialQueries={(searchQueries as SearchQueryRecord[]) || []} />
    </div>
  );
}
