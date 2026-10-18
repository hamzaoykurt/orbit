// Pure HTML -> readable page facts. Regex based on purpose: the Worker has no DOM and only needs head metadata,
// headings and a bounded amount of visible text.
export const MAX_PAGE_TEXT = 6000;

export type PageFacts = {
  title: string; description: string; ogTitle: string; ogDescription: string; ogImage: string;
  headings: string[]; text: string; lang: string;
};

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '…', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };
export const decodeEntities = (value: string) => value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
  if (code[0] === '#') {
    const point = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(point) && point > 0 && point < 0x110000 ? String.fromCodePoint(point) : match;
  }
  return ENTITIES[code.toLowerCase()] ?? match;
});
const clean = (value: string) => decodeEntities(value.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

const attr = (tag: string, name: string) => {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'));
  return match ? decodeEntities(match[1] ?? match[2] ?? match[3] ?? '') : '';
};

const metaContent = (html: string, keys: string[]) => {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const key = (attr(tag, 'property') || attr(tag, 'name') || attr(tag, 'itemprop')).toLowerCase();
    if (keys.includes(key)) { const content = clean(attr(tag, 'content')); if (content) return content; }
  }
  return '';
};

export const absoluteUrl = (value: string, base: string) => {
  if (!value) return '';
  try { const url = new URL(value, base); return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : ''; } catch { return ''; }
};

export function extractPage(html: string, base: string): PageFacts {
  const head = html.slice(0, 200_000);
  const title = clean((head.match(/<title[^>]*>([\s\S]*?)<\/title>/i) ?? [])[1] ?? '');
  const headings = [...html.matchAll(/<h([12])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map(match => clean(match[2])).filter(Boolean).slice(0, 8);
  const body = (html.match(/<body[\s\S]*$/i) ?? [html])[0]
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|template|iframe|canvas)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\/?(p|div|section|article|li|ul|ol|br|tr|h[1-6]|header|footer|main|nav)\b[^>]*>/gi, '\n');
  const text = decodeEntities(body.replace(/<[^>]*>/g, ' ')).split('\n').map(line => line.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n').slice(0, MAX_PAGE_TEXT);
  const htmlTag = head.match(/<html\b[^>]*>/i)?.[0];
  return {
    title,
    description: metaContent(head, ['description', 'twitter:description']),
    ogTitle: metaContent(head, ['og:title', 'twitter:title']),
    ogDescription: metaContent(head, ['og:description']),
    ogImage: absoluteUrl(metaContent(head, ['og:image', 'og:image:url', 'twitter:image', 'twitter:image:src']), base),
    headings, text, lang: htmlTag ? attr(htmlTag, 'lang') : '',
  };
}

// Enough to analyse honestly: some descriptive meta, or a fair amount of visible text.
export const isSufficient = (facts: PageFacts) => Boolean(facts.description || facts.ogDescription) || facts.text.length >= 300;
