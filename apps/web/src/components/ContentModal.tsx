'use client';

import { useEffect, useMemo, useState, useRef } from 'react';
import type { ContentItem } from '@/types/content';

const RAW_CONTENT_CHAR_LIMIT = 300;

interface ContentModalProps {
  item: ContentItem | null;
  onClose: () => void;
}

const sourceColors: Record<string, string> = {
  twitter: 'bg-[#1a1a1a]',
  instagram: 'bg-gradient-to-br from-[#833AB4] via-[#E1306C] to-[#F77737]',
  linkedin: 'bg-[#0A66C2]',
  pinterest: 'bg-[#E60023]',
  web: 'bg-[var(--accent)]',
};

// Vibrant topic colors
const topicColors = [
  { bg: 'bg-violet-500', text: 'text-white' },
  { bg: 'bg-emerald-500', text: 'text-white' },
  { bg: 'bg-amber-500', text: 'text-white' },
  { bg: 'bg-rose-500', text: 'text-white' },
  { bg: 'bg-cyan-500', text: 'text-white' },
  { bg: 'bg-fuchsia-500', text: 'text-white' },
  { bg: 'bg-lime-500', text: 'text-white' },
  { bg: 'bg-orange-500', text: 'text-white' },
];

const useCaseColors = [
  { bg: 'bg-blue-500', text: 'text-white' },
  { bg: 'bg-indigo-500', text: 'text-white' },
  { bg: 'bg-sky-500', text: 'text-white' },
  { bg: 'bg-teal-500', text: 'text-white' },
];

function getTagColor(tag: string, colors: typeof topicColors): typeof topicColors[0] {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) - hash) + tag.charCodeAt(i);
    hash |= 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

function extractUrls(text: string): string[] {
  const urlRegex = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;
  const matches = text.match(urlRegex) || [];
  return [...new Set(matches.map(url => url.replace(/[.,;:!?)]+$/, '')))];
}

function getDomain(url: string): string {
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    return domain;
  } catch {
    return url;
  }
}

function getFaviconUrl(url: string): string {
  try {
    const domain = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
  } catch {
    return '';
  }
}

// Visual share card component - like iMessage/social media previews
function LinkShareCard({
  url,
  title,
  description,
  screenshot,
  size = 'default'
}: {
  url: string;
  title?: string | null;
  description?: string | null;
  screenshot?: string | null;
  size?: 'default' | 'compact';
}) {
  const domain = getDomain(url);
  const faviconUrl = getFaviconUrl(url);
  const isCompact = size === 'compact';
  const hasImage = !!screenshot;

  if (isCompact) {
    // Compact version for link lists
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center gap-3 p-3 rounded-xl bg-[var(--card-bg)] hover:bg-[var(--card-hover)] border border-[var(--panel-border)] hover:border-[var(--accent)]/50 transition-all duration-200"
      >
        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent)]/5 flex items-center justify-center flex-shrink-0">
          {faviconUrl && (
            <img
              src={faviconUrl}
              alt={domain}
              className="w-5 h-5 object-contain"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-[var(--foreground)] truncate group-hover:text-[var(--accent-dark)] transition-colors">
            {domain}
          </p>
          <p className="text-xs text-[var(--foreground-muted)] truncate">{url}</p>
        </div>
        <svg className="w-4 h-4 text-[var(--foreground-muted)] group-hover:text-[var(--accent-dark)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>
    );
  }

  // Full visual share card - like iMessage/social previews
  // If no screenshot/image, use compact layout instead of showing placeholder
  if (!hasImage) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center gap-4 p-4 rounded-2xl bg-[var(--card-bg)] border border-[var(--panel-border)] hover:border-[var(--accent)]/50 hover:shadow-lg transition-all duration-200"
      >
        <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent)]/5 flex items-center justify-center flex-shrink-0">
          {faviconUrl ? (
            <img
              src={faviconUrl}
              alt={domain}
              className="w-8 h-8 object-contain"
              onError={(e) => { e.currentTarget.style.display = 'none'; }}
            />
          ) : (
            <svg className="w-8 h-8 text-[var(--foreground-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <span className="text-xs font-medium text-[var(--foreground-muted)] uppercase tracking-wider">
            {domain}
          </span>
          {title && (
            <h4 className="font-semibold text-[var(--foreground)] group-hover:text-[var(--accent-dark)] transition-colors line-clamp-2 mt-1">
              {title}
            </h4>
          )}
          {description && (
            <p className="text-sm text-[var(--foreground-muted)] line-clamp-2 mt-1">{description}</p>
          )}
        </div>
        <svg className="w-5 h-5 text-[var(--foreground-muted)] group-hover:text-[var(--accent-dark)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </a>
    );
  }

  // Full card with image
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group block overflow-hidden rounded-2xl border border-[var(--panel-border)] hover:border-[var(--accent)]/50 hover:shadow-xl transition-all duration-300"
    >
      {/* Screenshot/image header */}
      <div className="relative aspect-[16/9] bg-[var(--card-bg)] overflow-hidden">
        <img
          src={screenshot}
          alt={`Screenshot of ${domain}`}
          className="w-full h-full object-cover object-top group-hover:scale-[1.02] transition-transform duration-500"
        />
        {/* Gradient overlay at bottom for text readability */}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent" />
      </div>

      {/* Content area */}
      <div className="p-4 bg-[var(--card-bg)]">
        <div className="flex items-center gap-2 mb-2">
          {faviconUrl && (
            <img
              src={faviconUrl}
              alt=""
              className="w-4 h-4 object-contain"
            />
          )}
          <span className="text-xs font-medium text-[var(--foreground-muted)] uppercase tracking-wider">
            {domain}
          </span>
          <svg className="w-3.5 h-3.5 text-[var(--foreground-muted)] group-hover:text-[var(--accent-dark)] transition-colors ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </div>
        {title && (
          <h4 className="font-semibold text-[var(--foreground)] group-hover:text-[var(--accent-dark)] transition-colors line-clamp-2 mb-1">
            {title}
          </h4>
        )}
        {description && (
          <p className="text-sm text-[var(--foreground-muted)] line-clamp-2">{description}</p>
        )}
      </div>
    </a>
  );
}

