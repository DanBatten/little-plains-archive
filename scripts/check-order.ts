import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../apps/web/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkOrder() {
  // Get first 10 items ordered by created_at DESC (current order)
  const { data: byCreatedAt } = await supabase
    .from('content_items')
    .select('id, title, created_at, captured_at, published_at')
    .eq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(10);

  console.log('=== First 10 by created_at DESC (current order) ===\n');
  byCreatedAt?.forEach((item, i) => {
    console.log(`${i + 1}. ${item.title?.slice(0, 50) || 'Untitled'}`);
    console.log(`   created_at:   ${item.created_at}`);
    console.log(`   captured_at:  ${item.captured_at}`);
    console.log(`   published_at: ${item.published_at}\n`);
  });

  // Get last 10 items ordered by created_at DESC
  const { data: lastByCreatedAt } = await supabase
    .from('content_items')
    .select('id, title, created_at, captured_at, published_at')
    .eq('status', 'complete')
    .order('created_at', { ascending: true })
    .limit(10);

  console.log('\n=== Last 10 by created_at DESC (oldest created) ===\n');
  lastByCreatedAt?.forEach((item, i) => {
    console.log(`${i + 1}. ${item.title?.slice(0, 50) || 'Untitled'}`);
    console.log(`   created_at:   ${item.created_at}`);
    console.log(`   captured_at:  ${item.captured_at}`);
    console.log(`   published_at: ${item.published_at}\n`);
  });

  // Check if captured_at would give different order
  const { data: byCapturedAt } = await supabase
    .from('content_items')
    .select('id, title, created_at, captured_at, published_at')
    .eq('status', 'complete')
    .order('captured_at', { ascending: false })
    .limit(10);

  console.log('\n=== First 10 by captured_at DESC ===\n');
  byCapturedAt?.forEach((item, i) => {
    console.log(`${i + 1}. ${item.title?.slice(0, 50) || 'Untitled'}`);
    console.log(`   created_at:   ${item.created_at}`);
    console.log(`   captured_at:  ${item.captured_at}`);
    console.log(`   published_at: ${item.published_at}\n`);
  });
}

checkOrder();
