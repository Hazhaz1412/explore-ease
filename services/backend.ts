const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.51:8082').replace(/\/+$/, '');
export const apiBaseUrl = API_URL;

export type AuthUser = {
  id: number;
  username: string;
  email: string;
  isActive: boolean;
  isSuperuser?: boolean;
  isStaff?: boolean;
};

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user: AuthUser;
};

export type Interest = 'FOOD' | 'CULTURE' | 'SHOPPING' | 'NATURE' | 'ADVENTURE';
export type TravelStyle = 'solo' | 'family' | 'group';

export type UserProfile = {
  firstName?: string | null;
  lastName?: string | null;
  age?: number | null;
  gender?: string | null;
  travelStyle?: string | null;
  profilePictureUrl?: string | null;
  interests?: Interest[] | null;
  bio?: string | null;
};

export type UserPreferences = {
  emailNotifications: boolean;
  pushNotifications: boolean;
  smsNotifications: boolean;
  profileVisibility: boolean;
  language: string;
  timezone: string;
  darkMode: boolean;
};

export type LocationSnapshot = {
  latitude: number;
  longitude: number;
  locationName?: string | null;
  manualOverride?: boolean;
  updatedAt?: string;
};

export type NearbyPlace = {
  id: string;
  name: string;
  type: string;
  category: string;
  address?: string | null;
  latitude: number;
  longitude: number;
  distanceKm: number;
  recommendationScore: number;
  navigationUrl: string;
};

export type LocationDiscovery = {
  referenceLocation: LocationSnapshot;
  radiusKm: number;
  pointsOfInterest: NearbyPlace[];
  events: NearbyPlace[];
  recommendations: NearbyPlace[];
};

export type LocationRoute = {
  fromLatitude: number;
  fromLongitude: number;
  toLatitude: number;
  toLongitude: number;
  distanceKm: number;
  estimatedMinutes: number;
  travelMode: 'walking' | 'driving' | 'bicycling' | string;
  googleMapsUrl: string;
  mapboxDirectionsUrl: string;
};

type RequestOptions = {
  auth?: boolean;
  retryOnUnauthorized?: boolean;
};

let activeSession: AuthSession | null = null;
let refreshingPromise: Promise<boolean> | null = null;

const getErrorMessage = async (response: Response): Promise<string> => {
  try {
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      const payload = await response.json();
      return payload?.message || payload?.error || `Request failed (${response.status})`;
    }
    const text = await response.text();
    return text || `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
};

const parsePayload = async <T>(response: Response): Promise<T> => {
  const contentType = response.headers.get('content-type');
  if (contentType?.includes('application/json')) {
    return response.json();
  }
  return (await response.text()) as T;
};

const normalizeSession = (payload: any): AuthSession => ({
  accessToken: payload.access_token || payload.accessToken,
  refreshToken: payload.refresh_token || payload.refreshToken,
  user: payload.user,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isTransientNetworkError = (error: unknown) => {
  const message = String((error as { message?: string } | null)?.message || error || '').toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('network request failed') ||
    message.includes('load failed') ||
    message.includes('cors request did not succeed')
  );
};

const fetchWithRetry = async (
  url: string,
  init: RequestInit,
  maxRetries = 2
): Promise<Response> => {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    try {
      return await fetch(url, init);
    } catch (error) {
      lastError = error;
      if (!isTransientNetworkError(error) || attempt === maxRetries) {
        throw error;
      }
      await sleep(250 * (attempt + 1));
    }
  }
  throw lastError;
};

const request = async <T>(
  path: string,
  init: RequestInit = {},
  options: RequestOptions = {}
): Promise<T> => {
  const { auth = false, retryOnUnauthorized = true } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };

  if (auth && activeSession?.accessToken) {
    headers.Authorization = `Bearer ${activeSession.accessToken}`;
  }

  const response = await fetchWithRetry(`${API_URL}${path}`, {
    ...init,
    headers,
  });

  if (response.status === 401 && auth && retryOnUnauthorized && activeSession?.refreshToken) {
    const refreshed = await refreshSessionToken();
    if (refreshed) {
      return request<T>(path, init, { auth, retryOnUnauthorized: false });
    }
  }

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  return parsePayload<T>(response);
};

const refreshSessionToken = async (): Promise<boolean> => {
  if (!activeSession?.refreshToken) {
    return false;
  }

  if (refreshingPromise) {
    return refreshingPromise;
  }

  refreshingPromise = (async () => {
    const response = await fetchWithRetry(`${API_URL}/api/auth/refresh-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: activeSession?.refreshToken }),
    });

    if (!response.ok) {
      activeSession = null;
      return false;
    }

    const payload = await response.json();
    activeSession = normalizeSession(payload);
    persistSession(activeSession);
    return true;
  })();

  try {
    return await refreshingPromise;
  } finally {
    refreshingPromise = null;
  }
};

const SESSION_KEY = 'exploreease.session.v1';

// Synchronous restore from localStorage for web (available immediately)
const restoreSessionSync = (): AuthSession | null => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(SESSION_KEY);
      if (raw) return JSON.parse(raw) as AuthSession;
    }
  } catch {}
  return null;
};

const persistSession = (session: AuthSession | null) => {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      if (session) {
        window.localStorage.setItem(SESSION_KEY, JSON.stringify(session));
      } else {
        window.localStorage.removeItem(SESSION_KEY);
      }
    }
  } catch {}

  // Also try AsyncStorage for mobile
  try {
    const asyncStorageModule = require('@react-native-async-storage/async-storage');
    const storage = asyncStorageModule?.default || asyncStorageModule;
    if (storage) {
      if (session) {
        storage.setItem(SESSION_KEY, JSON.stringify(session));
      } else {
        storage.removeItem(SESSION_KEY);
      }
    }
  } catch {}
};

// Try restoring session immediately on module load
activeSession = restoreSessionSync();

