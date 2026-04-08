import {
  type DiscoveryCategory,
  type DiscoveryItem,
  type LocationDiscovery,
  type LocationSnapshot,
  type EventItem,
  type EventStatus,
  type EventType,
  type UserPreferences,
  type UserProfile,
  discoveryApi,
  eventApi,
  userApi,
} from './backend';

type AsyncStorageLike = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

type NetInfoStateLike = {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
};

type NetInfoLike = {
  fetch: () => Promise<NetInfoStateLike>;
  addEventListener: (listener: (state: NetInfoStateLike) => void) => () => void;
};

const memoryStorage = (() => {
  const store = new Map<string, string>();
  return {
    async getItem(key: string) {
      return store.has(key) ? store.get(key) || null : null;
    },
    async setItem(key: string, value: string) {
      store.set(key, value);
    },
  } satisfies AsyncStorageLike;
})();

const fallbackNetInfo: NetInfoLike = {
  async fetch() {
    const browserOnline = (globalThis as { navigator?: { onLine?: boolean } }).navigator?.onLine;
    return {
      isConnected: browserOnline ?? true,
      isInternetReachable: browserOnline ?? true,
    };
  },
  addEventListener(listener: (state: NetInfoStateLike) => void) {
    void this.fetch().then(listener);
    return () => {};
  },
};

let asyncStorage: AsyncStorageLike = memoryStorage;
try {
  // Metro requires static module strings for require()
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const asyncStorageModule = require('@react-native-async-storage/async-storage');
  asyncStorage = (asyncStorageModule?.default || asyncStorageModule) as AsyncStorageLike;
} catch {
  asyncStorage = memoryStorage;
}

let netInfo: NetInfoLike = fallbackNetInfo;
try {
  // Metro requires static module strings for require()
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const netInfoModule = require('@react-native-community/netinfo');
  netInfo = (netInfoModule?.default || netInfoModule) as NetInfoLike;
} catch {
  netInfo = fallbackNetInfo;
}
const hasNetInfoModule = netInfo !== fallbackNetInfo;

const STORAGE_KEYS = {
  syncQueue: 'exploreease.sync.queue.v1',
  discovery: 'exploreease.cache.discovery.v1',
  events: 'exploreease.cache.events.v1',
  profile: 'exploreease.cache.profile.v1',
  location: 'exploreease.cache.location.v1',
  recentDiscoverySearches: 'exploreease.cache.searches.discovery.v1',
  recentEventSearches: 'exploreease.cache.searches.events.v1',
} as const;

type DiscoveryBookmarkSyncOperation =
  | { id: string; createdAt: number; type: 'DISCOVERY_BOOKMARK_ADD'; placeId: string }
  | { id: string; createdAt: number; type: 'DISCOVERY_BOOKMARK_REMOVE'; placeId: string };

type EventBookmarkSyncOperation = {
  id: string;
  createdAt: number;
  type: 'EVENT_BOOKMARK_TOGGLE';
  eventId: number;
};

type UserProfileSyncOperation = {
  id: string;
  createdAt: number;
  type: 'USER_PROFILE_UPDATE';
  payload: Record<string, unknown>;
};

type UserPreferencesSyncOperation = {
  id: string;
  createdAt: number;
  type: 'USER_PREFERENCES_UPDATE';
  payload: Record<string, unknown>;
};

type SyncOperation =
  | DiscoveryBookmarkSyncOperation
  | EventBookmarkSyncOperation
  | UserProfileSyncOperation
  | UserPreferencesSyncOperation;

type SyncOperationInput = Omit<DiscoveryBookmarkSyncOperation, 'id' | 'createdAt'>
  | Omit<EventBookmarkSyncOperation, 'id' | 'createdAt'>
  | Omit<UserProfileSyncOperation, 'id' | 'createdAt'>
  | Omit<UserPreferencesSyncOperation, 'id' | 'createdAt'>;

export type SyncStatus = {
  isOnline: boolean;
  pendingCount: number;
  syncing: boolean;
  lastSyncAt: number | null;
  lastError: string | null;
};

export type DiscoveryCacheSnapshot = {
  updatedAt: number;
  bookmarks: DiscoveryItem[];
  featuredAttractions: DiscoveryItem[];
  featuredCuisines: DiscoveryItem[];
  featuredActivities: DiscoveryItem[];
  lastBrowseItems: DiscoveryItem[];
  lastBrowseQuery: string;
  lastBrowseCategory: DiscoveryCategory;
  lastSuggestions: string[];
};

export type EventCacheSnapshot = {
  updatedAt: number;
  events: EventItem[];
  page: number;
  hasNext: boolean;
  total: number;
  filters: {
    status: EventStatus | 'ALL';
    type: EventType | 'ALL';
    pricing: 'all' | 'free' | 'paid';
    searchQuery: string;
  };
};

