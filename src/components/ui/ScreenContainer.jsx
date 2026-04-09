import React from 'react';
import { View, StyleSheet, Platform, ScrollView, KeyboardAvoidingView, useWindowDimensions, ImageBackground } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../../design-system/theme';
import { useAuth } from '../../providers/AuthProvider';

export const ScreenContainer = ({
  children,
  style,
  contentStyle,
  scrollable = true,
  safeArea = true,
  variant = 'default',
  heroColors = [theme.colors.heroFrom, theme.colors.heroTo],
  authHeroImageUri = '',
}) => {
  const { resolvedTheme } = useAuth();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const isAuth = variant === 'auth';
  const isDashboard = variant === 'dashboard';
  const isShortScreen = height < theme.layout.shortScreenHeight;
  const isCompactScreen = height < theme.layout.compactScreenHeight;
  const contentPaddingHorizontal = isShortScreen
    ? theme.layout.screenPaddingXCompact
    : theme.layout.screenPaddingX;
  const contentPaddingTop = isAuth
    ? (isCompactScreen ? theme.spacing.sm : isShortScreen ? theme.spacing.md : theme.spacing.lg)
    : (isCompactScreen ? theme.spacing.xs : isShortScreen ? theme.spacing.sm : theme.spacing.md);
  const contentPaddingBottom = isDashboard && !scrollable
    ? 0
    : Math.max(
      isCompactScreen ? theme.spacing.lg : isShortScreen ? theme.spacing.xl : theme.spacing.sectionLg,
      insets.bottom + (isDashboard ? theme.spacing.md : theme.spacing.lg)
    );
  const authHeroHeight = isShortScreen ? theme.layout.authHeroMinHeightCompact : theme.layout.authHeroMinHeight;
  const dashboardHeroHeight = isShortScreen
    ? theme.layout.dashboardHeroMinHeightCompact
    : theme.layout.dashboardHeroMinHeight;
  const backgroundCanvas = resolvedTheme?.backgroundColor || theme.colors.backgroundCanvas;
  const authBaseBackground = resolvedTheme?.backgroundColor || theme.colors.backgroundCanvas;
  const dashboardBaseBackground = resolvedTheme?.backgroundColor || theme.colors.backgroundSecondary;
  const authHeroBackground = resolvedTheme?.primaryColor || heroColors[0];
  const dashboardHeroBackground = resolvedTheme?.primaryColor || theme.colors.dashboardShellFrom;

  const content = (
    <View
      style={[
        styles.content,
        isAuth ? styles.authContent : null,
        {
          paddingHorizontal: contentPaddingHorizontal,
          paddingTop: contentPaddingTop,
          paddingBottom: contentPaddingBottom,
        },
        contentStyle,
        style,
      ]}
    >
      {children}
    </View>
  );

  const viewPort = scrollable ? (
    <ScrollView
      contentContainerStyle={[
        styles.scrollContainer,
        isAuth ? styles.authScroll : null,
        isShortScreen ? styles.scrollContainerCompact : null,
      ]}
      automaticallyAdjustKeyboardInsets={isAuth}
      bounces={!isAuth}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      {content}
    </ScrollView>
  ) : (
    content
  );

  const keyboardWrapper = (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : isAuth ? 'height' : undefined}
      keyboardVerticalOffset={Math.max(insets.top, isAuth ? theme.spacing.xl : theme.spacing.sm)}
    >
      {viewPort}
    </KeyboardAvoidingView>
  );

  const shell = (
    <View
      style={[
        styles.container,
        isDashboard ? styles.dashboardContainer : null,
        { backgroundColor: isDashboard ? dashboardBaseBackground : backgroundCanvas },
      ]}
    >
      {isAuth ? (
        <>
          <View style={[styles.authHero, { height: authHeroHeight, backgroundColor: authHeroBackground }]}>
            {authHeroImageUri ? (
              <ImageBackground source={{ uri: authHeroImageUri }} resizeMode="cover" style={styles.authHeroImage}>
                <View style={styles.authHeroImageOverlay} />
              </ImageBackground>
            ) : null}
          </View>
          <View style={[styles.authBase, { top: authHeroHeight - theme.spacing.giant, backgroundColor: authBaseBackground }]} />
          {keyboardWrapper}
        </>
      ) : (
        <>
          {isDashboard ? (
            <>
              <View
                style={[
                  styles.dashboardHero,
                  { height: dashboardHeroHeight, backgroundColor: dashboardHeroBackground },
                ]}
              />
              <View style={[styles.dashboardBase, { top: dashboardHeroHeight - theme.spacing.lg, backgroundColor: dashboardBaseBackground }]} />
            </>
          ) : null}
          {keyboardWrapper}
        </>
      )}
    </View>
  );

  if (!safeArea) {
    return <View style={[styles.safeArea, { backgroundColor: backgroundCanvas }]}>{shell}</View>;
  }

  return <SafeAreaView style={[styles.safeArea, { backgroundColor: backgroundCanvas }]}>{shell}</SafeAreaView>;
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    backgroundColor: theme.colors.backgroundCanvas,
  },
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundCanvas,
  },
  dashboardContainer: {
    backgroundColor: theme.colors.backgroundSecondary,
  },
  authHero: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  authHeroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  authHeroImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(8, 8, 8, 0.24)',
  },
  authBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.backgroundCanvas,
    borderTopLeftRadius: theme.radius.giant,
    borderTopRightRadius: theme.radius.giant,
  },
  dashboardBase: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.backgroundSecondary,
    borderTopLeftRadius: theme.radius.giant,
    borderTopRightRadius: theme.radius.giant,
  },
  dashboardHero: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  scrollContainer: {
    flexGrow: 1,
  },
  scrollContainerCompact: {
    minHeight: '100%',
  },
  authScroll: {
    minHeight: '100%',
  },
  content: {
    flex: 1,
  },
  authContent: {
    justifyContent: 'flex-start',
  },
});
