import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, ImageBackground } from 'react-native';
import { CalendarDays, Flame, Landmark, MapPin, Mountain, ShoppingBag, Trees, UtensilsCrossed } from 'lucide-react-native';
import { LocationDiscovery, LocationRoute, LocationSnapshot, NearbyPlace, locationApi } from '../services/backend';
import {
  cacheLocationSnapshot,
  isLikelyOfflineError,
  loadLocationSnapshot,
} from '../services/offlineSync';

type PermissionState = 'unknown' | 'granted' | 'denied' | 'unavailable';

const ExpoLocationModule: any = (() => {
  try {
    return require('expo-location');
  } catch {
    return null;
  }
})();

const MapsRuntime: { module: any; error: string | null } = (() => {
  try {
    return { module: require('../components/NativeMaps'), error: null };
  } catch (error: any) {
    return { module: null, error: error?.message || String(error) };
  }
})();

const MapsModule = MapsRuntime.module;
const mapLoadError = MapsRuntime.error;
const compactMapError = mapLoadError?.split('\n')[0];
const MapViewComponent = MapsModule?.default || MapsModule?.MapView || MapsModule;
const MarkerComponent = MapsModule?.Marker || MapsModule?.default?.Marker || MapViewComponent?.Marker;
const canRenderNativeMap =
  !!MapViewComponent &&
  (typeof MapViewComponent === 'function' ||
    (typeof MapViewComponent === 'object' && MapViewComponent !== null && '$$typeof' in MapViewComponent));
const hasGoogleMapsApiKey =
  Platform.OS === 'web' ||
  !!process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  !!process.env.GOOGLE_MAPS_API_KEY;
const IframeElement: any = 'iframe';
const webNavigator: any = typeof navigator !== 'undefined' ? navigator : null;
const browserGeolocationAvailable = Platform.OS === 'web' && !!webNavigator?.geolocation;

const MAX_RADIUS = 50;
const MIN_RADIUS = 1;
const DEFAULT_RADIUS = 8;
const DEFAULT_WEB_LAT = 16.0678;
const DEFAULT_WEB_LON = 108.2208;

const toFixed2 = (value: number) => Number(value.toFixed(2));

const parseCoord = (value: string) => {
  const parsed = Number(value.trim());
  return Number.isFinite(parsed) ? parsed : NaN;
};

const clampRadius = (value: number) => Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, value));

