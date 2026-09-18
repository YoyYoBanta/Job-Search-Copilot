'use client';

import { useActionState } from 'react';
import { signInAction, type AuthActionState } from './actions';

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState<AuthActionState, FormData>(
    signInAction,
    {}
  );

  return (
    <div style={{ maxWidth: '420px', margin: '4rem auto 0' }}>
      <div className="card">
        <div className="card-header" style={{ textAlign: 'center' }}>
          <h1 className="card-title" style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>
            Job Search Copilot
          </h1>
          <p className="card-desc">
            Sign in with your authorized email and password to access your dashboard.
          </p>
        </div>

        {state?.error && (
          <div className="alert alert-error" role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{state.error}</span>
          </div>
        )}

        <form action={formAction}>
          <div className="form-group">
            <label className="label" htmlFor="email">
              Email Address
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="input"
              placeholder="you@example.com"
              disabled={isPending}
            />
          </div>

          <div className="form-group">
            <label className="label" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="input"
              placeholder="••••••••"
              disabled={isPending}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.75rem' }}
            disabled={isPending}
          >
            {isPending ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid var(--border-subtle)', textAlign: 'center' }}>
          <span className="badge badge-amber" style={{ fontSize: '0.75rem' }}>
            Single-User Access Only
          </span>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
            Access is restricted to the administrator email configured in <code>ALLOWED_EMAIL</code>.
          </p>
        </div>
      </div>
    </div>
  );
}
