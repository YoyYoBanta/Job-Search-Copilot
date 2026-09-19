import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../route';
import { timingSafeCompare } from '@/lib/cron/auth';

describe('POST /api/cron/fetch route handler', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.CRON_SECRET = 'super-secret-cron-token-12345';
    process.env.OWNER_USER_ID = 'test-owner-uid-999';
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://mock.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'mock-service-role-key';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  describe('timingSafeCompare', () => {
    it('returns true for matching strings', () => {
      expect(timingSafeCompare('my-secret-token', 'my-secret-token')).toBe(true);
    });

    it('returns false for mismatched content with equal length', () => {
      expect(timingSafeCompare('my-secret-token1', 'my-secret-token2')).toBe(false);
    });

    it('returns false for mismatched lengths', () => {
      expect(timingSafeCompare('short', 'longer-string')).toBe(false);
      expect(timingSafeCompare('longer-string', 'short')).toBe(false);
    });

    it('returns false for empty or non-string values', () => {
      expect(timingSafeCompare('', 'secret')).toBe(false);
      expect(timingSafeCompare('secret', '')).toBe(false);
      expect(timingSafeCompare(undefined as any, 'secret')).toBe(false);
      expect(timingSafeCompare('secret', null as any)).toBe(false);
    });
  });

  describe('POST Authorization', () => {
    it('rejects with 401 when Authorization header is missing', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/fetch', {
        method: 'POST',
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error).toContain('Unauthorized');
    });

    it('rejects with 401 when Bearer token is incorrect', async () => {
      const request = new NextRequest('http://localhost:3000/api/cron/fetch', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer wrong-secret',
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error).toContain('Unauthorized');
    });

    it('returns 500 when OWNER_USER_ID is not configured in server env', async () => {
      delete process.env.OWNER_USER_ID;

      const request = new NextRequest('http://localhost:3000/api/cron/fetch', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer super-secret-cron-token-12345',
        },
      });

      const response = await POST(request);
      expect(response.status).toBe(500);
      const json = await response.json();
      expect(json.error).toContain('OWNER_USER_ID');
    });
  });
});
