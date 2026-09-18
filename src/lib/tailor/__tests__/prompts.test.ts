import { describe, it, expect } from 'vitest';
import {
  buildTailorSystemPrompt,
  buildTailorUserPrompt,
  FORBIDDEN_CLICHES,
  TailorPromptInputs,
} from '../prompts';

describe('Tailor Prompts Construction Tests', () => {
  it('builds system prompt containing anti-fabrication, length bounds, and gap ban', () => {
    const sysPrompt = buildTailorSystemPrompt();
    expect(sysPrompt).toContain('STRICT DATA TRUTHFULNESS & GROUNDING');
    expect(sysPrompt).toContain('130–170 words');
    expect(sysPrompt).toContain('under 90 words');
    expect(sysPrompt).toContain('DO NOT state gaps');
    expect(sysPrompt).toContain('"cover_note"');
    expect(sysPrompt).toContain('"referral_message"');

    // Check presence of banned gap phrases in system prompt
    expect(sysPrompt.toLowerCase()).toContain('lack');
    expect(sysPrompt.toLowerCase()).toContain('no experience');
    expect(sysPrompt.toLowerCase()).toContain("although i haven't");
    expect(sysPrompt.toLowerCase()).toContain("while i don't have");
  });

  it('builds user prompt with recipient name, relationship context, job URL, and title', () => {
    const inputs: TailorPromptInputs = {
      resumeText: 'Led payments product scaling to $10M ARR across 4 countries at Swiggy.',
      totalYearsExperience: 6,
      pmYearsExperience: 4,
      targetRoles: ['Product Manager', 'APM'],
      jobTitle: 'Senior Product Manager, Growth',
      companyName: 'Stripe',
      jobLocation: 'Bengaluru, IN',
      jobUrl: 'https://stripe.com/jobs/12345',
      jobDescription: 'Looking for a PM to lead international payment gateways.',
      recipientName: 'Sarah Jenkins',
      relationship: 'alumni',
      matchAnalysis: {
        top_reasons: ['Strong fintech background', 'Experience with multi-country scaling'],
        gaps: ['Requires deeper B2B sales background'],
        recommended_resume_bullets_to_lead_with: ['Scaled payments platform from 0 to 1M MAU'],
      },
    };

    const userPrompt = buildTailorUserPrompt(inputs);

    expect(userPrompt).toContain('Recipient Name: Sarah Jenkins');
    expect(userPrompt).toContain('Relationship Type: alumni');
    expect(userPrompt).toContain('https://stripe.com/jobs/12345');
    expect(userPrompt).toContain('Senior Product Manager, Growth');
    expect(userPrompt).toContain('Stripe');
    expect(userPrompt).toContain('Do NOT mention gaps');
  });

  it('handles cold outreach with no recipient name and missing optional fields', () => {
    const inputs: TailorPromptInputs = {
      resumeText: 'PM with 3 years experience in analytics.',
      jobTitle: 'Associate Product Manager',
      companyName: 'StartupXYZ',
      jobLocation: 'Remote',
      jobUrl: 'https://startupxyz.com/careers/apm',
      jobDescription: 'Build dashboards and growth experiments.',
      relationship: 'cold',
    };

    const userPrompt = buildTailorUserPrompt(inputs);

    expect(userPrompt).toContain('Recipient Name: Not specified');
    expect(userPrompt).toContain('Relationship Type: cold');
    expect(userPrompt).toContain('https://startupxyz.com/careers/apm');
  });
});
