/**
 * Web Scraping Skill — fetch, parse, and extract data from web pages
 *
 * Zero external dependencies — uses Node.js built-in fetch and regex-based HTML parsing.
 */

interface ToolDef {
  name: string;
  description: string;
  parameters: { type: 'object'; required?: string[]; properties: Record<string, unknown> };
  handler: (params: any) => Promise<unknown>;
}

interface SkillApi {
  registerTool(tool: ToolDef): void;
  getConfig(): Record<string, unknown>;
}

// ── Constants ───────────────────────────────────

const MAX_BODY_SIZE = 5 * 1024 * 1024; // 5MB
const DEFAULT_TIMEOUT = 30000;
const USER_AGENT = 'XPR-Agent/1.0 (web-scraping-skill)';

// ── Shared helpers ──────────────────────────────

async function fetchPage(
  url: string,
  timeout: number = DEFAULT_TIMEOUT,
  headers?: Record<string, string>,
): Promise<{ html: string; status: number; contentType: string; finalUrl: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);

  try {
    const resp = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        ...headers,
      },
    });

    const contentType = resp.headers.get('content-type') || '';
    const contentLength = parseInt(resp.headers.get('content-length') || '0');
    if (contentLength > MAX_BODY_SIZE) {
      throw new Error(`Response too large: ${contentLength} bytes (max ${MAX_BODY_SIZE})`);
    }

    const html = await resp.text();
    if (html.length > MAX_BODY_SIZE) {
      throw new Error(`Response body too large: ${html.length} chars (max ${MAX_BODY_SIZE})`);
    }

    return {
      html,
      status: resp.status,
      contentType: contentType.split(';')[0].trim(),
      finalUrl: resp.url || url,
    };
  } finally {
    clearTimeout(timer);
  }
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&nbsp;/g, ' ');
}

function stripHtml(html: string): string {
  // Remove script, style, and noscript blocks
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');
  // Remove tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Decode entities
  text = decodeEntities(text);
  // Normalize whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n\s*\n/g, '\n\n');
  return text.trim();
}

function htmlToMarkdown(html: string): string {
  // Remove script/style/noscript
  let md = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  md = md.replace(/<style[\s\S]*?<\/style>/gi, '');
  md = md.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  md = md.replace(/<!--[\s\S]*?-->/g, '');

  // Headings
  md = md.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, (_, c) => `# ${stripHtml(c)}\n\n`);
  md = md.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, (_, c) => `## ${stripHtml(c)}\n\n`);
  md = md.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (_, c) => `### ${stripHtml(c)}\n\n`);
  md = md.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, (_, c) => `#### ${stripHtml(c)}\n\n`);
  md = md.replace(/<h5[^>]*>([\s\S]*?)<\/h5>/gi, (_, c) => `##### ${stripHtml(c)}\n\n`);
  md = md.replace(/<h6[^>]*>([\s\S]*?)<\/h6>/gi, (_, c) => `###### ${stripHtml(c)}\n\n`);

  // Bold / italic
  md = md.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**');
  md = md.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*');

  // Links
  md = md.replace(/<a\s+[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, text) => {
    const cleanText = stripHtml(text);
    return `[${cleanText}](${href})`;
  });

  // List items
  md = md.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_, c) => `- ${stripHtml(c)}\n`);

  // Paragraphs / line breaks
  md = md.replace(/<br\s*\/?>/gi, '\n');
  md = md.replace(/<\/p>/gi, '\n\n');
  md = md.replace(/<p[^>]*>/gi, '');

  // Block-level elements → newlines
  md = md.replace(/<\/(div|section|article|header|footer|main|nav)>/gi, '\n');

  // Remove remaining tags
  md = md.replace(/<[^>]+>/g, '');

  // Decode entities
  md = decodeEntities(md);

  // Clean up whitespace
  md = md.replace(/[ \t]+/g, ' ');
  md = md.replace(/\n{3,}/g, '\n\n');
  return md.trim();
}

function extractTitle(html: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decodeEntities(match[1].trim()) : '';
}

