import { describe, it, expect } from 'vitest';
import {
  buildTailorSystemPrompt,
  buildTailorUserPrompt,
  FORBIDDEN_CLICHES,
  TailorPromptInputs,
} from '../prompts';

describe('Tailor Prompts Construction Tests', () => {
  it('builds system prompt containing anti-fabrication and anti-cliché directives', () => {
    const sysPrompt = buildTailorSystemPrompt();
    expect(sysPrompt).toContain('ANTI-FABRICATION');
    expect(sysPrompt).toContain('FORBIDDEN PHRASES');
    expect(sysPrompt).toContain('Cover Note (~150 words)');
    expect(sysPrompt).toContain('LinkedIn Referral DM (~80 words)');
    expect(sysPrompt).toContain('"cover_note"');
    expect(sysPrompt).toContain('"referral_message"');

    for (const cliche of FORBIDDEN_CLICHES.slice(0, 5)) {
      expect(sysPrompt.toLowerCase()).toContain(cliche.toLowerCase());
    }
  });

  it('builds user prompt with candidate profile, resume, JD, and match analysis context', () => {
    const inputs: TailorPromptInputs = {
      resumeText: 'Led payments product scaling to $10M ARR across 4 countries.',
      totalYearsExperience: 6,
      pmYearsExperience: 4,
      targetRoles: ['Product Manager', 'APM'],
      jobTitle: 'Senior Product Manager, Growth',
      companyName: 'Acme Corp',
      jobLocation: 'Bengaluru, IN',
      jobDescription: 'Looking for a PM to lead international payment gateways.',
      matchAnalysis: {
        top_reasons: ['Strong fintech background', 'Experience with multi-country scaling'],
        gaps: ['Requires deeper B2B enterprise sales background'],
        recommended_resume_bullets_to_lead_with: ['Scaled payments platform from 0 to 1M MAU'],
      },
    };

    const userPrompt = buildTailorUserPrompt(inputs);

    expect(userPrompt).toContain('Total Experience: 6 years');
    expect(userPrompt).toContain('Product Management Experience: 4 years');
    expect(userPrompt).toContain('Target Roles: Product Manager, APM');
    expect(userPrompt).toContain('Led payments product scaling to $10M ARR');
    expect(userPrompt).toContain('Senior Product Manager, Growth');
    expect(userPrompt).toContain('Acme Corp');
    expect(userPrompt).toContain('Bengaluru, IN');
    expect(userPrompt).toContain('Strong fintech background');
    expect(userPrompt).toContain('Requires deeper B2B enterprise sales background');
    expect(userPrompt).toContain('Scaled payments platform from 0 to 1M MAU');
  });

  it('handles optional / missing fields gracefully', () => {
    const inputs: TailorPromptInputs = {
      resumeText: 'PM with 3 years experience in analytics.',
      jobTitle: 'Associate Product Manager',
      companyName: 'StartupXYZ',
      jobLocation: 'Remote',
      jobDescription: 'Build dashboards and growth experiments.',
    };

    const userPrompt = buildTailorUserPrompt(inputs);

    expect(userPrompt).toContain('Not specified');
    expect(userPrompt).toContain('StartupXYZ');
    expect(userPrompt).toContain('PM with 3 years experience');
  });
});
