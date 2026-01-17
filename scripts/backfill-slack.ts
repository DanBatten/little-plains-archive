#!/usr/bin/env npx tsx
/**
 * Slack Channel Backfill Script
 *
 * Fetches historical messages from a Slack channel and imports any URLs
 * found into the Little Plains Archive database.
 *
 * Usage:
 *   npx tsx scripts/backfill-slack.ts
 *
 * Environment variables required:
 *   - SLACK_BOT_TOKEN: Bot token with channels:history scope
 *   - NEXT_PUBLIC_SUPABASE_URL: Supabase project URL
 *   - SUPABASE_SERVICE_ROLE_KEY: Supabase service role key
 *   - SLACK_ALLOWED_CHANNELS: Channel ID to backfill (e.g., C07RVR3Q6TS)
 */

import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env.local
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../apps/web/.env.local') });

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CHANNEL_ID = process.env.SLACK_ALLOWED_CHANNELS?.split(',')[0];

if (!SLACK_BOT_TOKEN || !SUPABASE_URL || !SUPABASE_SERVICE_KEY || !CHANNEL_ID) {
  console.error('Missing required environment variables');
  console.error({
    SLACK_BOT_TOKEN: !!SLACK_BOT_TOKEN,
    SUPABASE_URL: !!SUPABASE_URL,
    SUPABASE_SERVICE_KEY: !!SUPABASE_SERVICE_KEY,
    CHANNEL_ID: !!CHANNEL_ID,
  });
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Extract URLs from Slack message text
function extractUrls(text: string): string[] {
  const slackUrlRegex = /<(https?:\/\/[^|>]+)(?:\|[^>]*)?>/g;
  const matches: string[] = [];
  let match;

  while ((match = slackUrlRegex.exec(text)) !== null) {
    matches.push(match[1]);
  }

  return matches;
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

// Normalize URL for deduplication
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Strip tracking parameters
    TRACKING_PARAMS.forEach(param => parsed.searchParams.delete(param));
    // Lowercase hostname
    parsed.hostname = parsed.hostname.toLowerCase();
    // Remove trailing slash (except for root)
    let normalized = parsed.toString();
    if (normalized.endsWith('/') && parsed.pathname !== '/') {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url;
  }
}

// Detect source type from URL
function detectSourceType(url: string): string {
  const hostname = new URL(url).hostname.toLowerCase();

  if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
    return 'twitter';
  }
  if (hostname.includes('instagram.com')) {
    return 'instagram';
  }
  if (hostname.includes('linkedin.com')) {
    return 'linkedin';
  }
  if (hostname.includes('pinterest.com')) {
    return 'pinterest';
  }
  return 'web';
}

// Fetch user info from Slack
async function getUserInfo(userId: string): Promise<{ name?: string; realName?: string }> {
  try {
    const response = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
      headers: {
        'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    if (data.ok && data.user) {
      return {
        name: data.user.profile?.display_name || data.user.name,
        realName: data.user.real_name,
      };
    }
  } catch (error) {
    console.error(`Failed to fetch user info for ${userId}:`, error);
  }
  return {};
}

