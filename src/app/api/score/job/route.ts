import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { buildScoringPrompt } from '@/lib/matcher/prompts';
import { requestGroqFitScore } from '@/lib/groq/client';
import { filterVerbatimBullets } from '@/lib/matcher/bulletChecker';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth();
    const body = await request.json().catch(() => ({}));
    const { jobId } = body;

    if (!jobId || typeof jobId !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid jobId' }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Fetch user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('resume_text, total_years_experience, pm_years_experience, target_roles')
      .eq('user_id', user.id)
      .maybeSingle();

    if (profileError || !profile || !profile.resume_text?.trim()) {
      return NextResponse.json(
        { error: 'Profile resume is missing. Please save your resume in My Profile before scoring.' },
        { status: 400 }
      );
    }

    // 2. Fetch target job (strictly scoped to user_id via RLS)
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('id, title, company_name, location, description')
      .eq('id', jobId)
      .eq('user_id', user.id)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
    }

    // 3. Build prompts
    const { systemMessage, userMessage } = buildScoringPrompt(
      {
        totalYearsExperience: Number(profile.total_years_experience) || 0,
        pmYearsExperience: Number(profile.pm_years_experience) || 0,
        targetRoles: Array.isArray(profile.target_roles) ? profile.target_roles : [],
        resumeText: profile.resume_text,
      },
      {
        title: job.title,
        companyName: job.company_name,
        location: job.location,
        description: job.description,
      }
    );

    // 4. Request scoring from Groq
    try {
      const { data, modelUsed, rateLimitInfo } = await requestGroqFitScore(
        systemMessage,
        userMessage
      );

      // 5. Anti-Fabrication check: verify recommended bullets exist in candidate resume
      const verifiedBullets = filterVerbatimBullets(
        data.recommended_resume_bullets_to_lead_with,
        profile.resume_text
      );

      const matchAnalysis = {
        top_reasons: data.top_reasons,
        gaps: data.gaps,
        recommended_resume_bullets_to_lead_with: verifiedBullets,
      };

      // 6. Update job in Supabase
      const { error: updateError } = await supabase
        .from('jobs')
        .update({
          fit_score: Math.round(data.fit_score),
          match_analysis: matchAnalysis,
          seniority_match: data.seniority_match,
          scored_model: modelUsed,
          score_status: 'scored',
          scored_at: new Date().toISOString(),
        })
        .eq('id', jobId)
        .eq('user_id', user.id);

      if (updateError) {
        throw new Error(`Failed to save score to database: ${updateError.message}`);
      }

      return NextResponse.json({
        success: true,
        jobId,
        fit_score: Math.round(data.fit_score),
        seniority_match: data.seniority_match,
        match_analysis: matchAnalysis,
        scored_model: modelUsed,
        rateLimitInfo,
      });
    } catch (scoringError: any) {
      // If 429 rate limited, return retryAfterSeconds for client queue pacing without marking job as failed
      if (scoringError.status === 429) {
        return NextResponse.json(
          {
            error: 'rate_limited',
            retryAfterSeconds: scoringError.retryAfterSeconds || 5,
            message: scoringError.message,
          },
          { status: 429 }
        );
      }

      // If unrecoverable error, mark job as failed
      await supabase
        .from('jobs')
        .update({ score_status: 'failed' })
        .eq('id', jobId)
        .eq('user_id', user.id);

      return NextResponse.json(
        { error: 'scoring_failed', message: scoringError.message },
        { status: 500 }
      );
    }
  } catch (authOrSystemError: any) {
    return NextResponse.json(
      { error: authOrSystemError?.message || 'Unauthorized or server error' },
      { status: 401 }
    );
  }
}
