import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

const IframeElement: any = 'iframe';

const DEFAULT_WEB_LAT = 16.0678;
const DEFAULT_WEB_LON = 108.2208;

const buildOsmEmbedUrl = (latitude: number, longitude: number) => {
  const delta = 0.035;
  const left = longitude - delta;
  const right = longitude + delta;
  const bottom = latitude - delta;
  const top = latitude + delta;
  return `https://www.openstreetmap.org/export/embed.html?bbox=${left}%2C${bottom}%2C${right}%2C${top}&layer=mapnik&marker=${latitude}%2C${longitude}`;
};

const WEB_MAP_URL = buildOsmEmbedUrl(DEFAULT_WEB_LAT, DEFAULT_WEB_LON);

const LocationDiscoveryPanel = () => {
  const openFullMap = async () => {
    await Linking.openURL(`https://www.openstreetmap.org/?mlat=${DEFAULT_WEB_LAT}&mlon=${DEFAULT_WEB_LON}#map=13/${DEFAULT_WEB_LAT}/${DEFAULT_WEB_LON}`);
  };

  return (
    <View style={styles.wrapper}>
      <View style={styles.card}>
        <Text style={styles.title}>Nearby Hotspots</Text>
        <Text style={styles.helper}>
          Web mode uses OpenStreetMap embed. Native map rendering is available on Android/iOS.
        </Text>

        <View style={styles.mapWrap}>
          <IframeElement title="location-map" src={WEB_MAP_URL} style={styles.webIframe} loading="lazy" />
        </View>

        <Pressable style={styles.button} onPress={openFullMap}>
          <Text style={styles.buttonText}>Open full map</Text>
        </Pressable>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 12,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.25)',
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    padding: 16,
    gap: 10,
  },
  title: {
    color: '#f8fafc',
    fontWeight: '800',
    fontSize: 18,
  },
  helper: {
    color: '#cbd5e1',
    fontSize: 13,
    lineHeight: 18,
  },
  mapWrap: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    backgroundColor: '#0f172a',
  },
  webIframe: {
    width: '100%',
    minHeight: 300,
    borderWidth: 0,
  },
  button: {
    alignSelf: 'flex-start',
    borderRadius: 10,
    backgroundColor: '#3b82f6',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 13,
  },
});

export default LocationDiscoveryPanel;