// Fetch channel history from Slack
async function fetchChannelHistory(channelId: string, oldest?: string, cursor?: string): Promise<{
  messages: any[];
  nextCursor?: string;
}> {
  const params = new URLSearchParams({
    channel: channelId,
    limit: '200',
  });

  if (oldest) {
    params.set('oldest', oldest);
  }

  if (cursor) {
    params.set('cursor', cursor);
  }

  const response = await fetch(`https://slack.com/api/conversations.history?${params}`, {
    headers: {
      'Authorization': `Bearer ${SLACK_BOT_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });

  const data = await response.json();

  if (!data.ok) {
    throw new Error(`Slack API error: ${data.error}`);
  }

  return {
    messages: data.messages || [],
    nextCursor: data.response_metadata?.next_cursor,
  };
}

// Check if URL already exists in database
async function urlExists(url: string): Promise<boolean> {
  const { data } = await supabase
    .from('content_items')
    .select('id')
    .eq('source_url', url)
    .single();

  return !!data;
}

// Insert capture into database
async function insertCapture(capture: {
  url: string;
  sourceType: string;
  notes?: string;
  slackMessageTs: string;
  slackChannelId: string;
  slackUserId: string;
  slackUserName?: string;
  slackContextText?: string;
  slackTeamId?: string;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from('content_items')
    .insert({
      source_url: capture.url,
      source_type: capture.sourceType,
      status: 'pending',
      slack_message_ts: capture.slackMessageTs,
      slack_channel_id: capture.slackChannelId,
      slack_user_id: capture.slackUserId,
      slack_user_name: capture.slackUserName,
      slack_context_text: capture.slackContextText,
      slack_team_id: capture.slackTeamId,
    })
    .select('id')
    .single();

  if (error) {
    console.error('Insert error:', error);
    return null;
  }

  return data?.id || null;
}

// Main backfill function
async function backfill() {
  // Default to last 24 hours, or use BACKFILL_HOURS env var
  const hoursBack = parseInt(process.env.BACKFILL_HOURS || '24', 10);
  const oldestTimestamp = String(Math.floor((Date.now() - hoursBack * 60 * 60 * 1000) / 1000));

  console.log(`Starting backfill for channel: ${CHANNEL_ID}`);
  console.log(`Looking back ${hoursBack} hours (since ${new Date(parseInt(oldestTimestamp) * 1000).toISOString()})`);

  let cursor: string | undefined;
  let totalMessages = 0;
  let totalUrls = 0;
  let imported = 0;
  let skipped = 0;
  let errors = 0;

  // Cache for user info to avoid repeated API calls
  const userCache = new Map<string, { name?: string; realName?: string }>();

  do {
    console.log(`Fetching messages... (cursor: ${cursor || 'start'})`);

    const { messages, nextCursor } = await fetchChannelHistory(CHANNEL_ID!, oldestTimestamp, cursor);
    cursor = nextCursor;

    totalMessages += messages.length;
    console.log(`Fetched ${messages.length} messages (total: ${totalMessages})`);

    for (const message of messages) {
      // Skip bot messages and messages without text
      if (message.bot_id || !message.text) {
        continue;
      }

      const urls = extractUrls(message.text);
      if (urls.length === 0) {
        continue;
      }

      totalUrls += urls.length;

      // Get user info (from cache or API)
      let userInfo = userCache.get(message.user);
      if (!userInfo && message.user) {
        userInfo = await getUserInfo(message.user);
        userCache.set(message.user, userInfo);
      }

      // Get the message text without URLs for context
      const contextText = message.text
        .replace(/<https?:\/\/[^>]+>/g, '')
        .trim();

      for (const url of urls) {
        const normalizedUrl = normalizeUrl(url);

        // Check if already exists
        const exists = await urlExists(normalizedUrl);
        if (exists) {
          console.log(`  Skipping (duplicate): ${normalizedUrl}`);
          skipped++;
          continue;
        }

        const sourceType = detectSourceType(normalizedUrl);

        const captureId = await insertCapture({
          url: normalizedUrl,
          sourceType,
          notes: contextText || undefined,
          slackMessageTs: message.ts,
          slackChannelId: CHANNEL_ID!,
          slackUserId: message.user,
          slackUserName: userInfo?.name,
          slackContextText: contextText || undefined,
        });

        if (captureId) {
          console.log(`  Imported: ${normalizedUrl} (ID: ${captureId})`);
          imported++;
        } else {
          console.log(`  Error importing: ${normalizedUrl}`);
          errors++;
        }
      }
    }

    // Small delay to avoid rate limiting
    if (cursor) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }

  } while (cursor);

  console.log('\n=== Backfill Complete ===');
  console.log(`Total messages scanned: ${totalMessages}`);
  console.log(`Total URLs found: ${totalUrls}`);
  console.log(`Imported: ${imported}`);
  console.log(`Skipped (duplicates): ${skipped}`);
  console.log(`Errors: ${errors}`);
}

// Run the backfill
backfill().catch(console.error);
