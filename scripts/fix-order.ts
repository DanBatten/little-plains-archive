import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../apps/web/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function fixOrder() {
  // Get all migrated items (those created on 2025-12-08)
  const { data: items, error } = await supabase
    .from('content_items')
    .select('id, created_at')
    .eq('status', 'complete')
    .gte('created_at', '2025-12-08T00:00:00')
    .lte('created_at', '2025-12-08T23:59:59')
    .order('created_at', { ascending: true });

  if (error || !items) {
    console.error('Error fetching items:', error);
    return;
  }

  console.log(`Found ${items.length} migrated items to fix\n`);

  // Find min and max created_at timestamps
  const timestamps = items.map(i => new Date(i.created_at).getTime());
  const minTs = Math.min(...timestamps);
  const maxTs = Math.max(...timestamps);

  console.log(`Min timestamp: ${new Date(minTs).toISOString()}`);
  console.log(`Max timestamp: ${new Date(maxTs).toISOString()}`);
  console.log(`Range: ${(maxTs - minTs) / 1000} seconds\n`);

  // Flip the order: items inserted first (oldest created_at) should have newest captured_at
  // Formula: new_captured_at = maxTs - (created_at - minTs) = maxTs + minTs - created_at
  let updated = 0;
  for (const item of items) {
    const createdTs = new Date(item.created_at).getTime();
    const newCapturedTs = maxTs + minTs - createdTs;
    const newCapturedAt = new Date(newCapturedTs).toISOString();

    const { error: updateError } = await supabase
      .from('content_items')
      .update({ captured_at: newCapturedAt })
      .eq('id', item.id);

    if (updateError) {
      console.error(`Failed to update ${item.id}:`, updateError);
    } else {
      updated++;
    }
  }

  console.log(`Updated ${updated}/${items.length} items`);

  // Verify the fix
  console.log('\n=== Verification: First 5 by captured_at DESC ===\n');
  const { data: verified } = await supabase
    .from('content_items')
    .select('title, captured_at, published_at')
    .eq('status', 'complete')
    .order('captured_at', { ascending: false })
    .limit(5);

  verified?.forEach((item, i) => {
    console.log(`${i + 1}. ${item.title?.slice(0, 50)}`);
    console.log(`   captured_at:  ${item.captured_at}`);
    console.log(`   published_at: ${item.published_at}\n`);
  });
}

fixOrder();