function extractMetaDescription(html: string): string {
  const match = html.match(/<meta\s+[^>]*name=["']description["'][^>]*content=["']([^"']*)["'][^>]*>/i)
    || html.match(/<meta\s+[^>]*content=["']([^"']*)["'][^>]*name=["']description["'][^>]*>/i);
  return match ? decodeEntities(match[1].trim()) : '';
}

function resolveUrl(href: string, base: string): string {
  try {
    return new URL(href, base).href;
  } catch {
    return href;
  }
}

interface ExtractedLink {
  href: string;
  text: string;
  type: 'internal' | 'external';
}

function extractLinksFromHtml(html: string, baseUrl: string): ExtractedLink[] {
  const links: ExtractedLink[] = [];
  const seen = new Set<string>();
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  let baseOrigin: string;
  try {
    baseOrigin = new URL(baseUrl).origin;
  } catch {
    baseOrigin = '';
  }

  while ((match = re.exec(html)) !== null) {
    const rawHref = match[1].trim();
    // Skip anchors, javascript:, mailto:, tel:
    if (rawHref.startsWith('#') || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:') || rawHref.startsWith('tel:')) continue;

    const absoluteHref = resolveUrl(rawHref, baseUrl);
    if (seen.has(absoluteHref)) continue;
    seen.add(absoluteHref);

    const text = stripHtml(match[2]).slice(0, 200);
    let linkType: 'internal' | 'external' = 'external';
    try {
      if (new URL(absoluteHref).origin === baseOrigin) linkType = 'internal';
    } catch { /* keep external */ }

    links.push({ href: absoluteHref, text, type: linkType });
  }

  return links;
}

// ── Skill entry point ───────────────────────────

export default function webScrapingSkill(api: SkillApi): void {
  // ── scrape_url ──
  api.registerTool({
    name: 'scrape_url',
    description: [
      'Fetch a web page and return its text content with metadata.',
      'Strips HTML tags by default (format="text"). Use format="markdown" to preserve structure,',
      'or format="html" to get raw HTML. Max response size: 5MB.',
    ].join(' '),
    parameters: {
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string', description: 'URL to fetch' },
        format: { type: 'string', description: '"text" (default), "markdown", or "html"' },
        timeout: { type: 'number', description: 'Request timeout in milliseconds (default 30000)' },
        headers: { type: 'object', description: 'Optional custom HTTP headers' },
      },
    },
    handler: async ({ url, format, timeout, headers }: {
      url: string; format?: string; timeout?: number; headers?: Record<string, string>;
    }) => {
      if (!url || !/^https?:\/\//i.test(url)) {
        return { error: 'Invalid URL. Must start with http:// or https://' };
      }

      try {
        const page = await fetchPage(url, timeout || DEFAULT_TIMEOUT, headers);

        let text: string;
        const fmt = (format || 'text').toLowerCase();
        if (fmt === 'html') {
          text = page.html;
        } else if (fmt === 'markdown') {
          text = htmlToMarkdown(page.html);
        } else {
          text = stripHtml(page.html);
        }

        const linkCount = (page.html.match(/<a\s+[^>]*href=/gi) || []).length;

        return {
          url: page.finalUrl,
          title: extractTitle(page.html),
          description: extractMetaDescription(page.html),
          text,
          links_count: linkCount,
          content_length: text.length,
          status: page.status,
          content_type: page.contentType,
        };
      } catch (err: any) {
        return { error: `Failed to fetch ${url}: ${err.message}` };
      }
    },
  });

  // ── extract_links ──
  api.registerTool({
    name: 'extract_links',
    description: [
      'Fetch a web page and extract all links with context.',
      'Returns resolved absolute URLs, link text, and internal/external classification.',
      'Use pattern parameter to filter links by regex on href.',
    ].join(' '),
    parameters: {
      type: 'object',
      required: ['url'],
      properties: {
        url: { type: 'string', description: 'URL to fetch and extract links from' },
        pattern: { type: 'string', description: 'Optional regex pattern to filter link hrefs' },
        limit: { type: 'number', description: 'Maximum links to return (default 50)' },
      },
    },
    handler: async ({ url, pattern, limit }: {
      url: string; pattern?: string; limit?: number;
    }) => {
      if (!url || !/^https?:\/\//i.test(url)) {
        return { error: 'Invalid URL. Must start with http:// or https://' };
      }

      try {
        const page = await fetchPage(url);
        let links = extractLinksFromHtml(page.html, page.finalUrl);

        if (pattern) {
          try {
            const re = new RegExp(pattern, 'i');
            links = links.filter(l => re.test(l.href));
          } catch (err: any) {
            return { error: `Invalid regex pattern: ${err.message}` };
          }
        }

        const maxLinks = Math.min(limit || 50, 200);
        const total = links.length;

        return {
          url: page.finalUrl,
          links: links.slice(0, maxLinks),
          total_found: total,
          returned: Math.min(total, maxLinks),
        };
      } catch (err: any) {
        return { error: `Failed to fetch ${url}: ${err.message}` };
      }
    },
  });

  // ── scrape_multiple ──
  api.registerTool({
    name: 'scrape_multiple',
    description: [
      'Fetch multiple URLs in parallel and return their text content.',
      'Useful for research and comparison tasks. Max 10 URLs per call.',
      'Uses Promise.allSettled so one failure does not block others.',
    ].join(' '),
    parameters: {
      type: 'object',
      required: ['urls'],
      properties: {
        urls: { type: 'array', description: 'Array of URLs to fetch (max 10)', items: { type: 'string' } },
        format: { type: 'string', description: '"text" (default) or "html"' },
      },
    },
    handler: async ({ urls, format }: { urls: string[]; format?: string }) => {
      if (!Array.isArray(urls) || urls.length === 0) {
        return { error: 'urls must be a non-empty array of strings' };
      }
      if (urls.length > 10) {
        return { error: 'Maximum 10 URLs per call' };
      }

      const fmt = (format || 'text').toLowerCase();

      const results = await Promise.allSettled(
        urls.map(async (url) => {
          if (!url || !/^https?:\/\//i.test(url)) {
            throw new Error('Invalid URL');
          }
          const page = await fetchPage(url);
          const text = fmt === 'html' ? page.html : stripHtml(page.html);
          return {
            url: page.finalUrl,
            title: extractTitle(page.html),
            text,
            status: page.status,
          };
        }),
      );

      const items = results.map((r, i) => {
        if (r.status === 'fulfilled') {
          return r.value;
        }
        return { url: urls[i], title: '', text: '', status: 0, error: r.reason?.message || 'Unknown error' };
      });

      const succeeded = items.filter(r => !('error' in r)).length;
      const failed = items.length - succeeded;

      return { results: items, succeeded, failed };
    },
  });
}
