import * as cheerio from 'cheerio';
import { ApifyClient } from 'apify-client';
import type { ExtractedContent, MediaItem } from '@little-plains/core';
import type { ContentScraper, ScraperOptions } from './types';

/**
 * Generic web scraper using fetch + cheerio
 * Extracts Open Graph metadata, title, description, and main content
 * Uses Apify for screenshots when API token is available
 */
export class GenericScraper implements ContentScraper {
  name = 'generic';
  private apifyClient?: ApifyClient;

  constructor(apifyToken?: string) {
    const token = apifyToken || process.env.APIFY_API_TOKEN;
    if (token) {
      this.apifyClient = new ApifyClient({ token });
    }
  }

  canHandle(_url: string): boolean {
    // Generic scraper can handle any URL as a fallback
    return true;
  }

  async scrape(url: string, options?: ScraperOptions): Promise<ExtractedContent> {
    const timeout = options?.timeout || 15000;
    const maxImages = options?.maxImages || 10;
    const takeScreenshot = options?.takeScreenshot ?? true;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      // Extract Open Graph metadata
      const ogTitle = $('meta[property="og:title"]').attr('content');
      const ogDescription = $('meta[property="og:description"]').attr('content');
      const ogImage = $('meta[property="og:image"]').attr('content');
      const ogType = $('meta[property="og:type"]').attr('content');

      // Twitter Card metadata
      const twitterTitle = $('meta[name="twitter:title"]').attr('content');
      const twitterDescription = $('meta[name="twitter:description"]').attr('content');
      const twitterImage = $('meta[name="twitter:image"]').attr('content');
      const twitterCreator = $('meta[name="twitter:creator"]').attr('content');

      // Standard metadata
      const title = ogTitle || twitterTitle || $('title').text().trim() || undefined;
      const description =
        ogDescription ||
        twitterDescription ||
        $('meta[name="description"]').attr('content') ||
        undefined;

      // Author extraction
      const authorMeta =
        $('meta[name="author"]').attr('content') ||
        $('meta[property="article:author"]').attr('content');
      const authorName = authorMeta || twitterCreator?.replace('@', '') || undefined;
      const authorHandle = twitterCreator || undefined;

      // Published date
      const publishedAt =
        $('meta[property="article:published_time"]').attr('content') ||
        $('time[datetime]').attr('datetime') ||
        undefined;

      // Extract main content text
      // Remove script, style, nav, footer, header elements
      $('script, style, nav, footer, header, aside, .sidebar, .comments').remove();

      // Try to find main content area
      const mainContent =
        $('article').text() ||
        $('main').text() ||
        $('[role="main"]').text() ||
        $('body').text();

      const bodyText = mainContent.replace(/\s+/g, ' ').trim().slice(0, 5000) || undefined;

      // Extract images
      const images: MediaItem[] = [];
      const seenUrls = new Set<string>();

      // Add OG/Twitter image candidates first if present
      const metaImageCandidates = [
        ogImage,
        $('meta[property="og:image:url"]').attr('content'),
        $('meta[property="og:image:secure_url"]').attr('content'),
        $('meta[name="og:image"]').attr('content'),
        $('meta[name="og:image:url"]').attr('content'),
        $('meta[name="og:image:secure_url"]').attr('content'),
        twitterImage,
        $('meta[name="twitter:image:src"]').attr('content'),
        $('link[rel="image_src"]').attr('href'),
      ]
        .filter((candidate): candidate is string => !!candidate)
        .map((candidate) => this.resolveUrl(candidate, url));

      for (const candidate of metaImageCandidates) {
        if (!seenUrls.has(candidate)) {
          images.push({ url: candidate });
          seenUrls.add(candidate);
        }
      }

      // Extract images from content
      $('img').each((_, el) => {
        if (images.length >= maxImages) return false;

        const src = $(el).attr('src');
        const dataSrc = $(el).attr('data-src') ||
          $(el).attr('data-lazy-src') ||
          $(el).attr('data-original');
        const srcset = $(el).attr('srcset') || $(el).attr('data-srcset');
        const imgUrl = src || dataSrc || this.parseSrcset(srcset);

        if (imgUrl && !seenUrls.has(imgUrl) && this.isValidImageUrl(imgUrl)) {
          const resolvedUrl = this.resolveUrl(imgUrl, url);
          images.push({
            url: resolvedUrl,
            alt: $(el).attr('alt') || undefined,
            width: parseInt($(el).attr('width') || '0') || undefined,
            height: parseInt($(el).attr('height') || '0') || undefined,
          });
          seenUrls.add(imgUrl);
        }
      });

      // Extract video (basic OG video support)
      const ogVideo = $('meta[property="og:video"]').attr('content');
      const videos = ogVideo
        ? [
            {
              url: ogVideo,
              thumbnail: ogImage || undefined,
            },
          ]
        : [];

      // Take screenshot if enabled and Apify is available
      let screenshot: string | undefined;
      if (takeScreenshot && this.apifyClient) {
        try {
          screenshot = await this.takeScreenshot(url);
        } catch (err) {
          console.warn('Screenshot capture failed:', err);
        }
      }

      return {
        title,
        description,
        bodyText,
        authorName,
        authorHandle,
        publishedAt,
        images,
        videos,
        screenshot,
        platformData: {
          ogType,
          canonicalUrl: $('link[rel="canonical"]').attr('href'),
        },
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Take a screenshot of a URL using Apify's screenshot actor
   */
  private async takeScreenshot(url: string): Promise<string | undefined> {
    if (!this.apifyClient) return undefined;

    const attempts = [
      {
        label: 'default',
        input: {
          urls: [{ url }],
          viewportWidth: 1280,
          viewportHeight: 800,
          scrollToBottom: false,
          delay: 2000,
          waitUntil: 'networkidle2',
        },
        runOptions: {
          timeout: 180,
          memory: 1024,
        },
      },
      {
        label: 'lightweight',
        input: {
          urls: [{ url }],
          viewportWidth: 1024,
          viewportHeight: 640,
          scrollToBottom: false,
          delay: 1000,
          waitUntil: 'domcontentloaded',
        },
        runOptions: {
          timeout: 120,
          memory: 512,
        },
      },
    ];

    for (const attempt of attempts) {
      try {
        console.log(`Taking screenshot of ${url} via Apify (${attempt.label})...`);
        const screenshotUrl = await this.runScreenshot(url, attempt.input, attempt.runOptions);
        if (screenshotUrl) {
          console.log('Screenshot captured successfully:', screenshotUrl);
          return screenshotUrl;
        }
      } catch (err) {
        console.warn(`Apify screenshot error (${attempt.label}):`, err);
      }
    }

    console.warn('No screenshot found in Apify output');
    return undefined;
  }

  private async runScreenshot(
    url: string,
    input: {
      urls: Array<{ url: string }>;
      viewportWidth: number;
      viewportHeight: number;
      scrollToBottom: boolean;
      delay: number;
      waitUntil: string;
    },
    runOptions: {
      timeout: number;
      memory: number;
    }
  ): Promise<string | undefined> {
    const run = await this.apifyClient!.actor('apify/screenshot-url').call(input, runOptions);

    const { defaultDatasetId } = run;
    if (defaultDatasetId) {
      const dataset = this.apifyClient!.dataset(defaultDatasetId);
      const { items } = await dataset.listItems({ limit: 1 });
      const firstItem = items[0] as Record<string, unknown> | undefined;

      if (firstItem?.screenshotUrl) {
        return firstItem.screenshotUrl as string;
      }
    }

    const { defaultKeyValueStoreId } = run;
    const store = this.apifyClient!.keyValueStore(defaultKeyValueStoreId);
    const record = await store.getRecord('screenshot');

    if (record && record.value) {
      const value = record.value as unknown;
      let base64: string;

      if (Buffer.isBuffer(value)) {
        base64 = value.toString('base64');
      } else if (value instanceof ArrayBuffer) {
        base64 = Buffer.from(value).toString('base64');
      } else if (typeof value === 'string') {
        if (value.startsWith('data:') || value.startsWith('http')) {
          return value;
        }
        base64 = value;
      } else {
        console.warn('Unexpected screenshot value type:', typeof value);
        return undefined;
      }

      return `data:image/png;base64,${base64}`;
    }

    return undefined;
  }

  private resolveUrl(urlStr: string, baseUrl: string): string {
    try {
      return new URL(urlStr, baseUrl).href;
    } catch {
      return urlStr;
    }
  }

  private parseSrcset(srcset?: string | null): string | undefined {
    if (!srcset) return undefined;
    const candidates = srcset
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);

    let bestUrl: string | undefined;
    let bestScore = 0;

    for (const candidate of candidates) {
      const [candidateUrl, descriptor] = candidate.split(/\s+/);
      if (!candidateUrl) continue;

      let score = 1;
      if (descriptor?.endsWith('w')) {
        const width = parseInt(descriptor.replace('w', ''), 10);
        if (!Number.isNaN(width)) score = width;
      } else if (descriptor?.endsWith('x')) {
        const density = parseFloat(descriptor.replace('x', ''));
        if (!Number.isNaN(density)) score = density * 1000;
      }

      if (score >= bestScore) {
        bestScore = score;
        bestUrl = candidateUrl;
      }
    }

    return bestUrl;
  }

  private isValidImageUrl(url: string): boolean {
    // Filter out tracking pixels, icons, etc.
    if (url.includes('data:')) return false;
    if (url.includes('tracking')) return false;
    if (url.includes('pixel')) return false;
    if (url.includes('1x1')) return false;
    if (url.match(/\.(svg|gif)$/i)) return false; // Skip SVGs and GIFs for now

    return true;
  }
}
