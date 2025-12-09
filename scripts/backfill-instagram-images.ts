import { createClient } from '@supabase/supabase-js';
import { Storage } from '@google-cloud/storage';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../apps/web/.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const storage = new Storage({
  keyFilename: '/Users/danielbatten/Projects/content-capture/.gcs/content-capture-key.json',
});
const bucketName = 'little-plains-media';

// Track stats
let totalItems = 0;
let processedItems = 0;
let skippedItems = 0;
let failedItems = 0;
let imagesDownloaded = 0;
let imagesFailed = 0;

async function downloadAndUpload(
  url: string,
  destination: string
): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': 'https://www.instagram.com/',
      'Sec-Fetch-Dest': 'image',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'cross-site',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  if (buffer.length < 1000) {
    throw new Error(`Downloaded file too small: ${buffer.length} bytes`);
  }

  const bucket = storage.bucket(bucketName);
  const file = bucket.file(destination);

  await file.save(buffer, {
    metadata: {
      contentType: response.headers.get('content-type') || 'image/jpeg',
    },
  });

  return `https://storage.googleapis.com/${bucketName}/${destination}`;
}

async function processItem(item: any): Promise<boolean> {
  const images = item.images || [];

  // Check if already has GCS images
  const hasGcsImages = images.some((img: any) =>
    img.publicUrl?.includes('storage.googleapis.com')
  );

  if (hasGcsImages) {
    console.log(`  Skipping - already has GCS images`);
    skippedItems++;
    return true;
  }

  // Check if has any images to process
  const imagesToProcess = images.filter((img: any) => {
    const url = img.originalUrl || img.url;
    return url && (url.includes('instagram') || url.includes('cdninstagram') || url.includes('fbcdn'));
  });

  if (imagesToProcess.length === 0) {
    console.log(`  Skipping - no Instagram images to process`);
    skippedItems++;
    return true;
  }

  console.log(`  Processing ${imagesToProcess.length} images...`);

  const updatedImages = [];
  let anySuccess = false;

  for (let i = 0; i < images.length; i++) {
    const image = images[i];
    const originalUrl = image.originalUrl || image.url;

    if (!originalUrl) {
      updatedImages.push(image);
      continue;
    }

    // Skip if already has GCS URL
    if (image.publicUrl?.includes('storage.googleapis.com')) {
      updatedImages.push(image);
      continue;
    }

    try {
      const gcsPath = `captures/${item.id}/images/${i}.jpg`;
      const publicUrl = await downloadAndUpload(originalUrl, gcsPath);

      updatedImages.push({
        ...image,
        originalUrl,
        gcsPath,
        publicUrl,
      });

      imagesDownloaded++;
      anySuccess = true;
      console.log(`    Image ${i}: Success`);
    } catch (err) {
      imagesFailed++;
      console.log(`    Image ${i}: Failed - ${err instanceof Error ? err.message : err}`);
      updatedImages.push(image);
    }
  }

  if (anySuccess) {
    // Update database
    const { error: updateError } = await supabase
      .from('content_items')
      .update({ images: updatedImages })
      .eq('id', item.id);

    if (updateError) {
      console.log(`  Database update failed: ${updateError.message}`);
      return false;
    }

    console.log(`  Updated database`);
    processedItems++;
    return true;
  }

  return false;
}

async function backfillInstagramImages() {
  console.log('=== Instagram Image Backfill ===\n');

  // Get all Instagram items
  const { data: items, error } = await supabase
    .from('content_items')
    .select('id, title, images, source_type')
    .eq('source_type', 'instagram')
    .eq('status', 'complete')
    .order('captured_at', { ascending: false });

  if (error || !items) {
    console.error('Failed to fetch items:', error);
    return;
  }

  totalItems = items.length;
  console.log(`Found ${totalItems} Instagram items\n`);

  // Optional: limit for testing
  const limit = process.env.LIMIT ? parseInt(process.env.LIMIT) : items.length;
  const itemsToProcess = items.slice(0, limit);

  if (limit < items.length) {
    console.log(`Processing first ${limit} items (set LIMIT env var to change)\n`);
  }

  for (let i = 0; i < itemsToProcess.length; i++) {
    const item = itemsToProcess[i];
    console.log(`[${i + 1}/${itemsToProcess.length}] ${item.title?.slice(0, 50) || 'Untitled'}`);

    try {
      await processItem(item);
    } catch (err) {
      console.log(`  Error: ${err instanceof Error ? err.message : err}`);
      failedItems++;
    }

    // Small delay to avoid rate limiting
    if (i < itemsToProcess.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }

  console.log('\n=== Summary ===');
  console.log(`Total Instagram items: ${totalItems}`);
  console.log(`Processed: ${processedItems}`);
  console.log(`Skipped (already done): ${skippedItems}`);
  console.log(`Failed: ${failedItems}`);
  console.log(`Images downloaded: ${imagesDownloaded}`);
  console.log(`Images failed: ${imagesFailed}`);
}

backfillInstagramImages();
