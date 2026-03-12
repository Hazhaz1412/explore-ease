import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  Bookmark,
  BookmarkCheck,
  ChevronRight,
  Compass,
  MapPin,
  Search,
  Star,
  UtensilsCrossed,
  Mountain,
  Ticket,
  SlidersHorizontal,
  X,
} from 'lucide-react-native';
import {
  DiscoveryCategory,
  DiscoveryDetailResponse,
  DiscoveryItem,
  DiscoverySortBy,
  discoveryApi,
  locationApi,
} from '../services/backend';
import {
  cacheDiscoverySnapshot,
  enqueueSyncOperation,
  getSyncStatus,
  isLikelyOfflineError,
  loadDiscoverySnapshot,
  loadRecentSearches,
  recordRecentSearch,
  startOfflineSync,
  subscribeSyncStatus,
  type SyncStatus,
} from '../services/offlineSync';

/* ────────────── Native Map lazy load ────────────── */
const MapsModule: any = (() => {
  try {
    return require('react-native-maps');
  } catch {
    return null;
  }
})();
const MapViewComponent = MapsModule?.default || MapsModule?.MapView || MapsModule;
const MarkerComponent = MapsModule?.Marker || MapsModule?.default?.Marker || MapViewComponent?.Marker;
const canRenderNativeMap =
  !!MapViewComponent &&
  (typeof MapViewComponent === 'function' ||
    (typeof MapViewComponent === 'object' && MapViewComponent !== null && '$$typeof' in MapViewComponent));
const IframeElement: any = 'iframe';

/* ────────────── Category metadata ────────────── */
type CategoryTab = {
  key: DiscoveryCategory;
  label: string;
  icon: React.ReactNode;
  emoji: string;
  color: string;
  description: string;
};

const CATEGORY_TABS: CategoryTab[] = [
  {
    key: 'ALL',
    label: 'All',
    icon: <Compass size={18} color="#f5f5f5" strokeWidth={2} />,
    emoji: '🌍',
    color: '#6C63FF',
    description: 'Explore everything nearby',
  },
  {
    key: 'ATTRACTION',
    label: 'Attractions',
    icon: <Mountain size={18} color="#FF6B6B" strokeWidth={2} />,
    emoji: '🏛️',
    color: '#FF6B6B',
    description: 'Landmarks, museums, viewpoints',
  },
  {
    key: 'CUISINE',
    label: 'Cuisines',
    icon: <UtensilsCrossed size={18} color="#FFB347" strokeWidth={2} />,
    emoji: '🍜',
    color: '#FFB347',
    description: 'Restaurants, street food, cafés',
  },
  {
    key: 'ACTIVITY',
    label: 'Activities',
    icon: <Ticket size={18} color="#4ECDC4" strokeWidth={2} />,
    emoji: '🎯',
    color: '#4ECDC4',
    description: 'Sports, tours, experiences',
  },
];

const SORT_OPTIONS: { key: DiscoverySortBy; label: string }[] = [
  { key: 'RELEVANCE', label: 'Relevance' },
  { key: 'TOP_RATED', label: 'Top Rated' },
  { key: 'AZ', label: 'A – Z' },
];

const getCategoryMeta = (category: DiscoveryCategory) =>
  CATEGORY_TABS.find((c) => c.key === category) || CATEGORY_TABS[0];

/* ════════════════════════════════════════════════════════════════════════════ */
/*  DiscoveryModulePanel                                                      */
/* ════════════════════════════════════════════════════════════════════════════ */

