'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ContentItem } from '@/types/content';

interface ContentCardProps {
  item: ContentItem;
  size?: 'large' | 'medium' | 'small';
  position?: 'left' | 'right' | 'auto';
  onClick?: () => void;
  index?: number;
}

const sourceColors: Record<string, string> = {
  twitter: 'bg-[#1a1a1a]',
  instagram: 'bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#F77737]',
  linkedin: 'bg-[#0A66C2]',
  pinterest: 'bg-[#E60023]',
  youtube: 'bg-[#FF0000]',
  web: 'bg-[var(--accent)]',
};

// Soft, muted topic colors
const topicCardColors = [
  'bg-violet-300/70 text-violet-900',
  'bg-emerald-300/70 text-emerald-900',
  'bg-amber-300/70 text-amber-900',
  'bg-rose-300/70 text-rose-900',
  'bg-cyan-300/70 text-cyan-900',
  'bg-fuchsia-300/70 text-fuchsia-900',
  'bg-lime-300/70 text-lime-900',
  'bg-orange-300/70 text-orange-900',
];

export function getTopicColor(topic: string): string {
  let hash = 0;
  for (let i = 0; i < topic.length; i++) {
    hash = ((hash << 5) - hash) + topic.charCodeAt(i);
    hash |= 0;
  }
  return topicCardColors[Math.abs(hash) % topicCardColors.length];
}

const MIN_IMAGE_SIZE = 400;

function getImageUrl(image: { url?: string; publicUrl?: string; originalUrl?: string } | undefined): string | null {
  if (!image) return null;
  return image.publicUrl || image.originalUrl || image.url || null;
}

function isReliableScreenshot(url: string | undefined): boolean {
  if (!url) return false;
  if (url.startsWith('data:')) return true;
  return url.includes('storage.googleapis.com');
}

// Check if image has a reliable GCS URL (our storage, always works)
function hasGcsUrl(image: { publicUrl?: string } | undefined): boolean {
  return !!image?.publicUrl?.includes('storage.googleapis.com');
}

// Check if image is large enough to display (exclude tiny icons/thumbnails)
function isLargeEnough(image: Record<string, unknown> | undefined): boolean {
  if (!image) return false;
  const width = image.width as number | undefined;
  const height = image.height as number | undefined;
  // If no dimensions, assume it's okay (we don't always have this data)
  if (!width && !height) return true;
  return (width || 0) >= MIN_IMAGE_SIZE || (height || 0) >= MIN_IMAGE_SIZE;
}

function getBestImage(
  images: Array<{ publicUrl?: string; originalUrl?: string; url?: string; width?: number; height?: number }> | null | undefined
): string | null {
  if (!images || images.length === 0) return null;

  // Prefer large GCS images first
  const largeGcsImage = images.find((img) => hasGcsUrl(img) && isLargeEnough(img));
  if (largeGcsImage) return getImageUrl(largeGcsImage);

  // Any GCS image
  const anyGcsImage = images.find((img) => hasGcsUrl(img));
  if (anyGcsImage) return getImageUrl(anyGcsImage);

  // Any large image
  const largeImage = images.find((img) => isLargeEnough(img));
  if (largeImage) return getImageUrl(largeImage);

  // Fallback to first image
  return getImageUrl(images[0]);
}

function getImageCandidates(
  images: Array<{ publicUrl?: string; originalUrl?: string; url?: string; width?: number; height?: number }> | null | undefined
): string[] {
  if (!images || images.length === 0) return [];

  const candidates: string[] = [];
  const addUnique = (imageList: typeof images) => {
    if (!imageList) return;
    imageList.forEach((img) => {
      const url = getImageUrl(img);
      if (url && !candidates.includes(url)) {
        candidates.push(url);
      }
    });
  };

  const largeGcs = images.filter((img) => hasGcsUrl(img) && isLargeEnough(img));
  const anyGcs = images.filter((img) => hasGcsUrl(img));
  const large = images.filter((img) => isLargeEnough(img));

  addUnique(largeGcs);
  addUnique(anyGcs);
  addUnique(large);
  addUnique(images);

  return candidates;
}

