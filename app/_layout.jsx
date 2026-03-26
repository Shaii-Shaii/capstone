import { Slot } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../src/providers/AuthProvider';
import { useRoleRedirect } from '../src/hooks/useRoleRedirect';

/**
 * We separate the navigator into a subcomponent inside the Provider
 * so that we can call custom hooks that rely on Context gracefully.
 */
function RootLayoutNav() {
  // Fire off global redirect logic automatically upon rendering
  useRoleRedirect();
  return <Slot />;
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar hidden animated />
      <AuthProvider>
        <RootLayoutNav />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
