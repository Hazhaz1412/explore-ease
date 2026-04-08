import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { LayoutAnimationConfig } from 'react-native-reanimated';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AuthEntryScreen from './screens/AuthEntryScreen';
import ExploreEaseMain from './screens/ExploreEaseMain';
import { sessionStore } from './services/backend';
import { startOfflineSync, stopOfflineSync } from './services/offlineSync';

export default function App() {
  const [ready, setReady] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    (async () => {
      // Try restoring from AsyncStorage (mobile) or localStorage (web, already done sync)
      const restored = await sessionStore.restoreAsync();
      const hasSession = restored || !!sessionStore.get()?.accessToken;
      setAuthenticated(hasSession);
      setReady(true);
    })();
    startOfflineSync();
    return () => {
      stopOfflineSync();
    };
  }, []);

  if (!ready) {
    return (
      <SafeAreaProvider>
        <StatusBar style="light" />
        <LayoutAnimationConfig skipEntering skipExiting>
          <View style={{ flex: 1, backgroundColor: '#0a0a0a', alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color="#8b5cf6" size="large" />
          </View>
        </LayoutAnimationConfig>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <LayoutAnimationConfig skipEntering skipExiting>
        {authenticated ? (
          <ExploreEaseMain onLoggedOut={() => setAuthenticated(false)} />
        ) : (
          <AuthEntryScreen onAuthenticated={() => setAuthenticated(true)} />
        )}
      </LayoutAnimationConfig>
    </SafeAreaProvider>
  );
}
