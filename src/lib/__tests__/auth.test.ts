import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getAllowedEmails, isEmailAllowed } from '../auth';

describe('Multi-User Auth Whitelist Tests', () => {
  const originalAllowedEmails = process.env.ALLOWED_EMAILS;
  const originalAllowedEmail = process.env.ALLOWED_EMAIL;

  afterEach(() => {
    process.env.ALLOWED_EMAILS = originalAllowedEmails;
    process.env.ALLOWED_EMAIL = originalAllowedEmail;
  });

  it('parses comma-separated ALLOWED_EMAILS list correctly', () => {
    process.env.ALLOWED_EMAILS = 'user1@example.com, user2@example.com, user3@test.com ';
    delete process.env.ALLOWED_EMAIL;

    const list = getAllowedEmails();
    expect(list).toEqual(['user1@example.com', 'user2@example.com', 'user3@test.com']);
  });

  it('falls back to ALLOWED_EMAIL for backward compatibility', () => {
    delete process.env.ALLOWED_EMAILS;
    process.env.ALLOWED_EMAIL = 'legacy@example.com';

    const list = getAllowedEmails();
    expect(list).toEqual(['legacy@example.com']);
  });

  it('correctly authorizes allowed emails case-insensitively and trims whitespace', () => {
    process.env.ALLOWED_EMAILS = 'Alice@Company.com, Bob@Company.com';
    delete process.env.ALLOWED_EMAIL;

    expect(isEmailAllowed('alice@company.com')).toBe(true);
    expect(isEmailAllowed('ALICE@COMPANY.COM')).toBe(true);
    expect(isEmailAllowed('  bob@company.com  ')).toBe(true);
    expect(isEmailAllowed('charlie@company.com')).toBe(false);
    expect(isEmailAllowed(null)).toBe(false);
    expect(isEmailAllowed('')).toBe(false);
  });
});
