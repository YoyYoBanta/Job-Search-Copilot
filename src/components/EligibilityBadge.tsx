export function EligibilityBadge() {
  return (
    <span
      className="badge badge-amber"
      title="This is a general remote role without an explicit country listed. Please verify company work authorization and regional eligibility before applying."
      style={{ cursor: 'help' }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      Check eligibility
    </span>
  );
}
