import { z } from 'zod';

export const sourceTypeSchema = z.enum(['twitter', 'instagram', 'linkedin', 'pinterest', 'youtube', 'web', 'slack']);

export const contentTypeSchema = z.enum(['post', 'article', 'thread', 'image', 'video']);

export const captureStatusSchema = z.enum(['pending', 'processing', 'complete', 'failed']);

export const captureRequestSchema = z.object({
  url: z.string().url('Invalid URL format'),
  notes: z.string().optional(),
});

export const slackMessageContextSchema = z.object({
  messageTs: z.string(),
  channelId: z.string(),
  userId: z.string(),
  userName: z.string().optional(),
  messageText: z.string(),
  threadTs: z.string().optional(),
  teamId: z.string(),
});

export const slackCaptureRequestSchema = z.object({
  url: z.string().url('Invalid URL format'),
  slackContext: slackMessageContextSchema,
});

export const analysisResultSchema = z.object({
  summary: z.string().max(500),
  topics: z.array(z.string()).min(1).max(5),
  discipline: z.string(),
  useCases: z.array(z.string()).min(1).max(3),
  contentType: contentTypeSchema,
});

/**
 * Detect the source platform from a URL
 */
export function detectSourceType(url: string): z.infer<typeof sourceTypeSchema> {
  const urlLower = url.toLowerCase();

  if (urlLower.includes('twitter.com') || urlLower.includes('x.com')) {
    return 'twitter';
  }
  if (urlLower.includes('instagram.com')) {
    return 'instagram';
  }
  if (urlLower.includes('youtube.com') || urlLower.includes('youtu.be')) {
    return 'youtube';
  }
  if (urlLower.includes('linkedin.com')) {
    return 'linkedin';
  }
  if (urlLower.includes('pinterest.com') || urlLower.includes('pin.it')) {
    return 'pinterest';
  }

  return 'web';
}

// Common tracking parameters to strip for deduplication
const TRACKING_PARAMS = [
  'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term',
  'igsh', 'igshid', 'ig_rid',  // Instagram
  's', 't',                     // Twitter/X
  'ref', 'ref_src', 'ref_url', // Various referrer params
  'fbclid', 'gclid', 'gclsrc', // Facebook/Google ads
  'mc_cid', 'mc_eid',          // Mailchimp
  '_ga', '_gl',                // Google Analytics
];

/**
 * Validate and parse a URL, stripping tracking parameters
 */
export function validateUrl(url: string): { valid: boolean; normalized?: string; error?: string } {
  try {
    const parsed = new URL(url);

    // Only allow http/https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { valid: false, error: 'Only HTTP and HTTPS URLs are supported' };
    }

    // Strip tracking parameters
    TRACKING_PARAMS.forEach(param => parsed.searchParams.delete(param));

    // Normalize hostname to lowercase
    parsed.hostname = parsed.hostname.toLowerCase();

    // Get normalized URL and remove trailing slash (except for root)
    let normalized = parsed.href;
    if (normalized.endsWith('/') && parsed.pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }

    return { valid: true, normalized };
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }
}
