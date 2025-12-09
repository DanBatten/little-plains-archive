import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../apps/web/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkPlatformData() {
  const { data } = await supabase
    .from('content_items')
    .select('id, title, platform_data, created_at')
    .eq('status', 'complete')
    .limit(5);

  console.log('=== Sample platform_data ===\n');
  data?.forEach((item, i) => {
    console.log(`${i + 1}. ${item.title?.slice(0, 40)}`);
    console.log(`   platform_data:`, JSON.stringify(item.platform_data, null, 2));
    console.log('');
  });
}

checkPlatformData();
