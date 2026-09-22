'use client';

import { useActionState, useState } from 'react';
import { saveProfileAction, type ProfileActionState } from '@/app/profile/actions';
import { LocalTime } from '@/components/LocalTime';

interface ResumeEditorProps {
  initialDisplayName?: string | null;
  initialResumeText: string;
  initialTotalYears: number;
  initialPmYears: number;
  initialTargetRoles: string[];
  initialUpdatedAt: string | null;
}

export function ResumeEditor({
  initialDisplayName,
  initialResumeText,
  initialTotalYears,
  initialPmYears,
  initialTargetRoles,
  initialUpdatedAt,
}: ResumeEditorProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName || '');
  const [resumeText, setResumeText] = useState(initialResumeText);
  const [totalYears, setTotalYears] = useState(initialTotalYears.toString());
  const [pmYears, setPmYears] = useState(initialPmYears.toString());
  const [targetRoles, setTargetRoles] = useState(initialTargetRoles.join(', '));

  const [state, formAction, isPending] = useActionState<ProfileActionState, FormData>(
    saveProfileAction,
    {}
  );

  const wordCount = resumeText.trim() ? resumeText.trim().split(/\s+/).length : 0;
  const charCount = resumeText.length;
  const currentUpdatedAt = state?.updatedAt || initialUpdatedAt;

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="card-title">My Profile & Candidate Experience</h1>
          <p className="card-desc">
            Configure your candidate background and paste your master resume. The AI Matcher and Tailor modules will strictly reference these parameters.
          </p>
        </div>

        {currentUpdatedAt && (
          <div className="badge badge-emerald">
            <LocalTime isoDate={currentUpdatedAt} format="datetime" prefix="Last saved: " />
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
          <span>
            {state.message}{' '}
            {state.updatedAt && (
              <LocalTime isoDate={state.updatedAt} format="time" prefix="(" />
            )}
            {state.updatedAt && ')'}
          </span>
        </div>
      )}

      <form action={formAction}>
        {/* Experience & Target Roles Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem', marginBottom: '1.5rem', padding: '1.25rem', backgroundColor: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
          <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label className="label" htmlFor="display_name">
              Display Name / Preferred Name
            </label>
            <input
              id="display_name"
              name="display_name"
              type="text"
              className="input"
              placeholder="e.g. Amber"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              disabled={isPending}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Used to personalize your dashboard greetings and cover note sign-offs.
            </span>
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="label" htmlFor="total_years_experience">
              Total Professional Experience (Years)
            </label>
            <input
              id="total_years_experience"
              name="total_years_experience"
              type="number"
              step="0.5"
              min="0"
              required
              className="input"
              placeholder="e.g. 5"
              value={totalYears}
              onChange={(e) => setTotalYears(e.target.value)}
              disabled={isPending}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="label" htmlFor="pm_years_experience">
              Product Management (PM) Experience (Years)
            </label>
            <input
              id="pm_years_experience"
              name="pm_years_experience"
              type="number"
              step="0.5"
              min="0"
              required
              className="input"
              placeholder="e.g. 3"
              value={pmYears}
              onChange={(e) => setPmYears(e.target.value)}
              disabled={isPending}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Used to evaluate JD clauses like &quot;8+ yrs in PM&quot;
            </span>
          </div>

          <div className="form-group" style={{ marginBottom: 0, gridColumn: '1 / -1' }}>
            <label className="label" htmlFor="target_roles">
              Target Career Roles (comma separated)
            </label>
            <input
              id="target_roles"
              name="target_roles"
              type="text"
              className="input"
              placeholder="e.g. APM, Associate Product Manager, Product Manager, Product Owner"
              value={targetRoles}
              onChange={(e) => setTargetRoles(e.target.value)}
              disabled={isPending}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Roles in this list are treated as &quot;fit&quot; (e.g. APM roles count as fit, not under)
            </span>
          </div>
        </div>

        {/* Master Resume Textarea */}
        <div className="form-group">
          <label className="label" htmlFor="resume_text">
            Master Resume Content (Plain Text / Markdown)
          </label>
          <textarea
            id="resume_text"
            name="resume_text"
            className="textarea"
            placeholder="Paste your full master resume text here (Summary, Experience, Bullet Points, Education, Skills)..."
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            disabled={isPending}
            rows={14}
          />
        </div>

        <div className="info-row">
          <div style={{ display: 'flex', gap: '1rem' }}>
            <span>Words: <strong>{wordCount.toLocaleString()}</strong></span>
            <span>Characters: <strong>{charCount.toLocaleString()}</strong></span>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            disabled={isPending || !resumeText.trim()}
          >
            {isPending ? (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" />
                </svg>
                Saving Profile...
              </>
            ) : (
              'Save Profile & Background'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
