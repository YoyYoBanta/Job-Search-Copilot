/**
 * HTML Sanitizer & Text Normalizer
 * Strips HTML tags and excessive formatting from job descriptions before DB persistence and LLM scoring.
 */

export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  let text = html;

  // 1. Remove script and style tags completely along with their content
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');

  // 2. Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');

  // 3. Convert block level elements and list items to newlines/bullets
  text = text.replace(/<\/(p|div|h[1-6]|tr|blockquote)>/gi, '\n');
  text = text.replace(/<br\s*[\/]?>/gi, '\n');
  text = text.replace(/<li\b[^>]*>/gi, '\n• ');
  text = text.replace(/<\/li>/gi, '');

  // 4. Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // 5. Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_, code) => {
      try {
        return String.fromCharCode(parseInt(code, 10));
      } catch {
        return '';
      }
    });

  // 6. Clean up line breaks and horizontal spacing
  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line, idx, arr) => {
      // Avoid more than 2 consecutive empty lines
      if (line === '' && arr[idx - 1] === '') {
        return false;
      }
      return true;
    })
    .join('\n');

  return text.trim();
}
