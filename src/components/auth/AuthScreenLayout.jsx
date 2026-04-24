import React from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { ScreenContainer } from '../ui/ScreenContainer';
import { theme } from '../../design-system/theme';

export const AuthScreenLayout = ({ children, cardStyle }) => {
  const { height } = useWindowDimensions();
  const isShortScreen = height < theme.layout.shortScreenHeight;
  const isCompactScreen = height < theme.layout.compactScreenHeight;

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
  },
});
