import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AuthEntryScreen from './screens/AuthEntryScreen';
import ExploreEaseMain from './screens/ExploreEaseMain';
import { sessionStore } from './services/backend';

export default function App() {
  const initialAuth = useMemo(() => !!sessionStore.get()?.accessToken, []);
  const [authenticated, setAuthenticated] = useState(initialAuth);

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
