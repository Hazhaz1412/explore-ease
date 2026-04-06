import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

export const GOOGLE_DISCOVERY = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

export const getGoogleClientId = () => {
  // In Expo Go, always use the Web client ID because the auth flow
  // goes through a browser (not native SDK).
  if (Platform.OS === 'android') {
    return process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
      || process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
      || '';
  }

  if (Platform.OS === 'ios') {
    return process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID
      || process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
      || '';
  }

  return process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
};

export const getGoogleRedirectUri = () =>
  AuthSession.makeRedirectUri({
    scheme: 'exploreease',
    path: 'oauthredirect',
    // Use Expo proxy in Expo Go so Google can redirect properly
    ...(Constants.appOwnership === 'expo' ? { useProxy: true } : {}),
  });

