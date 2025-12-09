import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../apps/web/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkScreenshots() {
  // Get web items without screenshots
  const { data, error } = await supabase
    .from('content_items')
    .select('id, source_url, title, platform_data, images')
    .eq('source_type', 'web')
    .eq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('Error:', error);
    return;
  }

  let withScreenshot = 0;
  let withoutScreenshot = 0;
  const missingExamples: string[] = [];

  data.forEach(item => {
    const platformData = item.platform_data as Record<string, unknown> | null;
    const hasScreenshot = platformData?.screenshot;
    const hasOgImage = item.images && item.images.length > 0;

    if (hasScreenshot) {
      withScreenshot++;
    } else {
      withoutScreenshot++;
      if (missingExamples.length < 10) {
        missingExamples.push(item.source_url + ' (has OG image: ' + (hasOgImage ? 'yes' : 'no') + ')');
      }
    }
  });

  console.log('=== Screenshot Status (last 50 web items) ===\n');
  console.log('With screenshot:', withScreenshot);
  console.log('Without screenshot:', withoutScreenshot);
  console.log('\nExamples without screenshot:');
  missingExamples.forEach(url => console.log('  -', url));
}

checkScreenshots();
