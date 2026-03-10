const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.51:8082').replace(/\/+$/, '');

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

  const response = await fetch(`${API_URL}${path}`, {
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
    const response = await fetch(`${API_URL}/api/auth/refresh-token`, {
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
    return true;
  })();

  try {
    return await refreshingPromise;
  } finally {
    refreshingPromise = null;
  }
};

export const sessionStore = {
  get() {
    return activeSession;
  },
  set(session: AuthSession | null) {
    activeSession = session;
  },
  clear() {
    activeSession = null;
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

export type EventItem = {
  id: number;
  title: string;
  description: string | null;
  eventType: EventType;
  status: EventStatus;
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
