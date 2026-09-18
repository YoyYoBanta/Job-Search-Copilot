export interface SeniorityBadgeProps {
  seniority: 'under' | 'fit' | 'over' | string | null | undefined;
}

export function SeniorityBadge({ seniority }: SeniorityBadgeProps) {
  if (!seniority) return null;

  const normalized = seniority.toLowerCase();

  if (normalized === 'fit') {
    return (
      <span
        className="badge badge-emerald"
        title="Seniority level is within reach of your PM experience"
        style={{ fontSize: '0.6875rem' }}
      >
        🎯 Seniority: Fit
      </span>
    );
  }

  if (normalized === 'over') {
    return (
      <span
        className="badge badge-amber"
        title="Role requires significantly more PM experience than candidate has"
        style={{ fontSize: '0.6875rem' }}
      >
        ⚠️ Seniority: Over
      </span>
    );
  }

  if (normalized === 'under') {
    return (
      <span
        className="badge"
        title="Internship or entry-level role below APM"
        style={{
          backgroundColor: 'rgba(148, 163, 184, 0.15)',
          color: 'var(--text-secondary)',
          fontSize: '0.6875rem',
        }}
      >
        🔻 Seniority: Under
      </span>
    );
  }

  return (
    <span className="badge" style={{ fontSize: '0.6875rem' }}>
      Seniority: {seniority}
    </span>
  );
}
