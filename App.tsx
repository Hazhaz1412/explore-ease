import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AuthEntryScreen from './screens/AuthEntryScreen';
import ExploreEaseMain from './screens/ExploreEaseMain';
import { sessionStore } from './services/backend';
import { startOfflineSync, stopOfflineSync } from './services/offlineSync';

export default function App() {
  const initialAuth = useMemo(() => !!sessionStore.get()?.accessToken, []);
  const [authenticated, setAuthenticated] = useState(initialAuth);

  useEffect(() => {
    startOfflineSync();
    return () => {
      stopOfflineSync();
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {authenticated ? (
        <ExploreEaseMain onLoggedOut={() => setAuthenticated(false)} />
      ) : (
        <AuthEntryScreen onAuthenticated={() => setAuthenticated(true)} />
      )}
    </SafeAreaProvider>
  );
}
