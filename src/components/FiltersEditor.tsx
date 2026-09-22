'use client';

import { useActionState, useState } from 'react';
import { saveUserFiltersAction, type FiltersActionState } from '@/app/profile/actions';
import { LocalTime } from '@/components/LocalTime';
import {
  DEFAULT_INCLUDE_TITLES,
  DEFAULT_EXCLUDE_TITLES,
  DEFAULT_ALLOWED_LOCATIONS,
} from '@/config/filters';

interface FiltersEditorProps {
  initialIncludeTitles: string[];
  initialExcludeTitles: string[];
  initialAllowedLocations: string[];
  initialAllowRemote: boolean;
  initialUpdatedAt: string | null;
}

export function FiltersEditor({
  initialIncludeTitles,
  initialExcludeTitles,
  initialAllowedLocations,
  initialAllowRemote,
  initialUpdatedAt,
}: FiltersEditorProps) {
  const [includeTitles, setIncludeTitles] = useState(initialIncludeTitles.join(', '));
  const [excludeTitles, setExcludeTitles] = useState(initialExcludeTitles.join(', '));
  const [allowedLocations, setAllowedLocations] = useState(initialAllowedLocations.join(', '));
  const [allowRemote, setAllowRemote] = useState(initialAllowRemote);

  const [state, formAction, isPending] = useActionState<FiltersActionState, FormData>(
    saveUserFiltersAction,
    {}
  );

  const currentUpdatedAt = state?.updatedAt || initialUpdatedAt;

  const handleResetToDefaults = () => {
    setIncludeTitles(DEFAULT_INCLUDE_TITLES.join(', '));
    setExcludeTitles(DEFAULT_EXCLUDE_TITLES.join(', '));
    setAllowedLocations(DEFAULT_ALLOWED_LOCATIONS.join(', '));
    setAllowRemote(true);
  };

  return (
    <div className="card" style={{ marginTop: '2rem' }}>
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h2 className="card-title" style={{ fontSize: '1.25rem' }}>
            ⚙️ Target Job Filtering Rules
          </h2>
          <p className="card-desc">
            Customize which job titles and locations pass ingestion and auto-scoring for your account.
          </p>
        </div>

        {currentUpdatedAt && (
          <div className="badge badge-emerald">
            <LocalTime isoDate={currentUpdatedAt} format="datetime" prefix="Filters updated: " />
          </div>
        )}
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
          <span>{state.message}</span>
        </div>
      )}

      <form action={formAction}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Include Titles */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="label" htmlFor="include_titles">
              Included Title Keywords (comma separated)
            </label>
            <input
              id="include_titles"
              name="include_titles"
              type="text"
              className="input"
              value={includeTitles}
              onChange={(e) => setIncludeTitles(e.target.value)}
              disabled={isPending}
              placeholder="e.g. Product Manager, APM, Associate Product, Product Owner"
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Jobs matching any of these whole-word phrases will be considered.
            </span>
          </div>

          {/* Exclude Titles */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="label" htmlFor="exclude_titles">
              Excluded Title / Seniority Keywords (comma separated)
            </label>
            <input
              id="exclude_titles"
              name="exclude_titles"
              type="text"
              className="input"
              value={excludeTitles}
              onChange={(e) => setExcludeTitles(e.target.value)}
              disabled={isPending}
              placeholder="e.g. Director, Head of, VP, Principal, Group Product, Staff"
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Jobs matching any of these whole-word phrases will be automatically filtered out.
            </span>
          </div>

          {/* Allowed Locations */}
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="label" htmlFor="allowed_locations">
              Approved Locations / Cities (comma separated)
            </label>
            <input
              id="allowed_locations"
              name="allowed_locations"
              type="text"
              className="input"
              value={allowedLocations}
              onChange={(e) => setAllowedLocations(e.target.value)}
              disabled={isPending}
              placeholder="e.g. India, Bangalore, Bengaluru, Mumbai, Pune, Gurgaon, Delhi, Hyderabad"
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Jobs in these locations or matching uppercase country code IN pass filter.
            </span>
          </div>

          {/* Allow Remote Checkbox */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
            <input
              id="allow_remote"
              name="allow_remote"
              type="checkbox"
              checked={allowRemote}
              onChange={(e) => setAllowRemote(e.target.checked)}
              disabled={isPending}
              style={{ cursor: 'pointer', width: '18px', height: '18px' }}
            />
            <div>
              <label htmlFor="allow_remote" style={{ fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}>
                Allow General / Worldwide Remote Roles
              </label>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Country-less remote roles pass with a &quot;Check eligibility&quot; badge. Region-restricted remote outside allowed locations (e.g. &quot;Remote - US&quot;) is always excluded in code.
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
            <button
              type="button"
              onClick={handleResetToDefaults}
              className="btn btn-secondary"
              disabled={isPending}
              style={{ fontSize: '0.8125rem' }}
            >
              Reset to Defaults
            </button>

            <button
              type="submit"
              className="btn btn-primary"
              disabled={isPending}
            >
              {isPending ? 'Saving Filters...' : 'Save Filter Rules'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
