import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { Slot } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../src/providers/AuthProvider';
import { useRoleRedirect } from '../src/hooks/useRoleRedirect';
import { theme } from '../src/design-system/theme';

const SPLASH_DURATION_MS = 1000;

function LaunchSplash({ resolvedTheme }) {
  return (
    <View style={[styles.splashScreen, resolvedTheme?.backgroundColor ? { backgroundColor: resolvedTheme.backgroundColor } : null]}>
      {resolvedTheme?.logoIcon ? (
        <Image source={{ uri: resolvedTheme.logoIcon }} style={styles.splashLogo} resizeMode="contain" />
      ) : (
        <ActivityIndicator size="large" color={resolvedTheme?.primaryColor || theme.colors.actionPrimary} />
      )}
      {resolvedTheme?.brandName ? (
        <Text
          style={[
            styles.splashBrand,
            resolvedTheme?.primaryTextColor ? { color: resolvedTheme.primaryTextColor } : null,
            resolvedTheme?.secondaryFontFamily ? { fontFamily: resolvedTheme.secondaryFontFamily } : null,
          ]}
        >
          {resolvedTheme.brandName}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * We separate the navigator into a subcomponent inside the Provider
 * so that we can call custom hooks that rely on Context gracefully.
 */
function RootLayoutNav() {
  const [showSplash, setShowSplash] = useState(true);
  const { resolvedTheme } = useAuth();

  useRoleRedirect();

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setShowSplash(false);
    }, SPLASH_DURATION_MS);

    return () => clearTimeout(timeoutId);
  }, []);

  if (showSplash) {
    return <LaunchSplash resolvedTheme={resolvedTheme} />;
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
    backgroundColor: theme.colors.backgroundCanvas,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.lg,
  },
  splashLogo: {
    width: 88,
    height: 88,
    marginBottom: theme.spacing.md,
  },
  splashBrand: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    lineHeight: theme.typography.semantic.titleSm * theme.typography.lineHeights.tight,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
});