export function ContentCard({ item, size = 'medium', position = 'auto', onClick, index = 0 }: ContentCardProps) {
  const hasImage = item.images && item.images.length > 0;
  const hasVideo = item.videos && item.videos.length > 0;
  const imageCount = item.images?.length || 0;
  const hasMultipleImages = imageCount > 1;
  const bestImage = getBestImage(item.images);
  const imageCandidates = getImageCandidates(item.images);
  const fallbackImage = item.source_type === 'twitter' ? '/twitter-fallback.png' : bestImage;

  // For web items, prefer screenshot, then OG image
  // For social items, prefer video thumbnail, then images
  // For Twitter without images, use fallback
  const getWebThumbnail = () => {
    const screenshot = item.platform_data?.screenshot as string | undefined;
    if (hasImage) return bestImage;
    if (isReliableScreenshot(screenshot)) return screenshot;
    return null;
  };

  const getTwitterThumbnail = () => {
    if (hasVideo && item.videos?.[0]?.thumbnail) return item.videos[0].thumbnail;
    if (hasImage) return getImageUrl(item.images?.[0]);
    return '/twitter-fallback.png'; // Watercolor fallback for text-only tweets
  };

  const getYouTubeThumbnail = () => {
    if (hasVideo && item.videos?.[0]?.thumbnail) return item.videos[0].thumbnail;
    if (hasImage) return getBestImage(item.images);
    return null;
  };

  // For social posts: prefer images with GCS URLs (reliable), then video thumbnails, then any image
  // Filter out small images (icons, thumbnails under 400px)
  const getSocialThumbnail = () => {
    // First: check if we have a large image stored in GCS (most reliable)
    const gcsImage = item.images?.find(img => hasGcsUrl(img) && isLargeEnough(img));
    if (gcsImage) return getImageUrl(gcsImage);

    // Second: any large GCS image
    const anyGcsImage = item.images?.find(img => hasGcsUrl(img));
    if (anyGcsImage) return getImageUrl(anyGcsImage);

    // Third: try video thumbnail (may be external CDN - less reliable)
    if (hasVideo && item.videos?.[0]?.thumbnail) return item.videos[0].thumbnail;

    // Fourth: any large image we have
    const largeImage = item.images?.find(img => isLargeEnough(img));
    if (largeImage) return getImageUrl(largeImage);

    // Last resort: any image
    if (hasImage) return getImageUrl(item.images?.[0]);

    return null;
  };

  const thumbnail = item.source_type === 'web'
    ? getWebThumbnail()
    : item.source_type === 'twitter'
      ? getTwitterThumbnail()
      : item.source_type === 'youtube'
        ? getYouTubeThumbnail()
        : getSocialThumbnail();

  const thumbnailCandidates = useMemo(() => {
    const list: string[] = [];
    if (item.source_type === 'web') {
      const screenshot = item.platform_data?.screenshot as string | undefined;
      list.push(...imageCandidates);
      if (isReliableScreenshot(screenshot) && screenshot) list.push(screenshot);
    } else if (item.source_type === 'twitter') {
      if (thumbnail) list.push(thumbnail);
      if (fallbackImage && !list.includes(fallbackImage)) list.push(fallbackImage);
    } else if (item.source_type === 'youtube') {
      if (thumbnail) list.push(thumbnail);
      list.push(...imageCandidates);
    } else {
      if (thumbnail) list.push(thumbnail);
      list.push(...imageCandidates);
    }
    return list;
  }, [item.source_type, item.platform_data, thumbnail, imageCandidates, fallbackImage]);

  const debugEnabled = useMemo(() => {
    if (typeof window === 'undefined') return false;
    if (new URLSearchParams(window.location.search).has('thumbDebug')) return true;
    if (window.location.hash.includes('thumbDebug')) return true;
    try {
      return window.localStorage.getItem('thumbDebug') === '1';
    } catch {
      return false;
    }
  }, []);
  const [debugState, setDebugState] = useState<{ currentSrc?: string; errorCount: number }>({
    currentSrc: thumbnail || undefined,
    errorCount: 0,
  });

  useEffect(() => {
    if (!debugEnabled) return;
    setDebugState((prev) => ({ ...prev, currentSrc: thumbnail || undefined }));
  }, [debugEnabled, thumbnail]);

  // Size classes - uniform cards
  const getSizeClasses = () => {
    return 'col-span-1 row-span-1';
  };

  const aspectClasses = {
    large: 'aspect-[4/3]',
    medium: 'aspect-[4/3]',
    small: 'aspect-[4/3]',
  };

  // Stagger class for animation
  const staggerClass = `stagger-${Math.min(index % 8 + 1, 8)}`;

  return (
    <article
      className={`
        group flex flex-col overflow-hidden cursor-pointer
        transition-all duration-300 ease-out
        hover:-translate-y-1 hover:shadow-xl
        bg-[var(--card-bg)] rounded-xl
        border-4 border-white
        opacity-0 animate-fade-in-up ${staggerClass}
        ${getSizeClasses()}
      `}
      onClick={onClick}
    >
      {/* Image section */}
      <div className={`relative w-full ${aspectClasses[size]} flex-shrink-0 overflow-hidden`}>
        {thumbnail ? (
          <>
            <img
              src={thumbnail}
              alt={item.title || 'Content preview'}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
              onLoad={(event) => {
                if (!debugEnabled) return;
                setDebugState((prev) => ({ ...prev, currentSrc: event.currentTarget.currentSrc }));
              }}
              onError={(event) => {
                const target = event.currentTarget;
                const currentIndex = parseInt(target.dataset.fallbackIndex || '0', 10);
                const nextIndex = currentIndex + 1;
                if (nextIndex < thumbnailCandidates.length) {
                  target.dataset.fallbackIndex = String(nextIndex);
                  target.src = thumbnailCandidates[nextIndex];
                  if (debugEnabled) {
                    setDebugState((prev) => ({
                      currentSrc: thumbnailCandidates[nextIndex],
                      errorCount: prev.errorCount + 1,
                    }));
                  }
                  return;
                }
                if (fallbackImage && !target.dataset.fallbackApplied) {
                  target.dataset.fallbackApplied = 'true';
                  target.src = fallbackImage;
                  if (debugEnabled) {
                    setDebugState((prev) => ({
                      currentSrc: fallbackImage,
                      errorCount: prev.errorCount + 1,
                    }));
                  }
                  return;
                }
                target.style.display = 'none';
                if (debugEnabled) {
                  setDebugState((prev) => ({ ...prev, errorCount: prev.errorCount + 1 }));
                }
              }}
            />
            {debugEnabled && (
              <div className="absolute bottom-2 left-2 right-2 bg-black/70 text-white text-[10px] leading-snug p-2 rounded">
                <div>src: {debugState.currentSrc || 'none'}</div>
                <div>errors: {debugState.errorCount}</div>
                <div>candidates: {thumbnailCandidates.length}</div>
              </div>
            )}
            {/* Subtle gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            
            {/* Gallery indicator */}
            {hasMultipleImages && (
              <div className="absolute bottom-3 right-3 flex gap-1">
                {item.images!.slice(0, 4).map((_, idx) => (
                  <div
                    key={idx}
                    className={`w-1.5 h-1.5 rounded-full ${idx === 0 ? 'bg-white' : 'bg-white/50'}`}
                  />
                ))}
                {imageCount > 4 && (
                  <span className="text-white/70 text-xs font-mono-ui ml-1">+{imageCount - 4}</span>
                )}
              </div>
            )}
          </>
        ) : (
          <div className={`absolute inset-0 ${sourceColors[item.source_type] || 'bg-[var(--accent)]'}`}>
            <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent" />
          </div>
        )}

        {/* Source badge - minimal */}
        <div className="absolute top-3 left-3">
          <span className={`
            w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-medium
            ${sourceColors[item.source_type] || 'bg-[var(--accent)]'}
            shadow-sm
          `}>
            {item.source_type === 'twitter' ? '𝕏' :
             item.source_type === 'instagram' ? 'IG' :
             item.source_type === 'linkedin' ? 'in' :
             item.source_type === 'pinterest' ? 'P' :
             item.source_type === 'youtube' ? '▶' : '◎'}
          </span>
        </div>

        {/* Video indicator */}
        {hasVideo && (
          <div className="absolute top-3 right-3">
            <span className="w-8 h-8 rounded-full bg-white/90 flex items-center justify-center shadow-sm">
              <svg className="w-4 h-4 text-[var(--foreground)]" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
            </span>
          </div>
        )}
      </div>

      {/* Text content */}
      <div className={`flex flex-col p-4 ${size === 'large' ? 'gap-2' : 'gap-1.5'} flex-grow`}>
        {/* Author */}
        {(item.author_name || item.author_handle) && (
          <p className="font-mono-ui text-xs text-[var(--foreground-muted)] truncate">
            {item.author_name}
            {item.author_handle && (
              <span className="opacity-60 ml-1">{item.author_handle}</span>
            )}
          </p>
        )}

        {/* Title */}
        <h3 className={`
          text-[var(--foreground)] font-medium leading-snug line-clamp-2
          ${size === 'large' ? 'text-lg' : 'text-sm'}
        `}>
          {item.title || item.description?.slice(0, 100) || 'Untitled'}
        </h3>

        {/* Summary (large cards only) */}
        {size === 'large' && item.summary && (
          <p className="text-[var(--foreground-muted)] text-sm line-clamp-2">
            {item.summary}
          </p>
        )}

        {/* Topics */}
        {item.topics && item.topics.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-auto pt-2">
            {item.topics.slice(0, size === 'large' ? 4 : 2).map((topic, idx) => {
              const topicName = typeof topic === 'string' ? topic : (topic as { name: string }).name;
              return (
                <span
                  key={`${idx}-${topicName}`}
                  className={`px-2 py-0.5 text-xs font-mono-ui rounded-full ${getTopicColor(topicName)}`}
                >
                  {topicName}
                </span>
              );
            })}
            {item.topics.length > (size === 'large' ? 4 : 2) && (
              <span className="px-2 py-0.5 text-[var(--foreground-muted)] text-xs font-mono-ui">
                +{item.topics.length - (size === 'large' ? 4 : 2)}
              </span>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
