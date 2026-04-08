import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { ScreenContainer } from '../ui/ScreenContainer';
import { AppCard } from '../ui/AppCard';
import { theme } from '../../design-system/theme';

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
      <View
        style={[
          styles.container,
          isShortScreen ? styles.containerCompact : null,
          isCompactScreen ? styles.containerDense : null,
        ]}
      >
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
      </View>
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
});
