'use client';

import { useActionState, useState } from 'react';
import { pasteJobAction, type PasteJobActionState } from '@/app/jobs/actions';
import { evaluateJobFilter } from '@/config/filters';
import Link from 'next/link';

export default function PasteJobPage() {
  const [state, formAction, isPending] = useActionState<PasteJobActionState, FormData>(
    pasteJobAction,
    {}
  );

  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');

  // Live filter evaluation preview
  const filterPreview = title || location ? evaluateJobFilter(title, location) : null;

  return (
    <div style={{ maxWidth: '750px', margin: '1rem auto 3rem' }}>
      <div className="card">
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h1 className="card-title">Paste a Job</h1>
            <p className="card-desc">
              Manually paste any job description. It will be sanitized, validated against Product + India/Remote filters, and queued for AI scoring.
            </p>
          </div>

          <Link href="/jobs" className="btn btn-secondary" style={{ fontSize: '0.8125rem' }}>
            ← Back to Jobs
          </Link>
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

        {state?.success && (
          <div className="alert alert-success" role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <div>
              <div>{state.message}</div>
              {state.filterWarning && (
                <div style={{ fontSize: '0.75rem', marginTop: '0.25rem', opacity: 0.9 }}>
                  {state.filterWarning}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live Filter Hint Badge */}
        {filterPreview && (
          <div style={{ marginBottom: '1.25rem', padding: '0.75rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
            <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Filter Evaluation Preview:</span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {filterPreview.passed ? (
                <span className="badge badge-emerald">Eligible Role & Location</span>
              ) : (
                <span className="badge badge-rose">{filterPreview.reason || 'Will be filtered out'}</span>
              )}
              {filterPreview.needsEligibilityCheck && (
                <span className="badge badge-amber">Check eligibility badge</span>
              )}
            </div>
          </div>
        )}

        <form action={formAction}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            <div className="form-group">
              <label className="label" htmlFor="title">
                Job Title *
              </label>
              <input
                id="title"
                name="title"
                type="text"
                required
                className="input"
                placeholder="e.g. Senior Product Manager"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={isPending}
              />
            </div>

            <div className="form-group">
              <label className="label" htmlFor="company_name">
                Company Name *
              </label>
              <input
                id="company_name"
                name="company_name"
                type="text"
                required
                className="input"
                placeholder="e.g. Acme Corp"
                disabled={isPending}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
            <div className="form-group">
              <label className="label" htmlFor="location">
                Location *
              </label>
              <input
                id="location"
                name="location"
                type="text"
                required
                className="input"
                placeholder="e.g. Bengaluru, IN or Remote"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                disabled={isPending}
              />
            </div>

            <div className="form-group">
              <label className="label" htmlFor="job_url">
                Original Job URL *
              </label>
              <input
                id="job_url"
                name="job_url"
                type="url"
                required
                className="input"
                placeholder="https://boards.greenhouse.io/... or https://..."
                disabled={isPending}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="label" htmlFor="description">
              Job Description (HTML or Plain Text) *
            </label>
            <textarea
              id="description"
              name="description"
              required
              className="textarea"
              placeholder="Paste the full job description here (HTML tags will be automatically stripped)..."
              rows={12}
              disabled={isPending}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem' }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isPending || !title.trim()}
            >
              {isPending ? 'Saving & Sanitizing...' : 'Save Job Posting'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
