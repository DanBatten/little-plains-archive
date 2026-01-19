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
    const embedUrl = this.getEmbedUrl(url);
    const oembed = await this.fetchOEmbed(url);

    const images: MediaItem[] = [];
    const videos: VideoItem[] = [];

    if (oembed?.thumbnail_url) {
      images.push({
        url: oembed.thumbnail_url,
        width: oembed.thumbnail_width,
        height: oembed.thumbnail_height,
      });
    }

    if (embedUrl) {
      videos.push({
        url: embedUrl,
        thumbnail: oembed?.thumbnail_url,
      });
    }

    return {
      title: oembed?.title,
      description: undefined,
      bodyText: undefined,
      authorName: oembed?.author_name,
      authorHandle: undefined,
      publishedAt: undefined,
      images,
      videos,
      screenshot: undefined,
      platformData: {
        oembed,
        embedUrl,
      },
    };
  }

  private async fetchOEmbed(url: string): Promise<YouTubeOEmbedResponse | undefined> {
    try {
      const endpoint = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
      const response = await fetch(endpoint);
      if (!response.ok) {
        return undefined;
      }
      return (await response.json()) as YouTubeOEmbedResponse;
    } catch {
      return undefined;
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
}

