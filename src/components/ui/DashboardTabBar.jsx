import React from 'react';
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Animated, {
  interpolate,
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { AppIcon } from './AppIcon';
import { theme, resolveThemeRoles } from '../../design-system/theme';
import { useAuth } from '../../providers/AuthProvider';
import { donorDashboardNavItems } from '../../constants/dashboard';

export const DASHBOARD_TAB_BAR_HEIGHT = 64;

const BUBBLE_SIZE = 48;
const NOTCH_RADIUS = 34;
const PILL_RADIUS = 0;
const PILL_MARGIN = 0;
const ACTIVE_CENTER_Y = 4;
const INACTIVE_CENTER_Y = DASHBOARD_TAB_BAR_HEIGHT / 2;
const LIFT = -(INACTIVE_CENTER_Y - ACTIVE_CENTER_Y);
const ICON_WRAP_TOP = INACTIVE_CENTER_Y - BUBBLE_SIZE / 2;
const CURVE_KAPPA = 0.5522847498;

const SPRING_BUBBLE = { damping: 14, stiffness: 210, mass: 0.75 };
const SPRING_SLIDE = { damping: 22, stiffness: 260, mass: 0.8 };
const SPRING_PRESS = { damping: 18, stiffness: 300 };

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const AnimatedPath = Animated.createAnimatedComponent(Path);

function buildNotchedPillPath(width, height, notchCenterX = null) {
  'worklet';
  const safeWidth = Math.max(width, height);
  const cornerRadius = Math.min(PILL_RADIUS, height / 2, safeWidth / 2);
  const hasNotch = Number.isFinite(notchCenterX) && notchCenterX >= 0;
  const notchRadius = Math.min(NOTCH_RADIUS, Math.max(0, safeWidth / 2 - 4));
  const minCenterX = notchRadius + 4;
  const maxCenterX = safeWidth - notchRadius - 4;
  const centerX = hasNotch
    ? Math.min(Math.max(notchCenterX, minCenterX), maxCenterX)
    : null;
  const notchStartX = hasNotch ? centerX - notchRadius : null;
  const notchEndX = hasNotch ? centerX + notchRadius : null;
  const notchControl = notchRadius * CURVE_KAPPA;

  const path = [
    `M ${cornerRadius} 0`,
  ];

  if (hasNotch) {
    path.push(`L ${notchStartX} 0`);
    path.push(
      `C ${notchStartX} ${notchControl} ${centerX - notchControl} ${notchRadius} ${centerX} ${notchRadius}`
    );
    path.push(
      `C ${centerX + notchControl} ${notchRadius} ${notchEndX} ${notchControl} ${notchEndX} 0`
    );
  }

  path.push(
    `L ${safeWidth - cornerRadius} 0`,
    `Q ${safeWidth} 0 ${safeWidth} ${cornerRadius}`,
    `L ${safeWidth} ${height - cornerRadius}`,
    `Q ${safeWidth} ${height} ${safeWidth - cornerRadius} ${height}`,
    `L ${cornerRadius} ${height}`,
    `Q 0 ${height} 0 ${height - cornerRadius}`,
    `L 0 ${cornerRadius}`,
    `Q 0 0 ${cornerRadius} 0`,
    'Z'
  );

  return path.join(' ');
}

function DashboardTabItem({ item, isActive, onPress }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);

  const progress = useSharedValue(isActive ? 1 : 0);
  const pressScale = useSharedValue(1);

  React.useEffect(() => {
    progress.value = withSpring(isActive ? 1 : 0, SPRING_BUBBLE);
  }, [isActive, progress]);

  const iconWrapStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 1], [1, 0]),
    transform: [
      { scale: pressScale.value },
    ],
  }));

  const labelStyle = useAnimatedStyle(() => ({
    color: interpolateColor(
      progress.value,
      [0, 1],
      [roles.metaText, roles.navActiveBackground]
    ),
    fontWeight: isActive ? '700' : '500',
    opacity: interpolate(progress.value, [0, 1], [0.55, 1]),
  }));

  const handlePress = async () => {
    if (isActive) return;
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
        pressScale.value = withSpring(0.88, SPRING_PRESS);
      }}
      onPressOut={() => {
        pressScale.value = withSpring(1, SPRING_PRESS);
      }}
      style={styles.tabItem}
    >
      <Animated.View style={[styles.iconWrap, { top: ICON_WRAP_TOP }, iconWrapStyle]}>
        <AppIcon
          name={item.icon}
          state="default"
          color={roles.metaText}
          size="md"
        />
        {item.badge ? (
          <View
            style={[
              styles.badge,
              {
                backgroundColor: roles.primaryActionBackground,
                borderColor: roles.pageBackground,
              },
            ]}
          >
            <Text style={[styles.badgeText, { color: roles.primaryActionText }]}>
              {item.badge}
            </Text>
          </View>
        ) : null}
      </Animated.View>

      <Animated.Text numberOfLines={1} style={[styles.label, labelStyle]}>
        {item.label}
      </Animated.Text>
    </AnimatedPressable>
  );
}

