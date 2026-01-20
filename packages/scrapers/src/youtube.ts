import * as cheerio from 'cheerio';
import type { ExtractedContent, MediaItem, VideoItem } from '@little-plains/core';
import type { ContentScraper, ScraperOptions } from './types';

interface YouTubeOEmbedResponse {
  title?: string;
  author_name?: string;
  author_url?: string;
  thumbnail_url?: string;
  thumbnail_width?: number;
  thumbnail_height?: number;
}

export class YouTubeScraper implements ContentScraper {
  name = 'youtube';

  canHandle(url: string): boolean {
    const lower = url.toLowerCase();
    return lower.includes('youtube.com') || lower.includes('youtu.be');
  }

  async scrape(url: string, _options?: ScraperOptions): Promise<ExtractedContent> {
    const normalizedUrl = this.normalizeUrl(url);
    const embedUrl = this.getEmbedUrl(normalizedUrl);
    const oembed = await this.fetchOEmbed(normalizedUrl);
    const ogMeta = await this.fetchOpenGraph(normalizedUrl);

    const images: MediaItem[] = [];
    const videos: VideoItem[] = [];

    const thumbnailUrl = ogMeta.image || oembed?.thumbnail_url;
    if (thumbnailUrl) {
      images.push({
        url: thumbnailUrl,
        width: ogMeta.imageWidth ?? oembed?.thumbnail_width,
        height: ogMeta.imageHeight ?? oembed?.thumbnail_height,
      });
    }

    if (embedUrl) {
      videos.push({
        url: embedUrl,
        thumbnail: thumbnailUrl,
      });
    }

    return {
      title: ogMeta.title || oembed?.title,
      description: ogMeta.description,
      bodyText: undefined,
      authorName: ogMeta.author || oembed?.author_name,
      authorHandle: undefined,
      publishedAt: undefined,
      images,
      videos,
      screenshot: undefined,
      platformData: {
        oembed,
        embedUrl,
        ...(ogMeta.raw ? { ogMeta: ogMeta.raw } : {}),
      },
    };
  }

  private async fetchOEmbed(url: string): Promise<YouTubeOEmbedResponse | undefined> {
    try {
      const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
      const response = await fetch(endpoint, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (!response.ok) {
        return undefined;
      }
      return (await response.json()) as YouTubeOEmbedResponse;
    } catch {
      return undefined;
    }
  }

  private async fetchOpenGraph(url: string): Promise<{
    title?: string;
    description?: string;
    image?: string;
    imageWidth?: number;
    imageHeight?: number;
    author?: string;
    raw?: Record<string, string>;
  }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
      });

      if (!response.ok) {
        return {};
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      const getMeta = (selector: string) => $(selector).attr('content') || undefined;

      const title = getMeta('meta[property="og:title"]') || $('title').text().trim() || undefined;
      const description =
        getMeta('meta[property="og:description"]') ||
        getMeta('meta[name="description"]') ||
        undefined;
      const image = getMeta('meta[property="og:image"]') ||
        getMeta('meta[property="og:image:secure_url"]') ||
        getMeta('meta[name="twitter:image"]') ||
        undefined;
      const imageWidth = parseInt(getMeta('meta[property="og:image:width"]') || '0', 10) || undefined;
      const imageHeight = parseInt(getMeta('meta[property="og:image:height"]') || '0', 10) || undefined;
      const author =
        getMeta('meta[name="author"]') ||
        getMeta('meta[property="og:site_name"]') ||
        undefined;

      const raw: Record<string, string> = {};
      [
        'meta[property="og:title"]',
        'meta[property="og:description"]',
        'meta[property="og:image"]',
        'meta[property="og:image:secure_url"]',
        'meta[property="og:image:width"]',
        'meta[property="og:image:height"]',
        'meta[name="twitter:image"]',
        'meta[name="description"]',
        'meta[name="author"]',
      ].forEach((selector) => {
        const value = getMeta(selector);
        if (value) raw[selector] = value;
      });

      return {
        title,
        description,
        image,
        imageWidth,
        imageHeight,
        author,
        raw: Object.keys(raw).length > 0 ? raw : undefined,
      };
    } catch {
      return {};
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private getEmbedUrl(url: string): string | undefined {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('youtu.be')) {
        const id = parsed.pathname.replace('/', '');
        return id ? `https://www.youtube.com/embed/${id}` : undefined;
      }

      const id = parsed.searchParams.get('v');
      if (id) {
        return `https://www.youtube.com/embed/${id}`;
      }

      if (parsed.pathname.startsWith('/shorts/')) {
        const shortId = parsed.pathname.split('/')[2];
        return shortId ? `https://www.youtube.com/embed/${shortId}` : undefined;
      }
    } catch {
      return undefined;
    }

    return undefined;
  }

  private normalizeUrl(url: string): string {
    try {
      return url.replace(/&amp;/g, '&');
    } catch {
      return url;
    }
  }
}

