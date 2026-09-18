import { describe, it, expect } from 'vitest';
import { buildScoringPrompt, CandidateContext, JobContext } from '../prompts';

describe('Seniority & Fit Scoring Prompt Generation', () => {
  it('correctly formats candidate seniority context and rules into the system prompt', () => {
    const candidate: CandidateContext = {
      totalYearsExperience: 4.5,
      pmYearsExperience: 2,
      targetRoles: ['Associate Product Manager', 'Product Manager', 'APM'],
      resumeText: 'Experience: 2 years PM at StartupX. Total 4.5 years in tech.',
    };

    const job: JobContext = {
      title: 'Senior Product Manager - Payments',
      companyName: 'Stripe',
      location: 'Bengaluru, India',
      description: 'Requirements: 8+ years of product management experience.',
    };

    const { systemMessage, userMessage } = buildScoringPrompt(candidate, job);

    // Verify candidate context is injected
    expect(systemMessage).toContain('Total Professional Experience: 4.5 years');
    expect(systemMessage).toContain('Product Management (PM) Experience: 2 years');
    expect(systemMessage).toContain('Target Career Roles: [Associate Product Manager, Product Manager, APM]');

    // Verify seniority evaluation rules
    expect(systemMessage).toContain('"fit"');
    expect(systemMessage).toContain('APM or Associate Product Manager counts as "fit", NOT "under"');
    expect(systemMessage).toContain('"over"');
    expect(systemMessage).toContain('compare against PM experience (2 yrs), not total experience');
    expect(systemMessage).toContain('"under"');
    expect(systemMessage).toContain('Only classify as "under" for internships or positions below APM level');

    // Verify user message contains job details and candidate resume
    expect(userMessage).toContain('Senior Product Manager - Payments');
    expect(userMessage).toContain('Stripe');
    expect(userMessage).toContain('Requirements: 8+ years of product management experience.');
    expect(userMessage).toContain(candidate.resumeText);
  });

  it('uses default target roles when targetRoles is empty', () => {
    const candidate: CandidateContext = {
      totalYearsExperience: 1,
      pmYearsExperience: 0.5,
      targetRoles: [],
      resumeText: 'APM Intern resume text',
    };

    const job: JobContext = {
      title: 'Associate Product Manager',
      companyName: 'Swiggy',
      location: 'Bengaluru, India',
      description: 'Looking for an energetic APM to join our discovery team.',
    };

    const { systemMessage } = buildScoringPrompt(candidate, job);
    expect(systemMessage).toContain('Product Manager, APM, Product Owner, Product Analyst');
  });
});
