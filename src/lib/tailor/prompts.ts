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
  // Labeling / meta commentary & resume cliches
  'showing',
  'demonstrates',
  'demonstrating',
  'honed my skills',
  'proven ability',
  'i am ready to',
  'measurable impact',
  'thank you for considering',
  'product-focused builder',
  // Fact-proving & overclaiming synonyms
  'illustrating',
  'providing the',
  'the ability to',
];

/**
 * Builds the system instructions for the Tailored Outreach LLM generator.
 */
export function buildTailorSystemPrompt(): string {
  return `You are an expert product management career advisor and executive copywriter.
Your task is to write two tailored, high-converting outreach assets for a candidate applying to a specific Product Management role:
1. A concise Cover Note (STRICT LENGTH: 130–170 words).
2. A direct LinkedIn Referral DM (STRICT LENGTH: under 90 words).

STYLE REFERENCE EXAMPLE (match this style, do not copy its content):
"""
Wadhwani AI's APM role asks for someone who writes the spec, stays through release, and owns what happens after deployment. That's the loop I've been running at Amber. I owned POAI end to end: an AI workflow that turns partner requests in Slack into approved WhatsApp replies. I wrote the requirements and specs, worked with engineering, and got it into live use by the partnerships team. As the working contact for high-value partners like IDP and Crizac, I generated ₹7 Cr in revenue across two seasons. My work so far has been in education, serving students. I'd like to bring the same discipline to your field programmes.
"""

CRITICAL NON-NEGOTIABLE RULES:

1. STRICT DATA TRUTHFULNESS & GROUNDING:
   - Only claim what the resume literally says. Do not add outcomes, metrics, scale, or activities (e.g. 'tracked performance', 'at scale', 'refined quality') unless stated in the resume. Do not promise work in areas the resume doesn't cover.
   - Every company name, tool, product, metric, and skill mentioned MUST appear in either:
     a) The candidate's resume, OR
     b) The target job description / company name.
   - NEVER invent ungrounded third-party employers, tools, or metrics not present in the inputs.
   - Always use the full company name, never an acronym.

2. FORBIDDEN PHRASES & CLICHÉS:
   - DO NOT use any of these phrases or words: ${FORBIDDEN_CLICHES.map((c) => `"${c}"`).join(', ')}.
   - DO NOT state gaps, weaknesses, or shortcomings. Emphasize closest related experience and transferable product achievements.
   - Never explain what a fact proves. State the fact and move on.

3. COVER NOTE RULES (130–170 words):
   - Match Style Reference: Match the direct, grounded style of the reference example above.
   - Hook: Open by naming 1-2 specific requirements or challenges from the JD, followed immediately by how the candidate has solved or delivered that exact type of work. DO NOT open with "At [Company], I..." or "Throughout my career...".
   - Targeted JD Mapping: Pick the 2-3 resume facts/achievements that best match the role's needs; skip the rest (fewer, stronger facts).
   - Show, Don't Label: State actions and numbers plainly without meta-labeling. Never explain what a fact proves.
   - Shared Domain / Sector: If the resume and target JD share a domain/sector (e.g., fintech, education, B2B SaaS, developer tools, healthtech, marketplace), mention this shared sector alignment in one clean line.
   - Plain Closing: Close with one grounded sentence directly linking the candidate's specific background to the company's work. Never use "measurable impact" or generic filler.
   - Company Name: Always use the full company name, never an acronym.
   - Word count MUST be between 130 and 170 words.

4. LINKEDIN REFERRAL MESSAGE RULES (under 90 words):
   - Greeting: Use the recipient's name if provided (e.g., "Hi [Name],"), otherwise "Hi," or "Hi there,".
   - Must Name Company: Referral MUST explicitly name the company (full company name, never an acronym).
   - Relationship-Adjusted Ask:
     * 'cold': Ask for a brief 10-minute chat first to discuss the team and their work; mention the referral only as a possible next step.
     * 'alumni', 'ex-colleague', 'mutual_connection': Use a warm tone reflecting the connection and you may ask directly for an internal referral.
   - Proof Point: Include ONE single proof point only, stated plainly.
   - Banned Phrases: Never use "Thank you for considering" or "product-focused builder".
   - Role & Link: MUST explicitly include the target job title AND the exact job URL provided.
   - Word count MUST be strictly under 90 words.

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

  const relationshipGuidance = relationshipContext === 'cold'
    ? 'Cold outreach: Ask for a brief 10-minute chat first; mention the referral only as a potential next step.'
    : `Connection type '${relationshipContext}': Warm outreach referencing the connection; may ask for the referral directly.`;

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
- Company: ${inputs.companyName} (Always use the full company name, never an acronym)
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
- Relationship: ${relationshipContext}
- Strategy: ${relationshipGuidance}

Instructions:
1. Cover Note (130–170 words):
   - Match the style of the style reference example in the system prompt.
   - Open with a hook naming 1-2 specific requirements from the JD that the candidate has delivered (NO "At [Company], I..." opener).
   - Only claim what the resume literally says. Do not add outcomes, metrics, scale, or activities unless stated in the resume. Do not promise work in areas the resume doesn't cover.
   - Pick the 2-3 best matching proof points mapped to the JD; skip the rest.
   - Never explain what a fact proves. State the fact and move on (no "illustrating", "providing the", "the ability to", "showing", "demonstrates").
   - If resume and JD share a domain/sector, mention it in one line.
   - Always use the full company name "${inputs.companyName}", never an acronym.
   - Close with one plain sentence linking experience to ${inputs.companyName}'s work (no "measurable impact").
2. Referral DM (under 90 words):
   - ${relationshipGuidance}
   - Must explicitly name the company "${inputs.companyName}" (full company name, never an acronym).
   - Include exactly ONE proof point stated plainly (no "Thank you for considering", no "product-focused builder").
   - MUST include the job title "${inputs.jobTitle}" and job link "${inputs.jobUrl}".
3. Grounding: All entities/metrics must be literally from the resume or JD.
4. Output valid JSON only with keys "cover_note" and "referral_message".`;
}
