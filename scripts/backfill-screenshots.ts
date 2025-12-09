import { createClient } from '@supabase/supabase-js';
import { ApifyClient } from 'apify-client';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../apps/web/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const apifyClient = new ApifyClient({
  token: process.env.APIFY_API_TOKEN!,
});

async function takeScreenshot(url: string): Promise<string | undefined> {
  try {
    console.log(`  Taking screenshot of ${url}...`);

    const run = await apifyClient.actor('apify/screenshot-url').call({
      urls: [{ url }],
      viewportWidth: 1280,
      viewportHeight: 800,
      scrollToBottom: false,
      delay: 2000,
      waitUntil: 'networkidle2',
    }, {
      timeout: 60,
      memory: 1024,
    });

    const { defaultDatasetId } = run;
    if (defaultDatasetId) {
      const dataset = apifyClient.dataset(defaultDatasetId);
      const { items } = await dataset.listItems({ limit: 1 });
      const firstItem = items[0] as Record<string, unknown> | undefined;

      if (firstItem?.screenshotUrl) {
        return firstItem.screenshotUrl as string;
      }
    }

    return undefined;
  } catch (err) {
    console.error(`  Screenshot error:`, err);
    return undefined;
  }
}

async function backfillScreenshots() {
  // Get web items without screenshots
  const { data, error } = await supabase
    .from('content_items')
    .select('id, source_url, title, platform_data')
    .eq('source_type', 'web')
    .eq('status', 'complete')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching items:', error);
    return;
  }

  // Filter to items without screenshots
  const itemsWithoutScreenshots = data.filter(item => {
    const platformData = item.platform_data as Record<string, unknown> | null;
    return !platformData?.screenshot;
  });

  console.log(`Found ${itemsWithoutScreenshots.length} web items without screenshots\n`);

  if (itemsWithoutScreenshots.length === 0) {
    console.log('Nothing to backfill!');
    return;
  }

  // Limit to first N items (set to 0 for no limit)
  const LIMIT = parseInt(process.env.LIMIT || '0') || itemsWithoutScreenshots.length;
  const itemsToProcess = itemsWithoutScreenshots.slice(0, LIMIT);
  console.log(`Processing ${itemsToProcess.length} items...\n`);

  let success = 0;
  let failed = 0;

  for (const item of itemsToProcess) {
    console.log(`\n[${success + failed + 1}/${itemsWithoutScreenshots.length}] ${item.title || item.source_url}`);

    const screenshotUrl = await takeScreenshot(item.source_url);

    if (screenshotUrl) {
      // Update the item with the screenshot
      const platformData = (item.platform_data as Record<string, unknown>) || {};
      const { error: updateError } = await supabase
        .from('content_items')
        .update({
          platform_data: {
            ...platformData,
            screenshot: screenshotUrl,
          },
        })
        .eq('id', item.id);

      if (updateError) {
        console.log(`  ❌ Failed to update database: ${updateError.message}`);
        failed++;
      } else {
        console.log(`  ✓ Screenshot saved`);
        success++;
      }
    } else {
      console.log(`  ❌ Failed to capture screenshot`);
      failed++;
    }

    // Small delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log(`\n=== Backfill Complete ===`);
  console.log(`Success: ${success}`);
  console.log(`Failed: ${failed}`);
}

backfillScreenshots();
