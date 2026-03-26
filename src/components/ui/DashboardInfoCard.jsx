import React from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { AppCard } from './AppCard';
import { AppIcon } from './AppIcon';
import { theme } from '../../design-system/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const DashboardInfoCard = ({
  title,
  description,
  meta,
  icon,
  badgeText,
  variant = 'default',
  width,
  index = 0,
  scrollX,
  railSpacing = theme.spacing.md,
  onPress,
}) => {
  const { height } = useWindowDimensions();
  const isShortScreen = height < theme.layout.shortScreenHeight;
  const scale = useSharedValue(1);
  const tintVariant = variant === 'patient' ? 'patientTint' : variant === 'donor' ? 'donorTint' : 'elevated';
  const iconState = variant === 'patient' ? 'muted' : 'active';

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const motionStyle = useAnimatedStyle(() => {
    if (!scrollX || typeof width !== 'number') {
      return {};
    }

    const interval = width + railSpacing;
    const inputRange = [(index - 1) * interval, index * interval, (index + 1) * interval];

    return {
      transform: [
        { scale: interpolate(scrollX.value, inputRange, [0.97, 1, 0.97], Extrapolation.CLAMP) },
        { translateY: interpolate(scrollX.value, inputRange, [5, 0, 5], Extrapolation.CLAMP) },
      ],
      opacity: interpolate(scrollX.value, inputRange, [0.9, 1, 0.9], Extrapolation.CLAMP),
    };
  });

  const handlePress = async () => {
    if (!onPress) return;
    await Haptics.selectionAsync();
    onPress();
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={() => {
        scale.value = withSpring(0.986, theme.motion.spring);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, theme.motion.spring);
      }}
      style={[{ width }, motionStyle, animatedStyle]}
    >
      <AppCard variant={tintVariant} radius="xl" padding="xs">
        <View style={styles.topRow}>
          <View style={[styles.iconWrap, isShortScreen ? styles.iconWrapCompact : null]}>
            {icon ? <AppIcon name={icon} state={iconState} /> : <AppIcon name="empty" state="muted" />}
          </View>
          {badgeText ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{badgeText}</Text>
            </View>
          ) : null}
        </View>
        <Text style={[styles.title, isShortScreen ? styles.titleCompact : null]}>{title}</Text>
        <Text style={[styles.description, isShortScreen ? styles.descriptionCompact : null]}>{description}</Text>
        {meta ? <Text style={[styles.meta, isShortScreen ? styles.metaCompact : null]}>{meta}</Text> : null}
      </AppCard>
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.xs,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.whiteOverlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapCompact: {
    width: 28,
    height: 28,
  },
  badge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfaceSoft,
  },
  badgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.weights.semibold,
  },
  title: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyLg,
    color: theme.colors.textPrimary,
    marginBottom: 2,
  },
  titleCompact: {
    fontSize: theme.typography.compact.body,
  },
  description: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
  },
  descriptionCompact: {
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
  },
  meta: {
    marginTop: theme.spacing.xs,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textMuted,
  },
  metaCompact: {
    marginTop: theme.spacing.xs,
    fontSize: theme.typography.compact.caption,
  },
});