const DiscoveryModulePanel = () => {
  /* ── core state ── */
  const [activeCategory, setActiveCategory] = useState<DiscoveryCategory>('ALL');
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showFilters, setShowFilters] = useState(false);

  /* ── filter state ── */
  const [sortBy, setSortBy] = useState<DiscoverySortBy>('RELEVANCE');
  const [minRating, setMinRating] = useState(0);
  const [maxPriceLevel, setMaxPriceLevel] = useState(4);
  const [minPopularity, setMinPopularity] = useState(0);
  const [maxDistanceKm, setMaxDistanceKm] = useState('30');

  /* ── data ── */
  const [items, setItems] = useState<DiscoveryItem[]>([]);
  const [featuredAttractions, setFeaturedAttractions] = useState<DiscoveryItem[]>([]);
  const [featuredCuisines, setFeaturedCuisines] = useState<DiscoveryItem[]>([]);
  const [featuredActivities, setFeaturedActivities] = useState<DiscoveryItem[]>([]);
  const [bookmarks, setBookmarks] = useState<DiscoveryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingFeatured, setLoadingFeatured] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);

  /* ── pagination ── */
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [totalItems, setTotalItems] = useState(0);

  /* ── detail modal ── */
  const [detailVisible, setDetailVisible] = useState(false);
  const [detail, setDetail] = useState<DiscoveryDetailResponse | null>(null);

  /* ── saved tab ── */
  const [activeView, setActiveView] = useState<'browse' | 'saved'>('browse');

  /* ── location reference ── */
  const [refLocation, setRefLocation] = useState<{ latitude?: number; longitude?: number }>({});
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(getSyncStatus());
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [usingOfflineData, setUsingOfflineData] = useState(false);
  const [cacheReady, setCacheReady] = useState(false);

  const distanceValue = useMemo(() => {
    const parsed = Number(maxDistanceKm.trim());
    return Number.isFinite(parsed) ? Math.max(1, Math.min(parsed, 300)) : 30;
  }, [maxDistanceKm]);

  /* ── helpers ── */
  const run = async (task: () => Promise<void>) => {
    try {
      setLoading(true);
      await task();
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Request failed');
    } finally {
      setLoading(false);
    }
  };

  /* ── data loaders ── */
  const loadBrowse = useCallback(
    async (cat?: DiscoveryCategory, searchQuery?: string, pageNum = 0) => {
      try {
        const payload = await discoveryApi.browse({
          query: (searchQuery ?? query).trim() || undefined,
          category: cat ?? activeCategory,
          minRating,
          maxPriceLevel,
          minPopularity,
          maxDistanceKm: distanceValue,
          sort: sortBy,
          latitude: refLocation.latitude,
          longitude: refLocation.longitude,
          limit: 24,
          page: pageNum,
        });
        if (pageNum === 0) {
          setItems(payload.items || []);
        } else {
          setItems((prev) => [...prev, ...(payload.items || [])]);
        }
        setSuggestions(payload.autocompleteSuggestions || []);
        setPage(payload.page ?? pageNum);
        setHasNext(payload.hasNext ?? false);
        setTotalItems(payload.totalItems ?? payload.items?.length ?? 0);
        setUsingOfflineData(false);
      } catch (error: unknown) {
        const cached = await loadDiscoverySnapshot();
        if (cached && pageNum === 0) {
          setItems(cached.lastBrowseItems || []);
          setSuggestions(cached.lastSuggestions || []);
          setPage(0);
          setHasNext(false);
          setTotalItems((cached.lastBrowseItems || []).length);
          setUsingOfflineData(true);
          return;
        }
        throw error;
      }
    },
    [query, activeCategory, minRating, maxPriceLevel, minPopularity, distanceValue, sortBy, refLocation]
  );

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasNext) return;
    setLoadingMore(true);
    try {
      await loadBrowse(activeCategory, query, page + 1);
    } catch {
      /* silent */
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasNext, loadBrowse, activeCategory, query, page]);

  const loadFeaturedSections = useCallback(async () => {
    setLoadingFeatured(true);
    try {
      const [attractions, cuisines, activities] = await Promise.all([
        discoveryApi.browse({
          category: 'ATTRACTION',
          sort: 'TOP_RATED',
          latitude: refLocation.latitude,
          longitude: refLocation.longitude,
          limit: 8,
        }),
        discoveryApi.browse({
          category: 'CUISINE',
          sort: 'TOP_RATED',
          latitude: refLocation.latitude,
          longitude: refLocation.longitude,
          limit: 8,
        }),
        discoveryApi.browse({
          category: 'ACTIVITY',
          sort: 'TOP_RATED',
          latitude: refLocation.latitude,
          longitude: refLocation.longitude,
          limit: 8,
        }),
      ]);
      setFeaturedAttractions(attractions.items || []);
      setFeaturedCuisines(cuisines.items || []);
      setFeaturedActivities(activities.items || []);
      setUsingOfflineData(false);
    } catch (error: unknown) {
      const cached = await loadDiscoverySnapshot();
      if (cached) {
        setFeaturedAttractions(cached.featuredAttractions || []);
        setFeaturedCuisines(cached.featuredCuisines || []);
        setFeaturedActivities(cached.featuredActivities || []);
        if (
          (cached.featuredAttractions || []).length > 0 ||
          (cached.featuredCuisines || []).length > 0 ||
          (cached.featuredActivities || []).length > 0
        ) {
          setUsingOfflineData(true);
          return;
        }
      }
      if (!isLikelyOfflineError(error)) {
        console.warn('Featured load error:', error);
      }
    } finally {
      setLoadingFeatured(false);
    }
  }, [refLocation]);

  const loadBookmarks = useCallback(async () => {
    try {
      const payload = await discoveryApi.getBookmarks({
        latitude: refLocation.latitude,
        longitude: refLocation.longitude,
      });
      setBookmarks(payload || []);
      setUsingOfflineData(false);
    } catch (error: unknown) {
      const cached = await loadDiscoverySnapshot();
      if (cached) {
        setBookmarks(cached.bookmarks || []);
        if ((cached.bookmarks || []).length > 0) {
          setUsingOfflineData(true);
          return;
        }
      }
      throw error;
    }
  }, [refLocation]);

  const refreshAll = () =>
    run(async () => {
      const trimmed = query.trim();
      if (trimmed) {
        const latestRecent = await recordRecentSearch('discovery', trimmed);
        setRecentSearches(latestRecent);
      }
      await Promise.all([loadBrowse(), loadBookmarks()]);
    });

  /* ── bookmark toggle ── */
  const toggleBookmark = async (item: DiscoveryItem) => {
    const nextBookmarked = !item.bookmarked;
    const updateBookmark = (entry: DiscoveryItem) =>
      entry.id === item.id ? { ...entry, bookmarked: nextBookmarked } : entry;

    setItems((prev) => prev.map(updateBookmark));
    setFeaturedAttractions((prev) => prev.map(updateBookmark));
    setFeaturedCuisines((prev) => prev.map(updateBookmark));
    setFeaturedActivities((prev) => prev.map(updateBookmark));
    setBookmarks((prev) =>
      nextBookmarked ? [{ ...item, bookmarked: true }, ...prev.filter((e) => e.id !== item.id)] : prev.filter((e) => e.id !== item.id)
    );
    setDetail((prev) =>
      prev && prev.item.id === item.id ? { ...prev, item: { ...prev.item, bookmarked: nextBookmarked } } : prev
    );

    const queuedOperation =
      nextBookmarked
        ? ({ type: 'DISCOVERY_BOOKMARK_ADD', placeId: item.id } as const)
        : ({ type: 'DISCOVERY_BOOKMARK_REMOVE', placeId: item.id } as const);

    if (!syncStatus.isOnline) {
      await enqueueSyncOperation(queuedOperation);
      return;
    }

    try {
      if (nextBookmarked) {
        await discoveryApi.addBookmark(item.id);
      } else {
        await discoveryApi.removeBookmark(item.id);
      }
      setUsingOfflineData(false);
    } catch (error: any) {
      if (isLikelyOfflineError(error)) {
        await enqueueSyncOperation(queuedOperation);
        return;
      }

      // Rollback optimistic change for non-network errors.
      const rollbackBookmark = (entry: DiscoveryItem) =>
        entry.id === item.id ? { ...entry, bookmarked: item.bookmarked } : entry;
      setItems((prev) => prev.map(rollbackBookmark));
      setFeaturedAttractions((prev) => prev.map(rollbackBookmark));
      setFeaturedCuisines((prev) => prev.map(rollbackBookmark));
      setFeaturedActivities((prev) => prev.map(rollbackBookmark));
      setBookmarks((prev) =>
        item.bookmarked ? [{ ...item, bookmarked: true }, ...prev.filter((e) => e.id !== item.id)] : prev.filter((e) => e.id !== item.id)
      );
      setDetail((prev) =>
        prev && prev.item.id === item.id ? { ...prev, item: { ...prev.item, bookmarked: item.bookmarked } } : prev
      );
      Alert.alert('Error', error?.message || 'Bookmark action failed');
    }
  };

  /* ── detail ── */
  const openDetail = async (item: DiscoveryItem) => {
    try {
      setLoadingDetail(true);
      const payload = await discoveryApi.getDetail(item.id, {
        latitude: refLocation.latitude,
        longitude: refLocation.longitude,
      });
      setDetail(payload);
      setDetailVisible(true);
    } catch (error: any) {
      Alert.alert('Error', error?.message || 'Cannot load detail');
    } finally {
      setLoadingDetail(false);
    }
  };

  const openDirections = async (url: string) => {
    const canOpen = await Linking.canOpenURL(url);
    if (canOpen) await Linking.openURL(url);
  };

  /* ── suggestion select ── */
  const applySuggestion = async (value: string) => {
    const latestRecent = await recordRecentSearch('discovery', value);
    setRecentSearches(latestRecent);
    setQuery(value);
    setShowSuggestions(false);
    setPage(0);
    await run(() => loadBrowse(activeCategory, value, 0));
  };

  /* ── category select ── */
  const selectCategory = async (cat: DiscoveryCategory) => {
    setActiveCategory(cat);
    setPage(0);
    await run(() => loadBrowse(cat, query, 0));
  };

  /* ── reset filters ── */
  const resetFilters = () => {
    setSortBy('RELEVANCE');
    setMinRating(0);
    setMaxPriceLevel(4);
    setMinPopularity(0);
    setMaxDistanceKm('30');
  };

  /* ── bootstrap ── */
  useEffect(() => {
    startOfflineSync();
    const unsubscribe = subscribeSyncStatus(setSyncStatus);
    void (async () => {
      const [cachedDiscovery, cachedSearches] = await Promise.all([
        loadDiscoverySnapshot(),
        loadRecentSearches('discovery'),
      ]);
      if (cachedDiscovery) {
        setBookmarks(cachedDiscovery.bookmarks || []);
        setFeaturedAttractions(cachedDiscovery.featuredAttractions || []);
        setFeaturedCuisines(cachedDiscovery.featuredCuisines || []);
        setFeaturedActivities(cachedDiscovery.featuredActivities || []);
        setItems(cachedDiscovery.lastBrowseItems || []);
        setSuggestions(cachedDiscovery.lastSuggestions || []);
        if (
          (cachedDiscovery.bookmarks || []).length > 0 ||
          (cachedDiscovery.lastBrowseItems || []).length > 0 ||
          (cachedDiscovery.featuredAttractions || []).length > 0 ||
          (cachedDiscovery.featuredCuisines || []).length > 0 ||
          (cachedDiscovery.featuredActivities || []).length > 0
        ) {
          setUsingOfflineData(true);
        }
      }
      setRecentSearches(cachedSearches);
      setCacheReady(true);
    })();

    (async () => {
      try {
        const current = await locationApi.getCurrentLocation();
        setRefLocation({ latitude: current.latitude, longitude: current.longitude });
      } catch {
        setRefLocation({});
      }
    })();
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!cacheReady) return;
    void cacheDiscoverySnapshot({
      bookmarks,
      featuredAttractions,
      featuredCuisines,
      featuredActivities,
      lastBrowseItems: items,
      lastBrowseQuery: query,
      lastBrowseCategory: activeCategory,
      lastSuggestions: suggestions,
    });
  }, [
    cacheReady,
    bookmarks,
    featuredAttractions,
    featuredCuisines,
    featuredActivities,
    items,
    query,
    activeCategory,
    suggestions,
  ]);

  useEffect(() => {
    void refreshAll();
    void loadFeaturedSections();
  }, [refLocation.latitude, refLocation.longitude]);

  /* ── live search suggestions ── */
  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setSuggestions([]);
      return;
    }
    if (!syncStatus.isOnline) {
      const localMatches = recentSearches
        .filter((item) => item.toLowerCase().includes(trimmed.toLowerCase()))
        .slice(0, 6);
      setSuggestions(localMatches);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const payload = await discoveryApi.suggestions(trimmed, 6);
        setSuggestions(payload || []);
      } catch {
        const localMatches = recentSearches
          .filter((item) => item.toLowerCase().includes(trimmed.toLowerCase()))
          .slice(0, 6);
        setSuggestions(localMatches);
      }
    }, 250);
    return () => clearTimeout(timer);
  }, [query, recentSearches, syncStatus.isOnline]);

  const detailItem = detail?.item || null;
  const isAllCategory = activeCategory === 'ALL';

  /* ════════════════ RENDER ════════════════ */
  return (
    <View style={styles.wrapper}>
      {/* ─── Browse / Saved toggle ─── */}
      <View style={styles.topSwitch}>
        <SegmentBtn label="Browse" active={activeView === 'browse'} onPress={() => setActiveView('browse')} />
        <SegmentBtn label="Saved" active={activeView === 'saved'} onPress={() => setActiveView('saved')} />
      </View>

      {(!syncStatus.isOnline || syncStatus.pendingCount > 0 || usingOfflineData) && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>
            {!syncStatus.isOnline
              ? 'Offline mode: using cached attractions and saved items.'
              : usingOfflineData
                ? 'Showing cached data while waiting for fresh content.'
                : 'Connection restored.'}
            {syncStatus.pendingCount > 0 ? ` Pending sync: ${syncStatus.pendingCount}.` : ''}
          </Text>
        </View>
      )}

      {/* ─── Search bar ─── */}
      <View style={styles.searchCard}>
        <View style={styles.searchRow}>
          <Search size={16} color="#888" strokeWidth={2} />
          <TextInput
            value={query}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 120)}
            onChangeText={setQuery}
            onSubmitEditing={() => void refreshAll()}
            returnKeyType="search"
            placeholder="Search attractions, cuisines, activities…"
            placeholderTextColor="#6a6a6a"
            style={styles.searchInput}
          />
          {query.length > 0 && (
            <Pressable onPress={() => { setQuery(''); void refreshAll(); }} hitSlop={8}>
              <X size={14} color="#888" strokeWidth={2} />
            </Pressable>
          )}
          <Pressable style={styles.filterToggle} onPress={() => setShowFilters(!showFilters)}>
            <SlidersHorizontal size={14} color={showFilters ? '#090909' : '#ccc'} strokeWidth={2} />
          </Pressable>
          <Pressable style={styles.searchAction} onPress={() => void refreshAll()}>
            <Text style={styles.searchActionText}>Go</Text>
          </Pressable>
        </View>

        {/* ─── Autocomplete ─── */}
        {showSuggestions && suggestions.length > 0 && (
          <View style={styles.suggestionWrap}>
            {suggestions.map((sug) => (
              <Pressable key={sug} style={styles.suggestionItem} onPress={() => void applySuggestion(sug)}>
                <Search size={12} color="#777" strokeWidth={2} />
                <Text style={styles.suggestionText}>{sug}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* ─── Category tabs ─── */}
      {activeView === 'browse' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
          {CATEGORY_TABS.map((tab) => {
            const isActive = activeCategory === tab.key;
            return (
              <Pressable
                key={tab.key}
                style={[styles.categoryTab, isActive && { backgroundColor: tab.color, borderColor: tab.color }]}
                onPress={() => void selectCategory(tab.key)}
              >
                {tab.icon}
                <Text style={[styles.categoryTabLabel, isActive && styles.categoryTabLabelActive]}>{tab.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {/* ─── Category header ─── */}
      {activeView === 'browse' && (
        <View style={styles.categoryHeader}>
          <Text style={styles.categoryTitle}>{getCategoryMeta(activeCategory).emoji} {getCategoryMeta(activeCategory).label}</Text>
          <Text style={styles.categoryDesc}>{getCategoryMeta(activeCategory).description}</Text>
        </View>
      )}

      {/* ─── Filters panel ─── */}
      {showFilters && activeView === 'browse' && (
        <View style={styles.filterCard}>
          <View style={styles.filterCardHeader}>
            <Text style={styles.filterCardTitle}>Filters</Text>
            <Pressable onPress={resetFilters}>
              <Text style={styles.filterResetText}>Reset all</Text>
            </Pressable>
          </View>

          <Text style={styles.filterLabel}>Sort by</Text>
          <View style={styles.chipRow}>
            {SORT_OPTIONS.map((opt) => (
              <Chip key={opt.key} label={opt.label} active={sortBy === opt.key} onPress={() => setSortBy(opt.key)} />
            ))}
          </View>

          <View style={styles.filterRow}>
            <View style={styles.filterBlock}>
              <Text style={styles.filterLabel}>Min rating</Text>
              <View style={styles.chipRow}>
                {[0, 3.5, 4.0, 4.5].map((r) => (
                  <Chip key={String(r)} label={r === 0 ? 'Any' : `${r}+`} active={minRating === r} onPress={() => setMinRating(r)} />
                ))}
              </View>
            </View>
            <View style={styles.filterBlock}>
              <Text style={styles.filterLabel}>Price</Text>
              <View style={styles.chipRow}>
                {[1, 2, 3, 4].map((p) => (
                  <Chip key={String(p)} label={'$'.repeat(p)} active={maxPriceLevel === p} onPress={() => setMaxPriceLevel(p)} />
                ))}
              </View>
            </View>
          </View>

          <View style={styles.filterRow}>
            <View style={styles.filterBlock}>
              <Text style={styles.filterLabel}>Min popularity</Text>
              <View style={styles.chipRow}>
                {[0, 50, 70, 85].map((v) => (
                  <Chip key={String(v)} label={v === 0 ? 'Any' : `${v}+`} active={minPopularity === v} onPress={() => setMinPopularity(v)} />
                ))}
              </View>
            </View>
            <View style={styles.filterBlock}>
              <Text style={styles.filterLabel}>Max dist (km)</Text>
              <TextInput
                value={maxDistanceKm}
                onChangeText={setMaxDistanceKm}
                keyboardType="number-pad"
                style={styles.distanceInput}
              />
            </View>
          </View>

          <Pressable style={styles.applyBtn} onPress={() => { setShowFilters(false); void refreshAll(); }}>
            <Text style={styles.applyBtnText}>{loading ? 'Applying…' : 'Apply Filters'}</Text>
          </Pressable>
        </View>
      )}

      {/* ─── SAVED view ─── */}
      {activeView === 'saved' && (
        <View style={styles.listCard}>
          <View style={styles.listHeader}>
            <Text style={styles.cardTitle}>Saved Places ({bookmarks.length})</Text>
            {loading && <ActivityIndicator size="small" color="#f5f5f5" />}
          </View>
          <View style={styles.listWrap}>
            {bookmarks.length > 0 ? (
              bookmarks.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  onDetail={openDetail}
                  onBookmark={toggleBookmark}
                  onDirections={openDirections}
                  loadingDetail={loadingDetail}
                />
              ))
            ) : (
              <Text style={styles.emptyText}>No favorites yet. Tap the bookmark icon on any card to save it here.</Text>
            )}
          </View>
        </View>
      )}

      {/* ─── BROWSE: Featured sections (ALL category, no search) ─── */}
      {activeView === 'browse' && isAllCategory && !query.trim() && (
        <>
          {loadingFeatured && (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#aaa" />
              <Text style={styles.loadingText}>Loading featured content…</Text>
            </View>
          )}
          <FeaturedSection
            title="🏛️ Top Attractions"
            subtitle="Landmarks, museums & viewpoints near you"
            items={featuredAttractions}
            color="#FF6B6B"
            onSeeAll={() => void selectCategory('ATTRACTION')}
            onDetail={openDetail}
            onBookmark={toggleBookmark}
          />
          <FeaturedSection
            title="🍜 Popular Cuisines"
            subtitle="Restaurants, street food & cafés"
            items={featuredCuisines}
            color="#FFB347"
            onSeeAll={() => void selectCategory('CUISINE')}
            onDetail={openDetail}
            onBookmark={toggleBookmark}
          />
          <FeaturedSection
            title="🎯 Best Activities"
            subtitle="Sports, tours & unique experiences"
            items={featuredActivities}
            color="#4ECDC4"
            onSeeAll={() => void selectCategory('ACTIVITY')}
            onDetail={openDetail}
            onBookmark={toggleBookmark}
          />
        </>
      )}

      {/* ─── BROWSE: Category results grid ─── */}
      {activeView === 'browse' && (!isAllCategory || query.trim()) && (
        <View style={styles.listCard}>
          <View style={styles.listHeader}>
            <Text style={styles.cardTitle}>
              {query.trim()
                ? `Results for "${query.trim()}" (${items.length}${totalItems > items.length ? ` / ${totalItems}` : ''})`
                : `${getCategoryMeta(activeCategory).label} (${items.length}${totalItems > items.length ? ` / ${totalItems}` : ''})`}
            </Text>
            {loading && <ActivityIndicator size="small" color="#f5f5f5" />}
          </View>
          <View style={styles.listWrap}>
            {items.length > 0 ? (
              <>
                {items.map((item) => (
                  <ItemCard
                    key={item.id}
                    item={item}
                    onDetail={openDetail}
                    onBookmark={toggleBookmark}
                    onDirections={openDirections}
                    loadingDetail={loadingDetail}
                  />
                ))}
                {hasNext && (
                  <Pressable
                    style={styles.loadMoreBtn}
                    onPress={loadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore ? (
                      <ActivityIndicator size="small" color="#6C63FF" />
                    ) : (
                      <Text style={styles.loadMoreText}>Load more results…</Text>
                    )}
                  </Pressable>
                )}
              </>
            ) : (
              <Text style={styles.emptyText}>
                {loading ? 'Searching…' : 'No results. Try a different search or adjust filters.'}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* ─── Detail modal ─── */}
      <Modal visible={detailVisible} transparent animationType="fade" onRequestClose={() => setDetailVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Discovery Detail</Text>
              <Pressable onPress={() => setDetailVisible(false)} style={styles.modalClose}>
                <X size={14} color="#d2d2d2" strokeWidth={2} />
              </Pressable>
            </View>

            {detailItem && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.modalBody}>
                {/* category badge */}
                <View style={[styles.detailBadge, { backgroundColor: getCategoryMeta(detailItem.category).color + '22' }]}>
                  <Text style={[styles.detailBadgeText, { color: getCategoryMeta(detailItem.category).color }]}>
                    {getCategoryMeta(detailItem.category).emoji} {getCategoryMeta(detailItem.category).label}
                  </Text>
                </View>

                <Text style={styles.detailName}>{detailItem.name}</Text>

                <View style={styles.detailRatingRow}>
                  <Star size={14} color="#FFB347" fill="#FFB347" strokeWidth={0} />
                  <Text style={styles.detailRatingText}>{detailItem.rating.toFixed(1)}</Text>
                  <Text style={styles.detailRatingCount}>({detailItem.reviewCount} reviews)</Text>
                  <Text style={styles.detailMetaSep}>•</Text>
                  <Text style={styles.detailRatingCount}>{detailItem.distanceKm} km away</Text>
                  <Text style={styles.detailMetaSep}>•</Text>
                  <Text style={styles.detailRatingCount}>{detailItem.pricingText || '$'}</Text>
                </View>

                {/* image carousel */}
                {(detail?.imageUrls || []).length > 0 && (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.imageRow}>
                    {(detail?.imageUrls || []).map((url) => (
                      <Image key={url} source={{ uri: url }} style={styles.detailImage} resizeMode="cover" />
                    ))}
                  </ScrollView>
                )}

                {/* info cards */}
                <View style={styles.detailInfoGrid}>
                  <View style={styles.detailInfoBox}>
                    <MapPin size={14} color="#aaa" strokeWidth={2} />
                    <Text style={styles.detailInfoLabel}>Hours</Text>
                    <Text style={styles.detailInfoValue}>{detailItem.operationalHours || 'N/A'}</Text>
                  </View>
                  <View style={styles.detailInfoBox}>
                    <Compass size={14} color="#aaa" strokeWidth={2} />
                    <Text style={styles.detailInfoLabel}>Status</Text>
                    <Text
                      style={[
                        styles.detailInfoValue,
                        detailItem.openNow === true && { color: '#4ECDC4' },
                        detailItem.openNow === false && { color: '#FF6B6B' },
                      ]}
                    >
                      {detailItem.availabilityLabel || 'Unknown'}
                    </Text>
                  </View>
                  <View style={styles.detailInfoBox}>
                    <Star size={14} color="#aaa" strokeWidth={2} />
                    <Text style={styles.detailInfoLabel}>Popularity</Text>
                    <Text style={styles.detailInfoValue}>{detailItem.popularityScore}/100</Text>
                  </View>
                </View>

                {/* tags */}
                {detailItem.tags && detailItem.tags.length > 0 && (
                  <View style={styles.tagRow}>
                    {detailItem.tags.slice(0, 8).map((tag) => (
                      <View key={tag} style={styles.tagChip}>
                        <Text style={styles.tagChipText}>#{tag}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <MapPreview item={detailItem} />

                <Text style={styles.detailDesc}>{detail?.longDescription || detailItem.shortDescription}</Text>

                <View style={styles.detailActions}>
                  <Pressable style={styles.primaryBtnLg} onPress={() => void openDirections(detailItem.directionsUrl)}>
                    <MapPin size={14} color="#090909" strokeWidth={2} />
                    <Text style={styles.primaryBtnLgText}>Get Directions</Text>
                  </Pressable>
                  <Pressable style={styles.ghostBtnLg} onPress={() => void toggleBookmark(detailItem)}>
                    {detailItem.bookmarked ? (
                      <BookmarkCheck size={14} color="#FFB347" strokeWidth={2} />
                    ) : (
                      <Bookmark size={14} color="#ccc" strokeWidth={2} />
                    )}
                    <Text style={styles.ghostBtnLgText}>{detailItem.bookmarked ? 'Saved' : 'Save'}</Text>
                  </Pressable>
                </View>
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
};

/* ════════════════════════════════════════════════════════════════════════════ */
/*  Sub-components                                                            */
/* ════════════════════════════════════════════════════════════════════════════ */

/* ── Featured horizontal section ── */
const FeaturedSection = ({
  title,
  subtitle,
  items,
  color,
  onSeeAll,
  onDetail,
  onBookmark,
}: {
  title: string;
  subtitle: string;
  items: DiscoveryItem[];
  color: string;
  onSeeAll: () => void;
  onDetail: (item: DiscoveryItem) => void;
  onBookmark: (item: DiscoveryItem) => void;
}) => {
  if (items.length === 0) return null;

  return (
    <View style={styles.featuredSection}>
      <View style={styles.featuredHeader}>
        <View>
          <Text style={styles.featuredTitle}>{title}</Text>
          <Text style={styles.featuredSubtitle}>{subtitle}</Text>
        </View>
        <Pressable style={[styles.seeAllBtn, { borderColor: color }]} onPress={onSeeAll}>
          <Text style={[styles.seeAllText, { color }]}>See all</Text>
          <ChevronRight size={12} color={color} strokeWidth={2} />
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredScroll}>
        {items.map((item) => (
          <FeaturedCard key={item.id} item={item} color={color} onDetail={onDetail} onBookmark={onBookmark} />
        ))}
      </ScrollView>
    </View>
  );
};

/* ── Featured horizontal card ── */
const FeaturedCard = ({
  item,
  color,
  onDetail,
  onBookmark,
}: {
  item: DiscoveryItem;
  color: string;
  onDetail: (item: DiscoveryItem) => void;
  onBookmark: (item: DiscoveryItem) => void;
}) => {
  const meta = getCategoryMeta(item.category);
  return (
    <Pressable style={styles.featuredCard} onPress={() => onDetail(item)}>
      {item.thumbnailUrl ? (
        <Image source={{ uri: item.thumbnailUrl }} style={styles.featuredImg} resizeMode="cover" />
      ) : (
        <View style={[styles.featuredImgFallback, { backgroundColor: color + '18' }]}>
          <Text style={{ fontSize: 28 }}>{meta.emoji}</Text>
        </View>
      )}
      <View style={styles.featuredCardBody}>
        <Text style={styles.featuredCardName} numberOfLines={1}>
          {item.name}
        </Text>
        <View style={styles.featuredCardMeta}>
          <Star size={10} color="#FFB347" fill="#FFB347" strokeWidth={0} />
          <Text style={styles.featuredCardMetaText}>{item.rating.toFixed(1)}</Text>
          <Text style={styles.featuredCardMetaText}>• {item.distanceKm} km</Text>
        </View>
        <Text style={styles.featuredCardDesc} numberOfLines={1}>
          {item.shortDescription}
        </Text>
      </View>
      <Pressable style={styles.featuredBookmark} onPress={() => onBookmark(item)}>
        {item.bookmarked ? (
          <BookmarkCheck size={12} color="#FFB347" strokeWidth={2} />
        ) : (
          <Bookmark size={12} color="#888" strokeWidth={2} />
        )}
      </Pressable>
    </Pressable>
  );
};

/* ── Item card (grid/list) ── */
const ItemCard = ({
  item,
  onDetail,
  onBookmark,
  onDirections,
  loadingDetail,
}: {
  item: DiscoveryItem;
  onDetail: (item: DiscoveryItem) => void;
  onBookmark: (item: DiscoveryItem) => void;
  onDirections: (url: string) => void;
  loadingDetail: boolean;
}) => {
  const meta = getCategoryMeta(item.category);
  return (
    <View style={styles.itemCard}>
      {/* thumbnail */}
      {item.thumbnailUrl ? (
        <Image source={{ uri: item.thumbnailUrl }} style={styles.thumbnail} resizeMode="cover" />
      ) : (
        <View style={[styles.thumbnailFallback, { backgroundColor: meta.color + '12' }]}>
          <Text style={{ fontSize: 30 }}>{meta.emoji}</Text>
          <Text style={styles.thumbnailFallbackLabel}>{meta.label}</Text>
        </View>
      )}
      {/* badge */}
      <View style={[styles.itemBadge, { backgroundColor: meta.color + '22' }]}>
        <Text style={[styles.itemBadgeText, { color: meta.color }]}>{meta.label}</Text>
      </View>

      <View style={styles.itemContent}>
        <View style={styles.itemTop}>
          <Text style={styles.itemName} numberOfLines={1}>
            {item.name}
          </Text>
          <Pressable style={styles.bookmarkBtn} onPress={() => void onBookmark(item)}>
            {item.bookmarked ? (
              <BookmarkCheck size={14} color="#FFB347" strokeWidth={2} />
            ) : (
              <Bookmark size={14} color="#888" strokeWidth={2} />
            )}
          </Pressable>
        </View>

        {/* rating row */}
        <View style={styles.itemRatingRow}>
          <Star size={11} color="#FFB347" fill="#FFB347" strokeWidth={0} />
          <Text style={styles.itemRatingText}>{item.rating.toFixed(1)}</Text>
          <Text style={styles.itemMetaLight}>({item.reviewCount})</Text>
          <Text style={styles.itemMetaSep}>•</Text>
          <Text style={styles.itemMetaLight}>{item.distanceKm} km</Text>
          <Text style={styles.itemMetaSep}>•</Text>
          <Text style={styles.itemMetaLight}>{item.pricingText || '$'}</Text>
        </View>

        {/* availability */}
        <View style={styles.availRow}>
          <View
            style={[
              styles.availDot,
              item.openNow === true && styles.availDotOpen,
              item.openNow === false && styles.availDotClosed,
            ]}
          />
          <Text style={styles.availText}>{item.availabilityLabel}</Text>
          <Text style={styles.itemMetaLight}> • Pop {item.popularityScore}</Text>
        </View>

        <Text style={styles.itemDesc} numberOfLines={2}>
          {item.shortDescription}
        </Text>

        <View style={styles.itemActions}>
          <Pressable style={styles.ghostBtn} onPress={() => void onDetail(item)}>
            <Text style={styles.ghostBtnText}>{loadingDetail ? '…' : 'Details'}</Text>
          </Pressable>
          <Pressable style={styles.primaryBtn} onPress={() => void onDirections(item.directionsUrl)}>
            <MapPin size={11} color="#090909" strokeWidth={2} />
            <Text style={styles.primaryBtnText}>Directions</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
};

/* ── Map preview ── */
const MapPreview = ({ item }: { item: DiscoveryItem }) => {
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${item.longitude - 0.01}%2C${
    item.latitude - 0.01
  }%2C${item.longitude + 0.01}%2C${item.latitude + 0.01}&layer=mapnik&marker=${item.latitude}%2C${item.longitude}`;

  if (Platform.OS === 'web') {
    return (
      <View style={styles.mapWrap}>
        <IframeElement title="map" src={src} style={styles.webIframe} loading="lazy" />
      </View>
    );
  }
  if (canRenderNativeMap && MarkerComponent) {
    return (
      <View style={styles.mapWrap}>
        <MapViewComponent
          style={styles.nativeMap}
          initialRegion={{
            latitude: item.latitude,
            longitude: item.longitude,
            latitudeDelta: 0.04,
            longitudeDelta: 0.04,
          }}
        >
          <MarkerComponent
            coordinate={{ latitude: item.latitude, longitude: item.longitude }}
            title={item.name}
            pinColor="#ffffff"
          />
        </MapViewComponent>
      </View>
    );
  }
  return (
    <View style={styles.mapFallback}>
      <MapPin size={16} color="#888" strokeWidth={2} />
      <Text style={styles.mapFallbackText}>Map preview unavailable. Use "Get Directions" to navigate.</Text>
    </View>
  );
};

/* ── Segment button ── */
const SegmentBtn = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
  <Pressable style={[styles.segBtn, active && styles.segBtnActive]} onPress={onPress}>
    <Text style={[styles.segBtnText, active && styles.segBtnTextActive]}>{label}</Text>
  </Pressable>
);

/* ── Chip ── */
const Chip = ({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) => (
  <Pressable style={[styles.chip, active && styles.chipActive]} onPress={onPress}>
    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
  </Pressable>
);

/* ════════════════════════════════════════════════════════════════════════════ */
/*  Styles                                                                    */
/* ════════════════════════════════════════════════════════════════════════════ */
const styles = StyleSheet.create({
  wrapper: { gap: 12 },
  offlineBanner: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2e3442',
    backgroundColor: '#111826',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  offlineBannerText: {
    color: '#b8c3d9',
    fontSize: 12,
    lineHeight: 18,
  },

  /* ── top switch ── */
  topSwitch: { flexDirection: 'row', gap: 8 },
  segBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2e2e2e',
    backgroundColor: '#141414',
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  segBtnActive: { backgroundColor: '#f5f5f5', borderColor: '#f5f5f5' },
  segBtnText: { color: '#aaa', fontSize: 12, fontWeight: '600', fontFamily: 'monospace' },
  segBtnTextActive: { color: '#090909' },

  /* ── search ── */
  searchCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2d2d2d',
    backgroundColor: '#121212',
    padding: 10,
    gap: 6,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2f2f2f',
    backgroundColor: '#181818',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, color: '#f3f3f3', fontSize: 13, paddingVertical: 0 },
  filterToggle: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#232323',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchAction: {
    borderRadius: 999,
    backgroundColor: '#f4f4f4',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  searchActionText: { color: '#0c0c0c', fontSize: 11, fontWeight: '700', fontFamily: 'monospace' },

  /* ── suggestions ── */
  suggestionWrap: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2f2f2f',
    overflow: 'hidden',
    backgroundColor: '#171717',
  },
  suggestionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#252525',
  },
  suggestionText: { color: '#d5d5d5', fontSize: 12 },

  /* ── category tabs ── */
  categoryRow: { gap: 8, paddingVertical: 2 },
  categoryTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#161616',
    paddingHorizontal: 14,
    paddingVertical: 9,
  },
  categoryTabLabel: { color: '#bbb', fontSize: 12, fontWeight: '600', fontFamily: 'monospace' },
  categoryTabLabelActive: { color: '#fff', fontWeight: '700' },

  /* ── category header ── */
  categoryHeader: { gap: 2, paddingHorizontal: 2 },
  categoryTitle: { color: '#f2f2f2', fontSize: 18, fontWeight: '700' },
  categoryDesc: { color: '#888', fontSize: 12 },

  /* ── filter card ── */
  filterCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2d2d2d',
    backgroundColor: '#121212',
    padding: 12,
    gap: 10,
  },
  filterCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  filterCardTitle: { color: '#f2f2f2', fontSize: 14, fontWeight: '700', fontFamily: 'monospace' },
  filterResetText: { color: '#6C63FF', fontSize: 11, fontWeight: '600' },
  filterLabel: { color: '#ccc', fontSize: 11, fontFamily: 'monospace', marginTop: 2 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  chipActive: { backgroundColor: '#f2f2f2', borderColor: '#f2f2f2' },
  chipText: { color: '#bbb', fontSize: 11, fontFamily: 'monospace' },
  chipTextActive: { color: '#0f0f0f', fontWeight: '700' },
  filterRow: { flexDirection: 'row', gap: 10 },
  filterBlock: { flex: 1, gap: 5 },
  distanceInput: {
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#393939',
    backgroundColor: '#1a1a1a',
    color: '#efefef',
    fontSize: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  applyBtn: {
    borderRadius: 10,
    backgroundColor: '#f4f4f4',
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  applyBtnText: { color: '#090909', fontSize: 12, fontWeight: '700', fontFamily: 'monospace' },

  /* ── featured section ── */
  featuredSection: { gap: 8 },
  featuredHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: 2,
  },
  featuredTitle: { color: '#f2f2f2', fontSize: 16, fontWeight: '700' },
  featuredSubtitle: { color: '#888', fontSize: 11, marginTop: 1 },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  seeAllText: { fontSize: 11, fontWeight: '600' },
  featuredScroll: { gap: 10, paddingRight: 4 },
  featuredCard: {
    width: 200,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2d2d2d',
    backgroundColor: '#151515',
    overflow: 'hidden',
  },
  featuredImg: { width: '100%', height: 110 },
  featuredImgFallback: {
    width: '100%',
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featuredCardBody: { padding: 8, gap: 3 },
  featuredCardName: { color: '#f3f3f3', fontSize: 13, fontWeight: '700' },
  featuredCardMeta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  featuredCardMetaText: { color: '#aaa', fontSize: 10 },
  featuredCardDesc: { color: '#888', fontSize: 10, marginTop: 1 },
  featuredBookmark: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── list card ── */
  listCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2d2d2d',
    backgroundColor: '#121212',
    padding: 11,
    gap: 8,
  },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { color: '#f2f2f2', fontSize: 15, fontWeight: '700', fontFamily: 'monospace' },
  listWrap: { gap: 10 },

  /* ── item card ── */
  itemCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    backgroundColor: '#161616',
    overflow: 'hidden',
  },
  thumbnail: { width: '100%', height: 140 },
  thumbnailFallback: {
    width: '100%',
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  thumbnailFallbackLabel: { color: '#aaa', fontSize: 12, fontFamily: 'monospace' },
  itemBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  itemBadgeText: { fontSize: 10, fontWeight: '700', fontFamily: 'monospace' },
  itemContent: { padding: 10, gap: 5 },
  itemTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  itemName: { flex: 1, color: '#f4f4f4', fontSize: 14, fontWeight: '700' },
  bookmarkBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  itemRatingText: { color: '#FFB347', fontSize: 12, fontWeight: '700' },
  itemMetaLight: { color: '#999', fontSize: 11 },
  itemMetaSep: { color: '#555', fontSize: 11 },
  availRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  availDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#555' },
  availDotOpen: { backgroundColor: '#4ECDC4' },
  availDotClosed: { backgroundColor: '#FF6B6B' },
  availText: { color: '#bbb', fontSize: 11 },
  itemDesc: { color: '#d0d0d0', fontSize: 12, lineHeight: 17 },
  itemActions: { flexDirection: 'row', gap: 7, marginTop: 3 },

  /* ── buttons ── */
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 10,
    backgroundColor: '#f4f4f4',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  primaryBtnText: { color: '#090909', fontSize: 11, fontWeight: '700', fontFamily: 'monospace' },
  ghostBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#1a1a1a',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  ghostBtnText: { color: '#d5d5d5', fontSize: 11, fontWeight: '700', fontFamily: 'monospace' },
  primaryBtnLg: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    backgroundColor: '#f4f4f4',
    paddingVertical: 11,
  },
  primaryBtnLgText: { color: '#090909', fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },
  ghostBtnLg: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#1a1a1a',
    paddingVertical: 11,
  },
  ghostBtnLgText: { color: '#d5d5d5', fontSize: 13, fontWeight: '700', fontFamily: 'monospace' },

  /* ── empty ── */
  emptyText: { color: '#777', fontSize: 12, fontStyle: 'italic', paddingVertical: 8 },
  loadMoreBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 4,
    borderRadius: 10,
    backgroundColor: '#1a1a2e',
    borderWidth: 1,
    borderColor: '#6C63FF33',
  },
  loadMoreText: {
    color: '#6C63FF',
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 },
  loadingText: { color: '#888', fontSize: 12 },

  /* ── modal ── */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 18,
  },
  modalCard: {
    width: '100%',
    maxWidth: 620,
    maxHeight: '94%',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    backgroundColor: '#111',
    padding: 14,
    gap: 10,
  },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  modalTitle: { color: '#f3f3f3', fontSize: 16, fontWeight: '700', fontFamily: 'monospace' },
  modalClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: '#333',
    backgroundColor: '#1a1a1a',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: { gap: 12, paddingBottom: 10 },

  /* ── detail ── */
  detailBadge: { alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  detailBadgeText: { fontSize: 11, fontWeight: '700' },
  detailName: { color: '#f7f7f7', fontSize: 20, fontWeight: '700' },
  detailRatingRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  detailRatingText: { color: '#FFB347', fontSize: 14, fontWeight: '700' },
  detailRatingCount: { color: '#999', fontSize: 12 },
  detailMetaSep: { color: '#555', fontSize: 12 },
  imageRow: { gap: 8, paddingRight: 4 },
  detailImage: { width: 260, height: 160, borderRadius: 12, backgroundColor: '#1d1d1d' },
  detailInfoGrid: { flexDirection: 'row', gap: 8 },
  detailInfoBox: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    backgroundColor: '#161616',
    padding: 10,
  },
  detailInfoLabel: { color: '#888', fontSize: 10, fontFamily: 'monospace' },
  detailInfoValue: { color: '#ddd', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  tagChip: {
    borderRadius: 999,
    backgroundColor: '#1e1e1e',
    borderWidth: 1,
    borderColor: '#2d2d2d',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  tagChipText: { color: '#999', fontSize: 10 },
  detailDesc: { color: '#d8d8d8', fontSize: 12, lineHeight: 18 },
  detailActions: { flexDirection: 'row', gap: 8 },

  /* ── map ── */
  mapWrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    overflow: 'hidden',
    backgroundColor: '#151515',
  },
  nativeMap: { width: '100%', height: 180 },
  webIframe: { width: '100%', height: 180, borderWidth: 0 },
  mapFallback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a2a',
    padding: 12,
    backgroundColor: '#161616',
  },
  mapFallbackText: { color: '#888', fontSize: 11, flex: 1 },
});

export default DiscoveryModulePanel;
