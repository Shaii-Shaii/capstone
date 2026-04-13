import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeInUp,
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { AppIcon } from './AppIcon';
import { theme, resolveThemeRoles } from '../../design-system/theme';
import { useAuth } from '../../providers/AuthProvider';

export const DASHBOARD_TAB_BAR_HEIGHT = 72;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

function DashboardTabItem({ item, isActive, onPress }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const activePillTextColor = roles.navActiveText;
  const inactiveTextColor = roles.navInactiveText;
  const scale = useSharedValue(1);
  const progress = useSharedValue(isActive ? 1 : 0);

  React.useEffect(() => {
    progress.value = withTiming(isActive ? 1 : 0, { duration: theme.motion.nav });
  }, [isActive, progress]);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const labelTextStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      progress.value,
      [0, 1],
      [inactiveTextColor, activePillTextColor]
    ),
  }));

  const handlePress = async () => {
    await Haptics.selectionAsync();
    onPress?.(item);
  };

  return (
    <AnimatedPressable
      accessibilityRole="tab"
      accessibilityState={{ selected: isActive }}
      accessibilityLabel={item.accessibilityLabel || item.label}
      onPress={handlePress}
      onPressIn={() => {
        scale.value = withSpring(0.96, theme.motion.spring);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, theme.motion.spring);
      }}
      style={[styles.tabItem, containerStyle]}
    >
      <View style={styles.contentWrap}>
        <View style={styles.iconWrap}>
          <AppIcon
            name={isActive ? (item.activeIcon || item.icon) : item.icon}
            state="default"
            color={isActive ? activePillTextColor : inactiveTextColor}
            size="md"
          />
          {item.badge ? (
            <View style={[styles.badge, { backgroundColor: roles.primaryActionBackground, borderColor: roles.pageBackground }]}>
              <Text style={[styles.badgeText, { color: roles.primaryActionText }]}>{item.badge}</Text>
            </View>
          ) : null}
        </View>
        <Animated.Text numberOfLines={1} style={[styles.label, labelTextStyle]}>
          {item.label}
        </Animated.Text>
      </View>
    </AnimatedPressable>
  );
}

export function DashboardTabBar({ items, activeKey, onPress, variant = 'donor' }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const { width } = useWindowDimensions();
  const isCompact = width < 390;
  const horizontalInset = isCompact ? theme.spacing.md : theme.spacing.lg;
  const bottomOffset = Math.max(isCompact ? theme.spacing.xs : theme.spacing.sm, 8);
  const activeIndex = Math.max(items.findIndex((item) => item.key === activeKey), 0);
  const slotProgress = useSharedValue(activeIndex);
  const [surfaceWidth, setSurfaceWidth] = React.useState(0);
  const activePillColor = roles.navActiveBackground;

  React.useEffect(() => {
    slotProgress.value = withSpring(activeIndex, {
      ...theme.motion.spring,
      damping: 18,
      stiffness: 190,
    });
  }, [activeIndex, slotProgress]);

  const pillStyle = useAnimatedStyle(() => {
    if (!surfaceWidth || !items.length) {
      return { opacity: 0 };
    }

    const innerWidth = surfaceWidth - theme.spacing.xs * 2;
    const slotWidth = innerWidth / items.length;
    const pillWidth = Math.max(48, slotWidth - theme.spacing.sm);

    return {
      opacity: 1,
      width: pillWidth,
      transform: [
        {
          translateX: theme.spacing.xs + slotProgress.value * slotWidth + (slotWidth - pillWidth) / 2,
        },
      ],
    };
  });

  return (
    <Animated.View
      entering={FadeInUp.duration(theme.motion.screenEnter)}
      style={[
        styles.container,
        {
          left: horizontalInset,
          right: horizontalInset,
          bottom: bottomOffset,
        },
      ]}
    >
      <View
        style={[
          styles.surface,
          {
            maxWidth: theme.layout.dashboardNavMaxWidth,
            backgroundColor: roles.navSurface,
            borderColor: roles.navBorder,
          },
        ]}
        onLayout={(event) => setSurfaceWidth(event.nativeEvent.layout.width)}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.activePill,
            { backgroundColor: activePillColor },
            pillStyle,
          ]}
        />
        {items.map((item) => (
          <DashboardTabItem
            key={item.key}
            item={item}
            isActive={item.key === activeKey}
            onPress={onPress}
          />
        ))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: 20,
    alignItems: 'center',
  },
  surface: {
    minHeight: DASHBOARD_TAB_BAR_HEIGHT,
    width: '100%',
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.xs,
    paddingVertical: 6,
    borderRadius: 28,
    borderWidth: 1,
    ...theme.shadows.hero,
  },
  activePill: {
    position: 'absolute',
    left: 0,
    top: theme.spacing.xs,
    bottom: theme.spacing.xs,
    borderRadius: theme.radius.pill,
  },
  tabItem: {
    flex: 1,
    minWidth: 0,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.pill,
  },
  contentWrap: {
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: theme.spacing.xs,
    zIndex: 2,
  },
  iconWrap: {
    position: 'relative',
    width: 24,
    height: 24,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    fontWeight: theme.typography.weights.semibold,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -6,
    minWidth: 14,
    height: 14,
    borderRadius: theme.radius.full,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  badgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 9,
    fontWeight: theme.typography.weights.bold,
  },
});
