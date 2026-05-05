import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { ScreenContainer } from '../ui/ScreenContainer';
import { resolveThemeRoles, theme } from '../../design-system/theme';

export const AuthScreenLayout = ({ children, cardStyle, resolvedTheme }) => {
  const { height } = useWindowDimensions();
  const isShortScreen = height < theme.layout.shortScreenHeight;
  const isCompactScreen = height < theme.layout.compactScreenHeight;
  const roles = resolveThemeRoles(resolvedTheme);

  return (
    <ScreenContainer
      scrollable={true}
      safeArea={true}
      variant="auth"
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
            {
              backgroundColor: roles.defaultCardBackground,
              borderColor: roles.defaultCardBorder,
            },
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
    justifyContent: 'center',
    paddingBottom: theme.spacing.section,
  },
  screenContentCompact: {
    flexGrow: 1,
    justifyContent: 'flex-start',
    paddingBottom: theme.spacing.section,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.md,
  },
  containerCompact: {
    justifyContent: 'flex-start',
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
  },
  containerDense: {
    paddingTop: theme.spacing.xs,
    paddingBottom: theme.spacing.sm,
  },
  shell: {
    width: '100%',
    alignSelf: 'center',
    maxWidth: 356,
    borderWidth: 1,
    borderRadius: 28,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.xl,
    paddingBottom: theme.spacing.xl,
    shadowColor: theme.colors.shadow,
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 6,
  },
});
