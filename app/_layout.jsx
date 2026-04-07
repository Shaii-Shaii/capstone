import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Slot } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../src/providers/AuthProvider';
import { useRoleRedirect } from '../src/hooks/useRoleRedirect';
import { theme } from '../src/design-system/theme';
import donivraLogoNoText from '../src/assets/images/donivra_logo_no_text.png';

const SPLASH_DURATION_MS = 1200;

function LaunchSplash() {
  return (
    <View style={styles.splashScreen}>
      <View style={styles.splashLogoWrap}>
        <Image source={donivraLogoNoText} style={styles.splashLogo} resizeMode="contain" />
      </View>
      <Text style={styles.splashBrand}>Donivra</Text>
    </View>
  );
}

/**
 * We separate the navigator into a subcomponent inside the Provider
 * so that we can call custom hooks that rely on Context gracefully.
 */
function RootLayoutNav() {
  const [showSplash, setShowSplash] = useState(true);

  useRoleRedirect();

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setShowSplash(false);
    }, SPLASH_DURATION_MS);

    return () => clearTimeout(timeoutId);
  }, []);

  if (showSplash) {
    return <LaunchSplash />;
  }

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

const styles = StyleSheet.create({
  splashScreen: {
    flex: 1,
    backgroundColor: theme.colors.dashboardDonorFrom,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashLogoWrap: {
    width: 104,
    height: 104,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    marginBottom: theme.spacing.md,
  },
  splashLogo: {
    width: 64,
    height: 64,
  },
  splashBrand: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 38,
    lineHeight: 42,
    color: theme.colors.textInverse,
    textAlign: 'center',
  },
});
