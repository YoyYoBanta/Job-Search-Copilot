'use client';

import { useState, useEffect } from 'react';
import { generateOutreachAction, saveOutreachDraftAction } from '@/app/jobs/actions';
import { countWords } from '@/lib/tailor/validator';
import { OutreachRelationship } from '@/lib/tailor/prompts';
import { formatShortModelName } from '@/lib/groq/config';
import { LocalTime } from '@/components/LocalTime';
import { JobRecord } from '@/components/JobsList';

interface OutreachModalProps {
  job: JobRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: (
    jobId: string,
    coverNote: string,
    referralMessage: string,
    lastGeneratedCoverNote: string,
    lastGeneratedReferral: string,
    outreachModel: string,
    outreachUpdatedAt: string
  ) => void;
}

export function OutreachModal({ job, isOpen, onClose, onUpdate }: OutreachModalProps) {
  const [coverNote, setCoverNote] = useState('');
  const [referralMessage, setReferralMessage] = useState('');
  const [lastGeneratedCoverNote, setLastGeneratedCoverNote] = useState('');
  const [lastGeneratedReferral, setLastGeneratedReferral] = useState('');
  const [outreachModel, setOutreachModel] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  // Referral Customization Controls
  const [recipientName, setRecipientName] = useState('');
  const [relationship, setRelationship] = useState<OutreachRelationship>('cold');

  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'cover' | 'referral' | null>(null);
  const [showConfirmRegenerate, setShowConfirmRegenerate] = useState(false);

  useEffect(() => {
    if (job && isOpen) {
      setError(null);
      setWarnings([]);
      setSuccessNotice(null);
      setShowConfirmRegenerate(false);

      const initialCover = job.cover_note || '';
      const initialReferral = job.referral_message || '';
      const initialLastGenCover = job.last_generated_cover_note || initialCover;
      const initialLastGenRef = job.last_generated_referral || initialReferral;

      setCoverNote(initialCover);
      setReferralMessage(initialReferral);
      setLastGeneratedCoverNote(initialLastGenCover);
      setLastGeneratedReferral(initialLastGenRef);
      setOutreachModel(job.outreach_model || null);
      setLastSavedAt(job.outreach_updated_at || null);

      // Auto-generate on first open if no drafts exist
      if (!initialCover && !initialReferral) {
        executeGeneration(false);
      }
    }
  }, [job?.id, isOpen]);

  if (!isOpen || !job) return null;

  const hasCustomEdits =
    (coverNote.trim() && coverNote !== lastGeneratedCoverNote) ||
    (referralMessage.trim() && referralMessage !== lastGeneratedReferral);

  const handleRegenerateClick = () => {
    if (hasCustomEdits) {
      setShowConfirmRegenerate(true);
    } else {
      executeGeneration(true);
    }
  };

  const executeGeneration = async (force: boolean) => {
    setShowConfirmRegenerate(false);
    setIsLoading(true);
    setError(null);
    setWarnings([]);
    setSuccessNotice(null);

    try {
      const res = await generateOutreachAction(job.id, {
        forceRegenerate: force,
        recipientName: recipientName.trim() || undefined,
        relationship,
      });

      if (res.success && res.cover_note && res.referral_message) {
        const cover = res.cover_note;
        const refMsg = res.referral_message;
        const lastCover = res.last_generated_cover_note || cover;
        const lastRef = res.last_generated_referral || refMsg;
        const model = res.outreach_model || 'gpt-oss-120b';
        const nowIso = res.outreach_updated_at || new Date().toISOString();

        setCoverNote(cover);
        setReferralMessage(refMsg);
        setLastGeneratedCoverNote(lastCover);
        setLastGeneratedReferral(lastRef);
        setOutreachModel(model);
        setLastSavedAt(nowIso);

        if (res.fabricationWarnings && res.fabricationWarnings.length > 0) {
          setWarnings(res.fabricationWarnings);
        }

        onUpdate(job.id, cover, refMsg, lastCover, lastRef, model, nowIso);

        if (force) {
          setSuccessNotice('Fresh outreach drafts generated!');
          setTimeout(() => setSuccessNotice(null), 4000);
        }
      } else {
        setError(res.error || 'Failed to generate outreach copy.');
      }
    } catch (err: any) {
      setError(err?.message || 'Unexpected generation error.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    setSuccessNotice(null);

    try {
      const res = await saveOutreachDraftAction(job.id, coverNote, referralMessage);
      if (res.success) {
        const nowIso = res.outreach_updated_at || new Date().toISOString();
        setLastSavedAt(nowIso);
        onUpdate(
          job.id,
          coverNote,
          referralMessage,
          lastGeneratedCoverNote,
          lastGeneratedReferral,
          outreachModel || '',
          nowIso
        );
        setSuccessNotice('Draft changes saved successfully!');
        setTimeout(() => setSuccessNotice(null), 3000);
      } else {
        setError(res.error || 'Failed to save changes.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to save changes.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCopy = async (field: 'cover' | 'referral', text: string) => {
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2500);
    } catch (err) {
      console.error('Failed to copy text:', err);
    }
  };

  const coverWords = countWords(coverNote);
  const referralWords = countWords(referralMessage);

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(10, 14, 23, 0.85)',
        backdropFilter: 'blur(8px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1.5rem',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '860px',
          maxHeight: '92vh',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '1.25rem',
          boxShadow: '0 20px 40px rgba(0, 0, 0, 0.5)',
          border: '1px solid var(--border-accent)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <span className={`badge ${job.seniority_match === 'fit' ? 'badge-emerald' : 'badge-amber'}`}>
                {job.seniority_match === 'fit' ? 'Seniority Fit' : `Seniority ${job.seniority_match || 'Evaluated'}`}
              </span>
              <span className="badge" style={{ backgroundColor: 'rgba(99, 102, 241, 0.15)', color: '#818cf8', border: '1px solid rgba(99, 102, 241, 0.3)' }}>
                Phase 4 Tailored Outreach
              </span>
              {outreachModel && (
                <span className="badge" style={{ backgroundColor: 'rgba(255, 255, 255, 0.06)', color: 'var(--text-muted)' }}>
                  Model: {formatShortModelName(outreachModel)}
                </span>
              )}
            </div>
            <h2 className="card-title" style={{ fontSize: '1.375rem' }}>
              {job.title} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>at</span> {job.company_name}
            </h2>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.125rem' }}>
              {job.location} {lastSavedAt && (
                <>• Last saved <LocalTime isoDate={lastSavedAt} format="datetime" /></>
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="btn btn-secondary"
            style={{ padding: '0.375rem 0.625rem', fontSize: '1rem', lineHeight: 1 }}
            title="Close dialog"
          >
            ✕
          </button>
        </div>

        {/* Notices & Alerts */}
        {error && (
          <div className="alert alert-error" style={{ margin: 0, padding: '0.75rem 1rem' }}>
            <span>{error}</span>
          </div>
        )}

        {warnings.length > 0 && (
          <div className="alert alert-warning" style={{ margin: 0, padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: '0.25rem' }}>
            <span style={{ fontWeight: 600 }}>Anti-Fabrication Guard Notice:</span>
            {warnings.map((w, idx) => (
              <span key={idx} style={{ fontSize: '0.8125rem' }}>• {w}</span>
            ))}
          </div>
        )}

        {successNotice && (
          <div className="alert alert-success" style={{ margin: 0, padding: '0.75rem 1rem' }}>
            <span>{successNotice}</span>
          </div>
        )}

        {/* Confirmation Banner for Overwriting Edits */}
        {showConfirmRegenerate && (
          <div className="alert alert-warning" style={{ margin: 0, padding: '0.875rem 1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <span>⚠️ You have custom edits in your draft. Replace your edited version with fresh AI-generated copy?</span>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => executeGeneration(true)}
                className="btn btn-danger"
                style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
              >
                Yes, Replace
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmRegenerate(false)}
                className="btn btn-secondary"
                style={{ padding: '0.375rem 0.75rem', fontSize: '0.75rem' }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Referral Drawer Customization Panel */}
        <div
          style={{
            display: 'flex',
            gap: '1rem',
            padding: '0.875rem',
            backgroundColor: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border-subtle)',
            flexWrap: 'wrap',
          }}
        >
          <div style={{ flex: '1 1 200px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label className="label" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Recipient Name (Optional)
            </label>
            <input
              type="text"
              className="input"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="e.g. Alex"
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.8125rem' }}
            />
          </div>

          <div style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
            <label className="label" style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              Relationship Tone
            </label>
            <select
              className="input"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value as OutreachRelationship)}
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.8125rem', backgroundColor: 'var(--bg-secondary)' }}
            >
              <option value="cold">Cold Outreach (Direct & Crisp)</option>
              <option value="alumni">Alumni (Shared School / College)</option>
              <option value="ex-colleague">Ex-Colleague (Warm Peer)</option>
              <option value="mutual_connection">Mutual Connection</option>
            </select>
          </div>

          <div style={{ alignSelf: 'flex-end' }}>
            <button
              type="button"
              onClick={handleRegenerateClick}
              disabled={isLoading || isSaving}
              className="btn btn-secondary"
              style={{ padding: '0.45rem 0.875rem', fontSize: '0.8125rem' }}
              title="Apply customization and regenerate"
            >
              Apply & Regenerate
            </button>
          </div>
        </div>

        {isLoading ? (
          <div style={{ padding: '3rem 1rem', textAlign: 'center' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                border: '3px solid rgba(99, 102, 241, 0.2)',
                borderTopColor: '#6366f1',
                borderRadius: '50%',
                animation: 'spin 0.8s linear infinite',
                margin: '0 auto 1rem',
              }}
            />
            <p style={{ fontWeight: 600, color: 'var(--text-primary)' }}>Drafting tailored outreach copy...</p>
            <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.25rem' }}>
              Enforcing 130–170 words for cover note, &lt;90 words for referral, no gap admissions, and zero clichés.
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Section 1: Cover Note */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label className="label" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    Tailored Cover Note
                  </label>
                  <span style={{ fontSize: '0.75rem', color: coverWords < 130 || coverWords > 170 ? 'var(--accent-amber)' : 'var(--text-muted)' }}>
                    ({coverWords} words • target 130–170)
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleCopy('cover', coverNote)}
                  className="btn btn-secondary"
                  style={{
                    padding: '0.375rem 0.75rem',
                    fontSize: '0.75rem',
                    borderColor: copiedField === 'cover' ? 'var(--accent-emerald)' : undefined,
                    color: copiedField === 'cover' ? 'var(--accent-emerald)' : undefined,
                  }}
                  disabled={!coverNote.trim()}
                >
                  {copiedField === 'cover' ? '✓ Copied!' : '📋 Copy Cover Note'}
                </button>
              </div>

              <textarea
                className="textarea"
                rows={6}
                value={coverNote}
                onChange={(e) => setCoverNote(e.target.value)}
                placeholder="Cover note will appear here..."
                style={{ minHeight: '140px', fontSize: '0.875rem', lineHeight: '1.6' }}
              />
            </div>

            {/* Section 2: LinkedIn Referral Message */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <label className="label" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    LinkedIn Referral Request
                  </label>
                  <span style={{ fontSize: '0.75rem', color: referralWords >= 90 ? 'var(--accent-rose)' : 'var(--text-muted)' }}>
                    ({referralWords} words • target &lt;90)
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleCopy('referral', referralMessage)}
                  className="btn btn-secondary"
                  style={{
                    padding: '0.375rem 0.75rem',
                    fontSize: '0.75rem',
                    borderColor: copiedField === 'referral' ? 'var(--accent-emerald)' : undefined,
                    color: copiedField === 'referral' ? 'var(--accent-emerald)' : undefined,
                  }}
                  disabled={!referralMessage.trim()}
                >
                  {copiedField === 'referral' ? '✓ Copied!' : '📋 Copy Referral DM'}
                </button>
              </div>

              <textarea
                className="textarea"
                rows={4}
                value={referralMessage}
                onChange={(e) => setReferralMessage(e.target.value)}
                placeholder="LinkedIn referral message will appear here..."
                style={{ minHeight: '100px', fontSize: '0.875rem', lineHeight: '1.6' }}
              />
            </div>

            {/* Footer Action Bar */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '1px solid var(--border-subtle)',
                paddingTop: '1rem',
                flexWrap: 'wrap',
                gap: '0.75rem',
              }}
            >
              <button
                type="button"
                onClick={handleRegenerateClick}
                className="btn btn-secondary"
                disabled={isLoading || isSaving}
                title="Regenerate fresh drafts with AI"
              >
                🔄 Regenerate Drafts
              </button>

              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  onClick={onClose}
                  className="btn btn-secondary"
                  disabled={isLoading || isSaving}
                >
                  Done
                </button>

                <button
                  type="button"
                  onClick={handleSave}
                  className="btn btn-primary"
                  disabled={isLoading || isSaving || (!coverNote && !referralMessage)}
                >
                  {isSaving ? 'Saving...' : 'Save Drafts'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