export type ProfileCacheSnapshot = {
  updatedAt: number;
  profile: UserProfile;
  preferences: UserPreferences;
};

export type LocationCacheSnapshot = {
  updatedAt: number;
  currentLocation: LocationSnapshot | null;
  discovery: LocationDiscovery | null;
};

const defaultDiscoveryCache = (): DiscoveryCacheSnapshot => ({
  updatedAt: Date.now(),
  bookmarks: [
    {
      id: 'sample-1',
      name: 'Iconic Museum',
      category: 'ATTRACTION',
      tags: ['museum', 'art', 'cultural'],
      shortDescription: 'A premier gallery showcasing modern and contemporary art',
      latitude: 16.0678,
      longitude: 108.2208,
      distanceKm: 2.5,
      rating: 4.7,
      reviewCount: 328,
      priceLevel: 3,
      popularityScore: 85,
      thumbnailUrl: 'https://images.unsplash.com/photo-1564720986137-d5dd41f3c663?auto=format&fit=crop&q=80&w=600',
      pricingText: '$$$',
      operationalHours: '9:00 AM - 6:00 PM',
      openNow: true,
      availabilityLabel: 'Open now',
      directionsUrl: 'https://www.google.com/maps/search/?api=1&query=museum',
      bookmarked: true,
    },
  ],
  featuredAttractions: [
    {
      id: 'attr-1',
      name: 'Ancient Temple',
      category: 'ATTRACTION',
      tags: ['temple', 'historical', 'spiritual'],
      shortDescription: 'Historic shrine with stunning architecture and cultural significance',
      latitude: 16.0755,
      longitude: 108.2252,
      distanceKm: 1.2,
      rating: 4.8,
      reviewCount: 612,
      priceLevel: 1,
      popularityScore: 92,
      thumbnailUrl: 'https://images.unsplash.com/photo-1548013146-72f27e1f306d?auto=format&fit=crop&q=80&w=600',
      pricingText: '$',
      operationalHours: '7:00 AM - 9:00 PM',
      openNow: true,
      availabilityLabel: 'Open now',
      directionsUrl: 'https://www.google.com/maps/search/?api=1&query=temple',
      bookmarked: false,
    },
  ],
  featuredCuisines: [
    {
      id: 'cuisine-1',
      name: 'Local Cuisine Restaurant',
      category: 'CUISINE',
      tags: ['vietnamese', 'authentic', 'traditional'],
      shortDescription: 'Traditional flavors and fresh local ingredients',
      latitude: 16.0645,
      longitude: 108.2190,
      distanceKm: 0.8,
      rating: 4.6,
      reviewCount: 456,
      priceLevel: 2,
      popularityScore: 78,
      thumbnailUrl: 'https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&q=80&w=600',
      pricingText: '$$',
      operationalHours: '11:00 AM - 10:00 PM',
      openNow: true,
      availabilityLabel: 'Open now',
      directionsUrl: 'https://www.google.com/maps/search/?api=1&query=restaurant',
      bookmarked: false,
    },
  ],
  featuredActivities: [
    {
      id: 'activity-1',
      name: 'Adventure Tour Experience',
      category: 'ACTIVITY',
      tags: ['outdoor', 'adventure', 'tour'],
      shortDescription: 'Guided tour through scenic landscapes and hidden gems',
      latitude: 16.0700,
      longitude: 108.2300,
      distanceKm: 5.3,
      rating: 4.9,
      reviewCount: 289,
      priceLevel: 3,
      popularityScore: 88,
      thumbnailUrl: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&q=80&w=600',
      pricingText: '$$$',
      operationalHours: '6:00 AM - 6:00 PM',
      openNow: true,
      availabilityLabel: 'Open now',
      directionsUrl: 'https://www.google.com/maps/search/?api=1&query=adventure',
      bookmarked: false,
    },
  ],
  lastBrowseItems: [],
  lastBrowseQuery: '',
  lastBrowseCategory: 'ALL',
  lastSuggestions: [],
});

let started = false;
let online = true;
let syncing = false;
let queueLoaded = false;
let lastSyncAt: number | null = null;
let lastError: string | null = null;
let queue: SyncOperation[] = [];
let netInfoUnsubscribe: (() => void) | null = null;
let syncPoller: ReturnType<typeof setInterval> | null = null;
const statusListeners = new Set<(status: SyncStatus) => void>();

