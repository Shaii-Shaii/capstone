import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View, ImageBackground, useWindowDimensions } from 'react-native';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { theme } from '../../design-system/theme';
import { AppIcon } from './AppIcon';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export const DashboardFeatureCard = ({
  title,
  description,
  badgeText,
  meta,
  ctaLabel,
  imageUrl,
  icon,
  variant = 'donor',
  width,
  index = 0,
  scrollX,
  railSpacing = theme.spacing.md,
  size = 'hero',
  onPress,
}) => {
  const [imageFailed, setImageFailed] = useState(false);
  const { height } = useWindowDimensions();
  const isShortScreen = height < theme.layout.shortScreenHeight;
  const scale = useSharedValue(1);

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
        { scale: interpolate(scrollX.value, inputRange, [0.96, 1, 0.96], Extrapolation.CLAMP) },
        { translateY: interpolate(scrollX.value, inputRange, [6, 0, 6], Extrapolation.CLAMP) },
      ],
      opacity: interpolate(scrollX.value, inputRange, [0.88, 1, 0.88], Extrapolation.CLAMP),
    };
  });

  const handlePress = async () => {
    if (!onPress) return;
    await Haptics.selectionAsync();
    onPress();
  };

  const overlayColors = variant === 'patient'
    ? ['rgba(8,8,8,0.12)', 'rgba(8,8,8,0.78)']
    : ['rgba(151,49,58,0.12)', 'rgba(8,8,8,0.82)'];

  const content = (
    <LinearGradient colors={overlayColors} style={[styles.overlay, isShortScreen ? styles.overlayCompact : null]}>
      <View style={styles.topRow}>
        {badgeText ? (
          <View style={styles.badge}>
            {icon ? <AppIcon name={icon} size="sm" state="inverse" /> : null}
            <Text style={styles.badgeText}>{badgeText}</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.bottomBlock}>
        <Text style={[styles.title, isShortScreen ? styles.titleCompact : null]}>{title}</Text>
        <Text style={[styles.description, isShortScreen ? styles.descriptionCompact : null]}>{description}</Text>
        <View style={styles.footerRow}>
          {meta ? <Text style={styles.meta}>{meta}</Text> : <View />}
          {ctaLabel ? (
            <View style={styles.ctaWrap}>
              <Text style={styles.ctaText}>{ctaLabel}</Text>
              <AppIcon name="chevronRight" size="sm" state="inverse" />
            </View>
          ) : null}
        </View>
      </View>
    </LinearGradient>
  );

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={() => {
        scale.value = withSpring(0.985, theme.motion.spring);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, theme.motion.spring);
      }}
      style={[
        styles.wrapper,
        size === 'compact' ? styles.wrapperSmall : null,
        isShortScreen ? styles.wrapperCompact : null,
        { width },
        motionStyle,
        animatedStyle,
      ]}
    >
      {imageUrl && !imageFailed ? (
        <ImageBackground
          source={{ uri: imageUrl }}
          style={styles.imageBackground}
          imageStyle={[styles.image, size === 'compact' ? styles.imageCompact : null]}
          onError={() => setImageFailed(true)}
        >
          {content}
        </ImageBackground>
      ) : (
        <LinearGradient
          colors={variant === 'patient'
            ? [theme.colors.patientCardFrom, theme.colors.dashboardPatientTo]
            : [theme.colors.donorCardFrom, theme.colors.dashboardDonorTo]}
          style={[
            styles.imageBackground,
            size === 'compact' ? styles.imageBackgroundCompact : null,
            isShortScreen ? styles.imageBackgroundCompact : null,
          ]}
        >
          {content}
        </LinearGradient>
      )}
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    height: 164,
    borderRadius: 26,
    overflow: 'hidden',
    ...theme.shadows.hero,
  },
  wrapperSmall: {
    height: 140,
  },
  wrapperCompact: {
    height: 152,
    borderRadius: 24,
  },
  imageBackground: {
    flex: 1,
  },
  imageBackgroundCompact: {
    borderRadius: theme.radius.lg,
  },
  image: {
    borderRadius: 26,
  },
  imageCompact: {
    borderRadius: 24,
  },
  overlay: {
    flex: 1,
    justifyContent: 'space-between',
    padding: theme.spacing.sm,
  },
  overlayCompact: {
    padding: theme.spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    alignSelf: 'flex-start',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 4,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.whiteOverlay,
  },
  badgeText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textInverse,
    fontWeight: theme.typography.weights.semibold,
  },
  bottomBlock: {
    gap: theme.spacing.xs,
  },
  title: {
    fontFamily: theme.typography.fontFamilyDisplay,
    fontSize: theme.typography.compact.titleSm,
    color: theme.colors.textInverse,
  },
  titleCompact: {
    fontSize: theme.typography.compact.body,
  },
  description: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textHeroSoft,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
  },
  descriptionCompact: {
    fontSize: theme.typography.compact.caption,
    lineHeight: theme.typography.compact.caption * theme.typography.lineHeights.relaxed,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.sm,
  },
  meta: {
    flex: 1,
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textHeroMuted,
  },
  ctaWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  ctaText: {
    fontFamily: theme.typography.fontFamily,
    fontSize: theme.typography.compact.caption,
    color: theme.colors.textInverse,
    fontWeight: theme.typography.weights.semibold,
  },
});
