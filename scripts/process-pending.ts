#!/usr/bin/env npx tsx
/**
 * Process Pending Items Script
 *
 * Sends all pending content items to the Pub/Sub queue for processing.
 *
 * Usage:
 *   npx tsx scripts/process-pending.ts
 *   npx tsx scripts/process-pending.ts --limit 10  # Process only 10 items
 */

import { createClient } from '@supabase/supabase-js';
import { PubSub } from '@google-cloud/pubsub';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../apps/web/.env.local') });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT_ID || 'web-scrapbook';
const TOPIC_NAME = process.env.GOOGLE_CLOUD_PUBSUB_TOPIC || 'little-plains-process';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing required environment variables');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
const pubsub = new PubSub({ projectId: PROJECT_ID });
const topic = pubsub.topic(TOPIC_NAME);

// Parse command line arguments
const args = process.argv.slice(2);
let limit = 0; // 0 means no limit

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit' && args[i + 1]) {
    limit = parseInt(args[i + 1], 10);
  }
}

// Detect source type from URL
function detectSourceType(url: string): string {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    if (hostname.includes('twitter.com') || hostname.includes('x.com')) return 'twitter';
    if (hostname.includes('instagram.com')) return 'instagram';
    if (hostname.includes('linkedin.com')) return 'linkedin';
    if (hostname.includes('pinterest.com')) return 'pinterest';
  } catch {
    // Invalid URL, default to web
  }
  return 'web';
}

async function processPending() {
  console.log('Fetching pending items...');

  // Get all pending items
  let query = supabase
    .from('content_items')
    .select('id, source_url, source_type, slack_context_text')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (limit > 0) {
    query = query.limit(limit);
  }

  const { data: items, error } = await query;

  if (error) {
    console.error('Failed to fetch items:', error);
    process.exit(1);
  }

  if (!items || items.length === 0) {
    console.log('No pending items found.');
    return;
  }

  console.log(`Found ${items.length} pending items. Sending to queue...`);

  let sent = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const message = {
        captureId: item.id,
        url: item.source_url,
        sourceType: item.source_type || detectSourceType(item.source_url),
        notes: item.slack_context_text,
      };

      const messageBuffer = Buffer.from(JSON.stringify(message));
      await topic.publishMessage({ data: messageBuffer });

      console.log(`  Queued: ${item.source_url}`);
      sent++;
    } catch (err) {
      console.error(`  Failed to queue ${item.source_url}:`, err);
      failed++;
    }
  }

  console.log('\n=== Processing Complete ===');
  console.log(`Sent to queue: ${sent}`);
  console.log(`Failed: ${failed}`);
  console.log('\nItems will be processed by the Cloud Function. Check logs with:');
  console.log('  npm run logs:function');
}

processPending().catch(console.error);
