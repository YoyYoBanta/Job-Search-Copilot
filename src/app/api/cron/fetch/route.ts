import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/serviceRole';
import { executeCronFetchAndScore } from '@/lib/cron/runner';
import { timingSafeCompare } from '@/lib/cron/auth';

export const dynamic = 'force-dynamic';

/**
 * Configure maxDuration to 60 seconds (well within Vercel Hobby plan limits,
 * allowing 15 seconds buffer after our 45-second internal time budget).
 */
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const startTimeMs = Date.now();

  // 1. Validate Bearer Token Authorization with Constant-Time Comparison
  const expectedSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!expectedSecret || !token || !timingSafeCompare(token, expectedSecret)) {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid or missing Bearer token' },
      { status: 401 }
    );
  }

  // 2. Validate Allowed Users or Owner Configuration
  const ownerUserId = process.env.OWNER_USER_ID;
  const { getAllowedEmails } = await import('@/lib/auth');
  const allowedEmails = getAllowedEmails();

  if (!ownerUserId?.trim() && allowedEmails.length === 0) {
    console.error('[Cron API] Missing OWNER_USER_ID or ALLOWED_EMAILS configuration.');
    return NextResponse.json(
      { error: 'Server misconfiguration: OWNER_USER_ID or ALLOWED_EMAILS environment variable is missing.' },
      { status: 500 }
    );
  }

  try {
    const supabase = createServiceRoleClient();
    const result = await executeCronFetchAndScore(supabase, ownerUserId?.trim(), startTimeMs);

    return NextResponse.json({
      success: true,
      message: `Automatic job fetch & scoring completed with status: ${result.status}`,
      run: result,
    });
  } catch (err: any) {
    console.error('[Cron API Fatal Error]:', err);
    return NextResponse.json(
      {
        success: false,
        error: err?.message || 'Unexpected server error during cron execution.',
      },
      { status: 500 }
    );
  }
}
