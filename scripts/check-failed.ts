import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../apps/web/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkFailed() {
  const { data, error } = await supabase
    .from('content_items')
    .select('id, source_url, source_type, error_message, created_at')
    .eq('status', 'failed')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error:', error);
    return;
  }

  console.log('=== Failed Items (' + data.length + ' total) ===\n');

  // Group by error type
  const errorGroups: Record<string, string[]> = {};
  data.forEach(item => {
    const errMsg = item.error_message || 'No error message';
    if (!errorGroups[errMsg]) {
      errorGroups[errMsg] = [];
    }
    errorGroups[errMsg].push(item.source_url);
  });

  Object.entries(errorGroups).forEach(([err, urls]) => {
    console.log('Error: ' + err);
    console.log('Count: ' + urls.length);
    console.log('Example URLs:');
    urls.slice(0, 3).forEach(url => console.log('  - ' + url));
    if (urls.length > 3) {
      console.log('  ... and ' + (urls.length - 3) + ' more');
    }
    console.log('');
  });
}

checkFailed();