export const sessionStore = {
  get() {
    return activeSession;
  },
  set(session: AuthSession | null) {
    activeSession = session;
    persistSession(session);
  },
  clear() {
    activeSession = null;
    persistSession(null);
  },
  /** Async restore for mobile (AsyncStorage) — call from App.tsx on mount */
  async restoreAsync(): Promise<boolean> {
    if (activeSession) return true;
    try {
      const asyncStorageModule = require('@react-native-async-storage/async-storage');
      const storage = asyncStorageModule?.default || asyncStorageModule;
      if (storage) {
        const raw = await storage.getItem(SESSION_KEY);
        if (raw) {
          activeSession = JSON.parse(raw) as AuthSession;
          return true;
        }
      }
    } catch {}
    return false;
  },
};

export const authApi = {
  async register(input: { username?: string; email: string; password: string }) {
    return request<AuthUser>(
      '/api/auth/register',
      { method: 'POST', body: JSON.stringify(input) },
      { auth: false }
    );
  },

  async verifyOtp(input: { email: string; otp: string }) {
    return request<{ message: string }>(
      '/api/auth/verify-otp',
      { method: 'POST', body: JSON.stringify(input) },
      { auth: false }
    );
  },

  async resendVerificationOtp(email: string) {
    return request<{ message: string }>(
      '/api/auth/resend-verification-otp',
      { method: 'POST', body: JSON.stringify({ email }) },
      { auth: false }
    );
  },

  async forgotPassword(email: string) {
    return request<{ message: string }>(
      '/api/auth/forgot-password',
      { method: 'POST', body: JSON.stringify({ email }) },
      { auth: false }
    );
  },

  async resetPassword(input: { email: string; otp: string; newPassword: string }) {
    return request<{ message: string }>(
      '/api/auth/reset-password',
      { method: 'POST', body: JSON.stringify(input) },
      { auth: false }
    );
  },

  async login(input: { email?: string; username?: string; password: string }) {
    const payload = await request<any>(
      '/api/auth/login',
      { method: 'POST', body: JSON.stringify(input) },
      { auth: false }
    );
    const session = normalizeSession(payload);
    sessionStore.set(session);
    return session;
  },

  async loginWithGoogle(idToken: string) {
    const payload = await request<any>(
      '/api/auth/google',
      { method: 'POST', body: JSON.stringify({ idToken }) },
      { auth: false }
    );
    const session = normalizeSession(payload);
    sessionStore.set(session);
    return session;
  },

  async isGoogleLinked() {
    return request<boolean>('/api/auth/google/linked', { method: 'GET' }, { auth: true });
  },

  async disconnectGoogle() {
    return request<string>(
      '/api/auth/google/disconnect',
      { method: 'POST' },
      { auth: true }
    );
  },

  async logout() {
    if (!sessionStore.get()) {
      return;
    }
    await request<string>(
      '/api/auth/logout',
      { method: 'POST' },
      { auth: true, retryOnUnauthorized: false }
    );
    sessionStore.clear();
  },
};