const buildOsmEmbedUrl = (latitude: number, longitude: number) => {
  const delta = 0.035;
  const left = longitude - delta;
  const right = longitude + delta;
  const bottom = latitude - delta;
  const top = latitude + delta;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${latitude}%2C${longitude}`;
};

const getPlaceLabel = (category: string, type: string) => {
  const key = (category || '').toUpperCase();
  if (key === 'FOOD') return 'Food';
  if (key === 'CULTURE') return 'Culture';
  if (key === 'SHOPPING') return 'Shopping';
  if (key === 'NATURE') return 'Nature';
  if (key === 'ADVENTURE') return 'Adventure';
  return type === 'EVENT' ? 'Event' : 'Place';
};

const isHotPlace = (place: NearbyPlace) => place.recommendationScore >= 80 || place.distanceKm <= 2;
const getPinColor = (place: NearbyPlace) => {
  if (isHotPlace(place)) {
    return '#ff5b5b';
  }
  if (place.type === 'EVENT') {
    return '#4cc9f0';
  }
  return '#ffffff';
};

const PlaceCategoryIcon = ({
  category,
  type,
  size = 14,
  color = '#f8fafc',
}: {
  category: string;
  type: string;
  size?: number;
  color?: string;
}) => {
  const key = (category || '').toUpperCase();
  if (key === 'FOOD') return <UtensilsCrossed size={size} color={color} strokeWidth={2} />;
  if (key === 'CULTURE') return <Landmark size={size} color={color} strokeWidth={2} />;
  if (key === 'SHOPPING') return <ShoppingBag size={size} color={color} strokeWidth={2} />;
  if (key === 'NATURE') return <Trees size={size} color={color} strokeWidth={2} />;
  if (key === 'ADVENTURE') return <Mountain size={size} color={color} strokeWidth={2} />;
  if (type === 'EVENT') return <CalendarDays size={size} color={color} strokeWidth={2} />;
  return <MapPin size={size} color={color} strokeWidth={2} />;
};

const getCategoryFallbackImage = (category: string, type: string) => {
  const key = (category || '').toUpperCase();
  if (key === 'FOOD') return 'https://images.unsplash.com/photo-1544148103-0773bf10d330?auto=format&fit=crop&q=80&w=400';
  if (key === 'CULTURE') return 'https://images.unsplash.com/photo-1599946347371-68eb71b16afc?auto=format&fit=crop&q=80&w=400';
  if (key === 'SHOPPING') return 'https://images.unsplash.com/photo-1481437156560-3205f6a55735?auto=format&fit=crop&q=80&w=400';
  if (key === 'NATURE') return 'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&q=80&w=400';
  if (key === 'ADVENTURE') return 'https://images.unsplash.com/photo-1522163182402-834f871fd851?auto=format&fit=crop&q=80&w=400';
  if (type === 'EVENT') return 'https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&q=80&w=400';
  return 'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&q=80&w=400';
};

const getBrowserCurrentPosition = () =>
  new Promise<{ latitude: number; longitude: number }>((resolve, reject) => {
    if (!browserGeolocationAvailable || !webNavigator?.geolocation) {
      reject(new Error('Browser geolocation is unavailable in this web browser.'));
      return;
    }

    webNavigator.geolocation.getCurrentPosition(
      (position: any) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error: any) => {
        reject(new Error(error?.message || 'Browser location request was denied.'));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });

const watchBrowserPosition = (onUpdate: (latitude: number, longitude: number) => void) => {
  if (!browserGeolocationAvailable || !webNavigator?.geolocation) {
    throw new Error('Browser geolocation is unavailable in this web browser.');
  }

  const watchId = webNavigator.geolocation.watchPosition(
    (position: any) => {
      onUpdate(position.coords.latitude, position.coords.longitude);
    },
    (error: any) => {
      console.warn('Browser location watch error:', error?.message || error);
    },
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
  );

  return {
    remove: () => webNavigator.geolocation.clearWatch(watchId),
  };
};

const LocationDiscoveryPanel = () => {
  const watchRef = useRef<any>(null);
  const lastSyncAtRef = useRef<number>(0);

  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [tracking, setTracking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<LocationSnapshot | null>(null);
  const [discovery, setDiscovery] = useState<LocationDiscovery | null>(null);
  const [route, setRoute] = useState<LocationRoute | null>(null);
  const [usingOfflineData, setUsingOfflineData] = useState(false);

  const [manualLat, setManualLat] = useState('');
  const [manualLon, setManualLon] = useState('');
  const [manualName, setManualName] = useState('');
  const [radiusKm, setRadiusKm] = useState(String(DEFAULT_RADIUS));

  const reference = discovery?.referenceLocation || currentLocation;
  const webCenterLat = reference?.latitude ?? DEFAULT_WEB_LAT;
  const webCenterLon = reference?.longitude ?? DEFAULT_WEB_LON;
  const nativeCenterLat = reference?.latitude ?? DEFAULT_WEB_LAT;
  const nativeCenterLon = reference?.longitude ?? DEFAULT_WEB_LON;
  const webEmbedUrl = buildOsmEmbedUrl(webCenterLat, webCenterLon);
  const allPlaces = useMemo(() => {
    if (!discovery) {
      return [];
    }
    return [...discovery.pointsOfInterest, ...discovery.events];
  }, [discovery]);

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

  const stopTracking = () => {
    if (watchRef.current?.remove) {
      watchRef.current.remove();
    }
    watchRef.current = null;
    setTracking(false);
  };

  const requestPermission = async () => {
    if (Platform.OS === 'web') {
      if (!browserGeolocationAvailable) {
        setPermission('unavailable');
        throw new Error('Browser geolocation is unavailable in this web browser.');
      }
      setPermission('granted');
      return true;
    }

    if (!ExpoLocationModule) {
      setPermission('unavailable');
      throw new Error('expo-location is not installed. Add it to enable device GPS tracking.');
    }

    const foreground = await ExpoLocationModule.getForegroundPermissionsAsync();
    if (foreground.status === 'granted') {
      setPermission('granted');
      return true;
    }

    const requested = await ExpoLocationModule.requestForegroundPermissionsAsync();
    if (requested.status === 'granted') {
      setPermission('granted');
      return true;
    }

    setPermission('denied');
    throw new Error(
      Platform.OS === 'android'
        ? 'Location permission denied. Please enable precise location (Android 12+) in app settings.'
        : 'Location permission denied. Please allow location access in settings.'
    );
  };

  const refreshDiscovery = async (latitude?: number, longitude?: number) => {
    const parsedRadius = clampRadius(Number(radiusKm) || DEFAULT_RADIUS);
    try {
      const payload = await locationApi.discoverNearby({
        latitude,
        longitude,
        radiusKm: parsedRadius,
      });
      setDiscovery(payload);
      setUsingOfflineData(false);
      return payload;
    } catch (error) {
      const cached = await loadLocationSnapshot();
      if (cached?.discovery) {
        setDiscovery(cached.discovery);
        setUsingOfflineData(true);
        return cached.discovery;
      }
      if (!isLikelyOfflineError(error)) {
        throw error;
      }
      setUsingOfflineData(true);
      return null;
    }
  };

  const syncRealtimeLocation = async (latitude: number, longitude: number, locationName?: string) => {
    const now = Date.now();
    if (now - lastSyncAtRef.current < 7000) {
      return;
    }
    lastSyncAtRef.current = now;

    try {
      const updated = await locationApi.updateRealtimeLocation({
        latitude: toFixed2(latitude),
        longitude: toFixed2(longitude),
        locationName,
      });
      setCurrentLocation(updated);
      const payload = await refreshDiscovery(updated.latitude, updated.longitude);
      await cacheLocationSnapshot({ currentLocation: updated, discovery: payload || discovery });
      setUsingOfflineData(false);
    } catch (error) {
      const cached = await loadLocationSnapshot();
      if (cached) {
        setCurrentLocation(cached.currentLocation);
        setDiscovery(cached.discovery);
        setUsingOfflineData(true);
        return;
      }
      throw error;
    }
  };

  const syncDeviceLocationOnce = () =>
    run(async () => {
      await requestPermission();
      if (Platform.OS === 'web' && !ExpoLocationModule) {
        const position = await getBrowserCurrentPosition();
        await syncRealtimeLocation(position.latitude, position.longitude, 'Browser GPS');
        return;
      }
      const position = await ExpoLocationModule.getCurrentPositionAsync({
        accuracy: ExpoLocationModule.Accuracy?.Balanced || 3,
      });
      await syncRealtimeLocation(
        position.coords.latitude,
        position.coords.longitude,
        'Device GPS'
      );
    });

  const toggleRealtimeTracking = () =>
    run(async () => {
      if (tracking) {
        stopTracking();
        return;
      }

      await requestPermission();
      if (Platform.OS === 'web' && !ExpoLocationModule) {
        const subscription = watchBrowserPosition(async (latitude, longitude) => {
          try {
            await syncRealtimeLocation(latitude, longitude, 'Browser realtime GPS');
          } catch {
            // keep tracking alive during temporary failures
          }
        });
        watchRef.current = subscription;
        setTracking(true);
        return;
      }

      const subscription = await ExpoLocationModule.watchPositionAsync(
        {
          accuracy: ExpoLocationModule.Accuracy?.Balanced || 3,
          timeInterval: 10000,
          distanceInterval: 20,
        },
        async (position: any) => {
          try {
            await syncRealtimeLocation(
              position.coords.latitude,
              position.coords.longitude,
              'Realtime GPS'
            );
          } catch {
            // Network hiccups should not kill active tracking.
          }
        }
      );
      watchRef.current = subscription;
      setTracking(true);
    });

  const setManualOverride = () =>
    run(async () => {
      const lat = parseCoord(manualLat);
      const lon = parseCoord(manualLon);
      if (Number.isNaN(lat) || Number.isNaN(lon)) {
        throw new Error('Manual location requires valid latitude and longitude.');
      }
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
        throw new Error('Latitude/longitude out of range.');
      }

      try {
        const updated = await locationApi.updateManualLocation({
          latitude: toFixed2(lat),
          longitude: toFixed2(lon),
          locationName: manualName.trim() || 'Manual planning point',
        });
        setCurrentLocation(updated);
        const payload = await refreshDiscovery(updated.latitude, updated.longitude);
        await cacheLocationSnapshot({ currentLocation: updated, discovery: payload || discovery });
        setUsingOfflineData(false);
      } catch (error) {
        const cached = await loadLocationSnapshot();
        if (cached) {
          setCurrentLocation(cached.currentLocation);
          setDiscovery(cached.discovery);
          setUsingOfflineData(true);
          return;
        }
        if (isLikelyOfflineError(error)) {
          setUsingOfflineData(true);
          return;
        }
        throw error;
      }
    });

  const loadCurrentFromBackend = () =>
    run(async () => {
      try {
        const current = await locationApi.getCurrentLocation();
        setCurrentLocation(current);
        const payload = await refreshDiscovery(current.latitude, current.longitude);
        await cacheLocationSnapshot({ currentLocation: current, discovery: payload || discovery });
        setUsingOfflineData(false);
      } catch (error: any) {
        if (error?.message?.toLowerCase().includes('no current location')) {
          if (browserGeolocationAvailable) {
            try {
              const position = await getBrowserCurrentPosition();
              setPermission('granted');
              await syncRealtimeLocation(position.latitude, position.longitude, 'Browser GPS');
              return;
            } catch {
              // fall through to empty state when browser permission is denied
            }
          }
          setCurrentLocation(null);
          setDiscovery(null);
          return;
        }
        const cached = await loadLocationSnapshot();
        if (cached) {
          setCurrentLocation(cached.currentLocation);
          setDiscovery(cached.discovery);
          setUsingOfflineData(true);
          return;
        }
        throw error;
      }
    });

  const refreshUsingCurrent = () =>
    run(async () => {
      try {
        const payload = await refreshDiscovery(reference?.latitude, reference?.longitude);
        if (reference) {
          await cacheLocationSnapshot({ currentLocation: reference, discovery: payload || discovery });
        }
      } catch (error) {
        const cached = await loadLocationSnapshot();
        if (cached) {
          setCurrentLocation(cached.currentLocation);
          setDiscovery(cached.discovery);
          setUsingOfflineData(true);
          return;
        }
        if (isLikelyOfflineError(error)) {
          setUsingOfflineData(true);
          return;
        }
        throw error;
      }
    });

  const buildRoute = (place: NearbyPlace) =>
    run(async () => {
      const routeData = await locationApi.getRoute({
        fromLatitude: reference?.latitude,
        fromLongitude: reference?.longitude,
        toLatitude: place.latitude,
        toLongitude: place.longitude,
        mode: 'walking',
      });
      setRoute(routeData);
    });

  const openExternalMap = async (url: string) => {
    const canOpen = await Linking.canOpenURL(url);
    if (!canOpen) {
      Alert.alert('Cannot open link', url);
      return;
    }
    await Linking.openURL(url);
  };

  useEffect(() => {
    if (!ExpoLocationModule) {
      setPermission(browserGeolocationAvailable ? 'unknown' : 'unavailable');
    }
    void (async () => {
      const cached = await loadLocationSnapshot();
      if (cached?.currentLocation) {
        setCurrentLocation(cached.currentLocation);
        setDiscovery(cached.discovery);
        setUsingOfflineData(true);
      }
      // Always try loading fresh data from backend, even if we have cache
      await loadCurrentFromBackend().catch(() => {
        // On web without GPS permission or if backend fails, try to use browser geolocation as fallback
        if (Platform.OS === 'web' && browserGeolocationAvailable && !currentLocation) {
          requestPermission()
            .then(syncDeviceLocationOnce)
            .catch((err) => console.warn('Web fallback GPS failed:', err));
        }
      });
    })();
    return () => {
      stopTracking();
    };
  }, []);

  return (
    <View style={styles.wrapper}>
      {usingOfflineData && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineBannerText}>
            Offline mode: showing the last cached nearby attractions and events.
          </Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>GPS Integration</Text>
        <Text style={styles.helper}>
          Permission: {permission.toUpperCase()} • Tracking: {tracking ? 'ON' : 'OFF'}
        </Text>
        {Platform.OS === 'web' && (
          <Text style={styles.helper}>
            Web fallback is enabled. Your browser location is used when Expo GPS is unavailable.
          </Text>
        )}
        <View style={styles.buttonRow}>
          <Button
            label={loading ? 'Working...' : tracking ? 'Stop realtime tracking' : 'Start realtime tracking'}
            onPress={toggleRealtimeTracking}
            disabled={loading}
          />
          <Button label="Sync current GPS" onPress={syncDeviceLocationOnce} disabled={loading} kind="ghost" />
        </View>
        {!!currentLocation && (
          <Text style={styles.coordText}>
            Current: {currentLocation.latitude}, {currentLocation.longitude}
            {currentLocation.locationName ? ` (${currentLocation.locationName})` : ''}
            {currentLocation.manualOverride ? ' [manual]' : ' [device]'}
          </Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Manual Location Override (Future Planning)</Text>
        <View style={styles.row}>
          <Field label="Latitude" value={manualLat} onChangeText={setManualLat} />
          <Field label="Longitude" value={manualLon} onChangeText={setManualLon} />
        </View>
        <Field label="Location name (optional)" value={manualName} onChangeText={setManualName} />
        <View style={styles.row}>
          <Field label="Radius km (1-50)" value={radiusKm} onChangeText={setRadiusKm} />
          <View style={styles.fieldWrap}>
            <Text style={styles.label}>Actions</Text>
            <View style={styles.buttonStack}>
              <Button label="Apply manual point" onPress={setManualOverride} disabled={loading} />
              <Button label="Refresh nearby" onPress={refreshUsingCurrent} disabled={loading} kind="ghost" />
            </View>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Map View</Text>
        {Platform.OS === ('web' as string) ? (
          <View style={styles.mapWebWrap}>
            <IframeElement
              title="location-map"
              src={webEmbedUrl}
              style={styles.webIframe}
              loading="lazy"
            />
            <Text style={styles.helper}>
              Running on web: showing OpenStreetMap embed. `react-native-maps` sẽ render đầy đủ trên Android/iOS.
            </Text>
          </View>
        ) : null}
        {Platform.OS !== 'web' && canRenderNativeMap && hasGoogleMapsApiKey ? (
          <MapViewComponent
            key={`${nativeCenterLat}-${nativeCenterLon}`}
            style={styles.map}
            initialRegion={{
              latitude: nativeCenterLat,
              longitude: nativeCenterLon,
              latitudeDelta: 0.08,
              longitudeDelta: 0.08,
            }}
          >
            {MarkerComponent ? (
              <MarkerComponent
                coordinate={{ latitude: nativeCenterLat, longitude: nativeCenterLon }}
                title={reference ? 'Current position' : 'Default area'}
                description={reference?.locationName || 'Use GPS or manual override to personalize map'}
                pinColor="#ffffff"
              />
            ) : null}
            {MarkerComponent
              ? allPlaces.map((place) => (
                  <MarkerComponent
                    key={place.id}
                    coordinate={{ latitude: place.latitude, longitude: place.longitude }}
                    title={`${isHotPlace(place) ? 'HOT • ' : ''}${place.name}`}
                    description={`${getPlaceLabel(place.category, place.type)} • ${place.distanceKm} km`}
                    pinColor={getPinColor(place)}
                  />
                ))
              : null}
          </MapViewComponent>
        ) : Platform.OS !== ('web' as string) ? (
          <View style={styles.mapFallback}>
            <Text style={styles.helper}>
              Google/Mapbox deep-link integration is active.
              {Platform.OS === ('web' as string)
                ? ' react-native-maps does not render in Expo Web runtime.'
                : hasGoogleMapsApiKey
                  ? ' If map package version is mismatched with Expo SDK, run: npx expo install react-native-maps. Expo Go: restart with npx expo start -c. Dev build: rebuild with npx expo run:android (or ios).'
                  : ' Missing Google Maps API key. Set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY in .env and rebuild development build.'}
            </Text>
            {compactMapError ? <Text style={styles.helper}>Map module error: {compactMapError}</Text> : null}
            {reference ? (
              <Button
                label="Open current point in Google Maps"
                onPress={() =>
                  openExternalMap(
                    `https://www.google.com/maps/search/?api=1&query=${reference.latitude},${reference.longitude}`
                  )
                }
                kind="ghost"
              />
            ) : null}
          </View>
        ) : null}
        <View style={styles.mapLegendRow}>
          <View style={styles.mapLegendItem}>
            <Flame size={12} color="#ff5b5b" />
            <Text style={styles.mapLegendText}>Hot place</Text>
          </View>
          <View style={styles.mapLegendItem}>
            <MapPin size={12} color="#f3f3f3" />
            <Text style={styles.mapLegendText}>Regular place</Text>
          </View>
          <View style={styles.mapLegendItem}>
            <CalendarDays size={12} color="#4cc9f0" />
            <Text style={styles.mapLegendText}>Event</Text>
          </View>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Nearby Discoveries</Text>
        <Text style={styles.sectionLabel}>Recommended places</Text>
        <PlaceList places={discovery?.recommendations || []} onRoute={buildRoute} onOpenMap={openExternalMap} />

        <Text style={styles.sectionLabel}>Points of interest</Text>
        <PlaceList places={discovery?.pointsOfInterest || []} onRoute={buildRoute} onOpenMap={openExternalMap} />

        <Text style={styles.sectionLabel}>Events nearby</Text>
        <PlaceList places={discovery?.events || []} onRoute={buildRoute} onOpenMap={openExternalMap} />
      </View>

      {route ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Route Navigation</Text>
          <Text style={styles.helper}>
            Distance: {route.distanceKm} km • ETA: {route.estimatedMinutes} mins ({route.travelMode})
          </Text>
          <View style={styles.buttonRow}>
            <Button label="Open Google Maps route" onPress={() => openExternalMap(route.googleMapsUrl)} />
            <Button label="Open Mapbox route" onPress={() => openExternalMap(route.mapboxDirectionsUrl)} kind="ghost" />
          </View>
        </View>
      ) : null}
    </View>
  );
};

