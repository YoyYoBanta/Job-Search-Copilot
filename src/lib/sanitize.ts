/**
 * HTML Sanitizer & Text Normalizer
 * Strips HTML tags and excessive formatting from job descriptions before DB persistence and LLM scoring.
 * Correctly handles HTML-entity-encoded inputs (e.g., Greenhouse API returns &lt;p&gt; instead of <p>).
 */

function decodeEntities(str: string): string {
  return str
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#x2F;/gi, '/')
    .replace(/&#(\d+);/g, (_, code) => {
      try {
        return String.fromCharCode(parseInt(code, 10));
      } catch {
        return '';
      }
    })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return '';
      }
    })
    .replace(/&amp;/gi, '&');
}

export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }

  // 1. Decode HTML entities FIRST so encoded tags like &lt;p&gt; become <p>
  let text = decodeEntities(html);

  // 2. Remove script and style tags completely along with their content
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, ' ');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, ' ');

  // 3. Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');

  // 4. Convert block level elements and list items to newlines/bullets
  text = text.replace(/<\/(p|div|h[1-6]|tr|blockquote|ul|ol)>/gi, '\n');
  text = text.replace(/<br\s*[\/]?>/gi, '\n');
  text = text.replace(/<li\b[^>]*>/gi, '\n• ');
  text = text.replace(/<\/li>/gi, '');

  // 5. Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, ' ');

  // 6. Decode entities once more (for text entities like &amp;, &quot;, &#39;, &nbsp;)
  text = decodeEntities(text);

  // 7. Clean up line breaks and horizontal spacing
  text = text
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n');

  return text.trim();
}
