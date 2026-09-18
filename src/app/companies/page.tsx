import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { CompanyManager } from '@/components/CompanyManager';
import { CompanyRecord } from '@/lib/ats/types';

export const dynamic = 'force-dynamic';

export default async function CompaniesPage() {
  const user = await requireAuth();
  const supabase = await createClient();

  const { data: companies } = await supabase
    .from('companies')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return (
    <div style={{ maxWidth: '1000px', margin: '1rem auto 3rem' }}>
      <CompanyManager initialCompanies={(companies as CompanyRecord[]) || []} />
    </div>
  );
}
