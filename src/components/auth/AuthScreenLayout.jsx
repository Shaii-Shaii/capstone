import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { ScreenContainer } from '../ui/ScreenContainer';
import { theme } from '../../design-system/theme';

export const AuthScreenLayout = ({ children, cardStyle, role = 'donor', resolvedTheme = null }) => {
  const { height } = useWindowDimensions();
  const isShortScreen = height < theme.layout.shortScreenHeight;
  const isCompactScreen = height < theme.layout.compactScreenHeight;
  const heroColors =
    resolvedTheme
      ? [resolvedTheme.primaryColor || theme.colors.heroFrom, resolvedTheme.secondaryColor || theme.colors.heroTo]
      : role === 'patient'
        ? [theme.colors.dashboardPatientFrom, theme.colors.dashboardPatientTo]
        : [theme.colors.heroFrom, theme.colors.heroTo];

  return (
    <ScreenContainer
      scrollable={true}
      safeArea={true}
      variant="auth"
      heroColors={heroColors}
      authHeroImageUri={resolvedTheme?.loginBackgroundPhoto || ''}
      contentStyle={isCompactScreen ? styles.screenContentCompact : styles.screenContent}
    >
      <View
        style={[
          styles.container,
          isShortScreen ? styles.containerCompact : null,
          isCompactScreen ? styles.containerDense : null,
        ]}
      >
        <View
          style={[
            styles.shell,
            cardStyle,
          ]}
        >
          {children}
        </View>
      </View>
    </ScreenContainer>
  );
};

export const authLayoutStyles = StyleSheet.create({
  formSection: {
    marginTop: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
});

const styles = StyleSheet.create({
  screenContent: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingBottom: theme.spacing.section,
  },
  screenContentCompact: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingBottom: theme.spacing.xl,
  },
  container: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.sm,
  },
  containerCompact: {
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
  },
  containerDense: {
    paddingTop: theme.spacing.xs,
    paddingBottom: 0,
  },
  shell: {
    width: '100%',
    alignSelf: 'center',
    maxWidth: 372,
  },
});
