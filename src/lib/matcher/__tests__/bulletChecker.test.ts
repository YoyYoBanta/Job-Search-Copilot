import { describe, it, expect } from 'vitest';
import { isBulletInResume, filterVerbatimBullets } from '../bulletChecker';

describe('Anti-Fabrication Bullet Checker', () => {
  const sampleResume = `
    Alex Mercer - Product Manager
    Summary: 4+ years of product management experience scaling B2B SaaS platforms.

    Experience:
    TechCorp (2021 - Present)
    • Spearheaded roadmap for core billing infrastructure, reducing invoice error rates by 42%.
    • Led cross-functional team of 8 engineers and 2 designers to launch self-serve checkout.
    • Analyzed user churn with SQL and Mixpanel, driving a 15% increase in 90-day retention.

    Skills: Product Strategy, SQL, Mixpanel, Agile/Scrum, User Research, Stripe APIs.
  `;

  it('accepts exact verbatim bullets from resume', () => {
    const bullet = 'Spearheaded roadmap for core billing infrastructure, reducing invoice error rates by 42%.';
    expect(isBulletInResume(bullet, sampleResume)).toBe(true);
  });

  it('accepts bullets with minor punctuation or capitalization variations', () => {
    const bullet = 'Spearheaded roadmap for core billing infrastructure reducing invoice error rates by 42%';
    expect(isBulletInResume(bullet, sampleResume)).toBe(true);
  });

  it('accepts bullets with slight whitespace differences', () => {
    const bullet = 'Led cross-functional team of 8 engineers and 2 designers to launch self-serve checkout';
    expect(isBulletInResume(bullet, sampleResume)).toBe(true);
  });

  it('rejects completely fabricated bullets not present in the resume', () => {
    const fabricated = 'Scaled Kubernetes clusters across multi-cloud AWS and GCP environments saving $2M annually.';
    expect(isBulletInResume(fabricated, sampleResume)).toBe(false);
  });

  it('rejects hallucinated metrics or achievements not in resume', () => {
    const hallucinated = 'Managed $50M annual budget and raised Series B venture round from Sequoia.';
    expect(isBulletInResume(hallucinated, sampleResume)).toBe(false);
  });

  it('filters an array of bullets, keeping only genuine ones', () => {
    const recommended = [
      'Spearheaded roadmap for core billing infrastructure, reducing invoice error rates by 42%.',
      'Architected deep learning neural networks for fraud detection using PyTorch.', // Fabricated
      'Analyzed user churn with SQL and Mixpanel, driving a 15% increase in 90-day retention.',
      'Authored corporate patent portfolio for autonomous vehicles.', // Fabricated
    ];

    const result = filterVerbatimBullets(recommended, sampleResume);
    expect(result).toHaveLength(2);
    expect(result[0]).toContain('Spearheaded roadmap for core billing');
    expect(result[1]).toContain('Analyzed user churn with SQL');
  });

  it('returns empty array if input is empty or resume is empty', () => {
    expect(filterVerbatimBullets([], sampleResume)).toEqual([]);
    expect(filterVerbatimBullets(['Some bullet'], '')).toEqual([]);
    expect(filterVerbatimBullets([], '')).toEqual([]);
  });
});
