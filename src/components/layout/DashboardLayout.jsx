import React from 'react';
import { View, StyleSheet, useWindowDimensions, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeIn, FadeInUp, FadeOut } from 'react-native-reanimated';
import { ScreenContainer } from '../ui/ScreenContainer';
import { DashboardTabBar } from '../ui/DashboardTabBar';
import { theme } from '../../design-system/theme';

export const DashboardLayout = ({
  children,
  header,
  footer,
  navItems = [],
  activeNavKey,
  onNavPress,
  navVariant = 'donor',
}) => {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const hasNav = navItems.length > 0;
  const isShortScreen = height < theme.layout.shortScreenHeight;
  const isCompactScreen = height < theme.layout.compactScreenHeight;
  const navVisualOffset = (
    isCompactScreen
      ? theme.layout.dashboardFloatingNavOffsetCompact
      : theme.layout.dashboardFloatingNavOffset
  ) + theme.layout.dashboardFloatingNavLift;
  const navBottomPadding = hasNav
    ? Math.max(
      insets.bottom + navVisualOffset + (isCompactScreen ? 12 : 16),
      isShortScreen ? 44 : 52
    )
    : (isShortScreen ? theme.spacing.sectionCompact : theme.spacing.sectionLg);

  return (
    <ScreenContainer
      variant="dashboard"
      scrollable={false}
      safeArea
      contentStyle={[
        styles.content,
        isShortScreen ? styles.contentCompact : null,
      ]}
    >
      <View style={[styles.shell, isShortScreen ? styles.shellCompact : null]}>
        <Animated.View
          entering={FadeInUp.duration(theme.motion.screenEnter)}
          style={[styles.headerContainer, isShortScreen ? styles.headerContainerCompact : null]}
        >
          {header}
        </Animated.View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[styles.scrollContent, { paddingBottom: navBottomPadding }]}
          bounces={false}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View
            entering={FadeIn.delay(30).duration(theme.motion.contentSwap)}
            exiting={FadeOut.duration(theme.motion.fast)}
            style={[
              styles.contentStage,
              isShortScreen ? styles.contentStageCompact : null,
            ]}
          >
            <View style={[styles.body, isShortScreen ? styles.bodyCompact : null]}>
              {children}
            </View>
            {footer ? (
              <View style={[styles.footerContainer, isShortScreen ? styles.footerContainerCompact : null]}>
                {footer}
              </View>
            ) : null}
          </Animated.View>
        </ScrollView>
      </View>

      {hasNav ? (
        <DashboardTabBar
          items={navItems}
          activeKey={activeNavKey}
          onPress={onNavPress}
          variant={navVariant}
        />
      ) : null}
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  content: {
    paddingTop: theme.spacing.xs,
  },
  contentCompact: {
    paddingTop: 0,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  shell: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  shellCompact: {
    gap: theme.spacing.xs,
  },
  headerContainer: {
    marginBottom: 0,
  },
  headerContainerCompact: {
    marginBottom: 0,
  },
  contentStage: {
    position: 'relative',
    gap: theme.spacing.xs,
  },
  contentStageCompact: {
    gap: theme.spacing.xs,
  },
  body: {
    gap: theme.spacing.md,
    minHeight: 0,
    paddingTop: theme.spacing.xs,
  },
  bodyCompact: {
    gap: theme.spacing.sm,
    paddingTop: 0,
  },
  footerContainer: {
    marginTop: theme.spacing.md,
    paddingBottom: theme.layout.dashboardShellBottomGap,
  },
  footerContainerCompact: {
    marginTop: theme.spacing.sm,
    paddingBottom: theme.layout.dashboardShellBottomGapCompact,
  },
});
