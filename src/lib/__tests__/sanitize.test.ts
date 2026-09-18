import { describe, it, expect } from 'vitest';
import { sanitizeHtml } from '../sanitize';

describe('HTML Sanitizer Tests (Bug 1 Fix)', () => {
  it('correctly decodes and strips entity-encoded HTML tags from Greenhouse feeds', () => {
    const input = '&lt;h2&gt;&lt;strong&gt;Who we are&lt;/strong&gt;&lt;/h2&gt;&lt;ul&gt;&lt;li&gt;SQL&lt;/li&gt;&lt;/ul&gt;';
    const output = sanitizeHtml(input);

    expect(output).toBe('Who we are\n• SQL');
    expect(output).not.toContain('<');
    expect(output).not.toContain('>');
    expect(output).not.toContain('&lt;');
    expect(output).not.toContain('&gt;');
  });

  it('strips standard raw HTML tags, scripts, styles, and comments', () => {
    const input = `
      <style>body { color: red; }</style>
      <h1>Job Title</h1>
      <!-- internal memo -->
      <p>Paragraph text with <b>bold</b> and <i>italics</i> &amp; special symbols.</p>
      <script>alert('malicious')</script>
      <ul>
        <li>First requirement</li>
        <li>Second requirement</li>
      </ul>
    `;
    const output = sanitizeHtml(input);

    expect(output).toContain('Job Title');
    expect(output).toContain('Paragraph text with bold and italics & special symbols.');
    expect(output).toContain('• First requirement');
    expect(output).toContain('• Second requirement');
    expect(output).not.toContain('body { color: red; }');
    expect(output).not.toContain('alert');
    expect(output).not.toContain('<');
    expect(output).not.toContain('>');
  });

  it('handles empty or non-string inputs safely', () => {
    expect(sanitizeHtml('')).toBe('');
    expect(sanitizeHtml(null as any)).toBe('');
    expect(sanitizeHtml(undefined as any)).toBe('');
  });
});
