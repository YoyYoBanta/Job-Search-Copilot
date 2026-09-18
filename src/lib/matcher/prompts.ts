/**
 * Groq Prompt Builder for AI Fit Scoring
 */

export interface CandidateContext {
  totalYearsExperience: number;
  pmYearsExperience: number;
  targetRoles: string[];
  resumeText: string;
}

export interface JobContext {
  title: string;
  companyName: string;
  location: string;
  description: string;
}

export function buildScoringPrompt(candidate: CandidateContext, job: JobContext) {
  const targetRolesFormatted = candidate.targetRoles.length > 0
    ? candidate.targetRoles.join(', ')
    : 'Product Manager, APM, Product Owner, Product Analyst';

  const systemMessage = `You are an expert technical recruiter and executive talent evaluator analyzing candidate-job fit for Product Management roles.
You evaluate candidate resumes against job descriptions with rigorous objectivity, zero hallucination, and precise seniority matching.

### CANDIDATE PROFILE CONTEXT:
- Total Professional Experience: ${candidate.totalYearsExperience} years
- Product Management (PM) Experience: ${candidate.pmYearsExperience} years
- Target Career Roles: [${targetRolesFormatted}]

### SENIORITY EVALUATION RULES:
1. "fit": The role's required PM years/level is within reach of the candidate's PM experience (${candidate.pmYearsExperience} yrs) and total experience (${candidate.totalYearsExperience} yrs), OR the job title is in the candidate's Target Career Roles (e.g. APM or Associate Product Manager counts as "fit", NOT "under").
2. "over": The role requires clearly more PM years than the candidate possesses (for example, if a job requires "8+ years of product management experience" and the candidate has fewer years of PM experience, classify as "over"). If a job states "X+ years of product management", compare against PM experience (${candidate.pmYearsExperience} yrs), not total experience.
3. "under": Only classify as "under" for internships or positions below APM level.

### CRITICAL ANTI-HALLUCINATION & TRUTHFULNESS RULES:
- In "top_reasons", cite ONLY skills, achievements, and facts explicitly present in the candidate's resume. Never invent past employers, tools, or domain experience.
- In "recommended_resume_bullets_to_lead_with", you MUST select and quote actual bullet points or lines VERBATIM directly from the Candidate Resume text below. Do NOT fabricate or rewrite bullet points.
- Output MUST be a single valid JSON object strictly matching the schema below. No conversational filler or markdown explanations outside the JSON.

### JSON OUTPUT SCHEMA:
{
  "fit_score": <number between 0 and 100>,
  "top_reasons": [<1 to 3 concise strings explaining genuine strengths/matches>],
  "gaps": [<0 to 3 concise strings highlighting missing requirements or stretch areas>],
  "recommended_resume_bullets_to_lead_with": [<1 to 3 actual verbatim bullet lines copied from the candidate resume>],
  "seniority_match": "under" | "fit" | "over"
}`;

  const userMessage = `Evaluate candidate fit for the following job posting:

---
JOB TITLE: ${job.title}
COMPANY: ${job.companyName}
LOCATION: ${job.location}

JOB DESCRIPTION:
${job.description}
---

CANDIDATE MASTER RESUME:
${candidate.resumeText || 'No resume text provided.'}
---

Return the fit evaluation JSON object now:`;

  return { systemMessage, userMessage };
}
