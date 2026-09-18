'use client';

import { useActionState, useState } from 'react';
import { saveResumeAction, type ProfileActionState } from '@/app/profile/actions';

interface ResumeEditorProps {
  initialResumeText: string;
  initialUpdatedAt: string | null;
}

export function ResumeEditor({
  initialResumeText,
  initialUpdatedAt,
}: ResumeEditorProps) {
  const [resumeText, setResumeText] = useState(initialResumeText);
  const [state, formAction, isPending] = useActionState<ProfileActionState, FormData>(
    saveResumeAction,
    {}
  );

  const wordCount = resumeText.trim() ? resumeText.trim().split(/\s+/).length : 0;
  const charCount = resumeText.length;

  return (
    <div className="card">
      <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 className="card-title">My Profile & Resume</h1>
          <p className="card-desc">
            Paste your raw resume text once. The AI Matcher and Tailor modules will strictly reference these facts.
          </p>
        </div>

        {initialUpdatedAt && (
          <div className="badge badge-emerald">
            <span>Last saved: {new Date(initialUpdatedAt).toLocaleString()}</span>
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
          <span>{state.message} {state.updatedAt && `(${state.updatedAt})`}</span>
        </div>
      )}

      <form action={formAction}>
        <div className="form-group">
          <label className="label" htmlFor="resume_text">
            Raw Resume Content (Plain Text / Markdown)
          </label>
          <textarea
            id="resume_text"
            name="resume_text"
            className="textarea"
            placeholder="Paste your resume text here (Summary, Work Experience, Projects, Skills, Education)..."
            value={resumeText}
            onChange={(e) => setResumeText(e.target.value)}
            disabled={isPending}
            rows={16}
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
                Saving Resume...
              </>
            ) : (
              'Save Resume Profile'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