const parseJson = <T>(raw: string | null): T | null => {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const readStorage = async <T>(key: string): Promise<T | null> => {
  try {
    const raw = await asyncStorage.getItem(key);
    return parseJson<T>(raw);
  } catch {
    return null;
  }
};

const writeStorage = async (key: string, value: unknown): Promise<void> => {
  try {
    await asyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage write failure to avoid blocking UI flow.
  }
};

const isOnlineFromState = (state: NetInfoStateLike): boolean =>
  state.isConnected === true && state.isInternetReachable !== false;

export const isLikelyOfflineError = (error: unknown): boolean => {
  const message = String((error as { message?: string } | null)?.message || error || '').toLowerCase();
  return (
    message.includes('network request failed') ||
    message.includes('failed to fetch') ||
    message.includes('network is unreachable') ||
    message.includes('offline') ||
    message.includes('internet connection')
  );
};

const getStatusSnapshot = (): SyncStatus => ({
  isOnline: online,
  pendingCount: queue.length,
  syncing,
  lastSyncAt,
  lastError,
});

const emitStatus = () => {
  const snapshot = getStatusSnapshot();
  statusListeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      // Listener failure should not break sync engine.
    }
  });
};

export const getSyncStatus = (): SyncStatus => getStatusSnapshot();

export const subscribeSyncStatus = (listener: (status: SyncStatus) => void) => {
  statusListeners.add(listener);
  listener(getStatusSnapshot());
  return () => {
    statusListeners.delete(listener);
  };
};

const loadQueue = async () => {
  if (queueLoaded) return;
  const storedQueue = await readStorage<SyncOperation[]>(STORAGE_KEYS.syncQueue);
  queue = Array.isArray(storedQueue) ? storedQueue : [];
  queueLoaded = true;
  emitStatus();
};

const persistQueue = async () => {
  await writeStorage(STORAGE_KEYS.syncQueue, queue);
  emitStatus();
};

