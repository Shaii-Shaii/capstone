import React from 'react';
import { View, StyleSheet, Platform, ScrollView, KeyboardAvoidingView, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { theme } from '../../design-system/theme';

export const ScreenContainer = ({
  children,
  style,
  contentStyle,
  scrollable = true,
  safeArea = true,
  variant = 'default',
  heroColors = [theme.colors.heroFrom, theme.colors.heroTo],
}) => {
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

  const content = (
    <Animated.View
      entering={FadeInUp.duration(theme.motion.slow)}
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
    </Animated.View>
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
    <View style={[styles.container, isDashboard ? styles.dashboardContainer : null]}>
      {isAuth ? (
        <>
          <Animated.View entering={FadeIn.duration(theme.motion.slow)}>
            <LinearGradient
              colors={heroColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.authHero, { height: authHeroHeight }]}
            />
          </Animated.View>
          <View style={[styles.authBase, { top: authHeroHeight - theme.spacing.giant }]} />
          {keyboardWrapper}
        </>
      ) : (
        <>
          {isDashboard ? (
            <>
              <Animated.View entering={FadeIn.duration(theme.motion.slow)}>
                <LinearGradient
                  colors={[theme.colors.dashboardShellFrom, theme.colors.dashboardShellTo]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.dashboardHero, { height: dashboardHeroHeight }]}
                />
              </Animated.View>
              <View
                style={[
                  styles.dashboardGlowOne,
                  isShortScreen ? styles.dashboardGlowOneCompact : null,
                ]}
              />
              <View
                style={[
                  styles.dashboardGlowTwo,
                  isShortScreen ? styles.dashboardGlowTwoCompact : null,
                ]}
              />
              <View style={[styles.dashboardBase, { top: dashboardHeroHeight - theme.spacing.lg }]} />
            </>
          ) : null}
          {keyboardWrapper}
        </>
      )}
    </View>
  );

  if (!safeArea) {
    return shell;
  }

  return <SafeAreaView style={styles.safeArea}>{shell}</SafeAreaView>;
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
  dashboardGlowOne: {
    position: 'absolute',
    top: 42,
    right: -20,
    width: 132,
    height: 132,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentSoft,
  },
  dashboardGlowOneCompact: {
    top: 32,
    width: 112,
    height: 112,
  },
  dashboardGlowTwo: {
    position: 'absolute',
    top: 104,
    left: -34,
    width: 96,
    height: 96,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.whiteOverlay,
  },
  dashboardGlowTwoCompact: {
    top: 88,
    width: 84,
    height: 84,
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