const PlaceList = ({
  places,
  onRoute,
  onOpenMap,
}: {
  places: NearbyPlace[];
  onRoute: (place: NearbyPlace) => void;
  onOpenMap: (url: string) => Promise<void>;
}) => {
  if (!places.length) {
    return <Text style={styles.empty}>No items in this range yet.</Text>;
  }

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.placeRow}>
      {places.map((place) => (
        <View key={place.id} style={styles.placeCardModern}>
          <ImageBackground
            source={{ uri: getCategoryFallbackImage(place.category, place.type) }}
            style={styles.placeCardBg}
            imageStyle={{ borderRadius: 16 }}
          >
            <View style={styles.placeCardOverlay}>
              <View style={styles.placeHeaderTop}>
                {isHotPlace(place) ? (
                  <View style={styles.hotBadgeModern}>
                    <Flame size={12} color="#fff" />
                    <Text style={styles.hotBadgeTextModern}>HOT</Text>
                  </View>
                ) : <View />}
                <View style={styles.iconBadgeModern}>
                  <PlaceCategoryIcon category={place.category} type={place.type} size={16} color="#fff" />
                </View>
              </View>
              
              <View style={styles.placeCardBody}>
                <Text style={styles.placeNameModern} numberOfLines={1}>{place.name}</Text>
                
                <Text style={styles.placeMetaModern} numberOfLines={1}>
                  {place.type} • {getPlaceLabel(place.category, place.type)} • {place.distanceKm} km
                </Text>
                <Text style={styles.placeScoreModern}>Score: {place.recommendationScore}</Text>
                
                <View style={styles.placeActionsModern}>
                  <Pressable style={styles.placeBtnPrimary} onPress={() => onRoute(place)}>
                    <Text style={styles.placeBtnPrimaryText}>Route</Text>
                  </Pressable>
                  <Pressable style={styles.placeBtnGhost} onPress={() => onOpenMap(place.navigationUrl)}>
                    <Text style={styles.placeBtnGhostText}>Map</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </ImageBackground>
        </View>
      ))}
    </ScrollView>
  );
};

