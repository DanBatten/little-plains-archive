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

async function downloadAndUpload(
  url: string,
  destination: string
): Promise<string> {
  console.log(`  Downloading: ${url.slice(0, 80)}...`);

  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Referer': url.includes('instagram') ? 'https://www.instagram.com/' :
                 url.includes('twitter') || url.includes('twimg') ? 'https://twitter.com/' :
                 url.includes('pbs.twimg') ? 'https://x.com/' : '',
      'Sec-Fetch-Dest': 'image',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'cross-site',
    },
  });

  console.log(`  Response status: ${response.status}`);

  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  console.log(`  Downloaded ${buffer.length} bytes`);

  const bucket = storage.bucket(bucketName);
  const file = bucket.file(destination);

  await file.save(buffer, {
    metadata: {
      contentType: response.headers.get('content-type') || 'image/jpeg',
    },
  });

  // Bucket has uniform access with public read - no need for makePublic()
  const publicUrl = `https://storage.googleapis.com/${bucketName}/${destination}`;
  console.log(`  Uploaded to: ${publicUrl}`);

  return publicUrl;
}

async function retryInstagramImages() {
  // Get the most recent Instagram item
  const { data: items, error } = await supabase
    .from('content_items')
    .select('id, title, images, source_type')
    .eq('source_type', 'instagram')
    .eq('status', 'complete')
    .order('captured_at', { ascending: false })
    .limit(1);

  if (error || !items?.length) {
    console.error('No Instagram items found:', error);
    return;
  }

  const item = items[0];
  console.log(`\nRetrying images for: ${item.title?.slice(0, 50)}`);
  console.log(`ID: ${item.id}`);
  console.log(`Current images: ${item.images?.length || 0}`);

  const images = item.images || [];
  const updatedImages = [];

  for (let i = 0; i < images.length; i++) {
    const image = images[i] as { originalUrl?: string; publicUrl?: string; gcsPath?: string };
    const originalUrl = image.originalUrl || (image as any).url;

    if (!originalUrl) {
      console.log(`\nImage ${i}: No URL found, skipping`);
      updatedImages.push(image);
      continue;
    }

    // Skip if already has a working GCS URL
    if (image.publicUrl?.includes('storage.googleapis.com')) {
      console.log(`\nImage ${i}: Already has GCS URL, skipping`);
      updatedImages.push(image);
      continue;
    }

    console.log(`\nImage ${i}: Attempting download...`);

    try {
      const gcsPath = `captures/${item.id}/images/${i}.jpg`;
      const publicUrl = await downloadAndUpload(originalUrl, gcsPath);

      updatedImages.push({
        ...image,
        originalUrl,
        gcsPath,
        publicUrl,
      });

      console.log(`  Success!`);
    } catch (err) {
      console.error(`  Failed:`, err instanceof Error ? err.message : err);
      updatedImages.push(image); // Keep original
    }
  }

  // Update database
  const { error: updateError } = await supabase
    .from('content_items')
    .update({ images: updatedImages })
    .eq('id', item.id);

  if (updateError) {
    console.error('\nFailed to update database:', updateError);
  } else {
    console.log('\nDatabase updated successfully!');
    console.log('Updated images:', JSON.stringify(updatedImages, null, 2));
  }
}

retryInstagramImages();
