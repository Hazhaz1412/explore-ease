const API_URL = (process.env.EXPO_PUBLIC_API_URL || 'http://192.168.1.51:8082').replace(/\/+$/, '');

export type AuthUser = {
  id: number;
  username: string;
  email: string;
  isActive: boolean;
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

const buildQuery = (params: Record<string, string | number | undefined | null>) => {
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
