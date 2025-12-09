'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Image from 'next/image';
import { ContentGrid } from '@/components/ContentGrid';
import { Sidebar } from '@/components/Sidebar';
import { ContentModal } from '@/components/ContentModal';
import { getTopicColor } from '@/components/ContentCard';
import type { ContentItem, FiltersData, ItemsResponse } from '@/types/content';

interface SearchIntent {
  keywords: string[];
  topics: string[];
  useCases: string[];
  sourceTypes: string[];
  contentTypes: string[];
  searchStrategy: 'broad' | 'focused' | 'exact';
}

interface SearchResponse extends ItemsResponse {
  intent?: SearchIntent;
}

const ITEMS_PER_PAGE = 24;

export default function ArchivePage() {
  // State
  const [items, setItems] = useState<ContentItem[]>([]);
  const [filters, setFilters] = useState<FiltersData | null>(null);
  const [selectedItem, setSelectedItem] = useState<ContentItem | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [searchIntent, setSearchIntent] = useState<SearchIntent | null>(null);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSourceType, setSelectedSourceType] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);

  // Infinite scroll
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [total, setTotal] = useState(0);
  const [latestItemDate, setLatestItemDate] = useState<Date | null>(null);
  const [oldestItemDate, setOldestItemDate] = useState<Date | null>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Debounced search value
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Check if any filters are active
  const hasActiveFilters = selectedSourceType !== null || selectedTopic !== null;

  // Fetch filters
  useEffect(() => {
    async function fetchFilters() {
      try {
        const res = await fetch('/api/filters');
        const data = await res.json();
        setFilters(data);
      } catch (error) {
        console.error('Failed to fetch filters:', error);
      }
    }
    fetchFilters();
  }, []);

  // Debounce search query
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 500); // Slightly longer debounce for AI search
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Fetch items - uses agentic search when there's a search query
  const fetchItems = useCallback(async (pageNum: number, append: boolean = false) => {
    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
      setSearchIntent(null);
    }

    try {
      // If we have a search query, use the agentic search endpoint
      if (debouncedSearch.trim()) {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: debouncedSearch,
            page: pageNum,
            limit: ITEMS_PER_PAGE,
          }),
        });

        const data: SearchResponse = await res.json();

        if (append) {
          setItems(prev => [...prev, ...data.items]);
        } else {
          setItems(data.items);
        }
        setTotal(data.total);
        setHasMore(data.items.length === ITEMS_PER_PAGE && items.length + data.items.length < data.total);
        if (data.intent) {
          setSearchIntent(data.intent);
        }
      } else {
        // No search query - use regular items endpoint with filters
        const params = new URLSearchParams({
          page: pageNum.toString(),
          limit: ITEMS_PER_PAGE.toString(),
        });

        if (selectedSourceType) params.set('source_type', selectedSourceType);
        if (selectedTopic) params.set('topic', selectedTopic);

        const res = await fetch(`/api/items?${params}`);
        const data: ItemsResponse = await res.json();

        if (append) {
          setItems(prev => [...prev, ...data.items]);
        } else {
          setItems(data.items);
        }
        setTotal(data.total);
        setHasMore(data.items.length === ITEMS_PER_PAGE);
        
        // Set latest and oldest item dates (items are sorted newest first)
        if (pageNum === 1 && data.items.length > 0 && !selectedSourceType && !selectedTopic) {
          setLatestItemDate(new Date(data.items[0].created_at));
        }
        // Track oldest date as we load more
        if (data.items.length > 0) {
          setOldestItemDate(new Date(data.items[data.items.length - 1].created_at));
        }
      }
    } catch (error) {
      console.error('Failed to fetch items:', error);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
    }
  }, [debouncedSearch, selectedSourceType, selectedTopic, items.length]);

  // Initial fetch
  useEffect(() => {
    fetchItems(1, false);
  }, [selectedSourceType, selectedTopic, debouncedSearch]);

  // Load more function
  const loadMore = useCallback(() => {
    if (!isLoadingMore && hasMore) {
      const nextPage = page + 1;
      setPage(nextPage);
      fetchItems(nextPage, true);
    }
  }, [isLoadingMore, hasMore, page, fetchItems]);

  // Intersection observer for infinite scroll
  // threshold: 0.1 triggers when 10% of element is visible (reliable)
  // rootMargin: '0px' means no preloading - triggers only when element enters viewport
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoading && !isLoadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: '0px' }
    );

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isLoading, isLoadingMore, loadMore]);

  // Reset when filters change
  useEffect(() => {
    setPage(1);
    setItems([]);
    setHasMore(true);
  }, [selectedSourceType, selectedTopic, debouncedSearch]);

  // Format date range for display
  const formatDateRange = () => {
    if (!latestItemDate || !oldestItemDate) return null;
    const formatDate = (date: Date) => date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    const latest = formatDate(latestItemDate);
    const oldest = formatDate(oldestItemDate);
    if (latest === oldest) return latest;
    return `${oldest} — ${latest}`;
  };

  return (
    <div className="min-h-screen bg-[var(--background)] pb-20">
      {/* Slide-in Sidebar */}
      <Sidebar
        filters={filters}
        selectedSourceType={selectedSourceType}
        selectedTopic={selectedTopic}
        onSourceTypeChange={setSelectedSourceType}
        onTopicChange={setSelectedTopic}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Top Bar - Logo and Search */}
      <div className="fixed top-[40px] z-40 flex items-center gap-4 px-4 sm:px-6 lg:px-8 left-0 right-0">
        {/* Logo - matches search bar: py-1.5 (12px) + h-9 icon (36px) + border (4px) = 52px */}
        <div className="flex-shrink-0 px-5 bg-white/30 backdrop-blur-xl border-2 border-white/50 rounded-full shadow-lg flex items-center justify-center h-[52px]">
          <Image
            src="/Logo.png"
            alt="Little Plains Archive"
            width={126}
            height={22}
            className="h-[22px] w-auto"
          />
        </div>

        {/* Search Bar */}
        <div className={`
          flex items-center gap-3 pl-1.5 pr-4 py-1.5
          bg-white/30 backdrop-blur-xl
          border-2 border-white/50
          rounded-full shadow-lg
          transition-all duration-300
          w-full max-w-md
          ${isSearchFocused ? 'shadow-xl bg-white/50' : ''}
        `}>
          {/* LP Icon */}
          <div className="flex-shrink-0 w-9 h-9 rounded-full bg-white flex items-center justify-center">
            <Image
              src="/LP-icon.png"
              alt="Little Plains"
              width={24}
              height={24}
            />
          </div>

          {/* Search input */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={() => setIsSearchFocused(true)}
            onBlur={() => setIsSearchFocused(false)}
            placeholder="Type here to find what you're looking for..."
            className="flex-1 bg-transparent text-[var(--foreground)] placeholder-[var(--foreground-muted)] text-sm outline-none"
          />

          {/* Clear button */}
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="flex items-center justify-center w-6 h-6 rounded-full bg-[var(--background)] text-[var(--foreground-muted)] hover:text-[var(--foreground)] transition-colors"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Main content */}
      <main className="w-full pt-[152px] px-4 sm:px-6 lg:px-8">
        {/* Search results info with AI intent */}
        {!isLoading && debouncedSearch && (
          <div className="mb-6 text-center">
            <p className="font-mono-ui text-sm text-[var(--foreground-muted)]">
              {total} {total === 1 ? 'result' : 'results'} for "{debouncedSearch}"
            </p>
            {searchIntent && (searchIntent.topics.length > 0 || searchIntent.keywords.length > 0) && (
              <div className="flex flex-wrap items-center justify-center gap-2 mt-2">
                {searchIntent.keywords.map((keyword, i) => (
                  <span
                    key={`kw-${i}-${keyword}`}
                    className="px-2 py-0.5 bg-[var(--card-bg)] text-[var(--foreground-muted)] font-mono-ui text-xs rounded"
                  >
                    {keyword}
                  </span>
                ))}
                {searchIntent.topics.map((topic, i) => (
                  <span
                    key={`st-${i}-${topic}`}
                    className="px-2 py-0.5 bg-violet-500 text-white font-mono-ui text-xs rounded"
                  >
                    {topic}
                  </span>
                ))}
                {searchIntent.useCases.map((useCase, i) => (
                  <span
                    key={`uc-${i}-${useCase}`}
                    className="px-2 py-0.5 bg-blue-500 text-white font-mono-ui text-xs rounded"
                  >
                    {useCase}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Initial loading state */}
        {isLoading && items.length === 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 lg:gap-16">
            {Array.from({ length: 10 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[4/3] bg-white/80 border-4 border-white animate-pulse rounded-xl"
              />
            ))}
          </div>
        ) : (
          <>
            <ContentGrid
              items={items}
              onItemClick={setSelectedItem}
            />

            {/* Load more trigger / loading indicator */}
            <div ref={loadMoreRef} className="mt-8 py-8">
              {isLoadingMore && (
                <div className="flex items-center justify-center gap-3">
                  <div className="w-4 h-4 border-2 border-[var(--foreground-muted)] border-t-transparent rounded-full animate-spin" />
                  <span className="font-mono-ui text-sm text-[var(--foreground-muted)]">
                    Loading more...
                  </span>
                </div>
              )}
              {!hasMore && items.length > 0 && (
                <p className="text-center font-mono-ui text-sm text-[var(--foreground-muted)]">
                  End of archive
                </p>
              )}
            </div>
          </>
        )}
      </main>

      {/* Bottom Left - Item Count */}
      <div className="fixed bottom-4 left-4 z-40">
        <div className="flex items-center gap-2 px-4 py-2 bg-white/30 backdrop-blur-xl border-2 border-white/50 rounded-full shadow-lg">
          <span className="text-sm text-[var(--foreground-muted)]">–</span>
          <span className="text-sm text-[var(--foreground)]">{total}</span>
          <span className="text-sm text-[var(--foreground-muted)]">+</span>
        </div>
      </div>

      {/* Bottom Right - Date Range */}
      {formatDateRange() && (
        <div className="fixed bottom-4 right-4 z-40">
          <div className="flex items-center px-4 py-2 bg-white/30 backdrop-blur-xl border-2 border-white/50 rounded-full shadow-lg">
            <span className="text-sm text-[var(--foreground)]">
              {formatDateRange()}
            </span>
          </div>
        </div>
      )}

      {/* Bottom Center - Filter Bar */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40">
        <div
          className="bg-white/30 backdrop-blur-xl border-2 border-white/50 shadow-lg transition-all duration-300 ease-out w-[640px] max-w-[calc(100vw-32px)]"
          style={{ borderRadius: 28 }}
        >
          {/* Expanded content with grid animation */}
          <div
            className="grid transition-[grid-template-rows] duration-300 ease-out"
            style={{ gridTemplateRows: isFilterExpanded ? '1fr' : '0fr' }}
          >
            <div className="overflow-hidden">
              <div
                className={`
                  px-5 pt-4 pb-3 transition-opacity duration-200
                  ${isFilterExpanded ? 'opacity-100 delay-100' : 'opacity-0'}
                `}
              >
                {/* Source Types */}
                <div className="mb-4">
                  <p className="text-xs text-[var(--foreground-muted)] mb-2 uppercase tracking-wide">Source</p>
                  <div className="flex flex-wrap gap-1.5">
                    {filters?.sourceTypes?.map((type, index) => (
                      <button
                        key={`source-${index}-${type.name}`}
                        onClick={() => setSelectedSourceType(selectedSourceType === type.name ? null : type.name)}
                        className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                          selectedSourceType === type.name
                            ? 'bg-[var(--foreground)] text-white'
                            : 'bg-gray-100 text-[var(--foreground)] hover:bg-gray-200'
                        }`}
                      >
                        {type.name}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Topics - stacked/wrapped */}
                <div>
                  <p className="text-xs text-[var(--foreground-muted)] mb-2 uppercase tracking-wide">Topics</p>
                  <div className="flex flex-wrap gap-1.5">
                    {filters?.topics?.slice(0, 12).map((topic, index) => (
                      <button
                        key={`expanded-topic-${index}-${topic.name}`}
                        onClick={() => setSelectedTopic(selectedTopic === topic.name ? null : topic.name)}
                        className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                          selectedTopic === topic.name
                            ? 'bg-[var(--foreground)] text-white'
                            : `${getTopicColor(topic.name)} hover:opacity-80`
                        }`}
                      >
                        {topic.name}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Main filter row */}
          <div className={`flex items-center justify-center gap-2.5 px-4 py-2.5 ${isFilterExpanded ? 'border-t border-gray-100' : ''}`}>
            {/* All button */}
            <button
              onClick={() => {
                setSelectedTopic(null);
                setSelectedSourceType(null);
              }}
              className={`px-3.5 py-1.5 text-sm rounded-full transition-colors ${
                !hasActiveFilters
                  ? 'bg-[var(--foreground)] text-white'
                  : 'text-[var(--foreground)] hover:bg-gray-100'
              }`}
            >
              All
            </button>

            {/* Quick topic filters */}
            {['Technology', 'Design', 'AI', 'Culture', 'Engineering'].map((topic, index) => (
              <button
                key={`topic-${index}-${topic}`}
                onClick={() => setSelectedTopic(selectedTopic === topic ? null : topic)}
                className={`px-3.5 py-1.5 text-sm rounded-full transition-colors whitespace-nowrap ${
                  selectedTopic === topic
                    ? 'bg-[var(--foreground)] text-white'
                    : `${getTopicColor(topic)} hover:opacity-80`
                }`}
              >
                {topic}
              </button>
            ))}

            {/* Expand button */}
            <button
              onClick={() => setIsFilterExpanded(!isFilterExpanded)}
              className="flex items-center justify-center w-8 h-8 rounded-full hover:bg-gray-100 transition-colors ml-auto"
            >
              <svg
                className={`w-4 h-4 text-[var(--foreground-muted)] transition-transform ${isFilterExpanded ? 'rotate-180' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 15l7-7 7 7" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Detail modal */}
      <ContentModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
      />
    </div>
  );
}