const createOperationId = (): string => `${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;

const collapseQueue = (existing: SyncOperation[], incoming: SyncOperation): SyncOperation[] => {
  if (incoming.type === 'USER_PROFILE_UPDATE') {
    return [...existing.filter((item) => item.type !== 'USER_PROFILE_UPDATE'), incoming];
  }

  if (incoming.type === 'USER_PREFERENCES_UPDATE') {
    return [...existing.filter((item) => item.type !== 'USER_PREFERENCES_UPDATE'), incoming];
  }

  if (incoming.type === 'EVENT_BOOKMARK_TOGGLE') {
    const idx = existing.findIndex(
      (item) => item.type === 'EVENT_BOOKMARK_TOGGLE' && item.eventId === incoming.eventId
    );
    if (idx >= 0) {
      return existing.filter((_, itemIdx) => itemIdx !== idx);
    }
    return [...existing, incoming];
  }

  const discoveryIdx = existing.findIndex(
    (item) =>
      (item.type === 'DISCOVERY_BOOKMARK_ADD' || item.type === 'DISCOVERY_BOOKMARK_REMOVE') &&
      item.placeId === incoming.placeId
  );

  if (discoveryIdx >= 0) {
    const matched = existing[discoveryIdx];
    if (matched.type === incoming.type) {
      return existing;
    }
    return existing.filter((_, itemIdx) => itemIdx !== discoveryIdx);
  }

  return [...existing, incoming];
};

const executeOperation = async (operation: SyncOperation) => {
  if (operation.type === 'DISCOVERY_BOOKMARK_ADD') {
    await discoveryApi.addBookmark(operation.placeId);
    return;
  }
  if (operation.type === 'DISCOVERY_BOOKMARK_REMOVE') {
    await discoveryApi.removeBookmark(operation.placeId);
    return;
  }
  if (operation.type === 'EVENT_BOOKMARK_TOGGLE') {
    await eventApi.toggleBookmark(operation.eventId);
    return;
  }
  if (operation.type === 'USER_PROFILE_UPDATE') {
    await userApi.updateProfile(operation.payload);
    return;
  }
  await userApi.updatePreferences(operation.payload);
};

export const flushSyncQueue = async () => {
  await loadQueue();
  if (syncing || !online || queue.length === 0) {
    emitStatus();
    return;
  }

  syncing = true;
  emitStatus();

  try {
    while (online && queue.length > 0) {
      const operation = queue[0];
      try {
        await executeOperation(operation);
        queue.shift();
        lastSyncAt = Date.now();
        lastError = null;
        await persistQueue();
      } catch (error: unknown) {
        if (isLikelyOfflineError(error)) {
          lastError = String((error as { message?: string } | null)?.message || 'Network unavailable');
          break;
        }

        // Drop invalid operations to avoid blocking the rest of the queue.
        queue.shift();
        lastError = String((error as { message?: string } | null)?.message || 'Sync operation dropped');
        await persistQueue();
      }
    }
  } finally {
    syncing = false;
    emitStatus();
  }
};

export const enqueueSyncOperation = async (input: SyncOperationInput) => {
  await loadQueue();
  const operation: SyncOperation = {
    ...input,
    id: createOperationId(),
    createdAt: Date.now(),
  } as SyncOperation;
  queue = collapseQueue(queue, operation);
  await persistQueue();
  if (online) {
    void flushSyncQueue();
  }
  return queue.length;
};

export const startOfflineSync = () => {
  if (started) return;
  started = true;

  void (async () => {
    await loadQueue();
    try {
      const state = await netInfo.fetch();
      online = isOnlineFromState(state);
    } catch {
      online = true;
    }
    emitStatus();
    if (online) {
      void flushSyncQueue();
    }
  })();

  netInfoUnsubscribe = netInfo.addEventListener((state) => {
    const nextOnline = isOnlineFromState(state);
    const changed = nextOnline !== online;
    online = nextOnline;
    emitStatus();
    if (changed && nextOnline) {
      void flushSyncQueue();
    }
  });

  if (!hasNetInfoModule) {
    syncPoller = setInterval(() => {
      void (async () => {
        try {
          const state = await netInfo.fetch();
          online = isOnlineFromState(state);
          emitStatus();
        } catch {
          // Keep last known status.
        }
        if (queue.length > 0) {
          void flushSyncQueue();
        }
      })();
    }, 15000);
  }
};

export const stopOfflineSync = () => {
  if (netInfoUnsubscribe) {
    netInfoUnsubscribe();
    netInfoUnsubscribe = null;
  }
  if (syncPoller) {
    clearInterval(syncPoller);
    syncPoller = null;
  }
  started = false;
};

export const loadDiscoverySnapshot = async (): Promise<DiscoveryCacheSnapshot | null> => {
  return readStorage<DiscoveryCacheSnapshot>(STORAGE_KEYS.discovery);
};

export const cacheDiscoverySnapshot = async (
  update: Partial<Omit<DiscoveryCacheSnapshot, 'updatedAt'>>
): Promise<void> => {
  const current = (await loadDiscoverySnapshot()) || defaultDiscoveryCache();
  const next: DiscoveryCacheSnapshot = {
    ...current,
    ...update,
    updatedAt: Date.now(),
  };
  await writeStorage(STORAGE_KEYS.discovery, next);
};

export const loadEventsSnapshot = async (): Promise<EventCacheSnapshot | null> => {
  return readStorage<EventCacheSnapshot>(STORAGE_KEYS.events);
};

export const cacheEventsSnapshot = async (
  snapshot: Omit<EventCacheSnapshot, 'updatedAt'>
): Promise<void> => {
  await writeStorage(STORAGE_KEYS.events, {
    ...snapshot,
    updatedAt: Date.now(),
  });
};

export const loadProfileSnapshot = async (): Promise<ProfileCacheSnapshot | null> => {
  return readStorage<ProfileCacheSnapshot>(STORAGE_KEYS.profile);
};

export const cacheProfileSnapshot = async (
  profile: UserProfile,
  preferences: UserPreferences
): Promise<void> => {
  await writeStorage(STORAGE_KEYS.profile, {
    updatedAt: Date.now(),
    profile,
    preferences,
  } satisfies ProfileCacheSnapshot);
};

export const loadLocationSnapshot = async (): Promise<LocationCacheSnapshot | null> => {
  return readStorage<LocationCacheSnapshot>(STORAGE_KEYS.location);
};

export const cacheLocationSnapshot = async (
  snapshot: Omit<LocationCacheSnapshot, 'updatedAt'>
): Promise<void> => {
  await writeStorage(STORAGE_KEYS.location, {
    ...snapshot,
    updatedAt: Date.now(),
  });
};

const searchKeyByScope = (scope: 'discovery' | 'events'): string =>
  scope === 'discovery' ? STORAGE_KEYS.recentDiscoverySearches : STORAGE_KEYS.recentEventSearches;

export const loadRecentSearches = async (scope: 'discovery' | 'events'): Promise<string[]> => {
  const stored = await readStorage<string[]>(searchKeyByScope(scope));
  if (!Array.isArray(stored)) return [];
  return stored.filter((value) => typeof value === 'string' && value.trim().length > 0);
};

export const recordRecentSearch = async (
  scope: 'discovery' | 'events',
  rawSearchTerm: string
): Promise<string[]> => {
  const term = rawSearchTerm.trim();
  if (!term) {
    return loadRecentSearches(scope);
  }

  const existing = await loadRecentSearches(scope);
  const deduped = existing.filter((item) => item.toLowerCase() !== term.toLowerCase());
  const next = [term, ...deduped].slice(0, 10);
  await writeStorage(searchKeyByScope(scope), next);
  return next;
};
