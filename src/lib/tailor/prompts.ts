import { MatchAnalysis } from '@/components/JobsList';

export type OutreachRelationship = 'cold' | 'alumni' | 'ex-colleague' | 'mutual_connection';

export interface TailorPromptInputs {
  resumeText: string;
  totalYearsExperience?: number | null;
  pmYearsExperience?: number | null;
  targetRoles?: string[] | null;
  candidateEmail?: string;
  jobTitle: string;
  companyName: string;
  jobLocation: string;
  jobUrl: string;
  jobDescription: string;
  matchAnalysis?: MatchAnalysis | null;
  recipientName?: string | null;
  relationship?: OutreachRelationship | null;
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
  // Shortcoming & gap phrases
  'lack',
  'lack of',
  'no experience',
  "although i haven't",
  'although i have not',
  "while i don't have",
  'while i do not have',
  "haven't worked with",
  'have not worked with',
];

/**
 * Builds the system instructions for the Tailored Outreach LLM generator.
 */
export function buildTailorSystemPrompt(): string {
  return `You are an expert product management career advisor and executive copywriter.
Your task is to write two tailored, high-converting outreach assets for a candidate applying to a specific Product Management role:
1. A concise Cover Note (STRICT LENGTH: 130–170 words).
2. A direct LinkedIn Referral DM (STRICT LENGTH: under 90 words).

CRITICAL NON-NEGOTIABLE RULES:
1. STRICT DATA TRUTHFULNESS & GROUNDING:
   - Every company name, tool, product, metric, and skill you mention MUST appear in either:
     a) The candidate's resume, OR
     b) The target job description / company name.
   - NEVER invent or mention ungrounded third-party employers, tools, or metrics not present in the inputs.
2. TONE & BANNED PHRASES:
   - Use plain, punchy, confident, and professional product language.
   - FORBIDDEN PHRASES & CLICHÉS: DO NOT use any of these phrases or words: ${FORBIDDEN_CLICHES.map((c) => `"${c}"`).join(', ')}.
   - DO NOT state gaps, weaknesses, or shortcomings. Do NOT apologize or explain what the candidate lacks. Instead, proactively emphasize closest related experience and transferable product achievements.
3. LENGTH LIMITS:
   - Cover Note: MUST be between 130 and 170 words.
   - Referral Message: MUST be strictly under 90 words.
4. CONTENT REQUIREMENTS:
   - COVER NOTE (130–170 words):
     * Hook immediately with relevant PM domain experience and 1–2 tangible strengths from candidate's background.
     * Emphasize closest related experience relevant to the job's core challenges.
     * End with a direct, professional closing statement.
   - LINKEDIN REFERRAL MESSAGE (under 90 words):
     * Greeting: Use the recipient's name if provided (e.g. "Hi [Name],"), otherwise "Hi," or "Hi there,".
     * Tone tailored by relationship:
       - 'alumni': mention shared university/alumni connection warmly.
       - 'ex-colleague': warm peer tone referencing past time working together.
       - 'mutual_connection': polite reference to mutual network.
       - 'cold': crisp, respectful, professional.
     * MUST explicitly reference the job title AND the exact job URL provided in the prompt.
     * Ask if they are open to submitting an internal referral or introducing to the hiring team.
5. OUTPUT FORMAT:
   - Return ONLY a valid JSON object with the exact keys:
     {
       "cover_note": "...",
       "referral_message": "..."
     }
   - No markdown formatting around the JSON, no extra commentary.`;
}

/**
 * Builds the user prompt injecting resume, profile metadata, JD, and referral relationship context.
 */
export function buildTailorUserPrompt(inputs: TailorPromptInputs): string {
  const strengths = inputs.matchAnalysis?.top_reasons?.join('; ') || 'Strong alignment on core PM requirements';
  const leadBullets = inputs.matchAnalysis?.recommended_resume_bullets_to_lead_with?.join('\n• ') || 'None specified';

  const recipientGreeting = inputs.recipientName?.trim()
    ? `Recipient Name: ${inputs.recipientName.trim()}`
    : 'Recipient Name: Not specified (use generic greeting)';

  const relationshipContext = inputs.relationship || 'cold';

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
- Job URL: ${inputs.jobUrl}

Job Description:
"""
${inputs.jobDescription.trim()}
"""

Match Highlights:
- Top Strengths: ${strengths}
- Recommended Resume Highlights:
• ${leadBullets}

Referral Context:
- ${recipientGreeting}
- Relationship Type: ${relationshipContext}

Instructions:
1. Cover Note: Write 130–170 words emphasizing closest related experience. Do NOT mention gaps.
2. LinkedIn Referral DM: Write under 90 words tailored for relationship "${relationshipContext}". MUST include job title "${inputs.jobTitle}" and job link "${inputs.jobUrl}".
3. Ensure every company/tool name appears in the resume or JD.
4. Output valid JSON only with keys "cover_note" and "referral_message".`;
}
