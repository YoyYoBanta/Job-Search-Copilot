import Link from 'next/link';
import { validateUserSession } from '@/lib/auth';
import { signOutAction } from '@/app/login/actions';

export async function Navbar() {
  const { user, isAuthorized } = await validateUserSession();

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link href="/" className="brand">
          <span>Job Search Copilot</span>
          <span className="brand-badge">v1.0</span>
        </Link>

        <nav className="nav-links">
          {user && isAuthorized ? (
            <>
              <Link href="/profile" className="nav-link">
                My Profile
              </Link>
              <div className="user-badge">
                <span className="user-email">{user.email}</span>
                <form action={signOutAction}>
                  <button type="submit" className="btn btn-secondary" style={{ padding: '0.25rem 0.625rem', fontSize: '0.75rem' }}>
                    Sign Out
                  </button>
                </form>
              </div>
            </>
          ) : (
            <Link href="/login" className="btn btn-primary" style={{ padding: '0.375rem 0.875rem', fontSize: '0.8125rem' }}>
              Sign In
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
