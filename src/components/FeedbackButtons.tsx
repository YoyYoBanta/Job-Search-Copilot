'use client';

import { useState } from 'react';
import { submitFeedbackAction } from '@/app/jobs/actions';

interface FeedbackButtonsProps {
  jobId: string;
  initialRating?: 'up' | 'down' | null;
}

export function FeedbackButtons({ jobId, initialRating = null }: FeedbackButtonsProps) {
  const [rating, setRating] = useState<'up' | 'down' | null>(initialRating);
  const [loading, setLoading] = useState(false);

  const handleFeedback = async (selected: 'up' | 'down') => {
    if (loading) return;
    setLoading(true);
    // Optimistic toggle
    const prev = rating;
    const next = prev === selected ? null : selected;
    setRating(next);

    try {
      const res = await submitFeedbackAction(jobId, selected);
      if (res.success && res.rating !== undefined) {
        setRating(res.rating);
      } else {
        setRating(prev);
      }
    } catch {
      setRating(prev);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}>
      <span style={{ fontSize: '0.75rem', color: '#64748b', marginRight: '0.2rem' }}>
        Score accurate?
      </span>
      <button
        type="button"
        onClick={() => handleFeedback('up')}
        disabled={loading}
        title="Thumbs Up - Fit score is accurate"
        style={{
          padding: '0.2rem 0.45rem',
          fontSize: '0.8rem',
          lineHeight: '1',
          border: rating === 'up' ? '1px solid #16a34a' : '1px solid #cbd5e1',
          borderRadius: '4px',
          backgroundColor: rating === 'up' ? '#dcfce7' : '#ffffff',
          color: rating === 'up' ? '#15803d' : '#64748b',
          cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        👍
      </button>
      <button
        type="button"
        onClick={() => handleFeedback('down')}
        disabled={loading}
        title="Thumbs Down - Fit score feels off"
        style={{
          padding: '0.2rem 0.45rem',
          fontSize: '0.8rem',
          lineHeight: '1',
          border: rating === 'down' ? '1px solid #dc2626' : '1px solid #cbd5e1',
          borderRadius: '4px',
          backgroundColor: rating === 'down' ? '#fee2e2' : '#ffffff',
          color: rating === 'down' ? '#b91c1c' : '#64748b',
          cursor: loading ? 'not-allowed' : 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        👎
      </button>
    </div>
  );
}