const MIN_IMAGE_SIZE = 400;

function getImageUrl(image: { url?: string; publicUrl?: string; originalUrl?: string } | undefined): string | null {
  if (!image) return null;
  return image.publicUrl || image.originalUrl || image.url || null;
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

function TextWithLinks({ text }: { text: string }) {
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/gi;
  const parts = text.split(urlRegex);

  return (
    <>
      {parts.map((part, index) => {
        if (part.match(urlRegex)) {
          const cleanUrl = part.replace(/[.,;:!?)]+$/, '');
          const trailing = part.slice(cleanUrl.length);
          return (
            <span key={index}>
              <a
                href={cleanUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[var(--accent-dark)] hover:underline break-all"
              >
                {cleanUrl}
              </a>
              {trailing}
            </span>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}

// Video player with play button overlay
function VideoWithPlayButton({ src, poster, className = '' }: { src: string; poster?: string; className?: string }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handlePlay = () => {
    setIsPlaying(true);
    // Small delay to ensure video element is rendered
    setTimeout(() => {
      videoRef.current?.play();
    }, 100);
  };

  if (!isPlaying && poster) {
    return (
      <div className={`relative cursor-pointer group ${className}`} onClick={handlePlay}>
        <img
          src={poster}
          alt="Video thumbnail"
          className="w-full h-auto"
        />
        {/* Play button overlay */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-20 h-20 rounded-full bg-black/60 group-hover:bg-black/80 flex items-center justify-center transition-colors">
            <svg className="w-10 h-10 text-white ml-1" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  return (
    <video
      ref={videoRef}
      src={src}
      poster={poster}
      controls
      autoPlay={isPlaying}
      className={`w-full h-auto ${className}`}
    />
  );
}

// Horizontal swipeable gallery for mobile
function MobileGallery({ media }: { media: Array<{ type: 'video' | 'image'; url: string; thumbnail?: string }> }) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);

  const handleScroll = () => {
    if (scrollRef.current) {
      const scrollLeft = scrollRef.current.scrollLeft;
      const itemWidth = scrollRef.current.offsetWidth;
      const newIndex = Math.round(scrollLeft / itemWidth);
      setCurrentIndex(newIndex);
    }
  };

  if (media.length === 0) return null;

  return (
    <div className="w-full flex-shrink-0">
      {/* Scrollable gallery */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {media.map((item, index) => (
          <div
            key={index}
            className="w-full flex-shrink-0 snap-center"
          >
            {item.type === 'video' ? (
              <VideoWithPlayButton
                src={item.url}
                poster={item.thumbnail}
                className="max-h-[40vh] object-contain bg-black"
              />
            ) : (
              <img
                src={item.url}
                alt={`Image ${index + 1}`}
                className="w-full h-auto max-h-[40vh] object-contain bg-black"
              />
            )}
          </div>
        ))}
      </div>

      {/* Dot indicators */}
      {media.length > 1 && (
        <div className="flex justify-center gap-1.5 py-3 bg-[#E8DED0]">
          {media.map((_, index) => (
            <button
              key={index}
              onClick={() => {
                scrollRef.current?.scrollTo({
                  left: index * (scrollRef.current?.offsetWidth || 0),
                  behavior: 'smooth'
                });
              }}
              className={`w-2 h-2 rounded-full transition-all ${
                index === currentIndex
                  ? 'bg-[var(--foreground)] w-4'
                  : 'bg-[var(--foreground)]/30'
              }`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ContentModal({ item, onClose }: ContentModalProps) {
  const [isRawContentExpanded, setIsRawContentExpanded] = useState(false);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  useEffect(() => {
    if (item) {
      document.body.style.overflow = 'hidden';
      setIsRawContentExpanded(false); // Reset when item changes
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [item]);

  const extractedLinks = useMemo(() => {
    if (!item?.body_text) return [];
    return extractUrls(item.body_text);
  }, [item?.body_text]);

  // Check if content needs truncation
  const rawContentNeedsTruncation = useMemo(() => {
    return item?.body_text && item.body_text.length > RAW_CONTENT_CHAR_LIMIT;
  }, [item?.body_text]);

  const truncatedRawContent = useMemo(() => {
    if (!item?.body_text) return '';
    if (!rawContentNeedsTruncation || isRawContentExpanded) return item.body_text;
    return item.body_text.slice(0, RAW_CONTENT_CHAR_LIMIT) + '...';
  }, [item?.body_text, rawContentNeedsTruncation, isRawContentExpanded]);

  // Get first large GCS-hosted image to use as fallback poster for videos
  const fallbackPoster = useMemo(() => {
    if (!item?.images) return null;
    // Prefer large GCS images
    const largeGcsImage = item.images.find(img =>
      img.publicUrl?.includes('storage.googleapis.com') && isLargeEnough(img)
    );
    if (largeGcsImage) return getImageUrl(largeGcsImage);
    // Fall back to any GCS image
    const gcsImage = item.images.find(img => img.publicUrl?.includes('storage.googleapis.com'));
    if (gcsImage) return getImageUrl(gcsImage);
    // Fall back to any large image
    const largeImage = item.images.find(img => isLargeEnough(img));
    return largeImage ? getImageUrl(largeImage) : getImageUrl(item.images[0]);
  }, [item?.images]);

  // Collect all media (images first for reliable thumbnails, then videos)
  // Filter out small images (under 400px)
  const allMedia = useMemo(() => {
    if (!item) return [];
    const media: Array<{ type: 'video' | 'image'; url: string; thumbnail?: string }> = [];

    // Images first - prefer GCS URLs as they're most reliable
    // Filter out small images (icons, thumbnails)
    if (item.images && item.images.length > 0) {
      // Filter to large images only, then sort to put GCS-hosted images first
      const largeImages = item.images.filter(img => isLargeEnough(img));
      const sortedImages = [...largeImages].sort((a, b) => {
        const aHasGcs = a.publicUrl?.includes('storage.googleapis.com') ? 1 : 0;
        const bHasGcs = b.publicUrl?.includes('storage.googleapis.com') ? 1 : 0;
        return bHasGcs - aHasGcs;
      });

      sortedImages.forEach(image => {
        const url = getImageUrl(image);
        if (url) {
          media.push({ type: 'image', url });
        }
      });
    }

    // Videos after images - use fallbackPoster if thumbnail is external CDN
    if (item.videos && item.videos.length > 0) {
      item.videos.forEach(video => {
        const url = video.originalUrl || video.url;
        if (url) {
          // Use GCS-hosted image as poster if video thumbnail is from external CDN
          const poster = video.thumbnail?.includes('storage.googleapis.com')
            ? video.thumbnail
            : fallbackPoster || video.thumbnail;
          media.push({ type: 'video', url, thumbnail: poster || undefined });
        }
      });
    }

    return media;
  }, [item, fallbackPoster]);

  if (!item) return null;

  const hasMedia = allMedia.length > 0;
  const isSocialWithoutMedia = ['twitter', 'instagram', 'youtube'].includes(item.source_type) && !hasMedia;
  
  // Extract tweet ID from URL for embedding
  const getTweetId = (url: string): string | null => {
    const match = url.match(/status\/(\d+)/);
    return match ? match[1] : null;
  };
  
  // Extract Instagram post ID/URL for embedding
  const getInstagramEmbedUrl = (url: string): string | null => {
    // Instagram URLs: instagram.com/p/{id}/ or instagram.com/reel/{id}/
    const match = url.match(/instagram\.com\/(p|reel)\/([^/?]+)/);
    if (match) {
      return `https://www.instagram.com/${match[1]}/${match[2]}/embed/`;
    }
    return null;
  };

  const getYouTubeEmbedUrl = (url: string): string | null => {
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes('youtu.be')) {
        const id = parsed.pathname.replace('/', '');
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      if (parsed.pathname.startsWith('/shorts/')) {
        const id = parsed.pathname.split('/')[2];
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      const id = parsed.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    } catch {
      return null;
    }
  };
  
  const tweetId = item.source_type === 'twitter' ? getTweetId(item.source_url) : null;
  const instagramEmbedUrl = item.source_type === 'instagram' ? getInstagramEmbedUrl(item.source_url) : null;
  const youTubeEmbedUrl = item.source_type === 'youtube' ? getYouTubeEmbedUrl(item.source_url) : null;
  
  const hasEmbed = tweetId || instagramEmbedUrl || youTubeEmbedUrl;

  return (
    <div className="fixed inset-0 z-40">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-[#1a1a1a]/40"
        onClick={onClose}
      />

      {/* Modal container - fullscreen on mobile/tablet, padded on desktop (lg+) */}
      <div className="relative w-full h-full pt-0 lg:pt-[73px] px-0 lg:px-12 pb-0 lg:pb-12">
        {/* Modal card */}
        <div className="w-full h-full flex flex-col bg-[var(--panel-bg)] overflow-hidden lg:rounded-2xl">
          {/* Full-width header */}
          <div className="flex items-center justify-between px-4 sm:px-6 lg:px-8 py-4 border-b border-[var(--panel-border)]">
            <div className="flex items-center gap-3">
              <span className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-medium ${sourceColors[item.source_type] || 'bg-[var(--accent)]'}`}>
            {item.source_type === 'twitter' ? '𝕏' :
             item.source_type === 'instagram' ? 'IG' :
             item.source_type === 'linkedin' ? 'in' :
             item.source_type === 'pinterest' ? 'P' :
             item.source_type === 'youtube' ? '▶' : '◎'}
              </span>
              {(item.author_name || item.author_handle) && (
                <div>
                  <p className="font-medium text-[var(--foreground)]">
                    {item.author_name}
                  </p>
                  {item.author_handle && (
                    <p className="font-mono-ui text-xs text-[var(--foreground-muted)]">{item.author_handle}</p>
                  )}
                </div>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-10 h-10 rounded-full bg-[var(--card-bg)] hover:bg-[var(--card-hover)] border border-[var(--panel-border)] flex items-center justify-center transition-colors"
            >
              <svg className="w-5 h-5 text-[var(--foreground)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content area - stacked on mobile, side-by-side on desktop */}
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            {/* Mobile horizontal gallery - shown on mobile/tablet only */}
            {hasMedia && (
              <div className="lg:hidden">
                <MobileGallery media={allMedia} />
              </div>
            )}

            {/* Text content */}
            <div className={`flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 ${hasMedia || isSocialWithoutMedia ? 'lg:w-2/5' : 'w-full'}`}>
              {/* Title */}
              <h2 className="text-xl sm:text-2xl lg:text-3xl font-medium text-[var(--foreground)] mb-2 leading-tight">
                {item.title || 'Untitled'}
              </h2>

              {/* Attribution */}
              {item.slack_user_name && (
                <p className="text-sm text-[var(--foreground-muted)] mb-4 sm:mb-6">
                  Saved by {item.slack_user_name}
                </p>
              )}
              {!item.slack_user_name && <div className="mb-2 sm:mb-4" />}

              {/* Summary - Primary content */}
              {item.summary && (
                <div className="mb-6 sm:mb-8">
                  <h3 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">Summary</h3>
                  <p className="text-[var(--foreground)] leading-relaxed text-base sm:text-lg">{item.summary}</p>
                </div>
              )}

              {/* Source Link - Prominent visual card for web content */}
              {item.source_type === 'web' && item.source_url && (
                <div className="mb-6 sm:mb-8">
                  <LinkShareCard 
                    url={item.source_url} 
                    title={item.title}
                    description={item.description}
                    screenshot={
                      // Use screenshot only if it's reliable; otherwise fall back to best available image
                      ((item.platform_data?.screenshot as string | undefined)?.startsWith('data:') ||
                      (item.platform_data?.screenshot as string | undefined)?.includes('storage.googleapis.com'))
                        ? (item.platform_data?.screenshot as string | undefined)
                        : fallbackPoster || (item.images?.[0]?.publicUrl || item.images?.[0]?.originalUrl || item.images?.[0]?.url)
                    }
                  />
                </div>
              )}

              {/* Raw content - Only for social posts without embeds */}
              {item.body_text && item.source_type !== 'web' && !hasEmbed && (
                <div className="mb-6 sm:mb-8">
                  <button
                    onClick={() => setIsRawContentExpanded(!isRawContentExpanded)}
                    className="flex items-center gap-2 font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors mb-2 sm:mb-3"
                  >
                    <svg 
                      className={`w-3 h-3 transition-transform ${isRawContentExpanded ? 'rotate-90' : ''}`} 
                      fill="none" 
                      viewBox="0 0 24 24" 
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    Original Post
                    {rawContentNeedsTruncation && !isRawContentExpanded && (
                      <span className="opacity-60">({item.body_text.length} chars)</span>
                    )}
                  </button>
                  <div className={`overflow-hidden transition-all duration-200 ${isRawContentExpanded ? 'max-h-none' : 'max-h-24'}`}>
                    <p className="text-[var(--foreground-muted)] whitespace-pre-wrap leading-relaxed text-sm">
                      <TextWithLinks text={truncatedRawContent} />
                    </p>
                  </div>
                  {rawContentNeedsTruncation && (
                    <button
                      onClick={() => setIsRawContentExpanded(!isRawContentExpanded)}
                      className="mt-2 font-mono-ui text-xs text-[var(--accent-dark)] hover:text-[var(--foreground)] transition-colors"
                    >
                      {isRawContentExpanded ? '[ collapse ]' : '[ show more ]'}
                    </button>
                  )}
                </div>
              )}

              {/* Extracted links - as share cards */}
              {extractedLinks.length > 0 && (
                <div className="mb-6 sm:mb-8">
                  <h3 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">
                    Links Mentioned ({extractedLinks.length})
                  </h3>
                  <div className="space-y-3">
                    {extractedLinks.map((url, index) => (
                      <LinkShareCard 
                        key={index}
                        url={url}
                        size="compact"
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Topics */}
              {item.topics && item.topics.length > 0 && (
                <div className="mb-6 sm:mb-8">
                  <h3 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-2 sm:mb-3">Topics</h3>
                  <div className="flex flex-wrap gap-2">
                    {item.topics.map((topic) => {
                      const color = getTagColor(topic, topicColors);
                      return (
                        <span
                          key={topic}
                          className={`px-3 py-1.5 rounded-full ${color.bg} ${color.text} font-mono-ui text-xs`}
                        >
                          {topic}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Use cases */}
              {item.use_cases && item.use_cases.length > 0 && (
                <div className="mb-6 sm:mb-8">
                  <h3 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-2 sm:mb-3">Use Cases</h3>
                  <div className="flex flex-wrap gap-2">
                    {item.use_cases.map((useCase) => {
                      const color = getTagColor(useCase, useCaseColors);
                      return (
                        <span
                          key={useCase}
                          className={`px-3 py-1.5 rounded-full ${color.bg} ${color.text} font-mono-ui text-xs`}
                        >
                          {useCase}
                        </span>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Original Post - Embeds for Twitter/Instagram/LinkedIn, Link card for others */}
              {item.source_type === 'twitter' && tweetId && (
                <div className="mb-6 sm:mb-8">
                  <h3 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">Original Post</h3>
                  <div className="rounded-xl overflow-hidden bg-white">
                    <iframe
                      src={`https://platform.twitter.com/embed/Tweet.html?id=${tweetId}&theme=light`}
                      className="w-full min-h-[300px] border-0"
                      allowFullScreen
                    />
                  </div>
                </div>
              )}
              {item.source_type === 'instagram' && instagramEmbedUrl && (
                <div className="mb-6 sm:mb-8">
                  <h3 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">Original Post</h3>
                  <div className="rounded-xl overflow-hidden bg-white">
                    <iframe
                      src={instagramEmbedUrl}
                      className="w-full min-h-[500px] border-0"
                      allowFullScreen
                    />
                  </div>
                </div>
              )}
              {item.source_type === 'youtube' && youTubeEmbedUrl && (
                <div className="mb-6 sm:mb-8">
                  <h3 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">Original Video</h3>
                  <div className="rounded-xl overflow-hidden bg-white">
                    <iframe
                      src={youTubeEmbedUrl}
                      className="w-full min-h-[360px] border-0"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                </div>
              )}
              {item.source_type !== 'web' && !hasEmbed && (
                <div className="mb-6 sm:mb-8">
                  <h3 className="font-mono-ui text-xs uppercase tracking-widest text-[var(--foreground-muted)] mb-3">Original Post</h3>
                  <LinkShareCard 
                    url={item.source_url}
                    title={`View on ${item.source_type.charAt(0).toUpperCase() + item.source_type.slice(1)}`}
                    size="compact"
                  />
                </div>
              )}

              {/* Metadata */}
              <div className="pt-4 sm:pt-6 border-t border-[var(--panel-border)]">
                <div className="grid grid-cols-2 gap-4 font-mono-ui text-xs text-[var(--foreground-muted)]">
                  {item.published_at && (
                    <div>
                      <span className="uppercase tracking-widest opacity-60">Published</span>
                      <p className="mt-1 text-[var(--foreground)]">{new Date(item.published_at).toLocaleDateString()}</p>
                    </div>
                  )}
                  {item.captured_at && (
                    <div>
                      <span className="uppercase tracking-widest opacity-60">Captured</span>
                      <p className="mt-1 text-[var(--foreground)]">{new Date(item.captured_at).toLocaleDateString()}</p>
                    </div>
                  )}
                  {item.content_type && (
                    <div>
                      <span className="uppercase tracking-widest opacity-60">Type</span>
                      <p className="mt-1 text-[var(--foreground)]">{item.content_type}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Desktop vertical gallery - shown on lg+ only */}
            {hasMedia && (
              <div className="hidden lg:flex lg:w-3/5 flex-col overflow-hidden border-l border-[var(--panel-border)]">
                <div className="flex-1 overflow-y-auto p-6 lg:p-8 space-y-4">
                  {allMedia.map((media, index) => (
                    <div key={index} className="w-full overflow-hidden rounded-2xl">
                      {media.type === 'video' ? (
                        <VideoWithPlayButton
                          src={media.url}
                          poster={media.thumbnail}
                        />
                      ) : (
                        <img
                          src={media.url}
                          alt={`Image ${index + 1}`}
                          className="w-full h-auto"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Embedded post for social posts without media */}
            {isSocialWithoutMedia && hasEmbed && (
              <div className="hidden lg:flex lg:w-3/5 flex-col overflow-hidden border-l border-[var(--panel-border)] bg-[var(--card-bg)]">
                <div className="flex-1 overflow-y-auto p-6 lg:p-8 flex items-center justify-center">
                  <div className="w-full max-w-lg">
                    {tweetId && (
                      <iframe
                        src={`https://platform.twitter.com/embed/Tweet.html?id=${tweetId}&theme=light`}
                        className="w-full min-h-[400px] border-0 rounded-xl bg-white"
                        allowFullScreen
                      />
                    )}
                    {instagramEmbedUrl && (
                      <iframe
                        src={instagramEmbedUrl}
                        className="w-full min-h-[600px] border-0 rounded-xl bg-white"
                        allowFullScreen
                      />
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
