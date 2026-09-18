import { MatchAnalysis } from '@/components/JobsList';

export interface TailorPromptInputs {
  resumeText: string;
  totalYearsExperience?: number | null;
  pmYearsExperience?: number | null;
  targetRoles?: string[] | null;
  candidateEmail?: string;
  jobTitle: string;
  companyName: string;
  jobLocation: string;
  jobDescription: string;
  matchAnalysis?: MatchAnalysis | null;
}

export const FORBIDDEN_CLICHES = [
  'excited to apply',
  'writing to express my interest',
  'passionate',
  'passion for',
  'synergy',
  'synergies',
  'thrilled',
  'dynamic self-starter',
  'fast-paced environment',
  'hit the ground running',
  'ideal candidate',
  'unique opportunity',
  'perfect fit',
  'look no further',
];

/**
 * Builds the system instructions for the Tailored Outreach LLM generator.
 */
export function buildTailorSystemPrompt(): string {
  return `You are an expert product management career advisor and executive copywriter.
Your task is to write two tailored, high-converting outreach assets for a candidate applying to a specific Product Management role:
1. A concise Cover Note (~150 words).
2. A direct LinkedIn Referral DM (~80 words).

CRITICAL NON-NEGOTIABLE RULES:
1. STRICT DATA TRUTHFULNESS & ANTI-FABRICATION:
   - Every metric, company name, skill, metric, and achievement MUST come directly from the candidate's provided resume.
   - NEVER invent achievements, tools, projects, or statistics not explicitly stated in the resume.
2. TONE & ANTI-CLICHÉ RULES:
   - Use plain, punchy, confident, and professional product language.
   - FORBIDDEN PHRASES & CLICHÉS: DO NOT use any of these phrases or words: ${FORBIDDEN_CLICHES.map((c) => `"${c}"`).join(', ')}.
   - Sound like an experienced practitioner talking peer-to-peer.
3. CONTENT STRATEGY:
   - COVER NOTE (~150 words):
     * Hook immediately with relevant PM domain experience and 1-2 tangible strengths from the match analysis.
     * If a top gap is present in the match analysis, candidly and briefly frame how existing experience transfers, without sounding defensive or apologetic.
     * State direct readiness for the specific challenges of this role at the company.
   - LINKEDIN REFERRAL MESSAGE (~80 words):
     * Tailored for reaching out to an engineer, PM, or leader at the company for a referral.
     * Brief, respectful of their time, stating background in 1 sentence, why this role matches, and asking if they are open to submitting a referral or connecting with the hiring team.
4. OUTPUT FORMAT:
   - Return ONLY a valid JSON object with the exact keys:
     {
       "cover_note": "...",
       "referral_message": "..."
     }
   - No markdown formatting around the JSON, no extra chatter.`;
}

/**
 * Builds the user prompt injecting resume, profile metadata, JD, and match analysis.
 */
export function buildTailorUserPrompt(inputs: TailorPromptInputs): string {
  const strengths = inputs.matchAnalysis?.top_reasons?.join('; ') || 'Strong alignment on core PM requirements';
  const gaps = inputs.matchAnalysis?.gaps?.join('; ') || 'None identified';
  const leadBullets = inputs.matchAnalysis?.recommended_resume_bullets_to_lead_with?.join('\n• ') || 'None specified';

  return `Candidate Profile:
- Total Experience: ${inputs.totalYearsExperience ?? 'Not specified'} years
- Product Management Experience: ${inputs.pmYearsExperience ?? 'Not specified'} years
- Target Roles: ${inputs.targetRoles?.join(', ') || 'Product Manager'}

Candidate Resume:
"""
${inputs.resumeText.trim()}
"""

Target Job:
- Title: ${inputs.jobTitle}
- Company: ${inputs.companyName}
- Location: ${inputs.jobLocation}

Job Description:
"""
${inputs.jobDescription.trim()}
"""

Match Analysis Context:
- Top Strengths: ${strengths}
- Identified Gaps: ${gaps}
- Recommended Resume Highlights:
• ${leadBullets}

Instructions:
Generate the Cover Note (~150 words) and LinkedIn Referral DM (~80 words) adhering strictly to the anti-fabrication, tone, and JSON schema rules.`;
}
