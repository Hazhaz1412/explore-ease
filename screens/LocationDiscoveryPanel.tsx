import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { CalendarDays, Flame, Landmark, MapPin, Mountain, ShoppingBag, Trees, UtensilsCrossed } from 'lucide-react-native';
import { LocationDiscovery, LocationRoute, LocationSnapshot, NearbyPlace, locationApi } from '../services/backend';

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
    return { module: require('react-native-maps'), error: null };
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
const IframeElement: any = 'iframe';

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
  color = '#f4f4f4',
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

const LocationDiscoveryPanel = () => {
  const watchRef = useRef<any>(null);
  const lastSyncAtRef = useRef<number>(0);

  const [permission, setPermission] = useState<PermissionState>('unknown');
  const [tracking, setTracking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<LocationSnapshot | null>(null);
  const [discovery, setDiscovery] = useState<LocationDiscovery | null>(null);
  const [route, setRoute] = useState<LocationRoute | null>(null);

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
    const payload = await locationApi.discoverNearby({
      latitude,
      longitude,
      radiusKm: parsedRadius,
    });
    setDiscovery(payload);
  };

  const syncRealtimeLocation = async (latitude: number, longitude: number, locationName?: string) => {
    const now = Date.now();
    if (now - lastSyncAtRef.current < 7000) {
      return;
    }
    lastSyncAtRef.current = now;

    const updated = await locationApi.updateRealtimeLocation({
      latitude: toFixed2(latitude),
      longitude: toFixed2(longitude),
      locationName,
    });
    setCurrentLocation(updated);
    await refreshDiscovery(updated.latitude, updated.longitude);
  };

  const syncDeviceLocationOnce = () =>
    run(async () => {
      await requestPermission();
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

      const updated = await locationApi.updateManualLocation({
        latitude: toFixed2(lat),
        longitude: toFixed2(lon),
        locationName: manualName.trim() || 'Manual planning point',
      });
      setCurrentLocation(updated);
      await refreshDiscovery(updated.latitude, updated.longitude);
    });

  const loadCurrentFromBackend = () =>
    run(async () => {
      try {
        const current = await locationApi.getCurrentLocation();
        setCurrentLocation(current);
        await refreshDiscovery(current.latitude, current.longitude);
      } catch (error: any) {
        if (error?.message?.toLowerCase().includes('no current location')) {
          setCurrentLocation(null);
          setDiscovery(null);
          return;
        }
        throw error;
      }
    });

  const refreshUsingCurrent = () =>
    run(async () => {
      await refreshDiscovery(reference?.latitude, reference?.longitude);
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
      setPermission('unavailable');
    }
    void loadCurrentFromBackend();
    return () => {
      stopTracking();
    };
  }, []);

  return (
    <View style={styles.wrapper}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>GPS Integration</Text>
        <Text style={styles.helper}>
          Permission: {permission.toUpperCase()} • Tracking: {tracking ? 'ON' : 'OFF'}
        </Text>
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
        {Platform.OS === 'web' ? (
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
        {Platform.OS !== 'web' && canRenderNativeMap ? (
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
        ) : Platform.OS !== 'web' ? (
          <View style={styles.mapFallback}>
            <Text style={styles.helper}>
              Google/Mapbox deep-link integration is active.
              {Platform.OS === 'web'
                ? ' react-native-maps does not render in Expo Web runtime.'
                : ' If map package version is mismatched with Expo SDK, run: npx expo install react-native-maps. Expo Go: restart with npx expo start -c. Dev build: rebuild with npx expo run:android (or ios).'}
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
        <View key={place.id} style={styles.placeCard}>
          <View style={styles.placeHeader}>
            <View style={styles.placeTitleRow}>
              <PlaceCategoryIcon category={place.category} type={place.type} />
              <Text style={styles.placeName}>{place.name}</Text>
            </View>
            {isHotPlace(place) ? (
              <View style={styles.hotBadge}>
                <Flame size={10} color="#ff8a8a" />
                <Text style={styles.hotBadgeText}>HOT</Text>
              </View>
            ) : null}
          </View>
          <Text style={styles.placeMeta}>
            {place.type} • {getPlaceLabel(place.category, place.type)} • {place.distanceKm} km
          </Text>
          <Text style={styles.placeMeta}>Score: {place.recommendationScore}</Text>
          <View style={styles.placeActions}>
            <Button label="Route" onPress={() => onRoute(place)} />
            <Button label="Map" onPress={() => onOpenMap(place.navigationUrl)} kind="ghost" />
          </View>
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
      placeholderTextColor="#7f7f7f"
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
    gap: 12,
  },
  card: {
    backgroundColor: '#121212',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2d2d2d',
    padding: 12,
    gap: 9,
  },
  cardTitle: {
    color: '#f2f2f2',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  helper: {
    color: '#a7a7a7',
    fontSize: 12,
    lineHeight: 18,
  },
  coordText: {
    color: '#d6d6d6',
    fontSize: 12,
    fontFamily: 'monospace',
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  fieldWrap: {
    flex: 1,
    gap: 4,
  },
  label: {
    color: '#adadad',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  input: {
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#363636',
    backgroundColor: '#191919',
    color: '#f0f0f0',
    fontSize: 13,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  buttonStack: {
    gap: 8,
  },
  button: {
    borderRadius: 10,
    backgroundColor: '#f1f1f1',
    paddingHorizontal: 12,
    paddingVertical: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonGhost: {
    backgroundColor: '#1c1c1c',
    borderWidth: 1,
    borderColor: '#3a3a3a',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonText: {
    color: '#090909',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  buttonGhostText: {
    color: '#d9d9d9',
  },
  map: {
    width: '100%',
    height: 220,
    borderRadius: 12,
    overflow: 'hidden',
  },
  mapFallback: {
    borderWidth: 1,
    borderColor: '#313131',
    backgroundColor: '#171717',
    borderRadius: 12,
    padding: 10,
    gap: 8,
  },
  mapWebWrap: {
    borderWidth: 1,
    borderColor: '#313131',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#141414',
    gap: 8,
    paddingBottom: 8,
  },
  webIframe: {
    width: '100%',
    height: 220,
    borderWidth: 0,
  },
  mapLegendRow: {
    marginTop: 2,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mapLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#2f2f2f',
    backgroundColor: '#171717',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  mapLegendText: {
    color: '#b4b4b4',
    fontSize: 11,
    fontFamily: 'monospace',
  },
  sectionLabel: {
    color: '#f1f1f1',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
    marginTop: 2,
  },
  empty: {
    color: '#8d8d8d',
    fontSize: 12,
    fontStyle: 'italic',
  },
  placeRow: {
    gap: 8,
    paddingRight: 6,
  },
  placeCard: {
    width: 220,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#323232',
    backgroundColor: '#171717',
    padding: 9,
    gap: 6,
  },
  placeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  placeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  placeName: {
    color: '#f4f4f4',
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
  },
  hotBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderWidth: 1,
    borderColor: '#7a2f2f',
    backgroundColor: '#3b1717',
    borderRadius: 999,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  hotBadgeText: {
    color: '#ffd6d6',
    fontSize: 10,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  placeMeta: {
    color: '#a8a8a8',
    fontSize: 11,
  },
  placeActions: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
  },
});

export default LocationDiscoveryPanel;
