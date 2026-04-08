const { expo } = require('./app.json');

const googleMapsApiKey =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ||
  process.env.GOOGLE_MAPS_API_KEY ||
  '';

module.exports = () => {
  const androidConfig = {
    ...(expo.android?.config || {}),
    ...(googleMapsApiKey ? { googleMaps: { apiKey: googleMapsApiKey } } : {}),
  };

  const iosConfig = {
    ...(expo.ios?.config || {}),
    ...(googleMapsApiKey ? { googleMapsApiKey } : {}),
  };

  return {
    ...expo,
    android: {
      ...expo.android,
      config: androidConfig,
    },
    ios: {
      ...expo.ios,
      config: iosConfig,
    },
  };
};