function FloatingActiveBubble({ item, activeCenterX }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);

  const bubbleStyle = useAnimatedStyle(() => ({
    opacity: activeCenterX.value >= 0 ? 1 : 0,
    transform: [
      { translateX: activeCenterX.value - BUBBLE_SIZE / 2 },
      { translateY: LIFT },
    ],
  }));

  if (!item) return null;

  return (
    <Animated.View pointerEvents="none" style={[styles.floatingBubble, bubbleStyle]}>
      <View style={styles.bubbleBg} />
      <AppIcon
        name={item.activeIcon || item.icon}
        state="default"
        color={roles.navActiveBackground}
        size="md"
      />
      {item.badge ? (
        <View
          style={[
            styles.badge,
            {
              backgroundColor: roles.primaryActionBackground,
              borderColor: roles.pageBackground,
            },
          ]}
        >
          <Text style={[styles.badgeText, { color: roles.primaryActionText }]}>
            {item.badge}
          </Text>
        </View>
      ) : null}
    </Animated.View>
  );
}

function DashboardTabBarComponent({ items, activeKey, onPress, variant = 'donor' }) {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const pressLockRef = React.useRef(false);

  const displayItems = React.useMemo(() => {
    if (variant !== 'donor') return items;
    return donorDashboardNavItems.map((navItem) => ({
      ...navItem,
      badge: items.find((i) => i.key === navItem.key)?.badge,
    }));
  }, [items, variant]);

  const numTabs = displayItems.length;
  const pillWidth = Math.max(0, screenWidth - PILL_MARGIN * 2);
  const tabWidth = numTabs > 0 ? pillWidth / numTabs : 0;
  const activeIndex = displayItems.findIndex((item) => item.key === activeKey);
  const activeCenterX = activeIndex >= 0
    ? activeIndex * tabWidth + tabWidth / 2
    : null;
  const activeItem = activeIndex >= 0 ? displayItems[activeIndex] : null;
  const activeCenterXProgress = useSharedValue(activeCenterX ?? -1);
  const pillPathProps = useAnimatedProps(() => ({
    d: buildNotchedPillPath(pillWidth, DASHBOARD_TAB_BAR_HEIGHT, activeCenterXProgress.value),
  }), [pillWidth]);
  const bottomOffset = Math.max(insets.bottom, 0);

  React.useEffect(() => {
    activeCenterXProgress.value = withSpring(activeCenterX ?? -1, SPRING_SLIDE);
  }, [activeCenterX, activeCenterXProgress]);

  if (!numTabs) return null;

  return (
    <View style={[styles.wrapper, { bottom: bottomOffset }]} pointerEvents="box-none">
      <View style={styles.barShadow} pointerEvents="none" />
      <Svg
        width={pillWidth}
        height={DASHBOARD_TAB_BAR_HEIGHT}
        style={styles.pillShape}
        pointerEvents="none"
      >
        <AnimatedPath
          animatedProps={pillPathProps}
          d={buildNotchedPillPath(pillWidth, DASHBOARD_TAB_BAR_HEIGHT, activeCenterX ?? -1)}
          fill={theme.colors.backgroundPrimary}
          stroke={roles.navBorder}
          strokeWidth={1}
        />
      </Svg>

      <View style={styles.pillOverlay}>
        <FloatingActiveBubble item={activeItem} activeCenterX={activeCenterXProgress} />
        {displayItems.map((item) => (
          <DashboardTabItem
            key={item.key}
            item={item}
            isActive={item.key === activeKey}
            onPress={(pressedItem) => {
              if (pressLockRef.current) return;
              pressLockRef.current = true;
              onPress?.(pressedItem);
              setTimeout(() => {
                pressLockRef.current = false;
              }, 400);
            }}
          />
        ))}
      </View>
    </View>
  );
}

export const DashboardTabBar = React.memo(DashboardTabBarComponent);

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: PILL_MARGIN,
    right: PILL_MARGIN,
    zIndex: 30,
    height: DASHBOARD_TAB_BAR_HEIGHT,
    overflow: 'visible',
  },
  barShadow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 0,
    backgroundColor: 'transparent',
    shadowColor: '#18000a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    elevation: 14,
  },
  pillShape: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'visible',
  },
  pillOverlay: {
    flexDirection: 'row',
    height: DASHBOARD_TAB_BAR_HEIGHT,
    overflow: 'visible',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    height: DASHBOARD_TAB_BAR_HEIGHT,
    overflow: 'visible',
  },
  iconWrap: {
    position: 'absolute',
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  floatingBubble: {
    position: 'absolute',
    top: ICON_WRAP_TOP,
    left: 0,
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    zIndex: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bubbleBg: {
    position: 'absolute',
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    backgroundColor: theme.colors.backgroundPrimary,
    shadowColor: '#2a0508',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 13,
    elevation: 10,
  },
  label: {
    position: 'absolute',
    bottom: 9,
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    letterSpacing: 0,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
    minWidth: 14,
    height: 14,
    borderRadius: theme.radius.full,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  badgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 9,
    fontWeight: theme.typography.weights.bold,
  },
});
