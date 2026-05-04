import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { Slot } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider, useAuth } from '../src/providers/AuthProvider';
import { useRoleRedirect } from '../src/hooks/useRoleRedirect';
import { resolveBrandLogoSource, theme } from '../src/design-system/theme';

const SPLASH_DURATION_MS = 2000;

function LaunchSplash({ resolvedTheme }) {
  const [imageFailed, setImageFailed] = useState(false);
  const logoSource = resolveBrandLogoSource(resolvedTheme, imageFailed);
  const bgColor = resolvedTheme?.backgroundColor || theme.colors.backgroundCanvas;
  const textColor = resolvedTheme?.primaryTextColor || theme.colors.textPrimary;
  const subtitleColor = resolvedTheme?.secondaryTextColor || theme.colors.textSecondary;
  const loaderColor = resolvedTheme?.primaryColor || theme.colors.brandPrimarySoft;
  const brandName = resolvedTheme?.brandName || 'Donivra';
  const tagline = resolvedTheme?.brandTagline || 'Hair donation, reimagined.';

  useEffect(() => {
    setImageFailed(false);
  }, [resolvedTheme?.logoIcon]);

  return (
    <View style={[styles.splashScreen, { backgroundColor: bgColor }]}>
      <View style={styles.splashLogoContainer}>
        <Image
          source={logoSource}
          style={styles.splashLogo}
          resizeMode="contain"
          onError={() => setImageFailed(true)}
        />
      </View>

      <Text
        style={[
          styles.splashBrand,
          { color: textColor },
          resolvedTheme?.secondaryFontFamily ? { fontFamily: resolvedTheme.secondaryFontFamily } : null,
        ]}
      >
        {brandName}
      </Text>

      <Text style={[styles.splashTagline, { color: subtitleColor }]}>
        {tagline}
      </Text>

      <ActivityIndicator
        style={styles.splashLoader}
        color={loaderColor}
        size="small"
      />
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
  splashLogoContainer: {
    width: 96,
    height: 96,
    borderRadius: 24,
    backgroundColor: theme.colors.backgroundPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
  },
  splashLogo: {
    width: 60,
    height: 60,
  },
  splashBrand: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.semantic.titleSm,
    lineHeight: theme.typography.semantic.titleSm * theme.typography.lineHeights.tight,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.xs,
  },
  splashTagline: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  splashLoader: {
    marginTop: theme.spacing.xxxl,
  },
});
