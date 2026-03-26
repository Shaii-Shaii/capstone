import React from 'react';
import { Pressable, Text, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation,
  FadeInDown,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { theme } from '../../design-system/theme';
import { AppCard } from './AppCard';
import { AppIcon } from './AppIcon';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const CARD_VARIANTS = {
  donor: {
    cardVariant: 'donorTint',
    titleColor: theme.colors.textPrimary,
    descriptionColor: theme.colors.textSecondary,
    badgeBackground: theme.colors.brandPrimaryMuted,
    badgeText: theme.colors.brandPrimary,
    accent: theme.colors.dashboardDonorSoft,
  },
  patient: {
    cardVariant: 'patientTint',
    titleColor: theme.colors.textPrimary,
    descriptionColor: theme.colors.textSecondary,
    badgeBackground: theme.colors.backgroundPrimary,
    badgeText: theme.colors.textSecondary,
    accent: theme.colors.dashboardPatientSoft,
  },
  neutral: {
    cardVariant: 'elevated',
    titleColor: theme.colors.textPrimary,
    descriptionColor: theme.colors.textSecondary,
    badgeBackground: theme.colors.surfaceSoft,
    badgeText: theme.colors.textSecondary,
    accent: theme.colors.accentSoft,
  },
  disabled: {
    cardVariant: 'outline',
    titleColor: theme.colors.textDisabled,
    descriptionColor: theme.colors.textMuted,
    badgeBackground: theme.colors.surfaceDisabled,
    badgeText: theme.colors.textDisabled,
    accent: theme.colors.surfaceDisabled,
  },
};

export const DashboardActionCard = ({
  title,
  description,
  badgeText,
  meta,
  icon,
  onPress,
  disabled = false,
  variant = 'neutral',
  delay = 0,
  style,
  compact = false,
  index = 0,
  scrollX,
  railSpacing = theme.spacing.md,
}) => {
  const { height } = useWindowDimensions();
  const isShortScreen = height < theme.layout.shortScreenHeight;
  const config = disabled ? CARD_VARIANTS.disabled : (CARD_VARIANTS[variant] || CARD_VARIANTS.neutral);
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const motionStyle = useAnimatedStyle(() => {
    const width = style?.width;
    if (!scrollX || typeof width !== 'number') {
      return {};
    }

    const interval = width + railSpacing;
    const inputRange = [(index - 1) * interval, index * interval, (index + 1) * interval];

    return {
      transform: [
        { scale: interpolate(scrollX.value, inputRange, [0.97, 1, 0.97], Extrapolation.CLAMP) },
      ],
      opacity: interpolate(scrollX.value, inputRange, [0.88, 1, 0.88], Extrapolation.CLAMP),
    };
  });

  const handlePress = async () => {
    if (disabled || !onPress) return;
    await Haptics.selectionAsync();
    onPress();
  };

  const isShortcut = compact;

  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(theme.motion.cardEnter).springify().damping(16)}
      style={[styles.wrapper, style]}
    >
      <AnimatedPressable
        onPress={handlePress}
        onPressIn={() => {
          if (!disabled) {
            scale.value = withSpring(0.986, theme.motion.spring);
          }
        }}
        onPressOut={() => {
          scale.value = withSpring(1, theme.motion.spring);
        }}
        disabled={disabled}
        style={[motionStyle, animatedStyle]}
      >
        <AppCard
          variant={config.cardVariant}
          padding={isShortcut ? 'xs' : isShortScreen ? 'sm' : 'md'}
          radius="xl"
          style={styles.card}
        >
          {isShortcut ? (
            <View style={styles.shortcutCard}>
              <View style={[styles.shortcutIconWrap, { backgroundColor: config.accent }]}>
                {icon ? (
                  <AppIcon
                    name={icon}
                    state={disabled ? 'disabled' : variant === 'patient' ? 'muted' : 'active'}
                  />
                ) : null}
                {badgeText ? (
                  <View style={[styles.shortcutBadge, { backgroundColor: config.badgeBackground }]}>
                    <Text style={[styles.shortcutBadgeText, { color: config.badgeText }]}>{badgeText}</Text>
                  </View>
                ) : null}
              </View>
              <Text numberOfLines={2} style={[styles.shortcutTitle, { color: config.titleColor }]}>
                {title}
              </Text>
              {meta ? <Text numberOfLines={1} style={styles.shortcutMeta}>{meta}</Text> : null}
            </View>
          ) : (
            <>
              <View style={[styles.accent, { backgroundColor: config.accent }]} />
              {icon ? (
                <View style={[styles.iconWrap, isShortScreen ? styles.iconWrapCompact : null]}>
                  <AppIcon name={icon} state={disabled ? 'disabled' : variant === 'patient' ? 'muted' : 'active'} />
                </View>
              ) : null}
              <View style={styles.header}>
                <Text style={[styles.title, isShortScreen ? styles.titleCompact : null, { color: config.titleColor }]}>
                  {title}
                </Text>
                {badgeText ? (
                  <View style={[styles.badge, { backgroundColor: config.badgeBackground }]}>
                    <Text style={[styles.badgeText, { color: config.badgeText }]}>{badgeText}</Text>
                  </View>
                ) : null}
              </View>
              <Text style={[styles.description, isShortScreen ? styles.descriptionCompact : null, { color: config.descriptionColor }]}>
                {description}
              </Text>
              {meta ? <Text style={[styles.meta, isShortScreen ? styles.metaCompact : null]}>{meta}</Text> : null}
            </>
          )}
        </AppCard>
      </AnimatedPressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
  },
  card: {
    position: 'relative',
  },
  accent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.whiteOverlay,
    marginBottom: theme.spacing.sm,
  },
  iconWrapCompact: {
    width: 34,
    height: 34,
    marginBottom: theme.spacing.xs,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.xs,
    gap: theme.spacing.sm,
  },
  title: {
    flex: 1,
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.bodyLg,
    lineHeight: theme.typography.compact.bodyLg * theme.typography.lineHeights.snug,
  },
  titleCompact: {
    fontSize: theme.typography.compact.body,
    lineHeight: theme.typography.compact.body * theme.typography.lineHeights.snug,
  },
  description: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
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
    marginTop: 2,
    fontSize: theme.typography.compact.caption,
  },
  badge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.radius.pill,
  },
  badgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.semantic.caption,
    fontWeight: theme.typography.weights.semibold,
  },
  shortcutCard: {
    minHeight: 90,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xs,
  },
  shortcutIconWrap: {
    position: 'relative',
    width: 48,
    height: 48,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutBadge: {
    position: 'absolute',
    top: -2,
    right: -6,
    minWidth: 16,
    height: 16,
    borderRadius: theme.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  shortcutBadgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: 9,
    fontWeight: theme.typography.weights.semibold,
  },
  shortcutTitle: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: 12,
    fontWeight: theme.typography.weights.semibold,
    lineHeight: 14,
  },
  shortcutMeta: {
    textAlign: 'center',
    fontFamily: theme.typography.fontFamily,
    fontSize: 10,
    color: theme.colors.textMuted,
  },
});
