import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import {
  detectSourceType,
  validateUrl,
  type CaptureMessage,
  type SlackMessageContext,
} from '@little-plains/core';
import { createCapture, captureExists } from '@/lib/supabase';
import { sendToQueue } from '@/lib/pubsub';

// Verify Slack request signature
function verifySlackSignature(
  signingSecret: string,
  timestamp: string,
  body: string,
  signature: string
): boolean {
  const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 60 * 5;
  if (parseInt(timestamp) < fiveMinutesAgo) {
    return false; // Request is too old
  }

  const sigBaseString = `v0:${timestamp}:${body}`;
  const mySignature = 'v0=' + crypto
    .createHmac('sha256', signingSecret)
    .update(sigBaseString)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(mySignature),
    Buffer.from(signature)
  );
}

// Extract URLs from Slack message text
function extractUrls(text: string): string[] {
  // Slack formats URLs as <url|display> or just <url>
  const slackUrlRegex = /<(https?:\/\/[^|>]+)(?:\|[^>]*)?>/g;
  const matches: string[] = [];
  let match;

  while ((match = slackUrlRegex.exec(text)) !== null) {
    matches.push(match[1]);
  }

  return matches;
}

// Get the allowed channel ID from environment
function isAllowedChannel(channelId: string): boolean {
  const allowedChannels = process.env.SLACK_ALLOWED_CHANNELS?.split(',') || [];
  // If no channels configured, allow all
  if (allowedChannels.length === 0) return true;
  return allowedChannels.includes(channelId);
}

// Fetch user info from Slack API to get display name
async function getUserName(userId: string): Promise<string | undefined> {
  const botToken = process.env.SLACK_BOT_TOKEN;
  if (!botToken) return undefined;

  try {
    const response = await fetch(`https://slack.com/api/users.info?user=${userId}`, {
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await response.json();
    if (data.ok && data.user) {
      // Prefer display_name, fall back to real_name, then name
      return data.user.profile?.display_name ||
             data.user.real_name ||
             data.user.name;
    }
  } catch (error) {
    console.error('Failed to fetch Slack user info:', error);
  }

  return undefined;
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const body = JSON.parse(rawBody);

    // Handle URL verification challenge (initial setup)
    if (body.type === 'url_verification') {
      return NextResponse.json({ challenge: body.challenge });
    }

    // Verify Slack signature
    const signingSecret = process.env.SLACK_SIGNING_SECRET;
    if (!signingSecret) {
      console.error('SLACK_SIGNING_SECRET not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    const timestamp = request.headers.get('x-slack-request-timestamp') || '';
    const signature = request.headers.get('x-slack-signature') || '';

    if (!verifySlackSignature(signingSecret, timestamp, rawBody, signature)) {
      console.error('Invalid Slack signature');
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Handle event callbacks
    if (body.type === 'event_callback') {
      const event = body.event;

      // Only process messages (not bot messages, not edits)
      if (
        event.type === 'message' &&
        !event.subtype &&
        !event.bot_id &&
        event.text
      ) {
        // Check if this channel is allowed
        if (!isAllowedChannel(event.channel)) {
          console.log(`Ignoring message from non-allowed channel: ${event.channel}`);
          return NextResponse.json({ ok: true });
        }

        // Extract URLs from the message
        const urls = extractUrls(event.text);

        if (urls.length === 0) {
          // No URLs in message, ignore
          return NextResponse.json({ ok: true });
        }

        // Process each URL found in the message
        const results = await Promise.all(
          urls.map(async (url) => {
            try {
              // Validate URL format
              const urlValidation = validateUrl(url);
              if (!urlValidation.valid) {
                console.log(`Invalid URL: ${url} - ${urlValidation.error}`);
                return { url, status: 'invalid' };
              }

              const normalizedUrl = urlValidation.normalized!;

              // Check for duplicates
              const exists = await captureExists(normalizedUrl);
              if (exists) {
                console.log(`URL already captured: ${normalizedUrl}`);
                return { url, status: 'duplicate' };
              }

              // Detect source type from URL
              const sourceType = detectSourceType(normalizedUrl);

              // Fetch the user's display name
              const userName = await getUserName(event.user);

              // Build Slack context
              const slackContext: SlackMessageContext = {
                messageTs: event.ts,
                channelId: event.channel,
                userId: event.user,
                userName,
                messageText: event.text,
                threadTs: event.thread_ts,
                teamId: body.team_id,
              };

              // Create pending record in Supabase
              // Use the message text (minus URLs) as notes
              const messageWithoutUrls = event.text
                .replace(/<https?:\/\/[^>]+>/g, '')
                .trim();

              const capture = await createCapture(
                normalizedUrl,
                sourceType,
                messageWithoutUrls || undefined
              );

              if (!capture) {
                console.error(`Failed to create capture for: ${normalizedUrl}`);
                return { url, status: 'error' };
              }

              // Send to processing queue with Slack context
              const message: CaptureMessage = {
                captureId: capture.id,
                url: normalizedUrl,
                sourceType,
                notes: messageWithoutUrls || undefined,
                slackContext,
              };

              const queued = await sendToQueue(message);
              if (!queued) {
                console.error('Failed to queue capture:', capture.id);
              }

              console.log(`Captured URL from Slack: ${normalizedUrl} (ID: ${capture.id})`);
              return { url, status: 'captured', id: capture.id };
            } catch (error) {
              console.error(`Error processing URL ${url}:`, error);
              return { url, status: 'error' };
            }
          })
        );

        console.log('Processed URLs:', results);
      }

      // Acknowledge the event
      return NextResponse.json({ ok: true });
    }

    // Unknown event type
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Slack event error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// Health check
export async function GET() {
  return NextResponse.json({ status: 'ok', service: 'slack-events' });
}
