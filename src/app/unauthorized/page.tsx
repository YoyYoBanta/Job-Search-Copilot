import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function UnauthorizedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const userEmail = user?.email || null;

  // Automatically invalidate unauthorized session on the server
  if (user) {
    await supabase.auth.signOut();
  }

  return (
    <div style={{ maxWidth: '480px', margin: '5rem auto 0' }}>
      <div className="card" style={{ textAlign: 'center', borderColor: 'rgba(244, 63, 94, 0.3)' }}>
        <div style={{ marginBottom: '1.25rem' }}>
          <span className="badge badge-rose" style={{ fontSize: '0.875rem', padding: '0.375rem 0.875rem' }}>
            Access Denied
          </span>
        </div>

        <h1 className="card-title" style={{ fontSize: '1.75rem', marginBottom: '0.75rem' }}>
          Not Authorised
        </h1>

        <p style={{ marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>
          {userEmail ? (
            <>
              The account <strong>{userEmail}</strong> is not authorized to access this Job Search Copilot instance.
            </>
          ) : (
            'You do not have permission to access this application.'
          )}
        </p>

        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '2rem' }}>
          Your session has been terminated automatically. Access is strictly restricted to the administrator email configured in <code>ALLOWED_EMAIL</code>.
        </p>

        <Link href="/login" className="btn btn-secondary" style={{ width: '100%', display: 'inline-block', textAlign: 'center' }}>
          Return to Login
        </Link>
      </div>
    </div>
  );
}
