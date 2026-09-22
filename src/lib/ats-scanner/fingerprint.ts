import crypto from 'crypto';

/**
 * Computes a deterministic SHA-256 fingerprint hash of the user's resume text.
 */
export function computeResumeFingerprint(resumeText: string): string {
  const normalized = (resumeText || '')
    .trim()
    .replace(/\r\n/g, '\n')
    .replace(/\s+/g, ' ');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Compares a scan's stored resume fingerprint against the current resume text.
 * Returns true if the resume has changed since the scan was performed.
 */
export function isAtsScanStale(
  atsResumeFingerprint: string | null | undefined,
  currentResumeText: string
): boolean {
  if (!atsResumeFingerprint || !atsResumeFingerprint.trim()) {
    return false;
  }
  const currentFingerprint = computeResumeFingerprint(currentResumeText);
  return atsResumeFingerprint.trim() !== currentFingerprint;
}