export const userApi = {
  async getProfile() {
    return request<UserProfile>('/api/user/profile', { method: 'GET' }, { auth: true });
  },

  async updateProfile(profile: Record<string, unknown>) {
    return request<UserProfile>(
      '/api/user/profile',
      { method: 'PUT', body: JSON.stringify(profile) },
      { auth: true }
    );
  },

  async uploadProfilePicture(input: { uri?: string; file?: File; name?: string; type?: string }) {
    const formData = new FormData();
    if (input.file) {
      formData.append('file', input.file);
    } else if (input.uri) {
      formData.append('file', {
        uri: input.uri,
        name: input.name || `profile-${Date.now()}.jpg`,
        type: input.type || 'image/jpeg',
      } as any);
    } else {
      throw new Error('Missing file to upload');
    }

    const send = async (retryOnUnauthorized: boolean): Promise<UserProfile> => {
      const headers: Record<string, string> = {};
      if (activeSession?.accessToken) {
        headers.Authorization = `Bearer ${activeSession.accessToken}`;
      }

      const response = await fetchWithRetry(`${API_URL}/api/user/profile/picture`, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (response.status === 401 && retryOnUnauthorized && activeSession?.refreshToken) {
        const refreshed = await refreshSessionToken();
        if (refreshed) {
          return send(false);
        }
      }

      if (!response.ok) {
        throw new Error(await getErrorMessage(response));
      }

      return parsePayload<UserProfile>(response);
    };

    return send(true);
  },

  async getPreferences() {
    return request<UserPreferences>('/api/user/preferences', { method: 'GET' }, { auth: true });
  },

  async updatePreferences(preferences: Partial<UserPreferences>) {
    return request<UserPreferences>(
      '/api/user/preferences',
      { method: 'PUT', body: JSON.stringify(preferences) },
      { auth: true }
    );
  },
};

export const privacyApi = {
  async exportData() {
    return request<any>('/api/gdpr/export', { method: 'GET' }, { auth: true });
  },

  async getActivityLogs(limit = 50) {
    return request<any>(`/api/gdpr/activity-logs?limit=${limit}`, { method: 'GET' }, { auth: true });
  },

  async deleteAccount(type: 'soft' | 'hard') {
    return request<string>(
      `/api/gdpr/delete-account?type=${type}`,
      { method: 'DELETE' },
      { auth: true }
    );
  },
};

const buildQuery = (params: Record<string, string | number | boolean | undefined | null>) => {
  const query = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');
  return query ? `?${query}` : '';
};

export const locationApi = {
  async updateRealtimeLocation(input: { latitude: number; longitude: number; locationName?: string }) {
    return request<LocationSnapshot>(
      '/api/location/realtime',
      { method: 'POST', body: JSON.stringify(input) },
      { auth: true }
    );
  },

  async updateManualLocation(input: { latitude: number; longitude: number; locationName?: string }) {
    return request<LocationSnapshot>(
      '/api/location/manual-override',
      { method: 'POST', body: JSON.stringify(input) },
      { auth: true }
    );
  },

  async getCurrentLocation() {
    return request<LocationSnapshot>('/api/location/current', { method: 'GET' }, { auth: true });
  },

  async getLocationHistory(limit = 20) {
    return request<LocationSnapshot[]>(
      `/api/location/history${buildQuery({ limit })}`,
      { method: 'GET' },
      { auth: true }
    );
  },

  async discoverNearby(input: { latitude?: number; longitude?: number; radiusKm?: number } = {}) {
    const query = buildQuery({
      latitude: input.latitude,
      longitude: input.longitude,
      radiusKm: input.radiusKm ?? 8,
    });
    return request<LocationDiscovery>(`/api/location/discover${query}`, { method: 'GET' }, { auth: true });
  },

  async getRoute(input: {
    toLatitude: number;
    toLongitude: number;
    fromLatitude?: number;
    fromLongitude?: number;
    mode?: 'walking' | 'driving' | 'bicycling';
  }) {
    const query = buildQuery({
      fromLatitude: input.fromLatitude,
      fromLongitude: input.fromLongitude,
      toLatitude: input.toLatitude,
      toLongitude: input.toLongitude,
      mode: input.mode || 'walking',
    });
    return request<LocationRoute>(`/api/location/route${query}`, { method: 'GET' }, { auth: true });
  },
};

// ─── Discovery Module Types ──────────────────────────────────────────────────

export type DiscoveryCategory = 'ALL' | 'ATTRACTION' | 'CUISINE' | 'ACTIVITY';
export type DiscoverySortBy = 'RELEVANCE' | 'TOP_RATED' | 'AZ';

export type DiscoveryItem = {
  id: string;
  name: string;
  category: DiscoveryCategory;
  tags: string[];
  shortDescription: string;
  latitude: number;
  longitude: number;
  distanceKm: number;
  rating: number;
  reviewCount: number;
  priceLevel: number;
  popularityScore: number;
  thumbnailUrl: string | null;
  pricingText: string;
  operationalHours: string | null;
  openNow: boolean | null;
  availabilityLabel: string;
  directionsUrl: string;
  bookmarked: boolean;
};

export type DiscoveryBrowseResponse = {
  query: string;
  category: string;
  minRating: number;
  maxPriceLevel: number;
  minPopularity: number;
  maxDistanceKm: number;
  sortBy: string;
  referenceLatitude: number;
  referenceLongitude: number;
  autocompleteSuggestions: string[];
  items: DiscoveryItem[];
  personalizationTimeBucket?: string;
  personalizationWeather?: string;
  personalizationSeason?: string;
  personalizationReasons?: string[];
  personalizationInterests?: string[];
  page: number;
  totalItems: number;
  totalPages: number;
  hasNext: boolean;
};

export type DiscoveryDetailResponse = {
  item: DiscoveryItem;
  longDescription: string;
  imageUrls: string[];
};

export const discoveryApi = {
  async browse(input: {
    query?: string;
    category?: DiscoveryCategory;
    minRating?: number;
    maxPriceLevel?: number;
    minPopularity?: number;
    maxDistanceKm?: number;
    sort?: DiscoverySortBy;
    latitude?: number;
    longitude?: number;
    limit?: number;
    page?: number;
  }) {
    const query = buildQuery({
      query: input.query,
      category: input.category,
      minRating: input.minRating,
      maxPriceLevel: input.maxPriceLevel,
      minPopularity: input.minPopularity,
      maxDistanceKm: input.maxDistanceKm,
      sort: input.sort,
      latitude: input.latitude,
      longitude: input.longitude,
      limit: input.limit,
      page: input.page,
    });
    return request<DiscoveryBrowseResponse>(
      `/api/discovery/browse${query}`,
      { method: 'GET' },
      { auth: true }
    );
  },

  async suggestions(query: string, limit = 6) {
    const q = buildQuery({ query, limit });
    return request<string[]>(`/api/discovery/suggestions${q}`, { method: 'GET' }, { auth: true });
  },

  async getDetail(placeId: string, coords?: { latitude?: number; longitude?: number }) {
    const query = buildQuery({
      latitude: coords?.latitude,
      longitude: coords?.longitude,
    });
    return request<DiscoveryDetailResponse>(
      `/api/discovery/detail/${encodeURIComponent(placeId)}${query}`,
      { method: 'GET' },
      { auth: true }
    );
  },

  async getBookmarks(coords?: { latitude?: number; longitude?: number }) {
    const query = buildQuery({
      latitude: coords?.latitude,
      longitude: coords?.longitude,
    });
    return request<DiscoveryItem[]>(`/api/discovery/bookmarks${query}`, { method: 'GET' }, { auth: true });
  },

  async addBookmark(placeId: string) {
    return request<string>(
      `/api/discovery/bookmarks/${encodeURIComponent(placeId)}`,
      { method: 'POST' },
      { auth: true }
    );
  },

  async removeBookmark(placeId: string) {
    return request<string>(
      `/api/discovery/bookmarks/${encodeURIComponent(placeId)}`,
      { method: 'DELETE' },
      { auth: true }
    );
  },
};

// ─── Event Management Types ──────────────────────────────────────────────────

export type EventType = 'FOOD' | 'CULTURE' | 'NATURE' | 'SPORTS' | 'ADVENTURE' | 'MUSIC' | 'MARKET' | 'WORKSHOP' | 'SOCIAL' | 'OTHER';
export type EventStatus = 'INCOMING' | 'ONGOING' | 'COMPLETED';
export type EventModerationStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type EventItem = {
  id: number;
  title: string;
  description: string | null;
  eventType: EventType;
  status: EventStatus;
  moderationStatus: EventModerationStatus;
  moderationReason: string | null;
  isFree: boolean;
  price: number | null;
  currency: string;
  startDate: string;
  endDate: string;
  latitude: number | null;
  longitude: number | null;
  locationName: string | null;
  maxAttendees: number | null;
  currentAttendees: number;
  imageUrl: string | null;
  organizerUsername: string;
  organizerId: number;
  reportCount: number;
  bookmarked: boolean;
  countdownSeconds: number | null;
  createdAt: string;
};

export type EventListResponse = {
  events: EventItem[];
  total: number;
  filterStatus: string | null;
  filterType: string | null;
  searchQuery: string | null;
  page: number;
  size: number;
  totalPages: number;
  hasNext: boolean;
};

export type CreateEventInput = {
  title: string;
  description?: string;
  eventType: EventType;
  isFree?: boolean;
  price?: number;
  currency?: string;
  startDate: string;
  endDate: string;
  latitude?: number;
  longitude?: number;
  locationName?: string;
  maxAttendees?: number;
  imageUrl?: string;
};

export const eventApi = {
  async list(input: {
    status?: EventStatus | 'ALL';
    eventType?: EventType | 'ALL';
    isFree?: boolean;
    search?: string;
    latitude?: number;
    longitude?: number;
    maxDistanceKm?: number;
    page?: number;
    size?: number;
  } = {}) {
    const query = buildQuery({
      status: input.status,
      eventType: input.eventType,
      isFree: input.isFree != null ? String(input.isFree) : undefined,
      search: input.search,
      latitude: input.latitude,
      longitude: input.longitude,
      maxDistanceKm: input.maxDistanceKm,
      page: input.page,
      size: input.size,
    });
    return request<EventListResponse>(`/api/events${query}`, { method: 'GET' }, { auth: true });
  },

  async get(eventId: number) {
    return request<EventItem>(`/api/events/${eventId}`, { method: 'GET' }, { auth: true });
  },

  async create(input: CreateEventInput) {
    return request<EventItem>(
      '/api/events',
      { method: 'POST', body: JSON.stringify(input) },
      { auth: true }
    );
  },

  async update(eventId: number, input: Partial<CreateEventInput>) {
    return request<EventItem>(
      `/api/events/${eventId}`,
      { method: 'PUT', body: JSON.stringify(input) },
      { auth: true }
    );
  },

  async remove(eventId: number) {
    return request<{ message: string }>(
      `/api/events/${eventId}`,
      { method: 'DELETE' },
      { auth: true }
    );
  },

  async join(eventId: number) {
    return request<EventItem>(
      `/api/events/${eventId}/join`,
      { method: 'POST' },
      { auth: true }
    );
  },

  async leave(eventId: number) {
    return request<EventItem>(
      `/api/events/${eventId}/leave`,
      { method: 'POST' },
      { auth: true }
    );
  },

  async getBookmarks() {
    return request<EventItem[]>('/api/events/bookmarks', { method: 'GET' }, { auth: true });
  },

  async toggleBookmark(eventId: number) {
    return request<{ bookmarked: boolean }>(
      `/api/events/${eventId}/bookmark`,
      { method: 'POST' },
      { auth: true }
    );
  },

  async report(eventId: number, input: { reason: string; details?: string }) {
    return request<{ message: string }>(
      `/api/events/${eventId}/report`,
      { method: 'POST', body: JSON.stringify(input) },
      { auth: true }
    );
  },

  async getMyEvents() {
    return request<EventItem[]>('/api/events/my-events', { method: 'GET' }, { auth: true });
  },
};

// ─── Notification Types ──────────────────────────────────────────────────────

export type NotificationCategory = 'OFFERS' | 'ALERTS' | 'MESSAGES';
export type NotificationType =
  | 'NEARBY_ALERT'
  | 'SAVED_ITEM_UPDATE'
  | 'EVENT_COUNTDOWN'
  | 'REMINDER'
  | 'ANNOUNCEMENT';

export type NotificationItem = {
  id: number;
  title: string;
  message: string;
  category: NotificationCategory;
  type: NotificationType;
  referenceType?: string | null;
  referenceId?: string | null;
  isRead: boolean;
  createdAt: string;
  readAt?: string | null;
};

export type NotificationListResponse = {
  notifications: NotificationItem[];
  page: number;
  size: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  unreadCount: number;
  unreadOffers: number;
  unreadAlerts: number;
  unreadMessages: number;
};

export type NotificationUnreadCount = {
  unreadCount: number;
  unreadOffers: number;
  unreadAlerts: number;
  unreadMessages: number;
};

export type CreateAnnouncementInput = {
  title: string;
  message: string;
  category?: NotificationCategory;
  targetUserIds?: number[];
};

export const notificationApi = {
  async list(input: {
    category?: NotificationCategory | 'ALL';
    unreadOnly?: boolean;
    page?: number;
    size?: number;
  } = {}) {
    const query = buildQuery({
      category: input.category,
      unreadOnly: input.unreadOnly,
      page: input.page,
      size: input.size,
    });
    return request<NotificationListResponse>(
      `/api/notifications${query}`,
      { method: 'GET' },
      { auth: true }
    );
  },

  async getUnreadCount() {
    return request<NotificationUnreadCount>('/api/notifications/unread-count', { method: 'GET' }, { auth: true });
  },

  async markRead(notificationId: number) {
    return request<NotificationItem>(
      `/api/notifications/${notificationId}/read`,
      { method: 'PATCH' },
      { auth: true }
    );
  },

  async markAllRead() {
    return request<{ message: string }>(
      '/api/notifications/read-all',
      { method: 'PATCH' },
      { auth: true }
    );
  },

  async remove(notificationId: number) {
    return request<{ message: string }>(
      `/api/notifications/${notificationId}`,
      { method: 'DELETE' },
      { auth: true }
    );
  },

  async clearAll() {
    return request<{ message: string }>(
      '/api/notifications/clear-all',
      { method: 'DELETE' },
      { auth: true }
    );
  },

  async registerDevice(input: { deviceToken: string; platform: string }) {
    return request<{ message: string }>(
      '/api/notifications/devices/register',
      { method: 'POST', body: JSON.stringify(input) },
      { auth: true }
    );
  },

  async unregisterDevice(deviceToken: string) {
    return request<{ message: string }>(
      `/api/notifications/devices/${encodeURIComponent(deviceToken)}`,
      { method: 'DELETE' },
      { auth: true }
    );
  },

  async sendAnnouncement(input: CreateAnnouncementInput) {
    return request<{ message: string }>(
      '/api/notifications/announcements',
      { method: 'POST', body: JSON.stringify(input) },
      { auth: true }
    );
  },
};

// ─── Review / Community Types ────────────────────────────────────────────────

export type ReviewTargetType = 'PLACE' | 'EVENT' | 'ATTRACTION' | 'CUISINE' | 'ACTIVITY';
export type ReviewSortBy = 'NEWEST' | 'TOP_RATED' | 'MOST_HELPFUL';
export type ReviewModerationStatus = 'APPROVED' | 'FLAGGED';

export type RatingBar = {
  stars: number;
  count: number;
  percentage: number;
};

export type ReviewSummary = {
  totalReviews: number;
  averageRating: number;
  ratingBars: RatingBar[];
};

export type ReviewItem = {
  id: number;
  targetType: ReviewTargetType;
  targetId: string;
  targetName: string;
  rating: number;
  comment: string;
  photoUrl?: string | null;
  authorUsername: string;
  authorId: number;
  authorProfilePictureUrl?: string | null;
  helpfulCount: number;
  helpfulByCurrentUser: boolean;
  flagCount: number;
  moderationStatus: ReviewModerationStatus;
  ownerReply?: string | null;
  ownerReplyAuthor?: string | null;
  ownerReplyAuthorId?: number | null;
  ownerReplyAt?: string | null;
  canReply?: boolean;
  canModerate?: boolean;
  reportReasons?: string[] | null;
  createdAt: string;
  updatedAt: string;
};

export type ReviewListResponse = {
  reviews: ReviewItem[];
  summary?: ReviewSummary | null;
  total: number;
  page: number;
  size: number;
  totalPages: number;
  hasNext: boolean;
};

export type CreateReviewInput = {
  targetType: ReviewTargetType;
  targetId: string;
  targetName: string;
  rating: number;
  comment: string;
  photoUrl?: string;
};

export type ReviewHelpfulResponse = {
  reviewId: number;
  helpfulCount: number;
  helpfulByCurrentUser: boolean;
};

export const reviewApi = {
  async list(input: {
    targetType?: ReviewTargetType;
    targetId?: string;
    search?: string;
    sortBy?: ReviewSortBy;
    page?: number;
    size?: number;
  } = {}) {
    const query = buildQuery({
      targetType: input.targetType,
      targetId: input.targetId,
      search: input.search,
      sortBy: input.sortBy,
      page: input.page,
      size: input.size,
    });
    return request<ReviewListResponse>(`/api/reviews${query}`, { method: 'GET' }, { auth: true });
  },

  async myReviews(page = 0, size = 10) {
    const query = buildQuery({ page, size });
    return request<ReviewListResponse>(`/api/reviews/my-reviews${query}`, { method: 'GET' }, { auth: true });
  },

  async create(input: CreateReviewInput) {
    return request<ReviewItem>(
      '/api/reviews',
      { method: 'POST', body: JSON.stringify(input) },
      { auth: true }
    );
  },

  async update(reviewId: number, input: Partial<CreateReviewInput>) {
    return request<ReviewItem>(
      `/api/reviews/${reviewId}`,
      { method: 'PUT', body: JSON.stringify(input) },
      { auth: true }
    );
  },

  async remove(reviewId: number) {
    return request<{ message: string }>(
      `/api/reviews/${reviewId}`,
      { method: 'DELETE' },
      { auth: true }
    );
  },

  async reply(reviewId: number, reply: string) {
    return request<ReviewItem>(
      `/api/reviews/${reviewId}/reply`,
      { method: 'POST', body: JSON.stringify({ reply }) },
      { auth: true }
    );
  },

  async report(reviewId: number, input: { reason: string; details?: string }) {
    return request<{ message: string }>(
      `/api/reviews/${reviewId}/report`,
      { method: 'POST', body: JSON.stringify(input) },
      { auth: true }
    );
  },

  async toggleHelpful(reviewId: number) {
    return request<ReviewHelpfulResponse>(
      `/api/reviews/${reviewId}/helpful`,
      { method: 'POST' },
      { auth: true }
    );
  },

  async getFlagged(page = 0, size = 10) {
    const query = buildQuery({ page, size });
    return request<ReviewListResponse>(`/api/reviews/flagged${query}`, { method: 'GET' }, { auth: true });
  },

  async approveFlagged(reviewId: number) {
    return request<ReviewItem>(
      `/api/reviews/flagged/${reviewId}/approve`,
      { method: 'POST' },
      { auth: true }
    );
  },

  async removeFlagged(reviewId: number) {
    return request<{ message: string }>(
      `/api/reviews/flagged/${reviewId}`,
      { method: 'DELETE' },
      { auth: true }
    );
  },
};

// ─── Admin Dashboard Types ───────────────────────────────────────────────────

export type AdminUserProfile = {
  id: number;
  username: string;
  email: string;
  isActive: boolean;
  isSuperuser: boolean;
  isStaff: boolean;
  reportCount: number;
  dateJoined?: string | null;
  lastLogin?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  age?: number | null;
  gender?: string | null;
  travelStyle?: string | null;
  bio?: string | null;
  profilePictureUrl?: string | null;
};

export type AdminUserListResponse = {
  users: AdminUserProfile[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
  hasNext: boolean;
};

export type AdminReviewItem = {
  id: number;
  targetType: string;
  targetId: string;
  targetName?: string | null;
  rating: number;
  comment?: string | null;
  authorUsername?: string | null;
  authorId?: number | null;
  helpfulCount: number;
  flagCount: number;
  moderationStatus?: ReviewModerationStatus | string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type AdminReviewListResponse = {
  reviews: AdminReviewItem[];
  total: number;
  page: number;
  size: number;
  totalPages: number;
  hasNext: boolean;
};

export type AdminUserActivityItem = {
  userId: number;
  username?: string | null;
  email?: string | null;
  successfulLogins: number;
  reviewsCreated: number;
  eventsCreated: number;
};

export type AdminTopPlaceItem = {
  place: string;
  score: number;
};

export type AdminTrafficStatItem = {
  date: string;
  successfulLogins: number;
  eventsCreated: number;
  reviewsCreated: number;
};

export type AdminAnalytics = {
  totalUsers: number;
  activeUsersInWindow: number;
  totalEvents: number;
  pendingEvents: number;
  approvedEvents: number;
  rejectedEvents: number;
  totalReviews: number;
  flaggedReviews: number;
  totalDiscoveryBookmarks: number;
  totalEventBookmarks: number;
  totalLogins: number;
  successfulLoginsInWindow: number;
  windowDays: number;
  userActivity: AdminUserActivityItem[];
  topPlaces: AdminTopPlaceItem[];
  trafficStats: AdminTrafficStatItem[];
};

export const adminApi = {
  async listUsers(input: { search?: string; page?: number; size?: number } = {}) {
    const query = buildQuery({
      search: input.search,
      page: input.page,
      size: input.size,
    });
    return request<AdminUserListResponse>(`/api/admin/users${query}`, { method: 'GET' }, { auth: true });
  },

  async banUser(userId: number) {
    return request<AdminUserListResponse>(`/api/admin/users/${userId}/ban`, { method: 'POST' }, { auth: true });
  },

  async unbanUser(userId: number) {
    return request<AdminUserListResponse>(`/api/admin/users/${userId}/unban`, { method: 'POST' }, { auth: true });
  },

  async listEvents(input: {
    status?: EventStatus | 'ALL';
    eventType?: EventType | 'ALL';
    moderationStatus?: EventModerationStatus | 'ALL';
    isFree?: boolean;
    search?: string;
    page?: number;
    size?: number;
  } = {}) {
    const query = buildQuery({
      status: input.status,
      eventType: input.eventType,
      moderationStatus: input.moderationStatus,
      isFree: input.isFree != null ? String(input.isFree) : undefined,
      search: input.search,
      page: input.page,
      size: input.size,
    });
    return request<EventListResponse>(`/api/admin/events${query}`, { method: 'GET' }, { auth: true });
  },

  async approveEvent(eventId: number) {
    return request<EventItem>(
      `/api/admin/events/${eventId}/approve`,
      { method: 'POST' },
      { auth: true }
    );
  },

  async rejectEvent(eventId: number, reason: string) {
    return request<EventItem>(
      `/api/admin/events/${eventId}/reject`,
      { method: 'POST', body: JSON.stringify({ reason }) },
      { auth: true }
    );
  },

  async listReviews(input: { moderationStatus?: ReviewModerationStatus | 'ALL'; search?: string; page?: number; size?: number } = {}) {
    const query = buildQuery({
      moderationStatus: input.moderationStatus,
      search: input.search,
      page: input.page,
      size: input.size,
    });
    return request<AdminReviewListResponse>(`/api/admin/reviews${query}`, { method: 'GET' }, { auth: true });
  },

  async getFlaggedReviews(page = 0, size = 10) {
    const query = buildQuery({ page, size });
    return request<ReviewListResponse>(`/api/admin/reviews/flagged${query}`, { method: 'GET' }, { auth: true });
  },

  async approveFlaggedReview(reviewId: number) {
    return request<ReviewItem>(
      `/api/admin/reviews/${reviewId}/approve`,
      { method: 'POST' },
      { auth: true }
    );
  },

  async deleteFlaggedReview(reviewId: number) {
    return request<{ message: string }>(
      `/api/admin/reviews/${reviewId}`,
      { method: 'DELETE' },
      { auth: true }
    );
  },

  async analytics(windowDays = 14) {
    const query = buildQuery({ windowDays });
    return request<AdminAnalytics>(`/api/admin/analytics${query}`, { method: 'GET' }, { auth: true });
  },
};

// ─── Travel Planning Types ───────────────────────────────────────────────────

export type TravelPlanItemType = 'PLACE' | 'EVENT' | 'NOTE';
export type TravelMode = 'walking' | 'driving' | 'bicycling';

export type TravelPlanSummary = {
  id: number;
  title: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isPublic: boolean;
  itemCount: number;
  dayCount: number;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type TravelPlanItem = {
  id: number;
  dayNumber: number;
  sortOrder: number;
  itemType: TravelPlanItemType;
  referenceId?: string | null;
  title?: string | null;
  locationName?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  startTime?: string | null;
  endTime?: string | null;
  note?: string | null;
  reminderAt?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export type TravelPlanDetail = {
  id: number;
  title: string;
  description?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  isPublic: boolean;
  shareToken?: string | null;
  sharePath?: string | null;
  ownerUsername?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  items: TravelPlanItem[];
};

export type TravelPlanShare = {
  planId: number;
  shareToken: string;
  sharePath: string;
};

export type TravelRouteLeg = {
  fromTitle: string;
  toTitle: string;
  distanceKm: number;
  estimatedMinutes: number;
  googleMapsUrl: string;
  mapboxDirectionsUrl: string;
};

export type TravelRouteOptimization = {
  planId: number;
  dayNumber: number;
  mode: TravelMode;
  totalDistanceKm: number;
  estimatedMinutes: number;
  optimizedItems: TravelPlanItem[];
  legs: TravelRouteLeg[];
};

export type CreateTravelPlanInput = {
  title: string;
  description?: string;
  startDate?: string;
  endDate?: string;
};

export type UpdateTravelPlanInput = {
  title?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  isPublic?: boolean;
};

export type CreateTravelPlanItemInput = {
  dayNumber: number;
  itemType: TravelPlanItemType;
  referenceId?: string;
  title?: string;
  locationName?: string;
  latitude?: number;
  longitude?: number;
  startTime?: string;
  endTime?: string;
  note?: string;
  reminderAt?: string;
  sortOrder?: number;
};

export type UpdateTravelPlanItemInput = Partial<CreateTravelPlanItemInput>;

export const travelApi = {
  async listPlans() {
    return request<TravelPlanSummary[]>('/api/travel-plans', { method: 'GET' }, { auth: true });
  },

  async createPlan(input: CreateTravelPlanInput) {
    return request<TravelPlanDetail>(
      '/api/travel-plans',
      { method: 'POST', body: JSON.stringify(input) },
      { auth: true }
    );
  },

  async getPlan(planId: number) {
    return request<TravelPlanDetail>(`/api/travel-plans/${planId}`, { method: 'GET' }, { auth: true });
  },

  async updatePlan(planId: number, input: UpdateTravelPlanInput) {
    return request<TravelPlanDetail>(
      `/api/travel-plans/${planId}`,
      { method: 'PUT', body: JSON.stringify(input) },
      { auth: true }
    );
  },

  async deletePlan(planId: number) {
    return request<{ message: string }>(
      `/api/travel-plans/${planId}`,
      { method: 'DELETE' },
      { auth: true }
    );
  },

  async addItem(planId: number, input: CreateTravelPlanItemInput) {
    return request<TravelPlanItem>(
      `/api/travel-plans/${planId}/items`,
      { method: 'POST', body: JSON.stringify(input) },
      { auth: true }
    );
  },

  async updateItem(planId: number, itemId: number, input: UpdateTravelPlanItemInput) {
    return request<TravelPlanItem>(
      `/api/travel-plans/${planId}/items/${itemId}`,
      { method: 'PUT', body: JSON.stringify(input) },
      { auth: true }
    );
  },

  async deleteItem(planId: number, itemId: number) {
    return request<{ message: string }>(
      `/api/travel-plans/${planId}/items/${itemId}`,
      { method: 'DELETE' },
      { auth: true }
    );
  },

  async sharePlan(planId: number) {
    return request<TravelPlanShare>(
      `/api/travel-plans/${planId}/share`,
      { method: 'POST' },
      { auth: true }
    );
  },

  async getSharedPlan(shareToken: string) {
    return request<TravelPlanDetail>(
      `/api/travel-plans/shared/${encodeURIComponent(shareToken)}`,
      { method: 'GET' },
      { auth: false }
    );
  },

  async optimizeRoute(planId: number, input: { dayNumber: number; mode?: TravelMode; startLatitude?: number; startLongitude?: number }) {
    return request<TravelRouteOptimization>(
      `/api/travel-plans/${planId}/optimize-route`,
      { method: 'POST', body: JSON.stringify(input) },
      { auth: true }
    );
  },
};

// ─── Social Feature Types ────────────────────────────────────────────────────

export type UserPublicProfile = {
  id: number;
  username: string;
  profilePictureUrl: string | null;
  bio: string | null;
  followerCount: number;
  followingCount: number;
  followedByCurrentUser: boolean;
};

export type ActivityFeedItem = {
  id: number;
  actorId: number;
  actorUsername: string;
  actorProfilePictureUrl: string | null;
  actionType: string;
  targetType: string;
  targetId: string;
  targetName: string;
  metadata: string | null;
  createdAt: string;
};

export const socialApi = {
  async follow(userId: number) {
    return request<{ message: string }>(
      `/api/social/follow/${userId}`,
      { method: 'POST' },
      { auth: true }
    );
  },

  async unfollow(userId: number) {
    return request<{ message: string }>(
      `/api/social/follow/${userId}`,
      { method: 'DELETE' },
      { auth: true }
    );
  },

  async getFollowers(page = 0, size = 20) {
    const query = buildQuery({ page, size });
    return request<UserPublicProfile[]>(`/api/social/followers${query}`, { method: 'GET' }, { auth: true });
  },

  async getFollowing(page = 0, size = 20) {
    const query = buildQuery({ page, size });
    return request<UserPublicProfile[]>(`/api/social/following${query}`, { method: 'GET' }, { auth: true });
  },

  async searchUsers(query: string, limit = 10) {
    const q = buildQuery({ query, limit });
    return request<UserPublicProfile[]>(`/api/social/search${q}`, { method: 'GET' }, { auth: true });
  },

  async getUserProfile(userId: number) {
    return request<UserPublicProfile>(`/api/social/user/${userId}`, { method: 'GET' }, { auth: true });
  },

  async reportUser(userId: number, input: { reason: string; details?: string }) {
    return request<{ message: string }>(
      `/api/social/user/${userId}/report`,
      { method: 'POST', body: JSON.stringify(input) },
      { auth: true }
    );
  },

  async getFeed(page = 0, size = 20) {
    const query = buildQuery({ page, size });
    return request<ActivityFeedItem[]>(`/api/social/feed${query}`, { method: 'GET' }, { auth: true });
  },
};

// ─── Smart Search Types ──────────────────────────────────────────────────────

export type SmartSearchInput = {
  budget?: number;
  mood?: string;
  freeHours?: number;
  maxDistanceKm?: number;
  latitude?: number;
  longitude?: number;
  preferences?: string;
};

export type ItinerarySlot = {
  order: number;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  placeId: string;
  placeName: string;
  category: string;
  rating: number;
  priceLevel: number;
  distanceKm: number;
  latitude: number;
  longitude: number;
  directionsUrl: string;
  note: string;
};

export type ItineraryResult = {
  totalHours: number;
  startTime: string;
  endTime: string;
  mood: string;
  slots: ItinerarySlot[];
};

export const smartSearchApi = {
  async similarPlaces(placeId: string, limit = 6) {
    const query = buildQuery({ limit });
    return request<DiscoveryItem[]>(
      `/api/discovery/similar/${encodeURIComponent(placeId)}${query}`,
      { method: 'GET' },
      { auth: true }
    );
  },

  async smartSearch(input: SmartSearchInput) {
    return request<DiscoveryItem[]>(
      '/api/discovery/smart-search',
      { method: 'POST', body: JSON.stringify(input) },
      { auth: true }
    );
  },

  async generateItinerary(input: {
    durationHours?: number;
    startTime?: string;
    mood?: string;
    budget?: number;
    latitude?: number;
    longitude?: number;
    maxDistanceKm?: number;
  }) {
    return request<ItineraryResult>(
      '/api/discovery/itinerary',
      { method: 'POST', body: JSON.stringify(input) },
      { auth: true }
    );
  },
};

// ─── Direct Messaging Types ──────────────────────────────────────────────────

export type DirectConversation = {
  id: number;
  peerId: number;
  peerUsername: string;
  peerProfilePictureUrl: string | null;
  peerPublicKey: string | null;
  lastMessageAt: string | null;
  createdAt: string;
};

export type DirectMessageItem = {
  id: number;
  conversationId: number;
  senderId: number;
  senderName: string;
  senderPublicKey: string | null;
  kind: string;
  ciphertext: string;
  contentNonce: string;
  encryptedKey: string | null;
  keyNonce: string | null;
  createdAt: string;
};

export const directMessageApi = {
  async listConversations() {
    return request<DirectConversation[]>('/api/dm/conversations', { method: 'GET' }, { auth: true });
  },

  async createConversation(userId: number) {
    return request<DirectConversation>(
      `/api/dm/conversations/${userId}`,
      { method: 'POST' },
      { auth: true }
    );
  },

  async getMessages(conversationId: number, limit = 50) {
    const query = buildQuery({ limit });
    return request<DirectMessageItem[]>(
      `/api/dm/conversations/${conversationId}/messages${query}`,
      { method: 'GET' },
      { auth: true }
    );
  },

  async sendMessage(conversationId: number, input: {
    kind: string;
    ciphertext: string;
    contentNonce: string;
    encryptedKeys: { userId: number; encryptedKey: string; keyNonce: string }[];
  }) {
    return request<DirectMessageItem>(
      `/api/dm/conversations/${conversationId}/messages`,
      { method: 'POST', body: JSON.stringify(input) },
      { auth: true }
    );
  },
};

// ─── Event Chat Types ────────────────────────────────────────────────────────

export type ChatMessageKind = 'TEXT' | 'IMAGE' | 'LOCATION';
export type ChatScope = 'GROUP' | 'ORGANIZER' | 'DIRECT';

export type ChatEncryptedKeyInput = {
  userId: number;
  encryptedKey: string;
  keyNonce: string;
};

export type ChatPublicKeyResponse = {
  publicKey: string;
  updatedAt: string;
};

export type EventChatSummaryResponse = {
  eventId: number;
  title: string;
  locationName: string | null;
  startDate: string | null;
  organizerId: number;
  organizerUsername: string;
  organizer: boolean;
  participantCount: number;
  pinnedCount: number;
  lastGroupMessageAt: string | null;
};

export type ChatEventSummary = EventChatSummaryResponse;

export type EventChatParticipantResponse = {
  userId: number;
  username: string;
  role: string | null;
  organizer: boolean;
  currentUser: boolean;
  directAllowed: boolean;
  hasChatPublicKey: boolean;
  publicKey: string | null;
  profilePictureUrl: string | null;
};

export type ChatParticipant = EventChatParticipantResponse;

export type ChatMessage = {
  id: number;
  eventId: number;
  scope: string;
  kind: ChatMessageKind;
  senderId: number;
  senderName: string;
  senderPublicKey: string | null;
  senderProfilePictureUrl: string | null;
  recipientId: number | null;
  ciphertext: string;
  contentNonce: string;
  encryptedKey: string;
  keyNonce: string;
  createdAt: string;
  pinned: boolean;
  pinnedAt: string | null;
  pinnedById: number | null;
  pinnedByName: string | null;
};

export const chatApi = {
  async getMyKey() {
    return request<ChatPublicKeyResponse>('/api/chat/keys/me', { method: 'GET' }, { auth: true });
  },
  async upsertMyKey(publicKey: string) {
    return request<ChatPublicKeyResponse>('/api/chat/keys/me', { method: 'PUT', body: JSON.stringify({ publicKey }) }, { auth: true });
  },
  async listEvents() {
    return request<EventChatSummaryResponse[]>('/api/chat/events', { method: 'GET' }, { auth: true });
  },
  async getParticipants(eventId: number) {
    return request<EventChatParticipantResponse[]>(`/api/chat/events/${eventId}/participants`, { method: 'GET' }, { auth: true });
  },
  async getMessages(args: { eventId: number; scope?: string; counterpartUserId?: number; limit?: number }) {
    const q = buildQuery({ scope: args.scope || 'GROUP', counterpartUserId: args.counterpartUserId || '', limit: args.limit || 50 });
    return request<ChatMessage[]>(`/api/chat/events/${args.eventId}/messages${q}`, { method: 'GET' }, { auth: true });
  },
  async getPinnedMessages(eventId: number) {
    return request<ChatMessage[]>(`/api/chat/events/${eventId}/pins`, { method: 'GET' }, { auth: true });
  },
  async sendMessage(input: { eventId: number; scope?: string; counterpartUserId?: number | null; kind: ChatMessageKind; ciphertext: string; contentNonce: string; encryptedKeys: ChatEncryptedKeyInput[] }) {
    return request<ChatMessage>(`/api/chat/events/${input.eventId}/messages`, { method: 'POST', body: JSON.stringify(input) }, { auth: true });
  },
  async pinMessage(eventId: number, messageId: number) {
    return request<ChatMessage>(`/api/chat/events/${eventId}/messages/${messageId}/pin`, { method: 'POST' }, { auth: true });
  },
  async unpinMessage(eventId: number, messageId: number) {
    return request<{ message: string }>(`/api/chat/events/${eventId}/messages/${messageId}/pin`, { method: 'DELETE' }, { auth: true });
  }
};
