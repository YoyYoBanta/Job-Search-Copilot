import { describe, it, expect } from 'vitest';
import {
  buildTailorSystemPrompt,
  buildTailorUserPrompt,
  FORBIDDEN_CLICHES,
  TailorPromptInputs,
} from '../prompts';

describe('Tailor Prompts Construction Tests', () => {
  it('builds system prompt containing anti-fabrication, length bounds, gap ban, style reference example, and new rules', () => {
    const sysPrompt = buildTailorSystemPrompt();
    expect(sysPrompt).toContain('STRICT DATA TRUTHFULNESS & GROUNDING');
    expect(sysPrompt).toContain('130–170 words');
    expect(sysPrompt).toContain('under 90 words');
    expect(sysPrompt).toContain('DO NOT state gaps');
    expect(sysPrompt).toContain('"cover_note"');
    expect(sysPrompt).toContain('"referral_message"');

    // Style reference example
    expect(sysPrompt).toContain('STYLE REFERENCE EXAMPLE (match this style, do not copy its content)');
    expect(sysPrompt).toContain("Wadhwani AI's APM role asks for someone who writes the spec");
    expect(sysPrompt).toContain("That's the loop I've been running at Amber.");

    // Truthfulness & Literal Claiming
    expect(sysPrompt).toContain('Only claim what the resume literally says.');
    expect(sysPrompt).toContain('Never explain what a fact proves.');
    expect(sysPrompt).toContain('Always use the full company name, never an acronym.');

    // Cover note & Referral rules
    expect(sysPrompt).toContain('Hook: Open by naming 1-2 specific requirements');
    expect(sysPrompt).toContain('Show, Don\'t Label');
    expect(sysPrompt).toContain('Shared Domain / Sector');
    expect(sysPrompt).toContain('Plain Closing');
    expect(sysPrompt).toContain('10-minute chat first');
    expect(sysPrompt).toContain('Must Name Company');

    // Check presence of banned phrases in system prompt / FORBIDDEN_CLICHES
    expect(FORBIDDEN_CLICHES).toContain('showing');
    expect(FORBIDDEN_CLICHES).toContain('demonstrates');
    expect(FORBIDDEN_CLICHES).toContain('demonstrating');
    expect(FORBIDDEN_CLICHES).toContain('honed my skills');
    expect(FORBIDDEN_CLICHES).toContain('proven ability');
    expect(FORBIDDEN_CLICHES).toContain('i am ready to');
    expect(FORBIDDEN_CLICHES).toContain('measurable impact');
    expect(FORBIDDEN_CLICHES).toContain('thank you for considering');
    expect(FORBIDDEN_CLICHES).toContain('product-focused builder');
    expect(FORBIDDEN_CLICHES).toContain('illustrating');
    expect(FORBIDDEN_CLICHES).toContain('providing the');
    expect(FORBIDDEN_CLICHES).toContain('the ability to');
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
    expect(userPrompt).toContain('Relationship: alumni');
    expect(userPrompt).toContain('https://stripe.com/jobs/12345');
    expect(userPrompt).toContain('Senior Product Manager, Growth');
    expect(userPrompt).toContain('Stripe');
    expect(userPrompt).toContain('NO "At [Company], I..." opener');
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
    expect(userPrompt).toContain('Relationship: cold');
    expect(userPrompt).toContain('10-minute chat');
    expect(userPrompt).toContain('https://startupxyz.com/careers/apm');
  });
});