const Field = ({
  label,
  value,
  onChangeText,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
}) => (
  <View style={styles.fieldWrap}>
    <Text style={styles.label}>{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      autoCapitalize="none"
      placeholderTextColor="#64748b"
      style={styles.input}
    />
  </View>
);

const Button = ({
  label,
  onPress,
  kind = 'primary',
  disabled,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost';
  disabled?: boolean;
}) => (
  <Pressable
    onPress={onPress}
    disabled={disabled}
    style={[styles.button, kind === 'ghost' && styles.buttonGhost, disabled && styles.buttonDisabled]}
  >
    <Text style={[styles.buttonText, kind === 'ghost' && styles.buttonGhostText]}>{label}</Text>
  </Pressable>
);

const styles = StyleSheet.create({
  wrapper: {
    gap: 16,
    paddingBottom: 24,
  },
  offlineBanner: {
    backgroundColor: 'rgba(245, 158, 11, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  offlineBannerText: {
    color: '#fde68a',
    fontSize: 13,
    fontWeight: '700',
    lineHeight: 18,
  },
  card: {
    backgroundColor: 'rgba(17, 24, 39, 0.7)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    padding: 16,
    gap: 12,
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 18,
    fontWeight: '800',
  },
  helper: {
    color: '#94a3b8',
    fontSize: 13,
    lineHeight: 18,
  },
  coordText: {
    color: '#cbd5e1',
    fontSize: 13,
    backgroundColor: 'rgba(0,0,0,0.3)',
    padding: 8,
    borderRadius: 8,
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    gap: 12,
  },
  fieldWrap: {
    flex: 1,
    gap: 6,
  },
  label: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(0,0,0,0.3)',
    color: '#f8fafc',
    fontSize: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  buttonStack: {
    gap: 10,
  },
  button: {
    borderRadius: 12,
    backgroundColor: '#00f2fe',
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonGhost: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#0f172a',
    fontSize: 13,
    fontWeight: '800',
  },
  buttonGhostText: {
    color: '#e2e8f0',
  },
  map: {
    width: '100%',
    height: 240,
    borderRadius: 16,
    overflow: 'hidden',
  },
  mapFallback: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 16,
    padding: 14,
    gap: 10,
  },
  mapWebWrap: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#000',
    gap: 10,
    paddingBottom: 10,
  },
  webIframe: {
    width: '100%',
    height: 240,
    borderWidth: 0,
  },
  mapLegendRow: {
    marginTop: 4,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  mapLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  mapLegendText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  sectionLabel: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '800',
    marginTop: 6,
    marginBottom: 4,
  },
  empty: {
    color: '#64748b',
    fontSize: 13,
    fontStyle: 'italic',
  },
  placeRow: {
    gap: 12,
    paddingRight: 10,
  },
  placeCardModern: {
    width: 240,
    height: 160,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  placeCardBg: {
    width: '100%',
    height: '100%',
    justifyContent: 'flex-end',
  },
  placeCardOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 16,
    padding: 12,
    justifyContent: 'space-between',
  },
  placeHeaderTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  hotBadgeModern: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ef4444',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 100,
  },
  hotBadgeTextModern: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '800',
  },
  iconBadgeModern: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeCardBody: {
    gap: 4,
  },
  placeNameModern: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  placeMetaModern: {
    color: '#e2e8f0',
    fontSize: 11,
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  placeScoreModern: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  placeActionsModern: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  placeBtnPrimary: {
    flex: 1,
    backgroundColor: 'rgba(0,242,254,0.9)',
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
  },
  placeBtnPrimaryText: {
    color: '#0f172a',
    fontSize: 11,
    fontWeight: '800',
  },
  placeBtnGhost: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 8,
    paddingVertical: 6,
    alignItems: 'center',
  },
  placeBtnGhostText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});

export default LocationDiscoveryPanel;
