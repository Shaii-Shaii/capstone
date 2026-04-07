import React, { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Slot } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import { AuthProvider } from '../src/providers/AuthProvider';
import { useRoleRedirect } from '../src/hooks/useRoleRedirect';
import { theme } from '../src/design-system/theme';
import donivraLogoNoText from '../src/assets/images/donivra_logo_no_text.png';

const SPLASH_DURATION_MS = 1200;

function LaunchSplash() {
  return (
    <View style={styles.splashScreen}>
      <View style={styles.splashFrame}>
        <LinearGradient
          colors={[theme.colors.dashboardDonorFrom, theme.colors.dashboardDonorTo]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.splashPanel}
        >
          <View style={styles.splashGlowTop} />
          <View style={styles.splashGlowBottom} />
          <View style={styles.splashLogoWrap}>
            <Image source={donivraLogoNoText} style={styles.splashLogo} resizeMode="contain" />
          </View>
          <Text style={styles.splashBrand}>Donivra</Text>
          <Text style={styles.splashTag}>Hair donation and support</Text>
          <View style={styles.splashHandle} />
        </LinearGradient>
      </View>
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
    backgroundColor: theme.colors.backgroundCanvas,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.layout.screenPaddingX,
  },
  splashFrame: {
    width: '100%',
    maxWidth: 360,
  },
  splashPanel: {
    minHeight: 560,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.xxl,
  },
  splashGlowTop: {
    position: 'absolute',
    top: -28,
    right: -16,
    width: 160,
    height: 160,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  splashGlowBottom: {
    position: 'absolute',
    bottom: -34,
    left: -22,
    width: 180,
    height: 180,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  splashLogoWrap: {
    width: 92,
    height: 92,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    marginBottom: theme.spacing.lg,
  },
  splashLogo: {
    width: 58,
    height: 58,
  },
  splashBrand: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: 42,
    lineHeight: 46,
    color: theme.colors.textInverse,
    textAlign: 'center',
  },
  splashTag: {
    marginTop: theme.spacing.sm,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.bodySm,
    lineHeight: theme.typography.compact.bodySm * theme.typography.lineHeights.relaxed,
    color: theme.colors.textHeroMuted,
    textAlign: 'center',
  },
  splashHandle: {
    position: 'absolute',
    bottom: theme.spacing.md,
    width: 92,
    height: 4,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(255,255,255,0.34)',
  },
});
