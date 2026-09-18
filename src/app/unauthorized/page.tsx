import Link from 'next/link';

export default function UnauthorizedPage() {
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
          This account is not authorized to access this Job Search Copilot instance.
        </p>

        <p style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', marginBottom: '2rem' }}>
          Your session was terminated automatically. Access is strictly restricted to the administrator email configured in <code>ALLOWED_EMAIL</code>.
        </p>

        <Link href="/login" className="btn btn-secondary" style={{ width: '100%', display: 'inline-block', textAlign: 'center' }}>
          Return to Login
        </Link>
      </div>
    </div>
  );
}
