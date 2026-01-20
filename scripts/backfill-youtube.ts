#!/usr/bin/env npx tsx
/**
 * Backfill YouTube items:
 * - Find existing records with YouTube URLs that are not source_type 'youtube'
 * - Update source_type to 'youtube' and status to 'pending'
 * - Publish to Pub/Sub for re-processing
 *
 * Usage:
 *   npx tsx scripts/backfill-youtube.ts
 *   npx tsx scripts/backfill-youtube.ts --limit 25
 *   npx tsx scripts/backfill-youtube.ts --reprocess
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

const args = process.argv.slice(2);
let limit = 0;
let reprocess = false;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--limit' && args[i + 1]) {
    limit = parseInt(args[i + 1], 10);
  }
  if (args[i] === '--reprocess') {
    reprocess = true;
  }
}

async function backfillYouTube() {
  console.log('Fetching YouTube items to backfill...');

  let query = supabase
    .from('content_items')
    .select('id, source_url, source_type, slack_context_text')
    .or('source_url.ilike.%youtube.com%,source_url.ilike.%youtu.be%')
    .order('created_at', { ascending: false });

  if (!reprocess) {
    query = query.neq('source_type', 'youtube');
  }

  if (limit > 0) {
    query = query.limit(limit);
  }

  const { data: items, error } = await query;
  if (error) {
    console.error('Failed to fetch items:', error);
    process.exit(1);
  }

    if (!items || items.length === 0) {
      console.log(reprocess ? 'No YouTube items found for reprocess.' : 'No YouTube items found for backfill.');
      return;
    }

  console.log(`Found ${items.length} YouTube items. Updating and sending to queue...`);

  let sent = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const { error: updateError } = await supabase
        .from('content_items')
        .update({
          source_type: 'youtube',
          status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', item.id);

      if (updateError) {
        throw updateError;
      }

      const message = {
        captureId: item.id,
        url: item.source_url,
        sourceType: 'youtube',
        notes: item.slack_context_text || undefined,
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

  console.log('\n=== Backfill Complete ===');
  console.log(`Queued: ${sent}`);
  console.log(`Failed: ${failed}`);
}

backfillYouTube().catch(console.error);

