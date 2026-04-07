import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { ScreenContainer } from '../ui/ScreenContainer';
import { AppCard } from '../ui/AppCard';
import { theme } from '../../design-system/theme';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';

export const AuthScreenLayout = ({ children, cardStyle, role = 'donor' }) => {
  const { height } = useWindowDimensions();
  const isShortScreen = height < theme.layout.shortScreenHeight;
  const isCompactScreen = height < theme.layout.compactScreenHeight;

  const heroColors =
    role === 'patient'
      ? [theme.colors.dashboardPatientFrom, theme.colors.dashboardPatientTo]
      : [theme.colors.heroFrom, theme.colors.heroTo];

  return (
    <ScreenContainer
      scrollable={true}
      safeArea={true}
      variant="auth"
      heroColors={heroColors}
      contentStyle={isCompactScreen ? styles.screenContentCompact : styles.screenContent}
    >
      <Animated.View
        entering={FadeInUp.duration(420).springify().damping(16)}
        style={[
          styles.container,
          isShortScreen ? styles.containerCompact : null,
          isCompactScreen ? styles.containerDense : null,
        ]}
      >
        <View style={[styles.glowOne, isShortScreen ? styles.glowOneCompact : null]} />
        <View style={[styles.glowTwo, isShortScreen ? styles.glowTwoCompact : null]} />
        <Animated.View entering={FadeInDown.delay(80).duration(420)}>
          <AppCard
            variant="elevated"
            radius="xl"
            padding={isCompactScreen ? 'sm' : isShortScreen ? 'md' : 'lg'}
            contentStyle={styles.cardContent}
            style={[styles.card, cardStyle]}
          >
            <View style={[styles.topAccent, role === 'patient' ? styles.topAccentPatient : null]} />
            {children}
          </AppCard>
        </Animated.View>
      </Animated.View>
    </ScreenContainer>
  );
};

export const authLayoutStyles = StyleSheet.create({
  formSection: {
    marginTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
});

const styles = StyleSheet.create({
  screenContent: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: theme.spacing.section,
  },
  screenContentCompact: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingBottom: theme.spacing.xl,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  containerCompact: {
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.xs,
  },
  containerDense: {
    paddingTop: 0,
    paddingBottom: 0,
  },
  card: {
    width: '100%',
    alignSelf: 'center',
    maxWidth: theme.layout.authCardMaxWidth,
    borderRadius: 32,
  },
  cardContent: {
    gap: theme.spacing.xs,
  },
  topAccent: {
    alignSelf: 'flex-start',
    width: 62,
    height: 4,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.brandPrimary,
    marginBottom: theme.spacing.md,
  },
  topAccentPatient: {
    backgroundColor: theme.colors.brandSecondary,
  },
  glowOne: {
    position: 'absolute',
    top: -16,
    right: -18,
    width: 128,
    height: 128,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.accentStrong,
  },
  glowOneCompact: {
    top: -10,
    right: -10,
    width: 108,
    height: 108,
  },
  glowTwo: {
    position: 'absolute',
    top: 78,
    left: -28,
    width: 92,
    height: 92,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.whiteOverlay,
  },
  glowTwoCompact: {
    top: 68,
    left: -20,
    width: 76,
    height: 76,
  },
});
