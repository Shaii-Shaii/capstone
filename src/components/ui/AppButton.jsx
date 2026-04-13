import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { theme, resolveThemeRoles } from '../../design-system/theme';
import { useAuth } from '../../providers/AuthProvider';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const VARIANTS = {
  primary: {
    backgroundColor: theme.colors.actionPrimary,
    borderColor: theme.colors.actionPrimary,
    textColor: theme.colors.textOnBrand,
    shadow: theme.shadows.card,
    pressedBackgroundColor: theme.colors.actionPrimaryPressed,
  },
  secondary: {
    backgroundColor: theme.colors.backgroundPrimary,
    borderColor: theme.colors.borderStrong,
    textColor: theme.colors.textPrimary,
    shadow: theme.shadows.soft,
    pressedBackgroundColor: theme.colors.surfaceSoft,
  },
  outline: {
    backgroundColor: theme.colors.actionGhost,
    borderColor: theme.colors.borderStrong,
    textColor: theme.colors.textPrimary,
    shadow: theme.shadows.none,
    pressedBackgroundColor: theme.colors.surfaceSoft,
  },
  ghost: {
    backgroundColor: theme.colors.actionGhost,
    borderColor: theme.colors.transparent,
    textColor: theme.colors.actionTextLink,
    shadow: theme.shadows.none,
    pressedBackgroundColor: theme.colors.actionGhostPressed,
  },
  danger: {
    backgroundColor: theme.colors.actionDanger,
    borderColor: theme.colors.actionDanger,
    textColor: theme.colors.textOnBrand,
    shadow: theme.shadows.soft,
    pressedBackgroundColor: theme.colors.actionDangerPressed,
  },
};

const SIZES = {
  md: {
    minHeight: theme.buttons.heightMd,
    paddingVertical: theme.spacing.buttonPaddingY,
    paddingHorizontal: theme.spacing.buttonPaddingX,
    fontSize: theme.typography.semantic.body,
  },
  lg: {
    minHeight: theme.buttons.heightLg,
    paddingVertical: theme.spacing.buttonPaddingY,
    paddingHorizontal: theme.spacing.xxl,
    fontSize: theme.typography.semantic.bodyLg,
  },
};

export const AppButton = ({
  title,
  onPress,
  variant = 'primary',
  size = 'md',
  disabled = false,
  loading = false,
  fullWidth = true,
  leading,
  trailing,
  style,
  textStyle,
  enableHaptics,
  hapticStyle = Haptics.ImpactFeedbackStyle.Light,
  success = false,
  textColorOverride,
  backgroundColorOverride,
  borderColorOverride,
}) => {
  const { resolvedTheme } = useAuth();
  const roles = resolveThemeRoles(resolvedTheme);
  const palette = VARIANTS[variant] || VARIANTS.primary;
  const metrics = SIZES[size] || SIZES.md;
  const isInactive = disabled || loading;
  const shouldHaptics = enableHaptics ?? (variant === 'primary' || variant === 'danger');
  const scale = useSharedValue(1);
  const opacity = useSharedValue(isInactive ? 0.72 : 1);
  const contentOpacity = useSharedValue(loading ? 0.4 : 1);
  const glowOpacity = useSharedValue(success ? 1 : 0);
  const loadingScale = useSharedValue(loading ? 1 : 0.92);

  React.useEffect(() => {
    opacity.value = withTiming(isInactive ? 0.72 : 1, { duration: theme.motion.normal });
  }, [isInactive, opacity]);

  React.useEffect(() => {
    contentOpacity.value = withTiming(loading ? 0.4 : 1, { duration: theme.motion.normal });
    loadingScale.value = withTiming(loading ? 1 : 0.92, { duration: theme.motion.normal });
  }, [contentOpacity, loading, loadingScale]);

  React.useEffect(() => {
    if (!success) {
      glowOpacity.value = withTiming(0, { duration: theme.motion.normal });
      return;
    }

    glowOpacity.value = withSequence(
      withTiming(1, { duration: theme.motion.fast }),
      withTiming(0.35, { duration: theme.motion.normal })
    );
    scale.value = withSequence(
      withSpring(1.015, theme.motion.spring),
      withSpring(1, theme.motion.spring)
    );
  }, [glowOpacity, scale, success]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const loaderStyle = useAnimatedStyle(() => ({
    opacity: withTiming(loading ? 1 : 0, { duration: theme.motion.fast }),
    transform: [{ scale: loadingScale.value }],
  }));

  const handlePressIn = () => {
    if (!isInactive) {
      scale.value = withSpring(0.975, theme.motion.spring);
    }
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, theme.motion.spring);
  };

  const handlePress = async () => {
    if (isInactive) return;
    if (shouldHaptics) {
      await Haptics.impactAsync(hapticStyle);
    }
    await onPress?.();
  };

  const shellStyle = [
    styles.button,
    {
      minHeight: metrics.minHeight,
      paddingVertical: metrics.paddingVertical,
      paddingHorizontal: metrics.paddingHorizontal,
      width: fullWidth ? '100%' : undefined,
      backgroundColor: isInactive
        ? theme.colors.actionDisabled
        : (
          backgroundColorOverride
          || (
            variant === 'primary'
              ? roles.primaryActionBackground
              : variant === 'secondary'
                ? roles.secondaryActionBackground
                : variant === 'outline'
                  ? roles.pageBackground
                  : undefined
          )
          || palette.backgroundColor
        ),
      borderColor: isInactive
        ? theme.colors.borderDisabled
        : (
          borderColorOverride
          || (
            variant === 'primary'
              ? roles.primaryActionBackground
              : variant === 'secondary'
                ? roles.secondaryActionBorder
                : variant === 'outline'
                  ? roles.defaultCardBorder
                  : undefined
          )
          || palette.borderColor
        ),
    },
    palette.shadow,
    variant === 'ghost' ? styles.ghostButton : null,
    style,
  ];

  const contentNode = (
    <View style={styles.contentShell}>
      <Animated.View style={[styles.content, contentStyle]}>
        {leading ? <View style={styles.adornment}>{leading}</View> : null}
        <Text
          style={[
            styles.text,
            {
              color: isInactive
                ? theme.colors.textDisabled
                : (
                  textColorOverride
                  || (
                    variant === 'primary'
                      ? roles.primaryActionText
                      : variant === 'secondary' || variant === 'outline'
                        ? roles.secondaryActionText
                        : resolvedTheme?.primaryTextColor
                  )
                  || palette.textColor
                ),
              fontSize: metrics.fontSize,
            },
            textStyle,
          ]}
        >
          {title}
        </Text>
        {trailing ? <View style={styles.adornment}>{trailing}</View> : null}
      </Animated.View>

      <Animated.View pointerEvents="none" style={[styles.loaderWrap, styles.loaderOverlay, loaderStyle]}>
        <ActivityIndicator color={variant === 'secondary' || variant === 'outline' ? roles.secondaryActionText : roles.primaryActionText} />
      </Animated.View>
    </View>
  );

  return (
    <AnimatedPressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={isInactive}
      style={animatedStyle}
    >
      <View>
        <Animated.View pointerEvents="none" style={[styles.successGlow, glowStyle]} />
        <View style={shellStyle}>
          {contentNode}
        </View>
      </View>
    </AnimatedPressable>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  ghostButton: {
    borderWidth: 0,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  contentShell: {
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderWrap: {
    minHeight: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loaderOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  successGlow: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.surfacePressed,
  },
  adornment: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontFamily: theme.typography.fontFamily,
    fontWeight: theme.typography.weights.semibold,
    letterSpacing: 0.2,
  },
});
