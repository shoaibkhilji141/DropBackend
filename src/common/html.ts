/** Turns marketplace rich-text / HTML into readable plain text. */
export const htmlToPlainText = (value: string | null | undefined): string => {
  if (!value) return '';
  if (!/<[a-z][\s\S]*>/i.test(value)) return value.trim();
  return value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
};

const ALLOWED_HTML_TAGS = new Set(['p', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'br']);

/** Keeps the small HTML subset eBay accepts on listing descriptions. */
export const sanitizeListingHtml = (value: string | null | undefined): string => {
  if (!value) return '';
  const withoutDanger = value
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '');

  return withoutDanger
    .replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (full, tag: string) => {
      const name = tag.toLowerCase();
      if (!ALLOWED_HTML_TAGS.has(name)) return '';
      if (name === 'br') return '<br />';
      return full.startsWith('</') ? `</${name}>` : `<${name}>`;
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

export const toHttpsImage = (url: string): string => {
  const trimmed = url.trim();
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (trimmed.startsWith('http://')) return `https://${trimmed.slice(7)}`;
  return trimmed;
};
